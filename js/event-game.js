"use strict";
/* ============ イベントモード (来場者体験): 課題クリア型・約 8 分 ============
 走行はレースモードの仕組み (実際の町並み・信号・ロードトレイン・CS) をそのまま使い、課題ごとに場所へ移る。
 課題: 1 交通ルール / 2 省エネ巡航 / 3 ロードトレイン / 4 CS で停車と充電 / 5 ゴールをめざせ
 難易度: 子ども (ハンドル補助・接触の減点小) / 大人
 その日のランキングと 1 位のゴースト (端末に保存)、走行のリプレイ URL を QR コードで持ち帰り */
const EVENT_PUBLIC_URL="https://kentarokiyono.github.io/energy-management/";
const EventGame={
DUR:480, active:false, level:"adult", replay:null, ghostRun:null,
MISSIONS:[
 {id:"rules", title:"交通ルール", km:0, hour:10.0, cap:150,
  goal:"赤信号では停止線の手前で止まろう。右折の前にはウインカー (C キー / ハンドルのボタン) を出そう。制限速度も守ろう。",
  tip:"ソーラーカーも普通の車と同じ交通ルールで走ります。レース中も信号や制限速度は守らないとペナルティです。"},
 {id:"eco", title:"省エネ巡航", km:40, hour:11.0, cap:100,
  goal:"速度を 70〜90 km/h に保って電池を節約しよう。途中で雲やスコールが来て発電が減るよ。",
  tip:"空気抵抗は速度の 2 乗で増えるので、速く走るほど電池の減りが一気に大きくなります。一定の速度で走るのがいちばん省エネ。"},
 {id:"train", title:"ロードトレイン", km:null, cap:60,
  goal:"前から全長 53 m の大型トラックが来るよ。左に寄って、速度を落として安全にすれ違おう。",
  tip:"オーストラリアの内陸では、トレーラーを 3 両もつないだ『ロードトレイン』が時速 100 km で走っています。風圧で車体があおられることも。"},
 {id:"cs", title:"CS で停車と充電", km:319.6, hour:13.0, cap:150,
  goal:"25 km/h 以下でコントロールストップ (Katherine) に入って停車しよう。止まったら太陽に向けてパネルの角度を選んで充電！",
  tip:"コントロールストップでは 30 分止まる決まり。その間、パネルを太陽に向けて傾けて充電します。角度ひとつで発電量が大きく変わります。"},
 {id:"goal", title:"ゴールをめざせ", km:null, cap:1e9,
  goal:"残り時間でできるだけ遠くへ！ でも電池を使い切らないように。",
  tip:"本番のレースは約 3,000 km を 5 日ほどで走ります。最後は残った電池を使い切るように走るのが作戦です。"},
],
/* ---------- 開始・終了 ---------- */
prepare(){ // startGame から: 内部はレースモードとして動かす
 this.active=true; P.event=true; P._modeSel="event"; P.mode="race"; P._crewSave=P.crewProc; P.crewProc=false; P.timeScale=60;
},
begin(){
 const s=Engine.st;
 this.t=0; this.mi=-1; this.scores=[0,0,0,0,0]; this.rec=[]; this.recT=0; this.hits=0; this.done=false; this.cardOpen=false;
 s.weatherPlan=null; s.weather=null; s.nextRoadTrainH=99; s.dcDone=true; s.gear="D";
 document.getElementById("event-hud").classList.remove("hidden");
 this.ensureHud();
 if(!this.replay) this.ghostRun=this.ghostRun||this.todayBest();
 this.buildGhost();
 this.next();
},
end(){ // メニューへ戻るとき
 if(!this.active) return;
 this.active=false; P.event=false; P.mode=P._modeSel||"event"; if(P._crewSave!=null) P.crewProc=P._crewSave;
 this.replay=null; this.closeCard(); this.hideResult();
 if(this.ghost&&View.scene) View.scene.remove(this.ghost); this.ghost=null;
 document.getElementById("event-hud").classList.add("hidden");
},
/* ---------- 課題の切り替え ---------- */
next(){
 this.mi++;
 if(this.mi>=this.MISSIONS.length){ this.finish(); return; }
 const m=this.MISSIONS[this.mi];
 if(this.replay){ this.enter(m); return; }
 this.showCard(m,()=>this.enter(m));
},
enter(m){
 const s=Engine.st;
 this.mt=0; this.st={};
 if(m.km!=null) this.jump(m.km,m.hour);
 this.st.km0=s.km; this.st.soc0=s.soc; this.st.motorWh=0;
 if(m.id==="rules"){ this.st.red=0; this.st.over=0; this.st.turns={}; this.st.missSig=0; }
 if(m.id==="eco"){ this.st.inBand=0; s.v=Math.max(s.v,75/3.6); s.throttleSet=0.55; }
 if(m.id==="train"){ this.spawnTrain(); this.st.judged=false; }
 if(m.id==="cs"){ this.st.entryOk=null; this.st.stopped=false; s.v=60/3.6; s.throttleSet=0.4; }
 this.hudMission();
},
jump(km,hour){
 const s=Engine.st;
 s.km=km; s.hour=hour; s.day=1; s.v=0; s.throttleSet=0; s.brakePhys=0; s.brakeRegen=0; s.signal=0; s.gear="D";
 s.stopTimer=0; s.stopKind=""; s.camp=false; s.weather=null; s.offRoute=false;
 for(const c of RP_CS) if(c.km<km) s.passedCP.add(c.km);
 for(const rt of View.roadTrains) View.scene.remove(rt.mesh); View.roadTrains.length=0;
 View.resetRoad(); View.cx=undefined;
},
spawnTrain(){
 const t=View.mkRoadTrain(); View.scene.add(t);
 View.roadTrains.push({mesh:t, sVis:View.s+520, warned:false, ev:true});
 Radio.push("前方からロードトレイン接近中！ 左に寄って減速してください。","偵察車");
},
/* ---------- 毎フレーム (Engine.step の前) ---------- */
frame(dtR){
 if(!this.active||this.done||this.cardOpen) return;
 const s=Engine.st, m=this.MISSIONS[this.mi]; if(!m) return;
 this.t+=dtR; this.mt+=dtR;
 s.hour=Math.min(s.hour,15.5);                      // 体験中は日が暮れない
 if(s.soc<0.12) s.soc=0.12;                          // 電欠で止まらない
 if(this.replay){ this.replayFrame(); return; }
 if(this.level==="kid") this.assist();
 // 記録 (1 秒ごと): [課題, 課題内の秒, km, 横位置, 速度]
 this.recT+=dtR; if(this.recT>=1){ this.recT-=1; this.rec.push([this.mi,Math.round(this.mt),s.km,View.lateral||0,s.v]); }
 this.st.motorWh+=(s.lastMotorW||0)*dtR*Route.scaleAt(s.km)/3600;
 const kmh=s.v*3.6;
 if(m.id==="rules"){
  if(kmh>speedLimitAt(s.km)+3) this.st.over+=dtR;
  for(const mn of RP_MANEUVERS) if(mn.km<1.2&&(mn.turn==="R"||mn.turn==="L")){
   const k=mn.km, st=this.st.turns[k]||(this.st.turns[k]={sig:false,done:false});
   if(s.km>k-0.09&&s.km<k+0.01&&s.signal===(mn.turn==="R"?1:-1)) st.sig=true;
   if(!st.done&&s.km>k+0.03){ st.done=true; if(!st.sig){ this.st.missSig++; toast("⚠ ウインカーを出し忘れた","#f59e0b"); } else toast("👍 ウインカー OK","#34d399"); } }
  this.scores[0]=Math.max(0,100-30*this.st.red-Math.round(2*this.st.over)-20*this.st.missSig-this.hitPen(0));
  if(s.km>1.3||this.mt>m.cap) this.next();
 } else if(m.id==="eco"){
  const lo=this.level==="kid"?55:70, hi=this.level==="kid"?95:90;
  if(kmh>=lo&&kmh<=hi) this.st.inBand+=dtR;
  // 天気: 30〜60 秒は曇り、60〜80 秒はスコール
  s.weather= this.mt>30&&this.mt<60? {type:"cloud",factor:0.35} : this.mt>=60&&this.mt<80? {type:"squall",factor:0.12} : null;
  const dkm=Math.max(0.1,s.km-this.st.km0), e=this.st.motorWh/dkm, ref=this.refWhPerKm();
  this.scores[1]=Math.round(50*this.st.inBand/Math.max(1,this.mt)+50*clamp((ref*1.6-e)/(ref*0.8),0,1))-this.hitPen(1);
  if(this.mt>m.cap){ s.weather=null; this.next(); }
 } else if(m.id==="train"){
  const rt=View.roadTrains.find(r=>r.ev);
  if(rt){ const rel=rt.sVis-View.s;
   if(!this.st.judged&&Math.abs(rel)<14){ this.st.judged=true;
    const lat=View.lateral, latOk=lat<=-1.2, spdOk=kmh<=80;
    this.scores[2]=Math.max(0,(latOk?60:Math.round(60*clamp((0.6-lat)/1.8,0,1)))+(spdOk?40:Math.round(40*clamp((100-kmh)/20,0,1)))-this.hitPen(2));
    toast(latOk&&spdOk?"👍 安全にすれ違えた！":"⚠ もっと左に寄って減速しよう",latOk&&spdOk?"#34d399":"#f59e0b"); }
   if(rel<-70||this.mt>m.cap) this.next(); }
  else this.next();
 } else if(m.id==="cs"){
  const c=RP_CS[0];
  if(this.st.entryOk==null&&s.km>c.km-0.25){ this.st.entryOk=kmh<=26; if(!this.st.entryOk) toast("⚠ CS への進入は 25 km/h 以下","#f59e0b"); }
  if(this.st.stopped&&s.stopTimer<=0){ this.next(); return; }
  if(this.mt>m.cap&&!this.st.stopped) this.next();
 } else if(m.id==="goal"){
  const d=s.km-this.st.km0;
  this.scores[4]=Math.round(clamp(d/2,0,80)+20*clamp((s.soc-0.12)/0.5,0,1))-this.hitPen(4);
 }
 if(this.t>=this.DUR) this.finish();
 this.ghostFrame();
},
hitPen(i){ return (this.hitBy&&this.hitBy[i]||0); },
/* 80 km/h で走るときの 1 km あたりの消費 [Wh/km] (省エネ採点の基準) */
refWhPerKm(){ const V=80/3.6, m=massTotal(); return (Phys.crr(V)*m*9.81+0.5*1.17*P.Cd*P.frontal*V*V)/0.95/3.6/1000*1000/1; },
/* 子どもモード: 左車線の中央を保つようにハンドルを補助 */
assist(){
 if(!View.road) return;
 const p=View.roadPoint(View.s+8), want=-Math.min(2.4,(p.L||5)/2), he=Math.atan2(Math.sin(p.h-View.ch),Math.cos(p.h-View.ch));
 const a=clamp(he*2.2+(want-View.lateral)*0.12,-1,1);
 Input.steer=clamp(Input.steer*0.4+a*0.6,-1,1);
},
/* ---------- 外からの通知 ---------- */
onRedRun(){ if(this.active&&this.MISSIONS[this.mi]&&this.MISSIONS[this.mi].id==="rules"){ this.st.red++; } },
onHit(hit){
 const s=Engine.st; if(hit.level==="touch") return;
 const now=performance.now(); if(now<(this._hitCd||0)) return; this._hitCd=now+2000;
 const pen= hit.level==="light"? 2 : (this.level==="kid"?5:15);
 this.hitBy=this.hitBy||[0,0,0,0,0]; this.hitBy[this.mi]=(this.hitBy[this.mi]||0)+pen;
 if(hit.level!=="light") s.v=0;
 Snd.bang(); toast(`💥 ぶつかった！ −${pen} 点`,"#ef4444");
},
onTrainHit(){ this.onHit({level:"heavy"}); if(this.MISSIONS[this.mi]&&this.MISSIONS[this.mi].id==="train"&&!this.st.judged){ this.st.judged=true; this.scores[2]=0; } },
onCS(cp,missed){
 const m=this.MISSIONS[this.mi]; if(!m||m.id!=="cs") return;
 const s=Engine.st; this.st.stopped=true;
 this.st.dist=missed? 999 : Math.abs(s.km-cp.km)*1000;
 this.csScore();
},
onTilt(){ const m=this.MISSIONS[this.mi]; if(!m||m.id!=="cs") return; const s=Engine.st;
 const pw=(a)=>{ const keep=s.tiltDeg; s.tiltDeg=a; const prof=profileAt(s.km), sol=Engine.solarCalc(prof.lat,s.hour,true); s.tiltDeg=keep; return sol.G; };
 let best=0; for(let a=0;a<=80;a+=5) best=Math.max(best,pw(a));
 this.st.tiltRatio= best>0? pw(s.tiltDeg)/best : 1; this.csScore();
 toast(`☀ 最適角度の ${(this.st.tiltRatio*100).toFixed(0)} % の発電`,"#fbbf24"); },
csScore(){ const t=this.st;
 this.scores[3]=Math.max(0,Math.round((t.entryOk===false?0:20)+40*clamp(1-(t.dist==null?999:t.dist)/60,0,1)+40*(t.tiltRatio||0))-this.hitPen(3)); },
/* ---------- 課題カード ---------- */
showCard(m,cb){
 this.cardOpen=true; modalPause=true;
 let el=document.getElementById("ev-card");
 if(!el){ el=document.createElement("div"); el.id="ev-card"; el.style.cssText="position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(0,0,10,.6)"; document.body.appendChild(el); }
 const n=this.mi+1, N=this.MISSIONS.length;
 el.innerHTML=`<div class="panel px-8 py-6 text-center" style="max-width:560px">
  <div class="text-xs tracking-[.3em] text-cyan-500">MISSION ${n} / ${N}</div>
  <div class="text-3xl font-black text-amber-300 my-2">${m.title}</div>
  <div class="text-base text-cyan-50 mb-3">${m.goal}</div>
  <div class="text-xs text-left text-emerald-200 border border-emerald-700 rounded p-2 mb-3">💡 ${m.tip}</div>
  <div class="text-sm text-cyan-200">アクセル / スペース / クリックでスタート <span id="ev-card-cd" class="mono"></span></div></div>`;
 el.style.display="flex";
 let left=10; const cd=()=>{ const e=document.getElementById("ev-card-cd"); if(e) e.textContent=`(${left})`; };
 cd();
 const go=()=>{ if(!this.cardOpen) return; this.closeCard(); cb(); };
 this._cardTimer=setInterval(()=>{ left--; cd(); if(left<=0) go(); },1000);
 this._cardKey=(e)=>{ if(e.type==="keydown"&&!(e.key===" "||e.key==="Enter"||e.key==="ArrowUp"||e.key.toLowerCase()==="w")) return; go(); };
 setTimeout(()=>{ if(!this.cardOpen) return; addEventListener("keydown",this._cardKey); el.addEventListener("click",this._cardKey); },400);
 this._cardPad=setInterval(()=>{ if(Input.gamepadOK&&Input.gpThrottle>0.6) go(); },100);
},
closeCard(){
 this.cardOpen=false; modalPause=false; lastT=performance.now();
 clearInterval(this._cardTimer); clearInterval(this._cardPad);
 if(this._cardKey){ removeEventListener("keydown",this._cardKey); const el=document.getElementById("ev-card"); if(el){ el.removeEventListener("click",this._cardKey); el.style.display="none"; } }
},
/* ---------- HUD ---------- */
ensureHud(){
 if(document.getElementById("event-mission")) return;
 const h=document.getElementById("event-hud").firstElementChild;
 const d=document.createElement("div"); d.id="event-mission"; d.className="text-sm text-cyan-100 mt-1"; h.appendChild(d);
},
hudMission(){ const m=this.MISSIONS[this.mi], e=document.getElementById("event-mission"); if(e&&m) e.textContent=`MISSION ${this.mi+1}: ${m.title}`+(this.replay?" (リプレイ)":""); },
hud(){
 if(!this.active) return;
 const rem=Math.max(0,this.DUR-this.t);
 document.getElementById("event-timer").textContent=`${Math.floor(rem/60)}:${String(Math.floor(rem%60)).padStart(2,"0")}`;
 document.getElementById("event-score").textContent=this.total();
},
total(){ return this.scores.reduce((a,b)=>a+Math.max(0,b||0),0); },
/* ---------- 終了と結果 ---------- */
finish(){
 if(this.done) return; this.done=true; running=false; Snd.update(0,0,false);
 const total=this.total();
 if(this.replay){ this.showResult(total,null); return; }
 this.encode().then(code=>{ this.code=code; this.showResult(total,code); });
},
stamp(total){ return total>=380?["🥇 GOLD","#fbbf24"]: total>=260?["🥈 SILVER","#cbd5e1"]:["🥉 BRONZE","#d97706"]; },
showResult(total,code){
 let el=document.getElementById("ev-result");
 if(!el){ el=document.createElement("div"); el.id="ev-result"; el.style.cssText="position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 30%,#123045 0%,#05070d 70%);overflow:auto"; document.body.appendChild(el); }
 const [st,col]=this.stamp(total), rows=this.MISSIONS.map((m,i)=>`<tr><td class="pr-4">${i+1}. ${m.title}</td><td class="text-right mono">${Math.max(0,this.scores[i]||0)}</td></tr>`).join("");
 const url= code? EVENT_PUBLIC_URL+"#r="+code : "";
 const rank=this.rankList();
 el.innerHTML=`<div class="panel px-8 py-6 text-center" style="max-width:820px;margin:20px">
  <div class="text-xs tracking-[.4em] text-cyan-600">${this.replay?"REPLAY":"RESULT"} ― ${this.level==="kid"?"こども":"おとな"}</div>
  <div style="color:${col};font-size:2.4rem;font-weight:900">${st}</div>
  <div class="text-4xl font-black text-amber-300 mb-3">${total} 点</div>
  <div class="flex flex-wrap gap-6 justify-center text-left">
   <div><table class="text-sm">${rows}</table>
    ${this.replay?"":`<div class="mt-3 text-sm">ニックネーム <input id="ev-name" maxlength="12" class="bg-slate-900 border border-cyan-700 rounded px-2 py-1 text-sm" style="width:9em" value="${this.defaultName()}">
    <button class="btn text-xs" onclick="EventGame.register()">ランキングに登録</button></div>`}
    <div class="mt-3 text-xs text-cyan-200/70">今日のランキング</div>
    <ul id="ev-rank" class="text-sm mono">${rank}</ul></div>
   ${url?`<div class="text-center"><div id="ev-qr" style="background:#fff;padding:8px;display:inline-block"></div>
    <div class="text-xs text-cyan-100/70 mt-1" style="max-width:260px">QR を読み取ると、家で自分の走りを 3D で再生でき、<br>そのゴーストと対戦できます</div></div>`:""}
  </div>
  <div class="flex gap-2 justify-center mt-4">
   ${this.replay?`<button class="btn" onclick="EventGame.raceGhost()">👻 このゴーストと走る</button>`:`<button class="btn" onclick="EventGame.again()">もう一度</button>`}
   <button class="btn btn-amber" onclick="EventGame.toMenu()">メニューへ</button></div></div>`;
 el.style.display="flex";
 if(url) this.drawQR(url);
},
hideResult(){ const el=document.getElementById("ev-result"); if(el) el.style.display="none"; },
drawQR(url){
 const box=document.getElementById("ev-qr"); if(!box||typeof qrcode==="undefined"){ if(box) box.textContent=url; return; }
 try{ const q=qrcode(0,"L"); q.addData(url,"Byte"); q.make(); const n=q.getModuleCount(); box.innerHTML=q.createImgTag(Math.max(2,Math.floor(240/n)),8); }
 catch(e){ box.textContent="QR を作れませんでした"; }
},
defaultName(){ return "PLAYER "+String(1+this.rank().length).padStart(2,"0"); },
again(){ this.hideResult(); this.end(); P.mode="event"; startGame(); },
toMenu(){ this.hideResult(); this.end(); quitToMenu(); },
raceGhost(){ const g=this.replay; this.hideResult(); this.end(); this.ghostRun=g; P.mode="event"; startGame(); },
/* ---------- ランキング (端末に保存・日ごと) ---------- */
dayKey(){ const d=new Date(); return "bwsc_evrank_"+d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate(); },
rank(){ try{ return JSON.parse(localStorage.getItem(this.dayKey())||"[]"); }catch(e){ return []; } },
rankList(){ const r=this.rank(); return r.length? r.slice(0,10).map((x,i)=>`<li>${i+1}. ${x.n.replace(/[<>&]/g,"")} ― ${x.s} 点 ${x.lv==="kid"?"(こども)":""}</li>`).join("") : "<li class='text-cyan-100/40'>まだ登録がありません</li>"; },
register(){
 if(this._registered) return; this._registered=true;
 const n=(document.getElementById("ev-name").value||this.defaultName()).slice(0,12), r=this.rank();
 r.push({n,s:this.total(),lv:this.level,ts:Date.now(),r:this.code||""}); r.sort((a,b)=>b.s-a.s);
 try{ localStorage.setItem(this.dayKey(),JSON.stringify(r.slice(0,50))); }catch(e){}
 document.getElementById("ev-rank").innerHTML=this.rankList(); toast("🏆 登録しました","#34d399");
},
todayBest(){ const r=this.rank().find(x=>x.r); if(!r) return null; try{ return this.decodeSync(r.r); }catch(e){ return null; } },
/* ---------- ゴースト ---------- */
buildGhost(){
 if(this.ghost&&View.scene) View.scene.remove(this.ghost); this.ghost=null;
 if(!this.ghostRun||this.replay) return;
 const g=View.mkAICar(); g.traverse(o=>{ if(o.material){ o.material=o.material.clone(); o.material.transparent=true; o.material.opacity=0.35; o.material.depthWrite=false; if(o.material.color) o.material.color.setHex(0x7fdcff); } });
 g.visible=false; View.scene.add(g); this.ghost=g;
},
ghostFrame(){
 const g=this.ghost; if(!g) return; const run=this.ghostRun;
 const smp=run.samples.filter(q=>q[0]===this.mi); if(smp.length<2){ g.visible=false; return; }
 let i=smp.findIndex(q=>q[1]>this.mt); if(i<=0){ g.visible=false; return; }
 const a=smp[i-1], b=smp[i], t=clamp((this.mt-a[1])/((b[1]-a[1])||1),0,1);
 const km=lerp(a[2],b[2],t), lat=lerp(a[3],b[3],t), s=View.sOfKm(km);
 if(s<0||s>View.road.builtS-1){ g.visible=false; return; }
 const p=View.roadPoint(s); g.position.set(p.x+Math.cos(p.h)*lat,p.y,p.z+Math.sin(p.h)*lat); g.rotation.y=-p.h; g.visible=true;
},
/* ---------- リプレイ URL (走行の軌跡を圧縮して URL へ) ---------- */
// 1 サンプル (2 秒ごと): [課題(3bit)|速度/5(5bit)] [横位置 0.1 m int8] [km の差 m (zigzag varint)]
pack(){
 const out=[1,this.level==="kid"?1:0], total=this.total(); out.push(total>>8&255,total&255);
 for(let i=0;i<5;i++) out.push(clamp(Math.max(0,this.scores[i]||0),0,255));
 let prevMi=-1, prevKm=0;
 const smp=this.rec.filter((_,i)=>i%2===0);
 out.push(smp.length>>8&255,smp.length&255);
 const vint=(n)=>{ n=n<0? (-n*2-1) : n*2; do{ let b=n&127; n=Math.floor(n/128); if(n) b|=128; out.push(b); }while(n); };
 for(const [mi,mt,km,lat,v] of smp){
  out.push((mi&7)<<5|clamp(Math.round(v*3.6/5),0,31)); out.push((clamp(Math.round(lat*10),-127,127)+256)&255);
  const m=Math.round(km*1000); vint(mi!==prevMi? m : m-prevKm); prevMi=mi; prevKm=m; out.push(clamp(mt,0,255)); }
 return new Uint8Array(out);
},
unpack(u){
 let p=0; const ver=u[p++]; if(ver!==1) throw new Error("ver");
 const lv=u[p++]?"kid":"adult", total=u[p++]<<8|u[p++], scores=[]; for(let i=0;i<5;i++) scores.push(u[p++]);
 const n=u[p++]<<8|u[p++], samples=[]; let prevMi=-1, prevKm=0;
 const vint=()=>{ let n=0,m=1,b; do{ b=u[p++]; n+=(b&127)*m; m*=128; }while(b&128); return n&1? -(n+1)/2 : n/2; };
 for(let i=0;i<n;i++){ const b0=u[p++], mi=b0>>5, v=(b0&31)*5/3.6; let lat=u[p++]; if(lat>127) lat-=256; const d=vint(); const km=mi!==prevMi? d : prevKm+d; prevMi=mi; prevKm=km; const mt=u[p++];
  samples.push([mi,mt,km/1000,lat/10,v]); }
 return {lv,total,scores,samples};
},
b64(u){ let s=""; for(const b of u) s+=String.fromCharCode(b); return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); },
unb64(t){ const s=atob(t.replace(/-/g,"+").replace(/_/g,"/")); const u=new Uint8Array(s.length); for(let i=0;i<s.length;i++) u[i]=s.charCodeAt(i); return u; },
async encode(){
 const raw=this.pack();
 if(typeof CompressionStream!=="undefined"){ try{ const cs=new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate-raw")); const z=new Uint8Array(await new Response(cs).arrayBuffer()); return "z"+this.b64(z); }catch(e){} }
 return "u"+this.b64(raw);
},
async decode(code){
 if(code[0]==="z"){ const ds=new Blob([this.unb64(code.slice(1))]).stream().pipeThrough(new DecompressionStream("deflate-raw")); return this.unpack(new Uint8Array(await new Response(ds).arrayBuffer())); }
 return this.unpack(this.unb64(code.slice(1)));
},
decodeSync(code){ return this._decoded&&this._decoded[code]; },
/* ---------- リプレイ再生 ---------- */
startReplay(run){ this.replay=run; this.level=run.lv; P.mode="event"; startGame(); },
replayFrame(){
 const run=this.replay, s=Engine.st;
 const smp=run.samples.filter(q=>q[0]===this.mi);
 if(!smp.length){ this.next(); return; }
 const last=smp[smp.length-1];
 if(this.mt>last[1]+0.5){ this.scores[this.mi]=run.scores[this.mi]; this.next(); return; }
 let i=smp.findIndex(q=>q[1]>this.mt); if(i<0) i=smp.length-1; const a=smp[Math.max(0,i-1)], b=smp[i], t=clamp((this.mt-a[1])/((b[1]-a[1])||1),0,1);
 const km=lerp(a[2],b[2],t), lat=lerp(a[3],b[3],t), sv=View.sOfKm(km);
 if(sv>=0&&sv<View.road.builtS-1){ const p=View.roadPoint(sv); View.cx=p.x+Math.cos(p.h)*lat; View.cz=p.z+Math.sin(p.h)*lat; View.ch=p.h; }
 s.v=0; this._rv=lerp(a[4],b[4],t); this.scores[this.mi]=run.scores[this.mi];
},
post(){ if(this.active&&this.replay&&!this.done&&this._rv!=null) Engine.st.v=this._rv; this.hud(); },
};
/* ページを開いたとき: リプレイ URL (#r=...) なら再生、ランキングのゴーストを読み込む */
addEventListener("load",async()=>{
 const m=location.hash.match(/#r=([A-Za-z0-9_-]+)/);
 // 端末に保存したランキングのリプレイを先に展開 (ゴースト用)
 EventGame._decoded={}; for(const x of EventGame.rank()) if(x.r){ try{ EventGame._decoded[x.r]=await EventGame.decode(x.r); }catch(e){} }
 if(m){ try{ const run=await EventGame.decode(m[1]); history.replaceState(null,"",location.pathname); setTimeout(()=>EventGame.startReplay(run),300); }catch(e){ console.warn("replay decode",e); } }
});
