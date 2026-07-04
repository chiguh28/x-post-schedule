import { BrowserContext, Page } from 'playwright';
import { ScheduledPost, ScheduleResult } from '../types';
import { setScheduleDateTime, isScheduleApplied } from './x-calendar';

/**
 * 単一の投稿を予約する
 */
export async function schedulePost(
  context: BrowserContext,
  post: ScheduledPost,
  options?: { dryRun?: boolean }
): Promise<ScheduleResult> {
  const page = await context.newPage();
  try {
    console.log(
      `[x-post-scheduler] 予約開始: ${post.scheduledAt.toLocaleString('ja-JP')}`
    );

    // 1. 投稿作成ページを開く
    await page.goto('https://x.com/compose/post', {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    });
    await page.waitForTimeout(5000);

    // ログインリダイレクトチェック
    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/i/flow/login')) {
      throw new Error('セッション切れ。再ログインしてください。');
    }

    // 2. テキスト入力
    const textArea = await page.waitForSelector(
      '[data-testid="tweetTextarea_0"], [role="textbox"]',
      { timeout: 60000 }
    );
    if (!textArea) throw new Error('テキストエリアが見つかりません');
    await textArea.click();
    await page.waitForTimeout(500);
    await page.keyboard.type(post.text, { delay: 30 });
    await page.waitForTimeout(1000);
    console.log(
      `[x-post-scheduler] テキスト入力完了 (${post.text.length}文字)`
    );

    // 3. 画像添付
    if (post.images.length > 0) {
      const localPaths = post.images
        .map((img) => img.localPath)
        .filter((p) => p && p.length > 0);

      if (localPaths.length > 0) {
        const fileInput = page.locator('input[data-testid="fileInput"]').first();
        await fileInput.setInputFiles(localPaths);
        console.log(`[x-post-scheduler] 画像添付: ${localPaths.length}枚`);
        await page.waitForTimeout(8000);
      }
    }

    // 4. 予約日時を設定
    await setScheduleDateTime(page, post.scheduledAt);

    // 5. 予約が適用されているか検証（未適用なら即時投稿を防ぐため中断）
    if (!(await isScheduleApplied(page))) {
      throw new Error(
        '予約設定が適用されていません。即時投稿を防止するため処理を中断しました。'
      );
    }
    console.log('[x-post-scheduler] 予約設定の適用を確認');

    // 6. 予約ボタンをクリック (ドライランでない場合)
    if (options?.dryRun) {
      console.log('[x-post-scheduler] ドライラン: 予約ボタンは押しません');
      await page.waitForTimeout(2000);
    } else {
      // 予約設定後は tweetButton が複数存在する場合があるため last() で確定ボタンを取得
      const schedulePostBtn = page
        .locator('[data-testid="tweetButton"]')
        .last();
      await schedulePostBtn.waitFor({ state: 'visible', timeout: 20000 });
      await schedulePostBtn.dispatchEvent('click');
      console.log('[x-post-scheduler] 予約投稿ボタンクリック (1回目)...');
      await page.waitForTimeout(2000);

      // ボタンがまだ残っていれば再クリック
      if (await schedulePostBtn.isVisible().catch(() => false)) {
        console.log('[x-post-scheduler] 予約投稿ボタンクリック (2回目)...');
        await schedulePostBtn.dispatchEvent('click');
      }
      await page.waitForTimeout(5000);
    }

    console.log('[x-post-scheduler] 予約完了');
    return { post, status: 'success' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[x-post-scheduler] 予約失敗: ${message}`);
    return { post, status: 'failed', error: message };
  } finally {
    await page.close();
  }
}

/**
 * 複数の投稿を順次予約する
 */
export async function schedulePosts(
  context: BrowserContext,
  posts: ScheduledPost[],
  options?: {
    dryRun?: boolean;
    delayBetweenPosts?: number;
    onProgress?: (
      current: number,
      total: number,
      result: ScheduleResult
    ) => void;
  }
): Promise<ScheduleResult[]> {
  const results: ScheduleResult[] = [];
  const delay = options?.delayBetweenPosts ?? 5000;
  const pendingPosts = posts.filter(
    (p) => p.status === 'pending' || p.status === 'failed'
  );

  console.log(`[x-post-scheduler] ${pendingPosts.length} 件の予約を開始`);

  for (let i = 0; i < pendingPosts.length; i++) {
    const post = pendingPosts[i];
    post.status = 'scheduling';

    const result = await schedulePost(context, post, {
      dryRun: options?.dryRun,
    });

    if (result.status === 'success') {
      post.status = 'scheduled';
      post.error = undefined;
    } else {
      post.status = 'failed';
      post.error = result.error;
    }

    results.push(result);
    options?.onProgress?.(i + 1, pendingPosts.length, result);

    // 最後の投稿以外は待機
    if (i < pendingPosts.length - 1) {
      console.log(`[x-post-scheduler] ${delay}ms 待機...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  const success = results.filter((r) => r.status === 'success').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  console.log(
    `[x-post-scheduler] 完了: ${success}件成功 / ${failed}件失敗`
  );

  return results;
}
