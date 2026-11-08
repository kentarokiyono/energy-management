"use strict";
/* ============ 画面の切り替え: ロゴとチーム名を出してフェード ============
 Fade.go(fn): 暗転 → (ロゴを表示したまま) fn を実行 → 少し待って明転。
 走行の準備 (3D の構築) のような重い処理も、ロゴを出した状態で行う */
const Fade={
 busy:false, IN:380, OUT:560, HOLD:1150,   // ロゴが見えている時間 ≒ IN + HOLD ≒ 1.5 秒
 el(){
  let e=document.getElementById("fade");
  if(!e){ e=document.createElement("div"); e.id="fade";
   e.innerHTML=`<div class="fade-in"><img src="assets/img/logo-full.png" alt="Wakayama Univ. SOLAR CAR TEAM" class="fade-logo"><div class="fade-name">BWSC 3D RACING SIMULATOR</div><div class="fade-bar"><i></i></div></div>`;   // 正式なロゴ (元の色のまま。背景は少し明るい紺のグラデーション)
   document.body.appendChild(e); }
  return e; },
 reduced(){ return typeof matchMedia==="function"&&matchMedia("(prefers-reduced-motion: reduce)").matches; },
 wait(ms){ return new Promise(r=>setTimeout(r,ms)); },
 frame(){ return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); },
 /* ページを開いたとき: ロゴから明転 */
 async intro(){ const e=this.el(); e.style.transition="none"; e.style.display="flex"; e.classList.add("on"); void e.offsetWidth; e.style.transition="";
  this.busy=true; await this.wait(this.reduced()?300:1500); e.classList.remove("on"); e.classList.add("out"); await this.wait(this.OUT); e.style.display="none"; e.classList.remove("out"); this.busy=false; },
 async go(fn){
  if(this.busy){ if(this.pending) return; this.pending=true; while(this.busy) await this.wait(40); this.pending=false; }   // 開いた直後の明転中などは終わってから
  this.busy=true;
  const e=this.el(), k=this.reduced()?0.3:1, t0=performance.now();
  e.classList.remove("out","on"); e.style.display="flex"; void e.offsetWidth; e.classList.add("on");
  await this.wait(this.IN*k); await this.frame();           // 暗転しきってロゴが描かれてから
  try{ fn&&fn(); }catch(err){ console.error(err); }
  await this.frame();
  const left=this.HOLD*k-(performance.now()-t0-this.IN*k); if(left>0) await this.wait(left);
  e.classList.remove("on"); e.classList.add("out");
  await this.wait(this.OUT*k); e.style.display="none"; e.classList.remove("out"); this.busy=false;
 },
};
