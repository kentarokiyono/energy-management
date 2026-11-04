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
