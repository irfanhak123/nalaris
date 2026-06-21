import type { ServerBlock } from '../../../schemas/blocks.server';
import { useBlockAction } from '../../../hooks/useBlockAction';

interface ActionItem {
  id: string;
  label: string;
  primary?: boolean;
  kind?: string;
  payload?: unknown;
}

export function ActionsBlock({ block }: { block: ServerBlock }) {
  const { sendAction, isStreaming } = useBlockAction();

  const fire = async (item: ActionItem) => {
    if (item.kind === 'scroll' && typeof item.payload === 'string') {
      const el = document.getElementById(`group-${item.payload}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    // Route all other actions through the gateway chat.
    await sendAction({
      kind: item.kind ?? 'ack',
      payload: typeof item.payload === 'object' && item.payload !== null
        ? item.payload as Record<string, unknown>
        : { value: item.payload },
      label: item.label,
    });
  };

  const items = (block.data.items as ActionItem[]) || [];

  return (
    <div className="block btnrow">
      {items.map((it) => (
        <button
          key={it.id}
          className={`btn ${it.primary ? 'primary' : ''} sm`}
          disabled={isStreaming}
          onClick={() => fire(it)}
        >{it.label}</button>
      ))}
    </div>
  );
}
