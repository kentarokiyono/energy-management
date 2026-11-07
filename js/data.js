"use strict";
const TOTAL_KM = RP_FINISH.km;   // Victoria Park (Route Notes 3026.92)
const ROUTE = [
{ name:"Darwin (Start)",       km:0,    elev:30,  lat:-12.463, lon:130.838, cp:false },
{ name:"Adelaide River",       km:112,  elev:60,  lat:-13.237, lon:131.106, cp:false },
{ name:"Hayes Creek Hill",     km:170,  elev:203, lat:-13.55,  lon:131.4,  cp:false },
{ name:"Pine Creek",           km:226,  elev:190, lat:-13.823, lon:131.835, cp:false },
{ name:"Katherine (CS1)",      km:322,  elev:108, lat:-14.465, lon:132.264, cp:true  },
{ name:"Mataranka",            km:420,  elev:130, lat:-14.923, lon:133.066, cp:false },
{ name:"Larrimah",             km:496,  elev:190, lat:-15.575, lon:133.214, cp:false },
{ name:"Daly Waters",          km:590,  elev:210, lat:-16.25,  lon:133.37, cp:false },
{ name:"Dunmarra (CS2)",       km:631,  elev:230, lat:-16.68,  lon:133.42, cp:true  },
{ name:"Elliott",              km:730,  elev:220, lat:-17.55,  lon:133.54, cp:false },
{ name:"Renner Springs",       km:824,  elev:300, lat:-18.32,  lon:133.80, cp:false },
{ name:"Tennant Creek (CS3)",  km:988,  elev:376, lat:-19.645, lon:134.191, cp:true },
{ name:"Wauchope",             km:1090, elev:400, lat:-20.64,  lon:134.22, cp:false },
{ name:"Barrow Creek (CS4)",   km:1212.3, elev:511, lat:-21.533, lon:133.889, cp:true },
{ name:"Ti Tree",              km:1300, elev:560, lat:-22.13,  lon:133.42, cp:false },
{ name:"Aileron",              km:1360, elev:640, lat:-22.64,  lon:133.35, cp:false },
{ name:"山岳サミット",           km:1430, elev:730, lat:-23.0,   lon:133.9,  cp:false },
{ name:"Alice Springs (CS5)",  km:1496, elev:547, lat:-23.698, lon:133.881, cp:true },
{ name:"Stuarts Well",         km:1586, elev:560, lat:-24.34,  lon:133.56, cp:false },
{ name:"Finke River",          km:1620, elev:470, lat:-24.60,  lon:133.40, cp:false },
{ name:"Erldunda (CS6)",       km:1694, elev:420, lat:-25.20,  lon:133.20, cp:true  },
{ name:"Kulgera",              km:1770, elev:520, lat:-25.84,  lon:133.30, cp:false },
{ name:"Marla",                km:1950, elev:330, lat:-27.30,  lon:133.62, cp:false },
{ name:"Cadney Park",          km:2030, elev:290, lat:-27.90,  lon:134.06, cp:false },
{ name:"Coober Pedy (CS7)",    km:2181, elev:220, lat:-29.014, lon:134.754, cp:true },
{ name:"Glendambo (CS8)",      km:2434.1, elev:150, lat:-30.975, lon:135.735, cp:true },
{ name:"Pimba",                km:2575, elev:140, lat:-31.25,  lon:136.80, cp:false },
{ name:"Port Augusta (CS9)",   km:2720.3, elev:10,  lat:-32.493, lon:137.763, cp:true },
{ name:"Port Pirie Jct",       km:2800, elev:20,  lat:-33.18,  lon:138.02, cp:false },
{ name:"Port Wakefield",       km:2898, elev:5,   lat:-34.19,  lon:138.15, cp:false },
{ name:"Gawler",               km:2991, elev:60,  lat:-34.60,  lon:138.74, cp:false },
{ name:"Adelaide Victoria Park (GOAL)", km:3026.92, elev:50, lat:-34.929, lon:138.601, cp:false },
];
const TOWNS = [0,112,226,322,420,496,631,732,824,988,1103,1212.3,1302,1361,1496,1583,1694,1768,1947,2028,2181,2434,2547,2720.5,2814,2897,2928,3026.92];
function townProx(km){ let d=1e9; for(const t of TOWNS) d=Math.min(d,Math.abs(km-t)); return d; }
function isCity(km){ return km<14 || km>2992; }
/* 速度制限・ランドマークは Route Notes 2025 (js/data/route-2025.js) から */
const SPEED_LIMITS=null;
function speedLimitAt(km){ return Route.limitAt(km); }
const _LM_KIND={signal:"signal",pedlight:"pedlight",bridge:"bridge",river:"river",grid:"grid",bay:"camp",services:"roadhouse",
 floodway:"floodway",rail:"rail",tower:"tower",solarfarm:"solarfarm",hwmarker:"hwmarker",distsign:"distsign",warn:"warn",
 otl_start:"otl",works:"works",gravel:"gravel"};
const LANDMARKS=RN_EVENTS.filter(e=>_LM_KIND[e.k]).map(e=>({km:e.km,t:_LM_KIND[e.k],n:e.t,v:e.v}));
const GRID_KMS=RN_EVENTS.filter(e=>e.k==="grid").map(e=>e.km);
const BODY_SHAPES = {
wadai:     { name:"和大型モノハル(YATA 61)", Cd:0.12, frontal:1.00, desc:"和歌山大学ソーラーカー「YATA」をプロシージャル再現。モノハル+中央キャノピー+ソーラーアレイ。" },
catamaran: { name:"カタマラン(双胴型)", Cd:0.11, frontal:0.95, desc:"近年の主流形状。" },
bullet:    { name:"バレット(弾丸型)", Cd:0.10, frontal:0.88, desc:"前面投影極小・Cd最小。" },
};
const PANEL_TYPES = {
si:   { name:"シリコン単結晶", eff:0.24, gamma:0.0040, desc:"標準的な高性能Si。温度係数-0.40%/K" },
perov:{ name:"ペロブスカイト・タンデム", eff:0.28, gamma:0.0030, desc:"次世代タンデム構造(実験的)" },
};
const P = {
mode:"race", shape:"wadai", panel:"si",
arrayArea:4.0, cellEff:0.24, mpptEff:0.98,
batteryWh:3027, Cd:0.12, frontal:1.00,
massDry:190, massDriver:68, Crr:0.004,
motorMaxA:48, regenStrength:0.5, auxW:35,
timeScale:60, infiniteBattery:false, crewProc:true, logStepM:50, gfx:"auto", realWeather:true, ffb:"mid", ffbInv:false,
uiMode:('ontouchstart' in window)?"mobile":"pc",
};
const PRO={
startSoc:1.0, vFull:107.5, vEmpty:75.0,
kt:4.3, noLoadRpm:900, ktPower:3.35, rpmPower:1060, tireR:0.26,
phaseMaxA:0 /* 0 = モーター最大電流の 2 倍 */, cAlpha:24000 /* N/rad, 3 輪合計 */, cdYawK:7,
mRot:8, brakeMu:0.55, regenEff:0.92, airRho:0, rInternal:0.18,
rWinding:0.12, ironK1:0.13, ironK2:0.00135, ctrlW:6, battCth:20000, battUA:4, albedo:0.28,
tempOffset:0, windBase:6, solarScale:1.0, cloudFactor:1.0, dayOfYear:236,
aiCount:25, aiSpdMin:58, aiSpdMax:103, aiRetire:0.5,
trainPerHour:3.5, faultScale:1.0, gridRisk:1.0,
noSpeedCap:0,
};

/* 2027 BWSC Event Regulations (Challenger): 2.4.2 太陽電池 6 m² 以下 / 2.5.2 蓄電 11 MJ 以下 */
const REG={maxArea:6, maxWh:11e6/3600};
const MODE_CFG={ event:{ duration:90, attractIdle:30, stamps:[[2.0,"🥇 GOLD","#fbbf24"],[1.4,"🥈 SILVER","#cbd5e1"],[0,"🥉 BRONZE","#d97706"]] }, race:{} };
