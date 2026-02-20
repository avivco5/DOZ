# Firmware (ESP-IDF)

Target: Seeed Studio XIAO ESP32-C3

## Sensor support
- MPU6050 (default in this repo)
- ICM-20948 (legacy path kept for compatibility)

## What is implemented
- Sensor-selectable IMU driver layer via `main/imu_select.h`
- MPU6050 init, WHO_AM_I check, accel/gyro read, gyro bias calibration
- ICM-20948 accel/gyro/mag path (minimal AK09916 handling)
- Madgwick fusion:
  - full AHRS update (with magnetometer)
  - IMU-only update (gyro + accel)
- Heading recenter:
  - auto-recenter on boot (default when no button)
  - optional button recenter if enabled
- UDP telemetry at 20 Hz
- UDP alert receive and alert output pin drive

## Configure
Edit `main/app_config.h`:
- `WIFI_SSID`
- `WIFI_PASSWORD`
- `SERVER_IP`
- `PLAYER_ID`
- `IMU_SENSOR_TYPE`:
  - `IMU_SENSOR_MPU6050`
  - `IMU_SENSOR_ICM20948`
- pin mappings if needed

Default mapping for XIAO ESP32-C3 quick-test:
- I2C SDA: D4 (`GPIO6`)
- I2C SCL: D5 (`GPIO7`)

## Build and flash
```bash
idf.py set-target esp32c3
idf.py build
idf.py -p /dev/ttyACM0 flash monitor
```

## Notes
- MPU6050 mode is IMU-only. Yaw drift is expected over time.
- Auto-recenter on boot is enabled by default in this repo.
- Battery value is a fixed placeholder in this POC.
- Position fields are zero by default until external positioning is integrated.
