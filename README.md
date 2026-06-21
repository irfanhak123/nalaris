# Nalaris

> Personal assistant built on [Hermes Agent](https://hermes-agent.nousresearch.com/docs). Local-first AI for daily ops, scheduling, and quick captures.

## Quick Start

```bash
# 1. Install Hermes Agent (if not already installed)
#    See: https://hermes-agent.nousresearch.com/docs

# 2. Install Nalaris
pip install -e .

# 3. Check everything is set up
nalaris-app doctor

# 4. Start the app
nalaris-app serve
# -> http://localhost:8790
```

If `nalaris-app` is not in your PATH, use:
```bash
python3 -m project_rumah.cli serve
```

That's it. One install, one command.

## What You Get

A single-process web app that gives you:

- **AI chat** powered by Hermes Agent (streaming, tool use, memory)
- **Rich block-based UI** — the agent renders interactive components inline (calendars, checklists, buttons, stats)
- **Session persistence** — conversations survive restarts (SQLite)
- **Cron integration** — the agent can post updates on a schedule

## Configuration

```bash
# Show current config
nalaris-app config

# Set model and provider
nalaris-app config set model mimo-v2.5-pro
nalaris-app config set provider xiaomi

# Set custom port
nalaris-app config set port 9000

# Config file: ~/.nalaris/config.json
```

Environment variables override config values:

| Env Var | Config Key | Default |
|---|---|---|
| `RUMAH_MODEL` | `model` | `mimo-v2.5-pro` |
| `RUMAH_PROVIDER` | `provider` | `xiaomi` |
| `RUMAH_BASE_URL` | `base_url` | (empty) |
| `RUMAH_PORT` | `port` | `8790` |
| `RUMAH_HOST` | `host` | `0.0.0.0` |
| `RUMAH_WORKSPACE` | `workspace` | `~/workspace` |
| `RUMAH_DATA_DIR` | — | `~/.nalaris/data/` |
| `RUMAH_HERMES_ROOT` | — | `~/.hermes/hermes-agent/` |

## CLI Commands

```
nalaris-app serve              Start the app (gateway + panel on one port)
nalaris-app serve --port 9000  Custom port
nalaris-app config             Show current config
nalaris-app config set KEY VAL Set a config value
nalaris-app config get KEY     Get a config value
nalaris-app doctor             Check if everything is set up correctly
nalaris-app build-panel        Build panel and bundle static files
```

Alternative: `python3 -m project_rumah.cli <command>`

## Architecture

```
Browser (:8790)
    |
    v
Nalaris Gateway (Python stdlib HTTPServer)
    |
    +---> /              Serves panel (React, bundled as static files)
    +---> /api/*         Chat, sessions, SSE streaming
    +---> /panel-session Cron bridge (session ID handoff)
    |
    v
Hermes Agent (AIAgent from run_agent.py)
    |
    +---> Tools, memory, skills, MCP
```

One process. One port. No Node.js at runtime.

## Development

```bash
# Clone and install in dev mode
git clone https://github.com/irfanhak123/nalaris.git
cd nalaris
pip install -e ".[dev]"

# Panel development (hot reload)
cd panel
npm install
npm run dev          # -> http://localhost:5173 (proxies to gateway :8790)

# Gateway only (without bundled panel)
RUMAH_STATIC_DIR=/dev/null nalaris-app serve

# Build and bundle panel into the package
nalaris-app build-panel
# or manually:
cd panel && npm run build
cp -r dist/ ../src/project_rumah/static/
```

## Project Structure

```
nalaris/
├── pyproject.toml                          <- Package config, CLI entry points
├── README.md                               <- You are here
├── LICENSE                                 <- MIT
├── install.sh                              <- Profile-based installer (alternative)
├── panel/                                  <- React panel source (dev only)
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx
│       ├── components/blocks/              <- 38 block type renderers
│       ├── lib/gateway.ts                  <- Gateway API client
│       └── hooks/useChat.ts                <- Chat lifecycle
├── src/project_rumah/
│   ├── __init__.py
│   ├── cli.py                              <- CLI entry point
│   ├── static/                             <- Bundled panel build output
│   ├── gateway/
│   │   ├── __init__.py
│   │   ├── server.py                       <- HTTP gateway (serves panel + API)
│   │   ├── agent_bridge.py                 <- Hermes AIAgent bridge
│   │   ├── session_store.py                <- SQLite session/message store
│   │   ├── sse.py                          <- Server-Sent Events formatter
│   │   └── paths.py                        <- Centralized path resolution
│   ├── state.py                            <- Vault/calendar/memory state reader
│   ├── compose.py                          <- Block composition rules
│   ├── blocks.py                           <- Inline-block fence parser
│   ├── chat.py                             <- Chat action normalization
│   └── writes.py                           <- Vault write operations
├── profile/                                <- Hermes profile template
└── tests/
    ├── test_chat.py
    └── test_blocks.py
```

## The Block System

The agent emits structured UI blocks inline with prose:

```
[[block:calendar_row:{"time":"09:00","title":"Standup"}]]
```

The panel parses these fences mid-stream and renders interactive components. 38 block types are supported: calendar, checklists, buttons, sliders, tables, stats, and more.

## License

MIT
