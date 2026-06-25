import { Router } from 'express';
import { parseMarkdown, toJSTISOString } from '../../parser';
import { store } from '../store';

const router = Router();

router.post('/', (req, res) => {
  const { markdown } = req.body;
  if (!markdown || typeof markdown !== 'string') {
    return res.status(400).json({ error: 'markdown field is required' });
  }
  const result = parseMarkdown(markdown);
  store.clear();
  store.addMany(result.posts);
  res.json({
    posts: store.getAll().map(p => ({ ...p, scheduledAt: toJSTISOString(p.scheduledAt) })),
    warnings: result.warnings,
    errors: result.errors,
  });
});

export default router;
