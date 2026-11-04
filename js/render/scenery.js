"use strict";
/* ============ チャンク単位の地形・道路・景観生成 ============
 視覚空間の距離 s[m] と実距離 km の対応: km = 現在km + (s - View.s) * timeScale / 1000 */
const TERRAIN_OFFS=[0,3.5,7,12,18,26,38,55,80,115,165,235,330,460,640,900];
const SKIRT_OFF=1500;
const _sc=new THREE.Color(), _sv=new THREE.Color();
const Scenery={
kmOfS(view,s){ const es=Engine.st; const base=es?es.km:0; return clamp(base+(s-view.s)*P.timeScale/1000,0,TOTAL_KM); },
salt(km,off){ return off>110 && featureAt(km).some(f=>f.id==="salt_lake"&&Math.sign(off)===f.side); },
/* 地表の高さ (道路中心高さ基準の相対値) */
groundRel(x,z,off,bio,km){
 if(this.salt(km,off)) return -0.25;
 const a=Math.abs(off);
 const urb=bio.urban?0.25:1;
 return -0.18+terrainH(x,z,a,bio.hill*urb);
},
/* メッシュと同じ折れ線補間で地表高さを返す(物体の接地用) */
groundY(view,s,off){
 const p=view.roadPoint(clamp(s,0,view.road.builtS-0.01)), nx=Math.cos(p.h), nz=Math.sin(p.h);
 const km=this.kmOfS(view,s), bio=biomeAt(km), SH=view.SHOULDER;
 const sd=Math.sign(off)||1, a=Math.abs(off)-SH;
 if(a<=0) return p.y+(bio.urban?0.15:-0.05);
 let i=0; while(i<TERRAIN_OFFS.length-2 && TERRAIN_OFFS[i+1]<a) i++;
 const hAt=(o)=>{ const oo=SH+o; if(o===0) return bio.urban?0.15:-0.05; return this.groundRel(p.x+nx*oo*sd,p.z+nz*oo*sd,oo*sd,bio,km); };
 const o0=TERRAIN_OFFS[i], o1=TERRAIN_OFFS[i+1];
 return p.y+lerp(hAt(o0),hAt(o1),clamp((a-o0)/(o1-o0),0,1));
},
/* 帯状メッシュ: cols=[{off,y(rel),u}] / attr(row s, col) で色等 */
ribbon(view,s0,s1,cols,mat,rowFn,step){
 step=step||view.SEG;
 const pos=[],uv=[],col=[],veg=[],misc=[],idx=[];
 let rows=0;
 for(let s=s0;s<=s1+0.01;s+=step){
  const p=view.roadPoint(Math.min(s,view.road.builtS-0.01)), nx=Math.cos(p.h), nz=Math.sin(p.h);
  const rd=rowFn(s,p);
  for(const c of cols){
   const x=p.x+nx*c.off, z=p.z+nz*c.off;
   const a=rd.at(c,x,z);
   pos.push(x,p.y+a.y,z); uv.push(a.u!=null?a.u:x*0.25, a.v!=null?a.v:z*0.25);
   col.push(a.c.r,a.c.g,a.c.b);
   if(a.veg){ veg.push(a.veg[0],a.veg[1],a.veg[2],a.veg[3]); misc.push(a.misc[0],a.misc[1],a.misc[2]); }
  }
  rows++;
 }
 const nc=cols.length;
 for(let r=0;r<rows-1;r++) for(let k=0;k<nc-1;k++){
  const a=r*nc+k,b=a+1,c=a+nc,d=c+1;
  idx.push(a,b,c, b,d,c);
 }
 const g=new THREE.BufferGeometry();
 g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
 g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
 g.setAttribute("color",new THREE.Float32BufferAttribute(col,3));
 if(veg.length){ g.setAttribute("aVeg",new THREE.Float32BufferAttribute(veg,4)); g.setAttribute("aMisc",new THREE.Float32BufferAttribute(misc,3)); }
 g.setIndex(idx); g.computeVertexNormals();
 const m=new THREE.Mesh(g,mat); m.receiveShadow=true; m.matrixAutoUpdate=false;
 return m;
},
groundAttrs(bio,off,km,rural){
 let soil=bio.soil, veg=bio.veg, cov=bio.cov, misc=[bio.burn,bio.stone,bio.field];
 const a=Math.abs(off);
 if(this.salt(km,off)){ soil=0xe8e4da; cov=0.04; veg=0xd9cfc0; misc=[0,0,0]; }
 else if(a<14){ cov*=rural?0.85:1; misc=[misc[0]*0.2,misc[1],0]; }      // 刈り払い帯
 if(a>1000){ misc[1]*=0.5; }
 _sc.setHex(soil).convertSRGBToLinear(); _sv.setHex(veg).convertSRGBToLinear();
 return { c:_sc, veg:[_sv.r,_sv.g,_sv.b,cov], misc };
},
buildChunk(view,s0,s1){
 const grp=new THREE.Group();
 const kmA=this.kmOfS(view,s0), kmB=this.kmOfS(view,s1), kmM=(kmA+kmB)/2;
 const bioM=biomeAt(kmM);
 const urban=bioM.urban;
 srand(Math.floor(kmA*1000)+Math.floor(s0)*7+13);
 const W=view.ROAD_W, SH=view.SHOULDER;
 // ---- 路面 ----
 const roadMat=SceneMats.get(urban?"road_urban":"road_rural").mat;
 const white=new THREE.Color(1,1,1);
 grp.add(this.ribbon(view,s0,s1,[{off:-W},{off:0},{off:W}],roadMat,(s)=>({at:(c)=>({y:0,u:(c.off+W)/(2*W),v:s/12,c:white})})));
 // ---- 路肩 / 歩道 ----
 const gmat=SceneMats.get("ground").mat;
 const shoulderCols=(sd)=> urban?
  [{off:sd*W,t:"gut"},{off:sd*(W+0.45),t:"gut"},{off:sd*(W+0.46),t:"kerb"},{off:sd*(W+0.6),t:"path"},{off:sd*SH,t:"path"}] :
  [{off:sd*W,t:"grav"},{off:sd*(W+1.2),t:"grav"},{off:sd*SH,t:"grav"}];
 for(const sd of [-1,1]){
  let cols=shoulderCols(sd); if(sd<0) cols=cols.slice().reverse();
  grp.add(this.ribbon(view,s0,s1,cols,gmat,(s)=>{
   const km=this.kmOfS(view,s), bio=biomeAt(km);
   return {at:(c)=>{
    let y=-0.05, soil=0x9a6a42, cov=0.08, vg=bio.soil, misc=[0,0.15,0];
    if(c.t==="grav"){ soil=bio.urban?0x8f8a7a:0x8a6a50; _sc.setHex(soil).lerp(_sv.setHex(bio.soil),0.35); soil=_sc.getHex(); }
    if(c.t==="gut"){ y=-0.02; soil=0x8d8b85; cov=0; misc=[0,0,0]; }
    if(c.t==="kerb"||c.t==="path"){ y=0.15; soil=0xb9b4a8; cov=0; misc=[0,0,0]; }
    _sc.setHex(soil).convertSRGBToLinear(); _sv.setHex(vg).convertSRGBToLinear();
    return {y,c:_sc,veg:[_sv.r,_sv.g,_sv.b,cov],misc};
   }};
  }));
 }
 // ---- 周辺地形 ----
 for(const sd of [-1,1]){
  let cols=TERRAIN_OFFS.map(o=>({off:sd*(SH+o)})).concat([{off:sd*SKIRT_OFF,skirt:true}]);
  if(sd<0) cols=cols.slice().reverse();
  grp.add(this.ribbon(view,s0,s1,cols,gmat,(s)=>{
   const km=this.kmOfS(view,s), bio=biomeAt(km);
   return {at:(c,x,z)=>{
    const y= c.skirt? -38 : (Math.abs(c.off)<SH+0.1? (bio.urban?0.15:-0.05) : this.groundRel(x,z,c.off,bio,km));
    const a=this.groundAttrs(bio,c.off,km,!bio.urban);
    return {y,c:a.c,veg:a.veg,misc:a.misc};
   }};
  }));
 }
 // ---- 景観オブジェクト ----
 const bs=new BatchSet();
 const signs=[];
 const ctx={view,grp,bs,signs,s0,s1,kmA,kmB};
 if(urban) this.urban(ctx,urban); else this.rural(ctx);
 this.townOverlay(ctx);
 this.features(ctx);
 this.roadSigns(ctx);
 bs.toGroup(grp);
 for(const sg of signs) grp.add(sg);
 return grp;
},
/* 位置ヘルパ: s, 横オフセット → ワールド座標 & 道路向き */
at(view,s,off){
 const p=view.roadPoint(clamp(s,0,view.road.builtS-0.01)), nx=Math.cos(p.h), nz=Math.sin(p.h);
 return { x:p.x+nx*off, z:p.z+nz*off, y:this.groundY(view,s,off), h:p.h, nx, nz, fx:Math.sin(p.h), fz:-Math.cos(p.h),
  face: off<0? -p.h-Math.PI/2 : -p.h+Math.PI/2 };
},
floraWeights(km){
 const b=biomeAt(km), w={};
 const add=(fl,k)=>{ for(const n in fl) w[n]=(w[n]||0)+fl[n]*k; };
 add(b.b.flora,1-(b.nb?b.t:0)); if(b.nb) add(b.nb.flora,b.t);
 return w;
},
rural(ctx){
 const {view,bs,s0,s1}=ctx, SH=view.SHOULDER, W=view.ROAD_W;
 const PER={spinifex:260,grass:300,saltbush:300,termite:40,woodland:120,mulga:55,rock:30,ghost:12,redgum:10,desertoak:20,pandanus:16,palm:10,mango:6,jacaranda:0,windbreak:0,fence:0};
 for(const sd of [-1,1]){
  for(const sp in PER){
   const n0=PER[sp]; if(!n0) continue;
   for(let i=0;i<n0;i++){
    const s=rndr(s0,s1), km=this.kmOfS(view,s);
    const w=this.floraWeights(km)[sp]||0;
    if(rnd()>w) continue;
    const small=(sp==="spinifex"||sp==="grass"||sp==="saltbush"||sp==="rock");
    const minOff= small? 2.5 : 9;
    const maxOff= sp==="grass"? 90 : small? 170 : 560;
    const off=sd*(SH+minOff+Math.pow(rnd(),small?1.7:1.3)*(maxOff-minOff));
    const q=this.at(view,s,off);
    if(this.salt(km,off)) continue;
    // 樹木は群生させる(ノイズマスク)
    if(!small && sp!=="woodland" && vnoise(q.x*0.006+3.1,q.z*0.006-7.7)<0.35) continue;
    if(sp==="woodland" && vnoise(q.x*0.01+3.1,q.z*0.01-7.7)<0.2) continue;
    const y=q.y-0.05;
    switch(sp){
     case "woodland": PR.tree(bs,q.x,y,q.z,"woodland",1,Math.abs(off)>220?1:0); break;
     case "ghost": PR.tree(bs,q.x,y,q.z,"ghost",1,Math.abs(off)>220?1:0); break;
     case "redgum": PR.tree(bs,q.x,y,q.z,"redgum",1,Math.abs(off)>220?1:0); break;
     case "mango": PR.tree(bs,q.x,y,q.z,"mango"); break;
     case "desertoak": PR.desertoak(bs,q.x,y,q.z); break;
     case "mulga": PR.mulga(bs,q.x,y,q.z); break;
     case "spinifex": PR.spinifex(bs,q.x,y,q.z); break;
     case "grass": PR.grass(bs,q.x,y,q.z); break;
     case "saltbush": PR.saltbush(bs,q.x,y,q.z); break;
     case "termite": PR.termite(bs,q.x,y,q.z); break;
     case "rock": PR.rock(bs,q.x,y,q.z,1,biomeAt(km).stone>0.5?0x4a2a1c:0x8b4426); break;
     case "pandanus": PR.pandanus(bs,q.x,y,q.z); break;
     case "palm": PR.palm(bs,q.x,y,q.z,0.8); break;
    }
   }
  }
 }
 // ガイドポスト (20m毎・左=赤/右=白 反射板)
 const g0=Math.ceil(s0/20)*20;
 for(let s=g0;s<s1;s+=20) for(const sd of [-1,1]){
  const q=this.at(view,s,sd*(W+2.3)); PR.guidePost(bs,q.x,q.y+0.03,q.z,-q.h,sd<0);
 }
 // 牧場の境界フェンス (農地は常時/内陸は時々)
 const w=this.floraWeights(this.kmOfS(view,(s0+s1)/2));
 const fenceP=(w.fence||0)>0.5?1:(biomeAt(this.kmOfS(view,s0)).id==="barkly"||biomeAt(this.kmOfS(view,s0)).id==="sa_north")?0.6:0.25;
 if(rnd()<fenceP){
  for(const sd of [-1,1]){
   const off=sd*(SH+rndr(14,22)), pts=[];
   for(let s=Math.ceil(s0/8)*8;s<s1;s+=8){ const q=this.at(view,s,off); PR.fencePost(bs,q.x,q.y,q.z,-q.h); pts.push([q.x,q.y,q.z]); }
   this.wires(ctx,pts,[0.55,0.95],0.02,0x6b5d4f);
  }
 }
 if((w.windbreak||0)>0.2 && rnd()<0.6){ // 防風林の並木
  const sd=rnd()<0.5?-1:1, off=sd*rndr(60,160);
  for(let s=s0;s<s1;s+=rndr(7,11)){ const q=this.at(view,s,off+rndr(-2,2)); PR.tree(bs,q.x,q.y,q.z,"windbreak"); }
 }
 if((w.fence||0)>0.5 && rnd()<0.15){ // サイロ
  const q=this.at(view,rndr(s0,s1),rnd()<0.5?-90:110);
  for(let i=0;i<4;i++) bs.get("corr").add(tpl("cyl12"),M4(q.x+i*7.5*q.fx,q.y,q.z+i*7.5*q.fz,3.4,22,3.4),linCol(0xc9ccca,0.03),3);
 }
},
urban(ctx,kind){
 const {view,bs,s0,s1}=ctx, SH=view.SHOULDER, W=view.ROAD_W;
 // 街路樹 / 街灯
 for(let s=Math.ceil(s0/30)*30;s<s1;s+=30) for(const sd of [-1,1]){
  const q=this.at(view,s,sd*(SH-0.8));
  PR.streetLight(bs,q.x,q.y,q.z,-sd*q.nx,-sd*q.nz);
 }
 for(let s=Math.ceil(s0/16)*16+8;s<s1;s+=16) for(const sd of [-1,1]){
  if(rnd()<0.25) continue;
  const q=this.at(view,s,sd*(SH-1.6));
  if(kind.startsWith("darwin")) PR.palm(bs,q.x,q.y,q.z,0.75); else PR.tree(bs,q.x,q.y,q.z,"street",0.8);
 }
 // 電柱+電線 (アデレード=ストビーポール)
 const poles=[];
 for(let s=Math.ceil(s0/40)*40;s<s1;s+=40){
  const q=this.at(view,s,-(SH+1.0));
  const top=kind==="adelaide"? PR.stobie(bs,q.x,q.y,q.z,-q.h) : PR.woodPole(bs,q.x,q.y,q.z,-q.h);
  poles.push([q.x,top,q.z,q.nx,q.nz]);
 }
 if(kind!=="parklands"&&kind!=="darwin_cbd") for(const k of [-0.9,0,0.9]) this.wires(ctx,poles.map(p=>[p[0]+p[3]*k,p[1],p[2]+p[4]*k]),[0],0.35,0x222222);
 // 交差する脇道 (110m毎)
 const sideStreets=[];
 if(kind!=="parklands") for(let s=Math.ceil(s0/110)*110+40;s<s1;s+=110){
  sideStreets.push(s);
  for(const sd of [-1,1]){
   const q0=this.at(view,s,sd*(SH+1)), L=180;
   bs.get("solid").add(tpl("box"),M4(q0.x+sd*q0.nx*L/2,q0.y-0.16,q0.z+sd*q0.nz*L/2,8,0.18,L,-q0.h+Math.PI/2),linCol(0x3b3c3f));
  }
 }
 const nearSide=(s)=>sideStreets.some(x=>Math.abs(x-s)<11);
 // 敷地割り
 const rows= kind==="darwin_cbd"? [[24,34],[66,90],[120,160],[200,260]]
  : kind==="parklands"? [] : [[SH+20,SH+22],[SH+53,SH+56],[SH+87,SH+90]];
 for(const sd of [-1,1]) for(const [oa,ob] of rows){
  let s=s0+rndr(0,8);
  while(s<s1){
   const km=this.kmOfS(view,s);
   const lotW= kind==="darwin_cbd"? rndr(30,44) : kind==="adelaide"? rndr(17,21) : rndr(18,26);
   if(nearSide(s)){ s+=lotW; continue; }
   const off=sd*rndr(oa,ob), q=this.at(view,s,off), y=q.y-0.05;
   if(kind==="darwin_cbd"){ PR.tower(bs,q.x,y,q.z,q.face,rnd()<0.55?"resi":"office"); }
   else if(kind==="darwin_sub"){
    const ind=km>5&&km<10.5;
    if(ind&&rnd()<0.8) PR.shed(bs,q.x,y,q.z,q.face);
    else if(rnd()<0.12&&Math.abs(off)<SH+20) PR.shopStrip(bs,q.x,y,q.z,q.face,2+Math.floor(rnd()*2));
    else { PR.houseTropical(bs,q.x,y,q.z,q.face); if(rnd()<0.6){ const t=this.at(view,s+rndr(-6,6),off+sd*rndr(8,14)); rnd()<0.6?PR.palm(bs,t.x,t.y,t.z,0.8):PR.tree(bs,t.x,t.y,t.z,"mango"); } }
   } else if(kind==="adelaide"){
    const r=rnd();
    if(Math.abs(off)<SH+20 && r<0.16) { PR.shopStrip(bs,q.x,y,q.z,q.face,3+Math.floor(rnd()*3)); s+=lotW*1.8; }
    else if(Math.abs(off)<SH+20 && r<0.2) PR.shed(bs,q.x,y,q.z,q.face);
    else PR.houseBrick(bs,q.x,y,q.z,q.face);
   }
   s+=lotW;
  }
 }
 if(kind==="parklands"){
  for(let i=0;i<34;i++){ const sd=rnd()<0.5?-1:1, q=this.at(view,rndr(s0,s1),sd*(SH+rndr(8,160))); PR.tree(bs,q.x,q.y,q.z,"redgum",rndr(0.8,1.2)); }
  // 右手(西)にアデレードCBDのスカイライン
  for(let i=0;i<10;i++){ const q=this.at(view,rndr(s0,s1),rndr(300,520)); PR.tower(bs,q.x,q.y,q.z,q.face,rnd()<0.3?"resi":"office"); }
 }
 if(kind==="darwin_sub"||kind==="adelaide") for(let i=0;i<10;i++){ const sd=rnd()<0.5?-1:1, q=this.at(view,rndr(s0,s1),sd*rndr(110,300)); PR.tree(bs,q.x,q.y,q.z,kind==="adelaide"?"redgum":"mango"); }
},
townOverlay(ctx){
 const {view,bs,s0,s1}=ctx, SH=view.SHOULDER;
 const lots=[];
 for(let s=s0;s<s1;s+=rndr(16,26)) for(const sd of [-1,1]){
  const km=this.kmOfS(view,s), tk=townKind(km);
  if(!tk) continue;
  const tp=townProx(km);
  if(rnd()>1.15-tp/3.5) continue;
  for(const [oa,ob] of [[SH+16,SH+26],[SH+50,SH+62],[SH+95,SH+120]]){
   if(rnd()<0.35) continue;
   const off=sd*rndr(oa,ob), q=this.at(view,s,off), y=q.y-0.05;
   if(tk==="cooberpedy"){ rnd()<0.5? PR.mullock(bs,q.x,y,q.z,0.6) : PR.houseOutback(bs,q.x,y,q.z,q.face); }
   else if(Math.abs(off)<SH+30 && rnd()<(tk==="alice"||tk==="ptaugusta"?0.3:0.12)) PR.shopStrip(bs,q.x,y,q.z,q.face,2+Math.floor(rnd()*2));
   else PR.houseOutback(bs,q.x,y,q.z,q.face);
   if(rnd()<0.35){ const t=this.at(view,s+rndr(-8,8),off+sd*rndr(6,12)); PR.tree(bs,t.x,t.y,t.z,tk==="alice"?"ghost":"redgum",0.8); }
  }
  if(rnd()<0.08){ const q=this.at(view,s,sd*(SH+rndr(30,70))); PR.windmill(bs,q.x,q.y,q.z); }
  lots.push(s);
 }
 // 町中の電柱
 if(lots.length>2){
  const poles=[];
  for(let s=Math.ceil(s0/40)*40;s<s1;s+=40){ if(!townKind(this.kmOfS(view,s))) continue;
   const q=this.at(view,s,-(SH+3)); poles.push([q.x,PR.woodPole(bs,q.x,q.y,q.z,-q.h),q.z,q.nx,q.nz]); }
  for(const k of [-0.8,0.8]) this.wires(ctx,poles.map(p=>[p[0]+p[3]*k,p[1],p[2]+p[4]*k]),[0],0.35,0x222222);
 }
},
features(ctx){
 const {view,bs,s0,s1,kmA,kmB}=ctx, SH=view.SHOULDER;
 for(const f of FEATURES){
  if(kmB<f.km0||kmA>f.km1) continue;
  if(f.id==="devils_marbles"){
   for(let i=0;i<26;i++){ const s=rndr(s0,s1); if(this.kmOfS(view,s)<f.km0||this.kmOfS(view,s)>f.km1) continue;
    const sd=rnd()<0.5?-1:1, q=this.at(view,s,sd*(SH+rndr(14,140))); PR.marbles(bs,q.x,q.y,q.z,rndr(0.8,1.4)); }
  } else if(f.id==="mullock"){
   for(let i=0;i<60;i++){ const s=rndr(s0,s1); if(this.kmOfS(view,s)<f.km0||this.kmOfS(view,s)>f.km1) continue;
    const sd=rnd()<0.5?-1:1, q=this.at(view,s,sd*(SH+rndr(20,420))); PR.mullock(bs,q.x,q.y,q.z,rndr(0.6,1.3)); }
  }
 }
},
/* 電線/フェンス線 (たるみ付き) */
wires(ctx,pts,heights,sag,color){
 if(pts.length<2) return;
 const v=[];
 for(const hh of heights) for(let i=0;i<pts.length-1;i++){
  const a=pts[i],b=pts[i+1], N=6;
  for(let k=0;k<N;k++){
   const t0=k/N,t1=(k+1)/N, s0=sag*4*t0*(1-t0), s1=sag*4*t1*(1-t1);
   v.push(lerp(a[0],b[0],t0),lerp(a[1],b[1],t0)+hh-s0,lerp(a[2],b[2],t0), lerp(a[0],b[0],t1),lerp(a[1],b[1],t1)+hh-s1,lerp(a[2],b[2],t1));
  }
 }
 const g=new THREE.BufferGeometry(); g.setAttribute("position",new THREE.Float32BufferAttribute(v,3));
 if(!this._lineMats) this._lineMats={};
 const lm=this._lineMats[color]||(this._lineMats[color]=new THREE.LineBasicMaterial({color:new THREE.Color(color).convertSRGBToLinear(),transparent:true,opacity:0.8}));
 const l=new THREE.LineSegments(g,lm); l.matrixAutoUpdate=false; ctx.grp.add(l);
},
signMesh(ctx,q,kind,text,w,h,postH,off){
 const {bs}=ctx;
 const ry=-q.h;
 const posts= w>2.2? [-w*0.35,w*0.35] : [0];
 for(const px of posts) bs.get("solid").add(tpl("box"),M4(q.x+q.nx*px,q.y,q.z+q.nz*px,0.08,postH,0.08,ry),linCol(0x9a9da0));
 if(!this._signMats) this._signMats=new Map();
 const key=kind+"|"+text;
 let mat=this._signMats.get(key);
 if(!mat){ mat=new THREE.MeshLambertMaterial({map:signTex(kind,text),side:THREE.DoubleSide}); this._signMats.set(key,mat); }
 const m=new THREE.Mesh(new THREE.PlaneGeometry(1,1),mat);
 m.scale.set(w,h,1); m.position.set(q.x,q.y+postH+h/2-0.1,q.z); m.rotation.y=ry; m.castShadow=true;
 ctx.signs.push(m);
},
roadSigns(ctx){
 const {view,s0,s1,kmA,kmB}=ctx, W=view.ROAD_W;
 const sAt=(k)=>s0+(k-kmA)/Math.max(1e-6,kmB-kmA)*(s1-s0);
 // 制限速度標識 (変化点・左側)
 for(const [k,v] of SPEED_LIMITS){ if(k>=kmA&&k<kmB&&k>0.05){ const q=this.at(view,sAt(k),-(W+3.2)); this.signMesh(ctx,q,"speed",String(v),0.9,1.12,1.9); } }
 // 方面距離標識 (町を出た直後)
 const named=ROUTE.filter(r=>r.km>0);
 for(const r of [{km:0,name:"Darwin"},...named]){
  const k=r.km+1.6;
  if(k>=kmA&&k<kmB){
   const ahead=named.filter(x=>x.km>k).slice(0,3);
   if(!ahead.length) continue;
   const txt=ahead.map(x=>`${x.name.replace(/\s*\(.*\)/,"").replace("山岳サミット","Aileron Hills").slice(0,15)}|${Math.round(x.km-r.km)}`).join("\n");
   const q=this.at(view,sAt(k),-(W+4.2)); this.signMesh(ctx,q,"green",txt,4.6,0.85*ahead.length+0.5,2.2);
  }
 }
 // 野生動物/ロードトレイン警戒標識 (内陸, 60km毎)
 for(let k=Math.ceil(kmA/60)*60;k<kmB;k+=60){
  if(isCity(k)) continue;
  const bio=biomeAt(k).id;
  const kind= (bio==="barkly"||bio==="savanna")? "cow" : (Math.floor(k/60)%3===0)? "ROAD\nTRAINS" : "kangaroo";
  const q=this.at(view,sAt(k)+20,-(W+3.0)); this.signMesh(ctx,q,"warn",kind,1.3,1.3,1.8);
 }
},
};
/* ============ 遠景の山並み (MacDonnell / Flinders / ブレイクアウェイ) ============ */
const Horizon={
mesh:null, N:192, R:1750, lastKm:-1e9, lastH:0,
build(scene){
 const N=this.N, pos=new Float32Array((N+1)*2*3), col=new Float32Array((N+1)*2*3), idx=[];
 for(let i=0;i<N;i++){ const a=i*2; idx.push(a,a+1,a+2, a+1,a+3,a+2); }
 const g=new THREE.BufferGeometry();
 g.setAttribute("position",new THREE.BufferAttribute(pos,3));
 g.setAttribute("color",new THREE.BufferAttribute(col,3));
 g.setIndex(idx);
 const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,fog:false,side:THREE.DoubleSide,depthWrite:true}));
 m.frustumCulled=false; m.renderOrder=-1;
 this.mesh=m; scene.add(m); this.lastKm=-1e9;
},
profile(km,rel){ // rel: 道路前方を0とした相対方位(右=+)
 let h=6+5*vnoise(rel*3+km*0.002,1.3)+4*vnoise(rel*11,km*0.01);
 const side=(r,c,w)=>Math.exp(-Math.pow((((r-c+Math.PI*3)%(Math.PI*2))-Math.PI)/w,2));
 const bump=(c,w,k)=>Math.max(0,1-Math.abs(km-c)/w)*k;
 // MacDonnell: アリス前後で道路を横切る東西の稜線
 const mac=bump(1496,70,1);
 if(mac>0) h+=mac*(120+90*vnoise(rel*6,3.3)+30*vnoise(rel*20,1.1))*(0.35+0.65*Math.abs(Math.sin(rel)));
 // Flinders Ranges: ポートオーガスタ以南で東(左)側
 const fl=bump(2760,140,1);
 if(fl>0) h+=fl*side(rel,-Math.PI/2,0.9)*(100+80*vnoise(rel*9,7.1)+40*vnoise(rel*25,2.2));
 // ブレイクアウェイ(メサ): クーバーペディ北西
 const br=bump(2150,60,1);
 if(br>0) h+=br*side(rel,Math.PI/2,0.7)*(vnoise(rel*7,9.9)>0.45?28:6);
 // トップエンドの丘陵 / ヘイズクリーク
 h+=bump(190,120,1)*(25+20*vnoise(rel*5,4.4));
 // ジェームズ山脈(アリス南)
 h+=bump(1590,60,1)*(45+35*vnoise(rel*7,8.8))*Math.abs(Math.sin(rel));
 return h;
},
update(view,es){
 if(!this.mesh) return;
 const cam=view.camera.position, p=view.roadPoint(view.s);
 this.mesh.position.set(cam.x,p.y-30,cam.z);
 const km=es.km;
 if(Math.abs(km-this.lastKm)>0.5 || Math.abs(p.h-this.lastH)>0.02){
  this.lastKm=km; this.lastH=p.h;
  const pos=this.mesh.geometry.attributes.position.array;
  for(let i=0;i<=this.N;i++){
   const a=i/this.N*Math.PI*2;
   const x=Math.sin(a)*this.R, z=-Math.cos(a)*this.R;
   const rel=a-p.h;
   const h=this.profile(km,rel);
   pos.set([x,-5,z, x,h+30,z],i*6);
  }
  this.mesh.geometry.attributes.position.needsUpdate=true;
 }
 // 色: 地平線色に大気遠近でなじませる
 const fogC=view.scene.fog?view.scene.fog.color:new THREE.Color(0.7,0.8,0.9);
 const bio=biomeAt(km);
 const rock=new THREE.Color(bio.id==="alice"||bio.id==="south_nt"?0x7a4a3a:bio.id==="pt_augusta"||bio.id==="farm"?0x5f6670:0x6a5a4c).convertSRGBToLinear();
 const top=rock.clone().lerp(fogC,0.4), bot=rock.clone().lerp(fogC,0.75);
 const col=this.mesh.geometry.attributes.color.array;
 for(let i=0;i<=this.N;i++){ col.set([bot.r,bot.g,bot.b, top.r,top.g,top.b],i*6); }
 this.mesh.geometry.attributes.color.needsUpdate=true;
},
};
