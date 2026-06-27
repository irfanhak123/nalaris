/**
 * ChatMessage — chat bubble for a single gateway message.
 *
 * Both user and assistant messages can contain [[block:...]] fences.
 * Cron ticks arrive as user messages with embedded blocks; user-typed
 * messages are plain text. Assistant messages may have ui_blocks from
 * the stream parser or fences in content.
 *
 * During a turn we show a compact activity overview (Claude-app style):
 * a single status line + small chips for "Thinking" and each tool call.
 * Once the response is final, that overview disappears and leaves a clean
 * message. A subtle "Thinking / N tools" expander is shown only when the
 * user wants to inspect the work that produced the answer.
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
  const hasResponseBody = hasBlocks || hasCleanText || hasThinking || hasToolCalls;

  return (
    <div className="cm cm-assistant" data-streaming={isStillStreaming ? 'true' : undefined}>
      {/* Live turn overview: a clean activity line + chips, never a wall of text. */}
      {isStillStreaming ? (
        <StreamingOverview thinking={hasThinking} toolCalls={item.tool_calls ?? []} />
      ) : hasThinking || hasToolCalls ? (
        <ActivitySummary reasoning={item.reasoning} toolCalls={item.tool_calls ?? []} />
      ) : null}

      {hasBlocks ? (
        <div className="cm-blocks">
          {allBlocks.map((block) => <BlockRenderer key={block.id} block={block} />)}
        </div>
      ) : null}

      {shouldShowProse ? <RichContent content={cleanContent} /> : null}

      {/* Never let a streaming assistant message render completely empty.
          If no prose, blocks, thinking, or tools have arrived yet, show a
          working indicator so the bubble stays visible. */}
      {isStillStreaming && !hasResponseBody && !shouldShowProse ? <StreamingDots /> : null}
      {isStillStreaming && (shouldShowProse || hasBlocks) ? <StreamingDots inline /> : null}
    </div>
  );
}

/** Compact status row shown while the assistant is still working. */
function StreamingOverview({ thinking, toolCalls }: { thinking: boolean; toolCalls: ToolCallRecord[] }) {
  const pendingTools = toolCalls.filter((c) => c.pending);
  const activeLabel =
    pendingTools.length > 0
      ? `Using ${pendingTools.length} tool${pendingTools.length > 1 ? 's' : ''}`
      : toolCalls.length > 0
        ? 'Finished tools'
        : thinking
          ? 'Thinking'
          : 'Working';

  return (
    <div className="cm-overview">
      <div className="cm-overview-main">
        <span className="cm-overview-pulse" aria-hidden="true" />
        <span className="cm-overview-label">{activeLabel}</span>
      </div>
      <div className="cm-overview-chips">
        {thinking ? (
          <span className="cm-chip cm-chip-thinking">
            <span className="cm-chip-dot" />
            Thinking
          </span>
        ) : null}
        {toolCalls.map((call, i) => (
          <span key={i} className={`cm-chip ${call.pending ? 'cm-chip-pending' : 'cm-chip-done'}`}>
            {call.pending ? <span className="cm-chip-spinner" /> : <span className="cm-chip-check">✓</span>}
            {call.name}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Minimal post-turn inspector. Default collapsed; keeps the final UI clean. */
function ActivitySummary({ reasoning, toolCalls }: { reasoning?: string; toolCalls: ToolCallRecord[] }) {
  const [open, setOpen] = useState(false);
  const hasThinking = !!reasoning && reasoning.trim().length > 0;
  const parts: string[] = [];
  if (hasThinking) parts.push('Thinking');
  if (toolCalls.length > 0) parts.push(`${toolCalls.length} tool${toolCalls.length > 1 ? 's' : ''}`);
  if (parts.length === 0) return null;

  return (
    <div className="cm-summary">
      <button className="cm-summary-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="cm-summary-icon">{open ? '▾' : '▸'}</span>
        <span className="cm-summary-label">{parts.join(' · ')}</span>
      </button>
      {open ? (
        <div className="cm-summary-body">
          {hasThinking ? <ThinkingSection reasoning={reasoning!} /> : null}
          {toolCalls.length > 0 ? <ToolCallSection calls={toolCalls} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function ThinkingSection({ reasoning }: { reasoning: string }) {
  const preview = reasoning.trim().split('\n')[0].slice(0, 80);
  return (
    <div className="cm-thinking">
      <div className="cm-thinking-preview-line">{preview}…</div>
      <div className="cm-thinking-body">{reasoning}</div>
    </div>
  );
}

function ToolCallSection({ calls }: { calls: ToolCallRecord[] }) {
  return (
    <div className="cm-tools">
      <div className="cm-tools-body">
        {calls.map((call, i) => <ToolCallItem key={i} call={call} />)}
      </div>
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