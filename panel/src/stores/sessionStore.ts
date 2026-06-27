/**
 * stores/sessionStore.ts — one fixed session, persistent chat.
 *
 * v1: no session picker. The same `session_id` is reused across
 * reloads via localStorage. Cron ticks from the agent land in this
 * same session. User messages land in this same session. The
 * conversation is the long-lived memory of the day/week.
 *
 * localStorage holds:
 *   - session_id: string           (the active session)
 *   - messages: GatewayMessage[]   (last known snapshot, for instant paint)
 *   - draft: string                (composer text)
 *
 * The gateway is the source of truth. On mount, the panel re-reads
 * the session and reconciles.
 *
 * Hydration lifecycle: `persist.hasHydrated()` flips false until the
 * store has loaded from localStorage. Until that happens, the boot
 * effect in useChat must NOT create a new session — it must wait
 * for the persisted `session_id` to arrive. Otherwise every reload
 * spawns a new session and overwrites the persisted one.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { GatewayMessage, GatewaySession, ToolCallRecord } from '../lib/gateway';
import type { ServerBlock } from '../schemas/blocks.server';
import { extractFences } from '../lib/rich-content';
import { gateway } from '../lib/gateway';

interface SessionStoreState {
  session: GatewaySession | null;
  messages: GatewayMessage[];
  /** True while connected to a live /api/chat/stream. */
  isStreaming: boolean;
  /** The stream_id we last opened; used for cancel. */
  activeStreamId: string | null;
  /** Composer text — kept here so it survives a session switch (in v2). */
  draft: string;
  /** Last error from a chat operation; cleared on next successful action. */
  error: string | null;
  /** True when persist has finished reading from localStorage. */
  hydrated: boolean;
  /** Set when boot completes (either with a session or with an error). */
  bootDone: boolean;
  /** Block IDs that have been interacted with — dims/disables them. */
  answeredBlockIds: string[];

  setActive: (session: GatewaySession | null) => void;
  setMessages: (messages: GatewayMessage[]) => void;
  setStreaming: (v: boolean) => void;
  setStreamId: (id: string | null) => void;
  appendLocalMessage: (m: GatewayMessage) => void;
  updateMessage: (where: (m: GatewayMessage) => boolean, patch: Partial<GatewayMessage>) => void;
  appendToken: (text: string) => void;
  appendReasoning: (text: string) => void;
  appendToolCall: (call: ToolCallRecord) => void;
  completeToolCall: (name: string, result: unknown) => void;
  setUiBlocks: (blocks: import('../schemas/blocks.server').ServerBlock[]) => void;
  setDraft: (text: string) => void;
  setError: (e: string | null) => void;
  setBootDone: (v: boolean) => void;
  setHydrated: (v: boolean) => void;
  markBlockAnswered: (blockId: string) => void;
  clearChat: () => Promise<void>;
  resetForUserSwitch: () => void;
}

const STORAGE_KEY = 'panel-v2-session';
export const useSessionStore = create<SessionStoreState>()(
  persist(
    (set, get) => ({
      session: null,
      messages: [],
      isStreaming: false,
      activeStreamId: null,
      draft: '',
      error: null,
      hydrated: false,
      bootDone: false,
      answeredBlockIds: [],

      setActive: (session) => {
        set({
          session,
          messages: session?.messages ?? [],
          isStreaming: false,
          activeStreamId: session?.active_stream_id ?? null,
          error: null,
        });
        // Bridge to the personal-assistant cron: write the active session id
        // to /tmp/panel-gateway-session-id so cron ticks (e.g. the harness-v3
        // per-30-min agent) can post back into the user's live chat. Without
        // this, cron messages land in whatever stale session id was last
        // written by the cron itself, never reaching the frontend.
        // We POST to BOTH the panel-side bridge (port 8790) and try the
        // gateway-side endpoint. The panel server (project-rumah) writes to
        // /tmp/panel-gateway-session-id, which post-to-panel-session.sh reads.
        try {
          if (typeof window !== 'undefined') {
            const writeBridges = (sid: string | null) => {
              const body = JSON.stringify({ session_id: sid });
              // 1) Panel-side bridge (project-rumah, port 8790). The canonical
              //    bridge — this is the one cron reads.
              void fetch('http://localhost:8790/panel-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
                keepalive: true,
                mode: 'cors',
              }).catch(() => { /* panel offline — cron falls back to local */ });
              // 2) Same-origin gateway bridge (if it exists). Best-effort.
              void fetch('/api/bridge/active-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
                keepalive: true,
              }).catch(() => { /* endpoint optional */ });
            };
            if (session?.session_id) {
              window.localStorage.setItem('hermes.active_session_id', session.session_id);
              writeBridges(session.session_id);
            } else {
              window.localStorage.removeItem('hermes.active_session_id');
              writeBridges(null);
            }
          }
        } catch {
          // localStorage / fetch failures must never break session activation.
        }
      },

      setMessages: (messages) => set({ messages }),

      setStreaming: (v) => set({ isStreaming: v }),
      setStreamId: (id) => set({ activeStreamId: id }),

      appendLocalMessage: (m) => set((s) => {
        if (m.client_msg_id) {
          const i = s.messages.findIndex((x) => x.client_msg_id === m.client_msg_id);
          if (i >= 0) {
            const next = s.messages.slice();
            next[i] = { ...next[i], ...m };
            return { messages: next };
          }
        }
        return { messages: [...s.messages, m] };
      }),

      updateMessage: (where, patch) => set((s) => ({
        messages: s.messages.map((m) => (where(m) ? { ...m, ...patch } : m)),
      })),

      appendToken: (text) => set((s) => {
        const last = s.messages[s.messages.length - 1];
        if (last && last.role === 'assistant' && last.streaming) {
          const next = s.messages.slice();
          next[next.length - 1] = { ...last, content: last.content + text };
          return { messages: next };
        }
        return {
          messages: [
            ...s.messages,
            { role: 'assistant', content: text, timestamp: Date.now() / 1000, streaming: true },
          ],
        };
      }),

      appendReasoning: (text) => set((s) => {
        const last = s.messages[s.messages.length - 1];
        if (last && last.role === 'assistant' && last.streaming) {
          const next = s.messages.slice();
          next[next.length - 1] = {
            ...last,
            reasoning: (last.reasoning ?? '') + text,
          };
          return { messages: next };
        }
        return {};
      }),

      appendToolCall: (call) => set((s) => {
        const last = s.messages[s.messages.length - 1];
        if (last && last.role === 'assistant' && last.streaming) {
          const next = s.messages.slice();
          const toolCalls = last.tool_calls ? [...last.tool_calls] : [];
          toolCalls.push(call);
          next[next.length - 1] = { ...last, tool_calls: toolCalls };
          return { messages: next };
        }
        return {};
      }),

      completeToolCall: (name, result) => set((s) => {
        const last = s.messages[s.messages.length - 1];
        if (last && last.role === 'assistant' && last.tool_calls) {
          const next = s.messages.slice();
          const toolCalls = last.tool_calls.map((tc) =>
            tc.name === name && tc.pending
              ? { ...tc, result, pending: false, completedAt: Date.now() / 1000 }
              : tc
          );
          next[next.length - 1] = { ...last, tool_calls: toolCalls };
          return { messages: next };
        }
        return {};
      }),

      setUiBlocks: (blocks) => set((s) => {
        const last = s.messages[s.messages.length - 1];
        if (last && last.role === 'assistant' && last.streaming) {
          const next = s.messages.slice();
          next[next.length - 1] = { ...last, ui_blocks: blocks };
          return { messages: next };
        }
        return {};
      }),

      setDraft: (text) => set({ draft: text }),
      setError: (e) => set({ error: e }),
      setBootDone: (v) => set({ bootDone: v }),
      setHydrated: (v) => set({ hydrated: v }),

      markBlockAnswered: (blockId) => {
        const cur = get().answeredBlockIds;
        if (cur.includes(blockId)) return;
        set({ answeredBlockIds: [...cur, blockId] });
      },

      /**
       * Clear all messages in the current session. The session ID is kept —
       * the fixed-session thread continues, just with an empty history.
       * The next cron tick will be the first message in the cleared thread.
       */
      clearChat: async () => {
        const cur = get();
        const sid = cur.session?.session_id;
        if (!sid) {
          set({ error: 'no session to clear' });
          return;
        }
        try {
          const res = await gateway.clearSession(sid);
          if (res.session?.session_id) {
            set({ session: { ...res.session, messages: [] }, messages: [] });
          } else if (cur.session?.session_id) {
            set({ session: { ...cur.session, messages: [] }, messages: [] });
          }
          set({
            isStreaming: false,
            activeStreamId: null,
            draft: '',
            error: null,
          });
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e) });
        }
      },

      /**
       * Reset session state when switching users.
       * Clears persisted session, messages, and draft so useChat
       * creates a fresh session for the new user.
       */
      resetForUserSwitch: () => {
        set({
          session: null,
          messages: [],
          draft: '',
          isStreaming: false,
          activeStreamId: null,
          error: null,
          bootDone: false,
          answeredBlockIds: [],
        });
        // Clear the session_id used by useChat's resolveSessionId.
        // Do NOT remove the persist store key — that breaks zustand's
        // onRehydrateStorage callback, leaving `hydrated` false forever.
        localStorage.removeItem('nalaris-session-id');
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        session: s.session,
        messages: s.messages,
        draft: s.draft,
      }),
      // Flip `hydrated` true once localStorage has been read.
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);

/** Merge server messages into local, preserving local-only fields. */
export function reconcileMessages(local: GatewayMessage[], server: GatewayMessage[]): GatewayMessage[] {
  if (!local.length) return server.map((m) => ({ ...m, streaming: false, ...reExtractBlocks(m.content, m.ui_blocks) }));

  // Match server messages with local ones to preserve client metadata.
  // Prefer matching by client_msg_id (optimistic bubbles) because the server
  // may round timestamps differently, causing timestamp-only matching to miss.
  const matchedLocal = new Set<number>();
    const result = server.map((sm) => {
      const lmIdx = local.findIndex((m) => {
        if (m.client_msg_id && sm.client_msg_id) return m.client_msg_id === sm.client_msg_id;
        return m.role === sm.role && Math.abs(m.timestamp - sm.timestamp) < 0.01;
      });
      const lm = lmIdx >= 0 ? local[lmIdx] : undefined;
      if (lmIdx >= 0) matchedLocal.add(lmIdx);

      const extracted = reExtractBlocks(sm.content, lm?.ui_blocks);
      const merged: GatewayMessage = {
        ...sm,
        streaming: false,
        ...extracted,
      };

      // Preserve local-only metadata the gateway does not store:
      // reasoning and tool_calls were captured live from SSE. If the server
      // copy lacks them, keep the local ones so the post-turn inspector still
      // shows what the agent did during the turn.
      if (!merged.reasoning?.trim() && lm?.reasoning?.trim()) {
        merged.reasoning = lm.reasoning;
      }
      if ((!merged.tool_calls || merged.tool_calls.length === 0) && lm?.tool_calls && lm.tool_calls.length > 0) {
        merged.tool_calls = lm.tool_calls;
      }
      if (lm?.client_msg_id && !merged.client_msg_id) {
        merged.client_msg_id = lm.client_msg_id;
      }
      return merged;
    });

  // Preserve local-only messages that the server hasn't returned yet:
  // 1. User messages with client_msg_id (optimistic, not yet persisted)
  // 2. Streaming assistant messages (actively being built)
  for (let i = 0; i < local.length; i++) {
    if (matchedLocal.has(i)) continue;
    const m = local[i];
    if (m.client_msg_id && m.role === 'user') {
      // Optimistic user message — server doesn't have it yet. Keep it.
      result.push({ ...m, streaming: false });
    } else if (m.role === 'assistant') {
      // Local assistant message not yet on server — keep it.
      // Covers the race where `done` fired (streaming=false) but the
      // bridge hasn't stored the message yet. Without this, the message
      // vanishes on the next reconcile.
      result.push({ ...m, streaming: false });
    }
  }

  // Sort by timestamp so ordering is consistent.
  result.sort((a, b) => a.timestamp - b.timestamp);
  return result;
}

/**
 * If the server message content still contains [[block:...]] fences (because
 * the server stores raw LLM output), extract the blocks and strip the fences
 * from the visible text. If `existingBlocks` are present (from the streaming
 * parser), prefer those — they were extracted in real-time.
 */
function reExtractBlocks(content: string | undefined, existingBlocks?: ServerBlock[]): { content?: string; ui_blocks?: ServerBlock[] } {
  if (!content) return {};
  // Strip [REMINDER:...] and [UI BLOCK FORMAT]...[END UI BLOCK FORMAT] prefixes.
  // These are LLM instructions stored in the message — they contain example
  // [[block:...]] fences that should NOT be extracted as real blocks.
  let cleaned = content;
  const lines = cleaned.split('\n');
  const filtered: string[] = [];
  let skip = false;
  for (const line of lines) {
    if (line.startsWith('[REMINDER:')) { skip = true; continue; }
    if (line.startsWith('[UI BLOCK FORMAT]')) { skip = true; continue; }
    if (skip && line.startsWith('[END UI BLOCK FORMAT]')) { skip = false; continue; }
    if (skip) continue;
    filtered.push(line);
  }
  cleaned = filtered.join('\n');
  if (existingBlocks && existingBlocks.length > 0) {
    const { text: stripped } = extractFences(cleaned);
    if (stripped !== cleaned) return { content: stripped, ui_blocks: existingBlocks };
    return { ui_blocks: existingBlocks };
  }
  const { text, blocks } = extractFences(cleaned);
  if (blocks.length > 0) return { content: text, ui_blocks: blocks };
  return {};
}

/** Remove all [[block:...]] fences from text. Uses bracket-depth scan
 *  because JSON inside fences can contain `]]` (nested arrays). */
export function stripInlineFences(text: string): string {
  let result = '';
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf('[[block:', i);
    if (start === -1) {
      result += text.slice(i);
      break;
    }
    result += text.slice(i, start);
    const after = start + '[[block:'.length;
    const end = findFenceEnd(text, after);
    if (end === -1) {
      result += text.slice(start);
      break;
    }
    i = end + 2;
  }
  return result;
}

/** Extract [[block:type:{json}]] fences into ServerBlock objects. */
export function extractInlineBlocks(text: string): { text: string; blocks: ServerBlock[] } {
  const blocks: ServerBlock[] = [];
  let cleaned = '';
  let i = 0;
  let idx = 0;

  while (i < text.length) {
    const start = text.indexOf('[[block:', i);
    if (start === -1) {
      cleaned += text.slice(i);
      break;
    }
    cleaned += text.slice(i, start);
    const after = start + '[[block:'.length;
    const end = findFenceEnd(text, after);
    if (end === -1) {
      cleaned += text.slice(start);
      break;
    }
    const inner = text.slice(after, end);
    const colon = inner.indexOf(':');
    if (colon !== -1) {
      const type = inner.slice(0, colon).trim();
      const jsonStr = inner.slice(colon + 1).trim();
      try {
        const data = JSON.parse(jsonStr);
        if (typeof data === 'object' && data !== null) {
          idx += 1;
          blocks.push({
            id: `recon-${Date.now().toString(36)}-${idx}`,
            type,
            weight: 50,
            data,
          } as ServerBlock);
        }
      } catch { /* bad JSON — leave as text */ }
    }
    i = end + 2;
  }

  return { text: cleaned, blocks };
}

/**
 * Find the index of the first `]` of the `]]` terminator that ends
 * an inline block fence. Returns -1 if no terminator is found.
 *
 * Scans the body treating it as JSON-like: tracks string state (with
 * escapes), bracket depth ({ and [), and looks for a `]]` sequence at
 * depth <= 0 (i.e., outside all nested brackets).
 */
function findFenceEnd(text: string, bodyStart: number): number {
  let pos = bodyStart;
  let inString = false;
  let escape = false;
  let depth = 0;
  while (pos < text.length) {
    const ch = text[pos];
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
      if (ch === ']' && text[pos + 1] === ']' && depth <= 0) {
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
