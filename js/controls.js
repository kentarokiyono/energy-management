"use strict";
const StopMenu={
active:false, mode:null,
open(manual){
const s=Engine.st;
if(!s||s.fire||s.stopTimer>0||s.camp||Test.active) return;
if(s.v*3.6>2){ toast("停車してから操作してください(2km/h以下)"); return; }
this.active=true; this.mode="menu";
document.getElementById("stopmenu-status").textContent=
`SOC ${(s.soc*100).toFixed(1)}% / ${s.burst?"⚠タイヤバースト中":"タイヤ正常"} / ${s.fault?"⚠電装系不具合の疑い":"機器正常"}`;
show("stopmenu-overlay",true);
},
close(){ this.active=false; this.mode=null; show("stopmenu-overlay",false); Engine.st&&View.exitPit(); },
pick(kind){
const s=Engine.st;
show("stopmenu-overlay",false);
if(kind==="tire"){ s.stopTimer=5*60; s.stopKind="tire"; this.active=false; }
else if(kind==="check"){ s.stopTimer=(s.fault?30:10)*60; s.stopKind="check"; this.active=false; }
else if(kind==="charge"){
this.mode="charge";
if(!Engine.chargingAllowed()) toast("⚠ 現時刻は静止充電許可時間外です(発電はしますが規則違反想定)","#f59e0b");
TiltDecide.open();
}
},
resume(){
if(this.mode==="charge"){ this.mode=null; this.active=false; Engine.st.tiltLocked=false; }
},
};
function show(id,on){ const e=document.getElementById(id); e.classList.toggle("hidden",!on); e.classList.toggle("flex",on); }
function onTilt(v){ Engine.st.tiltDeg=parseFloat(v); document.getElementById("tilt-val").textContent=v+"°"; }
let modalPause=false;
const TiltDecide={
open(){
const s=Engine.st; if(!s) return;
modalPause=true;
document.getElementById("td-slider").value=s.tiltDeg;
this.preview(s.tiltDeg);
show("tilt-decide",true);
},
preview(v){
const s=Engine.st;
s.tiltDeg=parseFloat(v);
document.getElementById("td-val").textContent=v+"°";
const prof=profileAt(s.km);
const sol=Engine.solarCalc(prof.lat,s.hour,true);
const tempLoss=clamp(1-PANEL_TYPES[P.panel].gamma*Math.max(0,cellTempSS(s.Tamb||30,sol.G,s.windSpeed||2,true)-25),0.6,1);
const w=P.arrayArea*P.cellEff*tempLoss*P.mpptEff*sol.G*PRO.solarScale;
document.getElementById("td-watt").textContent=w.toFixed(0);
},
confirm(){
const s=Engine.st;
s.tiltLocked=true;
document.getElementById("tilt-slider").value=s.tiltDeg;
document.getElementById("tilt-val").textContent=s.tiltDeg+"°";
show("tilt-decide",false);
modalPause=false; lastT=performance.now();
},
};
function boost(){const s=Engine.st;if(!s||P.mode!=="event"||s.boostCd>0)return;
s.boostT=3;s.boostCd=12;Snd.blip(700,0.2);toast("🚀 BOOST!","#fbbf24");}
const Ask={
q(kind){
const s=Engine.st; if(!s) return;
document.getElementById("ask-panel").classList.add("hidden");
const absH=(s.day-1)*24+s.hour;
if(kind==="cs"){
let next=null;
for(const c of ROUTE) if(c.cp&&!s.passedCP.has(c.km)&&c.km>s.km){ next=c; break; }
if(!next){ Radio.push(`次はゴールのVictoria Park、残り${(TOTAL_KM-s.km).toFixed(0)}kmです。`); return; }
const closeAbs=csCloseAbs(next.km);
const eta=s.v>3? (next.km-s.km)/(s.v*3.6):null;
Radio.push(`${next.name}まで残り${(next.km-s.km).toFixed(0)}km${eta?`、現ペースで約${fmtDur(eta)}`:""}。クローズは${fmtAbsH(closeAbs)}(残り${fmtDur(closeAbs-absH)})です。`);
} else if(kind==="pace"){
const r=Engine.recommendSpeed();
Radio.push(`推奨は時速${r.v}km。このペースなら${r.cs}到着時SOC約${(r.pred*100).toFixed(0)}%です。${r.pred<0.45?"⚠ 50%維持は困難、充電停車も検討を。":""}`);
} else if(kind==="weather"){
const nexts=(s.weatherPlan||[]).filter(w=>w.start+w.dur>absH).slice(0,2);
let msg=s.weather?`現在は${s.weather.type==="squall"?"スコール":"曇天"}の中です。`:"現在は快晴。";
msg+= nexts.length? " 予報: "+nexts.map(w=>`${fmtAbsH(w.start)}頃から${w.type==="squall"?"⛈スコール":"☁曇天"}(約${w.dur.toFixed(1)}h)`).join(" / ") : " 予報: この先しばらく大きな崩れはありません。";
msg+=" なお南下するほど雲は増える傾向です。";
Radio.push(msg,"偵察車");
} else if(kind==="road"){
const g=View.upcomingGrade;
const trains=View.roadTrains.length;
const lms=LANDMARKS.filter(l=>l.km>s.km&&l.km<s.km+30).slice(0,2);
const names={signal:"信号",bridge:"橋",river:"川",camp:"キャンプ地",roadhouse:"ロードハウス",grid:"キャトルグリッド"};
let msg=`3km先: ${g>0?"登り区間あり":g<0?"下り区間あり":"平坦"}。`;
msg+= trains?`⚠ ロードトレイン${trains}台接近中。`:"対向ロードトレインなし。";
if(lms.length) msg+=" この先: "+lms.map(l=>`${l.km.toFixed(0)}km地点に${names[l.t]||l.t}(${l.n})`).join("、")+"。";
Radio.push(msg,"偵察車");
} else if(kind==="rank"){
const rank=1+s.teams.filter(tm=>tm.km>s.km).length;
const ahead=s.teams.filter(tm=>tm.km>s.km&&tm.status!=="dnf").sort((a,b)=>a.km-b.km)[0];
const behind=s.teams.filter(tm=>tm.km<s.km&&tm.status!=="dnf").sort((a,b)=>b.km-a.km)[0];
let msg=`現在P${rank}/${s.teams.length+1}。`;
if(ahead) msg+=`前方${(ahead.km-s.km).toFixed(1)}kmに${ahead.name}(SOC~${(ahead.soc*100).toFixed(0)}%)。`;
if(behind) msg+=`後方${(s.km-behind.km).toFixed(1)}kmに${behind.name}。`;
const lowTeams=s.teams.filter(tm=>tm.status==="run"&&tm.soc<0.2).length;
msg+=`リタイア${s.teams.filter(tm=>tm.status==="dnf").length}台。`;
if(lowTeams) msg+=`電欠寸前で失速中のチームが${lowTeams}台います。`;
Radio.push(msg,"後方追走車");
} else if(kind==="batt"){
const remWh=s.soc*P.batteryWh;
const drain=Math.max(s.lastNet,1);
Radio.push(`SOC ${(s.soc*100).toFixed(1)}% / ${VOC(s.soc).toFixed(1)}V / ${s.lastIbat.toFixed(1)}A。残${remWh.toFixed(0)}Wh、現在の収支だと${s.lastNet>0?`約${fmtDur(remWh/drain)}で空`:"充電傾向"}です。積算消費${s.ahUsed.toFixed(2)}Ah。`);
}
},
};
function toggleSignal(dir){
const s=Engine.st; if(!s||!running) return;
s.signal = s.signal===dir ? 0 : dir;
Snd.blip(1200,0.05,"square",0.12);
}
let _winkPhase=null;
function updateWinkers(carGroup,es){
if(!carGroup||!carGroup.userData.winkL) return;
const on=(performance.now()%800)<400;
const L=es.signal===-1||es.signal===2, R=es.signal===1||es.signal===2;
carGroup.userData.winkL.forEach(m=>m.color.setHex(L&&on?0xffb020:0x4a3005));
carGroup.userData.winkR.forEach(m=>m.color.setHex(R&&on?0xffb020:0x4a3005));
if(es.signal!==0){
if(on!==_winkPhase){ _winkPhase=on; if(on) Snd.blip(1350,0.025,"square",0.05); }
} else _winkPhase=null;
const lc=(L&&on)?"#34d399":"#1e3a4f", rc=(R&&on)?"#34d399":"#1e3a4f";
const wl=document.getElementById("wl"), wr=document.getElementById("wr");
if(wl){ wl.style.color=lc; wr.style.color=rc; }
const wl2=document.getElementById("wl2"), wr2=document.getElementById("wr2");
if(wl2){ wl2.style.color=lc; wr2.style.color=rc; }
}
/* 後端の両角の透明レンズ: ウインカー/ハザード (点滅) が優先、次にブレーキ (赤)、消灯時は透明 (レース・予選共通) */
function updateRearCombo(carGroup,es){
if(!carGroup||!carGroup.userData.rearCombo) return;
const on=(performance.now()%800)<400, L=es.signal===-1||es.signal===2, R=es.signal===1||es.signal===2, brk=es.brakePhys>0.05||es.brakeRegen>0.05;
for(const c of carGroup.userData.rearCombo){ const blink=(c.side<0?L:R);
 if(blink&&on){ c.m.color.setHex(0xffa012); c.m.opacity=1; }
 else if(brk){ c.m.color.setHex(0xff1a1a); c.m.opacity=1; }
 else { c.m.color.setHex(0xd8dde2); c.m.opacity=.55; } }
}
function applyTouchMode(){
const on=(P.uiMode==="mobile");
document.getElementById("touch-ui").classList.toggle("hidden",!on);
document.body.classList.toggle("touch-on",on);
}
function setUIMode(m){
P.uiMode=m;
refreshUIModeBtns();
if(running) applyTouchMode();
}
function refreshUIModeBtns(){
const pc=document.getElementById("ui-pc"), mb=document.getElementById("ui-mobile");
if(!pc) return;
pc.style.boxShadow=P.uiMode==="pc"?"0 0 12px rgba(34,211,238,.8)":"";
pc.style.borderColor=P.uiMode==="pc"?"#22d3ee":"#164e63";
mb.style.boxShadow=P.uiMode==="mobile"?"0 0 12px rgba(52,211,153,.8)":"";
mb.style.borderColor=P.uiMode==="mobile"?"#34d399":"#164e63";
}
/* 後退ギア (N キー): 停止中だけ D ⇄ R を切り替える。後退中は上限 8 km/h・電流を絞る・警告音 */
const REVERSE={maxV:8/3.6, maxA:8};
function toggleGear(){
const s=Engine.st; if(!s||!running||P.mode==="event") return;
if(typeof Crew!=="undefined"&&Crew.busy()) return;
if(s.v>0.3){ toast("⚠ 停止してからギアを切り替えてください","#f59e0b"); Snd.blip(300,0.1); return; }
s.gear= s.gear==="R"? "D" : "R"; s.throttleSet=0;
toast(s.gear==="R"?"⏪ R (後退) ― 上限 8 km/h":"⏩ D (前進)",s.gear==="R"?"#f87171":"#34d399");
Snd.blip(s.gear==="R"?600:900,0.12);
}
/* 進む向き: D = +1 / R = -1 */
function gearDir(){ return Engine.st&&Engine.st.gear==="R"? -1 : 1; }
/* 後退中の警告音 (0.8 秒ごと) */
let _revBeep=0;
function reverseBeep(es){ if(!es||es.gear!=="R"||es.v<0.2){ _revBeep=0; return; } const t=performance.now(); if(t-_revBeep>800){ _revBeep=t; Snd.blip(1100,0.18,"square",0.06); } }
function togglePower(){
const s=Engine.st; if(!s) return;
s.powerMode=!s.powerMode;
toast(s.powerMode?"⚡ POWERモード ― トルク減・最高速増":"🍃 ECOモード ― 効率重視","#f59e0b");
Snd.blip(s.powerMode?900:500,0.15);
}
function toggleBMS(){
const s=Engine.st; if(!s) return;
s.bmsOn=!s.bmsOn;
toast(s.bmsOn?"🛡 BMS保護 ON":"⚠ BMS保護 OFF ― 過放電にご注意!","#f59e0b");
Snd.blip(700,0.15);
}
const OT={active:false,team:null,timer:null,
ask(tm,trainNear){
this.active=true; this.team=tm;
document.getElementById("ot-text").innerHTML=
`【${tm.name}】 Can I overtake?<br><span class="text-cyan-300 text-xs">伴走車情報: ${trainNear?"⚠ ロードトレイン接近中 ― No推奨":"前方クリア ― Yes可"}</span>`;
show("ot-pop",true); Snd.radioBeep();
this.timer=setTimeout(()=>this.answer(false),12000);
},
answer(yes){
clearTimeout(this.timer); show("ot-pop",false);
const tm=this.team; this.active=false; this.team=null;
if(!tm) return;
if(yes){ tm.passing=true; tm.boost=true; tm.holdT=0;
Radio.push("Yes, go ahead と回答しました。","我々");
setTimeout(()=>Radio.push("Thanks!",tm.name),1400); }
else { tm.holdT=45; Radio.push("No と回答 ― 後続には待ってもらいます。","我々"); }
},
};
document.querySelectorAll("#touch-ui [data-tk]").forEach(b=>{
const k=b.dataset.tk;
const on=e=>{e.preventDefault();Input.keys[k]=true;};
const off=e=>{e.preventDefault();Input.keys[k]=false;};
b.addEventListener("pointerdown",on);
b.addEventListener("pointerup",off); b.addEventListener("pointerleave",off); b.addEventListener("pointercancel",off);
});
let toastTimer=null;
function toast(msg,color="#22d3ee"){
const t=document.getElementById("toast");
t.innerHTML=msg; t.style.color=color; t.style.opacity=1;
clearTimeout(toastTimer);
toastTimer=setTimeout(()=>t.style.opacity=0,3500);
}
const Input={ keys:{}, steer:0,
map: JSON.parse(localStorage.getItem("bwsc_wheelmap")||"null") ||
{ steer:{axis:0,inv:false}, accel:null, brake:null },
gamepadOK:false, gpSteer:0, gpThrottle:0, gpBrake:0, gpRegen:false,
};
addEventListener("keydown",e=>{
Input.keys[e.key.toLowerCase()]=true;
if(e.key===" ") e.preventDefault();
if(e.key==="Escape") togglePause();
if(e.key.toLowerCase()==="v") View.cam=(View.cam+1)%4;
if(e.key.toLowerCase()==="g") cycleChart();
if(e.key.toLowerCase()==="m") StopMenu.open(true);
if(e.key.toLowerCase()==="p"&&Engine.st&&running) togglePower();
if(e.key.toLowerCase()==="z") toggleSignal(-1);
if(e.key.toLowerCase()==="c") toggleSignal(1);
if(e.key.toLowerCase()==="x") toggleSignal(2);
if(e.key.toLowerCase()==="q"&&running) document.getElementById("ask-panel").classList.toggle("hidden");
if(e.key.toLowerCase()==="b"&&running) boost();
if(e.key.toLowerCase()==="n"&&running) toggleGear();
if(e.key==="Backspace"&&Test.active){ e.preventDefault(); Test.retry(); }
});
addEventListener("keyup",e=>Input.keys[e.key.toLowerCase()]=false);
function axisToPedal(gp,m){
if(!m||m.axis==null) return 0;
const raw=gp.axes[m.axis];
if(raw===undefined) return 0;
return clamp((raw-m.min)/((m.max-m.min)||1),0,1);
}
function pollGamepad(){
const gps=navigator.getGamepads?navigator.getGamepads():[];
let gp=null;
for(const g of gps) if(g&&g.connected){ gp=g; break; }
const stat=document.getElementById("gamepad-status");
if(!gp){ Input.gamepadOK=false; if(stat) stat.textContent="未検出"; return; }
Input.gamepadOK=true;
if(stat) stat.textContent="✅ "+gp.id.slice(0,30);
const m=Input.map;
let st=gp.axes[m.steer.axis]||0; if(m.steer.inv) st=-st;
Input.gpSteer=clamp(st,-1,1);
Input.gpThrottle=m.accel?axisToPedal(gp,m.accel):0;
Input.gpBrake=m.brake?axisToPedal(gp,m.brake):0;
Input.gpRegen=gp.buttons[0]&&gp.buttons[0].pressed;
}
function updateInput(dt){
pollGamepad();
const k=Input.keys, es=Engine.st;
if(Object.values(k).some(Boolean))window._lastAct=performance.now();
if(!es) return;
if(typeof Crew!=="undefined"&&Crew.busy()){ Input.steer=lerp(Input.steer,0,clamp(dt*6,0,1)); return; }   // 車外・乗降手順中は運転操作なし
const up=(k["w"]||k["arrowup"]);
const dn=(k["s"]||k["arrowdown"]);
if(up) es.throttleSet=clamp(es.throttleSet+0.35*dt,0,1);
if(dn) es.throttleSet=clamp(es.throttleSet-0.5*dt,0,1);
if(Input.gamepadOK&&Input.gpThrottle>0.03) es.throttleSet=Input.gpThrottle;
es.brakePhys=lerp(es.brakePhys,Math.max(k[" "]?1:0,Input.gpBrake||0),clamp(dt*10,0,1));
es.brakeRegen=lerp(es.brakeRegen,(k["r"]||Input.gpRegen)?1:0,clamp(dt*8,0,1));
const kbS=((k["a"]||k["arrowleft"])?-1:0)+((k["d"]||k["arrowright"])?1:0);
let sIn=kbS;
if(Input.gamepadOK&&Math.abs(Input.gpSteer)>0.02) sIn=Input.gpSteer;
Input.steer=lerp(Input.steer,clamp(sIn,-1,1),clamp(dt*6,0,1));
}
let calibrating=null;
function openWheelConfig(){ show("wheel-config",true); refreshWheelLabels(); }
function closeWheelConfig(){ show("wheel-config",false); }
function refreshWheelLabels(){
const m=Input.map;
document.getElementById("map-steer").textContent="軸"+m.steer.axis+(m.steer.inv?"(反転)":"");
document.getElementById("map-accel").textContent=m.accel?("軸"+m.accel.axis):"未設定";
document.getElementById("map-brake").textContent=m.brake?("軸"+m.brake.axis):"未設定";
}
function calibrate(kind){
const msg=document.getElementById("wheel-msg");
const gps=navigator.getGamepads?navigator.getGamepads():[];
let gp=null; for(const g of gps) if(g&&g.connected){gp=g;break;}
if(!gp){ msg.textContent="⚠ コントローラーが見つかりません。接続して一度ボタンを押してください。"; return; }
const base=[...gp.axes];
const label={steer:"ハンドルを左右いっぱいに回してください",accel:"アクセルペダルを一度奥まで踏んでください",brake:"ブレーキペダルを一度奥まで踏んでください"}[kind];
msg.textContent="🕐 "+label;
let maxDelta=0, foundAxis=-1, minV=1, maxV=-1;
const t0=performance.now();
if(calibrating) clearInterval(calibrating);
calibrating=setInterval(()=>{
const g=(navigator.getGamepads())[gp.index]; if(!g) return;
g.axes.forEach((v,i)=>{
const d=Math.abs(v-base[i]);
if(d>maxDelta&&d>0.35){ maxDelta=d; foundAxis=i; }
if(i===foundAxis){ minV=Math.min(minV,v); maxV=Math.max(maxV,v); }
});
if(performance.now()-t0>4000){
clearInterval(calibrating); calibrating=null;
if(foundAxis<0){ msg.textContent="⚠ 動きを検出できませんでした。"; return; }
if(kind==="steer") Input.map.steer={axis:foundAxis,inv:false};
else Input.map[kind]={axis:foundAxis,min:base[foundAxis],max:(Math.abs(maxV-base[foundAxis])>Math.abs(minV-base[foundAxis]))?maxV:minV};
localStorage.setItem("bwsc_wheelmap",JSON.stringify(Input.map));
msg.textContent=`✅ 軸${foundAxis} に割り当てました`;
refreshWheelLabels();
}
},50);
}
/* ============ ① モード設定 ============ */
