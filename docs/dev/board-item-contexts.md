# 指定品代用と着地種類の道具

## BD36 深森の代用札

`chooseOption` に `itemId: 'BD36', params: { substituteId: 'HE32' }` を添える。
例: F4-13 の `optionId: 'donate'` は HE31 の代わりに HE32 を渡せる。
元選択が必要品不足でも、同帯・同分類・同額以上の別消耗品と代用札があれば選択可能。

決済は単一 dispatch 内で札を消費し、`substituteTradeItem` が指定品条件を検証した代替 cost を作り、通常の選択処理で代替品と他費用を払う。失敗時は元 state を変更しない。購入、金貨報酬（入れ子と残処理も検査）、罠の持物損失、パズル、指定品が複数の選択には適用しない。独立した `useItem` では使用不可。

## BD37 星苔の紙箱

振る前に通常の `useItem` で使用。`trackLandingKinds` が `flags.bd37` に `kinds` と `settlePos` を保存する。実際の `landOn` の種類だけを数え、通過マス、1番、100番は数えない。同種が重複した時点で消える。3種類目の出来事が完了するまでは回復しない。

通常イベントと戦闘報酬は `finishSquare`、宿場は `leaveInn → finishEvent → finishSquare` で清算。HP10・MP4を通常上限内で回復し印を消す。戦闘死亡時も印を消し、復活後の遅延回復を防ぐ。JSON保存・読戻しで継続可能。追加使用による重ね掛け不可。

検証: `tests/substitute-item-followup.test.mjs`, `tests/landing-kinds-followup.test.mjs`。本番公開・実機確認の根拠ではない。

## BD06 果物屋の小皿

選択取得の `chooseOption` または `pickChest` に `itemId:'BD06', params:{receivedId:'HE01'}` を付ける。回復品固有の `which` / `hpRooms` / `partner` なども同じ params に渡す。
`consumeReceivedItem` が当該dispatchだけの受取指定を用意し、`grantItem` が一致する候補を袋へ追加せず使う。回復品の宿場での通常使用条件・入力条件を保持する。遅延予約・戦闘用の継続効果は禁止し、その場で終わる HP/MP/持物消費/条件分岐だけを許可。実回復がなく、対象違い、複数品の同時受取なら決済全体を拒否する。

## BD17 / BD38 回復確定前

回復マスの正のHP処理直前に対象道具を持っていると `prompt.kind:'recoveryConfirm'` が作られる。`amount` はその処理の元HP回復量。保存時は元の処理と残り処理を保持する。

- `confirmRecovery` : 道具を使わず元回復。
- `confirmRecovery, itemId:'BD17', params:{groups:3}` : HP回復を6減らしMP3。1〜4組・元HP量以内・MP空き以内。
- `confirmRecovery, itemId:'BD38', params:{amount:8}` : HP回復を8減らし、2移動以内の初戦に最初の直撃を8軽減（既に被害0でもこの一撃で消費）。

同一回復マスで二度の道具適用は不可。道具消費・減算・MP/予約・元回復と残り処理の再開は一つのdispatchで行う。誤入力は元状態を変えない。

## BD28 火種の受け皿

盤面イベントの新規装備、または宝箱候補の新規装備を受け取る時、所持していれば `gearConfirm` prompt を出す。`gearId` と取得元を保存し、`confirmGear` で通常取得、`confirmGear, itemId:'BD28'` で取得と予約を一括確定する。重複装備・有料購入には適用しない。宝箱は元候補1つだけを取得する。

2移動以内の初戦用予約を作り、剣なら最初の通常攻撃だけ+7。初通常攻撃が偽物等で不発でも後の攻撃へ持ち越さない。防具なら初めて受ける正の直撃を7軽減。予約を重ねることはできない。

## BD46 城番の合戦札

`challenge, itemId:'BD46', params:{declaration:'attack'|'guard'}` で任意強敵の挑戦確定と同時に消費する。通常の `skip` は札を消費しない。魔王・単独使用には不可。

`attack` は初手が通常攻撃のとき、その初撃だけ+12。不一致後に通常攻撃しても加算しない。`guard` は初手防御が一致したときのみ、最初の直撃を12軽減する。既に被害0でもこの直撃で消費し、後の直撃へ持ち越さない。戦闘に勝った扱いにはせず、通常の戦闘・勝利報酬処理を続ける。

検証: `tests/gear-challenge-items-followup.test.mjs` は装備一回取得・候補制限・保存再開・重複不可・宣言一致/不一致の実ダメージ差を確認する。

### BD06宿場と城門の経路

宿場の直接 `service` とサービス後の `chooseOption` にも添付可能。実データH5-39のHE50支給で袋非経由使用を検証した。城門は既に提示された受取choiceを再開するエンジン経路を用意したが、現在の固定100番には新しい品の提示を生成する仕様がない。新規支給・購入機能は創作していない。城門の試験は既存promptを与えた互換性試験であり、通常プレイに新しい支給経路があるという意味ではない。
