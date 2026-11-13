import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { loadFont as loadSans } from "@remotion/google-fonts/Inter";
import { loadFont as loadSerif } from "@remotion/google-fonts/InstrumentSerif";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import DATA from "./article-data.json";

// Images for the X article: editorial, dark, real numbers only.
const { fontFamily: SANS } = loadSans("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });
const { fontFamily: SERIF } = loadSerif("normal", { weights: ["400"], subsets: ["latin"] });
loadSerif("italic", { weights: ["400"], subsets: ["latin"] });
const { fontFamily: MONO } = loadMono("normal", { weights: ["400", "500"], subsets: ["latin"] });

const C = {
  bg: "#0F1115", card: "#15181E", line: "#262A33", grid: "#1C2027",
  ink: "#F3F1EC", ink2: "#B4B9C2", ink3: "#7D838E",
  odds: "#1FA86A", meme: "#D9772E", hit: "#1FA86A", miss: "#E5484D",
};
const D = DATA as { a: number; b: number; t0: number; t1: number; odds: [number, number][]; meme: [number, number][] };

const Logo: React.FC<{ src: string; size: number }> = ({ src, size }) => (
  <Img src={staticFile(`update/${src}`)} style={{ width: size, height: size, borderRadius: size * 0.22, border: `1px solid ${C.line}` }} />
);

/** Small-caps label with a swatch line for a series. */
const Key: React.FC<{ color: string; children: React.ReactNode; size?: number }> = ({ color, children, size = 17 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: SANS, fontWeight: 600, fontSize: size, letterSpacing: "0.12em", color: C.ink2, textTransform: "uppercase" }}>
    <div style={{ width: 28, height: 4, borderRadius: 2, background: color }} />{children}
  </div>
);

const Footer: React.FC<{ y: number; w: number; left: React.ReactNode }> = ({ y, w, left }) => (
  <div style={{ position: "absolute", left: 80, top: y, width: w - 160, display: "flex", justifyContent: "space-between", alignItems: "center",
    fontFamily: SANS, fontSize: 17, color: C.ink3 }}>
    <div>{left}</div>
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: SERIF, fontSize: 30, color: C.ink2 }}><Mark size={22} />Oddshot</div>
  </div>
);

/** Oddshot's mark: a target ring with a center dot. */
const Mark: React.FC<{ size: number; color?: string }> = ({ size, color = C.odds }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"><circle cx={12} cy={12} r={9.5} fill="none" stroke={color} strokeWidth={2.6} /><circle cx={12} cy={12} r={3.6} fill={color} /></svg>
);

const path = (pts: [number, number][], x: (t: number) => number, y: (v: number) => number) =>
  pts.map(([t, v], i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
const H = 3600;
const hhmm = (t: number) => new Date(t * 1000).toISOString().slice(11, 16);
const day = (t: number) => ["Oct 22", "Oct 23", "Oct 24"][new Date(t * 1000).getUTCDate() - 22];

// ---------- 1. Cover, 5:2 ----------
export const ArticleCover: React.FC = () => {
  // The cover's chart ends at the "a day later" mark the lag check measures to.
  const end = D.t1 + 24 * H, odds = D.odds.filter(([t]) => t <= end), meme = D.meme.filter(([t]) => t <= end);
  const L = 880, R = 1404, W = R - L;
  const x = (t: number) => L + ((t - D.a) / (end - D.a)) * W;
  const yo = (v: number) => 228 - (v / 80) * 140;
  const ym = (v: number) => 420 - ((v + 10) / 50) * 130;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <div style={{ position: "absolute", left: 96, top: 70, fontFamily: SANS, fontWeight: 600, fontSize: 20, letterSpacing: "0.24em", color: C.ink3 }}>INTRODUCING</div>
      <div style={{ position: "absolute", left: 90, top: 96, fontFamily: SERIF, fontSize: 184, lineHeight: 1, color: C.ink, letterSpacing: "-0.01em" }}>Oddshot</div>
      <div style={{ position: "absolute", left: 96, top: 300, width: 680, fontFamily: SERIF, fontSize: 50, lineHeight: 1.12, color: C.ink2 }}>
        The odds move first.<br /><span style={{ fontStyle: "italic", color: C.ink }}>The memes follow.</span>
      </div>
      {/* The real $ANT lag, as two small panels on one clock. */}
      <svg width={1500} height={600} style={{ position: "absolute", inset: 0 }}>
        <rect x={x(D.t0)} y={72} width={x(D.t1) - x(D.t0)} height={360} fill="#FFFFFF0A" />
        <line x1={L} x2={R} y1={228} y2={228} stroke={C.line} strokeWidth={1.5} />
        <line x1={L} x2={R} y1={ym(0)} y2={ym(0)} stroke={C.line} strokeWidth={1.5} strokeDasharray="4 6" />
        <path d={path(odds, x, yo)} fill="none" stroke={C.odds} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
        <path d={path(meme, x, ym)} fill="none" stroke={C.meme} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
        {[[D.t0, 21.9], [D.t1, 61.4]].map(([t, v]) => <circle key={t} cx={x(t!)} cy={yo(v!)} r={7} fill={C.odds} stroke={C.bg} strokeWidth={3} />)}
        <circle cx={x(end)} cy={ym(15.1)} r={7} fill={C.meme} stroke={C.bg} strokeWidth={3} />
        <line x1={96} x2={1404} y1={490} y2={490} stroke={C.line} strokeWidth={1.5} />
      </svg>
      <div style={{ position: "absolute", left: L, top: 50 }}><Key color={C.odds} size={15}>Polymarket odds · 21.9% → 61.4%</Key></div>
      <div style={{ position: "absolute", left: L, top: 258 }}><Key color={C.meme} size={15}>$ANT memecoin · +15.1% a day later</Key></div>
      <div style={{ position: "absolute", left: L, top: 446, fontFamily: SANS, fontSize: 15, color: C.ink3 }}>
        “Will Anthropic's public ticker be $ANT?” · hourly, Oct 22–24
      </div>
      <div style={{ position: "absolute", left: 96, top: 512, display: "flex", alignItems: "center", gap: 12, fontFamily: SANS, fontSize: 19, color: C.ink3 }}>
        A PayBox plugin by <span style={{ color: C.ink2 }}>Dappest Dev</span> · @sentinel_dapper
      </div>
      <div style={{ position: "absolute", right: 96, top: 508, display: "flex", alignItems: "center", gap: 10, fontFamily: SANS, fontSize: 15, letterSpacing: "0.1em", color: C.ink3 }}>
        <Logo src="moonpay-logo.png" size={28} /><Logo src="paybox-logo.png" size={28} />&nbsp;MOONPAY × PAYBOX HACKATHON · FINALIST
      </div>
    </AbsoluteFill>
  );
};

// ---------- 2. The lag, on real data ----------
export const ArticleLag: React.FC = () => {
  const L = 150, R = 1500, W = R - L;
  const x = (t: number) => L + ((t - D.a) / (D.b - D.a)) * W;
  const O = { top: 300, h: 230 }, M = { top: 640, h: 230 };
  const yo = (v: number) => O.top + O.h - (v / 80) * O.h;
  const ym = (v: number) => M.top + M.h - ((v + 10) / 50) * M.h;
  const ticks = Array.from({ length: 7 }, (_, i) => D.a + 6 * H + i * 6 * H).filter((t) => t <= D.b);
  const lbl = (left: number, top: number, value: string, note: string, align: "left" | "right" = "left") => (
    <div style={{ position: "absolute", left: align === "left" ? left : undefined, right: align === "right" ? 1600 - left : undefined, top, textAlign: align, fontFamily: SANS, color: C.ink }}>
      <div style={{ fontSize: 30, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 17, color: C.ink2, marginTop: 2 }}>{note}</div>
    </div>
  );
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <div style={{ position: "absolute", left: 80, top: 64, fontFamily: SERIF, fontSize: 64, lineHeight: 1.05, color: C.ink }}>
        The odds moved first. <span style={{ fontStyle: "italic" }}>The meme followed.</span>
      </div>
      <div style={{ position: "absolute", left: 82, top: 152, width: 1400, fontFamily: SANS, fontSize: 24, lineHeight: 1.4, color: C.ink2 }}>
        “Will Anthropic's public ticker be $ANT?” Polymarket odds against the $ANT memecoin, hourly, in UTC.
      </div>
      <svg width={1600} height={1000} style={{ position: "absolute", inset: 0 }}>
        <rect x={x(D.t0)} y={O.top - 40} width={x(D.t1) - x(D.t0)} height={M.top + M.h - O.top + 40} fill="#FFFFFF0A" />
        {[0, 20, 40, 60, 80].map((v) => <line key={v} x1={L} x2={R} y1={yo(v)} y2={yo(v)} stroke={v ? C.grid : C.line} strokeWidth={v ? 1.5 : 2} />)}
        {[-10, 0, 10, 20, 30, 40].map((v) => <line key={v} x1={L} x2={R} y1={ym(v)} y2={ym(v)} stroke={v ? C.grid : C.line} strokeWidth={v ? 1.5 : 2} strokeDasharray={v ? undefined : "6 6"} />)}
        <path d={path(D.odds, x, yo)} fill="none" stroke={C.odds} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
        <path d={path(D.meme, x, ym)} fill="none" stroke={C.meme} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
        {[[D.t0, 21.9], [D.t1, 61.4]].map(([t, v]) => <circle key={t} cx={x(t!)} cy={yo(v!)} r={8} fill={C.odds} stroke={C.bg} strokeWidth={3} />)}
        {[[D.t0, 5.9], [D.t1, 0], [D.t1 + 6 * H, 13.3], [D.t1 + 24 * H, 15.1]].map(([t, v]) => <circle key={t} cx={x(t!)} cy={ym(v!)} r={8} fill={C.meme} stroke={C.bg} strokeWidth={3} />)}
        {ticks.map((t) => <line key={t} x1={x(t)} x2={x(t)} y1={M.top + M.h} y2={M.top + M.h + 10} stroke={C.line} strokeWidth={2} />)}
      </svg>
      {[0, 20, 40, 60, 80].map((v) => <div key={v} style={{ position: "absolute", right: 1600 - L + 16, top: yo(v) - 12, fontFamily: MONO, fontSize: 17, color: C.ink3 }}>{v}%</div>)}
      {[-10, 0, 10, 20, 30, 40].map((v) => <div key={v} style={{ position: "absolute", right: 1600 - L + 16, top: ym(v) - 12, fontFamily: MONO, fontSize: 17, color: C.ink3 }}>{v > 0 ? "+" : v < 0 ? "−" : ""}{Math.abs(v)}%</div>)}
      {ticks.map((t) => (
        <div key={t} style={{ position: "absolute", left: x(t) - 60, width: 120, top: M.top + M.h + 18, textAlign: "center", fontFamily: MONO, fontSize: 16, color: C.ink3, lineHeight: 1.35 }}>
          {hhmm(t)}<br />{hhmm(t) === "00:00" ? day(t) : ""}
        </div>
      ))}
      <div style={{ position: "absolute", left: L, top: O.top - 66 }}><Key color={C.odds}>Polymarket odds of Yes</Key></div>
      <div style={{ position: "absolute", left: L, top: M.top - 66 }}><Key color={C.meme}>$ANT price vs. the end of the jump</Key></div>
      <div style={{ position: "absolute", left: x(D.t0) + 10, top: O.top - 34, fontFamily: SANS, fontSize: 16, fontWeight: 500, color: C.ink2 }}>The jump · 7 hours</div>
      {lbl(x(D.t1) + 24, yo(40), "21.9% → 61.4%", "odds in 7 hours")}
      {lbl(x(D.t0) + 16, ym(40) - 8, "−5.6%", "meme during the jump")}
      {lbl(x(D.t1 + 6 * H) + 18, ym(9), "+13.3%", "6 hours later")}
      {lbl(x(D.t1 + 24 * H) + 24, ym(15.1) - 86, "+15.1%", "a day later", "right")}
      <Footer y={950} w={1600} left="Source: Polymarket price history and GeckoTerminal hourly prices, measured by Oddshot's lag check. One story is one data point." />
    </AbsoluteFill>
  );
};

// ---------- 3. Four jobs ----------
const JOBS = [
  ["Spot the move", "Finds the biggest Polymarket odds swings of the last hour or day. Skips sports, weather and price ladders.", "$ANT ticker odds: 21.9% → 61.4%"],
  ["Find the OG", "Maps every coin riding the story, crowns the original and skips the clones.", "GTA 6: 17 coins, 1 OG, 11 copycats skipped"],
  ["Check it's safe", "DexScreener, RugCheck and Jupiter's audit. GREEN, YELLOW or RED, with every reason.", "$TRUMP: RED. One wallet held 72%"],
  ["Set up the swap", "A capped Jupiter swap with take-profit levels and a stop, sized to the coin.", "You approve. PayBox signs."],
];
export const ArticleJobs: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <div style={{ position: "absolute", left: 80, top: 64, fontFamily: SERIF, fontSize: 64, color: C.ink }}>Four jobs, <span style={{ fontStyle: "italic" }}>one prompt.</span></div>
    <div style={{ position: "absolute", left: 82, top: 152, fontFamily: SANS, fontSize: 24, color: C.ink2 }}>Ask your AI in plain words. Oddshot runs the steps, then waits for you.</div>
    {JOBS.map(([name, what, ex], i) => (
      <div key={name} style={{ position: "absolute", left: 80 + i * 368, top: 250, width: 336, height: 520, background: C.card, border: `1.5px solid ${C.line}`, borderRadius: 18,
        padding: "34px 30px", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
        <div style={{ fontFamily: MONO, fontSize: 20, color: C.odds, fontWeight: 500 }}>0{i + 1}</div>
        <div style={{ fontFamily: SERIF, fontSize: 44, lineHeight: 1.05, color: C.ink, marginTop: 18 }}>{name}</div>
        <div style={{ fontFamily: SANS, fontSize: 21, lineHeight: 1.45, color: C.ink2, marginTop: 18 }}>{what}</div>
        <div style={{ marginTop: "auto", borderTop: `1.5px solid ${C.line}`, paddingTop: 20 }}>
          <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 14, letterSpacing: "0.14em", color: C.ink3 }}>FROM A REAL RUN</div>
          <div style={{ fontFamily: SANS, fontWeight: 500, fontSize: 21, lineHeight: 1.35, color: C.ink, marginTop: 8 }}>{ex}</div>
        </div>
      </div>
    ))}
    {[0, 1, 2].map((i) => (
      <svg key={i} width={32} height={32} style={{ position: "absolute", left: 80 + i * 368 + 336, top: 494 }}>
        <path d="M8 16 H24 M18 10 L24 16 L18 22" fill="none" stroke={C.ink3} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ))}
    <Footer y={812} w={1600} left="Inside ChatGPT or Claude, through PayBox. Oddshot never touches your keys." />
  </AbsoluteFill>
);

// ---------- 4. Receipts ----------
const RECEIPTS = [
  { sym: "$GTA6", grade: "HIT", big: "+122%", stats: [["Peak", "+330%"], ["Worst", "−14%"]] },
  { sym: "$ELON", grade: "MISS", big: "−80%", stats: [["Peak", "+694%"], ["Gave back", "all of it"]] },
];
export const ArticleReceipts: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <div style={{ position: "absolute", left: 80, top: 64, fontFamily: SERIF, fontSize: 64, color: C.ink }}>Every call gets a receipt. <span style={{ fontStyle: "italic" }}>Misses too.</span></div>
    <div style={{ position: "absolute", left: 82, top: 152, fontFamily: SANS, fontSize: 24, color: C.ink2 }}>Two Oddshot calls from Oct 16, graded from real price history as of Oct 25.</div>
    {RECEIPTS.map((r, i) => {
      const col = r.grade === "HIT" ? C.hit : C.miss;
      return (
        <div key={r.sym} style={{ position: "absolute", left: 80 + i * 728, top: 250, width: 712, height: 500, background: C.card, border: `1.5px solid ${C.line}`, borderRadius: 18,
          padding: "40px 46px", boxSizing: "border-box", overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, borderRadius: "18px 0 0 18px", background: col }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontFamily: SERIF, fontSize: 64, color: C.ink, lineHeight: 1 }}>{r.sym}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 18px", borderRadius: 999, background: `${col}22`, border: `1.5px solid ${col}`,
              fontFamily: SANS, fontWeight: 700, fontSize: 22, letterSpacing: "0.12em", color: C.ink }}>
              <svg width={20} height={20} viewBox="0 0 20 20">{r.grade === "HIT"
                ? <path d="M4 10.5 L8.5 15 L16 5.5" fill="none" stroke={col} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                : <path d="M5 5 L15 15 M15 5 L5 15" fill="none" stroke={col} strokeWidth={3} strokeLinecap="round" />}</svg>
              {r.grade}
            </div>
          </div>
          <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 132, lineHeight: 1, color: C.ink, marginTop: 56, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>{r.big}</div>
          <div style={{ fontFamily: SANS, fontSize: 22, color: C.ink2, marginTop: 14 }}>since the call</div>
          <div style={{ position: "absolute", left: 46, right: 46, bottom: 40, display: "flex", gap: 56, borderTop: `1.5px solid ${C.line}`, paddingTop: 22 }}>
            {r.stats.map(([k, v]) => (
              <div key={k}>
                <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 14, letterSpacing: "0.14em", color: C.ink3, textTransform: "uppercase" }}>{k}</div>
                <div style={{ fontFamily: SANS, fontWeight: 500, fontSize: 30, color: C.ink, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      );
    })}
    <Footer y={800} w={1600} left="One call is one data point, not a track record or financial advice." />
  </AbsoluteFill>
);
