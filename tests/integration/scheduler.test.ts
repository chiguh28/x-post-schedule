import { describe, it, expect, vi } from 'vitest';
import { schedulePosts } from '../../src/scheduler';
import { ScheduledPost } from '../../src/types';

/**
 * 新 UI の予約ダイアログ用セレクト要素モックを作る。
 * labelId に対応するラベルテキストは labelMap 経由で page.locator('#id') が返す。
 */
function makeSelectMock(labelId: string, optionValues: string[]) {
  return {
    getAttribute: vi.fn(async (attr: string) =>
      attr === 'aria-labelledby' ? labelId : null
    ),
    locator: vi.fn(() => ({
      evaluateAll: vi.fn().mockResolvedValue(optionValues),
      allTextContents: vi.fn().mockResolvedValue(optionValues),
    })),
    selectOption: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockPage() {
  // 汎用ロケーター（既定の振る舞い）
  const mockLocator: any = {
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

  // 新 UI の予約日時セレクト（月/日/年/時/分）
  const labelMap: Record<string, string> = {
    SELECTOR_1_LABEL: '月',
    SELECTOR_2_LABEL: '日',
    SELECTOR_3_LABEL: '年',
    SELECTOR_4_LABEL: '時',
    SELECTOR_5_LABEL: '分',
  };
  const selectMocks = [
    makeSelectMock('SELECTOR_1_LABEL', ['1', '12']),
    makeSelectMock('SELECTOR_2_LABEL', ['1', '31']),
    makeSelectMock('SELECTOR_3_LABEL', ['2026', '2028']),
    makeSelectMock('SELECTOR_4_LABEL', ['0', '23']), // 24時間制
    makeSelectMock('SELECTOR_5_LABEL', ['0', '59']),
  ];

  // 確定ボタン / 予約インジケーター / 予約ボタン用のロケーター
  const confirmLocator: any = {
    first: vi.fn().mockReturnThis(),
    isVisible: vi.fn().mockResolvedValue(true),
    count: vi.fn().mockResolvedValue(1),
    getAttribute: vi.fn().mockResolvedValue(null), // aria-disabled=null → 有効
    click: vi.fn().mockResolvedValue(undefined),
  };
  const indicatorLocator = {
    isVisible: vi.fn().mockResolvedValue(true),
    count: vi.fn().mockResolvedValue(1),
  };
  const tweetButtonLocator = {
    last: vi.fn().mockReturnThis(),
    textContent: vi.fn().mockResolvedValue('予約設定'),
    waitFor: vi.fn().mockResolvedValue(undefined),
    dispatchEvent: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    isVisible: vi.fn().mockResolvedValue(false),
  };
  const selectsLocator = {
    all: vi.fn().mockResolvedValue(selectMocks),
    count: vi.fn().mockResolvedValue(selectMocks.length),
    first: vi.fn().mockReturnValue({
      waitFor: vi.fn().mockResolvedValue(undefined),
    }),
  };

  // セレクタ文字列に応じて適切なロケーターを返す
  const locatorRouter = vi.fn((selector: string) => {
    if (typeof selector === 'string') {
      if (selector.includes('select[aria-labelledby]')) return selectsLocator;
      if (selector.includes('scheduledConfirmationPrimaryAction')) return confirmLocator;
      if (selector.includes('scheduledTweetIndicator')) return indicatorLocator;
      if (selector.includes('tweetButton')) return tweetButtonLocator;
      if (selector.startsWith('#')) {
        const id = selector.slice(1);
        return { textContent: vi.fn().mockResolvedValue(labelMap[id] ?? '') };
      }
    }
    return mockLocator;
  });

  const mockPage = {
    goto: vi.fn().mockResolvedValue({ status: () => 200 }),
    url: vi.fn().mockReturnValue('https://x.com/compose/post'),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue({
      click: vi.fn().mockResolvedValue(undefined),
    }),
    locator: locatorRouter,
    keyboard: { type: vi.fn().mockResolvedValue(undefined) },
    close: vi.fn().mockResolvedValue(undefined),
  };

  return { mockPage, mockLocator, tweetButtonLocator, confirmLocator };
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
    const { mockPage, tweetButtonLocator } = createMockPage();
    const ctx = createMockContext(mockPage);
    const posts = [makePost()];

    await schedulePosts(ctx, posts, {
      dryRun: true,
      delayBetweenPosts: 0,
    });

    // ドライラン: 投稿完了として success が返るが、予約ボタンは押さない
    expect(posts[0].status).toBe('scheduled');
    expect(tweetButtonLocator.dispatchEvent).not.toHaveBeenCalled();
    expect(tweetButtonLocator.click).not.toHaveBeenCalled();
  });

  it('予約が適用されていない場合は即時投稿せず failed を返す', async () => {
    const { mockPage, tweetButtonLocator } = createMockPage();
    // 予約インジケーターなし & ボタンテキストが "ポストする"（予約未適用）を再現
    mockPage.locator = vi.fn((selector: string) => {
      const base = createMockPage().mockPage.locator(selector);
      if (typeof selector === 'string' && selector.includes('scheduledTweetIndicator')) {
        return {
          isVisible: vi.fn().mockResolvedValue(false),
          count: vi.fn().mockResolvedValue(0),
        };
      }
      if (typeof selector === 'string' && selector.includes('tweetButton')) {
        return {
          last: vi.fn().mockReturnThis(),
          textContent: vi.fn().mockResolvedValue('ポストする'),
          waitFor: vi.fn().mockResolvedValue(undefined),
          dispatchEvent: tweetButtonLocator.dispatchEvent,
          click: tweetButtonLocator.click,
          isVisible: vi.fn().mockResolvedValue(false),
        };
      }
      return base;
    }) as any;
    const ctx = createMockContext(mockPage);
    const posts = [makePost()];

    const results = await schedulePosts(ctx, posts, { delayBetweenPosts: 0 });

    expect(results[0].status).toBe('failed');
    expect(results[0].error).toContain('即時投稿を防止');
    // 予約ボタンは一切押されない
    expect(tweetButtonLocator.dispatchEvent).not.toHaveBeenCalled();
    expect(tweetButtonLocator.click).not.toHaveBeenCalled();
  });
});
