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
 RELAX:0.4,      // タイヤの横の力が追いつくまでに転がる距離 [m]
 FLAT:{corn:0.3, mu:0.6},   // パンクしたタイヤ: 横すべりの硬さ・グリップの倍率
 CAMBER:0.8,     // キャンバーの横力 (1 rad 傾くと荷重の何倍の横力か)
 TRAIL:0.035,    // タイヤの接地面の中心から力のかかる点までの距離 [m] (滑っていないとき、空気圧のトレール)。ハンドルを戻す力のもと。
                 // これにキャスター角による機構のトレール (滑っても残る) を足す
 V0:0.3, V1:0.8, // この速さ [m/s] より下は滑りのない動き、上はタイヤの計算 (間はなめらかに混ぜる)。低くして、ゆっくり滑っていてもタイヤの摩擦で自然に止まる
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
  /* 前輪の荷重の割合: 実測も諸元も無ければ、後輪 1 本の荷重が前輪 1 本の 0.85 倍になる配分 (前 2・後 1 なら 0.70)。
   ソーラーカーは重心を前に置き、後輪が先に滑ってスピンしないようにする (限界で前輪が先に滑る = まっすぐ進む) */
  /* 実測の車輪ごとの重さ (諸元 chassis.wheelKg: {FL, FR, R} または {FL, FR, RL, RR} [kg]、ドライバー込みの走る状態) があれば、
   その割合をそのまま使う (左右の偏りも)。無ければ frontShare、それも無ければ一般的な配分 */
  const WK=C.wheelKg&&typeof C.wheelKg==="object"? C.wheelKg : null;
  const wkOf=(x,z)=>{ if(!WK) return null; const fr=z<zMid, L_=x<0;
   const v= fr? (L_? WK.FL : WK.FR) : (WK.R!=null? WK.R : (L_? WK.RL : WK.RR)!=null? (L_? WK.RL : WK.RR) : ((+WK.RL||0)+(+WK.RR||0)));
   return Number.isFinite(+v)&&+v>0? +v : null; };
  const wk=W.map(w=>wkOf(w[0],w[1])), wkOk=wk.every(v=>v!=null), wkSum=wkOk? wk.reduce((a,b)=>a+b,0) : 0;
  /* 実測が無いとき: 一般的な配分 (または諸元の frontShare) を電池以外の分に使い、電池 (運転席のすぐ後ろ、Tire.battery) はその位置で足す */
  const bat=this.battery(), fsB=clamp((zR-bat.z)/L,0,1), mb=Math.min(bat.kg,m*0.5), fs0=C.frontShare||1/(1+D.rearLoadK*nR0/nF0);
  const fs= wkOk&&wkSum>0? W.reduce((a,w,i)=>a+(w[1]<zMid? wk[i] : 0),0)/wkSum : ((m-mb)*fs0+mb*fsB)/m;
  const zCG=zF+(1-fs)*L, a=(1-fs)*L, b=fs*L;   // a: 重心から前の車軸、b: 後ろの車軸
  const wh=W.map(w=>({px:zCG-w[1], py:w[0], x0:w[0], front:w[1]<zMid, R:w[2]||0.26}));
  const nF=wh.filter(w=>w.front).length||1, nR=(wh.length-nF)||1;
  const axle=f=>{ const g=wh.filter(w=>w.front===f); if(g.length<2) return null; let lo=Infinity,hi=-Infinity; for(const w of g){ lo=Math.min(lo,w.py); hi=Math.max(hi,w.py); } return {track:hi-lo,mid:(hi+lo)/2,share:f?fs:1-fs}; };
  // 重心の高さ: 諸元が無ければ、車輪の配置から静的安定係数 SSF = 1.2 (規則 2.19.4: SSF > 1) になる高さ
  let h=C.cgHeight||D.cgHeight; if(!C.cgHeight){ const half=g=>g.length? Math.max(...g.map(w=>Math.abs(w.py))) : 0;
   const hw=half(wh.filter(w=>w.front))*(b/L)+half(wh.filter(w=>!w.front))*(a/L); if(hw>0.05) h=Math.min(D.cgHeight,hw/(C.ssf||1.2)); }
  /* ブレーキの前輪の割合: 諸元が無ければ、1 g で減速したときの前輪の荷重の割合より少し大きく (どの路面でも前輪が先にロック: 規則 2.20.8) */
  const bf=B.frontShare||Math.min(0.95,fs+h/L+0.03);
  const axF=axle(true), axR=axle(false), sh=(axF?axF.share:0)+(axR?axR.share:0)||1;
  wh.forEach((w,i)=>{ w.share= wkOk&&wkSum>0? wk[i]/wkSum : (w.front? fs/nF : (1-fs)/nR); });
  const yCG=wh.reduce((a,w)=>a+w.share*w.py,0); if(Math.abs(yCG)>1e-4) for(const w of wh) w.py-=yCG;   // 重心が左右にずれていれば、車輪の横の位置を重心から測り直す
  for(const w of wh){ const ax=w.front?axF:axR;
   w.lat= ax&&ax.track>0.05? (w.py<ax.mid?1:-1)*(ax.share/sh)/ax.track : 0;   // 横 G 1 m/s² あたりの荷重の増え方 (×m·h)
   w.bk=(w.front? bf/nF : (1-bf)/nR); w.drive=!w.front; }
  return this._key=key, this._p={m, L, a, b, h, bf, Iz:C.Iz||D.izK*m*a*b, wh, nF, nR, nDrive:nR,
   steerMax:C.steerMax||D.steerMax, mu:T.mu||C.mu||D.mu, cornK:T.cornK||D.cornK, cpX:A.cpX!=null? A.cpX : D.cpX, Fz0:m*GRAV/wh.length};
 },
 /* 電池: 重さ [kg] と位置 z [m] (車体の中心から後ろ +)。諸元 chassis.battery {kg, z} があればその値。既定は運転席のすぐ後ろの 20 kg。
  車内の構造の見た目 (chassis.js) も同じ値 */
 BATTERY:{kg:20, z:-0.15},
 battery(){ const S=(typeof VEH!=="undefined"&&VEH.active&&VEH.spec)||{}, B=(S.chassis&&S.chassis.battery)||{}; return {kg:Number.isFinite(+B.kg)&&+B.kg>0? +B.kg : this.BATTERY.kg, z:Number.isFinite(+B.z)? +B.z : this.BATTERY.z}; },
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

 /* 前輪のアライメント (Susp の設定。無ければ 0): caster キャスター角・toe トー (片輪、+ = トーイン)・cam0 静的キャンバー (− = 上が内側) [rad]・ack アッカーマンの割合 (0〜1)・tm 機構のトレール [m] */
 align(){ const S=typeof Susp!=="undefined"? Susp : null, d=Math.PI/180;
  if(!S) return {caster:0,toe:0,cam0:0,ack:0,tm:0};
  const caster=S.val("caster")*d, R=this.params().wh.find(w=>w.front)||{R:0.26};
  return {caster,toe:S.val("toe")*d,cam0:S.val("camber0")*d,ack:S.val("ack")/100,tm:(R.R||0.26)*Math.tan(caster)}; },
 /* 前輪 1 本の舵角 [rad]: アッカーマン (内輪を外輪より大きく切る。100 % で両輪とも同じ円の中心を向く) + トー */
 steerOf(p,w,d,A){
  if(!w.front) return 0;
  let di=d;
  if(A.ack&&Math.abs(d)>1e-5){ const Rc=p.L/Math.tan(Math.abs(d)), inner=Math.sign(w.py)===Math.sign(d), y=Math.abs(w.py);
   const ideal=Math.atan(p.L/Math.max(0.05,Rc+(inner?-y:y))); di=d+A.ack*(Math.sign(d)*ideal-d); }
  return di+(w.py<0? A.toe : -A.toe);
 },
 /* 車輪ごとの空気圧の効き (Susp.pressK)。設定が無ければ基準 */
 press(){ const p=this.params(), S=typeof Susp!=="undefined"? Susp : null;
  return p.wh.map(w=> S? S.pressK(w.front? S.val("pF") : S.val("pR")) : {kt:1,crr:1,corn:1,mu:1}); },
 /* 空気圧による転がり抵抗の倍率 (荷重の配分で平均)。Model.resist の転がり抵抗に掛ける */
 _ck:null,
 crrK(){ const c=this._ck, ps=typeof P!=="undefined"? P.susp : null; if(c&&c.ps===ps&&c.p===this._p) return c.k;
  const p=this.params(), PK=this.press(); let k=0; p.wh.forEach((w,i)=>{ k+=w.share*PK[i].crr; }); this._ck={ps,p:this._p,k}; return k; },
 /* トー・静的キャンバーによる、まっすぐ走るときの抵抗 [N] (前輪がわずかに横すべりしたまま転がる分)。走行抵抗 (Model.resist) に足す */
 _ad:null,
 alignDrag(m){ const c=this._ad, ps=typeof P!=="undefined"? P.susp : null; if(c&&c.m===m&&c.ps===ps&&c.p===this._p) return c.F;   // 走行抵抗の計算で何度も呼ばれるので、値が変わるまで覚えておく
  const F=this.alignDrag0(m); this._ad={m,ps,p:this._p,F}; return F; },
 alignDrag0(m){ const A=this.align(); if(!A.toe&&!A.cam0) return 0; const p=this.params(), mm=m||p.m;
  let F=0; for(const w of p.wh){ if(!w.front) continue; const Fz=w.share*mm*GRAV, C=p.cornK*Fz; F+=C*A.toe*A.toe+this.CAMBER*Fz*(-A.cam0)*A.toe; }
  return Math.max(0,F); },
 /* 車輪ごとの荷重 [N]。ax 前へ加速 +・ay 右へ加速 + [m/s²]、lift 浮き上がり [N] */
 loads(p,ax,ay,lift){
  const mg=p.m*GRAV, dLong=p.m*ax*p.h/p.L;
  return p.wh.map(w=>Math.max(0, w.share*(mg-(lift||0)) + (w.front? -dLong/p.nF : dLong/p.nR) + w.lat*p.m*ay*p.h));
 },

 /* 1 輪の力 (車輪の向きの座標: 前 + / 右 +)。vl・vt: 接地点の速さ、Fz 荷重、mu 路面の μ、Fxd 前後の力の要求 (前 +)、ws: 車輪の状態 {lock}
  → {fx, fy, slide (横に滑っている), lock (ロック・空転), use (グリップの使い方 0〜1), sat (ハンドルを戻すモーメント [N·m])} */
 wheel(p,vl,vt,Fz,mu,Fxd,ws,gam,kC,h){
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
  // 横すべり + キャンバー (車輪が傾いた向きへ押す力 = CAMBER·荷重·傾き) を合わせた滑りの量
  const C=p.cornK*(kC||1)*Fz*Math.max(0.3,1-0.5*this.LS*r0), ss0=vt/Math.max(Math.abs(vl),0.5)-(gam? this.CAMBER*Fz*gam/Math.max(C,1) : 0);
  /* タイヤの力の立ち上がりの遅れ: 横すべりは、タイヤが RELAX [m] ほど転がる間に追いつく (切った瞬間・突風の直後は力が少し遅れる) */
  if(!Number.isFinite(ws.ss)||!h) ws.ss=ss0; else ws.ss+=clamp(Math.hypot(vl,vt)*h/this.RELAX,0,1)*(ss0-ws.ss);   // 真横に滑っていても追いつく
  const ss=ws.ss, ta=Math.abs(ss);
  let fy=0, z=0;
  if(fyMax>1e-6){ z=C*ta/(3*fyMax);
   const mag= z<1? fyMax*(3*z-3*z*z+z*z*z) : fyMax*(1-(1-this.SLIDE)*clamp(z-1,0,1));
   fy=-Math.sign(ss)*mag; }
  const tp=this.TRAIL*Math.max(0,1-Math.min(z,1))**1.5;   // 滑り始めるとトレールが短くなる (ハンドルが軽くなる)
  return {fx,fy,slide:z>=1,lock:false,use:Math.min(1,Math.hypot(fx,fy)/Fmax),sat:fy*tp};
 },

 /* 前後の力: 車輪ごとの要求 [N] (前 +)。drive 駆動 (駆動輪)・brake 機械ブレーキ・regen 回生 (駆動輪)、u の向きと逆に効く */
 demand(p,w,inp){ const dir=Math.sign(inp.u)||1;
  return (w.drive? ((inp.drive||0)*dir-(inp.regen||0)*dir)/p.nDrive : 0) - (inp.brake||0)*w.bk*dir; },

 /* 1 フレーム進める。st: init() の状態、inp: {u [m/s, 後退 −], delta [rad], drive, brake, regen [N]}、
  env: {mu: 車輪ごとの μ の配列 (または 1 つの数), Fside 横風の横力 [N, 右 +], lift [N], Fz: 車輪ごとの荷重 [N] (Susp。無ければ釣り合いの式), camber: 車輪ごとの傾き [rad, 右へ +]}、dt [s]
  → st を更新し、{fx 実際に出た前後の力 (車輪の向きの成分) の合計 [N], fxReq 要求の合計, du 前後の速さの足し分 [m/s²] (呼び出し側が u に足す), ay, wheels} */
 step(st,inp,env,dt){
  const p=this.params(), u=inp.u||0, au=Math.abs(u), d=inp.delta||0, n=Math.max(1,Math.min(25,Math.ceil(dt/this.H))), h=dt/n;
  if(!st.w||st.w.length!==p.wh.length) st.w=p.wh.map(()=>({lock:false}));
  const muOf=i=> Array.isArray(env.mu)? (env.mu[i]==null?1:env.mu[i]) : (env.mu==null?1:env.mu);
  const kDyn=clamp((Math.hypot(au,st.vy||0)-this.V0)/(this.V1-this.V0),0,1);   // 速さ: 横に滑っている分も (スピン中に前後の速さが 0 近くでも、横の滑りはタイヤの摩擦で止める)
  // 滑りのない動き (前輪の向きどおり、後輪は横に滑らない)
  const rK=u*Math.tan(d)/p.L, vyK=rK*p.b;   // (舵角は左右の平均 d で。アッカーマン・トーは低速では向きに効かない)
  if(kDyn<=0){ st.vy=vyK; st.r=rK; st.ay=u*rK; st.sat=0; st.use=0; st.slide=false; st.lockAny=false;
   for(const ws of st.w){ ws.lock=false; ws.ss=null; }
   const fx=p.wh.reduce((s,w)=>s+this.demand(p,w,inp),0); return {fx,fxB:fx,fxReq:fx,du:0,ay:st.ay,fy:p.m*st.ay,fxR:p.wh.reduce((s,w)=>s+(w.front?0:this.demand(p,w,inp)),0),fxF:p.wh.reduce((s,w)=>s+(w.front?this.demand(p,w,inp):0),0),wheels:null}; }
  let out=null, fxS=0, fxR=0, duS=0; const A=this.align(), sc=Math.sin(A.caster), dW=p.wh.map(w=>this.steerOf(p,w,d,A)), PK=this.press(), flat=env.flat==null? -1 : env.flat;
  for(let k=0;k<n;k++){
   const Fz=env.Fz||this.loads(p,st.ax||0,st.ay||0,env.lift||0);   // 荷重: サスペンション (Susp) の計算があればそれ、無ければ釣り合いの式
   let FX=0, FY=0, MZ=0, fxW=0, fxRr=0, fxFf=0, sat=0, use=0, slide=false, lockAny=false; const wo=[];
   for(let i=0;i<p.wh.length;i++){ const w=p.wh[i], di=dW[i], c=Math.cos(di), s=Math.sin(di);
    const uF=u-st.r*w.py, vR=st.vy+st.r*w.px, vl=uF*c+vR*s, vt=-uF*s+vR*c;
    // 空気圧 (横の硬さ・グリップ)・パンク (横の硬さ 3 割・グリップ 6 割、潰れたタイヤを引きずる抵抗)
    const pk=PK[i], fl=i===flat, kC=pk.corn*(fl?this.FLAT.corn:1), kM=pk.mu*(fl?this.FLAT.mu:1);
    const fxd=this.demand(p,w,inp), f=this.wheel(p,vl,vt,Fz[i],this.SURF.road*muOf(i)*p.mu*kM,fxd,st.w[i],(env.camber?env.camber[i]:0)+(w.front? sc*di : 0),kC,h);   // キャスター: 切った向きへ車輪が傾く
    if(fl&&Math.abs(vl)>0.3){ const Fd=0.05*Fz[i]*Math.sign(vl); MZ+=w.py*Fd*c; }   // パンクした側が引きずられて、その側へ向きが変わる (エネルギーは Engine の転がり抵抗)
    const fxb=f.fx*c-f.fy*s, fyb=f.fx*s+f.fy*c;
    FX+=fxb; FY+=fyb; MZ+=w.px*fyb-w.py*fxb; fxR+=fxd; fxW+=f.fx; if(!w.front) fxRr+=f.fx; else fxFf+=f.fx;
    if(w.front) sat+=f.sat+f.fy*A.tm; use=Math.max(use,f.use); slide=slide||f.slide; lockAny=lockAny||f.lock;
    wo.push({Fz:Fz[i],fx:f.fx,fy:f.fy,use:f.use,slide:f.slide,lock:f.lock,front:w.front,px:w.px,py:w.py});
   }
   const FYt=FY; FY+=env.Fside||0; MZ+=(env.Fside||0)*(env.cpX!=null? env.cpX : p.cpX);   // 横風の力は風の力の中心に (角度で動く: VehDyn.cpAt)
   const vyDot=FY/p.m-u*st.r, rDot=MZ/p.Iz;
   duS+=st.vy*st.r+(FX-fxW)/p.m+(typeof cornerDrag==="function"? cornerDrag(p.m,FYt/(p.m*GRAV))/p.m : 0);   // 前後の速さの変わり方のうち Engine が数えない分: 車体が回ると横の速さが前後へ (スピン)、前輪の横の力の前後の成分。
   // (普通に曲がるときの分は Engine が曲がる抵抗 cornerDrag で数えているので、その分は戻す)
   st.vy+=vyDot*h; st.r+=rDot*h; st.ay=FY/p.m; st.ax=FX/p.m; fxS+=fxW;
   out={sat,use,slide,lockAny,wo,FYt,fxRr,fxFf};
  }
  st.vy=lerp(vyK,st.vy,kDyn); st.r=lerp(rK,st.r,kDyn);
  st.sat=out.sat*kDyn; st.use=out.use; st.slide=out.slide&&kDyn>0.5; st.lockAny=out.lockAny;
  return {fx:fxS/n, fxB:fxS/n, fxReq:fxR/n, du:duS/n*kDyn, ay:st.ay, fy:out.FYt, fxR:out.fxRr, fxF:out.fxFf, wheels:out.wo};
 },
 /* 前後の速さの更新: v Engine の速さ (0 以上)、dir ギアの向き (±1)、R step の戻り値。スピンして車体の向きと逆へ進む分 (前進のギアで後ろ向きに滑る) は
  st.ub [m/s] に持つ (Engine は止まっている扱い)。st.ub はタイヤの摩擦 (ブレーキ・ロック) と転がり抵抗で 0 へ戻る → 新しい v */
 long(st,v,dir,R,dt,crrA){
  const p=this.params(), du=R.du||0, a0=crrA==null? 0.12 : crrA;   // a0: 転がり抵抗の減速 [m/s²]
  if(st.ub&&v>0){ st.ub+=v*dir; v=0; }   // 後ろ向きに滑っている間にモーターで前へ押した分は、後ろ向きの速さを打ち消す
  if(st.ub){ const sg=Math.sign(st.ub); let ub=st.ub+(du+(R.fxB||0)/p.m)*dt-sg*a0*dt;
   if(Math.sign(ub)!==sg||Math.abs(ub)<0.02){ v=Math.max(0,v+Math.max(0,ub*dir)); ub=0; }
   st.ub=ub; return v; }
  const nv=v*dir+du*dt; if(nv*dir<0&&Math.abs(nv)>0.02&&Math.abs(st.vy)>0.5){ st.ub=nv; return 0; }   // 0 を越えて逆向き (横に滑りながら回っているとき)
  return Math.max(0,nv*dir);
 },
 /* 道の外の土。softAt: 柔らかさ 0〜1 (s 道のりの位置 [m]、out 道の端からの距離 [m])。路肩 (端から 1.5 m まで) は締まった砂利、
  その先は所々 (数十 m の斑) に柔らかい砂。決まった式なので同じ場所はいつも同じ */
 softAt(s,out){ if(!(out>1.5)) return 0; const n=0.5+0.3*Math.sin(s/23+1.3)+0.2*Math.sin(s/9.1+out*0.7)+0.12*Math.sin(s/4.3+2.1);
  return clamp((n-0.55)/0.3,0,1)*clamp((out-1.5)/2.5,0,1); },
 /* 沈み込み [m]: 柔らかいほど・遅いほど深く沈む (止まると約 7 cm)。沈むのは 0.8 秒、抜けるのは 0.3 秒ほど */
 sinkStep(z,v,sig,dt){ const zEq=(sig||0)*0.07/(1+Math.abs(v)/3); return z+(zEq-z)*clamp(dt/(zEq>z?0.8:0.3),0,1); },
 /* 土の転がり抵抗の係数 (舗装に足す分): 砂利 0.015・土 0.03 + 沈んだ分 (タイヤが前の土の壁を押し上げる)。7 cm 沈むと約 0.2 (モーターの力 ≈ 0.12 G では動けない) */
 soilCrr(out,z){ if(!(out>0)) return 0; return (out<1.5? 0.015 : 0.03)+0.75*(z||0)/this.params().wh[0].R; },
 /* ハンドルを戻すモーメントの目安 [N·m] (乾いた路面で、前輪がいちばん強く戻そうとするくらい)。反力の強さをこれで割って 0〜1 にする */
 satRef(){ const p=this.params(), Ff=p.wh.reduce((s,w)=>s+(w.front?w.share:0),0)*p.m*GRAV; return Math.max(1,p.mu*Ff*(this.TRAIL*0.385+this.align().tm)); },
 /* 横すべり角 (車体の向きと進む向きの差) [rad] */
 beta(st,u){ return Math.atan2(st.vy||0,Math.max(Math.abs(u),0.5)); },
};
