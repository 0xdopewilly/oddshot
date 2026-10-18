import React from "react";
import { AbsoluteFill, Easing, Img, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadHand } from "@remotion/google-fonts/Caveat";
import TL from "./demo-timeline.json";
import { Bg, C, Chip, DISPLAY, MONO, Panel, Rich, TargetMark, Terminal, Words, clamp, data, fade, redHead, redReasons, split, token, mover } from "./Oddshot";

const { fontFamily: HAND } = loadHand("normal", { weights: ["700"], subsets: ["latin"] });
const FPS = 30;
type Word = { w: string; disp?: string; t: number; d: number };
type Line = { id: string; chapter: string; text: string; start: number; dur: number; words: Word[] };
const LINES = (TL as any).lines as Line[];
export const DEMO_FRAMES = Math.ceil((TL as any).total * FPS);
const byId = (id: string) => LINES.find((l) => l.id === id)!;
/** Frame, relative to the line's start, when the first word matching `re` is spoken. */
const cue = (id: string, re: RegExp, offset = 0) => Math.round(((byId(id).words.find((x) => re.test(x.w))?.t ?? 0) + offset) * FPS);

// ---------- Hand-drawn annotations ----------

function ellipse(x: number, y: number, w: number, h: number, seed = 2) {
  const pts: string[] = [];
  for (let i = 0; i <= 33; i++) {
    const a = -2.6 + (i / 30) * Math.PI * 2;
    const r = 1 + 0.05 * Math.sin(i * 1.3 + seed) + (i > 28 ? 0.06 : 0);
    pts.push(`${i ? "L" : "M"}${(x + w / 2 + (w / 2) * r * Math.cos(a)).toFixed(1)} ${(y + h / 2 + (h / 2) * r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}
const draw = (f: number, at: number, len = 14) => interpolate(f, [at, at + len], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });

/** Annotation in pixel space: a circle/underline around (x,y,w,h), optional handwritten note at (nx,ny) with an arrow. */
const Anno: React.FC<{ at: number; x: number; y: number; w: number; h: number; kind?: "circle" | "underline"; color?: string;
  note?: string; nx?: number; ny?: number; size?: number }> = ({ at, x, y, w, h, kind = "circle", color = C.yellow, note, nx = 0, ny = 0, size = 46 }) => {
  const f = useCurrentFrame();
  if (f < at) return null;
  const p = draw(f, at);
  const q = draw(f, at + 10, 10);
  const d = kind === "underline" ? `M${x} ${y + h + 6} C ${x + w * 0.3} ${y + h + 14}, ${x + w * 0.7} ${y + h}, ${x + w} ${y + h + 8}` : ellipse(x - 14, y - 10, w + 28, h + 20);
  const tx = x + w / 2 + (nx > x + w / 2 ? w / 2 + 16 : -w / 2 - 16);
  const ty = y + h / 2;
  const sx = nx + (nx > x + w / 2 ? -10 : 10);
  const sy = ny + (ny < y ? 26 : -30);
  const ang = Math.atan2(ty - sy, tx - sx);
  const head = (s: number) => `M${tx} ${ty} L${tx - 18 * Math.cos(ang + s)} ${ty - 18 * Math.sin(ang + s)}`;
  return (
    <>
      <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }} width="1" height="1">
        <g fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}>
          <path d={d} pathLength={1} strokeDasharray="1" strokeDashoffset={1 - p} />
          {note && (
            <>
              <path d={`M${sx} ${sy} Q ${(sx + tx) / 2} ${Math.min(sy, ty) - 30} ${tx} ${ty}`} pathLength={1} strokeDasharray="1" strokeDashoffset={1 - q} />
              {q > 0.95 && <><path d={head(0.45)} /><path d={head(-0.45)} /></>}
            </>
          )}
        </g>
      </svg>
      {note && (
        <div style={{ position: "absolute", left: nx, top: ny, transform: `translate(${nx > x + w / 2 ? "0" : "-100%"}, -50%) rotate(-4deg)`,
          fontFamily: HAND, fontWeight: 700, fontSize: size, color, whiteSpace: "nowrap", opacity: fade(f, at + 8, at + 18), textShadow: "0 2px 12px #000" }}>{note}</div>
      )}
    </>
  );
};

/** Inline mark around a piece of text: hand-drawn circle or underline, optional note. */
const Mark: React.FC<{ at: number; kind?: "circle" | "underline"; color?: string; note?: string; noteStyle?: React.CSSProperties; children: React.ReactNode }> =
  ({ at, kind = "circle", color = C.yellow, note, noteStyle, children }) => {
  const f = useCurrentFrame();
  const p = draw(f, at);
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      {children}
      {f >= at && (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", left: kind === "underline" ? 0 : -22, top: kind === "underline" ? "100%" : -14,
          width: kind === "underline" ? "100%" : "calc(100% + 44px)", height: kind === "underline" ? 22 : "calc(100% + 28px)", overflow: "visible" }}>
          <path d={kind === "underline" ? "M0 30 C 30 70, 65 10, 100 45" : ellipse(2, 2, 96, 96)} fill="none" stroke={color} strokeWidth={5}
            vectorEffect="non-scaling-stroke" strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - p}
            style={{ filter: `drop-shadow(0 0 6px ${color}88)` }} />
        </svg>
      )}
      {note && f >= at && (
        <span style={{ position: "absolute", fontFamily: HAND, fontWeight: 700, fontSize: 46, color, whiteSpace: "nowrap",
          opacity: fade(f, at + 8, at + 18), transform: "rotate(-4deg)", ...noteStyle }}>{note}</span>
      )}
    </span>
  );
};

// ---------- Real footage: cropped screenshots in a browser frame ----------

type Map = { pt: (x: number, y: number) => [number, number]; s: number };
const Shot: React.FC<{ src: string; crop: [number, number, number, number]; width: number; url: string; imgW: number;
  zoom?: [number, number]; origin?: [number, number]; focus?: { at: number; scale: number; origin: [number, number] };
  children?: (m: Map) => React.ReactNode; style?: React.CSSProperties }> =
  ({ src, crop: [cx, cy, cw, ch], width, url, imgW, zoom = [1, 1], origin, focus, children, style }) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const s = width / cw;
  const H = Math.round(ch * s);
  const m: Map = { pt: (x, y) => [(x - cx) * s, (y - cy) * s], s };
  // Slow Ken Burns drift, then a camera push into the annotated detail when `focus` fires.
  const fp = focus ? spring({ frame: f - focus.at, fps: FPS, config: { damping: 24, stiffness: 80 } }) : 0;
  const z = interpolate(f, [0, durationInFrames], zoom, clamp) * (1 + ((focus?.scale ?? 1) - 1) * fp);
  const [bx, by] = origin ? m.pt(...origin) : [width / 2, H / 2];
  const [fx, fy] = focus ? m.pt(...focus.origin) : [bx, by];
  const ox = bx + (fx - bx) * fp;
  const oy = by + (fy - by) * fp;
  const inS = spring({ frame: f, fps: FPS, config: { damping: 200 } });
  return (
    <Panel style={{ overflow: "hidden", width, opacity: inS, transform: `translateY(${(1 - inS) * 30}px)`, ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", background: "#0A0E13", borderBottom: `1px solid ${C.line}` }}>
        {[C.red, C.yellow, C.green].map((c) => <span key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c, opacity: 0.8 }} />)}
        <span style={{ marginLeft: 14, padding: "5px 16px", borderRadius: 999, background: "#151B23", fontFamily: MONO, fontSize: 18, color: C.muted }}>{url}</span>
        <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 16, color: C.green, letterSpacing: 2 }}>● LIVE PAGE</span>
      </div>
      <div style={{ position: "relative", width, height: H, overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, transform: `scale(${z})`, transformOrigin: `${ox}px ${oy}px` }}>
          <Img src={staticFile(src)} style={{ position: "absolute", width: imgW * s, left: -cx * s, top: -cy * s }} />
          {children?.(m)}
        </div>
      </div>
    </Panel>
  );
};

/** Annotation in source-image coordinates, mapped into a Shot. */
const ImgAnno: React.FC<{ m: Map; at: number; box: [number, number, number, number]; note?: string; noteAt?: [number, number]; kind?: "circle" | "underline"; color?: string }> =
  ({ m, at, box: [x, y, w, h], note, noteAt, kind, color }) => {
  const [px, py] = m.pt(x, y);
  const [nx, ny] = noteAt ? m.pt(...noteAt) : [0, 0];
  return <Anno at={at} x={px} y={py} w={w * m.s} h={h * m.s} note={note} nx={nx} ny={ny} kind={kind} color={color} />;
};

// ---------- Scenes (one per voice line; frames are relative to the line's start) ----------

const Center: React.FC<{ children: React.ReactNode; gap?: number; top?: number }> = ({ children, gap = 28, top = 0 }) => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap, paddingBottom: 175, paddingTop: 72 + top }}>{children}</AbsoluteFill>
);

const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const b = cue("hook", /Memecoins/);
  const s1 = spring({ frame: f, fps: FPS, config: { damping: 13, stiffness: 160 } });
  const s2 = spring({ frame: f - b, fps: FPS, config: { damping: 13, stiffness: 160 } });
  const line = { fontFamily: DISPLAY, fontWeight: 700, fontSize: 132, letterSpacing: -4, lineHeight: 1.02, color: C.text } as const;
  return (
    <Center gap={14}>
      <div style={{ fontFamily: MONO, fontSize: 24, letterSpacing: 6, color: C.muted, opacity: fade(f, 4, 14) }}>POLYMARKET → SOLANA</div>
      <div style={{ ...line, opacity: Math.min(1, s1 * 1.4), transform: `translateX(${(1 - s1) * -140}px)` }}>
        Prediction markets <span style={{ color: C.cyan }}>move first.</span>
      </div>
      <div style={{ ...line, opacity: f >= b ? Math.min(1, s2 * 1.4) : 0, transform: `translateX(${(1 - s2) * 140}px) scale(${1 + 0.06 * Math.max(0, 1 - s2)})` }}>
        Memecoins <span style={{ color: C.green, textShadow: `0 0 40px ${C.green}88` }}>follow.</span>
      </div>
    </Center>
  );
};

const Signal: React.FC = () => (
  <Center>
    <Shot src="live/polymarket.png" imgW={2400} crop={[0, 150, 2400, 1350]} width={1240} url="polymarket.com/event/of-views-of-grand-theft-auto-vi-launch-trailer…"
      zoom={[1, 1.05]} origin={[1300, 1220]} focus={{ at: cue("signal", /jump/) - 3, scale: 1.55, origin: [1400, 1230] }}>
      {(m) => (
        <>
          <ImgAnno m={m} at={cue("signal", /odds/)} box={[190, 1085, 250, 50]} note="this market" noteAt={[640, 1010]} />
          <ImgAnno m={m} at={cue("signal", /jump/)} box={[1180, 1150, 400, 190]} color={C.green} note="the crowd moved" noteAt={[1080, 1080]} />
        </>
      )}
    </Shot>
  </Center>
);

const Intro: React.FC = () => {
  const f = useCurrentFrame();
  const s = spring({ frame: f, fps: FPS, config: { damping: 14 } });
  const steps = ["Polymarket odds", "Solana memes", "3-source seatbelt", "PayBox approval"];
  return (
    <Center gap={34}>
      <div style={{ display: "flex", alignItems: "center", gap: 30, transform: `scale(${0.8 + 0.2 * s})`, opacity: Math.min(1, s * 1.5) }}>
        <TargetMark size={130} spin={(1 - s) * -180} />
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 150, letterSpacing: 5, color: C.text }}>ODDSHOT</div>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 24, letterSpacing: 5, color: C.muted, opacity: fade(f, 12, 24) }}>A PAYBOX PLUGIN FOR AI AGENTS</div>
      <div style={{ display: "flex", gap: 18, alignItems: "center", marginTop: 10 }}>
        {steps.map((t, i) => (
          <React.Fragment key={t}>
            {i > 0 && <span style={{ fontFamily: MONO, fontSize: 30, color: C.muted, opacity: fade(f, 30 + i * 12, 38 + i * 12) }}>→</span>}
            <Chip color={i === 3 ? C.green : C.cyan} size={28} style={{ opacity: fade(f, 26 + i * 12, 36 + i * 12) }}>{t}</Chip>
          </React.Fragment>
        ))}
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 6 }}>
        <span style={{ fontFamily: MONO, fontSize: 22, letterSpacing: 4, color: C.muted, opacity: fade(f, cue("intro", /Claude/) - 6, cue("intro", /Claude/)) }}>YOUR AGENT IN</span>
        {(["Claude", "ChatGPT", "Grok"] as const).map((h) => {
          const at = cue("intro", new RegExp(`^${h}`));
          const s = spring({ frame: f - at, fps: FPS, config: { damping: 12 } });
          return <Chip key={h} color={C.text} size={34} style={{ opacity: f >= at ? Math.min(1, s * 1.5) : 0, transform: `scale(${0.7 + 0.3 * s})` }}>{h}</Chip>;
        })}
      </div>
    </Center>
  );
};

const Board: React.FC = () => (
  <Center gap={22}>
    <Chip color={C.green} size={22}>● LIVE · running on PayBox's hosted runtime</Chip>
    <Terminal title={data.via ?? "agent ▸ paybox ▸ oddshot"} call="paybox plugins use 2e7cea02…8fcb oddshot_play" lines={split(data.board?.text)}
      start={4} every={4} fontSize={22} width={1640} isHighlighted={(i) => i >= 1 && i <= 3} />
  </Center>
);

const Play: React.FC = () => {
  const f = useCurrentFrame();
  const s = spring({ frame: f, fps: FPS, config: { damping: 200 } });
  const ch: number = token.change6hPct ?? 0;
  const label = (t: string) => <div style={{ fontFamily: MONO, fontSize: 20, letterSpacing: 4, color: C.muted }}>{t}</div>;
  return (
    <Center>
      <Panel style={{ width: 1500, padding: "40px 56px 44px", opacity: s, transform: `scale(${0.96 + 0.04 * s})` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 30, fontFamily: MONO, fontSize: 40, color: C.text }}>
          <Mark at={cue("play", /top/)} color={C.green}><span style={{ color: C.green, fontWeight: 700 }}>EARLY</span></Mark>
          <span>${token.symbol} ← "{data.play?.narrative}"</span>
          <span style={{ marginLeft: "auto", color: C.muted, fontSize: 28 }}>play {data.play?.playScore}</span>
        </div>
        <div style={{ height: 1, background: C.line, margin: "30px 0" }} />
        <div style={{ display: "flex", gap: 60 }}>
          <div style={{ flex: 1.35 }}>
            {label("POLYMARKET · 24H")}
            <div style={{ fontFamily: DISPLAY, fontSize: 30, color: C.text, marginTop: 12, lineHeight: 1.3 }}>{mover.question}</div>
            <div style={{ marginTop: 26, fontFamily: MONO, fontSize: 64, fontWeight: 700, color: C.green }}>
              <Mark at={cue("play", /twenty/)} kind="underline" color={C.yellow} note="the odds moved" noteStyle={{ left: "103%", top: 0, fontSize: 34 }}>
                ▲ +{mover.changePts} pts → {mover.probabilityPct}%
              </Mark>
            </div>
          </div>
          <div style={{ width: 1, background: C.line }} />
          <div style={{ flex: 1 }}>
            {label("SOLANA MEME · 6H")}
            <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 64, color: C.text, marginTop: 6 }}>${token.symbol}</div>
            <div style={{ marginTop: 14, fontFamily: MONO, fontSize: 64, fontWeight: 700, color: C.yellow }}>
              <Mark at={cue("play", /hasn/)} color={C.yellow} note="the meme hasn't" noteStyle={{ left: -10, top: "118%" }}>
                {ch > 0 ? "+" : ""}{ch.toFixed(1)}%
              </Mark>
            </div>
          </div>
        </div>
        <WindowMeter at={cue("play", /gap/)} odds={mover.changePts} meme={ch} />
      </Panel>
    </Center>
  );
};

/** Odds bar shoots up, meme bar stays flat, and a hand-drawn arrow labels the gap. */
const WindowMeter: React.FC<{ at: number; odds: number; meme: number }> = ({ at, odds, meme }) => {
  const f = useCurrentFrame();
  const W = 900;
  const grow = interpolate(f, [at - 6, at + 14], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const oddsW = (Math.min(Math.abs(odds), 40) / 40) * W * grow;
  const memeW = Math.max(8, (Math.min(Math.max(meme, 0), 40) / 40) * W) * grow;
  const arrow = draw(f, at + 14, 12);
  const row = (label: string, w: number, color: string, value: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 22, height: 44 }}>
      <span style={{ width: 90, fontFamily: MONO, fontSize: 20, letterSpacing: 3, color: C.muted }}>{label}</span>
      <div style={{ width: W, height: 22, borderRadius: 11, background: "#1A212B", position: "relative" }}>
        <div style={{ width: w, height: "100%", borderRadius: 11, background: color, boxShadow: `0 0 18px ${color}88` }} />
      </div>
      <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 30, color }}>{value}</span>
    </div>
  );
  return (
    <div style={{ marginTop: 40, position: "relative", opacity: fade(f, at - 8, at) }}>
      {row("ODDS", oddsW, C.green, `+${odds} pts`)}
      <div style={{ height: 34 }} />
      {row("MEME", memeW, C.yellow, `${meme > 0 ? "+" : ""}${meme.toFixed(1)}%`)}
      <svg style={{ position: "absolute", left: 112, top: 0, overflow: "visible" }} width={W} height={122}>
        <g fill="none" stroke={C.cyan} strokeWidth={4} strokeLinecap="round">
          <path d={`M${20} 61 C ${W * 0.25} 52, ${oddsW * 0.6} 68, ${oddsW - 14} 60`} pathLength={1} strokeDasharray="1" strokeDashoffset={1 - arrow} />
          {arrow > 0.95 && <><path d={`M${oddsW - 14} 60 l-16 -9`} /><path d={`M${oddsW - 14} 60 l-16 9`} /><path d={`M20 61 l16 -9`} /><path d={`M20 61 l16 9`} /></>}
        </g>
      </svg>
      <div style={{ position: "absolute", left: 112 + oddsW * 0.38, top: 64, fontFamily: HAND, fontWeight: 700, fontSize: 46, color: C.cyan,
        opacity: fade(f, at + 22, at + 32), transform: "rotate(-3deg)", textShadow: "0 2px 12px #000" }}>the window</div>
    </div>
  );
};

/** The story's token swarm: the OG crowned in the centre, contenders around it, copycats struck out on the outer ring. */
const Swarm: React.FC = () => {
  const f = useCurrentFrame();
  const sw = data.swarm;
  const ogAt = cue("swarm", /^OG/);
  const totalAt = cue("swarm", /thirty/);
  const copyAt = cue("swarm", /twenty/);
  const frenzyAt = cue("swarm", /frenzy/);
  const W = 1500, H = 600, cx = W / 2, cy = H / 2;
  const nC = Math.max(0, sw.size - sw.copycats - 1);
  const og = spring({ frame: f - ogAt, fps: FPS, config: { damping: 11, stiffness: 150 } });
  const struck = draw(f, copyAt, 12);
  const node = (i: number, n: number, rx: number, ry: number, off: number) => {
    const a = (i / n) * Math.PI * 2 + off;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as const;
  };
  const chip = (at: number, color: string, label: string) => (
    <Chip color={color} size={30} style={{ opacity: fade(f, at - 3, at + 6), transform: `translateY(${(1 - fade(f, at - 3, at + 6)) * 14}px)` }}>{label}</Chip>
  );
  return (
    <Center gap={18}>
      <div style={{ fontFamily: MONO, fontSize: 22, letterSpacing: 5, color: C.muted, opacity: fade(f, 0, 10) }}>STORY SWARM · “{sw.narrative}” · LIVE BOARD {sw.capturedAt.toUpperCase()}</div>
      <div style={{ position: "relative", width: W, height: H }}>
      <svg width={W} height={H} style={{ overflow: "visible", position: "absolute", left: 0, top: 0 }}>
        {Array.from({ length: nC }, (_, i) => {
          const [x, y] = node(i, nC, 330, 165, -Math.PI / 2);
          const at = totalAt - 18 + i * 1.5;
          const o = fade(f, at, at + 8);
          return <g key={`c${i}`} opacity={o}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke={C.cyan} strokeOpacity={0.25 * og} strokeWidth={2} />
            <circle cx={x} cy={y} r={20} fill="#0F1F2A" stroke={C.cyan} strokeWidth={3} />
          </g>;
        })}
        {Array.from({ length: sw.copycats }, (_, i) => {
          const [x, y] = node(i, sw.copycats, 680, 270, 0.12);
          const at = totalAt - 8 + i;
          const o = fade(f, at, at + 6) * (1 - 0.55 * struck);
          return <g key={`k${i}`} opacity={o}>
            <circle cx={x} cy={y} r={13} fill="#1A1416" stroke={struck > 0 ? C.red : C.muted} strokeWidth={2.5} />
            {struck > 0 && <path d={`M${x - 9} ${y - 9} L${x + 9} ${y + 9} M${x + 9} ${y - 9} L${x - 9} ${y + 9}`} stroke={C.red} strokeWidth={3}
              pathLength={1} strokeDasharray="1" strokeDashoffset={1 - struck} strokeLinecap="round" />}
          </g>;
        })}
        <g transform={`translate(${cx} ${cy}) scale(${og})`} opacity={Math.min(1, og * 1.5)}>
          <circle r={86} fill="#0E2A1E" stroke={C.green} strokeWidth={5} style={{ filter: `drop-shadow(0 0 24px ${C.green}88)` }} />
          <text y={-4} textAnchor="middle" fill={C.text} fontFamily={DISPLAY} fontWeight={700} fontSize={40}>${sw.og}</text>
          <text y={36} textAnchor="middle" fill={C.green} fontFamily={MONO} fontWeight={700} fontSize={24} letterSpacing={4}>OG</text>
        </g>
      </svg>
      <div style={{ position: "absolute", left: 0, top: 0 }}>
        <Anno at={ogAt + 8} x={cx - 90} y={cy - 90} w={180} h={180} color={C.green} note="the original" nx={cx + 250} ny={cy - 230} />
      </div>
      </div>
      <div style={{ display: "flex", gap: 18 }}>
        {chip(totalAt, C.cyan, `${sw.size} tokens on one story`)}
        {chip(copyAt, C.red, `✕ ${sw.copycats} copycats skipped`)}
        {chip(frenzyAt, C.yellow, `⚠ ${sw.launched24h} launched in 24h: frenzy`)}
      </div>
    </Center>
  );
};

const SOURCES = [
  { name: "Market data", via: "DexScreener", what: "liquidity · pair age · price action", re: /market/ },
  { name: "RugCheck", via: "rugcheck.xyz", what: "LP lock · insiders · holder risks", re: /RugCheck/ },
  { name: "Jupiter audit", via: "jup.ag", what: "mint & freeze authority · dev history · bot volume", re: /Jupiter/ },
];
const Sources: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Center gap={44}>
      <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 64, color: C.text, opacity: fade(f, 0, 10) }}>
        Three sources. <span style={{ color: C.green }}>One verdict.</span>
      </div>
      <div style={{ display: "flex", gap: 30 }}>
        {SOURCES.map((src) => {
          const at = cue("sources", src.re);
          const s = spring({ frame: f - at, fps: FPS, config: { damping: 13 } });
          return (
            <Panel key={src.name} style={{ width: 520, padding: "34px 36px", opacity: Math.min(1, Math.max(0, s) * 1.5), transform: `translateY(${(1 - s) * 50}px)`,
              borderColor: f > at + 6 ? `${C.green}88` : C.line }}>
              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <span style={{ width: 52, height: 52, borderRadius: 26, background: `${C.green}22`, border: `2px solid ${C.green}`, color: C.green, fontFamily: MONO,
                  fontWeight: 700, fontSize: 30, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</span>
                <div>
                  <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 40, color: C.text }}>{src.name}</div>
                  <div style={{ fontFamily: MONO, fontSize: 19, color: C.cyan }}>{src.via}</div>
                </div>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 21, color: C.muted, marginTop: 18, lineHeight: 1.45 }}>{src.what}</div>
            </Panel>
          );
        })}
      </div>
    </Center>
  );
};

const Crosscheck: React.FC = () => {
  const f = useCurrentFrame();
  const swap = cue("crosscheck", /^But$/, -0.1);
  const yellow = cue("crosscheck", /yellow/);
  const v = spring({ frame: f - yellow, fps: FPS, config: { damping: 14 } });
  return (
    <AbsoluteFill>
      <Sequence durationInFrames={swap}>
        <Center>
          <Shot src="live/rugcheck.png" imgW={2400} crop={[390, 170, 1640, 860]} width={1300} url="rugcheck.xyz/tokens/4kjr…zDnz" zoom={[1, 1.04]} origin={[580, 600]} focus={{ at: cue("crosscheck", /good/) - 3, scale: 1.4, origin: [600, 620] }}>
            {(m) => <ImgAnno m={m} at={cue("crosscheck", /good/)} box={[440, 450, 290, 340]} color={C.green} note="RugCheck says GOOD" noteAt={[1150, 400]} />}
          </Shot>
        </Center>
      </Sequence>
      <Sequence from={swap}>
        <Center>
          <Shot src="live/jupiter.png" imgW={2400} crop={[40, 400, 1700, 700]} width={1240} url="jup.ag/tokens/4kjr…zDnz" zoom={[1, 1.03]} origin={[1100, 950]} focus={{ at: cue("crosscheck", /eight/) - swap - 3, scale: 1.6, origin: [1110, 955] }}>
            {(m) => <ImgAnno m={m} at={cue("crosscheck", /eight/) - swap} box={[995, 930, 235, 52]} color={C.yellow} note="dev: 8,483 tokens" noteAt={[860, 790]} />}
          </Shot>
          {(
            <div style={{ height: 96, opacity: Math.min(1, Math.max(0, v) * 1.5), transform: `translateY(${(1 - v) * 30}px)` }}>
              <Panel style={{ padding: "20px 34px", borderColor: `${C.yellow}99`, display: "flex", alignItems: "center", gap: 20 }}>
                <span style={{ fontFamily: MONO, fontSize: 26, color: C.muted }}>Oddshot verdict</span>
                <Chip color={C.yellow} size={32}>● YELLOW</Chip>
                <span style={{ fontFamily: MONO, fontSize: 26, color: C.text }}>Serial deployer: the dev has launched 8483 tokens</span>
              </Panel>
            </div>
          )}
        </Center>
      </Sequence>
    </AbsoluteFill>
  );
};

const Red: React.FC = () => {
  const f = useCurrentFrame();
  const at = cue("red", /red/);
  const s = spring({ frame: f - at, fps: FPS, config: { damping: 11, stiffness: 170 } });
  return (
    <Center gap={40}>
      {f >= at && (
        <div style={{ transform: `rotate(-3deg) scale(${2 - s})`, opacity: Math.min(1, s * 1.5), border: `6px solid ${C.red}`, borderRadius: 26,
          padding: "36px 64px", background: "rgba(255,79,100,0.08)", textAlign: "center", boxShadow: `0 0 90px ${C.red}55` }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 112, color: C.red, letterSpacing: 4 }}>SEATBELT ENGAGED</div>
          <div style={{ fontFamily: MONO, fontSize: 36, color: C.text, marginTop: 14 }}>{redHead}. Buy refused.</div>
          {redReasons.map((r) => <div key={r} style={{ fontFamily: MONO, fontSize: 26, color: C.muted, marginTop: 8 }}>✕ {r}</div>)}
        </div>
      )}
      <div style={{ opacity: fade(f, cue("red", /Exits/), cue("red", /Exits/) + 10), fontFamily: DISPLAY, fontWeight: 700, fontSize: 46, color: C.text }}>
        Selling is <span style={{ color: C.green }}>never</span> blocked.
      </div>
    </Center>
  );
};

const Ape: React.FC = () => {
  const f = useCurrentFrame();
  const at = cue("ape", /passkey/, -0.8);
  const s = spring({ frame: f - at, fps: FPS, config: { damping: 16 } });
  return (
    <Center gap={26}>
      <Terminal title={data.apeVia ?? "oddshot ▸ ape"} ask={`Ape 0.005 SOL into $${token.symbol}`} call={`ape({ mint: "4kjr…zDnz", amount: "0.005", payWith: "SOL" })`}
        lines={split(data.ape?.text)} start={2} every={6} width={1500} fontSize={25} />
      <Panel style={{ width: 1500, padding: "24px 34px", display: "flex", alignItems: "center", gap: 26, opacity: Math.max(0, s), transform: `translateY(${(1 - s) * 30}px)` }}>
        <svg width="56" height="56" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29" fill="none" stroke={C.cyan} strokeWidth="4" />
          {[10, 16, 22].map((r) => <path key={r} d={`M${32 - r / 1.5} ${44 - r / 3} a${r} ${r} 0 0 1 ${(r / 1.5) * 2} 0`} fill="none" stroke={C.cyan} strokeWidth="3.5" strokeLinecap="round" />)}</svg>
        <div style={{ fontFamily: DISPLAY, fontSize: 36, fontWeight: 700, color: C.text }}>Unsigned proposal → PayBox asks for <span style={{ color: C.cyan }}>your passkey</span></div>
      </Panel>
    </Center>
  );
};

const Receipt: React.FC = () => {
  const f = useCurrentFrame();
  const r = data.receipt;
  const nowAt = cue("receipt", /Seven/);
  const tw = cue("receipt", /twenty/);
  const rv = cue("receipt", /reverse/);
  const ticket = (title: string, when: string, at: number, color: string, children: React.ReactNode) => {
    const s = spring({ frame: f - at, fps: FPS, config: { damping: 15 } });
    return (
      <Panel style={{ width: 620, padding: "26px 34px 30px", opacity: f >= at ? Math.min(1, s * 1.5) : 0, transform: `translateY(${(1 - s) * 30}px)`, borderColor: `${color}66` }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 20, letterSpacing: 3 }}>
          <span style={{ color }}>{title}</span><span style={{ color: C.muted }}>{when}</span>
        </div>
        {children}
      </Panel>
    );
  };
  const big = { fontFamily: MONO, fontWeight: 700, fontSize: 54, color: C.text, marginTop: 14 } as const;
  const small = { fontFamily: MONO, fontSize: 22, color: C.muted, marginTop: 8 } as const;
  const summary = String(data.why?.text ?? "").split("\n")[0];
  return (
    <Center gap={26}>
      <div style={{ display: "flex", alignItems: "center", gap: 34 }}>
        {ticket("THE CALL", r.calledAt, 0, C.green, <>
          <div style={big}>${r.calledPrice}</div>
          <div style={small}><span style={{ color: C.green, fontWeight: 700 }}>EARLY</span> · 6h {r.called6h}% · hasn't moved</div>
          <div style={small}>odds {r.calledOdds}%</div>
        </>)}
        <div style={{ fontFamily: HAND, fontWeight: 700, fontSize: 44, color: C.cyan, textAlign: "center", opacity: fade(f, nowAt - 6, nowAt + 4) }}>7 hours<br />→</div>
        {ticket("NOW", r.nowAt, nowAt, C.green, <>
          <div style={{ ...big, display: "flex", alignItems: "baseline", gap: 26 }}>
            ${r.nowPrice}
            <Mark at={tw} color={C.green} note="since the call" noteStyle={{ left: -10, top: "112%" }}>
              <span style={{ color: C.green, fontSize: 60 }}>+{r.sinceCall}%</span>
            </Mark>
          </div>
          <div style={{ ...small, marginTop: 60 }}>odds {r.calledOdds}% → <span style={{ color: C.green, fontWeight: 700 }}>{r.nowOdds}%</span></div>
        </>)}
      </div>
      <Panel style={{ width: 1340, padding: "18px 30px", opacity: fade(f, rv - 4, rv + 8), transform: `translateY(${(1 - fade(f, rv - 4, rv + 8)) * 20}px)` }}>
        <div style={{ fontFamily: MONO, fontSize: 18, letterSpacing: 3, color: C.cyan }}>REVERSE MODE · why_pumping · LIVE ON PAYBOX</div>
        <div style={{ fontFamily: MONO, fontSize: 23, color: C.text, marginTop: 8, lineHeight: 1.45 }}><Rich text={summary} /></div>
      </Panel>
      <div style={{ fontFamily: MONO, fontSize: 18, color: C.muted, opacity: fade(f, rv, rv + 10) }}>One call, one example. Memecoins are extremely risky. Not financial advice.</div>
    </Center>
  );
};

const Bags: React.FC = () => (
  <Center gap={22}>
    <Terminal title={data.via ?? "agent ▸ paybox ▸ oddshot"} call={`paybox plugins use 2e7cea02…8fcb my_bags { owner: "7zs3…p9k7" }`}
      lines={split(data.bags?.text)} start={2} every={5} width={1500} fontSize={26} />
  </Center>
);

/** The real recording: Claude → Oddshot via PayBox → transaction window → approve → confirmed (cut to the narration). */
const ApeLive: React.FC = () => {
  const f = useCurrentFrame();
  const win = cue("ape", /PayBox/);
  const ok = cue("ape", /approve/);
  const done = cue("ape", /confirmed/);
  const z = spring({ frame: f - ok + 4, fps: FPS, config: { damping: 24, stiffness: 70 } });
  const t = data.txDetail;
  const steps: { at: number; label: string; sub: string }[] = [
    { at: 0, label: "You ask Claude", sub: "“Use the Oddshot plugin's ape tool…”" },
    { at: cue("ape", /Oddshot/), label: "Oddshot builds a capped swap", sub: "seatbelt: YELLOW, allowed · slippage cap 3%" },
    { at: win, label: "PayBox opens its transaction window", sub: "Swap · Solana · your wallet" },
    { at: ok, label: "You approve", sub: "Submit transaction" },
    { at: done, label: "Confirmed on Solana", sub: `${t.sol} SOL → ${t.got} $${t.symbol}` },
  ];
  const active = steps.reduce((a, st, i) => (f >= st.at ? i : a), 0);
  const card = spring({ frame: f - done - 10, fps: FPS, config: { damping: 15 } });
  return (
    <Center>
      <div style={{ display: "flex", gap: 44, alignItems: "center" }}>
        <Panel style={{ width: 780, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", background: "#0A0E13", borderBottom: `1px solid ${C.line}` }}>
            {[C.red, C.yellow, C.green].map((c) => <span key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c, opacity: 0.8 }} />)}
            <span style={{ marginLeft: 14, padding: "5px 16px", borderRadius: 999, background: "#151B23", fontFamily: MONO, fontSize: 18, color: C.muted }}>claude.ai · Oddshot via PayBox</span>
            <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 16, color: C.red, letterSpacing: 2 }}>● REAL RECORDING</span>
          </div>
          <div style={{ position: "relative", width: 780, height: 780, overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, transform: `scale(${1 + 0.3 * z})`, transformOrigin: "765px 560px" }}>
              <OffthreadVideo src={staticFile("claude-cut.mp4")} muted style={{ width: 780, height: 780 }} />
              <Anno at={done + 2} x={292} y={496} w={452} h={36} color={C.green} />
            </div>
          </div>
        </Panel>
        <div style={{ width: 800, display: "flex", flexDirection: "column", gap: 16 }}>
          {steps.map((st, i) => {
            const s = spring({ frame: f - st.at, fps: FPS, config: { damping: 16 } });
            const last = i === steps.length - 1;
            const lit = i <= active;
            const color = last && lit ? C.green : i === active ? C.cyan : C.text;
            return (
              <div key={st.label} style={{ display: "flex", gap: 20, alignItems: "center", opacity: f >= st.at ? Math.max(0.35, Math.min(1, s * 1.4)) * (i === active || last ? 1 : 0.7) : 0.18,
                transform: `translateX(${(1 - Math.min(1, Math.max(0, s))) * 24}px)` }}>
                <span style={{ width: 50, height: 50, borderRadius: 25, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontWeight: 700,
                  fontSize: 24, color: lit ? C.bg : C.muted, background: lit ? color : "transparent", border: `2px solid ${lit ? color : C.line}` }}>{last && lit ? "✓" : i + 1}</span>
                <div>
                  <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 34, color: lit ? color : C.muted }}>{st.label}</div>
                  <div style={{ fontFamily: MONO, fontSize: 19, color: C.muted, marginTop: 2 }}>{st.sub}</div>
                </div>
              </div>
            );
          })}
          <Panel style={{ marginTop: 10, padding: "20px 26px", borderColor: `${C.green}88`, opacity: f >= done + 10 ? Math.min(1, card * 1.5) : 0, transform: `translateY(${(1 - card) * 24}px)` }}>
            <div style={{ fontFamily: MONO, fontSize: 18, letterSpacing: 3, color: C.green }}>ON-CHAIN RECEIPT · SOLANA</div>
            <div style={{ fontFamily: MONO, fontSize: 24, color: C.text, marginTop: 10 }}>tx {String(data.tx).slice(0, 10)}…{String(data.tx).slice(-6)} · <span style={{ color: C.green }}>success</span></div>
            <div style={{ fontFamily: MONO, fontSize: 21, color: C.muted, marginTop: 6 }}>signed only by your PayBox wallet {t.wallet.slice(0, 4)}…{t.wallet.slice(-4)}</div>
          </Panel>
        </div>
      </div>
    </Center>
  );
};

const Shipped: React.FC = () => {
  const seven = cue("shipped", /seven/);
  const live = cue("shipped", /live/);
  return (
    <Center>
      <div style={{ display: "flex", gap: 36, alignItems: "flex-start" }}>
        <Shot src="portal-checks.png" imgW={1627} crop={[200, 60, 1260, 600]} width={880} url="developer.paybox.sh/dashboard">
          {(m) => <ImgAnno m={m} at={seven} box={[262, 522, 180, 38]} color={C.green} note="7 tools, hosted checks ✓" noteAt={[600, 610]} />}
        </Shot>
        <Shot src="portal-submitted.png" imgW={1533} crop={[90, 60, 1230, 545]} width={880} url="developer.paybox.sh/dashboard" style={{ marginTop: 40 }}>
          {(m) => (
            <>
              <ImgAnno m={m} at={live} box={[1170, 118, 115, 40]} color={C.green} note="submitted" noteAt={[1000, 250]} />
              <ImgAnno m={m} at={live + 12} kind="underline" box={[212, 488, 425, 30]} color={C.green} />
            </>
          )}
        </Shot>
      </div>
    </Center>
  );
};

const TOOLS = ["oddshot_play", "odds_movers", "narrative_tokens", "check_token", "why_pumping", "my_bags", "ape"];
const Outro: React.FC = () => {
  const f = useCurrentFrame();
  const s = spring({ frame: f, fps: FPS, config: { damping: 14 } });
  return (
    <Center gap={40}>
      <div style={{ display: "flex", alignItems: "center", gap: 26, opacity: s, transform: `scale(${0.85 + 0.15 * s})` }}>
        <TargetMark size={100} />
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 110, letterSpacing: 4, color: C.text }}>ODDSHOT</div>
      </div>
      <Words text="The odds moved. The memes haven't. Yet." delay={cue("outro", /odds/)} size={68} />
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 14, maxWidth: 1500 }}>
        {TOOLS.map((t, i) => <Chip key={t} color={t === "oddshot_play" ? C.green : C.cyan} size={26} style={{ opacity: fade(f, 30 + i * 4, 40 + i * 4) }}>{t}</Chip>)}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 22, letterSpacing: 3, color: C.muted, opacity: fade(f, 60, 80) }}>
        LIVE ON PAYBOX · POLYMARKET · RUGCHECK · JUPITER · SOLANA
      </div>
      <div style={{ fontFamily: MONO, fontSize: 20, letterSpacing: 3, color: C.green, opacity: fade(f, 75, 95) }}>BUILT FOR THE MOONPAY × PAYBOX HACKATHON</div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, opacity: fade(f, 40, 60), transform: `translateY(${(1 - fade(f, 40, 60)) * 14}px)` }}>
        <span style={{ fontFamily: DISPLAY, fontSize: 34, color: C.muted }}>by</span>
        <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 38, color: C.text }}>Dappest Dev</span>
        <Chip color={C.cyan} size={30}>𝕏 @sentinel_dapper</Chip>
      </div>
    </Center>
  );
};

const SCENES: Record<string, React.FC> = { swarm: Swarm, hook: Hook, receipt: Receipt, bags: Bags, signal: Signal, intro: Intro, board: Board, play: Play, sources: Sources, crosscheck: Crosscheck, red: Red, ape: ApeLive, shipped: Shipped, outro: Outro };

// ---------- Global overlays ----------

const KEY = /^(Oddshot|PayBox|PayBox's|Polymarket|Solana|RugCheck|Jupiter|Jupiter's|early|GTA|6|seven|passkey|window|gap|Claude|ChatGPT|Grok|twenty|follow|first|confirmed|approve|real|OG|swarm|frenzy|thirty-five)$/i;
const Captions: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const l = LINES.find((x) => t >= x.start - 0.1 && t <= x.start + x.dur + 0.3);
  if (!l || l.id === "hook") return null;
  const rel = t - l.start;
  return (
    <div style={{ position: "absolute", bottom: 34, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
      <div style={{ maxWidth: 1760, display: "flex", flexWrap: "wrap", justifyContent: "center", columnGap: 11, rowGap: 2, padding: "10px 26px",
        background: "rgba(7,9,12,0.82)", borderRadius: 16, fontFamily: DISPLAY, fontWeight: 700, fontSize: 35, lineHeight: 1.25 }}>
        {l.words.map((w, i) => {
          const on = rel >= w.t && rel < w.t + Math.max(w.d, 0.12) + 0.06;
          const said = rel >= w.t;
          const color = /^red$/i.test(w.w) ? C.red : /^yellow$/i.test(w.w) ? C.yellow : KEY.test(w.w) ? C.green : C.text;
          return (
            <span key={i} style={{ color: said ? color : "#4A5361", padding: "0 6px", borderRadius: 8,
              background: on ? "rgba(61,255,160,0.16)" : "transparent", transform: on ? "translateY(-2px)" : undefined }}>{w.disp ?? w.w}</span>
          );
        })}
      </div>
    </div>
  );
};

const Chrome: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const current = [...LINES].reverse().find((l) => t >= l.start - 0.3) ?? LINES[0]!;
  const since = Math.round((t - current.start + 0.3) * FPS);
  const first = LINES.find((l) => l.chapter === current.chapter)!;
  const chapterFade = first.id === current.id ? fade(since, 0, 12) : 1;
  const [num, ...rest] = current.chapter.split(" · ");
  return (
    <>
      <div style={{ position: "absolute", top: 34, left: 48, display: "flex", alignItems: "center", gap: 14 }}>
        <TargetMark size={36} />
        <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 30, color: C.text }}>Oddshot</span>
        <span style={{ fontFamily: MONO, fontSize: 18, color: C.muted, marginLeft: 6 }}>· PayBox plugin</span>
      </div>
      <div style={{ position: "absolute", top: 42, right: 52, fontFamily: MONO, fontSize: 20, letterSpacing: 4, opacity: chapterFade }}>
        <span style={{ color: C.green }}>{num}</span><span style={{ color: C.muted }}> · {rest.join(" · ")}</span>
      </div>
      <div style={{ position: "absolute", bottom: 0, left: 0, height: 5, width: `${(f / DEMO_FRAMES) * 100}%`, background: C.green, boxShadow: `0 0 12px ${C.green}` }} />
    </>
  );
};

export const OddshotDemo: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Bg />
    {LINES.map((l, i) => {
      const from = i === 0 ? 0 : Math.round((l.start - 0.25) * FPS);
      const next = LINES[i + 1];
      const to = next ? Math.round((next.start - 0.25) * FPS) : DEMO_FRAMES;
      const El = SCENES[l.id]!;
      const lead = Math.round(l.start * FPS) - from;
      return (
        <Sequence key={l.id} from={from} durationInFrames={to - from}>
          <SceneFade dur={to - from}><Sequence from={lead} layout="none"><El /></Sequence></SceneFade>
        </Sequence>
      );
    })}
    <Chrome />
    <Captions />
  </AbsoluteFill>
);

const SceneFade: React.FC<{ dur: number; children: React.ReactNode }> = ({ dur, children }) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{ opacity: Math.min(fade(f, 0, 7), 1 - fade(f, dur - 7, dur)) }}>{children}</AbsoluteFill>;
};

export const Thumb: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Bg />
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 40 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        <TargetMark size={120} />
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 130, letterSpacing: 5, color: C.text }}>ODDSHOT</div>
      </div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 100, letterSpacing: -3, lineHeight: 1.04, textAlign: "center", color: C.text }}>
        The odds moved.<br /><span style={{ color: C.green, textShadow: `0 0 40px ${C.green}66` }}>The memes haven't. Yet.</span>
      </div>
      <div style={{ display: "flex", gap: 16 }}>
        {["Polymarket odds", "Solana memes", "3-source seatbelt", "PayBox approval"].map((t, i) => <Chip key={t} color={i === 3 ? C.green : C.cyan} size={30}>{t}</Chip>)}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 28, letterSpacing: 2, color: C.muted }}>by Dappest Dev · @sentinel_dapper</div>
    </AbsoluteFill>
  </AbsoluteFill>
);
