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
function buildSetupUI(){
const sc=document.getElementById("shape-cards"); sc.innerHTML="";
for(const k in BODY_SHAPES){ const s=BODY_SHAPES[k];
sc.innerHTML+=`<div class="card-select ${k===P.shape?'active':''}" data-shape="${k}" onclick="selectShape('${k}')">
<div class="font-bold text-sm text-cyan-200">${s.name}</div>
<div class="text-[10px] text-cyan-100/50">${s.desc}</div>
<div class="text-[10px] mono text-cyan-400 mt-1">Cd ${s.Cd} / A ${s.frontal}m²</div></div>`;
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
["aiCount","AIチーム数 (0-20)",1],["aiSpdMin","AI速度min km/h",1],
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
onchange="PRO[this.dataset.pro]=parseFloat(this.value)"></label>`).join("")
+ `<label class="flex items-center gap-2 col-span-2 md:col-span-4 text-amber-300 mt-1">
<input type="checkbox" ${PRO.noSpeedCap?"checked":""} onchange="PRO.noSpeedCap=this.checked?1:0" style="width:15px;height:15px">
🚀 最高速リミッター解除(逆起電力・出力一定制限を無視 ― 非現実的な伸び)</label>`;
}
function refreshSliderLabel(id){
const s=SLIDERS.find(x=>x.id===id);
const el=document.getElementById("val-"+id); if(!el) return;
el.textContent = s.pct ? (P[id]*100).toFixed(1)+" %" : P[id]+(s.unit?" "+s.unit:"");
}
function onSlider(id,v){ P[id]=parseFloat(v); refreshSliderLabel(id); refreshDerived(); }
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
document.querySelectorAll("[data-shape]").forEach(e=>e.classList.toggle("active",e.dataset.shape===k));
}
function selectPanel(k){
P.panel=k; P.cellEff=PANEL_TYPES[k].eff;
document.getElementById("sl-cellEff").value=P.cellEff; refreshSliderLabel("cellEff");
document.querySelectorAll("[data-panel]").forEach(e=>e.classList.toggle("active",e.dataset.panel===k));
}
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
fig8:"8の字走行 ― 内円半径6m・コース幅5mの8の字を片側9秒未満・合計18秒未満(規則2.19.1)。コースアウトは無効。",
};
function selectTest(k){
P.testKind=k; selectMode('test');
document.getElementById("test-desc").textContent="選択中: "+TEST_DESC[k];
document.querySelectorAll("[data-test]").forEach(b=>b.style.boxShadow=b.dataset.test===k?"0 0 14px rgba(52,211,153,.8)":"");
}
