"use strict";
function fmtLap(t){ const mn=Math.floor(t/60),s=(t%60).toFixed(2); return `${mn}:${s.padStart(5,"0")}`; }
let running=false, paused=false, lastT=0;
let eventElapsed=0; const EVENT_DURATION=MODE_CFG.event.duration;
function startGame(){
Snd.init();
Engine.init();
if(typeof Crew!=="undefined") Crew.reset();
Test.active=false;
if(P.mode==="test"){
Engine.st.hour=12;
document.getElementById("setup-screen").classList.add("hidden");
show("result-screen",false); show("test-result",false);
document.getElementById("game-container").classList.remove("hidden");
document.getElementById("event-hud").classList.add("hidden");
document.getElementById("test-hud").classList.remove("hidden");
Radio.log.length=0;
applyTouchMode();
Test.start(P.testKind);
initChart();
running=true; paused=false; lastT=performance.now();
requestAnimationFrame(loop);
return;
}
document.getElementById("test-hud").classList.add("hidden");
applyTouchMode();
if(P.mode==="event"){
P.timeScale=60;
Engine.st.hour=10.5;
document.getElementById("event-hud").classList.remove("hidden");
} else {
P.timeScale=parseInt(document.getElementById("time-scale").value);
document.getElementById("event-hud").classList.add("hidden");
}
eventElapsed=0;
window._lastAct=performance.now();
document.getElementById("setup-screen").classList.add("hidden");
show("result-screen",false);
document.getElementById("game-container").classList.remove("hidden");
document.getElementById("tilt-slider").value=Engine.st.tiltDeg;
document.getElementById("tilt-val").textContent=Engine.st.tiltDeg+"°";
Radio.log.length=0;
Route.build(P.timeScale, P.mode!=="race");   // イベントモードは等倍ゾーンなし
View.init(); View.buildCar(); View.buildEscorts();
initChart(); lastChartPush=0;
running=true; paused=false; lastT=performance.now();
requestAnimationFrame(loop);
if(P.mode==="event") toast("🎪 90秒スコアアタック!B=ブースト","#22d3ee");
else Radio.push("Day1 8:00 Darwinスタート!W/↑でスロットル開度を設定してください。まずは制限速度に注意。");
}
function loop(t){
if(!running) return;
requestAnimationFrame(loop);
let dtR=clamp((t-lastT)/1000,0,0.1); lastT=t;
if(paused||modalPause) return;
updateInput(dtR);
if(Test.active){ Test.frame(dtR); return; }
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
if(typeof Crew!=="undefined"&&Crew.busy()) ts=Crew.timeScale(es,ts);
const dtS=dtR*ts;
const sub=Math.max(1,Math.ceil(dtS/60));
for(let i=0;i<sub;i++) Engine.step(dtS/sub, i===0?dtR:0);
if(P.mode==="event"){
eventElapsed+=dtR;
if(eventElapsed>=EVENT_DURATION&&!es.finished){ es.finished=true; showResult(); return; }
}
View.update(dtR);
if(P.mode==="race"&&!es.finished&&!es.trailering) es.km=View.kmOfS(View.s);   // 走行位置(本線への射影)を正とする
Snd.update(es.v, es.lastAmp/Math.max(motorMaxA(es.powerMode),1), es.fire);
updateHUD(); drawWind(); drawG();
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
running=false; paused=false; Test.active=false;
document.getElementById("game-container").classList.add("hidden");
document.getElementById("test-hud").classList.add("hidden");
show("result-screen",false); show("pause-overlay",false); show("stopmenu-overlay",false); show("test-result",false);
document.getElementById("setup-screen").classList.remove("hidden");
Snd.update(0,0,false);
}
buildSetupUI();
refreshUIModeBtns();
setInterval(pollGamepad,800);
addEventListener("gamepadconnected",e=>toast("🎮 コントローラー接続: "+e.gamepad.id.slice(0,40),"#34d399"));
/* ---- ② キオスク堅牢化 ---- */
addEventListener("contextmenu",e=>e.preventDefault());
addEventListener("keydown",e=>{if(e.key==="F5"||(e.ctrlKey&&e.key.toLowerCase()==="r"))e.preventDefault();});
addEventListener("pointerdown",()=>{window._lastAct=performance.now();});
const _sb=document.createElement("div");_sb.textContent="S";
_sb.style.cssText="position:fixed;right:6px;bottom:6px;width:22px;height:22px;border-radius:50%;background:#223;z-index:99;opacity:.25;display:flex;align-items:center;justify-content:center;font-size:11px;color:#9ab;user-select:none;touch-action:none";
let _sbT=null;
_sb.addEventListener("pointerdown",e=>{e.stopPropagation();_sbT=setTimeout(()=>location.reload(),3000);});
["pointerup","pointerleave"].forEach(ev=>_sb.addEventListener(ev,()=>clearTimeout(_sbT)));
document.body.appendChild(_sb);
