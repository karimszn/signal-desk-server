'use strict';
/* Signal Desk server: scans markets on a schedule and pushes alerts to your phone via ntfy.
   Run once (for GitHub Actions):  node server.js --once
   Run forever (for a host):        node server.js
   Send a test alert:               node server.js --test-notify            */
const fs=require('fs'),http=require('http'),path=require('path');
const WebSocket=require('ws'),E=require('./engine.js');
const env=process.env,num=(v,d)=>{const n=parseFloat(v);return isFinite(n)?n:d};
const CFG={
  topic:(env.NTFY_TOPIC||'').trim(),ntfy:(env.NTFY_URL||'https://ntfy.sh').replace(/\/$/,''),
  deriv:(env.DERIV_URLS||'wss://api.derivws.com/trading/v1/options/ws/public,wss://ws.derivws.com/websockets/v3?app_id=1089').split(',').map(x=>x.trim()),
  binance:(env.BINANCE_URLS||'https://data-api.binance.vision,https://api.binance.com,https://api.binance.us').split(',').map(x=>x.trim()),
  cats:(env.CATEGORIES||'syn,com,cry').split(',').map(x=>x.trim()),tfs:(env.TIMEFRAMES||'900,14400').split(',').map(Number).filter(Boolean),
  minConf:num(env.MIN_CONF,70),every:num(env.INTERVAL_MIN,5),capital:num(env.CAPITAL,1000),risk:num(env.RISK_PCT,1),
  gate:env.REQUIRE_VALIDATED!=='0',state:env.STATE_FILE||path.join(__dirname,'state.json'),port:num(env.PORT,0),
  once:process.argv.includes('--once'),testNotify:process.argv.includes('--test-notify')
};
const log=(...a)=>console.log(new Date().toISOString().slice(11,19),...a);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const TF={60:'1m',300:'5m',900:'15m',3600:'1h',14400:'4h',86400:'1d'};

/* ---------- state (alerts already sent, learning record, news cache) ---------- */
let S={sent:{},learn:{sig:[],fwd:{}},news:{}};
try{S=Object.assign(S,JSON.parse(fs.readFileSync(CFG.state,'utf8')))}catch(e){}
const saveState=()=>{try{fs.writeFileSync(CFG.state,JSON.stringify(S))}catch(e){log('could not save state:',e.message)}};

/* ---------- Deriv (new public API first, legacy as backup) ---------- */
class Deriv{
  constructor(){this.ws=null;this.id=1;this.p=new Map()}
  async open(){if(this.ws&&this.ws.readyState===1)return;let last;
    for(const u of CFG.deriv){try{await this._c(u);return}catch(e){last=e}}throw last||new Error('Cannot reach Deriv')}
  _c(u){return new Promise((res,rej)=>{
    const w=new WebSocket(u);let opened=false;const t=setTimeout(()=>{try{w.terminate()}catch(e){}},8000);
    w.on('open',()=>{opened=true;clearTimeout(t);this.ws=w;res()});
    w.on('error',()=>{});
    w.on('close',()=>{clearTimeout(t);if(!opened)return rej(new Error('cannot connect to '+u));if(this.ws===w)this.ws=null;for(const[,p]of this.p){clearTimeout(p.t);p.rej(new Error('connection lost'))}this.p.clear()});
    w.on('message',m=>{let d;try{d=JSON.parse(m)}catch(e){return}const p=this.p.get(d.req_id);if(p){this.p.delete(d.req_id);clearTimeout(p.t);d.error?p.rej(new Error(d.error.message||'API error')):p.res(d)}});
  })}
  async send(o,ms=20000){await this.open();return new Promise((res,rej)=>{const id=this.id++,t=setTimeout(()=>{this.p.delete(id);rej(new Error('timeout'))},ms);this.p.set(id,{res,rej,t});this.ws.send(JSON.stringify({...o,req_id:id}))})}
  close(){try{this.ws&&this.ws.close()}catch(e){}}
}
const bsym=s=>{if(s==='frxXAUUSD')return'PAXGUSDT';const m=s.match(/^cry([A-Z]{2,6})USD$/);return m?m[1]+'USDT':null};
const BINT={60:'1m',300:'5m',900:'15m',3600:'1h',14400:'4h',86400:'1d'};
async function binanceCandles(sym,g,count){
  const s=bsym(sym),iv=BINT[g];if(!s||!iv)throw new Error('not on Binance');let out=[],end='';
  while(out.length<count){const need=Math.min(1000,count-out.length);let rows=null;
    for(const h of CFG.binance){try{const r=await fetch(`${h}/api/v3/klines?symbol=${s}&interval=${iv}&limit=${need}${end}`,{signal:AbortSignal.timeout(10000)});if(r.ok){rows=await r.json();break}}catch(e){}}
    if(!rows)throw new Error('Binance unreachable');if(!rows.length)break;
    out=rows.map(r=>({epoch:Math.floor(r[0]/1000),open:+r[1],high:+r[2],low:+r[3],close:+r[4],v:+r[5],tb:+r[9]})).concat(out);end='&endTime='+(rows[0][0]-1);if(rows.length<need)break}
  return out;
}
/* Order flow: buy/sell volume comes from Binance and is merged into Deriv candles by time. */
async function withFlow(sym,g,count,c){
  if(!bsym(sym))return c;
  try{const b=await binanceCandles(sym,g,count),m=new Map(b.map(x=>[x.epoch,x]));let hit=0;
    const o=c.map(x=>{const y=m.get(x.epoch);if(y&&y.v>0&&isFinite(y.tb)){hit++;return{...x,v:y.v,tb:y.tb}}return{...x,v:1,tb:.5}});
    return hit>=c.length*0.8?o:c}catch(e){return c}
}
const BK={};
async function getBook(sym){
  const s=bsym(sym);if(!s)return null;if(BK[s]&&Date.now()-BK[s].at<30000)return BK[s].v;
  let d=null;for(const h of CFG.binance){try{const r=await fetch(`${h}/api/v3/depth?symbol=${s}&limit=500`,{signal:AbortSignal.timeout(10000)});if(r.ok){d=await r.json();break}}catch(e){}}
  if(!d||!d.bids||!d.asks)return null;
  const bids=d.bids.map(x=>[+x[0],+x[1]]),asks=d.asks.map(x=>[+x[0],+x[1]]);if(!bids.length||!asks.length)return null;
  const mid=(bids[0][0]+asks[0][0])/2,N=20,step=0.001,B=new Array(N).fill(0),A=new Array(N).fill(0);
  for(const[p,q]of bids){const j=Math.floor((mid-p)/mid/step);if(j>=0&&j<N)B[j]+=q}
  for(const[p,q]of asks){const j=Math.floor((p-mid)/mid/step);if(j>=0&&j<N)A[j]+=q}
  const nb=B.slice(0,10).reduce((x,y)=>x+y,0),na=A.slice(0,10).reduce((x,y)=>x+y,0),mx=a=>a.indexOf(Math.max(...a));
  const v={imb:(nb+na)?(nb-na)/(nb+na):0,wallB:-(mx(B)+.5)*step,wallA:(mx(A)+.5)*step};BK[s]={at:Date.now(),v};return v;
}
async function getData(dv,sym,g,count){
  let e1;try{const d=await dv.send({ticks_history:sym,adjust_start_time:1,count:Math.min(count,5000),end:'latest',style:'candles',granularity:g});
    const c=(d.candles||[]).map(x=>({epoch:+x.epoch,open:+x.open,high:+x.high,low:+x.low,close:+x.close}));if(c.length)return await withFlow(sym,g,count,c)}catch(e){e1=e}
  if(bsym(sym)){try{const c=await binanceCandles(sym,g,count);if(c.length)return c}catch(e){}}
  throw e1||new Error('no data');
}
const CATS={syn:'Synthetics',frx:'Forex',cry:'Crypto',com:'Commodities',idx:'Stock indices'};
function catOf(s,m){if(/^cry/.test(s)||m==='cryptocurrency')return'cry';if(/^frx(XAU|XAG|XPD|XPT)/.test(s)||m==='commodities')return'com';if(/^frx/.test(s)||m==='forex')return'frx';if(/^OTC_/.test(s)||m==='indices')return'idx';return'syn'}
const FALL=[['frxXAUUSD','XAUUSD'],['frxXAGUSD','XAGUSD'],['cryBTCUSD','BTCUSD'],['cryETHUSD','ETHUSD'],['R_10','Volatility 10 Index'],['R_25','Volatility 25 Index'],['R_50','Volatility 50 Index'],['R_75','Volatility 75 Index'],['R_100','Volatility 100 Index'],['1HZ10V','Volatility 10 (1s) Index'],['1HZ25V','Volatility 25 (1s) Index'],['1HZ50V','Volatility 50 (1s) Index'],['1HZ75V','Volatility 75 (1s) Index'],['1HZ100V','Volatility 100 (1s) Index'],['BOOM300N','Boom 300 Index'],['BOOM500','Boom 500 Index'],['BOOM1000','Boom 1000 Index'],['CRASH300N','Crash 300 Index'],['CRASH500','Crash 500 Index'],['CRASH1000','Crash 1000 Index'],['stpRNG','Step Index'],['JD10','Jump 10 Index'],['JD25','Jump 25 Index'],['JD50','Jump 50 Index'],['JD75','Jump 75 Index'],['JD100','Jump 100 Index']];
async function loadSyms(dv){
  let l=[];try{const d=await dv.send({active_symbols:'brief'},15000);
    l=(d.active_symbols||[]).map(x=>{const s=x.underlying_symbol||x.symbol;return{s,n:s==='frxXAUUSD'?'XAUUSD':s==='cryBTCUSD'?'BTCUSD':(x.underlying_symbol_name||x.display_name||s),c:catOf(s,x.market)}}).filter(x=>x.s)}catch(e){log('active_symbols failed, using built-in list:',e.message)}
  if(l.length<3)l=FALL.map(x=>({s:x[0],n:x[1],c:catOf(x[0])}));return l;
}

/* ---------- news (same sources and scoring as the app) ---------- */
function newsKind(s){if(/^cry/.test(s))return'cry';if(/^frx(XAU|XAG)/.test(s))return'gold';if(/^frx(BRO|WTI)|OIL/.test(s))return'oil';if(/^OTC_/.test(s))return'idx';return null}
const nkey=s=>/^cry/.test(s)?s:newsKind(s);
const GQ={gold:'("gold price" OR XAUUSD OR "gold prices")',oil:'("crude oil" OR "oil prices" OR Brent)',idx:'("stock market" OR "Wall Street")',cry:'(bitcoin OR cryptocurrency)'};
let lastG=0;const GC={};
async function gdelt(q,span,half){
  const key=q+span;if(GC[key]&&Date.now()-GC[key].at<9e5)return GC[key].v;
  const wait=lastG+5200-Date.now();if(wait>0)await sleep(wait);lastG=Date.now();
  try{const r=await fetch('https://api.gdeltproject.org/api/v2/doc/doc?query='+encodeURIComponent(q)+'&mode=artlist&maxrecords=60&format=json&sort=datedesc&timespan='+span,{signal:AbortSignal.timeout(12000)});const j=await r.json();
    const v=(j.articles||[]).map(a=>{const m=(a.seendate||'').match(/(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)/);return{t:a.title||'',ts:m?Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6])/1000:Date.now()/1000,half}});
    GC[key]={at:Date.now(),v};return v}
  catch(e){GC[key]={at:Date.now()-6e5,v:[]};return[]}
}
async function getNews(sym){
  const kind=newsKind(sym);if(!kind)return null;const k=nkey(sym),c=S.news[k];if(c&&Date.now()-c.at<9e5)return c.v;
  let short=[],long=[];const now=Date.now()/1000;
  try{if(kind==='cry'){const base=(sym.match(/^cry([A-Z]+)USD/)||[])[1]||'BTC';const j=await(await fetch('https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories='+base,{signal:AbortSignal.timeout(10000)})).json();short=(j.Data||[]).slice(0,40).map(a=>({t:a.title||'',ts:a.published_on||now,half:1}))}else short=await gdelt(GQ[kind],'3d',1)}catch(e){}
  try{long=await gdelt(GQ[kind],'30d',10)}catch(e){}
  if(!short.length&&!long.length){S.news[k]={at:Date.now()-6e5,v:null};return null}
  const bs=E.sentiment(short,kind,now),bl=E.sentiment(long,kind,now),bias=short.length&&long.length?0.6*bs+0.4*bl:short.length?bs:bl;
  const v={bias,n:short.length+long.length};S.news[k]={at:Date.now(),v};return v;
}

/* ---------- learning: resolve past signals, feed results back into strategy choice ---------- */
const fwdFor=(sym,g)=>{const o={};for(const k in S.learn.fwd){const[a,b,id]=k.split('|');if(a===sym&&+b===g)o[id]=S.learn.fwd[k]}return o};
function learn(res,sym,g){
  const L=S.learn,k=res.k,now=Math.floor(Date.now()/1000);
  for(const x of L.sig){if(x.done||x.sym!==sym||x.g!==g)continue;const i=k.findIndex(c=>c.epoch===x.t);if(i<0||i>=k.length-1)continue;
    const t=E.simTrade(k,i,x.dir,x.a,120);if(t.done){x.done=true;x.r=+(t.out-0.1).toFixed(2);const key=sym+'|'+g+'|'+x.id,f=L.fwd[key]||{n:0,sum:0};f.n++;f.sum+=x.r;L.fwd[key]=f}}
  if(res.shown!=='WAIT'){const t=k[k.length-1].epoch;if(!L.sig.some(x=>x.sym===sym&&x.g===g&&x.t===t&&x.id===res.strat.id))L.sig.push({sym,g,id:res.strat.id,dir:res.shown,a:res.sc.a,t,done:false})}
  L.sig=L.sig.filter(x=>!x.done||now-x.t<30*86400).slice(-600);
}

/* ---------- alerts ---------- */
const fmt=v=>v.toFixed(v>=1000?2:v>=10?3:4);
async function push(title,body,tags,prio){
  if(!CFG.topic){log('NTFY_TOPIC is not set, cannot send:',title);return false}
  try{const r=await fetch(`${CFG.ntfy}/${encodeURIComponent(CFG.topic)}`,{method:'POST',headers:{Title:title,Tags:tags||'bell',Priority:prio||'default'},body,signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw new Error('HTTP '+r.status);return true}catch(e){log('alert failed:',e.message);return false}
}
function alertText(res,m,g,bk){
  const r=res.sc,pl=res.pl,risk=CFG.capital*CFG.risk/100,units=risk/pl.R;
  const size=m.s==='frxXAUUSD'?`${units.toFixed(2)} oz (${(units/100).toFixed(3)} lots)`:/^frx/.test(m.s)?`${units.toFixed(0)} units (${(units/1e5).toFixed(3)} lots)`:`${units>=1?units.toFixed(2):units.toFixed(4)} units`;
  const nw=res.news;
  return `${res.shown} ${m.n} on the ${TF[g]||g} chart, ${r.conf}% confidence\nEntry ${fmt(r.px)}\nStop loss ${fmt(pl.sl)}\nTake profit 1 ${fmt(pl.tp1)}\nTake profit 2 ${fmt(pl.tp2)}\nRisk $${risk.toFixed(2)} (${CFG.risk}% of $${CFG.capital}), size ${size}\nStrategy: ${res.strat.name}\nBacktest: ${res.bt.n} trades, ${res.bt.exp>=0?'+':''}${res.bt.exp.toFixed(2)}R average${typeof nw==='number'?`\nNews bias ${nw>=0?'+':''}${nw.toFixed(2)}`:''}\n${bk?`\nOrder book: ${bk.imb>=0?'+':''}${(bk.imb*100).toFixed(0)}% imbalance (positive = more buyers), biggest sell wall +${(bk.wallA*100).toFixed(2)}%, buy wall ${(bk.wallB*100).toFixed(2)}%`:''}${bk&&((res.shown==='BUY'&&bk.wallA<(pl.tp1-r.px)/r.px)||(res.shown==='SELL'&&-bk.wallB<(r.px-pl.tp1)/r.px))?'\nHeads up: large resting orders sit before take profit 1.':''}${res.flow&&isFinite(res.flow.cd)?`\nOrder flow: ${Math.abs(res.flow.cd*100).toFixed(0)}% net ${res.flow.cd>0?'buying':'selling'} pressure (last 20 candles)`:''}\nMove stop to entry at take profit 1. Not financial advice.`;
}

/* ---------- one full scan ---------- */
const stat={last:null,markets:0,alerts:0,errors:0,scans:0};
async function scanOnce(){
  const dv=new Deriv(),t0=Date.now();let alerts=0,errs=0,ok=0;
  try{
    const all=await loadSyms(dv),list=all.filter(x=>CFG.cats.includes(x.c));
    log(`scanning ${list.length} markets (${CFG.cats.map(c=>CATS[c]||c).join(', ')}) on ${CFG.tfs.map(t=>TF[t]||t).join(', ')}`);
    for(const g of CFG.tfs){
      let idx=0;const found=[];
      const w=async()=>{while(idx<list.length){const m=list[idx++];
        try{const c=await getData(dv,m.s,g,g>=14400?1500:2000);
          const nk=newsKind(m.s);const nv=nk?await getNews(m.s).catch(()=>null):null;
          const res=E.evaluate(c,g,CFG.gate,Math.floor(Date.now()/1000),{news:nv?nv.bias:null,fwd:fwdFor(m.s,g)});
          if(res){ok++;learn(res,m.s,g);if(!res.stale&&res.shown!=='WAIT'&&res.pl&&res.sc.conf>=CFG.minConf&&(res.bt.edge||!CFG.gate))found.push({res,m,g,c,nv})}}
        catch(e){errs++}
        await sleep(150)}};
      await Promise.all([w(),w()]);
      for(const f of found){let res=f.res;const key0=`${f.m.s}|${g}|${res.k[res.k.length-1].epoch}`;if(S.sent[key0+'|'+res.shown])continue;
        const bk=bsym(f.m.s)?await getBook(f.m.s).catch(()=>null):null;
        if(bk){const r2=E.evaluate(f.c,g,CFG.gate,Math.floor(Date.now()/1000),{news:f.nv?f.nv.bias:null,fwd:fwdFor(f.m.s,g),book:bk});if(!r2||r2.shown==='WAIT'||!r2.pl||r2.sc.conf<CFG.minConf)continue;res=r2}
        const key=key0+'|'+res.shown;f.res=res;const up=res.shown==='BUY';
        if(await push(`${f.res.shown} ${f.m.n} (${TF[g]||g})`,alertText(f.res,f.m,g,bk),up?'chart_with_upwards_trend':'chart_with_downwards_trend',f.res.sc.conf>=80?'high':'default')){S.sent[key]=Date.now();alerts++;log('alert sent:',key)}}
    }
  }finally{dv.close()}
  const cut=Date.now()-3*864e5;for(const k in S.sent)if(S.sent[k]<cut)delete S.sent[k];
  saveState();Object.assign(stat,{last:new Date().toISOString(),markets:ok,alerts:stat.alerts+alerts,errors:errs,scans:stat.scans+1});
  log(`done in ${Math.round((Date.now()-t0)/1000)}s: ${ok} analysed, ${alerts} new alerts, ${errs} errors`);
  return{ok,errs,alerts};
}

/* ---------- main ---------- */
(async()=>{
  if(CFG.testNotify){const k=await push('Signal Desk test','If you can read this, alerts are working.','white_check_mark');process.exit(k?0:1)}
  if(CFG.port)http.createServer((q,r)=>{r.writeHead(200,{'content-type':'application/json'});r.end(JSON.stringify({ok:true,...stat}))}).listen(CFG.port,()=>log('health check on port',CFG.port));
  if(!CFG.topic)log('WARNING: NTFY_TOPIC is not set, so no phone alerts will be sent.');
  if(CFG.once){let r;try{r=await scanOnce()}catch(e){log('scan failed:',e.message);process.exit(1)}process.exit(r.ok===0?1:0)}
  log(`running continuously, scanning every ${CFG.every} minutes`);
  for(;;){try{await scanOnce()}catch(e){log('scan failed:',e.message)}await sleep(CFG.every*60000)}
})();
