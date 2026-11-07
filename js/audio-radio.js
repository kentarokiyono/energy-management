"use strict";
const Radio={
log:[], popTimer:null,
push(msg, who="戦略班"){
Snd.radioBeep(); if(typeof RunLog!=="undefined") RunLog.note(`[${who}] ${msg}`);
const t=Engine.st? `${String(Math.floor(Engine.st.hour)).padStart(2,"0")}:${String(Math.floor(Engine.st.hour%1*60)).padStart(2,"0")}` : "";
const warn=/⚠|🚨|超過|警告|危険|失格|ペナルティ|故障|事故/.test(msg);
this.log.unshift(`<div class="msg${warn?" warn":""}"><span class="lb">${t} ${who}</span>${msg}</div>`);
if(this.log.length>6) this.log.pop();
document.getElementById("radio-log").innerHTML=this.log.slice(0,2).join("");
const box=document.getElementById("hud-radio");
if(box){ box.classList.add("flash"); clearTimeout(this.popTimer); this.popTimer=setTimeout(()=>box.classList.remove("flash"),5000); }
document.getElementById("radio-pop-text").textContent=`${who}: ${msg}`;
},
};
/* 音は js/audio.js (Snd) */
