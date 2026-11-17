"use strict";
/* ============ チームの話し合い: 朝の打ち合わせ (7:00〜7:50) と夕方の話し合い (18:30〜19:15) ============
 本戦のキャンプで、チームが集まる場面に切り替える。時間は 1 倍か 2 倍で流れる (P.coffeeSpeed)。
 話す人 (チームマネージャー・戦略・電装班長・車体班長・整備班長・ドライバー) にカメラが寄り、左にセリフが出る。名前は設定で入れられる (P.crewNames)。
 朝: 1 昨日の振り返り (Day1 は予選とスタート順) / 2 天気予報 / 3 今日の走り方 / 4 ドライバー交代
 夕: 1 今日の振り返り / 2 他チームとの差 / 3 明日の予定 (走り方・ドライバーを仮決め → 翌朝の初期値) / 4 夜の充電・朝の段取り
 決めたことは Engine.st.coffee に残す (途中保存にも入る) */
const Coffee={
 active:false, ending:false, kind:"am", step:0, scene:null, camera:null, t:0, est:null, job:null, wx:null, ui:null, lines:[], li:0, lt:0, who:{}, camP:null, camL:null,
 SES:{am:{h0:7,h1:7+50/60,title:"朝の打ち合わせ",steps:["昨日の振り返り","天気予報","今日の走り方","ドライバー交代"]},
      pm:{h0:18.5,h1:19.25,title:"夕方の話し合い",steps:["今日の振り返り","他チームとの差","明日の予定","夜の充電・朝の段取り"]}},
 STYLES:{atk2:{name:"かなり攻め",adj:-10,note:"電池をぎりぎりまで使って速く"},atk:{name:"攻め",adj:-5,note:"電池を少なめに残して速く"},std:{name:"普通",adj:0,note:"予報のずれに合わせた残し方"},
  def:{name:"守り",adj:8,note:"電池を多めに残して慎重に"},def2:{name:"かなり守り",adj:16,note:"電池をたっぷり残して天気の急変に備える"},
  bet:{name:"賭け",adj:-10,bet:true,note:"明日から先は快晴と見込んで今日飛ばす。後半の日射が悪いと苦しい"},
  flex:{name:"臨機応変",adj:0,flex:true,note:"走りながら、残りの日射・明日の予報・電池を見て、攻め〜かなり守りを切り替える"}},
 ROLES:{tm:"チームマネージャー",strat:"戦略",elec:"電装班長",body:"車体班長",mech:"整備班長"},
 ROLE_C:{tm:"#f97316",strat:"#60a5fa",elec:"#facc15",body:"#34d399",mech:"#c084fc",drv:"#f472b6"},
 on(){ const s=Engine.st; return P.coffee!==false&&P.mode==="race"&&!P.event&&!(typeof Demo!=="undefined"&&Demo.on)&&!!s&&!s.scenario&&!s.finished; },
 st(){ const s=Engine.st; if(!s.coffee) s.coffee={done:0,pmDone:0,style:"std",plan:{},log:{}}; return s.coffee; },
 reset(){ if(Engine.st) Engine.st.coffee={done:0,pmDone:0,style:"std",plan:{},log:{}}; this.close(true); },
 sesOf(es){ const S=this.SES, c=this.st(); if(es.hour>=S.am.h0&&es.hour<S.am.h1&&c.done!==es.day) return "am"; if(es.hour>=S.pm.h0&&es.hour<S.pm.h1&&c.pmDone!==es.day) return "pm"; return null; },
 want(es){ return !!es&&running&&this.on()&&es.camp&&!!this.sesOf(es); },
 floorAdj(){ const s=Engine.st; if(!s||!s.coffee) return 0; return this.adjOf(s.coffee.style,s.coffee.flexK)/100; },   // adj は % (電池を残す量の増減)
 adjOf(k,fk){ const v=this.STYLES[k]||this.STYLES.std; return v.flex? (this.STYLES[fk]||this.STYLES.std).adj : v.adj; },
 bet(){ const s=Engine.st; return !!(s&&s.coffee&&!s.scenario&&s.coffee.style==="bet"); },   // 賭け: 戦略の先読みで明日から先を快晴と見る
 tday(){ const s=Engine.st; return this.kind==="pm"? s.day+1 : s.day; },   // 決める対象の日
 /* ---------- 始める・終える ---------- */
 begin(){ const s=Engine.st, c=this.st(); this.kind=this.sesOf(s)||"am"; this.active=true; this.ending=false; this.t=0; this.est=null; this.wx=null; this.lines=[]; this.li=0; this.lt=0; this.camP=null;
  this.step=this.kind==="am"&&s.day===1? 1 : 0;
  const d=this.tday(), cur=typeof Crew!=="undefined"? Crew.driverIdx : 0;
  if(!c.plan[d]) c.plan[d]={style:c.style||"std",first:cur,swaps:[]};
  else if(this.kind==="am"&&c.plan[d].night&&!c.plan[d].nightShown){ c.plan[d].nightShown=true; }   // 昨夜の仮決めをそのまま初期値に
  if(this.kind==="am"&&!c.log[s.day]) c.log[s.day]={km0:s.km,soc0:s.soc,rows0:RunLog.rows.length};
  Fade.go(()=>{ this.build(); this.showUI(true); this.startEst(); this.say(); });
  Snd.silence&&Snd.silence(); },
 finish(){ if(this.ending) return; this.ending=true; const s=Engine.st, c=this.st(), d=this.tday(), p=c.plan[d], D=this.drivers();
  const sw=p.swaps.map(w=>`CS${w.n} で ${D[w.to]?D[w.to].name:"―"}`).join("・"), e=this.est&&this.est[p.style];
  if(this.kind==="am"){
   c.done=d; c.style=p.style; c.flexK=p.style==="flex"? this.flexPick(true) : null; c.flexT=(d-1)*24+s.hour; c.log[d].style=p.style; if(e) c.log[d].est={km:e.kmDay,cs:e.cs?e.cs.n:null};
   if(typeof Crew!=="undefined"&&Crew.drivers[p.first]) Crew.setDriver(p.first);
   if(typeof Strategy!=="undefined") Strategy.last=null;
   Radio.push(`朝の打ち合わせ: 今日は「${this.STYLES[p.style].name}」で。${D[p.first]?`最初は ${D[p.first].name}`:""}${sw?`、${sw} に交代`:""}。`,this.label("tm"));
  } else {
   c.pmDone=s.day; p.night={style:p.style,first:p.first,swaps:p.swaps.map(w=>({...w}))}; if(e) p.night.km=e.kmDay;
   Radio.push(`夕方の話し合い: 明日は「${this.STYLES[p.style].name}」の予定。${D[p.first]?`最初は ${D[p.first].name}`:""}${sw?`、${sw} に交代`:""}。朝の予報で最終決定。`,this.label("tm"));
  }
  Fade.go(()=>this.close()); },
 close(quiet){ this.active=false; this.ending=false; this.job=null; document.body.classList.remove("coffee-on"); if(this.ui) this.ui.style.display="none";
  if(this.scene){ disposeScene(this.scene,View.renderer); this.scene=null; } },
 /* ---------- 毎フレーム (main の loop から) ---------- */
 frame(dtR){ const s=Engine.st;
  if(!this.active){ this.begin(); }
  const sp=P.coffeeSpeed===1? 1 : 2, dtS=dtR*sp;
  if(!this.ending){ Engine.step(dtS,dtR); if(s.hour>=this.SES[this.kind].h1) this.finish(); }
  if(this.job) this.tickEst(6);
  this.t+=dtR; this.talkTick(dtR); this.render(dtR); this.clock(); },
 /* カメラ: 話している人に寄る。話していないときはテーブルの周りをゆっくり */
 render(dtR){ if(!this.scene||!View.renderer) return; const C=this.center, L=this.lines[this.li], w=L&&!L.done&&this.who[L.role];
  let pos, look;
  if(w){ const dir=new THREE.Vector3(C.x-w.x,0,C.z-w.z).normalize(), side=new THREE.Vector3(-dir.z,0,dir.x);
   pos=new THREE.Vector3(w.x,Math.min(1.95,w.y+0.6),w.z).addScaledVector(dir,4.2).addScaledVector(side,0.7); look=new THREE.Vector3(w.x,w.y-0.15,w.z); }   // テーブルの向こう側の少し高いところから (頭越し)
  else { const a=0.15+Math.sin(this.t*0.05)*0.75; pos=new THREE.Vector3(C.x+Math.cos(a)*8.6,2.5+Math.sin(this.t*0.12)*0.15,C.z+Math.sin(a)*8.6); look=new THREE.Vector3(C.x-1.2,0.9,C.z-0.6); }
  if(!this.camP){ this.camP=pos.clone(); this.camL=look.clone(); } const k=1-Math.exp(-dtR*2.2); this.camP.lerp(pos,k); this.camL.lerp(look,k);
  this.camera.position.copy(this.camP); this.camera.lookAt(this.camL); this.camera.updateMatrixWorld();
  this.tag(w,L);
  if(typeof Post!=="undefined") Post.render(View.renderer,this.scene,this.camera); else View.renderer.render(this.scene,this.camera); },
 /* 話している人の頭の上の名札 */
 tag(w,L){ const el=this.ui&&this.ui.querySelector(".cf-tag"); if(!el) return; if(!w){ el.style.opacity=0; return; }
  const q=new THREE.Vector3(w.x,w.y+0.38,w.z).project(this.camera); if(q.z>1){ el.style.opacity=0; return; }
  el.style.left=((q.x+1)/2*innerWidth)+"px"; el.style.top=((1-q.y)/2*innerHeight)+"px"; el.style.opacity=1;
  const t=this.label(L.role); if(el.textContent!==t){ el.textContent=t; el.style.borderColor=this.ROLE_C[L.role]||"#fff"; } },
 /* ---------- 3D: 道ばたのキャンプ (朝は日の出直後、夕方は日没後) ---------- */
 build(){ const s=Engine.st, R=View.renderer, pm=this.kind==="pm"; disposeScene(this.scene,R);
  const sc=this.scene=new THREE.Scene(); setupRenderQuality(R,sc); R.shadowMap.enabled=true;
  const d1=s.day===1;
  const cv=document.createElement("canvas"); cv.width=4; cv.height=256; const x=cv.getContext("2d"), g=x.createLinearGradient(0,0,0,256);
  if(pm){ g.addColorStop(0,"#0b1430"); g.addColorStop(0.55,"#1f2c58"); g.addColorStop(0.82,"#7a4a63"); g.addColorStop(1,"#e0875a"); }
  else { g.addColorStop(0,"#3f69a8"); g.addColorStop(0.55,"#9fb6d2"); g.addColorStop(0.85,"#f2c9a0"); g.addColorStop(1,"#f6dcbc"); }
  x.fillStyle=g; x.fillRect(0,0,4,256);
  const bg=new THREE.CanvasTexture(cv); bg.encoding=THREE.sRGBEncoding; sc.background=bg; sc.fog=new THREE.Fog(pm?0x3a2c45:0xf4c79a,pm?40:70,pm?220:320);
  sc.add(new THREE.HemisphereLight(pm?0x6a7ac0:0xbfd6ff,pm?0x3a2a22:0x7a4a30,pm?0.55:0.65));
  const sun=new THREE.DirectionalLight(pm?0x8a9cd8:0xffd6a8,pm?0.35:1.7); sun.position.set(pm?-40:40,pm?20:14,-18); sun.castShadow=!pm; sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-22,right:22,top:22,bottom:-22,near:1,far:120}); sun.shadow.bias=-0.0004; sc.add(sun); sc.add(sun.target); sun.target.position.set(8,0,0);
  const lam=(c)=>new THREE.MeshLambertMaterial({color:new THREE.Color(c).convertSRGBToLinear()});
  const gr=new THREE.Mesh(new THREE.PlaneGeometry(800,800),lam(d1?0x7d8a4c:0xa65a37)); gr.rotation.x=-Math.PI/2; gr.receiveShadow=true; sc.add(gr);
  const road=new THREE.Mesh(new THREE.PlaneGeometry(7.4,800),lam(0x45464a)); road.rotation.x=-Math.PI/2; road.position.y=0.01; road.receiveShadow=true; sc.add(road);
  const dash=new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12,3),new THREE.MeshLambertMaterial({color:0xe8e8e8}),60), m4=new THREE.Matrix4(), q=new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,0,0));
  for(let i=0;i<60;i++){ m4.compose(new THREE.Vector3(0,0.02,-180+i*6),q,new THREE.Vector3(1,1,1)); dash.setMatrixAt(i,m4); } sc.add(dash);
  /* 車: 朝は傾けて充電中 (パネルを朝日へ)、夕方は日没後なので平置き */
  const car=View.buildCarModelImpl(); car.group.position.set(6.2,0,0.5); car.group.rotation.y=Math.PI; sc.add(car.group);
  const roll=pm? 0 : -(s.tiltDeg||40)*Math.PI/180*0.85, UT=car.group.userData.upperTilt; if(UT) UT.rotation.z=roll; else car.body.rotation.z=roll;
  car.group.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } });
  /* テント・テーブル・いす・カップ・ノート PC */
  const C=this.center=new THREE.Vector3(11.5,0.8,2.4), grp=new THREE.Group(); sc.add(grp);
  const box=(w,h,dd,c,px,py,pz)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,dd),lam(c)); m.position.set(px,py,pz); m.castShadow=true; m.receiveShadow=true; grp.add(m); return m; };
  for(const [px,pz] of [[-1.6,-1.6],[1.6,-1.6],[-1.6,1.6],[1.6,1.6]]) box(0.05,2.3,0.05,0xd0d0d0,C.x+px,1.15,C.z+pz);
  box(3.4,0.06,3.4,0xf4f4f2,C.x,2.32,C.z); box(3.4,0.25,0.02,0xf97316,C.x,2.2,C.z-1.7); box(3.4,0.25,0.02,0xf97316,C.x,2.2,C.z+1.7);
  box(1.8,0.05,0.8,0xe7e2d6,C.x,0.74,C.z); for(const [px,pz] of [[-0.8,-0.34],[0.8,-0.34],[-0.8,0.34],[0.8,0.34]]) box(0.05,0.72,0.05,0x9a9a9a,C.x+px,0.36,C.z+pz);
  /* 席と役割: 0 戦略 1 電装 2 車体 3 整備 4 ドライバー 5 (空き) / チームマネージャーは立って話す */
  const seats=[[-0.55,-0.85,0,"strat",0x1d3fa3],[0.35,-0.85,0,"elec",0xf97316],[-0.55,0.85,Math.PI,"body",0xf3f4f6],[0.35,0.85,Math.PI,"mech",0x1d3fa3],[-1.35,0,Math.PI/2,"drv",0xf97316],[1.3,0,-Math.PI/2,null,0]];
  srand(97+s.day*13); const bs=new BatchSet(); this.who={};
  seats.forEach(([px,pz,ry,role,shirt])=>{ box(0.42,0.05,0.42,0x2b4a7a,C.x+px,0.45,C.z+pz*1.05); box(0.42,0.42,0.05,0x2b4a7a,C.x+px,0.68,C.z+pz*1.05+(pz>0?0.21:pz<0?-0.21:0));
   if(!role) return; const hx=C.x+px*1.05, hz=C.z+pz*1.18; PR.person(bs,hx,-0.32,hz,ry,shirt); this.who[role]=new THREE.Vector3(hx,1.28,hz); });   // 座った高さ (足は地面にめり込ませる)
  PR.person(bs,C.x+0.9,0,C.z-1.75,0.4,0xf97316); this.who.tm=new THREE.Vector3(C.x+0.9,1.6,C.z-1.75);
  for(const [px,pz] of [[-0.55,-0.22],[0.35,-0.25],[-0.5,0.24],[0.4,0.22],[-0.95,0.05]]){ const cu=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.035,0.1,12),lam(0xf7f7f5)); cu.position.set(C.x+px,0.81,C.z+pz); grp.add(cu); }
  box(0.36,0.02,0.25,0x222428,C.x+0.05,0.77,C.z-0.05);
  const scr=new THREE.Mesh(new THREE.PlaneGeometry(0.36,0.22),new THREE.MeshBasicMaterial({color:0x9fd0ff})); scr.position.set(C.x+0.05,0.89,C.z-0.18); scr.rotation.x=-0.25; grp.add(scr);
  if(pm){ const lamp=new THREE.PointLight(0xffc27a,2.2,16,1.4); lamp.position.set(C.x,2.05,C.z); sc.add(lamp);
   const bulb=new THREE.Mesh(new THREE.SphereGeometry(0.07,10,8),new THREE.MeshBasicMaterial({color:0xfff0c8})); bulb.position.copy(lamp.position); sc.add(bulb);
   const st=new THREE.BufferGeometry(), P3=[]; srand(7); for(let i=0;i<400;i++){ const a=rnd()*6.283, e=0.25+rnd()*1.2, r=500; P3.push(Math.cos(a)*Math.cos(e)*r,Math.sin(e)*r,Math.sin(a)*Math.cos(e)*r); }
   st.setAttribute("position",new THREE.Float32BufferAttribute(P3,3)); sc.add(new THREE.Points(st,new THREE.PointsMaterial({color:0xffffff,size:1.6,sizeAttenuation:false,fog:false}))); }
  /* 伴走車・周りの木・草 */
  PR.car(bs,C.x+5.5,0,C.z+6.5,0.3,true); PR.car(bs,C.x+4.2,0,C.z-7,-0.15,false);
  srand(131+s.day*7);
  for(let i=0;i<70;i++){ const px=rndr(-60,80), pz=rndr(-120,120); if(Math.abs(px)<6||(Math.abs(px-C.x)<9&&Math.abs(pz-C.z)<11)) continue;
   if(d1){ if(rnd()<0.25) PR.palm(bs,px,0,pz,rndr(0.8,1.2)); else PR.grass(bs,px,0,pz,rndr(0.8,1.4)); }
   else { const k=rnd(); if(k<0.18) PR.desertoak(bs,px,0,pz,rndr(0.7,1.2)); else if(k<0.3) PR.termite(bs,px,0,pz,rndr(0.6,1.1)); else PR.spinifex(bs,px,0,pz,rndr(0.8,1.4)); } }
  sc.add(bs.toGroup(new THREE.Group()));
  this.camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,0.1,900);
  if(!this._rs){ this._rs=true; addEventListener("resize",()=>{ if(this.camera){ this.camera.aspect=innerWidth/innerHeight; this.camera.updateProjectionMatrix(); } }); } },
 /* ---------- 見込みの計算 (走り方ごと。裏で少しずつ) ---------- */
 startEst(){ const s=Engine.st, d=this.tday(), st8=d===1&&s.gridStartH? s.gridStartH : 8;
  const o={abs:this.kind==="pm"? (s.day-1)*24+s.hour : (d-1)*24+Math.max(8,st8),km:s.km,soc:s.soc,trace:true}, base=Strategy.floor()-this.floorAdj();
  this.est={}; this.job={keys:Object.keys(this.STYLES),i:0,g:null,o,base,d,fx:this.flexPick(true)}; },
 tickEst(ms){ const j=this.job, t=performance.now(); try{
  while(j&&performance.now()-t<ms){ if(!j.g){ const k=j.keys[j.i]; j.g=Strategy.bestProfileGen({...j.o,floor:Math.max(0.02,j.base+this.adjOf(k,j.fx)/100),bet:!!this.STYLES[k].bet}); }
   const r=j.g.next(); if(!r.done) continue; const k=j.keys[j.i], v=r.value, rr=v&&v.r; j.g=null; j.i++;
   if(rr){ const tr=rr.trace||[], end=(j.d-1)*24+17.6, last=tr.filter(q=>q[1]<=end).pop(), kmD=last? last[0] : j.o.km, k0=tr.filter(q=>q[1]<=(j.d-1)*24+8).pop(), km0=k0? k0[0] : j.o.km;
    const cs=RP_CS.filter(c=>c.km>km0-0.2&&c.km<=kmD).pop()||null, eta=(km)=>{ const p=tr.find(q=>q[0]>=km); return p? p[1] : null; };
    this.est[k]={ok:v.ok,v:Math.round(v.v||0),kmDay:kmD,km0,cs,finish:rr.finishAbs,minSoc:rr.minSoc,eta,noon:(d)=>{ const p=tr.find(q=>q[1]>=(d-1)*24+12.5); return p? p[0] : null; }}; }
   if(this.ui) this.draw(true);   // 1 通り終わるごとに表示を更新
   if(j.i>=j.keys.length){ this.job=null; if(this.lines.some(l=>l.wait)) this.say(); break; } } }catch(e){ console.error(e); this.job=null; } },
 /* 予報の日射 (晴れの日に対する割合) と外れの幅: 決める日から 4 日 */
 forecast(){ if(this.wx) return this.wx; const s=Engine.st, L=Engine.FC_LEVEL[P.fcErr||"mid"], out=[], e=this.est&&this.est.std, d0=this.tday();
  for(let d=d0;d<=Math.min(d0+3,6);d++){ const km=d===s.day? s.km : (e&&e.noon(d))!=null? e.noon(d) : (d===d0? s.km : null); if(km==null) break;
   const k=this.sun(d,km,8,17), err=L&&s.fc? L.d*0.6*Engine.FC_LEAD(d-s.day) : 0; out.push({d,km,k,err,place:this.place(km)}); }
  if(this.est&&this.est.std) this.wx=out; return out; },
 /* 日射の割合 (予報): 日 d・位置 km・h0〜h1 時 */
 sun(d,km,h0,h1){ const s=Engine.st, save={doy:s.dayOfYear,km:s.km,w:s.weather}, pr=profileAt(km), doy=PRO.dayOfYear+d-1; let fc=0, cl=0;
  try{ Strategy.fcOn=true;
   for(let h=h0;h<h1;h+=0.5){ const abs=(d-1)*24+h; s.dayOfYear=doy; s.km=km;
    s.weather= RealWx.on()? null : ((s.fc&&s.fc.plan)||s.weatherPlan||[]).find(w=>abs>=w.start&&abs<w.start+w.dur)||null;
    const r=Engine.solarCalc(pr.lat,h,false,pr.lon,pr.elev); fc+=r.ghi||0;
    const sp=Phys.sunPos(pr.lat,pr.lon,doy,h); if(sp.alt>0){ const c=Phys.clearSky(sp.alt,pr.elev,doy); cl+=c.dni*Math.sin(sp.alt)+c.dhi; } }
  } finally{ Strategy.fcOn=false; s.dayOfYear=save.doy; s.km=save.km; s.weather=save.w; }
  return cl>0? clamp(fc/cl,0,1) : 1; },
 /* 朝の充電 (6:15〜8:00、傾けて) の見込み [Wh] */
 morningWh(d,km){ const s=Engine.st, save={doy:s.dayOfYear,km:s.km,w:s.weather}, pr=profileAt(km); let wh=0;
  try{ Strategy.fcOn=true; s.dayOfYear=PRO.dayOfYear+d-1; s.km=km;
   for(let h=6.25;h<8;h+=0.25){ const abs=(d-1)*24+h; s.weather= RealWx.on()? null : ((s.fc&&s.fc.plan)||s.weatherPlan||[]).find(w=>abs>=w.start&&abs<w.start+w.dur)||null;
    const r=Engine.solarCalc(pr.lat,h,true,pr.lon,pr.elev); wh+=P.arrayArea*P.cellEff*P.mpptEff*r.G*PVLoss.k(r.alt,true)*PRO.solarScale*0.92*0.25; }
  } finally{ Strategy.fcOn=false; s.dayOfYear=save.doy; s.km=save.km; s.weather=save.w; }
  return wh; },
 /* 臨機応変: 今日の残りの日射・明日の予報・電池で、攻め〜かなり守りを選ぶ (morning=true は朝の見込み用) */
 flexPick(morning){ const s=Engine.st; if(!s) return "std"; const d=morning? this.tday() : s.day, h=morning? 8 : clamp(s.hour,8,16.5), now=this.sun(d,s.km,h,17), tmr=d<6? this.sun(d+1,s.km+(morning?500:250),8,17) : 1, soc=s.soc;
  if(now<0.6||tmr<0.6) return "def2"; if(now<0.75||tmr<0.72) return "def";
  if(now>=0.95&&soc>=0.95&&tmr>=0.85) return "atk2"; if(now>=0.9&&soc>=0.8&&tmr>=0.8) return "atk"; return "std"; },
 /* 走行中 (main の loop から): 臨機応変なら 1 時間ごとに見直す */
 tick(es){ const c=es&&es.coffee; if(!c||c.style!=="flex"||es.camp||es.finished||!this.on()) return; const abs=(es.day-1)*24+es.hour; if(c.flexT!=null&&abs-c.flexT<1) return; this.reflex(es,"");},
 reflex(es,why){ const c=es.coffee; c.flexT=(es.day-1)*24+es.hour; const k=this.flexPick(false); if(k===c.flexK) return;
  c.flexK=k; if(typeof Strategy!=="undefined") Strategy.last=null; Radio.push(`臨機応変: ${why}ここからは「${this.STYLES[k].name}」で行きます (電池 ${(es.soc*100).toFixed(0)} %)。`,this.label("strat")); },
 place(km){ const c=RP_CS.filter(q=>q.km<=km+40).pop(); return c? `${c.name} 付近` : "Darwin 付近"; },
 recommend(){ const w=this.forecast()[0], s=Engine.st; if(!w) return "std"; if(w.k<0.6) return "def2"; if(w.k<0.75) return "def"; if(w.k>=0.95&&s.soc>=0.95) return "atk2"; if(w.k>=0.92&&s.soc>=0.85) return "atk"; return "std"; },
 /* ---------- 今日の記録 (夕方の振り返り) ---------- */
 today(){ const s=Engine.st, c=this.st(), L=c.log[s.day]||{}, C=RunLog.COLS, ix=(n)=>C.indexOf(n), R=RunLog.rows.filter(r=>r[ix("日")]===s.day);
  const iAbs=ix("経過h"), iKm=ix("km"), iSt=ix("状態"), iPm=ix("モーターW"), iD=ix("ドライバー"), iG=ix("累積発電Wh"), iU=ix("累積消費Wh");
  const o={km0:L.km0!=null? L.km0 : (R[0]? R[0][iKm] : s.km), gen:null, use:null, drv:{}, est:L.est||null, style:L.style||null};
  if(R.length>1){ o.gen=R[R.length-1][iG]-R[0][iG]; o.use=R[R.length-1][iU]-R[0][iU];
   for(let i=1;i<R.length;i++){ const p=R[i-1], r=R[i], dt=r[iAbs]-p[iAbs], dk=r[iKm]-p[iKm]; if(!(dt>0)||dt>0.5||!(dk>0)||p[iSt]!=="走行") continue;
    const q=o.drv[p[iD]||"―"]||(o.drv[p[iD]||"―"]={km:0,wh:0}); q.km+=dk; q.wh+=(Number.isFinite(r[iPm])?r[iPm]:0)*dt; } }
  const H=(typeof Orders!=="undefined"? Orders.hist : []).filter(h=>h.km>=o.km0-0.1&&h.km<=s.km+0.1); o.ord={n:H.length,A:H.filter(h=>h.grade==="A").length,C:H.filter(h=>h.grade==="C").length};
  return o; },
 rank(){ const s=Engine.st, T=(s.teams||[]).filter(t=>t.status!=="dnf"), r=1+T.filter(t=>t.km>s.km).length, a=T.filter(t=>t.km>s.km).sort((x,y)=>x.km-y.km)[0], b=T.filter(t=>t.km<=s.km).sort((x,y)=>y.km-x.km)[0], lead=T.reduce((m,t)=>Math.max(m,t.km),s.km);
  return {r,n:(s.teams||[]).length+1,ahead:a,behind:b,lead:lead-s.km,dnf:(s.teams||[]).length-T.length}; },
 /* ---------- 名前 ---------- */
 drivers(){ return typeof Crew!=="undefined"&&Crew.drivers&&Crew.drivers.length? Crew.drivers : [{name:"ドライバーA"}]; },
 drvName(){ const s=Engine.st, D=this.drivers(), p=this.st().plan[this.tday()]; const i=this.kind==="am"&&p? p.first : (typeof Crew!=="undefined"? Crew.driverIdx : 0); return (D[i]||D[0]).name; },
 label(role){ if(role==="drv") return `ドライバー ${this.drvName()}`; const n=P.crewNames&&P.crewNames[role]; return this.ROLES[role]+(n?` ${n}`:""); },
 /* ---------- セリフ: 1 人ずつ。話す人にカメラが寄る ---------- */
 say(){ const s=Engine.st, c=this.st(), p=c.plan[this.tday()]; this.lines=(this.kind==="pm"? this.talkPm(s,c,p) : this.talkAm(s,c,p)).map(([role,text,wait])=>({role,text,wait}));
  this.li=0; this.lt=0; this.drawTalk(); },
 talkTick(dtR){ const L=this.lines[this.li]; if(!L||L.done) return; this.lt+=dtR; if(this.lt>=Math.max(3.2,L.text.length*0.11)) this.nextLine(); },
 nextLine(){ const L=this.lines[this.li]; if(!L) return; if(this.li<this.lines.length-1){ this.li++; this.lt=0; } else L.done=true; this.drawTalk(); },
 drawTalk(){ const el=this.ui&&this.ui.querySelector(".cf-pop"); if(!el) return; const L=this.lines[this.li];
  if(!L||L.done){ el.classList.remove("on"); return; }
  el.style.setProperty("--rc",this.ROLE_C[L.role]||"#fff"); el.innerHTML=`<b>${escHtml(this.label(L.role))}</b><p>${L.text}</p><span class="cf-cnt">${this.li+1} / ${this.lines.length}</span>`;
  el.classList.remove("on"); void el.offsetWidth; el.classList.add("on"); },
 /* ---------- 画面 ---------- */
 showUI(on){ let u=this.ui; if(!u){ u=this.ui=document.createElement("div"); u.id="coffee"; document.getElementById("game-container").appendChild(u);
   u.addEventListener("click",e=>this.click(e)); u.addEventListener("change",e=>this.change(e)); }
  u.style.display=on?"":"none"; document.body.classList.toggle("coffee-on",!!on); this.draw(); },
 clock(){ const el=this.ui&&this.ui.querySelector(".cf-clk"); if(!el) return; const h=Engine.st.hour, t=`${Math.floor(h)}:${String(Math.floor(h%1*60)).padStart(2,"0")}`; if(el.textContent!==t) el.textContent=t; },
 draw(keepTalk){ const u=this.ui; if(!u||!this.active) return; const s=Engine.st, c=this.st(), p=c.plan[this.tday()]; if(!p) return; const ic=(n)=>typeof Team!=="undefined"? Team.ic(n) : "", S=this.SES[this.kind];
  const sp=P.coffeeSpeed===1? 1 : 2, steps=S.steps.map((n,i)=>`<button data-step="${i}" class="${i===this.step?"on":""}">${i+1}. ${this.kind==="am"&&s.day===1&&i===0?"予選とスタート順":n}</button>`).join("");
  const F=this.kind==="pm"? [this.p1,this.p2,this.p3,this.p4] : [this.s1,this.s2,this.s3,this.s4], body=F[this.step].call(this,s,c,p);
  const pop=keepTalk&&u.querySelector(".cf-pop"), tag=keepTalk&&u.querySelector(".cf-tag");
  if(pop){ u.querySelector(".cf-body").innerHTML=body; return; }
  u.innerHTML=`<div class="cf-top"><div class="cf-ttl"><span class="cf-kick">Day${s.day} ${S.title}</span><span class="cf-clk"></span></div>
   <div class="cf-ctl"><div class="seg cf-spd"><button data-spd="1" class="${sp===1?"on":""}">1×</button><button data-spd="2" class="${sp===2?"on":""}">2×</button></div>
   <button class="btn ana-sm" data-act="end">${ic("check")}${this.kind==="pm"?"話し合い終了":"打ち合わせ終了"}</button></div></div>
   <div class="cf-tag"></div><div class="cf-pop" data-act="skip"></div>
   <div class="cf-panel"><div class="cf-steps">${steps}</div><div class="cf-body">${body}</div>
   <div class="cf-nav"><button class="btn ana-sm" data-act="prev" ${this.step===0?"disabled":""}>前へ</button>${this.step<3?`<button class="btn ana-sm pri" data-act="next">次へ</button>`:`<button class="btn ana-sm pri" data-act="end">${this.kind==="pm"?"これで明日に備える (終了)":"これで行こう (終了)"}</button>`}</div></div>`;
  this.clock(); this.drawTalk(); },
 row(a,b){ return `<div class="cf-row"><span>${a}</span><b>${b}</b></div>`; },
 /* ===== 朝 ===== */
 /* 1: 昨日の振り返り (Day1: 予選とスタート順) */
 s1(s,c){ if(s.day===1){ const m=Math.round(((s.gridStartH||8)-8)*60);
   return this.row("予選タイム",s.qualiLap? fmtLap(s.qualiLap) : "未計測")+this.row("スタート順",`P${s.grid||"―"} / ${(s.teams||[]).length+1}`)+this.row("発進",`8:${String(m).padStart(2,"0")}`)+this.row("今日の最初の CS",`CS1 ${RP_CS[0].name} (${RP_CS[0].km.toFixed(0)} km)`); }
  const y=c.log[s.day-1]; if(!y) return `<div class="dim">昨日の記録がありません (打ち合わせをしなかった日)。</div>`+this.row("今の位置",`${s.km.toFixed(0)} km (${this.place(s.km)})`)+this.row("電池",`${(s.soc*100).toFixed(0)} %`);
  const end=y.kmEnd!=null? y.kmEnd : s.km, dist=end-y.km0, diff=y.est? end-y.est.km : null, nt=c.plan[s.day]&&c.plan[s.day].night;
  return this.row("走った距離",`${dist.toFixed(0)} km (${y.km0.toFixed(0)} → ${end.toFixed(0)} km)`)+this.row("止まった場所",this.place(end))
   +this.row("電池",`朝 ${(y.soc0*100).toFixed(0)} % → 夕方 ${y.socEnd!=null?(y.socEnd*100).toFixed(0):"―"} % → 今 ${(s.soc*100).toFixed(0)} %`)
   +this.row("走り方",this.STYLES[y.style||"std"].name)+(diff!=null? this.row("見込みとの差",`${diff>=0?"+":""}${diff.toFixed(0)} km (見込み ${y.est.km.toFixed(0)} km)`) : "")
   +(nt? this.row("昨夜の予定",`${this.STYLES[nt.style].name}${nt.km!=null?`・${nt.km.toFixed(0)} km まで`:""}`) : ""); },
 /* 2: 天気予報 */
 s2(s){ const W=this.forecast(); if(!W.length) return `<div class="dim">予報を計算中…</div>`;
  const off=!s.fc; return `<div class="cf-wx">${W.map(w=>{ const lo=Math.max(0,w.k-w.err), hi=Math.min(1,w.k+w.err);
   return `<div class="cf-wxr"><span>Day${w.d}<i>${w.place}</i></span><div class="cf-bar"><em style="left:${lo*100}%;width:${(hi-lo)*100}%"></em><b style="width:${w.k*100}%"></b></div><strong>${(w.k*100).toFixed(0)} %${w.err>0?`<i>±${(w.err*100).toFixed(0)}</i>`:""}</strong></div>`; }).join("")}</div>
   <div class="dim cf-note">8〜17 時の日射を、雲のない日を 100 % として表示。${off? "予報は外れない設定です。" : "帯は外れの幅 (先の日ほど広い)。"}${RealWx.on()?" 2025 年の実際の天気をもとにした予報。":""}</div>`; },
 /* 3: 走り方 (朝は今日・夕方は明日) */
 s3(s,c,p){ const rec=this.recommend(), nt=p.night;
  return `${nt&&this.kind==="am"?`<div class="dim cf-note" style="margin:0 0 4px">昨夜の予定: 「${this.STYLES[nt.style].name}」。新しい予報を見て変えられます。</div>`:""}<div class="cf-sty">${Object.entries(this.STYLES).map(([k,v])=>{ const e=this.est&&this.est[k];
   return `<button data-style="${k}" class="${p.style===k?"on":""}" title="${v.note}"><span class="cf-sn">${v.name}<em>${v.flex? "攻め〜かなり守り" : `${v.adj>0?"+":v.adj<0?"−":"±"}${Math.abs(v.adj)} %${v.bet?"・後半は快晴の見込み":""}`}</em>${k===rec?`<i>おすすめ</i>`:""}${e? `<b>${e.kmDay.toFixed(0)} km</b>` : ""}</span>
    ${e? `<span class="dim">${v.flex&&this.job==null?`${this.kind==="pm"?"明朝":"今朝"}は「${this.STYLES[this.flexPick(true)].name}」・`:""}${e.cs?`CS${e.cs.n} ${e.cs.name} まで・`:""}巡航 ${e.v} km/h・電池の最小 ${(e.minSoc*100).toFixed(0)} %・ゴール ${e.ok?fmtAbsH(e.finish):"届かない見込み"}</span>` : `<span class="dim">見込みを計算中…</span>`}</button>`; }).join("")}</div>
   <div class="dim cf-note">選んだ走り方は推奨速度と無線の速度指示に使います。% は電池を残す量 (普通に対して)、km は${this.kind==="pm"?"明日":"今日"}行けそうな位置。</div>`; },
 /* 4: ドライバー交代 */
 s4(s,c,p){ const D=this.drivers(), e=this.est&&(this.est[p.style]||this.est.std), lim=e? e.kmDay+0.1 : s.km+700, k0=e? e.km0 : s.km;
  const cs=RP_CS.filter(q=>q.km>k0-0.2&&q.km<=lim);
  const sel=`<label class="drvf"><span class="lb">最初に乗る人</span><select data-k="first">${D.map((d,i)=>`<option value="${i}" ${p.first===i?"selected":""}>${escHtml(d.name)}</option>`).join("")}</select></label>`;
  if(D.length<2) return sel+`<div class="dim cf-note">交代するには「車両・チームの設定」でドライバーを 2 人以上登録してください (最大 4 人)。</div>`;
  const list=cs.map(q=>{ const w=p.swaps.find(x=>x.n===q.n), t=e&&e.eta(q.km);
   return `<div class="cf-sw"><label class="chk"><input type="checkbox" data-sw="${q.n}" ${w?"checked":""}><i></i>CS${q.n} ${q.name}<span class="dim">${t!=null?` ${fmtAbsH(t)} ごろ`:""}</span></label>
    ${w? `<select data-to="${q.n}">${D.map((d,i)=>`<option value="${i}" ${w.to===i?"selected":""}>→ ${escHtml(d.name)}</option>`).join("")}</select>` : ""}</div>`; }).join("");
  return sel+`<div class="cf-sec">交代する CS (${this.kind==="pm"?"明日":"今日"}の見込みの範囲)</div>${list||`<div class="dim">CS に着かない見込みです。</div>`}
   <div class="dim cf-note">決めた CS に着くと、無線で知らせて乗る人を切り替えます (ドライバー成績も交代後の名前で記録)。</div>`; },
 /* ===== 夕方 ===== */
 /* 1: 今日の振り返り */
 p1(s){ const o=this.today(), dist=s.km-o.km0, diff=o.est? s.km-o.est.km : null;
  const drv=Object.entries(o.drv).filter(([,q])=>q.km>1).map(([n,q])=>this.row(`ドライバー ${escHtml(n)}`,`${q.km.toFixed(0)} km・${(q.wh/q.km).toFixed(1)} Wh/km`)).join("");
  return this.row("走った距離",`${dist.toFixed(0)} km (${o.km0.toFixed(0)} → ${s.km.toFixed(0)} km)`)+this.row("止まった場所",this.place(s.km))
   +(o.style? this.row("走り方",this.STYLES[o.style].name) : "")+(diff!=null? this.row("朝の見込みとの差",`${diff>=0?"+":""}${diff.toFixed(0)} km (見込み ${o.est.km.toFixed(0)} km)`) : "")
   +(o.gen!=null? this.row("発電 / 消費",`${(o.gen/1000).toFixed(2)} / ${(o.use/1000).toFixed(2)} kWh`) : "")+this.row("電池 (今)",`${(s.soc*100).toFixed(0)} %`)+drv
   +(o.ord.n? this.row("無線の速度指示",`${o.ord.n} 回・A ${o.ord.A}・C ${o.ord.C}`) : ""); },
 /* 2: 他チームとの差 */
 p2(s){ const r=this.rank(), g=(t)=>t? `${t.name} (${Math.abs(t.km-s.km).toFixed(0)} km)` : "―";
  return this.row("今の順位",`P${r.r} / ${r.n}`)+this.row("先頭との差",r.lead>0.5? `${r.lead.toFixed(0)} km` : "先頭")+this.row("すぐ前",g(r.ahead))+this.row("すぐ後ろ",g(r.behind))+(r.dnf? this.row("リタイア",`${r.dnf} チーム`) : "")
   +`<div class="dim cf-note">距離はルート上の位置の差。各チームとも夜は止まっています。</div>`; },
 /* 3: 明日の予定 (走り方・ドライバーの仮決め) */
 p3(s,c,p){ const W=this.forecast()[0]; return (W? this.row(`明日 (Day${W.d}) の日射予報`,`${(W.k*100).toFixed(0)} %${W.err>0?` ±${(W.err*100).toFixed(0)}`:""}`) : "")+this.s3(s,c,p)+`<div class="cf-sec">ドライバー</div>`+this.s4(s,c,p)
   +`<div class="dim cf-note">ここで決めたのは仮の予定です。朝の打ち合わせで、6:00 の新しい予報を見て確定します。</div>`; },
 /* 4: 夜の充電・朝の段取り */
 p4(s){ const d=s.day+1, wh=this.morningWh(d,s.km), sh=Engine.raceStartHour(), pen=s.morningPenaltyMin||0, pr=profileAt(s.km), sunset=Engine.sunsetHour(pr.lat,pr.lon);
  const hm=(h)=>`${Math.floor(h)}:${String(Math.round(h%1*60)).padStart(2,"0")}`;
  return this.row("今の電池",`${(s.soc*100).toFixed(0)} %`)+this.row("電池の切り離し","19:15〜翌 6:15")+this.row("朝の充電 (6:15〜8:00)",`約 ${(wh/1000).toFixed(2)} kWh (+${(wh/Math.max(500,P.batteryWh)*100).toFixed(0)} %)`)
   +this.row("明朝の電池 (見込み)",`約 ${Math.min(100,(s.soc+wh/Math.max(500,P.batteryWh))*100).toFixed(0)} %`)+this.row("傾ける角度",`${s.tiltDeg||40}°`)
   +this.row("明日の発進",`${hm(sh)}${pen>0?` (延長ペナルティ +${pen} 分)`:""}`)+this.row("明日の日没 (ここ)",`${hm(sunset)} ごろ`)+this.row("段取り","7:00 朝の打ち合わせ → 7:50 乗り込み"); },
 /* ===== セリフ ===== */
 talkAm(s,c,p){ const D=this.drivers(), e=this.est&&this.est[p.style];
  if(this.step===0){ if(s.day===1) return [["tm","おはよう。いよいよ本戦。まずはスタートまでの段取りから。"],["strat",`グリッドは P${s.grid||"―"}。最初の CS は ${RP_CS[0].name} です。`],["mech","車検後の点検は終わってます。タイヤ空気圧も OK。"],["body","パネルの清掃も済みました。"]];
   const y=c.log[s.day-1]; if(!y) return [["tm","おはよう。昨日の振り返りから。"],["elec",`電池は今 ${(s.soc*100).toFixed(0)} % です。`]];
   const end=y.kmEnd!=null? y.kmEnd : s.km, diff=y.est? end-y.est.km : null;
   return [["tm","おはよう。昨日の振り返りから。"],["strat",`昨日は ${(end-y.km0).toFixed(0)} km。${diff==null?"":Math.abs(diff)<15?"ほぼ見込みどおりでした。":diff>0?`見込みより ${diff.toFixed(0)} km 先まで行けました。`:`見込みより ${(-diff).toFixed(0)} km 手前で止まりました。`}`],
    ["elec",`朝の充電で電池は ${(s.soc*100).toFixed(0)} % まで戻っています。`],["mech","夜のうちに足回りを点検しました。問題なしです。"]]; }
  if(this.step===1){ const W=this.forecast(), w=W[0], bad=W.slice(1).sort((a,b)=>a.k-b.k)[0];
   if(!w) return [["strat","予報をまとめています。",true]];
   return [["strat",`今日の日射は晴れの日の約 ${(w.k*100).toFixed(0)} %。${w.k<0.75?"雲が多めです。":w.k>0.92?"ほぼ快晴の見込み。":"ところどころ雲。"}`],
    ["elec",w.k<0.75? "発電は落ちそうです。電池の減りに注意します。" : "発電は十分見込めます。"],
    ...(bad? [["strat",`この先では Day${bad.d} が一番弱くて約 ${(bad.k*100).toFixed(0)} %。${bad.err>0?"先の日ほど外れやすいので幅を見てください。":""}`]] : [])]; }
  if(this.step===2){ const r=this.recommend(), er=this.est&&this.est[r];
   return [["strat",er? `おすすめは「${this.STYLES[r].name}」。今日は ${er.kmDay.toFixed(0)} km あたりまで行けそうです。` : "見込みを計算しています。",!er],["tm","どれで行くか決めよう。"]]; }
  const first=D[p.first]; return [["tm",`最初は ${first?first.name:"―"} で。交代する CS を決めておこう。`],["drv",e&&e.cs? `了解です。今日は CS${e.cs.n} まで見込みですね。`:"了解です。"],["body","乗り込みは 7:50 から。キャノピーの準備はできてます。"]]; },
 talkPm(s,c,p){ const D=this.drivers();
  if(this.step===0){ const o=this.today(), dist=s.km-o.km0, diff=o.est? s.km-o.est.km : null, ds=Object.entries(o.drv).filter(([,q])=>q.km>1).sort((a,b)=>a[1].wh/a[1].km-b[1].wh/b[1].km);
   return [["tm","お疲れさま。今日の振り返りをしよう。"],["strat",`今日は ${dist.toFixed(0)} km。${diff==null?"":Math.abs(diff)<15?"朝の見込みどおりです。":diff>0?`見込みより ${diff.toFixed(0)} km 先まで来ました。`:`見込みより ${(-diff).toFixed(0)} km 足りませんでした。`}`],
    ["elec",o.gen!=null? `発電 ${(o.gen/1000).toFixed(1)} kWh、消費 ${(o.use/1000).toFixed(1)} kWh。電池は ${(s.soc*100).toFixed(0)} % です。` : `電池は ${(s.soc*100).toFixed(0)} % です。`],
    ...(ds.length? [["drv",ds.length>1? `電費は ${ds[0][0]} が一番良くて ${(ds[0][1].wh/ds[0][1].km).toFixed(1)} Wh/km でした。` : `今日は ${(ds[0][1].wh/ds[0][1].km).toFixed(1)} Wh/km で走れました。`]] : []),
    ["mech","このあとタイヤとブレーキを点検します。"]]; }
  if(this.step===1){ const r=this.rank();
   return [["strat",`今は P${r.r} / ${r.n}。${r.ahead?`すぐ前の ${r.ahead.name} とは ${(r.ahead.km-s.km).toFixed(0)} km。`:"先頭です。"}`],["tm",r.behind&&s.km-r.behind.km<30? `後ろの ${r.behind.name} が近い。明日の朝は気を抜かずに行こう。` : "自分たちのペースを守ろう。"]]; }
  if(this.step===2){ const w=this.forecast()[0], r=this.recommend(), er=this.est&&this.est[r];
   return [["strat",w? `明日の日射予報は約 ${(w.k*100).toFixed(0)} %。${er?`「${this.STYLES[r].name}」なら ${er.kmDay.toFixed(0)} km あたりまで。`:""}` : "明日の予報をまとめています。",!er],["tm","明日の走り方とドライバーを仮で決めておこう。朝の予報で確定する。"],["drv","明日もいけます。"]]; }
  const wh=this.morningWh(s.day+1,s.km), pen=s.morningPenaltyMin||0;
  return [["elec",`19:15 に電池を切り離します。朝の充電で約 ${(wh/1000).toFixed(1)} kWh 戻る見込みです。`],["body",`朝は ${s.tiltDeg||40}° で傾けます。夜露でパネルが濡れたら拭きます。`],["mech","夜のうちにタイヤの空気圧と配線を確認しておきます。"],
   ["tm",`明日は ${pen>0?`延長ペナルティで ${pen} 分遅れて`:"8:00 に"}発進。7:00 に打ち合わせ、7:50 から乗り込み。今日はしっかり休もう。`]]; },
 click(e){ const b=e.target.closest("button,.cf-pop"); if(!b) return; const s=Engine.st, p=this.st().plan[this.tday()];
  if(b.classList.contains("cf-pop")){ this.nextLine(); return; }
  if(b.dataset.spd){ P.coffeeSpeed=+b.dataset.spd; if(typeof Settings!=="undefined") Settings.save(); this.draw(true); this.ui.querySelectorAll(".cf-spd button").forEach(x=>x.classList.toggle("on",+x.dataset.spd===P.coffeeSpeed)); return; }
  if(b.dataset.step!=null){ this.step=+b.dataset.step; this.draw(); this.say(); return; }
  if(b.dataset.style){ p.style=b.dataset.style; this.draw(true); return; }
  const a=b.dataset.act; if(a==="next"){ this.step=Math.min(3,this.step+1); this.draw(); this.say(); } else if(a==="prev"){ this.step=Math.max(0,this.step-1); this.draw(); this.say(); } else if(a==="end") this.finish(); },
 change(e){ const t=e.target, p=this.st().plan[this.tday()], D=this.drivers();
  if(t.dataset.k==="first"){ p.first=+t.value; }
  else if(t.dataset.sw){ const n=+t.dataset.sw; if(t.checked){ const prev=[...p.swaps].filter(w=>w.n<n).sort((a,b)=>b.n-a.n)[0], cur=prev? prev.to : p.first; p.swaps.push({n,to:(cur+1)%D.length}); p.swaps.sort((a,b)=>a.n-b.n); } else p.swaps=p.swaps.filter(w=>w.n!==n); }
  else if(t.dataset.to){ const w=p.swaps.find(x=>x.n===+t.dataset.to); if(w) w.to=+t.value; }
  this.draw(true); },
 /* ---------- 走行中 ---------- */
 onCS(cp){ const s=Engine.st; if(s&&s.coffee&&s.coffee.style==="flex") this.reflex(s,`CS${cp.n} で見直し。`); if(!s||!s.coffee||typeof Crew==="undefined") return; const p=s.coffee.plan[s.day]; if(!p||s.coffee.done!==s.day) return; const w=p.swaps.find(x=>x.n===cp.n); if(!w) return;
  const d=Crew.drivers[w.to]; if(!d) return; if(w.to!==Crew.driverIdx) Crew.setDriver(w.to);
  Radio.push(`CS${cp.n}: 朝の打ち合わせどおり、ここで ${d.name} に交代。`,this.label("tm")); toast(`ドライバー交代 → ${escHtml(d.name)}`,"#34d399"); },
 onCamp(s){ if(!s.coffee) return; const l=s.coffee.log[s.day]; if(l){ l.kmEnd=s.km; l.socEnd=s.soc; } },
};
