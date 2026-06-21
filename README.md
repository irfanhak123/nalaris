1|# Nalaris — Personal AI Assistant
2|
3|Nalaris is a personal assistant system built on [Hermes Agent](https://github.com/hermes-agent) with a rich block-based UI. It combines an always-on AI agent with a chat panel that renders structured interactive components — calendars, habit trackers, checklists, questions, and more — directly in the conversation stream.
4|
5|<!-- MEDIA: screenshot.png -->
6|
7|## How It Works
8|
9|**Hermes Agent** provides the AI gateway, session management, tool execution, and cron scheduling. **Rumah** adds:
10|
11|- A React-based panel UI with 38 block types
12|- A personal-assistant skill (directive) that shapes the agent's behavior
13|- Cron integration — the agent runs every 30 minutes (07:00–23:00) to deliver proactive updates
14|
15|```
16|User ──> Panel (React SPA) <──> Hermes Gateway <──> LLM
17|               │                      │
18|               │                Nalaris Profile
19|               │            (skills + cron + config)
20|               │
21|         Block Renderer
22|         (38 block types)
23|```
24|
25|## Quick Start
26|
27|1. **Install Hermes Agent** — follow the [Hermes installation guide](https://github.com/hermes-agent/hermes-agent#installation)
28|2. **Load the Nalaris profile** — copy the `profile/` directory into your Hermes instance and configure the cron schedule
29|3. **Open the panel** — serve the panel build or run `npm run dev` for development
30|
31|```bash
32|# Development
33|cd panel-v2
34|npm install
35|npm run dev        # → http://localhost:5173
36|```
37|
38|## Block System
39|
40|The agent emits structured `[[block:type:{json}]]` fences inline with prose. The panel parses these and renders them as rich interactive components.
41|
42|**38 block types across 6 categories:**
43|
44|| Category | Blocks |
45||---|---|
46|| **Content** | `chat_message`, `heading`, `quote`, `highlight`, `divider`, `code`, `image`, `embed`, `file_card` |
47|| **Layout** | `columns`, `section`, `tabs` |
48|| **Data** | `stat`, `table`, `progress`, `countdown`, `streak`, `heartbeat`, `pulse_card` |
49|| **Calendar** | `calendar_row`, `calendar_down`, `calendar_day`, `agenda`, `timeline`, `deadline` |
50|| **Interactive** | `question`, `proactive_question`, `quick_replies`, `button_row`, `slider`, `picker`, `confirm`, `actions`, `checklist`, `habit` |
51|| **Status** | `callout`, `greeting`, `one_thing`, `success`, `error`, `empty`, `skeleton`, `spinner` |
52|
53|Blocks support actions — when a user clicks a button or checks a box, the action is sent back to the agent as a user message, enabling interactive workflows.
54|
55|## What Makes It Different
56|
57|- **Agent-centered design** — the panel is a thin client; all logic lives in the agent
58|- **Block system** — structured UI elements emerge naturally from conversation, not a separate dashboard
59|- **Time-aware context modes** — the agent adapts its tone and focus based on time of day (morning rise, mid-day, afternoon wind-down, evening, night)
60|- **Reflective tone** — the assistant acts as a reflective partner, not a task manager
61|
62|## Customization
63|
64|- **Edit the directive skill** — modify `profile/skills/personal-assistant/` to change the agent's personality, tools, or behavior
65|- **Change cron schedule** — adjust the `*/30 7-23 * * *` cron expression in the Hermes config
66|- **Add habits** — define new habits in the agent's skill configuration
67|- **Add block types** — create a new component in `src/components/blocks/` and register it in the block registry
68|
69|## Contributing
70|
71|See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and PR process.
72|
73|## License
74|
75|[MIT](LICENSE) — Copyright 2026 RendangSedap
76|