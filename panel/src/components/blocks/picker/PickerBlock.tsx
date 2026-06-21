import { useState } from 'react';
import type { ServerBlock } from '../../../schemas/blocks.server';
import { useBlockAction } from '../../../hooks/useBlockAction';

interface PickerOption { id: string; label: string; }
interface PickerData {
  label?: string;
  options?: PickerOption[];
  selected?: string;
  action?: { kind: string; payload?: Record<string, unknown> };
}

export function PickerBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as PickerData;
  const { sendAction, isStreaming } = useBlockAction();
  const [sel, setSel] = useState<string | undefined>(d.selected);

  const pick = (id: string) => {
    if (isStreaming) return;
    setSel(id);
    // Find the label for the selected option
    const opt = (d.options ?? []).find(o => o.id === id);
    if (d.action) sendAction({
      kind: d.action.kind,
      payload: { ...(d.action.payload ?? {}), selected: id, selected_label: opt?.label },
      label: opt?.label ?? id,
      block,
    });
  };

  return (
    <div className="block picker">
      {d.label ? <div className="lbl">{d.label}</div> : null}
      <div className="opts">
        {(d.options ?? []).map((o) => (
          <button key={o.id} className={`opt ${sel === o.id ? 'on' : ''}`} disabled={isStreaming} onClick={() => pick(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
