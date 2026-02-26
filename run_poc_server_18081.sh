#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

exec env \
  SKIP_INSTALL=1 \
  SERVER_HOST=0.0.0.0 \
  HTTP_PORT=18081 \
  UDP_PORT=19999 \
  ./run_poc.sh server
