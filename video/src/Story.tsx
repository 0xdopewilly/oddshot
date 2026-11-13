import React from "react";
import { AbsoluteFill, Easing, OffthreadVideo, Sequence, interpolate, random, spring, staticFile, useCurrentFrame } from "remotion";
import TLraw from "./story-timeline.json";
import SERraw from "./series.json";
import SDraw from "./story-data.json";
import { C, DISPLAY, MONO, Bg, Panel, Rich, fade, clamp } from "./Oddshot";
import { HAND, Mark } from "./Demo";
import { Dex, Oddy, Coin, Bedroom, Blanket, Clock, blinkAt, DexMood, OddyMood } from "./Cast";

// ---------- Timeline (story/timeline.py) ----------
const FPS = 30;
type Word = { w: string; t: number; d: number; disp: string };
type Line = { id: string; who: "dex" | "oddy"; scene: string; text: string; start: number; dur: number; words: Word[] };
const TL = TLraw as unknown as { total: number; scenes: { id: string; start: number; end: number }[]; lines: Line[] };
const SER = SERraw as any;
const SD = SDraw as any;
export const STORY_FRAMES = Math.ceil(TL.total * FPS);
const F = (s: number) => Math.round(s * FPS);
const L = (id: string) => TL.lines.find((l) => l.id === id)!;
const SC = (id: string) => TL.scenes.find((s) => s.id === id)!;
/** Absolute frame of the first word matching re in a line (or the line's start). */
const cue = (id: string, re?: RegExp, off = 0) => {
  const l = L(id);
  const w = re ? l.words.find((x) => re.test(x.w)) : undefined;
  return F(l.start + (w?.t ?? 0) + off);
};
const end = (id: string, off = 0) => F(L(id).start + L(id).dur + off);
const useScene = (id: string) => {
  const f = useCurrentFrame();
  const s0 = F(SC(id).start);
  return { f, fa: f + s0, c: (l: string, re?: RegExp, off = 0) => cue(l, re, off) - s0, e: (l: string, off = 0) => end(l, off) - s0 };
};
/** Mouth/glow activity for a speaker at an absolute frame, from the voice's word boundaries. */
const talkAt = (who: "dex" | "oddy", fa: number) => {
  const t = fa / FPS;
  const l = TL.lines.find((x) => x.who === who && t >= x.start && t <= x.start + x.dur);
  if (!l) return 0;
  const lt = t - l.start;
  const w = l.words.find((x) => lt >= x.t && lt <= x.t + x.d + 0.04);
  if (!w) return 0;
  return 0.25 + 0.75 * Math.abs(Math.sin(((lt - w.t) * FPS * Math.PI) / 4.2));
};
const sp = (f: number, at: number, damping = 14, stiffness = 120) => spring({ frame: f - at, fps: FPS, config: { damping, stiffness } });
const ease = (f: number, a: number, b: number, from = 0, to = 1) => interpolate(f, [a, b], [from, to], { ...clamp, easing: Easing.inOut(Easing.cubic) });
const bob = (fa: number, amp = 6, speed = 40) => Math.sin(fa / speed) * amp;
const star = (x: number, y: number, r: number) =>
  `M${x},${y - r} L${x + r * 0.28},${y - r * 0.28} L${x + r},${y} L${x + r * 0.28},${y + r * 0.28} L${x},${y + r} L${x - r * 0.28},${y + r * 0.28} L${x - r},${y} L${x - r * 0.28},${y - r * 0.28} Z`;
const usd = (v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}K` : `$${Math.round(v)}`);

/** A character, animated: blinking, bobbing, lip-sync from the timeline. */
const DexA: React.FC<{ fa: number; mood: DexMood; x: number; y: number; w: number; look?: { x: number; y: number }; phone?: boolean; glow?: string; glowAmt?: number; sweat?: number; tilt?: number }> =
  ({ fa, mood, x, y, w, look, phone, glow, glowAmt, sweat, tilt = 0 }) => (
    <Dex width={w} mood={mood} look={look} blink={blinkAt(fa, 1)} talk={talkAt("dex", fa)} phone={phone} glow={glow} glowAmt={glowAmt} sweat={sweat}
      tilt={tilt + Math.sin(fa / 47) * 1.2} style={{ position: "absolute", left: x, top: y + bob(fa, 3, 34) }} />
  );
const OddyA: React.FC<{ fa: number; mood: OddyMood; x: number; y: number; size: number; look?: { x: number; y: number }; style?: React.CSSProperties }> =
  ({ fa, mood, x, y, size, look, style }) => (
    <Oddy size={size} mood={mood} look={look} blink={blinkAt(fa, 2, 120)} talk={talkAt("oddy", fa)} spin={fa * 0.8}
      style={{ position: "absolute", left: x, top: y + bob(fa, 9, 26), ...style }} />
  );
const Sparkles: React.FC<{ f: number; at: number; x: number; y: number; n?: number; color?: string; spread?: number }> = ({ f, at, x, y, n = 10, color = C.green, spread = 220 }) => {
  if (f < at || f > at + 40) return null;
  const k = (f - at) / 40;
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      {Array.from({ length: n }, (_, i) => {
        const a = random(`sa${i}${at}`) * Math.PI * 2, d = spread * (0.4 + random(`sd${i}${at}`) * 0.6) * Easing.out(Easing.cubic)(k);
        return <path key={i} d={star(x + Math.cos(a) * d, y + Math.sin(a) * d, (6 + random(`sr${i}`) * 10) * (1 - k))} fill={color} opacity={1 - k * 0.6} />;
      })}
    </svg>
  );
};
const Tag: React.FC<{ children: React.ReactNode; color?: string; style?: React.CSSProperties }> = ({ children, color = C.muted, style }) => (
  <div style={{ fontFamily: MONO, fontSize: 21, letterSpacing: 4, color, ...style }}>{children}</div>
);

// ---------- 1. Cold open: 3:07 AM, buying the tweet ----------
const PhoneFeed: React.FC<{ f: number; tap: number; crash: number }> = ({ f, tap, crash }) => {
  const posts = [
    { at: 8, user: "@moonmath_", text: "$MOON just did +600%. Still early." },
    { at: 26, user: "@100x_kev", text: "Not in $MOON yet? NGMI." },
    { at: 44, user: "@degen_dan", text: "LFG $MOON ▲▲▲" },
  ];
  const k = interpolate(f, [crash, crash + 22], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const shake = f > crash && f < crash + 26 ? Math.sin(f * 2.7) * 9 * (1 - (f - crash) / 26) : 0;
  const N = 30;
  const rise = Array.from({ length: N }, (_, i) => { const x = i / (N - 1); return [x * 0.74, 0.08 + Math.pow(x, 2.4) * 0.84 + 0.025 * Math.sin(i * 2.1) * x]; });
  const fall = [[0.74, 0.92], [0.79, 0.96], [0.84, 0.7], [0.9, 0.45], [0.95, 0.38], [1, 0.3]];
  const shown = fall.slice(0, 1 + Math.floor(k * (fall.length - 1)));
  const toXY = ([x, y]: number[]) => `${(x * 380 + 10).toFixed(1)},${(200 - y * 180).toFixed(1)}`;
  const bought = f >= tap;
  const pressed = sp(f, tap, 9, 220);
  return (
    <div style={{ position: "absolute", left: 1170, top: 70, width: 470, height: 880, borderRadius: 60, background: "#0A0D12", border: "12px solid #1B2029",
      boxShadow: "0 40px 120px #000c, 0 0 60px #9FD8FF22", transform: `rotate(3deg) translateX(${shake}px)`, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "18px 30px 6px", fontFamily: MONO, fontSize: 20, color: C.text }}><span>3:07</span><span>▂▄▆ ◔</span></div>
      <div style={{ padding: "6px 26px 12px", fontFamily: DISPLAY, fontWeight: 700, fontSize: 30, color: C.text, borderBottom: `1px solid ${C.line}` }}>For you</div>
      {posts.map((p) => {
        const s = sp(f, p.at, 13);
        return f < p.at ? null : (
          <div key={p.user} style={{ display: "flex", gap: 14, padding: "14px 22px", borderBottom: `1px solid ${C.line}`, opacity: Math.min(1, s * 1.4), transform: `translateY(${(1 - s) * -30}px)` }}>
            <div style={{ width: 46, height: 46, borderRadius: 23, flexShrink: 0, background: `hsl(${random(p.user) * 360},60%,55%)` }} />
            <div><div style={{ fontFamily: MONO, fontSize: 18, color: C.muted }}>{p.user}</div>
              <div style={{ fontFamily: DISPLAY, fontSize: 25, color: C.text, marginTop: 2 }}>{p.text}</div></div>
          </div>
        );
      })}
      <div style={{ margin: "16px 18px", padding: "14px 16px", borderRadius: 18, background: "#11161D", border: `1px solid ${C.line}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontWeight: 700, fontSize: 26 }}>
          <span style={{ color: C.text }}>$MOON</span>
          <span style={{ color: k > 0.3 ? C.red : C.green }}>{k > 0.3 ? "−62%" : "+600%"}</span>
        </div>
        <svg width={400} height={210} style={{ display: "block", marginTop: 6 }}>
          <polyline points={rise.map(toXY).join(" ")} fill="none" stroke={C.green} strokeWidth={5} strokeLinejoin="round" />
          {k > 0 && <polyline points={shown.map(toXY).join(" ")} fill="none" stroke={C.red} strokeWidth={5} strokeLinejoin="round" />}
          {bought && <g><circle cx={0.74 * 380 + 10} cy={200 - 0.92 * 180} r={9} fill="#fff" />
            <text x={0.74 * 380 - 40} y={200 - 0.92 * 180 - 18} fontFamily={MONO} fontWeight={700} fontSize={18} fill="#fff">YOU</text></g>}
        </svg>
      </div>
      <div style={{ margin: "10px 18px", height: 84, borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, fontWeight: 700, fontSize: 34,
        color: bought ? C.text : "#04130B", background: bought ? "#1A2230" : C.green, transform: `scale(${bought ? 1 - 0.08 * Math.sin(Math.min(1, pressed) * Math.PI) : 1})`,
        boxShadow: bought ? "none" : `0 0 30px ${C.green}66` }}>{bought ? "BOUGHT ✓" : "BUY $MOON"}</div>
    </div>
  );
};

const ColdOpen: React.FC = () => {
  const { f, fa, c, e } = useScene("cold");
  const tap = c("c1", /in/i, 0.05);
  const crash = c("c2", undefined, -1.7);
  const title = e("c2", 0.25);
  const mood: DexMood = f < c("c1") ? "tired" : f < crash + 6 ? "hype" : f < c("c2") - 8 ? "shock" : "sad";
  const ts = sp(f, title, 12, 160);
  const push = interpolate(f, [0, title], [1, 1.07], clamp);
  return (
    <AbsoluteFill style={{ background: "linear-gradient(180deg,#0C1226,#151C38)" }}>
      <AbsoluteFill style={{ transform: `translateX(-330px) scale(${push})`, transformOrigin: "860px 500px" }}>
        <Bedroom />
        <DexA fa={fa} mood={mood} x={580} y={136} w={560} look={mood === "sad" ? { x: 0.1, y: 0.9 } : { x: 0.55, y: 0.75 }} phone glowAmt={0.9}
          sweat={mood === "shock" ? 0.9 : 0} tilt={mood === "sad" ? 5 : 0} />
        <Blanket />
      </AbsoluteFill>
      <PhoneFeed f={f} tap={tap} crash={crash} />
      {f >= title && (
        <AbsoluteFill style={{ background: `rgba(3,5,10,${0.78 * Math.min(1, ts)})`, alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 18 }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 220, color: C.text, letterSpacing: 4, transform: `scale(${1.7 - 0.7 * ts})`, opacity: Math.min(1, ts * 1.5) }}>
            LATE AGAIN<span style={{ color: C.red }}>.</span>
          </div>
          <Tag style={{ fontSize: 28, letterSpacing: 10, opacity: fade(f, title + 12, title + 24) }}>EVERY DEGEN'S ORIGIN STORY</Tag>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

// ---------- 2. Oddy arrives ----------
const Arrive: React.FC = () => {
  const { f, fa, c } = useScene("arrive");
  const pop = c("a1", undefined, -1.5);
  const land = pop + 22;
  const fly = Easing.out(Easing.cubic)(interpolate(f, [pop, land], [0, 1], clamp));
  const ox = 900 + (1150 - 900) * fly, oy = 600 + (210 - 600) * fly - Math.sin(fly * Math.PI) * 120;
  const holo = c("a3", /prediction/);
  const gapAt = c("a4");
  const zoom = interpolate(f, [0, land + 10], [1.16, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const dexMood: DexMood = f < pop ? "sad" : f < c("a2") ? "shock" : f < c("a3") ? "doubt" : f < c("a4", /gap/) ? "neutral" : "hype";
  const lookPanel = f >= holo;
  const odds = interpolate(f, [holo + 10, holo + 40], [38, 67], clamp);
  return (
    <AbsoluteFill style={{ background: "#0C1226" }}>
      <AbsoluteFill style={{ transform: `scale(${zoom})`, transformOrigin: "900px 560px" }}>
        <Bedroom />
        <DexA fa={fa} mood={dexMood} x={580} y={136} w={560} phone glow={f >= pop ? C.green : "#9FD8FF"} glowAmt={f >= pop ? 0.35 : 0.8} sweat={dexMood === "shock" ? 0.9 : 0}
          look={lookPanel ? { x: -0.9, y: -0.7 } : f >= pop ? { x: 0.95, y: -0.4 } : { x: 0.4, y: 0.8 }} />
        <Blanket />
        <Clock text="3:08" />
        <Sparkles f={f} at={pop} x={900} y={600} n={14} spread={260} />
        {f >= pop && (
          <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
            <path d={`M900,600 Q${(900 + ox) / 2},${Math.min(600, oy) - 160} ${ox + 165},${oy + 165}`} stroke={C.green} strokeWidth={5} strokeDasharray="4 16" strokeLinecap="round" fill="none"
              opacity={0.8 * (1 - fade(f, land + 20, land + 50))} />
          </svg>
        )}
        {f >= pop && <OddyA fa={fa} mood={f < c("a2") ? "smug" : "calm"} x={ox} y={oy} size={330 * (0.15 + 0.85 * fly)}
          look={lookPanel ? { x: -0.9, y: -0.5 } : { x: -0.9, y: 0.35 }} />}
      </AbsoluteFill>
      {f >= holo && (
        <div style={{ position: "absolute", left: 50, top: 60, width: 620, opacity: fade(f, holo, holo + 10), transform: `translateY(${(1 - fade(f, holo, holo + 12)) * 20}px)` }}>
          <Panel style={{ padding: "26px 32px", background: "#0A1A14E6", borderColor: `${C.green}77`, boxShadow: `0 0 60px ${C.green}33` }}>
            {f < gapAt ? (
              <>
                <Tag color={C.green}>PREDICTION MARKET · REAL MONEY</Tag>
                <div style={{ fontFamily: DISPLAY, fontSize: 30, color: C.text, marginTop: 12, lineHeight: 1.3 }}>“Will the GTA VI launch trailer get 40–60M views in week 1?”</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 20, marginTop: 18 }}>
                  <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 84, color: C.cyan }}>{Math.round(odds)}%</span>
                  <span style={{ fontFamily: MONO, fontSize: 28, color: C.green, opacity: fade(f, holo + 40, holo + 50) }}>▲ +29 pts in 24h</span>
                </div>
                <div style={{ height: 14, borderRadius: 7, background: C.line, marginTop: 10, overflow: "hidden" }}><div style={{ width: `${odds}%`, height: "100%", background: C.cyan }} /></div>
                <Tag style={{ marginTop: 14, fontSize: 17 }}>POLYMARKET · OCT 16, 2026</Tag>
              </>
            ) : (
              <GapDiagram f={f} a={gapAt} jump={c("a4", /jump/)} later={c("a4", /later/)} gap={c("a4", /gap/)} />
            )}
          </Panel>
        </div>
      )}
    </AbsoluteFill>
  );
};
const GapDiagram: React.FC<{ f: number; a: number; jump: number; later: number; gap: number }> = ({ f, a, jump, later, gap }) => {
  const po = ease(f, jump - 4, jump + 14), pm = ease(f, later - 4, later + 16), pg = ease(f, gap - 6, gap + 8);
  return (
    <>
      <Tag color={C.green}>THE ODDSHOT SIGNAL</Tag>
      <svg width={550} height={260} viewBox="0 0 636 300" style={{ marginTop: 10, overflow: "visible" }}>
        <rect x={200} y={30} width={150} height={240} fill={C.green} opacity={0.13 * pg} />
        <path d="M20,230 L160,230 C185,230 185,80 210,80 L620,80" fill="none" stroke={C.cyan} strokeWidth={7} strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - po} />
        <path d="M20,250 L330,250 C360,250 370,110 400,110 L620,110" fill="none" stroke={C.green} strokeWidth={7} strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - pm} />
        <text x={560} y={66} fontFamily={MONO} fontWeight={700} fontSize={22} fill={C.cyan} opacity={po}>ODDS</text>
        <text x={560} y={150} fontFamily={MONO} fontWeight={700} fontSize={22} fill={C.green} opacity={pm}>MEMES</text>
        <text x={275} y={190} textAnchor="middle" fontFamily={HAND} fontWeight={700} fontSize={50} fill={C.green} opacity={pg} transform="rotate(-6 275 190)">the gap</text>
      </svg>
      <Tag style={{ marginTop: 4, fontSize: 17, opacity: fade(f, a, a + 10) }}>ILLUSTRATION · THE REAL DATA COMES LATER</Tag>
    </>
  );
};

// ---------- 3. Radar: two crowds ----------
const Radar: React.FC = () => {
  const { f, fa, c } = useScene("radar");
  const cx = 770, cy = 520, R = 330;
  const sweep = 180 + f * 4;
  const blips = [
    { name: "Trump", a: 212, r: 0.62, both: true }, { name: "GTA VI", a: 322, r: 0.5, both: true }, { name: "COIL", a: 440, r: 0.78, both: false },
  ];
  const cards: { k: string; at: number; d: any }[] = [
    { k: "Trump", at: c("r2", /Trump/), d: SD.radar[1] }, { k: "GTA VI", at: c("r2", /GTA/), d: SD.radar[0] }, { k: "COIL", at: c("r2", /Six/, 0.5), d: SD.radar[2] },
  ];
  return (
    <AbsoluteFill>
      <Bg />
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <radialGradient id="rbg"><stop offset="0" stopColor={C.green} stopOpacity={0.08} /><stop offset="1" stopColor={C.green} stopOpacity={0.02} /></radialGradient>
          <linearGradient id="sw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={C.green} stopOpacity={0} /><stop offset="1" stopColor={C.green} stopOpacity={0.45} /></linearGradient>
        </defs>
        <circle cx={cx} cy={cy} r={R} fill="url(#rbg)" stroke={`${C.green}55`} strokeWidth={3} />
        {[0.33, 0.66].map((k) => <circle key={k} cx={cx} cy={cy} r={R * k} fill="none" stroke={`${C.green}33`} strokeWidth={2} />)}
        <path d={`M${cx - R},${cy} L${cx + R},${cy} M${cx},${cy - R} L${cx},${cy + R}`} stroke={`${C.green}22`} strokeWidth={2} />
        <g transform={`rotate(${sweep} ${cx} ${cy})`}>
          <path d={`M${cx},${cy} L${cx + R},${cy} A${R},${R} 0 0 0 ${cx + R * Math.cos(-0.7)},${cy + R * Math.sin(-0.7)} Z`} fill="url(#sw)" />
          <line x1={cx} y1={cy} x2={cx + R} y2={cy} stroke={C.green} strokeWidth={3} />
        </g>
        {blips.map((b) => {
          const seen = (b.a - 180) / 4;
          if (f < seen) return null;
          const x = cx + Math.cos((b.a * Math.PI) / 180) * R * b.r, y = cy + Math.sin((b.a * Math.PI) / 180) * R * b.r;
          const col = b.both ? C.green : C.yellow;
          const pulse = ((f - seen) % 30) / 30;
          return (
            <g key={b.name}>
              <circle cx={x} cy={y} r={12 + pulse * 40} fill="none" stroke={col} strokeWidth={3} opacity={1 - pulse} />
              {b.both && <circle cx={x} cy={y} r={24} fill="none" stroke={col} strokeWidth={3} />}
              <circle cx={x} cy={y} r={11} fill={col} style={{ filter: `drop-shadow(0 0 10px ${col})` }} />
              <text x={x + 34} y={y + 9} fontFamily={DISPLAY} fontWeight={700} fontSize={30} fill={C.text}>{b.name}</text>
            </g>
          );
        })}
      </svg>
      <div style={{ position: "absolute", left: 1150, top: 120, width: 700, display: "flex", flexDirection: "column", gap: 18 }}>
        {cards.map(({ k, at, d }) => {
          const s = sp(f, at, 15);
          const both = d.signal === "BOTH CROWDS";
          return f < at ? null : (
            <Panel key={k} style={{ padding: both ? "20px 26px" : "14px 26px", opacity: Math.min(1, s * 1.4) * (both ? 1 : 0.7), transform: `translateX(${(1 - s) * 60}px)`, borderColor: both ? `${C.green}66` : C.line }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: both ? 40 : 30, color: C.text }}>{k}</span>
                <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 19, letterSpacing: 2, padding: "5px 12px", borderRadius: 8, color: both ? "#04130B" : C.yellow, background: both ? C.green : `${C.yellow}22` }}>{d.signal}</span>
              </div>
              {both ? (
                <>
                  <div style={{ fontFamily: MONO, fontSize: 21, color: C.muted, marginTop: 10 }}><span style={{ color: C.green }}>chain</span> · ${d.leader} leads{Math.abs(d.leaderChange1h) >= 1 ? ` (+${d.leaderChange1h.toFixed(1)}% 1h)` : ""} · liq {usd(d.leaderLiq)}{d.also ? ` · also $${d.also}` : ""}</div>
                  <div style={{ fontFamily: MONO, fontSize: 21, color: C.muted, marginTop: 6, lineHeight: 1.35 }}><span style={{ color: C.cyan }}>crowd</span> · “{d.crowd.question}” {d.crowd.changePts > 0 ? "▲" : "▼"}{Math.abs(d.crowd.changePts)} pts → {d.crowd.probabilityPct}%</div>
                </>
              ) : (
                <div style={{ fontFamily: MONO, fontSize: 19, color: C.muted, marginTop: 6 }}>${d.leader} +{Math.round(d.leaderChange1h)}% 1h, no market behind it · seatbelt RED</div>
              )}
            </Panel>
          );
        })}
        <Tag style={{ opacity: fade(f, cards[0]!.at, cards[0]!.at + 10) }}>hot_narratives · LIVE ON PAYBOX · OCT 24, 2026</Tag>
      </div>
      <OddyA fa={fa} mood="alert" x={80} y={70} size={170} look={{ x: 0.8, y: 0.6 }} />
      <DexA fa={fa} mood={f < c("r2") ? "neutral" : "hype"} x={0} y={540} w={420} look={{ x: 0.9, y: -0.4 }} />
    </AbsoluteFill>
  );
};

// ---------- Desk set (the call, the ape) ----------
const Desk: React.FC = () => (
  <AbsoluteFill>
    <svg width={1920} height={1080}>
      <defs>
        <linearGradient id="dw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0C1322" /><stop offset="1" stopColor="#141C31" /></linearGradient>
        <radialGradient id="dl" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#5CC8FF" stopOpacity={0.14} /><stop offset="1" stopColor="#5CC8FF" stopOpacity={0} /></radialGradient>
      </defs>
      <rect width={1920} height={1080} fill="url(#dw)" />
      <rect x={60} y={170} width={360} height={14} rx={5} fill="#25304C" />
      {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={90 + i * 34} y={100 + (i % 2) * 10} width={26} height={70 - (i % 2) * 10} rx={3} fill={["#3A4B7A", "#5C3E6E", "#2E6B5E", "#7A5A3A", "#44507F"][i]} />)}
      <path d="M330,170 C320,130 350,110 345,80 C365,110 380,130 368,170 Z" fill="#2E6B5E" /><rect x={322} y={150} width={52} height={22} rx={5} fill="#5A3E2E" opacity={0} />
      <circle cx={420} cy={560} r={520} fill="url(#dl)" />
      <rect x={0} y={872} width={1920} height={208} fill="#16142A" /><rect x={0} y={866} width={1920} height={14} fill="#231F3D" />
    </svg>
  </AbsoluteFill>
);
const Laptop: React.FC = () => (
  <div style={{ position: "absolute", left: 140, top: 690, width: 340, height: 200, borderRadius: "22px 22px 6px 6px", background: "linear-gradient(180deg,#CBD1DA,#9AA2AE)",
    boxShadow: "0 -6px 40px #5CC8FF33", display: "flex", alignItems: "center", justifyContent: "center" }}>
    <svg width={70} height={70} viewBox="0 0 100 100"><circle cx={50} cy={50} r={40} fill="none" stroke="#1F7A52" strokeWidth={9} /><circle cx={50} cy={50} r={12} fill="#1F7A52" />
      {[0, 90, 180, 270].map((a) => <line key={a} x1={50} y1={2} x2={50} y2={16} stroke="#1F7A52" strokeWidth={9} transform={`rotate(${a} 50 50)`} />)}</svg>
  </div>
);
const Browser: React.FC<{ title: string; badge?: React.ReactNode; style?: React.CSSProperties; children: React.ReactNode }> = ({ title, badge, style, children }) => (
  <Panel style={{ overflow: "hidden", ...style }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", background: "#0A0E13", borderBottom: `1px solid ${C.line}` }}>
      {[C.red, C.yellow, C.green].map((col) => <span key={col} style={{ width: 12, height: 12, borderRadius: 6, background: col, opacity: 0.8 }} />)}
      <span style={{ marginLeft: 14, padding: "5px 16px", borderRadius: 999, background: "#151B23", fontFamily: MONO, fontSize: 18, color: C.muted }}>{title}</span>
      <span style={{ marginLeft: "auto" }}>{badge}</span>
    </div>
    {children}
  </Panel>
);

// ---------- 4. The call (real board, Oct 16) ----------
const Call: React.FC = () => {
  const { f, fa, c } = useScene("call");
  const ps = sp(f, 0, 16);
  const [, , crowd] = SD.board as string[];
  const m = String(crowd).trim().match(/^(Crowd piling into )(.*?)( \(\+29 pts → 67%\))\. (\$GTA6 )(hasn't moved yet)( \(-5\.1% 6h\)\. The window is open\.)$/);
  const mood: DexMood = f < c("k1", /Early/) ? "neutral" : f < c("k2") ? "hype" : "shock";
  return (
    <AbsoluteFill>
      <Desk />
      <DexA fa={fa} mood={mood} x={60} y={250} w={470} look={{ x: 0.95, y: -0.1 }} glow={C.cyan} glowAmt={0.5} />
      <Laptop />
      <OddyA fa={fa} mood={f < c("k2") ? "calm" : "smug"} x={480} y={70} size={150} look={{ x: 0.9, y: 0.4 }} />
      <Browser title="claude.ai · Oddshot via PayBox" badge={<span style={{ fontFamily: MONO, fontSize: 16, color: C.green, letterSpacing: 2 }}>OCT 16, 2026 · REAL CAPTURE</span>}
        style={{ position: "absolute", left: 650, top: 80, width: 1210, opacity: Math.min(1, ps * 1.5), transform: `translateY(${(1 - ps) * 30}px)` }}>
        <div style={{ padding: "26px 34px 34px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ alignSelf: "flex-end", padding: "12px 22px", borderRadius: 18, background: "#1A2230", fontFamily: DISPLAY, fontSize: 32, color: C.text }}>What's the odds-to-meme board right now?</div>
          <div style={{ fontFamily: MONO, fontSize: 24, color: C.muted }}>◎ Oddshot · oddshot_play({"{}"})</div>
          <div style={{ fontFamily: MONO, fontSize: 33, color: C.text, lineHeight: 1.55 }}>
            <div><Rich text={SD.board[0]} /></div>
            <div>1. <Mark at={c("k1", /Early/)} color={C.green}><span style={{ color: C.green, fontWeight: 700 }}>EARLY</span></Mark> <Rich text={'🟡 $GTA6 ← "GTA VI" · play 49'} /></div>
            {m ? (
              <div style={{ paddingLeft: 40, color: "#C9D2DC" }}>
                {m[1]}{m[2]}<Mark at={c("k1", /twenty/)} kind="underline" color={C.cyan}><span style={{ color: C.cyan, fontWeight: 700 }}>{m[3]}</span></Mark>. {m[4]}
                <Mark at={c("k1", /hadn/)} kind="underline" color={C.yellow}><span style={{ color: C.yellow, fontWeight: 700 }}>{m[5]}</span></Mark>{m[6]}
              </div>
            ) : <div style={{ paddingLeft: 40 }}><Rich text={crowd} /></div>}
          </div>
        </div>
      </Browser>
    </AbsoluteFill>
  );
};

// ---------- 5. The swarm: crown the OG, skip the copycats ----------
const COINS = [
  { l: "$GTA6", x: 380, y: 400, s: 118, copy: true }, { l: "$GTAVI", x: 560, y: 330, s: 112, copy: true }, { l: "$GTA6", x: 760, y: 300, s: 120, copy: true },
  { l: "$VICE", x: 1160, y: 300, s: 116, copy: true }, { l: "$GTA", x: 1360, y: 330, s: 112, copy: true }, { l: "$GTA6", x: 1540, y: 400, s: 118, copy: true },
  { l: "$LUCIA", x: 470, y: 640, s: 108, copy: false }, { l: "$GTAVI", x: 660, y: 700, s: 112, copy: true }, { l: "$JASON", x: 1270, y: 700, s: 108, copy: false },
  { l: "$GTA6", x: 1450, y: 640, s: 112, copy: true }, { l: "$VI", x: 250, y: 600, s: 100, copy: false },
];
const Swarm: React.FC = () => {
  const { f, fa, c } = useScene("swarm");
  const og = c("s1", /OG/), crown = c("s1", /crown/), copy = c("s1", /copycats/);
  const lock = ease(f, og - 14, og);
  const rx = interpolate(f, [0, og - 14], [300, 900], clamp) * (1 - lock) + 960 * lock, ry = 560 - Math.sin(f / 6) * 40 * (1 - lock);
  let k = 0;
  return (
    <AbsoluteFill>
      <Bg />
      <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 62%, #3DFFA014, transparent 55%)" }} />
      <div style={{ position: "absolute", top: 70, left: 0, right: 0, textAlign: "center", fontFamily: MONO, fontSize: 30, color: C.text, opacity: fade(f, 6, 18) }}>
        35 <span style={{ color: C.muted }}>“GTA VI” tokens ·</span> 1 OG <span style={{ color: C.muted }}>·</span> <span style={{ color: C.red }}>22 copycats skipped</span> <span style={{ color: C.muted }}>·</span> <span style={{ color: C.yellow }}>frenzy: 11 launched in 24h</span>
      </div>
      {COINS.map((cn, i) => {
        const s = sp(f, 2 + i * 2, 11, 180);
        const st = cn.copy ? copy + (k++) * 3 : Infinity;
        const fall = f > st + 8 ? (f - st - 8) : 0;
        return (
          <div key={i} style={{ position: "absolute", left: cn.x - cn.s / 2, top: cn.y - cn.s * 0.75 + fall * fall * 1.4 + bob(fa + i * 9, 5, 18), transform: `scale(${s}) rotate(${fall * (i % 2 ? 3 : -3)}deg)`, opacity: cn.copy ? 1 : 0.55 }}>
            <Coin size={cn.s} label={cn.l} color={["#C9B26A", "#B9A56E", "#A99C76", "#BFA35E"][i % 4]} stamp={f >= st ? "COPYCAT" : undefined} dizzy={f >= st} look={(960 - cn.x) / 600} />
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 960 - 95, top: 600 - 150 + bob(fa, 6, 22), transform: `scale(${sp(f, 0, 10, 160)})` }}>
        <Coin size={190} label="$GTA6" crown={f >= crown} color={C.yellow} look={0} />
      </div>
      {f >= crown && <Sparkles f={f} at={crown} x={960} y={470} n={12} color={C.yellow} spread={180} />}
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <g transform={`translate(${rx} ${ry}) rotate(${f * 3})`} opacity={f < og + 30 ? 1 : 1 - fade(f, og + 30, og + 45)}>
          <circle r={130 - lock * 10} fill="none" stroke={C.green} strokeWidth={6} strokeDasharray="30 16" />
          {[0, 90, 180, 270].map((a) => <line key={a} x1={0} y1={-150} x2={0} y2={-100} stroke={C.green} strokeWidth={7} transform={`rotate(${a})`} />)}
        </g>
      </svg>
      <OddyA fa={fa} mood={f < og ? "alert" : "smug"} x={1690} y={720} size={150} look={{ x: -0.9, y: -0.4 }} />
      <div style={{ position: "absolute", right: 40, top: 130, fontFamily: MONO, fontSize: 17, color: C.muted, opacity: fade(f, 10, 20) }}>COUNTS FROM A LIVE ODDSHOT BOARD · NAMES ILLUSTRATIVE</div>
    </AbsoluteFill>
  );
};

// ---------- 6. The seatbelt ----------
const Seatbelt: React.FC = () => {
  const { f, fa, c } = useScene("seatbelt");
  const red = c("b2", /Red/);
  const belt = sp(f, red - 4, 16, 140);
  const [, ...rest] = String(SD.red).replace(/^Seatbelt engaged:\s*/, "").split(/\.\s+/);
  const reasons = rest.join(". ").split(/;\s*/).map((r) => r.replace(/\.$/, "")).filter(Boolean);
  const order = [1, 0, 2].map((i) => reasons[i]).filter(Boolean) as string[];
  const rAt = [c("b2", /mint/), c("b2", /thirty/), c("b2", /percent/, 0.4)];
  const src = c("b2", /Three/);
  const dexMood: DexMood = f < red ? "hype" : f < src ? "shock" : "neutral";
  return (
    <AbsoluteFill>
      <Bg />
      <AbsoluteFill style={{ background: f >= red ? `radial-gradient(circle at 46% 44%, ${C.red}22, transparent 50%)` : "radial-gradient(circle at 46% 44%, #FFD44922, transparent 50%)" }} />
      <div style={{ position: "absolute", left: 880 - 150, top: 260 + bob(fa, 10, 20) }}>
        <Coin size={300} label="$ANTHROPIC" color={f >= red ? "#D9A3A3" : "#F2CF74"} stamp={f >= red + 8 ? "RED" : undefined} look={-0.6} />
      </div>
      {f < red && <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        {[0, 1, 2, 3, 4].map((i) => { const a = f / 12 + i * 1.26; return <path key={i} d={star(880 + Math.cos(a) * 220, 430 + Math.sin(a) * 200, 10 + 6 * Math.sin(f / 5 + i))} fill="#FFE9A8" />; })}
      </svg>}
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <g transform={`rotate(-14 880 560) translate(${(1 - belt) * -2600} 120)`}>
          <rect x={-400} y={520} width={2700} height={96} fill="#2A2E36" stroke="#1A1D22" strokeWidth={4} />
          <line x1={-400} y1={533} x2={2300} y2={533} stroke="#4A515C" strokeWidth={3} strokeDasharray="16 10" />
          <line x1={-400} y1={603} x2={2300} y2={603} stroke="#4A515C" strokeWidth={3} strokeDasharray="16 10" />
          <rect x={800} y={498} width={170} height={140} rx={20} fill="#C3C9D3" stroke="#8C939E" strokeWidth={6} />
          <rect x={835} y={540} width={100} height={56} rx={8} fill="#2A2E36" />
        </g>
      </svg>
      <div style={{ position: "absolute", left: 1240, top: 330, width: 620, display: "flex", flexDirection: "column", gap: 16 }}>
        {f >= red && <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 64, color: C.red, opacity: fade(f, red, red + 6) }}>SEATBELT: RED</div>}
        {order.map((r, i) => f < rAt[i]! ? null : (
          <div key={r} style={{ fontFamily: MONO, fontSize: 25, color: C.text, padding: "12px 18px", borderRadius: 12, background: `${C.red}18`, border: `2px solid ${C.red}55`,
            opacity: fade(f, rAt[i]!, rAt[i]! + 8), transform: `translateX(${(1 - fade(f, rAt[i]!, rAt[i]! + 10)) * 40}px)` }}>✕ {r}</div>
        ))}
        {f >= src && <div style={{ fontFamily: MONO, fontSize: 19, color: C.muted, opacity: fade(f, src + 30, src + 40) }}>Buying RED is refused. Selling is never blocked.</div>}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 800, display: "flex", justifyContent: "center", gap: 22 }}>
        {["DexScreener", "RugCheck", "Jupiter audit"].map((s, i) => f < src + i * 5 ? null : (
          <span key={s} style={{ fontFamily: MONO, fontWeight: 700, fontSize: 26, color: C.green, padding: "8px 20px", borderRadius: 999, background: `${C.green}14`, border: `2px solid ${C.green}66`,
            opacity: fade(f, src + i * 5, src + i * 5 + 8) }}>✓ {s}</span>
        ))}
      </div>
      <DexA fa={fa} mood={dexMood} x={0} y={540} w={420} look={{ x: 0.9, y: -0.5 }} sweat={dexMood === "shock" ? 0.8 : 0} />
      <OddyA fa={fa} mood={f < red ? "calm" : "alert"} x={1660} y={50} size={170} look={{ x: -0.9, y: 0.5 }} />
      <Tag style={{ position: "absolute", left: 1240, top: 280, opacity: fade(f, red, red + 10) }}>check_token · REAL CAPTURE</Tag>
    </AbsoluteFill>
  );
};

// ---------- 7. Ape: the real approval in Claude ----------
const CLIP_APPROVE = 6.7;
const Ape: React.FC = () => {
  const { f, fa, c } = useScene("ape");
  const approve = c("p2", /approve/);
  const clipAt = approve - F(CLIP_APPROVE);
  const conf = c("p3", /Confirmed/);
  const exit = c("p3", /exit/);
  const z = sp(f, approve + 4, 24, 70);
  const t = SD.txDetail;
  const ex = String(SD.exit).match(/take 50% at (\+\d+%).*?rest at (\+\d+%).*?bail below (-\d+%)/) ?? [];
  const dexMood: DexMood = f < c("p2") ? "hype" : f < approve + 40 ? "neutral" : "happy";
  const card = (at: number) => ({ opacity: fade(f, at, at + 10), transform: `translateY(${(1 - fade(f, at, at + 12)) * 24}px)` });
  return (
    <AbsoluteFill>
      <Desk />
      <DexA fa={fa} mood={dexMood} x={40} y={250} w={470} look={{ x: 0.95, y: -0.1 }} glow={C.cyan} glowAmt={0.6} />
      <Laptop />
      <OddyA fa={fa} mood={f < conf ? "calm" : "happy"} x={470} y={60} size={140} look={{ x: 0.9, y: 0.5 }} />
      <Browser title="claude.ai · Oddshot via PayBox" badge={<span style={{ fontFamily: MONO, fontSize: 16, color: C.red, letterSpacing: 2 }}>● REAL RECORDING</span>}
        style={{ position: "absolute", left: 640, top: 70, width: 760 }}>
        <div style={{ position: "relative", width: 760, height: 760, overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, transform: `scale(${1 + 0.32 * z})`, transformOrigin: "66% 66%" }}>
            <Sequence from={Math.max(0, clipAt)} layout="none">
              <OffthreadVideo src={staticFile("claude-cut.mp4")} startFrom={Math.max(0, -clipAt)} muted style={{ width: 760, height: 760 }} />
            </Sequence>
          </div>
        </div>
      </Browser>
      <div style={{ position: "absolute", left: 1430, top: 90, width: 450, display: "flex", flexDirection: "column", gap: 18 }}>
        {[{ at: c("p2"), n: "1", t: "Oddshot builds a capped swap", s: "seatbelt YELLOW · allowed" }, { at: c("p2", /PayBox/), n: "2", t: "PayBox shows it", s: "your wallet · Solana" }, { at: approve, n: "3", t: "You approve", s: "keys never leave PayBox" }].map((st) => (
          <div key={st.n} style={{ display: "flex", gap: 14, alignItems: "center", opacity: f >= st.at ? fade(f, st.at, st.at + 8) : 0.15 }}>
            <span style={{ width: 44, height: 44, borderRadius: 22, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontWeight: 700, fontSize: 22, color: C.bg, background: C.cyan, flexShrink: 0 }}>{st.n}</span>
            <div><div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 28, color: C.text }}>{st.t}</div><div style={{ fontFamily: MONO, fontSize: 17, color: C.muted }}>{st.s}</div></div>
          </div>
        ))}
        {f >= conf && (
          <Panel style={{ padding: "18px 22px", borderColor: `${C.green}88`, ...card(conf) }}>
            <Tag color={C.green} style={{ fontSize: 17 }}>CONFIRMED · SOLANA</Tag>
            <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 27, color: C.text, marginTop: 8 }}>{t.sol} SOL → {t.got} ${t.symbol}</div>
            <div style={{ fontFamily: MONO, fontSize: 17, color: C.muted, marginTop: 6 }}>tx {String(SD.tx).slice(0, 8)}…{String(SD.tx).slice(-6)} · signed only by {t.wallet.slice(0, 4)}…{t.wallet.slice(-4)}</div>
          </Panel>
        )}
        {f >= exit && ex.length > 0 && (
          <Panel style={{ padding: "18px 22px", borderColor: `${C.cyan}77`, ...card(exit) }}>
            <Tag color={C.cyan} style={{ fontSize: 17 }}>EXIT PLAN · FROM $GTA6'S OWN VOLATILITY</Tag>
            {[{ k: ex[2], t: "take the rest", col: C.green }, { k: ex[1], t: "take 50%", col: C.green }, { k: "entry", t: "", col: C.muted }, { k: ex[3]?.replace("-", "−"), t: "bail", col: C.red }].map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10, opacity: fade(f, exit + 4 + i * 4, exit + 12 + i * 4) }}>
                <span style={{ width: 120, fontFamily: MONO, fontWeight: 700, fontSize: 28, color: r.col }}>{r.k}</span>
                <span style={{ flex: 1, height: 3, background: `${r.col}66` }} /><span style={{ fontFamily: MONO, fontSize: 20, color: C.muted, width: 140 }}>{r.t}</span>
              </div>
            ))}
          </Panel>
        )}
      </div>
    </AbsoluteFill>
  );
};

// ---------- 8. Receipts ----------
const Paper: React.FC<{ f: number; at: number; len: number; w: number; children: React.ReactNode }> = ({ f, at, len, w, children }) => {
  const h = interpolate(f, [at, at + 34], [0, len], clamp);
  return (
    <div style={{ width: w, height: h, overflow: "hidden", position: "relative" }}>
      <div style={{ position: "absolute", bottom: 0, left: 0, width: w, height: len, background: "#F3EFE6", color: "#1A1A1A", fontFamily: MONO, padding: "26px 30px", boxSizing: "border-box",
        clipPath: "polygon(0 0,100% 0,100% calc(100% - 12px),95% 100%,90% calc(100% - 12px),85% 100%,80% calc(100% - 12px),75% 100%,70% calc(100% - 12px),65% 100%,60% calc(100% - 12px),55% 100%,50% calc(100% - 12px),45% 100%,40% calc(100% - 12px),35% 100%,30% calc(100% - 12px),25% 100%,20% calc(100% - 12px),15% 100%,10% calc(100% - 12px),5% 100%,0 calc(100% - 12px))" }}>
        {children}
      </div>
    </div>
  );
};
const Proof: React.FC = () => {
  const { f, fa, c } = useScene("proof");
  const r1 = c("f2", /receipts/), r2 = c("f2", /later/);
  const g = SD.receiptGta6, a = SD.receiptAnt;
  const slide = ease(f, r2 - 10, r2 + 6);
  const row = (k: string, v: React.ReactNode) => <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, marginTop: 8 }}><span style={{ color: "#666" }}>{k}</span><span>{v}</span></div>;
  const pctS = (v: number) => `${v > 0 ? "+" : "−"}${Math.abs(Math.round(v))}%`;
  return (
    <AbsoluteFill>
      <Bg />
      <div style={{ position: "absolute", left: 700, top: 60, width: 520, height: 150, borderRadius: 30, background: "linear-gradient(180deg,#232B36,#151B23)", border: `2px solid ${C.line}`, boxShadow: "0 30px 80px #000a" }}>
        <div style={{ position: "absolute", left: 40, top: 30, fontFamily: MONO, fontSize: 20, letterSpacing: 4, color: C.muted }}>ODDSHOT · receipt</div>
        <div style={{ position: "absolute", right: 40, top: 32, width: 16, height: 16, borderRadius: 8, background: f >= r1 && f < r1 + 40 || f >= r2 && f < r2 + 40 ? C.green : "#2A3440", boxShadow: `0 0 12px ${C.green}` }} />
        <div style={{ position: "absolute", left: 40, right: 40, bottom: 26, height: 14, borderRadius: 7, background: "#06080B" }} />
      </div>
      <div style={{ position: "absolute", left: 960 - 230 - slide * 470, top: 196 }}>
        <Paper f={f} at={r1} len={540} w={460}>
          <div style={{ fontSize: 20, letterSpacing: 4, textAlign: "center" }}>ODDSHOT RECEIPT</div>
          <div style={{ borderTop: "2px dashed #999", margin: "12px 0" }} />
          <div style={{ fontSize: 34, fontWeight: 700 }}>${g.symbol}</div>
          {row("called", `${g.calledAt.replace("T", " ")} · EARLY`)}
          {row("then", `$${g.priceAtCall}`)}
          {row("now", `$${g.priceNow}`)}
          {row("peak / worst", `${pctS(g.peakPct)} / ${pctS(g.troughPct)}`)}
          <div style={{ borderTop: "2px dashed #999", margin: "16px 0 10px" }} />
          <div style={{ fontSize: 60, fontWeight: 700, color: "#0B8F55", textAlign: "center" }}>✓ HIT {pctS(g.changePct)}</div>
          <div style={{ fontSize: 17, color: "#666", textAlign: "center", marginTop: 6 }}>since the call · as of Oct 24</div>
        </Paper>
      </div>
      {f >= r2 && (
        <div style={{ position: "absolute", left: 960 - 230 + 0, top: 196 }}>
          <Paper f={f} at={r2 + 6} len={330} w={460}>
            <div style={{ fontSize: 20, letterSpacing: 4, textAlign: "center" }}>ODDSHOT RECEIPT</div>
            <div style={{ borderTop: "2px dashed #999", margin: "12px 0" }} />
            <div style={{ fontSize: 34, fontWeight: 700 }}>${a.symbol}</div>
            {row("called", `${a.calledAt.replace("T", " ")}`)}
            {row("note", "called after it moved")}
            <div style={{ fontSize: 52, fontWeight: 700, color: "#7A6A2A", textAlign: "center", marginTop: 16 }}>— FLAT {pctS(a.changePct)}</div>
          </Paper>
        </div>
      )}
      <DexA fa={fa} mood={f < c("f2") ? "doubt" : f < r1 + 30 ? "neutral" : "happy"} x={1490} y={540} w={420} look={{ x: -0.9, y: -0.5 }} />
      <OddyA fa={fa} mood={f < r1 ? "calm" : "smug"} x={1560} y={110} size={230} look={{ x: -0.9, y: 0.3 }} />
      <Tag style={{ position: "absolute", left: 70, top: 90, opacity: fade(f, r1 + 30, r1 + 40) }}>receipt · REAL PRICE HISTORY<br />MISSES COUNT TOO</Tag>
    </AbsoluteFill>
  );
};

// ---------- 9. Lag check: the thesis, tested on real data ----------
const Lag: React.FC = () => {
  const { f, fa, c } = useScene("lag");
  const odds: [number, number][] = SER.ant.odds, price: [number, number][] = SER.ant.price;
  const [s0, s1] = SER.ant.swing as [number, number];
  const t0 = s0 - 6 * 3600, t1 = Math.max(odds.at(-1)![0], price.at(-1)![0]);
  const X0 = 170, X1 = 1650, Y0 = 220, Y1 = 760;
  const x = (t: number) => X0 + ((t - t0) / (t1 - t0)) * (X1 - X0);
  const yo = (p: number) => Y1 - p * (Y1 - Y0);
  const ref = price.reduce((best, p) => (Math.abs(p[0] - s0) < Math.abs(best[0] - s0) ? p : best))[1];
  const yp = (v: number) => 560 - (v / ref - 1) * 900;
  const jumped = c("g1", /jumped/), over = c("g1", /overnight/), meme = c("g1", /meme/), climbed = c("g1", /climbed/), day = c("g1", /day/);
  const Todds = f < jumped ? t0 + (s0 - t0) * ease(f, 0, jumped) : f < over + 10 ? s0 + (s1 + 3 * 3600 - s0) * ease(f, jumped, over + 10) : s1 + 3 * 3600 + (t1 - s1 - 3 * 3600) * ease(f, climbed - 10, day + 10);
  const Tmeme = f < meme ? t0 : f < climbed ? t0 + (s1 + 3 * 3600 - t0) * ease(f, meme, meme + 24) : s1 + 3 * 3600 + (t1 - s1 - 3 * 3600) * ease(f, climbed - 10, day + 10);
  const pathOf = (pts: [number, number][], T: number, y: (v: number) => number) => pts.filter((p) => p[0] >= t0 && p[0] <= T).map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  const lg = SD.lag;
  const g2 = c("g2");
  const days = [Date.UTC(2026, 9, 23) / 1000, Date.UTC(2026, 9, 24) / 1000];
  return (
    <AbsoluteFill>
      <Bg />
      <div style={{ position: "absolute", left: 120, top: 56 }}>
        <Tag color={C.cyan}>lag_check · LIVE ON PAYBOX · v1.3.1</Tag>
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 46, color: C.text, marginTop: 8 }}>“{lg.question}”</div>
      </div>
      <div style={{ position: "absolute", right: 110, top: 70, fontFamily: MONO, fontWeight: 700, fontSize: 34, color: "#04130B", background: C.green, padding: "10px 22px", borderRadius: 12,
        transform: `scale(${f >= climbed ? sp(f, climbed + 6, 10) : 0})` }}>{lg.verdict}</div>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <rect x={x(s0)} y={Y0} width={x(s1) - x(s0)} height={Y1 - Y0} fill={C.cyan} opacity={0.12 * fade(f, over - 6, over + 8)} />
        {[0, 0.25, 0.5, 0.75, 1].map((p) => <g key={p}><line x1={X0} x2={X1} y1={yo(p)} y2={yo(p)} stroke={C.line} strokeWidth={1.5} />
          <text x={X0 - 16} y={yo(p) + 7} textAnchor="end" fontFamily={MONO} fontSize={19} fill={C.cyan} opacity={0.8}>{p * 100}%</text></g>)}
        {days.map((d) => <g key={d}><line x1={x(d)} x2={x(d)} y1={Y0} y2={Y1} stroke={C.line} strokeWidth={1.5} strokeDasharray="6 8" />
          <text x={x(d) + 10} y={Y1 + 32} fontFamily={MONO} fontSize={19} fill={C.muted}>{new Date(d * 1000).toISOString().slice(5, 10).replace("-", "/")} 00:00 UTC</text></g>)}
        <path d={pathOf(odds, Todds, yo)} fill="none" stroke={C.cyan} strokeWidth={6} strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 8px ${C.cyan}88)` }} />
        <path d={pathOf(price, Tmeme, yp)} fill="none" stroke={C.green} strokeWidth={6} strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 8px ${C.green}88)` }} />
        <text x={X1 + 18} y={yo(odds.at(-1)![1]) + 8} fontFamily={MONO} fontWeight={700} fontSize={22} fill={C.cyan} opacity={fade(f, jumped, jumped + 10)}>ODDS</text>
        <text x={X1 + 18} y={yp(price.at(-1)![1]) + 8} fontFamily={MONO} fontWeight={700} fontSize={22} fill={C.green} opacity={fade(f, meme, meme + 10)}>$ANT</text>
        <text x={X1 + 18} y={yp(price.at(-1)![1]) + 32} fontFamily={MONO} fontSize={16} fill={C.muted} opacity={fade(f, meme, meme + 10)}>price, relative</text>
      </svg>
      {[
        { at: over, x: x(s0) + 12, y: 236, t: `odds ${lg.oddsBefore}% → ${lg.oddsAfter}%`, col: C.cyan },
        { at: meme + 12, x: x(s0) + 12, y: 640, t: `meme ${lg.memeDuringPct > 0 ? "+" : ""}${lg.memeDuringPct}% during`, col: C.muted },
        { at: climbed, x: x(s1 + 6 * 3600) - 40, y: 300, t: `+${lg.meme6hPct}% after 6h`, col: C.green },
        { at: day, x: x(s1 + 24 * 3600) - 180, y: 330, t: `+${lg.meme24hPct}% after 24h`, col: C.green },
      ].map((a) => f < a.at ? null : (
        <div key={a.t} style={{ position: "absolute", left: a.x, top: a.y, fontFamily: HAND, fontWeight: 700, fontSize: 44, color: a.col, transform: "rotate(-4deg)", opacity: fade(f, a.at, a.at + 8), textShadow: "0 2px 12px #000" }}>{a.t}</div>
      ))}
      {f >= g2 && (
        <div style={{ position: "absolute", left: 120, right: 120, top: 818, display: "flex", gap: 18, alignItems: "center", opacity: fade(f, g2, g2 + 10) }}>
          <Tag style={{ letterSpacing: 2, fontSize: 19 }}>OTHER STORIES:</Tag>
          {SD.lagOthers.map((o: any) => (
            <span key={o.question} style={{ fontFamily: MONO, fontSize: 19, color: C.text, padding: "8px 14px", borderRadius: 10, background: "#151B23", border: `1px solid ${C.line}` }}>
              ${o.symbol} · {o.jumpPts > 0 ? "+" : ""}{o.jumpPts} pts · <b style={{ color: C.yellow }}>{o.verdict}</b>
            </span>
          ))}
        </div>
      )}
      <OddyA fa={fa} mood={f < g2 ? "calm" : "smug"} x={1700} y={850} size={130} look={{ x: -0.8, y: -0.6 }} />
    </AbsoluteFill>
  );
};

// ---------- 10. Sunrise ----------
const Sunrise: React.FC = () => {
  const { f, fa } = useScene("sunrise");
  const dawn = interpolate(f, [0, 40], [0.55, 1], clamp);
  return (
    <AbsoluteFill style={{ background: "#0C1226", transform: `scale(${interpolate(f, [0, 120], [1.02, 1.08], clamp)})` }}>
      <Bedroom dawn={dawn} glow={0} />
      <AbsoluteFill style={{ background: `radial-gradient(circle at 25% 35%, rgba(255,176,112,${0.18 * dawn}), transparent 55%)` }} />
      <DexA fa={fa} mood="calm" x={580} y={136} w={560} look={{ x: 0.7, y: -0.3 }} />
      <Blanket />
      <Clock text="7:42" />
      <OddyA fa={fa} mood="happy" x={1150} y={230} size={250} look={{ x: -0.8, y: 0.3 }} />
    </AbsoluteFill>
  );
};

// ---------- 11. End card ----------
const End: React.FC = () => {
  const { f, fa, c } = useScene("end");
  const s = sp(f, 4, 12);
  const live = c("z2", /Live/);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 20 }}>
      <Bg />
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 40%, ${C.green}1A, transparent 55%)` }} />
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 34, transform: `scale(${0.8 + 0.2 * s})`, opacity: Math.min(1, s * 1.4) }}>
        <Oddy size={200} mood="happy" blink={blinkAt(fa, 2, 120)} talk={talkAt("oddy", fa)} spin={fa * 0.8} />
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 170, letterSpacing: 6, color: C.text }}>ODDSHOT</div>
      </div>
      <div style={{ position: "relative", fontFamily: DISPLAY, fontSize: 50, color: C.muted, opacity: fade(f, 16, 28) }}>
        The odds moved. The memes haven't. <span style={{ color: C.green }}>Yet.</span>
      </div>
      <div style={{ position: "relative", display: "flex", gap: 18, marginTop: 14 }}>
        {[{ t: "10 tools", at: c("z2"), col: C.text }, { t: "Live on PayBox", at: live, col: C.green }, { t: "1 of 13 finalists", at: live + 14, col: C.yellow }].map((x) => (
          <span key={x.t} style={{ fontFamily: MONO, fontWeight: 700, fontSize: 30, color: x.col, padding: "10px 24px", borderRadius: 999, border: `2px solid ${x.col}66`, background: `${x.col}14`,
            opacity: fade(f, x.at, x.at + 8), transform: `translateY(${(1 - fade(f, x.at, x.at + 10)) * 16}px)` }}>{x.t}</span>
        ))}
      </div>
      <div style={{ position: "relative", fontFamily: MONO, fontSize: 26, color: C.muted, marginTop: 26, opacity: fade(f, live + 24, live + 36) }}>
        by Dappest Dev · 𝕏 @sentinel_dapper · MoonPay × PayBox Hackathon
      </div>
    </AbsoluteFill>
  );
};

// ---------- Captions + assembly ----------
const Captions: React.FC = () => {
  const fa = useCurrentFrame();
  const t = fa / FPS;
  const l = TL.lines.find((x) => t >= x.start - 0.08 && t <= x.start + x.dur + 0.3);
  if (!l || l.scene === "end") return null;
  const lt = t - l.start;
  const o = fade(fa, F(l.start - 0.08), F(l.start + 0.04)) * (1 - fade(fa, F(l.start + l.dur + 0.12), F(l.start + l.dur + 0.3)));
  const oddy = l.who === "oddy";
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 40, display: "flex", justifyContent: "center", opacity: o }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 18, padding: "14px 28px", borderRadius: 18, background: "#05070Bea", border: `2px solid ${oddy ? C.green : "#6D73FF"}55`, maxWidth: 1500 }}>
        <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 22, letterSpacing: 3, padding: "6px 12px", borderRadius: 8, marginTop: 4, background: oddy ? C.green : "#6D73FF", color: "#05070B" }}>{oddy ? "ODDY" : "DEX"}</span>
        <span style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: l.text.length > 110 ? 34 : 40, color: C.text, lineHeight: 1.28 }}>
          {l.words.map((w, i) => <span key={i} style={{ opacity: lt >= w.t - 0.03 ? 1 : 0.3 }}>{w.disp}{i < l.words.length - 1 ? " " : ""}</span>)}
        </span>
      </div>
    </div>
  );
};
const SCENES: Record<string, React.FC> = { cold: ColdOpen, arrive: Arrive, radar: Radar, call: Call, swarm: Swarm, seatbelt: Seatbelt, ape: Ape, proof: Proof, lag: Lag, sunrise: Sunrise, end: End };
const Cut: React.FC<{ dur: number; first: boolean; children: React.ReactNode }> = ({ dur, first, children }) => {
  const f = useCurrentFrame();
  const o = first ? 1 : fade(f, 0, 6);
  return <AbsoluteFill style={{ opacity: o * (1 - fade(f, dur - 4, dur)) + (f >= dur - 4 ? 0 : 0) }}>{children}</AbsoluteFill>;
};
export const LateAgain: React.FC = () => (
  <AbsoluteFill style={{ background: "#05070B" }}>
    {TL.scenes.map((s, i) => {
      const Scene = SCENES[s.id]!;
      const from = F(s.start), dur = F(s.end) - from;
      return (
        <Sequence key={s.id} from={from} durationInFrames={dur}>
          <Cut dur={i === TL.scenes.length - 1 ? dur + 10 : dur} first={i === 0}><Scene /></Cut>
        </Sequence>
      );
    })}
    <Captions />
  </AbsoluteFill>
);

export const LateThumb: React.FC = () => (
  <AbsoluteFill style={{ background: "linear-gradient(180deg,#0C1226,#151C38)" }}>
    <AbsoluteFill style={{ transform: "translateX(-380px)" }}>
      <Bedroom />
      <Dex width={560} mood="shock" look={{ x: 0.95, y: -0.3 }} phone glow={C.green} glowAmt={0.35} sweat={0.9} style={{ position: "absolute", left: 580, top: 136 }} />
      <Blanket />
    </AbsoluteFill>
    <Oddy size={300} mood="smug" look={{ x: -0.9, y: 0.3 }} talk={0.5} spin={20} style={{ position: "absolute", left: 830, top: 160 }} />
    <div style={{ position: "absolute", right: 90, top: 200, width: 760, textAlign: "right" }}>
      <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 150, lineHeight: 0.95, color: C.text }}>LATE<br />AGAIN<span style={{ color: C.red }}>?</span></div>
      <div style={{ fontFamily: DISPLAY, fontSize: 44, color: C.green, marginTop: 30 }}>The odds move first.</div>
      <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 34, color: C.muted, marginTop: 20, letterSpacing: 6 }}>ODDSHOT × PAYBOX</div>
    </div>
  </AbsoluteFill>
);
