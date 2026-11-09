"use strict";
/* 通しの耐久テスト: 描画なしでエンジンだけを動かし、Darwin から Adelaide まで全行程を早送りで走らせる。
 簡単な自動運転: 戦略班の速度指示 (Orders) に合わせてアクセルを調整し、CS とドライバー交代の地点では止まる。
 毎ステップ、電池・位置・時刻・他チームが壊れた値になっていないかを調べ、最後にゴール (またはトレーラー) まで行けたかを見る。
 実行: npm run test:long  (気候値の天気・実際の天気の 2 通り) */
const http=require("http"), fs=require("fs"), path=require("path");
const {chromium}=require("playwright");
const ROOT=path.resolve(__dirname,"..");
const TYPES={".html":"text/html",".js":"application/javascript",".css":"text/css",".svg":"image/svg+xml",".woff2":"font/woff2",".json":"application/json",".gpx":"application/xml",".png":"image/png"};
function serve(){ return new Promise(res=>{ const s=http.createServer((q,r)=>{ let p=decodeURIComponent(q.url.split("?")[0].split("#")[0]); if(p.endsWith("/")) p+="index.html";
  const f=path.join(ROOT,p); if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){ r.writeHead(404); r.end(); return; }
  r.writeHead(200,{"Content-Type":TYPES[path.extname(f)]||"application/octet-stream"}); fs.createReadStream(f).pipe(r); }); s.listen(0,"127.0.0.1",()=>res(s)); }); }
let failed=0; const out=[];
function check(name,ok,info){ out.push(`${ok?"PASS":"FAIL"}  ${name}${info?"  ("+info+")":""}`); if(!ok) failed++; }
(async()=>{
 const srv=await serve(), base=`http://127.0.0.1:${srv.address().port}/`, T0=Date.now();
 const b=await chromium.launch({args:["--use-gl=swiftshader","--enable-webgl","--ignore-gpu-blocklist"]});
 try{
 for(const real of [false,true]){
  const p=await b.newPage(); const errs=[]; p.on("pageerror",e=>errs.push(e.message));
  await p.goto(base+"index.html"); await p.waitForFunction(()=>typeof startGame==="function"); await p.waitForTimeout(300);
  const r=await p.evaluate(async(real)=>{
   window.pushChart=()=>{}; P.gfx="low"; P.mode="race"; P.event=false; P.crewProc=false; P.realWeather=real; P.fcErr="mid"; P.tts="off";
   document.getElementById("time-scale").value="60"; startGame(); running=false;   // 描画のループを止めて、エンジンだけを回す
   const es=Engine.st; es.gridStartH=8; StopMenu.active=false;
   const bad=[], note=(m)=>{ if(bad.length<8) bad.push(m); };
   let overKm=0, overNoted=false, prevKm=es.km, prevAbs=0, steps=0, orders=0, cs=0, maxSpd=0, minSoc=1, lastOrder=null;
   const dc=RP_RULES.driverChange, DT=6, DR=0.1, ECO_TOP=Strategy.topSpeed(false);
   while(steps<200000&&!es.finished&&!es.crashed&&!es.fire){
    steps++;
    // 目標の速度: 指示 → CS / ドライバー交代の手前では止まる
    let vt= Orders.cur? Orders.cur.v : 70;
    vt=Math.min(vt,speedLimitAt(es.km+0.3),speedLimitAt(es.km));   // 制限速度は守る
    const nextCS=RP_CS.find(c=>!es.passedCP.has(c.km)&&c.km>es.km-0.07);
    for(let d=0.25;d<=2;d+=0.25) vt=Math.min(vt,speedLimitAt(es.km+d)+d*25);   // 先の制限: 距離に応じて手前から減速
    if(es.hour>=16.95&&es.hour<17.5) vt=0;   // 17:00 で止まる (延長しない)
    if(nextCS&&nextCS.km-es.km<0.6) vt= nextCS.km-es.km<0.05? 0 : 20;
    if(!es.dcDone&&dc.km-es.km<0.6&&es.km<dc.km+dc.len){ vt= es.km>=dc.km-0.01? 0 : 20; View.lateral=-View.ROAD_W-2; } else View.lateral=-2.4;
    const kmh=es.v*3.6, e=vt-kmh; es.powerMode= vt>ECO_TOP-2;   // ECO で出せない速度の指示は POWER で
    if(vt===0){ es.throttleSet=0; es.brakePhys=1; } else { es.brakePhys= e<-4? clamp(-e/15,0.2,1) : 0; if(e<-4) es.throttleSet=Math.min(es.throttleSet,0.1); es.throttleSet=clamp(es.throttleSet+0.004*e,0,1); }
    if(modalPause){ modalPause=false; if(typeof TiltDecide!=="undefined"&&TiltDecide.close) try{ TiltDecide.close(); }catch(x){} }
    Engine.step(DT,DR); Orders.frame(es,DR);   // ゲームと同じ ×60 (実時間 0.1 秒 = 6 秒)
    { const T=window._tb||(window._tb={}); const k= es.camp?"camp": es.stopTimer>0?"stop:"+es.stopKind : es.v>1?"move": (es.hour>=17||es.hour<8)?"night": (Crew.locked&&Crew.locked())?"crew": "idle"; T[k]=(T[k]||0)+DT/3600;
      window._cl=window._cl||[]; if(es.camp!==window._pc){ window._pc=es.camp; if(window._cl.length<12) window._cl.push((es.camp?"on ":"off ")+"D"+es.day+" "+es.hour.toFixed(2)+" "+es.km.toFixed(0)); }
      window._smp=window._smp||[]; if(es.day===2&&Math.abs(es.hour-12)<0.006&&window._smp.length<1) window._smp.push({km:es.km.toFixed(1),v:kmh.toFixed(1),vt,thr:es.throttleSet.toFixed(2),amp:es.lastAmp.toFixed(1),lim:speedLimitAt(es.km),brk:es.brakePhys,ord:Orders.cur&&Orders.cur.v,soc:es.soc.toFixed(2),bms:es.bmsOn,pm:es.powerMode,maxA:motorMaxA(es.powerMode)});
      if(k==="idle"&&!window._idle) window._idle={km:es.km.toFixed(2),h:es.hour.toFixed(2),thr:es.throttleSet,vt,v:es.v,brk:es.brakePhys,gw:Engine.gridWait()}; }
    if(Orders.cur&&Orders.cur!==lastOrder){ lastOrder=Orders.cur; orders++;
     const o=Orders.cur; let lm=999; for(let k=o.k0;k<o.k1-0.06;k+=0.05) lm=Math.min(lm,speedLimitAt(k)); if(o.v>lm) note(`指示 ${o.v} km/h が制限 ${lm} を超える (${o.k0.toFixed(1)}〜${o.k1.toFixed(1)} km)`); }
    if(es.stopKind==="cp"&&es.stopTimer>0&&es.stopTimer>30*60-DT-1) cs++;
    const abs=(es.day-1)*24+es.hour;
    // 壊れた値・おかしな動き
    if(![es.km,es.v,es.soc,es.hour].every(Number.isFinite)) note(`NaN at step ${steps}: km ${es.km} v ${es.v} soc ${es.soc}`);
    if(es.soc<-1e-6||es.soc>1+1e-6) note(`SOC ${es.soc.toFixed(3)} at ${es.km.toFixed(1)} km`);
    if(es.km<prevKm-1e-6) note(`km went back ${prevKm.toFixed(2)} → ${es.km.toFixed(2)}`);
    if(abs<prevAbs-1e-6) note(`time went back at ${es.km.toFixed(1)} km`);
    // 制限速度 +15 km/h を 1 km 以上続けて超えたら異常 (切り替わりの瞬間の減速遅れは自動運転側の都合なので数えない)
    if(kmh>speedLimitAt(es.km)+15){ overKm+=es.km-prevKm; if(overKm>1&&!overNoted){ overNoted=true; note(`${kmh.toFixed(0)} km/h over limit ${speedLimitAt(es.km)} for 1 km at ${es.km.toFixed(1)} km`); } } else { overKm=0; overNoted=false; }
    for(const tm of es.teams) if(!Number.isFinite(tm.km)||tm.km<0||tm.km>TOTAL_KM+1e-6||!(tm.soc>=0&&tm.soc<=1)){ note(`team ${tm.name} km ${tm.km} soc ${tm.soc}`); break; }
    prevKm=es.km; prevAbs=abs; maxSpd=Math.max(maxSpd,kmh); if(es.soc<minSoc){ minSoc=es.soc; window._minAt=`${es.km.toFixed(0)} km D${es.day} ${es.hour.toFixed(2)} 指示 ${Orders.cur?Orders.cur.v:'-'} 実 ${kmh.toFixed(0)} 天気 ${es.weather?es.weather.type:'晴'}`; }
    if(es.day>9){ note("day > 9"); break; }
    window._dayKm=window._dayKm||{}; window._dayKm[es.day]=es.km.toFixed(0);
    if(steps%5000===0) await new Promise(r=>setTimeout(r,0));   // 画面を固めない
   }
   const H=Orders.summary(), fin=es.teams.filter(t=>t.status==="fin").length, dnf=es.teams.filter(t=>t.status==="dnf").length;
   const avgV=TOTAL_KM/Math.max(0.1,es.drivingHours);
   return {minAt:window._minAt,smp:window._smp,cl:window._cl,tb:window._tb,idle:window._idle,avgV,drv:es.drivingHours,penalty:es.penaltySec,dayKm:window._dayKm,steps,km:es.km,finished:es.finished,totalKm:TOTAL_KM,trailer:!es.competing,day:es.day,hour:es.hour,minSoc,maxSpd,orders,cs,passed:es.passedCP.size,
    ordersHist:H?H.n:0,trailerWhy:Radio.log.map(x=>x.replace(/<[^>]+>/g,"")).filter(x=>/トレーラー/.test(x)).slice(0,2),teamsFin:fin,teamsDnf:dnf,teamsMax:Math.max(...es.teams.map(t=>t.km)),bad,penalty:es.penaltySec};
  },real);
  const tag=real?"実際の天気":"気候値の天気";
  check(`${tag}: 壊れた値・おかしな動きなし`,r.bad.length===0&&errs.length===0,(r.bad.concat(errs)).slice(0,4).join(" | "));
  check(`${tag}: ゴールまで走れる`,r.finished||r.km>=r.totalKm-1,`${r.km.toFixed(1)} km・Day${r.day} ${r.hour.toFixed(2)}・${r.trailer?"トレーラーあり":"自走"}・最低 SOC ${(r.minSoc*100).toFixed(1)} % (${r.minAt})・ステップ ${r.steps}・平均 ${r.avgV.toFixed(1)} km/h・走行 ${r.drv.toFixed(1)} h・日ごと ${JSON.stringify(r.dayKm)}${r.trailerWhy.length?"・"+r.trailerWhy.join(" / "):""}`);
  check(`${tag}: CS 9 か所を通過`,r.passed>=9,`通過 ${r.passed}`);
  check(`${tag}: 速度指示が出続ける`,r.orders>=200&&r.ordersHist>=50,`指示 ${r.orders} 回・採点 ${r.ordersHist} 区間`);
  check(`${tag}: 他チームが進む`,r.teamsMax>2000&&r.teamsFin+r.teamsDnf>=1,`先頭 ${r.teamsMax.toFixed(0)} km・ゴール ${r.teamsFin}・リタイア ${r.teamsDnf}`);
  await p.close();
 }
 } catch(e){ check("テスト実行",false,e.message); }
 await b.close(); srv.close();
 console.log(out.join("\n")); console.log(`\n${out.length-failed}/${out.length} 件成功 (${((Date.now()-T0)/1000).toFixed(0)} 秒)`);
 process.exit(failed?1:0);
})();
