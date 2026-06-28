import { useEffect, useState } from 'react';
import type { ServerBlock } from '../../../schemas/blocks.server';
import { fmtCountdown, fmtRelativeFuture } from '../../../lib/utils';

interface CountdownData {
  label?: string;
  time?: string;
  target?: string;
  sub?: string;
  urgency?: 'high' | 'med' | 'low';
}

export function CountdownBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as CountdownData;
  const urgency = d.urgency === 'high' || d.urgency === 'med' || d.urgency === 'low' ? d.urgency : 'med';

  const [display, setDisplay] = useState(d.time ?? (d.target ? fmtCountdown(new Date(d.target).getTime() - Date.now()) : '--'));
  const [sub, setSub] = useState(d.sub);

  useEffect(() => {
    if (!d.target) return;
    const tick = () => {
      const target = new Date(d.target!);
      const { text, overdue } = fmtRelativeFuture(target);
      setDisplay(fmtCountdown(target.getTime() - Date.now()));
      setSub(overdue ? text : d.sub ?? text);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [d.target, d.sub]);

  return (
    <div className={`block countdown ${urgency}`}>
      {d.label ? <div className="label">{d.label}</div> : null}
      <div className="time">{display}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}