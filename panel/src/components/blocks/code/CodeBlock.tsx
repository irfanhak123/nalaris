import type { ServerBlock } from '../../../schemas/blocks.server';

interface CodeData { lang?: string; source?: string; }

export function CodeBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as CodeData;
  return <pre className="block code">{d.source ?? ''}</pre>;
}