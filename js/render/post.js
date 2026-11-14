"use strict";
/* ============ 映り込みの環境 と ポストプロセス ============
 ・EnvLight: 空 (上・地平線の色)・地面の色・太陽から小さな空の球を作り、PMREM で環境マップにして scene.environment に入れる。
   時刻・天気・土地に合わせて作り直すので、夕方は夕焼けが、曇りは灰色の空が車体に映る。
   画質「高」は 1 秒ごと、「標準」は 4 秒ごと。「低」は作り直さない (起動時の簡易な環境のまま)
 ・Post: 画質「高」のときだけ EffectComposer で描く。
   描画 (MSAA) → ブルーム (明るいところだけ少しにじむ) → 周辺減光 + 画面用の色 (sRGB) への変換 */
const EnvLight={
 t:0, rt:null, es:null, pm:null, renderer:null,
 build(renderer){
  if(this.renderer===renderer&&this.es) return;
  this.renderer=renderer; this.pm=new THREE.PMREMGenerator(renderer);
  const es=new THREE.Scene();
  // 空の球: 頂点ごとに色を付ける (上の空・地平線・地面、太陽の方向は明るく暖かく)。
  // 太陽そのもの (強い点) は入れない: 直射光の照り返しは DirectionalLight が出す。強い点を入れると全体が白く飛ぶ
  const g=new THREE.SphereGeometry(10,48,24); g.setAttribute("color",new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*3),3));
  this.sky=new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.BackSide,depthWrite:false,toneMapped:false})); es.add(this.sky);
  this.es=es; this.t=0;
 },
 /* top/hor: 空の色 (sRGB), gnd: 地面の色 (sRGB), sunDir: 太陽の向き, sunI: 太陽の強さ (0〜1) */
 update(renderer,scene,top,hor,gnd,sunDir,sunI,sunCol){
  const k=GFX.key(); if(k==="low"||!scene) return;
  this.build(renderer);
  const now=performance.now(), iv= GFX.ultra()? 350 : k==="high"? 1000 : 4000;
  if(this.rt&&now-this.t<iv) return; this.t=now;
  const T=new THREE.Color().copy(top).convertSRGBToLinear(), Hc=new THREE.Color().copy(hor).convertSRGBToLinear(), G=new THREE.Color().copy(gnd).convertSRGBToLinear().multiplyScalar(0.6);
  const ok=sunDir&&Number.isFinite(sunDir.x+sunDir.y+sunDir.z)&&sunDir.lengthSq()>1e-8, I=Number.isFinite(sunI)? clamp(sunI,0,1) : 0;   // 長さ 0・壊れた値は使わない
  const d=ok? sunDir.clone().normalize() : new THREE.Vector3(0,1,0), S=new THREE.Color().copy(sunCol||new THREE.Color(1,1,1)).convertSRGBToLinear();
  const pos=this.sky.geometry.attributes.position, col=this.sky.geometry.attributes.color, c=new THREE.Color(), v=new THREE.Vector3();
  for(let i=0;i<pos.count;i++){ v.fromBufferAttribute(pos,i).normalize(); const y=v.y;
   if(y>0) c.copy(Hc).lerp(T,Math.pow(Math.min(1,y),0.55)); else c.copy(Hc).lerp(G,Math.min(1,-y/0.12));
   const k=I*Math.pow(Math.max(0,v.dot(d)),6)*0.7; c.r=Math.min(1,c.r+S.r*k); c.g=Math.min(1,c.g+S.g*k); c.b=Math.min(1,c.b+S.b*k);
   col.setXYZ(i,c.r,c.g,c.b); }
  col.needsUpdate=true;
  const rt=this.pm.fromScene(this.es,0.02);
  if(this.rt) this.rt.dispose(); this.rt=rt; scene.environment=rt.texture;
 },
 reset(){ this.t=0; if(this.rt){ this.rt.dispose(); this.rt=null; } },
};
const Post={
 comp:null, renderer:null, w:0, h:0, pr:0,
 blur:0, dof:null,
 /* 被写界深度 (リプレイの視点だけ): ピントを車に合わせ、手前と奥をぼかす。望遠ほど強く。
   深度は別に描く (縮小した画面に、物の距離だけを描く)。ぼかしは周りを円く拾い、自分よりピントが合っている点の色は混ぜない (車のふちがにじまない) */
 DOF:{uniforms:{tDiffuse:{value:null},tDepth:{value:null},uNear:{value:0.1},uFar:{value:3000},uFocus:{value:20},uK:{value:1},uRes:{value:new THREE.Vector2(1,1)},uMax:{value:9}},
  vertexShader:"varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
  fragmentShader:`#include <packing>
   uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform float uNear; uniform float uFar; uniform float uFocus; uniform float uK; uniform vec2 uRes; uniform float uMax; varying vec2 vUv;
   float dist(vec2 uv){ float d=unpackRGBAToDepth(texture2D(tDepth,uv)); return d>0.9999? uFar : -perspectiveDepthToViewZ(d,uNear,uFar); }
   float coc(float z){ return clamp(abs(1.0-uFocus/max(z,0.01))*uK,0.0,1.0)*uMax; }
   void main(){ float c0=coc(dist(vUv)); vec4 col=texture2D(tDiffuse,vUv); if(c0<0.4){ gl_FragColor=col; return; }
    vec3 s=col.rgb; float w=1.0; const float GA=2.39996;
    for(int i=1;i<18;i++){ float fi=float(i), r=sqrt(fi/17.0)*c0, a=fi*GA; vec2 uv=vUv+vec2(cos(a),sin(a))*r/uRes;
     float ci=coc(dist(uv)); float k=smoothstep(r-1.5,r+0.5,ci+0.5); s+=texture2D(tDiffuse,uv).rgb*k; w+=k; }
    gl_FragColor=vec4(s/w,col.a); }`},
 /* 仕上げ: 周辺減光 + 画面用の色への変換。最高画質ではさらに、速度のぶれ (画面の中心から外へ流れる)・レンズの色のにじみ・フィルムの粒・色の締まり */
 VIG:{uniforms:{tDiffuse:{value:null},uVig:{value:0.32},uBlur:{value:0},uFx:{value:0},uTime:{value:0}},
  vertexShader:"varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
  fragmentShader:`uniform sampler2D tDiffuse; uniform float uVig; uniform float uBlur; uniform float uFx; uniform float uTime; varying vec2 vUv;
   float h21(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
   void main(){ vec2 c0=vec2(0.5,0.54), d=vUv-c0; float r=length(d*vec2(1.25,1.0));
    vec3 col;
    if(uBlur>0.001){ float a=uBlur*0.085*smoothstep(0.10,0.75,r); float j=h21(vUv*917.0+uTime)-0.5; vec3 s=vec3(0.0);
     for(int i=0;i<10;i++){ float t=(float(i)+j)/10.0; s+=texture2D(tDiffuse,vUv-d*a*t).rgb; } col=s/10.0; }
    else col=texture2D(tDiffuse,vUv).rgb;
    if(uFx>0.5){ float ca=0.0016*smoothstep(0.2,0.9,r); col.r=mix(col.r,texture2D(tDiffuse,vUv+d*ca).r,0.6); col.b=mix(col.b,texture2D(tDiffuse,vUv-d*ca).b,0.6); }
    vec2 p=vUv-0.5; float v=1.0-uVig*smoothstep(0.25,0.85,length(p*vec2(1.25,1.0)));
    vec4 o=linearToOutputTexel(vec4(col*v,1.0));
    if(uFx>0.5){ float l=dot(o.rgb,vec3(0.299,0.587,0.114)); o.rgb=mix(vec3(l),o.rgb,1.08); o.rgb=mix(o.rgb,o.rgb*o.rgb*(3.0-2.0*o.rgb),0.22);   /* 少し鮮やかに・明暗を締める */
     o.rgb+=(h21(vUv*vec2(1387.0,911.0)+fract(uTime)*7.0)-0.5)*0.022; }
    gl_FragColor=vec4(clamp(o.rgb,0.0,1.0),1.0); }`},
 want(){ return GFX.key()==="high"&&typeof THREE.EffectComposer==="function"&&typeof THREE.UnrealBloomPass==="function"; },
 build(r){
  const w=innerWidth, h=innerHeight, pr=r.getPixelRatio();
  let rt; const W=Math.floor(w*pr), H=Math.floor(h*pr);
  if(r.capabilities.isWebGL2&&THREE.WebGLMultisampleRenderTarget){ rt=new THREE.WebGLMultisampleRenderTarget(W,H,{format:THREE.RGBAFormat}); rt.samples=4; }
  else rt=new THREE.WebGLRenderTarget(W,H,{format:THREE.RGBAFormat});
  const c=new THREE.EffectComposer(r,rt);
  this.rp=new THREE.RenderPass(new THREE.Scene(),new THREE.PerspectiveCamera()); c.addPass(this.rp);
  this.dofP=new THREE.ShaderPass(this.DOF); this.dofP.enabled=false; c.addPass(this.dofP);
  this.bloom=new THREE.UnrealBloomPass(new THREE.Vector2(w,h),0.32,0.45,0.85); c.addPass(this.bloom);
  this.fin=new THREE.ShaderPass(this.VIG); c.addPass(this.fin);
  this.comp=c; this.renderer=r; this.w=w; this.h=h; this.pr=pr;
 },
 /* 深度を縮小した画面に描く (被写界深度のとき) */
 depth(r,scene,cam,w,h){ const W=Math.max(2,Math.floor(w*0.5)), H=Math.max(2,Math.floor(h*0.5));
  if(!this.dRT||this.dRT.width!==W||this.dRT.height!==H){ if(this.dRT) this.dRT.dispose(); this.dRT=new THREE.WebGLRenderTarget(W,H,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter}); }
  if(!this.dMat) this.dMat=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});
  const ov=scene.overrideMaterial, bg=scene.background, fog=scene.fog, cc=r.getClearColor(new THREE.Color()), ca=r.getClearAlpha(), rt=r.getRenderTarget(), sm=r.shadowMap.autoUpdate;
  scene.overrideMaterial=this.dMat; scene.background=null; scene.fog=null; r.shadowMap.autoUpdate=false; r.setClearColor(0xffffff,1); r.setRenderTarget(this.dRT); r.clear(); r.render(scene,cam);
  r.setRenderTarget(rt); r.setClearColor(cc,ca); scene.overrideMaterial=ov; scene.background=bg; scene.fog=fog; r.shadowMap.autoUpdate=sm;
  const u=this.dofP.uniforms, fl=1/Math.tan(cam.fov*Math.PI/360);
  u.tDepth.value=this.dRT.texture; u.uNear.value=cam.near; u.uFar.value=cam.far; u.uFocus.value=this.dof.focus; u.uK.value=0.18*fl*(this.dof.k||1); u.uRes.value.set(w,h); u.uMax.value=Math.max(3,h/120); },
 dispose(){ if(!this.comp) return; this.comp.renderTarget1.dispose(); this.comp.renderTarget2.dispose(); if(this.bloom) this.bloom.dispose&&this.bloom.dispose(); this.comp=null; },
 /* 描画: 高 = ポストプロセス、それ以外 = そのまま */
 render(r,scene,cam){
  if(!this.want()){ r.render(scene,cam); return; }
  if(!this.comp||this.renderer!==r){ this.dispose(); this.build(r); }
  const w=innerWidth, h=innerHeight, pr=r.getPixelRatio();
  if(w!==this.w||h!==this.h||pr!==this.pr){ this.comp.setPixelRatio(pr); this.comp.setSize(w,h); this.w=w; this.h=h; this.pr=pr; }
  this.rp.scene=scene; this.rp.camera=cam;
  { const on=!!(this.dof&&this.dof.focus>0); this.dofP.enabled=on; this._df=(this._df||0)+1; if(on&&(this._df%2===0||!this.dRT)) this.depth(r,scene,cam,w,h); }   /* 深度は 2 コマに 1 回 */
  { const U=GFX.ultra(), u=this.fin.uniforms; u.uBlur.value= U? this.blur||0 : 0; u.uFx.value= U?1:0; u.uTime.value=(performance.now()/1000)%100; if(this.bloom) this.bloom.strength= U?0.42:0.32; }
  this.comp.render();
 },
};
