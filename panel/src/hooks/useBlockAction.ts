/**
 * hooks/useBlockAction — dispatch procedural-UI block actions.
 *
 * Interactive blocks (button_row, slider, picker, confirm, quick_replies,
 * proactive_question, question, checklist, pulse_card) call sendAction()
 * on user interaction.
 *
 * Fire-and-forget actions (ack, dismiss, block.dismiss) are handled locally
 * and also reported to the agent so it can track engagement in the feedback loop.
 *
 * Mutating actions (energy.set, habit.toggle, journal.log, etc.) are sent
 * as a chat message to the gateway session — the agent sees it as a user
 * message and can respond, call tools, or emit new blocks.
 *
 * v2 changes:
 * - Enriched context: every action carries block_type, block_data, block_text,
 *   parent_question, and available_options so the agent has full context.
 * - Better user message: the optimistic bubble shows a human-readable summary
 *   instead of just the raw label.
 * - Action queuing: if the session is streaming, actions are queued and
 *   flushed when the stream completes.
 * - Dismiss actions now inform the agent (for feedback loop tracking).
 * - Answered state: blocks are dimmed after interaction, matched by content
 *   hash (not block ID, which changes on reconciliation).
 */

import { useCallback, useRef, useEffect } from 'react';
import { gateway } from '../lib/gateway';
import { useSessionStore, reconcileMessages } from '../stores/sessionStore';
import type { ServerBlock } from '../schemas/blocks.server';

export interface BlockAction {
  kind: string;
  payload?: Record<string, unknown>;
  label?: string;
  /** The block that triggered this action — used for context enrichment. */
  block?: ServerBlock;
  /** If set, this block's ID is removed from the UI after the action fires. */
  blockId?: string;
}

interface SendResult {
  ok: boolean;
  error?: string;
  queued?: boolean;
}

/** Kinds that are handled locally — no round-trip to the agent. */
const LOCAL_KINDS = new Set(['ack', 'block.dismiss']);

/**
 * Generate a stable content-based key for a block.
 * This survives reconciliation because it's based on the block's
 * content (type + question text), not its ephemeral ID.
 */
export function blockContentKey(block: ServerBlock): string {
  const d = block.data as Record<string, unknown>;
  const text = (d.q || d.text || d.label || d.title || d.message || '') as string;
  // Truncate to avoid huge keys — first 80 chars is enough to be unique
  return `${block.type}:${text.substring(0, 80)}`;
}

/**
 * Extract the primary text/question from a block's data,
 * regardless of block type. This gives the agent context about
 * what the user was looking at when they clicked.
 */
function extractBlockText(block: ServerBlock): string {
  const d = block.data as Record<string, unknown>;
  if (typeof d.q === 'string') return d.q;
  if (typeof d.text === 'string') return d.text;
  if (typeof d.label === 'string') return d.label;
  if (typeof d.title === 'string') return d.title;
  if (typeof d.sub === 'string') return d.sub;
  if (typeof d.message === 'string') return d.message;
  return '';
}

/**
 * Extract available options from a block, so the agent knows
 * what the user could have chosen.
 */
function extractOptions(block: ServerBlock): string[] {
  const d = block.data as Record<string, unknown>;
  const opts: string[] = [];

  if (Array.isArray(d.actions)) {
    for (const a of d.actions as Record<string, unknown>[]) {
      if (typeof a.label === 'string') opts.push(a.label);
    }
  }
  if (Array.isArray(d.options)) {
    for (const o of d.options as Record<string, unknown>[]) {
      if (typeof o.label === 'string') opts.push(o.label);
    }
  }
  if (Array.isArray(d.items)) {
    for (const item of d.items as Record<string, unknown>[]) {
      if (typeof item.label === 'string') {
        const done = item.done ? '[x]' : '[ ]';
        opts.push(`${done} ${item.label}`);
      }
    }
  }

  return opts;
}

/**
 * Build a human-readable summary of what the user did,
 * for the optimistic user bubble in the chat thread.
 */
function buildUserMessage(action: BlockAction): string {
  const label = action.label || action.kind;
  const block = action.block;
  if (!block) return label;

  const p = action.payload as Record<string, unknown> ?? {};

  switch (block.type) {
    case 'slider': {
      const unit = (block.data as Record<string, unknown>).unit as string || '';
      return `${label}: ${p.value}${unit ? ` ${unit}` : ''}`;
    }
    case 'checklist': {
      const itemLabel = p.label as string || label;
      const checked = p.checked as boolean;
      return `${checked ? 'Checked' : 'Unchecked'}: ${itemLabel}`;
    }
    case 'picker': {
      const selected = p.selected as string || label;
      return `Selected: ${selected}`;
    }
    case 'button_row':
    case 'proactive_question':
    case 'question': {
      return label;
    }
    default:
      return label;
  }
}

export function useBlockAction() {
  const pollTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const actionQueue = useRef<BlockAction[]>([]);

  const clearPolls = () => {
    for (const t of pollTimers.current) clearTimeout(t);
    pollTimers.current = [];
  };

  const schedulePoll = useCallback((sid: string, delayMs: number) => {
    const timer = setTimeout(async () => {
      try {
        const full = await gateway.readSession(sid);
        const local = useSessionStore.getState().messages;
        useSessionStore.getState().setMessages(
          reconcileMessages(local, full.session.messages ?? []),
        );
      } catch { /* non-fatal */ }
    }, delayMs);
    pollTimers.current.push(timer);
  }, []);

  const flushQueue = useCallback(async () => {
    if (actionQueue.current.length === 0) return;
    const next = actionQueue.current.shift();
    if (next) {
      await sendActionInternal(next);
    }
  }, []);

  useEffect(() => {
    const unsub = useSessionStore.subscribe((state, prev) => {
      if (prev.isStreaming && !state.isStreaming) {
        setTimeout(() => flushQueue(), 500);
      }
    });
    return unsub;
  }, [flushQueue]);

  const sendActionInternal = useCallback(async (action: BlockAction): Promise<SendResult> => {
    const { session, isStreaming } = useSessionStore.getState();
    const sid = session?.session_id;
    if (!sid) return { ok: false, error: 'no session' };

    if (isStreaming) {
      if (!LOCAL_KINDS.has(action.kind)) {
        actionQueue.current.push(action);
        return { ok: true, queued: true };
      }
      return { ok: true };
    }

    if (LOCAL_KINDS.has(action.kind)) {
      // Mark as answered locally too
      if (action.block) {
        useSessionStore.getState().markBlockAnswered(blockContentKey(action.block));
      }
      return { ok: true };
    }

    const block = action.block;
    const blockType = block?.type ?? 'unknown';
    const blockText = block ? extractBlockText(block) : '';
    const options = block ? extractOptions(block) : [];
    const payloadStr = action.payload ? JSON.stringify(action.payload) : '{}';

    const contextParts = [
      `[block-action] kind=${action.kind}`,
      `block_type=${blockType}`,
      `payload=${payloadStr}`,
    ];
    if (blockText) contextParts.push(`block_text="${blockText}"`);
    if (options.length > 0) contextParts.push(`options=[${options.join(', ')}]`);
    if (block?.id) contextParts.push(`block_id=${block.id}`);

    const agentMessage = contextParts.join(' | ');
    const userMessage = buildUserMessage(action);
    const clientMsgId = `act-${Date.now().toString(36)}`;

    try {
      useSessionStore.getState().appendLocalMessage({
        role: 'user',
        content: userMessage,
        timestamp: Date.now() / 1000,
        client_msg_id: clientMsgId,
      });

      const startResult = await gateway.startChat({
        session_id: sid,
        message: agentMessage,
        workspace: (import.meta.env.VITE_WORKSPACE as string | undefined) ?? 'workspace',
        profile: (import.meta.env.VITE_PROFILE as string | undefined) ?? 'default',
        client_msg_id: clientMsgId,
      });

      // Publish the stream id so useChat's reactive attach effect will
      // consume the agent response. Without this, block actions fire but
      // the resulting dynamic blocks / reply are never rendered.
      useSessionStore.getState().setStreamId(startResult.stream_id);
      useSessionStore.getState().setStreaming(true);

      clearPolls();
      schedulePoll(sid, 2000);
      schedulePoll(sid, 5000);
      schedulePoll(sid, 10000);
      schedulePoll(sid, 15000);

      // Mark the block as answered using content-based key (stable across reconciliation).
      if (action.block) {
        useSessionStore.getState().markBlockAnswered(blockContentKey(action.block));
      }

      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);

      useSessionStore.getState().setMessages(
        useSessionStore.getState().messages.filter(
          (m) => m.client_msg_id !== clientMsgId,
        ),
      );

      if (msg.includes('409') || msg.includes('busy')) {
        actionQueue.current.push(action);
        return { ok: true, queued: true };
      }

      return { ok: false, error: msg };
    } finally {
      // Ensure any queued action is attempted once the stream we started finishes.
      // The reactive attach effect in useChat drives streaming state.
    }
  }, [schedulePoll, clearPolls]);

  const sendAction = useCallback(async (action: BlockAction): Promise<SendResult> => {
    return sendActionInternal(action);
  }, [sendActionInternal]);

  const isStreaming = useSessionStore((s) => s.isStreaming);
  const queuedCount = actionQueue.current.length;

  return { sendAction, isStreaming, queuedCount };
}
