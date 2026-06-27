/**
 * Header — brand + clock + theme toggle + re-align + clear chat.
 *
 * Single-user: no user switcher. "Re-align" triggers an on-demand
 * alignment conversation (the agent re-learns the user's goals, habits,
 * and current situation). requestAlignment() bumps a token the useChat
 * hook watches to start the turn.
 */

import { useEffect, useState } from 'react';
import { fmtTime, fmtDayShort } from '../../lib/utils';
import { ThemeToggle } from './ThemeToggle';
import { useSessionStore } from '../../stores/sessionStore';
import { useUserStore } from '../../stores/userStore';

export function Header() {
  const [now, setNow] = useState(() => new Date());
  const [confirming, setConfirming] = useState(false);
  const clearChat = useSessionStore((s) => s.clearChat);
  const requestAlignment = useSessionStore((s) => s.requestAlignment);
  const isStreaming = useSessionStore((s) => s.isStreaming);
  const messages = useSessionStore((s) => s.messages);
  const me = useUserStore((s) => s.me);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Auto-cancel the confirm if the user moves away
  useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(id);
  }, [confirming]);

  const handleClear = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    await clearChat();
    setConfirming(false);
  };

  const canClear = messages.length > 0;

  return (
    <header className="header">
      <div className="left">
        <span className="brand">Project Rumah</span>
        <span className="divider">·</span>
        <span className="when">{fmtDayShort(now)} {fmtTime(now)}</span>
        {me?.name && (
          <>
            <span className="divider">·</span>
            <span className="user-label">{me.name}</span>
          </>
        )}
      </div>
      <div className="right">
        <button
          className="realign-btn"
          onClick={requestAlignment}
          disabled={isStreaming}
          title="Re-run alignment: let the agent re-learn your goals, habits, and what's going on"
        >
          re-align
        </button>
        {canClear ? (
          <button
            className={`clear-btn${confirming ? ' confirming' : ''}`}
            onClick={handleClear}
            title={confirming ? 'click again to confirm' : 'clear chat history'}
          >
            {confirming ? 'confirm clear?' : 'clear chat'}
          </button>
        ) : null}
        <ThemeToggle />
      </div>
    </header>
  );
}