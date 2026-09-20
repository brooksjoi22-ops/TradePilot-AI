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
\n\n## AI Vision troubleshooting\nThe server exposes the actual OpenAI vision error in the scanner when the vision request fails. Keep OPENAI_API_KEY configured in Railway Variables.\n

## v7 fix
- Fixed browser ReferenceError where lockedSymbol/lockedTimeframe/lockedMarket were out of scope during AI chart analysis.
- Live symbol/timeframe remain locked while the AI vision layer analyzes the uploaded chart.


### v9.1 timeframe hotfix
AI Vision timeframe phrases such as 5-minute/5 minute/5m are now parsed with regex. When Vision identifies a supported timeframe that differs from the dropdown, the scanner refreshes live candles, higher-timeframe confirmation, technical analysis, and validation on the detected timeframe before rendering the final result.
