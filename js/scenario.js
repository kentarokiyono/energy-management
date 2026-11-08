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
   wx:[{in:0.45,dur:0.55,type:"squall",factor:0.06}],wind:{ms:6,rel:1,gust:0.6,pulse:0},storm:{in:0.45,dur:0.55,mean:14,max:27},
   brief:"Day6 14:12、Port Augusta の先 2790 km (ゴールまで 237 km)。偵察車から「西から雷雨のセル。約 27 分後に暴風雨、突風は 25 m/s を超える見込み」。前方誘導車は突風の直前に知らせる。横転せずに 45 km 先まで行く。",
   tip:["暴風域に入る前に路肩に寄せて止まり、通り過ぎるのを待つのが基本。走ったままだと、ゆっくりでも 20 m/s 前後の突風で倒れることがある","止まってしばらくすると、誘導車と追走車が風上で風よけになり、クルーが車体を押さえる (横転の危険度が大きく下がる)","横風の力は走っているほど大きい (車の速度と風が合わさる)","突風で流されたとき、ハンドルを大きく切ると遠心力が横風に加わって倒れやすい。当て舵は小さく","画面の「横転」の % (危険度) が 60 % を超えたら、すぐに減速"]}},
 cur:null, id:null,
 pick(){ const v=(document.getElementById("scenario")||{}).value; return v&&this.LIST[v]? v : null; },
 /* 走り始めの設定 (Engine.init の後): 場所・時刻・電池・天気・他チーム */
 apply(id){
  const sc=this.LIST[id]; if(!sc) return; const s=Engine.st;
  s.km=sc.km; s.day=sc.day; s.hour=sc.hour; s.dayOfYear=PRO.dayOfYear+sc.day-1; s.soc=sc.soc;
  for(const q of RP_CS) if(q.km<sc.km) s.passedCP.add(q.km);
  if(RP_RULES.driverChange.km<sc.km) s.dcDone=true;
  s.camp=false; s.stopTimer=0; s.chapter=null; s.scenario=id; s.gridStartH=0;
  const abs0=(sc.day-1)*24+sc.hour;
  s.weatherPlan=sc.wx.map(w=>({start:abs0+w.in,dur:w.dur,type:w.type,factor:w.factor})); s.fc=null;   // シナリオは予報どおり
  for(const tm of s.teams||[]){ tm.status="run"; tm.km=clamp(sc.km+(Math.random()-0.5)*60+(tm.spd-70)*0.8,0,TOTAL_KM-1); for(const cp of ROUTE) if(cp.cp&&cp.km<tm.km) tm.cs.add(cp.km); }
  this.id=id; this.cur={sc,abs0,goal:sc.km+sc.dist,minSoc:sc.soc,off:0,hits:0,warned:{},done:false,t0:performance.now(),gusts:sc.storm? this.mkGusts(sc.storm) : null};
  s.tipMax=0;
  Radio.push(`練習シナリオ「${sc.name}」: ${sc.brief}`,"チーフ");
 },
 /* 暴風雨の突風の並び [暴風域に入ってからの秒 (ゲーム内), 最大風速 m/s]。50〜110 秒ごと、真ん中ほど強い (毎回同じ並び) */
 mkGusts(st){ let x=7, t=20; const rnd=()=>((x=(x*16807)%2147483647)/2147483647), out=[], T=st.dur*3600;
  while(t<T-30){ const mid=1-Math.abs(t/T-0.5)*2; out.push([t,Math.min(st.max,st.mean*(1.25+0.35*rnd()+0.45*mid))]); t+=50+60*rnd(); } return out; },
 /* 暴風雨の風 [m/s]: 入る 10 分前から強まり、中は平均 + 突風 (4 秒で強まり 3 秒続き 5 秒で弱まる)、抜けたら 10 分で収まる */
 stormWind(c,abs){ const st=c.sc.storm, base=c.sc.wind.ms, t=(abs-(c.abs0+st.in))*3600, T=st.dur*3600;
  if(t<0) return {ms:base+(st.mean-base)*clamp(1+t/600,0,1),gust:0};
  if(t>T) return {ms:base+(st.mean-base)*clamp(1-(t-T)/600,0,1),gust:0};
  let g=0; for(const [t0,pk] of c.gusts){ const d=t-t0; if(d<-1||d>13) continue; const f= d<4? clamp(d/4,0,1) : d<7? 1 : clamp(1-(d-7)/5,0,1); g=Math.max(g,(pk-st.mean)*f); }
  return {ms:st.mean+g,gust:g}; },
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
  let shoulder=false; try{ const p=View.roadPoint(View.s); shoulder=View.lateral<-(p.L+0.2)||View.lateral>p.R+0.2; }catch(e){}
  if((es.offroad||shoulder)&&es.v>1) c.off+=dtR;
  if(es.km>=c.goal) this.finish(es,true);
  else if(es.soc<=0.02) this.finish(es,false,"電池がなくなりました");
  else if(es.hour>=17) this.finish(es,false,"17 時までに着けませんでした");
 },
 /* 暴風雨の無線: 偵察車 (先の様子と到着までの時間)・前方誘導車 (突風の直前。前を走っているので先に分かる) */
 stormRadio(c,es,abs){
  const st=c.sc.storm, t=(abs-(c.abs0+st.in))*3600, say=(k,msg,who)=>{ if(c.warned[k]) return; c.warned[k]=true; Radio.push(msg,who,{speak:true}); if(who==="前方誘導車") Snd.alarm(); };
  const big=c.gusts.reduce((m,g)=>Math.max(m,g[1]),0);
  if(t>=-15*60&&t<-14*60) say("s15",`前方の雷雨セルが近づいています。約 15 分で暴風域。突風は最大 ${big.toFixed(0)} m/s 前後の見込み。`,"偵察車");
  if(t>=-8*60&&t<-7*60) say("s8","あと約 8 分で暴風域。突風は 20 m/s を超えます。走ったままでは危険です。路肩に止められる場所を探して、暴風域に入る前に止まってください。","偵察車");
  if(t>=-120&&t<-60) say("s2","前方で雨と強い風。まもなく暴風域に入ります。","前方誘導車");
  const lead=Math.max(8,3*(P.timeScale||1));   // 実時間で約 3 秒前
  for(const [t0,pk] of c.gusts) if(pk>=20&&t>=t0-lead&&t<t0) say("g"+t0,`突風来ます!(約 ${pk.toFixed(0)} m/s)${es.v*3.6>20?" 減速!":""}`,"前方誘導車");
  if(t>=st.dur*3600&&t<st.dur*3600+60) say("end","暴風域を抜けます。風は弱まっていきます。","偵察車");
 },
 hit(){ if(this.cur) this.cur.hits++; },
 finish(es,ok,why){
  const c=this.cur; if(!c||c.done) return; c.done=true;
  const sc=c.sc, tAct=(es.day-1)*24+es.hour-c.abs0, tRef=sc.dist/sc.refV, rows=[];
  let score=100;
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
  const el=document.getElementById("scn-result")||(()=>{ const d=document.createElement("div"); d.id="scn-result"; d.className="scn-res"; document.body.appendChild(d); return d; })();
  el.innerHTML=`<div class="box"><div class="lb">練習シナリオ</div><h3>${escHtml(sc.name)} ${ok?"":"― 失敗"}</h3>
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
