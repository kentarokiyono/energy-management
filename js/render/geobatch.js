"use strict";
/* ============ 静的ジオメトリ結合 (チャンク単位で1マテリアル=1ドローコール) ============ */
function _tpl(geo,flat=true){
let g=geo.index? geo.toNonIndexed() : geo;
if(flat) g.computeVertexNormals();
return { p:g.attributes.position.array, n:g.attributes.normal.array, uv:g.attributes.uv?g.attributes.uv.array:null };
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
constructor(){ this.p=[]; this.n=[]; this.c=[]; this.uv=[]; }
/* t: tpl()/boxMetric() / m: Matrix4 / col: THREE.Color(linear) */
add(t,m,col,uvs=1){
const e=m.elements; _gbN.getNormalMatrix(m); const ne=_gbN.elements;
const P=t.p,N=t.n,U=t.uv, r=col.r,g=col.g,b=col.b;
for(let i=0,j=0;i<P.length;i+=3,j+=2){
 const x=P[i],y=P[i+1],z=P[i+2];
 this.p.push(e[0]*x+e[4]*y+e[8]*z+e[12], e[1]*x+e[5]*y+e[9]*z+e[13], e[2]*x+e[6]*y+e[10]*z+e[14]);
 const nx=N[i],ny=N[i+1],nz=N[i+2];
 let ax=ne[0]*nx+ne[3]*ny+ne[6]*nz, ay=ne[1]*nx+ne[4]*ny+ne[7]*nz, az=ne[2]*nx+ne[5]*ny+ne[8]*nz;
 const l=Math.hypot(ax,ay,az)||1; this.n.push(ax/l,ay/l,az/l);
 this.c.push(r,g,b);
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
get(name){ return this.b[name]||(this.b[name]=new GeoBatch()); }
toGroup(grp){
for(const k in this.b){ const bt=this.b[k]; if(bt.empty) continue;
 const def=SceneMats.get(k);
 grp.add(bt.mesh(def.mat,{cast:def.cast,receive:true})); }
return grp;
}
}
