import type { ServerBlock } from '../../../schemas/blocks.server';

export function DividerBlock({ block }: { block: ServerBlock }) {
  if (!block.data.label) {
    return <hr className="div" />;
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', margin: 'var(--s-2) 0' }}>
      <hr className="div" style={{ flex: 1, margin: 0 }} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-12)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--gray-4)' }}>{block.data.label as string}</span>
      <hr className="div" style={{ flex: 1, margin: 0 }} />
    </div>
  );
}
