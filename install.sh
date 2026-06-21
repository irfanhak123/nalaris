1|#!/bin/bash
2|# Nalaris — Installation Script
3|# Sets up the personal-assistant profile and panel for Hermes Agent
4|set -euo pipefail
5|
6|echo "=== Nalaris — Personal AI Assistant ==="
7|echo ""
8|
9|# 1. Check Hermes is installed
10|if ! command -v hermes &> /dev/null; then
11|  echo "Error: hermes is not installed."
12|  echo "Install it first: https://hermes-agent.nousresearch.com/docs"
13|  exit 1
14|fi
15|echo "Hermes found: $(hermes --version 2>/dev/null || echo 'unknown version')"
16|
17|# 2. Create the rumah profile directory
18|PROFILE_DIR="${HERMES_HOME:-$HOME/.hermes}/profiles/rumah"
19|echo "Creating profile at $PROFILE_DIR..."
20|mkdir -p "$PROFILE_DIR/skills"
21|mkdir -p "$PROFILE_DIR/cron"
22|
23|# 3. Copy skills
24|SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
25|SKILLS_SRC="$SCRIPT_DIR/profile/skills"
26|
27|if [ -d "$SKILLS_SRC/personal-assistant" ]; then
28|  cp -r "$SKILLS_SRC/personal-assistant" "$PROFILE_DIR/skills/"
29|  echo "  Installed: personal-assistant skill"
30|fi
31|
32|if [ -d "$SKILLS_SRC/personal-assistant-chat-blocks" ]; then
33|  cp -r "$SKILLS_SRC/personal-assistant-chat-blocks" "$PROFILE_DIR/skills/"
34|  echo "  Installed: personal-assistant-chat-blocks skill"
35|fi
36|
37|# 4. Create config from example if not exists
38|CONFIG_EXAMPLE="$SCRIPT_DIR/profile/config.yaml.example"
39|CONFIG_FILE="$PROFILE_DIR/config.yaml"
40|if [ ! -f "$CONFIG_FILE" ] && [ -f "$CONFIG_EXAMPLE" ]; then
41|  cp "$CONFIG_EXAMPLE" "$CONFIG_FILE"
42|  echo "  Created: config.yaml (edit with your API keys)"
43|else
44|  echo "  Skipped: config.yaml already exists"
45|fi
46|
47|# 5. Build the panel
48|echo ""
49|echo "Building the panel..."
50|PANEL_DIR="$SCRIPT_DIR/panel-v2"
51|if [ -d "$PANEL_DIR" ]; then
52|  cd "$PANEL_DIR"
53|  npm install --production=false 2>/dev/null
54|  npm run build 2>/dev/null
55|  echo "  Panel built to $PANEL_DIR/dist/"
56|else
57|  echo "  Warning: panel-v2/ not found — build manually"
58|fi
59|
60|echo ""
61|echo "=== Installation complete ==="
62|echo ""
63|echo "Next steps:"
64|echo "  1. Edit $CONFIG_FILE with your API key and model settings"
65|echo "  2. Start the panel: cd panel-v2 && npm run dev"
66|echo "  3. Open http://localhost:5173"
67|echo ""
68|echo "To customize the assistant:"
69|echo "  - Edit the directive: $PROFILE_DIR/skills/personal-assistant/SKILL.md"
70|echo "  - Change the schedule: edit the cron job in the skill"
71|echo "  - Add habits: edit the vault (see profile README)"
72|