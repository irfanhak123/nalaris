/**
 * ThemeToggle — 3-button segmented control for dark / light / auto.
 * Reads + writes the current mode via the theme module.
 */

import { useTheme, type ThemeMode } from '../../lib/theme';

const OPTIONS: { value: ThemeMode; label: string; title: string }[] = [
  { value: 'dark',  label: 'Dark',  title: 'Dark theme' },
  { value: 'light', label: 'Light', title: 'Light theme' },
  { value: 'auto',  label: 'Auto',  title: 'Follow system preference' },
];

export function ThemeToggle() {
  const [mode, setMode] = useTheme();

  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          title={opt.title}
          aria-pressed={mode === opt.value}
          onClick={() => setMode(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
