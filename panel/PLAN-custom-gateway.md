# Plan: Build Our Own Gateway for Project Rumah

> Build a custom gateway server that replaces hermes-webui.
> Our code, our rules, expandable.

---

## What hermes-webui Does (the part we need)

hermes-webui is a Python HTTP server (`server.py` + `api/routes.py`) that:

1. **Manages sessions** — create, read, clear, persist to SQLite
2. **Runs the AI agent** — spawns AIAgent, submits prompts, streams responses
3. **Serves SSE streams** — token-by-token streaming to the browser
4. **Serves the SPA** — static files for the React panel

It does a LOT more (auth, workspaces, file browser, settings, OAuth, TTS, etc.)
but panel-v2 only needs the 7 API endpoints listed below.

## Architecture

```
panel-v2 (React SPA)
    |
    +--> Our Gateway (Python, port 8790)
            |
            +-- /api/* routes (sessions, chat, SSE)
            +-- /state, /blocks, /panel-session (from old FastAPI)
            +-- /health
            +-- static file serving (panel-v2 dist/)
            |
            +-- AIAgent (from hermes-agent venv)
                - run_conversation() with stream callbacks
                - tool_start/complete callbacks
```

## API Surface (7 endpoints panel-v2 needs)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/session?session_id=X&messages=1` | Read session + history |
| POST | `/api/session/new` | Create session |
| POST | `/api/session/draft` | Save draft |
| POST | `/api/session/clear` | Clear messages |
| POST | `/api/chat/start` | Start chat turn → returns stream_id |
| GET | `/api/chat/stream?stream_id=X` | SSE stream of tokens/events |
| POST | `/api/chat/cancel` | Cancel stream |

Plus the existing FastAPI endpoints:
| GET | `/health` | Health check |
| GET | `/state` | Vault + calendar + memory state |
| GET | `/blocks` | Composed blocks array |
| POST | `/panel-session` | Session bridge for cron |
| POST | `/chat` | Legacy chat (block actions) |

## File Structure

```
/mnt/d/project-rumah/
├── gateway/
│   ├── __init__.py
│   ├── server.py              # Main HTTP server (ThreadingHTTPServer)
│   ├── routes.py              # Route handler dispatch
│   ├── session_store.py       # SQLite session/message persistence
│   ├── agent_bridge.py        # AIAgent lifecycle + streaming
│   ├── sse.py                 # SSE event generator
│   └── legacy_routes.py       # Absorbed FastAPI endpoints (/state, /blocks, etc.)
│
├── src/project_rumah/         # Keep existing code for now
│   ├── server.py              # OLD FastAPI (will be replaced)
│   ├── blocks.py              # Block composition (import into gateway)
│   ├── compose.py             # Block composer (import into gateway)
│   ├── state.py               # State reader (import into gateway)
│   ├── chat.py                # Legacy chat handler
│   └── writes.py              # Write handlers
│
└── panel-v2/
    └── vite.config.ts         # Update proxy to :8790
```

## Implementation Order

### Step 1: session_store.py
SQLite store for sessions + messages. Schema compatible with Hermes state.db.

### Step 2: agent_bridge.py
Bridge to AIAgent — create agent, submit prompt, stream tokens via callbacks.

### Step 3: sse.py
SSE event formatter matching panel-v2's `parseSse()` expectations.

### Step 4: server.py + routes.py
HTTP server with route dispatch. Pattern: `if path == "/api/session": return handle_*(parsed)`.

### Step 5: legacy_routes.py
Absorb /state, /blocks, /panel-session, /health from old FastAPI.

### Step 6: Wire panel-v2
Update vite.config.ts proxy to point at our gateway on :8790.

### Step 7: Test end-to-end
Send message → see streamed response → blocks render.

## Key Technical Details

**AIAgent import** (verified working):
```python
import sys
sys.path.insert(0, "/home/laptophp/.hermes/hermes-agent")
from run_agent import AIAgent
from gateway.run import _resolve_runtime_agent_kwargs, _resolve_gateway_model
```

**Stream callback** (verified):
```python
agent.run_conversation(
    user_message="Hello",
    stream_callback=lambda text: queue.put({"type": "token", "data": {"text": text}}),
)
```

**SSE format** (from panel-v2's `parseSse()`):
```
event: token
data: {"text": "Hello"}

event: done
data: {"finish_reason": "stop"}
```

## What We're NOT Building (yet)

- Auth / login / passkeys
- Workspace file browser
- Settings / config UI
- Model picker
- TTS
- OAuth
- Multi-session sidebar

These can be added later. The gateway starts lean.
