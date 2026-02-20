#include "imu_icm20948.h"

#include <math.h>
#include <stdbool.h>
#include <string.h>

#include "esp_check.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define TAG "imu_icm20948"

#define ICM20948_I2C_ADDR 0x68
#define AK09916_I2C_ADDR 0x0C

#define REG_BANK_SEL 0x7F

#define WHO_AM_I 0x00
#define PWR_MGMT_1 0x06
#define INT_PIN_CFG 0x0F
#define ACCEL_XOUT_H 0x2D
#define GYRO_XOUT_H 0x33

#define GYRO_CONFIG_1 0x01
#define ACCEL_CONFIG 0x14

#define AK09916_WIA1 0x00
#define AK09916_WIA2 0x01
#define AK09916_ST1 0x10
#define AK09916_HXL 0x11
#define AK09916_ST2 0x18
#define AK09916_CNTL2 0x31

static i2c_port_t s_i2c_port = I2C_NUM_0;
static uint8_t s_bank = 0xFF;
static bool s_initialized = false;
static imu_calibration_t s_cal = {0};

static esp_err_t i2c_write_reg(uint8_t addr, uint8_t reg, uint8_t value) {
    uint8_t payload[2] = {reg, value};
    return i2c_master_write_to_device(s_i2c_port, addr, payload, sizeof(payload), pdMS_TO_TICKS(100));
}

static esp_err_t i2c_read_regs(uint8_t addr, uint8_t reg, uint8_t *out, size_t len) {
    return i2c_master_write_read_device(s_i2c_port, addr, &reg, 1, out, len, pdMS_TO_TICKS(100));
}

static esp_err_t icm_set_bank(uint8_t bank) {
    if (s_bank == bank) {
        return ESP_OK;
    }
    uint8_t bank_val = (uint8_t)(bank << 4);
    esp_err_t err = i2c_write_reg(ICM20948_I2C_ADDR, REG_BANK_SEL, bank_val);
    if (err == ESP_OK) {
        s_bank = bank;
    }
    return err;
}

static esp_err_t icm_write_bank_reg(uint8_t bank, uint8_t reg, uint8_t value) {
    esp_err_t err = icm_set_bank(bank);
    if (err != ESP_OK) {
        return err;
    }
    return i2c_write_reg(ICM20948_I2C_ADDR, reg, value);
}

static esp_err_t icm_read_bank_regs(uint8_t bank, uint8_t reg, uint8_t *out, size_t len) {
    esp_err_t err = icm_set_bank(bank);
    if (err != ESP_OK) {
        return err;
    }
    return i2c_read_regs(ICM20948_I2C_ADDR, reg, out, len);
}

static int16_t be_to_i16(uint8_t hi, uint8_t lo) {
    return (int16_t)(((uint16_t)hi << 8) | (uint16_t)lo);
}

static int16_t le_to_i16(uint8_t lo, uint8_t hi) {
    return (int16_t)(((uint16_t)hi << 8) | (uint16_t)lo);
}

static esp_err_t read_accel_gyro_raw(int16_t *ax, int16_t *ay, int16_t *az, int16_t *gx, int16_t *gy, int16_t *gz) {
    uint8_t buf[12] = {0};
    esp_err_t err = icm_read_bank_regs(0, ACCEL_XOUT_H, buf, sizeof(buf));
    if (err != ESP_OK) {
        return err;
    }

    *ax = be_to_i16(buf[0], buf[1]);
    *ay = be_to_i16(buf[2], buf[3]);
    *az = be_to_i16(buf[4], buf[5]);
    *gx = be_to_i16(buf[6], buf[7]);
    *gy = be_to_i16(buf[8], buf[9]);
    *gz = be_to_i16(buf[10], buf[11]);
    return ESP_OK;
}

static esp_err_t init_mag_ak09916(void) {
    uint8_t who[2] = {0};
    esp_err_t err = i2c_read_regs(AK09916_I2C_ADDR, AK09916_WIA1, who, sizeof(who));
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "AK09916 ID read failed: %s", esp_err_to_name(err));
        return err;
    }

    if (who[0] != 0x48 || who[1] != 0x09) {
        ESP_LOGW(TAG, "AK09916 ID mismatch: 0x%02X 0x%02X", who[0], who[1]);
    }

    err = i2c_write_reg(AK09916_I2C_ADDR, AK09916_CNTL2, 0x08);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "AK09916 mode set failed: %s", esp_err_to_name(err));
        return err;
    }
    vTaskDelay(pdMS_TO_TICKS(10));
    return ESP_OK;
}

esp_err_t imu_icm20948_init(i2c_port_t i2c_port, gpio_num_t sda_pin, gpio_num_t scl_pin) {
    s_i2c_port = i2c_port;
    s_bank = 0xFF;

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
    ESP_RETURN_ON_ERROR(i2c_driver_install(s_i2c_port, cfg.mode, 0, 0, 0), TAG, "i2c_driver_install failed");

    uint8_t who = 0;
    ESP_RETURN_ON_ERROR(icm_read_bank_regs(0, WHO_AM_I, &who, 1), TAG, "WHO_AM_I read failed");
    if (who != 0xEA) {
        ESP_LOGE(TAG, "ICM-20948 WHO_AM_I mismatch: got 0x%02X expected 0xEA", who);
        return ESP_ERR_INVALID_RESPONSE;
    }

    ESP_RETURN_ON_ERROR(icm_write_bank_reg(0, PWR_MGMT_1, 0x01), TAG, "PWR_MGMT_1 write failed");
    vTaskDelay(pdMS_TO_TICKS(20));

    ESP_RETURN_ON_ERROR(icm_write_bank_reg(2, GYRO_CONFIG_1, 0x0A), TAG, "GYRO_CONFIG_1 write failed");
    ESP_RETURN_ON_ERROR(icm_write_bank_reg(2, ACCEL_CONFIG, 0x0A), TAG, "ACCEL_CONFIG write failed");
    ESP_RETURN_ON_ERROR(icm_write_bank_reg(0, INT_PIN_CFG, 0x02), TAG, "INT_PIN_CFG write failed");

    (void)init_mag_ak09916();

    s_initialized = true;
    ESP_LOGI(TAG, "ICM-20948 initialized");
    return ESP_OK;
}

esp_err_t imu_icm20948_read_sample(imu_sample_t *out) {
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

    out->mx_ut = 0.0f;
    out->my_ut = 0.0f;
    out->mz_ut = 0.0f;

    uint8_t st1 = 0;
    if (i2c_read_regs(AK09916_I2C_ADDR, AK09916_ST1, &st1, 1) == ESP_OK && (st1 & 0x01) != 0) {
        uint8_t mag_data[8] = {0};
        if (i2c_read_regs(AK09916_I2C_ADDR, AK09916_ST1, mag_data, sizeof(mag_data)) == ESP_OK) {
            int16_t mx_raw = le_to_i16(mag_data[1], mag_data[2]);
            int16_t my_raw = le_to_i16(mag_data[3], mag_data[4]);
            int16_t mz_raw = le_to_i16(mag_data[5], mag_data[6]);

            const float mag_lsb_to_ut = 0.15f;
            out->mx_ut = (float)mx_raw * mag_lsb_to_ut - s_cal.mag_offset_x_ut;
            out->my_ut = (float)my_raw * mag_lsb_to_ut - s_cal.mag_offset_y_ut;
            out->mz_ut = (float)mz_raw * mag_lsb_to_ut - s_cal.mag_offset_z_ut;
        }
    }

    return ESP_OK;
}

esp_err_t imu_icm20948_calibrate_gyro_bias(uint32_t duration_ms) {
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

void imu_icm20948_set_mag_offset(float ox, float oy, float oz) {
    s_cal.mag_offset_x_ut = ox;
    s_cal.mag_offset_y_ut = oy;
    s_cal.mag_offset_z_ut = oz;
}

void imu_icm20948_get_mag_offset(float *ox, float *oy, float *oz) {
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

const imu_calibration_t *imu_icm20948_get_calibration(void) {
    return &s_cal;
}
