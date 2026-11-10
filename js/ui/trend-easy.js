"use strict";
/* ============ 傾向の「かんたん」表示: 「調べる」1 回で、完走率・推奨の走り方 (言葉)・効く改善を出す ============
 1. 標準の二段階の探索 (過去 21 年の天気・広域 2,000 + 最適化 5,000 本) で推奨の方針を決める
 2. その方針を、同じ条件の並び (同じ種) で走らせ直して完走率を出し、改善の候補 (CS でも傾ける・消費 −5 %・発電 +5 %・電池 +10 %) を比べる
 3. 2025 年の天気でなぞった 1 本から、前半・後半の平均の速さを言葉にする
 図・変える要素・合わせ込み・実車のログは「詳しく」に今まで通り */
Object.assign(Trend,{
 view:(()=>{ try{ return localStorage.getItem("bwsc_trend_view")==="detail"? "detail" : "easy"; }catch(e){ return "easy"; } })(),
 EASY_N:800, EASY_BUDGET:[2000,5000], easy:null, easyState:null,
 setView(v){ this.view=v; try{ localStorage.setItem("bwsc_trend_view",v); }catch(e){} this.render(); },
 /* 改善の候補。ctx (前提) か R (条件の範囲) を変える */
 LEVERS(){ const L=[];
  if(P.csTilt===false) L.push({k:"cs",label:"CS でも傾けて充電する",ctx:{csFlat:false}});
  L.push({k:"load",label:"走行の消費を 5 % 減らす",R:{lossK:0.95}});
  L.push({k:"solar",label:"発電を 5 % 増やす",R:{effK:1.05}});
  L.push({k:"bat",label:"電池の容量を 10 % 増やす",R:{batK:1.10}});
  return L; },
 /* 1 つの方針を、同じ条件の並びで N 本走らせる → {rate, mean} */
 async evalPol(pol,N,condSeed,mod){ await this.loadHist(); const years=Object.keys(WEATHER_HIST.years).map(Number), yd={}; for(const y of years) yd[y]=WEATHER_HIST.years[y];
  const ctx={...this.ctx(),...((mod&&mod.ctx)||{})}, R=this.ranges();
  if(mod&&mod.R) for(const [k,f] of Object.entries(mod.R)){ const d=R[k]; R[k]={min:d.min*f,max:d.max*f,fix:d.fix!=null?d.fix*f:undefined}; }
  const W=this.W, buf=new Float32Array(N*W), nW=clamp((navigator.hardwareConcurrency||4)-1,1,8), CH=Math.ceil(N/nW); let next=0;
  await new Promise((fin,fail)=>{ let alive=0;
   for(let i=0;i<nW;i++){ const w=new Worker("js/trend-worker.js?v="+TrendLoad.ver()); alive++;
    const give=()=>{ if(next>=N){ w.terminate(); if(--alive===0) fin(); return; } const n=Math.min(CH,N-next); w.postMessage({t:"job",i0:next,n,pols:[pol],R,years,condSeed,width:W}); next+=n; };
    w.onmessage=(e)=>{ const m=e.data; if(m.t==="ready"){ w.postMessage({t:"years",years:yd}); return; } if(m.t==="yearsOk"){ give(); return; } if(m.t==="done"){ buf.set(m.buf,m.i0*W); give(); } };
    w.onerror=(e)=>{ w.terminate(); fail(new Error(e.message||"計算でエラー")); };
    w.postMessage({t:"ctx",ctx}); } });
  let ok=0, s=0; for(let i=0;i<N;i++){ if(buf[i*W+1]){ ok++; s+=buf[i*W+2]; } }
  return {rate:ok/N, mean:ok? s/ok : NaN, n:N}; },
 /* 推奨の方針を言葉に */
 words(pol,T){ const out=[];
  if(T&&T.length>10){ const avg=(a,b)=>{ let d=0,t=0; for(let i=1;i<T.length;i++){ const x=T[i], p=T[i-1], day=Math.floor(p[1]/24)+1; if(day<a||day>b||x[3]<5) continue; const dk=x[0]-p[0], dt=x[1]-p[1]; if(dk>0&&dt>0&&dt<1){ d+=dk; t+=dt; } } return t>0? d/t : NaN; };
   const v1=avg(1,3), v2=avg(4,7); if(Number.isFinite(v1)) out.push(`前半 (Day1〜3) は平均 <b>${v1.toFixed(0)} km/h</b>${Number.isFinite(v2)? `、後半は <b>${v2.toFixed(0)} km/h</b>` : ""} (2025 年の天気で)`); }
  out.push(`速度の上限は ${Math.round(pol.vcap)} km/h。電池は ${(pol.floor*100).toFixed(0)} % を残す`);
  if(pol.lateBias>=0.05) out.push(`後半の天気の悪化を ${(pol.lateBias*100).toFixed(0)} % 見込んで、前半は控えめに`);
  if(pol.fcBias<0.97) out.push(`予報の発電は ${((1-pol.fcBias)*100).toFixed(0)} % 低めに見積もる`);
  if(pol.cloudSlow>=0.05) out.push(`予報より暗いときは ${(pol.cloudSlow*100).toFixed(0)} % 速度を落とす`);
  if(pol.fullBoost>=0.05) out.push(`満充電で発電が余るときは ${(pol.fullBoost*100).toFixed(0)} % 上げる`);
  if(pol.stormLead>=1) out.push(`暴風雨は前縁の ${Math.round(pol.stormLead)} 分前に止まる`);
  if(pol.csExtra>=1) out.push(`CS で ${Math.round(pol.csExtra)} 分余分に充電`);
  return out; },
 async easyRun(){ if(this.busy) return; const st=this.easyState={p:0,msg:"過去 21 年の天気を読み込んでいます"}; this.easyUi();
  const tick=setInterval(()=>{ const r=this.res; if(st.phase==="search"&&r&&r.search){ const b=r.search.budget||1; st.p=Math.min(0.7,0.7*r.done/b); st.msg= r.search.stage===1? "広く探しています" : "完走率 90 % 以上で一番速い方針に絞っています"; } this.easyUi(); },400);
  try{ const keep={...this.cfg}; Object.assign(this.cfg,{mode:"search",s1:this.EASY_BUDGET[0],s2:this.EASY_BUDGET[1],years:null,thr:0.9}); st.phase="search";
   try{ await this.start(); } finally{ Object.assign(this.cfg,keep,{years:null}); }
   const r=this.res; if(!r||!r.P) throw new Error("探索が終わりませんでした"); const bi=r.best>=0?r.best:r.fallback, pol=r.pols[bi];
   st.phase="levers"; const seed=(Math.random()*1e9)>>>0, N=this.EASY_N, L=this.LEVERS();
   st.p=0.72; st.msg="推奨の方針で走らせ直しています"; const base=await this.evalPol(pol,N,seed);
   const lev=[]; for(let j=0;j<L.length;j++){ st.p=0.75+0.2*j/L.length; st.msg=`改善の候補を比べています: ${L[j].label}`; const x=await this.evalPol(pol,N,seed,L[j]); lev.push({...L[j],...x,d:x.rate-base.rate,dm:x.mean-base.mean}); }
   lev.sort((a,b)=>b.d-a.d||a.dm-b.dm);
   st.p=0.97; st.msg="走り方を言葉にしています"; let T=null; try{ const d=await this.trace(bi,0,this.verCond()); T=d.res.trace; }catch(e){}
   this.easy={ts:Date.now(),base,pol,words:this.words(pol,T),lev,best:r.best>=0,cs:P.csTilt!==false,real:!!(typeof Team!=="undefined"&&Team.realK()),cal:!!(this.calActive&&this.calActive())};
  }catch(e){ console.error(e); toast("調べられませんでした: "+e.message,"#ef4444"); }
  finally{ clearInterval(tick); this.easyState=null; this.easyUi(); } },
 easyUi(){ const el=document.getElementById("tr-easy"); if(!el) return; const E=this.easy, st=this.easyState, pct=(x)=>Number.isFinite(x)? (x*100).toFixed(0)+" %" : "―";
  const car=`<span>CS: <b>${P.csTilt!==false?"傾けて充電":"平置き"}</b></span><span>実車との比: <b>${typeof Team!=="undefined"&&Team.realK()?"あり":"なし"}</b></span><span>合わせ込み: <b>${this.calActive&&this.calActive()?"あり":"なし"}</b></span><a href="#" onclick="Team.open('ops');return false">変える</a>`;
  let body="";
  if(st) body=`<div class="tr-prog"><i style="width:${(st.p*100).toFixed(0)}%"></i></div><div class="dim tr-note">${escHtml(st.msg)} (${(st.p*100).toFixed(0)} %)</div>`;
  else if(E){ const top=E.lev.filter(l=>l.d>0.005).slice(0,3), rest=E.lev.filter(l=>!(l.d>0.005));
   body=`<div class="te-row"><span class="te-k">完走率</span><div><b class="te-big ${E.base.rate>=0.9?"ok":E.base.rate>=0.6?"":"bad"}">${pct(E.base.rate)}</b><span class="dim"> ゴールの平均 ${this.fmtH(E.base.mean)}・過去 21 年 × ${E.base.n} 通りの条件</span></div></div>
    <div class="te-row"><span class="te-k">推奨の走り方</span><ul>${E.words.map(w=>`<li>${w}</li>`).join("")}</ul></div>
    <div class="te-row"><span class="te-k">一番効く改善</span><div>${top.length? `<ol>${top.map(l=>`<li>${escHtml(l.label)} → 完走率 <b>${pct(l.rate)}</b> <span class="dim">(+${(l.d*100).toFixed(0)} ポイント)</span></li>`).join("")}</ol>` : `<div class="dim">どれも完走率はほぼ変わりません${E.base.rate>=0.97?" (もう十分に完走できます)":""}</div>`}
     ${rest.length&&top.length? `<div class="dim tr-note">効きが小さい: ${rest.map(l=>escHtml(l.label)).join("・")}</div>` : ""}</div></div>
    <div class="dim tr-note">${new Date(E.ts).toLocaleString("ja-JP")} に調べた結果${E.best?"":"。完走率 90 % 以上の方針がないため、完走率が一番高い方針"}。</div>`; }
  else body=`<div class="dim tr-note">「調べる」を押すと、過去 21 年の大会時期の天気で走り方を探し、完走率・推奨の走り方・効く改善を出します。</div>`;
  el.innerHTML=`<div class="hv-card te-card"><div class="hv-h">${ic("chart")}戦略を考える<span class="dim">天気: 過去 21 年 (2005〜2025)</span></div>
   <div class="te-car">${car}</div>
   <div class="te-go"><button class="btn pri" ${st||this.busy?"disabled":""} onclick="Trend.easyRun()">${ic("play")}調べる (約 20 秒)</button></div>
   ${body}</div>
   <div class="te-more"><button class="btn ana-sm" onclick="Trend.setView('detail')">${ic("sliders")}詳しく (図・レポート・変える要素・合わせ込み・実車のログ)</button></div>`; },
});
/* 表示の切り替え: かんたん / 詳しく */
(()=>{ const r0=Trend.render;
 Trend.render=function(){ r0.call(this); const el=document.getElementById("ana-trend"); let e=document.getElementById("tr-easy");
  if(!e){ e=document.createElement("div"); e.id="tr-easy"; el.appendChild(e); }
  const easy=this.view==="easy"; el.classList.toggle("te-on",easy);
  if(easy) this.easyUi(); };
 const l0=Trend.left; Trend.left=function(...a){ l0.apply(this,a); const L=document.getElementById("tr-l"); if(L&&this.view!=="easy"&&!L.querySelector("#te-back2")) L.insertAdjacentHTML("afterbegin",`<div id="te-back2"><button class="btn ana-sm" onclick="Trend.setView('easy')">${ic("left")}かんたん表示に戻る</button></div>`); };
})();
