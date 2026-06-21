import type { ServerBlock } from '../../../schemas/blocks.server';

export function StatBlock({ block }: { block: ServerBlock }) {
  return (
    <div className="block stat">
      <div className="label">{block.data.label as string}</div>
      <div className="value">
        {block.data.value as string}
        {block.data.sub ? <span className="sub">{block.data.sub as string}</span> : null}
      </div>
    </div>
  );
}
