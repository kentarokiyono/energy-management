"use strict";
/* 版 (index.html の BUILD と ?v=) の上げ忘れを見つける。
 JS・CSS・sw.js を変えたのに版が同じだと、一度開いた端末は前の版のスクリプトを保存から使い続け、新しい画面と食い違う。
 使い方: node tests/build-check.js <比べる元 (例: origin/main)> */
const {execSync}=require("child_process");
const base=process.argv[2]||"origin/main", sh=(c)=>execSync(c,{encoding:"utf8"});
const files=sh(`git diff --name-only ${base} HEAD`).split("\n").filter(Boolean), code=files.filter(f=>/^(js|css)\/|^sw\.js$/.test(f));
const ver=(t)=>(t.match(/BUILD (\d{8}-\w+)/)||[])[1];
const vb=ver(sh(`git show ${base}:index.html`)), vh=ver(require("fs").readFileSync("index.html","utf8"));
if(code.length&&vb===vh){ console.error(`版が ${vh} のままです。JS・CSS を変えたら index.html の版 (BUILD と ?v=) を上げてください:\n  ${code.join("\n  ")}`); process.exit(1); }
console.log(`版の確認: ${vb} → ${vh} (変わったスクリプト・スタイル ${code.length} 個)`);
