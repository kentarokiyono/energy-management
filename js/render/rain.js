"use strict";
/* ============ 雨 ============
 スコール・暴風雨のとき (Engine.st.weather.type === "squall")。強さ I (0〜1) は日射の落ち方から決め、数秒かけて変わる (降り始め・上がり)。
 ・雨筋: カメラのまわりの箱の中を、落下 + 風 − 車の速度 (相対速度) で流れる線。速いほど斜めで長い
 ・水しぶき: 足もとの地面に小さな輪が広がっては消える
 ・路面: 濡れて暗くなり、浅い角度で空が映る (水たまりはまだら)。雨が上がっても少しずつ乾く
 ・視界: 霧を近くし、灰色に寄せる
 ・ガラスの雨粒: 画面の手前 (フロントガラス・カメラ) に粒がつき、大きくなると流れ落ちる
 ・音: 雨音 (高い音 = 粒、低い音 = 路面のザー)。暴風雨では稲光と雷鳴 */
const Rain={
 I:0, wet:0, flash:0, nextBolt:0, lines:null, splash:null, off:new THREE.Vector3(), goff:new THREE.Vector2(), BOX:new THREE.Vector3(40,22,40),
 build(scene){
  this.dispose(scene);
  const g=GFX.key(), N= g==="high"? 9000 : g==="mid"? 6000 : 3000, M= g==="high"? 900 : g==="mid"? 600 : 250;
  // 雨筋: 1 本 = 2 頂点 (頭と尾)
  const B=new Float32Array(N*6), E=new Float32Array(N*2), R=new Float32Array(N*2);
  for(let i=0;i<N;i++){ const x=Math.random(), y=Math.random(), z=Math.random(), r=Math.random(); for(let k=0;k<2;k++){ B.set([x,y,z],(i*2+k)*3); E[i*2+k]=k; R[i*2+k]=r; } }
  const lg=new THREE.BufferGeometry(); lg.setAttribute("position",new THREE.BufferAttribute(B,3)); lg.setAttribute("aE",new THREE.BufferAttribute(E,1)); lg.setAttribute("aR",new THREE.BufferAttribute(R,1));
  const lm=new THREE.ShaderMaterial({transparent:true,depthWrite:false,fog:false,
   uniforms:{uCam:{value:new THREE.Vector3()},uOff:{value:this.off},uBox:{value:this.BOX},uStreak:{value:new THREE.Vector3()},uI:{value:0},uCol:{value:new THREE.Color(0.78,0.82,0.88)}},
   vertexShader:`attribute float aE; attribute float aR; uniform vec3 uCam,uOff,uBox,uStreak; uniform float uI; varying float vA;
    void main(){ vec3 p=mod(position*uBox+uOff,uBox)-uBox*0.5; p.y+=uBox.y*0.18; float d=length(p);
     vA=step(aR,uI)*smoothstep(0.8,3.0,d)*(1.0-smoothstep(13.0,19.0,d))*(1.0-0.75*aE);
     gl_Position=projectionMatrix*viewMatrix*vec4(uCam+p+uStreak*aE,1.0); }`,
   fragmentShader:`uniform vec3 uCol; varying float vA; void main(){ if(vA<0.01) discard; gl_FragColor=vec4(uCol,vA*0.55); }`});
  this.lines=new THREE.LineSegments(lg,lm); this.lines.frustumCulled=false; this.lines.renderOrder=5; this.lines.visible=false; scene.add(this.lines);
  // 水しぶき: 地面の点 (広がる輪)
  const S=new Float32Array(M*3); for(let i=0;i<M;i++) S.set([Math.random(),Math.random(),Math.random()],i*3);
  const sg=new THREE.BufferGeometry(); sg.setAttribute("position",new THREE.BufferAttribute(S,3));
  const sm=new THREE.ShaderMaterial({transparent:true,depthWrite:false,fog:false,
   uniforms:{uC:{value:new THREE.Vector3()},uG:{value:this.goff},uT:{value:0},uI:{value:0},uPx:{value:300}},
   vertexShader:`uniform vec3 uC; uniform vec2 uG; uniform float uT,uI,uPx; varying float vT; varying float vV;
    float h(float n){ return fract(sin(n)*43758.5453); }
    void main(){ float ph=uT*1.7+position.z*9.0, cyc=floor(ph); vT=fract(ph);
     vec2 b=fract(position.xy+vec2(h(cyc+position.z*13.1),h(cyc*1.7+position.x*7.3))+uG/24.0)*24.0-12.0;
     vec4 mv=viewMatrix*vec4(uC.x+b.x,uC.y+0.03,uC.z+b.y,1.0); vV=step(position.z,uI)*(1.0-smoothstep(8.0,12.0,length(b)));
     gl_PointSize=(1.5+6.0*vT)*uPx/max(1.0,-mv.z); gl_Position=projectionMatrix*mv; }`,
   fragmentShader:`varying float vT; varying float vV; void main(){ vec2 q=gl_PointCoord*2.0-1.0; float r=length(q); float ring=smoothstep(0.62,0.8,r)*(1.0-smoothstep(0.85,1.0,r));
    float a=(ring+(1.0-smoothstep(0.0,0.35,r))*(1.0-smoothstep(0.0,0.25,vT)))*(1.0-vT)*vV; if(a<0.02) discard; gl_FragColor=vec4(0.86,0.9,0.95,a*0.55); }`});
  this.splash=new THREE.Points(sg,sm); this.splash.frustumCulled=false; this.splash.visible=false; scene.add(this.splash);
  this.gfx=g;
 },
 dispose(scene){ for(const o of [this.lines,this.splash]) if(o){ scene.remove(o); o.geometry.dispose(); o.material.dispose(); } this.lines=this.splash=null; },
 /* 強さの目標: スコールの日射の落ち方 (factor 0.3 → 小雨、0.05 → 豪雨) */
 target(es){ const w=es&&es.weather; if(!w||w.type!=="squall") return 0; return clamp(0.35+(0.3-(w.factor??0.15))/0.25*0.65,0.3,1); },
 update(view,es,dtR){
  if(!view.scene||!view.camera) return;
  if(!this.lines||this.gfx!==GFX.key()) this.build(view.scene);
  const tgt= P.mode==="race"&&!P.event? this.target(es) : (es&&es.weather&&es.weather.type==="squall"? 0.7 : 0);
  this.I+= (tgt-this.I)*clamp(dtR*(tgt>this.I?0.45:0.25),0,1); if(this.I<0.003&&tgt===0) this.I=0;
  const I=this.I, ts=Math.max(1,P.timeScale||1);
  // 路面: 濡れるのは早く、乾くのはゆっくり (ゲーム内の時間で)
  this.wet=clamp(this.wet+(I>0.05? dtR*ts/90*I : -dtR*ts/1500),0,1);
  SceneMats.eachRoad(u=>{ if(u.uWet) u.uWet.value=this.wet; });
  const on=I>0.01; this.lines.visible=on; this.splash.visible=on&&this.wet>0.1;
  if(on){
   const h=view.ch, fx=Math.sin(h), fz=-Math.cos(h), rx=Math.cos(h), rz=Math.sin(h), v=(es&&es.v||0)*gearDir();
   const head=es&&es.lastHead||0, crossR=-(es&&es.lastCross||0), fall=8.5;
   const vx=fx*(-head-v)+rx*crossR, vz=fz*(-head-v)+rz*crossR;   // 雨粒の速度 (車から見た)
   this.off.x=(this.off.x+vx*dtR)%this.BOX.x; this.off.y=(this.off.y-fall*dtR)%this.BOX.y; this.off.z=(this.off.z+vz*dtR)%this.BOX.z;
   const u=this.lines.material.uniforms; u.uCam.value.copy(view.camera.position); u.uI.value=I; u.uStreak.value.set(-vx*0.035,fall*0.035,-vz*0.035);
   const su=this.splash.material.uniforms; su.uC.value.copy(view.car.position); this.goff.x-=fx*v*dtR; this.goff.y-=fz*v*dtR; this.goff.x%=24; this.goff.y%=24;
   su.uT.value=performance.now()/1000; su.uI.value=I*this.wet; su.uPx.value=innerHeight*0.5/Math.tan(view.camera.fov*Math.PI/360)*0.012;
  }
  // 空と光: 雨が強いほど暗い灰色の雲に覆われる
  if(I>0){ const sd=view.skyDome; if(sd){ const u=sd.material.uniforms; u.uTop.value.lerp(new THREE.Color(0.24,0.26,0.29),I*0.85); u.uHor.value.lerp(new THREE.Color(0.42,0.45,0.48),I*0.8); u.uCover.value=Math.max(u.uCover.value,0.6+0.4*I); }
   view.sunLight.intensity*=1-0.6*I; view.hemiLight.intensity*=1-0.35*I; }
  // 視界: 霧を近く・灰色に
  if(view.scene.fog&&I>0){ const g=GFX.cur(), f=view.scene.fog; f.near=g.fogNear+(18-g.fogNear)*Math.min(1,I*1.1); f.far=g.fogFar+(260-g.fogFar)*I; f.color.lerp(new THREE.Color(0.32,0.35,0.38),I*0.6); }
  else if(view.scene.fog){ const g=GFX.cur(); view.scene.fog.near=g.fogNear; view.scene.fog.far=g.fogFar; }
  // 稲光と雷鳴 (強い雨のとき)
  const now=performance.now()/1000;
  if(I>0.8&&now>this.nextBolt){ if(this.nextBolt>0){ this.flash=1; const d=0.6+Math.random()*3; setTimeout(()=>{ if(typeof Snd!=="undefined"&&Snd.thunder) Snd.thunder(1.2-d*0.2); },d*1000); } this.nextBolt=now+12+Math.random()*30; }
  if(I<=0.8) this.nextBolt=Math.max(this.nextBolt,now+5);
  if(this.flash>0){ view.hemiLight.intensity+=this.flash*2.2; this.flash=Math.max(0,this.flash-dtR*(this.flash>0.5?6:2.5)); }
  // 音
  if(typeof Snd!=="undefined"&&Snd.started&&Snd.rainHi){ const cab= view.cam===2? 1.4 : 1; Snd.set(Snd.rainHi.g.gain,I*0.09*cab,0.4); Snd.set(Snd.rainLo.g.gain,I*(0.12+0.1*this.wet),0.6); }
  Glass.update(I,es,dtR,this.flash);
 },
 reset(){ this.I=0; this.wet=0; this.flash=0; Glass.clear(); },
};
/* フロントガラス・カメラの雨粒 (画面の手前の 2D の層) */
const Glass={
 cv:null, c:null, drops:[],
 ensure(){ if(this.cv) return true; const cv=document.getElementById("rain-glass"); if(!cv) return false; this.cv=cv; this.c=cv.getContext("2d"); return true; },
 clear(){ this.drops.length=0; if(this.ensure()){ this.c.clearRect(0,0,this.cv.width,this.cv.height); this.cv.style.display="none"; } },
 update(I,es,dtR,flash){
  if(!this.ensure()) return;
  if(I<=0.01&&!this.drops.length&&!(flash>0)){ if(this.cv.style.display!=="none") this.cv.style.display="none"; return; }
  const cv=this.cv, W=Math.round(innerWidth*0.75), H=Math.round(innerHeight*0.75); if(cv.width!==W||cv.height!==H){ cv.width=W; cv.height=H; }
  cv.style.display="block"; const c=this.c, v=es&&es.v||0, side=-(es&&es.lastCross||0)*0.6;
  // 新しい粒: 雨が強いほど多い。速く走ると風圧で上・横へ流れる
  for(let n=I*dtR*70*(1+v/25);n>0;n--) if(n>=1||Math.random()<n){ if(this.drops.length<260) this.drops.push({x:Math.random()*W,y:Math.random()*H,r:1.2+Math.random()*3.2*I,vy:0,life:0}); }
  c.clearRect(0,0,W,H);
  // 情報パネルの所には描かない (パネルは半透明なので、下に描くと透けてパネルに雨粒がついて見える)
  const now=performance.now(); if(!this.rects||now-this.rt>500){ this.rt=now; const k=W/innerWidth; this.rects=[];
   for(const el of document.querySelectorAll(".pn, #bottom-hud, #hud-roll, #hud-order")){ if(!el.offsetParent&&getComputedStyle(el).position!=="fixed") continue; const r=el.getBoundingClientRect(); if(r.width>4&&r.height>4&&getComputedStyle(el).display!=="none") this.rects.push([r.left*k,r.top*k,r.width*k,r.height*k]); } }
  c.save(); c.beginPath(); c.rect(0,0,W,H); for(const [x,y,w,h] of this.rects) c.rect(x-2,y-2,w+4,h+4); c.clip("evenodd");
  if(flash>0){ c.fillStyle=`rgba(235,240,255,${(flash*0.35).toFixed(3)})`; c.fillRect(0,0,W,H); }
  for(let i=this.drops.length-1;i>=0;i--){ const d=this.drops[i]; d.life+=dtR; d.r+=dtR*0.25*I;
   const big=d.r>3.4; d.vy= big? Math.min(220,d.vy+dtR*260) : d.vy*0.9; d.y+= (big? d.vy : 0)*dtR - (v>12? (v-12)*1.2*dtR : 0); d.x+=side*dtR*(big?6:2);
   if(big&&Math.random()<dtR*3) d.r*=0.9;
   const fade= I>0.01? 1 : Math.max(0,1-d.life/6+0.3);
   if(d.y>H+10||d.y<-10||d.x<-10||d.x>W+10||fade<=0||d.life>(big?4:14)){ this.drops.splice(i,1); continue; }
   const a=0.55*fade; c.beginPath(); c.arc(d.x,d.y,d.r,0,6.283); c.fillStyle=`rgba(190,200,212,${(a*0.35).toFixed(3)})`; c.fill();
   c.lineWidth=1; c.strokeStyle=`rgba(30,36,44,${(a*0.45).toFixed(3)})`; c.stroke();
   c.beginPath(); c.arc(d.x-d.r*0.3,d.y-d.r*0.35,d.r*0.35,0,6.283); c.fillStyle=`rgba(255,255,255,${(a*0.6).toFixed(3)})`; c.fill();
   if(big&&d.vy>40){ c.strokeStyle=`rgba(200,210,222,${(a*0.25).toFixed(3)})`; c.lineWidth=d.r*0.8; c.beginPath(); c.moveTo(d.x,d.y-d.r); c.lineTo(d.x,d.y-d.r-Math.min(60,d.vy*0.25)); c.stroke(); } }
  c.restore();
 },
};
