import { Router } from 'express';
import { toJSTISOString } from '../../parser';
import { store } from '../store';
import { getWss } from '../websocket';

const router = Router();

// POST /api/schedule - bulk schedule (the actual Playwright scheduling happens here)
router.post('/', async (req, res) => {
  const posts = store.getAll().filter(p => p.status === 'pending' || p.status === 'failed');
  if (posts.length === 0) {
    return res.json({ message: '予約対象の投稿がありません', summary: { success: 0, failed: 0, skipped: 0 } });
  }

  // Respond immediately, process in background
  res.json({ message: `${posts.length} 件の予約を開始します`, processing: true });

  // The actual scheduling will be triggered by the server/index.ts which has access to SessionManager
  // Broadcast via WebSocket
  const wss = getWss();

  // For now, the scheduling is handled by the server coordinator
  // This route just signals the intent - actual execution is coordinated by server/index.ts
  // using the onScheduleRequest callback
  if ((global as any).__scheduleHandler) {
    (global as any).__scheduleHandler(posts, req.body?.dryRun || false);
  }
});

// POST /api/schedule/:id - retry single post
router.post('/:id', async (req, res) => {
  const post = store.get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  post.status = 'pending';
  post.error = undefined;

  res.json({ message: '再予約をキューに追加しました', post: { ...post, scheduledAt: toJSTISOString(post.scheduledAt) } });

  if ((global as any).__scheduleHandler) {
    (global as any).__scheduleHandler([post], req.body?.dryRun || false);
  }
});

export default router;
