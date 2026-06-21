/**
 * schemas/blocks.spec.ts — Zod schemas for the v2 block-library spec shape.
 *
 * Per `02-Architecture/block-library.md` (v2-draft, INHERITED by v3):
 *   { id, block_type, lifecycle, rail_group?, version, created_at, updated_at,
 *     schema?, source_skill?, actions: Action[], data }
 *
 * The current v0.3 server does NOT emit this shape. The schemas below are
 * present so the v1 panel can render blocks at v2 cutover without code
 * changes. For now, the adapter (lib/blocks-adapter.ts) is hard-pinned to
 * the server shape.
 */

import { z } from 'zod';

const ULID = z.string().min(8);
const ISO_DATE = z.string().datetime({ offset: true });

const LifecycleSchema = z.enum(['ephemeral', 'sticky', 'pinned']);

const ActionSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.string(),
  payload_schema: z.record(z.string()).optional(),
  variant: z.enum(['primary', 'default', 'ghost', 'danger']).optional(),
});

// Group A — Text
const TextData = z.object({ markdown: z.string(), stream: z.boolean().default(true) });
const HeadingData = z.object({ level: z.number().int().min(1).max(3), text: z.string() });
const QuoteData = z.object({ text: z.string(), attribution: z.string().optional() });
const CalloutData = z.object({
  severity: z.enum(['info', 'success', 'warning', 'danger']),
  title: z.string(),
  body: z.string(),
  icon: z.string().optional(),
});

// Group B — Status
const StatData = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]),
  unit: z.string().optional(),
  delta: z.string().optional(),
  trend: z.enum(['up', 'down', 'flat']).optional(),
});
const ProgressBarData = z.object({
  label: z.string(),
  current: z.number(),
  total: z.number(),
  color: z.string().optional(),
});
const CountdownData = z.object({
  label: z.string(),
  target_at: ISO_DATE,
  severity: z.enum(['low', 'medium', 'high']).default('medium'),
  sub_text: z.string().optional(),
});
const StreakData = z.object({
  label: z.string(),
  days: z.number(),
  milestone: z.number().optional(),
  broken: z.boolean().default(false),
});

// Group C — Lists
const ChecklistItem = z.object({
  id: z.string(),
  label: z.string(),
  done: z.boolean(),
  done_at: ISO_DATE.nullable().optional(),
});
const ChecklistData = z.object({
  title: z.string(),
  items: z.array(ChecklistItem),
  score_format: z.string().optional(),
});
const TodoItem = z.object({
  id: z.string(),
  text: z.string(),
  due: z.string().nullable().optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  done: z.boolean().default(false),
});
const TodoListData = z.object({
  title: z.string(),
  items: z.array(TodoItem),
  filters: z.object({ show_done: z.boolean() }).optional(),
});
const NumberedListData = z.object({ title: z.string().optional(), items: z.array(z.object({ text: z.string() })) });
const TableData = z.object({
  title: z.string().optional(),
  columns: z.array(z.object({ key: z.string(), label: z.string(), align: z.enum(['left', 'right', 'center']).default('left') })),
  rows: z.array(z.record(z.union([z.string(), z.number(), z.boolean()]))),
});

// Group D — Time
const CalendarEvent = z.object({
  id: z.string(),
  start: ISO_DATE,
  end: ISO_DATE,
  title: z.string(),
  location: z.string().optional(),
  status: z.string().default('confirmed'),
});
const CalendarDayData = z.object({
  date: z.string(),
  now_marker_at: ISO_DATE.optional(),
  events: z.array(CalendarEvent),
  show_countdown: z.boolean().default(true),
});
const AgendaData = z.object({ window: z.string(), events: z.array(CalendarEvent) });
const TimelineItem = z.object({
  at: ISO_DATE,
  label: z.string(),
  kind: z.enum(['done', 'todo', 'pulse', 'event', 'milestone']),
});
const TimelineData = z.object({ title: z.string().optional(), items: z.array(TimelineItem) });

// Group E — Choice
const ButtonRowData = z.object({
  prompt: z.string().optional(),
  buttons: z.array(z.object({ id: z.string(), label: z.string(), variant: z.enum(['primary', 'default', 'ghost', 'danger']).default('default') })),
});
const SliderData = z.object({
  label: z.string(),
  min: z.number().default(1),
  max: z.number().default(10),
  step: z.number().default(1),
  value: z.number().nullable().default(null),
  scale_labels: z.record(z.string()).optional(),
});
const PickerData = z.object({
  label: z.string(),
  options: z.array(z.object({ value: z.string(), label: z.string() })),
});
const ConfirmData = z.object({
  title: z.string(),
  body: z.string(),
  confirm_label: z.string().default('Confirm'),
  cancel_label: z.string().default('Cancel'),
});

// Group F — Reference
const ImageData = z.object({ src: z.string(), alt: z.string(), caption: z.string().optional(), width: z.number().optional(), height: z.number().optional() });
const CodeData = z.object({ language: z.string(), code: z.string(), filename: z.string().optional() });
const EmbedData = z.object({ url: z.string(), title: z.string(), description: z.string().optional(), favicon: z.string().optional() });
const FileCardData = z.object({ path: z.string(), title: z.string(), kind: z.string().default('markdown') });

// Recursive composition blocks (columns / section / tabs). Defined last
// to avoid forward refs. We type the recursive variants as
// `z.array(z.unknown())` for v1 — strict z.lazy typing fights the
// discriminated union, and these are v2 surface anyway. The renderer
// can cast to SpecBlock[] at render time when those block types ship.

const ColumnsData = z.object({ count: z.union([z.literal(2), z.literal(3)]), children: z.array(z.unknown()) });
const SectionData = z.object({ title: z.string(), children: z.array(z.unknown()) });
const TabsData = z.object({ tabs: z.array(z.object({ id: z.string(), label: z.string(), children: z.array(z.unknown()) })) });

// Group G — Pulse / questions
const PulseCardData = z.object({ when: ISO_DATE, heading: z.string(), body: z.string() });
const ProactiveQuestionData = z.object({
  label: z.string(),
  question: z.string(),
  severity: z.enum(['low', 'medium', 'high']).default('medium'),
});
const QuickRepliesData = z.object({ items: z.array(z.object({ id: z.string(), label: z.string() })) });

const BlockBase = {
  id: ULID,
  block_type: z.string(),
  lifecycle: LifecycleSchema.default('ephemeral'),
  rail_group: z.string().optional(),
  version: z.number().int().default(1),
  created_at: ISO_DATE.optional(),
  updated_at: ISO_DATE.optional(),
  schema: z.string().url().optional(),
  source_skill: z.string().optional(),
  actions: z.array(ActionSchema).default([]),
};

export const SpecBlockSchema = z.discriminatedUnion('block_type', [
  z.object({ ...BlockBase, block_type: z.literal('text'), data: TextData }),
  z.object({ ...BlockBase, block_type: z.literal('heading'), data: HeadingData }),
  z.object({ ...BlockBase, block_type: z.literal('divider'), data: z.object({}).optional() }),
  z.object({ ...BlockBase, block_type: z.literal('quote'), data: QuoteData }),
  z.object({ ...BlockBase, block_type: z.literal('callout'), data: CalloutData }),
  z.object({ ...BlockBase, block_type: z.literal('stat'), data: StatData }),
  z.object({ ...BlockBase, block_type: z.literal('progress_bar'), data: ProgressBarData }),
  z.object({ ...BlockBase, block_type: z.literal('countdown'), data: CountdownData }),
  z.object({ ...BlockBase, block_type: z.literal('streak'), data: StreakData }),
  z.object({ ...BlockBase, block_type: z.literal('checklist'), data: ChecklistData }),
  z.object({ ...BlockBase, block_type: z.literal('todo_list'), data: TodoListData }),
  z.object({ ...BlockBase, block_type: z.literal('numbered_list'), data: NumberedListData }),
  z.object({ ...BlockBase, block_type: z.literal('table'), data: TableData }),
  z.object({ ...BlockBase, block_type: z.literal('calendar_day'), data: CalendarDayData }),
  z.object({ ...BlockBase, block_type: z.literal('agenda'), data: AgendaData }),
  z.object({ ...BlockBase, block_type: z.literal('timeline'), data: TimelineData }),
  z.object({ ...BlockBase, block_type: z.literal('button_row'), data: ButtonRowData }),
  z.object({ ...BlockBase, block_type: z.literal('slider'), data: SliderData }),
  z.object({ ...BlockBase, block_type: z.literal('picker'), data: PickerData }),
  z.object({ ...BlockBase, block_type: z.literal('confirm'), data: ConfirmData }),
  z.object({ ...BlockBase, block_type: z.literal('image'), data: ImageData }),
  z.object({ ...BlockBase, block_type: z.literal('code'), data: CodeData }),
  z.object({ ...BlockBase, block_type: z.literal('embed'), data: EmbedData }),
  z.object({ ...BlockBase, block_type: z.literal('file_card'), data: FileCardData }),
  z.object({ ...BlockBase, block_type: z.literal('columns'), data: ColumnsData }),
  z.object({ ...BlockBase, block_type: z.literal('section'), data: SectionData }),
  z.object({ ...BlockBase, block_type: z.literal('tabs'), data: TabsData }),
  z.object({ ...BlockBase, block_type: z.literal('pulse_card'), data: PulseCardData }),
  z.object({ ...BlockBase, block_type: z.literal('proactive_question'), data: ProactiveQuestionData }),
  z.object({ ...BlockBase, block_type: z.literal('quick_replies'), data: QuickRepliesData }),
]);

export type SpecBlock = z.infer<typeof SpecBlockSchema>;

/** All spec block_type literals. */
export const SPEC_BLOCK_TYPES = [
  'text', 'heading', 'divider', 'quote', 'callout',
  'stat', 'progress_bar', 'countdown', 'streak',
  'checklist', 'todo_list', 'numbered_list', 'table',
  'calendar_day', 'agenda', 'timeline',
  'button_row', 'slider', 'picker', 'confirm',
  'image', 'code', 'embed', 'file_card',
  'columns', 'section', 'tabs',
  'pulse_card', 'proactive_question', 'quick_replies',
] as const;
