"use strict";
/* ============ ドライバー成績 ============
 走行ごと・ドライバーごとに、担当距離・平均速度・電費・無線の速度指示の評価 (A/B/C と指示どおりの割合)・練習シナリオの点数を、
 この端末のブラウザ (localStorage) に残す。メニューの「ドライバー成績」でドライバー別の合計とシナリオのベストを見る。
 記録するのは、レース (練習シナリオを含む) を終えたとき・メニューへ戻ったとき。続きから再開した走行は、再開後の分だけを数える */
const DrvRec={
 KEY:"bwsc_drvrec", MAX:300, from:0, oFrom:0,
 all(){ try{ const a=JSON.parse(localStorage.getItem(this.KEY)||"[]"); return Array.isArray(a)? a : []; }catch(e){ return []; } },
 put(list){ try{ localStorage.setItem(this.KEY,JSON.stringify(list.slice(-this.MAX))); }catch(e){} },
 /* 走行の始め (再開を含む): ここから後の走行ログ・指示の評価を数える */
 start(){ this.from=RunLog.rows.length; this.oFrom=Orders.hist.length; this.done=false; },
 drv(){ return typeof Crew!=="undefined"&&Crew.drivers? Crew.drivers[Crew.driverIdx].name : "―"; },
 /* 走行の終わり: ドライバーごとにまとめて追加 */
 record(){
  if(this.done||P.mode!=="race"||P.event) return; this.done=true;
  const R=RunLog.rows.slice(Math.max(0,this.from-1)), C=RunLog.COLS, ix=(n)=>C.indexOf(n);
  const iAbs=ix("経過h"), iKm=ix("km"), iSt=ix("状態"), iV=ix("速度km/h"), iPm=ix("モーターW"), iD=ix("ドライバー");
  const by=new Map(), g=(n)=>{ let o=by.get(n); if(!o) by.set(n,o={dist:0,t:0,wh:0}); return o; };
  for(let i=1;i<R.length;i++){ const p=R[i-1], r=R[i], dt=r[iAbs]-p[iAbs], dk=r[iKm]-p[iKm];
   if(!(dt>0)||dt>0.5||!(dk>0)||p[iSt]!=="走行"||r[iSt]!=="走行") continue;
   const o=g(p[iD]||"―"); o.dist+=dk; o.t+=dt; o.wh+=(Number.isFinite(r[iPm])?r[iPm]:0)*dt; }
  const H=Orders.hist.slice(this.oFrom), sc=Engine.st&&Engine.st.scenario, date=Date.now(), list=this.all();
  for(const h of H){ const o=g(h.drv||"―"); o.on=o.on||{n:0,pct:0,A:0,B:0,C:0}; o.on.n++; o.on.pct+=h.pct; if(h.grade) o.on[h.grade]++; }
  for(const [name,o] of by){ if(o.dist<1&&!o.on) continue;
   list.push({name,date,kind:sc?"scenario":"race",scn:sc||null,dist:o.dist,t:o.t,wh:o.wh,on:o.on||null}); }
  this.put(list);
 },
 /* 練習シナリオの点数 (採点の画面から) */
 scenario(id,score){ const list=this.all(); list.push({name:this.drv(),date:Date.now(),kind:"score",scn:id,score}); this.put(list); },
 /* ドライバー別の合計 */
 summary(){
  const m=new Map();
  for(const r of this.all()){ const o=m.get(r.name)||{name:r.name,runs:0,dist:0,t:0,wh:0,on:{n:0,pct:0,A:0,B:0,C:0},best:{},last:0}; m.set(r.name,o); o.last=Math.max(o.last,r.date||0);
   if(r.kind==="score"){ o.best[r.scn]=Math.max(o.best[r.scn]||0,r.score); continue; }
   o.runs++; o.dist+=r.dist||0; o.t+=r.t||0; o.wh+=r.wh||0;
   if(r.on){ o.on.n+=r.on.n; o.on.pct+=r.on.pct; o.on.A+=r.on.A; o.on.B+=r.on.B; o.on.C+=r.on.C; } }
  return [...m.values()].sort((a,b)=>b.last-a.last);
 },
 open(){
  const S=this.summary(), f=(x,d)=>Number.isFinite(x)?x.toFixed(d):"―", NAMES={squall:"スコール",cross:"強い横風",cloud:"長い曇り"};
  const el=document.getElementById("drvrec")||(()=>{ const d=document.createElement("div"); d.id="drvrec"; d.className="scn-res"; document.body.appendChild(d); return d; })();
  const rows=S.map(o=>`<tr><td><b>${escHtml(o.name)}</b></td><td>${f(o.dist,0)} km</td><td>${o.t>0?f(o.dist/o.t,1):"―"} km/h</td><td>${o.dist>0?f(o.wh/o.dist,1):"―"} Wh/km</td>
   <td>${o.on.n? `${f(o.on.pct/o.on.n*100,0)} % <span class="dim">(A ${o.on.A}・B ${o.on.B}・C ${o.on.C})</span>` : "―"}</td>
   <td>${Object.keys(NAMES).map(k=>o.best[k]!=null?`${NAMES[k]} ${o.best[k]}`:"").filter(Boolean).join("<br>")||"―"}</td></tr>`).join("");
  el.innerHTML=`<div class="box" style="width:min(820px,calc(100vw - 24px))"><div class="lb">ドライバー成績 (この端末)</div><h3>ドライバー別の合計</h3>
   ${S.length? `<div style="overflow-x:auto"><table class="drt"><tr><th>ドライバー</th><th>担当距離</th><th>平均速度</th><th>電費</th><th>速度指示 (指示どおりの割合)</th><th>練習シナリオ (ベスト)</th></tr>${rows}</table></div>`
    : `<div class="why" style="color:var(--tx2)">まだ記録がありません。レースや練習シナリオを走ると、ここにたまります。</div>`}
   <div class="btns"><button class="btn" onclick="DrvRec.clear()">記録を消去</button><button class="btn pri" onclick="document.getElementById('drvrec').classList.remove('on')">閉じる</button></div></div>`;
  el.classList.add("on");
 },
 clear(){ if(!confirm("ドライバー成績をすべて消去します。")) return; try{ localStorage.removeItem(this.KEY); }catch(e){} this.open(); },
};
