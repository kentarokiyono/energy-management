"use strict";
/* ============ 入門コース: オーストラリアを知らないドライバーのための 8 つの課題 ============
 「練習する」→「入門」から。課題ごとに実際のルート上の場所へ移り、時間は等倍 (実寸の道・実際の時間) で走る。
  走る前に説明のカード (現地のルール・操作) → 走る (指示は無線) → 合否と講評 → もう一度 / 次の課題 / メニュー。
 1 市街 (Darwin)           赤信号で止まる・ウインカーを出して右折・60 km/h・前の車と車間をとる
 2 町に入る (Katherine 手前) 制限速度の標識 (100→80→60) の所までに落とす・信号
 3 ロードトレイン           対向とは左に寄って減速してすれ違う / 後ろから来たら左に寄せて速度を落とし、抜かせる
 4 前方誘導車に付いていく    一定の速さで走る前方誘導車に、車間 30〜70 m で付いていく
 5 無線の速度指示           追い越していく一般車両がいる中で、戦略班の「時速 X km」に ±3 km/h で合わせ、車線を保つ
 6 コントロールストップ      25 km/h 以下で入る・敷地で止まる・パネルを傾ける・点検が終わったら出る
 7 夕方の動物               カンガルー・エミュー・路上の死骸。止まれる速さで走り、ぶつからない (急ハンドルで避けない)
 8 17:00 の停車             17:00 を過ぎたら、路肩へ寄せて止まる (超過は 10 分まで)
 合格した課題はこの端末に覚えておく (メニューの課題の一覧に ✓) */
const Lesson={
 KEY:"bwsc_lesson", active:false, free:null, sel:0, i:0, st:null, cardOpen:false, finished:false,
 hideLead:false, leadFix:null, redKm:[],
 LIST:[
  {id:"city", title:"市街を走る (Darwin)", km:0.05, hour:9.0, endKm:2.3, cap:480,
   goal:"Darwin の中心街から出発。赤信号では停止線の手前で止まり、Garramilla Boulevard (約 1.3 km 先の信号) ではウインカーを出して右折。制限速度 60 km/h を守り、前を走る車とは車間をとる。",
   rules:["日本と同じ左側通行。交差点の右折は対向車線を横切る","赤信号の通過・制限速度の超過は、レースでもペナルティ (警察も取り締まる)","前の車との車間は 2 秒以上 (60 km/h で約 35 m)。ソーラーカーは止まるのに長い距離がかかる"],
   keys:"W/↑ スロットル開度を上げる・S/↓ 下げる・スペース ブレーキ・A/D ハンドル・Z 左ウインカー・C 右ウインカー"},
  {id:"town", title:"町に入る (Katherine)", km:310.9, hour:10.0, v0:95, endKm:317.0, cap:600,
   goal:"Katherine の町へ入る。制限速度は 100 → 80 → 60 km/h と下がる。標識の所までに、その速度へ落としておく。町の中には横断歩道と信号がある。",
   rules:["制限速度の標識は「ここから」の意味。標識を過ぎてから落としたのでは遅い","町の手前は 110/100 → 80 → 60 と段階的に下がる。内陸の町は数 km で抜ける","速度の取り締まり (カメラ・警察) がある。超過はチームのペナルティになる"],
   keys:"減速は回生 (R) とブレーキ (スペース)。スロットル開度 (S/↓) を早めに下げる"},
  {id:"train", title:"ロードトレイン", km:1180, hour:10.5, v0:80, cap:300,
   goal:"全長 53 m の大型トレーラー「ロードトレイン」。まず対向から来る: 左に寄って 80 km/h 以下で、すれ違う。次に後ろから来る: 後方車から無線が来たら、左 (路肩側) に寄せて速度を落とし、追い越させる。抜けたら車線に戻る。",
   rules:["ロードトレインは止まるのに非常に長い距離がかかる。前に入らない・急に止まらない","すれ違い・追い越しのときは強い風圧で車体があおられる。ハンドルをしっかり持つ","ソーラーカーの車列 (前方誘導車・ソーラーカー・後方車) は、後ろの大型車に道を譲るのが決まり"],
   keys:"左へ寄せる: A (左) を短く。路肩の白線の外側まで寄せてよい"},
  {id:"follow", title:"前方誘導車に付いていく", km:1250, hour:11.0, v0:70, dur:150, cap:240,
   goal:"前方誘導車 (白いバン) が時速 72 km の一定の速さで走る。車間 30〜70 m を保って付いていく。近づきすぎず、離れすぎず。",
   rules:["隊列は「前方誘導車 → ソーラーカー → 後方車」。前方誘導車は前の様子 (対向車・道の状態) を無線で知らせる","車間が詰まると、前で何かあったときに止まれない。離れすぎると間に一般車が入る","スロットル開度は小さく動かす。速度計より、前の車との距離の変化を見る"],
   keys:"スロットル開度 W/S を少しずつ。回生 (R) で軽く減速"},
  {id:"orders", title:"無線の速度指示", km:1305, hour:11.5, v0:75, step:55, cap:240,
   goal:"戦略班から「時速 X km」の指示が無線で来る。±3 km/h に合わせて走る。後ろから一般車両が次々に追い越していくが、車線を保ち、ふらつかない。",
   rules:["速度指示は電池が持ついちばん速い速さ。上げすぎると電池が足りなくなる","追い越されるときは速度を変えない・寄らない (急に動くと相手が危ない)","指示は 10 km ごとや、制限速度が変わる所で来る"],
   keys:"スロットル開度 W/S で速度を合わせる (速度パネルの上に指示が出る)"},
  {id:"cs", title:"コントロールストップ (Katherine)", cs:0, cap:600,
   goal:"Katherine のコントロールストップ (CS) に入る。25 km/h 以下で敷地に入り、所定の場所で止まる。30 分の点検の間にパネルを傾けて充電。点検が終わったら、出発する。",
   rules:["CS は全チームが 30 分止まる決まり。敷地に入らず通過すると、その場で 30 分の点検","敷地の中は 25 km/h 以下","止まっている間に、アッパーカウルを太陽に向けて傾けて充電する (角度で発電が大きく変わる)"],
   keys:"止まったら角度を選ぶ画面が出る。点検中は時間が早く進む"},
  {id:"wild", title:"夕方の動物", km:900, hour:16.3, day:2, v0:80, cap:240,
   goal:"夕方の内陸。カンガルーが道を横切る・エミューが走る・路上に動物の死骸がある。ぶつからずに走り切る。前方誘導車の無線も聞く。",
   rules:["カンガルーは朝夕に多い。路肩で止まっていても、急に跳び出す・道の真ん中で止まる・引き返すことがある","避けようとして急にハンドルを切らない (ソーラーカーは横転しやすい)。まっすぐ強くブレーキ","路上の死骸には大きなワシが群がっていることがある。近づくと飛び立つ","日没後は動物が多く危険。レースも日没後は走れない"],
   keys:"スペース ブレーキ・R 回生。路肩の動物が見えたら、早めにスロットル開度を下げる"},
  {id:"camp", title:"17:00 の停車", km:600, hour:16.95, day:2, v0:80, cap:600,
   goal:"16:57 から走る。17:00 を過ぎたら、安全な所で路肩へ寄せて止まる (止まった所がその日のキャンプ)。17:00 を過ぎた分は翌朝のスタートが遅れる (10 分まで 1 分につき 1 分、それ以降は 2 分)。",
   rules:["17:00 を過ぎたら、日没までに止まる。超過は 10 分以内に","止まる所は路肩の外 (車線をふさがない)。後ろの一般車両に注意して減速","キャンプでは日没までパネルを傾けて充電し、翌朝 8:00 に同じ所から出る"],
   keys:"ゆっくり減速しながら A (左) で路肩へ。止まったら終わり"},
 ],
 /* ---------- 覚えておく (この端末) ---------- */
 rec(){ try{ return JSON.parse(localStorage.getItem(this.KEY)||"{}")||{}; }catch(e){ return {}; } },
 mark(id,ok){ const r=this.rec(); r[id]=Math.max(r[id]||0,ok?2:1); try{ localStorage.setItem(this.KEY,JSON.stringify(r)); }catch(e){} },
 /* メニュー: 課題の一覧 */
 ui(){ const box=document.getElementById("ent-intro"); if(!box) return; const r=this.rec();
  box.innerHTML=this.LIST.map((L,i)=>`<button type="button" data-i="${i}" class="${i===this.sel?"on":""}">${r[L.id]===2?"✓ ":""}${i+1} ${L.title.replace(/ \(.*\)/,"")}</button>`).join("");
  box.querySelectorAll("button").forEach(b=>b.onclick=()=>{ this.sel=+b.dataset.i; this.ui(); try{ localStorage.setItem(this.KEY+"_sel",this.sel); }catch(e){} });
  const d=document.getElementById("intro-desc"); if(d) d.textContent=this.LIST[this.sel].goal; },
 want(){ return typeof Entry!=="undefined"&&Entry.ent==="practice"&&Entry.sub==="intro"&&P.mode==="race"; },
 /* startGame から (Engine.init の前): 等倍で走る */
 prepare(){ this.active=true; P.timeScale=1; this._orders=P.orders; P.orders=false; },
 /* startGame の最後 */
 begin(){ this.finished=false; this.start(this.free? 0 : this.sel); },
 /* ルートの予習から: その場所の手前から走る (採点なし・等倍)。日時は標準ペースのおおよそ */
 freeRun(km,what){ const d=Math.min(6,Math.floor(km/650)+1), h=clamp(8.5+(km%650)/75,8.5,15.5);
  this.free={id:"free",title:`予習走行 (${km.toFixed(1)} km から)`,km,hour:h,day:d,cap:1e9,
   goal:`${what? what+" の手前":"ここ"} (${km.toFixed(1)} km) から走る。採点はない。終わるときは Esc (一時停止) → メニューへ。`,
   rules:["時間は等倍 (実際の速さ)。一般車両・動物も出る","制限速度・信号は本番と同じ"],keys:"W/S スロットル開度・スペース ブレーキ・A/D ハンドル・Z/C ウインカー"};
  if(typeof Entry!=="undefined"){ Entry.pick("practice"); Entry.setSub("intro"); }
  startGame(); },
 end(){ if(!this.active) return; this.active=false; this.free=null; this.hideLead=false; this.leadFix=null; this.redKm=[]; if(this._orders!==undefined) P.orders=this._orders; this._orders=undefined;
  if(typeof Traffic!=="undefined"){ Traffic.noSpawn=false; Traffic.kMul=1; }
  if(typeof Wildlife!=="undefined") Wildlife.forceOnly=false;
  this.closeCard(); const h=document.getElementById("lesson-hud"); if(h) h.style.display="none"; },
 L(){ return this.free||this.LIST[this.i]; },
 start(i){ this.i=clamp(i,0,this.LIST.length-1); this.st=null; this.showCard(this.L(),()=>this.enter(this.L())); },
 /* 課題の場所へ移る (EventGame.jump と同じ手順) */
 jump(km,hour,day){
  const s=Engine.st;
  s.km=km; s.hour=hour; s.day=day||1; s.dayOfYear=PRO.dayOfYear+(day||1)-1; s.v=0; s.throttleSet=0; s.brakePhys=0; s.brakeRegen=0; s.signal=0; s.gear="D";
  s.stopTimer=0; s.stopKind=""; s.stopHold=false; s.camp=false; s.weather=null; s.offRoute=false; s.crashed=false; s.fire=false; s.finished=false;
  s.extensionMin=0; s.extWarned=false; s.extWarned2=false; s.morningPenaltyMin=0; s.gridStartH=0; s.chapter=null;
  s.passedCP=new Set(); for(const c of RP_CS) if(c.km<km) s.passedCP.add(c.km);
  s.dcDone= RP_RULES.driverChange.km<km+1;
  s.teams=[]; s.weatherPlan=[]; s.fc=null; s.stormPlan=[]; s.nextRoadTrainH=99; s.soc=Math.max(s.soc,0.8); s.lesson=this.L().id; s.tipMax=0;
  if(s.damage){ s.damage.aero=0; s.damage.n=0; }
  for(const rt of View.roadTrains) View.scene.remove(rt.mesh); View.roadTrains.length=0;
  if(typeof Traffic!=="undefined") Traffic.reset(View);
  View.resetRoad(); View.cx=undefined; View.leadS=undefined;
 },
 enter(L){
  const s=Engine.st; this.t=0; this.finished=false; this.hideLead=false; this.leadFix=null; this.redKm=[];
  if(typeof Traffic!=="undefined"){ Traffic.noSpawn=false; Traffic.kMul=1; }
  if(typeof Wildlife!=="undefined") Wildlife.forceOnly= L.id!=="free";   // 入門では動物は「夕方の動物」の課題で決まった所にだけ出す (予習走行はふつうに出る)
  if(typeof Crew!=="undefined"){ Crew.reset(); if(Crew.hideUI) Crew.hideUI(); }
  let km=L.km, hour=L.hour, day=L.day||1;
  if(L.cs!=null){ const c=RP_CS[L.cs]; km=c.km-0.9; const a=(c.open? Route.absHour(c.open) : 13)+0.5; day=Math.floor(a/24)+1; hour=a%24; }
  this.jump(km,hour,day);
  const st=this.st={red:0,over:0,hits:0,notes:[],turns:{},tail:0,limits:[],phase:0};
  if(L.v0){ s.v=L.v0/3.6; s.throttleSet=0.5; }
  if(L.id==="city"){ const mc=RN_EVENTS.find(e=>e.k==="signal"&&/McMinn/.test(e.t||"")); this.redKm=[mc? mc.km : 0.575]; }   // McMinn Street の信号は必ず赤
  if(L.id==="town"){ st.limits=RN_EVENTS.filter(e=>e.k==="limit"&&e.km>km&&e.km<L.endKm).map(e=>({km:e.km,v:+String(e.v).replace(/\D/g,"")||speedLimitAt(e.km+0.01),done:false})); s.throttleSet=0.6; }
  if(L.id==="train"){ Traffic.noSpawn=true; st.phase=0; }
  if(L.id==="follow"){ Traffic.noSpawn=true; this.leadFix=72/3.6; View.leadS=View.s+60; View.leadV=this.leadFix; st.inBand=0; st.tot=0; st.minGap=1e9; }
  if(L.id==="orders"){ Traffic.kMul=3; Traffic.tB=4; st.seq=[78,88,70]; st.oi=-1; st.ot=0; st.in=0; st.tot=0; st.lane=0; st.laneTot=0; }
  if(L.id==="cs"){ const c=RP_CS[L.cs]; st.cp=c; st.entry=null; st.stopped=false; st.missed=false; st.tilt=false; st.left=false; s.v=45/3.6; s.throttleSet=0.3; }
  if(L.id==="camp"){ st.campLat=null; st.ext=0; }
  if(L.id==="wild"){ Traffic.noSpawn=true; st.plan=[[8,"kangaroo",{side:-1}],[30,"roadkill",{eagle:true,lat:-2.3}],[52,"emu",{side:1}],[54,"emu",{side:1,trig:3.4}],[78,"kangaroo",{side:1,pause:true}],[100,"kangaroo",{side:-1,back:true}]]; st.pi=0; st.seen=[]; }
  this.hud();
  Radio.push(`入門 ${this.i+1}「${L.title}」: ${L.goal}`,"チーフ");
 },
 /* ---------- 毎フレーム (Engine.step の前) ---------- */
 frame(dtR){
  if(!this.active||this.cardOpen||this.finished||!this.st) return;
  const s=Engine.st, L=this.L(), st=this.st, kmh=s.v*3.6, lim=speedLimitAt(s.km); this.t+=dtR;
  if(L.id!=="cs"&&L.id!=="camp"&&kmh>lim+3) st.over+=dtR;
  // 前の一般車両との車間 (同じ車線・走っているとき): 1 秒未満が続いたら注意
  if(typeof Traffic!=="undefined"&&s.v>5){ let gap=1e9; for(const c of Traffic.cars){ if(Math.abs(c.lat-View.lateral)>1.8) continue; const g=(c.s-c.L)-(View.s+2.3); if(g>-1&&g<gap) gap=g; }
   if(gap<s.v*1.0){ st.tail+=dtR; if(st.tail>2&&!st.tailMsg){ st.tailMsg=true; Radio.push("前の車に近すぎます。車間を 2 秒以上あけて。","後方追走車",{speak:true}); } } }
  if(View.onBranch&&!st.branch){ st.branch=true; return this.finish(false,["ルートから外れました (曲がる所を間違えた)"]); }
  if(this.t>L.cap&&L.id!=="follow") return this.finish(false,["時間切れ"]);
  const f=this["f_"+L.id]; if(f) f.call(this,s,st,kmh,dtR);
  this.hud();
 },
 f_city(s,st,kmh){
  for(const mn of RP_MANEUVERS) if(mn.km>this.L().km+0.05&&mn.km<this.L().endKm&&(mn.turn==="R"||mn.turn==="L")){   // 出発点より先の曲がる所 (町の中は実際の道の形に合わせた位置)
   const k=mn.km, t=st.turns[k]||(st.turns[k]={sig:false,done:false});
   if(s.km>k-0.12&&s.km<k+0.01&&s.signal===(mn.turn==="R"?1:-1)) t.sig=true;
   if(!t.done&&s.km>k+0.03){ t.done=true; toast(t.sig?"ウインカー OK":"⚠ ウインカーを出し忘れた",t.sig?"#34d399":"#f59e0b"); if(t.sig&&s.signal) s.signal=0; } }
  if(s.km>=this.L().endKm){ const miss=Object.values(st.turns).filter(t=>!t.sig).length, n=[];
   n.push(st.red? `× 赤信号を ${st.red} 回通過` : "○ 赤信号で止まれた");
   n.push(miss? `× ウインカーの出し忘れ ${miss} 回 (曲がる 100 m ほど手前で出す)` : "○ 曲がる前にウインカーを出せた");
   n.push(st.over>3? `× 制限速度の超過 ${st.over.toFixed(0)} 秒` : "○ 制限速度を守れた");
   n.push(st.tail>2? `△ 前の車に近すぎた時間 ${st.tail.toFixed(0)} 秒 (2 秒以上あける)` : "○ 前の車との車間をとれた");
   this.finish(!st.red&&!miss&&st.over<=3&&!st.hits&&st.tail<=6,n); }
 },
 f_town(s,st,kmh){
  for(const l of st.limits) if(!l.done&&s.km>=l.km){ l.done=true; l.kmh=kmh;
   const ok=kmh<=l.v+3; toast(`制限 ${l.v} km/h の標識: ${kmh.toFixed(0)} km/h ${ok?"OK":"超過"}`,ok?"#34d399":"#f59e0b"); }
  if(s.km>=this.L().endKm){ const dn=st.limits.filter(l=>l.done&&l.v<200), bad=dn.filter(l=>l.kmh>l.v+3), n=[];
   for(const l of dn) n.push(`${l.kmh<=l.v+3?"○":"×"} ${l.km.toFixed(1)} km 制限 ${l.v} の標識で ${l.kmh.toFixed(0)} km/h`);
   n.push(st.red? `× 赤信号を ${st.red} 回通過` : "○ 信号を守れた");
   n.push(st.over>5? `× 制限速度の超過 合計 ${st.over.toFixed(0)} 秒` : "○ 町の中で制限速度を守れた");
   this.finish(!bad.length&&!st.red&&st.over<=5&&!st.hits,n); }
 },
 f_train(s,st,kmh){
  const V=View;
  if(st.phase===0&&this.t>6){ const t=V.mkRoadTrain(); V.scene.add(t); V.roadTrains.push({mesh:t,sVis:V.s+700,warned:false,ev:true}); st.phase=1;
   Radio.push("前方からロードトレイン接近。左に寄って減速してください。","前方誘導車",{speak:true}); }
  if(st.phase===1){ const rt=V.roadTrains.find(r=>r.ev); if(rt){ const rel=rt.sVis-V.s;
    if(st.meetOk==null&&Math.abs(rel)<14){ st.meetLat=V.lateral; st.meetV=kmh; st.meetOk=V.lateral<=-2.5&&kmh<=83; toast(st.meetOk?"安全にすれ違えた":"⚠ もっと左に寄って減速",st.meetOk?"#34d399":"#f59e0b"); }
    if(rel<-80){ st.phase=2; st.t2=this.t; } } else { st.phase=2; st.t2=this.t; } }
  if(st.phase===2&&this.t>st.t2+6){ const c=Traffic.spawn(V,s,"rt",V.s-230,s.v+3/3.6,Traffic.HOME); c.f=1; c.cap=96/3.6; st.rt=c; st.phase=3; st.t3=this.t; }
  if(st.phase===3){ const c=st.rt;
   if(Traffic.rtMsg===c.id&&st.tMsg==null) st.tMsg=this.t;
   const yielded=V.lateral<-3.4||(st.tMsg!=null&&s.v<c.v0*0.75);
   if(st.tMsg!=null&&yielded&&st.tYield==null){ st.tYield=this.t; }
   if(!Traffic.cars.includes(c)||c.s-c.L>V.s+20){ st.phase=4; st.t4=this.t; } }
  if(st.phase===4&&this.t>st.t4+12){
   const back=V.lateral>-3.3&&V.lateral<-1.5, n=[];
   n.push(st.meetOk? `○ 対向とは左に寄って ${st.meetV.toFixed(0)} km/h ですれ違えた` : `× 対向とのすれ違い: 横の位置 ${(st.meetLat??0).toFixed(1)} m・${(st.meetV??0).toFixed(0)} km/h (左に寄って 80 km/h 以下)`);
   const yt=st.tYield!=null&&st.tMsg!=null? st.tYield-st.tMsg : null;
   n.push(yt!=null&&yt<=20? `○ 後ろのロードトレインに ${yt.toFixed(0)} 秒で道を譲れた` : "× 後ろのロードトレインに道を譲るのが遅い (無線のあと 20 秒以内に左へ寄せて減速)");
   n.push(back? "○ 抜かれたあと車線に戻れた" : "△ 抜かれたら車線 (路肩の外側の白線より内側) に戻る");
   this.finish(!!st.meetOk&&yt!=null&&yt<=20&&!st.hits,n); }
 },
 f_follow(s,st,kmh,dtR){
  const gap=(View.leadS-2.4)-(View.s+2.3); st.gap=gap;
  if(this.t>20){ st.tot+=dtR; if(gap>=30&&gap<=70) st.inBand+=dtR; st.minGap=Math.min(st.minGap,gap); }
  if(gap<8&&!st.close){ st.close=true; toast("⚠ 前方誘導車に近すぎる","#ef4444"); }
  if(this.t>=this.L().dur){ const r=st.tot? st.inBand/st.tot : 0, n=[];
   n.push(`${r>=0.7?"○":"×"} 車間 30〜70 m に入っていた時間 ${(r*100).toFixed(0)} % (目標 70 % 以上)`);
   n.push(st.minGap>=15? `○ いちばん近づいたとき ${st.minGap.toFixed(0)} m` : `× いちばん近づいたとき ${st.minGap.toFixed(0)} m (15 m 未満)`);
   this.finish(r>=0.7&&st.minGap>=15&&!st.hits,n); }
 },
 f_orders(s,st,kmh,dtR){
  const STEP=this.L().step||55;
  if(st.oi<0||this.t-st.ot>=STEP){ st.oi++; st.ot=this.t;
   if(st.oi>=st.seq.length){ const r=st.tot? st.in/st.tot : 0, lr=st.laneTot? st.lane/st.laneTot : 0, n=[];
    n.push(`${r>=0.7?"○":"×"} 指示の ±3 km/h に入っていた時間 ${(r*100).toFixed(0)} % (目標 70 % 以上。指示から速度を変え終わるまでは数えない)`);
    n.push(`${lr>=0.9?"○":"×"} 車線の中を保てた時間 ${(lr*100).toFixed(0)} % (目標 90 % 以上)`);
    n.push(`  追い越していった一般車両 ${st.passed||0} 台`);
    return this.finish(r>=0.7&&lr>=0.9&&!st.hits,n); }
   const pv=st.v||kmh; st.v=st.seq[st.oi]; st.grace=8+Math.abs(st.v-pv)*0.8;   // 速度を変える時間 (ソーラーカーは加速がゆっくり)
   Radio.push(`時速 ${st.v} km`,"戦略班",{speak:true}); }
  if(this.t-st.ot>st.grace){ st.tot+=dtR; if(Math.abs(kmh-st.v)<=3) st.in+=dtR; }
  st.laneTot+=dtR; if(View.lateral>-3.4&&View.lateral<-1.4) st.lane+=dtR;
  for(const c of Traffic.cars) if(!c._cnt&&c.s-c.L>View.s+3){ c._cnt=true; if(c.wasBehind) st.passed=(st.passed||0)+1; } else if(c.s<View.s-5) c.wasBehind=true;
 },
 f_wild(s,st,kmh){
  const V=View;
  while(st.pi<st.plan.length&&this.t>=st.plan[st.pi][0]){ const [,k,o]=st.plan[st.pi++]; const a=Wildlife.spawn(V,s,k,Object.assign({s:V.s+(k==="roadkill"?260:Math.max(90,s.v*4.5)+20)},o)); a.told=k==="kangaroo"&&st.pi===1; }
  for(const a of Wildlife.list) if(!a._seen&&(a.st==="cross"||(a.kind==="roadkill"&&a.s-V.s<60))){ a._seen=true; st.seen.push([a.kind,kmh]); }
  if(st.pi>=st.plan.length&&this.t>=124){ const n=[], fast=st.seen.filter(x=>x[1]>85);
   n.push(st.hits? `× 動物・死骸に ${st.hits} 回当たった` : "○ 動物にも死骸にも当たらなかった");
   n.push(fast.length? `△ 動物が出たとき ${Math.max(...fast.map(x=>x[1])).toFixed(0)} km/h。夕方は止まれる速さ (80 km/h 前後まで) に落とす` : "○ 動物が出たときの速さは止まれる範囲");
   if(s.tipMax>0.8) n.push(`△ 横転の危険度が ${(s.tipMax*100).toFixed(0)} % まで上がった (急ハンドル)`);
   this.finish(!st.hits,n); }
 },
 f_cs(s,st,kmh){
  const c=st.cp;
  if(st.entry==null&&s.km>c.km-0.25){ st.entry=kmh; if(kmh>26) toast("⚠ CS の敷地は 25 km/h 以下","#f59e0b"); }
  if(st.stopped&&!st.tilt&&(s.tiltLocked||Math.abs(s.tiltDeg||0)>1)) st.tilt=true;
  if(st.stopped&&s.stopTimer<=0&&!st.left){ st.left=true; st.tl=this.t; Radio.push("点検完了。本線へ出てください。","Event Official",{speak:true}); }
  if(st.left&&s.km>c.km+0.35){ const n=[];
   n.push(st.entry!=null&&st.entry<=26? `○ ${st.entry.toFixed(0)} km/h で敷地に入れた` : `× 敷地に入る速度 ${(st.entry||0).toFixed(0)} km/h (25 km/h 以下)`);
   n.push(st.missed? "× 敷地に入らずに通過した (その場で 30 分の点検)" : `○ 敷地の中で止まれた`);
   n.push(st.tilt? "○ パネルを傾けて充電した" : "△ 止まっている間はパネルを傾けて充電する");
   this.finish(st.entry!=null&&st.entry<=26&&!st.missed&&!st.hits,n); }
 },
 f_camp(s,st){
  if(s.camp&&st.campLat==null){ st.campLat=View.lateral; st.ext=s.extensionMin||0; st.pen=s.morningPenaltyMin||0;
   const off=st.campLat<=-3.6, n=[];
   n.push(off? "○ 路肩へ寄せて止まれた" : `× 車線の上で止まった (横の位置 ${st.campLat.toFixed(1)} m。路肩の外側の白線の外へ)`);
   n.push(st.ext<=10? `○ 17:00 の超過 ${st.ext.toFixed(1)} 分 (翌朝 ${st.pen.toFixed(0)} 分遅れ)` : `× 17:00 の超過 ${st.ext.toFixed(1)} 分 (10 分を超えた。翌朝 ${st.pen.toFixed(0)} 分遅れ)`);
   this.finish(off&&st.ext<=10&&!st.hits,n); }
 },
 /* ---------- 外からの通知 ---------- */
 onRedRun(){ if(this.active&&this.st) this.st.red++; },
 onHit(hit){ if(!this.active||!this.st||this.finished) return; if(hit.level==="touch") return; this.st.hits++;
  if(hit.level!=="light"||this.L().id==="wild") this.finish(false,[`× ${COLLIDE_WHAT[hit.kind]||"障害物"}に衝突した (${(hit.vn*3.6).toFixed(0)} km/h)`]); },
 onCS(cp,missed){ if(!this.active||!this.st||this.L().id!=="cs") return; this.st.stopped=true; this.st.missed=missed; },
 redAt(km){ return this.active&&this.redKm.some(k=>Math.abs(k-km)<0.02); },
 /* ---------- 画面 ---------- */
 hud(){ let el=document.getElementById("lesson-hud");
  if(!el){ el=document.createElement("div"); el.id="lesson-hud"; el.style.cssText="position:absolute;left:50%;top:104px;transform:translateX(-50%);z-index:30;padding:6px 14px;background:rgba(10,12,14,.82);border:1px solid rgba(250,204,21,.6);color:#f5f5f4;font-size:13px;pointer-events:none;white-space:nowrap";
   document.getElementById("game-container").appendChild(el); }
  if(!this.active||!this.st){ el.style.display="none"; return; }
  const L=this.L(), st=this.st; let x="";
  if(L.id==="follow"&&st.gap!=null) x=`車間 ${Math.max(0,st.gap).toFixed(0)} m (30〜70 m)`;
  if(L.id==="orders"&&st.v) x=`指示 時速 ${st.v} km`;
  if(L.id==="camp"){ const h=Engine.st.hour, mm=Math.floor((h%1)*60); x=`${Math.floor(h)}:${String(mm).padStart(2,"0")}`; }
  el.style.display=""; el.textContent=`${this.free?"":`入門 ${this.i+1} / ${this.LIST.length}  `}${L.title}${x?"  ・ "+x:""}`; },
 card(html,btns){
  this.cardOpen=true; modalPause=true;
  let el=document.getElementById("ls-card");
  if(!el){ el=document.createElement("div"); el.id="ls-card"; el.style.cssText="position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(5,5,6,.6)"; document.body.appendChild(el); }
  el.innerHTML=`<div class="card2" style="width:min(680px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto">${html}
   <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px;flex-wrap:wrap">${btns.map((b,i)=>`<button type="button" class="btn${b.pri?" pri":""}" data-b="${i}">${b.t}</button>`).join("")}</div></div>`;
  el.style.display="flex";
  el.querySelectorAll("button[data-b]").forEach(b=>b.onclick=()=>{ const f=btns[+b.dataset.b].f; this.closeCard(); f(); });
  this._key=(e)=>{ if(e.key==="Enter"){ const p=btns.find(b=>b.pri)||btns[0]; this.closeCard(); p.f(); } };
  setTimeout(()=>{ if(this.cardOpen) addEventListener("keydown",this._key); },300);
 },
 closeCard(){ this.cardOpen=false; modalPause=false; lastT=performance.now(); if(this._key) removeEventListener("keydown",this._key); this._key=null;
  const el=document.getElementById("ls-card"); if(el) el.style.display="none"; },
 showCard(L,go){
  const n=this.i+1, N=this.LIST.length;
  this.card(`<div class="hd"><span class="lb">${this.free?"ルートの予習":`入門 ${n} / ${N}`}</span><img src="assets/img/logo.svg" class="logo" width="64" alt=""></div>
   <h2>${L.title}</h2><div style="font-size:15px;line-height:1.85">${L.goal}</div>
   <div class="tip"><b>現地のルール・知っておくこと</b><ul style="margin:6px 0 0 18px;padding:0;list-style:disc">${L.rules.map(r=>`<li>${r}</li>`).join("")}</ul></div>
   <div class="lb" style="margin-top:10px;line-height:1.7">操作: ${L.keys}</div>`,
   [{t:"メニューへ",f:()=>Fade.go(quitToMenu)},{t:"走る (Enter)",pri:true,f:go}]);
 },
 finish(ok,notes){
  if(this.finished) return; this.finished=true; const L=this.L(); this.mark(L.id,ok);
  if(ok) Snd.chime&&Snd.chime(); else Snd.alarm&&Snd.alarm();
  const last=this.i>=this.LIST.length-1;
  const btns=[{t:"メニューへ",f:()=>Fade.go(quitToMenu)},{t:"もう一度",pri:!ok,f:()=>this.start(this.i)}];
  if(!last) btns.push({t:"次の課題へ",pri:ok,f:()=>this.start(this.i+1)});
  this.card(`<div class="hd"><span class="lb">入門 ${this.i+1} / ${this.LIST.length} の結果</span></div>
   <h2 style="color:${ok?"#34d399":"#f59e0b"}">${ok?"合格":"もう一度"} ― ${L.title}</h2>
   <ul style="margin:8px 0 0 0;padding:0;list-style:none;font-size:15px;line-height:1.9">${notes.map(x=>`<li>${x}</li>`).join("")}</ul>
   ${ok&&last?'<div class="tip">入門の課題はこれで全部です。次は「練習シナリオ」や「本戦」で走ってみよう。</div>':""}`,btns);
  this.ui();
 },
};
