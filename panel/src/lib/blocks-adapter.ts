/**
 * lib/blocks-adapter.ts — Block-shape adapter.
 *
 * The v1 panel is hard-pinned to the v0.3 server shape. The v2 spec
 * shape is present in `schemas/blocks.spec.ts` for the v2 cutover.
 *
 * The adapter exposes a single function — `adaptBlock` — that, in v1,
 * is identity. In v2, it will translate SpecBlock → a normalized
 * internal Block shape that the renderer consumes. The cutover is
 * a single constant flip.
 *
 * The renderer dispatches on a `kind` field that exists in BOTH
 * shapes (greeting / stat / one_thing / ...), so a constant flip is
 * enough to switch the active shape.
 */

import type { ServerBlock } from '../schemas/blocks.server';
import type { SpecBlock } from '../schemas/blocks.spec';

/** Cutover flag. Flip to 'spec' at v2 cutover. */
export const ACTIVE_BLOCK_SHAPE = 'server' as const;

/** The unified Block type the renderer consumes. */
export type PanelBlock = ServerBlock | SpecBlock;

export function adaptBlock(raw: ServerBlock | SpecBlock): PanelBlock {
  // In v1, identity. v2 cutover: translate SpecBlock → internal shape.
  return raw;
}

/** Type guard helpers. */
export function isServerBlock(_b: PanelBlock): _b is ServerBlock {
  return ACTIVE_BLOCK_SHAPE === 'server';
}
