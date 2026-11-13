import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import TLraw from "./proof-timeline.json";
import { FPS, RATE, P, SANS, SHADOW, sp, rise, ink, useF, toRate, Backdrop, Footage, Chapter, Bug, Pill, In, Card, BlurWords, Captions, type Blur, type TLT } from "./ProofKit";
import { RugChart, Swarm, Flow, Compare, Receipts, EndCard } from "./ProofViz";

// "The rug, explained": real Oddshot runs in ChatGPT and Claude with PayBox, the on-chain minute behind the rug, and the coin that passed.
// Timeline: proof/script.json → story/tts.py proof → TAIL=2.2 story/timeline.py proof → src/proof-timeline.json. Audio: proof/mix.py (cues mirrored).
const TL = TLraw as unknown as TLT;
export const PROOF_FRAMES = Math.ceil(TL.total * RATE);
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
const useScene = (id: string) => {
  const f = useF();
  const sc = SC(id), s0 = F(sc.start);
  return { f, dur: F(sc.end) - s0, c: (l: string, re?: RegExp, off = 0) => cue(l, re, off) - s0 };
};

// The footage log measured the desktop recording at 1280×720 and the phone at 440×954; the cuts are 1920×1080 and 880×1908.
// Freeze frames are taken where the page has stopped scrolling, so the measured rectangles hold.
const R = (x: number, y: number, w: number, h: number) => [x * 1.5, y * 1.5, w * 1.5, h * 1.5];
const RP = (x: number, y: number, w: number, h: number) => [x * 2, y * 2, w * 2, h * 2];
const FULL = { x: 60, y: 104, w: 1800, h: 800 };
const GPT = "Real run · ChatGPT + PayBox", CLAUDE = "Real run · Claude + PayBox";
/** Crops on the chat column from source y: ChatGPT's column is centred at x 1000, Claude's at x 960. */
const gpt = (y: number, w = 1240) => [[0, 1000 - w / 2, y, w]];
const cld = (y: number, w = 980) => [[0, 960 - w / 2, y, w]];
/** A label just right of a box: the box's source width and height times the panel scale. */
const right = (r: number[], s: number): [number, number] => [r[2]! * s + 22, (r[3]! * s - 48) / 2];
const SG = 1800 / 1240;
// A writing-assistant browser extension draws a pill, a dot and an icon in ChatGPT's composer: painted out in the composer's own grey.
const COMPOSER = "#1a1a1a";
const EXT: Blur[] = [
  { src: "usage", t0: 0, t1: 1.5, r: [1440, 566, 96, 46], fill: COMPOSER }, { src: "usage", t0: 0, t1: 1.5, r: [1416, 570, 24, 42], fill: COMPOSER },
  { src: "usage", t0: 0, t1: 1.5, r: [1561, 609, 20, 20], fill: COMPOSER },
  { src: "usage", t0: 0, t1: 1.5, r: [1484, 656, 46, 44], fill: COMPOSER },
  { src: "usage", t0: 61.5, t1: 64, r: [1526, 936, 20, 20], fill: COMPOSER }, { src: "usage", t0: 61.5, t1: 64, r: [1484, 981, 46, 44], fill: COMPOSER },
  { src: "usage", t0: 93, t1: 96, r: [1526, 936, 20, 20], fill: COMPOSER }, { src: "usage", t0: 93, t1: 96, r: [1484, 981, 46, 44], fill: COMPOSER },
];
// ChatGPT's round scroll-down button sits on the check table's empty middle at 83 s.
const DOWN: Blur = { src: "usage", t0: 82.5, t1: 92, r: [972, 869, 58, 58], fill: "#000" };
// ...and on the buy frames; a text cursor waits in the empty gap under the 83 s verdict.
const DOWN2: Blur = { src: "usage", t0: 114, t1: 121, r: [972, 866, 58, 60], fill: "#000" };
const CURSOR83: Blur = { src: "usage", t0: 82.5, t1: 92, r: [1130, 413, 16, 22], fill: "#000" };
// The text cursor left in the words: inside "paybox" in the first prompt (copied clean from half a second later, before the page moves),
// beside the h of "with" in the $NVIDIA card (its serifs, on pure black), and above "Liquidity" in the $ANT card.
const CURSOR0: Blur = { src: "usage", t0: -0.1, t1: 0.1, r: [700, 554, 18, 20], from: 0.5 };
// The "with" cursor is a dark bar with light edges laid over the h's stem: the stem is restored in its own greys (read off the rows above
// the cursor: 195, 235, 141) and the serifs go back to black.
const CURSOR52: Blur[] = ([[874, 528, 1, 14, "#EBEBEB"], [873, 527, 1, 1, "#C3C3C3"], [875, 527, 1, 1, "#8D8D8D"], [871, 527, 2, 1, "#000"], [876, 527, 2, 1, "#000"],
  [871, 542, 7, 1, "#000"]] as const).map(([x, y, w, h, fill]) => ({ src: "usage", t0: 52.4, t1: 52.6, r: [x, y, w, h], fill }));
const CURSOR54: Blur[] = [[870, 524, 9, 11], [871, 535, 8, 4]].map((r) => ({ src: "usage", t0: 54.4, t1: 54.6, r, fill: "#010101" }));
// At 121.2 the page has scrolled, so the scroll button sits on the sentence under the PayBox window: the band under the window goes black.
const SCROLL121: Blur = { src: "usage", t0: 121.1, t1: 121.3, r: [380, 856, 1240, 80], fill: "#000" };
// PayBox's window background: the tab row clipped at a crop edge, the strip under the window in a small tile (filled in the window's purple), the machine-clock timestamp.
const PB = "#150D1E", CLAUDE_BG = "#191718";
// At 124 the window has scrolled under ChatGPT's black header, which hides the top half of its Network row: both go purple.
const TOP124: Blur = { src: "usage", t0: 123.9, t1: 124.1, r: [401, 160, 1200, 46], fill: PB };
const TABS115: Blur = { src: "usage", t0: 114.9, t1: 115.1, r: [660, 468, 230, 36], fill: PB };
const UNDER115: Blur = { src: "usage", t0: 114.9, t1: 115.1, r: [640, 811, 720, 99], fill: PB };
const CLOCK171: Blur = { src: "usage", t0: 170.5, t1: 171.5, r: [420, 360, 140, 30], fill: PB };
// Claude's replies under the PayBox panel name the user's city, and were written before each signature; the crops avoid them and these make sure.
const CLAUDE_BLURS: Blur[] = [
  { src: "usage", t0: 295.5, t1: 300.5, r: R(500, 440, 160, 30) }, { src: "usage", t0: 300.5, t1: 306, r: R(500, 300, 160, 160) },
  { src: "usage", t0: 343.5, t1: 345.5, r: R(500, 425, 160, 70) }, { src: "usage", t0: 345.5, t1: 356, r: R(500, 475, 160, 30) },
  { src: "usage", t0: 298.5, t1: 300.5, r: R(333, 355, 560, 45), fill: "#191718" }, { src: "usage", t0: 349.5, t1: 351, r: R(333, 388, 560, 30), fill: "#191718" },
  { src: "usage", t0: 243, t1: 244.5, r: [470, 891, 980, 12], fill: "#191718" }, { src: "usage", t0: 254.5, t1: 255.5, r: [470, 806, 980, 10], fill: "#191718" },
  { src: "usage", t0: 329, t1: 331, r: [483, 964, 91, 32], fill: "#2F2F2F" }, { src: "usage", t0: 329, t1: 331, r: [1321, 956, 16, 16], fill: "#2F2F2F" },
  { src: "usage", t0: 243, t1: 244.5, r: [1322, 954, 16, 16], fill: "#2F2F2F" }, { src: "usage", t0: 211.5, t1: 212.5, r: [1351, 595, 14, 15], fill: "#2F2F2F" },
];
// The aftermath frame: Claude's scroll button, a cut line and the composer under the dust line, and a pointer.
const DUST: Blur[] = [
  { src: "usage", t0: 417.5, t1: 420, r: [470, 903, 980, 110], fill: "#191718" },
  { src: "usage", t0: 417.5, t1: 420, r: [892, 626, 20, 20], fill: "#1a1223" },
];

// ---------- 0. Hook: the warning, the buy, the crash, then the promise ----------
const Hook: React.FC = () => {
  const { f, c } = useScene("hook");
  const h2 = c("h2"), conf = c("h2", /anyway/, 0.12), h3 = c("h3"), gone = c("h3", /gone/), h4 = c("h4");
  const out = h3 - 3, titleK = rise(f, h4 - 3, h4 + 9), dim = rise(f, h4 - 10, h4 - 2);
  const tease = sp(f, -8, 12, 200);
  const tiles: [string, RegExp, string][] = [["Every warning", /warning/, P.yellow], ["The exact second", /second/, P.red], ["What PayBox really does", /really/, P.green]];
  return (
    <AbsoluteFill>
      <Backdrop tint={P.red} />
      {f < out + 8 && (
        <div style={{ position: "absolute", inset: 0, opacity: 1 - rise(f, out, out + 8) }}>
          <Footage f={f} {...FULL} tag={GPT} enter={-9} blurs={[DOWN, CURSOR83, ...EXT]} shots={[
            { at: 0, src: "usage", from: 83, hold: true, crop: [[0, 365, 190, 1270], [h2 - 2, 375, 195, 1250]] },
            { at: h2, src: "usage", from: 94, hold: true, crop: gpt(521) },
            { at: conf, src: "usage", from: 125, hold: true, crop: [[0, 605, 190, 790]], bg: PB },
          ]} boxes={[
            { at: c("h1", /flagged/), r: R(359, 193, 137, 22), color: P.yellow, label: "Oddshot’s check", lab: right(R(359, 193, 137, 22), 1.43) },
            { at: c("h1", /coin/), r: R(266, 256, 368.5, 24), color: P.red },
            { at: h2 + 1, r: R(284, 553, 480, 51), color: P.blue },
            { at: conf + 1, r: R(449, 243, 436, 47), color: P.green, label: "Confirmed · 11:05", below: true },
          ]} />
        </div>
      )}
      {f >= h3 - 3 && (
        <div style={{ position: "absolute", inset: 0, opacity: rise(f, h3 - 3, h3 + 3) * (1 - dim) }}>
          <RugChart f={f} draw={[h3 - 3, gone - 4]} dumpAt={gone} />
        </div>
      )}
      {f < gone + 8 && (
        <div style={{ position: "absolute", left: 64, top: 30, opacity: Math.min(1, tease * 1.3) * (1 - rise(f, gone + 3, gone + 8)), transform: `scale(${0.7 + 0.3 * tease})`, transformOrigin: "0 50%" }}>
          <Pill color={P.red} solid size={34} tilt={-2}>−99.8% · five minutes later</Pill>
        </div>
      )}
      {f >= h4 - 4 && (
        <div style={{ position: "absolute", inset: 0, opacity: titleK }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 112, textAlign: "center", transform: `translateY(${(1 - titleK) * 30}px)` }}>
            <div style={{ fontFamily: SANS, fontWeight: 650, fontSize: 40, letterSpacing: -0.4, color: ink(P.red) }}>My plugin warned me. I bought anyway.</div>
            <div style={{ fontFamily: SANS, fontWeight: 750, fontSize: 138, letterSpacing: -5.5, color: P.ink, lineHeight: 1.02, marginTop: 14 }}>
              <BlurWords f={f} at={h4 - 3} text="The rug, explained." />
            </div>
          </div>
          {tiles.map(([t, re, col], i) => {
            const at = c("h4", re), k = f >= at ? sp(f, at, 13, 190) : 0, x = 105 + i * 585, y = 470;
            if (f < at) return null;
            return (
              <div key={i} style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, opacity: Math.min(1, k * 1.4), transform: `translateY(${(1 - k) * 40}px)` }}>
                <div style={{ position: "absolute", left: x, top: y - 64 }}><Pill color={col} solid size={30} tilt={i === 1 ? 1.5 : -1.5}>{t}</Pill></div>
                {i === 0 && <Footage f={f} x={x} y={y} w={540} h={330} radius={20} edge blurs={[DOWN, CURSOR83]} shots={[{ at: 0, src: "usage", from: 83, hold: true, crop: [[0, 385, 185, 660]] }]}
                  boxes={[{ at: at + 4, r: R(266, 256, 368.5, 24), color: P.yellow }]} />}
                {i === 1 && (
                  <Card dark radius={20} style={{ left: x, top: y, width: 540, height: 330 }} inner={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ fontFamily: SANS, fontWeight: 650, fontSize: 28, color: P.darkMuted, fontVariantNumeric: "tabular-nums" }}>11:11:06</div>
                    <div style={{ fontFamily: SANS, fontWeight: 750, fontSize: 96, color: P.red, letterSpacing: -3.5, lineHeight: 1.1 }}>$39,979</div>
                    <div style={{ fontFamily: SANS, fontWeight: 500, fontSize: 26, color: P.darkText }}>one wallet: the coin’s creator</div>
                  </Card>
                )}
                {i === 2 && <Footage f={f} x={x} y={y} w={540} h={330} radius={20} bg={PB} blurs={[TABS115, UNDER115]} shots={[{ at: 0, src: "usage", from: 115, hold: true, crop: [[0, 640, 470, 720]] }]}
                  boxes={[{ at: at + 4, r: R(449, 421, 436, 46), color: P.green }]} />}
              </div>
            );
          })}
        </div>
      )}
    </AbsoluteFill>
  );
};

// ---------- 1. How PayBox works: the AI never holds the money; MoonPay funds the wallet; ask, build, approve ----------
const Statement: React.FC<{ f: number; at: number; lock: number }> = ({ f, at, lock }) => {
  const k = sp(f, at, 16, 140), q = f >= lock ? sp(f, lock, 11, 220) : 0;
  const card = (x: number, col: string, title: string, sub: string, icon: React.ReactNode, dx: number) => (
    <Card radius={30} style={{ left: x, top: 330, width: 600, height: 360, transform: `translateX(${(1 - k) * dx}px)`, opacity: k }} inner={{ padding: "40px 44px" }}>
      {icon}
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 56, color: P.ink, marginTop: 26, letterSpacing: -1.5 }}>{title}</div>
      <div style={{ fontFamily: SANS, fontWeight: 500, fontSize: 30, color: P.muted, marginTop: 10, textWrap: "balance" }}>{sub}</div>
    </Card>
  );
  return (
    <>
      {card(200, P.blue, "Your AI", "ChatGPT or Claude: it asks and prepares", <svg width={90} height={90} viewBox="0 0 70 70"><path d="M10 14h50v32H30l-12 12V46h-8z" fill="none" stroke={P.blue} strokeWidth={5} strokeLinejoin="round" /></svg>, -80)}
      {card(1120, P.violet, "Your PayBox wallet", "the keys and the money stay here", <svg width={90} height={90} viewBox="0 0 70 70"><path d="M35 6l24 9v17c0 15-10 26-24 32C21 58 11 47 11 32V15z" fill="none" stroke={P.violet} strokeWidth={5} strokeLinejoin="round" /><rect x={26} y={30} width={18} height={14} rx={3} fill={P.violet} /><path d="M29 30v-5a6 6 0 0 1 12 0v5" fill="none" stroke={P.violet} strokeWidth={4} /></svg>, 80)}
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, opacity: k }}>
        <line x1={800} y1={510} x2={1120} y2={510} stroke="#B7BAC1" strokeWidth={5} strokeDasharray="14 12" />
      </svg>
      {q > 0 && (
        <div style={{ position: "absolute", left: 960 - 95, top: 510 - 95, width: 190, height: 190, borderRadius: 95, background: P.red, boxShadow: SHADOW,
          transform: `scale(${0.3 + 0.7 * q}) rotate(${(1 - q) * -24}deg)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <svg width={60} height={60} viewBox="0 0 60 60"><path d="M12 12L48 48M48 12L12 48" stroke="#FFFFFF" strokeWidth={8} strokeLinecap="round" /></svg>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 25, color: "#FFFFFF", marginTop: 6 }}>No keys</div>
        </div>
      )}
    </>
  );
};
const PhoneSteps: React.FC<{ f: number; ats: number[] }> = ({ f, ats }) => (
  <>
    {([["Copy my PayBox address", "Solana · 14dw…NuDX"], ["Send $5 of USDC from MoonPay", "MoonPay → my PayBox wallet"], ["Fee 0.16 · about 4.84 arrives", "a one-time USDC setup on a new wallet"],
      ["PayBox: $0.00 → $4.84", "funded, on Solana"]] as const).map(([t, s], i) => {
      const at = ats[i]!, lit = f >= at && f < (ats[i + 1] ?? 1e9);
      return (
        <In key={i} f={f} at={at} style={{ left: 760, top: 190 + i * 168, width: 1060 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 30, padding: "22px 30px", borderRadius: 26, background: lit ? P.dark : P.card, boxShadow: SHADOW }}>
            <div style={{ width: 66, height: 66, borderRadius: 33, background: lit ? P.green : "#ECEDF0", color: P.ink, fontFamily: SANS, fontWeight: 700, fontSize: 30,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
            <div>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 46, color: lit ? P.darkText : P.ink, lineHeight: 1.05, letterSpacing: -1 }}>{t}</div>
              <div style={{ fontFamily: SANS, fontWeight: 500, fontSize: 27, color: lit ? P.darkMuted : P.muted, marginTop: 6 }}>{s}</div>
            </div>
          </div>
        </In>
      );
    })}
  </>
);
const PayBoxScene: React.FC = () => {
  const { f, c, dur } = useScene("paybox");
  const B = c("p2", undefined, -0.3), C = c("p4", undefined, -0.3);
  const fade = (a: number, b: number) => rise(f, a, a + 8) * (1 - rise(f, b, b + 8));
  const ats = [B + 4, c("p2", /MoonPay/, -0.1), c("p2", /five/, -0.05), c("p2", /Solana/, -0.1)];
  return (
    <AbsoluteFill>
      <Backdrop tint={P.violet} />
      <Chapter f={f} n="01" title="How PayBox works" color={P.violet} dur={dur} />
      {f < B + 8 && (
        <div style={{ position: "absolute", inset: 0, opacity: 1 - rise(f, B, B + 8) }}>
          <Statement f={f} at={c("p1", undefined, -0.1)} lock={c("p1", /never/)} />
        </div>
      )}
      {f >= B && f < C + 8 && (
        <div style={{ position: "absolute", inset: 0, opacity: fade(B, C) }}>
          <Footage f={f} x={230} y={122} w={420} h={840} radius={48} enter={B} tag="Real run · MoonPay + PayBox" tagAt="top" fade={false}
            shots={ats.map((at, i) => ({ at: i ? at : 0, src: "moonpay", from: [3.5, 26.0, 29.0, 38.5][i]!, hold: true, crop: [[0, 0, 0, 880]] }))}
            boxes={[
              { at: ats[0]! + 4, r: RP(32, 683, 376, 50), color: P.green },
              { at: ats[1]! + 8, r: RP(20, 504, 400, 44), color: P.blue },
              { at: ats[2]! + 6, r: RP(18, 438, 404, 36), color: P.green },
              { at: ats[3]! + 4, r: RP(14, 176, 150, 56), color: P.green },
            ]} />
          <PhoneSteps f={f} ats={ats} />
        </div>
      )}
      {f >= C && (
        <div style={{ position: "absolute", inset: 0, opacity: rise(f, C, C + 8) }}>
          <Flow f={f} y={150} ats={[c("p4", /ask/), c("p4", /Oddshot/), c("p4", /builds/), c("p5", /shows/), c("p5", /approve/)]} />
          <Footage f={f} x={60} y={470} w={1800} h={440} enter={C} tag={GPT} blurs={[...EXT, CURSOR0, TABS115, TOP124, DOWN2, { src: "usage", t0: 114.9, t1: 115.1, r: [1294, 760, 30, 28], fill: PB }]}
            shots={[
              { at: 0, src: "usage", from: 0, hold: true, crop: gpt(470) },
              { at: c("p4", /calls/), src: "usage", from: 28, hold: true, crop: [[0, 375, 205, 700]] },
              { at: c("p4", /checks/, -0.1), src: "usage", from: 117, hold: true,
                crop: [[0, 380, 300, 1240], [c("p4", /builds/) - c("p4", /checks/, -0.1) + 15, 380, 300, 1240], [c("p4", /sign/) - c("p4", /checks/, -0.1) - 2, 380, 520, 1240]] },
              { at: c("p5", undefined, -0.1), src: "usage", from: 115, hold: true, crop: [[0, 401, 470, 1200]], bg: PB },
              { at: c("p5", /signs/, -0.15), src: "usage", from: 124, hold: true, crop: [[0, 401, 164, 1200]], bg: PB },
              { at: c("p5", /signs/, 0.4), src: "usage", from: 125, hold: true, crop: [[0, 401, 242, 1200]], bg: PB },
            ]}
            boxes={[
              { at: C + 6, r: R(285, 363, 678, 25), color: P.blue, label: "I ask my AI" },
              { at: c("p4", /calls/, 0.1), r: R(266, 197, 198, 23), color: P.blue, label: "ChatGPT calls the PayBox plugin", below: true },
              { at: c("p4", /coin/), r: [424, 486, 308, 34], color: P.yellow },
              { at: c("p4", /builds/, 0.1), r: [1494, 378, 87, 38], color: P.yellow, label: "$2.00 swap, built", lab: [-170, -60] },
              { at: c("p4", /sign/), r: [426, 700, 1074, 70], color: P.yellow, label: "Not signed. Waiting for me.", below: true },
              { at: c("p5", /shows/), r: R(448, 345, 388, 48), color: P.violet, label: "PayBox shows me the swap" },
              { at: c("p5", /approve/), r: R(449, 421, 436, 46), color: P.green, label: "I approve", below: true },
              { at: c("p5", /signs/, 0.45), r: R(449, 243, 436, 47), color: P.green, label: "PayBox signs · confirmed" },
            ]} />
          <In f={f} at={c("p5", /AI/)} style={{ right: 90, top: 500 }}><Pill color={P.green} solid size={30} tilt={-1.5}>The AI never touches the keys</Pill></In>
        </div>
      )}
    </AbsoluteFill>
  );
};

// ---------- 2. The board: what an odds swing and its meme look like; the call was "no strong buy"; the chase was NVIDIA ----------
const Board: React.FC = () => {
  const { f, c, dur } = useScene("board");
  const ANT_HEAD = [518, 438, 226, 36], NV_HEAD = R(346, 129, 214, 22);
  return (
    <AbsoluteFill>
      <Backdrop tint={P.blue} />
      <Chapter f={f} n="02" title="The board" color={P.blue} dur={dur} />
      <Footage f={f} {...FULL} tag={GPT} blurs={[...EXT, CURSOR0, ...CURSOR52, ...CURSOR54]}
        shots={[
          { at: 0, src: "usage", from: 0, hold: true, crop: [[0, 350, 250, 1300], [40, 380, 290, 1240]] },
          { at: c("b1", /biggest/, -0.1), src: "usage", from: 54.5, hold: true, crop: gpt(400), note: "40 seconds later" },
          { at: c("b2", undefined, -0.15), src: "usage", from: 43, hold: true, crop: gpt(200) },
          { at: c("b2", /coin/, -0.1), src: "usage", from: 52.5, hold: true, crop: [[0, 380, 170, 1240], [40, 392, 175, 1215]] },
        ]}
        boxes={[
          { at: c("b1", /asked/), r: R(285, 363, 678, 25), color: P.blue, label: "One prompt in ChatGPT" },
          { at: c("b1", /odds/), r: [415, 625, 1130, 78], color: P.yellow, label: "The odds swing", lab: [1368, -66] },
          { at: c("b1", /meme/), r: ANT_HEAD, color: P.blue, label: "The meme riding it", lab: right(ANT_HEAD, SG) },
          { at: c("b2", /call/), r: R(265, 258, 421.5, 22), color: P.yellow, label: "The board’s call", lab: [624, -60] },
          { at: c("b2", /strong/, 0.3), r: R(402, 284, 176, 23), color: P.yellow },
          { at: c("b2", /NVIDIA/), r: NV_HEAD, color: P.blue, label: "The coin everyone was chasing", lab: right(NV_HEAD, 1.48) },
          { at: c("b2", /eighteen/), r: R(281, 220, 73, 22), color: P.blue },
        ]} />
    </AbsoluteFill>
  );
};

// ---------- 3. The warnings, one by one ----------
const Warnings: React.FC = () => {
  const { f, c, dur } = useScene("warnings");
  const W3 = c("w3", undefined, -0.1), W5 = c("w5", undefined, -0.1), pool = c("w3", /pool/) - W3;
  const LATE = R(801, 220, 44, 19), COPY = R(278, 346, 608, 22), BADGE = R(359, 193, 137, 22);
  const chips: [string, number, string][] = [
    ["LATE", c("w2", /late/), P.yellow], ["14 copycats in a day", c("w2", /Fourteen/), P.yellow], ["YELLOW · high risk", c("w3", /yellow/), P.yellow],
    ["Pool ~30 min old", c("w3", /thirty/), P.red], ["Organic 0 / 100", c("w4", /zero/), P.red], ["AI: I would not buy", c("w5", /would/), P.red],
  ];
  const n = chips.filter(([, at]) => f >= at).length;
  return (
    <AbsoluteFill>
      <Backdrop tint={P.yellow} />
      <Chapter f={f} n="03" title="The warnings" color={P.yellow} dur={dur} />
      {n > 0 && (
        <div style={{ position: "absolute", right: 64, top: 30, display: "flex", alignItems: "baseline", gap: 12, opacity: rise(f, chips[0]![1], chips[0]![1] + 6) }}>
          <span style={{ fontFamily: SANS, fontWeight: 750, fontSize: 56, color: ink(P.yellow), fontVariantNumeric: "tabular-nums" }}>{n}</span>
          <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 25, color: P.muted }}>{n === 1 ? "warning" : "warnings"} before I bought</span>
        </div>
      )}
      <Footage f={f} x={60} y={104} w={1800} h={740} blurs={[...EXT, DOWN, CURSOR83, ...CURSOR52]}
        shots={[
          { at: 0, src: "usage", from: 62, hold: true, crop: gpt(560) },
          { at: c("w1", /warning/, -0.1), src: "usage", from: 83, hold: true, crop: gpt(170) },
          { at: c("w2", undefined, -0.1), src: "usage", from: 52.5, hold: true, crop: gpt(170) },
          { at: W3, src: "usage", from: 83, hold: true, crop: [[0, 380, 182, 1240], [pool, 380, 182, 1240], [pool + 16, 380, 425, 1240]] },
          { at: W5, src: "usage", from: 83, hold: true, crop: [[0, 380, 425, 1240], [14, 380, 190, 1240]] },
        ]}
        boxes={[
          { at: c("w1"), r: R(284, 580, 448, 24), color: P.blue, label: "check_token on $NVIDIA" },
          { at: c("w2", /late/), r: LATE, color: P.yellow, label: "Timing: LATE", lab: right(LATE, SG) },
          { at: c("w2", /Fourteen/), r: COPY, color: P.yellow, label: "Copycat frenzy", lab: right(COPY, SG) },
          { at: c("w3", /yellow/), r: BADGE, color: P.yellow, label: "Oddshot safety check", lab: right(BADGE, SG) },
          { at: c("w3", /thirty/), to: c("w4", /Bots/), r: R(946, 521, 111, 22), color: P.red },
          { at: c("w4", /Organic/), r: R(279, 562, 778, 22), color: P.red },
          { at: c("w4", /zero/), r: R(1006, 562, 51, 22), color: P.red },
          { at: c("w5", /would/), r: R(266, 256, 368.5, 24), color: P.red },
        ]}
        zooms={[{ at: c("w4", /Bots/), r: R(1000, 552, 60, 42), x: 760, y: 130, s: 3.6, label: "Bots, not buyers", color: P.red, anchor: [1500, 859] }]} />
      <div style={{ position: "absolute", left: 60, top: 878, width: 1800, display: "flex", gap: 14, justifyContent: "center" }}>
        {chips.map(([t, at, col], i) => {
          const on = f >= at, k = on ? sp(f, at, 12, 220) : 0;
          return (
            <div key={i} style={{ opacity: 0.18 + 0.82 * k, transform: `translateY(${(1 - k) * 14}px) scale(${1 + 0.1 * Math.sin(k * Math.PI)})` }}>
              <Pill color={on ? col : P.dim} size={25}>{t}</Pill>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ---------- 4. The buy, the approval, the seatbelt ----------
const Buy: React.FC = () => {
  const { f, c, dur } = useScene("buy");
  return (
    <AbsoluteFill>
      <Backdrop tint={P.blue} />
      <Chapter f={f} n="04" title="The buy" color={P.blue} dur={dur} />
      <Footage f={f} {...FULL} tag={GPT} blurs={[...EXT, DOWN2, SCROLL121, CLOCK171, { src: "usage", t0: 173.5, t1: 174.5, r: [380, 710, 1240, 30], fill: "#000" }]}
        shots={[
          { at: 0, src: "usage", from: 94, hold: true, crop: gpt(521) },
          { at: c("a2", undefined, -0.1), src: "usage", from: 115, hold: true, crop: gpt(316) },
          { at: c("a2", /submit/, -0.05), src: "usage", from: 121.2, hold: true, crop: gpt(350) },
          { at: c("a2", /Confirmed/, -0.1), src: "usage", from: 125, hold: true, crop: [[0, 380, 150, 1240], [20, 580, 179, 840]], bg: PB },
          { at: c("a3", undefined, -0.1), src: "usage", from: 171, hold: true, crop: gpt(262), note: "Seconds later: the seatbelt", bg: PB },
          { at: c("a3", /verdict/, -0.1), src: "usage", from: 174, hold: true, crop: gpt(165) },
        ]}
        boxes={[
          { at: c("a1", /bought/), r: R(284, 553, 480, 51), color: P.blue, label: "After all that: a $2 test buy" },
          { at: c("a2", /built/), to: c("a2", /PayBox/), r: R(266, 554, 564, 22), color: P.blue, label: "Oddshot built the swap" },
          { at: c("a2", /showed/), r: R(449, 347, 436, 120), color: P.violet, label: "PayBox showed it to me", below: true },
          { at: c("a2", /submit/), r: R(449, 443, 436, 47), color: P.green, label: "Submit", below: true },
          { at: c("a2", /Confirmed/), r: R(449, 243, 436, 47), color: P.green, label: "Confirmed · 11:05:43", below: true },
          { at: c("a3", /wallet/), r: R(296, 330, 744, 24), color: P.blue, label: "$NVIDIA in my wallet", lab: [330, 2] },
          { at: c("a3", /trim/), r: R(266, 178, 699, 22), color: P.yellow, label: "Seatbelt: TRIM 50%", below: true },
          { at: c("a3", /half/), r: R(1005, 240, 46, 21), color: P.yellow },
        ]} />
      <In f={f} at={c("a3", /never/)} style={{ right: 150, top: 770 }}>
        <Pill color={P.red} solid size={32} tilt={-1.5}>The trim never went through</Pill>
      </In>
    </AbsoluteFill>
  );
};

// ---------- 5. The rug: the staircase, the swarm, the creator's sell, the crash ----------
const Rug: React.FC = () => {
  const { f, c, dur } = useScene("rug");
  const B = c("r3", undefined, -0.2), Cc = c("r5", undefined, -0.25), Dd = c("r5", /less/, -0.25), E = c("r6", undefined, -0.1);
  const chartOn = f < B + 8 || (f >= Cc && f < Dd + 8);
  const chartO = f < B + 8 ? 1 - rise(f, B, B + 8) : rise(f, Cc, Cc + 6) * (1 - rise(f, Dd, Dd + 8));
  return (
    <AbsoluteFill>
      <Backdrop tint={P.red} />
      <Chapter f={f} n="05" title="The rug" color={P.red} dur={dur} />
      {chartOn && (
        <div style={{ position: "absolute", inset: 0, opacity: chartO }}>
          <RugChart f={f} draw={[c("r1"), c("r2", /thirteen/, 0.2)]} dumpAt={c("r5")} />
        </div>
      )}
      {f >= B && f < Cc + 8 && (
        <div style={{ position: "absolute", inset: 0, opacity: rise(f, B, B + 8) * (1 - rise(f, Cc, Cc + 8)) }}>
          <Swarm f={f} at={c("r3", /two/)} dump={c("r4", /sold/)} hollow={c("r3", /nothing/)} />
        </div>
      )}
      {f >= Dd && f < E + 8 && (
        <div style={{ position: "absolute", inset: 0, opacity: rise(f, Dd, Dd + 6) * (1 - rise(f, E, E + 8)) }}>
          <Footage f={f} {...FULL} tag={CLAUDE} enter={Dd} bg={CLAUDE_BG} blurs={DUST}
            shots={[{ at: Dd, src: "usage", from: 418, hold: true, crop: cld(560) }]}
            boxes={[{ at: Dd + 6, r: R(363, 563, 444, 19), color: P.red, label: "My $2, after: $0 · dust", lab: right(R(363, 563, 444, 19), 1800 / 980) }]} />
        </div>
      )}
      {f >= E && (
        <div style={{ position: "absolute", inset: 0, opacity: rise(f, E, E + 6) }}>
          <Footage f={f} {...FULL} tag={GPT} enter={E} blurs={[DOWN, CURSOR83]}
            shots={[{ at: E, src: "usage", from: 83, hold: true, crop: [[0, 312, 361, 1376]] }]}
            boxes={[{ at: c("r6", /locked/), r: R(279, 604, 778, 22), color: P.green }]} />
          <In f={f} at={c("r6", /locked/)} style={{ left: 0, right: 0, top: 283, display: "flex", justifyContent: "center" }}>
            <Pill color={P.green} solid size={38} tilt={-1.5}>Liquidity locked: 100%</Pill>
          </In>
          <In f={f} at={c("r6", /not/)} style={{ left: 0, right: 0, top: 445, display: "flex", justifyContent: "center" }}>
            <Pill color={P.red} solid size={40} tilt={1.2}>A lock doesn’t stop the creator selling</Pill>
          </In>
        </div>
      )}
    </AbsoluteFill>
  );
};

// ---------- 6. The good coin: same steps in Claude, bought and sold ----------
const Wif: React.FC = () => {
  const { f, c, dur } = useScene("wif");
  const LIQ = R(363, 360, 99, 19), ORG = R(363, 418, 127, 20), retire = c("g3", /yellow/);
  return (
    <AbsoluteFill>
      <Backdrop tint={P.green} />
      <Chapter f={f} n="06" title="The coin that passed" color={P.green} dur={dur} />
      <Footage f={f} {...FULL} tag={CLAUDE} bg={CLAUDE_BG} blurs={CLAUDE_BLURS}
        shots={[
          { at: 0, src: "usage", from: 212, hold: true, crop: cld(250) },
          { at: c("g1", /same/, -0.1), src: "usage", from: 243.6, hold: true, crop: cld(590) },
          { at: c("g2", undefined, -0.1), src: "usage", from: 255, hold: true, crop: cld(372), note: "9 seconds later" },
          { at: c("g4", undefined, -0.1), src: "usage", from: 282, hold: true, crop: cld(140) },
          { at: c("g4", /Submit/, -0.1), src: "usage", from: 292.1, hold: true, crop: cld(150) },
          { at: c("g4", /Confirmed/, -0.1), src: "usage", from: 300, hold: true, crop: cld(150) },
          { at: c("g5", undefined, -0.1), src: "usage", from: 329.6, hold: true, crop: cld(641) },
          { at: c("g5", /Submit/, -0.1), src: "usage", from: 342, hold: true, crop: cld(150) },
          { at: c("g5", /Confirmed/, -0.1), src: "usage", from: 350, hold: true, crop: cld(150) },
          { at: c("g5", /Back/, -0.1), src: "usage", from: 373, hold: true, crop: cld(330) },
        ]}
        boxes={[
          { at: c("g1", /same/, 0.1), r: R(330, 611, 588, 21), color: P.blue, label: "Same check, on $WIF", below: true },
          { at: c("g2", /five/), to: retire, r: LIQ, color: P.green, label: "$5.3M liquidity", lab: [210, -60] },
          { at: c("g2", /organic/), to: retire, r: ORG, color: P.green, label: "Organic 76 / 100", lab: [1180, 2] },
          { at: c("g3", /yellow/), r: R(335, 277, 226.3, 19), color: P.yellow, label: "YELLOW · one warning" },
          { at: c("g3", /top/), r: R(363, 322, 533, 37), color: P.yellow },
          { at: c("g4", /dollar/), r: R(899, 131, 47, 36), color: P.blue, label: "$1.50", below: true },
          { at: c("g4", /Submit/, -0.1), r: R(466, 248, 348, 36), color: P.green, label: "Submit · buy $1.50", below: true },
          { at: c("g4", /Confirmed/), r: R(466, 248, 348, 36), color: P.green, label: "Confirmed · 11:15", below: true },
          { at: c("g5", undefined, -0.1), r: R(332, 612, 328, 18), color: P.blue, label: "Sell 100%" },
          { at: c("g5", /Submit/, -0.1), r: R(466, 231, 348, 37), color: P.green, label: "Submit · sell 100%", below: true },
          { at: c("g5", /Confirmed/), r: R(466, 281, 348, 36), color: P.green, label: "Confirmed · 11:16", below: true },
          { at: c("g5", /Back/), r: R(335, 291, 350, 18), color: P.green, label: "Sold · confirmed on-chain" },
          { at: c("g5", /cent/), r: R(335, 478, 518.3, 18), color: P.green },
        ]} />
      <In f={f} at={c("g1", /Claude/)} to={c("g1", /same/, -0.1)} style={{ right: 90, top: 150 }}><Pill color="#D97757" size={30} tilt={-1.5}>Switched to Claude</Pill></In>
      <In f={f} at={c("g5", /Back/, 0.3)} style={{ right: 90, top: 490, width: 620 }}>
        <div style={{ padding: "24px 30px", borderRadius: 24, background: P.card, boxShadow: SHADOW }}>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 36, color: ink(P.green), letterSpacing: -0.6 }}>USDC: $1.50 in, $1.5015 back</div>
          <div style={{ fontFamily: SANS, fontWeight: 500, fontSize: 24, color: P.muted, marginTop: 8, lineHeight: 1.3 }}>~$0.15 of SOL went to network fees and a refundable deposit for the $WIF token account</div>
        </div>
      </In>
    </AbsoluteFill>
  );
};

// ---------- 7. The lesson: two yellows, one rule, every receipt ----------
const Lesson: React.FC = () => {
  const { f, c, dur } = useScene("lesson");
  const rule = c("l2", /So/, -0.1), rc = c("l4", undefined, -0.2);
  const hot = c("l2", /brand/), red = c("l3", /red/);
  const card = rise(f, rule + 2, rule + 10);
  return (
    <AbsoluteFill>
      <Backdrop tint={P.yellow} />
      <Chapter f={f} n="07" title="The lesson" color={P.yellow} dur={dur} />
      {f < rule + 2 && (
        <div style={{ position: "absolute", inset: 0, opacity: 1 - rise(f, rule - 6, rule + 2) }}>
          <Compare f={f} at={c("l1", undefined, -0.2)} step={6} hot={hot} hot2={c("l2", /zero/)} yel={[c("l1", /two/), c("l1", /reason/)]} />
        </div>
      )}
      {f >= rule + 2 && f < rc + 8 && (
        <div style={{ position: "absolute", inset: 0, opacity: card * (1 - rise(f, rc, rc + 8)) }}>
          <Card radius={36} style={{ left: 260, top: 210, width: 1400, height: 520, transform: `scale(${0.96 + 0.04 * card})` }}
            inner={{ padding: "50px 64px", boxShadow: f >= red ? `0 0 0 3px ${P.red}, ${SHADOW}` : SHADOW }}>
            <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
              <span style={{ fontFamily: SANS, fontWeight: 650, fontSize: 26, letterSpacing: 3, color: P.muted }}>THE NEW RULE</span>
              <Pill color={P.yellow} solid size={28} tilt={-2}>Oddshot 1.4.1</Pill>
            </div>
            <div style={{ fontFamily: SANS, fontWeight: 750, fontSize: 98, color: P.ink, marginTop: 26, lineHeight: 1.06, letterSpacing: -3.5 }}>
              Pool under an hour old<br />+ organic score of 0
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 30, marginTop: 34, opacity: rise(f, red - 2, red + 6) }}>
              <Pill color={P.red} solid size={46}>RED</Pill>
              <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 54, color: ink(P.red), letterSpacing: -1.2 }}>Oddshot won’t build the buy</span>
            </div>
          </Card>
        </div>
      )}
      {f >= rc && (
        <div style={{ position: "absolute", inset: 0, opacity: rise(f, rc, rc + 8) }}>
          <In f={f} at={rc} style={{ left: 230, top: 130 }}>
            <div style={{ fontFamily: SANS, fontWeight: 650, fontSize: 30, color: P.muted }}>Every transaction in this video · Solana · times in GMT+1</div>
          </In>
          <Receipts f={f} at={rc + 4} y={196} />
        </div>
      )}
    </AbsoluteFill>
  );
};

// ---------- 8. Try it, and the line to remember ----------
const Start: React.FC = () => {
  const { f, c } = useScene("start");
  const s2 = c("s2", undefined, -0.1), swap = rise(f, s2, s2 + 8);
  return (
    <AbsoluteFill>
      <Backdrop tint={P.green} />
      <EndCard f={f} at={2} steps={[c("s1", /Fund/), c("s1", /switch/), c("s1", /ask/)]} titleOut={swap} />
      {f >= s2 && (
        <div style={{ position: "absolute", left: 0, right: 0, top: 150, textAlign: "center", opacity: swap, transform: `scale(${0.94 + 0.06 * sp(f, s2, 14, 150)})` }}>
          <div style={{ fontFamily: SANS, fontWeight: 750, fontSize: 150, letterSpacing: -6, color: P.ink, lineHeight: 1.02 }}><BlurWords f={f} at={s2} text="Read the warnings." /></div>
          <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 32, color: P.muted, marginTop: 26 }}>Oddshot · live on PayBox · <span style={{ color: P.ink }}>@sentinel_dapper</span></div>
        </div>
      )}
    </AbsoluteFill>
  );
};

// ---------- The video ----------
const SCENES: Record<string, React.FC> = { hook: Hook, paybox: PayBoxScene, board: Board, warnings: Warnings, buy: Buy, rug: Rug, wif: Wif, lesson: Lesson, start: Start };
const XF = 8;
/** Each scene fades up over the last one with a slight settle. */
const Enter: React.FC<{ first: boolean; children: React.ReactNode }> = ({ first, children }) => {
  const f = useF();
  const k = first ? 1 : rise(f, 0, XF);
  return <AbsoluteFill style={{ opacity: k, transform: `scale(${1.03 - 0.03 * k})` }}>{children}</AbsoluteFill>;
};
// The product mark sits above the scene changes, so the zoom of a cross-fade never shows it twice; it fades only where a scene drops it.
const MARKED = new Set(["paybox", "board", "buy", "rug", "wif", "lesson"]);
const markAt = (f: number) => {
  const i = TL.scenes.findIndex((s, j) => f < F(TL.scenes[j + 1]?.start ?? 1e9));
  const now = MARKED.has(TL.scenes[i]!.id), before = i > 0 && MARKED.has(TL.scenes[i - 1]!.id);
  const k = rise(f - F(TL.scenes[i]!.start), 0, XF);
  return now === before ? (now ? 1 : 0) : now ? k : 1 - k;
};
export const Proof: React.FC = () => {
  const f = useF();
  const mark = markAt(f);
  return (
    <AbsoluteFill style={{ background: P.bg }}>
      {TL.scenes.map((s, i) => {
        const C = SCENES[s.id]!;
        const from = F(s.start), next = TL.scenes[i + 1];
        const dur = (next ? F(next.start) + XF : F(TL.total)) - from;
        return (
          <Sequence key={s.id} from={toRate(from)} durationInFrames={toRate(dur)} name={s.id}>
            <Enter first={i === 0}><C /></Enter>
          </Sequence>
        );
      })}
      {mark > 0 && <AbsoluteFill style={{ opacity: mark }}><Bug /></AbsoluteFill>}
      <Captions tl={TL} fa={f} />
    </AbsoluteFill>
  );
};
