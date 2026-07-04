import { Locator, Page } from 'playwright';

/**
 * セレクト要素に対し、value での選択を試し、失敗したら label（表示テキスト）で選択する。
 * X の各セレクトは月="6"/分="05" のように value とラベルの桁が揃わない場合があるため
 * 候補値を順番に試す。
 */
async function selectRobust(sel: Locator, candidates: string[]): Promise<boolean> {
  for (const c of candidates) {
    try {
      await sel.selectOption(c);
      return true;
    } catch {
      /* try next */
    }
    try {
      await sel.selectOption({ label: c });
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

/**
 * 予約ダイアログが開いているか（日時セレクト or 確定ボタンの存在）を判定する。
 * 要素が複数マッチしても strict mode 例外にならないよう count() で判定する。
 */
async function isScheduleDialogOpen(page: Page): Promise<boolean> {
  const selectCount = await page.locator('select[aria-labelledby]').count().catch(() => 0);
  if (selectCount >= 3) return true;
  const confirmCount = await page
    .locator('[data-testid="scheduledConfirmationPrimaryAction"]')
    .count()
    .catch(() => 0);
  return confirmCount > 0;
}

/**
 * 予約ボタンをクリックしてダイアログを開く。
 * X の予約ダイアログ (/compose/post/schedule) はクリック後にセレクトが遅延描画されるため、
 * 1 回クリックしたら最大 timeoutMs まで出現をポーリングする。開かなければ別手段で再試行する。
 */
async function openScheduleDialog(
  page: Page,
  scheduleBtn: Locator,
  timeoutMs = 12000
): Promise<boolean> {
  const methods: Array<() => Promise<void>> = [
    () => scheduleBtn.click({ timeout: 5000 }),
    () => scheduleBtn.dispatchEvent('click'),
    () => scheduleBtn.click({ force: true, timeout: 5000 }),
  ];

  for (let i = 0; i < methods.length; i++) {
    try {
      await methods[i]();
    } catch {
      /* このクリック手段が失敗しても出現監視へ進む */
    }
    // クリック後、セレクト/確定ボタンが出現するまでポーリング
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await page.waitForTimeout(400);
      if (await isScheduleDialogOpen(page)) return true;
    }
    console.log(`[x-post-scheduler] 予約ダイアログ未表示、別手段でリトライ (${i + 1}/${methods.length})`);
  }
  return false;
}

/**
 * X の予約投稿の日時ピッカーを操作して日時を設定する
 *
 * 新 UI (2026 時点 / 日本語・英語両対応):
 * - ツールバーの予約ボタン: data-testid="scheduleOption" (aria-label="ポストを予約" / "Schedule post")
 * - ダイアログ (route: /compose/post/schedule): select[aria-labelledby] が 5 個 (月/日/年/時/分)
 *   セレクトはクリック後に遅延描画される
 * - 時は 24 時間制 (0-23)。AM/PM セレクトは廃止
 * - 確定ボタン: data-testid="scheduledConfirmationPrimaryAction" ("確認する" / "Confirm")
 *   有効な近未来日時 (X の上限は約 18 ヶ月先) でないと aria-disabled のまま
 */
export async function setScheduleDateTime(page: Page, date: Date): Promise<void> {
  console.log(`[x-post-scheduler] 予約日時を設定: ${date.toLocaleString('ja-JP')}`);

  // 1. スケジュールボタンをクリックしてダイアログを開く
  const scheduleBtn = page
    .locator(
      '[data-testid="scheduleOption"], [aria-label="ポストを予約"], [aria-label="Schedule post"], [aria-label="Schedule"], [aria-label="予約投稿"]'
    )
    .first();
  await scheduleBtn.waitFor({ state: 'visible', timeout: 30000 });

  if (!(await openScheduleDialog(page, scheduleBtn))) {
    throw new Error('予約日時ダイアログを開けませんでした（UI 変更の可能性）');
  }

  // 2. 日時コンポーネントを Asia/Tokyo タイムゾーンで取得
  const fmt = (opt: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', ...opt }).format(date);
  const month = parseInt(fmt({ month: 'numeric' }), 10);
  const day = parseInt(fmt({ day: 'numeric' }), 10);
  const year = parseInt(fmt({ year: 'numeric' }), 10);
  const hours24 = parseInt(fmt({ hour: 'numeric', hour12: false }), 10);
  const hours12 = hours24 % 12 || 12;
  const minutes = parseInt(fmt({ minute: 'numeric' }), 10);
  const ampm = hours24 < 12 ? 'AM' : 'PM';

  // 3. aria-labelledby を持つセレクト要素をラベルで判定して設定
  const selects = await page.locator('select[aria-labelledby]').all();

  let hourSet = false;
  let minuteSet = false;

  if (selects.length < 3) {
    throw new Error(`予約日時セレクトが見つかりません (検出数: ${selects.length})`);
  }

  for (const sel of selects) {
    const labelId = await sel.getAttribute('aria-labelledby');
    let labelText = '';
    if (labelId) {
      labelText = (await page.locator(`#${labelId}`).textContent().catch(() => '')) || '';
    }
    const labelLower = labelText.toLowerCase();

    if (labelLower.includes('month') || labelText.includes('月')) {
      console.log(`[x-post-scheduler] 月を設定: ${month}`);
      await selectRobust(sel, [String(month), `${month}月`]);
    } else if (labelLower.includes('day') || labelText.includes('日')) {
      console.log(`[x-post-scheduler] 日を設定: ${day}`);
      await selectRobust(sel, [String(day), String(day).padStart(2, '0')]);
    } else if (labelLower.includes('year') || labelText.includes('年')) {
      console.log(`[x-post-scheduler] 年を設定: ${year}`);
      await selectRobust(sel, [String(year)]);
    } else if (labelLower.includes('hour') || labelText.includes('時')) {
      // 時: オプションの最大値で 12h/24h を判定
      const optionValues = await sel
        .locator('option')
        .evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value));
      const maxVal = Math.max(
        ...optionValues.map((v) => parseInt(v)).filter((n) => !isNaN(n))
      );
      if (maxVal <= 12) {
        console.log(`[x-post-scheduler] 時を設定 (12h): ${hours12}`);
        hourSet = await selectRobust(sel, [String(hours12), String(hours12).padStart(2, '0')]);
      } else {
        console.log(`[x-post-scheduler] 時を設定 (24h): ${hours24}`);
        hourSet = await selectRobust(sel, [String(hours24), String(hours24).padStart(2, '0')]);
      }
    } else if (labelLower.includes('minute') || labelText.includes('分')) {
      console.log(`[x-post-scheduler] 分を設定: ${minutes}`);
      // 分は "05" のようにゼロ埋めの場合があるため両方試す
      minuteSet = await selectRobust(sel, [
        String(minutes),
        String(minutes).padStart(2, '0'),
      ]);
    } else if (labelLower.includes('am') || labelLower.includes('pm') || labelText.includes('午前') || labelText.includes('午後')) {
      // 旧 UI 互換: AM/PM セレクトが残っている場合のみ
      console.log(`[x-post-scheduler] AM/PM を設定: ${ampm}`);
      await selectRobust(sel, ampm === 'AM' ? ['AM', '午前'] : ['PM', '午後']);
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
        await selectRobust(sel, [String(month), `${month}月`]);
      } else if (optionValues.includes(String(year)) || options.includes(String(year))) {
        await selectRobust(sel, [String(year)]);
      } else if (options.includes('AM') || options.includes('PM') || options.includes('午前') || options.includes('午後')) {
        await selectRobust(sel, ampm === 'AM' ? ['AM', '午前'] : ['PM', '午後']);
      } else {
        console.log(`[x-post-scheduler] 不明なセレクト (label="${labelText}")、スキップ`);
      }
    }
    await page.waitForTimeout(300);
  }

  if (!hourSet || !minuteSet) {
    throw new Error(
      `予約時刻の設定に失敗しました (時=${hourSet ? 'OK' : 'NG'}, 分=${minuteSet ? 'OK' : 'NG'})`
    );
  }

  await page.waitForTimeout(500);

  // 4. 確定ボタン ("確認する" / "Confirm") をクリックして日時を確定
  const confirmBtn = page.locator('[data-testid="scheduledConfirmationPrimaryAction"]').first();
  if ((await confirmBtn.count().catch(() => 0)) === 0) {
    throw new Error('確認するボタン (scheduledConfirmationPrimaryAction) が見つかりません');
  }

  // 確定ボタンが有効化される (aria-disabled=null) のを待つ。
  // 無効のままなら日時が不正 (X の予約上限 約18ヶ月超 等) の可能性。
  let confirmEnabled = false;
  for (let t = 0; t < 12; t++) {
    const ariaDis = await confirmBtn.getAttribute('aria-disabled').catch(() => null);
    if (ariaDis !== 'true') {
      confirmEnabled = true;
      break;
    }
    await page.waitForTimeout(400);
  }
  if (!confirmEnabled) {
    throw new Error(
      '確認ボタンが有効になりません。予約日時が不正です（過去日時、または X の予約上限 約18ヶ月先 を超過の可能性）'
    );
  }

  console.log('[x-post-scheduler] 確認ボタンをクリック');
  await confirmBtn.click();
  // ダイアログが閉じる（セレクトが消える）のを待つ
  await page
    .locator('select[aria-labelledby]')
    .first()
    .waitFor({ state: 'hidden', timeout: 10000 })
    .catch(() => undefined);
  await page.waitForTimeout(1000);

  console.log('[x-post-scheduler] 予約日時設定完了');
}

/**
 * 予約が compose 画面に適用されているか（即時投稿防止用）を判定する。
 * - scheduledTweetIndicator が存在する（複数マッチしうるため count() で判定）
 * - もしくは投稿ボタンのテキストが「予約」/「Schedule」（未設定時は "ポストする"/"Post"）
 * confirm 後に遅延描画されることがあるため、最大 timeoutMs までポーリングする。
 */
export async function isScheduleApplied(page: Page, timeoutMs = 6000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  do {
    const indicatorCount = await page
      .locator('[data-testid="scheduledTweetIndicator"]')
      .count()
      .catch(() => 0);
    if (indicatorCount > 0) return true;

    const btnText =
      (await page
        .locator('[data-testid="tweetButton"]')
        .last()
        .textContent()
        .catch(() => '')) || '';
    if (btnText.includes('予約') || /schedule/i.test(btnText)) return true;

    await page.waitForTimeout(400);
  } while (Date.now() < deadline);

  return false;
}
