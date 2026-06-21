import type { ServerBlock } from '../../../schemas/blocks.server';

export function CalendarRowBlock({ block }: { block: ServerBlock }) {
  return (
    <div className="block calday">
      <div className="row">
        <div className="t">{block.data.time as string}</div>
        <div className="ev">{block.data.title as string}</div>
      </div>
    </div>
  );
}
