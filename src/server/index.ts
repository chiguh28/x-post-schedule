import express from 'express';
import path from 'path';
import { createServer } from 'http';
import { SessionManager } from '@chiguh28/x-share';
import { setupWebSocket, broadcast } from './websocket';
import { store } from './store';
import { schedulePosts } from '../scheduler';
import { AppConfig } from '../types';
import parseRouter from './routes/parse';
import postsRouter from './routes/posts';
import imagesRouter from './routes/images';
import scheduleRouter from './routes/schedule';
import sessionRouter from './routes/session';

export async function startServer(config: AppConfig, options: { port: number }): Promise<void> {
  const app = express();
  const server = createServer(app);

  // WebSocket
  setupWebSocket(server);

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Serve uploaded images from tmp/
  const tmpDir = path.join(process.cwd(), 'tmp');
  app.use('/api/images', express.static(tmpDir));

  // Static files (Web UI)
  app.use(express.static(path.join(__dirname, 'public')));

  // API routes
  app.use('/api/parse', parseRouter);
  app.use('/api/posts', postsRouter);
  app.use('/api/posts', imagesRouter);
  app.use('/api/schedule', scheduleRouter);
  app.use('/api/session', sessionRouter);

  // Session manager
  const sessionManager = new SessionManager(config.sessionDir);
  let loginInProgress = false;

  // Check session status
  const updateSessionStatus = async () => {
    if (!sessionManager.hasSession()) {
      (global as any).__sessionStatus = { valid: false, message: 'セッションがありません。「ログイン」を押してください。' };
      return;
    }
    try {
      const ctx = await sessionManager.createContext({ headless: true });
      const valid = await sessionManager.isSessionValid(ctx);
      await ctx.close();
      (global as any).__sessionStatus = valid
        ? { valid: true, message: 'セッション有効' }
        : { valid: false, message: 'セッション切れ。再ログインしてください。' };
    } catch {
      (global as any).__sessionStatus = { valid: false, message: 'セッション確認に失敗しました' };
    }
  };

  // Web UI からのログイントリガー（素の Chrome を起動し、ユーザーがブラウザを閉じるまで待つ）
  (global as any).__triggerLogin = async (): Promise<{ started: boolean; message: string }> => {
    if (loginInProgress) {
      return { started: false, message: '既にログイン処理中です。ブラウザを確認してください。' };
    }
    loginInProgress = true;
    broadcast({ type: 'session', valid: false, message: 'ログイン画面を開いています...' });

    // ブラウザが閉じるまで待つ処理はバックグラウンドで進め、即座にレスポンスを返す
    (async () => {
      try {
        await sessionManager.loginInteractive();
      } catch (err) {
        broadcast({ type: 'session', valid: false, message: `ログインに失敗しました: ${String(err)}` });
        loginInProgress = false;
        return;
      }
      await updateSessionStatus();
      loginInProgress = false;
      broadcast({ type: 'session', ...(global as any).__sessionStatus });
    })();

    return { started: true, message: 'ブラウザが開きます。X にログインしてブラウザを閉じてください。' };
  };

  // Schedule handler
  (global as any).__scheduleHandler = async (posts: any[], dryRun: boolean) => {
    if (!sessionManager.hasSession()) {
      broadcast({ type: 'error', message: 'セッションがありません' });
      return;
    }

    const headless = config.headless;
    const browserContext = await sessionManager.createContext({ headless });

    try {
      await schedulePosts(browserContext, posts, {
        dryRun,
        delayBetweenPosts: config.delayBetweenPosts,
        onProgress: (current, total, result) => {
          broadcast({
            type: 'progress',
            postId: result.post.id,
            status: result.status,
            current,
            total,
            error: result.error,
          });
        },
      });

      const allPosts = store.getAll();
      const success = allPosts.filter(p => p.status === 'scheduled').length;
      const failed = allPosts.filter(p => p.status === 'failed').length;
      broadcast({
        type: 'complete',
        summary: { success, failed, skipped: 0 },
      });
    } catch (err) {
      broadcast({ type: 'error', message: String(err) });
    } finally {
      await browserContext.close();
    }
  };

  // Start server
  server.listen(options.port, () => {
    console.log(`[x-post-scheduler] Web UI: http://localhost:${options.port}`);
    console.log('[x-post-scheduler] Ctrl+C で停止');
  });

  // Check session on startup (don't await to not block server start)
  updateSessionStatus().catch(() => {});
}
