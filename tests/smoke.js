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
 await p.waitForTimeout(500); return p; }
const noErr=(p)=>p.errs.filter(e=>!/vehicle-private|404/.test(e));
async function shot(p,name){ fs.mkdirSync(OUT,{recursive:true}); await p.screenshot({path:path.join(OUT,name+".png")}); }
(async()=>{
 const srv=await serve(), base=`http://127.0.0.1:${srv.address().port}/`;
 const b=await chromium.launch({args:["--use-gl=swiftshader","--enable-webgl","--ignore-gpu-blocklist"]});
 const T0=Date.now();
 try{
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
  // 走行ログ: ポーズ画面のボタンで CSV を保存
  await p.evaluate(()=>{ const s=Engine.st; s.km+=1.2; });   // km の境目をまたがせる
  await p.waitForTimeout(500);
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  const [dl]=await Promise.all([p.waitForEvent("download"),p.click("#log-btn-pause")]);
  const csv=fs.readFileSync(await dl.path(),"utf8"), lines=csv.trim().split(/\r?\n/); fs.mkdirSync(OUT,{recursive:true}); fs.writeFileSync(path.join(OUT,"log.csv"),csv);
  check("走行ログ CSV",csv.charCodeAt(0)===0xfeff&&/^日,時刻,経過h,km/.test(lines[0])&&lines.length>=3&&lines.slice(1).every(l=>l.replace(/"([^"]|"")*"/g,"x").split(",").length===lines[0].split(",").length),`${dl.suggestedFilename()} ${lines.length} 行 | ${lines[1].slice(0,120)}`);
  await p.keyboard.press("Escape");
  check("レース: エラーなし",noErr(p).length===0,noErr(p).slice(0,2).join(" | "));
  await p.context().close(); }
 // ---- チャプター (CS5 の手前から) ----
 { const p=await newPage(b,base);
  await p.evaluate(()=>{ window.pushChart=()=>{}; P.mode="race"; P.crewProc=false; document.getElementById("chapter").value="5"; startGame(); modalPause=false; Engine.st.throttleSet=0.5; });
  await p.waitForTimeout(4000);
  const r=await p.evaluate(()=>({km:Engine.st.km,day:Engine.st.day,y:View.car&&View.car.position.y}));
  check("チャプター CS5",r.km>1490&&r.km<1500&&Number.isFinite(r.y),JSON.stringify(r));
  check("チャプター: エラーなし",noErr(p).length===0,noErr(p).slice(0,2).join(" | "));
  await p.context().close(); }
 // ---- イベント (オーストラリア): 課題カード → 走行 → 結果・リプレイ ----
 for(const course of ["aus","hv"]){ const p=await newPage(b,base);
  await p.evaluate(c=>{ window.pushChart=()=>{}; P.mode="event"; setEventCourse(c); startGame(); },course);
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
 } catch(e){ check("テスト実行",false,e.message); }
 await b.close(); srv.close();
 console.log(results.join("\n")); console.log(`\n${results.length-failed}/${results.length} 件成功 (${((Date.now()-T0)/1000).toFixed(0)} 秒)`);
 process.exit(failed?1:0);
})();
