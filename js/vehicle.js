"use strict";
/* ============ 車両諸元の差し替え ============
 js/data/vehicle-private.js (git 管理外) が VEHICLE_PRIVATE を定義していれば、その値で
 車体形状 (和大型モノハル) と走行の物理 (質量・タイヤ・制動・操舵・横風・転倒余裕) を置き換える。
 ファイルが無いときは従来の汎用モデルのまま。値そのものはこのファイルに書かない。 */
const VEH=(()=>{
 const S=(typeof VEHICLE_PRIVATE!=="undefined"&&VEHICLE_PRIVATE)||null;
 const v={active:!!S, spec:S||{}};
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
 /* 静的な転倒余裕 SSF = トレッド / (2·重心高) から求める横加速度の限界 [m/s²] */
 tipAccel(){ const C=VEH.spec.chassis; return (C.ssf||(C.cgTread/(2*C.cgHeight)))*9.81; },
};
