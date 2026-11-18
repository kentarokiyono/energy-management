"use strict";
/* ============ タイヤ痕 (路面に残る黒い跡) ============
 タイヤが滑っている (横に滑る・ロック・空転・グリップの使い切り) 車輪の接地点を、前のフレームの点とつないで帯を描く。
 強さ: ロック・空転 1、横に滑る 0.7、使い切る手前 (97 % 以上) は薄く。舗装の上だけ (道の外の土には残さない)。
 決まった数 (MAX 枚) を使い回し、古い跡から消える。場面が変わる (コースの読み直し・ワープ) と消す */
const Skid={
 MAX:3000, W:0.09,
 mesh:null, scene:null, n:0, last:null,
 init(scene){
  if(this.mesh&&this.scene===scene) return;
  this.dispose(); this.scene=scene;
  const g=new THREE.BufferGeometry(), N=this.MAX;
  g.setAttribute("position",new THREE.BufferAttribute(new Float32Array(N*4*3),3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute("color",new THREE.BufferAttribute(new Float32Array(N*4*4),4).setUsage(THREE.DynamicDrawUsage));
  const idx=new Uint32Array(N*6); for(let i=0;i<N;i++){ const a=i*4; idx.set([a,a+1,a+2,a+2,a+1,a+3],i*6); } g.setIndex(new THREE.BufferAttribute(idx,1));
  g.setDrawRange(0,0);
  const m=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  this.mesh=new THREE.Mesh(g,m); this.mesh.frustumCulled=false; this.mesh.renderOrder=1; scene.add(this.mesh); this.n=0; this.last=null;
 },
 clear(){ this.n=0; this.last=null; if(this.mesh){ this.mesh.geometry.setDrawRange(0,0); } },
 dispose(){ if(this.mesh){ if(this.scene) this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); } this.mesh=null; this.scene=null; this.n=0; this.last=null; },
 /* 毎フレーム: 車の位置 (x, z)・向き h (前 = (sin h, −cos h)、右 = (cos h, sin h))・路面の高さ y、車輪ごとのタイヤの状態 (Tire.step の wheels)、舗装の上か */
 frame(scene,x,y,z,h,wheels,paved){
  if(!scene||typeof THREE==="undefined") return;
  this.init(scene);
  if(!wheels||!paved){ this.last=null; return; }
  const sn=Math.sin(h), cs=Math.cos(h), last=this.last||(this.last=[]);
  wheels.forEach((w,i)=>{
   const k= w.lock? 1 : w.slide? 0.7 : (w.use||0)>0.97? 0.25 : 0;
   const px=x+sn*w.px+cs*w.py, pz=z-cs*w.px+sn*w.py;
   const L=last[i];
   if(k>0&&L&&Math.hypot(px-L.x,pz-L.z)>0.05&&Math.hypot(px-L.x,pz-L.z)<3) this.quad(L,{x:px,y,z:pz,k},cs,sn);
   last[i]= k>0? (L&&Math.hypot(px-L.x,pz-L.z)<=0.05? L : {x:px,y,z:pz,k}) : null;
  });
 },
 quad(a,b,cs,sn){
  const g=this.mesh.geometry, P=g.attributes.position.array, C=g.attributes.color.array, i=this.n%this.MAX, o=i*12, c=i*16;
  const dx=b.x-a.x, dz=b.z-a.z, L=Math.hypot(dx,dz)||1, nx=-dz/L*this.W/2, nz=dx/L*this.W/2;   // 帯の幅の向き (進む向きに直角)
  const y0=a.y+0.012, y1=b.y+0.012;
  P.set([a.x+nx,y0,a.z+nz, a.x-nx,y0,a.z-nz, b.x+nx,y1,b.z+nz, b.x-nx,y1,b.z-nz],o);
  const al=0.55; C.set([0.05,0.05,0.05,a.k*al, 0.05,0.05,0.05,a.k*al, 0.05,0.05,0.05,b.k*al, 0.05,0.05,0.05,b.k*al],c);
  this.n++; g.attributes.position.needsUpdate=true; g.attributes.color.needsUpdate=true;
  g.setDrawRange(0,Math.min(this.n,this.MAX)*6);
 },
};
