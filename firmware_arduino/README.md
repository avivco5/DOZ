# Arduino Firmware (XIAO ESP32-C3 + MPU6050)

This folder provides an Arduino `.ino` node implementation that is compatible with the Python server UDP packet protocol.

## File
- `firmware_arduino/FDW_MPU6050_Node/FDW_MPU6050_Node.ino`

## Board profile
Inside the sketch, set:
- `BOARD_PROFILE BOARD_PROFILE_TTGO_T18_30` for TTGO T-Energy T18_3.0 (default)
- `BOARD_PROFILE BOARD_PROFILE_XIAO_ESP32C3` for XIAO ESP32-C3

## Features
- MPU6050 accel/gyro read on I2C with board profile pin mapping
- Gyro bias calibration on boot
- IMU-only orientation (yaw by gyro integration, pitch/roll by complementary filter)
- Auto heading recenter after boot (no button required)
- Telemetry UDP send at 20 Hz with CRC16
- Alert UDP receive with CRC16 and LED output

## Required Arduino setup
1. Install Arduino IDE 2.x.
2. Install board package: `esp32` by Espressif.
3. Select board: `XIAO_ESP32C3` (or Seeed XIAO ESP32C3 equivalent entry).
4. Install no extra libraries beyond default ESP32 core:
   - `WiFi`
   - `WiFiUdp`
   - `Wire`

## Configure sketch
Edit constants in the sketch:
- `WIFI_SSID`
- `WIFI_PASSWORD`
- `SERVER_IP`
- `SERVER_UDP_PORT`
- `LOCAL_UDP_PORT`
- `PLAYER_ID`
- `BOARD_PROFILE`

Optional:
- `RECENTER_BUTTON_ENABLED`
- `PIN_RECENTER_BUTTON`
- `PIN_ALERT_OUTPUT`

If using TTGO T18_3.0, verify your actual MPU6050 wiring pins.
Default profile uses `SDA=21`, `SCL=22`.

## Run flow
1. Start server:
   - `source DOZ/bin/activate`
   - `SKIP_INSTALL=1 HTTP_PORT=18081 UDP_PORT=19999 ./run_poc.sh server`
2. Set sketch `SERVER_IP` and `SERVER_UDP_PORT` to your server host and UDP port.
3. Upload sketch to XIAO ESP32-C3.
4. Open serial monitor at `115200`.
5. Open admin UI in browser and confirm player is online.

## Notes
- MPU6050 is IMU-only, so yaw drift is expected over time.
- Server default `quality_threshold` in this project is 35 for IMU-only bring-up.
- Packet format is unchanged from the Python server spec.
