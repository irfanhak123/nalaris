# CLAUDE.md — Nalaris (Project Rumah)

> Context for Claude Code working in this repository.
> Read `README.md` first for quick start, and `panel/AGENTS.md` before touching the frontend.

---

## What this is

**Nalaris** is a local-first personal assistant built on [Hermes Agent](https://hermes-agent.nousresearch.com/docs). It is packaged as a single-process Python app with a bundled React panel.

- **Codename:** Project Rumah
- **Package name:** `nalaris`
- **CLI entry:** `nalaris-app`
- **Default port:** `8790`
- **License:** MIT

---

## Repository layout

```
nalaris/
├── pyproject.toml                  # Package config, deps, CLI scripts
├── README.md                       # Quick start & user docs
├── CONTRIBUTING.md                 # Frontend block-system guide
├── CLAUDE.md                       # This file
├── panel/                          # React panel source (dev only)
│   ├── package.json
│   ├── AGENTS.md                   # Authoritative frontend guide
│   └── src/                        # Vite + React + TypeScript + custom CSS
├── src/project_rumah/              # Python app source
│   ├── cli.py                      # CLI: serve, config, doctor, build-panel
│   ├── gateway/                    # Custom HTTP gateway on :8790
│   │   ├── server.py               # stdlib HTTPServer, serves panel + API
│   │   ├── agent_bridge.py         # Hermes AIAgent bridge
│   │   ├── session_store.py        # SQLite session/message persistence
│   │   ├── sse.py                  # Server-Sent Events formatting
│   │   ├── paths.py                # Centralized path resolution
│   │   ├── push.py                 # Web Push support (optional)
│   │   └── push_keys.py            # VAPID key helpers
│   ├── state.py                    # Vault/calendar/memory state reader
│   ├── compose.py                  # Block composition rules
│   ├── blocks.py                   # Inline-block fence parser
│   ├── chat.py                     # Chat action normalization
│   └── writes.py                   # Vault write operations
├── profile/                        # Hermes profile template
├── tests/                          # pytest suite
├── data/                           # Local runtime data
└── docs/                           # Additional documentation
```

---

## Architecture at a glance

```
Browser (:8790)
    |
    v
Nalaris Gateway (Python stdlib HTTPServer)
    |
    +---> /              Serves bundled React panel
    +---> /api/*         Chat, sessions, SSE streaming
    +---> /panel-session Cron/session bridge
    |
    v
Hermes Agent (AIAgent from run_agent.py)
    |
    +---> Tools, memory, skills, MCP
```

One process. One port. No Node.js at runtime.

---

## Development workflow

### Python / gateway

Nalaris must run from the **Hermes Agent virtual environment** because it imports
Hermes (`run_agent.AIAgent`) and its transitive dependencies (`openai`, `dotenv`, etc.).

```bash
HERMES_VENV="$HOME/.hermes/hermes-agent/venv"

# Install the package in editable mode with dev deps (inside the Hermes venv)
"$HERMES_VENV/bin/python" -m pip install -e ".[dev]"

# Run the app
"$HERMES_VENV/bin/python" -m project_rumah.cli serve
"$HERMES_VENV/bin/python" -m project_rumah.cli serve --port 9000

# Other useful commands
"$HERMES_VENV/bin/python" -m project_rumah.cli doctor
"$HERMES_VENV/bin/python" -m project_rumah.cli config
"$HERMES_VENV/bin/python" -m project_rumah.cli build-panel
```

If the Hermes venv is activated, the `nalaris-app` entry point works too:
```bash
source "$HERMES_VENV/bin/activate"
nalaris-app serve
```

### Panel / frontend

```bash
cd panel
npm install
npm run dev          # Vite at :5173, proxies API to :8790
npm run build        # TypeScript check + production build -> dist/
npm run typecheck    # TypeScript only
npm run preview      # Serve dist/ at :4173
```

To bundle the panel into the Python package:
```bash
nalaris-app build-panel
# or manually:
cd panel && npm run build
cp -r panel/dist/ src/project_rumah/static/
```

---

## Code conventions

### Python

- Python 3.11+.
- Gateway uses stdlib only for core HTTP handling. Optional Web Push uses `pywebpush`.
- Line length: 100 (Ruff default in `pyproject.toml`).
- No external web framework in the gateway — keep it stdlib-first.
- Prefer explicit `Path` objects for filesystem operations; use `gateway/paths.py` for project paths.
- The gateway bridges to Hermes via `AIAgent` in `agent_bridge.py`. Responses are extracted from `final_response`, not `content` or `text`.

### TypeScript / panel

- Strict TypeScript, ES2022 target, Vite 5.
- **Custom CSS only.** No Tailwind, no shadcn/ui, no CSS-in-JS, no CSS modules. All styles live in `panel/src/styles/base.css` using tokens from `tokens.css`.
- **Block registry is the single dispatch point.** To add a new block, create the component in `panel/src/components/blocks/<name>/<Name>Block.tsx` and register it in `panel/src/components/blocks/index.tsx`.
- Use Zod for runtime validation of action envelopes and API responses.
- All HTML rendering goes through `DOMPurify`.

### Block system

The agent emits structured UI blocks inline with prose. Two formats are accepted:

**Triple-backtick fence (LLM-generated):**
```
```block
{"type": "calendar_row", "data": {"time": "09:00", "title": "Standup"}}
```
```

**Inline bracket fence (deterministic backend / cron):**
```
[[block:calendar_row:{"time":"09:00","title":"Standup"}]]
```

The `ServerBlock` interface is defined in `panel/src/schemas/blocks.server.ts` and is the contract between backend and frontend.

---

## Testing & validation

### Python

```bash
pytest                    # Run test suite
python -m ruff check .  # Lint
python -m mypy src/     # Type check (when configured)
```

### Panel

```bash
cd panel
npm run typecheck         # Must pass with zero errors
npm run build             # Must produce a clean build
python3 tools/verify-blocks.py --types
```

---

## Common pitfalls

1. **One port only.** The gateway serves both static panel and API on `:8790`. There is no separate FastAPI server at runtime.
2. **Agent response key.** The bridge extracts `final_response` from the Hermes result dict (`{"final_response": ..., "last_reasoning": ..., "messages": [...]}`). Raw JSON in chat usually means extraction is wrong.
3. **No Tailwind in the panel.** The design system is entirely custom CSS. The file `panel/src/lib/tw-merge.ts` is legacy and unused.
4. **Block parsers use bracket-depth scanning.** Do not parse `[[block:...]]` fences with regex or naive string splitting; JSON payloads may contain nested `]]`.
5. **Fixed session model.** The panel uses a single session shared by user messages, cron ticks, and block actions. The session ID comes from `?session=`, localStorage, or is generated on first visit. See `panel/src/hooks/useChat.ts`.
6. **Zustand hydration must complete before boot.** The `useChat` boot effect waits for `hydrated === true`; otherwise every reload spawns a new session.
7. **Block actions become user messages.** A button click sends `[block-action] <kind> <payload>` as a regular user message to the gateway, and the agent responds.
8. **Session bridge.** The panel POSTs its active session ID to `/panel-session` so cron-delivered agent output lands in the right thread.

---

## Environment variables

| Variable | Config key | Default | Purpose |
|---|---|---|---|
| `RUMAH_MODEL` | `model` | `mimo-v2.5-pro` | Agent model |
| `RUMAH_PROVIDER` | `provider` | `xiaomi` | Agent provider |
| `RUMAH_BASE_URL` | `base_url` | (empty) | Custom base URL |
| `RUMAH_PORT` | `port` | `8790` | Gateway port |
| `RUMAH_HOST` | `host` | `0.0.0.0` | Gateway host |
| `RUMAH_WORKSPACE` | `workspace` | `~/workspace` | Workspace path |
| `RUMAH_DATA_DIR` | — | `~/.nalaris/data/` | SQLite / runtime data |
| `RUMAH_HERMES_ROOT` | — | `~/.hermes/hermes-agent/` | Hermes agent source root |
| `RUMAH_STATIC_DIR` | — | bundled static | Override panel static dir; set to `/dev/null` to disable |

---

## When changing...

- **CLI behavior:** edit `src/project_rumah/cli.py`.
- **API routes or panel serving:** edit `src/project_rumah/gateway/server.py`.
- **Hermes integration / streaming:** edit `src/project_rumah/gateway/agent_bridge.py` and `sse.py`.
- **Sessions or persistence:** edit `src/project_rumah/gateway/session_store.py`.
- **Block parsing / chat normalization:** edit `src/project_rumah/blocks.py` or `src/project_rumah/chat.py`.
- **New UI block type:** follow the 4-step guide in `CONTRIBUTING.md` and `panel/AGENTS.md`.
- **Panel styles:** edit `panel/src/styles/base.css` and `tokens.css` only.
- **Panel chat lifecycle:** edit `panel/src/hooks/useChat.ts`.

---

## Useful references

- `README.md` — user-facing quick start and architecture diagram
- `CONTRIBUTING.md` — frontend dev setup and block-system guide
- `panel/AGENTS.md` — deep-dive into panel-v2 architecture, block system, and pitfalls
- `docs/customization.md` — further customization docs
