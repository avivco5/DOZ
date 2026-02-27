# DOZ Web UI (Training-Only)

This UI is designed for training-only situational awareness.
It does not implement any targeting, firing, interception, or harm-related function.

## Stage 0 Audit

### Where web assets live
- Legacy static UI: `server/web/index.html`, `server/web/app.js`, `server/web/style.css`.
- New operator-grade frontend source: `webapp/` (React + TypeScript + Vite).
- Production frontend build output: `server/web/app/`.

### How the server serves the UI
- `aiohttp` app in `server/main.py`.
- Routes:
  - `/`, `/console`, `/aar`, `/about` -> serves SPA index (`server/web/app/index.html` if built, else legacy `server/web/index.html`).
  - `/ws` -> live WebSocket.
  - `/static/` -> legacy assets under `server/web/`.
  - `/app/` -> built frontend assets under `server/web/app/` (if directory exists at server start).

### Existing WebSocket URL and schema
- URL: `/ws`
- Message types:
  - `world_state`
  - `config`
- `world_state` includes compatibility fields and normalized fields:
  - `type`, `schema_version`, `server_time_ms`, `ts_ms`
  - `players[]`
  - `obstacles[]` (currently default empty from backend)
  - `events[]` (currently default empty from backend)
  - `recording`

### Existing REST endpoints
- `GET /api/health`
- `GET /api/status`
- `POST /api/recording/start`
- `POST /api/recording/stop`
- `GET /api/aar/list` (placeholder)
- `POST /api/replay/start` (placeholder)
- `POST /api/replay/stop` (placeholder)
- `POST /api/sim/add` (adds one simulation player)
- `POST /api/sim/remove` (removes one removable simulation player)

## Integration Strategy

Option B was selected:
- Develop with a dedicated Vite dev server in `webapp/`.
- Build static frontend assets into `server/web/app/` for production serving by `aiohttp`.
- Keep legacy static UI files for backwards compatibility.

## Data Contract and Adapter

- Strict TS contracts: `webapp/src/types.ts`
- Runtime guards: `webapp/src/lib/guards.ts`
- Adapter/normalizer: `webapp/src/lib/normalize.ts`

The normalizer accepts backend-compatible payloads and maps fields such as:
- `id -> player_id`
- `x_m/y_m -> x/y`
- `quality` int percent (0..100) to decimal (0..1)
- `battery_mv -> battery_v`
- `alert -> alert_state`

Malformed messages do not crash the UI. The console shows a degraded banner and logs a warning event.

## Mock Mode

- Force mock via env: `VITE_MOCK=1`.
- Auto fallback to mock stream if WebSocket is unavailable.
- Manual toggle is available in the status bar.

## Tests

Frontend pure-function tests:
- `webapp/src/lib/__tests__/normalize.test.ts`
- `webapp/src/lib/__tests__/exposure.test.ts`
