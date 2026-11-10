"use strict";
/* ============ 待機画面: 白い画面の中央でロゴが横にくるくる回るだけ ============
 ・メニューの「待機画面」か、URL に ?standby を付けて開く。画面に触れる・キーを押すとメニューへ戻る
 ・ロゴ: 端末に保存した画像 → assets/img/official-logo.png (リポジトリに入れない) → 羽のロゴとチーム名 の順に使う
 ・表示中は画面を消さない (対応している端末のみ) */
const Standby={
 KEY:"bwsc_standby_logo", FILE:"assets/img/official-logo.png", el:null, lock:null, t0:0,
 saved(){ try{ return localStorage.getItem(this.KEY)||""; }catch(e){ return ""; } },
 /* ロゴの面 (表と裏の 2 枚。裏も読める向きにする) */
 face(src){ return src? `<img src="${src}" alt="" draggable="false">` : `<img src="assets/img/logo.svg" alt="" draggable="false" class="sb-wing"><div class="sb-name">Wakayama Univ. <b>SOLAR CAR TEAM</b></div>`; },
 setLogo(src){ const s=this.el&&this.el.querySelector(".sb-spin"); if(!s) return; s.innerHTML=`<div class="sb-face">${this.face(src)}</div><div class="sb-face sb-back">${this.face(src)}</div>`; },
 pickLogo(){ const s=this.saved(); if(s) return Promise.resolve(s);
  return new Promise(res=>{ const im=new Image(); im.onload=()=>res(this.FILE); im.onerror=()=>res(""); im.src=this.FILE; }); },
 choose(){ const f=document.createElement("input"); f.type="file"; f.accept="image/*";
  f.onchange=()=>{ const file=f.files&&f.files[0]; if(!file) return; const r=new FileReader();
   r.onload=()=>{ const u=String(r.result); try{ localStorage.setItem(this.KEY,u); }catch(e){ alert("画像が大きすぎて保存できません (この表示の間だけ使います)"); } this.setLogo(u); this.tools(); };
   r.readAsDataURL(file); };
  f.click(); },
 clear(){ try{ localStorage.removeItem(this.KEY); }catch(e){} this.pickLogo().then(u=>{ this.setLogo(u); this.tools(); }); },
 tools(){ const t=this.el&&this.el.querySelector(".sb-tools"); if(!t) return; const has=!!this.saved();
  t.innerHTML=`<button type="button" data-a="choose">ロゴの画像を選ぶ</button>${has?'<button type="button" data-a="clear">元に戻す</button>':""}`; },
 open(){ if(this.el) return;
  const e=document.createElement("div"); e.id="standby"; this.el=e;
  e.innerHTML=`<div class="sb-stage"><div class="sb-spin"></div></div><div class="sb-hint">画面に触れるとメニューへ戻ります</div><div class="sb-tools"></div>`;
  document.body.appendChild(e); this.setLogo(this.saved()); this.tools();
  this.pickLogo().then(u=>{ if(this.el===e) this.setLogo(u); });
  this.t0=performance.now();
  e.addEventListener("pointerdown",this._tap=(ev)=>{ const b=ev.target.closest("button"); if(b){ ev.stopPropagation(); return; } if(performance.now()-this.t0>400) this.close(); });
  e.addEventListener("click",(ev)=>{ const b=ev.target.closest("button"); if(!b) return; ev.stopPropagation(); if(b.dataset.a==="choose") this.choose(); else if(b.dataset.a==="clear") this.clear(); });
  addEventListener("keydown",this._key=(ev)=>{ if(performance.now()-this.t0>400){ ev.preventDefault(); ev.stopPropagation(); this.close(); } },true);
  document.addEventListener("visibilitychange",this._vis=()=>{ if(document.visibilityState==="visible") this.wake(); });
  this.wake();
  try{ if(document.documentElement.requestFullscreen&&!document.fullscreenElement) document.documentElement.requestFullscreen().catch(()=>{}); }catch(x){} },
 close(){ const e=this.el; if(!e) return; this.el=null;
  removeEventListener("keydown",this._key,true); document.removeEventListener("visibilitychange",this._vis);
  if(this.lock){ this.lock.release().catch(()=>{}); this.lock=null; }
  try{ if(document.fullscreenElement&&document.exitFullscreen) document.exitFullscreen().catch(()=>{}); }catch(x){}
  e.remove();
  if(/[?&]standby\b/.test(location.search)) try{ history.replaceState(null,"",location.pathname+location.search.replace(/[?&]standby(=[^&]*)?/,"").replace(/^&/,"?")+location.hash); }catch(x){} },
 async wake(){ try{ if(navigator.wakeLock&&!this.lock){ this.lock=await navigator.wakeLock.request("screen"); this.lock.addEventListener("release",()=>{ this.lock=null; }); } }catch(e){} },
 wanted(){ return new URLSearchParams(location.search).has("standby"); },
};
