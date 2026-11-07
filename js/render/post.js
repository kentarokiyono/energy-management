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
  const now=performance.now(), iv= k==="high"? 1000 : 4000;
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
 VIG:{uniforms:{tDiffuse:{value:null},uVig:{value:0.32}},
  vertexShader:"varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
  fragmentShader:`uniform sampler2D tDiffuse; uniform float uVig; varying vec2 vUv;
   void main(){ vec4 c=texture2D(tDiffuse,vUv); vec2 p=vUv-0.5; float v=1.0-uVig*smoothstep(0.25,0.85,length(p*vec2(1.25,1.0)));
    gl_FragColor=linearToOutputTexel(vec4(c.rgb*v,1.0)); }`},
 want(){ return GFX.key()==="high"&&typeof THREE.EffectComposer==="function"&&typeof THREE.UnrealBloomPass==="function"; },
 build(r){
  const w=innerWidth, h=innerHeight, pr=r.getPixelRatio();
  let rt; const W=Math.floor(w*pr), H=Math.floor(h*pr);
  if(r.capabilities.isWebGL2&&THREE.WebGLMultisampleRenderTarget){ rt=new THREE.WebGLMultisampleRenderTarget(W,H,{format:THREE.RGBAFormat}); rt.samples=4; }
  else rt=new THREE.WebGLRenderTarget(W,H,{format:THREE.RGBAFormat});
  const c=new THREE.EffectComposer(r,rt);
  this.rp=new THREE.RenderPass(new THREE.Scene(),new THREE.PerspectiveCamera()); c.addPass(this.rp);
  this.bloom=new THREE.UnrealBloomPass(new THREE.Vector2(w,h),0.32,0.45,0.85); c.addPass(this.bloom);
  this.fin=new THREE.ShaderPass(this.VIG); c.addPass(this.fin);
  this.comp=c; this.renderer=r; this.w=w; this.h=h; this.pr=pr;
 },
 dispose(){ if(!this.comp) return; this.comp.renderTarget1.dispose(); this.comp.renderTarget2.dispose(); if(this.bloom) this.bloom.dispose&&this.bloom.dispose(); this.comp=null; },
 /* 描画: 高 = ポストプロセス、それ以外 = そのまま */
 render(r,scene,cam){
  if(!this.want()){ r.render(scene,cam); return; }
  if(!this.comp||this.renderer!==r){ this.dispose(); this.build(r); }
  const w=innerWidth, h=innerHeight, pr=r.getPixelRatio();
  if(w!==this.w||h!==this.h||pr!==this.pr){ this.comp.setPixelRatio(pr); this.comp.setSize(w,h); this.w=w; this.h=h; this.pr=pr; }
  this.rp.scene=scene; this.rp.camera=cam;
  this.comp.render();
 },
};
