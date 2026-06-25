# x-post-scheduler 要件定義書

## 1. プロジェクト概要

### 1.1 目的
ChatGPT や Claude で生成した Markdown 形式の投稿スケジュールを読み込み、X (Twitter) の投稿予約機能を使って一括で予約投稿するツール。

### 1.2 解決する課題
- AI で生成した投稿スケジュールを手作業で1件ずつ X に予約する手間
- 日時・本文・画像を含む複数投稿の一括予約を自動化

### 1.3 ポジショニング
- `@chiguh28/x-share` の SessionManager・画像投稿機能をベースに構築
- x-share が「即時投稿ライブラリ」なのに対し、本ツールは「予約投稿の一括登録 CLI + 簡易 Web UI」

---

## 2. 機能要件

### 2.1 Markdown パーサー

AI が生成する形式のブレに対応するため、以下の3形式をすべてパース可能にする。

#### 形式A: テーブル形式
```markdown
| 日時 | 投稿内容 | 画像URL |
|------|----------|---------|
| 2026-03-27 09:00 | おはようございます！今日も... | https://example.com/img.jpg |
| 2026-03-28 12:00 | ランチタイムに... | |
```

#### 形式B: リスト形式
```markdown
- **2026-03-27 09:00**
  おはようございます！今日も...
  画像: https://example.com/img.jpg

- **2026-03-28 12:00**
  ランチタイムに...
```

#### 形式C: 見出し+本文形式
```markdown
## 2026-03-27 09:00

おはようございます！今日も...

![画像](https://example.com/img.jpg)

## 2026-03-28 12:00

ランチタイムに...
```

#### パース共通仕様
- 日時フォーマット: `YYYY-MM-DD HH:mm` を基本とし、`YYYY/MM/DD`、`MM/DD HH:mm`(年省略 → 当年)にも対応
- 画像URL: `http(s)://` で始まる画像URLを認識。Markdown画像記法 `![alt](url)` にも対応
- 画像は1投稿あたり最大4枚（X の制限に準拠）
- 投稿本文: 日時・画像URL を除いたテキスト部分を投稿本文とする
- 過去日時の投稿はパース時に警告を出し、スキップまたはエラーとする

### 2.2 プレビュー・確認機能

#### CLI プレビュー
- パース結果を一覧表示（番号、日時、本文プレビュー（先頭50文字）、画像有無）
- バリデーション結果を表示:
  - 文字数チェック（140文字超過の警告）
  - 日時の妥当性（過去日時、重複日時）
  - 画像URLの到達可能性（HEAD リクエストで確認）
- 全体を確認後、y/n で一括予約実行

#### Web UI（ローカルサーバー）

`npx x-post-scheduler server` でローカルサーバーを起動し、ブラウザ上で投稿の管理・編集・予約実行を行う。

##### 画面構成

**メイン画面: 投稿一覧**
- Markdown の読み込み: テキストエリアに貼り付け or ファイルドラッグ＆ドロップ → 「読み込み」ボタンでパース
- パース後、投稿をカード形式で一覧表示（時系列順）
- 各カードに表示する情報:
  - 予約日時（編集可能）
  - 投稿本文（編集可能）
  - 文字数カウンター（140文字制限のリアルタイム表示）
  - 添付画像サムネイル（最大4枚）
  - ステータスバッジ（未予約 / 予約中 / 予約完了 / エラー）
- 一覧上部にサマリー: 合計件数、画像付き件数、バリデーションエラー件数

##### 画像管理機能

各投稿カードに画像の追加・管理UIを設ける:

- **画像追加方法（3通り）:**
  1. URL入力: テキストフィールドに画像URLを入力 → サーバー側でダウンロード・保存
  2. ファイルアップロード: ローカル画像ファイルをドラッグ＆ドロップまたはファイル選択
  3. Markdown 由来: パース時に検出した画像URLを自動表示
- **画像プレビュー:** 添付画像をサムネイルで表示（クリックで拡大）
- **画像操作:**
  - 並び替え（ドラッグ＆ドロップ）
  - 個別削除（×ボタン）
- **制約:** 1投稿あたり最大4枚。上限到達時は追加UIを非活性化
- **画像の一時保存:** アップロード/ダウンロードした画像はサーバー側の一時ディレクトリに保存し、予約実行時に使用

##### 予約実行

- 「一括予約実行」ボタンで全投稿を順次予約
- 進捗バー + 各カードのステータスがリアルタイム更新（WebSocket）
- 実行中は編集操作をロック
- 完了後にサマリー表示（成功/失敗/スキップ）
- 失敗した投稿のみ「リトライ」ボタンで再実行可能

### 2.3 予約投稿実行

#### X の予約投稿フロー（Playwright）
1. `https://x.com/compose/post` を開く
2. テキストエリアに本文を入力
3. 画像がある場合は `input[data-testid="fileInput"]` で添付
4. スケジュールアイコン（カレンダーボタン）をクリック
5. 日付・時刻ピッカーで予約日時を設定
6. 「確認する」ボタンで日時確定
7. 「予約設定」ボタンで予約完了
8. 次の投稿へ遷移（1に戻る）

#### 実行仕様
- 投稿間に適切な待機時間を設ける（レート制限対策、デフォルト5秒）
- 各投稿の結果をログ出力（成功/失敗、投稿番号、日時）
- 失敗した投稿はスキップして次へ進む（エラーログに記録）
- 全件完了後にサマリー表示（成功数/失敗数/スキップ数）
- `--dry-run` オプション: compose/post 画面を開いて入力・日時設定まで行うが、最終的な予約ボタンは押さない

### 2.5 Web API エンドポイント

Web UI のバックエンドとして以下の REST API を提供する。

```
POST   /api/parse              Markdown テキストをパースして投稿一覧を返す
GET    /api/posts              現在の投稿一覧を取得
PUT    /api/posts/:id          投稿の編集（本文・日時の変更）
DELETE /api/posts/:id          投稿の削除

POST   /api/posts/:id/images   画像の追加（URL指定 or ファイルアップロード）
DELETE /api/posts/:id/images/:index  画像の削除
PUT    /api/posts/:id/images/order   画像の並び替え

POST   /api/schedule           一括予約実行（WebSocket で進捗通知）
POST   /api/schedule/:id       個別投稿の予約実行（リトライ用）

GET    /api/session/status      セッション状態の確認
```

- 投稿データはサーバーのメモリ上に保持（永続化不要、セッション単位）
- 各投稿には UUID を自動付与し、API の `:id` で参照
- 画像アップロードは `multipart/form-data` で受け付け、一時ディレクトリに保存
- 予約実行の進捗は WebSocket (`ws://localhost:{port}/ws`) でリアルタイム通知:
  - `{ type: "progress", postId, status, current, total }`
  - `{ type: "complete", summary: { success, failed, skipped } }`

### 2.6 セッション管理
- `@chiguh28/x-share` の SessionManager をそのまま利用
- `npx x-post-scheduler login` で X にログイン（x-share の loginInteractive と同等）
- セッションディレクトリは設定ファイルで指定可能

---

## 3. 非機能要件

### 3.1 技術スタック
- **言語:** TypeScript
- **ランタイム:** Node.js
- **ブラウザ自動化:** Playwright（x-share 経由）
- **CLI フレームワーク:** commander
- **Web UI サーバー:** express + ws（WebSocket）
- **Web UI フロントエンド:** バニラ HTML + CSS + JS（バンドラー不要）
- **ファイルアップロード:** multer（express ミドルウェア）
- **依存ライブラリ:** `@chiguh28/x-share`（npm パッケージとして参照）

### 3.2 対応環境
- Windows 10/11（主要ターゲット）
- Chrome インストール済み（x-share の要件を継承）
- Node.js 18+

### 3.3 エラーハンドリング
- ネットワークエラー時のリトライ（最大3回、指数バックオフ）
- セッション切れの検出と再ログイン案内
- 部分的な失敗からの再開機能（完了済み投稿をスキップ）

---

## 4. CLI インターフェース

```
x-post-scheduler <command> [options]

Commands:
  login                       X にログイン（ブラウザが開く）
  schedule <file>             Markdown ファイルから一括予約（CLI のみ）
  server [file]               Web UI サーバーを起動（file 指定時は初期読み込み）

Options (schedule):
  --dry-run                   予約ボタンを押さずにプレビューのみ
  --headless                  ヘッドレスモードで実行
  --delay <ms>                投稿間の待機時間（デフォルト: 5000）
  --config <path>             設定ファイルパス
  --session-dir <path>        セッションディレクトリのパス

Options (server):
  --port <number>             Web UI のポート番号（デフォルト: 3456）
  --config <path>             設定ファイルパス
  --session-dir <path>        セッションディレクトリのパス
```

---

## 5. 設定ファイル

```json
{
  "sessionDir": "./.session",
  "headless": false,
  "delayBetweenPosts": 5000,
  "timezone": "Asia/Tokyo"
}
```

---

## 6. ディレクトリ構成（想定）

```
x-post-scheduler/
├── src/
│   ├── index.ts              # CLI エントリポイント（commander）
│   ├── parser/
│   │   ├── index.ts           # パーサー統合（形式自動判定）
│   │   ├── table-parser.ts    # テーブル形式パーサー
│   │   ├── list-parser.ts     # リスト形式パーサー
│   │   └── heading-parser.ts  # 見出し形式パーサー
│   ├── scheduler/
│   │   ├── index.ts           # 予約実行エンジン
│   │   └── x-calendar.ts     # X の日時ピッカー操作
│   ├── server/
│   │   ├── index.ts           # Express サーバー起動
│   │   ├── routes/
│   │   │   ├── posts.ts       # 投稿 CRUD API
│   │   │   ├── images.ts      # 画像アップロード・管理 API
│   │   │   ├── parse.ts       # Markdown パース API
│   │   │   ├── schedule.ts    # 予約実行 API
│   │   │   └── session.ts     # セッション状態 API
│   │   ├── websocket.ts       # WebSocket（予約進捗通知）
│   │   ├── store.ts           # インメモリ投稿データストア
│   │   └── public/            # 静的ファイル（HTML/CSS/JS）
│   │       ├── index.html     # メイン画面
│   │       ├── style.css
│   │       └── app.js         # フロントエンド JS
│   ├── validator.ts           # バリデーション（文字数、日時、画像）
│   └── types.ts               # 型定義
├── tmp/                       # 画像一時保存ディレクトリ（gitignore）
├── config.example.json
├── package.json
├── tsconfig.json
└── README.md
```

---

## 7. 型定義（主要）

```typescript
interface PostImage {
  /** 画像の識別子（UUID） */
  id: string;
  /** 元のソース（URL or アップロードファイル名） */
  source: string;
  /** サーバー上の一時ファイルパス */
  localPath: string;
  /** サムネイル配信用パス: /api/images/{id} */
  previewUrl: string;
}

interface ScheduledPost {
  /** 投稿の識別子（UUID） */
  id: string;
  /** 予約日時 */
  scheduledAt: Date;
  /** 投稿本文 */
  text: string;
  /** 添付画像（最大4枚） */
  images: PostImage[];
  /** 予約ステータス */
  status: 'pending' | 'scheduling' | 'scheduled' | 'failed';
  /** エラーメッセージ（status が failed の場合） */
  error?: string;
}

interface ParseResult {
  posts: ScheduledPost[];
  warnings: string[];
  errors: string[];
}

interface ScheduleResult {
  post: ScheduledPost;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
}
```

---

## 8. 開発フェーズ

### Phase 1: コア機能（MVP）
1. プロジェクトセットアップ（package.json, tsconfig, commander）
2. Markdown パーサー（3形式対応）
3. CLI プレビュー（一覧表示 + バリデーション）
4. X 予約投稿エンジン（Playwright で日時ピッカー操作）
5. login コマンド

### Phase 2: Web UI
6. Express サーバー + REST API（投稿 CRUD、パース、セッション確認）
7. Web UI メイン画面（Markdown 読み込み → 投稿カード一覧表示）
8. 画像管理機能（URL入力・ファイルアップロード・並び替え・削除）
9. 投稿編集機能（本文・日時のインライン編集、文字数カウンター）
10. WebSocket による予約実行の進捗通知 + リアルタイムステータス更新
11. 失敗投稿のリトライ機能

### Phase 3: 改善・拡張
- `--dry-run` モード
- エラーリトライ・再開機能（CLI）
- 予約済み投稿の一覧取得・キャンセル
- AI（Claude API）による投稿内容の自動生成連携
