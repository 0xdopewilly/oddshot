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
  "music tv awards").split(" "));

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
    const w = phrase.split(/\s+/).filter(Boolean);
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

function toPlay(narrative: string, mover: Mover, candidates: Scored[], window: "1h" | "24h", cluster: Cluster): z.infer<typeof playSchema> {
  // Copycats are never the pick, whatever their momentum.
  const token = candidates.find((t) => t.verdict !== "RED" && t.role !== "COPYCAT") ?? null;
  const run = token ? (window === "1h" ? token.change1hPct : token.change6hPct) ?? 0 : 0;
  const timing: Timing = !token ? "NO_MEME" : run < -20 ? "FADING" : run <= 15 ? "EARLY" : run <= 100 ? "RUNNING" : "LATE";
  const storyHeat = mover.direction === "up" ? "heating" : "cooling";
  const span = window === "1h" ? "1h" : "6h";
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
    narrative, mover, token, timing, storyHeat, cluster,
    playScore: token ? Math.max(0, Math.round(token.oddshotScore + Math.min(Math.abs(mover.changePts), 30) / 2 + TIMING_BONUS[timing] + (storyHeat === "heating" ? 5 : 0) - (frenzy ? 8 : 0))) : 0,
    thesis: token ? `${crowd} $${token.symbol} ${memeLine[timing]}${swarm}${late}`
      : `${crowd} ${blocked ? `Every "${narrative}" meme failed the seatbelt.` : `No liquid "${narrative}" meme yet.`}`,
  };
}

// ---------- Server ----------

function createServer() {
  const server = new McpServer(
    { name: "oddshot", version: "1.1.0" },
    { supportedProtocolVersions: [PROTOCOL_VERSION] },
  );
  const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true };

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
      for (const mover of await fetchMovers(window, 20, 5000, 3500)) {
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
        ...withMemes.map((f, i) => toPlay(f.narrative, f.mover, scored[i]?.picks ?? [], window, scored[i]?.cluster ?? clusterOf(f.group.all, new Map()).cluster))
          .sort((a, b) => b.playScore - a.playScore),
        ...found.filter((f) => !f.group.cands.length).map((f) => toPlay(f.narrative, f.mover, [], window, clusterOf(f.group.all, new Map()).cluster)),
      ].slice(0, stories);
      const body = plays.length
        ? plays.map((p, i) => `${i + 1}. ${p.timing}${p.token ? ` ${light(p.token.verdict)} $${p.token.symbol}${p.cluster.size > 1 ? ` [${p.token.role} of ${p.cluster.size}]` : ""} ← "${p.narrative}" · play ${p.playScore}` : ""}\n   ${p.thesis}${p.token ? `\n   mint ${p.token.mint}` : ""}`).join("\n")
        : "No qualifying odds moves right now.";
      return {
        content: text(`🎯 ODDSHOT BOARD: ${window} odds moves → memes\n${body}${plays.some((p) => p.token) ? "\nNext: check_token for the full seatbelt report, or ape with a mint and an amount. PayBox asks you to approve." : ""}`),
        structuredContent: { window, plays },
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
        : "No liquid Solana tokens are riding this narrative yet. That can be the early signal, or a dead end.";
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
      outputSchema: z.object({ token: tokenSchema.nullable(), organicScore: num, holderCount: num, ...safetyShape }),
      annotations: read,
    },
    async ({ mint }) => {
      const [dex, rc, jup] = await Promise.all([tokenByMint(mint), rugcheck(mint), jupTokens([mint])]);
      const j = jup.get(mint);
      const token = dex ?? (j ? fromJupiter(j) : null);
      const s = safety(token, rc, j, dex ? "DexScreener" : "Jupiter");
      const name = token ? `$${token.symbol} (${token.name})` : mint;
      const organicScore = round(n(j?.organicScore), 0);
      return {
        content: text(`${light(s.verdict)} ${s.verdict}: ${name}\n- ${s.reasons.join("\n- ")}${token ? `\nLiquidity ${usd(token.liquidityUsd)} · 24h ${pct(token.change24hPct)} · LP locked ${s.lpLockedPct ?? "?"}% · organic ${organicScore ?? "?"}/100` : ""}\n🛡 Checked: ${s.sources.join(" · ")}`),
        structuredContent: { token, organicScore, holderCount: n(j?.holderCount), ...s },
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
      const [dex, rc, jup, held, chainDecimals] = await Promise.all([
        tokenByMint(mint, 3000), rugcheck(mint, 3000),
        side === "buy" ? jupTokens([mint], 3000) : new Map<string, any>(),
        percent === undefined ? null : mintBalance(sender, mint).catch(() => null),
        side === "sell" ? mintDecimals(mint) : null,
      ]);
      const j = jup.get(mint);
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
      const quote = await getJson(`${JUP}/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${atomic}&slippageBps=${slippageBps}&restrictIntermediateTokens=true`, 2500);
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
        content: text(`🎯 Oddshot ${side}: ≈${out.toPrecision(6)} ${outLabel} for ${spent.toPrecision(6)} ${inLabel} (min ${minOut.toPrecision(6)})\nSlippage cap ${slippageBps / 100}% · price impact ${impact.toFixed(2)}%\n🛡 Seatbelt ${light(s.verdict)} ${s.verdict}${s.verdict === "GREEN" ? "" : `: ${s.reasons[0]}`} (${s.sources.join(" · ")})\nUnsigned proposal: approve it in PayBox. Nothing has been signed or sent.`),
      };
    },
  );

  return server;
}

serveStdio(createServer, { legacy: "reject" });
