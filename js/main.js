"use strict";
function fmtLap(t){ const mn=Math.floor(t/60),s=(t%60).toFixed(2); return `${mn}:${s.padStart(5,"0")}`; }
let running=false, paused=false, lastT=0;
let eventElapsed=0; const EVENT_DURATION=MODE_CFG.event.duration;
function startGame(){
Snd.init();
if(P.mode==="event") EventGame.prepare();   // イベント: 内部はレースモードで動かし、課題を重ねる
Engine.init();
if(typeof Crew!=="undefined"){ Crew.reset(); Crew.driverIdx=0; if(DRIVER_NAMES&&P.mode==="race"&&!P.event){ Crew.drivers[0].name=DRIVER_NAMES[0]; Crew.drivers[1].name=DRIVER_NAMES[1]; } }
Test.active=false;
if(P.mode==="test"){
Engine.st.hour=12;
document.getElementById("setup-screen").classList.add("hidden");
show("result-screen",false); show("test-result",false);
document.getElementById("game-container").classList.remove("hidden");
document.getElementById("event-hud").classList.add("hidden");
document.getElementById("test-hud").classList.remove("hidden");
Radio.log.length=0; document.getElementById("radio-log").innerHTML="";
applyTouchMode(); document.body.classList.add("hide-map"); MapUI.toggle(false);
RunLog.start();
Test.start(P.testKind);
initChart();
if(P.event) EventGame.begin();   // イベント (ヒドゥンバレー版)
running=true; paused=false; lastT=performance.now();
requestAnimationFrame(loop);
return;
}
document.getElementById("test-hud").classList.add("hidden");
applyTouchMode(); document.body.classList.remove("hide-map");
if(P.mode==="event"){
P.timeScale=60;
Engine.st.hour=10.5;
document.getElementById("event-hud").classList.remove("hidden");
} else {
P.timeScale=parseInt(document.getElementById("time-scale").value);
const scn= P.mode==="race"&&!P.event&&!Save.pending? Scenario.pick() : null; Scenario.reset();
if(scn) P.timeScale=Scenario.LIST[scn].ts;   // 練習シナリオは時間をゆっくり
document.getElementById("event-hud").classList.add("hidden");
}
eventElapsed=0;
window._lastAct=performance.now();
document.getElementById("setup-screen").classList.add("hidden");
show("result-screen",false);
document.getElementById("game-container").classList.remove("hidden");
document.getElementById("tilt-slider").value=Engine.st.tiltDeg;
document.getElementById("tilt-val").textContent=Engine.st.tiltDeg+"°";
Radio.log.length=0; document.getElementById("radio-log").innerHTML="";
Route.build(P.timeScale, P.mode!=="race");   // イベントモードは等倍ゾーンなし
const chap= P.mode==="race"&&!P.event? parseInt((document.getElementById("chapter")||{}).value||"0") : 0;
const resumed=P.mode==="race"&&!P.event&&Save.applyEngine();   // 「続きから」: 保存した状態に戻す (シナリオ・チャプターより優先)
const scnId= !resumed&&P.mode==="race"&&!P.event? Scenario.pick() : null;
if(resumed){}
else if(scnId) Scenario.apply(scnId);   // 練習シナリオ (チャプターより優先)
else if(chap>0) Engine.applyChapter(chap);   // チャプター: CS の 2 km 手前から
RunLog.start(); Orders.start(); if(resumed) Save.applyRest(); DrvRec.start();
View.init(); View.buildCar(); View.buildEscorts();
if(!MapUI.built) MapUI.build(); MapUI.reset(); MapUI.toggle(false);
initChart(); lastChartPush=0;
running=true; paused=false; lastT=performance.now();
requestAnimationFrame(loop);
if(P.event) EventGame.begin();
else if(Engine.st.scenario||resumed){}
else if(Engine.st.chapter){ const c=RP_CS.find(q=>q.n===Engine.st.chapter), es=Engine.st, h=Math.floor(es.hour), mi=Math.floor(es.hour%1*60);
 Radio.push(`チャプター: CS${c.n} ${c.name} の 2 km 手前から。Day${es.day} ${h}:${String(mi).padStart(2,"0")}、電池 ${(es.soc*100).toFixed(0)} % (標準ペース 70 km/h の見積もり)。`); }
else { const es=Engine.st, m=Math.round((es.gridStartH-8)*60);
 Radio.push(`Day1 Darwin。スタートは予選順で 1 台ずつ、08:30 までに全車が出ます。自車はグリッド P${es.grid} / ${es.teams.length+1}${es.qualiLap?` (予選 ${fmtLap(es.qualiLap)})`:" (予選未計測)"}、発進は 08:${String(m).padStart(2,"0")}。W/↑ でスロットル開度を設定。`); }
}
function loop(t){
if(!running) return;
requestAnimationFrame(loop);
let dtR=clamp((t-lastT)/1000,0,0.1); lastT=t;
if(paused||modalPause){ Snd.silence(); FFB.update(null); return; }   // (読み上げは途中で切らない)
updateInput(dtR);
if(P.event){ EventGame.frame(dtR); if(!running||modalPause) return; }
if(Test.active){ Test.frame(dtR); if(P.event) EventGame.postTest(); Perf.tick(dtR); if(P.event) EventGame.hud(); return; }
if(P.mode==="event"&&Engine.st){
  if(performance.now()-(window._lastAct||0)>MODE_CFG.event.attractIdle*1000){
    Engine.st.throttleSet=0.7;
    const tgt=clamp((-2.4-View.lateral)*0.15,-0.35,0.35);
    Input.steer=clamp((tgt-(View.relHeading||0))*2.5,-1,1);
  }
}
const es=Engine.st;
let ts=Route.scaleAt(es.km);   // 右左折/信号/CS 付近は自動で等倍
if(es.stopTimer>0) ts=Math.max(ts,300);
if(es.camp) ts=Math.max(ts,es.disconnected?2400:300);
if(Engine.gridWait()) ts=Math.max(ts,60);   // 発進待ちは早送り
if(typeof Crew!=="undefined"&&Crew.busy()) ts=Crew.timeScale(es,ts);
const dtS=dtR*ts;
const sub=Math.max(1,Math.ceil(dtS/60));
for(let i=0;i<sub;i++) Engine.step(dtS/sub, i===0?dtR:0);
if(P.mode==="event"){
eventElapsed+=dtR;
if(eventElapsed>=EVENT_DURATION&&!es.finished){ es.finished=true; showResult(); return; }
}
View.update(dtR);
if(P.event) EventGame.post();
Scenario.frame(es,dtR); Orders.frame(es,dtR); Tele.frame(es);
if(P.mode==="race"&&!es.finished&&!es.trailering) es.km=View.kmOfS(View.s);   // 走行位置(本線への射影)を正とする
Snd.update(es.v, es.lastAmp/Math.max(motorMaxA(es.powerMode),1), es.fire);
if(typeof Crew!=="undefined"&&Crew.phase==="outside") FFB.update(null); else FFB.update(FFB.fromRace(es,dtR));   // 振動・反力 (車外を歩いている間は止める)
updateHUD(); drawWind(); drawG(); MapUI.frame(); RunLog.tick();
Perf.tick(dtR);
if(t-lastChartPush>1500){ pushChart(); drawMap(); lastChartPush=t; }
}
function togglePause(){
if(!running) return;
paused=!paused;
show("pause-overlay",paused);
if(!paused) lastT=performance.now();
}
function quitToMenu(){
if(running&&Engine.st&&!Test.active) DrvRec.record();   // ドライバー成績 (途中でやめた走行も)
if(typeof EventGame!=="undefined") EventGame.end();
running=false; paused=false; Test.active=false;
document.getElementById("game-container").classList.add("hidden");
document.getElementById("test-hud").classList.add("hidden");
show("result-screen",false); show("pause-overlay",false); show("stopmenu-overlay",false); show("test-result",false);
document.getElementById("setup-screen").classList.remove("hidden"); refreshQuali(); Save.menu();
Snd.silence(); FFB.update(null); Speech.stop();
}
Settings.load();
if(Monitor.wanted()) Monitor.boot();   // テレメトリの監視画面 (QR から開いたとき)
else if(!/#r=/.test(location.hash)) Fade.intro();
buildSetupUI();
refreshUIModeBtns(); Settings.badge();
setEventLevel(EventGame.level); setEventCourse(EventGame.course); setEventPractice(EventGame.practice);
segFromSelect("time-scale","seg-ts");
segFromSelect("log-step","seg-log");
segFromSelect("gfx","seg-gfx");
segFromSelect("scenario","seg-scn",o=>o.value===""?"なし":o.textContent);
segFromSelect("scn-level","seg-scnlv");
segFromSelect("tts","seg-tts");
segFromSelect("fc-err","seg-fc");
segFromSelect("ffb","seg-ffb",o=>o.value==="off"?"振動 OFF":o.textContent);
FFB.init();
refreshQuali(); Save.menu();
segFromSelect("chapter","seg-chap",o=>o.value==="0"?"スタート":"CS"+o.value);
setInterval(pollGamepad,800);
addEventListener("gamepadconnected",e=>toast("🎮 コントローラー接続: "+escHtml(e.gamepad.id.slice(0,40)),"#34d399"));
/* ---- ② キオスク堅牢化 ---- */
addEventListener("contextmenu",e=>e.preventDefault());
addEventListener("keydown",e=>{if(e.key==="F5"||(e.ctrlKey&&e.key.toLowerCase()==="r"))e.preventDefault();});
addEventListener("pointerdown",()=>{window._lastAct=performance.now();});
const _sb=document.createElement("div");_sb.textContent="S";
_sb.style.cssText="position:fixed;left:50%;top:4px;margin-left:-11px;width:22px;height:22px;border-radius:50%;background:#223;z-index:99;opacity:.25;display:flex;align-items:center;justify-content:center;font-size:11px;color:#9ab;user-select:none;touch-action:none";
let _sbT=null;
_sb.addEventListener("pointerdown",e=>{e.stopPropagation();_sbT=setTimeout(()=>location.reload(),3000);});
["pointerup","pointerleave"].forEach(ev=>_sb.addEventListener(ev,()=>clearTimeout(_sbT)));
document.body.appendChild(_sb);
/* オフライン動作 (sw.js): https か localhost で開いたときだけ */
if("serviceWorker" in navigator&&(location.protocol==="https:"||/^(localhost|127\.0\.0\.1)$/.test(location.hostname))){
 navigator.serviceWorker.register("sw.js").then(()=>navigator.serviceWorker.ready).then(()=>{
  const b=document.querySelector(".menu .build"); if(b&&!/OFFLINE/.test(b.textContent)) b.textContent+=" ・ OFFLINE READY"; }).catch(()=>{});
}
