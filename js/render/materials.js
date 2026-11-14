"use strict";
/* ============ 手続き生成テクスチャ & 共有マテリアル ============ */
function _cv(w,h){ const c=document.createElement("canvas"); c.width=w; c.height=h; return [c,c.getContext("2d")]; }
function _tex(cv,srgb=true,aniso=8){
const t=new THREE.CanvasTexture(cv);
t.wrapS=t.wrapT=THREE.RepeatWrapping; t.anisotropy=aniso;
if(srgb) t.encoding=THREE.sRGBEncoding;
return t;
}
const TEX={};
/* 道路: 横方向=全幅(2*ROAD_W) / 縦方向=12m (白線3m+間隔9m) */
function roadTex(kind){
const key="road_"+kind; if(TEX[key]) return TEX[key];
const W=256,H=512, [cv,c]=_cv(W,H);
const urban=kind==="urban";
c.fillStyle=urban?"#3b3c3f":"#66625c"; c.fillRect(0,0,W,H);
// 骨材(チップシール)の粒
for(let i=0;i<(urban?9000:16000);i++){
 const l=urban? 40+Math.random()*50 : 60+Math.random()*80;
 c.fillStyle=`rgba(${l+8},${l+4},${l},${0.25+Math.random()*0.4})`;
 const s=Math.random()<0.8?1:2; c.fillRect(Math.random()*W,Math.random()*H,s,s);
}
// 轍(わだち): 黒く滑らかに磨かれた帯
for(const u of [0.14,0.36,0.64,0.86]){
 const g=c.createLinearGradient((u-0.06)*W,0,(u+0.06)*W,0);
 g.addColorStop(0,"rgba(20,20,22,0)"); g.addColorStop(0.5,urban?"rgba(15,15,18,0.28)":"rgba(28,26,24,0.32)"); g.addColorStop(1,"rgba(20,20,22,0)");
 c.fillStyle=g; c.fillRect((u-0.06)*W,0,0.12*W,H);
}
// 補修パッチ・ひび
for(let i=0;i<(urban?3:4);i++){
 c.fillStyle=urban?`rgba(20,20,22,${0.08+Math.random()*0.1})`:`rgba(40,38,36,${0.08+Math.random()*0.1})`;
 const px=Math.random()*W*0.8, py=Math.random()*H; c.fillRect(px,py,20+Math.random()*60,30+Math.random()*120);
}
c.strokeStyle="rgba(15,14,13,0.5)"; c.lineWidth=1;
for(let i=0;i<14;i++){ c.beginPath(); let x=Math.random()*W, y=Math.random()*H; c.moveTo(x,y);
 for(let k=0;k<6;k++){ x+=(Math.random()-0.5)*18; y+=Math.random()*14; c.lineTo(x,y);} c.stroke(); }
// 路肩側の赤土の吹き溜まり(郊外)
if(!urban){
 for(const [a,b] of [[0,0.07],[0.93,1]]){
  const g=c.createLinearGradient(a*W,0,b*W,0);
  if(a===0){ g.addColorStop(0,"rgba(150,80,40,0.55)"); g.addColorStop(1,"rgba(150,80,40,0)"); }
  else { g.addColorStop(0,"rgba(150,80,40,0)"); g.addColorStop(1,"rgba(150,80,40,0.55)"); }
  c.fillStyle=g; c.fillRect(a*W,0,(b-a)*W,H);
 }
}
// 区画線 (豪州: 白の外側線 + 白破線センターライン)
const line=(u0,u1,v0,v1,a=0.92)=>{ c.fillStyle=`rgba(236,234,224,${a})`; c.fillRect(u0*W,v0*H,(u1-u0)*W,(v1-v0)*H);
 for(let i=0;i<60;i++){ c.fillStyle="rgba(80,78,72,0.25)"; c.fillRect(u0*W+Math.random()*(u1-u0)*W,v0*H+Math.random()*(v1-v0)*H,1,1);} };
line(0.018,0.036,0,1); line(0.964,0.982,0,1);
line(0.493,0.507,0,0.25);
TEX[key]=_tex(cv,true,16);
return TEX[key];
}
/* 地表ディテール(輝度, linear) 4mタイル */
function detailTex(){
if(TEX.detail) return TEX.detail;
const N=256,[cv,c]=_cv(N,N);
c.fillStyle="#808080"; c.fillRect(0,0,N,N);
for(let i=0;i<120;i++){ const l=Math.random()<0.5?100:160; c.fillStyle=`rgba(${l},${l},${l},0.12)`;
 c.beginPath(); c.ellipse(Math.random()*N,Math.random()*N,6+Math.random()*30,4+Math.random()*12,Math.random()*3,0,7); c.fill(); }
for(let i=0;i<9000;i++){ const l=Math.random()<0.5?50+Math.random()*40:170+Math.random()*60;
 c.fillStyle=`rgba(${l},${l},${l},0.45)`; const s=Math.random()<0.8?1:2; c.fillRect(Math.random()*N,Math.random()*N,s,s); }
TEX.detail=_tex(cv,false,8);
return TEX.detail;
}
function brickTex(){
if(TEX.brick) return TEX.brick;
const N=256,[cv,c]=_cv(N,N); // 2m×2m
c.fillStyle="#e8e4dc"; c.fillRect(0,0,N,N);
const rows=23, bh=N/rows, bw=bh*2.7;
for(let r=0;r<rows;r++) for(let x=-(r%2)*bw/2;x<N;x+=bw){
 const l=175+Math.random()*60; c.fillStyle=`rgb(${l},${l*0.97},${l*0.95})`;
 c.fillRect(x+1,r*bh+1,bw-2,bh-2);
}
TEX.brick=_tex(cv); return TEX.brick;
}
function corrTex(){
if(TEX.corr) return TEX.corr;
const W=64,H=64,[cv,c]=_cv(W,H); // 1m: 13山
for(let x=0;x<W;x++){ const l=180+60*Math.sin(x/W*13*2*Math.PI); c.fillStyle=`rgb(${l},${l},${l})`; c.fillRect(x,0,1,H); }
for(let i=0;i<40;i++){ c.fillStyle=`rgba(120,90,60,${Math.random()*0.15})`; c.fillRect(Math.random()*W,Math.random()*H,2,6); }
TEX.corr=_tex(cv); return TEX.corr;
}
function tileTex(){
if(TEX.tile) return TEX.tile;
const N=128,[cv,c]=_cv(N,N); // 1m: 4段×4列 テラコッタ瓦
c.fillStyle="#d8d2cc"; c.fillRect(0,0,N,N);
for(let r=0;r<4;r++) for(let k=0;k<4;k++){
 const l=170+Math.random()*70; const g=c.createLinearGradient(0,r*32,0,r*32+32);
 g.addColorStop(0,`rgb(${l*0.75},${l*0.75},${l*0.75})`); g.addColorStop(1,`rgb(${l},${l},${l})`);
 c.fillStyle=g; c.fillRect(k*32+((r%2)*16),r*32,31,31); c.fillRect(k*32+((r%2)*16)-N,r*32,31,31);
}
TEX.tile=_tex(cv); return TEX.tile;
}
/* オフィス: 6m(2スパン)×7m(2層) */
function officeTex(){
if(TEX.office) return TEX.office;
const N=256,[cv,c]=_cv(N,N);
c.fillStyle="#d9dcdf"; c.fillRect(0,0,N,N);
for(let fl=0;fl<2;fl++) for(let b=0;b<2;b++){
 const x=b*128+8, y=fl*128+30, w=112, h=90;
 const g=c.createLinearGradient(x,y,x+w*0.6,y+h); g.addColorStop(0,"#9fc0d8"); g.addColorStop(0.5,"#4a6c86"); g.addColorStop(1,"#2c4558");
 c.fillStyle=g; c.fillRect(x,y,w,h);
 c.fillStyle="rgba(255,255,255,0.18)"; c.beginPath(); c.moveTo(x,y+h*0.7); c.lineTo(x+w*0.5,y); c.lineTo(x+w*0.65,y); c.lineTo(x,y+h); c.fill();
 c.fillStyle="#c8ccd0"; for(let m=1;m<3;m++) c.fillRect(x+w*m/3-2,y,4,h);
}
TEX.office=_tex(cv); return TEX.office;
}
/* 集合住宅(ダーウィンの白いバルコニー付き高層): 6m×6.4m(2層) */
function resiTex(){
if(TEX.resi) return TEX.resi;
const N=256,[cv,c]=_cv(N,N);
c.fillStyle="#efede6"; c.fillRect(0,0,N,N);
for(let fl=0;fl<2;fl++){
 const y=fl*128;
 c.fillStyle="#30404c"; c.fillRect(14,y+22,228,84);
 c.fillStyle="rgba(170,200,220,0.35)"; c.fillRect(14,y+22,228,30);
 c.fillStyle="#f8f7f2"; c.fillRect(0,y+100,N,14);
 c.fillStyle="rgba(240,240,236,0.85)"; for(let x=10;x<N;x+=9) c.fillRect(x,y+70,2,30);
 c.fillRect(0,y+68,N,4);
 c.fillStyle="#d8d5cc"; c.fillRect(124,y+20,8,88);
}
TEX.resi=_tex(cv); return TEX.resi;
}
/* 商店ファサード: 8m×4m (下2.7mがガラス、上は看板帯) */
function shopTex(){
if(TEX.shop) return TEX.shop;
const W=256,H=128,[cv,c]=_cv(W,H);
c.fillStyle="#ece6da"; c.fillRect(0,0,W,H);
c.fillStyle="#d0c6b4"; c.fillRect(0,0,W,40);
const g=c.createLinearGradient(0,44,0,H); g.addColorStop(0,"#3a4a55"); g.addColorStop(1,"#1d262d");
c.fillStyle=g; c.fillRect(6,46,W-12,H-50);
c.fillStyle="rgba(255,255,255,0.15)"; c.fillRect(6,46,W-12,12);
c.fillStyle="#bcb6aa"; for(const x of [64,128,192]) c.fillRect(x-2,46,4,H-50);
c.fillStyle="#7a5a3a"; c.fillRect(110,60,36,H-64);
TEX.shop=_tex(cv); return TEX.shop;
}
/* ---- 標識(キャンバス文字) ---- */
const SIGN_CACHE=new Map();
function signTex(kind,text){
const key=kind+"|"+text; if(SIGN_CACHE.has(key)) return SIGN_CACHE.get(key);
let W=512,H=256; if(kind==="speed"){W=256;H=320;} if(kind==="banner"){W=512;H=160;} if(kind==="warn"){W=256;H=256;} if(kind==="giveway"){W=256;H=230;}
const [cv,c]=_cv(W,H);
const rr=(x,y,w,h,r)=>{ c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); };
c.textAlign="center"; c.textBaseline="middle";
if(kind==="green"||kind==="blue"||kind==="brown"){
 c.fillStyle={green:"#0d6b3c",blue:"#1f4f9c",brown:"#6b3b1f"}[kind]; rr(0,0,W,H,26); c.fill();
 c.strokeStyle="#fff"; c.lineWidth=10; rr(12,12,W-24,H-24,18); c.stroke();
 const lines=text.split("\n"); c.fillStyle="#fff";
 lines.forEach((ln,i)=>{ const parts=ln.split("|");
  c.font="bold 58px Arial,Helvetica,sans-serif";
  const y=H/2+(i-(lines.length-1)/2)*72;
  if(parts.length===2){ c.textAlign="left"; c.fillText(parts[0],44,y); c.textAlign="right"; c.fillText(parts[1],W-44,y); c.textAlign="center"; }
  else c.fillText(ln,W/2,y); });
} else if(kind==="banner"){
 c.fillStyle="#f6c400"; c.fillRect(0,0,W,H); c.strokeStyle="#111"; c.lineWidth=8; c.strokeRect(8,8,W-16,H-16);
 c.fillStyle="#111"; c.font="bold 50px Arial,Helvetica,sans-serif";
 text.split("\n").forEach((l,i,a)=>c.fillText(l,W/2,H/2+(i-(a.length-1)/2)*56));
} else if(kind==="speed"){
 c.fillStyle="#fff"; rr(0,0,W,H,18); c.fill(); c.strokeStyle="#111"; c.lineWidth=8; rr(8,8,W-16,H-16,12); c.stroke();
 c.fillStyle="#d71920"; c.beginPath(); c.arc(W/2,H/2,108,0,7); c.fill();
 c.fillStyle="#fff"; c.beginPath(); c.arc(W/2,H/2,82,0,7); c.fill();
 c.fillStyle="#111"; c.font=`bold ${text.length>2?78:100}px Arial,Helvetica,sans-serif`; c.fillText(text,W/2,H/2+6);
} else if(kind==="giveway"){   // 逆三角 (赤枠・白地) GIVE WAY
 c.fillStyle="#d71920"; c.beginPath(); c.moveTo(8,14); c.lineTo(W-8,14); c.lineTo(W/2,H-8); c.closePath(); c.fill();
 c.fillStyle="#fff"; c.beginPath(); c.moveTo(56,40); c.lineTo(W-56,40); c.lineTo(W/2,H-58); c.closePath(); c.fill();
 c.fillStyle="#111"; c.font="bold 30px Arial,Helvetica,sans-serif"; c.fillText("GIVE",W/2,76); c.fillText("WAY",W/2,112);
} else if(kind==="warn"&&text==="rab"){   // ラウンドアバウト予告 (黄ひし形・3 本の回る矢印)
 c.save(); c.translate(W/2,H/2); c.rotate(Math.PI/4);
 c.fillStyle="#f6c400"; rr(-86,-86,172,172,14); c.fill(); c.strokeStyle="#111"; c.lineWidth=7; rr(-78,-78,156,156,10); c.stroke(); c.restore();
 c.save(); c.translate(W/2,H/2); c.strokeStyle="#111"; c.fillStyle="#111"; c.lineWidth=11;
 for(let k=0;k<3;k++){ const a0=k*2*Math.PI/3-Math.PI/2+0.35, a1=a0+1.45;
  c.beginPath(); c.arc(0,0,44,a0,a1); c.stroke();
  const hx=Math.cos(a1)*44, hy=Math.sin(a1)*44, tx=-Math.sin(a1), ty=Math.cos(a1);
  c.beginPath(); c.moveTo(hx+tx*20,hy+ty*20); c.lineTo(hx-ty*16-tx*4,hy+tx*16-ty*4); c.lineTo(hx+ty*16-tx*4,hy-tx*16-ty*4); c.closePath(); c.fill(); }
 c.restore();
} else if(kind==="warn"){
 c.save(); c.translate(W/2,H/2); c.rotate(Math.PI/4);
 c.fillStyle="#f6c400"; rr(-86,-86,172,172,14); c.fill(); c.strokeStyle="#111"; c.lineWidth=7; rr(-78,-78,156,156,10); c.stroke(); c.restore();
 c.fillStyle="#111";
 if(text==="kangaroo"){ // カンガルーのシルエット
  c.save(); c.translate(W/2-6,H/2+6); c.scale(1.1,1.1);
  c.beginPath(); c.ellipse(0,8,30,20,-0.5,0,7); c.fill();
  c.beginPath(); c.ellipse(24,-22,9,12,0.3,0,7); c.fill();
  c.beginPath(); c.moveTo(26,-34); c.lineTo(22,-50); c.lineTo(30,-36); c.fill();
  c.beginPath(); c.moveTo(-24,16); c.quadraticCurveTo(-60,30,-70,50); c.lineTo(-62,52); c.quadraticCurveTo(-48,34,-18,26); c.fill();
  c.fillRect(-6,22,30,7); c.fillRect(14,24,30,6);
  c.restore();
 } else if(text==="cow"){
  c.save(); c.translate(W/2,H/2+8);
  c.fillRect(-38,-14,62,30); c.fillRect(-34,14,8,22); c.fillRect(12,14,8,22); c.fillRect(24,-24,22,20); c.restore();
 } else {
  c.font="bold 34px Arial,Helvetica,sans-serif"; text.split("\n").forEach((l,i,a)=>c.fillText(l,W/2,H/2+(i-(a.length-1)/2)*38));
 }
}
const t=_tex(cv,true,8); SIGN_CACHE.set(key,t); return t;
}
/* ---- 地表マテリアル (頂点カラー=土 / aVeg=植生色+被覆率 / aMisc=野焼き,礫,農地) ---- */
const GLSL_NOISE=`
float gHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float gVn(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);
return mix(mix(gHash(i),gHash(i+vec2(1.,0.)),u.x),mix(gHash(i+vec2(0.,1.)),gHash(i+vec2(1.,1.)),u.x),u.y);}
float gFbm(vec2 p){float v=0.0;float a=0.5;for(int i=0;i<4;i++){v+=a*gVn(p);p=p*2.03+vec2(1.7,9.2);a*=0.5;}return v;}
`;
function makeGroundMaterial(){
const mat=new THREE.MeshLambertMaterial({vertexColors:true});
mat.userData.uniforms={uDetail:{value:detailTex()}};
mat.onBeforeCompile=(sh)=>{
 Object.assign(sh.uniforms,mat.userData.uniforms);
 sh.vertexShader="attribute vec4 aVeg;\nattribute vec3 aMisc;\nvarying vec4 vVeg;\nvarying vec3 vMisc;\nvarying vec3 vWPos;\n"+sh.vertexShader
  .replace("#include <begin_vertex>","#include <begin_vertex>\nvVeg=aVeg; vMisc=aMisc; vWPos=(modelMatrix*vec4(transformed,1.0)).xyz;");
 sh.fragmentShader="uniform sampler2D uDetail;\nvarying vec4 vVeg;\nvarying vec3 vMisc;\nvarying vec3 vWPos;\n"+GLSL_NOISE+sh.fragmentShader
  .replace("#include <color_fragment>",`#include <color_fragment>
{
 vec2 q=vWPos.xz;
 float n1=gFbm(q*0.011), n2=gVn(q*0.13), n3=gVn(q*0.7);
 float cov=vVeg.a;
 float th=1.0-cov;
 float n4=gVn(q*1.9);
 float vm=smoothstep(th-0.22,th+0.22,n1*0.45+n2*0.3+n3*0.15+n4*0.1);
 vec3 c=mix(diffuseColor.rgb,vVeg.rgb*(0.8+0.35*n3),vm*0.9);
 float bn=smoothstep(0.6,0.64,gFbm(q*0.0045+vec2(13.,7.)))*vMisc.x;
 c=mix(c,vec3(0.025,0.022,0.02)+0.02*n3,bn*0.85);
 vec2 sq=q*3.0, sc=floor(sq); vec2 so=vec2(gHash(sc+3.1),gHash(sc+7.7))*0.5+0.25;
 float stn=step(1.0-0.45*vMisc.y,gHash(sc))*(1.0-smoothstep(0.12,0.2,length(fract(sq)-so)))*vMisc.y;
 c=mix(c,vec3(0.17,0.10,0.07),stn*0.8);   /* 礫 (ギバー): 赤茶の石。黒くしすぎない */
 c=mix(c,c*vec3(1.12,1.05,0.95),vMisc.y*0.35*n1);
 if(vMisc.z>0.01){
  vec2 cell=floor((q+vec2(37.,11.))/vec2(160.,110.)); float h=gHash(cell);
  vec3 fc= h<0.42?vec3(0.10,0.20,0.03): h<0.68?vec3(0.18,0.27,0.05): h<0.80?vec3(0.62,0.52,0.02): vec3(0.20,0.12,0.06);
  vec2 lq=fract((q+vec2(37.,11.))/vec2(160.,110.));
  float edge=step(0.985,max(lq.x,lq.y));
  fc*=0.9+0.12*sin((h<0.5?q.x:q.y)*2.6)+0.15*(gVn(q*0.05)-0.5);
  c=mix(c,mix(fc,diffuseColor.rgb,edge),vMisc.z);
 }
 float det=texture2D(uDetail,q*0.25).r;
 c*=0.78+0.44*det;
 c=mix(vec3(dot(c,vec3(0.3,0.59,0.11))),c,0.80);   /* 赤土の鮮やかさを少し抑える (乾いた土は彩度が低い) */
 diffuseColor.rgb=c;
}`);
};
return mat;
}
/* ---- 道路マテリアル (逃げ水=蜃気楼つき) ---- */
/* 路面の凹凸 (骨材の粒) の法線マップと、粗さのマップ (轍は磨かれて少しつるつる)。roadTex と同じ大きさ・同じ並びで繰り返す */
function roadDetail(kind){
 const key="roadN_"+kind; if(TEX[key]) return TEX[key];
 const W=256,H=512, hgt=new Float32Array(W*H), urban=kind==="urban";
 let seed=kind.length*7919+17; const rnd=()=>((seed=(seed*1103515245+12345)>>>0)/4294967296);
 for(let i=0;i<(urban?14000:22000);i++){ const x=Math.floor(rnd()*W), y=Math.floor(rnd()*H), r=rnd()<0.75?1:2, h=0.4+rnd()*0.6;
  for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++){ if(dx*dx+dy*dy>r*r) continue; const k=((y+dy+H)%H)*W+((x+dx+W)%W); hgt[k]=Math.max(hgt[k],h*(1-(dx*dx+dy*dy)/(r*r+1))); } }
 const [nc,n]=_cv(W,H), [rc,rg]=_cv(W,H), ni=n.createImageData(W,H), ri=rg.createImageData(W,H), S=urban?2.2:3.0;
 const at=(x,y)=>hgt[((y+H)%H)*W+((x+W)%W)];
 for(let y=0;y<H;y++) for(let x=0;x<W;x++){ const dx=(at(x+1,y)-at(x-1,y))*S, dy=(at(x,y+1)-at(x,y-1))*S, L=Math.hypot(dx,dy,1), o=(y*W+x)*4;
  ni.data[o]=(-dx/L*0.5+0.5)*255; ni.data[o+1]=(dy/L*0.5+0.5)*255; ni.data[o+2]=(1/L*0.5+0.5)*255; ni.data[o+3]=255;
  const u=x/W, rut=[0.14,0.36,0.64,0.86].some(c=>Math.abs(u-c)<0.04), r=(urban?0.78:0.88)-(rut?0.2:0)-at(x,y)*0.08;
  ri.data[o]=ri.data[o+1]=ri.data[o+2]=Math.round(clamp(r,0,1)*255); ri.data[o+3]=255; }
 n.putImageData(ni,0,0); rg.putImageData(ri,0,0);
 const mk=(cv)=>{ const t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.anisotropy=8; return t; };
 return TEX[key]={normal:mk(nc),rough:mk(rc)};
}
function makeRoadMaterial(kind){
// 画質「標準」以上は物理ベース (凹凸と粗さで光が散らばる)。「低」は軽い材質
const pbr=typeof GFX!=="undefined"&&GFX.key()!=="low", D=pbr? roadDetail(kind) : null;
const mat= pbr? new THREE.MeshStandardMaterial({map:roadTex(kind),vertexColors:true,normalMap:D.normal,normalScale:new THREE.Vector2(0.35,0.35),roughnessMap:D.rough,roughness:1,metalness:0,envMapIntensity:0.5})
 : new THREE.MeshLambertMaterial({map:roadTex(kind),vertexColors:true});
mat.userData.gfx=pbr?"pbr":"low";
mat.userData.uniforms={uMirage:{value:0},uSkyCol:{value:new THREE.Color(0.7,0.8,0.9)},uTime:{value:0},uWet:{value:0}};
mat.onBeforeCompile=(sh)=>{
 Object.assign(sh.uniforms,mat.userData.uniforms);
 sh.vertexShader="varying vec3 vWPos;\n"+sh.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\nvWPos=(modelMatrix*vec4(transformed,1.0)).xyz;");
 sh.fragmentShader="uniform float uMirage;uniform vec3 uSkyCol;uniform float uTime;uniform float uWet;varying vec3 vWPos;\n"+GLSL_NOISE+sh.fragmentShader
  .replace("#include <map_fragment>",`#include <map_fragment>
#ifdef USE_MAP
{ // 路面の変化 (繰り返しの模様の上に、場所ごとに違うものを重ねる)。vUv.x = 車線の横の位置、vUv.y * 12 = 道に沿った距離 m
 float vv=vUv.y*12.0, uu=vUv.x;
 // 舗装の打ち替えの区間: 数十〜数百 m ごとに色が少し違う
 float sec=floor(vv/95.0+gVn(vec2(vv*0.003,7.0))*1.6), hs=fract(sin(sec*91.7+3.1)*4375.85);
 diffuseColor.rgb*=0.9+0.2*hs;
 // 補修の跡: 片側の車線の中の四角い継ぎ当て (色が濃い)。車線の線にはかからない
 float pc=floor(vv/27.0), ph=fract(sin(pc*12.989+1.7)*43758.5);
 if(ph<0.24){ float pv=fract(vv/27.0), side=step(0.5,fract(ph*17.3)), w=0.08+fract(ph*91.1)*0.16, u0=side*0.5+0.06+fract(ph*37.7)*(0.36-w), l=0.1+fract(ph*53.3)*0.45;
  float inP=step(u0,uu)*step(uu,u0+w)*step(0.25,pv)*step(pv,0.25+l), e=0.004;
  float edge=inP*(1.0-step(u0+e,uu)*step(uu,u0+w-e)*step(0.25+e*3.0,pv)*step(pv,0.25+l-e*3.0));
  diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(0.66,0.66,0.68),inP*0.9); diffuseColor.rgb*=1.0-edge*0.35; }
 // タイヤの通り道: ゴムの黒い筋 (道に沿って長く伸びる)
 float wp=max(max(1.0-smoothstep(0.012,0.048,abs(uu-0.14)),1.0-smoothstep(0.012,0.048,abs(uu-0.36))),max(1.0-smoothstep(0.012,0.048,abs(uu-0.64)),1.0-smoothstep(0.012,0.048,abs(uu-0.86))));
 float st=gVn(vec2(uu*70.0,vv*0.12))*0.7+gVn(vec2(uu*150.0,vv*0.5))*0.3;
 diffuseColor.rgb*=1.0-0.12*wp*smoothstep(0.35,0.8,st);
 // 車線の真ん中の油の染み
 float lc=max(1.0-smoothstep(0.02,0.07,abs(uu-0.25)),1.0-smoothstep(0.02,0.07,abs(uu-0.75)));
 diffuseColor.rgb*=1.0-0.07*lc*smoothstep(0.55,0.85,gVn(vec2(uu*20.0,vv*0.3)));
}
#endif`)
  .replace("#include <fog_fragment>",`#include <fog_fragment>
{
 float d=length(vWPos.xz-cameraPosition.xz);
 float hgt=max(cameraPosition.y-vWPos.y,0.5);
 float graz=1.0-smoothstep(0.005,0.03,hgt/d);
 float patchy=smoothstep(0.35,0.75,gVn(vWPos.xz*0.012+vec2(0.,uTime*0.05)));
 float m=graz*smoothstep(90.,260.,d)*(1.0-smoothstep(900.,1400.,d))*patchy*uMirage;
 float sh=0.5+0.5*sin(vWPos.x*0.21+vWPos.z*0.17+uTime*3.1);
 gl_FragColor.rgb=mix(gl_FragColor.rgb,uSkyCol,clamp(m*(0.6+0.3*sh),0.0,0.85));
 if(uWet>0.001){   // 濡れた路面: 暗くなり、浅い角度で空が映る。水たまりはまだら
  float pud=smoothstep(0.5,0.78,gVn(vWPos.xz*0.09))*smoothstep(0.2,0.9,uWet);
  float fres=pow(1.0-clamp(hgt/d*6.0,0.0,1.0),3.0), near=1.0-smoothstep(160.0,700.0,d);
  vec3 base=gl_FragColor.rgb*(1.0-0.38*uWet-0.15*pud);
  float k=clamp((0.12+0.6*fres)*uWet*(0.55+0.45*pud)+pud*0.25,0.0,0.75)*near;
  float rip=0.85+0.15*sin(vWPos.x*3.1+uTime*9.0)*sin(vWPos.z*2.7-uTime*7.0);
  gl_FragColor.rgb=mix(base,uSkyCol*0.8*rip,k);
 }
}`);
};
return mat;
}
/* ---- 共有マテリアル登録 ---- */
const SceneMats={
_m:{},
get(name){
 if(this._m[name]&&name.startsWith("road_")&&typeof GFX!=="undefined"&&this._m[name].mat.userData.gfx!==(GFX.key()!=="low"?"pbr":"low")) delete this._m[name];   // 画質を変えたら作り直す
 if(this._m[name]) return this._m[name];
 const L=(o)=>new THREE.MeshLambertMaterial(Object.assign({vertexColors:true},o));
 const DS=THREE.DoubleSide;
 let def;
 switch(name){
 case "veg": def={mat:L({side:DS}),cast:true}; break;
 case "bark": def={mat:L(),cast:true}; break;
 case "solid": def={mat:L(),cast:true}; break;
 case "solidDS": def={mat:L({side:DS}),cast:true}; break;
 case "brick": def={mat:L({map:brickTex()}),cast:true}; break;
 case "corr": def={mat:L({map:corrTex(),side:DS}),cast:true}; break;
 case "tile": def={mat:L({map:tileTex(),side:DS}),cast:true}; break;
 case "office": def={mat:new THREE.MeshStandardMaterial({vertexColors:true,map:officeTex(),roughness:0.35,metalness:0.35,envMapIntensity:0.9}),cast:true}; break;
 case "resi": def={mat:L({map:resiTex()}),cast:true}; break;
 case "shop": def={mat:L({map:shopTex()}),cast:true}; break;
 case "glass": def={mat:new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.12,metalness:0.6,envMapIntensity:1.0}),cast:false}; break;
 case "water": def={mat:new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.08,metalness:0.2,envMapIntensity:1.2}),cast:false}; break;
 case "emis": def={mat:new THREE.MeshBasicMaterial({vertexColors:true}),cast:false}; break;
 case "ground": def={mat:makeGroundMaterial(),cast:false}; break;
 case "road_rural": def={mat:makeRoadMaterial("rural"),cast:false}; break;
 case "road_urban": def={mat:makeRoadMaterial("urban"),cast:false}; break;
 default: def={mat:L(),cast:true};
 }
 this._m[name]=def; return def;
},
eachRoad(fn){ for(const k of ["road_rural","road_urban"]) if(this._m[k]) fn(this._m[k].mat.userData.uniforms); },
};
