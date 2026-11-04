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
