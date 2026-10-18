// Runs the built plugin's tools for real and saves their outputs for the video.
// Usage: node scripts/capture.mjs <wallet> [redMint]
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const PLUGIN = new URL("../../dist/plugin.mjs", import.meta.url).pathname;
const [wallet = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", redMint = "Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw"] = process.argv.slice(2);

function call(name, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [PLUGIN], { stdio: ["pipe", "pipe", "ignore"] });
    let buf = "";
    child.stdout.on("data", (d) => {
      buf += d;
      const line = buf.split("\n").find((l) => l.includes('"id":2'));
      if (!line) return;
      const r = JSON.parse(line).result ?? {};
      child.kill();
      resolve({ args, isError: !!r.isError, text: (r.content ?? []).map((c) => c.text).join("\n"), data: r.structuredContent ?? null });
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args, _meta: {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "oddshot-capture", version: "1" },
      "io.modelcontextprotocol/clientCapabilities": {} } } }) + "\n");
  });
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const board = await call("oddshot_play", {});
const play = board.data?.plays?.find((p) => p.token) ?? board.data?.plays?.[0];
await pause(11000);
const check = play?.token ? await call("check_token", { mint: play.token.mint }) : null;
await pause(11000);
const red = await call("ape", { sender: wallet, mint: redMint, amount: "1" });
await pause(11000);
const ape = play?.token ? await call("ape", { sender: wallet, mint: play.token.mint, amount: "0.005", payWith: "SOL" }) : null;

const out = { capturedAt: new Date().toISOString(), wallet, play, board, check, red, ape };
writeFileSync(new URL("../src/data.json", import.meta.url), JSON.stringify(out, null, 2));
console.log(board.text, "\n---\n", check?.text, "\n---\n", red.text, "\n---\n", ape?.text);
