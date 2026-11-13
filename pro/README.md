# Oddshot Pro

The Oddshot board, sold per call over [x402](https://x402.org) through PayBox. Free Oddshot (the plugin in `../src`) stays free,
and the safety tools are never paid. Pro sells what a plugin can't do inside PayBox's ~5 s call: memory and time.

- **The board, rebuilt every minute** with no time limit: 40 odds movers read, 10 stories safety-checked, 3 coins each (the free board
  reads 20, checks 6 and 2), so it doesn't drop stories when a source is slow.
- **The watch:** the server remembers when it first saw each odds move and prints how long ago that was and what the meme has done since.
- **Odds moving, no safe meme yet:** stories the crowd is repricing that no liquid, safe coin rides yet.
- **A public scorecard** (`/`, free): every EARLY call is logged the minute it appears and graded 24 hours later from the price
  (HIT at +10%, MISS at −10%, FLAT between, the same lines as the `receipt` tool). Misses stay on the page.
- **No charge for nothing:** if the board can't be served (still building, nothing in the focus, a bad request), the server answers
  4xx/5xx and the x402 payment is cancelled instead of settled.

## Endpoints

| Route | Price | What |
|---|---|---|
| `GET /pro/board?window=24h\|1h&focus=…` | $0.05 USDC (x402, Solana) | the Pro board: `text` for the AI, plus `plays`, `scorecard` |
| `GET /` | free | the scorecard page |
| `GET /scorecard.json` | free | every call and its grade |
| `GET /health` | free | scan status, cache stats |

## Run

```sh
pnpm install
pnpm -C pro test                      # offline tests: grading, checkpoints, the watch
PRO_UNPAID_DEV=1 pnpm -C pro dev      # localhost only, no payments: http://127.0.0.1:8790
pnpm -C pro build                     # one file: pro/dist/server.mjs (Node 24, no node_modules needed)
```

| Variable | Default | |
|---|---|---|
| `PRO_PAY_TO` | (none) | Solana address that receives payments. Without it `/pro/board` answers 503. Must not be the paying wallet. |
| `PRO_PRICE` | `$0.05` | Price per board. The plugin's `pro_board` offers at most $0.05, so keep it at or below that. |
| `PRO_FACILITATOR` | `https://facilitator.payai.network` | x402 facilitator that verifies and settles (pays the Solana fee). |
| `PRO_PUBLIC_URL` | `http://HOST:PORT` | Public base URL, exactly as baked into the plugin (`ODDSHOT_PRO_URL`). Requests are served as if they arrived there, so the x402 challenge names the URL PayBox was asked to pay (hosts that end HTTPS at a proxy would otherwise show `http://`, and PayBox refuses the mismatch). The board links the scorecard here. |
| `PRO_DB` | `data/pro.db` | SQLite file. Keep it on a persistent disk. |
| `HOST` / `PORT` | `127.0.0.1` / `8790` | |
| `PRO_UNPAID_DEV` | | `1` serves the board without payment (refused unless on localhost). |
| `PRO_NO_SCAN` | | `1` skips the scanner (for tests). |

## Deploy

Live at https://oddshot-pro-production.up.railway.app (Railway project `oddshot-pro`, volume at `/data`). `pnpm -C pro deploy` builds
the bundle and ships it; `.railwayignore` limits the upload to the Dockerfile and `dist/server.mjs`. Variables are set on the service
(`railway variable list --service oddshot-pro`, run in `pro/`), so changing `PRO_PAY_TO` or `PRO_PRICE` needs no new plugin build.

Any other host that runs a container with a persistent volume: `docker build -t oddshot-pro pro` after `pnpm -C pro build`, mount a volume
at `/data`, set `PRO_PAY_TO` and `PRO_PUBLIC_URL`. Then build the plugin with the server's address so `pro_board` appears:

```sh
ODDSHOT_PRO_URL=https://your-pro-host pnpm build:pro   # bakes the URL into dist/plugin.mjs (PayBox's sandbox has no env vars)
```

and add the server's host to the plugin's Network access in the PayBox portal (PayBox only pays configured hosts).
