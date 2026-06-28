/**
 * lib/gateway.ts — typed client for the Hermes gateway (hermes-webui :8787).
 *
 * The gateway is the canonical session/message store. The panel is one
 * of its consumers. v1 panel talks directly to the gateway for chat:
 * one fixed session, polled for new agent ticks, SSE-streamed for
 * active turns.
 *
 * v1 mode is "monolithic thread": no session picker, no new-session
 * button. The session_id is resolved from URL params, localStorage,
 * or generated on first visit; the same conversation is reused across
 * reloads. Cron ticks from the agent land in this session as assistant
 * messages. The user types into the same session.
 *
 * CORS: not needed in dev — Vite proxies /api to the gateway (see
 * vite.config.ts). In production the panel is served same-origin.
 * VITE_GATEWAY_BASE is empty by default (same-origin relative paths).
 */

const BASE = (import.meta.env.VITE_GATEWAY_BASE as string | undefined) || '';

// ---------------------------------------------------------------------------
// Session envelope
// ---------------------------------------------------------------------------

import type { ServerBlock } from './../schemas/blocks.server';

export interface ToolCallRecord {
  name: string;
  args?: unknown;
  result?: unknown;
  /** Timestamp when the tool call started (epoch seconds). */
  startedAt?: number;
  /** Timestamp when the tool call completed (epoch seconds). */
  completedAt?: number;
  /** True while the tool is still executing. */
  pending?: boolean;
}

/** Compact, scannable summary emitted with cron/assistant messages.
 *  Designed for smartwatch-sized surfaces and sticky "now" cards. */
export interface CronSummary {
  /** e.g. "14.30 · Focus block" — max ~30 chars. */
  headline: string;
  /** Single most important thing right now, max ~40 chars. */
  primary?: string;
  /** Next upcoming thing, max ~40 chars. */
  secondary?: string;
  /** Compact chips: habits / deadlines / energy. */
  status?: string;
}

export interface GatewayMessage {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  timestamp: number; // epoch seconds, float
  reasoning?: string;
  reasoning_content?: string;
  finish_reason?: string;
  /** Local-only. Used for optimistic UI reconciliation. */
  client_msg_id?: string;
  /** Set on assistant messages while the stream is in flight. */
  streaming?: boolean;
  /** Per-turn metadata the gateway returns. */
  _turnDuration?: number;
  _turnTps?: number;
  /** Tool calls made during this assistant turn (tracked from SSE events). */
  tool_calls?: ToolCallRecord[];
  /** Structured UI blocks extracted from the assistant's response. */
  ui_blocks?: ServerBlock[];
  /** Live phase of the assistant during an active SSE stream. */
  stream_phase?: 'waiting' | 'context' | 'thinking' | 'tool_use' | 'writing';
  /** Origin label, e.g. 'cron' for scheduled agent ticks. */
  source?: string;
  /** Short-form structured envelope. Used for notifications and sticky summary cards. */
  short_content?: CronSummary | string;
}

export interface GatewaySession {
  session_id: string;
  user_id?: string;
  title: string;
  manual_title?: boolean;
  workspace: string;
  model: string;
  model_provider?: string;
  profile: string;
  message_count: number;
  pinned: boolean;
  archived: boolean;
  created_at: number;
  updated_at: number;
  last_message_at: number;
  is_streaming?: boolean;
  has_pending_user_message?: boolean;
  active_stream_id?: string | null;
  pending_user_message?: string | null;
  messages?: GatewayMessage[];
  _messages_offset?: number;
  _messages_truncated?: boolean;
}

export interface GatewayUser {
  user_id: string;
  name: string;
  avatar_color: string;
  avatar_emoji?: string;
  onboarded: boolean;
  preferences: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

// ---------------------------------------------------------------------------
// SSE event types — the /api/chat/stream protocol
// ---------------------------------------------------------------------------

export type StreamEvent =
  | { type: 'context_status'; data: { session_id?: string; prefill?: Record<string, unknown> } }
  | { type: 'metering'; data: { session_id?: string; tps?: number; active?: number } }
  | { type: 'reasoning'; data: { text: string; session_id?: string } }
  | { type: 'token'; data: { text: string; session_id?: string } }
  | { type: 'title'; data: { title: string; session_id?: string } }
  | { type: 'title_status'; data: { status: string; session_id?: string } }
  | { type: 'tool'; data: { name?: string; args?: unknown } }
  | { type: 'tool_complete'; data: { name?: string; result?: unknown } }
  | { type: 'done'; data: Record<string, unknown> }
  | { type: 'stream_end'; data: { run_id?: string; status?: string } }
  | { type: 'alignment'; data: { alignment?: Record<string, unknown> } }
  | { type: 'error'; data: { error: string } };

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class GatewayError extends Error {
  status: number;
  body: string;
  extra?: Record<string, unknown>;
  constructor(message: string, status: number, body: string, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.body = body;
    this.extra = extra;
  }
}

// ---------------------------------------------------------------------------
// fetch wrapper
// ---------------------------------------------------------------------------

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new GatewayError(`GET ${path} ${res.status}`, res.status, await res.text());
  return (await res.json()) as T;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    let extra: Record<string, unknown> | undefined;
    try { extra = JSON.parse(text); } catch { /* not JSON */ }
    throw new GatewayError(`POST ${path} ${res.status}: ${text}`, res.status, text, extra);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const gateway = {
  baseUrl: BASE,

  // ── User API ──

  /** The single user (with alignment findings). */
  getMe: () =>
    get<{ user: GatewayUser }>('/api/me'),

  /** List all users. */
  listUsers: () =>
    get<{ users: GatewayUser[] }>('/api/users'),

  /** Create a new user. */
  createUser: (req: { name: string; avatar_color?: string; avatar_emoji?: string; preferences?: Record<string, unknown> }) =>
    post<{ user: GatewayUser }>('/api/users', req),

  /** Get a single user. */
  getUser: (userId: string) =>
    get<{ user: GatewayUser }>(`/api/users/${encodeURIComponent(userId)}`),

  /** Update a user. */
  updateUser: (userId: string, fields: Partial<Pick<GatewayUser, 'name' | 'avatar_color' | 'avatar_emoji' | 'onboarded' | 'preferences'>>) =>
    post<{ user: GatewayUser }>(`/api/users/${encodeURIComponent(userId)}`, fields),

  /** Mark user as onboarded. */
  markOnboarded: (userId: string) =>
    post<{ user: GatewayUser }>(`/api/users/${encodeURIComponent(userId)}/onboard`),

  /** Delete a user and all their sessions. */
  deleteUser: (userId: string) =>
    post<{ ok: boolean }>(`/api/users/${encodeURIComponent(userId)}/delete`),

  /** Get sessions for a specific user. */
  getUserSessions: (userId: string) =>
    get<{ sessions: GatewaySession[] }>(`/api/users/${encodeURIComponent(userId)}/sessions`),

  // ── Session API ──

  /** Read a session with full message history. */
  readSession: (sid: string) =>
    get<{ session: GatewaySession }>(`/api/session?session_id=${encodeURIComponent(sid)}&messages=1`),

  /** Create a new empty session. */
  newSession: (init: { workspace: string; profile?: string; title?: string; user_id?: string }) =>
    post<{ session: GatewaySession }>('/api/session/new', {
      workspace: init.workspace,
      profile: init.profile ?? 'default',
      title: init.title,
      user_id: init.user_id,
    }),

  /** Persist a composer draft (debounced on the client). */
  saveDraft: (sid: string, text: string) =>
    post<{ ok: boolean }>('/api/session/draft', { session_id: sid, text }),

  /** Clear all messages in a session. Session ID and metadata are kept.
   *  Useful for "clear chat" — wipes history without breaking the fixed-session thread. */
  clearSession: (sid: string) =>
    post<{ ok: boolean; session: GatewaySession }>('/api/session/clear', { session_id: sid }),

  /** Start a chat turn. Throws GatewayError(409) if the session is already streaming. */
  startChat: (req: {
    session_id: string;
    message: string;
    workspace?: string;
    profile?: string;
    client_msg_id?: string;
  }) =>
    post<{
      stream_id: string;
      session_id: string;
      turn_id?: string;
      pending_started_at?: number;
      title?: string;
      effective_model_provider?: string;
    }>('/api/chat/start', {
      workspace: req.workspace ?? ((import.meta.env.VITE_WORKSPACE as string | undefined) ?? 'workspace'),
      profile: req.profile ?? ((import.meta.env.VITE_PROFILE as string | undefined) ?? 'default'),
      ...req,
    }),

  /** Cancel an in-flight stream. Best-effort: 404 is fine (stream already done). */
  cancelChat: (streamId: string) =>
    post<{ ok: boolean }>('/api/chat/cancel', { stream_id: streamId }),

  /** Start an on-demand alignment conversation in an existing session.
   *  The agent opens with its first question; no synthetic user bubble. */
  startAlignment: (sessionId: string) =>
    post<{ stream_id: string; session_id: string; turn_id?: string; alignment?: boolean }>('/api/align', {
      session_id: sessionId,
      workspace: (import.meta.env.VITE_WORKSPACE as string | undefined) ?? 'workspace',
      profile: (import.meta.env.VITE_PROFILE as string | undefined) ?? 'default',
    }),

  // ── Web Push API ──

  /** Get the VAPID public key needed for PushManager.subscribe(). */
  getVapidPublicKey: () => get<{ public_key: string }>('/api/push/vapid-public-key'),

  /** Save a push subscription on the server. */
  subscribePush: (req: { subscription: PushSubscriptionJSON }) =>
    post<{ ok: boolean; subscription?: unknown }>('/api/push/subscribe', req),

  /** Remove a push subscription from the server. */
  unsubscribePush: (req: { endpoint: string }) =>
    post<{ ok: boolean; removed?: boolean }>('/api/push/unsubscribe', req),
};

// ---------------------------------------------------------------------------
// SSE parser — accepts a Response, returns an async iterator of events
// ---------------------------------------------------------------------------

export async function* parseSse(response: Response): AsyncGenerator<StreamEvent> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const event = parseOneSse(raw);
      if (event) yield event;
    }
  }

  if (buf.trim()) {
    const event = parseOneSse(buf);
    if (event) yield event;
  }
}

function parseOneSse(raw: string): StreamEvent | null {
  let evName = '';
  let dataStr = '';
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) evName = line.slice(6).trim();
    else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
  }
  if (!evName || !dataStr) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(dataStr); }
  catch { return null; }
  return { type: evName as StreamEvent['type'], data: parsed as Record<string, unknown> } as StreamEvent;
}
