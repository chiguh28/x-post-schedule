import { describe, it, expect, vi } from 'vitest';
import { parseMarkdown } from '../../src/parser';
import { validatePosts } from '../../src/validator';

/**
 * 総合テスト: Markdown入力 → パース → バリデーション → 投稿データ生成
 * の全パイプラインを通して検証する。
 * (Playwright を使う scheduler 部分はモックテスト済みのため、ここではデータパイプラインを検証)
 */
describe('総合テスト: Markdown → パース → バリデーション パイプライン', () => {
  it('テーブル形式: パース→バリデーション→投稿データが正しく生成される', () => {
    const md = `
| 日時 | 投稿内容 | 画像URL |
|------|----------|---------|
| 2026-12-01 09:00 | おはよう！今日も一日頑張ろう #朝活 | https://example.com/morning.jpg |
| 2026-12-01 12:00 | ランチは和食にしました | |
| 2026-12-01 18:00 | 今日の成果まとめ https://blog.example.com/report | https://example.com/result.png |
    `.trim();

    const result = parseMarkdown(md);
    expect(result.errors).toHaveLength(0);
    expect(result.posts).toHaveLength(3);

    // 投稿内容の検証
    expect(result.posts[0].text).toContain('おはよう');
    expect(result.posts[0].images).toHaveLength(1);
    expect(result.posts[1].images).toHaveLength(0);
    expect(result.posts[2].text).toContain('blog.example.com');

    // バリデーション
    const validation = validatePosts(result.posts);
    expect(validation.errors).toHaveLength(0);
  });

  it('リスト形式 + 画像付き: 全パイプライン正常', () => {
    const md = `
- **2026-12-15 10:00**
  新商品のご紹介！
  画像: https://example.com/product.jpg

- **2026-12-15 15:00**
  アフタヌーンティーのお供に
  ![紅茶](https://example.com/tea.png)
    `.trim();

    const result = parseMarkdown(md);
    expect(result.errors).toHaveLength(0);
    expect(result.posts).toHaveLength(2);
    expect(result.posts[0].images).toHaveLength(1);
    expect(result.posts[1].images).toHaveLength(1);
    expect(result.posts[0].text).not.toContain('画像:');
    expect(result.posts[1].text).not.toContain('![');

    const validation = validatePosts(result.posts);
    expect(validation.errors).toHaveLength(0);
  });

  it('見出し形式 + 複数画像: 全パイプライン正常', () => {
    const md = `
## 2026-12-20 09:00

クリスマス特集！おすすめギフト3選

![ギフト1](https://example.com/gift1.jpg)
![ギフト2](https://example.com/gift2.jpg)
![ギフト3](https://example.com/gift3.jpg)

## 2026-12-20 18:00

夜のイルミネーション情報

![イルミ](https://example.com/illumination.jpg)
    `.trim();

    const result = parseMarkdown(md);
    expect(result.errors).toHaveLength(0);
    expect(result.posts).toHaveLength(2);
    expect(result.posts[0].images).toHaveLength(3);
    expect(result.posts[0].text).toContain('クリスマス特集');
    expect(result.posts[0].text).not.toContain('![');
    expect(result.posts[1].images).toHaveLength(1);

    const validation = validatePosts(result.posts);
    expect(validation.errors).toHaveLength(0);
  });

  it('140文字超の投稿に対してバリデーション警告が出る', () => {
    const longText = 'あ'.repeat(150);
    const md = `
| 日時 | 投稿内容 |
|------|----------|
| 2026-12-01 09:00 | ${longText} |
    `.trim();

    const result = parseMarkdown(md);
    expect(result.posts).toHaveLength(1);

    const validation = validatePosts(result.posts);
    expect(validation.warnings.length).toBeGreaterThan(0);
    expect(validation.warnings[0]).toContain('140');
  });

  it('画像5枚以上の投稿にバリデーション警告が出る', () => {
    const md = `
## 2026-12-01 09:00

テスト投稿

![a](https://example.com/1.jpg)
![b](https://example.com/2.jpg)
![c](https://example.com/3.jpg)
![d](https://example.com/4.jpg)
![e](https://example.com/5.jpg)
    `.trim();

    const result = parseMarkdown(md);
    expect(result.posts).toHaveLength(1);
    // buildPost 側で4枚に切り詰めるので images は4枚
    expect(result.posts[0].images).toHaveLength(4);
    // パーサー警告に画像超過が含まれる
    expect(result.warnings.some((w) => w.includes('maximum'))).toBe(true);
  });

  it('混合コンテンツ: URL含むテキスト + 画像 が正しく処理される', () => {
    const md = `
| 日時 | 投稿内容 | 画像 |
|------|----------|------|
| 2026-12-01 09:00 | 詳しくはこちら https://blog.example.com/article | https://example.com/thumb.jpg |
    `.trim();

    const result = parseMarkdown(md);
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].text).toContain('https://blog.example.com/article');
    expect(result.posts[0].images).toHaveLength(1);

    // URL は10文字カウントなのでバリデーション通過するはず
    const validation = validatePosts(result.posts);
    expect(validation.errors).toHaveLength(0);
  });
});
