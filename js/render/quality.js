"use strict";
/* ============ ⑤ 品質ヘルパ ============ */
const _envCache=new WeakMap();
function setupRenderQuality(renderer,scene){
  renderer.outputEncoding=THREE.sRGBEncoding;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=0.92;
  if(!_envCache.has(renderer)){
    const es=new THREE.Scene();
    es.add(new THREE.Mesh(new THREE.SphereGeometry(50,16,12), new THREE.MeshBasicMaterial({color:0x9ec8ef,side:THREE.BackSide})));
    const gd=new THREE.Mesh(new THREE.CircleGeometry(50,24), new THREE.MeshBasicMaterial({color:0xb4713d})); gd.rotation.x=-Math.PI/2; gd.position.y=-2; es.add(gd);
    const sn=new THREE.Mesh(new THREE.SphereGeometry(6,12,10), new THREE.MeshBasicMaterial({color:0xfff2c0})); sn.position.set(20,30,-10); es.add(sn);
    const pm=new THREE.PMREMGenerator(renderer);
    _envCache.set(renderer,pm.fromScene(es,0.04).texture); pm.dispose();
  }
  scene.environment=_envCache.get(renderer);
  scene.fog=new THREE.Fog(0x87b6e8,320,2000);
}
/* ============ ③ 品質監視 ============ */
/* 描画の重さに合わせて解像度を自動調整。下げるのは平均 fps が 28 未満が続いたとき、上げるのは 55 以上が続いたとき。
 解像度は端末の画素密度の範囲で 2.0 → 1.5 → 1.25 → 1.0 まで (1.0 未満には下げない)。影は 2 段階下げたら切る */
const Perf={acc:0,fr:0,lv:0,good:0,
  steps(){ const d=Math.min(devicePixelRatio||1,2); return [d,1.5,1.25,1.0].filter((x,i,a)=>x<=d&&a.indexOf(x)===i); },
  apply(){ const r=View.renderer; if(!r) return; const st=this.steps(), pr=st[Math.min(this.lv,st.length-1)];
    if(Math.abs(r.getPixelRatio()-pr)>0.01){ r.setPixelRatio(pr); r.setSize(innerWidth,innerHeight); }
    r.shadowMap.enabled= this.lv<2; },
  reset(){ this.acc=0; this.fr=0; this.lv=0; this.good=0; this.apply(); },
  tick(dt){ this.acc+=dt; this.fr++;
    if(this.acc<3) return; const fps=this.fr/this.acc; this.acc=0; this.fr=0;
    const n=this.steps().length;
    if(fps<28&&this.lv<n-1){ this.lv++; this.good=0; this.apply(); }
    else if(fps>55&&this.lv>0){ if(++this.good>=2){ this.lv--; this.good=0; this.apply(); } }
    else this.good=0; }};
