import type { ServerBlock } from '../../../schemas/blocks.server';
import { BlockRenderer } from '../index';

interface ColumnsData {
  items?: ServerBlock[];
  cols?: 2 | 3;
}

export function ColumnsBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as ColumnsData;
  const cols = d.cols === 3 ? 3 : 2;
  return (
    <div className={`block cols c-${cols}`}>
      {(d.items ?? []).map((item, i) => (
        <div className="col" key={item?.id ?? i}>
          {item ? <BlockRenderer block={item} /> : null}
        </div>
      ))}
    </div>
  );
}