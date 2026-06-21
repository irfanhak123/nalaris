import type { ServerBlock } from '../../../schemas/blocks.server';

interface FileCardData {
  ic?: string;
  title?: string;
  sub?: string;
  action?: { kind: string; payload?: Record<string, unknown>; label?: string };
}

export function FileCardBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as FileCardData;
  return (
    <div className="block filecard">
      <div className="ic">{d.ic}</div>
      <div className="body">
        <div className="t">{d.title}</div>
        {d.sub ? <div className="s">{d.sub}</div> : null}
      </div>
    </div>
  );
}