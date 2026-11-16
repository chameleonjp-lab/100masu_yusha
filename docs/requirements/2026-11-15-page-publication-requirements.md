# 100マス勇者：本人が開ける確認用公開ページの要件

## 何が済めばiPhoneで開けるか

**起動に必要なファイルを正規に収録し、保存を隔離し、静的成果物と最小のブラウザ動作を検査した後、承認された固定版をHTTPSで手動公開する。先に確認用URLを届け、そのURLでiPhoneの受入を行う。** 全編の完成・全1000件の内容確認・4道の完走・iPhoneの全受入を、最初のURL提供の前提にはしない。ただし、確認用でも送信の制約、保存保全、権限、安全確認は省略しない。

現mainにはゲームの入口と画面結合がなく、公開設定・配信内容も確認できていない。資料だけのページやHTMLの入口だけでは、ゲームを確認できる状態にはならない。本書と[実装計画](../plans/2026-11-15-page-publication-implementation-plan.md)は文書のみの追加であり、製品コード、テスト、設定、配備を実行・変更しない。

[従来のマージ後完了計画](../plans/2026-11-15-postmerge-completion-plan.md)を置換しない。既存の[要件仕様書](../requirements.md)、[T01〜T09計画](../implementation-plan.md)、[絵と演出の指示書](../art/art-direction.md)に、公開到達の順序・未確認事項・作業範囲を補足する。

## 1. 現在地と、いま足りないもの

2026-11-15 UTC時点の読取。後続着手前に更新を照合する。

| 項目 | 確認できたこと | 不足・未確認 |
|---|---|---|
| 基準版 | [main `62714aa4f688aa22a6f5b26370daa21930344a92`](https://github.com/chameleonjp-lab/100masu_yusha/tree/62714aa4f688aa22a6f5b26370daa21930344a92)、tree `caa0389238cb67de3ee2d6bc1a213af09638f0f4`、369ファイル。[計画PR #6](https://github.com/chameleonjp-lab/100masu_yusha/pull/6)と[音PR #7](https://github.com/chameleonjp-lab/100masu_yusha/pull/7)はマージ済み | マージは起動・公開の証明ではない |
| 入口 | `index.html`、`src/ui/app.js`、`src/ui/ranking.js`、`src/ranking/local.js`がmainにない | 起動結合、後述の正規再開条件、新内容の反映範囲 |
| 実行・配備 | [package.json](https://github.com/chameleonjp-lab/100masu_yusha/blob/62714aa4f688aa22a6f5b26370daa21930344a92/package.json)は`test`、`validate`、`serve`のみ。build/deployおよび`.github/workflows`なし | 検査可能な配布成果物と手動配備経路 |
| Pages | `has_pages=true`、homepage未設定。候補URLは `https://chameleonjp-lab.github.io/100masu_yusha/` | 現在のsource branch/path、custom domain、配備SHA、設定・配備権限、HTTP応答は未確認。候補を正式URLにしない。404とも非公開とも確定していない |
| CIと検査 | 読取時Actions 0件。保持版の広いNode検査1,663件成功という過去の固定結果がある | この文書で再実行していない。CI成功、native IndexedDB、実ブラウザ、iPhone、実聴、性能の合格には代えられない。Actions 0件は全公開の不存在を証明しない |

### 未反映13パスと、送信停止1操作を分ける

[従来計画P1](../plans/2026-11-15-postmerge-completion-plan.md#p1未反映13パスと正規の再開条件を固定する未完)の旧13パスは、現在もmainに未収録。**13件すべてが個別に拒否されたという意味ではない。** 起動の依存は次のとおり。

```text
index.html → src/ui/app.js → src/ui/ranking.js → src/ranking/local.js
```

既知の送信停止は`src/ranking/local.js`の正規GitHub blob作成1操作。原応答・種類・正式な再開根拠が確認できておらず、承認不足か安全上の拒否かを断定しない。同操作の再試行や、別ツール・branch・repo・サービス・名称・再実装による同内容の移送で迂回しない。正規の根拠を確認できなければ、該当送信とそれに依存する起動版の提出を停止する。包括的な続行指示、計画承認、マージはこの停止の解除を意味しない。

残りには資料・翻訳抽出・音/翻訳/ランキング/UI回帰が含まれる。以前の保存診断2件、装備受取翻訳、資料、音の既反映分は再追加しない。旧`app.js`とsettings v2は内容が異なる。v2の`app.js`と新規`tests/browser/settings-submit.test.mjs`を採用する場合は新内容・新ファイルの外部反映範囲を確認し、旧13に新テストを加えた14パスとなる。旧appをそのまま戻して既知の設定回帰を再導入する方針にはしない。

## 2. 二段階の到達点

| 段階 | 合格するもの | まだ合格としないもの |
|---|---|---|
| A：安全な確認用URL | 正規に収録された固定版、保存隔離、必要資源の配信、外部送信0、最小ブラウザ経路、公開後照合。本人がiPhoneで実際のゲームを開ける | 全イベント、全ルート完走、11画面・15言語の自然さ、実機音・性能、完成版受入 |
| B：URLで実機・内容受入 | iPhone 17 Pro/Safariの短経路と、従来仕様の4道・11画面・15言語・保存・音・性能等を証拠付きで判定 | 未検証を「完成」で埋めない。重大指摘は修正・再検査し、最終完了は本人の判断 |

確認用公開は公開アクセスであり、「確認用」と表示してもアクセス制限にはならない。以下の版表示は**提案する追加要件**で、既実装ではない。画面に「確認用・未完成」、配信元commit SHA、検証日、未検証の種類、ランキング未連携・送信なし、試験記録の保存領域を、ゲーム操作を妨げず表示する。個人の記録や内部の作業ログは表示・配布しない。

## 3. 公開到達の要件と受入証拠

IDの「A」は初回URL提供前、「B」はURL提供後の完成受入。Aを満たさず公開しない。Bを残す場合は具体的な未検証として表示・報告する。

| ID | 要件 | 判定・必要な証拠 |
|---|---|---|
| PUB-01 A | 現main、旧13、新settings内容、送信停止、公開先と権限を個別に固定する | パス/差分/内容hash、停止操作の正規再開根拠、採用範囲、承認された対象版。未解決なら依存提出を停止 |
| PUB-02 A→B | HTTPS URLからホーム→名前なし開始→4道から選択→1回振る/歩く→設定→保存再開を操作できる | Aは隔離ブラウザで短経路、4道の選択可能性、console/pageerrorなし。公開後は実URLで同じ短経路。Bは本人のiPhone 17 Pro/Safariで確認し端末・OS・Safari版・SHA・期待/実際を記録 |
| PUB-03 A | 実験場ランキング未連携。試験/実スコア送信、外部API、認証、個人情報送信0 | 端末内表示と外部ランキングを区別。静的な通信箇所検査に加え、初回/操作/再読込/設定/復帰の実networkログで必要な同origin静的資源以外の要求0。検査context全域でpopup/新pageにも送信前ガードを適用し、WebSocketを接続前に全拒否、redirectは追従禁止又は各hopを送信前に検証する。どれかを制御・記録できない環境は検査停止。共有・外部遷移も起こさない |
| PUB-04 A→B | 既存保存、冒険/操作ID、乱数、抽選済み内容、score、旧rawを保全する | 下記の保存隔離ゲート、native IndexedDBで保存再開と原子的なrun/meta/backup保持を確認。既存DBへ無断接続・削除・名前変更・移行しない。Bで多タブ/競合/容量不足等の残条件を閉じる |
| PUB-05 A | サブパスでも完結する静的成果物を作る | index/app/cssの相対参照、ESMの推移的import、素材/metrics、WebGL/音recipe、全必要JSON、script manifestが列挙する全ファイル、15辞書とkey資料の存在/hash。ルートと`/100masu_yusha/`配下双方で404・誤MIME・未解決import 0。最終merge SHAから生成した成果物そのものに公開直前のQ3検査を行い、検査後の変換・再生成なしで同一成果物を配る |
| PUB-06 A→B | 必要な言語を読み込み、性能を実測する | `loadMessages(locale,fetcher=fetch)`はja/en/選択言語を重複排除し順次fetchするため2又は3辞書。15辞書合計12,216,779 raw bytesを毎回転送量と呼ばない。HTTP転送/圧縮/cache、cold/warm、初回操作可能時刻、切替時間を記録。Aは操作可能になること、Bは実測を基に目標を決め達成判定 |
| PUB-07 A→B | 検査・短区間独立レビューと完成受入を分ける | Node/内容/翻訳構造、最小の実画面・保存再開・音/操作の重大障害をAで確認。Bは4道11画面15言語、音の自然さ、内容、通し試遊、性能を別判定。モデルや素材単体の合格では代替しない |
| PUB-08 A | 既存公開repoのGitHub Pagesを第一候補とし、現在設定を確認してから検査と手動公開を分離する | branch/root・docs・Actionsのどれか、domain/HTTPS、既存配備、権限を読取確認。PR検査は配備しない。具体的な版/URL/公開範囲/費用/復元方法の必要な承認後のみ手動配備 |
| PUB-09 A | CIの権限と費用を最小化する | 公開repoの標準runner無料範囲を確認。大型runner・課金API・新サービスなし。artifact/cacheの保管費・権限を開始前に確認。公式Actionsは実装時にversionとcommit SHAを確認して固定。PRはread-only、deploy jobのみ`pages:write`/`id-token:write`、environment/branch保護を尊重。非配備検査基盤Q4aは権限/費用/対象範囲の必要な承認後にQ3より先行可能。ローカルbrowserがなくても、承認済みCIの既存利用可能なbrowserでQ3を実行できる。未承認CI起動・追加インストール・新環境作成は認めない |
| PUB-10 A | 固定版を配り、公開後検証と停止・復元を行える | source SHA、成果物hash一覧、実URL、HTTP/MIME、配備記録と実資源hash、短経路の一致。最終publishはbuild→その最終merge SHA/同一成果物へのQ3検査→deploy。mergeでsourceShaの版表示も変わるため、merge前の検査を流用せず、途中変更・hash不一致・未実行時は停止。旧版/設定/成果物の控えを保持し、安全な版へ復元又は公開停止。初公開で旧版なしならその制限を明記 |
| PUB-11 A→B | 確認用の状態・版・未検証を明示し、canonical URLを勝手に確定しない | 提案の状態表示を独立レビュー。`CANONICAL_URL=null`は正式URLの別判断まで維持。候補URLを共有先へ自動設定せず、本人向けURL提供と一般向け共有機能を区別 |
| PUB-12 A→B | 文書・実装・提出・マージ・配備・完了を別に管理する | この2文書のみのPRと将来変更を区別。単独writer→独立review→検証→許可済み提出→本人merge→許可済み確認用公開→URLで受入→正式完了の証拠を残す |

### 保存隔離の決定ゲート（PUB-04）

現候補のappは`createIndexedDbStore()`を呼び、[backend](https://github.com/chameleonjp-lab/100masu_yusha/blob/62714aa4f688aa22a6f5b26370daa21930344a92/src/save/indexeddb.js)の既定DB名は`yusha100`。GitHub Pagesの同一ホストで別pathにしてもoriginとstorageは分離されない。単に`/preview/`を付けて本人の旧記録を守れるとはしない。

1. **第一案は専用origin。** 既存repoのPagesを使いつつ、利用可能な専用ホスト名の有無、所有/設定権限、HTTPS、DNS変更、費用、旧利用の有無を確認する。ドメイン購入や設定変更はこの文書から実行しない。未使用originを証明し、他の記録へ接続しないことを確認して採用する。
2. **専用originが確保できない場合の代案は、別途設計・承認する同origin試験領域。** 明示的な試験DB名をappからstoreへ渡し、全storage利用箇所を点検する。新規試験領域への接続のみ、既定`yusha100`のopen/read/write/delete/migration 0をnativeログで証明する。既定DB名自体は変更せず、旧rawを隔離したまま保つ。これは従来計画の専用origin条件を変更する提案であり、同意済みの例外ではない。
3. いずれも、保存再開・設定保存が同じ試験領域に戻り、失敗時に通常領域へfallbackしないことを検査する。適切な隔離を証明できなければ、本人の旧記録があるoriginへ確認版を接続させず、公開・URL受入を保留する。

### 静的成果物の依存範囲（PUB-05）

- 旧入口は`./src/style.css`と`./src/ui/app.js`を参照。appは`assets/characters/metrics.js`、動的なキャラクターSVG、stage、audioとrecipe、session/save、browser content、i18n、端末内rankingに依存する。
- [browser loader](https://github.com/chameleonjp-lab/100masu_yusha/blob/62714aa4f688aa22a6f5b26370daa21930344a92/src/content/browser.js)は`data/scripts/manifest.json`を取得する。Nodeはディレクトリ列挙なので、Node成功だけではmanifest漏れを発見できない。
- `data/adventure-content.json`、`data/balance-draft-2.json`、`data/tuning.json`、`data/patches/encounters-balance-draft-2.json`と、manifest列挙のevents/items/equipmentを配る。optionalなpatchでも現版に存在するものを勝手に落とさない。宣言済み`events/_samples.json`、`_samples-items.json`、`_samples-equipment.json`を不要と決めつけない。
- `src/locales/messages/*.json`の15辞書、`catalogs.js`、`ui-templates.js`、key-manifest等を保持する。[i18n実装](https://github.com/chameleonjp-lab/100masu_yusha/blob/62714aa4f688aa22a6f5b26370daa21930344a92/src/ui/i18n.js)の`import.meta.url`基準の相対取得も検査する。
- 配布対象をallowlist化し、`.git`、内部管理資料、ログ、認証情報、個人の保存データ、テスト撮影物は成果物に含めない。フォント/CDN/外部API依存を追加しない。

## 4. URL提供前と後の検査範囲

**URL提供前（A）:** 固定候補の回帰、artifact閉包、隔離ブラウザで名前なしの短経路とnative保存再開、network、幅低/高・回転・文字拡大で主要操作が隠れないこと、最初のタップの音unlock・mute・volume 0・バックグラウンドからの復帰を最小確認する。短区間の絵・音・操作を作者と別のレビュアーが確認し、入力不能・状態破損・耳障りな暴発・外部送信などの重大障害を残さない。実聴できない条件は合格にせず、何を確認できたかを限定する。

**URL提供後（B）:** 本人のiPhone 17 Pro/SafariでPUB-02短経路を確認する。高低画面、縦横、安全余白、文字拡大、44×44以上の操作領域、設定の保存/閉じる/遅延、スピーカー/イヤホン、3曲・盾・硬貨・鐘、消音/音量0/短縮/動きを控える/ロック復帰、古い音の再生なしを判定する。保存の多タブ・競合・quota/abort・旧形式保全、4道11画面、15言語の欠落と自然さ、従来T07の内容・通し試遊・難しさ・時間を別々に記録する。全1000件は直接状態を用いた内容検査も使い、ランダム完走を増やして済ませない。

性能には端末/通信/版を付け、辞書以外のcontent・素材・WebGL・音初期化も測る。数値目標は測定後に提案・判断し、根拠なく「軽い」「最適化済み」としない。安全や操作を妨げる性能障害はAで停止し、それ以外の未調整値はBの受入課題として明示する。

## 5. 配備・費用・復元の境界

GitHub Pagesは公開repoで利用でき、sourceはbranchのroot/docs又はActions。設定には該当する管理権限が必要で、現設定は推測しない。[GitHub公式の公開元設定](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

第一候補は既存repo内の**検査専用workflowと承認された手動公開workflowの分離**。非配備検査基盤Q4aはQ0/Q2と対象・権限・費用の承認を前提に先行でき、ローカルbrowserが使えない場合のQ3実行先にもなる。配備側Q4bと実配備はQ3後の別ゲートとし、検査基盤の準備を配備許可に読み替えない。PRやmain pushを公開トリガーにしない。自動push配備は将来の別変更・別承認とする。最終手動publishでは、本人merge後の固定SHAからbuildし、その生成物をQ3で検査してから同じartifactをdeployする。sourceSha表示が変わる以上、merge前の成果物と同じとみなして検査を省略しない。検査後にHTML/manifest/資源を再生成・変更した場合は停止し、改めてQ3を行う。Pages連携は公式Actionsを用い、artifact・environment・必要権限を設定する。[公式のカスタムworkflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

公開repoの標準runner無料範囲を前提にできるが、大型runnerや保管容量等の課金は別である。利用権限・artifact/cache保管条件と追加費用0を開始前に確認し、満たせなければ止める。[GitHub Actionsの課金説明](https://docs.github.com/en/billing/concepts/product-billing/github-actions)

配備前に旧設定・旧成果物・旧配信SHAを保持する。旧版がある場合は同じ検査を通せる既知の安全な成果物に戻す。初公開で旧版がない場合、復元先は存在しないため、承認された公開停止と設定復帰を用意する。設定の復元で端末内データまで戻るとはしない。非互換な保存変更を公開しない。配備担当が実施し、別の検証担当がURL/版/通信を確認する。破壊的変更、公開停止や設定変更等は必要な承認範囲を事前に定め、強制削除しない。

## 6. 従来#6計画との差分

| 論点 | 従来計画 | この補足 |
|---|---|---|
| 実機と公開の順序 | P6実機→P7公開 | 安全ゲート→確認用公開→本人がそのURLで実機/内容受入→正式完了。実機前提のURL欠如を解消 |
| 最初の公開の条件 | 完成受入との境界が読み取りにくい | Aの安全な短経路とBの完成版受入を明示。全編完走・全実機受入をAへ逆流させない |
| 現在版 | PR #5後のmainと検査1,638件 | #6/#7後の固定mainへ更新。過去Node1,663を配信/実機成功へ読み替えない |
| 送信停止 | P1の13と停止1操作 | 区別を維持し、起動依存・settings v2の新内容/新テストを具体化 |
| 保存隔離 | 専用originが必要 | 第一案を維持。同origin namespaceは別設計・承認・旧DB不アクセス証拠が必要な代案と明記 |
| 配信の実体 | 公開先と配信版の照合 | artifact閉包、サブパス、MIME/hash、手動配備、費用/権限、復元まで要件化。非配備CI先行で環境の循環を解消し、最終merge版のbuild→Q3→同一artifact配備を必須化 |
| 公開対象 | 旧計画とレビュー文書 | 今回は要件と実装計画の2文書だけ。製品変更、新test/workflow、権限変更、配備は別工程 |

本書の採用・マージだけで将来の実装・送信・設定・配備が全面承認済み又は実行済みにはならない。後続マージは本人が行い、必要な承認と正規再開条件を満たした範囲でのみ次へ進む。
