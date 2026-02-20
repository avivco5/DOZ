# Friendly Direction Warning - Architecture

## Scope and Safety
This project is a game-demo safety warning system for handheld training props. It only provides directional warning feedback and does not include any weapon attachment or weapon modification guidance.

## High-Level Block Diagram

```text
+---------------------+          UDP telemetry (20 Hz)         +---------------------------+
| Player Node 1       | -------------------------------------> | Match Coordinator Server  |
| ESP32-C3 + IMU      |                                        | Python asyncio            |
| - IMU fusion        | <------------------------------------- | - UDP ingest + alerts     |
| - recenter button   |         UDP alert cmd (up to 20 Hz)    | - world sim + cone logic  |
| - buzzer or LED     |                                        | - HTTP + WebSocket UI     |
+---------------------+                                        +------------+--------------+
                                                                            |
                                                                            | WebSocket world_state (10-20 Hz)
                                                                            v
                                                                  +--------------------+
                                                                  | Admin UI (Canvas)  |
                                                                  | - top-down arena   |
                                                                  | - players + trails |
                                                                  | - heading + cones  |
                                                                  +--------------------+
```

## Data Flow
1. Node samples IMU data:
   - ICM-20948 mode: accel, gyro, mag
   - MPU6050 mode: accel, gyro (IMU-only)
2. Node runs Madgwick fusion and computes yaw, pitch, roll.
3. Node applies yaw recenter offset and computes quality score.
4. Node sends compact binary telemetry UDP packet with CRC16.
5. Server merges node telemetry into player registry.
6. World simulator updates server-authoritative positions (default mode).
7. Alert logic checks cone intersection between each player pair.
8. Server sends per-player alert command packets (on/off + intensity + hold_ms).
9. UI receives world_state via WebSocket and renders map and telemetry table.

## Coordinate Frames and Assumptions
- Arena frame: local ENU-like 2D map.
- `x` axis points east (right on map).
- `y` axis points north (up on map).
- Yaw is in degrees, positive CCW from +x.
- Pitch and roll are for operator diagnostics and quality monitoring.
- Distances are meters in server logic and centimeters in packets.

## Position Source Model
- Server keeps simulated positions for every tracked player.
- Default: `use_sim_positions=true`.
- Per player override: if telemetry includes real position with `pos_quality >= threshold`, server uses real position for that player.
- If `use_sim_positions=false`, alert logic ignores players that do not currently have valid real positions, while UI can still show simulated locations for context.

## World Simulation Before UWB
`server/world_sim.py` provides pre-UWB motion:
- Configurable arena size, speed, update rate, boundary behavior.
- Random initial position and heading per player.
- Slow steering noise for smooth random-walk movement.
- Bounce or wrap boundary options.
- Trail history (last 8 seconds by default) for map rendering.

This keeps the map and alert logic active before real positioning hardware is integrated.

## Quality Metrics and Failsafe Behavior
Node quality score (0-100):
- ICM-20948 mode combines magnetometer plausibility, gyro stability, and fusion convergence proxy.
- MPU6050 mode combines accel norm consistency, gyro stability, and yaw-rate stability proxy.

Failsafe rules:
- Server requires `quality >= quality_threshold` for a player to generate alerts (default 35 for IMU-only bring-up).
- Offline timeout marks player offline after 2000 ms without telemetry.
- Invalid packets (magic/version/CRC mismatch) are rejected.
- Alert hysteresis avoids flicker:
  - On: within base cone/range.
  - Off: outside expanded (1.2x) cone/range or hold timeout.

## Runtime Modules
- `server/main.py`: asyncio runtime, UDP, HTTP, WebSocket, control handling.
- `server/state.py`: player registry, merge logic, config updates, snapshots.
- `server/world_sim.py`: random-walk simulator and trail retention.
- `server/logic.py`: angle wrapping, cone checks, alert candidate scoring.
- `server/packet.py`: binary packet encode/decode + CRC16.

## Scaling Notes (10+ Players)
### Complexity
- Current MVP checks all player pairs: `O(N^2)`.
- For 10 players this is small (90 pair checks per tick directionally).
- For larger N, use spatial hashing or uniform grid to cull far targets.

### Packet Rates and Bandwidth
Assumptions:
- Telemetry packet size: 32 bytes.
- Alert packet size: 11 bytes.
- 20 Hz telemetry and 20 Hz alert updates.

Per node approx:
- Uplink: `32 * 20 = 640 B/s`.
- Downlink: `11 * 20 = 220 B/s`.

For 10 nodes total approx:
- Uplink: 6.4 KB/s.
- Downlink: 2.2 KB/s.

### Loss and Jitter Handling
- UDP is accepted for low-latency behavior.
- Sequence numbers allow drop detection and diagnostics.
- Server uses latest sample only and offline timeout.
- Hysteresis plus hold_ms mitigates short packet loss spikes.

### Time Sync Strategy
- Use node monotonic timestamp in telemetry for local diagnostics.
- Server uses receive time for authoritative simulation tick.
- Optional lightweight future sync: periodic server time beacon and simple offset estimate.

### UWB Migration Path
No interface break is required:
- Keep current telemetry fields (`pos_x_cm`, `pos_y_cm`, `pos_quality`).
- Set `pos_quality` high when UWB fix is valid.
- Server merge logic already supports per-player real position override.
- UI and alert logic consume merged positions unchanged.

## Known Limits in This POC
- IMU magnetic calibration is basic hard-iron offset only.
- Magnetometer read path for AK09916 is minimal and may require board-specific tuning.
- No cryptographic auth on packets.
- No persistent storage for calibration (can be added with NVS later).
