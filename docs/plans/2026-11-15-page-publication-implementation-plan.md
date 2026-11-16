# 100マス勇者：確認用ページ公開の実装計画

**Goal:** 安全な固定版のHTTPS URLを先に本人へ渡し、そのページをiPhoneで確認してから完成版の受入・正式完了へ進める。

**Architecture:** 既存ES modulesと静的資源を、必要な閉包を保った配布成果物にまとめる。既存公開repoのGitHub Pagesを第一候補に、検査と手動配備を分離する。各変更群は単独writerが作成し、別のレビュアーが独立確認する。

**Tech Stack:** 既存JavaScript/Node標準test、WebGL、WebAudio、IndexedDB、静的HTTPS、GitHub Pages/公式Actions。追加サービス・DBサーバー・有料runner・外部フォント/CDNは使わない。

**Spec:** [確認用公開ページの要件 PUB-01〜PUB-12](../requirements/2026-11-15-page-publication-requirements.md)。[従来のマージ後完了計画](2026-11-15-postmerge-completion-plan.md)、[要件仕様書](../requirements.md)、[T01〜T09](../implementation-plan.md)、[絵と演出](../art/art-direction.md)は置換しない。本計画は公開到達の順序・未確認・作業範囲を補足する。

## まず到達する状態

**いま不足するのは、正規に収録された起動結合、保存の隔離、検査可能な静的成果物、現Pages設定/権限の確認、承認された配備と配信照合である。** これを終えて確認用URLを提供した後、本人のiPhone 17 Pro/Safariで「ホーム→名前なし開始→4道選択→1回振る/歩く→設定→保存再開」を確認する。全1000件・4道完走・11画面15言語の完成受入を、最初のURL提供の前提にしない。

このPRで追加するのは本書と要件文書の2件のみ。以下は**将来の作業**であり、製品実装・テスト実行・workflow追加・外部送信・公開は今回行わない。計画承認や文書mergeで将来作業を全面承認されたと扱わない。

## Global Constraints

- 実験場ランキングは連携しない。試験/実スコア、外部API、認証、個人情報の送信0。確認の通信は必要な同origin静的資源だけ。
- 保存値、旧raw、冒険/操作ID、得点、ルール、乱数、抽選済み内容を守る。既定DB`yusha100`の削除・名前変更・勝手な移行なし。
- `src/ranking/local.js`の正規GitHub blob作成1操作は再開根拠未確認。同操作再試行、別ツール/branch/repo/サービス/名称/再実装による同内容の移送・迂回なし。正規根拠が確認できなければ依存する起動版の提出も停止。
- 旧未反映13全件を個別拒否済みと呼ばない。settings v2の新内容/新テストの反映範囲は別に確認する。
- 同一ホストの別pathではstorageは分離されない。専用originを第一案とし、代案は別設計・承認・旧DB不アクセス検証なしに採らない。
- 単独writer→独立review→固定版の検証→許可済み提出→本人merge。公開は具体的な版/URL/公開範囲/費用/復元方法を確定し必要な承認後に行う。
- 新しい実行環境の作成、追加インストール、有料サービスは前提にしない。使用可能な環境・ブラウザ・権限がなければその工程を止める。
- 原本、旧候補、既存計画、旧設定/成果物を保持。既存内容を失う上書き・削除・一括変更は対象/影響/復元方法の承認範囲に限る。復元用控えなしの破壊的変更と再帰的強制削除は行わない。
- `CANONICAL_URL=null`は正式URLが別途決まるまで維持。候補URLを一般共有先へ勝手に設定しない。

## Review Focus

1. mainに入口がなくてもモデル検査だけ通ることと、browserで全依存を取得できることを混同しない（Q2/Q3）。
2. 同origin別path・保存fallback・多タブ・設定保存で旧記録へ触れない（Q1/Q3）。
3. root-onlyの既存ブラウザ検査をサブパス/HTTPSの配信検査と読み替えない（Q3/Q6）。
4. 辞書のraw総量と実転送、初回と再訪、設定中の遅延/連打を混同しない（Q3/Q7）。
5. 非配備CI準備をQ3前にも可能にし、最終merge版のbuild→同一artifactのQ3→deployと実URL受入を別判定にする。公開前に全iPhone受入を要求して循環しない（Q4a/Q4b/Q6/Q7）。

## 1. 現在版と実インターフェース

基準は[main `62714aa4f688aa22a6f5b26370daa21930344a92`](https://github.com/chameleonjp-lab/100masu_yusha/tree/62714aa4f688aa22a6f5b26370daa21930344a92)、tree `caa0389238cb67de3ee2d6bc1a213af09638f0f4`、369ファイル。#6と#7はmerge済み。保持版のNode1,663件は過去固定結果で、CI/browser/native/iPhoneの結果ではない。読取時Actions 0件、現在のPages source/domain/配備SHA/権限/HTTPは未確認。`has_pages=true`も公開成功を意味しない。

| 現物の境界 | 確認した実装 | 計画での扱い |
|---|---|---|
| 入口・依存 | 旧`index.html`は`./src/style.css`、`./src/ui/app.js`。app→ui/ranking→ranking/local | mainにない4件を含む正規収録が先。資料/HTML単独で起動完了としない |
| content | `createBrowserLoader(baseUrl='./', fetchImpl=globalThis.fetch)`、`loadContentInBrowser(baseUrl='./', options={})` | appの`loadContentInBrowser('./')`と文書URL基準の相対fetchをサブパスで検査 |
| script一覧 | browserは`data/scripts/manifest.json`、Nodeはディレクトリ列挙 | manifestに列挙された全events/items/equipmentと_samplesを保持し、browserロードで検証 |
| i18n | `loadMessages(locale,fetcher=fetch)`は重複排除したja/en/選択言語を順次fetch | 1回あたり2又は3辞書。15辞書合計12,216,779 raw bytesを毎回転送量としない |
| save | `createIndexedDbBackend({indexedDB=globalThis.indexedDB,name='yusha100',version=1}={})`、`createIndexedDbStore(options)` | storeの既存options経由で隔離可能性を検討するが、appは現在引数なし。配線は未実装・未承認 |
| session | `createSession(content,store)`、`load()`、`start(route,confirmReplace=false)`、`act(action)`、`settings(settings)` | 既存のrun/meta/revisionと保存確定を保つ。新しいruntime APIを仮定しない |
| 既存browser probe | `tests/browser/smoke.mjs`、`locales-smoke.mjs`はlocalhost rootのみを許可。後者には`/src/...` importもある | そのまま公開URLへ向けない。ガードを緩めず、別のartifact用probeでサブパスを検査 |
| 共有 | appの`CANONICAL_URL=null` | 公開候補URLと正式な共有先の決定を分ける |

## 2. 依存グラフと到達ゲート

```text
今回：2文書作成 → 自己点検 → 独立レビュー → 許可済み文書PR → 本人merge
                                     （製品公開ではない）
将来：Q0 先行条件/正規再開/範囲を固定
        ↓
      Q1 単独writer：起動結合＋保存隔離 → 独立review＋検証
        ↓
      Q2 単独writer：artifact → 独立review＋検証
        ├→ 既存の安全なローカルbrowserを使える → Q3
        └→ 使えない → Q4a 非配備検査基盤を先行 → Q3を承認済みCIで実行
                      ↑ Q0/Q2＋対象・権限・費用の必要な承認
      Q3 安全ブラウザ短経路＋native保存＋全通信ガード＋短区間独立review
        ↓
      Q4b 手動配備workflow/権限の設計ゲート（Q4a未実施なら非配備側も準備）
        ↓
      Q5 全体独立review → 検証 → 許可済み製品PR → 本人merge
        ↓
      Q6 具体的配備承認
         → 最終merge SHAからbuild
         → その同一artifactでQ3を再実行し独立判定
         → hash不変の同一artifactを手動deploy
         → 配信照合 → 本人へHTTPS URL
        ↓
      Q7 そのURLでiPhone/内容の実受入 → 必要な修正を同じゲートで再検証 → 正式完了判断
```

Q0の設定読取や権限/費用調査は拒否対象に依存しない。Q4aは非配備の実行基盤なので、Q0/Q2と対象・権限・費用の必要な承認を満たせばQ3より先行できる。Q3済みをその準備の前提にしない。先行提出にも独立レビュー・差分/承認/head照合を適用するが、Q5全体完了や配備許可とはしない。ローカルも承認済みCIも利用できなければ環境待ちで止め、未承認CI起動・追加インストール・新環境作成はしない。

Q4bはQ3後の配備側設計ゲート。Q6ではmerge前のQ3をそのまま流用せず、最終merge SHAからの最終生成物でQ3を再実行してから同じartifactを配る。Q1以後は送信停止を回避する別のゲーム版・別サービスを作らない。前提不足は「承認/正規根拠/環境待ち」と記録し、架空の期日で実行を約束しない。

## 3. 予定ファイルと責任の境界

下記の「新規」は将来提案で、現在存在する/承認済みという意味ではない。必要性と外部反映範囲をQ0で確認する。各群は一人のwriterが扱い、同じファイルに複数writerを置かない。

| 区分 | exact path | 役割 |
|---|---|---|
| 旧13の収録対象 | 下記一覧 | 保持候補と現mainを照合し、既反映分を再作成せず起動・回帰を結合 |
| 新内容/新規 | `src/ui/app.js`（settings v2）、`tests/browser/settings-submit.test.mjs` | 選択値固定、保存/辞書待ち中の再操作抑止、閉じた後の遅延UI/例外の回帰。旧app収録の承認と区別 |
| 新規 | `tools/build-pages.mjs` | Node標準機能で配布allowlist・相対閉包・状態/版表示・hash manifestを生成 |
| 新規 | `tests/pages-artifact.test.mjs` | 成果物の不足/過剰、サブパス、MIME対象、manifestとhash、非公開資料の混入を検査 |
| 新規 | `tests/browser/pages-smoke.mjs` | localhost上の成果物専用。新規隔離context、root/subpath、短経路、native保存、network/console、性能観測 |
| 新規 | `.github/workflows/pages-verify.yml` | PR read-only検査と承認済みの非配備実行先。Q4aで先行準備可能、配備しない |
| 新規 | `.github/workflows/pages-publish.yml` | 明示的手動起動のみ。最終merge版をbuild→その同一artifactでQ3→deploy。途中再生成・変換なし |
| 条件付き既存変更 | `src/style.css`、`src/ui/app.js`、`src/save/indexeddb.js`、既存保存検査 | 隔離配線/版表示の可読性に必要な最小差分のみ。backend既定名は変えない。必要な追加範囲を提示 |
| 生成物（ソース追加しない） | `dist/pages/`内の`index.html`、`publication.json`、runtime資源 | 実行時に生成。保存データや内部ログは入れない。候補SHA/資源hash/未検証を配信版へ対応づける |

旧未反映13の正確な一覧（列挙は送信指示ではない）:

```text
docs/ranking/local-verifier.md
index.html
src/locales/extract.mjs
src/ranking/local.js
src/ui/app.js
src/ui/ranking.js
tests/browser/committed-audio.test.mjs
tests/browser/departure-audio.test.mjs
tests/browser/i18n.test.mjs
tests/browser/locales-smoke.mjs
tests/browser/ranking-ui.test.mjs
tests/browser/smoke.mjs
tests/ranking-local.test.mjs
```

settings v2採用時は旧appを新内容に替え、新settings testを加えた14パス。build/probe/workflow等の新規提案はその14とは別の追加範囲。`src/locales/extract.mjs`はja辞書/key-manifestを書き換えるので、確認やbuild/CIのために実行しない。

## 4. タスクと検査

### Q0：先行条件・正規再開・採用範囲を固定

**責任:** 統合担当。独立確認は権限/差分レビュアー。**要件:** PUB-01/04/08/09/12。

**Files:** 既存main、旧13、settings v2、Pages設定を読取のみ。採用表・設定控えは提出ファイルではなく作業証拠として保持し、秘密を公開文書へ記載しない。

- [ ] 現main/head/tree/PR一覧を再取得し、上記基準と比較する。変更があれば差分と対象writerを確認し、本計画の基準だけで上書きしない。
- [ ] 旧13、settings v2のapp/新テストのパス・bytes/hash・差分・既承認範囲を照合する。新内容/新ファイル/新workflowと既存承認を区別して必要な承認を得る。
- [ ] `src/ranking/local.js`の原応答、操作、実行有無、正規再開根拠を確認する。復元できなければ当該送信と依存する起動版提出は停止したままにする。別方式で送れることを根拠にしない。
- [ ] Pagesのsource branch/path又はActions、custom domain/HTTPS、配備版、設定・配備権限、environment/branch保護を読取確認する。候補URLはHTTPと配信版が未確認であり、404/未公開を断定しない。
- [ ] 保存方式を次の決定表で選定し、URL/公開範囲/費用/復元案と、必要な設定・コード差分を具体化する。未決を暗黙に実装へ委ねない。

| 選択肢 | 採る条件 | 実装/証拠 | 採れないとき |
|---|---|---|---|
| A 専用origin（第一案） | 既存repoのPages用に使える専用ホスト名、所有権/設定権限、HTTPS、費用、過去使用を確認し必要な承認あり | 既存originと異なるscheme/host/port。新originで旧記録がないこと、storage非共有の証拠。DNS/Pages設定変更は承認範囲内のみ | domain購入や別サービス作成で進めない。Bを別提案又は保留 |
| B 同originの明示試験namespace（例外提案） | 従来の専用origin条件からの変更を説明し、具体的な配線・データ影響・復元方法が別途承認済み | appで`createIndexedDbStore({name:'yusha100-publication-preview-v1'})`を使う提案。全接続がこの名前だけで、既定`yusha100`のopen/read/write/delete/migration 0。失敗時fallbackなし | 証明できなければ公開せず、本人の旧記録がある領域へ接続させない |

**完了証拠:** 固定対象/権限/費用/隔離設計と再開根拠が対応した採用表。ここでは送信を試して検証しない。承認・原応答・環境のどれが不足するかを分ける。

### Q1：起動結合と保存隔離を一つの候補として成立させる

**責任:** UI統合writer一人、別の保存/副作用レビュアー。**前提:** Q0。**要件:** PUB-01〜04/07/11/12。

**Files:** 許可された旧13、settings v2 app/新test。隔離を採る場合の`src/ui/app.js`と既存save境界。既存音修正`src/ui/audio.js`等はmainの内容を保つ。

**Interfaces:** 既存`loadContentInBrowser('./')`→`createSession(content,createIndexedDbStore(options))`→`session.load()`→`loadMessages(locale)`。名前なし開始は`session.start(route,confirmReplace=false)`、設定は`session.settings(settings)`を使い、engine/storeの意味を変えない。

- [ ] `settings-submit.test.mjs`の既存v2回帰を読み、新しく必要な隔離配線の検査を先に追加する。試験名`preview_store_uses_only_selected_storage_boundary`で、起動・設定・再開時の接続が選定領域のみであることをassertする。同origin namespace案では既定`yusha100`への接続/fallback 0、専用origin案では既存originへの遷移0を検査する。
- [ ] 将来の隔離した候補で限定検査を実行し、未配線の失敗を確認する。既にv2で直っている設定の同条件を修正前失敗として捏造しない。
- [ ] 正規再開条件を満たした保持候補とsettings v2を照合して統合する。新たなsettings/隔離差分は別の反映対象として固定する。旧appへの巻戻しで既知回帰を持ち込まない。
- [ ] 下記コマンドの成功を確認し、原本/旧候補の不変と全差分を照合する。

```sh
node --test tests/browser/settings-submit.test.mjs
node --test tests/browser/committed-audio.test.mjs tests/browser/departure-audio.test.mjs tests/browser/ranking-ui.test.mjs tests/ranking-local.test.mjs tests/browser/i18n.test.mjs
node --test
node tools/validate-content.mjs
node tools/audit-translations.mjs --strict
```

**合格:** exit 0、失敗0、必要な回帰のskipなし。全体件数は実結果を記録し、1,663固定を要求しない。音の新main修正も含め全体を再検査。Node成功だけでnative/browserは合格にしない。未収録import、設定回帰、保存保全失敗、送信停止の未解決は停止条件。

### Q2：配布allowlistと検査可能なartifactを作る

**責任:** 配布writer一人、別の依存/情報混入レビュアー。**前提:** Q1。**要件:** PUB-05/06/10/11。

**Files:** 新規`tools/build-pages.mjs`、`tests/pages-artifact.test.mjs`。必要時のみ`src/style.css`。製品にないbuild/deployを既存機能として扱わない。

**新規CLI案（このタスクが定義・実装する）:**

```sh
node tools/build-pages.mjs --source . --out dist/pages --source-sha <検査する40桁commit-SHA>
node --test tests/pages-artifact.test.mjs
```

`--source`は固定checkout、`--out`は新規専用出力のみ。既存出力がある場合は上書き/削除せず非0で停止し、新しい空の作業領域でやり直す。`--source-sha`はcheckoutと一致を検証し、任意の表示値として信用しない。出力は`index.html`、runtimeの`src/`、`assets/characters/`、必要な`data/`、`publication.json`だけ。runtimeの推移importとJSON/SVG参照を保ち、`src/locales/extract.mjs`やNode専用loaderを実行しない。依存解析のためであっても製品モジュールを実行せず読む。

- [ ] artifact検査を先に作る。`missing_entry_or_import_fails`、`declared_script_including_samples_required`、`all_15_locale_files_required`、`reject_private_or_unlisted_files`、`source_sha_and_hashes_match`、`relative_urls_work_under_project_path`で不足/過剰のfixtureを失敗させる。source fixtureを壊さず、テスト専用の一時入力で欠落を作る。
- [ ] `publication.json`は`sourceSha`、`status: "preview"`、未検証カテゴリ、選定した保存方式、runtimeの相対path/bytes/SHA-256を持つ設計にする。自分自身のhashは対象外。commitに無い個人データ/内部ログ/秘密を記録しない。
- [ ] buildはallowlistをコピーし、生成HTMLの`#app`外へ確認用/固定SHA/未検証/送信なし/試験保存領域の状態表示を置く。appの再描画で消えないこと、操作を覆わないこと、狭幅/文字拡大でも読めることを検査する。これは新しい成果物変換として差分をレビューし、元indexを無断上書きしない。
- [ ] data4種と`data/scripts/manifest.json`の全宣言ファイル、動的SVGを含むcharacters/metrics、音recipe、15辞書/key資料の閉包を照合する。patchや_samplesを独断で除去しない。
- [ ] build前後のsource hash不変、成果物内の各hash一致、上記test exit 0を確認する。`.git`、内部管理ディレクトリ、docs、tests、ログ、環境変数/秘密、個人保存データ、撮影物が入ったら失敗。

**合格:** allowlist外0、未解決依存0、誤ったroot絶対参照0、hash不一致0。版表示は提案どおり実装した固定版にのみ「表示済み」とする。

### Q3：URL提供前の安全なブラウザ短経路を通す

**責任:** ブラウザ検査担当、短区間の視覚/音/操作は作者以外が判定。**前提:** Q1/Q2と安全な既存ブラウザ環境、又はQ4aで準備し承認された非配備CIの既存利用可能なブラウザ。Q6では最終merge SHAの最終artifactを同じ検査へ再投入する。**要件:** PUB-02〜07/11。

**Files:** 新規`tests/browser/pages-smoke.mjs`、Q2のartifact。既存root-only probeのガードは緩めない。外部公開はまだ行わない。

**新規probeのCLI案:** `YUSHA_BASE_URL`にloopback HTTP、任意pathを許すが、hostは`127.0.0.1`又は`localhost`、明示port必須。外部HTTPSをこの自動probeで訪問しない。Playwright/Chromiumが既に利用可能なローカル環境又はQ4aの承認済みCIのみで実行する。ローカルで使えなければQ4aを先行できるが、CIにも必要な機能がなければインストール・新環境作成・未承認の起動をせず環境待ちとして報告する。

- [ ] probeの入力検査を先に作り、外部host/credential入りURLを非0で拒否する。ガードは新規context生成直後・最初のpage作成前にcontext全域へ設定し、service workerを無効にする。popup/新pageにも最初の要求から同じ制約を適用し、同origin静的GET以外は送信前にブロック/失敗として記録する。
- [ ] `websocket_blocked_before_connect`、`redirect_hop_checked_before_send`、`popup_inherits_context_guard`を追加し、テスト専用loopback fixtureでWebSocket接続0、許可外redirect先への送信0、popup初回の許可外送信0をassertする。WebSocketはcontext全域でhandshake前に全拒否する。HTTP redirectは追従禁止、又は全hopで接続前にorigin/method/許可資源を検査する。レスポンス後のログ監視だけで送信を許さない。使用browser/automationの機能がこれらを保証できない場合、ガードを弱めずQ3を停止する。
- [ ] request/responseに加えてredirect各hop、WebSocket拒否、popup/新pageのガード適用結果、pageerror/console error、DB接続名を収集する。個人保存値は出力しない。ガード試験はローカル合成fixtureのみで、外部サービスへ接続して拒否を試さない。
- [ ] artifactの同一bytesをテスト専用の新規`.pages-check/root/`と`.pages-check/project/100masu_yusha/`へ配置する。既存ディレクトリは上書きせず、ここからだけ静的serveする。source repo全体を配る便利serveで混入を隠さない。
- [ ] 各serverは下記のように別shellで起動/終了管理し、probe完了後に当該serverだけを終了する。既存プロセスを一括停止しない。

```sh
python3 -m http.server 8080 --bind 127.0.0.1 --directory .pages-check/root
# 別shell：
YUSHA_BASE_URL=http://127.0.0.1:8080/ node tests/browser/pages-smoke.mjs
# 上の専用server終了後、別shell：
python3 -m http.server 8081 --bind 127.0.0.1 --directory .pages-check/project
# 別shell：
YUSHA_BASE_URL=http://127.0.0.1:8081/100masu_yusha/ node tests/browser/pages-smoke.mjs
```

- [ ] `home_and_anonymous_short_path`で4道の選択肢を確認し、新規隔離contextを使って各道を選べること、代表1道で振る→歩く→設定→reload/再開をassertする。1周完走は要求しない。run ID/route/rolled die/配置/scoreの保持は検査内比較し、公開ログへrawを書かない。
- [ ] `settings_pending_close_and_resume`でv2の選択確定、二重操作防止、辞書遅延中のclose/失敗、音量0・mute保存を実DOMで確認する。`native_store_isolated_atomic_resume`で選定DBだけに接続し、native保存再開とrequest成功後abort時の旧run/meta/backup保持を合成記録で確認する。診断専用モデルの成功だけで代替しない。
- [ ] `all_runtime_requests_static_and_hashed`でmanifest全宣言ファイル、15辞書を選択した際の取得、SVGを含むHTTP200/正MIME/hashを検査する。404やHTMLを返すJS/JSON、外部/非静的要求、POST、WebSocketの接続、未検証redirect追従、ガード前のpopup要求、console/pageerror、既定DBへの誤接続は失敗。
- [ ] 402×874/402×700/874×402相当、文字拡大、初回音unlock/mute/volume 0/背景復帰の短経路を確認する。短区間の実画面/動画/実聴を独立判定し、入力不能・隠れた主要操作・保存破損・古い音の暴発を残さない。実iPhoneや全11画面の合格とはしない。
- [ ] cold/warmのnetwork、Content-Encoding/cache、転送bytes、初回操作可能時刻、言語切替時間を観測する。2又は3辞書と15辞書総raw量を分け、数値未測定なら未測定とする。操作不能の性能障害は停止し、完成版の性能目標決定はQ7へ残す。

**合格証拠:** SHA/成果物全ファイルhash、操作列、request/response/redirect/WebSocket/popupのガード結果、DB隔離・abort結果、画像/動画/実聴の検査条件、独立判定。Q6の最終生成物についても同じ証拠を作る。予定通り走らない/環境なしは「未実施」であり成功としない。証拠は私的データを含めず保持し、公開する場合はその範囲を別に確認する。

### Q4a：非配備検査基盤を先行可能にする

**責任:** workflow writer一人、別の権限/費用レビュアー。**前提:** Q0/Q2と対象・権限・費用・副作用の必要な承認。Q3は前提にしない。**要件:** PUB-03/05/09/12。

**Files:** 新規`.github/workflows/pages-verify.yml`とQ3の検査ファイル。workflowをPRに追加すると検査が起動し得るため、先行追加前にトリガー/権限/費用/保管/対象の承認範囲を確認する。

- [ ] `pages-verify.yml`は`pull_request`と、必要な範囲が承認された場合だけ非配備の`workflow_dispatch`で検査する。`pull_request_target`、secrets、配備、write権限、untrusted codeへの認証情報引渡しなし。`contents: read`、checkoutの`persist-credentials: false`でNode/内容/翻訳/生成artifact検査を実行する。
- [ ] Q3の実行先として使う場合は、標準runnerに既存のbrowser/automationが利用可能で、context全域の送信前ガード（WebSocket/redirect/popup含む）が使えることを先に確認する。利用可能なら生成artifactをloopback serveしてQ3を実行する。未対応なら停止し、追加インストールや新環境作成を暗黙に行わない。
- [ ] 公式checkout等のversionとcommit SHAを実装時に再確認し固定する。公開repo標準runner、追加費用0、必要最短のartifact retention、cache原則なし、利用権限を確認する。課金/権限不明なら起動しない。[公式課金説明](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [ ] 独立レビュー、全差分、秘密/個人情報非混入、head/対象承認照合後のみ、必要な先行非配備検査PRを許可範囲で提出する。本人mergeやworkflow起動が必要ならその範囲を明示する。Q5と同じ提出時の保護を適用するが、Q5の全体完了や配備許可とはしない。

**合格:** 承認済みの非配備Q3実行先が用意でき、PR/手動検査から配備しない。準備不能は環境待ちで、Q3実行済みとはしない。

### Q4b：手動Pages配備の設計ゲートを閉じる

**責任:** workflow writer一人、別の権限/費用レビュアー。**前提:** Q0/Q2/Q3。Q4aをまだ使っていない場合は非配備検査側も同じ制約で準備する。**要件:** PUB-05/08〜10/12。

**Files:** 新規`.github/workflows/pages-publish.yml`、必要な非配備`pages-verify.yml`。新規ファイル/反映範囲と起動副作用の承認を確認する。

- [ ] `pages-publish.yml`は`workflow_dispatch`のみ。入力`source_sha`は40桁の具体的な承認対象merge commitで、mainに属することを照合する。自動push配備・任意branch/PRの公開はしない。
- [ ] 最終publishの順序を**build→Q3検査→deploy**に固定する。build jobはread-onlyで最終merge SHAをcheckoutしQ1/Q2の検査を行い、新規の最終artifactを生成する。続く非配備Q3検査はその同一artifactをloopbackでserveして全ガード/短経路/native保存/短区間独立判定を確認し、成果物全ファイルのhashを固定する。ローカルでしか行えない判定があれば、同じ生成物を安全な既存環境で検査し、戻った証拠とhashを照合するまでdeployを保留する。
- [ ] mergeで`sourceSha`の表示や`publication.json`が変わるので、merge前版との「runtimeは同じ」という判断だけでQ3を省略しない。Q3後にHTML/manifest/資源を変換・再生成した場合は不合格。検査対象と配備対象の全ファイル集合・bytes/hashの一致を検査し、途中変更・不一致・Q3未実行はdeploy不可とする。
- [ ] deploy jobはbuildとQ3検査の成功を`needs`で要求し、検査済みの同一artifactだけを使う。`pages: write`/`id-token: write`はdeploy jobだけ、`github-pages` environmentのURLと保護/承認を尊重。同時配備は直列化し、配備途中の強制取消で状態を曖昧にしない。
- [ ] 公式例のcheckout/configure-pages/upload-pages-artifact/deploy-pagesについて実装時の公式version・commit SHAを再確認して固定する。現公式例はcheckout v6、configure-pages v5、upload-pages-artifact v4、deploy-pages v4だが未検証SHAを書かない。configure等による必要な生成処理はQ3前に終え、upload/deployでruntimeを変更しない。[GitHub公式workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [ ] 公開repo標準runner/費用/権限/保管条件を再確認する。履歴版は一時artifact失効だけに依存せず、復元可能な固定source/manifest/必要な成果物の保持方法と費用を決める。独立レビューでトリガー、権限、固定SHA、Q3失敗時deploy不可、artifact全一致、environment保護を確認する。
- [ ] 既存Pages sourceがbranch方式なら変更の影響と復元控えを示し、必要な承認後のみActionsへ切り替える。[公開元設定](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

**合格:** 非配備検査と公開を分離し、最終SHA/最終artifactのQ3と必要な配備承認がない限りdeployしない。初回workflowの成功や配備実績は将来の実結果で確認し、この計画では主張しない。

### Q5：独立最終レビュー、許可済み提出、本人merge

**責任:** 統合writer、作者以外の最終レビュアー、mergeは本人。**前提:** Q0〜Q3/Q4bと必要なQ4a。**要件:** PUB-01/07/12。

- [ ] PUB全IDとQ0〜Q3/Q4a/Q4bの同じ固定版の証拠を対応づけ、重大指摘を解消する。差分の秘密/個人情報/内部資料混入0、既存mainの音・保存修正を保全、原本不変を照合する。
- [ ] 実行直前のmain/PR head/担当/外部反映承認を再照合する。承認済み対象の同一操作は再確認不要だが、追加ファイル・新内容・公開範囲・影響が変われば必要な承認を得る。送信停止の正規根拠はこの承認とは別である。
- [ ] 許可された対象・送信先repo・公開範囲だけでDraft PRを提出し、head/全文/差分を読戻す。応答不明なら存在/版を先に確認し、重複送信しない。拒否なら止め、経路変更しない。
- [ ] 本人へ変更と未検証を示し、本人がmergeする。merge後のsource treeと検査版を照合する。新しいmain差分があればQ1〜Q4bの影響範囲を再検査する。Q6の最終生成物Q3ゲートは省略しない。

**合格:** 本人mergeの固定SHA、差分、CI、独立レビューが対応。これは確認用公開の前提であり、公開成功ではない。

### Q6：承認された確認用公開と実URLの配信照合

**責任:** 配備担当。別の配信検証担当が照合。**前提:** Q5と具体的配備承認。**要件:** PUB-02〜05/08〜12。

- [ ] source SHA、配る内容/manifest、正確なHTTPS URL、一般公開範囲、専用origin又は承認済みnamespace、費用、停止/復元方法を提示する。必要な承認がない場合は配備しない。確認用ページが一般にアクセスできることを明示する。
- [ ] 旧Pages設定、旧配信SHA/URL、旧成果物/hashを控える。初公開で旧版なしなら「旧版復元不可、公開停止と設定復帰が代替」と明記する。破壊的操作を必要としない手順と担当を固定する。
- [ ] 承認された最終merge SHAを入力し手動workflowを実行し、固定checkout→build→Q3非配備検査→deployの順に進める。生成HTMLのsourceSha表示と`publication.json`もその最終SHAへ対応させる。merge前のQ3済み版をそのまま検査済み扱いしない。
- [ ] 最終生成物そのものにQ3の全通信ガード（WebSocket/redirect/popup含む）・root/subpath・native保存/短経路・短区間独立判定を行う。全ファイル集合・bytes/hashを固定し、検査後の再生成/変換なしで同一artifactをdeployへ渡す。別環境で独立判定する場合も同じartifact/hashに証拠が対応するまで待つ。Q3未実行・未対応環境・途中変更・hash不一致では停止する。environmentの承認を迂回せず、進行/失敗/応答不明を記録する。
- [ ] 実URLのHTTPS/HTTP200、JS/CSS/JSON/SVGのMIME、`publication.json`、source SHA、全runtime資源hash、リロード、短経路を照合する。配信側の実networkで必要な同origin静的要求以外0、WebSocket接続なし・redirect/popupにも制約が保たれ、選定DBのみで保存再開可能を確認する。配備成功ログだけで合格にしない。
- [ ] 固定SHA/URL/検証済み範囲/未検証/試験保存領域を本人に渡す。候補URLが実際に使えると確認できるまでは正式な確認URLとして報告しない。一般共有用canonicalはまだnullのまま。

**停止/復元:** 最終artifactのQ3未実行/ガード未対応/検査後変更、hash/SHA不一致、資源404/誤MIME、許可外送信/WebSocket接続、旧DB誤接続、保存破損、起動不能なら配備・URL提供を止める。既に公開した場合は、事前承認された配備担当が旧安全artifactを同じ経路で再配備し別担当が照合する。旧版なし/旧版も不安全なら承認された公開停止と設定復帰を行う。停止の権限・承認がなければ本人へ具体的影響と必要操作を伝え、新たな公開を進めない。キャッシュ混在も実資源hashで再確認する。復元のためにDBを削除/移行せず、拒否をSites/ZIP等へ迂回しない。

**合格:** 本人が開ける実HTTPS URL、固定配信版、最小短経路、外部送信0、保存保全。iPhone全受入や製品完成はまだ宣言しない。

### Q7：URLでiPhone/内容の実受入と正式完了判断

**責任:** 本人がゲームを確認し、検査担当が短い失敗復旧等を補う。最終レビュアーは作者と別。**前提:** Q6のURL。**要件:** PUB-02/04/06/07/11/12。

- [ ] 本人のiPhone 17 Pro、iOS/Safari版、URL/配信SHA、縦横実寸、通信条件を記録する。名前なし開始→4道選択→振る/歩く→設定→保存再開を最初に判定し、未実施/失敗を埋めない。
- [ ] 画面高低、回転、安全余白、文字拡大、44×44以上の操作領域、最後の選択肢/戻る/消音への到達を確認する。設定遅延・保存失敗・連打・閉じる後の遅延UI、mute/volume 0、音unlock、ロック/背景復帰を実機で判定する。
- [ ] スピーカー/イヤホンで3曲、盾・硬貨・鐘の実聴、取消/不足/試着で成立音なし、古い音/演出の再生なしを確認する。静止画やモデルの成功では代えない。
- [ ] 従来P4/P5/T07の4道11画面15言語、全イベントの直接内容検査、通し試遊・難しさ・時間、native保存の多タブ/競合/quota/旧形式保全を、同じ版へ対応づける。未到達は未検証として残す。これはQ6の前提へ逆戻ししない。
- [ ] 実機のcold/warm、実転送/圧縮/cache、初回操作可能時刻、切替時間を測定し、性能目標を提案・判断してから合否を付ける。15辞書raw合計から無根拠の性能評価/最適化をしない。
- [ ] 重大障害はQ6の停止/復元を使い、修正は該当Q1〜Q6で再検査・必要な範囲承認後に再公開する。非重大の未検証/未調整は本人が読める受入表へ残す。
- [ ] 独立最終レビューと本人の判断で、確認用URL提供、実機短経路受入、完成版受入、正式公開/共有先決定を別々に報告する。全条件を満たした版だけ正式完了とする。

**完了証拠:** 版/URL/端末/操作/期待/実際/判定/未検証、独立レビュー、本人の最終判断。現時点は全て将来工程であり完了していない。

## 5. 要件→実装・証拠の対応

| 要件 | タスク/役割 | 主なファイル・証拠 | 完了ゲート |
|---|---|---|---|
| PUB-01 | Q0/Q1/Q5 統合・権限レビュー | 旧13/v2差分、採用表、正規再開根拠、head/tree | 未解決なら依存提出停止 |
| PUB-02 | Q1/Q3/Q6/Q7 UI・ブラウザ・本人 | index/app、pages-smoke、実URL短経路、実機受入表 | URL前A→URL後B |
| PUB-03 | Q1/Q3/Q4a/Q6 検査担当 | ranking境界、context全域の送信前ガード、redirect/WebSocket/popup/実network証拠、許可外送信0 | A必須、以後維持 |
| PUB-04 | Q0/Q1/Q3/Q7 保存レビュー | app/store/session配線、DB接続名、native原子保存/再開・旧raw保全 | A隔離必須、B残境界 |
| PUB-05 | Q2/Q3/Q4b/Q6 配布・依存レビュー | build/pages-artifact/pages-smoke、最終SHAのbuild→Q3→同一artifact、全資源hash/HTTP/MIME | A必須 |
| PUB-06 | Q3/Q7 計測担当 | i18n、2/3辞書、HTTP実測、cold/warm・切替 | A操作可、B性能判定 |
| PUB-07 | Q1/Q3/Q5/Q7 独立レビュアー | Node/内容/翻訳、短区間実画面/音、完成受入 | A重大障害0、B全体 |
| PUB-08 | Q0/Q4b/Q6 配備担当 | Pages設定控え、verify/publish分離、手動配備記録 | A必須 |
| PUB-09 | Q0/Q4a/Q4b 権限/費用レビュー | 承認済み非配備基盤の先行、workflow固定SHA/permissions/environment/保管条件 | 起動前必須 |
| PUB-10 | Q2/Q3/Q4b/Q6 配備・別検証担当 | 最終artifactのQ3証拠、publication.json、全ファイルhash、旧設定/成果物、復元照合 | A必須 |
| PUB-11 | Q2/Q3/Q6/Q7 表示・本人 | 生成HTML状態表示、canonical null、未検証表 | A表示→B判断 |
| PUB-12 | 全工程 統合担当 | 文書/製品PR/本人merge/配備/受入の別記録 | 各ゲートで確認 |

## 6. 従来#6計画との関係・差分

| 従来 | 本計画で補う点 | 保つ条件 |
|---|---|---|
| P0〜P2：計画・再開・起動結合 | Q0/Q1で現main/#7後の音を保持し、旧13とv2新範囲を照合 | 送信停止を回避しない、原本不変、単独writer/独立review |
| P3：短区間の実画面/音 | Q3で公開前の重大障害を限定確認、Q7で実機へ展開 | 作者以外が実画面/実聴を判定 |
| P4/P5：保存・内容・4道11画面15言語 | Q3は隔離/保全と短経路、Q7は残る完成受入 | 内容・保存・言語の未検証をモデル成功で埋めない |
| P6→P7：実機を終えてから公開 | **Q6で安全な確認URL→Q7でそのURLのiPhone/内容受入→正式完了** | 公開前の権限・送信制限・保存安全は緩めない |
| P7：配信版照合 | Q2/Q4a/Q4b/Q6で非配備基盤の先行、最終merge版build→Q3→同一artifact配備、閉包/HTTP/MIME/hash/停止/復元を具体化 | 本人merge、具体的公開承認、自動push配備は別承認 |
| 専用origin | 第一案を維持し、同origin例外をQ0の別設計/承認ゲートへ明示 | pathだけで隔離しない。旧DBへ接続させない |

各工程の状態は未着手/作業中/検証待ち/承認・正規根拠・環境待ち/完了で管理する。停止時は対象操作、理由、実行済み範囲、未実行か応答不明か、必要な再開根拠を記録する。この2文書のレビュー合格は文書の合格であり、製品・公開の完了ではない。
