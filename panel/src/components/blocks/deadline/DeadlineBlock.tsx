import { useEffect, useState } from 'react';
import type { ServerBlock } from '../../../schemas/blocks.server';
import { fmtRelativeFuture } from '../../../lib/utils';

interface DeadlineData {
  name?: string;
  raw_date?: string;
  target?: string;
}

export function DeadlineBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as DeadlineData;
  const date = d.target ? new Date(d.target) : (d.raw_date ? new Date(d.raw_date) : null);

  const [rel, setRel] = useState<{ text: string; overdue: boolean } | null>(null);

  useEffect(() => {
    if (!date) return;
    const tick = () => setRel(fmtRelativeFuture(date));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [date]);

  return (
    <div className={`block deadline ${rel?.overdue ? 'overdue' : ''}`}>
      <div className="name">{d.name}</div>
      <div className="when">{d.raw_date}</div>
      {rel ? <div className="rel">{rel.text}</div> : null}
    </div>
  );
}
