import type { ServerBlock } from '../../../schemas/blocks.server';

export function QuoteBlock({ block }: { block: ServerBlock }) {
  return (
    <blockquote className="q">
      {block.data.text as string}
      {block.data.source ? <cite>— {block.data.source as string}</cite> : null}
    </blockquote>
  );
}
