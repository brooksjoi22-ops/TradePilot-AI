import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
const TD_KEY = process.env.TWELVE_DATA_API_KEY || '';
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
app.use(express.static('.'));
app.use(express.json({limit:'12mb'}));

function cleanJson(text){
  const s=(text||'').trim().replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/```$/,'').trim();
  try{return JSON.parse(s)}catch{}
  const a=s.indexOf('{'),b=s.lastIndexOf('}');
  if(a>=0&&b>a){try{return JSON.parse(s.slice(a,b+1))}catch{}}
  throw new Error('AI returned invalid JSON');
}

app.get('/api/health',(req,res)=>res.json({ok:true, vision:!!process.env.OPENAI_API_KEY, market:!!TD_KEY, model:MODEL}));

app.get('/api/market-data', async (req,res)=>{
  try{
    if(!TD_KEY) return res.status(503).json({error:'TWELVE_DATA_API_KEY is not configured on the server.'});
    const {symbol,interval='1min',outputsize='220'}=req.query;
    if(!symbol) return res.status(400).json({error:'symbol is required'});
    const url=`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&outputsize=${encodeURIComponent(outputsize)}&apikey=${encodeURIComponent(TD_KEY)}`;
    const r=await fetch(url);
    const j=await r.json();
    if(!r.ok || j.status==='error' || !j.values) return res.status(r.status||502).json({error:j.message||'Twelve Data request failed'});
    res.json(j);
  }catch(e){res.status(500).json({error:e?.message||'Market data proxy failed'});}
});

app.post('/api/analyze-chart', async (req,res)=>{
  try{
    if(!process.env.OPENAI_API_KEY) return res.status(503).json({error:'OPENAI_API_KEY is not configured on the server.'});
    const {imageData,symbol,timeframe,market,liveCandles=[],higherCandles=[],technical={},validation={}}=req.body||{};
    if(!imageData) return res.status(400).json({error:'Chart image is required.'});
    const recent=liveCandles.slice(-80).map(x=>({t:x.t,o:x.o,h:x.h,l:x.l,c:x.c,v:x.v}));
    const higher=higherCandles.slice(-40).map(x=>({t:x.t,o:x.o,h:x.h,l:x.l,c:x.c}));
    const prompt=`You are the chart-vision layer of a professional trading research scanner. Analyze the uploaded ${market} chart for ${symbol} on ${timeframe}. The image is the primary visual source for candles, visible structure, patterns, support/resistance and timeframe labels. The supplied live OHLC data is the authoritative source for the current market price and should be used to cross-check the chart.

IMPORTANT: Never claim 80% accuracy. 'confidence' is a model confidence score, NOT historical accuracy. If visual structure and live data disagree, prefer WAIT. Do not invent a price that is not consistent with the supplied live price. Do not promise profit.

Technical engine result: ${JSON.stringify(technical)}
Historical validation result: ${JSON.stringify(validation)}
Recent live candles: ${JSON.stringify(recent)}
Higher-timeframe candles: ${JSON.stringify(higher)}

Return ONLY valid JSON with exactly these keys:
{"bias":"BUY|SELL|WAIT","confidence":0,"entry":0,"stop_loss":0,"tp1":0,"tp2":0,"timeframe":"","detected_symbol":"","detected_market":"","visual_structure":"","patterns":[],"support":0,"resistance":0,"confluence":[],"invalidation":"","reason":"","agreement":"AGREE|MIXED|DISAGREE"}

Detection rules: If the chart header/axis/watermark clearly shows an instrument (for example XAUUSD, GOLD, BTCUSDT, EURUSD), return it in detected_symbol using a normalized symbol when possible. If the chart clearly shows a timeframe (for example 15m, 1H, 4H, 1D), return it in timeframe. If either is not readable, return an empty string instead of guessing.

Rules: confidence must be 0-100. If validation.winRate is below 80, or validation.trades is too small, prefer WAIT unless the setup is exceptionally clear; never fake the validation number. Entry/SL/TP should be realistic relative to current price and volatility. Use the visible chart to describe structure, but use live data for exact current price.`;

    const response = await client.responses.create({
      model: MODEL,
      input:[{role:'user',content:[
        {type:'input_text',text:prompt},
        {type:'input_image',image_url:imageData,detail:'high'}
      ]}]
    });
    const ai=cleanJson(response.output_text);
    res.json({ok:true,model:MODEL,analysis:ai});
  }catch(e){
    console.error(e);
    res.status(500).json({error:e?.message||'Vision analysis failed'});
  }
});

app.listen(PORT,'0.0.0.0',()=>console.log(`TradePilot AI server running on port ${PORT}`));
