"use strict";
/* ============ 個別プロップ (BatchSetへ書き込む) ============
 座標はワールド。ry は道路方向(-h)基準で回す。乱数は rnd() (チャンクごとに srand 済み) */
const PR={
/* ---------- 植物 ---------- */
tree(bs,x,y,z,kind,sc=1,lod=0){
 const ry=rnd()*6.28;
 const cfg={
  woodland:{h:[8,16],tr:[0.13,0.22],bark:0x5f5850,crown:0x5f6d42,cr:[1.3,2.1],n:5,spread:1.0,top:0.7},
  ghost:{h:[6,11],tr:[0.15,0.24],bark:0xe9e5dc,crown:0x7a8f45,cr:[1.6,2.5],n:5,spread:1.1,top:0.55},
  redgum:{h:[10,18],tr:[0.35,0.6],bark:0xb9b2a6,crown:0x56653a,cr:[1.8,2.8],n:9,spread:1.9,top:0.5},
  mango:{h:[6,9],tr:[0.22,0.3],bark:0x4a3f35,crown:0x2f4a22,cr:[2.6,3.4],n:6,spread:0.9,top:0.35},
  street:{h:[6,10],tr:[0.18,0.26],bark:0x6b6156,crown:0x5a7034,cr:[1.8,2.6],n:5,spread:1.0,top:0.5},
  windbreak:{h:[9,15],tr:[0.2,0.32],bark:0x8d867a,crown:0x4f5c38,cr:[2.0,3.0],n:5,spread:0.9,top:0.5},
 }[kind]||null;
 if(!cfg) return;
 const H=rndr(cfg.h[0],cfg.h[1])*sc, tr=rndr(cfg.tr[0],cfg.tr[1])*sc;
 const lean=(rnd()-0.5)*0.12;
 bs.get("bark").add(tpl("trunk"),M4(x,y,z,tr,H*cfg.top+0.6,tr,ry,lean,0),linCol(cfg.bark,0.08));
 // 主枝
 if(!lod) { const a=ry+rnd();
  bs.get("bark").add(tpl("trunk"),M4(x,y+H*cfg.top*0.8,z,tr*0.4,H*0.22,tr*0.4,a,0.5+rnd()*0.2,0),linCol(cfg.bark,0.08)); }
 const nC=lod? Math.max(2,Math.ceil(cfg.n/3)) : cfg.n;
 for(let i=0;i<nC;i++){
  const cy=y+H*rndr(0.55,0.95);
  const a=rnd()*6.28, d=rnd()*cfg.spread*cfg.cr[1]*sc*0.8;
  const r=rndr(cfg.cr[0],cfg.cr[1])*sc*(kind==="mango"?1:0.75);
  bs.get("veg").add(tpl("ico0"),M4(x+Math.cos(a)*d,cy,z+Math.sin(a)*d,r*rndr(0.8,1.2),r*(kind==="mango"?0.85:rndr(0.6,0.85)),r*rndr(0.8,1.2),rnd()*6,rnd(),rnd()),linCol(cfg.crown,0.14));
 }
},
desertoak(bs,x,y,z,sc=1){
 const H=rndr(7,12)*sc;
 bs.get("bark").add(tpl("trunk"),M4(x,y,z,0.2*sc,H*0.75,0.2*sc,rnd()*6),linCol(0x3d332c,0.1));
 for(let i=0;i<3;i++){ const a=rnd()*6.28, d=rnd()*0.5*sc;
  bs.get("veg").add(tpl("ico0"),M4(x+Math.cos(a)*d,y+H*(0.45+i*0.18),z+Math.sin(a)*d,1.2*sc*(1-i*0.2),1.9*sc,1.2*sc*(1-i*0.2),rnd()*6),linCol(0x4f5a4a,0.1)); }
},
mulga(bs,x,y,z,sc=1){
 const H=rndr(2.5,5)*sc;
 for(let i=0;i<3;i++){ const a=rnd()*6.28;
  bs.get("bark").add(tpl("cyl5"),M4(x,y,z,0.06*sc,H*0.7,0.06*sc,a,0.25+rnd()*0.2,0),linCol(0x3a2e25,0.1)); }
 for(let i=0;i<3;i++){ const a=rnd()*6.28,d=rnd()*0.9*sc;
  bs.get("veg").add(tpl("ico0"),M4(x+Math.cos(a)*d,y+H*0.75,z+Math.sin(a)*d,1.3*sc,0.55*sc,1.3*sc,rnd()*6),linCol(0x6e7452,0.12)); }
},
spinifex(bs,x,y,z,sc=1){
 const r=rndr(0.4,0.95)*sc;
 const c=rnd()<0.6?0x9a9160:0x8a8a62;
 bs.get("veg").add(tpl("ico0"),M4(x,y+0.15*r,z,r,r*rndr(0.55,0.75),r*rndr(0.8,1.2),rnd()*6),linCol(c,0.12));
 for(let i=0;i<3;i++){ const a=rnd()*6.28; bs.get("veg").add(tpl("blade"),M4(x+Math.cos(a)*r*0.5,y,z+Math.sin(a)*r*0.5,0.12*r,r*1.0,0.12*r,a,0.5,0),linCol(0xb0a466,0.1)); }
},
grass(bs,x,y,z,sc=1){ // 乾季の枯れ草の株(ソルガム/ミッチェルグラス): 細い葉束を放射状に
 const h=rndr(0.7,1.7)*sc, col=rnd()<0.7?0xb39a62:0x9c8c5c;
 for(let i=0;i<4;i++){ const a=rnd()*6.28;
  bs.get("veg").add(tpl("blade"),M4(x+Math.cos(a)*0.12,y,z+Math.sin(a)*0.12,0.16*sc,h*rndr(0.7,1),0.16*sc,a,0.25+rnd()*0.3,0),linCol(col,0.12)); }
},
saltbush(bs,x,y,z,sc=1){ // ソルトブッシュ/ブルーブッシュ: 低い灰緑の株
 const r=rndr(0.5,1.0)*sc, c=rnd()<0.55?0x7d8a6c:0x8a9590;
 bs.get("veg").add(tpl("ico0"),M4(x,y+r*0.3,z,r,r*0.75,r*rndr(0.8,1.2),rnd()*6),linCol(c,0.1));
 if(rnd()<0.6){ const a=rnd()*6.28; bs.get("veg").add(tpl("ico0"),M4(x+Math.cos(a)*r*0.8,y+r*0.2,z+Math.sin(a)*r*0.8,r*0.6,r*0.5,r*0.6,rnd()*6),linCol(c,0.12)); }
},
pandanus(bs,x,y,z,sc=1){
 const H=rndr(2.5,4)*sc;
 bs.get("bark").add(tpl("trunk"),M4(x,y,z,0.1*sc,H,0.1*sc,0,(rnd()-0.5)*0.4,0),linCol(0x6a5a48));
 for(let i=0;i<9;i++){ const a=i/9*6.28;
  bs.get("veg").add(tpl("frond"),M4(x,y+H,z,1.4*sc,1.2*sc,1.3*sc,a,-0.3,0),linCol(0x6c7f3a,0.1)); }
},
palm(bs,x,y,z,sc=1){
 const H=rndr(7,13)*sc, lean=(rnd()-0.5)*0.18, ry=rnd()*6.28;
 bs.get("bark").add(tpl("cyl8"),M4(x,y,z,0.18*sc,H,0.18*sc,ry,lean,0),linCol(0x8a7c68,0.08));
 const tx=x+Math.sin(ry)*Math.sin(lean)*H, tz=z+Math.cos(ry)*Math.sin(lean)*H*-1, ty=y+H*Math.cos(lean);
 for(let i=0;i<11;i++){ const a=i/11*6.28+rnd()*0.3;
  bs.get("veg").add(tpl("frond"),M4(tx,ty,tz,2.6*sc,2.2*sc,3.4*sc,a,-0.15-rnd()*0.4,0),linCol(0x48702c,0.12)); }
 bs.get("veg").add(tpl("ico0"),M4(tx,ty-0.2,tz,0.45*sc,0.5*sc,0.45*sc),linCol(0x6b5a35));
},
termite(bs,x,y,z,sc=1){
 const H=rndr(1.2,4.2)*sc, r=rndr(0.45,0.9)*sc, col=rnd()<0.6?0xa2552d:0x8d7d6a;
 bs.get("solid").add(tpl("cone7"),M4(x,y-0.1,z,r,H,r*rndr(0.8,1.1),rnd()*6),linCol(col,0.08));
 for(let i=0;i<2;i++){ const a=rnd()*6.28;
  bs.get("solid").add(tpl("cone5"),M4(x+Math.cos(a)*r*0.6,y-0.1,z+Math.sin(a)*r*0.6,r*0.55,H*rndr(0.4,0.75),r*0.55,rnd()*6),linCol(col,0.1)); }
},
rock(bs,x,y,z,sc=1,col=0x8b4426){
 const r=rndr(0.3,1.4)*sc;
 bs.get("solid").add(tpl("dode"),M4(x,y+r*0.1,z,r*rndr(0.9,1.5),r*rndr(0.5,0.9),r,rnd()*6,rnd(),rnd()),linCol(col,0.12));
},
marbles(bs,x,y,z,sc=1){ // デビルズマーブル: 丸く風化した花崗岩の積み重なり
 const n=2+Math.floor(rnd()*4);
 let yy=y;
 for(let i=0;i<n;i++){
  const r=rndr(1.6,3.8)*sc*(i?0.75:1);
  const a=rnd()*6.28, d=i?rnd()*r*0.4:0;
  bs.get("solid").add(tpl("ico1"),M4(x+Math.cos(a)*d,yy+r*0.85,z+Math.sin(a)*d,r*rndr(1,1.3),r*rndr(0.85,1),r,rnd()*6),linCol(rnd()<0.5?0xa45a38:0x9a6046,0.1));
  if(rnd()<0.5) yy+=r*1.5;
 }
},
mullock(bs,x,y,z,sc=1){ // クーバーペディのオパール採掘ズリ山
 const r=rndr(3,7)*sc, h=rndr(2.5,5.5)*sc;
 bs.get("solid").add(tpl("cone7"),M4(x,y-0.2,z,r,h,r*rndr(0.8,1.2),rnd()*6),linCol(rnd()<0.5?0xd7c7a8:0xc9a47a,0.08));
},
/* ---------- 構造物 ---------- */
// 豪州郊外の煉瓦平屋 (アデレード: 寄棟+テラコッタ/カラーボンド, ベランダ)
houseBrick(bs,x,y,z,ry,sc=1){
 const w=rndr(11,16), d=rndr(9,13), h=rndr(2.6,3.0);
 const bc=rndPick([0xb6644a,0xc98a62,0xd8c3a0,0x9a5640,0x8c8f96,0xc4b59a]);
 const cos=Math.cos(ry),sin=Math.sin(ry);
 const L=(lx,lz)=>[x+lx*cos+lz*sin, z-lx*sin+lz*cos];
 bs.get("brick").add(boxMetric(w,h,d,2,2),M4(x,y,z,1,1,1,ry),linCol(bc,0.05));
 const terracotta=rnd()<0.5;
 const rc=terracotta? rndPick([0xa64b2c,0x8f3e24,0xb35a34]) : rndPick([0x4d4f48,0x6c6153,0x323233,0xd9d6c8,0x5e1d0e,0x7d7a70]);
 bs.get(terracotta?"tile":"corr").add(tpl("hiproof"),M4(x,y+h,z,w+1.0,rndr(2.0,2.8),d+1.0,ry+Math.PI/2),linCol(rc,0.05),6);
 // 窓 (道路側=ローカル -z 面)
 for(const lx of [-w*0.3,w*0.3]){ const [wx,wz]=L(lx,-d/2-0.05);
  bs.get("solid").add(tpl("box"),M4(wx,y+0.8,wz,1.9,1.45,0.1,ry),linCol(0xf2f0ea));
  bs.get("glass").add(tpl("box"),M4(wx-sin*0.04,y+0.88,wz-cos*0.04,1.7,1.25,0.08,ry),linCol(0x24323c)); }
 // ベランダ(ポーチ)
 if(rnd()<0.7){ const [vx,vz]=L(0,-d/2-1.4);
  bs.get("corr").add(tpl("box"),M4(vx,y+2.55,vz,w*0.55,0.08,2.8,ry,-0.06,0),linCol(rc,0.05));
  for(const lx of [-w*0.26,w*0.26]){ const [px,pz]=L(lx,-d/2-2.6); bs.get("solid").add(tpl("box"),M4(px,y,pz,0.12,2.55,0.12,ry),linCol(0xeeeeea)); } }
 // 庭の芝・ドライブウェイ・低い塀
 const [gx,gz]=L(0,-d/2-6); bs.get("solid").add(tpl("box"),M4(gx,y-0.12,gz,w+4,0.14,11,ry),linCol(0x6f8a3c,0.12));
 const [dx,dz]=L(w/2+1.8,-d/2-5.5); bs.get("solid").add(tpl("box"),M4(dx,y-0.08,dz,3.2,0.12,12,ry),linCol(0xb9b4a8,0.05));
 const [fx,fz]=L(0,-d/2-11.4); bs.get("brick").add(boxMetric(w+3,0.7,0.3,2,2),M4(fx,y,fz,1,1,1,ry),linCol(bc,0.05));
 // 隣地境界のカラーボンド塀
 for(const sx of [-1,1]){ const [cx,cz]=L(sx*(w/2+3.6),0); bs.get("corr").add(tpl("box"),M4(cx,y,cz,0.05,1.8,d+6,ry),linCol(rndPick([0x8b8e84,0x9a9586,0x7d8478,0xb0ab9a]))); }
 if(rnd()<0.45){ const [cx,cz]=L(w/2+1.8,-d/2-4); PR.car(bs,cx,y,cz,ry); }
 if(rnd()<0.6){ const [tx,tz]=L(-w/2+1,-d/2-7); PR.tree(bs,tx,y,tz,rnd()<0.5?"street":"redgum",0.7); }
},
// ダーウィンの高床式トロピカル住宅 (ルーバー窓・低勾配カラーボンド屋根)
houseTropical(bs,x,y,z,ry){
 const w=rndr(10,14), d=rndr(8,11), h=2.8, stilt=rndr(2.3,2.9);
 const cos=Math.cos(ry),sin=Math.sin(ry);
 const L=(lx,lz)=>[x+lx*cos+lz*sin, z-lx*sin+lz*cos];
 for(const lx of [-w/2+0.3,0,w/2-0.3]) for(const lz of [-d/2+0.3,d/2-0.3]){ const [px,pz]=L(lx,lz);
  bs.get("solid").add(tpl("box"),M4(px,y,pz,0.25,stilt,0.25,ry),linCol(0xd8d4c8)); }
 bs.get("solid").add(tpl("box"),M4(x,y+stilt,z,w,h,d,ry),linCol(rndPick([0xf1eee4,0xe8e1c9,0xdfe8e2,0xf3e7d3]),0.03));
 for(let i=0;i<3;i++){ const [wx,wz]=L(-w*0.32+i*w*0.32,-d/2-0.05);
  bs.get("glass").add(tpl("box"),M4(wx,y+stilt+0.7,wz,2.1,1.3,0.08,ry),linCol(0x3a4a50)); }
 bs.get("corr").add(tpl("gable"),M4(x,y+stilt+h,z,d+2.4,1.1,w+1.6,ry+Math.PI/2),linCol(rndPick([0xe4e2d5,0xd9d6c8,0x8a9a93,0x6c7a83]),0.04),4);
 const [gx,gz]=L(0,-d/2-5); bs.get("solid").add(tpl("box"),M4(gx,y-0.12,gz,w+6,0.14,10,ry),linCol(0x5d7f31,0.12));
 if(rnd()<0.5){ const [cx,cz]=L(-w/2+1.5,0); PR.car(bs,cx,y,cz,ry); }
 // シェードクロス / 物置下の駐車
},
// アウトバックの町のトタン屋根住宅 (四周ベランダ + 雨水タンク)
houseOutback(bs,x,y,z,ry){
 const w=rndr(9,12), d=rndr(8,10), h=2.7;
 const cos=Math.cos(ry),sin=Math.sin(ry);
 const L=(lx,lz)=>[x+lx*cos+lz*sin, z-lx*sin+lz*cos];
 bs.get("solid").add(tpl("box"),M4(x,y,z,w,h,d,ry),linCol(rndPick([0xe6dccb,0xd8cbb2,0xc9d2c8,0xe2d4bd]),0.04));
 bs.get("corr").add(tpl("hiproof"),M4(x,y+h,z,w+4,1.6,d+4,ry+Math.PI/2),linCol(rndPick([0xb7b9b4,0xa9aba6,0x8d3b2a,0x55635a]),0.05),4);
 for(const lx of [-w/2-1.8,w/2+1.8]) for(const lz of [-d/2-1.8,d/2+1.8]){ const [px,pz]=L(lx,lz);
  bs.get("solid").add(tpl("box"),M4(px,y,pz,0.12,h,0.12,ry),linCol(0xe8e6e0)); }
 for(const lx of [-w*0.28,w*0.28]){ const [wx,wz]=L(lx,-d/2-0.05);
  bs.get("glass").add(tpl("box"),M4(wx,y+0.9,wz,1.4,1.2,0.08,ry),linCol(0x2c363a)); }
 const [tx,tz]=L(w/2+4,d/2-1); PR.tank(bs,tx,y,tz,1);
 const [yx,yz]=L(0,-d/2-6); bs.get("solid").add(tpl("box"),M4(yx,y-0.12,yz,w+8,0.14,10,ry),linCol(0x9a7a55,0.15));
 if(rnd()<0.5){ const [cx,cz]=L(-w/2-4,-2); PR.car(bs,cx,y,cz,ry,true); }
},
tank(bs,x,y,z,sc=1){ // 波板の雨水タンク
 const r=rndr(1.2,1.9)*sc, h=rndr(1.8,2.6)*sc;
 bs.get("corr").add(tpl("cyl12"),M4(x,y,z,r,h,r),linCol(rndPick([0xc4c7c6,0x6f7d6e,0xd8d4c4]),0.04),3);
 bs.get("solid").add(tpl("cone7"),M4(x,y+h,z,r*1.02,0.25,r*1.02),linCol(0xb0b3b1));
},
windmill(bs,x,y,z){ // サザンクロス型風車
 const H=11;
 for(const [dx,dz] of [[-1,-1],[1,-1],[1,1],[-1,1]])
  bs.get("solid").add(tpl("cyl5"),M4(x+dx*0.9,y,z+dz*0.9,0.05,H,0.05,0,-dz*0.08,dx*0.08),linCol(0x8e9093));
 for(let k=1;k<5;k++){ const yy=y+k*H/5, w=1.8*(1-k/6);
  bs.get("solid").add(tpl("boxC"),M4(x,yy,z-w/2,w*2,0.05,0.05),linCol(0x8e9093));
  bs.get("solid").add(tpl("boxC"),M4(x,yy,z+w/2,w*2,0.05,0.05),linCol(0x8e9093)); }
 const ry=rnd()*6.28, hx=x, hy=y+H+0.4, hz=z;
 const sx=Math.cos(ry), sz=-Math.sin(ry);
 for(let i=0;i<16;i++){ const a=i/16*6.28;
  bs.get("solidDS").add(tpl("plane"),M4(hx+sx*Math.sin(a)*0.95,hy+Math.cos(a)*0.95,hz+sz*Math.sin(a)*0.95,0.32,1.3,1,ry,0,-a),linCol(0xc9cbcc)); }
 bs.get("solidDS").add(tpl("plane"),M4(hx-Math.sin(ry)*2.2,hy,hz-Math.cos(ry)*2.2,3.2,1.2,1,ry+Math.PI/2),linCol(0xb52020));
},
// 商店街 (歩道上に張り出したポスト付きベランダ=豪州の典型的メインストリート)
shopStrip(bs,x,y,z,ry,n=3){
 const cos=Math.cos(ry),sin=Math.sin(ry);
 const L=(lx,lz)=>[x+lx*cos+lz*sin, z-lx*sin+lz*cos];
 const bw=rndr(7,10), d=rndr(12,18);
 const total=bw*n;
 for(let i=0;i<n;i++){
  const lx=-total/2+bw*(i+0.5); const [bx,bz]=L(lx,0);
  const two=rnd()<0.35, h=two?7.2:rndr(4.2,5.2);
  bs.get("solid").add(tpl("box"),M4(bx,y,bz,bw,h,d,ry),linCol(rndPick([0xe9e1cf,0xd6c7a8,0xc7b08b,0xf0ece2,0xb7a589,0xcfd3cf]),0.04));
  // 前面ファサード(ガラス+看板帯)
  const [fx,fz]=L(lx,-d/2-0.04);
  bs.get("shop").add(boxMetric(bw-0.2,4,0.06,8,4),M4(fx,y,fz,1,1,1,ry),linCol(0xffffff));
  // パラペット(看板)
  bs.get("solid").add(tpl("box"),M4(fx-sin*0.02,y+h-0.2,fz-cos*0.02,bw,1.0,0.25,ry),linCol(rndPick([0xc0392b,0x1f5f9b,0xe5b324,0x2e7d4f,0xf0f0f0,0x333333])));
  if(two){ for(const k of [-0.25,0.25]){ const [wx,wz]=L(lx+k*bw,-d/2-0.06);
   bs.get("glass").add(tpl("box"),M4(wx,y+4.7,wz,1.4,1.6,0.06,ry),linCol(0x2b3740)); } }
 }
 // ベランダ屋根と柱 (歩道上)
 const [vx,vz]=L(0,-d/2-1.6);
 bs.get("corr").add(tpl("box"),M4(vx,y+3.15,vz,total,0.1,3.2,ry,0.05,0),linCol(rndPick([0xd9d6c8,0x9aa39b,0x8d3b2a]),0.04));
 for(let k=0;k<=n*2;k++){ const [px,pz]=L(-total/2+k*total/(n*2),-d/2-3.0);
  bs.get("solid").add(tpl("box"),M4(px,y,pz,0.12,3.1,0.12,ry),linCol(0x2e3a35)); }
},
tower(bs,x,y,z,ry,style){ // CBDの高層ビル
 const w=rndr(16,30), d=rndr(14,24), h=rndr(28,95);
 const isResi=style==="resi";
 bs.get(isResi?"resi":"office").add(boxMetric(w,h,d,6,isResi?6.4:7),M4(x,y,z,1,1,1,ry),linCol(isResi?0xffffff:rndPick([0xffffff,0xe0ecf2,0xf2ece0]),0.03));
 bs.get("solid").add(tpl("box"),M4(x,y+h,z,w*0.6,rndr(1.5,4),d*0.6,ry),linCol(0xbfc3c5));
 bs.get("solid").add(tpl("box"),M4(x,y,z,w+1.2,4.2,d+1.2,ry),linCol(0x8d9599));
},
shed(bs,x,y,z,ry){ // 工業団地の倉庫
 const w=rndr(18,34), d=rndr(20,40), h=rndr(5.5,8);
 const wc=rndPick([0xd9d6c8,0x9aa39b,0xb7b9b4,0x6f7d6e,0xe4e2d5]);
 bs.get("corr").add(boxMetric(w,h,d,1,1),M4(x,y,z,1,1,1,ry),linCol(wc,0.04));
 bs.get("corr").add(tpl("gable"),M4(x,y+h,z,d+0.6,rndr(1.2,2.0),w+0.6,ry+Math.PI/2),linCol(0xc4c7c6,0.04),6);
 const cos=Math.cos(ry),sin=Math.sin(ry);
 bs.get("solid").add(tpl("box"),M4(x-sin*(d/2+0.05),y,z-cos*(d/2+0.05),5,4.6,0.1,ry),linCol(0x55595c));
 bs.get("solid").add(tpl("box"),M4(x-sin*(d/2+0.08),y+h-1.6,z-cos*(d/2+0.08),w*0.5,1.1,0.1,ry),linCol(rndPick([0x1f5f9b,0xc0392b,0xf0f0f0])));
},
roadhouse(bs,x,y,z,ry){ // ロードハウス: 給油キャノピー+店舗+タンク
 const cos=Math.cos(ry),sin=Math.sin(ry);
 const L=(lx,lz)=>[x+lx*cos+lz*sin, z-lx*sin+lz*cos];
 const [cx,cz]=L(0,-6);
 bs.get("solid").add(tpl("box"),M4(cx,y+4.6,cz,16,0.6,9,ry),linCol(0xe9e6df));
 bs.get("solid").add(tpl("box"),M4(cx,y+4.6,cz,16.1,0.25,9.1,ry),linCol(0xc0392b));
 for(const lx of [-5,0,5]){ const [px,pz]=L(lx,-6);
  bs.get("solid").add(tpl("box"),M4(px,y,pz,0.4,4.6,0.4,ry),linCol(0xe0e0e0));
  bs.get("solid").add(tpl("box"),M4(px,y,pz,0.9,1.6,0.5,ry),linCol(0x2e5f9e)); }
 const [sx,sz]=L(0,8);
 bs.get("solid").add(tpl("box"),M4(sx,y,sz,20,4.2,11,ry),linCol(0xd9cdb2,0.05));
 const [vx,vz]=L(0,1.6); bs.get("corr").add(tpl("box"),M4(vx,y+3.4,vz,20,0.12,3.4,ry,0.08,0),linCol(0xb7b9b4));
 const [fx,fz]=L(0,2.45); bs.get("shop").add(boxMetric(14,4,0.06,8,4),M4(fx,y,fz,1,1,1,ry),linCol(0xffffff));
 for(let i=0;i<2;i++){ const [cx,cz]=L(-14-i*4,4); PR.car(bs,cx,y,cz,ry,i===0); }
 const [tx,tz]=L(13,10); PR.tank(bs,tx,y,tz,1.3);
 const [t2x,t2z]=L(16,6); PR.tank(bs,t2x,y,t2z,1.1);
 const [ax,az]=L(-4,-6); bs.get("solid").add(tpl("box"),M4(ax,y-0.1,az,30,0.12,26,ry),linCol(0x7d6a58,0.1));
},
car(bs,x,y,z,ry,ute=false){ // 長さ方向=ローカルz
 const col=linCol(rndPick([0xf2f2f2,0xd8d8d8,0x2b2b2b,0x8a1d1d,0x1f3f7a,0x9a9a9a,0x5b6e5a,0xc9b48a]),0.05);
 const sin=Math.sin(ry),cos=Math.cos(ry);
 const at=(lz)=>[x+lz*sin, z+lz*cos];
 bs.get("solid").add(tpl("box"),M4(x,y+0.3,z,1.8,0.75,4.6,ry),col);
 const [cx,cz]=at(ute?-0.9:0.2);
 bs.get("solid").add(tpl("box"),M4(cx,y+1.05,cz,1.6,0.6,ute?1.8:2.5,ry),col);
 bs.get("glass").add(tpl("box"),M4(cx,y+1.08,cz,1.66,0.48,ute?1.5:2.3,ry),linCol(0x1c252c));
 for(const [lx,lz] of [[-0.85,1.4],[0.85,1.4],[-0.85,-1.4],[0.85,-1.4]])
  bs.get("solid").add(tpl("cyl8"),M4(x+lx*cos+lz*sin,y+0.34,z-lx*sin+lz*cos,0.34,0.22,0.34,ry,0,Math.PI/2),linCol(0x161616));
},
/* ---------- 道路付属物 ---------- */
guidePost(bs,x,y,z,ry,left){ // 白いガイドポスト: 左側=赤反射板 / 右側=白反射板
 bs.get("solid").add(tpl("box"),M4(x,y,z,0.12,1.0,0.07,ry),linCol(0xf2f2ee));
 bs.get("solid").add(tpl("box"),M4(x,y+0.78,z,0.125,0.16,0.075,ry),linCol(left?0xd11a1a:0xf6f6f6));
 bs.get("solid").add(tpl("box"),M4(x,y+0.86,z,0.125,0.03,0.075,ry),linCol(0x1a1a1a));
},
fencePost(bs,x,y,z,ry){ bs.get("solid").add(tpl("box"),M4(x,y,z,0.06,1.25,0.06,ry),linCol(0x5a4a3a,0.15)); },
stobie(bs,x,y,z,ry){ // アデレード名物のストビーポール(鋼+コンクリート)
 bs.get("solid").add(tpl("trunk"),M4(x,y,z,0.22,10,0.14,ry),linCol(0x9d9b95,0.04));
 bs.get("solid").add(tpl("boxC"),M4(x,y+9.4,z,2.4,0.12,0.12,ry+Math.PI/2),linCol(0x6b6b6b));
 return y+9.5;
},
woodPole(bs,x,y,z,ry){
 bs.get("bark").add(tpl("cyl5"),M4(x,y,z,0.13,9.5,0.13,ry),linCol(0x5d4a38,0.1));
 bs.get("solid").add(tpl("boxC"),M4(x,y+9.0,z,2.0,0.12,0.12,ry+Math.PI/2),linCol(0x5d4a38));
 return y+9.1;
},
streetLight(bs,x,y,z,dx,dz){ // (dx,dz)=道路方向の単位ベクトル
 bs.get("solid").add(tpl("cyl5"),M4(x,y,z,0.09,9,0.09),linCol(0x8a8d90));
 const ry=Math.atan2(dx,dz);
 bs.get("solid").add(tpl("boxC"),M4(x+dx*1.1,y+9,z+dz*1.1,0.08,0.08,2.2,ry),linCol(0x8a8d90));
 bs.get("solid").add(tpl("boxC"),M4(x+dx*2.2,y+8.9,z+dz*2.2,0.35,0.15,0.8,ry),linCol(0x5a5d60));
},
};
