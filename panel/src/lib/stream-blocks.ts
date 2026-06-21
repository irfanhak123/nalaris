/**
 * lib/stream-blocks.ts — Extract ServerBlock objects from streaming LLM text.
 *
 * The agent (LLM) and the deterministic backend emit structured UI
 * elements inline with prose. As tokens stream in, this parser splits
 * the accumulated buffer into:
 *   - visible text (the prose part, with fences stripped)
 *   - extracted blocks (each as a ServerBlock)
 *
 * Two fence formats are recognised:
 *
 *   1. Triple-backtick fence (LLM):
 *
 *        ```block
 *        {"type": "calendar_row", "data": {"time": "09:00", "title": "Standup"}}
 *        ```
 *
 *      The JSON carries both `type` and `data`.
 *
 *   2. Inline bracket fence (deterministic backend, INLINE_BLOCK_PROTOCOL):
 *
 *        [[block:calendar_row:{"time":"09:00","title":"Standup"}]]
 *
 *      The type sits between `[[block:` and the first `:`; the rest is
 *      the JSON `data` object. Single line, no embedded `]]`.
 *
 * The parser is stateful: it buffers tokens, detects a fence start,
 * captures content until the closing fence, emits the parsed block, and
 * strips the fence from the visible text. An internal cursor `i` lets it
 * resume scanning after a partial fence; it resets to 0 after a complete
 * fence is removed (the buffer shrank).
 */

import type { ServerBlock } from '../schemas/blocks.server';

export interface ParsedStream {
  /** The text with all block fences stripped out. */
  text: string;
  /** Blocks extracted so far, in declaration order. */
  blocks: ServerBlock[];
}

const FENCE_START = '```block';
const FENCE_END = '```';
const INLINE_START = '[[block:';
const INLINE_END = ']]';

let blockIdCounter = 0;
function nextId(): string {
  blockIdCounter += 1;
  return `llm-${Date.now().toString(36)}-${blockIdCounter}`;
}

interface ParserState {
  buffer: string;
  blocks: ServerBlock[];
  inFence: boolean;
  /** Start position of the current fence in the buffer. */
  fenceStart: number;
  /** Accumulated JSON content for the current fence. */
  fenceJson: string;
  inInline: boolean;
  /** Start position of the current inline `[[block:...]]` in the buffer. */
  inlineStart: number;
  /** Accumulated `type:json` text for the current inline block. */
  inlineText: string;
  /** Cursor position to resume scanning from. */
  cursor: number;
}

function createState(): ParserState {
  return {
    buffer: '',
    blocks: [],
    inFence: false,
    fenceStart: -1,
    fenceJson: '',
    inInline: false,
    inlineStart: -1,
    inlineText: '',
    cursor: 0,
  };
}

function tryParseBlock(jsonText: string): ServerBlock | null {
  const trimmed = jsonText.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (typeof parsed.type !== 'string') return null;

    return {
      id: parsed.id || nextId(),
      type: parsed.type,
      weight: typeof parsed.weight === 'number' ? parsed.weight : 50,
      data: parsed.data || {},
      ...(parsed.intent ? { intent: parsed.intent } : {}),
    } as ServerBlock;
  } catch {
    return null;
  }
}

/** Parse a `type:{json}` inline body into a block. The JSON is the data. */
function tryParseInline(inner: string): ServerBlock | null {
  const trimmed = inner.trim();
  if (!trimmed) return null;
  const colon = trimmed.indexOf(':');
  if (colon === -1) return null;
  const type = trimmed.slice(0, colon).trim();
  if (!type) return null;
  const jsonText = trimmed.slice(colon + 1).trim();
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return {
      id: nextId(),
      type,
      weight: 50,
      data: parsed,
    } as ServerBlock;
  } catch {
    return null;
  }
}

/** Find the next valid triple-backtick fence start from `from`. */
function findFenceStart(buffer: string, from: number): number {
  let i = from;
  for (;;) {
    const idx = buffer.indexOf(FENCE_START, i);
    if (idx === -1) return -1;
    // Must be at the beginning of a line.
    if (idx > 0 && buffer[idx - 1] !== '\n') {
      i = idx + FENCE_START.length;
      continue;
    }
    // ```block must be followed by \n (or be at the very end, pending).
    const after = idx + FENCE_START.length;
    if (after < buffer.length && buffer[after] !== '\n') {
      i = after;
      continue;
    }
    return idx;
  }
}

/**
 * Feed a chunk of streamed text into the parser.
 * Returns the current visible text (cumulative, with fences stripped)
 * and the list of blocks extracted so far.
 */
export function feedStream(state: ParserState, chunk: string): ParsedStream {
  state.buffer += chunk;
  let i = state.cursor;

  for (;;) {
    if (state.inFence) {
      const closeIdx = state.buffer.indexOf(FENCE_END, i);
      if (closeIdx === -1) {
        // Fence not complete yet; accumulate what we have and wait.
        state.fenceJson += state.buffer.slice(i);
        i = state.buffer.length;
        break;
      }
      const afterClose = closeIdx + FENCE_END.length;
      const atLineEnd = afterClose >= state.buffer.length || state.buffer[afterClose] === '\n';
      if (atLineEnd) {
        const jsonText = state.fenceJson + state.buffer.slice(i, closeIdx);
        const block = tryParseBlock(jsonText);
        if (block) state.blocks.push(block);
        state.buffer = state.buffer.slice(0, state.fenceStart) + state.buffer.slice(afterClose);
        state.inFence = false;
        state.fenceStart = -1;
        state.fenceJson = '';
        i = 0; // buffer shrank; rescan from start
        continue;
      }
      // ``` not at line end — treat as literal, keep searching.
      state.fenceJson += state.buffer.slice(i, afterClose);
      i = afterClose;
      continue;
    }

    if (state.inInline) {
      const closeIdx = findInlineEnd(state.inlineText + state.buffer.slice(i));
      if (closeIdx === -1) {
        // Inline block not complete yet; accumulate what we have and wait.
        state.inlineText += state.buffer.slice(i);
        i = state.buffer.length;
        break;
      }
      // closeIdx is relative to the combined (inlineText + buffer-tail) text.
      // Translate back to absolute position in state.buffer.
      const combined = state.inlineText + state.buffer.slice(i);
      const bufferCloseIdx = i + (closeIdx - state.inlineText.length);
      const inner = combined.slice(0, closeIdx);
      const block = tryParseInline(inner);
      if (block) state.blocks.push(block);
      const afterClose = bufferCloseIdx + INLINE_END.length;
      state.buffer = state.buffer.slice(0, state.inlineStart) + state.buffer.slice(afterClose);
      state.inInline = false;
      state.inlineStart = -1;
      state.inlineText = '';
      i = 0; // buffer shrank; rescan from start
      continue;
    }

    // Not inside any fence — look for the next opener (either format).
    const fenceIdx = findFenceStart(state.buffer, i);
    const inlineIdx = state.buffer.indexOf(INLINE_START, i);

    let idx = -1;
    let useFence = false;
    if (fenceIdx === -1 && inlineIdx === -1) {
      i = state.buffer.length;
      break;
    } else if (fenceIdx !== -1 && (inlineIdx === -1 || fenceIdx <= inlineIdx)) {
      idx = fenceIdx;
      useFence = true;
    } else {
      idx = inlineIdx;
      useFence = false;
    }

    if (useFence) {
      state.inFence = true;
      state.fenceStart = idx;
      state.fenceJson = '';
      i = idx + FENCE_START.length + 1; // skip past the \n
      continue;
    }

    state.inInline = true;
    state.inlineStart = idx;
    state.inlineText = '';
    i = idx + INLINE_START.length;
  }

  state.cursor = i;
  return { text: state.buffer, blocks: state.blocks };
}

export function newStreamParser(): ParserState {
  return createState();
}

export function finalizeStream(state: ParserState): ParsedStream {
  if (state.inFence) {
    // Drop unclosed fence from visible text.
    state.buffer = state.buffer.slice(0, state.fenceStart);
  } else if (state.inInline) {
    state.buffer = state.buffer.slice(0, state.inlineStart);
  }
  return { text: state.buffer, blocks: state.blocks };
}

/**
 * Find the index of the first `]` of the `]]` terminator that ends an
 * inline block fence body. Returns -1 if no terminator is found.
 *
 * Scans the body as JSON-like text: tracks string state (with escapes),
 * bracket depth ({ and [), and returns the position of a `]]` sequence
 * that occurs at depth <= 0 (outside all nested brackets). This is
 * necessary because the JSON inside fences can contain `]]` itself
 * (e.g. nested arrays in `table` rows).
 */
function findInlineEnd(body: string): number {
  let pos = 0;
  let inString = false;
  let escape = false;
  let depth = 0;
  while (pos < body.length) {
    const ch = body[pos];
    if (escape) {
      escape = false;
      pos += 1;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      pos += 1;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      pos += 1;
      continue;
    }
    if (inString) {
      pos += 1;
      continue;
    }
    if (ch === '{' || ch === '[') {
      depth += 1;
      pos += 1;
      continue;
    }
    if (ch === '}' || ch === ']') {
      if (ch === ']' && body[pos + 1] === ']' && depth <= 0) {
        return pos;
      }
      depth -= 1;
      pos += 1;
      continue;
    }
    pos += 1;
  }
  return -1;
}