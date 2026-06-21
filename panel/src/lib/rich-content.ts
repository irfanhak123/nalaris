/**
 * lib/rich-content.ts — Markdown → ServerBlock parser.
 *
 * Parses assistant message content (markdown) into a sequence of
 * ServerBlock objects that the existing BlockRenderer dispatches to
 * the panel's block components (CalendarRowBlock, QuestionBlock,
 * HabitBlock, CalloutBlock, TableBlock, etc.).
 *
 * This means chat content uses the SAME graphic UI as the agent
 * surface — one unified rendering pipeline, not two.
 *
 * Detection layers (in priority order):
 *   1. Callout blocks (| info/warning/success/danger | ... |)
 *   2. Question-with-buttons (short text ending with ? + options list)
 *   3. Calendar event lists (time-prefixed lines like "09:00 — Meeting")
 *   4. Checklists (- [ ] / - [x]) → habit blocks
 *   5. Tables (| col | col |) → table blocks
 *   6. Regular markdown (headings, paragraphs, lists, bold, code)
 *
 * Everything falls through to "chat_message" type if no pattern
 * matches, so the renderer always has something to show.
 */

import { marked } from 'marked';
import type { ServerBlock } from '../schemas/blocks.server';

// ---------------------------------------------------------------------------
// Marked setup
// ---------------------------------------------------------------------------

marked.setOptions({ gfm: true, breaks: true });

function mdToHtml(text: string): string {
  // Marked handles the prose. Inline fences have already been extracted by
  // parseRichContent before this is called, so no extra stripping needed.
  const raw = marked.parse(text, { async: false }) as string;
  return raw.trim();
}

// ---------------------------------------------------------------------------
// Pattern matchers — each returns { blocks, consumed } or null
// ---------------------------------------------------------------------------

let blockIdCounter = 0;
function nextId(): string {
  blockIdCounter += 1;
  return `rc-${Date.now().toString(36)}-${blockIdCounter}`;
}

/**
 * Callout: GitHub/Obsidian callout syntax.
 *   > [!warning] Optional title
 *   > Body text...
 */
function matchCallout(lines: string[]): { blocks: ServerBlock[]; consumed: number } | null {
  if (lines.length < 1) return null;
  const first = lines[0].trim();
  const ghMatch = first.match(/^>\s*\[!(info|warning|success|danger|tip|note|caution)\]\s*(.*)$/i);
  if (ghMatch) {
    const variantRaw = ghMatch[1].toLowerCase();
    const variant = (['info', 'warning', 'success', 'danger'].includes(variantRaw)
      ? variantRaw
      : 'info') as 'info' | 'warning' | 'success' | 'danger';
    const title = ghMatch[2].trim();
    const bodyLines: string[] = [];
    let i = 1;
    while (i < lines.length && lines[i].trim().startsWith('>')) {
      bodyLines.push(lines[i].trim().replace(/^>\s?/, ''));
      i++;
    }
    return {
      blocks: [{
        id: nextId(),
        type: 'callout',
        weight: 50,
        data: { variant, title, body: bodyLines.join('\n') },
      }],
      consumed: i,
    };
  }
  return null;
}

/**
 * Calendar events: 2+ consecutive lines matching a time pattern.
 * Emits one calendar_row block per event.
 */
function matchCalendar(lines: string[]): { blocks: ServerBlock[]; consumed: number } | null {
  const timeRe = /^(?:[-•*]\s+)?(\d{1,2}:\d{2}(?:\s*[–-]\s*\d{1,2}:\d{2})?)\s*[—–-]\s*(.+)$/;
  const events: { time: string; title: string }[] = [];
  let i = 0;

  // Skip optional heading
  if (lines[i] && /^#{1,4}\s+/.test(lines[i].trim())) {
    i++;
  }

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    const m = line.match(timeRe);
    if (m) {
      events.push({ time: m[1].trim(), title: m[2].trim() });
      i++;
    } else break;
  }

  if (events.length >= 2) {
    const blocks: ServerBlock[] = events.map((ev) => ({
      id: nextId(),
      type: 'calendar_row',
      weight: 50,
      data: { time: ev.time, title: ev.title },
    }));
    return { blocks, consumed: i };
  }
  return null;
}

/**
 * Checklist: consecutive - [ ] or - [x] lines.
 * Emits one habit block per item.
 */
function matchChecklist(lines: string[]): { blocks: ServerBlock[]; consumed: number } | null {
  const itemRe = /^[-*]\s+\[([ xX])\]\s+(.+)$/;
  const items: { text: string; done: boolean }[] = [];
  let i = 0;

  // Optional heading
  if (lines[i] && /^#{1,4}\s+/.test(lines[i].trim())) {
    if (lines[i + 1] && itemRe.test(lines[i + 1].trim())) {
      i++;
    }
  }

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    const m = line.match(itemRe);
    if (m) {
      items.push({ text: m[2].trim(), done: m[1].toLowerCase() === 'x' });
      i++;
    } else break;
  }

  if (items.length >= 2) {
    const blocks: ServerBlock[] = items.map((item) => ({
      id: nextId(),
      type: 'habit',
      weight: 50,
      data: { name: item.text, done: item.done, section: 'chat' },
    }));
    return { blocks, consumed: i };
  }
  return null;
}

/**
 * Table: pipe-delimited GFM table → one table block.
 */
function matchTable(lines: string[]): { blocks: ServerBlock[]; consumed: number } | null {
  if (lines.length < 2) return null;
  const pipeLineRe = /^\|(.+)\|$/;
  const sepRe = /^\|?[\s:|-]+\|?$/;

  const first = lines[0].trim();
  if (!pipeLineRe.test(first)) return null;
  const second = lines[1].trim();
  if (!sepRe.test(second) || !second.includes('-')) return null;

  const headers = first.slice(1, -1).split('|').map((s) => s.trim());
  const rows: string[][] = [];
  let i = 2;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!pipeLineRe.test(line)) break;
    rows.push(line.slice(1, -1).split('|').map((s) => s.trim()));
    i++;
  }

  if (headers.length > 0) {
    return {
      blocks: [{
        id: nextId(),
        type: 'table',
        weight: 50,
        data: { headers, rows },
      }],
      consumed: i,
    };
  }
  return null;
}

/**
 * Question with buttons: paragraph ending with "?" + 2-5 short option lines.
 * Emits a question block with actions.
 */
function matchQuestion(lines: string[]): { blocks: ServerBlock[]; consumed: number } | null {
  if (lines.length < 3) return null;
  const qLine = lines[0].trim();
  if (!qLine.endsWith('?') || qLine.length > 200) return null;

  const options: { id: string; label: string; primary: boolean }[] = [];
  let i = 1;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    const m = line.match(/^[-*]\s+(.+)$/);
    const numM = line.match(/^\d+\.\s+(.+)$/);
    const label = m ? m[1] : numM ? numM[1] : line;
    if (!label || label.length > 40 || /[.!?;:]$/.test(label)) break;
    if (label.split(' ').length > 6) break;
    options.push({ id: `opt-${i}`, label: label.trim(), primary: i === 1 });
    i++;
  }

  if (options.length >= 2 && options.length <= 5) {
    return {
      blocks: [{
        id: nextId(),
        type: 'question',
        weight: 50,
        data: {
          text: qLine.replace(/^[-*]\s+/, ''),
          urgency: 'medium',
          actions: options,
        },
        intent: { kind: 'answer_question', qid: nextId() },
      }],
      consumed: i,
    };
  }
  return null;
}

/**
 * Extract [[block:...]] fences from text into ServerBlock objects.
 * Uses bracket-depth scanning to handle nested `]]` in JSON.
 * Returns cleaned text (fences removed) and extracted blocks.
 */
export function extractFences(text: string): { text: string; blocks: ServerBlock[] } {
  const blocks: ServerBlock[] = [];
  let result = '';
  let i = 0;
  let idx = 0;
  while (i < text.length) {
    const start = text.indexOf('[[block:', i);
    if (start === -1) {
      result += text.slice(i);
      break;
    }
    result += text.slice(i, start);
    const after = start + '[[block:'.length;
    const found = findInlineFenceBody(text.slice(after));
    if (!found) {
      // Unterminated fence — keep the rest as text
      result += text.slice(start);
      break;
    }
    const inner = found.json;
    const colon = inner.indexOf(':');
    if (colon !== -1) {
      const type = inner.slice(0, colon).trim();
      const jsonStr = inner.slice(colon + 1).trim();
      try {
        const data = JSON.parse(jsonStr);
        if (typeof data === 'object' && data !== null) {
          idx += 1;
          blocks.push({
            id: `rc-${Date.now().toString(36)}-${idx}`,
            type,
            weight: 50,
            data,
          } as ServerBlock);
        }
      } catch { /* bad JSON — leave as text */ }
    }
    i = after + found.endIdx;
  }
  return { text: result, blocks };
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Find the slice [start, end) of the inline-block fence body in `content`,
 * where `content` starts right after `[[block:type:`. Returns null if no
 * matching `]]` terminator is found.
 *
 * Tracks string state (with escapes) and bracket depth ({ and [) so that
 * a `]]` inside a JSON string or nested array does not prematurely close
 * the fence. Mirrors findInlineEnd() in stream-blocks.ts.
 *
 * After finding the `]]` terminator, the JSON slice is back-trimmed to
 * wherever bracket depth first returns to 0 (i.e. the outermost `{` is
 * balanced). This makes the slice robust against LLM typos that emit
 * one or more stray `}` characters between the JSON and the `]]`.
 */
function findInlineFenceBody(content: string): { json: string; endIdx: number } | null {
  let pos = 0;
  let inString = false;
  let escape = false;
  let depth = 0;
  let closeBracketPos = -1; // position of the first `]` of the `]]` terminator
  while (pos < content.length) {
    const ch = content[pos];
    if (escape) { escape = false; pos += 1; continue; }
    if (ch === '\\' && inString) { escape = true; pos += 1; continue; }
    if (ch === '"') { inString = !inString; pos += 1; continue; }
    if (inString) { pos += 1; continue; }
    if (ch === '{' || ch === '[') { depth += 1; pos += 1; continue; }
    if (ch === '}' || ch === ']') {
      if (ch === ']' && content[pos + 1] === ']' && depth <= 0) {
        closeBracketPos = pos;
        break;
      }
      depth -= 1;
      pos += 1;
      continue;
    }
    pos += 1;
  }
  if (closeBracketPos === -1) return null;

  // The JSON body ends at the position right after the outermost `{`.
  // We need a robust way to find that position even when the LLM has
  // emitted stray `}` characters between the JSON and the `]]` fence.
  //
  // Strategy: forward-walk from the start of `content`, tracking depth,
  // until depth first returns to 0. At that position the outermost `{`
  // has been matched. The JSON slice is content[0..that position]. The
  // forward scan is bounded by closeBracketPos — anything after is fence
  // garbage.
  let jsonEnd = closeBracketPos;
  let fwdDepth = 0;
  let fwdInString = false;
  let fwdEscape = false;
  for (let p = 0; p < closeBracketPos; p += 1) {
    const ch = content[p];
    if (fwdEscape) { fwdEscape = false; continue; }
    if (ch === '\\' && fwdInString) { fwdEscape = true; continue; }
    if (ch === '"') { fwdInString = !fwdInString; continue; }
    if (fwdInString) continue;
    if (ch === '{' || ch === '[') { fwdDepth += 1; continue; }
    if (ch === '}' || ch === ']') {
      fwdDepth -= 1;
      if (fwdDepth === 0) {
        // The outermost `{` has been matched. JSON ends here (inclusive
        // of this `}` / `]`).
        jsonEnd = p + 1;
        break;
      }
      continue;
    }
  }
  // Trim trailing whitespace from the JSON slice.
  while (jsonEnd > 0 && /\s/.test(content[jsonEnd - 1])) jsonEnd -= 1;
  return { json: content.slice(0, jsonEnd), endIdx: closeBracketPos + 2 };
}

/**
 * Recognized [[block:type:{json}]] fences. Mirrors stream-blocks.ts so the
 * same LLM output renders the same way whether it arrives via streaming
 * or as a finalized message.
 *
 * IMPORTANT: the JSON body may contain nested `{...}` and `[...]`, so we
 * can't use a non-greedy regex — we walk the body with a balanced-brace
 * scanner to find the matching `]]`.
 */
function extractInlineBlockFences(content: string): { blocks: ServerBlock[]; stripped: string } {
  const blocks: ServerBlock[] = [];
  let out = '';
  let cursor = 0;
  const opener = '[[block:';
  while (cursor < content.length) {
    const startIdx = content.indexOf(opener, cursor);
    if (startIdx === -1) {
      out += content.slice(cursor);
      break;
    }
    // Flush everything before the opener into the output.
    out += content.slice(cursor, startIdx);

    // Find the colon separating type from json.
    const typeStart = startIdx + opener.length;
    const colonIdx = content.indexOf(':', typeStart);
    if (colonIdx === -1) {
      // malformed — keep the opener as text and continue.
      out += content.slice(startIdx);
      break;
    }
    const type = content.slice(typeStart, colonIdx).trim();
    if (!/^[a-z_][a-z0-9_]*$/.test(type)) {
      // not a valid type — keep the opener as text and continue.
      out += content.slice(startIdx, colonIdx + 1);
      cursor = colonIdx + 1;
      continue;
    }

    // The json body starts right after the colon. Use the balanced scanner
    // to find the matching `]]`.
    const bodyStart = colonIdx + 1;
    const found = findInlineFenceBody(content.slice(bodyStart));
    if (!found) {
      // unterminated fence — keep the rest as text.
      out += content.slice(startIdx);
      break;
    }
    const jsonText = found.json.trim();

    try {
      const parsed = JSON.parse(jsonText);
      if (parsed && typeof parsed === 'object') {
        blocks.push({
          id: nextId(),
          type,
          weight: 50,
          data: parsed,
        } as ServerBlock);
      }
    } catch {
      // malformed JSON — leave the fence as text.
      out += content.slice(startIdx, bodyStart + found.endIdx);
      cursor = bodyStart + found.endIdx;
      continue;
    }
    cursor = bodyStart + found.endIdx;
  }
  return { blocks, stripped: out };
}

/**
 ```block\n{"type":"...","data":{...}}\n``` fences — same syntax stream-blocks.ts accepts.
 */
function extractCodeFenceBlocks(content: string): { blocks: ServerBlock[]; stripped: string } {
  const blocks: ServerBlock[] = [];
  const fenceRe = /```block\s*\n([\s\S]*?)\n```/g;
  const stripped = content.replace(fenceRe, (_full, body: string) => {
    try {
      const parsed = JSON.parse(body.trim());
      if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') {
        const { type, data = {}, ...rest } = parsed;
        blocks.push({
          id: nextId(),
          type,
          weight: typeof rest.weight === 'number' ? rest.weight : 50,
          data,
          ...(rest.intent ? { intent: rest.intent } : {}),
        } as ServerBlock);
      }
    } catch {
      return _full;
    }
    return '';
  });
  return { blocks, stripped };
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parseRichContent(content: string): ServerBlock[] {
  if (!content || !content.trim()) return [];

  // 1. Extract inline [[block:type:{json}]] fences → real ServerBlocks.
  const inline = extractInlineBlockFences(content);
  // 2. Extract ```block ... ``` fences → real ServerBlocks.
  const codeFences = extractCodeFenceBlocks(inline.stripped);
  // 3. What's left is prose + tool-result noise.
  let fenceStripped = codeFences.stripped;
  const fenceBlocks: ServerBlock[] = [...inline.blocks, ...codeFences.blocks];

  // Narrative detection disabled — it created false positives from prose.
  const narrativeBlocks: ServerBlock[] = [];

  // Skip content that is just a raw JSON dump from tool results —
  // these show up when the LLM pastes skill/tool output verbatim.
  const trimmedContent = fenceStripped.trim();
  if (trimmedContent.startsWith('{') && trimmedContent.length > 200) {
    return [{
      id: nextId(),
      type: 'code',
      weight: 50,
      data: { lang: 'json', source: trimmedContent.slice(0, 2000) },
    }];
  }

  // Strip inline tool-result JSON that appears mid-message.
  // These are tool call results the LLM pasted as text. Match balanced
  // JSON objects starting with {"output" or {"success" etc.
  let cleaned = fenceStripped;
  // Remove standalone lines that are just tool-result JSON
  cleaned = cleaned.replace(/^\s*\{(?:"output"|"success"|"error"|"result"):.*\}\s*$/gm, '');
  // If stripping removed most of the content, just render as code
  if (cleaned.trim().length < 20 && trimmedContent.length > 50) {
    return [{
      id: nextId(),
      type: 'code',
      weight: 50,
      data: { lang: 'json', source: trimmedContent.slice(0, 2000) },
    }];
  }

  const lines = fenceStripped.split('\n');
  const blocks: ServerBlock[] = [];
  let i = 0;
  let mdBuf: string[] = [];

  const flushMd = () => {
    if (mdBuf.length > 0 && mdBuf.join('\n').trim()) {
      const html = mdToHtml(mdBuf.join('\n'));
      blocks.push({
        id: nextId(),
        type: 'chat_message',
        weight: 50,
        data: { role: 'assistant', text: html, ts: new Date().toISOString() },
      });
    }
    mdBuf = [];
  };

  while (i < lines.length) {
    const remaining = lines.slice(i);

    const matchers = [matchCallout, matchTable, matchCalendar, matchChecklist, matchQuestion];
    let matched = false;
    for (const matcher of matchers) {
      const result = matcher(remaining);
      if (result) {
        flushMd();
        blocks.push(...result.blocks);
        i += result.consumed;
        matched = true;
        break;
      }
    }

    if (!matched) {
      mdBuf.push(lines[i]);
      i++;
    }
  }

  flushMd();

  // Prepend narrative blocks (they're more structured than the prose).
  // De-dup by (type, data) to avoid double-rendering when the LLM also
  // emitted proper blocks.
  const seen = new Set<string>();
  const dedupNarrative = narrativeBlocks.filter((nb) => {
    const key = `${nb.type}:${JSON.stringify(nb.data).slice(0, 100)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // De-dup fence blocks against prose-derived blocks so we never render
  // the same block twice (e.g. an explicit [[block:stat:...]] shouldn't
  // also be re-rendered by matchCalendar).
  const allKeys = new Set<string>();
  const dedupBlocks = [...blocks].filter((b) => {
    const key = `${b.type}:${JSON.stringify(b.data).slice(0, 100)}`;
    if (allKeys.has(key)) return false;
    allKeys.add(key);
    return true;
  });

  // Order: fence blocks first (they're the LLM's intentional structure),
  // then narrative (auto-detected), then prose-derived blocks.
  const dedupFenceBlocks = fenceBlocks.filter((b) => {
    const key = `${b.type}:${JSON.stringify(b.data).slice(0, 100)}`;
    if (allKeys.has(key)) return false;
    allKeys.add(key);
    return true;
  });

  return [...dedupFenceBlocks, ...dedupNarrative, ...dedupBlocks];
}