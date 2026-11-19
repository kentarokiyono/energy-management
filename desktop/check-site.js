"use strict";
/* 作る前に、中に入るファイルを確かめて表示する (実車データが入るかどうか) */
const fs=require("fs"), path=require("path");
const root=path.join(__dirname,"..");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const build=(html.match(/BUILD (\d{8}-\w+)/)||[])[1]||"?";
const priv=[["js/data/vehicle-private.js","実車の諸元"],["js/data/vehicle-mesh-private.bin","実車の車体の形"],["assets/img/official-logo.png","待機画面のロゴ"]];
console.log(`\nサイトの版: ${build}`);
let n=0;
for(const [f,label] of priv){ const ok=fs.existsSync(path.join(root,f)); if(ok) n++; console.log(`  ${ok?"[入る]":"[無し]"} ${label} (${f})`); }
console.log(n? "\n※ 実車データ入りのソフトになります。配る相手に注意してください。\n" : "\n※ 実車データ無し (公開版) のソフトになります。\n");
