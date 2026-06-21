# panel-v2 — Project Rumah v3 panel

The personal-assistant harness's UI surface. Vite + React + TypeScript.
Read+write + static sidebar + 5s polling. SSE and sticky rail deferred to v2.

Per the v3 PRD: the **agent loop is the load-bearing piece, not this surface**.
The panel is one consumer of the FastAPI server on `:8790`.

## Develop

```bash
# 1. Make sure the FastAPI harness server is running on :8790
#    (see /mnt/d/project-rumah — `python -m project_rumah.server` or via systemd)

# 2. Install deps and start Vite dev server
cd /home/laptophp/workspace/panel-v2
npm install
npm run dev
# → http://127.0.0.1:5173
```

Vite proxies `/state`, `/blocks`, `/chat`, `/write`, `/health` to `:8790`.

## Build

```bash
npm run build      # → dist/
npm run preview    # serve dist/ for smoke test
```

## Endpoints used (v0.3 server)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness check |
| GET | `/state` | Sidebar snapshot |
| GET | `/blocks` | Main feed (polled every 5s) |
| POST | `/chat` | Conversational sends + block actions |
| POST | `/write/{kind}` | Quick actions: `habit` / `energy` / `one_thing` / `journal` |

## Block shapes

This v1 panel renders the **v0.3 server's block shape** (`type` / `weight` / `data` / `intent`).
The v2 spec shape (`block_type` / `lifecycle` / `actions[]`) is parsed in
`src/schemas/blocks.spec.ts` and ready for the v2 cutover — flip
`ACTIVE_BLOCK_SHAPE` in `src/lib/blocks-adapter.ts` when the server upgrades.

## Layout

```
panel-v2/
├── src/
│   ├── App.tsx                      ← shell
│   ├── main.tsx                     ← entry
│   ├── components/
│   │   ├── blocks/                  ← 13 block renderers (registry pattern)
│   │   ├── sidebar/Sidebar.tsx
│   │   ├── stream/Stream.tsx
│   │   ├── chat/ChatInput.tsx + PollingBadge.tsx
│   │   └── shell/Header + HarnessOfflineBanner
│   ├── lib/api.ts                   ← typed fetch client
│   ├── lib/poll.ts                  ← 5s polling + dedupe
│   ├── lib/blocks-adapter.ts        ← cutover switch (server ↔ spec)
│   ├── lib/utils.ts                 ← cn, fmtTime, fmtRelative, idSetHash
│   ├── stores/                      ← zustand: stream, sidebar, connection
│   ├── schemas/                     ← zod: blocks.server, blocks.spec, state, action
│   ├── hooks/                       ← useFirstPaint, useMode, useCountdowns, useWriteAction
│   └── styles/
│       ├── tokens.css               ← design-system variables
│       └── base.css                 ← all component CSS
├── package.json
├── tsconfig.json
├── vite.config.ts
└── index.html
```

## v2 deferred (when v1 is stable 14 days)

- SSE streaming replaces polling
- Sticky rail replaces the static sidebar
- User pin/unpin
- Voice / TTS
- Mobile / PWA
