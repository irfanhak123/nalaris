import type { ServerBlock } from '../../../schemas/blocks.server';
import { useBlockAction } from '../../../hooks/useBlockAction';

export function HabitBlock({ block }: { block: ServerBlock }) {
  const { sendAction, isStreaming } = useBlockAction();
  const toggle = async () => {
    if (isStreaming) return;
    const name = block.data.name as string;
    const newDone = !block.data.done;
    await sendAction({
      kind: 'habit.toggle',
      payload: { name, done: newDone },
      label: name,
      block,
    });
  };

  return (
    <div className={`block habit-block ${block.data.done ? 'done' : ''}`}>
      <label className="habit-block-row">
        <span className="habit-block-box">
          <input
            type="checkbox"
            checked={!!block.data.done}
            onChange={toggle}
            disabled={isStreaming}
          />
        </span>
        <span className="habit-block-name">{block.data.name as string}</span>
        {block.data.section ? <span className="habit-block-section">{block.data.section as string}</span> : null}
      </label>
    </div>
  );
}
