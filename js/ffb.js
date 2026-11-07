"use strict";
/* ============ フォースフィードバック (振動・ハンドルの反力) ============
 段階 1: ゲームパッドの振動 (Gamepad の vibrationActuator, "dual-rumble")
  ・路面の細かい振動 (弱いモーター): 速度に比例。町のなめらかな舗装は弱く、郊外の荒い舗装は強め
  ・路肩 (舗装の外) / 道の外 (土・砂利): 強いモーターで不規則に揺れる
  ・ロードトレインとすれ違う瞬間: 相対速度と距離に応じた強い衝撃 (約 300 ms)
  ・強いブレーキ: タイヤが滑り出す強さでは、断続的に震える (ロック・ABS の感覚)
  ・接触・衝突: 強さに応じた衝撃
 段階 2: ハンコンの反力 (WebHID。Chrome / Edge のパソコン版のみ)
  ・Logicool の従来の命令 (G29 / G27 / G25 / Driving Force GT など) に対応。G920 / G923 (Xbox 版) は別の方式のため未対応
  ・中央へ戻す力 (速度が上がるほど強い)・低速で大きく切ったときの重さ (ダンパー)
  ・横風と突風: 風下側へ取られる力。ロードトレインの風圧。道の外のがたつき
 強さは OPTIONS の「振動・反力」(OFF / 弱 / 中 / 強) */
const FFB={
 LV:{off:0,low:0.35,mid:0.65,high:1},
 gain(){ const g=this.LV[P.ffb]; return g==null? this.LV.mid : g; },
 /* 項目ごとの強さ (0〜2 倍。ハンコン割当の画面で調整) */
 TUNE:[["road","路面の細かい振動"],["offroad","路肩・道の外"],["train","ロードトレイン"],["brake","強いブレーキ"],["center","中央へ戻す力"],["damper","低速の重さ"],["wind","横風・突風"]],
 T(k){ const o=P.ffbTune, v=o&&typeof o==="object"? +o[k] : 1; return Number.isFinite(v)? clamp(v,0,2) : 1; },
 setT(k,v){ P.ffbTune=Object.assign({},P.ffbTune&&typeof P.ffbTune==="object"?P.ffbTune:{},{[k]:clamp(+v,0,2)}); Settings.save(); this.tuneUI(); },
 resetT(){ P.ffbTune={}; Settings.save(); this.tuneUI(); },
 tuneUI(){ const box=document.getElementById("ffb-tune"); if(!box) return;
  if(!box.dataset.built){ box.dataset.built="1"; box.innerHTML=this.TUNE.map(([k,n])=>`<label class="ffb-t"><span>${n}</span><input type="range" min="0" max="2" step="0.1" data-k="${k}"><b data-v="${k}"></b></label>`).join("")+`<div class="flex justify-end mt-1"><button class="btn text-xs py-1" onclick="FFB.resetT()">既定に戻す</button></div>`;
   box.addEventListener("input",e=>{ const i=e.target.closest("input[data-k]"); if(i) this.setT(i.dataset.k,i.value); }); }
  for(const [k] of this.TUNE){ const i=box.querySelector(`input[data-k="${k}"]`), b=box.querySelector(`b[data-v="${k}"]`); if(i&&document.activeElement!==i) i.value=String(this.T(k)); if(b) b.textContent=Math.round(this.T(k)*100)+" %"; } },
 tSend:0, kickUntil:0, kickS:0, kickW:0, trainPrev:null, crossPrev:0, crossKick:0, crossKickT:0, steerPrev:0,
 /* ---------- 段階 1: 振動 ---------- */
 pad(){ const gs=navigator.getGamepads? navigator.getGamepads() : []; for(const g of gs) if(g&&g.connected&&(g.vibrationActuator||(g.hapticActuators&&g.hapticActuators.length))) return g; return null; },
 rumble(strong,weak,ms){
  const g=this.pad(); if(!g) return;
  strong=clamp(strong,0,1); weak=clamp(weak,0,1);
  try{
   if(g.vibrationActuator&&g.vibrationActuator.playEffect) g.vibrationActuator.playEffect("dual-rumble",{startDelay:0,duration:ms,weakMagnitude:weak,strongMagnitude:strong}).catch(()=>{});
   else if(g.hapticActuators&&g.hapticActuators[0]&&g.hapticActuators[0].pulse) g.hapticActuators[0].pulse(Math.max(strong,weak),ms);
  }catch(e){}
 },
 /* 衝撃 (接触・衝突・すれ違いなど): 一定時間、強さの下限を上げる */
 kick(strong,weak,ms){ const g=this.gain(); if(!g) return; const until=performance.now()+ms;
  this.kickS=Math.max(this.kickS*(performance.now()<this.kickUntil?1:0),strong*g); this.kickW=Math.max(this.kickW*(performance.now()<this.kickUntil?1:0),(weak==null?strong:weak)*g); this.kickUntil=Math.max(this.kickUntil,until);
  this.hidKick=(this.hidKick||0)+(Math.random()<0.5?-1:1)*strong*0.5; },
 stop(){ this.rumble(0,0,1); this.kickUntil=0; this.torque(0,true); },
 /* 毎フレーム。d = {v [m/s], steer (-1〜1, ハンドルの位置), offroad, shoulder, rough (0〜1), cross [m/s], trainRel [m] (null = 近くにいない), trainV [m/s], brake (0〜1), gLat, dt} */
 update(d){
  const G=this.gain(), now=performance.now();
  if(!G||!d){ if(this.on){ this.on=false; this.stop(); } return; }
  if(!this.on){ this.crossPrev=d.cross||0; this.steerPrev=d.steer||0; this.trainPrev=null; }   // 始めのフレームを「急な変化」と見なさない
  this.on=true;
  const v=Math.max(0,d.v||0), kmh=v*3.6, dt=d.dt||0.016, R=()=>Math.random();
  // ---- 振動の強さ ----
  const tR=this.T("road"), tO=this.T("offroad"), tT=this.T("train"), tB=this.T("brake"), tW=this.T("wind");
  let weak=Math.min(kmh/120,1)*0.35*(0.55+0.45*(d.rough==null?0.6:d.rough))*(0.85+0.3*R())*tR;   // 路面の細かい振動
  let strong=0;
  if(d.offroad&&v>0.5) strong=Math.max(strong,(0.45+0.35*R())*Math.min(1,0.3+kmh/60)*tO);       // 土・砂利: 不規則
  else if(d.shoulder&&v>0.5) strong=Math.max(strong,(0.25+0.25*R())*Math.min(1,0.3+kmh/70)*tO);   // 路肩
  if((d.offroad||d.shoulder)&&v>0.5) weak=Math.max(weak,(0.3+0.2*R())*tO);
  // ロードトレイン: 近いほど強く揺れ、横を通る瞬間 (前後の位置が入れ替わる) に衝撃
  if(d.trainRel!=null){ const a=Math.abs(d.trainRel), s=clamp(1-a/14,0,1), rv=clamp(((d.trainV||27)+v)/50,0.4,1.4);
   strong=Math.max(strong,s*0.75*rv*tT); weak=Math.max(weak,s*0.6*tT);
   if(this.trainPrev!=null&&Math.sign(this.trainPrev)!==Math.sign(d.trainRel)&&a<30&&tT>0){ this.kick(0.95*rv*tT,0.8*tT,300); this.hidKick=(this.hidKick||0)-0.6*rv*tT; }   // 風圧で道の外側 (左) へ
   this.trainPrev=d.trainRel; } else this.trainPrev=null;
  // 強いブレーキ: 滑り出す強さ (速度があり、ブレーキが強い) では断続的に震える
  if((d.brake||0)>0.75&&kmh>25){ const on=(now%110)<55; strong=Math.max(strong,(on?0.55:0.1)*tB); weak=Math.max(weak,(on?0.5:0.15)*tB); }
  // 大きい横 G: タイヤが鳴るような細かい震え
  if(Math.abs(d.gLat||0)>0.45) weak=Math.max(weak,clamp((Math.abs(d.gLat)-0.45)*1.2,0,0.5));
  // 突風: 横風が急に強まった瞬間
  const cross=d.cross||0, dc=(cross-this.crossPrev)/Math.max(dt,1e-3); this.crossPrev=cross;
  if(Math.abs(dc)>4&&kmh>20){ this.crossKick=clamp(dc/20,-1,1)*tW; this.crossKickT=now+250; strong=Math.max(strong,Math.min(0.4,Math.abs(dc)/30)*tW); }
  if(now<this.kickUntil){ strong=Math.max(strong,this.kickS); weak=Math.max(weak,this.kickW); }
  // 送る間隔: 約 60 ms ごとに、少し長めの時間で更新し続ける (途切れないように)
  if(now-this.tSend>=60){ this.tSend=now; this.rumble(strong*G,weak*G,120); }
  // ---- 段階 2: ハンドルの反力 ----
  if(this.hid){
   const ang=clamp(d.steer||0,-1,1), w=(ang-this.steerPrev)/Math.max(dt,1e-3); this.steerPrev=ang;
   const kS=(0.12+0.55*Math.min(kmh/80,1))*this.T("center");   // 中央へ戻す力 (キャスター): 速いほど強い
   const cD=(0.05+0.25*(1-Math.min(kmh/25,1)))*this.T("damper"); // 低速で切るときの重さ (タイヤの摩擦)
   let T=-ang*kS - clamp(w,-4,4)*cD*0.12;
   T+=clamp(cross/12,-1,1)*0.18*Math.min(kmh/40,1)*tW;          // 横風: 風下側へ取られる
   if(now<this.crossKickT) T+=this.crossKick*0.35;               // 突風の瞬間
   if(d.offroad&&v>0.5) T+=(R()-0.5)*0.35*Math.min(1,kmh/40);    // 道の外のがたつき
   if(this.hidKick){ T+=this.hidKick; this.hidKick*=Math.pow(0.02,dt); if(Math.abs(this.hidKick)<0.01) this.hidKick=0; }
   this.torque(clamp(T,-1,1)*G);
  }
 },
 /* ---------- 段階 2: WebHID (Logicool の従来方式: 7 バイトの出力レポート) ---------- */
 hid:null, hidBusy:false, hidX:128, hidT:0,
 hidOK(){ return typeof navigator!=="undefined"&&!!navigator.hid; },
 status(msg){ const el=document.getElementById("ffb-hid-st"); if(el) el.textContent=msg; },
 async connect(){
  if(!this.hidOK()){ toast("このブラウザはハンコンの反力 (WebHID) に対応していません。パソコン版の Chrome / Edge を使ってください","#f59e0b"); return; }
  try{
   const list=await navigator.hid.requestDevice({filters:[{vendorId:0x046d}]});   // Logicool
   if(!list||!list.length){ this.status("未接続"); return; }
   await this.open(list[0]);
  }catch(e){ this.status("接続できませんでした"); toast("ハンコンに接続できませんでした: "+escHtml(String(e.message||e)).slice(0,80),"#ef4444"); }
 },
 async open(dev){
  if(!dev.opened) await dev.open();
  this.hid=dev; this.hidX=-1;
  await this.send([0xf5,0,0,0,0,0,0]);                         // 本体の自動センタリングを切る (中央へ戻す力はこちらで計算)
  this.status("接続中: "+(dev.productName||"Logicool").slice(0,28));
  toast("ハンコンの反力を有効にしました","#34d399");
 },
 async send(bytes){ if(!this.hid) return; try{ await this.hid.sendReport(0,new Uint8Array(bytes)); }catch(e){ if(!this.hidErr){ this.hidErr=true; this.status("送信できません (この機種は未対応の可能性)"); } } },
 /* 一定の力 (-1〜1, 正 = 右へ回す力)。変化があるとき・250 ms ごとに送る。前の送信が終わっていなければ飛ばす */
 torque(T,force){
  if(!this.hid) return;
  const x=clamp(Math.round(128+(P.ffbInv?-1:1)*T*127),1,255), now=performance.now();
  if(this.hidBusy&&!force) return;
  if(!force&&x===this.hidX&&now-this.hidT<250) return;
  this.hidX=x; this.hidT=now; this.hidBusy=true;
  const cmd= T===0&&force? [0x13,0,0,0,0,0,0] : [0x11,0x08,x,0x80,0,0,0];   // 0x13 = 止める, 0x11 = 1 番の枠に一定の力
  this.send(cmd).finally(()=>{ this.hidBusy=false; });
 },
 async disconnect(){ if(!this.hid) return; try{ await this.send([0x13,0,0,0,0,0,0]); await this.hid.close(); }catch(e){} this.hid=null; this.status("未接続"); },
 /* 確認: 右へ 0.6 秒 → 左へ 0.6 秒、振動 0.5 秒 */
 test(){
  this.rumble(0.8*Math.max(this.gain(),0.35),0.6,500);
  if(this.hid){ this.torque(0.45,true); setTimeout(()=>this.torque(-0.45,true),600); setTimeout(()=>this.torque(0,true),1200); }
  if(!this.pad()&&!this.hid) toast("振動に対応したコントローラーが見つかりません","#f59e0b");
 },
 init(){
  if(this.hidOK()){
   navigator.hid.getDevices().then(ds=>{ const d=ds.find(x=>x.vendorId===0x046d); if(d) this.open(d).catch(()=>{}); }).catch(()=>{});   // 前に許可した機器は自動でつなぐ
   navigator.hid.addEventListener("disconnect",e=>{ if(e.device===this.hid){ this.hid=null; this.status("未接続 (外れました)"); } });
  } else this.status("このブラウザは非対応");
  const inv=document.getElementById("ffb-inv"); if(inv) inv.checked=!!P.ffbInv;
  this.tuneUI();
 },
 /* ゲームの状態から入力値を作る (レース・イベント) */
 fromRace(es,dt){
  let shoulder=false, rough=0.6, trainRel=null, trainV=27;
  try{ if(typeof View!=="undefined"&&View.road){ const p=View.roadPoint(View.s); shoulder=View.lateral<-(p.L+0.3)||View.lateral>p.R+0.3;
   rough= (typeof isCity==="function"&&(isCity(es.km)||townProx(es.km)<2.5))? 0.25 : 0.65;
   let best=1e9; for(const rt of View.roadTrains||[]){ const rel=rt.sVis-View.s; if(Math.abs(rel)<Math.abs(best)) best=rel; } if(Math.abs(best)<60) trainRel=best; } }catch(e){}
  return {v:es.v,steer:Input.gamepadOK?Input.gpSteer:Input.steer,offroad:!!es.offroad,shoulder,rough,cross:es.lastCross||0,trainRel,trainV,brake:es.brakePhys||0,gLat:es.gLat||0,dt};
 },
};
