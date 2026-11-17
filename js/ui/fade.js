"use strict";
/* ============ 画面の切り替え: ロゴとチーム名を出してフェード ============
 Fade.go(fn): 暗転 → (ロゴを表示したまま) fn を実行 → 少し待って明転。
 走行の準備 (3D の構築) のような重い処理も、ロゴを出した状態で行う */
const Fade={
 busy:false, IN:380, OUT:560, HOLD:1150,   // ロゴが見えている時間 ≒ IN + HOLD ≒ 1.5 秒
 el(){
  let e=document.getElementById("fade");
  if(!e){ e=document.createElement("div"); e.id="fade";
   e.innerHTML=`<div class="fade-in"><img src="assets/img/logo.svg" alt="" width="200"><div class="fade-name">Wakayama Univ. <b>SOLAR CAR TEAM</b></div><canvas class="fade-road"></canvas></div>`;
   document.body.appendChild(e); }
  return e; },
 /* 道の中央線が手前へ流れる (表示中だけ描く) */
 road(){ const e=this.el(), c=e.querySelector(".fade-road"); if(!c||this.raf) return;
  const dpr=Math.min(2,window.devicePixelRatio||1), W=260, H=90; c.width=W*dpr; c.height=H*dpr; const x=c.getContext("2d"); x.scale(dpr,dpr);
  const t0=performance.now(), still=this.reduced(), F=200, Hc=1.2, HY=4, L=3, G=4, ROAD=1.8, ZF=60;   // 焦点距離 [px]・目の高さ 1.2 m・中央線 3 m + すき間 4 m・道幅の半分
  const ZN=F*Hc/(H-HY), yOf=(z)=>HY+F*Hc/z, xOf=(z,X)=>W/2+F*X/z;
  const draw=(now)=>{ if(e.style.display==="none"){ this.raf=0; return; }
   x.clearRect(0,0,W,H); const off=still? 0 : ((now-t0)/1000*24)%(L+G);   // 24 m/s で手前へ
   x.lineWidth=1; for(const sg of [-1,1]){ const g=x.createLinearGradient(0,yOf(ZF),0,H); g.addColorStop(0,"rgba(255,255,255,0)"); g.addColorStop(1,"rgba(255,255,255,.28)"); x.strokeStyle=g;
    x.beginPath(); x.moveTo(xOf(ZF,sg*ROAD),yOf(ZF)); x.lineTo(xOf(ZN,sg*ROAD),yOf(ZN)); x.stroke(); }
   x.fillStyle="#f2f4f7";
   for(let z=ZN-L-off; z<ZF; z+=L+G){ const za=Math.max(ZN,z), zb=Math.min(ZF,z+L); if(zb<=za) continue; const w=0.05;
    x.globalAlpha=Math.min(1,(ZF-za)/30); x.beginPath(); x.moveTo(xOf(zb,-w),yOf(zb)); x.lineTo(xOf(zb,w),yOf(zb)); x.lineTo(xOf(za,w),yOf(za)); x.lineTo(xOf(za,-w),yOf(za)); x.fill(); }
   x.globalAlpha=1; this.raf=still? 0 : requestAnimationFrame(draw); };
  this.raf=requestAnimationFrame(draw); },
 reduced(){ return typeof matchMedia==="function"&&matchMedia("(prefers-reduced-motion: reduce)").matches; },
 wait(ms){ return new Promise(r=>setTimeout(r,ms)); },
 frame(){ return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); },
 /* ページを開いたとき: ロゴから明転 */
 async intro(){ const e=this.el(); e.style.transition="none"; e.style.display="flex"; e.classList.add("on"); void e.offsetWidth; e.style.transition=""; this.road();
  this.busy=true; await this.wait(this.reduced()?300:1500); e.classList.remove("on"); e.classList.add("out"); await this.wait(this.OUT); e.style.display="none"; e.classList.remove("out"); this.busy=false; },
 async go(fn){
  if(this.busy){ if(this.pending) return; this.pending=true; while(this.busy) await this.wait(40); this.pending=false; }   // 開いた直後の明転中などは終わってから
  this.busy=true;
  const e=this.el(), k=this.reduced()?0.3:1, t0=performance.now();
  e.classList.remove("out","on"); e.style.display="flex"; void e.offsetWidth; e.classList.add("on"); this.road();
  await this.wait(this.IN*k); await this.frame();           // 暗転しきってロゴが描かれてから
  try{ fn&&fn(); }catch(err){ console.error(err); }
  await this.frame();
  const left=this.HOLD*k-(performance.now()-t0-this.IN*k); if(left>0) await this.wait(left);
  e.classList.remove("on"); e.classList.add("out");
  await this.wait(this.OUT*k); e.style.display="none"; e.classList.remove("out"); this.busy=false;
 },
};
