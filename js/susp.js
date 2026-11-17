"use strict";
/* ============ サスペンション (ばね・ダンパー・アームの幾何) ============
 車体 (ばね上) の上下・前後の傾き (ピッチ)・左右の傾き (ロール) を、車輪ごとのばねとダンパーで計算する。
 ・前輪: ダブルウィッシュボーン (アッパーアーム・ロアアーム・アップライト)。アームの長さと取り付け位置から
   ロールセンター (横の力がアームを通って直接伝わる高さ) と、ストロークによるキャンバー (車輪の傾き)・横ずれを出す
 ・後輪: スイングアーム (前に軸がある片持ちのアーム。インホイールモーター)
 ・荷重 = 静止の荷重 + ばね・ダンパーの力 + アームを通る分 (ロールセンターの高さの分は遅れなく移る)
   ばねを通る分は車体が傾くまで遅れて移る (切り始め・ブレーキの踏み始めは荷重の移り方がなめらか)
 ・加減速による沈み込みは、実際の加速度 (速度の変化) から。止まってブレーキを踏んでも沈まない
 値: 既定 (一般的な値) → 諸元 (vehicle-private.js の susp) → 設定 (P.susp、車両・チームの設定「足回り」) の順に上書き。
 座標は Tire と同じ (前 + / 右 +、上 +)。ストローク c はばねが縮む向きが +。ピッチ th は機首上げ +、ロール ph は右が下がる向き + */
const Susp={
 /* fHz・rHz: 前・後のばね上の固有振動数 [Hz] (ばねの硬さ)、zeta: 減衰比、lowerL・upperL: 前のロア・アッパーアームの長さ [m]、
  upH: アップライトの上下のボールジョイントの間隔 [m]、upTilt: アッパーアームの内側の取り付けの高さ (外側との差、− で内側が低い) [m]、
  swingL: 後ろのスイングアームの長さ [m]、mr: ばねのレバー比 (ロアアームの何割の所に付くか)、travel: ストロークの限界 (± [m]) */
 DEF:{fHz:2.4, rHz:2.2, zeta:0.35, lowerL:0.30, upperL:0.22, upH:0.20, upTilt:-0.04, swingL:0.45, mr:0.6, travel:0.06},
 TUNE:[["fHz","前のばね (固有振動数)","Hz",1,4,0.1],["rHz","後ろのばね (固有振動数)","Hz",1,4,0.1],["zeta","ダンパー (減衰比)","",0.1,1,0.05],
  ["lowerL","ロアアームの長さ","m",0.15,0.5,0.01],["upperL","アッパーアームの長さ","m",0.1,0.5,0.01],["upH","アップライトの高さ (ボールジョイントの間隔)","m",0.1,0.3,0.01],
  ["upTilt","アッパーアームの内側の高さ (外側との差)","m",-0.1,0.1,0.01],["swingL","後ろのスイングアームの長さ","m",0.2,0.8,0.01],["mr","ばねのレバー比","",0.3,1,0.05],["travel","ストロークの限界 (片側)","m",0.02,0.12,0.005]],
 H:0.004,
 val(k){ const o=P.susp&&typeof P.susp==="object"? P.susp : {}, S=(typeof VEH!=="undefined"&&VEH.active&&VEH.spec.susp)||{}, T=this.TUNE.find(t=>t[0]===k);
  let v=Number.isFinite(+o[k])&&o[k]!==""&&o[k]!=null? +o[k] : Number.isFinite(S[k])? S[k] : this.DEF[k];
  return T? clamp(v,T[3],T[4]) : v; },
 set(k,v){ const T=this.TUNE.find(t=>t[0]===k); if(!T) return; P.susp=Object.assign({},P.susp&&typeof P.susp==="object"?P.susp:{}); if(v===""||v==null) delete P.susp[k]; else P.susp[k]=clamp(+v,T[3],T[4]); this._p=null; Settings.save(); },
 reset(){ P.susp={}; this._p=null; Settings.save(); },

 /* 車の値 (Tire の車輪の配置・荷重の配分を使う) */
 _p:null, _key:"",
 params(){
  const tp=Tire.params(), key=tp.m+"|"+JSON.stringify(P.susp||{})+"|"+tp.wh.length;
  if(this._p&&this._key===key) return this._p;
  const v=k=>this.val(k), m=tp.m, g=GRAV;
  const wh=tp.wh.map(w=>{ const mi=w.share*m, f=w.front? v("fHz") : v("rHz"), k=(2*Math.PI*f)**2*mi;
   return {px:w.px, py:w.py, front:w.front, R:w.R, k, lat:w.lat, c:2*v("zeta")*Math.sqrt(k*mi), F0:mi*g, geo:w.front? this.wishbone(w,v) : this.swing(w,v)}; });
  // ロールセンター: 前は幾何から、後ろ (スイングアーム) は軸の高さ。重心の位置での高さ (ロール軸)
  const rcF=wh.filter(w=>w.front).map(w=>w.geo.rc), hF=rcF.length? rcF.reduce((a,b)=>a+b,0)/rcF.length : 0;
  const rr=wh.filter(w=>!w.front), hR=rr.length? rr.reduce((a,w)=>a+w.geo.rc,0)/rr.length : 0, hRA=hF*(tp.b/tp.L)+hR*(tp.a/tp.L);
  return this._key=key, this._p={m, h:tp.h, L:tp.L, Iy:tp.Iz*0.9, Ix:m*0.4*0.4, wh, hRA, hF, travel:v("travel"), mr:v("mr")};
 },
 /* 前輪のダブルウィッシュボーン (正面から見た 2 次元、外向き +・上 +、接地点が原点)。ストロークごとの表 (キャンバー・横ずれ・各点の位置) を作る */
 wishbone(w,v){
  const R=w.R, lo={y:-0.02,z:R-v("upH")/2}, up={y:-0.05,z:R+v("upH")/2};   // 外側のボールジョイント (少し内側に倒したキングピン)
  const li={y:lo.y-v("lowerL"),z:lo.z}, ui={y:up.y-v("upperL"),z:up.z+v("upTilt")};   // 内側の取り付け (車体側)
  const Ll=Math.hypot(lo.y-li.y,lo.z-li.z), Lu=Math.hypot(up.y-ui.y,up.z-ui.z);
  const U=Math.hypot(up.y-lo.y,up.z-lo.z), wc={y:0,z:R}, a0=Math.atan2(up.z-lo.z,up.y-lo.y);
  const rel=(p,q)=>({y:q.y-p.y,z:q.z-p.z});
  const cw=rel(lo,wc), cp={y:0-lo.y,z:0-lo.z};   // 車輪の中心・接地点 (アップライトに固定)
  const solve=(al)=>{ const L1={y:li.y+Ll*Math.cos(al),z:li.z+Ll*Math.sin(al)};   // ロアアームの角度 → 外側の下の点
   const dx=ui.y-L1.y, dz=ui.z-L1.z, d=Math.hypot(dx,dz); if(d>Lu+U||d<Math.abs(Lu-U)) return null;
   const a=(U*U-Lu*Lu+d*d)/(2*d), hh=Math.sqrt(Math.max(0,U*U-a*a)), mx=L1.y+dx*a/d, mz=L1.z+dz*a/d;
   const U1={y:mx-dz*hh/d,z:mz+dx*hh/d}, U2={y:mx+dz*hh/d,z:mz-dx*hh/d}, Uj= U1.z>U2.z? U1 : U2;   // 上側の解
   const rot=Math.atan2(Uj.z-L1.z,Uj.y-L1.y)-a0, cs=Math.cos(rot), sn=Math.sin(rot), tr=p=>({y:L1.y+p.y*cs-p.z*sn,z:L1.z+p.y*sn+p.z*cs});
   return {L1,U1:Uj,rot,wc:tr(cw),cp:tr(cp)}; };
  const at=(c)=>{ let a=-0.6,b=0.6; for(let i=0;i<40;i++){ const m=(a+b)/2, s=solve(m); if(!s||s.wc.z-R<c) a=m; else b=m; } return solve((a+b)/2); };
  const N=24, T=v("travel")*1.5, tab=[]; for(let i=0;i<=N;i++){ const c=-T+2*T*i/N, s=at(c); tab.push({c,camber:-s.rot,scrub:s.cp.y,L1:s.L1,U1:s.U1,wc:s.wc}); }   // camber: 上が外へ傾く向き +
  // ロールセンター (静止): アームの延長の交点 (瞬間中心) と接地点を結ぶ線が、車の中心を通る高さ
  const ix=(p1,p2,p3,p4)=>{ const d=(p1.y-p2.y)*(p3.z-p4.z)-(p1.z-p2.z)*(p3.y-p4.y); if(Math.abs(d)<1e-9) return null; const t=((p1.y-p3.y)*(p3.z-p4.z)-(p1.z-p3.z)*(p3.y-p4.y))/d; return {y:p1.y+t*(p2.y-p1.y),z:p1.z+t*(p2.z-p1.z)}; };
  const ic=ix(li,lo,ui,up), half=Math.abs(w.py), rc= ic&&Math.abs(ic.y)>1e-6? clamp(-half*ic.z/ic.y,-0.2,0.4) : 0;
  return {kind:"wishbone",li,ui,lo,up,tab,rc,ic};
 },
 /* 後輪のスイングアーム: 軸は車輪の中心の高さ、swingL だけ前 */
 swing(w,v){ const L=v("swingL"); return {kind:"swing",L,rc:w.R,pivot:{x:L,z:w.R}}; },
 /* 表からストローク c [m] での値 */
 geoAt(w,c){ const t=w.geo.tab; if(!t) return null; const T=t[t.length-1].c, f=clamp((c+T)/(2*T),0,1)*(t.length-1), i=Math.min(t.length-2,Math.floor(f)), r=f-i, A=t[i], B=t[i+1], L=(a,b)=>a+(b-a)*r, LP=(a,b)=>({y:L(a.y,b.y),z:L(a.z,b.z)});
  return {camber:L(A.camber,B.camber),scrub:L(A.scrub,B.scrub),L1:LP(A.L1,B.L1),U1:LP(A.U1,B.U1),wc:LP(A.wc,B.wc)}; },

 init(){ return {z:0,zd:0,th:0,thd:0,ph:0,phd:0,c:null,cd:null,Fz:null,camber:null}; },
 /* 1 フレーム進める。inp: {ax 前への加速度 [m/s²] (実際の速度の変化)、Fy タイヤの横力の合計 [N, 右 +]、Fside 横風の横力 [N]、lift 浮き上がり [N]、
  hcp 横風の力の高さ [m]} → st.Fz (車輪ごとの荷重 [N])・st.c (ストローク)・st.camber (路面に対する車輪の傾き [rad]、右へ傾く向き +) */
 step(st,inp,dt){
  const p=this.params(), n=Math.max(1,Math.min(25,Math.ceil(dt/this.H))), h=dt/n, ax=inp.ax||0, Fy=inp.Fy||0, Fw=inp.Fside||0, hcp=inp.hcp!=null? inp.hcp : p.h*1.25;
  const Mpitch=p.m*ax*p.h;                                  // 加速で機首上げ (+)
  const Mroll=-Fy*(p.h-p.hRA)+Fw*(hcp-p.h);                  // 右へ曲がる (右向きの力) と左 (外) へ傾く
  const nW=p.wh.length; if(!st.c||st.c.length!==nW){ st.c=new Array(nW).fill(0); st.cd=new Array(nW).fill(0); st.Fs=new Array(nW).fill(0); }
  for(let k=0;k<n;k++){
   let Fz=0, My=0, Mx=0;
   for(let i=0;i<nW;i++){ const w=p.wh[i];
    let c=-st.z-st.th*w.px+st.ph*w.py, cd=-st.zd-st.thd*w.px+st.phd*w.py;
    let F=w.k*c+w.c*cd;
    if(Math.abs(c)>p.travel){ F+=Math.sign(c)*(Math.abs(c)-p.travel)*w.k*8; }   // バンプラバー (ストロークの端で急に硬くなる)
    if(F<-w.F0) F=-w.F0;                                                         // 車輪が浮く (ばねは引っ張れない)
    st.c[i]=c; st.cd[i]=cd; st.Fs[i]=F; Fz+=F; My+=F*w.px; Mx+=-F*w.py; }
   st.zd+=(Fz/p.m)*h; st.thd+=((My+Mpitch)/p.Iy)*h; st.phd+=((Mx+Mroll)/p.Ix)*h;
   st.z+=st.zd*h; st.th+=st.thd*h; st.ph+=st.phd*h;
   if(!Number.isFinite(st.z+st.th+st.ph)){ Object.assign(st,this.init()); return this.step(st,inp,dt); }
  }
  // 荷重: 静止 + ばね・ダンパー + アームを通る横の荷重移動 (ロール軸の高さの分) − 浮き上がり
  const geoM=Fy*p.hRA;
  st.Fz=p.wh.map((w,i)=>Math.max(0, w.F0+st.Fs[i]-(inp.lift||0)*(w.F0/(p.m*GRAV))+w.lat*geoM));
  // キャンバー (路面に対して、右へ傾く向き +): アームの幾何 (外向き +) を右向きに直し、車体のロールを足す
  st.camber=p.wh.map((w,i)=>{ const g=w.geo.tab? this.geoAt(w,st.c[i]).camber : 0; return (w.py>=0? g : -g)+st.ph; });
  return st;
 },
};
