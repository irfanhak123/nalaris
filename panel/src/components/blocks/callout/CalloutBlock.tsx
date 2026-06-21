import type { ServerBlock } from '../../../schemas/blocks.server';

export function CalloutBlock({ block }: { block: ServerBlock }) {
  const d = block.data as Record<string, unknown>;
  // Accept both "variant" (design-system schema) and "tone" (LLM sometimes uses this)
  const variantRaw = (d.variant ?? d.tone ?? d.severity ?? 'info') as string;
  const variant = ['info', 'warning', 'success', 'danger'].includes(variantRaw)
    ? variantRaw
    : 'info';
  const title = (d.title as string) ?? '';
  const body = (d.body as string) ?? '';
  return (
    <div className={`block callout ${variant}`}>
      <div className="bar" />
      <div>
        {title ? <div className="title">{title}</div> : null}
        {body ? <div className="body">{body}</div> : null}
      </div>
    </div>
  );
}
