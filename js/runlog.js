"use strict";
/* ============ 走行ログ (レースモード): 1 km ごと + 停車中は 10 分ごとに記録し、CSV で保存 ============ */
const RunLog={
 rows:[], lastKm:null, lastAbsH:null, notes:[], on:false,
 COLS:["日","時刻","経過h","km","状態","速度km/h","区間平均km/h","制限km/h","SOC%","電池Wh","端子電圧V","電池電流A","発電W","モーターW","収支W","累積発電Wh","累積消費Wh","日射W/m²","気温°C","セル温度°C","電池温度°C","風速m/s","向かい風m/s","勾配%","標高m","スロットル%","モード","天候","順位","メモ"],
 start(){ this.rows=[]; this.notes=[]; this.lastKm=null; this.lastAbsH=null; this.on=P.mode==="race"&&!P.event; if(this.on) this.add(true); },
 absH(s){ return (s.day-1)*24+s.hour; },
 note(msg){ if(this.on) this.notes.push(String(msg).replace(/<[^>]*>/g,"").replace(/\s+/g," ").trim()); },
 state(s){ return s.finished?"ゴール": s.stopTimer>0?({cp:"CS",tire:"タイヤ交換",check:"点検",driver:"ドライバー交代",repair:"修理"}[s.stopKind]||"停車") : s.camp?"夜営" : (typeof Engine.gridWait==="function"&&Engine.gridWait())?"発進待ち" : s.v>0.5?"走行":"停車"; },
 tick(){
  if(!this.on) return; const s=Engine.st; if(!s) return;
  const kmI=Math.floor(s.km), h=this.absH(s);
  if(kmI!==Math.floor(this.lastKm)) this.add();                               // 1 km ごと
  else if(s.v<0.5&&h-this.lastAbsH>=1/6) this.add();                         // 停車中は 10 分ごと
 },
 add(first){
  const s=Engine.st, h=this.absH(s), pr=profileAt(s.km);
  const avg= !first&&this.lastAbsH!=null&&h>this.lastAbsH? (s.km-this.lastKm)/(h-this.lastAbsH) : 0;
  const rank= s.teams&&s.teams.length? (Engine.gridWait&&Engine.gridWait()? s.grid : 1+s.teams.filter(t=>t.km>s.km).length) : "";
  const f=(x,d)=>Number.isFinite(x)?x.toFixed(d):"";
  const hh=Math.floor(s.hour), mm=Math.floor(s.hour%1*60), ss=Math.floor(s.hour*3600%60);
  this.rows.push([s.day,`${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}`,f(h-8,3),f(s.km,2),this.state(s),
   f(s.v*3.6,1),first?"":f(avg,1),speedLimitAt(s.km),f(s.soc*100,2),f(s.soc*P.batteryWh,0),f(s.lastVterm!=null?s.lastVterm:VOC(s.soc),2),f(s.lastIbat,2),
   f(s.lastSolar,0),f(s.lastMotorW,0),f(-(s.lastNet||0),0),f(s.whGen,0),f(s.whUsed,0),f(s.lastGeff,0),f(s.Tamb,1),f(s.lastTcell,1),s.Tbat!=null?f(s.Tbat,1):"",
   f(s.windSpeed,1),f(s.lastHead,1),f(Math.tan(s.physSlope!=null?s.physSlope:pr.slope)*100,2),f(pr.elev,0),f(s.throttleSet*100,0),s.powerMode?"POWER":"ECO",
   s.weather?(s.weather.type==="squall"?"スコール":"曇天"):"快晴",rank,this.notes.join(" / ")]);
  this.notes=[]; this.lastKm=s.km; this.lastAbsH=h;
 },
 csv(){ const q=v=>{ v=String(v); return /[",\n]/.test(v)? '"'+v.replace(/"/g,'""')+'"' : v; };
  return "﻿"+[this.COLS,...this.rows].map(r=>r.map(q).join(",")).join("\r\n")+"\r\n"; },
 download(){
  if(!this.rows.length){ toast("走行ログはレースモードで記録されます","#f59e0b"); return; }
  if(this.on) this.add();                                                     // 保存時点の値も入れる
  const d=new Date(), stamp=`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}-${String(d.getHours()).padStart(2,"0")}${String(d.getMinutes()).padStart(2,"0")}`;
  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([this.csv()],{type:"text/csv"})); a.download=`bwsc-log-${stamp}.csv`;
  document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1000);
  toast(`走行ログを保存 (${this.rows.length} 行)`,"#34d399");
 },
};
