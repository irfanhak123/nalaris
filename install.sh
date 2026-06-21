#!/bin/bash
# Nalaris — Installation Script
# Creates a self-contained Hermes profile with everything needed to run.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"

echo "=== Nalaris — Personal AI Assistant ==="
echo ""

# 1. Check Hermes is installed
if ! command -v hermes &> /dev/null; then
  echo "Error: hermes is not installed."
  echo "Install it first: https://hermes-agent.nousresearch.com/docs"
  exit 1
fi
echo "Hermes found: $(hermes --version 2>/dev/null || echo 'unknown version')"

# 2. Create the Nalaris profile via Hermes
PROFILE_NAME="nalaris"
PROFILE_DIR="$HERMES_HOME/profiles/$PROFILE_NAME"

if [ -d "$PROFILE_DIR" ]; then
  echo "Profile '$PROFILE_NAME' already exists at $PROFILE_DIR"
  read -p "Overwrite? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
fi

echo "Creating Hermes profile: $PROFILE_NAME..."
hermes profile create "$PROFILE_NAME" 2>/dev/null || mkdir -p "$PROFILE_DIR"

# 3. Copy skills
echo "Installing skills..."
SKILLS_SRC="$SCRIPT_DIR/profile/skills"
mkdir -p "$PROFILE_DIR/skills"

if [ -d "$SKILLS_SRC/personal-assistant" ]; then
  cp -r "$SKILLS_SRC/personal-assistant" "$PROFILE_DIR/skills/"
  echo "  + personal-assistant"
fi

if [ -d "$SKILLS_SRC/personal-assistant-chat-blocks" ]; then
  cp -r "$SKILLS_SRC/personal-assistant-chat-blocks" "$PROFILE_DIR/skills/"
  echo "  + personal-assistant-chat-blocks"
fi

if [ -d "$SKILLS_SRC/nalaris-onboarding" ]; then
  cp -r "$SKILLS_SRC/nalaris-onboarding" "$PROFILE_DIR/skills/"
  echo "  + nalaris-onboarding"
fi

# 4. Copy vault templates
echo "Setting up vault..."
VAULT_SRC="$SCRIPT_DIR/profile/vault-templates"
VAULT_DIR="$PROFILE_DIR/vault"
mkdir -p "$VAULT_DIR/Ops/habits/catalog" "$VAULT_DIR/Ops/habits/routines" "$VAULT_DIR/Ops/habits/templates" "$VAULT_DIR/Journal"

# Copy vault templates
cp -r "$VAULT_SRC/Ops/"* "$VAULT_DIR/Ops/" 2>/dev/null || true
cp "$VAULT_SRC/index.md" "$VAULT_DIR/" 2>/dev/null || true
echo "  + vault templates"

# 5. Create config.yaml
CONFIG_FILE="$PROFILE_DIR/config.yaml"
if [ ! -f "$CONFIG_FILE" ] || [ "$FORCE_OVERWRITE" = "1" ]; then
  cat > "$CONFIG_FILE" << 'HEREDOC'
# Nalaris — Hermes Profile Configuration
# Edit this file with your API key and model settings.

model:
  # Change these to your provider
  base_url: https://api.openai.com/v1
  default: gpt-4o-mini
  provider: openai

providers: {}
fallback_providers: []

toolsets:
- hermes-cli
- terminal
- file
- web

agent:
  max_turns: 50
  gateway_timeout: 1800
  tool_use_enforcement: auto
  task_completion_guidance: true

# Cron: every 30 minutes, 7am-11pm
# The personal-assistant skill drives what happens each tick.
cron:
  enabled: true
  jobs:
    - name: nalaris-harness
      schedule: "*/30 7-23 * * *"
      prompt: "Read the agent directive at vault/Ops/agent-directive.md and act. Check if onboarding is complete first — if not, run the onboarding flow."
      skills:
        - personal-assistant
        - personal-assistant-chat-blocks
        - nalaris-onboarding
      deliver: local
HEREDOC
  echo "  + config.yaml (edit with your API key)"
else
  echo "  ~ config.yaml already exists (not overwritten)"
fi

# 6. Build the panel
echo ""
echo "Building the panel..."
PANEL_DIR="$SCRIPT_DIR/panel-v2"
if [ -d "$PANEL_DIR" ]; then
  cd "$PANEL_DIR"
  
  # Create .env pointing to this profile
  cat > .env << EOF
VITE_GATEWAY_BASE=http://localhost:8787
VITE_WORKSPACE=$VAULT_DIR
VITE_PROFILE=$PROFILE_NAME
EOF

  npm install --production=false 2>/dev/null
  npm run build 2>/dev/null
  echo "  + panel built to $PANEL_DIR/dist/"
else
  echo "  ~ panel-v2/ not found — build manually"
fi

# 7. Create start script
START_SCRIPT="$SCRIPT_DIR/start.sh"
cat > "$START_SCRIPT" << 'STARTEOF'
#!/bin/bash
# Nalaris — Start Script
# Launches the gateway and serves the panel.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROFILE_NAME="nalaris"
PANEL_PORT="${PANEL_PORT:-5173}"

echo "=== Starting Nalaris ==="

# Start the Hermes gateway for the nalaris profile
echo "Starting gateway..."
hermes gateway start --profile "$PROFILE_NAME" &
GATEWAY_PID=$!
sleep 2

# Serve the panel
echo "Starting panel on port $PANEL_PORT..."
cd "$SCRIPT_DIR/panel-v2"
npx vite preview --host 0.0.0.0 --port "$PANEL_PORT" &
PANEL_PID=$!

echo ""
echo "=== Nalaris is running ==="
echo "  Panel:   http://localhost:$PANEL_PORT"
echo "  Gateway: http://localhost:8787"
echo ""
echo "Press Ctrl+C to stop."

# Wait for either process to exit
trap "kill $GATEWAY_PID $PANEL_PID 2>/dev/null" EXIT
wait
STARTEOF
chmod +x "$START_SCRIPT"
echo "  + start.sh"

echo ""
echo "=== Installation complete ==="
echo ""
echo "Next steps:"
echo "  1. Edit $CONFIG_FILE with your API key"
echo "  2. Run: $START_SCRIPT"
echo "  3. Open http://localhost:5173"
echo "  4. Nalaris will guide you through onboarding"
