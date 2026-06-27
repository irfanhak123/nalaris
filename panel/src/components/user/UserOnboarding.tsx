/**
 * components/user/UserOnboarding.tsx — first-time user setup.
 *
 * Shown when:
 *   - No users exist (first launch)
 *   - User clicked "Add user" from the switcher
 *
 * Flow:
 *   1. Enter name
 *   2. Pick avatar color
 *   3. Create user -> mark onboarded -> done
 */

import { useState } from 'react';
import { useUserStore } from '../../stores/userStore';

const AVATAR_COLORS = [
  '#4A90D9', '#E74C3C', '#2ECC71', '#F39C12',
  '#9B59B6', '#1ABC9C', '#E67E22', '#3498DB',
];

export function UserOnboarding({ onComplete }: { onComplete: () => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(AVATAR_COLORS[0]);
  const [step, setStep] = useState<'name' | 'color' | 'creating'>('name');
  const { createUser, markOnboarded, error } = useUserStore();

  const handleCreate = async () => {
    if (!name.trim()) return;
    setStep('creating');
    try {
      const user = await createUser(name.trim(), color);
      await markOnboarded(user.user_id);
      onComplete();
    } catch {
      setStep('name');
    }
  };

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <div className="onboarding-brand">
          <h1>Nalaris</h1>
          <p>Your personal AI assistant</p>
        </div>

        {step === 'name' && (
          <div className="onboarding-step">
            <h2>What should I call you?</h2>
            <input
              type="text"
              className="onboarding-input"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && setStep('color')}
              autoFocus
            />
            {error && <p className="onboarding-error">{error}</p>}
            <button
              className="onboarding-btn"
              onClick={() => name.trim() && setStep('color')}
              disabled={!name.trim()}
            >
              Continue
            </button>
          </div>
        )}

        {step === 'color' && (
          <div className="onboarding-step">
            <h2>Pick your color</h2>
            <div className="onboarding-colors">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  className={`onboarding-color ${c === color ? 'selected' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                  aria-label={`Select color ${c}`}
                />
              ))}
            </div>
            <div className="onboarding-preview">
              <div className="onboarding-avatar" style={{ backgroundColor: color }}>
                {name.trim().charAt(0).toUpperCase()}
              </div>
              <span>{name.trim()}</span>
            </div>
            <div className="onboarding-actions">
              <button className="onboarding-btn ghost" onClick={() => setStep('name')}>
                Back
              </button>
              <button className="onboarding-btn" onClick={handleCreate}>
                Let's go
              </button>
            </div>
          </div>
        )}

        {step === 'creating' && (
          <div className="onboarding-step">
            <div className="onboarding-spinner" />
            <p>Setting up your assistant...</p>
          </div>
        )}
      </div>
    </div>
  );
}
