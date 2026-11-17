"use strict";
/* ============ 戦略: 残りのルートを先読みして、電池が持つ最も速い走り方を探す ============
 先読みの内容: 100 m ごとの勾配と制限速度・カーブ・時刻と場所ごとの日射・気温 (空気密度・セル温度)・風 (向かい風・横風と突風の揺らぎ)・
 偵察班の天気予報 (weatherPlan)・CS の 30 分停車 (傾けて充電)・17 時以降と朝の充電・夜の停止・停車後の加速。
 消費・発電・電池は走行と同じ式 (Model: 内部抵抗の損失・開放電圧・モーターの銅損と鉄損・回生) で数える。
 速度配分: 2 km ごとに「かかる時間 + μ × 使う電力量」が最小になる速度を選ぶ (μ = 電力量の値打ち)。
  登り・向かい風では電力が大きく増えるので遅め、平地・下り・追い風では速めになる。電池が下限を割らない最小の μ を 2 分探索で求める */
const Strategy={
 FLOOR:0.05, SEG:2, PIECE:0.1, CHG_STEP:1/12, last:null, lastT:-1e9,
 floor(){ const s=Engine.st, b=(s&&s.scenario)||!(s&&s.fc)? this.FLOOR : ({off:0.05,low:0.08,mid:0.12,high:0.18,late:0.12})[P.fcErr]||this.FLOOR;
  return (s&&s.scenario)||typeof Coffee==="undefined"? b : Math.max(0.02,b+Coffee.floorAdj()); },   // 朝の打ち合わせで決めた走り方 (攻め・守りで電池を残す量を増減)
 /* [W] 速度 vms [m/s]・勾配 grade で巡航する電力 (モーター + 補機)。env (任意): {head, varH, cross, rho, gLat, soc}。無ければ無風・空気密度 1.17 */
 drivePower(vms,grade,env){ return Model.cruisePower(vms,Object.assign({m:massTotal(),grade},env||{}))+P.auxW; },

 /* ---- ルートの区間 (静的): 2 km ごとに、100 m ごとの勾配・制限速度をまとめた pieces [[勾配, 距離 km, 制限 km/h], ...]・
  カーブの強さ k2 (曲率² の平均 [1/m²])・中央の位置・標高・向き ---- */
 _seg:new Map(),
 segInfo(k0,k1){
  const n=Math.max(1,Math.round((k1-k0)/this.PIECE)), d=(k1-k0)/n, acc=new Map();
  let ePrev=profileAt(k0).elev;
  for(let i=0;i<n;i++){ const a=k0+i*d, eB=profileAt(a+d).elev, g=(eB-ePrev)/(d*1000), lim=speedLimitAt(a+d/2); ePrev=eB;
   const key=Math.round(g*400)*1000+lim, x=acc.get(key); if(x){ x[0]+=g*d; x[1]+=d; } else acc.set(key,[g*d,d,lim]); }
  const pieces=[...acc.values()].map(x=>[x[0]/x[1],x[1],x[2]]);
  let k2=0, m=0;
  for(let a=k0;a<k1-1e-6;a+=0.5){ const b=Math.min(k1,a+0.5); if(b-a<0.05) break; let dt=profileAt(b).bearing-profileAt(a).bearing;
   dt=Math.atan2(Math.sin(dt),Math.cos(dt)); const kap=dt/((b-a)*1000); k2+=kap*kap*(b-a); m+=b-a; }
  const pr=profileAt((k0+k1)/2);
  return {k0,k1,pieces,k2:m>0?k2/m:0,elev:pr.elev,lat:pr.lat,lon:pr.lon,bearing:pr.bearing};
 },
 /* km から次の区切り (SEG の倍数) までの区間。区切りにそろった区間は覚えておく */
 segAt(km){
  const i=Math.floor(km/this.SEG+1e-9), a=i*this.SEG, b=Math.min(TOTAL_KM,a+this.SEG);
  if(km-a<1e-6){ let x=this._seg.get(i); if(!x){ x=this.segInfo(a,b); this._seg.set(i,x); } return x; }
  return this.segInfo(km,b);
 },
 /* 区間を v [km/h] (各 100 m は制限速度まで) で走る: t [h]・モーター + 補機の電力量 E [Wh]・各 piece の [時間 h, 電力 W, 速度 m/s] */
 segRun(sg,v,env,out){
  const m=env.m; let t=0, E=0;
  for(const [g,w,lim] of sg.pieces){ const vi=Math.max(5,Math.min(v,lim)), ms=vi/3.6, dt=w/vi;
   const Pw=Model.cruisePower(ms,{m,grade:g,head:env.head,varH:env.varH,cross:env.cross,rho:env.rho,gLat:ms*ms*Math.sqrt(sg.k2)/GRAV,soc:env.soc,Vb:env.Vb})+P.auxW;
   t+=dt; E+=Pw*dt; if(out) out.push([dt,Pw,ms]); }
  return {t,E};
 },
 /* μ に対して「時間 + μ × 電力量」が最小の速度 [km/h] (黄金分割で探す) */
 segBestV(sg,mu,env,vmax){
  const c=(v)=>{ const r=this.segRun(sg,v,env); return r.t+mu*r.E; }, q=0.6180339887;
  let a=30, b=vmax, x1=b-q*(b-a), x2=a+q*(b-a), f1=c(x1), f2=c(x2);
  while(b-a>1){ if(f1<f2){ b=x2; x2=x1; f2=f1; x1=b-q*(b-a); f1=c(x1); } else { a=x1; x1=x2; f1=f2; x2=a+q*(b-a); f2=c(x2); } }
  return (a+b)/2;
 },
 /* 平均の電力が Ps [W] になる速度 (それより速くはしない) */
 segMatchV(sg,v0,Ps,env,vmax){
  const pw=(v)=>{ const r=this.segRun(sg,v,env); return r.E/r.t; };
  if(pw(v0)>=Ps) return v0; if(pw(vmax)<=Ps) return vmax;
  let a=v0, b=vmax; while(b-a>0.5){ const c=(a+b)/2; if(pw(c)>Ps) b=c; else a=c; } return a;
 },
 /* 区間の環境 (時刻 abs): 気温・空気密度・風 (進む向きに対して) */
 segEnv(sg,abs,soc){
  const day=Math.floor(abs/24), h=abs-day*24, doy=PRO.dayOfYear+day, Tamb=Model.ambient(sg.lat,sg.lon,doy,h);
  const rw=Model.relWind(Model.wind(sg.lat,sg.lon,doy,h),sg.bearing);
  return {m:massTotal(),Tamb,rho:Phys.airDensity(sg.elev,Tamb),head:rw.head,varH:rw.varH,cross:rw.cross,soc,Vb:VOC(soc)};
 },
 /* 予報で見積もる日射。fut: 賭け (明日から先は快晴と見込む) */
 irr(lat,lon,elev,abs,tilted,fut){
  const s=Engine.st, day=Math.floor(abs/24), h=abs-day*24, doy=PRO.dayOfYear+day, fc=s&&s.fc;
  let real=null, cloud=null;
  if(RealWx.on()) real= fc&&!fut? {shift:fc.shift[clamp(day,0,6)],scale:fc.scale[clamp(day,0,6)]} : {shift:0,scale:1};
  else if(!fut){ const w=((fc&&fc.plan)||(s&&s.weatherPlan)||[]).find(w=>abs>=w.start&&abs<w.start+w.dur); if(w) cloud=w.factor; }
  const r=Model.irradiance({lat,lon,elev,doy,hour:h,tilted,tiltDeg:s?s.tiltDeg:40,cloud,real,k:Engine.lateKAt(doy,true)});
  if(fut){ r.G*=1.08; } return r;
 },

 /* 速度 v で今から走り切ったときの経過 → {ok, minSoc, minKm, finishAbs, socNextCS, kmToday, lateCS}
  v: 速度 [km/h] / profile(μ) の速度配分 / 関数 v(勾配, km) (v.full: 満タンで発電が余るときの速度)。
  o (任意): {abs, km, soc} から始める (走行の答え合わせ用)。o.trace があれば 2 km ごとの [km, 時刻, SOC, 速度, 時間] を残す。o.floor で電池の下限を変える。o.bet で賭け */
 simulate(v,o){ const g=this.simulateGen(v,o); let r; while(!(r=g.next()).done){} return r.value; },
 /* 同じ計算を区間 YIELD_SEG 個ごとに区切る (裏で少しずつ進めるため) */
 YIELD_SEG:60,
 *simulateGen(v,o){
  const s=Engine.st, tr=o&&o.trace? [] : null, mEff=massTotal()+PRO.mRot;
  let abs=o? o.abs : (s.day-1)*24+s.hour, km=o? o.km : s.km, soc=o? o.soc : s.soc, minSoc=soc, minKm=km, socNextCS=null, kmToday=null, lateCS=null;
  let Tbat=(!o&&s.Tbat!=null)? s.Tbat : null, vPrev=o? 0 : s.v||0;
  const csList=RP_CS.filter(c=>(o||!s.passedCP.has(c.km))&&c.km>km-0.2), nextCS=csList[0];
  let ci=0, stopH= o? 0 : s.stopTimer>0? s.stopTimer/3600 : 0, stopRem=0;
  if(tr) tr.push([km,abs,soc,0]);
  const bet=o&&o.bet!=null? o.bet : (typeof Coffee!=="undefined"&&Coffee.bet());   // 賭け (朝の打ち合わせ): 明日から先は快晴と見込む
  const startDay=Math.floor(abs/24), FL=o&&o.floor!=null? o.floor : this.floor(), opt=typeof v==="function"&&v.mu!=null;
  const vmax=opt? v.vmax : 0, futAt=(a)=>bet&&Math.floor(a/24)>startDay;
  /* 止まって充電 (hours 時間)。tl: 傾ける。aux: 補機 [W] */
  const charge=(hours,tl,aux)=>{ const pr=profileAt(km);
   for(let t=0;t<hours-1e-9;t+=this.CHG_STEP){ const d=Math.min(this.CHG_STEP,hours-t), a=abs+d/2, day=Math.floor(a/24), doy=PRO.dayOfYear+day, h=a-day*24;
    const r=this.irr(pr.lat,pr.lon,pr.elev,a,tl,futAt(a)), Tamb=Model.ambient(pr.lat,pr.lon,doy,h), w=Model.wind(pr.lat,pr.lon,doy,h);
    const Ps=Model.pvSteady(r.G,r.alt,tl,Tamb,w.ms), b=Model.battStep(soc,Tbat==null?Tamb:Tbat,aux-Ps,d*3600);
    soc=Math.min(1,b.soc); Tbat=Model.battTempSS(Tamb,b.I,b.R,0); abs+=d; }
   vPrev=0; };
  for(let guard=0;guard<8000&&km<TOTAL_KM-1e-6;guard++){
   if(guard%this.YIELD_SEG===this.YIELD_SEG-1) yield;
   const day=Math.floor(abs/24), h=abs-day*24;
   if(stopH>0){ const end=day*24+17;   // CS: 傾けない運用なら平置き。17 時に計時が止まり、残りは翌朝 8 時から
    if(h>=17||h<8){ stopRem+=stopH; stopH=0; }
    else if(abs+stopH>end){ const pre=end-abs; charge(pre,P.csTilt!==false,P.auxW); stopRem+=stopH-pre; stopH=0; continue; }
    else { charge(stopH,P.csTilt!==false,P.auxW); stopH=0; continue; } }
   if(h>=17||h<8){   // 夜: 日没まで・朝 6:15 から充電 (発進の少し前に寝かせる)、8:00 発
    if(kmToday==null&&day===startDay) kmToday=km;
    const pr=profileAt(km), sunset=Engine.sunsetHour(pr.lat,pr.lon);
    if(h>=17&&h<sunset) charge(sunset-h,true,2);
    const morning=(h>=8? (day+1)*24 : day*24);
    abs=Math.max(abs,morning+6.25); charge(8-Engine.FLAT_BEFORE_START-6.25,true,2); charge(Engine.FLAT_BEFORE_START,false,2); if(stopRem>0){ stopH=stopRem; stopRem=0; } continue; }
   const su=typeof Storm!=="undefined"&&Storm.stopUntil(s,abs); if(su){ abs=su; vPrev=0; continue; }   // 暴風雨: 止まって待つ (発電はほぼ無い)
   const sg=this.segAt(km), seg=sg.k1-sg.k0, env=this.segEnv(sg,abs,soc), gMean=opt? 0 : (profileAt(sg.k1).elev-profileAt(sg.k0).elev)/(seg*1000);
   const r0=this.irr(sg.lat,sg.lon,sg.elev,abs,false,futAt(abs)), Ps=Model.pvSteady(r0.G,r0.alt,false,env.Tamb,Math.max(0,20+env.head));
   let vk;
   if(opt){ vk=this.segBestV(sg,v.mu,env,vmax); if(soc>=0.97) vk=this.segMatchV(sg,vk,Ps,env,vmax); }   // 満タン: 発電を貯めきれない分を速度に回す
   else if(typeof v==="function"){ vk=v(gMean,km); if(soc>=0.97&&v.full&&Ps>this.drivePower(vk/3.6,gMean,env)) vk=v.full(gMean,km); }
   else vk=v;
   const pcs=[], run=this.segRun(sg,vk,env,pcs);
   // 加速 (停車の後・速度を上げる): 運動エネルギーの分。速度を下げるときは惰性で走る (走行抵抗の仕事に回る)
   const vNow=pcs.length? pcs[0][2] : vk/3.6, dKE=0.5*mEff*(vNow*vNow-vPrev*vPrev)/3600;
   const am=abs+run.t/2, rr=this.irr(sg.lat,sg.lon,sg.elev,am,false,futAt(am));   // 日射は区間の真ん中の時刻で
   let first=true;
   for(const [dt,Pw,ms] of pcs){   // 100 m ごとの電力で電池を減らす (内部抵抗の損失は電流の 2 乗で効く)。発電はセル温度 (走行風) で変わる
    const Pv=Model.pvSteady(rr.G,rr.alt,false,env.Tamb,Math.max(0,ms+env.head));
    const Pacc= first&&dt>0? (dKE>0? dKE/0.9 : dKE)/dt : 0; first=false;
    const b=Model.battStep(soc,Tbat==null?env.Tamb:Tbat,Pw+Pacc-Pv,dt*3600);
    soc=Math.min(1,b.soc); Tbat=Model.battTempSS(env.Tamb,b.I,b.R,ms); abs+=dt; }
   vPrev=pcs.length? pcs[pcs.length-1][2] : vNow; km=sg.k1;
   if(tr) tr.push([km,abs,soc,seg/run.t,run.t]);
   if(soc<minSoc){ minSoc=soc; minKm=km; }
   if(soc<FL) return {ok:false,minSoc,minKm,v,trace:tr};
   const c=csList[ci];
   if(c&&km>=c.km-1e-6){ if(c===nextCS) socNextCS=soc; if(lateCS==null&&abs>csCloseAbs(c.km)) lateCS=c; ci++; stopH=0.5; vPrev=0; }
  }
  return {ok:km>=TOTAL_KM-0.01,minSoc,minKm,finishAbs:abs,socNextCS,kmToday:kmToday==null?km:kmToday,lateCS,v,trace:tr};
 },
 /* 電池が持つ最も速い一定の巡航速度 (o を渡すとその地点・時刻・SOC から) */
 best(o){
  let lo=30, hi=Math.min(PRO.noSpeedCap?160:130,this.topSpeed(true));
  let best=this.simulate(lo,o);
  if(!best.ok) return {v:lo,ok:false,r:best};
  while(hi-lo>1){ const mid=Math.round((lo+hi)/2), r=this.simulate(mid,o); if(r.ok){ lo=mid; best=r; } else hi=mid; }
  return {v:lo,ok:true,r:best};
 },
 /* モーターで出せる最高速度 [km/h] (平地・無風・電流いっぱい)。mode: false = ECO, true = POWER */
 topSpeed(mode,soc){ const m=massTotal(); let v=30;
  for(let x=30;x<=170;x+=1){ const vms=x/3.6, mm=motorModel(motorMaxA(mode),vms,soc==null?0.8:soc,mode); if(mm.F>=Model.resist(vms,{m}).total) v=x; else break; }
  return v; },
 /* 速度配分 (μ): f(勾配) = 平地・無風での速度 [km/h] (表示用)。simulate では区間ごとに、その場所・時刻の風や 100 m ごとの勾配で選び直す */
 profile(mu){ const vmax=Math.min(PRO.noSpeedCap?160:130,this.topSpeed(true)), memo=new Map(), env={m:massTotal(),rho:1.17};
  const f=(g)=>{ const k=Math.round(g*1000); let v=memo.get(k); if(v!=null) return v; v=Math.round(this.segBestV({pieces:[[k/1000,1,999]],k2:0},mu,env,vmax)); memo.set(k,v); return v; };
  f.mu=mu; f.vmax=vmax;
  return f; },
 /* 電池が持つ最も速い速度配分: μ を 2 分探索 (対数)。v = 平地での速度 (表示用) */
 bestProfile(o){ const g=this.bestProfileGen(o); let r; while(!(r=g.next()).done){} return r.value; },
 /* 同じ計算を 1 回の走らせ (simulate) ごとに区切る (裏で少しずつ進めるため) */
 *bestProfileGen(o){
  let lo=Math.log(1e-6), hi=Math.log(0.05), best=null;
  const fast=this.profile(Math.exp(lo)), rf=yield* this.simulateGen(fast,o); yield;
  if(rf.ok) return {v:fast(0),f:fast,ok:true,r:rf};
  const slow=this.profile(Math.exp(hi)), rs=yield* this.simulateGen(slow,o); yield;
  if(!rs.ok){ const c=this.best(o); return Object.assign(c,{f:null}); }   // どの配分でも足りない: 一定の低速
  best={f:slow,r:rs};
  for(let i=0;i<14;i++){ const mid=(lo+hi)/2, f=this.profile(Math.exp(mid)), r=yield* this.simulateGen(f,o); if(r.ok){ hi=mid; best={f,r}; } else lo=mid; yield; }
  return {v:best.f(0),f:best.f,ok:true,r:best.r};
 },
 /* km 区間 [k0, k0+dist] の推奨速度 (今の時刻・電池で、区間ごとの配分を距離で平均。制限速度で切る)。ps: 今の発電 [W] */
 speedFor(p,k0,dist,soc,ps){ if(!p||!p.f) return p? p.v : 70;
  const s=Engine.st, abs=(s.day-1)*24+s.hour, f=p.f; let t=0, k=k0;
  while(k<k0+dist-1e-6){ const sg0=this.segAt(k), sg= sg0.k1>k0+dist+1e-6? this.segInfo(k,k0+dist) : sg0, env=this.segEnv(sg,abs,soc);
   let v=this.segBestV(sg,f.mu,env,f.vmax); if(soc>=0.97&&ps>0) v=this.segMatchV(sg,v,ps,env,f.vmax);
   t+=this.segRun(sg,v,env).t; k=sg.k1; }
  return dist/Math.max(t,1e-6); },
 /* 戦略 (20 秒ごとに作り直す)。古くなったら前の結果を返しつつ、裏で少しずつ作り直す (tick)。
  画面が止まらないように、1 フレームで使う時間は約 4 ms まで。10 秒たっても終わらないとき (描画していないテストなど) はその場で仕上げる */
 job:null,
 plan(force){
  const now=performance.now();
  if(!force&&this.last){ if(now-this.lastT<20000) return this.last;
   if(!this.job) this.job={g:this.bestProfileGen(),t0:now}; else if(now-this.job.t0>10000) this.tick(1e9);
   return this.last; }
  this.job=null; this.last=this.bestProfile(); this.lastT=now; return this.last;
 },
 tick(budget=4){ const j=this.job; if(!j) return; const t=performance.now();
  try{ while(performance.now()-t<budget){ const r=j.g.next(); if(r.done){ if(this.job===j){ this.last=r.value; this.lastT=performance.now(); this.job=null; } return; } } }
  catch(e){ this.job=null; } },
 text(){
  const p=this.plan(true), r=p.r, s=Engine.st, nx=RP_CS.find(c=>!s.passedCP.has(c.km)&&c.km>s.km-0.2);
  if(!p.ok) return `⚠ 時速 ${p.v} km でも ${r.minKm.toFixed(0)} km 付近で電池が尽きる見込み。充電停車を検討してください。`;
  let m=`推奨巡航 時速 ${p.v} km (平地。登りは遅め・下りは速め、制限速度の範囲で)。ゴール予想 ${fmtAbsH(r.finishAbs)}。`;
  if(nx&&r.socNextCS!=null) m+=`CS${nx.n} ${nx.name} 到着時 SOC 約 ${(r.socNextCS*100).toFixed(0)} %。`;
  m+=`最も減るのは ${r.minKm.toFixed(0)} km 付近で約 ${(r.minSoc*100).toFixed(0)} %。今日は ${r.kmToday.toFixed(0)} km 付近まで。`;
  if(r.lateCS) m+=`⚠ CS${r.lateCS.n} のクローズに間に合わない見込み。`;
  if(r.finishAbs>5*24+17) m+=`⚠ Day6 17:00 までにゴールできない見込み (土曜は Port Augusta より南を走れない)。`;
  if(P.planLate) m+=`(後半 Day4〜6 の日射を 15 % 低く見込んでいます)`;
  return m;
 },
};
