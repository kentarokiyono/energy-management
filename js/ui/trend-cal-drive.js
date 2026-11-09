"use strict";
/* ============ 傾向の合わせ込み: 隠れたゲーム画面の中で、ゲームのエンジンに本戦を 1 回走らせる ============
 傾向タブ (js/ui/trend-cal.js) が、見えない枠 (iframe) にゲームを開いてこのファイルを読み込み、window.CalDrive.run() を呼ぶ。
 ・2025 年の実際の天気・予報のずれなし・暴風雨なし・故障なし。×1 の時間 (1 秒ごと) で走らせる (×60 だと加減速に時間がかかりすぎる)
 ・速度: 渡された 2 km ごとの速度 (速い計算の走り) に合わせてアクセルを調整。CS・ドライバー交代・17 時は止まる (通しの耐久テストと同じ運転)
 ・6 秒ごとの記録: [km, 経過時間, 速度 km/h, 傾けて充電中, 発電 W, 消費 (モーター + 補機) W, 電池の出入り W, 電池 (SOC), 電池を切り離し中, ブレーキ, 加速度]
 記録や成績は残さない (走行のログ・ドライバー成績・結果画面を止める) */
window.CalDrive={
 async run(o){ const sp=o.speed, onP=o.onProgress||(()=>{}), keep={fs:PRO.faultScale};
  window.pushChart=()=>{}; DrvRec.record=()=>{}; window.showResult=()=>{ running=false; };   // 成績・結果画面は出さない
  P.gfx="low"; P.mode="race"; P.event=false; P.crewProc=false; P.realWeather=true; P.fcErr="off"; P.tts="off"; P.raceStorm=false; PRO.faultScale=0;
  startGame(); running=false; const es=Engine.st; es.gridStartH=8; if(typeof StopMenu!=="undefined") StopMenu.active=false;
  const dc=RP_RULES.driverChange, DT=1, ECO_TOP=Strategy.topSpeed(false), N=Math.ceil(TOTAL_KM/2)+2, S=[];
  const vAt=(km)=> sp? (sp[Math.min(N-1,Math.floor(km/2))]||60) : (Orders.cur? Orders.cur.v : 70);
  let steps=0, s0=es.soc, last=0, csAt=[];
  try{
   while(steps<1500000&&!es.finished&&!es.crashed&&!es.fire&&es.day<=8){ steps++;
    let vt=vAt(es.km); vt=Math.min(vt,speedLimitAt(es.km+0.3),speedLimitAt(es.km)); const nextCS=RP_CS.find(c=>!es.passedCP.has(c.km)&&c.km>es.km-0.07);
    for(let d=0.25;d<=2;d+=0.25) vt=Math.min(vt,speedLimitAt(es.km+d)+d*25);
    if(es.hour>=16.95&&es.hour<17.5) vt=0;
    if(nextCS&&nextCS.km-es.km<0.6) vt= nextCS.km-es.km<0.05? 0 : 20;
    if(!es.dcDone&&dc.km-es.km<0.6&&es.km<dc.km+dc.len){ vt= es.km>=dc.km-0.01? 0 : 20; View.lateral=-View.ROAD_W-2; } else View.lateral=-2.4;
    const kmh=es.v*3.6, e=vt-kmh; es.powerMode= vt>ECO_TOP-2;
    if(vt===0){ es.throttleSet=0; es.brakePhys=1; } else { es.brakePhys= e<-4? clamp(-e/15,0.2,1) : 0; if(e<-4) es.throttleSet=Math.min(es.throttleSet,0.1); es.throttleSet=clamp(es.throttleSet+0.004*e,0,1); }
    if(modalPause){ modalPause=false; if(typeof TiltDecide!=="undefined"&&TiltDecide.close) try{ TiltDecide.close(); }catch(x){} }
    const v0=es.v, np=es.passedCP.size; Engine.step(DT,DT); Orders.frame(es,DT);
    const abs=(es.day-1)*24+es.hour; if(es.passedCP.size>np) csAt.push([es.km,abs,es.soc]);
    if(steps%6===0){ const mv=es.v>1, tl=!mv&&(es.camp||es.stopTimer>0);
     S.push(es.km,abs,es.v*3.6,tl?1:0,es.lastSolar,es.lastMotorW+(es.disconnected?0:(es.camp?2:P.auxW)),es.lastNet,es.soc,es.disconnected?1:0,es.brakePhys||0,(es.v-v0)/DT); }
    if(steps%20000===0){ onP(es.km/TOTAL_KM); await new Promise(r=>setTimeout(r,0)); } }
  } finally{ PRO.faultScale=keep.fs; }
  const efTab=[0]; let acc=0; for(let i=1;i<=100;i++){ acc+=(VOC((i-0.5)/100))/100; efTab.push(acc); } const E1=CAP_AH()*acc; for(let i=0;i<=100;i++) efTab[i]/=acc;   // SOC → 電力量の割合 (電圧の変わり方から)
  return {S:new Float32Array(S),W:11,efTab,E1,fin:es.finished?(es.day-1)*24+es.hour:NaN,km:es.km,csAt,Wh:P.batteryWh,soc0:s0,steps}; },
};
