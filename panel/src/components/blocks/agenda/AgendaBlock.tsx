import type { ServerBlock } from '../../../schemas/blocks.server';

interface AgendaEvent { title?: string; when?: string; }
interface AgendaDay { h?: string; events?: AgendaEvent[]; }
interface AgendaData { days?: AgendaDay[]; }

export function AgendaBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as AgendaData;
  return (
    <div className="block agenda">
      {(d.days ?? []).map((day, i) => (
        <div key={i} className="day">
          <div className="h">{day.h}</div>
          {(day.events ?? []).map((e, j) => (
            <div key={j} className="ev">
              <span>{e.title}</span>
              <span className="when">{e.when}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}