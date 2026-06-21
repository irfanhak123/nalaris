import { useState } from 'react';
import type { ServerBlock } from '../../../schemas/blocks.server';
import { BlockRenderer } from '../index';

interface TabDef { id: string; label: string; }
interface TabsData {
  tabs?: TabDef[];
  active?: string;
  panels?: Record<string, ServerBlock>;
}

export function TabsBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as TabsData;
  const tabs = d.tabs ?? [];
  const [active, setActive] = useState<string>(d.active ?? tabs[0]?.id ?? '');
  const panel = d.panels?.[active];
  return (
    <div className="block">
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.id} className={`t ${active === t.id ? 'on' : ''}`} onClick={() => setActive(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {panel ? <div className="tabs-panel"><BlockRenderer block={panel} /></div> : null}
    </div>
  );
}
