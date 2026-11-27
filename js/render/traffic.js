"use strict";
/* ============ 一般車両 (乗用車・ピックアップ・4WD・キャンピングカー・後ろから来るロードトレイン) ============
 レースモードの道の上だけで動く見た目の車 (位置は道に沿った距離 s [m] と横の位置 lat [m, 左が負])。
 ・後ろから来て追い越す: 自車の隊列 (後方車・自車・前方誘導車) に追いつくと後ろに付き、
   対向のロードトレインが無く、道がまっすぐなときに右の車線へ出て抜く (片側 2 車線以上なら自分側の空いた車線)。
   後ろから来たロードトレインは、自車が左へ寄せる・速度を落とすと抜く (寄せないと長く後ろに付いたまま)。
 ・市街 (実寸の町) では前にも車が走り、赤信号では停止線の前の車の後ろに止まる。
 ・車の動きは「前の車との車間」で加減速する (IDM: 車間と速さの差から加速度を決める一般的な追従の式)。
 ・自車との当たり判定は他の車と同じ (View.dynColliders)。一般車両の方からはぶつけてこない。
 多さ: PRO.trafficK (0 = 出さない) */
const Traffic={
 cars:[], tB:0, tA:0, lastS:null, rtMsg:null,
 HOME:-2.4,
 KINDS:{
  sedan:{L:4.7, W:1.8, v:[0.92,1.0], a:1.6, b:3.0},
  ute:{L:5.3, W:1.9, v:[0.9,1.0], a:1.4, b:3.0},
  suv:{L:4.9, W:1.95, v:[0.9,1.0], a:1.4, b:3.0},
  van:{L:5.2, W:2.0, v:[0.85,0.95], a:1.1, b:2.6},
  caravan:{L:12.2, W:2.3, v:[0.72,0.8], a:0.8, b:2.0},
  rt:{L:53, W:2.6, v:[0.95,1.0], a:0.45, b:1.3},   // 上限 100 km/h (cap)
 },
 reset(V){ for(const c of this.cars) this.drop(V,c); this.cars=[]; this.tB=8+Math.random()*10; this.tA=0; this.lastS=null; this.rtMsg=null; },
 drop(V,c){ if(!c.mesh) return; V.scene.remove(c.mesh); c.mesh.traverse(o=>{ if(o.geometry) o.geometry.dispose(); if(o.material) o.material.dispose(); }); c.mesh=null; },
 passing(){ return this.cars.some(c=>c.mode==="pass"); },
 /* ---------- 見た目 (前方 = -z、原点 = 車の中心。ロードトレインだけは View.mkRoadTrain を反転して使う) ---------- */
 COLORS:[0xe9eaec,0xd9dadc,0x1d1f22,0x9aa0a6,0x7a1d1d,0x23406e,0xc8c2b4,0x3a3f44,0xb7b9bb,0x2f5d3a,0xf1f1ef,0x8c2f1b],
 mkMesh(V,kind){
  if(kind==="rt"){ const t=V.mkRoadTrain(), g=new THREE.Group(); t.rotation.y=Math.PI; g.add(t); g.userData.zf=-9.4; g.userData.tail=null; return g; }
  const g=new THREE.Group(), bs=new BatchSet(), col=this.COLORS[Math.floor(Math.random()*this.COLORS.length)], body=linCol(col).clone(), dark=linCol(0x18191b).clone(), glass=linCol(0x1a242b).clone(), K=this.KINDS[kind];   // linCol は使い回しの 1 個を返すので複製する
  const wheel=(x,z,r)=>{ bs.get("solid").add(tpl("cyl12"),M4(x,r,z,r,0.26,r,0,0,Math.PI/2),dark); bs.get("solid").add(tpl("cyl8"),M4(x*1.01,r,z,r*0.55,0.27,r*0.55,0,0,Math.PI/2),linCol(0x8f9396)); };
  let zf=-K.L/2, tailZ=K.L/2, tailY=0.85, tailX=0.72;
  if(kind==="sedan"){
   bs.get("solid").add(tpl("box"),M4(0,0.62,0,1.8,0.62,4.7),body);
   bs.get("solid").add(tpl("box"),M4(0,1.12,0.25,1.62,0.5,2.3),body);
   bs.get("glass").add(tpl("box"),M4(0,1.14,0.25,1.65,0.4,2.15),glass);
   for(const [x,z] of [[-0.8,1.45],[0.8,1.45],[-0.8,-1.45],[0.8,-1.45]]) wheel(x,z,0.33);
   tailY=0.78;
  } else if(kind==="ute"){
   bs.get("solid").add(tpl("box"),M4(0,0.78,-1.55,1.86,0.7,2.2),body);            // ボンネット
   bs.get("solid").add(tpl("box"),M4(0,1.4,-0.2,1.8,0.85,1.6),body);              // キャブ
   bs.get("glass").add(tpl("box"),M4(0,1.5,-0.2,1.83,0.55,1.45),glass);
   bs.get("solid").add(tpl("box"),M4(0,0.85,1.65,1.86,0.75,2.0),linCol(0x2b2d30)); // 荷台
   bs.get("solid").add(tpl("box"),M4(0,0.42,-2.6,1.95,0.5,0.18),linCol(0x34383b)); // ブルバー
   for(const [x,z] of [[-0.82,1.75],[0.82,1.75],[-0.82,-1.6],[0.82,-1.6]]) wheel(x,z,0.4);
   tailY=0.95; tailX=0.8;
  } else if(kind==="suv"||kind==="caravan"){
   const zc= kind==="caravan"? -K.L/2+2.45 : 0;
   bs.get("solid").add(tpl("box"),M4(0,0.75,zc,1.92,0.85,4.8),body);
   bs.get("solid").add(tpl("box"),M4(0,1.5,zc+0.4,1.84,0.75,3.2),body);
   bs.get("glass").add(tpl("box"),M4(0,1.55,zc+0.4,1.87,0.55,3.0),glass);
   for(const [x,z] of [[-0.86,1.55],[0.86,1.55],[-0.86,-1.5],[0.86,-1.5]]) wheel(x,zc+z,0.38);
   if(kind==="caravan"){ // キャンピングトレーラー (白い箱・窓・1 軸)
    const zt=zc+2.4+0.9+3.0, cw=linCol(0xf2f1ec);
    bs.get("solid").add(tpl("box"),M4(0,0.5,zc+2.4+0.45,0.12,0.12,0.9),dark);
    bs.get("solid").add(tpl("box"),M4(0,1.55,zt,2.3,2.25,6.0),cw);
    bs.get("solid").add(tpl("box"),M4(0,1.05,zt,2.32,0.18,6.02),linCol(0x6b4a2b));
    bs.get("glass").add(tpl("box"),M4(0,1.85,zt-0.6,2.34,0.6,1.6),glass);
    for(const x of [-1.05,1.05]) wheel(x,zt+0.3,0.34);
   } else tailZ=2.4;
   tailY=1.0; tailX=0.82;
  } else { // van (箱型のバン)
   bs.get("solid").add(tpl("box"),M4(0,1.25,0.2,1.98,1.9,4.8),body);
   bs.get("solid").add(tpl("box"),M4(0,0.75,-2.25,1.9,0.8,0.7),body);
   bs.get("glass").add(tpl("box"),M4(0,1.75,-1.9,1.9,0.6,0.08,0,-0.35,0),glass);
   for(const [x,z] of [[-0.85,1.7],[0.85,1.7],[-0.85,-1.75],[0.85,-1.75]]) wheel(x,z,0.36);
   tailY=1.05; tailX=0.85;
  }
  bs.toGroup(g);
  const tail=new THREE.MeshBasicMaterial({color:0x5a0b0b});   // 尾灯 (ブレーキで明るく)
  for(const sx of [-tailX,tailX]){ const l=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.16,0.05),tail); l.position.set(sx,tailY,tailZ+0.03); g.add(l); }
  const hl=new THREE.MeshBasicMaterial({color:0xf3f1e6});
  for(const sx of [-0.62,0.62]){ const l=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.12,0.05),hl); l.position.set(sx,kind==="van"?0.95:0.78,zf-0.02); g.add(l); }
  g.userData.zf=zf; g.userData.tail=tail;
  g.traverse(o=>{ if(o.isMesh) o.castShadow=true; });
  return g;
 },
 /* ---------- 出す・動かす ---------- */
 noSpawn:false, kMul:1,   // 入門コース: 出さない / 多くする
 level(){ return (typeof PRO!=="undefined"&&PRO.trafficK!=null? Math.max(0,PRO.trafficK) : 1)*this.kMul; },
 town(km){ return Route.inZone(km); },
 pickKind(town,rural){
  const r=Math.random();
  if(town) return r<0.45?"sedan":r<0.7?"ute":r<0.9?"suv":"van";
  if(rural&&r<0.12) return "rt";
  return r<0.3?"sedan":r<0.55?"ute":r<0.75?"suv":r<0.9?"caravan":"van";
 },
 /* 走りたい速さ: 制限速度 × その車の割合 (乗用車 0.9〜1.0、キャンピングカー 0.72〜0.8 …)。ただし上限 (乗用車 125・大型 100 km/h) */
 desired(c,km){ return Math.max(4,Math.min(speedLimitAt(clamp(km,0,TOTAL_KM))/3.6*c.f, c.cap)); },
 spawn(V,es,kind,sFront,v,lat){
  const K=this.KINDS[kind], mesh=this.mkMesh(V,kind); V.scene.add(mesh);
  const c={kind,L:K.L,W:K.W,a:K.a,b:K.b,mesh,s:sFront,v,lat,latT:lat,home:lat,mode:"lane",wait:0,id:Math.random(),
   f:K.v[0]+Math.random()*(K.v[1]-K.v[0]), cap:(kind==="rt"||kind==="caravan"? 100 : 125)/3.6*(0.95+Math.random()*0.05)};
  c.v0=this.desired(c,V.kmOfS(sFront));
  this.cars.push(c); return c;
 },
 lanes(rp){ const multi=rp.m1>0.3||rp.ow||rp.L>6; return multi? {multi:true, left:-(rp.L-1.75), right:-1.75} : {multi:false, left:this.HOME, right:2.4}; },
 /* 道の上の物 (前端・後端・横の位置・速さ): 自車・随伴車・他チーム・一般車両・赤信号の停止線 */
 obstacles(V,es){
  const out=[], [cL]=typeof carDims==="function"? carDims() : [4.6];
  out.push({f:V.s+cL/2,r:V.s-cL/2,lat:V.lateral,v:es.v*Math.max(0,es.progRate||1),me:true});
  if(V.escortChase&&V.escortChase.visible) out.push({f:V.s-32+2.4,r:V.s-32-2.4,lat:-2.4,v:es.v,convoy:true});
  if(V.escortLead&&V.escortLead.visible&&V.leadS!=null) out.push({f:V.leadS+2.4,r:V.leadS-2.4,lat:-2.4,v:V.leadV||0,convoy:true});
  for(const sl of V.aiPool||[]) if(sl.team&&sl.mesh&&sl.mesh.visible&&sl._s!=null){
   const v=(sl.team.vNow||0)/3.6, lat=sl.team.yieldT>0&&sl.team.latV<-3.2? -4.4 : sl.team.latV||-2.4;   // 自車に道を譲って路肩へ寄る隊列は、寄せた先で見る (寄る途中で後ろの一般車が止まらない)
   out.push({f:sl._s+2.4,r:sl._s-2.4,lat,v,convoy:true});
   if(sl.lead&&sl.lead.visible&&sl._sL!=null) out.push({f:sl._sL+2.4,r:sl._sL-2.4,lat,v,convoy:true});
   if(sl.chase&&sl.chase.visible&&sl._sC!=null) out.push({f:sl._sC+2.4,r:sl._sC-2.4,lat,v,convoy:true});
  }
  for(const [,ent] of V.lmMap||[]) if(ent.lm.t==="signal"&&ent.red){ const sg=V.sOfKm(ent.lm.km)-3; out.push({f:sg,r:sg-0.1,lat:null,v:0,sig:true}); }
  for(const c of this.cars) out.push({f:c.s,r:c.s-c.L,lat:c.lat,lat2:c.latT,v:c.v,car:c});
  return out;
 },
 inLane(o,lat){ if(o.lat==null) return true; return Math.abs(o.lat-lat)<1.9||(o.lat2!=null&&Math.abs(o.lat2-lat)<1.9&&Math.abs(o.lat-o.lat2)>0.3); },
 /* 自分の前で同じ車線にいる、いちばん近い物 */
 leader(c,obs,lat,skipSig){
  let best=null;
  for(const o of obs){ if(o.car===c) continue; if(o.sig&&(skipSig||c.s>o.f+0.5)) continue; if(o.r<c.s-0.5) continue; if(!this.inLane(o,lat)) continue;
   if(o.sig&&c.s>o.f-1.5&&c.v>3) continue;   // 停止線を越えかけている (止まりきれない) → そのまま行く
   if(!best||o.r<best.r) best=o; }
  return best;
 },
 idm(c,ld,v0){
  const T=c.kind==="rt"?2.2:1.4, s0=c.kind==="rt"?6:3.5;
  let a=c.a*(1-Math.pow(Math.max(0,c.v)/Math.max(1,v0),4));
  if(ld){ const gap=Math.max(0.1,ld.r-c.s), dv=c.v-ld.v, ss=s0+Math.max(0,c.v*T+c.v*dv/(2*Math.sqrt(c.a*c.b)));
   a-=c.a*(ss/gap)*(ss/gap); }
  return clamp(a,-8,c.a);
 },
 update(V,es,dtR){
  const k=this.level(), on=P.mode==="race"&&!P.event&&!es.camp&&!es.fire&&(k>0||this.noSpawn)&&V.road;
  if(this.lastS!=null&&Math.abs(V.s-this.lastS)>400) this.reset(V);   // 場所が飛んだ (シナリオ・続きから)
  this.lastS=V.s;
  if(!on){ if(this.cars.length) this.reset(V); return; }
  const town=this.town(es.km), rural=!town;
  /* 後ろから来る車 */
  this.tB-=dtR;
  if(this.tB<=0&&es.stopTimer<=0&&!this.noSpawn&&k>0){
   this.tB=(town?18:55)*(0.6+0.8*Math.random())/k;
   const kind=this.pickKind(town,rural), sF=V.s-260;
   const clear=!this.cars.some(c=>Math.abs(c.s-sF)<70);
   if(clear&&sF>30){ const c=this.spawn(V,es,kind,sF,0,this.HOME); c.v=Math.min(c.v0,es.v+10);
    if(c.v0<es.v+2.5){ this.drop(V,c); this.cars.pop(); } }   // 自車より遅い車は追いつかないので出さない
  }
  /* 市街: 前を走る車 (町の中で、前 600 m に 3 台まで) */
  if(town&&!this.noSpawn&&k>0){ this.tA-=dtR;
   const ahead=this.cars.filter(c=>c.s>V.s+20&&c.s<V.s+700).length;
   if(this.tA<=0&&ahead<3){ this.tA=5+Math.random()*6;
    const sF=V.s+480+Math.random()*180;
    if(sF<V.road.builtS-60&&!this.cars.some(c=>Math.abs(c.s-sF)<60)){ const kind=this.pickKind(true,false), c=this.spawn(V,es,kind,sF,0,this.HOME); c.v=c.v0*0.8; c.ahead=true; } } }
  const obs=this.obstacles(V,es);
  for(let i=this.cars.length-1;i>=0;i--){
   const c=this.cars[i], rp=V.roadPoint(clamp(c.s-c.L/2,0,V.road.builtS-V.SEG)), ln=this.lanes(rp);
   c.v0=this.desired(c,V.kmOfS(c.s));
   if(c.mode!=="pass") c.home= ln.multi? ln.left : this.HOME;
   const homeLd=this.leader(c,obs,c.home);
   let ld=homeLd, v0=c.v0;
   const near=(c.kind==="rt"?6:3.5)+c.v*(c.kind==="rt"?2.2:1.4)*1.3+15;   // 追従の車間 (+余裕)
   /* 追い越し: 遅い車列に付いている */
   if(c.mode==="lane"){
    const slow=homeLd&&!homeLd.sig&&homeLd.v<c.v0-1.5&&homeLd.r-c.s<near;
    c.wait= slow? c.wait+dtR : Math.max(0,c.wait-dtR);
    if(slow&&c.wait>2.5&&c.kind==="rt"&&!ln.multi&&(homeLd.me||homeLd.convoy)) this.rtRadio(c,es);
    if(slow&&c.wait>2.5){
     const passLat=ln.right, passLd=this.leader(c,obs,passLat,!town);
     const free=(!passLd||passLd.r-c.s>120)&&homeLd.v<c.v0-3.5   // 速さの差が小さい (13 km/h 未満) なら抜かずに付いていく
      &&!obs.some(o=>o.car!==c&&!o.sig&&this.inLane(o,passLat)&&o.f>c.s-c.L-15&&o.r<c.s+30);   // 出る車線の横・すぐ後ろに車がいない
     const [cp,cn]=V.maxCurv(c.s+200,200), straight=Math.max(cp,cn)<1/350;   // 先 400 m に半径 350 m より急なカーブがない (見通しがきく)
     const oncoming=!ln.multi&&(V.roadTrains||[]).some(rt=>rt.sVis>c.s-60&&rt.sVis<c.s+1300);
     const noTown=ln.multi||!town;
     const others=!ln.multi&&this.cars.some(o=>o!==c&&o.mode==="pass");
     let ok=free&&noTown&&!others&&(ln.multi||(straight&&!oncoming));
     if(c.kind==="rt"&&!ln.multi&&!(homeLd.me||homeLd.convoy)) ok=false;   // ロードトレインどうしは抜かない
     if(ok&&c.kind==="rt"&&!ln.multi){   // ロードトレイン: 自車が左に寄せる・速度を落とすまで待つ (長く待ったら抜く)
      const yielded=V.lateral<-(Math.min(rp.L,4.4)-0.9)||es.v<c.v0*0.7||c.wait>60;
      if(!yielded) ok=false;
     }
     c.why=ok?"":!free?"free":!noTown?"town":others?"others":!straight?"curve":oncoming?"rt":"yield";   // 追い越さない理由 (確認用)
     if(ok){ c.mode="pass"; c.latT=passLat; c.passLat=passLat; c.wait=0; }
    }
   }
   if(c.mode==="pass"){
    v0=c.v0+(c.kind==="rt"?2:3);
    ld=this.leader(c,obs,c.passLat,!town);
    // 元の車線に戻れるか: 自分の後端の 12 m 後ろから、追従の車間の先まで空いている
    const back=!obs.some(o=>o.car!==c&&!o.sig&&this.inLane(o,c.home)&&o.f>c.s-c.L-12&&o.r<c.s+near+5);
    if(back){ c.mode="lane"; c.latT=c.home; if(c.kind==="rt"&&this.rtMsg===c.id){ this.rtMsg="done"; Radio.push("ロードトレイン通過。車線に戻ってください。","後方追走車"); } }
   } else c.latT=c.home;
   const a=this.idm(c,ld,v0);
   c.v=Math.max(0,c.v+a*dtR); c.s+=c.v*dtR;
   // 横へ動く速さ: 最大 1.2 m/s (大型 0.8)。遅いときはゆっくり (止まったまま横には動かない)
   const vl=Math.min(c.kind==="rt"?0.8:1.2,0.08*c.v+0.05), dl=clamp(c.latT-c.lat,-vl*dtR,vl*dtR); c.lat+=dl; c.vl=dtR>0? dl/dtR : 0;
   if(c.mesh.userData.tail) c.mesh.userData.tail.color.setHex(a<-0.8||c.v<0.3? 0xff2020 : 0x5a0b0b);
   // 消す: ずっと前 / ずっと後ろ / 道の端
   const rel=c.s-V.s;
   if(rel>950||rel<-520||c.s>V.road.builtS-30){ this.drop(V,c); this.cars.splice(i,1); continue; }
   const zf=c.mesh.userData.zf, so=c.s+zf, q=V.roadPoint(clamp(so,0,V.road.builtS-V.SEG)), nx=Math.cos(q.h), nz=Math.sin(q.h);
   c.mesh.position.set(q.x+nx*c.lat,q.y,q.z+nz*c.lat);
   const yaw=c.v>0.5? clamp(Math.atan2(c.vl,c.v),-0.12,0.12) : 0;
   c.mesh.rotation.y=-q.h-yaw;
  }
 },
 rtRadio(c,es){ if(this.rtMsg===c.id) return; this.rtMsg=c.id;
  Radio.push("後ろからロードトレイン。左に寄せて速度を落とし、追い越させてください。","後方追走車",{speak:true}); },
 colliders(add){ for(const c of this.cars) if(c.mesh) add(c.mesh,c.L,c.W,c.v,"vehicle"); },
};
