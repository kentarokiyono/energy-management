"use strict";
/* オフライン動作: 一度開いたら、回線がなくても起動できるようにする。
 ・入れたとき: index.html と、そこから読み込むスクリプト・スタイル・ロゴを保存
 ・index.html: 回線があれば最新を取りに行き、なければ保存したもの
 ・それ以外 (?v= 付きのファイル・フォントなど): 保存したものを先に使い、無ければ取りに行って保存 */
const CACHE="bwsc-v1";
self.addEventListener("install",e=>{
 e.waitUntil((async()=>{
  const c=await caches.open(CACHE);
  const res=await fetch("./index.html",{cache:"no-cache"}); if(!res.ok) return;
  await c.put("./index.html",res.clone()); await c.put("./",res.clone());
  const html=await res.text(), urls=new Set(["assets/img/logo.svg"]);
  for(const m of html.matchAll(/(?:src|href)="([^"#:]+\.(?:js|css|svg)(?:\?[^"]*)?)"/g)) if(!/vehicle-private/.test(m[1])) urls.add(m[1]);   // 実車諸元は保存しない
  const ver=(html.match(/BUILD (\d{8}-\w+)/)||[])[1]; if(ver) for(const f of ["js/ui/trend.js","js/ui/trend-search.js","js/ui/trend-cal.js","js/ui/trend-easy.js","js/ui/trend-cal-drive.js","js/trend-worker.js"]) urls.add(f+"?v="+ver);   // 傾向の画面 (開いたときに読む)。20 年分の天気は大きいので使ったときに保存
  await Promise.all([...urls].map(async u=>{ try{ const r=await fetch(u); if(r.ok) await c.put(u,r); }catch(err){} }));
  const keep=new Set([...urls].map(u=>new URL(u,self.registration.scope).href));   // 古い版 (?v= が違うもの) を消す
  for(const k of await c.keys()) if(/[?&]v=/.test(k.url)&&!keep.has(k.url)) await c.delete(k);
  self.skipWaiting();
 })());
});
self.addEventListener("activate",e=>{
 e.waitUntil((async()=>{ for(const k of await caches.keys()) if(k!==CACHE) await caches.delete(k); await self.clients.claim(); })());
});
self.addEventListener("fetch",e=>{
 const req=e.request, url=new URL(req.url);
 if(req.method!=="GET"||url.origin!==location.origin) return;
 if(url.pathname.endsWith("/vehicle-private.js")) return;          // 実車諸元は保存しない
 const isPage=req.mode==="navigate"||url.pathname.endsWith("/")||url.pathname.endsWith("/index.html");
 e.respondWith((async()=>{
  const c=await caches.open(CACHE);
  if(isPage){
   try{ const r=await fetch(req); if(r.ok) c.put("./index.html",r.clone()); return r; }
   catch(err){ return (await c.match("./index.html"))||Response.error(); }
  }
  const hit=await c.match(req); if(hit) return hit;
  try{ const r=await fetch(req); if(r.ok) c.put(req,r.clone()); return r; }
  catch(err){ return Response.error(); }
 })());
});
