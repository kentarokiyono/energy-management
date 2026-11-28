"use strict";
/* ============ 近くの草 (スピニフェックス・枯れ草の株) ============
 カメラのまわり (後ろ 40 m 〜 前 220 m、道の外 1 〜 75 m) に、細い葉を束ねた株を大量に置く (1 つの形を何千回も描く方法)。
  ・置き場所は道に沿った区画 (6 m) ごとに決まった乱数で決める (同じ所に同じ株。行ったり来たりしてもちらつかない)
  ・多さと種類は土地の植生 (Scenery.floraWeights・biome の被覆) から。スピニフェックス = 低く丸い株、枯れ草 = 細く背が高い株
  ・風でそよぐ (先ほど大きく)。画質で数を減らす (標準 65 %・低 35 %)
 遠く (75 m より先) はこれまでどおり景色の部品 (PR.spinifex / PR.grass)。毎フレーム View から Grass.update */
const Grass={
 CELL:6, BACK:40, AHEAD:220, OFF0:1.2, OFF1:75, MAX:14000,
 mesh:null, cells:new Map(), dirty:false, mat:null, t:0,
 geo(){   // 株の形: 11 枚の細い葉を放射状に、外へ反らせる。aT = 根元 0 〜 先 1
  const pos=[], tt=[], col=[], idx=[]; const N=34;   // 株の内側は立ち、外側ほど寝る (丸く密な株)
  for(let i=0;i<N;i++){ const f=((i*0.618)%1), a=i*2.399+Math.sin(i*7.3)*0.3, lean=0.1+0.85*f, h=(0.55+0.45*((i*0.37)%1))*(1.05-0.45*f), w=0.045;
   const ca=Math.cos(a), sa=Math.sin(a), px=-sa, pz=ca, b=pos.length/3;
   for(let k=0;k<=3;k++){ const t=k/3, r=lean*t*t*0.9+0.05, y=h*(t-0.12*t*t), ww=w*(1-t*0.85);
    pos.push(ca*r+px*ww,y,sa*r+pz*ww, ca*r-px*ww,y,sa*r-pz*ww); tt.push(t,t); const g=0.42+0.5*t; col.push(g,g,g,g,g,g); }
   for(let k=0;k<3;k++){ const o=b+k*2; idx.push(o,o+1,o+2, o+1,o+3,o+2); } }
  const g=new THREE.BufferGeometry(); g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3)); g.setAttribute("aT",new THREE.Float32BufferAttribute(tt,1));
  g.setAttribute("color",new THREE.Float32BufferAttribute(col,3)); g.setIndex(idx); g.computeVertexNormals();
  // 法線は上向き寄りに (細い葉が真横から暗く見えない)
  const n=g.attributes.normal; for(let i=0;i<n.count;i++){ n.setXYZ(i,n.getX(i)*0.4,0.9,n.getZ(i)*0.4); } g.normalizeNormals&&g.normalizeNormals();
  return g; },
 build(view){
  const mat=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
  mat.userData.u={uTime:{value:0},uWind:{value:new THREE.Vector2(1,0)}};
  mat.onBeforeCompile=(sh)=>{ Object.assign(sh.uniforms,mat.userData.u);
   sh.vertexShader="attribute float aT;\nuniform float uTime;\nuniform vec2 uWind;\n"+sh.vertexShader.replace("#include <begin_vertex>",`#include <begin_vertex>
   #ifdef USE_INSTANCING
   { float ph=instanceMatrix[3].x*0.23+instanceMatrix[3].z*0.19; float s=sin(uTime*1.9+ph)*0.6+sin(uTime*3.7+ph*1.7)*0.25+0.35;
     transformed.xz+=uWind*s*0.10*aT*aT; }
   #endif`).replace("#include <lights_lambert_vertex>","#include <lights_lambert_vertex>\n#ifdef DOUBLE_SIDED\nvLightBack=vLightFront;\n#ifndef PHYSICALLY_CORRECT_LIGHTS\n#endif\nvIndirectBack=vIndirectFront;\n#endif"); };   // 葉の裏も表と同じ明るさ (裏側が黒く見えない)
  this.mat=mat;
  const m=new THREE.InstancedMesh(this.geo(),mat,this.MAX); m.count=0; m.frustumCulled=false; m.receiveShadow=true; m.castShadow=false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(this.MAX*3),3); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
  view.scene.add(m); this.mesh=m; this.scene=view.scene; this.reset(); },   // 走り直し (新しい場面) では区画を作り直す
 reset(){ this.cells.clear(); this.dirty=true; },
 /* 区画 i (s = i·CELL) の株: [x,y,z, 回転, 横の大きさ, 縦の大きさ, r,g,b] の並び */
 cell(view,i){
  const out=[], s0=i*this.CELL; if(s0<0||s0>view.road.builtS-1) return out;
  const km=view.kmOfS(s0+this.CELL/2); if(typeof Route!=="undefined"&&Route.zoneFade&&Route.zoneFade(km)<0.99) return out;   // 町の右左折の区間・CS の構内は置かない
  const bio=biomeAt(km); if(bio.urban) return out;
  const fw=Scenery.floraWeights(km), sp=fw.spinifex||0, gr=fw.grass||0, sb=(fw.saltbush||0)*0.5, tot=sp+gr+sb;
  if(tot<0.05) return out;
  const k=typeof GFX!=="undefined"? GFX.cur().density : 1, SH=view.SHOULDER;
  let seed=(i*2654435761)>>>0; const rnd=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
  const n=Math.round(Math.min(1.4,tot)*(0.45+0.6*bio.cov)*200*k);
  const c=new THREE.Color();
  for(let j=0;j<n;j++){
   const sd=rnd()<0.5?-1:1, off=sd*(SH+this.OFF0+Math.pow(rnd(),1.45)*(this.OFF1-this.OFF0)), s=s0+rnd()*this.CELL;
   if(Scenery.salt(km,off)) continue;
   const q=Scenery.at(view,s,off); if(!Number.isFinite(q.y)) continue;
   // まばらにまとまる (広い濃淡)
   if(vnoise(q.x*0.045+1.3,q.z*0.045-2.1)<0.18+0.3*(1-bio.cov)) continue;
   const r=rnd()*tot; let kind= r<sp? 0 : r<sp+gr? 1 : 2;
   const big=0.75+rnd()*0.6;
   let sx,sy;
   if(kind===0){ sx=(0.6+rnd()*0.5)*big; sy=(0.5+rnd()*0.25)*big; c.setHex(rnd()<0.6?0x8c8a48:0x7c8550); }        // スピニフェックス: 低く丸い、くすんだ黄緑
   else if(kind===1){ sx=(0.35+rnd()*0.2)*big; sy=(0.9+rnd()*0.8)*big; c.setHex(rnd()<0.7?0xb39758:0x9c8754); }      // 枯れ草: 細く高い、麦わら色
   else { sx=(0.6+rnd()*0.3)*big; sy=(0.4+rnd()*0.2)*big; c.setHex(rnd()<0.5?0x7f8a70:0x8b958c); }                  // ソルトブッシュ: 灰緑
   const v=(0.7+rnd()*0.3)*0.8; c.r*=v; c.g*=v; c.b*=v;
   out.push(q.x,q.y-0.03,q.z,rnd()*6.283,sx,sy,c.r,c.g,c.b); }
  return out; },
 _m:new THREE.Matrix4(), _q:new THREE.Quaternion(), _e:new THREE.Euler(), _p:new THREE.Vector3(), _s:new THREE.Vector3(),
 update(view,es,dtR){
  const on=P.mode==="race"&&view.road&&view.scene&&!P.event;
  if(!on){ if(this.mesh) this.mesh.visible=false; return; }
  if(!this.mesh||this.scene!==view.scene) this.build(view);
  if(this._road!==view.road){ this._road=view.road; this.reset(); }   // 道を作り直した (別の場所から走る)
  this.mesh.visible=true;
  if(this._gfx!==GFX.key()){ this._gfx=GFX.key(); this.reset(); }
  if(this._lastS!=null&&Math.abs(view.s-this._lastS)>400) this.reset(); this._lastS=view.s;   // 場所が飛んだ
  const a=Math.floor((view.s-this.BACK)/this.CELL), b=Math.floor((view.s+this.AHEAD)/this.CELL);
  for(const key of [...this.cells.keys()]) if(key<a||key>b){ this.cells.delete(key); this.dirty=true; }
  let made=0; for(let i=a;i<=b&&made<8;i++) if(!this.cells.has(i)){ this.cells.set(i,this.cell(view,i)); made++; this.dirty=true; }   // 1 フレームに 8 区画まで (重くならない)
  if(this.dirty){ this.dirty=false; const M=this.mesh, cl=M.instanceColor.array; let n=0;
   for(const arr of this.cells.values()) for(let j=0;j<arr.length&&n<this.MAX;j+=9,n++){
    this._e.set(0,arr[j+3],0); this._q.setFromEuler(this._e); this._p.set(arr[j],arr[j+1],arr[j+2]); this._s.set(arr[j+4],arr[j+5],arr[j+4]);
    this._m.compose(this._p,this._q,this._s); M.setMatrixAt(n,this._m); cl[n*3]=arr[j+6]; cl[n*3+1]=arr[j+7]; cl[n*3+2]=arr[j+8]; }
   M.count=n; M.instanceMatrix.needsUpdate=true; M.instanceColor.needsUpdate=true; }
  // 風: 横風の向きと強さでそよぐ
  this.t+=dtR; const u=this.mat.userData.u; u.uTime.value=this.t;
  const w=Math.min(1.6,0.4+Math.abs(es.lastCross||0)/8); u.uWind.value.set(Math.cos(view.ch)*w,Math.sin(view.ch)*w);
 },
};
