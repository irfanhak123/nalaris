/**
 * lib/api.ts — Typed fetch client for the FastAPI server.
 *
 * Chat-only: health check + chat send + block actions.
 * Dashboard endpoints (/state, /blocks, /write) removed — the panel
 * is now a pure chat client; cron delivers updates into the thread.
 */

import { ChatResponseSchema, type ActionEnvelope, type ChatResponse } from '../schemas/action';

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

/** Envelope for procedural-UI block actions (POST /chat/block-action). */
export interface BlockActionEnvelope {
  kind: string;
  target?: string;
  payload?: Record<string, unknown>;
  label?: string;
}

export class ApiError extends Error {
  status: number;
  body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function get<T>(path: string, schema: { parse: (v: unknown) => T }): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) throw new ApiError(`GET ${path} ${res.status}`, res.status, text);
  let json: unknown;
  try { json = JSON.parse(text); } catch (e) { throw new ApiError(`GET ${path} — non-JSON body`, res.status, text); }
  return schema.parse(json);
}

async function post<T>(path: string, body: unknown, schema: { parse: (v: unknown) => T }): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new ApiError(`POST ${path} ${res.status}`, res.status, text);
  let json: unknown;
  try { json = JSON.parse(text); } catch (e) { throw new ApiError(`POST ${path} — non-JSON body`, res.status, text); }
  return schema.parse(json);
}

export const api = {
  health: () => get<{ status: string; service: string; version: string }>('/health', {
    parse: (v) => v as { status: string; service: string; version: string },
  }),

  chat: (envelope: ActionEnvelope) => post<ChatResponse>('/chat', envelope, ChatResponseSchema),

  /** Procedural-UI block action round-trip (protocol §3.7). */
  blockAction: (envelope: BlockActionEnvelope) =>
    post<{ ok: boolean; error?: string | null }>('/chat/block-action', envelope, {
      parse: (v) => v as { ok: boolean; error?: string | null },
    }),
};
