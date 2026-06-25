import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { createServer, Server } from 'http';
import path from 'path';

// ルーターのみをテストする（サーバー全体の起動ではなく）
import parseRouter from '../../src/server/routes/parse';
import postsRouter from '../../src/server/routes/posts';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/parse', parseRouter);
  app.use('/api/posts', postsRouter);
  return app;
}

describe('Server API - Parse', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = createTestApp();
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    baseUrl = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('POST /api/parse でテーブル形式のMarkdownをパースする', async () => {
    const markdown = `
| 日時 | 投稿内容 |
|------|----------|
| 2026-12-01 09:00 | テスト投稿1 |
| 2026-12-02 12:00 | テスト投稿2 |
    `.trim();

    const res = await fetch(`${baseUrl}/api/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.posts).toHaveLength(2);
    expect(data.posts[0].text).toBe('テスト投稿1');
    expect(data.posts[1].text).toBe('テスト投稿2');
  });

  it('POST /api/parse で不正な形式はエラーを返す', async () => {
    const res = await fetch(`${baseUrl}/api/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: 'ただのテキスト' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.posts).toHaveLength(0);
    expect(data.errors.length).toBeGreaterThan(0);
  });

  it('GET /api/posts でパース後の投稿一覧を取得する', async () => {
    // まずパース
    await fetch(`${baseUrl}/api/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        markdown: '| 日時 | 投稿内容 |\n|------|----------|\n| 2026-12-01 09:00 | API取得テスト |',
      }),
    });

    const res = await fetch(`${baseUrl}/api/posts`);
    expect(res.status).toBe(200);
    const data = await res.json();
    // GET /api/posts は配列を直接返す
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].text).toBe('API取得テスト');
  });

  it('PUT /api/posts/:id で投稿を編集できる', async () => {
    // パース
    const parseRes = await fetch(`${baseUrl}/api/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        markdown: '| 日時 | 投稿内容 |\n|------|----------|\n| 2026-12-01 09:00 | 編集前 |',
      }),
    });
    const parseData = await parseRes.json();
    const postId = parseData.posts[0].id;

    // 編集
    const res = await fetch(`${baseUrl}/api/posts/${postId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '編集後' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    // PUT は直接 post オブジェクトを返す
    expect(data.text).toBe('編集後');
  });

  it('DELETE /api/posts/:id で投稿を削除できる', async () => {
    // パース
    const parseRes = await fetch(`${baseUrl}/api/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        markdown: '| 日時 | 投稿内容 |\n|------|----------|\n| 2026-12-01 09:00 | 削除テスト |',
      }),
    });
    const parseData = await parseRes.json();
    const postId = parseData.posts[0].id;

    // 削除
    const res = await fetch(`${baseUrl}/api/posts/${postId}`, {
      method: 'DELETE',
    });

    expect(res.status).toBe(200);

    // 確認
    const listRes = await fetch(`${baseUrl}/api/posts`);
    const listData = await listRes.json();
    expect(listData.find((p: any) => p.id === postId)).toBeUndefined();
  });
});
