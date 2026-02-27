# DOZ Console Webapp

Training-only operator UI built with React + TypeScript + Vite.

## Development

```bash
npm install
npm run dev
```

The dev server runs on `http://127.0.0.1:5173` and proxies backend APIs/WS to `http://127.0.0.1:8080`.

## Build

```bash
npm run build
```

Build output is written to `../server/web/app/` and served by backend routes:
- `/console`
- `/aar`
- `/about`

## Tests

```bash
npm run test
npm run lint
```
