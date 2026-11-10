"use strict";
/* ============ メニューの入口: 練習する / 戦略を考える / 振り返る / チームで見る / イベント ============
 ・練習する: 本戦・予選と車検・練習シナリオから選んで START。時間加速・天気などは「詳しい設定」(畳んである)
 ・戦略を考える = 傾向、振り返る = 分析画面、チームで見る = テレメトリ (押すとすぐ開く)
 ・前回の入口・練習の種類はこの端末に覚えておく */
const Entry={
 KEY:"bwsc_entry", ent:"practice", sub:"race",
 GO:{practice:"START",event:"START",strategy:"戦略を考える",review:"振り返る",team:"チームで見る"},
 init(){ let o=null; try{ o=JSON.parse(localStorage.getItem(this.KEY)||"null"); }catch(e){}
  if(o&&this.GO[o.ent]) this.ent=o.ent; if(o&&["race","test","scn"].includes(o.sub)) this.sub=o.sub;
  const sel=document.getElementById("scenario"), box=document.getElementById("ent-scn");
  if(sel&&box){ box.innerHTML=""; for(const op of sel.options){ if(!op.value) continue; const b=document.createElement("button"); b.type="button"; b.textContent=op.textContent; b.dataset.v=op.value;
   b.onclick=()=>{ this.sub="scn"; sel.value=op.value; sel.dispatchEvent(new Event("change")); this.scnBtns(); this.save(); }; box.appendChild(b); }
   if(o&&o.scn&&[...sel.options].some(x=>x.value===o.scn)) this.lastScn=o.scn; }
  document.querySelectorAll(".menu .ent").forEach(el=>el.addEventListener("click",()=>this.pick(el.dataset.ent,true)));
  document.getElementById("ent-sub").addEventListener("click",ev=>{ const b=ev.target.closest("button"); if(b) this.setSub(b.dataset.sub); });
  const ms=document.getElementById("more-set"); if(ms){ ms.addEventListener("toggle",()=>this.summary()); }
  document.querySelector(".menu .r").addEventListener("click",()=>setTimeout(()=>this.summary(),0));
  addEventListener("keydown",e=>{ if(e.key==="Escape"&&document.querySelector(".menu").dataset.drw){ this.drawer(null); } });
  this.pick(this.ent,false); this.summary(); },
 save(){ try{ localStorage.setItem(this.KEY,JSON.stringify({ent:this.ent,sub:this.sub,scn:(document.getElementById("scenario")||{}).value||this.lastScn||""})); }catch(e){} },
 /* 入口を選ぶ。act: 押したとき (戦略・振り返る・チームで見るはそのまま開く) */
 pick(e,act){ if(!this.GO[e]) e="practice"; this.ent=e;
  document.querySelectorAll(".menu .ent").forEach(el=>el.classList.toggle("active",el.dataset.ent===e));
  if(e==="practice") this.setSub(this.sub,true); else if(e==="event"){ selectMode("event"); this.scn(""); }
  document.getElementById("ent-go-t").textContent=this.GO[e];
  document.querySelector(".menu").dataset.ent=e; this.save();
  if(act&&(e==="strategy"||e==="review"||e==="team")) this.go(); },
 /* 練習の種類 */
 setSub(k,quiet){ if(!["race","test","scn"].includes(k)) k="race"; this.sub=k; if(this.ent!=="practice"&&!quiet){ this.ent="practice"; return this.pick("practice"); }
  document.querySelectorAll("#ent-sub button").forEach(b=>b.classList.toggle("on",b.dataset.sub===k));
  document.querySelectorAll(".ent-sub").forEach(d=>d.style.display=d.dataset.for===k?"":"none");
  if(k==="test"){ selectMode("test"); this.scn(""); }
  else { selectMode("race"); this.scn(k==="scn"? (this.cur()||this.lastScn||"squall") : ""); }
  this.save(); this.summary(); },
 cur(){ return (document.getElementById("scenario")||{}).value||""; },
 scn(v){ const sel=document.getElementById("scenario"); if(!sel) return; if(sel.value) this.lastScn=sel.value; sel.value=v; sel.dispatchEvent(new Event("change")); this.scnBtns(); },
 scnBtns(){ const v=this.cur(); document.querySelectorAll("#ent-scn button").forEach(b=>b.classList.toggle("on",b.dataset.v===v));
  const lv=document.getElementById("scn-lv-box"); if(lv) lv.style.display= v==="storm"? "" : "none"; },
 go(){ const e=this.ent;
  if(e==="strategy") return Fade.go(()=>Ana.open("trend"));
  if(e==="review") return Fade.go(()=>Ana.open("race"));
  if(e==="team") return Tele.panel();
  DrvDlg.open(); },
 /* PC: 画面の下からせり上がるパネル (詳しい設定 / キー操作)。null で閉じる */
 drawer(k){ const m=document.querySelector(".menu"), on=k&&m.dataset.drw!==k;
  if(on){ m.dataset.drw=k; const ms=document.getElementById("more-set"); if(ms) ms.open=true; document.getElementById("drw-ttl").textContent= k==="keys"? "キー操作" : "詳しい設定";
   const r=document.querySelector(".menu .r"); r.scrollTop=0; }
  else delete m.dataset.drw;
  document.querySelectorAll("#menu-bar [data-d]").forEach(b=>b.classList.toggle("on",!!on&&b.dataset.d===k)); document.getElementById("menu-shade").classList.toggle("on",!!on); },
 /* 「詳しい設定」の見出しに、今の主な設定を短く */
 summary(){ const el=document.getElementById("more-sum"); if(!el) return; const v=(id)=>{ const s=document.getElementById(id); return s&&s.selectedOptions[0]? s.selectedOptions[0].textContent : ""; };
  const a=[]; if(P.mode==="race"){ a.push(v("time-scale")); const ch=+(document.getElementById("chapter")||{}).value||0; if(ch&&!this.cur()) a.push("CS"+ch+" から"); }
  a.push(P.realWeather!==false?"2025 年の天気":"気候値の天気"); a.push("予報: "+v("fc-err").replace(/^予報 /,"")); a.push("画質: "+v("gfx").replace(/^画質 /,""));
  el.textContent=a.filter(Boolean).join(" ・ "); const bs=document.getElementById("bar-sum"); if(bs) bs.textContent=el.textContent; },
};
