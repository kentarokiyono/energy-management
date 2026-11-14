"use strict";
/* ============ 実車の外形 (非公開の形のデータ) で車体を作る ============
 js/data/vehicle-mesh-private.bin (コミットしない。tools/make_vehicle_mesh.py が STL から作る) があれば、
 自分の車 (YATA) の胴体・上面・キャノピーをその形にする。無ければ今まで通りコードで作った形 (js/render/yata.js)。
 部位: lower (下の胴体) / upperPaint (上の板の縁と裏) / deck (上面 = 太陽電池) / canopy。上の 3 つは充電のとき一緒に傾く */
const YataMesh={
 data:null, state:"", URL:"js/data/vehicle-mesh-private.bin",
 /* 起動時に 1 回読む (実車の値がある端末だけ)。読めたら、もう作ってある車を作り直す */
 load(){ if(this.state) return; this.state="loading";
  fetch(this.URL+"?t="+Date.now()).then(r=>{ if(!r.ok) throw new Error("no mesh"); return r.arrayBuffer(); }).then(buf=>{
   const u8=new Uint8Array(buf); if(String.fromCharCode(...u8.subarray(0,5))!=="YMSH1") throw new Error("bad mesh");
   const hl=new DataView(buf).getUint32(5,true), head=JSON.parse(new TextDecoder().decode(u8.subarray(9,9+hl))); let o=9+hl; const G={};
   for(const g of head.groups){ const take=(T,n)=>{ const a=new T(buf.slice(o,o+n*T.BYTES_PER_ELEMENT)); o+=n*T.BYTES_PER_ELEMENT; return a; };
    if(!g.nv){ G[g.name]=null; continue; } G[g.name]={pos:take(Float32Array,g.nv*3),nrm:take(Float32Array,g.nv*3),uv:take(Float32Array,g.nv*2),idx:take(Uint32Array,g.ni)}; }
   this.data={head,G}; this.state="ready";
   if(typeof View!=="undefined"&&View.car&&View.scene&&P.shape==="wadai"){ try{ View.buildCar(); }catch(e){ console.error(e); } }
  }).catch(()=>{ this.state="none"; }); },
 ready(){ return this.state==="ready"&&!!this.data; },
 /* カーボン (2x2 綾織) の材質: 黒に近い濃いグレーにクリアのつや */
 carbon(){ if(this._cb) return this._cb; const cv=document.createElement("canvas"); cv.width=cv.height=128; const c=cv.getContext("2d"); c.fillStyle="#0c0d10"; c.fillRect(0,0,128,128);
  for(let y=0;y<16;y++) for(let x=0;x<16;x++){ const on=((x+y)>>1)%2===0, g=c.createLinearGradient(x*8,y*8,x*8+(on?8:0),y*8+(on?0:8)); g.addColorStop(0,on?"#1b1e23":"#101215"); g.addColorStop(1,on?"#101215":"#1b1e23"); c.fillStyle=g; c.fillRect(x*8,y*8,8,8); }
  const t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.encoding=THREE.sRGBEncoding; t.anisotropy=8;
  return this._cb=new THREE.MeshPhysicalMaterial({color:0xffffff,map:t,roughness:.4,metalness:.2,clearcoat:.8,clearcoatRoughness:.12,side:THREE.DoubleSide,envMapIntensity:.6}); },
 /* 塗り分けの絵 (横 = 鼻先から後端, 縦 = 下端から縁)。頂点の色では大きな三角形で境目が崩れるので、絵にして貼る */
 livTex(){ if(this._liv) return this._liv; const W=2048,H=512, cv=document.createElement("canvas"); cv.width=W; cv.height=H; const c=cv.getContext("2d"), im=c.createImageData(W,H), d=im.data;
  const col={O:[226,86,10],K:[16,18,22],W:[232,234,238]};
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){ const k=col[yataLivery((x+0.5)/W,1-(y+0.5)/H)]||col.W, o=(y*W+x)*4; d[o]=k[0]; d[o+1]=k[1]; d[o+2]=k[2]; d[o+3]=255; }
  c.putImageData(im,0,0); const t=new THREE.CanvasTexture(cv); t.encoding=THREE.sRGBEncoding; t.anisotropy=8; t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping; return this._liv=t; },
 geo(g,colorFn,yOff){ const b=new THREE.BufferGeometry(), pos=Float32Array.from(g.pos); if(yOff) for(let i=1;i<pos.length;i+=3) pos[i]+=yOff; b.setAttribute("position",new THREE.BufferAttribute(pos,3)); b.setAttribute("normal",new THREE.BufferAttribute(g.nrm,3)); b.setAttribute("uv",new THREE.BufferAttribute(g.uv,2)); b.setIndex(new THREE.BufferAttribute(g.idx,1));
  if(colorFn){ const n=g.pos.length/3, col=new Float32Array(n*3); for(let i=0;i<n;i++){ const c=colorFn(g.uv[i*2],g.uv[i*2+1]); col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b; } b.setAttribute("color",new THREE.BufferAttribute(col,3)); }
  return b; },
 /* Y: コードで作った車 (開口・傾ける軸・影の板をもらう)。M: 材質 {paint(c), array, glass} */
 build(Y,M){ const {head,G}=this.data, grp=new THREE.Group(), tilt=Y.tilt;
  // 高さ: 車輪カバーの下端が路面から 7 cm (車輪がほぼ隠れる)。傾ける軸はパネルの縁
  const yMin=this._yMin!=null? this._yMin : (this._yMin=G.lower.pos.reduce((m,v,i)=>i%3===1&&v<m? v : m,9)), yOff=0.07-yMin;
  const paint=M.paint(0xffffff); paint.map=this.livTex(); paint.side=THREE.FrontSide;
  const mk=(g,mat)=>{ const m=new THREE.Mesh(this.geo(g,null,yOff),mat); m.castShadow=true; return m; };
  if(G.lower) grp.add(mk(G.lower,paint));
  // アッパーカウル (上の板・上面・キャノピー): 傾ける軸の入れ物に入れる (中身は元の座標のまま)
  const pivot=new THREE.Group(), upper=new THREE.Group(), pv=new THREE.Vector3(tilt.position.x,head.rimWide+yOff,0); pivot.position.copy(pv); upper.position.copy(pv).multiplyScalar(-1); pivot.add(upper); grp.add(pivot);
  const paintU=paint.clone(); paintU.side=THREE.DoubleSide;
  if(G.upperPaint){ // 上の板: 上向きの縁は塗装、裏 (下向きの面) はカーボン
   const g=G.upperPaint, I=g.idx, N=g.nrm, top=[], bot=[];
   for(let t=0;t<I.length;t+=3){ const ny=(N[I[t]*3+1]+N[I[t+1]*3+1]+N[I[t+2]*3+1])/3; (ny<-0.3?bot:top).push(I[t],I[t+1],I[t+2]); }
   if(top.length){ const m=mk({...g,idx:Uint32Array.from(top)},paintU); m.userData.upper=true; upper.add(m); }
   if(bot.length){ const uv=new Float32Array(g.uv.length); for(let i=0;i<g.pos.length/3;i++){ uv[i*2]=g.pos[i*3+2]*1.6; uv[i*2+1]=g.pos[i*3]*1.6; }   // カーボンの織り目は平面に貼る
    const m=mk({...g,uv,idx:Uint32Array.from(bot)},this.carbon()); m.userData.upper=true; upper.add(m); } }
  if(G.deck){ const m=mk(G.deck,M.array); m.userData.upper=true; m.receiveShadow=true; upper.add(m); }
  let canopy=null;
  if(G.canopy){ const g=this.geo(G.canopy,null,yOff); g.addGroup(0,G.canopy.idx.length,0); canopy=new THREE.Mesh(g,[M.glass]); canopy.castShadow=true; canopy.userData.upper=true; upper.add(canopy); }
  // 影: 細かい形の代わりに軽い形で作る (影を描く手間を減らす)。軽い形は画面に色も奥行きも書かない
  if(G.shadowLower){ for(const o of grp.children.concat(upper.children)) if(o.isMesh) o.castShadow=false;
   const sm=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:false}), sh=(g,parent)=>{ const m=new THREE.Mesh(this.geo(g,null,yOff),sm); m.castShadow=true; m.renderOrder=-5; parent.add(m); };
   sh(G.shadowLower,grp); if(G.shadowUpper) sh(G.shadowUpper,upper); }
  // 接地の影 (コードで作った車のものをもらう)
  const sh=Y.group.children.find(o=>o.isMesh&&o.geometry&&o.geometry.type==="PlaneGeometry"&&o.material&&o.material.transparent&&o.rotation.x!==0); if(sh){ Y.group.remove(sh); grp.add(sh); }
  return {group:grp,canopy,opening:Y.opening,tilt:pivot,mesh:true,hull:grp.children.filter(o=>o.isMesh&&o.material===paint)}; },
 /* 側面の灯火など (コードの車体の位置に置いてある小さな部品) を、この車体の表面に付け直す */
 snap(body,hull){ const rc=new THREE.Raycaster(); body.updateMatrixWorld(true);
  for(const o of body.children){ if(!o.isMesh||!o.geometry||o.geometry.type!=="BoxGeometry"||Math.abs(o.position.x)<0.25) continue; const sx=Math.sign(o.position.x);
   rc.set(new THREE.Vector3(sx*2,o.position.y,o.position.z),new THREE.Vector3(-sx,0,0)); const h=rc.intersectObjects(hull,false)[0];
   if(!h){ o.visible=false; continue; }
   // 車体の面に沿わせる (面の向きに灯火の厚みの向きを合わせ、少しだけ外へ)
   const n=h.face.normal.clone().transformDirection(h.object.matrixWorld), inv=new THREE.Matrix4().copy(body.matrixWorld).invert(), nl=n.transformDirection(inv).normalize();
   const p=body.worldToLocal(h.point.clone()).addScaledVector(nl,0.006); o.position.copy(p); o.quaternion.setFromUnitVectors(new THREE.Vector3(sx,0,0),nl); } },
};
