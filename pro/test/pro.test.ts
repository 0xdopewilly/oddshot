// Offline tests for what the scorecard and the watch promise: grades, checkpoints, VOID, story timing. Run: pnpm -C pro test
import assert from "node:assert/strict";
import { test } from "node:test";
import { advance, gradeOf, summarize } from "../src/grade.js";
import { withOrigin } from "../src/origin.js";
import { Store, type Call } from "../src/store.js";

const H = 3_600_000;
const T0 = Date.UTC(2026, 10, 13, 12, 0);

function call(over: Partial<Call> = {}): Call {
  return { id: 1, at: T0, window: "24h", story: "s", venue: "Polymarket", question: "q", url: "u", oddsPct: 50, changePts: 10, narrative: "n",
    mint: "m", symbol: "M", verdict: "GREEN", role: "OG", playScore: 50, price: 1, p1h: null, p6h: null, p24h: null, peak: 1, trough: 1,
    last: 1, lastAt: T0, grade: null, gradedAt: null, ...over };
}

test("grade lines match the receipt tool: +10% HIT, -10% MISS, between FLAT", () => {
  assert.equal(gradeOf(1, 1.1), "HIT");
  assert.equal(gradeOf(1, 1.0999), "HIT", "+9.99% shows as +10.0%: graded as shown");
  assert.equal(gradeOf(1, 1.0949), "FLAT");
  assert.equal(gradeOf(1, 0.9), "MISS", "-10% is -9.999…% in floating point; still a MISS");
  assert.equal(gradeOf(1, 0.9051), "FLAT");
});

test("checkpoints are taken on time and the 24h one grades the call", () => {
  let c = call();
  c = advance(c, 1.2, T0 + 1 * H + 60_000);
  assert.equal(c.p1h, 1.2);
  c = advance(c, 0.5, T0 + 6 * H + 60_000);
  assert.equal(c.p6h, 0.5);
  assert.equal(c.trough, 0.5);
  c = advance(c, 2, T0 + 12 * H);
  assert.equal(c.peak, 2);
  assert.equal(c.grade, null);
  c = advance(c, 1.15, T0 + 24 * H + 60_000);
  assert.equal(c.p24h, 1.15);
  assert.equal(c.grade, "HIT");
  assert.equal(advance(c, 0.1, T0 + 25 * H), c, "a graded call never changes");
});

test("a checkpoint missed during downtime stays empty instead of borrowing a later price", () => {
  const c = advance(call(), 3, T0 + 5 * H); // 1h checkpoint's grace (30 min) long gone, 6h not due
  assert.equal(c.p1h, null);
  assert.equal(c.p6h, null);
  assert.equal(c.last, 3);
});

test("no price at 24h within the grace makes the call VOID, and VOID is counted, not dropped", () => {
  let c = advance(call(), null, T0 + 26 * H);
  assert.equal(c.grade, null, "still inside the 3 h grace");
  c = advance(c, null, T0 + 27 * H + 1);
  assert.equal(c.grade, "VOID");
  const s = summarize([c, { ...call({ id: 2 }), p24h: 0.5, grade: "MISS" }]);
  assert.equal(s.void, 1);
  assert.equal(s.miss, 1);
  assert.equal(s.graded, 1, "VOID has no 24h price, so it is not in the median");
  assert.equal(s.median24hPct, -50);
});

test("a price read after the 24h grace can't grade; the call goes VOID", () => {
  const c = advance(call(), 5, T0 + 28 * H);
  assert.equal(c.p24h, null);
  assert.equal(c.grade, "VOID");
});

test("the watch: first sighting is kept, a return after two hours is a new move, boot sightings are flagged", () => {
  const s = new Store(":memory:");
  const m = (prob: number) => [{ key: "k", venue: "Polymarket", question: "q", url: "u", prob }];
  s.saveStories(T0, m(40), true);
  s.saveStories(T0 + 60_000, m(45), false);
  let st = s.story("k")!;
  assert.equal(st.firstSeen, T0);
  assert.equal(st.firstProb, 40);
  assert.equal(st.beforeWatch, true, "seen first by the boot scan: already moving");
  assert.equal(st.lastProb, 45);
  s.saveStories(T0 + 60_000 + 2 * H + 1, m(60), false);
  st = s.story("k")!;
  assert.equal(st.firstSeen, T0 + 60_000 + 2 * H + 1, "gone two hours, back: a new move");
  assert.equal(st.firstProb, 60);
  assert.equal(st.beforeWatch, false);
});

test("one call per coin per day", () => {
  const s = new Store(":memory:");
  const { id: _id, p1h: _a, p6h: _b, p24h: _c, peak: _d, trough: _e, last: _f, lastAt: _g, grade: _h, gradedAt: _i, ...base } = call();
  s.addCall(base);
  assert.equal(s.calledSince("m", T0 - 1), true);
  assert.equal(s.calledSince("m", T0 + 1), false);
  assert.equal(s.calledSince("other", 0), false);
  assert.equal(s.openCalls().length, 1);
});

test("behind an HTTPS proxy, requests take the public origin so the x402 challenge names the URL the plugin proposed", () => {
  const pub = "https://pro.example.app";
  const r = withOrigin(new Request("http://pro.example.app/pro/board?window=24h&focus=ai+agents", { headers: { "payment-signature": "x" } }), pub);
  assert.equal(r.url, "https://pro.example.app/pro/board?window=24h&focus=ai+agents");
  assert.equal(r.headers.get("payment-signature"), "x", "the payment header survives");
  const same = new Request("https://pro.example.app/health");
  assert.equal(withOrigin(same, pub), same);
  const local = new Request("http://127.0.0.1:8790/pro/board");
  assert.equal(withOrigin(local, null), local, "no PRO_PUBLIC_URL: untouched (local dev)");
});
