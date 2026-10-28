#!/usr/bin/env bash
# Starts the LiteLLM proxy on 127.0.0.1:4000 with keys from .env.local.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env.local; set +a
: "${META_API_KEY:?META_API_KEY missing from .env.local}"
: "${SMART_WEB_PROXY_KEY:?SMART_WEB_PROXY_KEY missing from .env.local}"
exec "${LITELLM:-litellm}" --config proxy/config.yaml --host 127.0.0.1 --port 4000
