/**
 * components/rich/RichContent.tsx — renders assistant chat content
 * through the SAME block system the agent surface uses.
 *
 * Chat content is parsed into ServerBlock objects (lib/rich-content.ts),
 * then dispatched through BlockRenderer → the existing block components
 * (CalendarRowBlock, QuestionBlock, HabitBlock, CalloutBlock, etc.).
 *
 * This means:
 *   - Calendar events → same CalendarRowBlock the sidebar uses
 *   - Questions → same QuestionBlock with action buttons
 *   - Checklists → same HabitBlock with toggleable checkboxes
 *   - Callouts → CalloutBlock (new, but in the same registry)
 *   - Tables → TableBlock (new, same registry)
 *   - Plain markdown → ChatMessageBlock (renders the HTML)
 *
 * One pipeline, one design language, no separate rendering layer.
 */

import { parseRichContent, extractFences } from '../../lib/rich-content';
import { BlockRenderer } from '../blocks';

// Simple memoization — caches last parse per content string.
const parseCache = new Map<string, ReturnType<typeof parseRichContent>>();

function parseContentMemo(content: string): ReturnType<typeof parseRichContent> {
  const cached = parseCache.get(content);
  if (cached) return cached;
  const result = parseRichContent(content);
  if (parseCache.size > 200) parseCache.clear();
  parseCache.set(content, result);
  return result;
}

export function RichContent({ content }: { content: string }) {
  // Extract [[block:...]] fences into blocks using bracket-depth scanner.
  // This handles nested `]]` in JSON (tables, arrays).
  const { text: clean, blocks: fenceBlocks } = extractFences(content);
  const mdBlocks = parseContentMemo(clean);
  const allBlocks = [...fenceBlocks, ...mdBlocks];
  if (allBlocks.length === 0) return null;

  return (
    <div className="rich-content">
      {allBlocks.map((block) => (
        <BlockRenderer key={block.id} block={block} />
      ))}
    </div>
  );
}