"use strict";
/* ============ 計測画面 (テレメトリの監視画面の「計測」ページ) ============
 伴走車のノート PC で見る、車載計測ソフト風の画面。ドライバー側から 1 秒ごとに届く値 (Tele.snap) をそのまま並べる。
 ・左: Line[V] (端子電圧)・SO[A] (ソーラー電流)・BA[A] (電池電流。正=放電)・MO[A] (モーター電流)・SO[W]・SO[Ah] (ソーラー積算)・Bz[Ah] (電池残量)・MO[W]・BA[Wh] (電池の積算。負=放電)・V[km/h]
 ・右: 時系列グラフ。左軸・右軸の項目を選ぶ・隠す。表示幅 1〜5 時間 / 全部。時間はゲームの中の時刻 (速く進めているときもそれに合わせる)
 ・下: Lap (Reset ボタン、または決まった距離ごとに区切る)・前の Lap の時間とモーターの Wh・今の Lap の経過・Log Time (受信開始から)・電池温度
 日なたの車内で読めるよう、明るい背景に濃い文字 */
const MonMeter={
 buf:[], MAX:43200, abs0:null, last:null, lap:null, lapN:1, lastLap:null, lapKm:10, int:1, span:1, L:"pm", R:"v", hideL:false, hideR:false,
 CH:{
  pm:{n:"モーター電力",u:"W",g:d=>d.pm,c:"#c62828",lo:-1000,hi:3000},
  ps:{n:"ソーラー電力",u:"W",g:d=>d.ps,c:"#e08a00",lo:0,hi:1500},
  vl:{n:"ライン電圧",u:"V",g:d=>d.vl,c:"#1f4fd1",lo:90,hi:160},
  v:{n:"速度",u:"km/h",g:d=>d.v,c:"#1f4fd1",lo:0,hi:120},
  ahb:{n:"電池残量",u:"Ah",g:d=>d.ahb,c:"#b0306a",lo:0,hi:40},
  ahs:{n:"ソーラー積算",u:"Ah",g:d=>d.ahs,c:"#2e7d32",lo:0,hi:20},
  ib:{n:"電池電流",u:"A",g:d=>d.ib,c:"#6a1b9a",lo:-20,hi:40},
 },
 html(){
  const opt=(sel)=>Object.entries(this.CH).map(([k,c])=>`<option value="${k}"${k===sel?" selected":""}>${c.n} [${c.u}]</option>`).join("");
  return `<section class="card" id="mon-meter"><div class="mt">
   <div class="mt-vals" id="mt-vals"></div>
   <div class="mt-g"><div class="mt-ctl">
    <label>左軸 <select id="mt-l">${opt(this.L)}</select></label><label><input type="checkbox" id="mt-lh"> 隠す</label>
    <label>右軸 <select id="mt-r">${opt(this.R)}</select></label><label><input type="checkbox" id="mt-rh"> 隠す</label>
    <label>表示幅 <select id="mt-span"><option value="1">1H</option><option value="2">2H</option><option value="3">3H</option><option value="5">5H</option><option value="0">全部</option></select></label>
    <label>記録間隔 <select id="mt-int"><option value="1">1 秒</option><option value="5">5 秒</option></select></label></div>
    <canvas id="mt-cv"></canvas></div></div>
   <div class="mt-lap">
    <div><span>Lap</span><b id="mt-lapn">1</b><b id="mt-lapt">―</b></div>
    <div><span>Lap [Wh]</span><b id="mt-lapwh">―</b></div>
    <div><span>今の Lap</span><b id="mt-lapc">0:00</b><button class="btn" id="mt-reset">Reset</button></div>
    <div><span>Lap 距離</span><select id="mt-lapkm"><option value="5">5 km</option><option value="10" selected>10 km</option><option value="20">20 km</option></select></div>
    <div><span>Log Time</span><b id="mt-log">―</b></div>
    <div><span>温度 [℃]</span><b id="mt-temp">―</b></div>
   </div></section>`; },
 bind(){
  const $=(id)=>document.getElementById(id), redraw=()=>this.draw();
  $("mt-l").onchange=e=>{ this.L=e.target.value; redraw(); }; $("mt-r").onchange=e=>{ this.R=e.target.value; redraw(); };
  $("mt-lh").onchange=e=>{ this.hideL=e.target.checked; redraw(); }; $("mt-rh").onchange=e=>{ this.hideR=e.target.checked; redraw(); };
  $("mt-span").onchange=e=>{ this.span=+e.target.value; redraw(); }; $("mt-int").onchange=e=>{ this.int=+e.target.value; };
  $("mt-lapkm").onchange=e=>{ this.lapKm=+e.target.value; };
  $("mt-reset").onclick=()=>{ if(this.last) this.closeLap(this.last); this.ui(); };
 },
 /* 1 秒ごとの値を受ける */
 push(d){
  if(!d||!Number.isFinite(d.abs)) return;
  if(this.abs0==null||d.abs<this.abs0) this.abs0=d.abs;
  const p=this.last;
  if(!this.lap) this.lap={abs:d.abs,km:d.km,wh:0};
  else if(p&&d.abs>p.abs){ const dt=Math.min(d.abs-p.abs,0.25); this.lap.wh+=(p.pm||0)*dt; }   // モーターの Wh (前の値 × 経過。途切れは 15 分まで)
  this.last=d;
  if(d.km-this.lap.km>=this.lapKm) this.closeLap(d);
  const L=this.buf[this.buf.length-1];
  if(!L||d.abs-L.abs>=this.int/3600*0.999||d.abs<L.abs){ this.buf.push({abs:d.abs,pm:d.pm,ps:d.ps,vl:d.vl,v:d.v,ahb:d.ahb,ahs:d.ahs,ib:d.ib}); if(this.buf.length>this.MAX) this.buf.splice(0,this.buf.length-this.MAX); }
  if(document.body.classList.contains("mon-meter")){ this.ui(); this.draw(); }
 },
 closeLap(d){ this.lastLap={t:d.abs-this.lap.abs,wh:this.lap.wh}; this.lapN++; this.lap={abs:d.abs,km:d.km,wh:0}; },
 hms(h,sec){ if(!Number.isFinite(h)) return "―"; const s=Math.max(0,Math.round(h*3600)), H=Math.floor(s/3600), M=Math.floor(s%3600/60), S=s%60;
  return sec? (typeof I18N!=="undefined"&&I18N.en()? `${H}:${String(M).padStart(2,"0")}:${String(S).padStart(2,"0")}` : `${String(H).padStart(2,"0")}時間${String(M).padStart(2,"0")}分${String(S).padStart(2,"0")}秒`) : H? `${H}:${String(M).padStart(2,"0")}:${String(S).padStart(2,"0")}` : `${M}:${String(S).padStart(2,"0")}`; },
 ui(){
  const d=this.last, el=document.getElementById("mt-vals"); if(!el) return;
  const f=(x,dg)=>Number.isFinite(x)? x.toFixed(dg) : "―", V=d&&d.vl>1? d.vl : NaN;
  const rows=[["Line[V]",d&&f(d.vl,1),"l"],["SO[A]",d&&f(d.ps/V,2)],["BA[A]",d&&f(d.ib,2)],["MO[A]",d&&f(d.pm/V,2)],["SO[W]",d&&f(d.ps,0)],
   ["SO[Ah]",d&&f(d.ahs,2),"s"],["Bz[Ah]",d&&f(d.ahb,2),"b"],["MO[W]",d&&f(d.pm,0)],["BA[Wh]",d&&f(d.whb,0)],["V[km/h]",d&&f(d.v,0)]];
  el.innerHTML=rows.map(([k,v,c])=>`<div class="mt-r ${c||""}"><span>${k}</span><b>${v||"―"}</b></div>`).join("");
  const set=(id,t)=>{ const e=document.getElementById(id); if(e) e.textContent=t; };
  set("mt-lapn",this.lapN); set("mt-lapt",this.lastLap? this.hms(this.lastLap.t) : "―"); set("mt-lapwh",this.lastLap? f(this.lastLap.wh,1) : "―");
  set("mt-lapc",d&&this.lap? this.hms(d.abs-this.lap.abs) : "0:00"); set("mt-log",d? this.hms(d.abs-this.abs0,true) : "―"); set("mt-temp",d? f(d.tb,0) : "―");
 },
 /* グラフ: 横 = 時間 (右端が最新)。左軸・右軸は項目ごとの既定の範囲 (はみ出したら広げる) */
 draw(){
  const cv=document.getElementById("mt-cv"); if(!cv||!cv.offsetWidth) return;
  const r=cv.getBoundingClientRect(), dpr=Math.min(devicePixelRatio||1,2); cv.width=Math.max(10,r.width*dpr); cv.height=Math.max(10,r.height*dpr);
  const c=cv.getContext("2d"); c.setTransform(dpr,0,0,dpr,0,0); const W=r.width, H=r.height, PL=52, PR=52, PT=10, PB=24, w=W-PL-PR, h=H-PT-PB;
  c.fillStyle="#ffffff"; c.fillRect(0,0,W,H);
  const B=this.buf, t1= B.length? B[B.length-1].abs : 0, a0=this.abs0??t1;
  const span= this.span? this.span : Math.max(1,Math.ceil((t1-a0)*4)/4), tA= this.span&&t1-a0>span? t1-span : a0, X=(t)=>PL+(t-tA)/span*w;   // 始めのうちは左端から伸びる
  const vis=B.filter(p=>p.abs>=tA);
  const rng=(k)=>{ const C=this.CH[k]; let lo=C.lo, hi=C.hi; for(const p of vis){ const v=p[k]; if(Number.isFinite(v)){ if(v<lo) lo=v; if(v>hi) hi=v; } }
   const st=[1,2,5].flatMap(m=>[m,m*10,m*100,m*1000]).sort((x,y)=>x-y).find(s=>(hi-lo)/s<=8)||1000; return [Math.floor(lo/st)*st,Math.ceil(hi/st)*st,st]; };
  const [l0,l1,ls]=rng(this.L), [r0,r1,rs]=rng(this.R), YL=(v)=>PT+h-(v-l0)/(l1-l0)*h, YR=(v)=>PT+h-(v-r0)/(r1-r0)*h;
  c.font="12px 'Chakra Petch',sans-serif"; c.lineWidth=1;
  for(let v=l0;v<=l1+1e-9;v+=ls){ const y=YL(v); c.strokeStyle="#c9c9c9"; c.beginPath(); c.moveTo(PL,y); c.lineTo(PL+w,y); c.stroke(); c.fillStyle=this.CH[this.L].c; c.textAlign="right"; if(!this.hideL) c.fillText(+v.toFixed(2),PL-5,y+4); }
  if(!this.hideR) for(let v=r0;v<=r1+1e-9;v+=rs){ c.fillStyle=this.CH[this.R].c; c.textAlign="left"; c.fillText(+v.toFixed(2),PL+w+5,YR(v)+4); }
  const tick=[1/12,0.25,0.5,1].find(s=>span/s<=8)||1;   // 5 分・15 分・30 分・1 時間
  c.textAlign="center"; c.fillStyle="#333";
  for(let t=Math.ceil((tA-a0)/tick)*tick+a0;t<=tA+span+1e-9;t+=tick){ const x=X(t); c.strokeStyle="#c9c9c9"; c.beginPath(); c.moveTo(x,PT); c.lineTo(x,PT+h); c.stroke(); const m=Math.round((t-a0)*60); c.fillText(m%60? `${m%60}` : `${m/60}H`,x,H-7); }
  c.strokeStyle="#666"; c.strokeRect(PL,PT,w,h);
  const line=(k,Y,col)=>{ c.strokeStyle=col; c.lineWidth=1.6; c.beginPath(); let st=false, pa=null;
   for(const p of vis){ const v=p[k]; if(!Number.isFinite(v)){ st=false; continue; } const x=X(p.abs), y=Y(v); if(!st||(pa!=null&&p.abs-pa>0.1)) c.moveTo(x,y); else c.lineTo(x,y); st=true; pa=p.abs; } c.stroke(); };
  c.save(); c.beginPath(); c.rect(PL,PT,w,h); c.clip();
  if(!this.hideL) line(this.L,YL,this.CH[this.L].c); if(!this.hideR) line(this.R,YR,this.CH[this.R].c);
  c.restore();
  c.font="13px 'Chakra Petch',sans-serif"; c.textAlign="left"; if(!this.hideL){ c.fillStyle=this.CH[this.L].c; c.fillText(`${this.CH[this.L].n}[${this.CH[this.L].u}]`,PL+6,PT+15); }
  c.textAlign="right"; if(!this.hideR){ c.fillStyle=this.CH[this.R].c; c.fillText(`${this.CH[this.R].n}[${this.CH[this.R].u}]`,PL+w-6,PT+15); }
 },
};
