"use strict";
/* ============ 傾向: 起動時に読む小さな部分 ============
 ・傾向タブの本体 (js/ui/trend.js・二段階の探索 trend-search.js・エンジンとの合わせ込み trend-cal.js) は、タブを開いたときだけ読み込む
 ・ドライバーの目標 (傾向で作った 10 km ごとの目標速度) はレースの速度指示から使うので、ここで読む */
const TrendLoad={
 _p:null, _t:undefined,
 load(){ if(typeof Trend!=="undefined"&&Trend.search&&Trend.calibrate) return Promise.resolve(); if(this._p) return this._p;
  const ver=this.ver();
  const one=(f)=>new Promise((res,rej)=>{ const s=document.createElement("script"); s.src=f+"?v="+ver; s.onload=()=>res(); s.onerror=()=>rej(new Error("傾向の画面を読み込めません")); document.head.appendChild(s); });
  return this._p=one("js/ui/trend.js").then(()=>one("js/ui/trend-search.js")).then(()=>one("js/ui/trend-cal.js")).then(()=>{ if(Trend.syncTeam) Trend.syncTeam(); }).catch(e=>{ this._p=null; throw e; }); },
 /* 版 (メニューの BUILD 表示)。読み込むファイルの ?v= に付けて、古い保存を使わないようにする */
 ver(){ if(!window.BUILD){ const v=(document.querySelector(".menu .build")||{}).textContent||""; window.BUILD=(v.match(/\d{8}-\w+/)||[""])[0]; } return window.BUILD; },
 targets(){ if(this._t===undefined){ try{ this._t=JSON.parse(localStorage.getItem("bwsc_targets")||"null"); }catch(e){ this._t=null; } } return this._t; },
 setTargets(T){ this._t=T; try{ localStorage.setItem("bwsc_targets",JSON.stringify(T)); }catch(e){} },
 /* km の 10 km 区間の目標。天気の傾向 (P.targetCls) を選べる */
 targetAt(km){ const T=this.targets(); if(!T) return null; const L=T[P.targetCls||"all"]||T.all; if(!L) return null; return L[Math.min(L.length-1,Math.floor(km/10))]||null; },
};
