"use strict";
/* 物理モデル・戦略・天気番号の数値テスト (ブラウザ不要、数秒)。実行: npm run test:model
   走行 (Engine.step) と戦略 (Strategy.simulate) は同じ式 (Model) を使うので、式どうしが食い違わないことと、
   物理として当たり前の性質 (速いほど電力が増える・追い風で減る など) を確かめる */
const load=require("./lib/load");
const results=[]; let failed=0;
function check(name,ok,info){ results.push(`${ok?"PASS":"FAIL"}  ${name}${info!=null?"  ("+info+")":""}`); if(!ok) failed++; }
const near=(a,b,tol)=>Math.abs(a-b)<=tol;
const T0=Date.now();

{ // ---- 走行抵抗・駆動電力 ----
 const C=load(), R=C.run;
 const p80=R(`Model.cruisePower(80/3.6,{m:massTotal()})+P.auxW`), p60=R(`Model.cruisePower(60/3.6,{m:massTotal()})+P.auxW`);
 const hand=R(`(()=>{ const v=80/3.6, m=massTotal(); return (P.Crr*(1+0.003*v)*m*GRAV+0.5*1.17*P.Cd*P.frontal*v*v)*v; })()`);
 check("80 km/h 平地の電力 = 手計算の走行抵抗 + 損失 (損失 2〜10 %)",p80-R("P.auxW")>hand*1.02&&p80-R("P.auxW")<hand*1.10,`${p80.toFixed(0)} W / 抵抗 ${hand.toFixed(0)} W`);
 check("速いほど電力が増える",p80>p60,`${p60.toFixed(0)} → ${p80.toFixed(0)} W`);
 const up=R(`Model.cruisePower(20,{m:massTotal(),grade:0.02})`), dn=R(`Model.cruisePower(20,{m:massTotal(),grade:-0.02})`), fl=R(`Model.cruisePower(20,{m:massTotal()})`);
 check("登り 2 % > 平地 > 下り 2 % (下りは回生で負)",up>fl&&fl>dn&&dn<0,`${up.toFixed(0)} / ${fl.toFixed(0)} / ${dn.toFixed(0)} W`);
 const hw=R(`Model.cruisePower(20,{m:massTotal(),head:5})`), tw=R(`Model.cruisePower(20,{m:massTotal(),head:-5})`);
 check("向かい風 5 m/s > 無風 > 追い風 5 m/s",hw>fl&&fl>tw,`${hw.toFixed(0)} / ${fl.toFixed(0)} / ${tw.toFixed(0)} W`);
 const cw=R(`Model.cruisePower(20,{m:massTotal(),cross:6})`);
 check("横風で空気抵抗が増える (風の角度)",cw>fl,`${cw.toFixed(0)} W`);
 const thin=R(`Model.cruisePower(20,{m:massTotal(),rho:1.05})`);
 check("空気が薄いと電力が減る",thin<fl,`${thin.toFixed(0)} W`);
 const cor=R(`Model.resist(25,{m:massTotal(),gLat:0.3}).corner`);
 check("旋回で抵抗が増える",cor>0,`${cor.toFixed(1)} N`);
 // motorSteady と motorModel (走行) の一致: その電流で出る力・電力が同じ
 const mm=R(`(()=>{ const out=[]; for(const [F,v] of [[60,15],[120,22],[200,18]]){ const st=Model.motorSteady(F,v,0.7,false), m=motorModel(st.I,v,0.7,false); out.push([F,m.F,st.P,m.Pelec]); } return out; })()`);
 check("一定速度の電力の式 = 走行のモーターの式",mm.every(([F,f,p,q])=>near(F,f,0.01*F)&&near(p,q,0.01*p)),mm.map(x=>`${x[0]}N→${x[1].toFixed(1)}N ${x[2].toFixed(0)}/${x[3].toFixed(0)}W`).join(" "));
 const rg=R(`(()=>{ const v=25, B=80, mp=motorParams(false), Ir=B/mp.kt, cmd=Ir/(P.regenStrength*motorMaxA(false)); return [Model.regenSteady(B,v,0.6,false), regenModel(cmd,v,0.6,false).Pgen]; })()`);
 check("回生の式 = 走行の回生の式",near(rg[0],rg[1],0.01*Math.max(1,rg[1])),`${rg[0].toFixed(0)} / ${rg[1].toFixed(0)} W`);
 const ts=R(`[Strategy.topSpeed(false),Strategy.topSpeed(true)]`);
 check("最高速度: POWER ≥ ECO、60〜170 km/h",ts[1]>=ts[0]&&ts[0]>=60&&ts[1]<=170,ts.join(" / ")+" km/h");
}

{ // ---- 風の期待値 (突風・風向の揺らぎ) をモンテカルロと比べる ----
 const C=load(), R=C.run;
 const r=R(`(()=>{ const w={ms:6,toward:0.7,gK:1,dK:1}, b=0.2, e=Model.relWind(w,b); let sh=0, s2=0; const N=200000;
  for(let i=0;i<N;i++){ const g=Model.GUST_SD*Phys.gauss(), d=Model.DIR_SD*Phys.gauss(), ws=w.ms*(1+g), h=ws*Math.cos(w.toward+d-b+Math.PI); sh+=h; s2+=h*h; }
  const m=sh/N; return [e.head,m,e.varH,s2/N-m*m]; })()`);
 check("風の期待値: 向かい風の平均と分散がモンテカルロと一致",near(r[0],r[1],0.05)&&near(r[2],r[3],0.05*r[3]+0.05),`平均 ${r[0].toFixed(3)}/${r[1].toFixed(3)} 分散 ${r[2].toFixed(2)}/${r[3].toFixed(2)}`);
 const z=R(`Model.relWind({ms:5,toward:Math.PI,gK:0},0)`);
 check("真正面からの風 (揺らぎなし) = 向かい風 5 m/s・横風 0",near(z.head,5,1e-9)&&near(z.cross,0,1e-9),`${z.head.toFixed(2)} / ${z.cross.toFixed(2)}`);
}

{ // ---- 日射・発電 ----
 const C=load({realWeather:false}), R=C.run;
 const g=R(`[8,10,12.5,15,17.5].map(h=>Model.irradiance({lat:-12.46,lon:130.84,elev:30,doy:236,hour:h,tilted:false}).G)`);
 check("日射: 正午付近が最大 (Darwin 8 月)",g[2]>g[1]&&g[2]>g[3]&&g[0]<g[1]&&g[4]<g[3],g.map(x=>x.toFixed(0)).join(" / "));
 check("日射: 晴れた正午は 800〜1050 W/m²",g[2]>800&&g[2]<1050,g[2].toFixed(0));
 const tl=R(`[Model.irradiance({lat:-12.46,lon:130.84,elev:30,doy:236,hour:8,tilted:true,tiltDeg:40}).G,Model.irradiance({lat:-12.46,lon:130.84,elev:30,doy:236,hour:8,tilted:false}).G]`);
 check("朝は傾けたほうが日射が多い",tl[0]>tl[1]*1.5,tl.map(x=>x.toFixed(0)).join(" / "));
 const cl=R(`Model.irradiance({lat:-12.46,lon:130.84,elev:30,doy:236,hour:12.5,tilted:false,cloud:0.45}).G`);
 check("雲で日射が減る",cl<g[2]*0.8,cl.toFixed(0));
 const pv=R(`[Model.pvSteady(900,1.1,false,25,25),Model.pvSteady(900,1.1,false,40,0)]`);
 check("暑くて風が無いほど発電が減る (セル温度)",pv[1]<pv[0],pv.map(x=>x.toFixed(0)).join(" / "));
}

{ // ---- 電池 ----
 const C=load(), R=C.run;
 const b=R(`(()=>{ const d=Model.battStep(0.8,25,1000,3600), c=Model.battStep(0.8,25,-1000,3600); return [0.8-d.soc,c.soc-0.8,d.I,c.I]; })()`);
 check("放電で減り、充電で増える。同じ電力なら減るほうが大きい (内部抵抗の損失)",b[0]>0&&b[1]>0&&b[0]>b[1],`-${(b[0]*100).toFixed(2)} % / +${(b[1]*100).toFixed(2)} %`);
 const e=R(`(()=>{ let soc=1, wh=0; while(soc>0.05){ const r=Model.battStep(soc,25,500,60); soc=r.soc; wh+=500/60; } return [wh,P.batteryWh]; })()`);
 check("満充電から 5 % まで 500 W で取り出せる電力量 ≈ 容量の 80〜96 %",e[0]>e[1]*0.80&&e[0]<e[1]*0.96,`${e[0].toFixed(0)} / ${e[1]} Wh`);
 const cold=R(`[Phys.rInt(10,0.5),Phys.rInt(35,0.5)]`);
 check("寒いと内部抵抗が大きい",cold[0]>cold[1],cold.map(x=>x.toFixed(3)).join(" / "));
}

{ // ---- 戦略 ----
 const C=load({realWeather:false}), R=C.run;
 const o=`{abs:8,km:0,soc:1,floor:-9}`;
 const r=R(`[55,65,75].map(v=>{ const x=Strategy.simulate(v,${o}); return [x.ok,x.finishAbs,x.minSoc]; })`);
 check("一定速度: 速いほど早く着き、電池の最小が低い",r[0][1]>r[1][1]&&r[1][1]>r[2][1]&&r[0][2]>=r[1][2]&&r[1][2]>=r[2][2],r.map(x=>`${(x[1]/24+1).toFixed(2)}日 ${(x[2]*100).toFixed(0)}%`).join(" / "));
 const tr=R(`(()=>{ const x=Strategy.simulate(60,{abs:8,km:0,soc:1,floor:-9,trace:true}).trace; let ok=true; for(let i=1;i<x.length;i++) if(!(x[i][0]>=x[i-1][0]&&x[i][1]>=x[i-1][1]&&x[i][2]<=1+1e-9)) ok=false; return [ok,x.length,x[x.length-1][0]]; })()`);
 check("経過: 距離・時刻は増える一方、電池は 100 % 以下",tr[0]&&tr[2]>=R("TOTAL_KM")-0.01,`${tr[1]} 点・${tr[2].toFixed(1)} km`);
 const bp=R(`(()=>{ const t=performance.now(), b=Strategy.bestProfile({abs:8,km:0,soc:1}); return [b.ok,b.v,b.r.minSoc,Strategy.floor(),b.r.finishAbs,performance.now()-t]; })()`);
 check("速度配分: 完走でき、電池が下限を割らない",bp[0]&&bp[2]>=bp[3]-1e-9,`平地 ${bp[1]} km/h・最小 ${(bp[2]*100).toFixed(1)} %・Day${Math.floor(bp[4]/24)+1}・${bp[5].toFixed(0)} ms`);
 const cmp=R(`(()=>{ const b=Strategy.bestProfile({abs:8,km:0,soc:1}), floor=b.r.minSoc; let lo=30,hi=130; while(hi-lo>0.5){ const m=(lo+hi)/2, x=Strategy.simulate(m,{abs:8,km:0,soc:1,floor}); if(x.ok) lo=m; else hi=m; } const c=Strategy.simulate(lo,{abs:8,km:0,soc:1,floor}); return [b.r.finishAbs,c.ok?c.finishAbs:Infinity,lo]; })()`);
 check("速度配分は、同じ電池の下限の一定速度より早く着く",cmp[0]<=cmp[1]+0.05,`配分 ${cmp[0].toFixed(2)} h / 一定 ${cmp[2].toFixed(1)} km/h ${cmp[1].toFixed(2)} h`);
 const head=R(`(()=>{ const sg=Strategy.segAt(1000), e=Strategy.segEnv(sg,8+24*2+3,0.7), mu=4e-4, vmax=120;
  const v0=Strategy.segBestV(sg,mu,Object.assign({},e,{head:0,varH:0,cross:0}),vmax), vh=Strategy.segBestV(sg,mu,Object.assign({},e,{head:6,varH:0,cross:0}),vmax); return [v0,vh]; })()`);
 check("向かい風の区間では配分の速度が下がる (電力の値打ちが同じとき)",head[1]<head[0],head.map(x=>x.toFixed(1)).join(" → ")+" km/h");
 const pieces=R(`(()=>{ let n=0, d=0; for(let k=0;k<TOTAL_KM-2;k+=2){ const s=Strategy.segAt(k); n++; d+=s.pieces.reduce((a,p)=>a+p[1],0); } return [n,d]; })()`);
 check("区間表: 100 m ごとの勾配・制限速度の合計 = ルートの長さ",near(pieces[1],Math.floor((R("TOTAL_KM")-2)/2+1)*2,0.01),`${pieces[0]} 区間・${pieces[1].toFixed(2)} km`);
}

{ // ---- 天気番号 ----
 const C=load({realWeather:false,fcErr:"mid"}), R=C.run;
 const mk=(n)=>R(`(()=>{ Rng.start(${n}); const w=Engine.genWeatherPlan(), f=Engine.genForecast(w); return JSON.stringify([w,f]); })()`);
 check("同じ天気番号 → 同じ天気と予報",mk(1234)===mk(1234));
 check("違う天気番号 → 違う天気か予報",mk(1234)!==mk(1235));
 const iso=R(`(()=>{ Rng.start(42); Rng.r("team"); Rng.r("team"); const a=JSON.stringify(Engine.genWeatherPlan()); Rng.start(42); const b=JSON.stringify(Engine.genWeatherPlan()); return a===b; })()`);
 check("他の用途の乱数を何回使っても天気は変わらない",iso);
 const rg=R(`(()=>{ Rng.start(7); let mn=1, mx=0, s=0; for(let i=0;i<10000;i++){ const x=Rng.r("t"); mn=Math.min(mn,x); mx=Math.max(mx,x); s+=x; } return [mn,mx,s/10000]; })()`);
 check("乱数は 0〜1 に一様",rg[0]>=0&&rg[1]<1&&near(rg[2],0.5,0.02),rg.map(x=>x.toFixed(3)).join(" / "));
}

{ // ---- 発進前のパネル ----
 const C=load(), R=C.run;
 const t=R(`(()=>{ const s=Engine.st, o=[]; s.day=1; s.gridStartH=8+20/60; s.camp=false; s.chapter=null;
  for(const h of [8.0,8+9/60,8+11/60]){ s.hour=h; o.push(Engine.preStartFlat()); }
  s.day=2; s.gridStartH=0; s.camp=true; for(const h of [7.5,7+54/60,7+56/60]){ s.hour=h; o.push(Engine.preStartFlat()); }
  s.morningPenaltyMin=10; s.hour=7+56/60; o.push(Engine.preStartFlat()); s.hour=8+6/60; o.push(Engine.preStartFlat()); return o; })()`);
 const cs=R(`(()=>{ const s=Engine.st, o=[]; s.day=1; s.hour=12; s.stopKind="cp"; s.stopHold=false; for(const t of [1800,301,299]){ s.stopTimer=t; o.push(Engine.csFlatEnd()); } s.hour=17.5; o.push(Engine.csFlatEnd()); s.stopKind=""; s.stopTimer=0; return o; })()`);
 check("CS の最後の 5 分だけ寝かせる (17 時以降の計時停止中は除く)",JSON.stringify(cs)===JSON.stringify([false,false,true,false]),JSON.stringify(cs));
 check("Day1 は発進の 10 分前、Day2 以降は 5 分前 (遅延ペナルティ込み) から寝かせる",JSON.stringify(t)===JSON.stringify([false,false,true,false,false,true,false,true]),JSON.stringify(t));
}

{ // ---- 最低速度 60 km/h (規則 3.29.1) ----
 const C=load({realWeather:false}), R=C.run;
 const v=R(`(()=>{ const sg=Strategy.segAt(1000), e=Strategy.segEnv(sg,8+24*2+3,0.7); return Math.min(...[0.001,0.01,0.05].map(mu=>Strategy.segBestV(sg,mu,e,120))); })()`);
 check("戦略の速度は 60 km/h 以上 (電力の値打ちが大きくても)",v>=60,v.toFixed(1)+" km/h");
 const m=R(`(()=>{ const s=Engine.st, run=(kmh,km,opt)=>{ const dt=1; let d=0; while(d<km){ s.v=kmh/3.6; Object.assign(s,opt||{}); const dk=s.v*dt/1000; d+=dk; Engine.trackMinSpeed(s,dk,dt,110); } };
  const o=[]; s.competing=true; s.minSpd=null; run(55,10.5); o.push(s.competing,s.minSpd.warn); run(70,10.5); o.push(s.minSpd.warn);
  run(55,10.5,{fault:{type:"accel"}}); o.push(s.competing); s.fault=null; run(55,21); o.push(s.competing);
  s.competing=true; s.minSpd=null; for(let i=0;i<5000;i++){ s.v=0; Engine.trackMinSpeed(s,0,60,110); } run(65,10.5); o.push(s.competing,s.minSpd.warn); return o; })()`);
 check("最低速度: 1 回目は警告、続くと競技外。故障中・止まっている時間は数えない",JSON.stringify(m)===JSON.stringify([true,1,0,true,false,true,0]),JSON.stringify(m));
}

console.log(results.join("\n"));
console.log(`\n${results.length-failed}/${results.length} 件成功 (${((Date.now()-T0)/1000).toFixed(1)} 秒)`);
process.exit(failed?1:0);
