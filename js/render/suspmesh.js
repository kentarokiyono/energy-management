"use strict";
/* ============ サスペンションの見た目 (車体を透かすと見える) ============
 前: ロアアーム・アッパーアーム (A 字の 2 本ずつ)・アップライト・ばねとダンパー。後ろ: スイングアーム・ばねとダンパー。
 位置は Susp の幾何 (ストロークごとの表) から毎フレーム決める。車体 (car のグループ) の座標: x 右・y 上・z 後ろ、接地点の高さが y = 0 (静止のとき) */
const SuspMesh={
 mats:null,
 mat(){ return this.mats||(this.mats={arm:new THREE.MeshStandardMaterial({color:0x9aa3ad,roughness:0.35,metalness:0.8}),
  up:new THREE.MeshStandardMaterial({color:0x3b4552,roughness:0.5,metalness:0.6}),
  coil:new THREE.MeshStandardMaterial({color:0xf5b51c,roughness:0.4,metalness:0.5}),
  damp:new THREE.MeshStandardMaterial({color:0x22272e,roughness:0.4,metalness:0.7})}); },
 /* 2 点を結ぶ棒 (長さ 1 の円柱を伸ばして向ける) */
 rod(r,m){ const g=new THREE.CylinderGeometry(r,r,1,8); g.translate(0,0.5,0); return new THREE.Mesh(g,m); },
 _up:null, _v:null,
 link(o,a,b){ const v=this._v||(this._v=new THREE.Vector3()), up=this._up||(this._up=new THREE.Vector3(0,1,0)); v.subVectors(b,a); const L=v.length()||1e-4;
  o.position.copy(a); o.quaternion.setFromUnitVectors(up,v.multiplyScalar(1/L)); o.scale.set(1,L,1); },
 /* ばね (長さ 1 のコイル) */
 coilGeo:null,
 coil(){ if(!this.coilGeo){ const pts=[], N=7*24; for(let i=0;i<=N;i++){ const t=i/N, a=t*7*Math.PI*2; pts.push(new THREE.Vector3(Math.cos(a)*0.024,t,Math.sin(a)*0.024)); }
   this.coilGeo=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),N,0.0045,5,false); }
  return new THREE.Mesh(this.coilGeo,this.mat().coil); },
 build(car){
  if(typeof Susp==="undefined"||!car.userData.wheels) return null;
  const p=Susp.params(), M=this.mat(), g=new THREE.Group(); g.visible=false; car.add(g);
  const parts=p.wh.map((w,i)=>{ const o={w,i};
   if(w.geo.kind==="wishbone"){ o.lf=this.rod(0.009,M.arm); o.lr=this.rod(0.009,M.arm); o.uf=this.rod(0.008,M.arm); o.ur=this.rod(0.008,M.arm);
    o.upr=this.rod(0.016,M.up); o.spd=this.rod(0.012,M.up); o.dmp=this.rod(0.011,M.damp); o.cl=this.coil(); [o.lf,o.lr,o.uf,o.ur,o.upr,o.spd,o.dmp,o.cl].forEach(m=>g.add(m)); }
   else { o.arm=this.rod(0.018,M.arm); o.arm2=this.rod(0.018,M.arm); o.dmp=this.rod(0.011,M.damp); o.cl=this.coil(); [o.arm,o.arm2,o.dmp,o.cl].forEach(m=>g.add(m)); }
   return o; });
  return car.userData.susp={g,parts,V:[0,1,2,3,4,5,6,7].map(()=>new THREE.Vector3())};
 },
 /* 毎フレーム: c = 車輪ごとのストローク [m] (縮む +)。車輪のグループの位置もここで決める (アームとつながるように) */
 update(car,c,show){
  const U=car.userData.susp; if(!U) return; U.g.visible=!!show; if(!show) return;
  const p=Susp.params(), W=car.userData.wheels, V=U.V;
  for(const o of U.parts){ const w=o.w, wm=W&&W[o.i]; if(!wm) continue; const wx=wm.g.position.x, wz=wm.g.position.z, sg=wx>=0?1:-1, ci=c[o.i]||0;
   if(w.geo.kind==="wishbone"){ const G=w.geo, s=Susp.geoAt(w,ci), P=(q,dz)=>new THREE.Vector3(wx+sg*q.y,q.z,wz+dz);
    const li=G.li, ui=G.ui, mr=p.mr;
    this.link(o.lf,P(li,-0.13),P(s.L1,0)); this.link(o.lr,P(li,0.13),P(s.L1,0));
    this.link(o.uf,P(ui,-0.10),P(s.U1,0)); this.link(o.ur,P(ui,0.10),P(s.U1,0));
    this.link(o.upr,P(s.L1,0),P(s.U1,0)); this.link(o.spd,P({y:(s.L1.y+s.U1.y)/2,z:(s.L1.z+s.U1.z)/2},0),P(s.wc,0));
    // ばね・ダンパー: ロアアームの mr の所 → 車体 (静止の位置の真上 0.26 m、少し内側)
    const a=V[0].set(wx+sg*(li.y+(s.L1.y-li.y)*mr),li.z+(s.L1.z-li.z)*mr,wz+0.06), b=V[1].set(wx+sg*(li.y+(G.lo.y-li.y)*mr-0.05),li.z+0.26,wz+0.06);
    this.link(o.cl,a,b); const m=V[2].lerpVectors(a,b,0.45); this.link(o.dmp,m,b);
   } else { const L=w.geo.L, an=Math.asin(clamp(ci/L,-0.9,0.9)), pv=V[3].set(wx-0.06,w.R,wz-L), wc=V[4].set(wx-0.06,w.R+ci,wz-L+L*Math.cos(an)), pv2=V[5].set(wx+0.06,w.R,wz-L), wc2=V[6].set(wx+0.06,w.R+ci,wz-L+L*Math.cos(an));
    this.link(o.arm,pv,wc); this.link(o.arm2,pv2,wc2);
    const a=V[0].lerpVectors(pv,wc,0.55), b=V[1].set(a.x,w.R+0.28,a.z-0.04); this.link(o.cl,a,b); const m=V[2].lerpVectors(a,b,0.45); this.link(o.dmp,m,b); }
  }
 },
 /* 車体の姿勢 (th 機首上げ・ph 右が下がる・zb 上へ [m]) に対して、車輪を路面に着けたまま置く。前輪はアームの幾何のキャンバー。
  部品の見た目も合わせる。戻り値: 車輪ごとのストローク */
 pose(car,th,ph,zb){
  const W=car.userData.wheels; if(!W) return null; const cv=car.userData._cv||(car.userData._cv=[]), tp=typeof Susp!=="undefined"? Susp.params() : null;
  W.forEach((w,i)=>{ const x=w.g.position.x, z=w.g.position.z, c=th*z+ph*x-zb; cv[i]=c;
   w.g.position.y=w.r+c; const sw=tp&&tp.wh[i], gm=sw&&sw.geo.tab? Susp.geoAt(sw,c) : null;
   w.g.rotation.order="YZX"; w.g.rotation.z=ph-(gm? (x>=0?1:-1)*gm.camber : 0); });   // 車体のロールを打ち消し、アームの幾何のキャンバーだけ傾ける
  this.update(car,cv,!!P.xray); this.xray(car,!!P.xray); return cv;
 },
 /* 車体を半透明に (アーム・ばねが見える)。材質はこの車だけの複製に差し替え (他の車・ゴーストは変えない)、戻すときは元の材質 */
 xray(car,on){
  const body=car.userData.body; if(!body||!!car.userData._xray===!!on) return; car.userData._xray=!!on;
  const cp=car.userData.canopy, tg=[body]; if(cp&&cp.traverse&&!body.getObjectById(cp.id)) tg.push(cp);   // キャノピーも
  for(const t of tg) t.traverse(o=>{ if(!o.isMesh||!o.material) return;
   if(on){ o.userData._m0=o.material; const mk=m=>{ const c=m.clone(); c.transparent=true; c.opacity=Math.min(m.opacity,0.16); c.depthWrite=false; return c; };
    o.material= Array.isArray(o.material)? o.material.map(mk) : mk(o.material); }
   else if(o.userData._m0){ const cur=o.material; o.material=o.userData._m0; o.userData._m0=null; (Array.isArray(cur)?cur:[cur]).forEach(m=>m.dispose()); } });
 },
};
