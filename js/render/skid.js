"use strict";
/* ============ 路面に残る跡 ============
 Skid: タイヤ痕 (黒)。舗装の上で、滑っている (横に滑る・ロック・空転・グリップの使い切り) 車輪の接地点を前のフレームの点とつないで帯を描く。
  強さ: ロック・空転 1、横に滑る 0.7、使い切る手前 (97 % 以上) は薄く。
 Ruts: 土の轍 (茶)。道の外の土・砂の上を転がった車輪の跡。沈んだ深さで濃く・太く。
 どちらも決まった数 (MAX 枚) を使い回し、古い跡から消える。場面が変わる (コースの読み直し・ワープ) と消す */
function makeMarks(o){
 return {
  MAX:o.max||3000, W:o.w, rgb:o.rgb, alpha:o.alpha,
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
  clear(){ this.n=0; this.last=null; if(this.mesh) this.mesh.geometry.setDrawRange(0,0); },
  dispose(){ if(this.mesh){ if(this.scene) this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); } this.mesh=null; this.scene=null; this.n=0; this.last=null; },
  /* 毎フレーム: 車の位置 (x, z)・向き h (前 = (sin h, −cos h)、右 = (cos h, sin h))・路面の高さ y、車輪ごとの {px, py} と強さ k(車輪) (0 で跡なし) */
  frame(scene,x,y,z,h,wheels,kOf){
   if(!scene||typeof THREE==="undefined") return;
   this.init(scene);
   if(!wheels||!kOf){ this.last=null; return; }
   const sn=Math.sin(h), cs=Math.cos(h), last=this.last||(this.last=[]);
   wheels.forEach((w,i)=>{
    const k=kOf(w)||0, px=x+sn*w.px+cs*w.py, pz=z-cs*w.px+sn*w.py, L=last[i], d=L? Math.hypot(px-L.x,pz-L.z) : 0;
    if(k>0&&L&&d>0.05&&d<3) this.quad(L,{x:px,y,z:pz,k});
    last[i]= k>0? (L&&d<=0.05? L : {x:px,y,z:pz,k}) : null;
   });
  },
  quad(a,b){
   const g=this.mesh.geometry, P=g.attributes.position.array, C=g.attributes.color.array, i=this.n%this.MAX, o=i*12, c=i*16;
   const dx=b.x-a.x, dz=b.z-a.z, L=Math.hypot(dx,dz)||1, wa=this.W*(0.7+0.3*Math.min(1,a.k)), wb=this.W*(0.7+0.3*Math.min(1,b.k));
   const ux=-dz/L/2, uz=dx/L/2, y0=a.y+0.012, y1=b.y+0.012;   // 帯の幅の向き (進む向きに直角)
   P.set([a.x+ux*wa,y0,a.z+uz*wa, a.x-ux*wa,y0,a.z-uz*wa, b.x+ux*wb,y1,b.z+uz*wb, b.x-ux*wb,y1,b.z-uz*wb],o);
   const [r,gg,bb]=this.rgb, A=this.alpha, ka=Math.min(1,a.k)*A, kb=Math.min(1,b.k)*A;
   C.set([r,gg,bb,ka, r,gg,bb,ka, r,gg,bb,kb, r,gg,bb,kb],c);
   this.n++; g.attributes.position.needsUpdate=true; g.attributes.color.needsUpdate=true;
   g.setDrawRange(0,Math.min(this.n,this.MAX)*6);
  },
 };
}
const Skid=makeMarks({w:0.09,rgb:[0.05,0.05,0.05],alpha:0.55});
const Ruts=makeMarks({w:0.12,rgb:[0.24,0.17,0.11],alpha:0.6,max:4000});
/* 強さ: タイヤ痕 (滑り) と轍 (土の上を転がる、沈んだ深さ sink [m] で濃く) */
Skid.kOf=w=> w.lock? 1 : w.slide? 0.7 : (w.use||0)>0.97? 0.25 : 0;
Ruts.kOfSink=sink=>(w=>0.45+Math.min(0.55,(sink||0)*12));
