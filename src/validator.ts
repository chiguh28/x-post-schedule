import { ScheduledPost } from './types';

export interface ValidationResult {
  warnings: string[];
  errors: string[];
}

const URL_PATTERN = /https?:\/\/\S+/g;
const X_URL_LENGTH = 10;
const X_CHAR_LIMIT = 140;
const X_MAX_IMAGES = 4;

/**
 * X のルールに従ってテキストの文字数を計算する。
 * URL は t.co 短縮により 10 文字としてカウントする。
 */
function countTextLength(text: string): number {
  const withoutUrls = text.replace(URL_PATTERN, '');
  const urlMatches = text.match(URL_PATTERN);
  const urlCount = urlMatches ? urlMatches.length : 0;
  return withoutUrls.length + urlCount * X_URL_LENGTH;
}

/**
 * ScheduledPost の配列をバリデーションし、警告とエラーを返す。
 *
 * チェック項目:
 * 1. テキスト長: 140 文字超で警告 (URL は 10 文字換算)
 * 2. 過去日時: scheduledAt が現在より前ならエラー
 * 3. 重複日時: 同一 scheduledAt の投稿があれば警告
 * 4. 空テキスト: テキストが空または空白のみならエラー
 * 5. 画像数超過: images.length > 4 で警告
 */
export function validatePosts(posts: ScheduledPost[]): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const now = new Date();

  // 重複日時チェック用マップ (ISO 文字列 → インデックスリスト)
  const dateTimeMap = new Map<string, number[]>();

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const label = post.id ? `Post "${post.id}" (index ${i})` : `Post index ${i}`;

    // 4. 空テキスト
    if (!post.text || post.text.trim().length === 0) {
      errors.push(`${label}: テキストが空です`);
    } else {
      // 1. テキスト長
      const length = countTextLength(post.text);
      if (length > X_CHAR_LIMIT) {
        warnings.push(
          `${label}: テキストが ${X_CHAR_LIMIT} 文字を超えています (${length} 文字)`
        );
      }
    }

    // 2. 過去日時
    if (post.scheduledAt < now) {
      errors.push(`${label}: 予約日時が過去です (${post.scheduledAt.toLocaleString('ja-JP')})`);
    }

    // 3. 重複日時の収集
    const key = post.scheduledAt.toISOString();
    if (!dateTimeMap.has(key)) {
      dateTimeMap.set(key, []);
    }
    dateTimeMap.get(key)!.push(i);

    // 5. 画像数超過
    if (post.images.length > X_MAX_IMAGES) {
      warnings.push(
        `${label}: 画像が ${X_MAX_IMAGES} 枚を超えています (${post.images.length} 枚)`
      );
    }
  }

  // 3. 重複日時の警告出力
  for (const [dateTime, indices] of dateTimeMap) {
    if (indices.length > 1) {
      const labels = indices.map(i => {
        const post = posts[i];
        return post.id ? `"${post.id}" (index ${i})` : `index ${i}`;
      });
      warnings.push(
        `予約日時が重複しています (${new Date(dateTime).toLocaleString('ja-JP')}): ${labels.join(', ')}`
      );
    }
  }

  return { warnings, errors };
}
