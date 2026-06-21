/**
 * Header — brand + clock + theme toggle + clear chat.
 */

import { useEffect, useState } from 'react';
import { fmtTime, fmtDayShort } from '../../lib/utils';
import { ThemeToggle } from './ThemeToggle';
import { useSessionStore } from '../../stores/sessionStore';

export function Header() {
  const [now, setNow] = useState(() => new Date());
  const [confirming, setConfirming] = useState(false);
  const clearChat = useSessionStore((s) => s.clearChat);
  const messages = useSessionStore((s) => s.messages);

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
      </div>
      <div className="right">
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