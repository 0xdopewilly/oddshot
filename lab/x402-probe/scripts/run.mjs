const { PayboxClient } = await import("/home/dopewilly/.npm/_npx/64d29cfeead3ecaa/node_modules/@paybox-sh/sdk/dist/index.js");
const c = PayboxClient.fromConfig();
const t0 = Date.now();
const tool = process.argv[2] || "pro_probe";
try {
  const r = await c.runPlugin({ pluginId: "4554e9ce-c4e7-4ba7-bcf0-bb34100253f7", toolId: tool, input: tool === "pro_probe" ? { target: "blocksize_btc" } : {} }, { autoSign: true, timeoutMs: 120000 });
  console.log("secs", ((Date.now() - t0) / 1000).toFixed(1));
  console.log("outcome", r.outcome, "reason", r.reason ?? "-", "request", r.requestId);
  const resp = r.response;
  if (resp) console.log("status", resp.status, "error", resp.error, "retryable", resp.retryable, "hint", resp.retry_hint);
  console.log(JSON.stringify(resp?.output ?? null, null, 1).slice(0, 3000));
} catch (e) {
  console.log("secs", ((Date.now() - t0) / 1000).toFixed(1), "THREW", e?.status ?? "", e?.reason ?? "", String(e?.message ?? e).slice(0, 800));
  if (e?.body) console.log(String(e.body).slice(0, 800));
}
