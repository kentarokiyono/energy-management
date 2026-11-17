"use strict";
/* ============ タイヤと車体の横の動き (車輪ごと) ============
 車体: 前後の速さ u (Engine が決める)・横すべりの速さ vy・向きの変わる速さ r を、車輪ごとのタイヤの力で計算する。
 ・荷重: 静止の配分 + 前後の荷重移動 (加減速) + 左右の荷重移動 (旋回・横風) - 浮き上がり (パネルの揚力)
 ・タイヤ: 横すべり角が小さいうちは力が比例して増え、限界で頭打ち (Fiala の式)。前後の力と横の力の合計は μ·荷重まで (摩擦円)
   荷重が増えるほど μ と硬さの割合は少し下がる (荷重感度: 内輪が浮きかけると、その分の外輪では取り返せない)
 ・ブレーキ・駆動: 前後の力が μ·荷重を超えた車輪はロック (ブレーキ) / 空転 (駆動) して、横の力をほぼ失う
   ABS は無い。規則 2.20.8 に合わせ、ブレーキの配分は前寄り (前輪が先にロック → 曲がらずにまっすぐ進む)
 ・横風: 横力を「風の力の中心」(重心より少し前) にかける。流され方・鼻先の振られ方はタイヤの滑りから出る
 ・2 m/s より遅いときは、滑りのない動き (前輪の向きどおり) へなめらかに切り替える (止まる直前に計算が暴れない)
 座標: 車体の前 + / 右 +。r は右へ向きを変える向きが +。舵角も右 +。
 車の値は諸元 (vehicle-private.js) の chassis・tyre・brake・aero にあればその値、無ければ一般的な値 (実車の値ではない) */
const Tire={
 DEF:{rearLoadK:0.85, cgHeight:0.42, steerMax:0.4, mu:0.9, cornK:12, cpX:0.1, izK:0.85},
 SURF:{road:1, wetK:0.35, shoulder:0.6, dirt:0.5},   // 路面の μ の倍率 (乾いた舗装 = 1)。濡れ: 1 - 0.35·濡れ具合、路肩の砂利・土
 LS:0.15,        // 荷重感度
 SLIDE:0.85,     // 滑っているときの摩擦 (滑り出す直前の μ に対する比)
 TRAIL:0.035,    // タイヤの接地面の中心から力のかかる点までの距離 [m] (滑っていないとき)。ハンドルを戻す力のもと
 V0:1.2, V1:2.5, // この速さ [m/s] より下は滑りのない動き、上はタイヤの計算 (間はなめらかに混ぜる)
 H:0.004,        // 計算の刻み [s]

 /* 車の値 (質量・諸元・車輪の配置が変わったら作り直す) */
 _p:null, _key:"",
 params(){
  const S=(typeof VEH!=="undefined"&&VEH.active&&VEH.spec)||{}, C=S.chassis||{}, T=S.tyre||{}, B=S.brake||{}, A=S.aero||{}, D=this.DEF;
  const body=(S.body&&S.body.wheels)? S.body : (typeof YATA_PUBLIC_BODY!=="undefined"&&YATA_PUBLIC_BODY.wheels? YATA_PUBLIC_BODY : null);
  const W=(body&&body.wheels)||[[0,1.34,0.26],[-0.42,-1.32,0.26],[0.42,-1.32,0.26]];   // [右 +, 後ろ +, 半径]
  const m=massTotal(), key=m+"|"+W.length+"|"+(S.rev||0);
  if(this._p&&this._key===key) return this._p;
  let zF=Infinity, zR=-Infinity; for(const w of W){ zF=Math.min(zF,w[1]); zR=Math.max(zR,w[1]); }
  const L=C.wheelbase||Math.max(1,zR-zF), zMid=(zF+zR)/2, nF0=W.filter(w=>w[1]<zMid).length||1, nR0=(W.length-nF0)||1;
  /* 前輪の荷重の割合: 諸元が無ければ、後輪 1 本の荷重が前輪 1 本の 0.85 倍になる配分 (前 2・後 1 なら 0.70)。
   ソーラーカーは重心を前に置き、後輪が先に滑ってスピンしないようにする (限界で前輪が先に滑る = まっすぐ進む) */
  const fs=C.frontShare||1/(1+D.rearLoadK*nR0/nF0);
  const zCG=zF+(1-fs)*L, a=(1-fs)*L, b=fs*L;   // a: 重心から前の車軸、b: 後ろの車軸
  const wh=W.map(w=>({px:zCG-w[1], py:w[0], front:w[1]<zMid, R:w[2]||0.26}));
  const nF=wh.filter(w=>w.front).length||1, nR=(wh.length-nF)||1;
  const axle=f=>{ const g=wh.filter(w=>w.front===f); if(g.length<2) return null; let lo=Infinity,hi=-Infinity; for(const w of g){ lo=Math.min(lo,w.py); hi=Math.max(hi,w.py); } return {track:hi-lo,mid:(hi+lo)/2,share:f?fs:1-fs}; };
  // 重心の高さ: 諸元が無ければ、車輪の配置から静的安定係数 SSF = 1.2 (規則 2.19.4: SSF > 1) になる高さ
  let h=C.cgHeight||D.cgHeight; if(!C.cgHeight){ const half=g=>g.length? Math.max(...g.map(w=>Math.abs(w.py))) : 0;
   const hw=half(wh.filter(w=>w.front))*(b/L)+half(wh.filter(w=>!w.front))*(a/L); if(hw>0.05) h=Math.min(D.cgHeight,hw/(C.ssf||1.2)); }
  /* ブレーキの前輪の割合: 諸元が無ければ、1 g で減速したときの前輪の荷重の割合より少し大きく (どの路面でも前輪が先にロック: 規則 2.20.8) */
  const bf=B.frontShare||Math.min(0.95,fs+h/L+0.03);
  const axF=axle(true), axR=axle(false), sh=(axF?axF.share:0)+(axR?axR.share:0)||1;
  for(const w of wh){ w.share=(w.front? fs/nF : (1-fs)/nR); const ax=w.front?axF:axR;
   w.lat= ax&&ax.track>0.05? (w.py<ax.mid?1:-1)*(ax.share/sh)/ax.track : 0;   // 横 G 1 m/s² あたりの荷重の増え方 (×m·h)
   w.bk=(w.front? bf/nF : (1-bf)/nR); w.drive=!w.front; }
  return this._key=key, this._p={m, L, a, b, h, bf, Iz:C.Iz||D.izK*m*a*b, wh, nF, nR, nDrive:nR,
   steerMax:C.steerMax||D.steerMax, mu:T.mu||C.mu||D.mu, cornK:T.cornK||D.cornK, cpX:A.cpX!=null? A.cpX : D.cpX, Fz0:m*GRAV/wh.length};
 },
 init(){ return {vy:0, r:0, ay:0, ax:0, w:null, slideT:0, lockT:0, sat:0, use:0}; },

 /* 舵角 [rad] (右 +)。mode "wheel" (ハンコン) はハンドルの角度に比例。
  キーボード・スティックは速いほど切れ方を抑える (グリップの限界を少し超えるところまで) */
 steerAngle(steer,v,mode){
  const p=this.params(), dMax=p.steerMax*clamp(steer,-1,1);
  if(mode==="wheel") return dMax;
  const dGrip=Math.atan(p.mu*GRAV*p.L/Math.max(v*v,1))*1.25;
  return Math.sign(dMax)*Math.min(Math.abs(dMax),dGrip);
 },
 /* キーボードでいっぱいに切ったときの横加速度 [m/s²] (グリップの限界まで) */
 fullAccel(v){ const p=this.params(), d=this.steerAngle(1,v,"assist"); return Math.min(v*v*Math.tan(d)/p.L,p.mu*GRAV); },

 /* 車輪ごとの荷重 [N]。ax 前へ加速 +・ay 右へ加速 + [m/s²]、lift 浮き上がり [N] */
 loads(p,ax,ay,lift){
  const mg=p.m*GRAV, dLong=p.m*ax*p.h/p.L;
  return p.wh.map(w=>Math.max(0, w.share*(mg-(lift||0)) + (w.front? -dLong/p.nF : dLong/p.nR) + w.lat*p.m*ay*p.h));
 },

 /* 1 輪の力 (車輪の向きの座標: 前 + / 右 +)。vl・vt: 接地点の速さ、Fz 荷重、mu 路面の μ、Fxd 前後の力の要求 (前 +)、ws: 車輪の状態 {lock}
  → {fx, fy, slide (横に滑っている), lock (ロック・空転), use (グリップの使い方 0〜1), sat (ハンドルを戻すモーメント [N·m])} */
 wheel(p,vl,vt,Fz,mu,Fxd,ws){
  const r0=Fz/p.Fz0-1, muE=mu*Math.max(0.5,1-this.LS*r0), Fmax=muE*Fz;
  if(Fmax<1){ ws.lock=false; return {fx:0,fy:0,slide:Fz>0,lock:false,use:Fz>0?1:0,sat:0}; }
  const brakeReq= Fxd*Math.sign(vl||1)<0;   // 動いている向きと逆の力 = ブレーキ
  if(!ws.lock&&Math.abs(Fxd)>Fmax&&Math.abs(vl)>0.5) ws.lock=true;
  else if(ws.lock&&(Math.abs(Fxd)<this.SLIDE*Fmax*0.98||Math.abs(vl)<0.3)) ws.lock=false;
  if(ws.lock){
   const k=this.SLIDE*Fmax;
   if(brakeReq){ const s=Math.hypot(vl,vt)||1; return {fx:-k*vl/s,fy:-k*vt/s,slide:true,lock:true,use:1,sat:0}; }   // ロック: 滑る向きと逆に摩擦
   const th=Math.atan2(Math.abs(vt),0.3*Math.max(Math.abs(vl),1));                                                     // 空転
   return {fx:Math.sign(Fxd)*k*Math.cos(th),fy:-Math.sign(vt)*k*Math.sin(th),slide:true,lock:true,use:1,sat:0};
  }
  const fx=Fxd, fyMax=Math.sqrt(Math.max(0,Fmax*Fmax-fx*fx));
  const C=p.cornK*Fz*Math.max(0.3,1-0.5*this.LS*r0), ta=Math.abs(vt)/Math.max(Math.abs(vl),0.5);
  let fy=0, z=0;
  if(fyMax>1e-6){ z=C*ta/(3*fyMax);
   const mag= z<1? fyMax*(3*z-3*z*z+z*z*z) : fyMax*(1-(1-this.SLIDE)*clamp(z-1,0,1));
   fy=-Math.sign(vt)*mag; }
  const tp=this.TRAIL*Math.max(0,1-Math.min(z,1))**1.5;   // 滑り始めるとトレールが短くなる (ハンドルが軽くなる)
  return {fx,fy,slide:z>=1,lock:false,use:Math.min(1,Math.hypot(fx,fy)/Fmax),sat:fy*tp};
 },

 /* 前後の力: 車輪ごとの要求 [N] (前 +)。drive 駆動 (駆動輪)・brake 機械ブレーキ・regen 回生 (駆動輪)、u の向きと逆に効く */
 demand(p,w,inp){ const dir=Math.sign(inp.u)||1;
  return (w.drive? ((inp.drive||0)*dir-(inp.regen||0)*dir)/p.nDrive : 0) - (inp.brake||0)*w.bk*dir; },

 /* 1 フレーム進める。st: init() の状態、inp: {u [m/s, 後退 −], delta [rad], drive, brake, regen [N]}、
  env: {mu: 車輪ごとの μ の配列 (または 1 つの数), Fside 横風の横力 [N, 右 +], lift [N]}、dt [s]
  → st を更新し、{fx 実際に出た前後の力 (車輪の向きの成分) の合計 [N], fxReq 要求の合計, ay, wheels} */
 step(st,inp,env,dt){
  const p=this.params(), u=inp.u||0, au=Math.abs(u), d=inp.delta||0, n=Math.max(1,Math.min(25,Math.ceil(dt/this.H))), h=dt/n;
  if(!st.w||st.w.length!==p.wh.length) st.w=p.wh.map(()=>({lock:false}));
  const muOf=i=> Array.isArray(env.mu)? (env.mu[i]==null?1:env.mu[i]) : (env.mu==null?1:env.mu);
  const kDyn=clamp((au-this.V0)/(this.V1-this.V0),0,1);
  // 滑りのない動き (前輪の向きどおり、後輪は横に滑らない)
  const rK=u*Math.tan(d)/p.L, vyK=rK*p.b;
  if(kDyn<=0){ st.vy=vyK; st.r=rK; st.ay=u*rK; st.sat=0; st.use=0; st.slide=false; st.lockAny=false;
   for(const ws of st.w) ws.lock=false;
   const fx=p.wh.reduce((s,w)=>s+this.demand(p,w,inp),0); return {fx,fxReq:fx,ay:st.ay,wheels:null}; }
  let out=null, fxS=0, fxR=0;
  for(let k=0;k<n;k++){
   const Fz=this.loads(p,st.ax||0,st.ay||0,env.lift||0);
   let FX=0, FY=0, MZ=0, fxW=0, sat=0, use=0, slide=false, lockAny=false; const wo=[];
   for(let i=0;i<p.wh.length;i++){ const w=p.wh[i], di=w.front? d : 0, c=Math.cos(di), s=Math.sin(di);
    const uF=u-st.r*w.py, vR=st.vy+st.r*w.px, vl=uF*c+vR*s, vt=-uF*s+vR*c;
    const fxd=this.demand(p,w,inp), f=this.wheel(p,vl,vt,Fz[i],this.SURF.road*muOf(i)*p.mu,fxd,st.w[i]);
    const fxb=f.fx*c-f.fy*s, fyb=f.fx*s+f.fy*c;
    FX+=fxb; FY+=fyb; MZ+=w.px*fyb-w.py*fxb; fxR+=fxd; fxW+=f.fx;
    if(w.front) sat+=f.sat; use=Math.max(use,f.use); slide=slide||f.slide; lockAny=lockAny||f.lock;
    wo.push({Fz:Fz[i],fx:f.fx,fy:f.fy,use:f.use,slide:f.slide,lock:f.lock,front:w.front,px:w.px,py:w.py});
   }
   FY+=env.Fside||0; MZ+=(env.Fside||0)*p.cpX;
   const vyDot=FY/p.m-u*st.r, rDot=MZ/p.Iz;
   st.vy+=vyDot*h; st.r+=rDot*h; st.ay=FY/p.m; st.ax=FX/p.m; fxS+=fxW;
   out={sat,use,slide,lockAny,wo};
  }
  st.vy=lerp(vyK,st.vy,kDyn); st.r=lerp(rK,st.r,kDyn);
  st.sat=out.sat*kDyn; st.use=out.use; st.slide=out.slide&&kDyn>0.5; st.lockAny=out.lockAny;
  return {fx:fxS/n, fxReq:fxR/n, ay:st.ay, wheels:out.wo};
 },
 /* ハンドルを戻すモーメントの目安 [N·m] (乾いた路面で、前輪がいちばん強く戻そうとするくらい)。反力の強さをこれで割って 0〜1 にする */
 satRef(){ const p=this.params(), Ff=p.wh.reduce((s,w)=>s+(w.front?w.share:0),0)*p.m*GRAV; return Math.max(1,p.mu*Ff*this.TRAIL*0.385); },
 /* 横すべり角 (車体の向きと進む向きの差) [rad] */
 beta(st,u){ return Math.atan2(st.vy||0,Math.max(Math.abs(u),0.5)); },
};
