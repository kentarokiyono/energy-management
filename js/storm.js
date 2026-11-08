"use strict";
/* ============ レース中の暴風雨 (雷雨のガストフロント) ============
 実際の天気 (2025 年のデータ) では、2025 年に実際に起きた Day6 14:48 ごろの暴風雨 (突風 最大 140 km/h) を入れる。
 気候値の天気では、3 割の確率で Day3〜6 のどこかに 1 回。オプション「レース中の暴風雨」で切れる。
 いちばん強い突風は雨の降り始め (前縁)。風は西から (進む向きに対して横風になりやすい)。
 ・戦略: 暴風雨の間は止まって待つ前提で計画する (Strategy.simulate)
 ・無線: 偵察車 (30・15・8 分前)、前方誘導車 (2 分前・強い突風の直前)。速度指示は暴風雨の間は止める
 ・見た目: 雲の壁・雨のカーテンなどの前ぶれ (StormFx)、雨 (Rain) */
const Storm={
 /* 突風の並び [前縁からの秒, 最大風速 m/s] (シナリオと共通) */
 gusts(st){ let x=7, t=75; const rnd=()=>((x=(x*16807)%2147483647)/2147483647), out=[[45,st.max]], T=st.dur*3600;
  while(t<T-30){ const f=Math.exp(-t/(T*0.45)); out.push([t,Math.min(st.max*0.9,st.mean*(1.05+0.3*rnd()+0.75*f))]); t+=50+60*rnd(); } return out; },
 /* 風速 [m/s]: t = 前縁からの秒。前縁までは弱く (直前 2 分で少し強まる)、中は平均 + 突風、抜けたら 10 分で収まる */
 speed(st,gusts,t,base){ const T=st.dur*3600;
  if(t<0) return {ms:base+(st.mean*0.5-base)*clamp(1+t/120,0,1),gust:0};
  if(t>T) return {ms:base+(st.mean-base)*clamp(1-(t-T)/600,0,1),gust:0};
  let g=0; for(const [t0,pk] of gusts){ const d=t-t0; if(d<-1||d>13) continue; const f= d<4? clamp(d/4,0,1) : d<7? 1 : clamp(1-(d-7)/5,0,1); g=Math.max(g,(pk-st.mean)*f); }
  return {ms:st.mean*Math.min(1,0.5+t/30)+g,gust:g}; },
 /* レースの暴風雨の予定 (Engine.init の後に 1 回) */
 plan(s){
  s.stormPlan=[]; if(P.mode!=="race"||P.event||s.scenario||P.raceStorm===false) return;
  if(P.realWeather!==false&&typeof RealWx!=="undefined"&&RealWx.ok) s.stormPlan.push({start:5*24+14.8,dur:0.55,mean:17,max:39,to:Math.PI/2,real:true});   // 2025 年 Day6
  else if(Math.random()<0.3){ const d=3+Math.floor(Math.random()*4); s.stormPlan.push({start:(d-1)*24+12+Math.random()*4.5,dur:0.4+Math.random()*0.3,mean:13+Math.random()*3,max:26+Math.random()*8,to:Math.PI*(0.35+0.3*Math.random())}); }
  for(const e of s.stormPlan){ e.g=this.gusts(e); e.said={}; }
 },
 abs(s){ return (s.day-1)*24+s.hour; },
 /* 近い暴風雨 (前縁の 40 分前から、抜けて 10 分後まで) */
 near(s){ if(!s||!s.stormPlan||s.scenario) return null; const a=this.abs(s); return s.stormPlan.find(e=>a>=e.start-0.67&&a<e.start+e.dur+0.17)||null; },
 active(s){ const e=this.near(s), a=s&&this.abs(s); return !!(e&&a>=e.start&&a<e.start+e.dur); },
 /* 風 (Engine.step から): 近いときだけ上書き */
 wind(s){ const e=this.near(s); if(!e) return null; const t=(this.abs(s)-e.start)*3600, w=this.speed(e,e.g,t,s.windSpeed||5);
  if(t<-120) return null; return {ms:Math.max(s.windSpeed||0,w.ms*(1+0.12*s.wGust)),to:e.to+s.wDirDev*0.15}; },
 /* 天気と無線 (Engine.step から) */
 frame(s){
  const e=this.near(s); if(!e) return; const a=this.abs(s), t=(a-e.start)*60, say=(k,msg,who,alarm)=>{ if(e.said[k]) return; e.said[k]=true; Radio.push(msg,who,{speak:true}); if(alarm) Snd.alarm(); };
  const kmh=(e.max*3.6).toFixed(0);
  if(t>=-30&&t<-29) say("30",`前方に発達した雷雨のセル。約 30 分で暴風雨になる見込み。突風は最大 ${e.max.toFixed(0)} m/s (${kmh} km/h) 前後。`,"偵察車");
  if(t>=-15&&t<-14) say("15",`雷雨のセルが近づいています。約 15 分で暴風域。止まる場所 (路肩の広い所) を探してください。`,"偵察車");
  if(t>=-8&&t<-7) say("8","あと約 8 分で暴風域。いちばん強い突風は雨の降り始めに来ます。雨が来る前に路肩に止めてください。","偵察車");
  const ts=(a-e.start)*3600, lead=Math.max(8,3*(P.timeScale||1)), big=e.max, t2=-Math.max(2,(lead+e.g[0][0]+60)/60);   // 雨の予告は、最初の突風の予告より前に
  if(t>=t2&&t<t2+1) say("2","前方で雨が降り始めた。まもなく突風が来ます!","前方誘導車",true);
  for(const [t0,pk] of e.g) if(pk>=big*0.55&&ts>=t0-lead&&ts<t0) say("g"+t0,`突風来ます!(約 ${pk.toFixed(0)} m/s・${(pk*3.6).toFixed(0)} km/h)${s.v*3.6>20?" 減速!":""}`,"前方誘導車",true);
  if(t>=e.dur*60&&t<e.dur*60+1) say("end","暴風域を抜けます。風が弱まったら走行を再開してください。","偵察車");
  // 天気: 暴風雨の間は豪雨 (見た目の雨と、日射の大きな低下)
  const on=a>=e.start&&a<e.start+e.dur;
  if(on&&!(s.weather&&s.weather.storm)) s.weather={type:"squall",factor:0.06,storm:true};
  else if(!on&&s.weather&&s.weather.storm) s.weather=null;
 },
 /* 戦略: 暴風雨の間は止まる。abs がその中なら、抜ける時刻を返す */
 stopUntil(s,abs){ if(!s||!s.stormPlan) return null; for(const e of s.stormPlan) if(abs>=e.start-0.05&&abs<e.start+e.dur) return e.start+e.dur+0.05; return null; },
 /* 前ぶれの見た目用: 前縁までの分と、来る方向 (車から見た前・右の成分) */
 approach(s){ const e=this.near(s); if(!e) return null; const b=profileAt(s.km).bearing, rel=e.to-b;   // 風の向かう向き (車の前 = 0、右 = +)
  return {tMin:(e.start-this.abs(s))*60,dur:e.dur*60,f:-Math.cos(rel),r:-Math.sin(rel)}; },
};
