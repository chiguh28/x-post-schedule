#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."
echo "[x-post-scheduler] X ログインを開始します..."
echo "  Chrome が起動したら X にログインしてください（2FA 対応）。"
echo "  ログイン後、ブラウザを閉じてください。"
echo
node dist/index.js login
