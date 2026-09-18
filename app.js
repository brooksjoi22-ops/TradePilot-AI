const $=id=>document.getElementById(id);
const marketType=$('marketType'), symbol=$('symbol'), timeframe=$('timeframe'), scanBtn=$('scanBtn');
const chart=$('marketChart'), ctx=chart.getContext('2d');
let candles=[], recent=[], uploadedChartFile=null;
const intervalMap={"1min":"1m","5min":"5m","15min":"15m","30min":"30m","1h":"1h","1day":"1d"};
const higherTf={"1min":"5min","5min":"15min","15min":"1h","30min":"1h","1h":"1day","1day":"1day"};
const cryptoSymbols=['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','AVAXUSDT','LINKUSDT','DOTUSDT','TRXUSDT','LTCUSDT','BCHUSDT','ATOMUSDT','UNIUSDT','ETCUSDT','FILUSDT','APTUSDT','NEARUSDT','OPUSDT','ARBUSDT','SUIUSDT','PEPEUSDT','SHIBUSDT'];

const uploadCard=$('uploadCard'), chartUpload=$('chartUpload'), uploadPreview=$('uploadPreview'), uploadedImage=$('uploadedImage'), removeUpload=$('removeUpload');
const uploadBtn=$('chooseChartBtn');
if(uploadBtn) uploadBtn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();chartUpload.click();});
chartUpload.addEventListener('change',e=>handleChartFile(e.target.files&&e.target.files[0]));
['dragenter','dragover'].forEach(ev=>uploadCard.addEventListener(ev,e=>{e.preventDefault();uploadCard.classList.add('dragover')}));
['dragleave','drop'].forEach(ev=>uploadCard.addEventListener(ev,e=>{e.preventDefault();uploadCard.classList.remove('dragover')}));
uploadCard.addEventListener('drop',e=>handleChartFile(e.dataTransfer.files[0]));
removeUpload.addEventListener('click',()=>{chartUpload.value='';uploadedChartFile=null;uploadedImage.removeAttribute('src');uploadPreview.classList.remove('show');scanBtn.textContent='Scan live market';$('dataStatus').textContent='● Ready'});
function handleChartFile(file){
  if(!file)return;
  const looksLikeImage=file.type?.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(file.name||'');
  if(!looksLikeImage){ $('scanError').textContent='Please choose a chart image (PNG, JPG/JPEG, WEBP or GIF).'; $('scanError').classList.add('show'); return; }
  if(file.size>12*1024*1024){ $('scanError').textContent='Chart image is too large. Please use an image under 12 MB.'; $('scanError').classList.add('show'); return; }
  $('scanError').classList.remove('show');
  uploadedChartFile=file;
  const reader=new FileReader();
  reader.onload=()=>{ uploadedImage.src=reader.result; uploadPreview.classList.add('show'); scanBtn.textContent='Scan uploaded chart'; $('dataStatus').textContent='● Chart ready — click Scan uploaded chart'; };
  reader.onerror=()=>{ uploadedChartFile=null; uploadPreview.classList.remove('show'); $('scanError').textContent='Browser could not read this image. Try saving the chart as JPG or PNG and upload again.'; $('scanError').classList.add('show'); };
  reader.readAsDataURL(file);
}


marketType.addEventListener('change', async()=>{
  const type=marketType.value;
  if(type==='crypto') symbol.innerHTML=cryptoSymbols.map(s=>`<option value="${s}">${s}</option>`).join('');
  else if(type==='gold') symbol.innerHTML='<option value="XAU/USD">XAU/USD — Gold</option>';
  else {const key=sessionStorage.getItem('tdKey');if(!key){symbol.innerHTML='<option value="EUR/USD">EUR/USD</option><option value="GBP/USD">GBP/USD</option><option value="USD/JPY">USD/JPY</option><option value="USD/CAD">USD/CAD</option><option value="AUD/USD">AUD/USD</option>';return;}symbol.innerHTML='<option>Loading pairs...</option>';try{const r=await fetch(`https://api.twelvedata.com/forex_pairs?apikey=${encodeURIComponent(key)}`);const j=await r.json();if(j.data?.length)symbol.innerHTML=j.data.map(x=>`<option value="${x.symbol}">${x.symbol}</option>`).join('');}catch(e){symbol.innerHTML='<option value="EUR/USD">EUR/USD</option>';}}
});
$('saveKey').onclick=()=>{const k=$('tdKey').value.trim();if(k){sessionStorage.setItem('tdKey',k);$('keyStatus').textContent='API key saved for this browser session.';$('dataSource').textContent='Twelve Data';$('dataStatus').textContent='● Twelve Data ready for live Forex/Gold candles';}};

async function getData(forTf=null, limit=180){
  const type=marketType.value,sym=symbol.value,tf=forTf||timeframe.value,apiInterval=intervalMap[tf]||tf;
  if(type==='crypto'){
    const r=await fetch(`https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(sym)}&interval=${apiInterval}&limit=${limit}`);if(!r.ok)throw new Error('Binance market data unavailable');const a=await r.json();$('dataSource').textContent='Binance';const parsed=a.map(x=>({t:x[0],o:Number(x[1]),h:Number(x[2]),l:Number(x[3]),c:Number(x[4]),v:Number(x[5])})).filter(x=>[x.o,x.h,x.l,x.c].every(Number.isFinite)); if(parsed.length>=30) return parsed;
  }
  const key=sessionStorage.getItem('tdKey');
  let r;
  if(key){
    r=await fetch(`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(sym)}&interval=${apiInterval}&outputsize=${limit}&apikey=${encodeURIComponent(key)}`);
  }else{
    r=await fetch(`/api/market-data?symbol=${encodeURIComponent(sym)}&interval=${encodeURIComponent(apiInterval)}&outputsize=${limit}`);
  }
  const j=await r.json().catch(()=>({error:'Invalid market-data response'}));
  if(r.ok && j.status!=='error' && j.values){
    $('dataSource').textContent=key?'Twelve Data':'Twelve Data (server)';
    const parsed=j.values.map(x=>({t:x.datetime,o:Number(x.open),h:Number(x.high),l:Number(x.low),c:Number(x.close),v:Number(x.volume||0)})).filter(x=>[x.o,x.h,x.l,x.c].every(Number.isFinite)&&x.h>=x.l&&x.h>=x.o&&x.h>=x.c&&x.l<=x.o&&x.l<=x.c); if(parsed.length>=30) return parsed.reverse();
  }
  // Robust fallback for Gold: if XAU/USD is not configured, use Binance PAXGUSDT
  // as a clearly-labelled gold proxy so the uploaded-chart workflow still returns a result.
  if(type==='gold'){
    const br=await fetch(`https://api.binance.com/api/v3/klines?symbol=PAXGUSDT&interval=${apiInterval}&limit=${limit}`);
    if(br.ok){
      const a=await br.json();
      if(Array.isArray(a)&&a.length){
        $('dataSource').textContent='Gold proxy (PAXGUSDT)';
        $('dataStatus').textContent='● XAU/USD unavailable — using PAXGUSDT gold proxy';
        const parsed=a.map(x=>({t:x[0],o:Number(x[1]),h:Number(x[2]),l:Number(x[3]),c:Number(x[4]),v:Number(x[5])})).filter(x=>[x.o,x.h,x.l,x.c].every(Number.isFinite)); if(parsed.length>=30) return parsed;
      }
    }
  }
  throw new Error(j.message||j.error||'Gold/Forex live data unavailable.');
}
function ema(vals,n){let k=2/(n+1),out=[],e=vals[0];out.push(e);for(let i=1;i<vals.length;i++){e=vals[i]*k+e*(1-k);out.push(e)}return out}
function rsi(vals,n=14){let out=Array(n).fill(null),g=0,l=0;for(let i=1;i<=n;i++){const d=vals[i]-vals[i-1];if(d>=0)g+=d;else l-=d}g/=n;l/=n;out.push(l?100-100/(1+g/l):100);for(let i=n+1;i<vals.length;i++){const d=vals[i]-vals[i-1];g=(g*(n-1)+Math.max(d,0))/n;l=(l*(n-1)+Math.max(-d,0))/n;out.push(l?100-100/(1+g/l):100)}return out}
function atr(a,n=14){const tr=a.map((x,i)=>i?Math.max(x.h-x.l,Math.abs(x.h-a[i-1].c),Math.abs(x.l-a[i-1].c)):x.h-x.l);return ema(tr,n)}
function fmt(x){if(!Number.isFinite(x))return '--';return x>=1000?x.toLocaleString(undefined,{maximumFractionDigits:2}):x.toLocaleString(undefined,{maximumFractionDigits:6})}
function draw(){const w=chart.clientWidth||900,h=250,dpr=devicePixelRatio||1;chart.width=w*dpr;chart.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);if(!candles.length)return;const vals=candles.map(x=>x.c),min=Math.min(...vals),max=Math.max(...vals),pad=(max-min)*.12||1;ctx.strokeStyle='rgba(124,245,178,.12)';for(let i=1;i<5;i++){let y=h*i/5;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}ctx.strokeStyle='#7cf5b2';ctx.lineWidth=2;ctx.beginPath();vals.forEach((v,i)=>{let x=i*(w-12)/(vals.length-1)+6,y=h-18-(v-(min-pad))/(max-min+2*pad)*(h-28);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();ctx.fillStyle='#90a69d';ctx.font='11px Inter';ctx.fillText(fmt(max),8,14);ctx.fillText(fmt(min),8,h-5)}

let scanAnimTimer=null, scanAnimStarted=0;
function animateScan(mode='market'){
  const box=$('scanAnimation');
  box.classList.add('active');
  if(uploadedChartFile) uploadPreview.classList.add('scanning');
  $('scanProgress').style.width='2%';
  $('scanPercent').textContent='2%';
  const steps=mode==='chart'?['Uploading chart image...','Reading chart image...','Detecting candles and structure...','Detecting timeframe...','Finding swing highs/lows...','Checking support and resistance...','Cross-checking live market candles...','Calculating EMA, RSI and MACD...','Building entry, SL and TP...','Finalizing signal...']:['Connecting to live market...','Loading latest candles...','Confirming selected timeframe...','Calculating EMA 9/21/50...','Calculating RSI 14...','Calculating MACD 12/26/9...','Measuring momentum and ATR...','Checking higher timeframe...','Building entry, SL and TP...','Finalizing signal...'];
  scanAnimStarted=performance.now();
  let step=0, progress=2;
  $('scanText').textContent=steps[0];
  clearInterval(scanAnimTimer);
  scanAnimTimer=setInterval(()=>{
    progress=Math.min(97,progress+1.15);
    if(progress>=((step+1)/steps.length)*97 && step<steps.length-1) step++;
    $('scanProgress').style.width=progress+'%';
    $('scanPercent').textContent=Math.round(progress)+'%';
    $('scanText').textContent=steps[step];
  },220);
}
async function finishScanAnimation(success=true){
  clearInterval(scanAnimTimer);scanAnimTimer=null;
  // Keep the chart-search animation visible for at least 15 seconds, even if
  // the live API/technical calculation finishes sooner. This makes the full
  // scan feel deliberate while the real market work still happens underneath.
  const MIN_SCAN_MS=15000;
  const elapsed=performance.now()-scanAnimStarted;
  if(success && elapsed<MIN_SCAN_MS){
    $('scanText').textContent='Finalizing live market analysis...';
    $('scanProgress').style.width='97%';
    $('scanPercent').textContent='97%';
    await new Promise(r=>setTimeout(r,MIN_SCAN_MS-elapsed));
  }
  $('scanProgress').style.width=success?'100%':'0%';
  $('scanPercent').textContent=success?'100%':'0%';
  $('scanText').textContent=success?'Analysis complete — preparing result...':'Analysis stopped';
  await new Promise(r=>setTimeout(r,success?650:0));
  $('scanAnimation').classList.remove('active');
  uploadPreview.classList.remove('scanning');
}

function analyzeSeries(data,higherData=[]){
  const clean=(data||[]).map(x=>x&&({t:x.t,o:Number(x.o),h:Number(x.h),l:Number(x.l),c:Number(x.c),v:Number(x.v||0)})).filter(x=>x&&[x.o,x.h,x.l,x.c].every(Number.isFinite)&&x.h>=x.l&&x.h>=x.o&&x.h>=x.c&&x.l<=x.o&&x.l<=x.c);
  if(clean.length<30) throw new Error('Not enough valid market candles for technical analysis.');
  const closes=clean.map(x=>x.c),i=closes.length-1,price=closes[i];
  const e9=ema(closes,9),e21=ema(closes,21),e50=ema(closes,50),rr=rsi(closes),aa=atr(clean),mf=ema(closes,12),ms=ema(closes,26),md=mf.map((x,k)=>x-ms[k]),sig=ema(md,9);
  const trend=e9[i]>e21[i]&&e21[i]>e50[i]?1:e9[i]<e21[i]&&e21[i]<e50[i]?-1:0;
  const mac=md[i]>sig[i]?(md[i]>=0?1:0):-1;
  const mom=closes[i]>closes[Math.max(0,i-10)]?1:-1;
  const r=Number.isFinite(rr[i])?rr[i]:50;
  let hTrend=0;
  const hc=(higherData||[]).filter(x=>x&&Number.isFinite(x.c)).map(x=>x.c);
  if(hc.length>=30){const hi=hc.length-1,he9=ema(hc,9),he21=ema(hc,21),he50=ema(hc,50);hTrend=he9[hi]>he21[hi]&&he21[hi]>he50[hi]?1:he9[hi]<he21[hi]&&he21[hi]<he50[hi]?-1:0;}
  const recent=clean.slice(-30),high=Math.max(...recent.map(x=>x.h)),low=Math.min(...recent.map(x=>x.l)),atrNow=Number.isFinite(aa[i])&&aa[i]>0?aa[i]:Math.max(price*0.001,0.01);
  let bull=0,bear=0;
  if(trend>0)bull+=25;else if(trend<0)bear+=25;
  if(mac>0)bull+=18;else if(mac<0)bear+=18;
  if(mom>0)bull+=15;else bear+=15;
  if(r>55)bull+=12;else if(r<45)bear+=12;
  if(hTrend>0)bull+=20;else if(hTrend<0)bear+=20;
  if(Math.abs(price-low)<atrNow*1.2)bull+=5;if(Math.abs(high-price)<atrNow*1.2)bear+=5;
  const side=bull>=65&&bull>bear?'BUY':bear>=65&&bear>bull?'SELL':'WAIT';
  const score=Math.max(50,Math.min(95,Math.round(Math.max(bull,bear))));
  const risk=Math.max(atrNow*1.35,price*0.0012),sl=side==='BUY'?price-risk:side==='SELL'?price+risk:price-risk,tp1=side==='BUY'?price+risk*1.5:side==='SELL'?price-risk*1.5:price,tp2=side==='BUY'?price+risk*2.5:side==='SELL'?price-risk*2.5:price;
  return {price,score,side,sl,tp1,tp2,trend,mac,mom,r,hTrend,atr:atrNow,support:low,resistance:high,bull,bear};
}
function setResult(a,mode='Live',ai=null,validation=null){
  a=a||{};
  const tfText=timeframe.options[timeframe.selectedIndex].text;
  const lastClose=Array.isArray(candles)&&candles.length?Number(candles[candles.length-1].c):NaN;
  const safePrice=Number.isFinite(Number(a.price))?Number(a.price):(Number.isFinite(lastClose)?lastClose:NaN);
  const aiBias=String(ai?.bias||'').toUpperCase();
  const rawSide=String(a.side||'').toUpperCase();
  const safeSide=['BUY','SELL','WAIT'].includes(aiBias)?aiBias:(['BUY','SELL','WAIT'].includes(rawSide)?rawSide:'WAIT');
  $('chartTitle').textContent=`${symbol.value} · ${tfText}`;
  $('priceBadge').textContent=fmt(safePrice);
  $('resultSymbol').textContent=`${symbol.value} · ${tfText} · ${mode}`;
  const rawConf=ai?.confidence!=null?Number(ai.confidence):Number(a.score); const conf=Number.isFinite(rawConf)?Math.max(0,Math.min(99,Math.round(rawConf))):50;
  $('score').textContent=conf+'%';
  $('bias').textContent=safeSide;
  const aiEntry=Number(ai?.entry), aiSl=Number(ai?.stop_loss), aiTp1=Number(ai?.tp1), aiTp2=Number(ai?.tp2);
  $('entry').textContent=fmt(Number.isFinite(aiEntry)?aiEntry:safePrice);
  $('sl').textContent=fmt(Number.isFinite(aiSl)?aiSl:a.sl);
  $('tp1').textContent=fmt(Number.isFinite(aiTp1)?aiTp1:a.tp1);
  $('tp2').textContent=fmt(Number.isFinite(aiTp2)?aiTp2:a.tp2);
  $('emaSignal').textContent=a.trend>0?'Bullish':a.trend<0?'Bearish':'Mixed';
  $('rsiSignal').textContent=fmt(a.r);
  $('macdSignal').textContent=a.mac>0?'Bullish':a.mac<0?'Bearish':'Mixed';
  $('momSignal').textContent=a.mom>0?'Positive':'Negative';
  $('visualStructure').textContent=ai?.visual_structure||'Technical-only scan';
  $('aiAgreement').textContent=ai?.agreement||'Not available';
  const wr=validation?.winRate;
  $('validationBadge').textContent=wr==null?'Not tested':`${wr.toFixed(1)}% historical`;
  $('rationale').textContent=ai?.reason||`${mode} ${marketType.value} analysis on ${tfText}. Technical confluence: EMA, RSI, MACD, momentum, ATR, support/resistance and higher timeframe.`;
  $('aiReason').textContent=ai?`AI vision: ${ai.reason||'Visual chart structure cross-checked with live market data.'}`:'AI vision unavailable — using technical engine only.';
  $('resultEyebrow').textContent=ai?'AI CHART-VISION + LIVE MARKET':'LIVE TECHNICAL ANALYSIS';
  $('result').style.display='block';
}

async function fileToDataUrl(file){
  return await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)});
}

async function validationBacktest(data){
  if(!data||data.length<220) return {trades:0,wins:0,losses:0,winRate:0,gate:false};
  let wins=0,losses=0,trades=0,pnlR=0;
  const horizon=12;
  for(let i=120;i<data.length-horizon;i++){
    const a=analyzeSeries(data.slice(0,i+1),[]);
    if(a.side==='WAIT'||a.score<65) continue;
    trades++;
    let result=0;
    for(let j=i+1;j<=i+horizon;j++){
      if(a.side==='BUY'){if(data[j].l<=a.sl){result=-1;break}if(data[j].h>=a.tp2){result=2.5;break}}
      else {if(data[j].h>=a.sl){result=-1;break}if(data[j].l<=a.tp2){result=2.5;break}}
    }
    if(result>0){wins++;pnlR+=result}else{losses++;pnlR+=result||-1}
  }
  const winRate=trades?wins/trades*100:0;
  return {trades,wins,losses,winRate,pnlR,gate:trades>=20&&winRate>=80};
}

async function aiVisionAnalyze(validation,technical){
  if(!uploadedChartFile) return null;
  try{
    const imageData=await fileToDataUrl(uploadedChartFile);
    const r=await fetch('/api/analyze-chart',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({imageData,symbol:symbol.value,timeframe:timeframe.value,market:marketType.value,liveCandles:candles.slice(-80),higherCandles:window.__higherCandles||[],technical,validation})});
    const j=await r.json();
    if(!r.ok) throw new Error(j.error||'AI vision server unavailable');
    return j.analysis;
  }catch(e){
    console.warn('AI vision unavailable',e);
    $('aiReason').textContent='AI vision unavailable: '+e.message+' — technical live scan will still be shown.';
    return null;
  }
}

async function detectTimeframeFromImage(file){
  if(!window.Tesseract) return null;
  try{
    const result=await Tesseract.recognize(file,'eng',{logger:m=>{
      if(m.status==='recognizing text') $('scanText').textContent='Reading timeframe from chart... '+Math.round((m.progress||0)*100)+'%';
    }});
    const text=(result.data?.text||'').toLowerCase().replace(/\s+/g,' ');
    const patterns=[
      ['15min',/\b15\s*(m|min|minute|minutes)\b/],
      ['5min',/\b5\s*(m|min|minute|minutes)\b/],
      ['30min',/\b30\s*(m|min|minute|minutes)\b/],
      ['1min',/\b1\s*(m|min|minute|minutes)\b/],
      ['1h',/\b1\s*(h|hr|hour|hours)\b/],
      ['1day',/\b1\s*(d|day|daily)\b/]
    ];
    for(const [tf,re] of patterns) if(re.test(text)) return tf;
  }catch(e){ console.warn('Timeframe OCR unavailable',e); }
  return null;
}

async function localChartFallback(){
  // Chart-only fallback: never pretend pixel color is AI or market price.
  // Estimate direction from multiple horizontal bands, candle-like edge contrast,
  // and recent-vs-older visual slope. Exact Entry/SL/TP remain unavailable.
  const img=new Image();
  img.src=uploadedImage.src;
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;});
  const c=document.createElement('canvas');
  const w=720,h=420;c.width=w;c.height=h;
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,w,h);
  const d=ctx.getImageData(0,0,w,h).data;
  const bands=12; const scores=[]; let green=0,red=0,valid=0;
  for(let b=0;b<bands;b++){
    const y0=Math.floor((b*h)/bands), y1=Math.floor(((b+1)*h)/bands);
    let g=0,r=0,n=0;
    for(let y=y0;y<y1;y+=2){for(let x=20;x<w-20;x+=2){
      const i=(y*w+x)*4,R=d[i],G=d[i+1],B=d[i+2];
      if(Math.max(R,G,B)-Math.min(R,G,B)<18) continue;
      if(G>R*1.18 && G>B*1.05 && G>80) g++;
      if(R>G*1.18 && R>B*1.05 && R>80) r++;
      n++;
    }}
    const score=n?((g-r)/n):0;scores.push(score);green+=g;red+=r;valid+=n;
  }
  const older=scores.slice(0,Math.floor(bands/2)).reduce((a,b)=>a+b,0)/(bands/2);
  const recent=scores.slice(Math.floor(bands/2)).reduce((a,b)=>a+b,0)/(bands/2);
  const slope=recent-older;
  let bias='WAIT';
  if(slope < -0.004 || recent < -0.006) bias='SELL';
  else if(slope > 0.004 || recent > 0.006) bias='BUY';
  const strength=Math.min(1,Math.abs(slope)*35+Math.abs(recent)*12);
  const confidence=Math.round(52+strength*23);
  setResult({signal:bias,confidence,entry:null,sl:null,tp1:null,tp2:null,
    timeframe:timeframe.options[timeframe.selectedIndex].text,bias:bias,
    ema:bias==='SELL'?'Bearish':bias==='BUY'?'Bullish':'Neutral',rsi:'N/A',macd:'Visual only',momentum:bias==='SELL'?'Negative':bias==='BUY'?'Positive':'Mixed',
    chartStructure:'Multi-band visual structure estimated from uploaded chart',
    mode:'Chart-only fallback',validation:'N/A',aiAgreement:'Live market unavailable',
    source:'Uploaded chart image (local visual fallback)',
    note:`Chart upload successful. Visual fallback used ${bands} horizontal bands; green ${valid?((green/valid)*100).toFixed(1):0}% / red ${valid?((red/valid)*100).toFixed(1):0}% of sampled colored pixels. This is not live-market AI analysis.`
  });
}

async function scanUploadedChart(){
  if(!uploadedChartFile)throw new Error('Upload a chart first.');
  const detectedTf=await detectTimeframeFromImage(uploadedChartFile);
  if(detectedTf){timeframe.value=detectedTf;$('dataStatus').textContent='● Timeframe detected: '+timeframe.options[timeframe.selectedIndex].text}
  else $('dataStatus').textContent='● Timeframe not readable; using selected timeframe';

  $('scanText').textContent='Fetching current GOLD/live market candles...';
  try {
    candles=await getData(timeframe.value,220);
    draw();
  } catch(liveErr) {
    console.warn('Live Gold data unavailable; using local chart fallback', liveErr);
    await localChartFallback();
    return;
  }
  $('scanText').textContent='Checking higher timeframe confirmation...';
  let higher=[];
  try{ higher=await getData(higherTf[timeframe.value]||timeframe.value,180); }catch(e){ console.warn('Higher timeframe unavailable',e); }
  window.__higherCandles=higher;
  $('scanText').textContent='Running technical confluence + historical validation...';
  const technical=analyzeSeries(candles,higher);
  const validation=await validationBacktest(candles);
  $('scanText').textContent='AI vision is reading chart structure and candle patterns...';
  const ai=await aiVisionAnalyze(validation,technical);
  if(ai){
    const detectedTf=String(ai.timeframe||'').toLowerCase().replace(/\s+/g,'');
    const tfMap={'1m':'1min','1min':'1min','5m':'5min','5min':'5min','15m':'15min','15min':'15min','30m':'30min','30min':'30min','1h':'1h','1hr':'1h','1hour':'1h','4h':'1day','1d':'1day','1day':'1day'};
    if(tfMap[detectedTf]) timeframe.value=tfMap[detectedTf];
    const ds=String(ai.detected_symbol||'').toUpperCase().replace(/\s+/g,'');
    const symbolMap={'XAUUSD':'XAU/USD','XAU/USD':'XAU/USD','GOLD':'XAU/USD','BTCUSD':'BTCUSDT','BTCUSDT':'BTCUSDT','ETHUSD':'ETHUSDT','ETHUSDT':'ETHUSDT','SOLUSD':'SOLUSDT','SOLUSDT':'SOLUSDT','BNBUSDT':'BNBUSDT','XRPUSDT':'XRPUSDT'};
    if(symbolMap[ds]){ symbol.value=symbolMap[ds]; marketType.value=symbolMap[ds]==='XAU/USD'?'gold':'crypto'; }
    if(ai.detected_symbol||ai.timeframe) $('dataStatus').textContent='● Detected: '+(ai.detected_symbol||symbol.value)+' · '+(ai.timeframe||timeframe.options[timeframe.selectedIndex].text);
  }

  let final=technical;
  if(ai){
    const aiSide=ai.bias;
    const agreed=aiSide===technical.side || (aiSide==='WAIT'&&technical.side==='WAIT');
    if(!agreed) ai.bias='WAIT';
    if(!validation.gate && ai.bias!=='WAIT') ai.bias='WAIT';
    final={...technical,side:ai.bias,score:Math.round(Math.min(99,Math.max(50,(technical.score*0.55)+(Number(ai.confidence||50)*0.45))))};
    if(ai.bias==='BUY'&&ai.entry) final.price=Number(ai.entry)||technical.price;
    if(ai.stop_loss) final.sl=Number(ai.stop_loss)||technical.sl;
    if(ai.tp1) final.tp1=Number(ai.tp1)||technical.tp1;
    if(ai.tp2) final.tp2=Number(ai.tp2)||technical.tp2;
  }
  setResult(final,'AI chart scan',ai,validation);
  $('dataStatus').textContent=ai?'● AI chart + live market scan complete':'● Live market scan complete (AI server not connected)';
  if(!$('dataSource').textContent.includes('proxy')) $('dataSource').textContent=marketType.value==='crypto'?'Binance live candles':'Twelve Data live candles';
  recent.unshift({s:symbol.value,b:$('bias').textContent,p:fmt(candles[candles.length-1].c)}); recent=recent.slice(0,6);
  $('recentScans').innerHTML=recent.map(x=>`<div class="trade"><span>${x.s} <small>${x.b}</small></span><b>${x.p}</b></div>`).join('');
}

scanBtn.onclick=async()=>{
  scanBtn.disabled=true;
  const mode=uploadedChartFile?'chart':'market';
  animateScan(mode);
  try{
    if(uploadedChartFile){
      await scanUploadedChart();
    }else{
      $('scanText').textContent='Fetching current live market candles...';
      candles=await getData();
      candles=candles.filter(x=>x&&[x.o,x.h,x.l,x.c].every(Number.isFinite));
      if(!candles.length) throw new Error('No valid live candles received. Check the market-data source/API key.');
      draw();
      $('scanText').textContent='Checking higher timeframe confirmation...';
      const higher=await getData(higherTf[timeframe.value]||timeframe.value);
      $('scanText').textContent='Running EMA, RSI, MACD, momentum and ATR...';
      const technical=analyzeSeries(candles,higher); if(!Number.isFinite(technical.price) && candles.length) technical.price=Number(candles[candles.length-1].c); if(!['BUY','SELL','WAIT'].includes(technical.side)) technical.side='WAIT'; setResult(technical,'Live scan');
      $('dataStatus').textContent='● Live data updated';
      recent.unshift({s:symbol.value,b:$('bias').textContent,p:fmt(candles[candles.length-1].c)});
      recent=recent.slice(0,6);
      $('recentScans').innerHTML=recent.map(x=>`<div class="trade"><span>${x.s} <small>${x.b}</small></span><b>${x.p}</b></div>`).join('');
    }
    await finishScanAnimation(true);
  }catch(e){
    $('dataStatus').textContent='● Scan error';
    await finishScanAnimation(false);
    $('scanError').textContent='Scan failed: '+(e.message||e);
    $('scanError').classList.add('show');
  }finally{
    scanBtn.disabled=false;
  }
};
$('runBacktest').onclick=async()=>{const out=$('backtestOutput');out.style.display='block';out.textContent='Loading historical candles and running backtest...';try{const data=await getData(timeframe.value,1000);if(data.length<200)throw new Error('Not enough historical candles');let wins=0,losses=0,trades=0,pnlR=0;for(let i=120;i<data.length-3;i++){const slice=data.slice(0,i+1),a=analyzeSeries(slice,[]);if(a.side==='WAIT')continue;trades++;const entry=data[i].c,sl=a.sl,tp=a.side==='BUY'?a.tp2:a.tp2;let result=0;for(let j=i+1;j<data.length;j++){if(a.side==='BUY'){if(data[j].l<=sl){result=-1;break}if(data[j].h>=tp){result=2.5;break}}else{if(data[j].h>=sl){result=-1;break}if(data[j].l<=tp){result=2.5;break}}}if(result>0){wins++;pnlR+=result}else{losses++;pnlR+=result}}const winRate=trades?wins/trades*100:0;out.innerHTML=`<b>Backtest result</b><br>Trades: ${trades}<br>Wins: ${wins}<br>Losses: ${losses}<br>Win rate: <strong>${winRate.toFixed(1)}%</strong><br>Net R: ${pnlR.toFixed(2)}R<br><small>Simple historical test of the same confluence engine; not a guarantee of future results.</small>`}catch(e){out.textContent='Backtest failed: '+e.message}};
window.addEventListener('resize',draw);
