"use strict";
/* ============ デモ映像 (待機中に流しっぱなしにする見せる用の走り) ============
 メニューの「デモ映像」か URL に ?demo を付けて開く。画面に触れる・キーを押すとメニューへ戻る。
 ・ルートの見どころを順に回る (約 40 秒ごと)。車は自動で車線を守って走り、カメラはリプレイ (中継) の視点
 ・画面にはシミュレーターのロゴと文言、場所の名前だけ (計器・無線・地図は出さない)
 ・走行の記録・ドライバー成績・分析画面には残さない */
const Demo={
 on:false, i:-1, t:0, LEN:40,
 SCENES:[
  {km:1.3,   h:8.7,  name:"Darwin",                 sub:"スタート直後の市街地"},
  {km:262,   h:12.2, name:"Top End",                sub:"サバンナの一本道"},
  {km:820,   h:11.0, name:"Barkly Tableland",       sub:"草原の高原"},
  {km:1088.9,h:10.3, name:"Devils Marbles",         sub:"Karlu Karlu — 丸い花崗岩の名所"},
  {km:1478,  h:14.2, name:"MacDonnell Ranges",      sub:"Alice Springs の手前の山並み"},
  {km:2150,  h:12.8, name:"Coober Pedy",            sub:"オパールの町と採掘の山"},
  {km:2690,  h:16.2, name:"Port Augusta",           sub:"夕方の南オーストラリア"},
  {km:3012,  h:15.4, name:"Adelaide",               sub:"ゴールの Victoria Park へ"}],
 wanted(){ return new URLSearchParams(location.search).has("demo"); },
 el(){ let e=document.getElementById("demo"); if(e) return e;
  e=document.createElement("div"); e.id="demo";
  e.innerHTML=`<div class="dm-bar dm-top"></div><div class="dm-bar dm-bot"></div>
   <div class="dm-brand"><img src="assets/img/logo.svg" alt="" width="92"><div><div class="dm-ttl">BWSC 3D RACING SIMULATOR</div><div class="dm-sub">Darwin → Adelaide 3,027 km ― Wakayama Univ. Solar Car Team</div></div></div>
   <div class="dm-place"><div class="dm-km"></div><div class="dm-name"></div><div class="dm-psub"></div></div>
   <div class="dm-copy"><b>太陽の光だけで、オーストラリア大陸を縦断する。</b><span>実際のルート・天気・車両の値で走るソーラーカーのシミュレーター</span></div>
   <div class="dm-hint">画面に触れるとメニューへ戻ります</div>`;
  document.body.appendChild(e); return e; },
 /* 始める: 設定を一時的に変え、最初の場面へ */
 start(){ if(this.on) return; this.on=true; this.keep={mode:P.mode,event:P.event,crewProc:P.crewProc,raceStorm:P.raceStorm,orders:P.orders,tts:P.tts,realWeather:P.realWeather,fcErr:P.fcErr,ts:document.getElementById("time-scale").value,chap:(document.getElementById("chapter")||{}).value,scn:(document.getElementById("scenario")||{}).value};
  Object.assign(P,{mode:"race",event:false,crewProc:false,raceStorm:false,orders:false,tts:"off",realWeather:true,fcErr:"off"});
  document.getElementById("time-scale").value="1"; const sc=document.getElementById("scenario"); if(sc) sc.value="";
  document.body.classList.add("demo-on"); this.el().classList.add("on"); this.i=-1;
  setTimeout(()=>{ this.t0=performance.now(); },0);
  addEventListener("pointerdown",this._tap=()=>{ if(performance.now()-(this.t0||0)>800) this.stop(); },true);
  addEventListener("keydown",this._key=(ev)=>{ if(performance.now()-(this.t0||0)>800){ ev.preventDefault(); ev.stopPropagation(); this.stop(); } },true);
  if(typeof Standby!=="undefined"&&Standby.wake) Standby.wake.call(Standby);
  this.next(true); },
 /* 次の場面: 走りを作り直して、その場所・時刻から */
 next(first){ this.i=(this.i+1)%this.SCENES.length; const S=this.SCENES[this.i], go=()=>{
   const o=Engine.applyChapter; Engine.applyChapter=function(n){ const c=RP_CS.find(q=>q.n===n), k0=c.km; c.km=S.km+2; try{ o.call(this,n); } finally{ c.km=k0; Engine.applyChapter=o; }
    const s=this.st; s.hour=S.h; s.passedCP=new Set(RP_CS.filter(q=>q.km<S.km+1).map(q=>q.km)); s.dcDone=true; s.soc=Math.max(s.soc,0.7); };
   document.getElementById("chapter").value="1";
   startGame(); modalPause=false; const es=Engine.st; es.gridStartH=0; es.hour=S.h; es.v=S.km<5?13:20; es.throttleSet=0.5;
   if(typeof DrvRec!=="undefined") DrvRec.done=true;   // ドライバー成績に残さない
   View.cam=4; View.rp={i:-1,t:1e9}; this.t=0; this.caption(S); };
  if(first) go(); else Fade.go(go); },
 caption(S){ const e=this.el(), p=e.querySelector(".dm-place"); p.classList.remove("show"); void p.offsetWidth;
  e.querySelector(".dm-km").textContent=`${Math.round(S.km).toLocaleString()} km`; e.querySelector(".dm-name").textContent=S.name; e.querySelector(".dm-psub").textContent=S.sub; p.classList.add("show"); },
 /* 毎フレーム (main.js の loop から): 自動で運転し、時間が来たら次の場面へ */
 frame(dtR){ if(!this.on||!Engine.st) return; const es=Engine.st; this.t+=dtR;
  const lim=typeof speedLimitAt==="function"? Math.min(speedLimitAt(es.km),speedLimitAt(es.km+0.4)) : 100, want=Math.min(82,lim-4)/3.6;   // 制限速度より少し下
  const e=want-es.v; es.throttleSet=clamp(es.throttleSet+e*0.04*dtR*10,0,1); es.brakePhys= e<-2? clamp(-e/8,0,0.6) : 0;
  const tgt=clamp((-2.4-View.lateral)*0.15,-0.35,0.35); Input.steer=clamp((tgt-(View.relHeading||0))*2.5,-1,1);
  if(es.stopTimer>0||es.camp||es.finished) this.t=Math.max(this.t,this.LEN);
  if(this.t>=this.LEN&&!Fade.busy){ this.t=-1e9; this.next(false); } },
 stop(){ if(!this.on) return; this.on=false; removeEventListener("pointerdown",this._tap,true); removeEventListener("keydown",this._key,true);
  document.body.classList.remove("demo-on"); this.el().classList.remove("on");
  const k=this.keep||{}; Object.assign(P,{mode:k.mode,event:k.event,crewProc:k.crewProc,raceStorm:k.raceStorm,orders:k.orders,tts:k.tts,realWeather:k.realWeather,fcErr:k.fcErr});
  document.getElementById("time-scale").value=k.ts||"60"; if(k.chap!=null) document.getElementById("chapter").value=k.chap; const sc=document.getElementById("scenario"); if(sc&&k.scn!=null) sc.value=k.scn;
  if(typeof RunLog!=="undefined") RunLog.rows=[];   // 分析画面に「今回の走行」として出さない
  if(typeof Standby!=="undefined"&&Standby.lock){ Standby.lock.release().catch(()=>{}); Standby.lock=null; }
  quitToMenu(); if(typeof Entry!=="undefined") Entry.pick(Entry.ent,false);
  if(/[?&]demo\b/.test(location.search)) try{ history.replaceState(null,"",location.pathname+location.search.replace(/[?&]demo(=[^&]*)?/,"").replace(/^&/,"?")+location.hash); }catch(x){} },
};
