"use strict";
/* ============ 戦略: 残りのルートを先読みして、電池が持つ最も速い巡航速度を探す ============
 先読みの内容: 区間ごとの制限速度・標高差 (登り/下り)・時刻と場所ごとの日射・偵察班の天気予報 (weatherPlan)・
 CS の 30 分停車 (傾けて充電)・17 時以降と朝の充電・夜の停止。電池が FLOOR を割らない最大の速度を 2 分探索で求める */
const Strategy={
 FLOOR:0.05, SEG:2, last:null, lastT:-1e9,
 drivePower(vms,grade){   // [W] 巡航に必要な電力 (下りは回生 6 割)
  const m=massTotal(), F=Phys.crr(vms)*m*9.81+0.5*1.17*P.Cd*P.frontal*vms*vms+m*9.81*grade;
  if(F<=0) return F*vms*0.6*(P.regenStrength>0?1:0)+P.auxW;
  return F*vms+motorIronW(vms)+(F/PRO.kt)**2*PRO.rWinding+PRO.ctrlW+0.01*F*vms+P.auxW;
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
   s.dayOfYear=PRO.dayOfYear+day-1; s.km=km; s.weather= RealWx.on()? null : (s.weatherPlan||[]).find(w=>abs>=w.start&&abs<w.start+w.dur)||null;
   return pv(Engine.solarCalc(pr.lat,h,tilted,pr.lon,pr.elev).G); };
  const charge=(hours)=>{ for(let t=0;t<hours;t+=0.25){ const d=Math.min(0.25,hours-t); soc=Math.min(1,soc+G(true)*d/Wh); abs+=d; } };
  const startDay=Math.floor(abs/24);
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
    const seg=Math.min(this.SEG,TOTAL_KM-km), vk=Math.min(v,speedLimitAt(km+seg/2)), vms=vk/3.6;
    const grade=(profileAt(km+seg).elev-profileAt(km).elev)/(seg*1000);
    const dt=seg/vk, Ps=G(false), Pd=this.drivePower(vms,grade);
    soc=Math.min(1,soc+(Ps-Pd)*dt/Wh); km+=seg; abs+=dt; if(tr) tr.push([km,abs,soc,vk,dt]);
    if(soc<minSoc){ minSoc=soc; minKm=km; }
    if(soc<this.FLOOR) return {ok:false,minSoc,minKm,v,trace:tr};
    const c=csList[ci];
    if(c&&km>=c.km){ if(c===nextCS) socNextCS=soc; if(lateCS==null&&abs>csCloseAbs(c.km)) lateCS=c; ci++; stopH=0.5; }
   }
  } finally{ s.dayOfYear=save.doy; s.km=save.km; s.weather=save.w; }
  return {ok:km>=TOTAL_KM-0.01,minSoc,minKm,finishAbs:abs,socNextCS,kmToday:kmToday==null?km:kmToday,lateCS,v,trace:tr};
 },
 /* 電池が持つ最も速い一定の巡航速度 (o を渡すとその地点・時刻・SOC から) */
 best(o){
  let lo=30, hi=PRO.noSpeedCap?160:130;
  let best=this.simulate(lo,o);
  if(!best.ok) return {v:lo,ok:false,r:best};
  while(hi-lo>1){ const mid=Math.round((lo+hi)/2), r=this.simulate(mid,o); if(r.ok){ lo=mid; best=r; } else hi=mid; }
  return {v:lo,ok:true,r:best};
 },
 plan(force){
  const now=performance.now(); if(!force&&this.last&&now-this.lastT<20000) return this.last;
  this.last=this.best(); this.lastT=now; return this.last;
 },
 text(){
  const p=this.plan(true), r=p.r, s=Engine.st, nx=RP_CS.find(c=>!s.passedCP.has(c.km)&&c.km>s.km-0.2);
  if(!p.ok) return `⚠ 時速 ${p.v} km でも ${r.minKm.toFixed(0)} km 付近で電池が尽きる見込み。充電停車を検討してください。`;
  let m=`推奨巡航 時速 ${p.v} km (制限速度の範囲で)。ゴール予想 ${fmtAbsH(r.finishAbs)}。`;
  if(nx&&r.socNextCS!=null) m+=`CS${nx.n} ${nx.name} 到着時 SOC 約 ${(r.socNextCS*100).toFixed(0)} %。`;
  m+=`最も減るのは ${r.minKm.toFixed(0)} km 付近で約 ${(r.minSoc*100).toFixed(0)} %。今日は ${r.kmToday.toFixed(0)} km 付近まで。`;
  if(r.lateCS) m+=`⚠ CS${r.lateCS.n} のクローズに間に合わない見込み。`;
  return m;
 },
};
