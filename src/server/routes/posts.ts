import { Router } from 'express';
import { toJSTISOString } from '../../parser';
import { store } from '../store';

const router = Router();

// GET /api/posts
router.get('/', (req, res) => {
  const posts = store.getAll().map(p => ({
    ...p,
    scheduledAt: toJSTISOString(p.scheduledAt),
  }));
  res.json(posts);
});

// PUT /api/posts/:id
router.put('/:id', (req, res) => {
  const { text, scheduledAt } = req.body;
  const updateData: any = {};
  if (text !== undefined) updateData.text = text;
  if (scheduledAt !== undefined) updateData.scheduledAt = new Date(scheduledAt);

  const post = store.update(req.params.id, updateData);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  res.json({ ...post, scheduledAt: toJSTISOString(post.scheduledAt) });
});

// DELETE /api/posts/:id
router.delete('/:id', (req, res) => {
  const deleted = store.delete(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Post not found' });
  res.json({ success: true });
});

export default router;
