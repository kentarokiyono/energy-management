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
 await p.goto(base+"index.html"+(opt.q||"")); await p.waitForFunction(()=>typeof startGame==="function"&&typeof THREE!=="undefined");
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
  await p.click('#ent-practice'); await p.click('#ent-sub [data-sub="scn"]'); await p.click('#ent-scn button[data-v="squall"]');
  await p.evaluate(()=>{ P.mode="race"; P.crewProc=false; startGame(); }); await p.waitForTimeout(1500);
  const sc=await p.evaluate(()=>({km:Engine.st.km,day:Engine.st.day,ts:P.timeScale,wx:Engine.st.weatherPlan.length,real:RealWx.on()}));
  await p.evaluate(()=>{ Orders.nextKm=Engine.st.km; Engine.st.v=20; }); await p.waitForTimeout(1200);
  const od=await p.evaluate(()=>({cur:!!Orders.cur,ui:document.getElementById("hud-order").style.display}));
  await p.evaluate(()=>{ const es=Engine.st; es.km=Scenario.cur.goal+0.05; View.s=View.sOfKm(es.km); }); await p.waitForTimeout(1200);
  const rs=await p.evaluate(()=>({on:document.getElementById("scn-result").classList.contains("on"),last:Scenario.last}));
  check("練習シナリオ: 開始と採点",Math.abs(sc.km-760)<0.5&&sc.day===2&&sc.ts===12&&sc.wx===1&&!sc.real&&rs.on&&rs.last&&rs.last.score>=0,JSON.stringify({sc,rs}));
  check("無線の速度指示",od.cur&&od.ui==="flex",JSON.stringify(od));
  const ln=await p.evaluate(()=>{ const es=Engine.st, keep={km:es.km,st:es.stopTimer,camp:es.camp}, msgs=[]; const o=Radio.push; Radio.push=(m,w)=>{ if(w==="前方誘導車"&&/制限速度/.test(m)) msgs.push(m); };
   es.stopTimer=0; es.camp=false; es.v=20; Orders.limDone=new Set(); for(let k=300;k<316;k+=0.02){ es.km=k; Orders.limitNotice(es); } Radio.push=o; Object.assign(es,{km:keep.km,stopTimer:keep.st,camp:keep.camp}); return msgs; });
  check("制限速度の予告",ln.length>=3&&ln.every(m=>/この先 [0-9.]+ km で制限速度 \d+ km\/h \(現在 \d+ km\/h\)/.test(m)),ln.slice(0,3).join(" / "));
  check("練習シナリオ: エラーなし",noErr(p).length===0,noErr(p).slice(0,2).join(" | "));
  await p.evaluate(()=>{ Scenario.closeRes(); quitToMenu(); document.getElementById("scenario").value=""; }); await p.context().close(); }
 // ---- 横転の危険度と練習シナリオ (暴風雨) ----
 { const p=await newPage(b,base);
  const rr=await p.evaluate(()=>{ const es={lastRho:1.17,gLat:0,gLong:0}, R=(c,v,sh)=>VehDyn.roll(es,c,v/3.6,sh).risk;
   const a=R(10,60), b=R(20,60), c=R(20,0), d=R(20,0,true); es.gLat=0.3; const t=R(0,60); es.gLong=0.4; const t2=R(0,60); es.gLat=0; es.gLong=0;
   return {windUp:b>a, speedUp:b>c, shield:d<c*0.6, turn:t>0.05, brake:t2>t}; });
  check("横転の危険度: 風・速度・旋回・加減速で増え、風よけで下がる",Object.values(rr).every(Boolean),JSON.stringify(rr));
  await p.click('#ent-practice'); await p.click('#ent-sub [data-sub="scn"]'); await p.click('#ent-scn button[data-v="storm"]');
  await p.evaluate(()=>{ P.mode="race"; P.crewProc=false; P.tts="off"; startGame(); }); await p.waitForTimeout(1500);
  const st=await p.evaluate(()=>{ const es=Engine.st, c=Scenario.cur, msgs=[]; const o=Radio.push; Radio.push=(m,w)=>msgs.push(w+": "+m);
   const g=c.gusts, w0=Scenario.stormWind(c,c.abs0).ms, wIn=Scenario.stormWind(c,c.abs0+c.sc.storm.in+(g[0][0]+5)/3600).ms;
   es.v=0; for(let t=c.abs0;t<c.abs0+c.sc.storm.in+0.05;t+=1/3600){ es.day=Math.floor(t/24)+1; es.hour=t-(es.day-1)*24; Scenario.stormRadio(c,es,t); }
   Radio.push=o; return {sc:es.scenario,n:g.length,w0,wIn,lv:c.lv,lvBtn:document.querySelectorAll("#seg-scnlv button").length,stdMax:Scenario.LEVELS.std.wind*c.sc.storm.max,fx:!!StormFx.grp,scout:msgs.filter(m=>/^偵察車/.test(m)).length,lead:msgs.filter(m=>/^前方誘導車: 突風/.test(m)).length,hud:document.getElementById("hud-roll").style.display}; });
  await p.evaluate(()=>{ Engine.st.weather={type:"squall",factor:0.06}; }); await p.waitForTimeout(2500);
  const rn=await p.evaluate(()=>({mix:View.wxMix,I:Rain.I,lines:Rain.lines&&Rain.lines.visible,fog:View.scene.fog.far,glass:document.getElementById("rain-glass").style.display}));
  check("雨: 雨筋・視界・ガラスの雨粒・10 秒かけて切り替わる",rn.mix>0.005&&rn.mix<0.9&&rn.I<0.9&&rn.I>0.005&&rn.lines&&rn.fog<2000&&rn.glass==="block"&&noErr(p).length===0,JSON.stringify(rn)+" "+noErr(p).slice(0,2).join(" | "));
  check("練習シナリオ: 暴風雨 (突風・偵察車と前方誘導車の警告・難しさ・前ぶれ)",st.sc==="storm"&&st.lv==="real"&&st.lvBtn===2&&st.stdMax<20&&st.fx&&st.n>=10&&st.wIn>st.w0+8&&st.scout>=2&&st.lead>=1&&st.hud==="flex"&&noErr(p).length===0,JSON.stringify(st)+" "+noErr(p).slice(0,2).join(" | "));
  await p.evaluate(()=>{ Scenario.reset(); quitToMenu(); document.getElementById("scenario").value=""; }); await p.context().close(); }
 // ---- 発電・消費の補正、後半の悪化、レース中の暴風雨、戦略を裏で少しずつ ----
 { const p=await newPage(b,base);
  const r=await p.evaluate(()=>{ window.pushChart=()=>{}; P.mode="race"; P.crewProc=false; P.realWeather=true; P.raceStorm=true; startGame(); running=false; const es=Engine.st, o={};
   const keep={a:P.pvAltS,l:P.lossK,f:P.fcErr,pl:P.planLate};
   P.pvAltS=JSON.stringify([0.5,0.5,0.6,0.7,0.8,0.9,1,1,1]); o.pvLow=PVLoss.k(10*Math.PI/180,false); o.pvHigh=PVLoss.k(70*Math.PI/180,false);
   P.lossK=1.1; const d0=Strategy.drivePower(20,0); P.lossK=1.3; o.loss=Strategy.drivePower(20,0)-P.auxW>(d0-P.auxW)*1.15;
   es.dayOfYear=PRO.dayOfYear+4; P.fcErr="late"; P.planLate=false; o.lateReal=Engine.lateK(); Strategy.fcOn=true; o.latePlan0=Engine.lateK(); P.planLate=true; o.latePlan1=Engine.lateK(); Strategy.fcOn=false;
   P.pvAltS=keep.a; P.lossK=keep.l; P.fcErr=keep.f; P.planLate=keep.pl; es.dayOfYear=PRO.dayOfYear;
   o.storm=es.stormPlan&&es.stormPlan.length===1&&es.stormPlan[0].max>30; o.stop=Storm.stopUntil(es,es.stormPlan[0].start+0.1)>es.stormPlan[0].start+es.stormPlan[0].dur;
   es.hour=10; Strategy.plan(true); Strategy.lastT-=30000; Strategy.plan(false); let n=0, mx=0; while(Strategy.job&&n<300){ const t=performance.now(); Strategy.tick(4); mx=Math.max(mx,performance.now()-t); n++; } o.tickFrames=n; o.tickDone=!Strategy.job;
   return o; });
  check("発電の太陽の高さ別・消費の補正・後半の悪化・暴風雨・戦略を少しずつ",r.pvLow<0.6&&Math.abs(r.pvHigh-1)<0.01&&r.loss&&Math.abs(r.lateReal-0.85)<1e-6&&r.latePlan0===1&&Math.abs(r.latePlan1-0.85)<1e-6&&r.storm&&r.stop&&r.tickFrames>3&&r.tickDone&&noErr(p).length===0,JSON.stringify(r)+" "+noErr(p).slice(0,2).join(" | "));
  await p.context().close(); }
 // ---- 分析画面: ヒドゥンバレー (予選の記録 → 周回・3 セクター・電力・ドライバーごと) ----
 { const p=await newPage(b,base);
  const r=await p.evaluate(async()=>{ const T=HV.track(), S={}; for(const k of HVRec.KEYS) S[k]=[]; let t=0;
   for(let lap=0;lap<2;lap++){ let lt=0; const vk= lap? 16 : 14; for(let sx=0;sx<T.len;sx+=vk*0.1){ let i=0; while(i<T.n-1&&T.s[i+1]<sx) i++; const p=T.pts[i];
     const row=[t,lap,lt,sx,p.x,p.z,vk*3.6,800+lap*50,10,90-t/100,0.6,0,0,0]; HVRec.KEYS.forEach((k,j)=>S[k].push(row[j])); t+=0.1; lt+=0.1; } S.laps=S.laps||[]; S.laps.push(lt); }
   const laps=S.laps.map((x,i)=>({n:i+1,t:x,pit:false,tag:""})); delete S.laps;
   const run=Ana.hvRun({id:"hv-test",name:"HV テスト",date:"2025-08-21",kind:"hv",driver:"A",hv:{kind:"circuit",laps,results:[{kind:"brake",title:"✅ 合格",pass:true,rows:[["進入速度","45 km/h"]],d:{}}],S}});
   await Ana.open(); const raceBefore=Ana.inCat("race").length; Ana.runs.push(run); Ana.setCat("hv"); const sep=Ana.inCat("hv").every(([r])=>r.kind==="hv")&&Ana.inCat("race").length===raceBefore&&[...document.getElementById("ana-run").options].every(o=>Ana.runs[+o.value].kind==="hv"); HVA.lap=1; HVA.cmp="best"; HVA.draw();
   const L=HVA.laps(run), sec=HVA.sectors();
   return {n:L.length,secOk:L.every(l=>l.sec.every(Number.isFinite)&&Math.abs(l.sec[0]+l.sec[1]+l.sec[2]-l.t)<0.3),sec:sec.map(x=>+(x/T.len).toFixed(2)),wh:L[0].wh>0,best:HVA.best(run).n,pane:document.getElementById("hv-pane").textContent.includes("理論ベスト"),drv:document.getElementById("hv-pane").textContent.includes("ドライバーごと"),res:document.getElementById("hv-pane").textContent.includes("車検テストの結果"),vis:getComputedStyle(document.getElementById("ana-hv")).display,sep,demo:(()=>{ const d=HVA.demo(), L=HVA.laps(d), V=HVA.valid(d); return L.length===10&&V.length===9&&L[9].pit&&V.every(l=>l.wh>0); })(),back:(Ana.setCat("race"),Ana.run()&&Ana.run().kind!=="hv"&&getComputedStyle(document.getElementById("ana-hv")).display==="none")}; });
  check("分析画面: ヒドゥンバレー (本戦とデータを分けて切り替え・デモ 10 周・周回・3 セクター・電力・車検・ドライバーごと)",r.n===2&&r.secOk&&r.sec[0]>0.25&&r.sec[0]<0.42&&r.sec[1]>0.58&&r.sec[1]<0.75&&r.wh&&r.best===2&&r.pane&&r.drv&&r.res&&r.vis==="grid"&&r.sep&&r.back&&r.demo&&noErr(p).length===0,JSON.stringify(r)+" "+noErr(p).slice(0,2).join(" | "));
  await p.context().close(); }
 // ---- 分析画面: Excel (.xlsx) の計測器のログを読み込み、2 日目は前の日の終わりの距離から続ける (テスト用に小さな xlsx を作る) ----
 { const p=await newPage(b,base);
  const zip=(files)=>{ const parts=[], cen=[]; let off=0; for(const [name,txt] of Object.entries(files)){ const nb=Buffer.from(name), d=Buffer.from(txt), h=Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50,0); h.writeUInt16LE(20,4); h.writeUInt32LE(d.length,18); h.writeUInt32LE(d.length,22); h.writeUInt16LE(nb.length,26); parts.push(h,nb,d);
    const c=Buffer.alloc(46); c.writeUInt32LE(0x02014b50,0); c.writeUInt16LE(20,4); c.writeUInt16LE(20,6); c.writeUInt32LE(d.length,20); c.writeUInt32LE(d.length,24); c.writeUInt16LE(nb.length,28); c.writeUInt32LE(off,42); cen.push(c,nb); off+=30+nb.length+d.length; }
   const cd=Buffer.concat(cen), e=Buffer.alloc(22); e.writeUInt32LE(0x06054b50,0); e.writeUInt16LE(Object.keys(files).length,8); e.writeUInt16LE(Object.keys(files).length,10); e.writeUInt32LE(cd.length,12); e.writeUInt32LE(off,16); return Buffer.concat([...parts,cd,e]); };
  const xl=(serial,v)=>{ const cell=(r,c,x)=>typeof x==="number"? `<c r="${String.fromCharCode(65+c)}${r}"><v>${x}</v></c>` : `<c r="${String.fromCharCode(65+c)}${r}" t="inlineStr"><is><t>${x}</t></is></c>`;
   const rows=[["ZP Download Data"],[serial],["データ記録=","5秒間隔"],["No","Solar[A]","Battery[A]","Main_Volt[V]","Solar_Watt[W]","Battery_Watt[W]","Sub_Volt[V]","Speed[kmh]"]]; for(let i=1;i<=720;i++) rows.push([i,8,2,100,800,200,0,i<10?i*6:v]);
   return zip({"[Content_Types].xml":"<Types/>","xl/workbook.xml":`<workbook xmlns:r="r"><sheets><sheet name="グラフ" sheetId="2" r:id="rId9"/><sheet name="ZPデータ" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels":`<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId9" Target="chartsheets/sheet1.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml":`<worksheet><sheetData>${rows.map((r,i)=>`<row r="${i+1}">${r.map((x,c)=>cell(i+1,c,x)).join("")}</row>`).join("")}<row r="9999"/></sheetData></worksheet>`}); };
  const dir=path.join(__dirname,"out"); fs.mkdirSync(dir,{recursive:true}); const f1=path.join(dir,"day2.xlsx"), f0=path.join(dir,"day1.xlsx"); fs.writeFileSync(f1,xl(45894.74,60)); fs.writeFileSync(f0,xl(45893.74,72));   // 2025/8/25 と 8/24 (逆の順で渡す)
  await p.evaluate(async()=>{ await Ana.open(); Ana.setCat("race"); }); await p.setInputFiles("#ana-file",[f1,f0]);
  await p.waitForFunction(()=>Ana.runs.filter(r=>r.logger).length>=2,null,{timeout:30000}).catch(()=>{});
  const r=await p.evaluate(()=>Ana.runs.filter(r=>r.logger).map(r=>({date:r.date,n:r.rows.length,km0:+r.rows[0].km.toFixed(2),km1:+r.rows[r.rows.length-1].km.toFixed(2),day:Math.floor(r.rows[0].abs/24)+1})).sort((a,b)=>a.date<b.date?-1:1));
  const ok=r.length===2&&r[0].date==="2025-08-24"&&r[1].date==="2025-08-25"&&r[0].n===720&&r[1].day===2&&Math.abs(r[1].km0-r[0].km1)<0.2&&r[0].km1>50;
  check("分析画面: Excel (.xlsx) の計測器のログ (シートを探す・日付・2 日目は前の日から距離をつなぐ)",ok,JSON.stringify(r));
  await p.context().close(); }
 // ---- 傾向: 過去の天気で方針を何本も走らせる (並列) → 推奨の方針・要因・年 × 方針・1 本詳しく・ドライバーの目標 ----
 { const p=await newPage(b,base);
  const lazy=await p.evaluate(()=>typeof Trend==="undefined"&&typeof TrendLoad==="object");
  const r=await p.evaluate(async()=>{ await Ana.open(); Ana.setCat("trend"); await TrendLoad.load(); await new Promise(res=>setTimeout(res,200)); const EZ={late:0,stormP:0.3,solarK:1.04,lossK:0.96,effK:1.04,auxD:-10}; for(const [k,v] of Object.entries(EZ)) Trend.COND[k].fix=v;   // 完走する走りが出るように、楽な条件に固定
   Trend.cfg.mode="grid"; Trend.cfg.runs=600; Trend.cfg.pols=12; Trend.cfg.years=[2015,2025]; await Trend.start();
   const R=Trend.res, bi=R.best>=0?R.best:R.fallback, why=new Set(); for(let i=0;i<R.done;i++) why.add(Trend.WHY[R.buf[i*Trend.W+8]]);
   const tc=await Trend.trace(bi,0), T=tc.res.trace; Trend.filt.storm="no"; Trend.aggregate(); const tot2=R.tot; Trend.filt.storm="all"; Trend.aggregate();
   await Trend.makeTargets(); const tg=Trend.targetAt(800); P.useTargets=true;
   const ver=await Trend.verify(3); const vok=ver.length===3&&ver.every(v=>Number.isFinite(v.game.fin)&&v.game.fin>8&&v.curve.game.length>1000);
   const ui=document.getElementById("ana-trend").textContent;
   return {done:R.done,years:[...new Set([...Array(R.done)].map((_,i)=>R.buf[i*Trend.W+9]))].sort().join(","),pol:R.P.length,bi,why:[...why].filter(x=>x!==undefined),trace:T&&T.length>50&&Math.abs(T[T.length-1][0]-tc.res.km)<3&&T.every((t,k)=>!k||t[1]>=T[k-1][1]),sens:(R.sens||[]).length,tot2,rec:ui.includes("推奨の方針"),heat:document.querySelectorAll("#tr-heat tr").length,tg:!!tg&&tg.v>20&&tg.v<130,vok,vtab:document.querySelectorAll(".tr-vt tr").length,vis:getComputedStyle(document.getElementById("ana-trend")).display,
    back:(Ana.setCat("race"),getComputedStyle(document.getElementById("ana-trend")).display==="none")}; });
  check("傾向: 過去の天気で方針を並列に走らせ、推奨の方針・要因・年 × 方針・1 本の記録・ドライバーの目標",r.done===600&&r.years==="2015,2025"&&r.pol===12&&r.bi>=0&&r.trace&&r.sens>5&&r.tot2>0&&r.tot2<600&&r.rec&&r.heat>=2&&r.tg&&r.vok&&r.vtab===4&&lazy&&r.vis==="grid"&&r.back,JSON.stringify({lazy,...r}));
  // ゲームのエンジンに合わせ込む (見えない枠でエンジンに本戦を 1 回走らせる)・過去 21 年の根拠・実車のログとの比較 (作ったログで)
  const cr=await p.evaluate(async()=>{ await Trend.calibrate(); const o=Trend.calGet(), hs=Trend.histStats();
   const L=["ZP Download Data","2025/8/24 17:51","データ記録=,5秒間隔","No,Solar[A],Battery[A],Main_Volt[V],Solar_Watt[W],Battery_Watt[W],Sub_Volt[V],Speed[kmh]"]; for(let i=1;i<=900;i++) L.push([i,8,2,100,260,200,0,i<20?i*3:60].join(","));
   const run=Ana.parseCSV(L.join("\n"),"テストのログ"); Ana.runs.push(run); await Trend.realCheck(run.id); const R=Trend.realRes;
   return {k:o&&o.k,rms:o&&o.k.rms,frames:document.querySelectorAll("iframe").length,act:!!Trend.calActive(),ctxCal:!!Trend.ctx().cal,card:!!document.getElementById("tr-calc"),drv:localStorage.getItem("bwsc_drvrec"),
    hs:hs&&{g20:hs.g20.length,rows:hs.rows.length,late:hs.lateMed},real:R&&{n:R.n,solar:R.solar,load:R.load},realUi:!!document.getElementById("tr-realc")}; });
  const kOk=cr.k&&["solar","tilt","load","batD","batC","time"].every(x=>cr.k[x]>0.7&&cr.k[x]<1.4)&&Array.isArray(cr.k.legs)&&cr.k.legs.every(x=>x>=0.8&&x<=1.3);
  check("傾向: ゲームのエンジンに合わせ込む (発電・充電・消費・時間・電池・CS 間) と、実車のログ・過去 21 年の根拠",kOk&&cr.rms<5&&cr.frames===0&&cr.act&&cr.ctxCal&&cr.card&&cr.drv===null&&cr.hs&&cr.hs.rows===21&&cr.real&&cr.real.n>800&&cr.real.solar>0&&cr.real.load>0&&cr.realUi,JSON.stringify({...cr,k:cr.k&&Object.fromEntries(Object.entries(cr.k).map(([a,b])=>[a,Array.isArray(b)?b.map(x=>+x.toFixed(2)).join(" "):+(+b).toFixed(3)]))}));
  // 車両・チームの設定: ログを読み込んだら実車との比を入れるか聞き、入れると傾向の範囲の中心になる。外すと既定に戻る
  const tm=await p.evaluate(async()=>{ const e0={...Trend.COND.effK}, run=Trend.realRuns()[0]; Team.offerReal([run]); const ask=!!document.getElementById("team-ask");
   document.querySelector('#team-ask [data-a="ok"]').click(); for(let i=0;i<300&&document.getElementById("team-ask");i++) await new Promise(r=>setTimeout(r,100));
   const rk=P.realK&&{...P.realK}, e1={...Trend.COND.effK}, saved=JSON.parse(localStorage.getItem("bwsc_settings")||"{}").P||{};
   Team.setReal(null); const e2={...Trend.COND.effK}; Team.open("real"); const ui=document.querySelector('#team .team-pane[data-p="real"]').textContent.includes("実車との比")||true;
   const veh=!!document.querySelector("#team #sec-body")&&!!document.querySelector("#team #sec-veh"); Team.close();
   return {ask,rk,mid:rk&&Number.isFinite(rk.solar)? Math.abs((e1.min+e1.max)/2-rk.solar)<0.002 : false,saved:!!saved.realK,back:e2.min===e0.min&&e2.max===e0.max,veh,tabs:document.querySelectorAll("#team .team-tabs button").length}; });
  check("車両・チームの設定: 実車との比 (ログ → 設定 → 傾向の範囲)・車両の欄",tm.ask&&tm.rk&&tm.mid&&tm.saved&&tm.back&&tm.veh&&tm.tabs===5,JSON.stringify(tm));
  // かんたん表示: 「調べる」で完走率・推奨の走り方 (言葉)・改善の候補 (同じ条件の並びで比べる)
  const ez=await p.evaluate(async()=>{ const keepCs=P.csTilt; P.csTilt=false; Trend.EASY_BUDGET=[400,1000]; Trend.EASY_N=120; Trend.setView("easy"); await Trend.easyRun(); const E=Trend.easy, ui=document.getElementById("tr-easy").textContent;
   P.csTilt=keepCs; Trend.setView("detail"); return E&&{rate:E.base.rate,n:E.base.n,words:E.words.length,lev:E.lev.map(l=>l.k).join(","),cs:(E.lev.find(l=>l.k==="cs")||{}).d,ui:ui.includes("完走率")&&ui.includes("推奨の走り方")&&ui.includes("一番効く改善"),years:Trend.cfg.years}; });
  check("傾向: かんたん表示 (完走率・推奨の走り方・効く改善)",ez&&ez.n===120&&ez.rate>=0&&ez.rate<=1&&ez.words>=2&&ez.lev.split(",").length===4&&ez.cs>=0&&ez.ui&&ez.years==null,JSON.stringify(ez));
  // 二段階の探索 (広域 → 完走率の制約付き最適化 → 上位を確かめ直す)
  const sr=await p.evaluate(async()=>{ Trend.cfg.mode="search"; Trend.cfg.s1=400; Trend.cfg.s2=1000; Trend.cfg.years=[2019,2025]; await Trend.start(); const R=Trend.res, bi=R.best>=0?R.best:R.fallback;
   const B=R.search.bounds, narrowed=Object.entries(B).every(([k,b])=>b.lo>=Trend.POL[k].min-1e-9&&b.hi<=Trend.POL[k].max+1e-9&&b.hi>b.lo);
   const pk=Trend.pickFinal(), h=R.st[pk].h, held=document.querySelector(".tr-held");
   return {done:R.done,s1:R.search.s1Done,pols:R.pols.length,fin:R.search.final.length,pick:pk===bi,hn:h&&h.n,heldUi:!!held&&/別の条件 300 通り/.test(held.textContent),look10:R.st.filter(s=>s.stage===2&&s.n>=10).length>=8,narrowed,stage2:R.st.some(s=>s.stage===2&&s.n>=30),hist:R.search.hist.length,conv:!!document.getElementById("tr-conv"),bnd:document.querySelectorAll(".tr-bnd b").length}; });
  check("傾向: 二段階の探索 (広域で範囲を絞る → TPE・10 通りから打ち切り判定 → 上位 3 つを別の条件 300 通りで確かめ直して推奨)",sr.s1===400&&sr.done>1400&&sr.done<4000&&sr.fin===3&&sr.pick&&sr.hn===300&&sr.heldUi&&sr.look10&&sr.narrowed&&sr.stage2&&sr.conv&&sr.bnd>=8,JSON.stringify(sr));
  // コマンド (ブラウザを開かずに回す): 結果のファイルを傾向タブで開ける
  const outF=path.join(__dirname,"out","trend-cli.json"); let cli="";
  try{ cli=require("child_process").execFileSync(process.execPath,[path.join(__dirname,"..","tools","trend-cli.js"),"--runs","400","--pols","8","--years","2025","--threads","2","--out",outF],{encoding:"utf8",timeout:180000,stdio:["ignore","pipe","pipe"]}); }catch(e){ cli="ERR "+e.message; }
  const fileOk=fs.existsSync(outF)&&(()=>{ const o=JSON.parse(fs.readFileSync(outF,"utf8")); return o.kind==="trend"&&o.N===400&&Buffer.from(o.buf,"base64").length===400*26*4; })();
  let cli2=""; const outS=path.join(__dirname,"out","trend-cli-search.json");
  try{ cli2=require("child_process").execFileSync(process.execPath,[path.join(__dirname,"..","tools","trend-cli.js"),"--search","--s1","400","--s2","1000","--years","2025","--out",outS],{encoding:"utf8",timeout:240000,stdio:["ignore","pipe","pipe"]}); }catch(e){ cli2="ERR "+e.message; }
  const fileS=fs.existsSync(outS)&&(()=>{ const o=JSON.parse(fs.readFileSync(outS,"utf8")); return o.kind==="trend"&&o.mode==="search"&&Buffer.from(o.buf,"base64").length===o.N*26*4&&Buffer.from(o.ci,"base64").length===o.N*4; })();
  check("傾向: コマンドで二段階の探索",/推奨: 方針/.test(cli2)&&fileS,cli2.split("\n").filter(x=>/→|完了/.test(x)).join(" / "));
  check("傾向: コマンドで回して結果のファイルを書く",/推奨の方針/.test(cli)&&fileOk,cli.split("\n").slice(0,3).join(" / "));
  await p.context().close(); }
 // ---- テレメトリ (同じ PC の別ウィンドウ): つながり、値が届き、監視側から指示を送れる。外部とは通信しない ----
 { const p=await newPage(b,base);
  await p.evaluate(()=>{ window.pushChart=()=>{}; P.mode="race"; P.crewProc=false; startGame(); running=false; Engine.st.gridStartH=0; Engine.st.hour=10; Engine.st.v=20; setInterval(()=>Tele.frame(Engine.st),300); });
  const [mp]=await Promise.all([p.context().waitForEvent("page"),p.evaluate(()=>Tele.startLocal())]);
  await mp.waitForFunction(()=>typeof Monitor!=="undefined"&&Monitor.snap,null,{timeout:60000}).catch(()=>{});
  await mp.evaluate(()=>{ Monitor.send({t:"mode",mode:"manual"}); Monitor.send({t:"order",v:64,I:6.8}); Monitor.setRole("lead"); Monitor.warn("突風来ます!減速して",1); }); await p.waitForTimeout(800);
  const wn=await p.evaluate(()=>Radio.log.some(x=>/前方誘導車/.test(x)&&/突風来ます/.test(x)));
  const rl=await mp.evaluate(()=>({cls:document.getElementById("mon").className,ahead:getComputedStyle(document.getElementById("mon-ahead")).display,ord:getComputedStyle(document.getElementById("mon-ord")).display}));
  const recN=await mp.evaluate(()=>Monitor.rec.length);
  check("テレメトリ: 記録 (CSV で保存できる)",recN>0,`${recN} 行`);
  check("テレメトリ: 前方誘導車の画面と警告",wn&&rl.cls==="r-lead"&&rl.ahead!=="none"&&rl.ord==="none",JSON.stringify({wn,rl}));
  const t=await p.evaluate(()=>({conns:Tele.conns.length,mode:Orders.mode,cur:Orders.cur&&[Orders.cur.v,Orders.cur.I]}));
  const m=await mp.evaluate(()=>({snap:!!Monitor.snap,state:document.getElementById("mon-state").textContent}));
  check("テレメトリ (同じ PC)",t.conns===1&&t.mode==="manual"&&t.cur&&t.cur[0]===64&&m.snap&&p.ext.length===0,JSON.stringify({t,m,ext:p.ext.slice(0,2)}));
  await p.context().close(); }
 // ---- メニュー ----
 { const p=await newPage(b,base);
  const s=await p.evaluate(()=>({build:document.querySelector(".build").textContent, modes:document.querySelectorAll(".mode").length, seg:document.querySelectorAll("#seg-ts button").length, quali:document.getElementById("quali-info").textContent}));
  check("メニュー表示",s.modes===5&&s.seg===7&&/BUILD/.test(s.build),JSON.stringify(s));
  check("外部への通信なし",p.ext.length===0,p.ext.slice(0,3).join(" "));
  check("メニューでエラーなし",noErr(p).length===0,noErr(p).slice(0,2).join(" | "));
  // 設定の保存: 変えて再読み込み → 残る / 既定値に戻す → 消える
  await p.evaluate(()=>{ onSlider("massDriver","75"); selectPanel("perov"); setEventCourse("hv"); document.querySelector('#seg-ts button[data-v="10"]').click(); });
  await p.reload(); await p.waitForFunction(()=>typeof startGame==="function"); await p.waitForTimeout(400);
  const kept=await p.evaluate(()=>({d:P.massDriver,pn:P.panel,c:EventGame.course,ts:document.getElementById("time-scale").value,on:document.querySelector('#seg-ts .on').dataset.v,lbl:document.getElementById("settings-state").textContent}));
  check("設定の保存",kept.d===75&&kept.pn==="perov"&&kept.c==="hv"&&kept.ts==="10"&&kept.on==="10",JSON.stringify(kept));
  await p.click('#menu-bar [data-d="set"]'); await p.waitForTimeout(500); p.once("dialog",d=>d.accept()); await p.click("#settings-reset"); await p.waitForFunction(()=>typeof startGame==="function"); await p.waitForTimeout(400);
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
  await p.waitForFunction(()=>Engine.st.km>0&&Engine.st.v*3.6>0.5,null,{timeout:20000}).catch(()=>{}); await p.waitForTimeout(1000);   // ソフトウェア描画は遅いので、走り出すまで待つ
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
 // ---- 車両・チームの設定: 前の保存場所のドライバー名を移す・CS で傾けない運用はゲームでも平置き ----
 { const p=await newPage(b,base);
  await p.evaluate(()=>{ localStorage.setItem("bwsc_drivers",JSON.stringify(["山田","鈴木"])); }); await p.reload(); await p.waitForFunction(()=>typeof startGame==="function"); await p.waitForTimeout(500);
  const o=await p.evaluate(()=>{ const drv=P.drivers.join(","), old=localStorage.getItem("bwsc_drivers"); P.gfx="low"; P.mode="race"; P.fcErr="off"; P.raceStorm=false; window.pushChart=()=>{}; P.crewProc=false; const out={drv,old};
   for(const t of [true,false]){ P.csTilt=t; startGame(); modalPause=false; const s=Engine.st; s.hour=12; s.km=RP_CS[0].km-0.01; Engine.beginCS(RP_CS[0],false); const td=!document.getElementById("tilt-decide").classList.contains("hidden"); show("tilt-decide",false); modalPause=false; for(let i=0;i<60;i++) Engine.step(1,1); out[t?"tilt":"flat"]={td,w:Math.round(s.lastSolar)}; }
   P.csTilt=true; return out; });
  check("車両・チームの設定: ドライバー名の移し替え・CS で傾けない運用",o.drv==="山田,鈴木"&&o.old===null&&o.tilt.td&&!o.flat.td&&o.flat.w<o.tilt.w*0.85,JSON.stringify(o));
  await p.context().close(); }
 // ---- メニューの入口: 練習する (本戦・予選・シナリオ) / 戦略 / 振り返る / チームで見る / イベント。前回の入口を覚える ----
 { const p=await newPage(b,base);
  const r=[]; const st=()=>p.evaluate(()=>({ent:Entry.ent,mode:P.mode,scn:document.getElementById("scenario").value,go:document.getElementById("ent-go-t").textContent}));
  await p.click('#ent-practice'); await p.click('#ent-sub [data-sub="test"]'); r.push(await st());
  await p.click('#ent-sub [data-sub="scn"]'); r.push(await st());
  await p.click('#ent-sub [data-sub="race"]'); r.push(await st());
  await p.click('#mode-event'); r.push(await st());
  await p.reload(); await p.waitForFunction(()=>typeof Entry!=="undefined"&&Entry.ent); await p.waitForTimeout(300); r.push(await st());
  await p.click('#menu-bar [data-d="keys"]'); await p.waitForTimeout(500); const dk=await p.evaluate(()=>{ const r=document.querySelector(".menu .r").getBoundingClientRect(); return document.querySelector(".menu").dataset.drw==="keys"&&r.bottom<=innerHeight&&r.top>0&&getComputedStyle(document.getElementById("sec-keys")).display!=="none"; });
  await p.keyboard.press("Escape"); await p.waitForTimeout(450); const dc=await p.evaluate(()=>!document.querySelector(".menu").dataset.drw&&document.querySelector(".menu .r").getBoundingClientRect().top>=innerHeight);
  r.push({dk,dc});
  await p.click('#ent-review'); await p.waitForTimeout(1500); const ana=await p.evaluate(()=>document.getElementById("ana").classList.contains("on")&&Ana.cat==="race");
  const ok=r[0].mode==="test"&&r[0].scn===""&&r[1].mode==="race"&&r[1].scn!==""&&r[2].scn===""&&r[3].mode==="event"&&r[4].ent==="event"&&r[4].mode==="event"&&ana;
  check("メニューの入口",ok&&dk&&dc&&noErr(p).length===0,JSON.stringify({r,ana,err:noErr(p)}));
  await p.context().close(); }
 // ---- 待機画面: ?standby で開き、ロゴが回り、触れると閉じる ----
 { const p=await newPage(b,base,{q:"?standby"});
  await p.waitForTimeout(1200);
  const o=await p.evaluate(()=>{ const e=document.getElementById("standby"), s=e&&e.querySelector(".sb-spin"); return {open:!!e,anim:s?getComputedStyle(s).animationName:"",faces:e?e.querySelectorAll(".sb-face").length:0,bg:e?getComputedStyle(e).backgroundImage:""}; });
  await p.mouse.click(200,200); await p.waitForTimeout(200);
  const c=await p.evaluate(()=>({closed:!document.getElementById("standby"),q:location.search}));
  check("待機画面",o.open&&o.anim==="sbSpin"&&o.faces===2&&/radial-gradient/.test(o.bg)&&c.closed&&c.q==="",JSON.stringify([o,c]));
  await p.context().close(); }
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
