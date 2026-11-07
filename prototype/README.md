# SCENE — 明示的状態機械を備えたゲーム型Web UI試作

**位置づけ:** 2026-11-06版のローカル機能試作です。公開中のChatGPT Sites本体ではありません。

## 起動

Node.js 20以降で単体テストが動作します。実行時のアプリ本体はビルド工程・npm依存なしで提供しています。

```bash
cd prototype
npm run check
npm test
python3 -m http.server 8000
```

`http://localhost:8000` をブラウザで開きます。マイク録音はHTTPSまたはlocalhost上でのみ可能です。

## 対応していること

- ロビー、作品探索、シアター、制作、出演対象、録音練習、ライブラリ
- 静止画の手動コマ送り（動画/GIFは対象外）
- 1コマ内に複数の台詞・ナレーション
- 下書きの画像入力とWebPへのローカル最適化
- IndexedDBへの下書き保存・再読込後の復元
- 録音テイクのローカル保持、再生、音声ファイル取り込み、**コマ別の採用テイク選択（IndexedDBに保存）**、ダウンロード
- 音声の人間/外部AI/混合ラベル
- デスクトップサイドバー、スマホ下部ナビ、キーボード操作、動きの抑制
- `auth/player/editor/recorder/upload/rating/work/dub` の明示的FSM

## 意図的に未実装

- ChatGPT Sitesへのデプロイと既存サイトの差し替え
- 本物のChatGPTログイン、サーバー認証、作者権限確認
- 画像・作品・アフレコの他ユーザー向け公開
- 星評価・ランキングの実DB集計
- 権利侵害の通報・法務オペレーション
- クラウド共有、異なる端末間の同期

**保存先の注意:** 現在の「下書き保存」はIndexedDBのローカルデータです。ユーザー投稿をGitHubに置かず、ブラウザデータ削除で消える可能性を表示します。`JSON書き出し`は台本・構造だけで画像Blobを含みません。

## ディレクトリ

- `index.html` — 意味を持つHTMLの外枠とPC・スマホナビ
- `styles.css` — 視覚トークン、画面、レスポンシブ、キーボード焦点
- `app.mjs` — UIイベント・アクター・副作用の薄い統合層
- `src/machines.mjs` — 状態機械定義と純粋な遷移
- `src/domain.mjs` — 作品・シーン・台詞・バリデーション
- `src/storage.mjs` — ローカル保存アダプタ
- `assets/` — 権利処理済の以前のSCENE試作SVGを再利用
- `tests/` — Node単体テストとブラウザ試験用スクリプト

## 起動に必要な環境

- 近年のChromium/Firefox/Safari、ES Modules、IndexedDB、Canvas 2D。
- IndexedDBがない環境では保存できず、UIで失敗を告知します。
- 収録は `MediaRecorder` と `navigator.mediaDevices.getUserMedia` が必要です。
- ブラウザの録音MIMEを実行時に判定して使用します。

## テスト

`npm test` で15件の状態機械・ドメイン／疑似DOMテストが通っています。`tests/browser_smoke.py` はPlaywright+ChromiumのHTTPサイト実操作テストですが、今回のコンテナでページ遷移が管理ポリシーによりブロックされたため**PASS扱いではありません**。一方、`python scripts/build_standalone.py` → `python prototype/tests/offline_visual_smoke.py` では、不透明なoriginでHTMLを`set_content`してPC/スマホ幅の画面・コマ送り・制作UIをチェックし、**39件成功**しました。この方式ではIndexedDB、マイク、本番認証・公開は検証できません。実装先で実ブラウザE2Eを再実行してください。

## Sitesへ移植する場合

`../docs/SITES-INTEGRATION.md`を参照。**Sitesの稼働コードとAPIを先に検証**し、ローカルRepositoryを本番Repositoryへ置き換えます。初期状態でユーザーの既存データを破壊する置き換えはしてはいけません。
