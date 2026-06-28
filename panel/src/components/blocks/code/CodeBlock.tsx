import { useState } from 'react';
import type { ServerBlock } from '../../../schemas/blocks.server';

interface CodeData { lang?: string; source?: string; }

export function CodeBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as CodeData;
  const [copied, setCopied] = useState(false);
  const source = d.source ?? '';

  const copy = async () => {
    if (!source) return;
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="block code-block">
      <div className="code-head">
        {d.lang ? <span className="code-lang">{d.lang}</span> : <span />}
        <button className="code-copy" onClick={copy} type="button">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="code">{source}</pre>
    </div>
  );
}