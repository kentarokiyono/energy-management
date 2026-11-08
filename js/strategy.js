"use strict";
/* ============ 戦略: 残りのルートを先読みして、電池が持つ最も速い走り方を探す ============
 先読みの内容: 区間ごとの制限速度・標高差 (登り/下り)・時刻と場所ごとの日射・偵察班の天気予報 (weatherPlan)・
 CS の 30 分停車 (傾けて充電)・17 時以降と朝の充電・夜の停止。
 速度配分: 2 km ごとに「かかる時間 + μ × 使う電力量」が最小になる速度を選ぶ (μ = 電力量の値打ち)。
  登りでは電力が大きく増えるので遅め、平地・下りでは速めになる。電池が FLOOR を割らない最小の μ を 2 分探索で求める */
const Strategy={
 FLOOR:0.05, SEG:2, last:null, lastT:-1e9,
 /* 電池の下限 (残しておく量): 天気予報のずれが大きいほど多めに残す (予報より悪い天気になっても尽きないように) */
 floor(){ const s=Engine.st; return (s&&s.scenario)||!(s&&s.fc)? this.FLOOR : ({off:0.05,low:0.08,mid:0.12,high:0.18,late:0.12})[P.fcErr]||this.FLOOR; },
 drivePower(vms,grade){   // [W] 巡航に必要な電力 (下りは回生 6 割)
  const m=massTotal(), F=Phys.crr(vms)*m*9.81+0.5*1.17*P.Cd*P.frontal*vms*vms+m*9.81*grade;
  if(F<=0) return F*vms*0.6*(P.regenStrength>0?1:0)+P.auxW;
  return (F*vms+motorIronW(vms)+(F/PRO.kt)**2*PRO.rWinding+PRO.ctrlW+0.01*F*vms)*LossK.k()+P.auxW;   // 消費の補正 (走行ログとの合わせ込み)
 },
 /* 速度 v [km/h] で今から走り切ったときの経過 → {ok, minSoc, minKm, finishAbs, socNextCS, kmToday, lateCS} */
 /* o (任意): {abs, km, soc} から始める (走行の答え合わせ用)。o.trace があれば 2 km ごとの [km, 時刻, SOC, 速度] を残す */
 simulate(v,o){
  const s=Engine.st, save={doy:s.dayOfYear,km:s.km,w:s.weather}, Wh=Math.max(500,P.batteryWh), tr=o&&o.trace? [] : null;
  const pv=(G)=>P.arrayArea*P.cellEff*P.mpptEff*G*PRO.solarScale*0.92;
  let abs=o? o.abs : (s.day-1)*24+s.hour, km=o? o.km : s.km, soc=o? o.soc : s.soc, minSoc=soc, minKm=km, socNextCS=null, kmToday=null, lateCS=null;
  const csList=RP_CS.filter(c=>(o||!s.passedCP.has(c.km))&&c.km>km-0.2), nextCS=csList[0];
  let ci=0, stopH= o? 0 : s.stopTimer>0? s.stopTimer/3600 : 0;
  if(tr) tr.push([km,abs,soc,0]);
  const G=(tilted)=>{ const day=Math.floor(abs/24)+1, h=abs-(day-1)*24, pr=profileAt(km);
   s.dayOfYear=PRO.dayOfYear+day-1; s.km=km; s.weather= RealWx.on()? null : ((s.fc&&s.fc.plan)||s.weatherPlan||[]).find(w=>abs>=w.start&&abs<w.start+w.dur)||null;   // 予報で見積もる
   const r=Engine.solarCalc(pr.lat,h,tilted,pr.lon,pr.elev); return pv(r.G*PVLoss.k(r.alt,tilted)); };
  const charge=(hours)=>{ for(let t=0;t<hours;t+=0.25){ const d=Math.min(0.25,hours-t); soc=Math.min(1,soc+G(true)*d/Wh); abs+=d; } };
  const startDay=Math.floor(abs/24), FL=this.floor(); this.fcOn=true;
  let psNow=null; const Ps0=()=>(psNow=G(false));   // 今の発電 (満タンの判定と、その区間の計算で 1 回だけ求める)
  try{
   for(let guard=0;guard<6000&&km<TOTAL_KM;guard++){
    const day=Math.floor(abs/24), h=abs-day*24;
    if(stopH>0){ charge(stopH); stopH=0; continue; }
    if(h>=17||h<8){   // 夜: 日没まで・朝 6:15 から充電、8:00 発
     if(kmToday==null&&day===startDay) kmToday=km;
     const pr=profileAt(km), sunset=Engine.sunsetHour(pr.lat,pr.lon);
     if(h>=17&&h<sunset) charge(sunset-h);
     const morning=(h>=8? (day+1)*24 : day*24);
     abs=Math.max(abs,morning+6.25); charge(8-6.25); continue; }
    const su=typeof Storm!=="undefined"&&Storm.stopUntil(s,abs); if(su){ abs=su; continue; }   // 暴風雨: 止まって待つ (発電はほぼ無い)
    const seg=Math.min(this.SEG,TOTAL_KM-km), grade=(profileAt(km+seg).elev-profileAt(km).elev)/(seg*1000);
    // 速度配分のとき: 電池がほぼ満タン (発電を貯めきれない) なら、余る分を速度に回す
    const vk=Math.min(typeof v==="function"? (soc>=0.97&&(this._ps=Ps0())>this.drivePower(v(grade)/3.6,grade)? v.full(grade) : v(grade)) : v,speedLimitAt(km+seg/2)), vms=vk/3.6;
    const dt=seg/vk, Ps=psNow!=null? psNow : G(false), Pd=this.drivePower(vms,grade); psNow=null;
    soc=Math.min(1,soc+(Ps-Pd)*dt/Wh); km+=seg; abs+=dt; if(tr) tr.push([km,abs,soc,vk,dt]);
    if(soc<minSoc){ minSoc=soc; minKm=km; }
    if(soc<FL) return {ok:false,minSoc,minKm,v,trace:tr};
    const c=csList[ci];
    if(c&&km>=c.km){ if(c===nextCS) socNextCS=soc; if(lateCS==null&&abs>csCloseAbs(c.km)) lateCS=c; ci++; stopH=0.5; }
   }
  } finally{ s.dayOfYear=save.doy; s.km=save.km; s.weather=save.w; this.fcOn=false; }
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
 /* 勾配 g → 速度 [km/h]: (1 + μ·電力(v, g)) / v が最小の v (μ が小さいほど速い)。勾配 0.1 % ごとに覚えておく */
 /* モーターで出せる最高速度 [km/h] (平地・電流いっぱい)。mode: false = ECO, true = POWER */
 topSpeed(mode,soc){ const m=massTotal(); let v=30;
  for(let x=30;x<=170;x+=1){ const vms=x/3.6, mm=motorModel(motorMaxA(mode),vms,soc==null?0.8:soc,mode), Fd=Phys.crr(vms)*m*9.81+0.5*1.17*P.Cd*P.frontal*vms*vms; if(mm.F>=Fd) v=x; else break; }
  return v; },
 profile(mu){ const vmax=Math.min(PRO.noSpeedCap?160:130,this.topSpeed(true)), memo=new Map();   // 出せない速度は選ばない (POWER モードの最高速度まで)
  const f=(g)=>{ const k=Math.round(g*1000); let v=memo.get(k); if(v!=null) return v; let bv=30, bc=Infinity;
   for(let x=30;x<=vmax;x+=1){ const c=(1+mu*this.drivePower(x/3.6,k/1000))/x; if(c<bc){ bc=c; bv=x; } } memo.set(k,bv); return bv; };
  f.mu=mu;
  // 満タンで発電が余るとき: 発電と釣り合う速度 (それより速くはしない。電池を減らさない範囲で速く)
  f.full=(g)=>{ let v=f(g); for(let x=v;x<=vmax;x+=2){ v=x; if(this.drivePower(x/3.6,g)>this._ps) break; } return v; };
  return f; },
 /* 電池が持つ最も速い速度配分: μ を 2 分探索 (対数)。v = 平地での速度 (表示用) */
 bestProfile(o){ const g=this.bestProfileGen(o); let r; while(!(r=g.next()).done){} return r.value; },
 /* 同じ計算を 1 回の走らせ (simulate) ごとに区切る (裏で少しずつ進めるため) */
 *bestProfileGen(o){
  let lo=Math.log(1e-6), hi=Math.log(0.05), best=null;
  const fast=this.profile(Math.exp(lo)), rf=this.simulate(fast,o); yield;
  if(rf.ok) return {v:fast(0),f:fast,ok:true,r:rf};
  const slow=this.profile(Math.exp(hi)), rs=this.simulate(slow,o); yield;
  if(!rs.ok){ const c=this.best(o); return Object.assign(c,{f:null}); }   // どの配分でも足りない: 一定の低速
  best={f:slow,r:rs};
  for(let i=0;i<14;i++){ const mid=(lo+hi)/2, f=this.profile(Math.exp(mid)), r=this.simulate(f,o); if(r.ok){ hi=mid; best={f,r}; } else lo=mid; yield; }
  return {v:best.f(0),f:best.f,ok:true,r:best.r};
 },
 /* km 区間 [k0, k0+dist] の推奨速度 (配分の速度を距離で平均。制限速度で切る) */
 speedFor(p,k0,dist,soc,ps){ if(!p||!p.f) return p? p.v : 70; let t=0; const full=soc>=0.97&&ps>0; if(full) this._ps=ps;   // 満タンで発電が余るときは速く
  for(let k=k0;k<k0+dist-1e-6;k+=this.SEG){ const d=Math.min(this.SEG,k0+dist-k), g=(profileAt(k+d).elev-profileAt(k).elev)/(d*1000);
   const v0=p.f(g), v=Math.min(full&&ps>this.drivePower(v0/3.6,g)? p.f.full(g) : v0,speedLimitAt(k+d/2)); t+=d/v; }
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
