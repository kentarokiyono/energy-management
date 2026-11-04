"use strict";
/* ============ BWSC 2025 ルート計画 (Route Notes V1.0 準拠の手入力データ) ============
 ・km はノートの「Location Ref」。同じ km に複数の動作が並ぶ場所は、順序を保って数十〜百数十 m 間隔に割り付けた (概算)
 ・turn: L/R=右左折(90°) / veerL,veerR=斜行(30°) / uturn=敷地内の折り返し / rab=ラウンドアバウト(exit: 出口の向き S=直進,R=右,L=左)
 ・wrong: その動作をしなかった場合に入ってしまう道 (曲がり損ね用の分岐道路) */
const RP_MANEUVERS=[
 // ---- Darwin: State Square → Mitchell St → Garramilla Blvd ----
 {km:0.06, turn:"R", name:"Mitchell Street", note:"State Square を出て右折", wrong:"S"},
 {km:1.03, turn:"R", name:"Garramilla Boulevard", note:"信号(2車線) 右折", signal:true, wrong:"S"},
 // ---- 192 Emerald Springs: 強制ドライバー交代 (ロードトレイン駐車帯) ----
 // ---- Katherine CS1 (322) : 計量所の敷地へ左から進入 ----
 {km:321.80, turn:"veerL", name:"Katherine Control Stop", cs:1, wrong:"S"},
 {km:322.20, turn:"veerR", name:"Stuart Highway (South)", note:"CS1 出口"},
 // ---- Dunmarra CS2 (631) : Highway Inn 左側 ----
 {km:630.85, turn:"veerL", name:"Dunmarra Highway Inn", cs:2, wrong:"S"},
 {km:631.20, turn:"veerR", name:"Stuart Highway", note:"CS2 出口"},
 // ---- 584 Daly Waters: 右の分岐に入らない ----
 // ---- Tennant Creek CS3 (988) : Kathleen St 左折 → Weaber St 右折 → CS 右折 → 本線へ左折 ----
 {km:987.62, turn:"L", name:"Kathleen Street", note:"左折", wrong:"S"},
 {km:987.78, turn:"R", name:"Weaber Street", note:"T字路を右折", wrong:"L"},
 {km:987.92, turn:"R", name:"Tennant Creek Control Stop", cs:3, wrong:"S"},
 {km:988.12, turn:"L", name:"Stuart Highway", note:"本線に再合流", wrong:"R"},
 // ---- Barrow Creek CS4 (1212.3) : ロードハウス 左側 ----
 {km:1212.15, turn:"veerL", name:"Barrow Creek Roadhouse", cs:4, wrong:"S"},
 {km:1212.50, turn:"veerR", name:"Stuart Highway", note:"砂利・線なし 注意"},
 // ---- Alice Springs CS5 (1496) ----
 {km:1494.00, turn:"keepR", name:"Wills Terrace", signal:true, note:"信号 右車線キープ"},
 {km:1495.85, turn:"L", name:"Traeger Avenue", note:"左折", wrong:"S"},
 {km:1495.95, turn:"R", name:"Traeger Park (Control Stop)", cs:5, wrong:"S"},
 {km:1496.12, turn:"L", name:"Speed Street", note:"CS 出口を左折", wrong:"R"},
 {km:1496.32, turn:"R", name:"Gap Road", note:"右折", wrong:"L"},
 {km:1497.70, turn:"rab", exit:"S", name:"Stuart Highway", note:"ラウンドアバウト 2番目の出口"},
 {km:1505.70, turn:"R", name:"Stuart Highway", note:"右折!直進すると空港", wrong:"S", warnKm:1505.0},
 // ---- Erldunda CS6 (1694) : ロードハウス2番目の入口(右) → Lasseter Hwy 左折 → Stuart Hwy 右折 ----
 {km:1693.88, turn:"R", name:"Erldunda Roadhouse (2nd entry)", cs:6, wrong:"S"},
 {km:1694.05, turn:"L", name:"(敷地内)"},
 {km:1694.15, turn:"L", name:"Lasseter Highway B4", note:"左折", wrong:"R"},
 {km:1694.30, turn:"R", name:"Stuart Highway 87", note:"右折", wrong:"S"},
 // ---- Coober Pedy CS7 (2181) ----
 {km:2180.00, turn:"L", name:"Hutchinson Street", note:"左折", wrong:"S"},
 {km:2180.85, turn:"L", name:"Coober Pedy Control Stop", cs:7, wrong:"S"},
 {km:2181.02, turn:"uturn", name:"(敷地内)"},
 {km:2181.12, turn:"R", name:"Hutchinson Street", note:"CS を右折で出る", wrong:"L"},
 {km:2181.90, turn:"L", name:"Stuart Highway", note:"左折で本線へ", wrong:"R"},
 // ---- Glendambo CS8 (2434) ----
 {km:2433.00, turn:"L", name:"Glendambo", note:"左折", wrong:"S"},
 {km:2434.02, turn:"uturn", name:"(敷地内)", cs:8},
 {km:2434.20, turn:"L", name:"Stuart Highway", note:"左折で本線へ", wrong:"R"},
 // ---- Port Augusta CS9 (2720.5) ----
 {km:2717.00, turn:"L", name:"Highway One A1", note:"左折(合流注意)", wrong:"S"},
 {km:2719.40, turn:"L", name:"Flinders Terrace", signal:true, note:"信号 左折", wrong:"S"},
 {km:2719.80, turn:"R", name:"Augusta Terrace", note:"右折", wrong:"S"},
 {km:2720.00, turn:"R", name:"Central Oval (Main Entrance)", cs:9, wrong:"S"},
 {km:2720.42, turn:"uturn", name:"(敷地内)"},
 {km:2720.55, turn:"R", name:"Augusta Terrace", note:"CS を右折で出る", wrong:"L"},
 {km:2720.80, turn:"rab", exit:"R", name:"Carlton Parade", note:"ラウンドアバウト 右"},
 {km:2721.00, turn:"L", name:"Victoria Parade A1", signal:true, note:"信号 左折", wrong:"S"},
 // ---- Adelaide (ゴール) ----
 {km:2926.00, turn:"keepS", name:"A1 (橋の下をくぐる)", note:"直進維持", wrong:"veerL"},
 {km:2999.00, turn:"keepL", name:"Port Wakefield Rd", note:"左車線 A1 を維持", wrong:"veerR"},
 {km:3021.20, turn:"veerR", name:"Main North Road", signal:true, note:"信号 右へ30°", wrong:"S"},
 {km:3021.30, turn:"veerL", name:"A21 Ring Route", note:"大会で最も重要な分岐!左車線で左へ", wrong:"S"},
 {km:3021.35, turn:"L", name:"Robe Terrace", note:"左折", wrong:"S"},
 {km:3026.70, turn:"rab", exit:"R", name:"(ラウンドアバウト)", note:"右"},
 {km:3026.90, turn:"L", name:"Victoria Park", note:"係員の誘導でステージングエリアへ", wrong:"S"},
];
/* 本線が直進する「曲がってはいけない」分岐 (誤進入用の道路を作る) */
const RP_TRAPS=[
 {km:584.0, side:"R", name:"Daly Waters", note:"右折しない (DO NOT TURN)"},
 {km:1505.5, side:"S", name:"Airport", note:"空港へ行かない", dummy:true},
];
/* コントロールストップ: 停車地点 km・開閉時刻(Day1=8/24日曜)・敷地 */
const RP_CS=[
 {n:1, name:"Katherine",     km:322.0,  open:[1,11,0], close:[1,17,0],  site:"weigh",     note:"進入 25 km/h・係員の指示に従う"},
 {n:2, name:"Dunmarra",      km:631.0,  open:[1,15,0], close:[2,14,0],  site:"roadhouse", note:"Highway Inn"},
 {n:3, name:"Tennant Creek", km:988.0,  open:[2,10,0], close:[3,11,0],  site:"lot",       note:"NO DRONE ZONE"},
 {n:4, name:"Barrow Creek",  km:1212.3, open:[2,13,0], close:[3,15,0],  site:"roadhouse", note:"本線復帰は砂利"},
 {n:5, name:"Alice Springs", km:1496.0, open:[3,8,0],  close:[4,10,30], site:"park",      note:"Traeger Park"},
 {n:6, name:"Erldunda",      km:1694.0, open:[3,11,0], close:[4,14,0],  site:"roadhouse", note:"2番目の入口から"},
 {n:7, name:"Coober Pedy",   km:2181.0, open:[3,16,0], close:[5,13,0],  site:"lot",       note:"路上駐車禁止"},
 {n:8, name:"Glendambo",     km:2434.1, open:[4,10,0], close:[5,17,0],  site:"roadhouse", note:"BP"},
 {n:9, name:"Port Augusta",  km:2720.3, open:[4,14,0], close:[6,13,0],  site:"oval",      note:"Central Oval"},
];
const RP_FINISH={km:3026.92, name:"Victoria Park (Adelaide)"};
const RP_START={km:0, name:"State Square (Darwin)"};
const RP_RULES={
 driverChange:{km:192.0, len:0.25, minutes:5, penaltyMin:10, side:"L", name:"Emerald Springs"},
 cutoffs:[
  {km:112, by:[1,13,30], name:"Adelaide River", to:"Katherine"},
  {km:226, by:[1,15,30], name:"Pine Creek", to:"Katherine"},
 ],
 katherineBySunset:true,
 saturdayNoSouthOfPA:{day:7, km:2720.5},
 csEntryLimit:25,
};
/* 等倍(×1)ゾーン: 右左折・信号・ラウンドアバウト・CS・交代地点の前後 [km] */
function rpScaleZones(){
 const pts=[];
 for(const m of RP_MANEUVERS) pts.push([m.km-0.45,m.km+0.25]);
 for(const e of RN_EVENTS) if(e.k==="signal"||e.k==="pedlight"||e.k==="roundabout") pts.push([e.km-0.4,e.km+0.2]);
 for(const c of RP_CS) pts.push([c.km-0.6,c.km+0.4]);
 pts.push([RP_RULES.driverChange.km-0.5,RP_RULES.driverChange.km+0.4]);
 pts.push([0,1.4]); pts.push([3014,RP_FINISH.km+0.2]);
 if(typeof OsmRoute!=="undefined") for(const t of OsmRoute.towns) if(t.zone!==false) pts.push([t.km0,t.km1]);   // OSM 実形状の町区間は等倍
 pts.sort((a,b)=>a[0]-b[0]);
 const z=[];
 for(const p of pts){ if(z.length&&p[0]<=z[z.length-1][1]+0.15) z[z.length-1][1]=Math.max(z[z.length-1][1],p[1]); else z.push([Math.max(0,p[0]),p[1]]); }
 return z;
}
