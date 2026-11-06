"use strict";
function drawMap(){}   // 地図は js/ui/map.js (MapUI) が毎フレーム更新
/* 文字列が変わったときだけ書き換える (絵文字 → アイコン置換を毎フレーム起こさない) */
function setT(el,s,html){ if(typeof el==="string") el=document.getElementById(el); if(!el||el._t===s) return; el._t=s; if(html) el.innerHTML=s; else el.textContent=s; }
let GTRAIL=[];
function drawG(){
const es=Engine.st; if(!es) return;
const cv=document.getElementById("g-canvas"); if(!cv) return;
const ctx=cv.getContext("2d"), C=42, R=38;
ctx.clearRect(0,0,84,84);
ctx.strokeStyle="#2a2d32";
for(const r of [R/2,R]){ ctx.beginPath(); ctx.arc(C,C,r,0,7); ctx.stroke(); }
ctx.beginPath(); ctx.moveTo(C-R,C); ctx.lineTo(C+R,C); ctx.moveTo(C,C-R); ctx.lineTo(C,C+R); ctx.stroke();
const gx=clamp(es.gLat||0,-1,1)*R, gy=clamp(-(es.gLong||0),-1,1)*R;
GTRAIL.push([gx,gy]); if(GTRAIL.length>45) GTRAIL.shift();
ctx.strokeStyle="rgba(242,107,29,.35)"; ctx.beginPath();
GTRAIL.forEach((pt,i)=>{ i?ctx.lineTo(C+pt[0],C+pt[1]):ctx.moveTo(C+pt[0],C+pt[1]); }); ctx.stroke();
ctx.fillStyle="#f26b1d"; ctx.beginPath(); ctx.arc(C+gx,C+gy,3.5,0,7); ctx.fill();
ctx.fillStyle="#8b9097"; ctx.font="500 9px 'Chakra Petch',sans-serif";
ctx.fillText("1G",C+R-13,C-3);
ctx.fillText(((es.gLat||0)).toFixed(2)+"G",3,80);
}
function drawWind(){
const es=Engine.st; if(!es) return;
const cv=document.getElementById("wind-canvas"), ctx=cv.getContext("2d");
ctx.clearRect(0,0,64,64);
ctx.strokeStyle="#2a2d32"; ctx.beginPath(); ctx.arc(32,32,28,0,7); ctx.stroke();
const prof=profileAt(es.km);
const rel=es.windDirWorld-prof.bearing+Math.PI;
ctx.save(); ctx.translate(32,32); ctx.rotate(rel);
ctx.strokeStyle="#e6e6e3"; ctx.lineWidth=2.5; ctx.beginPath();
ctx.moveTo(0,-24); ctx.lineTo(0,14); ctx.moveTo(-6,6); ctx.lineTo(0,14); ctx.lineTo(6,6); ctx.stroke();
ctx.restore();
}
let chart=null, lastChartPush=0;
function initChart(){
if(chart) chart.destroy();
chart=new Chart(document.getElementById("history-chart"),{
type:"line",
data:{labels:[],datasets:[
{label:"SOC %",data:[],borderColor:"#e6e6e3",yAxisID:"y",pointRadius:0,borderWidth:2},
{label:"発電 W",data:[],borderColor:"#e2b21f",yAxisID:"y1",pointRadius:0,borderWidth:1.5},
{label:"速度 km/h",data:[],borderColor:"#f26b1d",yAxisID:"y",pointRadius:0,borderWidth:1.5},
{label:"モーター電流 A",data:[],borderColor:"#f26b1d",yAxisID:"y",pointRadius:0,borderWidth:1.5,hidden:true},
{label:"消費 W",data:[],borderColor:"#d23a2e",yAxisID:"y1",pointRadius:0,borderWidth:1.5,hidden:true},
]},
options:{responsive:true,maintainAspectRatio:false,animation:false,
scales:{
x:{ticks:{color:"#8b9097",maxTicksLimit:6},grid:{color:"#1f2226"}},
y:{min:0,max:140,ticks:{color:"#8b9097"},grid:{color:"#1f2226"}},
y1:{position:"right",min:0,ticks:{color:"#e2b21f"},grid:{display:false}},
},
plugins:{legend:{labels:{color:"#c9ccd0",boxWidth:12,font:{size:11,family:"'Chakra Petch','BIZ UDPGothic',sans-serif"}}}},
}
});
}
let chartMode=0;
function cycleChart(){
chartMode=(chartMode+1)%3;
document.getElementById("chart-panel").classList.toggle("hidden",chartMode===0);
if(chart){
const setA=(chartMode===1);
chart.data.datasets[0].hidden=!setA;
chart.data.datasets[1].hidden=!setA;
chart.data.datasets[2].hidden=!setA;
chart.data.datasets[3].hidden=setA;
chart.data.datasets[4].hidden=setA;
chart.update("none");
}
const lbl=document.getElementById("chart-mode-label");
if(lbl) lbl.textContent= chartMode===1?"SOC / 発電 / 速度":chartMode===2?"モーター電流 / 消費":"";
}
function pushChart(){
const es=Engine.st;
const t=`D${es.day} ${String(Math.floor(es.hour)).padStart(2,"0")}:${String(Math.floor(es.hour%1*60)).padStart(2,"0")}`;
chart.data.labels.push(t);
chart.data.datasets[0].data.push(es.soc*100);
chart.data.datasets[1].data.push(es.lastSolar);
chart.data.datasets[2].data.push(es.v*3.6);
chart.data.datasets[3].data.push(es.lastAmp);
chart.data.datasets[4].data.push(es.lastMotorW+(es.disconnected?0:P.auxW));
if(chart.data.labels.length>400){ chart.data.labels.shift(); chart.data.datasets.forEach(d=>d.data.shift()); }
chart.update("none");
}
/* 停車中パネル (ティルト角・残り時間): たたむと 1 行だけ。状態はブラウザに保存 */
let stopFold=false; try{ stopFold=localStorage.getItem("bwsc_stopFold")==="1"; }catch(e){}
function toggleStopFold(){ stopFold=!stopFold; try{ localStorage.setItem("bwsc_stopFold",stopFold?"1":"0"); }catch(e){} applyStopFold(); }
function applyStopFold(){ const b=document.getElementById("stop-body"), f=document.getElementById("stop-fold"); if(b) b.classList.toggle("hidden",stopFold); if(f) f.textContent=stopFold?"▼":"▲"; }
function updateHUD(){
const es=Engine.st; if(!es) return;
const bh=document.getElementById("bottom-hud");
if(bh) bh.style.display=(View.cam===2)?"none":"";
const h=Math.floor(es.hour), m=Math.floor(es.hour%1*60);
document.getElementById("hud-clock").textContent=`DAY ${es.day} ${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
document.getElementById("hud-dist").innerHTML=`${es.km.toFixed(1)}<span class="u">/ ${TOTAL_KM.toFixed(1)} km</span>`;
let next=null;
for(const c of ROUTE) if(c.cp&&!es.passedCP.has(c.km)&&c.km>es.km){ next=c; break; }
setT("hud-nextcp", next? `${next.name.replace(/\s*\(CS\d\)/,"")} <span class="num">${(next.km-es.km).toFixed(0)}<span class="u">km</span></span>` : "GOAL Victoria Park <span class=\"num\">"+(TOTAL_KM-es.km).toFixed(0)+"<span class=\"u\">km</span></span>", true);
const ccEl=document.getElementById("hud-csclose");
if(next&&P.mode==="race"){
const closeAbs=csCloseAbs(next.km);
const rem=closeAbs-((es.day-1)*24+es.hour);
ccEl.textContent=`Close ${fmtAbsH(closeAbs)} ― 残り ${fmtDur(rem)}`;
ccEl.style.color= rem<0?"#d23a2e": rem<1?"#e2b21f":"#8b9097";
if(rem<0&&!es.radioCd["closed"+next.km]){ es.radioCd["closed"+next.km]=true;
Radio.push(`${next.name} のクローズ時刻を超過しました。公式記録外走行となります。`); }
} else ccEl.textContent="";
if(Engine.gridWait&&Engine.gridWait()){ const sec=Math.max(0,(es.gridStartH-es.hour)*3600), hm=es.gridStartH;
 ccEl.textContent=`発進待ち P${es.grid} ― ${String(Math.floor(hm)).padStart(2,"0")}:${String(Math.round(hm%1*60)).padStart(2,"0")} まで ${Math.floor(sec/60)}:${String(Math.floor(sec%60)).padStart(2,"0")}`; ccEl.style.color="#e2b21f"; }
document.getElementById("hud-limit").textContent=speedLimitAt(es.km);
document.getElementById("hud-speed").textContent=Math.round(es.v*3.6);
{ const g=document.getElementById("hud-gear"); if(g){ g.textContent=es.gear==="R"?"R":"D"; g.style.color=es.gear==="R"?"#d23a2e":"#f26b1d"; } }
const tsp=document.getElementById("touch-speed");
if(tsp&&!document.getElementById("touch-ui").classList.contains("hidden")){
tsp.textContent=Math.round(es.v*3.6);
document.getElementById("touch-thr").textContent=`スロットル ${Math.round(es.throttleSet*100)}%`;
}
const socP=es.soc*100;
document.getElementById("hud-socpct").textContent=socP.toFixed(1);
const sb=document.getElementById("hud-socbar");
sb.style.width=socP+"%";
sb.style.background= socP>40?"#f26b1d": socP>15?"#e2b21f":"#d23a2e";
document.getElementById("hud-wh").textContent= P.infiniteBattery?"∞ Wh":(es.soc*P.batteryWh).toFixed(0)+" Wh";
setT("hud-bms", es.disconnected?"🔌 結線 OFF": (es.bmsOn&&es.soc<=0.05)?"⚠ BMS 出力制限":"");
document.getElementById("hud-volt").textContent=(es.lastVterm!=null?es.lastVterm:VOC(es.soc)).toFixed(1)+" V";
const bb=document.getElementById("bms-btn");
setT(bb,es.bmsOn?"🛡 BMS ON":"⚠ BMS OFF");
bb.style.borderColor=es.bmsOn?"":"#d23a2e";
const pb=document.getElementById("power-btn");
setT(pb,es.powerMode?"⚡ POWER (P)":"🍃 ECO (P)");
pb.style.borderColor=es.powerMode?"#f26b1d":"";
document.getElementById("hud-avg").textContent=(es.drivingHours>0.02?(es.km/es.drivingHours).toFixed(1):"―")+" km/h";
const telem=!(es.fault&&es.fault.type==="telemetry");
const dash="― ―";
document.getElementById("hud-solar").textContent=telem?es.lastSolar.toFixed(0)+" W":dash;
document.getElementById("hud-amp").textContent=telem?es.lastAmp.toFixed(1)+" A":dash;
document.getElementById("hud-motorw").textContent=telem?(es.lastMotorW||0).toFixed(0)+" W":dash;
document.getElementById("hud-ibat").textContent=telem?es.lastIbat.toFixed(1)+" A":dash;
document.getElementById("hud-ah").textContent=telem?es.ahUsed.toFixed(2)+" Ah":dash;
const net=document.getElementById("hud-net");
net.innerHTML=telem?((es.lastNet>0?"−":"+")+Math.abs(es.lastNet).toFixed(0)+'<span class="u">W</span>'):dash;
net.style.color=es.lastNet>0?"#d23a2e":"#5cb85c";
document.getElementById("hud-tcell").textContent=telem?es.lastTcell.toFixed(0)+"°C":dash;
const tb=document.getElementById("hud-tbat");
tb.textContent=telem&&es.Tbat!=null?es.Tbat.toFixed(1)+"°C":dash;
tb.style.color=es.Tbat>55?"#d23a2e":es.Tbat>45?"#e2b21f":"";
document.getElementById("hud-wind").innerHTML=`${es.windSpeed.toFixed(1)} m/s`;
const prof=profileAt(es.km);
document.getElementById("hud-elev").textContent=prof.elev.toFixed(0)+" m";
document.getElementById("hud-slope").textContent=(Math.tan(Engine.st&&Engine.st.physSlope!=null?Engine.st.physSlope:View.carSlope)*100).toFixed(1)+" %";
document.getElementById("hud-temp").textContent=(es.Tamb||30).toFixed(0)+"°C / ρ"+(es.lastRho||1.17).toFixed(3);
document.getElementById("hud-geff").textContent=es.lastGeff.toFixed(0)+" W/m²";
if(P.mode==="race"&&es.teams){
const rank= Engine.gridWait&&Engine.gridWait()? es.grid : 1+es.teams.filter(tm=>tm.km>es.km||(tm.km===es.km&&tm.status!=="pre"&&es.v<0.5)).length;   // 発進前はグリッド順
setT("hud-pos",`P${rank}<span class="u">/ ${es.teams.length+1}</span>`,true);
} else setT("hud-pos","―");
setT("hud-weather", es.weather? (es.weather.type==="squall"?"🌧 スコール":"☁ 曇天") : "☀ 快晴");
document.getElementById("hud-thr-pct").textContent=Math.round(es.throttleSet*100)+"%";
document.getElementById("hud-throttle").style.width=(es.throttleSet*100)+"%";
const bk=Math.max(es.brakePhys,es.brakeRegen);
document.getElementById("hud-brake").style.width=(bk*100)+"%";
setT("hud-brake-kind", es.brakeRegen>0.1?"回生": es.brakePhys>0.1?"物理":"");
const ov=document.getElementById("stop-overlay");
const showTilt=(es.stopTimer>0||es.camp||StopMenu.mode==="charge");
if(showTilt&&!(typeof Crew!=="undefined"&&Crew.busy()&&Crew.phase==="outside")){   // 車外を歩いている間は出さない
ov.classList.remove("hidden"); applyStopFold();
const kindTitle={cp:"🛑 CONTROL STOP ― "+(es.cpName||""),tire:"🛞 タイヤ交換中",check:"🔍 機器チェック中"}[es.stopKind], stT=document.getElementById("stop-title");
document.getElementById("tilt-slider").disabled=!!es.tiltLocked;
if(es.stopTimer>0){
setT(stT,kindTitle||"STOP");
const mm=Math.floor(es.stopTimer/60), ss=Math.floor(es.stopTimer%60);
document.getElementById("stop-timer").textContent=`${mm}:${String(ss).padStart(2,"0")}`;
document.getElementById("stop-desc").textContent= es.stopKind==="cp" ? `30分間の強制点検・ティルト充電中(角度${es.tiltDeg}°決定済み)。終了後は自走で道路へ復帰。` : "";
document.getElementById("stop-resume").style.display="none";
document.getElementById("stop-skip").style.display="";
} else if(StopMenu.mode==="charge"){
setT(stT,"☀ ティルト充電中");
document.getElementById("stop-timer").textContent=`Day${es.day} ${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
setT("stop-desc",Engine.chargingAllowed()?"充電許可時間帯です。":"⚠ 許可時間外");
document.getElementById("stop-resume").style.display="";
document.getElementById("stop-skip").style.display="none";
} else {
setT(stT, es.disconnected?"🌙 OVERNIGHT ― バッテリー結線OFF":"🌙 OVERNIGHT CAMP ― ティルト充電");
document.getElementById("stop-timer").textContent=`Day${es.day} ${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
document.getElementById("stop-desc").textContent=`翌朝 ${Engine.raceStartHour().toFixed(2).replace(".50",":30").replace(".00",":00").replace(".17",":10")} スタート`;
document.getElementById("stop-resume").style.display="none";
document.getElementById("stop-skip").style.display="";
}
document.getElementById("tilt-watt").textContent=es.lastSolar.toFixed(0);
} else { ov.classList.add("hidden"); ov.classList.remove("flex"); }
if(P.mode==="event"){
const rem=Math.max(0,EVENT_DURATION-eventElapsed);
document.getElementById("event-timer").textContent=`${Math.floor(rem/60)}:${String(Math.floor(rem%60)).padStart(2,"0")}`;
document.getElementById("event-score").textContent=eventScore().toFixed(0);
}
}
function eventScore(){
const es=Engine.st;
return es.km*10 + es.soc*200 + (es.whGen*0.05);
}
function showResult(){
const es=Engine.st;
running=false;
Snd.update(0,0,false);
show("result-screen",true);
const title=document.getElementById("result-title");
const body=document.getElementById("result-body");
const rows=[];
if(es.crashed){
title.textContent="💥 DNF ― 事故によるリタイア";
rows.push(["原因",es.crashReason]);
rows.push(["到達距離",es.km.toFixed(1)+" km"]);
rows.push(["","安全第一。速度と車間・路肩の障害物に注意しよう。"]);
} else if(es.fire){
title.textContent="🔥 DNF ― 車両炎上";
rows.push(["原因",es.fireReason]);
rows.push(["到達距離",es.km.toFixed(1)+" km"]);
rows.push(["","安全第一。原因を分析して次のレースへ活かそう。"]);
} else if(P.mode==="event"){
title.textContent="🎪 TIME UP!";
const stp=MODE_CFG.event.stamps.find(x=>es.km>=x[0]);
rows.push(["STAMP",`<span style="color:${stp[2]};font-size:2.2rem;font-weight:900">${stp[1]}</span>`]);
rows.push(["🏁 走行距離", es.km.toFixed(2)+" km (金2.0 / 銀1.4)"]);
rows.push(["🔋 残バッテリー", (es.soc*100).toFixed(1)+" %"]);
rows.push(["⭐ スコア", "<span class='text-amber-300 text-2xl font-black'>"+eventScore().toFixed(0)+"</span>"]);
} else if(es.trailered){
title.textContent="🚚 トレーラー輸送…";
rows.push(["", "Port Augusta 11:00デッドラインを超過。"]);
rows.push(["", "ソーラーフィニッシュの権利を失いました。"]);
rows.push(["到達距離", es.km.toFixed(0)+" km"]);
} else {
title.textContent="🏆 VICTORIA PARK FINISH!";
const h=Math.floor(es.hour), m=Math.floor(es.hour%1*60);
rows.push(["ゴール", `Day${es.day} ${h}:${String(m).padStart(2,"0")}`]);
rows.push(["実走行時間", es.drivingHours.toFixed(1)+" h"]);
rows.push(["平均速度", (TOTAL_KM/Math.max(es.drivingHours,0.1)).toFixed(1)+" km/h"]);
rows.push(["総消費", (es.whUsed/1000).toFixed(1)+" kWh / "+es.ahUsed.toFixed(1)+" Ah"]);
rows.push(["総発電", (es.whGen/1000).toFixed(1)+" kWh"]);
rows.push(["電費", (es.whUsed/TOTAL_KM).toFixed(1)+" Wh/km"]);
}
body.innerHTML=rows.map(r=>`<div class="kv"><span>${r[0]}</span><span>${r[1]}</span></div>`).join("");
}
