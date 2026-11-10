# 処理表（スクリプト）の形式 — script-format

担当: game-implementation（形式と解釈）。変換は data-conversion が行う。実装は `src/engine/` と `src/content/validate.js`。語彙の一覧（どれが実装済みか）は `src/engine/formats.js` が正本で、検査ツールも同じ表を読む。

- 表示文（`scene` / `action` / `result`）から数値や品名を拾って処理しない。**処理は、ここで決める型付きの値だけ**で決まる。
- 処理表がない出来事・品・装備は「未実装（unscripted）」として見える（`coverage(content)`、`view().event.unscripted`、使えない品の `reason: 'unscripted'`）。エンジンは動きを作らない。
- 文章だけで処理がない「次へ」ボタンは不可。出来事は `onLand`（着地で自動実行）か `options`（選択）のどちらかを必ず持つ。宿場だけは共通機能があるので `inn` だけでもよい。
- 型にできない効果は `custom`（`src/engine/custom/index.js` に識別子ごとの関数を置き、検査で一覧化する）。まず型で書けないか考える。

## 1. ファイル

| 置き場所 | 中身 | 先頭の `format` |
|---|---|---|
| `data/scripts/events/*.json` | 出来事。ファイルの分け方は自由（予定は `M1.json`〜`H5.json` の20本×50件）。同じ識別子を複数ファイルに書くとエラー | `event-scripts-1` |
| `data/scripts/items.json`（または `_samples-items.json`） | 消耗品150件 | `item-scripts-1` |
| `data/scripts/equipment.json`（または `_samples-equipment.json`） | 装備100件 | `equipment-scripts-1` |
| `data/scripts/manifest.json` | ブラウザーが読むファイル一覧（`script-manifest-1`）。**ファイルを足したら必ず追記する**（Node の読み込みはディレクトリを見る。テストが両者の一致を確かめる） | — |

名前が `_samples` で始まるファイル（game-implementation が書いた代表変換）は、同じ識別子を本物のファイルが持っていれば**本物が優先**される（エラーにならない）。本物どうしの重複は `script-dup` エラー。

```json
{ "format": "event-scripts-1", "events": { "M1-42": { ... }, "M1-48": { ... } } }
{ "format": "item-scripts-1", "items": { "HE01": { "uses": [ ... ] } } }
{ "format": "equipment-scripts-1", "equipment": { "SW07": { "rules": [ ... ] } } }
```

オブジェクトのキーが識別子。中に `id` を書くならキーと同じにする。正本に無い識別子はエラー。

## 2. 式と条件（expression）

条件も式の一種（真偽値を返す）。JSON で次のノードを使う。1ノードにキーは1つだけ。

| 種類 | 書き方 |
|---|---|
| リテラル | 数、文字列、真偽値、配列（要素は式） |
| 参照 | `{"ref":"hp"}`、`{"ref":"itemCount","id":"BD28"}` |
| 計算 | `add`/`mul`: `{"add":[a,b,..]}`、`sub`: `{"sub":[a,b,c]}`＝a−b−c、`floorDiv`/`ceilDiv`: `{"ceilDiv":[a,b]}`、`min`/`max`: `{"min":[..]}`、`neg`、`sum`（配列の合計）、`clamp`: `{"clamp":[x,lo,hi]}`、`if`: `{"if":[条件,a,b]}` |
| 比較 | `eq` `ne`（JSON の深い比較）、`gt` `gte` `lt` `lte`: `{"gte":[a,b]}`、`between`: `{"between":[x,lo,hi]}`、`in`: `{"in":[x,[..]]}`、`even` `odd` |
| 論理 | `and` `or`（配列）、`not` |
| 戦闘の手の並び | `{"actions":{"rounds":[-2,-1],"anyOrder":["attack","guard"]}}`。`rounds`は今のラウンドからの相対（0=今、−1=前）。`abs`で絶対番号。判定は `is`（全部同じ）/`sequence`（順番どおり）/`anyOrder`（順不同）/`distinct`（全部違う）/`includes` |

### 参照（ref）一覧

`✓` は実装済み。引数がある参照は同じノードに書く。

- 一行の状態: `gold` `hp` `mp` `maxHp` `maxMp` `level` `xp` `pos` `band` `rolls` `job` `bagCount` `bagFree` `companionCount` ✓
- `itemCount{id}` `hasGear{id}` `hasSpell{id}` ✓、`flag{key}`（`setFlag` で立てた印。無ければ false）✓
- 出目: `die`（今の目。振った後は調整後、着地後はその手の着地時の目）、`rawDie`（素の目）、`prevDie`（前の手で確定した目。初手は null）✓
- 盤面: `nextStop`（次に強制停止する番号＝未訪問の宿場か100）、`stopPos{die:式}`、`forcedStop{die:式}`（その目が強制停止先に届くか）✓
- 入力: `var.<名前>`＝選択肢の `input` や品の `inputs` で受け取った値 ✓
- 移動後（`moveConfirm` のルールだけ）: `move.die` `move.steps`（実際に進んだ数）`move.discarded`（捨てた数）`move.stop`（`normal`/`inn`/`castle`）`move.from` `move.to` `move.adjustItem` `move.adjustDelta` ✓
- 戦闘（戦闘中のルール・効果）: `battle.round` `battle.isKing` `battle.isOptional` `battle.enemyId` `battle.enemyHp` `battle.enemyMaxHp` `battle.startHp` `battle.startMp` ✓
- 手の履歴（`offset`＝今のラウンドからの相対、`abs`＝絶対番号）: `battle.heroAction`（`attack|guard|spell|item|extra|null`）`battle.hpLost`（勇者が失った体力）`battle.attackHit`（通常攻撃が本体に当たったか）`battle.guarded` `battle.enemyKind`（その手に予告された行動の種類）`battle.enemyHealed` ✓
- フックの中: `battle.damage`（計算中の被害／与ダメージ／回復量）`battle.dealt`（実際に減らした敵体力）`battle.attackKind`（`attack|spell|item`）`battle.spellCost` `battle.spellMpAfter` ✓
- `battle.count{what}`（`attackHits` `attacks` `guards` `spells` `items` `attackSpells` `healSpells` `enemyActions` `hitsTaken` `distinctItems`。今のラウンドの行動も数える）✓
- 前の手の記録（`offset`/`abs`）: `battle.reduced`（防御・盾役などで軽くした量）`battle.spellCostPaid`（呪文で払った魔力）`battle.companionsActed`（自動支援した仲間の人数）✓
- そのほか: `itemCategory{id:式}`（品の分類。`id` に `{ref:"var.x"}` を書ける）、`sinceInn`（最後に訪れた宿場からの距離）✓

未知の参照・未知の演算子は検査で `script-ref` / `script-expr` エラー。

## 3. 効果（effect）

効果は `{"op": 名前, ...}` の配列で、先頭から順に実行する。`if` と `choice` と `battle` は流れを変える。入れ子の途中で袋が満杯などになると一時停止し、答えを受けたあと**残りの効果を続ける**（途中で保存・再開しても同じ）。

### 資源

| op | 引数 | 意味 |
|---|---|---|
| `awardGold` | `amount` | 入金。**正本の `directGold` と一致する場合だけ**（100〜1,000G、同じ冒険・同じマスで1回。2度目は `awardSkipped`）。出来事の中だけ。戦闘の勝利金・売却・買い物とは混ぜない |
| `payGold` | `amount`, `clamp?` | 支払い。足りなければエラー（`clamp:true` なら持ち金まで）。ふつうは選択肢の `cost.gold` を使う |
| `hp` | `delta`(式), `floor?`, `trapLoss?`, `reason?` | 体力の増減。増加は最大体力で止まる（体力0の一行は回復しない）。減少の下限は `floor`（省略は **1**）。罠の損失には `trapLoss:true` |
| `mp` | `delta`(式), `floor?` | 魔力の増減（減少の下限の省略は 0） |
| `xp` | `amount` | 経験値（レベルアップは自動） |
| `giveItem` | `id`, `onFull?` | 消耗品を袋へ。6個で満杯なら**交換か辞退**の選択（`bagFull` 段階）。`onFull:"skip"` なら黙って見送る |
| `giveGear` | `id`, `paidGold?` | 装備を入手。**現金で払った額は必ず `paidGold` に書く**（売値の上限になる）。すでに持っていれば何も起きない（`gearOwned`） |
| `learnSpell` | `id` | 呪文を覚える（準備枠が空いていれば自動で準備） |
| `loseItem` | `id`（品の識別子、または `{ref:"var.x"}` などの式）と `count?`、または `choose:true` | 品を失う。`choose:true` は袋から1個選ばせる（`pickBagItem`）。入力で選んだ品を消費する（HE47）には式の `id` |
| `setFlag` | `key`, `value?` | 冒険全体の印（`ref:"flag"`で読む） |

### 流れ

| op | 引数 | 意味 |
|---|---|---|
| `if` | `cond`, `then`, `else?` | 条件で枝分かれ |
| `choice` | `options`, `prompt?` | 効果の途中の追加選択（形は §4 の option と同じ） |
| `battle` | `enemy`, `optional?`, `field?`, `rules?`, `extraActions?`, `onWin?` | 戦闘開始。**その効果列の最後に置く**。`optional:true`（または強敵 MB01〜03）は先に「挑む／見送る」（`bossOffer`）。`field.enemyHp:{delta,min}` は開始時の敵体力。`rules` はその戦闘だけの仕掛け（§6 のルール）。`extraActions:[{id,label,when?,effects}]` はその戦闘だけの追加行動。`onWin` は勝利の報酬を受け取った後に実行 |
| `reserve` | `slot`, … | 予約。§5 |
| `reveal` | `info`, … | 情報を計算して保存し、`reveals` に載せる。`info`: `nextBattleEnemy`（次の通常戦の敵）/ `nearestBattles`（`count`件。`withActions:true` で行動一覧）/ `nearestTraps`（`count`件と選べる代価）/ `nextEnemyAction`（戦闘中。次の予告）/ `squaresAhead`（`from`〜`to` 先のマスの種類。`kinds` で絞る。BD08・BD15・BD47 向け）/ `sixOutcomes`（今の場所から出目1〜6の着地先と種類。BD30 向け） |
| `custom` | `id`, `args?` | 名前付き関数（`src/engine/custom/`） |

### 戦闘の中だけ（ルール／品の効果の中で使う）

| op | 意味 |
|---|---|
| `dealDamage {amount, times?, boostable?, leave?}` | 敵へ固定ダメージ（防御は無視。偽物・攻撃無効には0）。`times` 回、1撃ずつ計算し、倒れたら終わる。`boostable:true` は出目（大）の加勢を受ける（火薬玉だけ）。`leave:1` は敵の体力をそれ未満にしない（AR06 の反射） |
| `addMark {mark}` | 戦闘中だけの待機ルールを足す（§6）。`mark.unique` が同じものが既にあればエラー（重ねない） |
| `addDamage {amount}` / `subDamage {amount,min?}` | `heroAttackDamage`：与ダメージの増減 |
| `reduceDamage {amount,min?,max?}` / `increaseDamage {amount}` / `halveDamage {round?}` / `capDamage {amount}` / `absorbDamage {amount}` | `enemyDamage`：受ける被害の増減。`absorbDamage` は印ごとの総量（石の衣・綿毛の盾向け）。`halveDamage` は被害が0なら何もしない |
| `reduceCost {amount,min?}` | `spellCost`：呪文の消費魔力の増減（最低 `min`、省略1） |

## 4. 出来事（event）

```json
"M1-42": {
  "onLand": [ ...効果... ],                       // 着地した時に自動で実行（任意）
  "options": [ { "id":"wage", "label":"給金をもらう", ...}, ... ],   // 選択（任意）
  "inn": { "services": [ ... ] },                 // 宿場だけ：固有の一度限りの特典（任意）
  "notes": "..."                                  // 自由記述（任意）
}
```

流れ: 着地 → `onLand` を実行 → `options` があれば選択待ち（段階 `event`）→ 選んだら代価を払い、効果を実行 → 終了で箱があれば `chest` → `board`。`onLand` の途中で戦闘に入れば、戦闘が終わってから終了する。

### option（選択肢・追加選択・宿のサービス共通）

```json
{ "id":"hire", "label":"荷運びに60Gを払う",
  "input": { "var":"n", "type":"int", "min":1, "max":6 },        // 任意：受け取る入力（intは範囲、enumは values）
  "requires": [ { "when": 条件, "reason": "bagFull" } ],          // 任意：成立条件（失敗の理由コード）
  "cost": { "gold": 60, "hp": {"amount":3,"floor":1}, "mp": {"amount":1,"strict":true}, "items": ["BD28"], "trapLoss": true },
  "effects": [ ... ] }
```

- `cost` は**先に支払い**、そのあと `effects`。`gold`・`items`・`mp.strict:true` は**足りなければ選べない**（理由 `insufficientGold` / `missingItem` / `insufficientMp`、不足額つき）。`hp`・`mp`（strictなし）は下限（`floor`、省略: hp=1, mp=0）まで払うだけで、選べなくなることはない。
- 罠（`罠`）の出来事では代価の体力・魔力・金貨を `trapLoss` として見せる（`cost.trapLoss:true` か `hp` 効果の `trapLoss:true`）。**身代わり札 AT02** は罠の選択前に使うと、選択肢を選ばずに無傷でその罠を終える（品側の `where:["trap"]`）。
- 金貨を払って装備を買う選択肢（`cost.gold>0` かつ `giveGear`）は、**すでにその装備を持っていれば選べない**（`alreadyOwned`）。無料の選択肢は持っていても選べる（何も起きない）。選択肢が全部選べなくなる事態は作らない。
- 代価もなく効果もない選択肢（「見送る」）は `"effects":[]` と書く。
- `repeat` のような繰り返し記法はない。数字を選ぶ問題は `input` で1つの選択肢にする（B3-26）。

### inn.services

```json
{ "id":"wash", "label":"畑主の洗い場を使う（体力2回復）", "once": true, "requires": [...], "cost": {...}, "input": {...}, "effects": [ ... ] }
```
`once`（省略は true）なら、その宿で1回。無料休憩・売店・転職・酒場はエンジンの共通機能なので書かない。サービスの効果が `choice` を持てば、宿のまま追加選択になる。

### 戦闘の出来事の書き方

- 通常戦: `"onLand":[{"op":"battle","enemy":"EN09"}]`
- 任意の強敵: `"onLand":[{"op":"battle","enemy":"MB03","optional":true,"rules":[...]}]`（見送り＝戦闘も報酬もなし。挑戦後は逃走不可）
- 着地前の問題で変わる戦闘: `options` の中の `if` で分けて、それぞれの末尾に `battle`（B3-26）。
- 敵の能力・行動表は `data/tuning.json`（`bandOverrides` は戦闘が起きた区間で選ぶ）と付録から。**出来事側には書かない**。

## 5. 予約（reserve）

`{"op":"reserve","slot":…}`。品の効果・宿のサービスから「次の戦闘」「次の移動」「その場所に着いた時」へ効果を預ける。

| slot | 引数 | 意味 |
|---|---|---|
| `nextBattle` | `filter?`(`any`/`normal`/`optional`/`king`)、`withinMoves?`、`rules[]`（戦闘中だけのルール＝印）、`onStart[]`（戦闘開始時に実行する効果）、`unique?` | 次に始まる条件に合う戦闘に印を渡す。`withinMoves:n` なら「以後n回の移動以内に始まる戦闘」だけ（n回を超えたら消える）。戦闘開始の記録（再戦用）より**前**に渡すので、再戦でも二重には働かない |
| `thisMove` | `rules[]`（`hook:"moveConfirm"` 固定、`when`, `effects`） | 次に確定する移動 1回だけ評価される（`move.*` が使える） |
| `arrival` | `pos`(式), `withinMoves`, `effects[]`, `unique?` | その番号に着いた時（`withinMoves` 以内）。期限を過ぎると何もなく消える |

共通: `label?`（画面の表示用）。`unique` が同じ予約が残っていればエラー。

## 6. ルール（rule / mark）

装備・仲間・戦闘用の仕掛け・待機効果は、同じ「ルール」の形で書く。

```json
{ "id":"riposte", "hook":"heroAttackDamage",
  "when": 条件,                                  // 省略可
  "limit": { "perBattle":1, "perRound":1 },       // 省略可。perMove は移動のフック用
  "stage": "gear",                               // enemyDamage だけ。下の順番
  "effects": [ ... ] }
```
待機効果（印 / mark）だけが持てる項目: `uses`（残り回数）、`expires:{"enemyActions":n}`（今の敵の行動を1つ目と数えてn回の行動まで）または `{"heroTurns":n}`（次からのn回の自分の手番まで）、`unique`（同じ印を重ねない）、`label`、`cancelWhen`（印を作ったラウンドより後に、勇者の行動が決まった時点で真なら印を消す。「防御以外を選ぶと消える」「呪文を使うと消える」用）。印は戦闘が終われば必ず消える。印が別の印を作ることもできる（「2回目の手番の初めに」は `heroTurnStart` の印が `heroTurnStart` の印を作る）。

### フック

| hook | いつ | 使える ref / op |
|---|---|---|
| `battleStart` | 戦闘開始（再戦の開始も） | 資源の op |
| `heroTurnStart` | 勇者の手番の初め（前のラウンドまでに作られた印だけ働く） | 資源の op |
| `afterHeroAction` | 勇者の行動が終わった直後（仲間・敵の行動の前）。「〜を選んだ直後」「3種類とも違う行動が成立した直後」 | `battle.spellCost`＝呪文で払った魔力 |
| `heroAttackDamage` | 勇者の直接ダメージ（通常攻撃・呪文・道具）の計算中。**当たった時だけ**（偽物・攻撃無効では呼ばない） | `battle.attackKind`, `battle.damage`; `addDamage` `subDamage` |
| `heroHit` | 直接ダメージを与えた後 | `battle.dealt` |
| `enemyDamage` | 敵の攻撃の被害の計算中（攻撃力0の手は呼ばない） | `battle.damage`; `reduceDamage` `increaseDamage` `halveDamage` `capDamage` `absorbDamage` |
| `afterEnemyAction` | 敵の行動の後（勇者が倒れていても呼ぶ。「生き残った時」は `when` で書く） | `battle.hpLost`, `battle.enemyKind` |
| `roundEnd` | 双方が生きているラウンドの終わり | |
| `victory` | 敵が倒れた瞬間。**全ルールの `when` を先に判定してから**効果を実行（AR29 の体力4分の1は他の回復の前に記録） | |
| `spellCost` | 呪文の消費魔力の計算中 | `battle.spellCost`; `reduceCost` |
| `spellHeal` | 回復呪文が回復する直前 | `battle.damage`＝回復量; `addDamage` |
| `moveConfirm` | 移動確定時 | `move.*`; 資源の op |
| `restConfirm` / `trapLoss` | **予約のみ（未実装）**。AR15・AR37・AR16・HE09・HE24 等はこの形で書けるが、エンジンはまだ呼ばない（検査は `script-hook-unwired` の警告） | |

### 軽減の順番（`enemyDamage`）

防御（半分を切り上げ、組み込み）→ `stage:"wall"`（石の衣 SP03）→ 盾役の仲間（組み込み）→ `stage:"shield"` → `stage:"gear"`（省略時）→ 小さい出目の加勢（組み込み）→ `stage:"die"` → `stage:"card"`（身代わり札 AT02）。どの段階も0未満にしない。**被害が0なら、使い切りの印（`uses`）は残る**（`when` に `battle.damage > 0` を書く）。

### 出目の加勢（調整表 `dieBonus`）

戦闘が起きたマスに着地した調整後の目: 1/2/3 は**最初の正の被害**から 6/5/4 を引く、4/5/6 は**最初の直接ダメージ**（通常攻撃・攻撃呪文・`boostable` の火薬玉）に 4/5/6 を足す。防御・回復・予告確認では使わない。その手に戦闘が起きなければ消える。

## 7. 品（消耗品）

```json
"AT02": { "uses": [
  { "id":"battle", "where":["battle"], "unique":"AT02", "effects":[ {"op":"addMark","mark":{...}} ] },
  { "id":"trap",   "where":["trap"],   "effects":[ {"op":"negateTrap"} ] }
] }
```

`uses[]` の1件 = 使い方1つ。

- `where`（使える場面）— 実装済み: `battle`（勇者の1行動）、`board`（振る前）、`afterRoll`（出目の表示中）、`inn`、`gate`（城門前）、`trap`（罠の選択前）。**予約のみ（未実装）**: `restConfirm` `event` `chestPick` `bossChallenge` `recruit` `equipConfirm` `trade` `victoryConfirm` `flee`（品の列挙は `src/engine/formats.js` の `ITEM_WHERE`）。
- `inputs`: `[{"id","type","min","max"|"values"|"of","optional?"}]`。型は `int` `enum` `string` `sequence`（`of` の並べ替え）`ints`（重複なしの整数を `minCount`〜`maxCount` 個、`min`〜`max`）。値は `var.<id>` で読む。
- `requires`: `[{"when":条件,"reason":"mpFull"}]`。失敗の理由コードは画面の「使えない理由」になる（`hpFull` `mpFull` `nothingToRestore` `used` `notNow` `bagFull` ほか。`src/engine/options.js` の `REASON_TEXT`）。
- `unique`: 戦闘の印を重ねない（同じ `unique` の印が残っていれば `alreadyActive` で使えない）。
- `effects`: §3 の効果。出目を変えるものは次のとおり。
  - `adjustDie {to: 式, constraints?}`（`afterRoll`）: 結果は1〜6でなければならない。`constraints`: `mustDiffer`（変わらないなら使えない）、`needPrev`（前の手の目が必要）、`sameForcedStop`（変える前後が同じ宿場／100に止まる場合だけ）、`evenOnly`。1手に1個まで（`one_adjust_per_turn`）。
  - `setDieRule {table:{"4":3,...}}`（`board`）: 次に1回振る時の素の目の読み替え。目が変わらなくても消費する。
  - `revealShop`（BD09）、`showLandingOdds {within}`（BD43。入力 `target`）、`swapShopSlot`（BD40。入力 `slot`=2〜3・`newItemId`）。
- **消費と取消**: 効果を実行する直前に袋から1個減らし、効果が条件に合わずエラーになれば**まるごと取り消す（消費されない）**。「対象なしなら消費しない」はこれで表せる。先払い（変化がなくても消費）は、効果がエラーを出さなければそうなる。
- 使えるかどうかは**実際に効果を試運転して**決める（`view().actions`／`itemStatus`）。品ごとの別実装は要らない。
- コンパス（BD01）などの「見てから決める」ものは、画面側が `view().rolled.adjustOptions`（各候補の着地先つき）で見せ、確定は `dispatch({type:"move", adjust:{itemId, params}})`。見るだけでは何も消費しない。

## 8. 装備

```json
"SW07": { "rules": [ { "id":"riposte", "hook":"heroAttackDamage", "when":…, "limit":{"perBattle":1}, "effects":[…] } ] }
```
基本の攻撃／防御（`baseStat`）は正本から読む。**スクリプトは追加効果のルールだけ**。効果がない装備（SW01・AR01）は `"rules":[]` と書いて「処理済み」にする。装備しているものだけが働く。「1戦1回」は `limit.perBattle:1`、「1勝につき1回」も `perBattle:1`（`victory`）、「1手1回」は `perMove:1`。

## 9. 仲間・職・呪文

調整表 `data/tuning.json` の `companions`（`role`: `shield` `medic` `thrower` `lantern`、または `rules`＋`effect.rules[]` でルールを直接書く）、`jobs`、`spells` に数値がある。engine が `role` ごとに動かす。新しい役目が要るなら、ルール形式（`role:"rules"`）で書けば engine の変更なしで足せる。

## 10. 検査

`validateScripts(content, problems)`（`src/content/validate.js`、`buildContent` が自動で呼ぶ）が次を `error` にする: 未知の op・ref・hook・stage・where・識別子、`awardGold` が `directGold` と違う／出来事の外、`battle` が最後でない、未知の `custom`、option の重複や label なし、空の出来事（`onLand`も`options`もない。宿場を除く）、装備の `rules` 欠落。`warn`: 予約のみ（未実装）の hook・where・op、罠なのに損失の印がない。
**未実装の使用場面を含むスクリプトは、書いてよいが動かない** — 警告の一覧が data-conversion の「エンジン待ち」の一覧になる。

## 11. 代表変換の対応表

| 識別子 | 使った要素 |
|---|---|
| M1-01 / M1-42 / B2-02 | `awardGold`（完了で入金）、選択で入金／回復、`reveal`、`cost.hp` |
| M1-48 / B2-48 | 罠: `cost.gold` で選べない・`cost.hp`（最低1）、`if` + `ref:die`、AT02 |
| B2-43 / B3-26 / B5-30 / M1-24 他 | `battle`（通常／`field.enemyHp`／任意の強敵＋`rules`） |
| F5-13 / F1-12 / H3-46 / F2-20 / M3-44 | `giveGear{paidGold}`、`cost`、見送り（`effects:[]`） |
| H1-37 | `inn.services`（一度限りの特典） |
| M1-18 | 装備＋宝箱（箱はエンジンが添える） |
| B3-32 / B3-46 / H4-25 / B3-36 | `giveItem`、`cost.items`、`requires`、`onLand` の `if` |
| HE01 HE02 HE11 | 回復と式（`ceilDiv` `min`）、`inputs` の任意入力 |
| AT01 AT02 AT03 AT11 | `dealDamage` `addMark`（`uses` `expires` `unique` `stage`）`halveDamage` `negateTrap` |
| BD01 BD02 BD11 BD41 BD42 | `adjustDie` `setDieRule` と `constraints` |
| BD09 BD40 BD43 | `revealShop` `swapShopSlot` `showLandingOdds` |
| BD49 BD50 | `inputs`（`sequence` `ints`）、`setFlag`、`reserve nextBattle / arrival` |
| SW07 SW50 AR07 AR29 SW01 AR01 | ルール: `heroAttackDamage` `moveConfirm` `victory`、`actions` 条件、`limit` |
