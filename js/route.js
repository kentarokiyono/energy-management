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
/* 等倍ゾーン境界からの視覚距離で 0(ゾーン内)→1 へ滑らかに (地形の段差防止) */
zoneFade(km,R=220){
 let d=Infinity; const v=this.vis(km);
 for(const [a,b] of this.zones){ if(km>=a&&km<=b) return 0; d=Math.min(d,Math.abs(v-this.vis(a)),Math.abs(v-this.vis(b))); if(a>km) break; }
 if(d>=R) return 1; const t=d/R; return t*t*(3-2*t);
},
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
/* 道路断面: L=左端(自車線側, 正の値) / m1=中央分離帯の右端 (分離帯は 0..m1) / R=右端 / ow=対向車線なし
 既定は片側1車線の 2 車線道路 (L=R=5)。区間の両端 40 m で既定値から滑らかに変化 */
DEF_PROF:{L:5,m1:0,R:5,ow:false,dual:false},
_profSegs(t){
 if(t._ps) return t._ps;
 const S=(t.prof||[]).map(([a,b,n,med])=>({a,b,n,med})).sort((x,y)=>x.a-y.a);
 for(let i=1;i<S.length;i++) if(S[i].a-S[i-1].b<0.05&&S[i].a>S[i-1].b){ const g=(S[i-1].b+S[i].a)/2; S[i-1].b=g; S[i].a=g; }   // 短い隙間は埋める
 return (t._ps=S);
},
profAt(km){
 const t=this.townAt(km); if(!t||!t.prof||!t.prof.length) return this.DEF_PROF;
 // ルートが曲がる交差点の前後 (±12 m で既定断面, 42 m で元に戻る) は 2 車線道路にする: 上下線が角で一緒に曲がらないように
 let wT=1; for(const m of RP_MANEUVERS){ if(m.osm!==t||!/^(L|R|veerL|veerR|uturn|rab)$/.test(m.turn)) continue; const d=Math.abs(km-m.km); if(d<0.042) wT=Math.min(wT,clamp((d-0.012)/0.03,0,1)); }
 if(wT<1){ const v=this._profRaw(t,km), D=this.DEF_PROF; if(wT<=0) return D; return {L:D.L+(v.L-D.L)*wT, m1:v.m1*wT, R:D.R+(v.R-D.R)*wT, ow:v.ow&&wT>0.5, dual:v.dual}; }
 return this._profRaw(t,km);
},
_profRaw(t,km){
 const S=this._profSegs(t), TP=0.04, D=this.DEF_PROF;
 const val=(g)=>{ const L=Math.max(4.6,g.n*3.5), ow=g.med<0, m1=ow?0:g.med; return {L,m1,R:ow?0.8:m1+L,ow}; };
 const mix=(a,b,w)=>({L:a.L+(b.L-a.L)*w, m1:a.m1+(b.m1-a.m1)*w, R:a.R+(b.R-a.R)*w, ow:(w<0.5?a.ow:b.ow), dual:true});
 for(let i=0;i<S.length;i++){
  const g=S[i]; if(km<g.a||km>g.b) continue;
  const prev=i>0&&Math.abs(S[i-1].b-g.a)<1e-6? val(S[i-1]) : D, next=i<S.length-1&&Math.abs(S[i+1].a-g.b)<1e-6? val(S[i+1]) : D, v=val(g);
  // 区間の始まり/終わりの TP で前後の断面からなめらかに変化 (隣接区間との境界は中点で 0.5)
  const da=(km-g.a)/TP, db=(g.b-km)/TP;
  if(da<1) return mix(prev,v,prev===D? da : 0.5+0.5*da);
  if(db<1) return mix(next,v,next===D? db : 0.5+0.5*db);
  return mix(v,v,1);
 }
 return D;
},
H(t,km){
 const d=clamp((km-t.km0)*1000,0,t.len), D=t.D;
 let lo=0, hi=D.length-1;
 while(hi-lo>1){ const m=(lo+hi)>>1; if(D[m]<=d) lo=m; else hi=m; }
 return t.H[lo]+(d-D[lo])*(t.K[lo]||0);
},
/* 立体交差: 経路の橋で下を道路がくぐる所は路面を持ち上げる → {h:高さ m, deck:橋桁の上か}
 下の道路の幅 + 4 m を平らな橋桁、その前後 90 m をなめらかな坂 (約 6 %) にする */
CLEAR:5.6, RAMP:0.09,
bumpAt(km){
 const t=this.townAt(km); if(!t||!t.bridges||!t.bridges.length) return null;
 let h=0, deck=false;
 for(const [k0,k1,under,wr] of t.bridges){
  for(const [ku,,,uh,kind] of under||[]){
   if(kind==="water"||(Array.isArray(wr)&&ku>=wr[0]&&ku<=wr[1])) continue;   // 水面の上は持ち上げない (下の地面を下げる)
   const C= kind==="rail"? this.CLEAR_RAIL : this.CLEAR;
   const dS=((uh||3.5)+4)/1000, d=Math.abs(km-ku);
   if(d<=dS){ h=Math.max(h,C); deck=true; continue; }
   if(d<dS+this.RAMP){ const x=(d-dS)/this.RAMP; h=Math.max(h,C*0.5*(1+Math.cos(Math.PI*x))); }
  }
 }
 return h>0? {h,deck} : null;
},
CLEAR_RAIL:6.6,
/* 水面 (川・海) の上の橋の区間か → {depth: 水面下の深さ m, edge: 0..1 岸からの近さ, k0, k1} */
waterAt(km){
 const t=this.townAt(km); if(!t||!t.bridges) return null;
 for(const [k0,k1,under,wr] of t.bridges){
  if(!Array.isArray(wr)) continue;
  const a=wr[0]-0.008, b=wr[1]+0.008;          // 岸の斜面の分だけ広げる
  if(km>=a&&km<=b){ const e=Math.min(km-a,b-km)*1000; return {depth:4.5, edge:clamp(e/12,0,1), k0:a, k1:b}; }
 }
 return null;
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
  // ノートに無い OSM の信号も置く (等倍ゾーンの交差点)
  for(const k of t.sig||[]){ if(!RN_EVENTS.some(e=>(e.k==="signal"||e.k==="pedlight")&&Math.abs(e.km-k)<0.06)) RN_EVENTS.push({km:k,k:"signal",t:"(OSM) Traffic lights",osm:true}); }
 }
 RP_MANEUVERS.sort((a,b)=>a.km-b.km); RN_EVENTS.sort((a,b)=>a.km-b.km);
},
};
OsmRoute.init();
