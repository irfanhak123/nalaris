import { useState, useEffect } from 'react';

interface Profile {
  name: string;
  is_default?: boolean;
  is_active?: boolean;
  model?: string;
}

interface ProfileSelectorProps {
  onSelect: (profile: string) => void;
}

const STORAGE_KEY = 'nalaris-profile';

export function ProfileSelector({ onSelect }: ProfileSelectorProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch('/api/profiles')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.profiles)) {
          // Deduplicate by name
          const seen = new Set<string>();
          const unique = data.profiles.filter((p: Profile) => {
            if (seen.has(p.name)) return false;
            seen.add(p.name);
            return true;
          });
          setProfiles(unique);
        }
      })
      .catch(() => {
        setProfiles([]);
      });
  }, []);

  const handleSelect = (name: string) => {
    localStorage.setItem(STORAGE_KEY, name);
    onSelect(name);
  };

  const handleCreate = () => {
    const name = newName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (!name) return;
    localStorage.setItem(STORAGE_KEY, name);
    onSelect(name);
  };

  return (
    <div className="profile-selector">
      <div className="profile-container">
        <div className="profile-brand">
          <h1>Nalaris</h1>
          <p>Your personal AI assistant</p>
        </div>

        {profiles.length > 0 && (
          <div className="profile-section">
            <h2>Existing profiles</h2>
            <div className="profile-list">
              {profiles.map((p) => (
                <button
                  key={p.name}
                  className="profile-item"
                  onClick={() => handleSelect(p.name)}
                >
                  <span className="profile-item-name">{p.name}</span>
                  {p.model && <span className="profile-item-meta">{p.model}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="profile-section">
          <h2>{profiles.length > 0 ? 'Or create new' : 'Get started'}</h2>
          {creating ? (
            <div className="profile-create">
              <input
                type="text"
                placeholder="Profile name (e.g., personal, work)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
              <div className="profile-create-actions">
                <button className="btn primary" onClick={handleCreate} disabled={!newName.trim()}>
                  Create
                </button>
                <button className="btn ghost" onClick={() => setCreating(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button className="btn primary" onClick={() => setCreating(true)}>
              Create new profile
            </button>
          )}
        </div>

        <div className="profile-footer">
          <p>Powered by <a href="https://github.com/nousresearch/hermes-agent" target="_blank" rel="noopener">Hermes Agent</a></p>
        </div>
      </div>
    </div>
  );
}

export function getStoredProfile(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function clearStoredProfile(): void {
  localStorage.removeItem(STORAGE_KEY);
}
