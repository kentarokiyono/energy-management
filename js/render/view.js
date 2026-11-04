"use strict";
const View={
scene:null,camera:null,renderer:null,car:null,carBody:null,canopyMesh:null,
sun:null,sunLight:null,hemiLight:null,ground:null,
road:null, scenery:[], structures:[], lmPool:[], lmMap:new Map(),
roadTrains:[], escortLead:null, escortChase:null,
pitGroup:null, inPit:false, pitBlend:0,
fireGroup:null, fireOn:false, speedLines:[],
s:0, lateral:-2.4, cam:0, carSlope:0, upcomingGrade:0, redSignalKm:null,
SEG:5, ROAD_W:5.0, SHOULDER:8.5,
gen:{grade:0,targetGrade:0,gradeRemain:400,curv:0,targetCurv:0,curvRemain:600},
init(){
const canvas=document.getElementById("three-canvas");
this.renderer=new THREE.WebGLRenderer({canvas,antialias:true});
this.renderer.setSize(innerWidth,innerHeight);
this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
this.scene=new THREE.Scene();
this.scene.background=null;
setupRenderQuality(this.renderer,this.scene);
this.skyDome=makeSkyDome(); this.skyDome.frustumCulled=false; this.scene.add(this.skyDome);
this.camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,0.1,3000);
this.hemiLight=new THREE.HemisphereLight(0xbfe6ff,0x8a5a33,0.9);
this.scene.add(this.hemiLight);
this.sunLight=new THREE.DirectionalLight(0xfff3d6,1.2);
this.scene.add(this.sunLight);
this.renderer.shadowMap.enabled=true;
this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
this.sunLight.castShadow=true;this.sunLight.shadow.mapSize.set(1024,1024);
Object.assign(this.sunLight.shadow.camera,{left:-9,right:9,top:9,bottom:-9,near:800,far:2600});
this.scene.add(this.sunLight.target);
this.sun=new THREE.Mesh(new THREE.SphereGeometry(22,16,16),
new THREE.MeshBasicMaterial({color:0xfff1b0}));
this.sun.visible=false; this.scene.add(this.sun);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(6000,6000),
new THREE.MeshLambertMaterial({map:roadTextures().shld})); // 路肩を地平線まで拡大
{const uv=ground.geometry.attributes.uv;
for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*2000,uv.getY(i)*2000); // 路肩と同じ3mタイル
uv.needsUpdate=true;}
ground.rotation.x=-Math.PI/2; ground.position.y=-0.35;
this.ground=ground; this.scene.add(ground);
this.buildCar();
this.buildScenery();
this.buildStructures();
this.buildEscorts();
this.buildPit();
this.buildBay();
this.buildFire();
this.speedLines=[];
for(let i=0;i<12;i++){
  const mt=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,
    blending:THREE.AdditiveBlending,depthWrite:false});
  const pl=new THREE.Mesh(new THREE.PlaneGeometry(0.05,5+Math.random()*7),mt);
  pl.visible=false;pl.frustumCulled=false;this.scene.add(pl);this.speedLines.push(pl);
}
this.aiPool=[];
for(let i=0;i<6;i++){ const m=this.mkAICar(); m.visible=false; this.scene.add(m); this.aiPool.push({mesh:m,team:null}); }
this.road={pts:[{x:0,z:0,y:0,h:0,g:0}],builtS:0,chunks:[]};
this.s=0; this.lateral=-2.4; this.roadTrains.length=0;
this.relHeading=0; this.prevRoadH=0; this.genY=0; this.rollT=0;
this.gen={grade:0,targetGrade:0,gradeRemain:400,curv:0,targetCurv:0,curvRemain:600};
this.lmMap.clear(); this.redSignalKm=null; this.inPit=false; this.pitBlend=0; this.fireOn=false;
this.ensureRoad(1500);
addEventListener("resize",()=>{
this.camera.aspect=innerWidth/innerHeight; this.camera.updateProjectionMatrix();
this.renderer.setSize(innerWidth,innerHeight);
});
},
buildCar(){
if(this.car) this.scene.remove(this.car);
const m=this.buildCarModelImpl();
this.car=m.group; this.carBody=m.body; this.canopyMesh=m.canopy;
this.scene.add(this.car);
},
buildCarModelImpl(){
const g=new THREE.Group();
const body=new THREE.Group();
const panelMat=new THREE.MeshPhongMaterial({color:0x0d1b2e,shininess:140,specular:0x5588cc});
const orangeMat=new THREE.MeshPhongMaterial({color:0xf97316,shininess:70});
const whiteMat=new THREE.MeshPhongMaterial({color:0xf3f4f6,shininess:50});
const canopyMat=new THREE.MeshPhongMaterial({color:0x0a1015,shininess:220,specular:0x99ccff});
const mkWheelFair=(x,z,mat)=>{
const w=new THREE.Mesh(new THREE.CylinderGeometry(0.26,0.26,0.09,18),
new THREE.MeshPhongMaterial({color:0x111418}));
w.rotation.z=Math.PI/2; w.position.set(x,0.26,z); g.add(w);
const f=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.36,0.8),mat||whiteMat);
f.position.set(x,0.40,z); body.add(f);
};
if(P.shape==="wadai"){
// YATA(61)
const Y=buildYATA();
body.add(Y.group);
g.userData.canopy=Y.canopy;
// ---- コックピット内装(ドライバーカメラで体感) ----
const cock=new THREE.Group();
const carbon=new THREE.MeshStandardMaterial({color:0x14181d,roughness:.6});
const rim=new THREE.Mesh(new THREE.TorusGeometry(1,.045,8,40),carbon);
rim.rotation.x=Math.PI/2; rim.scale.set(.23,.8,1); rim.position.set(0,.66,-.67); cock.add(rim);
// ヨークピボット(ステア連動で回転)
this.yokePivot=new THREE.Group();
this.yokePivot.position.set(0,.56,-.95); this.yokePivot.rotation.x=-.35;
const rr=(sh,x,y,w,h,r)=>{sh.moveTo(x+r,y);sh.lineTo(x+w-r,y);sh.quadraticCurveTo(x+w,y,x+w,y+r);
sh.lineTo(x+w,y+h-r);sh.quadraticCurveTo(x+w,y+h,x+w-r,y+h);sh.lineTo(x+r,y+h);
sh.quadraticCurveTo(x,y+h,x,y+h-r);sh.lineTo(x,y+r);sh.quadraticCurveTo(x,y,x+r,y);};
const ys=new THREE.Shape(); rr(ys,-.16,-.11,.32,.22,.06);
const yh=new THREE.Path(); rr(yh,-.125,-.075,.25,.15,.04); ys.holes.push(yh);
const yoke=new THREE.Mesh(new THREE.ExtrudeGeometry(ys,{depth:.025,bevelEnabled:false}),carbon);
this.yokeMesh=yoke;
this.yokePivot.add(yoke);
// ライブ計器(ヨーク開口内に収まりハンドルと一体回転)
this.dashCanvas=document.createElement("canvas"); this.dashCanvas.width=512; this.dashCanvas.height=160;
this.dashTex=new THREE.CanvasTexture(this.dashCanvas);
const dash=new THREE.Mesh(new THREE.PlaneGeometry(.20,.0625),
new THREE.MeshBasicMaterial({map:this.dashTex,side:THREE.DoubleSide}));
dash.position.set(0,0,0.02);
this.yokePivot.add(dash);
cock.add(this.yokePivot);
body.add(cock);
} else if(P.shape==="catamaran"){
for(const sx of [-0.72,0.72]){
const hull=new THREE.Mesh(new THREE.SphereGeometry(0.5,20,14),orangeMat);
hull.scale.set(0.55,0.5,4.4); hull.position.set(sx,0.42,0); body.add(hull);
}
const deck=new THREE.Mesh(new THREE.BoxGeometry(2.05,0.06,4.4),panelMat);
deck.position.set(0,0.66,0); body.add(deck);
const canopy=new THREE.Mesh(new THREE.SphereGeometry(0.34,16,12),canopyMat);
canopy.scale.set(0.9,0.75,1.7); canopy.position.set(-0.72,0.82,-0.3); body.add(canopy);
g.userData.canopy=canopy;
mkWheelFair(-0.72,1.35); mkWheelFair(0.72,1.35); mkWheelFair(-0.72,-1.45); mkWheelFair(0.72,-1.45);
} else {
const hull=new THREE.Mesh(new THREE.SphereGeometry(0.62,24,16),orangeMat);
hull.scale.set(1.3,0.62,3.6); hull.position.set(0,0.5,0.2); body.add(hull);
const deck=new THREE.Mesh(new THREE.BoxGeometry(1.5,0.05,3.4),panelMat);
deck.position.set(0,0.86,0.2); body.add(deck);
const canopy=new THREE.Mesh(new THREE.SphereGeometry(0.3,16,12),canopyMat);
canopy.scale.set(0.9,0.8,1.6); canopy.position.set(0,1.0,-0.5); body.add(canopy);
g.userData.canopy=canopy;
mkWheelFair(-0.62,1.2); mkWheelFair(0.62,1.2); mkWheelFair(0,-1.35);
}
const isW=P.shape==="wadai";
const drlMat=new THREE.MeshBasicMaterial({color:0xffffff});
const drlPos=isW?[[-0.10,-2.28,0.32],[0.10,-2.28,0.32]]:[[-0.28,-2.10,0.52],[0.28,-2.10,0.52]];
for(const [sx,sz,sy] of drlPos){
  const dl=new THREE.Mesh(new THREE.BoxGeometry(isW?0.09:0.20,isW?0.03:0.045,isW?0.22:0.05),drlMat);
  dl.position.set(sx,sy,sz);body.add(dl);
}
const brakeMat=new THREE.MeshBasicMaterial({color:0x4a0505});
const bl=new THREE.Mesh(new THREE.BoxGeometry(isW?0.22:0.7,isW?0.035:0.05,0.04),brakeMat);
bl.position.set(0,isW?0.50:0.53,isW?2.52:2.18);body.add(bl); // アレイ直下の細いブレーキライト
g.userData.brakeMat=brakeMat;
g.userData.winkL=[];g.userData.winkR=[];
const winkPos=isW?[[-0.60,-1.05],[0.60,-1.05],[-0.40,1.90],[0.40,1.90]]
  :[[-0.57,-1.05],[0.57,-1.05],[-0.94,1.95],[0.94,1.95]];
for(const [wx,wz] of winkPos){
  const wm=new THREE.MeshBasicMaterial({color:0x4a3005});
  const wk=new THREE.Mesh(new THREE.BoxGeometry(isW?0.05:0.10,0.045,0.32),wm);
  wk.position.set(wx,isW?0.50:0.55,wz);body.add(wk);
  (wx<0?g.userData.winkL:g.userData.winkR).push(wm);
}
g.add(body);
return {group:g, body, canopy:g.userData.canopy};
},
mkVan(color){
const v=new THREE.Group();
const bodyM=new THREE.MeshPhongMaterial({color});
const cab=new THREE.Mesh(new THREE.BoxGeometry(1.9,1.4,4.6),bodyM); cab.position.y=1.0; v.add(cab);
const win=new THREE.Mesh(new THREE.BoxGeometry(1.92,0.5,1.4),new THREE.MeshPhongMaterial({color:0x1a2733})); win.position.set(0,1.45,1.0); v.add(win);
for(const [x,z] of [[-0.8,1.5],[0.8,1.5],[-0.8,-1.5],[0.8,-1.5]]){
const w=new THREE.Mesh(new THREE.CylinderGeometry(0.35,0.35,0.25,12),new THREE.MeshPhongMaterial({color:0x111}));
w.rotation.z=Math.PI/2; w.position.set(x,0.35,z); v.add(w);
}
const dm=new THREE.MeshBasicMaterial({color:0xffffff});
for(const sx of [-0.7,0.7]){
const dl=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.1,0.06),dm);
dl.position.set(sx,0.95,-2.32); v.add(dl);
}
return v;
},
buildEscorts(){
if(this.escortLead) this.scene.remove(this.escortLead);
if(this.escortChase) this.scene.remove(this.escortChase);
this.escortLead=this.mkVan(0xffffff);
const sign=new THREE.Mesh(new THREE.BoxGeometry(1.6,0.5,0.08),new THREE.MeshBasicMaterial({color:0xffcc00}));
sign.position.set(0,2.0,-2.2); this.escortLead.add(sign);
this.escortChase=this.mkVan(0x3b82f6);
this.scene.add(this.escortLead,this.escortChase);
},
mkRoadTrain(){
const t=new THREE.Group();
const cabM=new THREE.MeshPhongMaterial({color:[0xaa2222,0x2255aa,0xdddddd][Math.floor(Math.random()*3)]});
const cab=new THREE.Mesh(new THREE.BoxGeometry(2.5,2.8,4.5),cabM); cab.position.set(0,1.7,6.5); t.add(cab);
for(let i=0;i<3;i++){
const tr=new THREE.Mesh(new THREE.BoxGeometry(2.5,3.0,10),new THREE.MeshPhongMaterial({color:0x8b8f96}));
tr.position.set(0,1.8,-i*11.5); t.add(tr);
for(const z of [-4+ -i*11.5, 4 + -i*11.5]) for(const x of [-1.1,1.1]){
const w=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,0.35,10),new THREE.MeshPhongMaterial({color:0x111}));
w.rotation.z=Math.PI/2; w.position.set(x,0.5,z); t.add(w);
}
}
return t;
},
buildPit(){
const g=new THREE.Group();
const pad=new THREE.Mesh(new THREE.BoxGeometry(14,0.06,20),new THREE.MeshLambertMaterial({color:0x3a3d44}));
pad.position.y=0.01; g.add(pad);
const tent=new THREE.Mesh(new THREE.ConeGeometry(3,2.4,4),new THREE.MeshLambertMaterial({color:0x1d4ed8}));
tent.position.set(4.5,1.2,-5); tent.rotation.y=Math.PI/4; g.add(tent);
const flag=new THREE.Mesh(new THREE.BoxGeometry(0.08,3,0.08),new THREE.MeshBasicMaterial({color:0xffffff}));
flag.position.set(-3,1.5,8); g.add(flag);
const banner=new THREE.Mesh(new THREE.BoxGeometry(1.6,0.5,0.05),new THREE.MeshBasicMaterial({color:0xf97316}));
banner.position.set(-3,2.6,8); g.add(banner);
g.visible=false;
this.pitGroup=g; this.scene.add(g);
},
enterPit(){}, exitPit(){},
buildBay(){
const g=new THREE.Group();
const pad=new THREE.Mesh(new THREE.BoxGeometry(16,0.05,44),new THREE.MeshLambertMaterial({color:0x3a3d44}));
pad.position.y=0.01; g.add(pad);
const post=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,4,8),new THREE.MeshLambertMaterial({color:0x444}));
post.position.set(-6,2,-20); g.add(post);
const board=new THREE.Mesh(new THREE.BoxGeometry(5,1.6,0.15),new THREE.MeshBasicMaterial({color:0xf97316}));
board.position.set(-6,4.2,-20); g.add(board);
const board2=new THREE.Mesh(new THREE.BoxGeometry(4.4,1.0,0.16),new THREE.MeshBasicMaterial({color:0xffffff}));
board2.position.set(-6,4.2,-19.9); g.add(board2);
const tent=new THREE.Mesh(new THREE.ConeGeometry(3,2.4,4),new THREE.MeshLambertMaterial({color:0x1d4ed8}));
tent.position.set(-5,1.2,5); tent.rotation.y=Math.PI/4; g.add(tent);
for(let i=0;i<6;i++){
const cone=new THREE.Mesh(new THREE.ConeGeometry(0.22,0.6,8),new THREE.MeshBasicMaterial({color:0xff5500}));
cone.position.set(7.4,0.3,-20+i*8); g.add(cone);
}
g.visible=false;
this.bayGroup=g; this.scene.add(g);
},
buildFire(){
const g=new THREE.Group();
this.flames=[];
for(let i=0;i<7;i++){
const f=new THREE.Mesh(new THREE.ConeGeometry(0.25+Math.random()*0.2,0.9+Math.random()*0.6,6),
new THREE.MeshBasicMaterial({color:i%2?0xff6a00:0xffc233,transparent:true,opacity:0.9}));
f.position.set((Math.random()-0.5)*1.6,0.7,(Math.random()-0.5)*3);
g.add(f); this.flames.push(f);
}
this.smokes=[];
for(let i=0;i<5;i++){
const sm=new THREE.Mesh(new THREE.SphereGeometry(0.4,8,8),
new THREE.MeshBasicMaterial({color:0x333333,transparent:true,opacity:0.5}));
sm.position.set((Math.random()-0.5)*1.2,1.2,(Math.random()-0.5)*2);
g.add(sm); this.smokes.push(sm);
}
g.visible=false;
this.fireGroup=g; this.scene.add(g);
},
startFire(){ this.fireOn=true; this.fireGroup.visible=true; },
updateDash(es){
if(!this.dashCanvas||!this.dashTex) return;
const c=this.dashCanvas.getContext("2d");
c.fillStyle="#04070b"; c.fillRect(0,0,512,160);
// ウインカー端ランプ(車体と同じ800ms点滅に同期・ハザードで両側)
const on=(performance.now()%800)<400;
const L=es.signal===-1||es.signal===2, R=es.signal===1||es.signal===2;
c.fillStyle=(L&&on)?"#ffb020":"#241a10";
c.beginPath(); c.moveTo(54,42); c.lineTo(54,118); c.lineTo(14,80); c.closePath(); c.fill();
c.fillStyle=(R&&on)?"#ffb020":"#241a10";
c.beginPath(); c.moveTo(458,42); c.lineTo(458,118); c.lineTo(498,80); c.closePath(); c.fill();
// 速度
c.textAlign="right"; c.fillStyle="#22d3ee"; c.font="bold 84px Consolas,monospace";
c.fillText(String(Math.round(es.v*3.6)),246,112);
c.textAlign="left"; c.font="bold 24px Consolas,monospace"; c.fillStyle="#6fa3b8";
c.fillText("km/h",254,112);
// SOCバー
const soc=clamp(es.soc,0,1);
c.fillStyle="#0c1626"; c.fillRect(90,16,332,20);
c.fillStyle= soc>.4?"#22d3ee": soc>.15?"#fbbf24":"#ef4444";
c.fillRect(93,19,326*soc,14);
c.font="20px Consolas,monospace"; c.fillStyle="#6fa3b8";
c.fillText("SOC "+(soc*100).toFixed(0)+"%",90,60);
// 出力/発電
c.fillStyle="#fb923c"; c.fillText("MTR "+Math.round(es.lastMotorW||0)+"W",90,146);
c.fillStyle="#fbbf24"; c.fillText("SOL "+Math.round(es.lastSolar||0)+"W",266,146);
this.dashTex.needsUpdate=true;
},
buildScenery(){
for(const m of this.scenery) this.scene.remove(m);
this.scenery.length=0;
const mats={ bush:new THREE.MeshLambertMaterial({color:0x4d6b33}),
rock:new THREE.MeshLambertMaterial({color:0x8f4a26}),
mound:new THREE.MeshLambertMaterial({color:0x7a3b1d}),
tree:new THREE.MeshLambertMaterial({color:0x3f5f2a}) };
const geos={ bush:new THREE.IcosahedronGeometry(1,0), rock:new THREE.DodecahedronGeometry(1,0),
mound:new THREE.ConeGeometry(0.8,2.2,7), tree:new THREE.ConeGeometry(1.5,4,6) };
for(let i=0;i<120;i++){
const kind=["bush","bush","rock","mound","tree"][i%5];
const m=new THREE.Mesh(geos[kind],mats[kind]);
const sc=0.5+Math.random()*1.6;
m.scale.set(sc,kind==="bush"?sc*0.7:sc,sc);
m.userData={s:Math.random()*1400, off:(Math.random()<0.5?-1:1)*(14+Math.random()*90)};
this.scenery.push(m); this.scene.add(m);
}
},
buildStructures(){
for(const m of this.structures) this.scene.remove(m);
this.structures.length=0;
for(let i=0;i<46;i++){
const g=new THREE.Group();
g.userData={s:-1e9, off:0, kind:""};
this.structures.push(g); this.scene.add(g);
}
},
dressStructure(g,kind){
while(g.children.length) g.remove(g.children[0]);
if(kind==="house"){
const w=5+Math.random()*4, d=6+Math.random()*5, h=2.8+Math.random()*1.2;
const base=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),
new THREE.MeshLambertMaterial({color:[0xd9c7a8,0xc9b291,0xb9a58f][Math.floor(Math.random()*3)]}));
base.position.y=h/2; g.add(base);
const roofG=new THREE.ConeGeometry(Math.max(w,d)*0.72,1.6,4);
const roof=new THREE.Mesh(roofG,new THREE.MeshLambertMaterial({color:0x7c3f21}));
roof.position.y=h+0.8; roof.rotation.y=Math.PI/4; g.add(roof);
} else if(kind==="building"){
const w=9+Math.random()*10, h=18+Math.random()*45;
const mat=new THREE.MeshLambertMaterial({color:[0x8ea3b5,0x6f8296,0xa8b8c6][Math.floor(Math.random()*3)]});
const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,w*(0.7+Math.random()*0.5)),mat);
b.position.y=h/2; g.add(b);
const band=new THREE.Mesh(new THREE.BoxGeometry(w*1.01,h*0.9,w*0.1),
new THREE.MeshLambertMaterial({color:0x33475c}));
band.position.set(0,h/2,w*0.35); g.add(band);
} else if(kind==="shop"){
const b=new THREE.Mesh(new THREE.BoxGeometry(12,4,8),new THREE.MeshLambertMaterial({color:0xcfc4ae}));
b.position.y=2; g.add(b);
const sign=new THREE.Mesh(new THREE.BoxGeometry(6,1.2,0.2),new THREE.MeshBasicMaterial({color:0xdd3333}));
sign.position.y=5; g.add(sign);
}
g.userData.kind=kind;
},
mkLandmark(lm){
const g=new THREE.Group();
if(lm.t==="signal"){
const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,5.6,8),new THREE.MeshLambertMaterial({color:0x333}));
pole.position.set(this.ROAD_W+1,2.8,0); g.add(pole);
const arm=new THREE.Mesh(new THREE.BoxGeometry(this.ROAD_W+1,0.15,0.15),new THREE.MeshLambertMaterial({color:0x333}));
arm.position.set(this.ROAD_W/2+0.5,5.4,0); g.add(arm);
const box=new THREE.Mesh(new THREE.BoxGeometry(0.5,1.3,0.35),new THREE.MeshLambertMaterial({color:0x222}));
box.position.set(0,5.0,0); g.add(box);
const lamp=new THREE.Mesh(new THREE.SphereGeometry(0.17,10,10),new THREE.MeshBasicMaterial({color:0x22cc44}));
lamp.position.set(0,5.25,0.2); g.add(lamp);
g.userData.lamp=lamp;
} else if(lm.t==="grid"){
const base=new THREE.Mesh(new THREE.BoxGeometry(this.ROAD_W*2,0.02,3.4),new THREE.MeshLambertMaterial({color:0x17191d}));
base.position.y=0.03; g.add(base);
for(let i=0;i<6;i++){
const bar=new THREE.Mesh(new THREE.BoxGeometry(this.ROAD_W*2,0.06,0.16),new THREE.MeshLambertMaterial({color:0x757b82}));
bar.position.set(0,0.06,-1.35+i*0.54); g.add(bar);
}
const sp=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,2.4,6),new THREE.MeshLambertMaterial({color:0x666666}));
sp.position.set(this.ROAD_W+1.5,1.2,-10); g.add(sp);
const sb=new THREE.Mesh(new THREE.BoxGeometry(1.1,1.1,0.08),new THREE.MeshBasicMaterial({color:0xf2c522}));
sb.position.set(this.ROAD_W+1.5,2.7,-10); sb.rotation.z=Math.PI/4; g.add(sb);
} else if(lm.t==="bridge"||lm.t==="river"){
for(const sx of [-1,1]){
const wall=new THREE.Mesh(new THREE.BoxGeometry(0.4,1.1,36),new THREE.MeshLambertMaterial({color:0xb8b8b0}));
wall.position.set(sx*(this.ROAD_W+0.8),0.55,0); g.add(wall);
}
if(lm.t==="river"){
const water=new THREE.Mesh(new THREE.PlaneGeometry(280,16),
new THREE.MeshLambertMaterial({color:0x2b6f9e,transparent:true,opacity:0.85}));
water.rotation.x=-Math.PI/2; water.position.y=-1.4; g.add(water);
const bank1=new THREE.Mesh(new THREE.PlaneGeometry(280,7),new THREE.MeshLambertMaterial({color:0x9a8a6a}));
bank1.rotation.x=-Math.PI/2; bank1.position.set(0,-0.9,11); g.add(bank1);
const bank2=bank1.clone(); bank2.position.z=-11; g.add(bank2);
}
} else if(lm.t==="camp"){
const signPole=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,2.6,6),new THREE.MeshLambertMaterial({color:0x555}));
signPole.position.set(this.ROAD_W+3,1.3,0); g.add(signPole);
const sign=new THREE.Mesh(new THREE.BoxGeometry(2.4,1,0.1),new THREE.MeshLambertMaterial({color:0x14733c}));
sign.position.set(this.ROAD_W+3,2.6,0); g.add(sign);
const tent=new THREE.Mesh(new THREE.ConeGeometry(2,1.6,4),new THREE.MeshLambertMaterial({color:0xc2632a}));
tent.position.set(this.ROAD_W+14,0.8,6); tent.rotation.y=0.5; g.add(tent);
} else if(lm.t==="roadhouse"){
const b=new THREE.Mesh(new THREE.BoxGeometry(16,4.5,10),new THREE.MeshLambertMaterial({color:0xd9cdb2}));
b.position.set(this.ROAD_W+18,2.25,0); g.add(b);
const canopyR=new THREE.Mesh(new THREE.BoxGeometry(10,0.4,8),new THREE.MeshLambertMaterial({color:0xcc3333}));
canopyR.position.set(this.ROAD_W+9,4.4,0); g.add(canopyR);
for(const z of [-2,2]){
const col=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.15,4.2,8),new THREE.MeshLambertMaterial({color:0xeee}));
col.position.set(this.ROAD_W+9,2.1,z); g.add(col);
}
}
return g;
},
mkAICar(){
const g=new THREE.Group();
const hullM=new THREE.MeshPhongMaterial({color:0xffffff});
const hull=new THREE.Mesh(new THREE.SphereGeometry(0.6,16,12),hullM);
hull.scale.set(1.6,0.55,3.8); hull.position.y=0.45; g.add(hull);
const top=new THREE.Mesh(new THREE.BoxGeometry(1.8,0.05,4.0),new THREE.MeshPhongMaterial({color:0x101a2c}));
top.position.y=0.72; g.add(top);
const can=new THREE.Mesh(new THREE.SphereGeometry(0.3,12,10),new THREE.MeshPhongMaterial({color:0x0a1015}));
can.scale.set(0.9,0.9,1.6); can.position.set(0,0.9,-0.2); g.add(can);
g.userData.hullM=hullM;
return g;
},
updateAITeams(es,dtR){
if(P.mode!=="race"||!es.teams||!this.aiPool){ if(this.aiPool) this.aiPool.forEach(sl=>sl.mesh.visible=false); return; }
const ts=P.timeScale;
const near=[];
for(const tm of es.teams){
if(tm.status==="pre") continue;
const rel=(tm.km-es.km)*1000/ts;
if(Math.abs(rel)<1200) near.push({tm,rel});
}
near.sort((a,b)=>Math.abs(a.rel)-Math.abs(b.rel));
const shown=near.slice(0,6);
for(const sl of this.aiPool){ if(!shown.some(o=>o.tm===sl.team)){ sl.team=null; sl.mesh.visible=false; } }
for(const o of shown){
let sl=this.aiPool.find(x=>x.team===o.tm)||this.aiPool.find(x=>!x.team);
if(!sl) break;
sl.team=o.tm; sl.mesh.visible=true;
sl.mesh.userData.hullM.color.setHSL(o.tm.hue/360,0.6,0.55);
const rp=this.roadPoint(clamp(this.s+o.rel,0,this.road.builtS-this.SEG));
let latT=-2.4;
if(o.tm.status==="dnf") latT=-11;
else if(o.tm.yieldT>0) latT=-4.9;
else if(o.tm.passing) latT=2.4;
o.tm.latV=lerp(o.tm.latV,latT,clamp(dtR*1.5,0,1));
const nx=Math.cos(rp.h), nz=Math.sin(rp.h);
sl.mesh.position.set(rp.x+nx*o.tm.latV,rp.y,rp.z+nz*o.tm.latV);
sl.mesh.rotation.y=-rp.h;
if(o.tm.yieldT>0) o.tm.yieldT-=dtR;
if(o.tm.holdT>0) o.tm.holdT-=dtR;
if(o.tm.passing&&o.rel>70){ o.tm.passing=false; o.tm.boost=false; }
}
if(es.camp||es.stopTimer>0||es.fire) return;
const ahead=shown.find(o=>o.rel>6&&o.rel<130&&o.tm.status==="run"&&!o.tm.passing);
if(ahead&&es.v*3.6>ahead.tm.spd+2){
const tm=ahead.tm;
tm.askCd-=dtR;
if(tm.askCd<=0&&!tm.otPending&&tm.yieldT<=0){
tm.otPending=true; tm.askCd=40;
Radio.push(`Can I overtake? (→${tm.name})`,"我々");
const trainNear=this.roadTrains.some(rt=>Math.abs(rt.sVis-this.s)<650);
setTimeout(()=>{ tm.otPending=false;
if(trainNear){ Radio.push("No! ロードトレイン接近中。待ってください。",tm.name); }
else { Radio.push("Yes, go ahead!",tm.name); tm.yieldT=25; }
},1600);
}
}
if(!OT.active){
const behind=shown.find(o=>o.rel<-6&&o.rel>-160&&o.tm.status==="run"&&o.tm.spd>es.v*3.6+3&&!o.tm.passing);
if(behind){
behind.tm.reqCd-=dtR;
if(behind.tm.reqCd<=0){
behind.tm.reqCd=55;
OT.ask(behind.tm, this.roadTrains.some(rt=>rt.sVis>this.s-150&&rt.sVis<this.s+700));
}
}
}
},
advanceGen(){
const g=this.gen;
const km=Engine.st?Engine.st.km:0;
const tp=townProx(km);
const mid=(km>950&&km<2150);
g.gradeRemain-=this.SEG;
if(g.gradeRemain<=0){
const flatBias= mid?0.75:0.45;
if(Math.random()<flatBias){ g.targetGrade=0; g.gradeRemain=400+Math.random()*1400; }
else{
const mag= mid?(0.005+Math.random()*0.015):(0.01+Math.random()*0.03);
g.targetGrade=(Math.random()<0.5?-1:1)*mag;
g.gradeRemain=150+Math.random()*650;
}
if(this.genY>25) g.targetGrade=Math.min(g.targetGrade,-0.006);
if(this.genY<-25) g.targetGrade=Math.max(g.targetGrade,0.006);
}
g.grade+=clamp(g.targetGrade-g.grade,-0.0008,0.0008)*this.SEG;
this.genY=(this.genY||0)+g.grade*this.SEG;
g.curvRemain-=this.SEG;
if(g.curvRemain<=0){
const towny=tp<12;
const straightBias= mid?0.85:(towny?0.35:0.65);
if(Math.random()<straightBias){ g.targetCurv=0; g.curvRemain=towny?150+Math.random()*300:600+Math.random()*1800; }
else{
const r= towny?(220+Math.random()*500):(900+Math.random()*1800);
g.targetCurv=(Math.random()<0.5?-1:1)/r;
g.curvRemain=120+Math.random()*380;
}
}
g.curv+=clamp(g.targetCurv-g.curv,-0.00002,0.00002)*this.SEG;
return g;
},
ensureRoad(upTo){
const r=this.road, CHUNK=200;
while(r.builtS<upTo+CHUNK+50){
const last=r.pts[r.pts.length-1];
const gen=this.advanceGen();
const macroSlope=Engine.st?profileAt(Engine.st.km).slope:0;
const grade=gen.grade+macroSlope;
const h=last.h+gen.curv*this.SEG;
const y=last.y+grade*this.SEG;
const x=last.x+Math.sin(h)*this.SEG;
const z=last.z-Math.cos(h)*this.SEG;
r.pts.push({x,z,y,h,g:grade});
r.builtS+=this.SEG;
}
while(true){
const lastEnd=r.chunks.length? r.chunks[r.chunks.length-1].endS:0;
if(lastEnd>=upTo || lastEnd+CHUNK>r.builtS) break;
const mesh=this.buildRoadChunk(lastEnd,lastEnd+CHUNK);
r.chunks.push({startS:lastEnd,endS:lastEnd+CHUNK,mesh});
this.scene.add(mesh);
}
while(r.chunks.length&&r.chunks[0].endS<this.s-300){
const c=r.chunks.shift();
this.scene.remove(c.mesh);
c.mesh.traverse(ch=>{ if(ch.geometry) ch.geometry.dispose(); });
}
},
roadPoint(s){
const r=this.road;
const i=clamp(Math.floor(s/this.SEG),0,r.pts.length-2);
const t=(s-i*this.SEG)/this.SEG;
const a=r.pts[i], b=r.pts[i+1];
return { x:lerp(a.x,b.x,t), y:lerp(a.y,b.y,t), z:lerp(a.z,b.z,t), h:lerp(a.h,b.h,t), g:lerp(a.g,b.g,t) };
},
matFor(color){
if(!this._matCache) this._matCache=new Map();
let m=this._matCache.get(color);
if(!m){
if(color===0x2b2d31) m=new THREE.MeshLambertMaterial({map:roadTextures().asph});       // 舗装=ザラつき
else if(color===0x9c6a3c||color===0xb4713d) m=new THREE.MeshLambertMaterial({map:roadTextures().shld}); // 路肩+路側=同じ砂利
else m=new THREE.MeshLambertMaterial({color}); // 白線・中央線は単色でクッキリ
this._matCache.set(color,m);
}
return m;
},
stripGeo(s0,s1,offL,offR,yLift,color){
const verts=[],idx=[],norms=[],uvs=[];
let vi=0;
for(let s=s0;s<=s1;s+=this.SEG){
const p=this.roadPoint(s);
const nx=Math.cos(p.h), nz=Math.sin(p.h);
const x0=p.x+nx*offL,z0=p.z+nz*offL,x1=p.x+nx*offR,z1=p.z+nz*offR;
verts.push(x0,p.y+yLift,z0, x1,p.y+yLift,z1);
uvs.push(x0/3,z0/3, x1/3,z1/3); // ワールド座標UV(3m毎タイル=チャンク継ぎ目でズレない)
norms.push(0,1,0, 0,1,0);
if(s>s0){ const a=vi-2; idx.push(a,a+1,a+2, a+1,a+3,a+2); }
vi+=2;
}
const geo=new THREE.BufferGeometry();
geo.setAttribute("position",new THREE.Float32BufferAttribute(verts,3));
geo.setAttribute("normal",new THREE.Float32BufferAttribute(norms,3));
geo.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
geo.setIndex(idx);
const msh=new THREE.Mesh(geo,this.matFor(color));msh.receiveShadow=true;return msh;
},
buildRoadChunk(s0,s1){
const grp=new THREE.Group();
grp.add(this.stripGeo(s0,s1,-600,-this.SHOULDER,-0.18,0xb4713d));
grp.add(this.stripGeo(s0,s1,this.SHOULDER,600,-0.18,0xb4713d));
grp.add(this.stripGeo(s0,s1,-this.SHOULDER,-this.ROAD_W,-0.05,0x9c6a3c));
grp.add(this.stripGeo(s0,s1,this.ROAD_W,this.SHOULDER,-0.05,0x9c6a3c));
grp.add(this.stripGeo(s0,s1,-this.ROAD_W,this.ROAD_W,0.0,0x2b2d31));
grp.add(this.stripGeo(s0,s1,-this.ROAD_W+0.15,-this.ROAD_W+0.35,0.015,0xe8e6da));
grp.add(this.stripGeo(s0,s1,this.ROAD_W-0.35,this.ROAD_W-0.15,0.015,0xe8e6da));
for(let s=s0;s<s1;s+=12){
grp.add(this.stripGeo(s,Math.min(s+6,s1),-0.08,0.08,0.02,0xf5f3e8));
}
return grp;
},
update(dtR){
const es=Engine.st; if(!es) return;
if(this.relHeading===undefined){ this.relHeading=0; this.prevRoadH=this.roadPoint(this.s).h; }
const vv=es.v;
if(vv>0.3){
const yawRate=Input.steer*clamp(6.5/Math.max(vv,4),0.12,1.0);
this.relHeading+=yawRate*dtR;
es.gLat=(yawRate*vv)/9.81;
} else es.gLat=0;
this.s+=vv*Math.cos(this.relHeading)*dtR;
this.ensureRoad(this.s+2400);
const pHere=this.roadPoint(this.s);
this.relHeading-=(pHere.h-this.prevRoadH);
this.prevRoadH=pHere.h;
this.relHeading=clamp(this.relHeading,-1.1,1.1);
this.lateral+=Math.sin(this.relHeading)*vv*dtR;
this.lateral=clamp(this.lateral,-30,30);
this.carSlope=Math.atan(pHere.g);
const ahead=this.roadPoint(this.s+300);
this.upcomingGrade= Math.abs(ahead.g)>0.02 ? Math.sign(ahead.g) : 0;
this.csBayRel=null;
for(const cp of ROUTE){
if(!cp.cp) continue;
const rel=(cp.km-es.km)*1000/P.timeScale;
if(rel>-260&&rel<950){ this.csBayRel=rel; this.csBayCp=cp; break; }
}
const nearBay=this.csBayRel!==null&&Math.abs(this.csBayRel)<240&&this.lateral<0;
es.offroad=Math.abs(this.lateral)>this.ROAD_W+0.3 && !nearBay && !es.camp && es.stopTimer<=0;
if(es.offroad&&es.v>1) es.v=Math.max(0,es.v-clamp(es.v*0.12,0.2,2.5)*dtR);
const nx=Math.cos(pHere.h), nz=Math.sin(pHere.h);
const hCar=pHere.h+this.relHeading;
this.car.position.set(pHere.x+nx*this.lateral, pHere.y, pHere.z+nz*this.lateral);
this.car.rotation.y=-hCar;
this.car.rotation.x=-Math.atan(pHere.g)*0.8+clamp(-es.gLong*0.025,-0.045,0.045);
const wantTilt=(es.camp||es.stopTimer>0||StopMenu.mode==="charge")&&!es.disconnected;
const targetRoll=wantTilt? -es.tiltDeg*Math.PI/180*0.85 : 0;
this.carBody.rotation.z=lerp(this.carBody.rotation.z,targetRoll,dtR*2);
if(es.offroad&&es.v>2) this.car.position.y+=Math.random()*0.05;
if(es.burst&&es.v>2) this.car.position.y+=Math.random()*0.04;
if(this.car.userData.brakeMat)
this.car.userData.brakeMat.color.setHex((es.brakePhys>0.05||es.brakeRegen>0.05)?0xff2222:0x4a0505);
updateWinkers(this.car,es);
View.updateDash(es);
if(View.yokeMesh) View.yokeMesh.rotation.z=-Input.steer*.9;
// ヨーク回転: 右ステア→右へ回転(車の右旋回と同じ向き)
if(View.yokeMesh) View.yokeMesh.rotation.z=-Input.steer*.9;
View.updateDash(es);
if(es.gridShake>0){ es.gridShake-=dtR; if(es.v>1) this.car.position.y+=(Math.random()-0.5)*0.13; }
if(es.camp){
this.pitGroup.visible=true;
this.pitGroup.position.set(this.car.position.x+nx*-11,pHere.y,this.car.position.z+nz*-11);
this.pitGroup.rotation.y=-pHere.h;
} else this.pitGroup.visible=false;
if(this.csBayRel!==null&&this.csBayCp){
this.bayGroup.visible=true;
const bp=this.roadPoint(clamp(this.s+this.csBayRel,0,this.road.builtS-this.SEG));
const bnx=Math.cos(bp.h), bnz=Math.sin(bp.h);
this.bayGroup.position.set(bp.x+bnx*-16,bp.y,bp.z+bnz*-16);
this.bayGroup.rotation.y=-bp.h;
} else this.bayGroup.visible=false;
if(this.fireOn){
this.fireGroup.position.copy(this.car.position);
this.fireGroup.rotation.y=this.car.rotation.y;
const t=performance.now()/1000;
this.flames.forEach((f,i)=>{ f.scale.y=0.8+0.5*Math.sin(t*13+i*2.1); f.scale.x=f.scale.z=0.8+0.3*Math.sin(t*17+i); });
this.smokes.forEach((sm,i)=>{ sm.position.y=1.2+((t*0.8+i*0.5)%2.5); sm.material.opacity=0.5*(1-((t*0.8+i*0.5)%2.5)/2.5); sm.scale.setScalar(1+((t*0.8+i*0.5)%2.5)*0.8); });
}
let camPos,lookAt;
if(this.cam===0){
const cx=this.car.position.x, cy=this.car.position.y, cz=this.car.position.z;
camPos=new THREE.Vector3(cx-Math.sin(hCar)*11, cy+4.2, cz+Math.cos(hCar)*11);
const shk=clamp((vv-26)/45,0,1)*0.06;camPos.x+=(Math.random()-.5)*shk;camPos.y+=(Math.random()-.5)*shk;
lookAt=new THREE.Vector3(cx+Math.sin(hCar)*20, cy+1.1, cz-Math.cos(hCar)*20);
} else if(this.cam===1){
const cx=this.car.position.x, cy=this.car.position.y, cz=this.car.position.z;
camPos=new THREE.Vector3(cx-Math.sin(hCar)*1.8, cy+1.45, cz+Math.cos(hCar)*1.8);
lookAt=new THREE.Vector3(cx+Math.sin(hCar)*40, cy+1.0, cz-Math.cos(hCar)*40);
} else if(this.cam===2){ // ドライバー: 頭を車体に固定(勾配ピッチ・オフロード揺れを継承)
this.car.updateMatrixWorld();
const eye=new THREE.Vector3(-(es.gLat||0)*.05, .84+(es.offroad?(Math.random()-.5)*.03:0), -.45);
eye.applyMatrix4(this.car.matrixWorld);
const aim=new THREE.Vector3(0,.76,-30).applyMatrix4(this.car.matrixWorld);
camPos=eye; lookAt=aim;
} else {
const cx=this.car.position.x, cy=this.car.position.y, cz=this.car.position.z;
camPos=new THREE.Vector3(cx+Math.sin(hCar)*0.3, cy+2.2, cz-Math.cos(hCar)*0.3);
lookAt=new THREE.Vector3(cx-Math.sin(hCar)*60, cy+1.2, cz+Math.cos(hCar)*60);
}
if(this.canopyMesh) this.canopyMesh.visible=(this.cam!==2);
if(this.cam>=2) this.camera.position.copy(camPos);
else this.camera.position.lerp(camPos,clamp(dtR*(this.cam===0?5:12),0,1));
this.camera.lookAt(lookAt);
this.ground.position.set(pHere.x,pHere.y-60,pHere.z);
const alt=es.sunAlt||0, az=(es.sunAz||0);
const relAz=az-profileAt(es.km).bearing;
const sunDist=1400, sy=Math.sin(alt)*sunDist, shD=Math.cos(alt)*sunDist;
this.sun.position.set(pHere.x+Math.sin(relAz)*shD, Math.max(sy,-80), pHere.z-Math.cos(relAz)*shD);
this.sunLight.position.copy(this.sun.position);
this.sunLight.intensity=clamp(Math.sin(alt)*1.5,0.02,1.3)*(es.weather?0.4:1);
this.sunLight.target.position.copy(this.car.position);
const dayTop=new THREE.Color(0x2f7fc4),dayHor=new THREE.Color(0xbdd7ea);
const setTop=new THREE.Color(0x27356b),setHor=new THREE.Color(0xe8814f);
const nigTop=new THREE.Color(0x040914),nigHor=new THREE.Color(0x0a1226);
const t1=clamp(alt/0.18,0,1),t2=clamp((alt-0.18)/0.5,0,1);
const hor=nigHor.clone().lerp(setHor,t1).lerp(dayHor,t2);
const top=nigTop.clone().lerp(setTop,t1).lerp(dayTop,t2);
if(es.weather){hor.lerp(new THREE.Color(0x8a94a0),0.5);top.lerp(new THREE.Color(0x5c6672),0.5);}
if(this.scene.fog)this.scene.fog.color.copy(hor);
if(this.skyDome){
const u=this.skyDome.material.uniforms;
u.uTop.value.copy(top);u.uHor.value.copy(hor);
u.uSunDir.value.copy(this.sun.position).sub(this.car.position).normalize();
u.uCover.value=es.weather?0.6:0.22;
u.uNight.value=clamp(1-alt/0.18,0,1);
u.uTime.value=performance.now()/1000;
this.skyDome.position.copy(this.camera.position);
}
this.hemiLight.intensity=clamp(Math.sin(alt)*1.1,0.12,1)*(es.weather?0.55:1);
for(const m of this.scenery){
if(this.s-m.userData.s>80){ m.userData.s=this.s+900+Math.random()*400;
m.userData.off=(Math.random()<0.5?-1:1)*(14+Math.random()*95); }
const rp=this.roadPoint(Math.min(m.userData.s,this.road.builtS-this.SEG));
m.position.set(rp.x+Math.cos(rp.h)*m.userData.off, rp.y+0.3, rp.z+Math.sin(rp.h)*m.userData.off);
m.visible = townProx(es.km)>2;
}
const tp=townProx(es.km), city=isCity(es.km);
for(const g of this.structures){
if(this.s-g.userData.s>80||g.userData.s<-1e8){
g.userData.s=this.s+250+Math.random()*900;
const side=(Math.random()<0.5?-1:1);
if(city){ this.dressStructure(g,"building"); g.userData.off=side*(26+Math.random()*70); }
else if(tp<8){ this.dressStructure(g,Math.random()<0.85?"house":"shop"); g.userData.off=side*(16+Math.random()*45); }
else { g.userData.kind=""; }
}
if(!g.userData.kind){ g.visible=false; continue; }
g.visible= city||tp<9;
const rp=this.roadPoint(clamp(g.userData.s,0,this.road.builtS-this.SEG));
g.position.set(rp.x+Math.cos(rp.h)*g.userData.off, rp.y, rp.z+Math.sin(rp.h)*g.userData.off);
g.rotation.y=-rp.h;
}
this.updateLandmarks(es);
this.updateRoadTrains(es,dtR);
const lead=this.roadPoint(Math.min(this.s+150,this.road.builtS-this.SEG));
this.escortLead.position.set(lead.x+Math.cos(lead.h)*-2.4,lead.y,lead.z+Math.sin(lead.h)*-2.4);
this.escortLead.rotation.y=-lead.h;
const chase=this.roadPoint(Math.max(this.s-32,0));
this.escortChase.position.set(chase.x+Math.cos(chase.h)*-2.4,chase.y,chase.z+Math.sin(chase.h)*-2.4);
this.escortChase.rotation.y=-chase.h;
this.escortLead.visible=(P.mode==="race"&&!es.camp&&es.stopTimer<=0);
this.escortChase.visible=(P.mode==="race"&&!es.camp&&es.stopTimer<=0&&this.s>45);
this.updateAITeams(es,dtR);
const fovT=70+clamp((es.v*3.6-55)/120,0,1)*8;
if(Math.abs(fovT-this.camera.fov)>0.15){this.camera.fov=lerp(this.camera.fov,fovT,0.12);this.camera.updateProjectionMatrix();}
const sInt=0
this.speedLines.forEach((pl,i)=>{
  if(sInt<=0){pl.visible=false;return;}
  pl.visible=true;pl.quaternion.copy(this.camera.quaternion);
  const fwd=new THREE.Vector3(0,0,-1).applyQuaternion(this.camera.quaternion);
  const rt=new THREE.Vector3(1,0,0).applyQuaternion(this.camera.quaternion);
  const up=new THREE.Vector3(0,1,0).applyQuaternion(this.camera.quaternion);
  pl.position.copy(this.camera.position)
    .addScaledVector(fwd,26+((i*13)%10))
    .addScaledVector(rt,(i%2?1:-1)*(3.5+((i*37)%50)/10))
    .addScaledVector(up,((i*29)%40)/10-2);
  pl.material.opacity=sInt*0.28;});
this.renderer.render(this.scene,this.camera);
},
updateLandmarks(es){
const range=1000;
const interactive=P.timeScale<=2;
for(const lm of LANDMARKS){
const distVis=(lm.km-es.km)*1000/P.timeScale;
const key=lm.km+"_"+lm.t;
if(distVis>-80 && distVis<range){
let ent=this.lmMap.get(key);
if(!ent){
const mesh=this.mkLandmark(lm);
ent={mesh,lm,red:false,decided:false};
if(lm.t==="signal"&&interactive&&Math.random()<0.4){ ent.red=true; }
this.lmMap.set(key,ent);
this.scene.add(mesh);
}
const sVis=this.s+distVis;
const rp=this.roadPoint(clamp(sVis,0,this.road.builtS-this.SEG));
ent.mesh.position.set(rp.x,rp.y,rp.z);
ent.mesh.rotation.y=-rp.h;
if(ent.lm.t==="signal"&&ent.mesh.userData.lamp){
ent.mesh.userData.lamp.material.color.setHex(ent.red?0xff2222:0x22cc44);
if(ent.red&&!ent.decided&&distVis<50){
ent.decided=true;
this.redSignalKm=ent.lm.km;
setTimeout(()=>{ ent.red=false; if(this.redSignalKm===ent.lm.km) this.redSignalKm=null; },(10+Math.random()*15)*1000);
}
}
} else {
const ent=this.lmMap.get(key);
if(ent){ this.scene.remove(ent.mesh); this.lmMap.delete(key); }
}
}
},
updateRoadTrains(es,dtR){
if(P.mode==="race"&&!es.camp){
es.nextRoadTrainH-=dtR*P.timeScale/3600;
if(es.nextRoadTrainH<=0){
es.nextRoadTrainH=1/Math.max(0.1,PRO.trainPerHour*(0.7+0.6*Math.random()));
const t=this.mkRoadTrain();
this.scene.add(t);
this.roadTrains.push({mesh:t, sVis:this.s+1100, warned:false});
Radio.push("前方からロードトレイン接近中!すれ違い注意。","偵察車");
}
}
for(let i=this.roadTrains.length-1;i>=0;i--){
const rt=this.roadTrains[i];
rt.sVis-=27*dtR;
const rp=this.roadPoint(clamp(rt.sVis,0,this.road.builtS-this.SEG));
rt.mesh.position.set(rp.x+Math.cos(rp.h)*2.6,rp.y,rp.z+Math.sin(rp.h)*2.6);
rt.mesh.rotation.y=-rp.h+Math.PI;
const rel=rt.sVis-this.s;
if(!rt.warned&&rel<180){ rt.warned=true; Snd.horn(); }
if(Math.abs(rel)<18 && this.lateral>0.6 && es.v*3.6>15 && !es.fire){
Engine.ignite("ロードトレインと正面衝突");
}
if(Math.abs(rel)<12&&es.v>5) this.car.position.y+=Math.random()*0.03;
if(rel<-250){ this.scene.remove(rt.mesh);
rt.mesh.traverse(o=>{ if(o.geometry)o.geometry.dispose(); if(o.material)o.material.dispose(); });
this.roadTrains.splice(i,1); }
}
},
};
