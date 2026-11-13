// How the Pro board and the scorecard read: plain text for the AI that fetched the board, and one HTML page for people.
import { boardLines, hhmm, pct, px } from "../../src/plugin.js";
import { changePct, type Summary } from "./grade.js";
import type { Board, ProPlay } from "./scanner.js";
import type { Call } from "./store.js";

const span = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`);
const ago = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 90 ? `${s} s` : span(Math.round(s / 60)); };

/** The watch line under a play: how long the server has seen this odds move and what the coin did since. A move that was already under
 *  way when the watch started says only what changed since, and nothing while nothing has. */
export function watchLine(p: ProPlay): string {
  const w = p.watch;
  if (!w) return "";
  const from = hhmm(Date.parse(w.firstSeenAt));
  const oddsMoved = Math.abs(w.oddsNowPct - w.oddsThenPct) >= 0.5;
  const odds = oddsMoved ? `odds ${w.oddsThenPct}% → ${w.oddsNowPct}% since` : "odds steady since";
  const meme = p.token && w.memeSince ? ` $${p.token.symbol} ${pct(w.memeSince.changePct)} since ${hhmm(Date.parse(w.memeSince.at))} UTC.` : "";
  if (w.beforeWatch) {
    if (w.minutesWatched < 5 || (!oddsMoved && !(w.memeSince && Math.abs(w.memeSince.changePct) >= 1))) return "";
    return `\n   👁 On Oddshot's watch since ${from} UTC (already moving then): ${odds}.${meme}`;
  }
  return `\n   👁 Oddshot first saw this move ${span(w.minutesWatched)} ago (${from} UTC): ${odds}.${meme}`;
}

/** A story whose odds are moving with no liquid meme behind it yet: one line. */
const quietLine = (p: ProPlay) =>
  `• ${p.mover.direction === "up" ? "▲" : "▼"} ${p.mover.changePts > 0 ? "+" : ""}${p.mover.changePts} pts → ${p.mover.probabilityPct}% "${p.mover.question}" (${p.mover.venue})` +
  (p.watch && !p.watch.beforeWatch ? ` · first seen ${span(p.watch.minutesWatched)} ago` : "");

export function scoreLine(s: Summary, url: string): string {
  if (!s.calls) return `📊 Pro scorecard: no calls yet. Every call is graded 24 h later, misses included: ${url}`;
  const graded = s.graded + s.void
    ? `${s.graded} graded at 24 h: ${s.hit} HIT · ${s.miss} MISS · ${s.flat} FLAT${s.void ? ` · ${s.void} VOID` : ""}${s.median24hPct !== null ? ` · median ${pct(s.median24hPct)}` : ""}`
    : "none graded yet (each is graded 24 h after the call)";
  return `📊 Pro scorecard: ${s.calls} call${s.calls === 1 ? "" : "s"}, ${graded}${s.open ? `, ${s.open} open` : ""}. Every call, misses included: ${url}`;
}

export function boardText(b: Board, s: Summary, scorecardUrl: string, now = Date.now()): string {
  const head = `🎯 ODDSHOT PRO BOARD · ${b.window} odds moves → memes${b.focus ? ` · focus ${b.focus}` : ""} · built ${ago(now - b.builtAt)} ago (${hhmm(b.builtAt)} UTC)`;
  const plays = b.plays.filter((p) => p.token);
  const quiet = b.plays.filter((p) => !p.token).slice(0, 5);
  const next = plays.length ? "\nNext: check_token for the full seatbelt report, or ape with a mint and an amount. PayBox asks you to approve." : "";
  const quietBlock = quiet.length ? `\n🕳 Odds moving, no safe meme yet:\n${quiet.map(quietLine).join("\n")}` : "";
  const lines = plays.length || !quiet.length ? boardLines(plays, b.focus, (p) => watchLine(p as ProPlay)) : `No meme plays${b.focus ? ` in ${b.focus}` : ""} right now.`;
  return `${head}\n${lines}${quietBlock}${next}\n${scoreLine(s, scorecardUrl)}\nData and analysis, not financial advice.`;
}

// ---------- The public scorecard page ----------

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const when = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");
const move = (from: number, to: number | null) => {
  if (to === null) return `<td class="n dim">–</td>`;
  const c = changePct(from, to);
  return `<td class="n ${c >= 10 ? "up" : c <= -10 ? "down" : ""}">${esc(pct(c))}</td>`;
};

export function scorecardPage(calls: Call[], s: Summary, now = Date.now()): string {
  const rows = calls.map((c) => `
      <tr>
        <td class="t">${when(c.at)}</td>
        <td><a href="https://dexscreener.com/solana/${esc(c.mint)}" rel="noopener">$${esc(c.symbol)}</a><div class="sub">${esc(c.role)} · ${esc(c.verdict)}</div></td>
        <td class="q"><a href="${esc(c.url)}" rel="noopener">${esc(c.question)}</a><div class="sub">${esc(c.venue)} · ${c.changePts > 0 ? "+" : ""}${c.changePts} pts → ${c.oddsPct}%</div></td>
        <td class="n">$${esc(px(c.price))}</td>
        ${move(c.price, c.p1h)}${move(c.price, c.p6h)}${move(c.price, c.p24h)}${move(c.price, c.peak)}
        <td><span class="g ${(c.grade ?? "open").toLowerCase()}">${c.grade ?? "open"}</span></td>
      </tr>`).join("");
  const summary = s.calls
    ? `${s.calls} call${s.calls === 1 ? "" : "s"} so far. ${s.graded} graded at 24 hours: <b>${s.hit} HIT</b>, <b>${s.miss} MISS</b>, <b>${s.flat} FLAT</b>${s.void ? `, ${s.void} VOID (no price read at 24 hours)` : ""}.${s.median24hPct !== null ? ` Median move at 24 hours: <b>${esc(pct(s.median24hPct))}</b>.` : ""}${s.open ? ` ${s.open} still open.` : ""}`
    : "No calls yet. The first one appears the moment the board finds an EARLY play.";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Oddshot Pro scorecard</title>
<meta name="description" content="Every Oddshot Pro call, graded 24 hours later. Misses included.">
<style>
  :root { --bg: #EDEDF0; --ink: #0F1012; --muted: #5F636B; --dim: #A9ADB4; --line: #E3E4E8; --card: #FFFFFF;
    --green-ink: #13963D; --red-ink: #DF3328; --yellow-ink: #A66D00; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Inter, system-ui, sans-serif; color: var(--ink); background: var(--bg); font-size: 16px; line-height: 1.55; }
  main { max-width: 1100px; margin: 0 auto; padding: 48px 16px 64px; }
  h1 { font-size: clamp(28px, 5vw, 40px); letter-spacing: -.02em; margin: 0 0 8px; }
  .lede { color: var(--muted); max-width: 720px; margin: 0 0 24px; }
  .sum { background: var(--card); border-radius: 18px; padding: 18px 22px; margin-bottom: 20px; box-shadow: 0 1px 2px rgba(15,16,18,.08); }
  .wrap { background: var(--card); border-radius: 18px; overflow-x: auto; box-shadow: 0 1px 2px rgba(15,16,18,.08); }
  table { border-collapse: collapse; width: 100%; min-width: 860px; font-size: 14px; }
  th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 600; }
  tr:last-child td { border-bottom: 0; }
  a { color: var(--ink); text-decoration-color: var(--dim); text-underline-offset: 3px; }
  .sub { color: var(--muted); font-size: 12px; margin-top: 2px; }
  .q { max-width: 360px; }
  .t { white-space: nowrap; color: var(--muted); font-variant-numeric: tabular-nums; }
  .n { font-family: ui-monospace, "JetBrains Mono", monospace; white-space: nowrap; text-align: right; }
  .up { color: var(--green-ink); } .down { color: var(--red-ink); } .dim { color: var(--dim); }
  .g { display: inline-block; font-size: 12px; font-weight: 700; padding: 2px 9px; border-radius: 999px; background: #F1F2F4; color: var(--muted); }
  .g.hit { background: #E3F7E8; color: var(--green-ink); } .g.miss { background: #FDE7E5; color: var(--red-ink); }
  .g.flat { background: #FFF4D6; color: var(--yellow-ink); }
  footer { color: var(--muted); font-size: 13px; margin-top: 20px; }
</style>
</head>
<body>
<main>
  <h1>Oddshot Pro scorecard</h1>
  <p class="lede">Every call the Pro board makes is logged the minute it appears and graded 24 hours later from the coin's price. A call is an EARLY play: the odds moved, the crowd is piling in, and the meme hasn't moved yet. HIT means +10% or more at 24 hours, MISS −10% or worse, FLAT in between. Misses stay on this page.</p>
  <div class="sum">${summary}</div>
  <div class="wrap">
    <table>
      <thead><tr><th>Called (UTC)</th><th>Coin</th><th>Odds move</th><th class="n">Price at call</th><th class="n">1 h</th><th class="n">6 h</th><th class="n">24 h</th><th class="n">Peak</th><th>Grade</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="9" class="dim">No calls yet.</td></tr>`}</tbody>
    </table>
  </div>
  <footer>Updated ${when(now)} UTC. Prices from DexScreener, odds from Polymarket and Kalshi. Data and analysis, not financial advice. <a href="https://0xdopewilly.github.io/oddshot/">How Oddshot works</a></footer>
</main>
</body>
</html>`;
}
