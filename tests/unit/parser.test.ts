import { describe, it, expect } from 'vitest';
import { parseMarkdown, parseDatetime, extractImageUrls, stripImageLines } from '../../src/parser';

describe('parseDatetime', () => {
  it('YYYY-MM-DD HH:mm を正しくパースする', () => {
    const d = parseDatetime('2026-03-27 09:00');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(2); // 0-indexed
    expect(d!.getDate()).toBe(27);
  });

  it('YYYY/MM/DD HH:mm を正しくパースする', () => {
    const d = parseDatetime('2026/03/27 14:30');
    expect(d).not.toBeNull();
    expect(d!.getDate()).toBe(27);
  });

  it('MM/DD HH:mm (年省略) をパースし当年を補完する', () => {
    const d = parseDatetime('03/27 09:00');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(new Date().getFullYear());
  });

  it('不正な文字列には null を返す', () => {
    expect(parseDatetime('invalid')).toBeNull();
    expect(parseDatetime('')).toBeNull();
  });
});

describe('extractImageUrls', () => {
  it('Markdown 画像記法を検出する', () => {
    const urls = extractImageUrls('![alt](https://example.com/img.jpg)');
    expect(urls).toContain('https://example.com/img.jpg');
  });

  it('画像: ラベルを検出する', () => {
    const urls = extractImageUrls('画像: https://example.com/img.png');
    expect(urls).toContain('https://example.com/img.png');
  });

  it('裸の画像URLを検出する', () => {
    const urls = extractImageUrls('https://example.com/photo.jpg');
    expect(urls).toContain('https://example.com/photo.jpg');
  });

  it('重複URLは除外する', () => {
    const urls = extractImageUrls(
      '![a](https://example.com/img.jpg)\n画像: https://example.com/img.jpg'
    );
    expect(urls.length).toBe(1);
  });
});

describe('stripImageLines', () => {
  it('画像関連の行を除去する', () => {
    const text = '本文\n![alt](https://example.com/img.jpg)\n続き';
    const result = stripImageLines(text);
    expect(result).toBe('本文\n続き');
  });

  it('画像ラベル行を除去する', () => {
    const text = '本文\n画像: https://example.com/img.jpg';
    const result = stripImageLines(text);
    expect(result).toBe('本文');
  });
});

describe('parseMarkdown - テーブル形式', () => {
  it('テーブル形式をパースする', () => {
    const md = `
| 日時 | 投稿内容 | 画像URL |
|------|----------|---------|
| 2026-03-27 09:00 | おはようございます！ | https://example.com/img.jpg |
| 2026-03-28 12:00 | ランチタイムに | |
    `.trim();

    const result = parseMarkdown(md);
    expect(result.errors).toHaveLength(0);
    expect(result.posts).toHaveLength(2);
    expect(result.posts[0].text).toBe('おはようございます！');
    expect(result.posts[0].images).toHaveLength(1);
    expect(result.posts[1].text).toBe('ランチタイムに');
    expect(result.posts[1].images).toHaveLength(0);
  });

  it('英語ヘッダーにも対応する', () => {
    const md = `
| date | text |
|------|------|
| 2026-04-01 10:00 | Hello World |
    `.trim();

    const result = parseMarkdown(md);
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].text).toBe('Hello World');
  });
});

describe('parseMarkdown - リスト形式', () => {
  it('リスト形式をパースする', () => {
    const md = `
- **2026-03-27 09:00**
  おはようございます！
  画像: https://example.com/img.jpg

- **2026-03-28 12:00**
  ランチタイムに
    `.trim();

    const result = parseMarkdown(md);
    expect(result.errors).toHaveLength(0);
    expect(result.posts).toHaveLength(2);
    expect(result.posts[0].text).toBe('おはようございます！');
    expect(result.posts[0].images).toHaveLength(1);
  });

  it('太字なしの日時にも対応する', () => {
    const md = `
- 2026-04-01 10:00 テスト投稿
    `.trim();

    const result = parseMarkdown(md);
    expect(result.posts).toHaveLength(1);
  });
});

describe('parseMarkdown - 見出し形式', () => {
  it('見出し形式をパースする', () => {
    const md = `
## 2026-03-27 09:00

おはようございます！

![画像](https://example.com/img.jpg)

## 2026-03-28 12:00

ランチタイムに
    `.trim();

    const result = parseMarkdown(md);
    expect(result.errors).toHaveLength(0);
    expect(result.posts).toHaveLength(2);
    expect(result.posts[0].text).toBe('おはようございます！');
    expect(result.posts[0].images).toHaveLength(1);
  });
});

describe('parseMarkdown - エラーケース', () => {
  it('認識できない形式ではエラーを返す', () => {
    const result = parseMarkdown('これは単なるテキスト');
    expect(result.posts).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('空文字列ではエラーを返す', () => {
    const result = parseMarkdown('');
    expect(result.posts).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
