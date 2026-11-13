# Oddshot Pro: sketch (Oct 31, planning only; build after Monday's results)

## The idea

Free Oddshot stays exactly as it is. Pro sells what a plugin can't do: memory and time. Today every call starts from zero inside PayBox's sandbox and must finish in about 5 seconds. A small server can watch the markets all day, remember what it saw, and answer in under a second.

## Rule one: safety is never paid

check_token, seatbelt, rug_autopsy, the creator alarm, my_bags, my_orders, take_profit, cancel_order, top_up and ape stay free forever. Charging people to avoid a rug would undercut the whole point of Oddshot.

## Free vs Pro

| Free (today's 17 tools) | Pro (needs the server) |
|---|---|
| The board, sampled in ~5 s when you ask | The board, built every minute from every Polymarket and Kalshi market, answered instantly |
| "This market moved" | "This market moved 12 minutes ago and the coin hasn't moved yet": exact timing, because the server was watching |
| Receipts you ask for one at a time | The full scorecard: every call, graded automatically (the page itself stays free and public) |
| Narrative search on demand | Early-window history: how fast each story's coins usually catch up (later) |
| | Alerts the moment an EARLY call appears (later, see phase 3) |

## Pricing

- Pay per call in USDC, no accounts and no subscriptions. Start at 5 cents for the Pro board and adjust.
- Honest maths: 1,000 paid calls a day is $50 a day. The first goal is proving the model works, not big revenue.

## How a paid call works

1. The user asks their AI for the Pro board.
2. The plugin's new `pro_board` tool returns an x402 proposal (the helper is already in src/paybox.ts: `proposeX402`, Solana USDC, maxAmount 50000 = $0.05) pointing at Oddshot's server.
3. PayBox shows the charge, the user approves, and PayBox pays and fetches the result.
4. The server checks the payment through an x402 facilitator and returns the board. The USDC lands in Oddshot's own receiving wallet (a new one, not the test wallet).

## The server

- One small service: an HTTPS API with x402 middleware (Hono or Express) plus a scanner that runs every minute and stores snapshots in a small database.
- Cost: about $5–20 a month for hosting. The data sources stay keyless (Polymarket, Kalshi, DexScreener, GeckoTerminal, Jupiter), and caching on the server eases their rate limits.
- Bonus: the free tools can read the server's cached snapshots too, which fixes the speed problem (receipt took 11 s on Oct 29). If the server is down, they fall back to reading the sources directly, as today.

## Verify before building (half a day, with a $0.01 test endpoint)

1. When a plugin tool returns an x402 proposal, does the paid response reach the AI? PayBox replaces proposal results with its signature wrapper, so check where the server's answer goes.
2. Does every payment need a manual approval, or can users set an auto-approve limit for small amounts? This decides pay-per-call vs a day pass.
3. Can the plugin call our server? Its domain has to be added to the plugin's allowed hosts, like datapi.jup.ag was.
4. Which facilitator settles Solana USDC, and what does it charge?

## Phases

1. **Verify (half a day):** the four questions above.
2. **Pro v1 (about a week):** the server with the scanner and /pro/board, the `pro_board` tool, and the public scorecard page.
3. **Grow:** list the API in the x402 Bazaar, so any paying agent can buy Oddshot calls, not just PayBox users. Then a day pass with alerts (Telegram), and the free tools reading the server's cache.

## Risks

- Approval friction: if every 5-cent call needs a tap, a day pass may suit better (question 2).
- A day pass keyed to a wallet address can be spoofed, since anyone can type an address. Pay-per-call avoids that.
- Paid calls must be graded in public too, misses included, or Pro loses the trust free Oddshot built.
- Keep Pro as data and analysis, never promises of returns: "not financial advice", no win rates in marketing without the full scorecard beside them.
