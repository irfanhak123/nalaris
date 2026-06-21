import type { ServerBlock } from '../../../schemas/blocks.server';

interface SkeletonData { lines?: number; width?: string; }

export function SkeletonBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as SkeletonData;
  const lines = Math.max(1, Number(d.lines) || 1);
  return (
    <div className="block">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skel"
          style={{ height: '12px', marginBottom: i < lines - 1 ? 'var(--s-1)' : 0, width: d.width || '100%' }}
        />
      ))}
    </div>
  );
}