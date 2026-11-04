"use strict";
/* ============ 砂漠地面テクスチャ(手続き生成=軽量) ============ */
const GROUND_TEX={};
function groundTextures(){
if(GROUND_TEX.sand) return GROUND_TEX;
const cv=document.createElement("canvas");cv.width=cv.height=256;
const c=cv.getContext("2d");
c.fillStyle="#c2a06e";c.fillRect(0,0,256,256);
for(let i=0;i<80;i++){ // 乾いた斑・風紋
c.fillStyle=`rgba(${Math.random()<0.5?"150,110,70":"235,210,165"},${0.05+Math.random()*0.09})`;
c.beginPath();c.ellipse(Math.random()*256,Math.random()*256,8+Math.random()*40,5+Math.random()*16,Math.random()*3.14,0,7);c.fill();}
for(let i=0;i<6500;i++){ // 砂粒スペック
c.fillStyle=Math.random()<0.5?"rgba(95,65,35,0.28)":"rgba(255,242,214,0.25)";
const s=Math.random()<0.85?1:2;c.fillRect(Math.random()*256,Math.random()*256,s,s);}
for(let i=0;i<90;i++){c.fillStyle="rgba(110,85,60,0.55)";c.fillRect(Math.random()*256,Math.random()*256,2,2);} // 小石
const t=new THREE.CanvasTexture(cv);
t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;t.encoding=THREE.sRGBEncoding;
const t2=t.clone();t2.needsUpdate=true; // 路肩スカート用(ワールドUV)
GROUND_TEX.sand=t;GROUND_TEX.sandW=t2;
return GROUND_TEX;
}
/* ============ 道路/路肩ザラつきテクスチャ ============ */
const ROAD_TEX={};
function roadTextures(){
if(ROAD_TEX.asph) return ROAD_TEX;
const mk=(base,spotA,spotB,n)=>{
const cv=document.createElement("canvas");cv.width=cv.height=256;
const c=cv.getContext("2d");
c.fillStyle=base;c.fillRect(0,0,256,256);
for(let i=0;i<n;i++){
c.fillStyle=Math.random()<0.5?spotA:spotB;
const s=Math.random()<0.85?1:2;
c.fillRect(Math.random()*256,Math.random()*256,s,s);
}
const t=new THREE.CanvasTexture(cv);
t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;t.encoding=THREE.sRGBEncoding;
return t;};
ROAD_TEX.asph=mk("#2b2d31","rgba(0,0,0,0.25)","rgba(120,124,130,0.18)",7000);
ROAD_TEX.shld=mk("#9c6a3c","rgba(70,45,22,0.25)","rgba(210,170,120,0.25)",6000);
return ROAD_TEX;
}
/* ============ 粒状スパック(縁石/芝/法面に乗算で共有) ============ */
const GRAIN=(()=>{
const cv=document.createElement("canvas");cv.width=cv.height=128;
const c=cv.getContext("2d");
c.fillStyle="#ffffff";c.fillRect(0,0,128,128);
for(let i=0;i<2600;i++){
c.fillStyle=Math.random()<0.5?`rgba(0,0,0,${0.08+Math.random()*0.22})`:`rgba(255,255,255,${0.1+Math.random()*0.3})`;
const s=Math.random()<0.85?1:2;
c.fillRect(Math.random()*128,Math.random()*128,s,s);
}
const t=new THREE.CanvasTexture(cv);
t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;t.encoding=THREE.sRGBEncoding;
return t;
})();
