"use strict";
/* ============ 植生帯・地表パレット(8月=乾季) ============
 色はsRGB 16進。描画側で linear に変換して使う。
 cov: 地表の植生被覆率 / burn: 野焼き跡 / stone: ギバー(礫) / field: 農地区画 / hill: 起伏量
 flora: 種別ごとの出現重み(chunk生成時の密度) */
const BIOMES=[
{ id:"darwin_cbd", km0:0,    km1:2.5,  urban:"darwin_cbd",
  soil:0x6f7f45, veg:0x55702f, cov:0.6, burn:0, stone:0, field:0, hill:0.2, flora:{palm:0.6,mango:0.3} },
{ id:"darwin_sub", km0:2.5,  km1:14,   urban:"darwin_sub",
  soil:0x7d7a45, veg:0x5f7a33, cov:0.55, burn:0, stone:0, field:0, hill:0.3, flora:{palm:0.5,mango:0.5,woodland:0.3} },
{ id:"topend",     km0:14,   km1:330,
  soil:0x6e4a32, veg:0x9c824f, cov:0.66, burn:0.55, stone:0, field:0, hill:1.0, flora:{woodland:1.0,termite:0.9,grass:1.0,pandanus:0.25} },
{ id:"savanna",    km0:330,  km1:700,
  soil:0x7a5038, veg:0xad9762, cov:0.62, burn:0.35, stone:0, field:0, hill:0.7, flora:{woodland:0.55,termite:0.5,grass:0.9} },
{ id:"barkly",     km0:700,  km1:960,
  soil:0x93603d, veg:0xcdbb8c, cov:0.85, burn:0.1, stone:0.05, field:0, hill:0.4, flora:{grass:1.0,woodland:0.12,mulga:0.15,spinifex:0.2} },
{ id:"central",    km0:960,  km1:1400,
  soil:0xa25a36, veg:0x9f9660, cov:0.36, burn:0.05, stone:0.2, field:0, hill:1.4, flora:{spinifex:1.0,mulga:0.55,rock:0.35,ghost:0.12,desertoak:0.08} },
{ id:"alice",      km0:1400, km1:1600,
  soil:0x9e5636, veg:0x9a915c, cov:0.32, burn:0, stone:0.3, field:0, hill:3.0, flora:{spinifex:0.9,mulga:0.4,rock:0.7,ghost:0.35,redgum:0.25} },
{ id:"south_nt",   km0:1600, km1:1800,
  soil:0xaa6038, veg:0xa0985f, cov:0.3, burn:0, stone:0.05, field:0, hill:2.4, flora:{spinifex:1.0,desertoak:0.55,mulga:0.4} },
{ id:"sa_north",   km0:1800, km1:2100,
  soil:0x925c3e, veg:0x8f8e68, cov:0.3, burn:0, stone:0.45, field:0, hill:1.0, flora:{mulga:0.6,saltbush:0.7,spinifex:0.3,rock:0.2} },
{ id:"gibber",     km0:2100, km1:2300,
  soil:0x9a6242, veg:0x8f8d6a, cov:0.1, burn:0, stone:0.8, field:0, hill:0.6, flora:{saltbush:0.35,rock:0.3} },
{ id:"saltbush",   km0:2300, km1:2650,
  soil:0xa06e4c, veg:0x8e9c86, cov:0.45, burn:0, stone:0.3, field:0, hill:0.5, flora:{saltbush:1.0,mulga:0.15} },
{ id:"pt_augusta", km0:2650, km1:2760,
  soil:0xa57a54, veg:0x8f9a7c, cov:0.4, burn:0, stone:0.15, field:0, hill:0.8, flora:{saltbush:0.8,redgum:0.1} },
{ id:"farm",       km0:2760, km1:2991,
  soil:0x8a6a45, veg:0x7b9645, cov:0.5, burn:0, stone:0, field:0.92, hill:1.0, flora:{redgum:0.25,windbreak:0.5,fence:1} },
{ id:"adelaide",   km0:2991, km1:3021, urban:"adelaide",
  soil:0x8c9157, veg:0x6f8a3d, cov:0.5, burn:0, stone:0, field:0, hill:0.4, flora:{redgum:0.2,jacaranda:0.2} },
{ id:"parklands",  km0:3021, km1:3030, urban:"parklands",
  soil:0x7f9348, veg:0x5f7f34, cov:0.55, burn:0, stone:0, field:0, hill:0.2, flora:{redgum:0.9} },
];
/* 特定地点の地物 */
const FEATURES=[
{ id:"devils_marbles", km0:1088.8, km1:1091.6, side:-1 },   // ルートノートの入口 2 か所 (1089.0・1092.0 km) の間、道の左 (東) 側だけ
{ id:"mullock",        km0:2160, km1:2200 },
{ id:"salt_lake",      km0:2515, km1:2560, side:1 },
{ id:"macdonnell",     km0:1470, km1:1515 },
];
const _bC1=new THREE.Color(), _bC2=new THREE.Color();
function biomeIndex(km){
for(let i=0;i<BIOMES.length;i++) if(km<BIOMES[i].km1) return i;
return BIOMES.length-1;
}
/* 境界前後 BLEND km で線形補間した連続パラメータ */
function biomeAt(km){
const BL=12;
const i=biomeIndex(km), b=BIOMES[i];
let nb=null, t=0;
if(i<BIOMES.length-1 && km>b.km1-BL){ nb=BIOMES[i+1]; t=0.5*(km-(b.km1-BL))/BL; }
else if(i>0 && km<b.km0+BL){ nb=BIOMES[i-1]; t=0.5*((b.km0+BL)-km)/BL; }
const mix=(k)=>nb? b[k]*(1-t)+nb[k]*t : b[k];
const col=(k)=>{ _bC1.setHex(b[k]); if(nb){ _bC2.setHex(nb[k]); _bC1.lerp(_bC2,t); } return _bC1.getHex(); };
return { id:b.id, urban:b.urban||null, b, nb, t,
 soil:col("soil"), veg:col("veg"), cov:mix("cov"), burn:mix("burn"), stone:mix("stone"), field:mix("field"), hill:mix("hill") };
}
function featureAt(km){ return FEATURES.filter(f=>km>=f.km0&&km<f.km1); }
function townKind(km){
const ts=townSize(km);
if(isCity(km)) return null;
if(ts.dist<ts.r) return (Math.abs(km-1496)<6)?"alice":(Math.abs(km-2181)<5)?"cooberpedy":(Math.abs(km-2720)<5)?"ptaugusta":"town";
return null;
}
/* ---- 決定論的ノイズ(JS側: 地形高さ/配置) ---- */
function hash2(x,y){ let h=Math.sin(x*127.1+y*311.7)*43758.5453; return h-Math.floor(h); }
function vnoise(x,y){
const xi=Math.floor(x), yi=Math.floor(y), xf=x-xi, yf=y-yi;
const u=xf*xf*(3-2*xf), v=yf*yf*(3-2*yf);
const a=hash2(xi,yi), b=hash2(xi+1,yi), c=hash2(xi,yi+1), d=hash2(xi+1,yi+1);
return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
}
/* 道路から離れるほど起伏が出る地形高さ [m] (常に>=0) */
function terrainH(x,z,off,hill){
const a=Math.min(1,Math.max(0,(Math.abs(off)-11)/55));
if(a<=0||hill<=0) return 0;
const n=1.4*vnoise(x*0.007,z*0.007)+0.55*vnoise(x*0.029+5.3,z*0.029-1.7);
return hill*a*n*(1+Math.abs(off)/260);
}
let _rngState=1;
function srand(seed){ _rngState=(Math.floor(seed)%2147483647+2147483647)%2147483647||1; }
function rnd(){ _rngState=_rngState*16807%2147483647; return (_rngState-1)/2147483646; }
function rndr(a,b){ return a+(b-a)*rnd(); }
function rndPick(arr){ return arr[Math.floor(rnd()*arr.length)%arr.length]; }
