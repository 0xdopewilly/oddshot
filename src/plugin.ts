import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { atomicAmount, proposeSolana, solanaOutputSchema } from "./paybox.js";

const PROTOCOL_VERSION = "2026-07-28";
// Keyless Jupiter by default. Set JUP_API_HOST=api.jup.ag plus a brokered x-api-key header for a dedicated quota.
const JUP = `https://${process.env.JUP_API_HOST || "lite-api.jup.ag"}`;
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL = "So11111111111111111111111111111111111111112";
const QUOTE_MINTS = new Set([USDC, SOL, "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"]);
const SKIP_TAGS = new Set(["sports", "games", "esports", "weather", "crypto-prices", "up-or-down"]);
const STOP = new Set(("will the who what which when how does did before after than more less between with from this that " +
  "win wins winner election price yes no january february march april may june july august september october november " +
  "december next new announce announced reach hit above below end politics world tech business economy finance crypto " +
  "culture science geopolitics elections mentions featured trending recurring global big breaking other launch opening " +
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
const moverSchema = z.object({
  event: z.string(), question: z.string(), outcome: z.string(), probabilityPct: z.number(),
  changePts: z.number(), direction: z.enum(["up", "down"]), volume24hUsd: z.number(), url: z.string(),
  narrativeKeywords: z.array(z.string()),
});
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
  trending: z.boolean(),
});
const narrativeSchema = z.object({
  narrative: z.string(), signal: z.enum(["BOTH CROWDS", "ON-CHAIN ONLY"]), heat: z.number(), pools: z.number(),
  symbols: z.array(z.string()), volume1hUsd: z.number(), change1hPct: num,
  leader: tokenSchema.extend(safetyShape), crowd: moverSchema.nullable(),
});
const lagSchema = z.object({
  question: z.string(), symbol: z.string(), jumpPts: z.number(), from: z.string(), to: z.string(),
  oddsBefore: z.number(), oddsAfter: z.number(), memeDuringPct: num, meme1hPct: num, meme6hPct: num, meme24hPct: num,
  verdict: z.enum(["MEMES FOLLOWED", "MEMES LED", "NO REACTION", "MEMES FADED"]), summary: z.string(),
});
const oddsReceiptSchema = z.object({ question: z.string(), atCallPct: z.number(), nowPct: z.number(), changePts: z.number(), resolved: z.boolean() });
const receiptSchema = z.object({
  mint: z.string(), symbol: z.string(), calledAt: z.string(), priceAtCall: z.number(), priceNow: z.number(),
  changePct: z.number(), peakPct: z.number(), troughPct: z.number(), grade: z.enum(["HIT", "MISS", "FLAT"]),
  odds: oddsReceiptSchema.nullable(), summary: z.string(),
});
const positionSchema = z.object({
  mint: z.string(), symbol: z.string(), name: z.string(), amount: z.number(), valueUsd: num, change24hPct: num, ...safetyShape,
});

type Token = z.infer<typeof tokenSchema>;
type Mover = z.infer<typeof moverSchema>;
type Verdict = z.infer<typeof verdictSchema>;
type Scored = z.infer<typeof scoredSchema>;
type Timing = z.infer<typeof timingSchema>;
type Candidate = { t: Token; m: number };
type Role = z.infer<typeof roleSchema>;
type Cluster = z.infer<typeof clusterSchema>;
/** A story's token swarm: `all` relevant tokens (for cluster stats) and the liquid `cands` (pickable), by momentum. */
type Group = { cands: Candidate[]; all: Token[] };

// ---------- Helpers ----------

async function getJson(url: string, ms = 3500, body?: unknown): Promise<any> {
  const res = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { accept: "application/json", "user-agent": "Oddshot/1.0 (PayBox plugin)",
      ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(ms),
  });
  if (res.status === 429) throw new Error(`${new URL(url).hostname} is rate-limiting requests. Wait about 10 seconds and try again.`);
  if (!res.ok) throw new Error(`${new URL(url).hostname} answered HTTP ${res.status}`);
  return res.json();
}

const n = (v: unknown): number | null => {
  const x = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) ? x : null;
};
const round = (v: number | null, d = 2): number | null => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const usd = (v: number | null) => (v === null ? "?" : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(v < 10 ? 2 : 0)}`);
const pct = (v: number | null) => (v === null ? "?" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const list = (s: unknown): string[] => {
  try { const v = typeof s === "string" ? JSON.parse(s) : s; return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
};
const text = (t: string) => [{ type: "text" as const, text: t }];

/** Story subjects, best first: quoted titles, then runs of capitalised words (trimmed to 3 words), then short labels. */
function keywords(...texts: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const clean = (phrase: string) => {
    const w = phrase.split(/\s+/).map((x) => x.replace(/^[^\w$]+|[^\w]+$/g, "")).filter(Boolean);
    while (w.length && STOP.has(w[0]!.toLowerCase())) w.shift();
    while (w.length && STOP.has(w[w.length - 1]!.toLowerCase())) w.pop();
    return w.slice(0, 3).join(" ");
  };
  const add = (k: string) => {
    if (k.length >= 3 && /^[A-Z]/.test(k) && !STOP.has(k.toLowerCase()) && !out.some((o) => o.toLowerCase() === k.toLowerCase())) out.push(k);
  };
  for (const t of texts) for (const q of t?.match(/["“][^"”]{3,60}["”]/g) ?? []) add(clean(q.slice(1, -1)));
  for (const t of texts) {
    if (t && /^[A-Za-z][A-Za-z .'-]{2,29}$/.test(t)) add(clean(t));
    for (const run of t?.match(/\b[A-Z][\w'’-]*(?:\s+[A-Z][\w'’-]*)*/g) ?? []) add(clean(run));
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
    if (change === null || change === 0 || !Number.isFinite(p) || p <= 0.01 || p >= 0.99) continue;
    if ((n(m.volume24hr) ?? 0) < minVolume) continue;
    if (!best || Math.abs(change) > Math.abs(best.change)) best = { m, change, p };
  }
  return best;
}

function toMover(e: any, b: { m: any; change: number; p: number }): Mover {
  return {
    event: String(e.title ?? ""), question: String(b.m.question ?? ""), outcome: list(b.m.outcomes)[0] ?? "Yes",
    probabilityPct: round(b.p * 100, 1)!, changePts: round(b.change * 100, 1)!, direction: b.change > 0 ? "up" : "down",
    volume24hUsd: Math.round(n(b.m.volume24hr) ?? 0), url: `https://polymarket.com/event/${e.slug ?? ""}`,
    narrativeKeywords: keywords(b.m.groupItemTitle, e.title, ...(e.tags ?? []).map((t: any) => String(t?.label ?? ""))),
  };
}

const MARKETS = "https://gamma-api.polymarket.com/markets?active=true&closed=false&order=volume24hr&ascending=false&include_tag=true";
const MEME_TAG_IDS = [1401, 596, 21]; // tech, pop-culture, crypto: where memecoin stories live

/** Top markets by 24h volume plus the top tech / pop-culture / crypto markets, best market per event. */
async function fetchMovers(window: "1h" | "24h", limit: number, minVolume: number, ms = 4000): Promise<Mover[]> {
  const pages = await Promise.all([
    getJson(`${MARKETS}&limit=400`, ms),
    ...MEME_TAG_IDS.map((id) => getJson(`${MARKETS}&limit=100&tag_id=${id}`, ms).catch(() => [])),
  ]);
  const byEvent = new Map<string, { e: any; b: { m: any; change: number; p: number } }>();
  for (const m of pages.flatMap((p) => (Array.isArray(p) ? p : []))) {
    const e = { title: m.question, slug: m.slug, ...(m.events?.[0] ?? {}), tags: m.tags ?? [] };
    if (e.tags.some((t: any) => SKIP_TAGS.has(String(t?.slug ?? "").toLowerCase())) || /up or down|price on|tweets/i.test(e.title ?? "")) continue;
    const b = bestMarket({ markets: [m] }, window, minVolume);
    if (!b) continue;
    const prev = byEvent.get(e.slug);
    if (!prev || Math.abs(b.change) > Math.abs(prev.b.change)) byEvent.set(e.slug, { e, b });
  }
  const minMove = window === "1h" ? 0.01 : 0.02;
  return [...byEvent.values()]
    .filter(({ b }) => Math.abs(b.change) >= minMove)
    .map(({ e, b }) => toMover(e, b))
    .sort((a, b) => Math.abs(b.changePts) - Math.abs(a.changePts))
    .slice(0, limit);
}

const moverLine = (m: Mover) =>
  `${m.direction === "up" ? "▲" : "▼"} ${m.changePts > 0 ? "+" : ""}${m.changePts} pts → ${m.probabilityPct}% "${m.question}" (${usd(m.volume24hUsd)} 24h vol)`;

// ---------- Market data: DexScreener, RugCheck, Jupiter ----------

function toToken(p: any): Token {
  const created = n(p.pairCreatedAt);
  return {
    mint: String(p.baseToken?.address ?? ""), symbol: String(p.baseToken?.symbol ?? "?"), name: String(p.baseToken?.name ?? ""),
    priceUsd: n(p.priceUsd), change1hPct: n(p.priceChange?.h1), change6hPct: n(p.priceChange?.h6), change24hPct: n(p.priceChange?.h24),
    volume24hUsd: n(p.volume?.h24), liquidityUsd: n(p.liquidity?.usd), marketCapUsd: n(p.marketCap ?? p.fdv),
    buys1h: n(p.txns?.h1?.buys) ?? 0, sells1h: n(p.txns?.h1?.sells) ?? 0,
    ageHours: created === null ? null : round((Date.now() - created) / 3_600_000, 1), url: String(p.url ?? ""),
  };
}

function fromJupiter(j: any): Token {
  const s1 = j.stats1h ?? {};
  const s24 = j.stats24h ?? {};
  const created = Date.parse(j.firstPool?.createdAt ?? j.createdAt ?? "");
  const volume = (n(s24.buyVolume) ?? 0) + (n(s24.sellVolume) ?? 0);
  return {
    mint: String(j.id ?? ""), symbol: String(j.symbol ?? "?"), name: String(j.name ?? ""), priceUsd: n(j.usdPrice),
    change1hPct: n(s1.priceChange), change6hPct: n(j.stats6h?.priceChange), change24hPct: n(s24.priceChange),
    volume24hUsd: volume || null, liquidityUsd: n(j.liquidity), marketCapUsd: n(j.mcap ?? j.fdv),
    buys1h: n(s1.numBuys) ?? 0, sells1h: n(s1.numSells) ?? 0,
    ageHours: Number.isFinite(created) ? round((Date.now() - created) / 3_600_000, 1) : null,
    url: `https://jup.ag/tokens/${j.id ?? ""}`,
  };
}

/** Deepest Solana pair per base token, skipping SOL/USDC/USDT as the base. */
function bestPairs(pairs: any[]): Token[] {
  const byMint = new Map<string, any>();
  for (const p of pairs ?? []) {
    const mint = p?.baseToken?.address;
    if (p?.chainId !== "solana" || !mint || QUOTE_MINTS.has(mint)) continue;
    const prev = byMint.get(mint);
    if (!prev || (n(p.liquidity?.usd) ?? 0) > (n(prev.liquidity?.usd) ?? 0)) byMint.set(mint, p);
  }
  return [...byMint.values()].map(toToken);
}

async function tokenByMint(mint: string, ms = 3500): Promise<Token | null> {
  const pairs = await getJson(`https://api.dexscreener.com/tokens/v1/solana/${mint}`, ms).catch(() => null);
  return bestPairs(Array.isArray(pairs) ? pairs : []).find((t) => t.mint === mint) ?? null;
}

const rugcheck = (mint: string, ms = 3500) =>
  getJson(`https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`, ms).catch(() => null);

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
async function walletHoldings(owner: string, ms = 3500) {
  const opts = { encoding: "jsonParsed", commitment: "confirmed" };
  const [lamports, ...programs] = await Promise.all([
    rpc("getBalance", [owner, { commitment: "confirmed" }], ms),
    ...TOKEN_PROGRAMS.map((programId) => rpc("getTokenAccountsByOwner", [owner, { programId }, opts], ms)),
  ]);
  const tokens = new Map<string, Holding>();
  for (const p of programs) addAccounts(tokens, p?.value);
  return { sol: (n(lamports?.value) ?? 0) / 1e9, tokens };
}

async function mintBalance(owner: string, mint: string, ms = 3000): Promise<bigint> {
  const r = await rpc("getTokenAccountsByOwner", [owner, { mint }, { encoding: "jsonParsed", commitment: "confirmed" }], ms);
  return addAccounts(new Map(), r?.value).get(mint)?.raw ?? 0n;
}

async function mintDecimals(mint: string): Promise<number | null> {
  const r = await rpc("getAccountInfo", [mint, { encoding: "jsonParsed" }], 2500).catch(() => null);
  return n(r?.value?.data?.parsed?.info?.decimals);
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
    mint: String(base?.address ?? ""), symbol: String(base?.symbol ?? "?"), name: String(base?.name ?? ""),
    priceUsd: n(a?.base_token_price_usd), change1hPct: n(a?.price_change_percentage?.h1), change6hPct: n(a?.price_change_percentage?.h6),
    change24hPct: n(a?.price_change_percentage?.h24), volume24hUsd: n(a?.volume_usd?.h24), liquidityUsd: n(a?.reserve_in_usd),
    marketCapUsd: n(a?.market_cap_usd ?? a?.fdv_usd), buys1h: n(a?.transactions?.h1?.buys) ?? 0, sells1h: n(a?.transactions?.h1?.sells) ?? 0,
    ageHours: Number.isFinite(created) ? round((Date.now() - created) / 3_600_000, 1) : null,
    url: `https://www.geckoterminal.com/solana/pools/${a?.address ?? ""}`,
  };
}

/** Trending Solana pools (deepest pool per token), with the quote token kept: the pairing often names the narrative. */
async function geckoTrending(duration: "5m" | "1h" | "6h" | "24h", pages: number, ms = 3500): Promise<Hot[]> {
  const res = await Promise.all(Array.from({ length: pages }, (_, i) =>
    getJson(`${GECKO}/trending_pools?include=base_token,quote_token&duration=${duration}&page=${i + 1}`, ms).catch(() => null)));
  const byMint = new Map<string, Hot>();
  for (const r of res) {
    const inc = new Map<string, any>((r?.included ?? []).map((x: any) => [String(x?.id), x?.attributes] as [string, any]));
    for (const p of r?.data ?? []) {
      const base = inc.get(String(p?.relationships?.base_token?.data?.id));
      const quote = inc.get(String(p?.relationships?.quote_token?.data?.id));
      if (!base?.address || QUOTE_MINTS.has(base.address)) continue;
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
  const re = new RegExp(`\\b${word.split(" ")[0]!.replace(/[^a-z0-9]/gi, "")}`, "i");
  return (r?.events ?? [])
    .flatMap((e: any) => {
      const named = { ...e, markets: (e.markets ?? []).filter((m: any) => re.test(`${m.question ?? ""} ${e.title ?? ""}`)) };
      const b = bestMarket(named, "24h", 1000);
      return b ? [toMover(e, b)] : [];
    })
    .sort((a: Mover, b: Mover) => Math.abs(b.changePts) * Math.log10(b.volume24hUsd + 10) - Math.abs(a.changePts) * Math.log10(a.volume24hUsd + 10))[0] ?? null;
}

/** The token's Solana pools on DexScreener, deepest first. */
async function pairsByMint(mint: string, ms = 3500): Promise<any[]> {
  const pairs = await getJson(`https://api.dexscreener.com/tokens/v1/solana/${mint}`, ms).catch(() => null);
  return (Array.isArray(pairs) ? pairs : [])
    .filter((p: any) => p?.chainId === "solana" && p?.baseToken?.address === mint && p?.pairAddress)
    .sort((a: any, b: any) => (n(b?.liquidity?.usd) ?? 0) - (n(a?.liquidity?.usd) ?? 0));
}

/** The Polymarket market (open or resolved) whose question best matches the story words. */
async function findMarket(story: string, ms = 3500): Promise<any> {
  const words = story.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !STOP.has(w));
  const r = await getJson(`https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(story)}&limit_per_type=8&events_status=all`, ms);
  // Whole-word matches only, so "ANT" does not match "ANTH"; volume breaks ties.
  const res = words.map((w) => new RegExp(`\\b${w}\\b`, "i"));
  const fit = (m: any) => { const q = String(m?.question ?? ""); return res.filter((re) => re.test(q)).length + Math.log10((n(m?.volume) ?? 0) + 10) / 10; };
  return (r?.events ?? []).flatMap((e: any) => e.markets ?? []).sort((a: any, b: any) => fit(b) - fit(a))[0] ?? null;
}

/** Hourly Polymarket odds for a market's first outcome, oldest first. */
async function oddsHistory(market: any, fromS: number, toS: number, ms = 3500): Promise<{ t: number; p: number }[]> {
  const tokenId = list(market?.clobTokenIds)[0];
  if (!tokenId) return [];
  const h = await getJson(`https://clob.polymarket.com/prices-history?market=${tokenId}&startTs=${fromS}&endTs=${toS}&fidelity=60`, ms);
  return ((h?.history ?? []) as { t: number; p: number }[]).filter((x) => Number.isFinite(x?.t) && Number.isFinite(x?.p)).sort((a, b) => a.t - b.t);
}

/** Hourly candles [t, open, high, low, close, volume] for a token in one pool, priced in the token itself, oldest first. */
async function candlesFor(pool: string, mint: string, limit = 1000, ms = 4500): Promise<number[][]> {
  const o = await getJson(`${GECKO}/pools/${pool}/ohlcv/hour?aggregate=1&limit=${limit}&currency=usd&token=${mint}`, ms).catch(() => null);
  return ((o?.data?.attributes?.ohlcv_list ?? []) as unknown[][])
    .map((c) => c.map(Number)).filter((c) => c.length >= 5 && c.every(Number.isFinite)).sort((a, b) => a[0]! - b[0]!);
}

/** Price at a moment: interpolated inside its candle, or the last close carried across quiet hours (up to 6h). */
function priceAt(candles: number[][], ts: number): number | null {
  const k = candles.reduce((last, c, i) => (c[0]! <= ts ? i : last), -1);
  if (k < 0 || ts - candles[k]![0]! >= 6 * 3600) return null;
  const c = candles[k]!;
  return ts < c[0]! + 3600 ? c[1]! + (c[4]! - c[1]!) * ((ts - c[0]!) / 3600) : c[4]!;
}

/** Volatility-scaled exit plan from the last day of hourly ranges: stop at 3× the average hourly range (10–50%), targets at 2× and 4× the stop. */
function exitPlan(candles: number[][], entry: number | null) {
  const day = candles.slice(-24);
  if (!entry || day.length < 6) return null;
  const range = (day.reduce((a, c) => a + (c[2]! - c[3]!) / c[4]!, 0) / day.length) * 100;
  const stop = clamp(Math.round(3 * range), 10, 50);
  return { stop, tp1: 2 * stop, tp2: 4 * stop, stopPrice: entry * (1 - stop / 100), tp1Price: entry * (1 + (2 * stop) / 100), tp2Price: entry * (1 + (4 * stop) / 100) };
}

/** The market's odds at the call versus now. */
async function storyOdds(story: string, atS: number) {
  const market = await findMarket(story);
  const tokenId = list(market?.clobTokenIds)[0];
  if (!market || !tokenId) return null;
  const h = await getJson(`https://clob.polymarket.com/prices-history?market=${tokenId}&startTs=${atS - 7200}&endTs=${Math.floor(Date.now() / 1000)}&fidelity=60`, 3500);
  const pts = ((h?.history ?? []) as { t: number; p: number }[]).filter((x) => Number.isFinite(x?.t) && Number.isFinite(x?.p));
  if (!pts.length) return null;
  const first = pts.reduce((best, x) => (Math.abs(x.t - atS) < Math.abs(best.t - atS) ? x : best), pts[0]!);
  const last = pts[pts.length - 1]!;
  return { question: String(market.question), atCallPct: round(first.p * 100, 1)!, nowPct: round(last.p * 100, 1)!,
    changePts: round((last.p - first.p) * 100, 1)!, resolved: Boolean(market.closed) };
}

function momentum(t: Token): number {
  const move = clamp(20 * Math.tanh((t.change1hPct ?? 0) / 25) + 20 * Math.tanh((t.change6hPct ?? 0) / 60), 0, 40);
  const activity = clamp((Math.log10((t.volume24hUsd ?? 0) + 1) - 3) * 7.5, 0, 30);
  const flow = t.buys1h + t.sells1h;
  const pressure = flow < 10 ? 0 : clamp(((t.buys1h / flow - 0.4) / 0.3) * 15, 0, 15);
  const depth = clamp((Math.log10((t.liquidityUsd ?? 0) + 1) - 4) * 7.5, 0, 15);
  return Math.round(move + activity + pressure + depth);
}

// ---------- Seatbelt ----------

/** Cross-checks market data, RugCheck and Jupiter's audit into GREEN / YELLOW / RED. Three warnings stack to RED. */
function safety(t: Token | null, rc: any, jup: any, market = "DexScreener", copycatOf?: string) {
  const reasons: string[] = [];
  const seen = new Set<string>();
  let level = 0;
  let warnings = 0;
  // Only Oddshot's own warnings stack toward RED; RugCheck's long tail of mild warnings does not.
  const flag = (l: number, reason: string, key = reason, stacks = true) => {
    if (seen.has(key)) return;
    seen.add(key);
    level = Math.max(level, l);
    if (l === 1 && stacks) warnings++;
    reasons.push(reason);
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
  if (copycatOf) flag(1, `Copycat: newer and thinner than the OG $${copycatOf}.`, "copycat");
  for (const r of rc?.risks ?? []) {
    const name = String(r?.name ?? "");
    const lvl = String(r?.level ?? "").toLowerCase();
    const key = /mint authority/i.test(name) ? "mint" : /freeze authority/i.test(name) ? "freeze" : /top 10 holders/i.test(name) ? "holders" : name;
    flag(lvl === "danger" ? 2 : lvl === "warn" ? 1 : 0, `${name}${r.value ? ` (${String(r.value).replace(/^\((.*)\)$/, "$1")})` : ""}`, key, false);
  }
  if (!rc && !audit) flag(1, "Safety APIs unavailable: authority and holder checks unconfirmed.");
  else if (!rc) flag(0, "RugCheck unavailable: LP lock unconfirmed.");
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

const PENALTY = { GREEN: 0, YELLOW: 10, RED: 40 } as const;
const light = (v: Verdict) => ({ GREEN: "🟢", YELLOW: "🟡", RED: "🔴" })[v];

/** Liquid Solana tokens whose ticker or name starts a word of the narrative, ranked by momentum. */
async function searchNarrative(narrative: string, minLiquidity: number, minVolume: number, ms = 3500): Promise<Group> {
  const words = narrative.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));
  const need = Math.min(2, words.length);
  const relevant = (t: Token) => {
    const hay = `${t.symbol} ${t.name}`.toLowerCase();
    if (words.length > 1 && hay.replace(/[^a-z0-9]/g, "").includes(words.join(""))) return true;
    return words.filter((w) => new RegExp(`\\b${w}`).test(hay)).length >= need;
  };
  const res = await getJson(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(narrative)}`, ms);
  const all = bestPairs(res?.pairs ?? []).filter(relevant);
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

function toPlay(narrative: string, mover: Mover, candidates: Scored[], window: "1h" | "24h", cluster: Cluster, hot: Set<string>): z.infer<typeof playSchema> {
  // Copycats are never the pick, whatever their momentum.
  const token = candidates.find((t) => t.verdict !== "RED" && t.role !== "COPYCAT") ?? null;
  // A 24h odds move is judged against the meme's bigger move over 6h or the full 24h, so a meme that ripped
  // and went quiet hours ago does not read as EARLY.
  const r6 = token?.change6hPct ?? 0, r24 = token?.change24hPct ?? r6;
  const run = !token ? 0 : window === "1h" ? token.change1hPct ?? 0 : Math.abs(r24) > Math.abs(r6) ? r24 : r6;
  const timing: Timing = !token ? "NO_MEME" : run < -20 ? "FADING" : run <= 15 ? "EARLY" : run <= 100 ? "RUNNING" : "LATE";
  const storyHeat = mover.direction === "up" ? "heating" : "cooling";
  const span = window === "1h" ? "1h" : run === r24 && r24 !== r6 ? "24h" : "6h";
  const crowd = `Crowd ${storyHeat === "heating" ? "piling into" : "backing off"} "${mover.question}" (${mover.changePts > 0 ? "+" : ""}${mover.changePts} pts → ${mover.probabilityPct}%).`;
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
    narrative, mover, token, timing, storyHeat, cluster, trending: !!token && hot.has(token.mint),
    playScore: token ? Math.max(0, Math.round(token.oddshotScore + Math.min(Math.abs(mover.changePts), 30) / 2 + TIMING_BONUS[timing] + (storyHeat === "heating" ? 5 : 0) - (frenzy ? 8 : 0))) : 0,
    thesis: token ? `${crowd} $${token.symbol} ${memeLine[timing]}${swarm}${late}`
      : `${crowd} ${blocked ? `Every "${narrative}" meme failed the seatbelt.` : `No liquid "${narrative}" meme yet.`}`,
  };
}

// ---------- Server ----------

function createServer() {
  const server = new McpServer(
    { name: "oddshot", version: "1.3.2" },
    { supportedProtocolVersions: [PROTOCOL_VERSION] },
  );
  const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true };
  // PayBox rejects any result without structured output, even an error, so failures carry the reason there too
  // and the agent sees "wait about 10 seconds" instead of an opaque protocol error.
  const register = server.registerTool.bind(server);
  server.registerTool = ((name: string, config: any, handler: (...a: any[]) => any) =>
    register(name, config, async (...a: any[]) => {
      try {
        return await handler(...a);
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        return { content: text(error), structuredContent: { error }, isError: true };
      }
    })) as typeof server.registerTool;

  server.registerTool(
    "oddshot_play",
    {
      title: "Oddshot board: odds moves → meme plays",
      description: "The one-shot Oddshot play. Takes the biggest prediction-market odds swings, finds the Solana memecoin riding each story (the OG of its swarm, never a copycat), runs the seatbelt (DexScreener + RugCheck + Jupiter audit), and labels the timing: EARLY (the odds moved but the meme hasn't yet), RUNNING, LATE (already priced in) or FADING. Returns plays ranked best first. Pass a play's mint to ape to act on it.",
      inputSchema: z.object({
        window: z.enum(["1h", "24h"]).default("24h").describe("Look-back window for the odds change."),
        stories: z.number().int().min(1).max(4).default(3).describe("How many distinct odds stories to turn into plays."),
        minLiquidityUsd: z.number().min(0).max(1e9).default(10000),
        minVolume24hUsd: z.number().min(0).max(1e9).default(5000),
      }).strict(),
      outputSchema: z.object({ window: z.enum(["1h", "24h"]), plays: z.array(playSchema) }),
      annotations: read,
    },
    async ({ window, stories, minLiquidityUsd, minVolume24hUsd }) => {
      // Each story gets up to two keywords nobody else claimed; every keyword is searched in parallel.
      const used = new Set<string>();
      const picked: { keys: string[]; mover: Mover }[] = [];
      const [movers, trend] = await Promise.all([fetchMovers(window, 20, 5000, 3500), geckoTrending("1h", 1, 3000).catch(() => [] as Hot[])]);
      const hot = new Set(trend.map((h) => h.t.mint));
      for (const mover of movers) {
        const keys = mover.narrativeKeywords.filter((k) => !used.has(k.toLowerCase())).slice(0, 2);
        if (!keys.length) continue;
        keys.forEach((k) => used.add(k.toLowerCase()));
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
        return { narrative: cands[0]?.k ?? keys[0]!, mover, group: { cands, all } };
      });
      // Cluster and safety-check up to six meme-carrying stories, keep the best plays; stories without memes fill any gap.
      const withMemes = found.filter((f) => f.group.cands.length).slice(0, 6);
      const scored = await scoreGroups(withMemes.map((f) => f.group), 2, 2500);
      const plays = [
        ...withMemes.map((f, i) => toPlay(f.narrative, f.mover, scored[i]?.picks ?? [], window, scored[i]?.cluster ?? clusterOf(f.group.all, new Map()).cluster, hot))
          .sort((a, b) => b.playScore - a.playScore),
        ...found.filter((f) => !f.group.cands.length).map((f) => toPlay(f.narrative, f.mover, [], window, clusterOf(f.group.all, new Map()).cluster, hot)),
      ].slice(0, stories);
      const body = plays.length
        ? plays.map((p, i) => `${i + 1}. ${p.timing}${p.token ? ` ${light(p.token.verdict)} $${p.token.symbol}${p.cluster.size > 1 ? ` [${p.token.role} of ${p.cluster.size}]` : ""} ← "${p.narrative}" · play ${p.playScore}${p.trending ? " · 🔥 trending on-chain" : ""}` : ""}\n   ${p.thesis}${p.token ? `\n   mint ${p.token.mint}` : ""}`).join("\n")
        : "No qualifying odds moves right now.";
      return {
        content: text(`🎯 ODDSHOT BOARD: ${window} odds moves → memes\n${body}${plays.some((p) => p.token) ? "\nNext: check_token for the full seatbelt report, or ape with a mint and an amount. PayBox asks you to approve." : ""}`),
        structuredContent: { window, plays },
      };
    },
  );

  server.registerTool(
    "hot_narratives",
    {
      title: "Hot narratives radar",
      description: "Radar for the stories the market is trading right now. Pulls trending Solana pools, clusters them into narratives (names, tickers and the token they are paired against), matches each narrative to the Polymarket market that names it, and labels it BOTH CROWDS (on-chain traders and prediction markets heating together, the strongest signal) or ON-CHAIN ONLY. Each narrative's lead token gets a seatbelt verdict. Follow up with narrative_tokens for the full swarm.",
      inputSchema: z.object({
        window: z.enum(["5m", "1h", "6h", "24h"]).default("1h").describe("Trending window for on-chain heat."),
        limit: z.number().int().min(1).max(8).default(5),
      }).strict(),
      outputSchema: z.object({ window: z.string(), narratives: z.array(narrativeSchema) }),
      annotations: read,
    },
    async ({ window, limit }) => {
      const hot = await geckoTrending(window, 2, 3500);
      const byWord = new Map<string, Hot[]>();
      for (const h of hot) for (const w of narrativeWords(h)) byWord.set(w, [...(byWord.get(w) ?? []), h]);
      const ranked = [...byWord.entries()]
        .map(([w, hs]) => ({ w, hs, score: hs.reduce((a, h) => a + Math.log10(h.vol1h + 10), 0) + 2 * (hs.length - 1) }))
        .sort((a, b) => b.score - a.score);
      // Greedy: each pool belongs to its strongest story; keep up to eight candidate stories.
      const used = new Set<string>();
      const stories: { w: string; hs: Hot[]; score: number }[] = [];
      for (const r of ranked) {
        const fresh = r.hs.filter((h) => !used.has(h.t.mint));
        if (!fresh.length) continue;
        r.hs.forEach((h) => used.add(h.t.mint));
        stories.push(r);
        if (stories.length === 8) break;
      }
      const [crowds, jup] = await Promise.all([
        Promise.all(stories.map((x) => crowdFor(STORY_NAME[x.w] ?? x.w, 3000))),
        jupTokens(stories.map((x) => [...x.hs].sort((a, b) => b.vol1h - a.vol1h)[0]!.t.mint), 3000),
      ]);
      const narratives = stories
        .map((x, i) => {
          const lead = x.hs.filter((h) => !stories.slice(0, i).some((o) => o.hs.includes(h))).sort((a, b) => b.vol1h - a.vol1h)[0] ?? x.hs[0]!;
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
        .filter((x) => x.pools >= 2 || x.crowd)
        .sort((a, b) => b.heat - a.heat)
        .slice(0, limit);
      const body = narratives.length
        ? narratives.map((x, i) => `${i + 1}. ${x.signal === "BOTH CROWDS" ? "🔥🔥" : "🔥"} "${x.narrative}" · ${x.signal} · ${x.pools} pool${x.pools > 1 ? "s" : ""} · ${usd(x.volume1hUsd)} vol 1h · ${pct(x.change1hPct)}` +
          `\n   chain: ${light(x.leader.verdict)} $${x.leader.symbol} leads (${pct(x.leader.change1hPct)} 1h, liq ${usd(x.leader.liquidityUsd)})${x.pools > 1 ? ` · also ${x.symbols.filter((s) => s !== x.leader.symbol).slice(0, 3).map((s) => `$${s}`).join(", ")}` : ""}` +
          (x.crowd ? `\n   crowd: ${moverLine(x.crowd)}` : "") + `\n   mint ${x.leader.mint}`).join("\n")
        : "No clustered narratives in the trending set right now.";
      return {
        content: text(`📡 HOT NARRATIVES (${window} on-chain × prediction markets)\n${body}\nNext: narrative_tokens to map a story's full swarm and its OG, or check_token for the full seatbelt.`),
        structuredContent: { window, narratives },
      };
    },
  );

  server.registerTool(
    "odds_movers",
    {
      title: "Prediction-market odds movers",
      description: "Lists the Polymarket markets whose odds swung hardest recently, skipping sports, weather and price-ladder markets so you get the stories memecoins form around (politics, culture, tech, celebrities, crypto events). Each mover includes narrativeKeywords to pass to narrative_tokens.",
      inputSchema: z.object({
        window: z.enum(["1h", "24h"]).default("24h").describe("Look-back window for the odds change."),
        limit: z.number().int().min(1).max(10).default(6),
        minVolume24hUsd: z.number().min(0).max(1e9).default(5000).describe("Ignore thin markets below this 24h volume."),
      }).strict(),
      outputSchema: z.object({ window: z.enum(["1h", "24h"]), movers: z.array(moverSchema) }),
      annotations: read,
    },
    async ({ window, limit, minVolume24hUsd }) => {
      const movers = await fetchMovers(window, limit, minVolume24hUsd);
      const body = movers.length
        ? movers.map((m, i) => `${i + 1}. ${moverLine(m)}\n   keywords: ${m.narrativeKeywords.join(", ")}`).join("\n")
        : "No qualifying odds moves right now.";
      return {
        content: text(`Biggest Polymarket odds moves (${window}):\n${body}\nNext: narrative_tokens with a keyword, or oddshot_play for the full board.`),
        structuredContent: { window, movers },
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
      description: "Full seatbelt report for any Solana token mint. Cross-checks three sources: live market data (liquidity, age, price action), RugCheck (LP lock, insider and holder risks) and Jupiter's audit (mint/freeze authority, top-holder share, suspicious flag, serial-deployer history, organic volume). Returns GREEN, YELLOW or RED with every reason; three warnings stack to RED.",
      inputSchema: z.object({ mint: address }).strict(),
      outputSchema: z.object({ token: tokenSchema.nullable(), organicScore: num, holderCount: num, sizeFor1pctUsd: num, ...safetyShape }),
      annotations: read,
    },
    async ({ mint }) => {
      const [dex, rc, jup] = await Promise.all([tokenByMint(mint), rugcheck(mint), jupTokens([mint])]);
      const j = jup.get(mint);
      const token = dex ?? (j ? fromJupiter(j) : null);
      const s = safety(token, rc, j, dex ? "DexScreener" : "Jupiter");
      const name = token ? `$${token.symbol} (${token.name})` : mint;
      const organicScore = round(n(j?.organicScore), 0);
      // In a constant-product pool, a buy moves price by roughly its size over the pool's one-sided depth: ~0.5% of total liquidity ≈ 1% impact.
      const sizeFor1pctUsd = token?.liquidityUsd ? Math.round(token.liquidityUsd * 0.005) : null;
      return {
        content: text(`${light(s.verdict)} ${s.verdict}: ${name}\n- ${s.reasons.join("\n- ")}${token ? `\nLiquidity ${usd(token.liquidityUsd)} · 24h ${pct(token.change24hPct)} · LP locked ${s.lpLockedPct ?? "?"}% · organic ${organicScore ?? "?"}/100` : ""}${sizeFor1pctUsd ? `\n📏 Pool depth: buys under ~${usd(sizeFor1pctUsd)} move this pool about 1%; ape shows the actual route's impact before you approve.` : ""}\n🛡 Checked: ${s.sources.join(" · ")}`),
        structuredContent: { token, organicScore, holderCount: n(j?.holderCount), sizeFor1pctUsd, ...s },
      };
    },
  );

  server.registerTool(
    "why_pumping",
    {
      title: "Why is this token moving?",
      description: "Reverse mode. Give any Solana memecoin mint and Oddshot searches Polymarket for the real-world story behind it, returning the related prediction markets and how their odds moved in the last 24h.",
      inputSchema: z.object({ mint: address }).strict(),
      outputSchema: z.object({ token: tokenSchema, catalysts: z.array(moverSchema), summary: z.string() }),
      annotations: read,
    },
    async ({ mint }) => {
      const token = await tokenByMint(mint);
      if (!token) throw new Error("No Solana trading pair found for this mint.");
      const clean = token.name.replace(/\b(the|coin|token|inu|official|sol|ai|on|of)\b/gi, " ").replace(/\s+/g, " ").trim();
      const queries = [...new Set([clean, token.symbol].filter((q) => q.length >= 3).map((q) => q.toLowerCase()))].slice(0, 2);
      const results = await Promise.all(queries.map((q) =>
        getJson(`https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(q)}&limit_per_type=6&events_status=active`, 4000).catch(() => null)));
      const seen = new Set<string>();
      const catalysts = results.flatMap((r) => r?.events ?? [])
        .filter((e: any) => e?.slug && !seen.has(e.slug) && seen.add(e.slug))
        .flatMap((e: any) => { const b = bestMarket(e, "24h", 0); return b ? [toMover(e, b)] : []; })
        .sort((a, b) => Math.abs(b.changePts) * Math.log10(b.volume24hUsd + 10) - Math.abs(a.changePts) * Math.log10(a.volume24hUsd + 10))
        .slice(0, 5);
      const top = catalysts[0];
      const summary = top
        ? `$${token.symbol} is ${pct(token.change24hPct)} in 24h. The crowd's odds on "${top.question}" moved ${top.changePts > 0 ? "+" : ""}${top.changePts} pts to ${top.probabilityPct}%.`
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
      description: "Tests Oddshot's thesis on a real story. Finds the biggest 6-hour odds swing in the Polymarket market behind the story, then measures what the meme did during the swing and 1h, 6h and 24h after it. Verdicts: MEMES FOLLOWED (+10% or more after), MEMES LED (+20% or more during, so already priced in), MEMES FADED (-10% or worse after) or NO REACTION.",
      inputSchema: z.object({
        mint: address.describe("The story's meme token, e.g. its OG from narrative_tokens."),
        story: z.string().trim().min(3).max(160).describe("Words from the Polymarket question behind the story."),
        days: z.number().int().min(1).max(30).default(10).describe("How far back to look for the swing."),
      }).strict(),
      outputSchema: lagSchema,
      annotations: read,
    },
    async ({ mint, story, days }) => {
      const nowS = Math.floor(Date.now() / 1000);
      const [market, pairs] = await Promise.all([findMarket(story), pairsByMint(mint)]);
      if (!market) throw new Error("No Polymarket market matches that story.");
      if (!pairs.length) throw new Error("No Solana pool found for this mint.");
      const [pts, histories] = await Promise.all([
        oddsHistory(market, nowS - days * 86400, nowS),
        Promise.all(pairs.slice(0, 3).map((pr) => candlesFor(pr.pairAddress, mint, 1000, 4000))),
      ]);
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
      const candles = histories.find((c) => priceAt(c, t0) !== null) ?? [];
      const p0 = priceAt(candles, t0);
      const p1 = priceAt(candles, t1);
      if (p0 === null || p1 === null) throw new Error("No meme price history around the odds swing (the token may be newer than the story).");
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
      const symbol = String(pairs[0]!.baseToken?.symbol ?? short(mint));
      const jump = round(best.d * 100, 1)!;
      const summary = `${verdict}: odds on "${market.question}" swung ${jump > 0 ? "+" : ""}${jump} pts (${round(pts[best.k]!.p * 100, 1)}% → ${round(pts[best.i]!.p * 100, 1)}%) between ${iso(t0)} and ${iso(t1)}. $${symbol} moved ${pct(during)} during the swing, then ${pct(a1)} after 1h, ${pct(a6)} after 6h, ${pct(a24)} after 24h.`;
      return {
        content: text(`⏱ LAG CHECK · ${summary}\nOne story is one data point; run it across stories to judge the pattern.`),
        structuredContent: { question: String(market.question), symbol, jumpPts: jump, from: iso(t0), to: iso(t1),
          oddsBefore: round(pts[best.k]!.p * 100, 1)!, oddsAfter: round(pts[best.i]!.p * 100, 1)!,
          memeDuringPct: during, meme1hPct: a1, meme6hPct: a6, meme24hPct: a24, verdict, summary },
      };
    },
  );

  server.registerTool(
    "receipt",
    {
      title: "Receipt: grade a past call",
      description: "Grades a past call with real price and odds history: the token's price at the call versus now, the peak and the drawdown since, and, given the story, how the Polymarket odds behind it moved. Returns HIT (+10% or more), MISS (-10% or worse) or FLAT. Misses count as much as hits.",
      inputSchema: z.object({
        mint: address,
        calledAt: z.string().max(40).optional().describe("UTC time of the call, e.g. 2026-10-16T21:44:00Z."),
        hoursAgo: z.number().min(1).max(960).optional().describe("Alternative to calledAt."),
        story: z.string().trim().min(3).max(160).optional().describe("Words from the Polymarket question behind the call, to grade the odds too."),
      }).strict(),
      outputSchema: receiptSchema,
      annotations: read,
    },
    async ({ mint, calledAt, hoursAgo, story }) => {
      const at = calledAt ? Date.parse(calledAt) : Date.now() - (hoursAgo ?? 24) * 3_600_000;
      if (!Number.isFinite(at) || at > Date.now() - 3_600_000) throw new Error("Give a call time at least an hour in the past (calledAt or hoursAgo).");
      const atS = Math.floor(at / 1000);
      const pairs = (await pairsByMint(mint)).slice(0, 3);
      if (!pairs.length) throw new Error("No Solana pool found for this mint.");
      // A token can gain a newer, deeper pool after the call; use the deepest pool whose history covers the call time.
      const [histories, odds] = await Promise.all([
        Promise.all(pairs.map((pr) => getJson(`${GECKO}/pools/${pr.pairAddress}/ohlcv/hour?aggregate=1&limit=1000&currency=usd&token=${mint}`, 4500)
          .then((o) => ((o?.data?.attributes?.ohlcv_list ?? []) as unknown[][])
            .map((c) => c.map(Number)).filter((c) => c.length >= 5 && c.every(Number.isFinite)).sort((a, b) => a[0]! - b[0]!))
          .catch(() => [] as number[][]))),
        story ? storyOdds(story, atS).catch(() => null) : Promise.resolve(null),
      ]);
      // Hourly feeds skip quiet hours: use the last candle at or before the call (within 6h) and carry its close across any gap.
      const pick = histories
        .map((candles, k) => ({ candles, pair: pairs[k]!, i: candles.reduce((last, c, j) => (c[0]! <= atS ? j : last), -1) }))
        .find((h) => h.i >= 0 && atS - h.candles[h.i]![0]! < 6 * 3600);
      if (!pick) throw new Error("No hourly price history covers that time (history reaches back about 40 days).");
      const { candles, i, pair } = pick;
      const c0 = candles[i]!;
      const p0 = atS < c0[0]! + 3600 ? c0[1]! + (c0[4]! - c0[1]!) * ((atS - c0[0]!) / 3600) : c0[4]!;
      const after = candles.slice(i);
      // Then and now come from the same pool's feed: sources can price an exotic quote token very differently.
      const pNow = after[after.length - 1]![4]!;
      const change = (pNow / p0 - 1) * 100;
      const peak = Math.max((Math.max(...after.map((c) => c[2]!)) / p0 - 1) * 100, change);
      const trough = Math.min((Math.min(...after.map((c) => c[3]!)) / p0 - 1) * 100, change);
      const grade = change >= 10 ? "HIT" as const : change <= -10 ? "MISS" as const : "FLAT" as const;
      const symbol = String(pair.baseToken?.symbol ?? short(mint));
      const when = new Date(atS * 1000).toISOString().replace(/:\d{2}\.\d{3}Z$/, "Z");
      const summary = `${grade}: $${symbol} ${pct(change)} since the call (${when}), peak ${pct(peak)}, worst ${pct(trough)}.` +
        (odds ? ` Odds on "${odds.question}" went ${odds.atCallPct}% → ${odds.nowPct}%${odds.resolved ? " (resolved)" : ""}.` : "");
      return {
        content: text(`🧾 RECEIPT · ${grade === "HIT" ? "✅" : grade === "MISS" ? "❌" : "➖"} ${summary}\nPrice at call $${p0.toPrecision(4)} → now $${pNow.toPrecision(4)}. One call is one data point, not a track record or financial advice.`),
        structuredContent: { mint, symbol, calledAt: when, priceAtCall: Number(p0.toPrecision(6)), priceNow: Number(pNow.toPrecision(6)),
          changePct: round(change, 1)!, peakPct: round(peak, 1)!, troughPct: round(trough, 1)!, grade, odds, summary },
      };
    },
  );

  server.registerTool(
    "my_bags",
    {
      title: "Bag check",
      description: "Seatbelt for tokens the user already holds. Reads a Solana wallet's holdings, values each position and runs the seatbelt on it, so the agent can flag what to exit. Exit with ape (side 'sell', percent 100).",
      inputSchema: z.object({
        owner: address.describe("Public address of the user's PayBox Solana wallet."),
        limit: z.number().int().min(1).max(10).default(6),
      }).strict(),
      outputSchema: z.object({ owner: z.string(), solBalance: num, usdcBalance: num, totalUsd: z.number(), positions: z.array(positionSchema) }),
      annotations: read,
    },
    async ({ owner, limit }) => {
      const wallet = await walletHoldings(owner);
      const held = [...wallet.tokens.entries()]
        .filter(([mint, b]) => !QUOTE_MINTS.has(mint) && b.ui > 0)
        .sort((a, b) => b[1].ui - a[1].ui)
        .slice(0, 99)
        .map(([mint, b]) => ({ mint, amount: b.ui }));
      const jup = await jupTokens([SOL, ...held.map((b) => b.mint)], 3000);
      const valued = held
        .map((b) => ({ ...b, j: jup.get(b.mint), valueUsd: b.amount * (n(jup.get(b.mint)?.usdPrice) ?? 0) }))
        .filter((b) => b.j && b.valueUsd >= 0.5)
        .sort((a, b) => b.valueUsd - a.valueUsd)
        .slice(0, limit);
      const checks = await Promise.all(valued.map((b) => rugcheck(b.mint, 3000)));
      const positions = valued.map((b, i) => {
        const t = fromJupiter(b.j);
        return { mint: b.mint, symbol: t.symbol, name: t.name, amount: b.amount, valueUsd: round(b.valueUsd, 2), change24hPct: round(t.change24hPct, 1), ...safety(t, checks[i], b.j, "Jupiter") };
      });
      const solBalance = round(wallet.sol, 9);
      const usdcBalance = wallet.tokens.get(USDC)?.ui ?? 0;
      const totalUsd = round((solBalance ?? 0) * (n(jup.get(SOL)?.usdPrice) ?? 0) + usdcBalance + positions.reduce((s, p) => s + (p.valueUsd ?? 0), 0), 2)!;
      const body = positions.length
        ? positions.map((p, i) => `${i + 1}. ${light(p.verdict)} $${p.symbol} ${usd(p.valueUsd)} (${pct(p.change24hPct)} 24h)${p.verdict === "GREEN" ? "" : ` · ${p.reasons[0]}`}${p.verdict === "RED" ? "\n   → Consider exiting: ape side \"sell\", percent 100." : ""}`).join("\n")
        : "No memecoin positions worth over $0.50.";
      return {
        content: text(`👜 Bag check for ${short(owner)} · total ${usd(totalUsd)} (SOL ${round(solBalance, 4) ?? 0}, USDC ${round(usdcBalance, 2)})\n${body}`),
        structuredContent: { owner, solBalance, usdcBalance: round(usdcBalance, 6), totalUsd, positions },
      };
    },
  );

  server.registerTool(
    "ape",
    {
      title: "Ape in (seatbelted swap)",
      description: "Builds an unsigned Jupiter swap for the user's PayBox Solana wallet to buy or sell a token. The seatbelt blocks entries, never exits: buying a RED token is refused, while selling is always allowed so the user can bail. Slippage is capped at 10% and price impact at 5% for buys (15% for sells). PayBox shows the transaction and asks the user to approve; nothing is signed here.",
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
      if (QUOTE_MINTS.has(mint)) throw new Error("Pick a token to trade, not SOL/USDC/USDT.");
      if (side === "buy" && (amount === undefined || percent !== undefined)) throw new Error("To buy, give an amount to spend.");
      if (side === "sell" && (amount === undefined) === (percent === undefined)) throw new Error("To sell, give either amount or percent.");
      // Jupiter's keyless quota is 5 requests per 10s, so sells skip its token lookup: exits need no seatbelt.
      const [pools, rc, jup, held, chainDecimals] = await Promise.all([
        pairsByMint(mint, 3000), rugcheck(mint, 3000),
        side === "buy" ? jupTokens([mint], 3000) : new Map<string, any>(),
        percent === undefined ? null : mintBalance(sender, mint).catch(() => null),
        side === "sell" ? mintDecimals(mint) : null,
      ]);
      const j = jup.get(mint);
      const dex = pools[0] ? toToken(pools[0]) : null;
      const s = safety(dex ?? (j ? fromJupiter(j) : null), rc, j, dex ? "DexScreener" : "Jupiter");
      const symbol = `$${dex?.symbol ?? j?.symbol ?? short(mint)}`;
      if (side === "buy" && s.verdict === "RED") throw new Error(`Seatbelt engaged: ${symbol} is RED. ${s.reasons.slice(0, 3).join("; ")}`);
      const decimals = n(j?.decimals) ?? chainDecimals ?? (await mintDecimals(mint));
      if (decimals === null) throw new Error("Could not read the token's decimals. Try again in a moment.");
      const base = payWith === "USDC" ? USDC : SOL;
      const baseDecimals = payWith === "USDC" ? 6 : 9;
      const [inputMint, outputMint, inDec, outDec] = side === "buy" ? [base, mint, baseDecimals, decimals] : [mint, base, decimals, baseDecimals];
      let atomic: string;
      if (percent !== undefined) {
        if (held === null) throw new Error("Could not read the wallet balance right now. Retry, or sell a fixed amount instead.");
        if (held === 0n) throw new Error(`No ${symbol} balance found in ${short(sender)}.`);
        atomic = ((held * BigInt(Math.round(percent * 100))) / 10000n).toString();
      } else atomic = atomicAmount(amount!, inDec);
      if (atomic === "0") throw new Error("Amount must be greater than zero.");
      // Buys also get an exit plan; its candles load alongside the quote, so it costs no extra time.
      const [quote, candles] = await Promise.all([
        getJson(`${JUP}/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${atomic}&slippageBps=${slippageBps}&restrictIntermediateTokens=true`, 2500),
        side === "buy" && pools[0]?.pairAddress ? candlesFor(pools[0].pairAddress, mint, 48, 2500) : Promise.resolve([] as number[][]),
      ]);
      const plan = side === "buy" ? exitPlan(candles, dex?.priceUsd ?? null) : null;
      const impact = (n(quote?.priceImpactPct) ?? 0) * 100;
      const maxImpact = side === "buy" ? 5 : 15;
      if (impact > maxImpact) throw new Error(`Seatbelt engaged: price impact is ${impact.toFixed(2)}% (limit ${maxImpact}%). Try a smaller size.`);
      const swap = await getJson(`${JUP}/swap/v1/swap`, 3000, {
        quoteResponse: quote, userPublicKey: sender, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 300000, priorityLevel: "high" } },
      });
      if (typeof swap?.swapTransaction !== "string") throw new Error("Jupiter did not return a swap transaction.");
      const out = Number(quote.outAmount) / 10 ** outDec;
      const minOut = Number(quote.otherAmountThreshold) / 10 ** outDec;
      const spent = Number(atomic) / 10 ** inDec;
      const [inLabel, outLabel] = side === "buy" ? [payWith, symbol] : [symbol, payWith];
      return {
        ...proposeSolana({ transactionBase64: swap.swapTransaction }),
        content: text(`🎯 Oddshot ${side}: ≈${out.toPrecision(6)} ${outLabel} for ${spent.toPrecision(6)} ${inLabel} (min ${minOut.toPrecision(6)})\nSlippage cap ${slippageBps / 100}% · price impact ${impact.toFixed(2)}%\n🛡 Seatbelt ${light(s.verdict)} ${s.verdict}${s.verdict === "GREEN" ? "" : `: ${s.reasons[0]}`} (${s.sources.join(" · ")})${plan ? `\n🧭 Exit plan (from this token's own volatility): take 50% at +${plan.tp1}% ($${plan.tp1Price.toPrecision(3)}), the rest at +${plan.tp2}% ($${plan.tp2Price.toPrecision(3)}); bail below -${plan.stop}% ($${plan.stopPrice.toPrecision(3)}). When a level hits, ape side "sell" with percent 50 or 100.` : ""}\nUnsigned proposal: approve it in PayBox. Nothing has been signed or sent.`),
      };
    },
  );

  return server;
}

serveStdio(createServer, { legacy: "reject" });
