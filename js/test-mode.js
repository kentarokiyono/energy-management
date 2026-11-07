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
}
if(!this._resizeBound){ this._resizeBound=true;
addEventListener("resize",()=>{ if(Test.active&&Test.camera){ View.renderer.setSize(innerWidth,innerHeight);
Test.camera.aspect=innerWidth/innerHeight; Test.camera.updateProjectionMatrix(); } });
}
View.renderer.shadowMap.enabled=true; View.renderer.shadowMap.type=THREE.PCFSoftShadowMap; Perf.reset();
this.scene=new THREE.Scene();
setupRenderQuality(View.renderer,this.scene);
this.camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,0.1,4000);
// 会場 (Hidden Valley) は初回のみ生成して再利用
if(!this._venue) this._venue=HV.build();
this.cones=HV.cones;
// 試験ごとのローカル座標系 (車両/判定はローカル、会場を逆変換して配置)
const fr=HV.frames();
let F=new THREE.Matrix4();
if(kind==="slalom"||kind==="combo") F=HV.frameMatrix(fr.strip);
else if(kind==="brake") F=HV.frameMatrix(fr.strip).multiply(new THREE.Matrix4().makeTranslation(HV.BRAKE_X,0,0));
else if(kind==="fig8") F=HV.frameMatrix(fr.fig8);
this.frameM=F; this.frameInv=F.clone().invert();
this.root=new THREE.Group(); this.root.matrixAutoUpdate=false; this.root.matrix.copy(this.frameInv);
this.root.add(this._venue); this.scene.add(this.root);
// 空・太陽 (ダーウィン 8月 正午前後)
this.sky=makeSkyDome(); this.sky.frustumCulled=false; this.scene.add(this.sky);
const es=Engine.st, sp=Phys.sunPos(-12.448,130.907,es.dayOfYear||236,es.hour||12);
const dW=new THREE.Vector3(Math.sin(sp.az)*Math.cos(sp.alt),Math.sin(sp.alt),-Math.cos(sp.az)*Math.cos(sp.alt));
const rotInv=new THREE.Matrix4().extractRotation(this.frameInv);
this.sunDir=dW.applyMatrix4(rotInv).normalize();
const u=this.sky.material.uniforms;
u.uTop.value.setHex(0x2f7fc4); u.uHor.value.setHex(0xc4dbea); u.uSunDir.value.copy(this.sunDir);
u.uCover.value=0.18; u.uNight.value=0; u.uDust.value.setHex(0xd9c3a0).convertSRGBToLinear();
this.scene.fog.color.setHex(0xc4dbea).convertSRGBToLinear(); this.scene.fog.near=400; this.scene.fog.far=2600;
this.scene.add(new THREE.HemisphereLight(0xbfe0ff,new THREE.Color(0x7a5a3c).convertSRGBToLinear(),0.75));
const sun=new THREE.DirectionalLight(0xfff1dc,1.2*clamp(Math.sin(sp.alt)*1.4,0.2,1));
sun.castShadow=GFX.cur().shadow>0; { const sz=GFX.cur().shadow||1024; sun.shadow.mapSize.set(sz,sz); } sun.shadow.bias=-0.0006; sun.shadow.normalBias=0.02;
Object.assign(sun.shadow.camera,{left:-40,right:40,top:40,bottom:-40,near:1,far:900});
this.scene.add(sun); this.scene.add(sun.target); this.sun=sun;
const m=View.buildCarModelImpl();
this.car=m.group; this.carBody=m.body; this.canopy=m.canopy;
this.car.traverse(o=>{ if(o.isMesh) o.castShadow=true; });
this.scene.add(this.car);
this.laps=[]; this.best=null; this.prevLapIdx=undefined;
const T=HV.track();
this.trackPts=T.pts; this.trackN=T.n;
this.startHeading=Math.atan2(T.fwd[0][0],-T.fwd[0][1]);
this.retry();
},
retry(){
show("test-result",false);
const es=Engine.st;
es.throttleSet=0; es.brakePhys=0; es.brakeRegen=0;
this.v=0; this.t=0; this.tSide=0; this.dmgAero=0; this.state="ready"; this.progress=0; this.prevLapIdx=undefined; this.lapPit=false; this.lapStartPit=false; this.inPit=false;
this.coneHit=false; this.brakeEntry=null; this.brakeDist=null; this.slalomT=null; this.slalomOK=null;
this.cones.forEach(c=>{c.userData.hit=false;c.rotation.set(0,0,0);c.position.y=0.38;});
this.f8={accA:0,accB:0,prevA:null,prevB:null,moved:0,sides:[],done:[],count:0,best8:null};
if(this.kind==="circuit"){
const p=this.trackPts[0];
this.x=p.x; this.z=p.z; this.heading=this.startHeading; this.lastIdx=0;
toast("🏁 Hot Lap ― スタンディングスタート。ベストラップでグリッド決定!","#34d399");
} else if(this.kind==="combo"){
this.x=-45; this.z=0; this.heading=Math.PI/2;
toast("〰→🛑 ドラッグストリップ北東端から進入。スラローム(11.5秒未満)を抜けて加速し、"+(HV.BRAKE_X-126)+"m先の白線から制動(40km/h以上→14m以内)","#34d399");
} else if(this.kind==="slalom"){
this.x=-45; this.z=0; this.heading=Math.PI/2;
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
offTrack=near.d>HV.track().hw[near.i]+1.2 && HV.pitDist(this.x,this.z)>6.5;   // ピットレーン走行は可
}
this.grade=grade;
const m=massTotal(), mEff=m+PRO.mRot;
const Froll=Phys.crr(this.v)*m*9.81+motorIronW(this.v)/Math.max(this.v,0.5);
const Fdrag=0.5*Phys.airDensity(20,Tamb)*P.Cd*(1+(this.dmgAero||0))*P.frontal*this.v*this.v;
const Fcorner=cornerDrag(m,es.gLat);
const Fslope=m*9.81*grade*gearDir();
let thr=es.throttleSet;
if(es.brakePhys>0.05||es.brakeRegen>0.05){ thr=0; es.throttleSet=0; }
const I_cmd=thr*(es.gear==="R"? Math.min(REVERSE.maxA,motorMaxA(es.powerMode)) : motorMaxA(es.powerMode));
const mmT=motorModel(I_cmd,this.v,es.soc,es.powerMode);
const Ftrac= es.gear==="R"&&this.v>REVERSE.maxV? 0 : mmT.F;
let Fbrake=0,Pregen=0;
if(es.brakePhys>0) Fbrake+=es.brakePhys*PRO.brakeMu*m*9.81;
if(es.brakeRegen>0){ const rg=regenModel(es.brakeRegen,this.v,es.soc,es.powerMode); Fbrake+=rg.F; Pregen=rg.Pgen; }
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
const yawRate=gearDir()*Input.steer*clamp(8.5/Math.max(this.v,3),0.15,1.2);
this.heading+=yawRate*dtR;
es.gLat=(yawRate*this.v)/9.81;
} else es.gLat=0;
const x0=this.x, z0=this.z;
this.x+=Math.sin(this.heading)*this.v*gearDir()*dtR;
this.z-=Math.cos(this.heading)*this.v*gearDir()*dtR;
this.collide(x0,z0);
if(this.state!=="done") this.judge(dtR);
let carY=0;
if(this.kind==="circuit"&&this.trackPts){ const n=this.trackN, a=this.trackPts[this.lastIdx], b=this.trackPts[(this.lastIdx+1)%n];
 const L2=(b.x-a.x)**2+(b.z-a.z)**2||1, t=clamp(((this.x-a.x)*(b.x-a.x)+(this.z-a.z)*(b.z-a.z))/L2,-1,2); carY=a.y+(b.y-a.y)*t; }
if(this.sun){ this.sun.target.position.set(this.x,carY,this.z); this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDir,400); }
if(this.sky) this.sky.position.copy(this.camera.position);
this.car.position.set(this.x,carY,this.z);
this.car.rotation.y=-this.heading;
this.car.rotation.x=-Math.atan(grade)*0.8;
if(this.car.userData.brakeMat)
this.car.userData.brakeMat.color.setHex((es.brakePhys>0.05||es.brakeRegen>0.05)?0xff2222:0x4a0505);
updateWinkers(this.car,es); updateRearCombo(this.car,es); reverseBeep(es);
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
document.getElementById("hud-clock").textContent={circuit:"HOT LAP",slalom:"SLALOM",brake:"BRAKE",combo:"SLALOM+BRAKE",fig8:"FIGURE-8"}[this.kind];
document.getElementById("hud-dist").textContent=(this.v*3.6).toFixed(0)+" km/h";
setT("hud-nextcp",{circuit:"目標 2:20台",slalom:"目標 <11.5s",brake:"40km/h→14m",combo:"<11.5s → 14m",fig8:"9s / 18s"}[this.kind]);
document.getElementById("hud-limit").textContent="―";
this.updateTestHud(); drawG();
Snd.update(this.v, es.lastAmp/Math.max(motorMaxA(es.powerMode),1), false);
},
judge(dtR){
const k=this.kind;
if(k==="circuit"){
if(this.state==="ready"&&this.v>0.5){ this.state="run"; this.t=0; }
if(this.state==="run"){
this.t+=dtR;
const i=this.lastIdx, n=this.trackN;
// ピットレーン走行(コース外側でピット中心線付近)を検出 → その周はアウトラップ
{ const T=HV.track(), p=T.pts[i], r=T.right[i];
  const lat=(this.x-p.x)*r[0]+(this.z-p.z)*r[1];
  // ピットウォールより外側 = 分離後のピットレーン
  this.inPit = lat>T.hw[i]+4 && HV.pitDist(this.x,this.z)<7;
  if(this.inPit){ if(!this.lapPit) toast("🅿 ピットレーン ― この周はタイム対象外","#fbbf24"); this.lapPit=true; } }
if(this.prevLapIdx!==undefined){
let diff=i-this.prevLapIdx;
if(diff<-n/2) diff+=n; if(diff>n/2) diff-=n;
this.progress+=diff;
if(this.progress>=n){
this.progress-=n;
this.laps.push(this.t);
if(this.lapPit){
 // ピットから出た周=OUT LAP / ピットに入った周=IN LAP (どちらも記録対象外)
 const tag=this.lapStartPit?"OUT LAP":"IN LAP";
 toast(`🅿 LAP ${this.laps.length}: ${fmtLap(this.t)} (${tag} ― 記録対象外)`,"#fbbf24");
} else {
 if(!this.best||this.t<this.best) this.best=this.t;
  if(!P.event&&this.t===this.best){ try{ const o=parseFloat(localStorage.getItem(Engine.QUALI_KEY)); if(!(o>0)||this.t<o) localStorage.setItem(Engine.QUALI_KEY,String(this.t)); }catch(e){} }   // レースのグリッドに使う
 toast(`🏁 LAP ${this.laps.length}: ${fmtLap(this.t)}${this.t===this.best?" (BEST)":""}`,"#34d399");
}
Snd.chime();
this.t=0; this.lapStartPit=!!this.inPit; this.lapPit=this.lapStartPit;
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
if(Math.abs(this.z)>HV.STRIP_HALF-0.2&&this.x<126) this.coneHit=true;
if(this.x>=126){
this.state="done";
const pass=this.t<11.5&&!this.coneHit;
this.finish(pass?"✅ 合格":"❌ 不合格",[
["タイム",this.t.toFixed(2)+" 秒 (規定 11.5秒未満)"],
["パイロン",this.coneHit?"接触あり/コース逸脱":"クリーン"],
["判定",pass?"車検通過!":"要再試験"]],pass);
}
}
} else if(k==="combo"){
if(this.state==="ready"&&this.x>0){ this.state="run"; this.t=0; }
if(this.state==="run"){
 this.t+=dtR;
 if(this.slalomT===null){
  for(const c of this.cones){
   if(!c.userData.hit&&Math.hypot(c.position.x-this.x,c.position.z-this.z)<1.5){
    c.userData.hit=true; this.coneHit=true; c.rotation.z=1.3; c.position.y=0.15; Snd.bang(); toast("💥 パイロン接触!","#ef4444"); }
  }
  if(Math.abs(this.z)>HV.STRIP_HALF-0.2) this.coneHit=true;
  if(this.x>=126){ this.slalomT=this.t; this.slalomOK=this.t<11.5&&!this.coneHit;
   toast(`〰 スラローム ${this.t.toFixed(2)}s ${this.slalomOK?"✅":"❌"} ― 加速して制動へ`,this.slalomOK?"#34d399":"#f59e0b"); }
 } else if(this.brakeEntry===null){
  if(this.x>=HV.BRAKE_X){ this.brakeEntry=this.v; toast(`🛑 制動開始 ${(this.v*3.6).toFixed(1)} km/h ― 全力制動!`,"#fbbf24"); }
  else if(this.v<0.3&&this.x>130){ this.state="done"; this.finish("⚠ 無効(制動ライン手前で停止)",[["スラローム",this.slalomT.toFixed(2)+" 秒"]],false); }
 } else if(this.v<0.3){
  this.state="done";
  this.brakeDist=this.x-HV.BRAKE_X;
  const entryOK=this.brakeEntry*3.6>=35, brakeOK=entryOK&&this.brakeDist<=14;
  const pass=this.slalomOK&&brakeOK;
  this.finish(pass?"✅ 合格(スラローム+制動)":"❌ 不合格",[
   ["スラローム",this.slalomT.toFixed(2)+" 秒 "+(this.coneHit?"(接触/逸脱)":"")+(this.slalomOK?"✅":"❌")],
   ["進入速度",(this.brakeEntry*3.6).toFixed(1)+" km/h (35以上)"],
   ["制動距離",this.brakeDist.toFixed(2)+" m (14m以内) "+(brakeOK?"✅":"❌")]],pass);
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
/* 当たり判定: 試験の座標 (ローカル) → 会場の座標に直して判定し、押し出しを戻す。破損・大破はその試験を失格 */
collide(x0,z0){
 if(typeof Collide==="undefined"||!Collide.enabled||this.state==="done") return;
 const e=this.frameM.elements, toV=(x,z)=>[e[0]*x+e[8]*z+e[12], e[2]*x+e[10]*z+e[14]];
 const [vx,vz]=toV(this.x,this.z), [ux,uz]=toV(x0,z0), fx=Math.sin(this.heading), fz=-Math.cos(this.heading);
 const hv=Math.atan2(e[0]*fx+e[8]*fz, -(e[2]*fx+e[10]*fz));
 Collide.world="hv"; const st={x:vx,z:vz,h:hv,v:this.v*gearDir()}, [L,W]=carDims();
 const hit=Collide.sweep(ux,uz,st,L,W,null); Collide.world="race";
 if(!hit) return;
 const dx=st.x-vx, dz=st.z-vz;                    // 押し出し量を試験の座標へ (回転の転置)
 this.x+=e[0]*dx+e[2]*dz; this.z+=e[8]*dx+e[10]*dz; this.v=Math.abs(st.v); Engine.st.v=this.v;
 if(hit.level==="touch") return;
 const what=COLLIDE_WHAT[hit.kind]||"障害物", kmh=(hit.vn*3.6).toFixed(0), now=performance.now();
 if(hit.level==="light"){ if(now>(this.hitCd||0)){ this.hitCd=now+2500; Snd.alarm(); toast(`⚠ ${what}に接触 (${kmh} km/h)`,"#f59e0b"); } return; }
 Snd.bang(); this.state="done";
 if(hit.level==="damage") this.dmgAero=(this.dmgAero||0)+0.05;
 this.finish(hit.level==="damage"? "💥 接触による破損 ― 失格" : "💥 事故 ― 失格",
  [["相手",what],["衝突速度",kmh+" km/h"],["", hit.kind==="person"? "人との接触は重大事故です。" : hit.level==="damage"? "車体が破損したため、この試験は失格です。" : "車両大破。この試験は失格です。"]],false);
},
finish(title,rows,pass){
if(P.event){ EventGame.hvResult(title,rows,pass); return; }   // イベント (ヒドゥンバレー版) は採点して次の課題へ
document.getElementById("test-result-title").textContent=title;
document.getElementById("test-result-title").style.color=pass?"#5cb85c":"#d23a2e";
document.getElementById("test-result-body").innerHTML=
rows.map(r=>`<div class="flex justify-between gap-6"><span class="text-cyan-100/60">${r[0]}</span><span>${r[1]}</span></div>`).join("");
show("test-result",true);
if(pass) Snd.chime(); else Snd.alarm();
},
updateTestHud(){
const tm=document.getElementById("test-timer"), sub=document.getElementById("test-sub");
if(this.kind==="circuit"){
tm.textContent=this.state==="run"?fmtLap(this.t):"READY";
sub.textContent=`LAP ${this.laps.length+1}${this.lapPit?(this.lapStartPit?" (OUT LAP)":" (IN LAP)"):""} ― BEST ${this.best?fmtLap(this.best):"―"}${this.best?` / 推定グリッド P${clamp(Math.round(1+(this.best-141)/3),1,40)}`:""}`;
} else if(this.kind==="fig8"){
const f=this.f8;
tm.textContent=this.tSide.toFixed(2);
const recent=f.sides.slice(-2).map(s=>s.toFixed(2)+"s").join(" / ");
sub.textContent=`現在の円 ${this.tSide.toFixed(2)}s ― 8の字${f.count||0}本 / ベスト計${f.best8?f.best8.toFixed(2)+"s":"―"} ${recent?"("+recent+")":"| 発進で計測開始"}`;
} else if(this.kind==="combo"){
tm.textContent=this.state!=="run"?"READY": this.slalomT===null? this.t.toFixed(2) : this.brakeEntry===null? (this.v*3.6).toFixed(0)+" km/h" : (this.x-HV.BRAKE_X).toFixed(1)+" m";
sub.textContent=this.slalomT===null? (this.coneHit?"⚠ パイロン接触":"スラローム ― 白線通過で計測開始") : this.brakeEntry===null? `制動ラインまで ${(HV.BRAKE_X-this.x).toFixed(0)} m (40km/h以上で進入)` : "制動距離";
} else if(this.kind==="brake"){
tm.textContent=this.state==="run"?this.x.toFixed(1)+" m":(this.v*3.6).toFixed(0)+" km/h";
sub.textContent=this.state==="run"?"制動距離":"進入速度(40km/h以上で白線へ)";
} else {
tm.textContent=this.state==="run"?this.t.toFixed(2):"READY";
sub.textContent=this.coneHit?"⚠ パイロン接触":"白線通過で計測開始";
}
},
};
