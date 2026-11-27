"use strict";
/* ============ エネマネ班の役割 (本戦・練習シナリオ) ============
 車は自動運転 (js/autodrive.js)。プレイヤーは戦略班として次を決める:
  ・速度指示 (時速・電流): 送ると無線で流れ、自動運転がその速さで走る (制限速度・信号・動物などは自動運転が守る)
  ・17:00 の停車地点 (km): そこで路肩に止める。17:00 前に着けば 17:00 まで待つ、過ぎれば超過のペナルティ
  ・CS・キャンプのパネル角度: 傾ける画面が出たら選ぶ (ドライバーの役割と同じ画面)
  ・充電停車 / 再開、ドライバー交代 (止まっている間だけ。交代したドライバーは疲れが 0 から)
 電池のグラフ: これまでの電池残量 (実線) と、今の指示の速さで走り続けたときの見込み (点線)。CS の位置に印
 役割はメニューで選び、この端末に覚えておく */
const EneMan={
 KEY:"bwsc_role", role:"driver", active:false, fc:null, job:null, fcT:0, hist:[], view:"batt",
 load(){ try{ const r=localStorage.getItem(this.KEY); if(r==="eneman"||r==="driver") this.role=r; }catch(e){} },
 setRole(r){ this.role=r==="eneman"?"eneman":"driver"; try{ localStorage.setItem(this.KEY,this.role); }catch(e){} this.ui(); },
 ui(){ document.querySelectorAll("#seg-role button").forEach(b=>b.classList.toggle("on",b.dataset.role===this.role));
  const d=document.getElementById("role-desc"); if(d) d.textContent= this.role==="eneman"? "車は自動運転。速度指示・17:00 の停車地点・パネル角度・充電停車・ドライバー交代を決める。電池のグラフを見ながら" : "自分で運転する。速度は戦略班 (自動) が無線で指示"; },
 want(){ return this.role==="eneman"&&P.mode==="race"&&!P.event&&!(typeof Lesson!=="undefined"&&Lesson.active); },
 /* startGame の最後 (課題・イベントでないとき) */
 begin(){
  if(!this.want()) return; this.active=true; this._crew=P.crewProc; P.crewProc=false; this._ord=P.orders; P.orders=true;
  Orders.mode="manual"; Orders.cur=null; AutoDrive.enable(true); this.hist=[]; this.fc=null; this.job=null; this.fcT=0;
  this.panel(true); document.body.classList.add("em-on");   // スマホ: 運転の操作を隠し、エネマネ班の欄を下に置く (css/theme.css)
  Radio.push("エネマネ班の役割: 車は自動運転。速度指示を送ってください (左の欄)。指示がない間は時速 70 km で走ります。","チーフ");
  AutoDrive.vSet=70;
 },
 end(){ if(!this.active) return; this.active=false; AutoDrive.enable(false); AutoDrive.vSet=null; if(this._crew!==undefined) P.crewProc=this._crew; if(this._ord!==undefined) P.orders=this._ord; Orders.mode="auto"; this.panel(false); document.body.classList.remove("em-on"); },
 /* 指示を送る */
 send(v){ const es=Engine.st; v=clamp(Math.round(+v||0),20,130); if(!es) return;
  const I=Orders.current(es,v,es.km,Math.min(10,TOTAL_KM-es.km));
  Orders.manual(v,I); AutoDrive.vSet=v; this.fcT=0; this.draw(); },   // 指示の区間 (10 km) が終わっても同じ速さで走り続ける
 setStop(km){ const es=Engine.st; km=+km; if(!(km>es.km)){ AutoDrive.stopAt=null; toast("17:00 の停車地点を取り消しました"); }
  else { AutoDrive.stopAt=km; Radio.push(`今日は ${km.toFixed(1)} km 地点で止めます。`,"戦略班",{speak:true}); } this.draw(); },
 charge(){ const es=Engine.st; if(!es) return; if(AutoDrive.chargeReq||AutoDrive.charging){ AutoDrive.resume(); Radio.push("充電停車を終えて出発します。","戦略班"); }
  else { AutoDrive.chargeReq=true; Radio.push("充電のため路肩に止めてください。","戦略班",{speak:true}); } this.draw(); },
 /* 点検・修理: 路肩に止めて停車メニュー (タイヤ交換・機器チェック・充電) を開く */
 repair(){ const es=Engine.st; if(!es) return; AutoDrive.repair(); Radio.push("点検のため路肩に止めてください。","戦略班",{speak:true}); this.draw(); },
 swap(){ const es=Engine.st; if(!es) return;
  const stopped= es.v<0.3&&(es.stopTimer>0||es.camp||AutoDrive.charging);
  if(!stopped){ toast("ドライバー交代は止まっている間 (CS・充電停車・キャンプ) だけ","#f59e0b"); return; }
  if(Crew.drivers&&Crew.drivers.length>1) Crew.setDriver((Crew.driverIdx+1)%Crew.drivers.length); else Crew.driverIdx=(Crew.driverIdx+1)%2;
  const n=Crew.drivers&&Crew.drivers[Crew.driverIdx]? Crew.drivers[Crew.driverIdx].name : `ドライバー ${Crew.driverIdx+1}`;
  Radio.push(`ドライバー交代: ${n}`,"チーフ"); toast(`ドライバー交代 → ${n}`,"#34d399"); },
 /* ---------- 画面 ---------- */
 panel(on){ let el=document.getElementById("em-panel");
  if(!on){ if(el) el.style.display="none"; const g=document.getElementById("em-data"); if(g) g.style.display="none"; return; }
  if(!el){ el=document.createElement("div"); el.id="em-panel"; el.className="pn";
   el.style.cssText="left:16px;top:298px;width:330px;padding:8px 10px;font-size:12px;z-index:20;pointer-events:auto";
   el.innerHTML=`<style>#em-panel .btn{padding:2px 8px;font-size:12px;height:auto;min-width:0;line-height:1.6} #em-panel input{font-size:12px}</style><div style="font-weight:700;margin-bottom:6px">エネマネ班 <span id="em-cur" style="font-weight:400;opacity:.7"></span></div>
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px"><span style="white-space:nowrap">時速</span> <button class="btn" data-d="-5">−5</button><input id="em-v" type="number" min="20" max="130" value="70" style="width:56px;background:#111;color:#eee;border:1px solid #444;padding:2px 4px"> km <button class="btn" data-d="5">+5</button><button class="btn pri" id="em-send">送る</button></div>
    <div id="em-hint" style="opacity:.7;margin-bottom:6px"></div>
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px"><span style="white-space:nowrap">17:00 停車</span> <input id="em-stop" type="number" step="1" style="width:70px;background:#111;color:#eee;border:1px solid #444;padding:2px 4px"> km <button class="btn" id="em-stop-set">決める</button></div>
    <div id="em-stop-hint" style="opacity:.7;margin-bottom:6px"></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" id="em-charge">充電停車</button><button class="btn" id="em-repair">点検・修理</button><button class="btn" id="em-swap">ドライバー交代</button></div>
    <div id="em-fault" style="margin-top:4px"></div>`;
   document.getElementById("game-container").appendChild(el);
   const vi=el.querySelector("#em-v");
   el.querySelectorAll("[data-d]").forEach(b=>b.onclick=()=>{ vi.value=clamp((+vi.value||70)+(+b.dataset.d),20,130); });
   el.querySelector("#em-send").onclick=()=>this.send(vi.value);
   vi.addEventListener("keydown",e=>{ e.stopPropagation(); if(e.key==="Enter") this.send(vi.value); });
   const si=el.querySelector("#em-stop"); si.addEventListener("keydown",e=>{ e.stopPropagation(); if(e.key==="Enter") this.setStop(si.value); });
   el.querySelector("#em-stop-set").onclick=()=>this.setStop(si.value);
   el.querySelector("#em-charge").onclick=()=>this.charge(); el.querySelector("#em-repair").onclick=()=>this.repair(); el.querySelector("#em-swap").onclick=()=>this.swap();
   /* グラフ・数値の欄: 電池 / 速度 / 電力 / 数値 を切り替える */
   const g=document.createElement("div"); g.id="em-data"; g.className="pn";
   g.innerHTML=`<div id="em-tabs">${[["batt","電池"],["spd","速度"],["pow","電力"],["num","数値"]].map(([k,t])=>`<button type="button" data-v="${k}">${t}</button>`).join("")}</div>
    <canvas id="em-graph"></canvas><div id="em-num"></div>`;
   document.getElementById("game-container").appendChild(g);
   g.querySelectorAll("#em-tabs button").forEach(b=>b.onclick=()=>{ this.view=b.dataset.v; this.draw(); }); }
  el.style.display=""; document.getElementById("em-data").style.display=""; },
 /* 毎フレーム (main.js): 記録・見込みの計算・表示 */
 frame(dtR){ if(!this.active) return; const es=Engine.st; if(!es) return;
  // 記録 (0.5 km ごと): [km, 電池, 速度 km/h, 指示 km/h, 制限速度, 発電 W, モーター W, 収支 W]
  const last=this.hist[this.hist.length-1]; if(!last||Math.abs(es.km-last[0])>=0.5) this.hist.push([es.km,es.soc,es.v*3.6,(Orders.cur&&Orders.cur.v)||AutoDrive.vSet||0,speedLimitAt(es.km),es.lastSolar||0,es.lastMotorW||0,es.lastNet||0]);
  // 見込み: 今の指示の速さで走り続けたとき (2 km ごと)。15 秒ごとに作り直し、1 フレーム 3 ms まで
  this.fcT-=dtR;
  if(this.fcT<=0&&!this.job){ const v=(Orders.cur&&Orders.cur.v)||AutoDrive.vSet||70; this.job=Strategy.simulateGen(v,{abs:(es.day-1)*24+es.hour,km:es.km,soc:es.soc,trace:true}); this.fcT=15; }
  if(this.job){ const t=performance.now(); try{ while(performance.now()-t<3){ const r=this.job.next(); if(r.done){ this.fc=r.value; this.job=null; break; } } }catch(e){ this.job=null; } }
  this._dt=(this._dt||0)+dtR; if(this._dt>0.5){ this._dt=0; this.draw(); }
 },
 draw(){ const es=Engine.st; if(!es||!this.active) return;
  const v=(Orders.cur&&Orders.cur.v)||AutoDrive.vSet||70, cur=document.getElementById("em-cur"), hint=document.getElementById("em-hint"), sh=document.getElementById("em-stop-hint");
  if(cur) cur.textContent=`いま 時速 ${v} km${Orders.cur? `・${Orders.cur.I.toFixed(1)} A` : " (指示なし)"}`;
  const p=Strategy.last; if(hint) hint.textContent=`戦略計算の推奨 時速 ${p? p.v : "―"} km・電池 ${(es.soc*100).toFixed(0)} %${this.fc&&this.fc.minSoc!=null? `・見込み最低 ${(this.fc.minSoc*100).toFixed(0)} % (${this.fc.minKm.toFixed(0)} km)` : ""}`;
  if(sh){ const left=17-es.hour, at= left>0? es.km+v*left : es.km; let t=`このままだと 17:00 に約 ${at.toFixed(0)} km`;
   if(AutoDrive.stopAt!=null){ const need=(AutoDrive.stopAt-es.km)/v-left; t+=` / 停車 ${AutoDrive.stopAt.toFixed(0)} km: ${need>0? `17:00 を約 ${(need*60).toFixed(0)} 分超過` : "17:00 前に着く"}`; }
   sh.textContent=t; }
  const cb=document.getElementById("em-charge"); if(cb) cb.textContent= AutoDrive.chargeReq||AutoDrive.charging? "再開" : "充電停車";
  const fe=document.getElementById("em-fault"); if(fe){ const bad=[es.burst&&"タイヤのバースト (止まってタイヤ交換)",es.fault&&"電装系の不具合 (点検・修理 → 機器チェック)"].filter(Boolean);
   fe.textContent= bad.length? "⚠ "+bad.join(" / ") : (AutoDrive.menuReq? "点検のため止まります" : ""); fe.style.color= bad.length? "#f59e0b" : ""; }
  document.querySelectorAll("#em-tabs button").forEach(b=>b.classList.toggle("on",b.dataset.v===this.view));
  const num=this.view==="num", cv=document.getElementById("em-graph"), nd=document.getElementById("em-num");
  if(cv) cv.style.display= num? "none" : ""; if(nd) nd.style.display= num? "" : "none";
  if(num) this.numbers(); else this.graph(); },
 /* 数値の表 */
 numbers(){ const es=Engine.st, el=document.getElementById("em-num"); if(!el) return;
  const v=es.v*3.6, ord=(Orders.cur&&Orders.cur.v)||AutoDrive.vSet, lim=speedLimitAt(es.km), f=(x,d=0)=>Number.isFinite(x)? x.toFixed(d) : "―";
  const nx=RP_CS.find(c=>!es.passedCP.has(c.km)&&c.km>es.km-0.2), abs=(es.day-1)*24+es.hour, hm=a=>{ const d=Math.floor(a/24)+1, h=a-(d-1)*24; return `Day${d} ${Math.floor(h)}:${String(Math.floor(h%1*60)).padStart(2,"0")}`; };
  let csTxt="―"; if(nx){ const d=nx.km-es.km, eta=abs+d/Math.max(20,ord||v||60), close=Route.absHour(nx.close); csTxt=`CS${nx.n} ${nx.name} まで ${f(d)} km・着 ${hm(eta)}・閉まるまで ${f((close-eta)*60)} 分`; }
  const left=17-es.hour, at= left>0? es.km+(ord||v||0)*left : es.km;
  const rows=[["速度",`${f(v)} km/h`],["指示",ord? `${ord} km/h${Orders.cur?`・${f(Orders.cur.I,1)} A`:""}` : "―"],["制限速度",`${lim} km/h`],["自動運転",`${AutoDrive.why||"―"}・スロットル ${f((es.throttleSet||0)*100)} %${es.brakePhys>0.05?"・ブレーキ":es.brakeRegen>0.05?"・回生":""}`],
   ["発電",`${f(es.lastSolar)} W`],["モーター",`${f(es.lastMotorW)} W`],["収支",`${(es.lastNet>0?"+":"")}${f(es.lastNet)} W`],["電池",`${f(es.soc*100,1)} %・${f(es.soc*P.batteryWh)} Wh`],
   ["電圧・電流",`${f(es.lastVterm,1)} V・${f(es.lastIbat,1)} A`],["日射",`${f(es.lastGeff)} W/m²・${es.weather? (es.weather.type==="squall"?"スコール":"曇り") : "晴れ"}`],["風 (向かい・横)",`${f(es.lastHead,1)}・${f(Math.abs(es.lastCross||0),1)} m/s`],
   ["気温・車内",`${f(es.Tamb)} °C・${f(es.Tcab)} °C`],["集中力",`${f(100*(1-(es.fatigue||0)))} %`],["次の CS",csTxt],["17:00 の位置 (見込み)",`${f(at)} km${AutoDrive.stopAt!=null?`・停車 ${f(AutoDrive.stopAt)} km`:""}`],["今日の残り",left>0? `${Math.floor(left)}:${String(Math.floor(left%1*60)).padStart(2,"0")}` : "17:00 を過ぎた"]];
  el.innerHTML=rows.map(r=>`<span>${r[0]}</span><b>${r[1]}</b>`).join(""); },
 graph(){ const cv=document.getElementById("em-graph"); if(!cv) return; const r=cv.getBoundingClientRect(), dpr=Math.min(2,devicePixelRatio||1); if(r.width<10) return;
  if(cv.width!==Math.round(r.width*dpr)||cv.height!==Math.round(r.height*dpr)){ cv.width=Math.round(r.width*dpr); cv.height=Math.round(r.height*dpr); }
  const c=cv.getContext("2d"), W=r.width, H=r.height, es=Engine.st, mode=this.view; c.setTransform(dpr,0,0,dpr,0,0); c.clearRect(0,0,W,H);
  const tr=this.fc&&this.fc.trace||[], h0=(this.hist[0]||[es.km])[0];
  // 横軸: 電池はこの先の見込みまで、速度・電力はこれまでの 150 km
  const k0= mode==="batt"? Math.max(0,h0) : Math.max(h0,es.km-150), k1= mode==="batt"? Math.min(TOTAL_KM,Math.max(es.km+300,tr.length? tr[tr.length-1][0] : es.km+300)) : Math.max(es.km+2,k0+5);
  let lo=0, hi=1, unit="%", fmt=y=>`${Math.round(y*100)}%`;
  if(mode==="spd"){ hi=130; fmt=y=>`${Math.round(y)}`; }
  if(mode==="pow"){ let m=1000; for(const h of this.hist) if(h[0]>=k0) m=Math.max(m,Math.abs(h[5]),Math.abs(h[6]),Math.abs(h[7])); hi=Math.ceil(m/500)*500; lo=-hi; fmt=y=>`${(y/1000).toFixed(1)}k`; }
  const X=k=>38+(k-k0)/(k1-k0||1)*(W-48), Y=y=>8+(hi-y)/(hi-lo)*(H-24);
  c.strokeStyle="#333"; c.fillStyle="#999"; c.font="10px sans-serif"; c.lineWidth=1;
  for(const y of [lo,(lo+hi)/2,hi]){ c.beginPath(); c.moveTo(38,Y(y)); c.lineTo(W-10,Y(y)); c.stroke(); c.fillText(fmt(y),2,Y(y)+3); }
  c.fillStyle="#f5b81c"; for(const q of RP_CS){ if(q.km<k0||q.km>k1) continue; c.fillRect(X(q.km)-0.5,8,1,H-24); c.fillText(`CS${q.n}`,X(q.km)+2,H-4); }
  const H2=this.hist.filter(h=>h[0]>=k0);
  const line=(idx,col,w,dash)=>{ c.strokeStyle=col; c.lineWidth=w; c.setLineDash(dash||[]); c.beginPath(); H2.forEach((h,i)=>i? c.lineTo(X(h[0]),Y(h[idx])) : c.moveTo(X(h[0]),Y(h[idx]))); c.stroke(); c.setLineDash([]); };
  let title="";
  if(mode==="batt"){ line(1,"#34d399",2);
   if(tr.length){ c.strokeStyle="#93c5fd"; c.setLineDash([4,3]); c.beginPath(); c.moveTo(X(es.km),Y(es.soc)); for(const t of tr) if(t[0]>es.km&&t[0]<=k1) c.lineTo(X(t[0]),Y(t[2])); c.stroke(); c.setLineDash([]); }
   c.fillStyle="#e5e7eb"; c.beginPath(); c.arc(X(es.km),Y(es.soc),3,0,7); c.fill();
   title=`電池 (実線: これまで / 点線: 時速 ${(Orders.cur&&Orders.cur.v)||AutoDrive.vSet||70} km で走り続けた見込み)`; }
  if(mode==="spd"){ line(4,"#6b7280",1.5); line(3,"#f5b81c",1.5,[4,3]); line(2,"#34d399",2); title="速度 km/h (緑: 実際 / 黄点線: 指示 / 灰: 制限速度)"; }
  if(mode==="pow"){ c.strokeStyle="#444"; c.beginPath(); c.moveTo(38,Y(0)); c.lineTo(W-10,Y(0)); c.stroke(); line(5,"#facc15",1.5); line(6,"#f87171",1.5); line(7,"#34d399",2); title="電力 W (黄: 発電 / 赤: モーター / 緑: 収支)"; }
  c.fillStyle="#9ca3af"; c.fillText(title,42,12); },
};
