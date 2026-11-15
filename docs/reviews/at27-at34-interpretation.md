# AT27 / AT34 コピー量の採用解釈

## 2026-11-14 status checkpoint

This checkpoint refers to [PR #5 at 167f66b](https://github.com/chameleonjp-lab/100masu_yusha/tree/167f66b1380c8a79ccda3cdf467a9bb72a1723ab), not to a completed or deployed game. At this pre-document-addition checkpoint it was open/Draft. Stages 1–11 and 13–16 are reflected: 286 follow-up paths, 357 files. At that fixed head, the 21 absent paths include this document/metadata group, the local ranking prototype, and application entry/integration files. `index.html`, `src/ui/app.js` and the ranking modules are not in that tree. Adding these six documentation/metadata files does not add application functionality or complete acceptance testing.

A new independent run on 2026-11-14 at 03:42:48–03:42:56 UTC verified the reconstructed 357-file snapshot: 1,557/1,557 Node tests passed, with content validation and both normal/strict translation audits exiting successfully. All 357 Git blob hashes and sizes, and the complete Git tree, matched the fixed head; files were unchanged after execution. These are new results, not recovered earlier logs. The run used a JavaScript network-blocking preload; it is not an OS-level network audit. Neither unit/model checks nor translation structure checks establish CI success, rendered-screen acceptance, actual IndexedDB/WebGL/audio behavior, or iPhone performance. No merge, deployment or production score submission is established by this checkpoint.

All 15 language JSON files are present. The reported structure audit covers 7,593 required keys, with 16 empty Japanese source entries tracked separately and 338–415 source-identical entries per translated locale. These counts do not establish natural or context-correct translation. `loadMessages` at the fixed head requests the deduplicated Japanese, English and selected language sequentially: two resources for Japanese/English, otherwise three for a supported locale. It does not request all 15 language files on every call. Actual call frequency, browser caching, compressed transfer size and device responsiveness remain unmeasured.

The historical implementation/test record below is retained for provenance. Statements such as “implemented”, “current”, “not uploaded”, old test counts and intermediate translation counts refer to their recorded local snapshot, not automatically to this PR head. They do not mark the original T01–T09 plan or outstanding acceptance as complete.

## Historical local record (2026-11-12)

2026-11-12、実装計画の後続対応として採用した解釈。原文を書き換えず、挙動の判断をここに明示する。

## 原文と判断

- AT27: 「直前の自分の通常攻撃で敵本体に実際に与えた合計」「最大18。仲間の攻撃と追加効果は写さない」
- AT34: 「直前の攻撃呪文で敵本体に与えた実ダメージの半分」「切り上げ、最大16。呪文の追加効果は写さない」
- SW01 / AR01 は基礎値と「追加効果」を区別する一方、AT06 / AT29 / AT50 は同じ一撃にダメージを足す。AT42 / AT46 は別の追加ダメージを発生させる。「追加効果」の語だけでは同じ一撃の補正を差し引くことまで確定しない。
- 「実際」「実ダメージ」を優先し、**直接命中の最終的な敵本体のHP減少**をコピー量とする。同じ一撃に入った武器・道具等の補正は含める。基礎計算値や最大HPを超えた過剰ダメージをそのまま写さない。
- 仲間の攻撃、反射、別の `dealDamage` として発生した追加効果はコピー元の合計から除外する。元の通常攻撃 / 呪文や、その追加効果を再実行しない。

## 実装契約

`battle.attackDamageDealt` / `battle.spellDamageDealt` の前ラウンド値を使う。AT27 は直前の行動が通常攻撃の場合のみ、AT34 は直前の行動が攻撃呪文の場合のみ使える。

命中しなかった、または実損0だった直前攻撃もタイミング条件は満たす。コピー量は0。AT34 の魔力2回復は独立して行う。コピー先は通常の道具による固定ダメージ処理であり、対象の分身・無効化を破らない。道具一般に適用される効果まで無効にはしない。

この解釈は本文の用語整合に基づく実装判断であり、曖昧さが完全になくなったという意味ではない。仕様判断が後に変更された場合は履歴集計と境界試験を一緒に変更する。
