"use strict";
/* ============ 車内の暑さとドライバーの集中力 (レースモード) ============
 車内温度: 外気温 + 日射でキャノピーの中が温まる分 − 走行風 (換気) で下がる分。5 分ほどで追いつく (一次遅れ)。
  例: 外気 33 °C・日射 1000 W/m² → 止まっていると約 49 °C、80 km/h で約 44 °C
 疲れ (0〜1): 運転している間にたまる。車内が 28 °C を超えると暑さの分だけ早くたまる (44 °C で 1 時間に約 0.13。4 時間で集中力が半分)。
  停車中 (CS など) は少し、夜のキャンプでしっかり戻る。ドライバーが替わると 0 から。
 集中力 = 1 − 疲れ。50 % を下回ると: 画面の端が暗くなる・ハンドルの反応が遅れる・少しふらつく (下がるほど強く)。
 時間はゲームの時刻で進む (時間加速 ×60 なら 1 時間の運転が実時間 1 分) */
const Cabin={
 step(s,dtS){
  if(P.mode!=="race"||P.event||!s) return;
  const G=s.lastGeff||0, Ta=s.Tamb||30, v=Math.max(0,s.v||0);
  const ss=Ta+16*G/1000-5*Math.min(1,v/22);
  s.Tcab= s.Tcab==null? ss : s.Tcab+(ss-s.Tcab)*Math.min(1,dtS/300);
  const di=typeof Crew!=="undefined"? Crew.driverIdx : 0;
  if(s.fatDrv!==di){ s.fatDrv=di; s.fatigue=0; s.fatMsg=0; }
  let f=s.fatigue||0;
  if(s.camp) f-=dtS/1800;
  else if(s.stopTimer>0||v<0.5) f-=dtS/3600*0.5;
  else f+=dtS/3600*(0.04+0.08*clamp((s.Tcab-28)/15,0,1.5));
  s.fatigue=clamp(f,0,1);
  const c=1-s.fatigue;
  if(c<0.5&&!s.fatMsg){ s.fatMsg=1; Radio.push("後方追走車から: 車が少しふらついています。暑さで集中が切れていないか? 次の CS で交代を考えて。","後方追走車"); }
  if(c<0.3&&s.fatMsg===1){ s.fatMsg=2; Radio.push("ふらつきが大きくなっています。安全な所で止まることも考えて。","チーフ"); }
 },
 /* 0 (なし) 〜 1 (強い): 集中力 50 % から効き始める */
 eff(s){ return s&&P.mode==="race"&&!P.event? clamp((0.5-(1-(s.fatigue||0)))/0.4,0,1) : 0; },
 /* 入力 (updateInput の後): ハンドルの遅れとふらつき */
 input(dtR){ const s=Engine.st, e=this.eff(s);
  if(e<=0){ this.lag=Input.steer; this.vig(0); return; }
  const tau=0.06+0.3*e; this.lag=(this.lag==null? Input.steer : this.lag+(Input.steer-this.lag)*Math.min(1,dtR/tau));
  const t=performance.now()/1000; Input.steer=clamp(this.lag+e*0.035*(Math.sin(t*0.7)+0.6*Math.sin(t*1.9+1)),-1,1);
  this.vig(e); },
 vig(e){ let el=this._el; if(!el){ el=this._el=document.createElement("div"); el.id="fatigue-vig";
   el.style.cssText="position:fixed;inset:0;pointer-events:none;z-index:45;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 28%,rgba(0,0,0,.92) 88%);opacity:0;transition:opacity 1s";
   document.body.appendChild(el); }
  if(!running&&e>0) e=0;
  const blink= e>0.6&&(performance.now()%9000)<350? 0.25 : 0;   // ときどき視界が暗くなる (まばたき・眠気)
  const o=Math.min(0.95,e*0.75+blink); if(Math.abs(o-(this._o||0))>0.02){ this._o=o; el.style.opacity=o.toFixed(2); } },
};
