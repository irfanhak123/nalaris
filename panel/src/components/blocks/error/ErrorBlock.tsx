import type { ServerBlock } from '../../../schemas/blocks.server';
import { useBlockAction } from '../../../hooks/useBlockAction';

interface ErrAction { id: string; label: string; kind: string; payload?: Record<string, unknown>; }
interface ErrorData { title?: string; body?: string; actions?: ErrAction[]; }

export function ErrorBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as ErrorData;
  const { sendAction, isStreaming } = useBlockAction();
  return (
    <div className="block callout danger">
      <div className="bar" />
      <div>
        <div className="title">{d.title || 'Error'}</div>
        {d.body ? <div className="body">{d.body}</div> : null}
        {d.actions && d.actions.length ? (
          <div className="actions">
            {d.actions.map((a) => (
              <button key={a.id} className="btn sm" disabled={isStreaming} onClick={() => sendAction({ kind: a.kind, payload: a.payload, label: a.label })}>
                {a.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
