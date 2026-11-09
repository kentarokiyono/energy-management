"use strict";
/* ============ 分析画面: 傾向 (本戦の戦略方針を、条件を変えて自動で何本も走らせて調べる) ============
 ・実行: 変える要素 (天気・予報・車両・レース・走り方の方針) の範囲を決め、本数 (〜100,000) と方針の数を選んで実行。
   裏のスレッド (CPU のコア数ぶん) で速い計算 (js/trend-worker.js) を回す。方針ごとに同じ条件の組で比べる
 ・推奨の方針: 完走率が下限 (既定 90 %) 以上の中で、ゴール時刻の平均が一番早いもの
 ・図: 方針の比較 (完走率 × ゴール時刻)、要因の効き方、年 × 方針の地図、方針を選ぶとゴール時刻の分布と代表の 1 本
 ・絞り込み: 年・暴風雨・後半の悪化・予報のずれ → すべての図に効く
 ・レポート (HTML・印刷)・CSV、ドライバーの目標 (区間ごとの目標速度・電流) を作って速度指示に使える
 天気: 2005〜2025 年の大会時期の実際の天気 (js/data/weather-hist.js、使うときだけ読み込む) */
const Trend={
 W:25, CK:["year","solarK","daySd","late","fcLv","storm","stormMax","windK","tOff","effK","lossK","cdaK","batK","auxD","grid","csWait"],
 WHY:["","電池切れ","Day6 17 時までにゴールできない","暴風雨で横転","Day1 の日没までに Katherine に着けない","CS の締め切りに遅れた","天気のデータなし"],
 /* 変える要素 (条件): 既定の範囲。fix を入れると固定 */
 COND:{
  solarK:{label:"日射の全体の多さ (データ比)",min:0.92,max:1.04,unit:"×",g:"天気"},
  daySd:{label:"日ごとの日射の揺らぎ",min:0,max:0.12,unit:"σ",g:"天気"},
  late:{label:"後半 (Day4〜6) の日射の低下",min:0,max:0.25,unit:"",pct:true,g:"天気"},
  stormP:{label:"暴風雨の起きる確率",min:0,max:0.4,unit:"",pct:true,g:"天気"},
  stormMax:{label:"暴風雨の最大突風",min:22,max:40,unit:"m/s",g:"天気"},
  windK:{label:"風の強さ",min:0.7,max:1.3,unit:"×",g:"天気"},
  tOff:{label:"気温のずれ",min:-3,max:3,unit:"°C",g:"天気"},
  fcErr:{label:"予報のずれ (日ごとの日射)",min:0,max:0.25,unit:"σ",g:"予報"},
  effK:{label:"発電の効率",min:0.93,max:1.04,unit:"×",g:"車両"},
  lossK:{label:"走行の消費",min:0.96,max:1.10,unit:"×",g:"車両"},
  cdaK:{label:"空気抵抗 (CdA)",min:0.94,max:1.06,unit:"×",g:"車両"},
  batK:{label:"電池の容量 (劣化)",min:0.88,max:1.0,unit:"×",g:"車両"},
  auxD:{label:"補機の電力の増減",min:-10,max:30,unit:"W",g:"車両"},
  grid:{label:"スタートの順位",min:1,max:26,unit:"番",g:"レース"},
  csWait:{label:"CS での待ち",min:0,max:10,unit:"分",g:"レース"}},
 /* 走り方の方針 (比べる側) */
 POL:{
  vcap:{label:"巡航速度の上限",min:70,max:110,unit:"km/h"},
  floor:{label:"電池の下限 (残す量)",min:0.03,max:0.2,unit:"",pct:true},
  fcBias:{label:"予報の発電の見込み (悲観 < 1)",min:0.8,max:1.05,unit:"×"},
  lateBias:{label:"後半の悪化の見込み",min:0,max:0.25,unit:"",pct:true},
  gradeK:{label:"勾配で速度を変える強さ",min:0,max:0.6,unit:""},
  cloudSlow:{label:"雲 (予報より暗い) での減速",min:0,max:0.2,unit:"",pct:true},
  fullBoost:{label:"満充電で発電が余るときの加速",min:0,max:0.2,unit:"",pct:true},
  replanH:{label:"見直しの間隔",min:1,max:3,unit:"時間"},
  stormLead:{label:"暴風雨で止まる (前縁の何分前、0 = 止まらない)",min:0,max:20,unit:"分"},
  csExtra:{label:"CS での追加の充電",min:0,max:15,unit:"分"}},
 cfg:{mode:"search",s1:2000,s2:5000,runs:20000,pols:200,thr:0.9,years:null}, res:null, busy:false, workers:[], filt:{years:null,storm:"all",late:[0,1],fc:[0,1]}, selPol:null,
 /* ---------- 天気のデータ (使うときだけ読み込む) ---------- */
 loadHist(){ if(typeof WEATHER_HIST!=="undefined") return Promise.resolve(); if(this._lp) return this._lp;
  return this._lp=new Promise((res,rej)=>{ const s=document.createElement("script"); s.src="js/data/weather-hist.js?v="+TrendLoad.ver(); s.onload=()=>res(); s.onerror=()=>rej(new Error("天気のデータを読み込めません")); document.head.appendChild(s); }); },
 /* ---------- 事前計算 (裏のスレッドへ 1 回だけ渡す) ---------- */
 ctx(){
  const seg=[], step=2; for(let k=0;k<TOTAL_KM-1e-6;k+=step){ const len=Math.min(step,TOTAL_KM-k), p0=profileAt(k), p1=profileAt(k+len), pm=profileAt(k+len/2); let vl=200; for(let x=k;x<=k+len;x+=0.25) vl=Math.min(vl,speedLimitAt(Math.min(TOTAL_KM,x)));
   seg.push({k0:k,len,g:(p1.elev-p0.elev)/(len*1000),lat:pm.lat,lon:pm.lon,b:pm.bearing,vlim:vl}); }
  for(let i=0;i<seg.length;i++){ let a=0,n=0; for(let j=Math.max(0,i-12);j<=Math.min(seg.length-1,i+12);j++){ a+=1/seg[j].vlim; n++; } seg[i].vlimAvg=n/a; }
  const vN=141, g0=-0.08, gStep=0.002, gN=81, pTab=new Float32Array(vN*gN); for(let gi=0;gi<gN;gi++) for(let v=0;v<vN;v++) pTab[gi*vN+v]=Strategy.drivePower(Math.max(0.3,v)/3.6,g0+gi*gStep);
  const rollC=46, rollV=41, roll=new Float32Array(rollC*rollV), es={lastRho:1.17,gLat:0,gLong:0}; for(let c=0;c<rollC;c++) for(let v=0;v<rollV;v++) roll[c*rollV+v]=VehDyn.roll(es,c,v,false).risk;
  const curve=[...Array(9)].map((_,i)=>PVLoss.k(i*10*Math.PI/180,false));
  return {seg,pTab,vN,g0,gStep,gN,roll,rollC,rollV,pvCurve:curve,tiltK:PVLoss.k(0.5,true),pvA:P.arrayArea*P.cellEff*P.mpptEff*PRO.solarScale,cellEff:P.cellEff,gamma:PANEL_TYPES[P.panel].gamma,tilt:40,albedo:PRO.albedo,
   Wh:P.batteryWh,auxW:P.auxW,vTop:Strategy.topSpeed(true),CdA:P.Cd*P.frontal,total:TOTAL_KM,dc:RP_RULES.driverChange.km,dcMin:RP_RULES.driverChange.minutes||5,cs:RP_CS.map(c=>({km:c.km,close:Route.absHour(c.close)})),
   doy0:PRO.dayOfYear,dayOff:2,hours:WEATHER_HIST.hours,loc:WEATHER_HIST.loc,years:{}}; },
 ranges(){ const R={}; for(const [k,v] of Object.entries(this.COND)) R[k==="fcErr"?"fcErr":k]={min:v.min,max:v.max,fix:v.fix}; for(const [k,v] of Object.entries(this.POL)) R[k]={min:v.min,max:v.max,fix:v.fix}; return R; },
 /* 方針の組 (偏りなく散らす: ラテン超方格) */
 policies(K,seed){ const keys=Object.keys(this.POL), perm={}; let x=seed||12345; const r=()=>((x=(x*16807)%2147483647)/2147483647);
  for(const k of keys){ const a=[...Array(K).keys()]; for(let i=K-1;i>0;i--){ const j=Math.floor(r()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } perm[k]=a; }
  return [...Array(K)].map((_,i)=>{ const o={}; for(const k of keys){ const d=this.POL[k], u=(perm[k][i]+r())/K; let v=d.fix!=null? d.fix : d.min+(d.max-d.min)*u; if(k==="replanH"||k==="stormLead"||k==="csExtra") v=Math.round(v); o[k]=v; } return o; }); },
 /* ---------- 実行 ---------- */
 async start(){
  if(this.busy) return; if(this.cfg.mode!=="grid") return this.search();   /* 既定: 二段階の探索 (js/ui/trend-search.js) */
  const N=clamp(Math.round(this.cfg.runs),100,100000), K=clamp(Math.round(this.cfg.pols),2,Math.min(2000,Math.floor(N/10)));
  this.busy=true; this.ui("run",{n:0,N}); try{ await this.loadHist(); }catch(e){ this.busy=false; toast(e.message,"#ef4444"); this.ui(); return; }
  const years=(this.cfg.years&&this.cfg.years.length? this.cfg.years : Object.keys(WEATHER_HIST.years).map(Number));
  const ctx=this.ctx(), R=this.ranges(), pols=this.policies(K,(Date.now()%100000)+7), nW=clamp((navigator.hardwareConcurrency||4)-1,1,12), condSeed=(Math.random()*1e9)>>>0;
  const buf=new Float32Array(N*this.W); let done=0, cont=0, t0=performance.now(), next=0; const got={}; const CH=Math.max(200,Math.min(2000,Math.ceil(N/nW/8)));
  this.stopReq=false; this.workers.forEach(w=>w.terminate()); this.workers=[];
  const yearsData={}; for(const y of years) yearsData[y]=WEATHER_HIST.years[y];
  this.res={N,K,pols,R,years,condSeed,buf,done:0,t0,ctxInfo:{Wh:ctx.Wh,vTop:ctx.vTop},cfg:{...this.cfg}};
  await new Promise(fin=>{ let alive=0;
   const give=(w)=>{ if(this.stopReq||next>=N){ w.terminate(); if(--alive===0) fin(); return; } const n=Math.min(CH,N-next); w.postMessage({t:"job",i0:next,n,pols,R,years,condSeed,width:this.W}); next+=n; };
   for(let i=0;i<nW;i++){ const w=new Worker("js/trend-worker.js?v="+TrendLoad.ver()); this.workers.push(w); alive++;
    w.onmessage=(e)=>{ const m=e.data; if(m.t==="ready"){ w.postMessage({t:"years",years:yearsData}); return; } if(m.t==="yearsOk"){ give(w); return; }
     if(m.t==="done"){ buf.set(m.buf,m.i0*this.W); done+=m.n; got[m.i0]=m.n; while(got[cont]) cont+=got[cont]; this.res.done=cont;   /* 集計は頭から切れ目なく済んだところまで */ const now=performance.now(); if(!this._lu||now-this._lu>700||done>=N){ this._lu=now; try{ this.aggregate(); this.ui("run",{n:done,N,rate:done/((now-t0)/1000)}); }catch(err){ console.error(err); } } give(w); } };
    w.onerror=(e)=>{ console.error(e); toast("計算でエラー: "+(e.message||""),"#ef4444"); w.terminate(); if(--alive===0) fin(); };
    w.postMessage({t:"ctx",ctx}); } });
  this.workers=[]; this.busy=false; this.res.time=(performance.now()-t0)/1000; this.aggregate(); this.save(); this.ui(); toast(`完了: ${this.res.done.toLocaleString()} 本 (${this.res.time.toFixed(0)} 秒)`,"#34d399"); },
 stop(){ this.stopReq=true; },
 /* ---------- 集計 (絞り込みも反映) ---------- */
 mask(i){ const r=this.res, b=r.buf, o=i*this.W, F=this.filt, ci=(k)=>b[o+9+this.CK.indexOf(k)];
  if(F.years&&F.years.length&&!F.years.includes(Math.round(ci("year")))) return false;
  if(F.storm==="yes"&&!ci("storm")) return false; if(F.storm==="no"&&ci("storm")) return false;
  const lt=ci("late"); if(lt<F.late[0]-1e-6||lt>F.late[1]+1e-6) return false; const fc=ci("fcLv"); if(fc<F.fc[0]-1e-6||fc>F.fc[1]+1e-6) return false; return true; },
 aggregate(){ const r=this.res; if(!r) return; const W=this.W, b=r.buf, n=r.done, K=r.pols.length, P=[...Array(K)].map(()=>({n:0,ok:0,fins:[],why:{},minSoc:0}));
  let tot=0, ok=0; for(let i=0;i<n;i++){ if(!this.mask(i)) continue; const o=i*W, p=P[b[o]]; p.n++; tot++; if(b[o+1]){ p.ok++; ok++; p.fins.push(b[o+2]); } else { const w=this.WHY[b[o+8]]||"?"; p.why[w]=(p.why[w]||0)+1; } p.minSoc+=b[o+3]; }
  const q=(a,f)=>{ if(!a.length) return NaN; const s=a.slice().sort((x,y)=>x-y); return s[Math.min(s.length-1,Math.floor(f*s.length))]; };
  for(const p of P){ p.rate=p.n?p.ok/p.n:NaN; p.mean=p.fins.length? p.fins.reduce((a,x)=>a+x,0)/p.fins.length : NaN; p.p10=q(p.fins,0.1); p.p90=q(p.fins,0.9); p.minSoc/=Math.max(1,p.n); }
  const thr=this.cfg.thr, mn=r.minN? Math.max(3,Math.floor(r.minN*tot/Math.max(1,n))) : 3; let best=-1; P.forEach((p,i)=>{ if(p.n>=mn&&p.rate>=thr&&Number.isFinite(p.mean)&&(best<0||p.mean<P[best].mean)) best=i; });
  let fb=-1; const fbN=P.some(p=>p.n>=mn)? mn : 1; if(best<0) P.forEach((p,i)=>{ if(p.n>=fbN&&(fb<0||p.rate>P[fb].rate||(p.rate===P[fb].rate&&p.mean<P[fb].mean))) fb=i; });
  r.P=P; r.best=best; r.fallback=fb; r.tot=tot; r.okAll=tot?ok/tot:NaN; r.sens=this.sensitivity(); },
 /* 要因の効き方: 値で 5 つに分けて、完走率とゴール時刻の平均の幅 (いちばん良い組 − いちばん悪い組) */
 sensitivity(){ const r=this.res, W=this.W, b=r.buf, n=r.done, out=[], vars=[...this.CK.filter(k=>k!=="year"&&k!=="storm").map(k=>({k,src:"c",label:(this.COND[k==="fcLv"?"fcErr":k]||{}).label||k})),{k:"storm",src:"c",label:"暴風雨の有無",cat:true},...Object.keys(this.POL).map(k=>({k,src:"p",label:this.POL[k].label}))];
  const idx=[]; for(let i=0;i<n;i++) if(this.mask(i)) idx.push(i); if(idx.length<50) return [];
  for(const v of vars){ const val=(i)=> v.src==="c"? b[i*W+9+this.CK.indexOf(v.k)] : r.pols[b[i*W]][v.k];
   const vs=idx.map(val); let lo=Infinity, hi=-Infinity; for(const x of vs){ if(x<lo) lo=x; if(x>hi) hi=x; }   /* 本数が多くても大丈夫なように (… で広げない) */ if(!(hi>lo)) continue; const B=v.cat?2:5, bins=[...Array(B)].map(()=>({n:0,ok:0,f:0,fn:0}));
   idx.forEach((i,j)=>{ const t=v.cat? (vs[j]?1:0) : Math.min(B-1,Math.floor((vs[j]-lo)/(hi-lo)*B)), x=bins[t], o=i*W; x.n++; if(b[o+1]){ x.ok++; x.f+=b[o+2]; x.fn++; } });
   const rates=bins.filter(x=>x.n>=10).map(x=>x.ok/x.n), fins=bins.filter(x=>x.fn>=10).map(x=>x.f/x.fn);
   out.push({...v,dRate:rates.length>1?Math.max(...rates)-Math.min(...rates):0,dFin:fins.length>1?Math.max(...fins)-Math.min(...fins):0,
    dir: rates.length>1? Math.sign(rates[rates.length-1]-rates[0]) : 0, bins}); }
  return out.sort((a,c)=>c.dRate-a.dRate||c.dFin-a.dFin); },
 /* ---------- 保存 (この端末) ---------- */
 save(){ const r=this.res; if(!r||!r.done) return; const o={id:"trend-"+Date.now().toString(36),kind:"trend",name:`傾向 ${new Date().toLocaleString("ja-JP")}`,ts:Date.now(),N:r.done,K:r.K,pols:r.pols,R:r.R,years:r.years,condSeed:r.condSeed,cfg:r.cfg,buf:r.buf.slice(0,r.done*this.W),time:r.time,ctxInfo:r.ctxInfo,mode:r.mode,ci:r.ci?r.ci.slice(0,r.done):null,st:r.st,search:r.search,thr:r.thr,minN:r.minN};
  Ana.DB.put(o).then(()=>this.prune()); this.list=null; },
 async prune(){ const all=(await Ana.DB.all()).filter(x=>x&&x.kind==="trend").sort((a,b)=>b.ts-a.ts); for(const x of all.slice(5)) Ana.DB.del(x.id); },
 async saved(){ if(this.list) return this.list; return this.list=(await Ana.DB.all()).filter(x=>x&&x.kind==="trend").sort((a,b)=>b.ts-a.ts); },
 async loadSaved(id){ const o=(await this.saved()).find(x=>x.id===id); if(!o) return; this.res={N:o.N,K:o.K,pols:o.pols,R:o.R,years:o.years,condSeed:o.condSeed,buf:o.buf,done:o.N,time:o.time,cfg:o.cfg||this.cfg,ctxInfo:o.ctxInfo,mode:o.mode,ci:o.ci||null,st:o.st,search:o.search,thr:o.thr,minN:o.minN}; this.selPol=null; this.aggregate(); this.ui(); },
 /* ---------- 1 本を詳しく (裏のスレッドで記録付きで走らせる) ---------- */
 async trace(pi,ci,cond){ const r=this.res; await this.loadHist(); const w=this._tw||(this._tw=new Worker("js/trend-worker.js?v="+TrendLoad.ver()));
  if(!this._twReady){ await new Promise(res=>{ w.onmessage=(e)=>{ if(e.data.t==="ready"){ w.postMessage({t:"years",years:WEATHER_HIST.years}); } if(e.data.t==="yearsOk"){ this._twReady=true; res(); } }; w.postMessage({t:"ctx",ctx:this.ctx()}); }); }
  return new Promise(res=>{ const id=Math.random(); w.onmessage=(e)=>{ if(e.data.t==="trace"&&e.data.id===id) res(e.data); }; w.postMessage({t:"trace",id,pol:r.pols[pi],cond,condSeed:(r.condSeed+ci*7919)>>>0,R:r.R,years:r.years}); }); },
};
/* ============ 傾向タブの画面 ============ */
Object.assign(Trend,{
 fmtH(a){ if(!Number.isFinite(a)) return "―"; const d=Math.floor(a/24)+1, h=a-(d-1)*24; return `D${d} ${Math.floor(h)}:${String(Math.floor(h%1*60)).padStart(2,"0")}`; },
 pct(x,d=0){ return Number.isFinite(x)? (x*100).toFixed(d)+" %" : "―"; },
 fv(def,v){ if(!Number.isFinite(v)) return "―"; return def.pct? (v*100).toFixed(0)+" %" : (Math.abs(v)>=10||Number.isInteger(v)? v.toFixed(0) : v.toFixed(2))+(def.unit&&def.unit!=="×"&&def.unit!=="σ"?" "+def.unit:def.unit==="×"?" ×":""); },
 hide(){ const el=document.getElementById("ana-trend"); if(el&&el.style.display!=="none"){ el.style.display="none"; const b=document.getElementById("ana-body"); if(b) b.style.display=""; } },
 ensure(){ let el=document.getElementById("ana-trend"); if(el) return el; el=document.createElement("div"); el.id="ana-trend"; document.getElementById("ana-body").after(el); return el; },
 render(){ const el=this.ensure(); el.style.display="grid"; document.getElementById("ana-body").style.display="none"; document.getElementById("ana-empty").style.display="none"; if(typeof HVA!=="undefined"){ const h=document.getElementById("ana-hv"); if(h) h.style.display="none"; }
  if(!el.dataset.built){ el.dataset.built=1; el.innerHTML=`<div class="tr-l" id="tr-l"></div><div class="tr-r" id="tr-r"></div>`; }
  this.ui(); },
 ui(state,info){ const L=document.getElementById("tr-l"); if(!L) return; this.left(state,info); this.right(); },
 left(state,info){ const L=document.getElementById("tr-l"), c=this.cfg, years=typeof WEATHER_HIST!=="undefined"? Object.keys(WEATHER_HIST.years) : [...Array(21)].map((_,i)=>String(2005+i));
  const row=(k,d,grp)=>`<div class="tr-v"><label class="chk" title="チェックを外すと固定 (中央の値)"><input type="checkbox" ${d.fix==null?"checked":""} onchange="Trend.toggleVar('${grp}','${k}',this.checked)"><i></i>${escHtml(d.label)}</label>
   <span>${d.fix==null? `<input type="number" step="any" value="${d.pct?+(d.min*100).toFixed(1):d.min}" onchange="Trend.setVar('${grp}','${k}','min',this.value)"> 〜 <input type="number" step="any" value="${d.pct?+(d.max*100).toFixed(1):d.max}" onchange="Trend.setVar('${grp}','${k}','max',this.value)">` : `<input type="number" step="any" value="${d.pct?+(d.fix*100).toFixed(1):d.fix}" onchange="Trend.setVar('${grp}','${k}','fix',this.value)"> 固定`} <i>${d.pct?"%":d.unit}</i></span></div>`;
  const groups={}; for(const [k,d] of Object.entries(this.COND)) (groups[d.g]=groups[d.g]||[]).push(row(k,d,"COND"));
  const run=state==="run"||this.busy, n=info&&info.n||0, N=info&&info.N||c.runs;
  L.innerHTML=`<div class="hv-card"><div class="hv-h">${ic("play")}実行</div>
   <div class="tr-f"><label>探索<select onchange="Trend.cfg.mode=this.value;Trend.left()"><option value="search" ${c.mode!=="grid"?"selected":""}>二段階 (広域 → 最適化)</option><option value="grid" ${c.mode==="grid"?"selected":""}>総当たり</option></select></label></div>
   ${c.mode!=="grid"? `   <div class="tr-f"><label>広域<input type="number" min="400" max="20000" step="100" value="${c.s1}" onchange="Trend.cfg.s1=clamp(+this.value||2000,400,20000);this.value=Trend.cfg.s1"> 本</label><label>最適化<input type="number" min="1000" max="50000" step="500" value="${c.s2}" onchange="Trend.cfg.s2=clamp(+this.value||5000,1000,50000);this.value=Trend.cfg.s2"> 本</label></div>
   <div class="tr-f"><label>完走率の下限<input type="number" min="50" max="100" step="1" value="${(c.thr*100).toFixed(0)}" onchange="Trend.cfg.thr=clamp(+this.value/100,0.5,1);Trend.aggregate();Trend.right()"> %</label></div>
   <div class="dim tr-note">広域: 方針 ${Math.round(c.s1/20)} 個を各 20 通りの条件で走らせ、有望な範囲を絞る。最適化: 完走率の下限を制約に TPE で 8 個ずつ方針を出し、各 30〜150 通りで評価 (下限に届かないと言えたら打ち切り)。最後に上位 3 つを 300 通りで確かめ直す。CPU ${navigator.hardwareConcurrency||"?"} コアで並列。</div>` : `   <div class="tr-f"><label>本数<input type="number" min="100" max="100000" step="100" value="${c.runs}" onchange="Trend.cfg.runs=clamp(+this.value||1000,100,100000);this.value=Trend.cfg.runs"></label><input type="range" min="2" max="5" step="0.01" value="${Math.log10(c.runs)}" oninput="Trend.cfg.runs=Math.round(Math.pow(10,+this.value)/100)*100;this.previousElementSibling.querySelector('input').value=Trend.cfg.runs"></div>
   <div class="tr-f"><label>方針の数<input type="number" min="2" max="2000" value="${c.pols}" onchange="Trend.cfg.pols=clamp(+this.value||100,2,2000)"></label><label>完走率の下限<input type="number" min="50" max="100" step="1" value="${(c.thr*100).toFixed(0)}" onchange="Trend.cfg.thr=clamp(+this.value/100,0.5,1);Trend.aggregate();Trend.right()"> %</label></div>
   <div class="dim tr-note">1 つの方針あたり 約 ${Math.max(1,Math.floor(c.runs/c.pols))} 通りの条件で走らせます (どの方針も同じ条件の組)。CPU ${navigator.hardwareConcurrency||"?"} コアで並列。</div>`}
   <div class="tr-years">${years.map(y=>`<button class="${!c.years||c.years.includes(+y)?"on":""}" onclick="Trend.toggleYear(${y})">${y}</button>`).join("")}</div>
   <div class="tr-run">${run? `<button class="btn" onclick="Trend.stop()">${ic("x")}止める</button>` : `<button class="btn pri" onclick="Trend.start()">${ic("play")}実行</button>`}<select id="tr-saved" onchange="Trend.loadSaved(this.value)"><option value="">保存した結果…</option></select></div>
   <div class="tr-io"><button class="btn ana-sm" onclick="Trend.importFile()" title="コマンド (tools/trend-cli.js) で回した結果を開く">${ic("download")}結果ファイルを読み込む</button><button class="btn ana-sm" onclick="Trend.exportCtx()" title="この端末の車両の値と、変える要素の範囲を、コマンド用に書き出す">${ic("download")}コマンド用の設定を書き出す</button></div>
   <div class="dim tr-note">100,000 本より多く回すときは、コマンド: <code>node tools/trend-cli.js --ctx trend-ctx.json --runs 500000</code></div>
   ${run? `<div class="tr-prog"><i style="width:${(n/N*100).toFixed(1)}%"></i></div><div class="dim tr-note">${n.toLocaleString()} / ${N.toLocaleString()} 本${info&&info.phase?`・${info.phase}`:""} ${info&&info.rate? `・${info.rate.toFixed(0)} 本/秒・残り約 ${Math.max(0,(N-n)/info.rate/60).toFixed(1)} 分` : "・準備中 (天気のデータを読み込み)"}</div>` : ""}</div>
   ${Object.entries(groups).map(([g,rows])=>`<div class="hv-card"><div class="hv-h">${ic("sliders")}変える要素: ${g}</div>${rows.join("")}</div>`).join("")}
   <div class="hv-card"><div class="hv-h">${ic("sliders")}走り方の方針 (比べる範囲)</div>${Object.entries(this.POL).map(([k,d])=>row(k,d,"POL")).join("")}</div>
   <div class="dim tr-note">天気: 2005〜2025 年の大会時期の実際の天気 (Open-Meteo / ERA5 再解析, CC BY 4.0) に、上の揺らぎを加える。速い計算は 2 km ごとの区間で、ハンドル操作・交通は入らない。</div>`;
  this.saved().then(list=>{ const s=document.getElementById("tr-saved"); if(s) s.innerHTML=`<option value="">保存した結果…</option>`+list.map(o=>`<option value="${o.id}">${escHtml(o.name)} (${o.N.toLocaleString()} 本)</option>`).join(""); }); },
 toggleVar(g,k,on){ const d=this[g][k]; if(on) delete d.fix; else d.fix= +( (d.min+d.max)/2 ).toFixed(3); this.left(); },
 setVar(g,k,f,v){ const d=this[g][k]; let x=+v; if(!Number.isFinite(x)) return; if(d.pct) x/=100; d[f]=x; if(f!=="fix"&&d.min>d.max){ const t=d.min; d.min=d.max; d.max=t; this.left(); } },
 toggleYear(y){ const all=Object.keys(typeof WEATHER_HIST!=="undefined"?WEATHER_HIST.years:{}).map(Number); let c=this.cfg.years||(all.length?all:[...Array(21)].map((_,i)=>2005+i)); c= c.includes(y)? c.filter(x=>x!==y) : [...c,y].sort(); this.cfg.years=c.length?c:null; this.left(); },
 /* ---------- 結果 ---------- */
 right(){ const R=document.getElementById("tr-r"), r=this.res; if(!R) return;
  if(r&&r.P&&!(r.best>=0||r.fallback>=0)){ R.innerHTML=`<div class="hv-card"><div class="hv-h">${ic("activity")}傾向</div><div class="dim">集計中…</div></div>`; return; }
  if(!r||!r.P){ R.innerHTML=`<div class="hv-card"><div class="hv-h">${ic("activity")}傾向</div><div class="dim" style="padding:8px 0;line-height:1.8">左で範囲と本数を決めて「実行」を押すと、条件 (天気の年・揺らぎ・予報のずれ・車両・レース) を変えながら、いろいろな走り方の方針で Darwin → Adelaide を何本も走らせ、<br>どの方針が速く確実に完走できるか、どの要素が結果を左右するかを調べます。<br>推奨の方針: 完走率が下限以上の中で、ゴール時刻の平均が一番早いもの。</div></div>`; return; }
  const P=r.P, bi=r.best>=0?r.best:r.fallback, B=P[bi], pol=r.pols[bi], f=(x,d)=>Number.isFinite(x)?x.toFixed(d):"―";
  const F=this.filt, yrs=r.years;
  R.innerHTML=`<div class="hv-card tr-flt"><span class="lb">絞り込み</span><select onchange="Trend.filt.storm=this.value;Trend.aggregate();Trend.right()"><option value="all" ${F.storm==="all"?"selected":""}>暴風雨: 全部</option><option value="yes" ${F.storm==="yes"?"selected":""}>暴風雨あり</option><option value="no" ${F.storm==="no"?"selected":""}>暴風雨なし</option></select>
    <select onchange="const v=this.value.split(',').map(Number);Trend.filt.late=v;Trend.aggregate();Trend.right()">${[[0,1,"後半の悪化: 全部"],[0,0.08,"後半の悪化: 小 (〜8 %)"],[0.08,0.16,"後半の悪化: 中"],[0.16,1,"後半の悪化: 大 (16 %〜)"]].map(o=>`<option value="${o[0]},${o[1]}" ${F.late[0]===o[0]&&F.late[1]===o[1]?"selected":""}>${o[2]}</option>`).join("")}</select>
    <select onchange="const v=this.value.split(',').map(Number);Trend.filt.fc=v;Trend.aggregate();Trend.right()">${[[0,1,"予報のずれ: 全部"],[0,0.08,"予報のずれ: 小"],[0.08,0.16,"予報のずれ: 中"],[0.16,1,"予報のずれ: 大"]].map(o=>`<option value="${o[0]},${o[1]}" ${F.fc[0]===o[0]&&F.fc[1]===o[1]?"selected":""}>${o[2]}</option>`).join("")}</select>
    <select onchange="Trend.filt.years=this.value?[+this.value]:null;Trend.aggregate();Trend.right()"><option value="">年: 全部</option>${yrs.map(y=>`<option value="${y}" ${F.years&&F.years[0]===y?"selected":""}>${y}</option>`).join("")}</select>
    <span class="dim">${r.tot.toLocaleString()} 本 / ${r.done.toLocaleString()} 本・全体の完走率 ${this.pct(r.okAll)}</span>
    <span style="margin-left:auto;display:flex;gap:6px"><button class="btn ana-sm" onclick="Trend.report()">${ic("download")}レポート</button><button class="btn ana-sm" onclick="Trend.csv()">${ic("download")}CSV</button><button class="btn ana-sm pri" onclick="Trend.makeTargets()">${ic("flag")}ドライバーの目標を作る</button></span></div>
   <div class="hv-card tr-rec"><div class="hv-h">${ic("check")}推奨の方針 ${r.best>=0? `<span class="dim">完走率 ${this.pct(this.cfg.thr)} 以上の中でゴールが一番早い</span>` : `<span class="bad">完走率 ${this.pct(this.cfg.thr)} 以上の方針がない → 完走率が一番高いもの</span>`}</div>
    <div class="tr-kpi"><div><span>完走率</span><b>${this.pct(B.rate,1)}</b></div><div><span>ゴール (平均)</span><b>${this.fmtH(B.mean)}</b></div><div><span>早い 1 割 / 遅い 1 割</span><b>${this.fmtH(B.p10)} / ${this.fmtH(B.p90)}</b></div><div><span>走らせた本数</span><b>${B.n}</b></div></div>
    <div class="tr-pol">${Object.entries(this.POL).map(([k,d])=>`<span>${escHtml(d.label)}</span><b>${this.fv(d,pol[k])}</b>`).join("")}</div>
    ${Object.keys(B.why).length? `<div class="dim tr-note">完走できなかった理由: ${Object.entries(B.why).sort((a,b)=>b[1]-a[1]).map(([w,c])=>`${escHtml(w)} ${c} 本`).join("・")}</div>` : ""}</div>
   ${this.convCard?this.convCard():""}
   <div class="hv-card"><div class="hv-h">${ic("check")}ゲームの戦略計算で確かめる<button class="btn ana-sm" style="margin-left:auto" onclick="this.disabled=true;Trend.verify().finally(()=>{ this.disabled=false; })">${ic("play")}上位 5 つを確かめる</button></div><div id="tr-ver"></div></div>
   <div class="tr-grid">
    <div class="hv-card"><div class="hv-h">${ic("activity")}方針の比較 (点 = 1 つの方針。右下ほど良い。クリックで選ぶ)</div><canvas id="tr-par"></canvas></div>
    <div class="hv-card"><div class="hv-h">${ic("sliders")}要因の効き方 (値の大小で完走率がどれだけ変わるか)</div><div id="tr-sens" class="tr-sens"></div></div></div>
   <div class="hv-card"><div class="hv-h">${ic("map")}年 × 方針 (上位 12 の方針。色 = 完走率、数字 = ゴールの平均)</div><div id="tr-heat" class="tr-heat"></div></div>
   <div class="hv-card" id="tr-sel"></div>`;
  this.drawPareto(); this.drawSens(); this.drawHeat(); this.drawSel(); this.drawVer(); if(this.drawConv) this.drawConv(); },
 score(p){ const m=Number.isFinite(p.mean)?p.mean:999; return p.rate>=this.cfg.thr? -m : -1e6+p.rate*1e4-m*0.001; },
 drawPareto(){ const cv=document.getElementById("tr-par"); if(!cv) return; const r=this.res, P=r.P; const [c,W,H]=HVA.fit(cv); c.clearRect(0,0,W,H);
  const pts=P.map((p,i)=>({i,x:p.rate,y:p.mean})).filter(p=>p.x>=0&&Number.isFinite(p.y)); if(!pts.length) return;
  const L=64, PW=W-L-10, PH=H-28, y0=Math.min(...pts.map(p=>p.y)), y1=Math.max(...pts.map(p=>p.y)), st=[0.5,1,2,3,6,12,24].find(s=>(y1-y0)/s<=6)||24, ylo=Math.floor(y0/st)*st, yhi=Math.max(ylo+st,Math.ceil(y1/st)*st);
  const xhi=Math.min(1,Math.max(this.cfg.thr+0.05,Math.ceil(Math.max(...pts.map(p=>p.x))*10)/10+0.1)), xs=xhi>0.5?0.2:0.1;
  const X=(x)=>L+x/xhi*PW, Y=(y)=>8+(y-ylo)/(yhi-ylo)*(PH-8);
  c.font="500 10px 'Chakra Petch',sans-serif"; c.fillStyle="#8b9097";
  for(let x=0;x<=xhi+1e-6;x+=xs){ c.strokeStyle="#1a1d21"; c.beginPath(); c.moveTo(X(x),8); c.lineTo(X(x),PH); c.stroke(); c.fillText((x*100).toFixed(0)+" %",X(x)-10,H-8); }
  c.textAlign="right"; for(let y=ylo;y<=yhi+1e-6;y+=st){ c.strokeStyle="#1a1d21"; c.beginPath(); c.moveTo(L,Y(y)); c.lineTo(W-10,Y(y)); c.stroke(); c.fillText(this.fmtH(y),L-4,Y(y)+3); } c.textAlign="left";
  c.fillText("完走率 →",W-60,H-20); c.save(); c.translate(10,PH/2+50); c.rotate(-Math.PI/2); c.fillText("ゴール (平均) ↓ 早い",0,0); c.restore();
  c.strokeStyle="rgba(245,181,28,.5)"; c.setLineDash([3,3]); c.beginPath(); c.moveTo(X(this.cfg.thr),8); c.lineTo(X(this.cfg.thr),PH); c.stroke(); c.setLineDash([]);
  // パレート前線 (完走率が高く、ゴールが早い)
  const fr=pts.slice().sort((a,b)=>b.x-a.x||a.y-b.y); let best=Infinity; const front=[]; for(const p of fr){ if(p.y<best){ best=p.y; front.push(p); } }
  c.strokeStyle="rgba(34,211,238,.6)"; c.beginPath(); front.sort((a,b)=>a.x-b.x).forEach((p,k)=>{ k?c.lineTo(X(p.x),Y(p.y)):c.moveTo(X(p.x),Y(p.y)); }); c.stroke();
  for(const p of pts){ const isB=p.i===(r.best>=0?r.best:r.fallback), isS=p.i===this.selPol; c.fillStyle= isB? "#f5b51c" : isS? "#fff" : "rgba(139,144,151,.55)"; c.beginPath(); c.arc(X(p.x),Y(p.y),isB||isS?5:2.6,0,7); c.fill(); }
  cv.onclick=(e)=>{ const rc=cv.getBoundingClientRect(), mx=e.clientX-rc.left, my=e.clientY-rc.top; let bi=-1,bd=144; for(const p of pts){ const d=(X(p.x)-mx)**2+(Y(p.y)-my)**2; if(d<bd){ bd=d; bi=p.i; } } if(bi>=0){ this.selPol=bi; this.drawPareto(); this.drawSel(); } }; },
 drawSens(){ const el=document.getElementById("tr-sens"); if(!el) return; const S=(this.res.sens||[]).slice(0,14); if(!S.length){ el.innerHTML=`<div class="dim">本数が足りません</div>`; return; } const mx=Math.max(0.01,...S.map(s=>s.dRate));
  el.innerHTML=S.map(s=>`<div title="完走率の幅 ${(s.dRate*100).toFixed(1)} 点・ゴール時刻の幅 ${s.dFin.toFixed(1)} 時間"><span>${escHtml(s.label)}${s.src==="p"?" <i>方針</i>":""}</span><i class="bar ${s.dir<0?"neg":"pos"}" style="width:${(s.dRate/mx*100).toFixed(0)}%"></i><b>${(s.dRate*100).toFixed(1)}</b><em>${s.dFin.toFixed(1)} h</em></div>`).join("")+`<div class="dim tr-note">棒 = 完走率の幅 (点)。黄 = 値が大きいほど完走しやすい、赤 = 小さいほど。右 = ゴール時刻の幅。</div>`; },
 drawHeat(){ const el=document.getElementById("tr-heat"); if(!el) return; const r=this.res, W=this.W, b=r.buf, top=r.P.map((p,i)=>({p,i})).filter(x=>x.p.n).sort((a,c)=>this.score(c.p)-this.score(a.p)).slice(0,12), yrs=r.years;
  const cell={}; for(let i=0;i<r.done;i++){ if(!this.mask(i)) continue; const o=i*W, pi=b[o], y=Math.round(b[o+9]); const k=pi+"|"+y, x=cell[k]||(cell[k]={n:0,ok:0,f:0}); x.n++; if(b[o+1]){ x.ok++; x.f+=b[o+2]; } }
  const col=(t)=>{ const a=[[209,59,46],[240,129,42],[245,181,28],[92,184,92]], f=clamp(t,0,1)*3, i=Math.min(2,Math.floor(f)), u=f-i; return `rgb(${[0,1,2].map(k=>Math.round(a[i][k]+(a[i+1][k]-a[i][k])*u)).join(",")})`; };
  el.innerHTML=`<table><tr><th>方針</th>${yrs.map(y=>`<th>${String(y).slice(2)}</th>`).join("")}</tr>${top.map(({p,i},k)=>`<tr class="${i===(r.best>=0?r.best:r.fallback)?"best":""}" onclick="Trend.selPol=${i};Trend.drawPareto();Trend.drawSel()"><td>${k+1}. ${this.pct(p.rate)}</td>${yrs.map(y=>{ const x=cell[i+"|"+y]; if(!x||!x.n) return "<td></td>"; const t=x.ok/x.n; return `<td style="background:${col(t)}" title="${y} 年: 完走率 ${(t*100).toFixed(0)} % (${x.n} 本)">${x.ok?this.fmtH(x.f/x.ok).replace(/^D(\d) (\d+):(\d+)$/,"$1日$2時"):"×"}</td>`; }).join("")}</tr>`).join("")}</table><div class="dim tr-note">数字 = ゴールの日・時 (平均。6日16時 = Day6 16 時台)。× = 完走なし。行をクリックで、その方針を選ぶ。</div>`; },
 drawSel(){ const el=document.getElementById("tr-sel"); if(!el) return; const r=this.res, i=this.selPol??(r.best>=0?r.best:r.fallback), p=r.P[i], pol=r.pols[i]; if(!p){ el.innerHTML=""; return; }
  el.innerHTML=`<div class="hv-h">${ic("timer")}選んだ方針 (方針 #${i+1})<span class="dim">完走率 ${this.pct(p.rate,1)}・ゴール平均 ${this.fmtH(p.mean)}・電池の最低 平均 ${this.pct(p.minSoc)}</span></div>
   <div class="tr-pol">${Object.entries(this.POL).map(([k,d])=>`<span>${escHtml(d.label)}</span><b>${this.fv(d,pol[k])}</b>`).join("")}</div>
   <div class="tr-grid"><div><div class="hv-h">ゴール時刻の分布</div><canvas id="tr-hist"></canvas></div><div><div class="hv-h">代表の 1 本 (ゴールが中央の条件)<button class="btn ana-sm" style="margin-left:auto" onclick="Trend.showTrace(${i})">${ic("play")}走らせて見る</button></div><canvas id="tr-trace"></canvas><div class="dim tr-note" id="tr-trn"></div></div></div>`;
  const cv=document.getElementById("tr-hist"), [c,W,H]=HVA.fit(cv); const F=p.fins; if(!F.length) return; let mn=Infinity, mx0=-Infinity; for(const x of F){ if(x<mn) mn=x; if(x>mx0) mx0=x; } const lo=Math.floor(mn), hi=Math.ceil(mx0), B=Math.max(5,Math.min(40,(hi-lo)*2)), bins=new Array(B).fill(0); for(const x of F) bins[Math.min(B-1,Math.floor((x-lo)/(hi-lo||1)*B))]++;
  const mx=Math.max(...bins), L=30, PW=W-L-10; c.fillStyle="#f5b51c"; bins.forEach((n,k)=>{ const x=L+k/B*PW, h=n/mx*(H-30); c.fillRect(x+1,H-20-h,PW/B-2,h); });
  c.fillStyle="#8b9097"; c.font="500 10px 'Chakra Petch',sans-serif"; for(let t=lo;t<=hi;t+=Math.max(1,Math.round((hi-lo)/5))) c.fillText(this.fmtH(t),L+(t-lo)/(hi-lo||1)*PW-18,H-6); },
 async showTrace(pi){ const r=this.res, W=this.W, b=r.buf; const runs=[]; for(let i=0;i<r.done;i++){ const o=i*W; if(b[o]===pi&&this.mask(i)&&b[o+1]) runs.push([b[o+2],r.ci? r.ci[i] : Math.floor(i/r.K)]); }
  if(!runs.length){ toast("完走した走りがありません","#f59e0b"); return; } runs.sort((a,c)=>a[0]-c[0]); const ci=runs[Math.floor(runs.length/2)][1];
  const d=await this.trace(pi,ci), T=d.res.trace, cv=document.getElementById("tr-trace"); if(!cv||!T) return; const [c,W2,H]=HVA.fit(cv); c.clearRect(0,0,W2,H);
  const L=34, PW=W2-L-10, X=(k)=>L+k/TOTAL_KM*PW, h2=(H-22)/2, Yv=(v)=>4+h2-clamp(v/130,0,1)*(h2-6), Ys=(s)=>8+h2*2-clamp(s/100,0,1)*(h2-6);
  c.lineWidth=1.3; c.strokeStyle="#f5b51c"; c.beginPath(); T.forEach((t,k)=>{ k?c.lineTo(X(t[0]),Yv(t[3])):c.moveTo(X(t[0]),Yv(t[3])); }); c.stroke();
  c.strokeStyle="#e6e6e3"; c.beginPath(); T.forEach((t,k)=>{ k?c.lineTo(X(t[0]),Ys(t[2])):c.moveTo(X(t[0]),Ys(t[2])); }); c.stroke();
  c.fillStyle="#8b9097"; c.font="500 10px 'Chakra Petch',sans-serif"; c.fillText("速度 km/h",L+4,12); c.fillText("電池 %",L+4,h2+16); for(let k=0;k<=3000;k+=500) c.fillText(k+" km",X(k)-12,H-4);
  const cd=d.cond; document.getElementById("tr-trn").textContent=`${cd.year} 年の天気・日射 ×${(cd.solarK).toFixed(2)}・後半の悪化 ${(cd.late*100).toFixed(0)} %・予報のずれ ${(cd.fcLv*100).toFixed(0)} %${cd.storm?`・暴風雨 D${Math.floor(cd.storm.start/24)+1}`:""} → ${d.res.ok?"ゴール "+this.fmtH(d.res.fin):"完走できず ("+d.res.why+")"}・平均 ${d.res.avgV.toFixed(1)} km/h`; },
 /* ゲームの戦略計算で確かめる: ゲームと同じ 2025 年の天気・揺らぎなしで、上位の方針を速い計算で走らせ、
  その 2 km ごとの速度をゲームの戦略計算 (Strategy.simulate: ゲームの発電・消費・夜と CS の充電) になぞらせて、ゴール時刻と電池を比べる */
 verCond(){ const ones=[1,1,1,1,1,1,1]; return {year:2025,solarK:1,daySd:0,fcLv:0,dayK:ones,fcDayK:ones,late:0,stormP:0,storm:null,stormMax:0,windK:1,tOff:0,effK:1,lossK:1,cdaK:1,batK:1,Wh:P.batteryWh,auxD:0,auxW:P.auxW,grid:1,csWait:0}; },
 async verify(n=5){ const r=this.res; if(!r||!r.P||this.busy) return; await this.loadHist(); if(!WEATHER_HIST.years[2025]){ toast("2025 年の天気がありません","#ef4444"); return; }
  const top=r.P.map((p,i)=>({p,i})).filter(x=>x.p.n).sort((a,c)=>this.score(c.p)-this.score(a.p)).slice(0,n), out=[], es=Engine.st;
  const save={mode:P.mode,rw:P.realWeather,ev:P.event,sc:es.scenario,fc:es.fc,sp:es.stormPlan,wp:es.weatherPlan};
  P.mode="race"; P.realWeather=true; P.event=null; es.scenario=null; es.fc=null; es.stormPlan=null;   // ゲームの戦略計算を、2025 年の実際の天気・予報のずれなしで
  try{
   for(const {i} of top){ const d=await this.trace(i,0,this.verCond()), T=d.res.trace||[]; if(T.length<2) continue;
    const sp=new Float32Array(Math.ceil(TOTAL_KM/2)+2); let k0=0; for(const t of T){ const a=Math.floor(k0/2+1e-6); for(let j=a;j<Math.min(sp.length,Math.ceil(t[0]/2-1e-6));j++) sp[j]=t[3]; k0=t[0]; }
    const vf=(g,km)=>sp[Math.min(sp.length-1,Math.floor(km/2+1e-6))]||60; vf.full=vf;
    const g=Strategy.simulate(vf,{abs:8,km:0,soc:1,floor:-9,trace:true}), fs=T.reduce((a,t)=>Math.min(a,t[2]/100),1);
    const at=(tr,km,col,div)=>{ for(const t of tr) if(t[0]>=km) return t[col]/(div||1); return NaN; };
    const cs=RP_CS.map(c=>({name:c.name,fast:at(T,c.km,2,100),game:at(g.trace,c.km,2)}));
    out.push({i,fast:{ok:d.res.ok,fin:d.res.fin,why:d.res.why,minSoc:fs,avgV:d.res.avgV},game:{ok:g.ok&&g.minSoc>0,fin:g.finishAbs,minSoc:g.minSoc,late:g.lateCS?g.lateCS.name:""},cs,curve:{fast:T.map(t=>[t[0],t[2]/100]),game:g.trace.map(t=>[t[0],t[2]])}}); }
  } finally{ P.mode=save.mode; P.realWeather=save.rw; P.event=save.ev; es.scenario=save.sc; es.fc=save.fc; es.stormPlan=save.sp; es.weatherPlan=save.wp; }
  r.ver=out; this.drawVer(); return out; },
 drawVer(){ const el=document.getElementById("tr-ver"), V=this.res&&this.res.ver; if(!el) return;
  if(!V){ el.innerHTML=`<div class="dim tr-note">上位 5 つの方針を、ゲームと同じ 2025 年の天気・揺らぎなしで速い計算で走らせ、同じ速度でゲームの戦略計算 (発電・消費・充電の計算) になぞらせて比べます。差が大きいときは、速い計算の結果を割り引いて見てください。</div>`; return; }
  const f=(x)=>Number.isFinite(x)?(x*100).toFixed(0)+" %":"―", dh=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)? ((b-a)*60>=0?"+":"")+((b-a)*60).toFixed(0)+" 分" : "―";
  el.innerHTML=`<table class="tr-vt"><tr><th>方針</th><th>速い計算: ゴール</th><th>ゲーム: ゴール</th><th>差</th><th>電池の最低 (速い / ゲーム)</th><th>ゲームの判定</th></tr>${V.map(v=>`<tr onclick="Trend.selPol=${v.i};Trend.drawPareto();Trend.drawSel();Trend.drawVerCurve(${v.i})"><td>#${v.i+1}</td><td>${v.fast.ok?this.fmtH(v.fast.fin):"完走できず"}</td><td>${this.fmtH(v.game.fin)}</td><td>${dh(v.fast.fin,v.game.fin)}</td><td>${f(v.fast.minSoc)} / ${f(v.game.minSoc)}</td><td class="${v.game.ok&&!v.game.late?"":"bad"}">${v.game.minSoc<=0?"電池切れ":v.game.late?v.game.late+" の締め切りに遅れる":"完走"}</td></tr>`).join("")}</table>
   <canvas id="tr-vc"></canvas><div class="dim tr-note">線 = 電池 (黄 = 速い計算、白 = ゲームの戦略計算)。行をクリックで切り替え。2025 年の天気・揺らぎなし・暴風雨なしの 1 本だけの比較。わかっている違い: ゲームの戦略計算はパネルの温度による損失を一定 (0.92) とみる (実際の走りと速い計算は気温・日射から求めるので、涼しい日は発電が多め)。速い計算は向かい風・勾配・ドライバー交代の 5 分を入れる。</div>`;
  this.drawVerCurve(V[0]&&V[0].i); },
 drawVerCurve(pi){ const V=this.res&&this.res.ver, v=V&&V.find(x=>x.i===pi), cv=document.getElementById("tr-vc"); if(!v||!cv) return; const [c,W,H]=HVA.fit(cv); c.clearRect(0,0,W,H);
  const L=34, PW=W-L-10, X=(k)=>L+k/TOTAL_KM*PW, Y=(s)=>6+(1-clamp(s,0,1))*(H-24);
  c.font="500 10px 'Chakra Petch',sans-serif"; c.fillStyle="#8b9097"; for(let s=0;s<=1;s+=0.5){ c.strokeStyle="#1a1d21"; c.beginPath(); c.moveTo(L,Y(s)); c.lineTo(W-10,Y(s)); c.stroke(); c.fillText((s*100)+" %",2,Y(s)+3); }
  for(let k=0;k<=3000;k+=500) c.fillText(k+" km",X(k)-12,H-4);
  for(const [key,col] of [["game","#e6e6e3"],["fast","#f5b51c"]]){ c.strokeStyle=col; c.lineWidth=1.3; c.beginPath(); v.curve[key].forEach((t,k)=>{ k?c.lineTo(X(t[0]),Y(t[1])):c.moveTo(X(t[0]),Y(t[1])); }); c.stroke(); }
  c.fillStyle="#8b9097"; c.fillText(`方針 #${pi+1}`,L+4,14); },
 /* コマンド (tools/trend-cli.js) との受け渡し */
 async exportCtx(){ try{ await this.loadHist(); }catch(e){ toast(e.message,"#ef4444"); return; } const c=this.ctx(); c.pTab=[...c.pTab]; c.roll=[...c.roll]; c.loc=null; c.years={};
  const o={kind:"trend-ctx",ts:Date.now(),ctx:c,R:this.ranges(),POL:this.POL,cfg:this.cfg}, a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([JSON.stringify(o)],{type:"application/json"})); a.download="trend-ctx.json"; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1000);
  toast("コマンド用の設定を書き出しました (この端末の車両の値を含みます。共有しないでください)","#34d399"); },
 importFile(){ const inp=document.createElement("input"); inp.type="file"; inp.accept=".json,application/json";
  inp.onchange=async()=>{ const f=inp.files&&inp.files[0]; if(!f) return; try{ const o=JSON.parse(await f.text()); if(o.kind!=="trend"||!o.buf||!o.pols) throw new Error("傾向の結果ファイルではありません");
    const bin=atob(o.buf), u8=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i); const buf=new Float32Array(u8.buffer);
    if(buf.length<o.N*this.W) throw new Error("ファイルが壊れています");
    this.res={N:o.N,K:o.K,pols:o.pols,R:o.R,years:o.years,condSeed:o.condSeed,buf,done:o.N,time:o.time,cfg:o.cfg||this.cfg,ctxInfo:o.ctxInfo}; this.selPol=null; this.aggregate(); this.ui();
    if(o.N<=200000) this.save(); toast(`読み込みました: ${o.N.toLocaleString()} 本`,"#34d399"); }catch(e){ toast("読み込めません: "+e.message,"#ef4444"); } };
  inp.click(); },
});
/* ============ レポート・CSV・ドライバーの目標 ============ */
Object.assign(Trend,{
 polRows(pol){ return Object.entries(this.POL).map(([k,d])=>`<tr><td>${escHtml(d.label)}</td><td>${this.fv(d,pol[k])}</td></tr>`).join(""); },
 /* レポート: 1 枚の HTML (図は画面のキャンバスを画像にして埋め込む)。新しいタブで開いて、印刷 / PDF 保存できる */
 report(){ const r=this.res; if(!r||!r.P) return; const bi=r.best>=0?r.best:r.fallback, B=r.P[bi], pol=r.pols[bi], img=(id)=>{ const c=document.getElementById(id); try{ return c? c.toDataURL("image/png") : ""; }catch(e){ return ""; } };
  const sens=(r.sens||[]).slice(0,12), top=r.P.map((p,i)=>({p,i})).filter(x=>x.p.n).sort((a,c)=>this.score(c.p)-this.score(a.p)).slice(0,10), F=this.filt;
  const cond=Object.entries(this.COND).map(([k,d])=>`<tr><td>${escHtml(d.label)}</td><td>${d.fix!=null? this.fv(d,d.fix)+" (固定)" : this.fv(d,d.min)+" 〜 "+this.fv(d,d.max)}</td></tr>`).join("");
  const why={}; for(const p of r.P) for(const [w,c] of Object.entries(p.why)) why[w]=(why[w]||0)+c;
  const T=this.targets;
  const html=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>傾向レポート</title><style>
   body{font-family:system-ui,"Hiragino Sans","Yu Gothic",sans-serif;margin:28px;color:#16181b;max-width:980px} h1{font-size:22px;margin:0 0 4px} h2{font-size:16px;margin:22px 0 8px;border-left:4px solid #f5b51c;padding-left:8px}
   .sub{color:#555;font-size:12px} table{border-collapse:collapse;width:100%;font-size:12.5px} td,th{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left} th{background:#f3f4f6}
   .kpi{display:flex;gap:24px;margin:8px 0} .kpi div{background:#f7f7f2;border:1px solid #e5e1cf;padding:8px 12px} .kpi b{display:block;font-size:20px}
   img{max-width:100%;background:#0d0e10;border:1px solid #ccc} .g2{display:grid;grid-template-columns:1fr 1fr;gap:14px} @media print{ .noprint{display:none} body{margin:10mm} }</style></head><body>
   <button class="noprint" onclick="print()" style="float:right;padding:6px 14px">印刷 / PDF に保存</button>
   <h1>傾向レポート ― 本戦の戦略方針</h1><div class="sub">${new Date().toLocaleString("ja-JP")}・${r.done.toLocaleString()} 本 ${r.mode==="search"? `(二段階の探索: 広域 ${(r.search.s1Done||0).toLocaleString()} 本 → 最適化・仕上げ。方針 ${r.pols.length})` : `(方針 ${r.K} × 条件 約 ${Math.floor(r.done/r.K)} 通り)`}・天気 ${r.years[0]}〜${r.years[r.years.length-1]} 年 (Open-Meteo / ERA5 再解析, CC BY 4.0)・絞り込み: ${F.storm==="all"?"暴風雨 全部":F.storm==="yes"?"暴風雨あり":"暴風雨なし"}${F.years?"・"+F.years[0]+" 年":""}</div>
   <h2>推奨の方針</h2><div class="sub">完走率 ${this.pct(this.cfg.thr)} 以上の中で、ゴール時刻の平均が一番早いもの${r.best<0?" (下限を満たす方針がないため、完走率が一番高いもの)":""}</div>
   <div class="kpi"><div>完走率<b>${this.pct(B.rate,1)}</b></div><div>ゴール (平均)<b>${this.fmtH(B.mean)}</b></div><div>早い 1 割 / 遅い 1 割<b>${this.fmtH(B.p10)} / ${this.fmtH(B.p90)}</b></div><div>電池の最低 (平均)<b>${this.pct(B.minSoc)}</b></div></div>
   <table>${this.polRows(pol)}</table>
   <h2>図</h2><div class="g2"><div><div class="sub">方針の比較 (右下ほど良い。黄 = 推奨)</div><img src="${img("tr-par")}"></div><div><div class="sub">選んだ方針のゴール時刻の分布</div><img src="${img("tr-hist")}"></div></div>
   ${r.mode==="search"? `<h2>探索の経過</h2><img src="${img("tr-conv")}">` : ""}
   <h2>結果を左右する要素</h2><table><tr><th>要素</th><th>完走率の幅</th><th>ゴール時刻の幅</th><th>向き</th></tr>${sens.map(s=>`<tr><td>${escHtml(s.label)}${s.src==="p"?" (方針)":""}</td><td>${(s.dRate*100).toFixed(1)} 点</td><td>${s.dFin.toFixed(1)} 時間</td><td>${s.dir>0?"大きいほど完走しやすい":s.dir<0?"小さいほど完走しやすい":"―"}</td></tr>`).join("")}</table>
   <h2>上位の方針</h2><table><tr><th>#</th><th>完走率</th><th>ゴール (平均)</th>${Object.values(this.POL).map(d=>`<th>${escHtml(d.label)}</th>`).join("")}</tr>${top.map(({p,i},k)=>`<tr><td>${k+1}</td><td>${this.pct(p.rate,1)}</td><td>${this.fmtH(p.mean)}</td>${Object.entries(this.POL).map(([kk,d])=>`<td>${this.fv(d,r.pols[i][kk])}</td>`).join("")}</tr>`).join("")}</table>
   ${r.ver&&r.ver.length? `<h2>ゲームの戦略計算での確かめ (2025 年の天気・揺らぎなし)</h2><table><tr><th>方針</th><th>速い計算: ゴール</th><th>ゲーム: ゴール</th><th>電池の最低 (速い / ゲーム)</th><th>ゲームの判定</th></tr>${r.ver.map(v=>`<tr><td>#${v.i+1}</td><td>${v.fast.ok?this.fmtH(v.fast.fin):"完走できず"}</td><td>${this.fmtH(v.game.fin)}</td><td>${this.pct(v.fast.minSoc)} / ${this.pct(v.game.minSoc)}</td><td>${v.game.minSoc<=0?"電池切れ":v.game.late?escHtml(v.game.late)+" の締め切りに遅れる":"完走"}</td></tr>`).join("")}</table><div class="g2"><div><div class="sub">電池 (黄 = 速い計算、白 = ゲーム)</div><img src="${img("tr-vc")}"></div></div>` : ""}
   <h2>完走できなかった理由 (全部の方針)</h2><table>${Object.entries(why).sort((a,b)=>b[1]-a[1]).map(([w,c])=>`<tr><td>${escHtml(w)}</td><td>${c.toLocaleString()} 本</td></tr>`).join("")||"<tr><td>なし</td></tr>"}</table>
   <h2>変えた要素の範囲</h2><table>${cond}</table>
   ${T? `<h2>ドライバーの目標 (推奨の方針、CS 間)</h2><table><tr><th>区間</th><th>目標速度</th><th>幅 (25〜75 %)</th><th>目標電流</th></tr>${T.cs.map(x=>`<tr><td>${escHtml(x.name)}</td><td>${x.v.toFixed(0)} km/h</td><td>${x.vlo.toFixed(0)}〜${x.vhi.toFixed(0)}</td><td>${x.I.toFixed(1)} A</td></tr>`).join("")}</table>` : ""}
   <p class="sub">速い計算 (2 km ごとの区間) による見込み。ハンドル操作・交通・ドライバーの疲れは入らない。車両の値は、この端末の設定 (走行ログでの合わせ込みを含む) を使う。</p></body></html>`;
  const blob=new Blob([html],{type:"text/html"}), url=URL.createObjectURL(blob), w=window.open(url,"_blank");
  if(!w){ const a=document.createElement("a"); a.href=url; a.download=`trend_report_${Date.now()}.html`; document.body.appendChild(a); a.click(); a.remove(); } setTimeout(()=>URL.revokeObjectURL(url),60000); },
 csv(){ const r=this.res; if(!r||!r.P) return; const keys=Object.keys(this.POL), H=["方針","完走率","ゴール平均(経過h)","ゴール早い1割","ゴール遅い1割","本数",...keys.map(k=>this.POL[k].label)];
  const rows=r.P.map((p,i)=>[i+1,p.rate.toFixed(4),p.mean.toFixed(3),p.p10.toFixed(3),p.p90.toFixed(3),p.n,...keys.map(k=>r.pols[i][k])].join(","));
  const blob=new Blob(["﻿"+H.join(",")+"\n"+rows.join("\n")],{type:"text/csv"}), a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`trend_policies_${Date.now()}.csv`; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1000); },
 /* ドライバーの目標: 推奨の方針で、条件を変えて 60 本走らせ、10 km ごとの速度と電力の中央値・幅を出す。天気の傾向ごと (晴れ多め・ふつう・曇りがち・後半の悪化) にも */
 async makeTargets(){ const r=this.res; if(!r||!r.P) return; const pi=r.best>=0?r.best:r.fallback; toast("ドライバーの目標を計算中…","#22d3ee");
  const M=r.ci? 60 : Math.min(60,Math.floor(r.done/r.K)), sec=10, nS=Math.ceil(TOTAL_KM/sec), all=[], cls={sunny:[],normal:[],cloudy:[],late:[]};
  for(let ci=0;ci<M;ci++){ const d=await this.trace(pi,ci); if(!d.res.ok) continue; const T=d.res.trace, vs=new Array(nS).fill(null).map(()=>({t:0,d:0,p:0}));
   for(let k=1;k<T.length;k++){ const a=T[k-1], b=T[k], dt=b[1]-a[1], s=Math.min(nS-1,Math.floor(a[0]/sec)); if(dt>0&&dt<0.2){ vs[s].t+=dt; vs[s].d+=b[0]-a[0]; vs[s].p+=b[5]*dt; } }
   const prof=vs.map(x=>x.t>0? {v:x.d/x.t,p:x.p/x.t} : null), cd=d.cond, sk=cd.solarK*cd.dayK.slice(0,6).reduce((a,x)=>a+x,0)/6;
   all.push(prof); (cd.late>0.1? cls.late : sk>1.02? cls.sunny : sk<0.96? cls.cloudy : cls.normal).push(prof); }
  if(!all.length){ toast("完走した走りがなく、目標を作れません","#ef4444"); return; }
  const Vn=PRO.motorVnom||((PRO.vFull+PRO.vEmpty)/2), agg=(list)=>{ if(!list.length) return null; return [...Array(nS)].map((_,s)=>{ const v=list.map(p=>p[s]&&p[s].v).filter(Number.isFinite).sort((a,b)=>a-b), pw=list.map(p=>p[s]&&p[s].p).filter(Number.isFinite).sort((a,b)=>a-b); if(!v.length) return null; const q=(a,f)=>a[Math.min(a.length-1,Math.floor(f*a.length))]; return {k0:s*sec,v:q(v,0.5),vlo:q(v,0.25),vhi:q(v,0.75),I:Math.max(0,q(pw,0.5)-P.auxW)/Vn}; }); };
  const T={ts:Date.now(),pol:r.pols[pi],rate:r.P[pi].rate,n:all.length,all:agg(all),sunny:agg(cls.sunny),normal:agg(cls.normal),cloudy:agg(cls.cloudy),late:agg(cls.late)};
  const cs=[0,...RP_CS.map(c=>c.km),TOTAL_KM], names=["Darwin",...RP_CS.map(c=>c.name),"Adelaide"]; T.cs=[];
  for(let i=0;i<cs.length-1;i++){ const L=T.all.filter(x=>x&&x.k0>=cs[i]&&x.k0<cs[i+1]); if(!L.length) continue; const m=(f)=>L.reduce((a,x)=>a+x[f],0)/L.length; T.cs.push({name:`${names[i]} → ${names[i+1]}`,v:m("v"),vlo:m("vlo"),vhi:m("vhi"),I:m("I")}); }
  this.targets=T; TrendLoad.setTargets(T);
  toast(`ドライバーの目標を作りました (${all.length} 本から)。レースの「速度指示に傾向の目標を使う」で使えます`,"#34d399"); const sel=this.selPol; this.right(); this.selPol=sel; this.drawTargets(); },
 loadTargets(){ return this.targets||(this.targets=TrendLoad.targets()); },
 targetAt(km){ return TrendLoad.targetAt(km); },
 drawTargets(){ const el=document.getElementById("tr-sel"), T=this.loadTargets(); if(!el||!T||!T.cs) return; const d=document.createElement("div"); d.className="tr-tg";
  d.innerHTML=`<div class="hv-h">${ic("flag")}ドライバーの目標 (推奨の方針・CS 間の平均)<span class="dim">${T.n} 本から・${new Date(T.ts).toLocaleString("ja-JP")}</span></div><div class="tr-tgt"><span class="lb">区間</span><span class="lb">目標速度</span><span class="lb">幅 (25〜75 %)</span><span class="lb">目標電流</span>${T.cs.map(x=>`<span>${escHtml(x.name)}</span><b>${x.v.toFixed(0)} km/h</b><span>${x.vlo.toFixed(0)}〜${x.vhi.toFixed(0)}</span><b>${x.I.toFixed(1)} A</b>`).join("")}</div>`;
  el.appendChild(d); },
});
