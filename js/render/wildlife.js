"use strict";
/* ============ 動物の飛び出し・路上の死骸 (レースモード) ============
 ・カンガルー: 路肩の外で待ち、車が約 3 秒の所まで来ると跳んで道を横切る。途中で止まる・引き返すことがある。朝夕に多い
 ・エミュー: 道を走って横切る (2 羽のことも)。昼間にも出る
 ・路上の死骸 (ロードキル): 車線の上に動かずにある。ワシが食べていて、近づくと飛び立つことがある
 前方誘導車が先に見つけると無線で知らせる (いつもではない)。
 当たり判定は他の障害物と同じ (View.dynColliders → Collide)。町の中・キャンプ・停車中は出さない。
 多さ: PRO.wildK (0 = 出さない) */
const Wildlife={
 list:[], tK:0, tE:0, tR:0, lastS:null, forceOnly:false,
 WHAT:{kangaroo:"カンガルー",emu:"エミュー",roadkill:"路上の動物の死骸"},
 reset(V){ for(const a of this.list) this.drop(V,a); this.list=[]; this.tK=60+Math.random()*120; this.tE=200+Math.random()*300; this.tR=40+Math.random()*80; this.lastS=null; },
 drop(V,a){ if(!a.mesh) return; V.scene.remove(a.mesh); a.mesh.traverse(o=>{ if(o.geometry) o.geometry.dispose(); if(o.material) o.material.dispose(); }); a.mesh=null; },
 /* 朝夕ほど多い (日の出・日の入りの前後) */
 dusk(h){ return 1+3*Math.exp(-Math.pow((h-7.2)/0.9,2))+3.5*Math.exp(-Math.pow((h-17.6)/1.0,2)); },
 level(){ return typeof PRO!=="undefined"&&PRO.wildK!=null? Math.max(0,PRO.wildK) : 1; },
 /* ---------- 見た目 (前方 = -z) ---------- */
 mat(c){ return new THREE.MeshLambertMaterial({color:c}); },
 mkKangaroo(){   // 横から見ると: 前かがみの胴・小さい頭と長い耳・太い後ろ脚・地面に届く尾
  const g=new THREE.Group(), fur=this.mat(0x8a6c50), pale=this.mat(0xb89c7c), dark=this.mat(0x4e3d2e), body=new THREE.Group();
  const add=(geo,m,x,y,z,sx,sy,sz,rx)=>{ const o=new THREE.Mesh(geo,m); o.position.set(x,y,z); o.scale.set(sx,sy,sz); if(rx) o.rotation.x=rx; body.add(o); return o; };
  const S=new THREE.SphereGeometry(0.5,10,8);
  add(S,fur,0,0.78,0.02,0.42,0.62,0.5,-0.45);          // 胴 (前かがみ)
  add(S,pale,0,0.74,-0.13,0.3,0.48,0.3,-0.45);         // 腹
  add(S,fur,0,1.18,-0.2,0.24,0.26,0.26,0);             // 肩・首
  add(S,fur,0,1.36,-0.3,0.2,0.2,0.32,0.15);            // 頭
  add(S,dark,0,1.33,-0.47,0.08,0.08,0.08,0);           // 鼻
  for(const x of [-0.06,0.06]) add(new THREE.ConeGeometry(0.05,0.2,5),fur,x,1.53,-0.24,1,1,1,-0.2);   // 耳
  for(const x of [-0.13,0.13]){
   add(S,fur,x,0.5,0.06,0.2,0.36,0.46,-0.2);           // 太もも
   add(new THREE.BoxGeometry(0.08,0.32,0.1),fur,x,0.22,0.08,1,1,1,0.5);   // すね
   add(new THREE.BoxGeometry(0.09,0.06,0.42),dark,x,0.03,-0.08,1,1,1,0); }  // 足
  const tail=new THREE.Mesh(new THREE.ConeGeometry(0.09,1.05,6),fur); tail.rotation.x=-1.9; tail.position.set(0,0.3,0.62); body.add(tail);   // 尾 (地面まで)
  add(new THREE.CylinderGeometry(0.03,0.025,0.3,5),fur,0,0.98,-0.36,1,1,1,0.7);   // 前脚
  g.add(body); g.userData.body=body;
  return g;
 },
 mkEmu(){
  const g=new THREE.Group(), fea=this.mat(0x4b3d30), skin=this.mat(0x6f7a86), body=new THREE.Group();
  const torso=new THREE.Mesh(new THREE.SphereGeometry(0.38,10,8),fea); torso.scale.set(0.8,0.75,1.15); torso.position.set(0,1.15,0.05);
  const neck=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.08,0.7,6),skin); neck.position.set(0,1.55,-0.32); neck.rotation.x=-0.25;
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.08,8,6),skin); head.scale.set(1,0.9,1.4); head.position.set(0,1.92,-0.42);
  const legs=[]; for(const x of [-0.1,0.1]){ const l=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.03,0.95,5),this.mat(0x7b6a55)); l.geometry.translate(0,-0.475,0); l.position.set(x,0.95,0.05); body.add(l); legs.push(l); }
  body.add(torso,neck,head); g.add(body); g.userData.body=body; g.userData.legs=legs;
  return g;
 },
 mkRoadkill(eagle){
  const g=new THREE.Group();
  const c=new THREE.Mesh(new THREE.SphereGeometry(0.4,8,6),this.mat(0x6e5440)); c.scale.set(1.5,0.28,0.85); c.position.y=0.08; c.rotation.y=Math.random()*3;
  const st=new THREE.Mesh(new THREE.CircleGeometry(0.75,10),this.mat(0x24100b)); st.rotation.x=-Math.PI/2; st.position.y=0.015; st.scale.set(1.3,0.8,1);
  g.add(st,c);
  if(eagle){ const e=new THREE.Group(), dk=this.mat(0x2a2420), b=new THREE.Mesh(new THREE.SphereGeometry(0.16,8,6),dk); b.scale.set(0.8,0.9,1.6); e.add(b);
   const wL=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.03,0.32),dk); wL.position.set(-0.5,0.05,0); const wR=wL.clone(); wR.position.x=0.5; e.add(wL,wR);
   e.position.set(0.3,0.35,0); g.add(e); g.userData.eagle=e; g.userData.wings=[wL,wR]; }
  return g;
 },
 /* ---------- 出す ---------- */
 spawn(V,es,kind,o={}){
  const mesh= kind==="kangaroo"? this.mkKangaroo() : kind==="emu"? this.mkEmu() : this.mkRoadkill(o.eagle);
  V.scene.add(mesh);
  const side=o.side||(Math.random()<0.5?-1:1);
  const a={kind,mesh,s:o.s,side,dir:-side,lat: kind==="roadkill"? (o.lat!=null?o.lat:-2.4+(Math.random()-0.5)*1.6) : side*(8+Math.random()*3),
   st: kind==="roadkill"? "lie" : "wait", spd: kind==="emu"? 8+Math.random()*2 : 5.5+Math.random()*2.5, ph:Math.random()*6, t:0,
   pause: o.pause!=null? o.pause : (kind==="kangaroo"&&Math.random()<0.25), back: o.back!=null? o.back : (kind==="kangaroo"&&Math.random()<0.15),
   trig: o.trig||3.0, told:false, L: kind==="roadkill"?1.1: kind==="emu"?0.9:1.1, W: kind==="roadkill"?0.7:0.6, v:0};
  this.list.push(a); return a;
 },
 rural(km){ return !Route.inZone(km)&&!(typeof OsmRoute!=="undefined"&&OsmRoute.townAt(km)); },
 update(V,es,dtR){
  const k=this.level(), on=P.mode==="race"&&!P.event&&V.road&&!es.camp&&!es.fire;
  if(this.lastS!=null&&Math.abs(V.s-this.lastS)>400) this.reset(V);
  this.lastS=V.s;
  if(!on){ if(this.list.length) this.reset(V); return; }
  /* 出す (郊外・走っているとき) */
  if(!this.forceOnly&&k>0&&es.stopTimer<=0&&this.rural(es.km)&&es.v>8){
   const f=this.dusk(es.hour)*k, ahead=V.s+Math.max(90,es.v*4.5)+Math.random()*40;
   this.tK-=dtR*f; this.tE-=dtR*k; this.tR-=dtR*k;
   if(this.tK<=0){ this.tK=300*(0.5+Math.random()); if(ahead<V.road.builtS-20) this.spawn(V,es,"kangaroo",{s:ahead}); }
   if(this.tE<=0){ this.tE=900*(0.5+Math.random()); if(ahead<V.road.builtS-20){ const a=this.spawn(V,es,"emu",{s:ahead}); if(Math.random()<0.35) this.spawn(V,es,"emu",{s:ahead+3,side:a.side,trig:a.trig+0.4}); } }
   if(this.tR<=0){ this.tR=220*(0.5+Math.random()); const sR=V.s+380; if(sR<V.road.builtS-20) this.spawn(V,es,"roadkill",{s:sR,eagle:Math.random()<0.4,lat:Math.random()<0.75? undefined : 2.4+(Math.random()-0.5)}); }
  }
  for(let i=this.list.length-1;i>=0;i--){
   const a=this.list[i], rel=a.s-V.s; a.t+=dtR;
   // 前方誘導車が見つけて知らせる (誘導車が横を通るとき。自車の車線にかかるものだけ、いつもではない)
   if(!a.told&&V.leadS!=null&&V.escortLead&&V.escortLead.visible&&V.leadS>a.s-5){ a.told=true;
    if(a.kind==="roadkill"&&a.lat<-0.5&&Math.random()<0.75) Radio.push(`前方 ${Math.max(0,Math.round(rel/10)*10)} m、路上に動物の死骸。${a.lat<-2.4?"右":"左"}に寄せて避けてください。`,"前方誘導車",{speak:true});
    else if(a.kind!=="roadkill"&&Math.random()<0.5) Radio.push(`${this.WHAT[a.kind]}が道の${a.side<0?"左":"右"}側にいます。注意。`,"前方誘導車",{speak:true}); }
   if(a.kind==="roadkill"){
    const e=a.mesh.userData.eagle;
    if(e){ if(a.st==="lie"&&rel<45&&rel>-5){ a.st="fly"; a.ft=0; }
     if(a.st==="fly"){ a.ft+=dtR; e.position.y=0.35+a.ft*2.2; e.position.x=0.3+a.ft*3.0*(a.lat<0?-1:1); const fl=Math.sin(a.t*14)*0.5; a.mesh.userData.wings[0].rotation.z=fl; a.mesh.userData.wings[1].rotation.z=-fl; if(a.ft>4) e.visible=false; } }
   } else {
    const tReach= es.v>1? rel/es.v : 1e9;
    if(a.st==="wait"&&rel>0&&tReach<a.trig){ a.st="cross"; a.ct=0; }
    if(a.st==="cross"){ a.ct+=dtR;
     let sp=a.spd;
     if(a.pause&&!a.paused&&Math.abs(a.lat+0.0)<2.6){ a.paused=1.0+Math.random()*0.6; }
     if(a.paused>0){ a.paused-=dtR; sp=0; if(a.paused<=0) a.paused=-1; }
     if(a.back&&!a.turned&&Math.abs(a.lat)<1.5){ a.turned=true; a.dir=-a.dir; }
     a.lat+=a.dir*sp*dtR; a.v=sp;
     if(Math.abs(a.lat)>12) a.st="gone";
    }
    if(a.st==="gone"){ a.lat+=a.dir*a.spd*dtR; a.v=a.spd; }
    // 動き: カンガルーは跳ねる、エミューは脚を振る
    const moving=a.v>0.5&&(a.st==="cross"||a.st==="gone"), b=a.mesh.userData.body;
    if(a.kind==="kangaroo"&&b){ a.ph+=dtR*(moving?9:0); b.position.y= moving? Math.abs(Math.sin(a.ph))*0.45 : 0; b.rotation.x= moving? -0.25+0.2*Math.cos(a.ph) : 0; }
    if(a.kind==="emu"&&a.mesh.userData.legs){ a.ph+=dtR*(moving?12:0); const sw=moving?0.6*Math.sin(a.ph):0; a.mesh.userData.legs[0].rotation.x=sw; a.mesh.userData.legs[1].rotation.x=-sw; b.position.y= moving? 0.04*Math.abs(Math.sin(a.ph)) : 0; }
    if(a.st!=="cross"&&a.st!=="gone") a.v=0;
   }
   if(rel<-80||rel>1300||a.s>V.road.builtS-5){ this.drop(V,a); this.list.splice(i,1); continue; }
   const q=V.roadPoint(clamp(a.s,0,V.road.builtS-V.SEG)), nx=Math.cos(q.h), nz=Math.sin(q.h);
   a.mesh.position.set(q.x+nx*a.lat,q.y,q.z+nz*a.lat);
   a.mesh.rotation.y= a.kind==="roadkill"? -q.h : -q.h-a.dir*Math.PI/2;   // 横切る向きを向く
  }
 },
 colliders(add){ for(const a of this.list) if(a.mesh&&!(a.kind!=="roadkill"&&a.st==="gone"&&Math.abs(a.lat)>9)) add(a.mesh,a.L,a.W,a.v,a.kind); },
};
