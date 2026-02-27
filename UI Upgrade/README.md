# DOZ UI Upgrade (Local)

Frontend for the existing DOZ backend, without Base44 dependencies.

## Requirements
- Node.js 18+
- DOZ backend running on `http://127.0.0.1:8080`

## Run
```bash
cd "UI Upgrade"
npm install
npm run dev
```

Open:
- `http://127.0.0.1:5173/console`

The Vite dev server proxies:
- `/api` -> `http://127.0.0.1:8080`
- `/ws` -> `ws://127.0.0.1:8080`

## Backend
From repo root:
```bash
./run_poc.sh server
```
