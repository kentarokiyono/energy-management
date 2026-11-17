"use strict";
/* 操縦の試験 (Node): タイヤの計算 (Tire) の車を、決まった道筋に沿って自動で運転する。
 座標: x 前 (始めの向き)・y 右。向き h は x 軸から右回り +。運転は道筋の曲がり具合を先読みして切り、ずれを戻す (Stanley 方式)。舵の速さは人並みに制限 */
module.exports=`globalThis.HT={
 /* o: {pts: 道筋の点 [[x,y],...] (無ければ舵角 delta を使う), delta: 舵角 [rad] または t→舵角, u: 速さ [m/s] (一定) または free (ブレーキ・駆動で変わる),
  u0, brake, drive [N], mu, Fside [N], tmax [s], stop: (状態)→true で終わり, dRate: 舵の速さ [rad/s], preview: 先読みの時間 [s], ffK・kE: 運転の強さ}
  susp: false でサスペンションなし (荷重は釣り合いの式)
  → {t, x, y, h, maxRoll (車体の傾きの最大 [rad]), maxBeta, maxUse, lockF (前輪が最初にロックした時刻), lockR, path: 間引いた軌跡 [[x,y,h]], wheels: 車輪の軌跡の最大の半径用} */
 run(o){
  const p=Tire.params(), st=Tire.init(), sp=Susp.init(), dt=0.01; let fyT=0; let x=o.x0||0, y=o.y0||0, h=o.h0||0, u=o.u!=null? o.u : o.u0, t=0, dl=0, iN=0;
  const r={maxBeta:0,maxUse:0,lockF:null,lockR:null,path:[],slideT:0};
  while(t<(o.tmax||60)){
   let dc=0;
   if(o.pts){ const P=o.pts, n=P.length; let bi=iN, bd=1e9; for(let k=iN;k<Math.min(n,iN+80);k++){ const d=(P[k][0]-x)**2+(P[k][1]-y)**2; if(d<bd){ bd=d; bi=k; } } iN=bi;
    if(bi>=n-3&&o.endStop) break;
    /* 道筋に沿う運転: 少し先 (約 0.25 秒) の道筋の曲がり具合で先に切り (先読み)、横のずれと向きのずれを戻す (Stanley 方式) */
    const ang=(k)=>{ const a=P[Math.max(0,Math.min(n-2,k))], b=P[Math.max(1,Math.min(n-1,k+1))]; return Math.atan2(b[1]-a[1],b[0]-a[0]); };
    const ds=Math.hypot(P[Math.min(n-1,bi+1)][0]-P[bi][0],P[Math.min(n-1,bi+1)][1]-P[bi][1])||0.25, pv=Math.round((o.preview==null?0.25:o.preview)*Math.abs(u)/ds), kp=Math.min(n-3,bi+pv);
    const kap=(()=>{ const s2=Math.max(2,Math.round(1/ds)); const d=ang(kp+s2)-ang(kp-s2); return Math.atan2(Math.sin(d),Math.cos(d))/(2*s2*ds); })();
    const th=ang(bi), eh=Math.atan2(Math.sin(th-h),Math.cos(th-h)), ex=x-P[bi][0], ey=y-P[bi][1], e=-Math.sin(th)*ex+Math.cos(th)*ey;   // e: 道筋より右 +
    dc=Math.atan(p.L*kap)*(o.ffK||1.15)+eh+Math.atan2(-(o.kE||1.5)*e,Math.abs(u)+1); }
   else dc= typeof o.delta==="function"? o.delta(t) : (o.delta||0);
   dc=clamp(dc,-p.steerMax,p.steerMax); const dr=(o.dRate||1.2)*dt; dl+=clamp(dc-dl,-dr,dr);
   const Fs=typeof o.Fside==="function"? o.Fside(t) : (o.Fside||0), env={mu:o.mu==null?1:o.mu,Fside:Fs};
   if(o.susp!==false){ Susp.step(sp,{ax:st.ax||0,Fy:fyT,Fside:Fs},dt); env.Fz=sp.Fz; env.camber=sp.camber; }   // サスペンション (走行と同じ)。susp:false で釣り合いの式
   const R=Tire.step(st,{u,delta:dl,brake:o.brake||0,drive:o.drive||0},env,dt); fyT=R.fy;
   if(o.u==null){ st.ax=R.fx/p.m; u=Math.max(0,u+R.fx/p.m*dt); }
   h+=st.r*dt; x+=(Math.cos(h)*u-Math.sin(h)*st.vy)*dt; y+=(Math.sin(h)*u+Math.cos(h)*st.vy)*dt; t+=dt;
   r.maxBeta=Math.max(r.maxBeta,Math.abs(Tire.beta(st,u))); r.maxRoll=Math.max(r.maxRoll||0,Math.abs(sp.ph||0)); r.maxUse=Math.max(r.maxUse,st.use||0); if(st.slide) r.slideT+=dt;
   if(R.wheels){ if(r.lockF==null&&R.wheels.some(w=>w.front&&w.lock)) r.lockF=t; if(r.lockR==null&&R.wheels.some(w=>!w.front&&w.lock)) r.lockR=t; }
   if(o.wheelR){ for(const w of p.wh){ const wx=x+Math.cos(h)*w.px-Math.sin(h)*w.py, wy=y+Math.sin(h)*w.px+Math.cos(h)*w.py; r.wx=r.wx||[]; r.wx.push([wx,wy]); } }
   if(Math.round(t/dt)%10===0) r.path.push([x,y,h]);
   if(o.stop&&o.stop({x,y,h,u,t})) break;
   if(o.u==null&&u<0.3) break;
  }
  return Object.assign(r,{t,x,y,h,u});
 },
};`;
