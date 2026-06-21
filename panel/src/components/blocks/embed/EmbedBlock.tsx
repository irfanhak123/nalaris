import type { ServerBlock } from '../../../schemas/blocks.server';

interface EmbedData { ic?: string; title?: string; sub?: string; href?: string; }

export function EmbedBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as EmbedData;
  const inner = (
    <>
      <div className="ic">{d.ic}</div>
      <div className="body">
        <div className="t">{d.title}</div>
        {d.sub ? <div className="s">{d.sub}</div> : null}
      </div>
    </>
  );
  return (
    <div className="block embed">
      {d.href ? (
        <a href={d.href} target="_blank" rel="noreferrer" style={{ display: 'contents' }}>{inner}</a>
      ) : (
        inner
      )}
    </div>
  );
}