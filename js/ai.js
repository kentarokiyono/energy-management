"use strict";
/* ============ AI (Google Gemini) ============
 使い方: 設定で「AI を使う」を ON にし、自分の API キーを入れた端末だけで使う (キーはこの端末のブラウザの中にだけ保存。コードやリポジトリには入れない)。
 送るのは相対的な値 (% ・ km ・ 時刻 ・ 順位 ・ 走り方の名前) だけ。電力量・電費・車両の諸元・ドライバーの名前は送らない。
 実車モデル (非公開ファイルがある) で遊んでいるときは使わない。
 数値は手元の計算 (戦略・見込み・予報) のものをそのまま渡し、AI にはそれをもとにセリフや説明を書かせるだけ。
 使えないとき (オフライン・キー未設定・失敗) は今までの固定のセリフに戻る */
const AI={
 KEY:"bwsc_gemini_key", MODEL:"gemini-2.5-flash", URL:"https://generativelanguage.googleapis.com/v1beta/models/",
 busy:0, lastErr:"",
 key(){ try{ return localStorage.getItem(this.KEY)||""; }catch(e){ return ""; } },
 setKey(k){ try{ k=String(k||"").trim(); if(k) localStorage.setItem(this.KEY,k); else localStorage.removeItem(this.KEY); }catch(e){} },
 model(){ return (P.aiModel||this.MODEL).replace(/[^a-z0-9.\-]/gi,""); },
 /* 使える状態か (実車モデルのときは使わない) */
 on(){ return P.aiOn===true&&!!this.key()&&!(typeof VEH!=="undefined"&&VEH.active)&&navigator.onLine!==false; },
 why(){ if(P.aiOn!==true) return "OFF"; if(!this.key()) return "API キーが未設定"; if(typeof VEH!=="undefined"&&VEH.active) return "実車モデルのときは使いません"; if(navigator.onLine===false) return "オフライン"; return ""; },
 /* 1 回の問い合わせ。json=true なら JSON で返させる。失敗したら null */
 async ask(system,user,{json=false,maxTokens=900,temp=0.8,timeout=20000}={}){
  if(!this.on()) return null; const ctl=new AbortController(), tm=setTimeout(()=>ctl.abort(),timeout); this.busy++;
  try{
   const body={systemInstruction:{parts:[{text:system}]},contents:[{role:"user",parts:[{text:user}]}],
    generationConfig:{temperature:temp,maxOutputTokens:maxTokens,...(json?{responseMimeType:"application/json"}:{})}};
   const r=await fetch(this.URL+this.model()+":generateContent",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":this.key()},body:JSON.stringify(body),signal:ctl.signal});
   if(!r.ok){ this.lastErr=`HTTP ${r.status}`; return null; }
   const d=await r.json(), u=d.usageMetadata||{}; this.addUse(u.promptTokenCount||0,(u.candidatesTokenCount||0)+(u.thoughtsTokenCount||0));
   const t=((d.candidates||[])[0]?.content?.parts||[]).map(p=>p.text||"").join("").trim(); if(!t){ this.lastErr="空の返答"; return null; }
   this.lastErr=""; if(!json) return t;
   try{ return JSON.parse(t.replace(/^```(?:json)?|```$/g,"")); }catch(e){ this.lastErr="JSON でない返答"; return null; }
  }catch(e){ this.lastErr=e.name==="AbortError"? "時間切れ" : "通信できません"; return null; }
  finally{ clearTimeout(tm); this.busy--; } },
 /* 使った量 (今月の合計、この端末) */
 addUse(i,o){ try{ const m=new Date().toISOString().slice(0,7); let a=JSON.parse(localStorage.getItem("bwsc_ai_use")||"{}"); if(a.m!==m) a={m,in:0,out:0,n:0};
  a.in+=i; a.out+=o; a.n++; localStorage.setItem("bwsc_ai_use",JSON.stringify(a)); }catch(e){} },
 useText(){ try{ const m=new Date().toISOString().slice(0,7); let a=JSON.parse(localStorage.getItem("bwsc_ai_use")||"{}"); if(a.m!==m) a={}; return `今月 ${a.n||0} 回・入力 ${((a.in||0)/1000).toFixed(1)} 千 / 出力 ${((a.out||0)/1000).toFixed(1)} 千トークン`; }catch(e){ return ""; } },
 /* 接続の確認 (設定画面のボタン) */
 async test(){ const t=await this.ask("あなたはソーラーカーチームの一員です。","「準備できました」と 10 文字以内で返してください。",{maxTokens:60,temp:0}); return t? `OK: ${t}` : `失敗: ${this.lastErr||this.why()}`; },
 /* ---------- 話し合いのセリフ ---------- */
 SYS_TALK:`あなたはオーストラリアを縦断するソーラーカーレース (Bridgestone World Solar Challenge) に出ている日本の大学チームの会話を書きます。
話す人 (role): tm=チームマネージャー (まとめ役・決める人), strat=戦略担当 (見込み・予報・順位), elec=電装班長 (電池・発電・充電), body=車体班長 (パネル・傾け・キャノピー), mech=整備班長 (タイヤ・ブレーキ・点検), drv=その日のドライバー。
ルール: 渡された事実 (facts) にある数値だけを使う。数値を作らない・変えない。電力量や速度の数値は言わない。名前は呼ばず役職で話す。
1 人 1 文〜2 文、各 60 字以内。3〜5 人分。自然な日本語の会話で、話し合いの流れ (誰かの発言を受けて次が話す) にする。
出力は JSON 配列: [{"role":"tm","text":"…"}, …]`,
 async talk(kind,step,facts){ const r=await this.ask(this.SYS_TALK,`場面: ${kind==="pm"?"夕方の話し合い (日没後のキャンプ)":"朝の打ち合わせ (7 時、走行前)"}\n議題: ${facts.topic}\nfacts: ${JSON.stringify(facts)}`,{json:true,maxTokens:700});
  if(!Array.isArray(r)) return null; const ok=["tm","strat","elec","body","mech","drv"];
  const L=r.filter(x=>x&&ok.includes(x.role)&&typeof x.text==="string"&&x.text.trim()).slice(0,6).map(x=>[x.role,escHtml(x.text.trim().slice(0,90))]); return L.length>=2? L : null; },
 /* ---------- 走行中の戦略のひとこと (CS で) ---------- */
 async csNote(facts){ const t=await this.ask(`あなたはソーラーカーチームの戦略担当で、無線でドライバーとチームに短く伝えます。渡された事実の数値だけを使い、数値を作らない。電力量や速度の数値は言わない。2 文・80 字以内の日本語。`,
   `facts: ${JSON.stringify(facts)}`,{maxTokens:200,temp:0.6}); return t? escHtml(t.replace(/\s+/g," ").slice(0,120)) : null; },
 /* ---------- 分析画面: 走行について質問 ---------- */
 async analyze(question,summary){ return await this.ask(`あなたはソーラーカーの走行データを分析するエンジニアです。渡された要約 (50 km ごと) だけをもとに、質問に日本語で答えます。
要約の値: 平均速度 v [km/h]、電池 soc [%]、消費の指数 use (走行全体の平均を 100 とした 1 km あたりの消費)、日射の指数 sun (走行中の最大を 100)、平均勾配 grade [%]、標高 el [m]、主なドライバー drv (記号)。
要約にないことは推測と断って答える。数値は要約の値を引用する。箇条書き中心で 400 字以内。`,`質問: ${question}\n要約: ${JSON.stringify(summary)}`,{maxTokens:900,temp:0.4,timeout:30000}); },
};
