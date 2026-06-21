/**
 * schemas/blocks.server.ts — Minimal ServerBlock type for inline chat blocks.
 *
 * The LLM emits [[block:<type>:{json}]] fences in its chat responses.
 * These are parsed by stream-blocks.ts and rendered by the block components.
 * This is the contract between the LLM's output format and the panel's renderer.
 */

export interface ServerBlock {
  id: string;
  type: string;
  weight?: number;
  data: Record<string, unknown>;
  intent?: {
    kind: string;
    qid?: string;
    name?: string;
    payload?: Record<string, unknown>;
  };
  ttl?: number;
}

export const ServerBlocksResponseSchema = {
  parse: (v: unknown) => {
    const obj = v as { blocks: ServerBlock[]; raw?: unknown; _meta?: unknown };
    if (!Array.isArray(obj.blocks)) throw new Error('blocks must be an array');
    return obj;
  },
};

export type ServerBlocksResponse = { blocks: ServerBlock[]; raw?: unknown; _meta?: unknown };
