"use strict";
/* ============ 近くの他チーム: 画面上の車として動かす ============
 他チームはふだんレース上の距離 tm.km で動く (Engine.updateTeams)。自車の近く (画面で ±900 m) に来たら「画面上の車」にし、
 以後は画面上の位置 s [m] と速さ v [m/s] で動かす (一般車両と同じ、前の物との車間で加減速する式)。tm.km は s から書き戻す。
  ・縮尺 (町は等倍・郊外は 1/60) が変わっても s は続いているので、跳ばない
  ・自車が止まって時間を早送りしている間 (スタート待ち・CS・キャンプ・充電停車) は画面上の車を全部やめ、エンジン側で進める
  ・出すときに自車や他チームの隊列と重なるなら、その後ろに置く
 隊列 (前方車 70 m 前 + ソーラーカー + 後方車 24 m 後ろ) を 1 台として扱う: 前端 = s+72、後端 = s−26。
 自車を追い越すのは「Can I overtake?」で許可が出たとき (tm.passing)。他チームどうしは速い方が見通しのよい所で抜く。
 画面の部品 (車体・隊列の誘導車・充電で傾ける見た目) は View.updateAITeams が描く */
const TeamCars={
 ag:new Map(), FRONT:72, REAR:26, MAX:10,
 reset(){ for(const [tm] of this.ag) tm.agent=false; this.ag.clear(); },
 /* 自車が止まっていて、時間が場所の縮尺より速く進む (早送り) */
 fast(es){ return es.v<0.5&&(es.stopTimer>0||es.camp||(typeof Engine!=="undefined"&&Engine.gridWait&&Engine.gridWait())||(typeof StopMenu!=="undefined"&&StopMenu.active)); },
 drop(V,tm){ const a=this.ag.get(tm); if(!a) return; tm.km=clamp(V.kmOfS(a.s),0,TOTAL_KM); tm.agent=false; this.ag.delete(tm); },
 /* 道の外に止まっている: CS・夜・リタイア、電池が尽きかけて充電中 (戦略の速さが 25 km/h 未満) */
 stopped(tm,es){ return tm.status!=="run"||tm.csT>0||es.hour<8||es.hour>=17||(tm.vSet!=null&&tm.vSet<25); },
 /* 毎フレーム。返り値: 画面に出すチーム [{tm, rel}] (rel = 自車からの画面距離) */
 update(V,es,dtR){
  if(P.mode!=="race"||!es.teams){ this.reset(); return []; }
  if(this.fast(es)){ for(const [tm] of [...this.ag]) this.drop(V,tm); return []; }
  // 出す・戻す
  const relK=Route.scaleAt(es.km);
  for(const [tm,a] of [...this.ag]) if(Math.abs(a.s-V.s)>1300||tm.status==="pre") this.drop(V,tm);
  const cand=[];
  for(const tm of es.teams){ if(tm.status==="pre"||this.ag.has(tm)) continue; const rel=Route.relDist(es.km,tm.km,relK); if(Math.abs(rel)<900) cand.push({tm,rel}); }
  cand.sort((x,y)=>Math.abs(x.rel)-Math.abs(y.rel));
  for(const o of cand){ if(this.ag.size>=this.MAX) break; this.spawn(V,es,o.tm,V.s+o.rel); }
  // 動かす
  const obs=this.obstacles(V,es);
  for(const [tm,a] of this.ag) this.step(V,es,tm,a,obs,dtR);
  const out=[]; for(const [tm,a] of this.ag){ tm.km=clamp(V.kmOfS(a.s),0,TOTAL_KM); tm.vNow=a.v*3.6; tm.latV=a.lat; out.push({tm,rel:a.s-V.s}); }
  return out;
 },
 spawn(V,es,tm,s){
  const st=this.stopped(tm,es);
  if(!st){   // 自車の隊列 (自車の前方車 150 m 前 〜 後方車 32 m 後ろ) や他チームの隊列と重なるなら後ろへ
   for(let k=0;k<12;k++){ let moved=false;
    if(s+this.FRONT>V.s-40&&s-this.REAR<V.s+(V.leadS!=null? V.leadS-V.s+5 : 160)){ s=V.s-40-this.FRONT-5; moved=true; }
    for(const [,b] of this.ag) if(!b.off&&s+this.FRONT>b.s-this.REAR-15&&s-this.REAR<b.s+this.FRONT+15){ s=b.s-this.REAR-15-this.FRONT; moved=true; }
    if(!moved) break; } }
  if(s<-200||s>V.road.builtS-120) return;
  const a={s,v:st? 0 : Math.max(0,(tm.vNow||0)/3.6),lat:st? -(V.roadPoint(clamp(s,0,V.road.builtS-V.SEG)).L+4.5) : (tm.latV!=null&&!st? -2.4 : -2.4),latT:-2.4,mode:"lane",wait:0};
  tm.agent=true; tm.latV=a.lat; this.ag.set(tm,a);
 },
 /* 道の上の物: [前端, 後端, 横の位置, 速さ, 種類] */
 obstacles(V,es){
  const out=[], [cL]=carDims();
  out.push({f:V.s+cL/2,r:V.s-cL/2,lat:V.lateral,v:es.v,me:true});
  if(V.escortChase&&V.escortChase.visible) out.push({f:V.s-32+2.4,r:V.s-32-2.4,lat:-2.4,v:es.v,me:true});
  if(V.escortLead&&V.escortLead.visible&&V.leadS!=null) out.push({f:V.leadS+2.4,r:V.leadS-2.4,lat:-2.4,v:V.leadV||0,me:true});
  for(const [tm,a] of this.ag) out.push({f:a.s+this.FRONT,r:a.s-this.REAR,lat:a.lat,lat2:a.latT,v:a.v,team:tm});
  if(typeof Traffic!=="undefined") for(const c of Traffic.cars) out.push({f:c.s,r:c.s-c.L,lat:c.lat,lat2:c.latT,v:c.v,car:true});
  for(const [,ent] of V.lmMap||[]) if(ent.lm.t==="signal"&&ent.red){ const sg=V.sOfKm(ent.lm.km)-4; out.push({f:sg,r:sg-0.1,lat:null,v:0,sig:true}); }
  return out;
 },
 inLane(o,lat){ if(o.lat==null) return true; return Math.abs(o.lat-lat)<1.9||(o.lat2!=null&&Math.abs(o.lat2-lat)<1.9&&Math.abs(o.lat-o.lat2)>0.3); },
 /* 前の物: 中央が自分の中央より前にあるもの (重なっていても前と見る → 強く減速して離れる) */
 leader(tm,a,obs,lat,skipSig){ const front=a.s+this.FRONT, mid=a.s+(this.FRONT-this.REAR)/2; let best=null;
  for(const o of obs){ if(o.team===tm) continue; if(o.sig&&(skipSig||front>o.f+0.5)) continue; if(!o.sig&&(o.f+o.r)/2<=mid) continue; if(!this.inLane(o,lat)) continue;
   if(o.sig&&front>o.f-1.5&&a.v>3) continue;   // 停止線を越えかけている: そのまま行く
   if(!best||o.r<best.r) best=o; }
  return best; },
 idm(a,ld,v0){ const A=1.2, B=3, T=1.6, s0=6;
  if(v0<0.2) return a.v>0? -Math.min(B,a.v*2+0.5) : 0;   // 止まる (路肩・CS・夜)
  let acc=A*(1-Math.pow(Math.max(0,a.v)/Math.max(1,v0),4));
  if(ld){ const gap=Math.max(0.1,ld.r-(a.s+this.FRONT)), dv=a.v-ld.v, ss=s0+Math.max(0,a.v*T+a.v*dv/(2*Math.sqrt(A*B))); acc-=A*(ss/gap)*(ss/gap); }
  return clamp(acc,-7,A); },
 step(V,es,tm,a,obs,dtR){
  const rp=V.roadPoint(clamp(a.s,0,V.road.builtS-V.SEG)), multi=rp.m1>0.3||rp.ow||rp.L>6, km=V.kmOfS(a.s);
  const stop=this.stopped(tm,es)||tm.status==="dnf";
  let v0= stop? 0 : Math.min(Math.max(5,(tm.vSet||60)*(tm.boost?1.15:1))/3.6, speedLimitAt(km)/3.6);
  const home=-2.4, passLat= multi? (V.lateral>-rp.L/2? -(rp.L-1.75) : -1.75) : 2.4;
  let ld=null;
  if(stop){ a.latT= tm.status==="dnf"? -(rp.L+6) : -(rp.L+4.5); a.mode="lane"; a.off=a.v<0.5; }   // CS・夜・リタイア: 道の外
  else { a.off=false;
   if(tm.yieldT>0){ a.latT=-(rp.L-0.1); v0=Math.min(v0,Math.max(3,es.v*0.8)); }   // 自車に道を譲る
   const homeLd=this.leader(tm,a,obs,home);
   if(a.mode==="lane"){ a.latT= tm.yieldT>0? a.latT : home; ld=homeLd;
    // 追い越し: 自車の隊列は許可 (tm.passing) があるとき、他チームの隊列はこちらが速いとき
    const slow=homeLd&&!homeLd.sig&&homeLd.v<v0-1.5&&homeLd.r-(a.s+this.FRONT)<60;
    a.wait= slow? a.wait+dtR : 0;
    if(slow&&a.wait>2&&(homeLd.me? tm.passing : !homeLd.car)){
     const pLd=this.leader(tm,a,obs,passLat,true), free=!pLd||pLd.r-(a.s+this.FRONT)>150;
     const side=!obs.some(o=>o.team!==tm&&!o.sig&&this.inLane(o,passLat)&&o.f>a.s-this.REAR-15&&o.r<a.s+this.FRONT+30);
     const [cp,cn]=V.maxCurv(a.s+250,250), straight=Math.max(cp,cn)<1/350;
     const oncoming=!multi&&(V.roadTrains||[]).some(rt=>rt.sVis>a.s-80&&rt.sVis<a.s+1500);
     const town=Route.inZone(km)&&!multi;
     const others=!multi&&[...this.ag.values()].some(b=>b!==a&&b.mode==="pass");
     if(free&&side&&!town&&!others&&(multi||(straight&&!oncoming))){ a.mode="pass"; a.passLat=passLat; } } }
   if(a.mode==="pass"){ v0+=2; a.latT=a.passLat; ld=this.leader(tm,a,obs,a.passLat,true);
    const back=!obs.some(o=>o.team!==tm&&!o.sig&&this.inLane(o,home)&&o.f>a.s-this.REAR-12&&o.r<a.s+this.FRONT+40);
    if(back){ a.mode="lane"; a.latT=home; if(tm.passing){ tm.passing=false; tm.boost=false; } } } }
  const acc=this.idm(a,ld,v0); a.v=Math.max(0,a.v+acc*dtR); a.s+=a.v*dtR;
  const vl= stop? 1.2 : Math.min(1.3,0.08*a.v+0.4), dl=clamp(a.latT-a.lat,-vl*dtR,vl*dtR); a.lat+=dl;
  if(tm.yieldT>0) tm.yieldT-=dtR; if(tm.holdT>0) tm.holdT-=dtR;
 },
};
