"use strict";
/* ============ 車両・チームの設定: ゲーム・戦略・速度指示・傾向・分析が同じ値を使うよう 1 か所にまとめる ============
 タブ: 車両 / 実車との比 / 合わせ込み / 運用 / ドライバー。値は Settings (この端末) に保存。実車の値は非公開ファイルだけ
 ・P.realK {solar, load, src, date, ts}: 実車のログと速い計算の比 (傾向の「発電の効率」「走行の消費」の範囲の中心)
 ・P.csTilt: CS (30 分の停車) で傾けて充電できるか。ゲーム本戦・戦略・傾向が共通で使う
 ・P.drivers: ドライバーの名前 (1 人目・2 人目) */
const Team={
 tab:"veh", TABS:[["veh","車両","car"],["sus","足回り","sliders"],["real","実車との比","activity"],["cal","合わせ込み","sliders"],["ops","運用","sun"],["drv","ドライバー","users"]],
 el(){ let e=document.getElementById("team");
  if(!e){ e=document.createElement("div"); e.id="team"; e.className="fixed inset-0 z-50 hidden items-center justify-center";
   e.innerHTML=`<div class="card2 team-card"><div class="hd"><span class="lb">Vehicle &amp; Team</span><button class="btn ana-sm" onclick="Team.close()">${this.ic("x")}閉じる</button></div>
    <h2>車両・チームの設定</h2><div class="seg team-tabs">${this.TABS.map(([k,l,i])=>`<button type="button" data-t="${k}">${this.ic(i)}${l}</button>`).join("")}</div>
    <div class="team-body"><div class="team-pane" data-p="veh"><div class="team-src" id="team-veh-src"></div><div id="team-veh"></div></div><div class="team-pane" data-p="sus"></div><div class="team-pane" data-p="real"></div><div class="team-pane" data-p="cal"></div><div class="team-pane" data-p="ops"></div><div class="team-pane" data-p="drv"></div></div></div>`;
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
  const src=r? `${escHtml(r.src||"走行ログ")}${r.date?` (${escHtml(r.date)})`:""} から${r.builtin?" (非公開ファイルの既定)":"、"+this.when(r.ts)}` : "";
  const lk=Number.isFinite(P.lossK)&&Math.abs(P.lossK-1)>0.001, ok=Number.isFinite(P.ordersK)&&Math.abs(P.ordersK-1)>0.001;
  return `<div class="team-sec">傾向 (完走率の計算) が使う比</div>
   ${this.row("発電",r?x(r.solar):"なし",src)}${this.row("消費",r?x(r.load):"なし",src)}
   <div class="team-act">${r?`<button class="btn ana-sm" onclick="Team.setReal(null)">${this.ic("x")}比を外す</button>`:""}${P.realK&&P.realK.off&&VEH.active&&VEH.spec.realK?`<button class="btn ana-sm" onclick="P.realK=null;if(typeof Trend!=='undefined'&&Trend.syncTeam) Trend.syncTeam();Team.saved()">${this.ic("check")}既定の比に戻す</button>`:""}<button class="btn ana-sm" onclick="Team.go('race')">${this.ic("upload")}走行ログを読み込む (振り返る)</button></div>
   <div class="dim team-note">走行ログ (計測器の CSV・Excel) を読み込むと、その日の天気での計算と比べた比を入れるか聞きます。傾向では、この比を中心に ± 3 % の範囲を調べます。</div>
   <div class="team-sec">ゲームの車の補正 (分析画面の合わせ込み)</div>
   ${this.row("走行の消費のモデル",lk?"×"+P.lossK.toFixed(3):"なし","",lk?`<button class="btn ana-sm" onclick="P.lossK=1;Team.saved()">外す</button>`:"")}
   ${this.row("電流の指示",ok?"×"+(+P.ordersK).toFixed(3):"なし","",ok?`<button class="btn ana-sm" onclick="P.ordersK=1;Team.saved()">外す</button>`:"")}
   ${this.row("太陽の高さ別の発電",P.pvAltS?"ログから":"既定","",P.pvAltS?`<button class="btn ana-sm" onclick="P.pvAltS='';Team.saved()">外す</button>`:"")}`; },
 /* 比: 設定で入れたもの → 無ければ非公開ファイル (vehicle-private.js の realK: 実車のログから出した既定の比)。「比を外す」と、この端末では使わない */
 realK(){ const r=P.realK; if(r&&r.off) return null;
  if(r&&typeof r==="object"&&(Number.isFinite(r.solar)||Number.isFinite(r.load))) return r;
  const d=VEH.active&&VEH.spec.realK; return d&&(Number.isFinite(d.solar)||Number.isFinite(d.load))? {solar:d.solar,load:d.load,src:d.src||"実車の値 (非公開ファイル)",date:d.date||"",ts:0,builtin:true} : null; },
 setReal(r){ P.realK= r? {solar:Number.isFinite(r.solar)?+r.solar.toFixed(4):null,load:Number.isFinite(r.load)?+r.load.toFixed(4):null,src:String(r.src||"").slice(0,80),date:String(r.date||"").slice(0,40),ts:Date.now()} : null;
  if(!r&&VEH.active&&VEH.spec.realK) P.realK={off:true};   // 非公開ファイルの既定の比も外す (この端末)
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
 /* ---- 足回り (サスペンション) ---- */
 sus(){ const p=Susp.params(), f=(x,d)=>Number.isFinite(x)? x.toFixed(d) : "―", o=P.susp||{}, S=(VEH.active&&VEH.spec.susp)||{};
  const rows=Susp.TUNE.map(([k,l,u,lo,hi,st])=>{ const v=Susp.val(k), src= o[k]!=null? "設定" : S[k]!=null? "実車の値" : "既定";
   return `<div class="team-row"><span class="lb">${l}</span><span class="num"><input type="number" class="team-num" step="${st}" min="${lo}" max="${hi}" value="${v}" onchange="Susp.set('${k}',this.value);Team.render('sus')"> ${u}</span><span class="dim">${src}</span></div>`; }).join("");
  const fw=p.wh.find(w=>w.geo.kind==="wishbone"), cam= fw? Susp.geoAt(fw,0.03).camber*180/Math.PI : NaN;
  return `<label class="chk team-chk"><input type="checkbox" ${P.xray?"checked":""} onchange="P.xray=this.checked;Settings.save()"><i></i>車体を透かしてサスペンションを見る (走行中は T キー)</label>
   <div class="team-sec">ばね・ダンパー・アーム</div>${rows}
   <div class="team-row"><span class="lb">後ろ: アームの付く側</span><span class="num"><select class="team-num" onchange="Susp.setSide(this.value);Team.render('sus')"><option value="R" ${Susp.side()>0?"selected":""}>右</option><option value="L" ${Susp.side()<0?"selected":""}>左</option></select></span><span class="dim">運転席に座って前を見たときの向き</span></div>
   <div class="team-act"><button class="btn ana-sm" onclick="Susp.reset();Team.render('sus')">${this.ic("x")}既定に戻す</button></div>
   <div class="team-sec">計算した値</div>
   ${this.row("ロールセンター (前)",f(p.hF*1000,0)+" mm","地面から")}${this.row("ロール軸 (重心の位置)",f(p.hRA*1000,0)+" mm","")}
   ${this.row("30 mm 縮んだときのキャンバー (前)",f(cam,2)+" °","− = 上が内側")}
   ${(()=>{ const r=p.wh.find(w=>w.geo.kind==="link"); return r? this.row("アンチスクワット (後ろ)",f(r.geo.anti*p.L/p.h*100,0)+" %","加速で後ろが沈むのを、アームが打ち消す割合") : ""; })()}
   ${this.row("ばね (車輪の位置で)",p.wh.map(w=>`${w.front?"前":"後"} ${f(w.k/1000,1)}`).join(" / ")+" N/mm","")}
   <div class="dim team-note">前はダブルウィッシュボーン (アッパーアーム・ロアアーム・アップライト) とマウンテンバイク用のエアサス (縮むほど硬い)。後ろは片持ち (上下 2 本の非対称な V 字のアーム、下はサスのブラケットで A 字。アップライトはインホイールモーターに直付け) とコイルばね。ばねの硬さは車体の揺れの周期 (Hz) で決めます。実車の値は非公開の諸元ファイル (susp) に入れると既定になります。</div>`; },
 /* ---- 運用 ---- */
 ops(){ setTimeout(()=>this.aiState(),0); return `<label class="chk team-chk"><input type="checkbox" ${P.csTilt!==false?"checked":""} onchange="P.csTilt=this.checked;Team.saved();if(typeof Trend!=='undefined'&&Trend.left)Trend.left()"><i></i>CS (30 分の停車) で傾けて充電する</label>
   <div class="dim team-note">外すと、ゲーム本戦の CS では平置きのまま充電し、戦略・速度の指示・傾向もそれを前提に計算します (朝・夕方は傾ける)。</div>
   <label class="chk team-chk"><input type="checkbox" ${P.crewProc!==false?"checked":""} onchange="P.crewProc=this.checked;const c=document.getElementById('crew-proc');if(c)c.checked=this.checked;Team.saved()"><i></i>乗降手順を実践 (CS・17 時・朝)</label>
   <div class="team-sec">AI (Google Gemini)</div>
   <label class="chk team-chk"><input type="checkbox" ${P.aiOn===true?"checked":""} onchange="P.aiOn=this.checked;Team.saved();Team.aiState()"><i></i>AI を使う (この端末だけ)</label>
   <label class="drvf"><span class="lb">API キー (Google AI Studio で発行。この端末のブラウザにだけ保存)</span><input type="password" id="team-aikey" autocomplete="off" placeholder="未設定" value="${AI.key()?"••••••••":""}" onchange="if(this.value!=='••••••••'){AI.setKey(this.value);this.value=AI.key()?'••••••••':'';}Team.aiState()"></label>
   <label class="drvf"><span class="lb">モデル (空欄なら ${AI.MODEL}。速くて安い Flash-Lite で十分。Pro 系は高い)</span><input id="team-aimodel" maxlength="40" value="${escHtml(P.aiModel||"")}" onchange="P.aiModel=this.value.replace(/[^a-z0-9.\-]/gi,'');Team.saved()"></label>
   <div class="team-act"><button class="btn ana-sm" onclick="Team.aiTest(this)">接続を確かめる</button><button class="btn ana-sm" onclick="AI.setKey('');document.getElementById('team-aikey').value='';Team.aiState()">キーを消す</button></div>
   <div class="dim team-note" id="team-aist"></div>
   <div class="dim team-note">朝・夕方の話し合いのセリフ、CS での戦略のひとこと、分析画面の「AI に聞く」に使います。送るのは % ・ km ・ 時刻 ・ 順位と、公開モデルの電力 (W・kWh・Wh/km) です。名前は送りません。実車モデルのときは使わず、分析画面で実車のログを見ているときは電力を送りません。使えないときは今までどおりの固定のセリフです。</div>
   <div class="team-sec">規則で決まっていること</div>
   ${this.row("朝の充電","6:15〜8:00 (傾けて)")}${this.row("夕方の充電","17:00〜日没 (傾けて)")}${this.row("夜","19:15〜6:15 は電池を切り離す")}${this.row("スタート","毎朝 8:00")}`; },
 /* ---- ドライバー ---- */
 drv(){ const d=this.drivers();
  return ["1 人目 (スタート時に乗る)","2 人目 (交代で乗る)","3 人目 (任意)","4 人目 (任意)"].map((lb,i)=>`<label class="drvf"><span class="lb">${lb}</span><input id="team-d${i+1}" maxlength="20" value="${escHtml(d[i]||"")}" onchange="Team.setDrivers()"></label>`).join("")+`
   <div class="team-sec">チームの話し合い (朝・夕方) で話す人</div>${Object.entries(Coffee.ROLES).map(([k,lb])=>`<label class="drvf"><span class="lb">${lb}</span><input data-crew="${k}" maxlength="16" placeholder="名前 (空欄なら役職だけ)" value="${escHtml((P.crewNames||{})[k]||"")}" onchange="Team.setCrew(this)"></label>`).join("")}
   <div class="dim team-note">最大 4 人。走行ログ・分析画面・ドライバー成績で、ドライバーごとに分けて見るのに使います。朝の打ち合わせで、乗る順番と交代する CS を決めます。レースの開始時にも変えられます。</div>`; },
 aiState(){ const el=document.getElementById("team-aist"); if(el){ const w=AI.why(); el.textContent=(w?`状態: ${w}`:"状態: 使えます")+"・"+AI.useText(); } },
 async aiTest(b){ b.disabled=true; const el=document.getElementById("team-aist"); if(el) el.textContent="確かめています…"; const r=await AI.test(); b.disabled=false; if(el) el.textContent=r+"・"+AI.useText(); },
 setCrew(el){ P.crewNames={...(P.crewNames||{}),[el.dataset.crew]:this.clean(el.value)}; Settings.save(); },
 clean(s,def){ return String(s||"").replace(/[<>&"'\\]/g,"").trim().slice(0,20)||def||""; },
 drivers(){ return Array.isArray(P.drivers)? P.drivers : []; },
 setDrivers(a){ if(!a) a=[1,2,3,4].map(i=>document.getElementById("team-d"+i).value); a=a.map(x=>this.clean(x)); while(a.length>2&&!a[a.length-1]) a.pop(); P.drivers=a.slice(0,4); Settings.save(); },
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
