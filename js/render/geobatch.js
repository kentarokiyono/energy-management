"use strict";
/* ============ 静的ジオメトリ結合 (チャンク単位で1マテリアル=1ドローコール) ============ */
function _tpl(geo,flat=true){
let g=geo.index? geo.toNonIndexed() : geo;
if(flat) g.computeVertexNormals();
return { p:g.attributes.position.array, n:g.attributes.normal.array, uv:g.attributes.uv?g.attributes.uv.array:null, c:g.attributes.color?g.attributes.color.array:null };
}
/* 岩の形 (4 種): 正 20 面体を細かくしてノイズででこぼこにし、平面で何か所か割って (角ばった割れ面)、底を平らに (半分埋まる)。
 頂点の明るさ: 上は日に焼けて明るく、下と割れ面のくぼみは暗く、黒っぽい筋 (砂漠の岩の表面の黒い膜)。round=1 は丸く風化した花崗岩 (なめらか) */
function _rockGeo(seed,round){
 let sd=seed*7919+13; const R=()=>((sd=(sd*16807)%2147483647)/2147483647);
 const g0=new THREE.IcosahedronGeometry(1,round?3:2), P=g0.attributes.position, v=new THREE.Vector3();
 const ph=[R()*9,R()*9,R()*9], planes=[]; if(!round) for(let k=0;k<3;k++){ const n=new THREE.Vector3(R()-0.5,R()*0.6-0.1,R()-0.5).normalize(); planes.push([n,0.45+R()*0.35]); }
 const nz=(x,y,z)=>Math.sin(x*2.1+ph[0])*Math.sin(y*2.7+ph[1])*Math.sin(z*2.3+ph[2])+0.5*Math.sin(x*5.3+ph[1])*Math.sin(y*4.9+ph[2])*Math.sin(z*5.7+ph[0]);
 for(let i=0;i<P.count;i++){ v.fromBufferAttribute(P,i);
  v.multiplyScalar(1+(round?0.13:0.22)*nz(v.x,v.y,v.z)+(round?0:0.06*Math.sin(v.x*11+v.z*9)));
  for(const [n,d] of planes){ const t=v.dot(n); if(t>d) v.addScaledVector(n,d-t); }
  if(v.y<-0.35) v.y=-0.35-(v.y+0.35)*0.1;
  P.setXYZ(i,v.x,v.y,v.z); }
 const g=g0.toNonIndexed(); if(round) { const gi=g0.clone(); gi.computeVertexNormals(); const gn=gi.toNonIndexed(); g.setAttribute("normal",gn.attributes.normal); } else g.computeVertexNormals();
 const Q=g.attributes.position, col=new Float32Array(Q.count*3);
 for(let i=0;i<Q.count;i++){ const x=Q.getX(i), y=Q.getY(i), z=Q.getZ(i);
  let k=0.62+0.45*Math.min(1,Math.max(0,(y+0.35)/1.2));
  k*=1-0.5*Math.max(0,Math.sin(x*3.1+z*2.3+ph[0]*3)*Math.sin(y*(round?5:9)+ph[2]))**2;   // 黒い筋 (上から垂れる)
  k*=0.85+0.3*Math.abs(Math.sin(x*13+y*7+z*11+ph[1])*Math.sin(x*5-z*8+ph[2]));
  const li=Math.max(0,Math.sin(x*4.3+ph[1])*Math.sin(z*3.7+ph[0])*Math.sin(y*2.9+ph[2]+1)-0.15)*2.2;   // 灰色のまだら (赤い色を抜く)
  col[i*3]=k*(1-0.22*li); col[i*3+1]=k*(0.98-0.02*li); col[i*3+2]=k*(0.95+0.45*li); }
 g.setAttribute("color",new THREE.BufferAttribute(col,3));
 return g;
}
const TPL={};
function tpl(name){
if(TPL[name]) return TPL[name];
let g;
switch(name){
case "ico0": g=new THREE.IcosahedronGeometry(1,0); break;
case "ico1": g=new THREE.IcosahedronGeometry(1,1); break;
case "dode": g=new THREE.DodecahedronGeometry(1,0); break;
case "cone5": g=new THREE.ConeGeometry(1,1,5,1); g.translate(0,0.5,0); break;
case "cone7": g=new THREE.ConeGeometry(1,1,7,1); g.translate(0,0.5,0); break;
case "cyl5": g=new THREE.CylinderGeometry(1,1,1,5,1); g.translate(0,0.5,0); break;
case "cyl8": g=new THREE.CylinderGeometry(1,1,1,8,1); g.translate(0,0.5,0); break;
case "cyl12": g=new THREE.CylinderGeometry(1,1,1,12,1); g.translate(0,0.5,0); break;
case "trunk": g=new THREE.CylinderGeometry(0.55,1,1,6,1,true); g.translate(0,0.5,0); break;
case "blade": g=new THREE.ConeGeometry(1,1,3,1,true); g.translate(0,0.5,0); break;
case "box": g=new THREE.BoxGeometry(1,1,1); g.translate(0,0.5,0); break;
case "boxC": g=new THREE.BoxGeometry(1,1,1); break;
case "plane": g=new THREE.PlaneGeometry(1,1); break;
case "rock0": case "rock1": case "rock2": case "rock3": TPL[name]=_tpl(_rockGeo(+name[4]+1,0),false); return TPL[name];
case "boulder0": case "boulder1": TPL[name]=_tpl(_rockGeo(+name[7]+11,1),false); return TPL[name];
case "cabin": { // 車の客室: 幅 1・高さ 1・長さ 1 の箱の上面を前後左右にすぼめた形 (前のガラスは寝て、後ろは少し立つ)。底面中心が原点
 const B=[[-0.5,0,-0.5],[0.5,0,-0.5],[0.5,0,0.5],[-0.5,0,0.5]], T=[[-0.42,1,-0.1],[0.42,1,-0.1],[0.42,1,0.32],[-0.42,1,0.32]], pos=[];
 const q=(a,b,c,d)=>pos.push(...a,...b,...c,...a,...c,...d);
 q(T[0],T[3],T[2],T[1]); q(B[0],B[1],B[2],B[3]); q(B[0],T[0],T[1],B[1]); q(B[2],T[2],T[3],B[3]); q(B[1],T[1],T[2],B[2]); q(B[3],T[3],T[0],B[0]);
 g=new THREE.BufferGeometry(); g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3)); break; }
case "leaves": { // 葉の房: 細長い葉 (ひし形) を半径 1 の球の中に向きばらばらに散らす。法線は房の外向き (塊に見えず、ふんわり明暗)
 const pos=[],nor=[]; let sd=12345; const R=()=>{ sd=(sd*1664525+1013904223)>>>0; return sd/4294967296; };
 for(let i=0;i<26;i++){
  let cx,cy,cz; do{ cx=R()*2-1; cy=R()*2-1; cz=R()*2-1; }while(cx*cx+cy*cy+cz*cz>1);
  const a=R()*6.283, e=(R()-0.3)*1.4, L=0.55+R()*0.25, W=0.14+R()*0.06;
  const dx=Math.cos(a)*Math.cos(e)*L, dy=Math.sin(e)*L, dz=Math.sin(a)*Math.cos(e)*L;   // 葉の向き
  const sa=R()*6.283, wx=-Math.sin(a)*Math.cos(sa)*W, wy=Math.sin(sa)*W, wz=Math.cos(a)*Math.cos(sa)*W;   // 葉の幅の向き (ねじれ)
  const P0=[cx-dx/2,cy-dy/2,cz-dz/2], P1=[cx+wx,cy+wy,cz+wz], P2=[cx+dx/2,cy+dy/2,cz+dz/2], P3=[cx-wx,cy-wy,cz-wz];
  const nl=Math.hypot(cx,cy+0.4,cz)||1, N=[cx/nl,(cy+0.4)/nl,cz/nl];
  pos.push(...P0,...P1,...P2, ...P0,...P2,...P3); for(let k=0;k<6;k++) nor.push(...N);
 }
 g=new THREE.BufferGeometry(); g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3)); g.setAttribute("normal",new THREE.Float32BufferAttribute(nor,3));
 TPL[name]=_tpl(g,false); return TPL[name]; }
case "frond": { // 垂れ下がるヤシの葉(先端に向かって細く下がる)
 const pos=[],uv=[]; const N=5;
 for(let i=0;i<N;i++){
  const t0=i/N,t1=(i+1)/N;
  const w0=0.22*Math.sin(Math.PI*Math.min(1,t0*1.1+0.08)), w1=0.22*Math.sin(Math.PI*Math.min(1,t1*1.1+0.08));
  const y0=-0.55*t0*t0, y1=-0.55*t1*t1;
  pos.push(-w0,y0,t0, w0,y0,t0, w1,y1,t1, -w0,y0,t0, w1,y1,t1, -w1,y1,t1);
  uv.push(0,t0,1,t0,1,t1,0,t0,1,t1,0,t1);
 }
 g=new THREE.BufferGeometry(); g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
 g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2)); break; }
case "hiproof": { // 寄棟屋根 (幅1×奥行1、棟は奥行方向、高さ1)
 const r=0.5, k=0.18; // 棟の長さ比
 const A=[-r,0,-r],B=[r,0,-r],C=[r,0,r],D=[-r,0,r],E=[0,1,-k],F=[0,1,k];
 const tri=(a,b,c)=>[...a,...b,...c];
 const pos=[...tri(A,E,B),...tri(C,F,D),...tri(B,E,F),...tri(B,F,C),...tri(D,F,E),...tri(D,E,A)];
 g=new THREE.BufferGeometry(); g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
 const uv=[]; for(let i=0;i<pos.length;i+=3) uv.push(pos[i]+0.5,pos[i+2]+0.5);
 g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2)); break; }
case "gable": { // 切妻屋根 (棟は奥行z方向)
 const r=0.5;
 const pos=[ -r,0,-r, 0,1,-r, r,0,-r,   -r,0,r, r,0,r, 0,1,r,
   -r,0,-r, -r,0,r, 0,1,r,  -r,0,-r, 0,1,r, 0,1,-r,
   r,0,-r, 0,1,-r, 0,1,r,   r,0,-r, 0,1,r, r,0,r ];
 g=new THREE.BufferGeometry(); g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
 const uv=[]; for(let i=0;i<pos.length;i+=3) uv.push(pos[i+2]+0.5,pos[i+1]);
 g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2)); break; }
}
TPL[name]=_tpl(g);
return TPL[name];
}
/* メートル単位UVの箱 (ファサード/煉瓦テクスチャを実寸でタイル) 底面中心が原点 */
function boxMetric(w,h,d,uScale=1,vScale=1){
const g=new THREE.BoxGeometry(w,h,d); g.translate(0,h/2,0);
const uv=g.attributes.uv;
const dims=[[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];
for(let f=0;f<6;f++) for(let k=0;k<4;k++){ const i=f*4+k;
 uv.setXY(i, uv.getX(i)*dims[f][0]/uScale, uv.getY(i)*dims[f][1]/vScale); }
return _tpl(g);
}
const _gbM=new THREE.Matrix4(), _gbN=new THREE.Matrix3(), _gbQ=new THREE.Quaternion(), _gbE=new THREE.Euler(),
 _gbP=new THREE.Vector3(), _gbS=new THREE.Vector3(), _gbC=new THREE.Color();
/* 位置/スケール/回転(ry,rx,rz)から行列 */
function M4(x,y,z,sx,sy,sz,ry=0,rx=0,rz=0){
_gbE.set(rx,ry,rz,"YXZ"); _gbQ.setFromEuler(_gbE);
_gbP.set(x,y,z); _gbS.set(sx,sy,sz);
return _gbM.compose(_gbP,_gbQ,_gbS);
}
/* sRGB16進 → linear (色ジッタ付き) */
function linCol(hex,jit=0){
_gbC.setHex(hex);
if(jit){ const k=1+(rnd()-0.5)*2*jit; _gbC.r*=k; _gbC.g*=k*(1+(rnd()-0.5)*jit*0.4); _gbC.b*=k; }
_gbC.convertSRGBToLinear();
return _gbC;
}
class GeoBatch{
constructor(ao=0){ this.p=[]; this.n=[]; this.c=[]; this.uv=[]; this.ao=ao; }
/* t: tpl()/boxMetric() / m: Matrix4 / col: THREE.Color(linear) */
add(t,m,col,uvs=1){
const e=m.elements; _gbN.getNormalMatrix(m); const ne=_gbN.elements;
const P=t.p,N=t.n,U=t.uv,TC=t.c; let r=col.r,g=col.g,b=col.b; const r0=r,g0=g,b0=b;
// 根元の暗がり (焼き込み): 置いた物の一番下から少しの高さまで色を暗くする (地面との接地感・葉の房の下側の陰)
let y0=0, zone=0; if(this.ao){ let lo=Infinity, hi=-Infinity; for(let i=1;i<P.length;i+=3){ const wy=e[1]*P[i-1]+e[5]*P[i]+e[9]*P[i+1]+e[13]; if(wy<lo) lo=wy; if(wy>hi) hi=wy; }
 if(hi-lo>0.3){ y0=lo; zone=Math.min(0.7,(hi-lo)*0.3); } }
for(let i=0,j=0;i<P.length;i+=3,j+=2){
 const x=P[i],y=P[i+1],z=P[i+2], wy=e[1]*x+e[5]*y+e[9]*z+e[13];
 if(TC){ r=r0*TC[i]; g=g0*TC[i+1]; b=b0*TC[i+2]; }   // 型に頂点ごとの明るさがあるとき (岩)
 this.p.push(e[0]*x+e[4]*y+e[8]*z+e[12], wy, e[2]*x+e[6]*y+e[10]*z+e[14]);
 const nx=N[i],ny=N[i+1],nz=N[i+2];
 let ax=ne[0]*nx+ne[3]*ny+ne[6]*nz, ay=ne[1]*nx+ne[4]*ny+ne[7]*nz, az=ne[2]*nx+ne[5]*ny+ne[8]*nz;
 const l=Math.hypot(ax,ay,az)||1; this.n.push(ax/l,ay/l,az/l);
 if(zone>0){ const t=Math.min(1,(wy-y0)/zone), k=1-this.ao*(1-t*t*(3-2*t)); if(this.dust) this.c.push(r*k,g*Math.pow(k,1.35),b*Math.pow(k,1.8)); else this.c.push(r*k,g*k,b*k); } else this.c.push(r,g,b);   // 壁は赤土の汚れ色で
 if(U) this.uv.push(U[j]*uvs,U[j+1]*uvs); else this.uv.push(0,0);
}
}
get empty(){ return this.p.length===0; }
mesh(mat,{cast=false,receive=true}={}){
const g=new THREE.BufferGeometry();
g.setAttribute("position",new THREE.Float32BufferAttribute(this.p,3));
g.setAttribute("normal",new THREE.Float32BufferAttribute(this.n,3));
g.setAttribute("color",new THREE.Float32BufferAttribute(this.c,3));
g.setAttribute("uv",new THREE.Float32BufferAttribute(this.uv,2));
g.computeBoundingSphere();
const m=new THREE.Mesh(g,mat); m.castShadow=cast; m.receiveShadow=receive; m.matrixAutoUpdate=false;
return m;
}
}
/* マテリアル名→GeoBatch の束 */
class BatchSet{
constructor(){ this.b={}; }
get(name){ if(!this.b[name]){ const g=new GeoBatch(BatchSet.AO[name]||0); g.dust=BatchSet.DUST.includes(name); this.b[name]=g; } return this.b[name]; }
toGroup(grp){
for(const k in this.b){ const bt=this.b[k]; if(bt.empty) continue;
 const def=SceneMats.get(k);
 grp.add(bt.mesh(def.mat,{cast:def.cast,receive:true})); }
return grp;
}
}
BatchSet.AO={veg:0.4,bark:0.35,solid:0.32,solidDS:0.25,brick:0.3,corr:0.25,resi:0.3,shop:0.3,office:0.25};   // 根元の暗さ (材質ごと)
BatchSet.DUST=["solid","brick","corr","resi","shop"];   // 根元を赤土の色で汚す材質
