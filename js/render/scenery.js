"use strict";
/* ============ チャンク単位の地形・道路・景観生成 ============
 視覚空間の距離 s[m] と実距離 km の対応: km = 現在km + (s - View.s) * timeScale / 1000 */
const TERRAIN_OFFS=[0,3.5,7,12,18,26,38,55,80,115,165,235,330,460,640,900];
const SKIRT_OFF=1500;
const _sc=new THREE.Color(), _sv=new THREE.Color();
const Scenery={
kmOfS(view,s){ return view.kmOfS(s); },
/* 走行可能な舗装敷地 (CS構内・ドライバー交代の駐車帯・ゴール) → {y} */
pavedSite(view,s,lat){
 const km=view.kmOfS(s);
 for(const c of RP_CS) if(Math.abs(km-c.km)<0.16&&Math.abs(lat)<24) return {y:0.02,cs:c};
 const dc=RP_RULES.driverChange;
 if(km>dc.km-0.03&&km<dc.km+dc.len+0.03&&lat<-view.ROAD_W+0.5&&lat>-view.ROAD_W-16) return {y:0.02,dc:true};
 if(km>RP_FINISH.km-0.12&&Math.abs(lat)<40) return {y:0.02,finish:true};
 return null;
},
salt(km,off){ return off>110 && featureAt(km).some(f=>f.id==="salt_lake"&&Math.sign(off)===f.side); },
/* 地表の高さ (道路中心高さ基準の相対値) */
groundRel(x,z,off,bio,km){
 if(this.salt(km,off)) return -0.25;
 if(Route.inZone(km)) return -0.18;      // 等倍ゾーン(町中の右左折区間)は平坦: 他の道路区間を地形が覆わないように
 const a=Math.abs(off);
 const urb=bio.urban?0.25:1;
 const h=-0.18+terrainH(x,z,a,bio.hill*urb);
 return Math.min(h,this.branchCap(x,z));
},
/* 分岐道路の周囲は道路面より下へ (地形が脇道を埋めないように) — 戻り値は本線行の高さ基準 */
branchCap(x,z){
 const brs=this._capBr; if(!brs||!brs.length) return Infinity;
 let cap=Infinity;
 for(const b of brs){
  if(Math.abs(x-b.cx)>b.R||Math.abs(z-b.cz)>b.R) continue;
  let bd=1e9; const P=b.pts;
  for(let i=0;i<P.length-1;i+=1){ const p=P[i], q=P[i+1], dx=q.x-p.x, dz=q.z-p.z, L2=dx*dx+dz*dz||1;
   const t=clamp(((x-p.x)*dx+(z-p.z)*dz)/L2,0,1), d=(p.x+dx*t-x)**2+(p.z+dz*t-z)**2; if(d<bd) bd=d; }
  const d=Math.sqrt(bd);
  if(d<b.half+14){ const base=b.y0-(this._rowY||0)-0.15; const k=clamp((d-b.half-3)/11,0,1); cap=Math.min(cap, base+k*6); }
 }
 return cap;
},
/* メッシュと同じ折れ線補間で地表高さを返す(物体の接地用) */
groundY(view,s,off){
 const p=view.roadPoint(clamp(s,0,view.road.builtS-0.01)), nx=Math.cos(p.h), nz=Math.sin(p.h);
 const km=this.kmOfS(view,s), bio=biomeAt(km), SH=view.SHOULDER;
 this._rowY=p.y;
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
  this._rowY=p.y;
  const [cp,cn]=view.maxCurv(s,45), limR=cp>1/700?0.9/cp:1e9, limL=cn>1/700?0.9/cn:1e9;
  for(const c0 of cols){
   const c=(c0.off>limR||-c0.off>limL)? Object.assign({},c0,{off:c0.off>0?Math.min(c0.off,limR):-Math.min(-c0.off,limL)}) : c0;
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
 // ---- 分岐道路を先に作る (周囲の地形をその高さに合わせるため) ----
 const bs=new BatchSet();
 const signs=[];
 const ctx={view,grp,bs,signs,s0,s1,kmA,kmB,branches:[]};
 grp.userData.branches=ctx.branches;
 if(P.mode==="race") this.branches(ctx);
 this._capBr=view.branches.filter(b=>b.sJ>s0-400&&b.sJ<s1+400);
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
 this.buildOcc(ctx); this._ctxOcc=ctx.occ;
 if(P.mode==="race") this.sites(ctx);
 if(urban) this.urban(ctx,urban); else this.rural(ctx);
 this.townOverlay(ctx);
 this.features(ctx);
 this.roadSigns(ctx);
 this._ctxOcc=null; this._capBr=null;
 bs.toGroup(grp);
 for(const sg of signs) grp.add(sg);
 return grp;
},
/* 分岐道路の入口付近か (街灯・ガイドポスト・フェンスを置かない) */
brNear(view,s,w=0){ for(const b of view.branches){ if(Math.abs(b.sJ-s)<b.half+4+w) return true; } return RP_MANEUVERS.some(m=>Math.abs(view.sOfKm(m.km)-s)<30+w); },
/* 道路(本線の他区間・分岐)との重なり判定用の占有グリッド */
buildOcc(ctx){
 const view=ctx.view, CS=4, near=new Set(), far=new Set();
 const mark=(set,x,z,R)=>{ for(let dx=-R;dx<=R;dx+=CS) for(let dz=-R;dz<=R;dz+=CS){ if(dx*dx+dz*dz>R*R) continue; set.add(Math.floor((x+dx)/CS)+","+Math.floor((z+dz)/CS)); } };
 const P=view.road.pts, i0=Math.max(0,Math.floor((ctx.s0-400)/view.SEG)), i1=Math.min(P.length-1,Math.ceil((ctx.s1+400)/view.SEG));
 for(let i=i0;i<=i1;i+=2){ mark(near,P[i].x,P[i].z,view.ROAD_W+3); mark(far,P[i].x,P[i].z,view.ROAD_W+15); }
 for(const b of view.branches) if(Math.abs(b.sJ-(ctx.s0+ctx.s1)/2)<b.len+500) for(const q of b.pts){ mark(near,q.x,q.z,b.half+3); mark(far,q.x,q.z,b.half+15); }
 ctx.occ={near,far,CS,
  // own: 自分の区間(sOwn 付近)は除外して判定
  hit:(x,z,kind,sOwn,offOwn)=>{ const set=kind==="far"?far:near; if(!set.has(Math.floor(x/CS)+","+Math.floor(z/CS))) return false;
   // 自分の区間由来のヒットを除く: 本線の同じ区間までの距離が十分あれば他区間/分岐との重なり
   const ownR=(kind==="far"?view.ROAD_W+15:view.ROAD_W+3);
   if(Math.abs(offOwn)>ownR+2){ // 自分の区間とは十分離れている → 他道路に重なっている
    return true; }
   return false; }};
},
/* 位置ヘルパ: s, 横オフセット → ワールド座標 & 道路向き */
at(view,s,off){
 const p=view.roadPoint(clamp(s,0,view.road.builtS-0.01)), nx=Math.cos(p.h), nz=Math.sin(p.h);
 const x=p.x+nx*off, z=p.z+nz*off;
 const occ=this._ctxOcc;
 return { x, z, y:this.groundY(view,s,off), h:p.h, nx, nz, fx:Math.sin(p.h), fz:-Math.cos(p.h),
  face: off<0? -p.h-Math.PI/2 : -p.h+Math.PI/2,
  blocked: occ? occ.hit(x,z,"near",s,off) : false, blockedFar: occ? occ.hit(x,z,"far",s,off) : false };
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
    if(q.blocked||this.salt(km,off)) continue;
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
  if(this.brNear(view,s)) continue;
  const q=this.at(view,s,sd*(W+2.3)); PR.guidePost(bs,q.x,q.y+0.03,q.z,-q.h,sd<0);
 }
 // 牧場の境界フェンス (農地は常時/内陸は時々)
 const w=this.floraWeights(this.kmOfS(view,(s0+s1)/2));
 const fenceP=(w.fence||0)>0.5?1:(biomeAt(this.kmOfS(view,s0)).id==="barkly"||biomeAt(this.kmOfS(view,s0)).id==="sa_north")?0.6:0.25;
 if(rnd()<fenceP){
  for(const sd of [-1,1]){
   const off=sd*(SH+rndr(14,22)), pts=[];
   for(let s=Math.ceil(s0/8)*8;s<s1;s+=8){ if(this.brNear(view,s)){ this.wires(ctx,pts,[0.55,0.95],0.02,0x6b5d4f); pts.length=0; continue; } const q=this.at(view,s,off); PR.fencePost(bs,q.x,q.y,q.z,-q.h); pts.push([q.x,q.y,q.z]); }
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
  if(this.brNear(view,s)) continue;
  const q=this.at(view,s,sd*(SH-0.8));
  PR.streetLight(bs,q.x,q.y,q.z,-sd*q.nx,-sd*q.nz);
 }
 for(let s=Math.ceil(s0/16)*16+8;s<s1;s+=16) for(const sd of [-1,1]){
  if(rnd()<0.25) continue;
  if(this.brNear(view,s)) continue;
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
   if(q.blockedFar){ s+=lotW; continue; }
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
   if(q.blockedFar) continue;
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
 const {view,kmA,kmB}=ctx, W=view.ROAD_W;
 const sAt=(k)=>view.sOfKm(k);
 // 制限速度標識 (Route Notes の変化点・左側)
 for(const [k,v] of Route.limits()){ if(k>=kmA&&k<kmB&&k>0.05){ const q=this.at(view,sAt(k),-(W+3.2)); this.signMesh(ctx,q,"speed",String(v),0.9,1.12,1.9); } }
 for(const e of Route.eventsIn(kmA,kmB)){
  const sq=sAt(e.km);
  if(e.k==="distsign"){ // 距離標識 (例: "TC 100" = Tennant Creek まで100km)
   const q=this.at(view,sq,-(W+4.0)); this.signMesh(ctx,q,"green",String(e.v),2.4,1.0,2.0);
  } else if(e.k==="hwmarker"&&e.v!=null){ // SA の道路距離ポスト (道路から約10m・1km毎)
   const q=this.at(view,sq,-(W+10)); ctx.bs.get("solid").add(tpl("box"),M4(q.x,q.y,q.z,0.12,1.2,0.12,-q.h),linCol(0xf2f2ee));
   this.signMesh(ctx,q,"banner",String(e.v),0.35,0.25,1.0);
  } else if(e.k==="warn"){
   const q=this.at(view,sq,-(W+3.0)); this.signMesh(ctx,q,"warn",e.v==="CREST"?"CREST":e.v==="FLOOD"?"FLOOD\nWAY":"cow",1.3,1.3,1.8);
  } else if(e.k==="otl"||e.k==="otl_start"){
   const q=this.at(view,sq,-(W+3.4)); this.signMesh(ctx,q,"green","OVERTAKING LANE\n1 km",2.6,1.0,1.9);
  } else if(e.k==="works"){
   for(let k=0;k<14;k++){ const q=this.at(view,sq+k*6,-(W-0.4)); ctx.bs.get("solid").add(tpl("cone7"),M4(q.x,q.y,q.z,0.2,0.7,0.2),linCol(0xff6a00)); }
   const q=this.at(view,sq-40,-(W+3.0)); this.signMesh(ctx,q,"warn","ROAD\nWORK",1.3,1.3,1.8);
  } else if(e.k==="gravel"){
   const q=this.at(view,sq-30,-(W+3.0)); this.signMesh(ctx,q,"warn","LOOSE\nGRAVEL",1.3,1.3,1.8);
  } else if(e.k==="tower"){ // 無線塔 (トラス鉄塔)
   const off=(e.v==="R"?1:-1)*(W+rndr(25,60)), q=this.at(view,sq,off);
   for(const [dx,dz] of [[-1,-1],[1,-1],[1,1],[-1,1]]) ctx.bs.get("solid").add(tpl("cyl5"),M4(q.x+dx*0.9,q.y,q.z+dz*0.9,0.06,42,0.06,0,-dz*0.02,dx*0.02),linCol(0xc8c8c8));
   for(let k=0;k<14;k++) ctx.bs.get("solid").add(tpl("boxC"),M4(q.x,q.y+k*3,q.z,2*(1-k/16),0.06,2*(1-k/16)),linCol(k%2?0xd23b2b:0xeeeeee));
   ctx.bs.get("solid").add(tpl("box"),M4(q.x+4,q.y,q.z+3,3,2.6,2.4,-q.h),linCol(0xd9d6c8));
  } else if(e.k==="solarfarm"){ // 太陽光パネル群
   const sd=e.v==="R"?1:-1;
   for(let r=0;r<6;r++) for(let k=0;k<5;k++){ const q=this.at(view,sq+k*9-18,sd*(W+28+r*6));
    ctx.bs.get("solid").add(tpl("boxC"),M4(q.x,q.y+1.1,q.z,7.5,0.06,3.0,-q.h,0.45,0),linCol(0x1b2a44));
    ctx.bs.get("solid").add(tpl("box"),M4(q.x,q.y,q.z,0.1,1.0,0.1,-q.h),linCol(0x9a9da0)); }
  }
 }
 // 右左折の予告標識 (緑) と動作地点の矢印
 for(const m of Route.maneuversIn(kmA-0.2,kmB)){
  if(!m.name||m.name.startsWith("(")) continue;
  const sq=sAt(m.km)-60;
  if(sq>=ctx.s0&&sq<ctx.s1){ const arrow={L:"← ",R:"→ ",veerL:"↖ ",veerR:"↗ ",rab:"⟳ ",uturn:"",keepL:"↖ ",keepR:"↗ ",keepS:"↑ "}[m.turn]||"";
   const q=this.at(view,sq,-(W+4.2)); this.signMesh(ctx,q,"green",arrow+m.name.slice(0,20),4.4,1.0,2.2); }
 }
},
/* ---- 分岐道路 (脇道 t/o・信号の交差道路・曲がり損ね) ---- */
makeBranch(ctx,sJ,angle,opt){
 const view=ctx.view, p=view.roadPoint(sJ), h0=(opt.h!=null?opt.h:p.h);
 const h=h0+angle, W=view.ROAD_W, half=opt.half||3.6, step=5;
 const fx=Math.sin(h), fz=-Math.cos(h);
 const start= opt.fromCentre? [p.x,p.z] : [p.x+Math.cos(p.h)*Math.sign(angle||1)*Math.abs(Math.sin(angle))*(W-0.5), p.z+Math.sin(p.h)*Math.sign(angle||1)*Math.abs(Math.sin(angle))*(W-0.5)];
 const pts=[]; let x=start[0], z=start[1], hh=h, wob=(rnd()-0.5)*0.004;
 const len=opt.len||220;
 const jf=[Math.sin(p.h),-Math.cos(p.h)], jr=[Math.cos(p.h),Math.sin(p.h)];
 for(let d=0;d<=len;d+=step){
  const along=(x-p.x)*jf[0]+(z-p.z)*jf[1], lat=(x-p.x)*jr[0]+(z-p.z)*jr[1];
  const y=p.y+0.012;   // 分岐道路は接続点の高さで平坦 (周囲の地形を下げて合わせる)
  pts.push({x,z,y});
  if(d>30) hh+=wob;
  x+=Math.sin(hh)*step; z-=Math.cos(hh)*step;
 }
 const b={pts,sJ,kmJ:view.kmOfS(sJ),len,half,step,name:opt.name||"",wrong:!!opt.wrong,surface:opt.surface||"asph",y0:p.y,
  cx:(pts[0].x+pts[pts.length-1].x)/2, cz:(pts[0].z+pts[pts.length-1].z)/2, R:len/2+40};
 // メッシュ
 const pos=[],uv=[],idx=[];
 for(let i=0;i<pts.length;i++){
  const a=pts[Math.max(0,i-1)], c=pts[Math.min(pts.length-1,i+1)];
  const dx=c.x-a.x, dz=c.z-a.z, L=Math.hypot(dx,dz)||1, rx=-dz/L, rz=dx/L;
  pos.push(pts[i].x-rx*half,pts[i].y,pts[i].z-rz*half, pts[i].x+rx*half,pts[i].y,pts[i].z+rz*half);
  uv.push(0,i*step/12, 1,i*step/12);
  if(i>0){ const q=(i-1)*2; idx.push(q,q+1,q+2, q+1,q+3,q+2); }
 }
 const g=new THREE.BufferGeometry(); g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3)); g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2)); g.setIndex(idx); g.computeVertexNormals();
 const nn=g.attributes.normal; for(let i=0;i<nn.count;i++) if(nn.getY(i)<0) nn.setXYZ(i,-nn.getX(i),-nn.getY(i),-nn.getZ(i));
 if(!this._brMat) this._brMat={
  asph:new THREE.MeshLambertMaterial({map:roadTex("urban"),side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1}),
  gravel:new THREE.MeshLambertMaterial({color:new THREE.Color(0x9c7450).convertSRGBToLinear(),map:detailTex(),side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1})};
 const m=new THREE.Mesh(g,this._brMat[b.surface]); m.receiveShadow=true; m.matrixAutoUpdate=false;
 ctx.grp.add(m);
 // 道路名標識 (分岐の入口)
 if(opt.name&&opt.sign!==false){ const q={x:start[0]+fx*6+Math.cos(h)*(half+1.5),z:start[1]+fz*6+Math.sin(h)*(half+1.5),y:p.y,h:h,nx:Math.cos(h),nz:Math.sin(h)};
  this.signMesh(ctx,q,"green",opt.name.slice(0,18),2.6,0.55,2.2); }
 ctx.branches.push(b); view.branches.push(b);
 return b;
},
branches(ctx){
 const {view,kmA,kmB,s0,s1}=ctx;
 const D=Math.PI/180;
 // 曲がり損ね (ルートの右左折地点)
 for(const j of view.junctions){
  if(j.s<s0||j.s>=s1||j.built) continue; j.built=true;
  const m=j.m; if(!m.wrong) continue;
  const ang={S:0,L:-90*D,R:90*D,veerL:-30*D,veerR:30*D}[m.wrong]||0;
  const nm={S:"(直進)",L:"(左)",R:"(右)"}[m.wrong]||"";
  this.makeBranch(ctx,j.s,ang,{h:j.h,wrong:true,name:m.wrong==="S"? (m.note&&m.note.includes("空港")?"Airport Road":"") : "",len:m.wrong==="S"?260:200,fromCentre:m.wrong==="S"||m.wrong.startsWith("veer"),sign:false});
 }
 // 曲がってはいけない分岐 (Daly Waters 等)
 for(const t of RP_TRAPS){ if(t.km>=kmA&&t.km<kmB&&!t.dummy) this.makeBranch(ctx,view.sOfKm(t.km),(t.side==="R"?90:-90)*D,{wrong:true,name:t.name,len:240}); }
 // 脇道 (t/o) — すべて走行可能
 const near=(k)=>RP_MANEUVERS.some(m=>Math.abs(m.km-k)<0.08);
 for(const e of Route.eventsIn(kmA,kmB,"sideroad")){
  if(near(e.km)) continue;
  const dirt=/station|track|dirt|H\/S|homestead|quarry|stn|camp/i.test(e.t);
  const name=e.t.replace(/\b(t\/o|on|left|right|Straight ahead|Exit|Turn off).*$/i,"").trim().slice(0,22);
  this.makeBranch(ctx,view.sOfKm(e.km),(e.v==="R"?1:-1)*(80+rnd()*20)*D,{name,surface:dirt?"gravel":"asph",half:dirt?3.0:3.6,len:200});
 }
 // 信号交差点の交差道路 (左右とも)
 for(const e of Route.eventsIn(kmA,kmB,"signal")){
  if(near(e.km)) continue;
  for(const sd of [-1,1]) this.makeBranch(ctx,view.sOfKm(e.km),sd*90*D,{name:sd<0?e.t.split(/Traffic|traffic/)[0].trim().slice(0,20):"",len:160});
 }
 // ラウンドアバウトの他の出口
 for(const j of view.junctions){ if(j.s>=s0&&j.s<s1&&j.m.turn==="rab"&&!j.rabBuilt){ j.rabBuilt=true;
  for(const a of [-90,90]) if(!((j.m.exit==="R"&&a===90)||(j.m.exit==="L"&&a===-90))) this.makeBranch(ctx,j.s+26,a*D,{h:j.h,len:150,sign:false}); } }
},
/* ---- CS 構内・強制ドライバー交代の駐車帯・スタート/ゴール ---- */
padRibbon(ctx,sa,sb,la,lb,color,y=0.012){
 const view=ctx.view, c=new THREE.Color(color).convertSRGBToLinear();
 if(!this._padMat) this._padMat=new THREE.MeshLambertMaterial({vertexColors:true,map:detailTex(),polygonOffset:true,polygonOffsetFactor:-1});
 const sA=clamp(sa,0,view.road.builtS-1), sB=clamp(sb,0,view.road.builtS-1); if(sB-sA<5) return;
 ctx.grp.add(this.ribbon(view,sA,sB,[{off:la},{off:lb}],this._padMat,()=>({at:(cc,x,z)=>({y,c,u:x*0.25,v:z*0.25})})));
},
banner(ctx,s,lat,w,text,bg,fg,hgt=4.8){
 const view=ctx.view, q=this.at(view,s,lat), ry=-q.h;
 for(const sd of [-1,1]){ const px=q.x+q.nx*sd*w/2, pz=q.z+q.nz*sd*w/2; ctx.bs.get("solid").add(tpl("box"),M4(px,q.y,pz,0.35,hgt+1.2,0.35,ry),linCol(0x30343a)); }
 const m=new THREE.Mesh(new THREE.PlaneGeometry(w,1.3),new THREE.MeshLambertMaterial({map:HV.textBoard(text,bg,fg),side:THREE.DoubleSide}));
 m.position.set(q.x,q.y+hgt+0.5,q.z); m.rotation.y=ry; ctx.grp.add(m);
},
crowd(ctx,s,lat,n,spread,shirts){
 for(let i=0;i<n;i++){ const q=this.at(ctx.view,s+rndr(-spread,spread),lat+rndr(-2,2)); PR.person(ctx.bs,q.x,q.y,q.z,rnd()*6.28,rndPick(shirts)); }
},
sites(ctx){
 const {view,kmA,kmB,bs}=ctx, W=view.ROAD_W;
 const sAt=(k)=>view.sOfKm(k);
 // コントロールストップ
 for(const c of RP_CS){
  if(c.km<kmA-0.2||c.km>=kmB+0.2) continue;
  const sc=sAt(c.km); if(sc<ctx.s0-150||sc>=ctx.s1+150) continue;
  if(c.km<kmA||c.km>=kmB) continue;      // 1チャンクで一度だけ
  const padCol={weigh:0x8a8780,roadhouse:0x9a8a74,lot:0x8d8b85,park:0x8d8b85,oval:0x8d8b85}[c.site]||0x8d8b85;
  this.padRibbon(ctx,sc-150,sc+150,-24,24,padCol);
  if(c.site==="park"||c.site==="oval"){ // 芝のオーバル
   const q=this.at(view,sc,40); const m=new THREE.Mesh(new THREE.CircleGeometry(1,48),new THREE.MeshLambertMaterial({color:new THREE.Color(0x6f9a3f).convertSRGBToLinear()}));
   m.scale.set(45,30,1); m.rotation.x=-Math.PI/2; m.position.set(q.x,q.y+0.01,q.z); ctx.grp.add(m);
  }
  // 入口アーチ・停止枠・計時テント・係員
  this.banner(ctx,sc-45,0,14,`CONTROL STOP ${c.n} — ${c.name.toUpperCase()}`,"#c8102e","#ffffff");
  const q=this.at(view,sc,-2.4);
  bs.get("solid").add(tpl("box"),M4(q.x,q.y+0.015,q.z,0.25,0.01,5.2,-q.h),linCol(0xffffff));
  for(const d of [-2.6,2.6]){ const r=this.at(view,sc+d,-2.4); bs.get("solid").add(tpl("box"),M4(r.x,r.y+0.015,r.z,4.2,0.01,0.25,-r.h),linCol(0xffffff)); }
  const sq=this.at(view,sc+4,-2.4); this.signMesh(ctx,{...sq,y:sq.y-1.6},"banner","STOP",1.6,0.6,0.02);
  for(const [ds,dl] of [[-10,-12],[10,-12],[25,14]]){ const t=this.at(view,sc+ds,dl);
   for(const [u,v] of [[-1,-1],[1,-1],[1,1],[-1,1]]) bs.get("solid").add(tpl("cyl5"),M4(t.x+u*2.9,t.y,t.z+v*2.9,0.05,2.6,0.05),linCol(0x8a8d90));
   bs.get("solidDS").add(tpl("hiproof"),M4(t.x,t.y+2.6,t.z,6,0.9,6,-t.h),linCol(0xffffff)); }
  this.crowd(ctx,sc,-11,8,10,[0xf6c400,0xf97316]);
  this.crowd(ctx,sc+20,14,6,12,[0x2a5aa0,0xffffff,0xc0392b]);
  for(let k=0;k<5;k++){ const t=this.at(view,sc-60+k*28,18); PR.car(bs,t.x,t.y,t.z,-t.h+Math.PI/2*0,rnd()<0.5); }
  if(c.site==="roadhouse"){ const t=this.at(view,sc+40,-36); PR.roadhouse(bs,t.x,t.y,t.z,t.face); }
  if(c.site==="weigh"){ const t=this.at(view,sc+30,-30); PR.shed(bs,t.x,t.y,t.z,t.face); }
  for(let k=0;k<16;k++){ const t=this.at(view,sc-80+k*10,(k%2?1:-1)*(W+1.2)); bs.get("solid").add(tpl("cone7"),M4(t.x,t.y,t.z,0.2,0.7,0.2),linCol(0xff6a00)); }
  const lim=this.at(view,sc-140,-(W+3.2)); this.signMesh(ctx,lim,"speed","25",0.9,1.12,1.9);
 }
 // 強制ドライバー交代 (Emerald Springs, ロードトレイン駐車帯 左側)
 const dc=RP_RULES.driverChange;
 if(dc.km>=kmA&&dc.km<kmB){
  const sa=sAt(dc.km-0.03), sb=sAt(dc.km+dc.len+0.03);
  this.padRibbon(ctx,sa,sb,-W-16,-W+0.2,0x6a6560,0.005);
  this.banner(ctx,sa+20,-W-8,14,"COMPULSORY DRIVER CHANGE","#1f4f9c","#ffffff",3.6);
  this.crowd(ctx,(sa+sb)/2,-W-15,4,40,[0xf6c400]);
  const q=this.at(view,sa-80,-(W+4.2)); this.signMesh(ctx,q,"blue","DRIVER CHANGE\nUSE LEFT LANES",3.6,1.6,2.0);
  const e=this.at(view,(sa+sb)/2+30,-W-40); PR.roadhouse(bs,e.x,e.y,e.z,e.face);
 }
 // スタート: State Square (Darwin) ― Parliament House 前
 if(kmA<=0.001&&ctx.s0<view.sOfKm(0.01)){
  const s0=view.sOfKm(0);
  this.padRibbon(ctx,s0-200,s0+40,-30,30,0xc9c4b8);
  this.banner(ctx,s0,0,16,"BRIDGESTONE WORLD SOLAR CHALLENGE — START","#ffffff","#c8102e",5.2);
  const ph=this.at(view,s0-60,-62);   // Parliament House (白い大きな立方体の建物・列柱)
  bs.get("solid").add(boxMetric(70,26,50),M4(ph.x,ph.y,ph.z,1,1,1,ph.face),linCol(0xf4f2ec));
  for(let k=0;k<12;k++){ const t=this.at(view,s0-60-30+k*5.4,-36); bs.get("solid").add(tpl("box"),M4(t.x,t.y,t.z,0.8,22,0.8,-t.h),linCol(0xfbfaf6)); }
  bs.get("solid").add(boxMetric(76,2,56),M4(ph.x,ph.y+26,ph.z,1,1,1,ph.face),linCol(0xe7e4dc));
  const sc=this.at(view,s0-60,62); bs.get("office").add(boxMetric(40,18,30,6,7),M4(sc.x,sc.y,sc.z,1,1,1,sc.face),linCol(0xffffff)); // Supreme Court 側の建物
  this.crowd(ctx,s0-60,-24,40,90,[0xffffff,0xc8102e,0x1f4f9c,0xf6c400,0x2e7d4f]);
  this.crowd(ctx,s0-60,24,40,90,[0xffffff,0xc8102e,0x1f4f9c,0xf6c400,0x2e7d4f]);
  for(let k=0;k<10;k++){ const t=this.at(view,s0-20-k*14,(k%2?1:-1)*4); PR.solarCar(bs,t.x,t.y,t.z,-t.h+Math.PI,rndPick(["cat","mono","cruiser"]),rndPick([0xffffff,0xf97316,0x1f5f9b,0xc0392b])); }
  for(let k=0;k<8;k++){ const t=this.at(view,s0-180+k*22,(k%2?1:-1)*20); PR.palm(bs,t.x,t.y,t.z,0.9); }
 }
 // ゴール: Victoria Park (Adelaide) のステージングエリア
 const fk=RP_FINISH.km;
 if(fk>=kmA-0.15&&fk<kmB){
  const sf=sAt(fk);
  if(sf>=ctx.s0-200&&sf<ctx.s1){
   this.padRibbon(ctx,sf-120,sf+160,-40,40,0x7f9348,0.006);
   this.padRibbon(ctx,sf-10,sf+120,-14,14,0x8d8b85);
   this.banner(ctx,sf,0,18,"FINISH — VICTORIA PARK","#111111","#ffffff",5.6);
   for(let k=0;k<12;k++){ const t=this.at(view,sf+12,-7+k*1.3); bs.get("solid").add(tpl("box"),M4(t.x,t.y+0.016,t.z,1.3,0.01,0.6,-t.h),linCol(k%2?0x111111:0xffffff)); }
   this.crowd(ctx,sf+30,-18,50,80,[0xffffff,0xc8102e,0x1f4f9c,0xf6c400,0x2e7d4f,0xf97316]);
   this.crowd(ctx,sf+30,18,50,80,[0xffffff,0xc8102e,0x1f4f9c,0xf6c400,0x2e7d4f,0xf97316]);
   for(let k=0;k<14;k++){ const t=this.at(view,sf+40+(k>>1)*18,(k%2?1:-1)*26);
    for(const [u,v] of [[-1,-1],[1,-1],[1,1],[-1,1]]) bs.get("solid").add(tpl("cyl5"),M4(t.x+u*2.9,t.y,t.z+v*2.9,0.05,2.6,0.05),linCol(0x8a8d90));
    bs.get("solidDS").add(tpl("hiproof"),M4(t.x,t.y+2.6,t.z,6,0.9,6,-t.h),linCol(rndPick([0xffffff,0xf97316,0x1f5f9b,0xc0392b,0x2e7d4f]))); }
   for(let k=0;k<20;k++){ const t=this.at(view,sf+rndr(-100,150),(rnd()<0.5?-1:1)*rndr(45,90)); PR.tree(bs,t.x,t.y,t.z,"redgum"); }
  }
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
