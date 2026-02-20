#pragma once

#include "app_config.h"

#if IMU_SENSOR_TYPE == IMU_SENSOR_MPU6050

#include "imu_mpu6050.h"

#define IMU_HAS_MAG 0
#define imu_sensor_init imu_mpu6050_init
#define imu_sensor_read_sample imu_mpu6050_read_sample
#define imu_sensor_calibrate_gyro_bias imu_mpu6050_calibrate_gyro_bias
#define imu_sensor_set_mag_offset imu_mpu6050_set_mag_offset
#define imu_sensor_get_mag_offset imu_mpu6050_get_mag_offset
#define imu_sensor_get_calibration imu_mpu6050_get_calibration

#elif IMU_SENSOR_TYPE == IMU_SENSOR_ICM20948

#include "imu_icm20948.h"

#define IMU_HAS_MAG 1
#define imu_sensor_init imu_icm20948_init
#define imu_sensor_read_sample imu_icm20948_read_sample
#define imu_sensor_calibrate_gyro_bias imu_icm20948_calibrate_gyro_bias
#define imu_sensor_set_mag_offset imu_icm20948_set_mag_offset
#define imu_sensor_get_mag_offset imu_icm20948_get_mag_offset
#define imu_sensor_get_calibration imu_icm20948_get_calibration

#else
#error "Unsupported IMU_SENSOR_TYPE. Use IMU_SENSOR_MPU6050 or IMU_SENSOR_ICM20948."
#endif
