#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { SessionManager } from '@chiguh28/x-share';
import { parseMarkdown } from './parser';
import { validatePosts } from './validator';
import { schedulePosts } from './scheduler';
import { startServer } from './server';
import { AppConfig } from './types';

function loadConfig(configPath?: string): AppConfig {
  const cwd = process.cwd();
  const file = configPath || path.join(cwd, 'config.json');

  if (fs.existsSync(file)) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return {
      sessionDir: path.isAbsolute(raw.sessionDir)
        ? raw.sessionDir
        : path.join(cwd, raw.sessionDir),
      headless: raw.headless ?? false,
      delayBetweenPosts: raw.delayBetweenPosts ?? 5000,
      timezone: raw.timezone ?? 'Asia/Tokyo',
    };
  }

  // config.example.json からコピー
  const examplePath = path.join(cwd, 'config.example.json');
  if (fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, path.join(cwd, 'config.json'));
    console.log('[x-post-scheduler] config.example.json から config.json を作成しました。編集してください。');
    return loadConfig(path.join(cwd, 'config.json'));
  }

  // デフォルト設定
  return {
    sessionDir: path.join(cwd, '.session'),
    headless: false,
    delayBetweenPosts: 5000,
    timezone: 'Asia/Tokyo',
  };
}

const program = new Command();

program
  .name('x-post-scheduler')
  .description('Markdown 形式の投稿スケジュールを X の予約投稿に一括登録')
  .version('1.0.0');

// ── login ──
program
  .command('login')
  .description('X にログイン（Chrome が直接起動します）')
  .option('--config <path>', '設定ファイルパス')
  .option('--session-dir <path>', 'セッションディレクトリ')
  .action(async (opts) => {
    const config = loadConfig(opts.config);
    if (opts.sessionDir) config.sessionDir = opts.sessionDir;

    const sm = new SessionManager(config.sessionDir);
    await sm.loginInteractive();
    console.log('[x-post-scheduler] ログイン完了');
  });

// ── server ──
program
  .command('server')
  .description('Web UI サーバーを起動')
  .option('-p, --port <number>', 'ポート番号', '3456')
  .option('--config <path>', '設定ファイルパス')
  .option('--session-dir <path>', 'セッションディレクトリ')
  .action(async (opts) => {
    const config = loadConfig(opts.config);
    if (opts.sessionDir) config.sessionDir = opts.sessionDir;

    await startServer(config, { port: parseInt(opts.port, 10) });
  });

// ── schedule ──
program
  .command('schedule <file>')
  .description('Markdown ファイルから一括予約')
  .option('--dry-run', '予約ボタンを押さずにプレビューのみ')
  .option('--headless', 'ヘッドレスモードで実行')
  .option('--delay <ms>', '投稿間の待機時間 (ms)', '5000')
  .option('--config <path>', '設定ファイルパス')
  .option('--session-dir <path>', 'セッションディレクトリ')
  .action(async (file, opts) => {
    const config = loadConfig(opts.config);
    if (opts.sessionDir) config.sessionDir = opts.sessionDir;
    if (opts.headless) config.headless = true;
    if (opts.delay) config.delayBetweenPosts = parseInt(opts.delay, 10);

    // ファイル読み込み
    const filePath = path.resolve(file);
    if (!fs.existsSync(filePath)) {
      console.error(`[x-post-scheduler] ファイルが見つかりません: ${filePath}`);
      process.exit(1);
    }
    const markdown = fs.readFileSync(filePath, 'utf-8');

    // パース
    console.log('[x-post-scheduler] Markdown をパース中...');
    const result = parseMarkdown(markdown);

    if (result.errors.length > 0) {
      console.error('[x-post-scheduler] パースエラー:');
      result.errors.forEach((e) => console.error(`  - ${e}`));
      process.exit(1);
    }

    if (result.posts.length === 0) {
      console.error('[x-post-scheduler] 投稿が見つかりません');
      process.exit(1);
    }

    // バリデーション
    const validation = validatePosts(result.posts);
    if (validation.warnings.length > 0) {
      console.log('[x-post-scheduler] 警告:');
      validation.warnings.forEach((w) => console.log(`  ⚠ ${w}`));
    }
    if (validation.errors.length > 0) {
      console.error('[x-post-scheduler] バリデーションエラー:');
      validation.errors.forEach((e) => console.error(`  ✗ ${e}`));
      process.exit(1);
    }

    // プレビュー
    console.log(`\n[x-post-scheduler] ${result.posts.length} 件の投稿:`);
    result.posts.forEach((post, i) => {
      const dateStr = post.scheduledAt.toLocaleString('ja-JP', { timeZone: config.timezone });
      const preview = post.text.length > 50 ? post.text.slice(0, 50) + '...' : post.text;
      const imgLabel = post.images.length > 0 ? ` [画像${post.images.length}枚]` : '';
      console.log(`  ${i + 1}. ${dateStr}${imgLabel}`);
      console.log(`     ${preview}`);
    });

    if (result.warnings.length > 0) {
      console.log('\n[x-post-scheduler] パーサー警告:');
      result.warnings.forEach((w) => console.log(`  ⚠ ${w}`));
    }

    // セッション確認
    const sm = new SessionManager(config.sessionDir);
    if (!sm.hasSession()) {
      console.error('\n[x-post-scheduler] セッションがありません。先に login を実行してください。');
      process.exit(1);
    }

    // 実行
    console.log(`\n[x-post-scheduler] 予約${opts.dryRun ? '(ドライラン)' : ''}を開始します...`);
    const browserContext = await sm.createContext({ headless: config.headless });
    try {
      const valid = await sm.isSessionValid(browserContext);
      if (!valid) {
        console.error('[x-post-scheduler] セッション切れ。再ログインしてください。');
        process.exit(1);
      }

      const results = await schedulePosts(browserContext, result.posts, {
        dryRun: opts.dryRun,
        delayBetweenPosts: config.delayBetweenPosts,
        onProgress: (current, total, res) => {
          const status = res.status === 'success' ? '✓' : '✗';
          console.log(`  [${current}/${total}] ${status} ${res.post.scheduledAt.toLocaleString('ja-JP')}`);
          if (res.error) console.log(`     エラー: ${res.error}`);
        },
      });

      const success = results.filter((r) => r.status === 'success').length;
      const failed = results.filter((r) => r.status === 'failed').length;
      console.log(`\n[x-post-scheduler] 完了: ${success}件成功 / ${failed}件失敗`);

      if (failed > 0) process.exit(1);
    } finally {
      await browserContext.close();
    }
  });

program.parse();
