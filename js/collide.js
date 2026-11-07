"use strict";
/* ============ 当たり判定 (レースモード・予選モード) ============
 障害物: 円 (柱・木・人・タイヤ) / 線分 (壁・ガードレール・欄干) / 回転箱 (車両・建物) を 4 m 格子に登録。
 自車: 前後に並べた円 3 つ。衝突の強さは法線方向の衝突速度で段階:
  軽い接触 (< 8 km/h) = 跳ね返って減速 / 破損 (< 30 km/h) = 停車して修理・空力悪化 / それ以上 = 大破 (レース: リタイア, 予選: その試験は失格)
  人との接触は 3 km/h 以上で重大事故。イベントモードは判定しない */
const Collide={
CS:4, grid:new Map(), owners:new Map(), owner:null, enabled:true, world:"race",   // world: 'race' (ルート) / 'hv' (Hidden Valley) — 座標系が別なので混ぜない
LIGHT:8/3.6, HEAVY:30/3.6, PERSON:3/3.6,
key(i,j){ return i+","+j; },
_put(it){
 const CS=this.CS, x0=Math.floor((it.minx)/CS), x1=Math.floor((it.maxx)/CS), z0=Math.floor((it.minz)/CS), z1=Math.floor((it.maxz)/CS);
 for(let i=x0;i<=x1;i++) for(let j=z0;j<=z1;j++){ const k=this.key(i,j); let a=this.grid.get(k); if(!a) this.grid.set(k,a=[]); a.push(it); }
 it.cells=[x0,x1,z0,z1]; it.w=this.world;
 const o=this.owner; if(o!=null){ let l=this.owners.get(o); if(!l) this.owners.set(o,l=[]); l.push(it); }
 return it;
},
circle(x,z,r,kind="solid"){ if(!Number.isFinite(x+z)) return null; return this._put({t:0,x,z,r,kind,minx:x-r,maxx:x+r,minz:z-r,maxz:z+r}); },
seg(ax,az,bx,bz,r=0.15,kind="wall"){ if(!Number.isFinite(ax+az+bx+bz)) return null; return this._put({t:1,ax,az,bx,bz,r,kind,minx:Math.min(ax,bx)-r,maxx:Math.max(ax,bx)+r,minz:Math.min(az,bz)-r,maxz:Math.max(az,bz)+r}); },
polyline(pts,r=0.15,kind="wall"){ for(let i=0;i<pts.length-1;i++) this.seg(pts[i].x,pts[i].z,pts[i+1].x,pts[i+1].z,r,kind); },
/* 回転箱: 中心 (x,z)、向き h (前方 = (sin h, -cos h))、長さ L (前後)・幅 W */
box(x,z,h,L,W,kind="solid"){ if(!Number.isFinite(x+z+h)) return null; const R=Math.hypot(L,W)/2; return this._put({t:2,x,z,h,L,W,kind,minx:x-R,maxx:x+R,minz:z-R,maxz:z+R}); },
removeOwner(o){ const l=this.owners.get(o); if(!l) return; this.owners.delete(o);
 for(const it of l){ const [x0,x1,z0,z1]=it.cells; for(let i=x0;i<=x1;i++) for(let j=z0;j<=z1;j++){ const k=this.key(i,j), a=this.grid.get(k); if(!a) continue; const p=a.indexOf(it); if(p>=0) a.splice(p,1); if(!a.length) this.grid.delete(k); } } },
clear(world="race"){ for(const o of [...this.owners.keys()]){ const l=this.owners.get(o); if(l.length&&l[0].w===world) this.removeOwner(o); } },
/* 景観の部品 (PR.*) の当たり半径 [m] (0 = 当たらない: 草・低木など踏み越せるもの) */
PR_R:{tree:0.45,palm:0.35,pandanus:0.35,desertoak:0.4,ghost:0.4,redgum:0.5,mango:0.5,mulga:0.3,woodPole:0.2,stobie:0.25,streetLight:0.18,guidePost:0.08,fencePost:0.08,
 termite:0.7,rock:0.6,marbles:2.5,mullock:3.0,tank:1.6,windmill:0.6,tower:3.5,person:0.3,car:2.0,solarCar:2.2,
 houseOutback:6,houseTropical:6,houseBrick:6,shopStrip:8,shed:9,roadhouse:9},
PR_KIND:{person:"person",car:"vehicle",solarCar:"vehicle"},
addPR(name,x,z){ const r=this.PR_R[name]; if(!r) return; this.circle(x,z,r,this.PR_KIND[name]||"solid"); },
/* 車の形 (前後の円) */
carCircles(x,z,h,L,W){ const r=W/2, fx=Math.sin(h), fz=-Math.cos(h), d=Math.max(0,L/2-r), out=[];
 for(const t of [-d,0,d]) out.push([x+fx*t,z+fz*t,r]); return out; },
/* 円 (cx,cz,r) と障害物 it → {pen, nx, nz} (n: 障害物 → 円) */
contact(cx,cz,r,it){
 let px,pz,rr;
 if(it.t===0){ px=it.x; pz=it.z; rr=it.r; }
 else if(it.t===1){ const ex=it.bx-it.ax, ez=it.bz-it.az, L2=ex*ex+ez*ez||1, t=clamp(((cx-it.ax)*ex+(cz-it.az)*ez)/L2,0,1); px=it.ax+ex*t; pz=it.az+ez*t; rr=it.r; }
 else { const fx=Math.sin(it.h), fz=-Math.cos(it.h), rx=Math.cos(it.h), rz=Math.sin(it.h), dx=cx-it.x, dz=cz-it.z;
  const lf=clamp(dx*fx+dz*fz,-it.L/2,it.L/2), lr=clamp(dx*rx+dz*rz,-it.W/2,it.W/2);
  px=it.x+fx*lf+rx*lr; pz=it.z+fz*lf+rz*lr; rr=0;
  if(Math.abs(dx*fx+dz*fz)<=it.L/2&&Math.abs(dx*rx+dz*rz)<=it.W/2){ // 中心が箱の中: 近い面へ押し出す
   const a=it.L/2-Math.abs(dx*fx+dz*fz), b=it.W/2-Math.abs(dx*rx+dz*rz);
   if(a<b){ const s=Math.sign(dx*fx+dz*fz)||1; return {pen:a+r,nx:fx*s,nz:fz*s}; } else { const s=Math.sign(dx*rx+dz*rz)||1; return {pen:b+r,nx:rx*s,nz:rz*s}; } } }
 const dx=cx-px, dz=cz-pz, d=Math.hypot(dx,dz), pen=r+rr-d;
 if(pen<=0) return null;
 return d>1e-6? {pen,nx:dx/d,nz:dz/d} : {pen,nx:Math.sin(it.h||0),nz:-Math.cos(it.h||0)};
},
/* 自車 (中心 x,z・向き h・寸法 L,W) と静的障害物 + 動く障害物 dyn[] の最も深い接触 */
test(x,z,h,L,W,dyn){
 const cs=this.carCircles(x,z,h,L,W); let best=null;
 const consider=(it)=>{ for(const [cx,cz,r] of cs){ const c=this.contact(cx,cz,r,it); if(c&&(!best||c.pen>best.pen)){ best=c; best.it=it; } } };
 const R=L/2+1, CS=this.CS, seen=new Set();
 for(let i=Math.floor((x-R)/CS);i<=Math.floor((x+R)/CS);i++) for(let j=Math.floor((z-R)/CS);j<=Math.floor((z+R)/CS);j++){
  const a=this.grid.get(this.key(i,j)); if(!a) continue; for(const it of a){ if(seen.has(it)||it.w!==this.world) continue; seen.add(it); consider(it); } }
 for(const it of dyn||[]) consider(it);
 return best;
},
/* 移動の途中も調べる (速いときに細い柱をすり抜けないよう 0.4 m ごと): (x0,z0) → st.x,st.z */
sweep(x0,z0,st,L,W,dyn){
 const dx=st.x-x0, dz=st.z-z0, d=Math.hypot(dx,dz), n=Math.min(40,Math.max(1,Math.ceil(d/0.4)));
 for(let k=1;k<=n;k++){ const t=k/n, q={x:x0+dx*t,z:z0+dz*t,h:st.h,v:st.v}; const hit=this.resolve(q,L,W,dyn);
  if(hit){ st.x=q.x; st.z=q.z; st.v=q.v; return hit; } }
 return null;
},
/* 衝突の処理: st = {x,z,h,v} (自車, 世界座標) を書き換え、結果 {level, kind, vn} を返す */
resolve(st,L,W,dyn){
 const c=this.test(st.x,st.z,st.h,L,W,dyn); if(!c) return null;
 const fx=Math.sin(st.h), fz=-Math.cos(st.h);
 const ov=c.it.v||0, ofx=Math.sin(c.it.h||0), ofz=-Math.cos(c.it.h||0);
 const rvx=fx*st.v-ofx*ov, rvz=fz*st.v-ofz*ov;                 // 相対速度
 const vn=Math.max(0,-(rvx*c.nx+rvz*c.nz));                    // 法線方向に近づく速さ
 st.x+=c.nx*(c.pen+0.02); st.z+=c.nz*(c.pen+0.02);             // 押し出し
 const kind=c.it.kind;
 let level= kind==="person"? (vn>this.PERSON?"heavy":"light") : vn>this.HEAVY? "heavy" : vn>this.LIGHT? "damage" : "light";
 if(vn<0.05) level="touch";                                      // こすっているだけ (滑らせる)
 // 速度: 法線成分を消し、軽い接触は少し跳ね返す。破損・大破は停止
 const along=fx*(-c.nz)+fz*c.nx;                                 // 進行方向と壁の接線のなす余弦
 if(level==="touch") st.v*=0.97;
 else if(level==="light") st.v=Math.max(0,st.v*Math.abs(along)*0.5);
 else st.v=0;
 return {level,kind,vn,it:c.it};
},
};
/* 自車の寸法 [長さ, 幅] (実車諸元があればその値) */
function carDims(){ const d=typeof VEH!=="undefined"&&VEH.active&&VEH.spec.dims; return d&&d.L&&d.W? [d.L,d.W] : [4.6,1.8]; }
/* 衝突の強さに応じた処理の文言 */
const COLLIDE_WHAT={person:"人",vehicle:"車両",team:"他チームの車両",wall:"壁・ガードレール",solid:"障害物"};
