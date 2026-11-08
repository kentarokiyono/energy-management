"use strict";
/* ============ 分析画面: ヒドゥンバレー (予選・車検モード) ============
 ・周回の表: タイム・3 セクター・ベストとの差・1 周の電力 (Wh)・電流のピーク・電池の減り。ピットを通った周 (OUT/IN LAP) は記録対象外
 ・理論ベスト (各セクターのベストの合計)
 ・コース図: 選んだ周の走ったラインを速度で色分け。セクターの区切り・スタート/フィニッシュ
 ・グラフ: コース上の距離に対する速度 (選んだ周と比べる周)、タイム差 (比べる周に対して。上 = 遅い)
 ・車検テストの結果 (スラローム・制動・8 の字)
 ・ドライバーごと: ベストラップ・ベストセクター・1 周の電力 (ドライバー名は走行の編集で付ける)
 セクター: コースを 3 つに分け、区切りは 1/3・2/3 付近の直線 (曲がりの少ない所) に置く */
const HVA={
 lap:null, cmp:"best", cur:null,
 sectors(){ if(this._sec) return this._sec; const T=HV.track(), n=T.n, out=[];
  for(const f of [1/3,2/3]){ const tgt=T.len*f; let best=null, bv=1e9;
   for(let i=0;i<n;i++){ if(Math.abs(T.s[i]-tgt)>T.len*0.07) continue; let c=0; for(let k=-10;k<=10;k++) c+=Math.abs(T.curv[(i+k+n)%n]); if(c<bv){ bv=c; best=i; } }
   out.push(T.s[best]); }
  return this._sec=out; },
 /* 記録 → 周回ごとの配列 */
 laps(run){ if(run._hvl) return run._hvl; const H=run.hv, S=H.S, out=[];
  for(const L of H.laps){ const k=L.n-1, idx=[]; for(let i=0;i<S.t.length;i++) if(S.lap[i]===k) idx.push(i); if(idx.length<5) continue;
   const g=(key)=>idx.map(i=>S[key][i]);
   const s=g("s"), lt=g("lt"), v=g("v"), pm=g("pm"), amp=g("amp"), soc=g("soc");
   // スタート直後は前の周の終わり (距離が大きい) が混じるので除く
   const lenT=HV.track().len; let a=0; while(a<s.length-1&&s[a]>lenT*0.8) a++;
   const pick=(arr)=>arr.slice(a);
   const o={n:L.n,t:L.t,pit:L.pit,tag:L.tag,s:pick(s),lt:pick(lt),v:pick(v),x:pick(g("x")),z:pick(g("z")),pm:pick(pm),amp:pick(amp),soc:pick(soc),thr:pick(g("thr")),brk:pick(g("brk"))};
   let wh=0; for(let i=1;i<o.lt.length;i++){ const d=o.lt[i]-o.lt[i-1]; if(d>0&&d<1) wh+=o.pm[i]*d/3600; } o.wh=wh; o.peakA=Math.max(...o.amp); o.dsoc=o.soc[0]-o.soc[o.soc.length-1];
   const [s1,s2]=this.sectors(), tAt=(sx)=>this.timeAt(o,sx); const t1=tAt(s1), t2=tAt(s2);
   o.sec= Number.isFinite(t1)&&Number.isFinite(t2)? [t1,t2-t1,L.t-t2] : [NaN,NaN,NaN]; o.vmin=Math.min(...o.v); o.vmax=Math.max(...o.v);
   out.push(o); }
  return run._hvl=out; },
 timeAt(o,sx){ const s=o.s, t=o.lt; for(let i=1;i<s.length;i++) if(s[i-1]<=sx&&s[i]>=sx&&s[i]-s[i-1]<50){ const u=(sx-s[i-1])/((s[i]-s[i-1])||1); return t[i-1]+(t[i]-t[i-1])*u; } return NaN; },
 valid(run){ return this.laps(run).filter(l=>!l.pit&&Number.isFinite(l.sec[0])); },
 best(run){ const V=this.valid(run); return V.length? V.reduce((a,b)=>b.t<a.t?b:a) : null; },
 hide(){ const el=document.getElementById("ana-hv"); if(el&&el.style.display!=="none"){ el.style.display="none"; const b=document.getElementById("ana-body"); if(b) b.style.display=""; } },
 ensure(){ let el=document.getElementById("ana-hv"); if(el) return el;
  el=document.createElement("div"); el.id="ana-hv"; el.innerHTML=`
   <div class="hv-l"><div class="hv-card hv-mapc" id="hv-mapc"><canvas id="hv-map"></canvas><div class="hv-tags" id="hv-tags"></div><div class="ana-ctl hv-ctl"><button class="btn" title="左に回す" onclick="HVA.m3&&HVA.m3.rot(-1)">${ic("rotate","flipx")}</button><button class="btn" title="右に回す" onclick="HVA.m3&&HVA.m3.rot(1)">${ic("rotate")}</button><button class="btn" title="寝かせる" onclick="HVA.m3&&HVA.m3.tilt(1)">${ic("chd")}</button><button class="btn" title="起こす" onclick="HVA.m3&&HVA.m3.tilt(-1)">${ic("chu")}</button><button class="btn" title="真上から" onclick="HVA.m3&&HVA.m3.top()">真上</button><button class="btn" title="初期の向き" onclick="HVA.m3&&HVA.m3.reset()">初期</button></div><div class="hv-leg" id="hv-leg"></div></div>
    <div class="hv-card"><div class="hv-h">${ic("activity")}<span id="hv-cht">速度 (コース上の距離)</span><span class="dim" id="hv-chl"></span></div><canvas id="hv-spd"></canvas><div id="hv-dtw"><div class="hv-h">${ic("timer")}タイム差 (比べる周に対して。上 = 遅い)</div><canvas id="hv-dt"></canvas></div></div></div>
   <div class="hv-r" id="hv-pane"></div>`;
  document.getElementById("ana-body").after(el);
  const mv=(e,cv)=>{ const r=cv.getBoundingClientRect(), k=this.xs; if(!k) return; const sx=(e.clientX-r.left-k.L)/k.W*k.len; this.cur= sx>=0&&sx<=k.len? sx : null; this.draw(); };
  for(const id of ["hv-spd","hv-dt"]){ const cv=el.querySelector("#"+id); cv.addEventListener("pointermove",e=>mv(e,cv)); cv.addEventListener("pointerleave",()=>{ this.cur=null; this.draw(); }); }
  addEventListener("resize",()=>{ if(el.style.display!=="none") this.draw(); });
  return el; },
 render(run){ const el=this.ensure(); el.style.display="grid"; document.getElementById("ana-body").style.display="none"; document.getElementById("ana-empty").style.display="none";
  this.run=run; if(this._rid!==run.id){ this._rid=run.id; this.lap=null; this.cmp="best"; this.cur=null; }
  const L=this.laps(run), B=this.best(run); if(this.lap==null||!L.some(l=>l.n===this.lap)) this.lap= B? B.n : (L.length? L[L.length-1].n : null);
  this.pane(run); this.draw(); },
 /* ---------- 右の欄 ---------- */
 pane(run){
  const L=this.laps(run), V=this.valid(run), B=this.best(run), f=(x,d=2)=>Number.isFinite(x)?x.toFixed(d):"―", ft=(x)=>Number.isFinite(x)?fmtLap(x):"―";
  const bs=[0,1,2].map(i=>Math.min(...V.map(l=>l.sec[i]).filter(Number.isFinite))), theo=bs.every(Number.isFinite)? bs[0]+bs[1]+bs[2] : NaN;
  const H=run.hv, kind={circuit:"Hot Lap",slalom:"スラローム",brake:"制動",combo:"スラローム+制動",fig8:"8 の字"}[H.kind]||H.kind;
  let h=`<div class="hv-card"><div class="hv-h">${ic("timer")}${escHtml(kind)}<span class="dim">ドライバー: ${escHtml(run.driver||"未設定")} <a href="#" onclick="Ana.editRun();return false" style="color:var(--acc)">付ける</a></span></div>`;
  if(L.length){
   const opt=(sel,none)=>(none?`<option value="best" ${this.cmp==="best"?"selected":""}>ベストラップ</option><option value="none" ${this.cmp==="none"?"selected":""}>比べない</option>`:"")+L.map(l=>`<option value="${l.n}" ${(none?String(this.cmp):String(this.lap))===String(l.n)?"selected":""}>LAP ${l.n}${l.pit?" ("+l.tag+")":""} ${ft(l.t)}</option>`).join("");
   h+=`<div class="hv-sel"><label>表示する周<select onchange="HVA.lap=+this.value;HVA.draw();HVA.pane(HVA.run)">${opt(null,false)}</select></label><label>比べる周<select onchange="HVA.cmp=this.value;HVA.draw();HVA.pane(HVA.run)">${opt(null,true)}</select></label></div>
    <div class="hv-tbl"><span class="lb">周</span><span class="lb">タイム</span><span class="lb">S1</span><span class="lb">S2</span><span class="lb">S3</span><span class="lb">差</span><span class="lb">Wh</span><span class="lb">最大 A</span>
    ${L.map(l=>{ const on=l.n===this.lap, d=B&&!l.pit? l.t-B.t : NaN, sc=(i)=>{ const x=l.sec[i]; return `<span class="${!l.pit&&x===bs[i]?"pb":""}">${f(x)}</span>`; };
     return `<span class="${on?"on":""}" onclick="HVA.lap=${l.n};HVA.draw();HVA.pane(HVA.run)" style="cursor:pointer">${l.n}${l.pit?`<i>${l.tag}</i>`:""}</span><span class="${B&&l===B?"pb":""}">${ft(l.t)}</span>${sc(0)}${sc(1)}${sc(2)}<span class="${d>0.005?"bad":""}">${Number.isFinite(d)?(d<0.005?"BEST":"+"+d.toFixed(2)):"―"}</span><span>${f(l.wh,1)}</span><span>${f(l.peakA,0)}</span>`; }).join("")}</div>
    <div class="hv-sum"><span>ベストラップ <b>${ft(B&&B.t)}</b></span><span>理論ベスト (各セクターのベストの合計) <b>${ft(theo)}</b></span><span>1 周の電力 (平均) <b>${f(V.length?V.reduce((a,l)=>a+l.wh,0)/V.length:NaN,1)}</b> Wh</span></div>`;
  } else h+=`<div class="dim" style="padding:6px 0">${H.kind==="circuit"?"周回の記録はありません (1 周走りきると記録されます)。":"車検テストの走行です。結果は下にあります。"}</div>`;
  h+=`</div>`;
  // 車検テストの結果
  const R=H.results||[];
  if(R.length){ const nm={slalom:"スラローム",brake:"制動",combo:"スラローム+制動",fig8:"8 の字",circuit:"Hot Lap"};
   h+=`<div class="hv-card"><div class="hv-h">${ic("check")}車検テストの結果</div><div class="hv-res">${R.map(r=>`<div class="${r.pass?"ok":"ng"}"><b>${r.pass?"合格":"不合格"}</b><span>${escHtml(nm[r.kind]||r.kind)} ― ${escHtml(r.title.replace(/^[^ ]+ /,""))}</span><i>${r.rows.filter(x=>x[0]).map(x=>`${escHtml(x[0])} ${escHtml(x[1])}`).join("・")}</i></div>`).join("")}</div></div>`; }
  // ドライバーごと (ヒドゥンバレーの全部の走行から)
  const all=Ana.runs.filter(r=>r.kind==="hv"), D=new Map();
  for(const r of all){ const k=r.driver||"未設定"; const o=D.get(k)||{laps:0,best:null,sec:[Infinity,Infinity,Infinity],wh:0,runs:0}; o.runs++;
   for(const l of this.valid(r)){ o.laps++; if(!o.best||l.t<o.best) o.best=l.t; l.sec.forEach((x,i)=>{ if(x<o.sec[i]) o.sec[i]=x; }); o.wh+=l.wh; } D.set(k,o); }
  if([...D.values()].some(o=>o.laps)){ const rows=[...D.entries()].filter(([,o])=>o.laps).sort((a,b)=>a[1].best-b[1].best);
   h+=`<div class="hv-card"><div class="hv-h">${ic("user")}ドライバーごと (ヒドゥンバレーの全走行)</div><div class="hv-drv"><span class="lb">ドライバー</span><span class="lb">ベスト</span><span class="lb">S1</span><span class="lb">S2</span><span class="lb">S3</span><span class="lb">理論</span><span class="lb">Wh/周</span><span class="lb">周回</span>
    ${rows.map(([k,o],i)=>`<span>${escHtml(k)}</span><span class="${i===0?"pb":""}">${ft(o.best)}</span>${o.sec.map(x=>`<span>${f(x)}</span>`).join("")}<span>${ft(o.sec.every(Number.isFinite)?o.sec[0]+o.sec[1]+o.sec[2]:NaN)}</span><span>${f(o.wh/o.laps,1)}</span><span>${o.laps}</span>`).join("")}</div></div>`; }
  document.getElementById("hv-pane").innerHTML=h; },
 /* ---------- コース図とグラフ ---------- */
 fit(cv){ const r=cv.getBoundingClientRect(), dpr=Math.min(devicePixelRatio||1,2); cv.width=Math.max(10,r.width*dpr); cv.height=Math.max(10,r.height*dpr); const c=cv.getContext("2d"); c.setTransform(dpr,0,0,dpr,0,0); return [c,r.width,r.height]; },
 col(v,lo,hi){ const t=clamp((v-lo)/Math.max(1,hi-lo),0,1), st=[[44,107,176],[56,161,105],[227,178,31],[242,107,29],[209,59,46]], f=t*4, i=Math.min(3,Math.floor(f)), u=f-i; return `rgb(${[0,1,2].map(k=>Math.round(st[i][k]+(st[i+1][k]-st[i][k])*u)).join(",")})`; },
 draw(){ const run=this.run; if(!run) return; const L=this.laps(run), sel=L.find(l=>l.n===this.lap)||null, B=this.best(run);
  const cmp= this.cmp==="none"? null : this.cmp==="best"? (B&&sel&&B.n!==sel.n? B : null) : L.find(l=>String(l.n)===String(this.cmp)&&l!==sel)||null;
  this.drawMap(run,sel); this.drawSpeed(run,sel,cmp); this.drawDelta(sel,cmp); },
 /* ---------- コース図 (立体・斜めから): ドラッグで回転・右ドラッグ / Shift で移動・ホイール / 2 本指で拡大。高さは 2.5 倍 ---------- */
 EX:2.5,
 drawMap(run,sel){
  const m=this.map3d(); if(!m){ this.drawMap2(run,sel); return; }
  const circ=run.hv.kind==="circuit", key=run.id+"|"+(sel?sel.n:"-")+"|"+this.cmpN();
  if(m.key!==key){ m.key=key; m.build(run,sel,this.cmpLap(run,sel)); }
  m.cursor(sel); m.draw();
  const sh= sel? sel.v : (!circ? run.hv.S.v : null); if(sh&&sh.length) this.legend(Math.min(...sh),Math.max(...sh)); else document.getElementById("hv-leg").innerHTML="";
 },
 cmpN(){ return String(this.cmp); },
 cmpLap(run,sel){ const L=this.laps(run), B=this.best(run); return this.cmp==="none"? null : this.cmp==="best"? (B&&sel&&B.n!==sel.n? B : null) : L.find(l=>String(l.n)===String(this.cmp)&&l!==sel)||null; },
 map3d(){
  if(this.m3) { const host=document.getElementById("hv-mapc"); if(host&&this.m3.r.domElement.parentNode!==host) host.insertBefore(this.m3.r.domElement,host.firstChild); return this.m3; }
  if(this._m3fail||typeof THREE==="undefined") return null;
  let r; try{ r=new THREE.WebGLRenderer({antialias:true}); }catch(e){ this._m3fail=true; return null; }
  r.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
  const host=document.getElementById("hv-mapc"); document.getElementById("hv-map").style.display="none"; host.insertBefore(r.domElement,host.firstChild); r.domElement.className="hv-gl";
  const sc=new THREE.Scene(); sc.background=new THREE.Color(0x0d0e10);
  const grid=new THREE.GridHelper(2000,80,0x1c1f23,0x1c1f23); grid.position.y=-1; sc.add(grid);
  const cam=new THREE.PerspectiveCamera(40,1,1,6000), view={th:0.6,ph:0.95,d:900,tx:0,tz:0,ty:0}, V0={}, grp=new THREE.Group(); sc.add(grp);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.9,0.9,1,8),new THREE.MeshBasicMaterial({color:0xffffff})); pole.visible=false; sc.add(pole);
  const self=this, T=HV.track(), EX=this.EX;
  const yAt=(sx)=>{ let i=0; while(i<T.n-1&&T.s[i+1]<sx) i++; return T.pts[i].y*EX; };
  const M={r,sc,cam,view,grp,pole,w:1,h:1,tags:[],
   clear(){ while(grp.children.length){ const o=grp.children.pop(); o.geometry&&o.geometry.dispose(); o.material&&o.material.dispose(); } this.tags=[]; },
   build(run,sel,cmp){ this.clear(); const circ=run.hv.kind==="circuit";
    let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9; const ext=(x,z)=>{ x0=Math.min(x0,x); x1=Math.max(x1,x); z0=Math.min(z0,z); z1=Math.max(z1,z); };
    if(circ){   // コースの路面 (帯) と縁
     const pos=[], n=T.n; for(let i=0;i<=n;i++){ const k=i%n, p=T.pts[k], rr=T.right[k], hw=T.hw[k]||6, y=p.y*EX; pos.push(p.x-rr[0]*hw,y,p.z-rr[1]*hw, p.x+rr[0]*hw,y,p.z+rr[1]*hw); ext(p.x,p.z); }
     const idx=[]; for(let i=0;i<n;i++){ const a=i*2; idx.push(a,a+1,a+2, a+1,a+3,a+2); }
     const g=new THREE.BufferGeometry(); g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3)); g.setIndex(idx);
     grp.add(new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:0x2a2d32,side:THREE.DoubleSide})));
     for(const sd of [-1,1]){ const e=[]; for(let i=0;i<=n;i++){ const k=i%n, p=T.pts[k], rr=T.right[k], hw=(T.hw[k]||6)*sd; e.push(new THREE.Vector3(p.x+rr[0]*hw,p.y*EX+0.05,p.z+rr[1]*hw)); }
      grp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(e),new THREE.LineBasicMaterial({color:0x4a4f56}))); }
     // S/F とセクターの区切り: 柱とラベル
     const post=(sx,col,lab)=>{ let i=0; while(i<T.n-1&&T.s[i+1]<sx) i++; const p=T.pts[i], y=p.y*EX, m=new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.2,40,8),new THREE.MeshBasicMaterial({color:col})); m.position.set(p.x,y+20,p.z); grp.add(m); this.tags.push({x:p.x,y:y+44,z:p.z,lab,col}); };
     post(0,0xe6e6e3,"S/F"); const [s1,s2]=self.sectors(); post(s1,0x22d3ee,"S1 | S2"); post(s2,0x22d3ee,"S2 | S3"); }
    const show= sel? sel : (!circ? {x:run.hv.S.x,z:run.hv.S.z,v:run.hv.S.v,s:null} : null);
    if(show){ const lo=Math.min(...show.v), hi=Math.max(...show.v), H=(v)=>2+clamp((v-lo)/Math.max(1,hi-lo),0,1)*28, pos=[], col=[];
     const gy=(i)=> circ&&show.s? yAt(show.s[i]) : 0;
     for(let i=1;i<show.x.length;i++){ if(Math.hypot(show.x[i]-show.x[i-1],show.z[i]-show.z[i-1])>15) continue;
      const ax=show.x[i-1], az=show.z[i-1], bx=show.x[i], bz=show.z[i], ya=gy(i-1)+0.3, yb=gy(i)+0.3, ha=H(show.v[i-1]), hb=H(show.v[i]), ca=self.colRGB(show.v[i-1],lo,hi), cb=self.colRGB(show.v[i],lo,hi);
      pos.push(ax,ya,az, bx,yb,bz, bx,yb+hb,bz, ax,ya,az, bx,yb+hb,bz, ax,ya+ha,az); for(const c of [ca,cb,cb,ca,cb,ca]) col.push(...c); if(!circ) ext(bx,bz); }
     const g=new THREE.BufferGeometry(); g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3)); g.setAttribute("color",new THREE.Float32BufferAttribute(col,3));
     grp.add(new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,transparent:true,opacity:0.9})));
     this.H=H; this.gy=gy; this.show=show; }
    if(cmp){ const pts=cmp.x.map((x,i)=>new THREE.Vector3(x,yAt(cmp.s[i])+0.6,cmp.z[i])); grp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x22d3ee}))); }
    if(this.bkey!==run.id+run.hv.kind){ this.bkey=run.id+run.hv.kind; const cx=(x0+x1)/2, cz=(z0+z1)/2, sz=Math.max(60,x1-x0,z1-z0);
     Object.assign(view,{tx:cx,tz:cz,ty:circ? T.pts[0].y*EX : 0,d:sz*0.95,th:0.6,ph:0.85}); Object.assign(V0,view); }
   },
   cursor(sel){ const s=self.cur; if(s==null||!sel||!this.show||!this.show.s){ pole.visible=false; return; } let i=0; while(i<sel.s.length-1&&sel.s[i]<s) i++;
    const h=this.H(sel.v[i])+14, y=this.gy(i); pole.visible=true; pole.scale.y=h; pole.position.set(sel.x[i],y+h/2,sel.z[i]); },
   resize(){ const p=r.domElement.parentNode; if(!p) return; const w=Math.max(10,p.clientWidth-2), h=360; if(w!==this.w||h!==this.h){ this.w=w; this.h=h; r.setSize(w,h); cam.aspect=w/h; cam.updateProjectionMatrix(); } },
   draw(){ this.resize(); cam.position.set(view.tx+view.d*Math.sin(view.ph)*Math.sin(view.th),view.ty+view.d*Math.cos(view.ph),view.tz+view.d*Math.sin(view.ph)*Math.cos(view.th)); cam.lookAt(view.tx,view.ty,view.tz);
    r.render(sc,cam);
    const el=document.getElementById("hv-tags"); if(el) el.innerHTML=this.tags.map(t=>{ const v=new THREE.Vector3(t.x,t.y,t.z).project(cam); if(v.z>1) return ""; return `<span style="left:${((v.x+1)/2*this.w).toFixed(0)}px;top:${((1-v.y)/2*this.h).toFixed(0)}px;color:#${t.col.toString(16).padStart(6,"0")}">${t.lab}</span>`; }).join(""); },
   rot(d){ view.th+=d*Math.PI/8; this.draw(); }, tilt(d){ view.ph=clamp(view.ph+d*0.15,0.05,1.45); this.draw(); }, top(){ view.ph=0.05; this.draw(); }, reset(){ Object.assign(view,V0); this.draw(); }};
  // 操作
  const el=r.domElement, pts=new Map(); el.style.touchAction="none";
  el.addEventListener("pointerdown",e=>{ el.setPointerCapture(e.pointerId); pts.set(e.pointerId,{x:e.clientX,y:e.clientY,b:e.button,sh:e.shiftKey}); });
  el.addEventListener("pointermove",e=>{ const p=pts.get(e.pointerId); if(!p) return; const dx=e.clientX-p.x, dy=e.clientY-p.y;
   if(pts.size===2){ const [a,b]=[...pts.values()], d0=Math.hypot(a.x-b.x,a.y-b.y); p.x=e.clientX; p.y=e.clientY; const [a2,b2]=[...pts.values()], d1=Math.hypot(a2.x-b2.x,a2.y-b2.y); if(d0>0) view.d=clamp(view.d*d0/d1,60,4000); M.draw(); return; }
   if(p.b===2||p.sh){ const k=view.d/600; view.tx-=(dx*Math.cos(view.th)+dy*Math.sin(view.th))*k; view.tz-=(-dx*Math.sin(view.th)+dy*Math.cos(view.th))*k; }
   else { view.th-=dx*0.006; view.ph=clamp(view.ph-dy*0.004,0.05,1.45); }
   p.x=e.clientX; p.y=e.clientY; M.draw(); });
  const up=e=>pts.delete(e.pointerId); el.addEventListener("pointerup",up); el.addEventListener("pointercancel",up); el.addEventListener("contextmenu",e=>e.preventDefault());
  el.addEventListener("wheel",e=>{ e.preventDefault(); view.d=clamp(view.d*Math.exp(e.deltaY*0.001),60,4000); M.draw(); },{passive:false});
  return this.m3=M;
 },
 legend(lo,hi){ document.getElementById("hv-leg").innerHTML=`<span>速度 (帯の高さ・色)</span><i style="background:linear-gradient(90deg,${[0,0.25,0.5,0.75,1].map(t=>this.col(lo+t*(hi-lo),lo,hi)).join(",")})"></i><span>${lo.toFixed(0)}〜${hi.toFixed(0)} km/h</span>`; },
 colRGB(v,lo,hi){ const t=clamp((v-lo)/Math.max(1,hi-lo),0,1), st=[[0.17,0.42,0.69],[0.22,0.63,0.41],[0.89,0.70,0.12],[0.95,0.42,0.11],[0.82,0.23,0.18]], f=t*4, i=Math.min(3,Math.floor(f)), u=f-i; return [0,1,2].map(k=>st[i][k]+(st[i+1][k]-st[i][k])*u); },
 drawMap2(run,sel){ const cv=document.getElementById("hv-map"); if(!cv) return; cv.style.display="block"; const [c,W,H]=this.fit(cv); c.clearRect(0,0,W,H);
  const T=HV.track(), circ=run.hv.kind==="circuit";
  let pts= circ? T.pts.map(p=>[p.x,p.z]) : null;
  if(!circ){ const S=run.hv.S; pts=S.x.map((x,i)=>[x,S.z[i]]); if(!pts.length){ c.fillStyle="#8b9097"; c.fillText("記録がありません",12,20); return; } }
  let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9; for(const [x,z] of pts){ x0=Math.min(x0,x); x1=Math.max(x1,x); z0=Math.min(z0,z); z1=Math.max(z1,z); }
  const pad=20, sc=Math.min((W-2*pad)/Math.max(1,x1-x0),(H-2*pad)/Math.max(1,z1-z0)), ox=(W-(x1-x0)*sc)/2, oz=(H-(z1-z0)*sc)/2, P=(x,z)=>[ox+(x-x0)*sc,oz+(z-z0)*sc];
  if(circ){ c.lineCap="round"; c.lineJoin="round"; c.strokeStyle="#2a2d32"; c.lineWidth=Math.max(4,9*sc); c.beginPath(); pts.forEach(([x,z],i)=>{ const [a,b]=P(x,z); i?c.lineTo(a,b):c.moveTo(a,b); }); c.closePath(); c.stroke();
   // スタート/フィニッシュとセクターの区切り
   const mark=(sx,lab,col)=>{ let i=0; while(i<T.n-1&&T.s[i+1]<sx) i++; const p=T.pts[i], r=T.right[i], [a,b]=P(p.x-r[0]*9,p.z-r[1]*9), [a2,b2]=P(p.x+r[0]*9,p.z+r[1]*9);
    c.strokeStyle=col; c.lineWidth=2.5; c.beginPath(); c.moveTo(a,b); c.lineTo(a2,b2); c.stroke(); c.fillStyle=col; c.font="600 11px 'Chakra Petch',sans-serif"; c.fillText(lab,a2+4,b2+4); };
   mark(0,"S/F","#e6e6e3"); const [s1,s2]=this.sectors(); mark(s1,"S1 | S2","#22d3ee"); mark(s2,"S2 | S3","#22d3ee"); }
  const show= sel? sel : (!circ? {x:run.hv.S.x,z:run.hv.S.z,v:run.hv.S.v} : null); if(!show) return;
  const lo=Math.min(...show.v), hi=Math.max(...show.v); c.lineWidth=3.2; c.lineCap="round";
  for(let i=1;i<show.x.length;i++){ if(Math.hypot(show.x[i]-show.x[i-1],show.z[i]-show.z[i-1])>15) continue; const [a,b]=P(show.x[i-1],show.z[i-1]), [a2,b2]=P(show.x[i],show.z[i]); c.strokeStyle=this.col(show.v[i],lo,hi); c.beginPath(); c.moveTo(a,b); c.lineTo(a2,b2); c.stroke(); }
  if(this.cur!=null&&sel){ let i=0; while(i<sel.s.length-1&&sel.s[i]<this.cur) i++; const [a,b]=P(sel.x[i],sel.z[i]); c.fillStyle="#fff"; c.strokeStyle="#f26b1d"; c.lineWidth=3; c.beginPath(); c.arc(a,b,6,0,7); c.fill(); c.stroke(); }
  document.getElementById("hv-leg").innerHTML=`<span>速度</span><i style="background:linear-gradient(90deg,${[0,0.25,0.5,0.75,1].map(t=>this.col(lo+t*(hi-lo),lo,hi)).join(",")})"></i><span>${lo.toFixed(0)}〜${hi.toFixed(0)} km/h</span>`; },
 axes(c,W,H,len,ylo,yhi,unit,L){ const PW=W-L-10; c.font="500 10px 'Chakra Petch',sans-serif"; c.textAlign="right";
  const step=[5,10,20,25,50,100].find(x=>(yhi-ylo)/x<=6)||100; for(let y=Math.ceil(ylo/step)*step;y<=yhi;y+=step){ const py=8+(1-(y-ylo)/(yhi-ylo))*(H-26); c.strokeStyle="#1a1d21"; c.beginPath(); c.moveTo(L,py); c.lineTo(W-10,py); c.stroke(); c.fillStyle="#8b9097"; c.fillText(y,L-5,py+3.5); }
  c.textAlign="left"; c.fillStyle="#8b9097"; c.fillText(unit,L+4,16); for(let x=0;x<=len;x+=500){ c.fillText((x/1000).toFixed(1)+" km",L+x/len*PW-12,H-6); }
  const [s1,s2]=this.run.hv.kind==="circuit"? this.sectors() : []; c.strokeStyle="rgba(34,211,238,.45)"; c.setLineDash([3,3]); for(const sx of [s1,s2]) if(sx){ const px=L+sx/len*PW; c.beginPath(); c.moveTo(px,8); c.lineTo(px,H-20); c.stroke(); } c.setLineDash([]);
  return PW; },
 drawSpeed(run,sel,cmp){ const cv=document.getElementById("hv-spd"); if(!cv) return; const [c,W,H]=this.fit(cv); c.clearRect(0,0,W,H);
  const circ=run.hv.kind==="circuit", S=run.hv.S, L=40;
  document.getElementById("hv-cht").textContent= circ? "速度 (コース上の距離)" : "速度 (経過時間)"; document.getElementById("hv-dtw").style.display= circ? "" : "none";
  if(!circ){ const ys=S.v, n=ys.length; if(!n) return; const len=Math.max(...S.t)-Math.min(...S.t), t0=S.t[0], hi=Math.max(20,Math.ceil(Math.max(...ys)/10)*10);
   c.font="500 10px 'Chakra Petch',sans-serif"; const PW=W-L-10; c.fillStyle="#8b9097"; c.fillText("km/h",L+4,16);
   c.textAlign="right"; for(let y=0;y<=hi;y+=hi>60?20:10){ const py=8+(1-y/hi)*(H-26); c.strokeStyle="#1a1d21"; c.beginPath(); c.moveTo(L,py); c.lineTo(W-10,py); c.stroke(); c.fillText(y,L-5,py+3.5); } c.textAlign="left";
   const tstep=[5,10,20,30,60,120,300].find(x=>len/x<=8)||600; for(let x=0;x<=len;x+=tstep) c.fillText(x+" 秒",L+x/Math.max(1,len)*PW-10,H-6);
   c.strokeStyle="#f26b1d"; c.lineWidth=1.6; c.beginPath(); for(let i=0;i<n;i++){ const x=L+(S.t[i]-t0)/Math.max(1,len)*PW, y=8+(1-ys[i]/hi)*(H-26); i&&S.t[i]-S.t[i-1]<1? c.lineTo(x,y) : c.moveTo(x,y); } c.stroke();
   document.getElementById("hv-chl").textContent=""; this.xs=null; return; }
  const len=HV.track().len, all=[sel,cmp].filter(Boolean); if(!all.length) return; const hi=Math.ceil(Math.max(...all.map(l=>l.vmax))/10)*10+5, lo=Math.max(0,Math.floor(Math.min(...all.map(l=>l.vmin))/10)*10-5);
  const PW=this.axes(c,W,H,len,lo,hi,"km/h",L); this.xs={L,W:PW,len};
  const line=(l,col,w)=>{ c.strokeStyle=col; c.lineWidth=w; c.beginPath(); for(let i=0;i<l.s.length;i++){ const x=L+l.s[i]/len*PW, y=8+(1-(l.v[i]-lo)/(hi-lo))*(H-26); i&&l.s[i]>=l.s[i-1]? c.lineTo(x,y) : c.moveTo(x,y); } c.stroke(); };
  if(cmp) line(cmp,"rgba(34,211,238,.85)",1.4); if(sel) line(sel,"#f26b1d",1.8);
  document.getElementById("hv-chl").innerHTML=` <span style="color:#f26b1d">━ LAP ${sel?sel.n:"―"}</span>${cmp?` <span style="color:#22d3ee">━ LAP ${cmp.n}${this.cmp==="best"?" (ベスト)":""}</span>`:""}`;
  if(this.cur!=null&&sel){ const px=L+this.cur/len*PW; c.strokeStyle="#fff"; c.beginPath(); c.moveTo(px,8); c.lineTo(px,H-20); c.stroke(); let i=0; while(i<sel.s.length-1&&sel.s[i]<this.cur) i++;
   c.fillStyle="#e6e6e3"; c.font="600 11px 'Chakra Petch',sans-serif"; c.fillText(`${(this.cur/1000).toFixed(2)} km  ${sel.v[i].toFixed(0)} km/h  ${(sel.thr[i]*100).toFixed(0)} % / ブレーキ ${(sel.brk[i]*100).toFixed(0)} %`,Math.min(px+6,W-260),24); } },
 drawDelta(sel,cmp){ const cv=document.getElementById("hv-dt"); if(!cv) return; const [c,W,H]=this.fit(cv); c.clearRect(0,0,W,H); const L=40;
  if(!sel||!cmp||this.run.hv.kind!=="circuit"){ c.fillStyle="#8b9097"; c.font="500 11px 'Chakra Petch',sans-serif"; c.fillText(this.run.hv.kind==="circuit"?"比べる周を選ぶと、タイム差を出します":"",L,20); return; }
  const len=HV.track().len, pts=[]; for(let sx=20;sx<len-20;sx+=10){ const a=this.timeAt(sel,sx), b=this.timeAt(cmp,sx); if(Number.isFinite(a)&&Number.isFinite(b)) pts.push([sx,a-b]); }
  if(!pts.length) return; const m=Math.max(0.2,...pts.map(p=>Math.abs(p[1]))), lo=-m, hi=m; const PW=this.axes(c,W,H,len,lo,hi,"秒",L);
  const y0=8+(1-(0-lo)/(hi-lo))*(H-26); c.strokeStyle="#3a3e44"; c.beginPath(); c.moveTo(L,y0); c.lineTo(W-10,y0); c.stroke();
  c.lineWidth=1.8; c.strokeStyle="#e6e6e3"; c.beginPath(); pts.forEach(([sx,d],i)=>{ const x=L+sx/len*PW, y=8+(1-(d-lo)/(hi-lo))*(H-26); i?c.lineTo(x,y):c.moveTo(x,y); }); c.stroke();
  if(this.cur!=null){ const px=L+this.cur/len*PW; c.strokeStyle="#fff"; c.lineWidth=1; c.beginPath(); c.moveTo(px,8); c.lineTo(px,H-20); c.stroke(); const a=this.timeAt(sel,this.cur), b=this.timeAt(cmp,this.cur); if(Number.isFinite(a-b)){ c.fillStyle=a-b>0?"#ef6a5a":"#34d399"; c.font="600 11px 'Chakra Petch',sans-serif"; c.fillText(`${a-b>0?"+":""}${(a-b).toFixed(2)} 秒`,Math.min(px+6,W-80),24); } } },
};
