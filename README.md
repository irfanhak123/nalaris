# Nalaris — Personal AI Assistant

Nalaris is a personal assistant system built on [Hermes Agent](https://github.com/nousresearch/hermes-agent). It combines an always-on AI agent with a chat panel that renders rich interactive components — calendars, habit trackers, checklists, questions — directly in the conversation.

## What it does

- **Always-on assistant** — runs every 30 minutes (7am–11pm), surfaces what matters, stays quiet when there's nothing to say
- **Rich block UI** — 38 block types render inline in chat (calendar, habits, sliders, questions, tables, countdowns)
- **Multiple profiles** — each user gets their own assistant with their own habits, goals, and preferences
- **Guided onboarding** — first-run conversation collects your name, timezone, goals, and habits
- **Reflective tone** — asks questions that help you think, not checklists that demand compliance

## Quick start

```bash
# 1. Install Hermes Agent
# https://github.com/nousresearch/hermes-agent

# 2. Clone and install Nalaris
git clone https://github.com/irfanhak123/nalaris.git
cd nalaris
chmod +x install.sh
./install.sh

# 3. Edit config with your API key
nano ~/.hermes/profiles/nalaris/config.yaml

# 4. Start
chmod +x start.sh
./start.sh

# 5. Open http://localhost:5173
```

On first launch, Nalaris guides you through onboarding — your name, timezone, goals, and starting habits. After that, it just works.

## Architecture

```
User
  |
  v
Panel (React SPA) <──> Hermes Gateway <──> LLM (any provider)
  |                        |
  |                  Nalaris Profile
  |                  - personal-assistant skill (directive)
  |                  - personal-assistant-chat-blocks skill
  |                  - nalaris-onboarding skill
  |                  - vault (habits, goals, journal)
  |                  - cron (30-min ticks)
  |
  Block Renderer
  (38 block types)
```

**Hermes** provides the AI agent, gateway, session management, tool execution, and cron scheduling. **Nalaris** adds the panel UI, the personal-assistant skills, and the onboarding flow.

## Block system

The agent emits `[[block:type:{json}]]` fences inline with prose. The panel parses these and renders rich interactive components:

| Category | Blocks |
|----------|--------|
| **Content** | heading, quote, highlight, divider, code, image |
| **Data** | stat, table, progress, countdown, heartbeat |
| **Calendar** | calendar_row, calendar_day, agenda, timeline, deadline |
| **Interactive** | question, button_row, slider, picker, checklist, habit |
| **Layout** | columns, section, tabs |
| **Status** | callout, greeting, one_thing, success, error |

## Profiles

Each profile is a Hermes profile at `~/.hermes/profiles/<name>/` with:

- `config.yaml` — model, API key, schedule
- `skills/` — the Nalaris skills
- `vault/` — user's personal data (habits, goals, journal)
- `memories/` — agent's learned facts about the user

The panel lets you switch between profiles. Creating a new profile triggers onboarding.

## Customization

- **Change the tone:** Edit `vault/Ops/agent-directive.md` in your profile
- **Add habits:** Edit `vault/Ops/habits/catalog/daily-habits.md`
- **Change schedule:** Edit the cron job in your profile config
- **Change the model:** Edit `config.yaml` with any OpenAI-compatible provider

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
