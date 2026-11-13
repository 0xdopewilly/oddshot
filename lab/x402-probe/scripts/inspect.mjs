const { PayboxClient } = await import("/home/dopewilly/.npm/_npx/64d29cfeead3ecaa/node_modules/@paybox-sh/sdk/dist/index.js");
const c = PayboxClient.fromConfig();
const raw = await c.mcp.callTool("reopen_signing_window", { request_id: process.argv[2] }, "in-process");
const text = raw.content?.find((i) => i.type === "text")?.text ?? "";
let j; try { j = JSON.parse(text); } catch { console.log("isError", raw.isError, text.slice(0, 800)); process.exit(); }
const trim = (x) => {
  if (typeof x === "string") return x.length > 100 ? x.slice(0, 50) + `…(${x.length})` : x;
  if (Array.isArray(x)) return x.slice(0, 5).map(trim);
  if (x && typeof x === "object") { const o = {}; for (const [k, v] of Object.entries(x)) o[k] = /signature|secret|private/i.test(k) && typeof v === "string" ? "[hidden]" : trim(v); return o; }
  return x;
};
console.log("isError", raw.isError); console.log(JSON.stringify(trim(j), null, 1).slice(0, 6000));
