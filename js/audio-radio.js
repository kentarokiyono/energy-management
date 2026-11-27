"use strict";
const Radio={
log:[], popTimer:null,
push(msg, who="戦略班", opt){
if(opt&&opt.speak||P.tts==="all") Speech.say(msg);
if(typeof Tele!=="undefined") Tele.radio(msg,who);   // テレメトリの監視端末へも
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
/* 無線の読み上げ (ブラウザの音声合成・日本語)。OPTIONS の「読み上げ」: 指示のみ (既定) / すべて / OFF */
const Speech={
 voice:null,
 ok(){ return typeof speechSynthesis!=="undefined"&&typeof SpeechSynthesisUtterance!=="undefined"; },
 pick(){ if(!this.ok()) return null; if(this.voice) return this.voice; const vs=speechSynthesis.getVoices();
  if(typeof I18N!=="undefined"&&I18N.en()) this.voice=vs.find(v=>/^en/i.test(v.lang)&&/Google|Samantha|Daniel|Aria|Jenny|Guy/i.test(v.name))||vs.find(v=>/^en/i.test(v.lang))||null;   // 英語の声
  else this.voice=vs.find(v=>/^ja/i.test(v.lang)&&/Google|Kyoko|Otoya|Haruka|Nanami/i.test(v.name))||vs.find(v=>/^ja/i.test(v.lang))||null; return this.voice; },
 /* 読みやすい形に: 単位を日本語に、記号・絵文字を外す */
 text(msg){ if(typeof I18N!=="undefined"&&I18N.en()) return String(I18N.t(msg)).replace(/<[^>]*>/g,"").replace(/[\u2600-\u27BF\uD83C-\uDBFF\uDC00-\uDFFF]/g,"").replace(/km\/h/g,"kilometres per hour").replace(/(\d)\s*A\b/g,"$1 amps").replace(/·/g,",").trim();
  return String(msg).replace(/<[^>]*>/g,"").replace(/[\u2600-\u27BF\uD83C-\uDBFF\uDC00-\uDFFF]/g,"")
  .replace(/km\/h/g,"キロ").replace(/(\d)\s*km/g,"$1キロ").replace(/(\d)\s*A\b/g,"$1アンペア").replace(/(\d)\s*%/g,"$1パーセント").replace(/(\d)\s*W\b/g,"$1ワット").replace(/・/g,"、").trim(); },
 say(msg){
  if(!this.ok()||P.tts==="off"||!msg) return;
  try{ if(speechSynthesis.speaking&&speechSynthesis.pending) speechSynthesis.cancel();   // たまったら古いものは捨てる
   const u=new SpeechSynthesisUtterance(this.text(msg)); u.lang= typeof I18N!=="undefined"&&I18N.en()? "en-US" : "ja-JP"; const v=this.pick(); if(v) u.voice=v; u.rate=1.1; u.volume=0.9; speechSynthesis.speak(u); }catch(e){}
 },
 stop(){ try{ if(this.ok()) speechSynthesis.cancel(); }catch(e){} },
};
if(typeof speechSynthesis!=="undefined"&&speechSynthesis.addEventListener) speechSynthesis.addEventListener("voiceschanged",()=>{ Speech.voice=null; });
/* 音は js/audio.js (Snd) */
