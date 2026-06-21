#!/bin/bash
cd /mnt/d/project-rumah
set -a
source ~/.hermes/.env
set +a
export PYTHONPATH="/home/laptophp/.hermes/hermes-agent:/mnt/d/project-rumah/src:/mnt/d/project-rumah"
exec /home/laptophp/.hermes/hermes-agent/venv/bin/python -m gateway.server --port 8790
