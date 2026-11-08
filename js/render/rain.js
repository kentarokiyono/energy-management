"use strict";
/* ============ 雨 ============
 スコール・暴風雨のとき (Engine.st.weather.type === "squall")。強さ I (0〜1) は日射の落ち方から決め、約 10 秒 (実時間) かけて変わる (降り始め・上がり)。
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
  this.I+=clamp(tgt-this.I,-dtR/10,dtR/10);   // 降り始め・上がりは約 10 秒 (実時間) かけて
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
  StormFx.update(view,es,dtR);
 },
 reset(){ this.I=0; this.wet=0; this.flash=0; Glass.clear(); StormFx.reset(); },
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
/* 嵐の前ぶれ (目で見て分かるもの): 近づいてくる暗い雲の壁・遠くの雨のカーテン (近づくほど手前に)・雲の中の稲光・突風で飛ぶゴミや葉
 スコール (天気の予定) と練習シナリオの暴風雨で、前縁が来る 40 分前から。来る方向 = 風上 (暴風雨は右前から) */
const StormFx={
 grp:null, cloud:null, curtain:null, debris:null, doff:new THREE.Vector3(), DBOX:new THREE.Vector3(36,5,36), bolt:0, nextBolt:0,
 build(scene){
  const grp=new THREE.Group(); grp.visible=false;
  const noise=`float hh(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
   float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hh(i),hh(i+vec2(1,0)),f.x),mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x),f.y); }
   float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*vn(p); p*=2.03; a*=0.5; } return s; }`;
  // 雲の壁 (積乱雲): 円筒の一部 (+Z の向きを中心に)。真ん中がそびえて上はかなとこ状に広がり、下は平らな棚雲。
  //  上の縁はもこもこ (カリフラワー)、日が当たる上は明るく下は暗い。奥にもう 1 枚 (淡く高い) を重ねて奥行きを出す
  const cloudMat=(seed,far)=>new THREE.ShaderMaterial({transparent:true,depthWrite:false,fog:false,side:THREE.DoubleSide,
   uniforms:{uA:{value:0},uT:{value:0},uF:{value:0},uFp:{value:new THREE.Vector2(0.5,0.4)}},
   vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
   fragmentShader:noise+`uniform float uA,uT,uF; uniform vec2 uFp; varying vec2 vUv;
    const float SEED=${seed.toFixed(1)}, FAR=${far?1:0}.0;
    float shape(vec2 q){   // > 0 で雲の中
     float x=q.x, y=q.y, w=0.2+0.07*FAR;
     float tower=0.4+0.42*exp(-pow((x-0.5)/w,2.0))+0.1*exp(-pow((x-0.3)/0.1,2.0))+0.08*exp(-pow((x-0.7)/0.09,2.0));
     float bill=0.075*fbm(vec2(x*18.0+SEED,y*6.0+uT*0.004))+0.035*vn(vec2(x*55.0+SEED,y*20.0));   // 上の縁のもこもこ
     float top=tower+bill-0.04;
     float anvil=smoothstep(0.035,0.0,abs(y-0.88-0.02*vn(vec2(x*9.0,SEED))))*smoothstep(0.52+0.26,0.26,abs(x-0.55))*step(0.62,top);   // かなとこ (上で横に広がる薄い層)
     float base=0.16+0.025*vn(vec2(x*24.0+SEED,uT*0.01));   // 平らな雲底 (棚雲)
     float body=min(top-y,y-base), an= anvil>0.01? 0.03*anvil : -1.0;
     return max(body,an); }
    void main(){ vec2 q=vUv; float d=shape(q);
     if(d<=0.0){   // 雲の下: 降水で灰色にかすむ (雲底から地面まで、真ん中ほど濃い)
      float hz=(1.0-FAR)*step(q.y,0.2)*smoothstep(0.18,0.4,q.x)*smoothstep(0.88,0.62,q.x)*smoothstep(0.0,0.05,q.y)*(0.45+0.4*fbm(vec2(q.x*26.0+SEED,q.y*4.0+uT*0.06)));
      if(hz<0.02) discard; gl_FragColor=vec4(vec3(0.36,0.39,0.43),hz*uA*0.75); return; }
     float edge=smoothstep(0.0,0.035,d)*smoothstep(0.0,0.12,q.x)*smoothstep(1.0,0.88,q.x);
     // もこもこの陰影: 雲の密度の傾きから、上 (日の当たる側) を向く面を明るく
     vec2 p=vec2(q.x*7.0+SEED,q.y*5.0-uT*0.003); float n0=fbm(p), nx=fbm(p+vec2(0.04,0.0)), ny=fbm(p+vec2(0.0,0.04));
     float lit=clamp(0.55+(ny-n0)*9.0-(nx-n0)*3.0,0.0,1.0);
     float h=smoothstep(0.16,0.9,q.y);
     vec3 dark=vec3(0.11,0.12,0.15), mid=vec3(0.32,0.34,0.38), top=vec3(0.82,0.82,0.84);
     vec3 c=mix(dark,mid,smoothstep(0.15,0.55,h+0.25*lit));
     c=mix(c,top,smoothstep(0.55,0.95,h)*lit*0.85+smoothstep(0.02,0.0,d)*0.25*h);   // 上の縁は日が当たって白っぽい
     float lip=smoothstep(0.16,0.19,q.y)*smoothstep(0.26,0.19,q.y);   // 棚雲の明るいふちと横のしま
     c=mix(c,vec3(0.4,0.42,0.46),lip*0.55*(0.6+0.4*sin(q.y*260.0+fbm(vec2(q.x*30.0,SEED))*6.0)));
     c+=uF*vec3(0.75,0.78,0.95)*exp(-dot(q-uFp,q-uFp)*90.0)*(0.5+0.5*n0);   // 稲光 (雲の一部が光る)
     c=mix(c,vec3(0.5,0.53,0.57),0.35*FAR);   // 奥の雲は空気で淡く
     gl_FragColor=vec4(c,edge*uA*(0.92-0.3*FAR)); }`});
  this.cloud=new THREE.Mesh(new THREE.CylinderGeometry(1150,1150,820,48,1,true,-1.05,2.1),cloudMat(3,false));
  this.cloud.position.y=380; this.cloud.renderOrder=-1; grp.add(this.cloud);
  this.cloud2=new THREE.Mesh(new THREE.CylinderGeometry(1300,1300,1000,40,1,true,-0.75,1.6),cloudMat(11,true));
  this.cloud2.position.y=470; this.cloud2.rotation.y=0.35; this.cloud2.renderOrder=-2; grp.add(this.cloud2);
  // 雨のカーテン: 雲の下から地面まで、縦の筋が流れ落ちる幕 (半径は近づくほど小さく)
  const rg=new THREE.CylinderGeometry(1000,1000,1,32,1,true,-0.45,0.9);
  this.curtain=new THREE.Mesh(rg,new THREE.ShaderMaterial({transparent:true,depthWrite:false,fog:false,side:THREE.DoubleSide,
   uniforms:{uA:{value:0},uT:{value:0}},
   vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
   fragmentShader:noise+`uniform float uA,uT; varying vec2 vUv;
    void main(){ float st=vn(vec2(vUv.x*160.0,vUv.y*4.0+uT*2.5))*0.6+fbm(vec2(vUv.x*12.0,vUv.y*1.5+uT*0.3))*0.6;
     float a=smoothstep(0.0,0.22,vUv.x)*smoothstep(1.0,0.78,vUv.x)*smoothstep(1.0,0.75,vUv.y)*(0.45+0.55*st);
     gl_FragColor=vec4(vec3(0.42,0.45,0.5)*(0.85+0.2*st),a*uA); }`}));
  grp.add(this.curtain);
  scene.add(grp); this.grp=grp;
  // 飛ぶゴミ・葉: 突風 (風速 10 m/s 以上) で横へ流れる
  const N=500, D=new Float32Array(N*3); for(let i=0;i<N;i++) D.set([Math.random(),Math.random(),Math.random()],i*3);
  const dg=new THREE.BufferGeometry(); dg.setAttribute("position",new THREE.BufferAttribute(D,3));
  this.debris=new THREE.Points(dg,new THREE.ShaderMaterial({transparent:true,depthWrite:false,fog:false,
   uniforms:{uC:{value:new THREE.Vector3()},uOff:{value:this.doff},uBox:{value:this.DBOX},uI:{value:0},uT:{value:0},uPx:{value:300}},
   vertexShader:`uniform vec3 uC,uOff,uBox; uniform float uI,uT,uPx; varying float vA; varying float vK;
    void main(){ vec3 p=mod(position*uBox+uOff,uBox)-uBox*0.5; p.y=mod(position.y*uBox.y+sin(uT*3.0+position.x*40.0)*0.8,uBox.y)*0.6+0.1;
     vec4 mv=viewMatrix*vec4(uC.x+p.x,uC.y+p.y,uC.z+p.z,1.0); float d=length(p.xz); vA=step(position.z,uI)*smoothstep(1.5,3.0,d)*(1.0-smoothstep(14.0,18.0,d)); vK=position.x;
     gl_PointSize=(2.0+3.0*fract(position.x*91.0))*uPx/max(1.0,-mv.z); gl_Position=projectionMatrix*mv; }`,
   fragmentShader:`varying float vA; varying float vK; void main(){ if(vA<0.02) discard; vec2 q=abs(gl_PointCoord-0.5); if(q.x+q.y*1.6>0.5) discard;
    gl_FragColor=vec4(mix(vec3(0.33,0.27,0.18),vec3(0.36,0.4,0.24),step(0.5,vK)),vA*0.9); }`}));
  this.debris.frustumCulled=false; this.debris.visible=false; scene.add(this.debris);
  this.scene=scene;
 },
 reset(){ this.bolt=0; this.nextBolt=0; if(this.grp) this.grp.visible=false; if(this.debris) this.debris.visible=false; },
 /* 次の嵐 {tMin: 前縁まで何分 (負 = もう中), dir: 来る方向 (ワールド), dur} */
 next(es,view){ if(!es) return null; const abs=(es.day-1)*24+es.hour, h=view.ch, fx=Math.sin(h), fz=-Math.cos(h), rx=Math.cos(h), rz=Math.sin(h);
  const c=typeof Scenario!=="undefined"&&Scenario.cur&&es.scenario&&Scenario.cur.sc.storm? Scenario.cur : null;
  if(c){ const st=c.st||c.sc.storm, sgn=(c.sc.wind&&c.sc.wind.rel)||1; return {tMin:(c.abs0+st.in-abs)*60,dur:st.dur*60,dx:rx*0.6*sgn+fx*0.8,dz:rz*0.6*sgn+fz*0.8}; }   // 右前から
  const plan=es.weatherPlan||[], w=plan.find(x=>x.type==="squall"&&abs<x.start+x.dur&&x.start-abs<0.7); if(!w) return null;
  const head=es.lastHead||0, crossR=-(es.lastCross||0), ax=fx*(-head)+rx*crossR, az=fz*(-head)+rz*crossR, m=Math.hypot(ax,az);
  return {tMin:(w.start-abs)*60,dur:w.dur*60,dx:m>1? -ax/m : fx,dz:m>1? -az/m : fz}; },
 update(view,es,dtR){
  if(!this.grp||this.scene!==view.scene) this.build(view.scene);
  const N= P.mode==="race"? this.next(es,view) : null, now=performance.now()/1000;
  let a=0, ca=0, r=1000;
  if(N){ const t=N.tMin; a= t>0? clamp((40-t)/35,0,1) : clamp(1+t/3,0,1); ca= t>0? clamp((25-t)/23,0,1)*0.8 : clamp(1+t/1.5,0,1)*0.8; r= 130+clamp(t/25,0,1)*870; }
  this.grp.visible=a>0.01||ca>0.01;
  // 前縁の手前 (12 分前から): 棚雲が頭上に来て、空が暗く・光が弱くなる
  if(N&&N.tMin>0&&N.tMin<12){ const d=clamp((12-N.tMin)/10,0,1)*0.65, sd=view.skyDome; if(sd){ const u=sd.material.uniforms; u.uTop.value.lerp(new THREE.Color(0.24,0.26,0.29),d); u.uHor.value.lerp(new THREE.Color(0.45,0.48,0.5),d*0.8); u.uCover.value=Math.max(u.uCover.value,0.3+0.6*d); }
   view.sunLight.intensity*=1-0.5*d; view.hemiLight.intensity*=1-0.25*d; if(view.scene.fog) view.scene.fog.color.lerp(new THREE.Color(0.38,0.4,0.43),d*0.5); }
  if(this.grp.visible){ const cam=view.camera.position; this.grp.position.set(cam.x,(view.car? view.car.position.y : cam.y),cam.z); this.grp.rotation.y=Math.atan2(N.dx,N.dz);
   const cu=this.cloud.material.uniforms, cu2=this.cloud2.material.uniforms; cu.uA.value=a; cu.uT.value=now; cu2.uA.value=a*0.9; cu2.uT.value=now;
   const k=this.curtain.material.uniforms; k.uA.value=ca; k.uT.value=now; this.curtain.scale.set(r/1000,240,r/1000); this.curtain.position.y=118;
   // 遠くの稲光 (雲の中が光る)。近いほど雷鳴が大きく早い
   if(N.tMin<22&&N.tMin>-1&&now>this.nextBolt){ if(this.nextBolt>0){ this.bolt=1; cu.uFp.value.set(0.3+0.4*Math.random(),0.25+0.4*Math.random()); const d=clamp(N.tMin/4,0.5,6); setTimeout(()=>{ if(typeof Snd!=="undefined"&&Snd.thunder) Snd.thunder(clamp(1-N.tMin/25,0.1,0.9)); },d*1000); } this.nextBolt=now+6+Math.random()*16; }
   cu.uF.value=this.bolt; cu2.uF.value=this.bolt*0.3; this.bolt=Math.max(0,this.bolt-dtR*(this.bolt>0.6?10:4)); }
  // 飛ぶゴミ・葉
  const ws=es&&es.windSpeed||0, di=P.mode==="race"? clamp((ws-10)/16,0,1) : 0; this.debris.visible=di>0.01;
  if(this.debris.visible){ const h=view.ch, fx=Math.sin(h), fz=-Math.cos(h), rx=Math.cos(h), rz=Math.sin(h), v=(es.v||0)*gearDir(), head=es.lastHead||0, crossR=-(es.lastCross||0);
   const vx=fx*(-head-v)+rx*crossR, vz=fz*(-head-v)+rz*crossR; this.doff.x=(this.doff.x+vx*dtR)%this.DBOX.x; this.doff.z=(this.doff.z+vz*dtR)%this.DBOX.z;
   const u=this.debris.material.uniforms; u.uC.value.copy(view.car.position); u.uI.value=di; u.uT.value=now; u.uPx.value=innerHeight*0.5/Math.tan(view.camera.fov*Math.PI/360)*0.03; }
 },
};
