"use strict";
/* ============ ルート地図 (HUD 右上) と 他チームの位置一覧 (地図をタップ) ============
 投影: 正距円筒 (経度に cos25° を掛ける)。自車位置は毎フレーム profileAt(km) で更新 */
const MapUI={
 C:Math.cos(25*Math.PI/180), STEP:4, built:false, pts:null, lastKm:-1, lastIdx:-1, passedN:-1, aheadKm:-1e9, ovT:0,
 VIEW:{ small:{lon0:112.5,lon1:154.5,lat0:-9.5,lat1:-44.5,W:300}, big:{lon0:127.3,lon1:142.2,lat0:-11.2,lat1:-36.0,W:440} },
 proj(v,lon,lat){ const k=v.W/((v.lon1-v.lon0)*this.C); return [(lon-v.lon0)*this.C*k,(v.lat0-lat)*k]; },
 H(v){ return this.proj(v,v.lon0,v.lat1)[1]; },
 f(x){ return x.toFixed(1); },
 /* 海岸線・経緯線・ルート・CS・地名 */
 base(v,big){
  const W=v.W, H=this.H(v), s=[];
  s.push(`<g stroke="#1f2226" stroke-width="1">`);
  for(let lon=Math.ceil(v.lon0/(big?2:10))*(big?2:10);lon<v.lon1;lon+=big?2:10){ const x=this.proj(v,lon,v.lat0)[0]; s.push(`<line x1="${this.f(x)}" y1="0" x2="${this.f(x)}" y2="${this.f(H)}"/>`); }
  for(let lat=Math.ceil(v.lat1/(big?2:10))*(big?2:10);lat<v.lat0;lat+=big?2:10){ const y=this.proj(v,v.lon0,lat)[1]; s.push(`<line x1="0" y1="${this.f(y)}" x2="${W}" y2="${this.f(y)}"/>`); }
  s.push(`</g>`);
  if(typeof AUS_RINGS!=="undefined") for(const r of AUS_RINGS){ let d=""; for(let i=0;i<r.length;i+=2){ const [x,y]=this.proj(v,r[i],r[i+1]); d+=(i?"L":"M")+this.f(x)+","+this.f(y); } s.push(`<path d="${d}Z" fill="#1c1f23" stroke="#4a4f56" stroke-width="1"/>`); }
  const all=this.pts.map(p=>this.proj(v,p[0],p[1]).map(this.f).join(",")).join(" ");
  s.push(`<polyline points="${all}" fill="none" stroke="#6b7077" stroke-width="${big?1.8:1.6}" stroke-dasharray="3 3"/>`);
  s.push(`<polyline class="m-done" points="" fill="none" stroke="#f26b1d" stroke-width="${big?3:2.4}" stroke-linejoin="round"/>`);
  for(const c of (typeof RP_CS!=="undefined"?RP_CS:[])){ const q=profileAt(c.km), [x,y]=this.proj(v,q.lon,q.lat), r=big?4.5:3.5;
   s.push(`<rect class="m-cs" data-km="${c.km}" x="${this.f(x-r)}" y="${this.f(y-r)}" width="${2*r}" height="${2*r}" fill="#15171a" stroke="#f26b1d" stroke-width="1.2"/>`);
   s.push(`<text x="${this.f(x+r+3.5)}" y="${this.f(y+3.2)}" class="t">${big?"CS"+c.n+" "+c.name:c.n}</text>`); }
  const towns= big? [["Darwin",0,"start"],["Adelaide",TOTAL_KM,"end"]] : [["Darwin",0,"start"],["Alice Springs",1496,"end"],["Port Augusta",2720,"end"],["Adelaide",TOTAL_KM,"end"]];
  for(const [n,km,a] of towns){ const q=profileAt(km), [x,y]=this.proj(v,q.lon,q.lat); s.push(`<text x="${this.f(a==="end"?x-8:x-4)}" y="${this.f(a==="start"?y-9:y+14)}" class="tn" text-anchor="${a}">${n}</text>`); }
  s.push(`<g class="m-teams"></g>`);
  s.push(`<g class="m-me"><circle r="${big?8:7}" fill="none" stroke="#f26b1d" stroke-width="1.5"/><circle r="3.2" fill="#fff"/></g>`);
  return `<svg viewBox="0 0 ${W} ${this.f(H)}" class="mapsvg" xmlns="http://www.w3.org/2000/svg">${s.join("")}</svg>`;
 },
 build(){
  this.pts=[]; for(let k=0;k<TOTAL_KM;k+=this.STEP){ const q=profileAt(k); this.pts.push([q.lon,q.lat]); }
  { const q=profileAt(TOTAL_KM); this.pts.push([q.lon,q.lat]); }
  const box=document.getElementById("map-box"); if(box) box.innerHTML=this.base(this.VIEW.small,false);
  const ob=document.getElementById("map-ov-map"); if(ob) ob.innerHTML=this.base(this.VIEW.big,true);
  this.built=true; this.reset();
 },
 reset(){ this.lastKm=-1; this.lastIdx=-1; this.passedN=-1; this.aheadKm=-1e9; },
 /* 走った区間・自車位置・CS の通過 (毎フレーム) */
 frame(){
  const es=Engine.st; if(!es||!this.built) return;
  const km=es.km, q=profileAt(km);
  for(const [sel,v] of [["#map-box",this.VIEW.small],["#map-ov-map",this.VIEW.big]]){
   const root=document.querySelector(sel); if(!root) continue;
   if(sel==="#map-ov-map"&&!document.getElementById("map-ov").classList.contains("on")) continue;
   const [x,y]=this.proj(v,q.lon,q.lat), me=root.querySelector(".m-me"); if(me) me.setAttribute("transform",`translate(${this.f(x)},${this.f(y)})`);
   if(Math.abs(km-this.lastKm)>0.05||root._dk!==this.lastKm){
    const n=Math.min(this.pts.length,Math.floor(km/this.STEP)+1);
    if(root._preN!==n){ const seg=[]; for(let i=0;i<n;i++){ const p=this.proj(v,this.pts[i][0],this.pts[i][1]); seg.push(this.f(p[0])+","+this.f(p[1])); } root._pre=seg.join(" "); root._preN=n; }
    const d=root.querySelector(".m-done"); if(d) d.setAttribute("points",root._pre+" "+this.f(x)+","+this.f(y)); root._dk=km;
   }
   if(es.passedCP&&(es.passedCP.size!==this.passedN||root._pn!==es.passedCP.size)){ root._pn=es.passedCP.size;
    root.querySelectorAll(".m-cs").forEach(r=>{ const k=+r.dataset.km, done=[...es.passedCP].some(p=>Math.abs(p-k)<3)||km>k+0.5; r.setAttribute("fill",done?"#f26b1d":"#15171a"); }); }
  }
  if(Math.abs(km-this.lastKm)>0.05) this.lastKm=km;
  this.passedN=es.passedCP?es.passedCP.size:0;
  const lb=document.getElementById("map-km"); if(lb) lb.textContent=`${km.toFixed(0)} / ${TOTAL_KM.toFixed(0)} km`;
  if(Math.abs(km-this.aheadKm)>0.3) this.ahead(km);
  if(document.getElementById("map-ov").classList.contains("on")&&performance.now()-this.ovT>400) this.ovUpdate();
 },
 /* 前方 60 km の予定 (CS・制限速度の変化・町) */
 ahead(km){
  this.aheadKm=km; const el=document.getElementById("map-ahead"); if(!el) return;
  const R=60, end=Math.min(TOTAL_KM,km+R), span=Math.max(1,end-km), it=[];
  for(const c of (typeof RP_CS!=="undefined"?RP_CS:[])) if(c.km>km&&c.km<=end) it.push({km:c.km,p:3,html:`<span class="sq"></span>CS${c.n} ${c.name}`});
  if(typeof speedLimitAt==="function"){ let prev=speedLimitAt(km); for(let k=km+0.5;k<=end;k+=0.5){ const v=speedLimitAt(k); if(v!==prev){ it.push({km:k,p:2,html:`<span class="tri"></span>${v} km/h`}); prev=v; } } }
  for(const r of ROUTE) if(!r.cp&&r.km>km&&r.km<=end&&r.km<TOTAL_KM-0.5) it.push({km:r.km,p:1,html:`<span class="dot"></span>${r.name.replace(/\s*\(.*\)/,"")}`});
  if(end>=TOTAL_KM&&km<TOTAL_KM) it.push({km:TOTAL_KM,p:4,html:`<span class="sq"></span>GOAL`});
  it.sort((a,b)=>b.p-a.p||a.km-b.km);
  const pick=[]; for(const x of it){ const pc=(x.km-km)/span*100; if(pc<16||pc>84&&x.p<4) continue; if(pick.some(y=>Math.abs(y.pc-pc)<24)) continue; pick.push({...x,pc}); if(pick.length>=3) break; }
  let h=`<div class="axl"></div><div class="tk l" style="left:0%"><span class="dot me"></span><b>${km.toFixed(0)}</b></div>`;
  for(const x of pick) h+=`<div class="tk" style="left:${x.pc.toFixed(1)}%">${x.html}</div>`;
  if(!pick.some(x=>x.pc>84)) h+=`<div class="tk r" style="left:100%"><span class="dot"></span><b>${end.toFixed(0)}</b></div>`;
  el.innerHTML=h;
 },
 /* ---- 地図のオーバーレイ: 他チームの位置と速度 ---- */
 toggle(on){ const ov=document.getElementById("map-ov"); if(!ov) return; on=on==null?!ov.classList.contains("on"):on; ov.classList.toggle("on",on); if(on){ this.ovT=0; const r=document.querySelector("#map-ov-map"); if(r) r._dk=null, r._pn=null; this.frame(); this.ovUpdate(); } },
 teamState(tm,es){
  if(tm.status==="dnf") return ["リタイア","dnf"]; if(tm.status==="fin") return ["ゴール","fin"]; if(tm.status==="pre") return ["スタート前","stop"];
  if(tm.csT>0) return ["CS 停車","cs"]; if(!(es.hour>=8&&es.hour<17)) return ["停車 (夜営)","stop"]; return ["走行","run"]; },
 ovUpdate(){
  this.ovT=performance.now(); const es=Engine.st; if(!es) return;
  const teams=(es.teams||[]).map(tm=>{ const [st,c]=this.teamState(tm,es); return {name:tm.name,car:tm.car||"",km:tm.km,v:c==="run"?(tm.vNow||tm.spd||0):0,st,c,hue:tm.hue}; });
  const me={name:"WAKAYAMA (自車)",km:es.km,v:es.v*3.6,st:es.finished?"ゴール":es.stopTimer>0?"CS 停車":es.camp?"停車 (夜営)":es.v>0.5?"走行":"停車",c:"me",me:true};
  const all=[...teams,me].sort((a,b)=>b.km-a.km);
  const v=this.VIEW.big, g=document.querySelector("#map-ov-map .m-teams");
  if(g){ let s="";    for(const t of all){ if(t.me) continue; const q=profileAt(t.km), [x,y]=this.proj(v,q.lon,q.lat);
    s+=`<circle cx="${this.f(x)}" cy="${this.f(y)}" r="3.2" fill="${t.c==="dnf"?"#d23a2e":"#c9ccd0"}" stroke="#15171a" stroke-width="1"/>`;
   }
   g.innerHTML=s; }
  const gap=document.getElementById("map-ov-gap");
  if(gap){ const R=150; let h=`<div class="axl"></div><div class="tk" style="left:50%"><span class="dot me"></span><b>自車</b></div>`;
   const tl=all.filter(t=>!t.me&&Math.abs(t.km-es.km)<=R).sort((a,b)=>Math.abs(a.km-es.km)-Math.abs(b.km-es.km)).slice(0,7), used=[50];
   for(const t of tl){ const pc=50+(t.km-es.km)/R*50; if(used.some(u=>Math.abs(u-pc)<9)) continue; used.push(pc);
    h+=`<div class="tk" style="left:${pc.toFixed(1)}%"><span class="dot"></span>${t.name}</div>`; }
   h+=`<div class="tk l" style="left:0%;top:28px">−${R} km</div><div class="tk r" style="left:100%;top:28px">+${R} km</div>`;
   gap.innerHTML=h; }
  const tb=document.getElementById("map-ov-rows");
  if(tb) tb.innerHTML=all.map((t,i)=>{ const d=t.km-es.km;
   return `<tr class="${t.me?"me":""}"><td>P${i+1}</td><td>${t.name}${t.car?` <span style="color:var(--dim);font-weight:500">${t.car}</span>`:""}</td><td>${t.km.toFixed(1)}</td><td>${t.me?"―":(d>0?"+":"−")+Math.abs(d).toFixed(1)}</td><td>${t.v.toFixed(0)}</td><td class="st-${t.c}">${t.st}</td></tr>`; }).join("");
  const n=document.getElementById("map-ov-n"); if(n) n.textContent=`${all.length} TEAMS`;
 },
};
