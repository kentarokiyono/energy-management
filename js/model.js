"use strict";
/* ============ 車の物理モデル (日射・気温・風・走行抵抗・駆動電力・発電・電池) ============
 走行 (Engine.step) と戦略の先読み (Strategy.simulate) が同じ式を使う。
 値は引数と車両の諸元 (P・PRO・VEH) だけで決まる (Engine.st や画面には頼らない)。tests/model.js が Node で直接確かめる */
const Model={
 GUST_SD:0.35,   // 突風の揺らぎ (風速に対する比の標準偏差。Engine の OU 過程の定常分布)
 DIR_SD:0.30,    // 風向の揺らぎ [rad]

 /* 気温 [°C]: 2025 年の天気を使うときはその値、無ければ気候値 */
 ambient(lat,lon,doy,hour){
  const t=RealWx.on()? RealWx.at("t",lat,lon,doy,hour) : null;
  return t!=null? t+PRO.tempOffset : ambientTemp(lat,hour);
 },

 /* 平均の風 (車高 ~1 m)。ms 風速 [m/s]・toward 吹いていく方位 [rad]・gK 突風の効き (風速の揺らぎ = ms·gK·GUST_SD)・dK 風向の揺らぎの効き */
 wind(lat,lon,doy,hour){
  const rw=RealWx.on()&&RealWx.wind(lat,lon,doy,hour);
  if(rw) return {ms:Math.max(0,rw.ws*0.6),toward:rw.toward,gK:0.5,dK:0.3};
  const wc=Phys.windClim(lat,hour);
  return {ms:PRO.windBase*wc.f*0.6,toward:wc.toward,gK:1,dK:1};   // 10 m → 車高へ対数則で換算 (×0.6)
 },

 /* 進む向き (bearing) に対する風。head 向かい風 + / cross 右へ吹く + [m/s]。
  w.sd を付けると揺らぎの期待値: head は平均、h2 = 向かい風の 2 乗の期待値の増分 (空気抵抗は (v+head)² の期待値で効く) */
 relWind(w,bearing){
  const phi=w.toward-bearing+Math.PI;
  if(!w.gK) return {head:w.ms*Math.cos(phi),cross:w.ms*Math.sin(phi),varH:0};
  const sd=this.DIR_SD*w.dK, ec=Math.exp(-sd*sd/2), gs=this.GUST_SD*w.gK;
  const head=w.ms*Math.cos(phi)*ec, cross=w.ms*Math.sin(phi)*ec;
  const ws2=w.ms*w.ms*(1+gs*gs), c2=(1+Math.cos(2*phi)*Math.exp(-2*sd*sd))/2;
  return {head,cross,varH:Math.max(0,ws2*c2-head*head)};
 },

 /* 日射 [W/m²]。o = {lat, lon, elev, doy, hour, tilted, tiltDeg, cloud (雲: 日射の倍率 0〜1, 無ければ晴れ), real (2025 年の天気: {shift 時刻のずれ [h], scale 強さの倍率}), k (全体の倍率)}
  → {G パネル面, alt, az, ghi, dni} */
 irradiance(o){
  const sp=Phys.sunPos(o.lat,o.lon,o.doy,o.hour), alt=sp.alt, az=sp.az;
  if(alt<=0) return {G:0,alt:0,az,ghi:0,dni:0};
  let {dni,dhi}=Phys.clearSky(alt,o.elev,o.doy);
  if(o.real){ const hh=o.hour+(o.real.shift||0), k=o.real.scale==null?1:o.real.scale;
   const d=RealWx.at("dni",o.lat,o.lon,o.doy,hh+0.5), f=RealWx.at("dhi",o.lat,o.lon,o.doy,hh+0.5);
   if(d!=null&&f!=null){ dni=d*k; dhi=f*(0.5+0.5*k); } }
  else if(o.cloud!=null){ const wf=o.cloud; dni*=wf; dhi*=(2-wf)*(0.5+0.5*wf); }
  const cz=Math.sin(alt), ghi=dni*cz+dhi;
  let G;
  if(o.tilted){   // 傾けて充電: パネルを太陽の方位へ向ける
   const tiltR=(o.tiltDeg==null?40:o.tiltDeg)*Math.PI/180, cosInc=Math.max(0,Math.cos(Math.PI/2-alt-tiltR));
   G=dni*cosInc*Phys.iam(cosInc)+dhi*(1+Math.cos(tiltR))/2*0.95+PRO.albedo*ghi*(1-Math.cos(tiltR))/2*0.9;
  } else G=dni*cz*Phys.iam(cz)+dhi*0.95;
  const k=o.k==null?1:o.k;
  return {G:Math.max(0,G)*k,alt,az,ghi:ghi*k,dni:dni*k};
 },

 /* 発電 [W] (MPPT 出力)。Tcell: セル温度 [°C] (高いほど効率が落ちる) */
 pv(G,alt,tilted,Tcell){
  const gamma=PANEL_TYPES[P.panel].gamma, tempLoss=clamp(1-gamma*Math.max(0,Tcell-25),0.6,1);
  return P.arrayArea*P.cellEff*tempLoss*P.mpptEff*G*PVLoss.k(alt,tilted)*PRO.solarScale;
 },
 /* 定常のセル温度で発電 [W]。airV: パネルの上を流れる風 [m/s] (走行中 = 車速 + 向かい風) */
 pvSteady(G,alt,tilted,Tamb,airV){ return this.pv(G,alt,tilted,cellTempSS(Tamb,G,airV,tilted)); },

 /* 走行抵抗 [N]。e = {m, grade (tan), head, varH, cross, rho, gLat, crrK (パンクなど), aeroK (破損など)}
  → {roll (鉄損・前輪のトーとキャンバーの抵抗を含む), drag, slope, corner, total, yaw [rad]} */
 resist(v,e){
  const m=e.m, th=Math.atan(e.grade||0), rho=e.rho||1.17;
  const T=typeof Tire!=="undefined"? Tire : null;
  const roll=(e.crrK||1)*(T? T.crrK() : 1)*Phys.crr(v)*m*GRAV*Math.cos(th)+motorIronW(v)/Math.max(v,0.5)+(T? T.alignDrag(m) : 0);   // 空気圧の倍率、+ トー・キャンバーの抵抗
  const cross=e.cross||0, yaw=Math.atan2(Math.abs(cross),Math.max(v,1));
  const va=Math.max(0,v+(e.head||0)), va2=va*va+(e.varH||0);
  const drag=0.5*rho*P.Cd*cdYawFactor(yaw)*(e.aeroK||1)*P.frontal*va2;
  const slope=m*GRAV*Math.sin(th), corner=cornerDrag(m,e.gLat||0);
  return {roll,drag,slope,corner,total:roll+drag+slope+corner,yaw};
 },

 /* 一定速度 v で駆動力 F [N] を出し続けるのに要る電池側の電力 [W] (= 電池電圧 × 電流、motorModel と同じ式)。
  ok: 電流・相電流・電圧の範囲に収まる */
 motorSteady(F,v,soc,power){
  const mp=motorParams(power), Vb=Number.isFinite(soc)? VOC(soc) : soc.Vb, ke=(PRO.motorVnom||96)/(mp.rpm/60*2*Math.PI*PRO.tireR);
  // 相電流 Iph = F/kt。電池の電流 I は相側の電力 (逆起電力 + 銅損) とコントローラ損失から。電力は走行と同じく 力×速度 + 銅損 + 損失
  const Iph=F/mp.kt, Pcu=Iph*Iph*mp.R, I=(ke*v*Iph+Pcu+PRO.ctrlW)/(0.99*Math.max(1,Vb));
  const phaseMax=PRO.phaseMaxA>0? PRO.phaseMaxA : 2*motorMaxA(power);
  return {P:F*v+Pcu+PRO.ctrlW+0.01*Vb*I,I,ok:Iph<=phaseMax&&ke*v+Iph*mp.R<=Vb&&I<=motorMaxA(power)};
 },
 /* 下りで速度を保つ回生 (ブレーキ力 B [N]) → 電池へ戻る電力 [W] (regenModel と同じ式) */
 regenSteady(B,v,soc,power){
  if(!(P.regenStrength>0)||B<=0) return 0;
  const mp=motorParams(power), ke=(PRO.motorVnom||96)/(mp.rpm/60*2*Math.PI*PRO.tireR), E=ke*Math.max(0,v);   // (soc は使わない: 回生は逆起電力で決まる)
  const Ir=Math.min(B/mp.kt,P.regenStrength*motorMaxA(power),Math.max(0,E/mp.R*0.5));
  return Math.max(0,(E-Ir*mp.R)*Ir*PRO.regenEff-(Ir>0.5?PRO.ctrlW:0));
 },

 /* 一定速度で走るモーターの電力 [W] (+ 消費 / − 回生)。補機は含まない。消費の補正 LossK を掛ける。
  ECO で出せなければ POWER モード */
 cruisePower(v,e){
  const F=this.resist(v,e).total, soc= e.Vb? {Vb:e.Vb} : e.soc==null?0.6:e.soc;   // e.Vb: 電池電圧が分かっていれば (先読みで同じ区間を何度も計算するとき)
  if(F<=0) return -this.regenSteady(-F,v,soc,false);
  let r=this.motorSteady(F,v,soc,false); if(!r.ok){ const p=this.motorSteady(F,v,soc,true); if(p.ok||p.P<r.P) r=p; }
  return r.P*LossK.k();
 },

 /* 電池: 端子電力 Pnet [W] (+ 放電) を dtS 秒 → {soc, I [A], R [Ω]}。内部抵抗の損失・開放電圧の変化を含む */
 battStep(soc,Tbat,Pnet,dtS){
  const Voc=VOC(soc), R=Phys.rInt(Tbat,soc), I=Phys.battCurrent(Voc,R,Pnet);
  return {soc:soc-I*(I<0?0.995:1)*dtS/(CAP_AH()*3600),I,R,Voc};
 },
 /* 電池温度の定常値 [°C] (ジュール熱と走行風の放熱がつり合う) */
 battTempSS(Tamb,I,R,v){ return Tamb+I*I*R/(PRO.battUA*(1+0.04*Math.max(0,v))); },
};
