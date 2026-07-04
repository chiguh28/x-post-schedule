import { Router } from 'express';

const router = Router();

// GET /api/session/status
router.get('/status', (req, res) => {
  // Session status is injected by server/index.ts
  const status = (global as any).__sessionStatus || { valid: false, message: 'セッション未確認' };
  res.json(status);
});

// POST /api/session/login - Chrome を起動してログインフローを開始する（server/index.ts の __triggerLogin に委譲）
router.post('/login', async (req, res) => {
  const trigger = (global as any).__triggerLogin;
  if (!trigger) {
    res.status(500).json({ started: false, message: 'ログイン機能が初期化されていません' });
    return;
  }
  const result = await trigger();
  res.json(result);
});

export default router;
