"use strict";
const Radio={
log:[], popTimer:null,
push(msg, who="戦略班"){
Snd.radioBeep();
const t=Engine.st? `D${Engine.st.day} ${String(Math.floor(Engine.st.hour)).padStart(2,"0")}:${String(Math.floor(Engine.st.hour%1*60)).padStart(2,"0")}` : "";
this.log.unshift(`<span class="text-cyan-500">[${t}|${who}]</span> ${msg}`);
if(this.log.length>6) this.log.pop();
document.getElementById("radio-log").innerHTML=this.log.map(x=>`<div>${x}</div>`).join("");
const pop=document.getElementById("radio-pop");
document.getElementById("radio-pop-text").textContent=`${who}: ${msg}`;
pop.classList.add("radio-show");
clearTimeout(this.popTimer);
this.popTimer=setTimeout(()=>pop.classList.remove("radio-show"),5000);
},
};
const Snd={
ctx:null, master:null, motorOsc:[], motorGain:null, windGain:null, rollGain:null,
fireGain:null, started:false,
init(){
if(this.started) return;
try{
const C=window.AudioContext||window.webkitAudioContext;
this.ctx=new C();
this.master=this.ctx.createGain(); this.master.gain.value=0.5;
this.master.connect(this.ctx.destination);
this.motorGain=this.ctx.createGain(); this.motorGain.gain.value=0;
const mFilter=this.ctx.createBiquadFilter(); mFilter.type="lowpass"; mFilter.frequency.value=3000;
this.motorGain.connect(mFilter); mFilter.connect(this.master);
[[ "sawtooth",1,0.25],["sine",3,0.5],["square",6.02,0.06]].forEach(([type,mult,g])=>{
const o=this.ctx.createOscillator(); o.type=type; o.frequency.value=40;
const og=this.ctx.createGain(); og.gain.value=g;
o.connect(og); og.connect(this.motorGain); o.start();
this.motorOsc.push({o,mult});
});
const noise=this.mkNoise();
const wf=this.ctx.createBiquadFilter(); wf.type="bandpass"; wf.frequency.value=600; wf.Q.value=0.6;
this.windGain=this.ctx.createGain(); this.windGain.gain.value=0;
noise.connect(wf); wf.connect(this.windGain); this.windGain.connect(this.master);
const noise2=this.mkNoise();
const rf=this.ctx.createBiquadFilter(); rf.type="lowpass"; rf.frequency.value=180;
this.rollGain=this.ctx.createGain(); this.rollGain.gain.value=0;
noise2.connect(rf); rf.connect(this.rollGain); this.rollGain.connect(this.master);
const noise3=this.mkNoise();
const ff=this.ctx.createBiquadFilter(); ff.type="bandpass"; ff.frequency.value=900; ff.Q.value=0.4;
this.fireGain=this.ctx.createGain(); this.fireGain.gain.value=0;
noise3.connect(ff); ff.connect(this.fireGain); this.fireGain.connect(this.master);
const noise4=this.mkNoise();
const af=this.ctx.createBiquadFilter(); af.type="lowpass"; af.frequency.value=350;
const ag=this.ctx.createGain(); ag.gain.value=0.015;
noise4.connect(af); af.connect(ag); ag.connect(this.master);
this.started=true;
}catch(e){ console.warn("audio init failed",e); }
},
mkNoise(){
const len=this.ctx.sampleRate*2;
const buf=this.ctx.createBuffer(1,len,this.ctx.sampleRate);
const d=buf.getChannelData(0);
let last=0;
for(let i=0;i<len;i++){ const w=Math.random()*2-1; last=(last+0.02*w)/1.02; d[i]=(w*0.5+last*0.5); }
const src=this.ctx.createBufferSource(); src.buffer=buf; src.loop=true; src.start();
return src;
},
update(vMs,ampFrac,fire){
if(!this.started) return;
const f=30+vMs*13;
this.motorOsc.forEach(m=>m.o.frequency.setTargetAtTime(f*m.mult,this.ctx.currentTime,0.05));
this.motorGain.gain.setTargetAtTime(clamp(0.02+ampFrac*0.16,0,0.2)*clamp(vMs/4+0.2,0.2,1),this.ctx.currentTime,0.08);
this.windGain.gain.setTargetAtTime(clamp((vMs/38)**2*0.35,0,0.4),this.ctx.currentTime,0.15);
this.rollGain.gain.setTargetAtTime(clamp(vMs/40*0.22,0,0.25),this.ctx.currentTime,0.15);
if(this.fireGain) this.fireGain.gain.setTargetAtTime(fire?0.35+Math.random()*0.15:0,this.ctx.currentTime,0.1);
},
blip(freq,dur,type="sine",gain=0.25){
if(!this.started) return;
const o=this.ctx.createOscillator(), g=this.ctx.createGain();
o.type=type; o.frequency.value=freq;
g.gain.setValueAtTime(gain,this.ctx.currentTime);
g.gain.exponentialRampToValueAtTime(0.001,this.ctx.currentTime+dur);
o.connect(g); g.connect(this.master); o.start(); o.stop(this.ctx.currentTime+dur);
},
radioBeep(){ this.blip(1100,0.09); setTimeout(()=>this.blip(1400,0.12),110); },
chime(){ this.blip(880,0.3); setTimeout(()=>this.blip(1174,0.4),150); },
alarm(){ this.blip(400,0.25,"square",0.3); setTimeout(()=>this.blip(400,0.25,"square",0.3),300); },
bang(){
if(!this.started) return;
const src=this.mkNoise(); const g=this.ctx.createGain();
g.gain.setValueAtTime(0.8,this.ctx.currentTime);
g.gain.exponentialRampToValueAtTime(0.001,this.ctx.currentTime+0.6);
src.connect(g); g.connect(this.master);
setTimeout(()=>{try{src.stop()}catch(e){}},700);
},
rattle(){ for(let i=0;i<7;i++) setTimeout(()=>this.blip(110+Math.random()*90,0.05,"square",0.2), i*65); },
horn(){ this.blip(110,1.2,"sawtooth",0.25); this.blip(138,1.2,"sawtooth",0.2); },
};
