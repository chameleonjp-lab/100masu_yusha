# 開発の約束（段階A・開発責任者が決定）

基準コミット: `main` = `695aa90`（PR #2 マージ後）。作業ブランチ: `claude/busy-wozniak-6i4y2d`。
正本: `data/adventure-content.json`（sha256 `817740b5…adcd9`、形式2.0）。追加設定: `data/balance-draft-2.json`（付録の写し。正本との照合で衝突0件）。

この文書は、担当どうしが同じ入出力で作業するための約束である。細部の形式は、担当が `docs/dev/` に書き足して確定させる（下表の「確定する文書」）。

## 1. 構成と担当の書き込み範囲

ビルド工程なしの静的ページ（ES modules）。ブラウザーとNode 22のテストで同じルール計算を使う。

| 場所 | 中身 | 書く担当 | 確定する文書 |
|---|---|---|---|
| `src/engine/` | 盤面・進行・経済・戦闘・成長・イベント解釈・道具/装備効果。**DOM・時計・音・乱数APIに依存しない純関数** | game-implementation | `docs/dev/engine-api.md`, `docs/dev/script-format.md` |
| `src/content/` | 正本＋付録＋調整表＋差し替え＋スクリプトを読み、索引を作る | game-implementation | 同上 |
| `src/save/` | IndexedDB保存（テスト用にメモリー実装も） | game-implementation | `engine-api.md` |
| `data/scripts/events/{M,F,B,H}{1..5}.json` | 1,000件の処理表（20ファイル×50件） | data-conversion | `script-format.md` に従う |
| `data/scripts/items.json`, `data/scripts/equipment.json` | 消耗品150・装備100の効果表 | data-conversion | 同上 |
| `data/patches/encounters-balance-draft-2.json` | EN09〜13の差し替え（M1-24/H2-11/F3-27/B4-27/M5-25） | data-conversion | 同上 |
| `data/tuning.json`, `docs/dev/tuning.md` | 正本に数値がない値（既存通常敵8種、呪文、職、仲間） | 開発責任者（Opus） | `tuning.md` |
| `tools/validate-content.mjs` | 件数・識別子・参照・効果の検査 | data-conversion | — |
| `index.html`, `src/ui/`, `src/style.css`, `assets/`, `src/locales/ja.json` | 11画面・素材・動き・音・入力 | screen-implementation | `docs/dev/ui-notes.md` |
| `docs/art/` | 世界観・画面見本・素材指示・秒数と音の表 | art-direction | `docs/art/art-direction.md` |
| `tests/*.test.mjs` | ルールの境界テスト（`node --test tests/`） | game-implementation / data-conversion | — |
| `tests/browser/` | Playwrightによる画面確認・撮影 | screen-implementation | — |
| `docs/review/` | 独立レビューの指摘 | visual-review / tech-review | — |

並行作業は別のGit作業ツリーで行い、上の範囲以外のファイルを書き換えない。共有ファイル（`package.json` 等）の変更が必要なら、変更案を報告し、開発責任者が統合する。

## 2. 正本の扱い

- `data/adventure-content.json` は書き換えない。読み込み時に `balance-draft-2` と差し替えパッチを当て、**当てた結果を検査する**。
- 差し替え5件は、識別子・区間・分類（戦闘）・件数を保ち、`name/scene/action/result/refs` をまとめて置き換える。区間の敵一覧（`bands[].enemyIds`）に EN09〜13 を足す。元の敵（EN01/03/05/07/08）が同じルート・区間の別候補に残ることを検査する。
- 表示文（`result` など）から数値を拾って処理しない。処理は `data/scripts/` の型付きの値だけで決める。スクリプトがない、または未対応の識別子があれば、検査で失敗させる。
- 採用済みの数値（正本・付録）と、新たに仮定した値（`data/tuning.json`）を分けて管理する。

## 3. エンジンの入出力

```js
import { loadContent } from './src/content/index.js';      // Node/ブラウザー共通の組み立て（読み込み元は差し替え可能）
import { createRun, dispatch, view } from './src/engine/index.js';

const run = createRun(content, { route: 'M', seed: 123456789, runId: 'r-…' });
const { state, effects } = dispatch(content, run, { type: 'roll', opId: 'op-1' });
// state: 新しい状態（入力は変更しない）。effects: 画面と音に渡す「起きたこと」の列（確定した数値つき）
const v = view(content, state); // 画面が読む派生情報（次の6マス、使える行動、価格、差分など）
```

- 状態は JSON 1個で表せ、そのまま保存・再開できる。`state.revision` は確定操作ごとに+1。`opId` を記録し、同じ `opId` の再送は何もしない。
- 乱数は状態に入れた種と位置（`state.rng`）から引く。振った出目・抽選結果は引いた時点で状態に保存し、再描画で振り直さない。
- 不正な操作は例外 `EngineError(code)` を投げ、状態を変えない。画面は `view().actions` に出た操作だけを有効にする。
- 段階（`state.phase`）: `board`（振る前）/ `rolled`（出目表示中・調整可）/ `event`（出来事の選択）/ `chest` / `bagFull`（交換か辞退）/ `inn` / `bossOffer`（強敵の挑戦・見送り）/ `battle` / `battleReward` / `gate`（城門前）/ `retryOffer` / `finished`。
- 画面に渡す `effects` の例: `{t:'dieRolled',raw:4}`, `{t:'moved',from,to,steps,xp}`, `{t:'gold',delta:150,reason:'award'}`, `{t:'hp',delta:-3,before,after}`, `{t:'enemyTell',...}`, `{t:'hit',target,amount,blocked}`, `{t:'phaseChange'}`, `{t:'levelUp',from,to,gains}` など。画面は effects だけで演出し、数値を自分で計算しない。

## 4. 処理表（スクリプト）の方針

1件ごとに「選択肢 → 条件 → 代価 → 効果」を型付きで書く。最低限そろえる要素:

- 選択肢: `id`, 短い表示名, 成立条件（所持金・所持品・職・出目など）, 代価（支払い・体力・品）, 効果の列。
- 効果: 入金（`goldAward` と一致する場合だけ。100〜1,000G、同じ冒険・同じマスで1回）, 支払い, 体力/魔力の増減（最低値つき）, 経験値, 品・装備（支払額つき）・呪文の取得, 戦闘開始（敵と戦場の仕掛け）, 条件分岐, 次の戦闘や次の移動への予約, 情報の表示（次の敵名など）。
- 宿場マスは「宿場」の共通機能＋その宿固有の一度限りの特典。
- 罠は損失を `trapLoss` と印を付け、身代わり札（AT02）で1回免れられるようにする。
- 文章だけで処理がない「次へ」ボタンは不可。どうしても型にできない効果は `custom` として識別子ごとの関数を `src/engine/custom/` に置き、検査で一覧化する。

形式の正式な定義は game-implementation が `docs/dev/script-format.md` に書き、代表20件（8分類＋M1-42/M1-48/B2-02/B2-43/B2-48/F5-13/H1-37/M1-18/B3-26/B5-30/F1-12/H3-46）を自分で変換してテストに通す。data-conversion はその形式と検査ツールを使って残りを変換する。

## 5. 調整表（`data/tuning.json`）の形

```json
{
  "tuningVersion": "tuning-1",
  "normalEnemies": { "EN01": { "maxHp": 0, "baseAttack": 0, "baseDefense": 0,
      "actions": [ { "order": 1, "name": "", "attack": 0, "defense": 0, "kind": "通常攻撃|大技|守り|反撃の隙", "tell": "" } ] } },
  "spells": { "SP01": { "mpCost": 0, "kind": "attack|heal|guard|finisher", "power": 0, "text": "" } },
  "jobs": { "JB00": { "name": "旅人" }, "JB01": { "name": "戦士", "guardThenAttackBonus": 0 }, "JB02": { "name": "魔法使い", "attackSpellMpDiscount": 0 }, "JB03": { "name": "旅芸人", "chestChoices": 3 } },
  "companions": { "CP01": { "name": "", "role": "shield|medic|…", "trigger": "", "effect": {} } },
  "taverns": { "1": ["CP01","CP02"] }
}
```
既存通常敵の行動は、正本の `tell`・`response` の文に合う順番・構えにする（EN09〜13と同じ形）。

## 6. 画面と演出の約束

- 画面は `view()` と `effects` だけを読む。演出（秒数・音）は `docs/art/art-direction.md` の表に従い、短縮・動きを減らす・消音のどれでも、結果の文字と次の操作が残る。
- 文言は `src/locales/ja.json` の識別子で引く（T08で15言語を足せる形）。イベント本文は正本の `scene/action/result` を識別子で引く。
- 検査用の任意マス・任意装備の入口は配信画面に出さない（`?debug` などを使う場合も、ビルド対象の画面には出さない。テストはエンジンを直接呼ぶ）。
- 基準端末: iPhone 17 Pro Safari 縦（402×874相当）/ 横 / 縦402×700。主なボタンは44×44 CSSピクセル以上。`env(safe-area-inset-*)` を使う。

## 7. 段階と次へ進む条件

| 段階 | 内容 | 条件 |
|---|---|---|
| A | この文書、担当定義（`.claude/agents/`）、付録の写し | 各担当に範囲・入力・出力・合格条件がある |
| B | エンジン＋代表スクリプト＋短い区間を本来の画面でつなぐ | 独立レビューの描画・読解・操作の指摘を直す |
| C | 1,000件・250品・100装備のスクリプト、11画面、4ルート通し | `node tools/validate-content.mjs` が0件の未対応で通る。4ルートで出発→魔王→結果 |
| D | 独立レビュー（画面・技術）→修正→再確認 | 重大な不具合と視認・操作の阻害が解消 |
