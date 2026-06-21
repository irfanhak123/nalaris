import type { ServerBlock } from '../../../schemas/blocks.server';

interface ImageData { src?: string; caption?: string; }

export function ImageBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as ImageData;
  return (
    <div className="block img">
      {d.src ? <img src={d.src} alt={d.caption || ''} /> : <div className="frame">no image</div>}
      {d.caption ? <div className="cap">{d.caption}</div> : null}
    </div>
  );
}