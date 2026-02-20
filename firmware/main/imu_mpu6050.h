#pragma once

#include <stdint.h>

#include "driver/gpio.h"
#include "driver/i2c.h"
#include "esp_err.h"

typedef struct {
    float ax_g;
    float ay_g;
    float az_g;
    float gx_dps;
    float gy_dps;
    float gz_dps;
    float mx_ut;
    float my_ut;
    float mz_ut;
} imu_sample_t;

typedef struct {
    float gyro_bias_x_dps;
    float gyro_bias_y_dps;
    float gyro_bias_z_dps;
    float mag_offset_x_ut;
    float mag_offset_y_ut;
    float mag_offset_z_ut;
} imu_calibration_t;

esp_err_t imu_mpu6050_init(i2c_port_t i2c_port, gpio_num_t sda_pin, gpio_num_t scl_pin);
esp_err_t imu_mpu6050_read_sample(imu_sample_t *out);
esp_err_t imu_mpu6050_calibrate_gyro_bias(uint32_t duration_ms);
void imu_mpu6050_set_mag_offset(float ox, float oy, float oz);
void imu_mpu6050_get_mag_offset(float *ox, float *oy, float *oz);
const imu_calibration_t *imu_mpu6050_get_calibration(void);
