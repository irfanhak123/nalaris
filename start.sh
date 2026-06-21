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
