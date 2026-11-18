"use strict";
/* ============ 音: 録音を使わず、実物の仕組みに沿ってその場で作る ============
 ・モーター: 交流モーターをインバーターで回す前提。回転の音 (速度に比例) に、低速で加速するときの
   インバーターの「ヒュイーン」(一定の高さのキャリア音と、その上下に回転に合わせて動く音) を重ねる
 ・タイヤ: 路面 (町のなめらかな舗装 / 郊外の荒い舗装 / 路肩の砂利) で音色を変える。橋のつなぎ目で「トン」
 ・風: 対気速度の 2 乗で強くなる低い「ゴー」と高い「シュー」、キャノピーの細い笛鳴り。突風で揺れる
 ・車内 (運転席の視点): 狭い車体の反響をかける。実車の車内で撮った動画 (約 70 km/h) の音の特徴に合わせて、
   低い「ゴー」(40〜80 Hz、いちばん大きい)・車体の殻が鳴る帯 (330・500・770・1240 Hz)・2 kHz より上は殻にさえぎられて小さい・
   8.8 kHz の細い音・路面の凸凹でガタガタ (タイヤの荷重の揺れ = Susp の計算に合わせて強弱、ときどき部品がカタカタ鳴る) を足す
 ・対向のロードトレイン: 低いディーゼル音。近づくと高く、離れると低く (ドップラー効果)、右側から聞こえる
 ・案内音: 無線は「ザッ」というスケルチ、ウインカーはリレーの「カチ」、ボタンは短いクリック */
const Snd={
 ctx:null, started:false, FC:1050,   // インバーターのキャリア周波数 [Hz] (低速域)
 init(){
  if(this.started) return;
  try{
   const C=window.AudioContext||window.webkitAudioContext, c=this.ctx=new C();
   this.out=c.createDynamicsCompressor(); this.out.threshold.value=-18; this.out.ratio.value=3; this.out.connect(c.destination);
   this.master=c.createGain(); this.master.gain.value=0.55;
   // 車内の反響 (運転席の視点で混ぜる)
   this.dry=c.createGain(); this.wet=c.createGain(); this.wet.gain.value=0;
   const conv=c.createConvolver(); conv.buffer=this.room(0.22,2800);
   this.cabEq=c.createBiquadFilter(); this.cabEq.type="highshelf"; this.cabEq.frequency.value=1800; this.cabEq.gain.value=0;   // 車内: 高い音は殻にさえぎられる
   this.master.connect(this.cabEq); this.cabEq.connect(this.dry); this.cabEq.connect(conv); conv.connect(this.wet); this.dry.connect(this.out); this.wet.connect(this.out);
   this.ui=c.createGain(); this.ui.gain.value=0.6; this.ui.connect(this.out);                 // 案内音は反響なし
   // ---- モーター (交流モーター + インバーター) ----
   // 回転の音: 前の版と同じ 3 つの波 (のこぎり波 1 倍・サイン 3 倍・矩形 6 倍)。高さは速度に比例
   this.motorBus=c.createGain(); this.motorBus.gain.value=0;
   const mLp=c.createBiquadFilter(); mLp.type="lowpass"; mLp.frequency.value=3000; this.motorBus.connect(mLp); mLp.connect(this.master);
   this.motorOsc=[["sawtooth",1,0.25],["sine",3,0.5],["square",6.02,0.06]].map(([type,mult,g])=>{ const o=c.createOscillator(); o.type=type; o.frequency.value=40; const og=c.createGain(); og.gain.value=g; o.connect(og); og.connect(this.motorBus); o.start(); return {o,mult}; });
   // インバーター: 低速では一定の高さのキャリア音 (非同期 PWM) と、その上下に回転に合わせて動く側帯が鳴る
   this.invBus=c.createGain(); this.invBus.gain.value=0; const iLp=c.createBiquadFilter(); iLp.type="lowpass"; iLp.frequency.value=4500; this.invBus.connect(iLp); iLp.connect(this.master);
   this.carrier=[[0,0.5],[-2,0.3],[2,0.3],[-4,0.1],[4,0.1]].map(([k,g])=>{ const o=c.createOscillator(); o.type="sine"; o.frequency.value=this.FC; const og=c.createGain(); og.gain.value=g; o.connect(og); og.connect(this.invBus); o.start(); return {o,k}; });
   // ---- タイヤ・路面 ----
   const brown=this.noise(true);
   this.tyre=this.band(brown,0,0,0,"lowpass",180); this.tyre.out.connect(this.master);
   this.grain=this.band(this.noise(),2200,0.8,0); this.grain.out.connect(this.master);       // 荒い舗装・砂利のザラザラ
   // ---- 風 ----
   this.windLo=this.band(this.noise(true),220,0.7,0); this.windLo.out.connect(this.master);
   this.windHi=this.band(this.noise(),2600,0.7,0); this.windHi.out.connect(this.master);
   this.whistle=this.band(this.noise(),1700,14,0); this.whistle.out.connect(this.master);
   // ---- タイヤの鳴き (滑る・ロック。小さめ) ----
   this.squeal=this.band(this.noise(),1150,9,0); this.squeal.out.connect(this.master);
   // ---- 火災 ----
   this.fire=this.band(this.noise(),900,0.4,0); this.fire.out.connect(this.master);
   // ---- 雨 (粒の音・路面のザー) ----
   this.rainHi=this.band(this.noise(),5200,0.35,0); this.rainHi.out.connect(this.master);
   this.rainLo=this.band(this.noise(true),850,0.45,0); this.rainLo.out.connect(this.master);
   // ---- 車内の走行音 (運転席の視点だけ) ----
   this.cab=c.createGain(); this.cab.gain.value=0; this.cab.connect(this.master);
   this.cabRough=c.createGain(); this.cabRough.gain.value=1; this.cabRough.connect(this.cab);   // 路面の凸凹 (タイヤの荷重の揺れ) で強弱
   const cbn=this.noise(true), cwn=this.noise();
   this.boom=this.band(cbn,57,2.2,1.0); this.boom.out.connect(this.cabRough);                   // 低い「ゴー」(車体がこもって鳴る)
   this.boom2=this.band(cbn,95,1.4,0.35); this.boom2.out.connect(this.cabRough);
   this.shell=[[330,3,1.6],[410,4,0.45],[505,4,0.2],[640,4,0.16],[765,4,0.08],[1240,5,0.15],[220,2,0.13],[1700,1.2,0.09],[3000,1,0.025]].map(([f,q,g])=>{ const b=this.band(cwn,f,q,g); b.out.connect(this.cabRough); return {b,f}; });   // 殻の鳴り
   this.cabTone=c.createOscillator(); this.cabTone.type="sine"; this.cabTone.frequency.value=8800; const ctg=c.createGain(); ctg.gain.value=0.02; this.cabTone.connect(ctg); ctg.connect(this.cab); this.cabTone.start();   // 8.8 kHz の細い音
   this.rattleT=0; this.excS=0;
   this.trucks=new Map(); this.lastKm=null; this.started=true;
  }catch(e){ console.warn("audio init failed",e); }
 },
 /* 雑音源: 白色 / 褐色 (低い音が多い) */
 noise(brown){ const c=this.ctx, len=c.sampleRate*3, b=c.createBuffer(1,len,c.sampleRate), d=b.getChannelData(0); let l=0;
  for(let i=0;i<len;i++){ const w=Math.random()*2-1; if(brown){ l=(l+0.02*w)/1.02; d[i]=l*3.5; } else d[i]=w*0.6; }
  const s=c.createBufferSource(); s.buffer=b; s.loop=true; s.start(); return s; },
 band(src,f,q,g,type="bandpass",fLp){ const c=this.ctx, fl=c.createBiquadFilter(); fl.type=type; fl.frequency.value=fLp||f; if(q) fl.Q.value=q; const gn=c.createGain(); gn.gain.value=g; src.connect(fl); fl.connect(gn); return {f:fl,g:gn,out:gn}; },
 room(sec,lp){ const c=this.ctx, n=Math.floor(c.sampleRate*sec), b=c.createBuffer(2,n,c.sampleRate);
  for(let ch=0;ch<2;ch++){ const d=b.getChannelData(ch); let l=0; for(let i=0;i<n;i++){ const w=(Math.random()*2-1)*Math.pow(1-i/n,3.2); l+=(w-l)*Math.min(1,lp/c.sampleRate*6.28); d[i]=l; } }
  return b; },
 set(p,v,t=0.08){ p.setTargetAtTime(v,this.ctx.currentTime,t); },
 /* 走行の音をすべて止める (ゴール・リタイア・一時停止・メニューへ戻る)。次の update で戻る */
 silence(){
  if(!this.started||this.muted) return; this.muted=true;
  this.set(this.master.gain,0,0.12);
  for(const [rt,T] of this.trucks){ this.set(T.g.gain,0,0.1); setTimeout(()=>{ try{ T.o.stop(); T.o2.stop(); }catch(e){} },600); } this.trucks.clear();
 },
 /* 毎フレーム: v [m/s], 電流の割合 (0〜1), 炎上中か */
 update(vMs,ampFrac,fire){
  if(!this.started) return;
  if(this.muted){ this.muted=false; this.set(this.master.gain,0.55,0.15); }
  const es=typeof Engine!=="undefined"&&Engine.st, v=Math.max(0,vMs||0), now=this.ctx.currentTime;
  const regenW= es&&es.lastRegenW>0? es.lastRegenW : 0;
  // ---- モーター ----
  const load=clamp(Math.abs(ampFrac||0),0,1), rg=clamp(regenW/700,0,1), f=30+v*13;    // 回転の音の高さ (前の版と同じ)
  for(const m of this.motorOsc) this.set(m.o.frequency,f*m.mult,0.05);
  this.set(this.motorBus.gain,clamp(0.02+load*0.16+rg*0.08,0,0.22)*clamp(v/4+0.2,0.2,1)*(this.inCab?0.35:1),0.08);   // 車内: 回転の音は殻・タイヤの音に埋もれる (動画では目立たない)
  // インバーター: キャリアの上下に「回転の高さ × 2」ずつ離れた音。加速で強く、速度が上がると (約 50 km/h まで) 消える
  const fe=f*0.5;
  for(const k of this.carrier) this.set(k.o.frequency,Math.max(20,this.FC+k.k*fe),0.04);
  this.set(this.invBus.gain,(0.08*load+0.035*rg)*clamp(1-v/14,0,1)*clamp(v/0.6,0,1),0.06);
  // ---- 路面 ----
  let rough=0.55, gravel=false;
  if(es&&P.mode==="race"&&typeof View!=="undefined"&&View.road&&View.roadPoint){
   const km=es.km; rough= (isCity(km)||townProx(km)<2.5)? 0.25 : 0.6;
   try{ const p=View.roadPoint(View.s); gravel= View.lateral<-(p.L+0.3)||View.lateral>p.R+0.3; }catch(e){}
   if(this.lastKm!=null&&typeof LANDMARKS!=="undefined") for(const lm of LANDMARKS) if(lm.t==="bridge"){ for(const e of [lm.km-0.025,lm.km+0.025]) if(this.lastKm<e&&km>=e) this.thump(0.5); }
   this.lastKm=km;
  }
  const inTest=P.mode==="test"&&typeof Test!=="undefined"&&Test.active;   // テスト走行 (ヒドゥンバレー): コースは舗装、外は土
  if(inTest){ rough=0.6; gravel=!!Test.offTrack; }
  if(gravel) rough=1.4;
  const sp=clamp(v/30,0,1.4);
  this.set(this.tyre.f.frequency,120+v*9+(gravel?300:0),0.2);
  this.set(this.tyre.g.gain,0.10*Math.pow(sp,0.9),0.12);
  this.set(this.grain.g.gain,0.05*rough*Math.pow(sp,1.2)*(gravel?2:1),0.1);
  this.set(this.grain.f.frequency,gravel?3200:1900+v*20,0.2);
  // ---- 風 (対気速度) ----
  const head= es&&Number.isFinite(es.lastHead)? es.lastHead : 0, gust= es&&Number.isFinite(es.wGust)? es.wGust : 0;
  const air=Math.max(0,v+head*0.8), a=clamp(air/30,0,1.6), wob=1+0.25*gust;
  this.set(this.windLo.g.gain,0.10*a*a*wob,0.25);
  this.set(this.windHi.g.gain,0.035*a*a*wob,0.25); this.set(this.windHi.f.frequency,1800+air*35,0.3);
  this.set(this.whistle.g.gain,air>16? 0.012*(a-0.5)*wob : 0,0.4); this.set(this.whistle.f.frequency,1300+air*28,0.4);
  this.set(this.fire.g.gain,fire?0.3+Math.random()*0.15:0,0.1);
  // タイヤの鳴き: いちばん滑っている車輪の強さ (ロック・空転 1、横に滑る 0.6、使い切る手前 0.15)。舗装の上だけ、小さめ
  { const W=es&&es.tireW; let k=0; if(W&&!gravel&&!(es&&es.offroad)) for(const w of W) k=Math.max(k,w.lock? 1 : w.slide? 0.6 : (w.use||0)>0.97? 0.15 : 0);
   const sq=k*clamp((v-2)/8,0,1); this.set(this.squeal.g.gain,0.035*sq,0.06); this.set(this.squeal.f.frequency,1000+k*250+Math.random()*60,0.05); }
  // ---- 車内の反響 ----
  const inCab=this.inCab=typeof View!=="undefined"&&View.cam===2&&(P.mode!=="test"||inTest);
  this.set(this.wet.gain,inCab?0.55:0,0.3); this.set(this.dry.gain,inCab?0.8:1,0.3);
  this.cabin(inCab,v,rough,gravel);
  this.trucksFrame(v);
 },
 /* 車内の走行音: 速さで大きく (約 70 km/h で実車の動画と同じ釣り合い)、路面の凸凹 (タイヤの荷重の揺れ、70 km/h の郊外の舗装で約 0.11) で強弱。
  凸凹が大きいほど部品がカタカタ鳴る */
 cabin(on,v,rough,gravel){
  const S= P.mode==="test"&&typeof Test!=="undefined"&&Test.active? Test.susp : typeof View!=="undefined"&&View.susp, p=S&&S.Ft&&typeof Susp!=="undefined"? Susp.params() : null;
  let exc= p&&p.wh.length===S.Ft.length? S.Ft.reduce((a,F,i)=>a+Math.abs(F-p.wh[i].F0)/p.wh[i].F0,0)/S.Ft.length : 0.11*rough/0.6*clamp(v/19.4,0,1.5);
  if(!Number.isFinite(exc)) exc=0;
  this.excS+=(exc-this.excS)*0.35; const rel=clamp(this.excS/0.11,0,5), sp=clamp(v/19.4,0,1.5);
  this.set(this.cab.gain,on? 0.5*Math.pow(sp,1.3) : 0,0.15);
  this.set(this.cabRough.gain,clamp(0.55+0.45*rel,0.3,2.5),0.03);   // ガタガタ (フレームごとの荷重の揺れに合わせて)
  this.set(this.cabEq.gain,on? -15 : 0,0.3);
  // 部品のカタカタ: 凸凹の強さと速さに比例した回数 (70 km/h の郊外で毎秒約 3 回)
  if(on&&v>2&&!this.muted){ this.rattleT-=1/60; if(this.rattleT<=0){ const k=Math.min(4,rel*sp*(gravel?2:1)); this.rattleT=k>0.05? (0.15+Math.random()*0.5)/k : 1;
    if(k>0.05){ this.burst(900+Math.random()*1600,4+Math.random()*4,0.02+Math.random()*0.03,0.05*Math.min(2,0.6+0.4*k),this.cab); if(rel>1.6&&Math.random()<0.4) this.thump(0.15*Math.min(3,rel)); } } }
 },
 /* 対向のロードトレイン (ディーゼルの低音 + 走行音)。近づく/遠ざかるで音程が変わる */
 trucksFrame(v){
  const c=this.ctx, list= typeof View!=="undefined"&&View.roadTrains? View.roadTrains : [], seen=new Set();
  for(const rt of list){ const rel=rt.sVis-View.s; if(Math.abs(rel)>900) continue; seen.add(rt);
   let T=this.trucks.get(rt);
   if(!T){ const o=c.createOscillator(); o.type="sawtooth"; const o2=c.createOscillator(); o2.type="sawtooth";
    const lp=c.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=700; const rum=this.band(this.noise(true),0,0,1,"lowpass",260);
    const g=c.createGain(); g.gain.value=0; const pan=c.createStereoPanner?c.createStereoPanner():c.createGain();
    o.connect(lp); o2.connect(lp); lp.connect(g); rum.out.connect(g); g.connect(pan); pan.connect(this.master); o.start(); o2.start();
    T={o,o2,g,pan,rum}; this.trucks.set(rt,T); }
   const vr= rel>0? 27+v : -(27+v), dop=343/(343-vr*0.9), d=Math.hypot(rel,5);
   const f0=36*dop*(1+0.04*Math.sin(c.currentTime*1.3));
   this.set(T.o.frequency,f0,0.05); this.set(T.o2.frequency,f0*1.5,0.05);
   this.set(T.g.gain,clamp(1.4/(1+(d/22)**2),0,0.35),0.05);
   if(T.pan.pan) this.set(T.pan.pan,clamp(5/d,0,0.85),0.05); }
  for(const [rt,T] of this.trucks) if(!seen.has(rt)){ this.set(T.g.gain,0,0.2); setTimeout(()=>{ try{ T.o.stop(); T.o2.stop(); }catch(e){} },800); this.trucks.delete(rt); }
 },
 /* ---------- 単発の音 ---------- */
 env(node,peak,att,dec,dest){ const c=this.ctx, g=c.createGain(), t=c.currentTime; g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(peak,t+att); g.gain.exponentialRampToValueAtTime(0.0001,t+att+dec); node.connect(g); g.connect(dest||this.ui); return g; },
 tone(freq,dur,gain=0.2,type="sine",dest){ if(!this.started) return; const c=this.ctx, o=c.createOscillator(), lp=c.createBiquadFilter(); o.type=type; o.frequency.value=freq; lp.type="lowpass"; lp.frequency.value=Math.min(6000,freq*4);
  o.connect(lp); this.env(lp,gain,0.006,dur,dest); o.start(); o.stop(c.currentTime+dur+0.05); },
 burst(f,q,dur,gain,dest){ if(!this.started) return; const c=this.ctx, n=c.createBufferSource(); n.buffer=this.burstBuf||(this.burstBuf=this.noiseBuf(0.6)); const bp=c.createBiquadFilter(); bp.type="bandpass"; bp.frequency.value=f; bp.Q.value=q;
  n.connect(bp); this.env(bp,gain,0.002,dur,dest); n.start(); n.stop(c.currentTime+dur+0.05); },
 noiseBuf(sec){ const c=this.ctx, b=c.createBuffer(1,Math.floor(c.sampleRate*sec),c.sampleRate), d=b.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1; return b; },
 /* 従来の呼び出し (高さ・長さ) は、やわらかい音色で鳴らす */
 blip(freq,dur,type="sine",gain=0.25){ this.tone(freq,Math.max(0.04,dur),gain*0.8,type==="square"||type==="sawtooth"?"triangle":type); },
 click(){ this.burst(3200,6,0.018,0.25); this.tone(1800,0.02,0.05); },
 relay(on){ this.burst(on?2600:1900,9,on?0.012:0.009,on?0.22:0.12); this.burst(on?600:450,3,0.02,on?0.08:0.05); },
 radioBeep(){ if(!this.started) return; this.burst(1600,0.9,0.09,0.22); setTimeout(()=>this.tone(1250,0.05,0.06),95); },
 chime(){ for(const [f,t] of [[784,0],[1046,0.13]]) setTimeout(()=>{ this.tone(f,0.55,0.16); this.tone(f*4,0.08,0.03); },t*1000); },
 alarm(){ for(let i=0;i<2;i++) setTimeout(()=>{ this.tone(880,0.13,0.17,"triangle"); setTimeout(()=>this.tone(660,0.16,0.17,"triangle"),150); },i*340); },
 thump(k=1){ if(!this.started) return; const c=this.ctx, o=c.createOscillator(), t=c.currentTime; o.type="sine"; o.frequency.setValueAtTime(110,t); o.frequency.exponentialRampToValueAtTime(42,t+0.12);
  this.env(o,0.35*k,0.003,0.16,this.master); o.start(); o.stop(t+0.25); this.burst(300,1,0.05,0.12*k,this.master); },
 bang(){ if(!this.started) return; this.thump(1.6); this.burst(1200,0.6,0.45,0.5,this.master); for(let i=0;i<5;i++) setTimeout(()=>this.burst(2500+Math.random()*2500,6,0.05,0.12,this.master),80+i*70+Math.random()*40); },
 rattle(){ for(let i=0;i<9;i++) setTimeout(()=>{ this.burst(2400+Math.random()*900,5,0.035,0.2,this.master); this.thump(0.35); },i*55); },   // キャトルグリッドの鉄の格子
 /* 雷鳴: 低い音の長い轟き (近いほど大きく鋭い) */
 thunder(k=1){ if(!this.started) return; const c=this.ctx, t=c.currentTime, src=c.createBufferSource(); src.buffer=this.thBuf||(this.thBuf=this.noiseBuf(5));
  const lp=c.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=140+260*clamp(k,0,1); const g=c.createGain(); g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(0.25+0.6*clamp(k,0,1),t+0.06+0.3*(1-clamp(k,0,1))); g.gain.exponentialRampToValueAtTime(0.0001,t+4.2);
  src.connect(lp); lp.connect(g); g.connect(this.master); src.start(t); src.stop(t+4.5); },
 horn(){ if(!this.started) return; const c=this.ctx, t=c.currentTime, bp=c.createBiquadFilter(); bp.type="bandpass"; bp.frequency.value=600; bp.Q.value=0.8;
  const pan=c.createStereoPanner?c.createStereoPanner():c.createGain(); if(pan.pan) pan.pan.value=0.6; bp.connect(pan); pan.connect(this.master);
  for(const f of [185,233,277]){ const o=c.createOscillator(); o.type="sawtooth"; o.frequency.value=f; const g=c.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.09,t+0.06); g.gain.setValueAtTime(0.09,t+1.1); g.gain.exponentialRampToValueAtTime(0.0001,t+1.4);
   o.connect(g); g.connect(bp); o.start(); o.stop(t+1.5); } },
};
