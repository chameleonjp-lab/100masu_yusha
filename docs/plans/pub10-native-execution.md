# PUB-10: 許可された環境での公開前検証

## 状態と境界
この変更は検証候補とHE20演出の統合案。ゲーム公開・Actions実行・ブラウザ/ソケット起動の承認ではない。ユーザーがマージする。ランキング連携・本番スコア送信・DB変更なし。CLIのimport/引数なしは起動しない。
HE20候補は既存エンジンの回復/逃走結果を読む。スターター装備・旅人・仲間なしの確実なケースだけ演出し、未知hookは保存結果の静的表示に戻す。通常逃走の契約は維持する。

## 分離する3つの入力
1. **trusted helper checkout**: この文書とpub10モジュールを含む、外側で固定commit/内容を確認した検査側checkout。ESM静的importは内部pin検査より先に評価されるため、内部pinは整合確認のみであり、不信なhelper実行を安全にする仕組みではない。
2. **clean fixed game source**: helper checkoutとは別の（互いに内包しない）ディレクトリ。Git追跡ファイルだけを正確に展開し、.git/ログ/生成物を混ぜない。sourceRootで指定し、全treeのbyte/Git blob照合を行う。ブラウザに渡すのはこのsourceから生成したpreviewだけ。
3. **独立固定metadata/pin**: commit/tree JSONそのもののbyteと事前に確認したSHA、当該commit専用manifest pin。自己計算した値をその場で期待pinにすることは禁止。JSON key順/投影/改行でpinが変わるので、一度読んだ同じBufferをhash確認してparseする。

commit/tree JSON・preview・ログはこのPRの提出対象外。許可された実行環境へ別途一時入力として供給するか、許可済GitHub応答を取得して既知期待hashと一致した場合のみ使う。repo uploadは別範囲。
旧main 7dce20220115ab3994e309be7d60aaa6927ff5eb/tree86857e4a7f12929f55b0099568c78e355ca4ddceの復元previewは別途確認されたが、本変更commitのpreviewではない。旧pinを本変更に使い回さない。

## 必要環境とCLI
Node ESM/Linux procfs/O_NOFOLLOW、既存の互換Playwright（routeWebSocket対応）、sandboxを維持して起動できる既存Chromiumが必要。インストール/ダウンロード/paid runnerへの移行は含まない。欠如やEPERMならstop。sandbox解除・別経路への回避・自動再試行をしない。
明示許可された実行先だけで `node tests/browser/pub10/cli.mjs --run-permitted CONFIG` を使う。ここでは実起動していない。
CONFIG必須項目:
- sourceRoot, artifact, gameCommit, treeSha, manifestPin
- commitMetadata, treeMetadata, commitMetadataSha256, treeMetadataSha256
- helperPins: cli.mjs / pins.mjs / loader.mjs / helpers.mjs / providers.mjs / wiring.mjs / combined-gates.mjs / ./battle-probe.mjs の独立SHA
- baseURLs: 明示port付き http://127.0.0.1:PORT/ と http://127.0.0.1:PORT/100masu_yusha/
- playwrightModule / chromiumPath: 許可済既存絶対path。依存を探索・推測・installしない。

providerはNode標準HTTPを127.0.0.1の指定portへexclusive bind。ChromiumはchromiumSandbox:true、headless、起動timeout30秒、追加flagsなし。固定snapshotはO_NOFOLLOW読取とpin/byte/hash確認後のimmutable bufferのみ配信し、raw URL/Host/実remoteAddress/GET/既知MIMEを厳密に限定する。

## AND受入と記録
root/subpathそれぞれで同一manifest pinを使い、以下を別ゲートとしてANDする。
- unseeded: 既存pages-smokeによる4ルート短経路、stale-session競合拒否、native transaction/abort、設定、保存/Continue。
- seeded: 新規isolated contextでB/seed31のみ。剣で攻撃、戦闘中保存、reload/Continueの全snapshot一致。全遷移のrunId/seed/route/status/revisionを検査。可視と操作可能を区別し、enabledを有界待機する。
seed hookはpage検査contextだけの1回Uint32Array(1)、範囲限定。randomUUIDと非arm時乱数を変えず、復帰前に解除。本体bytesを書き換えない。通常random startとは別結果。
console.error/pageerror、blocked request、全資源のguard経由GET/MIME/hash coverageも必須。一つでも不成功ならfailed、不足はblocked。基準baseURLは両ゲート返却値で一致必須。生error.message/JSON断片/assert値/個人pathをstdoutへ出さず固定code/要約を出す。
`browserAcceptance:false` は実行記録の独立確認まで維持。全資源GETはbyte配信の証拠であって描画/全ゲーム機能の証拠ではない。context guardはbrowser process全体の無通信証明ではない。

## 提出対象23ファイル
既存6:
- src/ui/normal-flee-plan.js
- src/ui/app.js
- tests/browser/normal-flee-plan.test.mjs
- tests/browser/normal-flee-app.test.mjs
- tools/build-pages.mjs
- tests/pages-artifact.test.mjs
新規16:
- tests/browser/pub10/helpers.mjs
- tests/browser/pub10/helpers.test.mjs
- tests/browser/pub10/loader.mjs
- tests/browser/pub10/loader.test.mjs
- tests/browser/pub10/wiring.mjs
- tests/browser/pub10/wiring.test.mjs
- tests/browser/pub10/providers.mjs
- tests/browser/pub10/providers.test.mjs
- tests/browser/pub10/combined-gates.mjs
- tests/browser/pub10/combined-gates.test.mjs
- tests/browser/pub10/pins.mjs
- tests/browser/pub10/pins.test.mjs
- tests/browser/pub10/cli.mjs
- tests/browser/pub10/cli.test.mjs
- tests/browser/pub10/battle-probe.mjs
- tests/browser/pub10/battle-probe.test.mjs
新規文書1:
- docs/plans/pub10-native-execution.md

## 別途判断・未検証
workflowは対象外。将来案 `.github/workflows/pub10-native-preview.yml` はmanual-only/ubuntu-24.04標準/contents:read、配備権限・install・upload/cacheなし。workflow_dispatchにはdefault branch上の定義が必要なのでDraft PRだけでは実行できない。公開標準runner computeの過去無料確認は追加storage/有料枠の許可ではない。新しい費用経路は再確認と承認が必要。
実ブラウザ/ソケット/ネイティブIndexedDB/iPhone Safari/音/性能/正式公開は未検証。模擬検査を実機成功へ読み替えない。正式公開の保存先は未決、previewはyusha100-publication-preview-v1だけを使用する。
