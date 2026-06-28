/**
 * StickyCron — pinned "now" summary card for the latest cron tick.
 *
 * The cron message carries a short_content envelope (headline, primary,
 * secondary, status) that is scannable on a small smartwatch screen. We
 * render that envelope as a sticky card at the top of the stream. It stays
 * visible while the user scrolls the conversation, and links back to the
 * full cron message in the thread.
 */

import { useState, useCallback } from 'react';
import type { GatewayMessage } from '../../lib/gateway';
import { fmtRelative } from '../../lib/utils';

interface StickyCronProps {
  message: GatewayMessage;
  onScrollToMessage?: (message: GatewayMessage) => void;
}

export function StickyCron({ message, onScrollToMessage }: StickyCronProps) {
  const [expanded, setExpanded] = useState(false);

  const handleOpen = useCallback(() => {
    setExpanded(true);
  }, []);

  const handleClose = useCallback(() => {
    setExpanded(false);
  }, []);

  const handleJump = useCallback(() => {
    onScrollToMessage?.(message);
  }, [message, onScrollToMessage]);

  const summary = normalizeSummary(message);
  const age = fmtRelative(message.timestamp * 1000);

  return (
    <div className="sticky-cron" data-expanded={expanded}>
      <div className="sticky-cron-inner">
        <button
          className="sticky-cron-header"
          onClick={expanded ? handleClose : handleOpen}
          aria-expanded={expanded}
          aria-label={expanded ? 'collapse now panel' : 'expand now panel'}
        >
          <span className="sticky-cron-chevron" aria-hidden="true">
            {expanded ? '▾' : '▸'}
          </span>
          <span className="sticky-cron-headline">{summary.headline}</span>
          <span className="sticky-cron-age" aria-label={`updated ${age}`}>{age}</span>
        </button>

        {!expanded ? (
          <div className="sticky-cron-compact">
            {summary.primary ? (
              <div className="sticky-cron-row primary">
                <span className="sticky-cron-label">now</span>
                <span className="sticky-cron-value">{summary.primary}</span>
              </div>
            ) : null}
            {summary.secondary ? (
              <div className="sticky-cron-row">
                <span className="sticky-cron-label">next</span>
                <span className="sticky-cron-value">{summary.secondary}</span>
              </div>
            ) : null}
            {summary.status ? (
              <div className="sticky-cron-row">
                <span className="sticky-cron-label">status</span>
                <span className="sticky-cron-value">{summary.status}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="sticky-cron-expanded">
            {summary.primary ? (
              <div className="sticky-cron-row primary">
                <span className="sticky-cron-label">now</span>
                <span className="sticky-cron-value">{summary.primary}</span>
              </div>
            ) : null}
            {summary.secondary ? (
              <div className="sticky-cron-row">
                <span className="sticky-cron-label">next</span>
                <span className="sticky-cron-value">{summary.secondary}</span>
              </div>
            ) : null}
            {summary.status ? (
              <div className="sticky-cron-row">
                <span className="sticky-cron-label">status</span>
                <span className="sticky-cron-value">{summary.status}</span>
              </div>
            ) : null}
            <button className="sticky-cron-jump" onClick={handleJump}>
              jump to full update
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function normalizeSummary(message: GatewayMessage): {
  headline: string;
  primary?: string;
  secondary?: string;
  status?: string;
} {
  const raw = message.short_content;
  if (typeof raw === 'object' && raw !== null && 'headline' in raw) {
    return {
      headline: String(raw.headline || 'Update'),
      primary: raw.primary ? String(raw.primary) : undefined,
      secondary: raw.secondary ? String(raw.secondary) : undefined,
      status: raw.status ? String(raw.status) : undefined,
    };
  }
  if (typeof raw === 'string' && raw.trim()) {
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    return {
      headline: lines[0] || 'Update',
      primary: lines[1],
      secondary: lines[2],
      status: lines[3],
    };
  }
  return { headline: 'Update' };
}
