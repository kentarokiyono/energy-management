"use strict";
/* 見た目の自動チェック: 自分の車を何方向かから描いて、前回の基準画像と大きく違うところがあれば知らせる。
   実行: npm run test:visual        (初回は基準画像を作るだけ)
         npm run test:visual -- --update   (今の見た目を新しい基準にする)
   基準画像 (tests/visual-base/) と結果 (tests/out/visual/) はこの端末だけに置く (リポジトリには入れない) */
const http=require("http"), fs=require("fs"), path=require("path");
const {chromium}=require("playwright");
const ROOT=path.resolve(__dirname,".."), BASE=path.join(ROOT,"tests","visual-base"), OUT=path.join(ROOT,"tests","out","visual");
const UPDATE=process.argv.includes("--update");
const PIX=24, LIMIT=0.003;   // 色の差がこれより大きい点を「違う」とし、その割合が LIMIT を超えたら知らせる
const TYPES={".html":"text/html",".js":"application/javascript",".css":"text/css",".svg":"image/svg+xml",".woff2":"font/woff2",".json":"application/json",".gpx":"application/xml",".png":"image/png"};
let HIDE=false;   // 公開モデルを見るときは非公開ファイルを読ませない
function serve(){ return new Promise(res=>{ const s=http.createServer((q,r)=>{ let p=decodeURIComponent(q.url.split("?")[0].split("#")[0]); if(p.endsWith("/")) p+="index.html";
  const f=path.join(ROOT,p); if((HIDE&&/-private\./.test(p))||!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){ r.writeHead(404); r.end(); return; }
  r.writeHead(200,{"Content-Type":TYPES[path.extname(f)]||"application/octet-stream"}); fs.createReadStream(f).pipe(r); }); s.listen(0,"127.0.0.1",()=>res(s)); }); }
/* 見る方向: [名前, 方位 (度・0=正面), 仰角 (度)]。距離は車が画面に収まるように決める */
const VIEWS=[["front",0,8],["front-left",40,14],["left",90,6],["rear-left",140,14],["rear",180,8],["top",30,62],["low-front",20,-2]];
(async()=>{
 const srv=await serve(), url=`http://127.0.0.1:${srv.address().port}/index.html`;
 const b=await chromium.launch({args:["--use-gl=swiftshader","--enable-webgl","--ignore-gpu-blocklist"]});
 let flagged=0, made=0, ok=0;
 const hasPriv=fs.existsSync(path.join(ROOT,"js","data","vehicle-private.js"));
 try{ for(const hide of hasPriv? [false,true] : [true]){ HIDE=hide;
  const p=await b.newPage({viewport:{width:800,height:500}}); const errs=[]; p.on("pageerror",e=>errs.push(e.message));
  await p.goto(url); await p.waitForFunction(()=>typeof startGame==="function"&&typeof THREE!=="undefined"&&typeof View!=="undefined"); await p.waitForTimeout(500);
  const kind=await p.evaluate(()=>{ P.gfx="mid"; P.mode="race"; P.crewProc=false; startGame(); modalPause=false; return VEH.active? "private":"public"; });
  await p.waitForTimeout(2500);
  /* 道や空とは別の場面に、新しく作った車だけを置いて描く (天気・時刻・ライトの点灯に左右されない) */
  const shots=await p.evaluate((VIEWS)=>{ running=false;
   const W=480, H=300, cv=document.createElement("canvas"); cv.width=W; cv.height=H;
   const R=new THREE.WebGLRenderer({canvas:cv,antialias:true,preserveDrawingBuffer:true}); R.setPixelRatio(1); R.setSize(W,H,false);
   R.outputEncoding=View.renderer.outputEncoding; R.toneMapping=View.renderer.toneMapping; R.toneMappingExposure=View.renderer.toneMappingExposure;
   const sc=new THREE.Scene(); sc.background=new THREE.Color(0x8a96a3);
   sc.add(new THREE.HemisphereLight(0xffffff,0x555a60,0.9)); const sun=new THREE.DirectionalLight(0xffffff,0.8); sun.position.set(4,8,6); sc.add(sun);
   const fl=new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.MeshLambertMaterial({color:0x5c6066})); fl.rotation.x=-Math.PI/2; sc.add(fl);
   const m=View.buildCarModelImpl(); sc.add(m.group); m.group.updateMatrixWorld(true);
   const bb=new THREE.Box3(), corners=[]; m.group.traverse(o=>{ let v=o; while(v&&v.visible) v=v.parent; const pa=o.isMesh&&!v&&!(o.material&&o.material.transparent)&&o.geometry&&o.geometry.attributes.position; if(!pa) return;   // 見えている部品 (影などの半透明は除く) の頂点で大きさを測る
    const st=Math.max(1,Math.floor(pa.count/400)); for(let i=0;i<pa.count;i+=st){ const q=new THREE.Vector3().fromBufferAttribute(pa,i).applyMatrix4(o.matrixWorld); corners.push(q); bb.expandByPoint(q); } });
   const c=bb.getCenter(new THREE.Vector3());
   const cam=new THREE.PerspectiveCamera(40,W/H,0.05,100), out={};
   const place=(a,e,d)=>{ cam.position.set(c.x-Math.sin(a)*Math.cos(e)*d, Math.max(0.15,c.y+Math.sin(e)*d), c.z-Math.cos(a)*Math.cos(e)*d); cam.lookAt(c); cam.updateMatrixWorld(); };
   const fits=()=>corners.every(p=>{ const q=p.clone().project(cam); return q.z<1&&Math.abs(q.x)<0.9&&Math.abs(q.y)<0.9; });
   for(const [n,az,el] of VIEWS){ const a=az*Math.PI/180, e=el*Math.PI/180;   // 車の前は -z
    let d=2; while(d<30){ place(a,e,d); if(fits()) break; d+=0.1; }
    R.render(sc,cam); out[n]=cv.toDataURL("image/png"); }
   R.dispose(); return out; },VIEWS);
  fs.mkdirSync(BASE,{recursive:true}); fs.mkdirSync(OUT,{recursive:true});
  const rows=[];
  for(const [n] of VIEWS){
   const name=`${kind}-${n}`, cur=shots[n], fB=path.join(BASE,name+".png"), png=Buffer.from(cur.split(",")[1],"base64");
   fs.writeFileSync(path.join(OUT,name+".png"),png);
   if(UPDATE||!fs.existsSync(fB)){ fs.writeFileSync(fB,png); made++; rows.push(`基準を作成  ${name}`); continue; }
   const base="data:image/png;base64,"+fs.readFileSync(fB).toString("base64");
   /* 差を数え、違う点を赤く塗った画像も作る */
   const r=await p.evaluate(async([a,bS,PIX])=>{ const ld=(s)=>new Promise((ok,ng)=>{ const i=new Image(); i.onload=()=>ok(i); i.onerror=ng; i.src=s; });
    const [A,B]=await Promise.all([ld(a),ld(bS)]); if(A.width!==B.width||A.height!==B.height) return {frac:1,size:true};
    const W=A.width, H=A.height, cv=document.createElement("canvas"); cv.width=W; cv.height=H; const x=cv.getContext("2d");
    x.drawImage(A,0,0); const da=x.getImageData(0,0,W,H); x.drawImage(B,0,0); const db=x.getImageData(0,0,W,H), o=x.createImageData(W,H);
    let n=0; for(let i=0;i<da.data.length;i+=4){ const d=Math.max(Math.abs(da.data[i]-db.data[i]),Math.abs(da.data[i+1]-db.data[i+1]),Math.abs(da.data[i+2]-db.data[i+2]));
     const g=(da.data[i]+da.data[i+1]+da.data[i+2])/3*0.35;
     if(d>PIX){ n++; o.data[i]=255; o.data[i+1]=40; o.data[i+2]=40; } else { o.data[i]=o.data[i+1]=o.data[i+2]=g; } o.data[i+3]=255; }
    x.putImageData(o,0,0); return {frac:n/(W*H),img:cv.toDataURL("image/png")}; },[cur,base,PIX]);
   const bad=r.frac>LIMIT; if(bad) flagged++; else ok++;
   if(r.img) fs.writeFileSync(path.join(OUT,name+"-diff.png"),Buffer.from(r.img.split(",")[1],"base64"));
   rows.push(`${bad?"違う  ":"同じ  "}  ${name}  (違う点 ${(r.frac*100).toFixed(2)} %${r.size?"・大きさが違う":""})`);
  }
  const real=errs.filter(e=>!/-private|404/.test(e)); if(real.length){ rows.push("ページのエラー: "+real.slice(0,3).join(" | ")); flagged++; }
  console.log(`--- ${kind==="private"?"実車":"公開"}モデル ---\n`+rows.join("\n")); await p.close(); }
  console.log(`\n同じ ${ok} / 違う ${flagged} / 基準を作成 ${made}`);
  if(flagged) console.log(`違うものは ${path.relative(ROOT,OUT)} の *-diff.png (赤い点) で確認。意図した変更なら --update で基準を更新`);
 } finally { await b.close(); srv.close(); }
 process.exit(flagged?1:0);
})().catch(e=>{ console.error(e); process.exit(2); });
