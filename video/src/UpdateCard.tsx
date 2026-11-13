import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { Oddy, INK } from "./Cast";
import { Paper, Frame, Caption, Burst, SFXF, LETTER, K } from "./Comic";

// The "24 hours of Oddshot" patch-notes card for X (1600x900), in the motion comic's ink style.
// Screenshots are crops of the real ChatGPT + PayBox runs (public/update/shot-*.png); WIF $137K → $5.4M is
// check_token on WIF before (v1.3.1) and after (v1.3.3) the update. Logos are PayBox's and MoonPay's own.
const Tone: React.FC<{ w: number; h: number; bg: string; dot: string; id: string }> = ({ w, h, bg, dot, id }) => (
  <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
    <defs><pattern id={id} width={11} height={11} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx={5.5} cy={5.5} r={2.6} fill={dot} /></pattern></defs>
    <rect width={w} height={h} fill={bg} />
    <path d={`M0,${h * 0.62} L${w},${h * 0.3} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} opacity={0.55} />
  </svg>
);
const Balloon: React.FC<{ x: number; y: number; w: number; tx: number; ty: number; size?: number; bg?: string; children: React.ReactNode }> = ({ x, y, w, tx, ty, size = 24, bg = "#fff", children }) => (
  <div style={{ position: "absolute", left: x, top: y, width: w }}>
    <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }} width={1} height={1}>
      <path d={`M${w * 0.38},40 L${tx},${ty} L${w * 0.6},40 Z`} fill={bg} stroke={INK} strokeWidth={4} strokeLinejoin="round" />
    </svg>
    <div style={{ position: "relative", background: bg, border: `4px solid ${INK}`, borderRadius: "50%", padding: "16px 20px", textAlign: "center", fontFamily: LETTER, fontWeight: 700,
      fontSize: size, color: INK, textTransform: "uppercase", lineHeight: 1.1 }}>{children}</div>
  </div>
);
const Logo: React.FC<{ src: string; size: number }> = ({ src, size }) => (
  <Img src={staticFile(`update/${src}`)} style={{ width: size, height: size, borderRadius: size * 0.22, border: "3px solid #fff", display: "block", flexShrink: 0 }} />
);
/** A real screenshot, inked and tagged. */
const Shot: React.FC<{ src: string; w: number; h: number; tagTop?: boolean; children?: React.ReactNode }> = ({ src, w, h, tagTop, children }) => (
  <div style={{ position: "relative", width: w, height: h, border: `5px solid ${INK}`, borderRadius: 10, overflow: "hidden", background: "#000", boxShadow: `5px 5px 0 ${INK}`, flexShrink: 0 }}>
    <Img src={staticFile(`update/${src}`)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "left top", display: "block" }} />
    <div style={{ position: "absolute", right: 6, ...(tagTop ? { top: 6 } : { bottom: 6 }), background: "#FFFDF4", border: `2px solid ${INK}`, padding: "0 6px", fontFamily: LETTER, fontWeight: 700, fontSize: 13, color: INK }}>REAL RUN</div>
    {children}
  </div>
);
const Radar: React.FC<{ w: number; h: number }> = ({ w, h }) => (
  <div style={{ width: w, height: h, border: `5px solid ${INK}`, borderRadius: 10, background: "#0E2A3A", boxShadow: `5px 5px 0 ${INK}`, position: "relative", overflow: "hidden", flexShrink: 0 }}>
    <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
      {[44, 30, 16].map((r) => <circle key={r} cx={56} cy={h / 2 - 2} r={r} fill="none" stroke={K.green} strokeWidth={3} opacity={0.6} />)}
      <path d={`M56,${h / 2 - 2} L56,${h / 2 - 46} A44,44 0 0 1 96,${h / 2 - 20} Z`} fill={K.green} opacity={0.45} />
      {[[76, 42], [38, 74], [70, 82]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={7} fill={K.yellow} stroke={INK} strokeWidth={3} />)}
    </svg>
    <div style={{ position: "absolute", left: 110, top: 20, display: "flex", flexDirection: "column", gap: 10 }}>
      {["ON-CHAIN ✓", "POLYMARKET ✓"].map((t) => (
        <div key={t} style={{ background: K.green, border: `3px solid ${INK}`, padding: "2px 8px", fontFamily: SFXF, fontSize: 21, letterSpacing: 1, color: INK, whiteSpace: "nowrap" }}>{t}</div>
      ))}
    </div>
  </div>
);
const Stamp: React.FC<{ x: number; y: number; text: string; color?: string; size?: number; rot?: number }> = ({ x, y, text, color = "#13A35E", size = 26, rot = -8 }) => (
  <div style={{ position: "absolute", left: x, top: y, transform: `rotate(${rot}deg)`, border: `4px solid ${color}`, color, background: "#FFFDF4ee", fontFamily: SFXF, fontSize: size, letterSpacing: 2,
    padding: "0 10px", boxShadow: `3px 3px 0 ${INK}`, whiteSpace: "nowrap" }}>{text}</div>
);

const NEW: { name: string; bg: string; dot: string; art: React.ReactNode; a: string; b: string }[] = [
  { name: "RADAR", bg: "#C9F1FF", dot: "#97D9F0", art: <Radar w={286} h={124} />, a: "STORIES HEATING UP", b: "ON BOTH CROWDS" },
  { name: "LAG CHECK", bg: "#D9CCFF", dot: "#B7A5F2", art: <Shot src="shot-lag.png" w={286} h={124} tagTop />, a: "$ANT ODDS 22% → 61%", b: "MEME +15% NEXT DAY" },
  { name: "RECEIPTS", bg: "#C2F5DA", dot: "#93E2B9", art: <Shot src="shot-receipt.png" w={286} h={124}><Stamp x={196} y={10} text="HIT!" size={30} rot={8} /></Shot>, a: "$GTA6 CALL, OCT 16", b: "HIT · +148%" },
];
const CHIPS = ["Pool-depth sizing", "Volatility exit plans", "Smarter matching", "Clear errors"];

export const UpdateCard: React.FC = () => (
  <AbsoluteFill>
    <Paper />
    {/* hero */}
    <Frame x={28} y={28} w={972} h={492} rot={-0.4}>
      <Burst w={972} h={492} cx={790} cy={330} a="#FFD23F" b="#FFBE1A" n={30} />
      <Caption x={26} y={20} rot={-1.5} size={24} bg="#fff">Patch notes · Sat, Oct 24</Caption>
      <div style={{ position: "absolute", left: 30, top: 70, fontFamily: SFXF, fontSize: 176, lineHeight: 1, color: "#fff", letterSpacing: 8, WebkitTextStroke: `10px ${INK}`,
        paintOrder: "stroke fill", textShadow: `10px 10px 0 ${INK}`, transform: "rotate(-2deg)" }}>ODDSHOT</div>
      <div style={{ position: "absolute", left: 38, top: 258, background: INK, color: "#fff", padding: "8px 18px", fontFamily: SFXF, fontSize: 46, letterSpacing: 3, transform: "rotate(-1deg)",
        display: "flex", alignItems: "center", gap: 14 }}>
        v1.3.3 IS LIVE ON <Logo src="paybox-logo.png" size={46} /><span style={{ color: K.yellow }}>PAYBOX</span>
      </div>
      {[["24", "HOURS"], ["5", "RELEASES"], ["7→10", "TOOLS"]].map(([n, l], i) => (
        <div key={l} style={{ position: "absolute", left: 38 + i * 190, top: 352, width: 172, height: 112, background: i === 2 ? K.green : "#fff", border: `6px solid ${INK}`, borderRadius: 14,
          boxShadow: `6px 6px 0 ${INK}`, transform: `rotate(${[-2, 1.5, -1][i]}deg)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: SFXF, color: INK }}>
          <div style={{ fontSize: 64, lineHeight: 0.95 }}>{n}</div>
          <div style={{ fontSize: 26, letterSpacing: 2 }}>{l}</div>
        </div>
      ))}
      <Oddy size={250} mood="calm" look={{ x: -0.5, y: 0.1 }} ink style={{ position: "absolute", left: 680, top: 222 }} />
      <Balloon x={736} y={64} w={214} tx={120} ty={160} size={23} bg="#E3FFF0">I got sharper overnight.</Balloon>
    </Frame>
    {/* three new tools, each with its real run */}
    {NEW.map((t, i) => (
      <Frame key={t.name} x={1020} y={28 + i * 170} w={552} h={152} rot={[0.6, -0.4, 0.5][i]}>
        <Tone w={552} h={152} bg={t.bg} dot={t.dot} id={`new${i}`} />
        <div style={{ position: "absolute", left: 12, top: 10 }}>{t.art}</div>
        <div style={{ position: "absolute", left: 316, top: 8, background: K.red, color: "#fff", border: `3px solid ${INK}`, padding: "0 10px", fontFamily: SFXF, fontSize: 22, letterSpacing: 2,
          transform: "rotate(-5deg)" }}>NEW</div>
        <div style={{ position: "absolute", left: 316, top: 38, fontFamily: SFXF, fontSize: t.name.length > 7 ? 40 : 44, letterSpacing: 2, color: INK, lineHeight: 1 }}>{t.name}</div>
        <div style={{ position: "absolute", left: 316, top: 86, fontFamily: SFXF, fontSize: 21, letterSpacing: 1, color: INK, lineHeight: 1.1 }}>{t.a}</div>
        <div style={{ position: "absolute", left: 316, top: 110, fontFamily: SFXF, fontSize: 24, letterSpacing: 1, color: "#13A35E", lineHeight: 1.1 }}>{t.b}</div>
      </Frame>
    ))}
    {/* sharper under the hood */}
    <Frame x={28} y={542} w={972} h={226} rot={0.3} bg="#FFF8E7">
      <Tone w={972} h={226} bg="#FFF8E7" dot="#F2DFB0" id="fixTone" />
      <Caption x={18} y={14} rot={-1.5} size={24}>Sharper under the hood</Caption>
      <div style={{ position: "absolute", left: 26, top: 74, fontFamily: SFXF, fontSize: 32, letterSpacing: 2, color: INK }}>READS EVERY POOL · WIF LIQUIDITY</div>
      <div style={{ position: "absolute", left: 26, top: 112, display: "flex", alignItems: "center", gap: 18, fontFamily: SFXF }}>
        <span style={{ fontSize: 58, color: K.red, textDecoration: "line-through", textDecorationThickness: 6 }}>$137K</span>
        <span style={{ fontSize: 50, color: INK }}>→</span>
        <span style={{ fontSize: 92, color: "#13A35E", WebkitTextStroke: `3px ${INK}`, paintOrder: "stroke fill", lineHeight: 1 }}>$5.4M</span>
      </div>
      <div style={{ position: "absolute", left: 540, top: 26, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {CHIPS.map((c, i) => (
          <div key={c} style={{ width: 196, height: 76, background: "#fff", border: `5px solid ${INK}`, borderRadius: 12, boxShadow: `5px 5px 0 ${INK}`, display: "flex", alignItems: "center", gap: 10,
            padding: "0 10px", boxSizing: "border-box", transform: `rotate(${i % 2 ? 1 : -1}deg)` }}>
            <div style={{ width: 34, height: 34, borderRadius: 17, background: K.green, border: `3px solid ${INK}`, fontFamily: SFXF, fontSize: 22, display: "flex", alignItems: "center",
              justifyContent: "center", flexShrink: 0 }}>✓</div>
            <div style={{ fontFamily: SFXF, fontSize: 25, letterSpacing: 1, color: INK, lineHeight: 1 }}>{c.toUpperCase()}</div>
          </div>
        ))}
      </div>
    </Frame>
    {/* try it: the real listing */}
    <Frame x={1020} y={542} w={552} h={226} rot={-0.5}>
      <Tone w={552} h={226} bg="#BFF0FF" dot="#8FD8F0" id="tryTone" />
      <Caption x={16} y={12} rot={-1.5} size={24}>Try it</Caption>
      <div style={{ position: "absolute", left: 16, top: 62 }}><Shot src="shot-paybox.png" w={516} h={98} /></div>
      <div style={{ position: "absolute", left: 18, top: 172, fontFamily: SFXF, fontSize: 27, letterSpacing: 1, color: INK }}>PLUGINS → ODDSHOT → ASK CHATGPT OR CLAUDE</div>
    </Frame>
    {/* credits */}
    <div style={{ position: "absolute", left: 28, top: 790, width: 1544, height: 84, background: INK, transform: "rotate(-0.3deg)", boxShadow: `8px 8px 0 ${INK}33`,
      display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 58, height: 58, borderRadius: 29, background: K.yellow, border: "4px solid #fff", display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: SFXF, fontSize: 30, color: INK, letterSpacing: 1 }}>DD</div>
        <div>
          <div style={{ fontFamily: SFXF, fontSize: 38, color: "#fff", letterSpacing: 2, lineHeight: 1 }}>DAPPEST DEV</div>
          <div style={{ fontFamily: LETTER, fontWeight: 700, fontSize: 23, color: K.yellow }}>@sentinel_dapper</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Logo src="moonpay-logo.png" size={54} />
        <div style={{ fontFamily: SFXF, fontSize: 40, color: "#fff", letterSpacing: 2.5 }}>MOONPAY <span style={{ color: K.yellow }}>×</span> PAYBOX</div>
        <Logo src="paybox-logo.png" size={54} />
        <div style={{ marginLeft: 6, background: K.yellow, color: INK, border: "3px solid #fff", padding: "4px 14px", fontFamily: SFXF, fontSize: 28, letterSpacing: 2, transform: "rotate(-3deg)" }}>
          HACKATHON FINALIST · 1 OF 13
        </div>
      </div>
      <div style={{ fontFamily: LETTER, fontWeight: 700, fontSize: 18, color: "#bbb", textAlign: "right", lineHeight: 1.2 }}>10 tools · live now<br />Not financial advice</div>
    </div>
  </AbsoluteFill>
);

// ---------- The clean cut: one message that reads at phone size ----------
const ToolIcon: React.FC<{ kind: number }> = ({ kind }) => (
  <svg width={104} height={104} viewBox="0 0 118 118" style={{ overflow: "visible", flexShrink: 0 }}>
    {kind === 0 && <>
      <circle cx={59} cy={59} r={54} fill="#0E2A3A" stroke={INK} strokeWidth={6} />
      {[40, 26, 12].map((r) => <circle key={r} cx={59} cy={59} r={r} fill="none" stroke={K.green} strokeWidth={3} opacity={0.7} />)}
      <path d="M59,59 L59,5 A54,54 0 0 1 105,32 Z" fill={K.green} opacity={0.45} />
      {[[80, 40], [38, 78], [70, 86]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={7} fill={K.yellow} stroke={INK} strokeWidth={3} />)}
    </>}
    {kind === 1 && <>
      <rect x={4} y={4} width={110} height={110} rx={16} fill="#fff" stroke={INK} strokeWidth={6} />
      <polyline points="14,86 34,86 42,34 62,28 104,26" fill="none" stroke="#13A35E" strokeWidth={9} strokeLinejoin="round" strokeLinecap="round" />
      <polyline points="14,98 60,98 68,94 76,60 104,52" fill="none" stroke="#E0A800" strokeWidth={9} strokeLinejoin="round" strokeLinecap="round" />
    </>}
    {kind === 2 && <>
      <path d="M22,6 L96,6 L96,104 L86,96 L76,104 L66,96 L56,104 L46,96 L36,104 L22,96 Z" fill="#fff" stroke={INK} strokeWidth={6} strokeLinejoin="round" />
      {[26, 40].map((y) => <line key={y} x1={34} x2={84} y1={y} y2={y} stroke="#999" strokeWidth={5} strokeLinecap="round" />)}
      <g transform="rotate(-14 62 72)"><rect x={32} y={56} width={60} height={30} rx={5} fill="none" stroke="#13A35E" strokeWidth={5} />
        <text x={62} y={79} textAnchor="middle" fontFamily={SFXF} fontSize={23} fill="#13A35E">HIT</text></g>
    </>}
  </svg>
);
const CLEAN: [string, string, string, string, string][] = [
  ["RADAR", "Stories heating up", "On both crowds", "#C9F1FF", "#97D9F0"],
  ["LAG CHECK", "$ANT odds 22% → 61%", "Meme +15% next day", "#D9CCFF", "#B7A5F2"],
  ["RECEIPTS", "My $GTA6 call, Oct 16", "Hit · +148%", "#C2F5DA", "#93E2B9"],
];
export const UpdateCardClean: React.FC = () => (
  <AbsoluteFill>
    <Paper />
    <Frame x={28} y={28} w={1544} h={572} rot={-0.3}>
      <Burst w={1544} h={572} cx={1300} cy={330} a="#FFD23F" b="#FFBE1A" n={34} />
      <Caption x={30} y={24} rot={-1.5} size={28} bg="#fff">Patch notes · Sat, Oct 24</Caption>
      <div style={{ position: "absolute", left: 30, top: 84, fontFamily: SFXF, fontSize: 214, lineHeight: 1, color: "#fff", letterSpacing: 10, WebkitTextStroke: `12px ${INK}`,
        paintOrder: "stroke fill", textShadow: `12px 12px 0 ${INK}`, transform: "rotate(-2deg)" }}>ODDSHOT</div>
      <div style={{ position: "absolute", left: 40, top: 316, background: INK, color: "#fff", padding: "8px 22px", fontFamily: SFXF, fontSize: 58, letterSpacing: 3, transform: "rotate(-1deg)",
        display: "flex", alignItems: "center", gap: 16 }}>
        v1.3.3 IS LIVE ON <Logo src="paybox-logo.png" size={56} /><span style={{ color: K.yellow }}>PAYBOX</span>
      </div>
      {[["24", "HOURS"], ["5", "RELEASES"], ["7→10", "TOOLS"]].map(([n, l], i) => (
        <div key={l} style={{ position: "absolute", left: 40 + i * 236, top: 420, width: 214, height: 124, background: i === 2 ? K.green : "#fff", border: `7px solid ${INK}`, borderRadius: 16,
          boxShadow: `7px 7px 0 ${INK}`, transform: `rotate(${[-2, 1.5, -1][i]}deg)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: SFXF, color: INK }}>
          <div style={{ fontSize: 74, lineHeight: 0.92 }}>{n}</div>
          <div style={{ fontSize: 30, letterSpacing: 2 }}>{l}</div>
        </div>
      ))}
      <svg width={1544} height={572} style={{ position: "absolute", inset: 0 }}>
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2 + 0.2, cx = 1300, cy = 345;
          return <line key={i} x1={cx + Math.cos(a) * 225} y1={cy + Math.sin(a) * 225} x2={cx + Math.cos(a) * 275} y2={cy + Math.sin(a) * 275} stroke={INK} strokeWidth={8} strokeLinecap="round" />;
        })}
      </svg>
      <Oddy size={340} mood="calm" look={{ x: -0.55, y: 0.15 }} ink style={{ position: "absolute", left: 1130, top: 175 }} />
      <Balloon x={930} y={40} w={300} tx={250} ty={170} size={30} bg="#E3FFF0">I got sharper overnight.</Balloon>
    </Frame>
    {CLEAN.map(([name, a, b, bg, dot], i) => (
      <Frame key={name} x={28 + i * 522} y={622} w={500} h={150} rot={[-0.6, 0.4, -0.4][i]}>
        <Tone w={500} h={150} bg={bg} dot={dot} id={`clean${i}`} />
        <div style={{ position: "absolute", left: 18, top: 16 }}><ToolIcon kind={i} /></div>
        <div style={{ position: "absolute", left: 140, top: 10, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontFamily: SFXF, fontSize: 52, letterSpacing: 2, color: INK, lineHeight: 1 }}>{name}</div>
          <div style={{ background: K.red, color: "#fff", border: `3px solid ${INK}`, padding: "0 9px", fontFamily: SFXF, fontSize: 22, letterSpacing: 2, transform: "rotate(-6deg)" }}>NEW</div>
        </div>
        <div style={{ position: "absolute", left: 140, top: 70, fontFamily: SFXF, fontSize: 27, letterSpacing: 1, color: INK, lineHeight: 1.05 }}>{a.toUpperCase()}</div>
        <div style={{ position: "absolute", left: 140, top: 100, fontFamily: SFXF, fontSize: 32, letterSpacing: 1, color: "#13A35E", lineHeight: 1.05 }}>{b.toUpperCase()}</div>
      </Frame>
    ))}
    <div style={{ position: "absolute", left: 28, top: 794, width: 1544, height: 80, background: INK, transform: "rotate(-0.3deg)", boxShadow: `8px 8px 0 ${INK}33`,
      display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 26px", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: 28, background: K.yellow, border: "4px solid #fff", display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: SFXF, fontSize: 28, color: INK, letterSpacing: 1 }}>DD</div>
        <div>
          <div style={{ fontFamily: SFXF, fontSize: 38, color: "#fff", letterSpacing: 2, lineHeight: 1 }}>DAPPEST DEV</div>
          <div style={{ fontFamily: LETTER, fontWeight: 700, fontSize: 23, color: K.yellow }}>@sentinel_dapper</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Logo src="moonpay-logo.png" size={54} />
        <div style={{ fontFamily: SFXF, fontSize: 42, color: "#fff", letterSpacing: 2.5 }}>MOONPAY <span style={{ color: K.yellow }}>×</span> PAYBOX</div>
        <Logo src="paybox-logo.png" size={54} />
        <div style={{ marginLeft: 8, background: K.yellow, color: INK, border: "3px solid #fff", padding: "4px 16px", fontFamily: SFXF, fontSize: 30, letterSpacing: 2, transform: "rotate(-3deg)" }}>
          HACKATHON FINALIST · 1 OF 13
        </div>
      </div>
    </div>
  </AbsoluteFill>
);
