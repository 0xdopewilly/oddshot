# Oddshot

**The odds moved. The memes haven't. Yet.**

Oddshot is a [PayBox](https://paybox.sh) plugin that lets an AI agent turn prediction-market odds swings into Solana memecoin plays, behind a seatbelt.

When the crowd's odds on a real-world story jump (a launch, an election, a celebrity, an IPO), memecoins named after that story often move in the hours after. Oddshot finds those stories on Polymarket, finds the memes riding them, checks each token against three safety sources, labels the timing, and proposes a capped Jupiter swap that you approve in PayBox.

## Demo

The 1:51 demo (real PayBox runs, a live approved swap inside Claude, and the on-chain receipt) is attached to the [v1.1.0 release](../../releases/tag/v1.1.0), along with the built `plugin.mjs`.

Built by **Dappest Dev** ([@sentinel_dapper](https://x.com/sentinel_dapper)) for the MoonPay × PayBox Hackathon.

## Tools

| Tool | What it does |
|---|---|
| `oddshot_play` | The one-shot board: biggest odds swings → the meme riding each story → seatbelt verdict → timing (`EARLY`, `RUNNING`, `LATE`, `FADING`). |
| `hot_narratives` | Radar: clusters trending Solana pools into stories (names, tickers, even the token they're paired against), matches each to the Polymarket market that names it, and labels it **BOTH CROWDS** or **ON-CHAIN ONLY**. |
| `lag_check` | Tests the thesis on a real story: finds the biggest 6-hour odds swing in its Polymarket market and measures the meme during it and 1h, 6h and 24h after. **MEMES FOLLOWED**, **MEMES LED**, **MEMES FADED** or **NO REACTION**. |
| `receipt` | Grades a past call with real price and odds history: price at the call vs now, peak, drawdown, odds then vs now. **HIT**, **MISS** or **FLAT**, misses included. |
| `odds_movers` | Polymarket markets whose odds moved most in 1h or 24h, with story keywords. Skips sports, weather and price ladders. |
| `narrative_tokens` | Maps the swarm of Solana tokens riding a narrative: crowns the OG, tags copycats, flags copycat frenzies, then ranks and safety-checks the rest. |
| `check_token` | Full seatbelt report for any mint: GREEN, YELLOW or RED with every reason, plus how big a buy the pool can absorb at about 1% impact. |
| `why_pumping` | Reverse mode: give a memecoin, get the prediction-market story behind it. |
| `my_bags` | Values a wallet's positions and runs the seatbelt on each, so the agent can flag what to exit. |
| `ape` | Unsigned Jupiter swap for the user's PayBox wallet. Buy with an amount, sell with an amount or a percent. Buys come with an exit plan scaled to the token's own volatility: two take-profit levels and a stop. |

## Proof, not promises (v1.2–v1.3.2)

- **Lag check.** The thesis is that odds move first and memes follow. `lag_check` measures it per story instead of asserting it, and reports NO REACTION when that's what happened.
- **Honest timing.** A 24h odds move is judged against the meme's 6h and 24h moves, so a meme that ripped hours ago and went quiet does not read as EARLY (v1.3.2).
- **Size, entry, exit.** `check_token` reports how much the pool can absorb; `ape` returns the swap plus an exit plan (take 50% at +2× the stop, the rest at +4×, stop at 3× the token's average hourly range, clamped to 10–50%).

## Two crowds and receipts (v1.2)

- **Hot narratives radar.** On-chain traders and prediction-market traders are two different crowds. When both heat up on the same story, the signal is stronger. `hot_narratives` merges ticker families into one story (DJT, MAGA and TRUMP are Trump; TTWO is GTA VI), and the board marks plays whose OG is trending on-chain with 🔥.
- **Receipts.** `receipt` grades any past call from hourly price history and Polymarket odds history. Live examples: the original board call on $GTA6 graded **HIT, +154% since the call**; a later $ANT call, made after the meme had already moved, graded **FLAT**. Then-and-now prices come from the same pool's feed, because sources can price a token paired against an exotic quote very differently (fixed in v1.3.2).

## Narrative clusters: the OG, not the copycats

A hot story attracts a swarm of same-name tokens, and most are clones. Oddshot maps every token riding the story and:

- **Crowns the OG** among the deepest pools by liquidity, age, volume, holders, organic flow and Jupiter verification, penalising suspicious tokens and serial deployers.
- **Tags copycats**: newer tokens with under 20% of the OG's liquidity. Copycats are flagged by the seatbelt and are never the pick.
- **Flags copycat frenzies**: five or more launches on one story in 24 hours usually means the narrative is late, so the play score drops and the thesis says so.

Example from a live board: *"$GTA6 is the OG of 35 "GTA VI" tokens; 22 copycats skipped. Copycat frenzy: 11 launched in 24h, so this may be late."*

## The seatbelt

Every verdict cross-checks three sources:

- **Market data** (DexScreener): liquidity, pair age, price action.
- **RugCheck**: LP lock, insider and holder risks.
- **Jupiter audit**: mint and freeze authority, top-holder share, suspicious flag, serial-deployer history, organic volume.

Any danger flag is RED. Three of Oddshot's own warnings stack to RED. `ape` refuses to buy RED tokens, caps slippage at 10% and price impact at 5% (15% on sells), and **never blocks an exit**. Nothing is signed by the plugin: PayBox builds, simulates and asks for your approval.

## Setup in the PayBox developer portal

Network hosts:

```
gamma-api.polymarket.com
api.dexscreener.com
api.rugcheck.xyz
lite-api.jup.ag
api.mainnet-beta.solana.com
api.geckoterminal.com
clob.polymarket.com
```

No secrets are required. Jupiter's keyless API allows about 5 requests per 10 seconds per IP. For a dedicated quota, create a free key at [portal.jup.ag](https://portal.jup.ag), then add:

- Network host `api.jup.ag`
- Environment variable `JUP_API_HOST` = `api.jup.ag`
- Secret: host `api.jup.ag`, header `x-api-key`, value = your key

## Build

Node.js 24 and pnpm 11.11.0:

```bash
pnpm install --frozen-lockfile
pnpm test        # type-check, reproducible build, MCP conformance
```

Upload `dist/plugin.mjs` in the developer portal.

## Disclaimer

Memecoins are extremely risky. Oddshot reports signals and safety checks; it is not financial advice, and a GREEN verdict is not a guarantee.

## Video pipeline

`video/` holds the code that produced the demo: Remotion scenes (`video/src`), a neural voiceover with word-level timings and punctuated captions (`video/demo/tts.py`, `timeline.py`), a synthesized, ducked score with SFX (`video/demo/mix.py`), and capture scripts that run the real plugin and screenshot the live pages (`video/scripts`).
