"use strict";
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const massBallast=()=>Math.max(0, 80-P.massDriver);
const massTotal=()=>P.massDry+P.massDriver+massBallast();
const V_NOM=91;
// ---- Li-ion OCV曲線(正規化) / 実効公称電圧 ----
const OCV_TBL=[[0,0],[0.05,0.20],[0.10,0.31],[0.20,0.43],[0.30,0.51],[0.40,0.57],[0.50,0.62],[0.60,0.68],[0.70,0.75],[0.80,0.83],[0.90,0.91],[1.0,1.0]];
function ocvFrac(soc){
soc=Math.max(0,Math.min(1,soc));
for(let i=1;i<OCV_TBL.length;i++){ const [s1,f1]=OCV_TBL[i]; if(soc<=s1){ const [s0,f0]=OCV_TBL[i-1]; return f0+(f1-f0)*(soc-s0)/(s1-s0); } }
return 1;
}
const VOC=soc=>PRO.vEmpty+(PRO.vFull-PRO.vEmpty)*ocvFrac(soc);
const V_AVG=()=>{ let a=0; for(let i=0;i<20;i++) a+=VOC((i+0.5)/20); return a/20; };
const CAP_AH=()=>P.batteryWh/V_AVG();
// ---- 物理ヘルパ ----
const Phys={
// 空気密度: 標高[m]・気温[°C]から(PRO.airRho>0なら固定値)
airDensity(elev,Tc){
if(PRO.airRho>0) return PRO.airRho;
const p=101325*Math.pow(1-2.25577e-5*Math.max(0,elev),5.25588);
return p/(287.05*(Tc+273.15));
},
// 転がり抵抗係数: 速度依存項付き
crr(v){ return P.Crr*(1+0.003*v); },
// 内部抵抗: 温度(Arrhenius)・低SOC依存
rInt(Tbat,soc){
const T=(Tbat==null?25:Tbat)+273.15;
return Math.max(0.001,PRO.rInternal)*Math.exp(2500*(1/T-1/298.15))*(1+1.5*Math.max(0,0.15-soc));
},
// 端子電力P(+放電/-充電)からバッテリー電流を求める (P = (Voc - I·R)·I)
battCurrent(Voc,R,Pnet){
const disc=Voc*Voc-4*R*Pnet;
return disc>0 ? (Voc-Math.sqrt(disc))/(2*R) : Voc/(2*R);
},
// 太陽位置: 時計はACST(UTC+9:30, 標準子午線142.5°E)。経度補正+均時差で真太陽時へ
sunPos(lat,lon,doy,clockH){
const B=2*Math.PI*(doy-81)/364;
const eot=9.87*Math.sin(2*B)-7.53*Math.cos(B)-1.5*Math.sin(B);
const solarH=clockH+(4*(lon-142.5)+eot)/60;
const g=2*Math.PI/365*(doy-1);
const delta=0.006918-0.399912*Math.cos(g)+0.070257*Math.sin(g)-0.006758*Math.cos(2*g)+0.000907*Math.sin(2*g)-0.002697*Math.cos(3*g)+0.00148*Math.sin(3*g);
const latR=lat*Math.PI/180;
const ha=(solarH-12)*15*Math.PI/180;
const sinAlt=Math.sin(latR)*Math.sin(delta)+Math.cos(latR)*Math.cos(delta)*Math.cos(ha);
const alt=Math.asin(Math.max(-1,Math.min(1,sinAlt)));
const az=Math.atan2(Math.sin(ha), Math.cos(ha)*Math.sin(latR)-Math.tan(delta)*Math.cos(latR))+Math.PI;
const cosH0=(Math.sin(-0.833*Math.PI/180)-Math.sin(latR)*Math.sin(delta))/(Math.cos(latR)*Math.cos(delta));
const H0=Math.acos(Math.max(-1,Math.min(1,cosH0)))*180/Math.PI/15;
const shift=(4*(lon-142.5)+eot)/60;
return {alt,az,delta,sunrise:12-H0-shift,sunset:12+H0-shift};
},
// 入射角損失 (Martin-Ruiz, ar=0.16)
iam(c){ const ar=0.16; return c<=0?0:(1-Math.exp(-c/ar))/(1-Math.exp(-1/ar)); },
// 晴天日射 (Kasten-Young大気路程 + Laue標高補正 + 散乱)
clearSky(alt,elev,doy){
if(alt<=0) return {dni:0,dhi:0};
const cz=Math.sin(alt), Zdeg=90-alt*180/Math.PI;
const am=1/(cz+0.50572*Math.pow(Math.max(0.01,96.07995-Zdeg),-1.6364));
const hk=Math.max(0,elev)/1000;
const I0=1361*(1+0.033*Math.cos(2*Math.PI*doy/365));
const dni=I0*((1-0.14*hk)*Math.pow(0.7,Math.pow(am,0.678))+0.14*hk);
const dhi=0.25*Math.max(0,I0-dni)*Math.pow(cz,0.8);
return {dni,dhi};
},
// 風の気候値(8月): 北部=ESE貿易風, 中央=SE, 南部=W〜NW偏西風。日変化あり。戻り値: 吹いていく方位[rad]と10m風速係数
windClim(lat,hour){
const t=-lat;
let fromDeg;
if(t<20) fromDeg=115;
else if(t<27) fromDeg=115+(t-20)/7*25;
else if(t<33) fromDeg=140+(t-27)/6*150;
else fromDeg=290;
const diurnal=0.55+0.65*Math.max(0,Math.sin(Math.PI*(hour-7.5)/11));
return {toward:(fromDeg+180)*Math.PI/180, f:diurnal};
},
gauss(){ let u=0,v=0; while(u===0)u=Math.random(); while(v===0)v=Math.random(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); },
};
// 太陽電池温度の定常値: 吸収-発電分を対流で放熱 (h = h0 + k·風速)
function cellTempSS(Tamb,G,airV,tilted){
const h=tilted? 25+3.0*airV : 20+2.0*Math.max(0,airV);
return Tamb+G*(0.92-P.cellEff)/h;
}
// モーター: 銅損 I²R + 鉄損(k1ω+k2ω², 常時の機械的抗力) + コントローラ損失
function motorIronW(v){ const w=Math.max(0,v)/PRO.tireR; return PRO.ironK1*w+PRO.ironK2*w*w; }
function motorModel(I,v,soc,power){
const Vb=VOC(soc);
const kt=power?PRO.ktPower:PRO.kt;
const noLoad=power?PRO.rpmPower:PRO.noLoadRpm;
const vMax=noLoad*(Vb/96)/60*2*Math.PI*PRO.tireR;
const boost=1+(PRO.stallBoost-1)*clamp((PRO.stallBoostV-v)/PRO.stallBoostV,0,1);
let F=kt*I*boost;
if(!PRO.noSpeedCap){
const Pcap=Vb*I*0.97*PRO.stallBoost;
if(v>0.5 && F*v>Pcap) F=Pcap/v;
if(v>vMax*0.97) F*=clamp((vMax-v)/(vMax*0.03),0,1);
}
const Rw=PRO.rWinding*(power?1.15:1);
const Iph=F/kt;
const Pcu=Iph*Iph*Rw;
const Pctrl=I>0.05? PRO.ctrlW+0.01*Vb*I : 0;
const Pelec=F*Math.max(0,v)+Pcu+Pctrl;
const eff=Pelec>1? F*Math.max(0,v)/Pelec : 0;
return {F,Pelec,Vb,eff,vMax};
}
function csCloseAbs(km){ // Route Notes の公式クローズ時刻 (Day1=8/24 からの通算時間)
const c=RP_CS.find(c=>Math.abs(c.km-km)<1); if(c) return Route.absHour(c.close);
return 6*24+12;
}
function fmtAbsH(h){ const d=Math.floor(h/24)+1, hh=Math.floor(h%24), mm=Math.floor((h%1)*60);
return `Day${d} ${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`; }
function fmtDur(h){ const sg=h<0?"-":""; h=Math.abs(h);
return `${sg}${Math.floor(h)}:${String(Math.floor(h%1*60)).padStart(2,"0")}`; }
function profileAt(km){
const d=clamp(km,0,TOTAL_KM);
let i=0;
while(i<ROUTE.length-2 && ROUTE[i+1].km<=d) i++;
const p1=ROUTE[i], p2=ROUTE[i+1];
const r=(d-p1.km)/(p2.km-p1.km);
const elev=lerp(p1.elev,p2.elev,r);
const slope=Math.atan2(p2.elev-p1.elev,(p2.km-p1.km)*1000);
const lat=lerp(p1.lat,p2.lat,r), lon=lerp(p1.lon,p2.lon,r);
const dLat=p2.lat-p1.lat, dLon=(p2.lon-p1.lon)*Math.cos(lat*Math.PI/180);
const bearing=Math.atan2(dLon,dLat);
return { elev, slope, lat, lon, bearing };
}
function ambientTemp(lat,hour){
const t=clamp((-lat-12.4)/(34.9-12.4),0,1);
const tmax = t<0.5 ? lerp(33.2,30.9,t*2) : lerp(30.9,21.3,(t-0.5)*2);
const tmin = t<0.5 ? lerp(24.9,14.8,t*2) : lerp(14.8,11.1,(t-0.5)*2);
const ph=Math.cos((hour-14.5)/24*2*Math.PI);
return lerp(tmin,tmax,(ph+1)/2)+PRO.tempOffset;
}
