# TradePilot AI

AI-assisted chart scanner for Gold, Forex and Crypto with live technical analysis and historical validation.

## Railway
1. Push these files to `brooksjoi22-ops/TradePilot-AI` on `main`.
2. Railway should auto-deploy.
3. In Railway → Variables add `OPENAI_API_KEY` for chart vision and `TWELVE_DATA_API_KEY` for XAU/USD + Forex.
4. Optional: set `OPENAI_MODEL` to the vision-capable model available to your API account.
5. Railway → Networking → Generate Domain.

Crypto uses Binance public candles. Gold can fall back to PAXGUSDT as a clearly-labelled gold proxy when Twelve Data XAU/USD is unavailable.

## Local
`npm install`
`npm start`

Open http://localhost:3000

The displayed AI confidence is not historical accuracy and the backtest is informational only.
