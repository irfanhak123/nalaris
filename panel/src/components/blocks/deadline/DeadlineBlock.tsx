import type { ServerBlock } from '../../../schemas/blocks.server';

export function DeadlineBlock({ block }: { block: ServerBlock }) {
  return (
    <div className="block deadline">
      <div className="name">{block.data.name as string}</div>
      {block.data.raw_date ? <div className="when">{block.data.raw_date as string}</div> : null}
    </div>
  );
}
