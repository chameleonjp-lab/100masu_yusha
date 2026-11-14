# エンジンAPI — engine-api

担当: game-implementation。実装は `src/engine/`（ルール）、`src/content/`（内容の組み立て）、`src/save/`（保存）。DOM・時計・`Math.random` を使わず、Node 22 とブラウザーで同じに動く（依存なし、ES modules）。形式の詳細は `docs/dev/script-format.md`、数値の根拠は `docs/dev/tuning.md`。

## テストの実行

```
node --test                       # tests/*.test.mjs を自動で見つけて実行（Node 22 ではこの形）
node --test tests/battle.test.mjs # 1ファイルだけ
```
Node 22.23 では `node --test tests/`（ディレクトリ指定）は動かない（ディレクトリをモジュールとして読もうとして失敗する）。`package.json` の `test` は `node --test` にするのがよい（統合担当へ提案）。テスト補助は `tests/fixtures/helpers.mjs`。

## 1. 内容を読む

```js
import { loadContentFromDisk } from './src/content/node.js';        // Node: data/ をファイルから
import { loadContentInBrowser } from './src/content/browser.js';    // ブラウザー: fetch + data/scripts/manifest.json
import { buildContent, coverage, isScripted } from './src/content/index.js'; // 部品を渡して組み立てる（読み込み元は差し替え可能）

const content = await loadContentFromDisk();            // 問題があれば ContentError（problems つき）
const content = await loadContentInBrowser('./');       // 'data/…' を基準URLから取る
```

`buildContent(raw, {strict:true})` の `raw`: `{ base, balance, tuning, patch, scripts:{events:[{name,json}],items:[…],equipment:[…]}, tuningSource }`。順に行う: 識別子の重複・参照・50件×4ルート×5区間・種類別の件数の検査 → 調整表（`data/tuning.json`）の取り込み（呪文・職・仲間・酒場・出目の加勢・通常敵の `bandOverrides`）→ 付録の `bosses` / `addedNormalMonsters` の取り込み → **EN09〜13 の差し替え**（`data/patches/encounters-balance-draft-2.json`。識別子・ルート・区間・分類を保ち、`name/scene/action/result/refs` を置換、`bands[].enemyIds` に追加、元の敵が同じルート・区間の別候補に残ることを検査。付録の提案文との一致も検査）→ スクリプトの結合（`_samples*` は本物に負ける）→ スクリプトの静的検査（`validateScripts`）。

`data/tuning.json` が必須（仮置き表は廃止）。`content` の主な中身: `version`（内容の版文字列。保存に入る）、`routes` `bands` `levelTable` `events`（差し替え後）`eventsByRB` `items` `gear` `spells`（呪文は調整値込み）`enemies`（通常敵8＋EN09〜13＋強敵3＋魔王。`bandStats` に区間別の値）`jobs` `companions` `taverns` `scripts`（`events` `items` `equipment`）`problems`（警告を含む）。

**未実装の見え方**: `coverage(content)` → `{events,items,equipment:{total,scripted,unscripted:[識別子]}, complete}`。`isScripted(content,'event'|'item'|'gear',id)`。エンジンは処理表のない出来事を `phase:'event'` + `event.unscripted:true`（`view().event.unscripted`、操作は `skipUnscripted` のみ）にし、`state.unscripted` に記録する。処理表のない品は `reason:'unscripted'` で使えず、処理表のない装備は基本の攻撃／防御だけ。UI は偽装してはいけない。

## 2. 冒険を作る・進める

```js
import { createRun, dispatch, view, boardFromExample } from './src/engine/index.js';

const run = createRun(content, { route: 'M', seed: 123456789, runId: 'r-…' });
// 例の盤面（検査用）: createRun(content, { route:'M', seed:1, runId:'example-fixture', board: boardFromExample(content, content.base.exampleBoards[0]) })
const { state, effects } = dispatch(content, run, { type: 'roll', opId: 'op-1' }, { rolls /* 検査用: 先に消費する0〜1の乱数の列 */ });
const v = view(content, state);
```

- `runId` は非空文字列で必須（省略・空欄は `bad_run_id`）。UIは新しい冒険ごとに `crypto.randomUUID()` 等で一意IDを発行し、保存からの再開時は元のIDを使う。同じseed・同じrouteでも別冒険のIDを再利用しない。エンジン内部では時計や乱数APIを呼ばない。
- `dispatch` は**入力の状態を変えない**。不正な操作は `EngineError`（`.code`）を投げ、状態は変わらない。`view().actions` で `enabled` の操作だけを出す。
- `opId` を付けると、同じ `opId` の再送は**何もしない**（`{state: 入力のまま, effects: [], replay: true}`）。直近120件を `state.ops` に持つ。確定操作ごとに `state.revision` が+1（再送では増えない）。
- 乱数は `state.rng = {seed, pos}`（位置を進める数列。状態に入れるので保存・再開で振り直さない）。出目・盤面・宿の品・酒場の候補・宝箱・霧狼の本体・戦闘の抽選はすべて引いた時点で状態に残す。
- 状態は JSON 1個（`JSON.parse(JSON.stringify(state))` で完全に往復できる）。

### 段階（`state.phase`）と操作

| phase | 意味 | 使える操作（`type`） |
|---|---|---|
| `board` | 振る前 | `roll`、`useItem`（board の品）、`equip{iid}`、`setSpells{ids}` |
| `rolled` | 出目の表示中（移動前） | `move`（`adjust?:{itemId,params}` で出目を変えて確定）、`useItem`（afterRoll の品） |
| `event` | 出来事の選択中／未実装 | `chooseOption{optionId,input?}`、`pickBagItem{index}`、`useItem{itemId}`（罠で AT02）、`skipUnscripted` |
| `chest` | 宝箱 | `pickChest{index}`、`skipChest` |
| `bagFull` | 袋が満杯（交換か辞退） | `bagSwap{index}`、`bagDecline`（宝箱では辞退すると箱に戻る） |
| `inn` | 宿場 | `rest`、`buy{slot}`、`sellItem{index}`、`sellGear{iid}`、`changeJob{jobId}`、`recruit{companionId,replaceId?}`、`service{serviceId,input?}`、`chooseOption`（サービス中の追加選択）、`equip`、`setSpells`、`useItem`（inn の品。BD40 は `params:{slot,newItemId}`）、`leaveInn` |
| `bossOffer` | 任意の強敵の挑戦／見送り | `challenge`、`skip` |
| `battle` | 戦闘 | `attack{target?}`、`guard`、`spell{spellId,target?}`、`item{itemId,params?,target?}`（または `useItem`）、`extra{id}`、`flee`（通常戦だけ） |
| `battleReward` | 勝利の報酬を表示中（反映済み） | `continue` |
| `gate` | 100番の城門前 | `challengeKing`、`equip`、`setSpells`、`useItem`（gate の品） |
| `retryOffer` | 負けた。`retry.stage` が `offer`＝再戦するか／辞退、`prep`＝再戦準備 | `retry`（権利を使い開始時点を復元）、`declineRetry`（結果へ）、`resumeBattle`（準備を終えて再開）、準備中は `equip` `setSpells` |
| `finished` | 結果が出た（魔王討伐・再戦辞退・権利消費後の敗北） | なし（`state.result`） |

装備と準備呪文を変えられるのは `board` `inn` `gate` と再戦準備だけ（出目の表示中・出来事の解決中・戦闘中は不可）。

### 状態（`state`）の主な項目

`schema` `rulesVersion` `contentVersion` `runId` `route` `seed` `revision` `ops` `phase` `rng` / `board:{squares:[{position,contentId,treasure?:{candidateIds,fallbackItemIds}}],innPositions}` / `pos` `furthest` `rolls` `xp` `level` `gold` `hp` `mp` `job` `spells:{learned,prepared}` / `gear:[{iid,id,paidGold,from}]` `equipped:{sword,armor}`（iid）/ `bag:[id…]`（最大6）`companions` / `turn:{die,rawDie,adjustUsed,preRoll}`（その手の着地時の目＝戦闘の出目の加勢に使う）`roll` `lastDie` / `done`（解決済みマス）`awards`（入金済みマス）`inns:{[pos]:{visited,restUsed,band,shop:{slots,bd40Used},tavern:{candidates,recruited},services}}` `chests:{[pos]:{opened,shown,taken}}` / `reservations` `reveals` `flags` / `event` `chest` `prompt`（一時停止中の問い。`cont` に残りの効果）`offer` `battle` `reward` / `retry:{used,stage,snapshot}` `victory` `result` / `discovered:{enemies,companions,gear}`（図鑑の差分。メタへ合流）`unscripted`。

- **勝利の記録**: 魔王に勝った時点で `state.victory` を立て、勝利の抽選と金貨・経験値・装備を反映し、袋の交換待ちがあれば `bagFull` で止まる。閉じて再開しても同じ画面（再抽選・二重入金なし）。`continue` で `result` が出て `finished`。
- **再戦**: 戦闘開始の記録（`retry.snapshot`：体力・魔力・袋・装備・準備呪文・仲間・戦闘そのもの）を取ってから戦う。`retry` は権利消費と復元を**同じ dispatch**で行う。体力・魔力は `max(開始値, 最大値の半分切り上げ)`。戦闘前（城門前の薬草など）に使った品は戻らず、戦闘中に使った品・魔力は戻る。灯り持ちの魔力は記録の**後**に足される（再戦の開始でもう一度働く）。

## 3. effects（画面と音へ渡す「起きたこと」）

`dispatch` が返す配列。金額・体力は確定値。例（`t` の一覧）:

- 移動: `dieRolled{raw,die,rolls}` `dieAdjusted{from,to,itemId}` `dieRuleSet` `moved{from,to,steps,discarded,die,raw,stop,xp}` `landed{pos,eventId,kind,name}` `castleReached` `innArrived{pos,band}` `innLeft`
- 資源: `gold{delta,before,after,reason}` `hp{delta,before,after,reason?,trapLoss?}` `mp{…}` `xp{amount,total,reason}` `levelUp{from,to,gains,stats}` `itemGained` `itemLost{reason}` `itemForfeited` `itemUsed{id,where}` `gearGained{id,iid,paidGold}` `gearOwned` `spellLearned` `spellKnown` `freeSpell` `bagFull{itemId,source}` `discover{kind,id}`
- 出来事: `optionChosen` `awardSkipped` `unscripted` `unscriptedSkipped` `reveal{kind,turn,data}` `reserved` `reservationApplied` `reservationExpired` `trapAvoided` `chestOpened{pos,shown,choices}` `chestTaken` `chestSkipped`
- 宿場: `rested` `bought{slot,id,price}` `sold{kind,id,price}` `jobChanged` `companionJoined` `companionSwapped` `serviceUsed` `shopSwapped` `equipped` `spellsPrepared`
- 戦闘: `bossOffer` `bossSkipped` `battleStart{enemyId,name,kind,band,maxHp,die,dieBonus}` `enemyTell{round,name,kind,tell,defense,attack,phase}` `guard` `spellCast{id,kind,cost}` `hit{target:'enemy'|'hero',amount,blocked?,base?,guarded?}`（`blocked:'decoy'|'immune'` は0ダメージ、ヒーローへの `blocked` は軽減量）`dieBoost` `dieSoften` `enemyAct{name,kind,attack,round}` `companion{id,role,amount}` `markAdded` `rule{owner,hook,id}` `phaseChange{hp}`（魔王の王冠。1戦1回）`fled` `victory` `rewards{gold,xp,gear,item}` `defeat` `retryOffered` `retryAccepted` `retryStarted` `runFinished{result}`

## 4. view(content, state)

画面が読む派生情報。計算を画面で繰り返さない。主な項目:

- `phase` `revision` `route{id,name}` `pos` `furthest` `rolls`
- `hero`: `level xp xpToNext hp maxHp mp maxMp attack defense gold`、`levelRow`、`job`、`spells{learned[{id,name,kind,power,mpCost,text,prepared}],prepared,slots}`、`equipment{sword,armor}`、`companions`、`bag{capacity,free,items[{index,id,name,category,effect,limit,sellPrice,scripted,uses}]}`、`gear[{iid,id,name,slot,stat,baseStat,effect,paidGold,equipped,sellPrice,diff{stat,before,after,delta}}]`
- `board`: `next6[{pos,kind,name,isInn,isCastle,hasChest}]`（100まで）、`inns[{pos,band,visited,restUsed}]`、`castle`、`nextStop`、`distanceToNextStop`、`minRolls{total,legs}`（理論上の最少手数：1→各宿→100を `ceil(距離/6)` で足す。固定の20ではない）
- `rolled`: `{raw,die,adjust,preview{legal,from,to,steps,discarded,stop},adjustOptions[{itemId,params,enabled,reason,preview{die,to,steps,stop}}],oneAdjustUsed}`（コンパスなどの**下見は状態を変えない**。`previewMove(content,state,adjust)` も使える）
- `event`: 正本の `scene/action/result` ほか、`unscripted`、`awarded`。`prompt`: `choice`（`options[{optionId,label,enabled,reason,reasonText,cost,afterGold,shortfall,input}]`）／`bagFull` ／`pickBagItem`。`chest`（候補と装備の差分）。`offer`。
- `inn`: `rest{available,hp,mp}`（取れる量）、`shop.slots[{slot,tier,type,id,name,detail,price,afterGold,enabled,reason,shortfall,diff}]`、`sell{items[{index,price}],gear[{iid,price,standardPrice,paidGold,sellable}]}`、`jobs`、`tavern{candidates,recruited,party,full,canRecruit}`、`services`。
- `battle`: `enemy{id,name,hp,maxHp,tell,response,band}`、`round`、`phase{index,name,changed}`、`telegraph{name,kind,tell,attack,defense,immune,hits,damageIfUnguarded,damageIfGuarded,heroAttackDamage}`、`targets`（霧狼の分身。`footprint:'fresh'|'old'`のみ。どれが本体かは見せない）、`marks`、`dieBonus`、`canFlee`、`spells[{id,cost,mpAfter,enabled,reason}]`、`items`、`history`、`companionNotes`。
- `reward`（勝利時の内訳。`itemState`: `added|prompt|resolved|none`）、`retry`、`victory`、`result`、`reveals`（直近6件）、`reservations`、`unscripted`
- `actions`: その段階で出す操作の一覧。各要素に `type` と必要な引数、`enabled`、無効なら `reason`（コード）と `reasonText`（日本語の既定文。画面は `src/locales/ja.json` で差し替える）。

## 5. 結果・図鑑・自己ベスト

```js
import { compareResults, rankResults, applyRunToMeta, createMeta } from './src/engine/index.js';
compareResults(a, b) // >0: a が上、<0: a が下、0: 同順位。比べる順は 討伐済み → 到達マス → 振った回数が少ない
rankResults(list)    // [{rank, result}] 同順位は同じ rank、次は人数分進む（1,2,2,4）
const { meta, discoveries, newBest, recorded } = applyRunToMeta(meta, finishedOrRunningRun) // 図鑑は発見のたびに合流、結果は冒険ごとに1回だけ記録（再実行しても変わらない）
```
`state.result = {runId, route, defeated, endedBy:'victory'|'declined'|'lost', furthest, rolls, level, job, companions, lostTo, pos}`。図鑑: 敵は出会った時（挑戦前の強敵の提示も）、仲間は酒場で見た時、装備は入手した時（売っても残る）。`meta = {metaVersion, settings, dex:{enemies,companions,gear}, bests:{<route>,all}, recordedRuns}`。

## 6. 保存（src/save）

```js
import { createIndexedDbStore, createMemoryStore, SaveError } from './src/save/index.js';
const store = createIndexedDbStore();           // ブラウザー。テストは createMemoryStore()

const loaded = await store.load();              // {status:'empty'|'ok'|'unsupported', run, meta, revision, metaRevision, raw?}
await store.commit({ run: state, meta, expectedRevision: loaded.revision, expectedMetaRevision: loaded.metaRevision, opId });
await store.startNew({ run: newRun, meta, expectedMetaRevision: loaded.metaRevision, confirmReplace: true });   // 「はじめから」：現在地を見せて確認してから
await store.saveMeta(meta, { expectedMetaRevision: loaded.metaRevision });                     // 設定・図鑑だけの更新
```
- `commit` は `{run, meta}` を**1つのトランザクション**で書く。失敗（容量不足など）は丸ごと取り消され、以前の記録が残る。呼び元は成功してから成功音・演出を出し、失敗なら同じ操作を再試行できる。
- `expectedRevision` が保存済みの `revision` と違えば `SaveError('stale_revision')`（古いタブの拒否）。別の冒険に置き換わっていれば `run_replaced`（古いタブからの復活を防ぐ）。**最初の保存は `expectedRevision: null`**。
- metaを書く `commit`・`startNew`・`saveMeta` は、読込時の `metaRevision` を `expectedMetaRevision` として必ず渡す。初回meta未保存はnull。不一致や既存metaがあるのに省略すると `stale_meta_revision` でrun/meta/backup全体を未変更にする。成功後は再読込で新しいmetaと世代を取得する。古いmetaに新番号だけ付け直して再送せず、最新metaへ意図した変更のみ再計算する。上の呼出例はそれぞれ独立した操作例であり、連続操作では間に再読込を挟む。
- 同じ冒険IDかつ同じ `opId` の再送は `{ok:true, replay:true}` で何も書かない。
- **未知の版・壊れた記録は自動で消さない**: `load` は `status:'unsupported'` と `raw` を返し、`commit` は `unsupported_record` で拒否、`startNew` は確認つきで新しく始め、古い記録は `backup` に残す（`loadBackup('unsupported-1')` など）。旧冒険を置き換えた時も `loadBackup()`（`previous-run`）。
- 保存の読取検査はformat/schema/rulesと中核構造の検査であり、全内容・全参照の完全なschema検証ではない。内容依存の整合性は別に確認する。
- 互換: `checkCompat(content, run)`（`src/engine/index.js`）→ `{ok, contentChanged}`。内容の版が変わっても進行中の盤面・配置・箱・抽選は状態に入っているので維持される。

## 7. 主要なエラーコード（`EngineError.code`）

`illegal_action`（今の段階で不可）`unknown_action` `bad_*`（引数）`insufficient_gold` `bag_full`（購入）`option_<reason>`（選択肢が無効：`option_insufficientGold` など）`item_<reason>` `item_unscripted` `no_such_item` `one_adjust_per_turn` `adjust_*` `spell_not_prepared` `insufficient_mp` `hp_full` `spell_active` `flee_forbidden` `target_required` `bad_target` `rest_used` `recruit_used` `party_full` `equipped_not_sellable` `not_owned` `retry_used` `swap_*`（BD40）`script_*`（処理表の不整合）。

## 8. 前提にした仮定（仕様に数値がなかったもの）

- 攻撃呪文は守りを無視して固定ダメージ（SP01 は 4＋2×レベル）、SP04 は通常攻撃×2（大技の予告）／×1（調整表）。
- 回復呪文は戦闘中だけ。体力が満タンなら選べない。
- 戦士の +6 は「直前のラウンドに防御し、今のラウンドの**通常攻撃**が当たった時」。呪文・道具には付かない。
- 酒場の候補は宿に初めて入った時に決めて保存する。仲間の図鑑登録は酒場で提示した時。
- 宿の地方枠の2つ目は、その区間の消耗品30・剣10・防具10（SW50 を除く）から等確率。第2〜5区間の1つ目は保証品（SP02/03/04・SW50）。装備や呪文の購入は、すでに持っていれば選べない。
- 転職は無料で何度でも（宿場で）。
- 宝箱は見送り（`skipChest`）もできる。袋が満杯で辞退した場合は箱に戻る。
- 魔王戦の段階変更：体力が `phaseTwoThresholdHp`（62）以下になったラウンドの敵の予告はそのまま実行し、次の予告は後半の1番目。

## 9. 個別戦闘・宿の追加契約（後続実装）

これらは対象イベントの型付き定義で有効になる機構であり、敵マスターや通常戦闘のルールを一括変更しない。

- `battle.scenario.attackChoices` / `guardChoices` は `id`, `label`, 任意の `when`, `effects`, `bonus`, `damageMode` を持つ。`damageMode` は `normal` / `none` / `pierce`。有効な候補がある手では `attack` / `guard` に `choiceId` が必要。未指定・不正選択は状態を変えず失敗する。`none` は通常攻撃命中や出目加勢消費に数えない。履歴には元の行動種別と選択 ID を残す。
- `scenario.roundActions` は指定ラウンドだけの敵予告、`announcements` は条件付き予告。敵予告の `hits` は回数、`rawDamage` は防御力計算前の代わりに使う一撃分の基本損失であり、その後の防御・軽減は適用される。`heal` は生存中の敵の回復予定。シナリオと使用済み予告フラグは保存・複製・再開する。
- `beforeEnemyAction` は敵行動直前、`afterEnemyHit` は各直撃後、`afterEnemyAction` は連撃全体の後に一度。途中の死亡・敵撃破で後続直撃を停止する。敵側 hit 通知の `amount` は実際に減った HP、`potentialDamage` は軽減後の潜在損失である。
- `enemyHeal` の `damage` は最大 HP までの実回復可能量。`hpRestored` は正の実回復だけを通知し、`battle.restoreSource` は `spell` / `item` / `companion` を区別する。
- 履歴参照 `battle.enemyActed`, `hitsTaken`, `guardShieldReduced` は `offset` / `abs` を受け付ける。`hitsTaken` は実 HP 損失があった直撃数。`guardShieldReduced` は防御行動と仲間の盾による実軽減だけで、装備・出目・その他の軽減は含めない。`battle.spellKind` は履歴指定時にその手の呪文種別を、指定がない時は現在の hook を参照する。
- `inn.restOptions` がある宿の `rest` は `choiceId` を要求する。通常休憩・休憩確認処理の後に選択効果を実行し、通常休憩は一回だけ。休憩の選択と道具の指定は別々の入力である。
- `reserve` の `nextTrapLoss` は `resource: hp|mp`, `amount` を持ち、次の該当する正の盤面罠損失だけを軽減する。違う資源、損失ゼロ、罠対処用道具の MP 支払では消費しない。MP の罠損失は `changeMp` の `meta.trapLoss` で明示する。
- 情報取得 `revealPreview` は状態を変更しない。`nextGold`, `nextInn`, `allBattles`, `nearestSquares`, `gearCandidates`, `battleHint` は対象なしを明示する。装備候補に将来の出目条件がある場合、候補と条件を提示し、未確定の取得品を断定しない。

限定実装と全イベント移行の完了は別である。個別シナリオの原文照合、実機受入、PR・CI・公開の検証状況は計画表で別途管理する。

### 9.1 追加の道具・予測契約

- `enemyHpDamage` は正の全種敵ダメージを HP に反映する直前、`enemyHpLost` は正の実 HP 減少直後。通常攻撃・呪文・道具だけでなく反射・仲間も含める。前者の `damage`、後者の `dealt` を区別する。
- `roundSetup` は各ラウンドの予告・記録・候補を生成した後、プレイヤーへ返す前に一回実行する。表示に影響する敵防御変更はここで行い、`heroTurnStart` の既存道具寿命とは混同しない。
- `battleActionPreview(content,state,action)` は状態と RNG を複製して具体的行動を実行し、実直撃合計・敵回復などだけを返す。候補や対象が未指定なら `available:false`。実状態・消費・保存は変更しない。
- AT30 の `enemyActionForecast` は最大3予告の条件付き予測。勇者が追加ダメージ・道具を使わず指定防御姿勢を続ける仮定で、現在の状態から毎回計算する。未来の選択結果を確定情報として表示しない。
- `assumeGuard` は道具使用履歴を消さず防御として扱う。`battle.heroAction` の防御判定と防御回数に加え、道具回数・種類数にも一度だけ数える。
- `scoutDecoyTargets` は AT31 で先に除外する偽物と残候補を返す。AT44 は予約した次の手だけ `attack.targets` に異なる1〜2候補を受け付け、本体への命中は一度だけ。分身なしの場合の追加7と、対象選択の原子的拒否を分離する。
- `pierceShellHit` は `reductionKind: shield|shell` と明示された軽減だけを合計6まで減らす。無印軽減、分身、完全無効は対象外。`weakenTemporaryDefense` は同フェーズ通常攻撃時の基礎防御を下限として、一時上昇部分を最大10だけ低く扱う。
- BD19/20/25 は盤面罠の正規選択コストだけに適用する。BD19 は実金貨支払後、BD20 は一個だけの損失置換後に回復。BD25 は残額を払える場合のみ最大110割引。売買・寄付・通常交換へ流用しない。
- BD27 の取り置きは通常休憩の実受取可能 HP のみ。宿固有効果や別道具の回復を取り置き元に含めない。BD45 は実際に新規加入した仲間 ID に結び付き、灯り・攻撃・盾・回復の自動支援を対象にする。いずれも期限と再戦の二重適用を別々に防ぐ。
- 敵由来 MP 減少は `enemyMpLoss` で明示し、勇者の呪文や道具の支払と区別する。一時的能力低下・継続 HP 損失は識別 ID と寿命を持つ `temporaryStatuses` で表現する。未付与状態を解除したことにしない。
