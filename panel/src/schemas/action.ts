/**
 * schemas/action.ts — Action envelope from the wire protocol (v2 spec §3.7).
 *
 * The server's POST /chat accepts a free-form action envelope and dispatches
 * to chat.handle_action. The v1 panel emits these on:
 *   - Quick-action buttons (habit toggle, energy set, ONE thing edit)
 *   - Conversational sends (typed in the composer)
 *   - Question answers (yes/no/plan)
 *
 * Free-form schema: we keep it strict at the top level and let the server
 * validate per-kind. The kinds we currently emit are listed below; adding
 * a new one is a one-line change.
 */

import { z } from 'zod';

// Per-action shape: the kind-specific fields. Common defaults (target,
// label, context, payload) are merged in via a small helper. We put
// `...defaults` FIRST in each literal so the kind-specific override
// (e.g. payload with a typed shape) wins.

const defaults = {
  target: z.string().default(''),
  label: z.string().default(''),
  context: z.record(z.unknown()).default({}),
  payload: z.record(z.unknown()).default({}),
};

export const ActionEnvelopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('chat.send'), message: z.string(), ...defaults }),
  z.object({ kind: z.literal('habit.toggle'), ...defaults, target: z.string() }),
  z.object({ kind: z.literal('habit.set'), ...defaults, target: z.string(), payload: z.object({ done: z.boolean() }) }),
  z.object({ kind: z.literal('energy.set'), ...defaults, payload: z.object({ value: z.number().int().min(1).max(10) }) }),
  z.object({ kind: z.literal('one_thing.set'), ...defaults, payload: z.object({ text: z.string() }) }),
  z.object({ kind: z.literal('one_thing.edit'), ...defaults }),
  z.object({ kind: z.literal('journal.append'), ...defaults, payload: z.object({ text: z.string() }) }),
  z.object({ kind: z.literal('answer_question'), ...defaults, target: z.string(), payload: z.object({ answer: z.enum(['yes', 'notyet', 'plan']), qid: z.string() }) }),
  z.object({ kind: z.literal('toggle_habit'), ...defaults, target: z.string() }),
  z.object({ kind: z.literal('set_energy'), ...defaults }),
  z.object({ kind: z.literal('edit_one_thing'), ...defaults }),
  z.object({ kind: z.literal('chat'), ...defaults, payload: z.object({ message: z.string() }) }),
  z.object({ kind: z.literal('scroll'), ...defaults, payload: z.object({ target: z.string() }) }),
]);

export type ActionEnvelope = z.infer<typeof ActionEnvelopeSchema>;

export const ChatResponseSchema = z.object({
  ok: z.boolean(),
  action: z.object({ kind: z.string() }).passthrough(),
  reply: z.object({ text: z.string().default(''), source: z.string().default('gateway') }).passthrough(),
  error: z.string().nullable().default(null),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;
