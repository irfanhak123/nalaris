1|# Contributing to Nalaris
2|
3|Thanks for your interest in contributing! This guide covers development setup, code conventions, and how to submit changes.
4|
5|## Development Setup
6|
7|```bash
8|# Clone the repository
9|git clone https://github.com/RendangSedap/nalaris.git
10|cd nalaris/panel-v2
11|
12|# Install dependencies
13|npm install
14|
15|# Start dev server (proxies API to Hermes gateway at :8787)
16|npm run dev
17|```
18|
19|**Prerequisites:** Node.js 18+, a running Hermes Agent instance at `:8787`.
20|
21|### Available Commands
22|
23|| Command | Purpose |
24||---|---|
25|| `npm run dev` | Vite dev server at `:5173` |
26|| `npm run build` | TypeScript check + production build → `dist/` |
27|| `npm run preview` | Preview production build at `:4173` |
28|| `npm run typecheck` | TypeScript type checking only (no emit) |
29|
30|## Adding a New Block Type
31|
32|The block system is the core extensibility mechanism. Each block type is a React component registered in a central registry.
33|
34|### Step 1: Create the component
35|
36|Create `src/components/blocks/<name>/<Name>Block.tsx`:
37|
38|```tsx
39|import type { ServerBlock } from '../../../schemas/blocks.server';
40|
41|interface MyBlockProps {
42|  block: ServerBlock;
43|}
44|
45|export function MyBlock({ block }: MyBlockProps) {
46|  const { label, value } = block.data;
47|  return (
48|    <div className="block block--my-block">
49|      <span className="block__label">{String(label)}</span>
50|      <span className="block__value">{String(value)}</span>
51|    </div>
52|  );
53|}
54|```
55|
56|### Step 2: Register the block
57|
58|Import and add it to `blockRegistry` in `src/components/blocks/index.tsx`:
59|
60|```tsx
61|import { MyBlock } from './my-block/MyBlock';
62|
63|// Add to the registry object:
64|const blockRegistry: Record<string, React.ComponentType<{ block: ServerBlock }>> = {
65|  // ... existing blocks ...
66|  my_block: MyBlock,
67|};
68|```
69|
70|### Step 3: Add schema validation
71|
72|Register the block type and expected fields in `tools/verify-blocks.py`:
73|
74|```python
75|BLOCK_TYPES = {
76|    # ... existing types ...
77|    "my_block": {"label": str, "value": str},
78|}
79|```
80|
81|### Step 4: Add styles
82|
83|Add component styles in `src/styles/base.css` using the `.block--my-block` class. Use CSS custom properties from `tokens.css` for colors and spacing.
84|
85|### Step 5: Test
86|
87|- Run `python3 tools/verify-blocks.py --types` to confirm registration
88|- Run `npm run typecheck` to verify TypeScript compiles
89|- Test the block in the panel by sending a message with `[[block:my_block:{"label":"Test","value":"42"}]]`
90|
91|No other files need changing — the registry is the single dispatch point.
92|
93|## Modifying the Personal-Assistant Skill
94|
95|The agent's behavior is defined by the directive skill in `profile/skills/personal-assistant/`. To modify it:
96|
97|1. Edit the skill files in `profile/skills/personal-assistant/`
98|2. Restart the Hermes agent or reload the profile
99|3. Test by sending messages and verifying the agent's responses match your changes
100|
101|Common modifications:
102|- **Change tone** — edit the directive prompt
103|- **Add tools** — register new tool definitions in the skill config
104|- **Adjust context modes** — modify time-of-day behavior rules
105|
106|## Code Style
107|
108|- **TypeScript strict mode** — all code must pass `npm run typecheck`
109|- **Custom CSS** — all styles in `base.css` using CSS custom properties from `tokens.css`
110|- **No Tailwind** — no utility classes, no CSS-in-JS, no CSS modules
111|- **No unused imports** — keep imports clean
112|- **Zod for runtime validation** — use Zod schemas for action envelopes and API responses
113|
114|## PR Process
115|
116|1. Fork the repository and create a feature branch
117|2. Make your changes following the code style guidelines above
118|3. Run `npm run typecheck` — must pass with zero errors
119|4. Run `npm run build` — must produce a clean build
120|5. Open a PR with a clear description of what changed and why
121|6. Link any related issues
122|
123|## Questions?
124|
125|Open an issue or start a discussion on GitHub.
126|