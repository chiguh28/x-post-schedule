#!/bin/bash
set -e

echo "[x-post-scheduler] セットアップを開始します..."
echo

if ! command -v node &> /dev/null; then
    echo "[x-post-scheduler] エラー: Node.js がインストールされていません。"
    echo "  https://nodejs.org/ からインストールしてください。"
    exit 1
fi

echo "[x-post-scheduler] Node.js バージョン: $(node --version)"
echo

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "[x-post-scheduler] 依存パッケージをインストール中..."
npm install --production

echo
if [ ! -f config.json ]; then
    cp config.example.json config.json
    echo "[x-post-scheduler] config.example.json から config.json を作成しました。"
    echo "  config.json を編集してください。"
else
    echo "[x-post-scheduler] config.json は既に存在します。"
fi

echo
echo "[x-post-scheduler] セットアップ完了！"
echo
echo "次のステップ:"
echo "  1. config.json を編集（必要に応じて）"
echo "  2. ./scripts/login.sh を実行して X にログイン"
echo "  3. ./scripts/server.sh で Web UI を起動"
