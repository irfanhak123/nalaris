1|# Changelog
2|
3|## v0.1.0 — Initial Open-Source Release
4|
5|### Features
6|
7|- **Panel UI** — React SPA with 38 block types for rich interactive content
8|- **Block system** — agent emits structured `[[block:type:{json}]]` fences, panel renders them as components
9|- **Personal-assistant skill** — directive skill with cron integration (every 30 min, 07:00–23:00)
10|- **Habit tracking** — `habit` block with streak counting and visual feedback
11|- **Calendar** — `calendar_row`, `calendar_day`, `agenda`, `timeline` blocks for schedule management
12|- **One thing** — daily focus prompt via `one_thing` block
13|- **Context modes** — time-of-day awareness (morning rise, mid-day, afternoon wind-down, evening, night)
14|- **Feedback loop** — block actions sent back to agent as user messages for interactive workflows
15|- **Entity graph** — agent tracks people, projects, and topics across conversations
16|- **Dark/light theme** — toggleable with `data-theme` attribute, auto-detects system preference
17|
18|### Tech Stack
19|
20|- React 18, TypeScript 5.6, Vite 5
21|- Zustand 4.5 (state), Zod 3.23 (validation), Marked 18 (markdown), DOMPurify 3.4 (sanitization)
22|- Custom CSS with design tokens — no Tailwind, no CSS-in-JS
23|