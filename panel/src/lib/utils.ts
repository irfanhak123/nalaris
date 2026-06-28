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

/** Format milliseconds as a human countdown: "2d 4h 12m 30s". */
export function fmtCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** Format a future/past timestamp as relative text: "in 2h 5m" / "overdue by 3m". */
export function fmtRelativeFuture(target: Date | string, now: number = Date.now()): { text: string; overdue: boolean } {
  const t = typeof target === 'string' ? new Date(target) : target;
  const diff = t.getTime() - now;
  const overdue = diff < 0;
  const text = fmtCountdown(Math.abs(diff));
  return { text: overdue ? `overdue by ${text}` : `in ${text}`, overdue };
}
