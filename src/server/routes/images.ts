import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../store';
import { toJSTISOString } from '../../parser';
import { PostImage } from '../../types';

const TMP_DIR = path.join(process.cwd(), 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const upload = multer({ dest: TMP_DIR });
const router = Router();

// POST /api/posts/:id/images - upload file or add by URL
router.post('/:id/images', upload.single('image'), async (req, res) => {
  const post = store.get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.images.length >= 4) return res.status(400).json({ error: '画像は最大4枚です' });

  let image: PostImage;

  if (req.file) {
    // File upload
    const ext = path.extname(req.file.originalname) || '.jpg';
    const newName = `${uuidv4()}${ext}`;
    const newPath = path.join(TMP_DIR, newName);
    fs.renameSync(req.file.path, newPath);
    image = {
      id: uuidv4(),
      source: req.file.originalname,
      localPath: newPath,
      previewUrl: `/api/images/${newName}`,
    };
  } else if (req.body.url) {
    // URL download
    try {
      const downloaded = await downloadImage(req.body.url);
      image = {
        id: uuidv4(),
        source: req.body.url,
        localPath: downloaded.path,
        previewUrl: `/api/images/${path.basename(downloaded.path)}`,
      };
    } catch (err) {
      return res.status(400).json({ error: `画像ダウンロード失敗: ${err}` });
    }
  } else {
    return res.status(400).json({ error: 'image file or url is required' });
  }

  const updated = store.addImage(req.params.id, image);
  if (!updated) return res.status(400).json({ error: '画像の追加に失敗しました' });
  res.json({ ...updated, scheduledAt: toJSTISOString(updated.scheduledAt) });
});

// DELETE /api/posts/:id/images/:index
router.delete('/:id/images/:index', (req, res) => {
  const index = parseInt(req.params.index);
  const post = store.get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  // Delete the file if it exists in tmp
  if (post.images[index]?.localPath) {
    try { fs.unlinkSync(post.images[index].localPath); } catch {}
  }

  const updated = store.removeImage(req.params.id, index);
  if (!updated) return res.status(400).json({ error: '画像の削除に失敗しました' });
  res.json({ ...updated, scheduledAt: toJSTISOString(updated.scheduledAt) });
});

// PUT /api/posts/:id/images/order
router.put('/:id/images/order', (req, res) => {
  const { order } = req.body; // array of indices
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' });
  const updated = store.reorderImages(req.params.id, order);
  if (!updated) return res.status(404).json({ error: 'Post not found' });
  res.json({ ...updated, scheduledAt: toJSTISOString(updated.scheduledAt) });
});

// Helper: download image from URL to tmp directory
function downloadImage(url: string): Promise<{ path: string }> {
  return new Promise((resolve, reject) => {
    const ext = path.extname(new URL(url).pathname) || '.jpg';
    const fileName = `${uuidv4()}${ext}`;
    const filePath = path.join(TMP_DIR, fileName);
    const file = fs.createWriteStream(filePath);
    const client = url.startsWith('https') ? https : http;

    client.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(filePath);
        resolve(downloadImage(res.headers.location));
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        file.close();
        fs.unlinkSync(filePath);
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve({ path: filePath }); });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      reject(err);
    });
  });
}

export default router;
