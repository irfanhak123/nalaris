/**
 * ChatMessage — chat bubble for a single gateway message.
 *
 * Both user and assistant messages can contain [[block:...]] fences.
 * Cron ticks arrive as user messages with embedded blocks; user-typed
 * messages are plain text. Assistant messages may have ui_blocks from
 * the stream parser or fences in content.
 *
 * Tool calls and thinking are collapsible, hidden by default.
 */

import { useState } from 'react';
import type { GatewayMessage, ToolCallRecord } from '../../lib/gateway';
import { extractFences } from '../../lib/rich-content';
import { RichContent } from '../rich/RichContent';
import { BlockRenderer } from '../blocks';

export function ChatMessage({ item }: { item: GatewayMessage }) {
  const isUser = item.role === 'user';
  const hasThinking = !!item.reasoning && item.reasoning.trim().length > 0;
  const hasToolCalls = !!item.tool_calls && item.tool_calls.length > 0;

  // Tool messages: skip entirely — they're raw JSON from tool calls.
  if (item.role === 'tool') return null;

  // Strip the [REMINDER:...] and [UI BLOCK FORMAT] prefixes that useChat
  // prepends to messages before sending to the LLM. These are instructions,
  // not user-visible content. Also strip [SILENT] markers.
  // Use line-based stripping because the reminder contains nested brackets
  // that break regex-based approaches.
  let content = item.content || '';
  const lines = content.split('\n');
  const cleaned: string[] = [];
  let skipBlock = false;
  for (const line of lines) {
    if (line.startsWith('[REMINDER:')) { skipBlock = true; continue; }
    if (line.startsWith('[UI BLOCK FORMAT]')) { skipBlock = true; continue; }
    if (skipBlock && line.startsWith('[END UI BLOCK FORMAT]')) { skipBlock = false; continue; }
    if (skipBlock) continue;
    if (line === '[SILENT]') continue;
    cleaned.push(line);
  }
  content = cleaned.join('\n').trim();
  const { text: cleanContent, blocks: fenceBlocks } = content ? extractFences(content) : { text: '', blocks: [] };
  const allBlocks = [...(item.ui_blocks || []), ...fenceBlocks];
  const hasBlocks = allBlocks.length > 0;
  const hasCleanText = cleanContent.trim().length > 0;
  const hasContent = !!content && content.trim().length > 0;

  // If blocks were extracted and the remaining prose is short/redundant
  // (the LLM wrote the block data as prose AND as a fence), suppress
  // the prose. Only keep prose when it's substantial (>200 chars).
  const shouldShowProse = hasCleanText && (!hasBlocks || cleanContent.trim().length > 200);

  // User messages: plain bubble if no blocks, rich if blocks present (cron).
  if (isUser) {
    if (!hasBlocks && hasContent) {
      return (
        <div className="cm cm-user">
          <div className="cm-bubble">{content}</div>
        </div>
      );
    }
    // Cron message with blocks — render blocks as rich content.
    return (
      <div className="cm cm-assistant">
        {hasBlocks ? (
          <div className="cm-blocks">
            {allBlocks.map((block) => <BlockRenderer key={block.id} block={block} />)}
          </div>
        ) : null}
        {shouldShowProse ? <RichContent content={cleanContent} /> : null}
      </div>
    );
  }

  // Assistant messages
  const isStillStreaming = !!item.streaming;

  return (
    <div className="cm cm-assistant" data-streaming={isStillStreaming ? 'true' : undefined}>
      {/* During streaming: show compact activity indicator instead of tool calls/thinking */}
      {isStillStreaming && (hasToolCalls || hasThinking || (!hasBlocks && !hasCleanText)) ? (
        <div className="cm-activity">
          <span className="cm-dot" /><span className="cm-dot" /><span className="cm-dot" />
          <span className="cm-activity-label">
            {hasToolCalls ? `${item.tool_calls!.filter(c => c.pending).length || ''} working…` : 'thinking…'}
          </span>
        </div>
      ) : null}
      {/* After done: show collapsible tool calls and thinking */}
      {!isStillStreaming && hasToolCalls ? <ToolCallSection calls={item.tool_calls!} /> : null}
      {!isStillStreaming && hasThinking ? <ThinkingSection reasoning={item.reasoning!} /> : null}
      {hasBlocks ? (
        <div className="cm-blocks">
          {allBlocks.map((block) => <BlockRenderer key={block.id} block={block} />)}
        </div>
      ) : null}
      {shouldShowProse ? (
        <RichContent content={cleanContent} />
      ) : !hasBlocks && isStillStreaming ? (
        <StreamingDots />
      ) : null}
      {isStillStreaming && (shouldShowProse || hasBlocks) ? <StreamingDots inline /> : null}
    </div>
  );
}

function ThinkingSection({ reasoning }: { reasoning: string }) {
  const [open, setOpen] = useState(false);
  const preview = reasoning.trim().split('\n')[0].slice(0, 80);
  return (
    <div className="cm-thinking">
      <button className="cm-thinking-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="cm-thinking-icon">{open ? '▾' : '▸'}</span>
        <span className="cm-thinking-label">thinking</span>
        {!open && preview ? <span className="cm-thinking-preview">{preview}…</span> : null}
      </button>
      {open ? <div className="cm-thinking-body">{reasoning}</div> : null}
    </div>
  );
}

function ToolCallSection({ calls }: { calls: ToolCallRecord[] }) {
  const [open, setOpen] = useState(false);
  const pendingCount = calls.filter((c) => c.pending).length;
  const doneCount = calls.length - pendingCount;
  return (
    <div className="cm-tools">
      <button className="cm-tools-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="cm-tools-icon">{open ? '▾' : '▸'}</span>
        <span className="cm-tools-label">
          {pendingCount > 0 ? (
            <>
              <span className="spinner" style={{ width: 10, height: 10 }} />
              {pendingCount} tool{pendingCount > 1 ? 's' : ''} running
              {doneCount > 0 ? ` · ${doneCount} done` : ''}
            </>
          ) : (
            <>{calls.length} tool call{calls.length > 1 ? 's' : ''}</>
          )}
        </span>
      </button>
      {open ? (
        <div className="cm-tools-body">
          {calls.map((call, i) => <ToolCallItem key={i} call={call} />)}
        </div>
      ) : null}
    </div>
  );
}

function ToolCallItem({ call }: { call: ToolCallRecord }) {
  const [expanded, setExpanded] = useState(false);
  const hasArgs = call.args && JSON.stringify(call.args).length > 2;
  const hasResult = call.result !== undefined && call.result !== null;
  return (
    <div className="cm-tool-item" data-pending={call.pending ? 'true' : undefined}>
      <button className="cm-tool-item-head" onClick={() => setExpanded(!expanded)}>
        <span className="cm-tool-status">
          {call.pending ? <span className="spinner" style={{ width: 8, height: 8 }} /> : <span className="cm-tool-check">✓</span>}
        </span>
        <code className="cm-tool-name">{call.name}</code>
        {hasArgs || hasResult ? <span className="cm-tool-expand">{expanded ? '▾' : '▸'}</span> : null}
      </button>
      {expanded ? (
        <div className="cm-tool-detail">
          {hasArgs ? <div className="cm-tool-args"><div className="cm-tool-detail-label">args</div><pre>{formatJson(call.args)}</pre></div> : null}
          {hasResult ? <div className="cm-tool-result"><div className="cm-tool-detail-label">result</div><pre>{formatJson(call.result)}</pre></div> : null}
        </div>
      ) : null}
    </div>
  );
}

function StreamingDots({ inline = false }: { inline?: boolean }) {
  return (
    <span className={inline ? 'cm-streaming-inline' : 'cm-streaming'}>
      <span className="cm-dot" /><span className="cm-dot" /><span className="cm-dot" />
    </span>
  );
}

function formatJson(value: unknown): string {
  if (typeof value === 'string') {
    try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
  }
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}