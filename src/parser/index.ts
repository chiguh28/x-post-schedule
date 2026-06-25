import { v4 as uuidv4 } from 'uuid';
import { ParseResult, ScheduledPost, PostImage } from '../types';
import { parseTable } from './table-parser';
import { parseList } from './list-parser';
import { parseHeadings } from './heading-parser';

export const TOKYO_TIMEZONE = 'Asia/Tokyo';
const MAX_IMAGES_PER_POST = 4;

/**
 * Format a Date as an ISO-like string in Asia/Tokyo timezone.
 * Returns e.g. "2026-03-27T09:00:00+09:00"
 */
export function toJSTISOString(date: Date): string {
  const fmt = (opt: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-US', { timeZone: TOKYO_TIMEZONE, ...opt }).format(date);
  const y = fmt({ year: 'numeric' });
  const m = fmt({ month: '2-digit' });
  const d = fmt({ day: '2-digit' });
  const h = fmt({ hour: '2-digit', hour12: false });
  const min = fmt({ minute: '2-digit' });
  const s = fmt({ second: '2-digit' });
  return `${y}-${m}-${d}T${h}:${min}:${s}+09:00`;
}

const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i;

const DATETIME_PATTERNS: Array<{ regex: RegExp; hasYear: boolean }> = [
  { regex: /(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})/, hasYear: true },
  { regex: /(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/, hasYear: false },
];

/**
 * Parse a datetime string into a Date object in Asia/Tokyo timezone.
 * Returns null if the string cannot be parsed.
 */
export function parseDatetime(input: string): Date | null {
  for (const { regex, hasYear } of DATETIME_PATTERNS) {
    const match = input.match(regex);
    if (!match) continue;

    let year: number;
    let month: number;
    let day: number;
    let hour: number;
    let minute: number;

    if (hasYear) {
      year = parseInt(match[1], 10);
      month = parseInt(match[2], 10);
      day = parseInt(match[3], 10);
      hour = parseInt(match[4], 10);
      minute = parseInt(match[5], 10);
    } else {
      year = new Date().getFullYear();
      month = parseInt(match[1], 10);
      day = parseInt(match[2], 10);
      hour = parseInt(match[3], 10);
      minute = parseInt(match[4], 10);
    }

    // Build an ISO-like string with the Tokyo offset (+09:00)
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+09:00`;
    const date = new Date(iso);

    if (isNaN(date.getTime())) return null;
    return date;
  }

  return null;
}

/**
 * Extract image URLs from a block of text.
 * Recognises:
 *   - Markdown image syntax: ![alt](url)
 *   - Japanese image label: 画像: url / 画像：url
 *   - Bare HTTPS URLs ending in a known image extension
 */
export function extractImageUrls(text: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  const addUrl = (url: string) => {
    const trimmed = url.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      urls.push(trimmed);
    }
  };

  // ![alt](url)
  const mdImageRe = /!\[[^\]]*\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = mdImageRe.exec(text)) !== null) {
    addUrl(m[1]);
  }

  // 画像: url / 画像：url / image: url
  const labelRe = /(?:画像|image)\s*[:：]\s*(https?:\/\/\S+)/gi;
  while ((m = labelRe.exec(text)) !== null) {
    addUrl(m[1]);
  }

  // Bare image URLs on their own line
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (/^https?:\/\/\S+$/.test(trimmed) && IMAGE_EXTENSIONS.test(trimmed)) {
      addUrl(trimmed);
    }
  }

  return urls;
}

/**
 * Build PostImage objects from a list of URLs.
 */
export function buildPostImages(urls: string[]): PostImage[] {
  return urls.map((url) => ({
    id: uuidv4(),
    source: 'url',
    localPath: '',
    previewUrl: url,
  }));
}

/**
 * Strip image-related lines from body text so they don't appear in the post text.
 */
export function stripImageLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      // Remove markdown images
      if (/^!\[[^\]]*\]\([^)]+\)\s*$/.test(trimmed)) return false;
      // Remove image label lines
      if (/^(?:画像|image)\s*[:：]\s*https?:\/\/\S+$/i.test(trimmed)) return false;
      // Remove bare image URLs
      if (/^https?:\/\/\S+$/.test(trimmed) && IMAGE_EXTENSIONS.test(trimmed)) return false;
      return true;
    })
    .join('\n')
    .trim();
}

/**
 * Build a ScheduledPost from raw parsed data.
 * Adds warnings for past datetimes and image count overflow.
 */
export function buildPost(
  datetime: Date,
  text: string,
  imageUrls: string[],
  warnings: string[],
): ScheduledPost {
  const now = new Date();
  if (datetime < now) {
    const formatted = toJSTISOString(datetime);
    warnings.push(`Post scheduled at ${formatted} is in the past`);
  }

  if (imageUrls.length > MAX_IMAGES_PER_POST) {
    warnings.push(
      `Post has ${imageUrls.length} images but maximum is ${MAX_IMAGES_PER_POST}. Extra images will be ignored.`,
    );
    imageUrls = imageUrls.slice(0, MAX_IMAGES_PER_POST);
  }

  return {
    id: uuidv4(),
    scheduledAt: datetime,
    text,
    images: buildPostImages(imageUrls),
    status: 'pending',
  };
}

/**
 * Parse a Markdown string into scheduled posts.
 *
 * Tries table format first, then list format, then heading format.
 */
export function parseMarkdown(markdown: string): ParseResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Try each parser in order
  const tableResult = parseTable(markdown, warnings);
  if (tableResult !== null) {
    return { posts: tableResult, warnings, errors };
  }

  const listResult = parseList(markdown, warnings);
  if (listResult !== null) {
    return { posts: listResult, warnings, errors };
  }

  const headingResult = parseHeadings(markdown, warnings);
  if (headingResult !== null) {
    return { posts: headingResult, warnings, errors };
  }

  errors.push('Could not detect any supported Markdown format (table, list, or heading)');
  return { posts: [], warnings, errors };
}
