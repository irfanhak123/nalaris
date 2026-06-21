import type { ServerBlock } from '../../../schemas/blocks.server';

interface CalDayEvent {
  time?: string;
  title?: string;
  duration?: string | number;
  working?: boolean;
  location?: string;
  end?: string;
  note?: string;
}
interface CalDayData {
  date?: string;
  weekday?: string;
  day_name?: string;
  events?: CalDayEvent[];
}

export function CalendarDayBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as CalDayData;
  return (
    <div className="block calday">
      {(d.events ?? []).map((e, i) => (
        <div key={i} className={`row${e.working ? ' working' : ''}`}>
          <div className="t">{e.time}{e.end ? `–${e.end}` : ''}</div>
          <div className="ev">
            {e.title}
            {e.note ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-12)', color: 'var(--gray-4)', marginLeft: 'var(--s-2)' }}>{e.note}</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}