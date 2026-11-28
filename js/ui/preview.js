"use strict";
/* ============ ルートの予習 (入門から開く) ============
 ルートを CS ごとの 10 区間に分け、区間ごとに: 距離・町・制限速度の変わり目・信号・キャトルグリッド (放牧地)・
 工事・未舗装・冠水路・踏切・追い越し車線・登り下り・横風の強い所 (2025 年の大会期間の日中の平均) を見せる。
 気になる所を押すと、その少し手前から走れる (入門の「予習走行」: 等倍・採点なし)。 */
const Preview={
 sel:0, _secs:null,
 secs(){ if(this._secs) return this._secs;
  const pts=[{km:0,name:"Darwin"}].concat(RP_CS.map(c=>({km:c.km,name:c.name}))).concat([{km:TOTAL_KM,name:"Adelaide"}]), out=[];
  for(let i=0;i<pts.length-1;i++) out.push(this.info(pts[i].km,pts[i+1].km,pts[i].name,pts[i+1].name,i));
  return this._secs=out; },
 /* 2025 年の大会期間 (Day1〜6) の 9〜16 時の平均の横風 [m/s] (地上 10 m) */
 cross(km){ if(typeof RealWx==="undefined"||!RealWx.ok) return null; const p=profileAt(km); let s=0,n=0;
  for(let d=0;d<6;d++) for(let h=9;h<=16;h++){ const w=RealWx.wind(p.lat,p.lon,RealWx.DOY0+d,h); if(!w) continue; s+=w.ws*Math.abs(Math.sin(w.toward-p.bearing)); n++; }
  return n? s/n : null; },
 info(a,b,na,nb,i){
  const ev=RN_EVENTS.filter(e=>e.km>=a&&e.km<b), cnt=k=>ev.filter(e=>e.k===k).length, notes=[];
  const towns=(typeof OsmRoute!=="undefined"? OsmRoute.towns : []).filter(t=>t.km0>=a-0.5&&t.km0<b).map(t=>t.name);
  // 制限速度が大きく下がる所 (町の入口など)
  let prev=speedLimitAt(a+0.01);
  for(const e of ev.filter(e=>e.k==="limit")){ const v=speedLimitAt(e.km+0.01); if(v<=prev-30&&v<=80) notes.push({km:e.km,k:"limit",t:`制限速度 ${prev} → ${v} km/h`}); prev=v; }
  for(const e of ev) if(e.k==="signal"||e.k==="roundabout"||e.k==="pedlight") notes.push({km:e.km,k:e.k,t:(e.k==="signal"?"信号: ":e.k==="roundabout"?"ラウンドアバウト: ":"押しボタン式の横断歩道: ")+String(e.t||"").replace(/Traffic Light.*$/i,"").trim()});
  for(const e of ev) if(e.k==="works"||e.k==="gravel"||e.k==="rail") notes.push({km:e.km,k:e.k,t:(e.k==="works"?"工事区間":e.k==="gravel"?"未舗装 (砂利)":"踏切・鉄道")});
  // キャトルグリッドが続く所 = 放牧地 (牛・カンガルーに注意)
  const grids=ev.filter(e=>e.k==="grid").map(e=>e.km);
  if(grids.length) notes.push({km:grids[0],k:"grid",t:`放牧地 (キャトルグリッド ${grids.length} か所・最初の所)。動物に注意`});
  // 登り下り (1 km ごと)
  let climb=0, steep={g:0,km:a}, emin=1e9, emax=-1e9;
  if(typeof Geo!=="undefined"&&Geo.ok) for(let k=a;k<b;k+=1){ const e0=Geo.elev(k), e1=Geo.elev(Math.min(b,k+1)); if(e1>e0) climb+=e1-e0; emin=Math.min(emin,e0); emax=Math.max(emax,e0); const g=(e1-e0)/10; if(g>steep.g) steep={g,km:k}; }
  if(steep.g>=1.5) notes.push({km:steep.km,k:"hill",t:`いちばんきつい登り 約 ${steep.g.toFixed(1)} %`});
  // 横風 (25 km ごと)
  let wmax={w:0,km:a};
  for(let k=a+5;k<b;k+=25){ const w=this.cross(k); if(w!=null&&w>wmax.w) wmax={w,km:k}; }
  if(wmax.w>=4) notes.push({km:wmax.km,k:"wind",t:`横風が強い (2025 年の日中の平均 ${wmax.w.toFixed(1)} m/s)`});
  notes.sort((x,y)=>x.km-y.km);
  return {i,a,b,name:`${na} → ${nb}`,len:b-a,towns,notes,cnt:{signal:cnt("signal"),grid:grids.length,floodway:cnt("floodway"),otl:cnt("otl_start"),services:cnt("services"),works:cnt("works"),gravel:cnt("gravel")},
   climb:Math.round(climb),emin:Math.round(emin),emax:Math.round(emax),wind:wmax.w,lim:[...new Set(ev.filter(e=>e.k==="limit").map(e=>speedLimitAt(e.km+0.01)))].sort((x,y)=>y-x)};
 },
 open(){
  let el=document.getElementById("pv");
  if(!el){ el=document.createElement("div"); el.id="pv"; el.style.cssText="position:fixed;inset:0;z-index:70;background:rgba(8,9,11,.96);color:#e7e5e4;display:flex;flex-direction:column;font-size:14px";
   el.innerHTML=`<div style="display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid #2a2d31"><b style="font-size:17px">ルートの予習</b><span style="opacity:.6">Darwin → Adelaide 3,027 km・CS ごとの区間。気になる所を押すと、その手前から走れる (等倍・採点なし)</span><span style="flex:1"></span><button type="button" class="btn" id="pv-x">閉じる</button></div>
    <div class="pv-main"><div class="pv-scroll pv-left" id="pv-list"></div>
    <div class="pv-scroll pv-right"><canvas id="pv-map" style="width:100%;height:220px;display:block;flex:none"></canvas><div id="pv-body" style="padding:12px 18px"></div></div></div>`;
   document.body.appendChild(el); el.querySelector("#pv-x").onclick=()=>this.close(); }
  el.style.display="flex"; this.render(); },
 close(){ const el=document.getElementById("pv"); if(el) el.style.display="none"; },
 render(){
  const S=this.secs(), L=document.getElementById("pv-list");
  L.innerHTML=S.map(s=>`<div data-i="${s.i}" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid #1f2226;${s.i===this.sel?"background:#1d2430;border-left:3px solid #f5b81c":""}"><div style="font-weight:600">${s.i+1}. ${s.name}</div><div style="opacity:.6;font-size:12px">${s.a.toFixed(0)}–${s.b.toFixed(0)} km・${s.len.toFixed(0)} km</div></div>`).join("");
  L.querySelectorAll("[data-i]").forEach(d=>d.onclick=()=>{ this.sel=+d.dataset.i; this.render(); });
  const s=S[this.sel], B=document.getElementById("pv-body"), ic={limit:"🚸",signal:"🚦",roundabout:"⭕",pedlight:"🚶",works:"🚧",gravel:"🪨",rail:"🚆",grid:"🐄",hill:"⛰",wind:"💨"};
  const row=(k,v)=>`<tr><td style="opacity:.6;padding:2px 14px 2px 0;white-space:nowrap">${k}</td><td>${v}</td></tr>`;
  B.innerHTML=`<h3 style="margin:0 0 8px;font-size:18px">${s.i+1}. ${s.name} <span style="opacity:.6;font-size:13px">${s.a.toFixed(1)}–${s.b.toFixed(1)} km</span></h3>
   <table style="border-collapse:collapse;margin-bottom:10px">${row("距離",`${s.len.toFixed(0)} km`)}${row("町 (実際の形の道)",s.towns.length?s.towns.join("・"):"なし")}
   ${row("制限速度",s.lim.length?s.lim.join(" / ")+" km/h":"—")}${row("信号",s.cnt.signal+" か所")}${row("キャトルグリッド",s.cnt.grid+" か所 (放牧地: 牛・カンガルー)")}
   ${row("冠水路 (floodway)",s.cnt.floodway+" か所")}${row("追い越し車線",s.cnt.otl+" か所")}${row("給油所・ロードハウス",s.cnt.services+" か所")}
   ${row("工事・未舗装",`${s.cnt.works} / ${s.cnt.gravel} か所`)}${row("標高",isFinite(s.emin)?`${s.emin}–${s.emax} m (登り 合計 ${s.climb} m)`:"—")}
   ${row("横風",s.wind?`いちばん強い所で平均 ${s.wind.toFixed(1)} m/s (2025 年の日中)`:"—")}</table>
   <div style="font-weight:600;margin:6px 0">注意する所 (押すとその手前から走る)</div>
   ${s.notes.length? s.notes.map((n,j)=>`<div data-n="${j}" style="display:flex;gap:10px;align-items:center;padding:6px 8px;border:1px solid #2a2d31;margin-bottom:4px;cursor:pointer"><span style="width:22px;text-align:center">${ic[n.k]||"•"}</span><span style="width:76px;opacity:.7;font-variant-numeric:tabular-nums">${n.km.toFixed(1)} km</span><span style="flex:1">${n.t}</span><span style="opacity:.6">走る ›</span></div>`).join("") : '<div style="opacity:.6">特になし</div>'}
   <div style="margin-top:10px"><button type="button" class="btn" id="pv-run0">この区間の始めから走る</button></div>`;
  B.querySelectorAll("[data-n]").forEach(d=>d.onclick=()=>{ const n=s.notes[+d.dataset.n]; this.run(Math.max(s.a+0.2,n.km-(n.k==="signal"||n.k==="pedlight"||n.k==="roundabout"?0.8:2)),n.t); });
  document.getElementById("pv-run0").onclick=()=>this.run(s.a+(s.i?0.6:0.05),s.name);
  this.map(s);
 },
 map(s){
  const cv=document.getElementById("pv-map"); if(!cv) return; const r=cv.getBoundingClientRect(), dpr=Math.min(2,devicePixelRatio||1);
  cv.width=Math.max(10,r.width*dpr); cv.height=r.height*dpr; const c=cv.getContext("2d"); c.setTransform(dpr,0,0,dpr,0,0); c.clearRect(0,0,r.width,r.height);
  const lon0=112,lon1=155,lat0=-10,lat1=-40, k=Math.min(r.width/(lon1-lon0),r.height/(lat0-lat1))*0.95, ox=(r.width-(lon1-lon0)*k)/2, oy=(r.height-(lat0-lat1)*k)/2;
  const X=lon=>ox+(lon-lon0)*k, Y=lat=>oy+(lat0-lat)*k;
  c.fillStyle="#1a1c20"; c.strokeStyle="#3a3f45";
  if(typeof AUS_RINGS!=="undefined") for(const R of AUS_RINGS){ c.beginPath(); for(let j=0;j<R.length;j+=2) j? c.lineTo(X(R[j]),Y(R[j+1])) : c.moveTo(X(R[j]),Y(R[j+1])); c.closePath(); c.fill(); c.stroke(); }
  const line=(a,b,col,w)=>{ c.strokeStyle=col; c.lineWidth=w; c.beginPath(); for(let km=a;km<=b;km+=10){ const p=profileAt(Math.min(km,b)); km===a? c.moveTo(X(p.lon),Y(p.lat)) : c.lineTo(X(p.lon),Y(p.lat)); } c.stroke(); };
  line(0,TOTAL_KM,"#5b6169",2); line(s.a,s.b,"#f5b81c",4);
  c.fillStyle="#e7e5e4"; c.font="11px sans-serif";
  for(const q of RP_CS){ const p=profileAt(q.km); c.beginPath(); c.arc(X(p.lon),Y(p.lat),3,0,7); c.fill(); }
  for(const km of [s.a,s.b]){ const p=profileAt(km); c.fillStyle="#f5b81c"; c.beginPath(); c.arc(X(p.lon),Y(p.lat),5,0,7); c.fill(); }
 },
 run(km,what){ this.close(); if(typeof Lesson==="undefined") return; Lesson.freeRun(km,what); },
};
