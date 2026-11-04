"use strict";
const Test={
active:false, kind:"circuit", state:"ready",
scene:null, camera:null, car:null, carBody:null, canopy:null,
x:0,z:0,heading:0,v:0, t:0, tSide:0,
laps:[], best:null, progress:0, lastIdx:0, prevLapIdx:undefined, trackPts:null, trackN:0,
cones:[], coneHit:false, brakeEntry:null, brakeDist:null,
f8:{accA:0,accB:0,prevA:null,prevB:null,moved:0,sides:[],done:[],count:0,best8:null},
startHeading:0, grade:0,
start(kind){
this.kind=kind; this.active=true;
if(!View.renderer){
const canvas=document.getElementById("three-canvas");
View.renderer=new THREE.WebGLRenderer({canvas,antialias:true});
View.renderer.setSize(innerWidth,innerHeight);
View.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
}
if(!this._resizeBound){ this._resizeBound=true;
addEventListener("resize",()=>{ if(Test.active&&Test.camera){ View.renderer.setSize(innerWidth,innerHeight);
Test.camera.aspect=innerWidth/innerHeight; Test.camera.updateProjectionMatrix(); } });
}
this.scene=new THREE.Scene();
this.scene.background=new THREE.Color(0x8fc3ef);
setupRenderQuality(View.renderer,this.scene);
this.camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,0.1,4000);
this.scene.add(new THREE.HemisphereLight(0xcfe8ff,0x7a6a48,1.0));
const sun=new THREE.DirectionalLight(0xfff2cc,1.2); sun.position.set(200,400,150); this.scene.add(sun);
sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
Object.assign(sun.shadow.camera,{left:-9,right:9,top:9,bottom:-9,near:800,far:2600});
this.scene.add(sun.target);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(9000,9000),
new THREE.MeshLambertMaterial({color:this.kind==="circuit"?0x94804f:0x8b7a55}));
ground.rotation.x=-Math.PI/2; ground.position.y=-0.12; ground.receiveShadow=true; this.scene.add(ground);
const m=View.buildCarModelImpl();
this.car=m.group; this.carBody=m.body; this.canopy=m.canopy;
this.scene.add(this.car);
this.laps=[]; this.best=null; this.prevLapIdx=undefined;
if(kind==="circuit") this.buildCircuit();
else if(kind==="fig8") this.buildFig8();
else this.buildStrip();
this.retry();
},
ribbon(pts,halfW,color,yOff,clampInner,mat){
const n=pts.length, verts=[],norms=[],idx=[],uvs=[];
for(let i=0;i<=n;i++){
const im=i%n;
const a=pts[im], b=pts[(im+1)%n], pr=pts[(im-1+n)%n];
const dx=b.x-a.x, dz=b.z-a.z, L=Math.hypot(dx,dz)||1;
const nx=-dz/L, nz=dx/L;
let offR=halfW, offL=halfW;
if(clampInner){
const h1=Math.atan2(a.x-pr.x,-(a.z-pr.z)), h2=Math.atan2(dx,-dz);
let dh=h2-h1; if(dh>Math.PI)dh-=2*Math.PI; if(dh<-Math.PI)dh+=2*Math.PI;
const c=Math.abs(dh)/L;
if(c>1e-4){ const lim=0.85/c; if(dh>0) offR=Math.min(offR,lim); else offL=Math.min(offL,lim); }
}
verts.push(a.x+nx*offR,a.y+yOff,a.z+nz*offR, a.x-nx*offL,a.y+yOff,a.z-nz*offL);
uvs.push((a.x+nx*offR)/1.5,(a.z+nz*offR)/1.5, (a.x-nx*offL)/1.5,(a.z+nz*offL)/1.5);
norms.push(0,1,0,0,1,0);
if(i>0){ const k=(i-1)*2; idx.push(k,k+1,k+2, k+1,k+3,k+2); }
}
const g=new THREE.BufferGeometry();
g.setAttribute("position",new THREE.Float32BufferAttribute(verts,3));
g.setAttribute("normal",new THREE.Float32BufferAttribute(norms,3));
g.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
g.setIndex(idx);
return new THREE.Mesh(g, mat||new THREE.MeshLambertMaterial({color,side:THREE.DoubleSide,map:GRAIN}));
},
asphMat(){ if(!this._asphMat) this._asphMat=new THREE.MeshLambertMaterial({map:roadTextures().asph,side:THREE.DoubleSide}); return this._asphMat; },
embankment(pts,offIn,offOut,color){
const n=pts.length, grp=new THREE.Group();
for(const side of [1,-1]){
const verts=[],norms=[],idx=[],uvs=[]; let vi=0;
for(let i=0;i<=n;i++){
const im=i%n, a=pts[im], b=pts[(im+1)%n], pr=pts[(im-1+n)%n];
const dx=b.x-a.x,dz=b.z-a.z,L=Math.hypot(dx,dz)||1;
const nx=-dz/L,nz=dx/L;
let oi=offIn,oo=offOut;
const h1=Math.atan2(a.x-pr.x,-(a.z-pr.z)),h2=Math.atan2(dx,-dz);
let dh=h2-h1; if(dh>Math.PI)dh-=2*Math.PI; if(dh<-Math.PI)dh+=2*Math.PI;
const c=Math.abs(dh)/L;
if(c>1e-4 && Math.sign(dh)===side){ const r=1/c; oi=Math.min(oi,0.8*r); oo=Math.min(oo,0.9*r); }
const x0=a.x+nx*side*oi,z0=a.z+nz*side*oi,x1=a.x+nx*side*oo,z1=a.z+nz*side*oo;
verts.push(x0, a.y-0.06, z0, x1, -0.1, z1);
uvs.push(x0/1.5,z0/1.5, x1/1.5,z1/1.5);
norms.push(0,1,0, 0,1,0);
if(i>0){const q=vi-2;idx.push(q,q+1,q+2,q+1,q+3,q+2);}
vi+=2;
}
const g=new THREE.BufferGeometry();
g.setAttribute("position",new THREE.Float32BufferAttribute(verts,3));
g.setAttribute("normal",new THREE.Float32BufferAttribute(norms,3));
g.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
g.setIndex(idx);
grp.add(new THREE.Mesh(g,new THREE.MeshLambertMaterial({color,side:THREE.DoubleSide,map:GRAIN})));
}
return grp;
},
openStrip(idxA,idxB,offL,offR,yOff,color,basic){
const pts=this.trackPts,n=this.trackN;
const verts=[],norms=[],idx=[],uvs=[];
let vi=0;
const count=((idxB-idxA)%n+n)%n;
for(let k=0;k<=count;k++){
const i=(idxA+k)%n, j=(i+1)%n;
const a=pts[i],b=pts[j];
const dx=b.x-a.x,dz=b.z-a.z,L=Math.hypot(dx,dz)||1;
const nx=-dz/L,nz=dx/L;
verts.push(a.x+nx*offL,a.y+yOff,a.z+nz*offL, a.x+nx*offR,a.y+yOff,a.z+nz*offR);
uvs.push((a.x+nx*offL)/1.5,(a.z+nz*offL)/1.5, (a.x+nx*offR)/1.5,(a.z+nz*offR)/1.5);
norms.push(0,1,0,0,1,0);
if(k>0){const q=vi-2;idx.push(q,q+1,q+2,q+1,q+3,q+2);}
vi+=2;
}
const g=new THREE.BufferGeometry();
g.setAttribute("position",new THREE.Float32BufferAttribute(verts,3));
g.setAttribute("normal",new THREE.Float32BufferAttribute(norms,3));
g.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
g.setIndex(idx);
const mat=basic?new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,map:GRAIN})
:new THREE.MeshLambertMaterial({color,side:THREE.DoubleSide,map:GRAIN});
return new THREE.Mesh(g,mat);
},
wallStrip(idxA,idxB,off,hgt,color){
const pts=this.trackPts,n=this.trackN;
const verts=[],norms=[],idx=[];
let vi=0;
const count=((idxB-idxA)%n+n)%n;
for(let k=0;k<=count;k++){
const i=(idxA+k)%n, j=(i+1)%n;
const a=pts[i],b=pts[j];
const dx=b.x-a.x,dz=b.z-a.z,L=Math.hypot(dx,dz)||1;
const nx=-dz/L,nz=dx/L;
verts.push(a.x+nx*off,a.y,a.z+nz*off, a.x+nx*off,a.y+hgt,a.z+nz*off);
norms.push(nx,0,nz, nx,0,nz);
if(k>0){const q=vi-2;idx.push(q,q+1,q+2,q+1,q+3,q+2);}
vi+=2;
}
const g=new THREE.BufferGeometry();
g.setAttribute("position",new THREE.Float32BufferAttribute(verts,3));
g.setAttribute("normal",new THREE.Float32BufferAttribute(norms,3));
g.setIndex(idx);
return new THREE.Mesh(g,new THREE.MeshLambertMaterial({color,side:THREE.DoubleSide}));
},
buildCircuit(){
const cps=[
[150,82,2],[287,150,4],[315,161,5],[331,180,6],[318,197,6],[291,195,5],[266,180,5],
[244,160,6],[224,140,6],[201,130,6],[178,120,7],[158,134,9],[144,160,12],[137,184,14],
[134,197,15],[124,200,15],[114,196,15],[112,182,14],[111,154,12],[112,128,10],[111,115,10],
[100,109,9],[84,104,8],[69,104,8],[54,108,8],[38,100,7],[24,85,6],[15,72,5],[14,60,4],
[17,48,3],[24,38,2],[40,33,1],[64,40,1]];
const curve=new THREE.CatmullRomCurve3(cps.map(p=>new THREE.Vector3(p[0],p[2],-p[1])),true,"catmullrom",0.5);
const pts=curve.getSpacedPoints(900); pts.pop();
let len=0;
for(let i=0;i<pts.length;i++){ const a=pts[i],b=pts[(i+1)%pts.length]; len+=Math.hypot(b.x-a.x,b.z-a.z); }
const sc=2870/len;
pts.forEach(p=>{p.x*=sc;p.z*=sc;});
this.trackPts=pts; this.trackN=pts.length;
const n=pts.length;
const curv=new Array(n);
for(let i=0;i<n;i++){
const a=pts[(i-1+n)%n],b=pts[i],c=pts[(i+1)%n];
const h1=Math.atan2(b.x-a.x,-(b.z-a.z)), h2=Math.atan2(c.x-b.x,-(c.z-b.z));
let dh=h2-h1; if(dh>Math.PI)dh-=2*Math.PI; if(dh<-Math.PI)dh+=2*Math.PI;
curv[i]=dh/(Math.hypot(c.x-b.x,c.z-b.z)||1);
}
this.scene.add(this.ribbon(pts,14,0x5d7c3c,-0.03,true));
this.scene.add(this.embankment(pts,14,42,0xa9835a));
this.scene.add(this.ribbon(pts,7.2,0xe8e6da,-0.012));
this.scene.add(this.ribbon(pts,6.5,0x30333a,0,false,
new THREE.MeshLambertMaterial({color:0xffffff,side:THREE.DoubleSide,map:roadTextures().asph})));
const zones=[];
let zs=-1;
for(let i=0;i<n+1;i++){
const c=Math.abs(curv[i%n])>1/260;
if(c&&zs<0) zs=i;
if(!c&&zs>=0){ if(i-zs>5) zones.push([zs,i-1]); zs=-1; }
}
for(const [a,b] of zones){
let sum=0,maxC=0;
for(let i=a;i<=b;i++){ sum+=curv[i%n]; maxC=Math.max(maxC,Math.abs(curv[i%n])); }
const side=Math.sign(sum)||1;
const tight=maxC>1/45;
const inCols=tight?[0xf97316,0xf5f2e8]:[0xd93a2b,0xf2d21f];
const outCols=[0x2fb9a8,0xf5f2e8];
const a2=(a-4+n)%n, b2=(b+4)%n;
const cnt=((b2-a2)%n+n)%n;
for(let k=0;k<cnt;k+=3){
const i0=(a2+k)%n, i1=(a2+Math.min(k+3,cnt))%n;
const ci=Math.floor(k/3)%2;
this.scene.add(this.openStrip(i0,i1,side*6.4,side*7.9,0.02,inCols[ci],true));
this.scene.add(this.openStrip(i0,i1,-side*6.4,-side*7.9,0.018,outCols[ci],true));
}
}
let straightEnd=0;
for(let i=0;i<n;i++){
const a=pts[i],b=pts[(i+1)%n];
if((b.x-a.x)>0 && Math.abs(a.z-pts[0].z)<14*sc && Math.abs(curv[i])<1/800) straightEnd=i;
else if(i>20) break;
}
this.scene.add(this.wallStrip(0,straightEnd,9.5,0.9,0xd8d6cd));
this.scene.add(this.wallStrip(0,straightEnd,-9.5,0.9,0xd8d6cd));
if(zones.length){
const [a,b]=zones[0];
const cnt=((b-a)%n+n)%n;
for(let k=0;k<cnt;k+=4){
this.scene.add(this.wallStrip((a+k)%n,(a+Math.min(k+4,cnt))%n,-Math.sign(curv[(a+2)%n])*13,1.0,
(Math.floor(k/4)%2)?0xf5f2e8:0xe8722a));
}
}
const p0=pts[0],p1=pts[14];
const h=Math.atan2(p1.x-p0.x,-(p1.z-p0.z));
this.startHeading=h;
const dirX=Math.sin(h), dirZ=-Math.cos(h), rnX=Math.cos(h), rnZ=Math.sin(h);
const gate=new THREE.Group();
for(const sx of [-10,10]){ const pl=new THREE.Mesh(new THREE.BoxGeometry(0.5,7,0.5),
new THREE.MeshLambertMaterial({color:0xdddddd})); pl.position.set(sx,3.5,0); gate.add(pl); }
const beam=new THREE.Mesh(new THREE.BoxGeometry(20.5,1.1,0.8),new THREE.MeshLambertMaterial({color:0xf97316}));
beam.position.y=7; gate.add(beam);
const sl=new THREE.Mesh(new THREE.BoxGeometry(13,0.03,1.0),new THREE.MeshBasicMaterial({color:0xffffff}));
sl.position.y=0.03; gate.add(sl);
gate.position.copy(p0); gate.rotation.y=-h; this.scene.add(gate);
const at=(alongM,latM,y=0)=>new THREE.Vector3(p0.x+dirX*alongM+rnX*latM, y, p0.z+dirZ*alongM+rnZ*latM);
const addBox=(w,hh,d,color,alongM,latM,rotExtra=0)=>{
const bx=new THREE.Mesh(new THREE.BoxGeometry(w,hh,d),new THREE.MeshLambertMaterial({color}));
bx.position.copy(at(alongM,latM,hh/2)); bx.rotation.y=-h+rotExtra; this.scene.add(bx); return bx; };
const drag=new THREE.Mesh(new THREE.BoxGeometry(20,0.04,860),new THREE.MeshLambertMaterial({color:0x4a4d54}));
drag.position.copy(at(400,26,0)); drag.rotation.y=-h; this.scene.add(drag);
const ret=new THREE.Mesh(new THREE.BoxGeometry(8,0.035,860),new THREE.MeshLambertMaterial({color:0x565961}));
ret.position.copy(at(400,44,0)); ret.rotation.y=-h; this.scene.add(ret);
addBox(16,0.06,26,0x2557b8,55,26);
addBox(3,3.4,3,0xcfd4d9,35,13);
for(let k=0;k<6;k++) addBox(28,1.4,0.4,0xe8e5dc,220+k*40,52);
addBox(60,6,10,0x8a8f96,260,66);
addBox(34,4,12,0xe8e5dc,340,68);
addBox(6,14,6,0xd9dde2,300,72);
addBox(10,3,6,0xcabfa8,520,14);
addBox(10,3,6,0xcabfa8,650,14);
const pad=new THREE.Mesh(new THREE.BoxGeometry(70,0.03,180),new THREE.MeshLambertMaterial({color:0xb9b3a4}));
pad.position.copy(at(180,95,0)); pad.rotation.y=-h; this.scene.add(pad);
const tightZones=zones.filter(([a,b])=>{ let mc=0; for(let i=a;i<=b;i++) mc=Math.max(mc,Math.abs(curv[i%n])); return mc>1/55; });
for(const [a,b] of tightZones){
const side=Math.sign((()=>{let s=0;for(let i=a;i<=b;i++)s+=curv[i%n];return s;})())||1;
const cnt=((b-a)%n+n)%n;
let bi=0;
for(let k=0;k<cnt;k+=4){
const p=pts[(a+k)%n], q=pts[(a+k+1)%n];
const dx=q.x-p.x,dz=q.z-p.z,L=Math.hypot(dx,dz)||1, nx=-dz/L,nz=dx/L;
const bnd=new THREE.Mesh(new THREE.BoxGeometry(2.6,0.9,1.3),
new THREE.MeshLambertMaterial({color:(bi++%2)?0x2557b8:0xf97316}));
bnd.position.set(p.x-nx*side*10, p.y+0.45, p.z-nz*side*10);
bnd.rotation.y=-Math.atan2(dx,-dz);
this.scene.add(bnd);
}
}
},
buildStrip(){
const dragTex=roadTextures().asph.clone(); dragTex.needsUpdate=true; dragTex.repeat.set(187,6);
const road=new THREE.Mesh(new THREE.BoxGeometry(560,0.05,18),new THREE.MeshLambertMaterial({map:dragTex}));
road.position.set(70,0,0); this.scene.add(road);
const line=(x,color,w=0.5)=>{ const l=new THREE.Mesh(new THREE.BoxGeometry(w,0.03,18),
new THREE.MeshBasicMaterial({color})); l.position.set(x,0.05,0); this.scene.add(l); return l; };
line(0,0xffffff,0.6);
this.cones=[]; this.coneHit=false;
if(this.kind==="slalom"){
line(126,0xf97316,0.8);
for(let i=0;i<7;i++){
const c=new THREE.Mesh(new THREE.ConeGeometry(0.28,0.75,10),
new THREE.MeshLambertMaterial({color:0xff4d00}));
c.position.set(9+i*18,0.38,0);
this.scene.add(c); this.cones.push(c); c.userData.hit=false;
}
} else {
line(14,0xdd2222,0.6);
for(const d of [5,10]) line(d,0x888888,0.25);
}
},
buildFig8(){
for(const cx of [-8.5,8.5]){
const ring=new THREE.Mesh(new THREE.RingGeometry(6,11,64),
new THREE.MeshLambertMaterial({color:0x8d9096,side:THREE.DoubleSide}));
ring.rotation.x=-Math.PI/2; ring.position.set(cx,0.02,0); this.scene.add(ring);
const inner=new THREE.Mesh(new THREE.CircleGeometry(6,48),
new THREE.MeshLambertMaterial({color:0xd9d2c0}));
inner.rotation.x=-Math.PI/2; inner.position.set(cx,0.015,0); this.scene.add(inner);
const dot=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.15,0.5,8),
new THREE.MeshBasicMaterial({color:0xdd2222}));
dot.position.set(cx,0.25,0); this.scene.add(dot);
}
const sl=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.03,5),new THREE.MeshBasicMaterial({color:0xffffff}));
sl.position.set(0,0.05,0); this.scene.add(sl);
},
retry(){
show("test-result",false);
const es=Engine.st;
es.throttleSet=0; es.brakePhys=0; es.brakeRegen=0;
this.v=0; this.t=0; this.tSide=0; this.state="ready"; this.progress=0; this.prevLapIdx=undefined;
this.coneHit=false; this.brakeEntry=null; this.brakeDist=null;
this.f8={accA:0,accB:0,prevA:null,prevB:null,moved:0,sides:[],done:[],count:0,best8:null};
if(this.kind==="circuit"){
const p=this.trackPts[0];
this.x=p.x; this.z=p.z; this.heading=this.startHeading; this.lastIdx=0;
toast("🏁 Hot Lap ― スタンディングスタート。ベストラップでグリッド決定!","#34d399");
} else if(this.kind==="slalom"){
this.x=-45; this.z=0; this.heading=Math.PI/2;
this.cones.forEach(c=>{c.userData.hit=false;c.rotation.set(0,0,0);c.position.y=0.38;});
toast("〰 白線から計測開始。パイロン7本(18m間隔)を縫って126m先のオレンジ線へ ― 11.5秒未満","#34d399");
} else if(this.kind==="brake"){
this.x=-220; this.z=0; this.heading=Math.PI/2;
toast("🛑 40km/h以上で白線を通過し、14m(赤線)以内に完全停止","#34d399");
} else {
this.x=0; this.z=0; this.heading=0;
toast("∞ 白マーカーから発進。片側9秒未満・合計18秒未満。コースアウト無効","#34d399");
}
},
nearestIdx(){
const pts=this.trackPts,n=this.trackN;
let best=this.lastIdx,bd=1e18;
for(let k=-80;k<=80;k++){
const i=((this.lastIdx+k)%n+n)%n;
const d=(pts[i].x-this.x)**2+(pts[i].z-this.z)**2;
if(d<bd){bd=d;best=i;}
}
this.lastIdx=best;
return {i:best,d:Math.sqrt(bd)};
},
frame(dtR){
const es=Engine.st;
const sol=Engine.solarCalc(-12.46,12,false);
const Tamb=32;
const Tcell=cellTempSS(Tamb,sol.G,this.v+1,false);
const tempLoss=clamp(1-PANEL_TYPES[P.panel].gamma*Math.max(0,Tcell-25),0.6,1);
const Psolar=P.arrayArea*P.cellEff*tempLoss*P.mpptEff*sol.G*PRO.solarScale;
es.lastSolar=Psolar; es.lastGeff=sol.G; es.lastTcell=Tcell; es.Tamb=Tamb; es.sunAlt=sol.alt;
let grade=0, offTrack=false;
if(this.kind==="circuit"&&this.trackPts){
const near=this.nearestIdx();
const pts=this.trackPts,n=this.trackN;
const a=pts[near.i], b=pts[(near.i+1)%n];
grade=(b.y-a.y)/(Math.hypot(b.x-a.x,b.z-a.z)||1);
offTrack=near.d>6.5;
}
this.grade=grade;
const m=massTotal(), mEff=m+PRO.mRot;
const Froll=Phys.crr(this.v)*m*9.81+motorIronW(this.v)/Math.max(this.v,0.5);
const Fdrag=0.5*Phys.airDensity(20,Tamb)*P.Cd*P.frontal*this.v*this.v;
const Fcorner=0.15*m*9.81*(es.gLat||0)*(es.gLat||0);
const Fslope=m*9.81*grade;
let thr=es.throttleSet;
if(es.brakePhys>0.05||es.brakeRegen>0.05){ thr=0; es.throttleSet=0; }
const I_cmd=thr*P.motorMaxA;
const mmT=motorModel(I_cmd,this.v,es.soc,es.powerMode);
const Ftrac=mmT.F;
let Fbrake=0,Pregen=0;
if(es.brakePhys>0) Fbrake+=es.brakePhys*PRO.brakeMu*m*9.81;
if(es.brakeRegen>0){ const lowSpd=clamp(this.v/2.2,0,1);
const Fr=es.brakeRegen*P.regenStrength*clamp(40+this.v*3,0,180)*lowSpd;
const Ir=Fr/PRO.kt;
Fbrake+=Fr; Pregen=Math.max(0,Fr*this.v*PRO.regenEff-Ir*Ir*PRO.rWinding); }
if(offTrack&&this.v>1) Fbrake+=m*clamp(this.v*0.12,0.2,2.5);
const FnetT=Ftrac-Froll-Fdrag-Fslope-Fbrake-Fcorner;
this.v=Math.max(0,this.v+FnetT/mEff*dtR);
es.gLong=(FnetT/mEff)/9.81;
const Pmotor=Math.max(0,mmT.Pelec-Pregen);
es.lastAmp=I_cmd; es.lastMotorW=Pmotor;
const Pnet=Pmotor+P.auxW-Psolar;
const Voc=VOC(es.soc), R=Phys.rInt(es.Tbat,es.soc);
const Ibat=Phys.battCurrent(Voc,R,Pnet);
es.lastVterm=Math.max(0,Voc-Ibat*R);
if(P.infiniteBattery) es.soc=clamp(PRO.startSoc,0.5,1);
else es.soc=clamp(es.soc-(Ibat*dtR)/(CAP_AH()*3600),0,1);
es.lastIbat=Ibat; es.lastNet=Pnet;
if(Ibat>0) es.ahUsed+=Ibat*dtR/3600;
es.v=this.v;
if(this.v>0.3){
const yawRate=Input.steer*clamp(8.5/Math.max(this.v,3),0.15,1.2);
this.heading+=yawRate*dtR;
es.gLat=(yawRate*this.v)/9.81;
} else es.gLat=0;
this.x+=Math.sin(this.heading)*this.v*dtR;
this.z-=Math.cos(this.heading)*this.v*dtR;
if(this.state!=="done") this.judge(dtR);
let carY=0;
if(this.kind==="circuit"&&this.trackPts) carY=this.trackPts[this.lastIdx].y;
this.car.position.set(this.x,carY,this.z);
this.car.rotation.y=-this.heading;
this.car.rotation.x=-Math.atan(grade)*0.8;
if(this.car.userData.brakeMat)
this.car.userData.brakeMat.color.setHex((es.brakePhys>0.05||es.brakeRegen>0.05)?0xff2222:0x4a0505);
updateWinkers(this.car,es);
View.updateDash(es);
if(View.yokeMesh) View.yokeMesh.rotation.z=-Input.steer*.9; // 右ステア→右へ回転
const hCar=this.heading, cx=this.x, cy=carY, cz=this.z;
let camPos,lookAt;
if(View.cam===0){
camPos=new THREE.Vector3(cx-Math.sin(hCar)*11,cy+4.2,cz+Math.cos(hCar)*11);
lookAt=new THREE.Vector3(cx+Math.sin(hCar)*20,cy+1.1,cz-Math.cos(hCar)*20);
this.camera.position.lerp(camPos,clamp(dtR*5,0,1));
} else if(View.cam===1){
camPos=new THREE.Vector3(cx-Math.sin(hCar)*1.8,cy+1.45,cz+Math.cos(hCar)*1.8);
lookAt=new THREE.Vector3(cx+Math.sin(hCar)*40,cy+1.0,cz-Math.cos(hCar)*40);
this.camera.position.copy(camPos);
} else if(View.cam===2){
this.car.updateMatrixWorld();
camPos=new THREE.Vector3(0,.84,-.45).applyMatrix4(this.car.matrixWorld);
lookAt=new THREE.Vector3(0,.76,-30).applyMatrix4(this.car.matrixWorld);
this.camera.position.copy(camPos);
} else {
camPos=new THREE.Vector3(cx+Math.sin(hCar)*0.3,cy+2.2,cz-Math.cos(hCar)*0.3);
lookAt=new THREE.Vector3(cx-Math.sin(hCar)*60,cy+1.2,cz+Math.cos(hCar)*60);
this.camera.position.copy(camPos);
}
if(this.canopy) this.canopy.visible=(View.cam!==2);
this.camera.lookAt(lookAt);
View.renderer.render(this.scene,this.camera);
updateHUD();
document.getElementById("hud-clock").textContent={circuit:"HOT LAP",slalom:"SLALOM",brake:"BRAKE",fig8:"FIGURE-8"}[this.kind];
document.getElementById("hud-dist").textContent=(this.v*3.6).toFixed(0)+" km/h";
document.getElementById("hud-nextcp").textContent={circuit:"目標 2:20台",slalom:"目標 <11.5s",brake:"40km/h→14m",fig8:"9s / 18s"}[this.kind];
document.getElementById("hud-limit").textContent="―";
this.updateTestHud(); drawG();
Snd.update(this.v, es.lastAmp/Math.max(P.motorMaxA,1), false);
},
judge(dtR){
const k=this.kind;
if(k==="circuit"){
if(this.state==="ready"&&this.v>0.5){ this.state="run"; this.t=0; }
if(this.state==="run"){
this.t+=dtR;
const i=this.lastIdx, n=this.trackN;
if(this.prevLapIdx!==undefined){
let diff=i-this.prevLapIdx;
if(diff<-n/2) diff+=n; if(diff>n/2) diff-=n;
this.progress+=diff;
if(this.progress>=n){
this.progress-=n;
this.laps.push(this.t);
if(!this.best||this.t<this.best) this.best=this.t;
toast(`🏁 LAP ${this.laps.length}: ${fmtLap(this.t)}${this.t===this.best?" (BEST)":""}`,"#34d399");
Snd.chime();
this.t=0;
}
}
this.prevLapIdx=i;
}
} else if(k==="slalom"){
if(this.state==="ready"&&this.x>0){ this.state="run"; this.t=0; }
if(this.state==="run"){
this.t+=dtR;
for(const c of this.cones){
if(!c.userData.hit&&Math.hypot(c.position.x-this.x,c.position.z-this.z)<1.5){
c.userData.hit=true; this.coneHit=true;
c.rotation.z=1.3; c.position.y=0.15; Snd.bang();
toast("💥 パイロン接触!","#ef4444");
}
}
if(Math.abs(this.z)>8.5&&this.x<126) this.coneHit=true;
if(this.x>=126){
this.state="done";
const pass=this.t<11.5&&!this.coneHit;
this.finish(pass?"✅ 合格":"❌ 不合格",[
["タイム",this.t.toFixed(2)+" 秒 (規定 11.5秒未満)"],
["パイロン",this.coneHit?"接触あり/コース逸脱":"クリーン"],
["判定",pass?"車検通過!":"要再試験"]],pass);
}
}
} else if(k==="brake"){
if(this.state==="ready"&&this.x>0){
this.state="run"; this.brakeEntry=this.v; this.t=0;
toast(`計測開始!進入 ${(this.v*3.6).toFixed(1)} km/h ― 全力制動!`,"#fbbf24");
}
if(this.state==="run"){
this.t+=dtR;
if(this.v<0.3){
this.state="done";
this.brakeDist=this.x;
const entryOK=this.brakeEntry*3.6>=35;
const pass=entryOK&&this.brakeDist<=14;
this.finish(pass?"✅ 合格":(entryOK?"❌ 不合格":"⚠ 無効(進入速度不足)"),[
["進入速度",(this.brakeEntry*3.6).toFixed(1)+" km/h (35以上)"],
["制動距離",this.brakeDist.toFixed(2)+" m (規定 14m以内)"],
["平均減速度",(this.brakeEntry**2/(2*Math.max(this.brakeDist,0.1))).toFixed(2)+" m/s²"]],pass);
}
}
} else {
const f=this.f8;
if(this.state==="ready"&&this.v>0.5){ this.state="run"; this.t=0; this.tSide=0; }
if(this.state!=="run") return;
this.t+=dtR; this.tSide+=dtR;
f.moved+=this.v*dtR;
const aA=Math.atan2(this.z,this.x+8.5), aB=Math.atan2(this.z,this.x-8.5);
if(f.prevA!==null){
let dA=aA-f.prevA; if(dA>Math.PI)dA-=2*Math.PI; if(dA<-Math.PI)dA+=2*Math.PI;
let dB=aB-f.prevB; if(dB>Math.PI)dB-=2*Math.PI; if(dB<-Math.PI)dB+=2*Math.PI;
f.accA+=dA; f.accB+=dB;
}
f.prevA=aA; f.prevB=aB;
const rA=Math.hypot(this.x+8.5,this.z), rB=Math.hypot(this.x-8.5,this.z);
const onCourse=(rA>=5.5&&rA<=11.5)||(rB>=5.5&&rB<=11.5);
if(!onCourse&&f.moved>2){
this.state="done";
this.finish("❌ コースアウト(無効)",[["経過",this.t.toFixed(2)+" 秒"],["","Backspaceでリトライ"]],false);
return;
}
const doneSide=(which)=>{
const sideT=this.tSide;
f.sides.push(sideT); f.done.push(which);
f.accA=0; f.accB=0; this.tSide=0;
const n=f.done.length;
if(n>=2 && f.done[n-1]!==f.done[n-2]){
const s1=f.sides[n-2], s2=f.sides[n-1], tot=s1+s2;
const ok=s1<9&&s2<9&&tot<18;
f.count=(f.count||0)+1;
if(ok && (!f.best8||tot<f.best8)) f.best8=tot;
toast(`${which} ${sideT.toFixed(2)}s ― 8の字#${f.count} 計${tot.toFixed(2)}s ${ok?"✅":"❌"}`, ok?"#34d399":"#f59e0b");
Snd.chime();
} else {
toast(`${which} 完了: ${sideT.toFixed(2)}秒`,"#34d399"); Snd.chime();
}
};
if(Math.abs(f.accA)>=2*Math.PI) doneSide("左円");
else if(Math.abs(f.accB)>=2*Math.PI) doneSide("右円");
}
},
finish(title,rows,pass){
document.getElementById("test-result-title").textContent=title;
document.getElementById("test-result-title").style.color=pass?"#34d399":"#f87171";
document.getElementById("test-result-body").innerHTML=
rows.map(r=>`<div class="flex justify-between gap-6"><span class="text-cyan-100/60">${r[0]}</span><span>${r[1]}</span></div>`).join("");
show("test-result",true);
if(pass) Snd.chime(); else Snd.alarm();
},
updateTestHud(){
const tm=document.getElementById("test-timer"), sub=document.getElementById("test-sub");
if(this.kind==="circuit"){
tm.textContent=this.state==="run"?fmtLap(this.t):"READY";
sub.textContent=`LAP ${this.laps.length+1} ― BEST ${this.best?fmtLap(this.best):"―"}${this.best?` / 推定グリッド P${clamp(Math.round(1+(this.best-141)/3),1,40)}`:""}`;
} else if(this.kind==="fig8"){
const f=this.f8;
tm.textContent=this.tSide.toFixed(2);
const recent=f.sides.slice(-2).map(s=>s.toFixed(2)+"s").join(" / ");
sub.textContent=`現在の円 ${this.tSide.toFixed(2)}s ― 8の字${f.count||0}本 / ベスト計${f.best8?f.best8.toFixed(2)+"s":"―"} ${recent?"("+recent+")":"| 発進で計測開始"}`;
} else if(this.kind==="brake"){
tm.textContent=this.state==="run"?this.x.toFixed(1)+" m":(this.v*3.6).toFixed(0)+" km/h";
sub.textContent=this.state==="run"?"制動距離":"進入速度(40km/h以上で白線へ)";
} else {
tm.textContent=this.state==="run"?this.t.toFixed(2):"READY";
sub.textContent=this.coneHit?"⚠ パイロン接触":"白線通過で計測開始";
}
},
};
