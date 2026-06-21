/**
 * lib/demo-blocks.ts — Sample blocks for ?demo=1 mode.
 * Shows off every procedural block type the panel can render.
 */
import type { ServerBlock } from '../schemas/blocks.server';

let counter = 0;
function id(type: string): string {
  counter += 1;
  return `demo-${type}-${counter}`;
}

export const demoBlocks: ServerBlock[] = [
  // ── Greeting ──
  {
    id: id('greeting'),
    type: 'greeting',
    weight: 100,
    data: { text: '14.30 Sunday', sub: 'Afternoon wind-down' },
  },

  // ── Stats row ──
  {
    id: id('stat'),
    type: 'stat',
    weight: 90,
    data: { label: 'Energy', value: '7', sub: '/10' },
  },
  {
    id: id('stat'),
    type: 'stat',
    weight: 89,
    data: { label: 'Focus streak', value: '12', sub: 'days' },
  },

  // ── One thing ──
  {
    id: id('one_thing'),
    type: 'one_thing',
    weight: 85,
    data: { text: 'Finish panel-v2 procedural UI', sub: 'DP4 priority' },
  },

  // ── Calendar day ──
  {
    id: id('calendar_day'),
    type: 'calendar_day',
    weight: 80,
    data: {
      date: '2026-06-21',
      weekday: 'Sunday',
      events: [
        { time: '09:00', end: '11:00', title: 'Weekly Review', working: true },
        { time: '14:00', end: '16:00', title: 'Deep Work Session', note: 'DP4' },
        { time: '17:00', end: '17:30', title: 'Evening wind-down' },
      ],
    },
  },

  // ── Timeline ──
  {
    id: id('timeline'),
    type: 'timeline',
    weight: 75,
    data: {
      events: [
        { t: '09:00', l: 'Weekly Review', passed: true },
        { t: '14:00', l: 'Deep Work', passed: false },
        { t: '17:00', l: 'Evening wind-down', passed: false },
      ],
    },
  },

  // ── Agenda ──
  {
    id: id('agenda'),
    type: 'agenda',
    weight: 74,
    data: {
      days: [
        {
          h: 'Tomorrow',
          events: [
            { title: 'DP4 Standup', when: '09:00' },
            { title: 'Design Review', when: '14:00' },
          ],
        },
        {
          h: 'Tuesday',
          events: [
            { title: 'Netra Sync', when: '10:00' },
          ],
        },
      ],
    },
  },

  // ── Divider ──
  { id: id('divider'), type: 'divider', weight: 70, data: {} },

  // ── Checklist (habits) ──
  {
    id: id('checklist'),
    type: 'checklist',
    weight: 65,
    data: {
      title: 'Morning Routine',
      items: [
        { label: 'Wake 7:30', done: true },
        { label: 'Water first', done: true },
        { label: 'Sun/Move 5min', done: false },
        { label: 'No snooze', done: false },
        { label: 'Morning primer', done: true },
        { label: 'Protein breakfast', done: false },
      ],
    },
  },

  // ── Habit (single) ──
  {
    id: id('habit'),
    type: 'habit',
    weight: 64,
    data: { name: 'ONE thing written', done: true, section: 'Morning' },
  },

  // ── Slider ──
  {
    id: id('slider'),
    type: 'slider',
    weight: 60,
    data: {
      label: 'Energy Level',
      min: 0,
      max: 10,
      value: 7,
      unit: '/10',
      action: { kind: 'energy.set' },
      action_label: 'Set energy',
    },
  },

  // ── Picker ──
  {
    id: id('picker'),
    type: 'picker',
    weight: 59,
    data: {
      label: 'Focus Area',
      options: [
        { id: 'dp4', label: 'DP4 Project' },
        { id: 'rumah', label: 'Rumah' },
        { id: 'study', label: 'Study' },
      ],
      selected: 'rumah',
      action: { kind: 'focus.set' },
    },
  },

  // ── Question ──
  {
    id: id('question'),
    type: 'question',
    weight: 55,
    data: {
      text: 'What should we focus on next?',
      urgency: 'normal',
      actions: [
        { id: 'a1', label: 'Calendar', kind: 'chat.send', payload: { message: 'show calendar' }, primary: true },
        { id: 'a2', label: 'Habits', kind: 'chat.send', payload: { message: 'show habits' } },
        { id: 'a3', label: 'Skip', kind: 'dismiss' },
      ],
    },
  },

  // ── Callout ──
  {
    id: id('callout'),
    type: 'callout',
    weight: 50,
    data: {
      variant: 'warning',
      title: 'Deadline approaching',
      body: 'Weekly review due by 11:00. You have 30 minutes left.',
    },
  },

  // ── Countdown ──
  {
    id: id('countdown'),
    type: 'countdown',
    weight: 49,
    data: {
      label: 'Until Deep Work',
      target: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
    },
  },

  // ── Progress ──
  {
    id: id('progress'),
    type: 'progress',
    weight: 48,
    data: { label: 'Weekly goals', value: 5, max: 8, unit: 'done' },
  },

  // ── Streak ──
  {
    id: id('streak'),
    type: 'streak',
    weight: 47,
    data: { name: 'Morning Routine', count: 12, unit: 'days' },
  },

  // ── Table ──
  {
    id: id('table'),
    type: 'table',
    weight: 45,
    data: {
      headers: ['Habit', 'Goal', 'Today'],
      rows: [
        ['Wake 7:30', '7/7', '✓'],
        ['Water first', '7/7', '✓'],
        ['Sun/Move 5min', '7/7', '-'],
        ['No snooze', '5/7', '-'],
      ],
    },
  },

  // ── Embed ──
  {
    id: id('embed'),
    type: 'embed',
    weight: 40,
    data: { ic: 'DP', title: 'DP4 Project Board', sub: 'Linear · 12 open issues' },
  },

  // ── File card ──
  {
    id: id('file_card'),
    type: 'file_card',
    weight: 39,
    data: { ic: 'PDF', title: 'weekly-review-2026-06-21.pdf', sub: '42 KB' },
  },

  // ── Heading ──
  {
    id: id('heading'),
    type: 'heading',
    weight: 35,
    data: { text: 'Project Status', level: 3 },
  },

  // ── Columns ──
  {
    id: id('columns'),
    type: 'columns',
    weight: 34,
    data: {
      cols: 2,
      children: [
        { id: id('stat'), type: 'stat', data: { label: 'Open issues', value: '12' } },
        { id: id('stat'), type: 'stat', data: { label: 'Done this week', value: '8' } },
      ],
    },
  },

  // ── Success ──
  {
    id: id('success'),
    type: 'success',
    weight: 30,
    data: { text: 'Morning routine completed (4/6)' },
  },

  // ── Empty state ──
  {
    id: id('empty'),
    type: 'empty',
    weight: 25,
    data: { t: 'No evening events', s: 'Free until tomorrow' },
  },

  // ── Quote ──
  {
    id: id('quote'),
    type: 'quote',
    weight: 20,
    data: { text: 'The best time to plant a tree was 20 years ago. The second best time is now.', source: 'Chinese proverb' },
  },

  // ── Highlight ──
  {
    id: id('highlight'),
    type: 'highlight',
    weight: 15,
    data: { text: 'Panel-v2 now supports 43 procedural block types.' },
  },
];
