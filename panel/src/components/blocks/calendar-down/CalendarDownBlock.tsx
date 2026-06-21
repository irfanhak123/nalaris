import type { ServerBlock } from '../../../schemas/blocks.server';

export function CalendarDownBlock({ block }: { block: ServerBlock }) {
  return (
    <div className="block caldown">
      <div className="label" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-12)', color: 'var(--gray-4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--s-1)' }}>Calendar offline</div>
      <div>{block.data.note as string}</div>
    </div>
  );
}
