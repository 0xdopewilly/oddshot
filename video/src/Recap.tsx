import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { Oddy } from "./Cast";
import { Card, P, Pill, SANS, SHADOW, ink } from "./ProofKit";

// The finalist-week recap card for X (1600x900), in the Update16 look. 10 tools on Oct 23, 17 on Oct 28; the $GTA6 receipt through
// PayBox on 2026-10-29 12:57 UTC read +1,278.8% ($0.001208 -> $0.01665), about 14x.
const FIELDS: [string, number, number, number][] = [["#FFE5A0", 220, 260, 760], ["#BCD3FF", 1380, 120, 700], ["#C9EEC0", 1280, 880, 760], ["#FFC6D1", 260, 900, 700]];
const soft = (c: string) => `${c}a2 0%, ${c}76 22%, ${c}3e 44%, ${c}13 62%, ${c}00 76%`;

const Logo: React.FC<{ src: string; size: number }> = ({ src, size }) => (
  <Img src={staticFile(`update/${src}`)} style={{ width: size, height: size, borderRadius: size * 0.24, display: "block" }} />
);

const DAYS: [string, string][] = [["Mon", "\u201cLate, again\u201d video"], ["Tue", "The rug, explained"], ["Wed", "1.6 live: 17 tools"], ["Thu", "$GTA6 call hits 14x"]];

export const Recap: React.FC = () => (
  <AbsoluteFill style={{ background: `${FIELDS.map(([c, x, y, r]) => `radial-gradient(${r}px circle at ${x}px ${y}px, ${soft(c)})`).join(", ")}, ${P.bg}` }}>
    {/* the logo */}
    <div style={{ position: "absolute", left: 84, top: 64, display: "flex", alignItems: "center", gap: 20 }}>
      <Oddy size={92} mood="calm" look={{ x: 0.5, y: 0.2 }} style={{ filter: "drop-shadow(0 6px 14px rgba(15,16,18,0.28))" }} />
      <div style={{ fontFamily: SANS, fontWeight: 760, fontSize: 56, color: P.ink, letterSpacing: -1.8 }}>Oddshot</div>
      <Pill color={P.yellow} solid size={26} tilt={-3} style={{ marginLeft: 6 }}>Finalist week</Pill>
    </div>
    {/* the message */}
    <div style={{ position: "absolute", left: 84, top: 222, fontFamily: SANS, fontWeight: 780, fontSize: 112, lineHeight: 1.0, letterSpacing: -4.6, color: P.ink }}>
      One week.<br />10 tools → 17.<br /><span style={{ color: ink(P.green) }}>One 14x call.</span>
    </div>
    <div style={{ position: "absolute", left: 88, top: 580, fontFamily: SANS, fontWeight: 560, fontSize: 34, lineHeight: 1.3, color: P.muted, letterSpacing: -0.4 }}>
      Shipped live on PayBox. Graded in public.
    </div>
    {/* the week */}
    <Card radius={30} style={{ left: 1012, top: 150, width: 500, height: 486 }} inner={{ padding: "40px 44px" }}>
      <Pill color={P.green} solid size={24} tilt={-2}>Oct 26 – 29</Pill>
      <div style={{ marginTop: 26 }}>
        {DAYS.map(([d, what], i) => (
          <div key={d} style={{ display: "flex", alignItems: "baseline", gap: 22, padding: "25px 0", borderTop: i ? `2px solid ${P.line}` : "none", fontFamily: SANS }}>
            <div style={{ width: 62, fontWeight: 700, fontSize: 28, color: P.dim, letterSpacing: -0.3 }}>{d}</div>
            <div style={{ fontWeight: i === 3 ? 720 : 600, fontSize: 31, color: i === 3 ? ink(P.green) : P.ink, letterSpacing: -0.6 }}>{what}</div>
          </div>
        ))}
      </div>
    </Card>
    {/* credits */}
    <div style={{ position: "absolute", left: 84, right: 84, top: 752, height: 76, borderRadius: 999, background: P.card, boxShadow: SHADOW, display: "flex",
      alignItems: "center", justifyContent: "space-between", padding: "0 34px", boxSizing: "border-box" }}>
      <div style={{ fontFamily: SANS, fontSize: 27, letterSpacing: -0.4 }}>
        <span style={{ fontWeight: 720, color: P.ink }}>Dappest Dev</span><span style={{ fontWeight: 560, color: P.muted, marginLeft: 12 }}>@sentinel_dapper</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: SANS, fontWeight: 650, fontSize: 25, color: P.ink, letterSpacing: -0.3 }}>
        <Logo src="paybox-logo.png" size={38} />PayBox<span style={{ color: P.dim, margin: "0 2px" }}>×</span><Logo src="moonpay-logo.png" size={38} />MoonPay
        <span style={{ fontWeight: 560, color: P.muted, marginLeft: 8 }}>hackathon finalist</span>
      </div>
    </div>
  </AbsoluteFill>
);
