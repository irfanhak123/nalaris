/**
 * Stream — the chat thread. One fixed session, polled every 30s.
 * Cron ticks and user messages render inline. Blocks from the LLM
 * (questions, callouts, countdowns) render through ChatMessage.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { useChat } from '../../hooks/useChat';
import { ChatMessage } from './ChatMessage';

const INITIAL_MSG_COUNT = 20;
const LOAD_MORE_COUNT = 20;

export function Stream() {
  const { messages, bootDone } = useChat();
  const draft = useSessionStore((s) => s.draft);
  const isStreaming = useSessionStore((s) => s.isStreaming);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_MSG_COUNT);

  // Scroll to bottom helper — double rAF for reliable layout
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    });
  }, []);

  // Auto-scroll when: new message added, or streaming content updates
  const lastMsg = messages[messages.length - 1];
  const lastMsgContent = lastMsg?.content?.length ?? 0;
  const lastMsgBlocks = lastMsg?.ui_blocks?.length ?? 0;

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, lastMsgContent, lastMsgBlocks, isStreaming, scrollToBottom]);

  // Reset visible count when messages change significantly (e.g. clear chat)
  useEffect(() => {
    if (messages.length <= INITIAL_MSG_COUNT) {
      setVisibleCount(INITIAL_MSG_COUNT);
    }
  }, [messages.length]);

  const hasContent = messages.length > 0;
  const showLoadEarlier = messages.length > visibleCount;
  const visibleMessages = messages.slice(-visibleCount);

  return (
    <div className="stream" ref={scrollRef}>
      <div className="stream-inner">
        {!bootDone ? (
          <EmptyState loading error={null} />
        ) : !hasContent ? (
          <EmptyState loading={false} error={null} />
        ) : (
          <>
            {showLoadEarlier ? (
              <div className="stream-load-more">
                <button
                  className="stream-load-btn"
                  onClick={() => {
                    setVisibleCount((c) => Math.min(c + LOAD_MORE_COUNT, messages.length));
                  }}
                >
                  Load earlier ({messages.length - visibleCount} more)
                </button>
              </div>
            ) : null}
            {visibleMessages.map((m, i) => (
              <div key={`${m.role}-${m.timestamp}-${i}`} className="block-enter">
                <ChatMessage item={m} />
              </div>
            ))}
            {draft && draft.trim() ? (
              <div className="cm cm-user">
                <div className="cm-bubble">{draft}</div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) {
    return (
      <div className="empty">
        <span className="spinner" />
        <div className="t">Loading conversation</div>
        <div className="s">Connecting to the agent…</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="empty">
        <div className="ic" />
        <div className="t">Connection lost</div>
        <div className="s">{error}</div>
        <div className="s" style={{ marginTop: 'var(--s-2)' }}>Reconnecting…</div>
      </div>
    );
  }
  return (
    <div className="empty">
      <div className="t">Waiting for the agent</div>
      <div className="s">The next cron tick will surface updates here. Or type a message below.</div>
    </div>
  );
}
