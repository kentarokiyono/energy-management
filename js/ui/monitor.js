"use strict";
/* ============ Realtime Run Analysis (テレメトリの監視画面) ============
 URL に ?tm=<相手の ID>#k=<合言葉> が付いているとき、ゲームの代わりにこの画面を開いてドライバー側につなぐ。
 ・上: 速度・電池・収支・距離・制限速度 (1 秒ごと)
 ・指示: 出し方 (自動 / 入力して送る / 声で伝える) の切り替え、いまの指示と評価、推奨 (ワンタップで入力欄へ)
 ・地図: ルートの上に走った軌跡を速度の色で描き足す (全体 / 周辺)
 ・グラフ: 距離に対する速度と電池。戦略の見込み (点線) と比べる
 ・予報: この先 9 時間の 1 時間ごと (日射・雲・気温・向かい風/横風・その時刻にいる地点)。日の出・日の入り。戦略のまとめ
 ・無線: ドライバー側の無線の文 */
const Monitor={
 peer:null, conn:null, pts:[], snap:null, fc:null, radio:[], drivers:[], view:"all", retry:0,
 wanted(){ return new URLSearchParams(location.search).has("tm"); },
 async boot(){
  const id=new URLSearchParams(location.search).get("tm"), key=(location.hash.match(/k=([a-z0-9]+)/)||[])[1]||"";
  if(!/^bwsc-[a-z0-9]{6,20}$/.test(id||"")){ document.body.innerHTML="<p style='padding:24px;color:#fff'>リンクが正しくありません</p>"; return; }
  this.id=id; this.key=key; this.build();
  try{ await TeleNet.load(); }catch(e){ this.state("通信の部品を読み込めませんでした"); return; }
  this.connect();
  addEventListener("resize",()=>this.drawAll());
 },
 connect(){
  this.state("つないでいます…");
  if(!this.peer||this.peer.destroyed){ this.peer=new Peer(TeleNet.opts()); this.peer.on("error",(e)=>{ this.state("通信エラー: "+String(e&&e.type||e).slice(0,40)); this.again(); }); }
  const go=()=>{ const c=this.peer.connect(this.id,{reliable:true}); this.conn=c;
   c.on("open",()=>{ c.send({t:"hello",k:this.key}); this.state("つながりました"); this.retry=0; });
   c.on("data",(d)=>this.recv(d));
   c.on("close",()=>{ this.state("切れました。つなぎ直します…"); this.again(); }); };
  if(this.peer.open) go(); else this.peer.once("open",go);
 },
 again(){ clearTimeout(this._rt); this._rt=setTimeout(()=>this.connect(),Math.min(15000,2000*(++this.retry))); },
 send(m){ try{ if(this.conn&&this.conn.open) this.conn.send(m); else toast("ドライバー側とつながっていません","#f59e0b"); }catch(e){} },
 recv(d){
  if(!d||typeof d!=="object") return;
  if(d.t==="init"){ this.drivers=d.drivers||[]; this.pts=Array.isArray(d.pts)? d.pts.slice() : []; this.modeUI(d.mode); this.drawAll(); }
  else if(d.t==="snap"){ this.snap=d; const L=this.pts[this.pts.length-1]; if(!L||d.km-L[0]>=0.2) this.pts.push([d.km,d.abs,d.v,d.soc]); this.modeUI(d.mode); this.top(); this.order(); this.drawMap(); this.drawChart(); }
  else if(d.t==="fc"){ this.fc=d; this.forecast(); this.drawChart(); }
  else if(d.t==="radio"){ this.radio.unshift(d); this.radio.length=Math.min(this.radio.length,40); this.radioUI(); }
  else if(d.t==="mode") this.modeUI(d.mode);
 },
 /* ---------- 画面 ---------- */
 build(){
  document.body.classList.add("mon-on");
  for(const e of [document.documentElement,document.body]) Object.assign(e.style,{overflow:"auto",height:"auto",position:"static",touchAction:"auto"});   // ゲーム用のスクロール禁止を外す
  const el=document.createElement("div"); el.id="mon"; el.innerHTML=`
  <header><img src="assets/img/logo.svg" class="logo" width="46" alt=""><div><div class="ttl">REALTIME RUN ANALYSIS</div><div class="sub" id="mon-state">準備中</div></div><div class="clk" id="mon-clk">―</div></header>
  <section class="kpis" id="mon-kpi"></section>
  <section class="card" id="mon-ord"><div class="ch">${ic("radio")}速度指示<div class="seg" id="mon-mode"><button data-m="auto">自動</button><button data-m="manual">入力して送る</button><button data-m="voice">声で伝える</button></div></div><div id="mon-ordb"></div></section>
  <section class="card"><div class="ch">${ic("map")}地図<div class="seg" id="mon-mv"><button data-v="all" class="on">全体</button><button data-v="near">周辺</button></div></div><canvas id="mon-map"></canvas><div class="leg"><span>速度</span><i class="bar"></i><span>40</span><span>110 km/h</span></div></section>
  <section class="card"><div class="ch">${ic("activity")}速度と電池 (この先の見込みは点線)</div><canvas id="mon-chart"></canvas></section>
  <section class="card"><div class="ch">${ic("sun")}この先の天気 (予報)<span class="dim" id="mon-sun"></span></div><div class="fc" id="mon-fc"><div class="dim">予報を待っています…</div></div><div id="mon-plan" class="plan"></div></section>
  <section class="card"><div class="ch">${ic("radio")}無線</div><div id="mon-radio" class="rl"><div class="dim">まだありません</div></div></section>`;
  document.body.appendChild(el);
  document.getElementById("mon-mode").addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b) return; this.send({t:"mode",mode:b.dataset.m}); this.modeUI(b.dataset.m); });
  document.getElementById("mon-mv").addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b) return; this.view=b.dataset.v; document.querySelectorAll("#mon-mv button").forEach(x=>x.classList.toggle("on",x===b)); this.drawMap(); });
  this.top(); this.order();
 },
 state(m){ const e=document.getElementById("mon-state"); if(e) e.textContent=m; },
 top(){
  const s=this.snap, f=(x,d)=>Number.isFinite(x)?x.toFixed(d):"―", kpi=(k,v,u,cls)=>`<div class="k ${cls||""}"><span>${k}</span><b>${v}</b><i>${u}</i></div>`;
  document.getElementById("mon-clk").textContent= s? `Day${s.day} ${String(Math.floor(s.hour)).padStart(2,"0")}:${String(Math.floor(s.hour%1*60)).padStart(2,"0")}` : "―";
  document.getElementById("mon-kpi").innerHTML= kpi("速度",s?f(s.v,0):"―","km/h",s&&s.v>s.lim+2?"bad":"")+kpi("電池",s?f(s.soc,1):"―","%",s&&s.soc<15?"bad":"")+kpi("収支",s?(s.net>0?"+":"")+f(s.net,0):"―","W",s&&s.net>0?"good":"")
   +kpi("距離",s?f(s.km,1):"―","km")+kpi("制限",s?f(s.lim,0):"―","km/h")+kpi("ドライバー",s?escHtml(s.drv||"―"):"―","",s&&s.stop?"dim":"")
   +(s? `<div class="state">${escHtml(s.camp?"夜営・充電中":s.stop?"停車中 ("+s.stop+")":s.st||"")}${s.wx?" ・ "+(s.wx==="squall"?"スコール":"曇り"):""} ・ 発電 ${f(s.ps,0)} W・モーター ${f(s.pm,0)} W・電流 ${f(s.amp,1)} A</div>` : "");
 },
 modeUI(m){ if(!m) return; this.mode=m; document.querySelectorAll("#mon-mode button").forEach(b=>b.classList.toggle("on",b.dataset.m===m)); this.order(); },
 order(){
  const s=this.snap, el=document.getElementById("mon-ordb"); if(!el) return; const o=s&&s.ord, L=s&&s.last, r=s&&s.rec, m=this.mode||"auto";
  let h="";
  if(m!=="voice") h+=`<div class="ord">${o?`<b>${o.v}</b><i>km/h</i><b>${(+o.I).toFixed(1)}</b><i>A</i><span class="dim">あと ${Math.max(0,o.k1-s.km).toFixed(1)} km</span>`:`<span class="dim">いまの指示はありません</span>`}${L?`<span class="g g${L.g}">${L.g}</span><span class="dim">前の区間 ${(L.pct*100).toFixed(0)} %・ずれ ${L.dev.toFixed(1)} km/h</span>`:""}</div>`;
  if(r) h+= m==="voice"? `<div class="say">伝える内容<br><b>時速 ${r.v} km・電流 ${r.I.toFixed(1)} A</b></div>` : `<div class="dim">推奨: 時速 ${r.v} km・電流 ${r.I.toFixed(1)} A${r.fin?`・ゴール見込み ${fmtAbsH(r.fin)}`:""}</div>`;
  if(m==="manual") h+=`<div class="man"><label>時速<input id="mon-v" type="number" min="10" max="160" step="1" inputmode="numeric" value="${this._mv??(r?r.v:70)}"></label><label>電流<input id="mon-i" type="number" min="0" max="200" step="0.1" inputmode="decimal" value="${this._mi??(r?r.I:8)}"></label><button class="btn" onclick="Monitor.fillRec()">推奨を入れる</button><button class="btn pri" onclick="Monitor.sendOrder()">送る</button></div>`;
  if(m==="manual"&&document.activeElement&&/mon-[vi]/.test(document.activeElement.id)) return;   // 入力中は描き直さない
  el.innerHTML=h;
  for(const id of ["mon-v","mon-i"]){ const i=document.getElementById(id); if(i) i.oninput=()=>{ if(id==="mon-v") this._mv=i.value; else this._mi=i.value; }; }
 },
 fillRec(){ const r=this.snap&&this.snap.rec; if(!r) return; this._mv=r.v; this._mi=r.I.toFixed(1); document.getElementById("mon-v").value=r.v; document.getElementById("mon-i").value=r.I.toFixed(1); },
 sendOrder(){ const v=+document.getElementById("mon-v").value, I=+document.getElementById("mon-i").value;
  if(!(v>=10&&v<=160)||!(I>=0&&I<=200)){ toast("時速 10〜160 km、電流 0〜200 A で入れてください","#f59e0b"); return; }
  this.send({t:"order",v,I}); this._mv=null; this._mi=null; toast(`送りました: 時速 ${v} km・電流 ${I.toFixed(1)} A`,"#34d399"); },
 radioUI(){ const el=document.getElementById("mon-radio"); if(!el) return; el.innerHTML=this.radio.map(r=>`<div><span class="lb">${String(Math.floor(r.hour)).padStart(2,"0")}:${String(Math.floor(r.hour%1*60)).padStart(2,"0")} ${escHtml(r.who||"")}</span>${escHtml(r.msg)}</div>`).join(""); },
 forecast(){
  const F=this.fc; if(!F) return; const f=(x,d)=>Number.isFinite(x)?x.toFixed(d):"―";
  const icon=(h)=> h.night? ic("moon") : h.rain? ic("storm") : h.cc>70? ic("cloud") : h.cc>35? ic("cloud","half") : ic("sun");
  const arrow=(x)=> x>0.5?"▲":x<-0.5?"▼":"・";
  document.getElementById("mon-fc").innerHTML=F.hours.map(h=>`<div class="h ${h.night?"n":""}"><div class="t">${h.hr===0?"D"+h.day+" ":""}${String(h.hr).padStart(2,"0")}時</div><div class="ico">${icon(h)}</div>
   <div class="g">${f(h.ghi,0)}<i>W/m²</i></div><div class="d">雲 ${f(h.cc,0)} %</div><div class="d">${f(h.t,0)} °C</div>
   <div class="d" title="進む向きに対する風: 向かい風 / 横風">${arrow(h.head)} 向かい ${f(Math.abs(h.head),1)}<br>横 ${f(Math.abs(h.cross),1)} m/s</div><div class="km">${f(h.km,0)} km</div></div>`).join("");
  const hh=(x)=>`${String(Math.floor(x)).padStart(2,"0")}:${String(Math.floor(x%1*60)).padStart(2,"0")}`;
  document.getElementById("mon-sun").textContent=` 日の出 ${hh(F.sunrise)}・日の入り ${hh(F.sunset)}`;
  const p=F.plan; document.getElementById("mon-plan").innerHTML= p? `<span>推奨 (平地) <b>${p.v}</b> km/h</span><span>ゴール見込み <b>${p.fin?fmtAbsH(p.fin):"―"}</b></span>${p.cs&&p.socCS!=null?`<span>CS${p.cs.n} ${escHtml(p.cs.name)} 到着 SOC <b>${(p.socCS*100).toFixed(0)}</b> %</span>`:""}<span>いちばん減る所 <b>${f(p.minKm,0)}</b> km で <b>${f(p.minSoc*100,0)}</b> %</span>${p.ok?"":`<span class="bad">このままでは電池が足りない見込み</span>`}` : "";
 },
 /* ---------- 地図 ---------- */
 fit(cv){ const r=cv.getBoundingClientRect(), dpr=Math.min(devicePixelRatio||1,2); cv.width=Math.max(10,r.width*dpr); cv.height=Math.max(10,r.height*dpr); const c=cv.getContext("2d"); c.setTransform(dpr,0,0,dpr,0,0); return [c,r.width,r.height]; },
 route(){ if(this._route) return this._route; const out=[]; for(let k=0;k<=TOTAL_KM;k+=3){ const q=profileAt(Math.min(k,TOTAL_KM)); out.push([q.lon,q.lat,k]); } return this._route=out; },
 col(v){ const t=clamp((v-40)/70,0,1), st=[[44,107,176],[56,161,105],[227,178,31],[242,107,29],[209,59,46]], f=t*4, i=Math.min(3,Math.floor(f)), u=f-i; return `rgb(${[0,1,2].map(k=>Math.round(st[i][k]+(st[i+1][k]-st[i][k])*u)).join(",")})`; },
 drawMap(){
  const cv=document.getElementById("mon-map"); if(!cv) return; const [c,W,H]=this.fit(cv); c.clearRect(0,0,W,H);
  const R=this.route(), s=this.snap, C=Math.cos(25*Math.PI/180);
  let x0,x1,y0,y1; if(this.view==="near"&&s){ const d=0.45; x0=s.lon*C-d; x1=s.lon*C+d; y0=-s.lat-d; y1=-s.lat+d; }
  else { x0=Infinity; x1=-Infinity; y0=Infinity; y1=-Infinity; for(const [lo,la] of R){ x0=Math.min(x0,lo*C); x1=Math.max(x1,lo*C); y0=Math.min(y0,-la); y1=Math.max(y1,-la); } }
  const sc=Math.min((W-24)/(x1-x0),(H-24)/(y1-y0)), ox=(W-(x1-x0)*sc)/2, oy=(H-(y1-y0)*sc)/2, P=(lo,la)=>[ox+(lo*C-x0)*sc, oy+(-la-y0)*sc];
  c.lineWidth=3; c.strokeStyle="#2a2d32"; c.beginPath(); R.forEach(([lo,la],i)=>{ const [x,y]=P(lo,la); i?c.lineTo(x,y):c.moveTo(x,y); }); c.stroke();
  c.fillStyle="#f26b1d"; for(const q of RP_CS){ const p=profileAt(q.km), [x,y]=P(p.lon,p.lat); c.fillRect(x-3,y-3,6,6); }
  c.lineWidth=this.view==="near"?5:3.5; for(let i=1;i<this.pts.length;i++){ const a=this.pts[i-1], b=this.pts[i]; if(b[0]-a[0]>5) continue; const pa=profileAt(a[0]), pb=profileAt(b[0]), [ax,ay]=P(pa.lon,pa.lat), [bx,by]=P(pb.lon,pb.lat);
   c.strokeStyle=this.col(b[2]); c.beginPath(); c.moveTo(ax,ay); c.lineTo(bx,by); c.stroke(); }
  if(s){ const [x,y]=P(s.lon,s.lat); c.fillStyle="#fff"; c.strokeStyle="#f26b1d"; c.lineWidth=3; c.beginPath(); c.arc(x,y,6,0,7); c.fill(); c.stroke(); }
 },
 /* ---------- グラフ: 速度と電池 (今の地点の前後) ---------- */
 drawChart(){
  const cv=document.getElementById("mon-chart"); if(!cv) return; const [c,W,H]=this.fit(cv); c.clearRect(0,0,W,H);
  const s=this.snap, k=s?s.km:0, a=Math.max(0,k-80), b=Math.min(TOTAL_KM,k+80), L=40, PW=W-L-10, X=(x)=>L+(x-a)/(b-a)*PW, h2=(H-22)/2;
  const Yv=(v)=>4+h2-clamp((v-20)/(130-20),0,1)*(h2-8), Ys=(v)=>4+h2*2-clamp(v/100,0,1)*(h2-8)+2;
  c.font="500 10px 'Chakra Petch',sans-serif"; c.fillStyle="#8b9097"; c.fillText("km/h",4,14); c.fillText("SOC %",4,h2+16);
  c.strokeStyle="#1f2226"; c.beginPath(); c.moveTo(L,h2+4); c.lineTo(W-10,h2+4); c.stroke();
  const line=(arr,fx,fy,col,dash)=>{ c.strokeStyle=col; c.lineWidth=1.6; c.setLineDash(dash?[4,3]:[]); c.beginPath(); let st=false; for(const p of arr){ const x=fx(p); if(x<a||x>b) continue; const y=fy(p); st?c.lineTo(X(x),y):c.moveTo(X(x),y); st=true; } c.stroke(); c.setLineDash([]); };
  const T=this.fc&&this.fc.trace; if(T){ line(T.filter(t=>t[0]>=k),t=>t[0],t=>Yv(t[2]||0),"#22d3ee",true); line(T.filter(t=>t[0]>=k),t=>t[0],t=>Ys(t[1]),"#22d3ee",true); }
  line(this.pts,p=>p[0],p=>Yv(p[2]),"#f26b1d"); line(this.pts,p=>p[0],p=>Ys(p[3]),"#e6e6e3");
  c.strokeStyle="#fff"; c.beginPath(); c.moveTo(X(k),4); c.lineTo(X(k),H-20); c.stroke();
  c.fillStyle="#8b9097"; const step=[10,20,50].find(st=>(b-a)/st<=8)||50; for(let x=Math.ceil(a/step)*step;x<=b;x+=step) c.fillText(x+" km",X(x)-14,H-6);
 },
 drawAll(){ this.drawMap(); this.drawChart(); },
};
