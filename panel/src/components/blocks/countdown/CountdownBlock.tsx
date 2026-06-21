import type { ServerBlock } from '../../../schemas/blocks.server';

interface CountdownData {
  label?: string;
  time?: string;
  sub?: string;
  urgency?: 'high' | 'med' | 'low';
}

export function CountdownBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as CountdownData;
  const urgency = d.urgency === 'high' || d.urgency === 'med' || d.urgency === 'low' ? d.urgency : 'med';
  return (
    <div className={`block countdown ${urgency}`}>
      {d.label ? <div className="label">{d.label}</div> : null}
      <div className="time">{d.time}</div>
      {d.sub ? <div className="sub">{d.sub}</div> : null}
    </div>
  );
}