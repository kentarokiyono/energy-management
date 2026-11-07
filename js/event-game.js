"use strict";
/* ============ イベントモード (来場者体験): 課題クリア型・10 分 ============
 コースを選ぶ:
  オーストラリア: レースモードの仕組み (実際の町並み・信号・ロードトレイン・CS) で課題ごとに場所へ移る。
   1 交通ルール / 2 省エネ巡航 / 3 ロードトレイン / 4 CS で停車と充電 (ここまで約 5 分)
   5 Devils Marbles 付近の砂漠 / 6 Port Augusta へ下るアップダウン (最後の 5 分)
  ヒドゥンバレー: 車検 (8 の字 / スラローム / 制動) を約 3〜5 分、残りはサーキット走行 (ベストラップで採点)
 難易度: 子ども (速度帯が広い・接触の減点小) / 大人
 その日のランキング (コースごと)・1 位のゴースト (端末に保存)、オーストラリア版は走行のリプレイ URL を QR コードで持ち帰り */
const EVENT_PUBLIC_URL="https://kentarokiyono.github.io/energy-management/";
const EventGame={
DUR:600, practice:true, active:false, level:"adult", course:"aus", replay:null, ghostRun:null, hilly:false,
COURSES:{
 aus:[
 {id:"rules", title:"交通ルール", km:0, hour:10.0, cap:100,
  goal:"赤信号では停止線の手前で止まろう。右折の前にはウインカー (C キー / ハンドルのボタン) を出そう。制限速度も守ろう。",
  tip:"ソーラーカーも普通の車と同じ交通ルールで走ります。レース中も信号や制限速度は守らないとペナルティです。"},
 {id:"eco", title:"省エネ巡航", km:40, hour:11.0, cap:70,
  goal:"速度を 70〜90 km/h に保って電池を節約しよう。途中で雲やスコールが来て発電が減るよ。",
  tip:"空気抵抗は速度の 2 乗で増えるので、速く走るほど電池の減りが一気に大きくなります。一定の速度で走るのがいちばん省エネ。"},
 {id:"train", title:"ロードトレイン", km:null, cap:45,
  goal:"前から全長 53 m の大型トラックが来るよ。左に寄って、速度を落として安全にすれ違おう。",
  tip:"オーストラリアの内陸では、トレーラーを 3 両もつないだ『ロードトレイン』が時速 100 km で走っています。風圧で車体があおられることも。"},
 {id:"cs", title:"CS で停車と充電", km:320.8, hour:13.0, cap:85,
  goal:"25 km/h 以下でコントロールストップ (Katherine) に入って停車しよう。止まったら太陽に向けてパネルの角度を選んで充電！",
  tip:"コントロールストップでは 30 分止まる決まり。その間、パネルを太陽に向けて傾けて充電します。角度ひとつで発電量が大きく変わります。"},
 {id:"desert", title:"赤い砂漠を走る", km:1070, hour:10.5, cap:150, distFull:170, place:[1083,1095,"📍 Devils Marbles (Karlu Karlu)"],
  goal:"オーストラリアの真ん中、赤い大地の一本道。できるだけ遠くへ、でも電池は残そう。途中の巨大な丸い岩に注目！",
  tip:"Devils Marbles (先住民の言葉で Karlu Karlu) は、直径数 m の花崗岩の丸い岩が積み重なる名所。約 17 億年前の岩が風雨で削られて丸くなりました。先住民の聖地でもあります。"},
 {id:"pa", title:"Port Augusta へ", km:2625, hour:14.5, cap:150, distFull:110, hilly:true, place:[2716,2722,"📍 Port Augusta"],
  goal:"高原から海辺の町へ下るアップダウンの道。上り坂では電池が減り、下り坂では回生ブレーキで取り戻せるよ。町に入ったら制限速度に注意。",
  tip:"Port Augusta はスペンサー湾のいちばん奥にある町で『アウトバックの入口』と呼ばれます。東には Flinders 山脈。ここから南は畑と海の景色に変わり、ゴールの Adelaide まであと約 300 km です。"},
 ],
 hv:[
 {id:"hv-fig8", kind:"fig8", title:"車検: 8 の字", cap:75,
  goal:"内円半径 6 m の 8 の字を、コースからはみ出さずに走ろう。片側 9 秒・合計 18 秒未満で合格。",
  tip:"本番の車検でも 8 の字走行があります。ソーラーカーは車体が長く、小回りが苦手。ハンドルを早めに切るのがコツ。"},
 {id:"hv-slalom", kind:"slalom", title:"車検: スラローム", cap:60,
  goal:"18 m 間隔のパイロン 7 本を、ぶつけずに 11.5 秒未満で抜けよう。",
  tip:"スラロームは急なハンドル操作でも車が安定しているかの確認。横風に強いかどうかも大事な性能です。"},
 {id:"hv-brake", kind:"brake", title:"車検: 制動テスト", cap:60,
  goal:"40 km/h 以上で白線を通過したら全力でブレーキ。14 m 以内に止まれば合格。",
  tip:"ソーラーカーは軽くてタイヤが細いので、止まるのが難しい乗り物。ブレーキ性能は安全のための最重要チェックです。"},
 {id:"hv-circuit", kind:"circuit", title:"サーキット走行", cap:1e9,
  goal:"Hidden Valley Raceway を周回しよう。ベストラップで採点。コースアウトや接触に注意！",
  tip:"本番ではこのサーキットのタイムでスタート順が決まります。速いチームは 1 周 2 分 20 秒台。"},
 ],
},
get MISSIONS(){ return this.COURSES[this.course]||this.COURSES.aus; },
/* ---------- 開始・終了 ---------- */
prepare(){ // startGame から: 内部はレースモードとして動かす
 this.active=true; P.event=true; P._modeSel="event"; P._crewSave=P.crewProc; P.crewProc=false; P.timeScale=60;
 if(this.course==="hv"){ P.mode="test"; P.testKind="fig8"; } else P.mode="race";
},
begin(){
 const s=Engine.st;
 this.t=0; this.mi=-1; this.scores=this.MISSIONS.map(()=>0); this.hitBy=this.MISSIONS.map(()=>0); this.rec=[]; this.recT=0; this.done=false; this.cardOpen=false; this._registered=false; this.hilly=false;
 s.weatherPlan=null; s.weather=null; s.nextRoadTrainH=99; s.dcDone=true; s.gear="D";
 s.teams=[];   // 他チームの車は出さない (CS などで前に止まって進めなくなるため)
 document.getElementById("event-hud").classList.remove("hidden");
 this.ensureHud();
 if(this.course==="aus"){ if(!this.replay) this.ghostRun=this.ghostRun||this.todayBest(); this.buildGhost(); } else this.ghostRun=null;
 if(this.practice&&!this.replay) this.tutorial(()=>this.next()); else this.next();
},
end(){ // メニューへ戻るとき
 if(!this.active) return;
 this.active=false; P.event=false; P.mode=P._modeSel||"event"; this.hilly=false; if(P._crewSave!=null) P.crewProc=P._crewSave; if(Test.active) Test.active=false;
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
 this.mt=0; this.recT=0; this.st={}; this.hilly=!!m.hilly;
 if(m.kind){ this.hvEnter(m); this.hudMission(); return; }
 if(m.km!=null) this.jump(m.km,m.hour);
 this.st.km0=s.km; this.st.soc0=s.soc; this.st.motorWh=0;
 if(m.id==="rules"){ this.st.red=0; this.st.over=0; this.st.turns={}; this.st.missSig=0; }
 if(m.id==="eco"){ this.st.inBand=0; s.v=Math.max(s.v,75/3.6); s.throttleSet=0.55; }
 if(m.id==="train"){ this.spawnTrain(); this.st.judged=false; }
 if(m.id==="cs"){ this.st.entryOk=null; this.st.stopped=false; s.v=50/3.6; s.throttleSet=0.3; }
 if(m.distFull){ s.v=70/3.6; s.throttleSet=0.5; s.soc=Math.max(s.soc,0.75); }
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
 if(m.kind){ this.recT+=dtR; if(this.recT>=1){ this.recT-=1; this.rec.push([this.mi,Math.round(this.mt),Test.x,Test.z]); }
  this.hvFrame(m); if(this.t>=this.DUR) this.finish(); return; }
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
  // 天気: 20〜40 秒は曇り、40〜55 秒はスコール
  s.weather= this.mt>20&&this.mt<40? {type:"cloud",factor:0.35} : this.mt>=40&&this.mt<55? {type:"squall",factor:0.12} : null;
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
 } else if(m.distFull){   // 最後の走行区間: 距離と電池残量
  const d=s.km-this.st.km0;
  this.scores[this.mi]=Math.round(70*clamp(d/m.distFull,0,1)+30*clamp((s.soc-0.12)/0.6,0,1))-this.hitPen(this.mi);
  const pl=m.place, e=document.getElementById("event-mission");
  if(e) e.textContent=`MISSION ${this.mi+1}: ${m.title}`+(pl&&s.km>pl[0]&&s.km<pl[1]? "  "+pl[2] : "");
  if(this.mt>m.cap) this.next();
 }
 if(this.t>=this.DUR) this.finish();
 this.ghostFrame();
},
hitPen(i){ return (this.hitBy&&this.hitBy[i]||0); },
/* ---------- ヒドゥンバレー: 車検とサーキット (予選モードの試験を使う) ---------- */
hvEnter(m){ Test.start(m.kind); this.st.res=null; },
hvFrame(m){
 if(m.kind==="circuit"){ const b=Test.best; this.scores[this.mi]=b? Math.max(0,Math.round(100*clamp((300-b)/150,0,1))-this.hitPen(this.mi)) : 0; return; }
 if(this.st.res&&performance.now()>this.st.resAt) this.next();
 else if(!this.st.res&&this.mt>m.cap){ toast("⏱ 時間切れ","#f59e0b"); this.next(); }
},
/* 予選の試験が終わったとき (Test.finish から): 合格 100 点・不合格 40 点。サーキットでの事故は減点して走り直し */
hvResult(title,rows,pass){
 const m=this.MISSIONS[this.mi]; if(!m||!m.kind||this.st.res) return;
 if(m.kind==="circuit"){ this.hitBy[this.mi]+=this.level==="kid"?5:15; toast(`${title} ― −${this.level==="kid"?5:15} 点。スタートから走り直し`,"#ef4444"); setTimeout(()=>{ if(this.active) Test.retry(); },1200); return; }
 this.st.res=title; this.st.resAt=performance.now()+2500;
 this.scores[this.mi]=Math.max(0,(pass?100:40)-this.hitPen(this.mi));
 toast(`${title} ― ${this.scores[this.mi]} 点`,pass?"#34d399":"#f59e0b");
},
/* 80 km/h で走るときの 1 km あたりの消費 [Wh/km] (省エネ採点の基準) */
refWhPerKm(){ const V=80/3.6, m=massTotal(); return (Phys.crr(V)*m*9.81+0.5*1.17*P.Cd*P.frontal*V*V)/0.95/3.6/1000*1000/1; },
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
/* ---------- 操作の練習 (はじめての人向け・30 秒ほど): 実際に操作できたら次へ。8 秒たったら自動で次へ ---------- */
tutorial(done){
 this.cardOpen=true; modalPause=true;
 const K=Input.keys, hv=this.course==="hv", seen={l:false,r:false};
 const steps=[
  {t:"アクセル",d:"W ・ ↑ ・ アクセルペダル",ic:"zap",ok:()=>K["w"]||K["arrowup"]||Input.gpThrottle>0.3},
  {t:"ハンドル",d:"A D ・ ← → ・ ハンドルを左右に",ic:"wheel",ok:()=>{ if(K["a"]||K["arrowleft"]||Input.gpSteer<-0.35) seen.l=true; if(K["d"]||K["arrowright"]||Input.gpSteer>0.35) seen.r=true; return seen.l&&seen.r; }},
  {t:"ブレーキ",d:"スペース ・ ブレーキペダル",ic:"stop",ok:()=>K[" "]||Input.gpBrake>0.3},
  ...(hv?[]:[{t:"ウインカー",d:"Z (左) ・ C (右) ― 曲がる前に出す",ic:"left",ok:()=>K["z"]||K["c"]}])];
 let el=document.getElementById("ev-tut"); if(!el){ el=document.createElement("div"); el.id="ev-tut"; el.style.cssText="position:fixed;inset:0;z-index:61;display:flex;align-items:center;justify-content:center;background:rgba(5,5,6,.6)"; document.body.appendChild(el); }
 el.style.display="flex";
 let i=0, t0=performance.now(), doneAt=0, raf=0;
 const finish=()=>{ cancelAnimationFrame(raf); el.style.display="none"; removeEventListener("keydown",skip,true); this.cardOpen=false; modalPause=false; lastT=performance.now(); const s=Engine.st; if(s){ s.signal=0; s.throttleSet=0; } for(const k in K) K[k]=false; done(); };
 const skip=(e)=>{ if(e.key==="Enter"||e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); finish(); } };
 addEventListener("keydown",skip,true);
 const draw=()=>{ const left=Math.max(0,8-(performance.now()-t0)/1000);
  el.innerHTML=`<div class="card2" style="width:min(620px,calc(100vw - 32px))">
   <div class="hd"><span class="lb">Practice ― 操作の練習</span><img src="assets/img/logo.svg" class="logo" width="56" alt=""></div>
   ${i<steps.length?`<h2 style="display:flex;gap:14px;align-items:center"><span style="color:var(--acc)">${ic(steps[i].ic)}</span>${steps[i].t}</h2>
   <div style="font-size:18px;line-height:1.8">${steps[i].d}</div>
   <div class="bar" style="margin:14px 0 4px"><i style="width:${left/8*100}%"></i></div>`:`<h2 style="color:var(--ok)">${ic("ok","ok")} 準備 OK</h2>`}
   <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:12px">${steps.map((s,k)=>`<span style="display:flex;gap:6px;align-items:center;color:${k<i?"var(--ok)":k===i?"var(--tx)":"var(--dim)"}">${k<i?ic("check"):ic(s.ic)}${s.t}</span>`).join("")}</div>
   <div class="lb" style="margin-top:14px">できたら自動で次へ ・ Enter でとばす</div></div>`; };
 const loop=()=>{ raf=requestAnimationFrame(loop); if(typeof pollGamepad==="function") pollGamepad();
  if(i<steps.length){ if(steps[i].ok()||performance.now()-t0>8000){ Snd.blip&&Snd.blip(900,0.06); i++; t0=performance.now(); } }
  else if(!doneAt) doneAt=performance.now(); else if(performance.now()-doneAt>900){ finish(); return; }
  draw(); };
 draw(); loop();
},
/* ---------- ニックネームをハンドルコントローラーで入れる (ハンドル = 文字を選ぶ、アクセル = 入れる、ブレーキ = 消す、ボタン = 登録) ---------- */
NICK_CH:"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-.!",
nickPad(){
 const box=document.getElementById("ev-nickpad"), inp=document.getElementById("ev-name"); if(!box||!inp) return;
 const CH=this.NICK_CH; let cur=0, last=0, pAcc=false, pBrk=false, pBtn=false;
 const draw=()=>{ box.innerHTML=[...CH].map((c,k)=>`<span class="${k===cur?"on":""}">${c}</span>`).join("")+`<span class="del${cur===CH.length?" on":""}">けす</span>`; };
 box.onclick=(e)=>{ const sp=e.target.closest("span"); if(!sp) return; if(sp.classList.contains("del")) inp.value=inp.value.slice(0,-1); else if(inp.value.length<12) inp.value+=sp.textContent; };
 const loop=()=>{ if(!document.getElementById("ev-nickpad")||document.getElementById("ev-result").style.display==="none"||this._registered) return; requestAnimationFrame(loop);
  if(typeof pollGamepad==="function") pollGamepad(); if(!Input.gamepadOK) return;
  const now=performance.now(), st=Input.gpSteer||0;
  if(Math.abs(st)>0.45&&now-last>(Math.abs(st)>0.85?90:200)){ cur=(cur+(st>0?1:-1)+CH.length+1)%(CH.length+1); last=now; draw(); }
  const acc=Input.gpThrottle>0.6, brk=Input.gpBrake>0.6, btn=!!Input.gpRegen;
  if(acc&&!pAcc){ if(cur===CH.length) inp.value=inp.value.slice(0,-1); else if(inp.value.length<12) inp.value+=CH[cur]; }
  if(brk&&!pBrk) inp.value=inp.value.slice(0,-1);
  if(btn&&!pBtn) this.register();
  pAcc=acc; pBrk=brk; pBtn=btn; };
 draw(); loop();
},
/* ---------- 課題カード ---------- */
showCard(m,cb){
 this.cardOpen=true; modalPause=true;
 let el=document.getElementById("ev-card");
 if(!el){ el=document.createElement("div"); el.id="ev-card"; el.style.cssText="position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(5,5,6,.55)"; document.body.appendChild(el); }
 const n=this.mi+1, N=this.MISSIONS.length;
 el.innerHTML=`<div class="card2" style="width:min(620px,calc(100vw - 32px))">
  <div class="hd"><span class="lb">Mission ${n} / ${N}</span><img src="assets/img/logo.svg" class="logo" width="64" alt=""></div>
  <h2>${m.title}</h2>
  <div style="font-size:15px;line-height:1.9">${m.goal}</div>
  <div class="tip">${m.tip}</div>
  <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;margin-top:18px"><span class="lb">アクセル / スペース / クリックでスタート <span id="ev-card-cd" class="num"></span></span><span class="btn pri">${ic("play")} START</span></div></div>`;
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
 const d=document.createElement("div"); d.id="event-mission"; d.className="text-sm mt-1"; d.style.color="var(--tx2)"; h.appendChild(d);
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
stamp(total){ const mx=100*this.MISSIONS.length; return total>=0.76*mx?["GOLD","#e2b21f"]: total>=0.52*mx?["SILVER","#c9ccd0"]:["BRONZE","#c07a3a"]; },
showResult(total,code){
 let el=document.getElementById("ev-result");
 if(!el){ el=document.createElement("div"); el.id="ev-result"; el.style.cssText="position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:#0d0e10;overflow:auto"; document.body.appendChild(el); }
 const [st,col]=this.stamp(total), rows=this.MISSIONS.map((m,i)=>`<tr style="border-bottom:1px solid #1d2024"><td class="pr-6 py-1"><span class="num" style="color:var(--dim);margin-right:8px">${i+1}</span>${m.title}</td><td class="text-right num">${Math.max(0,this.scores[i]||0)}</td></tr>`).join("");
 const url= code? EVENT_PUBLIC_URL+"#r="+code : "";
 const rank=this.rankList();
 el.innerHTML=`<div class="card2" style="width:min(860px,calc(100vw - 32px));margin:20px">
  <div class="hd"><span class="lb">${this.replay?"Replay":"Result"} ― ${this.course==="hv"?"ヒドゥンバレー":"オーストラリア"} ― ${this.level==="kid"?"こども":"おとな"}</span><img src="assets/img/logo.svg" class="logo" width="80" alt=""></div>
  <div style="display:flex;align-items:baseline;gap:22px;margin:8px 0 18px"><span class="num" style="font-size:56px;line-height:1">${total}<span class="u">点</span></span>
   <span style="display:flex;gap:8px;align-items:center;color:${col};font-family:var(--fn);font-weight:700;font-size:22px;letter-spacing:.16em">${ic("medal")}${st}</span></div>
  <div class="flex flex-wrap gap-8 text-left">
   <div><table class="text-sm">${rows}</table>
    ${this.replay?"":`<div class="mt-4 text-sm" style="display:flex;gap:8px;align-items:center"><span class="lb">Nickname</span><input id="ev-name" maxlength="12" class="px-2 py-1 text-sm" style="width:9em" value="${this.defaultName()}">
    <button class="btn text-xs" onclick="EventGame.register()">ランキングに登録</button></div>
    <div id="ev-nickpad" class="nickpad"></div><div class="lb" style="text-transform:none;letter-spacing:.04em;margin-top:4px">ハンドル: 文字を選ぶ ・ アクセル: 入れる ・ ブレーキ: 消す ・ ボタン: 登録</div>`}
    <div class="lb mt-5 mb-1">今日のランキング</div>
    <ul id="ev-rank" class="text-sm mono">${rank}</ul></div>
   ${url?`<div class="text-center"><div id="ev-qr" style="background:#fff;padding:8px;display:inline-block"></div>
    <div class="text-xs text-cyan-100/70 mt-1" style="max-width:260px">QR を読み取ると、家で自分の走りを 3D で再生できます${this.course==="aus"?"。<br>そのゴーストと対戦もできます":""}</div></div>`:""}
  </div>
  <div class="flex gap-2 justify-end mt-5">
   ${this.replay?(this.course==="aus"?`<button class="btn" onclick="Fade.go(()=>EventGame.raceGhost())">👻 このゴーストと走る</button>`:""):`<button class="btn pri" onclick="Fade.go(()=>EventGame.again())">${ic("refresh")} もう一度</button>`}
   <button class="btn" onclick="Fade.go(()=>EventGame.toMenu())">${ic("home")} メニューへ</button></div></div>`;
 el.style.display="flex";
 if(url) this.drawQR(url);
 if(!this.replay) this.nickPad();
},
hideResult(){ const el=document.getElementById("ev-result"); if(el) el.style.display="none"; },
drawQR(url){
 const box=document.getElementById("ev-qr"); if(!box||typeof qrcode==="undefined"){ if(box) box.textContent=url; return; }
 try{ const q=qrcode(0,"L"); q.addData(url,"Byte"); q.make(); const n=q.getModuleCount(); box.innerHTML=q.createImgTag(Math.max(2,Math.floor(220/n)),8); }
 catch(e){ box.textContent="QR を作れませんでした"; }
},
defaultName(){ return "PLAYER "+String(1+this.rank().length).padStart(2,"0"); },
again(){ this.hideResult(); this.end(); P.mode="event"; startGame(); },
toMenu(){ this.hideResult(); this.end(); quitToMenu(); },
raceGhost(){ const g=this.replay; this.hideResult(); this.end(); this.ghostRun=g; this.course="aus"; P.mode="event"; startGame(); },
/* ---------- ランキング (端末に保存・日ごと) ---------- */
dayKey(){ const d=new Date(); return "bwsc_evrank_"+(this.course==="hv"?"hv_":"")+d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate(); },
rank(){ try{ return JSON.parse(localStorage.getItem(this.dayKey())||"[]"); }catch(e){ return []; } },
rankList(){ const r=this.rank(); return r.length? r.slice(0,10).map((x,i)=>`<li>${i+1}. ${escHtml(String(x.n).slice(0,12))} ― ${x.s} 点 ${x.lv==="kid"?"(こども)":""}</li>`).join("") : "<li class='text-cyan-100/40'>まだ登録がありません</li>"; },
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
pack(step){
 if(this.course==="hv") return this.packHV(step||1);
 const out=[2,this.level==="kid"?1:0], total=this.total(); out.push(total>>8&255,total&255);
 out.push(this.scores.length); for(let i=0;i<this.scores.length;i++) out.push(clamp(Math.max(0,this.scores[i]||0),0,255));
 let prevMi=-1, prevKm=0;
 const smp=this.rec.filter((_,i)=>i%2===0);
 out.push(smp.length>>8&255,smp.length&255);
 const vint=(n)=>{ n=n<0? (-n*2-1) : n*2; do{ let b=n&127; n=Math.floor(n/128); if(n) b|=128; out.push(b); }while(n); };
 for(const [mi,mt,km,lat,v] of smp){
  out.push((mi&7)<<5|clamp(Math.round(v*3.6/5),0,31)); out.push((clamp(Math.round(lat*10),-127,127)+256)&255);
  const m=Math.round(km*1000); vint(mi!==prevMi? m : m-prevKm); prevMi=mi; prevKm=m; out.push(clamp(mt,0,255)); }
 return new Uint8Array(out);
},
/* ヒドゥンバレー (ver 3): 1 サンプル = [課題] [課題内の秒] [x の差] [z の差] (0.25 m 単位, zigzag varint)。課題が変わったら絶対値 */
packHV(step){
 const out=[3,this.level==="kid"?1:0], total=this.total(); out.push(total>>8&255,total&255);
 out.push(this.scores.length); for(let i=0;i<this.scores.length;i++) out.push(clamp(Math.max(0,this.scores[i]||0),0,255));
 const smp=this.rec.filter((q,i)=>i%step===0||(i>0&&this.rec[i-1][0]!==q[0]));
 out.push(smp.length>>8&255,smp.length&255);
 const vint=(n)=>{ n=n<0? (-n*2-1) : n*2; do{ let b=n&127; n=Math.floor(n/128); if(n) b|=128; out.push(b); }while(n); };
 let prevMi=-1, px=0, pz=0;
 for(const [mi,mt,x,z] of smp){ const qx=Math.round(x*4), qz=Math.round(z*4); out.push(mi&15, clamp(mt,0,255));
  if(mi!==prevMi){ vint(qx); vint(qz); } else { vint(qx-px); vint(qz-pz); } prevMi=mi; px=qx; pz=qz; }
 return new Uint8Array(out);
},
unpack(u){
 let p=0; const rd=()=>{ if(p>=u.length) throw new Error("short"); return u[p++]; };
 const ver=rd(); if(ver!==1&&ver!==2&&ver!==3) throw new Error("ver");
 const lv=rd()?"kid":"adult", total=Math.min(rd()<<8|rd(),1000), scores=[], ns=ver===1?5:Math.min(rd(),8); for(let i=0;i<ns;i++) scores.push(Math.min(rd(),100));
 if(ver===3){ const n=Math.min(rd()<<8|rd(),4000), samples=[]; let prevMi=-1, px=0, pz=0;
  const vint=()=>{ let n=0,m=1,b,k=0; do{ b=rd(); n+=(b&127)*m; m*=128; if(++k>5) throw new Error("varint"); }while(b&128); return n&1? -(n+1)/2 : n/2; };
  for(let i=0;i<n;i++){ const mi=rd()&15, mt=rd(), dx=vint(), dz=vint(); if(mi!==prevMi){ px=dx; pz=dz; } else { px+=dx; pz+=dz; } prevMi=mi;
   if(Math.abs(px)>40000||Math.abs(pz)>40000) throw new Error("xz"); samples.push([mi,mt,px/4,pz/4]); }
  return {course:"hv",lv,total,scores,samples}; }
 const n=Math.min(rd()<<8|rd(),4000), samples=[]; let prevMi=-1, prevKm=0;
 const vint=()=>{ let n=0,m=1,b,k=0; do{ b=rd(); n+=(b&127)*m; m*=128; if(++k>5) throw new Error("varint"); }while(b&128); return n&1? -(n+1)/2 : n/2; };
 for(let i=0;i<n;i++){ const b0=rd(), mi=b0>>5, v=(b0&31)*5/3.6; let lat=rd(); if(lat>127) lat-=256; const d=vint(); const km=mi!==prevMi? d : prevKm+d; prevMi=mi; prevKm=km; const mt=rd();
  if(!(Math.abs(km)<4e6)) throw new Error("km");
  samples.push([mi,mt,km/1000,lat/10,v]); }
 return {course:"aus",lv,total,scores,samples};
},
b64(u){ let s=""; for(const b of u) s+=String.fromCharCode(b); return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); },
unb64(t){ const s=atob(t.replace(/-/g,"+").replace(/_/g,"/")); const u=new Uint8Array(s.length); for(let i=0;i<s.length;i++) u[i]=s.charCodeAt(i); return u; },
async encode(){
 let code="";
 for(const step of [1,2,3,4]){ const raw=this.pack(step);
  code="u"+this.b64(raw);
  if(typeof CompressionStream!=="undefined"){ try{ const cs=new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate-raw")); const z=new Uint8Array(await new Response(cs).arrayBuffer()); code="z"+this.b64(z); }catch(e){} }
  if(code.length<=2200||this.course!=="hv") break; }   // QR に入る長さまで記録を間引く
 return code;
},
REPLAY_MAX_CODE:12000, REPLAY_MAX_BYTES:65536,
async decode(code){
 if(typeof code!=="string"||code.length<2||code.length>this.REPLAY_MAX_CODE||!/^[zu][A-Za-z0-9_-]+$/.test(code)) throw new Error("code");
 if(code[0]==="z"){
  const rd=new Blob([this.unb64(code.slice(1))]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader(), parts=[]; let len=0;
  for(;;){ const {done,value}=await rd.read(); if(done) break; len+=value.length; if(len>this.REPLAY_MAX_BYTES){ rd.cancel(); throw new Error("too large"); } parts.push(value); }
  const u=new Uint8Array(len); let o=0; for(const x of parts){ u.set(x,o); o+=x.length; } return this.unpack(u); }
 return this.unpack(this.unb64(code.slice(1)));
},
decodeSync(code){ return this._decoded&&this._decoded[code]; },
/* ---------- リプレイ再生 ---------- */
startReplay(run){ this.replay=run; this.level=run.lv; this.course=run.course||"aus"; P.mode="event"; Fade.go(startGame); },
replayFrame(){
 const run=this.replay, s=Engine.st, m=this.MISSIONS[this.mi];
 if(m&&m.kind){   // ヒドゥンバレー: 記録した位置をなめらかにつないで車を動かす
  const smp=run.samples.filter(q=>q[0]===this.mi); if(!smp.length){ this.next(); return; }
  this.scores[this.mi]=run.scores[this.mi];
  if(this.mt>smp[smp.length-1][1]+0.5){ this.next(); return; }
  this._hvPose=this.hvPose(smp,this.mt); return; }
 const smp=run.samples.filter(q=>q[0]===this.mi);
 if(!smp.length){ this.next(); return; }
 const last=smp[smp.length-1];
 if(this.mt>last[1]+0.5){ this.scores[this.mi]=run.scores[this.mi]; this.next(); return; }
 let i=smp.findIndex(q=>q[1]>this.mt); if(i<0) i=smp.length-1; const a=smp[Math.max(0,i-1)], b=smp[i], t=clamp((this.mt-a[1])/((b[1]-a[1])||1),0,1);
 const km=lerp(a[2],b[2],t), lat=lerp(a[3],b[3],t), sv=View.sOfKm(km);
 if(sv>=0&&sv<View.road.builtS-1){ const p=View.roadPoint(sv); View.cx=p.x+Math.cos(p.h)*lat; View.cz=p.z+Math.sin(p.h)*lat; View.ch=p.h; }
 s.v=0; this._rv=lerp(a[4],b[4],t); this.scores[this.mi]=run.scores[this.mi];
},
hvPose(smp,t){
 let i=0; while(i<smp.length-2&&smp[i+1][1]<=t) i++;
 const a=smp[Math.max(0,i-1)], b=smp[i], c=smp[Math.min(smp.length-1,i+1)], d=smp[Math.min(smp.length-1,i+2)];
 const u=clamp((t-b[1])/((c[1]-b[1])||1),0,1), cr=(p0,p1,p2,p3)=>0.5*((2*p1)+(-p0+p2)*u+(2*p0-5*p1+4*p2-p3)*u*u+(-p0+3*p1-3*p2+p3)*u*u*u);
 const dcr=(p0,p1,p2,p3)=>0.5*((-p0+p2)+2*(2*p0-5*p1+4*p2-p3)*u+3*(-p0+3*p1-3*p2+p3)*u*u);
 const x=cr(a[2],b[2],c[2],d[2]), z=cr(a[3],b[3],c[3],d[3]), dt=(c[1]-b[1])||1, vx=dcr(a[2],b[2],c[2],d[2])/dt, vz=dcr(a[3],b[3],c[3],d[3])/dt, v=Math.hypot(vx,vz);
 return {x,z,v,h: v>0.3? Math.atan2(vx,-vz) : null};
},
/* 予選・車検の 1 フレームの後: リプレイなら記録の位置に置き直す */
postTest(){ if(!(this.active&&this.replay&&this._hvPose&&Test.active)) return; const q=this._hvPose;
 Test.x=q.x; Test.z=q.z; Test.v=q.v; if(q.h!=null) Test.heading=q.h; Engine.st.v=q.v; for(const k in Input.keys) Input.keys[k]=false; },
post(){ if(this.active&&this.replay&&!this.done&&this._rv!=null) Engine.st.v=this._rv; this.hud(); },
};
/* ページを開いたとき: リプレイ URL (#r=...) なら再生、ランキングのゴーストを読み込む */
addEventListener("load",async()=>{
 const m=location.hash.match(/^#r=([zu][A-Za-z0-9_-]{1,12000})$/);
 // 端末に保存したランキングのリプレイを先に展開 (ゴースト用)
 EventGame._decoded={}; for(const x of EventGame.rank()) if(x.r){ try{ EventGame._decoded[x.r]=await EventGame.decode(x.r); }catch(e){} }
 if(m){ try{ const run=await EventGame.decode(m[1]); history.replaceState(null,"",location.pathname); setTimeout(()=>EventGame.startReplay(run),300); }catch(e){ console.warn("replay decode",e); } }
});
