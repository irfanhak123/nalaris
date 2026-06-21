import type { ServerBlock } from '../../../schemas/blocks.server';

interface StreakData {
  num?: number | string;
  label?: string;
  meta?: string;
  pips?: number[]; // 0 = off, 1 = on, -1 = broken
}

export function StreakBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as StreakData;
  return (
    <div className="block streak">
      <div className="num">{d.num}</div>
      <div className="meta">
        <div className="l">{d.label}</div>
        {d.meta ? <div className="m">{d.meta}</div> : null}
        {d.pips && d.pips.length ? (
          <div className="pips">
            {d.pips.map((p, i) => (
              <span key={i} className={p === 1 ? 'on' : p === -1 ? 'broken' : ''} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}