"use strict";
/* ============ 表示言語 (日本語 / English) ============
 文章は日本語で書き、英語のときだけ画面に出た文字を置き換える (日本語のときは何もしない)。
  ・I18N.t(s): 日本語の文章 → 英語。表 (EN) にそのまま無ければ、型 (PAT: 数字の入る文) → 文ごと (「。」・改行・「: 」で分けて訳す) の順に探す。
    見つからない所は日本語のまま
  ・画面: 英語のとき、本文の文字とツールチップ (title など) を置き換え、後から書き換わった所も見張って置き換える (MutationObserver)
  ・訳は js/i18n-en.js (EN・PAT)
 言語はメニューの切り替え (または URL の ?lang=en) で選び、この端末に覚える (bwsc_lang)。切り替えると読み込み直す。既定は日本語 */
const I18N={
 JP:/[぀-ヿ㐀-鿿！-｠]/,
 lang:(()=>{   // 既定は日本語。英語はメニューの切り替え (この端末に覚える) か、URL の ?lang=en
  try{ const q=new URLSearchParams(location.search).get("lang"); if(q==="en"||q==="ja"){ localStorage.setItem("bwsc_lang",q); return q; } }catch(e){}
  try{ const v=localStorage.getItem("bwsc_lang"); if(v==="en"||v==="ja") return v; }catch(e){} return "ja"; })(),
 EN:Object.create(null), PAT:[],
 add(map){ Object.assign(this.EN,map); this._fk=null; this._c.clear(); },
 _fk:null, _c:new Map(),
 pat(list){ for(const p of list) this.PAT.push(p); },
 en(){ return this.lang==="en"; },
 set(l){ if(l!=="en"&&l!=="ja") return; try{ localStorage.setItem("bwsc_lang",l); }catch(e){}
  try{ const u=new URL(location.href); if(u.searchParams.has("lang")){ u.searchParams.delete("lang"); location.href=u.toString(); return; } }catch(e){} location.reload(); },
 /* 1 つの文 (前後の空白は保つ) */
 one(k){
  let e=this.EN[k]; if(e!=null) return e;
  e= k.endsWith("。")? this.EN[k.slice(0,-1)] : this.EN[k+"。"]; if(e!=null) return e;   // 文の終わりの「。」はあってもなくてもよい
  for(const kk of k.endsWith("。")? [k] : [k,k+"。"]) for(const [re,r] of this.PAT){ re.lastIndex=0; if(re.test(kk)){ re.lastIndex=0; return typeof r==="function"? kk.replace(re,(...a)=>r(...a)) : kk.replace(re,r); } }
  return null; },
 /* 文の中の語句を表の語句で置き換える (長いものから)。日本語が残らなかったときだけ使う */
 frag(k){
  if(!this._fk) this._fk=Object.keys(this.EN).filter(x=>this.JP.test(x)&&x.replace(/\s/g,"").length>=2).sort((a,b)=>b.length-a.length);
  let s=k; for(const f of this._fk){ if(s.includes(f)){ s=s.split(f).join(this.EN[f]); if(!this.JP.test(s)) return s.replace(/\s{2,}/g," "); } }
  return null; },
 t(s){
  if(this.lang!=="en"||s==null) return s; s=String(s); if(!this.JP.test(s)) return s;
  const c=this._c.get(s); if(c!==undefined) return c;
  const r=this.t0(s); if(this._c.size>5000) this._c.clear(); this._c.set(s,r); return r; },
 t0(s){
  const m=s.match(/^(\s*)([\s\S]*?)(\s*)$/), k=m[2];
  let r=this.one(k);
  if(r==null){   // 文ごと: 改行・「。」・「: 」・「・」などで分けて訳す。全部訳せたときだけ置き換える (日本語と英語が混ざらないように)
   const parts=k.split(/(\n|。\s*|！\s*|？\s*|: |\s*・\s*|\s+―\s+|\s+→\s+)/);
   const sep=p=>/^。\s*$/.test(p)? ". " : /^！/.test(p)? "! " : /^？/.test(p)? "? " : /^\s*・\s*$/.test(p)? " · " : p;
   if(parts.length>1){ let any=true; r=parts.map((p,i)=>{ if(i%2) return sep(p); if(!p||!this.JP.test(p)) return p; const q=this.one(p.trim())??this.frag(p.trim()); if(q!=null) return q; any=false; return p; }).join("").replace(/([.!?])\. /g,"$1 ").replace(/([.!?])\.$/,"$1").replace(/\s+$/,""); if(!any) r=null; }
  }
  if(r==null) r=this.frag(k);
  return r==null? s : m[1]+r+m[3];
 },
 /* 画面の置き換え */
 ATTR:["title","placeholder","aria-label","data-tip"],
 node(n){ const o=n.nodeValue; if(o&&this.JP.test(o)){ const r=this.t(o); if(r!==o) n.nodeValue=r; } },
 attrs(el){ for(const a of this.ATTR){ const v=el.getAttribute&&el.getAttribute(a); if(v&&this.JP.test(v)){ const r=this.t(v); if(r!==v) el.setAttribute(a,r); } } },
 tree(root){
  if(!root) return;
  if(root.nodeType===3){ this.node(root); return; }
  if(root.nodeType!==1&&root.nodeType!==9&&root.nodeType!==11) return;
  if(root.nodeType===1){ if(root.tagName==="SCRIPT"||root.tagName==="STYLE") return; this.attrs(root); }
  const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT,{acceptNode:n=>n.nodeType===1&&(n.tagName==="SCRIPT"||n.tagName==="STYLE")? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT});
  for(let n=w.nextNode();n;n=w.nextNode()){ if(n.nodeType===3) this.node(n); else this.attrs(n); }
 },
 start(){
  if(typeof document==="undefined") return;
  document.documentElement.lang=this.lang;
  { const b=document.querySelector(`#lang-seg [data-lang="${this.lang}"]`); if(b) b.classList.add("on"); }   // メニューの切り替え
  if(this.lang!=="en") return;
  document.title=this.t(document.title);
  this.tree(document.body);
  new MutationObserver(ms=>{ for(const m of ms){
   if(m.type==="characterData") this.node(m.target);
   else if(m.type==="attributes") this.attrs(m.target);
   else for(const n of m.addedNodes) this.tree(n); } })
   .observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:this.ATTR});
 },
};
/* 短く書くため */
function T(s){ return I18N.t(s); }
if(typeof document!=="undefined"){ if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",()=>I18N.start()); else setTimeout(()=>I18N.start(),0); }
