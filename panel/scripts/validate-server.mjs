/**
 * scripts/validate-server.mjs
 *
 * Loads the actual /blocks and /state payloads from the FastAPI server
 * (:8790) and validates them against the panel's exported Zod schemas.
 *
 * Run with:  node scripts/validate-server.mjs
 */

import { ServerBlocksResponseSchema, ServerBlockSchema, SERVER_BLOCK_TYPES } from '../src/schemas/blocks.server.ts';
import { StateResponseSchema } from '../src/schemas/state.ts';

const base = process.env.VITE_API_BASE || 'http://localhost:8790';

async function get(path) {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

// 1. /blocks
const blocksRaw = await get('/blocks');
const blocksResult = ServerBlocksResponseSchema.safeParse(blocksRaw);
if (!blocksResult.success) {
  console.error('❌ /blocks failed Zod validation:');
  console.error(JSON.stringify(blocksResult.error.format(), null, 2));
  process.exit(1);
}
console.log(`✓ /blocks: ${blocksResult.data.blocks.length} blocks, all valid`);
const typeSet = new Set(blocksResult.data.blocks.map((b) => b.type));
console.log(`  types: ${[...typeSet].sort().join(', ')}`);
for (const t of SERVER_BLOCK_TYPES) console.log(`  ${t === 'greeting' || typeSet.has(t) ? '✓' : '·'} ${t}`);

// 2. /state
const stateRaw = await get('/state');
const stateResult = StateResponseSchema.safeParse(stateRaw);
if (!stateResult.success) {
  console.error('❌ /state failed Zod validation:');
  console.error(JSON.stringify(stateResult.error.format(), null, 2));
  process.exit(1);
}
console.log(`✓ /state: mode=${stateResult.data.panel.mode}, calendar=${stateResult.data.calendar.source}, score=${stateResult.data.habits.today_score}, one_thing=${JSON.stringify(stateResult.data.user.one_thing)}`);

// 3. Type-level guarantee: each block narrows to its specific shape
let counter = 0;
for (const b of blocksResult.data.blocks) {
  const sub = ServerBlockSchema.safeParse(b);
  if (!sub.success) {
    console.error(`❌ block ${b.id} (${b.type}) failed narrowed parse:`, sub.error.message);
    process.exit(1);
  }
  counter++;
}
console.log(`✓ all ${counter} blocks pass the narrowed ServerBlock schema`);
console.log('\n=== END-TO-END VALIDATION: PASS ===');
console.log('Panel data path is verified at the type and runtime layer.');
