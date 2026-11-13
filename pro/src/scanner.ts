// The watch: every minute, build the 24h and 1h boards with no time limit, remember every odds move and when it was first seen, record
// the board coins' prices, log each fresh EARLY call, and grade the open calls. Paid requests read the latest boards, so they answer at once.
import { bestPairs, buildBoard, focusOf, inFocus, type BoardDepth, type Mover, type Play } from "../../src/plugin.js";
import { advance, changePct } from "./grade.js";
import type { Store, Story } from "./store.js";

export type Window = "24h" | "1h";
export const WINDOWS: Window[] = ["24h", "1h"];
/** Deeper than the free board (20 movers, 6 stories scored, 2 picks each, a 5 s budget): no call budget applies here. */
export const PRO_DEPTH: BoardDepth = { movers: 40, focusMovers: 80, keywords: 30, scoreStories: 10, picks: 3, moversMs: 8000, searchMs: 6000, scoreMs: 8000 };
export const BOARD = { stories: 8, minLiquidityUsd: 10_000, minVolume24hUsd: 5_000 };

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
/** A scan more than this after the last good one restarts the watch: moves seen then were already under way. */
const GAP_MS = 10 * MIN;

/** What the watch knows about a play's odds move: when it was first seen, the odds then and now, and the coin's move since. */
export type Watch = {
  firstSeenAt: string; minutesWatched: number; beforeWatch: boolean; oddsThenPct: number; oddsNowPct: number;
  memeSince: { at: string; changePct: number } | null;
};
export type ProPlay = Play & { watch: Watch | null };
export type Board = { window: Window; builtAt: number; ms: number; plays: ProPlay[]; focus: string | null };

export const storyKey = (m: Pick<Mover, "venue" | "url" | "question">) => `${m.venue}|${m.url}|${m.question}`;
/** A play is a call when its coin hasn't moved yet and the crowd is piling in: the board's "The window is open". */
export const isCall = (p: Play) => !!p.token && p.timing === "EARLY" && p.storyHeat === "heating";

/** Current USD prices from DexScreener, 30 coins a request. Coins it can't price are left out. */
export async function pricesOf(mints: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const unique = [...new Set(mints)];
  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30);
    const res = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${chunk.join(",")}`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
    const pairs = res?.ok ? await res.json().catch(() => []) : [];
    for (const t of bestPairs(Array.isArray(pairs) ? pairs : [])) if (chunk.includes(t.mint) && t.priceUsd) out.set(t.mint, t.priceUsd);
  }
  return out;
}

export class Scanner {
  readonly boards = new Map<Window, Board>();
  readonly errors = new Map<Window, { at: number; error: string }>();
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastPrune = 0;
  private focusCache = new Map<string, { at: number; board: Board }>();

  constructor(private readonly store: Store, private readonly log: (msg: string) => void = console.log) {}

  /** Scans now, then a minute after each scan ends (scans never overlap). */
  start() {
    const loop = async () => {
      await this.tick();
      this.timer = setTimeout(loop, MIN);
    };
    void loop();
  }

  stop() { if (this.timer) clearTimeout(this.timer); this.timer = null; }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const last = this.store.lastScanAt();
      const beforeWatch = last === null || Date.now() - last > GAP_MS;
      for (const window of WINDOWS) await this.scan(window, beforeWatch);
      await this.grade();
      if (Date.now() - this.lastPrune > 60 * MIN) { this.store.prune(Date.now()); this.lastPrune = Date.now(); }
    } catch (e) {
      this.log(`scan failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.running = false;
    }
  }

  private async scan(window: Window, beforeWatch: boolean) {
    const t0 = Date.now();
    try {
      const { plays, movers } = await buildBoard({ window, ...BOARD }, PRO_DEPTH);
      const at = Date.now();
      this.store.saveStories(at, movers.map((m) => ({ key: storyKey(m), venue: m.venue, question: m.question, url: m.url, prob: m.probabilityPct })), beforeWatch);
      this.store.savePrices(at, plays.flatMap((p) => (p.token?.priceUsd ? [{ mint: p.token.mint, price: p.token.priceUsd }] : [])));
      const pro = plays.map((p) => ({ ...p, watch: this.watchOf(p, at) }));
      for (const p of pro) this.maybeCall(p, window, at);
      this.boards.set(window, { window, builtAt: at, ms: at - t0, plays: pro, focus: null });
      this.errors.delete(window);
      this.store.logScan(at, window, at - t0, plays.length, null);
      this.log(`${window} board: ${plays.length} plays (${plays.filter((p) => p.token).length} with a coin) in ${((at - t0) / 1000).toFixed(1)} s`);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      this.errors.set(window, { at: Date.now(), error });
      this.store.logScan(Date.now(), window, Date.now() - t0, 0, error);
      this.log(`${window} board failed: ${error}`);
    }
  }

  watchOf(p: Play, now: number): Watch | null {
    const s: Story | null = this.store.story(storyKey(p.mover));
    if (!s) return null;
    const since = p.token ? this.store.priceSince(p.token.mint, s.firstSeen) : null;
    const nowPrice = p.token?.priceUsd ?? null;
    return {
      firstSeenAt: new Date(s.firstSeen).toISOString(),
      minutesWatched: Math.max(0, Math.round((now - s.firstSeen) / MIN)),
      beforeWatch: s.beforeWatch,
      oddsThenPct: s.firstProb,
      oddsNowPct: p.mover.probabilityPct,
      memeSince: since && nowPrice ? { at: new Date(since.at).toISOString(), changePct: Math.round(changePct(since.price, nowPrice) * 10) / 10 } : null,
    };
  }

  private maybeCall(p: ProPlay, window: Window, at: number) {
    const t = p.token;
    if (!isCall(p) || !t?.priceUsd || this.store.calledSince(t.mint, at - DAY)) return;
    this.store.addCall({
      at, window, story: storyKey(p.mover), venue: p.mover.venue, question: p.mover.question, url: p.mover.url,
      oddsPct: p.mover.probabilityPct, changePts: p.mover.changePts, narrative: p.narrative, mint: t.mint, symbol: t.symbol,
      verdict: t.verdict, role: t.role, playScore: p.playScore, price: t.priceUsd,
    });
    this.log(`call: $${t.symbol} on "${p.mover.question}" at $${t.priceUsd}`);
  }

  /** One price reading for every open call; checkpoints and grades follow grade.ts. */
  async grade(now = Date.now()) {
    const open = this.store.openCalls();
    if (!open.length) return;
    const prices = await pricesOf(open.map((c) => c.mint));
    for (const c of open) {
      const next = advance(c, prices.get(c.mint) ?? null, now);
      if (next !== c) this.store.updateCall(next);
      if (next.grade && !c.grade) this.log(`graded: $${c.symbol} ${next.grade}`);
    }
  }

  /** The board for a request: the latest scan, narrowed to a focus when one is asked. A focus with no coin on the cached board gets a
   *  board of its own, built on the spot and kept for three minutes. */
  async boardFor(window: Window, focus?: string): Promise<Board | null> {
    const base = this.boards.get(window) ?? null;
    if (!focus || !base) return base;
    const sector = focusOf(focus);
    const hits = (p: Play) => inFocus(sector, p.mover.question, p.mover.event, p.narrative, ...p.mover.narrativeKeywords, p.token?.symbol, p.token?.name);
    const narrowed = base.plays.filter(hits);
    if (narrowed.some((p) => p.token)) return { ...base, plays: narrowed, focus: sector.label };
    const key = `${window}|${sector.label}`;
    const cached = this.focusCache.get(key);
    if (cached && Date.now() - cached.at < 3 * MIN) return cached.board;
    const t0 = Date.now();
    const built = await buildBoard({ window, ...BOARD, focus }, PRO_DEPTH);
    const at = Date.now();
    const board: Board = { window, builtAt: at, ms: at - t0, plays: built.plays.map((p) => ({ ...p, watch: this.watchOf(p, at) })), focus: built.focus };
    this.focusCache.set(key, { at, board });
    for (const [k, v] of this.focusCache) if (at - v.at >= 3 * MIN) this.focusCache.delete(k);
    return board;
  }
}
