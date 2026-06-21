import type { ServerBlock } from '../../../schemas/blocks.server';

interface HeadingData { level?: number; text?: string; }

export function HeadingBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as HeadingData;
  const lvl = Math.max(1, Math.min(5, Number(d.level) || 1));
  const Tag = (`h${lvl}`) as 'h1' | 'h2' | 'h3' | 'h4' | 'h5';
  return <Tag className="block heading">{d.text}</Tag>;
}