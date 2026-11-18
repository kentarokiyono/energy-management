"use strict";
/* ============ 車内の構造 (和大型モノハル): チームの写真と聞き取りから ============
 ・前: 前輪ごとのカーボンの箱 (内側の壁・前後の壁・上の板)、ステアリングラックとタイロッド (舵角に合わせて動く)、ステアリングシャフト
 ・上面の板: 運転席の左右と後ろの、ロアカウルの上面に沿ったカーボンの板。軽くするための三角の穴 (左右は交互の三角、後ろは X 字)
 ・後部: 縦に立てた細長い板 2 枚を前後に通し、後ろのサス受けの所にロアカウルの断面に沿った仕切り板 1 枚。
   運転席のすぐ後ろ、2 枚の板の間に 20 kg のバッテリー (位置は Tire の重心の計算と同じ値)
 ・ロールバー: 運転席の後ろの黒い覆い (キャノピーと一体になる)
 寸法はおおよそ (写真からの見積もり)。車体の座標: x 右・y 上・z 後ろ、地面 y = 0。
 車体を透かす表示 (T キー) でも透けない (userData.noXray)。運転席からは開口越しに見える */
const ChassisMesh={
 /* 形の値 (車体の諸元の profiles): u (0 先端〜1 後端) の折れ線 */
 lin(P,u,d){ if(!P||!P.length) return d; if(u<=P[0][0]) return P[0][1]; for(let i=1;i<P.length;i++) if(u<=P[i][0]){ const [a,va]=P[i-1], [b,vb]=P[i]; return va+(vb-va)*(u-a)/(b-a||1); } return P[P.length-1][1]; },
 build(V,body,SB,E0,carbon){
  if(typeof THREE==="undefined"||!SB||!SB.profiles) return null;
  const L=SB.L||5.76, HL=L/2, PF=SB.profiles, uOf=z=>clamp((z+HL)/L,0,1);
  const hw=z=>this.lin(PF.hullW,uOf(z),.5), top=z=>this.lin(PF.zHull,uOf(z),.62), bot=z=>this.lin(PF.zBell,uOf(z),.16);
  /* 胴体の断面の半幅 (高さ y の所): yata.js と同じ形 (諸元の sectionBottom があれば台形、無ければ丸い形) */
  const BF=SB.sectionBottom, secX=(z,y)=>{ const t=clamp((y-bot(z))/Math.max(.01,top(z)-bot(z)),0,1); return hw(z)*(BF!=null? BF+(1-BF)*t : Math.pow(Math.sin(t*Math.PI/2),.85)); };
  /* 断面に沿った板 (z の位置、x の範囲 [xa, 外側の縁]、高さ [ya, yb])。外側の縁は胴体の内側に d だけ入れる */
  const secPlate=(z,xa,sg,ya,yb,d,m)=>{ const N=6, pts=[[xa,ya]]; for(let i=0;i<=N;i++){ const y=ya+(yb-ya)*i/N; pts.push([sg*Math.max(Math.abs(xa)+.01,secX(z,y)-d),y]); } pts.push([xa,yb]);
   const geo=new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x,y])=>new THREE.Vector2(x,y))),{depth:.01,bevelEnabled:false}); const o=add(new THREE.Mesh(geo,m)); o.position.z=z-.005; return o; };
  const g=new THREE.Group(); g.name="chassis";
  const M=(c,o)=>new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:.5,metalness:.1},o||{}));
  const alu=M(0xb9bec4,{metalness:.8,roughness:.3}), blk=M(0x111316,{roughness:.6}), orange=M(0xf28c28,{roughness:.5}), cable=M(0xb3261e,{roughness:.6});
  const add=(m)=>{ m.userData.noXray=true; g.add(m); return m; };
  const box=(w,h,d,m,x,y,z)=>{ const b=add(new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m)); b.position.set(x,y,z); return b; };
  const W=(SB.wheels||[]).map(([x,z,r,w])=>({x,z,r,w:w||.1})), FW=W.filter(w=>w.z<0), RW=W.filter(w=>w.z>=0);
  const O=V.cockOpening||{w:.22,z0:E0[2]-1.1,z1:E0[2]+.45};
  /* 縦に立てた板 (x の位置、(z, y) の形と穴) */
  const vplate=(x,outline,holes,m)=>{ const sh=new THREE.Shape(outline.map(([z,y])=>new THREE.Vector2(z,y))); for(const h of holes||[]) sh.holes.push(new THREE.Path(h.map(([z,y])=>new THREE.Vector2(z,y))));
   const geo=new THREE.ExtrudeGeometry(sh,{depth:.012,bevelEnabled:false}); geo.rotateY(-Math.PI/2); const o=add(new THREE.Mesh(geo,m||carbon)); o.position.x=x+.006; return o; };
  // ---- 前: 足回りボックス (足を入れる箱。前の足回りの取り付け、中にブレーキペダル)。前が低く後ろが 1 段高い (中は前の端まで抜けて足を伸ばす)。
  //  上のアームは天板、下のアームは床の板に付く (どちらも中心寄り)。左右の壁の下の穴をロアアームが通る (ドライバーの足元をロアアームが通る)。
  //  サスの上端は天板の外側の角。ステアリングは天板の上を左右に横切る ----
  const SP=typeof Susp!=="undefined"? Susp.params() : null, fg=SP&&SP.wh.find(q=>q.geo.kind==="wishbone");
  let fbx=.24, liY=.16, uiY=.32, yHi=.3, pedal=null, fbox=null;
  if(FW.length===2){ if(fg){ liY=fg.geo.li.z; uiY=fg.geo.ui.z; } fbx=Math.max(.16,Math.abs(FW[0].x)-.18);
   const zw=FW[0].z, zf=zw-.42, zm=zw-.06, zr=zw+.36, yb=bot(zw)+.02; yHi=Math.min(top(zw)-.04,uiY-.02); const yLo=Math.max(yb+.12,yHi-.08);
   for(const sg of [-1,1]){   // 左右の壁 (三角の穴、下にロアアームの穴)
    const ol=[[zf,yb],[zr,yb],[zr,yHi],[zm,yHi],[zm,yLo],[zf,yLo]];
    const hl=[[[zw-.08,liY-.03],[zw+.08,liY-.03],[zw+.08,liY+.03],[zw-.08,liY+.03]],   // ロアアームの穴
     [[zf+.06,yb+.03],[zm-.06,yb+.03],[(zf+zm)/2,yLo-.03]]];
    vplate(sg*fbx,ol,hl); }
   box(fbx*2,.012,zm-zf,carbon,0,yLo,(zf+zm)/2); box(fbx*2,.012,zr-zm,carbon,0,yHi,(zm+zr)/2);   // 天板 (2 段。後ろの段に上のアーム)
   box(fbx*2,.008,zr-zf,carbon,0,yb,(zf+zr)/2);                                                    // 床の板 (下のアーム)
   box(fbx*2,yLo-yb,.012,carbon,0,(yLo+yb)/2,zf); box(fbx*2,yHi-yLo,.012,carbon,0,(yHi+yLo)/2,zm);   // 前の壁 (中は後ろへ抜けている)
   // ブレーキペダル (床から立つ腕と踏む板) とマスターシリンダー (前へ)
   pedal=new THREE.Group(); pedal.position.set(0,yb+.02,zf+.16); add(pedal);
   const arm=new THREE.Mesh(new THREE.BoxGeometry(.025,.16,.02),alu); arm.position.set(0,.08,0); pedal.add(arm); arm.userData.noXray=true;
   const pad=new THREE.Mesh(new THREE.BoxGeometry(.08,.05,.012),blk); pad.position.set(0,.155,.008); pedal.add(pad); pad.userData.noXray=true;
   const mc=add(new THREE.Mesh(new THREE.CylinderGeometry(.014,.014,.12,10),alu)); mc.rotation.x=Math.PI/2; mc.position.set(0,yb+.09,zf+.08);
   fbox={fbx,yTop:yHi,z:zw}; }
  // ---- ステアリングラック・タイロッド・シャフト ----
  let steer=null;
  if(FW.length===2){ const zR=FW[0].z+.02, yR=yHi+.05, xr=fbx-.02;   // 天板の上を左右に横切る
   const rack=add(new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,xr*2,12),alu)); rack.rotation.z=Math.PI/2; rack.position.set(0,yR,zR);
   const rod=()=>{ const gg=new THREE.CylinderGeometry(.007,.007,1,8); gg.translate(0,.5,0); return add(new THREE.Mesh(gg,alu)); };
   steer={rack,yR,zR,xr,ties:FW.map(w=>({w,m:rod()})),col:rod()};
   const yp=V.yokePivot; if(yp) this.link(steer.col,new THREE.Vector3(yp.position.x,yp.position.y-.02,yp.position.z+.02),new THREE.Vector3(0,yR+.02,zR)); }
  // ---- 運転席の左右 (左右対称): 箱 (内側の壁・前の壁) と、ドライバーの横だけ X 字の穴の天板 ----
  const zMid=O.z1+.02, yP=Math.min(top(O.z0),top(zMid))-.012;
  const plate=(outline,holes,y)=>{ const sh=new THREE.Shape(outline.map(([x,z])=>new THREE.Vector2(x,z))); for(const h of holes) sh.holes.push(new THREE.Path(h.map(([x,z])=>new THREE.Vector2(x,z))));
   const geo=new THREE.ExtrudeGeometry(sh,{depth:.012,bevelEnabled:false}); geo.rotateX(Math.PI/2); const m=add(new THREE.Mesh(geo,carbon)); m.position.y=y; return m; };   // (x, z) の形を水平に寝かせる
  const sz0=FW.length===2? FW[0].z+.36 : O.z0+.2, sz1=zMid;   // 足を入れる箱の後ろの端から (ドライバーの横だけ)
  for(const sg of [-1,1]){
   const N=12, xs=z=>sg*(hw(z)-.03), xi=sg*(O.w+.01), out=[]; for(let i=0;i<=N;i++){ const z=sz0+(sz1-sz0)*i/N; out.push([xs(z),z]); } out.push([xi,sz1],[xi,sz0]);
   const holes=[], cell=.3, n=Math.floor((sz1-sz0-.06)/cell);
   for(let k=0;k<n;k++){ const a=sz0+.05+k*cell, b=a+cell-.06, xin=xi+sg*.05, xout=sg*(Math.min(hw(a),hw(b))-.09), w=Math.abs(xout-xin); if(w<.1) continue;
    { const cx=(xin+xout)/2, cz=(a+b)/2, hx=w/2-.01, hz=(b-a)/2, gp=.025;   // 右: X 字 (三角 4 つ)
     holes.push([[cx-hx,cz-hz],[cx+hx,cz-hz],[cx,cz-gp]],[[cx+hx,cz-hz+gp],[cx+hx,cz+hz-gp],[cx+gp,cz]],[[cx+hx,cz+hz],[cx-hx,cz+hz],[cx,cz+gp]],[[cx-hx,cz+hz-gp],[cx-hx,cz-hz+gp],[cx-gp,cz]]); } }
   plate(sg<0? out : out.slice().reverse(),holes,yP);
   const yb=bot((sz0+sz1)/2)+.03;   // 箱の内側の壁 (開口の縁の下) と前の壁 (胴体の断面に沿って)
   vplate(xi,[[sz0,yb],[sz1,yb],[sz1,yP-.012],[sz0,yP-.012]],[[[sz0+.08,yb+.08],[sz0+.3,yb+.08],[sz0+.08,yP-.1]]]);
   secPlate(sz0,xi,sg,yb,yP-.012,.03,carbon); }
  // ---- 後部: 縦の細長い板 2 枚 (平行、上の縁は後ろへ高く、三角の穴)・後輪のすぐ前の仕切り板 (後ろの足回りの取り付け) ----
  const bat=Tire.battery(), bw=.40, bh=.22, bd=.30, bx=.012;
  const zr0=RW.length? RW[0].z : 1.34, swL=typeof Susp!=="undefined"? Susp.val("swingL") : .3, zs=zr0-swL;   // 仕切り板 = 後ろのアームの車体側の軸の位置
  const pz0=bat.z-bd/2-.02, pz1=zs;
  for(const sg of [-1,1]){ const x=sg*(bw/2+bx/2+.005), N=10, up=[], dn=[];
   const ry0=Math.max(bot(pz0),bot(pz1))+.03, ry1=Math.min(top(pz0),top(pz1))-.06; for(let i=0;i<=N;i++){ const z=pz0+(pz1-pz0)*i/N; dn.push([z,ry0]); up.push([z,ry1]); }   // 長方形
   const holes=[], n=Math.max(1,Math.floor((pz1-pz0-.1)/.26));
   for(let k=0;k<n;k++){ const a=pz0+.06+k*(pz1-pz0-.1)/n, b=a+(pz1-pz0-.1)/n-.05, yb=ry0+.05, yt=Math.min(ry1-.05,yb+.18); holes.push(k%2? [[a,yb],[b,yb],[(a+b)/2,yt]] : [[a,yt],[b,yt],[(a+b)/2,yb]]); }
   vplate(x,[...dn,...up.reverse()],holes); }
  { const yb=bot(zs)+.01, yt=top(zs)-.01, N=8, R=[], Lf=[];
   for(let i=0;i<=N;i++){ const y=yb+(yt-yb)*i/N, x=secX(zs,y)-.02; R.push([x,y]); Lf.unshift([-x,y]); }   // ロアカウルの断面に沿って立つ
   const sh=new THREE.Shape([...R,...Lf].map(([x,y])=>new THREE.Vector2(x,y)));
   const geo=new THREE.ExtrudeGeometry(sh,{depth:.012,bevelEnabled:false}); const m=add(new THREE.Mesh(geo,carbon)); m.position.z=zs-.012; m.name="bulkhead"; this.bulkZ=zs; }
  // ---- バッテリー (20 kg): 運転席のすぐ後ろ、2 枚の板の間 ----
  { const yb=bot(bat.z)+.03, b=box(bw,bh,bd,blk,0,yb+bh/2,bat.z); b.name="battery";
   box(bw+.004,.02,bd+.004,orange,0,yb+bh-.02,bat.z);   // 上の縁の色帯
   for(const sx of [-.1,.1]){ const c=add(new THREE.Mesh(new THREE.CylinderGeometry(.01,.01,.22,8),sx<0? cable : blk)); c.position.set(sx,yb+bh+.02,bat.z-.04); c.rotation.x=Math.PI/2.4; } }
  // ---- ロールバー (運転席の後ろの黒い覆い。キャノピーと一体になる) ----
  { const cz1= SB.canopy? SB.canopy.x+SB.canopy.len*.52-HL : E0[2]+.6;   // キャノピーの後端 (この中に収める)
   const z0=E0[2]+.14, z1=Math.max(z0+.2,cz1-.2), yb=top(z0)-.01, yt=Math.min(E0[1]+.03,(SB.canopy&&SB.canopy.top||1.08)-.17), w=Math.min(.3,(SB.canopy&&SB.canopy.w||.36)*.5);   // キャノピーの幅・高さの内側
   const sh=new THREE.Shape([[z0,yb],[z1,yb],[z1-.04,yb+.05],[z0+.14,yt],[z0+.02,yt-.03]].map(([z,y])=>new THREE.Vector2(z,y)));   // 前は頭の後ろで高く、後ろへ低く (キャノピーの形に沿う)
   const geo=new THREE.ExtrudeGeometry(sh,{depth:w,bevelEnabled:true,bevelThickness:.02,bevelSize:.02,bevelSegments:3}); geo.rotateY(-Math.PI/2); geo.translate(w/2,0,0);
   const m=add(new THREE.Mesh(geo,M(0x0b0c0e,{roughness:.35,metalness:.2}))); m.name="rollbar"; }
  body.add(g); return {g,steer,pedal,fbox};
 },
 _v:null, _up:null,
 link(o,a,b){ const v=this._v||(this._v=new THREE.Vector3()), up=this._up||(this._up=new THREE.Vector3(0,1,0)); v.subVectors(b,a); const L=v.length()||1e-4;
  o.position.copy(a); o.quaternion.setFromUnitVectors(up,v.multiplyScalar(1/L)); o.scale.set(1,L,1); },
 /* 毎フレーム: ラックを舵角に合わせて左右へ、タイロッドを車輪のナックルアームの先へ */
 sync(car){ const C=car&&car.userData.chassis, S=C&&C.steer, W=car&&car.userData.wheels;
  if(C&&C.pedal){ const es=typeof Engine!=="undefined"&&Engine.st; C.pedal.rotation.x=-0.35*clamp(es? es.brakePhys||0 : 0,0,1); }   // ブレーキペダル (踏むと前へ倒れる)
  if(!S||!W) return;
  const fr=W.filter(w=>w.front); if(fr.length<2) return;
  const ry=fr.reduce((a,w)=>a+(w.g.rotation.y||0),0)/fr.length; S.rack.position.x=-ry*.06;   // 舵角 0.1 rad でラックが 6 mm
  for(const t of S.ties){ const w=fr.reduce((b,q)=>Math.abs(q.g.position.x-t.w.x)<Math.abs(b.g.position.x-t.w.x)? q : b,fr[0]), sg=Math.sign(t.w.x)||1, a=w.g.rotation.y||0, arm=.11;
   const kx=w.g.position.x-sg*.06+Math.sin(a)*arm, kz=w.g.position.z+Math.cos(a)*arm;   // ナックルアームの先 (車輪の中心から内側・後ろ)
   this.link(t.m,new THREE.Vector3(S.rack.position.x+sg*S.xr,S.yR,S.zR),new THREE.Vector3(kx,S.yR,kz)); } },
};
