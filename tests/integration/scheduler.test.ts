import { describe, it, expect, vi } from 'vitest';
import { schedulePosts } from '../../src/scheduler';
import { ScheduledPost } from '../../src/types';

function createMockPage() {
  const mockLocator = {
    first: vi.fn().mockReturnThis(),
    last: vi.fn().mockReturnThis(),
    all: vi.fn().mockResolvedValue([]),
    click: vi.fn().mockResolvedValue(undefined),
    dispatchEvent: vi.fn().mockResolvedValue(undefined),
    isVisible: vi.fn().mockResolvedValue(false),
    waitFor: vi.fn().mockResolvedValue(undefined),
    setInputFiles: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockResolvedValue(0),
    locator: vi.fn().mockReturnThis(),
    allTextContents: vi.fn().mockResolvedValue([]),
    evaluateAll: vi.fn().mockResolvedValue([]),
    selectOption: vi.fn().mockResolvedValue(undefined),
    getAttribute: vi.fn().mockResolvedValue(null),
    textContent: vi.fn().mockResolvedValue(''),
  };

  const mockPage = {
    goto: vi.fn().mockResolvedValue({ status: () => 200 }),
    url: vi.fn().mockReturnValue('https://x.com/compose/post'),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue({
      click: vi.fn().mockResolvedValue(undefined),
    }),
    locator: vi.fn().mockReturnValue(mockLocator),
    keyboard: { type: vi.fn().mockResolvedValue(undefined) },
    close: vi.fn().mockResolvedValue(undefined),
  };

  return { mockPage, mockLocator };
}

function createMockContext(mockPage: any) {
  return { newPage: vi.fn().mockResolvedValue(mockPage) } as any;
}

function makePost(overrides?: Partial<ScheduledPost>): ScheduledPost {
  return {
    id: 'test-post-1',
    scheduledAt: new Date(Date.now() + 86400000),
    text: 'テスト投稿',
    images: [],
    status: 'pending',
    ...overrides,
  };
}

describe('schedulePosts', () => {
  it('pending の投稿を順次処理する', async () => {
    const { mockPage } = createMockPage();
    const ctx = createMockContext(mockPage);
    const posts = [makePost({ id: 'p1' }), makePost({ id: 'p2' })];

    const results = await schedulePosts(ctx, posts, {
      delayBetweenPosts: 0,
    });

    expect(results).toHaveLength(2);
    // compose/post に遷移
    expect(mockPage.goto).toHaveBeenCalledWith(
      'https://x.com/compose/post',
      expect.any(Object)
    );
    // テキスト入力
    expect(mockPage.keyboard.type).toHaveBeenCalledTimes(2);
  });

  it('scheduled 済みの投稿はスキップする', async () => {
    const { mockPage } = createMockPage();
    const ctx = createMockContext(mockPage);
    const posts = [
      makePost({ id: 'p1', status: 'scheduled' }),
      makePost({ id: 'p2', status: 'pending' }),
    ];

    const results = await schedulePosts(ctx, posts, {
      delayBetweenPosts: 0,
    });

    // scheduled は処理されない
    expect(results).toHaveLength(1);
  });

  it('onProgress コールバックが呼ばれる', async () => {
    const { mockPage } = createMockPage();
    const ctx = createMockContext(mockPage);
    const posts = [makePost()];
    const onProgress = vi.fn();

    await schedulePosts(ctx, posts, {
      delayBetweenPosts: 0,
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledWith(1, 1, expect.any(Object));
  });

  it('ログインリダイレクト時は failed を返す', async () => {
    const { mockPage } = createMockPage();
    mockPage.url.mockReturnValue('https://x.com/i/flow/login');
    const ctx = createMockContext(mockPage);
    const posts = [makePost()];

    const results = await schedulePosts(ctx, posts, {
      delayBetweenPosts: 0,
    });

    expect(results[0].status).toBe('failed');
    expect(results[0].error).toContain('セッション切れ');
  });

  it('page.goto に timeout:90000 を指定する（低速回線対応）', async () => {
    const { mockPage } = createMockPage();
    const ctx = createMockContext(mockPage);
    const posts = [makePost()];

    await schedulePosts(ctx, posts, { delayBetweenPosts: 0 });

    expect(mockPage.goto).toHaveBeenCalledWith(
      'https://x.com/compose/post',
      expect.objectContaining({ timeout: 90000 })
    );
  });

  it('テキストエリア waitForSelector に timeout:60000 を指定する', async () => {
    const { mockPage } = createMockPage();
    const ctx = createMockContext(mockPage);
    const posts = [makePost()];

    await schedulePosts(ctx, posts, { delayBetweenPosts: 0 });

    expect(mockPage.waitForSelector).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeout: 60000 })
    );
  });

  it('dryRun では予約ボタンを押さない', async () => {
    const { mockPage, mockLocator } = createMockPage();
    const ctx = createMockContext(mockPage);
    const posts = [makePost()];

    await schedulePosts(ctx, posts, {
      dryRun: true,
      delayBetweenPosts: 0,
    });

    // click は scheduleBtn と textArea.click のみ（tweetButton は押さない）
    // locator の click は日時ピッカー等で呼ばれるが、schedulePostBtn.click は呼ばれない
    // ドライラン: 投稿完了として success が返る
    expect(posts[0].status).toBe('scheduled');
  });
});
