/**
 * ChatInput — composer at the bottom, talks to the gateway.
 *
 * v1: one fixed session. Sends append an optimistic user bubble;
 * the response streams in via SSE. While streaming, the Send button
 * becomes a Stop button.
 *
 * Composer draft: persisted to the gateway on every change (debounced
 * 400ms) so an unfinished message survives a tab refresh.
 *
 * The composer is disabled until the panel finishes booting
 * (hydrated from localStorage + session resolved + history loaded).
 * Before that, sending would either 409 or fail with "no session yet".
 */

import { useEffect, useRef, useState } from 'react';
import { useChat } from '../../hooks/useChat';
import { useSessionStore } from '../../stores/sessionStore';
import { gateway } from '../../lib/gateway';

const DRAFT_SAVE_DELAY_MS = 400;

export function ChatInput() {
  const { isStreaming, sendMessage, cancel, session, error, bootDone } = useChat();
  const [value, setValue] = useState(useSessionStore.getState().draft);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-grow textarea up to 160px
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = '0';
    el.style.height = `${Math.min(160, el.scrollHeight)}px`;
  }, [value]);

  // Debounced draft save to the gateway
  useEffect(() => {
    if (!session?.session_id) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      gateway.saveDraft(session.session_id, value).catch(() => { /* best-effort */ });
    }, DRAFT_SAVE_DELAY_MS);
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, [value, session?.session_id]);

  const onSend = () => {
    if (!value.trim() || isStreaming || !bootDone) return;
    void sendMessage(value);
    setValue('');
  };

  const placeholder = isStreaming
    ? 'Streaming — press Stop to cancel'
    : !bootDone
      ? 'Booting…'
      : session
        ? 'Reply — Enter to send, Shift+Enter for newline'
        : 'Loading…';

  return (
    <div className="composer">
      <div className="composer-row">
        <textarea
          ref={taRef}
          className="composer-input"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            useSessionStore.getState().setDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          disabled={isStreaming || !bootDone}
          rows={1}
        />
        {isStreaming ? (
          <button
            className="composer-send"
            onClick={() => void cancel()}
            aria-label="Stop"
            style={{ background: 'var(--paper)', color: 'var(--ink)' }}
          >
            <span className="spinner" /> Stop
          </button>
        ) : (
          <button
            className="composer-send"
            onClick={onSend}
            disabled={!value.trim() || !bootDone}
            aria-label="Send"
            title={!bootDone ? 'Booting…' : undefined}
          >
            Send →
          </button>
        )}
      </div>
      {error ? (
        <div
          className="composer-hint"
          style={{ color: 'var(--danger)' }}
          role="alert"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
