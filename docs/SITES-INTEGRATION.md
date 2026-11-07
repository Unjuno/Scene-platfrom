# SCENE — ChatGPT Sitesへの実装・移行計画

## 1. 検証済みと未検証を分離

**確認済み:** 2026-11-06時点でGitHub `Unjuno/Scene-platfrom` の `main` には公開サイトの実装コードが入っていない。現在の公開SitesとGitHubを直接比較・同期できない。

**未検証:** Sitesランタイムの具体的な認証API、データベースAPI、Blob署名URL、フレームワーク、ファイル制限、永続化と移行ツール、ロールバック、デプロイAPI。**以下に架空のSDKメソッドを指定しない。** Work側で稼働サイトの編集権限と実環境を確認してからアダプタ実装する。

## 2. 依存関係の方向

```text
画面（DOM / Canvas装飾）
      ↓ ユーザーイベント
View actors（明示的状態機械 + 世代管理）
      ↓ 副作用の意図
Application service（編集・公開・再生・投票のユースケース）
      ↓ インターフェース
Repositories / Auth / Media / Events / Moderation adapters
      ↓
実際のChatGPT Sitesが提供する認証・保存・配信・アクセス制御
```

- GitHub正本は`src/`以下の状態機械・ドメイン・UI・アダプタ契約。
- 既存Sitesソースをまず取得して、ユーザーデータを壊す変更をしない。変更前の検証用環境を用意する。
- データモデルとDBのスキーマを勝手に合わせない。移行はバージョン付き手続きで実施。

## 3. 最小データモデルとキー

| エンティティ | 主キー | 主要フィールド | 不変条件 |
|---|---|---|---|
| `User` | userId | displayName, status, createdAt | 認証で確定した識別子を信頼 |
| `Work` | workId | ownerId, currentRevisionId, visibility, dubPermission | 作者のみ更新可能 |
| `WorkRevision` | revisionId | workId, revisionNo, scenes[], publishedAt | **公開済版は変更不可** |
| `Scene` | sceneId | workRevisionId, order, imageAssetId | 1コマに1枚の静止画 |
| `Cue` | cueId | sceneId, order, speaker?, text | 1シーンに複数設定可能 |
| `Dub` | dubId | actorId, workId, workRevisionId, voiceKind, status | 常に元作品の固定版を参照 |
| `DubTiming` | (dubId,sceneId) | order,startSec,endSec,pauseSec | 表示時間は音声版ごと |
| `Take` | takeId | actorId,dubId?,sceneId?,audioAssetId,status | 公開前は本人のみアクセス可 |
| `Asset` | assetId | ownerId,mediaType,size,hash,status,blobRef | URLの直接共有で非公開を破れない |
| `Rating` | (userId,targetType,targetId) | stars,updatedAt | 同じ対象に同一本人1票、作品とdubを分離 |
| `ModerationReport` | reportId | reporterId,target,status,reason | 管理者権限と監査ログ必須 |
| `MutationRequest` | idempotencyKey | actorId,kind,result,createdAt | 二重クリック・通信再送の重複登録防止 |

**音声タイミング:** 秒単位はSIのsで保存し、音声ファイルの再生時計に一致させる。シーン・作品に固定のハード時間上限を設けない。サイズ・帯域保護は別途検証済みのポリシーとして設ける。

## 4. アダプタが提供すべき能力（API名は抽象）

### Work
- `createDraft(actor, data)`
- `saveDraft(actor, workId, expectedRevision, data)`
- `putImageAsset(actor, workId, image)`
- `publishWork(actor, workId, idempotencyKey)`
- `getPublishedWork(workId, revision?)` / `listPublishedWorks(query)`
- `setDubPermission(actor,workId,allow)`

### Dub
- `createPrivateDub(actor,workId,workRevisionId)`
- `putPrivateTake(actor,dubId,sceneId,blob,sourceKind)`
- `selectTake(actor,dubId,takeId)`
- `publishDub(actor,dubId,idempotencyKey)`
- `listPublicDubs(workId,workRevisionId)`

### Rating
- `putRating(actor,targetType,targetId,stars,idempotencyKey)`
- `listRatingAggregates(type,filter)`

### Auth / Moderation
- `getSession()`, `requireActor()`, `canAccessPrivateAsset(actor,assetId)`
- `createReport(actor,target,reason)`, `reviewReport(moderator,reportId,decision)`

**重要:** これは要求される機能の名前であり、Sitesの実在するSDKではない。実装者は環境に適合するものへ変換する。

## 5. 公開処理の整合性

### 作品の公開
1. 認証・所有者IDと現在の作品版をサーバで検証する。
2. 対象の画像が静止画かをサーバ側で再検証し、ファイルデータが保存済みであることを確かめる。
3. 台本と画像順を不変スナップショット（WorkRevision）として作る。
4. `Work.visibility`の切替と`currentRevisionId`更新をDBの一連のコミットで実行する。
5. **コミット確認後のみ**投稿画面へ「公開しました」と返す。
6. 失敗で残った孤立したBlobは非公開のまま後で回収できるようにする。

### アフレコの公開
1. 録音テイクを非公開メディア保存へアップロード。
2. actor本人と対象のWorkRevisionを確認。
3. 作者のアフレコ許可が**現在もON**であること、作品が公開中であることを最終コミット前に再評価。
4. 指定したテイク・タイムライン・出自ラベルが揃っていることを確認。
5. `Dub`を公開へ遷移、閲覧可能なインデックスに追加。
6. 成功後も元の未採用テイクは公開しない。

### 星評価
1. 認証済みユーザーと公開済みの評価対象を確認。
2. 対象種別 `work`/`dub` を区別。
3. DBユニークキー `(userId,targetType,targetId)` で重複を防ぐ。
4. リクエスト重複は同一投票の再送として扱い、集計更新を二重に行わない。
5. 集計方式（少数票の補正を含む）は仕様決定まで保留。架空の順位を表示しない。

## 6. 認可テスト

| 攻撃/失敗ケース | 期待動作 |
|---|---|
| 他人の作品IDを指定してPUT | 403、変更なし、監査記録 |
| 未ログインで下書きURLへアクセス | 401/403、内容は漏れない |
| 作者が許可OFF、演者が以前開いた画面から公開 | 403相当、非公開状態のまま |
| 旧WorkRevisionに音声版を関連付ける | 許された対象版以外は拒否 |
| 公開中に回線切断、再送 | 同一idempotencyKeyで重複しない |
| 5つ星を超える値・自己投票・対象不存在 | バリデーションで拒否 |
| ローカルテイクBlobのURL直打ち | 未認可なら取得不可 |
| 画像内容が宣言MIMEと一致しない | 拒否。拡張子だけで判断しない |

## 7. 公開準備の進め方

1. **Sites実装の棚卸し:** 稼働するソース、認証とデータ保存API、対応フレームワーク、配布方法、運用データの場所を確認する。
2. **状態遷移の導入:** まず既存の正常なコマ送りを回帰テストで守り、保存・公開・録音に状態機械を適用。
3. **UI更新:** ロビー・シアター・制作・収録のデザインを段階的に切替え。ユーザーの投稿データは移行まで維持。
4. **実体化:** ローカルRepositoryをSites Repositoryに置き換える。認証はSitesの実機能、メディアはアクセス制御付き保管へ。
5. **E2E:** A/B/C別アカウントで制作→公開→アフレコ→評価を行う。スマホ・PC双方で再試験。
6. **GitHub同期:** ローカル資産のサンプル以外の秘密・ユーザー投稿をGitに入れない。コミット・PR・差分・テスト結果を残す。
7. **プレビュー→公開:** ステージングで移行・削除・復旧・ロールバックを試す。合格まで既存の一般公開データを置き換えない。

## 8. データ保護の最後の確認

- 本番データベースやユーザー音声・画像をPublic GitHubに同期しない。
- 認証済みかどうかをクライアントの状態フラグだけで決めない。
- サイトのバージョンロールバックと、メタデータ・Blobのバックアップ復元は別物。バックアップ時点・復旧テスト・参照整合性を確認する。
- 公開後の作者によるアフレコ許可取消時に、**既公開アフレコをどう扱うかは未決**。運営規約を勝手に確定しない。
- ライセンスと削除ポリシーについて技術実装だけで法的安全性を保証しない。
