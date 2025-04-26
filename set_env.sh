#!/usr/bin/env bash
#
# Load .env (with variable-in-variable expansion) and then exec any command.
#   ./set_env.sh bun run dev
#   ./set_env.sh bun install
# If no command is given it just exports the vars into your shell.

ENV_FILE="$(dirname "$0")/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[set_env] Missing $ENV_FILE  (copy from .env.template)" >&2
  exit 1
fi

# ── Reliable exporter ──
set -a          # automatically export every variable that gets set
. "$ENV_FILE"   # 'source' preserves order, so ${VAR} references work
set +a
# ──────────────────────

# Jump to repo root so `bun run dev` finds the root package.json
cd "$(dirname "$0")"

# Exec the rest of the CLI line, if any
if [[ $# -gt 0 ]]; then
  exec "$@"
fi

