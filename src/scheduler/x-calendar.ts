import { Page } from 'playwright';

/**
 * X の予約投稿の日時ピッカーを操作して日時を設定する
 *
 * Flow:
 * 1. スケジュールアイコンボタン (カレンダーアイコン) をクリック
 * 2. 日時ピッカーダイアログの表示を待つ
 * 3. セレクト要素で月・日・年・時・分・AM/PM を設定
 * 4. 確認ボタンをクリック
 */
export async function setScheduleDateTime(page: Page, date: Date): Promise<void> {
  console.log(`[x-post-scheduler] 予約日時を設定: ${date.toLocaleString('ja-JP')}`);

  // スケジュールボタンをクリック
  const scheduleBtn = page
    .locator('[data-testid="scheduleOption"], [aria-label="Schedule post"], [aria-label="Schedule"], [aria-label="予約投稿"]')
    .first();
  await scheduleBtn.waitFor({ state: 'visible', timeout: 30000 });
  await scheduleBtn.dispatchEvent('click');
  await page.waitForTimeout(2000);

  // ダイアログが開いていなければ force click でリトライ（Confirm ボタンの存在で判定）
  const confirmBtn = page.locator('[data-testid="scheduledConfirmationPrimaryAction"]');
  if (!(await confirmBtn.isVisible().catch(() => false))) {
    console.log('[x-post-scheduler] ダイアログ未表示、force click でリトライ');
    await scheduleBtn.click({ force: true });
    await page.waitForTimeout(2000);
  }

  // 日時コンポーネントを Asia/Tokyo タイムゾーンで取得
  const fmt = (opt: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', ...opt }).format(date);
  const month = parseInt(fmt({ month: 'numeric' }), 10);
  const day = parseInt(fmt({ day: 'numeric' }), 10);
  const year = parseInt(fmt({ year: 'numeric' }), 10);
  const hours24 = parseInt(fmt({ hour: 'numeric', hour12: false }), 10);
  const hours12 = hours24 % 12 || 12;
  const minutes = parseInt(fmt({ minute: 'numeric' }), 10);
  const ampm = hours24 < 12 ? 'AM' : 'PM';

  // aria-labelledby を持つセレクト要素をすべて取得（スケジューラーダイアログ固有の属性）
  const selects = await page.locator('select[aria-labelledby]').all();

  if (selects.length >= 3) {
    for (const sel of selects) {
      // ラベルテキストを取得して種類を判定
      const labelId = await sel.getAttribute('aria-labelledby');
      let labelText = '';
      if (labelId) {
        labelText = await page.locator(`#${labelId}`).textContent() || '';
      }
      const labelLower = labelText.toLowerCase();

      if (labelLower.includes('month') || labelText.includes('月')) {
        // 月セレクト
        console.log(`[x-post-scheduler] 月を設定: ${month}`);
        await sel.selectOption(String(month));
      } else if (labelLower.includes('day') || labelText.includes('日')) {
        // 日セレクト
        console.log(`[x-post-scheduler] 日を設定: ${day}`);
        await sel.selectOption(String(day));
      } else if (labelLower.includes('year') || labelText.includes('年')) {
        // 年セレクト
        console.log(`[x-post-scheduler] 年を設定: ${year}`);
        await sel.selectOption(String(year));
      } else if (labelLower.includes('hour') || labelText.includes('時')) {
        // 時セレクト (24時間制: 0-23)
        const optionValues = await sel
          .locator('option')
          .evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value));
        const maxVal = Math.max(
          ...optionValues.map((v) => parseInt(v)).filter((n) => !isNaN(n))
        );
        if (maxVal <= 12) {
          // 12時間制の場合
          console.log(`[x-post-scheduler] 時を設定 (12h): ${hours12}`);
          await sel.selectOption(String(hours12));
        } else {
          // 24時間制の場合
          console.log(`[x-post-scheduler] 時を設定 (24h): ${hours24}`);
          await sel.selectOption(String(hours24));
        }
      } else if (labelLower.includes('minute') || labelText.includes('分')) {
        // 分セレクト
        console.log(`[x-post-scheduler] 分を設定: ${minutes}`);
        await sel.selectOption(String(minutes));
      } else {
        // ラベルで判定できない場合はオプション内容で判定 (フォールバック)
        const options = await sel.locator('option').allTextContents();
        const optionValues = await sel
          .locator('option')
          .evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value));
        const monthNames = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December',
        ];
        if (options.some((o) => o.includes('月') || monthNames.some((m) => o.includes(m)))) {
          await sel.selectOption(String(month));
        } else if (optionValues.includes(String(year)) || options.includes(String(year))) {
          await sel.selectOption(String(year));
        } else if (options.includes('AM') || options.includes('PM') || options.includes('午前') || options.includes('午後')) {
          const val = ampm === 'AM'
            ? (options.includes('午前') ? '午前' : 'AM')
            : (options.includes('午後') ? '午後' : 'PM');
          await sel.selectOption(val);
        } else {
          console.log(`[x-post-scheduler] 不明なセレクト (label="${labelText}")、スキップ`);
        }
      }
      await page.waitForTimeout(300);
    }
  }

  await page.waitForTimeout(500);

  // Confirm ボタンをクリックして日時を確定
  if (await confirmBtn.isVisible().catch(() => false)) {
    console.log('[x-post-scheduler] Confirm ボタンをクリック');
    await confirmBtn.click();
    await page.waitForTimeout(1000);
  } else {
    console.warn('[x-post-scheduler] Confirm ボタンが見つかりません');
  }

  console.log('[x-post-scheduler] 予約日時設定完了');
}
