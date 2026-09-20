import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
const TD_KEY = process.env.TWELVE_DATA_API_KEY || '';
const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

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
    if(!client) return res.status(503).json({error:'OPENAI_API_KEY is not configured on the server.'});
    const {imageData,symbol,timeframe,market,liveCandles=[],higherCandles=[],technical={},validation={}}=req.body||{};
    if(!imageData) return res.status(400).json({error:'Chart image is required.'});
    if(typeof imageData!=='string' || !imageData.startsWith('data:image/')) return res.status(400).json({error:'Chart image must be a valid data:image URL.'});
    const recent=liveCandles.slice(-80).map(x=>({t:x.t,o:x.o,h:x.h,l:x.l,c:x.c,v:x.v}));
    const higher=higherCandles.slice(-40).map(x=>({t:x.t,o:x.o,h:x.h,l:x.l,c:x.c}));
    const prompt=`You are the chart-vision layer of a trading research scanner. Analyze the uploaded ${market} chart for ${symbol} on the authoritative selected timeframe ${timeframe}. The image is used for visual structure, patterns, visible levels and timeframe text. Supplied live OHLC is authoritative for current price. The selected timeframe is the starting value, but you MUST independently report the timeframe visibly shown in the uploaded image in the timeframe field when it is readable. Do not silently treat an image label as the live-data timeframe; the client will use the reported detection to synchronize the live engine.

Never claim 80% accuracy. confidence is only model confidence, not historical accuracy. Never promise profit. The technical engine remains the source of the final directional signal.

Technical engine: ${JSON.stringify(technical)}
Historical validation: ${JSON.stringify(validation)}
Recent live candles: ${JSON.stringify(recent)}
Higher timeframe candles: ${JSON.stringify(higher)}

Return ONLY valid JSON with exactly these keys: {"bias":"BUY|SELL|WAIT","confidence":0,"entry":0,"stop_loss":0,"tp1":0,"tp2":0,"timeframe":"","detected_symbol":"","detected_market":"","visual_structure":"","patterns":[],"support":0,"resistance":0,"confluence":[],"invalidation":"","reason":"","agreement":"AGREE|MIXED|DISAGREE"}.

If the image timeframe is not clearly readable, return an empty string rather than guessing. If a clear toolbar label says 5m, return 5m; similarly use 1m, 15m, 30m, 1h, or 1d. Do not invent exact prices. Use live candles for current price and volatility context. If visual chart price materially conflicts with live data, report the conflict in reason/agreement.`;

    let response;
    try{
      response = await client.responses.create({
        model: MODEL,
        input:[{role:'user',content:[
          {type:'input_text',text:prompt},
          {type:'input_image',image_url:imageData}
        ]}]
      });
    }catch(firstErr){
      const code=firstErr?.status||firstErr?.code||'';
      console.error('OpenAI vision request failed', {status:firstErr?.status, code:firstErr?.code, message:firstErr?.message, model:MODEL});
      // One compatibility retry for accounts where the configured model alias is unavailable.
      if(String(firstErr?.message||'').toLowerCase().includes('model') && MODEL!=='gpt-5.6'){
        response = await client.responses.create({model:'gpt-5.6',input:[{role:'user',content:[{type:'input_text',text:prompt},{type:'input_image',image_url:imageData}]}]});
      }else throw firstErr;
    }
    const text=response.output_text||'';
    if(!text) throw new Error('OpenAI returned an empty vision response.');
    const ai=cleanJson(text);
    res.json({ok:true,model:MODEL,analysis:ai});
  }catch(e){
    console.error('Vision analysis failed', {status:e?.status, code:e?.code, type:e?.type, message:e?.message});
    const status=Number.isInteger(e?.status)&&e.status>=400&&e.status<600?e.status:500;
    res.status(status).json({error:e?.message||'Vision analysis failed',code:e?.code||null,type:e?.type||null});
  }
});

app.listen(PORT,'0.0.0.0',()=>console.log(`TradePilot AI server running on port ${PORT}`));
