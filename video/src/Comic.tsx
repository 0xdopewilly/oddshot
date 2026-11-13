import React from "react";
import { AbsoluteFill, Img, cancelRender, continueRender, delayRender, random, staticFile } from "remotion";
import { Dex, Oddy, INK } from "./Cast";

// Fonts ship in public/fonts so a flaky network can never swap the lettering mid-render.
const localFont = (family: string, file: string, weight: string) => {
  if (typeof document === "undefined") return family;
  const handle = delayRender(`font ${family}`);
  new FontFace(family, `url(${staticFile(`fonts/${file}`)}) format("woff2")`, { weight }).load()
    .then((face) => { document.fonts.add(face); continueRender(handle); }, cancelRender);
  return family;
};
export const SFXF = localFont("Bangers", "bangers-latin.woff2", "400");
export const LETTER = localFont("Comic Neue", "comicneue-700-latin.woff2", "700");
export const PAPER = "#EFE6D2";
export const K = { yellow: "#FFE14D", green: "#2FE08E", red: "#F0413C", cyan: "#7FE3FF", night: "#202C66", nightD: "#151D4A", purple: "#4A3A7A" };

// ---------- Comic primitives ----------
export const Paper: React.FC = () => (
  <AbsoluteFill style={{ background: PAPER }}>
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
      <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="4" /><feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.27  0 0 0 0 0.16  0 0 0 0.55 0" /></filter>
      <rect width={1920} height={1080} filter="url(#grain)" opacity={0.35} />
    </svg>
  </AbsoluteFill>
);
export const Frame: React.FC<{ x: number; y: number; w: number; h: number; rot?: number; bg?: string; children?: React.ReactNode }> = ({ x, y, w, h, rot = 0, bg = "#fff", children }) => (
  <div style={{ position: "absolute", left: x, top: y, width: w, height: h, transform: `rotate(${rot}deg)`, background: bg, border: `7px solid ${INK}`, boxShadow: `10px 12px 0 ${INK}22`, overflow: "hidden", boxSizing: "border-box" }}>
    {children}
  </div>
);
export const Caption: React.FC<{ x: number; y: number; children: React.ReactNode; rot?: number; size?: number; bg?: string }> = ({ x, y, children, rot = -1, size = 34, bg = K.yellow }) => (
  <div style={{ position: "absolute", left: x, top: y, transform: `rotate(${rot}deg)`, background: bg, border: `5px solid ${INK}`, padding: "10px 18px", fontFamily: LETTER, fontWeight: 700, fontSize: size,
    letterSpacing: 1, color: INK, textTransform: "uppercase", boxShadow: `6px 6px 0 ${INK}`, lineHeight: 1.15 }}>{children}</div>
);
/** Speech bubble; the tail points from the bubble toward (tx, ty) relative to the bubble's top-left. */
export const Bubble: React.FC<{ x: number; y: number; w: number; tx: number; ty: number; size?: number; children: React.ReactNode }> = ({ x, y, w, tx, ty, size = 36, children }) => (
  <div style={{ position: "absolute", left: x, top: y, width: w }}>
    <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }} width={1} height={1}>
      <path d={`M${w * 0.42},40 L${tx},${ty} L${w * 0.58},40 Z`} fill="#fff" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
    </svg>
    <div style={{ position: "relative", background: "#fff", border: `5px solid ${INK}`, borderRadius: "50%", padding: "34px 40px", textAlign: "center", fontFamily: LETTER, fontWeight: 700, fontSize: size,
      color: INK, textTransform: "uppercase", lineHeight: 1.12 }}>{children}</div>
  </div>
);
export const SFX: React.FC<{ x: number; y: number; text: string; size?: number; rot?: number; color?: string }> = ({ x, y, text, size = 120, rot = -8, color = K.yellow }) => (
  <div style={{ position: "absolute", left: x, top: y, transform: `rotate(${rot}deg)`, fontFamily: SFXF, fontSize: size, color, letterSpacing: 4, WebkitTextStroke: `6px ${INK}`, paintOrder: "stroke fill",
    textShadow: `8px 8px 0 ${INK}` }}>{text}</div>
);
export const Burst: React.FC<{ w: number; h: number; cx: number; cy: number; a?: string; b?: string; n?: number }> = ({ w, h, cx, cy, a = "#FFD23F", b = "#FFB020", n = 28 }) => (
  <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
    <rect width={w} height={h} fill={a} />
    {Array.from({ length: n }, (_, i) => {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 0.5) / n) * Math.PI * 2, R = Math.max(w, h) * 1.2;
      return i % 2 ? null : <path key={i} d={`M${cx},${cy} L${cx + Math.cos(a0) * R},${cy + Math.sin(a0) * R} L${cx + Math.cos(a1) * R},${cy + Math.sin(a1) * R} Z`} fill={b} />;
    })}
  </svg>
);
const Halftone: React.FC<{ id: string; color?: string; r?: number; gap?: number }> = ({ id, color = INK, r = 2.4, gap = 10 }) => (
  <pattern id={id} width={gap} height={gap} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx={gap / 2} cy={gap / 2} r={r} fill={color} /></pattern>
);

// ---------- Inked night bedroom (panel-sized) ----------
export const InkRoom: React.FC<{ w: number; h: number; dawn?: boolean }> = ({ w, h, dawn = false }) => {
  const stars = Array.from({ length: 16 }, (_, i) => ({ x: 90 + random(`cs${i}`) * 320, y: 110 + random(`ct${i}`) * 150, r: 4 + random(`cr${i}`) * 5 }));
  return (
    <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
      <defs><Halftone id="htW" color={dawn ? "#8A5B8C" : K.nightD} r={3.2} gap={12} /><Halftone id="htB" color={INK} r={2.2} gap={10} />
        <linearGradient id="dawnSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FF9E6B" /><stop offset="1" stopColor="#FFE08A" /></linearGradient></defs>
      <rect width={w} height={h} fill={dawn ? "#A0699A" : K.night} />
      <path d={`M0,${h * 0.55} L${w},${h * 0.2} L${w},${h} L0,${h} Z`} fill="url(#htW)" opacity={0.9} />
      {dawn && <path d={`M70,230 L450,230 L${w * 0.75},${h} L-40,${h} Z`} fill="#FFE9A8" opacity={0.28} />}
      <g transform="translate(0 150)"><rect x={70} y={80} width={380} height={330} fill={dawn ? "url(#dawnSky)" : "#111845"} stroke={INK} strokeWidth={9} />
      {!dawn && stars.map((s, i) => <path key={i} d={`M${s.x},${s.y - s.r} L${s.x + s.r * 0.3},${s.y} L${s.x},${s.y + s.r} L${s.x - s.r * 0.3},${s.y} Z M${s.x - s.r},${s.y} L${s.x},${s.y - s.r * 0.3} L${s.x + s.r},${s.y} L${s.x},${s.y + s.r * 0.3} Z`} fill="#FFF6D6" />)}
      {dawn ? <circle cx={300} cy={300} r={70} fill={K.yellow} stroke={INK} strokeWidth={6} /> : <>
        <circle cx={360} cy={160} r={44} fill="#FFF3C4" stroke={INK} strokeWidth={6} />
        <circle cx={346} cy={150} r={8} fill="#E8D99A" /><circle cx={372} cy={176} r={6} fill="#E8D99A" /></>}
      {[[80, 300, 60], [140, 250, 50], [190, 320, 50], [240, 270, 55], [295, 330, 45], [340, 290, 60], [400, 310, 45]].map(([x, top, bw], i) => (
        <g key={i}><rect x={x} y={top} width={bw} height={410 - top} fill={dawn ? "#5A3A5E" : INK} />
          {!dawn && Array.from({ length: 4 }, (_, j) => random(`cw${i}${j}`) > 0.45 && <rect key={j} x={x! + 10 + (j % 2) * 20} y={top! + 14 + Math.floor(j / 2) * 26} width={9} height={12} fill={K.yellow} />)}</g>
      ))}
      <line x1={260} y1={80} x2={260} y2={410} stroke={INK} strokeWidth={8} /><line x1={70} y1={245} x2={450} y2={245} stroke={INK} strokeWidth={8} /></g>
      <rect x={470} y={330} width={620} height={700} rx={34} fill={dawn ? "#7B5FB0" : K.purple} stroke={INK} strokeWidth={8} />
      <rect x={470} y={330} width={620} height={700} rx={34} fill="url(#htB)" opacity={0.18} />
      <rect x={540} y={500} width={330} height={150} rx={70} fill="#ECE6FF" stroke={INK} strokeWidth={6} />
    </svg>
  );
};
export const InkBlanket: React.FC<{ w: number; h: number; y: number }> = ({ w, h, y }) => (
  <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
    <defs><Halftone id="htK" color={INK} r={2.3} gap={10} /></defs>
    <path d={`M-20,${h + 20} L-20,${y + 40} C${w * 0.25},${y - 30} ${w * 0.55},${y - 10} ${w * 0.75},${y + 20} C${w * 0.88},${y + 40} ${w},${y + 10} ${w + 20},${y + 20} L${w + 20},${h + 20} Z`} fill="#3550A8" stroke={INK} strokeWidth={8} />
    <path d={`M${w * 0.15},${y + 70} C${w * 0.3},${y + 50} ${w * 0.45},${y + 90} ${w * 0.6},${y + 70} M${w * 0.55},${y + 140} C${w * 0.7},${y + 120} ${w * 0.8},${y + 150} ${w * 0.95},${y + 130}`} stroke={INK} strokeWidth={5} fill="none" strokeLinecap="round" />
    <path d={`M${w * 0.6},${h} L${w * 0.75},${y + 30} C${w * 0.88},${y + 50} ${w},${y + 20} ${w + 20},${y + 30} L${w + 20},${h} Z`} fill="url(#htK)" opacity={0.25} />
  </svg>
);

// ---------- Look test: one comic page ----------
export const ComicLook: React.FC = () => (
  <AbsoluteFill>
    <Paper />
    {/* Panel 1: Dex at 3:07 AM */}
    <Frame x={40} y={36} w={1150} h={1008}>
      <InkRoom w={1150} h={1008} />
      <svg width={1150} height={1008} style={{ position: "absolute", inset: 0 }}>
        {[[-150, 0], [-120, -60], [120, -60], [150, 0], [-90, -105], [90, -105]].map(([dx, dy], i) => (
          <line key={i} x1={700 + dx! * 0.92} y1={330 + dy! * 0.92} x2={700 + dx! * 1.18} y2={330 + dy! * 1.18} stroke={INK} strokeWidth={7} strokeLinecap="round" />
        ))}
      </svg>
      <Dex width={540} mood="hype" look={{ x: 0.5, y: 0.8 }} phone glowAmt={0.55} ink style={{ position: "absolute", left: 430, top: 150 }} />
      <InkBlanket w={1150} h={1008} y={840} />
      <Caption x={28} y={28} rot={-1.5}>3:07 AM.</Caption>
      <Caption x={28} y={110} rot={-0.5} size={30} bg="#fff">Meet Dex. He's always late.</Caption>
      <Bubble x={640} y={40} w={470} tx={120} ty={250} size={33}>Six hundred percent, and it's <span style={{ color: K.red }}>still early?</span> I'm in!</Bubble>
    </Frame>
    {/* Panel 2: the phone */}
    <Frame x={1225} y={50} w={650} h={540} rot={2}>
      <Burst w={650} h={540} cx={330} cy={270} />
      <div style={{ position: "absolute", left: 175, top: 40, width: 300, height: 520, borderRadius: 40, background: "#14181F", border: `7px solid ${INK}`, padding: 18, boxSizing: "border-box" }}>
        <div style={{ fontFamily: LETTER, fontWeight: 700, fontSize: 22, color: "#9AA4B2" }}>@moonmath_</div>
        <div style={{ fontFamily: LETTER, fontWeight: 700, fontSize: 30, color: "#fff", lineHeight: 1.1, marginTop: 4 }}>$MOON +600%. STILL EARLY.</div>
        <svg width={250} height={170} style={{ marginTop: 18 }}><polyline points="5,160 60,150 100,135 140,110 175,70 205,30 240,8" fill="none" stroke={K.green} strokeWidth={8} strokeLinejoin="round" /></svg>
        <div style={{ marginTop: 14, height: 70, borderRadius: 18, background: K.green, border: `5px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SFXF, fontSize: 40, color: INK, letterSpacing: 2 }}>BUY $MOON</div>
      </div>
      <SFX x={400} y={320} text="TAP!" size={130} rot={-12} />
    </Frame>
    {/* Panel 3: the proof panel, real footage */}
    <Frame x={1215} y={630} w={670} h={410} rot={-1.5} bg="#0E1116">
      <div style={{ position: "absolute", left: 0, top: 0, width: 670, height: 410, overflow: "hidden" }}>
        <Img src={staticFile("look/claude-approve.png")} style={{ position: "absolute", width: 1000, left: -40, top: -560 }} />
      </div>
      <div style={{ position: "absolute", right: 24, top: 22, transform: "rotate(8deg)", border: `6px solid ${K.red}`, color: K.red, fontFamily: SFXF, fontSize: 46, letterSpacing: 3, padding: "2px 16px", background: "#ffffffd9" }}>REAL FOOTAGE</div>
    </Frame>
    <Oddy size={200} mood="smug" look={{ x: 0.8, y: -0.3 }} ink style={{ position: "absolute", left: 1105, top: 820 }} />
    <Caption x={1300} y={966} rot={1} size={26}>Meet Oddy. Oddshot's sharpshooter.</Caption>
  </AbsoluteFill>
);
