1|---
2|name: personal-assistant-chat-blocks
3|version: 4.1.0
4|description: "Block emission skill — teaches the agent how to emit procedural UI blocks (calendar, habits, questions, etc.) as [[block:type:{json}]] fences in chat responses. Covers the fence format, decision heuristic, voice rules, and the block-action round-trip protocol. Load when the agent needs to emit structured UI or handle user clicks on interactive blocks."
5|metadata:
6|  hermes:
7|    tags: [blocks, ui, panel, procedural, rendering]
8|    profile: default
9|---
10|
11|# Chat Blocks — Block Emission Skill
12|
13|This skill teaches you how to emit interactive UI blocks in your chat responses.
14|
15|## 1. Fence format
16|
17|Emit blocks inline with your text using this exact single-line format:
18|
19|```
20|[[block:<type>:{"key":"value"}]]
21|```
22|
23|- **One block per line.** Multiple fences per turn is the design.
24|- **Single-line JSON only.** Multi-line JSON fails the parser.
25|- **No literal `]]` inside JSON values.** The parser terminates at `]]`.
26|- **Mix prose with blocks freely.** Prose is glue, blocks are the message.
27|- **Don't duplicate block data as prose.** If you emit `calendar_day`, don't also list events as bullets.
28|
29|## 2. Decision heuristic — when to emit a block
30|
31|**DEFAULT: use blocks.** The user's stated preference is *"the response should be mostly graphic."* Every response with structured data, options, time references, or actionable content MUST use blocks. Plain text is the exception, not the rule.
32|
33|Emit when the content has **structure the user wants to act on or read at a glance**. Otherwise plain text. But in practice, almost everything has structure — err on the side of blocks.
34|
35|**Hard rules:**
36|- Any response with a table → use `table` block
37|- Any response with options/choices → use `button_row`, `picker`, or `proactive_question`
38|- Any response with a time reference → use `timeline`, `countdown`, or `calendar_day`
39|- Any response with a number/metric → use `stat`
40|- Any response with a list of steps → use `section` or `numbered`
41|- Any response with a warning/note → use `callout`
42|- Any response with a success/failure → use `success` or `error`
43|- Prose is glue between blocks, not the main content
44|- **10-line prose hard cap** — if your prose exceeds 10 lines, convert to blocks
45|
46|| User wants to… | Block type |
47||---|---|
48|| See today's events | `calendar_day` (≤6 events) or `agenda` (multi-day) |
49|| See a time-sensitive alert | `countdown` |
50|| Log energy / mood | `slider` (action `energy.set`) |
51|| Mark habits done | `checklist` (action `habit.toggle` per row) |
52|| Confirm a destructive action | `confirm` (always modal) |
53|| Choose between options | `picker` |
54|| Press one of N actions | `button_row` |
55|| See a number with context | `stat` |
56|| See progress toward a goal | `progress` |
57|| Walk through ordered steps | `numbered` |
58|| See past + remaining timeline | `timeline` |
59|| Anchor a panel (always first) | `heading` |
60|| Time-of-day greeting | `greeting` |
61|| Show current focus | `one_thing` |
62|| Highlight a warning/deadline | `callout` |
63|| Get a quick yes/no/action | `proactive_question` or `quick_replies` |
64|| Confirm a win | `success` |
65|| Empty state (nothing scheduled) | `empty` |
66|
67|**Required:** `confirm` block for any state-mutating action. Never inline-confirm in prose.
68|
69|**Full catalog with data shapes:** `references/block-catalog.md`
70|
71|## 3. Voice & tone
72|
73|Per the personal-assistant directive:
74|- **Plain headers** in `heading` blocks — `HH.MM | Dayname`. No emoji prefixes.
75|- **24-hour `HH.MM` time** (dot-separated). All times WIB (UTC+7).
76|- **Conversational, not broadcast.** Address the user directly.
77|- **10-line prose hard cap.** Anything longer -> blocks. If your response has more than 10 lines of prose, you're doing it wrong.
78|- **Block-first, always.** The user explicitly said: *"the response should be mostly graphic."* When in doubt, use a block. Prose is for connecting blocks, not replacing them.
79|- **Match energy at night.** Late-evening = calm.
80|- **No fabricated urgency.** If nothing is urgent, say so (use `empty` block).
81|- **No flat text tables.** If you're writing a markdown table, use a `table` block instead.
82|- **No bullet lists for options.** If you're listing choices, use `button_row`, `picker`, or `proactive_question`.
83|- **NO EMOJI. Ever. For anything.** Not in headings, not in block data, not in prose, not in labels. Zero emoji.
84|- **NO EM-DASH.** Never use the em-dash character. Use a hyphen or reword.
85|- **NO CURLY QUOTES.** Use straight quotes only. No special unicode characters.
86|
87|## 4. Block action round-trip — handling user clicks
88|
89|When a user clicks a button in a block, the frontend sends a user message:
90|
91|```
92|[block-action] <kind> <payload-json>
93|```
94|
95|Examples:
96|```
97|[block-action] energy.set {"value":7}
98|[block-action] habit.toggle {"name":"Workout","done":true}
99|[block-action] chat.send {"message":"open today"}
100|```
101|
102|**How to respond:**
103|
104|| Kind | What to do |
105||---|---|
106|| `energy.set` | Acknowledge + confirm |
107|| `habit.toggle` | Acknowledge |
108|| `chat.send` | Treat `payload.message` as if the user typed it |
109|| `ack` / `dismiss` / `block.dismiss` | Handled locally by frontend. No message sent. Ignore. |
110|| `one_thing.set` | Confirm |
111|| `journal.log` / `journal.append` | Confirm |
112|| `calendar.move` / `calendar.create` | Confirm with details |
113|| `block_action` (generic) | Respond contextually |
114|
115|Keep responses brief. A `success` block or one-line confirmation is ideal. Don't re-emit the same block type the user just interacted with.
116|
117|## 5. Pitfalls (production gotchas)
118|
119|1. **Fence regex breaks on nested `]`** — use non-greedy `.+?`, not `[^]]+`.
120|2. **Reconciliation destroys `ui_blocks`** — `reExtractBlocks` must preserve local blocks. The `extractInlineBlocks` function in `sessionStore.ts` has a broken bracket-depth scanner that silently drops blocks with nested arrays (calendar_day, table, checklist). **Fix:** use `extractFences` from `rich-content.ts` instead — it uses `findInlineFenceBody` with proper bracket-depth tracking. Also strip `[REMINDER:...]` prefixes before extracting, otherwise the example fences inside the reminder get extracted as real blocks.
121|3. **System instructions live in skills, not message prefixes.** No `[REMINDER:...]` in chat. No `[UI BLOCK FORMAT]` dump on every turn. The user explicitly said: *"the system prompt should not be shot from our layer, it should be a skill."* Block emission instructions belong in this skill, loaded once by the agent runtime.
122|4. **Field-name mismatches** — LLM may emit `tone` but component expects `variant`. Match exactly.
123|5. **Multi-line JSON breaks fences.** Always single-line.
124|6. **Profile mismatch causes 404** — panel and gateway must be in the same profile (`default`).
125|7. **Cron deliveries use `/api/session/message` (append-only).** The bridge script POSTs to `/api/session/message` with `role: "assistant"`, NOT `/api/chat/start`. This avoids triggering a chat turn — the in-session agent never responds to cron content. If the bridge uses `/api/chat/start`, the agent will generate unwanted prose ("Saturday afternoon winding down... ack 17:01 ✓") in response to every tick.
126|7. **`ack`/`dismiss` are fire-and-forget.** The frontend handles these locally (removes the block from UI). No message is sent to the agent. Don't expect or wait for a round-trip.
127|8. **User messages can contain blocks.** Cron ticks arrive as `role=user` messages with embedded `[[block:...]]` fences. The panel must extract blocks from user messages too, not just assistant messages.
128|9. **Tool messages must be filtered.** Messages with `role=tool` are raw JSON from tool calls. They must not render as chat content — filter them out in the display pipeline.
129|
130|**Full pitfall history:** `references/wire-fixes-2026-06-20.md`
131|
132|## 6. Schema verification
133|
134|Use `scripts/verify-blocks.py` to validate block fences before delivery. Mirrors the panel's `rich-content.ts` extraction logic (bracket-depth scanning) so agent-side validation matches what the frontend parses.
135|
136|```bash
137|# Verify a file
138|python3 ~/.hermes/skills/personal-assistant-chat-blocks/scripts/verify-blocks.py output.md
139|
140|# Verify from stdin (pipe cron output)
141|echo '[[block:stat:{\"label\":\"X\",\"value\":\"1\"}]]' | python3 ~/.hermes/skills/personal-assistant-chat-blocks/scripts/verify-blocks.py -
142|
143|# List all 38 registered block types
144|python3 ~/.hermes/skills/personal-assistant-chat-blocks/scripts/verify-blocks.py --types
145|
146|# Print expected schema for a type
147|python3 ~/.hermes/skills/personal-assistant-chat-blocks/scripts/verify-blocks.py --schema calendar_day
148|
149|# Auto-fix common errors (fill required fields, fix greeting hi->text)
150|python3 ~/.hermes/skills/personal-assistant-chat-blocks/scripts/verify-blocks.py --fix output.md
151|```
152|
153|Exit codes: 0 = all valid, 1 = errors found, 2 = usage error.
154|
155|## 7. References
156|
157|- `references/block-catalog.md` (via `personal-assistant` skill) - block schemas
158|- `references/block-extraction-pipeline.md` - how fences are parsed in the frontend (bracket-depth scanner, reconcile flow, pitfalls)
159|- `references/wire-fixes-2026-06-20.md` - production fixes log
160|- `scripts/verify-blocks.py` - block syntax verifier (38 types, bracket-depth scanner, auto-fix)
161|- Companion directive: `personal-assistant` skill
162|