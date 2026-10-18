import React from "react";
import { AbsoluteFill, Easing, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import raw from "./data.json";

export const { fontFamily: DISPLAY } = loadDisplay("normal", { weights: ["500", "700"], subsets: ["latin"] });
export const { fontFamily: MONO } = loadMono("normal", { weights: ["400", "700"], subsets: ["latin"] });

export const C = {
  bg: "#07090C", panel: "#0D1116", panel2: "#121820", line: "#1E2732", grid: "#10161D",
  text: "#EEF2F6", muted: "#7B8594", green: "#3DFFA0", yellow: "#FFD449", red: "#FF4F64", cyan: "#5CC8FF",
};

// ---------- Real captured data (scripts/capture.mjs) ----------
export const data = raw as any;
export const mover = data.play?.mover ?? {};
export const token = data.play?.token ?? {};
const prob: number = mover.probabilityPct ?? 0;
const delta: number = mover.changePts ?? 0;
const before = Math.round((prob - delta) * 10) / 10;
export const split = (s?: string) => (s ?? "").split("\n").filter((l) => l.trim());
export const short = (a = "") => `${a.slice(0, 4)}…${a.slice(-4)}`;
const via: string = data.via ?? "agent ▸ oddshot";
const apeVia: string = data.apeVia ?? via;
const tx: string | undefined = data.tx;
export const [redHead = "", ...redRest] = String(data.red?.text ?? "").replace(/^Seatbelt engaged:\s*/, "").split(/\.\s+/);
export const redReasons = redRest.join(". ").split(/;\s*/).map((r) => r.replace(/\.$/, "")).filter(Boolean).slice(0, 3);

const SCENES = { hook: 150, meme: 105, logo: 100, board: 360, seatbelt: 300, ape: 270, outro: 180 };
export const DURATION = Object.values(SCENES).reduce((a, b) => a + b, 0);

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const fade = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], clamp);
export function useIn(delay = 0, damping = 200) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - delay, fps, config: { damping } });
}

// ---------- Primitives ----------

export const Bg: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill style={{
        backgroundImage: `linear-gradient(${C.grid} 1px, transparent 1px), linear-gradient(90deg, ${C.grid} 1px, transparent 1px)`,
        backgroundSize: "72px 72px", backgroundPosition: `0px ${f * 0.5}px`,
        WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, black 20%, transparent 80%)",
      }} />
      <AbsoluteFill style={{ background: `radial-gradient(900px 520px at ${50 + 12 * Math.sin(f / 70)}% ${42 + 6 * Math.cos(f / 90)}%, rgba(61,255,160,0.09), transparent 70%)` }} />
    </AbsoluteFill>
  );
};

const Scene: React.FC<{ dur: number; children: React.ReactNode }> = ({ dur, children }) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{ opacity: Math.min(fade(f, 0, 8), 1 - fade(f, dur - 8, dur)) }}>{children}</AbsoluteFill>;
};

export const Words: React.FC<{ text: string; delay?: number; size?: number; color?: string }> = ({ text, delay = 0, size = 96, color = C.text }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ fontFamily: DISPLAY, fontSize: size, fontWeight: 700, color, letterSpacing: -size * 0.03, lineHeight: 1.05,
      display: "flex", flexWrap: "wrap", justifyContent: "center", columnGap: size * 0.26 }}>
      {text.split(" ").map((w, i) => {
        const s = spring({ frame: f - delay - i * 4, fps, config: { damping: 16, stiffness: 150 } });
        return <span key={i} style={{ display: "inline-block", opacity: Math.min(1, s * 1.4), transform: `translateY(${(1 - s) * 50}px)` }}>{w}</span>;
      })}
    </div>
  );
};

const Kicker: React.FC<{ children: React.ReactNode; color?: string; delay?: number }> = ({ children, color = C.green, delay = 0 }) => {
  const f = useCurrentFrame();
  const s = useIn(delay);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: MONO, fontSize: 24, letterSpacing: 4, color: C.muted, opacity: s, textTransform: "uppercase" }}>
      <span style={{ width: 12, height: 12, borderRadius: 6, background: color, boxShadow: `0 0 ${14 + 8 * Math.sin(f / 5)}px ${color}` }} />
      {children}
    </div>
  );
};

export const Caption: React.FC<{ children: React.ReactNode; delay?: number; size?: number }> = ({ children, delay = 0, size = 50 }) => {
  const s = useIn(delay);
  return (
    <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: size, color: C.text, letterSpacing: -1, textAlign: "center",
      opacity: s, transform: `translateY(${(1 - s) * 20}px)` }}>{children}</div>
  );
};

export const Panel: React.FC<{ style?: React.CSSProperties; children: React.ReactNode }> = ({ style, children }) => (
  <div style={{ background: `linear-gradient(180deg, ${C.panel2}, ${C.panel})`, border: `1px solid ${C.line}`, borderRadius: 28,
    boxShadow: "0 30px 80px rgba(0,0,0,0.55)", ...style }}>{children}</div>
);

export const Chip: React.FC<{ color: string; children: React.ReactNode; size?: number; style?: React.CSSProperties }> = ({ color, children, size = 40, style }) => (
  <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: size, color, background: `${color}1A`, border: `2px solid ${color}66`,
    padding: "6px 20px", borderRadius: 999, display: "inline-block", ...style }}>{children}</span>
);

export const TargetMark: React.FC<{ size: number; spin?: number }> = ({ size, spin = 0 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={{ transform: `rotate(${spin}deg)`, filter: `drop-shadow(0 0 18px ${C.green}88)` }}>
    <circle cx="50" cy="50" r="42" fill="none" stroke={C.green} strokeWidth="5" />
    <circle cx="50" cy="50" r="26" fill="none" stroke={C.green} strokeWidth="5" opacity="0.65" />
    <circle cx="50" cy="50" r="9" fill={C.green} />
    {[0, 90, 180, 270].map((a) => <line key={a} x1="50" y1="2" x2="50" y2="16" stroke={C.green} strokeWidth="5" transform={`rotate(${a} 50 50)`} />)}
  </svg>
);

// Terminal text: emoji become drawn dots/glyphs (headless Chrome has no colour emoji); status words get colours.
const DOTS: Record<string, string> = { "🟢": C.green, "🟡": C.yellow, "🔴": C.red };
const WORDS: Record<string, string> = { EARLY: C.green, GREEN: C.green, RUNNING: C.cyan, YELLOW: C.yellow, LATE: C.yellow, FADING: C.red, RED: C.red, NO_MEME: C.muted };
export const Rich: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(/(🟢|🟡|🔴|🎯|🛡️?|👜|⚠️?|\b(?:EARLY|GREEN|RUNNING|YELLOW|LATE|FADING|RED|NO_MEME)\b)/u).map((p, i) => {
      if (!p || p === "👜") return null;
      if (DOTS[p]) return <span key={i} style={{ display: "inline-block", width: "0.6em", height: "0.6em", borderRadius: "50%", background: DOTS[p], boxShadow: `0 0 10px ${DOTS[p]}`, margin: "0 0.12em", verticalAlign: "0.02em" }} />;
      if (p === "🎯") return <span key={i} style={{ color: C.green }}>◎</span>;
      if (p.startsWith("🛡")) return <span key={i} style={{ color: C.green }}>◆</span>;
      if (p.startsWith("⚠")) return <span key={i} style={{ color: C.yellow }}>▲</span>;
      if (WORDS[p]) return <span key={i} style={{ color: WORDS[p], fontWeight: 700 }}>{p}</span>;
      return <span key={i}>{p}</span>;
    })}
  </>
);

export const Terminal: React.FC<{
  title: string; ask?: string; call: string; lines: string[]; start?: number; every?: number;
  isHighlighted?: (i: number) => boolean; width?: number; fontSize?: number;
}> = ({ title, ask, call, lines, start = 0, every = 5, isHighlighted, width = 1600, fontSize = 24 }) => {
  const f = useCurrentFrame();
  const s = useIn(start);
  const askAt = start + 8;
  const callAt = askAt + (ask ? Math.ceil(ask.length / 2) + 8 : 0);
  const outAt = callAt + Math.ceil(call.length / 1.6) + 14;
  return (
    <Panel style={{ width, overflow: "hidden", opacity: s, transform: `translateY(${(1 - s) * 40}px)` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 24px", borderBottom: `1px solid ${C.line}`, background: "#0A0E13" }}>
        {[C.red, C.yellow, C.green].map((c) => <span key={c} style={{ width: 14, height: 14, borderRadius: 7, background: c, opacity: 0.8 }} />)}
        <span style={{ marginLeft: 16, fontFamily: MONO, fontSize: 20, color: C.muted }}>{title}</span>
      </div>
      <div style={{ padding: "22px 34px 26px", fontFamily: MONO, fontSize, lineHeight: 1.5, color: C.text, whiteSpace: "pre-wrap" }}>
        {ask && <div style={{ color: C.muted, marginBottom: 6 }}><span style={{ color: C.cyan }}>you › </span>{ask.slice(0, Math.max(0, Math.floor((f - askAt) * 2)))}</div>}
        {f >= callAt && (
          <div style={{ marginBottom: 10 }}>
            <span style={{ color: C.green }}>⚙ </span>{call.slice(0, Math.max(0, Math.floor((f - callAt) * 1.6)))}
            {f < outAt && <span style={{ color: C.green, opacity: Math.floor(f / 7) % 2 }}>▋</span>}
          </div>
        )}
        {lines.map((l, i) => {
          const at = outAt + i * every;
          if (f < at) return null;
          const o = fade(f, at, at + 6);
          const hl = isHighlighted?.(i) ? fade(f, outAt + lines.length * every + 6, outAt + lines.length * every + 20) : 0;
          return (
            <div key={i} style={{ opacity: o, transform: `translateX(${(1 - o) * -12}px)`, margin: "0 -34px", padding: "0 34px",
              background: hl ? `rgba(61,255,160,${0.13 * hl})` : undefined, boxShadow: hl ? `inset ${5 * hl}px 0 0 ${C.green}` : undefined,
              color: /NO_MEME|^Next:|^Unsigned/.test(l) ? C.muted : C.text }}>
              <Rich text={l} />
            </div>
          );
        })}
      </div>
    </Panel>
  );
};

// ---------- Scenes ----------

const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const s = useIn(4);
  const t = interpolate(f, [24, 84], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 0, 0, 1) });
  const value = before + (prob - before) * t;
  const up = delta > 0;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 48 }}>
      <Kicker color={C.cyan}>Polymarket · odds swing in the last 24h</Kicker>
      <Panel style={{ width: 1320, padding: "40px 52px 46px", opacity: s, transform: `scale(${0.94 + 0.06 * s})` }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 36, color: C.text, fontWeight: 500, lineHeight: 1.3 }}>{mover.question}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 30, marginTop: 22 }}>
          <div style={{ fontFamily: MONO, fontSize: 132, fontWeight: 700, color: C.text, letterSpacing: -4 }}>{value.toFixed(1)}%</div>
          <Chip color={up ? C.green : C.red} style={{ opacity: fade(f, 80, 92), transform: `scale(${0.7 + 0.3 * fade(f, 80, 92)})` }}>
            {up ? "▲ +" : "▼ "}{Math.abs(delta)} pts
          </Chip>
        </div>
        <div style={{ marginTop: 22, height: 18, borderRadius: 9, background: "#1A212B", overflow: "hidden" }}>
          <div style={{ width: `${value}%`, height: "100%", borderRadius: 9, background: `linear-gradient(90deg, ${C.cyan}, ${C.green})`, boxShadow: `0 0 24px ${C.green}88` }} />
        </div>
      </Panel>
      <Words text="The odds moved." delay={92} size={116} />
    </AbsoluteFill>
  );
};

const Meme: React.FC = () => {
  const f = useCurrentFrame();
  const s = useIn(0);
  const { fps } = useVideoConfig();
  const yet = spring({ frame: f - 50, fps, config: { damping: 9, stiffness: 160 } });
  const ch: number = token.change6hPct ?? 0;
  const draw = fade(f, 6, 40);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 46 }}>
      <Kicker color={C.yellow}>The Solana meme riding that story</Kicker>
      <Panel style={{ width: 1120, padding: "34px 48px", opacity: s, transform: `scale(${0.95 + 0.05 * s})` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 92, color: C.text }}>${token.symbol ?? "MEME"}</div>
          <div style={{ fontFamily: MONO, fontSize: 46, color: Math.abs(ch) < 15 ? C.yellow : ch > 0 ? C.green : C.red }}>
            {ch > 0 ? "+" : ""}{ch.toFixed(1)}% <span style={{ color: C.muted, fontSize: 28 }}>6h</span>
          </div>
        </div>
        <svg width="1024" height="70" style={{ marginTop: 10, display: "block" }}>
          <line x1="0" y1="35" x2={1024 * draw} y2="35" stroke={C.muted} strokeWidth="4" strokeDasharray="12 12" />
          <circle cx={1024 * draw} cy="35" r="9" fill={C.yellow} opacity={draw} />
        </svg>
      </Panel>
      <div style={{ display: "flex", gap: 34, alignItems: "baseline" }}>
        <Words text="The meme hasn't." delay={14} size={112} />
        <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 112, color: C.green, display: "inline-block",
          transform: `scale(${yet})`, opacity: Math.min(1, yet * 2), textShadow: `0 0 40px ${C.green}` }}>Yet.</span>
      </div>
    </AbsoluteFill>
  );
};

const Logo: React.FC = () => {
  const f = useCurrentFrame();
  const s = useIn(0, 14);
  const t = useIn(18);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 30 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 36, transform: `scale(${0.8 + 0.2 * s})`, opacity: Math.min(1, s * 1.5) }}>
        <TargetMark size={150} spin={(1 - s) * -180} />
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 170, letterSpacing: 6, color: C.text }}>ODDSHOT</div>
      </div>
      <div style={{ fontFamily: DISPLAY, fontSize: 46, color: C.muted, opacity: t, transform: `translateY(${(1 - t) * 20}px)` }}>
        Prediction-market odds → memecoin plays. <span style={{ color: C.green }}>With a seatbelt.</span>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 24, letterSpacing: 5, color: C.muted, opacity: fade(f, 40, 55) }}>A PAYBOX PLUGIN FOR AI AGENTS</div>
    </AbsoluteFill>
  );
};

const Board: React.FC = () => {
  const lines = split(data.board?.text);
  const idx = lines.findIndex((l) => /\b(EARLY|RUNNING)\b/.test(l));
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 30, padding: 50 }}>
      <Caption>One call. Odds swing → meme → seatbelt → timing.</Caption>
      <Terminal title={via} ask="What's the odds-to-meme board right now?" call="oddshot_play({})" lines={lines}
        start={6} every={4} fontSize={23} isHighlighted={(i) => idx >= 0 && i >= idx && i <= idx + 2} />
    </AbsoluteFill>
  );
};

const SOURCES = [
  ["DexScreener", "liquidity · age · price action"],
  ["RugCheck", "LP lock · insiders · holders"],
  ["Jupiter audit", "mint/freeze authority · dev history · bot volume"],
] as const;

const Seatbelt: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const stampAt = 175;
  const stamp = spring({ frame: f - stampAt, fps, config: { damping: 11, stiffness: 170 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 36, padding: 60 }}>
      <Caption>Triple-checked before you ape.</Caption>
      <div style={{ display: "flex", gap: 36, alignItems: "stretch" }}>
        <Terminal title={`${via} ▸ seatbelt`} call={`check_token({ mint: "${short(token.mint)}" })`} lines={split(data.check?.text)}
          start={4} every={6} width={1020} fontSize={25} />
        <div style={{ display: "flex", flexDirection: "column", gap: 20, justifyContent: "center" }}>
          {SOURCES.map(([name, what], i) => {
            const s = useIn(80 + i * 16, 14);
            return (
              <Panel key={name} style={{ width: 560, padding: "22px 28px", display: "flex", gap: 20, alignItems: "center", opacity: Math.min(1, s * 1.5), transform: `translateX(${(1 - s) * 60}px)` }}>
                <span style={{ width: 44, height: 44, borderRadius: 22, background: `${C.green}22`, border: `2px solid ${C.green}`, color: C.green,
                  fontFamily: MONO, fontWeight: 700, fontSize: 26, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</span>
                <div>
                  <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 32, color: C.text }}>{name}</div>
                  <div style={{ fontFamily: MONO, fontSize: 19, color: C.muted, marginTop: 4 }}>{what}</div>
                </div>
              </Panel>
            );
          })}
        </div>
      </div>
      {f >= stampAt && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 40, background: `rgba(7,9,12,${0.93 * Math.min(1, stamp)})` }}>
          <div style={{ transform: `rotate(-3deg) scale(${2 - stamp})`, opacity: Math.min(1, stamp * 1.5), border: `6px solid ${C.red}`, borderRadius: 26,
            padding: "36px 64px", background: "rgba(255,79,100,0.08)", textAlign: "center", boxShadow: `0 0 90px ${C.red}55` }}>
            <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 112, color: C.red, letterSpacing: 4 }}>SEATBELT ENGAGED</div>
            <div style={{ fontFamily: MONO, fontSize: 36, color: C.text, marginTop: 14 }}>{redHead}. Buy refused.</div>
            {redReasons.map((r) => <div key={r} style={{ fontFamily: MONO, fontSize: 26, color: C.muted, marginTop: 8 }}>✕ {r}</div>)}
          </div>
          <div style={{ opacity: fade(f, stampAt + 30, stampAt + 45) }}>
            <Caption size={44}>RED tokens can't be bought. Exits are never blocked.</Caption>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

const Ape: React.FC = () => {
  const f = useCurrentFrame();
  const card = useIn(150, 16);
  // The ✓ state only renders for a real confirmed transaction (data.tx from the PayBox run).
  const done = tx ? fade(f, 200, 214) : 0;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 32, padding: 60 }}>
      <Caption>Ape in. Nothing signs without you.</Caption>
      <Terminal title={apeVia} ask={`Ape 0.005 SOL into $${token.symbol ?? ""}`} call={`ape({ mint: "${short(token.mint)}", amount: "0.005", payWith: "SOL" })`}
        lines={split(data.ape?.text)} start={4} every={7} width={1500} fontSize={25} />
      <Panel style={{ width: 1500, padding: "26px 34px", display: "flex", alignItems: "center", gap: 28, opacity: card, transform: `translateY(${(1 - card) * 30}px)`,
        borderColor: done ? `${C.green}88` : C.line }}>
        <svg width="64" height="64" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="29" fill="none" stroke={done ? C.green : C.cyan} strokeWidth="4" />
          {done ? <path d="M19 33 L28 42 L46 23" fill="none" stroke={C.green} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray="44" strokeDashoffset={44 * (1 - done)} />
            : [10, 16, 22].map((r) => <path key={r} d={`M${32 - r / 1.5} ${44 - r / 3} a${r} ${r} 0 0 1 ${(r / 1.5) * 2} 0`} fill="none" stroke={C.cyan} strokeWidth="3.5" strokeLinecap="round" />)}
        </svg>
        <div style={{ fontFamily: DISPLAY, fontSize: 38, fontWeight: 700, color: done ? C.green : C.text }}>
          {done ? "Approved · confirmed on Solana" : "Unsigned proposal → PayBox asks for your passkey"}
        </div>
        {done > 0 && tx && <div style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 24, color: C.muted, opacity: done }}>tx {short(tx)}</div>}
      </Panel>
    </AbsoluteFill>
  );
};

const TOOLS = ["oddshot_play", "odds_movers", "narrative_tokens", "check_token", "why_pumping", "my_bags", "ape"];

const Outro: React.FC = () => {
  const f = useCurrentFrame();
  const s = useIn(0, 14);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 46 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 24, opacity: s, transform: `scale(${0.85 + 0.15 * s})` }}>
        <TargetMark size={90} />
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 96, letterSpacing: 4, color: C.text }}>ODDSHOT</div>
      </div>
      <Words text="The odds moved. The memes haven't. Yet." delay={10} size={72} />
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 16, maxWidth: 1500 }}>
        {TOOLS.map((t, i) => <Chip key={t} color={t === "oddshot_play" ? C.green : C.cyan} size={28}
          style={{ opacity: fade(f, 40 + i * 5, 50 + i * 5), transform: `translateY(${(1 - fade(f, 40 + i * 5, 50 + i * 5)) * 16}px)` }}>{t}</Chip>)}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 24, letterSpacing: 3, color: C.muted, opacity: fade(f, 90, 110) }}>
        POLYMARKET · DEXSCREENER · RUGCHECK · JUPITER · SOLANA — BUILT FOR THE PAYBOX HACKATHON
      </div>
    </AbsoluteFill>
  );
};

export const Oddshot: React.FC = () => {
  const order: [keyof typeof SCENES, React.FC][] = [
    ["hook", Hook], ["meme", Meme], ["logo", Logo], ["board", Board], ["seatbelt", Seatbelt], ["ape", Ape], ["outro", Outro],
  ];
  let from = 0;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Bg />
      {order.map(([key, El]) => {
        const at = from;
        from += SCENES[key];
        return (
          <Sequence key={key} from={at} durationInFrames={SCENES[key]}>
            <Scene dur={SCENES[key]}><El /></Scene>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
