import type { ServerBlock } from '../../../schemas/blocks.server';

export function HighlightBlock({ block }: { block: ServerBlock }) {
  return (
    <div className="block highlight">
      <div className="text">{block.data.text as string}</div>
    </div>
  );
}
