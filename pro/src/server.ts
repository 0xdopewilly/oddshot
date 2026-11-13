// Oddshot Pro: the paid board over x402, plus the free public scorecard.
//   GET /pro/board?window=24h|1h&focus=…  paid (USDC on Solana, settled by an x402 facilitator); answers from the latest scan
//   GET /scorecard.json                    free: every call and its grade
//   GET /                                  free: the scorecard page
//   GET /health                            free: scan status
// A paid request that can't be served (board not built yet, nothing in the focus, a bad focus) answers 4xx/5xx, and the x402 middleware
// then cancels the payment instead of settling it: nobody pays for an empty answer.
import { serve } from "@hono/node-server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { Hono } from "hono";
import { installFetchCache } from "./cache.js";
import { boardText, scorecardPage } from "./format.js";
import { withOrigin } from "./origin.js";
import { summarize } from "./grade.js";
import { Scanner, WINDOWS, type Window } from "./scanner.js";
import { Store } from "./store.js";

// The plugin code calls the global fetch when it runs, so the cache applies to it from here on.
const cacheStats = installFetchCache();
const env = process.env;
const PORT = Number(env.PORT ?? 8790);
const HOST = env.HOST ?? "127.0.0.1";
const PAY_TO = env.PRO_PAY_TO ?? "";
const PRICE = env.PRO_PRICE ?? "$0.05";
const FACILITATOR = env.PRO_FACILITATOR ?? "https://facilitator.payai.network";
/** Where people find the scorecard; the board links it. */
const PUBLIC_URL = (env.PRO_PUBLIC_URL ?? `http://${HOST}:${PORT}`).replace(/\/$/, "");
/** Requests are served as if they arrived here, so the x402 challenge names the URL the plugin proposed (see origin.ts). */
const PUBLIC_ORIGIN = env.PRO_PUBLIC_URL ? new URL(PUBLIC_URL).origin : null;
/** Local testing only: serves /pro/board without payment. Refused unless the server listens on localhost. */
const UNPAID = env.PRO_UNPAID_DEV === "1";
const SOLANA = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

if (UNPAID && HOST !== "127.0.0.1" && HOST !== "localhost") throw new Error("PRO_UNPAID_DEV is for localhost only.");
if (!PAY_TO && !UNPAID) console.warn("PRO_PAY_TO is not set: /pro/board answers 503 until a receiving wallet is configured.");

const store = new Store(env.PRO_DB ?? "data/pro.db");
const scanner = new Scanner(store, (m) => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`));
const app = new Hono();

if (PAY_TO && !UNPAID) {
  const resourceServer = new x402ResourceServer(new HTTPFacilitatorClient({ url: FACILITATOR })).register(SOLANA, new ExactSvmScheme());
  app.use(paymentMiddleware({
    "GET /pro/board": {
      accepts: { scheme: "exact", price: PRICE, network: SOLANA, payTo: PAY_TO, maxTimeoutSeconds: 60 },
      description: "Oddshot Pro board: prediction-market odds moves turned into Solana meme plays, rebuilt every minute, with how long each move has been watched and what the meme did since.",
      mimeType: "application/json",
      serviceName: "Oddshot Pro",
      tags: ["solana", "memecoins", "prediction-markets", "polymarket", "kalshi"],
    },
  }, resourceServer));
}

const fail = (c: any, status: number, error: string) => c.json({ error, charged: false }, status);

app.get("/pro/board", async (c) => {
  if (!PAY_TO && !UNPAID) return fail(c, 503, "Oddshot Pro is not configured to take payments yet.");
  const window = (c.req.query("window") ?? "24h") as Window;
  if (!WINDOWS.includes(window)) return fail(c, 400, "window must be 24h or 1h.");
  const focus = c.req.query("focus")?.trim() || undefined;
  if (focus && (focus.length < 2 || focus.length > 40)) return fail(c, 400, "focus must be 2 to 40 characters.");
  let board;
  try {
    board = await scanner.boardFor(window, focus);
  } catch (e) {
    return fail(c, 400, e instanceof Error ? e.message : String(e));
  }
  if (!board) return fail(c, 503, "The Pro board is still being built (the first scan takes about a minute). Try again shortly.");
  if (focus && !board.plays.some((p) => p.token)) return fail(c, 404, `No plays in ${board.focus ?? focus} right now.`);
  const summary = summarize(store.calls(5000));
  return c.json({
    text: boardText(board, summary, PUBLIC_URL),
    window: board.window, focus: board.focus, builtAt: new Date(board.builtAt).toISOString(), plays: board.plays,
    scorecard: { ...summary, url: PUBLIC_URL },
  });
});

app.get("/scorecard.json", (c) => {
  const calls = store.calls(5000);
  return c.json({ summary: summarize(calls), calls });
});

app.get("/", (c) => {
  const calls = store.calls(5000);
  return c.html(scorecardPage(calls, summarize(calls)));
});

app.get("/health", (c) => c.json({
  ok: WINDOWS.every((w) => scanner.boards.has(w)),
  payments: PAY_TO && !UNPAID ? { network: SOLANA, price: PRICE, payTo: PAY_TO, facilitator: FACILITATOR } : null,
  boards: Object.fromEntries(WINDOWS.map((w) => {
    const b = scanner.boards.get(w);
    return [w, b ? { builtAt: new Date(b.builtAt).toISOString(), ageSeconds: Math.round((Date.now() - b.builtAt) / 1000), buildSeconds: b.ms / 1000, plays: b.plays.length } : null];
  })),
  errors: Object.fromEntries(scanner.errors),
  cache: cacheStats(),
}));

serve({ fetch: (req, info) => app.fetch(withOrigin(req, PUBLIC_ORIGIN), info), port: PORT, hostname: HOST }, () => console.log(`Oddshot Pro on http://${HOST}:${PORT}${UNPAID ? " (UNPAID dev mode)" : ""}`));
if (env.PRO_NO_SCAN !== "1") scanner.start();
