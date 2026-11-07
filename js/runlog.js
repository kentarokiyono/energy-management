"use strict";
/* ============ 走行ログ (レースモード): 一定距離ごと (既定 50 m) + 停車中は 10 分ごとに記録し、CSV で保存 ============
 長い距離を細かく記録するので、行は数値のまま持ち、保存するときに文字にする */
const RunLog={
 rows:[], lastKm:null, lastAbsH:null, notes:[], on:false, stepKm:0.05,
 COLS:["日","時刻","経過h","km","状態","速度km/h","区間平均km/h","制限km/h","SOC%","電池Wh","端子電圧V","電池電流A","発電W","モーターW","収支W","累積発電Wh","累積消費Wh","日射W/m²","気温°C","セル温度°C","電池温度°C","風速m/s","向かい風m/s","勾配%","標高m","スロットル%","物理ブレーキ%","回生%","回生W","ドライバー","モード","天候","順位","メモ"],
 DEC:[0,null,3,3,null,1,1,0,2,0,2,2,0,0,0,0,0,0,1,1,1,1,1,2,0,0,0,0,0,null,null,null,0,null],   // 列ごとの小数桁 (null = 文字)
 start(){ this.rows=[]; this.notes=[]; this.lastKm=null; this.lastAbsH=null; this.stepKm=Math.max(0.05,(P.logStepM||50)/1000);
  this.on=P.mode==="race"&&!P.event; if(this.on) this.add(true); },
 absH(s){ return (s.day-1)*24+s.hour; },
 note(msg){ if(this.on) this.notes.push(String(msg).replace(/<[^>]*>/g,"").replace(/\s+/g," ").trim()); },
 state(s){ return s.finished?"ゴール": s.stopTimer>0?({cp:"CS",tire:"タイヤ交換",check:"点検",driver:"ドライバー交代",repair:"修理"}[s.stopKind]||"停車") : s.camp?"夜営" : (typeof Engine.gridWait==="function"&&Engine.gridWait())?"発進待ち" : s.v>0.5?"走行":"停車"; },
 tick(){
  if(!this.on) return; const s=Engine.st; if(!s) return;
  const h=this.absH(s);
  if(Math.floor(s.km/this.stepKm)!==Math.floor(this.lastKm/this.stepKm)) this.add();   // 一定距離ごと
  else if(s.v<0.5&&h-this.lastAbsH>=1/6) this.add();                                  // 停車中は 10 分ごと
 },
 add(first){
  const s=Engine.st, h=this.absH(s), pr=profileAt(s.km);
  const avg= !first&&this.lastAbsH!=null&&h>this.lastAbsH? (s.km-this.lastKm)/(h-this.lastAbsH) : NaN;
  const rank= s.teams&&s.teams.length? (Engine.gridWait&&Engine.gridWait()? s.grid : 1+s.teams.filter(t=>t.km>s.km).length) : NaN;
  this.rows.push([s.day,h,h-8,s.km,this.state(s),s.v*3.6,avg,speedLimitAt(s.km),s.soc*100,s.soc*P.batteryWh,s.lastVterm!=null?s.lastVterm:VOC(s.soc),s.lastIbat,
   s.lastSolar,s.lastMotorW,-(s.lastNet||0),s.whGen,s.whUsed,s.lastGeff,s.Tamb,s.lastTcell,s.Tbat!=null?s.Tbat:NaN,s.windSpeed,s.lastHead,
   Math.tan(s.physSlope!=null?s.physSlope:pr.slope)*100,pr.elev,s.throttleSet*100,s.brakePhys*100,s.brakeRegen*100,s.lastRegenW||0,
   typeof Crew!=="undefined"&&Crew.drivers? Crew.drivers[Crew.driverIdx].name : "",s.powerMode?"POWER":"ECO",s.weather?(s.weather.type==="squall"?"スコール":"曇天"):"快晴",rank,
   this.notes.length?this.notes.join(" / "):""]);
  this.notes=[]; this.lastKm=s.km; this.lastAbsH=h;
 },
 cell(i,v){
  if(i===1){ const t=((v%24)+24)%24; return `${String(Math.floor(t)).padStart(2,"0")}:${String(Math.floor(t%1*60)).padStart(2,"0")}:${String(Math.floor(t*3600%60)).padStart(2,"0")}`; }
  const d=this.DEC[i]; if(d==null){ v=String(v); return /[",\n]/.test(v)? '"'+v.replace(/"/g,'""')+'"' : v; }
  return Number.isFinite(v)? v.toFixed(d) : "";
 },
 csv(){ const out=["﻿"+this.COLS.join(",")]; for(const r of this.rows) out.push(r.map((v,i)=>this.cell(i,v)).join(",")); return out.join("\r\n")+"\r\n"; },
 download(){
  if(!this.rows.length){ toast("走行ログはレースモードで記録されます","#f59e0b"); return; }
  if(this.on) this.add();                                                     // 保存時点の値も入れる
  const d=new Date(), stamp=`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}-${String(d.getHours()).padStart(2,"0")}${String(d.getMinutes()).padStart(2,"0")}`;
  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([this.csv()],{type:"text/csv"})); a.download=`bwsc-log-${stamp}.csv`;
  document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1000);
  toast(`走行ログを保存 (${this.rows.length} 行・${this.stepKm*1000} m ごと)`,"#34d399");
 },
};
