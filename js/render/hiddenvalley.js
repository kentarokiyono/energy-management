"use strict";
/* ============ Hidden Valley Raceway (ダーウィン) 会場生成 ============
 座標: x=東, y=標高, z=-北 [m] / 原点 = S/F (メインストレート中央)
 中心線 = OSM, 標高・ピットレーン・走行ライン = Assetto Corsa AIライン由来 (js/data/hidden-valley.js)
 周回 = 反時計回り。メインストレートは南西→北東、ピットは南側、ドラッグストリップは北側(コース内側)に並行 */
const HV={
HALF_W:6.5,              // コース半幅 (路面 13m)
STRIP_OFF:-26,           // ドラッグストリップ中心のメインストレートからの横オフセット (負=北/左)
STRIP_HALF:9,            // ドラッグストリップ半幅 (2レーン+コンクリ)
SLALOM_FROM_NE:110,      // ドラッグストリップ北東端からスラローム開始線まで [m]
BRAKE_X:386,             // スラローム開始線→制動開始線 [m]
_cache:null,
/* 中心線・法線・曲率 */
track(){
 if(this._cache) return this._cache;
 const C=HV_DATA.centre, n=C.length;
 const pts=C.map(p=>new THREE.Vector3(p[0],p[1],p[2]));
 const fwd=[], right=[], curv=new Array(n), s=new Array(n);
 for(let i=0;i<n;i++){
  const a=pts[(i-1+n)%n], b=pts[(i+1)%n];
  const fx=b.x-a.x, fz=b.z-a.z, L=Math.hypot(fx,fz)||1;
  fwd.push([fx/L,fz/L]); right.push([-fz/L,fx/L]);
 }
 let acc=0;
 for(let i=0;i<n;i++){
  s[i]=acc; const b=pts[(i+1)%n]; acc+=Math.hypot(b.x-pts[i].x,b.z-pts[i].z);
  const a=pts[(i-2+n)%n], c=pts[(i+2)%n];
  const h1=Math.atan2(pts[i].x-a.x,-(pts[i].z-a.z)), h2=Math.atan2(c.x-pts[i].x,-(c.z-pts[i].z));
  let dh=h2-h1; if(dh>Math.PI)dh-=2*Math.PI; if(dh<-Math.PI)dh+=2*Math.PI;
  curv[i]=dh/(Math.hypot(c.x-pts[i].x,c.z-pts[i].z)+Math.hypot(pts[i].x-a.x,pts[i].z-a.z)||1)*2; // +=右旋回
 }
 // メインストレートの向き (S/F 前後 ±150m の主成分)
 let sx=0,sz=0; for(let k=-50;k<=50;k++){ const f=fwd[(k+n)%n]; sx+=f[0]; sz+=f[1]; }
 const L=Math.hypot(sx,sz); const sd=[sx/L,sz/L], sr=[-sd[1],sd[0]];
 this._cache={pts,fwd,right,curv,s,n,len:acc,sd,sr};
 return this._cache;
},
/* ストレート座標系 (along=北東+, lat=南+) → ワールド */
SW(along,lat){ const T=this.track(); return [T.sd[0]*along+T.sr[0]*lat, T.sd[1]*along+T.sr[1]*lat]; },
/* ドラッグストリップの範囲 (along) */
stripRange(){ return [-430,470]; },
/* 試験用ローカル座標系: 原点と +x 方向 (ワールド) */
frames(){
 const T=this.track(), [a0,a1]=this.stripRange();
 const neAlong=a1, slAlong=neAlong-this.SLALOM_FROM_NE;
 const [ox,oz]=this.SW(slAlong,this.STRIP_OFF);
 const dir=[-T.sd[0],-T.sd[1]];              // 南西向き
 const [fx,fz]=this.SW(55,205);              // PIT PADDOCK 駐車場 (ピット/パドックの更に南)
 return { strip:{x:ox,z:oz,y:0.06,dir}, fig8:{x:fx,z:fz,y:0.06,dir:[T.sd[0],T.sd[1]]} };
},
frameMatrix(fr){
 const th=Math.atan2(-fr.dir[1],fr.dir[0]);  // ローカル+x → dir
 return new THREE.Matrix4().makeRotationY(th).setPosition(fr.x,fr.y,fr.z);
},
/* ---------- 地形 ---------- */
flatAreas(){ // [along0,along1,lat0,lat1] (ストレート座標) — 舗装・整地エリア
 const [a0,a1]=this.stripRange();
 return [
  [a0,a1,this.STRIP_OFF-this.STRIP_HALF-4,this.STRIP_OFF+this.STRIP_HALF+4],   // ドラッグストリップ
  [-330,330,8,48],      // ピットレーン/ガレージ
  [-260,300,48,140],    // パドック
  [-120,260,140,270],   // PIT PADDOCK 駐車場
  [-300,-200,-120,-50], // 観客駐車場(コース内)
 ];
},
inFlat(x,z,m=0){
 const T=this.track();
 const al=x*T.sd[0]+z*T.sd[1], lt=x*T.sr[0]+z*T.sr[1];
 for(const r of this.flatAreas()) if(al>r[0]-m&&al<r[1]+m&&lt>r[2]-m&&lt<r[3]+m) return true;
 return false;
},
nearestTrack(x,z){
 const T=this.track(); let bd=1e18, bi=0;
 for(let i=0;i<T.n;i+=2){ const p=T.pts[i], d=(p.x-x)**2+(p.z-z)**2; if(d<bd){bd=d;bi=i;} }
 for(let i=Math.max(0,bi-3);i<=bi+3;i++){ const k=(i+T.n)%T.n, p=T.pts[k], d=(p.x-x)**2+(p.z-z)**2; if(d<bd){bd=d;bi=k;} }
 return {i:bi,d:Math.sqrt(bd)};
},
insideLoop(x,z){ // 中心線ポリゴン内判定
 const P=this.track().pts; let c=false;
 for(let i=0,j=P.length-1;i<P.length;j=i++){
  if(((P[i].z>z)!==(P[j].z>z)) && (x<(P[j].x-P[i].x)*(z-P[i].z)/(P[j].z-P[i].z)+P[i].x)) c=!c;
 }
 return c;
},
buildTerrain(grp){
 const T=this.track();
 const X0=-1150,X1=1000,Z0=-650,Z1=620,CS=8;
 const nx=Math.round((X1-X0)/CS)+1, nz=Math.round((Z1-Z0)/CS)+1;
 const samp=T.pts.filter((_,i)=>i%3===0);
 const H=new Float32Array(nx*nz);
 const pos=[],col=[],veg=[],misc=[],idx=[];
 const cs=new THREE.Color(), cv=new THREE.Color();
 for(let j=0;j<nz;j++) for(let i=0;i<nx;i++){
  const x=X0+i*CS, z=Z0+j*CS;
  let ws=0,hs=0;
  for(const p of samp){ const d2=(p.x-x)**2+(p.z-z)**2; const w=1/(d2+900); ws+=w; hs+=w*p.y; }
  let h=hs/ws;
  const nt=this.nearestTrack(x,z);
  const tp=T.pts[nt.i];
  const flat=this.inFlat(x,z,6);
  const near=clamp((nt.d-this.HALF_W-3)/25,0,1);
  h=lerp(tp.y-0.12,h,near);
  const far=clamp((nt.d-45)/250,0,1);
  if(!flat) h+=far*(2.5*vnoise(x*0.006,z*0.006)+1.0*vnoise(x*0.02+3,z*0.02))*1.6 + (x>200&&z>60? far*6*vnoise(x*0.004,z*0.004):0);
  if(flat) h=-0.08;
  H[j*nx+i]=h;
  pos.push(x,h,z);
  // 色: コース脇=刈り込んだ乾いた芝 / 外周=乾季サバンナ
  const runoff=nt.d<this.HALF_W+30;
  const inner=runoff&&this.insideLoop(x,z);
  if(flat){ cs.setHex(0x8a8070); cv.setHex(0x8a8070); veg.push(0,0,0,0); }
  else if(runoff){ cs.setHex(0x7b6a45); cv.setHex(inner?0x7f8a46:0x8a8a4a); }
  else { cs.setHex(0x6e4a32); cv.setHex(0x9c824f); }
  cs.convertSRGBToLinear(); cv.convertSRGBToLinear();
  col.push(cs.r,cs.g,cs.b);
  if(!flat) veg.push(cv.r,cv.g,cv.b, runoff?0.85:0.66);
  misc.push(flat||runoff?0:0.35, flat?0:0.05, 0);
 }
 for(let j=0;j<nz-1;j++) for(let i=0;i<nx-1;i++){ const a=j*nx+i,b=a+1,c=a+nx,d=c+1; idx.push(a,c,b, b,c,d); }
 const g=new THREE.BufferGeometry();
 g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
 g.setAttribute("color",new THREE.Float32BufferAttribute(col,3));
 g.setAttribute("aVeg",new THREE.Float32BufferAttribute(veg,4));
 g.setAttribute("aMisc",new THREE.Float32BufferAttribute(misc,3));
 g.setIndex(idx); g.computeVertexNormals();
 const n=g.attributes.normal; for(let i=0;i<n.count;i++) if(n.getY(i)<0) n.setXYZ(i,-n.getX(i),-n.getY(i),-n.getZ(i));
 const m=new THREE.Mesh(g,SceneMats.get("ground").mat); m.receiveShadow=true; grp.add(m);
 this.heightAt=(x,z)=>{
  const fi=clamp((x-X0)/CS,0,nx-1.001), fj=clamp((z-Z0)/CS,0,nz-1.001);
  const i=Math.floor(fi), j=Math.floor(fj), u=fi-i, v=fj-j;
  const h00=H[j*nx+i],h10=H[j*nx+i+1],h01=H[(j+1)*nx+i],h11=H[(j+1)*nx+i+1];
  return lerp(lerp(h00,h10,u),lerp(h01,h11,u),v);
 };
 // 遠景の地面
 const far=new THREE.Mesh(new THREE.PlaneGeometry(9000,9000),new THREE.MeshLambertMaterial({color:new THREE.Color(0x7d6a48).convertSRGBToLinear()}));
 far.rotation.x=-Math.PI/2; far.position.y=-3; grp.add(far);
},
/* ---------- コース帯メッシュ ---------- */
// offA/offB: 右方向オフセット(関数 or 数値) / 内側は旋回半径でクランプ
band(i0,i1,offA,offB,yOff,mat,{uvW=1,uvL=4,colFn=null,clampInner=true}={}){
 const T=this.track(), n=T.n;
 const cnt=((i1-i0)%n+n)%n || n;
 const pos=[],uv=[],col=[],idx=[];
 for(let k=0;k<=cnt;k++){
  const i=(i0+k)%n, p=T.pts[i], r=T.right[i], c=T.curv[i];
  let a=typeof offA==="function"?offA(i):offA, b=typeof offB==="function"?offB(i):offB;
  if(clampInner && Math.abs(c)>1e-4){ const lim=0.92/Math.abs(c);
   if(c>0){ a=Math.min(a,lim); b=Math.min(b,lim); } else { a=Math.max(a,-lim); b=Math.max(b,-lim); } }
  const y=p.y+yOff;
  if(a>b){ const t=a; a=b; b=t; }
  pos.push(p.x+r[0]*a,y,p.z+r[1]*a, p.x+r[0]*b,y,p.z+r[1]*b);
  const sv=(T.s[i]+(k>0&&i===0?T.len:0))/uvL;
  uv.push(0,sv, uvW,sv);
  if(colFn){ const c1=colFn(i,k); col.push(c1.r,c1.g,c1.b,c1.r,c1.g,c1.b); }
  if(k>0){ const q=(k-1)*2; idx.push(q,q+1,q+2, q+1,q+3,q+2); }
 }
 const g=new THREE.BufferGeometry();
 g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
 g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
 if(col.length) g.setAttribute("color",new THREE.Float32BufferAttribute(col,3));
 g.setIndex(idx); g.computeVertexNormals();
 const nn=g.attributes.normal; for(let i=0;i<nn.count;i++) if(nn.getY(i)<0) nn.setXYZ(i,-nn.getX(i),-nn.getY(i),-nn.getZ(i));
 const m=new THREE.Mesh(g,mat); m.receiveShadow=true; return m;
},
raceTex(){
 if(this._raceTex) return this._raceTex;
 const W=256,H=512, cv=document.createElement("canvas"); cv.width=W; cv.height=H; const c=cv.getContext("2d");
 c.fillStyle="#46474a"; c.fillRect(0,0,W,H);
 for(let i=0;i<14000;i++){ const l=40+Math.random()*60; c.fillStyle=`rgba(${l},${l},${l+3},${0.3+Math.random()*0.4})`; c.fillRect(Math.random()*W,Math.random()*H,1,1); }
 for(let i=0;i<5;i++){ c.fillStyle=`rgba(30,30,32,${0.06+Math.random()*0.06})`; c.fillRect(0,Math.random()*H,W,20+Math.random()*80); } // 舗装の継ぎ目
 // 白線(コース端 0.3m)
 c.fillStyle="rgba(238,236,228,0.95)"; c.fillRect(0,0,W*0.024,H); c.fillRect(W*0.976,0,W*0.024,H);
 const t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.anisotropy=16; t.encoding=THREE.sRGBEncoding;
 this._raceTex=t; return t;
},
fenceTex(){
 if(this._fenceTex) return this._fenceTex;
 const N=128, cv=document.createElement("canvas"); cv.width=cv.height=N; const c=cv.getContext("2d");
 c.clearRect(0,0,N,N); c.strokeStyle="rgba(170,175,180,0.9)"; c.lineWidth=1.2;
 for(let k=-N;k<N*2;k+=12){ c.beginPath(); c.moveTo(k,0); c.lineTo(k+N,N); c.stroke(); c.beginPath(); c.moveTo(k,N); c.lineTo(k+N,0); c.stroke(); }
 const t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.anisotropy=8; t.encoding=THREE.sRGBEncoding;
 this._fenceTex=t; return t;
},
/* 垂直の壁/フェンス帯 (コース沿い) */
wall(i0,i1,off,h,mat,yBase=0,step=2){
 const T=this.track(), n=T.n, cnt=((i1-i0)%n+n)%n||n;
 const pos=[],uv=[],idx=[]; let k2=0;
 for(let k=0;k<=cnt;k+=step){
  const i=(i0+k)%n, p=T.pts[i], r=T.right[i], c=T.curv[i];
  let o=off; if(Math.abs(c)>1e-4){ const lim=0.92/Math.abs(c); if(c>0&&o>0) o=Math.min(o,lim); if(c<0&&o<0) o=Math.max(o,-lim); }
  const x=p.x+r[0]*o, z=p.z+r[1]*o, y=p.y+yBase;
  pos.push(x,y,z, x,y+h,z); uv.push(T.s[i]/4,0, T.s[i]/4,h/2);
  if(k2>0){ const q=(k2-1)*2; idx.push(q,q+2,q+1, q+1,q+2,q+3); } k2++;
 }
 const g=new THREE.BufferGeometry();
 g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
 g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
 g.setIndex(idx); g.computeVertexNormals();
 const m=new THREE.Mesh(g,mat); m.castShadow=!mat.transparent; m.receiveShadow=true; return m;
},
/* 曲率から コーナー区間 [i0,i1,side,maxCurv] */
corners(){
 const T=this.track(), n=T.n, out=[]; let st=-1;
 for(let i=0;i<=n;i++){
  const c=Math.abs(T.curv[i%n])>1/180;
  if(c&&st<0) st=i;
  if((!c||i===n)&&st>=0){ if(i-st>4){ let sum=0,mx=0; for(let k=st;k<i;k++){ sum+=T.curv[k%n]; mx=Math.max(mx,Math.abs(T.curv[k%n])); } out.push([st%n,(i-1)%n,Math.sign(sum)||1,mx]); } st=-1; }
 }
 return out;
},
/* ---------- 全体 ---------- */
build(){
 const grp=new THREE.Group();
 const T=this.track(), n=T.n, W=this.HALF_W;
 srand(20251022);
 this.buildTerrain(grp);
 const L=(c)=>new THREE.MeshLambertMaterial({color:new THREE.Color(c).convertSRGBToLinear()});
 const vc=(o)=>new THREE.MeshLambertMaterial(Object.assign({vertexColors:true},o));
 const C=(hex)=>new THREE.Color(hex).convertSRGBToLinear();
 // 路面
 const asph=new THREE.MeshLambertMaterial({map:this.raceTex()});
 grp.add(this.band(0,0,-W,W,0.0,asph,{uvL:8}));
 // ラバー(走行ライン): ACのラインを中心線へ投影してオフセット化
 const rub=new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.22,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
 const RL=HV_DATA.racing, roff=new Float32Array(n).fill(NaN);
 for(const q of RL){ const nt=this.nearestTrack(q[0],q[1]); const p=T.pts[nt.i], r=T.right[nt.i]; roff[nt.i]=clamp((q[0]-p.x)*r[0]+(q[1]-p.z)*r[1],-W+1,W-1); }
 let last=0; for(let k=0;k<n*2;k++){ const i=k%n; if(!isNaN(roff[i])) last=roff[i]; else roff[i]=last; }
 for(let it=0;it<3;it++) for(let i=0;i<n;i++) roff[i]=(roff[(i-1+n)%n]+roff[i]+roff[(i+1)%n])/3;
 grp.add(this.band(0,0,i=>roff[i]-0.9,i=>roff[i]+0.9,0.012,rub,{clampInner:false}));
 // 縁石: 内側(エイペックス)=赤白 / 出口外側=赤白の幅広
 const kerbMat=vc({});
 const red=C(0xb3242b), white=C(0xe9e6de);
 const kc=(i)=> (Math.floor(T.s[i]/1.6)%2)? red : white;
 const cs=this.corners();
 for(const [a,b,side,mx] of cs){
  const a2=(a-3+n)%n, b2=(b+6)%n;
  grp.add(this.band(a2,b,side*(W-0.2),side*(W+1.0),0.03,kerbMat,{colFn:kc}));
  grp.add(this.band((a+((b-a+n)%n)>>1)%n,b2,-side*(W-0.2),-side*(W+1.3),0.025,kerbMat,{colFn:kc}));
 }
 // ランオフ: 急コーナー外側に砂利、それ以外は芝(地形)
 const gravel=new THREE.MeshLambertMaterial({map:detailTex(),color:C(0xc9ad84)});
 const tyreMat=L(0x18181a), beltR=L(0xc8202a), beltW=L(0xeeeeee);
 const bs=new BatchSet();
 for(const [a,b,side,mx] of cs){
  if(mx<1/45) continue;
  const a2=(a-6+n)%n, b2=(b+10)%n;
  grp.add(this.band(a2,b2,-side*(W+2.2),-side*(W+26),-0.04,gravel,{uvL:4}));
  // タイヤバリア(赤白ベルトカバー)
  const cnt=((b2-a2)%n+n)%n;
  for(let k=0;k<cnt;k+=2){ const i=(a2+k)%n, p=T.pts[i], r=T.right[i];
   const o=-side*(W+27.5), x=p.x+r[0]*o, z=p.z+r[1]*o;
   bs.get("solid").add(tpl("cyl8"),M4(x,p.y,z,0.75,1.1,0.75),linCol(0x18181a));
   bs.get("solid").add(tpl("box"),M4(x-r[0]*side*0.8,p.y+0.05,z-r[1]*side*0.8,0.05,1.05,3.2,-Math.atan2(T.fwd[i][0],-T.fwd[i][1])),linCol(Math.floor(k/2)%2?0xc8202a:0xeeeeee));
  }
 }
 // ガードレール(アームコ): 全周の外側, ストレートはコンクリ壁+デブリフェンス
 const steel=L(0xb8bcc0), conc=L(0xd6d3cb); steel.side=conc.side=THREE.DoubleSide;
 const fence=new THREE.MeshLambertMaterial({map:this.fenceTex(),transparent:true,side:THREE.DoubleSide,alphaTest:0.25});
 const straight=[(n-150)%n,150];
 for(const [a,b,side,mx] of cs){
  const a2=(a-8+n)%n, b2=(b+12)%n, o=-side*(mx<1/45?W+30:W+14);
  grp.add(this.wall(a2,b2,o,0.75,steel,0.1));
 }
 // メインストレート: 南=ピットウォール(コンクリ+フェンス) / 北=ドラッグストリップ側のコンクリ壁
 grp.add(this.wall(straight[0],straight[1],W+3.2,1.1,conc));
 grp.add(this.wall(straight[0],straight[1],W+3.2,3.5,fence,1.1));
 grp.add(this.wall(straight[0],straight[1],-(W+5),1.1,conc));
 grp.add(this.wall(straight[0],straight[1],-(W+5),3.0,fence,1.1));
 this.buildStartFinish(grp,bs);
 this.buildPits(grp,bs);
 this.buildDragStrip(grp,bs);
 this.buildPaddock(grp,bs);
 this.buildSurroundings(grp,bs);
 this.buildBrakeBoards(grp,bs);
 bs.toGroup(grp);
 grp.traverse(o=>{ if(o.isMesh&&o.geometry&&!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); });
 return grp;
},
buildStartFinish(grp,bs){
 const T=this.track(), W=this.HALF_W, p=T.pts[0], r=T.right[0], f=T.fwd[0];
 const ry=-Math.atan2(f[0],-f[1]);
 // チェッカーライン
 const cv=document.createElement("canvas"); cv.width=256; cv.height=32; const c=cv.getContext("2d");
 for(let i=0;i<32;i++) for(let j=0;j<4;j++){ c.fillStyle=(i+j)%2?"#111":"#f4f4f4"; c.fillRect(i*8,j*8,8,8); }
 const tx=new THREE.CanvasTexture(cv); tx.encoding=THREE.sRGBEncoding; tx.anisotropy=8;
 const line=new THREE.Mesh(new THREE.PlaneGeometry(W*2,1.0),new THREE.MeshLambertMaterial({map:tx}));
 line.rotation.order="YXZ"; line.rotation.set(-Math.PI/2,ry,0); line.position.set(p.x,p.y+0.02,p.z); grp.add(line);
 // グリッド枠 (S/F の後方, 千鳥配置)
 for(let k=1;k<=12;k++){ const back=8+k*8, side=(k%2?-1:1)*2.8;
  const q=[p.x-f[0]*back+r[0]*side, p.z-f[1]*back+r[1]*side];
  bs.get("solid").add(tpl("box"),M4(q[0],p.y+0.012,q[1],2.6,0.01,0.15,ry),linCol(0xeeeeea));
  bs.get("solid").add(tpl("box"),M4(q[0]-r[0]*1.3,p.y+0.012,q[1]-r[1]*1.3,0.15,0.01,1.6,ry),linCol(0xeeeeea));
 }
 // スタートガントリー (信号灯付き)
 for(const sd of [-1,1]){ const o=sd*(W+3); bs.get("solid").add(tpl("box"),M4(p.x+r[0]*o,p.y,p.z+r[1]*o,0.6,7.5,0.6,ry),linCol(0x30343a)); }
 bs.get("solid").add(tpl("boxC"),M4(p.x,p.y+7.2,p.z,(W+3)*2+0.6,1.2,0.8,ry+Math.PI/2*0),linCol(0x30343a));
 for(let k=-2;k<=2;k++) bs.get("solid").add(tpl("boxC"),M4(p.x+r[0]*k*1.6,p.y+6.0,p.z+r[1]*k*1.6,0.9,1.4,0.5,ry),linCol(0x111111));
 // コントロールタワー (S/F 南側)
 const [tx2,tz2]=this.SW(30,22);
 bs.get("solid").add(boxMetric(12,5,10),M4(tx2,0,tz2,1,1,1,ry),linCol(0xe9e7e1));
 bs.get("office").add(boxMetric(12,8,10,6,7),M4(tx2,5,tz2,1,1,1,ry),linCol(0xffffff));
 bs.get("solid").add(tpl("box"),M4(tx2,13,tz2,13,0.6,11,ry),linCol(0x30343a));
},
/* ピットレーン + ガレージ */
buildPits(grp,bs){
 const T=this.track();
 const latOf=(p)=>p[0]*T.sr[0]+p[2]*T.sr[1];
 const P=HV_DATA.pit.filter(p=>latOf(p)>this.HALF_W+3.6).map(p=>new THREE.Vector3(p[0],p[1],p[2]));
 const pos=[],uv=[],idx=[];
 for(let i=0;i<P.length;i++){
  const a=P[Math.max(0,i-1)], b=P[Math.min(P.length-1,i+1)];
  const fx=b.x-a.x, fz=b.z-a.z, L=Math.hypot(fx,fz)||1, rx=-fz/L, rz=fx/L;
  const w0=-2.0, w1=9.0; // 走行レーン + 作業レーン(南側)
  pos.push(P[i].x+rx*w0,0.015,P[i].z+rz*w0, P[i].x+rx*w1,0.015,P[i].z+rz*w1);
  uv.push(0,i*4/8, 1,i*4/8);
  if(i>0){ const q=(i-1)*2; idx.push(q,q+1,q+2, q+1,q+3,q+2); }
 }
 const g=new THREE.BufferGeometry(); g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3)); g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2)); g.setIndex(idx); g.computeVertexNormals();
 const m=new THREE.Mesh(g,new THREE.MeshLambertMaterial({map:roadTex("urban")})); m.receiveShadow=true; grp.add(m);
 // ガレージ棟 (ストレート座標 along -200..+230, 南側)
 const ry=-Math.atan2(T.sd[0],-T.sd[1])+Math.PI;   // 正面=北(コース側)
 const teams=[0xf97316,0x1f5f9b,0xc0392b,0xe5b324,0x2e7d4f,0xf0f0f0,0x6b2d8f,0x1d1d1d,0x0aa4b8,0xd8d8d8];
 for(let k=0;k<22;k++){
  const al=-200+k*19.5, [x,z]=this.SW(al,32);
  bs.get("solid").add(tpl("box"),M4(x,0,z,16,6.5,19,ry),linCol(0xdedbd2));
  const [dx,dz]=this.SW(al,23.95);
  bs.get("corr").add(boxMetric(0.08,4.5,14,1,1),M4(dx,0,dz,1,1,1,ry),linCol(k%3?0xc9ccce:teams[k%teams.length]),1);
  bs.get("solid").add(tpl("box"),M4(dx,4.8,dz,0.12,1.1,18,ry),linCol(teams[k%teams.length]));
 }
 const [rx,rz]=this.SW(15,32); bs.get("corr").add(tpl("box"),M4(rx,6.5,rz,19,0.35,432,ry),linCol(0xd9d6c8),1);
 // ピットウォール上の計時台
 for(let k=0;k<10;k++){ const [x,z]=this.SW(-150+k*36,W_PIT()); bs.get("solid").add(tpl("box"),M4(x,0,z,2.4,2.4,1.6,ry),linCol(0xe8e6e0)); }
 function W_PIT(){ return HV.HALF_W+5.5; }
},
/* ドラッグストリップ + 試験マーキング */
buildDragStrip(grp,bs){
 const T=this.track(), [a0,a1]=this.stripRange(), O=this.STRIP_OFF, Hw=this.STRIP_HALF;
 const len=a1-a0, [cx,cz]=this.SW((a0+a1)/2,O);
 const ry=-Math.atan2(T.sd[0],-T.sd[1]);
 const tex=roadTex("urban").clone(); tex.needsUpdate=true; tex.repeat.set(1,len/12);
 const strip=new THREE.Mesh(new THREE.PlaneGeometry(Hw*2,len),new THREE.MeshLambertMaterial({map:tex}));
 strip.rotation.order="YXZ"; strip.rotation.set(-Math.PI/2,ry,0); strip.position.set(cx,0.03,cz); strip.receiveShadow=true; grp.add(strip);
 // 発進側(南西端)のコンクリパッド・クリスマスツリー・計時ボード
 const [px,pz]=this.SW(a0+60,O); bs.get("solid").add(tpl("box"),M4(px,0.02,pz,Hw*2-0.4,0.03,120,ry),linCol(0xb9b4a8));
 const [tx,tz]=this.SW(a0+125,O); bs.get("solid").add(tpl("box"),M4(tx,0,tz,0.35,2.6,0.35,ry),linCol(0x222222));
 for(let k=0;k<6;k++) bs.get("solid").add(tpl("boxC"),M4(tx,2.6+k*0.3,tz,0.55,0.22,0.3,ry),linCol(k<3?0xffb000:k<5?0x20c050:0xd02020));
 for(const sd of [-1,1]){ const [bx,bz]=this.SW(a0+527,O+sd*(Hw+4)); bs.get("solid").add(tpl("box"),M4(bx,0,bz,6,7,0.6,ry+Math.PI/2),linCol(0x1d1d1d)); }
 // センターライン
 for(let al=a0+5;al<a1-5;al+=6){ const [x,z]=this.SW(al,O); bs.get("solid").add(tpl("box"),M4(x,0.045,z,0.15,0.01,3,ry),linCol(0xf0eee6)); }
 // 試験マーキング (北東端から南西へ走行)
 const fr=this.frames().strip;
 const g=new THREE.Group(); g.matrixAutoUpdate=false; g.matrix.copy(this.frameMatrix(fr)); grp.add(g);
 this.stripMarks=g;
 const lineL=(x,color,w=0.5)=>{ const l=new THREE.Mesh(new THREE.BoxGeometry(w,0.02,Hw*2-1),new THREE.MeshBasicMaterial({color})); l.position.set(x,0.01,0); g.add(l); };
 lineL(0,0xffffff,0.6); lineL(126,0xf97316,0.8);
 this.cones=[];
 for(let i=0;i<7;i++){ const c=new THREE.Mesh(new THREE.ConeGeometry(0.28,0.75,12),new THREE.MeshLambertMaterial({color:0xff4d00}));
  c.position.set(9+i*18,0.38,0); c.castShadow=true; g.add(c); this.cones.push(c); c.userData.hit=false; }
 const B=this.BRAKE_X; lineL(B,0xffffff,0.6); lineL(B+14,0xdd2222,0.6); for(const d of [5,10]) lineL(B+d,0x888888,0.25);
 // 走路の縁のパイロン(ゲート)
 for(const x of [-60,0,126,B-60,B,B+14,B+60]) for(const sd of [-1,1]){
  const c=new THREE.Mesh(new THREE.ConeGeometry(0.22,0.6,10),new THREE.MeshLambertMaterial({color:0xff7a00})); c.position.set(x,0.3,sd*(Hw-0.6)); g.add(c); }
},
/* パドック (BWSC チームテント・車検テント) + PIT PADDOCK 駐車場の8の字 */
buildPaddock(grp,bs){
 const T=this.track(), ry=-Math.atan2(T.sd[0],-T.sd[1]);
 const pad=(al0,al1,lt0,lt1,color)=>{ const [x,z]=this.SW((al0+al1)/2,(lt0+lt1)/2);
  bs.get("solid").add(tpl("box"),M4(x,-0.05,z,lt1-lt0,0.1,al1-al0,ry),linCol(color)); };
 pad(-260,300,48,140,0x5a5b5e);
 pad(-120,260,140,270,0x55565a);
 // 車検用大型テント
 const [mx,mz]=this.SW(-60,70); bs.get("solid").add(tpl("box"),M4(mx,0,mz,20,3.2,40,ry),linCol(0xf4f4f2));
 bs.get("solidDS").add(tpl("gable"),M4(mx,3.2,mz,20.4,3.0,40.4,ry),linCol(0xf8f8f6));
 // チームテント (ゲイジボ) と随伴車
 const canopies=[0xf97316,0xffffff,0x1f5f9b,0xc0392b,0xe5b324,0x2e7d4f,0x0aa4b8,0x6b2d8f,0xd8d8d8,0x1d1d1d];
 let k=0;
 for(let al=-230;al<280;al+=17) for(const lt of [62,96,124]){
  if(al>-90&&al<-30&&lt<100) continue;
  const [x,z]=this.SW(al+rndr(-1,1),lt), col=canopies[k++%canopies.length];
  for(const [u,v] of [[-1,-1],[1,-1],[1,1],[-1,1]]){ const [px,pz]=this.SW(al+u*2.9,lt+v*2.9); bs.get("solid").add(tpl("cyl5"),M4(px,0,pz,0.04,2.6,0.04),linCol(0x8a8d90)); }
  bs.get("solidDS").add(tpl("hiproof"),M4(x,2.6,z,6,0.9,6,ry),linCol(col));
  if(rnd()<0.6){ const [cx,cz]=this.SW(al+rndr(-3,3),lt+6); PR.car(bs,cx,0,cz,ry+Math.PI/2,rnd()<0.5); }
 }
 // PIT PADDOCK 駐車場: 区画線 + 8の字コース(内円半径6m・幅5m)
 for(let al=-110;al<250;al+=3) for(const lt of [150,262]){ if(al>20&&al<100) continue; const [x,z]=this.SW(al,lt); bs.get("solid").add(tpl("box"),M4(x,0.005,z,5,0.01,0.12,ry+Math.PI/2),linCol(0xeeeeea)); }
 const fr=this.frames().fig8;
 const g=new THREE.Group(); g.matrixAutoUpdate=false; g.matrix.copy(this.frameMatrix(fr)); grp.add(g);
 for(const cx of [-8.5,8.5]){
  const ring=new THREE.Mesh(new THREE.RingGeometry(6,11,72),new THREE.MeshLambertMaterial({color:0x76787c})); ring.rotation.x=-Math.PI/2; ring.position.set(cx,0.012,0); g.add(ring);
  for(const r of [6,11]){ const ln=new THREE.Mesh(new THREE.RingGeometry(r-0.08,r+0.08,96),new THREE.MeshBasicMaterial({color:0xffffff})); ln.rotation.x=-Math.PI/2; ln.position.set(cx,0.02,0); g.add(ln); }
  for(let a=0;a<12;a++){ const t=a/12*Math.PI*2; const c=new THREE.Mesh(new THREE.ConeGeometry(0.2,0.5,10),new THREE.MeshLambertMaterial({color:0xff6a00})); c.position.set(cx+Math.cos(t)*5.6,0.25,Math.sin(t)*5.6); g.add(c); }
 }
 const sl=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.02,5),new THREE.MeshBasicMaterial({color:0xffffff})); sl.position.set(0,0.03,0); g.add(sl);
},
buildBrakeBoards(grp,bs){ // 急コーナー手前の制動目安ボード (300/200/100)
 const T=this.track(), n=T.n, W=this.HALF_W;
 for(const [a,b,side,mx] of this.corners()){
  if(mx<1/45) continue;
  for(const [d,txt] of [[300,"300"],[200,"200"],[100,"100"]]){
   const i=(a-Math.round(d/3)+n)%n, p=T.pts[i], r=T.right[i], o=-side*(W+4);
   const x=p.x+r[0]*o, z=p.z+r[1]*o, ry=-Math.atan2(T.fwd[i][0],-T.fwd[i][1]);
   const m=new THREE.Mesh(new THREE.PlaneGeometry(1.2,1.2),new THREE.MeshLambertMaterial({map:signTex("speed",txt)}));
   m.position.set(x,p.y+1.5,z); m.rotation.y=ry; grp.add(m);
   bs.get("solid").add(tpl("box"),M4(x,p.y,z-0.02,0.08,0.9,0.08),linCol(0x9a9da0));
  }
 }
},
/* 周辺: ダーウィン郊外の乾季サバンナ (ユーカリ疎林・蟻塚・枯れ草) + 観客スタンド */
buildSurroundings(grp,bs){
 const T=this.track(), ry=-Math.atan2(T.sd[0],-T.sd[1]);
 // 観客スタンド: ドラッグストリップの北側 (S/F 対面)
 for(const al of [-40,40]){ const [x,z]=this.SW(al,this.STRIP_OFF-this.STRIP_HALF-14);
  for(let r=0;r<8;r++){ const [sx,sz]=this.SW(al,this.STRIP_OFF-this.STRIP_HALF-10-r*1.2); bs.get("solid").add(tpl("box"),M4(sx,0,sz,1.25,0.6+r*0.55,60,ry),linCol(r%2?0xb9bcc0:0xa9adb2)); }
  for(const u of [-28,0,28]) for(const v of [-2,-14]){ const [px,pz]=this.SW(al+u,this.STRIP_OFF-this.STRIP_HALF+v); bs.get("solid").add(tpl("cyl5"),M4(px,0,pz,0.12,7,0.12),linCol(0x9a9da0)); }
  bs.get("corr").add(tpl("box"),M4(x,7,z,14,0.2,62,ry,0,0.08),linCol(0xe4e2d5),2); }
 // 樹木・蟻塚・草 (コース/舗装/流路から離して)
 let placed=0, tries=0;
 while(placed<1500 && tries<9000){ tries++;
  const x=rndr(-1100,950), z=rndr(-620,600);
  const nt=this.nearestTrack(x,z);
  if(nt.d<38 || this.inFlat(x,z,15)) continue;
  const inner=this.insideLoop(x,z);
  const dens= inner? 0.25 : (x>150&&z>0? 1.0 : 0.6);  // 南東側は濃い林
  if(rnd()>dens) continue;
  if(vnoise(x*0.01+3,z*0.01-7)<0.3) continue;
  const y=this.heightAt(x,z)-0.05;
  PR.tree(bs,x,y,z,rnd()<0.85?"woodland":"ghost",rndr(0.85,1.15),nt.d>260?1:0); placed++;
 }
 for(let i=0;i<220;i++){ const x=rndr(-1000,900), z=rndr(-560,560); const nt=this.nearestTrack(x,z);
  if(nt.d<30||this.inFlat(x,z,10)) continue; PR.termite(bs,x,this.heightAt(x,z),z,rndr(0.8,1.3)); }
 for(let i=0;i<2600;i++){ const x=rndr(-700,700), z=rndr(-450,450); const nt=this.nearestTrack(x,z);
  if(nt.d<this.HALF_W+30||this.inFlat(x,z,8)) continue; PR.grass(bs,x,this.heightAt(x,z),z,1); }
 // コース内側の施設 (T6-T7 付近の倉庫群)
 for(const [x,z] of [[-310,-250],[-260,-275],[-205,-255]]) PR.shed(bs,x,this.heightAt(x,z),z,ry);
 // 照明柱・マーシャルポスト
 for(const [a,b,side,mx] of this.corners()){
  const i=(a+((b-a+T.n)%T.n>>1))%T.n, p=T.pts[i], r=T.right[i], o=-side*(this.HALF_W+(mx<1/45?33:18));
  const x=p.x+r[0]*o, z=p.z+r[1]*o;
  bs.get("solid").add(tpl("box"),M4(x,this.heightAt(x,z),z,2.2,2.4,2.2,ry),linCol(0xf97316));
  bs.get("solid").add(tpl("box"),M4(x,this.heightAt(x,z)+2.4,z,2.6,0.2,2.6,ry),linCol(0xe8e6e0));
 }
},
};
