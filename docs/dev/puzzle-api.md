# 型付きパズル API / 再開手順

## 正本と所有

- 処理モデル: `src/engine/puzzles.js`。純粋関数は元stateを変更せず、新stateと結果だけを返す。
- 盤面接続: `events.js`。`items.js`が使用場所と可変入力を判定、`index.js`がdispatch。
- データ: `data/scripts/events/*.json` の `puzzle`。補完内容の区別は `puzzle-authored-data.md`。
- 表示: `view.js` → `src/ui/app.js`。`answer`/`differences` はviewへ渡さない。
- アイテム: `data/scripts/items.json` の9件は `puzzleAssist` op。費用や効果を日本語から推測しない。

## metadata

共通: `id`, `kind`, `labels?: {公開ID:日本語}`, `prompt?`, `display?`, `cluePair?:{scene,option}`。
- choice: 既存 `options` を本番回答として使う。`candidates:string[]`, `answer:string`。
- sequence: `candidates:string[]`, `answer:string[]`（全候補の順列）。
- matching: `candidates:string[]`, `targets:string[]`, `answer:{sourceId:targetId}`（1対1）。
- numeric: `min/max/answer:number`。現在UIは整数入力。
- compare: `candidates:string[]`, `answer:string`, `differences:[{id,row,column}]`、`display.reference/current`に公開図。

choice以外は `onCorrect/onWrong` の型付きeffectsを確定時だけ実行する。元optionsは監査用に残しているが、`prompt.kind='puzzle'`の間はchooseOptionでは実行できない。
`implementationSupplement:true` は原本になかった具体見本を新作した印。補完根拠docと機械的正解テストを必ず併設。

## 入力と状態

出題時に `s.event.puzzle=createPuzzleState(def)` を保存する。
```
{id,used:{},eliminated:[],fixedPrefix:[],fixedPairs:{},hints:[],
 attempts:0,pendingWrong:null,resolved:false}
```
ゲームstateと一緒にJSON保存可能。補助の使用済み、固定部分、試し結果、誤答保留は再読込しても残る。別の出題へは持ち越さない。

本番例:
```js
dispatch(content,state,{type:'answerPuzzle',answer:{daisy:'white',violet:'purple'}}); // M1-01
// M1-02: 原文どおり袋を横→布→荷ひも
dispatch(content,state,{type:'answerPuzzle',answer:['layBag','coverHole','tieRope']});
dispatch(content,state,{type:'answerPuzzle',answer:4}); // M3-08新作見本
dispatch(content,state,{type:'answerPuzzle',answer:'r0c1'}); // M5-15新作図
// choice型は既存の選択肢ID
dispatch(content,state,{type:'chooseOption',optionId:'blue'}); // F1-19
```

UIは `view.actions` の有効な入力のみを使う。`puzzleAnswerInput(def)` は公開候補だけを使って `enum/int/sequence/matching` を返す。matchingはsource→target object、sequenceはID配列。固定prefix/pairを変えた回答、除外済候補、範囲外/重複/不完全入力は拒否する。

## 補助道具

使用場所は通常出題中 `puzzle`、最初の誤答保留中は `puzzleWrong`。
```js
{type:'useItem',itemId:'BD18',params:{answer:'red'}}
{type:'useItem',itemId:'BD26',params:{values:[2,7]}}
{type:'useItem',itemId:'BD34',params:{answer:['layBag','tieRope','coverHole']}}
```
その他 BD05/14/23/33/39/44 は入力なし。`puzzleAssist` opは `scope.vars`を受け、正解判定・対象型・回数を完全検証する。
`itemStatus`はclone上の試行で適用可否を判定し、BD18/26/34の可変 `needsInput/inputs`を返す。無対象/既使用/候補不足/不正入力で消費しない。試しではattemptsも報酬も進めない。

- BD05: 3択以上、誤答1つ除外。
- BD14: 2手以上、正しい最初の1手のみ固定。
- BD18: 1候補の正誤のみ。
- BD23: 未確定2組以上、1組固定。
- BD26: 異なる2値、近い側または同じ。正解値/差の数値は出さない。
- BD33: 作者が指定したscene/optionの対応語を下線。
- BD34: 下書きの最初の異なる位置または全一致。
- BD44: 実差分の行→列順で1箇所を示す。

## BD39 誤答確定前

最初の誤答で袋にBD39がある場合は `outcome='wrongPending'`。損失/報酬/元optionの費用をまだ適用しない。
choice型の元回答は `event.pendingPuzzleOption={optionId,input}`に保持。非choiceは `puzzle.pendingWrong`に回答保持。
- `{type:'useItem',itemId:'BD39'}`: 1個消費し保留を解除。次の本番回答で確定する。二度目の誤答は再保留不可。
- `{type:'commitPuzzleWrong'}`: 元の誤答を確定し、元の費用/失敗effectsを一度だけ実行。
保留中は通常回答actionを表示しない。正答済み/解決済み/別イベントでは使えない。

## 検証と再開

```
node --test tests/puzzle-assists-followup.test.mjs tests/puzzle-integration-followup.test.mjs
node --test tests/scripts-M.test.mjs tests/playthrough.test.mjs
npm test
npm run validate
```
原文4件＋新作2件を実engineで確認。純粋モデルだけの成功をUI/公開/実機成功と読み替えない。
残りの統合確認は、日本語入力UI、補助の視覚表示、実ブラウザ操作、独立原文/補完正答レビュー。CI/公開/iPhone実機は別記録とする。
