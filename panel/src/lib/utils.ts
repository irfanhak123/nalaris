/**
 * lib/utils.ts — Pure utilities. No React, no DOM.
 */

import { type ClassValue, clsx } from './clsx';
import { twMerge } from './tw-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format a Date as `HH:MM` in the local timezone. */
export function fmtTime(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Format a Date as `Wed 18 Jun`. */
export function fmtDayShort(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short' });
}

/** "3s ago", "47s ago", "2m ago" — relative time, no deps. */
export function fmtRelative(ms: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ms);
  if (diff < 5000) return 'now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

/** Stable hash for a list of block IDs. Used for cheap dedupe. */
export function idSetHash(ids: ReadonlyArray<string>): string {
  return [...ids].sort().join('|');
}

/** Pause for `ms` milliseconds — small helper, no race conditions. */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
