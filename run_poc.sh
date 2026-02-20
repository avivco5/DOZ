#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

MODE="${1:-all}"
HTTP_PORT="${HTTP_PORT:-8080}"
UDP_PORT="${UDP_PORT:-9999}"
SERVER_HOST="${SERVER_HOST:-0.0.0.0}"
PLAYER_IDS="${PLAYER_IDS:-1,2}"
SEND_POS_FLAG="${SEND_POS:-0}"
SKIP_INSTALL="${SKIP_INSTALL:-0}"
VENV_DIR="${VENV_DIR:-DOZ}"

print_usage() {
  cat <<USAGE
Usage:
  ./run_poc.sh [mode]

Modes:
  all      Run server + simulator nodes (default)
  server   Run server only (world simulation still active)
  sim      Run simulator only
  test     Run pytest

Optional env vars:
  HTTP_PORT=8080
  UDP_PORT=9999
  SERVER_HOST=0.0.0.0
  PLAYER_IDS=1,2
  SEND_POS=1         # simulator sends synthetic positions
  SKIP_INSTALL=1     # skip pip install -r requirements.txt
  VENV_DIR=DOZ       # virtualenv directory name/path
USAGE
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

show_tcp_port_owner() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN || true
    return
  fi
  if command -v ss >/dev/null 2>&1; then
    ss -ltn "( sport = :$port )" 2>/dev/null || true
  fi
}

show_udp_port_owner() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iUDP:"$port" || true
    return
  fi
  if command -v ss >/dev/null 2>&1; then
    ss -lun "( sport = :$port )" 2>/dev/null || true
  fi
}

ensure_venv() {
  require_cmd python3

  if [ ! -d "$VENV_DIR" ]; then
    echo "[setup] Creating virtual environment"
    python3 -m venv "$VENV_DIR"
  fi

  # shellcheck disable=SC1091
  source "$VENV_DIR/bin/activate"

  if [ "$SKIP_INSTALL" != "1" ]; then
    echo "[setup] Installing Python dependencies"
    python -m pip install --upgrade pip
    python -m pip install -r requirements.txt
  fi
}

run_server() {
  echo "[run] Starting server on http://127.0.0.1:${HTTP_PORT} (UDP ${UDP_PORT})"
  python -m server.main --host "$SERVER_HOST" --http-port "$HTTP_PORT" --udp-port "$UDP_PORT"
}

run_sim() {
  local send_pos_arg=""
  if [ "$SEND_POS_FLAG" = "1" ]; then
    send_pos_arg="--send-pos"
  fi

  echo "[run] Starting simulator for player ids: ${PLAYER_IDS}"
  python -m tools.sim_node --player-ids "$PLAYER_IDS" --server-ip 127.0.0.1 --server-port "$UDP_PORT" $send_pos_arg
}

run_tests() {
  echo "[run] Running tests"
  python -m pytest -q
}

cleanup() {
  if [ -n "${SERVER_PID:-}" ] && kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    echo "[cleanup] Stopping server (PID ${SERVER_PID})"
    kill "$SERVER_PID" || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}

case "$MODE" in
  -h|--help|help)
    print_usage
    exit 0
    ;;
  all)
    ensure_venv
    trap cleanup EXIT INT TERM

    run_server &
    SERVER_PID=$!

    # Give server a moment to bind ports
    sleep 1
    if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
      echo "[error] Server exited early. Most common cause: port already in use (HTTP ${HTTP_PORT} or UDP ${UDP_PORT})." >&2
      echo "[debug] TCP listeners on HTTP_PORT=${HTTP_PORT}:" >&2
      show_tcp_port_owner "$HTTP_PORT" >&2
      echo "[debug] UDP listeners on UDP_PORT=${UDP_PORT}:" >&2
      show_udp_port_owner "$UDP_PORT" >&2
      exit 1
    fi

    run_sim
    ;;
  server)
    ensure_venv
    run_server
    ;;
  sim)
    ensure_venv
    run_sim
    ;;
  test)
    ensure_venv
    run_tests
    ;;
  *)
    echo "Unknown mode: $MODE" >&2
    print_usage
    exit 1
    ;;
esac
