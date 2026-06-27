/**
 * Header — brand + clock + theme toggle + user switcher + clear chat.
 */

import { useEffect, useState } from 'react';
import { fmtTime, fmtDayShort } from '../../lib/utils';
import { ThemeToggle } from './ThemeToggle';
import { UserSwitcher } from '../user/UserSwitcher';
import { useSessionStore } from '../../stores/sessionStore';
import { useUserStore } from '../../stores/userStore';

export function Header({ onAddUser, onSwitchToPicker }: {
  onAddUser: () => void;
  onSwitchToPicker: () => void;
}) {
  const [now, setNow] = useState(() => new Date());
  const [confirming, setConfirming] = useState(false);
  const clearChat = useSessionStore((s) => s.clearChat);
  const messages = useSessionStore((s) => s.messages);
  const activeUser = useUserStore((s) => s.activeUser);

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
        {activeUser && (
          <>
            <span className="divider">·</span>
            <span className="user-label">{activeUser.name}</span>
          </>
        )}
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
        {activeUser && (
          <UserSwitcher
            onAddNew={onAddUser}
            onSwitchToPicker={onSwitchToPicker}
          />
        )}
      </div>
    </header>
  );
}
