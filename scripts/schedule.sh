#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

if [ $# -eq 0 ]; then
    echo "[x-post-scheduler] Markdown ファイルから一括予約"
    echo "  未ログインでも大丈夫です。予約実行前に自動で Chrome が開き、"
    echo "  ログイン画面が表示されます。"
    echo
    echo "使い方:"
    echo "  ./scripts/schedule.sh スケジュール.md"
    echo "  ./scripts/schedule.sh スケジュール.md --dry-run"
    echo
    exit 0
fi

node dist/index.js schedule "$@"
