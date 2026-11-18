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
  // ---- 前輪の箱 (内側の壁・前後の壁・上の板) ----
  for(const w of FW){ const sg=Math.sign(w.x)||1, xi=w.x-sg*(w.w/2+.07), z0=w.z-w.r-.08, z1=w.z+w.r+.08, yT=Math.min(top(w.z)-.03,w.r*2+.08), yB=bot(w.z)+.02, xo=sg*(secX(w.z,yT)-.03);
   box(.01,yT-yB,z1-z0,carbon,xi,(yT+yB)/2,(z0+z1)/2);
   for(const zz of [z0,z1]) secPlate(zz,xi,sg,yB,yT,.03,carbon);   // 前後の壁は胴体の断面に沿って (下ほど細い)
   box(Math.abs(xo-xi),.01,z1-z0,carbon,(xi+xo)/2,yT,(z0+z1)/2); }
  // ---- ステアリングラック・タイロッド・シャフト ----
  let steer=null;
  if(FW.length===2){ const zR=FW[0].z+.11, yR=FW[0].r+.12, xr=Math.abs(FW[0].x)-.2;
   const rack=add(new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,xr*2,12),alu)); rack.rotation.z=Math.PI/2; rack.position.set(0,yR,zR);
   const rod=()=>{ const gg=new THREE.CylinderGeometry(.007,.007,1,8); gg.translate(0,.5,0); return add(new THREE.Mesh(gg,alu)); };
   steer={rack,yR,zR,xr,ties:FW.map(w=>({w,m:rod()})),col:rod()};
   const yp=V.yokePivot; if(yp) this.link(steer.col,new THREE.Vector3(yp.position.x,yp.position.y-.02,yp.position.z+.02),new THREE.Vector3(0,yR+.02,zR)); }
  // ---- 上面の板 (三角の穴) ----
  const zA=(FW.length? Math.min(...FW.map(w=>w.z-w.r-.08)) : -1.6), zB=(RW.length? RW[0].z-RW[0].r-.05 : 1.0), zMid=O.z1+.02;
  const plate=(outline,holes,y)=>{ const sh=new THREE.Shape(outline.map(([x,z])=>new THREE.Vector2(x,z))); for(const h of holes) sh.holes.push(new THREE.Path(h.map(([x,z])=>new THREE.Vector2(x,z))));
   const geo=new THREE.ExtrudeGeometry(sh,{depth:.012,bevelEnabled:false}); geo.rotateX(Math.PI/2); const m=add(new THREE.Mesh(geo,carbon)); m.position.y=y; return m; };   // (x, z) の形を水平に寝かせる
  const yP=Math.min(top(zA),top(zB),top(0))-.012;
  for(const sg of [-1,1]){   // 左右の板: 開口の縁から胴体の側面まで、前輪の箱の上から後ろの板まで
   const N=12, xs=z=>sg*(hw(z)-.03), xi=sg*(O.w+.01), out=[]; for(let i=0;i<=N;i++){ const z=O.z0+(zMid-O.z0)*i/N; out.push([xs(z),z]); } out.push([xi,zMid],[xi,O.z0]);
   const holes=[], cell=.34, n=Math.floor((zMid-O.z0-.08)/cell);
   for(let k=0;k<n;k++){ const a=O.z0+.05+k*cell, b=a+cell-.05, xin=xi+sg*.05, xout=sg*(Math.min(hw(a),hw(b))-.09); if(Math.abs(xout-xin)<.08) continue;
    holes.push(k%2? [[xin,a],[xout,(a+b)/2],[xin,b]] : [[xout,a],[xin,(a+b)/2],[xout,b]]); }   // 交互の三角 (トラスの形)
   plate(sg<0? out : out.slice().reverse(),holes,yP); }
  { const N=10, out=[], holes=[]; for(let i=0;i<=N;i++){ const z=zMid+(zB-zMid)*i/N; out.push([hw(z)-.03,z]); } for(let i=N;i>=0;i--){ const z=zMid+(zB-zMid)*i/N; out.push([-(hw(z)-.03),z]); }   // 後ろの板 (X 字の穴)
   const c=(zMid+zB)/2, hx=Math.min(hw(zB),hw(zMid))-.12, hz=(zB-zMid)/2-.07, gp=.035;
   if(hx>.1&&hz>.08){ holes.push([[-hx,c-hz],[hx,c-hz],[0,c-gp]],[[hx,c-hz+gp],[hx,c+hz-gp],[gp,c]],[[hx,c+hz],[-hx,c+hz],[0,c+gp]],[[-hx,c+hz-gp],[-hx,c-hz+gp],[-gp,c]]); }
   plate(out,holes,yP); }
  // ---- 後部: 縦の細長い板 2 枚・サス受けの仕切り板 ----
  const bat=Tire.battery(), bw=.40, bh=.22, bd=.30, bx=.012;
  const pz0=bat.z-bd/2-.02, pz1=zB-.02;
  for(const sg of [-1,1]){ const x=sg*(bw/2+bx/2+.005), N=10, up=[], dn=[];
   for(let i=0;i<=N;i++){ const z=pz0+(pz1-pz0)*i/N; up.push([z,top(z)-.04]); dn.push([z,bot(z)+.03]); }
   const sh=new THREE.Shape([...dn,...up.reverse()].map(([z,y])=>new THREE.Vector2(z,y)));
   const geo=new THREE.ExtrudeGeometry(sh,{depth:bx,bevelEnabled:false}); geo.rotateY(-Math.PI/2); const m=add(new THREE.Mesh(geo,carbon)); m.position.x=x+(sg<0? bx/2 : bx/2); }
  { const sw=typeof Susp!=="undefined"? Susp.val("swingL") : .42, zr=RW.length? RW[0].z : 1.34, zs=clamp(zr-sw*.6-.30,pz0+.2,pz1-.1);   // サス受け (後ろのサスの車体側の取り付け) の位置
   const yb=bot(zs)+.01, yt=top(zs)-.01, h=hw(zs)-.02, N=8, R=[], Lf=[];
   for(let i=0;i<=N;i++){ const y=yb+(yt-yb)*i/N, x=secX(zs,y)-.02; R.push([x,y]); Lf.unshift([-x,y]); }   // ロアカウルの断面に沿う
   const sh=new THREE.Shape([...R,...Lf].map(([x,y])=>new THREE.Vector2(x,y)));
   const hole=new THREE.Path(); hole.absellipse(0,(yb+yt)/2,Math.min(.12,h*.3),(yt-yb)*.28,0,Math.PI*2,false); sh.holes.push(hole);   // 配線を通す穴
   const geo=new THREE.ExtrudeGeometry(sh,{depth:.012,bevelEnabled:false}); const m=add(new THREE.Mesh(geo,carbon)); m.position.z=zs; this.bulkZ=zs; }
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
  body.add(g); return {g,steer};
 },
 _v:null, _up:null,
 link(o,a,b){ const v=this._v||(this._v=new THREE.Vector3()), up=this._up||(this._up=new THREE.Vector3(0,1,0)); v.subVectors(b,a); const L=v.length()||1e-4;
  o.position.copy(a); o.quaternion.setFromUnitVectors(up,v.multiplyScalar(1/L)); o.scale.set(1,L,1); },
 /* 毎フレーム: ラックを舵角に合わせて左右へ、タイロッドを車輪のナックルアームの先へ */
 sync(car){ const C=car&&car.userData.chassis, S=C&&C.steer, W=car&&car.userData.wheels; if(!S||!W) return;
  const fr=W.filter(w=>w.front); if(fr.length<2) return;
  const ry=fr.reduce((a,w)=>a+(w.g.rotation.y||0),0)/fr.length; S.rack.position.x=-ry*.06;   // 舵角 0.1 rad でラックが 6 mm
  for(const t of S.ties){ const w=fr.reduce((b,q)=>Math.abs(q.g.position.x-t.w.x)<Math.abs(b.g.position.x-t.w.x)? q : b,fr[0]), sg=Math.sign(t.w.x)||1, a=w.g.rotation.y||0, arm=.11;
   const kx=w.g.position.x-sg*.06+Math.sin(a)*arm, kz=w.g.position.z+Math.cos(a)*arm;   // ナックルアームの先 (車輪の中心から内側・後ろ)
   this.link(t.m,new THREE.Vector3(S.rack.position.x+sg*S.xr,S.yR,S.zR),new THREE.Vector3(kx,S.yR,kz)); } },
};
