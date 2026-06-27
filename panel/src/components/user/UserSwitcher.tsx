/**
 * components/user/UserSwitcher.tsx — user switcher dropdown.
 *
 * Lives in the header. Shows current user avatar, opens a dropdown
 * to switch users or add a new one.
 */

import { useState, useRef, useEffect } from 'react';
import { useUserStore } from '../../stores/userStore';
import { useSessionStore } from '../../stores/sessionStore';

export function UserSwitcher({ onAddNew, onSwitchToPicker }: {
  onAddNew: () => void;
  onSwitchToPicker: () => void;
}) {
  const { activeUser, users, setActiveUser } = useUserStore();
  const resetForUserSwitch = useSessionStore((s) => s.resetForUserSwitch);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (!activeUser) return null;

  const otherUsers = users.filter(u => u.user_id !== activeUser.user_id);

  const handleSwitchUser = (user: typeof activeUser) => {
    resetForUserSwitch();
    setActiveUser(user);
    setOpen(false);
  };

  return (
    <div className="user-switcher" ref={ref}>
      <button
        className="user-switcher-trigger"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <div
          className="user-switcher-avatar"
          style={{ backgroundColor: activeUser.avatar_color }}
        >
          {activeUser.avatar_emoji || activeUser.name.charAt(0).toUpperCase()}
        </div>
      </button>

      {open && (
        <div className="user-switcher-dropdown">
          <div className="user-switcher-header">
            <div
              className="user-switcher-avatar large"
              style={{ backgroundColor: activeUser.avatar_color }}
            >
              {activeUser.avatar_emoji || activeUser.name.charAt(0).toUpperCase()}
            </div>
            <div className="user-switcher-info">
              <span className="user-switcher-name">{activeUser.name}</span>
              <span className="user-switcher-label">Current user</span>
            </div>
          </div>

          {otherUsers.length > 0 && (
            <div className="user-switcher-section">
              <span className="user-switcher-section-label">Switch to</span>
              {otherUsers.map((user) => (
                <button
                  key={user.user_id}
                  className="user-switcher-item"
                  onClick={() => handleSwitchUser(user)}
                >
                  <div
                    className="user-switcher-avatar small"
                    style={{ backgroundColor: user.avatar_color }}
                  >
                    {user.avatar_emoji || user.name.charAt(0).toUpperCase()}
                  </div>
                  <span>{user.name}</span>
                </button>
              ))}
            </div>
          )}

          <div className="user-switcher-section">
            <button
              className="user-switcher-item"
              onClick={() => {
                setOpen(false);
                onAddNew();
              }}
            >
              <div className="user-switcher-avatar small add">
                <span>+</span>
              </div>
              <span>Add user</span>
            </button>
          </div>

          <div className="user-switcher-section">
            <button
              className="user-switcher-item"
              onClick={() => {
                setOpen(false);
                onSwitchToPicker();
              }}
            >
              <span>Switch user</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
