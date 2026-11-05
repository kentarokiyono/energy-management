"use strict";
/* ============ 乗降手順と車外歩行 (レースモード) ============
 停車 (CS・17時・任意停車 F キー) → 降車手順 → 車外を一人称で歩く (WASD・ドラッグで視点・E/クリックで操作)
 → (CS) 本部テントの計測開始ボタン・ドライバー交代・車両点検 → 乗車準備 → 乗車手順 → 発車許可で発車。
 手順は順番どおりにしか進まない (練習用)。P.crewProc=false なら自動の手順なし (F で即時に乗り降り)。 */
const Crew={
phase:"drive",          // drive | egress | outside | ingress
ctx:null,               // {kind:"cs"|"camp"|"stop", cp, t0}
st:null,                // 車両側の状態
prep:null,              // 乗車前の準備 (車外)
walker:null,            // {x,z,yaw,pitch}
look:{yaw:0,pitch:-0.25},
hots:[], siteObjs:[], built:false, hover:null, ui:null, msgCd:0,
drivers:[{name:"ドライバーA",kg:null},{name:"ドライバーB",kg:62}], driverIdx:0,
on(){ return P.mode==="race"&&P.crewProc!==false; },
busy(){ return P.mode==="race"&&this.phase!=="drive"; },
inCar(){ return this.phase==="drive"||this.phase==="egress"||this.phase==="ingress"; },
/* 走行できない (手順中・発車許可待ち) */
locked(){ if(P.mode!=="race") return false; return this.phase!=="drive"||(this.st&&!this.st.depart); },
reset(){
 this.phase="drive"; this.ctx=null; this.walker=null; this.hover=null;
 this.st={pbrake:false,motor:true,belt:true,bandL:true,bandR:true,canopy:false,wheel:true,depart:true};
 this.prep={ballast:true,helmet:true,radio:true,water:true};
 this.check=null; this.timing=null;
 this.clearSite(); this.built=false; this.syncVisual();
 if(this.ui) this.ui.root.style.display="none";
},
/* ---------- 手順の定義 ---------- */
EGRESS:[
 {id:"stop",   t:"停車する",                         done:s=>Engine.st.v<0.3},
 {id:"pbrake", t:"パーキングブレーキを引く (左足付近のレバー)", done:s=>s.pbrake},
 {id:"motor",  t:"モタコンを切る (左腕の左のスイッチボックス)", done:s=>!s.motor},
 {id:"belt",   t:"シートベルトを外す",                done:s=>!s.belt},
 {id:"bands",  t:"キャノピーのゴムひもを外す (両脇)",  done:s=>!s.bandL&&!s.bandR},
 {id:"canopy", t:"キャノピーを開ける",                done:s=>s.canopy},
 {id:"wheel",  t:"ステアリングを外して足元に置く",      done:s=>!s.wheel},
 {id:"exit",   t:"車外に出る",                        done:()=>false},
],
INGRESS:[
 {id:"canopy", t:"キャノピーを閉める",                done:s=>!s.canopy},
 {id:"wheel",  t:"ステアリングをはめる",               done:s=>s.wheel},
 {id:"belt",   t:"シートベルトを付ける",               done:s=>s.belt},
 {id:"bands",  t:"ゴムひもでキャノピーをロック (両脇)", done:s=>s.bandL&&s.bandR},
 {id:"motor",  t:"発車直前: モタコンを入れる",          done:s=>s.motor},
 {id:"pbrake", t:"発車直前: パーキングブレーキ解除",     done:s=>!s.pbrake},
 {id:"permit", t:"発車許可を待って発車",               done:s=>s.depart},
],
PREP:[
 {id:"ballast",t:"バラスト重量を確認する", item:"ballast"},
 {id:"helmet", t:"ヘルメットを着用する",   item:"helmet"},
 {id:"radio",  t:"無線チェック",           item:"radio"},
 {id:"water",  t:"水分を持つ (1 L)",       item:"water"},
],
nextStep(list){ for(const st of list){ if(!st.done(this.st)) return st; } return null; },
/* ---------- 開始 (エンジンから呼ばれる) ---------- */
begin(kind,cp){
 if(!this.on()||P.mode!=="race") return false;
 if(!this.st) this.reset();
 this.ctx={kind,cp,t0:Engine.st.hour}; this.st.depart=false;
 if(kind==="cs") this.timing={started:false};
 this.startEgress();
 const msg= kind==="cs"? "停止枠で停車。降車手順 → 本部テントの計測開始ボタンを押しに走ってください。"
  : kind==="camp"? "17:00 停車。降車手順を行ってください。" : "停車。降車手順を行ってください。";
 Radio.push(msg,"チーフ");
 return true;
},
startEgress(){ this.phase="egress"; this.prevCam=View.cam; View.cam=2; this.look={yaw:0,pitch:-0.35}; this.ensureBuilt(); this.showUI(); },
/* 任意の場所で停車中に F: 降りる / 乗る (手順なしモードでは即時) */
toggleF(){
 const es=Engine.st; if(!es||P.mode!=="race"||Test.active) return;
 if(!this.st) this.reset();
 if(this.phase==="drive"){
  if(es.v>0.5){ toast("停車してから降りてください"); return; }
  if(!this.on()){ this.ctx={kind:"stop"}; this.ensureBuilt(); Object.assign(this.st,{pbrake:true,motor:false,belt:false,bandL:false,bandR:false,canopy:true,wheel:false,depart:false}); this.goOutside(); return; }
  this.begin(this.ctx&&this.ctx.kind==="camp"?"camp":"stop");
 } else if(this.phase==="outside"&&!this.on()){
  Object.assign(this.st,{pbrake:false,motor:true,belt:true,bandL:true,bandR:true,canopy:false,wheel:true,depart:true}); this.finish();
 }
},
/* 夜のスキップ等で手順が途中なら車外に出た状態にする */
forceOutside(){
 if(this.phase==="egress"){ Object.assign(this.st,{pbrake:true,motor:false,belt:false,bandL:false,bandR:false,canopy:true,wheel:false}); this.goOutside(); }
},
onCamp(){ if(this.on()) this.begin("camp"); },
/* ---------- 毎フレーム ---------- */
update(dtR){
 if(P.mode!=="race"||!Engine.st) return;
 if(!this.st) this.reset();
 const es=Engine.st;
 if(this.msgCd>0) this.msgCd-=dtR;
 // 発車許可
 if(this.phase==="ingress"&&!this.st.depart&&this.st.motor&&!this.st.pbrake&&this.allDoneExcept(["permit"])){
  if(this.permitOK()){ this.st.depart=true; Snd.chime(); Radio.push("発車許可。安全を確認して発車してください。","Event Official"); toast("🟢 発車許可","#34d399"); this.finish(); }
 }
 if(this.phase==="outside") this.walk(dtR);
 this.syncVisual();
 this.pick();
 this.drawUI();
},
timeScale(es,ts){
 if(this.phase==="egress"||this.phase==="ingress") return 1;
 const c=this.ctx;
 if(c&&c.kind==="cs") return es.stopHold? 1 : 20;   // 計測中は ×20 (30 分 = 90 秒)
 if(c&&c.kind==="camp"){ const sH=Engine.raceStartHour(); if(es.hour>=sH-0.4&&es.hour<17) return 10; return es.disconnected?2400:300; }
 return 1;
},
allDoneExcept(ids){ return this.INGRESS.every(s=>ids.includes(s.id)||s.done(this.st)); },
boardOK(){ // 乗り込める時刻
 const es=Engine.st, c=this.ctx;
 if(!c) return true;
 if(c.kind==="cs") return this.timing&&this.timing.started&&es.stopTimer<=5*60;
 if(c.kind==="camp"){ const sH=Engine.raceStartHour(); return !es.camp&&es.hour<17 || (es.hour>=sH-5/60&&es.hour<17); }
 return true;
},
permitOK(){
 const es=Engine.st, c=this.ctx;
 if(!c) return true;
 if(c.kind==="cs") return this.timing&&this.timing.started&&es.stopTimer<=0;
 if(c.kind==="camp") return !es.camp&&es.hour>=Engine.raceStartHour();
 return true;
},
finish(){ // 走行へ戻る
 this.phase="drive"; this.ctx=null; this.timing=null; this.check=null;
 if(this.prevCam!=null){ View.cam=this.prevCam; this.prevCam=null; }
 this.clearSite(); if(this.ui) this.ui.root.style.display="none";
},
goOutside(){
 this.phase="outside";
 const car=View.car; car.updateMatrixWorld();
 const p=new THREE.Vector3(-1.4,0,(View.cockE0||[0,0,-.5])[2]).applyMatrix4(car.matrixWorld);
 this.walker={x:p.x,z:p.z,yaw:-View.ch+Math.PI/2,pitch:-0.1};
 // 乗車前の準備は降りるたびにやり直し (夜を越す・交代するため)
 this.prep={ballast:false,helmet:false,radio:false,water:false};
 if(this.ctx&&this.ctx.kind==="cs"&&!this.check) this.check={FL:false,FR:false,R:false,front:false,rear:false};
 this.buildSite();
 this.showUI();
},
startIngress(){ this.phase="ingress"; View.cam=2; this.look={yaw:0,pitch:-0.35}; this.clearSite(); this.showUI(); },
/* ---------- 操作 ---------- */
act(id){
 const s=this.st;
 const deny=(m)=>{ if(this.msgCd<=0){ toast("手順: "+m,"#f59e0b"); Snd.blip(220,0.12); this.msgCd=0.6; } };
 if(this.phase==="egress"){
  const nx=this.nextStep(this.EGRESS); if(!nx) return;
  const want={pbrake:"pbrake",motor:"motor",belt:"belt",bandL:"bands",bandR:"bands",canopy:"canopy",wheel:"wheel",exit:"exit"}[id];
  if(want!==nx.id){ deny("先に「"+nx.t+"」"); return; }
  if(id==="pbrake") s.pbrake=true; else if(id==="motor") s.motor=false; else if(id==="belt") s.belt=false;
  else if(id==="bandL") s.bandL=false; else if(id==="bandR") s.bandR=false; else if(id==="canopy") s.canopy=true;
  else if(id==="wheel") s.wheel=false; else if(id==="exit"){ this.goOutside(); return; }
  Snd.blip(660,0.06);
 } else if(this.phase==="ingress"){
  const nx=this.nextStep(this.INGRESS); if(!nx) return;
  const want={canopy:"canopy",wheel:"wheel",belt:"belt",bandL:"bands",bandR:"bands",motor:"motor",pbrake:"pbrake"}[id];
  if(want!==nx.id){ deny("先に「"+nx.t+"」"); return; }
  if(id==="canopy") s.canopy=false; else if(id==="wheel") s.wheel=true; else if(id==="belt") s.belt=true;
  else if(id==="bandL") s.bandL=true; else if(id==="bandR") s.bandR=true; else if(id==="motor") s.motor=true; else if(id==="pbrake") s.pbrake=false;
  Snd.blip(660,0.06);
 } else if(this.phase==="outside"){
  if(id==="timing"){ if(this.timing&&!this.timing.started){ this.timing.started=true; Engine.st.stopHold=false;
    const min=(Engine.st.hour-this.ctx.t0)*60; Snd.chime(); toast(`⏱ 計測開始 (停車から ${Math.floor(min)}分${Math.round((min%1)*60)}秒)`,"#34d399");
    Radio.push("計測開始。30 分後に発車できます。乗り込みは発車 5 分前から。","Event Official"); } return; }
  if(id==="swap"){ this.swapDriver(); return; }
  if(id.startsWith("chk_")){ if(this.check){ this.check[id.slice(4)]=true; Snd.blip(880,0.05); } return; }
  if(this.PREP.some(p=>p.item===id)){
   const nx=this.PREP.find(p=>!this.prep[p.item]);
   if(!nx) return;
   if(nx.item!==id){ deny("先に「"+nx.t+"」"); return; }
   if(id==="ballast"){ const kg=P.massDriver, b=Math.max(0,80-kg); toast(`⚖ ${this.drivers[this.driverIdx].name} ${kg} kg → バラスト ${b.toFixed(1)} kg 搭載を確認`,"#22d3ee"); }
   if(id==="radio") Radio.push("無線チェック、感度良好。","前方誘導車");
   this.prep[id]=true; Snd.blip(660,0.06); return;
  }
  if(id==="board"){
   const nx=this.PREP.find(p=>!this.prep[p.item]);
   if(nx){ deny("乗車前に「"+nx.t+"」"); return; }
   if(!this.boardOK()){ deny(this.ctx&&this.ctx.kind==="cs"? (this.timing&&this.timing.started? "乗り込めるのは発車 5 分前から" : "先に本部テントで計測開始ボタンを押す") : "乗り込めるのは発車 5 分前から"); return; }
   this.startIngress(); return;
  }
 }
},
swapDriver(){
 if(this.drivers[0].kg==null) this.drivers[0].kg=P.massDriver;
 this.driverIdx=(this.driverIdx+1)%this.drivers.length;
 const d=this.drivers[this.driverIdx]; P.massDriver=d.kg;
 this.prep={ballast:false,helmet:false,radio:false,water:false};
 toast(`🔁 ${d.name} (${d.kg} kg) に交代。乗車準備をやり直してください`,"#34d399");
},
/* ---------- 車内の小物・ホットスポット ---------- */
ensureBuilt(){
 if(this.built&&this.builtFor===View.car) return;
 this.built=true; this.builtFor=View.car; this.hots=[];
 const B=View.carBody, E=View.cockE0||[0,.84,-.45], dY=View.cockDeckY||.62;
 const hot=(id,label,mesh)=>{ mesh.userData.hot={id,label}; this.hots.push(mesh); B.add(mesh); return mesh; };
 const M=(c,e)=>{ const m=new THREE.MeshStandardMaterial({color:c,roughness:.5,metalness:.2,emissive:0x000000}); m.userData.hl=true; return m; };
 // パーキングブレーキ (左足付近のレバー)
 const lv=new THREE.Group(); lv.position.set(E[0]-.17,dY-.1,E[2]-.55);
 const lvBar=new THREE.Mesh(new THREE.BoxGeometry(.025,.16,.025),M(0x8a8f96)); lvBar.position.y=.08; lv.add(lvBar);
 const lvKnob=new THREE.Mesh(new THREE.SphereGeometry(.025,10,8),M(0xd11a1a)); lvKnob.position.y=.17; lv.add(lvKnob);
 B.add(lv); this.lever=lv; hot("pbrake","パーキングブレーキ",lvKnob); lvBar.userData.hot={id:"pbrake",label:"パーキングブレーキ"}; this.hots.push(lvBar);
 // モタコンのスイッチボックス (左腕の左)
 const box=new THREE.Mesh(new THREE.BoxGeometry(.09,.05,.11),M(0x1d2227)); box.position.set(E[0]-.3,dY+.075,E[2]-.06); hot("motor","モタコン スイッチ",box);
 const tg=new THREE.Mesh(new THREE.BoxGeometry(.012,.04,.012),M(0xd0d4d8)); tg.position.set(E[0]-.3,dY+.11,E[2]-.06); B.add(tg); this.toggle=tg;
 this.motorLed=new THREE.Mesh(new THREE.SphereGeometry(.007,8,6),new THREE.MeshBasicMaterial({color:0x22ff55})); this.motorLed.position.set(E[0]-.27,dY+.103,E[2]-.03); B.add(this.motorLed);
 // シートベルトのバックル + ベルト
 const bk=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,.015,16),M(0xb0b4b8)); bk.rotation.x=Math.PI/2; bk.position.set(E[0],dY-.06,E[2]-.22); hot("belt","シートベルト",bk);
 this.straps=new THREE.Group(); const sm=new THREE.MeshLambertMaterial({color:0x1f4f9c});
 for(const [x,y,z] of [[-.14,.05,.12],[.14,.05,.12],[-.16,-.12,.05],[.16,-.12,.05]]){ const a=new THREE.Vector3(E[0],dY-.06,E[2]-.22), b=new THREE.Vector3(E[0]+x,dY+y,E[2]+z);
  const L=a.distanceTo(b), st=new THREE.Mesh(new THREE.BoxGeometry(.045,.004,L),sm); st.position.copy(a).add(b).multiplyScalar(.5); st.lookAt(b); this.straps.add(st); }
 B.add(this.straps);
 // ゴムひも (両脇): フック + ひも
 this.cords={};
 for(const [id,sd] of [["bandL",-1],["bandR",1]]){
  const hk=new THREE.Mesh(new THREE.SphereGeometry(.018,10,8),M(0xf6c400)); hk.position.set(E[0]+sd*.27,dY+.04,E[2]+.06); hot(id,sd<0?"ゴムひも (左)":"ゴムひも (右)",hk);
  const a=hk.position.clone(), b=new THREE.Vector3(E[0]+sd*.2,dY+.16,E[2]-.02), L=a.distanceTo(b);
  const cd=new THREE.Mesh(new THREE.CylinderGeometry(.005,.005,L,6),new THREE.MeshLambertMaterial({color:0x111111}));
  cd.position.copy(a).add(b).multiplyScalar(.5); cd.lookAt(b); cd.rotateX(Math.PI/2); B.add(cd); this.cords[id]=cd;
 }
 // キャノピーの取っ手 (内側前方の上)
 const hd=new THREE.Mesh(new THREE.BoxGeometry(.12,.015,.025),M(0x8a8f96)); hd.position.set(E[0],E[1]+.07,E[2]-.28); hot("canopy","キャノピー",hd); this.handle=hd;
 // ステアリング (既存のハンドルをホットスポットに)
 if(View.yokeMesh){ View.yokeMesh.traverse(m=>{ if(m.isMesh){ m.userData.hot={id:"wheel",label:"ステアリング"}; this.hots.push(m); } });
  this.wheelBase={p:View.yokePivot.position.clone(),r:View.yokePivot.rotation.clone()}; }
 // 降りる (左の縁)
 const sill=new THREE.Mesh(new THREE.BoxGeometry(.05,.03,.5),M(0x34d399)); sill.position.set(E[0]-.34,dY+.02,E[2]+.05); hot("exit","車外に出る",sill); this.sill=sill;
 // 乗り込む (車外から: 車体全体の当たり判定)
 const bd=new THREE.Mesh(new THREE.BoxGeometry(1.6,1.0,5.6),new THREE.MeshBasicMaterial({visible:false})); bd.position.set(0,.5,0); bd.userData.hot={id:"board",label:"乗り込む"}; this.boardBox=bd; B.add(bd);
 // キャノピーの回転軸 (左の付け根)
 const cm=View.canopyMesh; if(cm){ cm.geometry.computeBoundingBox(); const bb=cm.geometry.boundingBox; this.canopyPivot=new THREE.Vector3(bb.min.x,dY,(bb.min.z+bb.max.z)/2); this.canopyOpen=0; }
},
syncVisual(){
 if(!this.built||!this.st) return;
 const s=this.st, show=P.mode==="race";
 if(this.lever) this.lever.rotation.x= s.pbrake? -0.9 : 0;
 if(this.toggle) this.toggle.rotation.x= s.motor? -0.5 : 0.5;
 if(this.motorLed) this.motorLed.material.color.setHex(s.motor?0x22ff55:0x330808);
 if(this.straps) this.straps.visible=s.belt;
 if(this.cords){ this.cords.bandL.visible=s.bandL; this.cords.bandR.visible=s.bandR; }
 if(this.sill) this.sill.visible=this.phase==="egress";
 // ステアリング: 外したら足元へ
 if(View.yokePivot&&this.wheelBase){ const E=View.cockE0||[0,.84,-.45], dY=View.cockDeckY||.62;
  if(s.wheel){ View.yokePivot.position.copy(this.wheelBase.p); View.yokePivot.rotation.copy(this.wheelBase.r); }
  else { View.yokePivot.position.set(E[0]+.05,dY-.12,E[2]-.75); View.yokePivot.rotation.set(-1.4,0,.3); } }
 // キャノピー: 左の付け根を軸に開く
 const cm=View.canopyMesh;
 if(cm&&this.canopyPivot){ const target=s.canopy?1:0; this.canopyOpen+= (target-this.canopyOpen)*0.15;
  const th=this.canopyOpen*1.9, P0=this.canopyPivot, c=Math.cos(th), sn=Math.sin(th);
  cm.rotation.z=th; cm.position.set(P0.x-(c*P0.x-sn*P0.y), P0.y-(sn*P0.x+c*P0.y), 0); }
},
/* ---------- 車外の小物 (チームの机・本部の計測ボタン・点検ポイント) ---------- */
buildSite(){
 this.clearSite();
 const car=View.car; car.updateMatrixWorld();
 const W=(x,y,z)=>new THREE.Vector3(x,y,z).applyMatrix4(car.matrixWorld);
 const grp=new THREE.Group(); View.scene.add(grp); this.siteGrp=grp;
 const add=(id,label,mesh,pos)=>{ mesh.position.copy(pos); if(id){ mesh.userData.hot={id,label}; this.siteObjs.push(mesh); } grp.add(mesh); return mesh; };
 const M=c=>{ const m=new THREE.MeshStandardMaterial({color:c,roughness:.6,emissive:0x000000}); m.userData.hl=true; return m; };
 // チームの机 (車の左 3.5 m)
 const base=W(-3.6,0,0), y0=base.y;
 add(null,null,new THREE.Mesh(new THREE.BoxGeometry(1.6,.05,.8),M(0xe8e6e0)),new THREE.Vector3(base.x,y0+.75,base.z)).rotation.y=-View.ch;
 for(const [dx,dz] of [[-.7,-.35],[.7,-.35],[-.7,.35],[.7,.35]]){ const q=W(-3.6+dx,0,dz); add(null,null,new THREE.Mesh(new THREE.BoxGeometry(.04,.75,.04),M(0x777777)),new THREE.Vector3(q.x,y0+.375,q.z)); }
 add("helmet","ヘルメット",new THREE.Mesh(new THREE.SphereGeometry(.13,16,12),M(0xf6f6f6)),W(-3.6,.0,-.5).setY(y0+.9));
 add("radio","無線機",new THREE.Mesh(new THREE.BoxGeometry(.08,.16,.05),M(0x222222)),W(-3.6,0,-.1).setY(y0+.86));
 add("water","水 (1 L)",new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,.26,12),M(0x4aa3ff)),W(-3.6,0,.25).setY(y0+.91));
 add("ballast","バラスト / 体重計",new THREE.Mesh(new THREE.BoxGeometry(.5,.1,.5),M(0x3b3f45)),W(-3.2,0,1.6).setY(y0+.05));
 add("swap","ドライバー交代 (交代表)",new THREE.Mesh(new THREE.BoxGeometry(.6,.8,.04),M(0x1f4f9c)),W(-4.6,0,1.2).setY(y0+1.2));
 // 本部テントの計測開始ボタン (CS の敷地: 右側のテント)
 if(this.ctx&&this.ctx.kind==="cs"&&this.ctx.cp){
  const sc=View.sOfKm(this.ctx.cp.km), q=Scenery.at(View,sc+25,14);
  add(null,null,new THREE.Mesh(new THREE.BoxGeometry(.5,1.0,.5),M(0xdddddd)),new THREE.Vector3(q.x,q.y+.5,q.z));
  add("timing","計測開始ボタン",new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.08,20),M(0xd11a1a)),new THREE.Vector3(q.x,q.y+1.04,q.z));
  const sg=new THREE.Mesh(new THREE.PlaneGeometry(1.4,.4),new THREE.MeshBasicMaterial({map:signTex("banner","TIMING 計測開始"),side:THREE.DoubleSide}));
  sg.position.set(q.x,q.y+1.6,q.z); sg.rotation.y=-q.h; grp.add(sg);
  this.timingPos=q;
 } else this.timingPos=null;
 // 車両点検ポイント (CS)
 if(this.check){ const E=View.cockE0||[0,.84,-.45];
  const wh=(VEH.active&&VEH.spec.body&&VEH.spec.body.wheels)||[[-.6,-1.4,.26],[.6,-1.4,.26],[0,1.3,.26]];
  const pts=[["chk_FL","左前タイヤ",wh[0]],["chk_FR","右前タイヤ",wh[1]],["chk_R","後輪",wh[2]],["chk_front","前の灯火",[0,-2.7,.5]],["chk_rear","後ろの灯火",[0,2.8,.55]]];
  for(const [id,label,w] of pts){ const r=w[2]>.2&&w[2]<.4?w[2]:.4; const ring=new THREE.Mesh(new THREE.TorusGeometry(.22,.025,8,24),new THREE.MeshBasicMaterial({color:0xf6c400}));
   ring.rotation.x=Math.PI/2; add(id,"点検: "+label,ring,W(w[0]+(w[0]<-0.1?-.45:w[0]>.1?.45:0),0,w[1]).setY(y0+.04+(r>0.3?0:0))); } }
},
clearSite(){ if(this.siteGrp){ View.scene.remove(this.siteGrp); this.siteGrp.traverse(m=>{ if(m.geometry) m.geometry.dispose(); }); this.siteGrp=null; } this.siteObjs=[]; },
/* ---------- 歩行 ---------- */
walk(dt){
 const w=this.walker, k=Input.keys; if(!w) return;
 const run=k["shift"]?5.5:1.6;
 let fx=0, fz=0; const sy=Math.sin(w.yaw), cy=Math.cos(w.yaw);
 if(k["w"]){ fx+=sy; fz-=cy; } if(k["s"]){ fx-=sy; fz+=cy; } if(k["a"]){ fx-=cy; fz-=sy; } if(k["d"]){ fx+=cy; fz+=sy; }
 if(k["arrowleft"]) w.yaw-=1.8*dt; if(k["arrowright"]) w.yaw+=1.8*dt; if(k["arrowup"]) w.pitch=clamp(w.pitch+1.2*dt,-1.2,1.0); if(k["arrowdown"]) w.pitch=clamp(w.pitch-1.2*dt,-1.2,1.0);
 const L=Math.hypot(fx,fz); if(L>0){ w.x+=fx/L*run*dt; w.z+=fz/L*run*dt; }
 // 車体にめり込まない (車体座標の箱)
 const car=View.car, inv=new THREE.Matrix4().copy(car.matrixWorld).invert(), p=new THREE.Vector3(w.x,0,w.z).applyMatrix4(inv);
 const hx=.95, hz=3.05; if(Math.abs(p.x)<hx&&Math.abs(p.z)<hz){ if(hx-Math.abs(p.x)<hz-Math.abs(p.z)) p.x=Math.sign(p.x||1)*hx; else p.z=Math.sign(p.z||1)*hz; const q=p.applyMatrix4(car.matrixWorld); w.x=q.x; w.z=q.z; }
 // 車から 250 m 以内
 const dx=w.x-car.position.x, dz=w.z-car.position.z, d=Math.hypot(dx,dz); if(d>250){ w.x=car.position.x+dx/d*250; w.z=car.position.z+dz/d*250; }
 w.y=this.groundAt(w.x,w.z)+1.65;
},
groundAt(x,z){
 const P=View.road.pts, i0=Math.round(View.s/View.SEG); let best=null, bd=1e18;
 for(let i=Math.max(0,i0-240);i<Math.min(P.length,i0+240);i+=2){ const q=P[i], d=(q.x-x)**2+(q.z-z)**2; if(d<bd){ bd=d; best=q; } }
 return best? best.y-(best.bh||0) : View.car.position.y;
},
/* ---------- カメラ ---------- */
camera(view){
 if(P.mode!=="race"||this.phase==="drive") return false;
 const cam=view.camera;
 if(this.phase==="outside"&&this.walker){ const w=this.walker;
  cam.position.set(w.x,w.y,w.z);
  const d=new THREE.Vector3(Math.sin(w.yaw)*Math.cos(w.pitch),Math.sin(w.pitch),-Math.cos(w.yaw)*Math.cos(w.pitch));
  cam.lookAt(cam.position.clone().add(d)); return true; }
 // 車内: ドライバーの目から自由に見回す (車体座標)
 const E=View.cockE0||[0,.84,-.45]; view.car.updateMatrixWorld();
 const eye=new THREE.Vector3(E[0],E[1],E[2]).applyMatrix4(view.car.matrixWorld);
 const l=this.look, dir=new THREE.Vector3(Math.sin(l.yaw)*Math.cos(l.pitch),Math.sin(l.pitch),-Math.cos(l.yaw)*Math.cos(l.pitch));
 const aim=new THREE.Vector3(E[0],E[1],E[2]).add(dir).applyMatrix4(view.car.matrixWorld);
 cam.position.copy(eye); cam.lookAt(aim); return true;
},
/* ---------- 視線の先の対象 ---------- */
pick(){
 this.hover=null;
 if(this.phase==="drive") return;
 const rc=this._rc||(this._rc=new THREE.Raycaster()); rc.setFromCamera(this.phase==="outside"||!this.mouseNDC? {x:0,y:0} : this.mouseNDC,View.camera);
 const list= this.phase==="outside"? this.siteObjs.concat(this.boardBox?[this.boardBox]:[]) : this.hots.filter(h=>h.visible&&h!==this.boardBox);
 const hit=rc.intersectObjects(list,false)[0];
 const maxD=this.phase==="outside"?3.2:1.6;
 const hl=o=>o.material&&o.material.emissive&&o.material.userData.hl;
 for(const o of list) if(hl(o)) o.material.emissive.setHex(0x000000);
 if(hit&&hit.distance<=maxD){ this.hover=hit.object.userData.hot; if(hl(hit.object)) hit.object.material.emissive.setHex(0x444400); }
},
/* ---------- 画面表示 ---------- */
showUI(){
 if(!this.ui){
  const root=document.createElement("div"); root.id="crew-ui";
  root.style.cssText="position:fixed;right:14px;top:120px;z-index:40;max-width:330px;font:12px/1.5 sans-serif;color:#e6f6ff;background:rgba(6,14,24,.82);border:1px solid #155e75;border-radius:10px;padding:10px 12px;pointer-events:none";
  const cross=document.createElement("div"); cross.style.cssText="position:fixed;left:50%;top:50%;width:8px;height:8px;margin:-4px 0 0 -4px;border:2px solid rgba(255,255,255,.8);border-radius:50%;z-index:40;pointer-events:none";
  const prompt=document.createElement("div"); prompt.style.cssText="position:fixed;left:50%;top:56%;transform:translateX(-50%);z-index:40;color:#fff;font:bold 14px sans-serif;text-shadow:0 0 4px #000;pointer-events:none";
  document.body.appendChild(root); document.body.appendChild(cross); document.body.appendChild(prompt);
  this.ui={root,cross,prompt};
 }
 this.ui.root.style.display="block";
},
drawUI(){
 if(!this.ui) return;
 const vis=this.phase!=="drive"; this.ui.root.style.display=vis?"block":"none"; this.ui.cross.style.display=vis?"block":"none"; this.ui.prompt.style.display=vis?"block":"none";
 if(!vis) return;
 const li=(done,t,next)=>`<div style="color:${done?'#6ee7b7':next?'#fde68a':'#94a3b8'}">${done?'✔':next?'▶':'・'} ${t}</div>`;
 let h="";
 const es=Engine.st, mm=(x)=>`${Math.floor(x/60)}:${String(Math.floor(x%60)).padStart(2,"0")}`;
 if(this.phase==="egress"){ h+=`<b>降車手順</b>`; const nx=this.nextStep(this.EGRESS); for(const s of this.EGRESS) h+=li(s!==nx&&s.done(this.st),s.t,s===nx); }
 else if(this.phase==="ingress"){ h+=`<b>乗車手順</b>`; const nx=this.nextStep(this.INGRESS); for(const s of this.INGRESS) h+=li(s!==nx&&s.done(this.st),s.t,s===nx);
  if(this.ctx&&this.ctx.kind==="cs") h+=`<div style="margin-top:4px">発車まで ${mm(Math.max(0,es.stopTimer))}</div>`; }
 else if(this.phase==="outside"){
  h+=`<b>車外</b> <span style="color:#94a3b8">WASD 移動 / Shift 走る / ドラッグ・矢印で視点 / E・クリックで操作</span>`;
  if(this.ctx&&this.ctx.kind==="cs"){
   const t=this.timing; h+=li(t&&t.started,"本部テントまで走って計測開始ボタンを押す",!(t&&t.started));
   if(t&&t.started) h+=`<div>発車まで ${mm(Math.max(0,es.stopTimer))} (乗り込みは残り 5:00 から)</div>`;
   if(this.check){ const c=this.check, n=Object.values(c).filter(Boolean).length; h+=li(n===5,`車両点検 (${n}/5: タイヤ3・前後の灯火)`,false); }
   h+=li(false,`ドライバー交代 (任意): 現在 ${this.drivers[this.driverIdx].name} ${P.massDriver} kg`,false);
  }
  const nx=this.PREP.find(p=>!this.prep[p.item]);
  h+=`<div style="margin-top:4px"><b>乗車準備</b></div>`; for(const p of this.PREP) h+=li(this.prep[p.item],p.t,p===nx);
  h+=li(false,this.boardOK()?"車に乗り込む (車体を見て E)":"乗り込みは発車 5 分前から",!nx&&this.boardOK());
  if(this.ctx&&this.ctx.kind==="camp") h+=`<div style="color:#94a3b8">翌朝 ${fmtH(Engine.raceStartHour())} スタート。乗り込みは 5 分前から</div>`;
 }
 this.ui.root.innerHTML=h;
 this.ui.prompt.textContent= this.hover? "E: "+this.hover.label : "";
},
};
function fmtH(h){ const H=Math.floor(h), M=Math.round((h-H)*60); return `${H}:${String(M).padStart(2,"0")}`; }
/* ---------- 入力 (視点ドラッグ・クリック操作・E/F キー) ---------- */
(()=>{
 let down=null, moved=false;
 addEventListener("mousedown",e=>{ if(!Crew.busy()) return; if(e.target.closest&&e.target.closest("button,input,select,.btn")) return; down={x:e.clientX,y:e.clientY}; moved=false; });
 addEventListener("mousemove",e=>{
  if(Crew.busy()){ Crew.mouseNDC={x:e.clientX/innerWidth*2-1,y:1-e.clientY/innerHeight*2}; }
  if(!down||!Crew.busy()) return;
  const dx=e.clientX-down.x, dy=e.clientY-down.y; if(Math.abs(dx)+Math.abs(dy)>3) moved=true;
  const L= Crew.phase==="outside"&&Crew.walker? Crew.walker : Crew.look;
  L.yaw+=dx*0.005; L.pitch=clamp(L.pitch-dy*0.005,-1.3,1.1);
  if(Crew.phase!=="outside") L.yaw=clamp(L.yaw,-2.2,2.2);
  down={x:e.clientX,y:e.clientY};
 });
 addEventListener("mouseup",e=>{ if(down&&!moved&&Crew.busy()&&Crew.hover) Crew.act(Crew.hover.id); down=null; });
 addEventListener("keydown",e=>{
  const k=e.key.toLowerCase();
  if(k==="e"&&Crew.busy()){ const save=Crew.mouseNDC; Crew.mouseNDC={x:0,y:0}; Crew.pick(); if(Crew.hover) Crew.act(Crew.hover.id); Crew.mouseNDC=save; }
  if(k==="f"&&typeof running!=="undefined"&&running) Crew.toggleF();
 });
})();
