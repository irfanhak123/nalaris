# AGENTS.md — Panel-v2 (Project Rumah)

> **Read this before making any changes to this codebase.**
> This file is the authoritative guide for any agent (human or AI) working on panel-v2.

---

## What this is

Panel-v2 is a **pure chat client** for the Hermes Agent personal assistant. It renders a single continuous conversation where user messages and cron-tick agent updates converge. The UI is built around a **block system** -- the agent emits structured `[[block:type:{json}]]` fences inline with prose, and the panel renders them as rich interactive components.

**"Project Rumah"** is the codename for the personal assistant system. The panel is one surface; the agent (running on a configurable cron schedule) is the load-bearing piece.

## What this is NOT

- **NOT a dashboard.** There is no sidebar, no `/state` endpoint usage, no stat cards, no habit tracker UI, no energy slider in the panel itself. All dashboard-style content arrives as blocks emitted by the agent in the chat stream.
- **NOT the old UI.** The legacy HTML panel and its original FastAPI routes are absorbed into the custom gateway at `:8790`. Panel-v2 is the only active frontend.
- **NOT a standalone app.** It depends on the custom gateway at `:8790` for session management, chat, and SSE streaming.

---

## Architecture

```
User types message
       |
       v
  useChat hook -----> gateway.startChat() ----> Custom Gateway (:8790)
       |                                              |
       v                                              v
  SSE stream <--------- /api/chat/stream <----- AgentBridge
       |                                              |
       v                                              v
  stream-blocks.ts parses fences              AIAgent (run_agent.py)
  from token stream                                    |
       |                                               v
       v                                       Hermes Agent processes
  ui_blocks: ServerBlock[]                    tools, memory, skills
       |                                               |
       v                                               v
  BlockRenderer dispatches to                  Response includes prose
  component registry (38 block types)          + [[block:...]] fences
       |
       v
  Rich UI rendered in chat stream
```

**Custom Gateway** (`/mnt/d/project-rumah/gateway/`): Python HTTP server on `:8790`. Owns all API routes panel-v2 needs. Bridges to the Hermes agent via `agent_bridge.py`. Absorbs legacy FastAPI routes (`/state`, `/blocks`, `/chat`, `/panel-session`).

**AgentBridge** (`gateway/agent_bridge.py`): Creates `AIAgent` instances per chat turn. Streams tokens back via `StreamHandle` queues. Extracts `final_response` from the agent's return dict (`{"final_response": ..., "last_reasoning": ..., "messages": [...]}`).

**Cron ticks:** The agent runs on a configurable schedule. Its output is posted to the same fixed session as a regular message. The panel polls every 30s and picks up new messages automatically.

**Session bridge:** On boot, the panel writes its active session ID to `http://localhost:8790/panel-session` so the cron agent knows where to deliver output.

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| **Framework** | React 18 | No SSR, no Next.js |
| **Language** | TypeScript 5.6 | Strict mode |
| **Bundler** | Vite 5 | HMR, ES2022 target |
| **State** | Zustand 4.5 | One store (`sessionStore`), persisted to localStorage |
| **Validation** | Zod 3.23 | Action envelopes, chat responses |
| **Markdown** | Marked 18 | GFM + breaks, rendered to HTML |
| **Sanitizer** | DOMPurify 3.4 | All HTML is sanitized |
| **IDs** | nanoid 5 | Block IDs, client message IDs |
| **Styling** | Custom CSS tokens | NO Tailwind, NO shadcn/ui, NO CSS-in-JS |

**Runtime:** Browser only. No Node.js, no SSR, no server components.

---

## File Structure

```
panel-v2/
├── AGENTS.md                          <- YOU ARE HERE
├── package.json                       <- deps, scripts
├── vite.config.ts                     <- dev proxy, build config
├── tsconfig.json                      <- strict TS, ES2022
├── tools/
│   └── verify-blocks.py               <- block syntax validator (Python)
├── src/
│   ├── App.tsx                        <- Root: Header + Stream + ChatInput
│   ├── main.tsx                       <- Entry point
│   ├── schemas/
│   │   ├── blocks.server.ts           <- ServerBlock interface (THE contract)
│   │   ├── blocks.spec.ts             <- Block type tests
│   │   └── action.ts                  <- Zod action envelope schemas
│   ├── lib/
│   │   ├── gateway.ts                 <- Gateway client (sessions, chat, SSE)
│   │   ├── api.ts                     <- FastAPI client (health, block actions)
│   │   ├── stream-blocks.ts           <- SSE stream parser (extracts blocks mid-stream)
│   │   ├── rich-content.ts            <- Markdown/[[block:...]] parser for finalized messages
│   │   ├── theme.ts                   <- Dark/light/auto theme controller
│   │   ├── blocks-adapter.ts          <- Block data normalization
│   │   ├── utils.ts                   <- Date/time formatting, misc helpers
│   │   ├── clsx.ts                    <- Class name utility
│   │   └── tw-merge.ts               <- Tailwind merge (legacy, mostly unused)
│   ├── stores/
│   │   └── sessionStore.ts            <- THE store: session, messages, streaming, draft
│   ├── hooks/
│   │   ├── useChat.ts                 <- Chat lifecycle: boot, poll, send, stream, cancel
│   │   └── useBlockAction.ts          <- Block action dispatch (button clicks, toggles)
│   ├── components/
│   │   ├── shell/
│   │   │   ├── Header.tsx             <- Brand + clock + theme toggle + clear chat
│   │   │   └── ThemeToggle.tsx        <- Dark/light/auto segmented control
│   │   ├── stream/
│   │   │   ├── Stream.tsx             <- Chat thread: scrollable message list
│   │   │   └── ChatMessage.tsx        <- Single message: blocks + prose + thinking + tools
│   │   ├── chat/
│   │   │   └── ChatInput.tsx          <- Composer textarea + send button
│   │   ├── rich/
│   │   │   └── RichContent.tsx        <- Markdown -> blocks -> BlockRenderer pipeline
│   │   └── blocks/
│   │       ├── index.tsx              <- Block registry + BlockRenderer + UnknownBlock
│   │       └── <type>/<Type>Block.tsx <- 38 individual block components
│   └── styles/
│       ├── tokens.css                 <- Design tokens (colors, spacing, typography)
│       └── base.css                   <- Reset, app shell, all component styles
```

---

## The Block System (Critical Knowledge)

### What are blocks?

Blocks are structured UI elements the agent emits inline with prose. Two formats exist:

**1. Triple-backtick fence (LLM-generated):**
````
```block
{"type": "calendar_row", "data": {"time": "09:00", "title": "Standup"}}
```
````

**2. Inline bracket fence (deterministic backend / cron):**
```
[[block:calendar_row:{"time":"09:00","title":"Standup"}]]
```

### The ServerBlock interface

```typescript
interface ServerBlock {
  id: string;                              // Auto-generated if missing
  type: string;                            // Maps to blockRegistry key
  weight?: number;                         // Layout priority (default 50)
  data: Record<string, unknown>;           // Type-specific payload
  intent?: {                               // Action binding
    kind: string;
    qid?: string;
    name?: string;
    payload?: Record<string, unknown>;
  };
  ttl?: number;                            // Auto-expire after N seconds
}
```

### Block types (38 registered)

**Content:** `chat_message`, `heading`, `quote`, `highlight`, `divider`, `code`, `image`, `embed`, `file_card`

**Layout:** `columns`, `section`, `tabs`

**Data:** `stat`, `table`, `progress`, `countdown`, `streak`, `heartbeat`, `pulse_card`

**Calendar:** `calendar_row`, `calendar_down`, `calendar_day`, `agenda`, `timeline`, `deadline`

**Interactive:** `question`, `proactive_question`, `quick_replies`, `button_row`, `slider`, `picker`, `confirm`, `actions`, `checklist`, `habit`

**Status:** `callout`, `greeting`, `one_thing`, `success`, `error`, `empty`, `skeleton`, `spinner`

### Adding a new block type

1. Create `src/components/blocks/<name>/<Name>Block.tsx`
2. Import and add to `blockRegistry` in `src/components/blocks/index.tsx`
3. Add schema to `tools/verify-blocks.py` `BLOCK_TYPES` dict
4. No other files need changing -- the registry is the single dispatch point

### Block action flow

When a user clicks an interactive element (button, checkbox, etc.):
1. Block component calls `useBlockAction().sendAction({ kind, payload, label })`
2. Fire-and-forget kinds (`ack`, `dismiss`, `block.dismiss`) are handled locally
3. All other kinds are sent as a user message: `[block-action] <kind> <payload>`
4. The agent receives this as a regular user message and can respond
5. Fast-poll (3s + 8s) fetches the agent's response

---

## Key Patterns

### Fixed session model

The panel uses a **single fixed session**. This session is shared across:
- User messages (typed in the composer)
- Cron ticks (periodic output from the agent)
- Block actions (button clicks forwarded as messages)

The session ID is resolved from the `?session=` URL param, localStorage, or generated on first visit (see `useChat.ts`). All messages converge in one thread.

### Boot lifecycle

```
1. Zustand rehydrates from localStorage (session_id, messages, draft)
2. useChat reads the fixed session from gateway
3. If session doesn't exist, creates it
4. Reconciles local messages with server messages
5. If session has active_stream_id, attaches to live SSE
6. Starts 30s poll interval for cron ticks
7. Boot done -- composer enables
```

### Message reconciliation

`reconcileMessages(local, server)` merges server truth with local optimistic state:
- Server messages are authoritative
- Local `client_msg_id` messages (optimistic user bubbles) are preserved until server confirms
- Streaming assistant messages are kept alive
- `reExtractBlocks()` strips `[[block:...]]` fences from finalized content into `ui_blocks`

### SSE stream parsing

During an active turn, tokens stream through `stream-blocks.ts`:
- Stateful parser buffers tokens
- Detects both `` ```block `` and `[[block:]]` fence starts
- Captures JSON content until closing fence
- Strips fences from visible text, accumulates blocks
- `feedStream()` returns `{ text, blocks }` on each token
- `finalizeStream()` cleans up unclosed fences on stream end

### Markdown -> blocks (rich-content.ts)

For finalized (non-streaming) messages, `parseRichContent()` converts markdown into blocks:
1. Extract `[[block:type:{json}]]` fences -> ServerBlock objects
2. Extract `` ```block ``` `` code fences -> ServerBlock objects
3. Detect callouts (`> [!warning]`)
4. Detect calendar events (`09:00 -- Meeting`)
5. Detect checklists (`- [ ] / - [x]`)
6. Detect tables (`| col | col |`)
7. Detect questions (paragraph ending with `?` + option list)
8. Everything else -> `chat_message` block (renders as HTML)

---

## Design System

### Tokens (tokens.css)

- **Two themes:** dark (default) and light, toggled via `data-theme` on `<html>`
- **Mode accents:** `data-mode` attribute on containers sets accent color per time-of-day (morning-rise, mid-day, afternoon-wind-down, evening-wind-down, night)
- **Typography:** Inter (sans), JetBrains Mono (monospace)
- **Spacing scale:** `--s-1` (4px) through `--s-11` (160px)
- **Font sizes:** `--fs-12` through `--fs-48`
- **Motion:** `--dur-instant` (60ms), `--dur-fast` (120ms), `--dur-normal` (200ms)

### Layout

- Full-viewport chat, no sidebar
- Header: 64px fixed, brand + clock + theme toggle + clear
- Stream: flex-grow, scrollable, max-width 1400px
- Composer: 72px fixed, textarea + send button, max-width 1200px
- Message gap: 28px between messages, 16px between blocks within a message

### Style rules

- **All styles in `base.css`** using CSS custom properties from `tokens.css`
- **No Tailwind.** No utility classes. No CSS modules. No styled-components.
- **Block styles use `.block` base class** plus type-specific classes
- Color is reserved for information (black + white primary, accent for active state)

---

## Development

### Commands

```bash
npm run dev          # Vite dev server at :5173 (proxies to gateway :8790)
npm run build        # TypeScript check + Vite build -> dist/
npm run preview      # Preview production build at :4173
npm run typecheck    # TypeScript type checking only (no emit)
```

### Dev proxy (vite.config.ts)

| Path | Target | Purpose |
|---|---|---|
| `/api/*` | `localhost:8790` | Custom gateway (sessions, chat, SSE) -- strips Origin/Referer for CSRF |
| `/state` | `localhost:8790` | Legacy state endpoint (absorbed into gateway) |
| `/blocks` | `localhost:8790` | Legacy blocks endpoint (absorbed into gateway) |
| `/chat` | `localhost:8790` | Legacy chat endpoint (absorbed into gateway) |
| `/health` | `localhost:8790` | Gateway health check |
| `/panel-session` | `localhost:8790` | Session bridge for cron delivery |

### Gateway startup

The custom gateway runs from `/mnt/d/project-rumah/gateway/`:

```bash
# Start gateway (from project-rumah directory)
cd /mnt/d/project-rumah
source ~/.hermes/.env
export PYTHONPATH="/home/laptophp/.hermes/hermes-agent:/mnt/d/project-rumah/src:/mnt/d/project-rumah"
python -m gateway.server --port 8790

# Or use the start script
/mnt/d/project-rumah/start-gateway.sh
```

The gateway loads `agent_bridge.py` which imports `AIAgent` from `run_agent.py` (Hermes agent). Each chat turn creates a new agent instance that streams tokens back via SSE.

### Block verification tool

```bash
python3 tools/verify-blocks.py --types           # List all registered block types
python3 tools/verify-blocks.py <file>             # Validate block fences in a file
python3 tools/verify-blocks.py --schema <type>    # Show expected schema for a type
echo '[[block:stat:{"label":"X","value":"1"}]]' | python3 tools/verify-blocks.py -
```

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `VITE_GATEWAY_BASE` | `http://localhost:8790` | Custom gateway URL override |
| `VITE_API_BASE` | `http://localhost:8790` | Same as gateway (legacy FastAPI absorbed) |
| `RUMAH_MODEL` | `mimo-v2.5-pro` | Agent model override |
| `RUMAH_PROVIDER` | `xiaomi` | Agent provider override |

---

## Pitfalls

1. **Don't confuse panel-v2 with the old UI.** The legacy HTML panel and its original FastAPI routes are absorbed into the custom gateway at `:8790`. Panel-v2 is the only active frontend.

2. **The custom gateway is the source of truth.** Sessions, messages, and chat all go through the gateway at `:8790`. The gateway bridges to the Hermes agent via `agent_bridge.py`.

3. **Don't add Tailwind or shadcn.** The design system is custom CSS with tokens. All styles live in `base.css`. Block components use plain CSS classes.

4. **The session ID is dynamic.** It comes from the `?session=` URL param, localStorage, or is generated on first visit. See `resolveSessionId()` in `useChat.ts`.

5. **Block fences can contain nested `]]` in JSON.** The parsers use bracket-depth scanning, not regex. Don't try to parse `[[block:...]]` with simple string splitting or regex.

6. **Hydration must complete before boot.** Zustand persist rehydration is async. The boot effect in `useChat` must wait for `hydrated === true` before reading/creating sessions, or every reload spawns a new session.

7. **`reExtractBlocks()` strips LLM instruction prefixes.** Lines starting with `[REMINDER:` or `[UI BLOCK FORMAT]` are filtered out before block extraction. These are system instructions the LLM stored in messages, not user-visible content.

8. **Block actions are user messages.** When a user clicks a button, it sends `[block-action] <kind> <payload>` as a regular user message to the gateway. The agent sees it as user input and can respond with tools or new blocks.

9. **CSS variable `--surface-glass`** is used for sticky elements (header) to create a translucent effect. It's theme-aware (different values for dark/light).

10. **The `tw-merge.ts` file is legacy.** It exists from an earlier Tailwind-based iteration. Ignore it -- all styles are in `base.css`.

11. **Agent response extraction.** `AIAgent.run_conversation()` returns `{"final_response": "...", "last_reasoning": "...", "messages": [...]}`. The bridge extracts `final_response` (not `content` or `text`). If you see raw JSON dumped in the chat, the bridge is not extracting the right key.

---

## Deployment

The panel is a static SPA. Build with `npm run build`, serve `dist/` from any static file server. In production, the gateway at `:8790` serves the panel same-origin (no CORS needed).

For development, Vite's dev server at `:5173` proxies API calls to the gateway.

---

## Dependencies

### Runtime
- `react` + `react-dom` 18.3 -- UI framework
- `zustand` 4.5 -- State management with localStorage persistence
- `zod` 3.23 -- Runtime type validation for action envelopes
- `marked` 18.0 -- Markdown parsing (GFM, breaks)
- `dompurify` 3.4 -- HTML sanitization
- `nanoid` 5.0 -- Unique ID generation

### Dev
- `vite` 5.4 -- Build tool + dev server
- `@vitejs/plugin-react` 4.3 -- React fast refresh
- `typescript` 5.6 -- Type checking
- `@types/react` + `@types/react-dom` -- Type definitions
- `@types/dompurify` -- DOMPurify types
