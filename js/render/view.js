const _WHITE=new THREE.Color(1,1,1);
"use strict";
const View={
scene:null,camera:null,renderer:null,car:null,carBody:null,canopyMesh:null,
sun:null,sunLight:null,hemiLight:null,ground:null,
road:null, scenery:[], structures:[], lmPool:[], lmMap:new Map(),
roadTrains:[], escortLead:null, escortChase:null,
pitGroup:null, inPit:false, pitBlend:0,
fireGroup:null, fireOn:false, speedLines:[],
s:0, lateral:-2.4, cam:0, carSlope:0, upcomingGrade:0, redSignalKm:null,
SEG:2.5, ROAD_W:5.0, SHOULDER:8.5, visOrigin:0, branches:[], junctions:[],
gen:{grade:0,targetGrade:0,gradeRemain:400,curv:0,targetCurv:0,curvRemain:600},
init(){
// 描画エンジンは最初の 1 回だけ作って使い回す (同じ canvas に作り直すと GL の状態がずれ、2 回目以降に車体が真っ白になる)
if(!this.renderer){ const canvas=document.getElementById("three-canvas");
 this.renderer=new THREE.WebGLRenderer({canvas,antialias:true});
 }
this.renderer.setSize(innerWidth,innerHeight);
this.scene=new THREE.Scene();
this.scene.background=null;
setupRenderQuality(this.renderer,this.scene); EnvLight.reset();
this.skyDome=makeSkyDome(); this.skyDome.frustumCulled=false; this.scene.add(this.skyDome);
this.farRidge=makeFarRidge(GFX.cur().far*0.9); this.scene.add(this.farRidge);
this.camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,0.1,GFX.cur().far);
this.hemiLight=new THREE.HemisphereLight(0xbfe6ff,0x8a5a33,0.9);
this.scene.add(this.hemiLight);
this.sunLight=new THREE.DirectionalLight(0xfff3d6,1.2);
this.scene.add(this.sunLight);
this.renderer.shadowMap.enabled=true; Perf.reset();
this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
{ const sz=GFX.cur().shadow||1024; this.sunLight.castShadow=GFX.cur().shadow>0; this.sunLight.shadow.mapSize.set(sz,sz); if(this.sunLight.shadow.map){ this.sunLight.shadow.map.dispose(); this.sunLight.shadow.map=null; } }
{ const e=GFX.ultra()?70:45; Object.assign(this.sunLight.shadow.camera,{left:-e,right:e,top:e,bottom:-e,near:800,far:2600}); this.sunLight.shadow.camera.updateProjectionMatrix(); }
this.sunLight.shadow.bias=-0.0006; this.sunLight.shadow.normalBias=0.02;
this.scene.add(this.sunLight.target);
this.sun=new THREE.Mesh(new THREE.SphereGeometry(22,16,16),
new THREE.MeshBasicMaterial({color:0xfff1b0}));
this.sun.visible=false; this.scene.add(this.sun);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(9000,9000,1,1),SceneMats.get("ground").mat);
{ const g=ground.geometry, n=g.attributes.position.count;
 g.setAttribute("color",new THREE.Float32BufferAttribute(new Float32Array(n*3),3));
 g.setAttribute("aVeg",new THREE.Float32BufferAttribute(new Float32Array(n*4),4));
 g.setAttribute("aMisc",new THREE.Float32BufferAttribute(new Float32Array(n*3),3)); }
ground.rotation.x=-Math.PI/2; ground.position.y=-0.35; ground.receiveShadow=false;
this.ground=ground; this.scene.add(ground);
this.buildCar();
Horizon.build(this.scene);
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
this.aiPool=[]; this.aiMeshes=new Map();   // 表示枠 10 台。車の形はチームごとに作って使い回す
for(let i=0;i<10;i++) this.aiPool.push({mesh:null,team:null});
this.roadTrains.length=0; this.rollT=0; if(typeof Rain!=="undefined") Rain.reset();
this.lmMap.clear(); this.redSignalKm=null; this.inPit=false; this.pitBlend=0; this.fireOn=false;
this.resetRoad();
addEventListener("resize",()=>{
this.camera.aspect=innerWidth/innerHeight; this.camera.updateProjectionMatrix();
this.renderer.setSize(innerWidth,innerHeight);
});
},
/* ============ リプレイカメラ (中継のような視点。どの画質でも動く) ============
 道ばたの固定カメラ (低い三脚・高いクレーン) が車を追って首を振り、通り過ぎたら次のカメラへ。合間に、車に付けたカメラ・空からの追走を挟む */
REPLAY:["side","low","wheel","crane","heli","front"],
replayCam(dtR,vv,hCar){ const R=this.rp||(this.rp={i:-1,t:1e9}), car=this.car.position; R.t+=dtR;
 const pick=()=>{ R.i=(R.i+1)%this.REPLAY.length; R.kind=this.REPLAY[R.i]; R.t=0; R.sd= (R.i%2? 1 : -1);
  const ahead=clamp(vv*4.5,45,130), s=Math.min(this.s+ahead,this.road.builtS-20), rp=this.roadPoint(s), off= R.kind==="crane"? R.sd*((R.sd>0?rp.R:rp.L)+7) : R.sd*((R.sd>0?rp.R:rp.L)+3.2);
  const q=typeof Scenery!=="undefined"? Scenery.at(this,s,off) : rp; R.p=new THREE.Vector3(q.x,(q.y!=null?q.y:rp.y)+(R.kind==="crane"?6.5:R.kind==="low"?0.45:1.5),q.z); R.s=s; };
 if(R.i<0) pick();
 const fixed=R.kind==="side"||R.kind==="low"||R.kind==="crane";
 if(fixed? (this.s>R.s+Math.max(40,vv*2.5)||R.t>14||this.s<R.s-200) : R.t>(vv<1?6:7)) pick();
 const f=new THREE.Vector3(Math.sin(hCar),0,-Math.cos(hCar)), r=new THREE.Vector3(Math.cos(hCar),0,Math.sin(hCar)), look=car.clone(); look.y+=0.5;
 if(R.kind==="side"||R.kind==="low"||R.kind==="crane"){ const d=R.p.distanceTo(car), fov=clamp(2*Math.atan(4.2/Math.max(d,3))*180/Math.PI,7,48);   // 車が画面の半分ほどになるように寄る
  return {pos:R.p.clone(),look,fov}; }
 if(R.kind==="wheel"){ const p=car.clone().addScaledVector(r,R.sd*1.25).addScaledVector(f,-2.6); p.y+=0.32; return {pos:p,look:car.clone().addScaledVector(f,6).setY(car.y+0.35),fov:62}; }
 if(R.kind==="front"){ const p=car.clone().addScaledVector(f,7.5).addScaledVector(r,R.sd*1.6); p.y+=0.7; return {pos:p,look,fov:34}; }
 const a=R.t*0.12*R.sd, p=car.clone().addScaledVector(f,-26*Math.cos(a)).addScaledVector(r,26*Math.sin(a)+R.sd*6); p.y+=17; return {pos:p,look,fov:30}; },   // heli
buildCar(){
if(this.car) this.scene.remove(this.car);
const m=this.buildCarModelImpl();
this.car=m.group; this.carBody=m.body; this.canopyMesh=m.canopy; if(typeof Cockpit!=="undefined") Cockpit.attachRearView(this);
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
// YATA(61) — 車両諸元 (非公開ファイル) があれば実車の形
const SB=VEH.active?VEH.spec.body:null;
const Y=buildYATA(SB); this.cockOpening=Y.opening; g.userData.yMesh=Y.mesh? Y : null;
body.add(Y.group);
g.userData.canopy=Y.canopy; g.userData.upperTilt=Y.tilt;
// 車輪 (諸元にある場合): [x, z(車体中心基準, 前方 -), 半径, 幅]
if(SB&&SB.wheels){ const tm=new THREE.MeshStandardMaterial({color:0x111316,roughness:.85}), hm=new THREE.MeshStandardMaterial({color:0x8a8f96,roughness:.4,metalness:.6});
 g.userData.wheels=[];
 for(const [x,z,r,w] of SB.wheels){ const wg=new THREE.Group(); wg.position.set(x,r,z);
  const t=new THREE.Mesh(new THREE.CylinderGeometry(r,r,w,28),tm); t.rotation.z=Math.PI/2; wg.add(t);
  const h=new THREE.Mesh(new THREE.CylinderGeometry(r*0.55,r*0.55,w+0.01,20),hm); h.rotation.z=Math.PI/2; wg.add(h);
  g.add(wg); g.userData.wheels.push({g:wg,r,front:z<0}); } }
// ---- コックピット内装(ドライバーカメラで体感) ----
const cock=new THREE.Group();
// カーボン調 (2x2 綾織) の質感: 濃いグレー〜黒
if(!View._carbonTex){ const cv=document.createElement("canvas"); cv.width=cv.height=128; const c=cv.getContext("2d");
 c.fillStyle="#0d0f12"; c.fillRect(0,0,128,128);
 for(let y=0;y<16;y++) for(let x=0;x<16;x++){ const on=((x+y)>>1)%2===0; const g=c.createLinearGradient(x*8,y*8,x*8+(on?8:0),y*8+(on?0:8));
  g.addColorStop(0,on?"#1d2126":"#121418"); g.addColorStop(1,on?"#121418":"#1d2126"); c.fillStyle=g; c.fillRect(x*8,y*8,8,8); }
 const t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(6,6); t.encoding=THREE.sRGBEncoding; View._carbonTex=t; }
const carbon=new THREE.MeshStandardMaterial({color:0x9aa0a8,map:View._carbonTex,roughness:.45,metalness:.15,envMapIntensity:.4});
const E0=(VEH.active&&VEH.spec.eye)||[0,.84,-.45];
const deckY=SB&&SB.profiles? .68 : .62;
this.cockE0=E0; this.cockDeckY=deckY;   // 乗降手順 (crew.js) の配置基準
Cockpit.build(this,cock,E0,deckY,carbon);   // 内装は js/render/cockpit.js
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
const LP=(isW&&VEH.active&&VEH.spec.lamps)||null;   // 灯火の位置 (諸元): [x, z, y]
const drlMat=new THREE.MeshBasicMaterial({color:0xffffff});
const drlPos=LP&&LP.head? LP.head : isW?[[-0.10,-2.28,0.32],[0.10,-2.28,0.32]]:[[-0.28,-2.10,0.52],[0.28,-2.10,0.52]];
for(const [sx,sz,sy] of drlPos){
  const dl=new THREE.Mesh(new THREE.BoxGeometry(isW?0.09:0.20,isW?0.03:0.045,isW?0.22:0.05),drlMat);
  dl.position.set(sx,sy,sz);body.add(dl);
}
const brakeMat=new THREE.MeshBasicMaterial({color:0x4a0505});
if(LP&&LP.stop){ for(const [x,z,y] of LP.stop){ const b2=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.035,0.04),brakeMat); b2.position.set(x,y,z);
  // ハイマウント (高い位置のもの) はキャノピー後端の表面に載せる
  const cn=g.userData.canopy;
  if(y>0.8&&cn&&g.userData.yMesh){ // 実車の形: キャノピー後端に埋め込んだ赤い点 (面に沿わせる)
   body.updateMatrixWorld(true); cn.geometry.computeBoundingBox(); const bb=cn.geometry.boundingBox, yc=bb.min.y+(bb.max.y-bb.min.y)*0.5;
   const rc=new THREE.Raycaster(new THREE.Vector3(x,yc,bb.max.z+1),new THREE.Vector3(0,0,-1)), h=rc.intersectObject(cn,false)[0];
   if(h){ const n=h.face.normal.clone(); if(n.z<0) n.negate(); const dot=new THREE.Mesh(new THREE.CircleGeometry(0.02,24),brakeMat), p=cn.worldToLocal(h.point.clone());
    dot.position.copy(p).addScaledVector(n,0.0012); dot.lookAt(p.clone().add(n)); cn.add(dot); continue; } }
  if(y>0.8&&cn){ body.updateMatrixWorld(true); cn.geometry.computeBoundingBox(); const bb=cn.geometry.boundingBox;
   const zz=bb.max.z-0.1, rc=new THREE.Raycaster(new THREE.Vector3(x,3,zz),new THREE.Vector3(0,-1,0)), h=rc.intersectObject(cn,false)[0];
   if(h){ b2.position.set(x,h.point.y+0.012,zz); const n=h.face.normal; b2.rotation.x=-Math.atan2(n.z,n.y); cn.add(b2); } }   // キャノピーと一緒に動く
  if(!b2.parent) body.add(b2); } }
else { const bl=new THREE.Mesh(new THREE.BoxGeometry(isW?0.22:0.7,isW?0.035:0.05,0.04),brakeMat);
bl.position.set(0,isW?0.50:0.53,isW?2.52:2.18);body.add(bl); } // アレイ直下の細いブレーキライト
g.userData.brakeMat=brakeMat;
g.userData.winkL=[];g.userData.winkR=[];
const winkPos=LP&&LP.wink? LP.wink : isW?[[-0.60,-1.05],[0.60,-1.05],[-0.40,1.90],[0.40,1.90]]
  :[[-0.57,-1.05],[0.57,-1.05],[-0.94,1.95],[0.94,1.95]];
const hullMeshes=[]; if(LP&&g.userData.canopy){ body.updateMatrixWorld(true); body.traverse(m=>{ if(m.isMesh&&m!==g.userData.canopy&&m.geometry.type==="BufferGeometry") hullMeshes.push(m); }); }
for(const [wx,wz,wy] of winkPos){
  const wm=new THREE.MeshBasicMaterial({color:0x4a3005});
  const wk=new THREE.Mesh(new THREE.BoxGeometry(isW?0.05:0.10,0.045,0.32),wm);
  wk.position.set(wx,wy!=null?wy:(isW?0.50:0.55),wz);
  // 車体の側面に埋め込む: 外側から車体へ向けて当て、表面に沿わせた薄いレンズにする
  if(hullMeshes.length){ const sd=Math.sign(wx)||1, rc=new THREE.Raycaster(new THREE.Vector3(sd*3,wk.position.y,wz),new THREE.Vector3(-sd,0,0));
   const h=rc.intersectObjects(hullMeshes,false)[0];
   if(h){ wk.geometry.dispose(); wk.geometry=new THREE.BoxGeometry(0.012,0.04,0.22); const n=h.face.normal.clone().transformDirection(h.object.matrixWorld);
    wk.position.copy(h.point).addScaledVector(n,-0.003); wk.lookAt(wk.position.clone().add(n)); wk.rotateY(Math.PI/2); if(h.object.userData.upper) h.object.add(wk); } }   // アッパーカウルに付くものは一緒に傾く
  if(!wk.parent) body.add(wk);
  (wx<0?g.userData.winkL:g.userData.winkR).push(wm);
}
// 後端の両角: 透明レンズのブレーキランプ兼ウインカー/ハザード (諸元 lamps.rearCombo: [x, z, y, 幅])
if(LP&&LP.rearCombo){ g.userData.rearCombo=[];
 for(const [x,z,y,w] of LP.rearCombo){ const m=new THREE.MeshBasicMaterial({color:0xd8dde2,transparent:true,opacity:.55});
  const ln=new THREE.Mesh(new THREE.BoxGeometry(w||0.18,0.03,0.06),m); ln.position.set(x,y,z); body.add(ln);
  g.userData.rearCombo.push({m,side:x<0?-1:1}); } }
g.add(body);
if(g.userData.yMesh){ try{ YataMesh.snap(body,g.userData.yMesh.hull); }catch(e){ console.error(e); } }
return {group:g, body, canopy:g.userData.canopy};
},
mkVan(color){ // 随伴車: 4WDワゴン(ブルバー・ルーフラック・回転灯)  前方=-z
const v=new THREE.Group(), bs=new BatchSet();
srand(color);
const body=linCol(color).clone(), dark=0x1b1f22;
bs.get("solid").add(tpl("box"),M4(0,0.45,0,1.92,0.95,4.8),body);
bs.get("solid").add(tpl("box"),M4(0,1.4,0.45,1.84,0.85,3.3),body);
bs.get("glass").add(tpl("box"),M4(0,1.47,0.45,1.87,0.62,3.1),linCol(0x1a242b));
bs.get("glass").add(tpl("box"),M4(0,1.42,-1.24,1.7,0.7,0.06,0,-0.45,0),linCol(0x1a242b));
bs.get("solid").add(tpl("box"),M4(0,0.62,-2.42,1.9,0.55,0.08),linCol(0x2a2d30));            // グリル
bs.get("solid").add(tpl("box"),M4(0,0.32,-2.6,2.0,0.7,0.22),linCol(0x34383b));             // ブルバー
bs.get("solid").add(tpl("box"),M4(0,2.25,0.45,1.7,0.08,2.8),linCol(0x2a2a2a));             // ルーフラック
bs.get("solid").add(tpl("cyl8"),M4(0.6,2.33,-0.6,0.1,0.14,0.1),linCol(0xffa000));          // 回転灯
for(const [x,z] of [[-0.86,1.55],[0.86,1.55],[-0.86,-1.5],[0.86,-1.5]]){
 bs.get("solid").add(tpl("cyl12"),M4(x,0.38,z,0.38,0.3,0.38,0,0,Math.PI/2),linCol(dark));
 bs.get("solid").add(tpl("cyl8"),M4(x*1.01,0.38,z,0.2,0.31,0.2,0,0,Math.PI/2),linCol(0x9a9da0)); }
bs.get("solid").add(tpl("cyl12"),M4(0,0.95,2.5,0.36,0.25,0.36,0,Math.PI/2,0),linCol(dark));  // 背面スペア
bs.toGroup(v);
const dm=new THREE.MeshBasicMaterial({color:0xffffff});
for(const sx of [-0.7,0.7]){ const dl=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.12,0.06),dm); dl.position.set(sx,0.82,-2.42); v.add(dl); }
const tm=new THREE.MeshBasicMaterial({color:0xaa1111});
for(const sx of [-0.85,0.85]){ const tl=new THREE.Mesh(new THREE.BoxGeometry(0.18,0.35,0.05),tm); tl.position.set(sx,0.9,2.42); v.add(tl); }
// ハザード(四隅のウインカー)
const hz=new THREE.MeshBasicMaterial({color:0x4a3005});
for(const [x,z] of [[-0.9,-2.44],[0.9,-2.44],[-0.9,2.44],[0.9,2.44]]){ const l=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.12,0.05),hz); l.position.set(x,0.62,z); v.add(l); }
v.userData.hazMat=hz;
return v;
},
buildEscorts(){
if(this.escortLead) this.scene.remove(this.escortLead);
if(this.escortChase) this.scene.remove(this.escortChase);
this.escortLead=this.mkVan(0xffffff);
const mkBanner=(txt,z,flip)=>{ const g=new THREE.Group();
 const pl=new THREE.Mesh(new THREE.PlaneGeometry(1.75,0.55),new THREE.MeshLambertMaterial({map:signTex("banner",txt)}));
 const bk=new THREE.Mesh(new THREE.BoxGeometry(1.8,0.6,0.04),new THREE.MeshLambertMaterial({color:0x2a2a2a}));
 pl.position.z=0.03; g.add(pl,bk); g.position.set(0,2.65,z); if(flip) g.rotation.y=Math.PI; return g; };
this.escortLead.add(mkBanner("CAUTION\nSOLAR CAR AHEAD",-0.9,true));
this.escortChase=this.mkVan(0x3b82f6);
this.escortChase.add(mkBanner("CAUTION\nSOLAR CAR AHEAD",1.6,false));
this.scene.add(this.escortLead,this.escortChase);
},
mkRoadTrain(){ // ボンネット型トラクタ+ブルバー+3連トレーラ(全長約53m)
const t=new THREE.Group(), bs=new BatchSet();
srand(Math.floor(Math.random()*1e6));
const cab=rndPick([0xaa2222,0x1f4f9c,0xe8e8e8,0xd8a21c,0x1d1d1d,0x2f6b3a]);
const chrome=0xd0d4d8, tyre=0x141414;
// トラクタ (前方=+z: すれ違い用に後で反転)
bs.get("solid").add(tpl("box"),M4(0,0.9,4.6,2.5,0.35,8.5),linCol(0x222222));
bs.get("solid").add(tpl("box"),M4(0,1.25,7.6,2.3,1.35,2.6),linCol(cab));            // ボンネット
bs.get("solid").add(tpl("box"),M4(0,1.25,5.0,2.5,2.65,2.6),linCol(cab));            // キャブ
bs.get("solid").add(tpl("box"),M4(0,3.9,4.4,2.5,1.0,1.6),linCol(cab));              // スリーパー
bs.get("glass").add(tpl("box"),M4(0,2.75,6.31,2.3,0.9,0.05),linCol(0x1a2228));
bs.get("solid").add(tpl("box"),M4(0,1.1,8.95,2.3,1.15,0.15),linCol(chrome));       // グリル
bs.get("solid").add(tpl("box"),M4(0,0.55,9.25,2.6,1.25,0.35),linCol(0xb9bcbf));    // ブルバー
for(const sx of [-1.15,1.15]) bs.get("solid").add(tpl("cyl8"),M4(sx,1.6,3.75,0.09,3.6,0.09),linCol(chrome)); // 排気スタック
for(const sx of [-0.95,0.95]) bs.get("solid").add(tpl("cyl12"),M4(sx,0.95,3.9,0.36,1.5,0.36,0,Math.PI/2,0),linCol(chrome)); // 燃料タンク (車体の下・前後方向)
const wheel=(x,z)=>bs.get("solid").add(tpl("cyl12"),M4(x,0.52,z,0.52,0.3,0.52,0,0,Math.PI/2),linCol(tyre));
for(const z of [8.2,2.6,1.2]) for(const x of [-1.1,1.1]) wheel(x,z);
// トレーラ ×3 (サイドティッパー/バン)
const trCol=rndPick([0xb4b7ba,0x9aa0a6,0xc9c9c2,0x7a8288]);
for(let i=0;i<3;i++){
 const zc=-6-i*13.5;
 const tip=rnd()<0.5;
 bs.get("solid").add(tpl("box"),M4(0,1.05,zc,2.5,0.3,12.4),linCol(0x2a2a2a));
 bs.get(tip?"solid":"corr").add(tpl("box"),M4(0,1.35,zc,2.5,tip?1.9:2.9,12.2),linCol(trCol,0.05),2);
 if(i<2) bs.get("solid").add(tpl("box"),M4(0,0.6,zc-7.1,0.2,0.2,2.2),linCol(0x333333));  // ドーリー連結
 for(const dz of [-4.8,-3.4,-2.0,4.4,5.8]) for(const x of [-1.1,1.1]) wheel(x,zc+dz);
 bs.get("solid").add(tpl("box"),M4(0,0.9,zc-6.2,2.4,0.25,0.06),linCol(0xd11a1a));
}
bs.get("solid").add(tpl("box"),M4(0,1.7,-33.8,1.2,0.6,0.04),linCol(0xf6c400));     // ROAD TRAIN 表示板
bs.toGroup(t);
t.traverse(o=>{ if(o.isMesh) o.matrixAutoUpdate=false; });
t.rotation.order="YXZ";
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
Cockpit.drawLCD(this,es); Cockpit.sync(this,es);
},
mkLandmark(lm){
const g=new THREE.Group(), W=this.ROAD_W;
const rp0=this.roadPoint(clamp(this.sOfKm(lm.km),0,Math.max(0,this.road.builtS-this.SEG)));
const Lw=rp0.L||W, Rw=rp0.R||W, M1=rp0.m1||0, Cw=(Rw-Lw)/2, Fw=Lw+Rw;   // 左端/右端/分離帯/中心/全幅
const bs=new BatchSet();
srand(Math.floor(lm.km*997)+7);
const lam=(c)=>new THREE.MeshLambertMaterial({color:new THREE.Color(c).convertSRGBToLinear()});
const signBoard=(kind,text,x,y,z,w,h)=>{
 const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshLambertMaterial({map:signTex(kind,text),side:THREE.DoubleSide}));
 m.position.set(x,y,z); g.add(m);
 bs.get("solid").add(tpl("box"),M4(x,0,z-0.05,0.08,y-h/2+0.1,0.08),linCol(0x9a9da0));
};
if(lm.t==="pedlight"){ // 押しボタン式横断歩道の信号
 for(const sd of [-1,1]){ bs.get("solid").add(tpl("cyl8"),M4((sd<0?-(Lw+1.2):(Rw+1.2)),0,0,0.09,3.4,0.09),linCol(0x3a3d40));
  bs.get("solid").add(tpl("boxC"),M4((sd<0?-(Lw+1.2):(Rw+1.2)),2.9,0.12,0.4,0.9,0.25),linCol(0x1c1c1c)); }
 for(let x=-Lw+0.6;x<Rw-0.5;x+=1.25){ if(M1>0.3&&x>-0.3&&x<M1+0.3) continue; bs.get("solid").add(tpl("box"),M4(x,0.005,0,0.6,0.012,3.0),linCol(0xf2f0e6)); }
} else if(lm.t==="floodway"){ // フラッドウェイ: 深さ標柱 + 注意標識 (路面は浅いくぼみ)
 for(const sd of [-1,1]) for(const z of [-30,30]){
  bs.get("solid").add(tpl("box"),M4((sd<0?-(Lw+1.6):(Rw+1.6)),0,z,0.12,2.0,0.12),linCol(0xf2f2ee));
  for(let k=0;k<4;k++) bs.get("solid").add(tpl("box"),M4((sd<0?-(Lw+1.6):(Rw+1.6)),0.3+k*0.4,z+0.07,0.13,0.18,0.02),linCol(k%2?0xd11a1a:0xf2f2ee)); }
 signBoard("warn","FLOOD\nWAY",-(Lw+2.4),2.4,60,1.3,1.3);
} else if(lm.t==="rail"){ // 鉄道: 跨線橋(The Ghan) または踏切
 if(/overpass|bridge|Bridge/i.test(lm.n)){
  bs.get("solid").add(tpl("boxC"),M4(Cw,7.2,0,Fw+24,1.4,9,0),linCol(0xb8b6ae));
  for(const sd of [-1,1]) bs.get("solid").add(tpl("box"),M4((sd<0?-(Lw+5):(Rw+5)),0,0,2,6.5,8),linCol(0xa9a69e));
  bs.get("solid").add(tpl("boxC"),M4(Cw,8.1,-3.2,Fw+24,0.15,0.25),linCol(0x6b5a4a));
 } else {
  for(const z of [-0.75,0.75]) bs.get("solid").add(tpl("boxC"),M4(0,0.06,z,60,0.12,0.12),linCol(0x6b6b6b));
  for(const sd of [-1,1]){ bs.get("solid").add(tpl("cyl8"),M4((sd<0?-(Lw+2):(Rw+2)),0,sd*8,0.1,3.2,0.1),linCol(0xf2f2ee));
   bs.get("solid").add(tpl("boxC"),M4((sd<0?-(Lw+2):(Rw+2)),3.0,sd*8,1.6,0.25,0.06,sd*0.6),linCol(0xf2f2ee)); }
 }
} else if(lm.t==="signal"){
 // 豪州型: 左側の柱+右側の柱、3灯(赤/黄/緑)・黒い背板
 const lamps=[];
 const head=(x,y,z)=>{
  bs.get("solid").add(tpl("boxC"),M4(x,y,z-0.02,0.62,1.5,0.06),linCol(0x111111));
  bs.get("solid").add(tpl("boxC"),M4(x,y,z+0.06,0.4,1.2,0.25),linCol(0x1c1c1c));
  [0xff2020,0xffb000,0x20ff60].forEach((c,i)=>{
   const m=new THREE.Mesh(new THREE.CircleGeometry(0.13,14),new THREE.MeshBasicMaterial({color:0x111111}));
   m.position.set(x,y+0.38-i*0.38,z+0.19); g.add(m); lamps.push({m,c,i});
  });
 };
 for(const sd of [-1,1]){
  const px=(sd<0?-(Lw+1.4):(Rw+1.4));
  bs.get("solid").add(tpl("cyl8"),M4(px,0,0,0.11,sd<0?6.2:3.6,0.11),linCol(0x3a3d40));
  head(px,sd<0?2.9:2.9,0.15);
 }
 bs.get("solid").add(tpl("boxC"),M4(-Lw*0.6-0.7,6.0,0,Lw*0.9+1.4,0.14,0.14),linCol(0x3a3d40));
 head(-Lw*0.45,5.3,0.15); if(Lw>6) head(-Lw*0.8,5.3,0.15);
 if(M1>0.8){ bs.get("solid").add(tpl("cyl8"),M4(M1/2,0,0,0.11,3.6,0.11),linCol(0x3a3d40)); head(M1/2,2.9,0.15); }   // 中央分離帯の信号
 // 停止線 + 横断歩道 (停止線の先, 分離帯は除く)
 bs.get("solid").add(tpl("box"),M4(-Lw/2,0.005,3.5,Lw,0.012,0.4),linCol(0xf2f0e6));
 for(let x=-Lw+0.5;x<Rw-0.4;x+=1.1){ if(M1>0.3&&x>-0.3&&x<M1+0.3) continue; bs.get("solid").add(tpl("box"),M4(x,0.006,1.2,0.55,0.012,2.6),linCol(0xf2f0e6)); }
 g.userData.setRed=(red)=>{ for(const L of lamps){ const on= red? L.i===0 : L.i===2; L.m.material.color.setHex(on?L.c:0x161616); } };
 g.userData.setRed(false);
} else if(lm.t==="grid"){
 const base=new THREE.Mesh(new THREE.BoxGeometry(Fw,0.02,3.4),lam(0x17191d)); base.position.set(Cw,0.03,0); g.add(base);
 for(let i=0;i<7;i++) bs.get("solid").add(tpl("box"),M4(Cw,0.02,-1.4+i*0.47,Fw,0.06,0.14),linCol(0x7d8288));
 for(const sd of [-1,1]){ // 境界フェンスが道路と交差する
  const pts=[]; for(let x=(sd<0?Lw:Rw)+1.5;x<160;x+=7){ bs.get("solid").add(tpl("box"),M4(sd*x,0,0,0.07,1.25,0.07),linCol(0x5a4a3a,0.1)); pts.push([sd*x,0,0]); }
  bs.get("solid").add(tpl("box"),M4((sd<0?-(Lw+1):(Rw+1)),0,0,0.25,1.4,1.0),linCol(0xc2c4c4));
  this._wireLocal(g,pts,[0.6,1.0],0.03);
 }
 signBoard("warn","cow",-(Lw+2.2),2.6,-30,1.3,1.3);
} else if(lm.t==="bridge"||lm.t==="river"){
 const wet=/Katherine River|Elizabeth River|Gawler River|Broughton River|Adelaide River/.test(lm.n);
 for(const sd of [-1,1]){ // W-ビーム ガードレール
  for(let z=-22;z<=22;z+=2) bs.get("solid").add(tpl("box"),M4((sd<0?-(Lw+0.9):(Rw+0.9)),0,z,0.12,0.75,0.12),linCol(0xa8aaa8));
  bs.get("solid").add(tpl("box"),M4((sd<0?-(Lw+0.85):(Rw+0.85)),0.5,0,0.06,0.3,46),linCol(0xc9cbc9));
  bs.get("solid").add(tpl("box"),M4((sd<0?-(Lw+0.8):(Rw+0.8)),-1.2,0,0.6,1.2,40),linCol(0xb8b6ae));
 }
 if(lm.t==="river"){
  const bed=new THREE.Mesh(new THREE.PlaneGeometry(420,22),lam(wet?0x8a7a5a:0xd8bb8c));
  bed.rotation.x=-Math.PI/2; bed.position.y=-2.2; g.add(bed);
  if(wet){
   bs.get("water").add(tpl("box"),M4(0,-2.0,0,420,0.02,14),linCol(0x4d6a5c));
  } else for(let i=0;i<40;i++) PR.rock(bs,rndr(-200,200),-2.2,rndr(-9,9),0.5,0xc9b08a);
  for(let i=0;i<22;i++){ const x=(rnd()<0.5?-1:1)*rndr(Rw+6,190), z=(rnd()<0.5?-1:1)*rndr(11,16); PR.tree(bs,x,-1.2,z,"redgum",rndr(0.7,1.1)); }
  for(const sd of [-1,1]){ const bank=new THREE.Mesh(new THREE.PlaneGeometry(420,8),lam(0x9a7a55)); bank.rotation.x=-Math.PI/2+sd*0.25; bank.position.set(0,-1.2,sd*14.5); g.add(bank); }
 }
 signBoard("green",lm.n.slice(0,22),-(Lw+2.6),2.4,-34,3.6,0.9);
} else if(lm.t==="camp"){
 signBoard("blue","REST AREA\n500 m",-(Lw+3),2.6,60,3.2,1.6);
 const pad=new THREE.Mesh(new THREE.BoxGeometry(28,0.06,60),lam(0x9a7a5a)); pad.position.set(Rw+18,0.0,0); g.add(pad);
 bs.get("solid").add(tpl("box"),M4(Rw+16,0,-8,4,0.75,1.4),linCol(0x8a6a4a));
 for(const dx of [-1.8,1.8]) for(const dz of [-1.6,1.6]) bs.get("solid").add(tpl("box"),M4(Rw+16+dx,0,-8+dz,0.1,2.6,0.1),linCol(0x6a6a6a));
 bs.get("corr").add(tpl("gable"),M4(Rw+16,2.6,-8,4.4,0.7,4.6),linCol(0x55635a),3);
 PR.tank(bs,Rw+24,0,6,0.9);
 bs.get("solid").add(tpl("cyl8"),M4(Rw+13,0,4,0.35,0.9,0.35),linCol(0x2e6b3a));
 for(let i=0;i<6;i++) PR.tree(bs,Rw+rndr(8,40),0,rndr(-28,28),rnd()<0.5?"redgum":"ghost",0.8);
 if(rnd()<0.6){ const tn=new THREE.Mesh(new THREE.ConeGeometry(1.8,1.5,4),lam(0x2f6b3a)); tn.position.set(Rw+22,0.75,14); g.add(tn); }
} else if(lm.t==="roadhouse"){
 PR.roadhouse(bs,Rw+22,0,0,-Math.PI/2);
 signBoard("brown",lm.n.toUpperCase().slice(0,18)+"\nFUEL · FOOD",Rw+4,3.4,-24,4.2,1.7);
 for(let i=0;i<5;i++) PR.tree(bs,Rw+rndr(30,70),0,rndr(-40,40),"redgum",0.9);
 PR.windmill(bs,Rw+52,0,-22);
}
bs.toGroup(g);
return g;
},
_wireLocal(g,pts,heights,sag){
 const v=[];
 for(const hh of heights) for(let i=0;i<pts.length-1;i++){ const a=pts[i],b=pts[i+1];
  for(let k=0;k<4;k++){ const t0=k/4,t1=(k+1)/4;
   v.push(lerp(a[0],b[0],t0),a[1]+hh-sag*4*t0*(1-t0),lerp(a[2],b[2],t0), lerp(a[0],b[0],t1),a[1]+hh-sag*4*t1*(1-t1),lerp(a[2],b[2],t1)); } }
 const geo=new THREE.BufferGeometry(); geo.setAttribute("position",new THREE.Float32BufferAttribute(v,3));
 g.add(new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0x5a5048})));
},
/* 他チームの車: 自車 (YATA) と同じ作り方 (buildYATA) で、なめらかな胴体に車輪を収め、上にソーラーパネルとキャノピーを載せる。
 チームごとに 全長・キャノピーの位置/幅/高さ・パネルの幅・胴体の幅・キャノピーの形・色 を変える。前は -z。
 充電のときはアッパーカウル (パネル + キャノピー) だけを傾ける */
TEAM_COLOR:{ "BRUNEL":0xf26b1d, "TWENTE":0xc8102e, "INNOPTUS":0x1a1a1a, "SONNENWAGEN":0x1f5fbf, "TOKAI":0x1d4fa8, "MICHIGAN":0x00274c, "KOGAKUIN":0x1d3f9a, "WESTERN SYDNEY":0xd4001a, "JU SOLAR":0x1b6fd1, "ECLIPSE":0x7a1fa2 },
mkAICar(tm){
const g=new THREE.Group(), name=tm&&tm.team||"";
let h=0; for(let i=0;i<name.length;i++) h=(h*31+name.charCodeAt(i))>>>0;
const r=(k)=>((h>>>(k*3))%97)/96;   // チームごとに決まる 0〜1 の値
const key=Object.keys(this.TEAM_COLOR).find(k=>name.toUpperCase().includes(k));
const accent= key? this.TEAM_COLOR[key] : new THREE.Color().setHSL(((tm&&tm.hue)||h%360)/360,0.7,0.45).getHex();
const L=4.5+0.45*r(1), cw=0.42+0.08*r(2), pw=0.82+0.12*r(3), hw=0.5+0.1*r(4);
// カタマラン (半分ほどのチーム): 細い胴体 2 本、キャノピーは左右どちらかの胴体の上
const cat= key==="TOKAI"||key==="SONNENWAGEN"||key==="WESTERN SYDNEY"||key==="ECLIPSE"||(!key&&r(12)<0.5), cd=0.52+0.08*r(13), cs=0.46, csd=(r(14)<0.5?-1:1);
const sc=(arr,f)=>arr.map(([u,v])=>[u,v*f]);
const BD={L, noOpening:true, cat:cat?{d:cd,s:cs}:null, canopyOffset:cat?csd*cd:0, noLogo:true, canopyCol:r(11)<0.6?0xeceef1:0x111316, accent, base:(key? key==="INNOPTUS" : r(5)<0.15)?0x24262b:0xeceef1, orangeU:0.08+0.08*r(6), skirtZ:0.26,
 canopy:{x:L*(0.3+0.12*r(7)),len:1.3+0.3*r(8),w:cw,top:1.05+0.12*r(9)}, 
 profiles:{halfW:sc([[0,.001],[.05,.16],[.16,.44],[.30,.62],[.45,.85],[.60,.90],[.75,.86],[.90,.78],[1,.70]],pw/0.9),
  hullW:sc([[0,.001],[.06,.10],[.16,.30],[.30,.44],[.50,.58],[.70,.52],[.85,.40],[1,.26]],hw/0.58)}};
const Y=buildYATA(BD); g.add(Y.group);
// ゼッケン: 国旗 + 番号 (番号がないチームは車名の頭文字)。胴体の両側
const cv=document.createElement("canvas"); cv.width=256; cv.height=96; const c=cv.getContext("2d");
c.fillStyle="#fbfbf7"; c.fillRect(0,0,256,96); c.strokeStyle="#111"; c.lineWidth=4; c.strokeRect(2,2,252,92);
if(tm&&tm.cc&&typeof HV!=="undefined"&&HV.flag) try{ HV.flag(c,tm.cc,12,22,72,52); }catch(e){}
c.fillStyle="#111"; c.font="900 58px 'Chakra Petch',Arial,sans-serif"; c.textAlign="center"; c.textBaseline="middle";
c.fillText(String(tm&&(tm.no||(tm.car||"").replace(/[^A-Za-z0-9]/g,"").slice(0,3).toUpperCase())||""),170,52);
const tx=new THREE.CanvasTexture(cv); tx.encoding=THREE.sRGBEncoding;
for(const sd of [-1,1]){ const pl=new THREE.Mesh(new THREE.PlaneGeometry(0.46,0.17),new THREE.MeshBasicMaterial({map:tx})); pl.position.set(sd*(cat? cd+hw*cs+0.02 : hw+0.03),0.36,0.1); pl.rotation.y=sd*Math.PI/2; g.add(pl); }
g.userData.top=Y.tilt; g.userData.hullM=null; g.userData.tiltSign=-1;
return g;
},
/* 画質を「低」に下げたとき: 物理ベースの材質 (クリア塗装・透過) を軽い材質に置き換え、路面の凹凸マップを外す */
lighten(){
 if(!this.scene) return; const map=new Map();
 const lite=(m)=>{ if(!m) return m; if(map.has(m)) return map.get(m); let n=m;
  if(m.isMeshPhysicalMaterial){ n=new THREE.MeshStandardMaterial({color:m.color,map:m.map,roughness:Math.max(0.35,m.roughness),metalness:Math.min(0.5,m.metalness),side:m.side,
    transparent:m.transparent||m.transmission>0,opacity:m.transmission>0?0.55:m.opacity,depthWrite:m.depthWrite,envMapIntensity:0.4,vertexColors:m.vertexColors}); }
  else if(m.isMeshStandardMaterial&&(m.normalMap||m.roughnessMap)){ m.normalMap=null; m.roughnessMap=null; m.needsUpdate=true; }
  map.set(m,n); return n; };
 this.scene.traverse(o=>{ if(!o.isMesh||!o.material) return; o.material= Array.isArray(o.material)? o.material.map(lite) : lite(o.material); });
 const cm=this.canopyMesh; if(cm&&cm.userData.extMat) cm.userData.extMat= Array.isArray(cm.userData.extMat)? cm.userData.extMat.map(lite) : lite(cm.userData.extMat);
 if(this.scene.environment&&typeof EnvLight!=="undefined") EnvLight.t=Infinity;   // 映り込みの作り直しも止める
},
/* チームの車 (一度作ったら使い回す) */
aiMesh(tm){ let m=this.aiMeshes.get(tm); if(!m){ m=this.mkAICar(tm); m.visible=false; this.scene.add(m); this.aiMeshes.set(tm,m); } return m; },
updateAITeams(es,dtR){
if(P.mode!=="race"||!es.teams||!this.aiPool){ if(this.aiPool) this.aiPool.forEach(sl=>{ if(sl.mesh) sl.mesh.visible=false; }); return; }
const near=[];
for(const tm of es.teams){
if(tm.status==="pre") continue;
const rel=Route.visDist(es.km,tm.km), keep=this.aiPool.some(sl=>sl.team===tm);
if(Math.abs(rel)<(keep?1400:1150)) near.push({tm,rel,keep});   // 出す距離と消す距離に差をつけて、境目で出たり消えたりしない
}
near.sort((a,b)=>(b.keep-a.keep)||Math.abs(a.rel)-Math.abs(b.rel));   // いま出ている車を優先 (入れ替わりで消えない)
const shown=near.slice(0,this.aiPool.length);
for(const sl of this.aiPool){ if(!shown.some(o=>o.tm===sl.team)){ sl.team=null; if(sl.mesh) sl.mesh.visible=false; sl.mesh=null; } }
for(const o of shown){
let sl=this.aiPool.find(x=>x.team===o.tm)||this.aiPool.find(x=>!x.team);
if(!sl) break;
if(sl.team!==o.tm){ sl.team=o.tm; sl.mesh=this.aiMesh(o.tm); }
sl.mesh.visible=true;
const rp=this.roadPoint(clamp(this.s+o.rel,0,this.road.builtS-this.SEG));
let latT=-2.4;
const multi=rp.m1>0.3||rp.ow||rp.L>6;   // 片側2車線以上・分離帯あり: 追い越しは自分側の空いている車線
const stopped=o.tm.status==="run"&&!(o.tm.vNow>0.5), pStop=es.v<1||es.stopTimer>0||es.camp;
if(o.tm.status==="dnf") latT=-(rp.L+6);
else if(stopped) latT=-(rp.L+4.5);   // CS・夜・充電: 道の外に止めて、アッパーカウルを傾ける
else if(pStop&&Math.abs(o.rel)<45&&!o.tm.passing) latT= multi? -(rp.L-1.75) : 2.4;   // 止まっている自車の横を抜ける
else if(o.tm.yieldT>0) latT=-(rp.L-0.1);
else if(o.tm.passing) latT= multi? (this.lateral>-rp.L/2? -(rp.L-1.75) : -1.75) : 2.4;
o.tm.latV=lerp(o.tm.latV,latT,clamp(dtR*1.5,0,1));
const nx=Math.cos(rp.h), nz=Math.sin(rp.h);
sl.mesh.position.set(rp.x+nx*o.tm.latV,rp.y,rp.z+nz*o.tm.latV);
sl.mesh.rotation.y=-rp.h;
const top=sl.mesh.userData.top; if(top){ const tw=stopped&&o.tm.status==="run"? 0.6*(sl.mesh.userData.tiltSign||-1) : 0; top.rotation.z=lerp(top.rotation.z,tw,clamp(dtR*2,0,1)); }   // 充電: アッパーカウルだけ傾ける
// 自車との接触: 前後 4.6 m・左右 1.7 m 以内に入ったら当たり (近づく速さで 軽い接触 / 破損 / 大破)
if(o.tm.status!=="dnf"&&Math.abs(o.rel)<4.6&&Math.abs(this.lateral-o.tm.latV)<1.7&&!es.crashed){
 const vAi=(o.tm.vNow||0)/3.6, vn=Math.abs(es.v-vAi);
 if(o.rel>0&&es.v>vAi){   // 自車が前の車に追いついて当たった場合 (後ろの車は車間をとって付いてくる)
  const level= vn<Collide.LIGHT? "light" : vn<Collide.HEAVY? "damage" : "heavy";
  Engine.collision({level,kind:"team",vn});
  es.v=Math.min(es.v,vAi*0.95); } }
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
/* ---- 視覚距離 s ⇔ ルート km ---- */
kmOfS(s){ return clamp(Route.kmAtVis(this.visOrigin+s),0,TOTAL_KM); },
sOfKm(km){ return Route.vis(km)-this.visOrigin; },
/* ルートノートの動作 → 曲率プログラム [{len, k}] */
turnProgram(m){
 const D=Math.PI/180, arc=(deg,r)=>({len:Math.abs(deg*D)*r, k:deg*D/(Math.abs(deg*D)*r)});
 switch(m.turn){
  case "L": return [arc(-90,12)];
  case "R": return [arc(90,12)];
  case "veerL": return [arc(-30,40)];
  case "veerR": return [arc(30,40)];
  case "uturn": return [arc(90,9),{len:8,k:0},arc(90,9)];
  case "rab": { const c=m.exit==="R"?180:m.exit==="L"?0:90; return [arc(-40,14),arc(c+80,13),arc(-40,14)]; }
  default: return [];   // keepS/keepL/keepR: 進路は直進 (分岐だけ作る)
 }
},
advanceGen(sNext){
const g=this.gen;
const km=this.kmOfS(sNext);
const zone=Route.real(km);
// 地形の勾配
g.gradeRemain-=this.SEG;
if(g.gradeRemain<=0){
 const mid=(km>950&&km<2150), hilly=P.event&&typeof EventGame!=="undefined"&&EventGame.hilly&&!zone;   // イベントの Port Augusta 区間: 激しいアップダウン
 const flatBias= hilly?0.15:zone?1:(mid?0.75:0.45);
 if(hilly&&Math.random()>flatBias){ g.targetGrade=(Math.random()<0.5?-1:1)*(0.025+Math.random()*0.03); g.gradeRemain=150+Math.random()*250; }
 else if(Math.random()<flatBias){ g.targetGrade=0; g.gradeRemain=400+Math.random()*1400; }
 else{ const mag= mid?(0.004+Math.random()*0.010):(0.006+Math.random()*0.018);
  g.targetGrade=(Math.random()<0.5?-1:1)*mag; g.gradeRemain=150+Math.random()*650; }
 if(this.genY>(hilly?45:25)) g.targetGrade=Math.min(g.targetGrade,-0.006);
 if(this.genY<-(hilly?45:25)) g.targetGrade=Math.max(g.targetGrade,0.006);
}
// 実際の勾配に沿わせる (イベントの起伏区間と町の区間を除く)
if(typeof Geo!=="undefined"&&Geo.ok&&P.mode==="race"&&!(P.event&&EventGame.hilly)&&!(zone&&OsmRoute.townAt(km))){
 g.targetGrade=clamp(Geo.grade(km),-0.08,0.08); g.gradeRemain=this.SEG;
 if(this.genY>60) g.targetGrade=Math.min(g.targetGrade,-0.002); if(this.genY<-60) g.targetGrade=Math.max(g.targetGrade,0.002); }
// 縦断の曲率は半径 1 万 m 程度 (勾配変化 0.0001/m)。急だと坂の頂上の先の道路が数十 m で見えなくなる
g.grade+=clamp(g.targetGrade-g.grade,-0.0001,0.0001)*this.SEG*(zone?0.3:1)*(P.event&&typeof EventGame!=="undefined"&&EventGame.hilly&&!zone?5:1);
// OSM の町区間 (等倍) は平坦: 道路が同じ場所を再び通るので、高さがずれると地形が別の区間の道路を覆う
if(P.mode==="race"&&zone&&OsmRoute.townAt(km)){ g.grade*=0.85; g.targetGrade=0; g.gradeRemain=Math.max(g.gradeRemain,200); }
this.genY=(this.genY||0)+g.grade*this.SEG;
// OSM の町区間: 等倍ゾーン内は実形状 (方位 = osmOff + H(km))。ゾーン外 (圧縮区間) は直線で、次のゾーンで合わせ直す
const kmPrev=this.lastGenKm, lastH=this.road.pts[this.road.pts.length-1].h;
const town= P.mode==="race"&&!this.prog? OsmRoute.townAt(km) : null;
let osmCurv=null;
if(town&&zone){
 if(this.osmTown!==town){ this.osmTown=town; this.osmOff=lastH-OsmRoute.H(town,km); osmCurv=0; }
 else osmCurv=(OsmRoute.H(town,km)-OsmRoute.H(town,kmPrev))/this.SEG;
}else if(town) osmCurv=0;
if(!(town&&zone)) this.osmTown=null;
// ルートノートの右左折: 区間に入ったら曲率プログラムを実行 (OSM 区間の動作は実形状に含まれる)
if(!this.prog&&P.mode==="race"){
 const m=RP_MANEUVERS.find(m=>m.km>kmPrev-1e-9&&m.km<=km&&!this.doneMan.has(m));
 if(m){ this.doneMan.add(m);
  const osm=m.osm&&osmCurv!==null&&this.osmTown===m.osm;
  if(!osm){ this.prog=this.turnProgram(m).map(p=>({...p})); g.curv=0; g.targetCurv=0; g.curvRemain=60; osmCurv=null; this.osmTown=null; }
  this.junctions.push({s:sNext,km:m.km,m,osm,h: osm&&m.osmHin!=null? this.osmOff+m.osmHin : lastH}); }
}
this.lastGenKm=km;
if(this.prog&&this.prog.length){
 const p=this.prog[0]; p.len-=this.SEG; const k=p.k; if(p.len<=0) this.prog.shift(); if(!this.prog.length){ this.prog=null; this.geoHold=km+0.6; }   // 曲がったあとしばらくは実際の方位に合わせない (同じ曲がりを二重にしない)
 return {grade:g.grade,curv:k};
}
if(osmCurv!==null){ g.curv=0; g.targetCurv=0; g.curvRemain=60; this.geoOff=null; return {grade:g.grade,curv:osmCurv}; }
// 町の外: 画面の道の向きを実際の道の方位 (なめらかにしたもの) に少しずつ合わせる。
// 圧縮区間 (画面 1 m = 実際の数十 m) では実際の曲がりをそのまま描くと急になりすぎるので、曲がりの強さに上限を付ける
if(typeof Geo!=="undefined"&&Geo.ok&&P.mode==="race"&&!(P.event&&typeof EventGame!=="undefined"&&EventGame.hilly)){
 if(this.geoHold!=null&&km<this.geoHold){ g.curv=0; return {grade:g.grade,curv:0}; }
 const w=zone?0.3:1.5, a=Math.max(0,km-w), b=Math.min(TOTAL_KM,km+w), la=Geo.lat(a), lb=Geo.lat(b), B=Math.atan2((Geo.lon(b)-Geo.lon(a))*Math.cos(la*Math.PI/180),lb-la);
 if(this.geoOff==null||this.geoHold!=null){ this.geoOff=lastH-B; this.geoHold=null; }
 const err=Math.atan2(Math.sin(this.geoOff+B-lastH),Math.cos(this.geoOff+B-lastH)), kmax=zone?1/150:1/450;
 const curv=clamp(err/(zone?40:120),-kmax,kmax); g.curv=curv; return {grade:g.grade,curv};
}
// 等倍ゾーン(町中)は直線、それ以外は緩いカーブを自動生成
g.curvRemain-=this.SEG;
if(g.curvRemain<=0){
 const tp=townProx(km), towny=tp<12, mid=(km>950&&km<2150);
 const straightBias= zone?1:(mid?0.85:(towny?0.35:0.65));
 if(Math.random()<straightBias){ g.targetCurv=0; g.curvRemain=towny?150+Math.random()*300:600+Math.random()*1800; }
 else{ const r= towny?(220+Math.random()*500):(900+Math.random()*1800);
  g.targetCurv=(Math.random()<0.5?-1:1)/r; g.curvRemain=120+Math.random()*380; }
}
g.curv+=clamp(g.targetCurv-g.curv,-0.00002,0.00002)*this.SEG;
return {grade:g.grade,curv:g.curv};
},
ensureRoad(upTo){
const r=this.road, CHUNK=200;
// OSM の町区間では、町の終わりまで道路の形を先に作る (ループ・往復で後から通る区間の上に景観を置かないため)
let ahead=upTo+CHUNK+900;
if(P.mode==="race"){ const kA=this.kmOfS(upTo), kB=this.kmOfS(ahead+300);
 for(const t of OsmRoute.towns) if(t.km1>kA&&t.km0<kB&&Route.real(Math.max(t.km0,kA))) ahead=Math.max(ahead,Math.min(this.sOfKm(t.km1)+60,upTo+12000)); }
while(r.builtS<ahead){
const last=r.pts[r.pts.length-1];
const sN=r.builtS+this.SEG;
const gen=this.advanceGen(sN);
const km=this.kmOfS(sN);
const macroSlope=Route.real(km)?0:profileAt(km).slope;
const grade0=gen.grade+macroSlope;
const h=last.h+gen.curv*this.SEG;
// 路面高さ = 地形に沿った基準高さ yb + 立体交差の持ち上げ bh (等倍ゾーン内のみ)
const yb=(last.yb!=null?last.yb:last.y)+grade0*this.SEG;
const bm= P.mode==="race"&&Route.real(km)? OsmRoute.bumpAt(km) : null, bh=bm?bm.h:0;
const y=yb+bh, grade=grade0+(bh-(last.bh||0))/this.SEG;
const x=last.x+Math.sin(h)*this.SEG;
const z=last.z-Math.cos(h)*this.SEG;
const pr= P.mode==="race"? OsmRoute.profAt(km) : OsmRoute.DEF_PROF;
const wt= P.mode==="race"&&Route.real(km)? OsmRoute.waterAt(km) : null;
r.pts.push({x,z,y,h,g:grade,c:gen.curv,L:pr.L,m1:pr.m1,R:pr.R,ow:pr.ow,dual:pr.dual,yb,bh,deck:!!(bm&&bm.deck)||!!wt,wd:wt?wt.depth*wt.edge:0});
r.builtS=sN;
}
while(true){
const lastEnd=r.chunks.length? r.chunks[r.chunks.length-1].endS:0;
if(lastEnd>=upTo || lastEnd+CHUNK>r.builtS) break;
const mesh=this.buildRoadChunk(lastEnd,lastEnd+CHUNK);
r.chunks.push({startS:lastEnd,endS:lastEnd+CHUNK,mesh,branches:mesh.userData.branches||[]});
this.scene.add(mesh);
}
while(r.chunks.length&&r.chunks[0].endS<this.s-400){
const c=r.chunks.shift();
this.scene.remove(c.mesh);
c.mesh.traverse(ch=>{ if(ch.geometry) ch.geometry.dispose(); });
for(const b of c.branches){ const i=this.branches.indexOf(b); if(i>=0) this.branches.splice(i,1); }
if(typeof Collide!=="undefined") Collide.removeOwner(c.mesh);
}
},
roadPoint(s){
const r=this.road;
const i=clamp(Math.floor(s/this.SEG),0,r.pts.length-2);
const t=clamp((s-i*this.SEG)/this.SEG,0,1);
const a=r.pts[i], b=r.pts[i+1];
let dh=b.h-a.h;
return { x:lerp(a.x,b.x,t), y:lerp(a.y,b.y,t), z:lerp(a.z,b.z,t), h:a.h+dh*t, g:lerp(a.g,b.g,t), c:lerp(a.c||0,b.c||0,t),
 L:lerp(a.L||5,b.L||5,t), m1:lerp(a.m1||0,b.m1||0,t), R:lerp(a.R||5,b.R||5,t), ow:t<0.5?!!a.ow:!!b.ow, dual:t<0.5?!!a.dual:!!b.dual,
 bh:lerp(a.bh||0,b.bh||0,t), deck:t<0.5?!!a.deck:!!b.deck, wd:lerp(a.wd||0,b.wd||0,t) };
},
/* 区間 [s-w, s+w] の最大曲率 (地形帯の内側クランプ用) */
maxCurv(s,w){
 const r=this.road, i0=clamp(Math.floor((s-w)/this.SEG),0,r.pts.length-1), i1=clamp(Math.ceil((s+w)/this.SEG),0,r.pts.length-1);
 let mp=0, mn=0; for(let i=i0;i<=i1;i++){ const c=r.pts[i].c||0; if(c>mp) mp=c; if(-c>mn) mn=-c; }
 return [mp,mn];
},
buildRoadChunk(s0,s1){ return Scenery.buildChunk(this,s0,s1); },
/* 現在kmで道路と景観を作り直す (スタート/ワープ/デバッグ用) */
resetRoad(){
 if(this.road) for(const c of this.road.chunks){ this.scene.remove(c.mesh); c.mesh.traverse(ch=>{ if(ch.geometry) ch.geometry.dispose(); }); }
 if(typeof Collide!=="undefined") Collide.clear();
 const es=Engine.st, km=es?es.km:0;
 this.road={pts:[{x:0,z:0,y:0,h:0,g:0,c:0,L:5,m1:0,R:5}],builtS:0,chunks:[]}; if(typeof Scenery!=="undefined") Scenery._bld=[];
 this.branches=[]; this.junctions=[]; this.prog=null; this.doneMan=new Set(); this.lastGenKm=-1; this.osmTown=null; this.geoOff=null; this.geoHold=null;
 this.s=320; this.visOrigin=Route.vis(km)-this.s;
 // 現在地より手前の動作は実行済み扱い
 for(const m of RP_MANEUVERS) if(m.km<this.kmOfS(0)) this.doneMan.add(m);
 this.lastGenKm=this.kmOfS(0);
 this.lateral=-2.4; this.relHeading=0; this.prevRoadH=0; this.genY=0;
 this.gen={grade:0,targetGrade:0,gradeRemain:400,curv:0,targetCurv:0,curvRemain:600};
 for(const [,e] of this.lmMap) this.scene.remove(e.mesh); this.lmMap.clear();
 this.ensureRoad(this.s+1500); Horizon.lastKm=-1e9;
 const p=this.roadPoint(this.s);
 this.cx=p.x+Math.cos(p.h)*this.lateral; this.cz=p.z+Math.sin(p.h)*this.lateral; this.ch=p.h; this.iProj=Math.floor(this.s/this.SEG);
 this.onBranch=null;
},
/* 本線への射影 (直前インデックス近傍のみ探索: 折り返しで反対側に飛ばない) */
project(x,z){
 const P=this.road.pts, n=P.length; let best=null, bd=1e18;
 const i0=clamp(this.iProj-30,0,n-2), i1=clamp(this.iProj+30,0,n-2);
 for(let i=i0;i<=i1;i++){
  const a=P[i], b=P[i+1], dx=b.x-a.x, dz=b.z-a.z, L2=dx*dx+dz*dz||1;
  const t=clamp(((x-a.x)*dx+(z-a.z)*dz)/L2,0,1), px=a.x+dx*t, pz=a.z+dz*t;
  const d=(x-px)**2+(z-pz)**2+Math.abs(i-this.iProj)*0.02;
  if(d<bd){ bd=d; best={i,t,px,pz}; }
 }
 const a=P[best.i], b=P[best.i+1];
 const h=a.h+(b.h-a.h)*best.t;
 const lat=(x-best.px)*Math.cos(h)+(z-best.pz)*Math.sin(h);
 return {s:(best.i+best.t)*this.SEG, lat, h, i:best.i};
},
/* 分岐道路への距離 */
branchAt(x,z){
 let hit=null, bd=1e9;
 for(const b of this.branches){
  if(Math.abs(b.sJ-this.s)>b.len+80) continue;
  const P=b.pts;
  for(let i=0;i<P.length-1;i++){
   const a=P[i], c=P[i+1], dx=c.x-a.x, dz=c.z-a.z, L2=dx*dx+dz*dz||1;
   const t=clamp(((x-a.x)*dx+(z-a.z)*dz)/L2,0,1), d=Math.hypot(a.x+dx*t-x,a.z+dz*t-z);
   if(d<bd){ bd=d; hit={b,i,t,d,y:a.y+(c.y-a.y)*t,along:(i+t)*b.step}; }
  }
 }
 if(hit&&hit.d<=hit.b.half+1.2) return hit;
 // 隅切り (交差点の角の舗装) の上も分岐の一部
 for(const b of this.branches){ if(Math.abs(b.sJ-this.s)>60) continue;
  for(const f of b.fillets||[]){ if(Math.hypot(f.C[0]-x,f.C[1]-z)<8.5) return {b,i:0,t:0,d:0,y:b.pts[0].y,along:0}; } }
 return null;
},
update(dtR){
const es=Engine.st; if(!es) return;
if(this.cx===undefined) this.resetRoad();
const vv=es.v;
// ---- ワールド座標での運動 (分岐/Uターンに対応) ----
if(vv>0.3){
 const yawRate=gearDir()*(VEH.active&&VEH.spec.chassis? VehDyn.yawRate(Input.steer,vv) : Input.steer*clamp(6.5/Math.max(vv,4),0.12,1.0));   // 後退では向きの変わり方が逆
 /* 車は切った瞬間には向きが変わらない (タイヤがたわんで横力が立ち上がるまでの遅れ・車体の回りにくさ)。速いほど遅れが目立つ */
 const tau=0.06+0.10*clamp(vv/25,0,1); this.yawR=lerp(Number.isFinite(this.yawR)?this.yawR:0,yawRate,clamp(dtR/tau,0,1));
 this.ch+=this.yawR*dtR;
 es.gLat=(this.yawR*vv)/9.81;
} else { es.gLat=0; this.yawR=0; }
const cx0=this.cx, cz0=this.cz;   // 当たり判定の掃引用
this.cx+=Math.sin(this.ch)*vv*gearDir()*dtR; this.cz-=Math.cos(this.ch)*vv*gearDir()*dtR;
// 横風 (諸元があるとき): 横方向に押される。タイヤの横すべりで遅れて効く
if(VEH.active&&VEH.spec.chassis&&P.mode==="race"){
 const aY= vv>1? VehDyn.sideAccel(-(es.lastCross||0),es.lastRho||1.17,massTotal()) : 0;
 this.vyWind=lerp(this.vyWind||0,aY*0.35,clamp(dtR*3,0,1));
 /* 突風: 風が急に変わると鼻先が振られる (当て舵が要る)。風が一定になれば収まる */
 this.aYs=lerp(Number.isFinite(this.aYs)?this.aYs:aY,aY,clamp(dtR/1.2,0,1)); this.aYw=aY; if(vv>3) this.ch+=clamp((aY-this.aYs)*0.018,-0.05,0.05)*dtR;
 this.cx+=Math.cos(this.ch)*this.vyWind*dtR; this.cz+=Math.sin(this.ch)*this.vyWind*dtR;
}
// 横転の危険度 (レース): 横風・浮き上がり・旋回・加減速。0.6 で後方追走車が警告、0.85 で警報、1 を 0.25 秒超えると横転
if(P.mode==="race"&&!P.event&&!es.crashed&&!es.camp){
 this.stillT= vv<0.5&&!(es.gear==="R")? (this.stillT||0)+dtR : 0;   // 停車して約 8 秒: 誘導車・追走車が風上で風よけ、クルーが車体を押さえる
 const shield=this.stillT>8; if(shield&&!this._shieldMsg&&Math.abs(es.lastCross||0)>10){ this._shieldMsg=true; Radio.push("停車確認。誘導車と追走車を風上側に寄せて風よけにします。クルーは降りて車体を押さえて。","後方追走車",{speak:true}); }
 if(!shield) this._shieldMsg=false; es.shielded=shield;
 const R=VehDyn.roll(es,-(es.lastCross||0),vv,shield); es.tipRatio=R.risk; es.tipDir=R.dir; es.tipWind=R.wind; es.tipTurn=R.turn;
 es.tipMax=Math.max(es.tipMax||0,R.risk);
 if(this.tipWarnT>0) this.tipWarnT-=dtR;
 if(R.risk>=0.6&&!(this.tipWarnT>0)){ this.tipWarnT= R.risk>=0.85? 4 : 8; if(R.risk>=0.85) Snd.alarm();
  Radio.push(R.risk>=0.85? `⚠ 片輪が浮いています!すぐに減速、ハンドルはゆっくり (危険度 ${(R.risk*100).toFixed(0)} %)` : `車体が風であおられています。減速してください (横転の危険度 ${(R.risk*100).toFixed(0)} %)`,"後方追走車",{speak:true}); }
 this.tipOver= R.risk>=1? (this.tipOver||0)+dtR : 0;
 if(this.tipOver>=0.25) Engine.rollover(R,vv);
} else es.tipRatio=0;
{ const el=this._rollEl||(this._rollEl=document.getElementById("hud-roll")), r=es.tipRatio||0, show=r>=0.25||(es.scenario==="storm"&&!es.crashed);   // 画面: 横転の危険度
  if(el){ if(show!==this._rollShow){ this._rollShow=show; el.style.display=show?"flex":"none"; }
   const k=Math.round(r*100); if(show&&k!==this._rollK){ this._rollK=k; el.classList.toggle("hi",r>=0.6); el.querySelector("b").textContent=Math.min(999,k); el.querySelector(".bar>i").style.width=Math.min(100,k)+"%";
    el.querySelector(".w").textContent=`横風 ${Math.abs(es.lastCross||0).toFixed(0)} m/s${es.shielded?"・風よけ":""}`; } } }
// 当たり判定 (レースモード): 沿道の固定物・壁・他の車両・人
if(P.mode==="race"&&typeof Collide!=="undefined"&&Collide.enabled&&!es.fire&&!(typeof Crew!=="undefined"&&Crew.busy()&&Crew.phase==="outside")){
 const st={x:this.cx,z:this.cz,h:this.ch,v:es.v*gearDir()}, [L,W]=carDims();
 const hit=Collide.sweep(cx0,cz0,st,L,W,this.dynColliders(es));
 if(hit){ this.cx=st.x; this.cz=st.z; es.v=Math.abs(st.v); Engine.collision(hit); }
}
const sPrev=this.s;
const pr=this.project(this.cx,this.cz);
this.iProj=pr.i; this.s=pr.s; this.lateral=pr.lat;
this.relHeading=Math.atan2(Math.sin(this.ch-pr.h),Math.cos(this.ch-pr.h));
es.progRate= vv>0.3? clamp((this.s-sPrev)/(vv*dtR),-1,1) : 1;
this.ensureRoad(this.s+GFX.cur().ahead);
const pHere=this.roadPoint(this.s), pHere0=pHere;
// 分岐道路 (脇道・曲がり損ね)
const onMain=this.lateral>=-(pHere0.L+0.4)&&this.lateral<=pHere0.R+0.4;
const br=onMain? null : this.branchAt(this.cx,this.cz);
if(br&&!this.onBranch&&!br.b.ring){ this.onBranch=br.b; this.branchWarned=false; }
if((!br||br.b.ring)&&this.onBranch&&onMain) { if(this.branchWarned) Radio.push("ルートに復帰しました。","前方誘導車"); this.onBranch=null; }
if(this.onBranch&&br&&!this.branchWarned&&br.along>12){
 this.branchWarned=true; Snd.alarm();
 const b=this.onBranch;
 Radio.push(b.wrong? `⚠ ルートを外れました!(${b.name||"脇道"}) 安全な場所でUターンして戻ってください。` : `⚠ 脇道(${b.name||"t/o"})に入っています。Uターンして本線へ戻ってください。`,"前方誘導車");
 toast("⚠ ルート外走行中 ― Uターンして戻る","#f59e0b");
}
es.offRoute=!!this.onBranch;
this.carSlope=Math.atan(pHere.g);
const ahead=this.roadPoint(this.s+300);
this.upcomingGrade= Math.abs(ahead.g)>0.02 ? Math.sign(ahead.g) : 0;
const site=Scenery.pavedSite(this,this.s,this.lateral);
es.offroad=!onMain && !br && !site && !es.camp && es.stopTimer<=0;
if(es.offroad&&es.v>1) es.v=Math.max(0,es.v-clamp(es.v*0.12,0.2,2.5)*dtR);
let carY= br? br.y : site? pHere.y+(site.y||0) : pHere.y;
if(!Number.isFinite(carY)) carY=pHere.y;   // 高さが壊れても画面全体を道連れにしない
const nx=Math.cos(pHere.h), nz=Math.sin(pHere.h);
const hCar=this.ch;
this.car.position.set(this.cx, carY, this.cz);
this.car.rotation.y=-hCar;
if(this.car.userData.wheels) for(const w of this.car.userData.wheels){   // 車輪の回転と前輪の舵角
 w.spin=((w.spin||0)+vv*dtR/w.r)%(Math.PI*2); w.g.rotation.order="YXZ";
 w.g.rotation.y= w.front? -Input.steer*0.45 : 0; w.g.rotation.x=-w.spin; }
/* サスペンション: 加減速で前後に沈み (ブレーキで前のめり)、少し行き過ぎて戻る。路面のうねり・荒れで上下に揺れる */
{ const tgt=clamp(-(es.gLong||0)*0.04,-0.06,0.06), h=Math.min(dtR,0.05), k=90, c=8.5; if(!Number.isFinite(this.pitchS)){ this.pitchS=0; this.pitchV=0; }
  this.pitchV+=((tgt-this.pitchS)*k-this.pitchV*c)*h; this.pitchS+=this.pitchV*h; if(!Number.isFinite(this.pitchS)||Math.abs(this.pitchS)>0.2){ this.pitchS=0; this.pitchV=0; }
  const sp=clamp(vv/10,0,1), amp=es.offroad?0.03:0.0045, sd=this.s||0, hv=(Math.sin(sd*0.31)+Math.sin(sd*0.83+1.7)*0.6+Math.sin(sd*2.9+0.4)*0.25)*amp*sp;
  this.car.position.y+=hv; this.heave=hv;
  this.car.rotation.x=-Math.atan(pHere.g)*0.8+this.pitchS+Math.cos(sd*0.83)*amp*0.6*sp; }
this.car.rotation.order="YXZ";
{ const want= es.rolledOver? 1.75*(es.tipDir||1) : clamp((es.tipRatio||0)*0.06,0,0.08)*(es.tipDir||1)-clamp((es.gLat||0)*0.035,-0.04,0.04);   // 横転: 風下へ倒れる。旋回では外側へ少し傾く
  this.carRoll=lerp(this.carRoll||0,want,clamp(dtR*(es.rolledOver?2.2:6),0,1)); this.car.rotation.z=-this.carRoll; if(es.rolledOver) this.car.position.y+=Math.sin(Math.abs(this.carRoll))*0.5;
  // 横転したら風下へ転がりながら滑り、路肩で止まる (2025 年の映像のように)
  if(es.rolledOver){ const p0=this.roadPoint(this.s), edge=(es.tipDir||1)>0? p0.R+1.2 : -(p0.L+1.2), dl=edge-this.lateral; this.rollSlide=(this.rollSlide||0)+dtR;
   if(this.rollSlide<3&&Math.abs(dl)>0.05){ const st=clamp(dl,-3*dtR,3*dtR); this.lateral+=st; this.cx+=Math.cos(this.ch)*st; this.cz+=Math.sin(this.ch)*st; this.car.rotation.y+=(es.tipDir||1)*0.25*Math.min(1,this.rollSlide); } } else this.rollSlide=0; }
let wantTilt=(es.camp||es.stopTimer>0||StopMenu.mode==="charge")&&!es.disconnected;
if(typeof Crew!=="undefined"&&Crew.busy()&&Crew.phase!=="outside") wantTilt=false;   // ドライバーが乗っている間は傾けない
const targetRoll=wantTilt? -es.tiltDeg*Math.PI/180*0.85 : 0;
const UT=this.car.userData.upperTilt;   // 和大型: アッパーカウルだけを傾ける
if(UT){ UT.rotation.z=lerp(UT.rotation.z,targetRoll,dtR*2); this.carBody.rotation.z=0; }
else this.carBody.rotation.z=lerp(this.carBody.rotation.z,targetRoll,dtR*2);
if(es.offroad&&es.v>2) this.car.position.y+=Math.random()*0.05;
if(es.burst&&es.v>2) this.car.position.y+=Math.random()*0.04;
if(this.car.userData.brakeMat)
this.car.userData.brakeMat.color.setHex((es.brakePhys>0.05||es.brakeRegen>0.05)?0xff2222:0x4a0505);
updateWinkers(this.car,es);
updateRearCombo(this.car,es); reverseBeep(es);
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
this.bayGroup.visible=false;
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
const cd=11+clamp(vv,0,36)*0.07;   // 速いほど少し離れる (速度感)
camPos=new THREE.Vector3(cx-Math.sin(hCar)*cd, cy+4.2-clamp(vv,0,36)*0.012, cz+Math.cos(hCar)*cd);
const shk=clamp((vv-26)/45,0,1)*0.06;camPos.x+=(Math.random()-.5)*shk;camPos.y+=(Math.random()-.5)*shk;
lookAt=new THREE.Vector3(cx+Math.sin(hCar)*20, cy+1.1, cz-Math.cos(hCar)*20);
} else if(this.cam===1){
const cx=this.car.position.x, cy=this.car.position.y, cz=this.car.position.z;
camPos=new THREE.Vector3(cx-Math.sin(hCar)*1.8, cy+1.45, cz+Math.cos(hCar)*1.8);
lookAt=new THREE.Vector3(cx+Math.sin(hCar)*40, cy+1.0, cz-Math.cos(hCar)*40);
} else if(this.cam===2){ // ドライバー: 頭を車体に固定(勾配ピッチ・オフロード揺れを継承)
this.car.updateMatrixWorld();
const E0=(VEH.active&&VEH.spec.eye)||[0,.84,-.45];
/* 頭の動き: 横 G で外へ・加減速で前後へ傾き、路面の細かい揺れ (速いほど) を拾う。曲がる先を少し見る */
 const gl=clamp(es.gLat||0,-1,1), gg=clamp(es.gLong||0,-1,1), t=performance.now()/1000, rv=clamp(vv/28,0,1)*(es.offroad?0.03:0.0035);
 this.headX=lerp(this.headX||0,-gl*0.07,clamp(dtR*5,0,1)); this.headZ=lerp(this.headZ||0,gg*0.05,clamp(dtR*4,0,1)); this.lookX=lerp(this.lookX||0,clamp(this.yawR||0,-0.6,0.6)*9,clamp(dtR*3,0,1));
 const eye=new THREE.Vector3(E0[0]+this.headX, E0[1]+(Math.sin(t*31)+Math.sin(t*47.3)*0.6)*rv-Math.abs(gg)*0.008, E0[2]+this.headZ);
eye.applyMatrix4(this.car.matrixWorld);
const aim=new THREE.Vector3(this.lookX,.76,-30).applyMatrix4(this.car.matrixWorld);
camPos=eye; lookAt=aim;
} else if(this.cam===4){ const R=this.replayCam(dtR,vv,hCar); camPos=R.pos; lookAt=R.look; this.replayFov=R.fov;
} else {
const cx=this.car.position.x, cy=this.car.position.y, cz=this.car.position.z;
camPos=new THREE.Vector3(cx+Math.sin(hCar)*0.3, cy+2.2, cz-Math.cos(hCar)*0.3);
lookAt=new THREE.Vector3(cx-Math.sin(hCar)*60, cy+1.2, cz+Math.cos(hCar)*60);
}
if(this.canopyMesh){ // ドライバー視点: キャノピーを内側から見る (前窓はほぼ透明、屋根は濃いスモーク。照り返しなし)
 const inside=this.cam===2&&(typeof Crew==="undefined"||Crew.inCar()), cm=this.canopyMesh;
 if(!cm.userData.extMat){ cm.userData.extMat=cm.material;
  const smoke=new THREE.MeshBasicMaterial({color:0x0a0f16,transparent:true,opacity:.22,depthWrite:false,side:THREE.DoubleSide});
  cm.userData.inMat=[smoke,smoke]; }
 cm.material= inside? cm.userData.inMat : cm.userData.extMat;
 cm.visible=true; }
if(typeof Crew!=="undefined"){ Crew.update(dtR); }
if(typeof Crew!=="undefined"&&Crew.camera(this)){}   // 乗降手順・車外歩行の視点
else { if(this.cam>=2) this.camera.position.copy(camPos);
else this.camera.position.lerp(camPos,clamp(dtR*(this.cam===0?5:12),0,1));
if(!Number.isFinite(this.camera.position.x+this.camera.position.y+this.camera.position.z)&&Number.isFinite(camPos.x+camPos.y+camPos.z)) this.camera.position.copy(camPos);   // 一度でも壊れた値になると補間で戻らない (画面が真っ黒のまま) ため
this.camera.lookAt(lookAt); }
// 予備の地面: OSM の町区間 (平坦) では路面のすぐ下に置き、急な右左折の内側で地形の帯が縮んでできる隙間を塞ぐ
const flatTown=P.mode==="race"&&Route.real(es.km)&&OsmRoute.townAt(es.km);
const nearWater=flatTown&&[-0.3,-0.15,0,0.15,0.3,0.45].some(d=>OsmRoute.waterAt(es.km+d));   // 水面の橋の近くでは川底より下へ
// 右左折の区間 (平らに作る所: CS の出入りなど) も同じ。折れ目で地形の帯が重なってできる隙間から、深い穴が見えていた
const flatZone=!flatTown&&P.mode==="race"&&[-0.25,0,0.25,0.5,0.75].some(d=>Route.zoneFade(es.km+d)<=0.02);
{ const gT= flatTown?(nearWater?7:0.3):flatZone?0.5:60; this.gDrop= flatTown||!Number.isFinite(this.gDrop)||this._gKm==null||Math.abs(es.km-this._gKm)>0.2? gT : lerp(this.gDrop,gT,clamp(dtR*3,0,1)); this._gKm=es.km; }   /* 走行中はなめらかに、開始・移動の直後はすぐに */
this.ground.position.set(pHere.x,(pHere.y-(pHere.bh||0))-this.gDrop,pHere.z);
const alt=es.sunAlt||0, az=(es.sunAz||0);
// 太陽の向き: 画面の道の向き (pHere.h) と実際の道の方位 (bearing) のずれ を足して画面の方位にする。
// 町 (実際の道の形) とそれ以外 (作った道) でずれが変わるので、急に回らないよう走った距離に応じてゆっくり合わせる
const wrapA=a=>Math.atan2(Math.sin(a),Math.cos(a)), geoB=profileAt(es.km).bearing, dOff=wrapA((Number.isFinite(pHere.h)?pHere.h:geoB)-geoB);
if(this.sunOff==null||!Number.isFinite(this.sunOff)||Math.abs(es.km-this.sunKm)>5) this.sunOff=dOff;
else this.sunOff=wrapA(this.sunOff+wrapA(dOff-this.sunOff)*clamp(Math.abs(es.km-this.sunKm)/8,0,1));
this.sunKm=es.km;
const relAz=az+this.sunOff;
const sunDist=1400, sy=Math.sin(alt)*sunDist, shD=Math.cos(alt)*sunDist;
this.sun.position.set(pHere.x+Math.sin(relAz)*shD, Math.max(sy,-80), pHere.z-Math.cos(relAz)*shD);
this.sunLight.position.copy(this.sun.position);
// 天候の切り替わりは約 10 秒 (実時間) かけて移る (空・日差し・雲・明るさ・映り込み・陽炎)
{ const want=es.weather?1:0; if(this.wxMix==null||this._wxGame!==es) { this.wxMix=want; this._wxGame=es; } this.wxMix+=clamp(want-this.wxMix,-dtR/10,dtR/10); }
const WX=this.wxMix;
/* 明るさ: 目 (カメラ) は暗さに慣れるので、太陽が 10° も上がればほぼ昼の明るさに見える。夕焼けの色は地平線近く (約 8° 以下) だけ */
const sunUp=clamp(Math.sin(alt)/0.5,0,1), dayK=Math.pow(sunUp,0.45);
this.sunLight.intensity=clamp(1.25*dayK,0.02,1.2)*(1-0.65*WX);
{ const warm=clamp(alt/0.3,0,1); this.sunLight.color.setRGB(1.0,0.62+0.33*warm,0.38+0.5*warm); }
this.sunLight.target.position.copy(this.car.position);
this.sunLight.position.sub(this.car.position).normalize().multiplyScalar(1400).add(this.car.position);
const dayTop=new THREE.Color(0x2f7fc4),dayHor=new THREE.Color(0xbdd7ea);
const setTop=new THREE.Color(0x27356b),setHor=new THREE.Color(0xe8814f);
const nigTop=new THREE.Color(0x040914),nigHor=new THREE.Color(0x0a1226);
const t1=clamp((alt+0.1)/0.13,0,1),t2=clamp((alt-0.02)/0.2,0,1);   /* 夜 → 薄明 (太陽が地平線の下 6° から) → 昼 (太陽が約 12° で昼の空) */
const hor=nigHor.clone().lerp(setHor,t1).lerp(dayHor,t2);
const top=nigTop.clone().lerp(setTop,t1).lerp(dayTop,t2);
if(WX>0){hor.lerp(new THREE.Color(0x8a94a0),0.5*WX);top.lerp(new THREE.Color(0x5c6672),0.5*WX);}
if(this.scene.fog)this.scene.fog.color.copy(hor).convertSRGBToLinear();
if(this.skyDome){
const u=this.skyDome.material.uniforms;
u.uTop.value.copy(top);u.uHor.value.copy(hor);
u.uSunDir.value.copy(this.sun.position).sub(this.car.position).normalize();
u.uCover.value=0.22+0.38*WX;
if(u.uDust){ const b=biomeAt(es.km); u.uDust.value.setHex(b.urban?0xc9c4b8:0xd9b48c).convertSRGBToLinear().lerp(hor,0.35); }
u.uNight.value=clamp(1-(alt+0.1)/0.1,0,1);   /* 星は太陽が沈んでから */
u.uTime.value=performance.now()/1000;
this.skyDome.position.copy(this.camera.position);
}
if(this.farRidge){ const b=biomeAt(es.km), fu=this.farRidge.material.uniforms; this.farRidge.position.set(this.camera.position.x,pHere.y-(pHere.bh||0),this.camera.position.z);
 fu.uHill.value=lerp(fu.uHill.value,P.mode==="race"&&!b.urban? clamp((b.hill-0.5)/2.5,0,1) : 0,0.02); fu.uShift.value=es.km*0.004;
 fu.uHaze.value.copy(hor); fu.uCol.value.setHex(b.soil).multiplyScalar(0.55*clamp(0.25+dayK,0,1)); }
this.hemiLight.intensity=clamp(0.14+0.66*dayK+0.12*t1,0.12,0.8)*(1-0.4*WX);
// 空からの光の色: 空そのものの色で照らす (朝夕は暖かく、曇りは灰色、昼は青み)。白を混ぜて色が付きすぎないように
this.hemiLight.color.copy(top).lerp(hor,0.35).lerp(_WHITE,0.45);
// 車体などに映る空 (時刻・天気・土地の色に合わせて作り直す。画質「低」は作らない)
EnvLight.update(this.renderer,this.scene,top,hor,new THREE.Color(biomeAt(es.km).soil),this.sun.position.clone().sub(this.car.position).normalize(),clamp(Math.sin(alt)*1.3,0,1)*(1-0.8*WX),this.sunLight.color);
this.updateEnvironment(es,pHere,alt,hor);
if(typeof Rain!=="undefined") Rain.update(this,es,dtR);   // 雨 (雨筋・しぶき・濡れた路面・視界・ガラスの雨粒・音・雷)
this.updateLandmarks(es);
this.updateRoadTrains(es,dtR);
// 前方誘導車: 通常は150m前。信号で先に抜けて赤で分断されたら、その場でハザードを点けて停車し待機
{ const want=this.s+150;
  if(this.leadS===undefined||Math.abs(this.leadS-want)>2000) this.leadS=want;
  let hold=false, stopAt=Infinity;
  for(const [,ent] of this.lmMap){ if(ent.lm.t!=="signal"||!ent.red) continue;
   const sg=this.sOfKm(ent.lm.km);
   if(sg>this.s && this.leadS>sg) hold=true;                 // ソーラーカーは赤信号の手前、誘導車は通過済み
   else if(sg>this.leadS-2 && sg<want+5) stopAt=Math.min(stopAt,sg-10); } // 誘導車の前が赤 → 停止線で止まる
  if(hold) this.leadHold=true;
  else { this.leadHold=false; const tgt=Math.min(want,stopAt); this.leadS=Math.max(Math.min(this.leadS+ (es.v+8)*dtR, tgt), Math.min(tgt,this.leadS)); }
  if(this.leadHold&&!this._leadHoldMsg){ this._leadHoldMsg=true; Radio.push("赤信号で分断。前方誘導車はハザードを点けて停車・待機します。","前方誘導車"); }
  if(!this.leadHold) this._leadHoldMsg=false;
  const on=this.leadHold&&(performance.now()%800)<400;
  if(this.escortLead.userData.hazMat) this.escortLead.userData.hazMat.color.setHex(on?0xffb020:0x4a3005);
}
const lead=this.roadPoint(clamp(this.leadS,0,this.road.builtS-this.SEG));
this.escortLead.position.set(lead.x+Math.cos(lead.h)*-2.4,lead.y,lead.z+Math.sin(lead.h)*-2.4);
this.escortLead.rotation.y=-lead.h;
const chase=this.roadPoint(Math.max(this.s-32,0));
this.escortChase.position.set(chase.x+Math.cos(chase.h)*-2.4,chase.y,chase.z+Math.sin(chase.h)*-2.4);
this.escortChase.rotation.y=-chase.h;
this.escortLead.visible=(P.mode==="race"&&!es.camp&&es.stopTimer<=0);
this.escortChase.visible=(P.mode==="race"&&!es.camp&&es.stopTimer<=0&&this.s>45);
this.updateAITeams(es,dtR);
const fovT= this.cam===4&&this.replayFov? this.replayFov : 70+clamp((es.v*3.6-55)/120,0,1)*8;
if(Math.abs(fovT-this.camera.fov)>0.15){this.camera.fov=lerp(this.camera.fov,fovT,this.cam===4?0.25:0.12);this.camera.updateProjectionMatrix();}
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
Cockpit.renderRear(this);
Post.blur= this.cam===4||this.cam===3? 0 : clamp((es.v-14)/36,0,1);
Post.dof= this.cam===4&&this.rp&&this.rp.kind!=="wheel"? {focus:this.camera.position.distanceTo(this.car.position)} : null;   // リプレイ: 車にピント (車載カメラは掛けない)   // 速度のぶれ (最高画質。リプレイの固定カメラ・後ろ向きでは掛けない)
Post.render(this.renderer,this.scene,this.camera);   // 画質「高」はブルーム・周辺減光つき
},
updateEnvironment(es,pHere,alt,hor){
 const bio=biomeAt(es.km);
 // 遠方地面: 現在地の土色
 const g=this.ground.geometry, ca=g.attributes.color.array, va=g.attributes.aVeg.array, ma=g.attributes.aMisc.array;
 const sc=new THREE.Color(bio.soil).convertSRGBToLinear(), vc=new THREE.Color(bio.veg).convertSRGBToLinear();
 for(let i=0;i<4;i++){ ca.set([sc.r,sc.g,sc.b],i*3); va.set([vc.r,vc.g,vc.b,bio.cov],i*4); ma.set([0,bio.stone*0.5,bio.field],i*3); }
 g.attributes.color.needsUpdate=g.attributes.aVeg.needsUpdate=g.attributes.aMisc.needsUpdate=true;
 // 半球光の地面色=土の照り返し
 this.hemiLight.groundColor.copy(sc).multiplyScalar(1.05);
 // 逃げ水: 晴天・日中・高温ほど強い
 const heat=clamp(((es.Tamb||25)-22)/12,0,1)*clamp((alt-0.35)/0.4,0,1)*(1-0.85*(this.wxMix||0));
 const t=performance.now()/1000;
 SceneMats.eachRoad(u=>{ u.uMirage.value=heat*(bio.urban?0.3:1); u.uSkyCol.value.copy(hor).multiplyScalar(1.05); u.uTime.value=t; });
 Horizon.update(this,es);
},
updateLandmarks(es){
const range=1000;
const visNow=Route.vis(es.km);
for(const lm of LANDMARKS){
if(lm.t==="hwmarker"||lm.t==="distsign"||lm.t==="warn"||lm.t==="otl"||lm.t==="works"||lm.t==="gravel"||lm.t==="tower"||lm.t==="solarfarm") continue; // チャンク側で生成
const distVis=Route.vis(lm.km)-visNow;
const interactive=Route.inZone(lm.km);
const key=lm.km+"_"+lm.t;
if(distVis>-80 && distVis<range){
let ent=this.lmMap.get(key);
if(!ent){
const mesh=this.mkLandmark(lm);
ent={mesh,lm,red:false,decided:false};
if(lm.t==="signal"&&interactive&&(Math.random()<0.4||(P.event&&lm.km>0.4&&lm.km<0.7))){ ent.red=true; }   // イベントの課題 1: McMinn Street の信号は必ず赤
this.lmMap.set(key,ent);
this.scene.add(mesh);
}
const sVis=this.sOfKm(lm.km);
const rp=this.roadPoint(clamp(sVis,0,this.road.builtS-this.SEG));
ent.mesh.position.set(rp.x,rp.y,rp.z);
ent.mesh.rotation.y=-rp.h;
if(ent.lm.t==="signal"&&ent.mesh.userData.setRed){
ent.mesh.userData.setRed(ent.red);
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
/* 動く障害物 (他チームの車・誘導車・ロードトレイン): 回転箱 {x,z,h,L,W,v} */
dynColliders(es){
 const out=[], add=(m,L,W,v,kind)=>{ if(!m||!m.visible) return;
  if(!m.userData._cz){ // メッシュの原点から車体中心までのずれ (ローカル z) を一度だけ測る
   const q=m.position.clone(), r=m.rotation.y; m.position.set(0,0,0); m.rotation.y=0; m.updateMatrixWorld(true);
   const b=new THREE.Box3().setFromObject(m); m.userData._cz=[(b.min.x+b.max.x)/2,(b.min.z+b.max.z)/2]; m.position.copy(q); m.rotation.y=r; m.updateMatrixWorld(true); }
  const [ox,oz]=m.userData._cz, c=Math.cos(m.rotation.y), sn=Math.sin(m.rotation.y);
  out.push({t:2,x:m.position.x+ox*c+oz*sn,z:m.position.z-ox*sn+oz*c,h:-m.rotation.y,L,W,v,kind}); };
 for(const sl of this.aiPool||[]) if(sl.team&&sl.mesh) add(sl.mesh,4.9,2.0,(sl.team.spd||0)/3.6,"vehicle");
 add(this.escortLead,5.6,2.0,es.v,"vehicle"); add(this.escortChase,5.6,2.0,es.v,"vehicle");
 for(const rt of this.roadTrains) add(rt.mesh,53,2.6,-27,"vehicle");
 return out;
},
updateRoadTrains(es,dtR){
if(P.mode==="race"&&!es.camp&&!Route.inZone(es.km)){
es.nextRoadTrainH-=dtR*Route.scaleAt(es.km)/3600;
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
const rl= rp.ow? 60 : rp.m1+(rp.dual? Math.max(2.6,rp.L-1.75) : 2.6);   // 対向車線 (分離帯の向こう側)
rt.mesh.position.set(rp.x+Math.cos(rp.h)*rl,rp.y,rp.z+Math.sin(rp.h)*rl);
rt.mesh.rotation.y=-rp.h;
const rel=rt.sVis-this.s;
if(!rt.warned&&rel<180){ rt.warned=true; Snd.horn(); }
if(Math.abs(rel)<18 && this.lateral>0.6 && es.v*3.6>15 && !es.fire){
if(P.event) EventGame.onTrainHit(); else Engine.ignite("ロードトレインと正面衝突");
}
if(Math.abs(rel)<12&&es.v>5) this.car.position.y+=Math.random()*0.03;
if(rel<-250){ this.scene.remove(rt.mesh);
rt.mesh.traverse(o=>{ if(o.geometry)o.geometry.dispose(); if(o.material)o.material.dispose(); });
this.roadTrains.splice(i,1); }
}
},
};
