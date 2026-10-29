# SCENE — 技術・情報設計（ドラフト v0.1）

## 0. 開発環境

- **開発正本:** GitHub `Unjuno/Scene-platfrom`（Public）
- **実行・公開予定:** ChatGPT Work / ChatGPT Sites
- **以前の共用サーバー案（PHP/MySQL）は採用しない。**
- Sites側の認証、データストレージ、ファイル容量、利用可能なバックエンドAPI、配信方式を**実地検証してから実装の詳細を確定**する。利用可能と未確認の機能を混同しない。
- ブラウザ側はHTML/CSS/JavaScript（TypeScriptを使う場合も公開成果物はJavaScript）。MediaRecorder、IndexedDB、Web Audio、CacheStorageは機能検査して使用する。

## 1. 論理データモデル

**この文書は実装に依存しない論理スキーマ。SQLテーブルの存在は仮定しない。**

```text
User (0..n) ── owns ──> Work (1) ── contains ──> Scene (1..n)
                               │                     │
                               │                     └─ ScriptCue (0..n)
                               │
                               └─ permitted ──> Dub (0..n)
                                                    │
                                                    ├─ SceneTiming (per scene)
                                                    ├─ AudioTrack / AudioAsset
                                                    └─ selected Take (editing only until publish)

User ── rates ──> WorkRating
User ── rates ──> DubRating
User ── reports ──> ModerationReport
```

### User

`user_id`, `handle`, `display_name`, `profile`, `created_at`, `status`

- ロールは排他的にしない。ある人が作品を作り、視聴し、声を入れてよい。
- メールアドレス等の機密情報は公開プロフィールへ置かない。

### Work

`work_id`, `owner_id`, `title`, `description`, `visibility`, `dub_permission`, `created_at`, `updated_at`, `current_version_id`

- `visibility`: draft / public / private（公開URLの限定共有仕様は未決）
- `dub_permission`: allow / deny。新規作品はdenyを提案（最終確認事項）。
- 1作品が複数シーンを持つ。**作品自体の音声は必須ではない。**
- 作品URLは不変IDに基づく。タイトル変更でもリンクを維持。
- **作品の版番号（WorkVersion）を保持**し、既存アフレコが参照する画像・台本が作者編集によって破損しないようにする。

### Scene

`scene_id`, `work_version_id`, `order`, `image_asset_id`, `script_cues[]`

- 1シーン = 1枚の静止画。動画/GIFは不可。
- Sceneに必須の固定秒数は置かない。
- 1シーン内に複数のcueを設定できる。

### ScriptCue

`cue_id`, `scene_id`, `order`, `speaker_label?`, `text`

- 内容と順序が主データ。タイムスタンプ設定は後から付けられる拡張。
- 公開視聴画面ではこの文字列を重ね表示しない。
- 音声版の詳細ページで台本内容を参照できるようにする。

### Dub

`dub_id`, `work_id`, `work_version_id`, `owner_id`, `source_kind`, `state`, `timing_version`, `created_at`, `published_at?`

- `source_kind`: human_recording / externally_generated_ai / mixed（必要なら）。
- `state`: local_draft / server_draft / published / hidden / removed。
- `scene_timings`: 対象work_version内の各sceneの順番・開始時間・終了条件・音声素材参照。
- 台本と画像は元作品の版を参照し、同じ画像を重複保存しない。
- 録音を何回も試したtakeは**非公開編集情報**として保持する。公開に必要な選択結果だけを版に記録する。
- アフレコ版ごとのシーン表示時間は自由。音声終端、手動トリガ、任意の待機時間を表現できるスキーマを採用するが、編集UIの詳細は未決。

### Rating

`rating_id`, `target_type` (work|dub), `target_id`, `rater_id`, `stars` (1..5), `created_at`, `updated_at`

- 作品とdubの星を統合しない。
- 本人による二重投票・複数アカウント・機械投票への対策を持つ。
- 集計方法とランキングの更新間隔は未決。

## 2. 最小API（能力ベース）

**実際のURLやサーバーフレームワークはSites環境を調べてから決める。**

| 能力 | 必須検証 |
|---|---|
| work.create / update / publish | 認証、owner一致、静止画形式、権利確認 |
| work.setDubPermission | ownerのみ、状態の原子的更新 |
| dub.createDraft / uploadAsset / publish | 作品の現行許可、演者本人、対応WorkVersion、容量上限 |
| work.list / work.get / dub.list / dub.get | 公開可視性、非公開資産URLの漏洩防止 |
| rating.upsert | 本人認証、対象の可視性、重複投票防止 |
| report.create / moderator.action | 認証、監査ログ、権限境界 |
| account.delete / exportData | 個人データ削除・必要ならバックアップ方針との調整 |

**アフレコを許可した作品でも、作者の作品画像や台本を改変する権限は演者へ渡さない。**

## 3. 実行フロー

### 作成

```text
作品新規作成 → 画像を選ぶ → クライアントでWeb向けに最適化
→ シーン順序決定 → シーン内に複数台詞を設定
→ （任意）アフレコ許可 → 無音で保存・公開
```

### アフレコ

```text
公開作品 → アフレコ許可を確認 → 編集前全素材ロード
→ マイク録音 / 音声ファイル選択 → プライベートテイク保存
→ 再生・戻す・採用を繰り返す → シーン表示時間を調整
→ 公開前の権限再検証 → アフレコ版公開
```

- **権限のUI表示だけでは保護できない**。公開API側が本人と許可を検証すること。
- 編集前の「全素材ロード」とは、必要なファイルを取得すること。端末のRAMへすべて同時に展開することではない。
- IndexedDBは一時編集用。ブラウザ設定やストレージ逼迫により削除され得るため、**永続保証と表示しない**。サーバ下書き同期と復元手順を別途設計。

### 鑑賞

```text
公開作品URL → 一枚目表示 → 以後の画像を順次プリロード
→ 音声版のタイミングで画像切替 → 作品終了
→ 作品星評価 → 音声版比較・音声版星評価
```

## 4. 音声・時間同期

- 映像ファイルや動画の `currentTime` を必要としない。
- 作品再生の共通時計を用意し、シーンごとに音声終端等を条件に次へ進める。
- マイクはブラウザの `MediaRecorder` の対応形式検査で録音。WebM/Opusだけに固定しない。
- 取り込んだ音声は公開前に音量・長さ・再生可否を検査。
- シーク・一時停止・途中再開では音声を二重再生しない。
- 無音作品の送り方は暫定「手動で次へ」。最終確認前に自動時間を固定しない。

## 5. ストレージ・セキュリティ境界

- **コード・設計書:** Public GitHub
- **公開画像・公開音声:** サイトのメディア保存先
- **非公開テイク・未公開下書き:** 利用者本人のみアクセス可能な保存先
- **認証情報・秘密鍵:** サーバー側の安全な秘密管理
- **イベント・評価・監査ログ:** アクセス制御されたデータベース等

音声/画像の配信料金はストレージ容量だけでなく転送量にも依存する。ChatGPT Sitesの実際のクォータ・保存API・エクスポート可否を確認するまで費用や無制限運用を断言しない。

## 6. データの整合性と版管理

1. 一つの作品の公開版は、シーンの**順序**と画像・台本内容を一組に固定する。
2. アフレコ版は作品の**特定公開版**を参照する。
3. 作者による更新は次の作品版を作る方式を優先（既存アフレコを壊さない）。
4. 編集途中の失敗アップロードで、旧音声や他人の作品を壊さない。
5. 公開後の非表示・削除で、関連アフレコの扱いをユーザーに説明する。
6. GitHubへ作品の実利用者メディア・DBを保存しない。

## 7. 試験の優先順位

1. 画像と台本だけで無音作品を作り、端末を変えて閲覧できる。
2. 1シーン内に複数台詞があっても、画像が勝手に変化しない。
3. 自分・他人のアカウントでアフレコ許可ON/OFFを試し、サーバー側で権限が守られる。
4. 二人の演者が同じ作品に異なるコマ表示時間を設定できる。
5. 編集中の未採用テイクを他人が取得できない。
6. 作者が作品を更新しても、旧アフレコが参照する版は壊れない。
7. 読み込みの失敗・録音拒否・離脱復帰が画面上で説明される。
8. スマートフォン実機で操作できる。

## 8. 非公開実装版の具体構成（2026-10-28）

- React 19 / TypeScript / Vinext。Sitesの標準Workerエントリとsites()統合を保持。
- D1: works, work_versions, version_assets, assets, takes, dubs, dub_takes, ratings, profiles, reports, audit。画像/台本はimmutable work_version、アフレコはversion_id固定。
- R2: `assets/<UUID>`。直接公開バケットURLは発行せず、`GET /api/assets/:id`でD1可視性を検証。Rangeを解析して音声シーク対応。レスポンスはprivate/no-store、nosniff。
- ChatGPTのdispatchが注入するIDを所有者キーにする。クライアントからowner_idは受け付けない。製品に独自ログイン/テストユーザーは追加しない。
- アフレコ公開はSELECT時だけでなく書込SQLのEXISTS条件でも現行許可を確認。非公開テイクと採用テイクの関連付けを区別。
- 作品保存はbaseVersionによる楽観ロック。複数SQLはD1 batch。作品更新と公開版作成を一組で扱う。
- 評価の複合主キーは(target_type,target_id,user_id)。再投稿はUPSERT。一つのアカウントの多重票を防ぐが、複数アカウントの組織票対策は未実装。
- モデレーターはサーバー環境変数SCENE_MODERATOR_IDSの許可リスト。初期状態では未設定で権限を与えない。通報の閲覧・非公開化・対応不要・監査ログを実装。
- 閲覧は次の一枚のみ先読み。編集は圧縮Blobを逐次取得しobject URLとして保持、全画像を一斉にデコードしない。URLは終了時に解放。
- メディアは形式のシグネチャ確認、APNG/アニメWebP拒否。サーバー側の完全な音声デコード/トランスコード/ウイルススキャンは未実装。
- GitHubにはコード、架空サンプル、仕様、テストのみ。D1/R2、.env、.wrangler、出力アーカイブは対象外。

APIの具体実装はlib/api.ts、DB構造はdb/schema.ts。容量、バックアップ復旧、保持・完全消去、公開運営の規約/異議申立ては一般公開前の課題。
