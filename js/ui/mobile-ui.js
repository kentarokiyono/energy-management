"use strict";
/* ============ スマホの画面 (タッチ操作のとき) ============
 いつも出す: 上の 1 行の帯 (時刻・距離・次の CS・順位・制限速度)、小さな地図、速さ・電池・収支 (#m-chip)、速度指示 (#hud-order)。
 たたむ: 無線・エネマネ班の欄・電池のグラフ。#m-bar のボタンで開く (body の m-radio / m-em / m-graph)。
 無線は、たたんでいる間に新しいものが来たらボタンに印を付ける。見た目は css/theme.css の「スマホの画面」 */
const MobileUI={
 init(){
  const bar=document.getElementById("m-bar"); if(!bar||this.bar) return; this.bar=bar;
  bar.querySelectorAll("button[data-k]").forEach(b=>b.addEventListener("click",()=>this.toggle(b.dataset.k)));
  if(typeof Radio!=="undefined"){ const f=Radio.push.bind(Radio); Radio.push=(...a)=>{ const r=f(...a); if(!document.body.classList.contains("m-radio")) bar.classList.add("new"); return r; }; }
  setInterval(()=>this.tick(),400);
 },
 toggle(k){ const c="m-"+k, on=!document.body.classList.contains(c); document.body.classList.toggle(c,on); if(k==="radio"&&on) this.bar.classList.remove("new");
  if(on&&k==="radio") document.body.classList.remove("m-em"); if(on&&k==="em") document.body.classList.remove("m-radio");   // 無線とエネマネ班の欄は同じ所に出るので、どちらか一方
  this.bar.querySelectorAll("button[data-k]").forEach(b=>b.classList.toggle("on",document.body.classList.contains("m-"+b.dataset.k))); },
 tick(){
  if(!document.body.classList.contains("touch-on")||typeof Engine==="undefined"||!Engine.st) return; const es=Engine.st;
  const set=(id,v)=>{ const e=document.getElementById(id); if(e&&e.textContent!==v) e.textContent=v; };
  set("m-spd",String(Math.round(Math.abs(es.v)*3.6)));
  set("m-soc",(es.soc*100).toFixed(0));
  const n=Math.round(es.lastNet||0); set("m-net",(n>0?"+":"")+n);
 },
};
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",()=>MobileUI.init()); else MobileUI.init();
