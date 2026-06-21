/**
 * Minimal clsx — small subset of the original. We don't need the full
 * feature set; the panel uses it for conditional className composition.
 */
export type ClassValue = string | number | null | false | undefined | ClassValue[] | Record<string, boolean | null | undefined>;

export function clsx(inputs: ClassValue[]): string {
  const out: string[] = [];
  for (const i of inputs) {
    if (!i) continue;
    if (typeof i === 'string' || typeof i === 'number') out.push(String(i));
    else if (Array.isArray(i)) out.push(clsx(i));
    else if (typeof i === 'object') {
      for (const k in i) if (i[k]) out.push(k);
    }
  }
  return out.join(' ');
}
