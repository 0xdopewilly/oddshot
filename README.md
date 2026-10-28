# Oddshot

**The odds moved. The memes haven't. Yet.**

Oddshot is a [PayBox](https://paybox.sh) plugin that lets an AI agent turn prediction-market odds swings into Solana trades, behind a seatbelt: memecoin plays, majors (SOL, BTC, ETH) on macro odds, and exits to USDC when the odds turn.

When the crowd's odds on a real-world story jump (a launch, an election, a celebrity, an IPO), memecoins named after that story often move in the hours after. Oddshot finds those stories on Polymarket and Kalshi, finds the memes riding them, checks each token against three safety sources, labels the timing, and proposes a capped Jupiter swap that you approve in PayBox.

## Demo

**[The rug, explained](https://x.com/sentinel_dapper/status/2115150284020498757)** (3:05, on X): Oddshot flagged $NVIDIA, ChatGPT said it wouldn't buy, and a $2 test buy went in anyway. Five minutes later the coin's creator sold $39,979 into the pool. The video walks through what PayBox does when an AI buys a coin, every warning, the on-chain minute before the rug, and the same steps on $WIF in Claude, bought and sold. Every transaction is linked in the post.

**[Late, again](https://x.com/sentinel_dapper/status/2114719962522611996)** (2:48, on X): a motion comic where every screen is a real Oddshot run in ChatGPT with PayBox. A lag check on $ANT, a graded $GTA6 call, a RED safety flag on $TRUMP, and a $WIF buy and sell approved in PayBox ([buy](https://solscan.io/tx/4QdHzPTbeQMH8STTbkeWfvvaBXrBfoGE3nPiLHeqYobBKNBmXoyFQucwCwFZNCJSKqyGy61pWUe9FX9xL3YGcSSP), [sell](https://solscan.io/tx/4HJjZdtPvS6fqKTepazeYeGfvcKnUnY4gE6gjG6PbJXkdgWw3Fb77jVKPXwqD7s6vqaFbmHQeXL4N6ZtQYWhh2SK)).

The original 1:51 screen demo (real PayBox runs, a live approved swap inside Claude, and the on-chain receipt) is attached to the [v1.1.0 release](../../releases/tag/v1.1.0). The current bundle is on the [latest release](../../releases/latest).

Built by **Dappest Dev** ([@sentinel_dapper](https://x.com/sentinel_dapper)) for the MoonPay × PayBox Hackathon.

## Tools

| Tool | What it does |
|---|---|
| `oddshot_play` | The one-shot board: biggest odds swings on Polymarket and Kalshi → the meme riding each story → seatbelt verdict → timing (`EARLY`, `RUNNING`, `LATE`, `FADING`). Stories repricing on both venues are marked **BOTH MARKETS** and rank higher. |
| `hot_narratives` | Radar: clusters trending Solana pools into stories (names, tickers, even the token they're paired against), matches each to the Polymarket or Kalshi market that names it, and labels it **BOTH CROWDS** or **ON-CHAIN ONLY**. Pass `focus` to track one sector or keyword. |
| `lag_check` | Tests the thesis on a real story: finds the biggest 6-hour odds swing in its prediction market (Polymarket, or Kalshi) and measures the meme during it and 1h, 6h and 24h after. **MEMES FOLLOWED**, **MEMES LED**, **MEMES FADED** or **NO REACTION**. |
| `receipt` | Grades a past call with real price and odds history (Polymarket or Kalshi): price at the call vs now, peak, drawdown, odds then vs now. **HIT**, **MISS** or **FLAT**, misses included. |
| `odds_movers` | Polymarket and Kalshi markets whose odds moved most in 1h or 24h (Kalshi on 24h), with story keywords. Skips sports, weather, recurring markets and price ladders. |
| `narrative_tokens` | Maps the swarm of Solana tokens riding a narrative: crowns the OG, tags copycats, flags copycat frenzies, then ranks and safety-checks the rest. |
| `check_token` | Full seatbelt report for any mint: GREEN, YELLOW or RED with every reason (including a Token-2022 transfer fee, the rug setup of a pool under an hour old with an organic score of 0, and what the creator's wallet bought, sold and holds), plus how big a buy the pool can absorb at about 1% impact. |
| `rug_autopsy` | After a crash: the minute it happened, who sold, how much, what it did to the price and the pool's liquidity, and what trading looked like in the minute before. Names the cause: **CREATOR DUMP**, **WHALE DUMP**, **LIQUIDITY PULLED**, **SLOW BLEED** or **NO CRASH FOUND** (and **CAUSE UNKNOWN** when an old crash's seller isn't on record). |
| `why_pumping` | Reverse mode: give a memecoin, get the prediction-market story behind it. |
| `my_bags` | Values a wallet's positions and runs the seatbelt on each, so the agent can flag what to exit. Tokens waiting in take-profit orders count toward their coin. Small coins that collapsed are listed, not hidden. |
| `seatbelt` | Seatbelt mode for a wallet: per position, the rug check, whether the story behind the coin is heating or dying on Polymarket and Kalshi, and the macro mode. Calls **HOLD**, **TRIM** or **EXIT** with the exact sell into USDC, after cancelling any take-profit orders the coin's tokens wait in. |
| `macro_board` | Beyond memecoins: Fed, recession, crypto-law, Bitcoin-reserve, tariff and shutdown markets on both venues, scored risk-on or risk-off by volume, with a call on SOL, BTC and ETH: **ODDS LEAD**, **PRICED IN**, **SEATBELT** or **NO PUSH**. |
| `ape` | Unsigned Jupiter swap for the user's PayBox wallet: memecoins, or majors against USDC (SOL, BTC as Coinbase cbBTC, ETH as Wormhole Ether). Buy with an amount, sell with an amount or a percent (native SOL keeps 0.05 SOL for fees). Buys come with an exit plan scaled to the token's own volatility: two take-profit levels and a stop. |
| `top_up` | Checks that the wallet can pay for a trade (SOL for network fees, the USDC or SOL a buy spends, and the rent take-profit orders lock) and, when it can't, returns a MoonPay checkout link with the coin and amount filled in, plus the address to paste. |
| `take_profit` | Unsigned Jupiter order that sells an amount of a coin (or a share of the bag) when it reaches a target price, for USDC or SOL: ape's exit plan, made automatic. The tokens wait in the order on-chain until it fills. |
| `my_orders` | The wallet's open take-profit orders (target, distance from today's price, what each pays out, full address), and the take-profit plan for a coin (or for one buy of it) as the exact `take_profit` calls, counting orders already open, with every check `take_profit` runs and the plan's stop price. |
| `cancel_order` | Unsigned transaction that cancels a take-profit order and returns its tokens and rent. |

## Exits that run by themselves (v1.6)

- **Take-profit orders.** `ape`'s exit plan sets two targets from the coin's own volatility. `take_profit` turns each into a Jupiter order: the tokens wait in the order on-chain, and Jupiter sells them for USDC (or SOL) the moment the price gets there, whether or not anyone is watching. Once a buy lands, `my_orders` with the coin's mint, plus `spent` and `payWith` (the buy's own amount), gives the exact calls for what that buy brought in, for example "take_profit amount 1234.5 at price 0.18 (+20%), then take_profit amount 1234.5 at price 0.21 (+40%)". Without `spent` the plan covers the whole bag; with it, SOL, BTC, ETH or a coin bought before stays out of the orders. The calls name token amounts within the coin's own decimals rather than percents, since two calls built against the same balance would each read all of it. `my_orders` counts orders already open, so a half-placed plan is finished rather than doubled. It also lists what's open, how far each target is from today's price and each order's full address, and `cancel_order` brings the tokens back.
- **Honest limits.** Jupiter's orders only sell on the way up. A target at or below today's price, or within 1% of it, is refused, because an order there would just sell at once. Stop-losses exist in Jupiter's Trigger V2, but V2 needs a signed login and takes the signed transaction itself, and a PayBox plugin never holds a signature. So the stop is a price to sell at with `ape`: `my_orders` names it, measured from the entry of the plan the open orders came from once they're placed. The seatbelt watches for rugs, creator dumps and dying stories, not the price. Each order must pay out at least $5, locks about 0.0041 SOL of rent until it closes (a wallet's first USDC or wrapped-SOL payout account costs about 0.0015 SOL once), and pays 0.1% on the fill. Jupiter refuses any coin with a Token-2022 transfer-fee setting, even one set to 0%; for one of those, `my_orders` gives the plan's levels as sells to make with `ape`. Oddshot uses Jupiter's keyless Trigger V1, which Jupiter no longer develops but which works.
- **Refusals that reach the agent.** PayBox doesn't pass on why a proposal was refused, so `my_orders` runs every check `take_profit` runs (give it the same amount, price and payout to check one order), says so when they all pass (then Jupiter refused it, or was rate-limiting), and, when SOL is short, gives the MoonPay link itself. `top_up` takes an `orders` count and their payout as well. `take_profit` and `cancel_order` spend no keyless requests on text PayBox doesn't show.
- **The seatbelt knows.** Tokens waiting in an order aren't in the wallet, but they're still yours. `my_bags` and `seatbelt` count them toward their coin, so a coin whose whole bag waits in orders is still rug-checked and creator-checked. An EXIT on it names the orders to cancel, by full address, then the sell as a token amount, to make once the cancels have landed (a percent would count only what the wallet held before). A TRIM cancels only the orders the half it sells needs.
- **Fixes from live data.** Tokenized stocks and stablecoins (Jupiter tags them xstocks, rwa, equities or stable) keep most of their supply with the issuer, so the creator check skips them, the rug check no longer counts the issuer's authorities and treasury as rug signals, and they no longer take one of the wallet tools' creator checks or story reads. The autopsy now adds up a creator dump made in several pieces, counting each transaction once, and reads Meteora's DBC, Raydium's LaunchLab and Moonshot as bonding curves, which have no liquidity to pull. A story or macro read that can't reach Polymarket or Kalshi now says so, instead of reading as no story or a flat macro. Measured live through PayBox (1.6.1–1.6.3): a call gets about 10 s, about 4 s of which go to starting the plugin's sandbox, so every tool now finishes within about 5 s, reporting a slow source as unread instead of being cut off; and word-mention markets ("Will Trump say …?") and seat-range brackets no longer reach the board.

## Who sold, and who's about to (v1.5)

- **Rug autopsy.** `rug_autopsy` takes a mint and rebuilds the crash from on-chain trades and minute prices. The crash is the stretch of one to three minutes where the price fell furthest and stayed down, so a dump split across ten wallets, or across a minute boundary, counts as one crash. For that stretch it reports every sell, the biggest one, and the price and the pool's liquidity before and after. It also reports the creator's buys and sells, the biggest sellers, and the trading in the minute before. A pull is read from the pool's own reserves: trades leave the product of a constant-product pool's two reserves almost unchanged, so a product that shrank between an earlier trade and the crash means liquidity was removed. It ends with a verdict: CREATOR DUMP, WHALE DUMP, LIQUIDITY PULLED, SLOW BLEED or NO CRASH FOUND. Minute prices cover the pool's last 16 hours or so and its trades the last 24, while the creator's own trades go back to launch, so a creator dump shows at any age. When the creator's record can't be read, the autopsy asks you to try again instead of calling the coin clean. On $NVIDIA, one call reproduces what the video worked out by hand:

  ```
  🔎 RUG AUTOPSY · $NVIDIA (NVIDIA) · CREATOR DUMP
  👤 Creator BM47…yZ2b: bought 79.7% of supply, sold 99.3% in 5 sells ($41.8K), holds 0.0% now.
  💥 The crash: 2026-10-27 10:11:06 UTC · $40.0K for 477.7M tokens · price $0.00110 → $0.00000185 (-99.8%) · pool liquidity $83.4K → $3.4K
  🐝 The minute before: 265 trades, 199 wallets buying, a typical real buy $5.98, 196 trades worth $0.00.
  ```
- **The creator alarm.** The seatbelt now follows the wallet that launched the coin: what it bought at launch, what it has sold, and what it holds now. Each of these is RED on its own: the creator sold 1% of supply (or $500) in the last hour; the creator holds 30% or more of supply; or a hidden bag: 20% of supply or more that the creator bought at launch and has neither sold, kept, nor (on a launchpad coin) burned, so it is waiting in other wallets. $NVIDIA's creator had a hidden bag when Oddshot's $2 test buy went in. `check_token`, `ape` buys, `my_bags` and `seatbelt` all run the check (the wallet tools on the five largest coins), and in `seatbelt` a creator selling means EXIT. When the creator's history or wallet can't be read in full, the report says what wasn't checked instead of calling it clean, even on GREEN.
- **Top-ups with MoonPay.** `top_up` checks that the wallet can pay for a trade: SOL for network fees (a first buy also opens the token's account) and the USDC or SOL the buy spends. When something is short, it returns a MoonPay checkout link with the coin and amount filled in, plus the PayBox wallet address to paste. PayBox doesn't pass on why `ape` refused a trade, so `ape`'s description tells the agent to call `top_up` when a buy fails; `my_bags` and `seatbelt` point to it when SOL runs low. MoonPay's minimum is $20.

## One sector at a time (v1.4.2)

- **Focus.** `hot_narratives`, `oddshot_play` and `odds_movers` take `focus`: a sector (`stocks`, `ai`, `politics`, `sports`, `gaming`, `crypto`, `celebrities`) or any keyword such as `Tesla`. Ask for "the radar, stocks only" and you get stock-themed coins, nothing else. Asked for by an Oddshot user on X.
- **Securities stay out.** The stocks focus tracks stock-themed memecoins and company markets. Tokenized shares themselves (xStocks and similar) are securities, restricted in the US, and Oddshot never surfaces them.
- **Rate limits say so.** When GeckoTerminal rate-limits trending data, the radar now says to wait a minute instead of reporting a quiet market.

## Lessons from a real rug (v1.4.1)

- **The rug setup is RED.** On Oct 27, 2026 Oddshot's own $2 test buy of $NVIDIA was rugged: the coin's creator sold $39,979 into the pool five minutes later. Oddshot had flagged it YELLOW, with a pool 30 minutes old and an organic score of 0/100. From 1.4.1, a pool under an hour old with an organic score of 0 is RED on its own, and `ape` won't build the buy.
- **Transfer fees.** `check_token` and `ape` now read the mint itself. A Token-2022 transfer fee is a warning (RED at 10% or more), and so is a creator who can raise it later. $ANT, for example, takes 3% of every transfer.
- **Honest refusals.** Jupiter's price impact also counts costs that every size pays, such as a transfer fee or a route's spread. When that is what puts a buy over the 5% cap, `ape` now says a smaller size won't help, instead of suggesting one.
- **Collapsed bags are reported, not hidden.** `my_bags` and `seatbelt` used to skip positions under $0.50, so a rugged $2 bag simply vanished. Coins under $0.50 that crashed (down 80% or more in 24h, or a pool under $1,000) are now listed as collapsed.

## Beyond memecoins, and the seatbelt that gets you out (v1.4)

- **Macro board.** Prediction markets price the things that move all of crypto: Fed decisions, recession, crypto legislation, a US Bitcoin reserve, tariffs, shutdowns. `macro_board` reads them on Polymarket and Kalshi, scores each 24h move as risk-on or risk-off (a Fed hike getting likelier is risk-off; a crypto bill getting likelier is risk-on), weights it by volume, and calls SOL, BTC and ETH. Most days it says NO PUSH, and it says so plainly; it speaks up when the odds really shift.
- **Majors through the same swap.** `ape` buys and sells SOL, BTC (Coinbase cbBTC) and ETH (Wormhole Ether) against USDC. Majors are pinned by mint, so lookalike tokens (there are "cbBTC" clones with $3K of liquidity) never pass as the real thing; they skip memecoin rug checks but keep the slippage and price-impact caps, with a tighter exit plan (3–15% stop).
- **Seatbelt mode.** `seatbelt` looks at everything a wallet holds and answers "what do I do now?": EXIT on a rug flag or a dying story (its odds down 10+ points in 24h), TRIM on a cooling story or a risk-off macro, HOLD otherwise, each with the exact `ape` sell into USDC. Coins too thin to sell are marked as worth about $0 instead of inflating the total. Nothing is sold until you approve it in PayBox.

## Two markets (v1.4)

- **Kalshi joins Polymarket.** The board, `odds_movers`, the radar and `why_pumping` read both venues; every odds result names its venue. Kalshi's sports, weather, word-count, recurring and strike-ladder markets are skipped, as on Polymarket.
- **BOTH MARKETS.** When a story's odds move 3+ points on Polymarket and Kalshi in the same day, the play says so and ranks higher: two crowds of bettors repricing the same story is a louder signal than one.
- **Kalshi history.** `lag_check` and `receipt` take `venue` (`auto`, `polymarket`, `kalshi`). On `auto`, Polymarket stays the default and Kalshi is used only when its question names more of the story. Example: the $GTA6 receipt graded against Kalshi's "Will GTA 6 be released by Nov 19, 2026?" shows the odds going 50.5% → 89% since the call.
- **Kalshi never blocks the board.** If Kalshi is slow or down, Oddshot answers from Polymarket alone.
- **Clearer failures.** A GeckoTerminal rate limit now says to wait and retry instead of reading as missing price history, and `why_pumping` only lists markets that name the token as a whole word.
- **No grades on a broken feed.** If a pool's hourly history and its live price disagree by 2× or more, `receipt` says so instead of grading. GeckoTerminal's ELON/MUSK4 feed sat flat at about 7× the pool's on-chain price, which turned a real miss into a fake +88% HIT.

## Proof, not promises (v1.2–v1.3.2)

- **Lag check.** The thesis is that odds move first and memes follow. `lag_check` measures it per story instead of asserting it, and reports NO REACTION when that's what happened.
- **Honest timing.** A 24h odds move is judged against the meme's 6h and 24h moves, so a meme that ripped hours ago and went quiet does not read as EARLY (v1.3.2).
- **Size, entry, exit.** `check_token` reports how much the pool can absorb; `ape` returns the swap plus an exit plan (take 50% at +2× the stop, the rest at +4×, stop at 3× the token's average hourly range, clamped to 10–50%).

## Two crowds and receipts (v1.2)

- **Hot narratives radar.** On-chain traders and prediction-market traders are two different crowds. When both heat up on the same story, the signal is stronger. `hot_narratives` merges ticker families into one story (DJT, MAGA and TRUMP are Trump; TTWO is GTA VI), and the board marks plays whose OG is trending on-chain with 🔥.
- **Receipts.** `receipt` grades any past call from hourly price history and prediction-market odds history. Live examples: the original board call on $GTA6 graded **HIT, +154% since the call**; a later $ANT call, made after the meme had already moved, graded **FLAT**. Then-and-now prices come from the same pool's feed, because sources can price a token paired against an exotic quote very differently (fixed in v1.3.2).

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

`check_token` and `ape` also read the mint itself for a Token-2022 transfer fee (v1.4.1). `check_token`, `ape` buys, `my_bags` and `seatbelt` also follow the creator's wallet (v1.5).

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
api.elections.kalshi.com
datapi.jup.ag
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
