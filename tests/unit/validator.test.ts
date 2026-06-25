import { describe, it, expect } from 'vitest';
import { validatePosts } from '../../src/validator';
import { ScheduledPost } from '../../src/types';

function makePost(overrides?: Partial<ScheduledPost>): ScheduledPost {
  return {
    id: 'test-id',
    scheduledAt: new Date(Date.now() + 86400000), // 明日
    text: 'テスト投稿',
    images: [],
    status: 'pending',
    ...overrides,
  };
}

describe('validatePosts', () => {
  it('正常な投稿はエラーなし', () => {
    const result = validatePosts([makePost()]);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('140文字超のテキストで警告', () => {
    const longText = 'あ'.repeat(141);
    const result = validatePosts([makePost({ text: longText })]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('140');
  });

  it('URLは10文字としてカウントする', () => {
    // 129文字 + スペース1 + URL(10文字) = 140文字 → 警告なし
    const text = 'あ'.repeat(129) + ' https://example.com/very-long-url';
    const result = validatePosts([makePost({ text })]);
    expect(result.warnings).toHaveLength(0);
  });

  it('過去日時でエラー', () => {
    const pastDate = new Date(Date.now() - 86400000); // 昨日
    const result = validatePosts([makePost({ scheduledAt: pastDate })]);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('過去');
  });

  it('重複日時で警告', () => {
    const date = new Date(Date.now() + 86400000);
    const result = validatePosts([
      makePost({ id: 'a', scheduledAt: date }),
      makePost({ id: 'b', scheduledAt: date }),
    ]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('重複');
  });

  it('空テキストでエラー', () => {
    const result = validatePosts([makePost({ text: '' })]);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('空');
  });

  it('画像5枚以上で警告', () => {
    const images = Array.from({ length: 5 }, (_, i) => ({
      id: `img-${i}`,
      source: 'url',
      localPath: '',
      previewUrl: `https://example.com/img${i}.jpg`,
    }));
    const result = validatePosts([makePost({ images })]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('4');
  });
});
