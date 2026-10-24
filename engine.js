// Generated from signal-desk.html: the same analysis engine the app uses.

const ema=(a,p)=>{const k=2/(p+1);let e=a[0];return a.map(v=>(e=v*k+e*(1-k)))};

function indic(k){
  const n=k.length,c=k.map(x=>x.close),h=k.map(x=>x.high),l=k.map(x=>x.low);
  const e20=ema(c,20),e50=ema(c,50),e200=ema(c,200);
  const m12=ema(c,12),m26=ema(c,26),ml=m12.map((v,i)=>v-m26[i]),sg=ema(ml,9),hist=ml.map((v,i)=>v-sg[i]);
  const rsi=new Array(n).fill(50);let g=0,ls=0;
  for(let i=1;i<n;i++){
    const d=c[i]-c[i-1],u=Math.max(d,0),dn=Math.max(-d,0);
    if(i<=14){g+=u;ls+=dn;if(i===14){g/=14;ls/=14;rsi[i]=ls===0?100:100-100/(1+g/ls)}}
    else{g=(g*13+u)/14;ls=(ls*13+dn)/14;rsi[i]=ls===0?100:100-100/(1+g/ls)}
  }
  const atr=new Array(n).fill(0),adx=new Array(n).fill(0);
  let tr14=0,pd14=0,md14=0,adxv=0;const dxs=[];
  for(let i=1;i<n;i++){
    const tr=Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1]));
    const up=h[i]-h[i-1],dn=l[i-1]-l[i],pdm=up>dn&&up>0?up:0,mdm=dn>up&&dn>0?dn:0;
    if(i<=14){tr14+=tr;pd14+=pdm;md14+=mdm;if(i===14)atr[i]=tr14/14}
    else{tr14=tr14-tr14/14+tr;pd14=pd14-pd14/14+pdm;md14=md14-md14/14+mdm;atr[i]=(atr[i-1]*13+tr)/14}
    if(i>=14){
      const pdi=100*pd14/(tr14||1),mdi=100*md14/(tr14||1),dx=100*Math.abs(pdi-mdi)/((pdi+mdi)||1);
      if(i<28){dxs.push(dx);if(i===27){adxv=dxs.reduce((a,b)=>a+b)/14;adx[i]=adxv}}
      else{adxv=(adxv*13+dx)/14;adx[i]=adxv}
    }
  }
  const sma=(a,p)=>{const o=new Array(a.length).fill(NaN);let t=0;for(let i=0;i<a.length;i++){t+=a[i];if(i>=p)t-=a[i-p];if(i>=p-1)o[i]=t/p}return o};
  const sma20=sma(c,20),sma200=sma(c,200),sd20=c.map((v,i)=>{if(i<19)return NaN;let q=0;for(let j=i-19;j<=i;j++)q+=(c[j]-sma20[i])**2;return Math.sqrt(q/20)});
  const rsi2=new Array(n).fill(50);{let g2=0,l2=0;for(let i=1;i<n;i++){const d=c[i]-c[i-1],u=Math.max(d,0),dn=Math.max(-d,0);if(i<=2){g2+=u;l2+=dn;if(i===2){g2/=2;l2/=2;rsi2[i]=l2===0?100:100-100/(1+g2/l2)}}else{g2=(g2+u)/2;l2=(l2+dn)/2;rsi2[i]=l2===0?100:100-100/(1+g2/l2)}}}
  const st=new Array(n).fill(0);{let fu=0,fl=0,dir=1;for(let i=15;i<n;i++){const m=(h[i]+l[i])/2,a=atr[i]*3,bu=m+a,bl=m-a;if(i===15){fu=bu;fl=bl}else{fu=(bu<fu||c[i-1]>fu)?bu:fu;fl=(bl>fl||c[i-1]<fl)?bl:fl}if(dir===1&&c[i]<fl)dir=-1;else if(dir===-1&&c[i]>fu)dir=1;st[i]=dir}}
  let cd20=null,dr=null;
  if(n>0&&k.every(x=>x.v>0&&isFinite(x.tb))){dr=k.map(x=>(2*x.tb-x.v)/x.v);cd20=new Array(n).fill(NaN);let sd=0,sv=0;
    for(let i=0;i<n;i++){sd+=2*k[i].tb-k[i].v;sv+=k[i].v;if(i>=20){sd-=2*k[i-20].tb-k[i-20].v;sv-=k[i-20].v}if(i>=19)cd20[i]=sd/sv}}
  return{c,h,l,e20,e50,e200,hist,rsi,atr,adx,sma20,sma200,sd20,rsi2,st,cd20,dr};
}

const WARM=210;
function score(I,i){
  const{c,e20,e50,e200,hist,rsi,adx,h,l,atr}=I,px=c[i];
  let s=0;const why=[];
  if(px>e50[i]&&e20[i]>e50[i]){s+=1;why.push('Short-term uptrend: price and EMA 20 are above EMA 50')}
  else if(px<e50[i]&&e20[i]<e50[i]){s-=1;why.push('Short-term downtrend: price and EMA 20 are below EMA 50')}
  if(e50[i]>e200[i]){s+=1;why.push('Longer trend is up (EMA 50 above EMA 200)')}else{s-=1;why.push('Longer trend is down (EMA 50 below EMA 200)')}
  if(hist[i]>0&&hist[i]>hist[i-1]){s+=1;why.push('Momentum is rising (MACD histogram growing)')}
  else if(hist[i]<0&&hist[i]<hist[i-1]){s-=1;why.push('Momentum is falling (MACD histogram shrinking)')}
  const r=rsi[i];
  if(r>=50){s+=.5;why.push('RSI '+r.toFixed(0)+': buyers slightly stronger'+(r>75?' (stretched, entry may be late)':''))}
  else{s-=.5;why.push('RSI '+r.toFixed(0)+': sellers slightly stronger'+(r<25?' (stretched, entry may be late)':''))}
  let hi=-Infinity,lo=Infinity;for(let j=i-20;j<i;j++){if(h[j]>hi)hi=h[j];if(l[j]<lo)lo=l[j]}
  if(px>hi){s+=1;why.push('Price broke above the 20-candle high')}
  else if(px<lo){s-=1;why.push('Price broke below the 20-candle low')}
  const ranging=adx[i]<20;
  if(ranging)why.unshift('Market is ranging (ADX '+adx[i].toFixed(0)+' is below 20), so trend signals are unreliable');
  const dir=ranging?'WAIT':s>=2.5?'BUY':s<=-2.5?'SELL':'WAIT';
  return{s,dir,why,px,a:atr[i],r,adx:adx[i],ranging,conf:Math.min(100,Math.round(Math.abs(s)/4.5*100))};
}
function plan(dir,px,a){const up=dir==='BUY',R=1.5*a;return{R,sl:up?px-R:px+R,tp1:up?px+2*R:px-2*R,tp2:up?px+3*R:px-3*R}}

/* Walk-forward backtest of the exact same rules. Signal at candle close, entry at next open.
   Plan: stop 1.5 ATR, half off at 2R then stop to entry, rest at 3R. Same-candle conflicts count as stop first.
   cost = spread/slippage in R per trade. */
function simTrade(k,i,dir,a,maxHold=120){
  const n=k.length,up=dir==='BUY',R=1.5*a,en=k[i+1].open;
  const sl=up?en-R:en+R,t1=up?en+2*R:en-2*R,t2=up?en+3*R:en-3*R;
  let stage=0,out=null,j=i+1;
  for(;j<n&&j<=i+maxHold;j++){
    const hi=k[j].high,lo=k[j].low;
    const stop=stage===0?sl:en,hitStop=up?lo<=stop:hi>=stop;
    if(hitStop){out=stage===0?-1:1;break}
    const h1=up?hi>=t1:lo<=t1,h2=up?hi>=t2:lo<=t2;
    if(stage===0&&h1)stage=1;
    if(stage===1&&h2){out=2.5;break}
  }
  const hit=out!==null;let end=j;
  if(out===null){
    end=Math.min(j,n)-1;const r=(up?k[end].close-en:en-k[end].close)/R;
    out=stage===1?1+0.5*r:r;
  }
  return{out,end,done:hit||j>i+maxHold};
}
function backtest(k,I,cost=0.1,maxHold=120,fn){
  const f=fn||((I,i)=>score(I,i).dir),n=k.length,res=[];let i=WARM;
  while(i<n-2){
    const dir=f(I,i),a=I.atr[i];
    if(dir==='WAIT'||!(a>0)){i++;continue}
    const t=simTrade(k,i,dir,a,maxHold);
    const cd=I.cd20?I.cd20[i]:NaN,sg=dir==='BUY'?1:-1;
    res.push({r:t.out-cost,at:k[i+1].epoch,dir,fa:isFinite(cd)?(cd*sg>0.05?1:cd*sg<-0.05?-1:0):null});
    i=Math.max(t.end,i+1);
  }
  return res;
}
/* ---- Strategy library: classic, widely documented systems, all tested on every market ---- */
const hh=(I,i,p)=>{let x=-Infinity;for(let j=i-p;j<i;j++)if(I.h[j]>x)x=I.h[j];return x};
const ll=(I,i,p)=>{let x=Infinity;for(let j=i-p;j<i;j++)if(I.l[j]<x)x=I.l[j];return x};
const STRATS=[
 {id:'trend',name:'Trend composite (EMA, MACD, RSI, ADX)',fn:(I,i)=>score(I,i).dir},
 {id:'donch',name:'Donchian 30 breakout (Turtle style)',fn:(I,i)=>I.c[i]>hh(I,i,30)&&I.c[i]>I.e200[i]?'BUY':I.c[i]<ll(I,i,30)&&I.c[i]<I.e200[i]?'SELL':'WAIT'},
 {id:'ema',name:'EMA 20/50 cross with ADX filter',fn:(I,i)=>I.adx[i]<20?'WAIT':I.e20[i]>I.e50[i]&&I.e20[i-1]<=I.e50[i-1]&&I.c[i]>I.e200[i]?'BUY':I.e20[i]<I.e50[i]&&I.e20[i-1]>=I.e50[i-1]&&I.c[i]<I.e200[i]?'SELL':'WAIT'},
 {id:'rsi2',name:'RSI(2) pullback in trend (Connors)',fn:(I,i)=>I.c[i]>I.sma200[i]&&I.rsi2[i]<10?'BUY':I.c[i]<I.sma200[i]&&I.rsi2[i]>90?'SELL':'WAIT'},
 {id:'boll',name:'Bollinger band reversion in ranges',fn:(I,i)=>I.adx[i]>=25?'WAIT':I.c[i]<I.sma20[i]-2*I.sd20[i]&&I.rsi[i]<35?'BUY':I.c[i]>I.sma20[i]+2*I.sd20[i]&&I.rsi[i]>65?'SELL':'WAIT'},
 {id:'super',name:'Supertrend (10, 3) flip',fn:(I,i)=>I.st[i]===1&&I.st[i-1]===-1?'BUY':I.st[i]===-1&&I.st[i-1]===1?'SELL':'WAIT'},
 {id:'flow',name:'Order flow (net buying/selling pressure + trend)',fn:(I,i)=>!I.cd20||!isFinite(I.cd20[i])?'WAIT':I.cd20[i]>0.08&&I.dr[i]>0.05&&I.c[i]>I.e50[i]?'BUY':I.cd20[i]<-0.08&&I.dr[i]<-0.05&&I.c[i]<I.e50[i]?'SELL':'WAIT'},
 {id:'macd',name:'MACD signal cross with EMA 200 filter',fn:(I,i)=>I.hist[i]>0&&I.hist[i-1]<=0&&I.c[i]>I.e200[i]?'BUY':I.hist[i]<0&&I.hist[i-1]>=0&&I.c[i]<I.e200[i]?'SELL':'WAIT'}
];
/* Each strategy is backtested; the newest 35% of candles are held out (out-of-sample) so a strategy
   only counts as validated if it also worked on data it was not selected on. Forward results from
   the app's own past signals (fwd) can demote a strategy that is failing live. */
function rankStrats(k,I,fwd){
  const n=k.length,split=k[Math.floor(WARM+(n-WARM)*0.65)].epoch;
  const mk=tr=>({all:stats(tr),is:stats(tr.filter(x=>x.at<split)),oos:stats(tr.filter(x=>x.at>=split))});
  return STRATS.filter(S=>S.id!=='flow'||I.cd20).map(S=>{
    const tr=backtest(k,I,0.1,120,S.fn),b=mk(tr),f=fwd&&fwd[S.id],fOk=!f||f.n<10||f.sum/f.n>-0.2;
    let valid=b.all.n>=30&&b.is.exp>0.05&&b.oos.n>=12&&b.oos.exp>=0.1&&b.oos.t>=0.8&&b.all.t>=1.5&&b.all.pf>=1.15&&fOk,sel=b,needFlow=false,useful=false;
    if(I.cd20){/* order flow: does buying/selling pressure agreeing with the trade improve results? */
      const A=tr.filter(x=>x.fa===1),O=tr.filter(x=>x.fa===0||x.fa===-1),m=mk(A);
      useful=A.length>=15&&O.length>=8&&m.all.exp-stats(O).exp>=0.1;
      const v2=m.all.n>=20&&m.is.exp>0.1&&m.oos.n>=8&&m.oos.exp>=0.15&&m.oos.t>=0.8&&m.all.t>=1.5&&m.all.pf>=1.2&&fOk;
      if(!valid&&v2){valid=true;sel=m;needFlow=true}}
    return{id:S.id,name:S.name,fn:S.fn,all:sel.all,is:sel.is,oos:sel.oos,valid,needFlow,useful,fwd:f||null};
  }).sort((x,y)=>(y.valid-x.valid)||((y.oos.n?y.oos.exp:-99)-(x.oos.n?x.oos.exp:-99)));
}
/* News: headline sentiment, recency weighted (short half-life for latest, long for background) */
const LEX={
 gold:[/rate cut|cuts? rates|dovish|safe.haven|inflation|geopolit|tension|central bank.{0,12}buy|weak(er)? dollar|dollar (falls|slips|weakens)|yields? (fall|drop|slip)|record high|surge|rally|jumps?|soars?/i,/rate hike|hawkish|strong(er)? dollar|dollar (rises|gains|strengthens)|yields? (rise|jump|climb)|ceasefire|peace deal|sell.?off|slump|tumbl|slides?|plunge|profit.taking|falls?|drops?/i],
 cry:[/etf (inflow|approv)|approv|adoption|rally|surge|record|soars?|bullish|accumulat|breaks? above|halving|inflows?|rate cut/i,/hack|\bban\b|crackdown|lawsuit|sell.?off|plunge|crash|bearish|outflows?|liquidat|dumps?|slumps?|falls?|fraud|rate hike/i],
 oil:[/supply cut|opec.{0,15}cut|demand (rises|grows)|surge|rally|jumps?|sanction|tension/i,/oversupply|stockpile build|demand (falls|weak)|recession|slump|plunge|falls?|drops?/i],
 idx:[/rally|record|surge|gains?|beats?|rate cut|upgrade|soars?/i,/sell.?off|slump|plunge|falls?|drops?|recession|rate hike|downgrade|misses?/i]};
function sentiment(items,kind,nowSec){
  const[b,r]=LEX[kind];let sum=0,w=0;
  for(const x of items){const sc=(b.test(x.t)?1:0)-(r.test(x.t)?1:0);if(!sc)continue;const wt=Math.pow(.5,Math.max(0,nowSec-x.ts)/86400/(x.half||1));sum+=sc*wt;w+=wt}
  return w?Math.max(-1,Math.min(1,sum/(w+2)*2)):0;
}
function stats(res){
  const n=res.length;if(!n)return{n:0,edge:false,exp:0,wr:0,pf:0,dd:0,t:0,curve:[0]};
  const rs=res.map(x=>x.r),sum=rs.reduce((a,b)=>a+b,0),exp=sum/n;
  const pos=rs.filter(x=>x>0).reduce((a,b)=>a+b,0),neg=-rs.filter(x=>x<0).reduce((a,b)=>a+b,0);
  const sd=Math.sqrt(rs.reduce((a,b)=>a+(b-exp)*(b-exp),0)/Math.max(1,n-1));
  const t=sd>0?exp/(sd/Math.sqrt(n)):0;
  let c=0,pk=0,dd=0;const curve=[0];for(const x of rs){c+=x;curve.push(c);if(c>pk)pk=c;if(pk-c>dd)dd=pk-c}
  const pf=neg>0?pos/neg:(pos>0?99:0);
  return{n,exp,wr:rs.filter(x=>x>0).length/n,pf,dd,t,curve,edge:n>=30&&exp>=0.1&&pf>=1.15&&t>=1.0};
}
/* Turn raw candles (newest last, last one still forming) into a full evaluation. */
function evaluate(raw,g,gate,nowSec,opt={}){
  if(!raw||raw.length<WARM+30)return null;
  const lastEpoch=raw[raw.length-1].epoch,k=raw.slice(0,-1),I=indic(k),n=k.length-1,sc=score(I,n);
  const rk=rankStrats(k,I,opt.fwd),ch=rk[0],dir=ch.fn(I,n),a=I.atr[n];
  const bt=Object.assign({},ch.all,{edge:ch.valid});
  const age=nowSec-lastEpoch,stale=age>3*g+300,sg=dir==='BUY'?1:-1;
  const cdn=I.cd20?I.cd20[n]:NaN,fa=isFinite(cdn)&&dir!=='WAIT'?(cdn*sg>0.05?1:cdn*sg<-0.05?-1:0):null;
  let conf=ch.id==='trend'?sc.conf:Math.round(Math.min(95,Math.max(20,40+35*ch.oos.exp+8*ch.oos.t)));
  let shown=dir,reason='';
  if(dir==='WAIT')reason=ch.id==='trend'&&sc.ranging?'ranging':'mixed';
  if(dir!=='WAIT'&&fa!==null){
    if(ch.needFlow&&fa!==1){shown='WAIT';reason='flow'}
    else if(ch.useful){if(fa===1)conf+=8;else if(fa===-1){conf-=15;if(gate){shown='WAIT';reason='flow'}}}}
  const nw=opt.news;
  if(dir!=='WAIT'&&typeof nw==='number'){const al=sg*nw;conf+=Math.round(al*15);if(al<=-0.5&&shown!=='WAIT'){shown='WAIT';reason='news'}}
  const bk=opt.book;
  if(dir!=='WAIT'&&bk&&typeof bk.imb==='number'&&Math.abs(bk.imb)>0.2)conf+=sg*bk.imb>0?4:-4;
  conf=Math.max(5,Math.min(98,Math.round(conf)));
  if(stale){shown='WAIT';reason='stale'}
  else if(shown!=='WAIT'&&gate&&!ch.valid){shown='WAIT';reason='noedge'}
  const why=ch.id==='trend'?sc.why.slice():[];
  why.unshift('Strategy: '+ch.name+(ch.needFlow?' (only when order flow agrees)':'')+'. Backtest '+ch.all.n+' trades; out-of-sample '+ch.oos.n+' trades at '+(ch.oos.exp>=0?'+':'')+ch.oos.exp.toFixed(2)+'R each'+(ch.valid?' (validated)':' (not validated)'));
  if(isFinite(cdn))why.push('Order flow, last 20 candles: '+Math.abs(cdn*100).toFixed(0)+'% net '+(cdn>0?'buying':'selling')+' pressure'+(ch.useful?' (flow has improved results in the backtest)':' (informational: it did not clearly improve backtest results)'));
  if(typeof nw==='number'&&Math.abs(nw)>=0.15)why.push('News bias is '+(nw>0?'bullish':'bearish')+' ('+nw.toFixed(2)+')');
  if(bk&&typeof bk.imb==='number')why.push('Live order book is '+(bk.imb>=0?'bid':'ask')+'-heavy ('+(bk.imb*100).toFixed(0)+'% imbalance, not backtested)');
  return{k,I,sc:Object.assign({},sc,{dir,conf,why,a}),pl:dir==='WAIT'?null:plan(dir,sc.px,a),bt,age,stale,shown,reason,raw:dir,span:[k[0].epoch,k[k.length-1].epoch],rank:rk,strat:ch,news:nw,flow:{cd:cdn,fa}};
}

module.exports={ema,indic,score,plan,backtest,simTrade,stats,evaluate,WARM,STRATS,rankStrats,sentiment};
