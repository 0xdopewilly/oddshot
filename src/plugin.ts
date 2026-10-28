import { AsyncLocalStorage } from "node:async_hooks";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { atomicAmount, proposeSolana, solanaOutputSchema } from "./paybox.js";

const PROTOCOL_VERSION = "2026-07-28";
// Keyless Jupiter by default. Set JUP_API_HOST=api.jup.ag plus a brokered x-api-key header for a dedicated quota.
const JUP = `https://${process.env.JUP_API_HOST || "lite-api.jup.ag"}`;
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL = "So11111111111111111111111111111111111111112";
const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const QUOTE_MINTS = new Set([USDC, SOL, USDT]);
/** The stablecoins every order and wallet read prices at $1 by name, with no lookup. */
const STABLES: Record<string, string> = { [USDC]: "USDC", [USDT]: "USDT" };
// Majors Oddshot trades beyond memecoins, pinned by mint so lookalikes (there are "cbBTC" clones) never pass as the real thing.
const MAJORS: Record<string, { symbol: string; decimals: number }> = {
  [SOL]: { symbol: "SOL", decimals: 9 },
  cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij: { symbol: "BTC", decimals: 8 },
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": { symbol: "ETH", decimals: 8 },
};
const SKIP_TAGS = new Set(["sports", "games", "esports", "weather", "crypto-prices", "up-or-down"]);
const STOP = new Set(("will the who what which when how does did before after than more less between with from this that " +
  "win wins winner election price yes no january february march april may june july august september october november " +
  "december jan feb mar apr jun jul aug sep sept oct nov dec next new announce announced reach hit above below end politics world tech business economy finance crypto " +
  "culture science geopolitics elections mentions featured trending recurring global main big breaking other launch opening " +
  "weekend box office trailer views week million billion say says during rally first second third round top most least " +
  "his her their its get gets any all record day days year years today tomorrow live president presidential nomination " +
  "party senate house government minister prime rate rates interest meeting military map deal movies movie film films " +
  "music tv awards season episode series show chart album song video").split(" "));

// ---------- Schemas ----------

const address = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Use a Solana base58 address.");
const num = z.number().nullable();
const verdictSchema = z.enum(["GREEN", "YELLOW", "RED"]);
const tokenSchema = z.object({
  mint: z.string(), symbol: z.string(), name: z.string(), priceUsd: num,
  change1hPct: num, change6hPct: num, change24hPct: num, volume24hUsd: num, liquidityUsd: num,
  marketCapUsd: num, buys1h: z.number(), sells1h: z.number(), ageHours: num, url: z.string(),
});
const venueSchema = z.enum(["Polymarket", "Kalshi"]);
const moverSchema = z.object({
  venue: venueSchema, event: z.string(), question: z.string(), outcome: z.string(), probabilityPct: z.number(),
  changePts: z.number(), direction: z.enum(["up", "down"]), volume24hUsd: z.number(), url: z.string(),
  narrativeKeywords: z.array(z.string()),
});
const otherMarketSchema = z.object({ venue: venueSchema, question: z.string(), probabilityPct: z.number(), changePts: z.number(), url: z.string() });
const safetyShape = {
  verdict: verdictSchema, reasons: z.array(z.string()), sources: z.array(z.string()),
  rugcheckScore: num, lpLockedPct: num,
};
const roleSchema = z.enum(["OG", "CONTENDER", "COPYCAT", "SOLO"]);
const clusterSchema = z.object({ size: z.number(), launched24h: z.number(), copycats: z.number(), og: z.string().nullable() });
const scoredSchema = tokenSchema.extend({ oddshotScore: z.number(), momentumScore: z.number(), role: roleSchema, ...safetyShape });
const timingSchema = z.enum(["EARLY", "RUNNING", "LATE", "FADING", "NO_MEME"]);
const playSchema = z.object({
  narrative: z.string(), mover: moverSchema, token: scoredSchema.nullable(), timing: timingSchema,
  storyHeat: z.enum(["heating", "cooling"]), playScore: z.number(), thesis: z.string(), cluster: clusterSchema,
  trending: z.boolean(), otherMarket: otherMarketSchema.nullable(),
});
const narrativeSchema = z.object({
  narrative: z.string(), signal: z.enum(["BOTH CROWDS", "ON-CHAIN ONLY"]), heat: z.number(), pools: z.number(),
  symbols: z.array(z.string()), volume1hUsd: z.number(), change1hPct: num,
  leader: tokenSchema.extend(safetyShape), crowd: moverSchema.nullable(),
});
const lagSchema = z.object({
  venue: venueSchema, question: z.string(), symbol: z.string(), jumpPts: z.number(), from: z.string(), to: z.string(),
  oddsBefore: z.number(), oddsAfter: z.number(), memeDuringPct: num, meme1hPct: num, meme6hPct: num, meme24hPct: num,
  verdict: z.enum(["MEMES FOLLOWED", "MEMES LED", "NO REACTION", "MEMES FADED"]), summary: z.string(),
});
const oddsReceiptSchema = z.object({ venue: venueSchema, question: z.string(), atCallPct: z.number(), nowPct: z.number(), changePts: z.number(), resolved: z.boolean() });
const receiptSchema = z.object({
  mint: z.string(), symbol: z.string(), calledAt: z.string(), priceAtCall: z.number(), priceNow: z.number(),
  changePct: z.number(), peakPct: z.number(), troughPct: z.number(), grade: z.enum(["HIT", "MISS", "FLAT"]),
  odds: oddsReceiptSchema.nullable(), summary: z.string(),
});
/** A coin the wallet holds; `amount` counts `inOrders`, the tokens waiting in its take-profit orders. */
const positionSchema = z.object({
  mint: z.string(), symbol: z.string(), name: z.string(), amount: z.number(), inOrders: z.number(), valueUsd: num, change24hPct: num, ...safetyShape,
});
/** What a coin's creator bought and sold in it (shares of supply), and what it holds now. Trade figures are null when its trades couldn't
 *  be read; `coverage` says what was read when it isn't the whole history. */
const creatorSchema = z.object({ wallet: z.string(), tradesRead: z.boolean(), boughtPct: num, launchPct: num, soldPct: num, heldPct: num,
  soldLastHourPct: num, wholeHistory: z.boolean(), coverage: z.string().nullable() });
const creatorSummary = (c: Creator | null) => c && { wallet: c.wallet, tradesRead: c.trades !== null,
  boughtPct: c.trades ? round(c.boughtPct, 2) : null, launchPct: round(c.launchPct, 2), soldPct: c.trades ? round(c.soldPct, 2) : null,
  heldPct: round(c.heldPct, 2), soldLastHourPct: c.trades ? round(c.recentSoldPct, 2) : null, wholeHistory: c.whole, coverage: c.note };
/** A rug autopsy's crash: the minute's prices, its biggest sell (none when no sell shows), the pool's liquidity around that sell and at an
 *  earlier sell (a pull shows as liquidity gone before the crash), and every sell in the minute. */
const crashShape = z.object({ at: z.string(), priceBefore: num, priceAfter: num, changePct: num,
  sell: z.object({ tx: z.string(), seller: z.string(), byCreator: z.boolean(), tokens: z.number(), usd: z.number(), supplyPct: num }).nullable(),
  liquidityBeforeUsd: num, liquidityAfterUsd: num, liquidityEarlierUsd: num, earlierAt: z.string().nullable(), minuteSellsUsd: z.number(), minuteSellers: z.number() });
/** A held coin under $0.50 that crashed (-80% in 24h) or whose pool is all but empty: reported, never silently dropped. */
const collapsedSchema = z.object({ mint: z.string(), symbol: z.string(), valueUsd: num, change24hPct: num, liquidityUsd: num });
/** An open order on Jupiter: the tokens still waiting in it, its target price, and how far that is from today's price. A "sell" is a
 *  take-profit (a coin for USDC or SOL); a "buy" spends USDC, USDT or SOL on a coin, and its prices are the coin's. */
const orderSchema = z.object({ order: z.string(), side: z.enum(["sell", "buy"]), mint: z.string(), symbol: z.string(), receive: z.string(), tokens: z.number(), filledPct: z.number(),
  targetPriceUsd: num, priceUsd: num, toTargetPct: num, receiveAmount: z.number(), createdAt: z.string(), expiresAt: z.string().nullable() });

const driverSchema = z.object({
  theme: z.string(), reads: z.enum(["risk-on", "risk-off"]), impact: z.number(),
  venue: venueSchema, question: z.string(), probabilityPct: z.number(), changePts: z.number(), volume24hUsd: z.number(), url: z.string(),
});
const majorSchema = z.object({
  symbol: z.string(), mint: z.string(), priceUsd: num, change24hPct: num, tilt: z.number(),
  call: z.enum(["ODDS LEAD", "PRICED IN", "SEATBELT", "NO PUSH"]), note: z.string(),
});
const modeSchema = z.enum(["RISK-ON", "RISK-OFF", "NEUTRAL"]);
const actionSchema = z.enum(["HOLD", "TRIM", "EXIT"]);
/** One position's call. `cancelOrders` are the coin's take-profit orders to cancel before the sell, since tokens waiting in them aren't in
 *  the wallet. */
const beltSchema = z.object({
  mint: z.string(), symbol: z.string(), valueUsd: num, verdict: verdictSchema, action: actionSchema,
  sellPercent: z.number(), sellAmount: z.string().nullable(), cancelOrders: z.array(z.string()), reasons: z.array(z.string()), story: otherMarketSchema.nullable(),
});

type Token = z.infer<typeof tokenSchema>;
type Mover = z.infer<typeof moverSchema>;
type Venue = z.infer<typeof venueSchema>;
type OtherMarket = z.infer<typeof otherMarketSchema>;
type Verdict = z.infer<typeof verdictSchema>;
type Scored = z.infer<typeof scoredSchema>;
type Timing = z.infer<typeof timingSchema>;
type Candidate = { t: Token; m: number };
type Role = z.infer<typeof roleSchema>;
type Position = z.infer<typeof positionSchema>;
type Driver = z.infer<typeof driverSchema>;
type Belt = z.infer<typeof beltSchema>;
type Order = z.infer<typeof orderSchema>;
type Cluster = z.infer<typeof clusterSchema>;
/** A story's token swarm: `all` relevant tokens (for cluster stats) and the liquid `cands` (pickable), by momentum. */
type Group = { cands: Candidate[]; all: Token[] };

// ---------- Helpers ----------

// PayBox gives a tool call about 10 s, about 4 s of which go to starting the plugin's sandbox (measured through its CLI on Oct 28, 2026:
// a call that does nothing takes 5.5–6.3 s end to end, calls ending by 10.6 s came back, calls running to 12.3 s were cut off). So a call
// has about 5 s of its own: every request in it ends by the call's deadline, and a request with no time left isn't made at all.
const CALL_MS = 5000;
const callEnd = new AsyncLocalStorage<number>();
/** Milliseconds left before this tool call's deadline (unbounded outside a call). */
const callLeft = () => { const end = callEnd.getStore(); return end === undefined ? Infinity : end - Date.now(); };

async function getJson(url: string, ms = 3500, body?: unknown): Promise<any> {
  const host = new URL(url).hostname;
  ms = Math.round(Math.min(ms, callLeft()));
  if (ms <= 0) throw new Error(`${host} took too long to answer. Try again in a few seconds.`);
  try {
    const res = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: { accept: "application/json", "user-agent": "Oddshot/1.0 (PayBox plugin)",
        ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(ms),
    });
    if (res.status === 429) throw new Error(`${host} is rate-limiting requests. Wait about 10 seconds and try again.`);
    if (!res.ok) {
      // A refusal often says why (Jupiter's orders: "Order size must be at least 5 USD"), and the why is what to pass on.
      const why = await res.json().then((b: any) => [b?.error, b?.message].find((x) => typeof x === "string") ?? "", () => "");
      throw new Error(`${host} answered HTTP ${res.status}${why ? `: ${String(why).slice(0, 200)}` : ""}`);
    }
    return await res.json();
  } catch (e) {
    // The bare "The operation was aborted due to timeout" names neither the source nor what to do.
    if (e instanceof Error && e.name === "TimeoutError") throw new Error(`${host} took too long to answer. Try again in a few seconds.`);
    throw e;
  }
}

const n = (v: unknown): number | null => {
  const x = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) ? x : null;
};
const round = (v: number | null, d = 2): number | null => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const usd = (v: number | null) => (v === null ? "?" : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(v < 10 ? 2 : 0)}`);
/** Significant digits without exponent notation: big prices and token amounts read as 84,321 or 5,000,000, not 8.43e+4,
 *  and a rugged coin's price as 0.000000200, not 2.00e-7. */
const px = (v: number, d = 4) => (Math.abs(v) >= 10 ** (d - 1) ? Math.round(v).toLocaleString("en-US")
  : v !== 0 && Math.abs(v) < 1e-6 ? v.toFixed(Math.min(100, d - 1 - Math.floor(Math.log10(Math.abs(v))))) : v.toPrecision(d));
/** `p`, or `fallback()` when `p` hasn't settled within `ms`: a slow extra check never costs a whole tool call, and the fallback can
 *  report whatever was read by then. */
const within = <T>(p: Promise<T>, ms: number, fallback: () => T): Promise<T> =>
  Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback()), ms).unref())]);
/** Hours and minutes of a UTC time, e.g. 10:11. */
const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16);
const pct = (v: number | null) => (v === null ? "?" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const list = (s: unknown): string[] => {
  try { const v = typeof s === "string" ? JSON.parse(s) : s; return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
};
const text = (t: string) => [{ type: "text" as const, text: t }];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A question's subject words (no stop words or bare numbers), to tell the same story from a merely related one. */
const subjectWords = (q: string) =>
  new Set(q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)));
/** How loud an odds move is: size of the swing, weighted by the money behind it. */
const heat = (m: Mover) => Math.abs(m.changePts) * Math.log10(m.volume24hUsd + 10);

/** Story subjects, best first: quoted titles (up to 5 words), then runs of capitalised words (up to 4), then short labels. */
function keywords(...texts: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const clean = (phrase: string, max = 4) => {
    const w = phrase.split(/\s+/).map((x) => x.replace(/^[^\p{L}\p{N}_$]+|[^\p{L}\p{N}_]+$/gu, "").replace(/['’]s$/i, "")).filter(Boolean);
    while (w.length && STOP.has(w[0]!.toLowerCase())) w.shift();
    while (w.length && STOP.has(w[w.length - 1]!.toLowerCase())) w.pop();
    return w.slice(0, max).join(" ");
  };
  const add = (k: string) => {
    if (k.length >= 3 && /^\p{Lu}/u.test(k) && !STOP.has(k.toLowerCase()) && !out.some((o) => o.toLowerCase() === k.toLowerCase())) out.push(k);
  };
  // Quoted titles stay whole ("You Can See Everything", not "You Can See").
  for (const t of texts) for (const q of t?.match(/["“][^"”]{3,60}["”]/g) ?? []) add(clean(q.slice(1, -1), 5));
  // Unicode classes, so "Vučić" stays whole instead of stopping at "Vu".
  for (const t of texts) {
    if (t && /^\p{L}[\p{L} .'-]{2,29}$/u.test(t)) add(clean(t));
    for (const run of t?.match(/(?<![\p{L}\p{N}_])\p{Lu}[\p{L}\p{N}_'’-]*(?:\s+\p{Lu}[\p{L}\p{N}_'’-]*)*/gu) ?? []) add(clean(run));
  }
  return out.slice(0, 4);
}

// ---------- Polymarket ----------

function bestMarket(e: any, window: "1h" | "24h", minVolume: number) {
  let best: { m: any; change: number; p: number } | null = null;
  for (const m of e.markets ?? []) {
    if (m.closed || m.active === false) continue;
    const change = n(window === "1h" ? m.oneHourPriceChange : m.oneDayPriceChange);
    const p = Number(list(m.outcomePrices)[0]);
    // A market parked near 0% or 100% is settled news, unless it just swung there (a ticker confirmed today is the story).
    if (change === null || change === 0 || !Number.isFinite(p) || ((p <= 0.01 || p >= 0.99) && Math.abs(change) < 0.05)) continue;
    if ((n(m.volume24hr) ?? 0) < minVolume) continue;
    if (!best || Math.abs(change) > Math.abs(best.change)) best = { m, change, p };
  }
  return best;
}

function toMover(e: any, b: { m: any; change: number; p: number }): Mover {
  return {
    venue: "Polymarket", event: String(e.title ?? ""), question: String(b.m.question ?? ""), outcome: list(b.m.outcomes)[0] ?? "Yes",
    probabilityPct: round(b.p * 100, 1)!, changePts: round(b.change * 100, 1)!, direction: b.change > 0 ? "up" : "down",
    volume24hUsd: Math.round(n(b.m.volume24hr) ?? 0), url: `https://polymarket.com/event/${e.slug ?? ""}`,
    narrativeKeywords: keywords(b.m.groupItemTitle, e.title, ...(e.tags ?? []).map((t: any) => String(t?.label ?? ""))),
  };
}

const MARKETS = "https://gamma-api.polymarket.com/markets?active=true&closed=false&order=volume24hr&ascending=false&include_tag=true";
const MEME_TAG_IDS = [1401, 596, 21]; // tech, pop-culture, crypto: where memecoin stories live

/** Top markets by 24h volume plus the top tech / pop-culture / crypto markets, best market per event. */
async function polymarketMovers(window: "1h" | "24h", minVolume: number, ms: number): Promise<Mover[]> {
  // Gamma serves at most 100 markets a request, so the top 400 by volume take four pages. One slow page only
  // thins the board; it fails only when every page does.
  const settled = await Promise.allSettled([
    ...[0, 100, 200, 300].map((offset) => getJson(`${MARKETS}&limit=100&offset=${offset}`, ms)),
    ...MEME_TAG_IDS.map((id) => getJson(`${MARKETS}&limit=100&tag_id=${id}`, ms)),
  ]);
  const pages = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  if (!pages.length) throw (settled[0] as PromiseRejectedResult).reason;
  const byEvent = new Map<string, { e: any; b: { m: any; change: number; p: number } }>();
  for (const m of pages.flatMap((p) => (Array.isArray(p) ? p : []))) {
    const e = { title: m.question, slug: m.slug, ...(m.events?.[0] ?? {}), tags: m.tags ?? [] };
    if (e.tags.some((t: any) => SKIP_TAGS.has(String(t?.slug ?? "").toLowerCase())) || /up or down|price on|tweets/i.test(e.title ?? "")
      || LADDER.test(m.question ?? "") || BRACKET.test(m.question ?? "") || MENTION.test(m.question ?? "")) continue;
    const b = bestMarket({ markets: [m] }, window, minVolume);
    if (!b) continue;
    const prev = byEvent.get(e.slug);
    if (!prev || Math.abs(b.change) > Math.abs(prev.b.change)) byEvent.set(e.slug, { e, b });
  }
  const minMove = window === "1h" ? 0.01 : 0.02;
  return [...byEvent.values()].filter(({ b }) => Math.abs(b.change) >= minMove).map(({ e, b }) => toMover(e, b));
}

/** Biggest odds swings across Polymarket and, on the 24h window, Kalshi (it publishes 24h changes only). Kalshi being down never blocks the board. */
async function fetchMovers(window: "1h" | "24h", limit: number, minVolume: number, ms = 4000): Promise<Mover[]> {
  const [poly, kalshi] = await Promise.all([
    polymarketMovers(window, minVolume, ms),
    window === "24h" ? kalshiBoard(minVolume, ms).catch(() => [] as Mover[]) : [],
  ]);
  return [...poly, ...kalshi].sort((a, b) => Math.abs(b.changePts) - Math.abs(a.changePts)).slice(0, limit);
}

const sign = (v: number) => `${v > 0 ? "+" : ""}${v}`;
const moverLine = (m: Mover) =>
  `${m.direction === "up" ? "▲" : "▼"} ${sign(m.changePts)} pts → ${m.probabilityPct}% "${m.question}" (${m.venue} · ${usd(m.volume24hUsd)} 24h vol)`;

// ---------- Focus: one sector instead of the whole market ----------

/** Words and phrases that put a story, a market or a token in a sector. They match whole words, so "ai" is not found inside "airdrop". */
const SECTORS: Record<string, string[]> = {
  // Stock-themed coins and company markets; tokenized shares themselves are securities and never surfaced (SECURITY).
  stocks: ["stock", "stocks", "stonk", "stonks", "wsb", "nasdaq", "ipo", "earnings", "companies", "tesla", "tsla", "nvidia", "nvda",
    "apple", "aapl", "microsoft", "msft", "amazon", "amzn", "google", "googl", "alphabet", "meta", "netflix", "nflx", "amd", "intel", "coinbase", "microstrategy",
    "mstr", "gamestop", "gme", "robinhood", "palantir", "pltr", "spacex"],
  ai: ["ai", "agi", "asi", "artificial intelligence", "superintelligence", "super intelligence", "gpt", "chatgpt", "openai", "claude", "anthropic", "grok", "xai",
    "gemini", "deepseek", "llama", "ai agent", "ai agents", "robot", "robots", "kimi", "sora"],
  politics: ["politics", "political", "trump", "maga", "biden", "harris", "vance", "election", "elections", "president", "presidential", "congress", "senate",
    "democrat", "democrats", "republican", "republicans", "governor", "mayor", "parliament", "minister", "putin", "zelensky", "tariff", "tariffs", "shutdown"],
  sports: ["sports", "nba", "nfl", "nhl", "mlb", "ufc", "fifa", "soccer", "football", "messi", "ronaldo", "mbappe", "lebron", "olympics", "tennis", "boxing", "f1"],
  gaming: ["gaming", "games", "gta", "gta6", "rockstar", "nintendo", "xbox", "playstation", "ps5", "ps6", "steam", "minecraft", "fortnite", "roblox", "esports", "pokemon"],
  crypto: ["crypto", "bitcoin", "btc", "ethereum", "eth", "solana", "etf", "binance", "bnb", "saylor", "xrp", "ripple", "doge", "stablecoin", "stablecoins"],
  celebrities: ["celebrities", "celebrity", "pop culture", "kanye", "taylor swift", "drake", "mrbeast", "kardashian", "elon", "musk", "rihanna", "beyonce", "bieber", "diddy"],
};
const SECTOR_ALIASES: Record<string, string> = { stock: "stocks", stonks: "stocks", xstocks: "stocks", "artificial intelligence": "ai", election: "politics",
  elections: "politics", sport: "sports", games: "gaming", game: "gaming", celebs: "celebrities", celebrity: "celebrities", "pop culture": "celebrities" };
/** Lowercase letters and digits in any script with accents folded, everything else one space: "Beyoncé" reads as "beyonce". */
const norm = (s: string) => s.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** A sector preset matches on any of its words; a free keyword needs every one of its words ("Taylor Swift", not just "swift"). */
type Focus = { label: string; words: string[]; every: boolean };
/** A focus as a sector preset ("tokenized stocks" reads as stocks, "US election" as politics) or as a free keyword such as "Tesla". */
function focusOf(focus: string): Focus {
  const g = norm(focus);
  const has = (k: string) => ` ${g} `.includes(` ${k} `);
  const alias = Object.keys(SECTOR_ALIASES).find(has);
  const preset = Object.hasOwn(SECTORS, g) ? g : Object.keys(SECTORS).find(has) ?? (alias ? SECTOR_ALIASES[alias] : undefined);
  if (preset) return { label: preset, words: SECTORS[preset]!, every: false };
  const all = g.split(" ").filter((w) => w.length >= 2);
  if (!all.length) throw new Error(`focus needs a word to match, or one of the sectors: ${Object.keys(SECTORS).join(", ")}.`);
  // Stop words go unless nothing else is left: "tech" or "president" on its own is still the keyword.
  const words = all.filter((w) => !STOP.has(w));
  return { label: `"${focus.trim()}"`, words: words.length ? words : all, every: true };
}
const inFocus = (f: Focus, ...texts: (string | null | undefined)[]) => {
  const hay = ` ${norm(texts.filter(Boolean).join(" "))} `;
  const hit = (w: string) => hay.includes(` ${norm(w)} `);
  return f.every ? f.words.every(hit) : f.words.some(hit);
};
const FOCUS = z.string().trim().min(2).max(40).optional()
  .describe("Track one sector: stocks (stock-themed coins and company markets; tokenized shares are securities and never surfaced), ai, politics, sports, gaming, crypto or celebrities, or any keyword such as \"Tesla\".");

// ---------- Kalshi ----------

// Kalshi's site search finds and sorts series by 24h price change; its trade API has 24h volume and hourly history. Both are keyless.
const KALSHI = "https://api.elections.kalshi.com";
const KALSHI_CATEGORIES = ["Politics", "Entertainment", "Science and Technology", "Companies", "Financials", "Crypto", "World", "Social", "AI"];
const KALSHI_SKIP = new Set(["Sports", "Mentions", "Climate and Weather", "Commodities"]);
const KALSHI_NOISE = new Set(["Recurring", "Market Share", "KPIs", "Company metrics"]);
// Strike ladders ("Above 450,000", "exceed 20", "32500000000 Streams") are bets on a number, not on a story.
const LADDER = /\b(above|below|exceeds?|exactly|between|or more|or fewer|or less|at least)\b|[<>≥≤]|\d{5,}|\d,\d{3}/i;
// Bracket outcomes ("turnout 66-70%", "win by less than 10%", "200+ posts") are bets on a number too, and they jump to 100% when the count lands.
const BRACKET = /\d\s*[-–]\s*\d+(\.\d+)?%|\b(less|more|fewer) than\b|\d\+|\b\d+\s*[-–]\s*\d+\s*(seats?|votes?|bps|basis points|points?|delegates|mandates)\b/i;
/** Word-mention markets ("Will Trump say 'Two Percent' at the rally?") count words, not events: no story forms around them. */
const MENTION = /\b(say|says|said|mention|mentions|tweet|tweets)\b/i;
const kalshiUrl = (series: unknown) => `https://kalshi.com/markets/${String(series ?? "").toLowerCase()}`;
/** A Kalshi market's question; outcomes of one event often share a title, so the outcome is added when the title lacks it. */
function kalshiQuestion(m: any): string {
  const title = String(m?.title ?? ""), outcome = String(m?.yes_sub_title ?? m?.yes_subtitle ?? "").trim();
  return outcome && !title.toLowerCase().includes(outcome.toLowerCase()) ? `${title} (${outcome})` : title;
}

/** Open, story-shaped Kalshi markets from one site-search query, each with its series (sports, recurring and ladder markets skipped). */
async function kalshiSeries(params: string, ms: number): Promise<{ s: any; m: any }[]> {
  const r = await getJson(`${KALSHI}/v1/search/series?${params}`, ms);
  return (r?.current_page ?? [])
    .filter((s: any) => !KALSHI_SKIP.has(String(s?.category)) && !(s?.tags ?? []).some((t: unknown) => KALSHI_NOISE.has(String(t)))
      && !/hour|daily|weekly|monthly|min/i.test(String(s?.product_metadata?.series_frequency ?? "")))
    .flatMap((s: any) => (s.markets ?? []).filter((m: any) => m?.ticker && !m.result && !LADDER.test(kalshiQuestion(m))).map((m: any) => ({ s, m })));
}

/** Kalshi markets that moved at least minMove in 24h, re-priced from the trade API (which also has the 24h volume), best market per event. */
async function kalshiMovers(found: { s: any; m: any }[], minVolume: number, minMove: number, ms: number): Promise<Mover[]> {
  // Moves in points rounded to 0.1, so one cent counts as 1 pt (0.08 - 0.07 is 0.00999… in floating point).
  const pts = (p: number, prev: number) => Math.round((p - prev) * 1000) / 10;
  const delta = (m: any) => Math.abs(pts(n(m.last_price_dollars) ?? 0, n(m.previous_price_dollars) ?? n(m.last_price_dollars) ?? 0));
  const seen = new Set<string>();
  const top = found.filter(({ m }) => delta(m) >= minMove * 100 && !seen.has(m.ticker) && seen.add(m.ticker))
    .sort((a, b) => delta(b.m) - delta(a.m)).slice(0, 200);
  const pages = await Promise.all(Array.from({ length: Math.ceil(top.length / 100) }, (_, i) =>
    getJson(`${KALSHI}/trade-api/v2/markets?limit=100&tickers=${top.slice(i * 100, i * 100 + 100).map((x) => x.m.ticker).join(",")}`, ms).catch(() => null)));
  const live = new Map<string, any>(pages.flatMap((p) => p?.markets ?? []).map((m: any) => [String(m?.ticker), m]));
  const best = new Map<string, Mover>();
  for (const { s, m } of top) {
    const v = live.get(m.ticker);
    const p = n(v?.last_price_dollars), prev = n(v?.previous_price_dollars);
    // Kalshi counts volume in $1 contracts, which its own site shows as dollars.
    const volume = n(v?.volume_24h_fp) ?? 0;
    if (v?.status !== "active" || p === null || prev === null || ((p <= 0.01 || p >= 0.99) && Math.abs(pts(p, prev)) < 5)
      || volume < minVolume || Math.abs(pts(p, prev)) < minMove * 100) continue;
    const key = String(s.event_ticker ?? m.ticker);
    const change = pts(p, prev);
    if (Math.abs(change) <= Math.abs(best.get(key)?.changePts ?? 0)) continue;
    best.set(key, {
      venue: "Kalshi", event: String(s.event_title ?? ""), question: kalshiQuestion(v), outcome: "Yes",
      probabilityPct: round(p * 100, 1)!, changePts: change, direction: change > 0 ? "up" : "down",
      volume24hUsd: Math.round(volume), url: kalshiUrl(s.series_ticker),
      // As on Polymarket, keywords come from the outcome and the event; Kalshi's tags are too broad ("Local", "Food").
      narrativeKeywords: keywords(m.yes_subtitle, s.event_title, s.event_subtitle),
    });
  }
  return [...best.values()];
}

/** The biggest 24h Kalshi moves across story categories. */
async function kalshiBoard(minVolume: number, ms: number): Promise<Mover[]> {
  const found = await Promise.all(KALSHI_CATEGORIES.map((c) =>
    kalshiSeries(`order_by=price-delta&page_size=20&category=${encodeURIComponent(c)}`, ms).catch(() => [])));
  return kalshiMovers(found.flat(), minVolume, 0.02, ms);
}

/** Kalshi markets whose question or event names the phrase as whole words and moved in the last 24h, loudest first. */
async function kalshiSearch(phrase: string, minVolume = 1000, ms = 3000): Promise<Mover[]> {
  const re = new RegExp(`\\b${esc(phrase)}\\b`, "i");
  const found = (await kalshiSeries(`query=${encodeURIComponent(phrase)}&order_by=querymatch&page_size=8`, ms))
    .filter(({ s, m }) => re.test(`${m.title ?? ""} ${s.event_title ?? ""}`));
  return (await kalshiMovers(found, minVolume, 0.01, ms)).sort((a, b) => heat(b) - heat(a));
}

// ---------- Market data: DexScreener, RugCheck, Jupiter ----------

/** Ticker without a leading "$" (some tokens put it in their symbol, which printed as "$$WIF"). */
const sym = (s: unknown) => String(s ?? "").replace(/^\$+/, "").trim() || "?";

function toToken(p: any): Token {
  const created = n(p.pairCreatedAt);
  return {
    mint: String(p.baseToken?.address ?? ""), symbol: sym(p.baseToken?.symbol), name: String(p.baseToken?.name ?? ""),
    priceUsd: n(p.priceUsd), change1hPct: n(p.priceChange?.h1), change6hPct: n(p.priceChange?.h6), change24hPct: n(p.priceChange?.h24),
    volume24hUsd: n(p.volume?.h24), liquidityUsd: n(p.liquidity?.usd), marketCapUsd: n(p.marketCap ?? p.fdv),
    buys1h: n(p.txns?.h1?.buys) ?? 0, sells1h: n(p.txns?.h1?.sells) ?? 0,
    ageHours: created === null ? null : round((Date.now() - created) / 3_600_000, 2), url: String(p.url ?? ""),
  };
}

function fromJupiter(j: any): Token {
  const s1 = j.stats1h ?? {};
  const s24 = j.stats24h ?? {};
  const created = Date.parse(j.firstPool?.createdAt ?? j.createdAt ?? "");
  const volume = (n(s24.buyVolume) ?? 0) + (n(s24.sellVolume) ?? 0);
  return {
    mint: String(j.id ?? ""), symbol: sym(j.symbol), name: String(j.name ?? ""), priceUsd: n(j.usdPrice),
    change1hPct: n(s1.priceChange), change6hPct: n(j.stats6h?.priceChange), change24hPct: n(s24.priceChange),
    volume24hUsd: volume || null, liquidityUsd: n(j.liquidity), marketCapUsd: n(j.mcap ?? j.fdv),
    buys1h: n(s1.numBuys) ?? 0, sells1h: n(s1.numSells) ?? 0,
    ageHours: Number.isFinite(created) ? round((Date.now() - created) / 3_600_000, 2) : null,
    url: `https://jup.ag/tokens/${j.id ?? ""}`,
  };
}

/** Deepest Solana pair per base token, skipping SOL/USDC/USDT as the base. */
function bestPairs(pairs: any[]): Token[] {
  const byMint = new Map<string, any>();
  for (const p of pairs ?? []) {
    const mint = p?.baseToken?.address;
    if (p?.chainId !== "solana" || !mint || QUOTE_MINTS.has(mint) || SECURITY.test(String(p?.baseToken?.name ?? ""))) continue;
    const prev = byMint.get(mint);
    if (!prev || (n(p.liquidity?.usd) ?? 0) > (n(prev.liquidity?.usd) ?? 0)) byMint.set(mint, p);
  }
  return [...byMint.values()].map(toToken);
}

async function tokenByMint(mint: string, ms = 3500): Promise<Token | null> {
  const pairs = await getJson(`https://api.dexscreener.com/token-pairs/v1/solana/${mint}`, ms).catch(() => null);
  return bestPairs(Array.isArray(pairs) ? pairs : []).find((t) => t.mint === mint) ?? null;
}

const rugcheck = (mint: string, ms = 3500) =>
  getJson(`https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`, ms).catch(() => null);

/** One retry, 3s later, when Jupiter's keyless quota (5 requests per 10s) refuses a quote or swap: research calls just before a buy can use it up. */
async function jupRetry<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (e) {
    // The retry waits 3 s, so it runs only when the call has time for the wait and the request.
    if (!(e instanceof Error && /rate-limiting/.test(e.message)) || callLeft() < 4000) throw e;
    await new Promise((r) => setTimeout(r, 3000));
    return call();
  }
}

/** Jupiter token records (price, decimals, audit, organic score) keyed by mint, in one request. */
async function jupTokens(mints: string[], ms = 3500): Promise<Map<string, any>> {
  if (!mints.length) return new Map();
  const found = await getJson(`${JUP}/tokens/v2/search?query=${mints.join(",")}`, ms).catch(() => null);
  return new Map((Array.isArray(found) ? found : []).map((t: any) => [String(t?.id), t]));
}

// ---------- Solana RPC: balances and mint decimals without touching Jupiter's rate limit ----------

const RPC = "https://api.mainnet-beta.solana.com";
const TOKEN_PROGRAMS = ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"];

async function rpc(method: string, params: unknown[], ms = 3500): Promise<any> {
  const r = await getJson(RPC, ms, { jsonrpc: "2.0", id: 1, method, params });
  if (r?.error) throw new Error(`Solana RPC: ${r.error.message ?? "error"}`);
  return r?.result;
}

type Holding = { raw: bigint; ui: number; decimals: number };

function addAccounts(into: Map<string, Holding>, accounts: any[]) {
  for (const a of accounts ?? []) {
    const info = a?.account?.data?.parsed?.info;
    const amt = info?.tokenAmount;
    if (!info?.mint || !/^\d+$/.test(String(amt?.amount))) continue;
    const prev = into.get(info.mint) ?? { raw: 0n, ui: 0, decimals: n(amt.decimals) ?? 0 };
    into.set(info.mint, { raw: prev.raw + BigInt(amt.amount), ui: prev.ui + (n(amt.uiAmount) ?? 0), decimals: prev.decimals });
  }
  return into;
}

/** SOL balance and every SPL / Token-2022 balance for a wallet, keyed by mint. */
// A wallet read gets 2.5 s on the public RPC before Jupiter steps in (2.5 s more): a tool call has about 5.5 s in all.
async function walletHoldings(owner: string, ms = 2500) {
  const opts = { encoding: "jsonParsed", commitment: "confirmed" };
  const viaRpc = Promise.all([
    rpc("getBalance", [owner, { commitment: "confirmed" }], ms),
    ...TOKEN_PROGRAMS.map((programId) => rpc("getTokenAccountsByOwner", [owner, { programId }, opts], ms)),
  ]).then(([lamports, ...programs]) => {
    const tokens = new Map<string, Holding>();
    for (const p of programs) addAccounts(tokens, p?.value);
    return { sol: (n(lamports?.value) ?? 0) / 1e9, tokens, rpc: true };
  });
  // `rpc` says which answered: when it was Jupiter, the RPC is struggling and further reads on it can be skipped.
  return orJupiter<{ sol: number; tokens: Map<string, Holding>; rpc: boolean }>(viaRpc, () => jupHoldings(owner).then((h) => ({ sol: h.sol, tokens: h.tokens, rpc: false })));
}

/** Jupiter's view of a wallet: SOL plus every token account, keyed by mint. */
async function jupHoldings(owner: string, ms = 2500) {
  const r = await getJson(`${JUP}/ultra/v1/holdings/${owner}`, ms);
  if (!/^\d+$/.test(String(r?.amount))) throw new Error(`${new URL(JUP).hostname} returned no holdings`);
  const tokens = new Map<string, Holding>();
  for (const [mint, accounts] of Object.entries<any[]>(r.tokens ?? {}))
    for (const a of accounts ?? []) {
      if (!/^\d+$/.test(String(a?.amount))) continue;
      const prev = tokens.get(mint) ?? { raw: 0n, ui: 0, decimals: n(a.decimals) ?? 0 };
      tokens.set(mint, { raw: prev.raw + BigInt(a.amount), ui: prev.ui + (n(a.uiAmount) ?? 0), decimals: prev.decimals });
    }
  return { sol: Number(r.amount) / 1e9, sols: BigInt(r.amount), tokens };
}

/** Every PayBox user shares the public RPC's rate limit, so a failed wallet read retries through Jupiter. Jupiter is the
 * fallback, not a race: its keyless quota (5 requests per 10s) is shared with quotes and swaps. Both failing reports the RPC's reason. */
const orJupiter = <T>(viaRpc: Promise<T>, viaJupiter: () => Promise<T>) => viaRpc.catch((e: unknown) => viaJupiter().catch(() => Promise.reject(e)));

/** A wallet's raw balance of one mint, with the mint's decimals when the wallet has an account for it (null otherwise). */
type MintHolding = { raw: bigint; decimals: number | null };
const holdingOf = (tokens: Map<string, Holding>, mint: string): MintHolding => { const h = tokens.get(mint); return { raw: h?.raw ?? 0n, decimals: h ? h.decimals : null }; };
/** A wallet's balance of one mint from the RPC alone, for reads that must not spend Jupiter's quota. */
const rpcHolding = (owner: string, mint: string, ms = 3000): Promise<MintHolding> =>
  rpc("getTokenAccountsByOwner", [owner, { mint }, { encoding: "jsonParsed", commitment: "confirmed" }], ms).then((r) => holdingOf(addAccounts(new Map(), r?.value), mint));
const rpcBalance = (owner: string, mint: string, ms = 3000) => rpcHolding(owner, mint, ms).then((h) => h.raw);

// `viaJupiter` lets one tool call share a single Jupiter wallet read across several balances.
type JupWallet = () => ReturnType<typeof jupHoldings>;
/** A balance read also carries the mint's decimals, so a sell needs no separate lookup for them when that one fails. */
async function mintHolding(owner: string, mint: string, ms = 3000, viaJupiter: JupWallet = () => jupHoldings(owner, ms)): Promise<MintHolding> {
  return orJupiter(rpcHolding(owner, mint, ms), () => viaJupiter().then((h) => holdingOf(h.tokens, mint)));
}
const mintBalance = (owner: string, mint: string, ms = 3000, viaJupiter?: JupWallet) => mintHolding(owner, mint, ms, viaJupiter).then((h) => h.raw);

/** Native SOL a wallet can sell, keeping 0.05 SOL for fees. */
const SOL_RESERVE = 0.05;
async function solLamports(owner: string, ms = 3000, viaJupiter: JupWallet = () => jupHoldings(owner, ms)): Promise<bigint> {
  return orJupiter(
    rpc("getBalance", [owner, { commitment: "confirmed" }], ms).then((r) => BigInt(Math.round(n(r?.value) ?? 0))),
    () => viaJupiter().then((h) => h.sols),
  );
}

async function solSpare(owner: string, ms = 3000, viaJupiter?: JupWallet): Promise<bigint> {
  const spare = (await solLamports(owner, ms, viaJupiter)) - BigInt(SOL_RESERVE * 1e9);
  return spare > 0n ? spare : 0n;
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const b58 = (s: string) => {
  let v = 0n;
  for (const c of s) v = v * 58n + BigInt(B58.indexOf(c));
  const out: number[] = [];
  for (; v > 0n; v >>= 8n) out.unshift(Number(v & 0xffn));
  for (const c of s) { if (c !== "1") break; out.unshift(0); }
  return Buffer.from(out);
};
/** Solana's compact length prefix: the value and the offset just past it. */
function shortvec(buf: Buffer, at: number): [number, number] {
  let v = 0;
  for (let i = 0; ; i++) { const b = buf[at + i]!; v |= (b & 0x7f) << (7 * i); if (!(b & 0x80)) return [v, at + i + 1]; }
}

/** Jupiter's swaps arrive with a block reference about 15s old (roughly 44s of life left), and PayBox simulates only after
 * the agent, the hosted runtime and its own checks, so proposals were expiring in simulation. The transaction is still
 * unsigned, so a fresh confirmed blockhash goes in its place; any problem keeps Jupiter's. */
async function freshBlockhash(txBase64: string): Promise<string> {
  const r = await rpc("getLatestBlockhash", [{ commitment: "confirmed" }], 2000).catch(() => null);
  const hash = r?.value?.blockhash;
  if (typeof hash !== "string") return txBase64;
  const buf = Buffer.from(txBase64, "base64");
  const [sigs, afterSigs] = shortvec(buf, 0);
  let at = afterSigs + 64 * sigs;
  if (buf[at]! & 0x80) at += 1; // versioned message prefix
  const [keys, afterKeys] = shortvec(buf, at + 3); // 3 header bytes, then the account keys
  at = afterKeys + 32 * keys;
  const fresh = b58(hash);
  if (fresh.length !== 32 || at + 32 > buf.length) return txBase64;
  fresh.copy(buf, at);
  return buf.toString("base64");
}

async function mintDecimals(mint: string): Promise<number | null> {
  const r = await rpc("getAccountInfo", [mint, { encoding: "jsonParsed" }], 2500).catch(() => null);
  // Jupiter's token list only when the RPC is unavailable, as with wallet reads.
  return n(r?.value?.data?.parsed?.info?.decimals) ?? (r ? null : n((await jupTokens([mint], 2500)).get(mint)?.decimals));
}

/** A MoonPay checkout for SOL or USDC on Solana with the dollar amount filled in. MoonPay only takes a wallet address on a URL signed
 *  with its secret key, which a plugin cannot hold, so the address is printed for the user to paste. */
const moonpayUrl = (asset: "sol" | "usdc_sol", usdAmount: number) =>
  `https://buy.moonpay.com/?currencyCode=${asset}&baseCurrencyCode=usd&baseCurrencyAmount=${usdAmount}&theme=dark`;
/** Dollars to spend on MoonPay to land `shortUsd`: its fees come out of the amount (about $4 at the $20 minimum, a few percent above it). */
const moonpayUsd = (shortUsd: number) => Math.max(20, Math.ceil(shortUsd * 1.05 + 5));
const moonpay = (asset: "sol" | "usdc_sol", wallet: string, shortUsd = 0, then = "Then run the buy again.") =>
  `Top up with MoonPay (${asset === "sol" ? "SOL" : "USDC"} on Solana; $20 minimum, about $4 of it fees): ${moonpayUrl(asset, moonpayUsd(shortUsd))} . When MoonPay asks where to send it, paste this PayBox address:\n${wallet}\n${then}`;
/** SOL a first buy paid in SOL needs beyond its amount: a wrapped-SOL account and the token's (about 0.002 SOL each), and network and priority fees. */
const SOL_BUY_EXTRA = 0.006;
/** SOL a buy paid in USDC needs: the token's account and the fees. */
const SOL_FOR_BUY = 0.003;

/** A Token-2022 transfer fee: basis points, whether an authority can change it, and its per-transfer cap in tokens. */
type Fee = { bps: number; mutable: boolean; maxTokens: number | null };
/** A mint's decimals and Token-2022 transfer fee (null without one), from one read; null when the mint can't be read. */
async function readMint(mint: string, ms = 2500): Promise<{ decimals: number | null; fee: Fee | null } | null> {
  const r = await rpc("getAccountInfo", [mint, { encoding: "jsonParsed" }], ms).catch(() => null);
  const info = r?.value?.data?.parsed?.info;
  if (!info) return null;
  const decimals = n(info.decimals);
  const cfg = (info.extensions ?? []).find((e: any) => e?.extension === "transferFeeConfig")?.state;
  if (!cfg) return { decimals, fee: null };
  // SetTransferFee schedules the new fee two epochs out and leaves the old one in olderTransferFee until the next change:
  // before that epoch the old fee applies (a pending raise still counts), from then on only the newer one does.
  const epoch = Math.floor((n(r?.context?.slot) ?? 0) / 432_000);
  const older = cfg.olderTransferFee ?? {}, newer = cfg.newerTransferFee ?? {};
  const fee = epoch >= (n(newer.epoch) ?? 0) || (n(newer.transferFeeBasisPoints) ?? 0) >= (n(older.transferFeeBasisPoints) ?? 0) ? newer : older;
  const cap = Number(fee.maximumFee);
  return { decimals, fee: { bps: n(fee.transferFeeBasisPoints) ?? 0, mutable: Boolean(cfg.transferFeeConfigAuthority),
    maxTokens: decimals !== null && Number.isFinite(cap) ? cap / 10 ** decimals : null } };
}

// ---------- On-chain heat and history: GeckoTerminal, Polymarket CLOB ----------

const GECKO = "https://api.geckoterminal.com/api/v2/networks/solana";
const NOISE = new Set([...STOP, "coin", "token", "the", "sol", "solana", "inu", "official", "meme", "wrapped", "usd", "usdc", "usdt",
  "wsol", "finance", "protocol", "dao", "fun", "pump", "cto", "community", "xstock",
  ..."you your me my mine our they them their its can could would should all one two just got buy sell hold moon money rich small little old good bad best real love life time world man men woman girl boy king queen lord god baby cute fat dumb smart crazy happy sad last only very much many some any every these those why yes not dont cant wont him her she his lol lmao wtf omg ser fren frens degen".split(" ")]);
// Tickers that belong to one mega-narrative, so DJT, MAGA and TRUMP count as one Trump story and TTWO as GTA.
const ALIAS: Record<string, string> = { djt: "trump", maga: "trump", donald: "trump", melania: "trump", barron: "trump",
  ttwo: "gta", gta6: "gta", gtavi: "gta", rockstar: "gta" };
const STORY_NAME: Record<string, string> = { trump: "Trump", gta: "GTA VI" };
type Hot = { t: Token; quote: string; vol1h: number };

function fromGecko(a: any, base: any): Token {
  const created = Date.parse(a?.pool_created_at ?? "");
  return {
    mint: String(base?.address ?? ""), symbol: sym(base?.symbol), name: String(base?.name ?? ""),
    priceUsd: n(a?.base_token_price_usd), change1hPct: n(a?.price_change_percentage?.h1), change6hPct: n(a?.price_change_percentage?.h6),
    change24hPct: n(a?.price_change_percentage?.h24), volume24hUsd: n(a?.volume_usd?.h24), liquidityUsd: n(a?.reserve_in_usd),
    marketCapUsd: n(a?.market_cap_usd ?? a?.fdv_usd), buys1h: n(a?.transactions?.h1?.buys) ?? 0, sells1h: n(a?.transactions?.h1?.sells) ?? 0,
    ageHours: Number.isFinite(created) ? round((Date.now() - created) / 3_600_000, 2) : null,
    url: `https://www.geckoterminal.com/solana/pools/${a?.address ?? ""}`,
  };
}

/** Trending Solana pools (deepest pool per token), with the quote token kept: the pairing often names the narrative. */
/** Tokenized shares ("SpaceX - Backpack Securities", xStocks) are securities, not memes, and restricted in the US: never surfaced. */
const SECURITY = /\b(securities|xstocks?|tokenized)\b/i;

async function geckoTrending(duration: "5m" | "1h" | "6h" | "24h", pages: number, ms = 3500): Promise<Hot[]> {
  const res = await Promise.all(Array.from({ length: pages }, (_, i) =>
    getJson(`${GECKO}/trending_pools?include=base_token,quote_token&duration=${duration}&page=${i + 1}`, ms).catch(() => null)));
  // Every page failing is GeckoTerminal's rate limit (about 30 calls a minute), not a quiet market.
  if (res.every((r) => r === null)) throw new Error("GeckoTerminal is rate-limiting trending data. Wait about a minute and try again.");
  const byMint = new Map<string, Hot>();
  for (const r of res) {
    const inc = new Map<string, any>((r?.included ?? []).map((x: any) => [String(x?.id), x?.attributes] as [string, any]));
    for (const p of r?.data ?? []) {
      const base = inc.get(String(p?.relationships?.base_token?.data?.id));
      const quote = inc.get(String(p?.relationships?.quote_token?.data?.id));
      if (!base?.address || QUOTE_MINTS.has(base.address) || SECURITY.test(String(base.name ?? ""))) continue;
      const hot = { t: fromGecko(p.attributes, base), quote: String(quote?.symbol ?? ""), vol1h: n(p?.attributes?.volume_usd?.h1) ?? 0 };
      const prev = byMint.get(hot.t.mint);
      if (!prev || hot.vol1h > prev.vol1h) byMint.set(hot.t.mint, hot);
    }
  }
  return [...byMint.values()];
}

const narrativeWords = (h: Hot) => {
  const ws = `${h.t.symbol} ${h.t.name}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !NOISE.has(w));
  const q = h.quote.toLowerCase();
  if (q.length >= 3 && !NOISE.has(q)) ws.push(q);
  return [...new Set(ws.map((w) => ALIAS[w] ?? w))];
};

/** Best active Polymarket market whose question actually names the word. */
async function crowdFor(word: string, ms = 3000): Promise<Mover | null> {
  const r = await getJson(`https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(word)}&limit_per_type=6&events_status=active`, ms).catch(() => null);
  // Whole word, so $ORE does not match "Orebro SK" or $RUSH "rushing yards"; sports games are never a meme's story.
  const re = new RegExp(`\\b${word.split(" ")[0]!.replace(/[^a-z0-9]/gi, "")}\\b`, "i");
  return (r?.events ?? [])
    .filter((e: any) => !(e.tags ?? []).some((t: any) => SKIP_TAGS.has(String(t?.slug ?? "").toLowerCase())))
    .flatMap((e: any) => {
      const named = { ...e, markets: (e.markets ?? []).filter((m: any) =>
        re.test(`${m.question ?? ""} ${e.title ?? ""}`) && !LADDER.test(m.question ?? "") && !BRACKET.test(m.question ?? "")) };
      const b = bestMarket(named, "24h", 1000);
      return b ? [toMover(e, b)] : [];
    })
    .sort((a: Mover, b: Mover) => heat(b) - heat(a))[0] ?? null;
}

/** The louder prediction-market crowd on a word: Polymarket's or Kalshi's. */
async function crowdAnywhere(word: string, ms = 3000): Promise<Mover | null> {
  const [poly, kalshi] = await Promise.all([crowdFor(word, ms), kalshiSearch(word, 1000, ms).then((k) => k[0] ?? null).catch(() => null)]);
  return poly && kalshi ? (heat(kalshi) > heat(poly) ? kalshi : poly) : poly ?? kalshi;
}

/** The same story on the other venue, if its odds moved 3+ pts in 24h: from the board when it's already there, otherwise one search. */
async function otherMarket(mover: Mover, words: string[], board: Mover[], ms = 2500): Promise<OtherMarket | null> {
  // Naming the story is not enough ("OpenAI" is in a Millennium Prize market and an agent-launch market):
  // the two questions must also share at least two subject words.
  const own = subjectWords(mover.question);
  const names = (m: Mover) => words.some((w) => new RegExp(`\\b${esc(w)}\\b`, "i").test(`${m.question} ${m.event}`))
    && [...subjectWords(m.question)].filter((w) => own.has(w)).length >= 2;
  const other = board.find((m) => m.venue !== mover.venue && Math.abs(m.changePts) >= 3 && names(m))
    ?? (await (mover.venue === "Polymarket" ? kalshiSearch(words[0]!, 1000, ms).then((k) => k[0] ?? null) : crowdFor(words[0]!, ms)).catch(() => null));
  if (!other || Math.abs(other.changePts) < 3 || !names(other)) return null;
  return { venue: other.venue, question: other.question, probabilityPct: other.probabilityPct, changePts: other.changePts, url: other.url };
}

/** The token's Solana pools on DexScreener, deepest first. */
async function pairsByMint(mint: string, ms = 3500): Promise<any[]> {
  const pairs = await getJson(`https://api.dexscreener.com/token-pairs/v1/solana/${mint}`, ms).catch(() => null);
  return (Array.isArray(pairs) ? pairs : [])
    .filter((p: any) => p?.chainId === "solana" && p?.baseToken?.address === mint && p?.pairAddress)
    .sort((a: any, b: any) => (n(b?.liquidity?.usd) ?? 0) - (n(a?.liquidity?.usd) ?? 0));
}

/** The prediction markets behind a coin, loudest first: Polymarket and Kalshi searched by its name and ticker. */
async function catalystsFor(token: { name: string; symbol: string }, ms = 4000): Promise<Mover[]> {
  const clean = token.name.replace(/\b(the|coin|token|inu|official|sol|ai|on|of)\b/gi, " ").replace(/\s+/g, " ").trim();
  const queries = [...new Set([clean, token.symbol].filter((q) => q.length >= 3).map((q) => q.toLowerCase()))].slice(0, 2);
  // When no search answered at all, that is a story unread, not a story absent.
  let failed = 0;
  const [results, kalshi] = await Promise.all([
    Promise.all(queries.map((q) =>
      getJson(`https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(q)}&limit_per_type=6&events_status=active`, ms).catch(() => (failed++, null)))),
    Promise.all(queries.map((q) => kalshiSearch(q, 100, ms).catch(() => (failed++, [] as Mover[])))),
  ]);
  if (queries.length && failed === 2 * queries.length) throw new Error("Polymarket and Kalshi couldn't be read right now. Try again in a few seconds.");
  // Polymarket's search is fuzzy ("ant" finds golf and football), so an event must name the query as a whole word.
  const seen = new Set<string>();
  return [
    ...results.flatMap((r, i) => (r?.events ?? []).filter((e: any) =>
      new RegExp(`\\b${esc(queries[i]!)}\\b`, "i").test(`${e?.title ?? ""} ${(e?.markets ?? []).map((m: any) => m?.question ?? "").join(" ")}`)))
      .filter((e: any) => e?.slug && !seen.has(e.slug) && seen.add(e.slug))
      .flatMap((e: any) => { const b = bestMarket(e, "24h", 100); return b ? [toMover(e, b)] : []; }),
    ...kalshi.flat().filter((m) => !seen.has(m.question) && seen.add(m.question)),
  ].sort((a, b) => heat(b) - heat(a)).slice(0, 5);
}

type Odds = { t: number; p: number };
/** A market matched to a story, with its hourly odds history for the first outcome, oldest first. */
type StoryMarket = { venue: Venue; question: string; closed: boolean; hits: number; history: (fromS: number, toS: number) => Promise<Odds[]> };
const venueInput = z.enum(["auto", "polymarket", "kalshi"]).default("auto")
  .describe("Which prediction market to read. auto uses Polymarket unless Kalshi's question names more of the story's words.");

const oldestFirst = (pts: { t: number | null; p: number | null }[]) =>
  pts.filter((x): x is Odds => Number.isFinite(x.t) && Number.isFinite(x.p)).sort((a, b) => a.t - b.t);

/** The Polymarket market (open or resolved) whose question best matches the story words. */
async function polymarketFor(story: string, hits: (q: string) => number, ms: number): Promise<StoryMarket | null> {
  const r = await getJson(`https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(story)}&limit_per_type=8&events_status=all`, ms);
  // Story words first, then an open market over a closed one (last year's "trailer by May 31?" outsold this year's), then volume.
  const fit = (m: any) => 2 * hits(String(m?.question ?? "")) + (m?.closed ? 0 : 1) + Math.log10((n(m?.volume) ?? 0) + 10) / 10;
  const m = (r?.events ?? []).flatMap((e: any) => e.markets ?? []).sort((a: any, b: any) => fit(b) - fit(a))[0];
  if (!m) return null;
  const tokenId = list(m.clobTokenIds)[0];
  return { venue: "Polymarket", question: String(m.question ?? ""), closed: Boolean(m.closed), hits: hits(String(m.question ?? "")),
    history: async (fromS, toS) => {
      if (!tokenId) return [];
      const h = await getJson(`https://clob.polymarket.com/prices-history?market=${tokenId}&startTs=${fromS}&endTs=${toS}&fidelity=60`, ms);
      return oldestFirst(h?.history ?? []);
    } };
}

/** The open Kalshi market whose question best matches the story words; hours without a trade use the bid/ask midpoint. */
async function kalshiFor(story: string, hits: (q: string) => number, ms: number): Promise<StoryMarket | null> {
  const fit = (x: { m: any }) => hits(String(x.m.title ?? "")) + Math.log10((n(x.m.volume) ?? 0) + 10) / 10;
  const best = (await kalshiSeries(`query=${encodeURIComponent(story)}&order_by=querymatch&page_size=8`, ms)).sort((a, b) => fit(b) - fit(a))[0];
  if (!best) return null;
  const { s, m } = best;
  return { venue: "Kalshi", question: kalshiQuestion(m), closed: false, hits: hits(String(m.title ?? "")),
    history: async (fromS, toS) => {
      const r = await getJson(`${KALSHI}/trade-api/v2/series/${s.series_ticker}/markets/${m.ticker}/candlesticks?start_ts=${fromS}&end_ts=${toS}&period_interval=60`, ms);
      return oldestFirst((r?.candlesticks ?? []).map((c: any) => {
        const bid = n(c?.yes_bid?.close_dollars), ask = n(c?.yes_ask?.close_dollars);
        return { t: n(c?.end_period_ts), p: n(c?.price?.close_dollars) ?? (bid !== null && ask !== null ? (bid + ask) / 2 : n(c?.price?.previous_dollars)) };
      }));
    } };
}

/** The prediction market behind a story. Polymarket stays the default; on auto, Kalshi wins only when its question names more of the story. */
async function findMarket(story: string, venue: "auto" | "polymarket" | "kalshi" = "auto", ms = 3500, ticker = ""): Promise<StoryMarket | null> {
  // Whole-word matches only, so "ANT" does not match "ANTH". The token's ticker scores too (it is not searched):
  // $ANT's market beats $ANTH's when both match "Anthropic ticker".
  const res = `${story} ${ticker}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !STOP.has(w)).map((w) => new RegExp(`\\b${w}\\b`, "i"));
  const hits = (q: string) => res.filter((re) => re.test(q)).length;
  const [poly, kalshi] = await Promise.all([
    venue === "kalshi" ? null : polymarketFor(story, hits, ms).catch((e: unknown) => (venue === "auto" ? e as Error : Promise.reject(e))),
    venue === "polymarket" ? null : kalshiFor(story, hits, ms).catch((e: unknown) => (venue === "auto" ? null : Promise.reject(e))),
  ]);
  // A slow Polymarket must not swap in a loosely related Kalshi market ("Stifel takes Anthropic public" for "Anthropic ticker"):
  // Kalshi stands in only when it names most of the story.
  if (poly instanceof Error) { if (kalshi && kalshi.hits >= Math.min(res.length, 3)) return kalshi; throw poly; }
  return poly && kalshi ? (kalshi.hits > poly.hits ? kalshi : poly) : poly ?? kalshi;
}

/** Hourly candles [t, open, high, low, close, volume] for a token in one pool, priced in the token itself, oldest first. */
async function candlesFor(pool: string, mint: string, limit = 1000, ms = 4500): Promise<number[][]> {
  const o = await getJson(`${GECKO}/pools/${pool}/ohlcv/hour?aggregate=1&limit=${limit}&currency=usd&token=${mint}`, ms);
  return ((o?.data?.attributes?.ohlcv_list ?? []) as unknown[][])
    .map((c) => c.map(Number)).filter((c) => c.length >= 5 && c.every(Number.isFinite)).sort((a, b) => a[0]! - b[0]!);
}

/** When no pool's history came back, a rate limit is the reason to show: it says when to retry. */
const rateLimit = (xs: unknown[]) => xs.find((x): x is Error => x instanceof Error && /rate-limiting/.test(x.message));

/** The first of a token's pools (deepest first) whose hourly history passes `ok`. Pools are fetched one at a time,
 * since every PayBox user shares GeckoTerminal's rate limit and the deepest pool almost always has the history. */
async function historyFor(pairs: any[], mint: string, ok: (candles: number[][]) => boolean, ms: number)
  : Promise<{ candles: number[][]; pair: any } | { candles: null; pair: null; error: Error | undefined }> {
  const tried: (number[][] | Error)[] = [];
  for (const pair of pairs) {
    const candles = await candlesFor(pair.pairAddress, mint, 1000, ms).catch((e: Error) => e);
    tried.push(candles);
    if (Array.isArray(candles) && ok(candles)) return { candles, pair };
    if (rateLimit([candles])) break; // the next pool would be refused too
  }
  return { candles: null, pair: null, error: rateLimit(tried) };
}

/** Price at a moment: interpolated inside its candle, or the last close carried across quiet hours (up to 6h). */
function priceAt(candles: number[][], ts: number): number | null {
  const k = candles.reduce((last, c, i) => (c[0]! <= ts ? i : last), -1);
  if (k < 0 || ts - candles[k]![0]! >= 6 * 3600) return null;
  const c = candles[k]!;
  return ts < c[0]! + 3600 ? c[1]! + (c[4]! - c[1]!) * ((ts - c[0]!) / 3600) : c[4]!;
}

/** Volatility-scaled exit plan from the last day of hourly ranges: stop at 3× the average hourly range (10–50%; majors 3–15%), targets at 2× and 4× the stop. */
function exitPlan(candles: number[][], entry: number | null, lo = 10, hi = 50) {
  const day = candles.slice(-24);
  if (!entry || day.length < 6) return null;
  const range = (day.reduce((a, c) => a + (c[2]! - c[3]!) / c[4]!, 0) / day.length) * 100;
  const stop = clamp(Math.round(3 * range), lo, hi);
  return { stop, tp1: 2 * stop, tp2: 4 * stop, stopPrice: entry * (1 - stop / 100), tp1Price: entry * (1 + (2 * stop) / 100), tp2Price: entry * (1 + (4 * stop) / 100) };
}

/** The market's odds at the call versus now. */
async function storyOdds(story: string, atS: number, venue: "auto" | "polymarket" | "kalshi", ticker?: string) {
  const market = await findMarket(story, venue, 3500, ticker);
  if (!market) return null;
  const pts = await market.history(atS - 7200, Math.floor(Date.now() / 1000));
  if (!pts.length) return null;
  const first = pts.reduce((best, x) => (Math.abs(x.t - atS) < Math.abs(best.t - atS) ? x : best), pts[0]!);
  const last = pts[pts.length - 1]!;
  return { venue: market.venue, question: market.question, atCallPct: round(first.p * 100, 1)!, nowPct: round(last.p * 100, 1)!,
    changePts: round((last.p - first.p) * 100, 1)!, resolved: market.closed };
}

function momentum(t: Token): number {
  const move = clamp(20 * Math.tanh((t.change1hPct ?? 0) / 25) + 20 * Math.tanh((t.change6hPct ?? 0) / 60), 0, 40);
  const activity = clamp((Math.log10((t.volume24hUsd ?? 0) + 1) - 3) * 7.5, 0, 30);
  const flow = t.buys1h + t.sells1h;
  const pressure = flow < 10 ? 0 : clamp(((t.buys1h / flow - 0.4) / 0.3) * 15, 0, 15);
  const depth = clamp((Math.log10((t.liquidityUsd ?? 0) + 1) - 4) * 7.5, 0, 15);
  return Math.round(move + activity + pressure + depth);
}

// ---------- The creator: what the wallet that launched a coin bought, sold and holds ----------

// Jupiter's data API keeps every trade a wallet made in a coin (undocumented, keyless). A wallet's first query in a heavily traded coin
// can take several seconds (9 s for one in JUP), later ones under one, so every read has a deadline. A page holds 30 trades whatever `limit` asks;
// `next` is the cursor to the page after (sent back as `offset`), and no `next` means the history ended. Its records start in mid-June
// 2024. GeckoTerminal's pool trades are the fallback: the pool's last 300 trades, within a day.
const DATAPI = "https://datapi.jup.ag/v1";
const DATAPI_FROM = Date.parse("2024-06-15T00:00:00Z");
type CreatorTrade = { side: "buy" | "sell"; tokens: number; usd: number; at: number; tx: string };
/** A coin's creator (Jupiter's `dev` wallet) and its trades in the coin, as shares of today's supply. `trades` is null when they couldn't
 *  be read, and `source` says where they came from: its whole record ("history") or one pool's recent trades ("pool"). `whole` means they
 *  reach back to launch with nothing missing; otherwise `note` says what was read. `launchPct` is what it bought in its first two minutes
 *  of trading, known only when that start is on record. `burnedPct` is launchpad supply burned since a 1B launch. */
type Creator = { wallet: string; heldPct: number | null; burnedPct: number; trades: CreatorTrade[] | null; source: "history" | "pool" | null;
  whole: boolean; note: string | null; boughtPct: number; soldPct: number; launchPct: number | null; atLaunch: boolean; launchUnread: boolean;
  recentSoldPct: number; recentSoldUsd: number; hourRead: boolean };
/** Pool trades for the creator fallback: GeckoTerminal rows, the pool, how far back they reach, and their size floor. */
type PoolRows = { rows: any[]; pool: string; since: number; minUsd: number };

/** The main pool of a coin: its graduated pool, else the deepest DexScreener pair, else its first pool when that isn't the bonding curve
 *  itself. A first pool can be long dead: $WIF's is a 2023 order-book market that GeckoTerminal doesn't track. */
const poolOf = (mint: string, j: any, pairAddress?: string | null): string | null =>
  (typeof j?.graduatedPool === "string" && j.graduatedPool) || pairAddress || (typeof j?.firstPool?.id === "string" && j.firstPool.id !== mint && j.firstPool.id) || null;

type DatapiPage = { txs: any[]; next: string | null };
const datapiPage = (mint: string, wallet: string, dir: "asc" | "desc", ms: number, offset?: string): Promise<DatapiPage | null> =>
  getJson(`${DATAPI}/txs/${mint}?traderAddress=${wallet}${dir === "asc" ? "&dir=asc" : ""}&limit=30${offset ? `&offset=${offset}` : ""}`, ms)
    .then((r) => (Array.isArray(r?.txs) ? { txs: r.txs as any[], next: r.next == null ? null : String(r.next) } : null));

/** GeckoTerminal trade rows as the coin's own trades: a pool can list the coin as its quote (stonkfun's LAUNCH / OC), and GeckoTerminal
 *  sides each trade by the base, so a sell is the coin going into the pool. */
const coinSide = (a: any, mint: string) =>
  a?.from_token_address === mint ? { sell: true, tokens: n(a.from_token_amount) ?? 0 } : a?.to_token_address === mint ? { sell: false, tokens: n(a.to_token_amount) ?? 0 } : null;
/** How far back a GeckoTerminal trade list reaches: its oldest row when it hit the 300-row cap, otherwise the whole day. */
const spanOf = (rows: any[]) => {
  const times = rows.map((a: any) => Date.parse(String(a?.block_timestamp))).filter(Number.isFinite);
  return rows.length >= 300 && times.length ? Math.min(...times) : Date.now() - 86_400_000;
};
/** A stretch of time up to now, in words: "12 minutes", "5 hours", "day". */
const stretchSince = (ms: number) => {
  const m = Math.max(1, Math.round((Date.now() - ms) / 60_000));
  return m >= 1380 ? "day" : m >= 90 ? `${Math.round(m / 60)} hours` : `${m} minutes`;
};

/** A coin Jupiter tags as an issuer's (a tokenized stock, a stablecoin, which Jupiter tags "stable"): an issuer's treasury isn't a launch
 *  bag, since it keeps most of the supply by design. Only Jupiter's own tags say so. A name is anyone's to pick, and a rug called
 *  "xStock" must not dodge the creator check. */
const issuerTagged = (j: any) => Array.isArray(j?.tags) && j.tags.some((t: unknown) => /^(rwa|xstocks|equities|stable|stablecoin)$/i.test(String(t)));

/** What a coin's creator bought, sold and holds. Never throws: null when there is no creator on record. Whatever is read by `deadline`
 *  counts, and what isn't is reported as unread (`trades: null`, or `hourRead: false` with a `note`), never as a clean history.
 *  `gecko` is the fallback when Jupiter's data API fails: GeckoTerminal's trades for `pool`, rows the caller already has, or none (a burst
 *  of fallbacks would spend GeckoTerminal's shared quota). `full` also pages the middle of a long history (rug_autopsy). `holding: false`
 *  skips the wallet read, when the caller's own RPC reads just failed. */
async function creatorOf(mint: string, j: any, pool: string | null,
  { ms = 3500, deadline = 4500, gecko = true, full = false, holding = true }: { ms?: number; deadline?: number; gecko?: boolean | (() => Promise<PoolRows | null>); full?: boolean; holding?: boolean } = {}): Promise<Creator | null> {
  const wallet = typeof j?.dev === "string" && j.dev ? j.dev : null;
  const supply = n(j?.totalSupply) ?? n(j?.circSupply);
  if (!wallet || !supply) return null;
  if (issuerTagged(j)) return null;
  const start = Date.now(), hour = start - 3_600_000;
  // Launchpad coins start at 1B, so a smaller supply means tokens were burned, and a creator that bought and burned hid nothing.
  // Any other coin's starting supply is unknown, and nothing is netted out.
  const burnedPct = j?.launchpad && supply < 1e9 ? ((1e9 - supply) / supply) * 100 : 0;
  const launched = Math.min(...[j?.firstPool?.createdAt, j?.createdAt].map((s) => Date.parse(String(s ?? ""))).filter(Number.isFinite));
  const time = (t: any) => Date.parse(String(t?.timestamp));
  const key = (t: any) => String(t?.actionId ?? `${t?.txHash}:${t?.type}:${t?.amount}`);
  // What has been read so far: the deadline reports exactly this.
  const st = { raw: undefined as bigint | null | undefined, first: undefined as DatapiPage | null | undefined, latest: undefined as DatapiPage | null | undefined,
    newest: [] as any[], middle: [] as any[], down: null as string | null, up: null as string | null, descFailed: false, pool: undefined as PoolRows | null | undefined };
  // The holding read runs on its own: the RPC alone (Jupiter's quota belongs to the quote and the swap), never holding up the pages.
  // It gets the whole deadline: the page timeout is for pages.
  const rawP = holding ? rpcBalance(wallet, mint, Math.max(ms, deadline - 100)).then((r) => { st.raw = r; }, () => { st.raw = null; }) : Promise.resolve().then(() => { st.raw = null; });
  const ascRows = () => [...(st.first?.txs ?? []), ...st.middle];
  const met = () => { const seen = new Set(st.newest.map(key)); return ascRows().some((t) => seen.has(key(t))); };
  // Sells already read in the last hour that make it RED whatever else turns up.
  const selling = () => {
    const s = st.newest.filter((t) => t?.type === "sell" && time(t) >= hour);
    return s.reduce((a, t) => a + (n(t?.amount) ?? 0), 0) / supply >= 0.01 || s.reduce((a, t) => a + (n(t?.usdVolume) ?? 0), 0) >= 500;
  };
  const fallback = async (): Promise<PoolRows | null> => {
    if (typeof gecko === "function") return gecko().catch(() => null);
    if (!gecko || !pool) return null;
    const rows = await getJson(`${GECKO}/pools/${pool}/trades?trade_volume_in_usd_greater_than=5`, ms)
      .then((r) => (r?.data ?? []).map((d: any) => d?.attributes).filter(Boolean) as any[]).catch(() => null);
    return rows && { rows, pool, since: spanOf(rows), minUsd: 5 };
  };
  const work = async () => {
    const page = (dir: "asc" | "desc") => datapiPage(mint, wallet, dir, ms).catch(() => null);
    // Each page counts the moment it arrives, so a deadline during a retry still reports it.
    const keep = (first: DatapiPage | null, latest: DatapiPage | null) => {
      if (first && !st.first) Object.assign(st, { first, up: first.next });
      if (latest && !st.latest) { Object.assign(st, { latest, down: latest.next }); st.newest.push(...latest.txs); }
    };
    const read = (dir: "asc" | "desc") => page(dir).then((p) => (dir === "asc" ? keep(p, null) : keep(null, p), p));
    // A creator trading hard right now (a bump bot, or a dump in pieces): newer pages until the last hour is covered, three at most,
    // stopping early once the sells read are a RED anyway. They follow the newest page at once, never waiting on a slow oldest page.
    const newer = async () => {
      for (let k = 0; st.down && st.newest.length && time(st.newest.at(-1)) >= hour && !selling() && k < 3; k++) {
        const page = await datapiPage(mint, wallet, "desc", ms, st.down).catch(() => null);
        if (!page) { st.descFailed = true; break; }
        st.newest.push(...page.txs);
        st.down = page.next;
      }
    };
    const latestOn = () => read("desc").then(async (p) => (p && (await newer()), p));
    let [first, latest] = await Promise.all([read("asc"), latestOn()]);
    // A page failing fast is a dropped connection rather than a slow API: one more try, unless the other page already holds the
    // whole history.
    const allIn = (first !== null && !first.next) || (latest !== null && !latest.next);
    if ((!first || !latest) && !allIn && Date.now() - start < Math.min(1500, deadline / 3)) [first, latest] = await Promise.all([first ?? read("asc"), latest ?? latestOn()]);
    if (!st.latest) st.descFailed = true;
    if (st.first || st.latest) {
      // The middle of a long history, oldest first, until it meets the newest pages.
      for (let k = 0; full && st.up && !met() && k < 8 && Date.now() - start < deadline - 1500; k++) {
        const page = await datapiPage(mint, wallet, "asc", ms, st.up).catch(() => null);
        if (!page) break;
        st.middle.push(...page.txs);
        st.up = page.next;
      }
    // The fallback runs with time left to use its answer, or at once when its rows are already in hand.
    } else if (typeof gecko === "function" || deadline - (Date.now() - start) >= 800) st.pool = await fallback();
    await rawP;
    return build(true);
  };
  const build = (done: boolean): Creator => {
    const heldPct = st.raw == null ? null : (Number(st.raw) / 10 ** (n(j?.decimals) ?? 0) / supply) * 100;
    const late = done ? "" : "; time ran out";
    // A launch inside Jupiter's records that wasn't read leaves the hidden-bag check undone, and says so.
    const launchMissed = Number.isFinite(launched) && launched >= DATAPI_FROM;
    const make = (trades: CreatorTrade[] | null, source: Creator["source"], o: { whole: boolean; launchRead: boolean; hourRead: boolean; note: string | null }): Creator => {
      const ts = (trades ?? []).sort((a, b) => a.at - b.at);
      const share = (xs: CreatorTrade[]) => (xs.reduce((a, t) => a + t.tokens, 0) / supply) * 100;
      const buys = ts.filter((t) => t.side === "buy"), sells = ts.filter((t) => t.side === "sell");
      const recent = sells.filter((t) => t.at >= hour), t0 = ts[0]?.at;
      return { wallet, heldPct, burnedPct, trades, source, whole: o.whole, note: o.note, boughtPct: share(buys), soldPct: share(sells),
        launchPct: o.launchRead && t0 !== undefined ? share(buys.filter((t) => t.at <= t0 + 120_000)) : null,
        atLaunch: t0 !== undefined && Number.isFinite(launched) && t0 - launched <= 300_000, launchUnread: trades !== null && !o.launchRead && launchMissed,
        recentSoldPct: share(recent), recentSoldUsd: recent.reduce((a, t) => a + t.usd, 0), hourRead: o.hourRead };
    };
    if (st.first || st.latest) {
      const seen = new Set(st.newest.map(key)), asc = ascRows(), older = asc.filter((t) => !seen.has(key(t)));
      // Every trade is in hand when either end ran out of pages, or the oldest and newest pages overlap.
      const all = (st.latest != null && !st.descFailed && !st.down) || (st.first != null && !st.up) || older.length < asc.length;
      const launchRead = (st.first != null || all) && Number.isFinite(launched) && launched >= DATAPI_FROM;
      const note = !all
        ? `${st.first ? `its first ${asc.length}` : "not its first"} and ${st.latest ? `latest ${st.newest.length}` : "not its latest"} trades only${late}`
        : Number.isFinite(launched) && launched < DATAPI_FROM ? "trades since June 2024 only" : null;
      return make([...older, ...st.newest].map((t: any) => ({ side: t?.type === "sell" ? "sell" as const : "buy" as const, tokens: n(t?.amount) ?? 0,
        usd: n(t?.usdVolume) ?? 0, at: time(t), tx: String(t?.txHash ?? "") })), "history",
        { whole: all && launchRead, launchRead, hourRead: all || (st.newest.length > 0 && time(st.newest.at(-1)) < hour), note });
    }
    if (st.pool) {
      const p = st.pool, once = new Set<string>();
      const trades = p.rows.flatMap((a: any) => {
        const side = coinSide(a, mint), id = `${a.tx_hash}:${a.from_token_amount}:${a.to_token_amount}`;
        if (!side || a.tx_from_address !== wallet || once.has(id)) return [];
        once.add(id);
        return [{ side: side.sell ? "sell" as const : "buy" as const, tokens: side.tokens, usd: n(a.volume_in_usd) ?? 0, at: Date.parse(String(a.block_timestamp)), tx: String(a.tx_hash ?? "") }];
      });
      // One pool's recent trades: a launch buy in another pool (the bonding curve) or before then isn't among them.
      return make(trades, "pool", { whole: false, launchRead: false, hourRead: p.since <= hour,
        note: `its trades over $${p.minUsd} in pool ${short(p.pool)} over the last ${stretchSince(p.since)} only` });
    }
    return make(null, null, { whole: false, launchRead: false, hourRead: false, note: done ? "its trades couldn't be read right now" : "its trades couldn't be read in time" });
  };
  return within(work().catch(() => build(false)), deadline, () => build(false));
}

/** The creator's line in a report: what it bought, sold and holds, and how much of its history that covers. */
function creatorLine(c: Creator, sells = "") {
  const holds = c.heldPct === null ? "its holdings unread" : `holds ${c.heldPct.toFixed(1)}% now`;
  const cover = c.note ? ` (${c.note})` : "";
  if (!c.trades) return `👤 Creator ${short(c.wallet)}: ${holds}; ${c.note}.`;
  if (!c.trades.length) return `👤 Creator ${short(c.wallet)}: no buys or sells${c.source === "pool" ? "" : " in this coin"}${cover}; ${holds}.`;
  const launch = c.launchPct !== null && c.launchPct >= 1 && c.launchPct < c.boughtPct - 0.5
    ? ` (${c.launchPct.toFixed(1)}% ${c.atLaunch ? "at launch" : "in its first two minutes of trading"})` : "";
  return `👤 Creator ${short(c.wallet)}: bought ${c.boughtPct.toFixed(1)}% of supply${launch}, sold ${c.soldPct.toFixed(1)}%${sells}, ${holds}${cover}.`;
}

// ---------- Seatbelt ----------

/** A note that something couldn't be checked: shown even on GREEN, where reasons are otherwise left out. */
const caveat = (reason: string) => reason.endsWith("isn't ruled out.");
/** What a one-line report says about a verdict: its worst reason unless GREEN, and every check that couldn't be made unless RED. */
const headline = (v: { verdict: Verdict; reasons: string[] }) =>
  [...new Set([...(v.verdict === "GREEN" ? [] : v.reasons.slice(0, 1)), ...(v.verdict === "RED" ? [] : v.reasons.filter(caveat))])].join(" ");

/** Cross-checks market data, RugCheck, Jupiter's audit and (when read) a Token-2022 transfer fee into GREEN / YELLOW / RED.
 *  Three warnings stack to RED, and so does the rug setup on its own: a pool under an hour old with an organic score of 0. */
function safety(t: Token | null, rc: any, jup: any, market = "DexScreener", copycatOf?: string, fee?: Fee | null | "unread", creator?: Creator | null) {
  // Each note with its level, so the worst lead: a YELLOW opens with its warning, not a note that happened to be checked first.
  const notes: [number, string][] = [];
  const seen = new Set<string>();
  let level = 0;
  let warnings = 0;
  // Only Oddshot's own warnings stack toward RED; RugCheck's long tail of mild warnings does not.
  const flag = (l: number, reason: string, key = reason, stacks = true) => {
    if (seen.has(key)) return;
    seen.add(key);
    level = Math.max(level, l);
    if (l === 1 && stacks) warnings++;
    notes.push([l, reason]);
  };
  if (!t) flag(2, "No Solana trading pair found.");
  else {
    const liq = t.liquidityUsd ?? 0;
    if (liq < 5_000) flag(2, `Liquidity is only ${usd(liq)}.`);
    else if (liq < 25_000) flag(1, `Thin liquidity (${usd(liq)}).`);
    if (t.ageHours !== null && t.ageHours < 1) flag(1, "Pair is less than an hour old.");
    if ((t.change1hPct ?? 0) <= -40) flag(1, `Dumped ${pct(t.change1hPct)} in the last hour.`);
  }
  const audit = jup?.audit;
  // An issuer's coin (Jupiter tags it a stablecoin, a tokenized stock or a real-world asset) keeps its mint, freeze and transfer control and
  // most of its supply with the issuer by design: its treasury and its compliance, not a rug setup. Only Jupiter's own tags say so.
  const issuer = issuerTagged(jup);
  if (issuer) {
    flag(0, "An issuer's coin (Jupiter tags it so): the issuer keeps mint, freeze and transfer control and most of the supply by design, so those aren't rug signals here.", "issuer", false);
    for (const k of ["mint", "freeze", "holders", "dev"]) seen.add(k);
  }
  if (audit) {
    if (audit.mintAuthorityDisabled === false) flag(2, "Mint authority is live: supply can be inflated.", "mint");
    if (audit.freezeAuthorityDisabled === false) flag(2, "Freeze authority is live: your tokens can be frozen.", "freeze");
    const top = n(audit.topHoldersPercentage);
    if (top !== null && top > 30) flag(top > 50 ? 2 : 1, `Top 10 holders own ${top.toFixed(0)}% of supply.`, "holders");
    if (audit.isSus === true) flag(1, "Jupiter flags this token as suspicious.", "sus");
    const devMints = n(audit.devMints);
    if (devMints !== null && devMints >= 20) flag(1, `Serial deployer: the dev has launched ${devMints} tokens.`, "dev");
  }
  const organic = n(jup?.organicScore);
  if (organic !== null && organic < 20) flag(1, `Mostly bot volume (organic score ${organic.toFixed(0)}/100).`, "organic");
  // $NVIDIA looked exactly like this when its creator sold $39,979 into it, five minutes after Oddshot's own test buy (Oct 27, 2026).
  // A young pool whose organic score can't be read is not given the benefit of the doubt.
  const young = t !== null && t.ageHours !== null && t.ageHours < 1;
  if (young && organic !== null && Math.round(organic) === 0) {
    level = 2;
    notes.unshift([2, "Rug setup: a pool under an hour old with an organic score of 0/100."]);
  } else if (young && organic === null) flag(1, "Pool under an hour old and its organic score can't be read, so a rug setup can't be ruled out.", "organic");
  // Token-2022 fees come off every transfer, buys and sells alike, and a fee authority can raise them after you buy.
  // A fee capped under about $1 per transfer is a rounding error, not a tax.
  if (fee === "unread") flag(0, "Solana RPC unavailable: transfer fee unconfirmed.", "fee");
  else if (fee) {
    const capUsd = fee.maxTokens !== null && t?.priceUsd ? fee.maxTokens * t.priceUsd : null;
    if (fee.bps > 0 && !(capUsd !== null && capUsd < 1)) flag(fee.bps >= 1000 ? 2 : 1, `Takes ${fee.bps / 100}% of every transfer${fee.mutable ? ", and its creator can raise that fee" : ""}.`, "fee");
    else if (fee.mutable) flag(1, `Its creator can ${fee.bps > 0 ? "raise its capped" : "switch on a"} transfer fee at any time (Token-2022).`, "fee");
  }
  if (copycatOf) flag(1, `Copycat: newer and thinner than the OG $${copycatOf}.`, "copycat");
  // The creator. $NVIDIA's bought 79.65% at launch, split it across 1,910 wallets two minutes later (holding 0, never sold), swept it back
  // 26 seconds before the dump and sold 48% of supply in one transaction. Each stage reads RED here: the big bag, the hidden bag, the sell.
  if (creator) {
    const c = creator, held = c.heldPct;
    // A hidden bag is what the creator bought at launch and neither sold, kept nor burned: it sits in other wallets. That takes the whole
    // history (a sell in an unread stretch would explain it) and the burn: a launchpad wallet that buys and burns hides nothing.
    // Keeping a sliver in the wallet changes nothing: what it holds is already counted.
    const hidden = c.whole && c.launchPct !== null && held !== null ? c.launchPct - c.soldPct - held - c.burnedPct : null;
    const selling = c.recentSoldPct >= 1 || c.recentSoldUsd >= 500;
    const red = selling
      ? `The creator is selling: ${c.hourRead ? "" : "at least "}${c.recentSoldPct.toFixed(1)}% of supply (${usd(c.recentSoldUsd)}) in the last hour.`
      : held !== null && held >= 30
        ? `The creator holds ${held.toFixed(0)}% of supply: one sell can crash the price.`
        : hidden !== null && hidden >= 20
          ? `Hidden bag: the creator bought ${c.launchPct!.toFixed(0)}% of supply ${c.atLaunch ? "at launch" : "in its first trades"}, ${c.soldPct < 1 ? "never sold" : `sold only ${c.soldPct.toFixed(0)}%`}, and its wallet holds ${held! < 1 ? "none of it" : `only ${held!.toFixed(0)}% of supply`} now.`
          : null;
    if (red) { level = 2; notes.unshift([2, red]); }
    else if (held !== null && held >= 10) flag(1, `The creator holds ${held.toFixed(0)}% of supply.`, "creator");
    else if (c.soldPct >= 1) flag(0, `The creator has sold ${c.whole ? "" : "at least "}${c.soldPct.toFixed(0)}% of supply.`, "creator", false);
    // An unread history is not a clean one, and neither is an unread wallet.
    if (!c.trades) flag(0, "The creator's trades couldn't be read right now, so a creator selling isn't ruled out.", "creator-trades", false);
    else if (!c.hourRead && !selling) flag(0, `Only part of the creator's last hour could be read (${c.note}), so a creator selling isn't ruled out.`, "creator-trades", false);
    if (held === null) flag(0, "The creator's wallet couldn't be read, so a big creator bag isn't ruled out.", "creator-held", false);
    if (!red && c.launchUnread) flag(0, "The creator's launch buys couldn't be read, so a hidden bag isn't ruled out.", "creator-launch", false);
  }
  for (const r of rc?.risks ?? []) {
    const name = String(r?.name ?? "");
    // RugCheck names the same issuer powers in its own words ("Permanent Control Enabled" is the issuer's power to move holders' tokens).
    if (issuer && /holder|authority|permanent|control|delegate/i.test(name)) continue;
    const lvl = String(r?.level ?? "").toLowerCase();
    const key = /mint authority/i.test(name) ? "mint" : /freeze authority/i.test(name) ? "freeze" : /top 10 holders/i.test(name) ? "holders" : name;
    flag(lvl === "danger" ? 2 : lvl === "warn" ? 1 : 0, `${name}${r.value ? ` (${String(r.value).replace(/^\((.*)\)$/, "$1")})` : ""}`, key, false);
  }
  if (!rc && !audit) flag(1, "Safety APIs unavailable: authority and holder checks unconfirmed.");
  else if (!rc) flag(0, "RugCheck unavailable: LP lock unconfirmed.");
  const reasons = notes.sort((a, b) => b[0] - a[0]).map(([, r]) => r);
  if (level === 1 && warnings >= 3) {
    level = 2;
    reasons.push("Three warnings stack up to RED.");
  }
  if (!reasons.length) reasons.push("No red flags across market data, RugCheck and Jupiter.");
  return {
    verdict: (["GREEN", "YELLOW", "RED"] as const)[level] as Verdict, reasons,
    sources: [...new Set([...(t ? [market] : []), ...(rc ? ["RugCheck"] : []), ...(audit ? ["Jupiter"] : [])])],
    rugcheckScore: n(rc?.score_normalised ?? rc?.score), lpLockedPct: round(n(rc?.lpLockedPct), 1),
  };
}

/** Majors skip the memecoin checks (authorities, holder share, LP locks): they are pinned by mint in MAJORS. */
const majorSafety = (symbol: string) => ({
  verdict: "GREEN" as Verdict, reasons: [`$${symbol} is a major (pinned mint): memecoin rug checks don't apply.`],
  sources: ["Oddshot majors list"], rugcheckScore: null, lpLockedPct: null,
});

const PENALTY = { GREEN: 0, YELLOW: 10, RED: 40 } as const;
const light = (v: Verdict) => ({ GREEN: "🟢", YELLOW: "🟡", RED: "🔴" })[v];

/** Liquid Solana tokens whose ticker or name starts a word of the narrative, ranked by momentum. */
async function searchNarrative(narrative: string, minLiquidity: number, minVolume: number, ms = 3500): Promise<Group> {
  const words = narrative.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));
  // Long titles need all but one word, so "You Can See Everything" does not match "1 coin can change your life".
  const need = words.length <= 3 ? Math.min(2, words.length) : words.length - 1;
  const relevant = (t: Token) => {
    const hay = `${t.symbol} ${t.name}`.toLowerCase();
    if (words.length > 1 && hay.replace(/[^a-z0-9]/g, "").includes(words.join(""))) return true;
    return words.filter((w) => new RegExp(`\\b${w}`).test(hay)).length >= need;
  };
  // DexScreener's search treats "GTA 6" and "GTA6" as different queries with different coins, so both spellings are searched.
  const queries = [...new Set([narrative, narrative.replace(/\s+/g, "")])];
  const results = await Promise.all(queries.map((q, i) =>
    getJson(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`, ms).catch((e: unknown) => (i === 0 ? Promise.reject(e) : null))));
  const all = bestPairs(results.flatMap((r) => r?.pairs ?? [])).filter(relevant);
  const cands = all
    .filter((t) => (t.liquidityUsd ?? 0) >= minLiquidity && (t.volume24hUsd ?? 0) >= minVolume)
    .map((t) => ({ t, m: momentum(t) }))
    .sort((a, b) => b.m - a.m);
  return { cands, all };
}

/** How canonical a token is for its story: depth, age, volume, holders, organic flow, verification, minus red flags. */
function canon(t: Token, j: any): number {
  return 2 * Math.log10((t.liquidityUsd ?? 0) + 1) + Math.log10((t.volume24hUsd ?? 0) + 1) + Math.min((t.ageHours ?? 0) / 24, 30) / 5
    + Math.log10((n(j?.holderCount) ?? 0) + 1) + (n(j?.organicScore) ?? 0) / 50 + (j?.isVerified ? 3 : 0)
    - (j?.audit?.isSus ? 2 : 0) - ((n(j?.audit?.devMints) ?? 0) >= 20 ? 2 : 0);
}

/** Maps a story's swarm: crowns the OG among the deepest pools, tags newer-and-thinner clones as copycats, counts fresh launches. */
function clusterOf(all: Token[], jup: Map<string, any>) {
  const og = [...all].sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0)).slice(0, 8)
    .sort((a, b) => canon(b, jup.get(b.mint)) - canon(a, jup.get(a.mint)))[0] ?? null;
  const role = (t: Token): Role => all.length < 2 ? "SOLO" : t.mint === og?.mint ? "OG"
    : (t.liquidityUsd ?? 0) < 0.2 * (og?.liquidityUsd ?? 0) && (t.ageHours ?? Infinity) < (og?.ageHours ?? 0) ? "COPYCAT" : "CONTENDER";
  const cluster: Cluster = {
    size: all.length, launched24h: all.filter((t) => t.ageHours !== null && t.ageHours < 24).length,
    copycats: all.filter((t) => role(t) === "COPYCAT").length, og: og?.symbol ?? null,
  };
  return { og, role, cluster };
}

const ROLE_RANK: Record<Role, number> = { OG: 1000, SOLO: 0, CONTENDER: 0, COPYCAT: -1000 }; // the OG leads unless RED; copycats never lead

/** Clusters each story (one Jupiter call for all), puts the OG first and copycats last, then safety-checks the top picks. */
async function scoreGroups(groups: Group[], limit: number, ms = 3500): Promise<{ picks: Scored[]; cluster: Cluster }[]> {
  const pool = groups.flatMap((g) => [...[...g.all].sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0)).slice(0, 8), ...g.cands.map((c) => c.t)]);
  const jup = await jupTokens([...new Set(pool.map((t) => t.mint))].slice(0, 90), ms);
  const shaped = groups.map((g) => {
    const { og, role, cluster } = clusterOf(g.all, jup);
    const ordered = [...g.cands].sort((a, b) => ROLE_RANK[role(b.t)] + b.m - (ROLE_RANK[role(a.t)] + a.m)).slice(0, limit);
    return { og, role, cluster, ordered };
  });
  const mints = [...new Set(shaped.flatMap((x) => x.ordered.map((c) => c.t.mint)))];
  const checks = new Map(await Promise.all(mints.map((mint) => rugcheck(mint, ms).then((rc) => [mint, rc] as const))));
  return shaped.map(({ og, role, cluster, ordered }) => ({
    cluster,
    picks: ordered
      .map(({ t, m }) => {
        const r = role(t);
        const s = safety(t, checks.get(t.mint), jup.get(t.mint), "DexScreener", r === "COPYCAT" ? og?.symbol : undefined);
        return { ...t, role: r, oddshotScore: Math.max(0, m - PENALTY[s.verdict]), momentumScore: m, ...s };
      })
      .sort((a, b) => b.oddshotScore + ROLE_RANK[b.role] - (a.oddshotScore + ROLE_RANK[a.role])),
  }));
}

const TIMING_BONUS: Record<Timing, number> = { EARLY: 15, RUNNING: 5, LATE: -10, FADING: -15, NO_MEME: 0 };

function toPlay(narrative: string, mover: Mover, candidates: Scored[], window: "1h" | "24h", cluster: Cluster, hot: Set<string>, other: OtherMarket | null = null): z.infer<typeof playSchema> {
  // Copycats are never the pick, whatever their momentum.
  const token = candidates.find((t) => t.verdict !== "RED" && t.role !== "COPYCAT") ?? null;
  // A 24h odds move is judged against the meme's bigger move over 6h or the full 24h, so a meme that ripped
  // and went quiet hours ago does not read as EARLY.
  const r6 = token?.change6hPct ?? 0, r24 = token?.change24hPct ?? r6;
  const run = !token ? 0 : window === "1h" ? token.change1hPct ?? 0 : Math.abs(r24) > Math.abs(r6) ? r24 : r6;
  const timing: Timing = !token ? "NO_MEME" : run < -20 ? "FADING" : run <= 15 ? "EARLY" : run <= 100 ? "RUNNING" : "LATE";
  const storyHeat = mover.direction === "up" ? "heating" : "cooling";
  const span = window === "1h" ? "1h" : run === r24 && r24 !== r6 ? "24h" : "6h";
  const crowd = `Crowd ${storyHeat === "heating" ? "piling into" : "backing off"} "${mover.question}" (${mover.venue}, ${sign(mover.changePts)} pts → ${mover.probabilityPct}%).` +
    (other ? ` ${other.venue} is repricing it too: "${other.question}" ${sign(other.changePts)} pts → ${other.probabilityPct}% in 24h.` : "");
  const memeLine: Record<Timing, string> = {
    EARLY: `hasn't moved yet (${pct(run)} ${span}). ${storyHeat === "heating" ? "The window is open." : "Watch for a fade."}`,
    RUNNING: `is already running (${pct(run)} ${span}).`,
    LATE: `already ripped (${pct(run)} ${span}), likely priced in.`,
    FADING: `is bleeding (${pct(run)} ${span}).`,
    NO_MEME: "",
  };
  const blocked = candidates.length > 0 && !token;
  const frenzy = cluster.launched24h >= 5;
  const swarm = token && cluster.size > 1
    ? ` $${token.symbol} is the ${token.role === "OG" ? "OG" : "top contender"} of ${cluster.size} "${narrative}" tokens${cluster.copycats ? `; ${cluster.copycats} copycat${cluster.copycats > 1 ? "s" : ""} skipped` : ""}.`
    : "";
  const late = frenzy ? ` Copycat frenzy: ${cluster.launched24h} launched in 24h, so this may be late.` : "";
  return {
    narrative, mover, token, timing, storyHeat, cluster, trending: !!token && hot.has(token.mint), otherMarket: other,
    // Two venues repricing the same story is a louder signal than one, as with BOTH CROWDS on the radar.
    playScore: token ? Math.max(0, Math.round(token.oddshotScore + Math.min(Math.abs(mover.changePts), 30) / 2 + TIMING_BONUS[timing] + (storyHeat === "heating" ? 5 : 0) + (other ? 5 : 0) - (frenzy ? 8 : 0))) : 0,
    thesis: token ? `${crowd} $${token.symbol} ${memeLine[timing]}${swarm}${late}`
      : `${crowd} ${blocked ? `Every "${narrative}" meme failed the seatbelt.` : `No liquid "${mover.narrativeKeywords[0] ?? narrative}" meme yet.`}`,
  };
}

// ---------- Macro: what the odds say for majors ----------

type Theme = { theme: string; q: string; match: RegExp; assets: string[]; sign: (question: string) => number };
const EVERY = ["SOL", "BTC", "ETH"];
// Each theme reads one family of markets for risk appetite: +1 when a Yes is good for crypto, -1 when it is bad, 0 when it says nothing.
const THEMES: Theme[] = [
  { theme: "Fed", q: "Fed interest rates", match: /\b(fed|federal reserve|fomc)\b/i, assets: EVERY,
    sign: (s) => /\b\d+\+?\s+(fed\s+|rate\s+)*(cuts|hikes)\b/i.test(s) ? 0 : /\bno\b[^?]*\bcuts?\b/i.test(s) ? -1
      : /\b(no change|maintains?|0 ?bps|pause)\b/i.test(s) ? 0 : /\b(hike|raise|increase)/i.test(s) ? -1 : /\b(cut|lower|decrease)/i.test(s) ? 1 : 0 },
  { theme: "Recession", q: "recession", match: /\brecessions?\b/i, assets: EVERY, sign: () => -1 },
  { theme: "Crypto law", q: "crypto market structure", match: /\b(crypto|stablecoin|digital asset)s?\b.*\b(law|bill|act|legislation)\b/i, assets: EVERY, sign: () => 1 },
  { theme: "Bitcoin reserve", q: "Bitcoin reserve", match: /\bbitcoin\b.*\b(reserve|purchase)\b|\b(reserve|treasury)\b.*\bbitcoin\b/i, assets: ["BTC"], sign: () => 1 },
  { theme: "Tariffs", q: "tariffs", match: /\btariffs?\b/i, assets: EVERY,
    sign: (s) => /\b(raise|increase|new|impose)/i.test(s) ? -1 : /\b(lower|reduce|remove|drop)/i.test(s) ? 1 : 0 },
  { theme: "Shutdown", q: "government shutdown", match: /\bshut ?down\b/i, assets: EVERY, sign: () => -1 },
];
const THEME = new Map(THEMES.map((t) => [t.theme, t]));
// Word-count and count markets ("Will Warsh say...", "How many shutdowns...") are not bets on risk.
const NOT_MACRO = /\b(say|says|said|mention|tweet|how many|number of)\b/i;
/** A macro market's weight: nothing at $1K a day, full weight from $100K. One swing counts at most 15 pts. */
const macroWeight = (volume: number) => clamp((Math.log10(volume + 10) - 3) / 2, 0, 1);

/** Every macro market that moved in 24h on Polymarket and Kalshi, scored as risk-on or risk-off and weighted by volume. */
async function macroDrivers(ms: number): Promise<Driver[]> {
  // With no search answered on either venue the odds are unread, not flat: a NEUTRAL from nothing would be a guess.
  let answered = 0;
  const per = await Promise.all(THEMES.map(async (th) => {
    const fits = (q: string) => th.match.test(q) && !NOT_MACRO.test(q) && !LADDER.test(q) && th.sign(q) !== 0;
    const [poly, kalshi] = await Promise.all([
      getJson(`https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(th.q)}&limit_per_type=8&events_status=active`, ms)
        .then((r) => (answered++, (r?.events ?? []).flatMap((e: any) => {
          const b = bestMarket({ ...e, markets: (e.markets ?? []).filter((m: any) => fits(String(m?.question ?? ""))) }, "24h", 5000);
          return b ? [toMover(e, b)] : [];
        })))
        .catch(() => [] as Mover[]),
      kalshiSeries(`query=${encodeURIComponent(th.q)}&order_by=querymatch&page_size=10`, ms)
        .then((found) => (answered++, kalshiMovers(found.filter(({ m }) => fits(kalshiQuestion(m))), 5000, 0.01, ms)))
        .catch(() => [] as Mover[]),
    ]);
    return [...poly, ...kalshi].map((m): Driver => {
      const impact = round(th.sign(m.question) * clamp(m.changePts, -15, 15) * macroWeight(m.volume24hUsd), 1)!;
      return { theme: th.theme, reads: impact >= 0 ? "risk-on" : "risk-off", impact, venue: m.venue, question: m.question,
        probabilityPct: m.probabilityPct, changePts: m.changePts, volume24hUsd: m.volume24hUsd, url: m.url };
    });
  }));
  if (!answered) throw new Error("Polymarket and Kalshi couldn't be read right now. Try again in a few seconds.");
  const seen = new Set<string>();
  return per.flat().filter((d) => d.impact !== 0 && !seen.has(d.question) && seen.add(d.question)).sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
}

/** Macro mode from the odds (tilt ±4 or more), and a call on each major against its own 24h move. */
async function macroRead(ms = 3500, prices?: Map<string, any>) {
  const [drivers, jup] = await Promise.all([macroDrivers(ms), prices ?? jupTokens(Object.keys(MAJORS), ms)]);
  const tiltOf = (symbol: string) => round(drivers.filter((d) => THEME.get(d.theme)!.assets.includes(symbol)).reduce((a, d) => a + d.impact, 0), 1)!;
  const tilt = round(drivers.filter((d) => THEME.get(d.theme)!.assets === EVERY).reduce((a, d) => a + d.impact, 0), 1)!;
  const mode = tilt >= 4 ? "RISK-ON" as const : tilt <= -4 ? "RISK-OFF" as const : "NEUTRAL" as const;
  const majors = await Promise.all(Object.entries(MAJORS).map(async ([mint, { symbol }]) => {
    const j = jup.get(mint);
    // Jupiter's keyless quota is small; the deepest DexScreener pool stands in for a missing price.
    const dex = n(j?.usdPrice) === null ? await pairsByMint(mint, ms).then((p) => (p[0] ? toToken(p[0]) : null)) : null;
    const change = round(n(j?.stats24h?.priceChange) ?? dex?.change24hPct ?? null, 1);
    const t = tiltOf(symbol);
    const call = t >= 4 ? ((change ?? 0) < 3 ? "ODDS LEAD" as const : "PRICED IN" as const) : t <= -4 ? "SEATBELT" as const : "NO PUSH" as const;
    const note = {
      "ODDS LEAD": `The odds lean risk-on (tilt ${sign(t)}) and $${symbol} ${(change ?? 0) <= -3 ? `is ${pct(change)} in 24h, against them` : `hasn't moved yet (${pct(change)} 24h)`}.`,
      "PRICED IN": `The odds lean risk-on (tilt ${sign(t)}), but $${symbol} already moved ${pct(change)} in 24h.`,
      "SEATBELT": `The odds lean risk-off (tilt ${t}): consider parking some $${symbol} in USDC${(change ?? 0) <= -5 ? `; it is already ${pct(change)} in 24h` : ""}.`,
      "NO PUSH": `No strong macro push either way (tilt ${sign(t)}).`,
    }[call];
    return { symbol, mint, priceUsd: n(j?.usdPrice) ?? dex?.priceUsd ?? null, change24hPct: change, tilt: t, call, note };
  }));
  return { mode, tilt, drivers: drivers.slice(0, 8), majors };
}

// ---------- Automatic exits: Jupiter's trigger orders ----------

// Jupiter's Trigger API v1 holds coins in an on-chain order and sells them when the price reaches a target: a take-profit. It can't
// wait for a fall, since an order under the market fills at once. Trigger v2 can (stops, take-profit and stop pairs), but it needs a
// signed login and submits the signed transaction itself, and a PayBox plugin never holds a signature. Jupiter no longer maintains
// v1; it is keyless and it works. An order must pay out at least $5, a fill costs 0.1% (0.03% between stablecoins), and Jupiter
// refuses any coin with a Token-2022 transfer-fee setting, even one set to 0%.
const TRIGGER = `${JUP}/trigger/v1`;
const ORDER_MIN_USD = 5;
// What an order costs in SOL, from a measured one: its account (2,540,000 lamports) and the escrow for the coin (up to 1,513,840 for a
// Token-2022 coin), both returned when it closes, plus the network fee. The payout account (USDC, or wrapped SOL) costs 1,488,440
// once when the wallet has none, and stays in that account. A wallet must also keep 650,240 to stay rent-exempt.
const ORDER_LAMPORTS = 4_080_000, PAYOUT_ACCOUNT_LAMPORTS = 1_488_440, RENT_FLOOR_LAMPORTS = 650_240;
/** SOL a wallet needs to open `orders` take-profit orders, counting the payout account when it has none. */
const orderSol = (orders: number, payoutAccount: boolean) => (orders * ORDER_LAMPORTS + RENT_FLOOR_LAMPORTS + (payoutAccount ? 0 : PAYOUT_ACCOUNT_LAMPORTS)) / 1e9;
/** Whether a wallet already has an account for a mint (its payout account), from the RPC; null when that can't be read. */
const hasAccount = (owner: string, mint: string, ms = 3000) =>
  rpc("getTokenAccountsByOwner", [owner, { mint }, { encoding: "jsonParsed", commitment: "confirmed" }], ms).then((r) => (r?.value?.length ?? 0) > 0, () => null);
/** Why an order can't sell `mint` for `receive`: it is the payout itself, or a stablecoin (SOL sells for USDC). */
const payoutClash = (mint: string, receive: "USDC" | "SOL") =>
  mint === (receive === "USDC" ? USDC : SOL) || (QUOTE_MINTS.has(mint) && mint !== SOL) ? "Pick a coin to sell, not the asset the order pays out (or another stablecoin)." : null;

/** A wallet's open trigger orders as Jupiter lists them (amounts in tokens, as decimal strings): ten to a page, `pages` at most, since
 *  each page spends the shared keyless quota. The pages after the first are read together, and every page has to answer by `until`.
 *  `more` says some weren't read (past the cap, or a later page that failed or ran late); the pages that did answer still count. */
async function openOrders(wallet: string, ms = 4000, pages = 3, until = Date.now() + 2 * ms): Promise<{ orders: any[]; more: boolean }> {
  const page = (p: number) => getJson(`${TRIGGER}/getTriggerOrders?user=${wallet}&orderStatus=active&page=${p}`, Math.max(0, Math.round(Math.min(ms, until - Date.now()))));
  const first = await page(1);
  const total = n(first?.totalPages) ?? 1;
  const rest = await Promise.all(Array.from({ length: Math.max(0, Math.min(total, pages) - 1) }, (_, i) => (until - Date.now() < 300 ? null : page(i + 2).catch(() => null))));
  return { orders: [first, ...rest].flatMap((r) => (Array.isArray(r?.orders) ? r.orders : [])), more: total > pages || rest.some((r) => r === null) };
}

/** A time Jupiter sends as unix seconds or a date string, as ISO; null when absent or unreadable. */
const isoOf = (v: unknown) => {
  const t = typeof v === "number" || /^\d+$/.test(String(v ?? "")) ? Number(v) * 1000 : Date.parse(String(v ?? ""));
  return v != null && v !== "" && Number.isFinite(t) ? new Date(t).toISOString() : null;
};
/** A Jupiter order record in Oddshot's terms: what still waits in it, at what price per token of the coin it sells (or, for a buy, the
 *  coin it buys), and how far that is from now. Stablecoins are priced and named without a lookup. */
function orderOf(o: any, jup: Map<string, any>): Order {
  const mint = String(o?.inputMint ?? ""), out = String(o?.outputMint ?? "");
  const usdOf = (m: string) => (STABLES[m] ? 1 : n(jup.get(m)?.usdPrice));
  const label = (m: string) => STABLES[m] ?? (m === SOL ? "SOL" : sym(jup.get(m)?.symbol ?? short(m)));
  // Spending a stablecoin, or SOL on anything but one, is a buy: its target is the price of the coin it buys.
  const buy = !!STABLES[mint] || (mint === SOL && !STABLES[out]);
  const making = n(o?.makingAmount) ?? 0, taking = n(o?.takingAmount) ?? 0, left = n(o?.remainingMakingAmount) ?? making;
  const inUsd = usdOf(mint), outUsd = usdOf(out), now = buy ? outUsd : inUsd;
  const target = buy ? (taking > 0 && inUsd !== null ? (making * inUsd) / taking : null) : making > 0 && outUsd !== null ? (taking * outUsd) / making : null;
  return { order: String(o?.orderKey ?? ""), side: buy ? "buy" : "sell", mint, symbol: label(mint), receive: label(out),
    tokens: round(left, 6)!, filledPct: making > 0 ? round((1 - left / making) * 100, 1)! : 0, targetPriceUsd: target, priceUsd: now,
    toTargetPct: target !== null && now ? round((target / now - 1) * 100, 1) : null, receiveAmount: round(making > 0 ? (taking * left) / making : 0, 6)!,
    createdAt: String(o?.createdAt ?? ""), expiresAt: isoOf(o?.expiredAt) };
}
/** One order as a line, with its full address for cancel_order: "2,780 $WIF waiting for $0.250 (+41.0% from now), for 695 USDC · order
 *  <address>", or for a buy "100 USDC waiting to buy 5,000,000 $BONK at $0.0000200 (-20.0% from now) · order <address>". */
const orderLine = (o: Order) => {
  const at = `${o.targetPriceUsd === null ? "?" : `$${px(o.targetPriceUsd, 3)}`}${o.toTargetPct === null ? "" : ` (${pct(o.toTargetPct)} from now)`}`;
  return `${o.side === "buy" ? `${px(o.tokens, 4)} ${o.symbol} waiting to buy ${px(o.receiveAmount, 4)} $${o.receive} at ${at}` : `${px(o.tokens, 4)} $${o.symbol} waiting for ${at}, for ${px(o.receiveAmount, 4)} ${o.receive}`}${o.filledPct > 0 ? ` · ${o.filledPct}% filled` : ""}${o.expiresAt ? ` · closes ${o.expiresAt.slice(0, 10)}` : ""} · order ${o.order}`;
};

/** A number as a plain decimal an agent can pass on: six significant digits and at most `decimals` places, never exponent notation,
 *  rounded down when `down` (a token amount must never ask for more than is there, or for a fraction the coin can't hold). It is counted
 *  in whole steps, so 0.00024264 stays 0.00024264 rather than coming out as 0.000242639. */
function plain(v: number, down = false, decimals = 20) {
  if (!(v > 0)) return "0";
  const exp = Math.max(Math.floor(Math.log10(v)) - 5, -decimals), steps = down ? Math.floor((v / 10 ** exp) * (1 + 1e-12)) : Math.round(v / 10 ** exp);
  if (exp >= 0) return `${steps}${"0".repeat(exp)}`;
  const digits = String(steps).padStart(1 - exp, "0"), frac = digits.slice(exp).replace(/0+$/, "");
  return `${digits.slice(0, exp)}${frac ? `.${frac}` : ""}`;
}
/** The exit plan for a coin from its own volatility: majors get the tighter 3–15% stop, as ape gives them. */
const exitPlanFor = (mint: string, candles: number[][], entry: number | null) => (MAJORS[mint] ? exitPlan(candles, entry, 3, 15) : exitPlan(candles, entry));
/** The exit plan's targets as orders for a bag of `tokens`: half at the first and the rest at the second, or the whole bag at the second
 *  when a half wouldn't reach Jupiter's $5 minimum. None when even that falls short. */
function tpOrders(tokens: number, plan: ReturnType<typeof exitPlan>) {
  if (!plan) return null;
  const half = tokens / 2;
  return half * plan.tp1Price >= ORDER_MIN_USD && half * plan.tp2Price >= ORDER_MIN_USD
    ? [{ tokens: half, priceUsd: plan.tp1Price, gainPct: plan.tp1, proceedsUsd: half * plan.tp1Price }, { tokens: half, priceUsd: plan.tp2Price, gainPct: plan.tp2, proceedsUsd: half * plan.tp2Price }]
    : tokens * plan.tp2Price >= ORDER_MIN_USD ? [{ tokens, priceUsd: plan.tp2Price, gainPct: plan.tp2, proceedsUsd: tokens * plan.tp2Price }] : [];
}
type TpLeg = NonNullable<ReturnType<typeof tpOrders>>[number];
/** The calls that place those orders, as an agent would make them: token amounts within the coin's decimals (so a bag already in the
 *  wallet isn't swept in, and take_profit takes them as printed), and the payout when it isn't USDC. */
const tpCalls = (legs: TpLeg[], decimals: number, receive: "USDC" | "SOL" = "USDC") =>
  legs.map((l, i) => `take_profit amount ${plain(l.tokens, true, decimals)} at price ${plain(l.priceUsd)}${receive === "SOL" ? `, receive "SOL"` : ""} (+${l.gainPct}%)${i === 0 && legs.length > 1 ? ", then" : ""}`).join(" ");
/** The exit plan two open take-profit orders came from, when they look like one: a plan's targets sit 2× and 4× its stop above the entry,
 *  so the entry is 2·T1 − T2, and the stop has to fall in the coin's band (3–15% for majors, 10–50% otherwise). */
function planOf(mint: string, orders: Order[]) {
  const ts = orders.map((o) => o.targetPriceUsd).filter((t): t is number => t !== null).sort((a, b) => a - b);
  if (ts.length !== 2) return null;
  const entry = 2 * ts[0]! - ts[1]!, stop = entry > 0 ? Math.round(((ts[1]! - ts[0]!) / (2 * entry)) * 100) : 0;
  const [lo, hi] = MAJORS[mint] ? [3, 15] : [10, 50];
  return stop >= lo && stop <= hi ? { entry, stop, stopPrice: entry * (1 - stop / 100) } : null;
}

/** Everything take_profit checks before Jupiter builds an order, as the reason it can't go ahead (null when it can). my_orders runs the
 *  same checks, because PayBox doesn't pass take_profit's refusals on. */
function orderBlock(o: { owner: string; mint: string; symbol: string; fee: Fee | null | "unread"; tokens: number | null; decimals: number | null; inOrders: number;
  priceUsd: number | null; target: number | null; size: number | null; amount?: string; receive: "USDC" | "SOL"; orders: number; sol: number | null;
  payoutAccount: boolean | null; solUsd: number | null; then?: string }): string | null {
  const clash = payoutClash(o.mint, o.receive);
  if (clash) return clash;
  // Any transfer-fee setting, even 0%, and Jupiter refuses the coin.
  if (o.fee && o.fee !== "unread") return `${o.symbol} carries a Token-2022 transfer-fee setting (now ${o.fee.bps / 100}%), and Jupiter's orders refuse any such coin: sell it with ape when the price gets there.`;
  if (o.tokens === null) return "The wallet's balance couldn't be read right now. Try again in a few seconds.";
  if (o.tokens <= 0) return o.inOrders > 0 ? `The whole ${o.symbol} bag already waits in take-profit orders (my_orders lists them; cancel_order returns them).`
    : o.mint === SOL ? `No SOL above the ${SOL_RESERVE} SOL kept for fees to put in an order.`
    : `No ${o.symbol} in the wallet to put in an order. If a buy just went through, give it a few seconds to land.`;
  if (!o.priceUsd) return `Couldn't read ${o.symbol}'s price right now. Try again in a few seconds.`;
  if (o.receive === "SOL" && !o.solUsd) return "Couldn't read SOL's price to size the payout right now. Try again in a few seconds.";
  if (o.target !== null && o.target <= o.priceUsd) return `The target $${px(o.target, 3)} isn't above ${o.symbol}'s price ($${px(o.priceUsd, 3)}): an order there would fill at once. To sell now use ape; for a take-profit, set a higher target.`;
  if (o.target !== null && o.target <= o.priceUsd * 1.01) return `The target $${px(o.target, 3)} is within 1% of ${o.symbol}'s price ($${px(o.priceUsd, 3)}), so the order could fill at once. Set a target at least 2% higher.`;
  const places = o.amount?.split(".")[1]?.length ?? 0;
  if (o.decimals !== null && places > o.decimals)
    return `The amount has ${places} decimal places and ${o.symbol} has ${o.decimals}: give it with ${o.decimals} at most (for example ${plain(Number(o.amount), true, o.decimals)}).`;
  if (o.size !== null && o.target !== null && o.size > o.tokens) return `The order asks for ${plain(o.size)} ${o.symbol}, but the wallet holds ${plain(o.tokens, true, o.decimals ?? 20)}.`;
  if (o.size !== null && o.target !== null && o.size * o.target < ORDER_MIN_USD)
    return `Too small for an order: ${px(o.size, 4)} ${o.symbol} at $${px(o.target, 3)} brings ${usd(o.size * o.target)}, under Jupiter's $${ORDER_MIN_USD} minimum.`;
  // A payout account that couldn't be checked counts as missing: the safe side of the rent.
  const need = orderSol(o.orders, o.payoutAccount === true);
  if (o.sol !== null && o.sol < need) {
    // The total rounds up and the balance down, so a wallet a hair short never reads as holding enough.
    const gap = need - o.sol;
    return `${o.orders === 1 ? "An order locks" : `${o.orders} orders lock`} about ${round(o.orders * ORDER_LAMPORTS / 1e9, 4)} SOL of rent until ${o.orders === 1 ? "it closes" : "they close"}${o.payoutAccount !== true ? ", the payout account costs about 0.0015 SOL once" : ""}, and the wallet keeps about 0.00065 SOL: ${Math.ceil(need * 1e4) / 1e4} SOL in all, and it holds ${Math.floor(o.sol * 1e4) / 1e4} SOL. ${moonpay("sol", o.owner, o.solUsd ? gap * o.solUsd : 0, o.then ?? "Then place the order again.")}`;
  }
  return null;
}

// ---------- Bags and the seatbelt ----------

/** A wallet's balances and its positions worth $0.50+, valued with Jupiter and seatbelted (majors skip the memecoin checks). */
async function bagsOf(owner: string, limit: number, onValued?: (valued: { mint: string; j: any }[], jup: Map<string, any>) => void) {
  // Every stage after the wallet read gets what is left of a 4.5 s budget, and at least 600 ms while the call is under `end` (4.8 s), so a
  // slow RPC can't push the call past PayBox's limit. The price lookup is the one stage the call can't do without, so it may run to the
  // call's own deadline; the checks after it then read as unread.
  const t0 = Date.now(), left = (cap: number, end = 4800) => Math.max(0, Math.min(600, end - (Date.now() - t0)), Math.min(cap, 4500 - (Date.now() - t0)));
  // Tokens waiting in take-profit orders aren't in the wallet, but they are still the user's: they count toward each coin, so a bag set
  // up for automatic exits is still rug-checked, creator-checked and exited (after a cancel). The order list starts first and has until
  // 2.7 s in; a page that misses that is reported as unread, and the pages that made it still count.
  let inHand: Awaited<ReturnType<typeof openOrders>> | null | undefined;
  const ordersP = openOrders(owner, 2500, 3, t0 + 2700).catch(() => null).then((l) => (inHand = l));
  const wallet = await walletHoldings(owner);
  // The coins are priced in one lookup (100 mints at most): the wallet's, and the orders' when the list is in, which it usually is, or is
  // within 400 ms (while the call has time). A list later than that doesn't hold the lookup up: the coins only it brings (one only an
  // order holds, or a payout coin, rarely anything but USDC or SOL) get one more lookup.
  if (inHand === undefined) await within(ordersP, Math.max(0, Math.min(400, 2900 - (Date.now() - t0))), () => null);
  const orderMints = (l: typeof inHand) => [...new Set((l?.orders ?? []).flatMap((o) => [o?.inputMint, o?.outputMint]))].filter((m): m is string => typeof m === "string" && !QUOTE_MINTS.has(m));
  const walletMints = [...wallet.tokens.entries()].filter(([mint, h]) => !QUOTE_MINTS.has(mint) && h.ui > 0).sort((x, y) => y[1].ui - x[1].ui).map(([mint]) => mint);
  const asked = new Set([...Object.keys(MAJORS), ...orderMints(inHand), ...walletMints].slice(0, 100));
  const [priced, listed] = await Promise.all([jupTokens([...asked], left(2500, 5000)), ordersP]);
  const waiting = new Map<string, number>();
  for (const o of listed?.orders ?? []) {
    const mint = String(o?.inputMint ?? ""), rest = n(o?.remainingMakingAmount) ?? n(o?.makingAmount) ?? 0;
    if (mint && !QUOTE_MINTS.has(mint) && rest > 0) waiting.set(mint, (waiting.get(mint) ?? 0) + rest);
  }
  const held = [...new Set([...walletMints.filter((m) => asked.has(m)), ...waiting.keys()])]
    .map((mint) => ({ mint, inOrders: waiting.get(mint) ?? 0, amount: (wallet.tokens.get(mint)?.ui ?? 0) + (waiting.get(mint) ?? 0) }))
    .filter((b) => b.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const extra = orderMints(listed).filter((m) => !asked.has(m)).slice(0, 100);
  const jup = extra.length ? new Map([...priced, ...(await jupTokens(extra, left(1500, 5000)))]) : priced;
  if (held.length && !jup.size) throw new Error("Jupiter's price lookup didn't answer (it is rate-limiting, or slow right now). Wait about 10 seconds and try again.");
  const valued = held
    .map((b) => ({ ...b, j: jup.get(b.mint), valueUsd: b.amount * (n(jup.get(b.mint)?.usdPrice) ?? 0) }))
    .filter((b) => b.j && b.valueUsd >= 0.5)
    .sort((a, b) => b.valueUsd - a.valueUsd)
    .slice(0, limit);
  onValued?.(valued, jup);
  // A creator selling or sweeping its bag back is the exit signal a rug check alone misses. The five largest memecoins get the check:
  // each reads the creator's wallet, and with the wallet read's two that stays under the public RPC's per-method limit. Trades come
  // from Jupiter's data API only, since a GeckoTerminal fallback per position would spend that shared quota in one burst.
  const hasDev = (b: { mint: string; j: any }) => !MAJORS[b.mint] && typeof b.j?.dev === "string" && b.j.dev !== "" && !issuerTagged(b.j);
  // After a slow wallet read there may be no time left for them; then they are skipped, and said to be.
  const late = left(3500) < 1500;
  const checked = new Set(late ? [] : valued.filter(hasDev).slice(0, 5).map((b) => b.mint));
  const [checks, creators] = await Promise.all([
    Promise.all(valued.map((b) => (MAJORS[b.mint] ? null : rugcheck(b.mint, left(3000))))),
    Promise.all(valued.map((b) => (checked.has(b.mint) ? creatorOf(b.mint, b.j, null, { gecko: false, deadline: left(3500), holding: wallet.rpc }) : null))),
  ]);
  const positions: Position[] = valued.map((b, i) => {
    const t = fromJupiter(b.j);
    const s = MAJORS[b.mint] ? majorSafety(t.symbol) : safety(t, checks[i], b.j, "Jupiter", undefined, undefined, creators[i]);
    if (hasDev(b) && !checked.has(b.mint)) s.reasons.push(late ? "The creator wasn't checked this time (the wallet read was slow), so a creator selling isn't ruled out."
      : "The creator wasn't checked (the seatbelt checks the creators of the five largest coins), so a creator selling isn't ruled out.");
    return { mint: b.mint, symbol: t.symbol, name: t.name, amount: b.amount, inOrders: round(b.inOrders, 6)!, valueUsd: round(b.valueUsd, 2), change24hPct: round(t.change24hPct, 1), ...s };
  });
  // Under $0.50 a coin isn't worth a sale's fees, but one that collapsed is still news: a $2 buy rugged to $0.004 must not just vanish.
  const small = held
    .map((b) => ({ ...b, j: jup.get(b.mint) }))
    .filter((b) => b.j && !MAJORS[b.mint])
    .map((b) => ({ b, t: fromJupiter(b.j), valueUsd: b.amount * (n(b.j.usdPrice) ?? 0), liquidityUsd: n(b.j.liquidity) }))
    .filter((x) => x.valueUsd < 0.5);
  const crashed = (x: (typeof small)[number]) => (x.t.change24hPct ?? 0) <= -80 || (x.liquidityUsd !== null && x.liquidityUsd < 1000);
  const collapsed = small.filter(crashed)
    .sort((a, b) => (a.t.change24hPct ?? 0) - (b.t.change24hPct ?? 0))
    .slice(0, 5)
    .map((x) => ({ mint: x.b.mint, symbol: x.t.symbol, valueUsd: round(x.valueUsd, 6), change24hPct: round(x.t.change24hPct, 1), liquidityUsd: round(x.liquidityUsd, 0) }));
  const dust = small.length - collapsed.length;
  const solBalance = round(wallet.sol, 9);
  const solPrice = n(jup.get(SOL)?.usdPrice);
  const usdcBalance = wallet.tokens.get(USDC)?.ui ?? 0;
  // SOL or a stablecoin waiting in an order is the user's too.
  const parkedUsd = (listed?.orders ?? []).filter((o) => QUOTE_MINTS.has(String(o?.inputMint)))
    .reduce((a, o) => a + (n(o?.remainingMakingAmount) ?? 0) * (o.inputMint === SOL ? solPrice ?? 0 : 1), 0);
  const totalUsd = round((solBalance ?? 0) * (solPrice ?? 0) + usdcBalance + parkedUsd + positions.reduce((s, p) => s + (p.valueUsd ?? 0), 0), 2)!;
  const orders = (listed?.orders ?? []).map((o) => orderOf(o, jup));
  return { solBalance, solPrice, usdcBalance, usdcAccount: wallet.tokens.has(USDC), totalUsd, positions, collapsed, dust, jup, orders, ordersRead: listed !== null, ordersMore: listed?.more ?? false,
    liquidity: new Map(valued.map((b) => [b.mint, n(b.j?.liquidity)])),
    decimals: new Map(valued.map((b) => [b.mint, n(b.j?.decimals) ?? wallet.tokens.get(b.mint)?.decimals ?? null])) };
}

/** A line when a wallet is too low on SOL for network fees: below what a first buy needs, or even a sell into USDC, which also opens
 *  the wallet's USDC account (about 0.002 SOL) when it has none. */
const fuelLine = (sol: number | null, usdcAccount: boolean) => {
  if (sol === null || sol >= SOL_FOR_BUY) return "";
  const sells = sol >= (usdcAccount ? 0.0003 : 0.0025);
  return `\n⛽ Only ${sol} SOL for network fees: ${sells ? "enough for sells into USDC, not for a first buy" : "maybe not enough even for a sell into USDC"}. top_up gives a MoonPay link.`;
};

/** Open take-profit orders as a line under a bag or seatbelt report, and a note when they couldn't all be read: their tokens are back in
 *  the wallet only when an order closes. */
const ordersLines = (orders: Order[], read: boolean, more: boolean) =>
  (orders.length ? `\n📌 Waiting in orders: ${orders.map(orderLine).join(" · ")}. my_orders has the detail; cancel_order returns an order's tokens.` : "")
  + (!read ? "\n📌 Take-profit orders couldn't be read right now, so tokens waiting in them aren't counted."
    : more ? `\n📌 Not every take-profit order could be read this time (${orders.length} ${orders.length === 1 ? "was" : "were"}), so tokens waiting in the rest aren't counted.` : "");
/** The calls that exit a coin: cancel its take-profit orders first (their tokens aren't in the wallet) and, once the cancels have landed,
 *  sell. A sell built before then would only reach what the wallet already holds. */
const exitCalls = (mint: string, cancel: string[], sell: string) =>
  `${cancel.length ? `${cancel.map((o) => `cancel_order order ${o}`).join(", then ")}; once ${cancel.length === 1 ? "that cancel has" : "the cancels have"} landed, ` : ""}ape side "sell", mint ${mint}, ${sell}, payWith "USDC"`;

/** The collapsed coins and the count of other dust, as lines under a bag or seatbelt report. */
const collapsedLines = (collapsed: z.infer<typeof collapsedSchema>[], dust: number) =>
  (collapsed.length ? `\n💀 Collapsed, not worth a sale's fees: ${collapsed.map((c) => `$${c.symbol} worth $${px(c.valueUsd ?? 0, 2)} (${pct(c.change24hPct)} 24h, pool ${usd(c.liquidityUsd)})`).join(" · ")}` : "")
  + (dust > 0 ? `\n+${dust} more coin${dust === 1 ? "" : "s"} under $0.50.` : "");

/** Whether a position's whole bag waits in take-profit orders (up to rounding). */
const allInOrders = (p: Position) => p.inOrders > 0 && p.amount - p.inOrders <= p.amount * 1e-6;
/** A reason as a sentence: RugCheck's risk names come without a full stop. */
const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);
/** A coin Jupiter tags as a stablecoin: macro odds don't move it, and selling it into USDC changes nothing. */
const stableTagged = (j: any) => Array.isArray(j?.tags) && j.tags.some((t: unknown) => /^(stable|stablecoin)$/i.test(String(t)));
/** What seatbelt read of a coin's story: its market, null when there is none, "unread" when the read failed or ran out of time, "issuer"
 *  for an issuer's coin (no story to read), and undefined when it wasn't checked (beyond the five largest). */
type StoryRead = Mover | null | "unread" | "issuer" | undefined;

/** HOLD, TRIM or EXIT for one position: a rug flag or a dying story exits, a cooling story or a risk-off macro trims (never a stablecoin).
 *  `orders` are the coin's take-profit orders, and `decimals` the coin's, for a sell that names its tokens. */
function belt(p: Position, read: StoryRead, mode: z.infer<typeof modeSchema>, tilt: number, liquidity: number | null, orders: Order[] = [], decimals: number | null = null, stable = false): Belt {
  const story = typeof read === "object" ? read : null;
  const line = story ? `"${story.question}" ${sign(story.changePts)} pts → ${story.probabilityPct}% in 24h (${story.venue})` : "";
  const [action, why]: [z.infer<typeof actionSchema>, string] =
    p.verdict === "RED" ? ["EXIT", `Rug risk: ${sentence(p.reasons[0] ?? "")}`]
    : story && story.changePts <= -10 ? ["EXIT", `The story is dying: ${line}.`]
    : story && story.changePts <= -5 ? ["TRIM", `The story is cooling: ${line}.`]
    : mode === "RISK-OFF" && !stable ? ["TRIM", `Macro odds lean risk-off (tilt ${tilt}).`]
    : ["HOLD", story ? `The story is ${story.changePts > 0 ? "heating" : "steady"}: ${line}.`
      : MAJORS[p.mint] ? `Macro ${mode} (tilt ${sign(tilt)}): nothing to sell.`
      : stable ? "A stablecoin: macro odds and stories don't move it; the rug check is the only signal."
      : read === "issuer" ? "An issuer's coin (a tokenized asset): no prediction-market story to read; the rug check is the only signal."
      : read === "unread" ? "Its prediction-market story couldn't be read in time, so a dying story isn't ruled out."
      : read === null ? "No live prediction-market story behind it; the rug check is the only signal."
      : "Story not checked (seatbelt reads stories for the five largest coins); the rug check is the only signal."];
  // Tokens in a take-profit order aren't in the wallet: a sell reaches them only once the order is cancelled and the cancel has landed.
  // An exit cancels every order; a trim only those the half it sells needs, farthest target first. Then the sell names its tokens, since a
  // percent counts only what the wallet holds when ape builds it (it stays a percent when the coin's decimals are unknown).
  const sell = action === "EXIT" ? p.amount : action === "TRIM" ? p.amount / 2 : 0;
  const cancel: Order[] = [];
  for (const o of [...orders].sort((a, b) => (b.targetPriceUsd ?? Infinity) - (a.targetPriceUsd ?? Infinity)))
    if (action === "EXIT" || (action === "TRIM" && p.amount - p.inOrders + cancel.reduce((a, c) => a + c.tokens, 0) < sell * (1 - 1e-6))) cancel.push(o);
  const sellAmount = action !== "HOLD" && p.inOrders > 0 && decimals !== null ? plain(sell, true, decimals) : null;
  const one = cancel.length === 1, whole = cancel.length === orders.length && allInOrders(p);
  return {
    mint: p.mint, symbol: p.symbol, valueUsd: p.valueUsd, verdict: p.verdict, action, sellPercent: { HOLD: 0, TRIM: 50, EXIT: 100 }[action], sellAmount, cancelOrders: cancel.map((o) => o.order),
    // A GREEN or YELLOW coin whose creator couldn't be checked says so: HOLD on an unread check is not a clean bill.
    reasons: [why, ...(p.verdict === "YELLOW" ? [`Seatbelt YELLOW: ${sentence(p.reasons[0] ?? "")}`] : []), ...(p.verdict === "RED" ? [] : p.reasons.filter(caveat)),
      ...(action !== "HOLD" && liquidity !== null && liquidity < 100 ? [`The pool holds only ${usd(liquidity)}, so a sale may hit the price-impact cap; count it as worth about $0.`] : []),
      ...(cancel.length ? [`${whole ? "The whole bag waits" : `${px(cancel.reduce((a, o) => a + o.tokens, 0), 4)} $${p.symbol} wait`} in ${one ? "a take-profit order" : `${cancel.length} take-profit orders`}: cancel ${one ? "it" : "them"} first and let ${one ? "the cancel" : "the cancels"} land (my_orders stops listing ${one ? "it" : "them"}), or the sell can't reach those tokens${action === "TRIM" ? "; my_orders then sets new take-profits for what is left" : ""}.`]
        : action === "TRIM" && p.inOrders > 0 ? ["The half comes out of the wallet: its take-profit orders stay open."] : [])],
    story: story ? { venue: story.venue, question: story.question, probabilityPct: story.probabilityPct, changePts: story.changePts, url: story.url } : null,
  };
}

// ---------- Server ----------

function createServer() {
  const server = new McpServer(
    { name: "oddshot", version: "1.6.3" },
    { supportedProtocolVersions: [PROTOCOL_VERSION] },
  );
  const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true };
  // PayBox rejects any result without structured output, even an error, so failures carry the reason there too
  // and the agent sees "wait about 10 seconds" instead of an opaque protocol error.
  // PayBox also checks error results against the declared output schema, so each research tool's schema allows an `error`
  // field (every other field becomes optional). The tools that propose a transaction keep PayBox's exact proposal schema; their
  // descriptions say where to find the reason when one fails.
  const proposals = new Set(["ape", "take_profit", "cancel_order"]);
  const register = server.registerTool.bind(server);
  server.registerTool = ((name: string, config: any, handler: (...a: any[]) => any) =>
    register(name, proposals.has(name) || !config.outputSchema ? config
      : { ...config, outputSchema: config.outputSchema.partial().extend({ error: z.string().optional().describe("Set only when the call failed: why, and what to do.") }) },
    async (...a: any[]) => {
      let timer: NodeJS.Timeout | undefined;
      try {
        // Every request in the call ends by its deadline; a handler still waiting on something else answers with the reason
        // instead of being cut off by PayBox.
        const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("The sources Oddshot reads were too slow for this call. Try again in a few seconds.")), CALL_MS + 250); });
        return await Promise.race([callEnd.run(Date.now() + CALL_MS, () => handler(...a)), late]);
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        return { content: text(error), structuredContent: { error }, isError: true };
      } finally {
        clearTimeout(timer);
      }
    })) as typeof server.registerTool;

  server.registerTool(
    "oddshot_play",
    {
      title: "Oddshot board: odds moves → meme plays",
      description: "The one-shot Oddshot play. Takes the biggest prediction-market odds swings on Polymarket and Kalshi, finds the Solana memecoin riding each story (the OG of its swarm, never a copycat), runs the seatbelt (DexScreener + RugCheck + Jupiter audit), and labels the timing: EARLY (the odds moved but the meme hasn't yet), RUNNING, LATE (already priced in) or FADING. A story repricing on both venues is marked BOTH MARKETS and ranks higher. Returns plays ranked best first. Pass a play's mint to ape to act on it. Pass focus to build the board from one sector or keyword only.",
      inputSchema: z.object({
        window: z.enum(["1h", "24h"]).default("24h").describe("Look-back window for the odds change."),
        stories: z.number().int().min(1).max(4).default(3).describe("How many distinct odds stories to turn into plays."),
        minLiquidityUsd: z.number().min(0).max(1e9).default(10000),
        minVolume24hUsd: z.number().min(0).max(1e9).default(5000),
        focus: FOCUS,
      }).strict(),
      outputSchema: z.object({ window: z.enum(["1h", "24h"]), focus: z.string().nullable(), plays: z.array(playSchema) }),
      annotations: read,
    },
    async ({ window, stories, minLiquidityUsd, minVolume24hUsd, focus }) => {
      // Each story gets up to two keywords nobody else claimed; every keyword is searched in parallel.
      const used = new Set<string>();
      const picked: { keys: string[]; mover: Mover }[] = [];
      const sector = focus ? focusOf(focus) : null;
      const [all, trend] = await Promise.all([fetchMovers(window, sector ? 60 : 20, 5000, 3500), geckoTrending("1h", 1, 3000).catch(() => [] as Hot[])]);
      const movers = sector ? all.filter((m) => inFocus(sector, m.question, ...m.narrativeKeywords)) : all;
      const hot = new Set(trend.map((h) => h.t.mint));
      // A mover that shares a subject with a story already picked is that story again from another market ("Likud wins the most seats",
      // "Which bloc wins", "Netanyahu gets the mandate" are all Israel's election): the same memes ride it, so it would only take a slot
      // from a different story. Subjects match whole, or as one word of a longer one ("Benjamin Netanyahu" and "Netanyahu").
      const topics = new Set<string>();
      const sameTopic = (k: string) => [...topics].some((u) => u === k || u.split(" ").includes(k) || k.split(" ").includes(u));
      for (const mover of movers) {
        const words = mover.narrativeKeywords.map((k) => k.toLowerCase());
        if (words.some(sameTopic)) continue;
        const keys = mover.narrativeKeywords.filter((k) => !used.has(k.toLowerCase())).slice(0, 2);
        if (!keys.length) continue;
        keys.forEach((k) => used.add(k.toLowerCase()));
        words.forEach((w) => topics.add(w));
        picked.push({ keys, mover });
        if (used.size >= 16) break;
      }
      const results = new Map(await Promise.all([...new Set(picked.flatMap((p) => p.keys))].map(async (k) =>
        [k, await searchNarrative(k, minLiquidityUsd, minVolume24hUsd, 2500).catch((): Group => ({ cands: [], all: [] }))] as const)));
      const found = picked.map(({ keys, mover }) => {
        const seen = new Set<string>();
        const seenAll = new Set<string>();
        const cands = keys.flatMap((k) => (results.get(k)?.cands ?? []).map((c) => ({ ...c, k })))
          .sort((a, b) => b.m - a.m)
          .filter((c) => !seen.has(c.t.mint) && seen.add(c.t.mint));
        const all = keys.flatMap((k) => results.get(k)?.all ?? []).filter((t) => !seenAll.has(t.mint) && seenAll.add(t.mint));
        const narrative = cands[0]?.k ?? keys[0]!;
        return { narrative, keys: [narrative, ...keys.filter((k) => k !== narrative)], mover, group: { cands, all } };
      });
      // Cluster and safety-check up to six meme-carrying stories while the other venue is checked for each; keep the best plays.
      // Stories without memes fill any gap.
      const withMemes = found.filter((f) => f.group.cands.length).slice(0, 6);
      const [scored, others] = await Promise.all([
        scoreGroups(withMemes.map((f) => f.group), 2, 2500),
        Promise.all(withMemes.map((f) => otherMarket(f.mover, f.keys, all))),
      ]);
      const plays = [
        ...withMemes.map((f, i) => toPlay(f.narrative, f.mover, scored[i]?.picks ?? [], window, scored[i]?.cluster ?? clusterOf(f.group.all, new Map()).cluster, hot, others[i]))
          .sort((a, b) => b.playScore - a.playScore),
        ...found.filter((f) => !f.group.cands.length).map((f) => toPlay(f.narrative, f.mover, [], window, clusterOf(f.group.all, new Map()).cluster, hot)),
      ].slice(0, stories);
      const body = plays.length
        ? plays.map((p, i) => `${i + 1}. ${p.timing}${p.token ? ` ${light(p.token.verdict)} $${p.token.symbol}${p.cluster.size > 1 ? ` [${p.token.role} of ${p.cluster.size}]` : ""} ← "${p.narrative}" · play ${p.playScore}${p.otherMarket ? " · ✅ BOTH MARKETS" : ""}${p.trending ? " · 🔥 trending on-chain" : ""}` : ""}\n   ${p.thesis}${p.token ? `\n   mint ${p.token.mint}` : ""}`).join("\n")
        : `No qualifying odds moves${sector ? ` in ${sector.label}` : ""} right now.`;
      return {
        content: text(`🎯 ODDSHOT BOARD: ${window} odds moves → memes${sector ? ` · focus ${sector.label}` : ""}\n${body}${plays.some((p) => p.token) ? "\nNext: check_token for the full seatbelt report, or ape with a mint and an amount. PayBox asks you to approve." : ""}`),
        structuredContent: { window, focus: sector?.label ?? null, plays },
      };
    },
  );

  server.registerTool(
    "hot_narratives",
    {
      title: "Hot narratives radar",
      description: "Radar for the stories the market is trading right now. Pulls trending Solana pools, clusters them into narratives (names, tickers and the token they are paired against), matches each narrative to the Polymarket or Kalshi market that names it, and labels it BOTH CROWDS (on-chain traders and prediction markets heating together, the strongest signal) or ON-CHAIN ONLY. Each narrative's lead token gets a seatbelt verdict. Follow up with narrative_tokens for the full swarm. Pass focus to track one sector (stocks, ai, politics, sports, gaming, crypto, celebrities) or one keyword.",
      inputSchema: z.object({
        window: z.enum(["5m", "1h", "6h", "24h"]).default("1h").describe("Trending window for on-chain heat."),
        limit: z.number().int().min(1).max(8).default(5),
        focus: FOCUS,
      }).strict(),
      outputSchema: z.object({ window: z.string(), focus: z.string().nullable(), narratives: z.array(narrativeSchema) }),
      annotations: read,
    },
    async ({ window, limit, focus }) => {
      const sector = focus ? focusOf(focus) : null;
      // A focused radar reads a third page of trending pools, since one sector is a thin slice of them.
      const hot = await geckoTrending(window, sector ? 3 : 2, 3500);
      const byWord = new Map<string, Hot[]>();
      for (const h of hot) for (const w of narrativeWords(h)) byWord.set(w, [...(byWord.get(w) ?? []), h]);
      const ranked = [...byWord.entries()]
        .map(([w, hs]) => ({ w, hs, score: hs.reduce((a, h) => a + Math.log10(h.vol1h + 10), 0) + 2 * (hs.length - 1) }))
        .sort((a, b) => b.score - a.score);
      // Greedy: each pool belongs to its strongest story; keep up to eight candidate stories, each led by its biggest unclaimed pool.
      // With a focus, a story counts when its own word is in the sector or one of its unclaimed pools is, and such a pool leads it.
      const used = new Set<string>();
      const stories: { w: string; hs: Hot[]; score: number; lead: Hot }[] = [];
      for (const r of ranked) {
        const fresh = r.hs.filter((h) => !used.has(h.t.mint));
        const fit = !sector || inFocus(sector, r.w, STORY_NAME[r.w]) ? fresh : fresh.filter((h) => inFocus(sector, h.t.symbol, h.t.name));
        if (!fit.length) continue;
        r.hs.forEach((h) => used.add(h.t.mint));
        stories.push({ ...r, lead: [...fit].sort((a, b) => b.vol1h - a.vol1h)[0]! });
        if (stories.length === 8) break;
      }
      const [crowds, jup] = await Promise.all([
        Promise.all(stories.map((x) => crowdAnywhere(STORY_NAME[x.w] ?? x.w, 3000))),
        jupTokens(stories.map((x) => x.lead.t.mint), 3000),
      ]);
      const narratives = stories
        .map((x, i) => {
          const lead = x.lead;
          const vol = x.hs.reduce((a, h) => a + h.vol1h, 0);
          const crowd = crowds[i] ?? null;
          const symbolHit = x.hs.find((h) => h.t.symbol.toLowerCase() === x.w);
          return {
            narrative: STORY_NAME[x.w] ?? (symbolHit ? symbolHit.t.symbol : x.w.length <= 4 ? x.w.toUpperCase() : x.w[0]!.toUpperCase() + x.w.slice(1)),
            signal: crowd ? "BOTH CROWDS" as const : "ON-CHAIN ONLY" as const,
            heat: Math.round(x.score + (crowd ? 5 + Math.min(Math.abs(crowd.changePts), 30) / 3 : 0)),
            pools: x.hs.length, symbols: x.hs.map((h) => h.t.symbol).slice(0, 6), volume1hUsd: Math.round(vol),
            change1hPct: vol > 0 ? round(x.hs.reduce((a, h) => a + (h.t.change1hPct ?? 0) * h.vol1h, 0) / vol, 1) : null,
            leader: { ...lead.t, ...safety(lead.t, null, jup.get(lead.t.mint), "GeckoTerminal") },
            crowd,
          };
        })
        // One trending pool is a story too once the user has picked the sector.
        .filter((x) => x.pools >= 2 || x.crowd || sector)
        .sort((a, b) => b.heat - a.heat)
        .slice(0, limit);
      const body = narratives.length
        ? narratives.map((x, i) => `${i + 1}. ${x.signal === "BOTH CROWDS" ? "🔥🔥" : "🔥"} "${x.narrative}" · ${x.signal} · ${x.pools} pool${x.pools > 1 ? "s" : ""} · ${usd(x.volume1hUsd)} vol 1h · ${pct(x.change1hPct)}` +
          `\n   chain: ${light(x.leader.verdict)} $${x.leader.symbol} leads (${pct(x.leader.change1hPct)} 1h, liq ${usd(x.leader.liquidityUsd)})${x.symbols.some((s) => s !== x.leader.symbol) ? ` · also ${[...new Set(x.symbols.filter((s) => s !== x.leader.symbol))].slice(0, 3).map((s) => `$${s}`).join(", ")}` : ""}` +
          (x.crowd ? `\n   crowd: ${moverLine(x.crowd)}` : "") + `\n   mint ${x.leader.mint}`).join("\n")
        : `No clustered ${sector ? `${sector.label} ` : ""}narratives in the ${window} trending set right now.${window === "24h" ? "" : ` Try window "${window === "6h" ? "24h" : "6h"}" for a wider net.`}`;
      return {
        content: text(`📡 HOT NARRATIVES (${window} on-chain × prediction markets${sector ? `, focus ${sector.label}` : ""})\n${body}\nNext: narrative_tokens to map a story's full swarm and its OG, or check_token for the full seatbelt.`),
        structuredContent: { window, focus: sector?.label ?? null, narratives },
      };
    },
  );

  server.registerTool(
    "odds_movers",
    {
      title: "Prediction-market odds movers",
      description: "Lists the Polymarket and Kalshi markets whose odds swung hardest recently, skipping sports, weather, recurring and price-ladder markets so you get the stories memecoins form around (politics, culture, tech, celebrities, crypto events). Each mover names its venue and includes narrativeKeywords to pass to narrative_tokens. Pass focus to keep one sector or keyword. Sports markets stay skipped, so a sports focus is for the radar.",
      inputSchema: z.object({
        window: z.enum(["1h", "24h"]).default("24h").describe("Look-back window for the odds change. Kalshi joins on 24h only: it publishes 24h changes."),
        limit: z.number().int().min(1).max(10).default(6),
        minVolume24hUsd: z.number().min(0).max(1e9).default(5000).describe("Ignore thin markets below this 24h volume."),
        focus: FOCUS,
      }).strict(),
      outputSchema: z.object({ window: z.enum(["1h", "24h"]), focus: z.string().nullable(), movers: z.array(moverSchema) }),
      annotations: read,
    },
    async ({ window, limit, minVolume24hUsd, focus }) => {
      const sector = focus ? focusOf(focus) : null;
      // A focused feed filters a wider list, so a quiet sector still fills its rows.
      const movers = (await fetchMovers(window, sector ? 60 : limit, minVolume24hUsd)).filter((m) => !sector || inFocus(sector, m.question, ...m.narrativeKeywords)).slice(0, limit);
      const body = movers.length
        ? movers.map((m, i) => `${i + 1}. ${moverLine(m)}\n   keywords: ${m.narrativeKeywords.join(", ")}`).join("\n")
        : `No qualifying odds moves${sector ? ` in ${sector.label}` : ""} right now.`;
      return {
        content: text(`Biggest prediction-market odds moves (${window}, ${window === "24h" ? "Polymarket + Kalshi" : "Polymarket"}${sector ? `, focus ${sector.label}` : ""}):\n${body}\nNext: narrative_tokens with a keyword, or oddshot_play for the full board.`),
        structuredContent: { window, focus: sector?.label ?? null, movers },
      };
    },
  );

  server.registerTool(
    "narrative_tokens",
    {
      title: "Memecoins riding a narrative",
      description: "Maps the swarm of Solana tokens riding a narrative (e.g. a keyword from odds_movers). Crowns the OG by liquidity depth, age, volume, holders, organic flow and verification; tags newer, thinner clones as COPYCAT; flags copycat frenzies; ranks the rest by Oddshot score and runs the seatbelt on each: GREEN, YELLOW or RED.",
      inputSchema: z.object({
        narrative: z.string().trim().min(2).max(60).describe("Keyword or phrase, e.g. 'Trump' or 'Tesla'."),
        limit: z.number().int().min(1).max(8).default(5),
        minLiquidityUsd: z.number().min(0).max(1e9).default(10000),
        minVolume24hUsd: z.number().min(0).max(1e9).default(5000).describe("Skips dead or fake-liquidity tokens."),
      }).strict(),
      outputSchema: z.object({ narrative: z.string(), cluster: clusterSchema, tokens: z.array(scoredSchema) }),
      annotations: read,
    },
    async ({ narrative, limit, minLiquidityUsd, minVolume24hUsd }) => {
      const { picks: tokens, cluster } = (await scoreGroups([await searchNarrative(narrative, minLiquidityUsd, minVolume24hUsd)], limit))[0]!;
      const head = cluster.size > 1
        ? `${cluster.size} tokens riding "${narrative}" · OG ${cluster.og ? `$${cluster.og}` : "?"} · ${cluster.copycats} copycat${cluster.copycats === 1 ? "" : "s"} · ${cluster.launched24h} launched in 24h${cluster.launched24h >= 5 ? " (copycat frenzy)" : ""}`
        : `Solana tokens riding "${narrative}":`;
      const body = tokens.length
        ? tokens.map((t, i) => `${i + 1}. ${light(t.verdict)} [${t.role}] $${t.symbol} (${t.name}) score ${t.oddshotScore}/100 · 1h ${pct(t.change1hPct)} · 24h ${pct(t.change24hPct)} · vol ${usd(t.volume24hUsd)} · liq ${usd(t.liquidityUsd)}\n   mint ${t.mint}${t.verdict === "GREEN" ? "" : `\n   ⚠ ${t.reasons.slice(0, 2).join("; ")}`}`).join("\n")
        : cluster.size > 0
          ? `All ${cluster.size} are thin launches below the floor ($${minLiquidityUsd.toLocaleString("en-US")} liquidity, $${minVolume24hUsd.toLocaleString("en-US")} 24h volume), so none is a pick. Lower the floor only if you accept the risk.`
          : "No Solana tokens are riding this narrative yet. That can be the early signal, or a dead end.";
      return {
        content: text(`${head}\n${body}${tokens.length ? "\nNext: check_token for detail, or ape with a mint and amount." : ""}`),
        structuredContent: { narrative, cluster, tokens },
      };
    },
  );

  server.registerTool(
    "check_token",
    {
      title: "Seatbelt check",
      description: "Full seatbelt report for any Solana token mint. Cross-checks live market data (liquidity, age, price action), RugCheck (LP lock, insider and holder risks), Jupiter's audit (mint/freeze authority, top-holder share, suspicious flag, serial-deployer history, organic volume) the mint itself (a Token-2022 transfer fee, and whether its creator can raise it) and the creator's wallet (what it bought at launch, sold, and holds now). Returns GREEN, YELLOW or RED with every reason; three warnings stack to RED. RED on its own: a pool under an hour old with an organic score of 0, a creator selling in the last hour, a creator holding 30% or more of supply, or a hidden bag (the creator bought big at launch, never sold, and its wallet holds none of it).",
      inputSchema: z.object({ mint: address }).strict(),
      outputSchema: z.object({ token: tokenSchema.nullable(), organicScore: num, holderCount: num, sizeFor1pctUsd: num, creator: creatorSchema.nullable(), ...safetyShape }),
      annotations: read,
    },
    async ({ mint }) => {
      // The creator check starts once Jupiter (the creator's wallet) and DexScreener (the pool) answer, alongside RugCheck and the mint read.
      const jupP = jupTokens([mint]), pairsP = pairsByMint(mint);
      const creatorP = Promise.all([jupP, pairsP]).then(([jup, pairs]) => creatorOf(mint, jup.get(mint), poolOf(mint, jup.get(mint), pairs[0]?.pairAddress),
        { deadline: Math.max(800, Math.min(4500, callLeft() - 300)) }));
      const [pairs, rc, jup, minted, creator] = await Promise.all([pairsP, rugcheck(mint), jupP, readMint(mint), creatorP]);
      const j = jup.get(mint);
      const dex = pairs[0] && !SECURITY.test(String(pairs[0].baseToken?.name ?? "")) ? toToken(pairs[0]) : null;
      const token = dex ?? (j ? fromJupiter(j) : null);
      const s = safety(token, rc, j, dex ? "DexScreener" : "Jupiter", undefined, minted ? minted.fee : "unread", creator);
      const name = token ? `$${token.symbol} (${token.name})` : mint;
      const organicScore = round(n(j?.organicScore), 0);
      // In a constant-product pool, a buy moves price by roughly its size over the pool's one-sided depth: ~0.5% of total liquidity ≈ 1% impact.
      const sizeFor1pctUsd = token?.liquidityUsd ? Math.round(token.liquidityUsd * 0.005) : null;
      return {
        content: text(`${light(s.verdict)} ${s.verdict}: ${name}\n- ${s.reasons.join("\n- ")}${token ? `\nLiquidity ${usd(token.liquidityUsd)} · 24h ${pct(token.change24hPct)} · LP locked ${s.lpLockedPct ?? "?"}% · organic ${organicScore ?? "?"}/100` : ""}${sizeFor1pctUsd ? `\n📏 Pool depth: buys under ~${usd(sizeFor1pctUsd)} move this pool about 1%; ape shows the actual route's impact before you approve.` : ""}${creator ? `\n${creatorLine(creator)}` : ""}\n🛡 Checked: ${s.sources.join(" · ")}`),
        structuredContent: { token, organicScore, holderCount: n(j?.holderCount), sizeFor1pctUsd, creator: creatorSummary(creator), ...s },
      };
    },
  );

  server.registerTool(
    "rug_autopsy",
    {
      title: "Rug autopsy: what happened to this coin",
      description: "Forensics for a coin that crashed, built from on-chain trades and minute prices: the creator wallet and what it bought, sold and still holds; the crash, which is the stretch of one to three minutes where the price fell furthest and stayed down (its biggest sell, the price and the pool's liquidity before and after, and everyone else selling then); the biggest sellers; and the swarm in the minute before (trades, buying wallets, the typical real buy, trades worth $0.00). Ends with a verdict: CREATOR DUMP, WHALE DUMP, LIQUIDITY PULLED, SLOW BLEED or NO CRASH FOUND (or CAUSE UNKNOWN for a crash older than the day of trades on record that the creator didn't cause). A pull is liquidity that left the pool before the crash. Minute prices cover the pool's last 16 hours or so and trade detail its last 24; the creator's own trades go back to launch (Jupiter's records start in June 2024), so a creator dump shows at any age. Times are UTC.",
      inputSchema: z.object({ mint: address }).strict(),
      outputSchema: z.object({
        token: z.object({ mint: z.string(), symbol: z.string(), name: z.string() }), pool: z.string(),
        verdict: z.enum(["CREATOR DUMP", "WHALE DUMP", "LIQUIDITY PULLED", "CAUSE UNKNOWN", "SLOW BLEED", "NO CRASH FOUND"]), summary: z.string(),
        creator: creatorSchema.nullable(),
        crash: crashShape.nullable(),
        sellers: z.array(z.object({ wallet: z.string(), usd: z.number(), sharePct: z.number(), creator: z.boolean() })),
        swarm: z.object({ trades: z.number(), buys: z.number(), buyerWallets: z.number(), zeroDollarTrades: z.number(), medianBuyUsd: num }).nullable(),
        swarmNote: z.string().nullable(),
      }),
      annotations: read,
    },
    async ({ mint }) => {
      // One budget for the whole call, under PayBox's 10 s: each request gets what is left, and nothing once it is spent, so a slow
      // source ends in a "try again" instead of the host timing the call out.
      const t0 = Date.now(), left = (cap: number) => Math.max(0, Math.min(cap, 4800 - (Date.now() - t0)));
      // Jupiter's record names the creator, so a failed lookup is an error rather than "no creator": without it no verdict rules out a creator dump.
      const [found, pairs] = await Promise.all([getJson(`${JUP}/tokens/v2/search?query=${mint}`, left(3000)).catch((e: Error) => e), pairsByMint(mint, left(3000))]);
      if (found instanceof Error) throw found;
      const j = (Array.isArray(found) ? found : []).find((t: any) => t?.id === mint);
      const pools = [...new Set([j?.graduatedPool, pairs[0]?.pairAddress, pairs[1]?.pairAddress, j?.firstPool?.id !== mint ? j?.firstPool?.id : null]
        .filter((p): p is string => typeof p === "string" && p !== ""))];
      if (!pools.length) throw new Error("No trading pool found for this mint.");
      const symbol = sym(j?.symbol ?? pairs[0]?.baseToken?.symbol ?? short(mint)), name = String(j?.name ?? pairs[0]?.baseToken?.name ?? "");
      const supply = n(j?.totalSupply) ?? n(j?.circSupply);
      const rows = (r: any) => (r?.data ?? []).map((d: any) => d?.attributes).filter(Boolean) as any[];
      const busy = () => new Error("GeckoTerminal is rate-limiting trade data. Wait about a minute and try again.");
      // Minute candles in the coin's own price (token=), since a pool can list the coin as its quote; oldest first.
      const minutes = (p: string, range: string) => getJson(`${GECKO}/pools/${p}/ohlcv/minute?aggregate=1&${range}&currency=usd&token=${mint}`, left(4000))
        .then((r) => ((r?.data?.attributes?.ohlcv_list ?? []) as unknown[][]).map((c) => c.map(Number)).filter((c) => c.length >= 5 && c.every(Number.isFinite)).sort((a, b) => a[0]! - b[0]!));
      const unpriced = (e: Error) => /rate-limiting/.test(e.message) ? busy() : new Error(`GeckoTerminal didn't return the pool's prices (${e.message.replace(/\.$/, "")}). Try again in a minute.`);
      // GeckoTerminal gives a pool's trades over $50 across its last day (who traded), its last 300 trades (the swarm), and its last 1,000
      // minutes of prices (the crash). A pool it doesn't track answers 404 and the next is tried.
      const tradesP = (async () => {
        for (const p of pools) {
          const [big, last, candles] = await Promise.all([
            getJson(`${GECKO}/pools/${p}/trades?trade_volume_in_usd_greater_than=50`, left(4000)).then(rows).catch((e: Error) => e),
            getJson(`${GECKO}/pools/${p}/trades`, left(4000)).then(rows).catch(() => null),
            minutes(p, "limit=1000").catch((e: Error) => e),
          ]);
          if (big instanceof Error) { if (/HTTP 404/.test(big.message)) continue; throw /rate-limiting/.test(big.message) ? busy() : big; }
          if (candles instanceof Error) throw unpriced(candles);
          return { pool: p, big, last, candles };
        }
        throw new Error("GeckoTerminal doesn't track this coin's pools, so its trades can't be read.");
      })();

      type Trade = { wallet: string; usd: number; tokens: number; at: number; tx: string; quote: string | null; sell: boolean };
      const tradeOf = (a: any): Trade | null => {
        const side = coinSide(a, mint);
        return side ? { wallet: String(a.tx_from_address ?? ""), usd: n(a.volume_in_usd) ?? 0, tokens: side.tokens, at: Date.parse(String(a.block_timestamp)),
          tx: String(a.tx_hash ?? ""), quote: side.sell ? a.to_token_address ?? null : a.from_token_address ?? null, sell: side.sell } : null;
      };
      const tradesOf = (xs: any[]) => xs.map(tradeOf).filter((t): t is Trade => t !== null);
      const sum = (xs: Trade[]) => xs.reduce((a, s) => a + s.usd, 0);
      const biggest = (xs: Trade[]) => xs.reduce<Trade | null>((b, s) => (s.usd > (b?.usd ?? 0) ? s : b), null);
      // The crash: a stretch of one to three consecutive minutes whose price fell by half or more (GeckoTerminal opens a minute at the
      // last close, even across quiet minutes) and stayed down, ten minutes on still under 60% of where it began. Of those, the one that
      // wiped out the most value (dust trades after a rug can halve a dead price while wiping out next to nothing), and the tightest
      // stretch when a shorter one holds nearly all of that fall.
      type Span = { at: number; end: number; before: number; after: number };
      const falls = (cs: number[][]): Span[] => cs.flatMap((c, i) => {
        // Every length that qualifies from this start is a candidate: worst() weighs a longer one that holds far more of the fall.
        const out: Span[] = [];
        for (let k = i; k < Math.min(cs.length, i + 3) && cs[k]![0]! - c[0]! <= 120; k++) {
          const d = cs[k]!, later = cs.filter((x) => x[0]! > d[0]! && x[0]! <= d[0]! + 600).at(-1)?.[4] ?? d[4]!;
          if (d[4]! <= 0.5 * c[1]! && Math.max(d[4]!, later) <= 0.6 * c[1]!) out.push({ at: c[0]! * 1000, end: d[0]! * 1000 + 60_000, before: c[1]!, after: d[4]! });
        }
        return out;
      });
      const lost = (s: Span) => s.before - s.after;
      const worst = (ss: Span[]) => {
        const best = ss.reduce<Span | null>((w, s) => (lost(s) > (w ? lost(w) : 0) ? s : w), null);
        return best && (ss.filter((s) => s.end - s.at < best.end - best.at && lost(s) >= 0.9 * lost(best)).sort((a, b) => a.end - a.at - (b.end - b.at))[0] ?? best);
      };
      const inSpan = (xs: Trade[], s: Span) => xs.filter((t) => t.at >= s.at && t.at < s.end);
      // The pool before a crash, from the window's earliest trade over $50 and its latest at least two minutes before the crash.
      const refsFor = (bigTrades: Trade[], s: Span) => {
        const before = bigTrades.filter((t) => t.at < s.at - 120_000).sort((a, b) => a.at - b.at);
        return [...new Set([before[0], before.at(-1)].filter((t): t is Trade => !!t))];
      };
      // Transactions are read once each, with one retry when there is time for it.
      const txs = new Map<string, Promise<any>>();
      const readTx = (sig: string) => {
        if (!txs.has(sig)) {
          const get = () => rpc("getTransaction", [sig, { encoding: "jsonParsed", maxSupportedTransactionVersion: 1, commitment: "confirmed" }], left(3000))
            .then((r) => r ?? Promise.reject(new Error("no transaction")));
          txs.set(sig, get().catch(() => (left(3000) < 1500 ? null : new Promise((r) => setTimeout(r, 700)).then(get))).catch(() => null));
        }
        return txs.get(sig)!;
      };
      // The stretch's last sell: a pull later in the stretch, after its biggest sell, shows in the reserves it leaves behind.
      const latest = (xs: Trade[]) => xs.reduce<Trade | null>((l, s) => (s.at > (l?.at ?? 0) ? s : l), null);
      // As soon as the pool's trades are in, the likely crash's transactions start loading while the creator's record is read.
      tradesP.then((t) => {
        const bigTrades = tradesOf(t.big), m0 = worst(falls(t.candles));
        if (!m0) return;
        const sells0 = inSpan(bigTrades.filter((x) => x.sell), m0);
        for (const x of [biggest(sells0), latest(sells0), ...refsFor(bigTrades, m0)]) if (x) readTx(x.tx);
      }).catch(() => {});
      // The creator's whole history comes from Jupiter's data API (when that fails, from the pool's rows above rather than another
      // call), with time held back for the steps after it.
      const creatorDeadline = Math.max(1200, left(6500) - 1600);
      const [{ pool, big, last, candles }, creator] = await Promise.all([
        tradesP,
        creatorOf(mint, j, null, { full: true, ms: Math.min(left(5000), creatorDeadline - 300), deadline: creatorDeadline,
          gecko: () => tradesP.then((t) => ({ rows: t.big, pool: t.pool, since: spanOf(t.big), minUsd: 50 })) }),
      ]);
      const bigTrades = tradesOf(big), gtSells = bigTrades.filter((t) => t.sell);
      // The creator's history reaches past the last day, so its sells count even when the pool's trades no longer show them. For a sell
      // both sources have, GeckoTerminal's price wins: it is the documented feed, and the one the published receipts use.
      const creatorSells: Trade[] = (creator?.trades ?? []).filter((t) => t.side === "sell" && !gtSells.some((s) => s.tx === t.tx))
        .map((t) => ({ wallet: creator!.wallet, usd: t.usd, tokens: t.tokens, at: t.at, tx: t.tx, quote: null, sell: true }));
      const sells = [...gtSells, ...creatorSells];
      const isCreator = (w: string) => w === creator?.wallet;
      const byCreator = sells.filter((s) => isCreator(s.wallet));
      // Inside the pool's day of trades the creator caused a crash when its selling then was real ($50 or more) and most of it: half
      // the dollars sold, or half the tokens (a dump of most of the supply can fetch fewer dollars than the sells before it).
      const creatorPart = (xs: Trade[]) => { const c = xs.filter((s) => isCreator(s.wallet)); return { usd: sum(c), tokens: c.reduce((a, s) => a + s.tokens, 0) }; };
      const creatorCaused = (xs: Trade[]) => { const c = creatorPart(xs); return c.usd >= 50 && (c.usd >= sum(xs) / 2 || c.tokens >= xs.reduce((a, s) => a + s.tokens, 0) / 2); };
      // The creator's sells near a time: a sell alone under $50 can't be a creator dump, so it isn't worth a read.
      const creatorNear = (s: Trade) => sum(byCreator.filter((x) => Math.abs(x.at - s.at) <= 180_000));
      // Shares compare like with like: every wallet's sells over the window GeckoTerminal covers (a day, or less when the pool made more
      // than 300 trades over $50). The creator's older sells stay on its own line.
      const tradeFrom = spanOf(big), recent = sells.filter((s) => s.at >= tradeFrom), recentTotal = sum(recent), creatorRecent = sum(recent.filter((s) => isCreator(s.wallet)));
      const byWallet = new Map<string, number>();
      for (const s of recent) byWallet.set(s.wallet, (byWallet.get(s.wallet) ?? 0) + s.usd);
      const sellers = [...byWallet.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([wallet, v]) => ({ wallet, usd: round(v, 2)!, sharePct: round(recentTotal ? (v / recentTotal) * 100 : 0, 1)!, creator: isCreator(wallet) }));

      let m = worst(falls(candles));
      // Sells from before the candles begin get their own minutes read: the biggest in dollars, and the creator's biggest share of supply
      // (a dump of most of the supply can fetch fewer dollars than an earlier sell at the top).
      const begin = candles.length ? candles[0]![0]! * 1000 : Date.now();
      const older = sells.filter((s) => s.at < begin);
      const olds = [...new Map([biggest(older), older.filter((s) => isCreator(s.wallet)).reduce<Trade | null>((b, s) => (s.tokens > (b?.tokens ?? 0) ? s : b), null)]
        .filter((s): s is Trade => !!s && (isCreator(s.wallet) ? creatorNear(s) >= 50 : !m || s.usd > sum(inSpan(sells, m))))
        .map((s) => [Math.floor(s.at / 60_000), s] as const)).values()];
      let unpricedOld: Trade | null = null, pricedOld = 0;
      for (const [o, cs] of (await Promise.all(olds.map(async (o) => [o, await minutes(pool, `before_timestamp=${Math.floor(o.at / 60_000) * 60 + 720}&limit=14`).catch((e: Error) => e)] as const)))) {
        if (cs instanceof Error) throw unpriced(cs);
        const minute = Math.floor(o.at / 60_000) * 60_000;
        if (!cs.some((c) => c[0]! * 1000 === minute)) { if (isCreator(o.wallet)) unpricedOld = o; continue; }
        pricedOld++;
        const span = worst(falls(cs).filter((s) => s.at <= minute && s.end > minute));
        if (span && (!m || lost(span) > lost(m))) m = span;
      }

      let crash: z.infer<typeof crashShape> | null = null, spanSells: Trade[] = [], creatorDump = false, creatorImpact: "small" | "unread" | null = null;
      let swarm: { trades: number; buys: number; buyerWallets: number; zeroDollarTrades: number; medianBuyUsd: number | null } | null = null;
      let swarmNote: string | null = null, pulled = false, liquidityLeft: number | null = null;
      let pullCheck: "done" | "concentrated" | "curve" | "no-reference" | "unreadable" = "unreadable";
      const pair = pairs.find((p) => p.pairAddress === pool);
      // Concentrated pools (CLMM, DLMM, Whirlpool, DAMM v2) hold tokens away from the price, so their two sides are valued as they
      // stand, and their reserves can't show a pull: crossing a range empties one side without any liquidity leaving.
      const concentrated = /orca/i.test(String(pair?.dexId ?? "")) || (pair?.labels ?? []).some((l: unknown) => /CLMM|DLMM|DYN2|whirlpool/i.test(String(l)));
      // A launchpad's bonding curve (pump.fun, Meteora's DBC, Raydium's LaunchLab, Moonshot) has no liquidity anyone could pull, and its
      // real reserves don't keep the constant product its virtual ones do, so neither the pull test nor a sell's price impact reads on it.
      // A pool DexScreener doesn't list is the curve when Jupiter has the coin on a launchpad it hasn't left.
      const curve = /^(pumpfun|meteoradbc|launchlab|moonshot)$/i.test(String(pair?.dexId ?? "")) || (!pair && !!j?.launchpad && !j?.graduatedPool);
      if (m) {
        const span = m;
        // Sells under $50 show only in the last 300 trades.
        const small = tradesOf(last ?? []).filter((s) => s.sell && s.at >= span.at && s.at < span.end && !sells.some((x) => x.tx === s.tx));
        spanSells = [...inSpan(sells, span), ...small];
        const top = biggest(spanSells), end = latest(spanSells);
        const refs = curve || concentrated ? [] : refsFor(bigTrades, span);
        const [tx, endTx, ...refTxs] = await Promise.all([top ? readTx(top.tx) : null, end && end !== top && !curve && !concentrated ? readTx(end.tx) : null,
          ...refs.map((r) => readTx(r.tx))]);
        // A trade's pool side: the coin account that moved most (not the trader's) and, under the same owner (the pool, or its AMM's
        // authority), the quote account that moved the other way.
        const sideOf = (t: any, x: Trade) => {
          const pre = new Map<number, any>((t?.meta?.preTokenBalances ?? []).map((b: any) => [b.accountIndex, b]));
          const post = new Map<number, any>((t?.meta?.postTokenBalances ?? []).map((b: any) => [b.accountIndex, b]));
          const keys = t?.transaction?.message?.accountKeys ?? [];
          const amount = (at: Map<number, any>, i: number) => n(at.get(i)?.uiTokenAmount?.uiAmount) ?? 0;
          const info = (i: number) => post.get(i) ?? pre.get(i);
          const delta = (i: number) => amount(post, i) - amount(pre, i);
          const accounts = [...new Set([...pre.keys(), ...post.keys()])];
          const vault = accounts.filter((i) => info(i)?.mint === mint && info(i)?.owner !== x.wallet && delta(i) !== 0).sort((a, b) => Math.abs(delta(b)) - Math.abs(delta(a)))[0];
          const owner = vault === undefined ? null : info(vault)?.owner;
          const quote = owner ? accounts.filter((i) => info(i)?.owner === owner && info(i)?.mint !== mint && (!x.quote || info(i)?.mint === x.quote)
            && Math.sign(delta(i)) === -Math.sign(delta(vault!))).sort((a, b) => Math.abs(delta(b)) - Math.abs(delta(a)))[0] : undefined;
          if (vault === undefined || quote === undefined) return null;
          const key = (i: number) => { const k = keys[i]; return String(typeof k === "string" ? k : k?.pubkey ?? i); };
          return { pool: key(vault), quoteUsd: x.usd / Math.abs(delta(quote)), qPre: amount(pre, quote), qPost: amount(post, quote), cPre: amount(pre, vault), cPost: amount(post, vault) };
        };
        const now = tx && top ? sideOf(tx, top) : null;
        // Inside the pool's day of trades every sell over $50 is on record, so the creator's share of the selling decides. Before it only
        // the creator's own sells are, so its transaction has to show it moved the price: a constant-product sell that takes the pool's
        // coins from c to c' leaves (c / c')² of the price, and the creator caused the crash when that alone is half the fall or more
        // (in log terms).
        if (span.at >= tradeFrom) creatorDump = creatorCaused(spanSells);
        else {
          // Every creator sell in the stretch counts, biggest or not: a dump in pieces moves the price as much as one sell of its size.
          // Six transactions at most, each read once: one transaction can list as two trades (a route split in two), and it moved the
          // price once.
          const theirs = spanSells.filter((x) => isCreator(x.wallet)), byTx = new Map<string, Trade>();
          for (const x of [...theirs].sort((a, b) => b.usd - a.usd)) if (!byTx.has(x.tx)) byTx.set(x.tx, x);
          const mine = [...byTx.values()].slice(0, 6);
          if (mine.length) {
            const sides = await Promise.all(mine.map(async (x) => { const t = x.tx === top?.tx ? tx : await readTx(x.tx); return t ? sideOf(t, x) : null; }));
            const ref = now?.pool ?? sides[0]?.pool;
            const impact = sum(theirs) >= 50 && !concentrated && !curve && sides.every((sd) => sd && sd.pool === ref && sd.cPost > 0)
              ? sides.reduce((a, sd) => a * (sd!.cPre / sd!.cPost) ** 2, 1) : null;
            creatorDump = impact !== null && impact <= Math.sqrt(span.after / span.before);
            creatorImpact = creatorDump ? null : impact !== null || sum(theirs) < 50 ? "small" : "unread";
          }
        }
        // A crash the creator didn't cause can't be told apart from a pull without its transaction, where a pull is possible at all.
        if (!creatorDump && top && top.usd >= 50 && span.at >= tradeFrom && !tx && !concentrated && !curve)
          throw new Error("The Solana RPC didn't return the crash transaction, so a liquidity pull can't be told apart from a whale dump. Try again in a few seconds.");
        // A constant-product pool keeps the product of its two reserves through any number of trades (fees nudge it up); only liquidity
        // leaving or arriving moves it. Its lowest reading around the crash (before and after the biggest sell, and after the stretch's
        // last sell, which a pull late in the stretch can't hide from) against its best reading earlier shows a pull without counting
        // sells: a quarter of the product left means half the pool's depth went.
        const then = refs.map((r, i) => (refTxs[i] ? { r, side: sideOf(refTxs[i], r) } : null))
          .filter((x): x is { r: Trade; side: NonNullable<ReturnType<typeof sideOf>> } => !!x?.side && !!now && x.side.pool === now.pool)
          .sort((a, b) => b.side.qPost * b.side.cPost - a.side.qPost * a.side.cPost)[0] ?? null;
        const endSide = endTx && end ? sideOf(endTx, end) : null;
        const low = (now ? [{ q: now.qPre, c: now.cPre }, { q: now.qPost, c: now.cPost }, ...(endSide && endSide.pool === now.pool ? [{ q: endSide.qPost, c: endSide.cPost }] : [])] : [])
          .reduce<{ q: number; c: number } | null>((l, x) => (x.q * x.c < (l ? l.q * l.c : Infinity) ? x : l), null);
        if (curve) pullCheck = "curve";
        else if (concentrated) pullCheck = "concentrated";
        else if (!refs.length) pullCheck = "no-reference";
        else if (now && then && low) {
          pullCheck = "done";
          pulled = (low.q * low.c) / (then.side.qPost * then.side.cPost) <= 0.25;
          liquidityLeft = 2 * low.q * now.quoteUsd;
        } else if (now && !refTxs.some(Boolean) && !creatorDump)
          throw new Error("The Solana RPC didn't return the pool's earlier trades, so a liquidity pull can't be ruled out. Try again in a few seconds.");
        const worth = (sd: NonNullable<ReturnType<typeof sideOf>>, q: number, c: number, price: number) => (concentrated ? q * sd.quoteUsd + c * price : 2 * q * sd.quoteUsd);
        crash = {
          at: new Date(top?.at ?? span.at).toISOString(), priceBefore: span.before, priceAfter: span.after, changePct: round((span.after / span.before - 1) * 100, 2),
          sell: top && { tx: top.tx, seller: top.wallet, byCreator: isCreator(top.wallet), tokens: round(top.tokens, 2)!, usd: round(top.usd, 2)!,
            supplyPct: supply ? round((top.tokens / supply) * 100, 2) : null },
          liquidityBeforeUsd: now ? round(worth(now, now.qPre, now.cPre, span.before), 0) : null,
          liquidityAfterUsd: now ? round(worth(now, now.qPost, now.cPost, span.after), 0) : null,
          liquidityEarlierUsd: then ? round(worth(then.side, then.side.qPost, then.side.cPost, then.r.usd / (then.r.tokens || 1)), 0) : null,
          earlierAt: then ? new Date(then.r.at).toISOString() : null,
          minuteSellsUsd: round(sum(spanSells), 2)!, minuteSellers: new Set(spanSells.map((s) => s.wallet)).size,
        };
        // The swarm: the 60 seconds before the crash's first sell. Under 300 rows, the last trades are the pool's whole day, so an
        // empty minute was quiet.
        const crashAt = Math.min(top?.at ?? span.at, ...spanSells.map((s) => s.at));
        const times = (last ?? []).map((a) => Date.parse(String(a.block_timestamp))).filter(Number.isFinite);
        if (crashAt < Date.now() - 86_400_000) swarmNote = "The crash is older than the day of trades GeckoTerminal shows, so the minute before it can't be rebuilt.";
        else if (!last) swarmNote = "GeckoTerminal didn't return the pool's recent trades (a rate limit or a timeout), so the minute before the crash isn't shown. Try again in a minute.";
        else if (last.length >= 300 && Math.min(...times) > crashAt - 60_000) swarmNote = "The pool has traded too much since the crash to show the minute before it (only its last 300 trades are public).";
        else {
          const win = last.filter((a) => { const t = Date.parse(String(a.block_timestamp)); return t >= crashAt - 60_000 && t < crashAt; });
          const buys = win.filter((a) => coinSide(a, mint)?.sell === false);
          const real = buys.map((a) => n(a.volume_in_usd) ?? 0).filter((v) => v >= 0.005).sort((a, b) => a - b);
          swarm = { trades: win.length, buys: buys.length, buyerWallets: new Set(buys.map((a) => a.tx_from_address)).size,
            zeroDollarTrades: win.filter((a) => (n(a.volume_in_usd) ?? 0) < 0.005).length, medianBuyUsd: real.length ? round(real[Math.floor((real.length - 1) / 2)]!, 2) : null };
        }
      }

      const change24 = n(j?.stats24h?.priceChange) ?? n(pairs[0]?.priceChange?.h24);
      const when = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
      const qty = (v: number) => (v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : px(v, 3));
      const price = (v: number | null) => (v === null ? "?" : `$${px(v, 3)}`);
      const who = (w: string) => (isCreator(w) ? "the creator" : `wallet ${short(w)}`);
      const minutesOf = m ? Math.round((m.end - m.at) / 60_000) : 1;
      // A stretch of minutes is named from where it starts, not from its biggest sell.
      const fell = (c: number, from?: string) => `the price fell ${Math.abs(c).toFixed(1)}% ${minutesOf === 1 ? (from ? `in the minute of ${when(from)}` : "that minute")
        : `over ${minutesOf} minutes${from && m ? ` from ${when(new Date(m.at).toISOString())}` : ""}`}`;
      type Crash = z.infer<typeof crashShape>;
      type CrashSell = NonNullable<Crash["sell"]>;
      const sold = (c: Crash, s: CrashSell) => `${who(s.seller)} sold ${qty(s.tokens)} tokens${s.supplyPct !== null ? ` (${s.supplyPct.toFixed(1)}% of supply)` : ""} for ${usd(s.usd)} in one transaction at ${when(c.at)}`;
      const others = (s: CrashSell) => {
        // Dust doesn't count: a $0.02 sell beside a $40K dump is noise.
        const xs = spanSells.filter((x) => x.wallet !== s.seller), k = new Set(xs.map((x) => x.wallet)).size;
        return sum(xs) >= 50 ? `, with ${k} other wallet${k === 1 ? "" : "s"} selling ${usd(sum(xs))} ${minutesOf === 1 ? "in the same minute" : "in those minutes"}` : "";
      };
      const creatorUsd = creatorPart(spanSells).usd;
      const window = candles.length ? `the pool's last ${stretchSince(begin)}` : "the pool's recent prices";
      let verdict: "CREATOR DUMP" | "WHALE DUMP" | "LIQUIDITY PULLED" | "CAUSE UNKNOWN" | "SLOW BLEED" | "NO CRASH FOUND", summary: string;
      if (crash) {
        const s = crash.sell, ch = crash.changePct ?? 0;
        if (creatorDump) {
          verdict = "CREATOR DUMP";
          summary = s?.byCreator ? `CREATOR DUMP: ${sold(crash, s)}; ${fell(ch)}${others(s)}.`
            : `CREATOR DUMP: ${fell(ch, crash.at)}, and ${usd(creatorUsd)} of the ${usd(crash.minuteSellsUsd)} sold then was the creator's; the biggest single sell, ${usd(s?.usd ?? 0)}, was ${who(s?.seller ?? "")}'s.`;
        } else if (pulled) {
          verdict = "LIQUIDITY PULLED";
          summary = `LIQUIDITY PULLED: the pool held ${usd(crash.liquidityEarlierUsd)} at ${when(crash.earlierAt!)} but only ${usd(liquidityLeft)} by the crash, more than trading explains, so its liquidity was pulled; then ${fell(ch, crash.at)}.`;
        } else if (m!.at < tradeFrom) {
          // Before the pool's last day only the creator's own sells are on record, so who else sold can't be known.
          verdict = "CAUSE UNKNOWN";
          summary = `CAUSE UNKNOWN: ${fell(ch, crash.at)}, before the day of trades GeckoTerminal shows. ${!creator?.whole ? "Who sold"
            : creatorUsd > 0 ? `The creator sold ${usd(creatorUsd)} then, ${creatorImpact === "unread" ? "and whether that caused the fall can't be read" : "too little to cause that fall"}, and who else sold`
            : "The creator didn't sell then, and who did"} isn't on record.`;
        } else if ((!s || s.usd < 50) && pullCheck !== "done" && pullCheck !== "curve") {
          // Every sell over $50 in the pool's last day shows, and a sell under $50 can only halve a price in a pool that is all but empty.
          verdict = "LIQUIDITY PULLED";
          summary = `LIQUIDITY PULLED: ${fell(ch, crash.at)} with no sell over $50 in it, so the pool was all but empty: its liquidity was most likely pulled.`;
        } else if (!s || s.usd < 50) {
          // The reserves show the pool was sold down, not pulled (or it is a bonding curve, which can't be): a small sell finished it.
          verdict = "SLOW BLEED";
          summary = `SLOW BLEED: the pool had been sold down${crash.liquidityBeforeUsd !== null ? ` to ${usd(crash.liquidityBeforeUsd)} of liquidity` : ""}, not pulled; then ${s ? `a ${usd(s.usd)} sell` : "small trades"} took the price down ${Math.abs(ch).toFixed(1)}% from ${when(crash.at)}.`;
        } else {
          verdict = "WHALE DUMP";
          summary = `WHALE DUMP: ${sold(crash, s)}; ${fell(ch)}${others(s)}.${{ done: "", curve: "", concentrated: " This pool's reserves can't show a pull (concentrated liquidity), so one isn't ruled out.",
            "no-reference": " The pool had no earlier trade to compare against, so a pull isn't ruled out.",
            unreadable: " The pool's reserves couldn't be compared with an earlier trade, so a pull isn't ruled out." }[pullCheck]}`;
        }
      } else if (creatorRecent >= recentTotal / 2 && recentTotal >= 1000 && (change24 ?? 0) <= -50) {
        // Most of the day's selling was the creator's, and the price halved.
        const k = recent.filter((s) => isCreator(s.wallet)).length;
        verdict = "CREATOR DUMP";
        summary = `CREATOR DUMP: the creator made ${usd(creatorRecent)} of the ${usd(recentTotal)} sold in the pool's last day${k > 1 ? `, in ${k} sells` : ""}, while the price went ${pct(change24)} over 24 hours.`;
      } else if ((change24 ?? 0) <= -80) {
        verdict = "SLOW BLEED";
        summary = `SLOW BLEED: no stretch of minutes in ${window} fell by half and stayed down, but the price is ${pct(change24)} over 24 hours.`;
      } else {
        verdict = "NO CRASH FOUND";
        summary = `NO CRASH FOUND: no stretch of minutes in ${window} fell by half and stayed down${pricedOld ? ", and neither did the biggest sells before then" : ""}.`;
      }
      if (unpricedOld && verdict !== "CREATOR DUMP")
        summary += ` The creator's sell of ${usd(unpricedOld.usd)} on ${when(new Date(unpricedOld.at).toISOString())} has no price in this pool (it may have been on the launch curve), so a creator dump then isn't ruled out.`;
      // Every verdict but a creator dump leans on the creator's record: an unread one is a retry, and a partial one is said out loud.
      if (verdict !== "CREATOR DUMP" && creator) {
        if (!creator.trades || creator.source === "pool")
          throw new Error("Jupiter's trade history for the creator didn't answer, so a creator dump can't be ruled out. Try again in a few seconds.");
        if (!creator.whole && creator.note) summary += creator.note === "trades since June 2024 only" ? " The creator's trades before June 2024 aren't on record."
          : ` Only part of the creator's history could be read (${creator.note}), so an older creator dump isn't ruled out.`;
      }
      // The swarm only means something before a crash.
      if (!crash) [swarm, swarmNote] = [null, null];
      const s = crash?.sell;
      const lines = [
        `🔎 RUG AUTOPSY · $${symbol}${name ? ` (${name})` : ""} · ${verdict}`, summary,
        creator ? creatorLine(creator, byCreator.length ? ` in ${byCreator.length} sell${byCreator.length === 1 ? "" : "s"} (${usd(sum(byCreator))})` : "")
          : "👤 Creator: unknown (Jupiter has no launch record for this coin).",
        crash ? `💥 The crash: ${when(crash.at)} · ${s ? `${usd(s.usd)} for ${qty(s.tokens)} tokens · ` : ""}price ${price(crash.priceBefore)} → ${price(crash.priceAfter)}${crash.changePct !== null ? ` (${pct(crash.changePct)})` : ""}${crash.liquidityBeforeUsd !== null ? ` · pool liquidity ${usd(crash.liquidityBeforeUsd)} → ${usd(crash.liquidityAfterUsd)}` : ""}${s ? ` · tx ${short(s.tx)}` : ""}` : "",
        sellers.length ? `📉 Biggest sellers in the pool's last day: ${sellers.map((x, i) => `${i + 1}. ${x.creator ? "the creator" : short(x.wallet)} ${usd(x.usd)} (${x.sharePct}%)`).join(" · ")}` : "",
        swarm && !swarm.trades ? "🐝 No trades in the minute before." : swarm ? `🐝 The minute before: ${swarm.trades} trades, ${swarm.buyerWallets} wallets buying, a typical real buy ${swarm.medianBuyUsd === null ? "?" : `$${swarm.medianBuyUsd.toFixed(2)}`}, ${swarm.zeroDollarTrades} trades worth $0.00.` : swarmNote ? `🐝 ${swarmNote}` : "",
        "Times are UTC. Prices cover the pool's last 16 hours or so and trades its last 24; the creator's own trades go back further.",
      ].filter(Boolean);
      return {
        content: text(lines.join("\n")),
        structuredContent: { token: { mint, symbol, name }, pool, verdict, summary, creator: creatorSummary(creator), crash, sellers, swarm, swarmNote },
      };
    },
  );

  server.registerTool(
    "why_pumping",
    {
      title: "Why is this token moving?",
      description: "Reverse mode. Give any Solana memecoin mint and Oddshot searches Polymarket and Kalshi for the real-world story behind it, returning the related prediction markets and how their odds moved in the last 24h.",
      inputSchema: z.object({ mint: address }).strict(),
      outputSchema: z.object({ token: tokenSchema, catalysts: z.array(moverSchema), summary: z.string() }),
      annotations: read,
    },
    async ({ mint }) => {
      const token = await tokenByMint(mint);
      if (!token) throw new Error("No Solana trading pair found for this mint.");
      const catalysts = await catalystsFor(token);
      // A swing on a few hundred dollars of volume is noise, not the reason a coin moved: lead with a market that has real money in it.
      const top = catalysts.find((c) => c.volume24hUsd >= 1000) ?? catalysts[0];
      const summary = top
        ? `$${token.symbol} is ${pct(token.change24hPct)} in 24h. The crowd's odds on "${top.question}" (${top.venue}) moved ${sign(top.changePts)} pts to ${top.probabilityPct}%.`
        : `$${token.symbol} is ${pct(token.change24hPct)} in 24h with no live prediction-market story behind it. Pure vibes.`;
      return {
        content: text(`${summary}${catalysts.length ? `\nRelated markets:\n${catalysts.map(moverLine).join("\n")}` : ""}`),
        structuredContent: { token, catalysts, summary },
      };
    },
  );

  server.registerTool(
    "lag_check",
    {
      title: "Lag check: do the memes follow the odds?",
      description: "Tests Oddshot's thesis on a real story. Finds the biggest 6-hour odds swing in the prediction market behind the story (Polymarket, or Kalshi when its question is the closer match), then measures what the meme did during the swing and 1h, 6h and 24h after it. Verdicts: MEMES FOLLOWED (+10% or more after), MEMES LED (+20% or more during, so already priced in), MEMES FADED (-10% or worse after) or NO REACTION.",
      inputSchema: z.object({
        mint: address.describe("The story's meme token, e.g. its OG from narrative_tokens."),
        story: z.string().trim().min(3).max(160).describe("Words from the prediction-market question behind the story."),
        days: z.number().int().min(1).max(30).default(10).describe("How far back to look for the swing."),
        venue: venueInput,
      }).strict(),
      outputSchema: lagSchema,
      annotations: read,
    },
    async ({ mint, story, days, venue }) => {
      const nowS = Math.floor(Date.now() / 1000);
      const pairs = await pairsByMint(mint);
      const market = await findMarket(story, venue, 3500, pairs[0]?.baseToken?.symbol);
      if (!market) throw new Error(`No ${venue === "auto" ? "Polymarket or Kalshi" : venue === "kalshi" ? "open Kalshi" : "Polymarket"} market matches that story.`);
      if (!pairs.length) throw new Error("No Solana pool found for this mint.");
      const pts = await market.history(nowS - days * 86400, nowS);
      if (pts.length < 8) throw new Error("Not enough odds history for that market.");
      // Biggest move across any 6-hour stretch (two pointers over the hourly series).
      let best = { i: 0, k: 0, d: 0 };
      for (let i = 0, k = 0; i < pts.length; i++) {
        while (k < i && pts[k + 1]!.t <= pts[i]!.t - 6 * 3600) k++;
        const d = pts[i]!.p - pts[k]!.p;
        if (Math.abs(d) > Math.abs(best.d)) best = { i, k, d };
      }
      const t0 = pts[best.k]!.t;
      const t1 = pts[best.i]!.t;
      const hist = await historyFor(pairs.slice(0, 3), mint, (c) => priceAt(c, t0) !== null, 4000);
      const candles = hist.candles ?? [];
      const p0 = priceAt(candles, t0);
      const p1 = priceAt(candles, t1);
      if (p0 === null || p1 === null) throw ("error" in hist && hist.error) || new Error("No meme price history around the odds swing (the token may be newer than the story).");
      const after = (h: number) => {
        if (t1 + h * 3600 > nowS) return null;
        const p = priceAt(candles, t1 + h * 3600);
        return p === null ? null : round((p / p1 - 1) * 100, 1);
      };
      const during = round((p1 / p0 - 1) * 100, 1);
      const [a1, a6, a24] = [after(1), after(6), after(24)];
      const bestAfter = Math.max(a1 ?? -Infinity, a6 ?? -Infinity, a24 ?? -Infinity);
      const verdict = (during ?? 0) >= 20 ? "MEMES LED" as const : bestAfter >= 10 ? "MEMES FOLLOWED" as const
        : (a24 ?? a6 ?? 0) <= -10 ? "MEMES FADED" as const : "NO REACTION" as const;
      const iso = (t: number) => new Date(t * 1000).toISOString().replace(/:\d{2}\.\d{3}Z$/, "Z");
      const symbol = pairs[0]!.baseToken?.symbol ? sym(pairs[0]!.baseToken.symbol) : short(mint);
      const jump = round(best.d * 100, 1)!;
      // Windows that have not closed yet are named as pending, not printed as "?".
      const marks = ([[a1, 1], [a6, 6], [a24, 24]] as const).filter(([, h]) => t1 + h * 3600 <= nowS);
      const pending = [1, 6, 24].filter((h) => t1 + h * 3600 > nowS);
      const summary = `${verdict}: odds on "${market.question}" (${market.venue}) swung ${jump > 0 ? "+" : ""}${jump} pts (${round(pts[best.k]!.p * 100, 1)}% → ${round(pts[best.i]!.p * 100, 1)}%) between ${iso(t0)} and ${iso(t1)}. $${symbol} moved ${pct(during)} during the swing` +
        `${marks.length ? `, then ${marks.map(([v, h]) => `${pct(v)} after ${h}h`).join(", ")}` : ""}` +
        `${pending.length ? ` (${pending.map((h) => `${h}h`).join(" and ")} still to come: run it again later)` : ""}.`;
      return {
        content: text(`⏱ LAG CHECK · ${summary}\nOne story is one data point; run it across stories to judge the pattern.`),
        structuredContent: { venue: market.venue, question: market.question, symbol, jumpPts: jump, from: iso(t0), to: iso(t1),
          oddsBefore: round(pts[best.k]!.p * 100, 1)!, oddsAfter: round(pts[best.i]!.p * 100, 1)!,
          memeDuringPct: during, meme1hPct: a1, meme6hPct: a6, meme24hPct: a24, verdict, summary },
      };
    },
  );

  server.registerTool(
    "receipt",
    {
      title: "Receipt: grade a past call",
      description: "Grades a past call with real price and odds history: the token's price at the call versus now, the peak and the drawdown since, and, given the story, how the prediction-market odds behind it moved (Polymarket or Kalshi). Returns HIT (+10% or more), MISS (-10% or worse) or FLAT. Misses count as much as hits.",
      inputSchema: z.object({
        mint: address,
        calledAt: z.string().max(40).optional().describe("UTC time of the call, e.g. 2026-10-16T21:44:00Z."),
        hoursAgo: z.number().min(1).max(960).optional().describe("Alternative to calledAt."),
        story: z.string().trim().min(3).max(160).optional().describe("Words from the prediction-market question behind the call, to grade the odds too."),
        venue: venueInput,
      }).strict(),
      outputSchema: receiptSchema,
      annotations: read,
    },
    async ({ mint, calledAt, hoursAgo, story, venue }) => {
      const at = calledAt ? Date.parse(calledAt) : Date.now() - (hoursAgo ?? 24) * 3_600_000;
      if (!Number.isFinite(at) || at > Date.now() - 3_600_000) throw new Error("Give a call time at least an hour in the past (calledAt or hoursAgo).");
      const atS = Math.floor(at / 1000);
      const pairs = (await pairsByMint(mint)).slice(0, 3);
      if (!pairs.length) throw new Error("No Solana pool found for this mint.");
      // A token can gain a newer, deeper pool after the call; use the deepest pool whose history covers the call time.
      // Hourly feeds skip quiet hours: use the last candle at or before the call (within 6h) and carry its close across any gap.
      const callIndex = (c: number[][]) => c.reduce((last, x, j) => (x[0]! <= atS ? j : last), -1);
      const covers = (c: number[][]) => { const k = callIndex(c); return k >= 0 && atS - c[k]![0]! < 6 * 3600; };
      const [hist, odds] = await Promise.all([
        historyFor(pairs, mint, covers, 4500),
        story ? storyOdds(story, atS, venue, pairs[0]!.baseToken?.symbol).catch(() => null) : Promise.resolve(null),
      ]);
      if (hist.candles === null) throw hist.error ?? new Error("No hourly price history covers that time (history reaches back about 40 days).");
      const { candles, pair } = hist;
      const i = callIndex(candles);
      const c0 = candles[i]!;
      const p0 = atS < c0[0]! + 3600 ? c0[1]! + (c0[4]! - c0[1]!) * ((atS - c0[0]!) / 3600) : c0[4]!;
      const after = candles.slice(i);
      // Then and now come from the same pool's feed: sources can price an exotic quote token very differently.
      const pNow = after[after.length - 1]![4]!;
      // A feed can go stale on one pool (ELON/MUSK4 sat flat at ~7× its on-chain price): refuse to grade when the pool's live price disagrees 2×+.
      const live = n(pair.priceUsd);
      if (live && (pNow / live > 2 || live / pNow > 2))
        throw new Error(`Price feeds disagree on this pool right now: hourly history says $${px(pNow, 4)}, the live price is $${px(live, 4)}. Not grading a call on a broken feed; try again later.`);
      const change = (pNow / p0 - 1) * 100;
      const peak = Math.max((Math.max(...after.map((c) => c[2]!)) / p0 - 1) * 100, change);
      const trough = Math.min((Math.min(...after.map((c) => c[3]!)) / p0 - 1) * 100, change);
      const grade = change >= 10 ? "HIT" as const : change <= -10 ? "MISS" as const : "FLAT" as const;
      const symbol = pair.baseToken?.symbol ? sym(pair.baseToken.symbol) : short(mint);
      const when = new Date(atS * 1000).toISOString().replace(/:\d{2}\.\d{3}Z$/, "Z");
      const summary = `${grade}: $${symbol} ${pct(change)} since the call (${when}), peak ${pct(peak)}, worst ${pct(trough)}.` +
        (odds ? ` Odds on "${odds.question}" (${odds.venue}) went ${odds.atCallPct}% → ${odds.nowPct}%${odds.resolved ? " (resolved)" : ""}.` : "");
      return {
        content: text(`🧾 RECEIPT · ${grade === "HIT" ? "✅" : grade === "MISS" ? "❌" : "➖"} ${summary}\nPrice at call $${px(p0, 4)} → now $${px(pNow, 4)}. One call is one data point, not a track record or financial advice.`),
        structuredContent: { mint, symbol, calledAt: when, priceAtCall: Number(p0.toPrecision(6)), priceNow: Number(pNow.toPrecision(6)),
          changePct: round(change, 1)!, peakPct: round(peak, 1)!, troughPct: round(trough, 1)!, grade, odds, summary },
      };
    },
  );

  server.registerTool(
    "my_bags",
    {
      title: "Bag check",
      description: "Seatbelt for tokens the user already holds. Reads a Solana wallet's holdings, values each position and runs the seatbelt on it, so the agent can flag what to exit. Coins under $0.50 that collapsed (down 80% in 24h, or a pool under $1,000) are listed as collapsed rather than hidden, and tokens waiting in take-profit orders count toward their coin (cancel_order frees them; let the cancel land before the sell). Exit with ape (side 'sell', percent 100).",
      inputSchema: z.object({
        owner: address.describe("Public address of the user's PayBox Solana wallet."),
        limit: z.number().int().min(1).max(10).default(6),
      }).strict(),
      outputSchema: z.object({ owner: z.string(), solBalance: num, usdcBalance: num, totalUsd: z.number(), positions: z.array(positionSchema), collapsed: z.array(collapsedSchema),
        orders: z.array(orderSchema), ordersRead: z.boolean(), ordersMore: z.boolean() }),
      annotations: read,
    },
    async ({ owner, limit }) => {
      const { solBalance, usdcBalance, usdcAccount, totalUsd, positions, collapsed, dust, orders, ordersRead, ordersMore, decimals } = await bagsOf(owner, limit);
      // A coin with tokens in orders sells a token amount once the cancels land: a percent would count only what the wallet held then.
      const exit = (p: Position) => {
        const keys = orders.filter((o) => o.mint === p.mint).map((o) => o.order), dec = decimals.get(p.mint) ?? null;
        return exitCalls(p.mint, keys, keys.length && dec !== null ? `amount ${plain(p.amount, true, dec)}` : "percent 100");
      };
      const body = positions.length
        ? positions.map((p, i) => `${i + 1}. ${light(p.verdict)} $${p.symbol} ${usd(p.valueUsd)} (${pct(p.change24hPct)} 24h)${p.inOrders > 0 ? ` · ${allInOrders(p) ? "all" : px(p.inOrders, 4)} in take-profit orders` : ""}${headline(p) ? ` · ${headline(p)}` : ""}${p.verdict === "RED" ? `\n   → Consider exiting: ${exit(p)}.` : ""}`).join("\n")
        : "No memecoin positions worth over $0.50.";
      return {
        content: text(`👜 Bag check for ${short(owner)} · total ${usd(totalUsd)} (SOL ${round(solBalance, 4) ?? 0}, USDC ${round(usdcBalance, 2)})\n${body}${collapsedLines(collapsed, dust)}${ordersLines(orders, ordersRead, ordersMore)}${fuelLine(solBalance, usdcAccount)}`),
        structuredContent: { owner, solBalance, usdcBalance: round(usdcBalance, 6), totalUsd, positions, collapsed, orders, ordersRead, ordersMore },
      };
    },
  );

  server.registerTool(
    "macro_board",
    {
      title: "Macro board: what the odds say for SOL, BTC and ETH",
      description: "Beyond memecoins. Reads the prediction markets that move crypto as a whole on Polymarket and Kalshi (Fed decisions, recession, crypto legislation, a US Bitcoin reserve, tariffs, government shutdowns), scores each 24h odds move as risk-on or risk-off weighted by its volume, and calls SOL, BTC and ETH: ODDS LEAD (the odds lean risk-on and the coin hasn't moved yet), PRICED IN, SEATBELT (risk-off: consider USDC) or NO PUSH. Most days are NO PUSH; it speaks up when the odds really shift. Majors trade through ape against USDC.",
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({ mode: modeSchema, tilt: z.number(), drivers: z.array(driverSchema), majors: z.array(majorSchema) }),
      annotations: read,
    },
    async () => {
      const m = await macroRead();
      const drivers = m.drivers.length
        ? m.drivers.map((d) => `${d.reads === "risk-on" ? "🟢" : "🔴"} ${d.theme}: "${d.question}" ${sign(d.changePts)} pts → ${d.probabilityPct}% (${d.venue} · ${usd(d.volume24hUsd)} 24h vol) · ${d.reads} ${sign(d.impact)}`).join("\n")
        : "No macro market moved enough to matter in the last 24h.";
      const majors = m.majors.map((x) => `${{ "ODDS LEAD": "🎯", "PRICED IN": "✔", SEATBELT: "🛡", "NO PUSH": "·" }[x.call]} $${x.symbol} ${x.priceUsd ? `$${px(x.priceUsd, 5)}` : "?"} (${pct(x.change24hPct)} 24h) · ${x.call}: ${x.note}\n   mint ${x.mint}`).join("\n");
      return {
        content: text(`🌐 MACRO BOARD · ${m.mode} (tilt ${sign(m.tilt)}) · Polymarket + Kalshi, last 24h\nDrivers:\n${drivers}\nMajors:\n${majors}\nNext: ape buys a major with USDC (BTC is Coinbase's cbBTC, ETH is Wormhole Ether), or seatbelt checks a wallet against these odds.`),
        structuredContent: m,
      };
    },
  );

  server.registerTool(
    "seatbelt",
    {
      title: "Seatbelt mode: hold, trim or exit",
      description: "Protects coins the user already holds. For every position in the wallet: the rug check, whether the prediction-market story behind the coin is heating or dying on Polymarket and Kalshi, and the macro board's risk mode. Calls HOLD, TRIM (sell 50%) or EXIT (sell 100%) with the reason and the exact ape sell into USDC; a creator selling or holding a big bag is an EXIT. Tokens waiting in take-profit orders count toward their coin: an exit (or a trim that needs them) gives the cancel_order calls first, then the sell as a token amount, to make once the cancels have landed. Native SOL always keeps 0.05 SOL for fees. Nothing is sold until the user approves it in PayBox.",
      inputSchema: z.object({
        owner: address.describe("Public address of the user's PayBox Solana wallet."),
        limit: z.number().int().min(1).max(8).default(6),
      }).strict(),
      outputSchema: z.object({ owner: z.string(), mode: modeSchema, tilt: z.number(), totalUsd: z.number(), toUsdcUsd: z.number(), positions: z.array(beltSchema), collapsed: z.array(collapsedSchema),
        orders: z.array(orderSchema), ordersRead: z.boolean(), ordersMore: z.boolean() }),
      annotations: read,
    },
    async ({ owner, limit }) => {
      // Stories for the five biggest memecoin positions and the macro board need only the valued positions, so they run while the
      // creator checks finish.
      const t0 = Date.now(), oddsMs = () => Math.max(800, Math.min(2500, 4800 - (Date.now() - t0)));
      // Each request has its own timeout, but a story search is two requests deep (the markets, then their trades), so each read also
      // ends by 4.8 s; one that hasn't answered by then, or failed, reads as unread. With under 0.7 s left the odds aren't read at all:
      // they would end the call past PayBox's limit.
      const readOdds = (jup: Map<string, any>, memes: { name: string; symbol: string }[], ms = oddsMs()): Promise<[Awaited<ReturnType<typeof macroRead>> | null, (Mover | null | "unread")[]]> => {
        const by = 4800 - (Date.now() - t0);
        if (by < 700) return Promise.resolve([null, memes.map(() => "unread" as const)]);
        return Promise.all([
          within(macroRead(ms, jup).catch(() => null), by, () => null),
          Promise.all(memes.map((p) => within<Mover | null | "unread">(catalystsFor(p, ms).then((c) => c[0] ?? null, () => "unread"), by, () => "unread"))),
        ]);
      };
      // Stories are read for memecoins only: majors follow the macro board, and an issuer's coin (a stablecoin, a tokenized stock) has none.
      const storied = (mint: string, j: any) => !MAJORS[mint] && !issuerTagged(j);
      let early: ReturnType<typeof readOdds> | undefined;
      const bags = await bagsOf(owner, limit, (valued, jup) => { early = readOdds(jup, valued.filter((b) => storied(b.mint, b.j)).slice(0, 5).map((b) => fromJupiter(b.j))); });
      const memes = bags.positions.filter((p) => storied(p.mint, bags.jup.get(p.mint))).slice(0, 5);
      const [macro, stories] = await (early ?? readOdds(bags.jup, memes));
      const mode = macro?.mode ?? "NEUTRAL";
      const tilt = macro?.tilt ?? 0;
      const storyOf = new Map<string, StoryRead>(memes.map((p, i) => [p.mint, stories[i] ?? null]));
      const positions = bags.positions.map((p) => {
        const j = bags.jup.get(p.mint);
        return belt(p, issuerTagged(j) ? "issuer" : storyOf.get(p.mint), mode, tilt, bags.liquidity.get(p.mint) ?? null, bags.orders.filter((o) => o.mint === p.mint),
          bags.decimals.get(p.mint) ?? null, stableTagged(j));
      });
      if (bags.solBalance && bags.solPrice && bags.solBalance * bags.solPrice >= 1) {
        const amount = mode === "RISK-OFF" ? Math.max(0, bags.solBalance - SOL_RESERVE) / 2 : 0, trim = amount >= 0.001;
        positions.push({
          mint: SOL, symbol: "SOL", valueUsd: round(bags.solBalance * bags.solPrice, 2), verdict: "GREEN", action: trim ? "TRIM" : "HOLD",
          sellPercent: trim ? 50 : 0, sellAmount: trim ? amount.toFixed(4) : null, cancelOrders: [],
          reasons: [trim ? `Macro odds lean risk-off (tilt ${tilt}); half the SOL above the 0.05 fee reserve.`
            : mode === "RISK-OFF" ? `Macro odds lean risk-off (tilt ${tilt}), but the wallet's SOL is its fee reserve: nothing to sell.`
            : "No macro push to act on; SOL also pays your fees."], story: null,
        });
      }
      // Coins whose pool is too thin to absorb the sale add nothing real to the USDC total.
      const thin = (b: Belt) => (bags.liquidity.get(b.mint) ?? Infinity) < 100;
      const priced = (b: Belt) => b.sellAmount && b.mint === SOL ? Number(b.sellAmount) * (bags.solPrice ?? 0) : thin(b) ? 0 : ((b.valueUsd ?? 0) * b.sellPercent) / 100;
      const toUsdcUsd = round(positions.reduce((a, b) => a + priced(b), 0), 2)!;
      const sell = (b: Belt) => b.action === "HOLD" ? "" : `\n   → ${exitCalls(b.mint, b.cancelOrders, b.sellAmount ? `amount ${b.sellAmount}` : `percent ${b.sellPercent}`)}`;
      const body = positions.length
        ? positions.map((b, i) => `${i + 1}. ${b.action} ${light(b.verdict)} $${b.symbol} ${usd(b.valueUsd)} · ${b.reasons.join(" ")}${sell(b)}`).join("\n")
        : "No positions worth over $0.50.";
      return {
        content: text(`🛡 SEATBELT MODE · ${short(owner)} · macro ${mode}${macro ? ` (tilt ${sign(tilt)})` : " (macro odds unavailable)"} · total ${usd(bags.totalUsd)}\n${toUsdcUsd > 0 ? `Suggest moving about ${usd(toUsdcUsd)} into USDC.` : positions.some((b) => b.action !== "HOLD") ? "Only clean-up sells: the flagged coins are too thin to be worth much."
          : bags.ordersRead && !bags.ordersMore ? "Nothing to sell: every position holds." : "Nothing to sell among the coins read; tokens in take-profit orders that couldn't be read weren't checked."}\n${body}${collapsedLines(bags.collapsed, bags.dust)}${ordersLines(bags.orders, bags.ordersRead, bags.ordersMore)}${fuelLine(bags.solBalance, bags.usdcAccount)}\nEach sell is a separate ape call that PayBox asks you to approve.`),
        structuredContent: { owner, mode, tilt, totalUsd: bags.totalUsd, toUsdcUsd, positions, collapsed: bags.collapsed, orders: bags.orders, ordersRead: bags.ordersRead, ordersMore: bags.ordersMore },
      };
    },
  );

  // What a take-profit order needs to know about a wallet and a coin: its balance and decimals, its price, its transfer-fee setting,
  // SOL for rent, the payout account, and (for my_orders) the coin's open orders. Shared by take_profit and my_orders, so both decide alike.
  async function orderFacts(owner: string, mint: string, receive: "USDC" | "SOL", withOrders = true) {
    const out = receive === "USDC" ? USDC : SOL;
    // When the RPC fails, the wallet's balances come from one shared Jupiter read, and so does the payout account (counted as missing
    // when that fails too: the safe side of the rent).
    let jupWallet: ReturnType<typeof jupHoldings> | undefined;
    const viaJupiter = () => (jupWallet ??= jupHoldings(owner));
    const [jup, holding, lamports, minted, payout, listed] = await Promise.all([
      jupTokens([...new Set([mint, SOL])], 3000),
      (mint === SOL ? solSpare(owner, 3000, viaJupiter).then((raw): MintHolding => ({ raw, decimals: 9 })) : mintHolding(owner, mint, 3000, viaJupiter)).catch(() => null),
      solLamports(owner, 3000, viaJupiter).catch(() => null),
      mint === SOL ? null : readMint(mint),
      hasAccount(owner, out).then((has) => has ?? viaJupiter().then((h) => h.tokens.has(out), () => false)),
      // take_profit needs the list only to word a refusal PayBox hides, so it skips the read and keeps Jupiter's keyless quota.
      withOrders ? openOrders(owner, 2500, 3, Date.now() + 3000).catch(() => null) : null,
    ]);
    const j = jup.get(mint), decimals = mint === SOL ? 9 : n(j?.decimals) ?? minted?.decimals ?? holding?.decimals ?? null, held = holding?.raw ?? null;
    // A Token-2022 mint that couldn't be read may carry a transfer-fee setting; Jupiter will refuse it if so.
    const fee: Fee | null | "unread" = mint === SOL ? null : minted ? minted.fee : j?.tokenProgram === TOKEN_PROGRAMS[1] ? "unread" : null;
    // The coin's take-profits are the orders that sell it for a payout (USDC, USDT, or SOL for a coin): a SOL-funded buy of another coin
    // isn't one.
    const mine = (listed?.orders ?? []).filter((o) => o?.inputMint === mint && o?.outputMint !== mint && QUOTE_MINTS.has(String(o?.outputMint))).map((o) => orderOf(o, jup));
    return { out, jup, j, symbol: `$${sym(j?.symbol ?? short(mint))}`, held, decimals, tokens: held !== null && decimals !== null ? Number(held) / 10 ** decimals : null,
      priceUsd: n(j?.usdPrice), solUsd: n(jup.get(SOL)?.usdPrice), sol: lamports === null ? null : Number(lamports) / 1e9, fee, payoutAccount: payout,
      listed, mine, inOrders: mine.reduce((a, o) => a + o.tokens, 0) };
  }
  // A take-profit order's target and size from take_profit's inputs: a price or a gain over today's price; an amount of tokens or a
  // share of the wallet's balance (all of it when neither is given).
  const orderTerms = (f: { tokens: number | null; priceUsd: number | null }, a: { price?: number; gainPct?: number; amount?: string; percent?: number }) => ({
    target: a.price ?? (a.gainPct !== undefined && f.priceUsd ? f.priceUsd * (1 + a.gainPct / 100) : null),
    size: a.amount !== undefined ? Number(a.amount) : f.tokens !== null ? (f.tokens * (a.percent ?? 100)) / 100 : null,
  });
  const orderInputs = {
    amount: z.string().regex(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/).optional().describe("Tokens to put in the order. Or give percent instead."),
    percent: z.number().min(1).max(100).optional().describe("Or a share of the wallet's balance of the coin; with neither, all of it."),
    price: z.number().positive().optional().describe("Target price in USD per token."),
    gainPct: z.number().min(2).max(100_000).optional().describe("Or the target as a gain over today's price, e.g. 40 for +40%."),
    receive: z.enum(["USDC", "SOL"]).default("USDC").describe("What the order pays out."),
  };
  const STOP_WATCH = "The seatbelt watches for rugs, creator dumps and dying stories, not the price.";

  server.registerTool(
    "my_orders",
    {
      title: "Take-profit orders",
      description: "A wallet's open orders on Jupiter (what each still holds, its target price and how far that is from now, and its full address for cancel_order), and, given a mint, the take-profit plan for that coin: the exit plan's targets from its own volatility (the tighter 3–15% plan for SOL, BTC and ETH, as ape gives them), as the exact take_profit calls in token amounts, counting orders already open for it, with every check take_profit runs (the balance, the decimals, the price, Jupiter's $5 minimum per order, the SOL each order locks as rent, and a Token-2022 transfer-fee setting Jupiter won't take). After a buy, give spent and payWith as that buy's amount and payWith: the plan then covers what the buy brought in, not the whole balance (for SOL, BTC, ETH or a coin already held, that keeps the rest of the bag out of the orders). Give the same amount or percent, price or gainPct, and receive as a take_profit call to check that exact order instead. PayBox doesn't pass on why take_profit or cancel_order failed, so look here; when SOL is short it gives the MoonPay link itself. Jupiter's orders only sell on the way up, so the plan's stop can't be an order: the plan names its stop price (from the open orders' own plan once they're placed), to sell at with ape. The seatbelt doesn't watch prices.",
      inputSchema: z.object({
        owner: address.describe("Public address of the user's PayBox Solana wallet."),
        mint: address.optional().describe("A coin to plan take-profits for, or to check one order on."),
        ...orderInputs,
        spent: z.string().regex(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/).optional().describe("After a buy: what it spent (ape's amount, in payWith). The plan then covers what that buy brought in, not the whole balance."),
        payWith: z.enum(["USDC", "SOL"]).default("USDC").describe("What that buy spent."),
      }).strict(),
      outputSchema: z.object({
        owner: z.string(), orders: z.array(orderSchema), more: z.boolean(),
        plan: z.object({ mint: z.string(), symbol: z.string(), tokens: num, inOrders: z.number(), priceUsd: num, receive: z.enum(["USDC", "SOL"]), blocked: z.string().nullable(),
          feeUnread: z.boolean(), stopPriceUsd: num, stopPct: num,
          orders: z.array(z.object({ amount: z.string(), priceUsd: z.number(), gainPct: z.number(), proceedsUsd: z.number() })) }).nullable(),
      }),
      annotations: read,
    },
    async ({ owner, mint, amount, percent, price, gainPct, receive, spent, payWith }) => {
      const t0 = Date.now();
      const asked = amount !== undefined || percent !== undefined || price !== undefined || gainPct !== undefined;
      if ((asked || spent !== undefined) && !mint) throw new Error("Give the mint of the coin the order would sell.");
      if (amount !== undefined && percent !== undefined) throw new Error("Give amount or percent, not both.");
      if (asked && (price === undefined) === (gainPct === undefined)) throw new Error("Give the target as either price or gainPct.");
      if (asked && spent !== undefined) throw new Error("spent plans for a buy, while amount, percent, price and gainPct check one order: give one or the other.");
      if (mint === SOL && spent !== undefined && payWith === "SOL") throw new Error("A buy of SOL is paid in USDC: give payWith \"USDC\".");
      const clash = mint ? payoutClash(mint, receive) : null;
      if (clash) throw new Error(clash);
      const f = mint ? await orderFacts(owner, mint, receive) : null;
      // One order's checks don't need the list; a plan does (it counts the open orders), and so does the list on its own.
      const listed = f ? f.listed : await openOrders(owner, 2500, 3, Date.now() + 3000);
      if (!listed && !(f && asked)) throw new Error("Jupiter's order list couldn't be read right now. Try again in a few seconds.");
      // With a mint the list shows that coin's orders, priced in the same lookup; the others are counted.
      const all = listed?.orders ?? [], shown = mint ? all.filter((o) => o?.inputMint === mint) : all;
      const priced = f?.jup ?? await jupTokens([...new Set([...all.flatMap((o) => [o?.inputMint, o?.outputMint]), SOL])].filter((m): m is string => typeof m === "string" && !STABLES[m]), 3000);
      const orders = shown.map((o) => orderOf(o, priced));
      let plan: { mint: string; symbol: string; tokens: number | null; inOrders: number; priceUsd: number | null; receive: "USDC" | "SOL"; blocked: string | null; feeUnread: boolean;
        stopPriceUsd: number | null; stopPct: number | null; orders: { amount: string; priceUsd: number; gainPct: number; proceedsUsd: number }[] } | null = null;
      let calls: string | null = null, rent: string | null = null, levels: string | null = null, bought: number | null = null, single = false, taken = "";
      // The stop: the one of the plan the open orders came from (measured from its entry), else this plan's from today's price.
      let stop: { stop: number; stopPrice: number; entry: number | null } | null = null;
      if (mint && f) {
        const base = { owner, mint, symbol: f.symbol, fee: f.fee, tokens: f.tokens, decimals: f.decimals, inOrders: f.inOrders, priceUsd: f.priceUsd, receive, sol: f.sol, payoutAccount: f.payoutAccount, solUsd: f.solUsd };
        const dec = f.decimals ?? 0, placed = planOf(mint, f.mine);
        // Every check but SOL decides whether there is an order to place; SOL short still shows the calls, to make once it is topped up.
        let legs: TpLeg[] = [], blocked: string | null;
        if (asked) {
          // One order, exactly as take_profit would see it.
          const t = orderTerms(f, { price, gainPct, amount, percent });
          blocked = orderBlock({ ...base, sol: null, target: t.target, size: t.size, amount, orders: 1 });
          if (!blocked && t.target && t.size && f.priceUsd) legs = [{ tokens: t.size, priceUsd: t.target, gainPct: round((t.target / f.priceUsd - 1) * 100, 1)!, proceedsUsd: t.size * t.target }];
        } else {
          // Targets come from the coin's own volatility, from today's price, sized on what a buy brought in (its spend at today's price)
          // or on the whole bag (the wallet plus what already waits in orders). SOL's orders take their SOL from the same balance as their
          // rent, so a SOL plan leaves both orders' rent (and a first payout account) out of the spare SOL: the second still fits once the
          // first has landed.
          const pre = orderBlock({ ...base, sol: null, target: null, size: null, orders: 1 });
          const feeBlocked = !!f.fee && f.fee !== "unread";
          const free = Math.max(0, (f.tokens ?? 0) - (mint === SOL ? (2 * ORDER_LAMPORTS + (f.payoutAccount === true ? 0 : PAYOUT_ACCOUNT_LAMPORTS)) / 1e9 : 0));
          const spentUsd = spent === undefined ? null : payWith === "USDC" ? Number(spent) : f.solUsd ? Number(spent) * f.solUsd : null;
          bought = spentUsd !== null && f.priceUsd ? spentUsd / f.priceUsd : null;
          const bag = spent !== undefined ? bought : free + f.inOrders;
          const small = !pre && bag !== null && (spent !== undefined || f.inOrders === 0) && bag * f.priceUsd! * 3 < ORDER_MIN_USD
            ? `Too small for an order: ${spent !== undefined ? "what the buy brought in" : "the bag"} is worth ${usd(bag * f.priceUsd!)}, under Jupiter's $${ORDER_MIN_USD} minimum even at three times today's price.` : null;
          // The price history is read for a coin that can go in an order, and for a transfer-fee coin, whose levels are still prices to
          // sell at with ape; each read gets what is left of the call's time.
          const want = (!pre && !small && bag !== null) || (feeBlocked && !!f.priceUsd && (f.tokens ?? 0) > 0);
          const pairs = want ? await pairsByMint(mint, Math.max(500, Math.min(2500, 3800 - (Date.now() - t0)))) : [];
          const candles = pairs[0]?.pairAddress ? await candlesFor(pairs[0].pairAddress, mint, 48, Math.max(500, Math.min(2500, 4800 - (Date.now() - t0)))).catch((e: Error) => e) : null;
          const ep = Array.isArray(candles) ? exitPlanFor(mint, candles, f.priceUsd) : null;
          const legsAll = bag === null ? null : tpOrders(bag, ep);
          // Each open order counts for the plan target nearest its own, within 5%, so one order never covers both of a major's close targets.
          const nearest = (o: Order) => legsAll!.reduce((k, l, i) => (Math.abs(o.targetPriceUsd! / l.priceUsd - 1) < Math.abs(o.targetPriceUsd! / legsAll![k]!.priceUsd - 1) ? i : k), 0);
          const covered = new Set(legsAll?.length ? f.mine.filter((o) => o.targetPriceUsd !== null && Math.abs(o.targetPriceUsd / legsAll[nearest(o)]!.priceUsd - 1) <= 0.05).map(nearest) : []);
          const open = legsAll?.filter((_, i) => !covered.has(i)) ?? [];
          const wanted = open.reduce((a, l) => a + l.tokens, 0);
          // A whole-bag plan puts what the wallet holds into the targets still open, the last of them when orders already wait; a buy's
          // plan keeps its own sizes, scaled down when the wallet holds less.
          legs = spent !== undefined ? (wanted > free ? open.map((l) => ({ ...l, tokens: (l.tokens * free) / wanted, proceedsUsd: (l.tokens * free * l.priceUsd) / wanted })) : open)
            : f.inOrders > 0 ? (open.length ? [{ ...open.at(-1)!, tokens: free, proceedsUsd: free * open.at(-1)!.priceUsd }] : []) : open;
          blocked = pre ?? small
            ?? (bag === null ? "SOL's price couldn't be read to turn the spend into tokens right now. Try again in a few seconds."
            : candles === null ? `No pool with price history for ${f.symbol} turned up on DexScreener (it may not list the coin, or it didn't answer). Try again in a minute; take_profit with a price of your own still works.`
            : candles instanceof Error ? (rateLimit([candles]) ? "GeckoTerminal is rate-limiting price history, so no targets could be set. Try again in about a minute."
              : `${f.symbol}'s price history couldn't be read right now. Try again in a minute; take_profit with a price of your own still works.`)
            : legsAll === null ? `${f.symbol} has too little price history to set targets from; take_profit with a price of your own still works.`
            : !legsAll.length ? `Too small for an order: ${spent !== undefined ? "what the buy brought in" : "the whole bag"} at the exit plan's second target brings under Jupiter's $${ORDER_MIN_USD} minimum.`
            : !legs.length ? `${legsAll.length === 1 ? "The exit plan's target already has an order" : "Both of the exit plan's targets already have orders"}${free > 0 ? `; the ${plain(free, true, dec)} ${f.symbol} still in the wallet isn't in any` : ""}.`
            : legs.some((l) => l.tokens * l.priceUsd < ORDER_MIN_USD) ? `What is left in the wallet (${plain(free, true, dec)} ${f.symbol}) brings under Jupiter's $${ORDER_MIN_USD} minimum at ${legs.length === 1 ? "the remaining target" : "each target"}.`
            : null);
          if (blocked) legs = [];
          single = legsAll?.length === 1 && legs.length === 1;
          if (legs.length && covered.size) taken = ` The ${[...covered].map((i) => `+${legsAll![i]!.gainPct}%`).join(" and ")} target already has an order.`;
          if (feeBlocked && ep) levels = `The exit plan from today's price, as sells with ape: half at $${px(ep.tp1Price, 3)} (+${ep.tp1}%), the rest at $${px(ep.tp2Price, 3)} (+${ep.tp2}%), and bail below $${px(ep.stopPrice, 3)} (-${ep.stop}%): ape side "sell", mint ${mint}, percent 50, then percent 100, as each level hits.`;
          else if (ep) stop = { stop: ep.stop, stopPrice: ep.stopPrice, entry: null };
        }
        if (placed) stop = placed;
        rent = legs.length ? orderBlock({ ...base, target: null, size: null, orders: legs.length, then: "Then make the take_profit calls above." }) : null;
        calls = legs.length ? tpCalls(legs, dec, receive) : null;
        plan = { mint, symbol: f.symbol.slice(1), tokens: f.tokens === null ? null : round(f.tokens, 6), inOrders: round(f.inOrders, 6)!, priceUsd: f.priceUsd, receive, blocked: blocked ?? rent,
          feeUnread: f.fee === "unread", stopPriceUsd: stop ? Number(plain(stop.stopPrice)) : null, stopPct: stop?.stop ?? null,
          orders: legs.map((l) => ({ amount: plain(l.tokens, true, dec), priceUsd: Number(plain(l.priceUsd)), gainPct: l.gainPct, proceedsUsd: round(l.proceedsUsd, 2)! })) };
      }
      const lines = [!listed ? `📌 ${f ? `${f.symbol} take-profit orders` : "Orders"} for ${short(owner)} couldn't be read right now, so open ones aren't shown.`
        : orders.length ? `📌 ${f ? `${f.symbol} take-profit orders` : "Orders"} for ${short(owner)}: ${orders.length} open` : `📌 No open ${f ? `${f.symbol} take-profit ` : ""}orders for ${short(owner)}.`,
        ...orders.map((o, i) => `${i + 1}. ${orderLine(o)}`),
        ...(all.length > shown.length ? [`+${all.length - shown.length} open for other coins: my_orders without a mint lists them.`] : []),
        ...(listed?.more ? [`Not every order could be read this time; ${all.length} ${all.length === 1 ? "is" : "are"} counted.`] : [])];
      if (plan) {
        const whole = !asked && spent === undefined && MAJORS[plan.mint]
          ? ` It covers the whole ${plan.mint === SOL ? "SOL balance above the 0.05 kept for fees (less the orders' rent)" : "balance"}, not one buy: after a buy, give spent and payWith to plan for that buy alone.` : "";
        lines.push(!calls ? `🧭 $${plan.symbol}: ${plan.blocked ?? "No order to place."}${levels ? ` ${levels}` : ""}`
          : `🧭 ${asked ? "This order for" : spent !== undefined ? "Plan for this buy of" : "Plan for"} $${plan.symbol} (${bought !== null ? `about ${px(bought, 4)} bought, ` : ""}${px(plan.tokens ?? 0, 4)} in the wallet${plan.inOrders ? `, ${px(plan.inOrders, 4)} already in orders` : ""}, at $${px(plan.priceUsd!, 3)}): ${calls}${single ? " (half would be under Jupiter's $5 order minimum)" : ""}.${taken} ${rent ?? `Each order locks about ${round(ORDER_LAMPORTS / 1e9, 4)} SOL of rent until it closes; a fill costs 0.1%.`}${whole}`
            + `${asked && !rent ? " Oddshot's checks pass: if take_profit still fails, Jupiter refused the order or was rate-limiting, so wait about 10 seconds and try once more." : ""}`
            + `${!asked && listed?.more ? " Not every open order could be read, so one of these may already be open: run my_orders again in a few seconds to check." : ""}`
            + `${plan.feeUnread ? ` $${plan.symbol}'s Token-2022 mint couldn't be read to check for a transfer-fee setting, which Jupiter refuses; run my_orders again in a few seconds to check.` : ""}`);
      }
      lines.push(stop?.entry ? `Jupiter's orders only sell on the way up, so a stop can't be one: the plan these orders came from bails below $${px(stop.stopPrice, 3)} (-${stop.stop}% from its $${px(stop.entry, 3)} entry). If the price gets there, cancel them and sell with ape. ${STOP_WATCH}`
        : stop ? `Jupiter's orders only sell on the way up, so the plan's stop (-${stop.stop}% from today's price, $${px(stop.stopPrice, 3)}) can't be one: if the price gets there, sell with ape. ${STOP_WATCH}`
        : `Jupiter's orders only sell on the way up: a stop can't be automatic. ${STOP_WATCH}`);
      return { content: text(lines.join("\n")), structuredContent: { owner, orders, more: listed?.more ?? false, plan } };
    },
  );

  server.registerTool(
    "take_profit",
    {
      title: "Take-profit order (automatic exit)",
      description: "Builds an unsigned Jupiter order for the user's PayBox wallet that sells a coin it holds when the price reaches a target, for USDC (or SOL). The tokens wait in the order on-chain and Jupiter fills it when the price gets there; cancel_order returns them. This makes ape's exit plan automatic: once a buy lands, my_orders with the coin's mint, plus spent and payWith (the buy's amount and payWith), gives the exact calls, in token amounts (for example amount 1234.5 at price 0.215, then the same amount at the second target), counting orders already open. Take-profit only: a target at or below today's price, or within 1% of it, is refused, since an order there would fill at once (sell now with ape); Jupiter's orders can't wait for a fall, so the plan's stop is a price to sell at with ape (my_orders names it). Jupiter's minimum is $5 of proceeds per order; an order locks about 0.0041 SOL of rent until it closes (and a first USDC or wrapped-SOL payout account costs about 0.0015 SOL once); coins with any Token-2022 transfer-fee setting aren't accepted; a fill costs 0.1%. PayBox shows the transaction and asks the user to approve; nothing is signed here. If PayBox reports that the result does not match its schema, the order was refused: my_orders with the same mint and the same amount or percent, price or gainPct, and receive says why, or that Oddshot's checks pass, in which case Jupiter refused it or was rate-limiting (wait about 10 seconds and try once more).",
      inputSchema: z.object({
        sender: address.describe("Public address of the user's selected PayBox Solana wallet."),
        mint: address.describe("Coin to sell when it reaches the target."),
        ...orderInputs,
        expiresInDays: z.number().int().min(1).max(365).optional().describe("Close the order by itself after this many days; leave it out to keep it open."),
      }).strict(),
      outputSchema: solanaOutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ sender, mint, amount, percent, price, gainPct, receive, expiresInDays }) => {
      const out = receive === "USDC" ? USDC : SOL;
      const clash = payoutClash(mint, receive);
      if (clash) throw new Error(clash);
      if ((price === undefined) === (gainPct === undefined)) throw new Error("Give the target as either price or gainPct.");
      if (amount !== undefined && percent !== undefined) throw new Error("Give amount or percent, not both.");
      const f = await orderFacts(sender, mint, receive, false);
      const t = orderTerms(f, { price, gainPct, amount, percent });
      const blocked = orderBlock({ owner: sender, mint, symbol: f.symbol, fee: f.fee, tokens: f.tokens, decimals: f.decimals, inOrders: f.inOrders, priceUsd: f.priceUsd, target: t.target, size: t.size,
        amount, receive, orders: 1, sol: f.sol, payoutAccount: f.payoutAccount, solUsd: f.solUsd });
      if (blocked) throw new Error(blocked);
      const outUsd = out === USDC ? 1 : f.solUsd;
      if (!outUsd) throw new Error("Couldn't read SOL's price to size the payout right now. Try again in a few seconds.");
      const making = amount !== undefined ? BigInt(atomicAmount(amount, f.decimals!)) : (f.held! * BigInt(Math.round((percent ?? 100) * 100))) / 10_000n;
      const tokens = Number(making) / 10 ** f.decimals!, target = t.target!;
      const outDecimals = out === USDC ? 6 : 9, taking = BigInt(Math.floor(((tokens * target) / outUsd) * 10 ** outDecimals));
      const r = await jupRetry(() => getJson(`${TRIGGER}/createOrder`, 4000, {
        inputMint: mint, outputMint: out, maker: sender, payer: sender, computeUnitPrice: "auto", wrapAndUnwrapSol: true,
        params: { makingAmount: String(making), takingAmount: String(taking), ...(expiresInDays ? { expiredAt: String(Math.floor(Date.now() / 1000) + expiresInDays * 86_400) } : {}) },
      }));
      if (typeof r?.transaction !== "string") throw new Error(`Jupiter didn't build the order${typeof r?.error === "string" ? `: ${r.error}` : "."}`);
      return {
        ...proposeSolana({ transactionBase64: await freshBlockhash(r.transaction) }),
        content: text(`🎯 Take-profit order: sell ${px(tokens, 6)} ${f.symbol} when it reaches $${px(target, 3)} (${pct((target / f.priceUsd! - 1) * 100)} from $${px(f.priceUsd!, 3)}), for ${px(Number(taking) / 10 ** outDecimals, 6)} ${receive}.${expiresInDays ? ` It closes by itself in ${expiresInDays} days if it hasn't filled.` : ""}\nThe tokens wait in the order on-chain until Jupiter fills it. A fill costs 0.1%; about ${round(ORDER_LAMPORTS / 1e9, 4)} SOL of rent comes back when the order closes${f.payoutAccount !== true ? ", and opening the wallet's " + receive + " account costs about 0.0015 SOL once" : ""}.\nOrder ${String(r.order ?? "?")}: my_orders lists it, cancel_order returns the tokens.\nUnsigned proposal: approve it in PayBox. Nothing has been signed or sent.`),
      };
    },
  );

  server.registerTool(
    "cancel_order",
    {
      title: "Cancel a take-profit order",
      description: "Builds an unsigned transaction that cancels one of the wallet's Jupiter take-profit orders and returns its unsold tokens and its rent to the wallet. Tokens waiting in an order aren't in the wallet, so cancel first when seatbelt says to exit them, and let the cancel land before the sell: ape reads the wallet's balance when it builds the sell. my_orders and seatbelt print each order's full address, and my_orders stops listing an order once its cancel has landed. PayBox shows the transaction and asks the user to approve; nothing is signed here. If PayBox reports that the result does not match its schema, Jupiter refused the cancel (most often an order that already filled or closed: my_orders shows what is still open) or was rate-limiting (wait about 10 seconds and try once more).",
      inputSchema: z.object({
        sender: address.describe("Public address of the user's selected PayBox Solana wallet."),
        order: address.describe("The order's full address, as my_orders or seatbelt prints it."),
      }).strict(),
      outputSchema: solanaOutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ sender, order }) => {
      // One request, the cancel itself: PayBox shows its own window for a proposal, so a label for the order would spend Jupiter's keyless
      // quota on text nobody sees, right before the sell that follows.
      const r = await jupRetry(() => getJson(`${TRIGGER}/cancelOrder`, 4000, { maker: sender, order, computeUnitPrice: "auto" }));
      if (typeof r?.transaction !== "string") throw new Error(`Jupiter didn't build the cancel${typeof r?.error === "string" ? `: ${r.error}` : "."}`);
      return {
        ...proposeSolana({ transactionBase64: await freshBlockhash(r.transaction) }),
        content: text(`🧹 Cancel order ${order}.\nIts unsold tokens and its rent go back to ${short(sender)} once it lands; my_orders stops listing it then, and a sell of those tokens can follow.\nUnsigned proposal: approve it in PayBox. Nothing has been signed or sent.`),
      };
    },
  );

  server.registerTool(
    "top_up",
    {
      title: "Top up with MoonPay",
      description: "Checks that a PayBox Solana wallet can pay for a trade and, when it can't, returns a MoonPay checkout link with the coin and the dollar amount filled in, plus the wallet address to paste at checkout. Covers SOL for network fees (a first buy of a token also opens its account), the USDC or SOL a buy spends, and, given orders, the SOL take-profit orders lock as rent (about 0.0041 SOL each, plus about 0.0015 SOL once for a first payout account in receive). PayBox doesn't pass on why ape or take_profit refused, so call this when a buy fails, or before a first buy, with the same wallet, amount and payWith (and orders and receive, for take-profits). MoonPay's minimum is $20, about $4 of it fees. Read-only: nothing is bought until the user pays on MoonPay.",
      inputSchema: z.object({
        wallet: address.describe("Public address of the user's PayBox Solana wallet."),
        amount: z.string().regex(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/).optional().describe("A planned buy: the amount of payWith it spends. Leave it out to check fees only."),
        payWith: z.enum(["USDC", "SOL"]).default("USDC").describe("Asset the planned buy spends."),
        orders: z.number().int().min(1).max(10).optional().describe("Take-profit orders to fund, with or without a buy: each locks about 0.0041 SOL of rent until it closes."),
        receive: z.enum(["USDC", "SOL"]).default("USDC").describe("What those orders pay out: a wallet's first USDC or wrapped-SOL account costs about 0.0015 SOL once."),
      }).strict(),
      outputSchema: z.object({
        wallet: z.string(), sol: z.number(), usdc: z.number(), ready: z.boolean(),
        needs: z.array(z.object({ asset: z.enum(["SOL", "USDC"]), short: z.number(), why: z.string(), buyUsd: z.number(), moonpayUrl: z.string() })),
      }),
      annotations: read,
    },
    async ({ wallet, amount, payWith, orders, receive }) => {
      const [h, jup] = await Promise.all([walletHoldings(wallet), jupTokens([SOL], 3000)]);
      const sol = h.sol, usdcRaw = h.tokens.get(USDC)?.raw ?? 0n, usdc = Number(usdcRaw) / 1e6;
      const need = amount === undefined ? 0 : Number(amount);
      // The same margins ape and take_profit refuse on; orders alone (no buy) need only their rent.
      const buyNeed = amount === undefined && orders ? 0 : payWith === "SOL" ? need + SOL_BUY_EXTRA : SOL_FOR_BUY;
      const payout = h.tokens.has(receive === "USDC" ? USDC : SOL);
      const solNeed = buyNeed + (orders ? orderSol(orders, payout) : 0);
      const rentWhy = !orders ? "" : `${orders === 1 ? "a take-profit order locks" : `${orders} take-profit orders lock`} about ${round(orders * ORDER_LAMPORTS / 1e9, 4)} SOL of rent until ${orders === 1 ? "it closes" : "they close"}${payout ? "" : `, the ${receive === "USDC" ? "USDC" : "wrapped-SOL"} payout account costs about 0.0015 SOL once`}, and the wallet keeps about 0.00065 SOL`;
      // SOL's price sizes the SOL link: Jupiter's, or DexScreener's when Jupiter's quota is spent (often by the ape call that just failed).
      const solUsd = sol < solNeed ? n(jup.get(SOL)?.usdPrice) ?? n((await pairsByMint(SOL, 3000))[0]?.priceUsd) : null;
      const needs: { asset: "SOL" | "USDC"; short: number; why: string; buyUsd: number; moonpayUrl: string }[] = [];
      if (sol < solNeed) {
        const gap = solNeed - sol, buyUsd = moonpayUsd(solUsd ? gap * solUsd : 0);
        needs.push({ asset: "SOL", short: round(gap, 6)!, buyUsd, moonpayUrl: moonpayUrl("sol", buyUsd),
          why: [buyNeed === 0 ? "" : payWith === "USDC" ? `about ${SOL_FOR_BUY} SOL pays a buy's network fees and opens the token's account`
            : need > 0 ? `the buy spends ${need} SOL, plus about ${SOL_BUY_EXTRA} SOL for fees and token accounts`
            : `a buy paid in SOL needs about ${SOL_BUY_EXTRA} SOL beyond its amount, for fees, a wrapped-SOL account and the token's account`, rentWhy].filter(Boolean).join("; and ")
            + (solUsd ? "" : " (SOL's price couldn't be read, so the link asks for MoonPay's $20 minimum: raise it to cover the SOL)") });
      }
      if (payWith === "USDC" && usdc < need) {
        const gap = need - usdc, buyUsd = moonpayUsd(gap);
        needs.push({ asset: "USDC", short: round(gap, 6)!, buyUsd, moonpayUrl: moonpayUrl("usdc_sol", buyUsd), why: `the buy spends ${need} USDC` });
      }
      const lines = [`⛽ ${short(wallet)} holds ${round(sol, 6)} SOL and ${Number(usdcRaw / 10_000n) / 100} USDC.`];
      const forWhat = [amount ? `a ${need} ${payWith} buy` : "", orders ? `${orders} take-profit order${orders === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ");
      if (!needs.length) lines.push(`✅ Ready${forWhat ? ` for ${forWhat}` : ""}: enough SOL for ${orders ? "the orders' rent and " : ""}network fees${payWith === "USDC" && amount ? ", and the USDC the buy spends" : ""}.`);
      else {
        // Shortfalls round up, so the amount shown is always enough: cents of USDC, ten-thousandths of a SOL.
        const up = (v: number, d: number) => (Math.ceil(v * 10 ** d) / 10 ** d).toFixed(d);
        for (const x of needs) lines.push(`❌ Short ${up(x.short, x.asset === "USDC" ? 2 : 4)} ${x.asset}: ${x.why}.`, `   MoonPay, ${x.asset} on Solana, $${x.buyUsd}: ${x.moonpayUrl}`);
        if (needs.length === 2) lines.push(`Or make it one purchase: buy SOL on MoonPay, then buy with payWith "SOL".`);
        lines.push("When MoonPay asks where to send it, paste this PayBox address:", wallet,
          `MoonPay's minimum is $20, about $4 of it fees; fees come out of the amount, so each link asks for a little more than the shortfall.${amount ? " Then run the buy again." : orders ? " Then place the take-profit orders." : ""}`);
      }
      return { content: text(lines.join("\n")), structuredContent: { wallet, sol: round(sol, 9)!, usdc: round(usdc, 6)!, ready: !needs.length, needs } };
    },
  );

  server.registerTool(
    "ape",
    {
      title: "Ape in (seatbelted swap)",
      description: "Builds an unsigned Jupiter swap for the user's PayBox Solana wallet to buy or sell a token: a memecoin, or a major (SOL, BTC as Coinbase cbBTC, ETH as Wormhole Ether) against USDC. The seatbelt blocks entries, never exits: buying a RED token is refused (that includes any pool under an hour old with an organic score of 0), while selling is always allowed so the user can bail. Slippage is capped at 10% and price impact at 5% for buys (15% for sells); when the impact is a cost every size pays, such as a Token-2022 transfer fee, the refusal says a smaller size won't help. PayBox shows the transaction and asks the user to approve; nothing is signed here. If PayBox reports that the result does not match its schema, Oddshot refused the trade before building it, and PayBox doesn't pass the reason on. Most often: price impact above the cap (a thin pool: try a smaller size, or check_token first), a RED token (check_token says why), a wallet short of SOL for network fees or of the USDC or SOL the buy spends (call top_up with the same wallet, amount and payWith: it says what's missing and gives a MoonPay link), a sell of tokens that wait in take-profit orders (cancel_order them first and let the cancels land; my_orders lists them), or a rate limit (wait about 10 seconds). If PayBox reports an expired blockhash, call ape again for a fresh proposal. After a buy lands, my_orders with its mint, spent (this buy's amount) and payWith gives the take_profit calls for what it bought, which turn the exit plan's targets into Jupiter orders that sell by themselves.",
      inputSchema: z.object({
        sender: address.describe("Public address of the user's selected PayBox Solana wallet."),
        mint: address.describe("Token to buy or sell."),
        side: z.enum(["buy", "sell"]).default("buy"),
        amount: z.string().regex(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/).optional().describe("Buy: amount of payWith to spend. Sell: token amount to sell."),
        percent: z.number().min(1).max(100).optional().describe("Sell only: share of the wallet's balance to sell, e.g. 100 to exit."),
        payWith: z.enum(["USDC", "SOL"]).default("USDC").describe("Asset spent when buying, or received when selling."),
        slippageBps: z.number().int().min(10).max(1000).default(300),
      }).strict(),
      outputSchema: solanaOutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ sender, mint, side, amount, percent, payWith, slippageBps }) => {
      const major = MAJORS[mint];
      // SOL is a major against USDC; USDC and USDT are only ever the other side.
      if ((QUOTE_MINTS.has(mint) && mint !== SOL) || (mint === SOL && payWith === "SOL")) throw new Error("Pick a token to trade, not USDC/USDT. SOL trades against USDC (payWith \"USDC\").");
      if (side === "buy" && (amount === undefined || percent !== undefined)) throw new Error("To buy, give an amount to spend.");
      if (side === "sell" && (amount === undefined) === (percent === undefined)) throw new Error("To sell, give either amount or percent.");
      // Jupiter's keyless quota is 5 requests per 10s, so sells skip its token lookup (exits need no seatbelt), and when the RPC fails the
      // wallet's balances come from one shared Jupiter read instead of one per balance.
      let jupWallet: ReturnType<typeof jupHoldings> | undefined;
      const viaJupiter = () => (jupWallet ??= jupHoldings(sender));
      const pairsP = pairsByMint(mint, 3000);
      const jupP = side === "buy" && (!major || payWith === "SOL") ? jupTokens([...(major ? [] : [mint]), ...(payWith === "SOL" ? [SOL] : [])], 3000) : Promise.resolve(new Map<string, any>());
      // The creator check starts once Jupiter (the creator) and DexScreener (the pool) answer, alongside the wallet reads and RugCheck,
      // and runs on through the quote; a buy it turns RED is refused before the swap is built. It ends 2 s before the call's deadline
      // (4 s at most), leaving the quote and the swap their time.
      const creatorOn = (j: any, pools: any[]) => creatorOf(mint, j, poolOf(mint, j, pools[0]?.pairAddress), { ms: 3000, deadline: Math.max(800, Math.min(4000, callLeft() - 2000)) });
      const creatorEarly = side === "buy" && !major ? Promise.all([jupP, pairsP]).then(([m, p]) => (m.get(mint) ? creatorOn(m.get(mint), p) : null)) : Promise.resolve(null);
      const [pools, rc, jup, holding, chainDecimals, lamports, minted, usdcHeld, usdcAccount] = await Promise.all([
        pairsP, major ? null : rugcheck(mint, 3000),
        jupP,
        // A sell reads the balance (a percent needs it), which also carries the coin's decimals in case their own lookup fails.
        side === "buy" || (mint === SOL && percent === undefined) ? null
          : (mint === SOL ? solSpare(sender, 3000, viaJupiter).then((raw): MintHolding => ({ raw, decimals: 9 })) : mintHolding(sender, mint, 3000, viaJupiter)).catch(() => null),
        side === "sell" && !major ? mintDecimals(mint) : null,
        solLamports(sender, 3000, viaJupiter).catch(() => null),
        side === "buy" && !major ? readMint(mint) : null,
        side === "buy" && payWith === "USDC" ? mintBalance(sender, USDC, 3000, viaJupiter).catch(() => null) : null,
        // Take-profit orders pay out in USDC: a wallet without that account pays its rent once.
        side === "buy" && payWith === "SOL" ? hasAccount(sender, USDC) : null,
      ]);
      const held = holding?.raw ?? null;
      // A buy's rug check needs Jupiter's organic score; its lookup swallows a rate limit, so a missing record gets one more try.
      const j = jup.get(mint) ?? (side === "buy" && !major && callLeft() > 4500 ? await new Promise((r) => setTimeout(r, 3000)).then(() => jupTokens([mint], 3000)).then((m) => m.get(mint)) : undefined);
      const dex = pools[0] ? toToken(pools[0]) : null;
      const fee = side === "buy" && !major ? (minted ? minted.fee : "unread") : undefined;
      // A record that only came with the retry starts its creator check now.
      const creatorP = side === "buy" && !major && j && !jup.get(mint) ? creatorOn(j, pools) : creatorEarly;
      const verdictOf = (creator: Creator | null) =>
        major ? majorSafety(major.symbol) : safety(dex ?? (j ? fromJupiter(j) : null), rc, j, dex ? "DexScreener" : "Jupiter", undefined, fee, creator);
      const symbol = `$${dex?.symbol ?? j?.symbol ?? short(mint)}`;
      const refuseRed = (v: ReturnType<typeof verdictOf>) => {
        if (side === "buy" && v.verdict === "RED") throw new Error(`Seatbelt engaged: ${symbol} is RED. ${v.reasons.slice(0, 3).map((r) => r.replace(/\.$/, "")).join("; ")}.`);
      };
      let s = verdictOf(null);
      refuseRed(s);
      // Without the organic score a pool under an hour old could be the rug setup: no buy until it can be read.
      if (side === "buy" && !major && !j && dex?.ageHours != null && dex.ageHours < 1)
        throw new Error(`Seatbelt engaged: ${symbol}'s pool is under an hour old and Jupiter didn't return its organic score, so Oddshot can't rule out a rug setup. Wait about 10 seconds and try again.`);
      // A wallet funded with USDC alone (a MoonPay buy) has nothing for fees, and a buy bigger than the wallet only fails in PayBox's
      // simulation. Both are refused with a MoonPay link; PayBox hides the reason, so top_up runs the same check. An unreadable balance never blocks.
      if (lamports !== null && !(side === "buy" && payWith === "SOL") && lamports < (side === "buy" ? BigInt(SOL_FOR_BUY * 1e9) : 10_000n))
        throw new Error(`${short(sender)} holds ${Number(lamports) / 1e9} SOL. Solana charges network fees in SOL${side === "buy" ? ", and a first buy of a token also opens its account (about 0.002 SOL)" : ""}. Add about 0.02 SOL. ${moonpay("sol", sender, 0, `Then run the ${side} again.`)}`);
      if (side === "buy" && amount !== undefined) {
        const need = Number(amount);
        const usdcHas = usdcHeld === null ? null : Number(usdcHeld) / 1e6, solHas = lamports === null ? null : Number(lamports) / 1e9;
        // Whole cents from the raw balance: floating point would show 1.13 USDC as 1.12.
        if (payWith === "USDC" && usdcHas !== null && usdcHeld !== null && usdcHas < need)
          throw new Error(`${short(sender)} holds ${Number(usdcHeld / 10_000n) / 100} USDC, short of the ${need} USDC this buy spends. ${moonpay("usdc_sol", sender, need - usdcHas)}`);
        if (payWith === "SOL" && solHas !== null && solHas < need + SOL_BUY_EXTRA) {
          const gap = need + SOL_BUY_EXTRA - solHas, solUsd = n(jup.get(SOL)?.usdPrice);
          throw new Error(`${short(sender)} holds ${solHas} SOL, short of the ${need} SOL this buy spends plus about ${SOL_BUY_EXTRA} SOL for fees and token accounts: add about ${round(gap, 4)} SOL. ${moonpay("sol", sender, solUsd ? gap * solUsd : 0)}`);
        }
      }
      const decimals = major?.decimals ?? n(j?.decimals) ?? chainDecimals ?? holding?.decimals ?? minted?.decimals ?? (await mintDecimals(mint));
      if (decimals === null) throw new Error("Could not read the token's decimals. Try again in a moment.");
      const base = payWith === "USDC" ? USDC : SOL;
      const baseDecimals = payWith === "USDC" ? 6 : 9;
      const [inputMint, outputMint, inDec, outDec] = side === "buy" ? [base, mint, baseDecimals, decimals] : [mint, base, decimals, baseDecimals];
      let atomic: string;
      if (percent !== undefined) {
        if (held === null) throw new Error("Could not read the wallet balance right now. Retry, or sell a fixed amount instead.");
        if (held === 0n) throw new Error(mint === SOL ? `No SOL to sell above the ${SOL_RESERVE} SOL kept for fees in ${short(sender)}.`
          : `No ${symbol} balance found in ${short(sender)}. If it waits in take-profit orders, cancel_order them first (my_orders lists them).`);
        atomic = ((held * BigInt(Math.round(percent * 100))) / 10000n).toString();
      } else atomic = atomicAmount(amount!, inDec);
      if (atomic === "0") throw new Error("Amount must be greater than zero.");
      // Buys also get an exit plan; its candles load alongside the quote, so it costs no extra time.
      const [quote, candles, creator] = await Promise.all([
        jupRetry(() => getJson(`${JUP}/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${atomic}&slippageBps=${slippageBps}&restrictIntermediateTokens=true`, 2500)),
        side === "buy" && pools[0]?.pairAddress ? candlesFor(pools[0].pairAddress, mint, 48, 2500).catch(() => [] as number[][]) : Promise.resolve([] as number[][]),
        creatorP,
      ]);
      s = verdictOf(creator);
      refuseRed(s);
      const plan = side !== "buy" ? null : exitPlanFor(mint, candles, dex?.priceUsd ?? null);
      const impact = (n(quote?.priceImpactPct) ?? 0) * 100;
      const maxImpact = side === "buy" ? 5 : 15;
      if (impact > maxImpact) {
        // Jupiter's impact also counts what every size pays: $ANT's 3% Token-2022 transfer fee plus its route's spread read 9.7% on a $0.001 quote.
        // A quote a thousand times smaller tells the two apart, so the refusal gives the right advice instead of always "try a smaller size".
        const small = (BigInt(atomic) / 1000n).toString();
        const ref = small === "0" ? null
          : await jupRetry(() => getJson(`${JUP}/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${small}&slippageBps=${slippageBps}&restrictIntermediateTokens=true`, 2500)).catch(() => null);
        const fixed = n(ref?.priceImpactPct), taxed = fee && fee !== "unread" && fee.bps > 0 ? ` (the token takes ${fee.bps / 100}% of every transfer)` : "";
        if (fixed !== null && fixed * 100 > maxImpact)
          throw new Error(`Seatbelt engaged: this route costs about ${(fixed * 100).toFixed(1)}% at any size${taxed}, over the ${maxImpact}% limit. A smaller ${side} won't help.`);
        throw new Error(`Seatbelt engaged: price impact is ${impact.toFixed(2)}% (limit ${maxImpact}%)${fixed !== null && fixed * 100 >= 1 ? `, about ${(fixed * 100).toFixed(1)}% of it paid at any size${taxed}` : ""}. Try a smaller size.`);
      }
      const swap = await jupRetry(() => getJson(`${JUP}/swap/v1/swap`, 3000, {
        quoteResponse: quote, userPublicKey: sender, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 300000, priorityLevel: "high" } },
      }));
      if (typeof swap?.swapTransaction !== "string") throw new Error("Jupiter did not return a swap transaction.");
      const out = Number(quote.outAmount) / 10 ** outDec;
      const minOut = Number(quote.otherAmountThreshold) / 10 ** outDec;
      const spent = Number(atomic) / 10 ** inDec;
      const [inLabel, outLabel] = side === "buy" ? [payWith, symbol] : [symbol, payWith];
      const seatNote = headline(s);
      // The take-profits as Jupiter orders (a stop can't be one: Jupiter's orders only sell on the way up), for the least this buy brings
      // in (the quote's minimum), in tokens so a bag already in the wallet isn't swept in. Jupiter refuses any coin with a Token-2022
      // transfer-fee setting, and each order locks rent, which the SOL left after the buy has to cover; a SOL buy's own SOL goes into its
      // orders, so there the rent and the 0.05 SOL kept for fees come out of what the wallet held before. PayBox shows its own result for
      // a proposal, so there my_orders (given this buy's amount as spent) gives these calls once the buy lands.
      const legs = plan ? tpOrders(minOut, plan) : null;
      const orderFee = fee === "unread" ? (j?.tokenProgram === TOKEN_PROGRAMS[1] ? "unread" : null) : fee ?? null;
      const solAfter = lamports === null ? null : Number(lamports) / 1e9 - (payWith === "SOL" ? spent : 0) - SOL_FOR_BUY - (mint === SOL ? SOL_RESERVE : 0);
      const rent = legs?.length ? orderSol(legs.length, payWith === "USDC" || usdcAccount === true) : 0;
      const autoExit = !legs ? ""
        : orderFee === "unread" ? ` Whether Jupiter's orders take ${symbol} couldn't be checked (its Token-2022 mint didn't answer): once the buy lands, my_orders with this mint says, with the take_profit calls.`
        : orderFee ? ` Jupiter's orders refuse coins with a Token-2022 transfer-fee setting, so the take-profits can't be automatic: sell with ape when a level hits.`
        : !legs.length ? ` Too small for automatic take-profits: Jupiter's minimum is $${ORDER_MIN_USD} per order.`
        : ` To make the take-profits automatic once the buy lands: ${tpCalls(legs, decimals)}${legs.length === 1 ? " (half the bag would be under Jupiter's $5 order minimum)" : ""}.`
          + (solAfter !== null && solAfter < rent ? ` ${legs.length === 1 ? "The order needs" : "The orders need"} about ${round(rent, 4)} SOL of rent, and the wallet will have about ${round(Math.max(0, solAfter), 4)} SOL${mint === SOL ? " beyond the 0.05 kept for fees" : ""} after this buy: top_up with orders ${legs.length} gives a MoonPay link for the rest.` : "");
      return {
        ...proposeSolana({ transactionBase64: await freshBlockhash(swap.swapTransaction) }),
        content: text(`🎯 Oddshot ${side}: ≈${px(out, 6)} ${outLabel} for ${px(spent, 6)} ${inLabel} (min ${px(minOut, 6)})\nSlippage cap ${slippageBps / 100}% · price impact ${impact.toFixed(2)}%\n🛡 Seatbelt ${light(s.verdict)} ${s.verdict}${seatNote ? `: ${seatNote}` : ""} (${s.sources.join(" · ")})${plan ? `\n🧭 Exit plan (from this token's own volatility): take 50% at +${plan.tp1}% ($${px(plan.tp1Price, 3)}), the rest at +${plan.tp2}% ($${px(plan.tp2Price, 3)}); bail below -${plan.stop}% ($${px(plan.stopPrice, 3)}). When a level hits, ape side "sell" with percent 50 or 100.${autoExit}` : ""}\nUnsigned proposal: approve it in PayBox. Nothing has been signed or sent.`),
      };
    },
  );

  return server;
}

serveStdio(createServer, { legacy: "reject" });
