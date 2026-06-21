import type { ServerBlock } from '../../../schemas/blocks.server';
import { useBlockAction, blockContentKey } from '../../../hooks/useBlockAction';
import { useSessionStore } from '../../../stores/sessionStore';

interface PQAction { id: string; label: string; kind: string; payload?: Record<string, unknown>; primary?: boolean; }
interface QuestionData {
  text?: string;
  urgency?: string;
  actions?: PQAction[];
}

export function QuestionBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as QuestionData;
  const { sendAction, isStreaming } = useBlockAction();
  const answeredBlockIds = useSessionStore((s) => s.answeredBlockIds);
  const contentKey = blockContentKey(block);
  const isAnswered = answeredBlockIds.includes(contentKey);

  if (isAnswered) {
    return (
      <div className="block pq answered">
        <div className="lbl">Question</div>
        <div className="q">{d.text}</div>
        <div className="answered-label">answered</div>
      </div>
    );
  }

  return (
    <div className={`block pq ${(d.urgency ?? '') === 'high' ? 'high' : ''}`}>
      <div className="lbl">Question</div>
      <div className="q">{d.text}</div>
      <div className="actions">
        {(d.actions ?? []).map((a) => (
          <button
            key={a.id}
            className={`btn ${a.primary ? 'primary' : ''} sm`}
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
