import React from "react";
import { AbsoluteFill, Easing, Freeze, OffthreadVideo, Sequence, interpolate, random, spring, staticFile, useCurrentFrame } from "remotion";
import TLraw from "./comic-timeline.json";
import { clamp } from "./Oddshot";
import { Dex, Oddy, Coin, blinkAt, INK, DexMood, OddyMood } from "./Cast";
import { Paper, Frame, Caption, SFX, Burst, InkRoom, InkBlanket, SFXF, LETTER, K } from "./Comic";

// "Late Again", the motion comic: Dex and Oddy around real ChatGPT + PayBox runs of Oddshot.
// ---------- Timeline (comic/script.json → story/tts.py comic → story/timeline.py comic) ----------
const FPS = 30;
type Word = { w: string; t: number; d: number; disp: string };
type Line = { id: string; who: "dex" | "oddy"; scene: string; text: string; start: number; dur: number; words: Word[] };
const TL = TLraw as unknown as { total: number; scenes: { id: string; start: number; end: number }[]; lines: Line[] };
export const EPISODE_FRAMES = Math.ceil(TL.total * FPS);
const F = (s: number) => Math.round(s * FPS);
const L = (id: string) => TL.lines.find((l) => l.id === id)!;
const SC = (id: string) => TL.scenes.find((s) => s.id === id)!;
/** Absolute frame of the first word matching re in a line (or the line's start). */
const cue = (id: string, re?: RegExp, off = 0) => {
  const l = L(id);
  const w = re ? l.words.find((x) => re.test(x.w)) : undefined;
  if (re && !w) throw new Error(`no ${re} in ${id}`);
  return F(l.start + (w?.t ?? 0) + off);
};
const end = (id: string, off = 0) => F(L(id).start + L(id).dur + off);
const useScene = (id: string) => {
  const f = useCurrentFrame();
  const s0 = F(SC(id).start);
  return { f, fa: f + s0, c: (l: string, re?: RegExp, off = 0) => cue(l, re, off) - s0, e: (l: string, off = 0) => end(l, off) - s0 };
};
/** Mouth activity for a speaker at an absolute frame, from the voice's word boundaries. */
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

// ---------- Cast, inked and alive ----------
const DexI: React.FC<{ fa: number; mood: DexMood; x: number; y: number; w: number; look?: { x: number; y: number }; phone?: boolean; glowAmt?: number; sweat?: number; tilt?: number }> =
  ({ fa, mood, x, y, w, look, phone, glowAmt, sweat, tilt = 0 }) => (
    <Dex width={w} mood={mood} look={look} blink={blinkAt(fa, 1)} talk={talkAt("dex", fa)} phone={phone} glowAmt={glowAmt} sweat={sweat} ink
      tilt={tilt + Math.sin(fa / 47) * 1.2} style={{ position: "absolute", left: x, top: y + bob(fa, 3, 34) }} />
  );
const OddyI: React.FC<{ fa: number; mood: OddyMood; x: number; y: number; size: number; look?: { x: number; y: number }; style?: React.CSSProperties }> =
  ({ fa, mood, x, y, size, look, style }) => (
    <Oddy size={size} mood={mood} look={look} blink={blinkAt(fa, 2, 120)} talk={talkAt("oddy", fa)} spin={fa * 0.8} ink
      style={{ position: "absolute", left: x, top: y + bob(fa, 8, 26), ...style }} />
  );

// ---------- Comic machinery ----------
/** A panel (or anything) slamming onto the page. */
const Pop: React.FC<{ f: number; at: number; ox: number; oy: number; rot?: number; children: React.ReactNode }> = ({ f, at, ox, oy, rot = -2.5, children }) => {
  if (f < at) return null;
  const k = sp(f, at, 12, 190);
  return (
    <div style={{ position: "absolute", inset: 0, transform: `scale(${0.86 + 0.14 * k}) rotate(${rot * (1 - k)}deg)`, transformOrigin: `${ox}px ${oy}px`, opacity: Math.min(1, (f - at + 1) / 3) }}>
      {children}
    </div>
  );
};
const Tone: React.FC<{ w: number; h: number; bg: string; dot: string; id: string }> = ({ w, h, bg, dot, id }) => (
  <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
    <defs><pattern id={id} width={11} height={11} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx={5.5} cy={5.5} r={2.6} fill={dot} /></pattern></defs>
    <rect width={w} height={h} fill={bg} />
    <path d={`M0,${h * 0.62} L${w},${h * 0.3} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} opacity={0.55} />
  </svg>
);
const Stamp: React.FC<{ f: number; at: number; to?: number; x: number; y: number; text: string; color?: string; size?: number; rot?: number }> = ({ f, at, to = 1e9, x, y, text, color = K.red, size = 64, rot = -9 }) => {
  if (f < at || f >= to) return null;
  const k = interpolate(f - at, [0, 5, 8], [2.1, 0.93, 1], clamp);
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: `rotate(${rot}deg) scale(${k})`, transformOrigin: "50% 50%", opacity: Math.min(1, (f - at + 1) / 3),
      border: `8px solid ${color}`, color, fontFamily: SFXF, fontSize: size, letterSpacing: 4, padding: "0 22px", background: "#FFFDF4ee", boxShadow: `8px 8px 0 ${INK}`, whiteSpace: "nowrap" }}>{text}</div>
  );
};
const Bang: React.FC<{ f: number; at: number; to?: number; x: number; y: number; text: string; size?: number; rot?: number; color?: string }> = ({ f, at, to = 1e9, x, y, text, size, rot, color }) => {
  if (f < at || f >= to) return null;
  const k = sp(f, at, 8, 260);
  return <div style={{ position: "absolute", left: 0, top: 0, transform: `scale(${0.4 + 0.6 * k})`, transformOrigin: `${x + 100}px ${y + 60}px` }}><SFX x={x} y={y} text={text} size={size} rot={rot} color={color} /></div>;
};
const Sparkles: React.FC<{ f: number; at: number; x: number; y: number; n?: number; color?: string; spread?: number }> = ({ f, at, x, y, n = 12, color = K.yellow, spread = 240 }) => {
  if (f < at || f > at + 36) return null;
  const k = (f - at) / 36;
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      {Array.from({ length: n }, (_, i) => {
        const a = random(`sa${i}${at}`) * Math.PI * 2, d = spread * (0.4 + random(`sd${i}${at}`) * 0.6) * Easing.out(Easing.cubic)(k);
        return <path key={i} d={star(x + Math.cos(a) * d, y + Math.sin(a) * d, (10 + random(`sr${i}`) * 14) * (1 - k))} fill={color} stroke={INK} strokeWidth={3} />;
      })}
    </svg>
  );
};

/** Speech balloon for one line: shows the sentence being spoken, sized to it, tail toward the speaker. */
type Chunk = { text: string; a: number };
const chunksOf = (l: Line): Chunk[] => {
  const out: Chunk[] = [];
  let cur: Word[] = [];
  l.words.forEach((w, i) => {
    cur.push(w);
    if (i === l.words.length - 1 || (/[.?!]$/.test(w.disp) && cur.length >= 5)) {
      out.push({ text: cur.map((x) => x.disp).filter(Boolean).join(" "), a: l.start + cur[0]!.t });
      cur = [];
    }
  });
  return out;
};
const Say: React.FC<{ fa: number; id: string; x: number; y: number; w: number; tx: number; ty: number; size?: number }> = ({ fa, id, x, y, w, tx, ty, size = 33 }) => {
  const l = L(id), t = fa / FPS;
  const next = TL.lines[TL.lines.indexOf(l) + 1];
  const cs = chunksOf(l);
  const last = Math.min(l.start + l.dur + 0.7, next ? next.start - 0.04 : 1e9);
  const k = cs.findIndex((c, i) => t >= c.a - 0.12 && t < (i < cs.length - 1 ? cs[i + 1]!.a - 0.12 : last));
  if (k < 0) return null;
  const pop = sp(fa, F(cs[k]!.a - 0.12), 10, 230);
  const oddy = l.who === "oddy";
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, transform: `scale(${0.82 + 0.18 * pop})`, transformOrigin: `${tx}px ${ty}px` }}>
      <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }} width={1} height={1}>
        <path d={`M${w * 0.4},50 L${tx},${ty} L${w * 0.56},50 Z`} fill={oddy ? "#E3FFF0" : "#fff"} stroke={INK} strokeWidth={5} strokeLinejoin="round" />
      </svg>
      <div style={{ position: "relative", background: oddy ? "#E3FFF0" : "#fff", border: `5px solid ${INK}`, borderRadius: "50%", padding: "34px 46px", textAlign: "center", fontFamily: LETTER,
        fontWeight: 700, fontSize: size, color: INK, textTransform: "uppercase", lineHeight: 1.13, boxShadow: `7px 7px 0 ${INK}26` }}>{cs[k]!.text}</div>
    </div>
  );
};

// ---------- Oddy's four jobs: introduced in the intro, tracked through the episode ----------
const JOBS: [string, string, string][] = [
  ["SPOT THE MOVE", "The biggest Polymarket odds swings", "MOVE"],
  ["FIND THE OG", "The real coin, not the copycats", "OG"],
  ["CHECK IT'S SAFE", "Holders, liquidity, rug risk", "SAFE"],
  ["SET UP THE SWAP", "Ready in PayBox. You approve.", "SWAP"],
];
/** The job strip at the foot of a talk panel: done jobs ticked, this scene's job lit. */
const Jobs: React.FC<{ f: number; job: number; x: number; y: number }> = ({ f, job, x, y }) => {
  const k = sp(f, 8, 12, 170);
  return (
    <div style={{ position: "absolute", left: x, top: y, display: "flex", gap: 8, alignItems: "center", transform: `translateY(${(1 - k) * 90}px)` }}>
      {JOBS.map(([, , s], i) => {
        const on = i === job, done = i < job;
        return (
          <div key={i} style={{ background: on ? K.yellow : done ? K.green : "#FFFDF4", border: `4px solid ${INK}`, padding: on ? "5px 12px" : "3px 9px", fontFamily: SFXF, fontSize: on ? 32 : 24,
            letterSpacing: 1.5, color: INK, opacity: on || done ? 1 : 0.62, transform: `rotate(${on ? -3 : i % 2 ? 1 : -1}deg)`, boxShadow: on ? `5px 5px 0 ${INK}` : "none", whiteSpace: "nowrap" }}>
            {done ? "✓" : i + 1} {s}
          </div>
        );
      })}
    </div>
  );
};
const JobIcon: React.FC<{ i: number }> = ({ i }) => (
  <svg width={96} height={96} viewBox="0 0 96 96" style={{ overflow: "visible" }}>
    {i === 0 && <><rect x={8} y={8} width={80} height={80} rx={14} fill="#fff" stroke={INK} strokeWidth={6} />
      <polyline points="18,72 38,50 52,60 76,26" fill="none" stroke="#13A35E" strokeWidth={9} strokeLinejoin="round" strokeLinecap="round" />
      <path d="M60,24 L80,22 L78,42" fill="none" stroke="#13A35E" strokeWidth={9} strokeLinejoin="round" strokeLinecap="round" /></>}
    {i === 2 && <><path d="M48,6 L84,20 L81,50 C76,72 62,84 48,90 C34,84 20,72 15,50 L12,20 Z" fill={K.green} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
      <path d="M32,48 L44,60 L66,36" fill="none" stroke={INK} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" /></>}
    {i === 3 && <><circle cx={48} cy={48} r={40} fill={K.cyan} stroke={INK} strokeWidth={6} />
      <path d="M24,40 L66,40 M56,28 L68,40 L56,52" fill="none" stroke={INK} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M72,60 L30,60 M40,48 L28,60 L40,72" fill="none" stroke={INK} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" /></>}
  </svg>
);
const JobCard: React.FC<{ f: number; ats: number[]; ok: number }> = ({ f, ats, ok }) => (
  <>
    <Tone w={790} h={1000} bg="#FFF8E7" dot="#F2DFB0" id="jobTone" />
    <Caption x={28} y={24} rot={-1.5} size={32}>Oddy's job</Caption>
    {JOBS.map(([title, sub], i) => {
      const at = ats[i]!, on = f >= at, k = on ? sp(f, at, 10, 210) : 0, lit = on && f < (ats[i + 1] ?? ok);
      return (
        <div key={i} style={{ position: "absolute", left: 30, top: 128 + i * 172, width: 730, height: 150, display: "flex", alignItems: "center", gap: 22, padding: "0 20px", boxSizing: "border-box",
          background: lit ? K.yellow : "#fff", border: `6px solid ${INK}`, borderRadius: 20, boxShadow: `8px 8px 0 ${INK}`, opacity: on ? 1 : 0.28,
          transform: `scale(${0.9 + 0.1 * k + 0.05 * Math.sin(k * Math.PI)}) rotate(${(i % 2 ? 1 : -1) * (1 - k) * 4}deg)` }}>
          <div style={{ width: 74, height: 74, borderRadius: 37, background: INK, color: K.yellow, fontFamily: SFXF, fontSize: 50, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: SFXF, fontSize: 58, letterSpacing: 2, color: INK, lineHeight: 1 }}>{title}</div>
            <div style={{ fontFamily: LETTER, fontWeight: 700, fontSize: 24, color: "#5A4A2A", marginTop: 6 }}>{sub}</div>
          </div>
          {i === 1 ? <Coin size={84} label="OG" font={SFXF} color={K.yellow} crown style={{ marginTop: 18 }} /> : <JobIcon i={i} />}
        </div>
      );
    })}
    <Stamp f={f} at={ok} x={190} y={828} text="YOU APPROVE" color="#13A35E" size={78} rot={-6} />
  </>
);

// ---------- Real footage panels ----------
// Crops are keyframed in source pixels ([shot frame, x, y, width]); marks are rectangles in source pixels,
// so the ink rings stay locked to the UI while the camera moves. A shot with skip shows how much real time was cut.
type Shot = { at: number; src: string; from: number; rate?: number; hold?: boolean; skip?: boolean | string; crop: number[][] };
type MarkT = { at: number; r: number[]; box?: boolean; color?: string };
/** A magnifier: the source rect r blown up s times into an inset at panel position (x, y). */
type ZoomT = { at: number; r: number[]; x: number; y: number; s?: number; label?: string; rot?: number };
const cropAt = (s: Shot, lf: number) => {
  const ks = s.crop;
  if (lf <= ks[0]![0]!) return ks[0]!.slice(1);
  for (let i = 1; i < ks.length; i++) {
    const a = ks[i - 1]!, b = ks[i]!;
    if (lf < b[0]!) {
      const k = Easing.inOut(Easing.cubic)((lf - a[0]!) / (b[0]! - a[0]!));
      return [1, 2, 3].map((j) => a[j]! + (b[j]! - a[j]!) * k);
    }
  }
  return ks[ks.length - 1]!.slice(1);
};
const shotIndex = (shots: Shot[], f: number) => shots.reduce((k, s, j) => (f >= s.at ? j : k), 0);
const skipText = (shots: Shot[], i: number) => {
  const s = shots[i]!, p = shots[i - 1];
  if (typeof s.skip === "string") return s.skip;
  if (!s.skip || !p) return null;
  const was = p.from + (p.hold ? 0 : ((s.at - p.at) / FPS) * (p.rate ?? 1));
  return `${Math.round(s.from - was)} seconds later…`;
};
const Footage: React.FC<{ f: number; x: number; y: number; w: number; h: number; at?: number; rot?: number; shots: Shot[]; marks?: MarkT[]; zooms?: ZoomT[]; stamp?: number; children?: React.ReactNode }> =
  ({ f, x, y, w, h, at = 0, rot = 0, shots, marks = [], zooms = [], stamp, children }) => {
    const W = w - 14, H = h - 14;
    const i = shotIndex(shots, f), s = shots[i]!;
    const [cx0, cy0, cw] = cropAt(s, f - s.at) as [number, number, number];
    const sc = W / cw, ch = H / sc;
    const cx = Math.min(Math.max(cx0, 0), 1920 - cw), cy = Math.min(Math.max(cy0, 110), 1080 - ch);
    const nextAt = shots[i + 1]?.at ?? 100000;
    /** This shot's video, scaled k and offset so source pixel (ox, oy) lands at the box's corner. */
    const film = (k: number, ox: number, oy: number) => {
      const v = <OffthreadVideo src={staticFile(`cuts/${s.src}.mp4`)} trimBefore={Math.round(s.from * FPS)} playbackRate={s.rate ?? 1} muted
        style={{ position: "absolute", left: -ox * k, top: -oy * k, width: 1920 * k, height: 1080 * k, maxWidth: "none" }} />;
      return <Sequence from={s.at} durationInFrames={Math.max(1, nextAt - s.at)} layout="none">{s.hold ? <Freeze frame={0}>{v}</Freeze> : v}</Sequence>;
    };
    const mine = <T extends { at: number }>(xs: T[]) => xs.filter((m) => f >= m.at && shotIndex(shots, m.at) === i);
    const skip = f < s.at + 48 ? skipText(shots, i) : null;
    return (
      <Pop f={f} at={at} ox={x + w / 2} oy={y + h / 2}>
        <Frame x={x} y={y} w={w} h={h} rot={rot} bg="#0B0B0B">
          <React.Fragment key={i}>{film(sc, cx, cy)}</React.Fragment>
          <svg width={W} height={H} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
            {mine(marks).map((m, j) => {
              const p = Easing.out(Easing.cubic)(Math.min(1, (f - m.at) / 9));
              const [mx, my, mw, mh] = m.r as [number, number, number, number];
              const px = (mx - cx) * sc, py = (my - cy) * sc, pw = mw * sc, ph = mh * sc, col = m.color ?? K.yellow;
              const shape = (stroke: string, sw: number) => m.box
                ? <rect x={px - 10} y={py - 13} width={pw + 20} height={ph + 26} rx={14} fill="none" stroke={stroke} strokeWidth={sw} pathLength={1} strokeDasharray="1" strokeDashoffset={1 - p} />
                : <ellipse cx={px + pw / 2} cy={py + ph / 2} rx={pw / 2 + 22} ry={ph / 2 + 16} fill="none" stroke={stroke} strokeWidth={sw} pathLength={1} strokeDasharray="1" strokeDashoffset={1 - p}
                    transform={`rotate(-4 ${px + pw / 2} ${py + ph / 2})`} />;
              return <g key={j} strokeLinecap="round">{shape(INK, 14)}{shape(col, 7)}</g>;
            })}
          </svg>
          {mine(zooms).map((z, j) => {
            const k = z.s ?? 2.4, pad = 8, [mx, my, mw, mh] = z.r as [number, number, number, number];
            const lw = (mw + 2 * pad) * k, lh = (mh + 2 * pad) * k, p = sp(f, z.at, 11, 210);
            const ax = (mx + mw / 2 - cx) * sc, ay = (my + mh / 2 - cy) * sc, bx = z.x + lw / 2, by = z.y + lh / 2;
            const nx = -(by - ay), ny = bx - ax, nl = Math.hypot(nx, ny) || 1, wd = 26 * p;
            return (
              <React.Fragment key={`z${j}`}>
                <svg width={W} height={H} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
                  <path d={`M${ax},${ay} L${ax + (bx - ax) * p + (nx / nl) * wd},${ay + (by - ay) * p + (ny / nl) * wd} L${ax + (bx - ax) * p - (nx / nl) * wd},${ay + (by - ay) * p - (ny / nl) * wd} Z`}
                    fill={`${K.yellow}88`} stroke={INK} strokeWidth={4} strokeLinejoin="round" />
                </svg>
                <div style={{ position: "absolute", left: z.x, top: z.y, width: lw, height: lh, transform: `scale(${0.4 + 0.6 * p}) rotate(${z.rot ?? -2}deg)`, transformOrigin: "50% 50%",
                  border: `7px solid ${INK}`, borderRadius: 12, overflow: "hidden", background: "#0B0B0B", boxShadow: `0 0 0 5px #FFFDF4, 10px 10px 0 5px ${INK}`, opacity: Math.min(1, (f - z.at + 1) / 3) }}>
                  {film(k, mx - pad, my - pad)}
                </div>
                {z.label && f >= z.at + 5 && <Caption x={z.x - 10} y={z.y - 46} rot={-3} size={24}>{z.label}</Caption>}
              </React.Fragment>
            );
          })}
          {skip && <Caption x={22} y={20} rot={-2} size={30}>{skip}</Caption>}
          {children}
          <div style={{ position: "absolute", right: 14, bottom: 12, background: "#FFFDF4", border: `3px solid ${INK}`, padding: "3px 12px", fontFamily: LETTER, fontWeight: 700, fontSize: 19,
            letterSpacing: 1, color: INK }}>REAL RUN · CHATGPT + PAYBOX</div>
        </Frame>
        {stamp !== undefined && <Stamp f={f} at={stamp} x={x + w - 420} y={y + 26} text="REAL FOOTAGE" rot={7} size={58} />}
      </Pop>
    );
  };

/** The tall talk panel beside the footage: Dex at the bottom, Oddy hovering, the job strip at the foot. */
const Talk: React.FC<{ f: number; fa: number; x: number; bg: string; dot: string; id: string; dex: DexMood; oddy: OddyMood; look?: number; sweat?: number; job?: number; children?: React.ReactNode }> =
  ({ f, fa, x, bg, dot, id, dex, oddy, look = 0, sweat = 0, job, children }) => (
    <Pop f={f} at={0} ox={x + 280} oy={540}>
      <Frame x={x} y={40} w={560} h={1000}>
        <Tone w={560} h={1000} bg={bg} dot={dot} id={id} />
        <DexI fa={fa} mood={dex} x={30} y={440} w={500} look={{ x: look, y: -0.2 }} sweat={sweat} />
        <OddyI fa={fa} mood={oddy} x={385} y={440} size={160} look={{ x: -0.6, y: 0.3 }} />
        {children}
        {job !== undefined && <Jobs f={f} job={job} x={16} y={918} />}
      </Frame>
    </Pop>
  );
// Balloon anchors for a talk panel at x: Dex's head and Oddy's ring.
const dexTail = (x: number) => ({ x: x + 30, y: 150, w: 500, tx: 250, ty: 440 });
const oddyTail = (x: number) => ({ x: x + 30, y: 150, w: 500, tx: 435, ty: 340 });
const SIDE = { left: { talk: 40, foot: 630 }, right: { talk: 1320, foot: 40 } };
const WIDE = [[0, 395, 115, 1210]];

// ---------- 0. Hook: one real result before the story starts ----------
const Hook: React.FC = () => {
  const { f, fa, c, e } = useScene("hook");
  const th = c("h1", /hundred/);
  return (
    <AbsoluteFill>
      <Paper />
      <Footage f={f} x={40} y={118} w={1840} h={924}
        shots={[{ at: 0, src: "receipt", from: 48.0, hold: true, crop: [[0, 395, 470, 1210], [th - 16, 400, 470, 1000], [th + 4, 400, 480, 760]] }]}
        marks={[{ at: th + 2, r: [428, 610, 180, 56], color: K.green }]}>
        <Pop f={f} at={e("h1", -0.5)} ox={300} oy={850}><Caption x={26} y={820} rot={-1.5} size={38} bg="#fff">Every clip in this is a real run</Caption></Pop>
      </Footage>
      <Pop f={f} at={3} ox={300} oy={60}><Caption x={40} y={22} rot={-1.5} size={46}>Oddshot · a PayBox plugin</Caption></Pop>
      <Stamp f={f} at={th + 6} x={1130} y={400} text="HIT!" color="#13A35E" size={170} rot={10} />
      <Sparkles f={f} at={th + 8} x={1300} y={500} n={18} spread={300} />
      <OddyI fa={fa} mood="smug" x={1570} y={70} size={250} look={{ x: -0.8, y: 0.3 }} />
      <Say fa={fa} id="h1" x={1010} y={80} w={540} tx={590} ty={150} size={34} />
    </AbsoluteFill>
  );
};

// ---------- 1. Cold open: 3:07 AM ----------
const Cold: React.FC = () => {
  const { f, fa, c } = useScene("cold");
  const tap = c("c1", /^in$/i), crash = c("c2", undefined, -1.3);
  const mood: DexMood = f < crash ? "hype" : f < c("c2", /Late/) ? "shock" : "sad";
  const k = interpolate(f, [crash, crash + 16], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const rise = Array.from({ length: 18 }, (_, i) => [20 + i * 26, 330 - Math.pow(i / 17, 2.3) * 270 - 6 * Math.sin(i * 2.3) * (i / 17)]);
  const fall = [[462, 60], [490, 140], [520, 120], [555, 260], [590, 330], [630, 350]].slice(0, 1 + Math.floor(k * 5));
  const pressed = f >= tap ? sp(f, tap, 9, 260) : 0;
  return (
    <AbsoluteFill>
      <Paper />
      <Pop f={f} at={0} ox={615} oy={540}>
        <Frame x={40} y={36} w={1150} h={1008}>
          <InkRoom w={1150} h={1008} />
          {mood === "hype" && (
            <svg width={1150} height={1008} style={{ position: "absolute", inset: 0 }}>
              {[[-150, 0], [-120, -60], [120, -60], [150, 0], [-90, -105], [90, -105]].map(([dx, dy], i) => (
                <line key={i} x1={700 + dx! * 0.92} y1={330 + dy! * 0.92} x2={700 + dx! * 1.18} y2={330 + dy! * 1.18} stroke={INK} strokeWidth={7} strokeLinecap="round" />
              ))}
            </svg>
          )}
          <DexI fa={fa} mood={mood} x={430} y={150} w={540} look={{ x: 0.5, y: 0.8 }} phone glowAmt={0.55} sweat={mood === "hype" ? 0 : 1} />
          <InkBlanket w={1150} h={1008} y={840} />
          <Pop f={f} at={4} ox={120} oy={80}><Caption x={28} y={28} rot={-1.5}>3:07 AM.</Caption></Pop>
          <Pop f={f} at={14} ox={300} oy={150}><Caption x={28} y={110} rot={-0.5} size={30} bg="#fff">Meet Dex. He's always late.</Caption></Pop>
        </Frame>
      </Pop>
      <Pop f={f} at={20} ox={1550} oy={320} rot={4}>
        <Frame x={1225} y={50} w={650} h={540} rot={2}>
          <Burst w={650} h={540} cx={330} cy={270} />
          <div style={{ position: "absolute", left: 175, top: 40, width: 300, height: 520, borderRadius: 40, background: "#14181F", border: `7px solid ${INK}`, padding: 18, boxSizing: "border-box" }}>
            <div style={{ fontFamily: LETTER, fontWeight: 700, fontSize: 22, color: "#9AA4B2" }}>@moonmath_</div>
            <div style={{ fontFamily: LETTER, fontWeight: 700, fontSize: 30, color: "#fff", lineHeight: 1.1, marginTop: 4 }}>$MOON +600%. STILL EARLY.</div>
            <svg width={250} height={170} style={{ marginTop: 18 }}><polyline points="5,160 60,150 100,135 140,110 175,70 205,30 240,8" fill="none" stroke={K.green} strokeWidth={8} strokeLinejoin="round" /></svg>
            <div style={{ marginTop: 14, height: 70, borderRadius: 18, background: f >= tap ? "#1FA866" : K.green, border: `5px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: SFXF, fontSize: 40, color: INK, letterSpacing: 2, transform: `scale(${1 - 0.08 * Math.sin(pressed * Math.PI)})` }}>{f >= tap ? "BOUGHT ✓" : "BUY $MOON"}</div>
          </div>
        </Frame>
        <Bang f={f} at={tap} x={1600} y={340} text="TAP!" size={130} rot={-12} />
      </Pop>
      <Pop f={f} at={crash - 4} ox={1550} oy={835} rot={-3}>
        <Frame x={1215} y={630} w={670} h={410} rot={-1.5} bg="#10141B">
          <svg width={656} height={396} style={{ position: "absolute", inset: 0 }}>
            {[90, 170, 250, 330].map((gy) => <line key={gy} x1={0} x2={656} y1={gy} y2={gy} stroke="#ffffff12" strokeWidth={2} />)}
            <polyline points={rise.map((p) => p.join(",")).join(" ")} fill="none" stroke={K.green} strokeWidth={9} strokeLinejoin="round" />
            <polyline points={[rise[rise.length - 1]!, ...fall].map((p) => p.join(",")).join(" ")} fill="none" stroke={K.red} strokeWidth={10} strokeLinejoin="round" />
          </svg>
          <div style={{ position: "absolute", left: 24, top: 18, fontFamily: LETTER, fontWeight: 700, fontSize: 28, color: "#9AA4B2" }}>$MOON · 1m</div>
          {k >= 1 && <div style={{ position: "absolute", right: 30, bottom: 30, fontFamily: SFXF, fontSize: 64, color: K.red, letterSpacing: 2 }}>−62%</div>}
        </Frame>
        <Bang f={f} at={crash + 10} x={1270} y={700} text="DUMP!" size={120} rot={8} color={K.red} />
      </Pop>
      <Say fa={fa} id="c1" x={680} y={56} w={470} tx={110} ty={250} />
      <Say fa={fa} id="c2" x={680} y={56} w={470} tx={110} ty={250} size={36} />
    </AbsoluteFill>
  );
};

// ---------- 2. Meet Oddy: who he is, how it works, his four jobs ----------
const Arrive: React.FC = () => {
  const { f, fa, c } = useScene("oddy");
  const out = sp(f, 6, 11, 120);
  const ox = interpolate(out, [0, 1], [560, 650]), oy = interpolate(out, [0, 1], [640, 150]), os = interpolate(out, [0, 1], [70, 300]);
  const dexMood: DexMood = f < c("o3") ? "shock" : f < c("o5") ? "doubt" : "happy";
  const how = c("o1", undefined, -0.2), jump = c("o1", /moved/), later = c("o1", /hours/), follow = c("o4", /follow/), J = c("o5", undefined, -0.3);
  const jobs = [c("o5", /spot/), c("o5", /find/), c("o5", /check/), c("o5", /swap/)], ok = c("o5", /approve/);
  const odds = Math.round(interpolate(f, [jump, jump + 18], [22, 61], { ...clamp, easing: Easing.out(Easing.cubic) }));
  const coinUp = sp(f, follow, 12, 110);
  const flip = ease(f, J, J + 12);
  return (
    <AbsoluteFill>
      <Paper />
      <Pop f={f} at={0} ox={545} oy={540}>
        <Frame x={40} y={40} w={1010} h={1000}>
          <InkRoom w={1150} h={1000} />
          <DexI fa={fa} mood={dexMood} x={300} y={250} w={480} look={{ x: f < 40 ? 0.9 : 0.8, y: f < 40 ? 0.2 : -0.6 }} phone glowAmt={0.4} sweat={dexMood === "shock" ? 1 : 0} />
          <InkBlanket w={1010} h={1000} y={860} />
          {f >= 6 && f < 26 && (
            <svg width={1010} height={1000} style={{ position: "absolute", inset: 0 }}>
              {Array.from({ length: 14 }, (_, i) => {
                const a = (i / 14) * Math.PI * 2, r0 = 40 + (f - 6) * 10, r1 = r0 + 70;
                return <line key={i} x1={ox + os / 2 + Math.cos(a) * r0} y1={oy + os / 2 + Math.sin(a) * r0} x2={ox + os / 2 + Math.cos(a) * r1} y2={oy + os / 2 + Math.sin(a) * r1} stroke={K.yellow} strokeWidth={8} strokeLinecap="round" />;
              })}
            </svg>
          )}
          <OddyI fa={fa} mood={f < c("o2") ? "alert" : f < c("o3") ? "smug" : f < c("o5") ? "calm" : "happy"} x={ox} y={oy} size={os} look={{ x: f < c("o2") || f >= c("o4") ? 0.9 : -0.8, y: 0.4 }} />
          <Pop f={f} at={c("o3", /Oddy/)} ox={200} oy={900}><Caption x={28} y={870} rot={-1}>Meet Oddy.</Caption></Pop>
          <Pop f={f} at={c("o3", /plugin/)} ox={400} oy={950}><Caption x={28} y={940} rot={0.5} size={28} bg="#fff">The Oddshot plugin. Lives in PayBox.</Caption></Pop>
        </Frame>
      </Pop>
      <Bang f={f} at={8} to={50} x={720} y={70} text="ZING!" size={110} rot={10} />
      <Pop f={f} at={how - 6} ox={1485} oy={540} rot={3}>
        <Frame x={1090} y={40} w={790} h={1000} bg="#FFF8E7">
          <div style={{ position: "absolute", inset: 0, transform: `translateY(${-flip * 1000}px)` }}>
            <Tone w={790} h={1000} bg="#FFF8E7" dot="#F2DFB0" id="howTone" />
            <Caption x={28} y={24} rot={-1.5} size={32}>How it works</Caption>
            {/* 1. the crowd bets */}
            <div style={{ position: "absolute", left: 40, top: 120, width: 700, fontFamily: SFXF, fontSize: 52, color: INK, letterSpacing: 2 }}>1. THE CROWD BETS</div>
            <div style={{ position: "absolute", left: 40, top: 190, width: 690, height: 250, background: "#fff", border: `6px solid ${INK}`, borderRadius: 20, boxShadow: `8px 8px 0 ${INK}`, padding: "20px 26px", boxSizing: "border-box" }}>
              <div style={{ fontFamily: LETTER, fontWeight: 700, fontSize: 30, color: INK }}>"ANTHROPIC'S TICKER IS ANT?"</div>
              <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 22 }}>
                <div style={{ flex: 1, height: 56, border: `5px solid ${INK}`, borderRadius: 14, background: "#EEE", overflow: "hidden" }}>
                  <div style={{ width: `${odds}%`, height: "100%", background: K.green, borderRight: `5px solid ${INK}` }} />
                </div>
                <div style={{ fontFamily: SFXF, fontSize: 84, color: f >= jump ? "#13A35E" : INK, width: 170, textAlign: "right" }}>{odds}%</div>
              </div>
              <div style={{ fontFamily: LETTER, fontWeight: 700, fontSize: 24, color: "#555", marginTop: 10 }}>POLYMARKET · YES</div>
            </div>
            <Bang f={f} at={jump + 4} x={500} y={130} text="JUMP!" size={88} rot={-10} />
            {/* hours later */}
            {f >= later && (
              <Pop f={f} at={later} ox={250} oy={540}>
                <svg width={790} height={1000} style={{ position: "absolute", inset: 0 }}>
                  <path d="M200,470 C190,520 210,560 200,600" stroke={INK} strokeWidth={9} fill="none" strokeLinecap="round" strokeDasharray="4 18" />
                  <path d="M178,585 L200,625 L222,585" stroke={INK} strokeWidth={9} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <Caption x={250} y={505} rot={-2} size={30} bg="#fff">Hours later…</Caption>
              </Pop>
            )}
            {/* 2. the memes follow */}
            <div style={{ position: "absolute", left: 40, top: 640, fontFamily: SFXF, fontSize: 52, color: INK, letterSpacing: 2, opacity: f >= follow - 4 ? 1 : 0.25 }}>2. THE MEMES FOLLOW</div>
            {f >= follow - 4 && (
              <>
                <Coin size={150} label="$ANT" color={K.yellow} style={{ position: "absolute", left: 120, top: 860 - coinUp * 130 }} />
                <svg width={790} height={1000} style={{ position: "absolute", inset: 0 }}>
                  <path d={`M300,${930 - coinUp * 40} L${300 + coinUp * 300},${930 - coinUp * 210}`} stroke={K.green} strokeWidth={16} strokeLinecap="round" />
                  <path d={`M300,${930 - coinUp * 40} L${300 + coinUp * 300},${930 - coinUp * 210}`} stroke={INK} strokeWidth={4} strokeLinecap="round" fill="none" opacity={0.5} />
                </svg>
                <div style={{ position: "absolute", left: 560, top: 760, fontFamily: SFXF, fontSize: 80, color: "#13A35E", WebkitTextStroke: `4px ${INK}`, paintOrder: "stroke fill", opacity: coinUp }}>+15%</div>
              </>
            )}
            <div style={{ position: "absolute", left: 40, bottom: 22, fontFamily: LETTER, fontWeight: 700, fontSize: 22, color: "#6B5A3A" }}>REAL CASE: $ANT, OCT 23. NOT EVERY STORY FOLLOWS. ODDSHOT CHECKS.</div>
          </div>
          <div style={{ position: "absolute", inset: 0, transform: `translateY(${(1 - flip) * 1000}px)` }}>
            {f >= J && <JobCard f={f} ats={jobs} ok={ok} />}
          </div>
        </Frame>
      </Pop>
      <Say fa={fa} id="o1" x={60} y={60} w={560} tx={640} ty={190} />
      <Say fa={fa} id="o2" x={80} y={300} w={360} tx={300} ty={260} size={38} />
      <Say fa={fa} id="o3" x={60} y={60} w={560} tx={640} ty={190} />
      <Say fa={fa} id="o4" x={60} y={60} w={560} tx={640} ty={190} />
      <Say fa={fa} id="o5" x={60} y={60} w={580} tx={640} ty={190} size={31} />
    </AbsoluteFill>
  );
};

// ---------- 3. Where Oddy lives: PayBox ----------
const Install: React.FC = () => {
  const { f, fa, c } = useScene("install");
  const side = SIDE.right;
  return (
    <AbsoluteFill>
      <Paper />
      <Footage f={f} x={side.foot} y={40} w={1250} h={1000} stamp={10}
        shots={[{ at: 0, src: "install", from: 7.4, crop: [[0, 470, 140, 1120], [34, 470, 140, 1120], [54, 540, 270, 860]] }]}
        marks={[{ at: 62, r: [722, 404, 250, 72] }]}>
        <Pop f={f} at={50} ox={300} oy={900}><Caption x={26} y={900} rot={-1.5} size={32}>PayBox › Plugins › Oddshot</Caption></Pop>
      </Footage>
      <Talk f={f} fa={fa} x={side.talk} bg="#BFF0FF" dot="#8FD8F0" id="tInstall" dex={f < c("i2") ? "doubt" : "happy"} oddy="happy" look={-0.7} />
      <Pop f={f} at={c("i2", /AI/)} ox={1600} oy={980}><Caption x={1350} y={960} rot={1.5} size={26} bg="#fff">Works in ChatGPT and Claude</Caption></Pop>
      <Say fa={fa} id="i1" {...dexTail(side.talk)} />
      <Say fa={fa} id="i2" {...oddyTail(side.talk)} />
    </AbsoluteFill>
  );
};

// ---------- 4. Job 1, proven: lag_check ----------
const Lag: React.FC = () => {
  const { f, fa, c, e } = useScene("lag");
  const side = SIDE.left;
  const R = c("l2", undefined, -0.8), T = R + 45, C = c("l2", /dipped/, -0.15);
  const tw = c("l2", /twenty/), tf = c("l2", /fifteen/);
  return (
    <AbsoluteFill>
      <Paper />
      <Footage f={f} x={side.foot} y={40} w={1250} h={1000}
        shots={[
          { at: 0, src: "lag", from: 0.2, crop: WIDE },
          { at: R, src: "lag", from: 14.6, skip: true, crop: WIDE },
          { at: T, src: "lag", from: 17.6, hold: true, crop: [[0, 395, 115, 1210], [tw - T - 8, 395, 115, 1210], [tw - T + 10, 395, 442, 800]] },
          { at: C, src: "lag", from: 23.0, hold: true, crop: [[0, 395, 115, 1210], [tf - C - 10, 395, 115, 1210], [tf - C + 8, 850, 360, 760]] },
        ]}
        marks={[
          { at: T + 4, r: [1388, 586, 192, 34], color: K.green },
          { at: tw, r: [420, 846, 118, 50] },
          { at: c("l2", /sixty/), r: [1005, 846, 118, 50] },
          { at: C + 4, r: [1003, 420, 112, 48], color: K.red },
          { at: tf, r: [1508, 746, 98, 40], color: K.green },
        ]}>
        <Pop f={f} at={e("l2", -0.2)} ox={300} oy={940}><Caption x={26} y={900} rot={-1.5} size={30} bg="#fff">No reaction? It says that too.</Caption></Pop>
      </Footage>
      <Stamp f={f} at={e("l2", -0.6)} x={1150} y={790} text="MEMES FOLLOWED" color="#13A35E" size={62} rot={-8} />
      <Talk f={f} fa={fa} x={side.talk} bg="#D9CCFF" dot="#B7A5F2" id="tLag" job={0} dex={f < c("l2") ? "doubt" : f < tf ? "neutral" : "happy"} oddy={f < c("l2") ? "smug" : "calm"} look={0.7} />
      <Say fa={fa} id="l1" {...dexTail(side.talk)} size={38} />
      <Say fa={fa} id="l2" {...oddyTail(side.talk)} size={31} />
    </AbsoluteFill>
  );
};

// ---------- 5. Receipts, then reverse mode: a graded call and why it pumped ----------
const Receipt: React.FC = () => {
  const { f, fa, c } = useScene("receipt");
  const side = SIDE.right;
  const R = c("r2", undefined, -0.8), T = R + 36, th = c("r2", /hundred/), C = c("r2", /Misses/, -0.15);
  const W = c("r3", undefined, -0.1), W2 = c("w2", undefined, -0.7), C2 = c("w2", /ninety/, -0.15);
  return (
    <AbsoluteFill>
      <Paper />
      <Footage f={f} x={side.foot} y={40} w={1250} h={1000}
        shots={[
          { at: 0, src: "receipt", from: 0.2, crop: WIDE },
          { at: R, src: "receipt", from: 31.7, skip: true, crop: WIDE },
          { at: T, src: "receipt", from: 48.0, hold: true, crop: [[0, 395, 115, 1210], [th - T - 8, 395, 115, 1210], [th - T + 10, 400, 440, 720]] },
          { at: C, src: "receipt", from: 50.2, hold: true, crop: WIDE },
          { at: W, src: "why", from: 0.6, hold: true, crop: [[0, 395, 115, 1210], [10, 395, 115, 1210], [30, 700, 140, 950]] },
          { at: W2, src: "why", from: 17.0, skip: true, crop: WIDE },
          { at: C2, src: "why", from: 33.0, hold: true, crop: WIDE },
        ]}
        marks={[
          { at: c("r2", /October/), r: [1514, 498, 64, 34], color: K.green },
          { at: th, r: [428, 610, 180, 56], color: K.green },
          { at: C + 6, r: [422, 444, 150, 46], color: K.green },
          { at: C + 16, r: [1005, 444, 136, 46], color: K.red },
          { at: C2 + 4, r: [490, 390, 156, 34], color: K.green },
          { at: c("w2", /nineteen/), box: true, r: [420, 443, 1180, 66] },
        ]}
        zooms={[{ at: C2 + 12, r: [485, 336, 365, 88], x: 300, y: 590, s: 2, label: "What's driving it" }]}>
        <Pop f={f} at={C + 4} ox={400} oy={940}>{f < W && <Caption x={26} y={900} rot={-1.5} size={30}>Hit, miss or flat: every call gets graded</Caption>}</Pop>
      </Footage>
      <Stamp f={f} at={th + 4} to={W} x={920} y={110} text="HIT!" color="#13A35E" size={110} rot={10} />
      <Sparkles f={f} at={th + 6} x={1040} y={180} />
      <Talk f={f} fa={fa} x={side.talk} bg="#C2F5DA" dot="#93E2B9" id="tReceipt" job={0} dex={f < th ? "doubt" : f < c("w2") ? "shock" : "calm"} oddy={f < th ? "calm" : "smug"} look={-0.7} />
      <Say fa={fa} id="r1" {...dexTail(side.talk)} size={36} />
      <Say fa={fa} id="r2" {...oddyTail(side.talk)} size={31} />
      <Say fa={fa} id="r3" {...dexTail(side.talk)} size={38} />
      <Say fa={fa} id="w2" {...oddyTail(side.talk)} size={31} />
    </AbsoluteFill>
  );
};

// ---------- 6. Job 2: the OG, not the copycats ----------
const Swarm: React.FC = () => {
  const { f, fa, c } = useScene("swarm");
  const side = SIDE.left;
  const R = c("s2", undefined, -1.2), T = R + 48;
  const s2 = c("s2"), og = Math.max(c("s2", /O\.?G/), T + 10), C = c("s2", /skip/, -0.15);
  const coins = [[70, 330], [330, 250], [200, 180], [420, 470], [30, 560], [250, 420]];
  return (
    <AbsoluteFill>
      <Paper />
      <Footage f={f} x={side.foot} y={40} w={1250} h={1000}
        shots={[
          { at: 0, src: "swarm", from: 21.2, hold: true, crop: WIDE },
          { at: R, src: "swarm", from: 22.0, crop: WIDE },
          { at: T, src: "swarm", from: 23.6, hold: true, crop: [[0, 395, 115, 1210], [8, 395, 115, 1210], [26, 395, 282, 1000]] },
          { at: C, src: "swarm", from: 36.0, hold: true, crop: WIDE },
        ]}
        marks={[
          { at: T + 6, r: [1192, 832, 56, 46] },
          { at: og, r: [422, 832, 118, 46], color: K.green },
          { at: Math.max(c("s2", /eleven/), T + 16), r: [802, 832, 56, 46], color: K.red },
          { at: C + 4, r: [1520, 468, 70, 32], color: K.red },
          { at: C + 12, box: true, r: [470, 714, 1110, 118], color: K.red },
        ]} />
      <Stamp f={f} at={C + 10} x={1080} y={150} text="COPYCAT: SKIPPED" size={60} rot={-7} />
      <Talk f={f} fa={fa} x={side.talk} bg="#FFF1A8" dot="#F2D96A" id="tSwarm" job={1} dex={f < s2 ? "shock" : "calm"} oddy={f < s2 ? "alert" : "smug"} look={-0.4} sweat={f < s2 ? 0.8 : 0}>
        {coins.map(([cx, cy], i) => {
          const at = c("s1", undefined, 0.1 + i * 0.12);
          if (f < at) return null;
          const k = sp(f, at, 9, 200), crown = i === 2 && f >= og;
          return <Coin key={i} size={92} label="$GTA6" font={LETTER} color={crown ? K.yellow : "#D8C27A"} crown={crown} stamp={f >= og && !crown ? "COPYCAT" : undefined}
            style={{ position: "absolute", left: cx, top: cy + bob(fa + i * 9, 6, 18), transform: `scale(${k})` }} />;
        })}
      </Talk>
      <Say fa={fa} id="s1" {...dexTail(side.talk)} y={40} size={36} />
      <Say fa={fa} id="s2" {...oddyTail(side.talk)} y={40} />
    </AbsoluteFill>
  );
};

// ---------- 7. Job 3, the seatbelt: famous isn't safe ----------
const Seatbelt: React.FC = () => {
  const { f, fa, c } = useScene("seatbelt");
  const side = SIDE.right;
  const B = c("b2", undefined, -1.6), T = B + 57, red = c("b2"), C = c("b2", /seventy/, -0.2), zt = Math.max(8, red - T);
  return (
    <AbsoluteFill>
      <Paper />
      <Footage f={f} x={side.foot} y={40} w={1250} h={1000}
        shots={[
          { at: 0, src: "seatbelt", from: 41.4, hold: true, crop: [[0, 740, 394, 860]] },
          { at: B, src: "seatbelt", from: 55.3, skip: true, crop: WIDE },
          { at: T, src: "seatbelt", from: 57.2, hold: true, crop: [[0, 395, 115, 1210], [zt, 395, 115, 1210], [zt + 14, 395, 300, 780]] },
          { at: C, src: "seatbelt", from: 66.2, hold: true, crop: WIDE },
        ]}
        marks={[
          { at: T + 4, r: [566, 470, 148, 30], color: K.red },
          { at: c("b2", /seventy/), box: true, r: [410, 376, 1180, 22], color: K.red },
          { at: c("b2", /liquidity/), box: true, r: [410, 262, 1180, 22], color: K.red },
        ]}
        zooms={[
          { at: c("b2", /seventy/, 0.2), r: [1530, 372, 78, 30], x: 640, y: 560, s: 3.2, label: "One wallet", rot: 2 },
          { at: c("b2", /liquidity/, 0.2), r: [1562, 258, 46, 30], x: 250, y: 560, s: 3.2, label: "LP locked", rot: -3 },
        ]}>
        <Pop f={f} at={c("b2", /Famous/)} ox={300} oy={940}><Caption x={26} y={900} rot={-1.5} size={34}>Famous ≠ safe</Caption></Pop>
      </Footage>
      <Stamp f={f} at={red + 2} to={C} x={940} y={100} text="RED!" size={120} rot={-10} />
      <Talk f={f} fa={fa} x={side.talk} bg="#FFC2B8" dot="#F29A8C" id="tSeat" job={2} dex={f < red ? "smug" : "shock"} oddy={f < red ? "calm" : "alert"} look={-0.7} sweat={f < red ? 0 : 1} />
      <Say fa={fa} id="b1" {...dexTail(side.talk)} size={34} />
      <Say fa={fa} id="b2" {...oddyTail(side.talk)} size={31} />
      <Say fa={fa} id="b3" {...dexTail(side.talk)} size={44} />
    </AbsoluteFill>
  );
};

// ---------- 8. Job 4: the swap. Dex buys a little WIF; PayBox signs ----------
const Buy: React.FC = () => {
  const { f, fa, c, e } = useScene("buy");
  const side = SIDE.left;
  const a2 = c("a2"), D = e("a2", 0.1), click = D + 18, S2 = D + 27, S3 = S2 + 38, ok = S3 + 8;
  return (
    <AbsoluteFill>
      <Paper />
      <Footage f={f} x={side.foot} y={40} w={1250} h={1000}
        shots={[
          { at: 0, src: "buy", from: 20.0, hold: true, crop: [[0, 700, 190, 960], [a2, 700, 190, 960], [a2 + 20, 395, 115, 1210]] },
          { at: D, src: "buy", from: 30.5, crop: [[0, 395, 150, 1210]] },
          { at: S2, src: "buy", from: 31.4, rate: 4, skip: "Submitting… (4× speed)", crop: [[0, 395, 150, 1210]] },
          { at: S3, src: "buy", from: 36.4, crop: [[0, 395, 150, 1210]] },
        ]}
        marks={[
          { at: c("a1", /weef/i, 0.1), r: [938, 304, 52, 28] },
          { at: c("a2", /approve/), box: true, r: [675, 855, 653, 52] },
          { at: ok + 2, box: true, r: [675, 545, 653, 52], color: K.green },
        ]}>
        <Pop f={f} at={c("a2", /PayBox/)} ox={300} oy={60}>{f < D && <Caption x={26} y={20} rot={-1.5} size={30}>You approve. PayBox signs. Oddshot never holds keys.</Caption>}</Pop>
      </Footage>
      <Bang f={f} at={click} to={click + 30} x={1100} y={420} text="CLICK!" size={90} rot={-6} />
      <Stamp f={f} at={ok} x={900} y={250} text="CONFIRMED!" color="#13A35E" size={100} rot={-8} />
      <Sparkles f={f} at={ok + 2} x={1250} y={330} n={16} />
      <Talk f={f} fa={fa} x={side.talk} bg="#FFD9A8" dot="#F2B970" id="tBuy" job={3} dex={f < a2 ? "calm" : f < ok ? "neutral" : "hype"} oddy={f < ok ? "calm" : "happy"} look={0.7} />
      <Say fa={fa} id="a1" {...dexTail(side.talk)} size={36} />
      <Say fa={fa} id="a2" {...oddyTail(side.talk)} size={31} />
      <Say fa={fa} id="a3" {...dexTail(side.talk)} size={46} />
    </AbsoluteFill>
  );
};

// ---------- 9. Bags and the exit ----------
const Exit: React.FC = () => {
  const { f, fa, c, e } = useScene("exit");
  const side = SIDE.right;
  const R = e("e1", 0.1), T = R + 36, C = c("e2", undefined, -0.15), D = e("e2", 0.05), E = D + 45;
  return (
    <AbsoluteFill>
      <Paper />
      <Footage f={f} x={side.foot} y={40} w={1250} h={1000}
        shots={[
          { at: 0, src: "bags", from: 0.2, crop: WIDE },
          { at: R, src: "bags", from: 17.4, skip: true, crop: WIDE },
          { at: T, src: "bags", from: 18.6, hold: true, crop: WIDE },
          { at: C, src: "sell", from: 0.6, hold: true, crop: WIDE },
          { at: D, src: "sell", from: 20.1, crop: [[0, 395, 250, 1080]] },
          { at: E, src: "sell", from: 27.5, hold: true, skip: "6 seconds later…", crop: [[0, 395, 250, 1080]] },
        ]}
        marks={[
          { at: T + 4, r: [552, 542, 76, 28] },
          { at: T + 8, r: [1488, 498, 92, 28] },
          { at: D + 20, r: [666, 606, 652, 30] },
          { at: E + 4, r: [674, 606, 652, 30], color: K.green },
        ]}
        zooms={[{ at: T + 12, r: [428, 458, 352, 116], x: 460, y: 620, s: 2, label: "In the bag", rot: 2 }]}>
        <Pop f={f} at={c("e3", /Exits/)} ox={300} oy={940}><Caption x={26} y={900} rot={-1.5} size={32}>Exits are never blocked</Caption></Pop>
      </Footage>
      <Stamp f={f} at={E + 3} x={860} y={120} text="SOLD!" color="#13A35E" size={110} rot={9} />
      <Talk f={f} fa={fa} x={side.talk} bg="#C8D0FF" dot="#9CA8F0" id="tExit" job={3} dex={f < E ? "calm" : "happy"} oddy={f < E ? "calm" : "happy"} look={-0.7} />
      <Say fa={fa} id="e1" {...dexTail(side.talk)} size={38} />
      <Say fa={fa} id="e2" {...dexTail(side.talk)} size={38} />
      <Say fa={fa} id="e3" {...oddyTail(side.talk)} size={34} />
    </AbsoluteFill>
  );
};

// ---------- 10. All four jobs, one prompt ----------
const STEPS: [string, RegExp | null][] = [["ODDS MOVERS", /Biggest/], ["BEST STORY", /best/], ["THE OG", /OG/], ["SEATBELT", /seatbelt/], ["SWAP", /swap/]];
const Loop: React.FC = () => {
  const { f, fa, c, e } = useScene("loop");
  const B = c("p2", undefined, -1.0);
  const c1 = c("p2", /Biggest/, -0.1), c2 = c("p2", /OG/, -0.1), c3 = c("p2", /seatbelt/, -0.1), c4 = c("p2", /swap/, -0.1);
  const D = c("p3", undefined, -0.7), E = D + 40, Fc = E + 36, G = c("p4", /flagged/, -0.15), Y = c("p4", /Yellow/, -0.1);
  const steps = STEPS.map(([label, re]) => ({ label, at: c("p2", re!) }));
  const approve = c("p3"), clicked = e("p3", 0.03); // the click lands once Dex has said the word, so nothing masks it
  const wide = WIDE, widget = [[0, 395, 250, 1080]];
  return (
    <AbsoluteFill>
      <Paper />
      <Footage f={f} x={40} y={40} w={1300} h={900}
        shots={[
          { at: 0, src: "loop", from: 0.4, crop: [[0, 395, 246, 1210], [124, 395, 246, 1210], [140, 395, 115, 1210]] },
          { at: B, src: "loop", from: 46.5, skip: "47 seconds later…", crop: wide },
          { at: c1, src: "loop", from: 54.2, hold: true, crop: wide },
          { at: c2, src: "loop", from: 60.0, hold: true, crop: wide },
          { at: c3, src: "loop", from: 66.6, hold: true, crop: [[0, 390, 115, 1240]] }, // a touch wider so the ring round YELLOW clears the edge
          { at: c4, src: "loop", from: 72.6, hold: true, crop: wide },
          { at: D, src: "loop", from: 73.6, crop: widget },
          { at: E, src: "loop", from: 74.95, rate: 4, skip: "Submitting… (4× speed)", crop: widget },
          { at: Fc, src: "loop", from: 79.95, crop: widget },
          { at: G, src: "loop", from: 70.6, hold: true, crop: [[0, 395, 160, 1210]] },
        ]}
        marks={[
          { at: c("p2", /best/), box: true, r: [410, 533, 1180, 22] },
          { at: c2 + 3, box: true, r: [410, 258, 1180, 26], color: K.green },
          { at: c("p2", /riding/), box: true, r: [418, 474, 1180, 67] },
          { at: c("p2", /yellow/, -0.1), r: [1484, 318, 112, 32] },
          { at: c("p2", /organic/, -0.1), box: true, r: [410, 426, 1180, 23], color: K.red },
          { at: c("p2", /liquidity/, -0.1), box: true, r: [410, 486, 1180, 22], color: K.red },
          { at: c4 + 4, box: true, r: [410, 615, 1180, 262] },
          { at: D + 4, r: [674, 700, 652, 30] },
          { at: c("p4", /risks/), box: true, r: [410, 707, 1180, 108] },
          { at: c("p4", /small/), box: true, r: [410, 302, 1180, 21], color: K.green },
        ]}>
        {f < B && <Pop f={f} at={14} ox={200} oy={60}><Caption x={26} y={20} rot={-2} size={36}>One prompt.</Caption></Pop>}
        {f < Y && <Pop f={f} at={G} ox={300} oy={60}><Caption x={26} y={20} rot={-1.5} size={30}>Risks flagged. Position kept small.</Caption></Pop>}
        <Pop f={f} at={Y} ox={300} oy={60}><Caption x={26} y={20} rot={-1.5} size={30}>Yellow: careful. Red: no buy.</Caption></Pop>
      </Footage>
      <Stamp f={f} at={Fc + 2} to={G} x={360} y={300} text="CONFIRMED!" color="#13A35E" size={104} rot={-8} />
      <Sparkles f={f} at={Fc + 4} x={680} y={390} n={16} />
      <Bang f={f} at={clicked} to={clicked + 30} x={780} y={560} text="CLICK!" size={90} rot={-6} />
      {/* the chain: each step ticks as Oddy names it */}
      <div style={{ position: "absolute", left: 50, top: 962, display: "flex", gap: 12 }}>
        {[...steps, { label: "YOU APPROVE", at: clicked }].map((s, i) => {
          if (f < B + 6) return null;
          const on = f >= s.at, k = on ? sp(f, s.at, 9, 240) : 0;
          return (
            <div key={i} style={{ background: on ? (i === 5 ? K.green : K.yellow) : "#FFFDF4", border: `5px solid ${INK}`, padding: "6px 14px", fontFamily: SFXF, fontSize: 32, letterSpacing: 2, color: INK,
              transform: `rotate(${(i % 2 ? 1.5 : -1.5)}deg) scale(${1 + 0.12 * Math.sin(k * Math.PI)})`, boxShadow: `5px 5px 0 ${INK}`, opacity: on ? 1 : 0.55 }}>
              {on ? "✓ " : `${i + 1}. `}{s.label}
            </div>
          );
        })}
      </div>
      <Pop f={f} at={0} ox={1625} oy={540}>
        <Frame x={1370} y={40} w={510} h={1000}>
          <Tone w={510} h={1000} bg="#B9F5D5" dot="#87E0B2" id="tLoop" />
          <OddyI fa={fa} mood={f < Fc ? "calm" : "happy"} x={300} y={420} size={170} look={{ x: -0.7, y: 0.2 }} />
          <DexI fa={fa} mood={f < approve ? "calm" : f < Fc ? "neutral" : "hype"} x={10} y={520} w={430} look={{ x: -0.8, y: -0.1 }} />
          <Pop f={f} at={6} ox={250} oy={60}><Caption x={20} y={18} rot={-2} size={28}>All 4 jobs. One prompt.</Caption></Pop>
        </Frame>
      </Pop>
      <Say fa={fa} id="p1" x={1385} y={180} w={480} tx={230} ty={470} size={32} />
      <Say fa={fa} id="p2" x={1385} y={150} w={480} tx={370} ty={300} size={31} />
      <Say fa={fa} id="p3" x={1450} y={330} w={340} tx={150} ty={320} size={44} />
      <Say fa={fa} id="p4" x={1385} y={150} w={480} tx={370} ty={300} size={31} />
    </AbsoluteFill>
  );
};

// ---------- 11. Sunrise: early, for once ----------
const Sunrise: React.FC = () => {
  const { f, fa, c } = useScene("sunrise");
  return (
    <AbsoluteFill>
      <Paper />
      <Pop f={f} at={0} ox={960} oy={540}>
        <Frame x={40} y={40} w={1840} h={1000}>
          <InkRoom w={1840} h={1000} dawn />
          <DexI fa={fa} mood={f < c("f2") ? "happy" : "smug"} x={520} y={190} w={560} look={{ x: 0.7, y: -0.4 }} />
          <InkBlanket w={1840} h={1000} y={860} />
          <OddyI fa={fa} mood="happy" x={1120} y={220} size={260} look={{ x: -0.8, y: 0.3 }} />
          <Pop f={f} at={4} ox={150} oy={80}><Caption x={28} y={28} rot={-1.5}>7:42 AM.</Caption></Pop>
          <Pop f={f} at={14} ox={300} oy={150}><Caption x={28} y={110} rot={-0.5} size={30} bg="#fff">Same Dex. Different ending.</Caption></Pop>
        </Frame>
      </Pop>
      <Say fa={fa} id="f1" x={1060} y={600} w={520} tx={-140} ty={-60} size={36} />
      <Say fa={fa} id="f2" x={1400} y={600} w={330} tx={-20} ty={-130} size={40} />
    </AbsoluteFill>
  );
};

// ---------- 12. Title card ----------
const End: React.FC = () => {
  const { f, fa, c } = useScene("end");
  const t1 = c("t1"), mem = c("t1", /memes/), yet = c("t1", /Yet/);
  const title = sp(f, 2, 9, 140);
  return (
    <AbsoluteFill>
      <Burst w={1920} h={1080} cx={960} cy={430} a="#FFD23F" b="#FFBE1A" n={36} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 120, textAlign: "center", transform: `scale(${0.5 + 0.5 * title}) rotate(${-4 * title}deg)` }}>
        <span style={{ fontFamily: SFXF, fontSize: 280, color: "#fff", letterSpacing: 14, WebkitTextStroke: `14px ${INK}`, paintOrder: "stroke fill", textShadow: `16px 16px 0 ${INK}` }}>ODDSHOT</span>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 500, display: "flex", justifyContent: "center", gap: 22 }}>
        {[["THE ODDS MOVED.", t1], ["THE MEMES HAVEN'T.", mem], ["YET.", yet]].map(([t, at], i) => f >= (at as number) && (
          <div key={i} style={{ transform: `rotate(${i === 2 ? 3 : -1.5}deg) scale(${0.7 + 0.3 * sp(f, at as number, 9, 220)})`, background: i === 2 ? K.green : "#fff", border: `6px solid ${INK}`,
            boxShadow: `8px 8px 0 ${INK}`, padding: "10px 24px", fontFamily: LETTER, fontWeight: 700, fontSize: 52, color: INK }}>{t as string}</div>
        ))}
      </div>
      <Pop f={f} at={yet + 10} ox={960} oy={720}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 660, display: "flex", justifyContent: "center" }}>
          <div style={{ background: INK, color: "#fff", padding: "14px 36px", fontFamily: SFXF, fontSize: 62, letterSpacing: 4, transform: "rotate(-1deg)" }}>
            LIVE ON <span style={{ color: K.yellow }}>PAYBOX</span> · @PAYBOX
          </div>
        </div>
      </Pop>
      <Pop f={f} at={yet + 18} ox={960} oy={850}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 800, textAlign: "center", fontFamily: LETTER, fontWeight: 700, fontSize: 34, color: INK }}>
          MoonPay × PayBox Hackathon finalist · built by Dappest Dev (@sentinel_dapper)
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 856, textAlign: "center", fontFamily: LETTER, fontWeight: 700, fontSize: 24, color: "#6B4E00" }}>
          Footage: real Oddshot runs in ChatGPT + PayBox, Oct 24, 2026. Memecoins are risky. Not financial advice.
        </div>
      </Pop>
      <DexI fa={fa} mood="happy" x={60} y={600} w={360} look={{ x: 0.8, y: -0.5 }} />
      <OddyI fa={fa} mood="happy" x={1600} y={650} size={240} look={{ x: -0.8, y: -0.3 }} />
    </AbsoluteFill>
  );
};

// ---------- Episode ----------
const SCENES: Record<string, React.FC> = { hook: Hook, cold: Cold, oddy: Arrive, install: Install, lag: Lag, receipt: Receipt, swarm: Swarm, seatbelt: Seatbelt, buy: Buy, exit: Exit, loop: Loop, sunrise: Sunrise, end: End };
const TURN = 9;
/** Each page slides in over the last one, like turning to the next page. */
const Turn: React.FC<{ first: boolean; children: React.ReactNode }> = ({ first, children }) => {
  const f = useCurrentFrame();
  const k = first ? 1 : interpolate(f, [0, TURN], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const zoom = 1 + Math.min(f, 400) * 0.00006;
  return (
    <AbsoluteFill style={{ transform: `translateX(${(1 - k) * 1920}px) rotate(${(1 - k) * 4}deg) scale(${zoom})`, transformOrigin: "0% 100%", boxShadow: k < 1 ? `-30px 0 60px #0006` : undefined }}>
      {children}
    </AbsoluteFill>
  );
};
export const Episode: React.FC = () => (
  <AbsoluteFill style={{ background: "#EFE6D2" }}>
    {TL.scenes.map((s, i) => {
      const C = SCENES[s.id]!;
      const from = F(s.start), next = TL.scenes[i + 1];
      const dur = (next ? F(next.start) + TURN : F(TL.total)) - from;
      return (
        <Sequence key={s.id} from={from} durationInFrames={dur} name={s.id}>
          <Turn first={i === 0}><C /></Turn>
        </Sequence>
      );
    })}
  </AbsoluteFill>
);
