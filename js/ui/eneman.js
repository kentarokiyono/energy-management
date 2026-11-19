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
 KEY:"bwsc_role", role:"driver", active:false, fc:null, job:null, fcT:0, hist:[],
 load(){ try{ const r=localStorage.getItem(this.KEY); if(r==="eneman"||r==="driver") this.role=r; }catch(e){} },
 setRole(r){ this.role=r==="eneman"?"eneman":"driver"; try{ localStorage.setItem(this.KEY,this.role); }catch(e){} this.ui(); },
 ui(){ document.querySelectorAll("#seg-role button").forEach(b=>b.classList.toggle("on",b.dataset.role===this.role));
  const d=document.getElementById("role-desc"); if(d) d.textContent= this.role==="eneman"? "車は自動運転。速度指示・17:00 の停車地点・パネル角度・充電停車・ドライバー交代を決める。電池のグラフを見ながら" : "自分で運転する。速度は戦略班 (自動) が無線で指示"; },
 want(){ return this.role==="eneman"&&P.mode==="race"&&!P.event&&!(typeof Lesson!=="undefined"&&Lesson.active); },
 /* startGame の最後 (課題・イベントでないとき) */
 begin(){
  if(!this.want()) return; this.active=true; this._crew=P.crewProc; P.crewProc=false; this._ord=P.orders; P.orders=true;
  Orders.mode="manual"; Orders.cur=null; AutoDrive.enable(true); this.hist=[]; this.fc=null; this.job=null; this.fcT=0;
  this.panel(true);
  Radio.push("エネマネ班の役割: 車は自動運転。速度指示を送ってください (左の欄)。指示がない間は時速 70 km で走ります。","チーフ");
  AutoDrive.vSet=70;
 },
 end(){ if(!this.active) return; this.active=false; AutoDrive.enable(false); AutoDrive.vSet=null; if(this._crew!==undefined) P.crewProc=this._crew; if(this._ord!==undefined) P.orders=this._ord; Orders.mode="auto"; this.panel(false); },
 /* 指示を送る */
 send(v){ const es=Engine.st; v=clamp(Math.round(+v||0),20,130); if(!es) return;
  const I=Orders.current(es,v,es.km,Math.min(10,TOTAL_KM-es.km));
  Orders.manual(v,I); AutoDrive.vSet=v; this.fcT=0; this.draw(); },   // 指示の区間 (10 km) が終わっても同じ速さで走り続ける
 setStop(km){ const es=Engine.st; km=+km; if(!(km>es.km)){ AutoDrive.stopAt=null; toast("17:00 の停車地点を取り消しました"); }
  else { AutoDrive.stopAt=km; Radio.push(`今日は ${km.toFixed(1)} km 地点で止めます。`,"戦略班",{speak:true}); } this.draw(); },
 charge(){ const es=Engine.st; if(!es) return; if(AutoDrive.chargeReq||AutoDrive.charging){ AutoDrive.resume(); Radio.push("充電停車を終えて出発します。","戦略班"); }
  else { AutoDrive.chargeReq=true; Radio.push("充電のため路肩に止めてください。","戦略班",{speak:true}); } this.draw(); },
 swap(){ const es=Engine.st; if(!es) return;
  const stopped= es.v<0.3&&(es.stopTimer>0||es.camp||AutoDrive.charging);
  if(!stopped){ toast("ドライバー交代は止まっている間 (CS・充電停車・キャンプ) だけ","#f59e0b"); return; }
  if(Crew.drivers&&Crew.drivers.length>1) Crew.setDriver((Crew.driverIdx+1)%Crew.drivers.length); else Crew.driverIdx=(Crew.driverIdx+1)%2;
  const n=Crew.drivers&&Crew.drivers[Crew.driverIdx]? Crew.drivers[Crew.driverIdx].name : `ドライバー ${Crew.driverIdx+1}`;
  Radio.push(`ドライバー交代: ${n}`,"チーフ"); toast(`ドライバー交代 → ${n}`,"#34d399"); },
 /* ---------- 画面 ---------- */
 panel(on){ let el=document.getElementById("em-panel");
  if(!on){ if(el) el.style.display="none"; const g=document.getElementById("em-graph"); if(g) g.style.display="none"; return; }
  if(!el){ el=document.createElement("div"); el.id="em-panel"; el.className="pn";
   el.style.cssText="left:16px;top:298px;width:330px;padding:8px 10px;font-size:12px;z-index:20;pointer-events:auto";
   el.innerHTML=`<style>#em-panel .btn{padding:2px 8px;font-size:12px;height:auto;min-width:0;line-height:1.6} #em-panel input{font-size:12px}</style><div style="font-weight:700;margin-bottom:6px">エネマネ班 <span id="em-cur" style="font-weight:400;opacity:.7"></span></div>
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px"><span style="white-space:nowrap">時速</span> <button class="btn" data-d="-5">−5</button><input id="em-v" type="number" min="20" max="130" value="70" style="width:56px;background:#111;color:#eee;border:1px solid #444;padding:2px 4px"> km <button class="btn" data-d="5">+5</button><button class="btn pri" id="em-send">送る</button></div>
    <div id="em-hint" style="opacity:.7;margin-bottom:6px"></div>
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px"><span style="white-space:nowrap">17:00 停車</span> <input id="em-stop" type="number" step="1" style="width:70px;background:#111;color:#eee;border:1px solid #444;padding:2px 4px"> km <button class="btn" id="em-stop-set">決める</button></div>
    <div id="em-stop-hint" style="opacity:.7;margin-bottom:6px"></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" id="em-charge">充電停車</button><button class="btn" id="em-swap">ドライバー交代</button></div>`;
   document.getElementById("game-container").appendChild(el);
   const vi=el.querySelector("#em-v");
   el.querySelectorAll("[data-d]").forEach(b=>b.onclick=()=>{ vi.value=clamp((+vi.value||70)+(+b.dataset.d),20,130); });
   el.querySelector("#em-send").onclick=()=>this.send(vi.value);
   vi.addEventListener("keydown",e=>{ e.stopPropagation(); if(e.key==="Enter") this.send(vi.value); });
   const si=el.querySelector("#em-stop"); si.addEventListener("keydown",e=>{ e.stopPropagation(); if(e.key==="Enter") this.setStop(si.value); });
   el.querySelector("#em-stop-set").onclick=()=>this.setStop(si.value);
   el.querySelector("#em-charge").onclick=()=>this.charge(); el.querySelector("#em-swap").onclick=()=>this.swap();
   const g=document.createElement("canvas"); g.id="em-graph"; g.className="pn"; g.style.cssText="left:50%;transform:translateX(-50%);top:104px;width:min(520px,46vw);height:120px;z-index:20";
   document.getElementById("game-container").appendChild(g); }
  el.style.display=""; document.getElementById("em-graph").style.display=""; },
 /* 毎フレーム (main.js): 記録・見込みの計算・表示 */
 frame(dtR){ if(!this.active) return; const es=Engine.st; if(!es) return;
  const last=this.hist[this.hist.length-1]; if(!last||Math.abs(es.km-last[0])>=0.5) this.hist.push([es.km,es.soc]);
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
  this.graph(); },
 graph(){ const cv=document.getElementById("em-graph"); if(!cv) return; const r=cv.getBoundingClientRect(), dpr=Math.min(2,devicePixelRatio||1);
  if(cv.width!==Math.round(r.width*dpr)){ cv.width=Math.round(r.width*dpr); cv.height=Math.round(r.height*dpr); }
  const c=cv.getContext("2d"), W=r.width, H=r.height, es=Engine.st; c.setTransform(dpr,0,0,dpr,0,0); c.clearRect(0,0,W,H);
  const k0=Math.max(0,(this.hist[0]||[es.km])[0]), tr=this.fc&&this.fc.trace||[], k1=Math.min(TOTAL_KM,Math.max(es.km+300,tr.length? tr[tr.length-1][0] : es.km+300));
  const X=k=>34+(k-k0)/(k1-k0||1)*(W-44), Y=s=>8+(1-s)*(H-24);
  c.strokeStyle="#333"; c.fillStyle="#999"; c.font="10px sans-serif"; c.lineWidth=1;
  for(const s of [0,0.5,1]){ c.beginPath(); c.moveTo(34,Y(s)); c.lineTo(W-10,Y(s)); c.stroke(); c.fillText(`${s*100}%`,4,Y(s)+3); }
  c.fillStyle="#f5b81c"; for(const q of RP_CS){ if(q.km<k0||q.km>k1) continue; c.fillRect(X(q.km)-0.5,Y(1),1,H-24); c.fillText(`CS${q.n}`,X(q.km)+2,H-4); }
  c.strokeStyle="#34d399"; c.lineWidth=2; c.beginPath(); this.hist.forEach((h,i)=>i? c.lineTo(X(h[0]),Y(h[1])) : c.moveTo(X(h[0]),Y(h[1]))); c.stroke();
  if(tr.length){ c.strokeStyle="#93c5fd"; c.setLineDash([4,3]); c.beginPath(); c.moveTo(X(es.km),Y(es.soc)); for(const t of tr) if(t[0]>es.km&&t[0]<=k1) c.lineTo(X(t[0]),Y(t[2])); c.stroke(); c.setLineDash([]); }
  c.fillStyle="#e5e7eb"; c.beginPath(); c.arc(X(es.km),Y(es.soc),3,0,7); c.fill();
  c.fillStyle="#9ca3af"; c.fillText(`電池 (実線: これまで / 点線: 時速 ${(Orders.cur&&Orders.cur.v)||AutoDrive.vSet||70} km で走り続けた見込み)`,40,12); },
};
