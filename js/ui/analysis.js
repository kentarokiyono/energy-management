"use strict";
/* ============ 走行の分析画面 ============
 走行ログ (今回の走行 / 読み込んだ CSV) を、斜め上から見た立体地図と距離軸のグラフで見る。
 ・地図: ルートに沿った帯 (高さ = 選んだ指標、または標高) を指標で色分け。ドラッグで回転・ホイールで拡大
 ・グラフ: なぞると地図に地点、ドラッグで区間を選ぶ (ダブルクリックで解除)、ホイールで拡大
 ・右の欄: 区間の集計・比較する走行との差・ドライバーごとの特性 */
const Ana={
 runs:[], cur:0, cmp:-1, layout:"A", metric:"v", mapMode:"band", sel:null, cursor:null, xr:null, built:false,
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
  const d=new Date(); return this.prep({name:`今回の走行 (${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")} 時点)`,rows,live:true});
 },
 parseCSV(text,name){
  text=text.replace(/^﻿/,""); const lines=[]; let row=[], f="", q=false;
  for(let i=0;i<text.length;i++){ const c=text[i];
   if(q){ if(c==='"'){ if(text[i+1]==='"'){ f+='"'; i++; } else q=false; } else f+=c; }
   else if(c==='"') q=true; else if(c===","){ row.push(f); f=""; } else if(c==="\n"){ row.push(f.replace(/\r$/,"")); lines.push(row); row=[]; f=""; } else f+=c; }
  if(f||row.length){ row.push(f); lines.push(row); }
  const head=lines.shift()||[], idx={}; head.forEach((c,i)=>{ const k=this.COLMAP[c.trim()]; if(k) idx[k]=i; });
  if(idx.km==null||idx.v==null) throw new Error("km と 速度 の列がありません");
  const TXT={st:1,drv:1,wx:1,memo:1};
  const rows=lines.filter(l=>l.length>=head.length-1).map(l=>{ const o={}; for(const k in idx){ const v=l[idx[k]]; o[k]=TXT[k]? (v||"") : (v===""||v==null? NaN : +v); }
   o.abs= Number.isFinite(o.eh)? o.eh+8 : NaN; return o; }).filter(o=>Number.isFinite(o.km));
  if(!rows.length) throw new Error("データ行がありません");
  return this.prep({name,rows});
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
   <span class="lb">走行</span><select id="ana-run"></select>
   <span class="lb">比較</span><select id="ana-cmp"></select>
   <label class="btn ana-sm" title="CSV を読み込む (複数可)">${ic("upload")}CSV 読み込み<input type="file" id="ana-file" accept=".csv,text/csv" multiple hidden></label>
   <span class="lb">表示</span><div class="seg" id="ana-lay"><button data-v="A">地図</button><button data-v="B">グラフ</button></div>
   <span class="lb">地図</span><div class="seg" id="ana-mode"><button data-v="band">帯</button><button data-v="elev">標高</button></div>
   <span class="lb">色</span><div class="seg" id="ana-met">${Object.entries(this.METRICS).map(([k,m])=>`<button data-v="${k}">${m.label}</button>`).join("")}</div>
   <button class="btn ana-sm" id="ana-all" title="グラフの範囲と区間をリセット">全体</button>
   <button class="btn ana-sm ana-x" onclick="Ana.close()">${ic("x")}閉じる</button></div>
  <div class="ana-body" id="ana-body"><div class="ana-map" id="ana-map"><div class="ana-hint">ドラッグで回転 ・ ホイール / 2 本指で拡大 ・ クリックで地点</div><div class="ana-leg" id="ana-leg"></div><div class="ana-tag" id="ana-tag"></div></div>
   <div class="ana-pane" id="ana-pane"></div><div class="ana-charts" id="ana-charts"><canvas id="ana-cv"></canvas><canvas id="ana-cv2"></canvas></div>
   <div class="ana-empty" id="ana-empty">走行ログがありません。レースモードで走るか、CSV を読み込んでください。</div></div>`;
  document.body.appendChild(el);
  const seg=(id,key,cb)=>document.getElementById(id).addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b) return; this[key]=b.dataset.v; cb&&cb(); this.render(); });
  seg("ana-lay","layout"); seg("ana-mode","mapMode",()=>this.map&&(this.map.dirty=true)); seg("ana-met","metric",()=>this.map&&(this.map.dirty=true));
  document.getElementById("ana-run").onchange=e=>{ this.cur=+e.target.value; this.sel=null; this.xr=null; this.map&&(this.map.dirty=true); this.render(); };
  document.getElementById("ana-cmp").onchange=e=>{ this.cmp=+e.target.value; this.render(); };
  document.getElementById("ana-all").onclick=()=>{ this.sel=null; this.xr=null; this.map&&(this.map.dirty=true); this.render(); };
  document.getElementById("ana-file").onchange=async e=>{ for(const f of e.target.files){ try{ this.runs.push(this.parseCSV(await f.text(),f.name)); this.cur=this.runs.length-1; }catch(err){ toast("読み込めません: "+escHtml(f.name)+" ― "+escHtml(err.message),"#ef4444"); } }
   e.target.value=""; this.sel=null; this.xr=null; this.map&&(this.map.dirty=true); this.render(); };
  addEventListener("resize",()=>{ if(this.isOpen()) this.render(); });
  addEventListener("keydown",e=>{ if(this.isOpen()&&e.key==="Escape"){ e.stopPropagation(); this.close(); } },true);
  this.initCharts();
 },
 isOpen(){ const e=document.getElementById("ana"); return !!e&&e.classList.contains("on"); },
 open(){
  this.build(); const live=this.fromRunLog();
  this.runs=this.runs.filter(r=>!r.live); if(live){ this.runs.unshift(live); this.cur=0; }
  if(this.cur>=this.runs.length) this.cur=0;
  document.getElementById("ana").classList.add("on"); this.wasPaused=typeof paused!=="undefined"&&paused;
  this.map&&(this.map.dirty=true); this.render();
 },
 close(){ const e=document.getElementById("ana"); if(e) e.classList.remove("on"); },
 run(){ return this.runs[this.cur]; }, cmpRun(){ return this.cmp>=0&&this.cmp!==this.cur? this.runs[this.cmp] : null; },
 render(){
  const run=this.run(), body=document.getElementById("ana-body");
  body.className="ana-body "+this.layout; document.getElementById("ana-empty").style.display=run?"none":"flex";
  for(const [id,v] of [["ana-lay",this.layout],["ana-mode",this.mapMode],["ana-met",this.metric]]) document.querySelectorAll(`#${id} button`).forEach(b=>b.classList.toggle("on",b.dataset.v===v));
  const opt=(sel,list,v,none)=>{ sel.innerHTML=(none?`<option value="-1">なし</option>`:"")+list.map((r,i)=>`<option value="${i}">${escHtml(r.name)}</option>`).join(""); sel.value=String(v); };
  opt(document.getElementById("ana-run"),this.runs,this.cur,false); opt(document.getElementById("ana-cmp"),this.runs,this.cmp,true);
  if(!run) return;
  if(!this.xr) this.xr=[0,Math.max(10,run.kmMax)];
  this.renderMap(); this.drawCharts(); this.renderPane();
 },
 /* ---------- 右の欄 ---------- */
 renderPane(){
  const run=this.run(), cmp=this.cmpRun(), [a,b]=this.sel||[0,run.kmMax], S=this.stats(run,a,b), f=(x,d)=>Number.isFinite(x)?x.toFixed(d):"―";
  const kv=(k,v,u)=>`<div class="kv"><span>${k}</span><span>${v}<span class="u">${u||""}</span></span></div>`;
  let h=`<div class="ph">${ic("route")}${this.sel?`区間 ${a.toFixed(1)}–${b.toFixed(1)} km`:"全行程"}</div>
   ${kv("距離",f(S.dist,1),"km")}${kv("走行時間",f(S.t,2),"h")}${kv("平均速度",f(S.avg,1),"km/h")}${kv("電費",f(S.whkm,1),"Wh/km")}
   ${kv("発電",f(S.gen/1000,2),"kWh")}${kv("消費",f(S.use/1000,2),"kWh")}${kv("回生で回収",f(S.rg,0),"Wh")}${kv("SOC 変化",(S.dsoc>0?"+":"")+f(S.dsoc,1),"%")}`;
  if(cmp){ const C=this.stats(cmp,a,b), dt=(S.t-C.t)*60;
   h+=`<div class="ph" style="margin-top:12px">${ic("users")}比較: ${escHtml(cmp.name)}</div>${kv("走行時間の差",(dt>0?"+":"")+f(dt,1),"分")}${kv("平均速度",f(C.avg,1),"km/h")}${kv("電費",f(C.whkm,1),"Wh/km")}`; }
  const ds=run.drivers.filter(d=>d!=="―");
  if(ds.length){ const D=ds.map(d=>({d,s:this.stats(run,a,b,d)})).filter(x=>x.s.dist>0.5);
   if(D.length){ const best=(k,low)=>{ const v=D.map(x=>x.s[k]).filter(Number.isFinite); return v.length>1? (low?Math.min(...v):Math.max(...v)) : null; };
    const row=(lab,k,d,low,u)=>`<span>${lab}</span>`+D.map(x=>{ const v=x.s[k], bb=best(k,low); return `<b class="${bb!=null&&v===bb?"good":""}">${f(v,d)}${u||""}</b>`; }).join("");
    h+=`<div class="ph" style="margin-top:12px">${ic("users")}ドライバー${this.sel?" (区間)":" (全行程)"}</div>
    <div class="ana-drv" style="grid-template-columns:1fr repeat(${D.length},64px)"><span></span>${D.map(x=>`<span class="lb">${escHtml(x.d.replace(/^ドライバー/,""))}</span>`).join("")}
    ${row("担当距離 km","dist",0)}${row("平均速度","avg",1)}${row("電費 Wh/km","whkm",1,true)}${row("70–85 km/h の電費","whkmBand",1,true)}
    ${row("速度のばらつき","sd",2,true)}${row("スロットル操作 /100km","thrOps",0,true)}${row("急な加減速 /100km","acc",1,true)}${row("登りの平均電力 W","upW",0,true)}
    ${row("物理ブレーキ使用 %","brk",1,true)}${row("回生使用 %","rgn",1)}${row("回生で回収 Wh","rg",0)}</div>
    <div class="ana-note">速度のばらつき = 記録点ごとの速度変化の大きさ。70–85 km/h の電費で比べると、速度の違いの影響を除いて比べられる。</div>`; } }
  document.getElementById("ana-pane").innerHTML=(this.layout==="B"?`<div id="ana-mini"></div>`:"")+h;
  if(this.layout==="B"&&this.map){ const mini=document.getElementById("ana-mini"); mini.appendChild(this.map.r.domElement); this.map.resize(); this.map.draw(); }
 },
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
    const run=self.run(); if(!run) return; const m=self.METRICS[self.metric], pos=[], col=[], top=[];
    const sel=self.sel;
    for(let k=1;k<run.bins.length&&k<P.length;k++){ const a=run.bins[k-1], b=run.bins[k]; if(!a||!b) continue;
     const [ax,az]=P[k-1], [bx,bz]=P[k], ha=this.H(a), hb=this.H(b), ca=self.color(m,m.f(a)), cb=self.color(m,m.f(b)), dim=sel&&(k<sel[0]||k>sel[1])?0.35:1;
     pos.push(ax,0.1,az, bx,0.1,bz, bx,hb,bz,  ax,0.1,az, bx,hb,bz, ax,ha,az);
     for(const c of [ca,cb,cb,ca,cb,ca]) col.push(c[0]*dim,c[1]*dim,c[2]*dim);
     top.push(new THREE.Vector3(ax,ha+0.05,az)); }
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
    r.render(sc,cam); self.placeTag();
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
  const up=e=>{ const p=pts.get(e.pointerId); pts.delete(e.pointerId); if(p&&!moved){ const rc=el.getBoundingClientRect(), k=M.pick(e.clientX-rc.left,e.clientY-rc.top); if(k!=null){ self.lock=true; self.setCursor(k,true); } else { self.lock=false; } } };
  el.addEventListener("pointerup",up); el.addEventListener("pointercancel",e=>pts.delete(e.pointerId));
  el.addEventListener("contextmenu",e=>e.preventDefault());
  el.addEventListener("wheel",e=>{ e.preventDefault(); view.d=clamp(view.d*Math.exp(e.deltaY*0.001),40,1500); M.draw(); },{passive:false});
  return M;
 },
 setCursor(k,fromMap){ this.cursor=k; if(this.map) this.map.draw(); this.drawCursor(); },
 placeTag(){
  const tag=document.getElementById("ana-tag"), run=this.run(), k=this.cursor;
  if(!tag) return; if(!run||k==null||!this.map||this.layout!=="A"){ tag.style.display="none"; return; }
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
   let na=k-(k-a)*f, nb=k+(b-k)*f; if(nb-na<2){ const c=(na+nb)/2; na=c-1; nb=c+1; } this.xr=[Math.max(0,na),Math.min(run.kmMax,nb)]; this.drawCharts(); },{passive:false});
 },
 drawCharts(){
  const run=this.run(), cmp=this.cmpRun(), host=this.layout==="A"? document.getElementById("ana-charts") : document.getElementById("ana-map");
  const cv=document.getElementById("ana-cv"), cv2=document.getElementById("ana-cv2");
  if(cv.parentNode!==host){ host.appendChild(cv); host.appendChild(cv2); }
  const dpr=Math.min(devicePixelRatio,2), W=host.clientWidth, H=host.clientHeight; for(const c of [cv,cv2]){ c.width=W*dpr; c.height=H*dpr; c.style.width=W+"px"; c.style.height=H+"px"; }
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
   c.save(); c.beginPath(); c.rect(L,y0,PW,rh); c.restore(); });
  c.fillStyle="#8b9097"; const span=x1-x0, step=[1,2,5,10,20,50,100,200,500].find(s=>span/s<=10)||500;
  for(let k=Math.ceil(x0/step)*step;k<=x1;k+=step) c.fillText(k+" km",X(k)-12,H-10);
  for(const q of RP_CS) if(q.km>=x0&&q.km<=x1){ c.fillStyle="#f26b1d"; c.fillRect(X(q.km)-3,H-26,6,6); }
  this.drawCursor();
 },
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
