import { useState } from 'react';
import type { ServerBlock } from '../../../schemas/blocks.server';
import { useBlockAction } from '../../../hooks/useBlockAction';

interface ConfirmAction { kind: string; payload?: Record<string, unknown>; label?: string; }
interface ConfirmData {
  q?: string;
  ctx?: string;
  confirm: ConfirmAction;
  cancel?: ConfirmAction;
}

export function ConfirmBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as ConfirmData;
  const { sendAction } = useBlockAction();
  const [open, setOpen] = useState(true);
  if (!open) return null;

  const onConfirm = () => {
    sendAction({ kind: d.confirm.kind, payload: d.confirm.payload, label: d.confirm.label });
    setOpen(false);
  };
  const onCancel = () => {
    if (d.cancel) sendAction({ kind: d.cancel.kind, payload: d.cancel.payload, label: d.cancel.label });
    setOpen(false);
  };

  return (
    <div className="modal-overlay" onClick={onCancel} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="confirm">
          <div className="q">{d.q}</div>
          {d.ctx ? <div className="ctx">{d.ctx}</div> : null}
          <div className="actions">
            {d.cancel ? (
              <button className="btn ghost sm" onClick={onCancel}>{d.cancel.label || 'Cancel'}</button>
            ) : null}
            <button className="btn primary sm" onClick={onConfirm}>{d.confirm.label || 'Confirm'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}