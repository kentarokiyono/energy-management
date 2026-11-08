"use strict";
/* ============ ヒドゥンバレー (予選・車検モード) の走行の記録 ============
 走るたびに自動で、分析画面の保存先 (この端末の IndexedDB) に入れる。1 回の予選・車検モード = 1 件。
 ・0.1 秒ごと: 経過・周回番号・周回のタイム・コース上の距離 (サーキット: スタート/フィニッシュからの m、直線の試験: 白線からの m)・位置・速度・電力・電流・電池・アクセル・ブレーキ・横 G・ピット
 ・周回 (タイム・ピットを通ったか)、車検テストの結果 (スラローム・制動・8 の字)
 ドライバー名は、分析画面の「名前・日付・ドライバーを編集」で付ける */
const HVRec={
 cur:null, KEYS:["t","lap","lt","s","x","z","v","pm","amp","soc","thr","brk","gl","pit"],
 NAMES:{circuit:"Hot Lap",slalom:"スラローム",brake:"制動",combo:"スラローム+制動",fig8:"8 の字"},
 begin(kind){ this.flush(); const S={}; for(const k of this.KEYS) S[k]=[];
  this.cur={id:"hv-"+Date.now().toString(36)+Math.random().toString(36).slice(2,5),t0:Date.now(),kind,S,laps:[],results:[],T:0,acc:0,lastSave:0}; },
 /* 毎フレーム (Test.frame の最後) */
 frame(dtR){ const c=this.cur; if(!c||!Test.active||P.event) return; c.T+=dtR; c.acc+=dtR; if(c.acc<0.1) return; c.acc=0;
  if(Test.state!=="run"&&Test.v<0.3) return;
  const es=Engine.st, S=c.S, r=(x,d)=>Math.round(x*d)/d; let s=Test.x;
  if(Test.kind==="circuit"&&Test.trackPts){ const T=HV.track(), i=Test.lastIdx, a=T.pts[i], b=T.pts[(i+1)%T.n], L2=(b.x-a.x)**2+(b.z-a.z)**2||1, u=clamp(((Test.x-a.x)*(b.x-a.x)+(Test.z-a.z)*(b.z-a.z))/L2,0,1);
   s=T.s[i]+u*Math.sqrt(L2); }
  const v=[r(c.T,100),Test.laps.length,r(Test.t,100),r(s,10),r(Test.x,10),r(Test.z,10),r(Test.v*3.6,10),Math.round(es.lastMotorW||0),r(es.lastAmp||0,10),r(es.soc*100,100),r(es.throttleSet||0,100),r(Math.max(es.brakePhys||0,es.brakeRegen||0),100),r(es.gLat||0,100),Test.inPit?1:0];
  this.KEYS.forEach((k,j)=>S[k].push(v[j]));
  if(c.T-c.lastSave>30) this.save(); },
 lap(t,pit,tag){ const c=this.cur; if(!c||P.event) return; c.laps.push({n:c.laps.length+1,t,pit:!!pit,tag:tag||"",end:c.S.t.length}); this.save(); },
 result(title,rows,pass){ const c=this.cur; if(!c||P.event) return;
  c.results.push({kind:Test.kind,title:String(title),pass:!!pass,at:c.T,rows:(rows||[]).map(x=>[String(x[0]),String(x[1])]),
   d:{slalom:Test.slalomT,cone:!!Test.coneHit,entry:Test.brakeEntry!=null?Test.brakeEntry*3.6:null,dist:Test.brakeDist}}); this.save(); },
 fig8(s1,s2,tot,ok){ const c=this.cur; if(!c||P.event) return; c.results.push({kind:"fig8",title:`8 の字 #${c.results.filter(x=>x.kind==="fig8").length+1}`,pass:!!ok,at:c.T,rows:[["1 周目",s1.toFixed(2)+" 秒"],["2 周目",s2.toFixed(2)+" 秒"],["合計",tot.toFixed(2)+" 秒"]],d:{s1,s2,tot}}); this.save(); },
 /* 保存: 周回・結果が 1 つでもあるか、30 秒以上走ったときだけ */
 save(){ const c=this.cur; if(!c) return; c.lastSave=c.T; if(!c.laps.length&&!c.results.length&&c.S.t.length<300) return;
  const d=new Date(c.t0), hm=`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  const o={id:c.id,name:c.name||`ヒドゥンバレー ${this.NAMES[c.kind]||c.kind} ${hm}`,date:Ana.ymd(c.t0),kind:"hv",driver:c.driver||"",hv:{kind:c.kind,laps:c.laps,results:c.results,S:c.S},rows:[],ts:Date.now()};
  if(typeof Ana!=="undefined"){ Ana.DB.put(o); if(Ana.loaded){ const i=Ana.runs.findIndex(r=>r.id===o.id); const run=Ana.hvRun(o); if(i>=0){ run.name=Ana.runs[i].name; run.driver=Ana.runs[i].driver; c.name=run.name; c.driver=run.driver; Ana.runs[i]=run; } else Ana.runs.push(run); } } },
 flush(){ if(this.cur) this.save(); this.cur=null; },
};
