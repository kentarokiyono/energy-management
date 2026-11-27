"use strict";
/* ============ 自車の灯火のグレア (光のにじみ) ============
 前照灯・ウインカー (前・横)・後端のランプ (ブレーキ兼ウインカー)・ブレーキランプが光っているとき、ランプの上に光のにじみ (加算合成の板) を重ねる。
  ・ランプの向きとカメラの向きで濃さが変わる (正面から見ると濃い。横・後ろからは見えない)
  ・暗いほど大きく濃い (昼は控えめ)。雨が強いほど大きく濃い (雨粒・しぶきで光が散る)。車体に隠れる所は隠れる (奥行きを見る)
 作る所: View.mkCar の最後 (Glare.build)。毎フレーム: View の明るさの所 (Glare.update)
 ほかの車 (一般車両・ロードトレイン・誘導車・他チーム): 作るときに灯火の位置を渡す (Glare.attach)。毎フレーム Glare.updateExt
  前照灯 = 昼は弱く (昼間の点灯)、暗いほど強い / 尾灯 = 夜に弱く光り、ブレーキで強い / ハザード = 点滅に合わせる */
const Glare={
 tex:null,
 texture(){
  if(this.tex) return this.tex;
  const N=128, cv=document.createElement("canvas"); cv.width=cv.height=N; const c=cv.getContext("2d");
  const g=c.createRadialGradient(N/2,N/2,0,N/2,N/2,N/2);
  g.addColorStop(0,"rgba(255,255,255,1)"); g.addColorStop(0.1,"rgba(255,255,255,0.75)"); g.addColorStop(0.3,"rgba(255,255,255,0.2)"); g.addColorStop(0.6,"rgba(255,255,255,0.05)"); g.addColorStop(1,"rgba(255,255,255,0)");
  c.fillStyle=g; c.fillRect(0,0,N,N);
  // 横に伸びる細い光の筋
  c.save(); c.translate(N/2,N/2); c.scale(1,0.06); const s=c.createRadialGradient(0,0,0,0,0,N/2); s.addColorStop(0,"rgba(255,255,255,0.55)"); s.addColorStop(1,"rgba(255,255,255,0)"); c.fillStyle=s; c.beginPath(); c.arc(0,0,N/2,0,Math.PI*2); c.fill(); c.restore();
  this.tex=new THREE.CanvasTexture(cv); return this.tex;
 },
 /* g = 車のグループ。灯火の材質から光る部品を探し、その中心に板を付ける (部品と一緒に動く: アッパーカウルを傾けても付いていく) */
 build(g){
  const ud=g.userData, list=[]; g.updateMatrixWorld(true);
  const byMat=new Map();
  const reg=(mat,info)=>{ if(mat) byMat.set(mat,info); };
  reg(ud.headMat,{role:"head"});
  for(const m of ud.winkL||[]) reg(m,{role:"wink",side:-1,lens:!!(m.userData&&m.userData.lens)});
  for(const m of ud.winkR||[]) reg(m,{role:"wink",side:1,lens:!!(m.userData&&m.userData.lens)});
  reg(ud.brakeMat,{role:"brake"});
  for(const c of ud.rearCombo||[]) reg(c.m,{role:"rear",side:c.side});
  const meshes=[]; g.traverse(o=>{ if(o.isMesh&&byMat.has(o.material)) meshes.push(o); });
  for(const o of meshes){ const info=byMat.get(o.material);
   o.geometry.computeBoundingBox(); const c=new THREE.Vector3(); o.geometry.boundingBox.getCenter(c);
   const wc=o.localToWorld(c.clone()), lc=g.worldToLocal(wc.clone());
   // 向き (車の中で): 前照灯・前のウインカー = 前、横のウインカー = 外、後ろのランプ = 後ろ
   const face= info.role==="head"||(info.role==="wink"&&info.lens)? new THREE.Vector3(0,0,-1) : info.role==="wink"? new THREE.Vector3(Math.sign(lc.x)||info.side,0,0) : new THREE.Vector3(0,0,1);
   const fw=face.clone().transformDirection(g.matrixWorld), inv=new THREE.Matrix4().copy(o.matrixWorld).invert();
   const p=wc.clone().addScaledVector(fw,0.02).applyMatrix4(inv);   // 面から 2 cm 外 (自分の面に隠れない)
   const mat=new THREE.SpriteMaterial({map:this.texture(),color:0xffffff,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:0,fog:false}); mat.toneMapped=false;
   const sp=new THREE.Sprite(mat); sp.raycast=()=>{}; sp.position.copy(p);   // 当たり判定 (クリック・地面の判定) には出さない
   sp.renderOrder=6; sp.visible=false; o.add(sp);
   list.push(Object.assign({sp,face},info)); }
  ud.glare=list; return list;
 },
 ext:[],
 sprite(){ const mat=new THREE.SpriteMaterial({map:this.texture(),color:0xffffff,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:0,fog:false}); mat.toneMapped=false;
  const sp=new THREE.Sprite(mat); sp.raycast=()=>{}; sp.renderOrder=6; sp.visible=false; return sp; },
 /* ほかの車の灯火: root = 車のグループ、pts = [{p:[x,y,z], f:[向き], role:"head"|"tail"|"haz", mat (今の色を見る材質), s (大きさの倍率)}] (root の中の座標) */
 attach(root,pts){ for(const q of pts){ const sp=this.sprite(); sp.position.set(q.p[0],q.p[1],q.p[2]); root.add(sp);
  this.ext.push({root,sp,p0:sp.position.clone(),face:new THREE.Vector3(q.f[0],q.f[1],q.f[2]),role:q.role,mat:q.mat||null,s:q.s||1}); } },
 inScene(o){ for(let n=o,i=0;n&&i<10;n=n.parent,i++) if(n.isScene) return true; return false; },
 shown(o){ for(let n=o;n&&!n.isScene;n=n.parent) if(!n.visible) return false; return true; },
 /* 板 1 枚の濃さ・大きさ (向き face は root の中の向き) */
 put(sp,p0,face,root,camera,col,k,dk,rk,s){
  this._p.copy(p0); root.localToWorld(this._p); this._f.copy(face).transformDirection(root.matrixWorld);
  this._s.copy(camera.position).sub(this._p); const dist=this._s.length(); if(dist>450){ sp.visible=false; return; } this._s.multiplyScalar(1/Math.max(dist,1e-3));
  const look=clamp((this._f.dot(this._s)-0.05)/0.45,0,1); if(look<=0){ sp.visible=false; return; }
  const size=0.32*s*(0.7+0.9*dk)*(1+Math.min(dist,250)/35)*(1+1.3*rk);   // 遠くの前照灯も光の点として見える
  this._p.addScaledVector(this._s,Math.min(size*0.45,dist*0.3)); sp.position.copy(root.worldToLocal(this._p));   // カメラ側へ浮かせる (大きな板が自分の車体に隠れない)
  sp.visible=true; sp.material.color.setHex(col); sp.material.opacity=Math.min(1,k*look*(0.35+0.65*dk)*(1+0.9*rk)); sp.scale.set(size,size,1); },
 updateExt(camera,dk){
  const rk=typeof Rain!=="undefined"? clamp(Rain.I||0,0,1) : 0;
  for(let i=this.ext.length-1;i>=0;i--){ const q=this.ext[i];
   if(!this.inScene(q.root)){ q.sp.material.dispose(); this.ext.splice(i,1); continue; }   // 消えた車 (一般車両・すれ違ったロードトレイン)
   if(!this.shown(q.root)){ q.sp.visible=false; continue; }
   let col=null, k=0;
   if(q.role==="head"){ col=0xfff1dc; k=0.12+0.75*dk; }
   else if(q.role==="tail"){ if(q.mat&&q.mat.color.r>0.8){ col=0xff2418; k=0.75; } else if(dk>0.15){ col=0xff2418; k=0.35*dk; } }
   else if(q.role==="haz"){ if(q.mat&&q.mat.color.r>0.9&&q.mat.color.g>0.55){ col=0xffa020; k=0.85; } }
   if(!col){ q.sp.visible=false; continue; }
   this.put(q.sp,q.p0,q.face,q.root,camera,col,k,dk,rk,q.s); }
 },
 _p:new THREE.Vector3(), _f:new THREE.Vector3(), _s:new THREE.Vector3(),
 /* 毎フレーム。dk = 暗さ (0 昼 〜 1 夜) */
 update(car,camera,es,dk){
  const L0=car&&car.userData.glare; if(!L0||!es) return;
  const rk=typeof Rain!=="undefined"? clamp(Rain.I||0,0,1) : 0;   // 雨: 雨粒・しぶきで光が散って、にじみが大きく濃くなる
  const on=(performance.now()%800)<400, L=es.signal===-1||es.signal===2, R=es.signal===1||es.signal===2, brk=es.brakePhys>0.05||es.brakeRegen>0.05, head=!!car.userData.headLit;
  for(const q of L0){
   let col=null, k=0;
   if(q.role==="head"){ if(head){ col=0xfff1dc; k=0.8; } }
   else if(q.role==="wink"){ if((q.side<0?L:R)&&on){ col=0xffa020; k=0.9; } }
   else if(q.role==="brake"){ if(brk){ col=0xff2418; k=0.75; } }
   else if(q.role==="rear"){ if((q.side<0?L:R)&&on){ col=0xffa020; k=0.9; } else if(brk){ col=0xff2418; k=0.8; } }
   if(!col){ q.sp.visible=false; continue; }
   q.sp.getWorldPosition(this._p); this._f.copy(q.face).transformDirection(car.matrixWorld);
   this._s.copy(camera.position).sub(this._p); const dist=this._s.length(); this._s.multiplyScalar(1/Math.max(dist,1e-3));
   const look=clamp((this._f.dot(this._s)-0.05)/0.45,0,1);   // 正面から見るほど濃い
   if(look<=0){ q.sp.visible=false; continue; }
   const size=0.32*(0.7+0.9*dk)*(1+Math.min(dist,80)/50)*(1+1.3*rk);   // 遠くでも見えるよう、離れると少し大きく
   q.sp.visible=true; q.sp.material.color.setHex(col); q.sp.material.opacity=Math.min(1,k*look*(0.35+0.65*dk)*(1+0.9*rk)); q.sp.scale.set(size,size,1); }
 },
};
