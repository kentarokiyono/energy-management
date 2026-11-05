"use strict";
/* ============ ④ YATA(61)プロシージャルhull ============ */
const YATA_CACHE={};
/* 側面の塗り分け (u: 0=先端 1=後端, zn: 0=下端 1=上端) → "O"オレンジ / "K"黒 / "W"白 */
function yataLivery(u,zn){
 if(u<0.045) return "O";                                   // 先端
 if(zn>0.86) return "O";                                   // 上縁のオレンジ
 if(u<0.10&&zn<0.35) return "O";                           // 先端の下側 (下から見たオレンジのノーズ)
 if(u>=0.34&&zn<0.09) return "K";                          // 下端の黒
 if(u>0.60&&zn<0.09+Math.min(1,(u-0.60)/0.02)*0.13) return "K";  // 後部で段差状に太くなる黒
 const st=(z0,z1,us)=>zn>=z0&&zn<z1&&u>us-(zn-z0)*0.08;   // 後部の黒ストライプ (前端が斜め)
 if(st(0.40,0.52,0.70)||st(0.62,0.73,0.80)) return "K";
 return "W";
}
/* BD (任意): 車両諸元の body。{L, noseTip, canopy:{x,len,w,top}, orangeU, skirtZ, profiles:{halfW,hullW,zPanel,zHull,zBell}}
 profiles は [u (0=先端,1=後端), 値 m] の列 (halfW/hullW は半幅, z* は地面からの高さ) */
function buildYATA(BD){
BD=BD||{};
const O=Object.assign({L:5,noseTip:.23,canopyX:1.83,canopyLen:1.55,canopyW:.44,canopyTop:1.15,orangeU:.16,skirtZ:.30,seg:48,side:10,deckK:4},
 BD.L!=null?{L:BD.L}:{}, BD.noseTip!=null?{noseTip:BD.noseTip}:{}, BD.orangeU!=null?{orangeU:BD.orangeU}:{}, BD.skirtZ!=null?{skirtZ:BD.skirtZ}:{},
 BD.canopy?{canopyX:BD.canopy.x,canopyLen:BD.canopy.len,canopyW:BD.canopy.w,canopyTop:BD.canopy.top}:{});
const PF=BD.profiles||{};
const LIV=!!BD.livery;                       // 実車の塗り分け (側面: 白地・上縁オレンジ・下端黒・後部の黒ストライプ)
const BF=BD.sectionBottom;
const PG=BD.panelGap!=null?BD.panelGap:0.06;   // パネルと胴体上面のすき間 [m]                   // 断面: 底辺の幅の割合 (台形断面, 上ほど広い)。未指定なら丸い断面
if(LIV){ O.seg=120; O.side=26; }
if(!YATA_CACHE.tex){
let cv=document.createElement("canvas");cv.width=cv.height=256;
let g=cv.getContext("2d");g.fillStyle="#0b0f13";g.fillRect(0,0,256,256);
g.strokeStyle="#232e38";g.lineWidth=3;
for(let i=0;i<=8;i++){g.beginPath();g.moveTo(i*32,0);g.lineTo(i*32,256);g.stroke();
g.beginPath();g.moveTo(0,i*32);g.lineTo(256,i*32);g.stroke();}
g.strokeStyle="rgba(255,255,255,.05)";g.lineWidth=1;
for(let i=0;i<32;i++){g.beginPath();g.moveTo(i*8,0);g.lineTo(i*8,256);g.stroke();}
const ct=new THREE.CanvasTexture(cv);ct.wrapS=ct.wrapT=THREE.RepeatWrapping;
ct.anisotropy=8;ct.encoding=THREE.sRGBEncoding;
cv=document.createElement("canvas");cv.width=256;cv.height=128;g=cv.getContext("2d");
const rd=g.createRadialGradient(128,64,10,128,64,120);
rd.addColorStop(0,"rgba(0,0,0,.5)");rd.addColorStop(1,"rgba(0,0,0,0)");
g.fillStyle=rd;g.fillRect(0,0,256,128);
YATA_CACHE.tex={cell:ct,shadow:new THREE.CanvasTexture(cv)};
}
const T=YATA_CACHE.tex;
const spl=a=>{const c=new THREE.SplineCurve(a.map(p=>new THREE.Vector2(p[0],p[1])));
const S=c.getPoints(240);
return u=>{u=clamp(u,0,1);
let lo=0,hi=S.length-1;
while(lo<hi){const mid=(lo+hi)>>1;if(S[mid].x<u)lo=mid+1;else hi=mid;}
const b=S[lo],p=S[Math.max(0,lo-1)],f=clamp((u-p.x)/((b.x-p.x)||1e-6),0,1);
return lerp(p.y,b.y,f);};};
const halfW=spl(PF.halfW||[[0,.001],[.05,.16],[.16,.44],[.30,.62],[.45,.85],[.60,.90],[.75,.86],[.90,.78],[1,.70]]);
const hullW=spl(PF.hullW||[[0,.001],[.06,.10],[.16,.30],[.30,.44],[.50,.58],[.70,.52],[.85,.40],[1,.26]]);
const zPanel=spl(PF.zPanel||[[0,.30],[.10,.45],[.25,.60],[.50,.62],[.75,.60],[.90,.60],[1,.58]]);
const zHull=spl(PF.zHull||[[0,.24],[.15,.38],[.35,.48],[.60,.50],[.80,.44],[1,.34]]);
const zBell=spl(PF.zBell||[[0,O.noseTip],[.12,.20],[.30,.145],[.60,.15],[.80,.20],[1,.28]]);
const HL=O.L/2;   // 車体中心 (z=0) から先端までの距離
const DS=THREE.DoubleSide;
const matWhite=new THREE.MeshStandardMaterial({color:0xe8eaee,roughness:.5,side:DS,envMapIntensity:.3});
const matOrange=new THREE.MeshStandardMaterial({color:BD.livery?0xe2560a:0xf27316,roughness:.45,side:DS,envMapIntensity:.35});
const matSkirt=new THREE.MeshStandardMaterial({color:0x101216,roughness:.5,side:DS});
const matArray=new THREE.MeshPhysicalMaterial({color:0x0b0e12,roughness:.42,clearcoat:.5,clearcoatRoughness:.25,map:T.cell,side:DS,envMapIntensity:.35});
const grp=new THREE.Group();
const mkB=mat=>({mat,v:[],uv:[],idx:[],map:new Map()});
const vid=(b,Pp,Uv,i,r)=>{const k=i*1000+r;let id=b.map.get(k);
if(id===undefined){id=b.v.length/3;b.map.set(k,id);
b.v.push(Pp[i][r].x,Pp[i][r].y,Pp[i][r].z);b.uv.push(Uv[i][r].x,Uv[i][r].y);}return id;};
const finish=b=>{if(!b.idx.length)return;
const g2=new THREE.BufferGeometry();
g2.setAttribute("position",new THREE.Float32BufferAttribute(b.v,3));
g2.setAttribute("uv",new THREE.Float32BufferAttribute(b.uv,2));
g2.setIndex(b.idx);g2.computeVertexNormals();
const ms=new THREE.Mesh(g2,b.mat);ms.castShadow=true;grp.add(ms);};
/* ==== ハル(閉じた立体。上面はハル上端で閉じる) ==== */
{
const bW=mkB(matWhite),bO=mkB(matOrange),bS=mkB(matSkirt);
const R=2*(O.side+O.deckK)-1,Pp=[],Uv=[],TYP=[];
for(let i=0;i<=O.seg;i++){
const u=i/O.seg,xl=u*O.L,wh=hullW(u),zb=zBell(u),hd=zHull(u),zPos=xl-HL;
const pts=[],typ=[];
pts.push(new THREE.Vector3(0,zb,zPos));
for(let r=1;r<=O.side;r++){const t=r/O.side;
pts.push(BF!=null? new THREE.Vector3(wh*(BF+(1-BF)*t),zb+(hd-zb)*t,zPos) : new THREE.Vector3(wh*Math.pow(Math.sin(t*Math.PI/2),.85),zb+(hd-zb)*Math.pow(t,1.25),zPos));typ.push("S");}
for(let d=1;d<=O.deckK;d++){const s2=d/O.deckK;
pts.push(new THREE.Vector3(wh*(1-s2),hd,zPos));typ.push("K");}
for(let d=O.deckK-1;d>=1;d--){const s2=d/O.deckK;
pts.push(new THREE.Vector3(-wh*(1-s2),hd,zPos));typ.push("K");}
for(let r=O.side-1;r>=1;r--){const t=r/O.side;
pts.push(BF!=null? new THREE.Vector3(-wh*(BF+(1-BF)*t),zb+(hd-zb)*t,zPos) : new THREE.Vector3(-wh*Math.pow(Math.sin(t*Math.PI/2),.85),zb+(hd-zb)*Math.pow(t,1.25),zPos));typ.push("S");}
typ.push("S");
Pp.push(pts);Uv.push(pts.map(p=>new THREE.Vector2(xl,p.x+.9)));TYP.push(typ);
}
for(let i=0;i<O.seg;i++)for(let r=0;r<R;r++){
const r2=(r+1)%R,u=i/O.seg;
const zm=(Pp[i][r].y+Pp[i][r2].y)/2;
let b=TYP[i][r]==="K"?bS:(u<O.orangeU?bO:(zm<O.skirtZ?bS:bW));
if(LIV&&TYP[i][r]!=="K"){ const uc=(i+.5)/O.seg, zb2=zBell(uc), hd2=zHull(uc), zn=clamp((zm-zb2)/Math.max(.01,hd2-zb2),0,1);
 let c=yataLivery(uc,zn); if(c==="O"&&zn>0.86&&hullW(uc)<halfW(uc)-0.05) c="W";   // デッキより細い後部では上縁のオレンジは出さない
 if(BF!=null&&(r===0||r===R-1)) c= uc<0.10? "O" : "K";   // 底面 (平らな部分): 黒。先端だけオレンジ
 b= c==="O"?bO : c==="K"?bS : bW; }
const a=vid(b,Pp,Uv,i,r),c=vid(b,Pp,Uv,i,r2),d=vid(b,Pp,Uv,i+1,r2),e=vid(b,Pp,Uv,i+1,r);
b.idx.push(a,c,e,c,d,e);
}
{const i=O.seg,n=Pp[i].length;
const cid=bS.v.length/3;bS.v.push(0,(zBell(1)+zHull(1))/2,O.L-HL);bS.uv.push(O.L,.9);
for(let r=0;r<n;r++){const a=vid(bS,Pp,Uv,i,r),c=vid(bS,Pp,Uv,i,(r+1)%n);bS.idx.push(cid,a,c);}}
finish(bW);finish(bO);finish(bS);
// ナンバープレート (後端の平らな面)
if(BD.plate){ const cv=document.createElement("canvas"); cv.width=256; cv.height=92; const c=cv.getContext("2d");
 c.fillStyle="#f4f1ea"; c.fillRect(0,0,256,92); c.strokeStyle="#c2410c"; c.lineWidth=6; c.strokeRect(4,4,248,84);
 c.fillStyle="#111"; c.font="bold 58px Arial,sans-serif"; c.textAlign="center"; c.textBaseline="middle"; c.fillText(BD.plate,128,50);
 const tx=new THREE.CanvasTexture(cv); tx.encoding=THREE.sRGBEncoding;
 const pl=new THREE.Mesh(new THREE.PlaneGeometry(.30,.108),new THREE.MeshStandardMaterial({map:tx,roughness:.6,side:DS}));
 pl.position.set(0,zHull(1)-.062,O.L-HL+.004); grp.add(pl); }
}
/* ==== パネル翼(ハルより≥6cm上の独立フラット面=構造的にZファイティング不可) ==== */
{
const bA=mkB(matArray),bO=mkB(matOrange),PW=6,Gp=[],Uv=[];
for(let i=0;i<=O.seg;i++){
const u=i/O.seg,xl=u*O.L,wa=halfW(u);
const ap=Math.max(zPanel(u),zHull(u)+PG),zPos=xl-HL;
const row=[];
for(let j=0;j<=PW;j++){const x=wa*(j/PW*2-1);row.push(new THREE.Vector3(x,ap,zPos));}
Gp.push(row);Uv.push(row.map(p=>new THREE.Vector2(xl,p.x+.9)));
}
const vid2=(b,i,j)=>{const k=i*100+j;let id=b.map.get(k);
if(id===undefined){id=b.v.length/3;b.map.set(k,id);
b.v.push(Gp[i][j].x,Gp[i][j].y,Gp[i][j].z);b.uv.push(Uv[i][j].x,Uv[i][j].y);}return id;};
const u0=(O.canopyX-O.canopyLen*0.52)/O.L, u1=(O.canopyX+canopyLenSafe())/O.L, wc=O.canopyW*0.46;
function canopyLenSafe(){return O.canopyLen*0.52;}
for(let i=0;i<O.seg;i++)for(let j=0;j<PW;j++){
const uc=(i+0.5)/O.seg;
const xc=((j+0.5)/PW*2-1)*((halfW(i/O.seg)+halfW((i+1)/O.seg))*0.5);
if(uc>u0&&uc<u1&&Math.abs(xc)<wc) continue; // キャノピー開口はパネルをくり抜く
const b=(i/O.seg)<O.orangeU?bO:bA;
const a=vid2(b,i,j),c=vid2(b,i,j+1),d=vid2(b,i+1,j+1),e=vid2(b,i+1,j);
b.idx.push(a,c,e,c,d,e);
}
finish(bA);finish(bO);
}
/* ==== キャノピー ==== */
let canopy=null;
if(BD.canopyShape==="yata61"){
 // 横: 前は低く斜めに立ち上がり、上面は丸く平ら、後端はほぼ垂直。前: 側面が立った細い形 (上は丸い)
 const uC=O.canopyX/O.L, apC=Math.max(zPanel(uC),zHull(uC)+PG), Hc=O.canopyTop-apC+0.03;
 const z0=O.canopyX-O.canopyLen/2-HL, Lc=O.canopyLen, NU=40, NT=28;
 const hf=u=> u<0.5? Math.sin(Math.PI/2*Math.pow(u/0.5,0.8)) : u<0.93? 1-0.08*Math.pow((u-0.5)/0.43,2) : 0.92*(1-(u-0.93)/0.07*0.25);
 const wf=u=> u<0.35? 0.55+0.45*Math.sin(Math.PI/2*u/0.35) : 1;
 const pos=[],uv=[],grp0=[],grp1=[], NN=n=>{ const r=[]; return r; };
 const vtx=(iu,it)=>iu*(NT+1)+it;
 for(let iu=0;iu<=NU;iu++){ const u=iu/NU, h=Hc*hf(u), a=O.canopyW/2*wf(u), z=z0+u*Lc;
  for(let it=0;it<=NT;it++){ const t=Math.PI*it/NT, c=Math.cos(t), sn=Math.sin(t), n=4;
   const x=a*Math.sign(c)*Math.pow(Math.abs(c),2/n), y=apC-0.03+h*Math.pow(sn,2/n);
   pos.push(x,y,z); uv.push(u,it/NT); } }
 const winU=[0.10,0.55];
 for(let iu=0;iu<NU;iu++) for(let it=0;it<NT;it++){ const a=vtx(iu,it),b=vtx(iu,it+1),c=vtx(iu+1,it+1),d=vtx(iu+1,it);
  const u=(iu+.5)/NU, t=(it+.5)/NT*Math.PI, side=Math.abs(Math.cos(t))>0.45, hy=Math.sin(t);
  const win= side&&u>winU[0]+0.25*(1-hy)*0&&u<winU[1]-(hy>0.75?0.12:0)&&hy>0.2&&hy<0.9;
  (win?grp0:grp1).push(a,b,d,b,c,d); }
 // 後端の面 (ほぼ垂直) と前端
 const capFan=(iu)=>{ const ci=pos.length/3; let sx=0,sy=0,sz=0; for(let it=0;it<=NT;it++){ const k=vtx(iu,it)*3; sx+=pos[k]; sy+=pos[k+1]; sz+=pos[k+2]; }
  pos.push(0,apC-0.03,sz/(NT+1)); uv.push(0,0); for(let it=0;it<NT;it++) grp1.push(ci,vtx(iu,it),vtx(iu,it+1)); };
 capFan(NU); capFan(0);
 const cg=new THREE.BufferGeometry(); cg.setAttribute("position",new THREE.Float32BufferAttribute(pos,3)); cg.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
 cg.setIndex(grp0.concat(grp1)); cg.addGroup(0,grp0.length,0); cg.addGroup(grp0.length,grp1.length,1); cg.computeVertexNormals();
 canopy=new THREE.Mesh(cg,[
  new THREE.MeshPhysicalMaterial({color:0x232528,roughness:.3,clearcoat:.4,envMapIntensity:.15,side:DS}),   // 横窓 (濃いグレー)
  new THREE.MeshPhysicalMaterial({color:0x050607,roughness:.35,clearcoat:.5,envMapIntensity:.2,side:DS})]);  // 本体 (黒)
 canopy.castShadow=true; grp.add(canopy);
 // 「61 YATA」(キャノピー後半の両側)
 if(!YATA_CACHE.logo){ const cv=document.createElement("canvas"); cv.width=256; cv.height=160; const c=cv.getContext("2d");
  c.font="italic bold 78px Arial Black,Arial,sans-serif"; c.textAlign="center";
  const g1=c.createLinearGradient(0,10,0,80); g1.addColorStop(0,"#ff6a00"); g1.addColorStop(1,"#ffd21f"); c.fillStyle=g1; c.fillText("61",120,74);
  c.font="italic bold 58px Arial Black,Arial,sans-serif"; c.fillStyle="#ffd21f"; c.fillText("YATA",128,140);
  YATA_CACHE.logo=new THREE.CanvasTexture(cv); YATA_CACHE.logo.encoding=THREE.sRGBEncoding; }
 for(const sd of [-1,1]){ const u=0.74, a=O.canopyW/2*wf(u)*Math.pow(Math.abs(Math.cos(Math.PI*0.3)),.5);
  const lg=new THREE.Mesh(new THREE.PlaneGeometry(0.34,0.21),new THREE.MeshBasicMaterial({map:YATA_CACHE.logo,transparent:true,side:DS,depthWrite:false}));
  lg.position.set(sd*(O.canopyW/2+0.004),apC-0.03+Hc*hf(u)*0.55,z0+u*Lc); lg.rotation.y=sd*Math.PI/2; canopy.add(lg); }
} else {
const uC=O.canopyX/O.L;
const apC=Math.max(zPanel(uC),zHull(uC)+PG);
const cg=new THREE.SphereGeometry(1,48,24);
{const p=cg.attributes.position;
for(let i=0;i<p.count;i++){const z=p.getZ(i),f=z>0?1-.45*z*z:1-.25*z*z;
p.setX(i,p.getX(i)*f);p.setY(i,p.getY(i)*f);}}
cg.scale(O.canopyW/2,O.canopyTop-apC+0.05,O.canopyLen/2);
cg.translate(0,apC-0.05,O.canopyX-HL);
const idx=cg.index.array,g0=[],g1=[],p=cg.attributes.position;
for(let i=0;i<idx.length;i+=3){
const cz=(p.getZ(idx[i])+p.getZ(idx[i+1])+p.getZ(idx[i+2]))/3;
(cz<O.canopyX-O.canopyLen*.18-HL?g0:g1).push(idx[i],idx[i+1],idx[i+2]);}
cg.setIndex(g0.concat(g1));cg.clearGroups();
cg.addGroup(0,g0.length,0);cg.addGroup(g0.length,g1.length,1);cg.computeVertexNormals();
canopy=new THREE.Mesh(cg,[   // 外から見て黒 (スモーク) のキャノピー: 照り返しは控えめ
new THREE.MeshPhysicalMaterial({color:0x040506,roughness:.3,clearcoat:.6,clearcoatRoughness:.25,envMapIntensity:.25,side:DS}),
new THREE.MeshPhysicalMaterial({color:0x040506,roughness:.35,clearcoat:.5,clearcoatRoughness:.3,envMapIntensity:.2,side:DS})]);
canopy.castShadow=true;grp.add(canopy);
}
/* ==== コンタクトシャドウ ==== */
const shM=new THREE.Mesh(new THREE.PlaneGeometry(2.3*Math.max(1,halfW(.6)/.9),O.L+0.3),
new THREE.MeshBasicMaterial({map:T.shadow,transparent:true,depthWrite:false}));
shM.rotation.x=-Math.PI/2;shM.position.y=.02;grp.add(shM);
return {group:grp,canopy};
}
