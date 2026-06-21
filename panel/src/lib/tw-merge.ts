/**
 * Minimal tailwind-merge — for the v1 panel, we don't have Tailwind. This
 * is a no-op passthrough that exposes the same API as tailwind-merge so
 * utils.ts can call it without conditionals. If Tailwind is added later,
 * swap this file's implementation for the real `tailwind-merge` package.
 */
export function twMerge(input: string): string {
  return input;
}
