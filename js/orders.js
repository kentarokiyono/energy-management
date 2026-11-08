"use strict";
/* ============ 戦略班の無線指示と採点 ============
 レース中、10 km ごと と 制限速度 (法定速度) が変わる地点で、戦略班が「時速 X km・電流 Y A」だけを伝える。
  X = 電池が持つ最も速い巡航速度 (戦略の先読み。天気予報・日射・CS・夜の充電を含む)。今いる所 (と 300 m 先まで) の制限速度を超えない。
   指示の区間は、制限速度が変わる地点で区切る (変わったらすぐに次の指示)
  Y = その速度を保つのに必要な指令電流 (この先 10 km の平均勾配と、今の向かい風で計算)
 指示の区間のあいだ、速度が ±3 km/h に入っていた時間の割合・平均のずれ・実際の平均電流で採点する。
 区間が終わるたびに、速度パネルの上の表示の 2 行目に評価 (A / B / C) を出す (無線では伝えない)。平均はレースの結果画面にも出す。
 制限速度が指示より低い所・停車中・CS・夜は数えない */
const Orders={
 TOL:3, STEP:10, cur:null, hist:[], nextKm:0, el:null, last:null,
 mode:"auto",   // 指示の出し方 (テレメトリの監視側で切り替え): auto = 自動 / manual = 監視側が入力して送る / voice = 監視側が声で伝える (アプリは出さない)
 setMode(m){ if(this.mode===m) return; this.mode=m; if(m!=="auto"&&this.cur&&!this.cur.manual) this.cur=null; if(m==="voice") this.cur=null; if(Engine.st) this.nextKm=Engine.st.km;
  Radio.push(m==="auto"?"速度指示: 自動に切り替え":m==="manual"?"速度指示: 監視端末から送ります":"速度指示: 監視端末から声で伝えます","戦略班"); this.ui(); },
 /* 監視側が入力した指示 */
 manual(v,I){ const es=Engine.st; if(!es||!this.on()) return; if(this.cur) this.close(es);
  const dist=Math.min(this.STEP,TOTAL_KM-es.km); this.cur={v,I,k0:es.km,k1:es.km+Math.max(0.5,dist),in:0,tot:0,dev:0,iSum:0,react:null,t0:performance.now(),manual:true};
  Radio.push(`時速 ${v} km・電流 ${(+I).toFixed(1)} A`,"戦略班",{speak:true}); this.ui(); },
 on(){ return P.mode==="race"&&!P.event&&P.orders!==false; },
 start(){ this.cur=null; this.hist=[]; this.last=null; this.limDone=new Set(); this.mode=(typeof Tele!=="undefined"&&Tele.conns&&Tele.conns.length)? this.mode : "auto"; this.nextKm=Engine.st?Engine.st.km:0; this.ui(); },
 frame(es,dtR){
  this.limitNotice(es);
  if(!this.on()||!es||es.finished){ this.ui(); return; }
  const pause= es.camp||es.stopTimer>0||(Engine.gridWait&&Engine.gridWait())||(typeof Crew!=="undefined"&&Crew.busy())||(typeof Storm!=="undefined"&&Storm.active(es));   // 暴風雨の間は止める
  if(this.mode==="voice"){ this.cur=null; this.ui(); return; }   // 声で伝える: アプリは指示も採点もしない
  if(this.cur&&typeof Storm!=="undefined"&&Storm.active(es)){ this.cur=null; this.nextKm=es.km; Radio.push("暴風雨の間は速度指示を止めます。安全な所で停車して待ってください。","戦略班",{speak:true}); }
  if(!this.cur){ if(this.mode==="auto"&&!pause&&es.km>=this.nextKm&&es.v>1) this.issue(es); this.ui(); return; }
  const c=this.cur, kmh=es.v*3.6, lim=speedLimitAt(es.km);
  const dk=Math.max(0,es.km-(c.lastKm==null?es.km:c.lastKm)); c.lastKm=es.km;
  if(!pause&&es.v>3&&lim>=c.v-0.5){ c.tot+=dtR; c.cnt=(c.cnt||0)+dk; const ok=Math.abs(kmh-c.v)<=this.TOL; if(ok) c.in+=dtR; c.dev+=Math.abs(kmh-c.v)*dtR; c.iSum+=(es.lastAmp||0)*dtR;
   if(ok&&c.react==null) c.react=(performance.now()-c.t0)/1000; }
  if(es.km>=c.k1) this.close(es);
  this.ui();
 },
 /* 制限速度の予告 (前方誘導車の無線): 制限速度が変わる地点の約 1 km 手前で 1 回だけ。速度指示を切っていても出す */
 limDone:new Set(),
 limitNotice(es){
  if(!es||P.mode!=="race"||P.event||es.finished||es.v<1||es.camp||es.stopTimer>0) return;
  const cur=speedLimitAt(es.km);
  for(let k=es.km+0.05;k<=es.km+1.0;k+=0.05){ const l=speedLimitAt(k); if(l===cur) continue;
   const key=Math.round(k*20); if(this.limDone.has(key)||this.limDone.has(key-1)||this.limDone.has(key+1)) return; this.limDone.add(key);
   Radio.push(`この先 ${(k-es.km).toFixed(1)} km で制限速度 ${l} km/h (現在 ${cur} km/h)`,"前方誘導車"); return; }
 },
 /* 今の制限速度 (300 m 先までで一番低いもの) と、その制限が変わる地点 (k0 から最大 dist 先まで) */
 limitZone(k0,dist){ let lim=200; for(let k=k0;k<=k0+0.3;k+=0.05) lim=Math.min(lim,speedLimitAt(k));
  const l0=speedLimitAt(k0+0.3); let end=k0+dist; for(let k=k0+0.35;k<k0+dist;k+=0.05) if(speedLimitAt(k)!==l0){ end=k; break; }
  return {lim,end:Math.max(end,k0+0.5)}; },
 /* 速度 v [km/h] を保つ指令電流 [A]: 必要な電力 (転がり・空気 (向かい風込み)・勾配・損失。補機は除く) ÷ 電池電圧 */
 current(es,v,k0,dist){
  const vms=v/3.6, gr=(profileAt(Math.min(TOTAL_KM,k0+dist)).elev-profileAt(k0).elev)/(dist*1000), head=Number.isFinite(es.lastHead)? es.lastHead : 0;
  let W=Strategy.drivePower(vms,gr)-P.auxW; const va=Math.max(0,vms+head); W+=0.5*1.17*P.Cd*P.frontal*(va*va-vms*vms)*vms;
  W*=clamp(Number.isFinite(P.ordersK)?P.ordersK:1,0.5,2);   // 走行ログとの合わせ込みの補正 (分析画面の「電流の指示に使う」)
  const Vb=es.lastVterm>0? es.lastVterm : VOC(es.soc); return clamp(Math.max(0,W)/(Vb*0.99),0,motorMaxA(es.powerMode)); },
 issue(es){
  const dmax=Math.min(this.STEP,TOTAL_KM-es.km); if(dmax<0.5) return;
  const Z=this.limitZone(es.km,dmax), dist=Z.end-es.km;   // 制限速度が変わる地点で区切る
  const plan=typeof Strategy!=="undefined"? Strategy.plan(false) : null;   // 裏で作り直している最新の戦略 (同期で作り直すと画面が止まる)
  let v=Math.round(plan? Strategy.speedFor(plan,es.km,dist,es.soc,es.lastSolar||0) : 70); v=Math.min(v,Z.lim);   // 速度配分 (勾配で変わる) を区間で平均し、制限速度を超えない
  const I=this.current(es,v,es.km,dist);
  this.cur={v,I,k0:es.km,k1:es.km+dist,in:0,tot:0,dev:0,iSum:0,react:null,t0:performance.now()};
  Radio.push(`時速 ${v} km・電流 ${I.toFixed(1)} A`,"戦略班",{speak:true}); if(Snd.radioBeep) Snd.radioBeep();
 },
 close(es){
  const c=this.cur; this.cur=null; this.nextKm=c.k1;
  const until=performance.now()+15000;
  if(!(c.tot>0)||(c.cnt||0)<3){ this.last={na:true,until}; return; }   // 数えられた距離が 3 km 未満 (制限速度・停車ばかり) の区間は採点しない
  const pct=c.in/c.tot, dev=c.dev/c.tot, iAvg=c.iSum/c.tot, grade= pct>=0.85&&dev<2? "A" : pct>=0.6&&dev<4? "B" : "C";
  this.hist.push({v:c.v,pct,dev,react:c.react,km:c.k0,grade,iAvg,I:c.I,drv:typeof Crew!=="undefined"&&Crew.drivers?Crew.drivers[Crew.driverIdx].name:"―"});
  this.last={grade,pct,dev,iAvg,I:c.I,until};
 },
 summary(){ const H=this.hist; if(!H.length) return null; const w=H.reduce((s,h)=>s+1,0);
  return {n:H.length,A:H.filter(h=>h.grade==="A").length,B:H.filter(h=>h.grade==="B").length,C:H.filter(h=>h.grade==="C").length,pct:H.reduce((s,h)=>s+h.pct,0)/w,dev:H.reduce((s,h)=>s+h.dev,0)/w,react:(()=>{ const r=H.filter(h=>h.react!=null); return r.length? r.reduce((s,h)=>s+h.react,0)/r.length : null; })()}; },
 /* 画面: いまの指示と、その区間の達成率 */
 ui(){
  if(!this.el){ this.el=document.getElementById("hud-order"); if(!this.el) return; }
  const c=this.cur, es=Engine.st;
  if(!c||!this.on()||!es){ this.el.style.display="none"; return; }
  const kmh=es.v*3.6, d=kmh-c.v, ok=Math.abs(d)<=this.TOL;
  this.el.style.display="flex"; this.el.classList.toggle("ok",ok);
  const L=this.last&&performance.now()<this.last.until? this.last : null;
  const ev= !L? "" : L.na? `<span class="r">前の 10 km: 評価なし (制限速度・停車が多い)</span>` :
   `<span class="r"><i class="g g${L.grade}">${L.grade}</i>前の 10 km: 速度が指示どおり ${(L.pct*100).toFixed(0)} %・ずれ 平均 ${L.dev.toFixed(1)} km/h・電流 平均 ${L.iAvg.toFixed(1)} A (指示 ${L.I.toFixed(1)} A)</span>`;
  this.el.innerHTML=`<span class="lb">指示</span><b>${c.v}</b><span class="u">km/h</span><b>${c.I.toFixed(1)}</b><span class="u">A</span><span class="d">${ok?"OK":(d>0?"▼ "+d.toFixed(0):"▲ "+(-d).toFixed(0))}</span>${ev}`;
 },
};
