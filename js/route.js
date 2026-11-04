"use strict";
/* ============ ルート: 時間倍率ゾーン・視覚距離⇔km の対応・ノート由来の検索 ============
 視覚空間(3D の道路上の距離 m)と実距離 km の対応は、等倍ゾーン(右左折/信号/CS 等)では 1:1、
 それ以外では 1:timeScale。Vis(km) は単調増加の区分線形関数。 */
const Route={
zones:[], K:[], V:[], base:60,
build(base,noZones){
 this.base=Math.max(1,base||1);
 this.zones=noZones?[]:rpScaleZones();
 const K=[0], V=[0];
 let k=0, v=0;
 for(const [a,b] of this.zones){
  if(a>k){ v+=(a-k)*1000/this.base; k=a; K.push(k); V.push(v); }
  const bb=Math.min(b,TOTAL_KM+1);
  if(bb>k){ v+=(bb-k)*1000; k=bb; K.push(k); V.push(v); }
 }
 const end=TOTAL_KM+1;
 if(end>k){ v+=(end-k)*1000/this.base; K.push(end); V.push(v); }
 this.K=K; this.V=V;
},
inZone(km){ for(const [a,b] of this.zones){ if(km<a) return false; if(km<=b) return true; } return false; },
scaleAt(km){ return this.inZone(km)? 1 : this.base; },
vis(km){
 const K=this.K, V=this.V; if(!K.length) return km*1000/this.base;
 if(km<=0) return km*1000/this.scaleAt(0);
 let lo=0, hi=K.length-1;
 if(km>=K[hi]) return V[hi]+(km-K[hi])*1000/this.base;
 while(hi-lo>1){ const m=(lo+hi)>>1; if(K[m]<=km) lo=m; else hi=m; }
 return V[lo]+(V[hi]-V[lo])*(km-K[lo])/(K[hi]-K[lo]);
},
kmAtVis(v){
 const K=this.K, V=this.V; if(!K.length) return v*this.base/1000;
 if(v<=0) return v*this.scaleAt(0)/1000;
 let lo=0, hi=V.length-1;
 if(v>=V[hi]) return K[hi]+(v-V[hi])*this.base/1000;
 while(hi-lo>1){ const m=(lo+hi)>>1; if(V[m]<=v) lo=m; else hi=m; }
 return K[lo]+(K[hi]-K[lo])*(v-V[lo])/(V[hi]-V[lo]);
},
visDist(k1,k2){ return this.vis(k2)-this.vis(k1); },
/* ---- ノート由来 ---- */
_limits:null,
limits(){
 if(this._limits) return this._limits;
 const L=RN_EVENTS.filter(e=>e.k==="limit").map(e=>[e.km,e.v]);
 // CS 構内 25 km/h (進入〜出口)
 for(const c of RP_CS){ L.push([c.km-0.12,RP_RULES.csEntryLimit]); }
 L.sort((a,b)=>a[0]-b[0]);
 // CS 出口後は直前の本線制限に戻す
 const out=[];
 for(let i=0;i<L.length;i++){
  out.push(L[i]);
  if(L[i][1]===RP_RULES.csEntryLimit){ let prev=60; for(let j=i-1;j>=0;j--) if(L[j][1]!==RP_RULES.csEntryLimit){ prev=L[j][1]; break; } out.push([L[i][0]+0.32,prev]); }
 }
 out.sort((a,b)=>a[0]-b[0]);
 return (this._limits=out);
},
limitAt(km){
 let lim=60; for(const [k,v] of this.limits()){ if(km>=k) lim=v; else break; }
 return lim;
},
maneuversIn(a,b){ return RP_MANEUVERS.filter(m=>m.km>=a&&m.km<b); },
eventsIn(a,b,kind){ return RN_EVENTS.filter(e=>e.km>=a&&e.km<b&&(!kind||e.k===kind)); },
nextManeuver(km){ for(const m of RP_MANEUVERS) if(m.km>km) return m; return null; },
csByN(n){ return RP_CS.find(c=>c.n===n); },
absHour(t){ return (t[0]-1)*24+t[1]+t[2]/60; },
};
/* ============ OSM の町区間 (js/data/route-osm.js) ============
 町ごとに曲率プログラム prog=[長さ,曲率,...] を持つ。H(km) は区間始点からの方位変化 (rad, 右 +)。
 読み込み時に区間内の動作・CS・ノートの事象の km を OSM 由来の位置へ写像する (TOTAL_KM 確定前に実行)。 */
const OsmRoute={
towns:[],
init(){
 if(typeof OSM_TOWNS==="undefined"||!OSM_TOWNS.length) return;
 for(const t of OSM_TOWNS){
  const D=[0], H=[0], K=[];
  for(let i=0;i<t.prog.length;i+=2){ const L=t.prog[i], k=t.prog[i+1]; K.push(k); D.push(D[D.length-1]+L); H.push(H[H.length-1]+L*k); }
  t.D=D; t.H=H; t.K=K; t.km1=t.km0+t.len/1000;
  this.towns.push(t);
 }
 this.apply();
},
townAt(km){ for(const t of this.towns) if(km>=t.km0&&km<=t.km1) return t; return null; },
H(t,km){
 const d=clamp((km-t.km0)*1000,0,t.len), D=t.D;
 let lo=0, hi=D.length-1;
 while(hi-lo>1){ const m=(lo+hi)>>1; if(D[m]<=d) lo=m; else hi=m; }
 return t.H[lo]+(d-D[lo])*(t.K[lo]||0);
},
/* ノート km → OSM km: 動作の対応点で区分線形 (両端は傾き 1 で外挿) */
mapper(t){
 const P=Object.entries(t.man).map(([k,v])=>[+k,v[0]]).sort((a,b)=>a[0]-b[0]);
 if(t.cs) for(const c of RP_CS) if(t.cs[c.n]!=null) P.push([c.km,t.cs[c.n]]);
 if(t.finish!=null) P.push([RP_FINISH.km,t.finish]);
 P.sort((a,b)=>a[0]-b[0]);
 const f=(k)=>{
  if(!P.length) return k;
  if(k<=P[0][0]) return P[0][1]+(k-P[0][0]);
  for(let i=1;i<P.length;i++) if(k<=P[i][0]){ const a=P[i-1], b=P[i]; return b[0]>a[0]? a[1]+(b[1]-a[1])*(k-a[0])/(b[0]-a[0]) : b[1]; }
  const z=P[P.length-1]; return z[1]+(k-z[0]);
 };
 const a=P.length? P[0][0]-(P[0][1]-t.km0) : t.km0, b=P.length? P[P.length-1][0]+(t.km1-P[P.length-1][1]) : t.km1;
 return {f,a,b};
},
apply(){
 const snap=(k,list,w)=>{ let best=k, bd=w; for(const s of list||[]){ const d=Math.abs(s-k); if(d<bd){ bd=d; best=s; } } return best; };
 for(const t of this.towns){
  const {f,a,b}=this.mapper(t), inT=(k)=>k>=a&&k<=b;
  for(const m of RP_MANEUVERS){
   if(!inT(m.km)) continue;
   const v=t.man[String(m.km)];
   m.noteKm=m.km; m.km= v? v[0] : f(m.km); m.osm=t; m.osmHin= v? v[1] : null;
   if(m.warnKm!=null) m.warnKm=f(m.warnKm);
  }
  for(const c of RP_CS) if(inT(c.km)) c.km= t.cs&&t.cs[c.n]!=null? t.cs[c.n] : f(c.km);
  if(inT(RP_FINISH.km)) RP_FINISH.km= t.finish!=null? t.finish : f(RP_FINISH.km);
  for(const tr of RP_TRAPS) if(inT(tr.km)) tr.km=f(tr.km);
  const r=RP_RULES; if(inT(r.driverChange.km)) r.driverChange.km=f(r.driverChange.km);
  if(inT(r.saturdayNoSouthOfPA.km)) r.saturdayNoSouthOfPA.km=f(r.saturdayNoSouthOfPA.km);
  for(const e of RN_EVENTS){
   if(!inT(e.km)) continue;
   let k=f(e.km);
   if(e.k==="signal") k=snap(k,t.sig,0.25);
   else if(e.k==="pedlight") k=snap(k,(t.ped||[]).concat(t.sig),0.25);
   else if(e.k==="roundabout") k=snap(k,t.rab,0.25);
   if(e.km2!=null) e.km2=f(e.km2);
   e.km=k; e.osm=true;
  }
  for(const row of RN_ROWS) if(inT(row[0])) row[0]=+f(row[0]).toFixed(3);
 }
 RP_MANEUVERS.sort((a,b)=>a.km-b.km); RN_EVENTS.sort((a,b)=>a.km-b.km);
},
};
OsmRoute.init();
