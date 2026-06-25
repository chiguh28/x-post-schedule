# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build   # tsc + copy src/server/public/ → dist/server/public/
npm test        # vitest run (all tests)
npm run dist    # build distributable package via scripts/build-dist.sh

# Run a single test file
npx vitest run tests/unit/parser.test.ts

# CLI usage after build
node dist/index.js login
node dist/index.js server --port 3456
node dist/index.js schedule posts.md --dry-run
```

## Architecture

This is a TypeScript CLI + Web UI tool that schedules X (Twitter) posts from Markdown files using Playwright browser automation.

**Entry point:** `src/index.ts` — Commander CLI with three subcommands: `login`, `server`, `schedule`.

**Key dependency:** `@chiguh28/x-share` (local sibling package at `../x-share`) provides `SessionManager` for Playwright session persistence and browser context creation.

**Data flow for `schedule` command:**
```
Markdown file → parseMarkdown() → validatePosts() → schedulePosts() → Playwright automation on x.com
```

**Parser** (`src/parser/`): `parseMarkdown()` tries three formats in order — table → list → heading. Each sub-parser (`table-parser`, `list-parser`, `heading-parser`) returns `null` if the format doesn't match, allowing fallthrough. Datetimes are always interpreted as `Asia/Tokyo`. Images are extracted from Markdown syntax, `画像:` labels, or bare image URLs (max 4 per post).

**Scheduler** (`src/scheduler/`): `schedulePost()` drives Playwright on `https://x.com/compose/post` — types text, attaches images via file input, calls `setScheduleDateTime()` from `x-calendar.ts` to interact with X's date/time picker UI, then clicks the schedule button. Posts run sequentially with a configurable delay.

**Server** (`src/server/`): Express + HTTP server with WebSocket (`ws` package). The in-memory `store` (singleton `PostStore` in `store.ts`) holds `ScheduledPost` objects for the session. Progress updates are pushed to the browser via `broadcast()` in `websocket.ts`. Routes are split by concern: `parse`, `posts`, `images`, `schedule`, `session`. The schedule execution handler is attached to `global.__scheduleHandler`.

**Config** (`config.json`): Auto-created from `config.example.json` on first run. Fields: `sessionDir`, `headless`, `delayBetweenPosts` (ms), `timezone`.

**Session**: Playwright browser state is persisted in `sessionDir` (default `.session/`). Must run `login` before `schedule` or `server`.

## Markdown formats supported

- **Table**: `| 日時 | 本文 |` with optional image column
- **List**: `- YYYY/MM/DD HH:MM\n  text...`
- **Heading**: `## YYYY/MM/DD HH:MM\ntext...`
