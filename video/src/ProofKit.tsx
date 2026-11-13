import React from "react";
import { AbsoluteFill, Easing, Freeze, OffthreadVideo, Sequence, cancelRender, continueRender, delayRender, interpolate, spring, staticFile, useCurrentFrame } from "remotion";

// The motion look for the Oddshot explainers: a light canvas with slow colour fields, Inter, the real screens as dark cards and stickers for labels.
// Green / yellow / red mean good / careful / bad. The camera moves in source pixels, so highlights, zooms and blurs stay locked to the UI.
// Timing is written in 30 fps frames (FPS) to match the script cues; the video renders at 60 fps (RATE), so every move also lands between them.
export const FPS = 30;
export const RATE = 60;
/** The current frame in 30 fps units (fractional at 60 fps). */
export const useF = () => (useCurrentFrame() * FPS) / RATE;
/** A length in 30 fps frames, in frames at the render rate. */
export const toRate = (f: number) => Math.round((f * RATE) / FPS);

// Fonts ship in public/fonts so a flaky network can never swap the lettering mid-render (variable fonts: one file, every weight).
const localFont = (family: string, file: string, weight: string) => {
  if (typeof document === "undefined") return family;
  const handle = delayRender(`font ${family}`);
  new FontFace(family, `url(${staticFile(`fonts/${file}`)}) format("woff2")`, { weight }).load()
    .then((face) => { document.fonts.add(face); continueRender(handle); }, cancelRender);
  return family;
};
export const SANS = localFont("OS Sans", "inter-variable.woff2", "100 900");
export const MONO = localFont("OS Mono", "jetbrainsmono-latin.woff2", "300 700");
export const P = {
  bg: "#EDEDF0", ink: "#0F1012", muted: "#6B6F77", dim: "#A9ADB4", line: "#E3E4E8", card: "#FFFFFF",
  dark: "#111214", darkText: "#F4F5F7", darkMuted: "#9A9EA6", darkLine: "#26282D",
  // vivid: strokes on the dark screens and sticker fills
  green: "#30D158", yellow: "#FFD60A", red: "#FF453A", blue: "#0A84FF", violet: "#BF5AF2",
};
// the same hues, dark enough to read as text on the light canvas
const INK: Record<string, string> = { [P.green]: "#13963D", [P.yellow]: "#A66D00", [P.red]: "#DF3328", [P.blue]: "#0A67D6", [P.violet]: "#8A3DBF" };
export const ink = (c: string) => INK[c] ?? c;
/** Text colour on a fill of colour c. */
export const on = (c: string) => ([P.red, P.blue, P.violet, P.dark, P.ink].includes(c) ? "#FFFFFF" : P.ink);
export const SHADOW = "0 1px 2px rgba(15,16,18,0.10), 0 16px 36px -12px rgba(15,16,18,0.36), 0 48px 96px -32px rgba(15,16,18,0.30)";
export const STICK = "0 1px 2px rgba(15,16,18,0.16), 0 8px 22px -6px rgba(15,16,18,0.32)";
/** A sticker: a pill of colour c with its own shadow, for labels that sit on top of things. */
export const sticker = (c: string, size: number): React.CSSProperties => ({
  background: c, color: on(c), fontFamily: SANS, fontWeight: 650, fontSize: size, letterSpacing: -0.2, lineHeight: 1.2,
  padding: `${Math.round(size * 0.2)}px ${Math.round(size * 0.55)}px`, borderRadius: 999, whiteSpace: "nowrap", boxShadow: STICK,
});

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const sp = (f: number, at: number, damping = 16, stiffness = 150) => spring({ frame: f - at, fps: FPS, config: { damping, stiffness } });
export const ease = (f: number, a: number, b: number, from = 0, to = 1) => interpolate(f, [a, b], [from, to], { ...clamp, easing: Easing.inOut(Easing.cubic) });
export const rise = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
const within = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

// ---------- Timeline types (proof/script.json → story/tts.py proof → story/timeline.py proof) ----------
export type Word = { w: string; t: number; d: number; disp: string };
export type Line = { id: string; who: string; scene: string; text: string; start: number; dur: number; words: Word[] };
export type TLT = { total: number; scenes: { id: string; start: number; end: number }[]; lines: Line[] };

// ---------- Backdrop: a light canvas with soft colour fields drifting slowly; tint leans it toward the scene's colour ----------
const FIELDS: [string, number, number, number][] = [
  ["#BCD3FF", 0.15, 0.32, 820], ["#FFE5A0", 0.84, 0.18, 760], ["#FFC6D1", 0.76, 0.9, 820], ["#C9EEC0", 0.22, 0.92, 760], ["#DACBFF", 0.5, 0.04, 700],
];
const PASTEL: Record<string, string> = { [P.green]: "#B9EEC6", [P.yellow]: "#FFE48C", [P.red]: "#FFB8B2", [P.blue]: "#B5D3FF", [P.violet]: "#E4C6F8" };
// stops that fall off like a blur, so no field ever shows an edge
const soft = (c: string) => `${c}a2 0%, ${c}76 22%, ${c}3e 44%, ${c}13 62%, ${c}00 76%`;
export const Backdrop: React.FC<{ tint?: string }> = ({ tint }) => {
  const f = useF();
  const g = FIELDS.map(([c, x, y, r], i) =>
    `radial-gradient(${r}px circle at ${x * 1920 + Math.sin(f / (150 + 20 * i) + i) * 110}px ${y * 1080 + Math.cos(f / (180 + 17 * i) + 2 * i) * 80}px, ${soft(c)})`);
  if (tint) g.unshift(`radial-gradient(880px circle at ${1460 + Math.sin(f / 210) * 120}px ${200 + Math.cos(f / 240) * 70}px, ${soft(PASTEL[tint] ?? tint)})`);
  return <AbsoluteFill style={{ background: `${g.join(", ")}, ${P.bg}` }} />;
};

/** A white card (or a dark one) with the soft shadow; stack shows a second card peeking out underneath. */
export const Card: React.FC<{ dark?: boolean; radius?: number; stack?: boolean; style?: React.CSSProperties; inner?: React.CSSProperties; children?: React.ReactNode }> =
  ({ dark, radius = 28, stack = true, style, inner, children }) => (
    <div style={{ position: "absolute", ...style }}>
      {stack && <div style={{ position: "absolute", left: 22, right: 22, top: 14, bottom: -14, borderRadius: radius, background: dark ? "rgba(17,18,20,0.22)" : "rgba(17,18,20,0.07)" }} />}
      <div style={{ position: "relative", height: "100%", boxSizing: "border-box", borderRadius: radius, background: dark ? P.dark : P.card, boxShadow: SHADOW, ...inner }}>{children}</div>
    </div>
  );

// ---------- Real footage panels ----------
// A shot plays (or holds) one source from `from` seconds; crop keyframes are [shot frame, x, y, width] in source pixels.
/** bg: the colour at the shot's edges (PayBox purple, Claude grey), so the softened top and bottom fade into the screen's own colour. */
export type Shot = { at: number; src: string; from: number; rate?: number; hold?: boolean; crop: number[][]; note?: string; bg?: string };
/** A highlight drawn round source rect r ([x, y, w, h]); its label sits above it, below it, or at lab (panel px from the box's corner). */
export type Box = { at: number; to?: number; r: number[]; color?: string; label?: string; below?: boolean; lab?: [number, number] };
/** A magnifier: source rect r blown up s times into a card at panel position (x, y). */
export type Zoom = { at: number; to?: number; r: number[]; x: number; y: number; s?: number; label?: string; color?: string; anchor?: [number, number] };
/** Blur source rect r while the source time is within [t0, t1] seconds (personal info); with fill, paint it over instead (UI clutter);
 *  with from, show the same pixels from source second `from` instead (a pointer that later moved away). */
export type Blur = { src: string; t0: number; t1: number; r: number[]; fill?: string; from?: number };
export const SRC: Record<string, { w: number; h: number }> = { usage: { w: 1920, h: 1080 }, moonpay: { w: 880, h: 1908 } };

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
/** Source seconds on screen at panel frame f. */
export const srcTime = (s: Shot, f: number) => (s.hold ? s.from : s.from + ((f - s.at) / FPS) * (s.rate ?? 1));

// lines that a crop cuts through at the top or bottom of a panel dissolve instead of ending in a sliced row of glyphs
const SOFT_EDGES = "linear-gradient(to bottom, transparent, #000 20px, #000 calc(100% - 20px), transparent)";
/** tag: the "Real run" sticker, below the panel (or on its top edge, tagAt "top"); fade: soften the top and bottom edges of the footage into bg. */
export const Footage: React.FC<{ f: number; x: number; y: number; w: number; h: number; shots: Shot[]; boxes?: Box[]; zooms?: Zoom[]; blurs?: Blur[];
  enter?: number; radius?: number; tag?: string; tagAt?: "below" | "top"; fade?: boolean; bg?: string; edge?: boolean; children?: React.ReactNode }> =
  ({ f, x, y, w, h, shots, boxes = [], zooms = [], blurs = [], enter = 0, radius = 28, tag, tagAt = "below", fade = true, bg = "#0A0A0A", edge, children }) => {
  const i = shotIndex(shots, f), s = shots[i]!;
  const { w: SW, h: SH } = SRC[s.src]!;
  const [cx0, cy0, cw] = cropAt(s, f - s.at) as [number, number, number];
  const sc = w / cw, ch = h / sc;
  const cx = within(cx0, 0, SW - cw), cy = within(cy0, 0, Math.max(0, SH - ch));
  const nextAt = shots[i + 1]?.at ?? 100000;
  const film = (k: number, ox: number, oy: number, filter?: string, at?: number) => {
    const v = <OffthreadVideo src={staticFile(`cuts/${s.src}.mp4`)} trimBefore={Math.round((at ?? s.from) * RATE)} playbackRate={s.rate ?? 1} muted
      style={{ position: "absolute", left: -ox * k, top: -oy * k, width: SW * k, height: SH * k, maxWidth: "none", filter }} />;
    return <Sequence from={toRate(s.at)} durationInFrames={Math.max(1, toRate(nextAt - s.at))} layout="none">{s.hold || at !== undefined ? <Freeze frame={0}>{v}</Freeze> : v}</Sequence>;
  };
  const mine = <T extends { at: number; to?: number }>(xs: T[]) => xs.filter((m) => f >= m.at && f < (m.to ?? 1e9) && shotIndex(shots, m.at) === i);
  const st = srcTime(s, f);
  // the panel rises in and comes into focus
  const k = sp(f, enter, 18, 130), haze = Math.max(0, 1 - (f - enter) / 9) * 9;
  const toPanel = (r: number[]) => [(r[0]! - cx) * sc, (r[1]! - cy) * sc, r[2]! * sc, r[3]! * sc] as const;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, transform: `translateY(${(1 - k) * 40}px) scale(${0.965 + 0.035 * k})`, opacity: Math.min(1, (f - enter + 1) / 6),
      filter: haze > 0.05 ? `blur(${haze}px)` : undefined }}>
      <div style={{ position: "absolute", left: 24, right: 24, top: 16, bottom: -16, borderRadius: radius, background: "rgba(17,18,20,0.20)" }} />
      <div style={{ position: "absolute", inset: 0, borderRadius: radius, overflow: "hidden", background: s.bg ?? bg, boxShadow: SHADOW }}>
        <div style={{ position: "absolute", inset: 0, ...(fade ? { WebkitMaskImage: SOFT_EDGES, maskImage: SOFT_EDGES } : {}) }}>
          <React.Fragment key={i}>{film(sc, cx, cy)}</React.Fragment>
          {blurs.filter((b) => b.src === s.src && st >= b.t0 && st <= b.t1).map((b, j) => {
            const [bx, by, bw, bh] = toPanel(b.r);
            if (b.fill) return <div key={`b${j}`} style={{ position: "absolute", left: bx, top: by, width: bw, height: bh, background: b.fill }} />;
            if (b.from !== undefined) return (
              <div key={`b${j}`} style={{ position: "absolute", left: bx, top: by, width: bw, height: bh, overflow: "hidden" }}>{film(sc, b.r[0]!, b.r[1]!, undefined, b.from)}</div>
            );
            return (
              <div key={`b${j}`} style={{ position: "absolute", left: bx, top: by, width: bw, height: bh, overflow: "hidden", borderRadius: 8 }}>
                <div style={{ position: "absolute", left: 0, top: 0, width: bw, height: bh, transform: "scale(1.15)" }}>{film(sc, b.r[0]!, b.r[1]!, "blur(16px)")}</div>
                <div style={{ position: "absolute", inset: 0, background: "#151618cc" }} />
              </div>
            );
          })}
        </div>
        <svg width={w} height={h} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          {mine(boxes).map((m, j) => {
            const p = rise(f, m.at, m.at + 10);
            const [px, py, pw, ph] = toPanel(m.r);
            const col = m.color ?? P.yellow;
            // a crisp stroke on a faint dark keyline, so it reads on light and dark parts of a screen alike
            const rect = (stroke: string, sw: number, op: number) => (
              <rect x={px - 7} y={py - 6} width={pw + 14} height={ph + 12} rx={11} fill="none" stroke={stroke} strokeWidth={sw} opacity={op}
                pathLength={1} strokeDasharray="1" strokeDashoffset={1 - p} />
            );
            return <g key={j}>{rect("#000", 8, 0.4)}{rect(col, 4, 1)}<rect x={px - 7} y={py - 6} width={pw + 14} height={ph + 12} rx={11} fill={col} opacity={0.1 * p} /></g>;
          })}
        </svg>
        {mine(boxes).filter((m) => m.label).map((m, j) => {
          const [px, py, , ph] = toPanel(m.r);
          const p = sp(f, m.at + 6, 14, 200);
          const col = m.color ?? P.yellow;
          const [lx, ly] = m.lab ?? (m.below ? [-7, ph + 16] : [-7, -60]);
          const tilt = boxes.indexOf(m) % 2 ? 1.5 : -1.5;
          return (
            <div key={`l${j}`} style={{ position: "absolute", left: px + lx, top: py + ly, opacity: Math.min(1, p * 1.6), transformOrigin: "30% 50%",
              transform: `translateY(${(1 - p) * (m.below ? -10 : 10)}px) rotate(${tilt * (1 + (1 - p) * 2)}deg) scale(${0.85 + 0.15 * p})`, ...sticker(col, 30) }}>{m.label}</div>
          );
        })}
        {mine(zooms).map((z, j) => {
          const zs = z.s ?? 2.2, pad = 10, [mx, my, mw, mh] = z.r as [number, number, number, number];
          const lw = (mw + 2 * pad) * zs, lh = (mh + 2 * pad) * zs, p = sp(f, z.at, 15, 170);
          const [px, py, pw, ph] = toPanel(z.r);
          // the leader starts at anchor (source px) when given, else at the rect's centre
          const ax = z.anchor ? (z.anchor[0] - cx) * sc : px + pw / 2, ay = z.anchor ? (z.anchor[1] - cy) * sc : py + ph / 2, bx = z.x + lw / 2, by = z.y + lh / 2;
          const col = z.color ?? P.yellow;
          return (
            <React.Fragment key={`z${j}`}>
              <svg width={w} height={h} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
                <line x1={ax} y1={ay} x2={ax + (bx - ax) * p} y2={ay + (by - ay) * p} stroke={col} strokeWidth={3} strokeLinecap="round" />
                <circle cx={ax} cy={ay} r={7 * p} fill={col} />
              </svg>
              <div style={{ position: "absolute", left: z.x, top: z.y, width: lw, height: lh, transform: `scale(${0.6 + 0.4 * p})`, opacity: Math.min(1, (f - z.at + 1) / 4), transformOrigin: "50% 50%",
                borderRadius: 18, overflow: "hidden", background: "#0A0A0A", boxShadow: `0 0 0 4px ${col}, 0 26px 60px -12px rgba(0,0,0,0.6)` }}>
                {film(zs, mx - pad, my - pad)}
              </div>
              {z.label && f >= z.at + 5 && (
                <div style={{ position: "absolute", left: z.x, top: z.y - 56, opacity: rise(f, z.at + 5, z.at + 12), transform: "rotate(-1.5deg)", ...sticker(col, 26) }}>{z.label}</div>
              )}
            </React.Fragment>
          );
        })}
        {edge && <div style={{ position: "absolute", right: 0, top: 0, width: 90, height: h, background: "linear-gradient(to right, #0000, #000 85%)" }} />}
        {children}
      </div>
      {/* a time skip rides the panel's top edge, so it never sits on the screen it describes */}
      {s.note && f < s.at + 50 && (
        <div style={{ position: "absolute", left: 28, top: -20, opacity: rise(f, s.at, s.at + 6) * (1 - rise(f, s.at + 42, s.at + 50)), display: "flex", alignItems: "center", gap: 10,
          transform: "rotate(-1.2deg)", ...sticker(P.card, 22), padding: "7px 16px 7px 14px" }}>
          <svg width={20} height={14} viewBox="0 0 20 14"><path d="M0 0v14l9-7zM10 0v14l9-7z" fill={P.ink} /></svg>{s.note}
        </div>
      )}
      {tag && (
        <div style={{ position: "absolute", right: 30, top: tagAt === "top" ? -20 : h + 12, transform: "rotate(-1.2deg)", display: "flex", alignItems: "center", gap: 10, ...sticker(P.card, 21), padding: "8px 16px" }}>
          <span style={{ width: 9, height: 9, borderRadius: 5, background: P.red }} />{tag}
        </div>
      )}
    </div>
  );
};

// ---------- Type and labels ----------
/** Chapter tag at the top left: number, a thin progress rule and the title. */
export const Chapter: React.FC<{ f: number; n: string; title: string; color?: string; dur: number }> = ({ f, n, title, color = P.green, dur }) => {
  const k = sp(f, 2, 18, 160);
  return (
    <div style={{ position: "absolute", left: 64, top: 40, display: "flex", alignItems: "center", gap: 16, opacity: k, transform: `translateX(${(1 - k) * -24}px)` }}>
      <div style={{ fontFamily: SANS, fontWeight: 650, fontSize: 25, color: ink(color), fontVariantNumeric: "tabular-nums" }}>{n}</div>
      <div style={{ width: 40, height: 3, background: "rgba(15,16,18,0.13)", position: "relative", overflow: "hidden", borderRadius: 2 }}>
        <div style={{ position: "absolute", inset: 0, width: `${Math.min(100, (f / Math.max(1, dur)) * 100)}%`, background: ink(color) }} />
      </div>
      <div style={{ fontFamily: SANS, fontWeight: 650, fontSize: 26, color: P.ink, letterSpacing: -0.2 }}>{title}</div>
    </div>
  );
};
/** Small product mark at the top right. */
export const Bug: React.FC = () => (
  <div style={{ position: "absolute", right: 64, top: 42, fontFamily: SANS, fontWeight: 600, fontSize: 21, color: P.muted }}>
    Oddshot <span style={{ color: P.dim }}>×</span> PayBox
  </div>
);
/** A pill: solid in colour, or white with a colour dot; tilt turns it into a sticker. */
export const Pill: React.FC<{ color: string; children: React.ReactNode; size?: number; solid?: boolean; tilt?: number; style?: React.CSSProperties }> = ({ color, children, size = 26, solid, tilt, style }) => (
  <div style={{ display: "inline-flex", alignItems: "center", gap: size * 0.38, ...sticker(solid ? color : P.card, size), padding: `${size * 0.26}px ${size * 0.62}px`,
    transform: tilt ? `rotate(${tilt}deg)` : undefined, ...style }}>
    {!solid && <span style={{ width: size * 0.36, height: size * 0.36, borderRadius: 99, background: color, flexShrink: 0 }} />}{children}
  </div>
);
/** A number that counts from `from` to `to` between frames at and at + dur. */
export const Counter: React.FC<{ f: number; at: number; dur?: number; from: number; to: number; fmt: (v: number) => string; style?: React.CSSProperties }> = ({ f, at, dur = 24, from, to, fmt, style }) => {
  const v = interpolate(f, [at, at + dur], [from, to], { ...clamp, easing: Easing.out(Easing.cubic) });
  return <span style={{ fontVariantNumeric: "tabular-nums", ...style }}>{fmt(v)}</span>;
};
/** Fade, rise and come into focus at `at`; optional fade out at `to`. */
export const In: React.FC<{ f: number; at: number; to?: number; dy?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ f, at, to, dy = 26, children, style }) => {
  if (f < at) return null;
  const k = sp(f, at, 17, 170), o = to === undefined ? 1 : 1 - rise(f, to, to + 8);
  if (o <= 0) return null;
  const b = Math.max(0, 1 - (f - at) / 8) * 8;
  return <div style={{ position: "absolute", opacity: Math.min(1, (f - at + 1) / 5) * o, transform: `translateY(${(1 - k) * dy}px)`, filter: b > 0.05 ? `blur(${b}px)` : undefined, ...style }}>{children}</div>;
};
/** A line of type whose words come into focus one after another from frame at. */
export const BlurWords: React.FC<{ f: number; at: number; text: string; gap?: number }> = ({ f, at, text, gap = 3 }) => (
  <>
    {text.split(" ").map((w, i) => {
      const k = rise(f, at + i * gap, at + i * gap + 10);
      return (
        <React.Fragment key={i}>
          {i > 0 && " "}
          <span style={{ display: "inline-block", opacity: k, filter: k < 0.99 ? `blur(${(1 - k) * 14}px)` : undefined, transform: `translateY(${(1 - k) * 16}px)` }}>{w}</span>
        </React.Fragment>
      );
    })}
  </>
);

// ---------- Captions: the narration, a phrase at a time, each word coming into focus as it is said ----------
// Spoken numbers read faster as digits on a phone: each phrase collapses onto its first word (which lights when it is said).
const DIGITS: [string, string][] = [
  ["one point four point one", "1.4.1"], ["eleven-eleven", "11:11"], ["ninety-nine point eight percent", "99.8%"], ["four hundred seventy-eight million", "478 million"],
  ["forty thousand dollars", "$40,000"], ["seventeen hundred percent", "1,700%"], ["eighteen hundred percent", "1,800%"], ["thirty-one percent", "31%"], ["five point three million", "$5.3 million"],
  ["seventy-six", "76"], ["thirteen percent", "13%"], ["two hundred", "200"], ["six-dollar", "$6"], ["zero out of a hundred", "0 out of 100"], ["thirty minutes", "30 minutes"],
  ["forty minutes", "40 minutes"], ["fourteen", "14"], ["five dollars", "$5"], ["two-dollar", "$2"], ["two dollars", "$2"], ["a dollar fifty", "$1.50"], ["six hours", "6 hours"],
  ["ten holders", "10 holders"],
];
const bare = (s: string) => s.toLowerCase().replace(/[^a-z0-9\-]/g, "");
const withDigits = (ws: Word[]): Word[] => {
  const out = ws.map((w) => ({ ...w }));
  for (const [phrase, digits] of DIGITS) {
    const p = phrase.split(" ");
    for (let i = 0; i + p.length <= out.length; i++) {
      if (!p.every((x, j) => bare(out[i + j]!.disp) === x)) continue;
      const tail = out[i + p.length - 1]!.disp.match(/[.,:;?!]+$/)?.[0] ?? "";
      out[i]!.disp = digits + tail;
      for (let j = 1; j < p.length; j++) out[i + j]!.disp = "";
    }
  }
  return out;
};
type Chunk = { words: Word[]; a: number; b: number };
// a phrase never ends on one of these: it carries into the next phrase with its noun
const LEAN = new Set(["the", "a", "an", "of", "to", "and", "when", "your", "on", "in", "is", "was", "for", "at", "that", "with", "my", "it"]);
const chunksOf = (l: Line, max = 7): Chunk[] => {
  const ws = withDigits(l.words).filter((w) => w.disp);
  const out: Chunk[] = [];
  let cur: Word[] = [];
  ws.forEach((w, i) => {
    cur.push(w);
    const last = i === ws.length - 1, stop = /[.?!:]$/.test(w.disp), comma = /[,;—]$/.test(w.disp);
    // a phrase may run to 9 words rather than strand the sentence's last word or two on their own
    const nearEnd = ws.slice(i + 1, i + 3).some((x) => /[.?!]$/.test(x.disp));
    const full = cur.length >= max && !(nearEnd && cur.length < 9);
    if (last || stop || full || (comma && cur.length >= 4)) {
      const carry = full && !last && !stop && !comma && cur.length > 2 && LEAN.has(bare(w.disp)) ? cur.pop() : undefined;
      out.push({ words: cur, a: l.start + cur[0]!.t, b: l.start + cur[cur.length - 1]!.t + cur[cur.length - 1]!.d });
      cur = carry ? [carry] : [];
    }
  });
  // never leave a single word alone at the end of a line
  if (out.length > 1 && out[out.length - 1]!.words.length === 1 && out[out.length - 2]!.words.length < 9) {
    const z = out.pop()!, y = out[out.length - 1]!;
    out[out.length - 1] = { words: [...y.words, ...z.words], a: y.a, b: z.b };
  }
  return out;
};
/** Words that carry the story get color: verdicts, money, percentages, tickers. */
export const tint = (w: string): string | undefined => {
  const x = w.replace(/[^\w$%.+\-−:]/g, "").replace(/[.:,]+$/, "");
  // the loss, the zero score and the creator's take are bad news, not neutral numbers
  if (/^(RED|rug|rugged|gone|dump|dumped|zero|bots?|nothing)$/i.test(x) || /^[-−]\d/.test(x) || /^(99\.8%|0outof100|\$40000)$/.test(x)) return ink(P.red);
  if (/^(YELLOW|yellows|LATE|careful|warning|warnings|trim|flagged)$/i.test(x)) return ink(P.yellow);
  if (/^(GREEN|approve|approved|confirmed|safe|passes)$/i.test(x)) return ink(P.green);
  if (/^\$|%$|^\d/.test(x)) return ink(P.blue);
  return undefined;
};
export const Captions: React.FC<{ tl: TLT; fa: number; hide?: (t: number) => boolean }> = ({ tl, fa, hide }) => {
  const t = fa / FPS;
  if (hide?.(t)) return null;
  const l = tl.lines.find((x, i) => t >= x.start - 0.1 && t < Math.min(x.start + x.dur + 0.5, tl.lines[i + 1]?.start ?? 1e9) - 0.06);
  if (!l) return null;
  const cs = chunksOf(l);
  const k = cs.findIndex((c, i) => t >= c.a - 0.1 && t < (cs[i + 1]?.a ?? 1e9) - 0.1);
  const c = cs[Math.max(0, k)]!;
  // the line fades in once; a new phrase settles into place; each word sharpens from a soft ghost as it is said
  const pop = sp(fa, Math.round((l.start - 0.1) * FPS), 18, 220), nudge = sp(fa, Math.round((c.a - 0.1) * FPS), 18, 240);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 34, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <div style={{ maxWidth: 1600, opacity: Math.min(1, pop * 1.4), fontFamily: SANS, fontWeight: 650, fontSize: 48, lineHeight: 1.18, textAlign: "center", letterSpacing: -0.6 }}>
        {c.words.map((w, i) => {
          const said = (l.start + w.t) * FPS, k2 = rise(fa, said - 2, said + 4);
          return (
            <span key={i} style={{ color: tint(w.disp) ?? P.ink, display: "inline-block", marginRight: 13, opacity: (0.2 + 0.8 * k2) * Math.min(1, 0.3 + nudge),
              filter: k2 < 0.98 ? `blur(${(1 - k2) * 4}px)` : undefined, transform: `translateY(${(1 - nudge) * 10 + (1 - k2) * 2}px)` }}>{w.disp.replace(/'/g, "’")}</span>
          );
        })}
      </div>
    </div>
  );
};
