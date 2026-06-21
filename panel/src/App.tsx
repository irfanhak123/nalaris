/**
 * App — Nalaris personal assistant panel.
 * Shows profile selector if no profile selected, then connects to gateway.
 * ?demo=1 — injects sample blocks (no gateway needed).
 */

import { useState, useEffect } from 'react';
import { Stream } from './components/stream/Stream';
import { ChatInput } from './components/chat/ChatInput';
import { Header } from './components/shell/Header';
import { ProfileSelector, getStoredProfile } from './components/profile/ProfileSelector';
import { useTheme, useAutoFollow } from './lib/theme';
import { useSessionStore } from './stores/sessionStore';
import { demoBlocks } from './lib/demo-blocks';

export default function App() {
  const [mode] = useTheme();
  useAutoFollow(mode);
  const [profile, setProfile] = useState<string | null>(getStoredProfile);

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

  // Show profile selector if no profile selected
  if (!profile) {
    return <ProfileSelector onSelect={setProfile} />;
  }

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
