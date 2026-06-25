import { Router } from 'express';

const router = Router();

// GET /api/session/status
router.get('/status', (req, res) => {
  // Session status is injected by server/index.ts
  const status = (global as any).__sessionStatus || { valid: false, message: 'セッション未確認' };
  res.json(status);
});

export default router;
