"use strict";
/* ============ 実車のゴースト: 本戦で走っているとき、同じ日・同じ時刻に実車がいた位置へ半透明の車を出す ============
 元のデータは、分析画面で読み込んだ実車の走行ログ (この端末のブラウザの中 = IndexedDB にだけある)。コードやリポジトリには入れない。
 ログが無い端末・ログの時間の外では出さない。設定「実車のゴーストを表示」(P.ghost) で消せる */
const Ghost={
 A:null, K:null, loading:null, mesh:null, el:null, last:"",
 on(){ return P.ghost!==false&&P.mode==="race"&&!P.event&&!(Engine.st&&Engine.st.scenario); },
 /* 読み込んだ実車のログ (計測器のもの) を時刻の順につなぐ */
 load(){ if(this.loading) return this.loading;
  this.loading=(async()=>{ if(typeof Ana==="undefined"||!Ana.DB) return; const all=await Ana.DB.all(), pts=[];
   for(const o of all){ if(!o||o.kind||o.demo||o.live||!Array.isArray(o.rows)) continue;
    for(const r of o.rows) if(r&&Number.isFinite(r.abs)&&Number.isFinite(r.km)&&r.abs>0&&r.abs<9*24) pts.push([r.abs,r.km]); }
   if(pts.length<50) return; pts.sort((a,b)=>a[0]-b[0]);
   this.A=new Float64Array(pts.length); this.K=new Float64Array(pts.length); pts.forEach((p,i)=>{ this.A[i]=p[0]; this.K[i]=p[1]; }); })().catch(()=>{});
  return this.loading; },
 /* 時刻 abs [h] に実車がいた位置 [km] (ログの時間の外は null) */
 kmAt(abs){ const A=this.A, K=this.K; if(!A||abs<A[0]||abs>A[A.length-1]) return null;
  let lo=0, hi=A.length-1; while(hi-lo>1){ const m=(lo+hi)>>1; if(A[m]<=abs) lo=m; else hi=m; }
  if(A[hi]-A[lo]>0.5) return null;   // ログの抜け (夜など): 出さない
  const f=(abs-A[lo])/Math.max(1e-9,A[hi]-A[lo]); return K[lo]+(K[hi]-K[lo])*f; },
 /* 半透明の車 (自分の車と同じ形) */
 build(V){ const SB=VEH.active?VEH.spec.body:(typeof YATA_PUBLIC_BODY!=="undefined"?YATA_PUBLIC_BODY:null), Y=buildYATA(SB,true), g=new THREE.Group();
  const m=new THREE.MeshBasicMaterial({color:0x9fe3ff,transparent:true,opacity:.28,depthWrite:false});
  Y.group.traverse(o=>{ if(o.isMesh){ o.material=m; o.castShadow=false; o.receiveShadow=false; } }); g.add(Y.group); g.visible=false; g.renderOrder=3; V.scene.add(g); return g; },
 tag(txt){ if(!this.el){ this.el=document.createElement("div"); this.el.id="ghost-tag"; document.getElementById("game-container").appendChild(this.el); }
  if(txt!==this.last){ this.el.textContent=txt; this.el.style.display=txt?"block":"none"; this.last=txt; } },
 /* 毎フレーム (View.update から) */
 frame(V,es){ if(!this.on()||!V.road){ if(this.mesh) this.mesh.visible=false; this.tag(""); return; }
  if(!this.loading) this.load();
  if(!this.A){ this.tag(""); return; }
  const abs=(es.day-1)*24+es.hour, km=this.kmAt(abs);
  if(km==null){ if(this.mesh) this.mesh.visible=false; this.tag(""); return; }
  const d=km-es.km; this.tag(Math.abs(d)<0.05? "実車 (2025) と並走" : `実車 (2025) が ${Math.abs(d)<10? Math.abs(d).toFixed(1) : Math.abs(d).toFixed(0)} km ${d>0?"前":"後ろ"}`);
  if(!this.mesh||this.mesh.parent!==V.scene) this.mesh=this.build(V);
  const s=V.sOfKm(km); if(s<0||s>V.road.builtS-V.SEG){ this.mesh.visible=false; return; }
  const rp=V.roadPoint(s), lat=-2.4, nx=Math.cos(rp.h), nz=Math.sin(rp.h);
  this.mesh.position.set(rp.x+nx*lat,rp.y,rp.z+nz*lat); this.mesh.rotation.y=-rp.h; this.mesh.visible=Math.abs(d)<3; },   // 3 km 以内だけ車を出す (遠いと見えない)
 reset(){ this.mesh=null; }
};
