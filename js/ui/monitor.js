"use strict";
/* ============ Realtime Run Analysis (テレメトリの監視画面) ============
 URL に ?tm=<相手の ID>#k=<合言葉> が付いているとき、ゲームの代わりにこの画面を開いてドライバー側につなぐ。
 ・上: 速度・電池・収支・距離・制限速度 (1 秒ごと)
 ・指示: 出し方 (自動 / 入力して送る / 声で伝える) の切り替え、いまの指示と評価、推奨 (ワンタップで入力欄へ)
 ・地図: 分析画面と同じ立体地図。走った所に帯 (高さ・色 = 速度 または 電池) を描き足す (全体 / 周辺で追従)
 ・グラフ: 距離に対する速度と電池。戦略の見込み (点線) と比べる
 ・予報: この先 9 時間の 1 時間ごと (日射・雲・気温・向かい風/横風・その時刻にいる地点)。日の出・日の入り。戦略のまとめ
 ・無線: ドライバー側の無線の文 */
const Monitor={
 peer:null, conn:null, pts:[], snap:null, fc:null, radio:[], drivers:[], view:"all", retry:0,
 wanted(){ return new URLSearchParams(location.search).has("tm"); },
 async boot(){
  const id=new URLSearchParams(location.search).get("tm"), key=(location.hash.match(/k=([a-z0-9]+)/)||[])[1]||"";
  if(!/^(bwsc|local)-[a-z0-9]{6,20}$/.test(id||"")){ document.body.innerHTML="<p style='padding:24px;color:#fff'>リンクが正しくありません</p>"; return; }
  this.id=id; this.key=key; this.build();
  if(id.startsWith("local-")){ this.local(); addEventListener("resize",()=>this.drawAll()); return; }   // 同じ PC の別ウィンドウ
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
 /* 同じ PC: BroadcastChannel。つながる (init が届く) まで 2 秒ごとに hello を送る */
 local(){
  const cid=TeleNet.rid(8), ch=new BroadcastChannel("bwsc-tm-"+this.id); this.ch=ch; this.cid=cid; this.state("つないでいます… (この PC)");
  ch.onmessage=(e)=>{ const d=e.data; if(!d||d.to!==cid) return; if(d.m&&d.m.t==="init"){ this.linked=true; this.state("つながりました (この PC)"); } this.recv(d.m); };
  const hello=()=>{ if(this.linked) return; ch.postMessage({from:cid,m:{t:"hello",k:this.key}}); setTimeout(hello,2000); }; hello();
  setInterval(()=>{ if(this.linked) ch.postMessage({from:cid,m:{t:"ping"}}); },5000);   // 生きていることを知らせる
  addEventListener("beforeunload",()=>{ try{ ch.postMessage({from:cid,m:{t:"bye"}}); }catch(e){} });
 },
 again(){ clearTimeout(this._rt); this._rt=setTimeout(()=>this.connect(),Math.min(15000,2000*(++this.retry))); },
 send(m){ try{ if(this.ch){ if(this.linked) this.ch.postMessage({from:this.cid,m}); else toast("ドライバー側とつながっていません","#f59e0b"); return; }
  if(this.conn&&this.conn.open) this.conn.send(m); else toast("ドライバー側とつながっていません","#f59e0b"); }catch(e){} },
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
  <section class="card"><div class="ch">${ic("map")}地図<div class="seg" id="mon-met"><button data-v="v" class="on">速度</button><button data-v="soc">電池</button></div><div class="seg" id="mon-mv" style="margin-left:0"><button data-v="all" class="on">全体</button><button data-v="near">周辺 (追従)</button></div></div>
   <div class="ana-map" id="mon-map"><div class="ana-compass" id="ana-compass" title="北の向き (クリックで北を上に)" onclick="Monitor.map&&Monitor.map.north()"><i></i><b>N</b></div><div class="ana-ctl"><button class="btn" title="左に回す" onclick="Monitor.map&&Monitor.map.rot(-1)">${ic("rotate","flipx")}</button><button class="btn" title="右に回す" onclick="Monitor.map&&Monitor.map.rot(1)">${ic("rotate")}</button><button class="btn" title="寝かせる" onclick="Monitor.map&&Monitor.map.tilt(1)">${ic("chd")}</button><button class="btn" title="起こす" onclick="Monitor.map&&Monitor.map.tilt(-1)">${ic("chu")}</button><button class="btn" title="北を上に" onclick="Monitor.map&&Monitor.map.north()">N</button><button class="btn" title="真上から" onclick="Monitor.map&&Monitor.map.top()">真上</button></div><div class="ana-leg" id="ana-leg"></div></div></section>
  <section class="card"><div class="ch">${ic("activity")}速度と電池 (この先の見込みは点線)</div><canvas id="mon-chart"></canvas></section>
  <section class="card"><div class="ch">${ic("sun")}この先の天気 (予報)<span class="dim" id="mon-sun"></span></div><div class="fc" id="mon-fc"><div class="dim">予報を待っています…</div></div><div id="mon-plan" class="plan"></div></section>
  <section class="card"><div class="ch">${ic("radio")}無線</div><div id="mon-radio" class="rl"><div class="dim">まだありません</div></div></section>`;
  document.body.appendChild(el);
  document.getElementById("mon-mode").addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b) return; this.send({t:"mode",mode:b.dataset.m}); this.modeUI(b.dataset.m); });
  document.getElementById("mon-mv").addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b) return; this.view=b.dataset.v; this.dirty=true; document.querySelectorAll("#mon-mv button").forEach(x=>x.classList.toggle("on",x===b)); this.aim(); this.drawMap(); });
  document.getElementById("mon-met").addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b) return; document.querySelectorAll("#mon-met button").forEach(x=>x.classList.toggle("on",x===b)); if(this.ctx){ this.ctx.metric=b.dataset.v; this.dirty=true; } this.drawMap(); });
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
 /* ---------- 地図: 分析画面 (Run Analysis) の立体地図をそのまま使う。帯の高さ・色 = 速度 / 電池、白い棒 = いまの地点 ---------- */
 fit(cv){ const r=cv.getBoundingClientRect(), dpr=Math.min(devicePixelRatio||1,2); cv.width=Math.max(10,r.width*dpr); cv.height=Math.max(10,r.height*dpr); const c=cv.getContext("2d"); c.setTransform(dpr,0,0,dpr,0,0); return [c,r.width,r.height]; },
 /* 走った軌跡を 1 km ごとにまとめる (速度は走っている間だけの平均) */
 bins(){ const n=Math.ceil(TOTAL_KM)+1, acc=new Array(n);
  const add=(km,v,soc)=>{ const i=clamp(Math.floor(km),0,n-1), a=acc[i]||(acc[i]={v:0,nv:0,soc:0,n:0}); if(v>1){ a.v+=v; a.nv++; } a.soc+=soc; a.n++; };
  const P=this.pts; for(let j=0;j<P.length;j++){ const [km,,v,soc]=P[j]; add(km,v,soc);
   const q=P[j+1]; if(q&&q[0]-km>1&&q[0]-km<=8) for(let k=Math.floor(km)+1;k<q[0];k++){ const u=(k+0.5-km)/(q[0]-km); add(k+0.5,v+(q[2]-v)*u,soc+(q[3]-soc)*u); } }   // 1 秒ごとの間に進んだ所 (早送り) を補う
  return acc.map((a,i)=>a? {km:i+0.5,v:a.nv? a.v/a.nv : NaN,soc:a.soc/a.n,el:profileAt(Math.min(TOTAL_KM,i+0.5)).elev} : undefined); },
 initMap(){
  if(this.map||this._mapFail||typeof Ana==="undefined"||typeof THREE==="undefined") return this.map;
  const M=this, ctx=Object.create(Ana);   // 分析画面の地図の部品 (色・凡例・指標) を借りる
  Object.assign(ctx,{metric:"v",mapMode:"band",sel:null,cursor:null,lock:true,map:null,run:()=>M.run3,setCursor(){},placeTag(){},mapPick(){},drawCharts(){},drawCursor(){}});
  try{ this.map=ctx.makeMap(); }catch(e){ this._mapFail=true; const h=document.getElementById("mon-map"); if(h) h.insertAdjacentHTML("afterbegin","<div class='dim' style='padding:12px'>この端末では立体地図を表示できません</div>"); return null; }
  ctx.map=this.map; this.ctx=ctx; this.dirty=true; this.map.r.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
  this.map.sc.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(this.map.P.map(([x,z])=>new THREE.Vector3(x,0.06,z))),new THREE.LineBasicMaterial({color:0x6a7078})));   // これから走るルート
  const host=document.getElementById("mon-map"); host.insertBefore(this.map.r.domElement,host.firstChild);
  const D0=this.map.draw, mm=this.map; mm.draw=function(){ D0.call(mm); if(M.view==="near"&&mm.pole.visible){ mm.pole.scale.y*=0.3; mm.pole.position.y*=0.3; mm.r.render(mm.sc,mm.cam); } };   // いまの地点の棒も低く (回したときも)
  const H0=this.map.H; this.map.H=(b)=>H0.call(this.map,b)*(this.view==="near"?0.25:1);   // 周辺は寄っているので帯を低く
  return this.map; },
 /* 周辺: いまの地点に寄せて追いかける。全体: ルート全体が入る向き */
 aim(){ const m=this.map, s=this.snap; if(!m) return;
  if(this.view==="near"&&s){ const i=clamp(Math.round(s.km),0,m.P.length-1); m.view.tx=m.P[i][0]; m.view.tz=m.P[i][1]; if(!this._near){ m.view.d=60; this._near=true; } }
  else if(this.view!=="near"&&this._near!==false){ this._near=false; this.ctx.sel=null; const keep=this.run3; this.run3={bins:[],kmMax:TOTAL_KM,drivers:[]}; m.fit(); this.run3=keep; } },
 drawMap(){
  const m=this.initMap(); if(!m) return;
  this.run3={bins:this.bins(),kmMax:TOTAL_KM,drivers:[]};
  const nb=this.run3.bins.reduce((n,b)=>n+(b?1:0),0), now=performance.now();   // 帯の作り直しは、走った km が増えたときに 3 秒に 1 回まで
  if(nb!==this._nb&&now-(this._rb||0)>3000){ this._nb=nb; this.dirty=true; }
  if(this.dirty){ m.rebuild(); this.dirty=false; this._rb=now; this.ctx.legend(); }
  this.ctx.cursor= this.snap? this.snap.km : null;
  this.aim(); m.resize(); m.draw();
 },
 /* ---------- グラフ: 速度と電池 (今の地点の前後) ---------- */
 drawChart(){
  const cv=document.getElementById("mon-chart"); if(!cv) return; const [c,W,H]=this.fit(cv); c.clearRect(0,0,W,H);
  const s=this.snap, k=s?s.km:0, a=Math.max(0,k-80), b=Math.min(TOTAL_KM,k+80), L=40, PW=W-L-10, X=(x)=>L+(x-a)/(b-a)*PW, h2=(H-22)/2;
  const Yv=(v)=>4+h2-clamp((v-20)/(130-20),0,1)*(h2-8), Ys=(v)=>4+h2*2-clamp(v/100,0,1)*(h2-8)+2;
  c.font="500 10px 'Chakra Petch',sans-serif"; c.textAlign="right";
  for(const v of [20,40,60,80,100,120]){ const y=Yv(v); c.strokeStyle="#1a1d21"; c.beginPath(); c.moveTo(L,y); c.lineTo(W-10,y); c.stroke(); c.fillStyle="#8b9097"; c.fillText(v,L-5,y+3.5); }
  for(const v of [0,25,50,75,100]){ const y=Ys(v); c.strokeStyle="#1a1d21"; c.beginPath(); c.moveTo(L,y); c.lineTo(W-10,y); c.stroke(); c.fillStyle="#8b9097"; c.fillText(v,L-5,y+3.5); }
  c.textAlign="left"; c.fillStyle="#f26b1d"; c.fillText("速度 km/h",L+4,12); c.fillStyle="#e6e6e3"; c.fillText("電池 %",L+4,h2+16);
  c.strokeStyle="#3a3e44"; c.beginPath(); c.moveTo(L,4); c.lineTo(L,H-20); c.moveTo(L,h2+4); c.lineTo(W-10,h2+4); c.stroke();
  const line=(arr,fx,fy,col,dash)=>{ c.strokeStyle=col; c.lineWidth=1.6; c.setLineDash(dash?[4,3]:[]); c.beginPath(); let st=false; for(const p of arr){ const x=fx(p); if(x<a||x>b) continue; const y=fy(p); st?c.lineTo(X(x),y):c.moveTo(X(x),y); st=true; } c.stroke(); c.setLineDash([]); };
  const T=this.fc&&this.fc.trace; if(T){ line(T.filter(t=>t[0]>=k),t=>t[0],t=>Yv(t[2]||0),"#22d3ee",true); line(T.filter(t=>t[0]>=k),t=>t[0],t=>Ys(t[1]),"#22d3ee",true); }
  line(this.pts,p=>p[0],p=>Yv(p[2]),"#f26b1d"); line(this.pts,p=>p[0],p=>Ys(p[3]),"#e6e6e3");
  c.strokeStyle="#fff"; c.beginPath(); c.moveTo(X(k),4); c.lineTo(X(k),H-20); c.stroke();
  c.fillStyle="#8b9097"; const step=[10,20,50].find(st=>(b-a)/st<=8)||50; for(let x=Math.ceil(a/step)*step;x<=b;x+=step) if(X(x)-14>=L+2) c.fillText(x+" km",X(x)-14,H-6);
 },
 drawAll(){ this.drawMap(); this.drawChart(); },
};
