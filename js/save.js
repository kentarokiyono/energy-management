"use strict";
/* ============ レースの途中保存と再開 ============
 一時停止メニューの「保存してメニューへ」で、レースの状態 (Engine.st: 位置・時刻・電池・他チーム・天気と予報・CS の通過など)、
 走行ログ、乗降手順とドライバー、無線の速度指示の成績を、この端末のブラウザ (IndexedDB) に 1 件保存する。
 メニューの「続きから」で、その時点から再開する。レースモードのみ (イベント・練習シナリオ・予選は対象外) */
const Save={
 KEY:"slot1", pending:null,
 db(){ if(this.p) return this.p; this.p=new Promise(res=>{ try{ const q=indexedDB.open("bwsc-save",1); q.onupgradeneeded=()=>q.result.createObjectStore("save",{keyPath:"id"}); q.onsuccess=()=>res(q.result); q.onerror=()=>res(null); }catch(e){ res(null); } }); return this.p; },
 async tx(mode,fn){ const db=await this.db(); if(!db) return null; return new Promise(res=>{ try{ const t=db.transaction("save",mode), q=fn(t.objectStore("save")); t.oncomplete=()=>res(q&&q.result!==undefined?q.result:true); t.onerror=t.onabort=()=>res(null); }catch(e){ res(null); } }); },
 can(){ return running&&P.mode==="race"&&!P.event&&Engine.st&&!Engine.st.scenario&&!Engine.st.finished&&!Engine.st.crashed&&!Engine.st.fire&&!Test.active; },
 async save(){
  if(!this.can()){ toast("保存できるのはレースの途中だけです (練習シナリオ・ゴール後は不可)","#f59e0b"); return false; }
  const es=Engine.st, rec={id:this.KEY,ver:1,ts:Date.now(),
   info:{day:es.day,hour:es.hour,km:es.km,soc:es.soc,drivers:typeof Crew!=="undefined"?Crew.drivers.map(d=>d.name):[]},
   tsScale:P.timeScale, tsSel:document.getElementById("time-scale").value,
   st:es,   // IndexedDB はそのまま保存できる (Set も含む)
   crew: typeof Crew!=="undefined"? {st:Crew.st,drivers:Crew.drivers,driverIdx:Crew.driverIdx} : null,
   runlog:{rows:RunLog.rows,sid:RunLog.sid,stepKm:RunLog.stepKm,lastKm:RunLog.lastKm,lastAbsH:RunLog.lastAbsH,on:RunLog.on},
   orders:{hist:Orders.hist,nextKm:Orders.cur?Orders.cur.k0:Orders.nextKm}};
  let ok=null; try{ ok=await this.tx("readwrite",s=>s.put(rec)); }catch(e){ ok=null; }
  if(!ok){ toast("保存できませんでした (ブラウザの設定を確認)","#ef4444"); return false; }
  toast(`保存しました (Day${es.day} ${saveH(es.hour)}・${es.km.toFixed(0)} km)`,"#34d399"); this.menu(); return true;
 },
 async saveAndQuit(){ if(await this.save()){ paused=false; show("pause-overlay",false); Fade.go(quitToMenu); } },
 load(){ return this.tx("readonly",s=>s.get(this.KEY)); },
 async remove(){ if(!confirm("保存したレースを削除します。")) return; await this.tx("readwrite",s=>s.delete(this.KEY)); this.menu(); },
 /* メニュー: 保存があれば「続きから」を出す */
 async menu(){ const b=document.getElementById("resume-box"); if(!b) return; const r=await this.load();
  if(!r||!r.info){ b.style.display="none"; return; }
  const i=r.info; b.style.display="";
  document.getElementById("resume-info").textContent=`Day${i.day} ${saveH(i.hour)} ・ ${i.km.toFixed(0)} km ・ 電池 ${(i.soc*100).toFixed(0)} %${i.drivers&&i.drivers.length?" ・ "+i.drivers.join(" / "):""}`; },
 async resume(){
  const r=await this.load(); if(!r){ toast("保存がありません","#f59e0b"); this.menu(); return; }
  if(typeof selectMode==="function") selectMode("race"); P.event=false;
  const ts=document.getElementById("time-scale"); if(r.tsSel&&[...ts.options].some(o=>o.value===r.tsSel)){ ts.value=r.tsSel; ts.dispatchEvent(new Event("change")); }
  const sc=document.getElementById("scenario"); if(sc) sc.value="";
  if(r.info.drivers&&r.info.drivers.length===2) DRIVER_NAMES=r.info.drivers.slice();
  this.pending=r; Fade.go(startGame);
 },
 /* startGame の中 (Engine.init と Route.build の後): レースの状態を戻す */
 applyEngine(){ const r=this.pending; if(!r) return false; Object.assign(Engine.st,r.st); return true; },
 /* startGame の中 (走行ログ・乗降手順の初期化の後): 残りを戻す */
 applyRest(){
  const r=this.pending; if(!r) return; this.pending=null;
  if(r.runlog){ Object.assign(RunLog,{rows:r.runlog.rows||[],sid:r.runlog.sid,stepKm:r.runlog.stepKm||RunLog.stepKm,lastKm:r.runlog.lastKm,lastAbsH:r.runlog.lastAbsH,on:r.runlog.on!==false}); }
  if(r.crew&&typeof Crew!=="undefined"){ if(r.crew.st) Crew.st=r.crew.st; if(r.crew.drivers) Crew.drivers=r.crew.drivers; Crew.driverIdx=r.crew.driverIdx||0; }
  if(r.orders){ Orders.hist=r.orders.hist||[]; Orders.nextKm=r.orders.nextKm||Engine.st.km; }
  const es=Engine.st; Radio.push(`保存した時点から再開: Day${es.day} ${saveH(es.hour)}・${es.km.toFixed(0)} km・電池 ${(es.soc*100).toFixed(0)} %`,"チーフ");
 },
};
function saveH(h){ return `${String(Math.floor(h)).padStart(2,"0")}:${String(Math.floor(h%1*60)).padStart(2,"0")}`; }
