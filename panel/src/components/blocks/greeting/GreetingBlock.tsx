import type { ServerBlock } from '../../../schemas/blocks.server';

export function GreetingBlock({ block }: { block: ServerBlock }) {
  return (
    <div className="block greeting">
      <h2>{block.data.text as string}</h2>
      {block.data.sub ? (
        <div className="sub">{block.data.sub as string}</div>
      ) : null}
    </div>
  );
}
