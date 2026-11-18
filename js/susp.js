"use strict";
/* ============ サスペンション (ばね・ダンパー・アームの幾何) ============
 車体 (ばね上) の上下・前後の傾き (ピッチ)・左右の傾き (ロール) を、車輪ごとのばねとダンパーで計算する。
 ・前輪: ダブルウィッシュボーン (アッパーアーム・ロアアーム・アップライト) + マウンテンバイク用のエアサス (縮むほど硬い)。アームの長さと取り付け位置から
   ロールセンター (横の力がアームを通って直接伝わる高さ) と、ストロークによるキャンバー (車輪の傾き)・横ずれを出す
 ・後輪: 片持ち。上下 2 本の非対称な V 字のアーム (下はサスのブラケットで A 字。アップライトはインホイールモーターに直付け) + コイルばね。アンチスクワット・アンチリフト
 ・荷重 = 静止の荷重 + ばね・ダンパーの力 + アームを通る分 (ロールセンターの高さの分は遅れなく移る)
   ばねを通る分は車体が傾くまで遅れて移る (切り始め・ブレーキの踏み始めは荷重の移り方がなめらか)
 ・加減速による沈み込みは、実際の加速度 (速度の変化) から。止まってブレーキを踏んでも沈まない
 ・ばね下 (車輪側の重さ) とタイヤの縦のばねも計算する。路面の凸凹・キャトルグリッドで車輪が跳ね、跳ねている間はタイヤの荷重 (グリップ) が抜ける
 値: 既定 (一般的な値) → 諸元 (vehicle-private.js の susp) → 設定 (P.susp、車両・チームの設定「足回り」) の順に上書き。
 座標は Tire と同じ (前 + / 右 +、上 +)。ストローク c はばねが縮む向きが +。ピッチ th は機首上げ +、ロール ph は右が下がる向き + */
const Susp={
 /* fHz・rHz: 前・後のばね上の固有振動数 [Hz] (ばねの硬さ)、zeta: 減衰比、lowerL・upperL: 前のロア・アッパーアームの長さ [m]、
  upH: アップライトの上下のボールジョイントの間隔 [m]、upTilt: アッパーアームの内側の取り付けの高さ (外側との差、− で内側が低い) [m]、
  後ろ (片持ち): 上下とも非対称な V 字のアーム (アップライト側 1 点、車体側 2 点。片方の脚はまっすぐ前、もう片方は斜め前の車体側へ)。
   swingL 下のアームの長さ・rLinkL 上のアームの長さ (前後方向)・rVw V の開き (車体側の 2 点の左右の間隔)・rUpH アップライト (インホイールモーターに直付け) の下の点から上の点まで [m]、
  rLowDz・rUpDz: 車体側の軸の高さ (車輪側との差、+ で前が高い) [m]、rearSide: アームが付く側 (運転席から見て "R" 右 / "L" 左)、
  mr: ばねのレバー比 (下のアームの何割の所に付くか)、travel: ストロークの限界 (± [m])、
  fAirL: 前のエアサス (マウンテンバイク用) の空気室の長さ (車輪の動きに換算 [m])。短いほど縮んだときに急に硬くなる。後ろはコイルばね (硬さ一定)、
  zetaC・zetaR: ダンパーの減衰比 (縮み・伸び。エアサスの調整ダイヤルと同じく別々)、antiDive: 前のアンチダイブ [%] (横から見たアームの傾き)、
  pF・pR: タイヤの空気圧 [bar] (基準 5 bar。高いほど転がりは軽いが、グリップが少し落ち、縦に硬くなる)、
  前輪のアライメント: caster キャスター角・toe トー (片輪、+ = トーイン)・camber0 静的キャンバー (− = 上が内側) [°]・ack アッカーマン [%]、
  ばね下: muF・muR 前・後の 1 輪あたりのばね下の重さ [kg] (後ろはインホイールモーター込み)・kt タイヤの縦の硬さ [N/m]・roadK 路面の凸凹の大きさ (倍率) */
 DEF:{fHz:4.0, rHz:3.7, zetaC:0.35, zetaR:0.6, antiDive:20, pF:5.0, pR:5.0, lowerL:0.30, upperL:0.22, upH:0.20, upTilt:-0.04, swingL:0.42, rLinkL:0.40, rVw:0.20, rUpH:0.28, rLowDz:0.01, rUpDz:0, rearSide:"R", mr:0.6, travel:0.06, fAirL:0.16, caster:6, ack:60, toe:0.05, camber0:-0.25, muF:8, muR:20, kt:180000, roadK:1},
 TUNE:[["fHz","前のばね (固有振動数)","Hz",1,6,0.1],["rHz","後ろのばね (固有振動数)","Hz",1,6,0.1],["zetaC","ダンパー: 縮み側 (減衰比)","",0.05,1.5,0.05],["zetaR","ダンパー: 伸び側 (減衰比)","",0.05,1.5,0.05],
  ["antiDive","前: アンチダイブ (ブレーキで前が沈むのをアームが打ち消す割合)","%",0,100,5],["pF","前のタイヤの空気圧","bar",2,9,0.1],["pR","後ろのタイヤの空気圧","bar",2,9,0.1],
  ["lowerL","ロアアームの長さ","m",0.15,0.5,0.01],["upperL","アッパーアームの長さ","m",0.1,0.5,0.01],["upH","アップライトの高さ (ボールジョイントの間隔)","m",0.1,0.3,0.01],
  ["upTilt","アッパーアームの内側の高さ (外側との差)","m",-0.1,0.1,0.01],["swingL","後ろ: 下のアームの長さ (前後)","m",0.2,0.8,0.01],["rLinkL","後ろ: 上のアームの長さ (前後)","m",0.15,0.8,0.01],["rVw","後ろ: V の開き (車体側の 2 点の間隔)","m",0.05,0.5,0.01],
  ["rUpH","後ろ: アップライトの長さ (上のアームから下へ、下のアームまで)","m",0.06,0.36,0.01],["rLowDz","後ろ: 下のアームの車体側の高さ (車輪側との差)","m",-0.1,0.1,0.005],
  ["rUpDz","後ろ: 上のアームの車体側の高さ (車輪側との差)","m",-0.1,0.1,0.005],["mr","ばねのレバー比","",0.3,1,0.05],["fAirL","前: エアサスの空気室の長さ (車輪の動きに換算。短いほど奥で硬い)","m",0.08,0.5,0.01],["travel","ストロークの限界 (片側)","m",0.02,0.12,0.005],
  ["caster","前: キャスター角 (ハンドルの戻り・切ったときの車輪の傾き)","°",0,15,0.5],["ack","前: アッカーマン (内輪を多く切る割合、100 % で同じ円の中心)","%",0,120,5],
  ["toe","前: トー (片輪、+ = トーイン)","°",-1,1,0.01],["camber0","前: 静的キャンバー (− = 上が内側)","°",-3,3,0.05],
  ["muF","前: ばね下の重さ (1 輪)","kg",2,30,0.5],["muR","後ろ: ばね下の重さ (インホイールモーター込み)","kg",5,40,0.5],["kt","タイヤの縦の硬さ","N/m",60000,400000,5000],["roadK","路面の凸凹の大きさ (倍率)","",0,3,0.1]],
 H:0.002,
 val(k){ const o=P.susp&&typeof P.susp==="object"? P.susp : {}, S=(typeof VEH!=="undefined"&&VEH.active&&VEH.spec.susp)||{}, T=this.TUNE.find(t=>t[0]===k);
  let v=Number.isFinite(+o[k])&&o[k]!==""&&o[k]!=null? +o[k] : Number.isFinite(S[k])? S[k] : this.DEF[k];
  return T? clamp(v,T[3],T[4]) : v; },
 side(){ const o=P.susp&&typeof P.susp==="object"? P.susp : {}, S=(typeof VEH!=="undefined"&&VEH.active&&VEH.spec.susp)||{}, v=o.rearSide||S.rearSide||this.DEF.rearSide; return v==="L"? -1 : 1; },
 setSide(v){ P.susp=Object.assign({},P.susp&&typeof P.susp==="object"?P.susp:{},{rearSide:v==="L"?"L":"R"}); this._p=null; Settings.save(); },
 set(k,v){ const T=this.TUNE.find(t=>t[0]===k); if(!T) return; P.susp=Object.assign({},P.susp&&typeof P.susp==="object"?P.susp:{}); if(v===""||v==null) delete P.susp[k]; else P.susp[k]=clamp(+v,T[3],T[4]); this._p=null; if(typeof Strategy!=="undefined") Strategy.last=null; Settings.save(); },
 reset(){ P.susp={}; this._p=null; Settings.save(); },

 /* 車の値 (Tire の車輪の配置・荷重の配分を使う) */
 _p:null, _key:"",
 params(){
  const tp=Tire.params(), key=tp.m+"|"+JSON.stringify(P.susp||{})+"|"+tp.wh.length;
  if(this._p&&this._key===key) return this._p;
  const v=k=>this.val(k), m=tp.m, g=GRAV;
  const wh=tp.wh.map(w=>{ const mi=w.share*m, f=w.front? v("fHz") : v("rHz"), k=(2*Math.PI*f)**2*mi;
   const mu=w.front? v("muF") : v("muR"), kt=v("kt")*this.pressK(w.front? v("pF") : v("pR")).kt, cc=2*Math.sqrt(k*mi);
   return {px:w.px, py:w.py, front:w.front, R:w.R, k, lat:w.lat, airL:w.front? v("fAirL") : 0, cC:v("zetaC")*cc, cR:v("zetaR")*cc, F0:mi*g, mu, kt, ct:2*0.05*Math.sqrt(kt*mu), geo:w.front? this.wishbone(w,v) : this.rear(w,v)}; });
  // ロールセンター: 前は幾何から、後ろ (スイングアーム) は軸の高さ。重心の位置での高さ (ロール軸)
  const rcF=wh.filter(w=>w.front).map(w=>w.geo.rc), hF=rcF.length? rcF.reduce((a,b)=>a+b,0)/rcF.length : 0;
  const rr=wh.filter(w=>!w.front), hR=rr.length? rr.reduce((a,w)=>a+w.geo.rc,0)/rr.length : 0, hRA=hF*(tp.b/tp.L)+hR*(tp.a/tp.L);
  const ms=Math.max(m*0.5,m-wh.reduce((a,w)=>a+w.mu,0));   // ばね上の重さ
  // アンチダイブ: 前の前後の力 1 N あたり車体の前を持ち上げる力 (tan = 割合 × 重心の高さ ÷ ホイールベース)
  const aD=v("antiDive")/100*tp.h/tp.L; for(const w of wh) if(w.front) w.geo.antiF=aD;
  return this._key=key, this._p={m, ms, h:tp.h, L:tp.L, Iy:tp.Iz*0.9*ms/m, Ix:ms*0.4*0.4, wh, hRA, hF, travel:v("travel"), mr:v("mr"), cam0:v("camber0")*Math.PI/180, roadK:v("roadK")};
 },
 /* 2 本のリンクで車体につながるアップライトの動き (平面の 4 節リンク)。座標 y (前輪: 外向き / 後輪: 前向き)・z 上、静止の接地点が原点。
  li・ui: 車体側の軸 (下・上)、lo・up: アップライト側の点 (下・上)。→ ストロークごとの表 {c, rot (アップライトの回転、y から z へ +), L1, U1, wc 車輪の中心, cp 接地点} と瞬間中心 ic */
 linkage(li,ui,lo,up,R,T){
  const Ll=Math.hypot(lo.y-li.y,lo.z-li.z), Lu=Math.hypot(up.y-ui.y,up.z-ui.z), U=Math.hypot(up.y-lo.y,up.z-lo.z), a0=Math.atan2(up.z-lo.z,up.y-lo.y);
  const cw={y:0-lo.y,z:R-lo.z}, cp={y:0-lo.y,z:0-lo.z};   // 車輪の中心・接地点 (アップライトに固定)
  const solve=(al)=>{ const L1={y:li.y+Ll*Math.cos(al),z:li.z+Ll*Math.sin(al)};   // 下のアームの角度 → アップライトの下の点
   const dx=ui.y-L1.y, dz=ui.z-L1.z, d=Math.hypot(dx,dz); if(d>Lu+U||d<Math.abs(Lu-U)) return null;
   const a=(U*U-Lu*Lu+d*d)/(2*d), hh=Math.sqrt(Math.max(0,U*U-a*a)), mx=L1.y+dx*a/d, mz=L1.z+dz*a/d;
   const U1={y:mx-dz*hh/d,z:mz+dx*hh/d}, U2={y:mx+dz*hh/d,z:mz-dx*hh/d}, Uj= U1.z>U2.z? U1 : U2;   // 上側の解
   const rot=Math.atan2(Uj.z-L1.z,Uj.y-L1.y)-a0, cs=Math.cos(rot), sn=Math.sin(rot), tr=p=>({y:L1.y+p.y*cs-p.z*sn,z:L1.z+p.y*sn+p.z*cs});
   return {L1,U1:Uj,rot,wc:tr(cw),cp:tr(cp)}; };
  const al0=Math.atan2(lo.z-li.z,lo.y-li.y), f=(al,c)=>{ const s=solve(al); return s? s.wc.z-R-c : NaN; };
  const up_=f(al0+0.01,0)>f(al0-0.01,0);   // 下のアームの角度が増えるとき車輪が上がるか
  const at=(c)=>{ let a=al0-0.6, b=al0+0.6; for(let i=0;i<40;i++){ const m=(a+b)/2, v=f(m,c);
    if(!Number.isFinite(v)){ if(m>al0) b=m; else a=m; continue; }   // リンクが届かない角度: 静止の角度の側へ縮める
    if((v>=0)===up_) b=m; else a=m; } return solve((a+b)/2); };
  const N=24, tab=[]; for(let i=0;i<=N;i++){ const c=-T+2*T*i/N, q=at(c); tab.push({c,rot:q.rot,L1:q.L1,U1:q.U1,wc:q.wc,cp:q.cp}); }
  const ix=(p1,p2,p3,p4)=>{ const d=(p1.y-p2.y)*(p3.z-p4.z)-(p1.z-p2.z)*(p3.y-p4.y); if(Math.abs(d)<1e-9) return null; const t=((p1.y-p3.y)*(p3.z-p4.z)-(p1.z-p3.z)*(p3.y-p4.y))/d; return {y:p1.y+t*(p2.y-p1.y),z:p1.z+t*(p2.z-p1.z)}; };
  return {tab,ic:ix(li,lo,ui,up)};
 },
 /* 前輪のダブルウィッシュボーン (正面から見る。外向き +)。キャンバー・横ずれ・ロールセンター */
 wishbone(w,v){
  const R=w.R, lo={y:-0.02,z:R-v("upH")/2}, up={y:-0.05,z:R+v("upH")/2};   // 外側のボールジョイント (少し内側に倒したキングピン)
  const li={y:lo.y-v("lowerL"),z:lo.z}, ui={y:up.y-v("upperL"),z:up.z+v("upTilt")};   // 内側の取り付け (車体側)
  const K=this.linkage(li,ui,lo,up,R,v("travel")*1.5), tab=K.tab.map(t=>({c:t.c,camber:-t.rot,scrub:t.cp.y,L1:t.L1,U1:t.U1,wc:t.wc}));   // camber: 上が外へ傾く向き +
  // ロールセンター (静止): アームの延長の交点 (瞬間中心) と接地点を結ぶ線が、車の中心を通る高さ
  const ic=K.ic, half=Math.abs(w.x0!=null? w.x0 : w.py), rc= ic&&Math.abs(ic.y)>1e-6? clamp(-half*ic.z/ic.y,-0.2,0.4) : 0;
  return {kind:"wishbone",li,ui,lo,up,tab,rc,ic};
 },
 /* 後輪 (片持ち): 上下 2 本の非対称な V 字のアーム (横から見る。前 +)。アップライトはインホイールモーターに直付け。
  車体側の 2 点は同じ前後位置で、アームの軸は左右方向。車輪は車体と一緒に傾く (キャンバーの変化なし)。アームは片側 (rearSide) だけ。
  瞬間中心 (横から見たアームの延長の交点) の高さと距離から、駆動・回生・ブレーキの力の一部がアームを通って車体を持ち上げる/引き下げる (アンチスクワット・アンチリフト) */
 rear(w,v){
  const R=w.R, up={y:0,z:R+0.12}, lo={y:0,z:R+0.12-v("rUpH")};   // 上の点は車輪の中心の少し上で固定、アップライトは下へ伸びる
  const li={y:v("swingL"),z:lo.z+v("rLowDz")}, ui={y:v("rLinkL"),z:up.z+v("rUpDz")};
  const K=this.linkage(li,ui,lo,up,R,v("travel")*1.5), tab=K.tab.map(t=>({c:t.c,camber:0,scrub:0,pitch:t.rot,L1:t.L1,U1:t.U1,wc:t.wc}));
  const ic=K.ic, anti= ic&&ic.y>0.05? clamp(ic.z/ic.y,-1,1) : 0;   // 接地点から瞬間中心への傾き (tan)。前の力 1 N あたり車体を持ち上げる力
  return {kind:"link",li,ui,lo,up,tab,rc:R,ic,anti,side:this.side(),vw:v("rVw")};
 },
 /* 表からストローク c [m] での値 */
 geoAt(w,c){ const t=w.geo.tab; if(!t) return null; const T=t[t.length-1].c, f=clamp((c+T)/(2*T),0,1)*(t.length-1), i=Math.min(t.length-2,Math.floor(f)), r=f-i, A=t[i], B=t[i+1], L=(a,b)=>a+(b-a)*r, LP=(a,b)=>({y:L(a.y,b.y),z:L(a.z,b.z)});
  return {camber:L(A.camber,B.camber),scrub:L(A.scrub,B.scrub),pitch:L(A.pitch||0,B.pitch||0),L1:LP(A.L1,B.L1),U1:LP(A.U1,B.U1),wc:LP(A.wc,B.wc)}; },

 /* 空気圧の効き (基準 5 bar に対する倍率): kt 縦の硬さ・crr 転がり抵抗・corn 横すべりの硬さ・mu グリップ */
 pressK(bar){ const r=Math.max(0.3,(bar||5)/5); return {kt:0.25+0.75*r, crr:Math.pow(r,-0.4), corn:Math.pow(r,0.25), mu:Math.pow(r,-0.08)}; },
 /* ばねの力 [N] (静止の位置からの増分、縮む +)。前はエアサス: 空気の圧縮 (指数 1.3) で縮むほど硬く、伸びると柔らかい。静止の位置での硬さは k。後ろはコイル (k 一定) */
 spring(w,c){ if(!w.airL) return w.k*c; const L=w.airL, n=1.3, x=Math.min(c,L*0.85); return w.k*L/n*(Math.pow(L/(L-x),n)-1)+(c>x? w.k*8*(c-x) : 0); },
 init(){ return {z:0,zd:0,th:0,thd:0,ph:0,phd:0,c:null,cd:null,zu:null,zud:null,Fz:null,camber:null}; },
 /* 1 フレーム進める。inp: {ax 前への加速度 [m/s²] (実際の速度の変化)、Fy タイヤの横力の合計 [N, 右 +]、Fside 横風の横力 [N]、lift 浮き上がり [N]、
  hcp 横風の力の高さ [m]、FxR・FxF 後輪・前輪のタイヤの前後の力 [N, 前 +]、Mx そのほかの左右に傾ける力 [N·m]、hold 押さえる力 [N]、flat パンクした車輪、road(i, f): 車輪 i の下の路面の高さ [m] (f: フレームの中の時刻 0〜1。無ければ平ら)}
  → st.Fz (車輪ごとの荷重 = タイヤが路面を押す力 [N]、跳ねて浮くと 0)・st.c (ストローク)・st.zu (車輪の上下 [m])・st.camber (路面に対する車輪の傾き [rad]、右へ傾く向き +)
  車体 (ばね上) と車輪 (ばね下: アップライト・ブレーキ・タイヤ・後ろはモーター) を別々に動かす。路面の凸凹は タイヤの縦のばね → 車輪 → ばね・ダンパー → 車体 と伝わる */
 step(st,inp,dt){
  const fin=x=>Number.isFinite(x)? x : 0;   // 入力が壊れても計算全体を道連れにしない
  const p=this.params(), n=Math.max(1,Math.min(30,Math.ceil(fin(dt)/this.H))), h=Math.min(fin(dt)/n,0.003), ax=fin(inp.ax), Fy=fin(inp.Fy), Fw=fin(inp.Fside), hcp=inp.hcp!=null? inp.hcp : p.h*1.25, L=fin(inp.lift);
  if(!(h>0)) return st;   // (フレームが長いとき (0.09 秒超) はその分だけ遅れて動く: 刻みを 3 ms 以下に保って発散させない)
  const Mpitch=p.m*ax*p.h;                                  // 加速で機首上げ (+)。ばね下の分も含めて重心の高さで (釣り合いの式と同じ)
  const Mroll=-Fy*(p.h-p.hRA)+Fw*(hcp-p.h)+fin(inp.Mx);      // 右へ曲がる (右向きの力) と左 (外) へ傾く。Mx: そのほか (風上側の浮き上がり、右が下がる +)
  const hold=fin(inp.hold), flat=inp.flat==null? -1 : inp.flat;   // hold: クルーが車体を押さえる力 [N]、flat: パンクした車輪 (空気が抜けて低く柔らかい)
  // 後輪の前後の力のうちアームを通る分 (ばねを通らずに車体を持ち上げる・引き下げる)、横の力のうちロール軸の高さの分 (アームを通って車輪の荷重へ)
  // 前は前輪の前後の力 (ブレーキで後ろ向き = −) でアンチダイブ (前を持ち上げる)
  const nR=Math.max(1,p.wh.filter(q=>!q.front).length), nF=Math.max(1,p.wh.filter(q=>q.front).length), geoM=Fy*p.hRA;
  const geoZ=p.wh.map(w=>w.geo.anti? fin(inp.FxR)/nR*w.geo.anti : w.geo.antiF? -fin(inp.FxF)/nF*w.geo.antiF : 0);
  const nW=p.wh.length; if(!st.c||st.c.length!==nW){ st.c=new Array(nW).fill(0); st.cd=new Array(nW).fill(0); st.Fs=new Array(nW).fill(0); st.zu=new Array(nW).fill(0); st.zud=new Array(nW).fill(0); st.Ft=p.wh.map(w=>w.F0); st.zr=new Array(nW).fill(0); }
  for(let k=0;k<n;k++){
   let Fz=0, My=0, Mx=0;
   for(let i=0;i<nW;i++){ const w=p.wh[i];
    const zr=inp.road? fin(inp.road(i,(k+1)/n)) : 0, zrd=(zr-st.zr[i])/h; st.zr[i]=zr;
    const zb=st.z+st.th*w.px-st.ph*w.py, zbd=st.zd+st.thd*w.px-st.phd*w.py;   // 車体の、その車輪の上の点
    const c=st.zu[i]-zb, cd=st.zud[i]-zbd;
    let F=this.spring(w,c)+(cd>0? w.cC : w.cR)*cd;                              // ダンパー: 縮みと伸びで別の強さ
    const xb=Math.abs(c)-(p.travel-0.01); if(xb>0) F+=Math.sign(c)*w.k*(6*xb+600*xb*xb);   // バンプストッパー (ストロークの端の 10 mm 手前から、ゴムが潰れるほど急に硬く)
    if(F<-w.F0) F=-w.F0;                                                         // ばねは引っ張れない
    const fl=i===flat, kt=fl? w.kt*0.2 : w.kt, zf=fl? -0.03 : 0;                // パンク: タイヤが潰れて約 3 cm 低く、縦にとても柔らかい
    const Ft=Math.max(0,w.F0+kt*(zr+zf-st.zu[i])+w.ct*(zrd-st.zud[i]));         // タイヤの縦のばね (路面から離れると 0)
    st.zud[i]+=((Ft-w.F0)-F-geoZ[i]-w.lat*geoM)/w.mu*h; st.zu[i]+=st.zud[i]*h;
    st.c[i]=c; st.cd[i]=cd; st.Fs[i]=F; st.Ft[i]=Ft; Fz+=F+geoZ[i]; My+=(F+geoZ[i])*w.px; Mx+=-F*w.py; }
   st.zd+=((Fz+L-hold)/p.ms)*h; st.thd+=((My+Mpitch)/p.Iy)*h; st.phd+=((Mx+Mroll)/p.Ix)*h;   // hold: 押さえる力は車体を下へ (ばね → 車輪 → タイヤと伝わって荷重が増える)
   st.z+=st.zd*h; st.th+=st.thd*h; st.ph+=st.phd*h;
   if(!Number.isFinite(st.z+st.th+st.ph+st.zu.reduce((a,b)=>a+b,0))){ if(!this._nanWarn){ this._nanWarn=true; console.warn("Susp: 計算が発散したので静止の状態に戻しました",JSON.stringify({ax,Fy,Fw,L,FxR:inp.FxR,dt})); }
    Object.assign(st,this.init()); st.Fz=p.wh.map(w=>w.F0); st.camber=p.wh.map(()=>0); st.c=new Array(nW).fill(0); return st; }
  }
  st.Fz=st.Ft.slice();
  // キャンバー (路面に対して、右へ傾く向き +): 静的キャンバー + アームの幾何 (外向き +) を右向きに直し、車体のロールを足す
  st.camber=p.wh.map((w,i)=>{ const g=(w.geo.kind==="wishbone"? p.cam0 : 0)+(w.geo.tab? this.geoAt(w,st.c[i]).camber : 0); return (w.py>=0? g : -g)+st.ph; });
  return st;
 },
 /* 路面の凸凹 [m] (距離 s [m] の所、横の位置 y [m])。舗装の細かいうねりの重ね合わせ。k: 路面の荒さの倍率 (町 0.6・郊外 1・路肩 4・土 8) */
 roughAt(s,y,k){ const A=[[0.7,0.00025,0.3],[1.3,0.0004,1.9],[2.9,0.0009,4.1],[6.1,0.0016,0.7],[13,0.0025,2.6]];   // [波長 m, 振幅 m, 位相]。舗装の一般的な凸凹 (短い波長ほど小さい)
  // 左右のずれ: 長い波ほど左右でそろう (車幅 0.84 m で 13 m の波は 0.2 rad、0.7 m の波はほぼ別々)。向きは成分ごとに交互
  let z=0, sg=1; for(const [L,a,ph] of A){ z+=a*Math.sin(2*Math.PI*(s+sg*0.5*y)/L+ph); sg=-sg; } return z*k*this.params().roadK; },
 /* キャトルグリッド [m]: 鉄の棒 (間隔 0.13 m) のすき間でタイヤが少し落ちる (接地面が棒をまたぐので浅い)。d: グリッドの中心からの距離 [m] (± 1.5 m の範囲) */
 gridAt(d){ return Math.abs(d)>1.5? 0 : -0.0025*Math.pow(Math.sin(Math.PI*d/0.13),2)*this.params().roadK; },
};
