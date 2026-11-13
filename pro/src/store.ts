// What the Pro server remembers between scans: every odds move it has seen (and when it first saw it), the prices of the coins on its
// boards, and every call it has made with its grade. Node's built-in SQLite, one file, no server.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Story = { key: string; venue: string; question: string; url: string; firstSeen: number; firstProb: number; beforeWatch: boolean; lastSeen: number; lastProb: number };
export type Grade = "HIT" | "MISS" | "FLAT" | "VOID";
export type Call = {
  id: number; at: number; window: string; story: string; venue: string; question: string; url: string; oddsPct: number; changePts: number;
  narrative: string; mint: string; symbol: string; verdict: string; role: string; playScore: number; price: number;
  p1h: number | null; p6h: number | null; p24h: number | null; peak: number; trough: number; last: number; lastAt: number;
  grade: Grade | null; gradedAt: number | null;
};

const DAY = 86_400_000;
const RETURN_MS = 2 * 3_600_000;

export class Store {
  readonly db: DatabaseSync;

  constructor(file: string) {
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS stories (
        key TEXT PRIMARY KEY, venue TEXT NOT NULL, question TEXT NOT NULL, url TEXT NOT NULL,
        first_seen INTEGER NOT NULL, first_prob REAL NOT NULL, before_watch INTEGER NOT NULL,
        last_seen INTEGER NOT NULL, last_prob REAL NOT NULL);
      CREATE TABLE IF NOT EXISTS prices (mint TEXT NOT NULL, at INTEGER NOT NULL, price REAL NOT NULL, PRIMARY KEY (mint, at));
      CREATE TABLE IF NOT EXISTS calls (
        id INTEGER PRIMARY KEY, at INTEGER NOT NULL, window TEXT NOT NULL, story TEXT NOT NULL, venue TEXT NOT NULL,
        question TEXT NOT NULL, url TEXT NOT NULL, odds_pct REAL NOT NULL, change_pts REAL NOT NULL, narrative TEXT NOT NULL,
        mint TEXT NOT NULL, symbol TEXT NOT NULL, verdict TEXT NOT NULL, role TEXT NOT NULL, play_score INTEGER NOT NULL,
        price REAL NOT NULL, p1h REAL, p6h REAL, p24h REAL, peak REAL NOT NULL, trough REAL NOT NULL,
        last REAL NOT NULL, last_at INTEGER NOT NULL, grade TEXT, graded_at INTEGER);
      CREATE INDEX IF NOT EXISTS calls_mint ON calls (mint, at);
      CREATE INDEX IF NOT EXISTS calls_open ON calls (grade);
      CREATE TABLE IF NOT EXISTS scans (at INTEGER NOT NULL, window TEXT NOT NULL, ms INTEGER NOT NULL, plays INTEGER NOT NULL, error TEXT);
    `);
  }

  /** Records the odds moves one scan read. `beforeWatch` marks moves first seen by a scan that started the watch (the first after a
   *  start or a long gap): those were already moving, so the server can't say when they began. A market that left the movers for two
   *  hours and came back is a new move, timed from its return. */
  saveStories(at: number, movers: { key: string; venue: string; question: string; url: string; prob: number }[], beforeWatch: boolean) {
    const upsert = this.db.prepare(`
      INSERT INTO stories (key, venue, question, url, first_seen, first_prob, before_watch, last_seen, last_prob)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (key) DO UPDATE SET
        first_seen = CASE WHEN excluded.last_seen - stories.last_seen > ${RETURN_MS} THEN excluded.first_seen ELSE stories.first_seen END,
        first_prob = CASE WHEN excluded.last_seen - stories.last_seen > ${RETURN_MS} THEN excluded.first_prob ELSE stories.first_prob END,
        before_watch = CASE WHEN excluded.last_seen - stories.last_seen > ${RETURN_MS} THEN excluded.before_watch ELSE stories.before_watch END,
        last_seen = excluded.last_seen, last_prob = excluded.last_prob`);
    this.tx(() => { for (const m of movers) upsert.run(m.key, m.venue, m.question, m.url, at, m.prob, beforeWatch ? 1 : 0, at, m.prob); });
  }

  story(key: string): Story | null {
    const r = this.db.prepare("SELECT * FROM stories WHERE key = ?").get(key) as any;
    return r ? { key: r.key, venue: r.venue, question: r.question, url: r.url, firstSeen: r.first_seen, firstProb: r.first_prob,
      beforeWatch: !!r.before_watch, lastSeen: r.last_seen, lastProb: r.last_prob } : null;
  }

  savePrices(at: number, prices: { mint: string; price: number }[]) {
    const ins = this.db.prepare("INSERT OR REPLACE INTO prices (mint, at, price) VALUES (?, ?, ?)");
    this.tx(() => { for (const p of prices) ins.run(p.mint, at, p.price); });
  }

  /** The first price recorded for a coin at or after `from`. */
  priceSince(mint: string, from: number): { at: number; price: number } | null {
    return (this.db.prepare("SELECT at, price FROM prices WHERE mint = ? AND at >= ? ORDER BY at LIMIT 1").get(mint, from) as any) ?? null;
  }

  /** Whether the coin was already called within the last day: one call per coin per day, however often it shows up. */
  calledSince(mint: string, since: number): boolean {
    return !!this.db.prepare("SELECT 1 FROM calls WHERE mint = ? AND at >= ? LIMIT 1").get(mint, since);
  }

  addCall(c: Omit<Call, "id" | "p1h" | "p6h" | "p24h" | "peak" | "trough" | "last" | "lastAt" | "grade" | "gradedAt">): number {
    const r = this.db.prepare(`
      INSERT INTO calls (at, window, story, venue, question, url, odds_pct, change_pts, narrative, mint, symbol, verdict, role, play_score,
        price, peak, trough, last, last_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(c.at, c.window, c.story, c.venue, c.question, c.url, c.oddsPct, c.changePts, c.narrative, c.mint, c.symbol, c.verdict, c.role,
        c.playScore, c.price, c.price, c.price, c.price, c.at);
    return Number(r.lastInsertRowid);
  }

  openCalls(): Call[] {
    return (this.db.prepare("SELECT * FROM calls WHERE grade IS NULL ORDER BY at").all() as any[]).map(toCall);
  }

  calls(limit = 500): Call[] {
    return (this.db.prepare("SELECT * FROM calls ORDER BY at DESC LIMIT ?").all(limit) as any[]).map(toCall);
  }

  updateCall(c: Call) {
    this.db.prepare(`UPDATE calls SET p1h = ?, p6h = ?, p24h = ?, peak = ?, trough = ?, last = ?, last_at = ?, grade = ?, graded_at = ? WHERE id = ?`)
      .run(c.p1h, c.p6h, c.p24h, c.peak, c.trough, c.last, c.lastAt, c.grade, c.gradedAt, c.id);
  }

  logScan(at: number, window: string, ms: number, plays: number, error: string | null) {
    this.db.prepare("INSERT INTO scans (at, window, ms, plays, error) VALUES (?, ?, ?, ?, ?)").run(at, window, ms, plays, error);
  }

  /** The last successful scan's time, to tell a fresh start (or a long outage) from a running watch. */
  lastScanAt(): number | null {
    const r = this.db.prepare("SELECT MAX(at) AS at FROM scans WHERE error IS NULL").get() as any;
    return r?.at ?? null;
  }

  /** Drops what no longer matters: prices and scan logs older than three days, moves unseen for three days. Calls are kept forever. */
  prune(now: number) {
    this.db.prepare("DELETE FROM prices WHERE at < ?").run(now - 3 * DAY);
    this.db.prepare("DELETE FROM scans WHERE at < ?").run(now - 3 * DAY);
    this.db.prepare("DELETE FROM stories WHERE last_seen < ?").run(now - 3 * DAY);
  }

  private tx(fn: () => void) {
    this.db.exec("BEGIN");
    try { fn(); this.db.exec("COMMIT"); } catch (e) { this.db.exec("ROLLBACK"); throw e; }
  }
}

function toCall(r: any): Call {
  return {
    id: r.id, at: r.at, window: r.window, story: r.story, venue: r.venue, question: r.question, url: r.url, oddsPct: r.odds_pct,
    changePts: r.change_pts, narrative: r.narrative, mint: r.mint, symbol: r.symbol, verdict: r.verdict, role: r.role, playScore: r.play_score,
    price: r.price, p1h: r.p1h, p6h: r.p6h, p24h: r.p24h, peak: r.peak, trough: r.trough, last: r.last, lastAt: r.last_at,
    grade: r.grade, gradedAt: r.graded_at,
  };
}
