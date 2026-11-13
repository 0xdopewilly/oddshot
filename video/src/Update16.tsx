import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { Oddy } from "./Cast";
import { Card, P, Pill, SANS, SHADOW, ink } from "./ProofKit";

// The Oct 28 update card for X (1600x900), in the explainers' light look: one message, the real order behind it, three stickers,
// and the credits. The order is the live $4 WIF test of Oct 28: 22.08 WIF waiting for $0.254 (+40%), for 5.60 USDC.
const FIELDS: [string, number, number, number][] = [["#BCD3FF", 220, 260, 760], ["#FFE5A0", 1380, 120, 700], ["#FFC6D1", 1280, 880, 760], ["#C9EEC0", 260, 900, 700]];
const soft = (c: string) => `${c}a2 0%, ${c}76 22%, ${c}3e 44%, ${c}13 62%, ${c}00 76%`;

const Logo: React.FC<{ src: string; size: number }> = ({ src, size }) => (
  <Img src={staticFile(`update/${src}`)} style={{ width: size, height: size, borderRadius: size * 0.24, display: "block" }} />
);

export const Update16: React.FC = () => (
  <AbsoluteFill style={{ background: `${FIELDS.map(([c, x, y, r]) => `radial-gradient(${r}px circle at ${x}px ${y}px, ${soft(c)})`).join(", ")}, ${P.bg}` }}>
    {/* the logo */}
    <div style={{ position: "absolute", left: 84, top: 64, display: "flex", alignItems: "center", gap: 20 }}>
      <Oddy size={92} mood="calm" look={{ x: 0.5, y: 0.2 }} style={{ filter: "drop-shadow(0 6px 14px rgba(15,16,18,0.28))" }} />
      <div style={{ fontFamily: SANS, fontWeight: 760, fontSize: 56, color: P.ink, letterSpacing: -1.8 }}>Oddshot</div>
      <Pill color={P.green} solid size={26} tilt={-3} style={{ marginLeft: 6 }}>1.6 · live on PayBox</Pill>
    </div>
    {/* the message */}
    <div style={{ position: "absolute", left: 84, top: 222, fontFamily: SANS, fontWeight: 780, fontSize: 112, lineHeight: 1.0, letterSpacing: -4.6, color: P.ink }}>
      Take-profits that<br /><span style={{ color: ink(P.green) }}>sell themselves.</span>
    </div>
    <div style={{ position: "absolute", left: 88, top: 476, fontFamily: SANS, fontWeight: 560, fontSize: 34, lineHeight: 1.3, color: P.muted, letterSpacing: -0.4 }}>
      Plus a rug autopsy and a creator alarm.<br />17 tools in ChatGPT and Claude.
    </div>
    <div style={{ position: "absolute", left: 88, top: 614, display: "flex", gap: 18 }}>
      <Pill color={P.blue} size={28} tilt={-2}>Kalshi + Polymarket</Pill>
      <Pill color={P.violet} size={28} tilt={1.5}>Sector focus</Pill>
      <Pill color={P.yellow} size={28} tilt={-1.5}>MoonPay top-ups</Pill>
    </div>
    {/* the real order */}
    <Card radius={30} style={{ left: 1012, top: 150, width: 500, height: 486 }} inner={{ padding: "40px 44px" }}>
      <Pill color={P.green} solid size={24} tilt={-2}>Take-profit order</Pill>
      <div style={{ fontFamily: SANS, fontWeight: 780, fontSize: 88, color: P.ink, letterSpacing: -3.5, marginTop: 30, lineHeight: 1 }}>22.08 WIF</div>
      <div style={{ fontFamily: SANS, fontWeight: 620, fontSize: 36, color: P.ink, marginTop: 22, letterSpacing: -0.6 }}>
        sells at $0.254 <span style={{ color: ink(P.green) }}>+40%</span>
      </div>
      <div style={{ fontFamily: SANS, fontWeight: 560, fontSize: 30, color: P.muted, marginTop: 10, letterSpacing: -0.3 }}>for 5.60 USDC</div>
      <div style={{ position: "absolute", left: 44, right: 44, bottom: 40, borderTop: `2px solid ${P.line}`, paddingTop: 22, fontFamily: SANS, fontWeight: 560, fontSize: 23,
        color: P.muted, letterSpacing: -0.2 }}>
        A Jupiter limit order. It sells by itself.
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
