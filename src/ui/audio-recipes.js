// Authored sound recipes from docs/art/art-direction.md §7.3.
export const SFX = {
  // ---- 画面の操作（成立の音ではない） ----
  'ui.tap':      [{t:0,o:'noise',ft:'bandpass',f:4000,q:0.8,a:2,d:25,v:0.12}],                       // 紙を触る短い音
  'ui.confirm':  [{t:0,o:'triangle',f:660,a:3,d:90,v:0.14},{t:40,o:'triangle',f:990,a:3,d:110,v:0.10}],
  'ui.cancel':   [{t:0,o:'noise',ft:'lowpass',f:1500,q:0.7,a:2,d:40,v:0.12},{t:0,o:'sine',f:400,f2:300,g:60,a:3,d:70,v:0.12}], // 閉じる音
  'ui.deny':     [{t:0,o:'triangle',f:196,a:3,d:110,v:0.16}],                                           // 低い木の一打（不足・使えない）
  'card.flip':   [{t:0,o:'noise',ft:'bandpass',f:3000,f2:1200,g:120,q:1,a:10,d:110,v:0.10}],            // 紙をめくる
  'map.open':    [{t:0,o:'noise',ft:'bandpass',f:2500,f2:1200,g:180,q:0.8,a:20,d:160,v:0.08}],
  'map.close':   [{t:0,o:'noise',ft:'bandpass',f:1200,f2:2500,g:120,q:0.8,a:10,d:110,v:0.08}],
  'compass.tick':[{t:0,o:'square',f:2400,a:1,d:18,v:0.05},{t:0,o:'noise',ft:'highpass',f:5000,a:1,d:8,v:0.06}],
  'try.on':      [{t:0,o:'noise',ft:'bandpass',f:2000,q:1,a:20,d:180,v:0.08}],                         // 布の音

  // ---- 出発・サイコロ・歩く（木と革） ----
  'depart':      [{t:0,o:'triangle',f:392.00,a:5,d:180,v:0.20},{t:160,o:'triangle',f:523.25,a:5,h:60,d:260,v:0.20}], // 出発の二音 G4→C5
  'dice.rattle': {repeat:[0,70,150,240,340,460,610], short:[0,80,180],                                   // 転がる（間が広がる＝止まりかけ）
                  voice:[{o:'noise',ft:'bandpass',f:2200,q:4,a:1,d:15,v:0.18},{o:'triangle',f:1200,a:1,d:20,v:0.06}],
                  jitterF:0.08},
  'dice.lock':   [{t:0,o:'triangle',f:660,a:2,d:120,v:0.22},{t:0,o:'noise',ft:'bandpass',f:1800,q:3,a:1,d:12,v:0.20},
                  {t:0,o:'sine',f:1320,a:2,d:150,v:0.05}],                                                // 目が決まる「コトッ」
  'step':        [{t:0,o:'sine',f:110,f2:70,g:60,a:2,d:70,v:0.28},{t:0,o:'noise',ft:'BAND_FT',f:'BAND_F',q:'BAND_Q',a:2,d:38,v:'BAND_V'}],
                 // 1歩ごとに pan を -0.15 / +0.15 で交互、det を ±40 で交互
  'step.first':  'step を v×1.25、det +100 で1回',
  'land':        [{t:0,o:'sine',f:90,f2:55,g:120,a:2,d:160,v:0.40},{t:0,o:'noise',ft:'lowpass',f:400,a:2,d:80,v:0.20}],
  'door.bell':   {repeat:[0,45,95], voice:[{o:'sine',f:2093,a:1,d:300,v:0.07,detRand:15},{o:'sine',f:2637,a:1,d:300,v:0.05,detRand:15}]}, // 宿の戸の鈴

  // ---- お金・品 ----
  'coin.in':     [{t:0,o:'sine',f:1975.5,a:1,d:180,v:0.16},{t:0,o:'sine',f:5452,a:1,d:60,v:0.05},{t:0,o:'noise',ft:'highpass',f:6000,a:1,d:20,v:0.05},
                  {t:90,o:'sine',f:2637.0,a:1,d:260,v:0.16},{t:90,o:'sine',f:7278,a:1,d:80,v:0.04},{t:90,o:'noise',ft:'highpass',f:6000,a:1,d:20,v:0.05}], // 入金＝上がる二音 B6→E7
  'coin.pay':    'coin.in の2つの音を入れ替える（E7 を t:0、B6 を t:90）',                                // 購入＝下がる二音
  'bag':         [{t:0,o:'noise',ft:'lowpass',f:1200,a:10,d:110,v:0.14},{t:0,o:'sine',f:300,f2:180,g:50,a:2,d:60,v:0.12},
                  {t:140,o:'triangle',f:783.99,a:3,d:90,v:0.12},{t:230,o:'triangle',f:1046.5,a:3,d:140,v:0.12}], // 袋の口＋受け取りの二音
  'bag.full':    [{t:0,o:'triangle',f:523.25,a:3,d:80,v:0.10},{t:100,o:'triangle',f:493.88,a:3,d:120,v:0.10}],
  'item.use':    [{t:0,o:'noise',ft:'lowpass',f:1200,a:10,d:80,v:0.10},{t:0,o:'sine',f:300,f2:180,g:50,a:2,d:60,v:0.10}],
  'sheath':      [{t:0,o:'noise',ft:'bandpass',f:3000,f2:6500,g:220,q:6,a:30,d:190,v:0.14},{t:220,o:'triangle',f:1800,a:1,d:40,v:0.08}], // 剣を鞘へ「シャキン」
  'buckle':      [{t:0,o:'noise',ft:'bandpass',f:3000,q:8,a:1,d:10,v:0.20},{t:0,o:'square',f:800,a:1,d:15,v:0.05},
                  {t:20,o:'sawtooth',f:140,lp:600,a:10,d:80,v:0.04},
                  {t:70,o:'noise',ft:'bandpass',f:3000,q:8,a:1,d:10,v:0.20},{t:70,o:'square',f:1000,a:1,d:15,v:0.05}], // 留め具2つ＋革のきしみ
  'chest.open':  [{t:0,o:'noise',ft:'bandpass',f:3500,q:6,a:1,d:10,v:0.20},{t:0,o:'sawtooth',f:180,f2:120,g:250,lp:500,a:20,d:250,v:0.05},
                  {t:200,o:'triangle',f:1318.5,a:3,d:150,v:0.08},{t:260,o:'triangle',f:1568,a:3,d:200,v:0.08}],   // 留め金・ちょうつがい・きらり
  'learn':       [{t:0,o:'triangle',f:1046.5,a:3,d:120,v:0.08},{t:60,o:'triangle',f:1318.5,a:3,d:120,v:0.08},{t:120,o:'triangle',f:1568,a:3,d:260,v:0.08}],

  // ---- 回復・休む ----
  'heal':        [{t:0,o:'sine',f:523.25,a:60,h:200,d:600,v:0.09},{t:30,o:'sine',f:659.25,a:60,h:170,d:600,v:0.09},
                  {t:60,o:'sine',f:783.99,a:60,h:140,d:600,v:0.09},{t:60,o:'triangle',f:1046.5,a:60,h:100,d:500,v:0.04}], // 柔らかい和音 C E G
  'heal.full':   [{t:0,o:'sine',f:783.99,a:10,d:200,v:0.06}],
  'rest':        [{t:0,o:'sine',f:349.23,a:80,h:300,d:800,v:0.09},{t:40,o:'sine',f:440,a:80,h:260,d:800,v:0.09},{t:80,o:'sine',f:523.25,a:80,h:220,d:800,v:0.09}],

  // ---- 罠 ----
  'trap.warn':   [{t:0,o:'triangle',f:523.25,a:2,d:70,v:0.12},{t:0,o:'triangle',f:554.37,a:2,d:70,v:0.12},
                  {t:130,o:'triangle',f:523.25,a:2,d:70,v:0.12},{t:130,o:'triangle',f:554.37,a:2,d:70,v:0.12}], // ぶつかり合う二つの音を2回
  'trap.hurt':   [{t:0,o:'sine',f:160,f2:80,g:100,a:2,d:140,v:0.25},{t:0,o:'noise',ft:'lowpass',f:800,a:2,d:50,v:0.12}],
  'charm':       [{t:0,o:'noise',ft:'bandpass',f:2500,f2:5000,g:150,q:2,a:20,d:130,v:0.08},{t:60,o:'sine',f:1568,a:5,d:300,v:0.06}],

  // ---- 戦闘 ----
  'encounter':   [{t:0,o:'sine',f:70,f2:45,g:150,a:2,d:200,v:0.35},{t:120,o:'square',f:220,lp:1200,a:3,d:120,v:0.06},{t:220,o:'square',f:329.63,lp:1200,a:3,d:200,v:0.06}],
  'tell.attack': [{t:0,o:'noise',ft:'bandpass',f:1800,q:3,a:1,d:18,v:0.14},{t:0,o:'triangle',f:440,a:2,d:60,v:0.07}],
  'tell.big':    [{t:0,o:'sine',f:55,f2:52.3,g:900,a:250,h:400,d:300,v:0.22},{t:0,o:'sine',f:82.41,f2:78.3,g:900,a:250,h:400,d:300,v:0.14},
                  {t:0,o:'noise',ft:'lowpass',f:120,a:250,d:650,v:0.10}],                                   // 大技の前の低音（高い音を入れない）
  'tell.guard':  [{t:0,o:'noise',ft:'bandpass',f:900,q:2,a:1,d:30,v:0.14},{t:0,o:'square',f:180,lp:800,a:2,d:60,v:0.05}],
  'tell.open':   [{t:0,o:'noise',ft:'bandpass',f:1200,f2:500,g:260,q:0.8,a:40,d:220,v:0.08}],               // 息を吐く
  'slash':       [{t:0,o:'noise',ft:'bandpass',f:1500,f2:5000,g:110,q:1.5,a:5,d:105,v:0.14},
                  {t:110,o:'sine',f:150,f2:60,g:80,a:2,d:90,v:0.30},{t:110,o:'noise',ft:'lowpass',f:800,a:2,d:40,v:0.14}], // 振る風＋当たり
  'hit.party':   [{t:0,o:'sine',f:120,f2:50,g:120,a:2,d:140,v:0.30},{t:0,o:'noise',ft:'lowpass',f:600,a:2,d:60,v:0.14}],
  'shield':      [{t:0,o:'square',f:220,lp:2500,a:1,d:150,v:0.10},{t:0,o:'sine',f:330,a:1,d:150,v:0.12},
                  {t:0,o:'noise',ft:'bandpass',f:1500,q:3,a:1,d:30,v:0.16},{t:0,o:'sine',f:1250,a:1,d:320,v:0.06}],  // 短く硬い「ガン」（鐘のような長い余韻なし）
  'cast':        [{t:0,o:'triangle',f:783.99,a:3,d:120,v:0.08},{t:45,o:'triangle',f:1046.5,a:3,d:120,v:0.08},
                  {t:90,o:'triangle',f:1318.5,a:3,d:120,v:0.08},{t:135,o:'triangle',f:1568,a:3,d:160,v:0.08},
                  {t:0,o:'sine',f:400,f2:1200,g:300,a:20,d:280,v:0.05}],
                 // 呪文ごとの足し音（t:300から）: SP01 火花 = noise highpass 4000 a5 d200 v0.06（音量を細かく揺らしてパチパチ）
                 //   SP02 露の手当て = 'heal' / SP03 石の衣 = sine 1250 a1 d320 v0.06 / SP04 暁の一閃 = 'slash' の f2 を 8000 に
  'flee':        {steps:[0,70,140,210], stepV:0.7, panFrom:0, panTo:-0.6,
                  plus:[{t:0,o:'noise',ft:'bandpass',f:3000,f2:800,g:200,q:1,a:10,d:190,v:0.08}]},
  'enemy.down':  [{t:0,o:'noise',ft:'lowpass',f:2000,f2:200,g:300,a:5,d:295,v:0.15},{t:250,o:'sine',f:600,f2:1200,g:120,a:3,d:100,v:0.07}],
  'win.battle':  [{t:0,o:'triangle',f:523.25,a:3,d:150,v:0.12},{t:80,o:'triangle',f:659.25,a:3,d:150,v:0.12},
                  {t:160,o:'triangle',f:783.99,a:3,d:150,v:0.12},{t:240,o:'triangle',f:1046.5,a:5,h:120,d:400,v:0.12}],

  // ---- 成長・転職・加入 ----
  'levelup':     [{t:0,o:'triangle',f:523.25,a:3,d:140,v:0.12},{t:70,o:'triangle',f:659.25,a:3,d:140,v:0.12},
                  {t:140,o:'triangle',f:783.99,a:3,d:140,v:0.12},{t:210,o:'triangle',f:1046.5,a:3,h:80,d:300,v:0.12},
                  {t:300,o:'sine',f:2093,a:1,d:250,v:0.04},{t:300,o:'sine',f:2637,a:1,d:250,v:0.04}],
  'job.change':  [{t:0,o:'noise',ft:'bandpass',f:2000,q:1,a:20,d:180,v:0.08},
                  {t:0,o:'triangle',f:587.33,a:4,d:220,v:0.14},{t:180,o:'triangle',f:739.99,a:4,d:220,v:0.14},
                  {t:360,o:'triangle',f:880.00,a:4,h:150,d:400,v:0.14}],                                    // 上がる三音 D5→F#5→A5
  'join.call':   [{t:0,o:'triangle',f:523.25,a:4,d:160,v:0.13},{t:140,o:'triangle',f:659.25,a:4,d:200,v:0.13}], // 勇者の呼び C5→E5
  'join.answer': {at:360, gap:140, a:4, d:180, v:0.11,                                                   // 仲間の答え（仲間ごとに音色）
                  shield:{o:'square',lp:1500,notes:[392.00,523.25]}, medic:{o:'sine',notes:[783.99,1046.5]},
                  archer:{o:'triangle',notes:[880.00,1174.66]}, lantern:{o:'sine',notes:[659.25,880.00],vibrato:{hz:6,cents:10}},
                  battleSupport:'2つ目の音だけ、d:120'},

  // ---- 城・王冠・結果 ----
  'bell':        {f0:196, strike:{o:'noise',ft:'highpass',f:2000,a:1,d:15,v:0.08},                         // 城門の鐘（1回だけ）
                  partials:[{r:0.5,v:0.10,d:4000},{r:1,v:0.20,d:3200},{r:1.19,v:0.12,d:2600},{r:1.5,v:0.08,d:2200},
                            {r:2,v:0.14,d:2000},{r:2.51,v:0.05,d:1400},{r:2.99,v:0.03,d:1000}], o:'sine', a:3},
  'crown.crack': [{t:0,o:'noise',ft:'highpass',f:3000,a:1,d:60,v:0.20},
                  {t:0,o:'noise',ft:'bandpass',f:4000,q:10,a:1,d:8,v:0.18},{t:25,o:'noise',ft:'bandpass',f:5200,q:10,a:1,d:8,v:0.18},
                  {t:50,o:'noise',ft:'bandpass',f:6100,q:10,a:1,d:8,v:0.18},
                  {t:40,o:'sine',f:2400,f2:1600,g:400,a:1,d:420,v:0.10},{t:0,o:'sine',f:70,a:2,d:200,v:0.25}],   // 高いガラスのひび＋小さな落下音
  'victory':     [{t:0,o:'triangle',f:392.00,a:5,d:200,v:0.16},{t:160,o:'triangle',f:523.25,a:5,d:200,v:0.16},  // 出発の二音 G4・C5 の続き
                  {t:320,o:'triangle',f:659.25,a:5,d:200,v:0.16},{t:480,o:'triangle',f:783.99,a:5,d:200,v:0.16},
                  {t:640,o:'triangle',f:1046.5,a:5,h:400,d:800,v:0.16},
                  {t:640,o:'sine',f:523.25,a:30,h:600,d:900,v:0.06},{t:640,o:'sine',f:659.25,a:30,h:600,d:900,v:0.06},{t:640,o:'sine',f:783.99,a:30,h:600,d:900,v:0.06}],
  'defeat':      [{t:0,o:'triangle',f:329.63,a:5,d:250,v:0.14},{t:260,o:'triangle',f:261.63,a:5,d:300,v:0.14},{t:520,o:'sine',f:130.81,a:20,d:600,v:0.12}], // 短い終止
  'best':        [{t:0,o:'sine',f:1568,a:2,d:500,v:0.08},{t:0,o:'sine',f:2093,a:2,d:500,v:0.06},{t:120,o:'triangle',f:3136,a:1,d:200,v:0.04}],
  'new.entry':   [{t:0,o:'triangle',f:1318.5,a:2,d:160,v:0.07}],
};
