import { ScheduledPost } from '../types';
import { parseDatetime, extractImageUrls, stripImageLines, buildPost } from './index';

const DATETIME_HEADERS = /^(日時|日付|時間|date|datetime)$/i;
const TEXT_HEADERS = /^(投稿内容|内容|テキスト|本文|text|content)$/i;
const IMAGE_HEADERS = /^(画像|画像url|image)$/i;

/**
 * Parse a Markdown table into ScheduledPost objects.
 * Returns null if the input does not look like a table.
 */
export function parseTable(markdown: string, warnings: string[]): ScheduledPost[] | null {
  const lines = markdown.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  // Find a header row followed by a separator row
  let headerIndex = -1;
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].includes('|')) continue;
    const nextLine = lines[i + 1];
    // Separator row must contain | and ---
    if (nextLine.includes('|') && /^[\s|:-]+$/.test(nextLine) && nextLine.includes('---')) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) return null;

  const parseCells = (line: string): string[] => {
    // Remove leading/trailing pipes and split
    let stripped = line.trim();
    if (stripped.startsWith('|')) stripped = stripped.slice(1);
    if (stripped.endsWith('|')) stripped = stripped.slice(0, -1);
    return stripped.split('|').map((c) => c.trim());
  };

  const headers = parseCells(lines[headerIndex]);

  // Find column indices
  let datetimeCol = -1;
  let textCol = -1;
  let imageCol = -1;

  headers.forEach((header, index) => {
    if (DATETIME_HEADERS.test(header)) datetimeCol = index;
    else if (TEXT_HEADERS.test(header)) textCol = index;
    else if (IMAGE_HEADERS.test(header)) imageCol = index;
  });

  if (datetimeCol === -1 || textCol === -1) {
    return null;
  }

  const posts: ScheduledPost[] = [];
  // Data rows start after headerIndex + separator
  const dataStart = headerIndex + 2;

  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('|')) break; // End of table

    const cells = parseCells(line);
    const datetimeStr = cells[datetimeCol] ?? '';
    const textStr = cells[textCol] ?? '';
    const imageStr = imageCol >= 0 ? (cells[imageCol] ?? '') : '';

    const datetime = parseDatetime(datetimeStr);
    if (!datetime) {
      warnings.push(`Could not parse datetime: "${datetimeStr}"`);
      continue;
    }

    // Extract images from the image column and also from the text column
    const imageUrls = [
      ...extractImageUrls(imageStr),
      // Also pick up bare URLs in the image cell that might not match image extensions
      ...(imageStr.match(/https?:\/\/\S+/g) || []).filter(
        (url) => !extractImageUrls(imageStr).includes(url),
      ),
    ];

    const text = stripImageLines(textStr);

    posts.push(buildPost(datetime, text, imageUrls, warnings));
  }

  if (posts.length === 0) return null;

  return posts;
}
