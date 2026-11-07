"use strict";
/* ============ コックピット (和大型モノハル): チームの写真と聞き取りから ============
 ・ハンドル: カーボン板 (左右のグリップにテープ巻き) に、白い 3D プリントのハンドルカバー。上に 16 文字 × 2 行の液晶。
   カバーの操作 (文字なし): 画面切り替え・ログ・緑/赤/青のボタン・ホーン・黒ボタン・回生ボリューム・エコ/パワー・ウインカー。
   アクセルは右グリップ裏のボリューム (奥へ回すと加速)、回生は左グリップ裏のボリューム。切れ角は左右約 45°。
   軸は銀色、根元にクイックリリース (金色)
 ・スイッチ箱 (右斜め前の壁): 緊急停止 (赤のきのこ形)・プリチャージ (緑)・ハザード (小さい赤)、トグル 5 個
   (前進/後進・弱電・ZP (ハンドルの液晶)・モタコン・テレメトリ)。上に説明の紙
 ・パーキングブレーキ: 脚を伸ばしたときの太ももの横にある、小さな水道コックのようなレバー
 ・座席: 45° 倒れたカーボンの背板 (クッションなし)。ベルトは 4 点式 (緑)。ブレーキペダル 1 つ、足先は足回りボックスの中
 ・バックビューカメラ: キャノピーの裏のモニター (上をちらっと見ると後ろが見える)。弱電で動く
 寸法はすべておおよそ (写真からの見積もり)。目の位置 E0 とデッキの高さ deckY を基準に置く */
const Cockpit={
 page:0, PAGES:3,
 mat(c,o){ return new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:.5,metalness:.1},o||{})); },
 /* カバー前面・スイッチ箱の紙: 文字を描いたテクスチャ */
 tex(w,h,draw){ const cv=document.createElement("canvas"); cv.width=w; cv.height=h; const c=cv.getContext("2d"); draw(c,w,h); const t=new THREE.CanvasTexture(cv); t.encoding=THREE.sRGBEncoding; t.anisotropy=4; return t; },
 label(c,x,y,txt,size){ c.font=`700 ${size||22}px 'BIZ UDPGothic',sans-serif`; const w=c.measureText(txt).width+12; c.fillStyle="#fbfbf7"; c.fillRect(x-w/2,y-(size||22)*0.85,w,(size||22)*1.15); c.fillStyle="#111"; c.textAlign="center"; c.fillText(txt,x,y); },
 build(V,cock,E0,deckY,carbon){
  const ex=E0[0], ez=E0[2], cw=(VEH.active&&VEH.spec.body&&VEH.spec.body.canopy&&VEH.spec.body.canopy.w)||0.44, half=Math.max(0.22,cw*0.62);
  const blk=this.mat(0x0b0c0e,{roughness:.6}), alu=this.mat(0xb9bec4,{metalness:.8,roughness:.3}), gold=this.mat(0xc9a13a,{metalness:.85,roughness:.3});
  const white=this.mat(0xf1f1ec,{roughness:.55}), tape=new THREE.MeshLambertMaterial({color:0x08090a});
  const box=(w,h,d,m,x,y,z,par)=>{ const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m); b.position.set(x,y,z); (par||cock).add(b); return b; };
  // ---- 車体の内側 (カーボンの浴槽): 上面の開口 (yata.js が くり抜く) の縁に壁を立て、床・前後の隔壁で閉じる ----
  const O=V.cockOpening||{w:half,z0:ez-1.1,z1:ez+.45,yTop:deckY,yMin:deckY}, fl=Math.min(deckY,O.yMin)-.36;
  const ow=O.w+.004, oz0=O.z0-.004, oz1=O.z1+.004, oL=oz1-oz0, ozc=(oz0+oz1)/2, top=O.yTop+.012, wh=top-fl;
  box(ow*2,.012,oL,carbon,0,fl,ozc);
  for(const sd of [-1,1]) box(.012,wh,oL,carbon,sd*ow,fl+wh/2,ozc);
  box(ow*2,wh,.012,carbon,0,fl+wh/2,oz0); box(ow*2,wh,.012,carbon,0,fl+wh/2,oz1);
  for(const sd of [-1,1]) box(.03,.012,oL,blk,sd*(ow-.012),top-.004,ozc);                 // 開口の縁 (黒いゴム)
  box(.3,.2,.5,carbon,ex,fl+.1,oz0+.26);                                                   // 足回りボックス (足先を入れる)
  // ---- 座席: 45° の背板 (クッションなし)。胴体は 腰 (前下) から 頭 (後上) へ 45° ----
  const hipY=E0[1]-.5, hipZ=ez-.3;
  const seat=box(Math.min(ow*1.8,.42),.008,.72,carbon,ex,(E0[1]+hipY)/2-.06,(ez+.12+hipZ)/2+.06); seat.rotation.x=-Math.PI/4;
  box(Math.min(ow*1.8,.42),.008,.36,carbon,ex,hipY-.08,hipZ-.12);                           // 座面
  this.hip=[ex,hipY,hipZ]; this.half=ow;
  // ---- ハンドル ----
  V.yokePivot=new THREE.Group(); V.yokePivot.position.set(ex,Math.max(E0[1]-.27,deckY+.03),ez-.42); V.yokePivot.rotation.x=-.35;
  const wheel=new THREE.Group();
  // カーボン板: 角の丸い長方形に、左右のグリップの内側を抜いた形
  const W=.29, H=.18, rr=(sh,x,y,w,h,r)=>{ sh.moveTo(x+r,y); sh.lineTo(x+w-r,y); sh.quadraticCurveTo(x+w,y,x+w,y+r); sh.lineTo(x+w,y+h-r); sh.quadraticCurveTo(x+w,y+h,x+w-r,y+h); sh.lineTo(x+r,y+h); sh.quadraticCurveTo(x,y+h,x,y+h-r); sh.lineTo(x,y+r); sh.quadraticCurveTo(x,y,x+r,y); };
  const plate=new THREE.Shape(); rr(plate,-W/2,-H/2,W,H,.035);
  for(const sd of [-1,1]){ const hole=new THREE.Path(); rr(hole,sd<0? -W/2+.035 : W/2-.035-.03,-.055,.03,.11,.012); plate.holes.push(hole); }
  const pm=new THREE.Mesh(new THREE.ExtrudeGeometry(plate,{depth:.006,bevelEnabled:false}),carbon); pm.position.z=-.012; wheel.add(pm);
  for(const sd of [-1,1]){ const g=new THREE.Mesh(new THREE.CylinderGeometry(.019,.019,.13,12),tape); g.position.set(sd*(W/2-.016),0,-.008); wheel.add(g); }   // テープ巻きのグリップ
  // 白いハンドルカバー (前面は文字入りのテクスチャ)
  const CW=.19, CH=.125, cy=-.005;
  // カバー前面: 文字なし。チームのロゴ (assets/img/logo.svg) と緑のステッカー
  const face=this.tex(608,400,(c,w,h)=>{ c.fillStyle="#f3f3ee"; c.fillRect(0,0,w,h); c.fillStyle="#1d7a46"; c.fillRect(w*.39,h*.38,w*.31,h*.07); });
  // SVG に寸法が無いと描けないブラウザがあるので、幅と高さを足してから読み込む
  fetch("assets/img/logo.svg").then(r=>r.text()).then(t=>{ const url=URL.createObjectURL(new Blob([t.replace("<svg ",'<svg width="695" height="341" ')],{type:"image/svg+xml"})), img=new Image();
   img.onload=()=>{ const c=face.image.getContext("2d"), lw=210, lh=lw*341/695; c.drawImage(img,608*.5-lw/2,400*.2-lh/2,lw,lh); face.needsUpdate=true; URL.revokeObjectURL(url); }; img.src=url; }).catch(()=>{});
  const cover=new THREE.Mesh(new THREE.BoxGeometry(CW,CH,.03),[white,white,white,white,new THREE.MeshStandardMaterial({map:face,roughness:.6}),white]);
  cover.position.set(0,cy,.006); wheel.add(cover);
  // 液晶のフード (上) と 16 文字 × 2 行の液晶
  const hood=box(.126,.056,.04,white,-.008,.1,.004,wheel);
  V.dashCanvas=document.createElement("canvas"); V.dashCanvas.width=512; V.dashCanvas.height=128; V.dashTex=new THREE.CanvasTexture(V.dashCanvas); V.dashTex.encoding=THREE.sRGBEncoding;
  const lcd=new THREE.Mesh(new THREE.PlaneGeometry(.096,.024),new THREE.MeshBasicMaterial({map:V.dashTex})); lcd.position.set(-.008,.098,.0245); wheel.add(lcd);
  box(.13,.006,.03,white,-.008,.128,.012,wheel);                                                 // 庇
  // カバーの操作部品: 写真の位置 (カバー前面の比率) に置く
  const P=(u,v)=>[(u-.5)*CW,cy+(.5-v)*CH];
  const btn=(u,v,c,r,h)=>{ const [x,y]=P(u,v); const b=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h||.008,16),this.mat(c,{roughness:.35})); b.rotation.x=Math.PI/2; b.position.set(x,y,.024); wheel.add(b); return b; };
  btn(.13,.24,0xf1f1ec,.0045,.012); btn(.22,.35,0xf2c618,.006); btn(.14,.47,0x1e9a4a,.006); btn(.23,.58,0xd01d1d,.006); btn(.15,.7,0x1d4fc4,.006);
  this.horn=btn(.88,.42,0x1e9a4a,.006); btn(.9,.68,0x111111,.006);
  { const [x,y]=P(.39,.66), k=new THREE.Mesh(new THREE.CylinderGeometry(.012,.013,.016,20),blk); k.rotation.x=Math.PI/2; k.position.set(x,y,.028); wheel.add(k);
   const m=box(.002,.008,.002,white,0,.006,.009,k); m.rotation.x=-Math.PI/2; this.regenKnob=k; }
  const toggle=(u,v)=>{ const [x,y]=P(u,v), g=new THREE.Group(); g.position.set(x,y,.022); box(.012,.012,.006,alu,0,0,0,g); const lv=box(.003,.003,.016,alu,0,0,.008,g); lv.position.z=.009; g.lever=lv; wheel.add(g); return g; };
  this.ecoT=toggle(.62,.71); this.winkT=toggle(.76,.71);
  // グリップ裏のボリューム: 右 = アクセル, 左 = 回生 (奥へ回す)
  const dial=(sd)=>{ const d=new THREE.Mesh(new THREE.CylinderGeometry(.016,.016,.012,18),this.mat(0x2a2d31,{roughness:.4,metalness:.3})); d.rotation.z=Math.PI/2; d.position.set(sd*(W/2-.05),.055,-.03); wheel.add(d);
   const tick=box(.013,.002,.004,white,0,.016,0,d); return d; };
  this.thrDial=dial(1); this.rgnDial=dial(-1);
  V.yokeMesh=wheel; V.yokePivot.add(wheel);
  // 軸 (銀) とクイックリリース (金)
  const qr=new THREE.Mesh(new THREE.CylinderGeometry(.022,.022,.035,18),gold); qr.rotation.x=Math.PI/2; qr.position.set(0,0,-.04); V.yokePivot.add(qr);
  const col=new THREE.Mesh(new THREE.CylinderGeometry(.011,.011,.45,12),alu); col.rotation.x=Math.PI/2; col.position.set(0,0,-.28); V.yokePivot.add(col);
  cock.add(V.yokePivot);
  // ---- スイッチ箱 (右斜め前の壁) ----
  const sb=new THREE.Group(); sb.position.set(ow-.016,top-.1,ez-.36); sb.rotation.set(0,0,Math.PI/2); sb.rotateOnWorldAxis(new THREE.Vector3(1,0,0),Math.PI/2);   // 右斜め前: 右の壁の側面に平らに付ける (操作面は内側, 横長)
  const paper=this.tex(512,300,(c,w,h)=>{ c.fillStyle="#8d9196"; c.fillRect(0,0,w,h); c.fillStyle="#f6f6f2"; c.fillRect(w*.12,h*.04,w*.76,h*.22);
   c.fillStyle="#333"; c.font="600 15px 'BIZ UDPGothic',sans-serif"; c.textAlign="left"; ["緊急停止 / プリチャージ / ハザード","前後 弱電 ZP モタコン テレメ"].forEach((t,i)=>c.fillText(t,w*.15,h*.12+i*22));
   c.textAlign="center"; c.font="700 18px 'BIZ UDPGothic',sans-serif"; ["前/後","弱電","ZP","モタコン","テレメ"].forEach((t,i)=>{ c.fillStyle="#f6f6f2"; c.fillRect(w*(.13+i*.17)-34,h*.86-16,68,22); c.fillStyle="#111"; c.fillText(t,w*(.13+i*.17),h*.86); }); });
  const sbBody=new THREE.Mesh(new THREE.BoxGeometry(.14,.03,.095),[this.mat(0x8d9196),this.mat(0x8d9196),new THREE.MeshStandardMaterial({map:paper,roughness:.7}),this.mat(0x8d9196),this.mat(0x8d9196),this.mat(0x8d9196)]);
  sb.add(sbBody);
  const knob=(x,z,c,r,h)=>{ const b=new THREE.Mesh(new THREE.CylinderGeometry(r,r*1.05,h,18),this.mat(c,{roughness:.35})); b.position.set(x,.015+h/2,z); sb.add(b); return b; };
  this.hazBtn=knob(-.05,-.03,0xc81a1a,.006,.006); knob(.035,-.012,0xd01d1d,.017,.02); knob(.035,-.012,0x5a5d61,.012,.006).position.y=.017; knob(-.01,-.012,0x1e9a4a,.009,.01);
  this.sw={};
  ["dir","weak","zp","motor","tele"].forEach((k,i)=>{ const g=new THREE.Group(); g.position.set(-.052+i*.026,.016,.028); const base=new THREE.Mesh(new THREE.CylinderGeometry(.005,.005,.006,10),alu); g.add(base);
   const lv=new THREE.Mesh(new THREE.CylinderGeometry(.0018,.0022,.02,8),alu); lv.position.y=.01; g.add(lv); g.lever=lv; sb.add(g); this.sw[k]=g; });
  cock.add(sb); this.switchBox=sb;
  // ---- パーキングブレーキ: 太ももの横の水道コックのようなレバー ----
  const pb=new THREE.Group(); pb.position.set(ex-.16,hipY+.1,hipZ-.25);
  const valve=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.03,12),this.mat(0xb8862b,{metalness:.7,roughness:.35})); pb.add(valve);
  const handle=new THREE.Group(); handle.position.y=.02; const hb=new THREE.Mesh(new THREE.BoxGeometry(.075,.008,.016),this.mat(0xc81a1a,{roughness:.45})); hb.position.x=.0375; handle.add(hb); pb.add(handle);
  cock.add(pb); this.pbrake={g:pb,handle};
  // ---- ゴムひものフック (左右) ----
  this.hooks=[-1,1].map(sd=>box(.02,.02,.02,blk,sd*(ow-.02),top+.01,ez+.05));
  this.fl=fl;
  return {half:ow,fl};
 },
 /* バックビューカメラのモニター (キャノピーの裏) と、そこへ映す後ろ向きのカメラ */
 attachRearView(V){
  const cm=V.canopyMesh; if(!cm||!V.cockE0) return;
  const E=V.cockE0;
  V.rearRT=new THREE.WebGLRenderTarget(256,144); V.rearRT.texture.encoding=THREE.sRGBEncoding; V.rearCam=new THREE.PerspectiveCamera(48,256/144,0.5,600);
  const mon=new THREE.Group(); mon.position.set(E[0],E[1]+.17,E[2]-.1); mon.rotation.x=Math.PI/2-.3;
  const frame=new THREE.Mesh(new THREE.BoxGeometry(.118,.075,.012),this.mat(0x101113)); mon.add(frame);
  // 画面は下 (ドライバー側) を向く。ミラーと同じ向きに左右を反転して映す
  const sg=new THREE.PlaneGeometry(.104,.059), uv=sg.attributes.uv; for(let i=0;i<uv.count;i++) uv.setX(i,1-uv.getX(i));
  V.rearScreen=new THREE.Mesh(sg,new THREE.MeshBasicMaterial({map:V.rearRT.texture})); V.rearScreen.position.z=.0065; mon.add(V.rearScreen);
  cm.add(mon); V.rearMon=mon; V.rearFrame=0; this._rearZ=0;
 },
 /* 後ろ向きのカメラを車体の後端に置き、ドライバー視点のときだけ 3 フレームに 1 回描く */
 renderRear(V){
  if(!V.rearRT||!V.car||V.cam!==2||(typeof Crew!=="undefined"&&!Crew.inCar())) return;
  if((V.rearFrame=(V.rearFrame+1)%3)!==0) return;
  if(!this._rearZ){ const bb=new THREE.Box3().setFromObject(V.carBody||V.car), inv=new THREE.Matrix4().copy(V.car.matrixWorld).invert(); bb.applyMatrix4(inv); this._rearZ=bb.max.z+.05; this._rearY=Math.max(.5,bb.max.y*.7); }
  const c=V.rearCam; c.position.copy(V.car.localToWorld(new THREE.Vector3(0,this._rearY,this._rearZ)));
  c.lookAt(V.car.localToWorld(new THREE.Vector3(0,this._rearY-.3,this._rearZ+30)));
  const r=V.renderer, prev=r.getRenderTarget(); r.setRenderTarget(V.rearRT); r.render(V.scene,c); r.setRenderTarget(prev);
 },
 /* 毎フレーム: 操作部品の向き・ランプ */
 sync(V,es){
  if(!this.thrDial||!es) return;
  this.thrDial.rotation.x=-(es.throttleSet||0)*2.2; this.rgnDial.rotation.x=-(es.brakeRegen||0)*2.2;
  if(this.regenKnob) this.regenKnob.rotation.z=-(P.regenStrength||0.5)*4.4+2.2;
  if(this.ecoT) this.ecoT.lever.rotation.x= es.powerMode? .6 : -.6;
  if(this.winkT) this.winkT.lever.rotation.y= es.signal===-1? .6 : es.signal===1? -.6 : 0;
  const cr=typeof Crew!=="undefined"&&Crew.st, on=(k)=>this.state(k,es,cr);
  for(const k in this.sw) this.sw[k].lever.rotation.x= on(k)? -.55 : .55;
  if(this.hazBtn) this.hazBtn.material.emissive.setHex(es.signal===2&&(performance.now()%800)<400? 0x661010 : 0x000000);
  if(this.pbrake) this.pbrake.handle.rotation.y= cr&&cr.pbrake? -Math.PI/2 : 0;
 },
 state(k,es,cr){ if(k==="dir") return es.gear!=="R"; if(k==="motor") return !cr||cr.motor!==false; return true; },
 /* 16 文字 × 2 行の液晶 (青地に白い文字)。画面切り替え (I キー) で 3 ページ */
 drawLCD(V,es){
  const c=V.dashCanvas.getContext("2d"), W=512, H=128, on=true;
  const g=c.createLinearGradient(0,0,0,H); g.addColorStop(0,"#2443d6"); g.addColorStop(1,"#1a33b8"); c.fillStyle=on?g:"#0b0f1e"; c.fillRect(0,0,W,H);
  if(!on){ V.dashTex.needsUpdate=true; return; }
  const pad=(s)=>(s+"                ").slice(0,16), f1=(x,d)=>Number.isFinite(x)?x.toFixed(d):"--";
  const V_=es.lastVterm!=null?es.lastVterm:VOC(es.soc), I=es.lastIbat||0, kmh=Math.round(es.v*3.6), h=Math.floor(es.hour), m=Math.floor(es.hour%1*60);
  const pages=[[`Bz ${f1(es.ahUsed,1)}Ah ${f1(V_,1)}V`,`BA${f1(-I,2)}A ${kmh}km/h`],
   [`SOC${f1(es.soc*100,1)}% ${es.powerMode?"PWR":"ECO"}`,`PV${Math.round(es.lastSolar||0)}W M${Math.round(es.lastMotorW||0)}W`],
   [`Tc${f1(es.lastTcell,0)}C Tb${f1(es.Tbat,0)}C`,`D${es.day} ${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")} ${es.gear==="R"?"R":"D"}`]];
  const L=pages[this.page%this.PAGES], cw=W/16;
  // 文字の升目 (液晶らしさ)
  c.fillStyle="rgba(255,255,255,.07)"; for(let r=0;r<2;r++) for(let i=0;i<16;i++) c.fillRect(i*cw+3,10+r*58,cw-6,48);
  c.fillStyle="#e9efff"; c.font="700 40px 'Consolas','Courier New',monospace"; c.textAlign="center";
  for(let r=0;r<2;r++){ const s=pad(L[r]); for(let i=0;i<16;i++) c.fillText(s[i],i*cw+cw/2,48+r*58); }
  V.dashTex.needsUpdate=true;
 },
};
addEventListener("keydown",e=>{ if(e.key.toLowerCase()==="i"&&typeof running!=="undefined"&&running){ Cockpit.page=(Cockpit.page+1)%Cockpit.PAGES; Snd.click&&Snd.click(); } });
