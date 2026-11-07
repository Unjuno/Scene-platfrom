# SCENE — 明示的状態機械と競合制御仕様 v1

## 0. 記号と変数表

| 記号・変数 | 意味 | SI単位 | 定義・由来 | 定義域・範囲・前提 | 型 |
|---|---|---|---|---|---|
| `state` | 現在の制御状態 | 1（無次元） | 機械ごとの相互排他的な状態 | その機械の列挙値の一つ | 列挙型（スカラー） |
| `event` | 発生イベント | 1（無次元） | UI操作／非同期処理の確定通知 | 各状態から許可されたイベント | 列挙型（スカラー） |
| `context` | ガード判定に使う付帯情報 | 各要素による | 権限・対象版・音声有無などの読み取り専用スナップショット | 外部イベントから必ず検証し直す | レコード型 |
| `accepted` | 遷移の受理結果 | 1（無次元） | イベントとガードを検証して決定 | `true` / `false` | 真偽値 |
| `revision` | 元作品の固定版 | 1（無次元） | 公開版の増分識別子 | 正の整数 | 整数スカラー |
| `token` | 非同期リクエスト世代 | 1（無次元） | 各actorの操作開始ごとに更新 | 非負整数、同actor内のみ比較 | 整数スカラー |
| `idempotencyKey` | 重複投稿防止の操作識別子 | 1（無次元） | クライアントが一回の意図で発行 | 一意な識別子文字列 | 文字列 |
| `duration` | 音声の長さ | s | 音声ファイルの実測再生時間 | 0以上、固定の作品尺上限なし | 実数スカラー |

物理量としての単位換算はここでは不要。制御状態や許可フラグは無次元である。

## 1. 原則

1. **Actorは一つの現在状態を持つ。** 互いに独立した責務は別actorへ切り出し、巨大な状態直積を作らない。
2. **遷移と副作用を分離する。** 例：`VALIDATE`により状態が`validating`へ移る → 検証処理を呼ぶ → `VALID/INVALID`を送る。
3. **拒否イベントでは状態を変えない。** UIは明確な理由を示し、必要ならイベントを再試行できる。
4. **非同期結果には対象ID＋revision＋tokenを添える。** 古い結果で現在の作品や録音を上書きしない。
5. **画面のガードはUXのため。権限の真のガードはサーバーにある。** 作者・認証・対象版・アフレコ許可は最終公開処理で再検証。
6. **保存成功はトランザクション完了後のみ。** ブラウザのIDB `request.onsuccess` はデータ確定ではない。`transaction.oncomplete`を待つ。

## 2. 協調する状態機械

### 2.1 認証 `auth`

| 現状態 | イベント | 次状態 | 注記 |
|---|---|---|---|
| anonymous | LOGIN | authenticating | OAuth/SSOへ移動 |
| authenticating | SUCCESS / FAILED | authenticated / failed | 成功なら信頼可能なsessionが存在 |
| authenticated | EXPIRED | expired | 保護操作は停止 |
| expired / failed | LOGIN / RETRY | authenticating | 再認証を求める |
| authenticated | LOGOUT | anonymous | ローカル下書きは本人の同意なしに削除しない |

### 2.2 作品 `work` と版

| 現状態 | イベント | 次状態 | ガード |
|---|---|---|---|
| draft | BEGIN_PUBLISH | publishing | 本人・素材検証済・保存済 |
| publishing | SUCCESS | published | DB＋メディア参照の最終commitを確認 |
| publishing | FAILED | draft | 失敗の診断情報を保持 |
| published | HIDE | hidden | 作者/管理者権限 |
| hidden | SHOW | published | 作者/管理者権限 |
| draft/published/hidden | REMOVE | removed | 監査・削除規約に従う |

**版の不変条件:** アフレコが参照する`WorkRevision`は公開時点で不変。作品編集は新しい版を生成し、古い音声の参照先を上書きしない。

### 2.3 制作エディタ `editor`

| 現状態 | イベント | 次状態 | UI結果 |
|---|---|---|---|
| editing | CHANGE | editing | 入力を保持し未保存を表示 |
| editing | VALIDATE | validating | 保存可否の検証を開始 |
| validating | INVALID | editing | エラーメッセージを表示 |
| validating | VALID | saving | 有効な画像・タイトル・コマのスナップショットを確定 |
| saving | SUCCESS | saved | **IndexedDB transaction commit/Sites commit**を確認 |
| saving | FAILED | failed | 入力を保持、再試行を提供 |
| saved/failed | CHANGE | editing | 未保存に戻る |

保存中に追加入力があった場合、**保存開始時のスナップショット**だけを保存する。現画面の追加編集は上書きせず未保存として保持する。試作では`editVersion`で検知。

### 2.4 作品再生 `player`

`idle → loading → ready`。音声版のみ`PLAY → playing → paused → playing`、無音版は`ready`のまま手動の`NEXT/PREVIOUS/JUMP`。末尾で`FINISH → ended`、`RESTART → ready`。

- `PLAY`は音声トラックの存在を要求する。音声なしの「再生」押下で無限ローディングや偽再生を起こさない。
- 画像は`object-fit: contain`を優先し、重要部分を勝手に切り取らない。
- 音声版は選択した版の再生時計と画像切替タイムラインに従う。**録音ファイルそのものは動画として合成しない。**
- 戻す／途中から再開では前の音源を停止し、二重再生を避ける。
- `READY`前の`NEXT`、`CLOSE`後に届く旧ロード結果は無効。

### 2.5 収録 `recorder`

`idle → requesting → ready → recording → stopping → reviewing`。

| 現状態 | イベント | 次状態 | 追加条件 |
|---|---|---|---|
| idle | REQUEST | requesting | ユーザーの明示的操作からマイク許可を求める |
| requesting | GRANTED | ready | streamが生きている |
| requesting | DENIED/FAILED | failed | 理由とブラウザ設定を示す |
| ready | START | recording | MediaRecorder対応形式を実行時判定 |
| recording | STOP | stopping | 連打で複数停止しない |
| stopping | SAVED | reviewing | 音声BlobをローカルIDBにcommit |
| ready/idle/reviewing | IMPORT | reviewing | 利用権・人/AI/混合ラベルを宣言 |
| reviewing | REQUEST/RETAKE | requesting/ready | 新しい収録を開始可能 |
| failed | RETRY | idle | エラー原因解消後に再試行 |

**収録中の画面離脱:** 未保存音声が失われる恐れを通知。ストリーム終了、テイク確定、他の作品への誤保存防止を行う。

**未決:** コマ単位か通し録りかを本番方式に固定してはならない。ローカル試作はコマ単位練習のUIに限定し、仕様決定ではない。練習テイクの採用結果は`workId:sceneId`単位でブラウザ内IndexedDB v2の`selections`へ保持し、他ユーザーへ公開しない。

### 2.6 ファイル操作 `upload`

`idle → checking → optimizing → persisting → complete`、途中失敗なら`failed`、キャンセル可能な段階では`idle`へ復帰。

-画像の種類はJPEG/PNG/WebPのみ。ファイルを選んでから読み込み中に別コマに移っても**選択時のsceneId**へ画像を適用する。
-ローカル試作の画像16MB・音声30MBはブラウザ安全性の暫定制限で、**作品時間制限や本番の投稿仕様ではない**。
-本番ではファイル転送成功とメタデータ登録成功を分離し、両方揃うまで公開状態を作らない。

### 2.7 アフレコ公開 `dub`

`local → validating → uploading → verifying → published`。

- `local → validating`のガード：認証済み、対象作品が公開中、作品のアフレコ許可ON、参照revisionが存在、メディアと権利条件が有効。
- `uploading`が終わっても**まだ公開ではない**。`verifying`で保存オブジェクトのサイズ/参照/権限を最終検証。
- 誰でも他人の作品画像・台本を変更できるわけではない。
- 許可OFF変更後の**既公開**アフレコ版の扱いは、ユーザー規約と仕様の未決事項。新規投稿は禁止。

### 2.8 評価 `rating`

`idle → submitting → committed`、失敗は`failed`。`SUBMIT`には認証が必要。

- 対象は`work`または`dub`を**別々に**保持。
- DBに対象種別・対象ID・投稿者IDで重複防止キー。変更・再送は同一論理投票をupsertする。
- 星1〜5以外の値を拒否。自己投票、停止対象、未公開対象への評価はサーバで拒否。
- ランキング式・しきい値が未決の間は、**架空の順位や数値を作らない**。

### 2.9 モデレーション（本番必須・ローカル未実装）

`reported → triage → investigating → resolved | dismissed`、再審査の`appealed`を想定。削除・差止めの副作用は監査ログを伴う。

## 3. 一見正常でも危険な競合ケース

1. **保存中の追加編集:** 先に開始した保存が後から現在の入力を巻き戻す → `editVersion`を比較し入力を保持。
2. **画像読み込みの遅延:** Scene 1の画像を選んだ後Scene 2へ移動 → `sceneId`指定と`token`照合で混入防止。
3. **画面を離れた後の録音完了:** 古い録音callbackが新しい収録actorへ`SAVED`を送る → 元actorをclosureで保持し、新画面には反映しない。
4. **公開許可OFFとの競合:** ユーザーBがエディタを開いている間にAが許可OFF → 公開APIのトランザクション内で再チェック。
5. **同じ投票の重複送信:** 二重タップ／ネットワーク再送 → uniqueness＋idempotencyKeyで一件に収束。
6. **画像アップロード完了・DB登録失敗:** Blobだけ残る → 非公開ステージングと期限付きGC、公開参照は原子的に確定。
7. **同一作品の後続版:** 作者が画像順を編集 → 既公開アフレコは参照した旧版を再生。
8. **旧操作のエラーが別ページに出る:** UI世代tokenを確認してから表示。ただし保存結果の監査記録は残す。

## 4. 状態機械の観測

本番実装では各transitionへ`actorName`、`from`、`event`、`to`、`accepted`、`reason`、`timestamp`、`resourceId`をログ記録する。ただし台本本文・音声Blob・個人情報をログへ出さない。

**型レベルの強制**は、静的型でdiscriminated unionsを使う実装も候補。本試作は外部ライブラリを導入せず、純粋なJSルール表＋テストで保証範囲を限定している。これだけではモデル検査やサーバ権限検査の代わりにはならない。
