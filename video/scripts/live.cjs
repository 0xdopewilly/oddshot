// Screenshots of the real public pages behind the demo (Polymarket market, DexScreener token, RugCheck report).
const { chromium } = require(process.env.HOME + "/Genlayer/demo-video/src/node_modules/playwright-core");
const fs = require("fs");
const exe = fs.readdirSync(process.env.HOME + "/.cache/ms-playwright").filter((d) => d.startsWith("chromium_headless_shell")).sort().pop();
const CHROME = `${process.env.HOME}/.cache/ms-playwright/${exe}/chrome-linux/headless_shell`;
const MINT = "4kjruqGHDsSqkMdFfCjV7Vb62HPFhtXyWc2t6JpQzDnz";
const pages = [
  ["polymarket", "https://polymarket.com/event/of-views-of-grand-theft-auto-vi-launch-trailer-on-week-1"],
  ["dexscreener", `https://dexscreener.com/solana/${MINT}`],
  ["rugcheck", `https://rugcheck.xyz/tokens/${MINT}`],
  ["jupiter", `https://jup.ag/tokens/${MINT}`],
];
(async () => {
  const exePath = fs.existsSync(CHROME) ? CHROME : fs.readdirSync(`${process.env.HOME}/.cache/ms-playwright/${exe}`).map((d) => `${process.env.HOME}/.cache/ms-playwright/${exe}/${d}/chrome-headless-shell`).find(fs.existsSync);
  const browser = await chromium.launch({ executablePath: exePath });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5, colorScheme: "dark",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36" });
  for (const [name, url] of pages) {
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
      await page.waitForTimeout(7000);
      await page.screenshot({ path: `public/live/${name}.png` });
      console.log(name, "ok", (await page.title()).slice(0, 70));
    } catch (e) { console.log(name, "fail", e.message.slice(0, 80)); }
    await page.close();
  }
  await browser.close();
})();
