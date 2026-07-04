#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."
echo "[x-post-scheduler] Web UI サーバーを起動します..."
echo "  ブラウザで http://localhost:3456 を開いてください。"
echo "  未ログインの場合はヘッダーの「ログイン」ボタンを押してください。"
echo "  Ctrl+C で停止できます。"
echo
node dist/index.js server "$@"
