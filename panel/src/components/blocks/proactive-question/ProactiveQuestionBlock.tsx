import type { ServerBlock } from '../../../schemas/blocks.server';
import { useBlockAction, blockContentKey } from '../../../hooks/useBlockAction';
import { useSessionStore } from '../../../stores/sessionStore';

interface PQAction { id: string; label: string; kind: string; payload?: Record<string, unknown>; primary?: boolean; }
interface ProactiveQuestionData {
  lbl?: string;
  q?: string;
  actions?: PQAction[];
  urgency?: string;
}

export function ProactiveQuestionBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as ProactiveQuestionData;
  const { sendAction, isStreaming } = useBlockAction();
  const answeredBlockIds = useSessionStore((s) => s.answeredBlockIds);
  const contentKey = blockContentKey(block);
  const isAnswered = answeredBlockIds.includes(contentKey);

  if (isAnswered) {
    return (
      <div className="block pq answered">
        {d.lbl ? <div className="lbl">{d.lbl}</div> : null}
        <div className="q">{d.q}</div>
        <div className="answered-label">answered</div>
      </div>
    );
  }

  return (
    <div className={`block pq ${(d.urgency ?? '') === 'high' ? 'high' : ''}`}>
      {d.lbl ? <div className="lbl">{d.lbl}</div> : null}
      <div className="q">{d.q}</div>
      <div className="actions">
        {(d.actions ?? []).map((a) => (
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
    </div>
  );
}
