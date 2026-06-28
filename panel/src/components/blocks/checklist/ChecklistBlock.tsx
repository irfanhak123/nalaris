import type { ServerBlock } from '../../../schemas/blocks.server';
import { useBlockAction } from '../../../hooks/useBlockAction';

interface ChecklistItem {
  label: string;
  done: boolean;
  meta?: string;
}

export function ChecklistBlock({ block }: { block: ServerBlock }) {
  const data = block.data as unknown as {
    title?: string;
    items: ChecklistItem[];
    action?: { kind: string; payload?: Record<string, unknown> };
  };
  const items = data.items || [];
  const title = data.title;
  const { sendAction, isStreaming } = useBlockAction();

  const toggle = (item: ChecklistItem, _index: number) => {
    if (isStreaming) return;
    const newDone = !item.done;

    // Optimistically update the item in the block data
    const updatedItems = items.map((it, i) =>
      i === _index ? { ...it, done: newDone } : it
    );
    // Update the block in the store
    const { messages, setMessages } = useSessionStore.getState();
    const msgIndex = messages.findIndex(m =>
      m.ui_blocks?.some(b => b.id === block.id)
    );
    if (msgIndex >= 0) {
      const msg = messages[msgIndex];
      const updatedBlocks = (msg.ui_blocks ?? []).map(b => {
        if (b.id === block.id) {
          return { ...b, data: { ...b.data, items: updatedItems } };
        }
        return b;
      });
      const next = messages.slice();
      next[msgIndex] = { ...msg, ui_blocks: updatedBlocks };
      setMessages(next);
    }

    // Send to agent with full context
    sendAction({
      kind: data.action?.kind ?? 'habit.toggle',
      payload: {
        ...(data.action?.payload ?? {}),
        label: item.label,
        checked: newDone,
        index: _index,
      },
      label: item.label,
      block,
    });
  };

  const doneCount = items.filter((i) => i.done).length;
  const total = items.length;

  return (
    <div className="block checklist-block">
      {title ? (
        <div className="cb-head">
          <div className="cb-title">{title}</div>
          {total > 0 ? <div className="cb-progress">{doneCount}/{total}</div> : null}
        </div>
      ) : null}
      <ul className="checklist">
        {items.map((item, i) => (
          <li
            key={i}
            className={`${item.done ? 'done' : ''} ${!isStreaming ? 'clickable' : ''}`}
            onClick={() => !isStreaming && toggle(item, i)}
          >
            <span className="box" />
            <span className="label">{item.label}</span>
            {item.meta ? <span className="cb-meta">{item.meta}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Need to import useSessionStore for optimistic updates
import { useSessionStore } from '../../../stores/sessionStore';
