"use strict";
/* ============ 天気番号 (乱数のシード) ============
 同じ番号なら、天気 (雲・スコール・暴風雨)・予報のずれ・突風・他チーム・故障・ロードトレインの乱数が同じになる。
 用途ごとに別の並び (name) を使うので、運転の違いで呼ぶ回数が変わっても、ほかの用途の並びはずれない */
const Rng={
 MAX:999999, seed:0, next:0, st:{},
 /* 走行の始めに。n (1〜999999) を使う。無し・範囲外なら新しい番号 */
 start(n){ n=Math.floor(Number(n)||0); this.seed= n>=1&&n<=this.MAX? n : 1+Math.floor(Math.random()*this.MAX); this.st={}; return this.seed; },
 /* 用途 name の次の乱数 [0, 1) (mulberry32) */
 r(name){
  let g=this.st[name];
  if(!g){ let h=(this.seed*2654435761)>>>0; for(let i=0;i<name.length;i++) h=Math.imul(h^name.charCodeAt(i),2246822519)>>>0; g=this.st[name]={a:h||1}; }
  let t=(g.a=(g.a+0x6D2B79F5)>>>0); t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296;
 },
 /* 標準正規分布 */
 gauss(name){ let u=0; while(u===0) u=this.r(name); const v=this.r(name); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); },
};
