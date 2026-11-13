import React from "react";
import { AbsoluteFill, random } from "remotion";
import { C, DISPLAY, MONO, Bg } from "./Oddshot";

// ---------- Shared animation helpers ----------
export const blinkAt = (frame: number, seed = 0, period = 104) => {
  const v = (frame + Math.floor(random(`blink${seed}`) * period)) % period;
  return v < 7 ? Math.sin((v / 7) * Math.PI) : 0;
};
const uid = () => React.useId().replace(/[^a-zA-Z0-9]/g, "");

// ---------- Dex: the degen who's always late ----------
export type DexMood = "neutral" | "happy" | "hype" | "shock" | "sad" | "tired" | "smug" | "calm" | "doubt";
type Face = { brow: [number, number]; browY: [number, number]; lid: number; lidB: number; smile: number; open: number; width: number; pupil: number };
const FACES: Record<DexMood, Face> = {
  neutral: { brow: [0, 0], browY: [0, 0], lid: 0.14, lidB: 0, smile: 5, open: 0, width: 44, pupil: 11 },
  calm: { brow: [2, -2], browY: [0, 0], lid: 0.3, lidB: 0.1, smile: 12, open: 0, width: 48, pupil: 11 },
  happy: { brow: [-4, 4], browY: [-6, -6], lid: 0.04, lidB: 0.24, smile: 20, open: 0.22, width: 60, pupil: 11 },
  hype: { brow: [4, -4], browY: [-15, -15], lid: 0, lidB: 0, smile: 22, open: 0.6, width: 64, pupil: 12 },
  shock: { brow: [-4, 4], browY: [-21, -21], lid: 0, lidB: 0, smile: 0, open: 0.95, width: 30, pupil: 7 },
  sad: { brow: [-16, 16], browY: [-4, -4], lid: 0.32, lidB: 0, smile: -14, open: 0, width: 42, pupil: 10 },
  tired: { brow: [-6, 6], browY: [3, 3], lid: 0.5, lidB: 0.1, smile: -3, open: 0, width: 36, pupil: 10 },
  smug: { brow: [8, -6], browY: [-12, 2], lid: 0.34, lidB: 0.12, smile: 12, open: 0, width: 50, pupil: 10 },
  doubt: { brow: [-12, -8], browY: [-12, 3], lid: 0.2, lidB: 0, smile: -5, open: 0, width: 38, pupil: 10 },
};
export const SKIN = "#7A4A2E";
export const INK = "#15110E";
const SKIN_D = "#5A321D", SKIN_L = "#93603F", HAIR = "#140F0D", HOOD = "#4C52E0", HOOD_D = "#3238A6", HOOD_L = "#6D73FF", LINE = "#2A160C";

const mouth = (w: number, smile: number, open: number) => {
  const cx = 200, y = 270, l = cx - w / 2, r = cx + w / 2;
  const cy = y - smile * 0.35, up = y + smile * 0.3, lo = up + 5 + open * 64 + Math.max(smile, 0) * 0.8;
  return { d: `M${l},${cy} Q${cx},${up} ${r},${cy} Q${cx},${lo} ${l},${cy} Z`, top: (cy + up) / 2, bottom: (cy + lo) / 2 };
};

export const Dex: React.FC<{
  width: number; mood?: DexMood; look?: { x: number; y: number }; blink?: number; talk?: number; tilt?: number;
  phone?: boolean; glow?: string; glowAmt?: number; sweat?: number; ink?: boolean; style?: React.CSSProperties;
}> = ({ width, mood = "neutral", look = { x: 0, y: 0 }, blink = 0, talk = 0, tilt = 0, phone = false, glow = "#9FD8FF", glowAmt = 0, sweat = 0, ink = false, style }) => {
  const id = uid();
  // Ink mode: comic outlines and hard cel shading instead of soft gradients.
  const ik = ink ? { stroke: INK, strokeWidth: 5, strokeLinejoin: "round" as const } : {};
  const f = FACES[mood];
  const lid = Math.max(f.lid, blink), lidB = blink > 0.5 ? 0 : f.lidB;
  const m = mouth(f.width - talk * 8, f.smile, Math.min(1, f.open + talk * 0.62));
  const gap = m.bottom - m.top;
  const px = Math.max(-1, Math.min(1, look.x)) * 9, py = Math.max(-1, Math.min(1, look.y)) * 9;
  const eye = (cx: number, side: 0 | 1) => {
    const top = 175, bot = 229, e = top + 54 * lid, b = bot - 54 * lidB;
    return (
      <g key={cx}>
        <clipPath id={`${id}e${side}`}><ellipse cx={cx} cy={202} rx={23} ry={27} /></clipPath>
        <ellipse cx={cx} cy={202} rx={23} ry={27} fill="#FBF7F2" />
        <g clipPath={`url(#${id}e${side})`}>
          <circle cx={cx + px} cy={204 + py} r={f.pupil} fill="#16110F" />
          <circle cx={cx + px - f.pupil * 0.35} cy={200 + py - f.pupil * 0.35} r={f.pupil * 0.33} fill="#fff" />
          {lid > 0.02 && <path d={`M${cx - 30},${top - 6} L${cx + 30},${top - 6} L${cx + 30},${e} Q${cx},${e + 7} ${cx - 30},${e} Z`} fill={SKIN_L} />}
          {lid > 0.02 && <path d={`M${cx - 30},${e} Q${cx},${e + 7} ${cx + 30},${e}`} stroke={LINE} strokeWidth={4} fill="none" />}
          {lidB > 0.02 && <path d={`M${cx - 30},${bot + 6} L${cx + 30},${bot + 6} L${cx + 30},${b} Q${cx},${b - 7} ${cx - 30},${b} Z`} fill={SKIN_L} />}
        </g>
        <ellipse cx={cx} cy={202} rx={23} ry={27} fill="none" stroke={LINE} strokeWidth={3} />
      </g>
    );
  };
  const brow = (cx: number, i: 0 | 1) => (
    <path key={cx} d={`M${cx - 22},${160} Q${cx},${150} ${cx + 22},${160}`} stroke={HAIR} strokeWidth={10} strokeLinecap="round" fill="none"
      transform={`translate(0 ${f.browY[i]}) rotate(${f.brow[i]} ${cx} 156)`} />
  );
  const curls = Array.from({ length: 13 }, (_, i) => {
    const a = Math.PI * (1.06 + (i / 12) * 0.88);
    return <circle key={i} cx={200 + Math.cos(a) * 90} cy={156 + Math.sin(a) * 66} r={13 + (i % 3) * 1.5} fill={HAIR} />;
  });
  return (
    <svg width={width} height={width * 1.3} viewBox="0 0 400 520" style={{ overflow: "hidden", ...style }}>
      <defs>
        <radialGradient id={`${id}g`} cx="0.55" cy="1.05" r="0.9">
          <stop offset="0" stopColor={glow} stopOpacity={0.75 * glowAmt} />
          <stop offset="1" stopColor={glow} stopOpacity={0} />
        </radialGradient>
        <linearGradient id={`${id}h`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={HOOD_L} /><stop offset="1" stopColor={HOOD} />
        </linearGradient>
        <pattern id={`${id}ht`} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="4.5" cy="4.5" r="2.2" fill={INK} /></pattern>
        <clipPath id={`${id}head`}><ellipse cx={200} cy={205} rx={96} ry={108} /></clipPath>
        <clipPath id={`${id}body`}><path d="M36,520 C36,418 92,350 200,345 C308,350 364,418 364,520 Z" /></clipPath>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0.45" stopColor={SKIN_D} stopOpacity={0} /><stop offset="1" stopColor={SKIN_D} stopOpacity={0.55} />
        </linearGradient>
      </defs>
      {/* body */}
      <path d="M36,520 C36,418 92,350 200,345 C308,350 364,418 364,520 Z" fill={ink ? HOOD : `url(#${id}h)`} {...ik} />
      {ink && <path d="M262,352 C320,368 356,420 362,520 L270,520 C276,450 268,400 262,352 Z" fill={HOOD_D} opacity={0.8} />}
      {ink && <path d="M262,352 C320,368 356,420 362,520 L270,520 C276,450 268,400 262,352 Z" fill={`url(#${id}ht)`} opacity={0.35} />}
      <path d="M200,345 C150,348 112,370 92,410" stroke={HOOD_L} strokeWidth={6} fill="none" opacity={0.5} strokeLinecap="round" />
      <rect x={172} y={286} width={56} height={66} rx={12} fill={SKIN_D} {...ik} />
      <ellipse cx={200} cy={356} rx={96} ry={28} fill={HOOD_D} />
      <ellipse cx={200} cy={350} rx={58} ry={15} fill={SKIN_D} />
      <path d="M182,372 L176,438 M218,372 L224,438" stroke="#E9E9F2" strokeWidth={5} strokeLinecap="round" />
      <rect x={170} y={436} width={12} height={16} rx={4} fill="#C9C9D6" /><rect x={218} y={436} width={12} height={16} rx={4} fill="#C9C9D6" />
      {/* headphones around the neck */}
      <path d="M116,352 C112,410 288,410 284,352" stroke="#1E242D" strokeWidth={11} fill="none" />
      <rect x={98} y={336} width={32} height={48} rx={13} fill="#2B323C" /><rect x={270} y={336} width={32} height={48} rx={13} fill="#2B323C" />
      <rect x={104} y={350} width={6} height={20} rx={3} fill={C.green} /><rect x={290} y={350} width={6} height={20} rx={3} fill={C.green} />
      <rect x={36} y={345} width={328} height={175} fill={`url(#${id}g)`} clipPath={`url(#${id}body)`} />
      {/* head */}
      <g transform={`rotate(${tilt} 200 330)`}>
        <ellipse cx={104} cy={214} rx={15} ry={23} fill={SKIN} {...ik} /><ellipse cx={104} cy={214} rx={7} ry={13} fill={SKIN_D} />
        <ellipse cx={296} cy={214} rx={15} ry={23} fill={SKIN} {...ik} /><ellipse cx={296} cy={214} rx={7} ry={13} fill={SKIN_D} />
        <ellipse cx={200} cy={205} rx={96} ry={108} fill={SKIN} {...ik} />
        <g clipPath={`url(#${id}head)`}>
          {ink ? <path d="M246,100 C300,140 312,250 262,318 L320,318 L320,100 Z" fill={SKIN_D} opacity={0.5} /> : <rect x={100} y={96} width={200} height={220} fill={`url(#${id}s)`} />}
          <ellipse cx={150} cy={236} rx={24} ry={14} fill={SKIN_L} opacity={0.35} />
          <ellipse cx={250} cy={236} rx={24} ry={14} fill={SKIN_L} opacity={0.25} />
          {!ink && <rect x={96} y={96} width={210} height={220} fill={`url(#${id}g)`} />}
        </g>
        <path d="M104,200 C98,118 140,84 200,82 C260,84 302,118 296,200 C290,168 280,150 266,140 C236,126 164,126 134,140 C120,150 110,168 104,200 Z" fill={HAIR} {...ik} />
        {curls}
        {brow(158, 0)}{brow(242, 1)}
        {eye(158, 0)}{eye(242, 1)}
        {(mood === "tired" || mood === "sad") && <path d="M138,236 Q158,247 178,236 M222,236 Q242,247 262,236" stroke={SKIN_D} strokeWidth={4} fill="none" strokeLinecap="round" />}
        <path d="M197,222 Q187,242 199,246 Q207,248 211,242" stroke={SKIN_D} strokeWidth={4.5} fill="none" strokeLinecap="round" />
        <clipPath id={`${id}m`}><path d={m.d} /></clipPath>
        <path d={m.d} fill="#2A0D0E" stroke={LINE} strokeWidth={4} strokeLinejoin="round" />
        {gap > 9 && (
          <g clipPath={`url(#${id}m)`}>
            <rect x={150} y={m.top - 4} width={100} height={Math.min(11, gap * 0.32) + 4} fill="#FBF7F2" />
            <ellipse cx={200} cy={m.bottom + 2} rx={(f.width - talk * 8) * 0.3} ry={gap * 0.32} fill="#D0607A" />
          </g>
        )}
        {sweat > 0 && <path d="M292,150 C300,166 306,174 300,182 C294,188 284,184 284,176 C284,168 290,160 292,150 Z" fill="#9FD8FF" opacity={sweat} stroke="#5CA8D8" strokeWidth={2} />}
      </g>
      {/* phone held up in front of the chest (we see its back; the screen lights the face) */}
      {phone && (
        <g transform="translate(232 410) rotate(-8)">
          <rect x={-40} y={-72} width={80} height={140} rx={14} fill="#0E1217" stroke="#2C333D" strokeWidth={4} style={{ filter: `drop-shadow(0 0 22px ${glow}AA)` }} />
          <circle cx={-22} cy={-52} r={7} fill="#232A33" /><circle cx={-22} cy={-52} r={3} fill="#3B4A5C" />
          <circle cx={0} cy={0} r={11} fill="none" stroke="#2C333D" strokeWidth={3} />
          <path d="M-50,80 L42,80 L86,210 L-26,210 Z" fill={HOOD_D} />
          <ellipse cx={-6} cy={66} rx={46} ry={24} fill={SKIN} {...ik} />
          <ellipse cx={-42} cy={22} rx={11} ry={20} fill={SKIN} {...ik} />
          <ellipse cx={40} cy={30} rx={9} ry={17} fill={SKIN} {...ik} />
        </g>
      )}
    </svg>
  );
};

// ---------- Oddy: Oddshot's target mark, alive ----------
export type OddyMood = "calm" | "smug" | "alert" | "happy";
const ODDY: Record<OddyMood, { lid: number; lidB: number; tilt: number; pupil: number }> = {
  calm: { lid: 0.24, lidB: 0, tilt: 0, pupil: 11 },
  smug: { lid: 0.44, lidB: 0.16, tilt: -9, pupil: 11 },
  alert: { lid: 0, lidB: 0, tilt: 0, pupil: 8 },
  happy: { lid: 0.08, lidB: 0.4, tilt: 0, pupil: 11 },
};
export const Oddy: React.FC<{ size: number; mood?: OddyMood; look?: { x: number; y: number }; blink?: number; talk?: number; spin?: number; ink?: boolean; style?: React.CSSProperties }> = ({
  size, mood = "calm", look = { x: 0, y: 0 }, blink = 0, talk = 0, spin = 0, ink = false, style,
}) => {
  const id = uid();
  const o = ODDY[mood];
  const lid = Math.max(o.lid, blink), lidB = blink > 0.5 ? 0 : o.lidB;
  const lx = Math.max(-1, Math.min(1, look.x)) * 14, ly = Math.max(-1, Math.min(1, look.y)) * 12;
  const g = Math.round(110 + talk * 140).toString(16).padStart(2, "0");
  return (
    <svg width={size} height={size} viewBox="-112 -112 224 224" style={{ overflow: "visible", filter: ink ? undefined : `drop-shadow(0 0 ${16 + talk * 22}px ${C.green}${g})`, ...style }}>
      <defs>
        <radialGradient id={`${id}i`} cx="0.4" cy="0.35" r="0.7"><stop offset="0" stopColor="#8DFFC9" /><stop offset="0.6" stopColor={C.green} /><stop offset="1" stopColor="#0FA864" /></radialGradient>
        <clipPath id={`${id}c`}><circle r={42} /></clipPath>
      </defs>
      {ink && [0, 90, 180, 270].map((a) => (
        <line key={`k${a}`} x1={0} y1={-80 - talk * 5} x2={0} y2={-99 - talk * 9} stroke={INK} strokeWidth={19} strokeLinecap="round" transform={`rotate(${a})`} />
      ))}
      {ink && <circle r={74} fill="none" stroke={INK} strokeWidth={22 + talk * 3} />}
      {[0, 90, 180, 270].map((a) => (
        <line key={a} x1={0} y1={-80 - talk * 5} x2={0} y2={-99 - talk * 9} stroke={C.green} strokeWidth={11} strokeLinecap="round" transform={`rotate(${a})`} />
      ))}
      <circle r={74} fill="#05110C" stroke={C.green} strokeWidth={12 + talk * 3} />
      <circle r={59} fill="none" stroke={C.green} strokeWidth={3} opacity={0.4} strokeDasharray="18 10" transform={`rotate(${spin})`} />
      <g clipPath={`url(#${id}c)`}>
        <circle r={42} fill="#F2FFF8" />
        <g transform={`translate(${lx} ${ly})`}>
          <circle r={24} fill={`url(#${id}i)`} />
          <circle r={o.pupil} fill="#03100A" />
          <circle cx={-8} cy={-9} r={5} fill="#fff" />
        </g>
        <g transform={`rotate(${o.tilt})`}>
          {lid > 0.02 && <rect x={-60} y={-60} width={120} height={18 + 84 * lid} fill="#0A1E16" />}
          {lid > 0.02 && <line x1={-60} y1={-42 + 84 * lid} x2={60} y2={-42 + 84 * lid} stroke={C.green} strokeWidth={4} />}
          {lidB > 0.02 && <path d={`M-60,60 L60,60 L60,${42 - 84 * lidB} Q0,${30 - 84 * lidB} -60,${42 - 84 * lidB} Z`} fill="#0A1E16" />}
        </g>
      </g>
      <circle r={42} fill="none" stroke="#0A1E16" strokeWidth={4} />
    </svg>
  );
};

// ---------- Coin critters: the OG and its copycats ----------
export const Coin: React.FC<{ size: number; label: string; color?: string; crown?: boolean; stamp?: string; dizzy?: boolean; look?: number; font?: string; style?: React.CSSProperties }> = ({
  size, label, color = C.yellow, crown, stamp, dizzy, look = 0, font = MONO, style,
}) => (
  <svg width={size} height={size * 1.25} viewBox="-60 -90 120 150" style={{ overflow: "visible", ...style }}>
    {crown && <path d="M-30,-56 L-34,-82 L-16,-66 L0,-88 L16,-66 L34,-82 L30,-56 Z" fill="#FFD449" stroke="#B88A10" strokeWidth={3} strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 10px #FFD44999)" }} />}
    <circle r={52} fill={color} stroke="#00000055" strokeWidth={6} />
    <circle r={41} fill="none" stroke="#ffffff55" strokeWidth={4} />
    {dizzy ? (
      <g stroke="#1A1206" strokeWidth={5} strokeLinecap="round"><path d="M-26,-22 L-12,-8 M-12,-22 L-26,-8 M12,-22 L26,-8 M26,-22 L12,-8" /></g>
    ) : (
      <g><ellipse cx={-17} cy={-14} rx={9} ry={11} fill="#fff" /><ellipse cx={17} cy={-14} rx={9} ry={11} fill="#fff" />
        <circle cx={-17 + look * 4} cy={-12} r={5} fill="#1A1206" /><circle cx={17 + look * 4} cy={-12} r={5} fill="#1A1206" /></g>
    )}
    <path d={dizzy ? "M-12,8 Q0,2 12,8" : "M-12,4 Q0,14 12,4"} stroke="#1A1206" strokeWidth={4.5} fill="none" strokeLinecap="round" />
    <text y={34} textAnchor="middle" fontFamily={font} fontWeight={700} fontSize={label.length > 5 ? 15 : 18} fill="#1A1206">{label}</text>
    {stamp && (
      <g transform="rotate(-18)"><rect x={-58} y={-14} width={116} height={30} rx={4} fill="none" stroke={C.red} strokeWidth={4} />
        <text y={9} textAnchor="middle" fontFamily={font} fontWeight={700} fontSize={17} fill={C.red} letterSpacing={2}>{stamp}</text></g>
    )}
  </svg>
);

// ---------- Sets ----------
export const Bedroom: React.FC<{ glow?: number; dawn?: number }> = ({ glow = 1, dawn = 0 }) => {
  const stars = Array.from({ length: 34 }, (_, i) => ({ x: 160 + random(`sx${i}`) * 500, y: 130 + random(`sy${i}`) * 260, r: 1 + random(`sr${i}`) * 2.2 }));
  const blds = Array.from({ length: 11 }, (_, i) => ({ x: 150 + i * 48, w: 40 + random(`bw${i}`) * 18, h: 70 + random(`bh${i}`) * 140 }));
  const sky0 = dawn ? `rgb(${8 + dawn * 240},${16 + dawn * 140},${40 + dawn * 60})` : "#081028";
  return (
    <AbsoluteFill>
      <svg width={1920} height={1080} viewBox="0 0 1920 1080">
        <defs>
          <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0C1226" /><stop offset="1" stopColor="#151C38" /></linearGradient>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={sky0} /><stop offset="1" stopColor={dawn ? "#FFB070" : "#1B2A5A"} /></linearGradient>
          <radialGradient id="phoneGlow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#9FD8FF" stopOpacity={0.22 * glow} /><stop offset="1" stopColor="#9FD8FF" stopOpacity={0} /></radialGradient>
          <clipPath id="win"><rect x={150} y={120} width={520} height={440} rx={8} /></clipPath>
        </defs>
        <rect width={1920} height={1080} fill="url(#wall)" />
        <polygon points="160,560 670,560 1010,1080 260,1080" fill="#BFD0FF" opacity={0.035 + dawn * 0.06} />
        <g clipPath="url(#win)">
          <rect x={150} y={120} width={520} height={440} fill="url(#sky)" />
          {stars.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={(0.4 + (i % 3) * 0.2) * (1 - dawn)} />)}
          <circle cx={555} cy={222} r={46} fill="#F3EFD8" opacity={1 - dawn} style={{ filter: "drop-shadow(0 0 26px #F3EFD866)" }} />
          <circle cx={540} cy={210} r={9} fill="#DCD6BA" opacity={1 - dawn} /><circle cx={570} cy={238} r={6} fill="#DCD6BA" opacity={1 - dawn} />
          {blds.map((b, i) => (
            <g key={i}>
              <rect x={b.x} y={560 - b.h} width={b.w} height={b.h} fill="#0A0F22" />
              {Array.from({ length: Math.floor(b.h / 26) }, (_, j) => random(`lw${i}-${j}`) > 0.55 && (
                <rect key={j} x={b.x + 8 + (j % 2) * 14} y={560 - b.h + 12 + j * 24} width={8} height={10} fill="#FFD27A" opacity={0.75} />
              ))}
            </g>
          ))}
        </g>
        <rect x={150} y={120} width={520} height={440} rx={8} fill="none" stroke="#2B3456" strokeWidth={18} />
        <path d="M410,120 L410,560 M150,340 L670,340" stroke="#2B3456" strokeWidth={12} />
        <path d="M120,96 C150,260 110,420 140,600 L104,600 C80,420 120,260 92,96 Z" fill="#3A2F5C" />
        <rect x={560} y={300} width={760} height={620} rx={40} fill="#241E3D" />
        {[0, 1, 2, 3].map((r) => [0, 1, 2, 3, 4, 5].map((c) => <circle key={`${r}${c}`} cx={630 + c * 124} cy={360 + r * 70} r={6} fill="#1A1530" />))}
        <rect x={630} y={480} width={360} height={150} rx={72} fill="#C9C3E6" opacity={0.92} />
        <rect x={1380} y={700} width={290} height={380} rx={10} fill="#1F1A33" /><rect x={1370} y={690} width={310} height={22} rx={8} fill="#2A2445" />
        <rect x={1590} y={590} width={52} height={100} rx={10} fill={C.green} /><rect x={1590} y={612} width={52} height={22} fill="#0B3B26" />
        <circle cx={900} cy={650} r={460} fill="url(#phoneGlow)" />
      </svg>
    </AbsoluteFill>
  );
};

export const Blanket: React.FC = () => (
  <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
    <path d="M420,1080 L420,820 C600,756 860,770 1080,800 C1300,830 1480,790 1560,812 L1560,1080 Z" fill="#2E3F78" />
    {[0, 1, 2, 3].map((i) => <path key={i} d={`M420,${880 + i * 52} C640,${830 + i * 52} 900,${850 + i * 52} 1560,${870 + i * 50}`} stroke="#3A4E92" strokeWidth={14} fill="none" opacity={0.7} />)}
  </svg>
);

export const Clock: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ position: "absolute", left: 1410, top: 604, width: 160, height: 84, borderRadius: 14, background: "#08080F", border: "3px solid #1E1B30", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontWeight: 700, fontSize: 50, color: "#FF3B4E", textShadow: "0 0 16px #FF3B4E" }}>{text}</div>
);

export const Line: React.FC<{ who: "DEX" | "ODDY"; text: string }> = ({ who, text }) => (
  <div style={{ position: "absolute", left: 0, right: 0, bottom: 64, display: "flex", justifyContent: "center" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "16px 30px", borderRadius: 18, background: "#05070Bdd", border: `2px solid ${who === "ODDY" ? C.green : HOOD_L}55`, maxWidth: 1500 }}>
      <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 24, letterSpacing: 3, padding: "6px 12px", borderRadius: 8, background: who === "ODDY" ? C.green : HOOD_L, color: "#05070B" }}>{who}</span>
      <span style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 42, color: C.text }}>{text}</span>
    </div>
  </div>
);

// ---------- Look-development stills ----------
export const StyleFrame: React.FC = () => (
  <AbsoluteFill style={{ background: "#0C1226" }}>
    <Bedroom />
    <Dex width={560} mood="shock" look={{ x: 0.95, y: -0.35 }} phone glowAmt={0.9} sweat={0.9} tilt={-3} style={{ position: "absolute", left: 580, top: 136 }} />
    <Blanket />
    <Clock text="3:07" />
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
      <path d="M920,640 C1010,560 1080,470 1210,430" stroke={C.green} strokeWidth={5} strokeDasharray="4 16" strokeLinecap="round" fill="none" opacity={0.85} />
      {[[960, 590, 12], [1050, 505, 9], [1130, 455, 14], [1010, 540, 6]].map(([x, y, r], i) => (
        <path key={i} d={`M${x},${y - r} L${x + r * 0.3},${y - r * 0.3} L${x + r},${y} L${x + r * 0.3},${y + r * 0.3} L${x},${y + r} L${x - r * 0.3},${y + r * 0.3} L${x - r},${y} L${x - r * 0.3},${y - r * 0.3} Z`} fill={C.green} />
      ))}
    </svg>
    <Oddy size={330} mood="smug" look={{ x: -0.9, y: 0.3 }} talk={0.5} spin={20} style={{ position: "absolute", left: 1150, top: 200 }} />
    <Line who="ODDY" text="You bought the tweet. The money moved hours before it." />
  </AbsoluteFill>
);

export const CastSheet: React.FC = () => {
  const head = (mood: DexMood, label: string, i: number) => (
    <div key={mood} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 170 }}>
      <div style={{ width: 170, height: 150, overflow: "hidden", position: "relative" }}>
        <Dex width={190} mood={mood} look={{ x: i % 2 ? 0.5 : -0.4, y: mood === "sad" ? 0.6 : 0 }} sweat={mood === "shock" ? 1 : 0} style={{ position: "absolute", left: -10, top: -18 }} />
      </div>
      <span style={{ fontFamily: MONO, fontSize: 20, color: C.muted, letterSpacing: 2 }}>{label}</span>
    </div>
  );
  return (
    <AbsoluteFill>
      <Bg />
      <div style={{ position: "absolute", left: 80, top: 50, fontFamily: MONO, fontSize: 26, letterSpacing: 8, color: C.muted }}>ODDSHOT · THE CAST</div>
      <div style={{ position: "absolute", left: 90, top: 130 }}>
        <Dex width={430} mood="hype" look={{ x: 0.6, y: 0.2 }} phone glowAmt={0.6} />
      </div>
      <div style={{ position: "absolute", left: 560, top: 150, width: 560 }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 84, color: C.text }}>DEX</div>
        <div style={{ fontFamily: DISPLAY, fontSize: 34, color: HOOD_L, marginBottom: 26 }}>The degen who's always late.</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>{(["shock", "sad", "smug", "calm"] as DexMood[]).map((m, i) => head(m, m.toUpperCase(), i))}</div>
      </div>
      <div style={{ position: "absolute", left: 1280, top: 130, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Oddy size={360} mood="calm" look={{ x: -0.5, y: 0.1 }} talk={0.3} spin={12} />
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 84, color: C.text, marginTop: 24 }}>ODDY</div>
        <div style={{ fontFamily: DISPLAY, fontSize: 32, color: C.green, textAlign: "center", width: 520 }}>The Oddshot plugin. Watches the odds, not the hype.</div>
        <div style={{ display: "flex", gap: 30, marginTop: 24 }}>
          {(["smug", "alert", "happy"] as OddyMood[]).map((m) => <div key={m} style={{ textAlign: "center" }}><Oddy size={110} mood={m} /><div style={{ fontFamily: MONO, fontSize: 18, color: C.muted, marginTop: 8 }}>{m.toUpperCase()}</div></div>)}
        </div>
      </div>
      <div style={{ position: "absolute", left: 100, bottom: 50, display: "flex", alignItems: "flex-end", gap: 34 }}>
        <Coin size={120} label="$GTA6" crown />
        <Coin size={92} label="$GTA6" color="#C9B26A" stamp="COPYCAT" look={-1} />
        <Coin size={92} label="$GTAVI" color="#B9A56E" stamp="COPYCAT" />
        <Coin size={92} label="$GTA" color="#A99C76" dizzy />
        <span style={{ fontFamily: DISPLAY, fontSize: 30, color: C.muted, marginLeft: 20, marginBottom: 40 }}>The OG, and the copycats Oddy skips.</span>
      </div>
    </AbsoluteFill>
  );
};
