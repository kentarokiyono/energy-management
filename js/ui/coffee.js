"use strict";
/* ============ 朝の打ち合わせ (コーヒータイム) 7:00〜7:50 ============
 本戦の毎朝 7:00 に、道ばたのキャンプでチームが集まる場面に切り替える。時間は 1 倍か 2 倍で流れる (P.coffeeSpeed)。
 議題: 1 昨日の振り返り (Day1 は予選とスタート順) / 2 天気予報 (今日〜先の日、先ほど外れの幅が大きい) /
       3 今日の走り方 (攻め・標準・守り = 電池を残す量) / 4 ドライバー交代 (先に乗る人と交代する CS)
 「打ち合わせ終了」か 7:50 で終わり、乗り込み (7:50〜) へ。決めたことは Engine.st.coffee に残す (途中保存にも入る) */
const Coffee={
 END:7+50/60, active:false, ending:false, step:0, scene:null, camera:null, t:0, est:null, job:null, wx:null, ui:null,
 STYLES:{atk:{name:"攻め",adj:-4,note:"電池を少なめに残して速く"},std:{name:"標準",adj:0,note:"予報のずれに合わせた残し方"},def:{name:"守り",adj:5,note:"電池を多めに残して慎重に"}},
 STEPS:["昨日の振り返り","天気予報","今日の走り方","ドライバー交代"],
 on(){ const s=Engine.st; return P.coffee!==false&&P.mode==="race"&&!P.event&&!(typeof Demo!=="undefined"&&Demo.on)&&!!s&&!s.scenario&&!s.finished; },
 st(){ const s=Engine.st; if(!s.coffee) s.coffee={done:0,style:"std",plan:{},log:{}}; return s.coffee; },
 reset(){ if(Engine.st) Engine.st.coffee={done:0,style:"std",plan:{},log:{}}; this.close(true); },
 want(es){ return !!es&&running&&this.on()&&es.camp&&es.hour>=7&&es.hour<this.END&&this.st().done!==es.day; },
 floorAdj(){ const s=Engine.st; if(!s||!s.coffee) return 0; return (this.STYLES[s.coffee.style]||this.STYLES.std).adj/100; },   // adj は % (電池を残す量の増減)
 /* ---------- 始める・終える ---------- */
 begin(){ const s=Engine.st, c=this.st(); this.active=true; this.ending=false; this.step=s.day===1? 1 : 0; this.t=0; this.est=null; this.wx=null;
  const d=s.day; if(!c.plan[d]) c.plan[d]={style:c.style||"std",first:typeof Crew!=="undefined"? Crew.driverIdx : 0,swaps:[],decided:false};
  if(!c.log[d]) c.log[d]={km0:s.km,soc0:s.soc};
  Fade.go(()=>{ this.build(); this.showUI(true); this.startEst(); });
  Snd.silence&&Snd.silence(); },
 finish(){ if(this.ending) return; this.ending=true; const s=Engine.st, c=this.st(), d=s.day, p=c.plan[d];
  c.done=d; c.style=p.style; c.log[d].style=p.style; const e=this.est&&this.est[p.style]; if(e) c.log[d].est={km:e.kmToday,cs:e.cs?e.cs.n:null};
  if(typeof Crew!=="undefined"&&Crew.drivers[p.first]) Crew.setDriver(p.first);
  if(typeof Strategy!=="undefined") Strategy.last=null;
  const D=typeof Crew!=="undefined"? Crew.drivers : [], sw=p.swaps.map(w=>`CS${w.n} で ${D[w.to]?D[w.to].name:"―"}`).join("・");
  Radio.push(`朝の打ち合わせ: 今日は「${this.STYLES[p.style].name}」で。${D[p.first]?`最初は ${D[p.first].name}`:""}${sw?`、${sw} に交代`:""}。`,"監督");
  Fade.go(()=>this.close()); },
 close(quiet){ this.active=false; this.ending=false; this.job=null; document.body.classList.remove("coffee-on"); if(this.ui) this.ui.style.display="none";
  if(this.scene){ disposeScene(this.scene,View.renderer); this.scene=null; } },
 /* ---------- 毎フレーム (main の loop から) ---------- */
 frame(dtR){ const s=Engine.st;
  if(!this.active){ this.begin(); }
  const sp=P.coffeeSpeed===1? 1 : 2, dtS=dtR*sp;
  if(!this.ending){ Engine.step(dtS,dtR); if(s.hour>=this.END) this.finish(); }
  if(this.job) this.tickEst(6);
  this.t+=dtR; this.render(dtR); this.clock(); },
 render(dtR){ if(!this.scene||!View.renderer) return; const a=0.15+Math.sin(this.t*0.05)*0.75, C=this.center;   // テーブルの外側 (道の反対) からゆっくり左右に
  this.camera.position.set(C.x+Math.cos(a)*8.6, 2.5+Math.sin(this.t*0.12)*0.15, C.z+Math.sin(a)*8.6); this.camera.lookAt(C.x-1.2,0.9,C.z-0.6);
  if(typeof Post!=="undefined") Post.render(View.renderer,this.scene,this.camera); else View.renderer.render(this.scene,this.camera); },
 /* ---------- 3D: 道ばたのキャンプ ---------- */
 build(){ const s=Engine.st, R=View.renderer; disposeScene(this.scene,R);
  const sc=this.scene=new THREE.Scene(); setupRenderQuality(R,sc); R.shadowMap.enabled=true;
  const d1=s.day===1, top=new THREE.Color(0x5b84c0), hor=new THREE.Color(0xf4c79a);
  const cv=document.createElement("canvas"); cv.width=4; cv.height=256; const x=cv.getContext("2d"), g=x.createLinearGradient(0,0,0,256);
  g.addColorStop(0,"#3f69a8"); g.addColorStop(0.55,"#9fb6d2"); g.addColorStop(0.85,"#f2c9a0"); g.addColorStop(1,"#f6dcbc"); x.fillStyle=g; x.fillRect(0,0,4,256);
  const bg=new THREE.CanvasTexture(cv); bg.encoding=THREE.sRGBEncoding; sc.background=bg; sc.fog=new THREE.Fog(hor.getHex(),70,320);
  sc.add(new THREE.HemisphereLight(0xbfd6ff,0x7a4a30,0.65));
  const sun=new THREE.DirectionalLight(0xffd6a8,1.7); sun.position.set(40,14,-18); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-22,right:22,top:22,bottom:-22,near:1,far:120}); sun.shadow.bias=-0.0004; sc.add(sun); sc.add(sun.target); sun.target.position.set(8,0,0);
  const lam=(c)=>new THREE.MeshLambertMaterial({color:new THREE.Color(c).convertSRGBToLinear()});
  const gr=new THREE.Mesh(new THREE.PlaneGeometry(800,800),lam(d1?0x7d8a4c:0xa65a37)); gr.rotation.x=-Math.PI/2; gr.receiveShadow=true; sc.add(gr);
  const road=new THREE.Mesh(new THREE.PlaneGeometry(7.4,800),lam(0x45464a)); road.rotation.x=-Math.PI/2; road.position.y=0.01; road.receiveShadow=true; sc.add(road);
  const dash=new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12,3),new THREE.MeshLambertMaterial({color:0xe8e8e8}),60), m4=new THREE.Matrix4(), q=new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,0,0));
  for(let i=0;i<60;i++){ m4.compose(new THREE.Vector3(0,0.02,-180+i*6),q,new THREE.Vector3(1,1,1)); dash.setMatrixAt(i,m4); } sc.add(dash);
  /* 車: 傾けて充電中 (アッパーカウルを太陽へ) */
  const car=View.buildCarModelImpl(); car.group.position.set(6.2,0,0.5); car.group.rotation.y=Math.PI; sc.add(car.group);   // パネルを朝日 (テント側) へ向ける
  const UT=car.group.userData.upperTilt; if(UT) UT.rotation.z=-(s.tiltDeg||40)*Math.PI/180*0.85; else car.body.rotation.z=-(s.tiltDeg||40)*Math.PI/180*0.85;
  car.group.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } });
  /* テント (日よけ)・テーブル・いす・カップ・ノート PC */
  const C=this.center=new THREE.Vector3(11.5,0.8,2.4), grp=new THREE.Group(); sc.add(grp);
  const box=(w,h,dd,c,px,py,pz)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,dd),lam(c)); m.position.set(px,py,pz); m.castShadow=true; m.receiveShadow=true; grp.add(m); return m; };
  for(const [px,pz] of [[-1.6,-1.6],[1.6,-1.6],[-1.6,1.6],[1.6,1.6]]) box(0.05,2.3,0.05,0xd0d0d0,C.x+px,1.15,C.z+pz);
  const roof=box(3.4,0.06,3.4,0xf4f4f2,C.x,2.32,C.z); roof.castShadow=true;
  box(3.4,0.25,0.02,0xf97316,C.x,2.2,C.z-1.7); box(3.4,0.25,0.02,0xf97316,C.x,2.2,C.z+1.7);
  box(1.8,0.05,0.8,0xe7e2d6,C.x,0.74,C.z); for(const [px,pz] of [[-0.8,-0.34],[0.8,-0.34],[-0.8,0.34],[0.8,0.34]]) box(0.05,0.72,0.05,0x9a9a9a,C.x+px,0.36,C.z+pz);
  const seats=[[-0.55,-0.85,0],[0.35,-0.85,0],[-0.55,0.85,Math.PI],[0.35,0.85,Math.PI],[-1.35,0,Math.PI/2],[1.3,0,-Math.PI/2]];
  srand(97+s.day*13); const bs=new BatchSet(), shirts=[0xf97316,0x1d3fa3,0xf3f4f6,0x1d3fa3,0xf97316,0x2a2f3a];
  seats.forEach(([px,pz,ry],i)=>{ box(0.42,0.05,0.42,0x2b4a7a,C.x+px*1.0,0.45,C.z+pz*1.05); box(0.42,0.42,0.05,0x2b4a7a,C.x+px*1.0,0.68,C.z+pz*1.05+(pz>0?0.21:pz<0?-0.21:0));
   if(i<5) PR.person(bs,C.x+px*1.05,-0.32,C.z+pz*1.18,ry,shirts[i]); });   // 座った高さ (足は地面にめり込ませる)
  PR.person(bs,C.x+0.9,0,C.z-1.75,0.4,0xf97316);   // 立って話す人
  for(const [px,pz] of [[-0.55,-0.22],[0.35,-0.25],[-0.5,0.24],[0.4,0.22],[-0.95,0.05]]){ const cu=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.035,0.1,12),lam(0xf7f7f5)); cu.position.set(C.x+px,0.81,C.z+pz); grp.add(cu); }
  box(0.36,0.02,0.25,0x222428,C.x+0.05,0.77,C.z-0.05);
  const scr=new THREE.Mesh(new THREE.PlaneGeometry(0.36,0.22),new THREE.MeshBasicMaterial({color:0x9fd0ff})); scr.position.set(C.x+0.05,0.89,C.z-0.18); scr.rotation.x=-0.25; grp.add(scr);
  /* 伴走車・周りの木・草 */
  PR.car(bs,C.x+5.5,0,C.z+6.5,0.3,true); PR.car(bs,C.x+4.2,0,C.z-7,-0.15,false);
  for(let i=0;i<70;i++){ const px=rndr(-60,80), pz=rndr(-120,120); if(Math.abs(px)<6||(Math.abs(px-C.x)<9&&Math.abs(pz-C.z)<11)) continue;
   if(d1){ if(rnd()<0.25) PR.palm(bs,px,0,pz,rndr(0.8,1.2)); else PR.grass(bs,px,0,pz,rndr(0.8,1.4)); }
   else { const k=rnd(); if(k<0.18) PR.desertoak(bs,px,0,pz,rndr(0.7,1.2)); else if(k<0.3) PR.termite(bs,px,0,pz,rndr(0.6,1.1)); else PR.spinifex(bs,px,0,pz,rndr(0.8,1.4)); } }
  sc.add(bs.toGroup(new THREE.Group()));
  this.camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,0.1,900);
  if(!this._rs){ this._rs=true; addEventListener("resize",()=>{ if(this.camera){ this.camera.aspect=innerWidth/innerHeight; this.camera.updateProjectionMatrix(); } }); } },
 /* ---------- 見込みの計算 (走り方 3 通り。裏で少しずつ) ---------- */
 startEst(){ const s=Engine.st, o={abs:(s.day-1)*24+Math.max(8,s.day===1&&s.gridStartH?s.gridStartH:8),km:s.km,soc:s.soc,trace:true}, base=Strategy.floor()-this.floorAdj();
  const keys=Object.keys(this.STYLES); this.est={}; this.job={keys,i:0,g:null,o,base}; },
 tickEst(ms){ const j=this.job, t=performance.now(); try{
  while(j&&performance.now()-t<ms){ if(!j.g){ const k=j.keys[j.i]; j.g=Strategy.bestProfileGen({...j.o,floor:Math.max(0.02,j.base+this.STYLES[k].adj/100)}); }
   const r=j.g.next(); if(!r.done) continue; const k=j.keys[j.i], v=r.value, rr=v&&v.r; j.g=null; j.i++;
   if(rr){ const tr=rr.trace||[], kmT=rr.kmToday, cs=RP_CS.filter(c=>c.km>j.o.km-0.2&&c.km<=kmT).pop()||null;
    const eta=(km)=>{ const p=tr.find(q=>q[0]>=km); return p? p[1] : null; };
    this.est[k]={ok:v.ok,v:Math.round(v.v||0),kmToday:kmT,cs,finish:rr.finishAbs,minSoc:rr.minSoc,eta,noon:(d)=>{ const p=tr.find(q=>q[1]>=(d-1)*24+12.5); return p? p[0] : null; }}; }
   if(this.ui) this.draw();   // 1 通り終わるごとに表示を更新
   if(j.i>=j.keys.length){ this.job=null; break; } } }catch(e){ console.error(e); this.job=null; } },
 /* 予報の日射 (晴れの日に対する割合) と外れの幅 */
 forecast(){ if(this.wx) return this.wx; const s=Engine.st, save={doy:s.dayOfYear,km:s.km,w:s.weather}, L=Engine.FC_LEVEL[P.fcErr||"mid"], out=[], e=this.est&&this.est.std;
  try{ Strategy.fcOn=true;
   for(let d=s.day;d<=Math.min(s.day+3,6);d++){ const km=d===s.day? s.km : (e&&e.noon(d))!=null? e.noon(d) : null; if(km==null&&d>s.day) break;
    const pr=profileAt(km), doy=PRO.dayOfYear+d-1; let fc=0, cl=0;
    for(let h=8;h<17;h+=0.5){ const abs=(d-1)*24+h; s.dayOfYear=doy; s.km=km;
     s.weather= RealWx.on()? null : ((s.fc&&s.fc.plan)||s.weatherPlan||[]).find(w=>abs>=w.start&&abs<w.start+w.dur)||null;
     const r=Engine.solarCalc(pr.lat,h,false,pr.lon,pr.elev); fc+=r.ghi||0;
     const sp=Phys.sunPos(pr.lat,pr.lon,doy,h); if(sp.alt>0){ const c=Phys.clearSky(sp.alt,pr.elev,doy); cl+=c.dni*Math.sin(sp.alt)+c.dhi; } }
    const k=cl>0? clamp(fc/cl,0,1) : 1, err=L&&s.fc? L.d*0.6*Engine.FC_LEAD(d-s.day) : 0;
    out.push({d,km,k,err,place:this.place(km)}); }
  } finally{ Strategy.fcOn=false; s.dayOfYear=save.doy; s.km=save.km; s.weather=save.w; }
  if(this.est&&this.est.std) this.wx=out; return out; },
 place(km){ const c=RP_CS.filter(q=>q.km<=km+40).pop(); return c? `${c.name} 付近` : "Darwin 付近"; },
 recommend(){ const w=this.forecast()[0], s=Engine.st; if(!w) return "std"; if(w.k<0.75) return "def"; if(w.k>=0.92&&s.soc>=0.85) return "atk"; return "std"; },
 /* ---------- 画面 ---------- */
 showUI(on){ let u=this.ui; if(!u){ u=this.ui=document.createElement("div"); u.id="coffee"; document.getElementById("game-container").appendChild(u);
   u.addEventListener("click",e=>this.click(e)); u.addEventListener("change",e=>this.change(e)); }
  u.style.display=on?"":"none"; document.body.classList.toggle("coffee-on",!!on); this.draw(); },
 clock(){ const el=this.ui&&this.ui.querySelector(".cf-clk"); if(!el) return; const h=Engine.st.hour, t=`${Math.floor(h)}:${String(Math.floor(h%1*60)).padStart(2,"0")}`; if(el.textContent!==t) el.textContent=t; },
 drivers(){ return typeof Crew!=="undefined"&&Crew.drivers&&Crew.drivers.length? Crew.drivers : [{name:"ドライバーA"}]; },
 draw(){ const u=this.ui; if(!u||!this.active) return; const s=Engine.st, c=this.st(), p=c.plan[s.day]; if(!p) return; const ic=(n)=>typeof Team!=="undefined"? Team.ic(n) : "";
  const sp=P.coffeeSpeed===1? 1 : 2, steps=this.STEPS.map((n,i)=>`<button data-step="${i}" class="${i===this.step?"on":""}">${i+1}. ${s.day===1&&i===0?"予選とスタート順":n}</button>`).join("");
  const body=[this.s1,this.s2,this.s3,this.s4][this.step].call(this,s,c,p), talk=this.talk(s,c,p).map(([who,t],i)=>`<div class="cf-say" style="animation-delay:${i*0.35}s"><b>${who}</b>${t}</div>`).join("");
  u.innerHTML=`<div class="cf-top"><div class="cf-ttl"><span class="cf-kick">Day${s.day} 朝の打ち合わせ</span><span class="cf-clk"></span></div>
   <div class="cf-ctl"><div class="seg cf-spd"><button data-spd="1" class="${sp===1?"on":""}">1×</button><button data-spd="2" class="${sp===2?"on":""}">2×</button></div>
   <button class="btn ana-sm" data-act="end">${ic("check")}打ち合わせ終了</button></div></div>
   <div class="cf-talk">${talk}</div>
   <div class="cf-panel"><div class="cf-steps">${steps}</div><div class="cf-body">${body}</div>
   <div class="cf-nav"><button class="btn ana-sm" data-act="prev" ${this.step===0?"disabled":""}>前へ</button>${this.step<3?`<button class="btn ana-sm pri" data-act="next">次へ</button>`:`<button class="btn ana-sm pri" data-act="end">これで行こう (終了)</button>`}</div></div>`;
  this.clock(); },
 row(a,b){ return `<div class="cf-row"><span>${a}</span><b>${b}</b></div>`; },
 /* 1: 昨日の振り返り (Day1: 予選とスタート順) */
 s1(s,c){ if(s.day===1){ const m=Math.round(((s.gridStartH||8)-8)*60);
   return this.row("予選タイム",s.qualiLap? fmtLap(s.qualiLap) : "未計測")+this.row("スタート順",`P${s.grid||"―"} / ${(s.teams||[]).length+1}`)+this.row("発進",`8:${String(m).padStart(2,"0")}`)+this.row("今日の最初の CS",`CS1 ${RP_CS[0].name} (${RP_CS[0].km.toFixed(0)} km)`); }
  const y=c.log[s.day-1]; if(!y) return `<div class="dim">昨日の記録がありません (打ち合わせをしなかった日)。</div>`+this.row("今の位置",`${s.km.toFixed(0)} km (${this.place(s.km)})`)+this.row("電池",`${(s.soc*100).toFixed(0)} %`);
  const end=y.kmEnd!=null? y.kmEnd : s.km, dist=end-y.km0, diff=y.est? end-y.est.km : null;
  return this.row("走った距離",`${dist.toFixed(0)} km (${y.km0.toFixed(0)} → ${end.toFixed(0)} km)`)+this.row("止まった場所",this.place(end))
   +this.row("電池",`朝 ${(y.soc0*100).toFixed(0)} % → 夕方 ${y.socEnd!=null?(y.socEnd*100).toFixed(0):"―"} % → 今 ${(s.soc*100).toFixed(0)} %`)
   +this.row("走り方",this.STYLES[y.style||"std"].name)+(diff!=null? this.row("見込みとの差",`${diff>=0?"+":""}${diff.toFixed(0)} km (見込み ${y.est.km.toFixed(0)} km)`) : ""); },
 /* 2: 天気予報 */
 s2(s){ const W=this.forecast(); if(!W.length) return `<div class="dim">予報を計算中…</div>`;
  const off=!s.fc; return `<div class="cf-wx">${W.map(w=>{ const lo=Math.max(0,w.k-w.err), hi=Math.min(1,w.k+w.err);
   return `<div class="cf-wxr"><span>Day${w.d}<i>${w.place}</i></span><div class="cf-bar"><em style="left:${lo*100}%;width:${(hi-lo)*100}%"></em><b style="width:${w.k*100}%"></b></div><strong>${(w.k*100).toFixed(0)} %${w.err>0?`<i>±${(w.err*100).toFixed(0)}</i>`:""}</strong></div>`; }).join("")}</div>
   <div class="dim cf-note">8〜17 時の日射を、雲のない日を 100 % として表示。${off? "予報は外れない設定です。" : "帯は外れの幅 (先の日ほど広い)。"}${RealWx.on()?" 2025 年の実際の天気をもとにした予報。":""}</div>`; },
 /* 3: 今日の走り方 */
 s3(s,c,p){ const rec=this.recommend();
  return `<div class="cf-sty">${Object.entries(this.STYLES).map(([k,v])=>{ const e=this.est&&this.est[k];
   return `<button data-style="${k}" class="${p.style===k?"on":""}"><span class="cf-sn">${v.name}${k===rec?`<i>おすすめ</i>`:""}</span><span class="dim">${v.note}</span>
    ${e? `<span>今日は <b>${e.kmToday.toFixed(0)} km</b> まで${e.cs?` (CS${e.cs.n} ${e.cs.name} まで)`:""}</span><span class="dim">巡航 ${e.v} km/h・電池の最小 ${(e.minSoc*100).toFixed(0)} %・ゴール ${e.ok?fmtAbsH(e.finish):"届かない見込み"}</span>` : `<span class="dim">見込みを計算中…</span>`}</button>`; }).join("")}</div>
   <div class="dim cf-note">選んだ走り方は推奨速度と無線の速度指示に使います。電池を残す量: 攻め −4 %・守り +5 % (標準に対して)。</div>`; },
 /* 4: ドライバー交代 */
 s4(s,c,p){ const D=this.drivers(), e=this.est&&(this.est[p.style]||this.est.std), lim=e? e.kmToday+0.1 : s.km+700;
  const cs=RP_CS.filter(q=>q.km>s.km-0.2&&q.km<=lim);
  const sel=`<label class="drvf"><span class="lb">最初に乗る人</span><select data-k="first">${D.map((d,i)=>`<option value="${i}" ${p.first===i?"selected":""}>${escHtml(d.name)}</option>`).join("")}</select></label>`;
  if(D.length<2) return sel+`<div class="dim cf-note">交代するには「車両・チームの設定」でドライバーを 2 人以上登録してください (最大 4 人)。</div>`;
  const list=cs.map(q=>{ const w=p.swaps.find(x=>x.n===q.n), t=e&&e.eta(q.km);
   return `<div class="cf-sw"><label class="chk"><input type="checkbox" data-sw="${q.n}" ${w?"checked":""}><i></i>CS${q.n} ${q.name}<span class="dim">${t!=null?` ${fmtAbsH(t)} ごろ`:""}</span></label>
    ${w? `<select data-to="${q.n}">${D.map((d,i)=>`<option value="${i}" ${w.to===i?"selected":""}>→ ${escHtml(d.name)}</option>`).join("")}</select>` : ""}</div>`; }).join("");
  return sel+`<div class="cf-sec">交代する CS (今日の見込みの範囲)</div>${list||`<div class="dim">今日は CS に着かない見込みです。</div>`}
   <div class="dim cf-note">決めた CS に着くと、無線で知らせて乗る人を切り替えます (ドライバー成績も交代後の名前で記録)。</div>`; },
 /* チームの発言 */
 talk(s,c,p){ const D=this.drivers(), W=this.step===1||this.step===2? this.forecast() : [], e=this.est&&this.est[p.style];
  if(this.step===0){ if(s.day===1) return [["監督","おはよう。いよいよ本戦。まずはスタートまでの段取りから。"],["戦略",`グリッドは P${s.grid||"―"}。最初の CS は ${RP_CS[0].name} です。`]];
   const y=c.log[s.day-1]; if(!y) return [["監督","おはよう。昨日の振り返りから。"]];
   const end=y.kmEnd!=null? y.kmEnd : s.km, diff=y.est? end-y.est.km : null;
   return [["監督","おはよう。昨日の振り返りから。"],["戦略",`昨日は ${(end-y.km0).toFixed(0)} km。${diff==null?"":Math.abs(diff)<15?"ほぼ見込みどおりでした。":diff>0?`見込みより ${diff.toFixed(0)} km 先まで行けました。`:`見込みより ${(-diff).toFixed(0)} km 手前で止まりました。`}`]]; }
  if(this.step===1){ const w=W[0], bad=W.slice(1).sort((a,b)=>a.k-b.k)[0];
   if(!w) return [["気象","予報をまとめています。"]];
   return [["気象",`今日の日射は晴れの日の約 ${(w.k*100).toFixed(0)} %。${w.k<0.75?"雲が多めです。":w.k>0.92?"ほぼ快晴の見込み。":"ところどころ雲。"}`],
    ...(bad? [["気象",`この先では Day${bad.d} が一番弱くて約 ${(bad.k*100).toFixed(0)} %。${bad.err>0?`先の日ほど外れやすいので幅を見てください。`:""}`]] : [])]; }
  if(this.step===2){ const r=this.recommend(), er=this.est&&this.est[r];
   return [["戦略",er? `おすすめは「${this.STYLES[r].name}」。今日は ${er.kmToday.toFixed(0)} km あたりまで行けそうです。` : "見込みを計算しています。"],["監督","どれで行くか決めよう。"]]; }
  const first=D[p.first]; return [["監督",`最初は ${first?first.name:"―"} で。交代する CS を決めておこう。`],...(first? [[first.name,e&&e.cs? `了解です。今日は CS${e.cs.n} まで見込みですね。`:"了解です。"]] : [])]; },
 click(e){ const b=e.target.closest("button"); if(!b) return; const s=Engine.st, p=this.st().plan[s.day];
  if(b.dataset.spd){ P.coffeeSpeed=+b.dataset.spd; if(typeof Settings!=="undefined") Settings.save(); this.draw(); return; }
  if(b.dataset.step!=null){ this.step=+b.dataset.step; this.draw(); return; }
  if(b.dataset.style){ p.style=b.dataset.style; this.draw(); return; }
  const a=b.dataset.act; if(a==="next"){ this.step=Math.min(3,this.step+1); this.draw(); } else if(a==="prev"){ this.step=Math.max(0,this.step-1); this.draw(); } else if(a==="end") this.finish(); },
 change(e){ const t=e.target, s=Engine.st, p=this.st().plan[s.day], D=this.drivers();
  if(t.dataset.k==="first"){ p.first=+t.value; }
  else if(t.dataset.sw){ const n=+t.dataset.sw; if(t.checked){ const prev=[...p.swaps].filter(w=>w.n<n).sort((a,b)=>b.n-a.n)[0], cur=prev? prev.to : p.first; p.swaps.push({n,to:(cur+1)%D.length}); p.swaps.sort((a,b)=>a.n-b.n); } else p.swaps=p.swaps.filter(w=>w.n!==n); }
  else if(t.dataset.to){ const w=p.swaps.find(x=>x.n===+t.dataset.to); if(w) w.to=+t.value; }
  this.draw(); },
 /* ---------- 走行中 ---------- */
 onCS(cp){ const s=Engine.st; if(!s||!s.coffee||typeof Crew==="undefined") return; const p=s.coffee.plan[s.day]; if(!p) return; const w=p.swaps.find(x=>x.n===cp.n); if(!w) return;
  const d=Crew.drivers[w.to]; if(!d) return; if(w.to!==Crew.driverIdx) Crew.setDriver(w.to);
  Radio.push(`CS${cp.n}: 朝の打ち合わせどおり、ここで ${d.name} に交代。`,"監督"); toast(`ドライバー交代 → ${escHtml(d.name)}`,"#34d399"); },
 onCamp(s){ if(!s.coffee) return; const l=s.coffee.log[s.day]; if(l){ l.kmEnd=s.km; l.socEnd=s.soc; } },
};
