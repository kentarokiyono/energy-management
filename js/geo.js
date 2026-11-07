"use strict";
/* ============ 実データ: ルートの位置・標高・勾配 (ROUTE_GEO) と 2025 年大会期間の天気 (WEATHER_2025) ============
 データは tools/fetch_real_data.py で作る。無いときは従来の近似 (data.js の ROUTE と気候値) にもどる */
const Geo={
 ok:false,
 init(){
  if(typeof ROUTE_GEO==="undefined") return;
  const G=ROUTE_GEO, und=(d,k)=>{ const a=new Float64Array(d.length); let v=0; for(let i=0;i<d.length;i++){ v+=d[i]; a[i]=v/k; } return a; };
  this.LA=und(G.lat,1e5); this.LO=und(G.lon,1e5); this.el=und(G.elev,10); this.sp=G.stepPos; this.se=G.stepElev;
  const n=this.el.length; this.gr=new Float32Array(n);
  for(let i=0;i<n;i++){ const a=Math.max(0,i-1), b=Math.min(n-1,i+1); this.gr[i]=(this.el[b]-this.el[a])/((b-a)*this.se*1000); }
  this.ok=true;
 },
 f(arr,step,km){ const x=clamp(km,0,(arr.length-1)*step)/step, i=Math.min(arr.length-2,Math.floor(x)), t=x-i; return arr[i]+(arr[i+1]-arr[i])*t; },
 elev(km){ return this.f(this.el,this.se,km); },
 grade(km){ return this.f(this.gr,this.se,km); },
 lat(km){ return this.f(this.LA,this.sp,km); }, lon(km){ return this.f(this.LO,this.sp,km); },
 bearing(km){ const a=Math.max(0,km-0.5), b=a+1, la=this.lat(a), lb=this.lat(b), dLon=(this.lon(b)-this.lon(a))*Math.cos(la*Math.PI/180); return Math.atan2(dLon,lb-la); },
};
/* 2025 年 8 月 22 日 0 時 (ACST) からの時間で引く。レース 1 日目 = 8 月 24 日 (通日 236) */
const RealWx={
 ok:false, DOY0:234,
 init(){ if(typeof WEATHER_2025==="undefined") return; this.W=WEATHER_2025; this.ok=true; },
 on(){ return this.ok&&P.realWeather!==false&&P.mode==="race"&&!P.event; },
 /* 場所 (緯度経度) と 通日・時刻 → 補間の重み。地点はルート上 100 km ごと: 近い 2 地点を距離で、前後の 1 時間を時刻で */
 wts(lat,lon,doy,hour){
  const W=this.W, L=W.loc, c=Math.cos(lat*Math.PI/180); let i0=0,d0=1e9,i1=0,d1=1e9;
  for(let i=0;i<L.length;i++){ const d=Math.hypot(L[i][1]-lat,(L[i][2]-lon)*c); if(d<d0){ d1=d0; i1=i0; d0=d; i0=i; } else if(d<d1){ d1=d; i1=i; } }
  const h=(doy-this.DOY0)*24+hour, k=clamp(Math.floor(h),0,W.hours-2), t=clamp(h-k,0,1), w0=(d0+d1)>0? d1/(d0+d1) : 1;
  return [[i0,k,w0*(1-t)],[i0,k+1,w0*t],[i1,k,(1-w0)*(1-t)],[i1,k+1,(1-w0)*t]];
 },
 at(key,lat,lon,doy,hour){ const S=this.W[key]; let s=0,w=0; for(const [i,k,q] of this.wts(lat,lon,doy,hour)){ const v=S[i][k]; if(v==null) continue; s+=v*q; w+=q; } return w>0? s/w : null; },
 /* 風: 向きは成分に分けて平均 (350° と 10° の間が 180° にならないように) */
 wind(lat,lon,doy,hour){ let u=0,v=0,w=0; for(const [i,k,q] of this.wts(lat,lon,doy,hour)){ const ws=this.W.ws[i][k], wd=this.W.wd[i][k]; if(ws==null||wd==null) continue;
   const to=(wd+180)*Math.PI/180; u+=Math.sin(to)*ws*q; v+=Math.cos(to)*ws*q; w+=q; }
  if(!w) return {ws:0,toward:0}; u/=w; v/=w; return {ws:Math.hypot(u,v),toward:Math.atan2(u,v)}; },
};
Geo.init(); RealWx.init();
