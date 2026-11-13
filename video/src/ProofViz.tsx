import React from "react";
import { Img, interpolate, interpolateColors, random, staticFile } from "remotion";
import D from "./proof-data.json";
import { P, SANS, MONO, STICK, clamp, sp, rise, ease, ink, In, Pill, Card, Counter } from "./ProofKit";

// Data motion for "the rug, explained": every number here comes from src/proof-data.json (GeckoTerminal, RugCheck, Solana RPC).
const usd = (v: number, d = 2) => `$${v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;

// ---------- The chart: a 40-minute staircase, my buy, the creator's sell ----------
// x is minutes after 10:31; prices are the pool's 1-minute closes, then the dump at 11:11:06 and the flat line after it.
const BUY_M = 34 + 43 / 60, DUMP_M = 40 + 6 / 60, END_M = 44;
const PTS: [number, number][] = [
  ...D.candles.slice(0, 40).map((c, i) => [i + 1, c.c] as [number, number]),
  [DUMP_M - 0.02, D.priceBefore], [DUMP_M + 0.05, D.priceAfter], [END_M, D.priceAfter],
];
PTS.unshift([0.9, D.candles[0]!.o]);
const priceAt = (m: number) => {
  if (m <= PTS[0]![0]) return PTS[0]![1];
  for (let i = 1; i < PTS.length; i++) if (m <= PTS[i]![0]) {
    const [a, pa] = PTS[i - 1]!, [b, pb] = PTS[i]!;
    return pa + ((pb - pa) * (m - a)) / (b - a);
  }
  return PTS[PTS.length - 1]![1];
};
export const RugChart: React.FC<{ f: number; draw: [number, number]; dumpAt?: number; x?: number; y?: number; w?: number; h?: number; compact?: boolean }> =
  ({ f, draw, dumpAt, x = 110, y = 150, w = 1700, h = 680, compact }) => {
    // Drawing runs from the pool's birth to just before the dump over `draw`; the dump lands on dumpAt (or right after the draw).
    const dAt = dumpAt ?? draw[1] + 4;
    const pre = interpolate(f, draw, [0.9, DUMP_M - 0.03], clamp);
    const m = f < dAt ? pre : interpolate(f, [dAt, dAt + 4, dAt + 34], [DUMP_M - 0.03, DUMP_M + 0.06, END_M], clamp);
    const top = 1.2e-3, X = (mm: number) => (mm / END_M) * w, Y = (p: number) => h - (p / top) * h;
    const seen = PTS.filter(([mm]) => mm <= m);
    const head: [number, number] = [m, priceAt(m)];
    const before = [...seen.filter(([mm]) => mm < DUMP_M), ...(m < DUMP_M ? [head] : [[DUMP_M - 0.02, D.priceBefore] as [number, number]])];
    const after = m >= DUMP_M ? [[DUMP_M - 0.02, D.priceBefore] as [number, number], ...seen.filter(([mm]) => mm > DUMP_M), head] : [];
    const path = (pts: [number, number][]) => pts.map(([mm, p], i) => `${i ? "L" : "M"}${X(mm).toFixed(1)},${Y(p).toFixed(1)}`).join(" ");
    const crashed = f >= dAt + 3;
    const shake = crashed && f < dAt + 16 ? Math.sin(f * 2.7) * (16 - (f - dAt)) * 0.9 : 0;
    const flash = crashed ? Math.max(0, 1 - (f - dAt - 3) / 10) : 0;
    const bought = m >= BUY_M, value = bought ? D.buy.tokens * priceAt(m) : D.buy.usd;
    const tagX = X(BUY_M), tagY = Y(D.buy.priceUsd);
    // the frame the line reaches my buy: the readout fades in and the top gridline draws back to make room for it
    const fBuy = draw[0] + ((BUY_M - 0.9) / (DUMP_M - 0.03 - 0.9)) * (draw[1] - draw[0]), room = rise(f, fBuy, fBuy + 10);
    const label = (t: string) => ({ fill: P.darkMuted, fontFamily: SANS, fontWeight: 500, style: { fontVariantNumeric: "tabular-nums" } as React.CSSProperties, children: t });
    return (
      <div style={{ position: "absolute", left: x + shake, top: y, width: w, height: h }}>
        {/* the chart sits on a dark card in the same frame as the screens around it */}
        <Card dark radius={28} style={{ left: -50, top: -46, width: w + 100, height: h + 124 }} />
        <svg width={w} height={h} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <defs>
            <linearGradient id="rcArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={P.green} stopOpacity={0.26} /><stop offset="1" stopColor={P.green} stopOpacity={0} /></linearGradient>
          </defs>
          {[0, 5e-4, 1e-3].map((p) => <line key={p} x1={p === 1e-3 ? 520 * room : 0} x2={w} y1={Y(p)} y2={Y(p)} stroke={P.darkLine} strokeWidth={2} />)}
          {!compact && [[5e-4, "$0.0005"], [1e-3, "$0.0010"]].map(([p, t]) => (
            <text key={t as string} x={w} y={Y(p as number) - 12} textAnchor="end" fontSize={24} {...label(t as string)} />
          ))}
          {!compact && [[0.9, "10:31"], [14, "10:45"], [29, "11:00"], [DUMP_M, "11:11"]].map(([mm, t]) => (
            <text key={t as string} x={X(mm as number)} y={h + 42} textAnchor="middle" fontSize={26} {...label(t as string)} />
          ))}
          {before.length > 1 && <path d={`${path(before)} L${X(before[before.length - 1]![0]).toFixed(1)},${h} L${X(before[0]![0]).toFixed(1)},${h} Z`} fill="url(#rcArea)" />}
          {before.length > 1 && <path d={path(before)} fill="none" stroke={P.green} strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" />}
          {after.length > 1 && <path d={path(after)} fill="none" stroke={P.red} strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" />}
          <circle cx={X(head[0])} cy={Y(head[1])} r={11} fill={m >= DUMP_M ? P.red : P.green} stroke={P.dark} strokeWidth={4} />
          {bought && <>
            <line x1={tagX} x2={tagX} y1={tagY} y2={h} stroke={P.blue} strokeWidth={2.5} strokeDasharray="6 8" />
            <circle cx={tagX} cy={tagY} r={12} fill={P.blue} stroke={P.dark} strokeWidth={4} />
          </>}
          {crashed && <line x1={X(DUMP_M)} x2={X(DUMP_M)} y1={Y(D.priceBefore) - 30} y2={h} stroke={P.red} strokeWidth={3} strokeDasharray="6 8" />}
        </svg>
        {m >= 1.2 && !compact && (
          <In f={f} at={draw[0] + 6} style={{ left: X(0.9) - 4, top: Y(D.candles[0]!.o) + 34 }}>
            <Pill color={P.dim} size={22}>Pool created · 10:31</Pill>
          </In>
        )}
        {bought && (
          <div style={{ position: "absolute", left: tagX - 24, top: tagY - 64, transform: "translateX(-100%)" }}>
            <Pill color={P.blue} solid size={compact ? 24 : 28} tilt={-2}>I bought $2 · 11:05</Pill>
          </div>
        )}
        {crashed && !compact && (
          <div style={{ position: "absolute", right: w - X(DUMP_M) + 18, top: Y(D.priceBefore) - 58, whiteSpace: "nowrap", opacity: rise(f, dAt + 4, dAt + 12) }}>
            <Pill color={P.red} solid size={26} tilt={1.5}>11:11:06 · creator sells $39,979</Pill>
          </div>
        )}
        {/* the position, live */}
        {bought && (
          <div style={{ position: "absolute", left: 40, top: 10, opacity: room }}>
            <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: compact ? 26 : 32, color: P.darkMuted }}>My $2 is now</div>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: compact ? 76 : 104, letterSpacing: -3, lineHeight: 1.1, color: m >= DUMP_M ? P.red : value >= 2 ? P.green : P.darkText,
              fontVariantNumeric: "tabular-nums" }}>{value < 0.1 ? usd(value, 4) : usd(value)}</div>
          </div>
        )}
        {crashed && (
          <div style={{ position: "absolute", left: X(DUMP_M) - 800, top: h * 0.44, transform: `rotate(-4deg) scale(${interpolate(f - dAt - 3, [0, 6, 10], [2.2, 0.94, 1], clamp)})`, opacity: rise(f, dAt + 3, dAt + 6),
            fontFamily: SANS, fontWeight: 750, fontSize: compact ? 120 : 160, color: "#FFFFFF", background: P.red, letterSpacing: -5, lineHeight: 1, padding: "16px 38px 22px", borderRadius: 30,
            boxShadow: "0 24px 60px -12px rgba(0,0,0,0.6)" }}>−99.8%</div>
        )}
        {flash > 0 && <div style={{ position: "absolute", left: -x, top: -y, width: 1920, height: 1080, background: P.red, opacity: flash * 0.22, pointerEvents: "none" }} />}
      </div>
    );
  };

// ---------- The minute before the dump: a swarm of tiny buys, then one wallet ----------
export const Swarm: React.FC<{ f: number; at: number; dump: number; hollow?: number }> = ({ f, at, dump, hollow = 1e9 }) => {
  // a sunflower spiral, not a grid: dot i sits at radius ∝ √i, turned by the golden angle, so the swarm blooms outward as wallets arrive
  const N = D.minuteBefore.uniqueBuyerWallets, cx0 = 500, cy0 = 440, step = 16.3, R = step * Math.sqrt(N), GOLD = Math.PI * (3 - Math.sqrt(5));
  const k = sp(f, dump, 14, 120), away = 1 - rise(f, dump + 6, dump + 18);
  // "trades worth nothing": the buying that looked green turns out to be empty
  const empty = interpolateColors(rise(f, hollow, hollow + 12), [0, 1], [P.green, "#B4B8BF"]);
  return (
    <>
      {/* each wallet appears as it buys and dies red at the dump, centre outward; then the field clears for the one wallet that sold */}
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, opacity: away }}>
        {Array.from({ length: N }, (_, i) => {
          const t0 = at + Math.floor((i / N) * 70 + random(`sw${i}`) * 10);
          if (f < t0) return null;
          const r = step * Math.sqrt(i + 0.5), th = i * GOLD;
          const cx = cx0 + r * Math.cos(th) + Math.sin(f / 23 + i) * 1.5, cy = cy0 + r * Math.sin(th) + Math.cos(f / 29 + i) * 1.5;
          const dead = f >= dump + 2 + Math.floor((r / R) * 8);
          const p = rise(f, t0, t0 + 6);
          return <circle key={i} cx={cx} cy={cy} r={9 * (0.5 + 0.5 * p)} fill={dead ? P.red : empty} opacity={p} />;
        })}
      </svg>
      <In f={f} at={at - 30} to={dump + 6} style={{ left: 100, width: 800, top: 150, textAlign: "center" }}>
        <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 28, color: P.muted }}>The 60 seconds before 11:11:06 · each dot is a wallet</div>
      </In>
      <div style={{ position: "absolute", left: 960, top: 230, display: "flex", flexDirection: "column", gap: 26, opacity: 1 - rise(f, dump, dump + 6) }}>
        {[
          [0, D.minuteBefore.trades, "trades in one minute", P.ink],
          [12, D.minuteBefore.uniqueBuyerWallets, "different wallets buying", P.ink],
          [24, D.minuteBefore.medianBuyUsd, "a typical buy, in dollars", P.ink],
          [36, D.minuteBefore.zeroDollarTrades, "trades worth $0.00", ink(P.red)],
        ].map(([dt, v, label, col], j) => (
          <In key={j} f={f} at={at + (dt as number)} style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 22 }}>
              <Counter f={f} at={at + (dt as number)} dur={12} from={j === 2 ? (v as number) : 0} to={v as number} fmt={(x) => (j === 2 ? `$${x.toFixed(2)}` : Math.round(x).toString())}
                style={{ fontFamily: SANS, fontWeight: 750, fontSize: 84, color: col as string, letterSpacing: -2.5, width: 250, display: "inline-block", textAlign: "right" }} />
              <span style={{ fontFamily: SANS, fontWeight: 500, fontSize: 38, color: P.ink, letterSpacing: -0.4 }}>{label as string}</span>
            </div>
          </In>
        ))}
      </div>
      {f >= dump && (
        <div style={{ position: "absolute", left: 100, top: 160, width: 1720, height: 760, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <Card dark radius={34} style={{ position: "relative", transform: `scale(${0.4 + 0.6 * k})`, opacity: Math.min(1, (f - dump + 1) / 3) }} inner={{ padding: "44px 72px", textAlign: "center" }}>
            <div style={{ fontFamily: SANS, fontWeight: 650, fontSize: 24, letterSpacing: 3, color: P.red }}>11:11:06 · ONE WALLET · THE CREATOR</div>
            <div style={{ fontFamily: SANS, fontWeight: 750, fontSize: 150, color: P.red, letterSpacing: -5, lineHeight: 1.08 }}>{usd(D.dump.usd, 0)}</div>
            <div style={{ fontFamily: SANS, fontWeight: 500, fontSize: 34, color: P.darkText }}>cashed out: 478 million tokens, sold in one transaction</div>
            <div style={{ fontFamily: MONO, fontSize: 24, color: P.darkMuted, marginTop: 14 }}>solscan.io/tx/{short(D.dump.tx)}</div>
          </Card>
        </div>
      )}
    </>
  );
};

// ---------- How PayBox works: the flow, one node per beat ----------
const NODES: { t: string; s: string; c: string; icon: string }[] = [
  { t: "You ask", s: "in ChatGPT or Claude", c: P.ink, icon: "chat" },
  { t: "Oddshot answers", s: "a plugin inside PayBox", c: P.blue, icon: "plug" },
  { t: "An unsigned swap", s: "built, never sent", c: P.yellow, icon: "doc" },
  { t: "PayBox shows you", s: "simulated first, keys stay inside", c: P.violet, icon: "shield" },
  { t: "You approve", s: "or it never happens", c: P.green, icon: "check" },
];
const Icon: React.FC<{ k: string; c: string }> = ({ k, c }) => (
  <svg width={70} height={70} viewBox="0 0 70 70">
    {k === "chat" && <path d="M10 14h50v32H30l-12 12V46h-8z" fill="none" stroke={c} strokeWidth={5} strokeLinejoin="round" />}
    {k === "plug" && <><path d="M24 8v14M46 8v14M16 22h38v12a19 19 0 0 1-38 0z" fill="none" stroke={c} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" /><path d="M35 53v10" stroke={c} strokeWidth={5} strokeLinecap="round" /></>}
    {k === "doc" && <><path d="M16 6h26l12 12v46H16z" fill="none" stroke={c} strokeWidth={5} strokeLinejoin="round" /><path d="M24 30h22M24 40h22M24 50h14" stroke={c} strokeWidth={4} strokeLinecap="round" /></>}
    {k === "shield" && <><path d="M35 6l24 9v17c0 15-10 26-24 32C21 58 11 47 11 32V15z" fill="none" stroke={c} strokeWidth={5} strokeLinejoin="round" /><rect x={26} y={30} width={18} height={14} rx={3} fill={c} /><path d="M29 30v-5a6 6 0 0 1 12 0v5" fill="none" stroke={c} strokeWidth={4} /></>}
    {k === "check" && <><circle cx={35} cy={35} r={27} fill="none" stroke={c} strokeWidth={5} /><path d="M22 36l9 9 17-19" fill="none" stroke={c} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" /></>}
  </svg>
);
export const Flow: React.FC<{ f: number; ats: number[]; y?: number }> = ({ f, ats, y = 330 }) => {
  const W = 300, gap = 52, x0 = (1920 - (5 * W + 4 * gap)) / 2;
  return (
    <>
      {NODES.map((n, i) => {
        const at = ats[i]!, on = f >= at, k = on ? sp(f, at, 14, 170) : 0, lit = on && f < (ats[i + 1] ?? 1e9);
        // the step being said turns into a dark card with its colour; the others stay white
        const col = lit ? (n.c === P.ink ? P.darkText : n.c) : ink(n.c);
        return (
          <React.Fragment key={i}>
            {i > 0 && f >= at - 4 && (
              <svg width={gap} height={40} style={{ position: "absolute", left: x0 + i * (W + gap) - gap, top: y + 112 }}>
                <line x1={4} y1={20} x2={4 + (gap - 18) * rise(f, at - 4, at + 4)} y2={20} stroke={P.ink} strokeWidth={4} strokeLinecap="round" />
                {on && <path d={`M${gap - 18},10 L${gap - 6},20 L${gap - 18},30`} fill="none" stroke={P.ink} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />}
              </svg>
            )}
            <Card dark={lit} radius={26} stack={false} style={{ left: x0 + i * (W + gap), top: y, width: W, height: 264, transform: `translateY(${(1 - k) * 30}px) scale(${0.92 + 0.08 * k})`,
              opacity: 0.35 + 0.65 * k }} inner={{ padding: "26px 24px" }}>
              <div style={{ fontFamily: SANS, fontWeight: 650, fontSize: 22, color: col, fontVariantNumeric: "tabular-nums" }}>0{i + 1}</div>
              <div style={{ position: "absolute", right: 22, top: 20 }}><Icon k={n.icon} c={col} /></div>
              <div style={{ position: "absolute", left: 24, right: 20, bottom: 26 }}>
                <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 28, color: lit ? P.darkText : P.ink, lineHeight: 1.1, letterSpacing: -0.5, whiteSpace: "nowrap" }}>{n.t}</div>
                <div style={{ fontFamily: SANS, fontWeight: 500, fontSize: 22, color: lit ? P.darkMuted : P.muted, marginTop: 8, lineHeight: 1.2, textWrap: "balance" }}>{n.s}</div>
              </div>
            </Card>
          </React.Fragment>
        );
      })}
    </>
  );
};

// ---------- Same steps, two coins ----------
const ROWS: [string, string, string, string, string][] = [
  ["Pool age at my buy", "34 minutes", "since 2023", "red", "green"],
  ["Liquidity", "$78K", "$5.3M", "yellow", "green"],
  ["Organic trading", "0 / 100", "76 / 100", "red", "green"],
  ["Safety check", "YELLOW · new pool, bots", "YELLOW · top 10 hold 31%", "yellow", "yellow"],
  ["Result", "−99.8%", "+0.0015 USDC, sold", "red", "green"],
];
export const Compare: React.FC<{ f: number; at: number; step?: number; y?: number; hot?: number; hot2?: number; yel?: [number, number] }> = ({ f, at, step = 14, y = 170, hot = 1e9, hot2, yel = [1e9, 1e9] }) => {
  const col = (k: string) => ink(k === "red" ? P.red : k === "green" ? P.green : P.yellow);
  const x0 = 170, c1 = 620, c2 = 1250, rowH = 118;
  // "two yellows": the safety row lights, then its two reasons are underlined; then the two rows that make the rug setup light red
  const under = (i: number) => rise(f, yel[1] + i * 6, yel[1] + i * 6 + 6) * (1 - rise(f, hot, hot + 8));
  const cell = (v: string, i: number, row: number) => {
    if (row !== 3) return v;
    const [lead, why] = v.split(" · ");
    return <>{lead} · <span style={{ position: "relative" }}>{why}<span style={{ position: "absolute", left: 0, bottom: -8, height: 5, borderRadius: 3, width: `${100 * under(i)}%`, background: ink(P.yellow) }} /></span></>;
  };
  return (
    <>
      <Card radius={34} style={{ left: x0 - 60, top: y - 40, width: 1700, height: 740, opacity: rise(f, at - 2, at + 8) }} />
      <In f={f} at={at} style={{ left: c1, top: y }}><div style={{ fontFamily: SANS, fontWeight: 750, fontSize: 56, letterSpacing: -1.5, color: ink(P.red) }}>$NVIDIA</div></In>
      <In f={f} at={at + 4} style={{ left: c2, top: y }}><div style={{ fontFamily: SANS, fontWeight: 750, fontSize: 56, letterSpacing: -1.5, color: ink(P.green) }}>$WIF</div></In>
      {f >= yel[0] && f < hot + 8 && (
        <div style={{ position: "absolute", left: x0 - 24, top: y + 100 + 3 * rowH - 4, width: 1630, height: rowH - 10, borderRadius: 18, background: `${P.yellow}4d`,
          opacity: rise(f, yel[0], yel[0] + 8) * (1 - rise(f, hot, hot + 8)) }} />
      )}
      {[[0, hot], [2, hot2 ?? hot + 6]].map(([i, t]) => f >= t! && (
        <div key={`h${i}`} style={{ position: "absolute", left: x0 - 24, top: y + 100 + i! * rowH - 4, width: c2 - x0 - 30, height: rowH - 10, borderRadius: 18, background: `${P.red}17`,
          border: `2px solid ${P.red}`, opacity: rise(f, t!, t! + 8) }} />
      ))}
      {ROWS.map(([label, a, b, ca, cb], i) => {
        const t = at + 10 + i * step;
        return (
          <In key={i} f={f} at={t} dy={18} style={{ left: x0, top: y + 100 + i * rowH, width: 1580 }}>
            <div style={{ display: "flex", alignItems: "center", height: rowH - 18, borderTop: `1.5px solid ${P.line}` }}>
              <div style={{ width: c1 - x0, fontFamily: SANS, fontWeight: 500, fontSize: 32, color: P.muted }}>{label}</div>
              <div style={{ width: c2 - c1, fontFamily: SANS, fontWeight: 650, fontSize: i === 4 ? 52 : 40, letterSpacing: -0.6, color: col(ca) }}>{cell(a, 0, i)}</div>
              <div style={{ fontFamily: SANS, fontWeight: 650, fontSize: i === 4 ? 52 : 40, letterSpacing: -0.6, color: col(cb) }}>{cell(b, 1, i)}</div>
            </div>
          </In>
        );
      })}
    </>
  );
};

// ---------- Receipts: every transaction in this video, on Solana ----------
const TXS: [string, string, string, string][] = [
  ["03:52:50", "MoonPay → my PayBox wallet, 4.84 USDC", D.moonpay.tx, P.violet],
  ["11:05:43", "My $2 buy of $NVIDIA", D.buy.tx, P.blue],
  ["11:11:06", "The creator sells $39,979", D.dump.tx, P.red],
  ["11:15:24", "My $1.50 buy of $WIF", D.wif.buy.tx, P.green],
  ["11:16:55", "Sold, $1.5015 back", D.wif.sell.tx, P.green],
];
export const Receipts: React.FC<{ f: number; at: number; y?: number }> = ({ f, at, y = 230 }) => (
  <>
    {TXS.map(([t, what, tx, c], i) => (
      <In key={i} f={f} at={at + i * 7} dy={20} style={{ left: 230, top: y + i * 112, width: 1460 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 30, padding: "18px 34px", borderRadius: 22, background: P.card, boxShadow: STICK }}>
          <span style={{ width: 14, height: 14, borderRadius: 7, background: c, flexShrink: 0 }} />
          <div style={{ fontFamily: SANS, fontWeight: 650, fontSize: 30, color: P.ink, width: 150, fontVariantNumeric: "tabular-nums" }}>{t}</div>
          <div style={{ flex: 1, fontFamily: SANS, fontWeight: 650, fontSize: 38, color: P.ink, letterSpacing: -0.6 }}>{what}</div>
          <div style={{ fontFamily: MONO, fontSize: 27, color: P.muted }}>{short(tx)}</div>
        </div>
      </In>
    ))}
    <In f={f} at={at + TXS.length * 7 + 4} style={{ left: 0, right: 0, top: y + TXS.length * 112 + 14, textAlign: "center" }}>
      <div style={{ fontFamily: SANS, fontWeight: 650, fontSize: 34, color: P.ink, letterSpacing: -0.4 }}>Full Solscan links in the post</div>
    </In>
  </>
);

// ---------- End card: how to start, credits ----------
export const EndCard: React.FC<{ f: number; at: number; steps: number[]; titleOut?: number }> = ({ f, at, steps, titleOut = 0 }) => {
  const k = sp(f, at, 15, 120);
  return (
    <>
      <div style={{ position: "absolute", left: 0, right: 0, top: 140, textAlign: "center", transform: `scale(${0.85 + 0.15 * k})`, opacity: k * (1 - titleOut) }}>
        <div style={{ fontFamily: SANS, fontWeight: 750, fontSize: 176, letterSpacing: -7, color: P.ink, lineHeight: 1 }}>Oddshot</div>
        <div style={{ marginTop: 26, display: "inline-block" }}><Pill color={P.green} solid size={32} tilt={-2}>Live on PayBox</Pill></div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 470, display: "flex", justifyContent: "center", gap: 30 }}>
        {[["1", "Fund PayBox", "straight from MoonPay"], ["2", "Plugins → Oddshot", "switch it on"], ["3", "Ask your AI", "you approve every trade"]].map(([n, a, b], i) => {
          const p = steps[i] !== undefined && f >= steps[i]! ? sp(f, steps[i]!, 14, 170) : 0, lit = p > 0.5;
          return (
            <div key={i} style={{ width: 430, padding: "28px 30px", borderRadius: 26, background: P.card, boxShadow: lit ? `0 0 0 3px ${P.green}, ${STICK}` : STICK, opacity: 0.35 + 0.65 * p,
              transform: `translateY(${(1 - p) * 26}px)`, boxSizing: "border-box" }}>
              <div style={{ width: 46, height: 46, borderRadius: 23, background: lit ? P.green : P.ink, color: lit ? P.ink : "#FFFFFF", fontFamily: SANS, fontWeight: 700, fontSize: 24,
                display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</div>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 40, color: P.ink, marginTop: 14, letterSpacing: -1 }}>{a}</div>
              <div style={{ fontFamily: SANS, fontWeight: 500, fontSize: 26, color: P.muted, marginTop: 6 }}>{b}</div>
            </div>
          );
        })}
      </div>
      <In f={f} at={(steps[2] ?? at) + 20} style={{ left: 0, right: 0, top: 770 }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 22 }}>
          <Img src={staticFile("update/moonpay-logo.png")} style={{ width: 58, height: 58, borderRadius: 14 }} />
          <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 34, color: P.ink }}>MoonPay</span>
          <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 34, color: P.dim, margin: "0 6px" }}>×</span>
          <Img src={staticFile("update/paybox-logo.png")} style={{ width: 58, height: 58, borderRadius: 14 }} />
          <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 34, color: P.ink }}>PayBox</span>
          <span style={{ width: 2, height: 46, background: "rgba(15,16,18,0.15)", margin: "0 18px" }} />
          <span style={{ fontFamily: SANS, fontWeight: 650, fontSize: 32, color: P.ink }}>Hackathon finalist · built by Dappest Dev</span>
        </div>
        <div style={{ textAlign: "center", fontFamily: SANS, fontWeight: 500, fontSize: 28, color: P.muted, marginTop: 24 }}>
          Real runs, Oct 27, 2026 · memecoins are risky · this is not financial advice
        </div>
      </In>
    </>
  );
};
export { usd, short, ease };
