#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$SCRIPT_DIR/.."
cd "$ROOT_DIR"

VERSION=$(node -p "require('./package.json').version")
DIST_NAME="x-post-scheduler-v${VERSION}"
DIST_DIR="release/${DIST_NAME}"

echo "[x-post-scheduler] 配布パッケージを作成します (v${VERSION})"
echo

# x-share を先にビルド
echo "[1/5] x-share をビルド中..."
cd ../x-share
npm run build
cd "$ROOT_DIR"

# ビルド
echo "[2/5] x-post-scheduler をビルド中..."
npm run build

# テスト
echo "[3/5] テスト実行中..."
npm test

# 配布ディレクトリ作成
echo "[4/5] パッケージング中..."
rm -rf release/
mkdir -p "$DIST_DIR"

# 必要なファイルをコピー
cp -r dist/ "$DIST_DIR/dist/"
cp -r scripts/ "$DIST_DIR/scripts/"
cp package.json "$DIST_DIR/"
cp config.example.json "$DIST_DIR/"
cp LICENSE "$DIST_DIR/"
cp docs/manual.md "$DIST_DIR/"

# x-share をバンドル（配布先で file:../x-share が使えないため）
mkdir -p "$DIST_DIR/vendor/x-share"
cp -r ../x-share/dist/ "$DIST_DIR/vendor/x-share/dist/"
cp ../x-share/package.json "$DIST_DIR/vendor/x-share/"
cp ../x-share/config.example.json "$DIST_DIR/vendor/x-share/"

# 配布用 package.json: x-share のパスを修正
node -e "
const pkg = require('./release/${DIST_NAME}/package.json');
pkg.dependencies['@chiguh28/x-share'] = 'file:./vendor/x-share';
delete pkg.devDependencies;
delete pkg.bin;
pkg.scripts = { start: 'node dist/index.js server', login: 'node dist/index.js login' };
require('fs').writeFileSync('./release/${DIST_NAME}/package.json', JSON.stringify(pkg, null, 2));
"

# README 生成
cat > "$DIST_DIR/README.md" << 'READMEEOF'
# x-post-scheduler

Markdown 形式の投稿スケジュールを X (Twitter) の予約投稿に一括登録するツール。

## 前提条件

- **Node.js 18以上**: https://nodejs.org/
- **Google Chrome**: インストール済み

## セットアップ

1. **ZIP を展開**
2. **setup.bat をダブルクリック** (Windows) / `./scripts/setup.sh` (Mac/Linux)
3. **config.json を編集**（必要に応じて）
4. **login.bat をダブルクリック** → Chrome が起動するので X にログイン

## 使い方

### Web UI（おすすめ）

**server.bat をダブルクリック** → ブラウザで http://localhost:3456 を開く

Web UI でできること:
- Markdown をペーストして投稿スケジュールを読み込み
- 投稿内容・日時の編集
- 画像の追加・削除・並び替え
- 一括予約実行（リアルタイム進捗表示）
- ドライランで事前確認

### CLI

```
schedule.bat スケジュール.md              # 一括予約
schedule.bat スケジュール.md --dry-run    # ドライラン
schedule.bat スケジュール.md --headless   # ヘッドレスモード
```

### Markdown 形式（3形式対応）

**テーブル形式:**
```markdown
| 日時 | 投稿内容 | 画像URL |
|------|----------|---------|
| 2026-03-27 09:00 | おはようございます！ | https://example.com/img.jpg |
```

**リスト形式:**
```markdown
- **2026-03-27 09:00**
  おはようございます！
  画像: https://example.com/img.jpg
```

**見出し形式:**
```markdown
## 2026-03-27 09:00

おはようございます！

![画像](https://example.com/img.jpg)
```

## 設定 (config.json)

```json
{
  "sessionDir": "./.session",
  "headless": false,
  "delayBetweenPosts": 5000,
  "timezone": "Asia/Tokyo"
}
```

## ライセンス

MIT
READMEEOF

# build-dist.sh は配布に含めない
rm -f "$DIST_DIR/scripts/build-dist.sh"

# zip 作成
echo "[5/5] ZIP 作成中..."
cd release/
if command -v powershell &> /dev/null; then
    powershell -Command "Compress-Archive -Path '${DIST_NAME}' -DestinationPath '${DIST_NAME}.zip' -Force"
elif command -v zip &> /dev/null; then
    zip -r "${DIST_NAME}.zip" "${DIST_NAME}/"
else
    echo "[x-post-scheduler] 警告: zip コマンドが見つかりません。手動で ZIP 化してください。"
    cd "$ROOT_DIR"
    echo "  配布ディレクトリ: release/${DIST_NAME}/"
    exit 0
fi

cd "$ROOT_DIR"
echo
echo "[x-post-scheduler] 配布パッケージ作成完了！"
echo "  ZIP: release/${DIST_NAME}.zip"
echo
echo "利用者への案内:"
echo "  1. ZIP を展開"
echo "  2. setup.bat を実行"
echo "  3. login.bat で X にログイン"
echo "  4. server.bat で Web UI を起動"
