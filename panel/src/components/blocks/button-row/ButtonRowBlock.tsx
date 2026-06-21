import type { ServerBlock } from '../../../schemas/blocks.server';
import { useBlockAction, blockContentKey } from '../../../hooks/useBlockAction';
import { useSessionStore } from '../../../stores/sessionStore';

interface BtnAction {
  id: string;
  label: string;
  kind: string;
  payload?: Record<string, unknown>;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  ghost?: boolean;
}
interface ButtonRowData { actions?: BtnAction[]; }

export function ButtonRowBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as ButtonRowData;
  const { sendAction, isStreaming } = useBlockAction();
  const answeredBlockIds = useSessionStore((s) => s.answeredBlockIds);
  const contentKey = blockContentKey(block);
  const isAnswered = answeredBlockIds.includes(contentKey);

  if (isAnswered) {
    return (
      <div className="block btnrow answered">
        <div className="answered-label">answered</div>
      </div>
    );
  }

  return (
    <div className="block btnrow">
      {(d.actions ?? []).map((a) => (
        <button
          key={a.id}
          className={`btn sm ${a.primary ? 'primary' : ''} ${a.danger ? 'danger' : ''} ${a.ghost ? 'ghost' : ''}`}
          disabled={a.disabled || isStreaming}
          onClick={() => sendAction({ kind: a.kind, payload: a.payload, label: a.label, block })}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
