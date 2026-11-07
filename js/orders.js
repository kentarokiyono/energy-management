"use strict";
/* ============ 戦略班の無線指示と採点 ============
 レース中、戦略班がときどき「時速 X km で Y km 巡航」と指示する (X = 戦略の推奨速度を、その先の制限速度で丸めたもの)。
 指示の区間のあいだ、速度が ±3 km/h に入っていた時間の割合で採点する。
 制限速度が指示より低い所・停車中・CS・夜は数えない。指示から幅に入るまでの時間 (反応) も記録。
 区間が終わると無線で結果を返し、レースの結果画面に平均を出す */
const Orders={
 TOL:3, cur:null, hist:[], nextKm:0, el:null,
 on(){ return P.mode==="race"&&!P.event&&P.orders!==false; },
 start(){ this.cur=null; this.hist=[]; this.nextKm=(Engine.st?Engine.st.km:0)+12; this.ui(); },
 frame(es,dtR){
  if(!this.on()||!es||es.finished){ this.ui(); return; }
  const pause= es.camp||es.stopTimer>0||(Engine.gridWait&&Engine.gridWait())||(typeof Crew!=="undefined"&&Crew.busy());
  if(!this.cur){ if(!pause&&es.km>=this.nextKm&&es.v>5) this.issue(es); this.ui(); return; }
  const c=this.cur, kmh=es.v*3.6, lim=speedLimitAt(es.km);
  if(!pause&&es.v>3&&lim>=c.v-0.5){ c.tot+=dtR; const ok=Math.abs(kmh-c.v)<=this.TOL; if(ok) c.in+=dtR; c.dev+=Math.abs(kmh-c.v)*dtR;
   if(ok&&c.react==null) c.react=(performance.now()-c.t0)/1000; }
  if(es.km>=c.k1) this.close(es);
  this.ui();
 },
 issue(es){
  let v=Math.round((typeof Strategy!=="undefined"&&Strategy.plan(false).v)||70);
  const dist=Math.round(15+Math.random()*20);
  let lim=200; for(let k=es.km;k<es.km+dist;k+=0.5) lim=Math.min(lim,speedLimitAt(k)); if(lim>=40) v=Math.min(v,lim);   // 区間の中の低い制限は除外して数える
  this.cur={v,k0:es.km,k1:es.km+dist,in:0,tot:0,dev:0,react:null,t0:performance.now()};
  Radio.push(`時速 ${v} km で ${dist} km 巡航してください (±${this.TOL} km/h)。`,"戦略班"); if(Snd.radioBeep) Snd.radioBeep();
 },
 close(es){
  const c=this.cur; this.cur=null; this.nextKm=es.km+10+Math.random()*20;
  if(c.tot<20){ return; }   // ほとんど数えられなかった区間 (制限速度・停車ばかり) は採点しない
  const pct=c.in/c.tot, dev=c.dev/c.tot; this.hist.push({v:c.v,pct,dev,react:c.react,km:c.k0});
  const msg= pct>=0.85? `指示どおり。幅に入っていた時間 ${(pct*100).toFixed(0)} %。` : pct>=0.6? `おおむね良し (${(pct*100).toFixed(0)} %)。平均のずれ ${dev.toFixed(1)} km/h。` : `指示の速度から外れています (${(pct*100).toFixed(0)} %、平均のずれ ${dev.toFixed(1)} km/h)。速度を合わせてください。`;
  Radio.push(msg+(c.react!=null?` 合わせるまで ${c.react.toFixed(0)} 秒。`:""),"戦略班");
  if(typeof RunLog!=="undefined") RunLog.note(`指示 ${c.v} km/h: ${(pct*100).toFixed(0)} %`);
 },
 summary(){ const H=this.hist; if(!H.length) return null; const w=H.reduce((s,h)=>s+1,0);
  return {n:H.length,pct:H.reduce((s,h)=>s+h.pct,0)/w,dev:H.reduce((s,h)=>s+h.dev,0)/w,react:(()=>{ const r=H.filter(h=>h.react!=null); return r.length? r.reduce((s,h)=>s+h.react,0)/r.length : null; })()}; },
 /* 画面: いまの指示と、その区間の達成率 */
 ui(){
  if(!this.el){ this.el=document.getElementById("hud-order"); if(!this.el) return; }
  const c=this.cur, es=Engine.st;
  if(!c||!this.on()||!es){ this.el.style.display="none"; return; }
  const kmh=es.v*3.6, d=kmh-c.v, ok=Math.abs(d)<=this.TOL, pct=c.tot>0? c.in/c.tot*100 : null;
  this.el.style.display="flex"; this.el.classList.toggle("ok",ok);
  this.el.innerHTML=`<span class="lb">指示</span><b>${c.v}</b><span class="u">km/h ±${this.TOL}</span><span class="d">${ok?"OK":(d>0?"▼ "+d.toFixed(0):"▲ "+(-d).toFixed(0))}</span><span class="r">残り ${Math.max(0,c.k1-es.km).toFixed(0)} km${pct!=null?` ・ ${pct.toFixed(0)} %`:""}</span>`;
 },
};
