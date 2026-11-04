"use strict";
const TOTAL_KM = 3027;
const ROUTE = [
{ name:"Darwin (Start)",       km:0,    elev:30,  lat:-12.463, lon:130.838, cp:false },
{ name:"Adelaide River",       km:112,  elev:60,  lat:-13.237, lon:131.106, cp:false },
{ name:"Hayes Creek Hill",     km:170,  elev:203, lat:-13.55,  lon:131.4,  cp:false },
{ name:"Pine Creek",           km:226,  elev:190, lat:-13.823, lon:131.835, cp:false },
{ name:"Katherine (CS1)",      km:317,  elev:108, lat:-14.465, lon:132.264, cp:true  },
{ name:"Mataranka",            km:420,  elev:130, lat:-14.923, lon:133.066, cp:false },
{ name:"Larrimah",             km:496,  elev:190, lat:-15.575, lon:133.214, cp:false },
{ name:"Daly Waters",          km:590,  elev:210, lat:-16.25,  lon:133.37, cp:false },
{ name:"Dunmarra (CS2)",       km:633,  elev:230, lat:-16.68,  lon:133.42, cp:true  },
{ name:"Elliott",              km:730,  elev:220, lat:-17.55,  lon:133.54, cp:false },
{ name:"Renner Springs",       km:824,  elev:300, lat:-18.32,  lon:133.80, cp:false },
{ name:"Tennant Creek (CS3)",  km:975,  elev:376, lat:-19.645, lon:134.191, cp:true },
{ name:"Wauchope",             km:1090, elev:400, lat:-20.64,  lon:134.22, cp:false },
{ name:"Barrow Creek (CS4)",   km:1212, elev:511, lat:-21.533, lon:133.889, cp:true },
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
{ name:"Glendambo (CS8)",      km:2434, elev:150, lat:-30.975, lon:135.735, cp:true },
{ name:"Pimba",                km:2575, elev:140, lat:-31.25,  lon:136.80, cp:false },
{ name:"Port Augusta (CS9)",   km:2720, elev:10,  lat:-32.493, lon:137.763, cp:true },
{ name:"Port Pirie Jct",       km:2800, elev:20,  lat:-33.18,  lon:138.02, cp:false },
{ name:"Port Wakefield",       km:2898, elev:5,   lat:-34.19,  lon:138.15, cp:false },
{ name:"Gawler",               km:2991, elev:60,  lat:-34.60,  lon:138.74, cp:false },
{ name:"Adelaide Victoria Park (GOAL)", km:3027, elev:50, lat:-34.929, lon:138.601, cp:false },
];
const TOWNS = [0,112,317,633,824,975,1212,1360,1496,1694,2181,2434,2720,3027];
function townProx(km){ let d=1e9; for(const t of TOWNS) d=Math.min(d,Math.abs(km-t)); return d; }
function isCity(km){ return km<14 || km>2995; }
const SPEED_LIMITS=[[0,60],[2,80],[5,100],[18.5,80],[21,100],[40.6,110],[51,130],[82,80],[87,130],
[110,100],[114.5,130],[192,80],[193,130],[304,110],[311.6,80],[313,60],[323,100],[333,130],
[419,80],[420,50],[423,100],[425,130],[495,80],[497,130],[534,100],[549,80],[588,130],
[629,80],[632,130],[729,80],[731,60],[737,130],[822,80],[884,100],[914,130],[980,100],[984,50],
[990,100],[993,130],[1100,100],[1104,130],[1211,100],[1212,80],[1213,130],[1300,100],[1301,60],
[1304,130],[1360,80],[1362,130],[1473,110],[1488,80],[1492,60],[1500,70],[1504,100],[1517,130],
[1585,80],[1587,130],[1691,80],[1695,130],[1789,110],[2181,50],[2182,110],[2431,60],[2437,110],
[2573,60],[2577,110],[2713,60],[2717,40],[2721,60],[2724,80],[2745,110],[2780,60],[2781,110],
[2897,60],[2899,110],[2927,50],[2932,110],[2992,80],[2998,90],[3007,80],[3013.7,70],[3015.9,60]];
function speedLimitAt(km){
let lim=60;
for(const [k,v] of SPEED_LIMITS){ if(km>=k) lim=v; else break; }
return lim;
}
const LANDMARKS=[
{km:0.30,t:"signal",n:"Cavanagh St"},{km:0.56,t:"signal",n:"McMinn St"},{km:1.03,t:"signal",n:"Garramilla Blvd"},
{km:4.7,t:"signal",n:"Bennison Rd"},{km:6.2,t:"signal",n:"Bowen St"},{km:12.2,t:"bridge",n:"Berrimah Rd Bridge"},
{km:14.9,t:"signal",n:"Tivendale Rd"},{km:19.9,t:"signal",n:"Tulagi Rd"},{km:24,t:"signal",n:"Howard Springs"},
{km:29,t:"signal",n:"Coolalinga"},{km:34,t:"signal",n:"Arnhem Hwy"},{km:38.7,t:"river",n:"Elizabeth River"},
{km:39.6,t:"signal",n:"Jenkins Rd"},{km:66,t:"river",n:"Manton River"},{km:86,t:"river",n:"Coomalie Creek"},
{km:105,t:"river",n:"Stappleton Creek"},{km:112,t:"roadhouse",n:"Adelaide River"},{km:117,t:"river",n:"Burrel Creek"},
{km:146,t:"camp",n:"Bridge Creek Rest Area"},{km:252,t:"river",n:"Cullen River"},{km:258,t:"river",n:"Fergusson River"},
{km:305,t:"bridge",n:"Railway Bridge"},{km:314,t:"river",n:"Katherine River"},{km:315,t:"signal",n:"Katherine"},
{km:316,t:"signal",n:"Katherine"},{km:358,t:"river",n:"King River"},{km:362,t:"camp",n:"Rest Area (Free Camp)"},
{km:597,t:"camp",n:"Rest Area"},{km:696,t:"river",n:"Newcastle Creek"},{km:802,t:"camp",n:"Flat Camp Area"},
{km:824,t:"roadhouse",n:"Renner Springs"},{km:841,t:"camp",n:"Cattle Yards Camp"},{km:861,t:"river",n:"Tomkinson Creek"},
{km:895,t:"river",n:"Morphett Creek"},{km:913,t:"camp",n:"Attack Creek Rest Area"},{km:942,t:"river",n:"Phillip Creek"},
{km:974,t:"river",n:"Tennant Creek"},{km:1030,t:"river",n:"Edinburgh Creek"},{km:1064,t:"river",n:"McLaren Creek"},
{km:1082,t:"river",n:"Dixon Creek"},{km:1089,t:"camp",n:"Devil's Marbles"},{km:1213,t:"river",n:"Barrow Creek"},
{km:1360,t:"roadhouse",n:"Aileron Roadhouse"},{km:1488,t:"river",n:"Charles River (Geoff Mott Br)"},
{km:1494,t:"signal",n:"Wills Tce"},{km:1495,t:"signal",n:"Stott Tce"},{km:1507,t:"bridge",n:"Railway Overpass"},
{km:1510,t:"river",n:"Roe Creek"},{km:1538,t:"river",n:"Orange Creek"},{km:1588,t:"river",n:"Hugh River"},
{km:1617,t:"camp",n:"Finke Rest Area"},{km:1620,t:"river",n:"Finke River"},{km:1644,t:"river",n:"Palmer River"},
{km:1755,t:"camp",n:"Kalamurta Creek Camp"},{km:1827,t:"river",n:"Marryat Creek"},{km:1886,t:"bridge",n:"Railway Bridge"},
{km:1894,t:"camp",n:"Parking Bay Camp"},{km:1905,t:"river",n:"Indulkana Creek"},{km:1958,t:"camp",n:"Free Campsite"},
{km:2000,t:"river",n:"Tower Creek"},{km:2005,t:"camp",n:"Large Flat Camp"},{km:2130,t:"camp",n:"Camping Area"},
{km:2158,t:"river",n:"Cottonbush Creek"},{km:2252,t:"river",n:"Brumby Creek"},{km:2446,t:"bridge",n:"Railway Bridge"},
{km:2514,t:"river",n:"Eucolo Creek"},{km:2608,t:"river",n:"Woocalla Creek"},{km:2633,t:"camp",n:"Campgrounds"},
{km:2718.2,t:"signal",n:"Port Augusta"},{km:2719.4,t:"signal",n:"Flinders Tce"},{km:2721,t:"signal",n:"Victoria Pde"},
{km:2722,t:"bridge",n:"Rail Crossing"},{km:2726,t:"bridge",n:"Railway Bridge"},{km:2785,t:"river",n:"Baroota Creek"},
{km:2839,t:"river",n:"Broughton River"},{km:2926,t:"bridge",n:"Overpass"},{km:2991,t:"river",n:"Gawler River"},
{km:2992,t:"signal",n:"Angle Vale Rd"},{km:3003,t:"signal",n:"Waterloo"},{km:3006.8,t:"signal",n:"Bolivar"},
{km:3009.5,t:"signal",n:"Ryans Rd"},{km:3012,t:"signal",n:"Salisbury"},{km:3014,t:"signal",n:"Montague Rd"},
{km:3016.3,t:"signal",n:"Major Junction"},{km:3019.1,t:"signal",n:"Main North Rd"},{km:3021.2,t:"signal",n:"Main North Rd"},
{km:3023.1,t:"signal",n:"Walkerville"},{km:3024.3,t:"signal",n:"North Tce"},{km:3025.07,t:"signal",n:"Bartels Rd"},
];
const GRID_KMS=[402,468,552,610,688,752,838,910,1015,1120,1330,1620,1745,1930,2075,2210];
GRID_KMS.forEach(k=>LANDMARKS.push({km:k,t:"grid",n:"Cattle Grid"}));
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
timeScale:60, infiniteBattery:false,
uiMode:('ontouchstart' in window)?"mobile":"pc",
};
const PRO={
startSoc:1.0, vFull:107.5, vEmpty:75.0,
kt:4.3, noLoadRpm:900, ktPower:3.35, rpmPower:1060, tireR:0.26,
stallBoost:2.0, stallBoostV:5,
mRot:8, brakeMu:0.55, regenEff:0.92, airRho:0, rInternal:0.18,
rWinding:0.12, ironK1:0.13, ironK2:0.00135, ctrlW:6, battCth:20000, battUA:4, albedo:0.28,
tempOffset:0, windBase:6, solarScale:1.0, cloudFactor:1.0, dayOfYear:236,
aiCount:20, aiSpdMin:58, aiSpdMax:103, aiRetire:0.5,
trainPerHour:3.5, faultScale:1.0, gridRisk:1.0,
noSpeedCap:0,
};

const MODE_CFG={ event:{ duration:90, attractIdle:30, stamps:[[2.0,"🥇 GOLD","#fbbf24"],[1.4,"🥈 SILVER","#cbd5e1"],[0,"🥉 BRONZE","#d97706"]] }, race:{} };
