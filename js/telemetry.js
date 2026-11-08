"use strict";
/* ============ リアルタイム テレメトリ ============
 走っている PC (ドライバー側) から、別の端末 (スマホ・タブレット・別の PC) の「Realtime Run Analysis」へ、走行データを送る。
 つなぎ方: 別の端末 = ドライバー側の「テレメトリ」で QR を出す → 監視側で読み取ると監視画面が開いて、自動でつながる。
  同じ PC の別の画面 = 「この PC の別ウィンドウで開く」。ブラウザの中だけでやり取りする (BroadcastChannel。外部とは通信しない)。
 通信: WebRTC で端末どうしを直接つなぐ。つなぐときの相手探しだけ PeerJS の無料サーバー (0.peerjs.com) を使う。
  走行データはそのサーバーを通らない。QR に入れた合言葉 (#k=) が合わない相手からのデータは受け付けない。
 ドライバー → 監視: 1 秒ごとの値 (位置・速度・電池・電力・指示)、30 秒ごとの予報と戦略、無線の文、つないだときにそれまでの軌跡。
 監視 → ドライバー: 指示の出し方 (自動 / 入力して送る / 声で伝える)、入力した指示 (時速・電流) */
const TeleNet={
 /* PeerJS は使うときだけ読み込む (起動時に外部とは通信しない) */
 load(){ if(window.Peer) return Promise.resolve(); if(this._p) return this._p;
  this._p=new Promise((res,rej)=>{ const s=document.createElement("script"); s.src="js/lib/peerjs.min.js"; s.onload=()=>res(); s.onerror=()=>rej(new Error("読み込めません")); document.head.appendChild(s); }); return this._p; },
 /* 試験用: ?ps=host:port で自前の PeerServer を使う */
 opts(){ const q=new URLSearchParams(location.search).get("ps"); if(!q) return {debug:0};
  const [host,port]=q.split(":"); return {host,port:+port||9000,path:"/",secure:false,debug:0,config:{iceServers:[]}}; },
 rid(n){ const A="abcdefghjkmnpqrstuvwxyz23456789"; let s=""; const a=new Uint32Array(n); crypto.getRandomValues(a); for(const x of a) s+=A[x%A.length]; return s; },
};
/* ---------- ドライバー側 ---------- */
const Tele={
 peer:null, conns:[], id:null, key:null, t1:0, t30:-1e9, on:false,
 async start(){
  if(this.peer){ this.panel(); return; }
  this.status("つないでいます…");
  try{ await TeleNet.load(); }catch(e){ this.status("読み込めませんでした"); return; }
  this.id="bwsc-"+TeleNet.rid(10); this.key=TeleNet.rid(6);
  const p=new Peer(this.id,TeleNet.opts()); this.peer=p;
  p.on("open",()=>{ this.on=true; this.panel(); this.status("監視を待っています"); });
  p.on("connection",(c)=>this.accept(c));
  p.on("error",(e)=>{ this.status("通信エラー: "+String(e&&e.type||e).slice(0,40)); });
  p.on("disconnected",()=>{ this.status("相手探しのサーバーから切れました (つながっている監視は続きます)"); try{ p.reconnect(); }catch(e){} });
 },
 /* 同じ PC の別ウィンドウ: BroadcastChannel で監視画面とやり取りする */
 lid:null, lkey:null, ch:null, lconns:new Map(),
 startLocal(){
  if(!this.ch){
   if(typeof BroadcastChannel==="undefined"){ toast("このブラウザは別ウィンドウでのやり取りに対応していません","#f59e0b"); return; }
   this.lid="local-"+TeleNet.rid(10); this.lkey=TeleNet.rid(6); this.ch=new BroadcastChannel("bwsc-tm-"+this.lid);
   this.ch.onmessage=(e)=>{ const d=e.data; if(!d||typeof d.from!=="string") return; const m=d.m; let c=this.lconns.get(d.from);
    if(!c){ const ch=this.ch, to=d.from; c={local:true,open:true,ok:false,send:(x)=>ch.postMessage({to,m:x}),close(){ this.open=false; }}; this.lconns.set(d.from,c); }
    c.seen=performance.now();
    if(m&&m.t==="ping") return;
    if(m&&m.t==="bye"){ c.open=false; this.lconns.delete(d.from); this.conns=this.conns.filter(x=>x!==c); this.status(this.conns.length?`監視 ${this.conns.length} 台とつながっています`:"監視を待っています"); return; }
    if(!c.ok){ if(m&&m.t==="hello"&&m.k===this.lkey){ c.ok=true; this.conns.push(c); this.send(c,this.init()); this.t30=-1e9; this.status(`監視 ${this.conns.length} 台とつながっています`); Radio.push("テレメトリの監視画面 (この PC) がつながりました","チーフ"); } return; }
    this.recv(m); };
   this.on=true; this.status("監視画面を開いています");
  }
  const u=`${location.origin}${location.pathname}?tm=${this.lid}#k=${this.lkey}`;
  window.open(u,"bwsc-monitor","popup,width=1100,height=900,noopener");   // noopener: 監視ウィンドウを別のプロセスで動かす (ゲームと同じ処理の流れに乗せない)
  clearTimeout(this._lt); this._lt=setTimeout(()=>{ if(this.ch&&!this.conns.some(c=>c.local)) toast("監視画面が開かない場合は、ブラウザでポップアップを許可してください","#f59e0b"); },8000);
 },
 stop(){ for(const c of this.conns) try{ c.close(); }catch(e){} this.conns=[]; if(this.peer) try{ this.peer.destroy(); }catch(e){} this.peer=null; this.on=false;
  if(this.ch){ try{ this.ch.close(); }catch(e){} this.ch=null; this.lid=null; this.lconns.clear(); } this.status("停止中"); this.panel(); if(typeof Orders!=="undefined") Orders.mode="auto"; },
 url(){ return `${location.origin}${location.pathname}?tm=${this.id}${new URLSearchParams(location.search).get("ps")?"&ps="+new URLSearchParams(location.search).get("ps"):""}#k=${this.key}`; },
 accept(c){
  c.ok=false;
  c.on("data",(d)=>{ if(!d||typeof d!=="object") return;
   if(!c.ok){ if(d.t==="hello"&&d.k===this.key){ c.ok=true; this.conns.push(c); this.send(c,this.init()); this.t30=-1e9; this.status(`監視 ${this.conns.length} 台とつながっています`); Radio.push("テレメトリの監視端末がつながりました","チーフ"); } else c.close(); return; }
   this.recv(d); });
  c.on("close",()=>{ this.conns=this.conns.filter(x=>x!==c); this.status(this.conns.length?`監視 ${this.conns.length} 台とつながっています`:"監視端末を待っています"); });
 },
 send(c,m){ try{ if(c.open) c.send(m); }catch(e){} },
 all(m){ for(const c of this.conns) this.send(c,m); },
 /* 監視からの操作 */
 recv(d){
  if(d.t==="mode"&&["auto","manual","voice"].includes(d.mode)){ Orders.setMode(d.mode); this.all({t:"mode",mode:Orders.mode}); }
  else if(d.t==="order"&&Number.isFinite(+d.v)&&Number.isFinite(+d.I)) Orders.manual(clamp(Math.round(+d.v),10,160),clamp(+d.I,0,200));
 },
 /* つないだときに送るもの: ドライバー名・これまでの軌跡 (約 200 m ごと) */
 init(){ const es=Engine.st, R=RunLog.rows, C=RunLog.COLS, ix=(n)=>C.indexOf(n), iA=ix("経過h"), iK=ix("km"), iV=ix("速度km/h"), iS=ix("SOC%");
  const pts=[]; let lastK=-1; for(const r of R){ if(r[iK]-lastK>=0.2||r===R[R.length-1]){ pts.push([+r[iK].toFixed(2),+(r[iA]+8).toFixed(4),+(r[iV]||0).toFixed(1),+(r[iS]||0).toFixed(1)]); lastK=r[iK]; } }
  return {t:"init",drivers:typeof Crew!=="undefined"?Crew.drivers.map(d=>d.name):[],pts,mode:Orders.mode,day0:PRO.dayOfYear,real:RealWx.on(),fcErr:P.fcErr,total:TOTAL_KM}; },
 /* 毎フレーム (main の loop): 1 秒ごとに値、30 秒ごとに予報と戦略 */
 frame(es){
  if(!this.conns.length||!es) return; const now=performance.now();
  if(this.ch&&this.conns.some(c=>c.local&&now-(c.seen||now)>15000)){ for(const [k,c] of this.lconns) if(c.local&&now-(c.seen||now)>15000){ c.open=false; this.lconns.delete(k); }   // 閉じた監視ウィンドウ (15 秒応答なし)
   this.conns=this.conns.filter(c=>!c.local||c.open); this.status(this.conns.length?`監視 ${this.conns.length} 台とつながっています`:"監視を待っています"); if(!this.conns.length) return; }
  if(now-this.t1>=1000){ this.t1=now; this.all(this.snap(es)); }
  if(now-this.t30>=30000){ this.t30=now; try{ this.all(this.forecast(es)); }catch(e){} }
 },
 snap(es){ const o=Orders.cur, L=Orders.last, pr=profileAt(es.km);
  let rec=null; try{ const p=Strategy.plan(false), d=Math.min(10,TOTAL_KM-es.km); if(p&&d>0.5){ const Z=Orders.limitZone(es.km,d), v=Math.min(Math.round(Strategy.speedFor(p,es.km,Z.end-es.km,es.soc,es.lastSolar||0)),Z.lim); rec={v,I:+Orders.current(es,v,es.km,Z.end-es.km).toFixed(1),fin:p.r&&p.r.finishAbs}; } }catch(e){}
  return {t:"snap",abs:(es.day-1)*24+es.hour,day:es.day,hour:es.hour,km:es.km,v:es.v*3.6,soc:es.soc*100,ps:es.lastSolar||0,pm:es.lastMotorW||0,net:(es.lastSolar||0)-(es.lastMotorW||0),
   lim:speedLimitAt(es.km),lat:pr.lat,lon:pr.lon,st:RunLog.state(es),wx:es.weather?es.weather.type:null,drv:typeof Crew!=="undefined"?Crew.drivers[Crew.driverIdx].name:"",
   ord:o?{v:o.v,I:o.I,k1:o.k1}:null,last:L&&!L.na?{g:L.grade,pct:L.pct,dev:L.dev}:null,mode:Orders.mode,rec,amp:es.lastAmp||0,tc:es.lastTcell,head:es.lastHead||0,cross:es.lastCross||0,camp:!!es.camp,stop:es.stopTimer>0?es.stopKind:null}; },
 /* 予報 (ドライバー側の「予報」を使う。実際の天気そのものは送らない): この先 9 時間の 1 時間ごと */
 forecast(es){
  const p=Strategy.plan(false), abs0=(es.day-1)*24+es.hour, out=[];
  let tr=null; try{ if(p) tr=Strategy.simulate(p.f||p.v,{abs:abs0,km:es.km,soc:es.soc,trace:true}).trace; }catch(e){}   // 推奨で走った場合の見込み (地点・電池・速度)
  const kmAt=(a)=>{ if(!tr||!tr.length) return Math.min(TOTAL_KM,es.km+(Math.max(0,a-abs0))*70); let lo=0,hi=tr.length-1; if(a<=tr[0][1]) return tr[0][0]; if(a>=tr[hi][1]) return tr[hi][0];
   while(hi-lo>1){ const m=(lo+hi)>>1; if(tr[m][1]<=a) lo=m; else hi=m; } return tr[lo][0]; };
  const fc=es.fc, plan=(fc&&fc.plan)||es.weatherPlan||[];
  for(let h=0;h<=9;h++){ const a=Math.floor(abs0)+h; const day=Math.floor(a/24)+1, hr=a-(day-1)*24, doy=PRO.dayOfYear+day-1, km=kmAt(a+0.5), q=profileAt(km);
   const sp=Phys.sunPos(q.lat,q.lon,doy,hr+0.5); let ghi=0, cc=0, t=ambientTemp(q.lat,hr+0.5), ws=0, to=0;
   if(RealWx.on()){ const di=clamp(doy-PRO.dayOfYear,0,6), sh=fc?fc.shift[di]:0, k=fc?fc.scale[di]:1;
    ghi=(RealWx.at("ghi",q.lat,q.lon,doy,hr+0.5+sh)||0)*k; cc=clamp((RealWx.at("cc",q.lat,q.lon,doy,hr+sh)||0)*(2-k),0,100); const tt=RealWx.at("t",q.lat,q.lon,doy,hr+0.5); if(tt!=null) t=tt; const w=RealWx.wind(q.lat,q.lon,doy,hr+0.5); if(w){ ws=w.ws; to=w.toward; } }
   else { const ev=plan.find(w=>a+0.5>=w.start&&a+0.5<w.start+w.dur); if(sp.alt>0){ const cs=Phys.clearSky(sp.alt,q.elev,doy); ghi=(cs.dni*Math.sin(sp.alt)+cs.dhi)*(ev?ev.factor:1); } cc=ev? (ev.type==="squall"?95:75) : 10; const wc=Phys.windClim(q.lat,hr+0.5); ws=PRO.windBase*wc.f; to=wc.toward; }
   const rel=to-q.bearing+Math.PI;   // 車の進む向きに対する風
   out.push({abs:a,day,hr,km,ghi:Math.max(0,ghi),cc,t,ws,head:ws*Math.cos(rel),cross:ws*Math.sin(rel),night:sp.alt<=0,rain:(()=>{ const ev=plan.find(w=>a+0.5>=w.start&&a+0.5<w.start+w.dur); return !!(ev&&ev.type==="squall"); })()}); }
  const pr=profileAt(es.km), ss=Phys.sunPos(pr.lat,pr.lon,es.dayOfYear,12);
  const nx=RP_CS.find(c=>!es.passedCP.has(c.km)&&c.km>es.km-0.2);
  return {t:"fc",hours:out,sunrise:ss.sunrise,sunset:ss.sunset,plan:p?{v:p.v,ok:p.ok,fin:p.r&&p.r.finishAbs,minSoc:p.r&&p.r.minSoc,minKm:p.r&&p.r.minKm,socCS:p.r&&p.r.socNextCS,cs:nx?{n:nx.n,name:nx.name,km:nx.km}:null}:null,
   trace:tr? tr.filter((x,i)=>i%5===0).map(x=>[+x[0].toFixed(1),+(x[2]*100).toFixed(1),+(x[3]||0).toFixed(0)]) : null}; },
 radio(msg,who){ if(this.conns.length) this.all({t:"radio",who,msg:String(msg).replace(/<[^>]*>/g,"").slice(0,200),hour:Engine.st?Engine.st.hour:0}); },
 /* 画面 (メニュー / 一時停止 / 走行中の小さな表示) */
 status(m){ this.msg=m; const el=document.getElementById("tm-status"); if(el) el.textContent=m; const hb=document.getElementById("hud-tm"); if(hb){ hb.style.display=this.on?"":"none"; hb.classList.toggle("live",this.conns.length>0); hb.title=m; } },
 panel(){ show("tm-dlg",true); const box=document.getElementById("tm-qr"), u=document.getElementById("tm-url");
  document.getElementById("tm-start").style.display=this.peer?"none":""; document.getElementById("tm-stop").style.display=(this.peer||this.ch)?"":"none"; document.getElementById("tm-copy").style.display=(this.peer&&this.peer.open)?"":"none";
  if(!this.peer||!this.peer.open){ box.innerHTML=""; u.textContent=""; this.status(this.msg||"停止中"); return; }
  const url=this.url(); u.textContent=url;
  if(typeof qrcode!=="undefined") try{ const q=qrcode(0,"M"); q.addData(url,"Byte"); q.make(); const n=q.getModuleCount(); box.innerHTML=q.createImgTag(Math.max(2,Math.floor(240/n)),8); }catch(e){ box.textContent=url; }
  this.status(this.msg); },
 copy(){ try{ navigator.clipboard.writeText(this.url()); toast("リンクをコピーしました","#34d399"); }catch(e){} },
};
