import type { ServerBlock } from '../../../schemas/blocks.server';
import { useBlockAction } from '../../../hooks/useBlockAction';

interface PulseAction { id: string; label: string; kind: string; payload?: Record<string, unknown>; primary?: boolean; }
interface PulseData {
  when?: string;
  h?: string;
  body?: string;
  actions?: PulseAction[];
}

export function PulseCardBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as PulseData;
  const { sendAction, isStreaming } = useBlockAction();
  return (
    <div className="block pulse">
      {d.when ? <div className="when">{d.when}</div> : null}
      <div className="h">{d.h}</div>
      {d.body ? <div className="body">{d.body}</div> : null}
      {d.actions && d.actions.length ? (
        <div className="btnrow">
          {d.actions.map((a) => (
            <button
              key={a.id}
              className={`btn sm ${a.primary ? 'primary' : ''}`}
              disabled={isStreaming}
              onClick={() => sendAction({ kind: a.kind, payload: a.payload, label: a.label, block })}
            >
              {a.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
