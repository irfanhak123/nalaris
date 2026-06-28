import type { ServerBlock } from '../../../schemas/blocks.server';

export function CalendarDownBlock({ block }: { block: ServerBlock }) {
  return (
    <div className="block caldown">
      <div className="caldown-label">Calendar offline</div>
      <div className="caldown-note">{block.data.note as string}</div>
    </div>
  );
}
