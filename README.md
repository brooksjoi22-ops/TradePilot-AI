# TradePilot AI — Full Chart Vision + Real Market

## What this version does
- Uploads a chart screenshot and sends it to a server-side vision model.
- Cross-checks the visual chart with live OHLC candles.
- Gold XAU/USD and Forex use Twelve Data; crypto uses Binance.
- Keeps the 15-second minimum scan animation.
- Adds a validation gate: the UI can mark a setup as high-confidence only when the historical test supports the configured 80% target. This is a target/gate, not a guarantee.

## Run
1. Install Node.js 20+.
2. Open this folder in a terminal.
3. Copy `.env.example` to `.env` and put your OpenAI API key in it.
4. Run `npm install`.
5. Run `npm start`.
6. Open `http://localhost:3000`.
7. For Gold/Forex, also enter your Twelve Data key in the website settings, unless you later wire the server to use the Twelve Data key from `.env`.

The OpenAI key stays server-side and is not placed in browser JavaScript.
