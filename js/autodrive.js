"use strict";
/* ============ 自動運転 (エネマネ班の役割で使う) ============
 人の代わりにハンドル・スロットル・ブレーキ・ウインカーを操作する。決めるのは「走る速さ」と「止まる所」だけで、
 それ以外は道路の決まりに従う:
  ・ハンドル: 少し先の車線の中心を狙う (先の点を狙う方式: 狙う距離は速さに合わせて 6 m〜)
  ・速さ: 次のうち最も遅いもの
    指示の速さ (Orders の指示、または AutoDrive.vSet) / 制限速度 (先の標識の手前で落とす) / カーブ (横 G 0.2 g まで)
    右左折 (18 km/h) / 赤信号 (停止線で止まる) / 前の車・誘導車 (車間 2 秒) / 道を横切る動物 (止まる)
    CS の敷地 (25 km/h 以下で入り、所定の場所で止まる) / 強制ドライバー交代 (路肩の駐車帯で止まる)
  ・道を譲る: 後ろのロードトレインの無線が来たら左へ寄せて落とす
  ・止まる: 停車の指示 (stopAt: km / 'now')、17:00 を過ぎたら、充電停車、パンク、暴風雨の間は、路肩へ寄せて止まる
 呼ぶ所: main.js の loop (updateInput の後)。es.throttleSet・es.brakePhys・es.brakeRegen・Input.steer・es.signal を上書きする */
const AutoDrive={
 on:false, vSet:null, stopAt:null, why:"", latT:-2.4, I:0, held:false, chargeReq:false, menuReq:false, menuShown:false,
 enable(b){ this.on=!!b; this.I=0; this.pullS=null; this.stopAt=null; this.chargeReq=false; this.menuReq=false; this.menuShown=false; this.why=""; },
 /* 先の制限速度 [m/s]: 今の速さで減速 (0.8 m/s²) が間に合う距離の中で最も低いもの */
 limAhead(V,es){ const v=es.v, D=Math.max(60,v*v/(2*0.8)+40); let m=1e9;
  for(let d=0;d<=D;d+=Math.max(10,D/20)){ const lim=(speedLimitAt(V.kmOfS(V.s+d))-1.5)/3.6; const room=Math.sqrt(lim*lim+2*0.8*Math.max(0,d-15)); m=Math.min(m,room); }
  return m; },
 /* 止まりたい所 (前方 d m) に止まれる速さ */
 stopV(d,a=1.6){ return d<=0.5? 0 : Math.sqrt(2*a*Math.max(0,d-0.5)); },
 control(dtR){
  if(!this.on||!running||typeof Engine==="undefined"||!Engine.st||P.mode!=="race") return;
  const es=Engine.st, V=View; if(!V||!V.road) return;
  if(es.stopTimer>0||es.camp||es.fire||es.crashed||es.finished){ es.throttleSet=0; es.brakePhys=0; es.brakeRegen=0; this.I=0; return; }
  const km=es.km, v=es.v; let vT=1e9, why="", latT=-2.4;
  const set=(x,w)=>{ if(x<vT){ vT=x; why=w; } };
  // 指示の速さ
  const ord= this.vSet!=null? this.vSet : (typeof Orders!=="undefined"&&Orders.cur? Orders.cur.v : null);
  set(ord!=null? ord/3.6 : 80/3.6,"指示");
  set(this.limAhead(V,es),"制限速度");
  // カーブ
  { const [cp,cn]=V.maxCurv(V.s+Math.max(20,v*2),Math.max(20,v*2)), c=Math.max(cp,cn); if(c>1e-4) set(Math.sqrt(0.2*GRAV/c),"カーブ"); }
  // 右左折
  for(const mn of RP_MANEUVERS){ if(mn.turn!=="R"&&mn.turn!=="L") continue; const d=(mn.km-km)*1000;
   if(d>-25&&d<200){ set(Math.max(18/3.6,this.stopV(d-60,1.2)+18/3.6*(d<60?0:1)),"右左折"); if(d<110&&d>-20) es.signal= mn.turn==="R"?1:-1; else if(d<-20&&es.signal) es.signal=0; } }
  // 赤信号
  if(V.redSignalKm!=null&&V.redSignalKm>km){ const d=(V.redSignalKm-km)*1000-6; if(d<150) set(this.stopV(d),"赤信号"); }
  // CS: 1 km 手前から 40、300 m から 20 km/h、所定の場所 (cp.km の少し先) で止まる
  { const c=RP_CS.find(q=>!es.passedCP.has(q.km)&&q.km>km-0.12);
   if(c){ const d=(c.km+0.02-km)*1000; if(d<1000) set(40/3.6,"CS"); if(d<300) set(20/3.6,"CS"); if(d<60) set(this.stopV(d,1.0),"CS 停車"); } }
  // 強制ドライバー交代 (路肩の駐車帯)
  // 駐車帯 (区間の中) に入ってから左へ寄せる。駐車帯に入りきるまでは止まらない (車線の上で止まると交代にならず、そのまま動けなくなる)
  let bay=false;
  { const dc=RP_RULES.driverChange; if(!es.dcDone){ const d=(dc.km+dc.len*0.6-km)*1000; if(d<800&&km<dc.km+dc.len){ set(30/3.6,"ドライバー交代"); if(d<300) set(15/3.6,"ドライバー交代");
     if(km>=dc.km+0.01){ bay=true; latT=-(V.ROAD_W+1.3); const inBay=V.lateral<-V.ROAD_W-1;
      set(inBay? Math.min(10/3.6,this.stopV(d,1.0)) : 10/3.6,"ドライバー交代"); } } } }
  // 前の車 (一般車両・誘導車・他チーム): 車間 2 秒 + 8 m
  { const lat=V.lateral; let ld=null, yieldNear=false;
   const cand=[]; if(typeof Traffic!=="undefined") for(const c of Traffic.cars) cand.push({r:c.s-c.L,lat:c.lat,v:c.v});
   if(V.escortLead&&V.escortLead.visible&&V.leadS!=null) cand.push({r:V.leadS-2.4,lat:-2.4,v:V.leadV||0});
   for(const sl of V.aiPool||[]) if(sl.team&&sl.mesh&&sl.mesh.visible&&sl._s!=null){   // 他チームの隊列 (ソーラーカー・誘導車・後方車)
    const lat=sl.team.latV||-2.4, tv=(sl.team.vNow||0)/3.6;
    // 「Can I overtake?」に Yes の隊列は左へ寄って落とす。こちらは車線の右寄りを通って抜く (後ろに付くと相手と一緒に落ちていく)
    const rC=sl.chase&&sl.chase.visible&&sl._sC!=null? sl._sC : sl._s, fL=sl.lead&&sl.lead.visible&&sl._sL!=null? sl._sL : sl._s;
    if((sl.team.yieldT>0||(lat<-3.2&&tv>1))&&rC-V.s<150&&fL-V.s>-15) yieldNear=true;
    cand.push({r:sl._s-2.4,lat,v:tv});
    if(sl.lead&&sl.lead.visible&&sl._sL!=null) cand.push({r:sl._sL-2.8,lat,v:tv});
    if(sl.chase&&sl.chase.visible&&sl._sC!=null) cand.push({r:sl._sC-2.8,lat,v:tv}); }
   if(yieldNear&&!bay) latT=-1.1;
   for(const o of cand){ const g=o.r-(V.s+2.3); if(g<-1||Math.abs(o.lat-lat)>1.9) continue; if(!ld||g<ld.g) ld={g,v:o.v}; }
   if(ld) set(Math.max(0,Math.min(ld.v+(ld.g-8-2*v)*0.25,this.stopV(ld.g-6,2.0)+ld.v)),"前の車"); }
  // 動物・路上の死骸
  if(typeof Wildlife!=="undefined") for(const a of Wildlife.list){ const d=a.s-V.s; if(d<-3||d>160) continue;
   if(a.kind==="roadkill"){ if(Math.abs(a.lat-V.lateral)<1.5&&d<120){ if(!bay) latT= a.lat<-1.2? Math.min(-0.4,a.lat+2.0) : -3.3; set(55/3.6,"死骸をよける"); } }
   else if((a.st==="cross"&&Math.abs(a.lat-V.lateral)<5)||(a.st==="wait"&&d<v*4)){ set(a.st==="cross"? this.stopV(d-4,4.5) : Math.min(v,60/3.6),"動物"); } }
  // 後ろのロードトレインに道を譲る (譲れば抜ける状態のときだけ。町の中などで抜けないのに遅く走り続けない)
  if(typeof Traffic!=="undefined"&&Traffic.rtMsg&&Traffic.rtMsg!=="done"){ const rt=Traffic.cars.find(c=>c.id===Traffic.rtMsg); if(rt&&rt.s-rt.L<V.s+20&&(rt.canPass||rt.mode==="pass")){ if(!bay) latT=-4.1; set(rt.v0*0.65,"道を譲る"); } }
  // 止まる: 指示 (km / now)・17:00 以降・充電・パンク・暴風雨
  let pull=null;
  if(this.stopAt==="now") pull=0;
  else if(this.stopAt!=null&&this.stopAt>km-0.05) pull=(this.stopAt-km)*1000/(Route.scaleAt(km));
  // 17:00・充電・パンク・暴風雨: 決めた時の少し先に止まる所を置き、そこへ向けて止まる
  const need= es.hour>=17? 60 : this.chargeReq||this.menuReq? 50 : es.burst? 30 : (typeof Storm!=="undefined"&&Storm.active&&Storm.active(es))? 40 : null;
  if(need==null) this.pullS=null; else if(this.pullS==null) this.pullS=V.s+Math.max(need,v*v/(2*1.2)+10);
  if(this.pullS!=null) pull= pull==null? this.pullS-V.s : Math.min(pull,this.pullS-V.s);   // 近いほうで止まる
  if(pull!=null&&pull<400){ if(!bay) latT=-4.4; set(this.stopV(Math.max(0,pull),1.2),"停車"); if(pull<1&&v>0.3) set(0,"停車"); }
  this.latT=latT; this.why=why;
  // 止まったあとの処理
  if(v<0.3&&pull!=null&&V.lateral<-3.6){
   if(this.chargeReq&&typeof StopMenu!=="undefined"&&!StopMenu.active){ StopMenu.active=true; StopMenu.mode="charge"; this.charging=true; TiltDecide.open(); }   // 傾ける角度を選ぶ画面
   // 点検・修理 (エネマネ欄のボタン、またはタイヤのバースト): 停車メニューを 1 回開く (タイヤ交換・機器チェック・充電を選ぶ)
   else if((this.menuReq||es.burst)&&!this.menuShown&&typeof StopMenu!=="undefined"&&!StopMenu.active){ this.menuReq=false; this.menuShown=true; StopMenu.open(); }
  }
  if(v>2) this.menuShown=false;
  // 速度の制御 (スロットル開度の比例・積分 + 回生・ブレーキ)
  const err=vT-v;
  this.I=clamp(this.I+err*dtR*0.02,-0.2,0.6);
  es.throttleSet= vT<0.3? 0 : clamp(0.25+0.08*err+this.I,0,1);
  es.brakeRegen= err<-0.4? clamp(-err*0.4,0,1) : 0;
  es.brakePhys= err<-2.5||(vT<0.3&&v<3)? clamp((-err-1.5)*0.25,0.15,1) : 0;
  if(vT<0.3&&v<3){ es.brakePhys=1; es.throttleSet=0; this.I=0; }   // 止まる直前はしっかり踏む
  // ハンドル: 先の車線の点を狙う
  const Ld=Math.max(6,v*1.1), rp=V.roadPoint(V.s+Ld), tx=rp.x+Math.cos(rp.h)*latT, tz=rp.z+Math.sin(rp.h)*latT;
  let e=Math.atan2(tx-V.cx,-(tz-V.cz))-V.ch; e=Math.atan2(Math.sin(e),Math.cos(e));
  Input.steer=clamp(e*2.2,-1,1);
  // 疲れたドライバー (集中力 50 % 未満) は少しふらつく
  const fe=typeof Cabin!=="undefined"? Cabin.eff(es) : 0; if(fe>0){ const t=performance.now()/1000; Input.steer=clamp(Input.steer+fe*0.05*(Math.sin(t*0.7)+0.6*Math.sin(t*1.9+1)),-1,1); }
 },
 /* 点検・修理のため路肩に止めて停車メニューを開く */
 repair(){ this.menuReq=true; this.menuShown=false; },
 /* 充電停車をやめて走り出す */
 resume(){ this.chargeReq=false; this.charging=false; if(this.stopAt==="now") this.stopAt=null; if(typeof StopMenu!=="undefined"&&StopMenu.mode==="charge"){ StopMenu.mode=null; StopMenu.active=false; } if(Engine.st) Engine.st.tiltLocked=false; },
};
