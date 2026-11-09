#!/usr/bin/env node
"use strict";
/* 傾向: ブラウザを開かずに、速い計算 (js/trend-worker.js) を CPU のコア数ぶん並列に回す
 使い方:
  node tools/trend-cli.js --runs 200000 --pols 400
  node tools/trend-cli.js --ctx trend-ctx.json --runs 500000          (傾向タブの「コマンド用の設定を書き出す」で作ったファイル: この端末の車両の値・変える要素の範囲)
 主なオプション:
  --runs N      本数 (上限なし。既定 100000)        --pols K   方針の数 (既定 200)
  --years 2010-2025 / 2015,2020,2025 (既定: 全部)  --thr 0.9  完走率の下限
  --threads T   並列の数 (既定: コア数 − 1)          --seed S   方針の乱数の種
  --out FILE    結果のファイル (既定: tools/trend-out/trend-日時.json)。傾向タブの「結果ファイルを読み込む」で開ける
 --ctx が無いときは、ゲームの既定の車両の値 (と、あれば js/data/vehicle-private.js) を、裏で開いたブラウザ (Playwright) から取る */
const fs=require("fs"), path=require("path"), os=require("os"), vm=require("vm"), http=require("http"), { Worker }=require("worker_threads");
const ROOT=path.dirname(__dirname);
const A={}; for(let i=2;i<process.argv.length;i++){ const a=process.argv[i]; if(a.startsWith("--")){ const k=a.slice(2), v=process.argv[i+1]; if(v==null||v.startsWith("--")) A[k]=true; else { A[k]=v; i++; } } }
if(A.help||A.h){ console.log(fs.readFileSync(__filename,"utf8").split("*/")[0].replace(/^[\s\S]*?\/\*/,"")); process.exit(0); }
const W=25, WHY=["","電池切れ","Day6 17 時までにゴールできない","暴風雨で横転","Day1 の日没までに Katherine に着けない","CS の締め切りに遅れた","天気のデータなし"];
const N=Math.max(100,Math.round(+A.runs||100000)), K0=Math.max(2,Math.round(+A.pols||200)), thr=+A.thr||0.9, nT=Math.max(1,Math.round(+A.threads||Math.max(1,os.cpus().length-1)));
const fmtH=(a)=>{ if(!Number.isFinite(a)) return "―"; const d=Math.floor(a/24)+1, h=a-(d-1)*24; return `D${d} ${Math.floor(h)}:${String(Math.floor(h%1*60)).padStart(2,"0")}`; };

/* 20 年分の天気 (js/data/weather-hist.js をそのまま読む) */
function loadHist(){ const box={}; vm.runInNewContext(fs.readFileSync(path.join(ROOT,"js/data/weather-hist.js"),"utf8").replace("var WEATHER_HIST","this.WEATHER_HIST"),box); return box.WEATHER_HIST; }
/* 方針の組: 傾向タブと同じ (ラテン超方格) */
function policies(POL,K,seed){ const keys=Object.keys(POL), perm={}; let x=seed||12345; const r=()=>((x=(x*16807)%2147483647)/2147483647);
 for(const k of keys){ const a=[...Array(K).keys()]; for(let i=K-1;i>0;i--){ const j=Math.floor(r()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } perm[k]=a; }
 return [...Array(K)].map((_,i)=>{ const o={}; for(const k of keys){ const d=POL[k], u=(perm[k][i]+r())/K; let v=d.fix!=null? d.fix : d.min+(d.max-d.min)*u; if(k==="replanH"||k==="stormLead"||k==="csExtra") v=Math.round(v); o[k]=v; } return o; }); }
/* ゲームから計算の元データを取る (裏でブラウザを開く) */
async function ctxFromGame(){
 let chromium; try{ ({chromium}=require("playwright")); }catch(e){ throw new Error("playwright がありません (npm install)。または --ctx で傾向タブから書き出した設定を渡してください"); }
 const MIME={".html":"text/html",".js":"application/javascript",".css":"text/css",".svg":"image/svg+xml",".woff2":"font/woff2",".png":"image/png",".json":"application/json"};
 const srv=http.createServer((q,r)=>{ let p=decodeURIComponent(q.url.split("?")[0]); if(p.endsWith("/")) p+="index.html"; const f=path.join(ROOT,path.normalize(p).replace(/^(\.\.[/\\])+/,""));
  if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){ r.writeHead(404); r.end(); return; } r.writeHead(200,{"Content-Type":MIME[path.extname(f)]||"application/octet-stream"}); fs.createReadStream(f).pipe(r); });
 await new Promise(res=>srv.listen(0,"127.0.0.1",res));
 const b=await chromium.launch(); try{ const p=await b.newPage(); await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await p.waitForFunction(()=>typeof TrendLoad==="object"&&typeof Strategy==="object",null,{timeout:60000});
  return await p.evaluate(async()=>{ await TrendLoad.load(); await Trend.loadHist(); const c=Trend.ctx(); c.pTab=[...c.pTab]; c.roll=[...c.roll]; c.loc=null; return {ctx:c,R:Trend.ranges(),POL:Trend.POL,src:"game"}; }); }
 finally{ await b.close(); srv.close(); } }

(async()=>{
 const t0=Date.now(), H=loadHist();
 let S; if(A.ctx){ S=JSON.parse(fs.readFileSync(A.ctx,"utf8")); if(S.kind!=="trend-ctx") throw new Error("--ctx は傾向タブの「コマンド用の設定を書き出す」のファイルです"); S.src=path.basename(A.ctx); }
 else { process.stderr.write("ゲームから車両の値を取得中…\n"); S=await ctxFromGame(); }
 const ctx=S.ctx; ctx.loc=H.loc; ctx.hours=H.hours; ctx.years={};
 const all=Object.keys(H.years).map(Number); let years=all;
 if(A.years){ const y=String(A.years); years= /^\d{4}-\d{4}$/.test(y)? all.filter(x=>x>=+y.slice(0,4)&&x<=+y.slice(5)) : y.split(",").map(Number).filter(x=>all.includes(x)); }
 if(!years.length) throw new Error("--years に当てはまる年がありません ("+all[0]+"〜"+all[all.length-1]+")");
 const K=Math.min(K0,Math.floor(N/10)), R=S.R, POL={}; for(const k of Object.keys(S.POL)) POL[k]={...S.POL[k],...(R[k]||{})};
 const pols=policies(POL,K,Math.round(+A.seed||((Date.now()%100000)+7))), condSeed=Math.round(+A.condSeed||(Math.random()*1e9))>>>0;
 const yearsData={}; for(const y of years) yearsData[y]=H.years[y];
 process.stderr.write(`${N.toLocaleString()} 本 (方針 ${K} × 条件 約 ${Math.floor(N/K)} 通り)・年 ${years[0]}〜${years[years.length-1]} (${years.length} 年)・並列 ${nT}・車両の値: ${S.src==="game"?"ゲームの既定 (+ 非公開ファイルがあればその値)":S.src}\n`);
 const src=fs.readFileSync(path.join(ROOT,"js/trend-worker.js"),"utf8");
 const boot=`const {parentPort,workerData}=require("worker_threads"); globalThis.self={postMessage:(m,t)=>parentPort.postMessage(m,t)}; require("vm").runInThisContext(workerData.src,{filename:"trend-worker.js"}); parentPort.on("message",d=>self.onmessage({data:d}));`;
 const buf=new Float32Array(N*W), CH=Math.max(500,Math.min(5000,Math.ceil(N/nT/16))); let next=0, done=0, lastLog=0;
 await new Promise((fin,fail)=>{ let alive=0;
  const give=(w)=>{ if(next>=N){ w.terminate(); if(--alive===0) fin(); return; } const n=Math.min(CH,N-next); w.postMessage({t:"job",i0:next,n,pols,R,years,condSeed,width:W}); next+=n; };
  for(let i=0;i<nT;i++){ const w=new Worker(boot,{eval:true,workerData:{src}}); alive++;
   w.on("message",(m)=>{ if(m.t==="ready"){ w.postMessage({t:"years",years:yearsData}); return; } if(m.t==="yearsOk"){ give(w); return; }
    if(m.t==="done"){ buf.set(m.buf,m.i0*W); done+=m.n; const now=Date.now(); if(now-lastLog>2000||done>=N){ lastLog=now; const rate=done/((now-t0)/1000); process.stderr.write(`\r${done.toLocaleString()} / ${N.toLocaleString()} 本  ${rate.toFixed(0)} 本/秒  残り約 ${((N-done)/rate/60).toFixed(1)} 分   `); } give(w); } });
   w.on("error",fail); w.postMessage({t:"ctx",ctx}); } });
 const time=(Date.now()-t0)/1000; process.stderr.write(`\n完了: ${time.toFixed(0)} 秒\n`);
 // 集計 (方針ごと)
 const P=pols.map(()=>({n:0,ok:0,f:[],why:{}})); let okAll=0;
 for(let i=0;i<N;i++){ const o=i*W, p=P[buf[o]]; p.n++; if(buf[o+1]){ p.ok++; okAll++; p.f.push(buf[o+2]); } else { const w=WHY[buf[o+8]]||"?"; p.why[w]=(p.why[w]||0)+1; } }
 const q=(a,f)=>a.length? a[Math.min(a.length-1,Math.floor(f*a.length))] : NaN;
 P.forEach(p=>{ p.f.sort((a,b)=>a-b); p.rate=p.n?p.ok/p.n:0; p.mean=p.f.length? p.f.reduce((a,x)=>a+x,0)/p.f.length : NaN; p.p10=q(p.f,0.1); p.p90=q(p.f,0.9); });
 const score=(p)=>{ const m=Number.isFinite(p.mean)?p.mean:999; return p.rate>=thr? -m : -1e6+p.rate*1e4-m*0.001; };
 const order=P.map((p,i)=>i).sort((a,b)=>score(P[b])-score(P[a])), best=order[0];
 console.log(`\n全体の完走率 ${(okAll/N*100).toFixed(1)} %。推奨の方針: ${P[best].rate>=thr?`完走率 ${(thr*100).toFixed(0)} % 以上でゴールが一番早い`:`完走率 ${(thr*100).toFixed(0)} % 以上が無い → 完走率が一番高い`}`);
 console.log("順位  方針   完走率   ゴール平均   早い1割 / 遅い1割   "+Object.keys(POL).join(" "));
 for(const [k,i] of order.slice(0,10).entries()){ const p=P[i], pl=pols[i]; console.log(`${String(k+1).padStart(3)}  #${String(i+1).padEnd(4)} ${(p.rate*100).toFixed(1).padStart(5)} %  ${fmtH(p.mean).padEnd(10)}  ${fmtH(p.p10)} / ${fmtH(p.p90)}   ${Object.keys(POL).map(k2=>+(+pl[k2]).toFixed(2)).join(" ")}`); }
 const why={}; for(const p of P) for(const [w,c] of Object.entries(p.why)) why[w]=(why[w]||0)+c;
 console.log("完走できなかった理由: "+(Object.entries(why).sort((a,b)=>b[1]-a[1]).map(([w,c])=>`${w} ${c.toLocaleString()}`).join("・")||"なし"));
 // 結果のファイル (傾向タブで開ける)
 const out=A.out||path.join(ROOT,"tools","trend-out",`trend-${new Date().toISOString().replace(/[:.]/g,"-").slice(0,19)}.json`); fs.mkdirSync(path.dirname(out),{recursive:true});
 const o={kind:"trend",name:`傾向 (コマンド) ${new Date().toLocaleString("ja-JP")}`,ts:Date.now(),N,K,pols,R,years,condSeed,cfg:{runs:N,pols:K,thr,years},time,ctxInfo:{Wh:ctx.Wh,vTop:ctx.vTop,src:S.src==="game"?"game":"ctx"},buf:Buffer.from(buf.buffer).toString("base64")};
 fs.writeFileSync(out,JSON.stringify(o)); console.log(`\n結果のファイル: ${out} (${(fs.statSync(out).size/1048576).toFixed(1)} MB)。傾向タブの「結果ファイルを読み込む」で図・レポートにできます`);
})().catch(e=>{ console.error("\nエラー: "+e.message); process.exit(1); });
