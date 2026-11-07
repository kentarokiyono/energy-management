"use strict";
/* 動作確認 (スモークテスト): 各モードを起動して少し走らせ、エラー・外部通信・表示崩れがないかを見る。
   実行: npm test  (Playwright の Chromium が必要: npx playwright install chromium) */
const http=require("http"), fs=require("fs"), path=require("path");
const {chromium}=require("playwright");
const ROOT=path.resolve(__dirname,".."), OUT=path.join(ROOT,"tests","out");
const TYPES={".html":"text/html",".js":"application/javascript",".css":"text/css",".svg":"image/svg+xml",".woff2":"font/woff2",".json":"application/json",".gpx":"application/xml",".png":"image/png"};
function serve(){ return new Promise(res=>{ const s=http.createServer((q,r)=>{ let p=decodeURIComponent(q.url.split("?")[0].split("#")[0]); if(p.endsWith("/")) p+="index.html";
  const f=path.join(ROOT,p); if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){ r.writeHead(404); r.end(); return; }
  r.writeHead(200,{"Content-Type":TYPES[path.extname(f)]||"application/octet-stream"}); fs.createReadStream(f).pipe(r); }); s.listen(0,"127.0.0.1",()=>res(s)); }); }
const results=[]; let failed=0;
function check(name,ok,info){ results.push(`${ok?"PASS":"FAIL"}  ${name}${info?"  ("+info+")":""}`); if(!ok) failed++; }
async function newPage(b,base,opt={}){
 const ctx=await b.newContext({viewport:opt.vp||{width:1280,height:720},hasTouch:!!opt.touch,isMobile:!!opt.touch});
 const p=await ctx.newPage(); p.errs=[]; p.ext=[];
 p.on("pageerror",e=>p.errs.push(e.message)); p.on("console",m=>{ if(m.type()==="error") p.errs.push(m.text()); });
 p.on("request",r=>{ const u=r.url(); if(!u.startsWith(base)&&!/^(data|blob):/.test(u)) p.ext.push(u); });
 await p.goto(base+"index.html"); await p.waitForFunction(()=>typeof startGame==="function"&&typeof THREE!=="undefined");
 await p.waitForTimeout(500);
 if(!opt.gfx) await p.evaluate(()=>{ P.gfx="low"; });   // 速さを見る確認は軽い画質で (ソフトウェア描画は遅い)。高画質は別に確認
 return p; }
const noErr=(p)=>p.errs.filter(e=>!/vehicle-private|404/.test(e));
async function shot(p,name){ fs.mkdirSync(OUT,{recursive:true}); await p.screenshot({path:path.join(OUT,name+".png")}); }
(async()=>{
 const srv=await serve(), base=`http://127.0.0.1:${srv.address().port}/`;
 const b=await chromium.launch({args:["--use-gl=swiftshader","--enable-webgl","--ignore-gpu-blocklist"]});
 const T0=Date.now();
 try{
 // ---- 画質「高」: ポストプロセスと映り込みの環境がエラーなく動く ----
 { const p=await newPage(b,base,{gfx:true});
  await p.evaluate(()=>{ P.gfx="high"; P.mode="race"; startGame(); }); await p.waitForTimeout(4000);
  const g=await p.evaluate(()=>({post:!!Post.comp&&Post.want(),env:!!EnvLight.rt&&View.scene.environment===EnvLight.rt.texture,pbr:View.car.userData.upperTilt.children[0].children.some(m=>m.material&&m.material.isMeshPhysicalMaterial&&m.material.clearcoat>0.5)}));
  check("画質「高」: ブルーム・映り込み・塗装",g.post&&g.env&&g.pbr&&noErr(p).length===0,JSON.stringify(g)+" "+noErr(p).slice(0,2).join(" | "));
  await shot(p,"gfx-high"); await p.context().close(); }
 // ---- 練習シナリオ (スコール) と無線の速度指示 ----
 { const p=await newPage(b,base);
  await p.click('#seg-scn button[data-v="squall"]');
  await p.evaluate(()=>{ P.mode="race"; P.crewProc=false; startGame(); }); await p.waitForTimeout(1500);
  const sc=await p.evaluate(()=>({km:Engine.st.km,day:Engine.st.day,ts:P.timeScale,wx:Engine.st.weatherPlan.length,real:RealWx.on()}));
  await p.evaluate(()=>{ Orders.nextKm=Engine.st.km; Engine.st.v=20; }); await p.waitForTimeout(1200);
  const od=await p.evaluate(()=>({cur:!!Orders.cur,ui:document.getElementById("hud-order").style.display}));
  await p.evaluate(()=>{ const es=Engine.st; es.km=Scenario.cur.goal+0.05; View.s=View.sOfKm(es.km); }); await p.waitForTimeout(1200);
  const rs=await p.evaluate(()=>({on:document.getElementById("scn-result").classList.contains("on"),last:Scenario.last}));
  check("練習シナリオ: 開始と採点",Math.abs(sc.km-760)<0.5&&sc.day===2&&sc.ts===12&&sc.wx===1&&!sc.real&&rs.on&&rs.last&&rs.last.score>=0,JSON.stringify({sc,rs}));
  check("無線の速度指示",od.cur&&od.ui==="flex",JSON.stringify(od));
  check("練習シナリオ: エラーなし",noErr(p).length===0,noErr(p).slice(0,2).join(" | "));
  await p.evaluate(()=>{ Scenario.closeRes(); quitToMenu(); document.getElementById("scenario").value=""; }); await p.context().close(); }
 // ---- メニュー ----
 { const p=await newPage(b,base);
  const s=await p.evaluate(()=>({build:document.querySelector(".build").textContent, modes:document.querySelectorAll(".mode").length, seg:document.querySelectorAll("#seg-ts button").length, quali:document.getElementById("quali-info").textContent}));
  check("メニュー表示",s.modes===3&&s.seg===7&&/BUILD/.test(s.build),JSON.stringify(s));
  check("外部への通信なし",p.ext.length===0,p.ext.slice(0,3).join(" "));
  check("メニューでエラーなし",noErr(p).length===0,noErr(p).slice(0,2).join(" | "));
  // 設定の保存: 変えて再読み込み → 残る / 既定値に戻す → 消える
  await p.evaluate(()=>{ onSlider("massDriver","75"); selectPanel("perov"); setEventCourse("hv"); document.querySelector('#seg-ts button[data-v="10"]').click(); });
  await p.reload(); await p.waitForFunction(()=>typeof startGame==="function"); await p.waitForTimeout(400);
  const kept=await p.evaluate(()=>({d:P.massDriver,pn:P.panel,c:EventGame.course,ts:document.getElementById("time-scale").value,on:document.querySelector('#seg-ts .on').dataset.v,lbl:document.getElementById("settings-state").textContent}));
  check("設定の保存",kept.d===75&&kept.pn==="perov"&&kept.c==="hv"&&kept.ts==="10"&&kept.on==="10",JSON.stringify(kept));
  p.once("dialog",d=>d.accept()); await p.click("#settings-reset"); await p.waitForFunction(()=>typeof startGame==="function"); await p.waitForTimeout(400);
  const back=await p.evaluate(()=>({d:P.massDriver,pn:P.panel,c:EventGame.course,ts:document.getElementById("time-scale").value,stored:localStorage.getItem("bwsc_settings")}));
  check("設定を既定値に戻す",back.d!==75&&back.pn!=="perov"&&back.ts==="60",JSON.stringify(back));
  await shot(p,"menu"); await p.context().close(); }
 // ---- レース: スタート待機 → 発進 → 走行 ----
 { const p=await newPage(b,base);
  await p.evaluate(()=>{ window.pushChart=()=>{}; P.mode="race"; P.crewProc=false; startGame(); modalPause=false; });
  await p.waitForTimeout(1500);
  const g=await p.evaluate(()=>({grid:Engine.st.grid,wait:Engine.gridWait(),teams:Engine.st.teams.length,v:Engine.st.v}));
  check("レース: グリッド待機",g.grid>=1&&g.wait===true&&g.teams===25&&g.v===0,JSON.stringify(g));
  await p.evaluate(()=>{ Engine.st.gridStartH=8; Engine.st.throttleSet=0.7; });
  await p.waitForTimeout(6000);
  const r=await p.evaluate(()=>({km:Engine.st.km,v:Engine.st.v*3.6,soc:Engine.st.soc,speed:document.getElementById("hud-speed").textContent,nan:/NaN|undefined/.test(document.getElementById("game-container").innerText)}));
  check("レース: 発進して走る",r.km>0&&r.v>0.5&&r.soc>0.5&&!r.nan,JSON.stringify(r));
  await p.evaluate(()=>MapUI.toggle(true)); await p.waitForTimeout(700);
  const ov=await p.evaluate(()=>document.querySelectorAll("#map-ov-rows tr").length);
  check("レース: 他チーム一覧",ov===26,"rows="+ov);
  await shot(p,"race"); await p.evaluate(()=>MapUI.toggle(false));
  const st=await p.evaluate(()=>{ const pl=Strategy.plan(true); return {ok:pl.ok,v:pl.v,fin:pl.r.finishAbs,txt:document.getElementById("hud-plan").textContent}; });
  const ai=await p.evaluate(()=>{ const s=Engine.st, keep={h:s.hour,d:s.day,doy:s.dayOfYear,km:s.km,teams:s.teams,v:s.v}; s.v=0;   // 自車は止めておく (走っている自車には後ろから付いて走るため)
   s.teams=Engine.initTeams(); Engine.setupGrid(); for(const t of s.teams) t.retireKm=null; s.hour=8; s.day=1;
   for(let k=0;k<24*60;k++){ s.hour+=1/60; if(s.hour>=24){ s.hour-=24; s.day++; s.dayOfYear++; } Engine.updateTeams(60); }
   const top=s.teams[0], last=s.teams[s.teams.length-1], r={top:top.km,last:last.km,soc:s.teams.map(t=>t.soc)};
   s.teams=keep.teams; s.hour=keep.h; s.day=keep.d; s.dayOfYear=keep.doy; s.km=keep.km; s.v=keep.v; return {top:r.top.toFixed(0),last:r.last.toFixed(0),socOk:r.soc.every(x=>x>=0&&x<=1)}; });
  check("AI チーム: 1 日の走行距離",ai.top>450&&ai.top<800&&ai.last>250&&ai.socOk,JSON.stringify(ai));
  check("戦略: 推奨速度とゴール予想",st.ok&&st.v>=40&&st.v<=130&&st.fin>24&&st.fin<24*7,JSON.stringify(st));
  // 走行ログ: ポーズ画面のボタンで CSV を保存
  await p.evaluate(()=>{ const s=Engine.st; s.km+=1.2; });   // km の境目をまたがせる
  await p.waitForTimeout(500);
  await p.keyboard.press("Escape");
 await p.waitForTimeout(300);
  const [dl]=await Promise.all([p.waitForEvent("download"),p.click("#log-btn-pause")]);
  const csv=fs.readFileSync(await dl.path(),"utf8"), lines=csv.trim().split(/\r?\n/); fs.mkdirSync(OUT,{recursive:true}); fs.writeFileSync(path.join(OUT,"log.csv"),csv);
  check("走行ログ CSV",csv.charCodeAt(0)===0xfeff&&/^日,時刻,経過h,km/.test(lines[0])&&lines.length>=3&&lines.slice(1).every(l=>l.replace(/"([^"]|"")*"/g,"x").split(",").length===lines[0].split(",").length),`${dl.suggestedFilename()} ${lines.length} 行 | ${lines[1].slice(0,120)}`);
  await p.keyboard.press("Escape");
  // 分析画面: 今回の走行と、保存した CSV を読み込んで比較
  await p.evaluate(()=>Ana.open()); await p.waitForTimeout(500);
  await p.setInputFiles("#ana-file",path.join(OUT,"log.csv")); await p.waitForTimeout(500);
  await p.selectOption("#ana-cmp","1");
  for(const v of ["B","A"]) await p.click(`#ana-lay button[data-v="${v}"]`);
  for(const v of ["net","drv","v"]) await p.click(`#ana-met button[data-v="${v}"]`);
  await p.click('#ana-mode button[data-v="elev"]');
  await p.click("#ana-demo"); await p.waitForTimeout(400);
  const demo=await p.evaluate(()=>{ const r=Ana.run(); return {demo:!!r.demo,rows:r.rows.length,end:r.rows[r.rows.length-1].km,drv:r.drivers.length}; });
  check("分析画面: デモ走行",demo.demo&&demo.rows>10000&&demo.end>3020&&demo.drv===2,JSON.stringify(demo));
  await p.selectOption("#ana-run","1");
  const an=await p.evaluate(()=>({runs:Ana.runs.length,rows:Ana.run().rows.length,pane:/走行時間/.test(document.getElementById("ana-pane").textContent),gl:!!document.querySelector("#ana-map canvas")}));
  check("分析画面: 今回の走行と CSV の読み込み",an.runs===3&&an.rows>=2&&an.pane&&an.gl,JSON.stringify(an));
  // 日付の拡大・範囲のスライダー・名前と日付の編集 (保存して読み直す)・削除
  await p.selectOption("#ana-run","2"); await p.click('#ana-days button[data-d="2"]');
  const z=await p.evaluate(()=>{ const r=Ana.run(), d=r.days.find(o=>o.d===2); return {xr:Ana.xr, a:d.a, b:d.b, kmMax:r.kmMax}; });
  const nb=await p.locator("#ana-nav").boundingBox(); await p.mouse.move(nb.x+nb.width-30,nb.y+nb.height/2); await p.mouse.down(); await p.mouse.up();
  const z2=await p.evaluate(()=>Ana.xr.slice());
  check("分析画面: 日付で拡大・スライダー",z.xr[0]<=z.a&&z.xr[1]>=z.b&&z.xr[1]-z.xr[0]<z.kmMax*0.6&&z2[1]>z.xr[1],JSON.stringify({z,z2}));
  await p.click("#ana-edit"); await p.fill("#ana-dn","編集テスト"); await p.fill("#ana-dd","2025-10-20"); await p.click("#ana-dsave"); await p.waitForTimeout(300);
  const dbS=await p.evaluate(async()=>{ const all=await Ana.DB.all(); return all.map(o=>o.name+"|"+o.date); });
  p.once("dialog",d=>d.accept()); await p.click("#ana-del"); await p.waitForTimeout(300);
  const st2=await p.evaluate(async()=>({n:Ana.runs.length,db:(await Ana.DB.all()).map(o=>o.name)}));
  check("分析画面: 走行データの編集・保存・削除",dbS.includes("編集テスト|2025-10-20")&&st2.n===2&&!st2.db.includes("編集テスト"),JSON.stringify({dbS,st2}));
  // 戦略の答え合わせ・走りの再生 (デモ走行)
  await p.evaluate(()=>{ try{ localStorage.removeItem("bwsc_ana_nodemo"); }catch(e){} if(!Ana.runs.some(r=>r.demo)) Ana.addDemo(); Ana.cur=Ana.runs.findIndex(r=>r.demo); Ana.xr=null; Ana.render(); });   // 前の確認で消したデモを戻す
  const rv=await p.evaluate(()=>{ const R=Ana.review(Ana.run()); return {v:R.v,legs:R.legs&&R.legs.length,err:R.err||null,pts:R.pts&&R.pts.length}; });
  check("分析画面: 戦略の答え合わせ",rv.v>=40&&rv.legs>=8&&rv.pts>500&&!rv.err,JSON.stringify(rv));
  await p.click('#ana-lay button[data-v="A"]'); await p.click("#ana-pp"); await p.waitForTimeout(1500);
  const pl=await p.evaluate(()=>{ const R=Ana.playRows(Ana.run()); return {on:Ana.play.on,adv:Ana.play.t-R[0].abs,txt:/km\/h/.test(document.getElementById("ana-pr").textContent)}; });
  await p.click("#ana-pp");
  check("分析画面: 走りの再生",pl.on&&pl.adv>0&&pl.txt,JSON.stringify(pl));
  await shot(p,"analysis"); await p.evaluate(()=>Ana.close());
  check("レース: エラーなし",noErr(p).length===0,noErr(p).slice(0,2).join(" | "));
  await p.context().close(); }
 // ---- チャプター (CS5 の手前から) ----
 { const p=await newPage(b,base);
  await p.evaluate(()=>{ window.pushChart=()=>{}; P.mode="race"; P.crewProc=false; document.getElementById("chapter").value="5"; startGame(); modalPause=false; Engine.st.throttleSet=0.5; });
  await p.waitForTimeout(4000);
  const r=await p.evaluate(()=>({km:Engine.st.km,day:Engine.st.day,y:View.car&&View.car.position.y}));
  const gq=await p.evaluate(()=>{ const keep=P.gfx; P.gfx="low"; Perf.reset(); const r={pr:View.renderer.getPixelRatio(),sh:View.renderer.shadowMap.enabled,skip:[...Array(1000)].filter((_,i)=>GFX.skip(i*3.1,i*7.7)).length};
   P.gfx=keep; Perf.reset(); return r; });
  check("画質「低」: 解像度・影・景観の間引き",gq.pr===1&&gq.sh===false&&gq.skip>500&&gq.skip<800,JSON.stringify(gq));
  check("チャプター CS5",r.km>1490&&r.km<1500&&Number.isFinite(r.y),JSON.stringify(r));
  check("チャプター: エラーなし",noErr(p).length===0,noErr(p).slice(0,2).join(" | "));
  await p.context().close(); }
 // ---- イベント (オーストラリア): 課題カード → 走行 → 結果・リプレイ ----
 for(const course of ["aus","hv"]){ const p=await newPage(b,base);
  await p.evaluate(c=>{ window.pushChart=()=>{}; P.mode="event"; setEventCourse(c); EventGame.practice=(c==="hv"); startGame(); },course);
  if(course==="hv"){   // 操作の練習: アクセル → ハンドル左右 → ブレーキ で進み、終わると課題カード
   await p.waitForTimeout(800); const tut=await p.evaluate(()=>{ const e=document.getElementById("ev-tut"); return !!e&&e.style.display!=="none"; });
   for(const k of ["w","a","d"," "]){ await p.keyboard.down(k); await p.waitForTimeout(250); await p.keyboard.up(k); await p.waitForTimeout(150); }
   await p.waitForTimeout(1500); const after=await p.evaluate(()=>{ const e=document.getElementById("ev-tut"); return e.style.display==="none"&&EventGame.cardOpen; });
   check("イベント: 操作の練習",tut&&after,JSON.stringify({tut,after})); }
  await p.waitForTimeout(1500);
  const card=await p.evaluate(()=>{ const e=document.getElementById("ev-card"); return !!e&&e.style.display!=="none"; });
  check(`イベント ${course}: 課題カード`,card);
  await p.keyboard.press("Space"); await p.waitForTimeout(400);
  await p.evaluate(()=>{ Engine.st.throttleSet=0.6; if(typeof Test!=="undefined"&&Test.active) Input.keys["w"]=true; });
  await p.waitForTimeout(4000);
  for(let i=0;i<5&&await p.evaluate(()=>EventGame.cardOpen);i++){ await p.click("#ev-card"); await p.waitForTimeout(500); }
  await p.evaluate(()=>{ EventGame.t=EventGame.DUR+1; });
  await p.waitForTimeout(2500);
  const res=await p.evaluate(()=>{ const e=document.getElementById("ev-result"); return !!e&&e.style.display!=="none"; });
  check(`イベント ${course}: 結果画面`,res);
  if(course==="hv"){   // ヒドゥンバレーのリプレイ URL: 記録 → 符号化 → 再生で同じ位置を通る
   const hr=await p.evaluate(async()=>{ EventGame.rec=[]; for(let t=1;t<=60;t++) EventGame.rec.push([t<30?0:1,t<30?t:t-29,Math.cos(t/9)*40,Math.sin(t/9)*25]);
    const code=await EventGame.encode(), d=await EventGame.decode(code), smp=d.samples.filter(q=>q[0]===0), q=EventGame.hvPose(smp,10);
    return {len:code.length,course:d.course,n:d.samples.length,x:q.x.toFixed(2),ex:(Math.cos(10/9)*40).toFixed(2)}; });
   check("ヒドゥンバレー: リプレイ URL",hr.course==="hv"&&hr.n===60&&Math.abs(hr.x-hr.ex)<0.3&&hr.len<2300,JSON.stringify(hr)); }
  if(course==="aus"){
   const rp=await p.evaluate(async()=>{ EventGame.rec=[[0,1,0.5,0,10],[0,2,0.55,0.2,11],[0,3,0.6,0.1,12],[1,1,2.0,0,15]]; const c=await EventGame.encode(); const d=await EventGame.decode(c); let bad=0;
    for(const x of ["", "z!!", "u"+"A".repeat(13000)]) { try{ await EventGame.decode(x); }catch(e){ bad++; } }
    return {len:c.length,samples:d.samples.length,bad}; });
   check("リプレイ URL の往復と不正値の拒否",rp.samples>0&&rp.bad===3,JSON.stringify(rp)); }
  await shot(p,"event-"+course);
  check(`イベント ${course}: エラーなし`,noErr(p).length===0,noErr(p).slice(0,2).join(" | "));
  await p.context().close(); }
 // ---- 予選・車検 ----
 { const p=await newPage(b,base);
  for(const k of ["circuit","slalom","brake","combo","fig8"]){
   await p.evaluate(k=>{ window.pushChart=()=>{}; quitToMenu(); P.mode="test"; P.testKind=k; startGame(); },k);
   await p.waitForTimeout(1200); await p.evaluate(()=>{ Input.keys["w"]=true; }); await p.waitForTimeout(1500);
   const r=await p.evaluate(()=>({active:Test.active,v:Test.v,x:Test.x}));
   await p.evaluate(()=>{ Input.keys["w"]=false; });
   check(`予選 ${k}`,r.active&&Number.isFinite(r.x)&&r.v>0.02,JSON.stringify(r)); }
  await shot(p,"test");
  check("予選: エラーなし",noErr(p).length===0,noErr(p).slice(0,2).join(" | "));
  await p.context().close(); }
 // ---- ヒドゥンバレー: コースを 1 周すると周回が数えられる (車をコースの点に沿って動かす) ----
 { const p=await newPage(b,base);
  await p.evaluate(()=>{ window.pushChart=()=>{}; P.mode="test"; P.testKind="circuit"; startGame(); }); await p.waitForTimeout(1200);
  await p.evaluate(()=>{ const T=HV.track(), n=T.pts.length; let i=Test.lastIdx||0, moved=0; Test.v=12; Test.state="run";
   window._lapT=setInterval(()=>{ const step=Math.max(1,Math.round(n/60)); i=(i+step)%n; moved+=step; const q=T.pts[i]; Test.x=q.x; Test.z=q.z; Test.v=12; if(moved>n*1.3) clearInterval(window._lapT); },60); });
  await p.waitForFunction(()=>Test.laps.length>=1,null,{timeout:60000}).catch(()=>{});
  const lp=await p.evaluate(()=>{ clearInterval(window._lapT); return {laps:Test.laps.length,t:Test.laps[0]}; });
  check("ヒドゥンバレー: 周回の計測",lp.laps>=1&&lp.t>0,JSON.stringify(lp));
  await p.context().close(); }
 // ---- 振動・反力: 仮のゲームパッドと仮のハンコンで、出力の向きと強さ・OFF・項目ごとの強さ ----
 { const ctx=await b.newContext({viewport:{width:1280,height:720}}); await ctx.addInitScript(()=>{ window._rum=[];
   const pad={id:"Fake",index:0,connected:true,axes:[0,0,0,0],buttons:[{pressed:false}],vibrationActuator:{playEffect:(t,o)=>{ window._rum.push([o.strongMagnitude,o.weakMagnitude]); return Promise.resolve("complete"); }}};
   navigator.getGamepads=()=>[pad]; });
  const p=await ctx.newPage(); p.errs=[]; p.on("pageerror",e=>p.errs.push(e.message));
  await p.goto(base+"index.html"); await p.waitForFunction(()=>typeof FFB==="object"); await p.waitForTimeout(300);
  const f=await p.evaluate(async()=>{ const hid=[]; FFB.hid={sendReport:(id,d)=>{ hid.push([...d]); return Promise.resolve(); }}; P.ffb="high"; P.ffbTune={};
   const base={v:25,steer:0,offroad:false,shoulder:false,rough:0.65,cross:0,trainRel:null,brake:0,gLat:0,dt:1/60};
   const run=async(mod)=>{ window._rum.length=0; hid.length=0; FFB.on=false; for(let i=0;i<30;i++){ FFB.tSend=0; FFB.update(Object.assign({},base,mod)); await new Promise(r=>setTimeout(r,2)); }
    const R=window._rum, H=hid.filter(x=>x[0]===0x11).map(x=>x[2]-128); return {s:R.reduce((a,x)=>a+x[0],0)/Math.max(1,R.length),w:R.reduce((a,x)=>a+x[1],0)/Math.max(1,R.length),t:H.length?H.reduce((a,x)=>a+x,0)/H.length:0,n:R.length}; };
   const paved=await run({}), off=await run({offroad:true}), right=await run({steer:0.5});
   P.ffbTune={road:0}; const noRoad=await run({}); P.ffbTune={};
   P.ffb="off"; const offMode=await run({offroad:true}); P.ffb="mid";
   return {paved,off,right,noRoad,offMode}; });
  check("振動・反力",f.paved.n>0&&f.paved.w>0.05&&f.paved.s<0.05&&f.off.s>0.3&&f.right.t<-10&&f.noRoad.w<0.01&&f.offMode.n===0,JSON.stringify(f));
  await ctx.close(); }
 // ---- 分析画面 (スマホ縦): 地図・グラフ・右の欄が並び、地図の上の表示が重ならない ----
 { const p=await newPage(b,base,{vp:{width:390,height:844},touch:true});
  await p.evaluate(()=>Ana.open()); await p.waitForTimeout(1500);
  const m=await p.evaluate(()=>{ const r=id=>document.getElementById(id).getBoundingClientRect(), mp=r("ana-map"), ch=r("ana-charts"), pn=r("ana-pane"), lg=r("ana-leg"), pl=r("ana-play"), cv=document.querySelector("#ana-map canvas").getBoundingClientRect();
   const ov=(a,b)=>a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1;
   return {mapW:Math.round(mp.width),cvW:Math.round(cv.width),chartH:Math.round(ch.height),order:mp.top<ch.top&&ch.top<pn.top,legPlay:ov(lg,pl)}; });
  check("分析画面 (スマホ縦)",m.mapW===390&&m.cvW===390&&m.chartH>=300&&m.order&&!m.legPlay,JSON.stringify(m));
  await p.context().close(); }
 // ---- スマホ横画面: 部品が重ならない ----
 for(const vp of [{width:932,height:430},{width:844,height:390}]){ const p=await newPage(b,base,{vp,touch:true});
  await p.evaluate(()=>{ window.pushChart=()=>{}; P.uiMode="mobile"; P.mode="race"; P.crewProc=false; startGame(); modalPause=false; });
  await p.waitForTimeout(2000);
  const o=await p.evaluate(()=>{ const r=id=>{ const e=document.getElementById(id); const b=e.getBoundingClientRect(); return [b.left,b.top,b.right,b.bottom]; };
   const ids=["hud-map","t-fn","t-ped","t-steer","t-spd","hud-limit-wrap","hud-top"], R=ids.map(r), hit=[];
   for(let i=0;i<R.length;i++) for(let j=i+1;j<R.length;j++){ const a=R[i],c=R[j]; if(a[0]<c[2]-1&&c[0]<a[2]-1&&a[1]<c[3]-1&&c[1]<a[3]-1) hit.push(ids[i]+"×"+ids[j]); }
   const out=R.filter(a=>a[0]<-1||a[1]<-1||a[2]>innerWidth+1||a[3]>innerHeight+1).length;
   return {hit,out}; });
  check(`スマホ ${vp.width}×${vp.height}: 重なり・はみ出しなし`,o.hit.length===0&&o.out===0,JSON.stringify(o));
  await shot(p,`touch-${vp.width}`); await p.context().close(); }
 // ---- オフライン: 一度開いたら回線なしで起動できる ----
 { const p=await newPage(b,base);
  await p.waitForFunction(()=>/OFFLINE READY/.test(document.querySelector(".menu .build").textContent),null,{timeout:30000});
  await p.context().setOffline(true); await p.reload(); await p.waitForTimeout(1500);
  const o=await p.evaluate(()=>({game:typeof startGame,three:typeof THREE,chart:typeof Chart,font:document.fonts.check("700 16px 'Chakra Petch'")}));
  check("オフラインで起動",o.game==="function"&&o.three==="object"&&o.chart==="function",JSON.stringify(o));
  await p.context().close(); }
 } catch(e){ check("テスト実行",false,e.message); }
 await b.close(); srv.close();
 console.log(results.join("\n")); console.log(`\n${results.length-failed}/${results.length} 件成功 (${((Date.now()-T0)/1000).toFixed(0)} 秒)`);
 process.exit(failed?1:0);
})();
