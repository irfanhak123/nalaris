import type { ServerBlock } from '../../../schemas/blocks.server';
import { useBlockAction } from '../../../hooks/useBlockAction';
import { useState } from 'react';

interface OneThingData {
  text?: string;
  done?: boolean;
}

export function OneThingBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as OneThingData;
  const text = (d.text as string) || '';
  const isDone = !!d.done;
  const isMuted = isDone || !text;

  const { sendAction, isStreaming } = useBlockAction();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);

  const save = async (value: string) => {
    if (isStreaming) return;
    await sendAction({ kind: 'one_thing.set', payload: { text: value }, label: 'set one thing' });
  };

  if (editing) {
    return (
      <div className="block one-thing editing">
        <div className="lbl">ONE thing</div>
        <input
          className="ot-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="what are you shipping?"
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') save(draft).then(() => setEditing(false)); }}
        />
        <div className="ot-actions">
          <button className="btn primary sm" onClick={() => save(draft).then(() => setEditing(false))}>Save</button>
          <button className="btn ghost sm" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`block one-thing ${isMuted ? 'muted' : ''}`}
      onClick={() => { if (!isStreaming) { setDraft(text); setEditing(true); } }}
    >
      <div className="lbl">ONE thing</div>
      <div className="txt">{text || 'tap to set'}</div>
      {isDone ? <span className="done-badge">done</span> : null}
    </div>
  );
}
