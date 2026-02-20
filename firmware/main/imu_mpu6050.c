#include "imu_mpu6050.h"

#include <stdbool.h>

#include "esp_check.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define TAG "imu_mpu6050"

#define MPU6050_I2C_ADDR 0x68

#define MPU6050_SMPLRT_DIV 0x19
#define MPU6050_CONFIG 0x1A
#define MPU6050_GYRO_CONFIG 0x1B
#define MPU6050_ACCEL_CONFIG 0x1C
#define MPU6050_ACCEL_CONFIG2 0x1D
#define MPU6050_ACCEL_XOUT_H 0x3B
#define MPU6050_PWR_MGMT_1 0x6B
#define MPU6050_WHO_AM_I 0x75

static i2c_port_t s_i2c_port = I2C_NUM_0;
static bool s_initialized = false;
static imu_calibration_t s_cal = {0};

static esp_err_t i2c_write_reg(uint8_t reg, uint8_t value) {
    uint8_t payload[2] = {reg, value};
    return i2c_master_write_to_device(s_i2c_port, MPU6050_I2C_ADDR, payload, sizeof(payload), pdMS_TO_TICKS(100));
}

static esp_err_t i2c_read_regs(uint8_t reg, uint8_t *out, size_t len) {
    return i2c_master_write_read_device(s_i2c_port, MPU6050_I2C_ADDR, &reg, 1, out, len, pdMS_TO_TICKS(100));
}

static int16_t be_to_i16(uint8_t hi, uint8_t lo) {
    return (int16_t)(((uint16_t)hi << 8) | (uint16_t)lo);
}

static esp_err_t read_accel_gyro_raw(
    int16_t *ax,
    int16_t *ay,
    int16_t *az,
    int16_t *gx,
    int16_t *gy,
    int16_t *gz
) {
    uint8_t buf[14] = {0};
    esp_err_t err = i2c_read_regs(MPU6050_ACCEL_XOUT_H, buf, sizeof(buf));
    if (err != ESP_OK) {
        return err;
    }

    *ax = be_to_i16(buf[0], buf[1]);
    *ay = be_to_i16(buf[2], buf[3]);
    *az = be_to_i16(buf[4], buf[5]);

    *gx = be_to_i16(buf[8], buf[9]);
    *gy = be_to_i16(buf[10], buf[11]);
    *gz = be_to_i16(buf[12], buf[13]);
    return ESP_OK;
}

esp_err_t imu_mpu6050_init(i2c_port_t i2c_port, gpio_num_t sda_pin, gpio_num_t scl_pin) {
    s_i2c_port = i2c_port;

    i2c_config_t cfg = {
        .mode = I2C_MODE_MASTER,
        .sda_io_num = sda_pin,
        .scl_io_num = scl_pin,
        .sda_pullup_en = GPIO_PULLUP_ENABLE,
        .scl_pullup_en = GPIO_PULLUP_ENABLE,
        .master.clk_speed = 400000,
        .clk_flags = 0,
    };

    ESP_RETURN_ON_ERROR(i2c_param_config(s_i2c_port, &cfg), TAG, "i2c_param_config failed");
    esp_err_t err = i2c_driver_install(s_i2c_port, cfg.mode, 0, 0, 0);
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        ESP_LOGE(TAG, "i2c_driver_install failed: %s", esp_err_to_name(err));
        return err;
    }

    uint8_t who = 0;
    ESP_RETURN_ON_ERROR(i2c_read_regs(MPU6050_WHO_AM_I, &who, 1), TAG, "WHO_AM_I read failed");
    if (who != 0x68) {
        ESP_LOGE(TAG, "MPU6050 WHO_AM_I mismatch: got 0x%02X expected 0x68", who);
        return ESP_ERR_INVALID_RESPONSE;
    }

    ESP_RETURN_ON_ERROR(i2c_write_reg(MPU6050_PWR_MGMT_1, 0x01), TAG, "PWR_MGMT_1 write failed");
    vTaskDelay(pdMS_TO_TICKS(30));

    /* 1 kHz gyro output / (1 + 4) = 200 Hz sample rate */
    ESP_RETURN_ON_ERROR(i2c_write_reg(MPU6050_SMPLRT_DIV, 0x04), TAG, "SMPLRT_DIV write failed");
    /* DLPF config */
    ESP_RETURN_ON_ERROR(i2c_write_reg(MPU6050_CONFIG, 0x03), TAG, "CONFIG write failed");
    /* Gyro full scale +/-500 dps */
    ESP_RETURN_ON_ERROR(i2c_write_reg(MPU6050_GYRO_CONFIG, 0x08), TAG, "GYRO_CONFIG write failed");
    /* Accel full scale +/-4 g */
    ESP_RETURN_ON_ERROR(i2c_write_reg(MPU6050_ACCEL_CONFIG, 0x08), TAG, "ACCEL_CONFIG write failed");
    ESP_RETURN_ON_ERROR(i2c_write_reg(MPU6050_ACCEL_CONFIG2, 0x03), TAG, "ACCEL_CONFIG2 write failed");

    s_initialized = true;
    ESP_LOGI(TAG, "MPU6050 initialized");
    return ESP_OK;
}

esp_err_t imu_mpu6050_read_sample(imu_sample_t *out) {
    if (!s_initialized || out == NULL) {
        return ESP_ERR_INVALID_STATE;
    }

    int16_t ax_raw = 0;
    int16_t ay_raw = 0;
    int16_t az_raw = 0;
    int16_t gx_raw = 0;
    int16_t gy_raw = 0;
    int16_t gz_raw = 0;

    ESP_RETURN_ON_ERROR(read_accel_gyro_raw(&ax_raw, &ay_raw, &az_raw, &gx_raw, &gy_raw, &gz_raw), TAG, "AG read failed");

    const float accel_lsb_per_g = 8192.0f;
    const float gyro_lsb_per_dps = 65.5f;

    out->ax_g = (float)ax_raw / accel_lsb_per_g;
    out->ay_g = (float)ay_raw / accel_lsb_per_g;
    out->az_g = (float)az_raw / accel_lsb_per_g;

    out->gx_dps = (float)gx_raw / gyro_lsb_per_dps - s_cal.gyro_bias_x_dps;
    out->gy_dps = (float)gy_raw / gyro_lsb_per_dps - s_cal.gyro_bias_y_dps;
    out->gz_dps = (float)gz_raw / gyro_lsb_per_dps - s_cal.gyro_bias_z_dps;

    /* No magnetometer on MPU6050. */
    out->mx_ut = 0.0f;
    out->my_ut = 0.0f;
    out->mz_ut = 0.0f;
    return ESP_OK;
}

esp_err_t imu_mpu6050_calibrate_gyro_bias(uint32_t duration_ms) {
    if (!s_initialized) {
        return ESP_ERR_INVALID_STATE;
    }

    uint32_t samples = duration_ms / 10;
    if (samples < 10) {
        samples = 10;
    }

    double sx = 0.0;
    double sy = 0.0;
    double sz = 0.0;

    const float gyro_lsb_per_dps = 65.5f;

    for (uint32_t i = 0; i < samples; ++i) {
        int16_t ax = 0;
        int16_t ay = 0;
        int16_t az = 0;
        int16_t gx = 0;
        int16_t gy = 0;
        int16_t gz = 0;
        esp_err_t err = read_accel_gyro_raw(&ax, &ay, &az, &gx, &gy, &gz);
        if (err != ESP_OK) {
            return err;
        }
        sx += (double)gx / gyro_lsb_per_dps;
        sy += (double)gy / gyro_lsb_per_dps;
        sz += (double)gz / gyro_lsb_per_dps;
        vTaskDelay(pdMS_TO_TICKS(10));
    }

    s_cal.gyro_bias_x_dps = (float)(sx / samples);
    s_cal.gyro_bias_y_dps = (float)(sy / samples);
    s_cal.gyro_bias_z_dps = (float)(sz / samples);

    ESP_LOGI(
        TAG,
        "Gyro bias calibrated x=%.4f y=%.4f z=%.4f dps",
        s_cal.gyro_bias_x_dps,
        s_cal.gyro_bias_y_dps,
        s_cal.gyro_bias_z_dps
    );

    return ESP_OK;
}

void imu_mpu6050_set_mag_offset(float ox, float oy, float oz) {
    s_cal.mag_offset_x_ut = ox;
    s_cal.mag_offset_y_ut = oy;
    s_cal.mag_offset_z_ut = oz;
}

void imu_mpu6050_get_mag_offset(float *ox, float *oy, float *oz) {
    if (ox != NULL) {
        *ox = s_cal.mag_offset_x_ut;
    }
    if (oy != NULL) {
        *oy = s_cal.mag_offset_y_ut;
    }
    if (oz != NULL) {
        *oz = s_cal.mag_offset_z_ut;
    }
}

const imu_calibration_t *imu_mpu6050_get_calibration(void) {
    return &s_cal;
}
