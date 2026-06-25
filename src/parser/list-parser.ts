import { ScheduledPost } from '../types';
import { parseDatetime, extractImageUrls, stripImageLines, buildPost } from './index';

/**
 * Parse a Markdown list into ScheduledPost objects.
 * Returns null if the input does not look like a list format.
 *
 * Expected format:
 * - **2026-03-27 09:00**
 *   Post text here...
 *   画像: https://example.com/img.jpg
 */
export function parseList(markdown: string, warnings: string[]): ScheduledPost[] | null {
  const lines = markdown.split('\n');

  // Check if this looks like a list at all
  const hasListItems = lines.some((line) => /^\s*[-*]\s+/.test(line));
  if (!hasListItems) return null;

  // Group lines into list items
  const items: string[][] = [];
  let currentItem: string[] | null = null;

  for (const line of lines) {
    if (/^\s*[-*]\s+/.test(line)) {
      // New list item
      if (currentItem) items.push(currentItem);
      currentItem = [line.replace(/^\s*[-*]\s+/, '')];
    } else if (currentItem !== null && /^\s+/.test(line) && line.trim().length > 0) {
      // Continuation line (indented)
      currentItem.push(line.trim());
    } else if (currentItem !== null && line.trim() === '') {
      // Blank line within an item - keep going but preserve it
      currentItem.push('');
    } else if (currentItem !== null) {
      // Non-indented, non-empty line ends the item
      items.push(currentItem);
      currentItem = null;
    }
  }
  if (currentItem) items.push(currentItem);

  if (items.length === 0) return null;

  const posts: ScheduledPost[] = [];

  for (const item of items) {
    const firstLine = item[0];

    // Try to extract datetime from bold text **datetime**
    let datetimeStr: string | null = null;
    const boldMatch = firstLine.match(/\*\*(.+?)\*\*/);
    if (boldMatch) {
      datetimeStr = boldMatch[1];
    } else {
      // Try the whole first line as a datetime
      datetimeStr = firstLine;
    }

    const datetime = parseDatetime(datetimeStr);
    if (!datetime) {
      continue; // Skip items without valid datetimes
    }

    // Build body text: remove the datetime portion from first line, add remaining lines
    let bodyLines: string[] = [];

    // First line: remove the bold datetime or the datetime itself
    let firstLineRemainder = firstLine;
    if (boldMatch) {
      firstLineRemainder = firstLine.replace(/\*\*(.+?)\*\*/, '').trim();
    } else {
      // Remove the matched datetime pattern from the line
      firstLineRemainder = firstLine.replace(/\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}/, '').trim();
      firstLineRemainder = firstLineRemainder.replace(/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}/, '').trim();
    }
    if (firstLineRemainder) bodyLines.push(firstLineRemainder);

    // Add remaining lines
    bodyLines.push(...item.slice(1));

    const bodyText = bodyLines.join('\n');
    const imageUrls = extractImageUrls(bodyText);
    const cleanText = stripImageLines(bodyText);

    posts.push(buildPost(datetime, cleanText, imageUrls, warnings));
  }

  if (posts.length === 0) return null;

  return posts;
}
