"use strict";
/* ブラウザ用のスクリプト (物理・戦略) を Node の中で読み込む。画面・描画は読み込まない。
 使い方: const C=require("./lib/load")(); C.run("Strategy.simulate(60)") */
const vm=require("vm"), fs=require("fs"), path=require("path");
const ROOT=path.resolve(__dirname,"..","..");
const FILES=["js/data/route-2025.js","js/data/route-plan.js","js/data/route-osm.js","js/data/route-geo.js","js/data/weather-2025.js","js/route.js",
 "js/data/australia.js","js/geo.js","js/data.js","js/vehicle.js","js/physics.js","js/model.js","js/data/vehicle-public.js","js/tire.js","js/susp.js","js/rng.js","js/engine.js","js/strategy.js"];
module.exports=function load(opt={}){
 const store={}, ctx={console,performance:{now:()=>Number(process.hrtime.bigint())/1e6},
  localStorage:{getItem:k=>(k in store? store[k] : null),setItem:(k,v)=>{ store[k]=String(v); },removeItem:k=>{ delete store[k]; }},
  navigator:{userAgent:"node"},location:{search:"",href:"",hash:""},
  Radio:{log:[],push(m){ this.log.push(m); }},toast:()=>{}};   // 無線・通知は記録だけ
 ctx.window=ctx; ctx.self=ctx; vm.createContext(ctx);
 for(const f of FILES){ const p=path.join(ROOT,f); if(!fs.existsSync(p)) continue; vm.runInContext(fs.readFileSync(p,"utf8"),ctx,{filename:f}); }
 /* Engine.init は画面・無線を使うので、戦略の計算に要る分だけの状態を作る */
 vm.runInContext(`P.mode="race"; P.event=false; P.fcErr=${JSON.stringify(opt.fcErr||"off")}; if(${opt.realWeather===false}) P.realWeather=false;
  Engine.st={km:0,v:0,day:1,hour:8,dayOfYear:PRO.dayOfYear,soc:1,passedCP:new Set(),stopTimer:0,tiltDeg:40,morningPenaltyMin:0,competing:true,stopKind:"",stopHold:false,weatherPlan:[],fc:null,scenario:null,Tbat:null};`,ctx);
 return {ctx,run:(code)=>vm.runInContext(code,ctx)};
};
