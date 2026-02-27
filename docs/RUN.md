# Run Instructions (Linux and Windows)

## Prerequisites
- Python 3.11+
- Git
- For firmware: ESP-IDF v5.x toolchain

## Linux
### 1) Create venv and install dependencies
```bash
python3 -m venv DOZ
source DOZ/bin/activate
pip install -r requirements.txt
```

### 2) Run server (world simulation only)
```bash
python -m server.main --http-port 8080 --udp-port 9999
```
Expected log lines:
- `UDP telemetry socket ready`
- `Match coordinator started`

### 3) Open admin UI
- Browser: `http://127.0.0.1:8080`
- You should see moving players even with no nodes connected.

### 3b) Run new frontend in development mode (optional)
From repository root:
```bash
cd webapp
npm install
npm run dev
```
Then open: `http://127.0.0.1:5173/console`

Notes:
- The Vite dev server proxies `/ws` and `/api` to `http://127.0.0.1:8080`.
- Use mock mode with:
```bash
VITE_MOCK=1 npm run dev
```

### 4) Run simulator nodes
In a second terminal:
```bash
source DOZ/bin/activate
python -m tools.sim_node --player-ids 1,2 --server-ip 127.0.0.1 --server-port 9999
```
Optional with simulated positions from nodes:
```bash
python -m tools.sim_node --player-ids 1,2 --send-pos
```
Optional with synthetic GPS (Telemetry v2):
```bash
python -m tools.sim_node --player-ids 1,2 --send-pos --send-gps
```

### 5) Run tests
```bash
source DOZ/bin/activate
pytest -q
```

### 6) Frontend tests/lint/build
```bash
cd webapp
npm run test
npm run lint
npm run build
```

Build output is generated to `server/web/app/` and served by the backend routes:
- `/console`
- `/aar`
- `/about`

## Windows (PowerShell)
### 1) Create venv and install dependencies
```powershell
py -3.11 -m venv DOZ
.\DOZ\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 2) Run server
```powershell
python -m server.main --http-port 8080 --udp-port 9999
```

### 3) Open admin UI
- Browser: `http://127.0.0.1:8080`

### 4) Run simulator nodes
```powershell
python -m tools.sim_node --player-ids 1,2 --server-ip 127.0.0.1 --server-port 9999
```

### 5) Run tests
```powershell
pytest -q
```

## Firmware Build and Flash
From `firmware/`:

Linux:
```bash
idf.py set-target esp32c3
idf.py build
idf.py -p /dev/ttyACM0 flash monitor
```

Windows PowerShell:
```powershell
idf.py set-target esp32c3
idf.py build
idf.py -p COM5 flash monitor
```

Update node config constants in `firmware/main/app_config.h` before flashing.

MPU6050 quick-test defaults in this repo:
- `IMU_SENSOR_TYPE` is set to `IMU_SENSOR_MPU6050`.
- I2C pins use XIAO mapping `D4 -> GPIO6`, `D5 -> GPIO7`.
- `RECENTER_BUTTON_ENABLED=0`, `AUTO_RECENTER_ON_BOOT=1`.
- `quality_threshold` defaults to 35 on the server.

## End-to-End Validation Matrix
1. Server only:
- Start `python -m server.main`
- Confirm UI map shows moving simulated players and trails.

2. Simulator nodes:
- Start `tools/sim_node.py`
- Confirm UI yaw changes and alert states toggle.

3. One real node:
- Flash one ESP32-C3 with `PLAYER_ID=1`
- For MPU6050, ensure `IMU_SENSOR_TYPE=IMU_SENSOR_MPU6050` in `app_config.h`.
- Confirm player 1 online and receives alert packets.

4. Two real nodes:
- Flash two nodes with unique ids
- Confirm pairwise cone warnings trigger.

## Troubleshooting
- No WebSocket updates:
  - Check browser console and server logs.
  - Verify `http-port` and `/ws` endpoint reachability.
- No node data:
  - Check UDP port alignment (`--udp-port` and node target port).
  - Confirm firewall allows local UDP traffic.
- Frequent offline status:
  - Verify telemetry rate near 20 Hz.
  - Increase `offline_timeout_ms` if needed.
  - For server-only simulated players, enable `sim_players_emulate_real` from the Control Surface.
- Alerts always off:
  - Raise cone angle or max range in UI.
  - Ensure player quality is above threshold.

## Known Issues
- MPU6050 mode is IMU-only and yaw can drift over time; periodic recenter is expected.
- ICM-20948 magnetometer path is implemented as minimal AK09916 bypass mode and may need board-specific tuning.
- Magnetometer calibration is hard-iron only in ICM-20948 mode.
- No persistent NVS storage for offsets yet.
- UDP has no transport-level reliability guarantees by design.
