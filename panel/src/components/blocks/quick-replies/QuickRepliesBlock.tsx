import type { ServerBlock } from '../../../schemas/blocks.server';
import { useBlockAction, blockContentKey } from '../../../hooks/useBlockAction';
import { useSessionStore } from '../../../stores/sessionStore';

interface QRChip { id: string; label: string; kind: string; payload?: Record<string, unknown>; }
interface QuickRepliesData { chips?: QRChip[]; }

export function QuickRepliesBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as QuickRepliesData;
  const { sendAction, isStreaming } = useBlockAction();
  const answeredBlockIds = useSessionStore((s) => s.answeredBlockIds);
  const contentKey = blockContentKey(block);
  const isAnswered = answeredBlockIds.includes(contentKey);

  if (isAnswered) {
    return null;
  }

  return (
    <div className="block qr">
      {(d.chips ?? []).map((c) => (
        <button key={c.id} className="chip" disabled={isStreaming} onClick={() => sendAction({ kind: c.kind, payload: c.payload, label: c.label, block })}>
          {c.label}
        </button>
      ))}
    </div>
  );
}
