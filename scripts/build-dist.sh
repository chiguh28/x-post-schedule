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
echo "[1/6] x-share をビルド中..."
cd ../x-share
npm run build
cd "$ROOT_DIR"

# ビルド
echo "[2/6] x-post-scheduler をビルド中..."
npm run build

# テスト
echo "[3/6] テスト実行中..."
npm test

# 配布ディレクトリ作成
echo "[4/6] パッケージング中..."
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

# Mac 用ダブルクリック起動アプリ (.app) を生成
echo "[5/6] Mac 用 .app ランチャーを作成中..."
IS_MAC=0
if [ "$(uname -s)" = "Darwin" ]; then
    IS_MAC=1
    create_mac_app() {
        local app_label="$1"    # 表示名（日本語可、フォルダ名にもなる）
        local app_id="$2"       # CFBundleIdentifier 用の ASCII 識別子
        local script_rel="$3"   # DIST_DIR からの相対パス（例: scripts/server.sh）
        local app_dir="$DIST_DIR/${app_label}.app"
        mkdir -p "$app_dir/Contents/MacOS"

        cat > "$app_dir/Contents/Info.plist" << PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key><string>${app_label}</string>
    <key>CFBundleExecutable</key><string>launcher</string>
    <key>CFBundleIdentifier</key><string>com.chiguh28.x-post-scheduler.${app_id}</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleShortVersionString</key><string>${VERSION}</string>
    <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLISTEOF

        cat > "$app_dir/Contents/MacOS/launcher" << LAUNCHEREOF
#!/bin/bash
DIST_ROOT="\$(cd "\$(dirname "\$0")/../../.." && pwd)"
osascript -e "tell application \\"Terminal\\" to do script \\"cd '\${DIST_ROOT}' && ./${script_rel}\\""
LAUNCHEREOF
        chmod +x "$app_dir/Contents/MacOS/launcher"
    }

    create_mac_app "セットアップ" "setup" "scripts/setup.sh"
    create_mac_app "ログイン" "login" "scripts/login.sh"
    create_mac_app "サーバー起動" "server" "scripts/server.sh"
else
    echo "  (Darwin ではないためスキップ。Windows 配布物は .bat をそのまま使用)"
fi

# README 生成
if [ "$IS_MAC" = "1" ]; then
    SETUP_STEP="**「セットアップ.app」をダブルクリック**（初回は右クリック→「開く」が必要な場合あり）"
    LOGIN_STEP="**「ログイン.app」をダブルクリック** → Chrome が起動するので X にログイン"
    SERVER_STEP="**「サーバー起動.app」をダブルクリック** → ブラウザで http://localhost:3456 を開く"
    SCHEDULE_STEP='./scripts/schedule.sh スケジュール.md'
else
    SETUP_STEP="**setup.bat をダブルクリック**"
    LOGIN_STEP="**login.bat をダブルクリック** → Chrome が起動するので X にログイン"
    SERVER_STEP="**server.bat をダブルクリック** → ブラウザで http://localhost:3456 を開く"
    SCHEDULE_STEP='schedule.bat スケジュール.md'
fi

cat > "$DIST_DIR/README.md" << READMEEOF
# x-post-scheduler

Markdown 形式の投稿スケジュールを X (Twitter) の予約投稿に一括登録するツール。

## 前提条件

- **Node.js 18以上**: https://nodejs.org/
- **Google Chrome**: インストール済み

## セットアップ

1. **ZIP を展開**
2. ${SETUP_STEP}
3. **config.json を編集**（必要に応じて）
4. ${LOGIN_STEP}

## 使い方

### Web UI（おすすめ）

${SERVER_STEP}

Web UI でできること:
- Markdown をペーストして投稿スケジュールを読み込み
- 投稿内容・日時の編集
- 画像の追加・削除・並び替え
- 一括予約実行（リアルタイム進捗表示）
- ドライランで事前確認

### CLI

\`\`\`
${SCHEDULE_STEP}              # 一括予約
${SCHEDULE_STEP} --dry-run    # ドライラン
${SCHEDULE_STEP} --headless   # ヘッドレスモード
\`\`\`
READMEEOF

cat >> "$DIST_DIR/README.md" << 'READMEEOF2'

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
READMEEOF2

# build-dist.sh は配布に含めない
rm -f "$DIST_DIR/scripts/build-dist.sh"

# zip 作成
echo "[6/6] ZIP 作成中..."
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
if [ "$IS_MAC" = "1" ]; then
    echo "  2. 「セットアップ.app」を実行"
    echo "  3. 「ログイン.app」で X にログイン"
    echo "  4. 「サーバー起動.app」で Web UI を起動"
else
    echo "  2. setup.bat を実行"
    echo "  3. login.bat で X にログイン"
    echo "  4. server.bat で Web UI を起動"
fi
