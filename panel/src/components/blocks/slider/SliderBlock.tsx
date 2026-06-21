import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { ServerBlock } from '../../../schemas/blocks.server';
import { useBlockAction } from '../../../hooks/useBlockAction';

interface SliderData {
  label?: string;
  min?: number;
  max?: number;
  value?: number;
  unit?: string;
  action?: { kind: string; payload?: Record<string, unknown> };
  action_label?: string;
}

export function SliderBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as SliderData;
  const { sendAction, isStreaming } = useBlockAction();
  const [val, setVal] = useState(Number(d.value) || 0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setVal(Number(d.value) || 0);
  }, [d.value]);

  const fire = (v: number) => {
    if (!d.action || isStreaming) return;
    sendAction({
      kind: d.action.kind,
      payload: { ...(d.action.payload ?? {}), value: v },
      label: d.action_label ?? d.label,
      block,
    });
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setVal(v);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => fire(v), 300);
  };

  return (
    <div className="block slider">
      <div className="lbl">
        <span>{d.label}</span>
        <b>{val}{d.unit ? ` ${d.unit}` : ''}</b>
      </div>
      <input type="range" min={Number(d.min) ?? 0} max={Number(d.max) ?? 100} value={val} onChange={onChange} disabled={isStreaming} />
    </div>
  );
}
