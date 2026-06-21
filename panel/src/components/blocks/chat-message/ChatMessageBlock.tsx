import type { ServerBlock } from '../../../schemas/blocks.server';

export function ChatMessageBlock({ block }: { block: ServerBlock }) {
  const html = (block.data.text as string) || '';
  return (
    <div className="block chat-msg" dangerouslySetInnerHTML={{ __html: html }} />
  );
}