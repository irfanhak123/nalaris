/**
 * theme — dark / light / auto mode controller.
 *
 * The current mode is stored in localStorage under `rumah.theme`.
 * The *effective* theme (dark | light) is what's actually applied
 * to <html data-theme>. For "auto", we resolve the OS preference.
 *
 * Usage:
 *   - Mount <ThemeApplier /> once in App so the controller runs
 *     on the client and re-applies on OS preference changes.
 *   - Use `useTheme()` from any component to read/write the mode.
 *
 * The flash-prevention script in index.html does the *first*
 * paint with the correct theme. This module handles subsequent
 * updates, OS change events, and the React-side state.
 */

import { useEffect, useState, useCallback } from 'react';

export type ThemeMode = 'dark' | 'light' | 'auto';
export type EffectiveTheme = 'dark' | 'light';

const STORAGE_KEY = 'rumah.theme';

/** Read the stored mode, defaulting to 'auto' on first load. */
export function getStoredMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'dark' || v === 'light' || v === 'auto') return v;
  } catch {
    // localStorage may be blocked — fall through.
  }
  return 'auto';
}

/** Resolve "auto" against the current OS preference. */
export function resolveAuto(): EffectiveTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** Compute the effective theme for a given mode. */
export function effectiveTheme(mode: ThemeMode): EffectiveTheme {
  return mode === 'auto' ? resolveAuto() : mode;
}

/**
 * Apply the effective theme to <html data-theme>. Safe to call
 * before React mounts — the index.html inline script does the
 * initial paint. This is also safe to call from any component.
 */
export function applyTheme(mode: ThemeMode): void {
  const t = effectiveTheme(mode);
  document.documentElement.setAttribute('data-theme', t);
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // localStorage may be blocked — visual state still updates.
  }
  // Notify any subscribers (the hook listens via storage events
  // and custom events; see useTheme).
  window.dispatchEvent(new CustomEvent<ThemeMode>('rumah:theme', { detail: mode }));
}

/**
 * useTheme — subscribe to the current mode and get a setter.
 * Updates when the user clicks a toggle button or when another
 * tab changes the same key.
 */
export function useTheme(): [ThemeMode, (m: ThemeMode) => void] {
  const [mode, setMode] = useState<ThemeMode>(() => getStoredMode());

  useEffect(() => {
    function onTheme(e: Event) {
      const next = (e as CustomEvent<ThemeMode>).detail;
      if (next) setMode(next);
    }
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) {
        const next = getStoredMode();
        setMode(next);
        // Re-apply to mirror the new mode (in case a sibling
        // tab changed it; doesn't hurt locally).
        document.documentElement.setAttribute('data-theme', effectiveTheme(next));
      }
    }
    window.addEventListener('rumah:theme', onTheme);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('rumah:theme', onTheme);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const set = useCallback((next: ThemeMode) => {
    applyTheme(next);
    setMode(next);
  }, []);

  return [mode, set];
}

/**
 * useAutoFollow — in 'auto' mode, re-apply the theme when the
 * OS preference changes. Mount this once at the App level.
 */
export function useAutoFollow(mode: ThemeMode): void {
  useEffect(() => {
    if (mode !== 'auto' || typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => applyTheme('auto');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode]);
}
