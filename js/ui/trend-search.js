"use strict";
/* ============ 傾向: 二段階の探索 (広域 → 完走率の制約付き最適化 → 別の条件で確かめ直す) ============
 1. 広域: 方針を偏りなく散らし (ラテン超方格)、それぞれ 20 通りの条件で走らせて、有望な範囲を絞る
 2. 最適化: 絞った範囲で TPE (良い方針と悪い方針の分布の比が大きいところを次に試す) で方針を出す。
   条件は全方針で同じ組・同じ順 (共通乱数)。10・20・30・50・80・120… 通りの区切りごとに判定し、
   完走率が下限に届かないと言える (片側の上限 [z=1.96] が下限未満) なら打ち切り、有望なものだけ増やす。
   ゴールの比べ方は、同じ条件どうしの差 (対の比較)。完走できなかった走りも「どこまで走れたか」を点に入れる (完走率が低いときも良い方向がわかる)
 3. 仕上げ: 上位の方針を、探索で使っていない別の条件で確かめ直し、その結果で推奨を決める (たまたま良く見えた方針を選ぶ偏りを除く)
 本数 (予算) が多いほど、区切りの上限・確かめ直しの本数・同時に出す方針の数を増やす
 下限 (既定 90 %) に届く方針がまったく無いときは、完走率の最大化に切り替わる */
Object.assign(Trend,{
 SRCH:{m1:20,mMax:150,mFin:300,B:8,top:3,HOLD:1000000,LOOK:[10,20,30,50,80,120,150]},
 /* 予算 (広域 s1・最適化 s2 の本数) から、区切り・確かめ直しの本数・同時に出す方針の数を決める */
 plan(s2){ const f=clamp(Math.sqrt(s2/5000),1,6), mMax=Math.round(150*Math.min(f,3)/10)*10, L=[10,20,30,50,80,120]; while(L[L.length-1]*1.5<mMax) L.push(Math.round(L[L.length-1]*1.5/10)*10); L.push(mMax);
  Object.assign(this.SRCH,{mMax,LOOK:L.filter((x,i,a)=>x<=mMax&&a.indexOf(x)===i),mFin:Math.round(300*Math.min(f,4)/50)*50,B:Math.round(8*f),top:clamp(Math.round(3*f),3,8)}); },
 /* 裏のスレッドの組 (探索のあいだ使い回す) */
 pool(yearsData,ctx){ const nW=clamp((navigator.hardwareConcurrency||4)-1,1,12); this.workers.forEach(w=>w.terminate()); this.workers=[];
  return Promise.all([...Array(nW)].map(()=>new Promise((res,rej)=>{ const w=new Worker("js/trend-worker.js?v="+TrendLoad.ver()); this.workers.push(w);
   w.onmessage=(e)=>{ if(e.data.t==="ready") w.postMessage({t:"years",years:yearsData}); else if(e.data.t==="yearsOk") res(); };
   w.onerror=(e)=>rej(new Error(e.message||"計算でエラー")); w.postMessage({t:"ctx",ctx}); }))); },
 /* (方針, 条件) の組を並列に走らせて、結果の行を足す */
 async evalPairs(pairs){ const r=this.res, W=this.W, ws=this.workers, n=pairs.length; if(!n) return;
  const idx=[...Array(n).keys()].sort((a,b)=>pairs[a][1]-pairs[b][1]||pairs[a][0]-pairs[b][0]), per=Math.ceil(n/ws.length), out=new Float32Array(n*W);
  await Promise.all(ws.map((w,k)=>new Promise((res,rej)=>{ const part=idx.slice(k*per,(k+1)*per); if(!part.length) return res();
   const P=new Int32Array(part.length*2); part.forEach((j,q)=>{ P[q*2]=pairs[j][0]; P[q*2+1]=pairs[j][1]; }); const id=Math.random();
   w.onmessage=(e)=>{ const m=e.data; if(m.t!=="done"||m.id!==id) return; part.forEach((j,q)=>out.set(m.buf.subarray(q*W,(q+1)*W),j*W)); res(); };
   w.onerror=(e)=>rej(new Error(e.message||"計算でエラー"));
   w.postMessage({t:"pairs",id,pairs:P,pols:r.pols,R:r.R,years:r.years,condSeed:r.condSeed,width:W},[P.buffer]); })));
  if((r.done+n)*W>r.buf.length){ const nb=new Float32Array(Math.max((r.done+n)*W,r.buf.length*2)); nb.set(r.buf.subarray(0,r.done*W)); r.buf=nb; const nc=new Int32Array(nb.length/W); nc.set(r.ci.subarray(0,r.done)); r.ci=nc; }
  r.buf.set(out,r.done*W); const H=this.SRCH.HOLD, tot=this.ctxTotal||3027;
  for(let j=0;j<n;j++){ const ci=pairs[j][1], o=j*W, s0=r.st[pairs[j][0]], s= ci>=H? (s0.h||(s0.h={n:0,ok:0,sum:0,km:0,f:[]})) : s0, k=ci>=H? ci-H : ci; r.ci[r.done+j]=ci;
   s.n++; s.f[k]= out[o+1]? out[o+2] : NaN; if(out[o+1]){ s.ok++; s.sum+=out[o+2]; s.km+=1; } else s.km+=clamp(out[o+4]/tot,0,1); } r.done+=n; r.N=r.done; },
 /* 方針の見込み: 完走率 (少ない本数でも極端にならないように)・片側 95 % の上限・ゴールの平均 */
 est(s){ const n=s.n, p=n? s.ok/n : 0, z=1.96, z2=z*z, up=n? (p+z2/(2*n)+z*Math.sqrt(p*(1-p)/n+z2/(4*n*n)))/(1+z2/n) : 1;   // 区切りごとに何度も判定するので、片側 97.5 % の上限で (取りこぼしを減らす)
  return {rate:(s.ok+0.5)/(n+1),up,mean:s.ok? s.sum/s.ok : NaN,soft:n? s.km/n : 0}; },
 /* 小さいほど良い: 下限を満たす見込みならゴールの平均 [時間]、満たさないなら完走率の足りない分で大きく */
 /* 下限に届かない方針どうしは、完走率 (7 割) と「どこまで走れたか」(3 割: 完走 = 1、途中で終わり = 走れた距離の割合) で比べる */
 sScore(s){ const e=this.est(s), thr=this.res.thr; return e.rate>=thr&&Number.isFinite(e.mean)? e.mean : 200+(thr-(0.7*e.rate+0.3*e.soft))*1000; },
 /* 対の比較: 同じ条件で両方とも完走した走りの、ゴールの差の平均 [時間] (a − b)。少なければ NaN */
 paired(a,b){ const fa=a.f, fb=b.f, m=Math.min(fa.length,fb.length); let d=0, k=0; for(let c=0;c<m;c++){ const x=fa[c], y=fb[c]; if(x===x&&y===y){ d+=x-y; k++; } } return k>=5? d/k : NaN; },
 /* TPE: 良い組 (上位 γ) と悪い組の、パラメータごとの分布 (正規分布の重ね合わせ) の比が大きい方針を出す */
 tpe(nNew){ const r=this.res, B=r.search.bounds, keys=Object.keys(B), D=keys.length, rnd=Math.random;
  const toU=(pl)=>keys.map(k=>clamp((pl[k]-B[k].lo)/((B[k].hi-B[k].lo)||1),0,1)), fromU=(u)=>{ const o={}; for(const [k,d] of Object.entries(this.POL)){ if(B[k]){ const v=B[k].lo+u[keys.indexOf(k)]*(B[k].hi-B[k].lo); o[k]=(k==="replanH"||k==="stormLead"||k==="csExtra")? Math.round(v) : v; } else o[k]=d.fix!=null? d.fix : (d.min+d.max)/2; } return o; };
  const obs=r.pols.map((pl,i)=>({u:toU(pl),s:this.sScore(r.st[i]),n:r.st[i].n,in:keys.every(k=>pl[k]>=B[k].lo-1e-9&&pl[k]<=B[k].hi+1e-9)})).filter(o=>o.n>0&&o.in).sort((a,b)=>a.s-b.s);
  if(obs.length<10) return [...Array(nNew)].map(()=>fromU(keys.map(()=>rnd())));
  const nG=Math.max(2,Math.min(200,Math.ceil(obs.length*0.2))), G=obs.slice(0,nG); let Bd=obs.slice(nG); if(Bd.length>800){ const st=Bd.length/800; Bd=[...Array(800)].map((_,k)=>Bd[Math.floor(k*st)]); }   // 多いときは間引く (速さ)
  const bw=(set)=>Math.min(0.3,Math.max(0.04,1.06*0.29*Math.pow(set.length,-0.2)));   // 幅: 標本数が多いほど細く
  const dens=(set,u)=>{ const h=bw(set); let lp=0; for(let d=0;d<D;d++){ let s=1/(set.length+1);   // 一様な分も少し混ぜる (端を捨てない)
    for(const o of set){ const z=(u[d]-o.u[d])/h; s+=Math.exp(-0.5*z*z)/(h*2.5066)/(set.length+1); } lp+=Math.log(s); } return lp; };
  const cand=[]; for(let t=0;t<Math.max(24,Math.round(240/Math.sqrt(nNew)))*nNew;t++){ let u; if(rnd()<0.1) u=keys.map(()=>rnd()); else { const g=G[Math.floor(rnd()*G.length)], h=bw(G); u=g.u.map(x=>clamp(x+gaussR()*h,0,1)); } cand.push({u,a:dens(G,u)-dens(Bd,u)}); }
  cand.sort((a,b)=>b.a-a.a); const out=[]; for(const c of cand){ if(out.length>=nNew) break; if(out.every(o=>Math.hypot(...o.u.map((x,d)=>x-c.u[d]))>0.08)) out.push(c); }   // 似た方針を同時に出さない
  while(out.length<nNew) out.push({u:keys.map(()=>rnd())});
  return out.map(c=>fromU(c.u)); },
 /* 方針を増やす (結果の行は後で) */
 addPol(pl,stage){ const r=this.res; r.pols.push(pl); r.st.push({n:0,ok:0,sum:0,km:0,f:[],stage}); r.K=r.pols.length; return r.pols.length-1; },
 /* 走らせ足し: 区切り (10・20・30・50…) ごとに、打ち切る (下限に届かないと言える・推奨より 30 分以上遅い) か、次の区切りまで増やすか */
 async race(list,mMax){ const r=this.res, S=this.SRCH, next=(n)=>S.LOOK.find(x=>x>n)||mMax;
  for(let guard=0;guard<40&&!this.stopReq;guard++){
   const inc=this.incumbent(), feasAny=r.st.some(s=>s.n>=30&&this.est(s).up>=r.thr);
   const top=Math.max(0,...r.st.filter(x=>x.n>=30).map(x=>this.est(x).rate));
   const act=list.filter(i=>{ const s=r.st[i], e=this.est(s); if(s.n>=mMax) return false;
    if(feasAny){ if(e.up<r.thr) return false; if(!inc||inc.i===i) return true; const d=this.paired(s,r.st[inc.i]); return !(d>0.5); }   // 同じ条件どうしで 30 分以上遅いなら打ち切り
    if(e.up<top-0.02) return false; if(top>0) return true;   // 下限に届く方針が無い: 一番高い完走率に届きうるものを伸ばす
    const ts=Math.max(0,...r.st.filter(x=>x.n>=30).map(x=>this.est(x).soft)); return e.soft>=ts-0.03; });   // どれも完走しない: どこまで走れたかで比べる
   if(!act.length) return; const pairs=[]; for(const i of act){ const s=r.st[i]; for(let c=s.n;c<Math.min(mMax,next(s.n));c++) pairs.push([i,c]); }
   await this.evalPairs(pairs); this.progress(); } },
 /* いま一番良い方針 (mMax 通り以上で確かめたものの中で) */
 incumbent(minN){ const r=this.res, m=minN||this.SRCH.mMax; let bi=-1, bs=Infinity; r.st.forEach((s,i)=>{ if(s.n<m) return; const sc=this.sScore(s); if(sc<bs){ bs=sc; bi=i; } }); return bi>=0? {i:bi,s:bs} : null; },
 progress(){ const r=this.res, inc=this.incumbent(), e=inc? this.est(r.st[inc.i]) : null; r.search.hist.push({runs:r.done,stage:r.search.stage,best:e&&e.rate>=r.thr? e.mean : NaN,rate:e? e.rate : NaN});
  const now=performance.now(); if(!this._lu||now-this._lu>500){ this._lu=now; try{ this.aggregate(); this.ui("run",{n:r.done,N:r.search.budget,rate:r.done/((now-r.t0)/1000),phase:r.search.stage===1?"広域":r.search.stage===2?"最適化":"仕上げ"}); }catch(err){ console.error(err); } } },
 async search(){
  const c=this.cfg, S=this.SRCH, s1=clamp(Math.round(c.s1||2000),400,100000), s2=clamp(Math.round(c.s2||5000),1000,1000000); this.plan(s2);
  this.busy=true; this.stopReq=false; this.ui("run",{n:0,N:s1+s2}); try{ await this.loadHist(); }catch(e){ this.busy=false; toast(e.message,"#ef4444"); this.ui(); return; }
  const years=(c.years&&c.years.length? c.years : Object.keys(WEATHER_HIST.years).map(Number)), ctx=this.ctx(), yearsData={}; for(const y of years) yearsData[y]=WEATHER_HIST.years[y];
  const t0=performance.now(), K1=Math.max(20,Math.round(s1/S.m1)); this.ctxTotal=ctx.total;
  this.res={mode:"search",N:0,K:0,pols:[],st:[],R:this.ranges(),years,condSeed:(Math.random()*1e9)>>>0,buf:new Float32Array((s1+s2+S.mFin*S.top+2000)*this.W),ci:null,done:0,t0,thr:c.thr,minN:S.mFin,
   ctxInfo:{Wh:ctx.Wh,vTop:ctx.vTop,cal:!!ctx.cal},cfg:{...c},search:{stage:1,budget:s1+s2+S.mFin*S.top,s1,s2,hist:[],bounds:null,full:{},plan:{look:S.LOOK,mMax:S.mMax,mFin:S.mFin,B:S.B,top:S.top}}};
  const r=this.res; r.ci=new Int32Array(r.buf.length/this.W);
  try{ await this.pool(yearsData,ctx);
   // 1. 広域
   for(const pl of this.policies(K1,(Date.now()%100000)+7)) this.addPol(pl,1);
   const pairs=[]; for(let ci=0;ci<S.m1;ci++) for(let i=0;i<K1;i++) pairs.push([i,ci]);
   for(let a=0;a<pairs.length&&!this.stopReq;a+=Math.max(200,Math.ceil(pairs.length/6))){ await this.evalPairs(pairs.slice(a,a+Math.max(200,Math.ceil(pairs.length/6)))); this.progress(); }
   // 有望な範囲: 上位 25 % の方針の 1〜9 割の幅 + 全体の 5 % の余白 (外れ値 1 つで広がらないように。狭すぎるときは全体の 20 % まで広げる)
   const order=r.pols.map((_,i)=>i).sort((a,b)=>this.sScore(r.st[a])-this.sScore(r.st[b])), top=order.slice(0,Math.max(5,Math.ceil(K1*0.25))), bounds={};
   for(const [k,d] of Object.entries(this.POL)){ if(d.fix!=null) continue; const span=d.max-d.min, v=top.map(i=>r.pols[i][k]).sort((a,b)=>a-b), q=(f)=>v[Math.min(v.length-1,Math.max(0,Math.round(f*(v.length-1))))];
    let lo=q(0.1)-span*0.05, hi=q(0.9)+span*0.05; if(hi-lo<span*0.2){ const m=(lo+hi)/2; lo=m-span*0.1; hi=m+span*0.1; }
    lo=Math.max(d.min,lo); hi=Math.min(d.max,hi); bounds[k]={lo,hi}; r.search.full[k]={lo:d.min,hi:d.max}; }
   r.search.bounds=bounds; r.search.stage=2; r.search.s1Done=r.done;
   // 2. 最適化: まず広域の上位を伸ばし、そのあと TPE で 8 つずつ
   if(!this.stopReq) await this.race(order.slice(0,clamp(Math.floor(0.3*s2/(S.mMax-S.m1)),1,S.B)),S.mMax);   /* 広域の上位を伸ばすのは最適化の本数の 3 割まで (TPE の分を残す) */
   while(!this.stopReq&&r.done-r.search.s1Done<s2){ const ids=this.tpe(S.B).map(pl=>this.addPol(pl,2)), p2=[]; for(const i of ids) for(let ci=0;ci<S.LOOK[0];ci++) p2.push([i,ci]);
    await this.evalPairs(p2); this.progress(); await this.race(ids,S.mMax); }
   // 3. 仕上げ: 上位を、探索で使っていない別の条件 mFin 通りで確かめ直す (その結果で推奨を決める)
   r.search.stage=3; const fin=r.st.map((s,i)=>({i,s:this.sScore(s),n:s.n})).filter(x=>x.n>=30).sort((a,b)=>(b.n>=S.mMax)-(a.n>=S.mMax)||a.s-b.s).slice(0,S.top), p3=[];
   for(const {i} of fin) for(let ci=0;ci<S.mFin;ci++) p3.push([i,S.HOLD+ci]);
   for(let a=0;a<p3.length&&!this.stopReq;a+=4000){ await this.evalPairs(p3.slice(a,a+4000)); this.progress(); } r.search.final=fin.map(x=>x.i);
  }catch(e){ console.error(e); toast("計算でエラー: "+e.message,"#ef4444"); }
  this.workers.forEach(w=>w.terminate()); this.workers=[]; this.busy=false; r.time=(performance.now()-t0)/1000; r.N=r.done; r.buf=r.buf.slice(0,r.done*this.W); r.ci=r.ci.slice(0,r.done);
  this.aggregate(); this.save(); this.ui(); toast(`探索が終わりました: ${r.done.toLocaleString()} 本 (${r.time.toFixed(1)} 秒)`,"#34d399"); },
 /* 探索の経過: 横 = 走らせた本数、縦 = ゴール (平均)。点 = 方針 (黄 = 下限を満たす見込み)、線 = いまの推奨 */
 drawConv(){ const cv=document.getElementById("tr-conv"), r=this.res; if(!cv||!r||r.mode!=="search") return; const [c,W,H]=HVA.fit(cv); c.clearRect(0,0,W,H);
  const S=r.search, H2=S.hist, total=Math.max(r.done,1), pts=[]; let cum=0; const at=new Array(r.pols.length).fill(0);
  for(let i=0;i<r.done;i++){ cum++; at[r.buf[i*this.W]]=cum; }
  const byRate=!H2.some(h=>Number.isFinite(h.best));   // 下限に届く方針が無い: 縦 = 完走率 (上ほど良い)
  r.st.forEach((s,i)=>{ const e=this.est(s); if(byRate) pts.push({x:at[i],y:s.n?s.ok/s.n:0,ok:false,n:s.n}); else if(Number.isFinite(e.mean)) pts.push({x:at[i],y:e.mean,ok:e.rate>=r.thr,n:s.n}); });
  const line=H2.map(h=>({x:h.runs,y:byRate? h.rate : h.best})).filter(h=>Number.isFinite(h.y));
  const ys=[...pts.map(p=>p.y),...line.map(h=>h.y)]; if(!ys.length) return; let y0=Infinity,y1=-Infinity; for(const y of ys){ if(y<y0) y0=y; if(y>y1) y1=y; }
  const L=64, PW=W-L-10, PH=H-24, X=(x)=>L+x/total*PW; let st,ylo,yhi,Y;
  if(byRate){ st=0.2; ylo=0; yhi=1; Y=(y)=>6+(1-y)*(PH-6); } else { st=[0.5,1,2,3,6,12].find(s=>(y1-y0)/s<=5)||12; ylo=Math.floor(y0/st)*st; yhi=Math.max(ylo+st,Math.ceil(y1/st)*st); Y=(y)=>6+(y-ylo)/(yhi-ylo)*(PH-6); }
  c.font="500 10px 'Chakra Petch',sans-serif"; c.fillStyle="#8b9097"; c.textAlign="right";
  for(let y=ylo;y<=yhi+1e-6;y+=st){ c.strokeStyle="#1a1d21"; c.beginPath(); c.moveTo(L,Y(y)); c.lineTo(W-10,Y(y)); c.stroke(); c.fillText(byRate? (y*100).toFixed(0)+" %" : this.fmtH(y),L-4,Y(y)+3); } c.textAlign="left";
  if(byRate){ c.strokeStyle="rgba(245,181,28,.5)"; c.setLineDash([3,3]); c.beginPath(); c.moveTo(L,Y(r.thr)); c.lineTo(W-10,Y(r.thr)); c.stroke(); c.setLineDash([]); c.fillStyle="#8b9097"; c.fillText(`下限 ${(r.thr*100).toFixed(0)} % に届く方針なし → 完走率を上げる探索`,L+6,Y(r.thr)-4); }
  for(const x of [0,0.25,0.5,0.75,1]) c.fillText(Math.round(total*x).toLocaleString()+" 本",X(total*x)-(x===1?40:10),H-4);
  if(S.s1Done){ c.strokeStyle="rgba(245,181,28,.45)"; c.setLineDash([3,3]); c.beginPath(); c.moveTo(X(S.s1Done),6); c.lineTo(X(S.s1Done),PH); c.stroke(); c.setLineDash([]); c.fillStyle="#8b9097"; c.fillText("広域",X(S.s1Done/2)-10,16); c.fillText("最適化",X(S.s1Done)+6,16); }
  for(const p of pts){ c.fillStyle=p.ok? "rgba(245,181,28,.85)" : "rgba(139,144,151,.45)"; c.beginPath(); c.arc(X(p.x),Y(p.y),p.n>=((S.plan||{}).mMax||150)?3.6:2.2,0,7); c.fill(); }
  c.strokeStyle="#22d3ee"; c.lineWidth=1.6; c.beginPath(); line.forEach((h,k)=>{ k? c.lineTo(X(h.x),Y(h.y)) : c.moveTo(X(h.x),Y(h.y)); }); c.stroke(); c.lineWidth=1; },
 /* 確かめ直しの結果から推奨を決める: 別の条件で下限以上の中でゴールが一番早い (無ければ完走率が一番高い) */
 pickFinal(){ const r=this.res, F=r.search&&r.search.final; if(!F||!F.length) return null; const H=F.map(i=>({i,h:r.st[i].h})).filter(x=>x.h&&x.h.n);
  if(!H.length) return null; const ok=H.filter(x=>x.h.ok/x.h.n>=r.thr&&x.h.ok); if(ok.length) return ok.sort((a,b)=>a.h.sum/a.h.ok-b.h.sum/b.h.ok)[0].i; return H.sort((a,b)=>b.h.ok/b.h.n-a.h.ok/a.h.n)[0].i; },
 heldLine(i){ const r=this.res, s=r&&r.st&&r.st[i]; if(!s||!s.h||!s.h.n) return ""; const h=s.h, e=this.est(s);
  return `<div class="tr-held">${ic("check")}<span>探索で使っていない別の条件 ${h.n} 通りで確かめ直し: 完走率 <b>${this.pct(h.ok/h.n,1)}</b>・ゴール平均 <b>${this.fmtH(h.ok?h.sum/h.ok:NaN)}</b><i class="dim">(探索中の見込み: ${this.pct(s.ok/s.n,1)}・${this.fmtH(e.mean)}、${s.n} 通り)</i></span></div>`; },
 convCard(){ const r=this.res; if(!r||r.mode!=="search") return ""; const S=r.search, B=S.bounds||{};
  return `<div class="hv-card"><div class="hv-h">${ic("activity")}探索の経過<span class="dim">広域 ${(S.s1Done||0).toLocaleString()} 本 → 最適化・仕上げ ${(r.done-(S.s1Done||0)).toLocaleString()} 本・方針 ${r.pols.length}・${Number.isFinite(r.time)?r.time.toFixed(1)+" 秒":"計算中"}</span></div>
   <canvas id="tr-conv"></canvas><div class="dim tr-note">点 = 方針 (黄 = 完走率が下限以上の見込み、大きい点 = ${(S.plan||{}).mMax||150} 通り以上で確かめた)。区切り ${((S.plan||{}).look||[]).join("・")} 通りで打ち切りを判定、同時に ${(S.plan||{}).B||8} 個、確かめ直し ${(S.plan||{}).top||3} 個 × ${(S.plan||{}).mFin||300} 通り。青い線 = その時点の推奨 (ゴール、または下限に届く方針が無いときは完走率)。</div>
   ${Object.keys(B).length? `<div class="tr-bnd"><span class="lb">方針</span><span class="lb">広域の範囲</span><span class="lb">絞った範囲</span>${Object.entries(B).map(([k,b])=>{ const d=this.POL[k], f=S.full[k]||{lo:d.min,hi:d.max}; return `<span>${escHtml(d.label)}</span><span>${this.fv(d,f.lo)} 〜 ${this.fv(d,f.hi)}</span><b>${this.fv(d,b.lo)} 〜 ${this.fv(d,b.hi)}</b>`; }).join("")}</div>` : ""}</div>`; },
});
function gaussR(){ let u=0; while(u===0) u=Math.random(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*Math.random()); }
