# UI follow-up implementation and acceptance status

## 2026-11-14 status checkpoint

This checkpoint refers to [PR #5 at 167f66b](https://github.com/chameleonjp-lab/100masu_yusha/tree/167f66b1380c8a79ccda3cdf467a9bb72a1723ab), not to a completed or deployed game. At this pre-document-addition checkpoint it was open/Draft. Stages 1–11 and 13–16 are reflected: 286 follow-up paths, 357 files. At that fixed head, the 21 absent paths include this document/metadata group, the local ranking prototype, and application entry/integration files. `index.html`, `src/ui/app.js` and the ranking modules are not in that tree. Adding these six documentation/metadata files does not add application functionality or complete acceptance testing.

A new independent run on 2026-11-14 at 03:42:48–03:42:56 UTC verified the reconstructed 357-file snapshot: 1,557/1,557 Node tests passed, with content validation and both normal/strict translation audits exiting successfully. All 357 Git blob hashes and sizes, and the complete Git tree, matched the fixed head; files were unchanged after execution. These are new results, not recovered earlier logs. The run used a JavaScript network-blocking preload; it is not an OS-level network audit. Neither unit/model checks nor translation structure checks establish CI success, rendered-screen acceptance, actual IndexedDB/WebGL/audio behavior, or iPhone performance. No merge, deployment or production score submission is established by this checkpoint.

All 15 language JSON files are present. The reported structure audit covers 7,593 required keys, with 16 empty Japanese source entries tracked separately and 338–415 source-identical entries per translated locale. These counts do not establish natural or context-correct translation. `loadMessages` at the fixed head requests the deduplicated Japanese, English and selected language sequentially: two resources for Japanese/English, otherwise three for a supported locale. It does not request all 15 language files on every call. Actual call frequency, browser caching, compressed transfer size and device responsiveness remain unmeasured.

The historical implementation/test record below is retained for provenance. Statements such as “implemented”, “current”, “not uploaded”, old test counts and intermediate translation counts refer to their recorded local snapshot, not automatically to this PR head. They do not mark the original T01–T09 plan or outstanding acceptance as complete.

## Historical local record (2026-11-12)

2026-11-12. Local follow-up on PR #4. Not deployed, not merged, no ranking requests.

## Implemented

- `index.html` and native ES modules under `src/ui/`, no CDN or new runtime dependency.
- Native depth-tested WebGL cuboids for raised terrain, route tiles, trees, castle and a rolling die. Canvas redraws for scene/size changes and bounded dice animation only; stops when hidden, handles context loss without changing gameplay. DPR capped at 2.
- Existing authored cut-paper construction (`docs/art/mockups/src`) adapted into 150 isolated SVG hero/enemy/companion poses. Mockup screen compositions are not used as final game screens. `assets/build-characters.py` regenerates these sprites. Lazy image loading by active character/pose. Original assets untouched.
- Independent readable DOM HUD, enemy telegraph including guarded/unguarded damage, persistent last result, move preview, portrait/landscape responsive layout, minimum 44px controls, reduced-motion and short-animation modes.
- Route/start/resume/replace confirmation, event choices, battle actions, bag swaps/loss choices, items, gear/spells, inn services/shop/jobs, tavern candidates and owned companion original conditions/effects, gate/retry/result, local bests/dex.
- Reveal output including sword/armor comparison with two real checkbox selections, original timing/effect text, castle phase hint and remaining traps.
- Atomic save-aware session: unique run IDs, run/meta revisions read from store, no optimistic gameplay mutation on save failure, duplicate clicks refused. Results persisted with the run and meta in the same transaction. Reload never replays success cues.
- Locally synthesized road/battle/king melodies from art-direction §7.5 and differentiated coin/shield/gate/crown cues. Master mute and separate music/effect gain controls. Audio starts only after a gesture; hidden page cancels scheduled audio. No external media request.
- Attached rest/trap items consume via engine actions. UI reads `itemOptions` rather than inventing effects. Engine rejection never commits the action.
- Inn `pickBagItem` action-list bug found by complete playthrough suite and fixed with red→green regression: while a bag-loss choice is pending, only matching bag selections are exposed.

## Verification and limits

Unit checks: `node --test tests/browser/*.test.mjs`. Full suite: `node --test` (run again once all parallel content edits are stable).

Real-browser smoke entry: `node tests/browser/smoke.mjs` with an existing local server and installed Playwright/Chromium. The script does not install software, permits only localhost, and captures portrait/landscape/reload/reduced-motion evidence.

**Visual and real-device acceptance is NOT complete.** In this environment shell Chromium stopped at `socket() failed: Operation not permitted`; a regular approved CUA browser navigation to local port 8080 returned `net::ERR_HTTP_RESPONSE_CODE_FAILURE`. These are execution/access failures, not a successful screenshot test. No screenshot or iPhone test is claimed.

Remaining before T06/T07 can be accepted:

1. Inspect and polish the actual animated short section (departure → dice → move → telegraph → guard/attack → reward), not static code alone. Tune paper material consistency, 3D grounding, battle motion choreography, camera, palette across all five bands, route-specific scenery, companion presence and king crown-break choreography. Current geometry is an implementation pass, not art approval.
2. Add full planned music accompaniment, percussion/noise layers, cue envelopes/ducking and all planned interactions. Current score melody/cues are not the full §7 sound specification. Verify speaker/headphone differentiation and gate silence/bell timing on real iPhone.
3. Full 11-screen keyboard/touch/large-text/portrait/landscape browser acceptance, complex item inputs, shop replacement and all route end-to-end paths. Browser smoke is authored but not successfully executed here.
4. iPhone 17 Pro Safari actual performance, thermal, lock/resume/context loss tests. 60fps is a target, not measured evidence. No automated result substitutes for owner acceptance.
5. Initial load byte budgets and resource prioritization are not yet proven to art-direction P0/P1 targets. Initial content loading still waits for the entire content manifest.
6. T07 balance / first-time-player 15–20 minute goals require playtest observations. Implementation coverage is not equivalent to finished gameplay acceptance.

Do not mark these gaps complete or exclude them to make the task appear finished. Code remains GitHub source-of-truth; this local branch is not a public build.

## S01–S11 requirements matrix (source: requirements.md §screen table)

| Screen | Implemented in this pass | Remaining / acceptance not yet met |
|---|---|---|
| S01 Home/settings | four route summaries, tradeoffs and 20-square distributions; start/resume; how-to; mute/volumes/short/reduced motion | map-opening/departure choreography and selection cues; resumed location name beyond band/number; actual screen inspection |
| S02 Board/map | current route/band; next six; distance to next inn/castle; 100-square map of known inns/castle/current place; saved die; discarded-step explanation | landing ring/individual footprints/route-specific diorama; distinct roll/settle/land cues; actual animation polish |
| S03 Event/chest | original scene/choice labels; actual deltas persisted; chest choices/names/effects; bag exchange/decline | all costs/rewards and equipment differences must be visually audited; complete event-specific cue set; complete all complex item forms |
| S04 Battle | enemy telegraph and actual guarded/unguarded damage; health/magic; action choices; persistent recent battle history; reward gold/XP and both item categories | anticipation/hit/numbers choreography; exact blocked/support decomposition; all attack/cast/flee cues; actual battle visual acceptance |
| S05 Inn/shop | rest/shop/services/jobs/tavern; price and after-purchase balance; inventory count and item descriptions | explicit standard/regional item grouping, buy/cancel flow and cues; real narrow-screen inspection |
| S06 Jobs | original skill/trigger description; four actual outfit previews before commitment; current job; remain-as-is return | confirmed step-forward/three-note cue synchronization; real touch/large-text acceptance |
| S07 Companions | both candidates with original triggerText/line and zero recruitment fee; real companion portraits; existing vs incoming faces on replacement; recruited companions stand beside hero | support animation/call-and-response cues; composition/occlusion inspection; no claim of finished character motion |
| S08 Status/gear | HP/MP limits, level/job, attack/defense; gear comparison numbers; sword/armor two-item comparison incl exact timing/effect text | per-level base-stat increase readout; persistent changed-slot marker; two-slot grouping and cue completion |
| S09 Items/spells | category, timing, conditions, effect; bag capacity; prepared spells; MP and target fields; unavailable reason; input validation | current-usable markers and classification grouping, reveal/compass animation, leaf/book cue set; full complex input acceptance |
| S10 Castle/king | gate prep/action; phase-specific king poses; persistent phase change text; synthesized gate/crown cues | gate-open and crown-break choreography, old-announcement/new-next-announcement animation sequencing, audio ducking and exact silence; actual iPhone validation |
| S11 Results/dex | victory/defeat title; route/furthest/rolls/final job/companions; saved bests/dex; pending reward handled before completion by engine | lit path, defeated-by enemy persistence, first-discovery marks, saved-best cue exactly once; full end-to-end real-device acceptance |

Follow-up on companion art: the old mockup's third companion was explicitly provisional `archer`, but actual CP03 is `thrower`. The game derivative keeps the existing cut-paper outfit/body, removes bow/quiver, and adds a stone hand and stone bag. Original mockup source was not modified. The isolated thrower SVG was rendered with installed Inkscape and visually inspected; this is **not** a game-screen/browser acceptance test.

### 追加検証・修正
- 150 SVG の stroke/transform 込み描画境界を Inkscape で測定し、各姿勢に6論理px以上の余白を付加。元の中心と接地位置を metrics に保持し画面の拡大率を姿勢間で固定。指摘4体は再描画画像で剣・杖・光・耳の見切れ解消を確認。ゲーム画面全体の受入ではない。
- session.load も書込みと同じ mutex を保持。遅延 load 中の二重 load/act を拒否する回帰を追加。
- BGMは伴奏・低音・打楽器・区間テンポ・魔王段階を実装、SE原仕様のレシピを移植。実ブラウザ/実機での聴感・音量・遷移確認は未了。
- P0/P1サイズは原計画では gzip 前の配信資材区分。UIコード全量とP0を同一視しない。実ネットワーク初期配信と遅延読込境界は未確認。
- puzzle文字列順序/組合せ入力、誤答保留時確定と補助道具、動的itemStatus入力を接続。全イベント画面受入は未了。

### 地方形状とpuzzleの追加
- 草原は木と柵、水辺は低い水面/波紋/葦/飛び石、鉱山は段岩/鉱脈/線路、霧森は背の高い暗色樹/低い霧帯、城下は外堀/橋/城を別ジオメトリ化。各地方60箱未満、静止時連続描画なし。城は第五地方だけで、城到着を前倒し表示しない。実画面品質/性能は未受入。
- 剣撃弧を刀身から離し、短く薄い金色へ。再SVG描画で刀身/鍔/弧の区別を目視確認。全姿勢のbounds再計算済み。
- puzzleの順序を日本語候補のselectにし、確定済み先頭/組合せを固定。手掛かりを日本語化し、公開prompt/見本を表示。動的道具入力の事前照会はparams未指定に修正、BD26回帰を含む統合9件成功。
- UI25件とpuzzle統合9件、計34件成功。ブラウザ/音/iPhone未検証は継続。

### 追加道具/宿の画面経路
- B宿のrestOptionsをchoiceId別アクションと副作用なし回復差分previewで表示。通常休憩との分岐と専用回帰を追加。
- HE20逃走時併用、HE34報酬時使用、BD36代用品別交換、BD17/38回復確定前入力、BD06即時受取りの品固有入力を接続。
- boardItem対象は実在する候補だけ日本語選択。BD13の入力別/入れ子/未出目別の変化を再帰表示。
- BD06のif候補抽出は現state評価。支払や先行効果で条件が変化する複合scriptの精密照合は独立レビュー中で、完了受入とはしない。
- 予告はbattleActionPreviewの隔離複製計算へ接続。攻撃/防御の固有choiceごとに実被害・多段数・敵回復を表示し、静的baseだけでは漏れたenemyDamage等の補正を反映。対象未選択等で予測不能な時は数値を推測しない。予測には保存/実状態/RNGの変更なし。
- BD28装備受取確定とBD46任意強敵への初手宣言をUIに接続。BD28は受取前で止まり、道具の消費と装備取得を同じ操作で確定。

### T08 ローカル基盤（公開未完了）
- 15言語の別ファイル契約、正本日本語7,443キー（content display＋UI静的文字列）、欠落manifestを抽出。キー保持・変数保持・未訳欠落の扱いはsrc/locales/README.md。
- 保存設定→端末→英語、英語/日本語fallbackと実翻訳を区別。言語変更による冒険/盤面/RNG不変を回帰で確認。
- ホーム/結果の黒白Xボタンは端末内下書きのみ。正式URL=nullのため投稿コードなし、コピーも無効。実投稿・デプロイ0件。
- 未了：全文翻訳、動的UIテンプレの全キー移行、文脈別の明示ID参照、全画面15言語の目視/はみ出し/実機確認。静的原文完全一致参照は移行用であり、同じ原文の文脈差を最終保証しない。
- 状態表示、治療対象のラベル選択、AT30条件付き先読み、AT31偽物1体除外とAT44最大2体選択をUI接続。テスト35件成功。

### T08 文脈キー移行・T09端末内表示
- 動的日本語テンプレ97件、静的表示/語彙を明示msgキーへ移行。正本は7,586キー（定義/脚本/理由文/画面）、テンプレ文脈と変数はui-template-context.json。旧ui.literalから完全同一原文の新キーへの移行表を用意。以後は既存IDを変えず追加する。
- DOM汎用の原文一致再翻訳を廃止。内容の表示参照は構造IDのread-only proxy/projectionに分離、エンジンに渡す正本は変えない。同一原文の別名称/隠された謎解き原文を復活させない回帰あり。
- T09は送信なしローカル一覧モデルと表示試作。読込中/空/失敗/再読込・任意開始名の確認を分離し、同条件30名の既存rankCohortを利用。正式枠未設定、実登録/冒険開始/送信は接続していない。架空の成績を表示せず、通常冒険/保存への書込なし。
- UI41件成功。翻訳内容品質、未訳全量、実ブラウザ全画面、音、iPhone実機、配信サイズと性能、正式URL/本番参加は未受入。
