"use strict";
/* ============ 傾向: 速い計算 (裏のスレッド。ゲームの他のファイルに頼らない) ============
 1 本 = ある条件 (天気の年・揺らぎ・予報のずれ・車両・レース) で、ある方針 (走り方) が Darwin → Adelaide を走った結果。
 2 km の区間ごとに: その時刻・地点の実際の天気から発電、走行電力の表 (速度 × 勾配) と向かい風から消費、電池を進める。
 CS (30 分 + 待ち + 方針の追加充電、傾けて充電)、ドライバー交代 (5 分)、17 時に止まり日没まで・朝 6:15 から 8 時まで傾けて充電。
 失敗: 電池切れ・CS の締め切り・Katherine に Day1 の日没まで・Day6 17 時までにゴールできない (土曜は Port Augusta より南を走れない)・暴風雨で横転。
 方針: 1〜3 時間ごと (と朝) に、予報 (ずれ入り) で「電池の下限を割らずにゴールまで走れる一番速い一定速度」を見積もる (締め切りに間に合うかは走った結果で判定)。
  区間の速度 = その速度 × 勾配の調整 × 曇りの減速 × 満充電の上げ。制限速度・モーターの上限で切る。暴風雨は前縁の何分前に止まるか */
let C=null;   // 事前計算 (ゲーム側から 1 回だけ受け取る)
const D2R=Math.PI/180;
function sunPos(lat,lon,doy,clockH){ const B=2*Math.PI*(doy-81)/364, eot=9.87*Math.sin(2*B)-7.53*Math.cos(B)-1.5*Math.sin(B), solarH=clockH+(4*(lon-142.5)+eot)/60, g=2*Math.PI/365*(doy-1);
 const dl=0.006918-0.399912*Math.cos(g)+0.070257*Math.sin(g)-0.006758*Math.cos(2*g)+0.000907*Math.sin(2*g)-0.002697*Math.cos(3*g)+0.00148*Math.sin(3*g), la=lat*D2R, ha=(solarH-12)*15*D2R;
 const s=Math.sin(la)*Math.sin(dl)+Math.cos(la)*Math.cos(dl)*Math.cos(ha); return Math.asin(Math.max(-1,Math.min(1,s))); }
function sunset(lat,lon,doy){ const B=2*Math.PI*(doy-81)/364, eot=9.87*Math.sin(2*B)-7.53*Math.cos(B)-1.5*Math.sin(B), g=2*Math.PI/365*(doy-1);
 const dl=0.006918-0.399912*Math.cos(g)+0.070257*Math.sin(g)-0.006758*Math.cos(2*g)+0.000907*Math.sin(2*g)-0.002697*Math.cos(3*g)+0.00148*Math.sin(3*g), la=lat*D2R;
 const c=(Math.sin(-0.833*D2R)-Math.sin(la)*Math.sin(dl))/(Math.cos(la)*Math.cos(dl)); return 12+Math.acos(Math.max(-1,Math.min(1,c)))/D2R/15-(4*(lon-142.5)+eot)/60; }
const iam=(c)=>c<=0?0:(1-Math.exp(-c/0.16))/(1-Math.exp(-1/0.16));
function rnd(seed){ let x=(seed>>>0)||1; return ()=>((x=Math.imul(x^(x>>>15),2246822507)^Math.imul(x^(x>>>13),3266489909),(x^=x>>>16)>>>0)/4294967296); }
function gauss(r){ let u=0; while(u===0) u=r(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*r()); }
/* 天気の値: 年 y・項目 k・km・天気の時刻 (データの 0 時からの時間) → 地点と時刻で直線補間 */
function wx(W,k,km,th){ const A=W[k], L=C.locKm, n=L.length; let i=0; while(i<n-2&&L[i+1]<=km) i++; const u=Math.max(0,Math.min(1,(km-L[i])/((L[i+1]-L[i])||1)));
 const H=C.hours, t0=Math.max(0,Math.min(H-1,Math.floor(th))), t1=Math.min(H-1,t0+1), v=th-t0;
 const a=(A[i][t0]??0)*(1-v)+(A[i][t1]??0)*v, b=(A[i+1][t0]??0)*(1-v)+(A[i+1][t1]??0)*v; return a*(1-u)+b*u; }
/* 走行電力 [W] (表: 速度 1 km/h ごと × 勾配 0.2 % ごと) */
function pDrive(vk,g){ const T=C.pTab, gi=Math.max(0,Math.min(C.gN-1,Math.round((g-C.g0)/C.gStep))), v0=Math.max(1,Math.min(C.vN-1,Math.floor(vk))), v1=Math.min(C.vN-1,v0+1), u=vk-v0;
 return T[gi*C.vN+v0]*(1-u)+T[gi*C.vN+v1]*u; }
function rollRisk(c,v){ const R=C.roll, ci=Math.max(0,Math.min(C.rollC-1,Math.round(c))), vi=Math.max(0,Math.min(C.rollV-1,Math.round(v))); return R[ci*C.rollV+vi]; }
function pvAlt(alt){ const c=C.pvCurve; if(!c) return 1; const d=Math.max(0,Math.min(8,alt/D2R/10)), i=Math.min(7,Math.floor(d)); return c[i]+(c[i+1]-c[i])*(d-i); }
/* 発電 [W]: 平置き (走行中) / 傾け (停車中)。天気は条件の倍率入り */
function solar(cd,W,km,abs,tilted,fc){
 const day=Math.floor(abs/24)+1, h=abs-(day-1)*24, th=abs+C.dayOff*24, s=C.segAt(km), lat=s.lat, lon=s.lon;
 const alt=sunPos(lat,lon,C.doy0+day-1,h); if(alt<=0) return 0;
 let k=cd.solarK*cd.dayK[Math.min(6,day-1)]; if(day>=4&&day<=6) k*=(1-cd.late);
 if(fc){ k=cd.solarK*cd.fcDayK[Math.min(6,day-1)]; }   // 予報 (後半の悪化は知らない)
 const dni=wx(W,"dni",km,th)*k, dhi=wx(W,"dhi",km,th)*(0.5+0.5*k), cz=Math.sin(alt);
 let G;
 if(tilted){ const tr=C.tilt*D2R, ci=Math.max(0,Math.cos(Math.PI/2-alt-tr)); G=dni*ci*iam(ci)+dhi*(1+Math.cos(tr))/2*0.95+C.albedo*(dni*cz+dhi)*(1-Math.cos(tr))/2*0.9; G*=C.tiltK; }
 else { G=(dni*cz*iam(cz)+dhi*0.95)*pvAlt(alt); }
 const Ta=wx(W,"t",km,th)+cd.tOff, Tc=Ta+G*(0.92-C.cellEff)/(tilted?25:20+2*15);
 return Math.max(0,C.pvA*cd.effK*G*Math.max(0.6,1-C.gamma*Math.max(0,Tc-25))); }
function headWind(cd,W,km,abs,bear){ const th=abs+C.dayOff*24, ws=wx(W,"ws",km,th)*0.6*cd.windK, wd=wx(W,"wd",km,th); const to=(wd+180)*D2R; return ws*Math.cos(to-bear+Math.PI); }
/* 予報の発電 (見積もり用に 20 km × 15 分で丸めて覚えておく) */
function fcSolar(cd,W,km,abs,tilted){ const kb=Math.round(km/20), hb=Math.round(abs*4), key=(kb*4000+hb)*2+(tilted?1:0); let v=cd._c.get(key); if(v===undefined){ v=solar(cd,W,Math.min(C.total,kb*20),hb/4,tilted,true); cd._c.set(key,v); } return v; }
/* 実際の発電 (2 km × 3 分で丸めて覚えておく。同じ条件の方針どうしで使い回す) */
function actSolar(cd,W,km,abs,tilted){ const kb=Math.round(km/2), hb=Math.round(abs*20), key=(kb*20000+hb)*2+(tilted?1:0); let v=cd._a.get(key); if(v===undefined){ v=solar(cd,W,Math.min(C.total,kb*2),hb/20,tilted,false); cd._a.set(key,v); } return v; }
/* 方針: 今から一定速度 v で走ったときに、電池が下限を割らずに Day6 17 時までにゴールできるか (予報で、1 時間刻み) */
function feasible(cd,pl,W,st,v){
 let abs=st.abs, km=st.km, e=st.soc*cd.Wh, ci=st.csI||0; const fl=pl.floor*cd.Wh, late=(a)=>(Math.floor(a/24)+1>=4? 1-pl.lateBias : 1);
 for(let guard=0;guard<400&&km<C.total;guard++){ const day=Math.floor(abs/24), h=abs-day*24;
  if(abs>=8*24+17) return true;   // 電池の見積もりは締め切りを気にせず最後まで (間に合わないかは走った結果で判定)
  if(h>=17||h<8){
   if(h>=17){ const s=C.segAt(km), ss=sunset(s.lat,s.lon,C.doy0+day); for(let x=abs;x<day*24+ss;x+=0.5) e+=fcSolar(cd,W,km,x+0.25,true)*pl.fcBias*late(x)*0.5; }
   const m0=(h>=17?(day+1)*24:day*24)+6.25; for(let x=Math.max(abs,m0);x<m0+1.75;x+=0.5) e+=fcSolar(cd,W,km,x+0.25,true)*pl.fcBias*late(x)*0.5;
   abs=m0+1.75; e=Math.min(e,cd.Wh); continue; }
  const dt=Math.min(1,17-h), s=C.segAt(km), vk=Math.min(v,s.vlimAvg,C.vTop);
  e+=(fcSolar(cd,W,km,abs+dt/2,false)*pl.fcBias*late(abs)-pDrive(vk,0)*cd.lossK-cd.auxD)*dt;
  if(e<fl) return false;
  km+=vk*dt; abs+=dt; e=Math.min(e,cd.Wh);
  while(ci<C.cs.length&&km>=C.cs[ci].km){ const st2=0.5+(cd.csWait+pl.csExtra)/60; e=Math.min(cd.Wh,e+fcSolar(cd,W,km,abs+st2/2,true)*pl.fcBias*late(abs)*st2); abs+=st2; ci++; } }
 return true; }
function planSpeed(cd,pl,W,st,prev){ const top=Math.min(pl.vcap,C.vTop); let lo=25, hi=top, it=9;
 if(prev){ const a=Math.max(25,prev-10), b=Math.min(top,prev+10); if(feasible(cd,pl,W,st,a)){ lo=a; hi=b; it=6; if(b<top&&feasible(cd,pl,W,st,b)){ lo=b; hi=top; it=8; } } }   // 前の速度の近くから探す
 if(lo===25&&!feasible(cd,pl,W,st,lo)) return lo;
 for(let i=0;i<it;i++){ const m=(lo+hi)/2; if(feasible(cd,pl,W,st,m)) lo=m; else hi=m; } return lo; }
/* 1 本を走らせる (trace=true で区間ごとの記録も返す) */
function run(cd,pl,trace){
 const W=C.years[cd.year]; if(!W) return {ok:false,why:"天気のデータなし"}; if(!cd._c){ cd._c=new Map(); cd._a=new Map(); }
 const Wh=cd.Wh; let abs=8+(cd.grid-1)/60, km=0, soc=1, minSoc=1, why="", vPlan=60, nextPlan=0;
 const tr=trace?[]:null, dayKm=[0,0,0,0,0,0,0]; let csI=0, dcDone=false, moving=0, energyUse=0, energySun=0, stormStop=0;
 const charge=(t0,t1,tilted)=>{ for(let x=t0;x<t1-1e-6;x+=0.25){ const d=Math.min(0.25,t1-x), p=actSolar(cd,W,km,x+d/2,tilted); energySun+=p*d; soc=Math.min(1,soc+(p-(tilted?2:cd.auxW))*d/Wh); } };
 for(let i=0;i<C.segN&&km<C.total-1e-6;){
  const day=Math.floor(abs/24), h=abs-day*24;
  if(day>=6&&!(h<8)){ why="Day6 17 時までにゴールできない"; break; }
  if(h>=17||h<8){   // 夜: 日没まで・朝 6:15 から 8:00 まで傾けて充電
   dayKm[Math.min(6,day)]=km; const s=C.segAt(km), ss=sunset(s.lat,s.lon,C.doy0+day);
   if(h>=17){ if(h<ss) charge(abs,day*24+ss,true); abs=(day+1)*24+6.25; } else if(h<6.25) abs=day*24+6.25;
   charge(abs,Math.floor(abs/24)*24+8,true); abs=Math.floor(abs/24)*24+8; nextPlan=0; continue; }
  // 暴風雨: 前縁の pl.stormLead 分前に止まる (0 = 止まらない)
  const sm=cd.storm;
  if(sm&&pl.stormLead>0&&abs>=sm.start-pl.stormLead/60&&abs<sm.start+sm.dur){ const t1=sm.start+sm.dur+0.08; charge(abs,t1,true); stormStop+=t1-abs; abs=t1; nextPlan=0; continue; }
  if(abs>=nextPlan){ vPlan=planSpeed(cd,pl,W,{abs,km,soc,csI},nextPlan>0?vPlan:0); nextPlan=abs+pl.replanH; }
  const s=C.seg[i], g=s.g;
  let v=vPlan*Math.max(0.6,Math.min(1.25,1-pl.gradeK*g*20));   // 登りは遅く・下りは速く
  const pNow=actSolar(cd,W,km,abs,false), pFc=fcSolar(cd,W,km,abs,false);
  if(pFc>200&&pNow<pFc*0.6) v*=1-pl.cloudSlow;   // 予報より暗い (雲): 減速
  if(soc>0.97&&pNow>pDrive(v,g)) v*=1+pl.fullBoost;   // 満充電で発電が余る: 速く
  v=Math.max(15,Math.min(v,s.vlim,C.vTop));
  const dt=s.len/v, hw=headWind(cd,W,km,abs,s.b), pAir=0.5*1.17*C.CdA*cd.cdaK*(Math.max(0,v/3.6+hw)**2-(v/3.6)**2)*(v/3.6);
  const pD=pDrive(v,g)*cd.lossK+pAir+cd.auxD;
  // 暴風雨の中を走っている: 横転の判定 (いちばん強い突風)
  if(sm&&abs+dt>sm.start&&abs<sm.start+sm.dur){ const gust= abs<sm.start+0.05? sm.max : sm.max*0.8; if(rollRisk(gust,v/3.6)>=1){ why="暴風雨で横転"; km+=0; break; } }
  soc+=(pNow-pD)*dt/Wh; energyUse+=pD*dt; energySun+=pNow*dt; soc=Math.min(1,soc);
  if(soc<minSoc) minSoc=soc;
  if(soc<=0){ why="電池切れ"; break; }
  abs+=dt; km+=s.len; moving+=dt; i++;
  if(trace) tr.push([+km.toFixed(1),+abs.toFixed(3),+(soc*100).toFixed(1),Math.round(v),Math.round(pNow),Math.round(pD)]);
  // ルール: Katherine に Day1 の日没まで、CS の締め切り
  if(!dcDone&&km>=C.dc){ dcDone=true; charge(abs,abs+C.dcMin/60,true); abs+=C.dcMin/60; }
  while(csI<C.cs.length&&km>=C.cs[csI].km){ const c=C.cs[csI]; if(abs>c.close){ why="CS の締め切りに遅れた"; break; }
   if(csI===0&&abs>sunset(s.lat,s.lon,C.doy0)){ why="Day1 の日没までに Katherine に着けない"; break; }
   const stay=0.5+(cd.csWait+pl.csExtra)/60; charge(abs,abs+stay,true); abs+=stay; csI++; }
  if(why) break; }
 const ok=!why&&km>=C.total-1e-6&&abs<=5*24+17+1e-6; if(!ok&&!why) why="Day6 17 時までにゴールできない";
 return {ok,why,fin:ok?abs:NaN,km,minSoc,dayKm,avgV:moving>0?km/moving:0,eUse:energyUse/1000,eSun:energySun/1000,stormStop,trace:tr}; }
/* 条件・方針の乱数 (傾向タブで決めた範囲から) */
function sampleCond(r,R,years){ const u=(k)=>{ const x=R[k]; return x.fix!=null? x.fix : x.min+(x.max-x.min)*r(); };
 const year=years[Math.floor(r()*years.length)], fcLv=u("fcErr"), daySd=u("daySd");
 const dayK=[...Array(7)].map(()=>Math.max(0.5,1+gauss(r)*daySd)), fcDayK=dayK.map(k=>Math.max(0.5,k*(1+gauss(r)*fcLv)));
 const late=u("late"), stP=u("stormP"); let storm=null; if(r()<stP){ const d=3+Math.floor(r()*4); storm={start:(d-1)*24+12+r()*4.5,dur:0.4+r()*0.3,max:u("stormMax")}; }
 const Wh=C.Wh*u("batK");
 return {year,daySd,fcLv,dayK,fcDayK,late,stormP:stP,storm,stormMax:storm?storm.max:0,solarK:u("solarK"),windK:u("windK"),tOff:u("tOff"),effK:u("effK"),lossK:u("lossK"),cdaK:u("cdaK"),batK:Wh/C.Wh,Wh,auxD:u("auxD"),auxW:C.auxW+u("auxD"),grid:Math.round(u("grid")),csWait:u("csWait")}; }
function samplePolicy(r,R){ const u=(k)=>{ const x=R[k]; return x.fix!=null? x.fix : x.min+(x.max-x.min)*r(); };
 return {vcap:u("vcap"),floor:u("floor"),fcBias:u("fcBias"),lateBias:u("lateBias"),gradeK:u("gradeK"),cloudSlow:u("cloudSlow"),fullBoost:u("fullBoost"),replanH:Math.round(u("replanH")),stormLead:Math.round(u("stormLead")),csExtra:Math.round(u("csExtra"))}; }
self.onmessage=(e)=>{ const m=e.data;
 if(m.t==="ctx"){ C=m.ctx; const S=C.seg; C.segAt=(km)=>{ let lo=0,hi=S.length-1; while(hi-lo>1){ const md=(lo+hi)>>1; if(S[md].k0<=km) lo=md; else hi=md; } return S[lo]; }; C.segN=S.length;
  C.locKm=C.loc.map(l=>l[0]); self.postMessage({t:"ready"}); return; }
 if(m.t==="years"){ for(const y in m.years) C.years[y]=m.years[y]; self.postMessage({t:"yearsOk"}); return; }
 if(m.t==="job"){   // 一括: 方針 m.pols[i] × 条件 (種 m.seed から)
  const out=new Float32Array(m.n*m.width); const r=rnd(m.seed);
  let lastCi=-1, cd=null;   // 同じ条件 (方針だけ違う) が続くので条件と発電の覚えを使い回す
  for(let j=0;j<m.n;j++){ const idx=m.i0+j, pi=idx%m.pols.length, ci=Math.floor(idx/m.pols.length), pl=m.pols[pi];
   if(ci!==lastCi){ cd=sampleCond(rnd((m.condSeed+ci*7919)>>>0),m.R,m.years); lastCi=ci; }
   const res=run(cd,pl,false), o=j*m.width;
   out[o]=pi; out[o+1]=res.ok?1:0; out[o+2]=res.ok?res.fin:NaN; out[o+3]=res.minSoc; out[o+4]=res.km; out[o+5]=res.avgV; out[o+6]=res.eUse; out[o+7]=res.eSun; out[o+8]=WHY.indexOf(res.why);
   let q=9; for(const k of CKEYS) out[o+(q++)]= k==="year"? cd.year : k==="storm"? (cd.storm?1:0) : cd[k]; }
  self.postMessage({t:"done",i0:m.i0,n:m.n,buf:out},[out.buffer]); return; }
 if(m.t==="trace"){ const cr=rnd(m.condSeed), cd=m.cond||sampleCond(cr,m.R,m.years); const res=run(cd,m.pol,true); delete cd._c; delete cd._a; self.postMessage({t:"trace",id:m.id,res,cond:cd}); return; }
};
const WHY=["","電池切れ","Day6 17 時までにゴールできない","暴風雨で横転","Day1 の日没までに Katherine に着けない","CS の締め切りに遅れた","天気のデータなし"];
const CKEYS=["year","solarK","daySd","late","fcLv","storm","stormMax","windK","tOff","effK","lossK","cdaK","batK","auxD","grid","csWait"];
