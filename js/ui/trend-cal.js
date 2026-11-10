"use strict";
/* ============ 傾向: 速い計算をゲームのエンジンに合わせ込む ============
 1. 推奨の方針 (まだ無ければ標準的な方針) を、2025 年の天気・揺らぎなしで速い計算に走らせ、2 km ごとの速度を作る
 2. 見えない枠でゲームを開き、ゲームのエンジンにその速度で本戦を 1 回走らせる (js/ui/trend-cal-drive.js、×1 の時間)
 3. エンジンが走った点ごとに、速い計算の発電・消費を求めて比べ、倍率を出す:
    走行中の発電・傾けての充電・消費 (モーター + 補機)・時間 (減速・加速などで同じ距離にかかる時間)・電池 (エンジンの SOC は電荷の割合なので、電圧の変わり方から電力量の割合に直す。容量の比と、放電・充電の損失)
 4. 消費は CS 間ごとにも合わせる: 前の区間から順に、CS に着く手前の電池 (電力量の割合) がエンジンに合う倍率を探す
 5. 倍率を入れた速い計算に、同じ速度でもう一度なぞらせ、エンジンとゴール時刻・Day6 17 時の位置・CS ごとの電池を比べる
 倍率はこの端末に保存し、車両の値が変わったら「合わせ直しが必要」と出す (保存するのは値の指紋だけ) */
Object.assign(Trend,{
 CAL_KEY:"bwsc_trend_cal",
 calSig(){ const t=JSON.stringify([P.batteryWh,P.arrayArea,P.cellEff,P.mpptEff,P.Cd,P.frontal,P.Crr,massTotal(),P.auxW,P.panel,P.regenStrength,PRO.solarScale,PRO.airRho,LossK.k()]); let h=2166136261; for(let i=0;i<t.length;i++){ h^=t.charCodeAt(i); h=Math.imul(h,16777619); } return (h>>>0).toString(36); },
 calGet(){ try{ const o=JSON.parse(localStorage.getItem(this.CAL_KEY)||"null"); if(!o||!o.k) return null; o.stale=o.sig!==this.calSig(); return o; }catch(e){ return null; } },
 calActive(){ const o=this.calGet(); return o&&!o.stale&&this.cfg.useCal!==false? o.k : null; },
 /* 速い計算のスレッド (2025 年の天気だけ・倍率を指定) */
 async calWorker(cal,year=2025){ const w=new Worker("js/trend-worker.js?v="+TrendLoad.ver()), ctx=this.ctx(); ctx.cal=cal;
  await new Promise((res,rej)=>{ w.onmessage=(e)=>{ if(e.data.t==="ready") w.postMessage({t:"years",years:{[year]:WEATHER_HIST.years[year]}}); else if(e.data.t==="yearsOk") res(); }; w.onerror=(e)=>rej(new Error(e.message||"計算でエラー")); w.postMessage({t:"ctx",ctx}); });
  const call=(msg,type)=>new Promise(res=>{ const id=Math.random(); w.onmessage=(e)=>{ if(e.data.t===type&&e.data.id===id) res(e.data); }; w.postMessage({...msg,id}); });
  return {setCal:(cal)=>call({t:"cal",cal},"cal"),trace:(pol)=>call({t:"trace",pol,cond:this.verCond(),condSeed:1,R:this.ranges(),years:[2025]},"trace"),probe:(pts,cond,useCal)=>call({t:"probe",pts,cond:cond||this.verCond(),useCal:!!useCal},"probe"),end:()=>w.terminate()}; },
 /* 見えない枠でゲームを開き、エンジンを走らせる */
 engineRun(sp,onP){ return new Promise((res,rej)=>{ const f=document.createElement("iframe"); f.style.cssText="position:fixed;left:-12000px;top:0;width:640px;height:400px;opacity:0;pointer-events:none;border:0"; f.setAttribute("aria-hidden","true");
   const done=(fn,x)=>{ setTimeout(()=>f.remove(),0); fn(x); };
   f.onload=async()=>{ try{ const w=f.contentWindow; for(let i=0;i<300&&typeof w.startGame!=="function";i++) await new Promise(r=>setTimeout(r,100)); if(typeof w.startGame!=="function") throw new Error("ゲームを開けません");
     await new Promise((r2,j2)=>{ const s=w.document.createElement("script"); s.src="js/ui/trend-cal-drive.js?v="+TrendLoad.ver(); s.onload=r2; s.onerror=()=>j2(new Error("読み込めません")); w.document.head.appendChild(s); });
     await new Promise(r=>setTimeout(r,500)); done(res,await w.CalDrive.run({speed:sp,onProgress:onP})); }catch(e){ done(rej,e); } };
   f.src="index.html?cal=1"; document.body.appendChild(f); }); },
 calPol(){ const r=this.res; if(r&&r.P){ const bi=r.best>=0?r.best:r.fallback; if(bi>=0) return {pol:r.pols[bi],src:"推奨の方針"}; }
  return {pol:{vcap:100,floor:0.08,fcBias:1,lateBias:0,gradeK:0.3,cloudSlow:0.05,fullBoost:0.1,replanH:1,stormLead:0,csExtra:0},src:"標準的な方針"}; },
 /* 合わせ込みで走らせる方針: 電池を使い切ると、エンジンは電流を絞って遅くなり比べられないので、下限を 20 % 以上・巡航 95 km/h まで */
 calDrivePol(){ const {pol,src}=this.calPol(); return {pol:{...pol,floor:Math.max(0.2,pol.floor),vcap:Math.min(95,pol.vcap),fcBias:Math.min(0.97,pol.fcBias),noRules:true},src}; },   /* 締め切りで止めずに最後まで走る */
 async calibrate(){ if(this.busy) return; this.busy=true; const st=this.calState={p:0,msg:"準備中"}; const upd=(p,msg)=>{ st.p=p; if(msg) st.msg=msg; this.left(); };
  let w0=null, w1=null;
  try{ await this.loadHist(); if(!WEATHER_HIST.years[2025]) throw new Error("2025 年の天気がありません"); const {pol,src}=this.calDrivePol();
   upd(0.02,"速い計算で走りを作る"); w0=await this.calWorker(null); const t0=await w0.trace(pol), T0=t0.res.trace||[];
   const N=Math.ceil(TOTAL_KM/2)+2, sp=new Float32Array(N); let k0=0; for(const t of T0){ for(let j=Math.floor(k0/2+1e-6);j<Math.min(N,Math.ceil(t[0]/2-1e-6));j++) sp[j]=t[3]; k0=t[0]; } const vm=T0.length? T0.reduce((a,t)=>a+t[3],0)/T0.length : 60; for(let j=0;j<N;j++) if(!sp[j]) sp[j]=vm;   /* 走りが途中で終わったら残りは平均の速度 */
   upd(0.05,"ゲームのエンジンで本戦を走らせる (×1 の時間)"); const E=await this.engineRun(sp,(p)=>upd(0.05+p*0.85));
   upd(0.92,"比べて倍率を出す"); const S=E.S, W=E.W, n=S.length/W, pts=new Float64Array(n*4); for(let i=0;i<n;i++){ pts[i*4]=S[i*W]; pts[i*4+1]=S[i*W+1]; pts[i*4+2]=S[i*W+2]; pts[i*4+3]=S[i*W+3]; }
   // エンジンの電池 (SOC) は電荷の割合。電圧が残量で変わるので、電力量の割合に直して比べる (速い計算は電力量)
   const ef=(soc)=>{ const T=E.efTab, x=clamp(soc,0,1)*(T.length-1), i=Math.min(T.length-2,Math.floor(x)); return T[i]+(T[i+1]-T[i])*(x-i); };
   const F=(await w0.probe(pts)).buf, A={solar:[0,0],tilt:[0,0],load:[0,0],batD:[0,0],batC:[0,0]};
   for(let i=0;i<n;i++){ const o=i*W, v=S[o+2], tl=S[o+3], disc=S[o+8]; if(disc) continue; const fs=F[i*3], fl=F[i*3+1];
    if(v>1){ A.solar[0]+=S[o+4]; A.solar[1]+=fs; if(fl===fl){ A.load[0]+=S[o+5]; A.load[1]+=fl; } } else if(tl){ A.tilt[0]+=S[o+4]; A.tilt[1]+=fs; }
    if(i>0&&!S[o-W+8]){ const dt=S[o+1]-S[o-W+1], ds=(ef(S[o+7])-ef(S[o-W+7]))*E.E1, pn=(S[o+6]+S[o-W+6])/2; if(dt>0&&dt<0.01){ if(pn>20){ A.batD[0]+=-ds; A.batD[1]+=pn*dt; } else if(pn<-20&&S[o+7]<0.985){ A.batC[0]+=ds; A.batC[1]+=-pn*dt; } } } }
   const k={}; for(const [key,[a,b]] of Object.entries(A)) k[key]= b>1e-6&&a>0? clamp(a/b,0.5,2) : 1;
   k.cap=clamp(E.E1/E.Wh,0.8,1.25);   // 電池の電力量 (電圧の変わり方から) と車両設定の容量の比
   // 時間: 同じ距離 (エンジンの Day5 の終わりまで) を走るのにかかった走行時間の比
   let kmX=0; for(let i=0;i<n;i++) if(S[i*W+1]<4*24+17&&S[i*W+7]>0.1) kmX=S[i*W];   /* 電池が 10 % を切る前まで */ let tE=0; for(let i=1;i<n;i++){ const o=i*W; if(S[o]>kmX) break; const dt=S[o+1]-S[o-W+1]; if(S[o+2]>1&&dt>0&&dt<0.01) tE+=dt; }
   let tF=0, pa=null, pk=0; for(const t of T0){ if(t[0]>kmX) break; if(pa!=null){ const dt=t[1]-pa; if(dt>0&&dt<0.2) tF+=dt; } pa=t[1]; pk=t[0]; } k.time= tF>1&&tE>1? clamp(tE/tF,0.8,1.3) : 1;
   const socAt=(T,km,col,div)=>{ for(const t of T) if(t[0]>=km) return t[col]/(div||1); return NaN; }, eSoc=(km)=>{ for(let i=0;i<n;i++) if(S[i*W]>=km) return ef(S[i*W+7]); return NaN; };   /* 電力量の割合 */
   // CS 間ごとの消費: 前の区間から順に、CS に着く手前の電池 (電力量の割合) がエンジンに合う倍率を探す (0.8〜1.3、電池が満タン近く・10 % 未満の区間は合わせない)
   upd(0.95,"CS 間ごとに電池の減り方を合わせる"); const nL=RP_CS.length+1; k.legs=new Array(nL).fill(1); w1=await this.calWorker(k);
   for(let j=0;j<RP_CS.length;j++){ const target=eSoc(RP_CS[j].km-1); if(!Number.isFinite(target)||target>0.95||target<0.1) continue; let lo=0.8, hi=1.3;
    for(let it=0;it<8;it++){ const m=(lo+hi)/2; k.legs[j]=m; await w1.setCal(k); const tt=await w1.trace({...pol,sp}), f=socAt(tt.res.trace||[],RP_CS[j].km-1,2,100); if(!Number.isFinite(f)) break; if(f>target) lo=m; else hi=m; }
    k.legs[j]=(lo+hi)/2; k.legs[j+1]=k.legs[j]; upd(0.95+0.03*(j+1)/RP_CS.length); }
   await w1.setCal(k); const t1=await w1.trace({...pol,sp}), tFx=await w0.trace({...pol,sp});   /* 比べるのは同じ速度でなぞった走り */
   const T0f=tFx.res.trace||[]; const cs=RP_CS.map(c=>({name:c.name,eng:eSoc(c.km-1),f0:socAt(T0f,c.km-1,2,100),f1:socAt(t1.res.trace||[],c.km-1,2,100)}));   /* CS に着く手前 (充電の前) */
   { let e2=0,c=0; for(const x of cs) if(Number.isFinite(x.eng)&&Number.isFinite(x.f1)){ e2+=(x.f1-x.eng)**2; c++; } k.rms=c? Math.sqrt(e2/c)*100 : NaN; }
   const curve=(fn)=>[...Array(Math.floor(TOTAL_KM/20)+1)].map((_,j)=>fn(j*20));
   let eK=0; for(let i=0;i<n;i++) if(S[i*W+1]<=5*24+17) eK=S[i*W];
   const o={sig:this.calSig(),ts:Date.now(),src,k,cmp:{eng:{fin:E.fin<=5*24+17?E.fin:NaN,km:eK},f0:{fin:tFx.res.ok?tFx.res.fin:NaN,km:tFx.res.km},f1:{fin:t1.res.ok?t1.res.fin:NaN,km:t1.res.km},cs,
    curve:{eng:curve(eSoc),f0:curve(km=>socAt(T0f,km,2,100)),f1:curve(km=>socAt(t1.res.trace||[],km,2,100))}}};
   try{ localStorage.setItem(this.CAL_KEY,JSON.stringify(o)); }catch(e){}
   this._twReady=false; if(this._tw){ this._tw.terminate(); this._tw=null; }   // 1 本詳しく・ドライバーの目標も倍率入りで
   toast("エンジンとの合わせ込みが終わりました","#34d399");
  }catch(e){ console.error(e); toast("合わせ込みでエラー: "+e.message,"#ef4444"); }
  finally{ if(w0) w0.end(); if(w1) w1.end(); this.busy=false; this.calState=null; this.left(); } },
 /* 左の欄: 合わせ込みの状態・ボタン・比べた結果 */
 calCard(){ const o=this.calGet(), st=this.calState, f=(x)=>Number.isFinite(x)? (x*100).toFixed(0)+" %" : "―", kf=(x)=>"×"+x.toFixed(3);
  const head=`<div class="hv-card" id="tr-cal"><div class="hv-h">${ic("sliders")}ゲームのエンジンに合わせ込む</div>`;
  if(st) return head+`<div class="tr-prog"><i style="width:${(st.p*100).toFixed(0)}%"></i></div><div class="dim tr-note">${escHtml(st.msg)} (${(st.p*100).toFixed(0)} %)。約 1 分かかります。</div></div>`;
  const btn=`<div class="tr-run"><button class="btn ana-sm" ${this.busy?"disabled":""} onclick="Trend.calibrate()">${ic("play")}${o?"合わせ直す":"エンジンで合わせ込む"} (約 1 分)</button>${o?`<label class="chk" style="padding:4px 8px"><input type="checkbox" ${this.cfg.useCal!==false?"checked":""} onchange="Trend.cfg.useCal=this.checked;Trend.left()"><i></i>使う</label>`:""}</div>`;
  if(!o) return head+`<div class="dim tr-note">速い計算 (2 km ごと) を、ゲームのエンジン (1 秒ごとの走り) に合わせます。見えない枠でゲームを開いて本戦を 1 回走らせ、発電・消費・電池の出入りの倍率を出します。</div>${btn}</div>`;
  const C=o.cmp;
  return head+`<div class="dim tr-note">${new Date(o.ts).toLocaleString("ja-JP")}・${escHtml(o.src)}で比較${o.stale?` <b class="bad">車両の値が変わったので合わせ直しが必要 (いまは使っていません)</b>`:""}</div>
   <div class="tr-calk"><span>走行中の発電</span><b>${kf(o.k.solar)}</b><span>傾けての充電</span><b>${kf(o.k.tilt)}</b><span>消費 (モーター + 補機)</span><b>${kf(o.k.load)}</b><span>時間 (同じ距離にかかる)</span><b>${kf(o.k.time||1)}</b><span>電池: 容量 / 放電 / 充電</span><b>${kf(o.k.cap||1)} / ${kf(o.k.batD)} / ${kf(o.k.batC)}</b><span>CS に着く手前の電池のずれ (合わせ込み後)</span><b>${Number.isFinite(o.k.rms)?o.k.rms.toFixed(1)+" 点":"―"}</b></div>
   <table class="tr-vt"><tr><th></th><th>ゴール (Day6 17 時まで)</th><th>着かないとき Day6 17 時の位置</th></tr>${[["エンジン",C.eng],["速い計算 (合わせ込み前)",C.f0],["速い計算 (合わせ込み後)",C.f1]].map(([l,x])=>`<tr><td>${l}</td><td>${Number.isFinite(x.fin)?this.fmtH(x.fin):"着かず"}</td><td>${Number.isFinite(x.fin)?"":(+x.km).toFixed(0)+" km"}</td></tr>`).join("")}</table>
   <canvas id="tr-calc"></canvas><div class="dim tr-note">電池 (電力量の割合): 白 = エンジン、灰 = 合わせ込み前、黄 = 合わせ込み後。CS ごと: ${C.cs.map(c=>`${escHtml(c.name)} ${f(c.eng)}/${f(c.f1)}`).join("・")}</div>${btn}</div>`; },
 drawCal(){ const cv=document.getElementById("tr-calc"), o=this.calGet(); if(!cv||!o) return; const [c,W,H]=HVA.fit(cv); c.clearRect(0,0,W,H); const L=28, PW=W-L-6, X=(km)=>L+km/TOTAL_KM*PW, Y=(s)=>4+(1-clamp(s,0,1))*(H-18);
  c.font="500 9px 'Chakra Petch',sans-serif"; c.fillStyle="#8b9097"; for(const s of [0,0.5,1]){ c.strokeStyle="#1a1d21"; c.beginPath(); c.moveTo(L,Y(s)); c.lineTo(W-6,Y(s)); c.stroke(); c.fillText((s*100)+"%",0,Y(s)+3); } for(let k=0;k<=3000;k+=1000) c.fillText(k+"km",X(k)-10,H-3);
  for(const [key,col] of [["f0","rgba(139,144,151,.7)"],["eng","#e6e6e3"],["f1","#f5b51c"]]){ const A=o.cmp.curve[key]; c.strokeStyle=col; c.lineWidth=1.3; c.beginPath(); let k=0; A.forEach((s,j)=>{ if(!Number.isFinite(s)) return; k++? c.lineTo(X(j*20),Y(s)) : c.moveTo(X(j*20),Y(s)); }); c.stroke(); } },
 /* 過去 21 年の天気から: 後半 (Day4〜6) の日射の落ち方・突風の強い日 (変える要素の範囲の根拠) */
 histStats(){ if(typeof WEATHER_HIST==="undefined") return null; if(this._hs) return this._hs; const H=WEATHER_HIST, L=H.loc.map(l=>l[0]), out=[];
  for(const [y,W] of Object.entries(H.years)){ const dd=[], gm=[]; for(let d=1;d<=6;d++){ let s=0,c=0,m=0; L.forEach((k,i)=>{ if(k<(d-1)*500-50||k>d*500+100) return; for(let h=8;h<17;h++){ const t=(d-1)*24+h+48; s+=W.dni[i][t]||0; c++; if(W.wg&&W.wg[i][t]>m) m=W.wg[i][t]; } }); dd.push(s/c); gm.push(m); }
   out.push({y:+y,late:(dd[3]+dd[4]+dd[5])/(dd[0]+dd[1]+dd[2]),gust:Math.max(...gm)}); }
  const ls=out.map(o=>o.late).sort((a,b)=>a-b), q=(f)=>ls[Math.min(ls.length-1,Math.floor(f*ls.length))];
  return this._hs={rows:out,lateMin:ls[0],lateMed:q(0.5),lateMax:ls[ls.length-1],g20:out.filter(o=>o.gust>=20).map(o=>o.y),hasG:out.some(o=>o.gust>0)}; },
 histCard(){ const h=this.histStats(); const head=`<div class="hv-card"><div class="hv-h">${ic("map")}過去 21 年の天気から決めた範囲</div>`;
  if(!h) return head+`<div class="dim tr-note">実行すると、過去の天気 (2005〜2025 年) を読み込んで、ここに根拠を出します。</div></div>`;
  return head+`<div class="dim tr-note" style="line-height:1.7">
   ・後半 (Day4〜6) の日射は、前半 (Day1〜3) の <b>${(h.lateMin*100).toFixed(0)}〜${(h.lateMax*100).toFixed(0)} %</b> (中央 ${(h.lateMed*100).toFixed(0)} %、2025 年 ${(h.rows.find(r=>r.y===2025)||{late:NaN}).late*100|0} %)。この落ち方は年ごとの天気にもう入っているので、「後半の低下」「日ごとの揺らぎ」は上乗せ分として小さく (0〜10 %・0〜0.05)。<br>
   ・その年の突風 (再解析の最大瞬間風速) を、道に直角な成分にして横転の判定に使う (危険度 1.5 以上で横転: 2025 年 Day3 の実車は 1.36 で横転していないため)。走行中の日最大が 20 m/s 以上の年: ${h.g20.length? h.g20.join("・") : "なし"} (${h.g20.length} / ${h.rows.length} 年)。<br>
   ・再解析は局地的な暴風雨 (ダウンバースト) を弱く見る (2025 年 Day6: 再解析 約 21〜25 m/s、実際 39 m/s)。これは「局地的な暴風雨」として別に起こす: 確率 5〜25 %・最大 28〜40 m/s。${h.hasG?"":"<br><b class=\"bad\">突風のデータがありません (天気のデータを作り直してください)</b>"}</div></div>`; },
 /* ---------- 実車のログで確かめる: 分析画面に読み込んだ計測器の CSV (日付がレース期間のもの) と、その日の過去の天気での速い計算を比べる ---------- */
 realRuns(){ return (typeof Ana!=="undefined"&&Ana.runs||[]).filter(r=>r&&r.logger&&r.rows&&r.rows.length>50&&r.rows.some(x=>Number.isFinite(x.abs))); },
 async realCheck(id){ const run=this.realRuns().find(r=>r.id===id); if(!run||this.busy) return; this.busy=true; let w=null;
  try{ await this.loadHist(); const y=+(String(run.date||"").slice(0,4)); if(!WEATHER_HIST.years[y]) throw new Error(`${y||"?"} 年の天気がありません (2005〜2025 年の大会時期だけ)`);
   const R=run.rows.filter(r=>r.v>1&&Number.isFinite(r.abs)&&Number.isFinite(r.ps)&&Number.isFinite(r.pm)), n=R.length; if(n<30) throw new Error("走行中の行が足りません");
   const pts=new Float64Array(n*4); R.forEach((r,i)=>{ pts[i*4]=r.km; pts[i*4+1]=r.abs; pts[i*4+2]=r.v; pts[i*4+3]=0; });
   const cal=this.calActive(); w=await this.calWorker(cal,y); const F=(await w.probe(pts,{...this.verCond(),year:y},true)).buf;
   let rs=0,fs=0,rl=0,fl=0; const bins={}; R.forEach((r,i)=>{ const a=F[i*3], b=F[i*3+1]; if(a>30){ rs+=r.ps; fs+=a; } if(b===b){ rl+=r.pm; fl+=b; } const k=Math.floor(r.abs*6)/6, q=bins[k]||(bins[k]={n:0,rs:0,fs:0,rl:0,fl:0}); q.n++; q.rs+=r.ps; q.fs+=a; q.rl+=r.pm; q.fl+=b===b?b:0; });
   let mr=0, mrAt=null; R.forEach((r,i)=>{ const k=F[i*3+2]; if(k>mr){ mr=k; mrAt=[r.km,r.abs,r.v]; } });   // その日の実際の走りでの横転の危険度 (その年の突風) の最大
   this.realRes={maxRisk:mr,maxRiskAt:mrAt,id,name:run.name,date:run.date,y,n,km:R[n-1].km-R[0].km,solar:fs>0?rs/fs:NaN,load:fl>0?rl/fl:NaN,cal:!!cal,series:Object.entries(bins).map(([k,q])=>[+k,q.rs/q.n,q.fs/q.n,q.rl/q.n,q.fl/q.n]).sort((a,b)=>a[0]-b[0])};
  }catch(e){ toast("実車との比較: "+e.message,"#ef4444"); }
  finally{ if(w) w.end(); this.busy=false; this.left(); } },
 /* 比べた比を、変える要素 (発電の効率・走行の消費) の範囲の中心に (± 3 %) */
 realApply(){ const r=this.realRes; if(!r) return; const set=(k,x)=>{ if(!Number.isFinite(x)) return; const d=this.COND[k]; delete d.fix; d.min=+(x*0.97).toFixed(3); d.max=+(x*1.03).toFixed(3); };
  set("effK",r.solar); set("lossK",r.load); if(typeof Team!=="undefined") Team.setReal({solar:r.solar,load:r.load,src:r.name,date:r.date}); toast("発電の効率・走行の消費の範囲を、実車との比に合わせました","#34d399"); this.left(); },
 realCard(){ const L=this.realRuns(), r=this.realRes, head=`<div class="hv-card" id="tr-real"><div class="hv-h">${ic("activity")}実車のログで確かめる</div>`;
  if(!L.length) return head+`<div class="dim tr-note">分析画面 (本戦) で、計測器の CSV (日付が大会期間のもの) を読み込むと、その日の過去の天気で速い計算と比べられます。</div></div>`;
  const sel=`<div class="tr-run"><select id="tr-realsel">${L.map(x=>`<option value="${x.id}" ${r&&r.id===x.id?"selected":""}>${escHtml(x.name)} (${escHtml(x.date||"")})</option>`).join("")}</select><button class="btn ana-sm" ${this.busy?"disabled":""} onclick="Trend.realCheck(document.getElementById('tr-realsel').value)">${ic("play")}比べる</button></div>`;
  if(!r) return head+sel+`</div>`;
  const pc=(x)=>Number.isFinite(x)? "×"+x.toFixed(3) : "―";
  return head+sel+`<div class="tr-calk"><span>${escHtml(r.date)}・${r.y} 年の天気・${r.km.toFixed(0)} km・${r.n.toLocaleString()} 点</span><b></b><span>発電 (実車 ÷ 速い計算)</span><b>${pc(r.solar)}</b><span>消費 (実車 ÷ 速い計算)</span><b>${pc(r.load)}</b><span>横転の危険度の最大 (この日の突風・実際の速度)</span><b>${Number.isFinite(r.maxRisk)?r.maxRisk.toFixed(2):"―"}</b></div>
   <canvas id="tr-realc"></canvas><div class="dim tr-note">10 分ごとの平均。黄 = 実車の発電、灰 = 速い計算の発電、赤 = 実車の消費、白 = 速い計算の消費。速い計算は${r.cal?"エンジンとの合わせ込み入り":"合わせ込みなし"}。天気は再解析 (約 25 km 四方の平均) なので、雲のかかり方などで 1 日の中では大きくずれることがあります。比は 1 日を通した値。</div>
   <div class="tr-run"><button class="btn ana-sm" style="white-space:normal;flex:1;line-height:1.35" onclick="Trend.realApply()">${ic("check")}この比を「発電の効率」「走行の消費」の範囲に入れる (± 3 %)</button></div></div>`; },
 drawReal(){ const cv=document.getElementById("tr-realc"), r=this.realRes; if(!cv||!r) return; const [c,W,H]=HVA.fit(cv); c.clearRect(0,0,W,H); const S=r.series; if(S.length<2) return;
  const t0=S[0][0], t1=S[S.length-1][0], mx=Math.max(100,...S.map(x=>Math.max(x[1],x[2],x[3],x[4]))), L=34, X=(t)=>L+(t-t0)/((t1-t0)||1)*(W-L-6), Y=(p)=>4+(1-clamp(p/mx,0,1))*(H-18);
  c.font="500 9px 'Chakra Petch',sans-serif"; c.fillStyle="#8b9097"; for(const p of [0,mx/2,mx]){ c.strokeStyle="#1a1d21"; c.beginPath(); c.moveTo(L,Y(p)); c.lineTo(W-6,Y(p)); c.stroke(); c.fillText(Math.round(p)+"W",0,Y(p)+3); }
  for(let t=Math.ceil(t0);t<=t1;t+=Math.max(1,Math.round((t1-t0)/6))) c.fillText(this.fmtH(t).replace(/^D\d /,""),X(t)-10,H-3);
  for(const [j,col] of [[2,"rgba(139,144,151,.85)"],[1,"#f5b51c"],[4,"#e6e6e3"],[3,"#ef6a5a"]]){ c.strokeStyle=col; c.lineWidth=1.3; c.beginPath(); S.forEach((x,k)=>{ k? c.lineTo(X(x[0]),Y(x[j])) : c.moveTo(X(x[0]),Y(x[j])); }); c.stroke(); } },
});
