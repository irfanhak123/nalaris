import type { ServerBlock } from '../../../schemas/blocks.server';
import { useBlockAction } from '../../../hooks/useBlockAction';

interface FileCardData {
  ic?: string;
  title?: string;
  sub?: string;
  action?: { kind: string; payload?: Record<string, unknown>; label?: string };
}

export function FileCardBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as FileCardData;
  const { sendAction, isStreaming } = useBlockAction();

  const onClick = () => {
    if (!d.action || isStreaming) return;
    sendAction({
      kind: d.action.kind,
      payload: d.action.payload,
      label: d.action.label ?? d.title,
      block,
    });
  };

  return (
    <button
      type="button"
      className="block filecard"
      disabled={!d.action || isStreaming}
      onClick={onClick}
    >
      <div className="ic">{d.ic}</div>
      <div className="body">
        <div className="t">{d.title}</div>
        {d.sub ? <div className="s">{d.sub}</div> : null}
      </div>
    </button>
  );
}