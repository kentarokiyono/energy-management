"use strict";
const Engine = {
st:null,
init(){
const seed=Rng.start(Rng.next||P.wxSeed); Rng.next=0;   // 天気番号: 「同じ天気でもう一度」か設定の番号。無ければ新しい番号
this.st={
seed,
km:0, v:0,
day:1, hour:8.0, dayOfYear:PRO.dayOfYear,
soc:clamp(PRO.startSoc,0,1), whUsed:0, whGen:0, ahUsed:0,
powerMode:false, gLat:0, gLong:0, signal:0,
stopTimer:0, stopKind:"", stopExtra:"", gear:"D", damage:{aero:0,n:0}, crashed:false, crashReason:"", hitCd:0,
morningPenaltyMin:0, extensionMin:0, extWarned:false,
passedCP:new Set(), finished:false, trailered:false, competing:true, dcDone:false, offRoute:false, progRate:1,
drivingHours:0, penaltySec:0, limitTimer:0,
windSpeed:PRO.windBase, windDirWorld:Math.PI/2,
lastSolar:0, lastAmp:0, lastMotorW:0, lastIbat:0, lastNet:0, lastTcell:30, lastGeff:0,
throttleSet:0, brakePhys:0, brakeRegen:0, boostT:0, boostCd:0,
camp:false, disconnected:false, tiltDeg:40, tiltLocked:false, cpPending:null,
bmsOn:true, gridShake:0, gridCount:0, teams:[],
absHourAtPA:null, sunAlt:0, sunAz:0, Tamb:30,
burst:false, fault:null, faultAnnounced:false,
socZeroSec:0, fire:false, fireSec:0, fireReason:"",
weather:null, weatherUntil:0,
radioCd:{}, nextAdvice:0,
TcellDyn:null, Tbat:null, wGust:0, wDirDev:0, lastHead:0, lastRho:1.17,
nextRoadTrainH:0.15+Rng.r("traffic")*0.3,
};
this.st.teams=this.initTeams();
this.setupGrid();
this.st.weatherPlan=this.genWeatherPlan();
this.st.fc=this.genForecast(this.st.weatherPlan);
},
/* 天気予報 (戦略と偵察車の予報が使う): 実際の天気から、選んだ大きさだけずらす。
 気候値の天気: 雲・スコールの時刻・長さ・強さをずらし、予報だけにある雲 (来ない)・予報にない雲 (実際に来る) を混ぜる。
 実際の天気 (2025 年のデータ): 日ごとに時刻をずらし、日射を何割か多め/少なめに見積もる */
FC_LEVEL:{off:null,low:{t:0.25,d:0.15,p:0},mid:{t:0.5,d:0.3,p:0.3},high:{t:1,d:0.5,p:0.55},late:{t:0.5,d:0.3,p:0.3}},
/* 「2025 後半の悪化」: 予報のずれ (中) に加えて、実際の日射が Day4〜6 だけ 15 % 低い (予報は知らない)。2025 年は D4〜6 の日射がかなり落ちた
 「後半の悪化を見込む」(戦略): 戦略の先読みだけ Day4〜6 の日射を 15 % 低く見積もる → 前半から控えめに走り、後半に電池を残す */
LATE_DROP:0.85,
lateK(){ return this.lateKAt(this.st&&this.st.dayOfYear,typeof Strategy!=="undefined"&&Strategy.fcOn); },
/* 通日 doy の日射の倍率。plan: 戦略の先読み (「後半の悪化を見込む」) か、実際の天気 (「2025 後半の悪化」) か */
lateKAt(doy,plan){ const s=this.st; if(!s||P.mode!=="race"||P.event||s.scenario) return 1; const d=doy-PRO.dayOfYear+1; if(d<4||d>6) return 1;
 return plan? (P.planLate? this.LATE_DROP : 1) : (P.fcErr==="late"? this.LATE_DROP : 1); },
/* 予報は毎朝出し直す (issue = その朝の日、0 = Day1)。ずれの大きさは何日先かで変わる: 当日 0.5 倍、1 日先 0.8 倍、… 5 日先 2 倍 */
FC_LEAD(l){ return Math.min(2,0.5+0.3*Math.max(0,l)); },
genForecast(plan,issue){
 const L=this.FC_LEVEL[P.fcErr||"mid"]; if(!L) return null; issue=issue||0;
 const g=()=>Rng.gauss("fc"), fc=[], kOf=(abs)=>this.FC_LEAD(Math.floor(abs/24)-issue);
 for(const w of plan){ const k=kOf(w.start); if(w.start+w.dur<issue*24){ fc.push({...w}); continue; }   // 過ぎた日はそのまま
  if(Rng.r("fc")<Math.min(0.9,L.p*0.4*k)) continue;   // 予報にない雲 (実際には来る)
  fc.push({start:w.start+g()*L.t*k,dur:Math.max(0.2,w.dur*(1+g()*L.d*k)),type:w.type,factor:clamp(w.factor*(1+g()*L.d*k),0.05,0.9)}); }
 for(let day=issue+1;day<=6;day++){ const k=this.FC_LEAD(day-1-issue); if(Rng.r("fc")<Math.min(0.9,L.p*0.4*k)){ const sq=Rng.r("fc")<0.3;   // 予報だけの雲 (実際には来ない)
  fc.push({start:(day-1)*24+9+Rng.r("fc")*7,dur:0.4+Rng.r("fc")*1.2,type:sq?"squall":"cloud",factor:sq?0.15:0.45}); } }
 return {issue,plan:fc.sort((a,b)=>a.start-b.start),shift:[...Array(7)].map((_,d)=>g()*L.t*this.FC_LEAD(d-issue)),scale:[...Array(7)].map((_,d)=>clamp(1+g()*L.d*0.5*this.FC_LEAD(d-issue),0.6,1.4))};
},
/* 毎朝 6 時に予報を出し直す (戦略も新しい予報で立て直す) */
refreshForecast(){ const s=this.st; if(!s||!s.fc||s.scenario||P.mode!=="race") return; const di=s.dayOfYear-PRO.dayOfYear;
 if(s.fc.issue===di||s.hour<6) return; s.fc=this.genForecast(s.weatherPlan,di); if(typeof Strategy!=="undefined") Strategy.last=null; },
genWeatherPlan(){
const plan=[];
for(let day=1;day<=6;day++){
let n=(Rng.r("wx")<(0.3+0.13*day)*PRO.cloudFactor)?1:0;
if(day>=4&&Rng.r("wx")<0.55*PRO.cloudFactor) n++;
for(let i=0;i<Math.min(n,3);i++){
const squall=Rng.r("wx")<0.35;
plan.push({ start:(day-1)*24+9+Rng.r("wx")*7,
dur:0.4+Rng.r("wx")*1.4,
type:squall?"squall":"cloud",
factor:squall?0.15:0.45 });
}
}
return plan.sort((a,b)=>a.start-b.start);
},
/* チャプター (コントロールストップの 2 km 手前から): 標準ペース (巡航 70 km/h・8〜17 時走行・CS 30 分・夜は傾けて充電) で
 スタートからそこまで進めたときの 日・時刻・電池残量 を見積もる */
CHAPTER_KMH:70,
chapterState(targetKm){
 const s=this.st, V=this.CHAPTER_KMH/3.6, dt=0.05, m=massTotal(), Wh=Math.max(500,P.batteryWh);
 const Pd=Model.cruisePower(V,{m})+P.auxW;
 const doy0=s.dayOfYear, km0=s.km;
 let day=1, h=8.0, km=0, soc=clamp(PRO.startSoc,0,1), stopH=0, next=0, dc=false;
 const cs=RP_CS.filter(c=>c.km<targetKm), dck=RP_RULES.driverChange.km;
 const sol=(tilted)=>{ s.dayOfYear=doy0+day-1; s.km=km; const pr=profileAt(km), r=this.solarCalc(pr.lat,h,tilted,pr.lon,pr.elev); return Model.pvSteady(r.G,r.alt,tilted,ambientTemp(pr.lat,h),tilted?3:V); };
 for(let guard=0;guard<20000&&km<targetKm;guard++){
  if(h>=17){ // 夜: 日没まで傾けて充電、翌朝 6〜8 時も充電
   const pr=profileAt(km), sunset=this.sunsetHour(pr.lat,pr.lon);
   for(let t=17;t<sunset;t+=0.25){ h=t; soc=Math.min(1,soc+sol(true)*0.25/Wh); }
   day++; for(let t=6;t<8;t+=0.25){ h=t; soc=Math.min(1,soc+sol(true)*0.25/Wh); } h=8.0; continue; }
  if(stopH>0){ soc=Math.min(1,soc+sol(true)*dt/Wh); stopH-=dt; h+=dt; continue; }
  km+=V*3.6*dt; soc=clamp(soc+(sol(false)-Pd)*dt/Wh,0.03,1); h+=dt;
  if(next<cs.length&&km>=cs[next].km){ km=cs[next].km; next++; stopH=0.5; }
  if(!dc&&km>=dck){ dc=true; stopH=Math.max(stopH,RP_RULES.driverChange.minutes/60); }
 }
 s.dayOfYear=doy0; s.km=km0;
 return {day,hour:clamp(h,8,16.9),soc};
},
/* チャプター開始: CS n (1〜9) の 2 km 手前に置き、通過済みの CS・ドライバー交代・他チームの位置をそろえる */
applyChapter(n){
 const c=RP_CS.find(q=>q.n===n); if(!c) return;
 const s=this.st, km=Math.max(0.5,c.km-2), st=this.chapterState(km);
 s.km=km; s.day=st.day; s.hour=st.hour; s.dayOfYear=PRO.dayOfYear+st.day-1; s.soc=st.soc;
 for(const q of RP_CS) if(q.km<km) s.passedCP.add(q.km);
 if(RP_RULES.driverChange.km<km) s.dcDone=true;
 s.camp=false; s.stopTimer=0;
 for(const tm of s.teams||[]){ tm.status="run"; tm.km=clamp(km+(tm.spd-this.CHAPTER_KMH)/this.CHAPTER_KMH*Math.min(km,500)+(Rng.r("team")-0.5)*40,0,TOTAL_KM-1);   // 速いチームは少し前、遅いチームは後ろ (最大 ±数百 km)
  for(const cp of ROUTE) if(cp.cp&&cp.km<tm.km) tm.cs.add(cp.km); }
 s.chapter=n;
},
/* スタート順 (Day1): 予選タイム順に 1 台ずつ発進し、08:00〜08:30 に全車が出る。
 自車の予選順位は予選モードのベストラップから (未計測なら P18)。AI の予選順は実力順に少しばらつきを入れる */
QUALI_KEY:"bwsc_bestLap", DEFAULT_GRID:18,   // 予選未計測のときのグリッド
gridOfLap(t){ return Math.round(1+(t-141)/3); },   // 予選モードの「推定グリッド」と同じ換算
setupGrid(){
 const s=this.st, tms=s.teams||[], tot=tms.length+1;
 let best=null; try{ best=parseFloat(localStorage.getItem(this.QUALI_KEY)); }catch(e){}
 const g=clamp(best>0? this.gridOfLap(best) : this.DEFAULT_GRID,1,tot);
 const order=tms.map(tm=>({tm,k:tm.spd+(Rng.r("team")-0.5)*10})).sort((a,b)=>b.k-a.k).map(o=>o.tm);
 order.splice(g-1,0,null);   // null = 自車
 const gap=Math.min(1.5,30/Math.max(1,tot-1))/60;   // 発進間隔 [h]
 order.forEach((tm,i)=>{ if(tm){ tm.grid=i+1; tm.delayH=i*gap; } });
 s.grid=g; s.gridStartH=8+(g-1)*gap; s.qualiLap=best>0?best:null;
},
gridWait(){ const s=this.st; return P.mode==="race"&&!P.event&&!s.chapter&&s.day===1&&s.gridStartH>8&&s.hour<s.gridStartH; },
CS_FLAT:5/60,   // [h] CS の最後の何時間はパネルを寝かせる (規則 3.27.10-11: 終了 5 分前からドライバーが走る形に戻す)
/* CS の最後の 5 分 (計時が進んでいる間) */
csFlatEnd(){ const s=this.st; return s.stopKind==="cp"&&s.stopTimer>0&&s.stopTimer<=this.CS_FLAT*3600&&!s.stopHold&&!(s.hour>=17||s.hour<8); },
/* 規則 3.29.1: 開けた道 (制限 80 km/h 以上) で 60 km/h を保てないと競技外。MIN_WIN km ごとの平均で判定し、1 回目は警告。
 止まっている時間 (暴風雨・故障・修理・CS など) と、暴風雨の中・故障やパンクを抱えている間は数えない */
MIN_KMH:60, MIN_WIN:10,
trackMinSpeed(s,dKm,dtS,lim){
 if(P.mode!=="race"||P.event||s.scenario||!s.competing) return;
 if(lim<80||s.v<1||s.fault||s.burst||s.gear==="R"||(typeof Storm!=="undefined"&&Storm.active(s))) return;
 const w=s.minSpd||(s.minSpd={km:0,t:0,warn:0});
 w.km+=dKm; w.t+=dtS; if(w.km<this.MIN_WIN) return;
 const avg=w.km/(w.t/3600); w.km=0; w.t=0;
 if(avg>=this.MIN_KMH){ w.warn=0; return; }
 if(++w.warn===1){ Radio.push(`開けた道の平均が時速 ${avg.toFixed(0)} km です。時速 60 km を保てないと競技外になります (規則 3.29.1)。`,"Event Official"); return; }
 s.competing=false; s.nlcReason=`開けた道で時速 60 km を保てない (平均 ${avg.toFixed(0)} km/h)`;
 Radio.push(`競技外 (no longer competing): ${s.nlcReason}。走行は続けられますが、記録は参考扱いです。`,"Event Official"); toast("⚠ 競技外: 最低速度 60 km/h","#f59e0b");
},
FLAT_BEFORE_START:5/60,   // [h] Day2 以降、朝の発進の何時間前からパネルを寝かせるか
/* 発進前はパネルを寝かせる: Day1 はグリッドの発進の 10 分前、Day2 以降は朝の発進 (遅延ペナルティ込み) の 5 分前から */
tiltEndHour(){ const s=this.st; return s.day===1&&s.gridStartH>8? s.gridStartH-10/60 : this.raceStartHour()-this.FLAT_BEFORE_START; },
preStartFlat(){ const s=this.st; if(P.mode!=="race"||s.hour>=17) return false; const pre=this.gridWait()||(s.camp&&s.hour<this.raceStartHour()); return pre&&s.hour>=this.tiltEndHour(); },
raceStartHour(){ return 8.0 + this.st.morningPenaltyMin/60; },   // 2027 Reg 3.21.1-2: 毎日 08:00 (超過ペナルティ分だけ遅らせる)
/* 17:00 超過の翌朝ペナルティ (Reg 3.21.4): 10 分までは 1 分/分、それ以降は 2 分/分 */
extPenaltyMin(ext){ return Math.ceil(Math.min(ext,10)+2*Math.max(0,ext-10)); },
/* AI チームの車両 (r: 0 = 上位 … 1 = 下位)。2025 年 Challenger の一般的な値の範囲でばらつかせる */
aiVehicle(r){ const j=()=>1+(Rng.r("team")-0.5)*0.06;
 return { socEve:0.12+0.15*Rng.r("team"), vmax:125-35*r, m:(225+70*r)*j(), cda:(0.085+0.05*r)*j(), crr:(0.0036+0.0016*r)*j(), area:4.0, eff:(0.245-0.025*r)*j(), mppt:0.98, wh:3000, eta:0.955-0.03*r, aux:30 }; },
aiDrivePower(tm,v){ const V=tm.veh, F=V.crr*(1+0.003*v)*V.m*GRAV+0.5*1.17*V.cda*v*v; return F*v/V.eta+V.aux; },
aiSolar(tm,tilted){ const pr=profileAt(tm.km), V=tm.veh; return V.area*V.eff*V.mppt*0.92*this.solarCalc(pr.lat,this.st.hour,tilted,pr.lon,pr.elev).G*PRO.solarScale; },
initTeams(){
/* 2025 年大会 Challenger クラスの実在チーム (HV.TEAMS: 看板用に送られた結果のスクショ由来、順位順)。自チーム (和歌山大) を除く */
const SHORT={"BRUNEL SOLAR TEAM":"Brunel","SOLAR TEAM TWENTE":"Twente","INNOPTUS SOLAR TEAM":"Innoptus","TEAM SONNENWAGEN AACHEN":"Sonnenwagen",
 "TOKAI UNIVERSITY SOLAR CAR TEAM":"Tokai","WESTERN SYDNEY SOLAR TEAM":"Western Sydney","UNIVERSITY OF MICHIGAN SOLAR CAR TEAM":"Michigan","JU SOLAR TEAM":"JU Solar",
 "SOLIS UTCN":"SOLIS UTCN","ECLIPSE ÉTS":"Éclipse ÉTS","JOHN VON NEUMANN UNIVERSITY":"Neumann Univ.","αCENTAURI":"αCentauri","CHALMERS SOLAR TEAM":"Chalmers",
 "KOGAKUIN UNIVERSITY SOLAR TEAM":"Kogakuin","OSAKA INSTITUTE OF TECHNOLOGY TEAM REGALIA":"OIT Regalia","TOP DUTCH SOLAR RACING":"Top Dutch","SEOUL NATIONAL UNIVERSITY":"SNU",
 "ANU SOLAR RACING":"ANU","THE IRON LION SOLAR CAR TEAM":"Iron Lion","TUFAST ECO":"TUfast","SNU SOLO":"SNU SOLO","ADELAIDE UNIVERSITY SOLAR RACING TEAM":"Adelaide Univ.",
 "HALMSTAD UNIVERSITY SOLAR TEAM":"Halmstad","AGNIRATH":"Agnirath","SOUTH AUSTRALIAN SOLAR VEHICLE ASSOCIATION":"SASVA"};
const SRC=(typeof HV!=="undefined"&&HV.TEAMS?HV.TEAMS:[]).filter(t=>t&&!/WAKAYAMA/.test(t.team));
const arr=[];
const N=clamp(Math.round(PRO.aiCount),0,SRC.length);
for(let i=0;i<N;i++){
const t=SRC[i], r=N>1?i/(N-1):0;   // 順位が上のチームほど速く、リタイアしにくい
arr.push({ name:SHORT[t.team]||t.team, team:t.team, car:t.car, cc:t.cc, no:t.no, hue:(i*47)%360,
spd:clamp(PRO.aiSpdMax-(PRO.aiSpdMax-PRO.aiSpdMin)*r+(Rng.r("team")-0.5)*8,PRO.aiSpdMin,PRO.aiSpdMax),
km:0, status:"pre", delayH:(i-N/2)*0.5,
retireKm:(Rng.r("team")<PRO.aiRetire*(0.2+1.6*r))? 250+Rng.r("team")*2450 : null,
cs:new Set(), csT:0, latV:-2.4,
soc:0.9+Rng.r("team")*0.1, eff:0.85+Rng.r("team")*0.3,
veh:this.aiVehicle(r), vNow:0, solT:-1, psol:0, psolT:0, decT:-1,
yieldT:0, holdT:0, passing:false, boost:false, askCd:0, reqCd:20+i, otPending:false });
}
return arr;
},
updateTeams(dtS){
const s=this.st;
const startH=8.0;
const racing=s.hour>=startH&&s.hour<17;
for(const tm of s.teams){
if(tm.status==="dnf"||tm.status==="fin") continue;
if(tm.status==="pre"){
if(s.day>1 || s.hour>=8.0+Math.max(0,tm.delayH)){
tm.status="run";

} else continue;
}
const absH=(s.day-1)*24+s.hour, Wh=tm.veh.wh;
if(tm.csT>0||!racing){   // CS 停車中・夜: 傾けて充電 (夕方は日没まで、朝は 6:15 から)
 if(tm.csT>0) tm.csT-=dtS;
 if(tm.ssDay!==s.day){ tm.ssDay=s.day; tm.sunset=this.sunsetHour(profileAt(tm.km).lat); }
 const charging= tm.csT>0 || s.hour>=17&&s.hour<tm.sunset || s.hour>=6.25&&s.hour<8-Engine.FLAT_BEFORE_START;
 if(charging){ if(absH-tm.solT>0.1){ tm.psolT=this.aiSolar(tm,true); tm.solT=absH; } tm.soc=Math.min(1,tm.soc+tm.psolT*dtS/3600/Wh); }
 tm.vNow=0; continue;
}
if(absH-tm.solT>0.05){ tm.psol=this.aiSolar(tm,false); tm.solT=absH; tm.decT=-1; }
if(tm.decT<0||absH-tm.decT>0.05){   // 速度の判断 (3 分ごと): 今の発電 + 「今日の終わりに目標の残量になる」までの電池を使う
 tm.decT=absH;                       // (夜と朝の充電で戻る分を見込み、最終日以外は少し残す。最終日はゴールまでに使い切る)
 const hToday=Math.max(0.3,17-s.hour), remKm=TOTAL_KM-tm.km, vRef=Math.max(50,tm.vNow||tm.spd);
 const lastDay=remKm<=vRef*hToday, hUse=lastDay? Math.max(0.3,remKm/vRef) : hToday, target=lastDay? 0.05 : tm.veh.socEve;
 const budget=tm.psol+Math.max(0,tm.soc-target)*Wh/hUse;
 let lo=5, hi=Math.min(tm.veh.vmax,speedLimitAt(tm.km))/3.6;
 if(this.aiDrivePower(tm,hi)<=budget) lo=hi; else for(let k=0;k<18;k++){ const m=(lo+hi)/2; if(this.aiDrivePower(tm,m)<=budget) lo=m; else hi=m; }
 tm.vSet=lo*3.6;
}
let spd=Math.max(0,(tm.vSet||0)*(tm.boost?1.15:1));
// 自車に後ろから追いついたら、追い越しの許可が出るまで車間 (約 35 m) をとって自車の速さで付いて走る。
// 自車が止まっているとき (停車・CS・夜) は横を抜ける。距離は画面の距離 (早送りの区間も同じ尺度)
if(P.mode==="race"&&!tm.passing&&s.v>=1&&s.stopTimer<=0&&!s.camp&&!s.finished){
 const gap=-Route.relDist(s.km,tm.km,typeof View!=="undefined"? View.relK : 0);   // > 0: 自車が前 (画面と同じ尺度)
 if(gap>-3&&gap<400) spd=Math.min(spd,Math.max(0,s.v*3.6+(gap-35)*0.5));
}
if(tm.sigHold) spd=0;   // 赤信号 (画面に出ているときだけ。View が決める)
// 加速 1.2 m/s²・減速 4 m/s² まで (止まっている車が急に走り出さない)。自車の後ろで車間を詰めすぎるときだけ強めに減速
{ const v0=tm.vNow||0, up=1.2*3.6*dtS, dn=(spd<v0-20? 7 : 4)*3.6*dtS; spd= spd>v0? Math.min(spd,v0+up) : Math.max(spd,v0-dn); }
tm.vNow=spd;
tm.km+=spd*dtS/3600;
tm.soc=clamp(tm.soc+(tm.psol-this.aiDrivePower(tm,spd/3.6))*dtS/3600/Wh,0,1);
if(tm.soc<=0.01){ tm.soc=0.01; tm.decT=-1; }
for(const cp of ROUTE) if(cp.cp&&!tm.cs.has(cp.km)&&tm.km>=cp.km){ tm.cs.add(cp.km); tm.csT=1800; break; }
if(tm.retireKm&&tm.km>=tm.retireKm) tm.status="dnf";
if(tm.km>=TOTAL_KM){ tm.status="fin"; tm.km=TOTAL_KM; }
}
},
sunsetHour(lat,lon){
const s=this.st;
if(lon==null) lon=profileAt(s.km).lon;
return Phys.sunPos(lat,lon,s.dayOfYear,12).sunset;
},
solarCalc(lat,hour,tilted,lon,elev){   // 今の状態 (日付・天気・予報の先読み中か) での日射 → Model.irradiance
const s=this.st;
if(lon==null||elev==null){ const pr=profileAt(s.km); if(lon==null) lon=pr.lon; if(elev==null) elev=pr.elev; }
let real=null;
if(RealWx.on()){ real={shift:0,scale:1}; const fc=s.fc; if(fc&&typeof Strategy!=="undefined"&&Strategy.fcOn&&!Strategy.betNow){ const di=clamp(s.dayOfYear-PRO.dayOfYear,0,6); real={shift:fc.shift[di],scale:fc.scale[di]}; } }   // 予報 (戦略の先読み) は時刻と強さがずれる
return Model.irradiance({lat,lon,elev,doy:s.dayOfYear,hour,tilted,tiltDeg:s.tiltDeg,cloud:s.weather?s.weather.factor:null,real,k:this.lateK()});
},
chargingAllowed(){
const s=this.st;
const prof=profileAt(s.km);
const sunset=this.sunsetHour(prof.lat);
return (s.hour>=6.25&&s.hour<8) || (s.hour>=17&&s.hour<sunset) || (s.hour>=this.raceStartHour()&&s.hour<17);
},
GUST_DT:10,   // [s] 突風の値を決める間隔 (ゲーム内時間)
/* 機械ブレーキ: ペダル (0〜1) → 力 [N]。踏み始めの遊び 6 %、踏み込むほど強く効く (1.5 乗)。
 ディスクの温度: ブレーキの仕事 (力 × 速さ) で上がり、走行風で冷える。250 °C を超えると効きが落ち (フェード)、450 °C で 55 % */
BRAKE:{dead:0.06, pow:1.5, C:550, hA:2.0, fade0:250, fade1:450, fadeMin:0.55},
brakeFade(T){ const B=this.BRAKE; return !(T>B.fade0)? 1 : T>=B.fade1? B.fadeMin : 1-(1-B.fadeMin)*(T-B.fade0)/(B.fade1-B.fade0); },
brakeForce(s,m){ const B=this.BRAKE, p=clamp(((s.brakePhys||0)-B.dead)/(1-B.dead),0,1); return Math.pow(p,B.pow)*PRO.brakeMu*m*GRAV*this.brakeFade(s.brakeT); },
/* 温め: 実時間 dtR のブレーキの仕事。冷え: ゲーム内時間 dtS (時間を早送りしても冷える時間はゲームの時計どおり) */
brakeHeat(s,Fb,v,dtR,dtS,Tamb){ const B=this.BRAKE, Ta=Number.isFinite(Tamb)? Tamb : 30; if(!Number.isFinite(s.brakeT)) s.brakeT=Ta;
 s.brakeT+=(Fb*Math.max(0,v)*(dtR||0)-B.hA*(1+0.08*Math.max(0,v))*(s.brakeT-Ta)*(dtS||0))/B.C;
 if(s.brakeT<Ta) s.brakeT=Ta;
 if(s.brakeT>300&&!s.brakeHotMsg&&typeof Radio!=="undefined"){ s.brakeHotMsg=true; Radio.push(`ブレーキが熱くなっています (${Math.round(s.brakeT)} °C)。効きが落ちるので回生ブレーキを使ってください。`,"チーフ"); }
 if(s.brakeT<200) s.brakeHotMsg=false; },
/* パンク: その車輪だけ転がり抵抗が 8 倍 → 車全体では荷重の配分の分 */
burstCrrK(s){ if(typeof Tire==="undefined") return 8; const w=Tire.params().wh[s.burstWheel==null?0:s.burstWheel]; return w? 1+7*w.share : 8; },
step(dtS,dtR){
const s=this.st;
if(s.finished||s.trailered) return;
this.refreshForecast();   // 朝の予報の出し直し
const prof=profileAt(s.km);
{ // 風: 気候値 + OU過程の突風/風向揺らぎ (時間刻み非依存)
// ゲーム内時間 GUST_DT 秒ごとの値を直線でつなぐ (時間の刻み・早送りの倍率によらず、同じ天気番号なら同じ突風)
const tauS=600, tauD=1800, GD=this.GUST_DT, eS=Math.exp(-GD/tauS), eD=Math.exp(-GD/tauD);
if(s.gust==null) s.gust={acc:0,g0:0,g1:0,d0:0,d1:0};
const gu=s.gust; gu.acc+=dtS;
while(gu.acc>=GD){ gu.acc-=GD; gu.g0=gu.g1; gu.d0=gu.d1;
 gu.g1=clamp(gu.g1*eS+Model.GUST_SD*Math.sqrt(1-eS*eS)*Rng.gauss("gust"),-0.8,1.5); gu.d1=clamp(gu.d1*eD+Model.DIR_SD*Math.sqrt(1-eD*eD)*Rng.gauss("gust"),-1.2,1.2); }
s.wGust=lerp(gu.g0,gu.g1,gu.acc/GD); s.wDirDev=lerp(gu.d0,gu.d1,gu.acc/GD);
const w=Model.wind(prof.lat,prof.lon,s.dayOfYear,s.hour);   // 平均の風 (気候値か 2025 年の天気) + 突風・風向の揺らぎ
s.windSpeed=Math.max(0,w.ms*(1+w.gK*s.wGust)); s.windDirWorld=w.toward+w.dK*s.wDirDev;
const sw=typeof Scenario!=="undefined"&&Scenario.wind(s,prof); if(sw){ s.windSpeed=sw.ms; s.windDirWorld=sw.to; }   // 練習シナリオの横風
const stw=typeof Storm!=="undefined"&&Storm.wind(s); if(stw){ s.windSpeed=stw.ms; s.windDirWorld=stw.to; }   // レース中の暴風雨
}
s.hour+=dtS/3600;
if(s.boostT>0)s.boostT-=dtR; if(s.boostCd>0)s.boostCd-=dtR;
if(s.hour>=24){ s.hour-=24; s.day++; s.dayOfYear++; }
if(s.fire){
s.fireSec+=dtR;
s.v=Math.max(0,s.v-4*dtR);
if(s.fireSec>6){ showResult(); }
return;
}
if(s.weather&&s.weather.storm){}   // 暴風雨の間は Storm が天気を決める
else if(RealWx.on()){
 const pr=profileAt(s.km), cc=RealWx.at("cc",pr.lat,pr.lon,s.dayOfYear,s.hour)||0, typ= cc>=85?"cloud":null;
 if(typ&&!s.weather){ s.weather={type:"cloud",factor:1,real:true}; Radio.push(`雲が厚くなってきました (雲量 ${cc.toFixed(0)} %)。発電量低下に注意`,"偵察車"); }
 else if(!typ&&s.weather&&cc<70){ s.weather=null; Radio.push("雲が切れてきました。日射戻ります。","偵察車"); }
} else if(P.mode==="race"&&s.weatherPlan){
const absH=(s.day-1)*24+s.hour;
const ev=s.weatherPlan.find(w=>absH>=w.start&&absH<w.start+w.dur);
if(ev&&!s.weather){
s.weather={type:ev.type,factor:ev.factor};
Radio.push(ev.type==="squall"?"⚠ スコールに入ります!日射が大きく低下":"曇天域に入ります。発電量低下に注意","偵察車");
} else if(!ev&&s.weather){ s.weather=null; Radio.push("天候回復。日射戻ります。","偵察車"); }
}
if(typeof Storm!=="undefined") Storm.frame(s);   // レース中の暴風雨 (天気・無線)
if(P.mode==="race") this.updateTeams(dtS);
const startH=this.raceStartHour();
const isRaceHours = s.hour>=startH && s.hour<17;
let parked = s.stopTimer>0 || StopMenu.active;
if(this.gridWait()){ parked=true; s.v=0; s.throttleSet=0; s.gridHeld=true; }
else if(s.gridHeld){ s.gridHeld=false; Snd.chime&&Snd.chime(); toast("🏁 スタート!","#34d399"); Radio.push(`グリッド P${s.grid} 発進どうぞ!まずは制限速度に注意。`,"Event Official"); }
if(typeof Crew!=="undefined"&&Crew.locked()){ parked=true; s.v=0; s.throttleSet=0; }   // 乗降手順中・発車許可待ち
if(s.stopTimer>0){
// stopHold: CS で計測開始ボタンを押すまで計時しない。CS の計時は 17:00 で止まり 08:00 に再開 (Reg 3.27.9)
const csPaused= s.stopKind==="cp" && (s.hour>=17 || s.hour<8);
if(csPaused&&!s.csPauseMsg){ s.csPauseMsg=true; Radio.push("17:00 です。コントロールストップの計時は停止し、翌朝 08:00 に再開します。","Event Official"); }
if(!csPaused) s.csPauseMsg=false;
if(!s.stopHold&&!csPaused) s.stopTimer-=dtS; s.v=0;
if(s.stopTimer<=0){
if(s.stopKind==="tire"&&s.burst){ s.burst=false; s.burstWheel=null; toast("🛞 タイヤ交換完了!","#34d399"); }
if(s.stopKind==="check"){ if(s.fault){ s.fault=null; s.faultAnnounced=false; toast("🔍 不具合を修理しました!","#34d399"); } else toast("🔍 機器チェック完了。異常なし","#34d399"); }
if(s.stopKind==="cp") toast("点検完了!係員の指示に従ってコントロールストップを出てください","#34d399");
if(s.stopKind==="driver") toast("🔁 ドライバー交代完了。本線へ戻ってください","#34d399");
if(s.stopKind==="repair"){ s.damage.aero*=0.3; toast("🔧 応急修理完了。残った損傷で空気抵抗が "+(s.damage.aero*100).toFixed(1)+" % 増えています","#34d399"); }
s.stopKind=""; s.tiltLocked=false;
}
} else if(P.mode==="race" && !isRaceHours && !StopMenu.active){
const sunsetNow=this.sunsetHour(prof.lat);
if(!s.camp && s.hour>=17 && s.v>1 && s.hour<sunsetNow){   // Reg 3.21.4: 17:00 以降も日没までは走れる (翌朝の開始が遅れる)
s.extensionMin+=dtS/60;
if(!s.extWarned){ Radio.push("17:00 を超過しています。10 分までは 1 分につき 1 分、それ以降は 2 分、翌朝のスタートが遅れます。日没後は走行禁止です。"); s.extWarned=true; }
if(s.extensionMin>=10&&!s.extWarned2){ Radio.push("超過 10 分。ここからは 1 分につき 2 分のペナルティです。","チーフ"); s.extWarned2=true; }
} else {
if(!s.camp && s.hour>=17){ s.morningPenaltyMin=this.extPenaltyMin(s.extensionMin); if(s.hour>=sunsetNow&&s.v>1) Radio.push("日没です。直ちに停車してください。","Event Official"); this.enterCamp(); }
if(!s.camp && s.hour<startH) s.camp=true;
parked=true; s.v=Math.max(0,s.v-3*dtR);
}
}
const sunset=this.sunsetHour(prof.lat);
// Reg 3.28.8-9: 電池は 19:15 までに切り離して封印、06:15 まで解除できない (夜間の CS も同じ)
s.disconnected = (s.camp || (s.stopKind==="cp"&&s.stopTimer>0)) && (s.hour>=19.25 || s.hour<6.25);
const csFlat = P.csTilt===false && s.stopKind==="cp" && s.stopTimer>0 && !(s.hour>=17||s.hour<8) && !(StopMenu.active&&StopMenu.mode==="charge");   // 17 時以降・朝は CS でも傾ける   // CS で傾けられない運用: 平置きのまま
const tilted = ((parked && !csFlat) || s.camp) && !this.preStartFlat() && !this.csFlatEnd();
const sol=this.solarCalc(prof.lat,s.hour,tilted);
const Tamb=Model.ambient(prof.lat,prof.lon,s.dayOfYear,s.hour);
const phiW=s.windDirWorld-prof.bearing+Math.PI;
const airOverArray=tilted? s.windSpeed : Math.max(0,s.v+s.windSpeed*Math.cos(phiW));
const TcSS=cellTempSS(Tamb,sol.G,airOverArray,tilted);
if(s.TcellDyn==null) s.TcellDyn=TcSS;
s.TcellDyn+=(TcSS-s.TcellDyn)*(1-Math.exp(-dtS/240));
const Tcell=s.TcellDyn;
if(s.Tbat==null) s.Tbat=Tamb;
/* タイヤとモーターの温度 (ゲーム内時間で)。タイヤ: 走ると温まり 5 分ほどで落ち着く (冷えていると転がり抵抗が大きい)。
 モーター: 銅損・鉄損で温まり走行風で冷える (熱いと巻線の抵抗が増えて損失が増え、140 °C を超えると電流を絞る) */
if(!Number.isFinite(s.Ttyre)) s.Ttyre=Tamb; if(!Number.isFinite(s.Tmot)) s.Tmot=Tamb;
s.Ttyre+=(Model.tyreTempSS(Tamb,s.v)-s.Ttyre)*(1-Math.exp(-dtS/300));
Phys.motorRk=Model.motorRk(s.Tmot);
const rho=Phys.airDensity(prof.elev,Tamb); s.lastRho=rho;
let Psolar=Model.pv(sol.G,sol.alt,tilted,Tcell);
if(s.fault&&s.fault.type==="solar") Psolar*=0.3;
if(s.disconnected) Psolar=0;
s.lastGeff=sol.G; s.lastTcell=Tcell; s.lastSolar=Psolar; s.sunAlt=sol.alt; s.sunAz=sol.az; s.Tamb=Tamb;
let Pmotor=0, I_cmd=0; s.lastRegenW=0;
if(!parked && (P.mode!=="race"||isRaceHours)){
const m=massTotal(), mEff=m+PRO.mRot;
// 勾配は実際の標高 (ルートの標高データ) だけで計算する。見た目の道路の起伏は使わない
const slope=(P.event&&typeof EventGame!=="undefined"&&EventGame.hilly&&View.road)? Math.atan(View.roadPoint(View.s).g||0) : prof.slope; s.physSlope=slope;   // イベントの Port Augusta 区間は見た目の坂がそのまま効く
const rw=Model.relWind({ms:s.windSpeed,toward:s.windDirWorld},prof.bearing); s.lastHead=rw.head; s.lastCross=rw.cross;
const rs=Model.resist(s.v,{m,Tamb,Ttyre:s.Ttyre,grade:Math.tan(slope)*(s.gear==="R"?-1:1),head:rw.head,cross:rw.cross,rho,gLat:s.gLat,crrK:s.burst? this.burstCrrK(s) : 1,aeroK:1+((s.damage&&s.damage.aero)||0)});   // 後退では坂の向きが逆。接触による破損で空気抵抗が増える
const Froll=rs.roll, Fdrag=rs.drag, Fcorner=rs.corner, Fslope=rs.slope;
s.lastYawDeg=rs.yaw*180/Math.PI;
let thr=s.throttleSet;
if(s.brakePhys>0.05||s.brakeRegen>0.05){ thr=0; s.throttleSet=0; }
let ampLimit=motorMaxA(s.powerMode);
if(s.boostT>0)ampLimit*=1.25; // 🚀BOOST
if(s.fault&&s.fault.type==="accel") ampLimit*=0.3;
if(s.bmsOn){
if(s.soc<=0.05) ampLimit=Math.min(ampLimit,6);
if(s.soc<=0.003) ampLimit=0;
if(s.Tbat>55) ampLimit*=clamp(1-(s.Tbat-55)/10,0,1); // 高温ディレーティング
if(s.Tmot>140) ampLimit*=clamp(1-(s.Tmot-140)/20,0,1); // モーターの高温
}
if(s.gear==="R") ampLimit=Math.min(ampLimit,REVERSE.maxA);   // 後退: 電流を絞る
I_cmd=thr*ampLimit;
const mm=motorModel(I_cmd,s.v,s.soc,s.powerMode);
{ const mp=motorParams(s.powerMode), Ploss=(mm.Iph||0)*(mm.Iph||0)*mp.R+motorIronW(s.v), hA=3+0.6*Math.max(0,s.v);   // モーターの温度 (熱容量 2500 J/K)
  s.Tmot+=(Ploss-hA*(s.Tmot-Tamb))*dtS/2500; if(s.Tmot<Tamb-5) s.Tmot=Tamb-5; }
let Ftrac=mm.F;
if(s.gear==="R"&&s.v>REVERSE.maxV) Ftrac=0;   // 後退の上限速度
let Fbrake=0, Pregen=0;
if(s.brakePhys>0) Fbrake += this.brakeForce(s,m);   // ペダル → 力 (遊び・踏み込み特性・温度のフェード)
const FbFric=Fbrake;
let Fr=0;
if(s.brakeRegen>0){ const rg=regenModel(s.brakeRegen,s.v,s.soc,s.powerMode); Fr=rg.F; Fbrake+=Fr; Pregen=rg.Pgen; }
/* タイヤが路面へ伝えられる分だけ効く: ロック・空転した車輪は滑る摩擦だけ (View の Tire.step が前のフレームで計算した割合) */
if(dtR>0) s.tireReq={drive:Ftrac,brake:FbFric,regen:Fr};
let Fx=Ftrac-Fbrake;
if(s.tireFx!=null&&Math.abs(s.tireFxReq)>1&&Math.sign(s.tireFxReq)===Math.sign(Fx)) Fx*=clamp(s.tireFx/s.tireFxReq,0,1);
const Fnet=Fx-Froll-Fdrag-Fslope-Fcorner;
const v0=s.v; s.v=Math.max(0,s.v+Fnet/mEff*dtR);
this.brakeHeat(s,FbFric*(s.tireFx!=null&&Math.abs(s.tireFxReq)>1? clamp(s.tireFx/s.tireFxReq,0,1) : 1)*(v0>0.1?1:0),v0,dtR,dtS,Tamb);   // ブレーキの温度 (止まっていれば仕事をしない)
/* 加減速 [G] は実際の速度の変化から (止まっているときにブレーキを踏んでも 0。タイヤの荷重移動・車体の沈み込みに使う)。
 gPitch: 路面に沿う力 (タイヤの前後の力) による沈み込み = 加速度 + 坂の重力の成分 (坂で止まっていても少し傾く) */
if(dtR>0){ const a=(s.v-v0)/dtR; s.gLong=a/GRAV; s.gPitch=(a+Fslope/mEff)/GRAV; }
// 速度は実時間 dtR で変わるが、電力量はゲーム内時間 dtS で積算する。加減速 (運動エネルギーの出入り) の分は
// 実時間でしか起きないので dtR/dtS 倍する (×1 なら同じ)。一定速度を保つ分 (走行抵抗とつり合う力) はそのまま。
const kT= dtS>0? dtR/dtS : 1;
let fM=1, fR=1;                                     // 定常分の割合
if(Fnet>0&&Ftrac>0) fM=clamp(1-Fnet/Ftrac,0,1);     // 加速中: 駆動力のうち加速に使った分
if(Fnet<0&&Fr>0) fR=clamp(1-(-Fnet)/Fr,0,1);        // 減速中: 回生のうち運動エネルギーを回収した分
const LK=LossK.k(), PmotorNow=mm.Pelec*LK-Pregen;   // 消費の補正 (走行ログとの合わせ込み)
Pmotor = mm.Pelec*LK*(fM+(1-fM)*kT) - Pregen*(fR+(1-fR)*kT); s.lastRegenW=Pregen;
s.lastMotorNow=PmotorNow;
const dKm=s.v*dtS/1000*(s.progRate==null?1:s.progRate);   // 本線上の前進分のみ (脇道/逆走では進まない)
const prev=s.km;
s.km=Math.min(TOTAL_KM,s.km+dKm);
if(s.v>0.5) s.drivingHours+=dtS/3600;
this.checkEvents(prev,s.km,dtS,dtR);
for(const gk of GRID_KMS) if(prev<gk&&s.km>=gk){
s.gridShake=0.9; s.gridCount++;
Snd.rattle();
toast("🐄 キャトルグリッド通過 ― 足回りに衝撃","#fbbf24");
}
const lim=speedLimitAt(s.km);
this.trackMinSpeed(s,dKm,dtS,lim);
if(s.v*3.6>lim+5){ s.limitTimer+=dtR;
if(s.limitTimer>3){ s.limitTimer=0; Radio.push(`制限速度${lim}km/hを超過しています。減速してください。`,"後方追走車"); } }
else s.limitTimer=0;
if(View.redSignalKm!=null && prev<View.redSignalKm && s.km>=View.redSignalKm && s.v*3.6>5){
Snd.alarm(); toast("🚨 赤信号を通過しました!","#ef4444"); View.redSignalKm=null; if(P.event) EventGame.onRedRun();
}
} else { this.brakeHeat(s,0,0,0,dtS,Tamb); s.Tmot+=(-3*(s.Tmot-Tamb))*Math.min(dtS,600)/2500; const v0=s.v; s.v=Math.max(0,s.v-3*dtR); if(dtR>0){ s.gLong=(s.v-v0)/dtR/GRAV; s.gPitch=s.gLong; } I_cmd=0; Pmotor=0; }
s.lastAmp=I_cmd; s.lastMotorW=Math.max(0,s.lastMotorNow!=null?s.lastMotorNow:Pmotor); s.lastMotorNow=null;
let Paux = s.disconnected ? 0 : (s.camp?2:P.auxW);
if(s.fault&&s.fault.type==="aux") Paux+=150;
const Pnet = s.disconnected ? 0 : (Pmotor+Paux-Psolar);
const bs=Model.battStep(s.soc,s.Tbat,Pnet,dtS), Voc=bs.Voc, R=bs.R, Ibat=bs.I;
const Vterm=Math.max(0,Voc-Ibat*R);
s.lastVterm=Vterm;
{ // 電池温度: ジュール熱 - 放熱(走行風で強制換気)
const UA=PRO.battUA*(1+0.04*s.v);
s.Tbat+=(Ibat*Ibat*R-UA*(s.Tbat-Tamb))/Math.max(1000,PRO.battCth)*dtS;
if(s.Tbat>50&&!s.radioCd.tbat){ s.radioCd.tbat=true; Radio.push(`⚠ バッテリー温度${s.Tbat.toFixed(0)}°C。電流を抑えてください(55°C超で出力制限)。`); }
else if(s.Tbat<45) s.radioCd.tbat=false;
}
if(P.infiniteBattery) s.soc=clamp(PRO.startSoc,0.5,1);
else s.soc=clamp(bs.soc,0,1);
s.lastIbat=Ibat; s.lastNet=Pnet;
if(Ibat>0) s.ahUsed+=Ibat*dtS/3600;
if(P.event&&s.soc<0.12)s.soc=0.12; // ② 電欠なし=必ずゴール可能
if(Pnet>0) s.whUsed+=Pnet*dtS/3600;
if(!s.disconnected) s.whGen+=Psolar*dtS/3600;
if(s.soc<=0.001 && s.v>1){
s.socZeroSec+=dtS;
if(s.socZeroSec>60&&!s.radioCd.soc0){ Radio.push("⚠ SOC 0%!直ちに停車してください!過放電で危険です!"); s.radioCd.soc0=true; }
if(s.socZeroSec>300) this.ignite("バッテリー過放電による熱暴走");
} else if(s.soc>0.01) { s.socZeroSec=0; s.radioCd.soc0=false; }
if(P.mode==="race" && s.v>3){
if(!s.burst && Rng.r("fault")<0.20*PRO.faultScale*dKmSafe(s,dtS)/TOTAL_KM*(1+0.08*PRO.gridRisk*s.gridCount)){
s.burst=true; s.burstWheel=Math.floor(Rng.r("fault")*(typeof Tire!=="undefined"? Tire.params().wh.length : 3)); Snd.bang(); toast("💥 タイヤバースト!停車してタイヤ交換が必要です","#ef4444");   // どの車輪か (タイヤの計算で片側へ取られる)
Radio.push("タイヤバースト発生!安全に減速して停車後、タイヤ交換を実施してください。");
}
if(!s.fault && Rng.r("fault")<0.20*PRO.faultScale*dKmSafe(s,dtS)/TOTAL_KM*(1+0.04*PRO.gridRisk*s.gridCount)){
const types=[["solar","発電量が急激に低下"],["accel","モーター出力が上がりません"],["aux","消費電力が異常増大"],["telemetry","テレメトリシステム故障"]];
const [ty,msg]=types[Math.floor(Rng.r("fault")*types.length)];
s.fault={type:ty};
Snd.alarm(); toast(`⚠ 電装系不具合: ${msg}`,"#f59e0b");
Radio.push(`電装系に不具合発生(${msg})。停車して機器チェックを推奨します。`);
}
}
this.radioLogic(dtS);
if(s.camp){
const st2=this.raceStartHour();
if(s.hour>=st2 && s.hour<17){
s.camp=false; s.extensionMin=0; s.extWarned=false; s.extWarned2=false; s.tiltLocked=false;
Radio.push(`Day${s.day} スタート!${s.morningPenaltyMin>0?`(延長ペナルティ+${s.morningPenaltyMin}分)`:""}今日も安全第一で。`);
s.morningPenaltyMin=0;
}
}
if(s.km>=TOTAL_KM && !s.finished){ s.finished=true; showResult(); }
},
radioLogic(dtS){
const s=this.st;
if(P.mode!=="race") return;
// ルートノートの右左折・分岐の予告 (500m / 150m 手前)
const nm=Route.nextManeuver(s.km);
if(nm&&nm.name&&!nm.name.startsWith("(")){
 const d=(nm.km-s.km)*1000, act={L:"左折",R:"右折",veerL:"左へ",veerR:"右へ",rab:"ラウンドアバウト",keepL:"左車線キープ",keepR:"右車線キープ",keepS:"直進維持",uturn:"構内で転回"}[nm.turn]||"";
 const key="man_"+nm.km;
 if(d<500&&d>150&&!s.radioCd[key+"a"]){ s.radioCd[key+"a"]=true; Radio.push(`${Math.round(d/50)*50}m 先 ${act} ― ${nm.name}${nm.note?`(${nm.note})`:""}`,"前方誘導車"); }
 if(d<150&&!s.radioCd[key+"b"]){ s.radioCd[key+"b"]=true; Radio.push(`まもなく${act}!${nm.name}`,"前方誘導車"); }
}
const next=RP_CS.find(c=>!s.passedCP.has(c.km)&&c.km>s.km);
if(next){
const d=next.km-s.km;
if(d<10 && !s.radioCd["cs10_"+next.km]){ s.radioCd["cs10_"+next.km]=true;
Radio.push(`あと${d.toFixed(0)}kmでコントロールストップ${next.n}「${next.name}」(${next.note})。クローズ ${fmtAbsH(Route.absHour(next.close))}。`); }
if(d<1.2 && !s.radioCd["cs2_"+next.km]){ s.radioCd["cs2_"+next.km]=true;
 const seq=RP_MANEUVERS.filter(m=>m.km>s.km&&m.km<=next.km+0.01&&m.name&&!m.name.startsWith("(")).map(m=>({L:"左折",R:"右折",veerL:"左へ",veerR:"右へ"}[m.turn]||"")+" "+m.name).join(" → ");
Radio.push(`まもなくCS${next.n}。構内は25km/h、係員の指示に従ってSTOP枠で停車。${seq?"経路: "+seq:""}`,"前方誘導車"); }
}
const dc=RP_RULES.driverChange;
if(!s.dcDone&&dc.km-s.km<2&&dc.km>s.km&&!s.radioCd.dc){ s.radioCd.dc=true;
 Radio.push(`${dc.name}(${dc.km}km)で強制ドライバー交代。左車線からロードトレイン駐車帯へ入り、奥まで進んで停車してください。`,"前方誘導車"); }
s.nextAdvice-=dtS;
if(s.nextAdvice<=0 && s.v>3){
s.nextAdvice=1200;
if(!(typeof Orders!=="undefined"&&Orders.on())) Radio.push(Strategy.text());   // 速度指示を出しているときは、別の推奨速度を流さない
}
if(View.upcomingGrade!==0 && !s.radioCd.gradeMsg){
s.radioCd.gradeMsg=true;
Radio.push(View.upcomingGrade>0?"この先、登り区間入ります。電流に注意。":"この先、下り区間入ります。","偵察車");
setTimeout(()=>s.radioCd.gradeMsg=false, 25000);
}
},
recommendSpeed(){
const s=this.st;
let next=null;
for(const c of ROUTE) if(c.cp&&!s.passedCP.has(c.km)&&c.km>s.km){ next=c; break; }
const dist=next?(next.km-s.km):(TOTAL_KM-s.km);
const m=massTotal();
let out={v:45,pred:0,cs:next?next.name.replace(/\s*\(CS\d\)/,""):"ゴール"};
for(let v=90;v>=40;v-=5){
const vm=v/3.6;
const va=Math.max(0,vm+(s.lastHead||0));
const F=Phys.crr(vm)*m*GRAV+0.5*(s.lastRho||1.17)*P.Cd*P.frontal*va*va;
const Pd=F*vm+motorIronW(vm)+(F/PRO.kt)**2*PRO.rWinding+PRO.ctrlW+0.01*F*vm+P.auxW;
const dWh=(Pd-s.lastSolar)*(dist/v);
const pred=s.soc-dWh/P.batteryWh;
out={v,pred:clamp(pred,0,1),cs:out.cs};
if(pred>=0.5) break;
}
return out;
},
checkEvents(prev,curr,dtS,dtR){
const s=this.st;
if(P.mode!=="race") return;
// ---- コントロールストップ (Route Notes の敷地内で停車) ----
if(s.stopTimer<=0&&!s.offRoute){
 for(const c of RP_CS){
  if(s.passedCP.has(c.km)) continue;
  if(curr>=c.km-0.07&&curr<=c.km+0.12&&s.v<0.8){ this.beginCS(c,false); break; }
  if(curr>c.km+0.3){ this.beginCS(c,true); break; }
  if(c.km>curr) break;
 }
}
// ---- 192 km Emerald Springs 強制ドライバー交代 ----
const dc=RP_RULES.driverChange;
if(!s.dcDone){
 if(curr>=dc.km-0.02&&curr<=dc.km+dc.len&&s.v<0.5&&View.lateral<-View.ROAD_W-1&&s.stopTimer<=0){
  s.dcDone=true; s.stopTimer=dc.minutes*60; s.stopKind="driver"; s.v=0; s.throttleSet=0;
  Snd.chime(); toast(`🔁 ${dc.name} 強制ドライバー交代 (${dc.minutes}分)`,"#34d399");
 } else if(curr>dc.km+dc.len+0.05){
  s.dcDone=true; s.penaltySec+=dc.penaltyMin*60; Snd.alarm();
  Radio.push(`⚠ ${dc.name} の強制ドライバー交代を実施しませんでした。${dc.penaltyMin}分のペナルティです。`,"Event Official");
  toast(`⚠ ドライバー交代未実施 +${dc.penaltyMin}分`,"#ef4444");
 }
}
// ---- 時間制限 → トレーラー輸送 (競技外として継続) ----
const abs=(s.day-1)*24+s.hour;
if(!s.trailering){
 for(const co of RP_RULES.cutoffs){
  if(curr<co.km && abs>Route.absHour(co.by)){ this.trailerTo(Route.csByN(1),`${co.name} を ${fmtAbsH(Route.absHour(co.by)).slice(5)} までに通過できず`); return; }
 }
 if(RP_RULES.katherineBySunset && s.day===1 && curr<322 && s.hour>=this.sunsetHour(profileAt(curr).lat)){ this.trailerTo(Route.csByN(1),"日没までに Katherine へ到達できず"); return; }
 for(const c of RP_CS){
  if(!s.passedCP.has(c.km) && curr<c.km && abs>Route.absHour(c.close)){ this.trailerTo(c,`CS${c.n} ${c.name} の公式クローズ(${fmtAbsH(Route.absHour(c.close))})に間に合わず`); return; }
 }
 const sat=RP_RULES.saturdayNoSouthOfPA;
 if(s.day>=sat.day && curr>=sat.km && curr<TOTAL_KM-0.5){ this.trailerTo({n:10,name:"Victoria Park",km:TOTAL_KM-0.3},"土曜日は Port Augusta 以南を走行できません"); return; }
}
},
/* トレーラーで目的地手前まで輸送 (所要時間 = 距離 / 80 km/h)。以後は競技外 */
trailerTo(c,reason){
 const s=this.st; if(!c) return;
 s.trailering=true; s.competing=false;
 const target=Math.max(s.km,c.km-0.5), hours=(target-s.km)/80;
 Radio.push(`🚚 ${reason}。トレーラーで ${c.name} へ輸送します(約${fmtDur(hours)})。以後は競技外です。`,"Event Official");
 toast(`🚚 トレーラー輸送 → ${c.name}`,"#f59e0b");
 s.hour+=hours; while(s.hour>=24){ s.hour-=24; s.day++; s.dayOfYear++; }
 s.km=target; s.v=0; s.throttleSet=0;
 for(const cc of RP_CS) if(cc.km<target) s.passedCP.add(cc.km);
 if(target>RP_RULES.driverChange.km) s.dcDone=true;
 if(typeof View!=="undefined"&&View.scene){ View.resetRoad(); }
 setTimeout(()=>{ s.trailering=false; },50);
},
beginCS(cp,missed){
const s=this.st;
s.passedCP.add(cp.km); s.cpPending=null;
s.stopTimer=30*60; s.stopKind="cp"; s.cpName=`CS${cp.n} ${cp.name}`; s.v=0; s.throttleSet=0;
if(typeof Crew!=="undefined"&&Crew.on()&&!missed){ s.stopHold=true; Crew.begin("cs",cp); }
if(typeof Coffee!=="undefined") Coffee.onCS(cp);   // 朝に決めたドライバー交代
Snd.chime();
const abs=(s.day-1)*24+s.hour;
if(missed){ toast("🚨 コントロールストップの敷地に入らず通過!その場で30分点検となります","#f59e0b");
 Radio.push(`⚠ CS${cp.n} ${cp.name} に正しく入場しませんでした。`,"Event Official"); }
else toast(`🛑 CS${cp.n} ${cp.name} 到着 ― 30分の強制点検`,"#fbbf24");
if(cp.open && abs<Route.absHour(cp.open)) Radio.push(`CS${cp.n} はまだオープン前(${fmtAbsH(Route.absHour(cp.open))})です。`,"Event Official");
if(P.csTilt===false&&!P.event) Radio.push(`CS${cp.n}: 平置きのまま充電 (CS では傾けない運用)。`); else TiltDecide.open();
if(P.event) EventGame.onCS(cp,missed);
if(cp.n===9){ s.absHourAtPA=abs; Radio.push("Port Augusta 通過!大陸横断おめでとう!","Event Official"); }
},
enterCamp(){
const s=this.st;
s.camp=true; s.v=0;
Radio.push(`Day${s.day} 走行終了。その場でキャンプ設営、日没までティルト充電を行います。`);
if(typeof Crew!=="undefined") Crew.onCamp();
if(typeof Coffee!=="undefined") Coffee.onCamp(s);
TiltDecide.open();
},
/* 当たり判定の結果 (View から): 軽い接触 = 警告 / 破損 = 停車して修理・空力悪化 / 大破 = リタイア */
collision(hit){
 const s=this.st; if(!s||s.crashed||s.fire||hit.level==="touch") return;
 if(P.event){ EventGame.onHit(hit); return; }   // イベント: 減点のみ (リタイアしない)
 const now=performance.now(); if(now<(s.hitCd||0)&&hit.level==="light") return;
 const what=COLLIDE_WHAT[hit.kind]||"障害物", kmh=(hit.vn*3.6).toFixed(0);
 if(typeof Scenario!=="undefined") Scenario.hit();
 if(typeof FFB!=="undefined") FFB.kick(hit.level==="light"?0.5:1,hit.level==="light"?0.4:0.9,hit.level==="light"?220:450);   // 接触・衝突の衝撃
 if(hit.level==="light"){ s.hitCd=now+2500; Snd.alarm(); toast(`⚠ ${what}に接触 (${kmh} km/h)`,"#f59e0b"); Radio.push(`${what}に軽く接触しました (${kmh} km/h)。車体を確認しながら走行を続けてください。`,"チーフ"); return; }
 if(hit.level==="damage"&&s.stopKind==="repair"&&s.stopTimer>0) return;   // 修理停車中の重ねた判定は数えない
 if(hit.level==="damage"){
  const f=clamp((hit.vn-Collide.LIGHT)/(Collide.HEAVY-Collide.LIGHT),0,1), add=0.03+0.12*f, rep=Math.round(15+45*f);
  s.damage.aero+=add; s.damage.n++; s.v=0; s.throttleSet=0;
  s.stopTimer=rep*60; s.stopKind="repair"; s.hitCd=now+4000;
  Snd.bang(); toast(`💥 ${what}と衝突 (${kmh} km/h)・車体破損`,"#ef4444");
  Radio.push(`${what}と衝突 (${kmh} km/h)。車体が破損しました。停車して応急修理 (${rep} 分)。空気抵抗 +${(add*100).toFixed(0)} %。`,"チーフ");
  return; }
 s.crashed=true; s.v=0; s.throttleSet=0;
 s.crashReason= hit.kind==="person"? `歩行者と接触する重大事故 (${kmh} km/h)` : `${what}と激突 (${kmh} km/h)・車両大破`;
 Snd.bang(); Snd.alarm(); toast("💥 事故 ― リタイア","#ef4444");
 Radio.push(s.crashReason+"。レースを続けられません。","チーフ");
 setTimeout(()=>showResult(),1800);
},
/* 横転 (View の横転の危険度から): 車両は大破してリタイア。練習シナリオは失敗で採点 */
rollover(R,v){
 const s=this.st; if(!s||s.crashed||s.fire) return;
 const c=Math.abs(s.lastCross||0), why=R.wind>R.turn*1.5? "横風・突風" : R.turn>R.wind*1.5? "急なハンドル操作" : "横風とハンドル操作";
 s.crashed=true; s.rolledOver=true; s.v=0; s.throttleSet=0;
 s.crashReason=`横転 (${why}・横風 ${c.toFixed(0)} m/s・${(v*3.6).toFixed(0)} km/h)`;
 Snd.bang(); Snd.alarm(); if(typeof FFB!=="undefined") FFB.kick(1,0.9,600); toast("💥 横転 ― リタイア","#ef4444");
 Radio.push(s.crashReason+"。車両が損傷し、レースを続けられません。","チーフ");
 if(typeof Scenario!=="undefined"&&Scenario.cur&&s.scenario){ setTimeout(()=>Scenario.finish(s,false,s.crashReason),1800); return; }
 setTimeout(()=>showResult(),2200);
},
ignite(reason){
const s=this.st;
if(s.fire) return;
if(P.event){ EventGame.onHit({level:"heavy"}); return; }
s.fire=true; s.fireSec=0; s.fireReason=reason;
Snd.bang(); Snd.alarm();
View.startFire();
toast("🔥 車両炎上!!","#ef4444");
},
skipStop(){
const s=this.st;
if(s.stopTimer>0){ if(s.stopHold&&typeof Crew!=="undefined"&&Crew.timing){ Crew.timing.started=true; } s.stopHold=false; s.stopTimer=0.1; }
else if(s.camp){
if(typeof Crew!=="undefined") Crew.forceOutside();
const st2=this.raceStartHour();
const prof=profileAt(s.km);
let wh=0;
const sunset=this.sunsetHour(prof.lat);
for(let h=17;h<sunset;h+=1/12){ const g=this.solarCalc(prof.lat,h,true); wh+=Model.pvSteady(g.G,g.alt,true,ambientTemp(prof.lat,h),3)/12; }
for(let h=6.25;h<st2-this.FLAT_BEFORE_START-1e-6;h+=1/12){ const g=this.solarCalc(prof.lat,h,true); wh+=Model.pvSteady(g.G,g.alt,true,ambientTemp(prof.lat,h),3)/12; }
s.soc=clamp(s.soc+wh*0.5/P.batteryWh,0,1);
s.whGen+=wh*0.5;
if(s.hour>=17){ s.day++; s.dayOfYear++; }
s.hour=st2;
}
},
};
function dKmSafe(s,dtS){ return s.v*dtS/1000; }
