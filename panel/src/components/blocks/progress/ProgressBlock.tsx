import type { ServerBlock } from '../../../schemas/blocks.server';

interface ProgressData {
  label?: string;
  current?: number;
  total?: number;
  severity?: 'danger' | 'success';
}

export function ProgressBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as ProgressData;
  const cur = Number(d.current) || 0;
  const tot = Number(d.total) || 0;
  const pct = tot > 0 ? Math.min(100, Math.round((cur / tot) * 100)) : 0;
  const sev = d.severity === 'danger' || d.severity === 'success' ? d.severity : '';
  return (
    <div className={`block progress ${sev}`}>
      <div className="meta">
        <span>{d.label}</span>
        <span>{cur}/{tot} · {pct}%</span>
      </div>
      <div className="track">
        <div className="fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}