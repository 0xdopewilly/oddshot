// How a Pro call is graded: the coin's price 24 hours after the call against its price at the call, with the same lines as the
// plugin's receipt tool (HIT at +10% or more, MISS at -10% or worse, FLAT between). The 1h and 6h prices are recorded on the way.
// A checkpoint is only taken close to its time: if the server was down then, the checkpoint stays empty instead of borrowing a later
// price, and a call whose 24h price was never read is VOID, shown on the scorecard with the others, never dropped.
import type { Call, Grade } from "./store.js";

const H = 3_600_000;
export const HIT_PCT = 10;
export const MISS_PCT = -10;
/** How late each checkpoint may still be read. */
const GRACE = { p1h: 0.5 * H, p6h: 1 * H, p24h: 3 * H } as const;
const DUE = { p1h: 1 * H, p6h: 6 * H, p24h: 24 * H } as const;

export const changePct = (from: number, to: number) => (to / from - 1) * 100;

/** Graded on the change as shown (one decimal), so a call printed as -10.0% is a MISS, not FLAT by a float hair. */
export function gradeOf(price: number, p24h: number): Grade {
  const c = Math.round(changePct(price, p24h) * 10) / 10;
  return c >= HIT_PCT ? "HIT" : c <= MISS_PCT ? "MISS" : "FLAT";
}

/** The call after one more price reading (`price` null when the coin's price couldn't be read). */
export function advance(call: Call, price: number | null, now: number): Call {
  if (call.grade) return call;
  const c = { ...call };
  if (price !== null && price > 0) {
    c.last = price;
    c.lastAt = now;
    c.peak = Math.max(c.peak, price);
    c.trough = Math.min(c.trough, price);
    for (const k of ["p1h", "p6h", "p24h"] as const) {
      const due = c.at + DUE[k];
      if (c[k] === null && now >= due && now <= due + GRACE[k]) c[k] = price;
    }
    if (c.p24h !== null) { c.grade = gradeOf(c.price, c.p24h); c.gradedAt = now; }
  }
  if (!c.grade && now > c.at + DUE.p24h + GRACE.p24h) { c.grade = "VOID"; c.gradedAt = now; }
  return c;
}

export type Summary = { calls: number; open: number; graded: number; hit: number; miss: number; flat: number; void: number; avg24hPct: number | null; median24hPct: number | null };

export function summarize(calls: Call[]): Summary {
  const graded = calls.filter((c) => c.grade && c.grade !== "VOID" && c.p24h !== null);
  const moves = graded.map((c) => changePct(c.price, c.p24h!)).sort((a, b) => a - b);
  const mid = moves.length >> 1;
  return {
    calls: calls.length,
    open: calls.filter((c) => !c.grade).length,
    graded: graded.length,
    hit: calls.filter((c) => c.grade === "HIT").length,
    miss: calls.filter((c) => c.grade === "MISS").length,
    flat: calls.filter((c) => c.grade === "FLAT").length,
    void: calls.filter((c) => c.grade === "VOID").length,
    avg24hPct: moves.length ? moves.reduce((a, b) => a + b, 0) / moves.length : null,
    median24hPct: !moves.length ? null : moves.length % 2 ? moves[mid]! : (moves[mid - 1]! + moves[mid]!) / 2,
  };
}
