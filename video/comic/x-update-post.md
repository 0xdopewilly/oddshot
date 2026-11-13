# X update post: 24 hours of Oddshot (attach out/oddshot-update-card.png)

Oddshot update: v1.3.3 is now live on @PayBox.

Recording my new demo exposed a few things I didn't like, so I spent the last 24 hours fixing them. Five releases later, Oddshot has gone from 7 tools to 10.

The three new ones:

Radar. Finds stories heating up in two places at once: trending on-chain and moving on Polymarket. If only one crowd cares, it tells you.

Lag check. Oddshot's whole idea is that prediction-market odds move first and the memes follow. This tool tests that on real history. Example: the odds of Anthropic's ticker being $ANT jumped from 22% to 61%. The meme dipped at first, then climbed 15% the next day. When the memes don't react, it says that too.

Receipts. Oddshot grades its own calls. My $GTA6 call from Oct 16 is up 148%. Misses get graded the same way.

Plus fixes under the hood:
- It now reads every liquidity pool a token has. Before, it could grab a tiny one: WIF showed $137K of liquidity instead of the real $5.4M.
- Safety checks show how much you can buy before you move the price about 1%.
- Buys come with exit plans sized to how volatile the coin is.
- Market matching uses whole words, so "ANT" no longer matches the wrong market.
- When something fails, the error tells you why.

To try it: open PayBox, switch on Oddshot under Plugins, and ask ChatGPT or Claude something like "what's the odds-to-meme board right now?"

Oddshot is one of 13 finalists in the @MoonPay × @PayBox hackathon. Still shipping.

New demo on Monday.
