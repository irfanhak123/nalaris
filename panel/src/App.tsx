/**
 * App — Nalaris personal assistant panel.
 *
 * User management flow:
 *   1. Fetch users from gateway
 *   2. No users -> UserOnboarding (first launch)
 *   3. Users exist, no active -> UserPicker
 *   4. Active user, not onboarded -> UserOnboarding
 *   5. Active user, onboarded -> main chat UI
 *
 * ?demo=1 — injects sample blocks (no gateway needed).
 */

import { useState, useEffect } from 'react';
import { Stream } from './components/stream/Stream';
import { ChatInput } from './components/chat/ChatInput';
import { Header } from './components/shell/Header';
import { UserOnboarding } from './components/user/UserOnboarding';
import { UserPicker } from './components/user/UserPicker';
import { useTheme, useAutoFollow } from './lib/theme';
import { useSessionStore } from './stores/sessionStore';
import { useUserStore } from './stores/userStore';
import { demoBlocks } from './lib/demo-blocks';

type Screen = 'loading' | 'onboarding' | 'picker' | 'chat' | 'add-user';

export default function App() {
  const [mode] = useTheme();
  useAutoFollow(mode);
  const [screen, setScreen] = useState<Screen>('loading');

  const { users, activeUser, usersLoaded, fetchUsers, setActiveUser } = useUserStore();
  const resetForUserSwitch = useSessionStore((s) => s.resetForUserSwitch);

  // Boot: fetch users on mount
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Determine screen based on state
  useEffect(() => {
    if (!usersLoaded) {
      setScreen('loading');
      return;
    }

    if (users.length === 0) {
      // No users exist -> first-time onboarding
      setScreen('onboarding');
      return;
    }

    if (!activeUser) {
      // Users exist but none selected -> picker
      setScreen('picker');
      return;
    }

    if (!activeUser.onboarded) {
      // Active user needs onboarding
      setScreen('onboarding');
      return;
    }

    // All good -> show chat
    setScreen('chat');
  }, [usersLoaded, users, activeUser]);

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

  // Handler: user completed onboarding
  const handleOnboardingComplete = () => {
    fetchUsers();
  };

  // Handler: select user from picker
  const handleSelectUser = (userId: string) => {
    const user = users.find(u => u.user_id === userId);
    if (user) {
      // Reset session so useChat creates a fresh one for this user
      resetForUserSwitch();
      setActiveUser(user);
    }
  };

  // Handler: switch user from header
  const handleSwitchToPicker = () => {
    resetForUserSwitch();
    setActiveUser(null);
    setScreen('picker');
  };

  // Handler: add new user from header
  const handleAddUser = () => {
    resetForUserSwitch();
    setScreen('add-user');
  };

  // Loading state
  if (screen === 'loading') {
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

  // Onboarding (first launch or new user)
  if (screen === 'onboarding') {
    return (
      <UserOnboarding onComplete={handleOnboardingComplete} />
    );
  }

  // User picker
  if (screen === 'picker') {
    return (
      <UserPicker
        onSelect={handleSelectUser}
        onAddNew={() => setScreen('add-user')}
      />
    );
  }

  // Add new user (from picker or switcher)
  if (screen === 'add-user') {
    return (
      <UserOnboarding onComplete={handleOnboardingComplete} />
    );
  }

  // Main chat UI
  return (
    <div className="app-shell">
      <Header
        onAddUser={handleAddUser}
        onSwitchToPicker={handleSwitchToPicker}
      />
      <main className="main">
        <Stream />
        <ChatInput />
      </main>
    </div>
  );
}
