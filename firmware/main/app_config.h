#pragma once

#include "driver/gpio.h"
#include "driver/i2c.h"

#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define SERVER_IP "192.168.1.100"
#define SERVER_UDP_PORT 9999
#define LOCAL_UDP_PORT 12001

#define PLAYER_ID 1

#define IMU_SENSOR_ICM20948 1
#define IMU_SENSOR_MPU6050 2

/* Default test path: MPU6050 IMU-only mode. */
#define IMU_SENSOR_TYPE IMU_SENSOR_MPU6050

#define I2C_PORT I2C_NUM_0

/* XIAO ESP32-C3 mapping: D4 -> GPIO6, D5 -> GPIO7 */
#define I2C_SDA_PIN GPIO_NUM_6
#define I2C_SCL_PIN GPIO_NUM_7

#define RECENTER_BUTTON_ENABLED 0
#define AUTO_RECENTER_ON_BOOT 1
#define AUTO_RECENTER_DELAY_MS 1500

#define RECENTER_BUTTON_PIN GPIO_NUM_1

/* Common user LED pin mapping on XIAO ESP32-C3. Change if your board differs. */
#define ALERT_OUTPUT_PIN GPIO_NUM_21

#define TELEMETRY_RATE_HZ 20
#define GYRO_CALIBRATION_MS 2000
#define MAG_EXPECTED_UT 50.0f
