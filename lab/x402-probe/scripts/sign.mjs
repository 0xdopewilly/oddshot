const { PayboxClient } = await import("/home/dopewilly/.npm/_npx/64d29cfeead3ecaa/node_modules/@paybox-sh/sdk/dist/index.js");
const c = PayboxClient.fromConfig();
const id = process.argv[2];
const raw = await c.mcp.callTool("reopen_signing_window", { request_id: id }, "in-process");
const j = JSON.parse(raw.content.find((i) => i.type === "text").text);
console.log("now", new Date().toISOString(), "expires", j.plan?.proposal_expires_at, "status", j.status);
const x = j.plan?.x402;
if (j.status !== "pending_signature" || j.kind !== "x402" || x?.rail !== "solana" || x?.amount_atomic !== "2000" || x?.accepted?.asset !== "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" || x?.accepted?.payTo !== "9qCyPu7sLjnwgcbHYY76eqvtjsrdDxis9nn1sjD8CyJo") { console.log("plan not as expected, not signing"); process.exit(1); }
const t0 = Date.now();
try {
  const r = await c.completeX402({ response: { request_id: id, status: "pending_signature", output: null, approval_id: null, error: null }, plan: j.plan }, { autoSign: true, waitForApproval: { intervalMs: 1500, timeoutMs: 90000 } });
  console.log("secs", ((Date.now() - t0) / 1000).toFixed(1));
  const s = JSON.stringify(r, (k, v) => (/signature|secret|private/i.test(k) && typeof v === "string" ? "[hidden]" : v), 1);
  console.log(s.slice(0, 4000));
} catch (e) { console.log("secs", ((Date.now() - t0) / 1000).toFixed(1), "THREW", String(e?.message ?? e).slice(0, 1000)); }
const after = await c.getRequest(id);
console.log("final status", after.status, "error", after.error);
console.log(JSON.stringify(after.output, null, 1)?.slice(0, 3000));
