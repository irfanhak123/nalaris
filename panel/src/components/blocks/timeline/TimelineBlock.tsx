import type { ServerBlock } from '../../../schemas/blocks.server';

interface TlEvent { t?: string; l?: string; passed?: boolean; }
interface TimelineData { events?: TlEvent[]; }

export function TimelineBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as TimelineData;
  return (
    <div className="block timeline">
      {(d.events ?? []).map((e, i) => (
        <div key={i} className={`ev${e.passed ? ' passed' : ''}`}>
          <div className="t">{e.t}</div>
          <div className="l">{e.l}</div>
        </div>
      ))}
    </div>
  );
}