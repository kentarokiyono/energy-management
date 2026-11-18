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

{ // ---- タイヤの滑り・操縦 (規則 2.18.6 回転半径・2.19 8 の字とスラローム・2.20.7〜8 ブレーキ) ----
 const C=load(), R=C.run; R(require("./lib/handling"));
 const tr=R(`(()=>{ const p=Tire.params(), r=HT.run({u:2,delta:p.steerMax,tmax:40,wheelR:true,dRate:5}), W=r.wx.slice(r.wx.length/2); let cx=0,cy=0,mx=0;
  for(const q of W){ cx+=q[0]; cy+=q[1]; } cx/=W.length; cy/=W.length; for(const q of W) mx=Math.max(mx,Math.hypot(q[0]-cx,q[1]-cy)); return mx+0.06; })()`);
 check("最小回転半径 (外側のタイヤの外縁) が 7.5 m 以内 (規則 2.18.6)",tr<=7.5,tr.toFixed(2)+" m");
 const f8=R(`(()=>{ const Rr=8.5, pts=[]; for(let x=-20;x<0;x+=0.25) pts.push([x,0]);
  for(let k=0;k<=720;k++){ const a=(k%360)*Math.PI/180, sd=k<360?-1:1; pts.push([Rr*Math.sin(a),sd*(Rr-Rr*Math.cos(a))]); } for(let x=0.25;x<20;x+=0.25) pts.push([x,0]);
  let t0=null,t1=null,t2=null,ph=0,dev=0;
  const r=HT.run({pts,u:6.2,x0:-15,stop:s=>{ if(t0==null&&s.x>=0){ t0=s.t; ph=1; } if(ph===1&&s.t-t0>3&&s.x>=0&&s.y>-3){ t1=s.t; ph=2; } if(ph===2&&s.t-t1>3&&s.x>=0&&s.y<3){ t2=s.t; return true; }
   if(ph>=1){ const ts=s.t-(ph===1?t0:t1); if(ts>0.5&&ts<7) dev=Math.max(dev,Math.abs(Math.hypot(s.x,s.y+(ph===1?Rr:-Rr))-Rr)); } return false; }});
  return {a:t1-t0,b:t2-t1,dev,use:r.maxUse,slide:r.slideT}; })()`);
 check("8 の字: 片側 9 秒未満・合計 18 秒未満、レーン (幅 5 m) の中、滑らない (規則 2.19.1)",f8.a<9&&f8.b<9&&f8.a+f8.b<18&&f8.dev<2.5&&f8.slide===0,`${f8.a.toFixed(2)} + ${f8.b.toFixed(2)} 秒・ずれ ${f8.dev.toFixed(2)} m・グリップ ${(f8.use*100).toFixed(0)} %`);
 const sl=R(`(()=>{ const A=2.3, pts=[]; for(let x=-60;x<=160;x+=0.25){ const xx=clamp(x,-9,135); pts.push([x,-A*Math.cos(Math.PI*(xx-9)/18)*clamp((x+45)/25,0,1)]); }
  let hit=false,out=false,t0=null; const r=HT.run({pts,u:11.4,preview:0.3,x0:-40,stop:s=>{ if(t0==null&&s.x>=0) t0=s.t; for(let i=0;i<7;i++) if(Math.hypot(9+18*i-s.x,s.y)<1.5) hit=true; if(Math.abs(s.y)>6.7) out=true; return s.x>=126; }});
  return {t:r.t-t0,hit,out,use:r.maxUse,slide:r.slideT}; })()`);
 check("スラローム (パイロン 7 本・18 m 間隔): 11.5 秒未満で接触なし・滑らない (規則 2.19.2)",sl.t<11.5&&!sl.hit&&!sl.out&&sl.slide===0,`${sl.t.toFixed(2)} 秒・グリップ ${(sl.use*100).toFixed(0)} %`);
 const br=R(`[1,0.65,0.55].map(mu=>{ const r=HT.run({u0:25,brake:PRO.brakeMu*massTotal()*GRAV,mu,tmax:15}); return {mu,h:r.h*180/Math.PI,y:r.y,F:r.lockF,R:r.lockR,d:r.x}; })`);
 check("まっすぐフルブレーキで向きが変わらない (規則 2.20.7)",br.every(b=>Math.abs(b.h)<0.5&&Math.abs(b.y)<0.1),br.map(b=>`μ${b.mu}: ${b.h.toFixed(2)}°`).join("・"));
 check("ロックするなら前輪が先 (後輪はロックしない、規則 2.20.8)",br.every(b=>b.R==null)&&br.some(b=>b.F!=null),br.map(b=>`μ${b.mu}: 前 ${b.F==null?"なし":b.F.toFixed(2)+" 秒"}`).join("・"));
 check("濡れた路面ではブレーキの距離が延びる",br[1].d>br[0].d*1.1,br.map(b=>b.d.toFixed(1)+" m").join(" / "));
 const us=R(`(()=>{ const p=Tire.params(), st=Tire.init(), v=25; let d=0; for(let t=0;t<20;t+=0.01){ d=Math.min(0.03,t*0.002); Tire.step(st,{u:v,delta:d},{mu:1},0.01); } return {d, k:Math.atan(st.ay*p.L/(v*v)), ay:st.ay/GRAV}; })()`);
 check("弱いアンダーステア (同じ曲がり方に要る舵角が、滑らないときより大きい)",us.d>us.k*1.01&&us.d<us.k*1.6,`舵角 ${(us.d*57.3).toFixed(2)}° / 滑らないとき ${(us.k*57.3).toFixed(2)}°・${us.ay.toFixed(2)} G`);
 const lim=R(`[1,0.65].map(mu=>{ const st=Tire.init(); let r; for(let t=0;t<25;t+=0.01){ r=Tire.step(st,{u:22,delta:Math.min(0.12,t*0.006)},{mu},0.01); } return {beta:Math.abs(Tire.beta(st,22))*180/Math.PI, ay:Math.abs(st.ay)/GRAV, f:Math.max(...r.wheels.filter(w=>w.front).map(w=>w.use)), r:Math.max(...r.wheels.filter(w=>!w.front).map(w=>w.use))}; })`);
 check("限界まで切ると前輪が先に滑ってまっすぐ進む (スピンしない、乾いた・濡れた路面)",lim.every(o=>o.beta<10&&o.f>=o.r),lim.map(o=>`${o.ay.toFixed(2)} G・横すべり ${o.beta.toFixed(1)}°・前 ${(o.f*100).toFixed(0)} / 後 ${(o.r*100).toFixed(0)} %`).join("・"));
 const bt=R(`(()=>{ const r=HT.run({u0:22,delta:0.05,brake:PRO.brakeMu*massTotal()*GRAV,mu:0.6,tmax:10}); return {beta:r.maxBeta*180/Math.PI, F:r.lockF, R:r.lockR}; })()`);
 check("濡れた路面で曲がりながらフルブレーキ: 前輪がロックしてもスピンしない",bt.beta<12&&bt.R==null,`横すべり 最大 ${bt.beta.toFixed(1)}°`);
 const cw=R(`(()=>{ const a=HT.run({u:22,delta:0,Fside:300,tmax:2}), pts=[]; for(let x=-10;x<400;x+=0.5) pts.push([x,0]); const b=HT.run({pts,u:22,Fside:t=>t>2&&t<6?300:0,tmax:10});
  let dev=0; for(const q of b.path) dev=Math.max(dev,Math.abs(q[1])); return {y:a.y,h:a.h*180/Math.PI,dev}; })()`);
 check("横風 (右へ 300 N): 何もしないと風下へ流され鼻先も風下へ。当て舵で車線の中 (0.5 m 以内)",cw.y>0.05&&cw.h>0&&cw.dev<0.5,`2 秒で ${cw.y.toFixed(2)} m・向き ${cw.h.toFixed(2)}°・当て舵 ${cw.dev.toFixed(2)} m`);
 const sp=R(`(()=>{ const F=motorModel(motorMaxA(false)*1.25,3,0.9,false).F; return [1,0.65,0.5].map(mu=>HT.run({u0:3,drive:F,mu,tmax:3}).lockR); })()`);
 check("後輪の空転: 舗装 (乾いた・濡れた) では全開でも空転しない。土の上では起きうる",sp[0]==null&&sp[1]==null,sp.map(x=>x==null?"なし":"あり").join(" / "));
 const su=R(`(()=>{ const p=Susp.params(), tp=Tire.params(), st=Susp.init(), ay=5; for(let t=0;t<4;t+=0.01) Susp.step(st,{ax:-3,Fy:tp.m*ay},0.01);
  const q=Tire.loads(tp,-3,ay,0), fw=p.wh.find(w=>w.geo.kind==="wishbone"); return {d:Math.max(...st.Fz.map((f,i)=>Math.abs(f-q[i]))),ph:st.ph,th:st.th,rc:p.hF,cam:Susp.geoAt(fw,0.03).camber,cam0:Susp.geoAt(fw,0).camber}; })()`);
 check("サスペンション: 落ち着いた後の荷重 = 釣り合いの式、曲がると外へ・ブレーキで前へ傾く",su.d<5&&su.ph<0&&su.th<0,`荷重の差 ${su.d.toFixed(1)} N・ロール ${(su.ph*57.3).toFixed(2)}°・ピッチ ${(su.th*57.3).toFixed(2)}°`);
 check("ダブルウィッシュボーン: ロールセンター 0〜150 mm・縮むと上が内側へ傾く (ネガティブキャンバー)",su.rc>0&&su.rc<0.15&&su.cam<-0.005&&Math.abs(su.cam0)<1e-3,`${(su.rc*1000).toFixed(0)} mm・30 mm 縮んで ${(su.cam*57.3).toFixed(2)}°`);
 const aq=R(`(()=>{ const p=Susp.params(), r=p.wh.find(w=>w.geo.kind==="link"), run=(fx)=>{ const st=Susp.init(); for(let t=0;t<4;t+=0.01) Susp.step(st,{ax:fx/p.m,FxR:fx},0.01); return st; };
  const a=run(400), b=(()=>{ const st=Susp.init(); for(let t=0;t<4;t+=0.01) Susp.step(st,{ax:400/p.m,FxR:0},0.01); return st; })(), i=p.wh.indexOf(r);
  return {anti:r.geo.anti*p.L/p.h, th:a.th, th0:b.th, Fz:a.Fz[i], Fz0:b.Fz[i], side:r.geo.side}; })()`);
 check("後ろ (片持ち): 加速でアームが後ろを持ち上げ、沈み (機首上げ) が減る。荷重の移り方は同じ。アームは右",aq.anti>0&&aq.th<aq.th0&&Math.abs(aq.Fz-aq.Fz0)<3&&aq.side===1,`アンチスクワット ${(aq.anti*100).toFixed(0)} %・${(aq.th0*57.3).toFixed(3)}° → ${(aq.th*57.3).toFixed(3)}°`);
 const air=R(`(()=>{ const p=Susp.params(), f=p.wh.find(w=>w.front), r=p.wh.find(w=>!w.front), k=(w,c)=>(Susp.spring(w,c+0.001)-Susp.spring(w,c-0.001))/0.002;
  return {f0:k(f,0)/f.k, f4:k(f,0.04)/f.k, fm:k(f,-0.04)/f.k, r4:k(r,0.04)/r.k}; })()`);
 check("前のエアサスは縮むほど硬く伸びると柔らかい (静止で既定の硬さ)・後ろのコイルは一定",near(air.f0,1,0.02)&&air.f4>1.3&&air.fm<0.8&&near(air.r4,1,1e-6),`前 伸び 40 mm ×${air.fm.toFixed(2)}・縮み 40 mm ×${air.f4.toFixed(2)}・後ろ ×${air.r4.toFixed(2)}`);
 const al=R(`(()=>{ const p=Tire.params(), set=(o)=>{ P.susp=Object.assign({},o); Susp._p=null; };
  const sat=(o,d,mu)=>{ set(o); const st=Tire.init(); let r; for(let t=0;t<3;t+=0.01) r=Tire.step(st,{u:15,delta:d},{mu},0.01); return st.sat; };
  const s0=sat({caster:0},0.02,1), s6=sat({caster:6},0.02,1), sl0=sat({caster:0},0.3,0.5), sl6=sat({caster:6},0.3,0.5);
  set({ack:100,toe:0}); const A=Tire.align(), fw=p.wh.filter(w=>w.front), d=0.3, ang=fw.map(w=>Tire.steerOf(p,w,d,A)), inner=fw.findIndex(w=>w.py>0);
  const Rc=p.L/Math.tan(d), ok100=fw.every((w,i)=>Math.abs(Math.tan(ang[i])-p.L/(Rc+(w.py>0?-1:1)*Math.abs(w.py)))<1e-6);
  set({}); const dr0=Tire.alignDrag0(270); set({toe:0.5}); const dIn=Tire.alignDrag0(270); set({toe:-0.5}); const dOut=Tire.alignDrag0(270);
  set({toe:0.5}); const roll5=Model.resist(20,{m:270}).roll; set({toe:0}); const roll0=Model.resist(20,{m:270}).roll; set({});
  return {s0,s6,sl0,sl6,inner:ang[inner],outer:ang[1-inner],ok100,dr0,dIn,dOut,roll5,roll0}; })()`);
 check("キャスター: ハンドルの戻る力が増え、前輪が滑っても戻る力が残る",al.s6>al.s0*1.3&&Math.abs(al.sl6)>Math.abs(al.sl0)+1,`普通 ${al.s0.toFixed(1)} → ${al.s6.toFixed(1)} N·m・滑り ${al.sl0.toFixed(1)} → ${al.sl6.toFixed(1)} N·m`);
 check("アッカーマン 100 %: 内輪を多く切り、両輪とも同じ円の中心を向く",al.inner>al.outer&&al.ok100,`内 ${(al.inner*57.3).toFixed(2)}° / 外 ${(al.outer*57.3).toFixed(2)}°`);
 check("トー: 既定はほぼ抵抗なし。0.5° のトーインで転がり抵抗が増え、静的キャンバー (−) とトーアウトは打ち消し合って小さい",al.dr0<0.1&&al.dIn>0.5&&al.dOut<al.dIn&&near(al.roll5-al.roll0,al.dIn,1e-6),`既定 ${al.dr0.toFixed(3)} N・トーイン 0.5° ${al.dIn.toFixed(2)} N・トーアウト ${al.dOut.toFixed(2)} N`);
 const gr=R(`(()=>{ const p=Susp.params(), run=(road)=>{ const st=Susp.init(); let mn=1e9, mx=0, zb=0; const v=22, dt=1/60; let s=-30;
   for(let t=0;t<3;t+=dt){ const s0=s; s+=v*dt; Susp.step(st,{road:(i,f)=>road(s0+v*dt*f+p.wh[i].px,p.wh[i].py)},dt); if(Math.abs(s)<5){ const f=st.Fz[1]; mn=Math.min(mn,f); mx=Math.max(mx,f); zb=Math.max(zb,Math.abs(st.z)); } }
   return {mn:mn/p.wh[1].F0,mx:mx/p.wh[1].F0,zb}; };
  return {flat:run(()=>0), rough:run((s,y)=>Susp.roughAt(s,y,1)), grid:run((s,y)=>Susp.gridAt(s))}; })()`);
 check("ばね下: 平らな道は荷重一定、舗装のうねり・キャトルグリッドで揺れる (舗装では車輪は浮かない・車体はあまり動かない)",near(gr.flat.mn,1,1e-6)&&gr.rough.mn>0.5&&gr.rough.mx>1.05&&gr.grid.mn<0.9&&gr.grid.zb<0.005,`前輪の荷重 舗装 ${(gr.rough.mn*100).toFixed(0)}〜${(gr.rough.mx*100).toFixed(0)} %・グリッド ${(gr.grid.mn*100).toFixed(0)}〜${(gr.grid.mx*100).toFixed(0)} %・車体 ${(gr.grid.zb*1000).toFixed(1)} mm`);
 const tp=R(`(()=>{ const p=Susp.params(), fr=p.wh.map((w,i)=>({w,i})).filter(o=>o.w.geo.kind==="wishbone"), L=fr.find(o=>o.w.py<0), Rt=fr.find(o=>o.w.py>0);
  const ltr=(st)=>(st.Fz[L.i]-st.Fz[Rt.i])/(st.Fz[L.i]+st.Fz[Rt.i]);
  const run=(o)=>{ const st=Susp.init(); for(let t=0;t<3;t+=0.01) Susp.step(st,o,0.01); return st; };
  let ayLift=null; for(let ay=0.2;ay<=2;ay+=0.02){ const st=run({Fy:-p.m*ay*GRAV}); if(Math.min(st.Fz[L.i],st.Fz[Rt.i])<1){ ayLift=ay; break; } }
  const w=run({Fy:-700,Fside:700,lift:400,Mx:400*1.8/4}), wh=run({Fy:-700,Fside:700,lift:400,Mx:400*1.8/4,hold:1500});   // 停車して強い横風 (右へ)
  return {ayLift, wind:Math.abs(ltr(w)), hold:Math.abs(ltr(wh))}; })()`);
 check("横転: 片輪が浮くのは静的安定係数どおり (1.2 G 付近)。止まって横風を受けると荷重が偏り、クルーが押さえると減る",tp.ayLift>1.05&&tp.ayLift<1.35&&tp.wind>0.1&&tp.hold<tp.wind*0.85,`浮く横 G ${tp.ayLift&&tp.ayLift.toFixed(2)}・横風で偏り ${(tp.wind*100).toFixed(0)} % → 押さえて ${(tp.hold*100).toFixed(0)} %`);
 const fl=R(`(()=>{ const p=Tire.params(), right=p.wh.findIndex(w=>w.front&&w.py>0), run=(flat)=>{ const st=Tire.init(); for(let t=0;t<2;t+=0.01) Tire.step(st,{u:20,delta:0},{mu:1,flat},0.01); return st.r; };
  const sg=(flat)=>{ const st=Tire.init(); let ay=0; for(let t=0;t<3;t+=0.01){ Tire.step(st,{u:20,delta:0.04},{mu:1,flat},0.01); ay=st.ay; } return ay; };
  return {r0:run(-1), rF:run(right), ay0:sg(-1), ayF:sg(right), k:Engine.burstCrrK({burstWheel:right})}; })()`);
 check("パンク (右前): 右へ取られ、曲がる力が落ち、転がり抵抗はその車輪の分だけ増える",Math.abs(fl.r0)<1e-6&&fl.rF>0.002&&fl.ayF<fl.ay0&&fl.k>1.5&&fl.k<4,`向きの変わり ${(fl.rF*57.3).toFixed(2)}°/s・横 G ${(fl.ay0/9.79).toFixed(2)} → ${(fl.ayF/9.79).toFixed(2)}・転がり ×${fl.k.toFixed(2)}`);
 const pr=R(`(()=>{ const set=(o)=>{ P.susp=Object.assign({},o); Susp._p=null; }; const roll=()=>Model.resist(20,{m:270}).roll, c=()=>{ const st=Tire.init(); for(let t=0;t<3;t+=0.01) Tire.step(st,{u:20,delta:0.02},{mu:1},0.01); return st.ay; };
  set({pF:4,pR:4}); const r4=roll(), a4=c(); set({pF:6,pR:6}); const r6=roll(), a6=c(); set({}); return {r4,r6,a4,a6}; })()`);
 check("空気圧: 高いほど転がり抵抗が小さく、横すべりが硬い (同じ舵角でよく曲がる)",pr.r6<pr.r4*0.93&&pr.a6>pr.a4,`転がり 4 bar ${pr.r4.toFixed(1)} N → 6 bar ${pr.r6.toFixed(1)} N`);
 const ad=R(`(()=>{ const set=(o)=>{ P.susp=Object.assign({},o); Susp._p=null; }; const run=(o)=>{ const st=Susp.init(); for(let t=0;t<3;t+=0.01) Susp.step(st,o,0.01); return st.th; };
  set({antiDive:0}); const t0=run({ax:-5,FxF:-1000,FxR:-300}); set({antiDive:60}); const t6=run({ax:-5,FxF:-1000,FxR:-300}); set({});
  const p=Susp.params(), w=p.wh[1], b1=Susp.spring(w,p.travel-0.02)+0, st=Susp.init();
  // ダンパー: 同じ速さで縮むより伸びるほうが強い / バンプストッパー: 端で急に硬い (力の比)
  return {t0,t6,cC:w.cC,cR:w.cR}; })()`);
 check("アンチダイブで前の沈みが減る・ダンパーは伸び側が強い",ad.t6>ad.t0&&ad.t0<0&&ad.cR>ad.cC,`沈み ${(ad.t0*57.3).toFixed(3)}° → ${(ad.t6*57.3).toFixed(3)}°`);
 const bk=R(`(()=>{ const s={brakePhys:0.05}, m=270, f=(p,T)=>{ s.brakePhys=p; s.brakeT=T; return Engine.brakeForce(s,m); };
  const dead=f(0.05,30), half=f(0.5,30), full=f(1,30), hot=f(1,400);
  const h={brakeT:30}; let n=0; for(let k=0;k<6;k++){ for(let t=0;t<4;t+=0.05) Engine.brakeHeat(h,full,22*(1-t/4),0.05,0.05,30); n++; }
  return {dead,half,full,hot,T:h.brakeT}; })()`);
 check("ブレーキ: 遊びでは効かず、半分踏みで半分より弱い (踏み込むほど強い)。熱くなると効きが落ちる",bk.dead===0&&bk.half<bk.full*0.45&&bk.hot<bk.full*0.85&&bk.T>200,`半分 ${(bk.half/bk.full*100).toFixed(0)} %・400 °C で ${(bk.hot/bk.full*100).toFixed(0)} %・80 km/h から 6 回止まって ${bk.T.toFixed(0)} °C`);
 const wkC=load(), wk=wkC.run(`(()=>{ VEH.spec.chassis={wheelKg:{FL:60,FR:50,R:90}}; VEH.active=true; Tire._p=null; Susp._p=null; const p=Tire.params();   // (テスト用の値。実車の値ではない)
  return {fs:p.b/p.L, sh:p.wh.map(w=>+w.share.toFixed(3)), yCG:p.wh.reduce((a,w)=>a+w.share*w.py,0)}; })()`);
 check("実測の車輪ごとの重さ (諸元 chassis.wheelKg) から荷重配分と重心の左右のずれ",near(wk.fs,0.55,1e-6)&&near(wk.sh.reduce((a,b)=>a+b,0),1,1e-6)&&Math.abs(wk.yCG)<1e-9,`前 ${(wk.fs*100).toFixed(0)} %・${JSON.stringify(wk.sh)}`);
 const ph=R(`(()=>{ const kCold=Model.tyreK(20), kWarm=Model.tyreK(Model.tyreTempSS(30,22)), rC=Model.resist(22,{m:270,Ttyre:20}).roll, rW=Model.resist(22,{m:270,Ttyre:43}).roll;
  const R25=(Phys.motorRk=Model.motorRk(25), motorParams(false).R), R100=(Phys.motorRk=Model.motorRk(100), motorParams(false).R); Phys.motorRk=1;
  const st0=Tire.init(), st1=Tire.init(), keep=Tire.RELAX; Tire.step(st0,{u:20,delta:0},{mu:1},0.1); Tire.step(st0,{u:20,delta:0.05},{mu:1},0.02); Tire.RELAX=1e-6; Tire.step(st1,{u:20,delta:0},{mu:1},0.1); Tire.step(st1,{u:20,delta:0.05},{mu:1},0.02); Tire.RELAX=keep;
  return {kCold,kWarm,rC,rW,R25,R100,ay0:st0.ay,ay1:st1.ay,cp0:VehDyn.cpAt(0),cp40:VehDyn.cpAt(0.7)}; })()`);
 check("冷えたタイヤは転がり抵抗が大きい (暑い日の巡航で 1)・熱いモーターは巻線の抵抗が大きい",ph.kCold>1.15&&near(ph.kWarm,1,0.02)&&ph.rC>ph.rW&&ph.R100>ph.R25*1.25,`タイヤ 20 °C ×${ph.kCold.toFixed(2)}・巡航 ×${ph.kWarm.toFixed(2)}・モーター 100 °C で抵抗 ×${(ph.R100/ph.R25).toFixed(2)}`);
 check("タイヤの横の力は少し遅れて立ち上がる・横風の力の中心は風の角度が大きいと後ろへ",ph.ay0<ph.ay1*0.95&&ph.ay0>0&&ph.cp40<ph.cp0-0.5,`切って 0.02 秒の横 G ${(ph.ay0/9.79).toFixed(3)} / 遅れなし ${(ph.ay1/9.79).toFixed(3)}・中心 ${ph.cp0.toFixed(2)} → ${ph.cp40.toFixed(2)} m`);
 const ks=R(`(()=>{ const p=Tire.params(), st=Tire.init(); Tire.step(st,{u:0.25,delta:0.2},{mu:1},0.1); return {r:st.r, k:0.25*Math.tan(0.2)/p.L}; })()`);
 check("止まる直前 (0.25 m/s) は前輪の向きどおりに曲がる",near(ks.r,ks.k,1e-9),ks.r.toFixed(4)+" rad/s");
 const slow=R(`(()=>{ const st=Tire.init(), dt=1/60; st.vy=1.5; let t=0, mx=0; for(;t<5;t+=dt){ Tire.step(st,{u:0.6,delta:0},{mu:0.9},dt); const j=Math.abs(st.vy); if(t>0&&j>mx) mx=j; if(Math.abs(st.vy)<0.02) break; } return {t,vy:st.vy}; })()`);
 check("ゆっくり横に滑っても、タイヤの摩擦でなめらかに止まる (急に止まらない)",slow.t>0.1&&slow.t<1.5&&Math.abs(slow.vy)<0.05,`横 1.5 m/s が ${slow.t.toFixed(2)} 秒で止まる`);
 const soil=R(`(()=>{ const z=[0,2,8,20].map(v=>{ let z=0; for(let t=0;t<5;t+=0.05) z=Tire.sinkStep(z,v,1,0.05); return z; }); return {z,crr0:Tire.soilCrr(3,z[0]),crr20:Tire.soilCrr(3,z[3]),gravel:Tire.soilCrr(1,0),Fm:motorModel(48,0.5,0.8,"normal").F,m:massTotal()}; })()`);
 check("道の外: 柔らかい砂は遅いほど深く沈み、止まると埋まって動けない・速ければ抜けられる",soil.z[0]>soil.z[1]&&soil.z[1]>soil.z[3]&&soil.crr0*soil.m*9.79>soil.Fm&&soil.crr20*soil.m*9.79<soil.Fm&&soil.gravel<0.03,`沈み ${soil.z.map(x=>(x*100).toFixed(1)).join("・")} cm (0/2/8/20 m/s)、抵抗 ${(soil.crr0*soil.m*9.79).toFixed(0)} N / ${(soil.crr20*soil.m*9.79).toFixed(0)} N (モーター ${soil.Fm.toFixed(0)} N)`);
 const sair=R(`(()=>{ const a=VehDyn.aeroSide(-20,0,1.17), b=VehDyn.aeroSide(-0.2,20,1.17); return {side:a.Fy, small:b.Fy}; })()`);
 check("横に滑ると空気の力が滑りを止める向きに大きくかかる (真横 20 m/s で数百 N、普通の走りの横すべりでは小さい)",sair.side<-300&&Math.abs(sair.small)<30,`真横 ${sair.side.toFixed(0)} N・横すべり 0.2 m/s で ${sair.small.toFixed(0)} N`);
 const spn=R(`(()=>{ const st=Tire.init(), dt=1/60; st.r=1.5; st.vy=-2; let u=20,t=0,d=0; for(;t<30;t+=dt){ const R=Tire.step(st,{u,delta:0},{mu:0.9},dt); u=Math.max(0,u+R.du*dt); d+=Math.hypot(u,st.vy)*dt; if(Math.hypot(u,st.vy)<0.3) break; } return {t,d}; })()`);
 check("スピンすると横に滑ってタイヤの摩擦で止まる (どこまでも滑らない)",spn.t<6&&spn.d<60,`72 km/h から ${spn.t.toFixed(1)} 秒・${spn.d.toFixed(0)} m`);
}

console.log(results.join("\n"));
console.log(`\n${results.length-failed}/${results.length} 件成功 (${((Date.now()-T0)/1000).toFixed(1)} 秒)`);
process.exit(failed?1:0);
