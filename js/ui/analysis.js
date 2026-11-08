"use strict";
/* ============ 走行の分析画面 ============
 走行ログ (今回の走行 / 読み込んだ CSV) を、斜め上から見た立体地図と距離軸のグラフで見る。
 ・地図: ルートに沿った帯 (高さ = 選んだ指標、または標高) を指標で色分け。ドラッグで回転・ホイールで拡大
 ・グラフ: なぞると地図に地点、ドラッグで区間を選ぶ (ダブルクリックで解除)、ホイールで拡大
 ・右の欄: 区間の集計・比較する走行との差・ドライバーごとの特性 */
const Ana={
 runs:[], cur:0, cmp:-1, layout:"A", metric:"v", mapMode:"band", sel:null, cursor:null, xr:null, built:false, zoomDay:null, hidden:new Set(),
 /* ---------- 保存 (この端末のブラウザ内 IndexedDB): 読み込んだ CSV と、名前・日付を編集した走行 ---------- */
 DB:{
  open(){ if(this.p) return this.p; this.p=new Promise(res=>{ try{ const q=indexedDB.open("bwsc-runs",1); q.onupgradeneeded=()=>q.result.createObjectStore("runs",{keyPath:"id"}); q.onsuccess=()=>res(q.result); q.onerror=()=>res(null); }catch(e){ res(null); } }); return this.p; },
  async tx(mode,fn){ const db=await this.open(); if(!db) return null; return new Promise(res=>{ try{ const t=db.transaction("runs",mode), st=t.objectStore("runs"), q=fn(st); t.oncomplete=()=>res(q&&q.result!==undefined?q.result:true); t.onerror=t.onabort=()=>res(null); }catch(e){ res(null); } }); },
  all(){ return this.tx("readonly",st=>st.getAll()).then(r=>Array.isArray(r)?r:[]); },
  put(o){ return this.tx("readwrite",st=>st.put(o)); },
  del(id){ return this.tx("readwrite",st=>st.delete(id)); } },
 ymd(t){ const d=new Date(t); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; },
 newId(k){ return k+"-"+Date.now().toString(36)+Math.random().toString(36).slice(2,6); },
 save(run){ run.stored=true; return this.DB.put({id:run.id,name:run.name,date:run.date||"",demo:!!run.demo,live:!!run.live,socEst:!!run.socEst,rows:run.rows,ts:Date.now()}).then(ok=>{ if(!ok) toast("この端末に保存できませんでした (ブラウザの設定を確認)","#f59e0b"); return ok; }); },
 async loadStored(){ if(this.loaded) return; this.loaded=true;
  for(const o of await this.DB.all()){ if(!o||!o.id||!Array.isArray(o.rows)||this.runs.some(r=>r.id===o.id)) continue;
   try{ const run=this.prep({id:String(o.id),name:String(o.name||"走行"),date:String(o.date||""),demo:!!o.demo,live:false,wasLive:!!o.live,socEst:!!o.socEst,rows:o.rows}); run.stored=true; this.runs.push(run); }catch(e){} } },
 label(r){ return r.name+(r.date?` ・ ${r.date}`:""); },
 COLMAP:{"日":"day","経過h":"eh","km":"km","状態":"st","速度km/h":"v","制限km/h":"lim","SOC%":"soc","発電W":"ps","モーターW":"pm","収支W":"net",
  "日射W/m²":"ghi","気温°C":"ta","セル温度°C":"tc","風速m/s":"wind","向かい風m/s":"head","勾配%":"gr","標高m":"el","スロットル%":"thr",
  "物理ブレーキ%":"brk","回生%":"rgn","回生W":"rgW","ドライバー":"drv","天候":"wx","順位":"rank","メモ":"memo"},
 METRICS:{
  v:{label:"速度",unit:"km/h",lo:40,hi:110,f:b=>b.v},
  net:{label:"収支",unit:"W",lo:-800,hi:800,f:b=>b.net,div:true},
  soc:{label:"SOC",unit:"%",lo:0,hi:100,f:b=>b.soc},
  whkm:{label:"電費",unit:"Wh/km",lo:5,hi:25,f:b=>b.whkm},
  ghi:{label:"日射",unit:"W/m²",lo:0,hi:1100,f:b=>b.ghi},
  gr:{label:"勾配",unit:"%",lo:-3,hi:3,f:b=>b.gr,div:true},
  drv:{label:"ドライバー",unit:"",cat:true,f:b=>b.drv} },
 /* ---------- データ ---------- */
 fromRunLog(){
  if(!RunLog.rows.length) return null;
  const idx={}; RunLog.COLS.forEach((c,i)=>{ if(this.COLMAP[c]) idx[this.COLMAP[c]]=i; });
  const rows=RunLog.rows.map(r=>{ const o={}; for(const k in idx) o[k]=r[idx[k]]; o.abs=r[1]; return o; });
  const d=new Date(); return this.prep({id:"live-"+(RunLog.sid||"0"),date:this.ymd(Date.now()),name:`今回の走行 (${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")} 時点)`,rows,live:true});
 },
 parseCSV(text,name,date){
  text=text.replace(/^﻿/,""); const lines=[]; let row=[], f="", q=false;
  for(let i=0;i<text.length;i++){ const c=text[i];
   if(q){ if(c==='"'){ if(text[i+1]==='"'){ f+='"'; i++; } else q=false; } else f+=c; }
   else if(c==='"') q=true; else if(c===","){ row.push(f); f=""; } else if(c==="\n"){ row.push(f.replace(/\r$/,"")); lines.push(row); row=[]; f=""; } else f+=c; }
  if(f||row.length){ row.push(f); lines.push(row); }
  const li=lines.findIndex(l=>l.some(c=>/^Speed\[km\/?h\]$/i.test(c.trim())));
  if(li>=0&&!(lines[0]||[]).some(c=>this.COLMAP[c.trim()])) return this.fromLogger(lines,li,name,date);   // 車載の計測器の CSV
  const head=lines.shift()||[], idx={}; head.forEach((c,i)=>{ const k=this.COLMAP[c.trim()]; if(k) idx[k]=i; });
  if(idx.km==null||idx.v==null) throw new Error("km と 速度 の列がありません");
  const TXT={st:1,drv:1,wx:1,memo:1};
  const rows=lines.filter(l=>l.length>=head.length-1).map(l=>{ const o={}; for(const k in idx){ const v=l[idx[k]]; o[k]=TXT[k]? (v||"") : (v===""||v==null? NaN : +v); }
   o.abs= Number.isFinite(o.eh)? o.eh+8 : NaN; return o; }).filter(o=>Number.isFinite(o.km));
  if(!rows.length) throw new Error("データ行がありません");
  return this.prep({id:this.newId("csv"),name,date:date||"",rows});
 },
 /* 車載の計測器の CSV (一定間隔: 速度・発電・電池の電力・電圧)。距離は速度を積み上げ、時刻は夕方の長い停車を 17:00 として合わせ (なければ 8:30 発)、日付がレース期間ならその日の実際の天気を補い、勾配・標高はルートから補う。
  モーター側の電力 = 発電 + 電池 (電池は放電を + とする) */
 fromLogger(lines,li,name,date){
  const head=lines[li].map(c=>c.trim()), col=(re)=>head.findIndex(c=>re.test(c));
  const iV=col(/^Speed\[/i), iS=col(/^Solar_Watt\[/i), iB=col(/^Battery_Watt\[/i), iU=col(/^Main_Volt\[/i), iA=col(/^Battery\[A\]/i);
  if(iV<0||iS<0||iB<0) throw new Error("速度・発電・電池の電力の列がありません");
  let dt=5; for(const l of lines.slice(0,li)){ const m=l.join(" ").match(/(\d+(?:\.\d+)?)\s*秒間隔/); if(m) dt=+m[1]; }
  const H0=8.5, rows=[]; let km=0, t=0, pv=0;
  let no=0; for(const l of lines.slice(li+1)){ const n=+(l[0]||"").trim(); if(!/^\d+$/.test((l[0]||"").trim())||(no&&n!==no+1)) { if(no) break; continue; } no=n;   // 通し番号が途切れたら終わり (下の集計行は読まない)
   const v=+l[iV], ps=+l[iS], pb=+l[iB]; if(![v,ps,pb].every(Number.isFinite)) continue;
   km=Math.min(TOTAL_KM,km+(v+pv)/2*dt/3600); pv=v; t+=dt;
   const e0=profileAt(Math.max(0,km-0.25)).elev, e1=profileAt(Math.min(TOTAL_KM,km+0.25)).elev, d=Math.min(TOTAL_KM,km+0.25)-Math.max(0,km-0.25);
   rows.push({t:t/3600,day:1,km,v,ps,pm:ps+pb,net:-pb,soc:NaN,el:profileAt(km).elev,gr:d>0?(e1-e0)/(d*1000)*100:0,st:v>0.5?"走行":"停車",vt:iU>=0?+l[iU]:NaN,ia:iA>=0?+l[iA]:NaN}); }
  if(rows.length<10) throw new Error("データ行がありません");
  // 時刻: 夕方の長い停車 (40 分以上) の始まりを 17:00 とする。見つからなければ 8:30 発
  let h0=H0, st=null; for(const r of rows){ if(r.v<1){ if(st==null) st=r.t; } else { if(st!=null&&r.t-st>=40/60){ const c=17-st; if(c>=7&&c<=10.5) h0=c; } st=null; } }
  if(st!=null&&rows[rows.length-1].t-st>=40/60){ const c=17-st; if(c>=7&&c<=10.5) h0=c; }
  // 日付 (見出しの日付) がレース期間なら、その日の実際の天気 (日射・気温・風) を補う → 発電の効率・向かい風込みの推定に使える
  let day=1, doy=null; for(const l of lines.slice(0,li)){ const m=l.join(" ").match(/(20\d\d)[\/-](\d{1,2})[\/-](\d{1,2})/); if(m){ const d=new Date(+m[1],+m[2]-1,+m[3]); date=this.ymd(d); const j=Math.round((d-new Date(+m[1],0,0))/864e5); if(j-PRO.dayOfYear>=0&&j-PRO.dayOfYear<7){ doy=j; day=j-PRO.dayOfYear+1; } break; } }
  for(const r of rows){ r.day=day; r.abs=(day-1)*24+h0+r.t; r.eh=r.abs-8; const hr=h0+r.t;
   if(doy!=null&&typeof RealWx!=="undefined"&&RealWx.ok){ const q=profileAt(r.km), g=RealWx.at("ghi",q.lat,q.lon,doy,hr), t=RealWx.at("t",q.lat,q.lon,doy,hr), w=RealWx.wind(q.lat,q.lon,doy,hr);
    if(g!=null) r.ghi=g; if(t!=null) r.ta=t; if(w) r.head=-w.ws*Math.cos(w.toward-q.bearing);
    const dn=RealWx.at("dni",q.lat,q.lon,doy,hr), dh=RealWx.at("dhi",q.lat,q.lon,doy,hr); if(dn!=null&&dh!=null){ r.dni=dn; r.dhi=dh; r.alt=Phys.sunPos(q.lat,q.lon,doy,hr).alt; } } }
  // 電池の残量 (SOC): 電圧と電流から開放電圧 (= 電圧 + 電流 × 内部抵抗) を出し、5 分の平均でならして、電池モデルの電圧カーブから逆に引く
  let socEst=false;
  if(iU>=0&&iA>=0&&rows.every(r=>Number.isFinite(r.vt))){ const R=Phys.rInt(25,0.5), oc=rows.map(r=>r.vt+(Number.isFinite(r.ia)?r.ia:0)*R), n=Math.max(1,Math.round(150/dt));
   const inv=(V)=>{ const f=(V-PRO.vEmpty)/(PRO.vFull-PRO.vEmpty); if(f<=0) return 0; if(f>=1) return 1; for(let i=1;i<OCV_TBL.length;i++){ const [s1,f1]=OCV_TBL[i]; if(f<=f1){ const [s0,f0]=OCV_TBL[i-1]; return s0+(s1-s0)*(f-f0)/(f1-f0); } } return 1; };
   let sum=0; const pre=[0]; for(const v of oc){ sum+=v; pre.push(sum); }
   rows.forEach((r,i)=>{ const a=Math.max(0,i-n), b=Math.min(rows.length,i+n+1); r.soc=inv((pre[b]-pre[a])/(b-a))*100; }); socEst=true; }
  return this.prep({id:this.newId("log"),name,date:date||"",rows,logger:true,socEst});
 },
 prep(run){
  const R=run.rows;
  for(const r of R){ if(!Number.isFinite(r.net)) r.net=(r.ps||0)-(r.pm||0); if(!r.drv) r.drv="―"; if(!r.st) r.st= r.v>0.5?"走行":"停車"; }
  // 1 km ごとの平均 (地図の帯用)
  const n=Math.ceil(TOTAL_KM)+1, acc=new Array(n);
  for(const r of R){ if(r.st!=="走行") continue; const i=clamp(Math.floor(r.km),0,n-1), a=acc[i]||(acc[i]={n:0,v:0,net:0,soc:0,pm:0,ghi:0,gr:0,el:0,drv:{}});
   a.n++; a.v+=r.v; a.net+=r.net; a.soc+=r.soc; a.pm+=r.pm||0; a.ghi+=r.ghi||0; a.gr+=r.gr||0; a.el+=r.el||0; a.drv[r.drv]=(a.drv[r.drv]||0)+1; }
  run.bins=acc.map((a,i)=>a? {km:i+0.5,v:a.v/a.n,net:a.net/a.n,soc:a.soc/a.n,whkm:a.v>0? (a.pm/a.n)/(a.v/a.n) : NaN,ghi:a.ghi/a.n,gr:a.gr/a.n,el:a.el/a.n,
   drv:Object.entries(a.drv).sort((x,y)=>y[1]-x[1])[0][0]} : null);
  run.drivers=[...new Set(R.filter(r=>r.st==="走行").map(r=>r.drv))];
  run.kmMax=R.reduce((m,r)=>Math.max(m,r.km),0);
  // 日ごとの距離の範囲 (グラフの日付の拡大用)
  const dm=new Map(); for(const r of R){ const d=Number.isFinite(r.day)? r.day : Number.isFinite(r.abs)? Math.floor(r.abs/24)+1 : NaN; if(!Number.isFinite(d)) continue; const o=dm.get(d); if(o){ o.a=Math.min(o.a,r.km); o.b=Math.max(o.b,r.km); } else dm.set(d,{d,a:r.km,b:r.km}); }
  run.days=[...dm.values()].filter(o=>o.b-o.a>0.05).sort((x,y)=>x.d-y.d);
  return run;
 },
 /* 区間 [a,b] の集計 (走行中の行のつながりで積分) */
 stats(run,a,b,drv){
  const R=run.rows; let dist=0,t=0,use=0,gen=0,rg=0,band=[0,0],dvs=[],thrOps=0,acc=0,up=[0,0],brk=0,rgn=0,n=0;
  for(let i=1;i<R.length;i++){ const p=R[i-1], r=R[i]; if(r.km<a||p.km>b) continue;
   const dk=r.km-p.km, moving=p.st==="走行"&&r.st==="走行";
   let dt=r.abs-p.abs; const dtv=dk/Math.max(1,(r.v+p.v)/2);
   if(!(dt>0)||dt>0.5||moving&&dk>0&&dt>dtv*3+0.01){ if(moving&&dk>0) dt=dtv; else continue; }   // 時刻が無い・飛んでいる行は速度から
   gen+=(r.ps||0)*dt;
   if(!moving) continue; if(drv&&p.drv!==drv) continue;
   if(dk<=0) continue;
   dist+=dk; t+=dt; use+=(r.pm||0)*dt; rg+=(r.rgW||0)*dt; n++;
   if(r.v>=70&&r.v<85){ band[0]+=(r.pm||0)*dt; band[1]+=dk; }
   dvs.push(r.v-p.v); if(Math.abs((r.thr||0)-(p.thr||0))>=3) thrOps++; if(Math.abs(r.v-p.v)>=3) acc++;
   if((r.gr||0)>1){ up[0]+=(r.pm||0); up[1]++; } if((r.brk||0)>5) brk++; if((r.rgn||0)>5) rgn++; }
  const sd=dvs.length? Math.sqrt(dvs.reduce((s,x)=>s+x*x,0)/dvs.length) : NaN;
  const first=R.find(r=>r.km>=a), last=[...R].reverse().find(r=>r.km<=b);
  return {dist,t,avg:t>0?dist/t:NaN,use,gen,rg,whkm:dist>0?use/dist:NaN,whkmBand:band[1]>2?band[0]/band[1]:NaN,sd,
   thrOps:dist>0?thrOps/dist*100:NaN,acc:dist>0?acc/dist*100:NaN,upW:up[1]?up[0]/up[1]:NaN,brk:n?brk/n*100:NaN,rgn:n?rgn/n*100:NaN,
   dsoc:first&&last? last.soc-first.soc : NaN};
 },
 /* ---------- 画面 ---------- */
 build(){
  if(this.built) return; this.built=true;
  const el=document.createElement("div"); el.id="ana"; el.innerHTML=`
  <div class="ana-top"><img src="assets/img/logo.svg" class="logo" width="54" alt=""><span class="ana-ttl">RUN ANALYSIS</span>
   <span class="lb">走行</span><select id="ana-run"></select><button class="btn ana-sm ana-ico" id="ana-edit" title="名前・日付を編集">${ic("edit")}</button><button class="btn ana-sm ana-ico" id="ana-del" title="この走行を削除">${ic("trash")}</button>
   <span class="lb">比較</span><select id="ana-cmp"></select>
   <button class="btn ana-sm" id="ana-demo" title="お試し用のデモ走行を追加">${ic("play")}デモ</button>
   <label class="btn ana-sm" title="CSV を読み込む (複数可)">${ic("upload")}CSV 読み込み<input type="file" id="ana-file" accept=".csv,text/csv" multiple hidden></label>
   <span class="lb">表示</span><div class="seg" id="ana-lay"><button data-v="A">地図</button><button data-v="B">グラフ</button></div>
   <span class="lb">地図</span><div class="seg" id="ana-mode"><button data-v="band">帯</button><button data-v="elev">標高</button></div>
   <span class="lb">色</span><div class="seg" id="ana-met">${Object.entries(this.METRICS).map(([k,m])=>`<button data-v="${k}">${m.label}</button>`).join("")}</div>
   <button class="btn ana-sm" id="ana-all" title="グラフの範囲と区間をリセット">全体</button>
   <button class="btn ana-sm ana-x" onclick="Fade.go(()=>Ana.close())">${ic("x")}閉じる</button></div>
  <div class="ana-body" id="ana-body"><div class="ana-map" id="ana-map"><div class="ana-hint">ドラッグで回転 ・ 右ドラッグ / Shift で移動 ・ ホイール / 2 本指で拡大 ・ クリックで地点</div><div class="ana-compass" id="ana-compass" title="北の向き (クリックで北を上に)" onclick="Ana.map&&Ana.map.north()"><i></i><b>N</b></div><div class="ana-ctl"><button class="btn" title="左に回す" onclick="Ana.map.rot(-1)">${ic("rotate","flipx")}</button><button class="btn" title="右に回す" onclick="Ana.map.rot(1)">${ic("rotate")}</button><button class="btn" title="寝かせる" onclick="Ana.map.tilt(1)">${ic("chd")}</button><button class="btn" title="起こす" onclick="Ana.map.tilt(-1)">${ic("chu")}</button><button class="btn" title="北を上に" onclick="Ana.map.north()">N</button><button class="btn" title="真上から" onclick="Ana.map.top()">真上</button><button class="btn" title="区間に合わせる" onclick="Ana.map.fit()">合わせる</button><button class="btn" title="初期の向き" onclick="Ana.map.reset()">初期</button></div><div class="ana-leg" id="ana-leg"></div><div class="ana-play" id="ana-play"><button class="btn" id="ana-pp" title="再生 / 一時停止" onclick="Ana.togglePlay()">${ic("play")}</button><div class="seg" id="ana-rate"><button data-r="600">×600</button><button data-r="3600">×3600</button><button data-r="14400">×4h</button></div><input type="range" id="ana-ps" min="0" max="1000" value="0" step="1"><label class="chk" title="地図を再生位置に合わせて動かす"><input type="checkbox" id="ana-follow" checked><i></i>追従</label><div class="ana-pr" id="ana-pr"></div></div><div class="ana-tag" id="ana-tag"></div></div>
   <div class="ana-pane" id="ana-pane"></div><div class="ana-charts" id="ana-charts"><div class="ana-days" id="ana-days"></div><canvas id="ana-cv"></canvas><canvas id="ana-cv2"></canvas><canvas id="ana-nav" title="つかんで動かす・端をつかんで範囲を変える"></canvas></div>
   <div class="ana-empty" id="ana-empty">走行ログがありません。レースモードで走るか、CSV を読み込むか、デモを追加してください。</div></div>
  <div class="ana-dlg" id="ana-dlg"><div class="box"><div class="ph">${ic("edit")}走行データの編集</div>
   <label class="lb">名前<input id="ana-dn" maxlength="60" autocomplete="off"></label><label class="lb">日付<input type="date" id="ana-dd"></label>
   <div class="row"><button class="btn ana-sm" id="ana-dcancel">キャンセル</button><button class="btn pri ana-sm" id="ana-dsave">保存</button></div></div></div>`;
  document.body.appendChild(el);
  const seg=(id,key,cb)=>document.getElementById(id).addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b) return; this[key]=b.dataset.v; cb&&cb(); this.render(); });
  seg("ana-lay","layout"); seg("ana-mode","mapMode",()=>this.map&&(this.map.dirty=true)); seg("ana-met","metric",()=>this.map&&(this.map.dirty=true));
  document.getElementById("ana-run").onchange=e=>{ this.stopPlay(); this.play.t=null; this.cur=+e.target.value; this.sel=null; this.xr=null; this.zoomDay=null; this.map&&(this.map.dirty=true); this.render(); };
  document.getElementById("ana-cmp").onchange=e=>{ this.cmp=+e.target.value; this.render(); };
  document.getElementById("ana-demo").onclick=()=>{ try{ localStorage.removeItem("bwsc_ana_nodemo"); }catch(e){} this.emptied=false; this.addDemo(); };
  document.getElementById("ana-all").onclick=()=>{ this.sel=null; this.xr=null; this.zoomDay=null; this.map&&(this.map.dirty=true); this.render(); };
  document.getElementById("ana-file").onchange=async e=>{ for(const f of e.target.files){ try{ const buf=await f.arrayBuffer(); let txt; try{ txt=new TextDecoder("utf-8",{fatal:true}).decode(buf); }catch(x){ txt=new TextDecoder("shift_jis").decode(buf); }   // Excel の CSV (Shift_JIS) も読む
     const run=this.parseCSV(txt,f.name.replace(/\.csv$/i,""),this.ymd(f.lastModified||Date.now())); this.runs.push(run); this.cur=this.runs.length-1; this.save(run); }catch(err){ toast("読み込めません: "+escHtml(f.name)+" ― "+escHtml(err.message),"#ef4444"); } }
   e.target.value=""; this.sel=null; this.xr=null; this.map&&(this.map.dirty=true); this.render(); };
  addEventListener("resize",()=>{ if(this.isOpen()) this.render(); });
  // 画面の回転・表示領域の変化 (スマホ) でも描き直す
  if(window.ResizeObserver){ const ro=new ResizeObserver(()=>{ if(this.isOpen()&&!this._rz) this._rz=requestAnimationFrame(()=>{ this._rz=0; this.render(); }); }); ro.observe(document.getElementById("ana-body")); }
  document.getElementById("ana-edit").onclick=()=>this.editRun();
  document.getElementById("ana-del").onclick=()=>this.deleteRun();
  document.getElementById("ana-dcancel").onclick=()=>document.getElementById("ana-dlg").classList.remove("on");
  document.getElementById("ana-dsave").onclick=()=>this.saveEdit();
  document.getElementById("ana-dn").onkeydown=e=>{ if(e.key==="Enter") this.saveEdit(); };
  document.getElementById("ana-days").addEventListener("click",e=>{ const b=e.target.closest("button"); if(b) this.zoomTo(b.dataset.d); });
  this.initNav(); this.initPlay();
  addEventListener("keydown",e=>{ if(this.isOpen()&&e.key==="Escape"){ e.stopPropagation(); const d=document.getElementById("ana-dlg"); if(d.classList.contains("on")) d.classList.remove("on"); else this.close(); } },true);
  this.initCharts();
 },
 isOpen(){ const e=document.getElementById("ana"); return !!e&&e.classList.contains("on"); },
 /* デモ走行: ゲームと同じ物理・日射で、決まった乱数から毎回同じ全行程 (200 m ごと) を作る。
  ドライバー 2 人 (CS と毎朝で交代)、天気の崩れ 3 回、CS・夕方・朝の充電を含む */
 addDemo(){
  if(this.runs.some(r=>r.demo)){ this.cur=this.runs.findIndex(r=>r.demo); this.sel=null; this.xr=null; this.map&&(this.map.dirty=true); this.render(); return; }
  if(!Engine.st) Engine.init();
  const s=Engine.st, save={doy:s.dayOfYear,km:s.km,w:s.weather,tilt:s.tiltDeg};
  let seed=20251019; const rnd=()=>((seed=(seed*1103515245+12345)>>>0)/4294967296);
  const plan=[{start:24+11.2,dur:1.3,factor:0.45},{start:48+13.5,dur:0.8,factor:0.15},{start:72+9.8,dur:2.0,factor:0.45}];
  const Wh=Math.max(500,P.batteryWh), pv=(G)=>P.arrayArea*P.cellEff*P.mpptEff*G*PRO.solarScale*0.92, rows=[], D=["デモ 山本","デモ 佐々木"];
  let abs=8, km=0, soc=1, drv=0, ci=0, sp=0, vPrev=0, thrPrev=0; const STEP=0.2, V0=74;
  const G=(tilted)=>{ const day=Math.floor(abs/24)+1, h=abs-(day-1)*24, pr=profileAt(km); s.dayOfYear=PRO.dayOfYear+day-1; s.km=km; s.tiltDeg=40;
   const w=plan.find(p=>abs>=p.start&&abs<p.start+p.dur); s.weather=w?{type:w.factor<0.3?"squall":"cloud",factor:w.factor}:null; return Engine.solarCalc(pr.lat,h,tilted,pr.lon,pr.elev).G; };
  const push=(st,v,ps,pm,ghi,thr,brk,rgn,rgW)=>{ const pr=profileAt(km); rows.push({day:Math.floor(abs/24)+1,abs,km,st,v,lim:speedLimitAt(km),soc:soc*100,ps,pm,net:ps-pm,ghi,
   el:pr.elev,gr:(profileAt(km+0.2).elev-pr.elev)/2,thr,brk,rgn,rgW,drv:D[drv],wx:s.weather?(s.weather.type==="squall"?"スコール":"曇天"):"快晴"}); };
  const charge=(hours,st)=>{ for(let t=0;t<hours;t+=1/6){ const d=Math.min(1/6,hours-t), g=G(true), ps=pv(g); soc=Math.min(1,soc+ps*d/Wh); abs+=d; push(st,0,ps,0,g,0,0,0,0); } };
  try{
   for(let guard=0;guard<40000&&km<TOTAL_KM;guard++){
    const day=Math.floor(abs/24), h=abs-day*24;
    if(h>=17){ const pr=profileAt(km), ss=Engine.sunsetHour(pr.lat,pr.lon); charge(Math.max(0,ss-h),"夜営"); abs=(day+1)*24+6.25; charge(1.75,"夜営"); drv=(drv+1)%2; continue; }
    const style=drv?1.04:1.0, noise=(rnd()-0.5)*(drv?6:3);
    sp+=(rnd()-0.5)*0.6; sp*=0.92;
    let v=Math.min(speedLimitAt(km+STEP/2), V0*style*(1+0.03*Math.sin(km/9))+sp*4+noise);
    if(soc<0.12) v=Math.min(v,55);
    const g=(profileAt(km+STEP).elev-profileAt(km).elev)/(STEP*1000), gi=G(false), ps=pv(gi), pm=Math.max(0,Strategy.drivePower(v/3.6,g));
    const dv=v-vPrev, brk=dv<-6&&rnd()<(drv?0.5:0.25)?60:0, rgn=dv<-3&&!brk?70:0, rgW=rgn?Math.min(600,-dv*40):0;
    const thr=clamp(pm/30+(rnd()-0.5)*(drv?10:4),0,100);
    const dt=STEP/v; soc=clamp(soc+(ps-pm+rgW*0.5)*dt/Wh,0,1); km=Math.min(TOTAL_KM,km+STEP); abs+=dt; vPrev=v; thrPrev=thr;
    push("走行",v,ps,pm,gi,thr,brk,rgn,rgW);
    const c=RP_CS[ci]; if(c&&km>=c.km){ charge(0.5,"CS"); ci++; drv=(drv+1)%2; vPrev=0; }
   }
  } finally{ s.dayOfYear=save.doy; s.km=save.km; s.weather=save.w; s.tiltDeg=save.tilt; }
  const run=this.prep({id:"demo",name:"デモ走行 (サンプル)",date:"",rows,demo:true}); this.runs.push(run); this.cur=this.runs.length-1;
  this.sel=null; this.xr=null; this.map&&(this.map.dirty=true); this.render(); toast("デモ走行を追加しました","#34d399");
 },
 async open(){
  this.build(); document.getElementById("ana").classList.add("on"); this.wasPaused=typeof paused!=="undefined"&&paused;
  await this.loadStored();
  const live=this.fromRunLog();
  if(live&&!this.hidden.has(live.id)){ const i=this.runs.findIndex(r=>r.id===live.id);
   if(i>=0){ const o=this.runs[i]; if(o.stored){ live.name=o.name; live.date=o.date; this.save(live); } this.runs[i]=live; }
   else { this.runs=this.runs.filter(r=>!(r.live&&!r.stored)); this.runs.unshift(live); this.cur=0; } }
  let off=false; try{ off=localStorage.getItem("bwsc_ana_nodemo")==="1"; }catch(e){}
  if(!this.runs.length&&!this.emptied&&!off) this.addDemo();
  if(this.cur>=this.runs.length) this.cur=0;
  this.map&&(this.map.dirty=true); this.render();
 },
 /* 名前・日付の編集と削除 */
 editRun(){ const run=this.run(); if(!run) return; document.getElementById("ana-dn").value=run.name; document.getElementById("ana-dd").value=/^\d{4}-\d{2}-\d{2}$/.test(run.date||"")?run.date:"";
  document.getElementById("ana-dlg").classList.add("on"); setTimeout(()=>document.getElementById("ana-dn").focus(),30); },
 saveEdit(){ const run=this.run(); if(!run) return; const n=document.getElementById("ana-dn").value.replace(/\s+/g," ").trim().slice(0,60);
  if(!n){ toast("名前を入れてください","#f59e0b"); return; }
  run.name=n; run.date=document.getElementById("ana-dd").value||""; document.getElementById("ana-dlg").classList.remove("on");
  this.save(run); this.render(); toast("走行データを更新しました","#34d399"); },
 deleteRun(){ const run=this.run(); if(!run) return;
  if(!confirm(`「${run.name}」を削除します。元に戻せません。`)) return;
  if(run.live) this.hidden.add(run.id);
  if(run.demo) try{ localStorage.setItem("bwsc_ana_nodemo","1"); }catch(e){}
  this.DB.del(run.id); const i=this.cur; this.runs.splice(i,1);
  if(this.cmp===i) this.cmp=-1; else if(this.cmp>i) this.cmp--;
  this.cur=Math.max(0,Math.min(i,this.runs.length-1)); if(!this.runs.length) this.emptied=true;
  this.sel=null; this.xr=null; this.zoomDay=null; this.map&&(this.map.dirty=true); this.render(); toast("削除しました","#8b9097"); },
 close(){ this.stopPlay(); const e=document.getElementById("ana"); if(e) e.classList.remove("on"); },
 /* ---------- 走りの再生: 走行ログの時刻に沿って、地図の上の印・グラフの縦線・数値を動かす (早送り) ---------- */
 play:{on:false,t:null,rate:3600,raf:0,last:0},
 playRows(run){ if(run._pr) return run._pr; const R=run.rows.filter(r=>Number.isFinite(r.abs)&&Number.isFinite(r.km)); return run._pr= R.length>1&&R[R.length-1].abs>R[0].abs? R : null; },
 initPlay(){
  document.getElementById("ana-rate").addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b) return; this.play.rate=+b.dataset.r; this.playUI(); });
  const sl=document.getElementById("ana-ps"); sl.addEventListener("input",()=>{ const R=this.playRows(this.run()); if(!R) return; this.play.t=R[0].abs+(R[R.length-1].abs-R[0].abs)*sl.value/1000; this.playAt(); });
  this.playUI();
 },
 playUI(){ document.querySelectorAll("#ana-rate button").forEach(b=>b.classList.toggle("on",+b.dataset.r===this.play.rate)); document.getElementById("ana-pp").innerHTML=ic(this.play.on?"pause":"play");
  document.getElementById("ana-play").classList.toggle("off",!this.playRows(this.run()||{rows:[]})); },
 togglePlay(){ const run=this.run(), R=run&&this.playRows(run); if(!R){ toast("この走行には時刻の列がないため再生できません","#f59e0b"); return; }
  if(this.play.on){ this.stopPlay(); return; }
  if(this.play.t==null||this.play.t>=R[R.length-1].abs||this.play.run!==run) this.play.t=R[0].abs;
  this.play.run=run; this.play.on=true; this.play.last=performance.now(); this.lock=true; this.playUI();
  const step=(now)=>{ if(!this.play.on) return; const dt=Math.min(0.1,(now-this.play.last)/1000); this.play.last=now; this.play.t+=dt*this.play.rate/3600;
   if(this.play.t>=R[R.length-1].abs){ this.play.t=R[R.length-1].abs; this.playAt(); this.stopPlay(); return; }
   this.playAt(); this.play.raf=requestAnimationFrame(step); };
  this.play.raf=requestAnimationFrame(step); },
 stopPlay(){ this.play.on=false; cancelAnimationFrame(this.play.raf); if(document.getElementById("ana-pp")) this.playUI(); },
 /* 再生位置 (時刻 t) の行を前後の行から補間して表示 */
 playAt(){
  const run=this.run(), R=run&&this.playRows(run); if(!R) return; const t=this.play.t;
  let lo=0, hi=R.length-1; while(lo<hi){ const m=(lo+hi)>>1; if(R[m].abs<t) lo=m+1; else hi=m; }
  const b=R[lo], a=R[Math.max(0,lo-1)], u=b.abs>a.abs? clamp((t-a.abs)/(b.abs-a.abs),0,1) : 1, k=a.km+(b.km-a.km)*u, L=(x,y)=>Number.isFinite(x)&&Number.isFinite(y)? x+(y-x)*u : y;
  // 追従: 地図の注視点を印へ寄せて近づける。グラフの範囲も印が外れたら動かす
  if(document.getElementById("ana-follow").checked&&this.map&&this.layout==="A"){ const P=this.map.P, i=clamp(Math.round(k),0,P.length-1), v=this.map.view;
   v.tx+= (P[i][0]-v.tx)*0.15; v.tz+= (P[i][1]-v.tz)*0.15; v.d+= (Math.min(v.d,140)-v.d)*0.05; }
  if(this.xr&&(k<this.xr[0]||k>this.xr[1])){ const w=this.xr[1]-this.xr[0]; this.xr=[clamp(k-w*0.2,0,Math.max(0,run.kmMax-w)),0]; this.xr[1]=this.xr[0]+w; this.zoomDay=null; this.drawCharts(); }
  this.setCursor(k);
  const day=Math.floor(t/24)+1, hh=((t%24)+24)%24;
  document.getElementById("ana-pr").innerHTML=`<b>Day${day} ${String(Math.floor(hh)).padStart(2,"0")}:${String(Math.floor(hh%1*60)).padStart(2,"0")}</b> ${k.toFixed(1)} km ・ ${(L(a.v,b.v)||0).toFixed(0)} km/h ・ SOC ${(L(a.soc,b.soc)||0).toFixed(1)} % ・ ${escHtml(b.st||"")}${b.drv&&b.drv!=="―"?" ・ "+escHtml(b.drv):""}`;
  const sl=document.getElementById("ana-ps"); sl.value=String(Math.round((t-R[0].abs)/(R[R.length-1].abs-R[0].abs)*1000));
 },
 run(){ return this.runs[this.cur]; }, cmpRun(){ return this.cmp>=0&&this.cmp!==this.cur? this.runs[this.cmp] : null; },
 render(){
  const run=this.run(), body=document.getElementById("ana-body");
  body.className="ana-body "+this.layout; document.getElementById("ana-empty").style.display=run?"none":"flex";
  for(const [id,v] of [["ana-lay",this.layout],["ana-mode",this.mapMode],["ana-met",this.metric]]) document.querySelectorAll(`#${id} button`).forEach(b=>b.classList.toggle("on",b.dataset.v===v));
  const opt=(sel,list,v,none)=>{ sel.innerHTML=(none?`<option value="-1">比較なし</option>`:"")+list.map((r,i)=>`<option value="${i}">${escHtml(this.label(r))}</option>`).join(""); sel.value=String(v); };
  opt(document.getElementById("ana-run"),this.runs,this.cur,false); opt(document.getElementById("ana-cmp"),this.runs,this.cmp,true);
  for(const id of ["ana-edit","ana-del"]) document.getElementById(id).disabled=!run;
  this.playUI();
  if(!run) return;
  if(!this.xr) this.xr=[0,Math.max(10,run.kmMax)];
  this.renderMap(); this.drawCharts(); this.renderPane();
 },
 /* ---------- 右の欄 ---------- */
 setSel(a,b){ const run=this.run(); if(!run) return; a=clamp(+a,0,run.kmMax); b=clamp(+b,0,run.kmMax);
  this.sel= Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(b-a)>=0.1? [Math.min(a,b),Math.max(a,b)] : null; this.pickSel=0; this.map&&(this.map.dirty=true); this.render(); },
 mapPick(k){ if(this.pickSel===1){ this.pickA=k; this.pickSel=2; this.setCursor(k); toast("区間の終わりの地点をクリック","#22d3ee"); } else { this.setSel(this.pickA,k); } },
 startPick(){ this.pickSel=1; toast("地図で区間の始まりの地点をクリック","#22d3ee"); },
 presets(run){ const out=[["全行程",0,run.kmMax]], R=run.rows.filter(r=>r.st==="走行");
  const days=[...new Set(R.map(r=>r.day).filter(Number.isFinite))]; for(const d of days){ const a=R.filter(r=>r.day===d); out.push([`Day${d}`,a[0].km,a[a.length-1].km]); }
  const cs=[0,...RP_CS.map(c=>c.km),TOTAL_KM]; for(let i=0;i<cs.length-1;i++) if(cs[i]<run.kmMax) out.push([`${i?"CS"+i:"スタート"} → ${i<cs.length-2?"CS"+(i+1):"ゴール"}`,cs[i],Math.min(cs[i+1],run.kmMax)]);
  let st=null; for(const r of R){ if(!st||st.d!==r.drv){ if(st&&st.b-st.a>=5) out.push([`${st.d} ${st.a.toFixed(0)}–${st.b.toFixed(0)} km`,st.a,st.b]); st={d:r.drv,a:r.km,b:r.km}; } else st.b=r.km; }
  if(st&&st.b-st.a>=5) out.push([`${st.d} ${st.a.toFixed(0)}–${st.b.toFixed(0)} km`,st.a,st.b]);
  return out; },
 rangeUI(run){ const P=this.presets(run), [a,b]=this.sel||[0,run.kmMax];
  return `<div class="ana-range"><select id="ana-preset" onchange="const p=Ana._pre[this.value]; if(p) Ana.setSel(p[1],p[2])"><option value="">区間を選ぶ…</option>${P.map((p,i)=>`<option value="${i}">${escHtml(p[0])}</option>`).join("")}</select>
   <div class="ana-rr"><input type="number" id="ana-a" step="0.1" value="${a.toFixed(1)}"><span>–</span><input type="number" id="ana-b" step="0.1" value="${b.toFixed(1)}"><span class="u">km</span>
   <button class="btn ana-sm" onclick="Ana.setSel(document.getElementById('ana-a').value,document.getElementById('ana-b').value)">適用</button>
   <button class="btn ana-sm ${this.pickSel?"on":""}" onclick="Ana.startPick()">${ic("pin")}地図で選ぶ</button></div></div>`; },
 renderPane(){
  const run=this.run(), cmp=this.cmpRun(), [a,b]=this.sel||[0,run.kmMax], S=this.stats(run,a,b), f=(x,d)=>Number.isFinite(x)?x.toFixed(d):"―";
  const kv=(k,v,u)=>`<div class="kv"><span>${k}</span><span>${v}<span class="u">${u||""}</span></span></div>`;
  this._pre=this.presets(run);
  let h=this.rangeUI(run)+`<div class="ph">${ic("route")}${this.sel?`区間 ${a.toFixed(1)}–${b.toFixed(1)} km`:"全行程"}</div>
   ${kv("距離",f(S.dist,1),"km")}${kv("走行時間",f(S.t,2),"h")}${kv("平均速度",f(S.avg,1),"km/h")}${kv("電費",f(S.whkm,1),"Wh/km")}
   ${kv("発電",f(S.gen/1000,2),"kWh")}${kv("消費",f(S.use/1000,2),"kWh")}${kv("回生で回収",f(S.rg,0),"Wh")}${kv("SOC 変化",(S.dsoc>0?"+":"")+f(S.dsoc,1),"%")}`;
  if(cmp){ const C=this.stats(cmp,a,b), dt=(S.t-C.t)*60;
   h+=`<div class="ph" style="margin-top:12px">${ic("users")}比較: ${escHtml(cmp.name)}</div>${kv("走行時間の差",(dt>0?"+":"")+f(dt,1),"分")}${kv("平均速度",f(C.avg,1),"km/h")}${kv("電費",f(C.whkm,1),"Wh/km")}`; }
  h+=this.reviewUI(run)+this.calibUI(run);
  const ds=run.drivers.filter(d=>d!=="―");
  if(ds.length){ const D=ds.map(d=>({d,s:this.stats(run,a,b,d)})).filter(x=>x.s.dist>0.5);
   if(D.length){ const best=(k,low)=>{ const v=D.map(x=>x.s[k]).filter(Number.isFinite); return v.length>1? (low?Math.min(...v):Math.max(...v)) : null; };
    const row=(lab,k,d,low,u)=>`<span>${lab}</span>`+D.map(x=>{ const v=x.s[k], bb=best(k,low); return `<b class="${bb!=null&&v===bb?"good":""}">${f(v,d)}${u||""}</b>`; }).join("");
    h+=`<div class="ph" style="margin-top:12px">${ic("users")}ドライバー${this.sel?" (区間)":" (全行程)"}</div>
    <div class="ana-drv" style="grid-template-columns:1fr repeat(${D.length},78px)"><span></span>${D.map(x=>`<span class="lb">${escHtml(x.d.replace(/^ドライバー/,""))}</span>`).join("")}
    ${row("担当距離 km","dist",0)}${row("平均速度","avg",1)}${row("電費 Wh/km","whkm",1,true)}${row("70–85 km/h の電費","whkmBand",1,true)}
    ${row("速度のばらつき","sd",2,true)}${row("スロットル操作 /100km","thrOps",0,true)}${row("急な加減速 /100km","acc",1,true)}${row("登りの平均電力 W","upW",0,true)}
    ${row("物理ブレーキ使用 %","brk",1,true)}${row("回生使用 %","rgn",1)}${row("回生で回収 Wh","rg",0)}</div>
    <div class="ana-note">速度のばらつき = 記録点ごとの速度変化の大きさ。70–85 km/h の電費で比べると、速度の違いの影響を除いて比べられる。</div>`; } }
  document.getElementById("ana-pane").innerHTML=(this.layout==="B"?`<div id="ana-mini"></div>`:"")+h;
  if(this.layout==="B"&&this.map){ const mini=document.getElementById("ana-mini"); mini.appendChild(this.map.r.domElement); this.map.resize(); this.map.draw(); }
 },
 /* ---------- 戦略の答え合わせ: 走り始めの時刻・場所・SOC から「電池が持つ最も速い一定速度」で走った場合と比べる ----------
  区間 (スタート / CS / 走行の終わり) ごとに、かかった時間・到着 SOC・巡航の速さ・停車時間の差を出し、損の大きい順に理由を付ける */
 review(run){
  if(run._rev) return run._rev;
  const R=run.rows.filter(r=>Number.isFinite(r.abs)&&Number.isFinite(r.km)&&Number.isFinite(r.soc)); if(R.length<10) return run._rev={err:"時刻・SOC の入った行が足りません"};
  if(!Engine.st) Engine.init();
  const f=R[0], best=Strategy.bestProfile({abs:f.abs,km:f.km,soc:clamp(f.soc/100,0,1),trace:true}), tr=best.r.trace||[];
  if(tr.length<2) return run._rev={err:"推奨の計算ができませんでした"};
  const first=(arr,km,K)=>{ let lo=0,hi=arr.length-1; while(lo<hi){ const m=(lo+hi)>>1; if(K(arr[m])<km) lo=m+1; else hi=m; } return arr[lo]; };
  const aAt=(km)=>first(R,km,r=>r.km), rAt=(km)=>first(tr,km,t=>t[0]);
  const end=Math.min(run.kmMax,tr[tr.length-1][0]);
  const marks=[f.km,...RP_CS.map(c=>c.km).filter(k=>k>f.km+1&&k<end-0.5),end];
  const name=(k)=>{ const c=RP_CS.find(q=>Math.abs(q.km-k)<0.01); return c? `CS${c.n}` : k===f.km? (f.km<1?"スタート":`${f.km.toFixed(0)} km`) : `${k.toFixed(0)} km`; };
  // 区間の時間 = 走っていた時間 + 停車 (CS・任意の停車・修理など。夜と発進待ちは含めない)。区間 = [a, b) を CS の手前 0.3 km でくぎる
  const NOSTOP={"走行":1,"夜営":1,"発進待ち":1,"ゴール":1};
  const actH=(a,b)=>{ let m=0, st=0; for(let i=1;i<R.length;i++){ const p=R[i-1], r=R[i], d=r.abs-p.abs; if(!(d>0)||d>1||p.km<a-0.3||p.km>=b-0.3) continue;
    if(p.st==="走行"&&r.st==="走行") m+=d; else if(!NOSTOP[p.st]) st+=d; } return [m,st]; };
  const refH=(a,b)=>{ let m=0; for(let i=1;i<tr.length;i++){ const q=tr[i]; if(q[0]-0.001<a-0.3||q[0]-0.001>=b-0.3) continue; m+=q[4]||0; }
    const st=RP_CS.some(c=>Math.abs(c.km-a)<0.01)? 0.5 : 0; return [m,st]; };
  const legs=[];
  for(let i=0;i<marks.length-1;i++){ const a=marks[i], b=marks[i+1], A0=aAt(a), A1=aAt(b), T0=rAt(a), T1=rAt(b); if(!A0||!A1||!T0||!T1) continue;
   const [mA,sA]=actH(a,b), [mR,sR]=refH(a,b), dist=b-a, tA=mA+sA, tR=mR+sR;
   legs.push({a,b,from:name(a),to:name(b),tA,tR,dt:tA-tR,socA:A1.soc,socR:T1[2]*100,vA:mA>0?dist/mA:NaN,vR:mR>0?dist/mR:NaN,stopA:sA,stopR:sR}); }
  const why=(L)=>{ const out=[], dv=L.vA-L.vR, ds=(L.stopA-L.stopR)*60;
   if(ds>5) out.push(`停車が ${ds.toFixed(0)} 分長い`);
   if(dv<-2) out.push(`巡航が ${(-dv).toFixed(1)} km/h 遅い`);
   if(dv>2) out.push(`推奨より ${dv.toFixed(1)} km/h 速い (電池を多く使用)`);
   if(L.socA-L.socR>15&&dv<0) out.push(`到着時に電池が ${(L.socA-L.socR).toFixed(0)} % 余分に残った (もっと速く走れた)`);
   if(L.socR-L.socA>15) out.push(`電池が推奨より ${(L.socR-L.socA).toFixed(0)} % 少ない`);
   return out.join("、")||"推奨に近い"; };
  for(const L of legs) L.why=why(L);
  const last=R[R.length-1], finished=run.kmMax>=TOTAL_KM-1;
  return run._rev={v:best.v,ok:best.ok,legs,finished,finA:finished?last.abs:null,finR:best.r.finishAbs,socEnd:last.soc,
   pts:tr.map(t=>({km:t[0],v:t[3]>0?t[3]:NaN,soc:t[2]*100}))};
 },
 reviewUI(run){
  const R=run._rev, hm=(h)=>{ if(!Number.isFinite(h)) return "―"; const s=h<0?"-":"", m=Math.round(Math.abs(h)*60); return `${s}${Math.floor(m/60)}:${String(m%60).padStart(2,"0")}`; };
  let h=`<div class="ph" style="margin-top:12px">${ic("gauge")}戦略の答え合わせ</div>`;
  if(!R) return h+`<div class="ana-note" style="margin-top:0">走り始めの時刻・場所・電池から、電池が持つ最も速い速度配分 (推奨。登りは遅め・平地と下りは速め) で走った場合と比べます。</div><button class="btn ana-sm" onclick="Ana.runReview()">${ic("play")}比べる</button>`;
  if(R.err) return h+`<div class="ana-note">${escHtml(R.err)}</div>`;
  const tot=R.legs.reduce((s,L)=>s+L.dt,0);
  h+=`<div class="kv"><span>推奨の速度 (平地)</span><span>${R.v}<span class="u">km/h${R.ok?"":" (それでも電池が尽きる)"}</span></span></div>
   <div class="kv"><span>走行 + 停車の時間の差</span><span class="${tot>0?"bad":"good"}">${tot>0?"+":""}${hm(tot)}<span class="u">${tot>0?"遅い":"速い"}</span></span></div>`;
  if(R.finished&&Number.isFinite(R.finR)) h+=`<div class="kv"><span>ゴール時刻</span><span>${fmtAbsH(R.finA)}<span class="u">推奨 ${fmtAbsH(R.finR)}</span></span></div>`;
  if(R.finished) h+=`<div class="kv"><span>ゴール時の電池</span><span>${R.socEnd.toFixed(0)}<span class="u">%${R.socEnd>10?" (使い残し)":""}</span></span></div>`;
  const worst=[...R.legs].sort((x,y)=>y.dt-x.dt).filter(L=>L.dt>2/60).slice(0,3);
  if(worst.length) h+=`<div class="lb" style="margin:8px 0 4px">損が大きい区間</div>`+worst.map(L=>`<div class="ana-rv"><b>${escHtml(L.from)} → ${escHtml(L.to)}</b> <span class="bad">+${hm(L.dt)}</span><br><span>${escHtml(L.why)}</span></div>`).join("");
  h+=`<div class="ana-rvt"><span class="lb">区間</span><span class="lb">実際</span><span class="lb">推奨</span><span class="lb">差</span><span class="lb">到着 SOC</span>`+
   R.legs.map(L=>`<span>${escHtml(L.from)}→${escHtml(L.to)}</span><span>${hm(L.tA)}</span><span>${hm(L.tR)}</span><span class="${L.dt>0.02?"bad":L.dt<-0.02?"good":""}">${L.dt>0?"+":""}${hm(L.dt)}</span><span>${L.socA.toFixed(0)} / ${L.socR.toFixed(0)} %</span>`).join("")+`</div>
   <div class="ana-note">グラフの水色の点線 = 推奨で走った場合の速度と SOC。区間の時間 = 走っていた時間 + 停車 (CS など。夜は含めない)。到着 SOC = 実際 / 推奨。</div>`;
  return h;
 },
 /* ---------- 車両モデルの合わせ込み: 走行ログから転がり抵抗・空気抵抗・一定の消費・発電の効率を推定し、今の設定と比べる ----------
  一定速度に近い走行中の行 (加速度が小さい・ブレーキ/回生なし) で、
   モーター電力 - 登り/加速の分 = a·v + b·(対気速度)²·v + c  を最小二乗で解く。
   a = Crr·m·g/η, b = ½ρ·CdA/η, c = 一定の消費 (補機・制御)。η (駆動の効率) は 0.95 と置く
  発電: 日射 300 W/m² 以上の行で 発電 ÷ (日射 × アレイ面積) = 実効の効率 */
 ETA:0.95,
 calib(run){
  if(run._cal) return run._cal;
  const R=run.rows, m=massTotal(), g=9.81, eta=this.ETA, X=[], Y=[];
  /* 3 km (最長 5 分) ごとの平均に当てはめる。瞬間の値は加速・計測の揺れが大きいので使わない。運動エネルギーの増減と勾配の分は差し引く */
  let c=null; const flush=()=>{ if(c&&c.n>=3&&c.d>=0.3&&c.vMin>=15){ const T=(c.t1-c.t0)*3600, v=c.v/c.n;
    if(T>0&&v>=25/3.6&&c.pm>0){ const ke=0.5*m*(c.vb*c.vb-c.va*c.va)/T, y=c.pm/c.n-(m*g*c.gv/c.n+ke)/eta; X.push([v,c.a3/c.n,1]); Y.push(y); } } c=null; };
  for(let i=1;i<R.length;i++){ const p=R[i-1], r=R[i];
   const ok=r.st==="走行"&&p.st==="走行"&&Number.isFinite(r.pm)&&Number.isFinite(r.v)&&Number.isFinite(r.abs)&&!((r.brk||0)>1||(r.rgn||0)>1);
   if(!ok){ flush(); continue; }
   const v=r.v/3.6, va=Math.max(0,v+(Number.isFinite(r.head)?r.head:0)), gr=Number.isFinite(r.gr)? r.gr/100 : 0, rho=Number.isFinite(r.ta)? 1.225*288.15/(273.15+r.ta) : 1.17;
   if(!c) c={n:0,v:0,a3:0,gv:0,pm:0,d:0,t0:p.abs,va:p.v/3.6,vMin:99,k0:p.km};
   c.n++; c.v+=v; c.a3+=va*va*v*rho/1.17; c.gv+=gr*v; c.pm+=r.pm; c.t1=r.abs; c.vb=v; c.d=r.km-c.k0; c.vMin=Math.min(c.vMin,r.v);
   if(c.d>=3||(c.t1-c.t0)*60>=5) flush(); }
  flush();
  if(X.length<20) return run._cal={err:"走っている区間が足りません (速度・モーター電力の列が必要)"};
  // 正規方程式 (3×3) を解く
  const A=[[0,0,0],[0,0,0],[0,0,0]], B=[0,0,0];
  for(let i=0;i<X.length;i++) for(let j=0;j<3;j++){ B[j]+=X[i][j]*Y[i]; for(let k=0;k<3;k++) A[j][k]+=X[i][j]*X[i][k]; }
  const sol=(M,b)=>{ const a=M.map((r,i)=>[...r,b[i]]); for(let c=0;c<3;c++){ let p=c; for(let r=c+1;r<3;r++) if(Math.abs(a[r][c])>Math.abs(a[p][c])) p=r; [a[c],a[p]]=[a[p],a[c]]; if(Math.abs(a[c][c])<1e-12) return null;
    for(let r=0;r<3;r++) if(r!==c){ const f=a[r][c]/a[c][c]; for(let k=c;k<4;k++) a[r][k]-=f*a[c][k]; } } return a.map((r,i)=>r[3]/r[i]); };
  let k=sol(A,B), fixed=false;
  if(!k||!(k[0]>0&&k[1]>0)){   // 速度の幅が狭いと転がりと空気を分けられない → 転がり抵抗は今の設定に固定して、空気抵抗と一定の消費だけ推定
   const c0=P.Crr*m*g/eta, A2=[[0,0],[0,0]], B2=[0,0]; for(let i=0;i<X.length;i++){ const y=Y[i]-c0*X[i][0], x=[X[i][1],1]; for(let j=0;j<2;j++){ B2[j]+=x[j]*y; for(let l=0;l<2;l++) A2[j][l]+=x[j]*x[l]; } }
   const det=A2[0][0]*A2[1][1]-A2[0][1]*A2[1][0]; if(Math.abs(det)<1e-9) return run._cal={err:"推定できませんでした (速度の幅が狭すぎる)"};
   k=[c0,(B2[0]*A2[1][1]-A2[0][1]*B2[1])/det,(A2[0][0]*B2[1]-A2[1][0]*B2[0])/det]; fixed=true; }
  const mean=Y.reduce((s,y)=>s+y,0)/Y.length; let ssr=0, sst=0; for(let i=0;i<X.length;i++){ const f=k[0]*X[i][0]+k[1]*X[i][1]+k[2]; ssr+=(Y[i]-f)**2; sst+=(Y[i]-mean)**2; }
  const out={n:X.length,r2:sst>0?1-ssr/sst:NaN,Crr:k[0]*eta/(m*g),CdA:k[1]*eta*2/1.17,aux:k[2],fixed};
  // 発電の実効効率 (平らなパネル)
  let sP=0,sG=0; for(const r of R) if(Number.isFinite(r.ps)&&Number.isFinite(r.ghi)&&r.ghi>300&&r.st==="走行"){ sP+=r.ps; sG+=r.ghi*P.arrayArea; }
  out.effPV= sG>0? sP/sG : NaN; out.effModel=P.cellEff*P.mpptEff*0.92*PRO.solarScale;
  // 発電 (太陽の高さ別): 実際 ÷ モデル (今の設定・補正込み)。平置きで走っている行。10° ごと
  { const B=[]; for(const r of R){ if(r.st!=="走行"||!Number.isFinite(r.ps)||!Number.isFinite(r.dni)||!Number.isFinite(r.alt)||r.alt<=0.03) continue; const cz=Math.sin(r.alt), G=r.dni*cz*Phys.iam(cz)+r.dhi*0.95;
    const pm=P.arrayArea*P.cellEff*P.mpptEff*0.92*PRO.solarScale*G*PVLoss.k(r.alt,false); if(pm<20) continue; const b=Math.min(8,Math.floor(r.alt*180/Math.PI/10)), o=B[b]||(B[b]={a:0,m:0,n:0}); o.a+=r.ps; o.m+=pm; o.n++; }
   const ok=B.map((o,i)=>o&&o.n>=60? [i*10+5,o.a/o.m,o.n] : null).filter(Boolean);
   if(ok.length>=3){ const ref=ok[ok.length-1], at=(deg)=>{ if(deg<=ok[0][0]) return ok[0][1]; if(deg>=ref[0]) return ref[1]; for(let j=1;j<ok.length;j++) if(deg<=ok[j][0]){ const a=ok[j-1], b=ok[j], u=(deg-a[0])/(b[0]-a[0]); return a[1]+(b[1]-a[1])*u; } return ref[1]; };
    const cur=PVLoss.curve()||[1,1,1,1,1,1,1,1,1];
    out.pv={bins:ok.map(x=>[x[0],x[1]]),ref:ref[1],curve:cur.map((c,i)=>+clamp(c*at(i*10)/ref[1],0.2,1.2).toFixed(3))}; } }
  // 今の設定で同じ速度の並びを走った場合の消費と、実際の消費
  let eA=0,eM=0; for(let i=1;i<R.length;i++){ const p=R[i-1], r=R[i], d=r.abs-p.abs; if(!(d>0)||d>0.5||p.st!=="走行"||r.st!=="走行"||!Number.isFinite(r.pm)) continue;
   eA+=r.pm*d; eM+=Math.max(0,Strategy.drivePower(r.v/3.6,Number.isFinite(r.gr)?r.gr/100:0))*d; }
  out.eAct=eA; out.eModel=eM;
  // 電池の容量 (推定): 電池から出入りした電力量 ÷ 残量の変化 (残量を電圧から推定した計測器のログ。変化が 15 % 以上のとき)
  if(run.socEst){ let eB=0; for(let i=1;i<R.length;i++){ const d=(R[i].abs-R[i-1].abs); if(d>0&&d<0.1&&Number.isFinite(R[i].pm)&&Number.isFinite(R[i].ps)) eB+=(R[i].pm-R[i].ps)*d; }
   const dS=(R[0].soc-R[R.length-1].soc)/100; if(Math.abs(dS)>=0.15) out.capWh=eB/dS; }
  return run._cal=out;
 },
 calibUI(run){
  const C=run._cal, f=(x,d)=>Number.isFinite(x)?x.toFixed(d):"―";
  let h=`<div class="ph" style="margin-top:12px">${ic("sliders")}車両モデルの合わせ込み</div>`;
  if(!C) return h+`<div class="ana-note" style="margin-top:0">走行ログの速度・モーター電力・発電・日射から、転がり抵抗・空気抵抗 (CdA)・一定の消費・発電の効率を推定し、今の設定と比べます。実戦のログ (同じ列名の CSV) で使えます。</div><button class="btn ana-sm" onclick="Ana.runCalib()">${ic("play")}推定する</button>`;
  if(C.err) return h+`<div class="ana-note">${escHtml(C.err)}</div>`;
  const cur={Crr:P.Crr,CdA:P.Cd*P.frontal,aux:P.auxW+PRO.ctrlW}, pct=(a,b)=>Number.isFinite(a)&&b? `${a>b?"+":""}${((a/b-1)*100).toFixed(0)} %` : "―";
  h+=`<div class="ana-rvt" style="grid-template-columns:1.4fr 1fr 1fr 0.8fr"><span class="lb">項目</span><span class="lb">ログから</span><span class="lb">今の設定</span><span class="lb">差</span>
   <span>転がり抵抗 Crr</span><span>${C.fixed?"(固定)":f(C.Crr,4)}</span><span>${f(cur.Crr,4)}</span><span>${pct(C.Crr,cur.Crr)}</span>
   <span>空気抵抗 CdA m²</span><span>${f(C.CdA,3)}</span><span>${f(cur.CdA,3)}</span><span>${pct(C.CdA,cur.CdA)}</span>
   <span title="補機 + 制御装置などの、速度によらない消費">一定の消費 W</span><span>${f(C.aux,0)}</span><span>${f(cur.aux,0)}</span><span>${pct(C.aux,cur.aux)}</span>
   <span>発電の実効効率</span><span>${f(C.effPV*100,1)} %</span><span>${f(C.effModel*100,1)} %</span><span>${pct(C.effPV,C.effModel)}</span>
   ${Number.isFinite(C.capWh)&&C.capWh>0? `<span title="電池から出入りした電力量 ÷ 残量の変化 (残量は電圧から推定)">電池の容量 Wh</span><span>${f(C.capWh,0)}</span><span>${f(P.batteryWh,0)}</span><span>${pct(C.capWh,P.batteryWh)}</span>` : ""}
   <span>走行の消費 kWh</span><span>${f(C.eAct/1000,2)}</span><span>${f(C.eModel/1000,2)}</span><span>${pct(C.eAct,C.eModel)}</span></div>
   ${C.pv? `<div class="ana-note">発電 (実際 ÷ モデル、太陽の高さ別): ${C.pv.bins.map(b=>`${b[0]-5}〜${b[0]+5}°: ${(b[1]*100).toFixed(0)} %`).join("・")}。低い太陽で落ちるのは、パネルの曲面・影・浅い角度の反射など。</div>` : ""}
   <div class="ana-note">使った区間 (3 km / 5 分ごとの平均) ${C.n}・${C.fixed?"速度の幅が狭いので転がり抵抗は今の設定に固定・":""}当てはまり R² ${f(C.r2,2)}${C.r2<0.6?" (低い: 速度の幅が狭い・風や加速の影響が大きい)":""}。「今の設定」の消費 = この走行と同じ速度・勾配で今の設定のモデルを走らせた値。CdA は空気抵抗係数 × 前面投影面積、Crr は η=${this.ETA} と置いた推定。発電は温度・角度の影響を含んだ実効値。</div>
   <div class="ana-rr" style="margin-top:6px"><button class="btn ana-sm" onclick="Ana.applyCalib()" ${C.r2>=0.5?"":"disabled"} title="${C.r2>=0.5?"":"当てはまりが低い (R² 0.5 未満) ので反映できません"}">${ic("check")}推定値を設定に反映</button>
   ${Number.isFinite(C.effPV)&&C.effPV>0.05&&C.effPV<0.4? `<button class="btn ana-sm" onclick="Ana.applyPV()" title="セル効率だけを、ログの発電に合うように変える">${ic("sun")}発電の効率だけ反映</button>` : ""}
   ${C.pv? `<button class="btn ana-sm" onclick="Ana.applyPVAlt()" title="太陽の高さ別の効率と、セル効率を、ログの発電に合うように変える">${ic("sun")}発電を太陽の高さ別に反映</button>` : ""}
   ${(()=>{ const k=C.eAct/C.eModel; return Number.isFinite(k)&&k>0.7&&k<1.5&&Math.abs(k-1)>0.01? `<button class="btn ana-sm" onclick="Ana.useLossK(${k.toFixed(3)})" title="走行の消費のモデルを ×${k.toFixed(2)} する (戦略の速度・電池の減り・電流の指示のすべてに効く)">${ic("zap")}消費をモデルに反映 (×${k.toFixed(2)})</button>` : ""; })()}
   ${(()=>{ const k=C.eAct/C.eModel; return Number.isFinite(k)&&k>0.6&&k<1.6? `<button class="btn ana-sm" onclick="Ana.useOrdersK(${k.toFixed(3)})" title="車両の設定は変えず、無線の電流の指示だけを ×${k.toFixed(2)} する">${ic("zap")}電流の指示に使う (×${k.toFixed(2)})</button>` : ""; })()}</div>
   <div class="ana-note">走行の消費の補正: ${Math.abs(LossK.k()-1)<0.001? "なし" : `×${LossK.k().toFixed(2)}${Math.abs((P.lossK||1)-1)>0.001? ` <a href="#" onclick="P.lossK=1;Settings.save();Ana.run()._cal=null;Strategy.last=null;Ana.renderPane();return false" style="color:var(--acc)">外す</a>` : " (車両の諸元)"}`}。発電の太陽の高さ別の補正: ${PVLoss.curve()? (P.pvAltS? `あり <a href="#" onclick="P.pvAltS='';Settings.save();Ana.run()._cal=null;Strategy.last=null;Ana.renderPane();return false" style="color:var(--acc)">外す</a>` : "あり (車両の諸元)") : "なし"}。</div>
   <div class="ana-note">電流の指示の補正: ${Math.abs((P.ordersK||1)-1)<0.001? "なし" : `×${(+P.ordersK).toFixed(2)} <a href="#" onclick="Ana.useOrdersK(1);return false" style="color:var(--acc)">外す</a>`}。「推定値を設定に反映」をした後は、補正は外してください (二重にかかります)。</div>`;
  return h;
 },
 runCalib(){ const run=this.run(); if(!run) return; try{ this.calib(run); }catch(e){ run._cal={err:"推定できませんでした: "+e.message}; } this.renderPane(); },
 applyPVAlt(){ const C=this.run()&&this.run()._cal; if(!C||!C.pv) return; const sl=SLIDERS.find(x=>x.id==="cellEff"), e=clamp(P.cellEff*C.pv.ref,sl.min,sl.max);
  if(!confirm(`発電を太陽の高さ別に合わせます (この端末に保存)。\nセル効率 ${(P.cellEff*100).toFixed(1)} % → ${(e*100).toFixed(1)} %\n太陽の高さ別 (0°〜80°): ${C.pv.curve.map(x=>(x*100).toFixed(0)).join(" / ")} %`)) return;
  P.cellEff=e; P.pvAltS=JSON.stringify(C.pv.curve); const el=document.getElementById("sl-cellEff"); if(el) el.value=P.cellEff; refreshSliderLabel("cellEff"); refreshDerived(); Settings.save(); this.run()._cal=null; Strategy.last=null; toast("発電を太陽の高さ別に反映しました","#34d399"); this.renderPane(); },
 applyPV(){ const C=this.run()&&this.run()._cal; if(!C||!Number.isFinite(C.effPV)) return; const e=C.effPV/(P.mpptEff*0.92*PRO.solarScale), sl=SLIDERS.find(x=>x.id==="cellEff");
  if(!sl||!confirm(`セル効率を ${(P.cellEff*100).toFixed(1)} % → ${(clamp(e,sl.min,sl.max)*100).toFixed(1)} % にします (この端末に保存)`)) return;
  P.cellEff=clamp(e,sl.min,sl.max); const el=document.getElementById("sl-cellEff"); if(el) el.value=P.cellEff; refreshSliderLabel("cellEff"); refreshDerived(); Settings.save(); this.run()._cal=null; Strategy.last=null; toast("発電の効率を反映しました","#34d399"); this.renderPane(); },
 applyCalib(){ const C=this.run()&&this.run()._cal; if(!C||C.err) return;
  if(!confirm(`推定値を車両の設定に反映します (この端末に保存)。\nCrr ${C.Crr.toFixed(4)}・Cd ${(C.CdA/P.frontal).toFixed(3)} (CdA ${C.CdA.toFixed(3)} ÷ 前面投影 ${P.frontal})・補機 ${(C.aux-PRO.ctrlW).toFixed(0)} W${Number.isFinite(C.effPV)?`・セル効率 ${(C.effPV/(P.mpptEff*0.92*PRO.solarScale)*100).toFixed(1)} %`:""}`)) return;
  const set=(id,v)=>{ const s=SLIDERS.find(x=>x.id===id); if(!s||!Number.isFinite(v)) return; P[id]=clamp(v,s.min,s.max); const el=document.getElementById("sl-"+id); if(el) el.value=P[id]; refreshSliderLabel(id); };
  set("Crr",C.Crr); set("Cd",C.CdA/P.frontal); set("auxW",C.aux-PRO.ctrlW); if(Number.isFinite(C.effPV)) set("cellEff",C.effPV/(P.mpptEff*0.92*PRO.solarScale));
  refreshDerived(); Settings.save(); this.run()._cal=null; Strategy.last=null; toast("車両の設定に反映しました","#34d399"); this.renderPane(); },
 useLossK(k){ P.lossK=+clamp((Number.isFinite(P.lossK)?P.lossK:1)*k,0.7,1.5).toFixed(3); if(Math.abs((P.ordersK||1)-1)>0.001) P.ordersK=1; Settings.save(); this.run()._cal=null; Strategy.last=null;
  toast(`走行の消費のモデルを ×${P.lossK.toFixed(2)} にしました (電流の指示の補正は外しました)`,"#34d399"); this.renderPane(); },
 useOrdersK(k){ P.ordersK=clamp(+k||1,0.5,2); Settings.save(); toast(Math.abs(P.ordersK-1)<0.001? "電流の指示の補正を外しました" : `電流の指示を ×${P.ordersK.toFixed(2)} で出します`,"#34d399"); this.renderPane(); },
 runReview(){ const run=this.run(); if(!run) return; toast("計算中…","#22d3ee"); setTimeout(()=>{ try{ this.review(run); }catch(e){ run._rev={err:"計算できませんでした: "+e.message}; } this.renderPane(); this.drawCharts(); },30); },
 /* ---------- 立体地図 ---------- */
 renderMap(){
  if(!this.map) this.map=this.makeMap();
  const host= this.layout==="A"? document.getElementById("ana-map") : null;
  if(host&&this.map.r.domElement.parentNode!==host) host.insertBefore(this.map.r.domElement,host.firstChild);
  if(this.map.dirty){ this.map.rebuild(); this.map.dirty=false; }
  this.map.resize(); this.map.draw(); this.legend();
 },
 color(m,v){
  if(m.cat){ const ds=this.run().drivers, i=Math.max(0,ds.indexOf(v)), P=[[0.95,0.42,0.11],[0.24,0.55,0.95],[0.36,0.72,0.36],[0.89,0.70,0.12]]; return P[i%P.length]; }
  if(!Number.isFinite(v)) return [0.3,0.3,0.3];
  const t=clamp((v-m.lo)/(m.hi-m.lo),0,1);
  const st= m.div? [[0.82,0.23,0.18],[0.89,0.70,0.12],[0.55,0.56,0.59],[0.36,0.72,0.36],[0.17,0.55,0.69]] : [[0.17,0.42,0.69],[0.22,0.63,0.41],[0.89,0.70,0.12],[0.95,0.42,0.11],[0.82,0.23,0.18]];
  const f=t*4, i=Math.min(3,Math.floor(f)), u=f-i; return [0,1,2].map(k=>st[i][k]+(st[i+1][k]-st[i][k])*u);
 },
 legend(){
  const m=this.METRICS[this.metric], el=document.getElementById("ana-leg");
  if(m.cat){ el.innerHTML=`<div class="lb">${m.label}</div>`+this.run().drivers.map(d=>{ const c=this.color(m,d).map(x=>Math.round(x*255)); return `<div style="display:flex;gap:6px;align-items:center;font-size:12px"><i style="width:10px;height:10px;background:rgb(${c})"></i>${escHtml(d)}</div>`; }).join(""); return; }
  const g=[0,0.25,0.5,0.75,1].map(t=>{ const c=this.color(m,m.lo+t*(m.hi-m.lo)).map(x=>Math.round(x*255)); return `rgb(${c}) ${t*100}%`; }).join(",");
  el.innerHTML=`<div class="lb">${m.label}${this.mapMode==="band"?" (帯の高さ・色)":" (色) ・ 高さ = 標高"}</div><div class="bar" style="background:linear-gradient(90deg,${g})"></div>
   <div class="num" style="display:flex;justify-content:space-between;font-size:11px"><span>${m.lo}</span><span>${(m.lo+m.hi)/2}</span><span>${m.hi} ${m.unit}</span></div>`;
 },
 makeMap(){
  const self=this, r=new THREE.WebGLRenderer({antialias:true}); r.setPixelRatio(Math.min(devicePixelRatio,2));
  const sc=new THREE.Scene(); sc.background=new THREE.Color(0x0d0e10);
  const C=Math.cos(25*Math.PI/180), X=(lon)=>(lon-134)*C*11.1, Z=(lat)=>-(lat+23)*11.1;
  for(const ring of AUS_RINGS){ const sh=new THREE.Shape(); for(let i=0;i<ring.length;i+=2){ const x=X(ring[i]), z=Z(ring[i+1]); i?sh.lineTo(x,-z):sh.moveTo(x,-z); }
   const g=new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI/2); sc.add(new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:0x1c1f23})));
   const pts=[]; for(let i=0;i<ring.length;i+=2) pts.push(new THREE.Vector3(X(ring[i]),0.05,Z(ring[i+1]))); sc.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x4a4f56}))); }
  const grid=new THREE.GridHelper(800,40,0x1f2226,0x1f2226); grid.position.y=-0.05; sc.add(grid);
  const P=[]; for(let k=0;k<=Math.ceil(TOTAL_KM);k++){ const q=profileAt(Math.min(k,TOTAL_KM)); P.push([X(q.lon),Z(q.lat)]); }
  for(const c of RP_CS){ const q=profileAt(c.km), m=new THREE.Mesh(new THREE.BoxGeometry(1.4,1.4,1.4),new THREE.MeshBasicMaterial({color:0xf26b1d})); m.position.set(X(q.lon),0.7,Z(q.lat)); sc.add(m); }
  const grp=new THREE.Group(); sc.add(grp);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.22,1,8),new THREE.MeshBasicMaterial({color:0xffffff})); pole.visible=false; sc.add(pole);
  const cam=new THREE.PerspectiveCamera(38,1,1,4000), view={th:0.42,ph:0.98,d:330,tx:X(134.6),tz:Z(-24.6)};
  const M={r,sc,cam,grp,pole,dirty:true,P,X,Z,w:1,h:1,
   H(b){ if(!b) return 0; if(self.mapMode==="elev") return 1+b.el*0.035; const m=self.METRICS[self.metric]; if(m.cat) return 8; const v=m.f(b); return Number.isFinite(v)? 1+clamp((v-m.lo)/(m.hi-m.lo),0,1)*30 : 0; },
   rebuild(){
    while(grp.children.length){ const o=grp.children.pop(); o.geometry.dispose(); o.material.dispose(); }
    const run=self.run(); if(!run) return; const m=self.METRICS[self.metric], pos=[], col=[], top=[], fpos=[], fcol=[];
    const sel=self.sel;
    for(let k=1;k<run.bins.length&&k<P.length;k++){ const a=run.bins[k-1], b=run.bins[k]; if(!a||!b) continue;
     const [ax,az]=P[k-1], [bx,bz]=P[k], ha=this.H(a), hb=this.H(b), ca=self.color(m,m.f(a)), cb=self.color(m,m.f(b)), dim=sel&&(k<sel[0]||k>sel[1])?0.35:1;
     pos.push(ax,0.1,az, bx,0.1,bz, bx,hb,bz,  ax,0.1,az, bx,hb,bz, ax,ha,az);
     for(const c of [ca,cb,cb,ca,cb,ca]) col.push(c[0]*dim,c[1]*dim,c[2]*dim);
     // 地面にも同じ色の帯 (帯を真横から見て細く見える向きでも色が分かるように)
     const dx=bx-ax, dz=bz-az, L=Math.hypot(dx,dz)||1, nx=-dz/L*0.9, nz=dx/L*0.9;
     fpos.push(ax-nx,0.08,az-nz, bx-nx,0.08,bz-nz, bx+nx,0.08,bz+nz,  ax-nx,0.08,az-nz, bx+nx,0.08,bz+nz, ax+nx,0.08,az+nz);
     for(const c of [ca,cb,cb,ca,cb,ca]) fcol.push(c[0]*dim,c[1]*dim,c[2]*dim);
     top.push(new THREE.Vector3(ax,ha+0.05,az)); }
    const fg=new THREE.BufferGeometry(); fg.setAttribute("position",new THREE.Float32BufferAttribute(fpos,3)); fg.setAttribute("color",new THREE.Float32BufferAttribute(fcol,3));
    grp.add(new THREE.Mesh(fg,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide})));
    const g=new THREE.BufferGeometry(); g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3)); g.setAttribute("color",new THREE.Float32BufferAttribute(col,3));
    grp.add(new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,transparent:true,opacity:0.92})));
    if(top.length>1) grp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(top),new THREE.LineBasicMaterial({color:0xe6e6e3,transparent:true,opacity:0.45})));
   },
   resize(){ const p=r.domElement.parentNode; if(!p) return; const w=Math.max(10,p.clientWidth), h=Math.max(10,p.clientHeight); if(w!==this.w||h!==this.h){ this.w=w; this.h=h; r.setSize(w,h); cam.aspect=w/h; cam.updateProjectionMatrix(); } },
   draw(){
    cam.position.set(view.tx+view.d*Math.sin(view.ph)*Math.sin(view.th),view.d*Math.cos(view.ph),view.tz+view.d*Math.sin(view.ph)*Math.cos(view.th));
    cam.lookAt(view.tx,0,view.tz);
    const run=self.run(), k=self.cursor;
    if(run&&k!=null){ const i=clamp(Math.round(k),0,P.length-1), b=run.bins[clamp(Math.floor(k),0,run.bins.length-1)], h=Math.max(this.H(b),2)+12;
     pole.visible=true; pole.scale.y=h; pole.position.set(P[i][0],h/2,P[i][1]); } else pole.visible=false;
    r.render(sc,cam); self.placeTag(); this.compass();
   },
   screen(k){ const i=clamp(Math.round(k),0,P.length-1), b=self.run()&&self.run().bins[clamp(Math.floor(k),0,P.length-1)]; const v=new THREE.Vector3(P[i][0],Math.max(this.H(b),2)+12,P[i][1]).project(cam); return {x:(v.x+1)/2*this.w,y:(1-v.y)/2*this.h,z:v.z}; },
   pick(x,y){ let best=null,bd=28*28; const v=new THREE.Vector3();
    for(let k=0;k<P.length;k+=2){ v.set(P[k][0],0,P[k][1]).project(cam); if(v.z>1) continue; const sx=(v.x+1)/2*this.w-x, sy=(1-v.y)/2*this.h-y, d=sx*sx+sy*sy; if(d<bd){ bd=d; best=k; } } return best; },
   view};
  // 操作: ドラッグで回転・右ドラッグ / Shift で移動・ホイール / ピンチで拡大・クリックで地点
  const el=r.domElement, pts=new Map(); let moved=false, pinch=0;
  el.style.touchAction="none";
  el.addEventListener("pointerdown",e=>{ el.setPointerCapture(e.pointerId); pts.set(e.pointerId,{x:e.clientX,y:e.clientY,b:e.button,sh:e.shiftKey}); moved=false; });
  el.addEventListener("pointermove",e=>{ const p=pts.get(e.pointerId);
   if(!p){ const rc=el.getBoundingClientRect(), k=M.pick(e.clientX-rc.left,e.clientY-rc.top); if(k!=null&&!self.lock){ self.setCursor(k,true); } return; }
   const dx=e.clientX-p.x, dy=e.clientY-p.y; if(Math.abs(dx)+Math.abs(dy)>3) moved=true;
   if(pts.size===2){ const [a,b]=[...pts.values()], d0=Math.hypot(a.x-b.x,a.y-b.y); p.x=e.clientX; p.y=e.clientY; const [a2,b2]=[...pts.values()], d1=Math.hypot(a2.x-b2.x,a2.y-b2.y); if(d0>0) view.d=clamp(view.d*d0/d1,40,1500); M.draw(); return; }
   if(p.b===2||p.sh){ const s=view.d/600; view.tx-=(dx*Math.cos(view.th)+dy*Math.sin(view.th))*s; view.tz-=(-dx*Math.sin(view.th)+dy*Math.cos(view.th))*s; }
   else { view.th-=dx*0.006; view.ph=clamp(view.ph-dy*0.004,0.15,1.45); }
   p.x=e.clientX; p.y=e.clientY; M.draw(); });
  const up=e=>{ const p=pts.get(e.pointerId); pts.delete(e.pointerId); if(p&&!moved){ const rc=el.getBoundingClientRect(), k=M.pick(e.clientX-rc.left,e.clientY-rc.top); if(k!=null&&self.pickSel){ self.mapPick(k); return; }
   if(k!=null){ self.lock=true; self.setCursor(k,true); } else { self.lock=false; } } };
  el.addEventListener("pointerup",up); el.addEventListener("pointercancel",e=>pts.delete(e.pointerId));
  el.addEventListener("contextmenu",e=>e.preventDefault());
  el.addEventListener("wheel",e=>{ e.preventDefault(); view.d=clamp(view.d*Math.exp(e.deltaY*0.001),40,1500); M.draw(); },{passive:false});
  const V0={...view};
  Object.assign(M,{
   rot(d){ view.th+=d*Math.PI/8; M.draw(); },
   tilt(d){ view.ph=clamp(view.ph+d*0.15,0.02,1.45); M.draw(); },
   north(){ view.th=0; M.draw(); },
   top(){ view.ph=0.02; M.draw(); },
   reset(){ Object.assign(view,V0); M.draw(); },
   fit(){ const run=self.run(); if(!run) return; const [a,b]=self.sel||[0,run.kmMax]; let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
    for(let k=Math.max(0,Math.floor(a));k<=Math.min(P.length-1,Math.ceil(b));k++){ const [x,z]=P[k]; x0=Math.min(x0,x); x1=Math.max(x1,x); z0=Math.min(z0,z); z1=Math.max(z1,z); }
    view.tx=(x0+x1)/2; view.tz=(z0+z1)/2; view.d=clamp(Math.hypot(x1-x0,z1-z0)*1.6+40,40,1500); M.draw();
    if(self.sel){ const m=(b-a)*0.05; self.xr=[Math.max(0,a-m),Math.min(run.kmMax,b+m)]; self.drawCharts(); } },
   compass(){ const el=document.getElementById("ana-compass"); if(!el) return; const a=new THREE.Vector3(view.tx,0,view.tz).project(cam), b=new THREE.Vector3(view.tx,0,view.tz-20).project(cam);
    const ang=Math.atan2((b.x-a.x)*this.w,(b.y-a.y)*this.h); el.style.transform=`rotate(${ang}rad)`; }});
  return M;
 },
 setCursor(k,fromMap){ this.cursor=k; if(this.map) this.map.draw(); this.drawCursor(); },
 placeTag(){
  const tag=document.getElementById("ana-tag"), run=this.run(), k=this.cursor;
  if(!tag) return; if(!run||k==null||!this.map||this.layout!=="A"||this.play.on){ tag.style.display="none"; return; }   // 再生中は上の欄に出す
  const r=this.rowAt(run,k), p=this.map.screen(k); if(!r||p.z>1){ tag.style.display="none"; return; }
  const day=Math.floor((r.abs||8)/24)+1, h=((r.abs||8)%24);
  tag.style.display="block"; tag.style.left=Math.min(this.map.w-260,p.x+10)+"px"; tag.style.top=Math.max(4,p.y-18)+"px";
  tag.innerHTML=`<b>${r.km.toFixed(1)} km</b> ・ D${day} ${String(Math.floor(h)).padStart(2,"0")}:${String(Math.floor(h%1*60)).padStart(2,"0")} ・ ${escHtml(r.drv)}<br>${r.v.toFixed(0)} km/h ・ SOC ${r.soc.toFixed(1)} % ・ ${r.net>0?"+":""}${(r.net||0).toFixed(0)} W ・ 勾配 ${(r.gr||0).toFixed(1)} %`;
 },
 rowAt(run,k){ const R=run.rows; let lo=0,hi=R.length-1; while(lo<hi){ const m=(lo+hi)>>1; if(R[m].km<k) lo=m+1; else hi=m; } return R[lo]; },
 /* ---------- 距離軸のグラフ ---------- */
 ROWS:{
  A:[{n:"速度 km/h",lo:20,hi:135,s:[{k:"lim",c:"#3a3e44",dash:1},{k:"v",c:"#f26b1d",w:1.4}]},{n:"SOC %",lo:0,hi:100,s:[{k:"soc",c:"#e6e6e3",w:1.5}]},{n:"収支 W",lo:-1000,hi:1000,s:[{k:"net",c:"#5cb85c"}],zero:1}],
  B:[{n:"標高 m",lo:0,hi:800,s:[{k:"el",c:"#5cb85c"}]},{n:"速度 km/h",lo:20,hi:135,s:[{k:"lim",c:"#3a3e44",dash:1},{k:"v",c:"#f26b1d",w:1.4}]},{n:"SOC %",lo:0,hi:100,s:[{k:"soc",c:"#e6e6e3",w:1.5}]},
   {n:"電力 W (発電 / モーター)",lo:0,hi:2000,s:[{k:"ps",c:"#e2b21f"},{k:"pm",c:"#d23a2e"}]},{n:"日射 W/m²",lo:0,hi:1100,s:[{k:"ghi",c:"#c9ccd0"}]}]},
 initCharts(){
  const cv=document.getElementById("ana-cv2"); let drag=null;
  const km=(x)=>{ const L=60, W=cv.clientWidth-L-20; return this.xr[0]+(x-L)/W*(this.xr[1]-this.xr[0]); };
  cv.addEventListener("pointerdown",e=>{ cv.setPointerCapture(e.pointerId); drag={x:e.offsetX,k:km(e.offsetX)}; });
  cv.addEventListener("pointermove",e=>{ const k=clamp(km(e.offsetX),0,this.run()?this.run().kmMax:0);
   if(drag&&Math.abs(e.offsetX-drag.x)>4){ this.sel=[Math.min(drag.k,k),Math.max(drag.k,k)]; this.drawCursor(); }
   this.lock=false; this.setCursor(k); });
  cv.addEventListener("pointerup",()=>{ if(drag&&this.sel){ this.map&&(this.map.dirty=true); this.renderMap(); this.renderPane(); this.drawCharts(); } drag=null; });
  cv.addEventListener("dblclick",()=>{ this.sel=null; this.map&&(this.map.dirty=true); this.render(); });
  cv.addEventListener("wheel",e=>{ e.preventDefault(); const run=this.run(); if(!run) return; const k=km(e.offsetX), f=Math.exp(e.deltaY*0.0015), a=this.xr[0], b=this.xr[1];
   let na=k-(k-a)*f, nb=k+(b-k)*f; if(nb-na<2){ const c=(na+nb)/2; na=c-1; nb=c+1; } this.xr=[Math.max(0,na),Math.min(run.kmMax,nb)]; this.zoomDay=null; this.drawCharts(); },{passive:false});
 },
 drawCharts(){
  const run=this.run(), cmp=this.cmpRun(), host=this.layout==="A"? document.getElementById("ana-charts") : document.getElementById("ana-map");
  const cv=document.getElementById("ana-cv"), cv2=document.getElementById("ana-cv2"), days=document.getElementById("ana-days"), nav=document.getElementById("ana-nav");
  if(cv.parentNode!==host){ host.appendChild(days); host.appendChild(cv); host.appendChild(cv2); host.appendChild(nav); }
  const TOP=this.TOP, NAV=this.NAV, dpr=Math.min(devicePixelRatio,2), W=host.clientWidth, H=Math.max(60,host.clientHeight-TOP-NAV);
  for(const c of [cv,cv2]){ c.width=W*dpr; c.height=H*dpr; c.style.width=W+"px"; c.style.height=H+"px"; c.style.top=TOP+"px"; }
  this.drawDays(run);
  const c=cv.getContext("2d"); c.setTransform(dpr,0,0,dpr,0,0); c.clearRect(0,0,W,H);
  const rows=this.ROWS[this.layout], L=60, PW=W-L-20, rh=(H-28)/rows.length, [x0,x1]=this.xr, X=(k)=>L+(k-x0)/(x1-x0)*PW;
  this.cg={L,PW,rh,rows:rows.length,X,H};
  c.font="500 11px 'Chakra Petch','BIZ UDPGothic',sans-serif";
  if(this.sel){ c.fillStyle="rgba(242,107,29,.12)"; c.fillRect(X(this.sel[0]),0,X(this.sel[1])-X(this.sel[0]),H-28); }
  rows.forEach((row,ri)=>{ const y0=ri*rh, Y=(v)=>y0+rh-6-(v-row.lo)/(row.hi-row.lo)*(rh-18);
   c.fillStyle="#8b9097"; c.fillText(row.n,8,y0+14); c.strokeStyle="#1f2226"; c.beginPath(); c.moveTo(L,y0+rh-0.5); c.lineTo(W-20,y0+rh-0.5); c.stroke();
   if(row.zero){ c.strokeStyle="#2a2d32"; c.beginPath(); c.moveTo(L,Y(0)); c.lineTo(W-20,Y(0)); c.stroke(); }
   const line=(R,k,col,w,dash)=>{ c.strokeStyle=col; c.lineWidth=w||1; c.setLineDash(dash?[3,3]:[]); c.beginPath(); let started=false, lastX=-1, mn=0, mx=0, has=false;
    const flush=()=>{ if(!has) return; if(!started){ c.moveTo(lastX,Y(mn)); started=true; } c.lineTo(lastX,Y(mn)); if(mx!==mn) c.lineTo(lastX,Y(mx)); };
    for(const r of R){ if(r.km<x0-1||r.km>x1+1) continue; const v=r[k]; if(!Number.isFinite(v)) continue; const px=Math.round(X(r.km));
     if(px!==lastX){ flush(); lastX=px; mn=mx=clamp(v,row.lo-1e9,row.hi+1e9); has=true; } else { mn=Math.min(mn,v); mx=Math.max(mx,v); } }
    flush(); c.stroke(); c.setLineDash([]); };
   if(cmp) for(const s of row.s) if(!s.dash) line(cmp.rows,s.k,"#6b7077",1);
   for(const s of row.s) line(run.rows,s.k,s.c,s.w,s.dash);
   if(run._rev&&run._rev.pts) for(const s of row.s) if(s.k==="v"||s.k==="soc") line(run._rev.pts,s.k,"#22d3ee",1.2,true);   // 答え合わせ: 推奨速度で走った場合
   c.save(); c.beginPath(); c.rect(L,y0,PW,rh); c.restore(); });
  c.fillStyle="#8b9097"; const span=x1-x0, step=[1,2,5,10,20,50,100,200,500].find(s=>span/s<=10)||500;
  for(let k=Math.ceil(x0/step)*step;k<=x1;k+=step) c.fillText(k+" km",X(k)-12,H-10);
  for(const q of RP_CS) if(q.km>=x0&&q.km<=x1){ c.fillStyle="#f26b1d"; c.fillRect(X(q.km)-3,H-26,6,6); }
  this.drawCursor(); this.drawNav(W,dpr);
 },
 TOP:30, NAV:46,
 /* 日付のボタン: 押すとその日の区間だけをグラフに広げる */
 drawDays(run){ const el=document.getElementById("ana-days"), key=run.id+"|"+this.zoomDay+"|"+run.days.length;
  if(el._k===key) return; el._k=key;
  el.innerHTML=`<span class="lb">日付</span><button data-d="all" class="${this.zoomDay==null?"on":""}">全体</button>`+run.days.map(o=>`<button data-d="${o.d}" class="${this.zoomDay===o.d?"on":""}">Day${o.d}</button>`).join(""); },
 zoomTo(d){ const run=this.run(); if(!run) return;
  if(d==="all"){ this.xr=[0,Math.max(10,run.kmMax)]; this.zoomDay=null; }
  else { const o=run.days.find(x=>x.d===+d); if(!o) return; const pad=Math.max(1,(o.b-o.a)*0.02); this.xr=[Math.max(0,o.a-pad),Math.min(run.kmMax,o.b+pad)]; if(this.xr[1]-this.xr[0]<2) this.xr[1]=this.xr[0]+2; this.zoomDay=o.d; }
  this.drawCharts(); },
 /* 下のスライダー: 全行程の縮図 (速度) に、グラフに出している範囲の枠。枠をつかんで移動・端をつかんで伸縮・外を押すとそこへ移動 */
 navX(){ const nav=document.getElementById("ana-nav"), run=this.run(), L=60, PW=Math.max(10,nav.clientWidth-L-20), K=Math.max(10,run?run.kmMax:10); return {L,PW,K,X:k=>L+k/K*PW,km:x=>(x-L)/PW*K}; },
 drawNav(W,dpr){
  const nav=document.getElementById("ana-nav"), run=this.run(), NH=this.NAV; if(!run) return;
  nav.width=W*dpr; nav.height=NH*dpr; nav.style.width=W+"px"; nav.style.height=NH+"px";
  const c=nav.getContext("2d"); c.setTransform(dpr,0,0,dpr,0,0); c.clearRect(0,0,W,NH);
  const {L,PW,X}=this.navX(), y0=6, h=NH-14;
  // 縮図 (速度) は走行と幅が変わったときだけ作り直す
  const key=run.id+"|"+W+"|"+dpr;
  if(!this._navBg||this._navBg.key!==key){ const b=document.createElement("canvas"); b.width=W*dpr; b.height=NH*dpr; const g=b.getContext("2d"); g.setTransform(dpr,0,0,dpr,0,0);
   g.fillStyle="#16181b"; g.fillRect(L,y0,PW,h); g.strokeStyle="#5a5f66"; g.lineWidth=1; g.beginPath(); let lx=-1, mn=0, mx=0, st=false;
   const Y=v=>y0+h-clamp((v-20)/(135-20),0,1)*h;
   for(const r of run.rows){ if(!Number.isFinite(r.v)) continue; const px=Math.round(X(r.km)); if(px!==lx){ if(lx>=0){ if(!st){ g.moveTo(lx,Y(mn)); st=true; } g.lineTo(lx,Y(mn)); g.lineTo(lx,Y(mx)); } lx=px; mn=mx=r.v; } else { mn=Math.min(mn,r.v); mx=Math.max(mx,r.v); } }
   g.stroke(); g.font="500 10px 'Chakra Petch',sans-serif"; g.fillStyle="#8b9097";
   for(const o of run.days){ const x=X(o.a); g.strokeStyle="#2f3338"; g.beginPath(); g.moveTo(x+.5,y0); g.lineTo(x+.5,y0+h); g.stroke(); g.fillText("D"+o.d,x+3,y0+10); }
   this._navBg={key,cv:b}; }
  c.drawImage(this._navBg.cv,0,0,W,NH);
  const a=X(this.xr[0]), b=X(this.xr[1]);
  c.fillStyle="rgba(0,0,0,.45)"; c.fillRect(L,y0,a-L,h); c.fillRect(b,y0,L+PW-b,h);
  c.fillStyle="rgba(242,107,29,.12)"; c.fillRect(a,y0,b-a,h); c.strokeStyle="#f26b1d"; c.lineWidth=1.5; c.strokeRect(a+.5,y0+.5,Math.max(1,b-a-1),h-1);
  c.fillStyle="#f26b1d"; for(const x of [a,b]) c.fillRect(x-3,y0+h/2-9,6,18);
  c.fillStyle="#8b9097"; c.font="500 10px 'Chakra Petch',sans-serif"; c.fillText("範囲",8,y0+h/2+4);
 },
 initNav(){
  const nav=document.getElementById("ana-nav"); let drag=null, raf=0;
  const redraw=()=>{ if(!raf) raf=requestAnimationFrame(()=>{ raf=0; this.drawCharts(); }); };
  nav.addEventListener("pointerdown",e=>{ const run=this.run(); if(!run||!this.xr) return; nav.setPointerCapture(e.pointerId); e.preventDefault();
   const N=this.navX(), x=e.offsetX, a=N.X(this.xr[0]), b=N.X(this.xr[1]), grab=e.pointerType==="touch"?16:8;
   if(Math.abs(x-a)<=grab&&Math.abs(x-a)<=Math.abs(x-b)) drag={m:"a"}; else if(Math.abs(x-b)<=grab) drag={m:"b"};
   else if(x>a&&x<b) drag={m:"pan",off:N.km(x)-this.xr[0]};
   else { const w=this.xr[1]-this.xr[0]; drag={m:"pan",off:w/2}; this.moveNav(N.km(x),drag); redraw(); }
   this.zoomDay=null; });
  nav.addEventListener("pointermove",e=>{ if(!drag) { const N=this.navX(); if(!this.xr) return; const x=e.offsetX, a=N.X(this.xr[0]), b=N.X(this.xr[1]); nav.style.cursor= Math.abs(x-a)<=8||Math.abs(x-b)<=8? "ew-resize" : x>a&&x<b? "grab" : "pointer"; return; }
   this.moveNav(this.navX().km(e.offsetX),drag); redraw(); });
  const end=()=>{ drag=null; }; nav.addEventListener("pointerup",end); nav.addEventListener("pointercancel",end);
 },
 moveNav(k,drag){ const run=this.run(), K=Math.max(10,run.kmMax), MIN=2; let [a,b]=this.xr;
  if(drag.m==="a") a=clamp(k,0,b-MIN); else if(drag.m==="b") b=clamp(k,a+MIN,K);
  else { const w=b-a; a=clamp(k-drag.off,0,K-w); b=a+w; }
  this.xr=[a,b]; },
 drawCursor(){
  const cv=document.getElementById("ana-cv2"), g=this.cg; if(!g) return; const c=cv.getContext("2d"), dpr=cv.width/cv.clientWidth||1; c.setTransform(dpr,0,0,dpr,0,0); c.clearRect(0,0,cv.clientWidth,cv.clientHeight);
  if(this.sel){ c.strokeStyle="#f26b1d"; c.lineWidth=1; for(const k of this.sel){ c.beginPath(); c.moveTo(g.X(k),0); c.lineTo(g.X(k),g.H-28); c.stroke(); } }
  const k=this.cursor, run=this.run(); if(k==null||!run) return; const x=g.X(k); if(x<g.L||x>g.L+g.PW) return;
  c.strokeStyle="#fff"; c.beginPath(); c.moveTo(x,0); c.lineTo(x,g.H-28); c.stroke();
  const r=this.rowAt(run,k); if(!r) return;
  const txt=`${r.km.toFixed(1)} km ・ ${r.v.toFixed(0)} km/h ・ SOC ${r.soc.toFixed(1)} % ・ ${r.net>0?"+":""}${(r.net||0).toFixed(0)} W ・ ${r.drv}`;
  c.font="700 11px 'Chakra Petch','BIZ UDPGothic',sans-serif"; const w=c.measureText(txt).width+12, bx=Math.min(x+8,g.L+g.PW-w);
  c.fillStyle="rgba(21,23,26,.92)"; c.fillRect(bx,4,w,20); c.strokeStyle="#f26b1d"; c.strokeRect(bx+0.5,4.5,w-1,19); c.fillStyle="#e6e6e3"; c.fillText(txt,bx+6,18);
 },
};
