import { useState } from 'react';
import type { ServerBlock } from '../../../schemas/blocks.server';

interface ImageData { src?: string; caption?: string; }

export function ImageBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as ImageData;
  const [status, setStatus] = useState<'loading' | 'error' | 'loaded'>(d.src ? 'loading' : 'error');

  return (
    <div className="block img">
      {d.src ? (
        <>
          {status === 'loading' && <div className="img-frame skel" />}
          {status === 'error' && <div className="img-frame">Image failed to load</div>}
          <img
            src={d.src}
            alt={d.caption || ''}
            data-state={status}
            onLoad={() => setStatus('loaded')}
            onError={() => setStatus('error')}
          />
        </>
      ) : (
        <div className="img-frame">No image</div>
      )}
      {d.caption ? <div className="cap">{d.caption}</div> : null}
    </div>
  );
}