"use strict";
/* ============ 戦略班の無線指示と採点 ============
 レース中、10 km ごとに戦略班が「時速 X km・電流 Y A」だけを伝える。
  X = 電池が持つ最も速い巡航速度 (戦略の先読み。天気予報・日射・CS・夜の充電を含む)。この先 10 km で一番長く続く制限速度を超えない
  Y = その速度を保つのに必要な指令電流 (この先 10 km の平均勾配と、今の向かい風で計算)
 指示の区間のあいだ、速度が ±3 km/h に入っていた時間の割合で採点し、結果はレースの結果画面にだけ出す (無線では伝えない)。
 制限速度が指示より低い所・停車中・CS・夜は数えない */
const Orders={
 TOL:3, STEP:10, cur:null, hist:[], nextKm:0, el:null,
 on(){ return P.mode==="race"&&!P.event&&P.orders!==false; },
 start(){ this.cur=null; this.hist=[]; this.nextKm=Engine.st?Engine.st.km:0; this.ui(); },
 frame(es,dtR){
  if(!this.on()||!es||es.finished){ this.ui(); return; }
  const pause= es.camp||es.stopTimer>0||(Engine.gridWait&&Engine.gridWait())||(typeof Crew!=="undefined"&&Crew.busy());
  if(!this.cur){ if(!pause&&es.km>=this.nextKm&&es.v>1) this.issue(es); this.ui(); return; }
  const c=this.cur, kmh=es.v*3.6, lim=speedLimitAt(es.km);
  if(!pause&&es.v>3&&lim>=c.v-0.5){ c.tot+=dtR; const ok=Math.abs(kmh-c.v)<=this.TOL; if(ok) c.in+=dtR; c.dev+=Math.abs(kmh-c.v)*dtR;
   if(ok&&c.react==null) c.react=(performance.now()-c.t0)/1000; }
  if(es.km>=c.k1) this.close(es);
  this.ui();
 },
 /* この先 10 km で一番長く続く制限速度 */
 limitAhead(k0,dist){ const m=new Map(); for(let k=k0;k<k0+dist;k+=0.1){ const l=speedLimitAt(k); m.set(l,(m.get(l)||0)+1); } let best=130,n=-1; for(const [l,c] of m) if(c>n){ n=c; best=l; } return best; },
 /* 速度 v [km/h] を保つ指令電流 [A]: 必要な電力 (転がり・空気 (向かい風込み)・勾配・損失。補機は除く) ÷ 電池電圧 */
 current(es,v,k0,dist){
  const vms=v/3.6, gr=(profileAt(Math.min(TOTAL_KM,k0+dist)).elev-profileAt(k0).elev)/(dist*1000), head=Number.isFinite(es.lastHead)? es.lastHead : 0;
  let W=Strategy.drivePower(vms,gr)-P.auxW; const va=Math.max(0,vms+head); W+=0.5*1.17*P.Cd*P.frontal*(va*va-vms*vms)*vms;
  const Vb=es.lastVterm>0? es.lastVterm : VOC(es.soc); return clamp(Math.max(0,W)/(Vb*0.99),0,motorMaxA(es.powerMode)); },
 issue(es){
  const dist=Math.min(this.STEP,TOTAL_KM-es.km); if(dist<1) return;
  const plan=typeof Strategy!=="undefined"? Strategy.plan(true) : null;
  let v=Math.round(plan&&plan.v||70); v=Math.min(v,this.limitAhead(es.km,dist));
  const I=this.current(es,v,es.km,dist);
  this.cur={v,I,k0:es.km,k1:es.km+dist,in:0,tot:0,dev:0,react:null,t0:performance.now()};
  Radio.push(`時速 ${v} km・電流 ${I.toFixed(1)} A`,"戦略班"); if(Snd.radioBeep) Snd.radioBeep();
 },
 close(es){
  const c=this.cur; this.cur=null; this.nextKm=c.k1;
  if(c.tot<20) return;   // ほとんど数えられなかった区間 (制限速度・停車ばかり) は採点しない
  this.hist.push({v:c.v,pct:c.in/c.tot,dev:c.dev/c.tot,react:c.react,km:c.k0});
 },
 summary(){ const H=this.hist; if(!H.length) return null; const w=H.reduce((s,h)=>s+1,0);
  return {n:H.length,pct:H.reduce((s,h)=>s+h.pct,0)/w,dev:H.reduce((s,h)=>s+h.dev,0)/w,react:(()=>{ const r=H.filter(h=>h.react!=null); return r.length? r.reduce((s,h)=>s+h.react,0)/r.length : null; })()}; },
 /* 画面: いまの指示と、その区間の達成率 */
 ui(){
  if(!this.el){ this.el=document.getElementById("hud-order"); if(!this.el) return; }
  const c=this.cur, es=Engine.st;
  if(!c||!this.on()||!es){ this.el.style.display="none"; return; }
  const kmh=es.v*3.6, d=kmh-c.v, ok=Math.abs(d)<=this.TOL;
  this.el.style.display="flex"; this.el.classList.toggle("ok",ok);
  this.el.innerHTML=`<span class="lb">指示</span><b>${c.v}</b><span class="u">km/h</span><b>${c.I.toFixed(1)}</b><span class="u">A</span><span class="d">${ok?"OK":(d>0?"▼ "+d.toFixed(0):"▲ "+(-d).toFixed(0))}</span>`;
 },
};
