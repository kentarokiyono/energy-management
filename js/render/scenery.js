"use strict";
const view_SH=()=>View.SHOULDER;
/* ============ チャンク単位の地形・道路・景観生成 ============
 視覚空間の距離 s[m] と実距離 km の対応: km = 現在km + (s - View.s) * timeScale / 1000 */
const TERRAIN_OFFS=[0,3.5,7,12,18,26,38,55,80,115,165,235,330,460,640,900];
const SKIRT_OFF=1500;
const _sc=new THREE.Color(), _sv=new THREE.Color();
const Scenery={
kmOfS(view,s){ return view.kmOfS(s); },
/* 横オフセットを道路断面に合わせる: ±ROAD_W 以遠は左端 L / 右端 R からの距離として扱う */
warpOff(p,off){ const W=5; if(off<=-W+0.01) return off-((p.L||W)-W); if(off>=W-0.01) return off+((p.R||W)-W); return off; },
/* 走行可能な舗装敷地 (CS構内・ドライバー交代の駐車帯・ゴール) → {y} */
/* 橋の下の川・海 (建物・電柱を置かない範囲) */
waterSite(view,s,lat){ const km=view.kmOfS(s); return Math.abs(lat)<190&&Route.real(km)&&[-0.015,0,0.015].some(d=>OsmRoute.waterAt(km+d)); },
pavedSite(view,s,lat){
 const km=view.kmOfS(s);
 for(const c of RP_CS){ const osm=OsmRoute.townAt(c.km); if(Math.abs(km-c.km)<(osm?0.045:0.16)&&Math.abs(lat)<(osm?14:24)) return {y:0.02,cs:c}; }
 const dc=RP_RULES.driverChange;
 if(km>dc.km-0.03&&km<dc.km+dc.len+0.03&&lat<-view.ROAD_W+0.5&&lat>-view.ROAD_W-16) return {y:0.02,dc:true};
 if(km>RP_FINISH.km-0.12&&Math.abs(lat)<40) return {y:0.02,finish:true};
 return null;
},
salt(km,off){ return off>110 && featureAt(km).some(f=>f.id==="salt_lake"&&Math.sign(off)===f.side); },
/* 地表の高さ (道路中心高さ基準の相対値) */
groundRel(x,z,off,bio,km){
 if(this._rowWd>0) return -this._rowWd-0.6;           // 水面の橋: 下は川底/海 (水面は bridges() で描く)
 if(this._rowBh>0&&(this._rowDeck||Math.abs(off)>=view_SH()+3.4)) return -this._rowBh-0.18;   // 立体交差: 盛土の外/橋桁の下は元の地面
 if(this.salt(km,off)) return -0.25;
 const zf=Route.zoneFade(km);      // 等倍ゾーン(町中の右左折区間)は平坦: 他の道路区間を地形が覆わないように。境界は滑らかに
 if(zf<=0) return -0.18;
 const a=Math.abs(off);
 const urb=bio.urban?0.25:1;
 const h=-0.18+terrainH(x,z,a,bio.hill*urb*zf);
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
 this._rowY=p.y; this._rowBh=p.bh||0; this._rowDeck=!!p.deck; this._rowWd=p.wd||0;
 const sd=Math.sign(off)||1, a=Math.abs(off)-SH;
 if(a<=0) return p.y+(bio.urban?0.15:-0.05);
 let i=0; while(i<TERRAIN_OFFS.length-2 && TERRAIN_OFFS[i+1]<a) i++;
 const hAt=(o)=>{ const oo=SH+o; if(o===0) return bio.urban?0.15:-0.05; const ow=this.warpOff(p,oo*sd); return this.groundRel(p.x+nx*ow,p.z+nz*ow,oo*sd,bio,km); };
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
  this._rowY=p.y; this._rowBh=p.bh||0; this._rowDeck=!!p.deck; this._rowWd=p.wd||0;
  const [cp,cn]=view.maxCurv(s,45), limR=cp>1/700?0.9/cp:1e9, limL=cn>1/700?0.9/cn:1e9;
  for(const c0 of cols){
   let off= c0.offFn? c0.offFn(p) : c0.warp===false? c0.off : this.warpOff(p,c0.off);
   if(off>limR) off=limR; if(-off>limL) off=-limL;
   const c=Object.assign({},c0,{off,off0:c0.off!=null?c0.off:off});
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
 if(P.mode==="race"){ this.branches(ctx); this.roundabouts(ctx); }
 this._capBr=view.branches.filter(b=>b.sJ>s0-400&&b.sJ<s1+400);
 // ---- 路面 ----
 const roadMat=SceneMats.get(urban?"road_urban":"road_rural").mat;
 const white=new THREE.Color(1,1,1);
 // 自分側の車道 [-L,0] と対向側 [m1,R]。2車線道路はテクスチャの左右半分 (中央の破線が中央線)、
 // 上下線分離/多車線は各車道に全幅 (両端の実線 + 車線境界の破線)
 const uOf=(p,k,right)=> p.dual? k : (right? 0.5+k*0.5 : k*0.5);
 const hid=new Map(), sink=(s)=>{ const k=Math.round(s*4); if(!hid.has(k)) hid.set(k,P.mode==="race"&&this.rowHidden(view,s)?-0.12:0); return hid.get(k); };
 grp.add(this.ribbon(view,s0,s1,[{offFn:p=>-p.L,k:0},{offFn:p=>-p.L/2,k:0.5},{offFn:()=>0,k:1}],roadMat,(s,p)=>{ const y=sink(s); return {at:(c)=>({y,u:uOf(p,c.k,false),v:s/12,c:white})}; }));
 grp.add(this.ribbon(view,s0,s1,[{offFn:p=>p.m1,k:0},{offFn:p=>(p.m1+p.R)/2,k:0.5},{offFn:p=>p.R,k:1}],roadMat,(s,p)=>{ const y=sink(s); return {at:(c)=>({y,u:p.ow?0.25:uOf(p,c.k,true),v:s/12,c:white})}; }));
 ctx.sink=sink;
 // 中央分離帯 (縁石 + 芝/コンクリート)
 if(view.road.pts.slice(Math.floor(s0/view.SEG),Math.ceil(s1/view.SEG)+1).some(q=>(q.m1||0)>0.3)){
  const gm=SceneMats.get("ground").mat;
  grp.add(this.ribbon(view,s0,s1,[{offFn:()=>0,t:"k"},{offFn:p=>Math.min(0.2,p.m1/2),t:"k"},{offFn:p=>Math.min(0.25,p.m1/2),t:"g"},{offFn:p=>Math.max(p.m1-0.25,p.m1/2),t:"g"},{offFn:p=>Math.max(p.m1-0.2,p.m1/2),t:"k"},{offFn:p=>p.m1,t:"k"}],gm,(s,p)=>{
   const wide=p.m1>3, open=this.mouthAt(view,s,0), h=(p.m1>0.3&&!open)?0.15:0, bio=biomeAt(this.kmOfS(view,s)), sk=ctx.sink(s);
   if(sk) return {at:()=>{ _sc.setHex(0x3b3c40).convertSRGBToLinear(); return {y:sk-0.05,c:_sc,veg:[0,0,0,0],misc:[0,0,0]}; }};
   return {at:(c)=>{
    const isEdge=(c.t==="k"&&(c.off<0.01||c.off>p.m1-0.01));
    if(open){ _sc.setHex(0x3b3c40).convertSRGBToLinear(); _sv.setHex(bio.veg).convertSRGBToLinear(); return {y:0.004,c:_sc,veg:[_sv.r,_sv.g,_sv.b,0],misc:[0,0,0]}; }   // 交差点では分離帯を切る
    _sc.setHex(c.t==="k"?0xc9c5ba:(wide?bio.soil:0xb3aea2)).convertSRGBToLinear(); _sv.setHex(bio.veg).convertSRGBToLinear();
    return {y:isEdge?0.005:h,c:_sc,veg:[_sv.r,_sv.g,_sv.b,c.t==="g"&&wide?Math.min(0.6,bio.cov+0.25):0],misc:[0,0.1,0]}; }};
  }));
 }
 // ---- 路肩 / 歩道 ----
 const gmat=SceneMats.get("ground").mat;
 const shoulderCols=(sd)=> urban?
  [{off:sd*W,t:"gut"},{off:sd*(W+0.45),t:"gut"},{off:sd*(W+0.46),t:"kerb"},{off:sd*(W+0.6),t:"path"},{off:sd*SH,t:"path"}] :
  [{off:sd*W,t:"grav"},{off:sd*(W+1.2),t:"grav"},{off:sd*SH,t:"grav"}];
 for(const sd of [-1,1]){
  let cols=shoulderCols(sd); if(sd<0) cols=cols.slice().reverse();
  grp.add(this.ribbon(view,s0,s1,cols,gmat,(s)=>{
   const km=this.kmOfS(view,s), bio=biomeAt(km), mouth=this.mouthAt(view,s,sd), sk=ctx.sink(s);
   if(sk) return {at:()=>{ _sc.setHex(0x8d8b85).convertSRGBToLinear(); return {y:sk-0.05,c:_sc,veg:[0,0,0,0],misc:[0,0,0]}; }};   // 先に通った道路の下へ
   return {at:(c)=>{
    let y=-0.05, soil=0x9a6a42, cov=0.08, vg=bio.soil, misc=[0,0.15,0];
    if(mouth&&bio.urban&&c.off0!=null&&Math.abs(c.off0)<=SH+0.01){ _sc.setHex(c.t==="gut"?0x8d8b85:0xb9b4a8).convertSRGBToLinear(); _sv.setHex(vg).convertSRGBToLinear(); return {y:0.0,c:_sc,veg:[_sv.r,_sv.g,_sv.b,0],misc:[0,0,0]}; }   // 交差点口: 縁石を下げる (歩道の切り下げ)
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
    const y= c.skirt? -38 : (Math.abs(c.off0)<SH+0.1&&!this._rowDeck? Math.min(bio.urban?0.15:-0.05,this.branchCap(x,z)) : this.groundRel(x,z,c.off0,bio,km));
    const a=this.groundAttrs(bio,c.off0,km,!bio.urban);
    return {y,c:a.c,veg:a.veg,misc:a.misc};
   }};
  }));
 }
 // ---- 景観オブジェクト ----
 this.buildOcc(ctx); this._ctxOcc=ctx.occ;
 if(P.mode==="race"){ this.sites(ctx); this.bridges(ctx); }
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
brNear(view,s,w=0,sd=0){
 for(const b of view.branches){
  if(b.mouth){ if(s>=b.mouth.sA-4-w&&s<=b.mouth.sB+4+w&&(!sd||b.side===sd)) return true; }
  else if(Math.abs(b.sJ-s)<b.half+4+w) return true;
 }
 return RP_MANEUVERS.some(m=>Math.abs(view.sOfKm(m.km)-s)<30+w);
},
/* 三角形の向きを上向き (+Y) にそろえる (DoubleSide の Lambert は裏面が暗くなるため) */
upWind(pos,idx){ for(let i=0;i<idx.length;i+=3){ const a=idx[i]*3,b=idx[i+1]*3,c=idx[i+2]*3;
  const ny=(pos[b+2]-pos[a+2])*(pos[c]-pos[a])-(pos[b]-pos[a])*(pos[c+2]-pos[a+2]); if(ny<0){ const t=idx[i+1]; idx[i+1]=idx[i+2]; idx[i+2]=t; } } },
/* 沿道の柱など: 道路にかかる場合は前後にずらして置く (置けなければ null) */
clearAt(view,s,off,sd){ for(const d of [0,6,-6,12,-12]){ if(this.brNear(view,s+d,0,sd)) continue; if(this.waterSite(view,s+d,off)) continue; const q=this.at(view,s+d,off); if(this.roadClear(view,q.x,q.z,s+d)) return q; } return null; },
/* 本線が同じ場所を再び通る (ループ・上下線の往復) 区間: 後から通る側の路面は先の路面/分岐の下へ沈めて重ね描きを避ける */
rowHidden(view,s){
 const P=view.road.pts, i0=Math.round(s/view.SEG); if(i0>=P.length) return false;
 const q=P[i0];
 for(let i=Math.max(0,i0-1600);i<i0-40;i+=2){ const o=P[i], w=Math.max(o.L||5,o.R||5)-0.5, dx=o.x-q.x, dz=o.z-q.z; if(dx*dx+dz*dz<w*w&&Math.abs(o.y-q.y)<1.5) return true; }
 for(const b of view.branches){ if(b.sJ>=s-30) continue; const B=b.pts; for(let i=0;i<B.length;i+=2){ const dx=B[i].x-q.x, dz=B[i].z-q.z; if(dx*dx+dz*dz<(b.half-0.5)**2) return true; } }
 return false;
},
/* 交差点口 (本線の路肩・縁石・分離帯を切る区間) */
mouthAt(view,s,sd){ for(const b of view.branches){ const m=b.mouth; if(m&&s>=m.sA&&s<=m.sB&&(!sd||b.side===sd)) return true; } return false; },
/* 点 (x,z) が分岐道路・隅切りの上でないか (沿道の柱・樹木の配置用) */
roadClear(view,x,z,s){
 for(const b of view.branches){
  if(Math.abs(b.sJ-s)>b.len+60) continue;
  for(const f of b.fillets||[]){ const dx=f.C[0]-x, dz=f.C[1]-z; if(dx*dx+dz*dz<121) return false; }
  const P=b.pts, r=b.half+1.3;
  for(let i=0;i<P.length;i+=2){ const dx=P[i].x-x, dz=P[i].z-z; if(dx*dx+dz*dz<(r+2.5)*(r+2.5)){
   for(let k=Math.max(0,i-2);k<Math.min(P.length-1,i+2);k++){ const a=P[k],c=P[k+1],ex=c.x-a.x,ez=c.z-a.z,L2=ex*ex+ez*ez||1,t=clamp(((x-a.x)*ex+(z-a.z)*ez)/L2,0,1);
    if((a.x+ex*t-x)**2+(a.z+ez*t-z)**2<r*r) return false; } } }
 }
 // 本線の他の区間 (ループ・並走) の上
 const P=view.road.pts, i0=Math.round(s/view.SEG);
 for(let i=Math.max(0,i0-300);i<Math.min(P.length,i0+300);i+=2){ if(Math.abs(i-i0)<24) continue; const q=P[i], w=Math.max(q.L||5,q.R||5)+1.2, dx=q.x-x, dz=q.z-z; if(dx*dx+dz*dz<w*w) return false; }
 return true;
},
/* 道路(本線の他区間・分岐)との重なり判定用の占有グリッド */
buildOcc(ctx){
 const view=ctx.view, CS=4, near=new Set(), far=new Set();
 const mark=(set,x,z,R)=>{ for(let dx=-R;dx<=R;dx+=CS) for(let dz=-R;dz<=R;dz+=CS){ if(dx*dx+dz*dz>R*R) continue; set.add(Math.floor((x+dx)/CS)+","+Math.floor((z+dz)/CS)); } };
 const P=view.road.pts, i0=Math.max(0,Math.floor((ctx.s0-400)/view.SEG)), i1=Math.min(P.length-1,Math.ceil((ctx.s1+400)/view.SEG));
 for(let i=i0;i<=i1;i+=2){ const hw=Math.max(P[i].L||5,P[i].R||5); mark(near,P[i].x,P[i].z,hw+3); mark(far,P[i].x,P[i].z,hw+15); }
 for(const b of view.branches) if(Math.abs(b.sJ-(ctx.s0+ctx.s1)/2)<b.len+500) for(const q of b.pts){ mark(near,q.x,q.z,b.half+3); mark(far,q.x,q.z,b.half+15); }
 ctx.occ={near,far,CS,
  // own: 自分の区間(sOwn 付近)は除外して判定
  hit:(x,z,kind,sOwn,offOwn,hwOwn)=>{ const set=kind==="far"?far:near; if(!set.has(Math.floor(x/CS)+","+Math.floor(z/CS))) return false;
   // 自分の区間由来のヒットを除く: 本線の同じ区間までの距離が十分あれば他区間/分岐との重なり
   const ownR=(kind==="far"?15:3)+(hwOwn||view.ROAD_W);
   if(Math.abs(offOwn)>ownR+2){ // 自分の区間とは十分離れている → 他道路に重なっている
    return true; }
   return false; }};
},
/* 位置ヘルパ: s, 横オフセット → ワールド座標 & 道路向き */
at(view,s,off){
 const p=view.roadPoint(clamp(s,0,view.road.builtS-0.01)), nx=Math.cos(p.h), nz=Math.sin(p.h);
 const wo=this.warpOff(p,off), x=p.x+nx*wo, z=p.z+nz*wo;
 const occ=this._ctxOcc;
 return { x, z, y:this.groundY(view,s,off), h:p.h, nx, nz, fx:Math.sin(p.h), fz:-Math.cos(p.h),
  face: off<0? -p.h-Math.PI/2 : -p.h+Math.PI/2,
  blocked: occ? occ.hit(x,z,"near",s,wo,Math.max(p.L||5,p.R||5)) : false, blockedFar: occ? occ.hit(x,z,"far",s,wo,Math.max(p.L||5,p.R||5)) : false };
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
  if(this.brNear(view,s,0,sd)) continue;
  const q=this.at(view,s,sd*(W+2.3)); if(!this.roadClear(view,q.x,q.z,s)) continue; PR.guidePost(bs,q.x,q.y+0.03,q.z,-q.h,sd<0);
 }
 // 牧場の境界フェンス (農地は常時/内陸は時々)
 const w=this.floraWeights(this.kmOfS(view,(s0+s1)/2));
 const fenceP=(w.fence||0)>0.5?1:(biomeAt(this.kmOfS(view,s0)).id==="barkly"||biomeAt(this.kmOfS(view,s0)).id==="sa_north")?0.6:0.25;
 if(rnd()<fenceP){
  for(const sd of [-1,1]){
   const off=sd*(SH+rndr(14,22)), pts=[];
   for(let s=Math.ceil(s0/8)*8;s<s1;s+=8){ const q=this.at(view,s,off); if(this.brNear(view,s,8,sd)||!this.roadClear(view,q.x,q.z,s)){ this.wires(ctx,pts,[0.55,0.95],0.02,0x6b5d4f); pts.length=0; continue; } PR.fencePost(bs,q.x,q.y,q.z,-q.h); pts.push([q.x,q.y,q.z]); }
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
  if(this.brNear(view,s,0,sd)) continue;
  const q=this.at(view,s,sd*(SH-0.8)); if(!this.roadClear(view,q.x,q.z,s)) continue;
  PR.streetLight(bs,q.x,q.y,q.z,-sd*q.nx,-sd*q.nz);
 }
 for(let s=Math.ceil(s0/16)*16+8;s<s1;s+=16) for(const sd of [-1,1]){
  if(rnd()<0.25) continue;
  if(this.brNear(view,s,0,sd)) continue;
  const q=this.at(view,s,sd*(SH-1.6)); if(!this.roadClear(view,q.x,q.z,s)) continue;
  if(kind.startsWith("darwin")) PR.palm(bs,q.x,q.y,q.z,0.75); else PR.tree(bs,q.x,q.y,q.z,"street",0.8);
 }
 // 電柱+電線 (アデレード=ストビーポール)
 const poles=[];
 for(let s=Math.ceil(s0/40)*40;s<s1;s+=40){
  const q=this.clearAt(view,s,-(SH+1.0),-1); if(!q) continue;
  const top=kind==="adelaide"? PR.stobie(bs,q.x,q.y,q.z,-q.h) : PR.woodPole(bs,q.x,q.y,q.z,-q.h);
  poles.push([q.x,top,q.z,q.nx,q.nz]);
 }
 if(kind!=="parklands"&&kind!=="darwin_cbd") for(const k of [-0.9,0,0.9]) this.wires(ctx,poles.map(p=>[p[0]+p[3]*k,p[1],p[2]+p[4]*k]),[0],0.35,0x222222);
 // 交差する脇道 (110m毎)
 const sideStreets=[];
 if(kind!=="parklands") for(let s=Math.ceil(s0/330)*330+40;s<s1;s+=330) sideStreets.push(s);   // 脇道そのものは branches() で作る (敷地割りはここを避ける)
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
   if(q.blockedFar||this.pavedSite(view,s,off)||this.waterSite(view,s,off)){ s+=lotW; continue; }
   if(kind==="darwin_cbd"){ // 高層ビルは敷地の四隅も道路にかからないこと
    if([[-12,-12],[12,-12],[-12,12],[12,12]].some(([a,c])=>this.at(view,s+a,off+c).blockedFar)){ s+=lotW; continue; }
    PR.tower(bs,q.x,y,q.z,q.face,rnd()<0.55?"resi":"office"); }
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
   if(q.blockedFar||this.pavedSite(view,s,off)||this.waterSite(view,s,off)) continue;
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
   const q=this.clearAt(view,s,-(SH+3),-1); if(!q) continue; poles.push([q.x,PR.woodPole(bs,q.x,q.y,q.z,-q.h),q.z,q.nx,q.nz]); }
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
/* 点が道路 (本線のどの区間か・分岐道路) の上か → 最も近い道路の点 (外へずらす向きの計算用) か null */
roadHit(view,x,z,pad){
 const P=view.road.pts;
 for(let i=0;i<P.length;i+=2){ const q=P[i], w=Math.max(q.L||5,q.R||5)+pad, dx=x-q.x, dz=z-q.z; if(dx*dx+dz*dz<w*w) return q; }
 for(const b of view.branches){ if(Math.abs(x-b.cx)>b.R+b.half||Math.abs(z-b.cz)>b.R+b.half) continue;
  for(const q of b.pts){ const dx=x-q.x, dz=z-q.z; if(dx*dx+dz*dz<(b.half+pad)**2) return q; } }
 return null;
},
signMesh(ctx,q,kind,text,w,h,postH,off){
 const {bs}=ctx;
 // 道路の上に立たないように: 重なっていれば最寄りの道路から離れる向きに最大 10 m ずらす。だめなら置かない
 if(ctx.view&&kind!=="banner"){ let hit=this.roadHit(ctx.view,q.x,q.z,0.6);
  if(hit){ let ok=false;
   for(let k=1;k<=8&&!ok;k++){ const dx=q.x-hit.x, dz=q.z-hit.z, L=Math.hypot(dx,dz)||1; const nx2=q.x+dx/L*1.3, nz2=q.z+dz/L*1.3;
    q=Object.assign({},q,{x:nx2,z:nz2}); hit=this.roadHit(ctx.view,q.x,q.z,0.6); if(!hit) ok=true; }
   if(!ok) return; } }
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
 // 右左折の路面矢印 (動作の 15 m / 40 m 手前, 曲がる側の車線)
 for(const m of Route.maneuversIn(kmA-0.1,kmB+0.1)){
  if(!/^(L|R|veerL|veerR)$/.test(m.turn)) continue;
  const left=m.turn==="L"||m.turn==="veerL";
  for(const back of [15,40]){
   const sq=sAt(m.km)-back; if(sq<ctx.s0||sq>=ctx.s1) continue;
   const p=view.roadPoint(sq), [,cn]=view.maxCurv(sq,45), effL=Math.min(p.L||5, cn>1/700? 0.9/cn : 1e9);   // 急カーブ手前で路面を細めるクランプと同じ
   const multi=effL>6.2, lat= multi? (left? -(effL-1.75) : -1.75) : -Math.min(2.4,effL/2);
   this.laneArrow(ctx,sq,lat,left?-1:1);
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
makeBranchMats(){
 this._brMat={
  asph:new THREE.MeshLambertMaterial({color:new THREE.Color(1.5,1.5,1.5),map:roadTex("urban"),side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2}),
  gravel:new THREE.MeshLambertMaterial({color:new THREE.Color(0x9c7450).convertSRGBToLinear(),map:detailTex(),side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2})};
},
/* ---- OSM の橋: 欄干 (全区間) と、下を道路がくぐる立体交差 (橋桁・橋台・下の道路) ---- */
bridges(ctx){
 const {view,kmA,kmB,bs}=ctx, B=bs.get("solid");
 for(const t of OsmRoute.towns){
  for(const [k0,k1,under] of t.bridges||[]){
   if(k1<kmA||k0>=kmB||!Route.real((k0+k1)/2)) continue;
   // 欄干: 橋の区間を 5 m ごとの箱で (左右とも路端の外)
   const sa=Math.max(view.sOfKm(Math.max(k0,kmA)),ctx.s0), sb=Math.min(view.sOfKm(Math.min(k1,kmB)),ctx.s1);
   for(let s=sa;s<sb;s+=2.5){ const e=Math.min(2.5,sb-s), ps=view.roadPoint(s+e/2), nx=Math.cos(ps.h), nz=Math.sin(ps.h), fx=Math.sin(ps.h), fz=-Math.cos(ps.h);
    for(const [lat,c] of [[-(ps.L+1.6),0xc8c6be],[ps.R+1.6,0xc8c6be]]){ const x=ps.x+nx*lat, z=ps.z+nz*lat;
     B.add(tpl("box"),M4(x,ps.y-0.05,z,0.35,1.05,e+0.05,-ps.h),linCol(c));
     B.add(tpl("box"),M4(x,ps.y+0.98,z,0.45,0.12,e+0.05,-ps.h),linCol(0xdedcd4)); } }
   // 水面の橋: 水面・川底へ下りる岸・橋脚 (35 m ごと)・路面下の床版
   const wt=OsmRoute.waterAt((k0+k1)/2);
   if(wt){
    const sa2=Math.max(view.sOfKm(wt.k0),ctx.s0), sb2=Math.min(view.sOfKm(wt.k1),ctx.s1);
    if(sb2>sa2){
     if(!this._waterMat) this._waterMat=new THREE.MeshLambertMaterial({color:new THREE.Color(0x3f6f7a).convertSRGBToLinear(),transparent:true,opacity:0.92});
     const pos=[],idx=[]; let n=0;
     for(let s=sa2;s<=sb2+0.01;s+=5){ const q=view.roadPoint(Math.min(s,sb2)), nx=Math.cos(q.h), nz=Math.sin(q.h), y=q.y-(q.bh||0)-3.2;
      pos.push(q.x-nx*180,y,q.z-nz*180, q.x+nx*180,y,q.z+nz*180); if(n>0){ const v=(n-1)*2; idx.push(v,v+1,v+2, v+1,v+3,v+2); } n++; }
     this.upWind(pos,idx); const g=new THREE.BufferGeometry(); g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3)); g.setIndex(idx); g.computeVertexNormals();
     const m=new THREE.Mesh(g,this._waterMat); m.matrixAutoUpdate=false; ctx.grp.add(m);
     for(let s=Math.ceil(sa2/35)*35;s<sb2;s+=35){ const q=view.roadPoint(s), c=(q.R-q.L)/2, x=q.x+Math.cos(q.h)*c, z=q.z+Math.sin(q.h)*c, top=q.y-0.9, bot=q.y-(q.wd||4)-1.2;
      B.add(tpl("box"),M4(x,bot,z,(q.L+q.R)*0.7,top-bot,2.2,-q.h),linCol(0xb2afa6)); }
     for(let s=sa2;s<sb2;s+=5){ const e=Math.min(5,sb2-s), q=view.roadPoint(s+e/2), c=(q.R-q.L)/2;   // 床版
      B.add(tpl("boxC"),M4(q.x+Math.cos(q.h)*c,q.y-0.5,q.z+Math.sin(q.h)*c,q.L+q.R+3.4,0.9,e+0.1,-q.h),linCol(0xbab7ae)); }
    }
   }
   // 立体交差 (道路・鉄道)
   for(const [ku,hb,name,uh,kind] of under||[]){
    if(ku<kmA||ku>=kmB||kind==="water") continue;
    const su=view.sOfKm(ku), p=view.roadPoint(su), base=p.y-(p.bh||0), half=kind==="rail"? 1.9 : (uh||3.5);
    const Hk=OsmRoute.H(t,ku), hu=p.h+(hb-Hk), ux=Math.sin(hu), uz=-Math.cos(hu);
    const deckW=p.L+p.R+3.6, cLat=(p.R-p.L)/2, nx=Math.cos(p.h), nz=Math.sin(p.h);
    const cx=p.x+nx*cLat, cz=p.z+nz*cLat;
    // 橋桁 (路面の下, 下の道路の幅 + 余裕)
    B.add(tpl("boxC"),M4(cx,p.y-0.75,cz,deckW,1.4,half*2+7,-p.h),linCol(0xb7b4aa));
    for(const sd of [-1,1]) B.add(tpl("boxC"),M4(cx+Math.sin(p.h)*sd*(half+3.2),p.y-1.7,cz-Math.cos(p.h)*sd*(half+3.2),deckW-1,0.6,0.6,-p.h),linCol(0x9d9a90));
    // 橋台 (下の道路の両側の壁)
    for(const sd of [-1,1]){ const ox=Math.cos(hu)*sd*(half+2.4), oz=Math.sin(hu)*sd*(half+2.4);
     B.add(tpl("box"),M4(p.x+ox,base-0.2,p.z+oz,1.2,(p.bh||0)-0.6,deckW+4,-hu+Math.PI/2),linCol(0xa9a69c)); }
    // 下の道路 (くぐる道路, 走行はしない)
    const L=110, pos=[],uv=[],idx=[];
    for(let i=0;i<=44;i++){ const d=-L+i*(2*L/44), x=p.x+ux*d, z=p.z+uz*d, rx=Math.cos(hu), rz=Math.sin(hu);
     pos.push(x-rx*half,base+0.02,z-rz*half, x+rx*half,base+0.02,z+rz*half); uv.push(0,i*(2*L/44)/12, 1,i*(2*L/44)/12);
     if(i>0){ const q=(i-1)*2; idx.push(q,q+1,q+2, q+1,q+3,q+2); } }
    this.upWind(pos,idx);
    const g=new THREE.BufferGeometry(); g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3)); g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2)); g.setIndex(idx); g.computeVertexNormals();
    if(!this._brMat) this.makeBranchMats();
    if(kind==="rail"){ // 線路: 道床 (砂利)・枕木・レール 2 本
     if(!this._ballastMat) this._ballastMat=new THREE.MeshLambertMaterial({color:new THREE.Color(0x7c776c).convertSRGBToLinear(),map:detailTex(),side:THREE.DoubleSide});
     const m=new THREE.Mesh(g,this._ballastMat); m.receiveShadow=true; m.matrixAutoUpdate=false; ctx.grp.add(m);
     for(let d=-L;d<=L;d+=0.65){ const x=p.x+ux*d, z=p.z+uz*d; B.add(tpl("box"),M4(x,base+0.03,z,2.4,0.12,0.22,-hu+Math.PI/2),linCol(0x5a4a3a)); }
     for(const sd of [-0.72,0.72]){ const x=p.x+Math.cos(hu)*sd, z=p.z+Math.sin(hu)*sd; B.add(tpl("boxC"),M4(x,base+0.22,z,0.07,0.14,2*L,-hu),linCol(0x8f9399)); }
    } else {
    const m=new THREE.Mesh(g,this._brMat.asph); m.receiveShadow=true; m.matrixAutoUpdate=false; ctx.grp.add(m); }
    if(name){ const q={x:p.x+ux*(-24)+Math.cos(hu)*(half+2),z:p.z+uz*(-24)+Math.sin(hu)*(half+2),y:base,h:hu,nx:Math.cos(hu),nz:Math.sin(hu)}; this.signMesh(ctx,q,"green",name.slice(0,18),2.6,0.55,2.2); }
   }
  }
 }
},
/* 路面の矢印 (dir: -1=左折 / 1=右折 / 0=直進)。白い箱を路面に並べて描く */
laneArrow(ctx,s,lat,dir){
 const view=ctx.view, p=view.roadPoint(s), nx=Math.cos(p.h), nz=Math.sin(p.h), fx=Math.sin(p.h), fz=-Math.cos(p.h), y=p.y+0.013, col=linCol(0xf2f0e6), B=ctx.bs.get("solid");
 const P=(a,l)=>[p.x+nx*(lat+l)+fx*a, p.z+nz*(lat+l)+fz*a];
 const box=(a,l,w,len,rot)=>{ const [x,z]=P(a,l); B.add(tpl("box"),M4(x,y,z,w,0.01,len,-p.h+(rot||0)),col); };
 box(-1.2,0,0.22,3.4);                                   // 軸
 if(dir===0){ box(1.0,-0.3,0.2,1.0,-0.6); box(1.0,0.3,0.2,1.0,0.6); return; }
 box(0.6,dir*0.55,1.1,0.22);                             // 曲がる腕
 box(0.95,dir*1.15,0.2,0.9,dir*0.75); box(0.25,dir*1.15,0.2,0.9,-dir*0.75);   // 矢じり
},
/* ---- 分岐道路 (脇道 t/o・信号の交差道路・曲がり損ね) ----
 ・路端から始め、角は隅切り (2 次ベジェの円弧) で本線とつなぐ。市街地は隅切りに縁石
 ・opt.shape: [[本線方向からの相対角 rad, 長さ m], ...] (OSM の実形状)。無ければ直線 + わずかな揺らぎ
 ・本線の別の区間 (ループ・並走) に重なったところで打ち切る */
makeBranch(ctx,sJ,angle,opt){
 const view=ctx.view, p=view.roadPoint(sJ), h0=(opt.h!=null?opt.h:p.h);
 const half=opt.half||3.6, step=2.5, len=opt.len||220;
 const side=Math.sin(h0+angle-p.h)>=0?1:-1;                    // 分岐が出る側 (右 +1 / 左 -1)
 const edge= side>0? p.R : p.L;
 const nX=Math.cos(p.h), nZ=Math.sin(p.h), fX=Math.sin(p.h), fZ=-Math.cos(p.h);   // 本線の右向き法線 / 前方
 const urban=!!biomeAt(view.kmOfS(sJ)).urban;
 const start= opt.fromCentre? [p.x,p.z] : [p.x+nX*side*(edge-0.4), p.z+nZ*side*(edge-0.4)];
 // 既にある分岐と付け根が重なり、同じ向きに出るもの (上下線分離の交差道路・同じ道の重複) は作らない
 const hd=h0+angle;
 for(const o of view.branches){ if(o.dir==null||Math.abs(o.sJ-sJ)>60) continue;
  const da=Math.abs(Math.atan2(Math.sin(o.dir-hd),Math.cos(o.dir-hd))); if(da>0.45) continue;
  const dx=o.pts[0].x-start[0], dz=o.pts[0].z-start[1], perp=Math.abs(dx*(-Math.cos(hd))-dz*Math.sin(hd));   // 分岐の向きに対する横ずれ
  if(perp<half+o.half&&Math.hypot(dx,dz)<60) return null; }
 // 中心線
 const segs= opt.shape&&opt.shape.length? opt.shape.map(([a,l])=>[h0+a-(opt.shapeRef||0),l]) : [[h0+angle,len]];
 const pts=[]; let x=start[0], z=start[1], wob=opt.shape?0:(rnd()-0.5)*0.004, hh=segs[0][0], acc=0;
 pts.push({x,z,y:p.y+0.012});
 const P=view.road.pts, iJ=Math.round(sJ/view.SEG);
 const clash=(x,z,d)=>{ // 本線の他の区間に重なるか (分岐の付け根の前後は除く)
  if(d<half+edge+6) return false;
  for(let i=Math.max(0,iJ-400);i<Math.min(P.length,iJ+400);i+=2){
   if(Math.abs(i-iJ)*view.SEG<half+edge+4) continue;
   const q=P[i], dx=q.x-x, dz=q.z-z, w=Math.max(q.L||5,q.R||5)+1;
   if(dx*dx+dz*dz<w*w) return true;
  }
  // 既にある別の分岐道路 (同じ道を反対側の交差点から作ったもの等) に入ったら打ち切る
  for(const o of view.branches){ if(Math.abs(o.sJ-sJ)<3) continue;
   if(Math.abs(x-o.cx)>o.R+half||Math.abs(z-o.cz)>o.R+half) continue;
   const w=o.half+half*0.6;
   for(let i=0;i<o.pts.length-1;i+=2){ const dx=o.pts[i].x-x, dz=o.pts[i].z-z; if(dx*dx+dz*dz>=w*w) continue;
    // 交わるだけ (X 字) なら続ける。同じ向き/逆向きに重なって走る場合だけ打ち切る
    const ox=o.pts[i+1].x-o.pts[i].x, oz=o.pts[i+1].z-o.pts[i].z, oh=Math.atan2(ox,-oz), da=Math.abs(Math.atan2(Math.sin(oh-hh),Math.cos(oh-hh)));
    if(da<0.5||da>Math.PI-0.5) return true; } }
  return false;
 };
 for(const [hs,l] of segs){
  let d=0; hh=hs;
  while(d<l-1e-6&&acc<len){
   const st=Math.min(step,l-d); if(!opt.shape&&acc>30) hh+=wob;
   x+=Math.sin(hh)*st; z-=Math.cos(hh)*st; d+=st; acc+=st;
   if(clash(x,z,acc)) { acc=len; break; }
   pts.push({x,z,y:p.y+0.012});
  }
  if(acc>=len) break;
 }
 if(pts.length<3) return null;
 const b={pts,sJ,kmJ:view.kmOfS(sJ),len:acc,half,step,name:opt.name||"",wrong:!!opt.wrong,surface:opt.surface||"asph",y0:p.y,side,dir:hd,
  cx:(pts[0].x+pts[pts.length-1].x)/2, cz:(pts[0].z+pts[pts.length-1].z)/2, R:acc/2+40};
 // メッシュ (帯)
 const pos=[],uv=[],idx=[];
 let vacc=0;
 for(let i=0;i<pts.length;i++){
  const a=pts[Math.max(0,i-1)], c=pts[Math.min(pts.length-1,i+1)];
  const dx=c.x-a.x, dz=c.z-a.z, L=Math.hypot(dx,dz)||1, rx=-dz/L, rz=dx/L;
  if(i>0) vacc+=Math.hypot(pts[i].x-pts[i-1].x,pts[i].z-pts[i-1].z);
  pos.push(pts[i].x-rx*half,pts[i].y,pts[i].z-rz*half, pts[i].x+rx*half,pts[i].y,pts[i].z+rz*half);
  uv.push(0,vacc/12, 1,vacc/12);
  if(i>0){ const q=(i-1)*2; idx.push(q,q+1,q+2, q+1,q+3,q+2); }
 }
 // 隅切り: 本線の路端線と分岐の側線の交点 C を制御点に、路端上の A から側線上の B へ 2 次ベジェ
 const rc= opt.fromCentre||opt.noFillet? 0 : (urban? 6 : 10);
 const fil=[];
 if(rc>0){
  const u0=[pts[1].x-pts[0].x, pts[1].z-pts[0].z], ul=Math.hypot(u0[0],u0[1])||1, ux=u0[0]/ul, uz=u0[1]/ul;
  const vx=-uz, vz=ux;                                   // 分岐の右向き法線
  const ex=p.x+nX*side*edge, ez=p.z+nZ*side*edge;       // 路端線上の点
  for(const sg of [-1,1]){
   // 側線: start + v*sg*half + u*t / 路端線: e + f*s → 交点
   const sx=start[0]+vx*sg*half, sz=start[1]+vz*sg*half;
   const det=fX*(-uz)-fZ*(-ux); if(Math.abs(det)<0.3) continue;   // 斜めすぎる側は隅切りしない
   const rx=sx-ex, rz=sz-ez, sP=(rx*(-uz)-rz*(-ux))/det, tP=(fX*rz-fZ*rx)/det;
   if(Math.abs(sP)>half/Math.abs(det)+3||tP<-3||tP>half/Math.abs(det)+3) continue;   // 交点が付け根から外れる (形状が崩れる) 場合は省く
   const C=[ex+fX*sP, ez+fZ*sP];
   const dirA=Math.sign((sx-start[0])*fX+(sz-start[1])*fZ)||sg;   // 側線がずれている向きへ路端を進む
   const cosT=dirA*(fX*ux+fZ*uz), rcE= cosT>0.4? rc*Math.max(0.25,Math.sqrt(1-cosT*cosT)) : rc;   // 鋭角の角は小さな隅切り (細長いトゲにしない)
   const A=[C[0]+fX*dirA*rcE, C[1]+fZ*dirA*rcE], B=[C[0]+ux*Math.max(rcE,tP+rcE*0.6), C[1]+uz*Math.max(rcE,tP+rcE*0.6)];
   const curve=[]; for(let k=0;k<=8;k++){ const t=k/8, m0=(1-t)*(1-t), m1=2*(1-t)*t, m2=t*t; curve.push([m0*A[0]+m1*C[0]+m2*B[0], m0*A[1]+m1*C[1]+m2*B[1]]); }
   fil.push({C,curve,A,B});
   const base=pos.length/3; pos.push(C[0],p.y+0.011,C[1]); uv.push(0.25,0);
   for(const q of curve){ pos.push(q[0],p.y+0.011,q[1]); uv.push(0.25,0.15); }
   for(let k=0;k<8;k++) idx.push(base,base+1+k,base+2+k);
  }
 }
 b.fillets=fil;
 // 本線沿いの交差点口 (縁石・ガイドポスト等を置かない区間)
 const along=(q)=>(q[0]-p.x)*fX+(q[1]-p.z)*fZ;
 let ma=-half-1, mb=half+1; for(const f of fil){ const v=along(f.A); ma=Math.min(ma,v); mb=Math.max(mb,v); }
 b.mouth={sA:sJ+ma-1, sB:sJ+mb+1};
 this.upWind(pos,idx);
 const g=new THREE.BufferGeometry(); g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3)); g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2)); g.setIndex(idx); g.computeVertexNormals();
 if(!this._brMat) this.makeBranchMats();
 const m=new THREE.Mesh(g,this._brMat[b.surface==="gravel"?"gravel":"asph"]); m.receiveShadow=true; m.matrixAutoUpdate=false;
 ctx.grp.add(m);
 // 市街地: 隅切りと分岐の両側に縁石・歩道 (本線の縁石は交差点口で切れる)
 if(urban&&!opt.fromCentre&&b.surface!=="gravel"){
  const kp=[],ki=[];
  const strip=(line,outX,outZ)=>{ // line: [[x,z],...] / 外側方向
   const base=kp.length/3;
   for(let i=0;i<line.length;i++){ const [qx,qz]=line[i], o=outX(i), oz=outZ(i);
    kp.push(qx,p.y+0.15,qz, qx+o*2.2,p.y+0.15,qz+oz*2.2); if(i>0){ const q=base+(i-1)*2; ki.push(q,q+1,q+2, q+1,q+3,q+2); } }
  };
  for(const f of fil){ // 隅切りの外側 = 交点 C から遠ざかる向き
   const cv=f.curve; strip(cv,(i)=>{ const dx=cv[i][0]-f.C[0], dz=cv[i][1]-f.C[1], l=Math.hypot(dx,dz)||1; return dx/l; },(i)=>{ const dx=cv[i][0]-f.C[0], dz=cv[i][1]-f.C[1], l=Math.hypot(dx,dz)||1; return dz/l; });
  }
  for(const sg of [-1,1]){ // 分岐の側線の外側 (隅切りの終点 B から先)
   const line=[]; const sk=Math.ceil(rc/step)+1;
   for(let i=sk;i<pts.length;i+=2){ const a=pts[Math.max(0,i-1)], c=pts[Math.min(pts.length-1,i+1)], dx=c.x-a.x, dz=c.z-a.z, L=Math.hypot(dx,dz)||1; line.push([pts[i].x+(-dz/L)*sg*half, pts[i].z+(dx/L)*sg*half, -dz/L*sg, dx/L*sg]); }
   if(line.length>1) strip(line.map(q=>[q[0],q[1]]),(i)=>line[i][2],(i)=>line[i][3]);
  }
  if(ki.length){ this.upWind(kp,ki); const kg=new THREE.BufferGeometry(); kg.setAttribute("position",new THREE.Float32BufferAttribute(kp,3)); kg.setIndex(ki); kg.computeVertexNormals();
   if(!this._kerbMat) this._kerbMat=new THREE.MeshLambertMaterial({color:new THREE.Color(0xb9b4a8).convertSRGBToLinear(),side:THREE.DoubleSide});
   const km=new THREE.Mesh(kg,this._kerbMat); km.matrixAutoUpdate=false; km.receiveShadow=true; ctx.grp.add(km); }
 }
 // 止まれ線 (分岐側から本線へ出る車線, 隅切りの終わり)
 if(!opt.fromCentre&&b.surface!=="gravel"&&pts.length>4){
  const i=Math.min(pts.length-2,Math.ceil((rc+1.5)/step)), a=pts[i-1], c=pts[i+1], dx=c.x-a.x, dz=c.z-a.z, L=Math.hypot(dx,dz)||1;
  const rx=-dz/L, rz=dx/L;   // 本線へ向かう車は分岐の +r 側 (左側通行)
  ctx.bs.get("solid").add(tpl("box"),M4(pts[i].x+rx*half/2,p.y+0.014,pts[i].z+rz*half/2,half*0.95,0.01,0.35,-Math.atan2(dx,-dz)),linCol(0xf2f0e6));
 }
 // 道路名標識 (分岐の入口, 隅切りの外側)
 if(opt.name&&opt.sign!==false){ const hb=segs[0][0], cs=Math.cos(hb), sn=Math.sin(hb);
  const q={x:start[0]+Math.sin(hb)*(rc+3)+cs*(half+1.8),z:start[1]-Math.cos(hb)*(rc+3)+sn*(half+1.8),y:p.y,h:hb,nx:cs,nz:sn};
  this.signMesh(ctx,q,"green",opt.name.slice(0,18),2.6,0.55,2.2); }
 ctx.branches.push(b); view.branches.push(b);
 return b;
},
/* ---- ラウンドアバウト (OSM の実形状): 環道・エプロン・中央島・流入路・分離島・Give Way 線と標識 ----
 環道と経路以外の流入路は分岐道路として登録 (走行可・標識/樹木の配置よけ)。経路の流入/流出は本線の帯がそのまま通る */
roundabouts(ctx){
 const {view,kmA,kmB,bs}=ctx, B=bs.get("solid");
 if(!this._brMat) this.makeBranchMats();
 if(!this._rabMats){ const lam=(c,o)=>new THREE.MeshLambertMaterial(Object.assign({color:new THREE.Color(c).convertSRGBToLinear(),side:THREE.DoubleSide},o||{}));
  this._rabMats={ring:new THREE.MeshLambertMaterial({color:new THREE.Color(1.5,1.5,1.5),map:roadTex("urban"),side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4}),
   apron:lam(0x9a5a44), kerb:lam(0xc9c5bb), soil:lam(0xa7764c), grassU:lam(0x6d8a3a), grassD:lam(0x9c6a42), line:lam(0xf2f0e6,{polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-6})}; }
 const M=this._rabMats;
 const mesh=(pos,idx,mat,uv)=>{ this.upWind(pos,idx); const g=new THREE.BufferGeometry(); g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3)); if(uv) g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2)); g.setIndex(idx); g.computeVertexNormals(); const m=new THREE.Mesh(g,mat); m.matrixAutoUpdate=false; m.receiveShadow=true; ctx.grp.add(m); return m; };
 for(const t of OsmRoute.towns) for(const r of t.rabs||[]){
  const k0=r.ks[0][0]; if(k0<kmA||k0>=kmB||!Route.real(k0)) continue;
  const P0=view.roadPoint(view.sOfKm(k0)), off=P0.h-OsmRoute.H(t,k0), y=P0.y;
  const a0=r.b+off, C={x:P0.x+Math.sin(a0)*r.d, z:P0.z-Math.cos(a0)*r.d};
  const W=(b,rr)=>({x:C.x+Math.sin(b+off)*rr, z:C.z-Math.cos(b+off)*rr});
  const urban=!!biomeAt(k0).urban, R=r.R, hw=r.hw, rOut=R+hw, rIn=R-hw, apron=Math.min(2.0,Math.max(0,rIn-2.5)), rIs=rIn-apron;
  const N=Math.max(48,Math.round(R*3));
  // 環道 (アスファルト): 2 車線なら車線境界の破線 (テクスチャの中央線) が出る
  { const pos=[],uv=[],idx=[];
   for(let i=0;i<=N;i++){ const b=i/N*Math.PI*2, ci=Math.sin(b), co=-Math.cos(b), v=b*R/12;
    pos.push(C.x+ci*rIn,y+0.02,C.z+co*rIn, C.x+ci*rOut,y+0.02,C.z+co*rOut);
    if(r.lanes>=2) uv.push(0.06,v, 0.94,v); else uv.push(0.1,v, 0.4,v);   // 外側線はテクスチャでなく別に描く (流入口で切るため)
    if(i>0){ const q=(i-1)*2; idx.push(q,q+2,q+1, q+1,q+2,q+3); } }
   mesh(pos,idx,M.ring,uv); }
  // 環の外側の白線 (流入路の口は切る) と内側の白線
  const mouths=r.arms.map(a=>{ const p=a[5][0]; return {b:p[0], w:(a[1]+1.5)/rOut}; });
  const inMouth=(b)=>mouths.some(m=>Math.abs(Math.atan2(Math.sin(b-m.b),Math.cos(b-m.b)))<m.w);
  for(const [rl,cut] of [[rOut-0.35,true],[rIn+0.3,false]]){ const n=Math.round(N*1.5);
   for(let i=0;i<n;i++){ const b=(i+0.5)/n*Math.PI*2; if(cut&&inMouth(b)) continue;
    const q=W(b-off,rl), L=2*Math.PI*rl/n; B.add(tpl("boxC"),M4(q.x,y+0.035,q.z,0.12,0.01,L*1.02,-(b+Math.PI/2)),linCol(0xf2f0e6)); } }
  // エプロン (乗り上げ可の舗装) と中央島 (縁石 + 植栽)
  if(rIs>0.8){
   const ring=(r0,r1,y0,y1,mat)=>{ const pos=[],idx=[]; for(let i=0;i<=N;i++){ const b=i/N*Math.PI*2, ci=Math.sin(b), co=-Math.cos(b);
     pos.push(C.x+ci*r0,y0,C.z+co*r0, C.x+ci*r1,y1,C.z+co*r1); if(i>0){ const q=(i-1)*2; idx.push(q,q+2,q+1, q+1,q+2,q+3); } } mesh(pos,idx,mat); };
   if(apron>0.3){ ring(rIs,rIn,y+0.09,y+0.05,M.apron); ring(rIn,rIn,y+0.02,y+0.05,M.kerb); }
   ring(rIs,rIs,y+0.05,y+0.22,M.kerb); ring(rIs-0.25,rIs,y+0.22,y+0.22,M.kerb);
   { const pos=[C.x,y+0.24,C.z],idx=[]; for(let i=0;i<=N;i++){ const b=i/N*Math.PI*2; pos.push(C.x+Math.sin(b)*(rIs-0.25),y+0.22,C.z-Math.cos(b)*(rIs-0.25)); if(i>0) idx.push(0,i,i+1); } mesh(pos,idx,urban?M.grassU:M.grassD); }
   srand(Math.floor(k0*1000)+77);
   const nT=Math.min(9,Math.floor(rIs*rIs/40));
   for(let i=0;i<nT;i++){ const b=rnd()*Math.PI*2, rr=Math.sqrt(rnd())*(rIs-3); if(rIs<4) break;
    PR.tree(bs,C.x+Math.sin(b)*rr,y+0.22,C.z-Math.cos(b)*rr,"street",0.8); }
  }
  // 環そのものを走行可能な道として登録 (中心線の円。本線から外れても路外扱いにしない)
  { const pts=[]; for(let i=0;i<=N;i++){ const b=i/N*Math.PI*2; pts.push({x:C.x+Math.sin(b)*R,z:C.z-Math.cos(b)*R,y:y+0.02}); }
   const rb={pts,sJ:view.sOfKm(k0),kmJ:k0,len:2*Math.PI*R,half:hw,step:2*Math.PI*R/N,name:"",ring:true,surface:"asph",y0:y,side:0,dir:null,cx:C.x,cz:C.z,R:R+hw+4,fillets:[]};
   ctx.branches.push(rb); view.branches.push(rb);
   // 中央島の上に物を置かない (島全体を覆う円を登録)
   const isl={pts:[{x:C.x,z:C.z,y},{x:C.x+0.01,z:C.z,y}],sJ:rb.sJ,kmJ:k0,len:2*R+40,half:Math.max(0.5,rIs),step:1,name:"",ring:true,island:true,surface:"asph",y0:y+0.22,side:0,dir:null,cx:C.x,cz:C.z,R:rIs+2,fillets:[]};
   ctx.branches.push(isl); view.branches.push(isl); }
  // 流入路: 中心線の折れ線 (世界座標), 環の外端から外へ
  const line=(a)=>{ const ps=a[5].map(([b,rr])=>W(b,rr)); const out=[]; let started=false;
   for(let i=0;i<ps.length;i++){ const rr=Math.hypot(ps[i].x-C.x,ps[i].z-C.z);
    if(!started){ if(rr<rOut-0.8&&i<ps.length-1) continue; started=true;
     if(i>0){ const p0=ps[i-1], r0=Math.hypot(p0.x-C.x,p0.z-C.z), t=clamp((rOut-0.8-r0)/((rr-r0)||1),0,1); out.push({x:p0.x+(ps[i].x-p0.x)*t,z:p0.z+(ps[i].z-p0.z)*t}); } }
    out.push(ps[i]); }
   // 2.5 m ごとに打ち直す
   const res=[]; if(out.length<2) return res; res.push(out[0]); let acc=0;
   for(let i=1;i<out.length;i++){ const a=out[i-1], c=out[i], L=Math.hypot(c.x-a.x,c.z-a.z); let d=2.5-acc;
    while(d<=L){ res.push({x:a.x+(c.x-a.x)*d/L,z:a.z+(c.z-a.z)*d/L}); d+=2.5; } acc=(acc+L)%2.5; }
   if(res.length<2) res.push(out[out.length-1]); return res; };
  const lines=r.arms.map(line);
  const pointAt=(L,d)=>{ const i=clamp(Math.floor(d/2.5),0,L.length-2), t=clamp(d/2.5-i,0,1), a=L[i], c=L[i+1]; return {x:a.x+(c.x-a.x)*t,z:a.z+(c.z-a.z)*t,dx:c.x-a.x,dz:c.z-a.z}; };
  r.arms.forEach((a,ia)=>{ const [name,half,route,dirn]=a, L=lines[ia]; if(L.length<3) return;
   if(!route){ // 経路でない流入路は道路として描く (一方通行は車線の中央だけ, 対面通行は中央線つき)
    const pos=[],uv=[],idx=[]; let v=0;
    for(let i=0;i<L.length;i++){ const p=L[Math.max(0,i-1)], c=L[Math.min(L.length-1,i+1)], dx=c.x-p.x, dz=c.z-p.z, l=Math.hypot(dx,dz)||1, rx=-dz/l, rz=dx/l;
     if(i>0) v+=Math.hypot(L[i].x-L[i-1].x,L[i].z-L[i-1].z);
     pos.push(L[i].x-rx*half,y+0.015,L[i].z-rz*half, L[i].x+rx*half,y+0.015,L[i].z+rz*half);
     if(dirn===0) uv.push(0,v/12, 1,v/12); else uv.push(0.06,v/12, 0.44,v/12);
     if(i>0){ const q=(i-1)*2; idx.push(q,q+1,q+2, q+1,q+3,q+2); } }
    mesh(pos,idx,this._brMat.asph,uv);
    const pts=L.map(q=>({x:q.x,z:q.z,y:y+0.015}));
    const ab={pts,sJ:view.sOfKm(k0),kmJ:k0,len:(L.length-1)*2.5,half,step:2.5,name:name||"",wrong:true,surface:"asph",y0:y,side:0,dir:Math.atan2(L[2].x-L[0].x,-(L[2].z-L[0].z)),
     cx:(L[0].x+L[L.length-1].x)/2,cz:(L[0].z+L[L.length-1].z)/2,R:(L.length-1)*1.25+20,fillets:[],rabArm:true};
    ctx.branches.push(ab); view.branches.push(ab);
    // 道路名
    if(name&&(dirn!==1||a[4]<0)){ const q=pointAt(L,14), l=Math.hypot(q.dx,q.dz)||1, ux=q.dx/l, uz=q.dz/l, h=Math.atan2(ux,-uz);
     this.signMesh(ctx,{x:q.x-uz*(half+2.2),z:q.z+ux*(half+2.2),y,h,nx:Math.cos(h),nz:Math.sin(h)},"green",name.slice(0,18),2.6,0.55,2.2); }
   }
   // Give Way: 環へ入る車線を横切る破線と、左側の標識
   if(dirn>=0){ const q=pointAt(L,0.9), l=Math.hypot(q.dx,q.dz)||1, ox=q.dx/l, oz=q.dz/l;   // 外向き
    const ix=-ox, iz=-oz, lx=iz, lz=-ix;   // 環へ向かう向き / その左
    const w0= dirn===0? 0 : -half, w1=half;   // 左側通行: 入る車線は (環へ向かう向きの) 左半分 = 外向きの右側
    const rxo=-oz, rzo=ox;   // 外向き右
    for(let w=w0+0.3;w<w1-0.2;w+=1.2){ B.add(tpl("boxC"),M4(q.x+rxo*(w+0.3),y+0.03,q.z+rzo*(w+0.3),0.6,0.01,0.3,-Math.atan2(ix,-iz)+Math.PI/2),linCol(0xf2f0e6)); }
    const hIn=Math.atan2(ix,-iz), sp=pointAt(L,2.5);
    this.signMesh(ctx,{x:sp.x+lx*(half+1.4)*-1*-1,z:sp.z+lz*(half+1.4),y,h:hIn,nx:Math.cos(hIn),nz:Math.sin(hIn)},"giveway","",0.9,0.8,1.9);
    // 予告 (ラウンドアバウトあり)
    if(L.length>30){ const pq=pointAt(L,65); this.signMesh(ctx,{x:pq.x+lx*(half+1.6),z:pq.z+lz*(half+1.6),y,h:hIn,nx:Math.cos(hIn),nz:Math.sin(hIn)},"warn","rab",1.2,1.2,1.8); }
   }
  });
  // 分離島: 上下線 (一方通行の組) の間 / 対面通行の流入路の中央の涙形
  const island=(eA,eB)=>{ // eA, eB: 島の両側の縁 [{x,z}] (同じ数)
   if(eA.length<2) return; const top=[],ti=[],wall=[],wi=[];
   for(let i=0;i<eA.length;i++){ top.push(eA[i].x,y+0.17,eA[i].z, eB[i].x,y+0.17,eB[i].z); if(i>0){ const q=(i-1)*2; ti.push(q,q+1,q+2, q+1,q+3,q+2); } }
   mesh(top,ti,urban?M.grassU:M.soil);
   const rim=eA.concat(eB.slice().reverse(),[eA[0]]);
   for(let i=0;i<rim.length;i++){ wall.push(rim[i].x,y,rim[i].z, rim[i].x,y+0.19,rim[i].z); if(i>0){ const q=(i-1)*2; wi.push(q,q+1,q+2, q+1,q+3,q+2); } }
   mesh(wall,wi,M.kerb);
   // 島を物の配置よけとして登録
   const mid=eA.map((p,i)=>({x:(p.x+eB[i].x)/2,z:(p.z+eB[i].z)/2,y:y+0.17}));
   const wmax=Math.max(...eA.map((p,i)=>Math.hypot(p.x-eB[i].x,p.z-eB[i].z)))/2;
   const ib={pts:mid,sJ:view.sOfKm(k0),kmJ:k0,len:mid.length*2,half:wmax+0.3,step:2,name:"",ring:true,island:true,surface:"asph",y0:y+0.17,side:0,dir:null,cx:mid[0].x,cz:mid[0].z,R:mid.length*2+wmax+10,fillets:[]};
   ctx.branches.push(ib); view.branches.push(ib);
  };
  r.arms.forEach((a,ia)=>{ const ib=a[4];
   if(ib>ia){ const A=lines[ia], Bl=lines[ib]; if(A.length<3||Bl.length<3) return;
    const hA=a[1], hB=r.arms[ib][1], eA=[], eB=[];
    for(let d=0.6;d<46;d+=2){ const pa=pointAt(A,d), pb=pointAt(Bl,d), dx=pb.x-pa.x, dz=pb.z-pa.z, g=Math.hypot(dx,dz);
     if(g<hA+hB+1.0) break; if(d>(A.length-1)*2.5||d>(Bl.length-1)*2.5) break;
     const ux=dx/g, uz=dz/g; eA.push({x:pa.x+ux*(hA+0.3),z:pa.z+uz*(hA+0.3)}); eB.push({x:pb.x-ux*(hB+0.3),z:pb.z-uz*(hB+0.3)}); }
    if(eA.length>=2){ const g=Math.hypot(eA[eA.length-1].x-eB[eB.length-1].x,eA[eA.length-1].z-eB[eB.length-1].z);   // 先端をとがらせる
     const tip={x:(eA[eA.length-1].x+eB[eB.length-1].x)/2,z:(eA[eA.length-1].z+eB[eB.length-1].z)/2}; if(g>0.4){ eA.push(tip); eB.push(tip); } }
    island(eA,eB);
   } else if(a[3]===0&&a[4]<0){ const L=lines[ia]; if(L.length<6) return;   // 対面通行: 中央に涙形 (環側が太い)
    const eA=[], eB=[]; const Ls=Math.min(16,(L.length-1)*2.5-2);
    for(let d=0.8;d<=Ls;d+=1.6){ const q=pointAt(L,d), l=Math.hypot(q.dx,q.dz)||1, rx=-q.dz/l, rz=q.dx/l, t=(d-0.8)/(Ls-0.8), w=Math.max(0.05,(0.9+0.25*Math.min(1,a[1]/3.5))*Math.sqrt(Math.max(0,1-t))*Math.min(1,(d+0.4)/2));
     eA.push({x:q.x-rx*w,z:q.z-rz*w}); eB.push({x:q.x+rx*w,z:q.z+rz*w}); }
    island(eA,eB);
   }
  });
 }
},
branches(ctx){
 const {view,kmA,kmB,s0,s1}=ctx;
 const D=Math.PI/180;
 // 曲がり損ね (ルートの右左折地点)
 for(const j of view.junctions){
  if(j.s<s0||j.s>=s1||j.built) continue; j.built=true;
  const m=j.m; if(!m.wrong||j.osm) continue;   // OSM 区間は実際の交差道路 (下の arms) が曲がり損ねの道になる
  const ang={S:0,L:-90*D,R:90*D,veerL:-30*D,veerR:30*D}[m.wrong]||0;
  const nm={S:"(直進)",L:"(左)",R:"(右)"}[m.wrong]||"";
  this.makeBranch(ctx,j.s,ang,{h:j.h,wrong:true,name:m.wrong==="S"? (m.note&&m.note.includes("空港")?"Airport Road":"") : "",len:m.wrong==="S"?260:200,fromCentre:m.wrong==="S"||m.wrong.startsWith("veer"),sign:false});
 }
 // 曲がってはいけない分岐 (Daly Waters 等)
 for(const t of RP_TRAPS){ if(t.km>=kmA&&t.km<kmB&&!t.dummy) this.makeBranch(ctx,view.sOfKm(t.km),(t.side==="R"?90:-90)*D,{wrong:true,name:t.name,len:240}); }
 // 脇道 (t/o) — すべて走行可能
 const near=(k)=>RP_MANEUVERS.some(m=>Math.abs(m.km-k)<0.08);
 const osmHere=(k)=>OsmRoute.townAt(k)&&Route.real(k);
 for(const e of Route.eventsIn(kmA,kmB,"sideroad")){
  if(near(e.km)||osmHere(e.km)||this.brNear(view,view.sOfKm(e.km),25)) continue;   // 縮尺区間で脇道が数 m 間隔に並ばないように
  const dirt=/station|track|dirt|H\/S|homestead|quarry|stn|camp/i.test(e.t);
  const name=e.t.replace(/\b(t\/o|on|left|right|Straight ahead|Exit|Turn off).*$/i,"").trim().slice(0,22);
  this.makeBranch(ctx,view.sOfKm(e.km),(e.v==="R"?1:-1)*(80+rnd()*20)*D,{name,surface:dirt?"gravel":"asph",half:dirt?3.0:3.6,len:200});
 }
 // 信号交差点の交差道路 (左右とも)
 for(const e of Route.eventsIn(kmA,kmB,"signal")){
  if(near(e.km)||osmHere(e.km)||this.brNear(view,view.sOfKm(e.km),25)) continue;
  for(const sd of [-1,1]) this.makeBranch(ctx,view.sOfKm(e.km),sd*90*D,{name:sd<0?e.t.split(/Traffic|traffic/)[0].trim().slice(0,20):"",len:160});
 }
 // OSM 区間の交差道路 (実際の向き)。動作地点の腕は曲がり損ねの道として扱う
 for(const t of OsmRoute.towns){
  if(t.km1<kmA||t.km0>=kmB) continue;
  for(const [k,hb,name,half,shape] of t.arms){
   if(k<kmA||k>=kmB||k<=t.km0+0.005||k>=t.km1-0.005||!Route.real(k)) continue;
   if(k<RP_START.km+0.07) continue;   // スタート会場の出口まわりは交差道路を描かない (右折するだけ)
   if((t.rabs||[]).some(r=>r.ks.some(([q0,q1])=>k>q0-0.012&&k<q1+0.012))) continue;   // ラウンドアバウトの腕は roundabouts() で描く
   const Hk=OsmRoute.H(t,k), ang=Math.atan2(Math.sin(hb-Hk),Math.cos(hb-Hk));
   if(Math.abs(ang)<0.2||Math.abs(ang)>2.9) continue;
   const atMan=RP_MANEUVERS.some(m=>m.osm===t&&Math.abs(m.km-k)<0.015);
   const L=atMan?200:150;
   this.makeBranch(ctx,view.sOfKm(k),ang,{name,wrong:atMan,len:L,half:half||3.5,shape,shapeRef:Hk,sign:!!name&&!atMan,noFillet:atMan});   // ルートが曲がる交差点は路端が曲線なので隅切りしない
  }
 }
 // 市街地 (OSM 区間外) の交差する脇道 110 m ごと: 隅切り・縁石・止まれ線つきの分岐道路として作る
 const uk=biomeAt((kmA+kmB)/2).urban;
 if(uk&&uk!=="parklands") for(let s=Math.ceil(s0/330)*330+40;s<s1;s+=330){
  const kk=view.kmOfS(s); if(OsmRoute.townAt(kk)&&Route.real(kk)) continue;
  if(this.brNear(view,s,10)) continue;
  for(const sd of [-1,1]) this.makeBranch(ctx,s,sd*90*D,{len:180,half:4,sign:false});
 }
 // ラウンドアバウトの他の出口
 for(const j of view.junctions){ if(j.s>=s0&&j.s<s1&&j.m.turn==="rab"&&!j.osm&&!j.rabBuilt){ j.rabBuilt=true;
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
  if(OsmRoute.townAt(c.km)) this.padRibbon(ctx,sc-45,sc+45,-14,14,padCol);   // 実形状の町: 敷地の道路そのものを使うので停止位置まわりだけ
  else this.padRibbon(ctx,sc-150,sc+150,-24,24,padCol);
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
  // 会場の舗装は直後の右折 (実形状) にかからないように手前で止め、幅も道路の外 12 m まで
  const sTurn=Math.min(...RP_MANEUVERS.filter(m=>m.km<0.2).map(m=>view.sOfKm(m.km)),s0+40);
  this.padRibbon(ctx,s0-200,sTurn-14,-(W+7),W+7,0xc9c4b8);
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
