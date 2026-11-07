"use strict";
const SLIDERS = [
{ id:"arrayArea",  label:"太陽光パネル面積", min:2, max:6, step:0.1, unit:"m²" },
{ id:"cellEff",    label:"セル変換効率",     min:0.15, max:0.35, step:0.005, unit:"", pct:true },
{ id:"batteryWh",  label:"バッテリー容量",   min:1000, max:10000, step:100, unit:"Wh" },
{ id:"Cd",         label:"空気抵抗係数 Cd",  min:0.05, max:0.30, step:0.005, unit:"" },
{ id:"frontal",    label:"前面投影面積",     min:0.6, max:2.5, step:0.05, unit:"m²" },
{ id:"massDry",    label:"車体乾燥重量",     min:100, max:400, step:5, unit:"kg" },
{ id:"massDriver", label:"ドライバー体重",   min:40, max:120, step:1, unit:"kg" },
{ id:"Crr",        label:"転がり抵抗係数 Crr", min:0.0015, max:0.015, step:0.0005, unit:"" },
{ id:"motorMaxA",  label:"モーター最大電流", min:10, max:150, step:1, unit:"A" },
{ id:"regenStrength", label:"回生強度",      min:0, max:1, step:0.05, unit:"", pct:true },
{ id:"mpptEff",    label:"MPPT効率",        min:0.90, max:0.995, step:0.005, unit:"", pct:true },
{ id:"auxW",       label:"補機消費電力",     min:10, max:150, step:5, unit:"W" },
];
/* 実車諸元の読み込み状態 (手元で開いたときだけ表示。公開サイトでは出さない) */
function vehStatusHtml(){
 if(VEH.active&&VEH.rev<VEH.revNeed) return '<div class="text-[10px] text-rose-300 mt-1">○ vehicle-private.js が旧版です (rev '+VEH.rev+' / 必要 rev '+VEH.revNeed+')。最新版に置き換えてください</div>';
 if(VEH.active) return '<div class="text-[10px] text-amber-300 mt-1">● 実車諸元を使用中 (rev '+VEH.rev+')</div>';
 const local=location.protocol==="file:"||/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
 if(!local) return '';
 const why= window.__vehPrivMissing? 'js/data/vehicle-private.js が見つかりません' : 'vehicle-private.js は読めましたが VEHICLE_PRIVATE がありません';
 return '<div class="text-[10px] text-rose-300 mt-1">○ 実車諸元: 未読込 ('+why+')</div>';
}
function buildSetupUI(){
const sc=document.getElementById("shape-cards"); sc.innerHTML="";
for(const k in BODY_SHAPES){ const s=BODY_SHAPES[k];
sc.innerHTML+=`<div class="card-select ${k===P.shape?'active':''}" data-shape="${k}" onclick="selectShape('${k}')">
<div class="font-bold text-sm text-cyan-200">${s.name}</div>
<div class="text-[10px] text-cyan-100/50">${s.desc}</div>
<div class="text-[10px] mono text-cyan-400 mt-1">Cd ${s.Cd} / A ${s.frontal}m²</div>${k==="wadai"?vehStatusHtml():''}</div>`;
}
const pc=document.getElementById("panel-cards"); pc.innerHTML="";
for(const k in PANEL_TYPES){ const s=PANEL_TYPES[k];
pc.innerHTML+=`<div class="card-select ${k===P.panel?'active':''}" data-panel="${k}" onclick="selectPanel('${k}')">
<div class="font-bold text-sm text-cyan-200">${s.name}</div>
<div class="text-[10px] text-cyan-100/50">${s.desc}</div>
<div class="text-[10px] mono text-cyan-400 mt-1">効率 ${(s.eff*100).toFixed(0)}%</div></div>`;
}
const ps=document.getElementById("param-sliders"); ps.innerHTML="";
for(const s of SLIDERS){
ps.innerHTML+=`<div>
<div class="flex justify-between text-xs"><span>${s.label}</span>
<span class="mono text-cyan-300" id="val-${s.id}"></span></div>
<input type="range" id="sl-${s.id}" min="${s.min}" max="${s.max}" step="${s.step}" value="${P[s.id]}"
oninput="onSlider('${s.id}',this.value)"></div>`;
}
SLIDERS.forEach(s=>refreshSliderLabel(s.id));
buildProUI();
refreshDerived();
}
const PRO_FIELDS=[
["startSoc","初期SOC (0-1)",0.05],["vFull","満充電電圧 V",0.5],["vEmpty","空電圧 V",0.5],
["rInternal","内部抵抗 Ω (25°C)",0.01],["rWinding","巻線抵抗 Ω",0.01],
["ironK1","鉄損 k1 W/(rad/s)",0.01],["ironK2","鉄損 k2",0.0001],["ctrlW","コントローラ待機損 W",1],
["battCth","電池熱容量 J/K",1000],["battUA","電池放熱 W/K",0.5],["albedo","地面アルベド",0.01],
["kt","ECOトルク定数 N/A",0.05],["ktPower","PWRトルク定数 N/A",0.05],
["noLoadRpm","ECO無負荷rpm",10],["rpmPower","PWR無負荷rpm",10],
["tireR","タイヤ半径 m",0.005],["mRot","回転慣性相当 kg",0.5],
["brakeMu","ブレーキμ",0.01],["regenEff","回生インバータ効率",0.01],
["airRho","空気密度 kg/m³ (0=自動)",0.01],["tempOffset","気温補正 °C",0.5],
["windBase","基準風速 m/s (10m高)",0.5],["solarScale","日射スケール",0.01],
["cloudFactor","悪天候係数",0.1],["dayOfYear","開始日(通日)",1],
["aiCount","AIチーム数 (0-25)",1],["aiSpdMin","AI速度min km/h",1],
["aiSpdMax","AI速度max km/h",1],["aiRetire","AIリタイア率",0.05],
["trainPerHour","ロードトレイン台/h",0.5],["faultScale","故障確率係数",0.1],
["gridRisk","グリッドリスク係数",0.1],
];
function buildProUI(){
const g=document.getElementById("pro-grid"); if(!g) return;
g.innerHTML=PRO_FIELDS.map(([k,label,step])=>
`<label class="flex justify-between items-center gap-1"><span class="text-cyan-100/60">${label}</span>
<input type="number" step="${step}" value="${PRO[k]}" data-pro="${k}"
class="bg-slate-900 border border-cyan-900 rounded px-1 py-0.5 w-20 text-right mono"
onchange="PRO[this.dataset.pro]=parseFloat(this.value);Settings.save()"></label>`).join("")
+ `<label class="flex items-center gap-2 col-span-2 md:col-span-4 text-amber-300 mt-1">
<input type="checkbox" ${PRO.noSpeedCap?"checked":""} onchange="PRO.noSpeedCap=this.checked?1:0;Settings.save()" style="width:15px;height:15px">
🚀 最高速リミッター解除(逆起電力・出力一定制限を無視 ― 非現実的な伸び)</label>`;
}
function refreshSliderLabel(id){
const s=SLIDERS.find(x=>x.id===id);
const el=document.getElementById("val-"+id); if(!el) return;
el.textContent = s.pct ? (P[id]*100).toFixed(1)+" %" : P[id]+(s.unit?" "+s.unit:"");
if(id==="batteryWh"){ const over=P.batteryWh>REG.maxWh; el.textContent+=over?" ⚠ 11 MJ (3056 Wh) 超":""; el.style.color=over?"#fb7185":""; }
if(id==="arrayArea"){ const over=P.arrayArea>REG.maxArea; el.textContent+=over?" ⚠ 6 m² 超":""; el.style.color=over?"#fb7185":""; }
}
function onSlider(id,v){ P[id]=parseFloat(v); refreshSliderLabel(id); refreshDerived(); Settings.save(); }
function refreshDerived(){
document.getElementById("disp-cda").textContent=(P.Cd*P.frontal).toFixed(3);
document.getElementById("disp-froll").textContent=(P.Crr*massTotal()*9.81).toFixed(1);
document.getElementById("disp-ballast").textContent=massBallast().toFixed(1);
document.getElementById("disp-ah").textContent=(P.batteryWh/V_AVG()).toFixed(1);
}
function selectShape(k){
P.shape=k; const s=BODY_SHAPES[k];
P.Cd=s.Cd; P.frontal=s.frontal;
document.getElementById("sl-Cd").value=s.Cd; document.getElementById("sl-frontal").value=s.frontal;
refreshSliderLabel("Cd"); refreshSliderLabel("frontal"); refreshDerived();
document.querySelectorAll("[data-shape]").forEach(e=>e.classList.toggle("active",e.dataset.shape===k)); Settings.save();
}
function selectPanel(k){
P.panel=k; P.cellEff=PANEL_TYPES[k].eff;
document.getElementById("sl-cellEff").value=P.cellEff; refreshSliderLabel("cellEff");
document.querySelectorAll("[data-panel]").forEach(e=>e.classList.toggle("active",e.dataset.panel===k)); Settings.save();
}
function setEventLevel(lv){ EventGame.level=lv; document.getElementById("ev-lv-kid").classList.toggle("on",lv==="kid"); document.getElementById("ev-lv-adult").classList.toggle("on",lv==="adult"); Settings.save(); }
function setEventPractice(on){ EventGame.practice=!!on; document.getElementById("ev-pr-on").classList.toggle("on",!!on); document.getElementById("ev-pr-off").classList.toggle("on",!on); Settings.save(); }
function setEventCourse(c){ EventGame.course=c; document.getElementById("ev-co-aus").classList.toggle("on",c==="aus"); document.getElementById("ev-co-hv").classList.toggle("on",c==="hv"); Settings.save(); }
function selectMode(m){
P.mode=m;
document.getElementById("mode-race").classList.toggle("active",m==="race");
document.getElementById("mode-event").classList.toggle("active",m==="event");
document.getElementById("mode-test").classList.toggle("active",m==="test");
}
P.testKind="circuit";
const TEST_DESC={
circuit:"サーキット予選 ― 優秀チームは2分20秒台前半。ベストラップでグリッドが決まる。",
slalom:"スラローム ― 18m間隔のパイロン7本・全長126mを11.5秒未満で通過(規則2.19.2)。パイロン接触は失格。",
brake:"制動テスト ― 40km/h以上でラインを通過し、14m以内に完全停止できれば合格。",
combo:"スラローム+制動(連続) ― ドラッグストリップ北東端から進入し、スラローム通過後そのまま加速して制動テスト。両方合格で通過。",
fig8:"8の字走行 ― 内円半径6m・コース幅5mの8の字を片側9秒未満・合計18秒未満(規則2.19.1)。コースアウトは無効。",
};
function selectTest(k){
P.testKind=k; selectMode('test');
document.getElementById("test-desc").textContent=TEST_DESC[k];
document.querySelectorAll("[data-test]").forEach(b=>b.classList.toggle("on",b.dataset.test===k)); Settings.save();
}
/* <select> を区切りボタンで操作する (値は select に書き戻すので読み取り側はそのまま) */
function segFromSelect(selId,boxId,label){
 const sel=document.getElementById(selId), box=document.getElementById(boxId); if(!sel||!box) return;
 box.innerHTML=""; for(const o of sel.options){ const b=document.createElement("button"); b.type="button"; b.textContent=label?label(o):o.textContent; b.title=o.textContent; b.dataset.v=o.value;
  b.onclick=()=>{ sel.value=o.value; sel.dispatchEvent(new Event("change")); if(selId==="time-scale"||selId==="log-step"||selId==="gfx"||selId==="ffb"||selId==="tts"||selId==="fc-err") Settings.save(); box.querySelectorAll("button").forEach(x=>x.classList.toggle("on",x.dataset.v===sel.value)); };
  if(o.value===sel.value) b.classList.add("on"); box.appendChild(b); }
}
/* 予選ベスト (レースのグリッド) の表示とリセット */
function refreshQuali(){
 const el=document.getElementById("quali-info"); if(!el) return;
 let b=null; try{ b=parseFloat(localStorage.getItem(Engine.QUALI_KEY)); }catch(e){}
 const n=(PRO.aiCount|0)+1;
 el.innerHTML= b>0? `予選ベスト <span class="num">${fmtLap(b)}</span> → グリッド <span class="num">P${clamp(Engine.gridOfLap(b),1,n)}</span>` : `予選未計測 → グリッド <span class="num">P${Math.min(Engine.DEFAULT_GRID,n)}</span>`;
 const btn=document.getElementById("quali-reset"); if(btn) btn.disabled=!(b>0), btn.style.opacity=b>0?1:.4;
}
function resetQuali(){ if(!confirm("予選のベストラップを消去します。レースのグリッドは P"+Engine.DEFAULT_GRID+" に戻ります。よろしいですか？")) return; try{ localStorage.removeItem(Engine.QUALI_KEY); }catch(e){} refreshQuali(); }
/* ---- 設定の保存 (この端末のブラウザ): 既定値から変えた項目だけを保存し、起動時に戻す ---- */
const Settings={
 KEY:"bwsc_settings", PKEYS:null, def:null,
 keys(){ return this.PKEYS||(this.PKEYS=["shape","panel","infiniteBattery","crewProc","uiMode","logStepM","gfx","realWeather","ffb","ffbInv","ffbTune","orders","showFps","tts","fcErr",...SLIDERS.map(s=>s.id)]); },
 snapshot(){ const o={P:{},PRO:{}}; for(const k of this.keys()) o.P[k]=P[k]; for(const [k] of PRO_FIELDS) o.PRO[k]=PRO[k]; o.PRO.noSpeedCap=PRO.noSpeedCap;
  o.ts=document.getElementById("time-scale").value; o.evCourse=EventGame.course; o.evLevel=EventGame.level; o.evPractice=EventGame.practice; o.testKind=P.testKind; return o; },
 load(){
  this.def=this.snapshot();
  let d=null; try{ d=JSON.parse(localStorage.getItem(this.KEY)||"null"); }catch(e){}
  if(!d||typeof d!=="object") return;
  const num=(v)=>typeof v==="number"&&Number.isFinite(v);
  for(const k of this.keys()) if(d.P&&k in d.P){ const v=d.P[k], t=typeof this.def.P[k]; if(t==="number"?num(v):typeof v===t) P[k]=v; }
  if(!(P.shape in BODY_SHAPES)) P.shape=this.def.P.shape; if(!(P.panel in PANEL_TYPES)) P.panel=this.def.P.panel; if(P.uiMode!=="pc"&&P.uiMode!=="mobile") P.uiMode=this.def.P.uiMode;
  for(const k in this.def.PRO) if(d.PRO&&num(d.PRO[k])) PRO[k]=d.PRO[k];
  const ts=document.getElementById("time-scale"); if(d.ts&&[...ts.options].some(o=>o.value===d.ts)) ts.value=d.ts;
  if(d.evCourse==="aus"||d.evCourse==="hv") EventGame.course=d.evCourse; if(typeof d.evPractice==="boolean") EventGame.practice=d.evPractice; if(d.evLevel==="kid"||d.evLevel==="adult") EventGame.level=d.evLevel;
  if(d.testKind in TEST_DESC) P.testKind=d.testKind;
  { const gs=document.getElementById("gfx"); if(![...gs.options].some(o=>o.value===P.gfx)) P.gfx="auto"; gs.value=P.gfx; }
  { const fe=document.getElementById("fc-err"); if(fe){ if(![...fe.options].some(o=>o.value===P.fcErr)) P.fcErr="mid"; fe.value=P.fcErr; } }
  { const ts=document.getElementById("tts"); if(ts){ if(![...ts.options].some(o=>o.value===P.tts)) P.tts="orders"; ts.value=P.tts; } }
  { const fs=document.getElementById("ffb"); if(fs){ if(![...fs.options].some(o=>o.value===P.ffb)) P.ffb="mid"; fs.value=P.ffb; } }
  { const ls=document.getElementById("log-step"); if(![...ls.options].some(o=>+o.value===P.logStepM)) P.logStepM=this.def.P.logStepM; ls.value=String(P.logStepM); }
  { const rw=document.getElementById("real-wx"); if(rw) rw.checked=P.realWeather!==false; }
  { const od=document.getElementById("orders-on"); if(od) od.checked=P.orders!==false; }
  { const fp=document.getElementById("fps-on"); if(fp) fp.checked=!!P.showFps; }
  document.getElementById("inf-batt").checked=!!P.infiniteBattery; document.getElementById("crew-proc").checked=!!P.crewProc;
  if(P.testKind!=="circuit"){ document.getElementById("test-desc").textContent=TEST_DESC[P.testKind]; document.querySelectorAll("[data-test]").forEach(b=>b.classList.toggle("on",b.dataset.test===P.testKind)); }
 },
 save(){ if(!this.def) return; const c=this.snapshot(), o={P:{},PRO:{}};
  for(const k in c.P) if(c.P[k]!==this.def.P[k]) o.P[k]=c.P[k];
  for(const k in c.PRO) if(c.PRO[k]!==this.def.PRO[k]) o.PRO[k]=c.PRO[k];
  for(const k of ["ts","evCourse","evLevel","evPractice","testKind"]) if(c[k]!==this.def[k]) o[k]=c[k];
  try{ localStorage.setItem(this.KEY,JSON.stringify(o)); }catch(e){}
  this.badge(); },
 changed(){ try{ const d=JSON.parse(localStorage.getItem(this.KEY)||"{}"); return Object.keys(d.P||{}).length+Object.keys(d.PRO||{}).length+["ts","evCourse","evLevel","evPractice","testKind"].filter(k=>k in d).length; }catch(e){ return 0; } },
 badge(){ const n=this.changed(), el=document.getElementById("settings-state"); if(el) el.textContent= n? `既定値から ${n} 項目を変更 (この端末に保存)` : "既定値"; const b=document.getElementById("settings-reset"); if(b){ b.disabled=!n; b.style.opacity=n?1:.4; } },
 reset(){ if(!confirm("車両・レース・オプションの設定を既定値に戻します。よろしいですか？")) return; try{ localStorage.removeItem(this.KEY); }catch(e){} location.reload(); },
};
/* ---- レース開始時にドライバーの名前を入れる (前回の名前を初期値に) ---- */
let DRIVER_NAMES=null;
const DrvDlg={
 open(){ if(P.mode!=="race"){ Fade.go(startGame); return; }
  let last=[]; try{ last=JSON.parse(localStorage.getItem("bwsc_drivers")||"[]"); }catch(e){}
  document.getElementById("drv-n1").value=last[0]||""; document.getElementById("drv-n2").value=last[1]||"";
  show("drv-dlg",true); setTimeout(()=>document.getElementById("drv-n1").focus(),50); },
 close(){ show("drv-dlg",false); },
 ok(){ const clean=(id,def)=>(document.getElementById(id).value||"").replace(/[<>&"'\\]/g,"").trim().slice(0,20)||def;
  DRIVER_NAMES=[clean("drv-n1","ドライバーA"),clean("drv-n2","ドライバーB")];
  try{ localStorage.setItem("bwsc_drivers",JSON.stringify(DRIVER_NAMES)); }catch(e){}
  this.close(); Fade.go(startGame); },
};
addEventListener("keydown",e=>{ const d=document.getElementById("drv-dlg"); if(!d||d.classList.contains("hidden")) return;
 if(e.key==="Enter"){ e.preventDefault(); DrvDlg.ok(); } else if(e.key==="Escape"){ e.preventDefault(); DrvDlg.close(); } });
