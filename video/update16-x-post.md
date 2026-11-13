# X post: Oddshot 1.6 update (Wed Oct 28) — attach Downloads\oddshot-1.6-update.png (video/out/update16/oddshot-1.6.png)

Post the replies directly under the main post, in order. Every number below is from a live run on Oct 28 through PayBox.

## Main post

Oddshot 1.6 is live on @PayBox.

10 tools on Monday, 17 today. Here's what's new:

1. Auto take-profits. After a buy, Oddshot turns your exit plan into Jupiter limit orders that sell by themselves when the price gets there.

2. Rug autopsy. Point it at a coin that crashed. It tells you who sold, how much, and why: creator dump, whale dump or pulled liquidity.

3. Creator alarm. Every safety check now reads the creator's wallet. RED the moment the creator sells, sits on a big bag, or hides one.

4. Kalshi + Polymarket. Odds from both crowds. A story moving on both ranks higher.

5. Sector focus. Follow one sector: stocks, AI, politics or any keyword. @AiFlippa asked for this one. It's live.

6. @moonpay top-ups. Short on SOL or USDC for a trade? Oddshot gives you a MoonPay link for the exact amount.

Also new: a seatbelt that says hold, trim or exit for every coin you hold, and a macro board that reads Fed and recession odds for SOL, BTC and ETH.

Your AI builds every trade. PayBox signs it. Oddshot never touches your keys.

## Reply 1: the docs (keep links out of the main post, so it reaches more people)

Everything Oddshot does, in plain words: how it works, how to switch it on in PayBox, what to ask, and all 17 tools.

0xdopewilly.github.io/oddshot

## Reply 2: the live test

Tested live today, start to finish, on Solana: a $4 $WIF buy, a take-profit order on it, the cancel, and the sell back. The whole round trip cost about 4 cents.

Buy: solscan.io/tx/AGbmTsmF2BHX8gxf9CN63r8FwNtqHUcbuL5Zmu3VKMS1A9L9FCmYkJaRB6RYsXZ6N4RTqyuQPsCn5CtYEfh2xzz
Take-profit order: solscan.io/tx/3H2Grx8yD6ALnF1ucPFqtM8tDZ3rQKdTt51atHshqMXmpHzTPDxVZ5RNwXG9a3ZJTeqhE2vVnDYnkLXXoViGipsT
Cancel: solscan.io/tx/5BcAuqz3W9p5KmwwAjhRFoEoTjDde2frhxozVd9Cym1zr6mgq7kDysNNdj4fHNhsLm1AA3Rfv8QeCLraa2tcG52Q
Sell: solscan.io/tx/23MT18t5rNd9gT9mnndfzD171WKvS5YziD4opvqSnouXXrZtpBnCXGY5rXK2UaEfRSohvqzVm9B7NJuNnpiho2rt

## Reply 3: the autopsy, and the code

The rug autopsy on $NVIDIA, the coin from yesterday's video:

CREATOR DUMP. The creator sold 477.7M tokens, 48% of supply, for $40.1K in one transaction. The price fell 99.8% that minute and the pool went from $83.6K to $3.4K.

Code: github.com/0xdopewilly/oddshot
