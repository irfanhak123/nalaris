import type { ServerBlock } from '../../../schemas/blocks.server';

interface SpinnerData { label?: string; }

export function SpinnerBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as SpinnerData;
  return (
    <div className="block" style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
      <span className="spinner" aria-label="loading" />
      {d.label ? (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-12)', color: 'var(--gray-4)' }}>{d.label}</span>
      ) : null}
    </div>
  );
}