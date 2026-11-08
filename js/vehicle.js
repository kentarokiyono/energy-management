"use strict";
const VEH_PRIV_REV=6;   // vehicle-private.js の必要な版 (rev)。古い版は設定画面で警告
/* ============ 車両諸元の差し替え ============
 js/data/vehicle-private.js (git 管理外) が VEHICLE_PRIVATE を定義していれば、その値で
 車体形状 (和大型モノハル) と走行の物理 (質量・タイヤ・制動・操舵・横風・転倒余裕) を置き換える。
 ファイルが無いときは従来の汎用モデルのまま。値そのものはこのファイルに書かない。 */
const VEH=(()=>{
 const S=(typeof VEHICLE_PRIVATE!=="undefined"&&VEHICLE_PRIVATE)||null;
 const v={active:!!S, spec:S||{}, rev:(S&&S.rev)||0, revNeed:VEH_PRIV_REV};
 if(!S) return v;
 const M=S.mass||{}, T=S.tyre||{}, B=S.brake||{}, A=S.aero||{};
 if(M.dry!=null) P.massDry=M.dry;
 if(M.driver!=null) P.massDriver=M.driver;
 if(T.radius!=null) PRO.tireR=T.radius;
 if(T.crr!=null) P.Crr=T.crr;
 // 制動距離 d = k1·v + k2·v² [m, v km/h] の v² 項 → 減速度 a = 1/(2·k2·3.6²)
 if(B.k2) PRO.brakeMu=1/(2*B.k2*3.6*3.6)/9.81;
 if(A.Cd!=null){ P.Cd=A.Cd; BODY_SHAPES.wadai.Cd=A.Cd; }
 if(A.frontal!=null){ P.frontal=A.frontal; BODY_SHAPES.wadai.frontal=A.frontal; }
 if(S.battery&&S.battery.Wh!=null) P.batteryWh=S.battery.Wh;
 // モーター: 無負荷回転数 (公称電圧) から逆起電力係数を出し、力定数 kt を同じ値にそろえる (電力の収支が合う)
 const Mo=S.motor;
 if(Mo){ if(Mo.noLoadRpm) PRO.noLoadRpm=Mo.noLoadRpm; if(Mo.rWinding) PRO.rWinding=Mo.rWinding; if(Mo.phaseMaxA) PRO.phaseMaxA=Mo.phaseMaxA;
  if(Mo.ironK1!=null) PRO.ironK1=Mo.ironK1; if(Mo.ironK2!=null) PRO.ironK2=Mo.ironK2; if(Mo.ctrlW!=null) PRO.ctrlW=Mo.ctrlW;
  PRO.kt=(Mo.vNom||96)/(PRO.noLoadRpm/60*2*Math.PI)/PRO.tireR; PRO.motorVnom=Mo.vNom||96;
  // パワーモード: 無負荷回転数を上げた (逆起電力係数が小さい) 特性。力定数も同じ比で小さくなる
  if(Mo.powerNoLoadRpm){ PRO.rpmPower=Mo.powerNoLoadRpm; PRO.ktPower=PRO.kt*PRO.noLoadRpm/Mo.powerNoLoadRpm; }
  if(Mo.ecoMaxA&&Mo.powerMaxA) { PRO.modeMaxA=[Mo.ecoMaxA,Mo.powerMaxA]; P.motorMaxA=Mo.ecoMaxA; } }
 const So=S.solar; if(So){ if(So.area) P.arrayArea=So.area; if(So.cellEff) P.cellEff=So.cellEff; if(So.mpptEff) P.mpptEff=So.mpptEff; }
 const Ba=S.battery; if(Ba&&Ba.series){ PRO.vFull=Ba.series*(Ba.cellVmax||4.2); PRO.vEmpty=Ba.series*(Ba.cellVmin||3.0);
  if(Ba.cellAh) P.batteryWh=Math.round(Ba.series*Ba.parallel*Ba.cellAh*(Ba.cellVnom||3.7)); }
 if(S.label) BODY_SHAPES.wadai.desc=S.label;
 return v;
})();
/* 自分の車の発電の補正: 太陽の高さ別の効率 (平置き: パネルの曲面・影・浅い角度の反射など、モデルに無い損失) と、傾けたときの倍率。
 優先: 分析画面の合わせ込み (設定 pvAltS・pvTiltK) → 諸元 (vehicle-private.js の solar.altLoss・tiltK・effK) → 補正なし。
 表は太陽の高さ 0°, 10°, … 80° の 9 点 (高い所を 1 として相対)。他チームの車には使わない */
const PVLoss={
 _s:null, _v:null,
 curve(){ const s=P.pvAltS||""; if(s!==this._s){ this._s=s; let a=null; try{ a=JSON.parse(s); }catch(e){} this._v= Array.isArray(a)&&a.length===9&&a.every(x=>Number.isFinite(x)&&x>0&&x<=1.5)? a : null; }
  if(this._v) return this._v; const S=VEH.active&&VEH.spec.solar; return S&&Array.isArray(S.altLoss)&&S.altLoss.length===9? S.altLoss : null; },
 k(alt,tilted){ const S=(VEH.active&&VEH.spec.solar)||{}, eff= this.curve()&&!P.pvAltS? (S.effK||1) : 1;
  if(tilted){ const t= Number.isFinite(P.pvTiltK)&&P.pvTiltK!==1? P.pvTiltK : (S.tiltK||1); return t*eff; }
  const c=this.curve(); if(!c) return eff; const d=clamp((alt||0)*180/Math.PI/10,0,8), i=Math.min(7,Math.floor(d)); return (c[i]+(c[i+1]-c[i])*(d-i))*eff; },
};
/* 走行の消費の補正 (モデルに無い損失: 駆動系・タイヤ・配線など)。優先: 分析画面の合わせ込み (設定 lossK) → 諸元 (lossK) → 1 */
const LossK={ k(){ if(Number.isFinite(P.lossK)&&P.lossK!==1) return clamp(P.lossK,0.7,1.5); const v=VEH.active&&VEH.spec.lossK; return Number.isFinite(v)? clamp(v,0.7,1.5) : 1; } };
/* 横転の計算に使う一般的な値 (諸元が無いとき・諸元に無い項目)。実車の値ではない */
const ROLL_DEF={ssf:1.2, hold:1500, chassis:{cgHeight:0.42, cgTread:1.0, wheels:4}, aero:{sideArea:2.5, Cy:1.0, CyBeta:1.0, ClCross:0.3, cpK:1.25}};
/* 走行の挙動 (諸元があるときだけ使う) */
const VehDyn={
 /* 操舵: 前輪舵角 δ (最大舵角とタイヤのグリップで制限) → ヨーレート = v·tanδ / ホイールベース */
 yawRate(steer,v){
  const C=VEH.spec.chassis, vS=Math.max(v,1);
  const dLim=Math.min(C.steerMax||0.5, Math.atan((C.mu||0.8)*9.81*C.wheelbase/(vS*vS)));
  return v*Math.tan(steer*dLim)/C.wheelbase;
 },
 /* 横風による横方向の加速度 [m/s², 右 +] (横からの風速成分 crossR: 右へ吹く向きが +) */
 sideAccel(crossR,rho,m){
  const A=VEH.spec.aero||{};
  return 0.5*rho*(A.Cy||1.0)*(A.sideArea||2.5)*crossR*Math.abs(crossR)/m;
 },
 /* 横転の危険度 (1 で片側の車輪が浮く = 横転)。転倒させるモーメント ÷ 踏ん張るモーメント
  ・横風の横力: 車の速度と合わせた相対風で計算 (走っているほど大きい → 減速・停車が効く)。力のかかる高さ = 重心より上
  ・浮き上がり: パネル (上面) を横切る風の揚力。重さを減らし、風上側がより浮く
  ・旋回: ハンドル操作 (車線変更・当て舵を含む) の横加速度。重心の高さにかかる
  ・加減速: 前後の荷重移動で、横方向に踏ん張れる幅が狭くなる
  諸元 (vehicle-private.js) があればその値。無いときは一般的な値 */
 roll(es,crossR,v,shield){
  const C=Object.assign({},ROLL_DEF.chassis,VEH.spec.chassis||{}), A=Object.assign({},ROLL_DEF.aero,VEH.spec.aero||{});
  const g=9.81, m=massTotal(), rho=es.lastRho||1.17, h=C.cgHeight, half= C.cgTread? C.cgTread/2 : (C.ssf||ROLL_DEF.ssf)*h;
  const c=Math.abs(crossR)*(shield?0.5:1), vr=Math.hypot(v,c), W=carDims()[1], hold=shield? ROLL_DEF.hold : 0;   // 風よけ: 誘導車・追走車が風上で風を弱める (風速半分)。クルーが押さえる力 [N]
  const Fy=Math.sign(crossR)*0.5*rho*A.sideArea*(c*vr*A.Cy+A.CyBeta*c*Math.max(0,v));   // 右 +
  const L=0.5*rho*A.ClCross*(A.topArea||P.arrayArea)*c*c;
  const Mw=Fy*h*A.cpK+Math.sign(crossR)*L*W/4;   // 横風: 横力 + 風上側の浮き上がり
  const Mc=-m*(es.gLat||0)*g*h;   // 旋回の遠心力 (右 +)
  const R=Math.max(1,m*g+hold-L)*half*clamp(1-(C.wheels===3?0.6:0.25)*Math.abs(es.gLong||0),0.4,1);
  const M=Mw+Mc; return {risk:Math.abs(M)/R,dir:Math.sign(M)||1,wind:Math.abs(Mw)/R,turn:Math.abs(Mc)/R,lift:L}; },
 /* 静的な転倒余裕 SSF = トレッド / (2·重心高) から求める横加速度の限界 [m/s²] */
 tipAccel(){ const C=VEH.spec.chassis; return (C.ssf||(C.cgTread/(2*C.cgHeight)))*9.81; },
};
