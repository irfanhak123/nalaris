#!/bin/bash
cd /mnt/d/project-rumah
set -a
source ~/.hermes/.env
export RUMAH_API_KEY="${XIAOMI_API_KEY:-}"
export RUMAH_PROVIDER="xiaomi"
export RUMAH_MODEL="mimo-v2.5-pro"
set +a
export PYTHONPATH="/home/laptophp/.hermes/hermes-agent:/mnt/d/project-rumah/src"
exec /home/laptophp/.hermes/hermes-agent/venv/bin/python -m project_rumah.gateway.server --port 8790
