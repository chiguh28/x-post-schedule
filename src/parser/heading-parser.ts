import { ScheduledPost } from '../types';
import { parseDatetime, extractImageUrls, stripImageLines, buildPost } from './index';

/**
 * Parse heading-based Markdown into ScheduledPost objects.
 * Returns null if no headings with valid datetimes are found.
 *
 * Expected format:
 * ## 2026-03-27 09:00
 *
 * Post text here...
 *
 * ![alt](https://example.com/img.jpg)
 */
export function parseHeadings(markdown: string, warnings: string[]): ScheduledPost[] | null {
  const lines = markdown.split('\n');

  // Split into sections by ## headings
  const sections: Array<{ heading: string; body: string[] }> = [];
  let currentSection: { heading: string; body: string[] } | null = null;

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      if (currentSection) sections.push(currentSection);
      currentSection = { heading: headingMatch[1].trim(), body: [] };
    } else if (currentSection) {
      currentSection.body.push(line);
    }
  }
  if (currentSection) sections.push(currentSection);

  if (sections.length === 0) return null;

  const posts: ScheduledPost[] = [];

  for (const section of sections) {
    const datetime = parseDatetime(section.heading);
    if (!datetime) continue;

    const bodyText = section.body.join('\n');
    const imageUrls = extractImageUrls(bodyText);
    const cleanText = stripImageLines(bodyText);

    posts.push(buildPost(datetime, cleanText, imageUrls, warnings));
  }

  if (posts.length === 0) return null;

  return posts;
}
