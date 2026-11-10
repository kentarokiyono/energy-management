"use strict";
/* ============ 車両・チームの設定: ゲーム・戦略・速度指示・傾向・分析が同じ値を使うよう 1 か所にまとめる ============
 タブ: 車両 / 実車との比 / 合わせ込み / 運用 / ドライバー。値は Settings (この端末) に保存。実車の値は非公開ファイルだけ
 ・P.realK {solar, load, src, date, ts}: 実車のログと速い計算の比 (傾向の「発電の効率」「走行の消費」の範囲の中心)
 ・P.csTilt: CS (30 分の停車) で傾けて充電できるか。ゲーム本戦・戦略・傾向が共通で使う
 ・P.drivers: ドライバーの名前 (1 人目・2 人目) */
const Team={
 tab:"veh", TABS:[["veh","車両","car"],["real","実車との比","activity"],["cal","合わせ込み","sliders"],["ops","運用","sun"],["drv","ドライバー","users"]],
 el(){ let e=document.getElementById("team");
  if(!e){ e=document.createElement("div"); e.id="team"; e.className="fixed inset-0 z-50 hidden items-center justify-center";
   e.innerHTML=`<div class="card2 team-card"><div class="hd"><span class="lb">Vehicle &amp; Team</span><button class="btn ana-sm" onclick="Team.close()">${this.ic("x")}閉じる</button></div>
    <h2>車両・チームの設定</h2><div class="seg team-tabs">${this.TABS.map(([k,l,i])=>`<button type="button" data-t="${k}">${this.ic(i)}${l}</button>`).join("")}</div>
    <div class="team-body"><div class="team-pane" data-p="veh"><div class="team-src" id="team-veh-src"></div><div id="team-veh"></div></div><div class="team-pane" data-p="real"></div><div class="team-pane" data-p="cal"></div><div class="team-pane" data-p="ops"></div><div class="team-pane" data-p="drv"></div></div></div>`;
   document.body.appendChild(e);
   e.querySelector(".team-tabs").addEventListener("click",ev=>{ const b=ev.target.closest("button"); if(b) this.show(b.dataset.t); });
   e.addEventListener("click",ev=>{ if(ev.target===e) this.close(); });
   const box=e.querySelector("#team-veh"); for(const id of ["sec-body","sec-veh"]){ const s=document.getElementById(id); if(s) box.appendChild(s); } }   // メニューにあった車両の欄をここへ移す
  return e; },
 ic(n){ return typeof ic==="function"? ic(n) : ""; },
 open(t){ const e=this.el(); show("team",true); this.show(t||this.tab); },
 close(){ show("team",false); },
 show(t){ this.tab=t; const e=this.el(); e.querySelectorAll(".team-tabs button").forEach(b=>b.classList.toggle("on",b.dataset.t===t)); e.querySelectorAll(".team-pane").forEach(p=>p.style.display=p.dataset.p===t?"":"none"); this.render(t); },
 render(t){ const p=this.el().querySelector(`.team-pane[data-p="${t}"]`); if(!p) return;
  if(t==="veh"){ document.getElementById("team-veh-src").innerHTML=`値の出どころ: ${typeof VEH!=="undefined"&&VEH.active? "<b>実車の値</b> (この端末の非公開ファイル)" : "公開用の仮の値"}${Settings.changed()? ` ・ 既定値から ${Settings.changed()} 項目を変更` : ""}`; return; }
  p.innerHTML=this[t]? this[t]() : ""; },
 when(ts){ if(!ts) return "―"; const d=new Date(ts); return `${d.getMonth()+1}/${d.getDate()}`; },
 row(l,v,src,act){ return `<div class="team-row"><span class="lb">${l}</span><span class="num">${v}</span><span class="dim">${src||""}</span>${act||""}</div>`; },
 /* ---- 実車との比 ---- */
 real(){ const r=this.realK(), x=(k)=>k!=null&&Number.isFinite(k)? "×"+k.toFixed(3) : "なし";
  const src=r? `${escHtml(r.src||"走行ログ")}${r.date?` (${escHtml(r.date)})`:""} から、${this.when(r.ts)}` : "";
  const lk=Number.isFinite(P.lossK)&&Math.abs(P.lossK-1)>0.001, ok=Number.isFinite(P.ordersK)&&Math.abs(P.ordersK-1)>0.001;
  return `<div class="team-sec">傾向 (完走率の計算) が使う比</div>
   ${this.row("発電",r?x(r.solar):"なし",src)}${this.row("消費",r?x(r.load):"なし",src)}
   <div class="team-act">${r?`<button class="btn ana-sm" onclick="Team.setReal(null)">${this.ic("x")}比を外す</button>`:""}<button class="btn ana-sm" onclick="Team.go('race')">${this.ic("upload")}走行ログを読み込む (振り返る)</button></div>
   <div class="dim team-note">走行ログ (計測器の CSV・Excel) を読み込むと、その日の天気での計算と比べた比を入れるか聞きます。傾向では、この比を中心に ± 3 % の範囲を調べます。</div>
   <div class="team-sec">ゲームの車の補正 (分析画面の合わせ込み)</div>
   ${this.row("走行の消費のモデル",lk?"×"+P.lossK.toFixed(3):"なし","",lk?`<button class="btn ana-sm" onclick="P.lossK=1;Team.saved()">外す</button>`:"")}
   ${this.row("電流の指示",ok?"×"+(+P.ordersK).toFixed(3):"なし","",ok?`<button class="btn ana-sm" onclick="P.ordersK=1;Team.saved()">外す</button>`:"")}
   ${this.row("太陽の高さ別の発電",P.pvAltS?"ログから":"既定","",P.pvAltS?`<button class="btn ana-sm" onclick="P.pvAltS='';Team.saved()">外す</button>`:"")}`; },
 realK(){ const r=P.realK; return r&&typeof r==="object"&&(Number.isFinite(r.solar)||Number.isFinite(r.load))? r : null; },
 setReal(r){ P.realK= r? {solar:Number.isFinite(r.solar)?+r.solar.toFixed(4):null,load:Number.isFinite(r.load)?+r.load.toFixed(4):null,src:String(r.src||"").slice(0,80),date:String(r.date||"").slice(0,40),ts:Date.now()} : null;
  if(typeof Trend!=="undefined"&&Trend.syncTeam) Trend.syncTeam(); this.saved(); },
 saved(){ Settings.save(); if(typeof Strategy!=="undefined") Strategy.last=null; if(!document.getElementById("team").classList.contains("hidden")) this.render(this.tab); },
 /* ---- 合わせ込み (傾向の速い計算をゲームのエンジンに) ---- */
 cal(){ let o=null; try{ o=JSON.parse(localStorage.getItem("bwsc_trend_cal")||"null"); }catch(e){}
  const stale= o&&typeof Trend!=="undefined"&&Trend.calSig? o.sig!==Trend.calSig() : null;
  const st= !o? "まだ合わせていません" : stale? `<b class="bad">車両の値が変わったので合わせ直しが必要</b> (${this.when(o.ts)})` : `${this.when(o.ts)} に合わせました${stale==null?"":" (今の車両の値)"}`;
  const k=o&&o.k||{}, f=(x)=>Number.isFinite(x)? "×"+x.toFixed(3) : "―";
  return `${this.row("状態",st)}${o? this.row("発電 (走行中)",f(k.solar))+this.row("発電 (傾けて)",f(k.tilt))+this.row("消費",f(k.load))+this.row("電池の容量",f(k.cap))+(Number.isFinite(k.rms)?this.row("CS ごとの電池のずれ",k.rms.toFixed(1)+" %"):"") : ""}
   <div class="team-act"><button class="btn ana-sm" onclick="Team.go('trend')">${this.ic("play")}戦略を考える (傾向) で合わせ込む</button></div>
   <div class="dim team-note">傾向の速い計算を、ゲームのエンジンの走りに合わせる倍率です。車両の値を変えたら合わせ直してください。</div>`; },
 /* ---- 運用 ---- */
 ops(){ return `<label class="chk team-chk"><input type="checkbox" ${P.csTilt!==false?"checked":""} onchange="P.csTilt=this.checked;Team.saved();if(typeof Trend!=='undefined'&&Trend.left)Trend.left()"><i></i>CS (30 分の停車) で傾けて充電する</label>
   <div class="dim team-note">外すと、ゲーム本戦の CS では平置きのまま充電し、戦略・速度の指示・傾向もそれを前提に計算します (朝・夕方は傾ける)。</div>
   <label class="chk team-chk"><input type="checkbox" ${P.crewProc!==false?"checked":""} onchange="P.crewProc=this.checked;const c=document.getElementById('crew-proc');if(c)c.checked=this.checked;Team.saved()"><i></i>乗降手順を実践 (CS・17 時・朝)</label>
   <div class="team-sec">規則で決まっていること</div>
   ${this.row("朝の充電","6:15〜8:00 (傾けて)")}${this.row("夕方の充電","17:00〜日没 (傾けて)")}${this.row("夜","19:15〜6:15 は電池を切り離す")}${this.row("スタート","毎朝 8:00")}`; },
 /* ---- ドライバー ---- */
 drv(){ const d=this.drivers();
  return `<label class="drvf"><span class="lb">1 人目 (スタート時に乗る)</span><input id="team-d1" maxlength="20" value="${escHtml(d[0]||"")}" onchange="Team.setDrivers()"></label>
   <label class="drvf"><span class="lb">2 人目 (交代で乗る)</span><input id="team-d2" maxlength="20" value="${escHtml(d[1]||"")}" onchange="Team.setDrivers()"></label>
   <div class="dim team-note">走行ログ・分析画面・ドライバー成績で、ドライバーごとに分けて見るのに使います。レースの開始時にも変えられます。</div>`; },
 clean(s,def){ return String(s||"").replace(/[<>&"'\\]/g,"").trim().slice(0,20)||def||""; },
 drivers(){ return Array.isArray(P.drivers)? P.drivers : []; },
 setDrivers(a){ if(!a) a=[document.getElementById("team-d1").value,document.getElementById("team-d2").value]; P.drivers=a.map(x=>this.clean(x)); Settings.save(); },
 /* 他の画面へ: 振り返る (分析) / 戦略を考える (傾向) */
 go(c){ this.close(); Fade.go(()=>Ana.open(c)); },
 /* ---- 走行ログを読み込んだあと: 実車との比を出して入れるか聞く ---- */
 offerReal(runs){ const L=(runs||[]).filter(r=>r&&r.logger&&r.rows&&r.rows.some(x=>Number.isFinite(x.abs)&&x.v>1)); if(!L.length) return;
  let d=document.getElementById("team-ask"); if(d) d.remove(); d=document.createElement("div"); d.id="team-ask"; d.className="team-ask";
  d.innerHTML=`<div><b>実車との比を設定に入れますか？</b><div class="dim">読み込んだ ${L.length} 本のログを、その日の天気での計算と比べます (十数秒)。</div></div><div class="team-act"><button class="btn ana-sm pri" data-a="ok">入れる</button><button class="btn ana-sm" data-a="no">あとで</button></div>`;
  document.body.appendChild(d);
  d.addEventListener("click",async ev=>{ const b=ev.target.closest("button"); if(!b) return; if(b.dataset.a!=="ok"){ d.remove(); return; }
   d.querySelector(".team-act").innerHTML=`<span class="dim">比べています…</span>`;
   try{ const r=await this.measure(L); if(!r) throw new Error("比べられる走行がありません (2005〜2025 年の大会時期のログだけ。比が 0.5〜2 倍の外なら時刻・単位を確かめてください)");
    this.setReal(r); toast(`実車との比を設定に入れました (発電 ×${Number.isFinite(r.solar)?r.solar.toFixed(2):"―"}・消費 ×${Number.isFinite(r.load)?r.load.toFixed(2):"―"})`,"#34d399"); }
   catch(e){ toast("実車との比: "+e.message,"#ef4444"); }
   d.remove(); }); },
 /* 各ログの比を、走った行の数で重みを付けて平均 */
 async measure(L){ await TrendLoad.load(); let ws=0,wl=0,s=0,l=0; const names=[], dates=[];
  for(const run of L){ Trend.realRes=null; await Trend.realCheck(run.id); const r=Trend.realRes; if(!r||r.id!==run.id) continue;
   const ok=(x)=>Number.isFinite(x)&&x>=0.5&&x<=2;   /* 2 倍以上ずれる比は、時刻・単位の読み違いとみて入れない */
   if(ok(r.solar)){ s+=r.solar*r.n; ws+=r.n; } if(ok(r.load)){ l+=r.load*r.n; wl+=r.n; } names.push(run.name); if(run.date) dates.push(String(run.date).slice(0,10)); }
  if(!ws&&!wl) return null; dates.sort();
  return {solar:ws?s/ws:NaN,load:wl?l/wl:NaN,src:names.length>1? `${names.length} 本のログ` : names[0],date:dates.length? (dates[0]===dates[dates.length-1]? dates[0] : dates[0]+"〜"+dates[dates.length-1].slice(5)) : ""}; },
};
Team.el();   // 起動時に車両の欄をメニューからここへ移す
