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
  const g=GFX.cur(); scene.fog=new THREE.Fog(0x87b6e8,g.fogNear,g.fogFar);
}
/* ============ 画質の設定 (メニューで選ぶ) ============
 自動: PC は「高」、スマホ・タブレットは「標準」から始め、描画が重いと解像度と影を自動で下げる。
 高 / 標準 / 低: 固定 (自動調整しない)。表示距離・景観の数は次の走行から反映 */
const GFX={
 PRESET:{
  ultra:{pr:2,  shadow:4096, ahead:2400, fogNear:320, fogFar:2000, far:3000, density:1},   // 最高: グラフィックボード付きの PC 向け (影を細かく広く・速度のぶれ・フィルムの質感)
  high:{pr:2,   shadow:2048, ahead:2400, fogNear:320, fogFar:2000, far:3000, density:1},
  mid: {pr:1.5, shadow:1024, ahead:1800, fogNear:280, fogFar:1600, far:2200, density:0.65},
  low: {pr:1,   shadow:0,    ahead:1200, fogNear:200, fogFar:1100, far:1400, density:0.35}},
 mobile(){ return P.uiMode==="mobile"||(typeof matchMedia==="function"&&matchMedia("(pointer:coarse)").matches); },
 down:0,   // 自動のとき、描画が重くて下げた段数 (0〜2)
 ultra(){ return P.gfx==="ultra"; },
 /* 画質の段 (最高は「高」と同じ扱いで、追加の効果は ultra() で見る) */
 key(){ const m=P.gfx||"auto"; let k= m==="auto"? (this.mobile()?"mid":"high") : m==="ultra"? "high" : m;
  if(m==="auto"&&this.down){ const L=["high","mid","low"]; k=L[Math.min(2,L.indexOf(k)+this.down)]; } return k; },
 cur(){ return this.ultra()? this.PRESET.ultra : this.PRESET[this.key()]||this.PRESET.high; },
 auto(){ return (P.gfx||"auto")==="auto"; },
 /* 景観の小物 (木・草・岩など) を間引くか。位置から決めるので、同じ場所は毎回同じ結果 */
 skip(x,z){ const d=this.cur().density; if(d>=1) return false; const h=Math.sin(x*12.9898+z*78.233)*43758.5453; return (h-Math.floor(h))>d; },
};
/* ============ ③ 品質監視 ============ */
/* 描画の重さに合わせて解像度を自動調整。下げるのは平均 fps が 28 未満が続いたとき、上げるのは 55 以上が続いたとき。
 解像度は端末の画素密度の範囲で 2.0 → 1.5 → 1.25 → 1.0 まで (1.0 未満には下げない)。影は 2 段階下げたら切る */
const Perf={acc:0,fr:0,lv:0,good:0,bad:0,mAcc:0,mFr:0,fps:0,
  steps(){ const d=Math.min(devicePixelRatio||1,GFX.cur().pr); return [d,1.5,1.25,1.0].filter((x,i,a)=>x<=d&&a.indexOf(x)===i); },
  apply(){ const r=View.renderer; if(!r) return; const st=this.steps(), pr=st[Math.min(this.lv,st.length-1)];
    if(Math.abs(r.getPixelRatio()-pr)>0.01){ r.setPixelRatio(pr); r.setSize(innerWidth,innerHeight); }
    r.shadowMap.enabled= GFX.cur().shadow>0&&this.lv<2; },
  reset(){ this.acc=0; this.fr=0; this.lv=0; this.good=0; this.bad=0; GFX.down=0; this.apply(); },
  /* fps の表示 (OPTIONS の「fps を表示」) */
  meter(){ const now=performance.now(); if(!this.mT) this.mT=now; this.mFr++; const el0=(now-this.mT)/1000; if(el0<0.5) return; this.fps=this.mFr/el0; this.mT=now; this.mFr=0;
    const el=document.getElementById("fps-meter"); if(!el) return; el.style.display=P.showFps?"block":"none"; if(!P.showFps) return;
    const r=View.renderer; el.textContent=`${this.fps.toFixed(this.fps<10?1:0)} fps ・ 画質 ${GFX.ultra()?"最高":({high:"高",mid:"標準",low:"低"})[GFX.key()]}${GFX.down?" (自動で下げた)":""} ・ 解像度 ${r?r.getPixelRatio().toFixed(2):"-"}${r&&r.shadowMap.enabled?"":" ・ 影なし"}`; },
  tick(dt){ this.meter(); if(!GFX.auto()) return; this.acc+=dt; this.fr++;
    if(this.acc<3) return; const fps=this.fr/this.acc; this.acc=0; this.fr=0;
    const n=this.steps().length;
    // 解像度と影を下げ切っても重いとき: 画質を 1 段ずつ下げる (高 → 標準: ポストプロセスなし / 標準 → 低: 材質を軽く)
    if(fps<24&&this.lv>=n-1&&GFX.down<2&&GFX.key()!=="low"){ if(++this.bad>=2){ this.bad=0; GFX.down++; if(GFX.key()==="low") View.lighten(); toast("描画が重いため画質を自動で下げました","#f59e0b"); } return; }
    this.bad=0;
    if(fps<28&&this.lv<n-1){ this.lv++; this.good=0; this.apply(); }
    else if(fps>55&&this.lv>0){ if(++this.good>=2){ this.lv--; this.good=0; this.apply(); } }
    else this.good=0; }};
