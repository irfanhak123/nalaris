/**
 * Block components — the panel's renderer registry.
 *
 * Each renderer takes a ServerBlock and returns a React element.
 * The registry maps `type` → component. Unknown types render as
 * <UnknownBlock>, which surfaces a debug chip with the raw payload
 * (helpful when the server adds a new type before the panel knows
 * about it).
 *
 * The registry component-prop type is the *full* ServerBlock union;
 * each component is internally narrowed via Extract<...>. This
 * keeps the registry simple and lets components lean on
 * discriminated-union narrowing.
 *
 * Adding a block type: 1) create components/blocks/<name>/<Name>Block.tsx,
 * 2) add to the registry below. No central switch, no global edit.
 */

import type { ComponentType } from 'react';
import type { ServerBlock } from '../../schemas/blocks.server';
import { GreetingBlock } from './greeting/GreetingBlock';
import { StatBlock } from './stat/StatBlock';
import { OneThingBlock } from './one-thing/OneThingBlock';
import { QuestionBlock } from './question/QuestionBlock';
import { CalendarRowBlock } from './calendar-row/CalendarRowBlock';
import { CalendarDownBlock } from './calendar-down/CalendarDownBlock';
import { DeadlineBlock } from './deadline/DeadlineBlock';
import { HabitBlock } from './habit/HabitBlock';
import { HighlightBlock } from './highlight/HighlightBlock';
import { QuoteBlock } from './quote/QuoteBlock';
import { ChatMessageBlock } from './chat-message/ChatMessageBlock';
import { DividerBlock } from './divider/DividerBlock';
import { ActionsBlock } from './actions/ActionsBlock';
import { CalloutBlock } from './callout/CalloutBlock';
import { TableBlock } from './table/TableBlock';
import { CalendarDayBlock } from './calendar-day/CalendarDayBlock';
import { AgendaBlock } from './agenda/AgendaBlock';
import { TimelineBlock } from './timeline/TimelineBlock';
import { CountdownBlock } from './countdown/CountdownBlock';
import { StreakBlock } from './streak/StreakBlock';
import { ProgressBlock } from './progress/ProgressBlock';
import { ButtonRowBlock } from './button-row/ButtonRowBlock';
import { SliderBlock } from './slider/SliderBlock';
import { PickerBlock } from './picker/PickerBlock';
import { ConfirmBlock } from './confirm/ConfirmBlock';
import { HeadingBlock } from './heading/HeadingBlock';
import { ImageBlock } from './image/ImageBlock';
import { CodeBlock } from './code/CodeBlock';
import { EmbedBlock } from './embed/EmbedBlock';
import { FileCardBlock } from './file-card/FileCardBlock';
import { ColumnsBlock } from './columns/ColumnsBlock';
import { SectionBlock } from './section/SectionBlock';
import { TabsBlock } from './tabs/TabsBlock';
import { PulseCardBlock } from './pulse-card/PulseCardBlock';
import { ProactiveQuestionBlock } from './proactive-question/ProactiveQuestionBlock';
import { QuickRepliesBlock } from './quick-replies/QuickRepliesBlock';
import { SkeletonBlock } from './skeleton/SkeletonBlock';
import { SpinnerBlock } from './spinner/SpinnerBlock';
import { EmptyBlock } from './empty/EmptyBlock';
import { ErrorBlock } from './error/ErrorBlock';
import { SuccessBlock } from './success/SuccessBlock';
import { ChecklistBlock } from './checklist/ChecklistBlock';
import { HeartbeatBlock } from './heartbeat/HeartbeatBlock';

type BlockComponent = ComponentType<{ block: ServerBlock }>;

export const blockRegistry: Record<string, BlockComponent> = {
  greeting: GreetingBlock as BlockComponent,
  stat: StatBlock as BlockComponent,
  one_thing: OneThingBlock as BlockComponent,
  question: QuestionBlock as BlockComponent,
  calendar_row: CalendarRowBlock as BlockComponent,
  calendar_down: CalendarDownBlock as BlockComponent,
  deadline: DeadlineBlock as BlockComponent,
  habit: HabitBlock as BlockComponent,
  highlight: HighlightBlock as BlockComponent,
  quote: QuoteBlock as BlockComponent,
  chat_message: ChatMessageBlock as BlockComponent,
  divider: DividerBlock as BlockComponent,
  actions: ActionsBlock as BlockComponent,
  callout: CalloutBlock as BlockComponent,
  table: TableBlock as BlockComponent,
  // Procedural UI blocks
  calendar_day: CalendarDayBlock as BlockComponent,
  agenda: AgendaBlock as BlockComponent,
  timeline: TimelineBlock as BlockComponent,
  countdown: CountdownBlock as BlockComponent,
  streak: StreakBlock as BlockComponent,
  progress: ProgressBlock as BlockComponent,
  button_row: ButtonRowBlock as BlockComponent,
  slider: SliderBlock as BlockComponent,
  picker: PickerBlock as BlockComponent,
  confirm: ConfirmBlock as BlockComponent,
  heading: HeadingBlock as BlockComponent,
  image: ImageBlock as BlockComponent,
  code: CodeBlock as BlockComponent,
  embed: EmbedBlock as BlockComponent,
  file_card: FileCardBlock as BlockComponent,
  columns: ColumnsBlock as BlockComponent,
  section: SectionBlock as BlockComponent,
  tabs: TabsBlock as BlockComponent,
  pulse_card: PulseCardBlock as BlockComponent,
  proactive_question: ProactiveQuestionBlock as BlockComponent,
  quick_replies: QuickRepliesBlock as BlockComponent,
  skeleton: SkeletonBlock as BlockComponent,
  spinner: SpinnerBlock as BlockComponent,
  empty: EmptyBlock as BlockComponent,
  error: ErrorBlock as BlockComponent,
  success: SuccessBlock as BlockComponent,
  checklist: ChecklistBlock as BlockComponent,
  heartbeat: HeartbeatBlock as BlockComponent,
};

export type ServerBlockType = keyof typeof blockRegistry;

interface BlockRendererProps {
  block: ServerBlock;
}

export function BlockRenderer({ block }: BlockRendererProps) {
  const Component = blockRegistry[block.type];
  if (!Component) return <UnknownBlock block={block} />;
  return <Component block={block} />;
}

function UnknownBlock({ block }: { block: ServerBlock }) {
  return (
    <div className="block" style={{ padding: 'var(--s-3)', border: '1px dashed var(--gray-3)' }}>
      <div className="label" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-12)', color: 'var(--gray-4)' }}>
        unknown block: <code>{block.type}</code>
      </div>
      <pre style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-5)', margin: 'var(--s-2) 0 0', whiteSpace: 'pre-wrap' }}>
        {JSON.stringify(block, null, 2)}
      </pre>
    </div>
  );
}
