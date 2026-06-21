import type { ServerBlock } from '../../../schemas/blocks.server';

interface HeartbeatData {
  /** Optional human label (e.g. "07:30 morning tick"). */
  label?: string;
  /** Optional sublabel (e.g. "no actions"). */
  sub?: string;
}

/**
 * HeartbeatBlock — visible "tick landed" indicator.
 *
 * The cron harness emits `[[block:heartbeat:{}]]` on every tick (silent or not)
 * so the user always has proof the harness is alive. A heartbeat with no data
 * renders as a single dim dot — minimal, no prose, no scroll churn.
 *
 * If the harness wants to surface a label (e.g. tick time or "decision tree
 * silent") it passes `{label, sub}`.
 */
export function HeartbeatBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as HeartbeatData;
  return (
    <div className="block heartbeat" data-block-type="heartbeat" aria-label="harness tick">
      <span className="dot" aria-hidden="true" />
      {d.label ? <span className="label">{d.label}</span> : null}
      {d.sub ? <span className="sub">{d.sub}</span> : null}
    </div>
  );
}
