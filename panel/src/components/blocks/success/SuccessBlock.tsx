import type { ServerBlock } from '../../../schemas/blocks.server';

interface SuccessData { title?: string; body?: string; }

export function SuccessBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as SuccessData;
  return (
    <div className="block callout success">
      <div className="bar" />
      <div>
        <div className="title">{d.title || 'Done'}</div>
        {d.body ? <div className="body">{d.body}</div> : null}
      </div>
    </div>
  );
}