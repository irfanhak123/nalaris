/**
 * components/user/UserPicker.tsx — user selection screen.
 *
 * Shown when users exist but no active user is selected.
 * Displays all users as clickable cards.
 */

import { useUserStore } from '../../stores/userStore';

export function UserPicker({ onSelect, onAddNew }: {
  onSelect: (userId: string) => void;
  onAddNew: () => void;
}) {
  const { users, loading } = useUserStore();

  return (
    <div className="user-picker">
      <div className="user-picker-card">
        <div className="user-picker-brand">
          <h1>Nalaris</h1>
          <p>Who's using the assistant?</p>
        </div>

        <div className="user-picker-list">
          {users.map((user) => (
            <button
              key={user.user_id}
              className="user-picker-item"
              onClick={() => onSelect(user.user_id)}
              disabled={loading}
            >
              <div
                className="user-picker-avatar"
                style={{ backgroundColor: user.avatar_color }}
              >
                {user.avatar_emoji || user.name.charAt(0).toUpperCase()}
              </div>
              <span className="user-picker-name">{user.name}</span>
            </button>
          ))}

          <button
            className="user-picker-item add"
            onClick={onAddNew}
            disabled={loading}
          >
            <div className="user-picker-avatar add">
              <span>+</span>
            </div>
            <span className="user-picker-name">Add user</span>
          </button>
        </div>
      </div>
    </div>
  );
}
