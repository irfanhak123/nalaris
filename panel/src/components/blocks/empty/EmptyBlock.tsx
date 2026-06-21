import type { ServerBlock } from '../../../schemas/blocks.server';

interface EmptyData { title?: string; sub?: string; }

export function EmptyBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as EmptyData;
  return (
    <div className="block empty">
      <div className="ic" />
      {d.title ? <div className="t">{d.title}</div> : null}
      {d.sub ? <div className="s">{d.sub}</div> : null}
    </div>
  );
}