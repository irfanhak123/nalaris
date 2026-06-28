import type { ServerBlock } from '../../../schemas/blocks.server';

export function DividerBlock({ block }: { block: ServerBlock }) {
  if (!block.data.label) {
    return <hr className="div" />;
  }
  return (
    <div className="div-labeled">
      <hr className="div" />
      <span className="div-label">{block.data.label as string}</span>
      <hr className="div" />
    </div>
  );
}
