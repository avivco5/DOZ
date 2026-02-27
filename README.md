# Friendly Direction Warning - POC

This repository is a game-demo directional warning system for handheld training props.

Safety constraints implemented:
- No guidance for weapon attachment or modification.
- Direction warning only.
- Alert outputs are buzzer/LED/vibration style game feedback.

## Repository layout
- `firmware/` ESP-IDF project for XIAO ESP32-C3 + MPU6050 or ICM-20948.
- `firmware_arduino/` Arduino `.ino` firmware for XIAO ESP32-C3 + MPU6050.
- `server/` Python asyncio coordinator, UDP, HTTP, WebSocket, UI.
- `tools/` simulators and diagnostics.
- `docs/` architecture, packet protocol, runbook.
- `tests/` unit tests for protocol and logic.

## Quick start
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m server.main
```
Open `http://127.0.0.1:8080`

Main UI routes:
- `http://127.0.0.1:8080/console`
- `http://127.0.0.1:8080/aar`
- `http://127.0.0.1:8080/about`

Then run simulated players:
```bash
python tools/sim_node.py --player-ids 1,2
```

See `docs/RUN.md` for full Linux and Windows instructions.
See `docs/WEB_UI.md` for frontend architecture and adapter details.
