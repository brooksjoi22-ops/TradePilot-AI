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
    const recent=liveCandles.slice(-30).map(x=>({t:x.t,o:x.o,h:x.h,l:x.l,c:x.c}));
    const higher=higherCandles.slice(-15).map(x=>({t:x.t,o:x.o,h:x.h,l:x.l,c:x.c}));
    const prompt=`You are the chart-vision layer of a professional trading research scanner. Analyze the uploaded ${market} chart for ${symbol} on ${timeframe}. The image is the primary visual source for candles, visible structure, patterns, support/resistance and timeframe labels. The supplied live OHLC data is the authoritative source for the current market price and should be used to cross-check the chart.

IMPORTANT: Never claim 80% accuracy. 'confidence' is a model confidence score, NOT historical accuracy. Do not invent a price that is not consistent with the supplied live price. Do not promise profit. The technical engine's bullish/bearish directional strength determines the final signal; your visual analysis is a confirmation layer, not a hard historical-validation gate.

Technical engine result: ${JSON.stringify(technical)}
Historical validation result: ${JSON.stringify(validation)}
Recent live candles: ${JSON.stringify(recent)}
Higher-timeframe candles: ${JSON.stringify(higher)}

Return ONLY valid JSON with exactly these keys:
{"bias":"BUY|SELL|WAIT","confidence":0,"entry":0,"stop_loss":0,"tp1":0,"tp2":0,"timeframe":"","detected_symbol":"","detected_market":"","visual_structure":"","patterns":[],"support":0,"resistance":0,"confluence":[],"invalidation":"","reason":"","agreement":"AGREE|MIXED|DISAGREE"}

Detection rules: The uploaded image is the PRIMARY source for detecting the instrument and timeframe. The client-selected timeframe may be wrong and MUST NOT be trusted for image detection. If the supplied timeframe value is AUTO_DETECT_FROM_IMAGE, independently inspect the uploaded image. Read the chart header, timeframe selector, toolbar, watermark and other visible UI elements. Return timeframe ONLY as one of: 1min, 5min, 15min, 30min, 1h, 1day. If the image clearly shows 5m, 5 min, 5min or 5-minute, return 5min. If it clearly shows 1m return 1min. If it shows 15m return 15min. If it shows 30m return 30min. If it shows 1H return 1h. If it shows 1D, D or Daily return 1day. NEVER default to 1min when the timeframe is unreadable. If unreadable, return an empty string. Also visually verify the instrument and return detected_symbol only when clearly visible. Do not infer timeframe from technical data or the client UI selection. Rules: confidence must be 0-100. Historical validation is informational only; never fake the validation number and do not force WAIT merely because the validation sample is small. If the chart and live data materially conflict, clearly report that conflict in agreement/reason, but do not invent prices. Entry/SL/TP should be realistic relative to current price and volatility. Use the visible chart to describe structure, but use live data for exact current price.`;

    const response = await client.responses.create({
      model: MODEL,
      input:[{role:'user',content:[
        {type:'input_text',text:prompt},
        {type:'input_image',image_url:imageData,detail:'low'}
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




