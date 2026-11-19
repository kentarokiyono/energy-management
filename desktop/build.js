"use strict";
/* Windows 用のソフトを作る: 中に入るファイルを表示 → 版をサイトの BUILD から付ける → electron-builder
 出来上がり: dist/BWSC3D-Setup-<版>.exe (インストーラー) と dist/BWSC3D-<版>-x64.zip (展開して使う版) */
const fs=require("fs"), path=require("path"), { spawnSync }=require("child_process");
require("./check-site.js");
const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const m=html.match(/BUILD (\d{8})-s(\d+)/);
const ver= m? `1.${m[1]}.${m[2]}` : "1.0.0";   // 例: BUILD 20261119-s92 → 1.20261119.92
console.log(`ソフトの版: ${ver}\n`);
const bin=path.join(__dirname,"node_modules",".bin",process.platform==="win32"?"electron-builder.cmd":"electron-builder");
const r=spawnSync(bin,["--win","nsis","zip","--x64",`-c.extraMetadata.version=${ver}`,...process.argv.slice(2)],{stdio:"inherit",cwd:__dirname,shell:process.platform==="win32"});
if(r.status!==0){ console.error("\n作れませんでした。上のメッセージを確認してください。"); process.exit(r.status||1); }
console.log(`\n出来上がり: ${path.join(__dirname,"dist")}`);
