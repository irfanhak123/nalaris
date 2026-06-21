import type { ServerBlock } from '../../../schemas/blocks.server';
import { BlockRenderer } from '../index';

interface SectionData {
  title?: string;
  meta?: string;
  body?: string | ServerBlock;
}

function isBlock(v: unknown): v is ServerBlock {
  return typeof v === 'object' && v !== null && typeof (v as ServerBlock).type === 'string';
}

export function SectionBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as SectionData;
  return (
    <div className="block section">
      <div className="head">
        <h3>{d.title}</h3>
        {d.meta ? <div className="meta">{d.meta}</div> : null}
      </div>
      {typeof d.body === 'string'
        ? <div>{d.body}</div>
        : isBlock(d.body)
          ? <BlockRenderer block={d.body} />
          : null}
    </div>
  );
}