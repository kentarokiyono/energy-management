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
const Perf={acc:0,fr:0,lv:0,tick(dt){this.acc+=dt;this.fr++;
  if(this.acc>=2){const fps=this.fr/this.acc;this.acc=0;this.fr=0;
    if(fps<45&&this.lv===0&&View.renderer){this.lv=1;View.renderer.shadowMap.enabled=false;View.renderer.setPixelRatio(1.0);}
    else if(fps<45&&this.lv===1&&View.renderer){this.lv=2;View.renderer.setPixelRatio(0.85);}}}};
