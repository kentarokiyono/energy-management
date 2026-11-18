"use strict";
/* ============ 押し出すクルー (砂に埋まったとき) ============
 車の後ろに 2 人。前かがみで両手を車の後ろの縁に当て、車が動くと足を踏み出す (進んだ距離に合わせて歩く)。
 場面の中に置き、車の向きに合わせる (車の傾きには合わせない: 人は地面に立つ)。座標: 車の向きで x 右・z 後ろ */
const PushCrew={
 g:null, scene:null, men:null, ph:0, k:0,
 build(scene){
  if(this.g&&this.scene===scene) return;
  this.dispose(); this.scene=scene;
  const M=c=>new THREE.MeshStandardMaterial({color:c,roughness:0.8}), box=(w,h,d,m)=>new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);
  const shirt=M(0xf28c28), pants=M(0x2b2f3a), skin=M(0xc68e6a), cap=M(0x1f2933);
  const g=new THREE.Group(); g.visible=false;
  this.men=[-0.42,0.42].map((x,i)=>{
   const p=new THREE.Group(); p.position.x=x;
   const legs=[-0.1,0.1].map(lx=>{ const hip=new THREE.Group(); hip.position.set(lx,0.85,0); const l=box(0.14,0.85,0.17,pants); l.position.y=-0.425; hip.add(l); p.add(hip); return hip; });
   const body=new THREE.Group(); body.position.y=0.85; p.add(body);   // 腰を支点に前へ倒す
   const t=box(0.42,0.6,0.24,shirt); t.position.y=0.3; body.add(t);
   const hd=box(0.2,0.22,0.22,skin); hd.position.set(0,0.72,-0.04); body.add(hd); const cp=box(0.22,0.07,0.26,cap); cp.position.set(0,0.85,-0.06); body.add(cp);
   const arms=[-0.26,0.26].map(ax=>{ const sh=new THREE.Group(); sh.position.set(ax,0.55,0); const a=box(0.09,0.58,0.1,shirt); a.position.y=-0.29; sh.add(a); body.add(sh); return sh; });
   g.add(p); return {p,legs,body,arms,off:i*Math.PI};
  });
  scene.add(g); this.g=g;
 },
 dispose(){ if(this.g){ if(this.scene) this.scene.remove(this.g); this.g.traverse(o=>{ if(o.isMesh){ o.geometry.dispose(); o.material.dispose(); } }); } this.g=null; this.scene=null; this.men=null; },
 /* 毎フレーム: on 押しているか、車の位置 (x, y 地面, z)・向き h、速さ v [m/s]、車の長さ L [m] */
 update(scene,on,x,y,z,h,v,L,dt){
  if(!on&&!this.g) return;
  this.build(scene);
  this.k+= ((on?1:0)-this.k)*Math.min(1,dt*4); const vis=this.k>0.02; this.g.visible=vis; if(!vis) return;
  this.g.position.set(x,y,z); this.g.rotation.y=-h;
  this.ph+=Math.abs(v)*dt/0.75*Math.PI;   // 一歩 0.75 m
  const lean=0.9*this.k;
  for(const m of this.men){ m.p.position.z=L/2+0.95+(1-this.k)*1.2; m.body.rotation.x=-lean;   // 手が車の後ろの縁 (高さ約 1 m) に届く位置
   const s=Math.sin(this.ph+m.off)*Math.min(1,Math.abs(v)/0.4+0.15)*0.45;
   m.legs[0].rotation.x=s; m.legs[1].rotation.x=-s;
   for(const a of m.arms) a.rotation.x=Math.PI/2+lean-0.35*this.k; }   // 腕は前 (車の後ろの縁) へ、少し下向き (体を倒した分を戻す)
 },
};
