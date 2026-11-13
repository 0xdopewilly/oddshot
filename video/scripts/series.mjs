// Real hourly series for the story's charts: Polymarket odds (CLOB) and token prices (GeckoTerminal), same sources as the plugin.
import { writeFileSync } from "node:fs";
const get = async (u) => { const r = await fetch(u, { headers: { accept: "application/json" } }); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); };
const S = (iso) => Math.floor(Date.parse(iso) / 1000);
const pool = async (mint) => (await get(`https://api.dexscreener.com/tokens/v1/solana/${mint}`))
  .filter((p) => p.chainId === "solana" && p.baseToken?.address === mint).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0].pairAddress;
const closes = async (mint, from, to) => {
  const o = await get(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${await pool(mint)}/ohlcv/hour?aggregate=1&limit=1000&currency=usd&token=${mint}`);
  return o.data.attributes.ohlcv_list.map((c) => [c[0], c[4]]).filter(([t]) => t >= from && t <= to).sort((a, b) => a[0] - b[0]);
};
const now = Math.floor(Date.now() / 1000);
const out = {};
const m = (await get(`https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent("Anthropic public ticker ANT")}&limit_per_type=8&events_status=all`))
  .events.flatMap((e) => e.markets ?? []).find((x) => /\bticker be \$ANT\b/i.test(x.question));
const tok = JSON.parse(m.clobTokenIds)[0];
const a0 = S("2026-10-22T12:00:00Z"), a1 = Math.min(now, S("2026-10-24T08:00:00Z"));
const h = await get(`https://clob.polymarket.com/prices-history?market=${tok}&startTs=${a0}&endTs=${a1}&fidelity=60`);
out.ant = { question: m.question, odds: h.history.map((x) => [x.t, x.p]), price: await closes("7ypCq2CJ4fnbtS3z2B1W1UT2he5E3u7Md6Gy1ri7uGrQ", a0, a1), swing: [S("2026-10-23T00:00:00Z"), S("2026-10-23T07:00:00Z")] };
out.gta6 = { call: S("2026-10-16T21:44:00Z"), price: await closes("4kjruqGHDsSqkMdFfCjV7Vb62HPFhtXyWc2t6JpQzDnz", S("2026-10-16T06:00:00Z"), now) };
out.elon = { call: S("2026-10-16T18:00:00Z"), price: await closes("B2GESkSErPjuCq6n4LcaJP5v2z1kJnw3xHVZnop2sZx", S("2026-10-15T00:00:00Z"), now) };
writeFileSync(new URL("../src/series.json", import.meta.url), JSON.stringify(out));
for (const [k, v] of Object.entries(out)) console.log(k, "odds" in v ? `odds ${v.odds.length}` : "", `price ${v.price.length}`, v.price.length ? `${new Date(v.price[0][0] * 1e3).toISOString()} → ${new Date(v.price.at(-1)[0] * 1e3).toISOString()}` : "");
