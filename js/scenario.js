"use strict";
/* ============ 練習シナリオ: 天候の急変 ============
 決まった場所・時刻・電池残量から始め、決まった天気 (スコール・強い横風・長い曇り・暴風雨) を走り抜ける。
 時間はゆっくり (×5〜×15) 進む。ゴール (始めから決まった距離先) に着いたら採点:
  時間 (目安の速さとの比較)・到着時の電池・最低の電池・道の外を走った時間・接触・横転の危険度 (最大) */
const Scenario={
 LIST:{
  squall:{name:"スコール突入",km:760,day:2,hour:11.6,soc:0.6,ts:12,dist:100,refV:66,minSoc:0.15,
   wx:[{in:0.22,dur:0.9,type:"squall",factor:0.1}],wind:{ms:6,rel:1,gust:1.2,pulse:70},
   brief:"Day2 11:36、Dunmarra の先 760 km。偵察車から「約 13 分後に強いスコール、50 分ほど続く」。日射は 1 割まで落ち、突風もある。100 km 先まで電池を 15 % 以上残して、できるだけ早く着く。",
   tip:["スコールの前に電池を使い過ぎない (先に速度を落とすと、スコールの中で速度を保ちやすい)","スコール中は発電がほぼない。右下の「戦略 推奨速度」の変化を見て速度を決める","突風で車が流されるので、速度を落として車線を守る"]},
  cross:{name:"強い横風 (Barkly)",km:1150,day:3,hour:10.2,soc:0.72,ts:5,dist:40,refV:72,minSoc:0.2,
   wx:[],wind:{ms:12,rel:1,gust:1.6,pulse:25},
   brief:"Day3 10:12、Barrow Creek の手前 1150 km。東からの強い横風 (約 12 m/s) と突風。40 km 先まで、車線から外れずに走り切る。",
   tip:["突風の瞬間は車が風下 (左) へ流される。早めに小さく当て舵","速度を落とすほど横風の影響 (流され方) は小さくなる","対向のロードトレインとすれ違う瞬間は、風がいったん弱まり、その後また強く押される"]},
  cloud:{name:"午後の長い曇り",km:1600,day:3,hour:12.4,soc:0.42,ts:20,dist:150,refV:58,minSoc:0.1,
   wx:[{in:0.3,dur:2.6,type:"cloud",factor:0.3}],wind:null,
   brief:"Day3 12:24、Alice Springs の先 1600 km。電池 42 %。まもなく厚い雲に入り、2 時間半ほど日射が 3 割に落ちる。150 km 先まで電池を 10 % 以上残して着く。",
   tip:["曇りの間は発電が少ないので、右下の「戦略 推奨速度」に合わせて早めに速度を落とす","速度を 10 km/h 落とすと消費は大きく減る (空気抵抗は速度の 2 乗)","電池が少ないまま曇りに入らない"]},
  storm:{name:"暴風雨 (Port Pirie 付近)",km:2790,day:6,hour:14.2,soc:0.32,ts:4,dist:45,refV:35,minSoc:0.05,
   wx:[{in:0.45,dur:0.55,type:"squall",factor:0.06}],wind:{ms:6,rel:1,gust:0.6,pulse:0},storm:{in:0.45,dur:0.55,mean:17,max:39},
   brief:"Day6 14:12、Port Augusta の先 2790 km (ゴールまで 237 km)。2025 年に実際に起きた暴風雨 (突風 約 140 km/h) を想定。偵察車から「西から雷雨のセル。約 27 分後に暴風雨、突風は最大 140 km/h (39 m/s) 近く」。前方誘導車は突風の直前に知らせる。横転せずに 45 km 先まで行く。",
   tip:["いちばん強い突風は雨の降り始め (雷雨の前縁) に来る。雨が来る前に路肩に寄せて止まり、通り過ぎるのを待つのが基本。走ったままだと、ゆっくりでも 20 m/s 前後の突風で倒れることがある","止まってしばらくすると、誘導車と追走車が風上で風よけになり (風が半分)、クルーが車体を押さえる。140 km/h の突風でも、これで耐えられる","横風の力は走っているほど大きい (車の速度と風が合わさる)","突風で流されたとき、ハンドルを大きく切ると遠心力が横風に加わって倒れやすい。当て舵は小さく","画面の「横転」の % (危険度) が 60 % を超えたら、すぐに減速"]},
  flat:{name:"タイヤのパンク",km:600,day:2,hour:10.2,soc:0.8,ts:1,dist:10,refV:80,minSoc:0,wx:[],wind:null,
   flat:{at:[1.5,3.5],minKmh:60},
   brief:"Day2 10:12、Daly Waters の手前 600 km。制限速度 130 km/h の開けた道。80 km/h 前後で走っていると、どこかでタイヤがパンクします (どの車輪かは毎回変わる)。車を落ち着かせ、左の路肩に寄せて止めてください。",
   tip:["ハンドルをしっかり持ち、まっすぐを保つ。後輪のパンクは車が振られやすい: 小さく速い当て舵で","急ブレーキは振られを大きくする。アクセルを戻し、回生と軽いブレーキで少しずつ減速","前輪のパンクはパンクした側へ取られる。反対へ当て舵","速度が落ちてからウインカーを出し、左の路肩に寄せて止める (車線の中で止めない)"]},
 dusk:{name:"夕方の追い込み",km:700,day:2,hour:16.0,soc:0.38,ts:6,dist:200,refV:75,minSoc:0.05,wx:[],wind:null,custom:true,
   brief:"Day2 16:00、Daly Waters の先 700 km。今日は 17:00 を少し過ぎるまで走れる。夕方で動物が増える。ドライバーは戦略班の速度指示と「止める地点」に従い、言われた所で路肩へ止める。エネマネ班は、どこまで行くか (超過のペナルティと進む距離) を決める。",
   tip:["17:00 を過ぎた分は翌朝のスタートが遅れる (10 分までは 1 分につき 1 分、それ以降は 2 分)","夕方はカンガルーが多い。止まれる速さで","止める所は路肩の外。後ろの車に注意して早めに減速","エネマネ班: 少し先まで行けば明日が楽。ただし超過 10 分からペナルティは倍"]},
  rtwind:{name:"ロードトレインと突風",km:1150,day:3,hour:10.5,soc:0.7,ts:3,dist:12,refV:68,minSoc:0.2,wx:[],wind:{ms:11,rel:1,gust:1.5,pulse:30},rt:true,
   brief:"Day3 10:30、Barrow Creek の手前。東から強い横風 (約 11 m/s) と突風。対向のロードトレインが次々に来て、後ろからも来る。車線を保ち、後ろのロードトレインには左に寄せて道を譲る。12 km 先まで。",
   tip:["すれ違う瞬間は風がいったん止み、抜けた直後に強く戻る。ハンドルは早めに小さく","後ろのロードトレインの無線が来たら、左に寄せて速度を落とす","横風の中で路肩に寄せるときは、路肩の砂利に注意 (急ハンドルは横転の危険)"]},
  alice:{name:"Alice Springs を抜ける",km:1493.6,day:3,hour:9.5,soc:0.6,ts:1,dist:12.8,refV:48,extraH:0.5,minSoc:0.4,wx:[],wind:null,town:true,
   brief:"Day3 9:30、Alice Springs の町の入口。信号・一般車両・制限速度が続く 12.8 km。途中の CS (Alice Springs) では止まって 30 分の点検。町を抜けるまで。",
   tip:["町の中は 60・50 km/h の所が多い。標識の所までに落とす","信号の手前では前の車に合わせて止まる。黄色・赤は止まる","CS の敷地は 25 km/h 以下で入り、所定の場所で止まる","加速・減速を繰り返すほど電池が減る。前の流れを見て早めにスロットルを戻す"]},
  long:{name:"長時間 (5 時間)",km:0,day:1,hour:8.5,soc:0.9,ts:1,dist:3100,refV:70,minSoc:0.05,wx:[],wind:null,long:true,dur:5,custom:true,
   brief:"選んだ区間を 5 時間 (実時間) 走り続ける。一般車両・ロードトレイン・動物・暑さと疲れ・戦略班の速度指示すべてあり。途中で一時停止 (Esc) から保存して、あとで続きから走れる。",
   tip:["集中力は暑さと運転時間で落ちる。CS や停車で少し戻る","速度指示に合わせ、車線を保つ","眠気でふらついたら、無理せず安全な所で止まる"]},
 },
 cur:null, id:null,
 /* 長時間の始める区間 (0 = Darwin、n = CS n の先) */
 longFrom(){ const v=+((document.getElementById("long-from")||{}).value||0); return clamp(v,0,RP_CS.length); },
 /* 暴風雨の難しさ: 実戦 = 実際の強さ / 標準 = 風は約半分 (30〜40 km/h なら耐えられる)・前方誘導車の予告が早い (実時間で約 6 秒前) */
 LEVELS:{real:{name:"実戦",wind:1,lead:3},std:{name:"標準",wind:0.45,lead:6}},
 level(){ const v=(document.getElementById("scn-level")||{}).value; return this.LEVELS[v]? v : "real"; },
 pick(){ const v=(document.getElementById("scenario")||{}).value; return v&&this.LIST[v]? v : null; },
 /* 走り始めの設定 (Engine.init の後): 場所・時刻・電池・天気・他チーム */
 apply(id){
  const sc=this.LIST[id]; if(!sc) return; const s=Engine.st;
  if(sc.long){ const n=this.longFrom(), c=n? RP_CS[n-1] : null; sc.km= c? c.km+0.4 : 0.3; sc.day=clamp(Math.floor(sc.km/600)+1,1,5); sc.hour=8.5; sc.from=c? `CS${c.n} ${c.name}` : "Darwin"; }
  s.km=sc.km; s.day=sc.day; s.hour=sc.hour; s.dayOfYear=PRO.dayOfYear+sc.day-1; s.soc=sc.soc;
  for(const q of RP_CS) if(q.km<sc.km) s.passedCP.add(q.km);
  if(RP_RULES.driverChange.km<sc.km) s.dcDone=true;
  s.camp=false; s.stopTimer=0; s.chapter=null; s.scenario=id; s.gridStartH=0;
  const abs0=(sc.day-1)*24+sc.hour;
  s.weatherPlan=sc.wx.map(w=>({start:abs0+w.in,dur:w.dur,type:w.type,factor:w.factor})); s.fc=null;   // シナリオは予報どおり
  for(const tm of s.teams||[]){ tm.status="run"; tm.km=clamp(sc.km+(Math.random()-0.5)*60+(tm.spd-70)*0.8,0,TOTAL_KM-1); for(const cp of ROUTE) if(cp.cp&&cp.km<tm.km) tm.cs.add(cp.km); }
  this.id=id; this.cur={sc,abs0,goal:sc.km+sc.dist,minSoc:sc.soc,off:0,hits:0,warned:{},done:false,t0:performance.now(),gusts:null,lv:this.level()};
  if(sc.storm){ const L=this.LEVELS[this.cur.lv]; this.cur.st=Object.assign({},sc.storm,{mean:sc.storm.mean*L.wind,max:sc.storm.max*L.wind}); this.cur.gusts=this.mkGusts(this.cur.st); }
  s.tipMax=0;
  if(sc.flat){ const F=sc.flat; this.cur.flat={atKm:sc.km+F.at[0]+Math.random()*(F.at[1]-F.at[0]),wheel:null,burst:false,abs:null,beta:0,dev:0,lat0:null,locks:0,lockPrev:false,stopT:0,brakeMax:0};
   s.burst=false; s.burstWheel=null; }
  if(id==="dusk"){ const c=this.cur, stopKm=Math.round((sc.km+75*1.08)*2)/2; c.stopKm=stopKm;
   if(!(typeof EneMan!=="undefined"&&EneMan.active)) setTimeout(()=>Radio.push(`今日は ${stopKm.toFixed(1)} km で止めます。それまで指示の速さで。`,"戦略班",{speak:true}),2500); }
  if(sc.long){ this.cur.minConc=1; this.cur.red=0; this.cur.over=0; this.cur.km0=sc.km; }
  if(sc.rt){ this.cur.rtT=8; this.cur.rtB=[50,130]; this.cur.yield=[]; }
  if(sc.town){ this.cur.red=0; this.cur.over=0; this.cur.csEntry=null; }
  Radio.push(`練習シナリオ「${sc.name}」${sc.long?` (${sc.from} から)`:""}${sc.storm&&this.cur.lv==="std"?" (標準: 風は実際の約半分)":""}: ${sc.brief}`,"チーフ");
 },
 /* 暴風雨の突風の並びと風速は、レース中の暴風雨と共通 (js/storm.js)。いちばん強いのは雨の降り始め (前縁) */
 mkGusts(st){ return Storm.gusts(st); },
 stormWind(c,abs){ const st=c.st||c.sc.storm; return Storm.speed(st,c.gusts,(abs-(c.abs0+st.in))*3600,c.sc.wind.ms); },
 /* 横風の上書き (Engine.step から): 道の向きに対して横から。突風は強めの揺らぎ + 一定間隔の強い一吹き */
 wind(s,prof){
  const c=this.cur; if(!c||!s.scenario||!c.sc.wind) return null; const w=c.sc.wind, now=performance.now()/1000;
  if(c.sc.storm){ const sw=this.stormWind(c,(s.day-1)*24+s.hour); return {ms:Math.max(0,sw.ms*(1+0.12*s.wGust)),to:prof.bearing-w.rel*Math.PI/2}; }
  const pulse= w.pulse&&(now%w.pulse)<2.5? 0.7*Math.sin(Math.PI*(now%w.pulse)/2.5) : 0;
  if(pulse>0.5&&!c.pulseMsg){ c.pulseMsg=true; } else if(pulse===0) c.pulseMsg=false;
  return {ms:Math.max(0,w.ms*(1+w.gust*0.35*s.wGust+pulse)),to:prof.bearing-w.rel*Math.PI/2};   // rel=1: 右 (東) から左へ吹く
 },
 /* 毎フレーム: 予報の無線・記録・ゴール判定 */
 frame(es,dtR){
  const c=this.cur; if(!c||c.done||!es.scenario) return;
  const abs=(es.day-1)*24+es.hour;
  if(!c.sc.storm) for(const w of es.weatherPlan||[]){ const k=w.start.toFixed(3); if(!c.warned[k]&&abs>=w.start-0.17&&abs<w.start){ c.warned[k]=true; Radio.push(w.type==="squall"?"前方にスコール。約 10 分で入ります。":"前方に厚い雲。約 10 分で日射が落ちます。","偵察車"); } }
  if(c.sc.storm) this.stormRadio(c,es,abs);
  c.minSoc=Math.min(c.minSoc,es.soc);
  if(this.extra(c,es,dtR)) return;
  let shoulder=false; try{ const p=View.roadPoint(View.s); shoulder=View.lateral<-(p.L+0.2)||View.lateral>p.R+0.2; }catch(e){}
  if((es.offroad||shoulder)&&es.v>1) c.off+=dtR;
  if(c.sc.flat){ if(this.flatFrame(c,es,dtR)) return; }
  if(c.sc.custom) return;
  if(es.km>=c.goal) c.sc.flat? this.finish(es,false,"パンクしたまま走り続けました (止まって交換が必要)") : this.finish(es,true);
  else if(es.soc<=0.02) this.finish(es,false,"電池がなくなりました");
  else if(es.hour>=17) this.finish(es,false,"17 時までに着けませんでした");
 },
 /* 暴風雨の無線: 偵察車 (先の様子と到着までの時間)・前方誘導車 (突風の直前。前を走っているので先に分かる) */
 stormRadio(c,es,abs){
  const st=c.st||c.sc.storm, t=(abs-(c.abs0+st.in))*3600, say=(k,msg,who)=>{ if(c.warned[k]) return; c.warned[k]=true; Radio.push(msg,who,{speak:true}); if(who==="前方誘導車") Snd.alarm(); };
  const big=c.gusts.reduce((m,g)=>Math.max(m,g[1]),0);
  if(t>=-15*60&&t<-14*60) say("s15",`前方の雷雨セルが近づいています。約 15 分で暴風域。突風は最大 ${big.toFixed(0)} m/s (${(big*3.6).toFixed(0)} km/h) 前後の見込み。`,"偵察車");
  if(t>=-8*60&&t<-7*60) say("s8","あと約 8 分で暴風域。いちばん強い突風は雨の降り始めに来ます。走ったままでは危険です。雨が来る前に路肩に止めてください。","偵察車");
  if(t>=-120&&t<-60) say("s2","前方で雨が降り始めた。まもなく突風が来ます!","前方誘導車");
  const lead=Math.max(8,this.LEVELS[c.lv||"real"].lead*(P.timeScale||1));   // 実時間で約 3 秒前 (標準は 6 秒前)
  for(const [t0,pk] of c.gusts) if(pk>=big*0.55&&t>=t0-lead&&t<t0) say("g"+t0,`突風来ます!(約 ${pk.toFixed(0)} m/s・${(pk*3.6).toFixed(0)} km/h)${es.v*3.6>20?" 減速!":""}`,"前方誘導車");
  if(t>=st.dur*3600&&t<st.dur*3600+60) say("end","暴風域を抜けます。風は弱まっていきます。","偵察車");
 },
 /* パンクの練習: 決めた地点 (速度が出ていれば) でどれかの車輪がパンク → 振れ・車線からのずれ・ロックを記録 → 止まったら採点 */
 flatFrame(c,es,dtR){
  const f=c.flat, kmh=es.v*3.6;
  if(!f.burst){ if(es.km>=f.atKm&&kmh>=c.sc.flat.minKmh){ const n=Tire.params().wh.length; f.wheel=Math.floor(Math.random()*n); f.burst=true; f.abs=(es.day-1)*24+es.hour; f.lat0=View.lateral;
    es.burst=true; es.burstWheel=f.wheel; Snd.bang(); toast("💥 パンク!","#ef4444"); if(typeof FFB!=="undefined"&&FFB.kick) FFB.kick(0.9,0.8,400); }
   return false; }
  const T=View.tire; if(T&&es.v>2) f.beta=Math.max(f.beta,Math.abs(Tire.beta(T,es.v)));
  if(f.lat0!=null&&es.v>2) f.dev=Math.max(f.dev,Math.abs(View.lateral-f.lat0));
  if(es.tireLock&&!f.lockPrev) f.locks++; f.lockPrev=!!es.tireLock;
  f.brakeMax=Math.max(f.brakeMax,-(es.gLong||0));
  if(f.beta>0.6){ this.finish(es,false,"車が回ってしまいました (スピン)"); return true; }
  if(es.rolledOver||es.crashed){ this.finish(es,false,"横転・事故"); return true; }
  f.stopT= es.v<0.3? f.stopT+dtR : 0;
  if(f.stopT>1){ this.finish(es,true); return true; }
  return false;
 },
 /* パンクの練習の採点の行 */
 flatRows(c,es){
  const f=c.flat, p=Tire.params(), w=p.wh[f.wheel]||{}, name= !w.front? "後輪" : w.py<0? "左前" : "右前";
  const tStop=((es.day-1)*24+es.hour-f.abs)*3600, q=View.roadPoint(View.s), L=q.L||3.5, edge=View.lateral<=-(L-1.2)&&View.lateral>=-(L+2.5);
  const pT=Math.min(30,Math.max(0,Math.round(tStop-30))), b=f.beta*57.3, pB= b>10? 25 : b>5? 10 : 0, pD= f.dev>2.5? 20 : f.dev>1.5? 10 : 0;
  const pL=Math.min(20,f.locks*10), pE= edge? 0 : 15, tm=es.tipMax||0, pR= tm>=0.85? 20 : tm>=0.6? 10 : 0;
  return {name,rows:[["パンクした車輪",name,0],["止まるまでの時間",`${tStop.toFixed(0)} 秒 (目安 30 秒以内)`,pT],["車の振れ (横すべりの最大)",`${b.toFixed(1)}°`,pB],
   ["車線からのずれ (最大)",`${f.dev.toFixed(1)} m`,pD],["タイヤのロック",`${f.locks} 回`,pL],["止めた位置",edge?"左の路肩":"車線の中・道の外",pE],["横転の危険度 (最大)",`${Math.round(tm*100)} %`,pR]]};
 },
 hit(){ if(this.cur) this.cur.hits++; },
 onRedRun(){ if(this.cur&&this.cur.red!=null) this.cur.red++; },
 /* 新しいシナリオの毎フレームの処理。true を返すと終わり */
 extra(c,es,dtR){
  const sc=c.sc, kmh=es.v*3.6, lim=speedLimitAt(es.km), V=View;
  if(c.over!=null&&es.stopTimer<=0&&kmh>lim+3) c.over+=dtR;
  if(sc.rt){   // 対向のロードトレインを 30 秒ごと、後ろから 2 台
   c.rtT-=dtR; if(c.rtT<=0&&!V.roadTrains.some(r=>r.ev)){ c.rtT=26+Math.random()*10; const t=V.mkRoadTrain(); V.scene.add(t); V.roadTrains.push({mesh:t,sVis:V.s+900,warned:false,ev:true}); Radio.push("前方からロードトレイン。","前方誘導車"); }
   for(const r of V.roadTrains) if(r.ev&&r.sVis<V.s-250) r.ev=false;
   if(c.rtB.length&&(performance.now()-c.t0)/1000>c.rtB[0]&&typeof Traffic!=="undefined"){ c.rtB.shift(); const t=Traffic.spawn(V,es,"rt",V.s-230,es.v+1,Traffic.HOME); t.f=1; t.cap=96/3.6; c.yield.push({id:t.id,t0:null,ty:null}); }
   for(const y of c.yield){ if(y.t0==null&&Traffic.rtMsg===y.id) y.t0=performance.now(); if(y.t0!=null&&y.ty==null&&(V.lateral<-3.4||es.v<20/3.6)) y.ty=performance.now(); }
  }
  if(sc.town&&c.csEntry==null){ const cp=RP_CS.find(q=>q.km>sc.km&&q.km<sc.km+sc.dist); if(cp&&es.km>cp.km-0.25) c.csEntry=kmh; }
  if(sc.long){ const conc=1-(es.fatigue||0); c.minConc=Math.min(c.minConc,conc);
   es.scnLong={abs0:c.abs0,km0:c.km0,off:c.off,hits:c.hits,minConc:c.minConc,red:c.red,over:c.over,from:sc.from,minSoc:c.minSoc};   // 保存して続きから走れるように
   const el=document.getElementById("lesson-hud"); const left=c.abs0+sc.dur-((es.day-1)*24+es.hour);
   if(((es.day-1)*24+es.hour)>=c.abs0+sc.dur){ this.finishLong(c,es); return true; }
   c.hudT=(c.hudT||0)-dtR; if(c.hudT<=0){ c.hudT=1; this.longHud(c,es,left); } }
  if(sc.custom&&!sc.long&&es.camp){ this.finishDusk(c,es); return true; }
  return false;
 },
 /* 続きから (Save): 長時間の進み具合を戻す */
 restoreLong(es){ const L=es.scnLong; if(!L) return; const sc=this.LIST.long; sc.from=L.from; this.id="long";
  this.cur={sc,abs0:L.abs0,km0:L.km0,goal:1e9,minSoc:L.minSoc,off:L.off,hits:L.hits,minConc:L.minConc,red:L.red,over:L.over,warned:{},done:false,t0:performance.now(),gusts:null,lv:"real"}; },
 longHud(c,es,left){ let el=document.getElementById("scn-hud"); if(!el){ el=document.createElement("div"); el.id="scn-hud"; el.style.cssText="position:absolute;left:50%;top:104px;transform:translateX(-50%);z-index:30;padding:6px 14px;background:rgba(10,12,14,.82);border:1px solid rgba(250,204,21,.6);color:#f5f5f4;font-size:13px;pointer-events:none;white-space:nowrap"; document.getElementById("game-container").appendChild(el); }
  const h=Math.max(0,left), hh=Math.floor(h), mm=Math.floor((h-hh)*60); el.style.display="";
  el.textContent=`長時間 ${c.sc.from} から・残り ${hh}:${String(mm).padStart(2,"0")}・${(es.km-c.km0).toFixed(0)} km・集中力 ${Math.round(100*(1-(es.fatigue||0)))} %`; },
 finishDusk(c,es){ if(c.done) return; c.done=true; const sc=c.sc, em=typeof EneMan!=="undefined"&&EneMan.active;
  const d=es.km-sc.km, ext=es.extensionMin||0, pen=es.morningPenaltyMin||0, q=View.roadPoint(View.s), off=View.lateral<=-3.6, rows=[]; let score=100;
  if(em){ const pD=Math.round(clamp((85-d)*0.8,0,40)); rows.push(["進んだ距離",`${d.toFixed(1)} km (目安 85 km)`,pD]); score-=pD;
   const pP=Math.round(Math.min(40,pen*1.5)); rows.push(["翌朝の遅れ (17:00 超過)",`${pen.toFixed(0)} 分 (超過 ${ext.toFixed(1)} 分)`,pP]); score-=pP; }
  else { const err=Math.abs(es.km-c.stopKm), pS=Math.round(Math.min(30,Math.max(0,err-0.3)*20)); rows.push(["止めた所",`${es.km.toFixed(1)} km (指示 ${c.stopKm.toFixed(1)} km)`,pS]); score-=pS;
   const h=Orders.hist.slice(-12), pr=h.length? h.reduce((a,x)=>a+x.pct,0)/h.length : 1, pO= pr<0.7? 15 : 0; rows.push(["速度指示に合わせた割合",`${(pr*100).toFixed(0)} %`,pO]); score-=pO;
   const pX= ext>10? Math.round(Math.min(20,(ext-10)*2)) : 0; rows.push(["17:00 の超過",`${ext.toFixed(1)} 分`,pX]); score-=pX; }
  const pL= off? 0 : 15; rows.push(["止めた位置",off?"路肩":"車線の上",pL]); score-=pL;
  const pH=Math.min(40,c.hits*20); rows.push(["接触 (動物など)",`${c.hits} 回`,pH]); score-=pH;
  const pB= es.soc<0.05? 20 : 0; rows.push(["止めたときの電池",`${(es.soc*100).toFixed(0)} %`,pB]); score-=pB;
  this.showRes(c,es,true,null,Math.max(0,Math.round(score)),rows); },
 finishLong(c,es){ if(c.done) return; c.done=true; const el=document.getElementById("scn-hud"); if(el) el.style.display="none";
  const d=es.km-c.km0, rows=[]; let score=100;
  const h=Orders.hist.filter(x=>x.km>=c.km0), pr=h.length? h.reduce((a,x)=>a+x.pct,0)/h.length : 1, pO=Math.round(clamp((0.8-pr)*60,0,25));
  rows.push(["走った距離",`${d.toFixed(0)} km (平均 ${(d/c.sc.dur).toFixed(0)} km/h)`,0]);
  rows.push(["速度指示に合わせた割合",h.length?`${(pr*100).toFixed(0)} % (${h.length} 区間)`:"― (採点した区間なし)",pO]); score-=pO;
  const pR=Math.min(20,(c.red||0)*10); rows.push(["赤信号の通過",`${c.red||0} 回`,pR]); score-=pR;
  const pV=Math.min(15,Math.round((c.over||0)/10)); rows.push(["制限速度の超過",`${(c.over||0).toFixed(0)} 秒`,pV]); score-=pV;
  const pO2=Math.min(20,Math.round(c.off/5)); rows.push(["道の外・路肩",`${c.off.toFixed(0)} 秒`,pO2]); score-=pO2;
  const pH=Math.min(30,c.hits*10); rows.push(["接触",`${c.hits} 回`,pH]); score-=pH;
  rows.push(["いちばん低かった集中力",`${Math.round(c.minConc*100)} %`,0]);
  this.showRes(c,es,true,null,Math.max(0,Math.round(score)),rows); },
 finish(es,ok,why){
  const c=this.cur; if(!c||c.done) return; c.done=true;
  const sc=c.sc, tAct=(es.day-1)*24+es.hour-c.abs0, tRef=sc.dist/sc.refV+(sc.extraH||0);
  let rows=[], score=100;
  if(sc.flat&&c.flat&&c.flat.burst){ const F=this.flatRows(c,es); rows=F.rows; for(const r of rows) score-=r[2]; if(!ok) score=Math.min(score,20); score=Math.max(0,Math.round(score)); return this.showRes(c,es,ok,why,score,rows); }
  if(sc.flat) return this.showRes(c,es,false,why||"パンクする前に終わりました",0,[]);
  const slow=Math.max(0,tAct/tRef-1); const pT=Math.min(40,Math.round(slow*100)); score-=pT;
  const pS= es.soc<sc.minSoc? 30 : 0; score-=pS;
  const pM= c.minSoc<0.05? 15 : 0; score-=pM;
  const pO=Math.min(30,Math.round(c.off/2)); score-=pO;
  const pH=Math.min(30,c.hits*10); score-=pH;
  const tm=es.tipMax||0, pR= tm>=0.85? 20 : tm>=0.6? 10 : 0; score-=pR;
  if(!ok) score=Math.min(score,20);
  score=Math.max(0,Math.round(score));
  const hm=(h)=>`${Math.floor(h)}:${String(Math.round(h%1*60)).padStart(2,"0")}`;
  rows.push(["かかった時間",`${hm(tAct)} (目安 ${hm(tRef)} = ${sc.refV} km/h)`,pT]);
  rows.push(["到着時の電池",`${(es.soc*100).toFixed(0)} % (目標 ${(sc.minSoc*100).toFixed(0)} % 以上)`,pS]);
  rows.push(["いちばん減ったとき",`${(c.minSoc*100).toFixed(0)} %`,pM]);
  rows.push(["道の外・路肩",`${c.off.toFixed(0)} 秒`,pO]);
  rows.push(["接触",`${c.hits} 回`,pH]);
  rows.push(["横転の危険度 (最大)",`${Math.round(tm*100)} %${es.rolledOver?" (横転)":""}`,pR]);
  if(sc.town){ const pr=Math.min(30,(c.red||0)*15), pv=Math.min(15,Math.round((c.over||0)/2)), pc= c.csEntry!=null&&c.csEntry>26? 10 : 0;
   rows.push(["赤信号の通過",`${c.red||0} 回`,pr]); rows.push(["制限速度の超過",`${(c.over||0).toFixed(0)} 秒`,pv]); rows.push(["CS に入った速さ",c.csEntry!=null?`${c.csEntry.toFixed(0)} km/h`:"―",pc]); score=Math.max(0,score-pr-pv-pc); }
  if(sc.rt){ const ys=c.yield.filter(y=>y.t0!=null), late=ys.filter(y=>y.ty==null||y.ty-y.t0>20000).length, py=Math.min(20,late*10);
   rows.push(["後ろのロードトレインに道を譲る",`${ys.length-late} / ${ys.length} 回 (無線から 20 秒以内)`,py]); score=Math.max(0,score-py); }
  this.showRes(c,es,ok,why,score,rows);
 },
 showRes(c,es,ok,why,score,rows){
  const sc=c.sc;
  const el=document.getElementById("scn-result")||(()=>{ const d=document.createElement("div"); d.id="scn-result"; d.className="scn-res"; document.body.appendChild(d); return d; })();
  el.innerHTML=`<div class="box"><div class="lb">練習シナリオ</div><h3>${escHtml(sc.name)}${sc.storm?` (${this.LEVELS[c.lv||"real"].name})`:""} ${ok?"":"― 失敗"}</h3>
   ${why?`<div class="why">${escHtml(why)}</div>`:""}<div class="score"><b>${score}</b><span>/ 100</span></div>
   <div class="rows">${rows.map(r=>`<span>${r[0]}</span><span>${r[1]}</span><span class="${r[2]?"bad":"good"}">${r[2]?"-"+r[2]:"OK"}</span>`).join("")}</div>
   <div class="lb" style="margin-top:12px">ポイント</div><ul>${sc.tip.map(t=>`<li>${escHtml(t)}</li>`).join("")}</ul>
   <div class="btns"><button class="btn" onclick="Scenario.closeRes();quitToMenu()">メニューへ</button><button class="btn pri" onclick="Scenario.closeRes();startGame()">もう一度</button></div></div>`;
  el.classList.add("on"); modalPause=true; Snd.silence(); if(typeof FFB!=="undefined") FFB.update(null); Snd.chime&&Snd.chime();
  this.last={id:this.id,score,ok}; DrvRec.record(); DrvRec.scenario(this.id,score);
 },
 closeRes(){ const el=document.getElementById("scn-result"); if(el) el.classList.remove("on"); modalPause=false; },
 reset(){ this.cur=null; this.id=null; },
};
