1|# Nalaris Profile — Hermes Profile for Personal Assistant
2|
3|This directory contains a Hermes profile that turns Hermes Agent into a personal assistant.
4|
5|## What's included
6|
7|```
8|profile/
9|  config.yaml.example     # Example config — copy to config.yaml and fill in your keys
10|  skills/
11|    personal-assistant/          # The directive skill — drives the agent's behavior
12|      SKILL.md                   # The main directive (tone, decision tree, vault rules)
13|    personal-assistant-chat-blocks/  # Block emission skill — how to render UI blocks
14|      SKILL.md                   # Block format, catalog, action protocol
15|```
16|
17|## How it works
18|
19|The `personal-assistant` skill is loaded by Hermes on every cron tick (every 30 minutes, 07:00-23:00). It tells the agent:
20|
21|- What to read (calendar, vault, habits)
22|- When to surface things (context modes by time of day)
23|- How to talk to you (reflective tone, not managerial)
24|- What blocks to emit (calendar, habits, questions, checklists)
25|
26|The `personal-assistant-chat-blocks` skill defines the block format — the 38 block types the agent can emit to render rich UI in the chat stream.
27|
28|## Customization
29|
30|### Change the schedule
31|Edit the cron job in `personal-assistant/SKILL.md` under "Prerequisites". The default is `*/30 7-23 * * *` (every 30 minutes, 7am-11pm).
32|
33|### Change the tone
34|Edit the "Tone rules" section in `personal-assistant/SKILL.md`. The current tone is reflective — the agent asks questions that help you think, not checklists that demand compliance.
35|
36|### Add habits
37|Create markdown files in your vault following the habit catalog format. The agent reads them on morning and evening ticks.
38|
39|### Change the model
40|Edit `config.yaml` to point to any OpenAI-compatible provider. The agent works with any LLM that supports tool calling.
41|
42|## Connecting the panel
43|
44|The panel is a React SPA that connects to the Hermes gateway. By default it connects to `localhost:8787`. To change this:
45|
46|1. Set `VITE_GATEWAY_BASE=http://your-gateway:port` when building
47|2. Or pass `?gateway=http://your-gateway:port` as a URL parameter
48|
49|## Troubleshooting
50|
51|- **Agent doesn't respond:** Check that the Hermes gateway is running (`hermes gateway status`)
52|- **No blocks rendered:** Check that the chat-blocks skill is installed in the profile
53|- **Calendar not working:** Set up Google Workspace credentials (see Hermes docs)
54|- **Cron not firing:** Check `hermes cron list` to see if the job is active
55|