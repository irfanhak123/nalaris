/**
 * App — Nalaris personal assistant panel.
 *
 * Single-user. Boot:
 *   1. Fetch the single user (GET /api/me).
 *   2. Show a loading brand while waiting.
 *   3. Show the main chat UI. Alignment (onboarding) is NOT a static form
 *      here — it is an agent-driven conversation the user can trigger any
 *      time from the header, and which auto-fires on first launch from
 *      useChat once the session is ready.
 *
 * ?demo=1 — injects sample blocks (no gateway needed).
 */

import { useEffect } from 'react';
import { Stream } from './components/stream/Stream';
import { ChatInput } from './components/chat/ChatInput';
import { Header } from './components/shell/Header';
import { useTheme, useAutoFollow } from './lib/theme';
import { useSessionStore } from './stores/sessionStore';
import { useUserStore } from './stores/userStore';
import { demoBlocks } from './lib/demo-blocks';

export default function App() {
  const [mode] = useTheme();
  useAutoFollow(mode);

  const { loaded, fetchMe } = useUserStore();

  // Boot: fetch the single user on mount
  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  // Demo mode: inject sample blocks after boot
  const bootDone = useSessionStore((s) => s.bootDone);
  const messages = useSessionStore((s) => s.messages);
  const setMessages = useSessionStore((s) => s.setMessages);

  useEffect(() => {
    const isDemo = new URL(window.location.href).searchParams.get('demo') === '1';
    if (!isDemo || !bootDone) return;

    const hasDemo = messages.some((m) =>
      m.ui_blocks?.some((b) => b.id.startsWith('demo-')),
    );
    if (hasDemo) return;

    const demoMsg = {
      role: 'assistant' as const,
      content: '',
      timestamp: Date.now() / 1000,
      ui_blocks: demoBlocks,
    };
    setMessages([...messages, demoMsg]);
  }, [bootDone, messages, setMessages]);

  // Loading state (user fetch in flight)
  if (!loaded) {
    return (
      <div className="onboarding">
        <div className="onboarding-card">
          <div className="onboarding-brand">
            <h1>Nalaris</h1>
            <p>Loading...</p>
          </div>
          <div className="onboarding-step">
            <div className="onboarding-spinner" />
          </div>
        </div>
      </div>
    );
  }

  // Main chat UI (single-user — no picker, no onboarding form)
  return (
    <div className="app-shell">
      <Header />
      <main className="main">
        <Stream />
        <ChatInput />
      </main>
    </div>
  );
}