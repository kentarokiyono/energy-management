"use strict";
/* ============ デモ映像 (待機中に流しっぱなしにする見せる用の走り) ============
 メニューの「デモ映像」か URL に ?demo を付けて開く。画面に触れる・キーを押すとメニューへ戻る。
 ・ルートの見どころを順に回る (約 40 秒ごと)。車は自動で車線を守って走り、カメラはリプレイ (中継) の視点
 ・画面にはシミュレーターのロゴと文言、場所の名前だけ (計器・無線・地図は出さない)
 ・走行の記録・ドライバー成績・分析画面には残さない */
const Demo={
 on:false, i:-1, t:0, LEN:40,
 MAX_PR:1.25,   // 軽さ: 画面の細かさは最大 1.25 倍
 frameMs(){ return P.demo60? 0 : 31; },   // 30 コマ/秒 (60 Hz の画面で 1 コマおき)。設定「デモ映像を 60 fps で」がオンなら抑えない
 SCENES:[
  {km:1.3,   h:8.7,  name:"Darwin",                 sub:"スタート直後の市街地"},
  {km:262,   h:12.2, name:"Top End",                sub:"サバンナの一本道"},
  {km:820,   h:11.0, name:"Barkly Tableland",       sub:"草原の高原"},
  {km:1088.9,h:10.3, name:"Devils Marbles",         sub:"Karlu Karlu — 丸い花崗岩の名所"},
  {hv:true,          name:"Hidden Valley Raceway",  sub:"Darwin の予選コース (Hot Lap)"},
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
 start(){ if(this.on) return; this.on=true; this.keep={mode:P.mode,testKind:P.testKind,event:P.event,crewProc:P.crewProc,raceStorm:P.raceStorm,orders:P.orders,tts:P.tts,realWeather:P.realWeather,fcErr:P.fcErr,ts:document.getElementById("time-scale").value,chap:(document.getElementById("chapter")||{}).value,scn:(document.getElementById("scenario")||{}).value};
  Object.assign(P,{mode:"race",event:false,crewProc:false,raceStorm:false,orders:false,tts:"off",realWeather:true,fcErr:"off"});
  document.getElementById("time-scale").value="1"; const sc=document.getElementById("scenario"); if(sc) sc.value="";
  document.body.classList.add("demo-on"); this.el().classList.add("on"); this.i=-1;
  setTimeout(()=>{ this.t0=performance.now(); },0);
  addEventListener("pointerdown",this._tap=()=>{ if(performance.now()-(this.t0||0)>800) this.stop(); },true);
  addEventListener("keydown",this._key=(ev)=>{ if(performance.now()-(this.t0||0)>800){ ev.preventDefault(); ev.stopPropagation(); this.stop(); } },true);
  if(typeof Standby!=="undefined"&&Standby.wake) Standby.wake.call(Standby);
  this.next(true); if(typeof Perf!=="undefined") Perf.apply(); },
 /* 次の場面: 走りを作り直して、その場所・時刻から */
 next(first){ this.i=(this.i+1)%this.SCENES.length; const S=this.SCENES[this.i], go=()=>{
   this.fail=0; this.t=0;
   if(S.hv){ // ヒドゥンバレー: 予選コースを自動で 1 周 (記録は残さない)
    P.mode="test"; P.testKind="circuit"; startGame(); modalPause=false; show("test-result",false);
    if(typeof HVRec!=="undefined") HVRec.cur=null;
    Test.v=14; View.cam=4; this.hv={i:-1}; this.caption(S); return; }
   P.mode="race";
   const o=Engine.applyChapter; Engine.applyChapter=function(n){ const c=RP_CS.find(q=>q.n===n), k0=c.km; c.km=S.km+2; try{ o.call(this,n); } finally{ c.km=k0; Engine.applyChapter=o; }
    const s=this.st; s.hour=S.h; s.passedCP=new Set(RP_CS.filter(q=>q.km<S.km+1).map(q=>q.km)); s.dcDone=true; s.soc=Math.max(s.soc,0.7); };
   document.getElementById("chapter").value="1";
   startGame(); modalPause=false; const es=Engine.st; es.gridStartH=0; es.hour=S.h; es.v=S.km<5?13:20; es.throttleSet=0.5;
   if(typeof DrvRec!=="undefined") DrvRec.done=true;   // ドライバー成績に残さない
   View.cam=4; View.rp={i:-1,t:1e9}; this.caption(S); };
  if(first) go(); else Fade.go(go); },
 caption(S){ const e=this.el(), p=e.querySelector(".dm-place"); p.classList.remove("show"); void p.offsetWidth;
  e.querySelector(".dm-km").textContent=`${Math.round(S.km).toLocaleString()} km`; e.querySelector(".dm-name").textContent=S.name; e.querySelector(".dm-psub").textContent=S.sub; p.classList.add("show"); },
 /* 毎フレーム (main.js の loop から): 自動で運転し、時間が来たら次の場面へ */
 frame(dtR){ if(!this.on||!Engine.st) return; const es=Engine.st; this.t+=dtR;
  if(Test.active) this.driveHV(dtR); else this.driveRoad(dtR);
  if(!Test.active&&(es.stopTimer>0||es.camp||es.finished||es.crashed||es.rolledOver)) this.t=Math.max(this.t,this.LEN);
  if(this.fail>3) this.t=Math.max(this.t,this.LEN);   // 道から外れ続けたら次の場面へ
  if(this.t>=this.LEN&&!Fade.busy){ this.t=-1e9; this.next(false); } },
 /* 速さの制御: 目標の速さに近づける (アクセル・ブレーキ) */
 speed(es,v,want){ const e=want-v; if(e<-1.2){ es.throttleSet=0; es.brakePhys=clamp(-e/5,0.15,1); } else { es.brakePhys=0; es.throttleSet=clamp(0.25+e*0.18,0,1); } },
 /* 舵: 先の点を狙う (追従)。曲がる強さ = 2 sin(向きのずれ) / 先までの距離。それを出すのに要る舵を、その速さでの最大の曲がり方から逆に求める */
 steerTo(x,z,h,tx,tz,v,yawFull){ const dx=tx-x, dz=tz-z, L=Math.hypot(dx,dz)||1, a=Math.atan2(Math.sin(Math.atan2(dx,-dz)-h),Math.cos(Math.atan2(dx,-dz)-h));
  const yaw=v*2*Math.sin(a)/L; return clamp(yaw/Math.max(yawFull,1e-3),-1,1); },
 driveRoad(dtR){ const es=Engine.st, V=View, v=Math.max(es.v,1); if(!V.road||V.cx===undefined) return;
  const look=clamp(v*1.1,7,30), p=V.roadPoint(Math.min(V.s+look,V.road.builtS-1)), lat=-2.4, tx=p.x+Math.cos(p.h)*lat, tz=p.z+Math.sin(p.h)*lat;
  const yawFull=(typeof steerFullAccel==="function"? steerFullAccel(v) : v*clamp(6.5/Math.max(v,4),0.12,1))/v;
  Input.steer=this.steerTo(V.cx,V.cz,V.ch,tx,tz,v,yawFull);
  // 先の曲がり具合を見て減速 (横 2.6 m/s² まで)。制限速度より少し下
  let kmax=0; const h0=V.roadPoint(V.s).h; for(let d=10;d<=Math.max(60,v*7);d+=10){ const q=V.roadPoint(Math.min(V.s+d,V.road.builtS-1)), dh=Math.abs(Math.atan2(Math.sin(q.h-h0),Math.cos(q.h-h0))); kmax=Math.max(kmax,dh/d); }
  const lim=typeof speedLimitAt==="function"? Math.min(speedLimitAt(es.km),speedLimitAt(es.km+0.3)) : 100;
  this.speed(es,es.v,Math.min((Math.min(82,lim-4))/3.6, Math.sqrt(2.6/Math.max(kmax,1e-4))));
  if(Math.abs(V.lateral-lat)>4) this.fail+=dtR; else this.fail=Math.max(0,this.fail-dtR); },
 driveHV(dtR){ const T=HV.track(), es=Engine.st, t=Test, v=Math.max(t.v,1), n=T.n, i0=t.lastIdx;
  let j=i0, d=0; const look=clamp(v*0.9,8,26); while(d<look){ const a=T.pts[j], b=T.pts[(j+1)%n]; d+=Math.hypot(b.x-a.x,b.z-a.z); j=(j+1)%n; }
  const yawFull=clamp(8.5/Math.max(v,3),0.15,1.2);
  Input.steer=this.steerTo(t.x,t.z,t.heading,T.pts[j].x,T.pts[j].z,v,yawFull);
  let kmax=0; d=0; for(let k=i0;d<Math.max(50,v*6);k=(k+1)%n){ const a=T.pts[k], b=T.pts[(k+1)%n]; d+=Math.hypot(b.x-a.x,b.z-a.z); kmax=Math.max(kmax,Math.abs(T.curv[k])); }
  es.gear="D"; this.speed(es,t.v,Math.min(105/3.6,Math.sqrt(4.5/Math.max(kmax,1e-4)))); },
 /* ヒドゥンバレーの中継カメラ: コースの外側の固定カメラが車を追い、通り過ぎたら次へ。合間に空からの追走 */
 hvCam(t,dtR){ const T=HV.track(), n=T.n, R=this.hv||(this.hv={i:-1}), car=new THREE.Vector3(t.x,t.car.position.y,t.z); R.t=(R.t||0)+dtR;
  const ahead=(k)=>{ let j=t.lastIdx, d=0; while(d<k){ const a=T.pts[j], b=T.pts[(j+1)%n]; d+=Math.hypot(b.x-a.x,b.z-a.z); j=(j+1)%n; } return j; };
  const passed=R.j!=null&&((t.lastIdx-R.j+n)%n)<n/2&&((t.lastIdx-R.j+n)%n)>Math.max(8,t.v*1.2);
  if(R.i<0||passed||R.t>(R.kind==="heli"?7:13)){ R.i++; R.t=0; R.kind= R.i%3===2? "heli" : "side";
   if(R.kind==="side"){ R.j=ahead(clamp(t.v*4,40,110)); const p=T.pts[R.j], r=T.right[R.j], sd=(T.curv[R.j]>0?-1:1), off=(T.hw[R.j]||6)+8; R.p=new THREE.Vector3(p.x+r[0]*off*sd,p.y+(R.i%2?3.6:6.5),p.z+r[1]*off*sd);   /* コースの壁・フェンスより高く */ } else R.j=null; }
  const look=car.clone(); look.y+=0.45;
  if(R.kind==="side"){ const dd=R.p.distanceTo(car); return {pos:R.p.clone(),look,fov:clamp(2*Math.atan(4.2/Math.max(dd,3))*180/Math.PI,8,50),focus:dd,k:0.4}; }
  const f=new THREE.Vector3(Math.sin(t.heading),0,-Math.cos(t.heading)), rr=new THREE.Vector3(Math.cos(t.heading),0,Math.sin(t.heading)), a=R.t*0.15;
  const p=car.clone().addScaledVector(f,-24*Math.cos(a)).addScaledVector(rr,24*Math.sin(a)+5); p.y+=15; return {pos:p,look,fov:32,focus:p.distanceTo(car),k:1}; },
 stop(){ if(!this.on) return; this.on=false; removeEventListener("pointerdown",this._tap,true); removeEventListener("keydown",this._key,true);
  document.body.classList.remove("demo-on"); this.el().classList.remove("on");
  const k=this.keep||{}; Object.assign(P,{mode:k.mode,testKind:k.testKind,event:k.event,crewProc:k.crewProc,raceStorm:k.raceStorm,orders:k.orders,tts:k.tts,realWeather:k.realWeather,fcErr:k.fcErr});
  document.getElementById("time-scale").value=k.ts||"60"; if(k.chap!=null) document.getElementById("chapter").value=k.chap; const sc=document.getElementById("scenario"); if(sc&&k.scn!=null) sc.value=k.scn;
  if(typeof RunLog!=="undefined") RunLog.rows=[];   // 分析画面に「今回の走行」として出さない
  if(typeof Standby!=="undefined"&&Standby.lock){ Standby.lock.release().catch(()=>{}); Standby.lock=null; }
  quitToMenu(); if(typeof Entry!=="undefined") Entry.pick(Entry.ent,false); if(typeof Perf!=="undefined") Perf.apply();
  if(/[?&]demo\b/.test(location.search)) try{ history.replaceState(null,"",location.pathname+location.search.replace(/[?&]demo(=[^&]*)?/,"").replace(/^&/,"?")+location.hash); }catch(x){} },
};
