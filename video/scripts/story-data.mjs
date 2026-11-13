// Collects the real captured outputs the story shows on screen (PayBox runs in paybox-run/, plus the original capture in data.json).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const j = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const sc = (p) => j(p).structuredContent;
const pick = (...ps) => ps.find((p) => existsSync(new URL(p, import.meta.url)));
const d = j("../src/data.json");
const radar = sc("../paybox-run/v131/radar.json").narratives;
const story = (name) => radar.find((n) => n.narrative === name);
const rec = (k) => sc(pick(`../paybox-run/v132/receipt_${k}.json`, `../paybox-run/v131/receipt_${k}_local.json`));
const out = {
  board: String(d.board.text).split("\n").slice(0, 3),
  radar: ["GTA VI", "Trump", "COIL"].map((name) => {
    const n = story(name);
    return { name, signal: n.signal, leader: n.leader.symbol, leaderChange1h: n.leader.change1hPct, leaderLiq: n.leader.liquidityUsd, also: n.symbols.filter((s) => s !== n.leader.symbol)[0] ?? null,
      crowd: n.crowd && { question: n.crowd.question, changePts: n.crowd.changePts, probabilityPct: n.crowd.probabilityPct } };
  }),
  red: String(d.red.text),
  check: sc("../paybox-run/v13/check.json"),
  exit: readFileSync(new URL("../paybox-run/v131/ape_gta6_local.txt", import.meta.url), "utf8").split("\n").find((l) => l.includes("Exit plan")),
  tx: d.tx, txDetail: d.txDetail,
  receiptGta6: rec("gta6"), receiptAnt: rec("ant"),
  lag: sc("../paybox-run/v131/lag_ant.json"),
  lagOthers: [sc("../paybox-run/v131/lag_ttwo.json"), sc("../paybox-run/v13/lag.json")].map((l) => ({ symbol: l.symbol, question: l.question, verdict: l.verdict, jumpPts: l.jumpPts })),
};
writeFileSync(new URL("../src/story-data.json", import.meta.url), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1).slice(0, 2600));
