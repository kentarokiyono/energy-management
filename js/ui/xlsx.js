"use strict";
/* ============ Excel (.xlsx) を読む (分析画面の読み込み用・外部のライブラリなし) ============
 .xlsx は ZIP の中の XML。ZIP の目次から必要なファイルだけを、ブラウザの展開機能 (DecompressionStream) で取り出す。
 ・Xlsx.sheets(buf) → [{name, path}] (ブックのシートの順。.z に展開の準備)
 ・Xlsx.rows(list.z, path) → そのシートの表 (文字列の 2 次元配列。数値は文字列に、空のセルは "")
 計測器のデータのシートを探すのは分析画面 (Ana.parseXlsx) */
const Xlsx={
 zip(buf){ const u8=new Uint8Array(buf), dv=new DataView(buf); let e=-1;
  for(let i=u8.length-22;i>=Math.max(0,u8.length-65558);i--) if(dv.getUint32(i,true)===0x06054b50){ e=i; break; }
  if(e<0) throw new Error("Excel のファイルではありません");
  const n=dv.getUint16(e+10,true); let p=dv.getUint32(e+16,true); const files={}, td=new TextDecoder();
  for(let k=0;k<n;k++){ if(dv.getUint32(p,true)!==0x02014b50) break; const m=dv.getUint16(p+10,true), cs=dv.getUint32(p+20,true), nl=dv.getUint16(p+28,true), xl=dv.getUint16(p+30,true), cl=dv.getUint16(p+32,true), lo=dv.getUint32(p+42,true);
   files[td.decode(u8.subarray(p+46,p+46+nl))]={m,cs,lo}; p+=46+nl+xl+cl; }
  return {u8,dv,files}; },
 async file(z,name){ const f=z.files[name]; if(!f) return null; const lo=f.lo, nl=z.dv.getUint16(lo+26,true), xl=z.dv.getUint16(lo+28,true), d=z.u8.subarray(lo+30+nl+xl,lo+30+nl+xl+f.cs);
  if(f.m===0) return new TextDecoder().decode(d);
  if(f.m!==8) throw new Error("この圧縮には対応していません");
  if(typeof DecompressionStream==="undefined") throw new Error("このブラウザは Excel の読み込みに対応していません (CSV で保存してください)");
  const s=new Blob([d]).stream().pipeThrough(new DecompressionStream("deflate-raw")); return await new Response(s).text(); },
 dec(s){ return s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi,(m,x)=>x==="lt"?"<":x==="gt"?">":x==="amp"?"&":x==="quot"?'"':x==="apos"?"'":x[1]==="x"||x[1]==="X"? String.fromCodePoint(parseInt(x.slice(2),16)) : String.fromCodePoint(+x.slice(1))); },
 async sheets(buf){ const z=this.zip(buf), wb=await this.file(z,"xl/workbook.xml"), rel=await this.file(z,"xl/_rels/workbook.xml.rels"); if(!wb||!rel) throw new Error("Excel のブックが読めません");
  const R={}; for(const m of rel.matchAll(/<Relationship\b[^>]*>/g)){ const id=(m[0].match(/\bId="([^"]+)"/)||[])[1], t=(m[0].match(/\bTarget="([^"]+)"/)||[])[1]; if(id&&t) R[id]=t.replace(/^\/?xl\//,"").replace(/^\//,""); }
  const out=[]; for(const m of wb.matchAll(/<sheet\b[^>]*>/g)){ const nm=(m[0].match(/\bname="([^"]*)"/)||[])[1], id=(m[0].match(/\br:id="([^"]+)"/)||[])[1]; const t=R[id]; if(t&&/^worksheets\//.test(t)) out.push({name:this.dec(nm||""),path:"xl/"+t}); }
  out.z=z; return out; },
 async rows(z,path){ const x=await this.file(z,path); if(x==null) throw new Error("シートがありません");
  let ss=[]; const sx=await this.file(z,"xl/sharedStrings.xml"); if(sx) ss=[...sx.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m=>this.dec([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t=>t[1]).join("")));
  const col=(r)=>{ let c=0; for(const ch of r){ const k=ch.charCodeAt(0); if(k<65||k>90) break; c=c*26+(k-64); } return c-1; }, out=[];
  for(const rm of x.matchAll(/<row\b((?:[^>\/]|\/(?!>))*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)){ const ri=+(((rm[1]||rm[3]||"").match(/\br="(\d+)"/)||[])[1]||out.length+1)-1, row=[];
   if(rm[2]) for(const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){ const a=cm[1], r=(a.match(/\br="([A-Z]+)\d+"/)||[])[1], t=(a.match(/\bt="(\w+)"/)||[])[1], body=cm[2]||"";
    let v=(body.match(/<v>([\s\S]*?)<\/v>/)||[])[1]; if(t==="s") v=ss[+v]; else if(t==="inlineStr") v=[...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(q=>q[1]).join(""); if(v==null) v=""; else if(t!=="s") v=this.dec(v);
    const c=r? col(r) : row.length; while(row.length<c) row.push(""); row[c]=v; }
   while(out.length<ri) out.push([]); out[ri]=row; }
  return out; },
};
