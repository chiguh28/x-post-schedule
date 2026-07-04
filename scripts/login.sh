#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."
echo "[x-post-scheduler] X ログインを開始します..."
echo "  （通常は不要です。server.sh / schedule.sh はセッションが"
echo "  無効な場合に自動でログイン画面を開きます。事前ログインや"
echo "  アカウント切り替えをしたい時にこのスクリプトを使ってください。）"
echo "  Chrome が起動したら X にログインしてください（2FA 対応）。"
echo "  ログイン後、ブラウザを閉じてください。"
echo
node dist/index.js login
