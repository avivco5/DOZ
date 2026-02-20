#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <string.h>

#include "app_config.h"
#include "esp_err.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "fusion_madgwick.h"
#include "imu_select.h"
#include "net_udp.h"
#include "nvs_flash.h"
#include "packet_proto.h"

#define TAG "fdw_app"

#define FLAG_IMU_ONLY_MODE (1U << 0)
#define FLAG_AUTO_RECENTER_DONE (1U << 1)
#define FLAG_MAG_CAL_ACTIVE (1U << 2)

typedef struct {
    bool active;
    uint8_t intensity;
    int64_t hold_until_ms;
} alert_state_t;

static float wrap_deg(float angle) {
    while (angle > 180.0f) {
        angle -= 360.0f;
    }
    while (angle < -180.0f) {
        angle += 360.0f;
    }
    return angle;
}

static uint8_t clamp_u8_int(int value) {
    if (value < 0) {
        return 0;
    }
    if (value > 255) {
        return 255;
    }
    return (uint8_t)value;
}

static int16_t deg_to_centideg(float deg) {
    int value = (int)lroundf(deg * 100.0f);
    if (value < -32768) {
        value = -32768;
    }
    if (value > 32767) {
        value = 32767;
    }
    return (int16_t)value;
}

static uint8_t compute_quality_score_mag(const imu_sample_t *s, float mag_expected_ut) {
    float mag_norm = sqrtf(s->mx_ut * s->mx_ut + s->my_ut * s->my_ut + s->mz_ut * s->mz_ut);
    float mag_err = fabsf(mag_norm - mag_expected_ut);
    float mag_score = 100.0f - fminf(100.0f, (mag_err / mag_expected_ut) * 120.0f);

    float gyro_mag = sqrtf(s->gx_dps * s->gx_dps + s->gy_dps * s->gy_dps + s->gz_dps * s->gz_dps);
    float gyro_score = 100.0f - fminf(100.0f, gyro_mag * 3.0f);

    float accel_norm = sqrtf(s->ax_g * s->ax_g + s->ay_g * s->ay_g + s->az_g * s->az_g);
    float accel_err = fabsf(accel_norm - 1.0f);
    float conv_score = 100.0f - fminf(100.0f, accel_err * 200.0f);

    float q = 0.45f * mag_score + 0.20f * gyro_score + 0.35f * conv_score;
    if (q < 0.0f) {
        q = 0.0f;
    }
    if (q > 100.0f) {
        q = 100.0f;
    }
    return (uint8_t)(q + 0.5f);
}

static uint8_t compute_quality_score_imu_only(const imu_sample_t *s) {
    float gyro_mag = sqrtf(s->gx_dps * s->gx_dps + s->gy_dps * s->gy_dps + s->gz_dps * s->gz_dps);
    float gyro_score = 100.0f - fminf(100.0f, gyro_mag * 2.5f);

    float accel_norm = sqrtf(s->ax_g * s->ax_g + s->ay_g * s->ay_g + s->az_g * s->az_g);
    float accel_err = fabsf(accel_norm - 1.0f);
    float accel_score = 100.0f - fminf(100.0f, accel_err * 220.0f);

    float yaw_rate_score = 100.0f - fminf(100.0f, fabsf(s->gz_dps) * 2.0f);

    float q = 0.45f * accel_score + 0.35f * gyro_score + 0.20f * yaw_rate_score;
    if (q < 0.0f) {
        q = 0.0f;
    }
    if (q > 100.0f) {
        q = 100.0f;
    }
    return (uint8_t)(q + 0.5f);
}

static void alert_output_init(void) {
    gpio_config_t cfg = {
        .pin_bit_mask = (1ULL << ALERT_OUTPUT_PIN),
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    ESP_ERROR_CHECK(gpio_config(&cfg));
    gpio_set_level(ALERT_OUTPUT_PIN, 0);
}

#if RECENTER_BUTTON_ENABLED
static void button_init(void) {
    gpio_config_t cfg = {
        .pin_bit_mask = (1ULL << RECENTER_BUTTON_PIN),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    ESP_ERROR_CHECK(gpio_config(&cfg));
}

static bool button_pressed(void) {
    return gpio_get_level(RECENTER_BUTTON_PIN) == 0;
}
#endif

void app_main(void) {
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    ESP_ERROR_CHECK(err);

    alert_output_init();
#if RECENTER_BUTTON_ENABLED
    button_init();
#endif

    net_udp_config_t net_cfg = {
        .ssid = WIFI_SSID,
        .password = WIFI_PASSWORD,
        .server_ip = SERVER_IP,
        .server_port = SERVER_UDP_PORT,
        .local_port = LOCAL_UDP_PORT,
    };

    ESP_ERROR_CHECK(net_udp_init(&net_cfg));

    ESP_ERROR_CHECK(imu_sensor_init(I2C_PORT, I2C_SDA_PIN, I2C_SCL_PIN));
    ESP_LOGI(TAG, "Keep device still for gyro calibration");
    ESP_ERROR_CHECK(imu_sensor_calibrate_gyro_bias(GYRO_CALIBRATION_MS));

    madgwick_t fusion;
    madgwick_init(&fusion, 0.08f);

    uint16_t seq = 0;
    float yaw_offset = 0.0f;
    bool auto_recenter_done = false;

#if RECENTER_BUTTON_ENABLED
    bool prev_button = false;
    int64_t button_press_start_ms = 0;
#endif

    bool mag_cal_active = false;
#if IMU_HAS_MAG && RECENTER_BUTTON_ENABLED
    int64_t mag_cal_start_ms = 0;
    float mag_min[3] = {0.0f, 0.0f, 0.0f};
    float mag_max[3] = {0.0f, 0.0f, 0.0f};
#endif

    alert_state_t alert = {0};

    int64_t last_loop_us = esp_timer_get_time();
    int64_t boot_ms = last_loop_us / 1000;
    TickType_t last_wake = xTaskGetTickCount();
    const TickType_t period_ticks = pdMS_TO_TICKS((1000 / TELEMETRY_RATE_HZ));

    ESP_LOGI(TAG, "Main loop started at %d Hz", TELEMETRY_RATE_HZ);

    while (true) {
        vTaskDelayUntil(&last_wake, period_ticks);

        int64_t now_us = esp_timer_get_time();
        float dt_s = (float)(now_us - last_loop_us) / 1000000.0f;
        if (dt_s <= 0.0f || dt_s > 0.2f) {
            dt_s = 1.0f / (float)TELEMETRY_RATE_HZ;
        }
        last_loop_us = now_us;
        int64_t now_ms = now_us / 1000;

        imu_sample_t sample;
        if (imu_sensor_read_sample(&sample) != ESP_OK) {
            ESP_LOGW(TAG, "IMU read failed");
            continue;
        }

#if RECENTER_BUTTON_ENABLED
        bool btn = button_pressed();
        if (btn && !prev_button) {
            button_press_start_ms = now_ms;
        }

#if IMU_HAS_MAG
        if (btn && !mag_cal_active && (now_ms - button_press_start_ms) > 3000) {
            mag_cal_active = true;
            mag_cal_start_ms = now_ms;
            mag_min[0] = mag_max[0] = sample.mx_ut;
            mag_min[1] = mag_max[1] = sample.my_ut;
            mag_min[2] = mag_max[2] = sample.mz_ut;
            ESP_LOGI(TAG, "Mag calibration started: move device slowly through multiple orientations for 10s");
        }
#endif

        if (!btn && prev_button && (now_ms - button_press_start_ms) < 1200) {
            float y = 0.0f;
            float p = 0.0f;
            float r = 0.0f;
            madgwick_get_ypr_deg(&fusion, &y, &p, &r);
            yaw_offset = y;
            ESP_LOGI(TAG, "Heading recentered, yaw offset %.2f", yaw_offset);
        }

        prev_button = btn;

#if IMU_HAS_MAG
        if (mag_cal_active) {
            if (sample.mx_ut < mag_min[0]) {
                mag_min[0] = sample.mx_ut;
            }
            if (sample.my_ut < mag_min[1]) {
                mag_min[1] = sample.my_ut;
            }
            if (sample.mz_ut < mag_min[2]) {
                mag_min[2] = sample.mz_ut;
            }
            if (sample.mx_ut > mag_max[0]) {
                mag_max[0] = sample.mx_ut;
            }
            if (sample.my_ut > mag_max[1]) {
                mag_max[1] = sample.my_ut;
            }
            if (sample.mz_ut > mag_max[2]) {
                mag_max[2] = sample.mz_ut;
            }

            if ((now_ms - mag_cal_start_ms) >= 10000) {
                float ox = 0.5f * (mag_min[0] + mag_max[0]);
                float oy = 0.5f * (mag_min[1] + mag_max[1]);
                float oz = 0.5f * (mag_min[2] + mag_max[2]);
                imu_sensor_set_mag_offset(ox, oy, oz);
                mag_cal_active = false;
                ESP_LOGI(TAG, "Mag calibration done offset=(%.2f, %.2f, %.2f) uT", ox, oy, oz);
            }
        }
#endif
#endif

        const float dps_to_rad = 0.0174532925f;
#if IMU_HAS_MAG
        madgwick_update(
            &fusion,
            dt_s,
            sample.gx_dps * dps_to_rad,
            sample.gy_dps * dps_to_rad,
            sample.gz_dps * dps_to_rad,
            sample.ax_g,
            sample.ay_g,
            sample.az_g,
            sample.mx_ut,
            sample.my_ut,
            sample.mz_ut
        );
#else
        madgwick_update_imu(
            &fusion,
            dt_s,
            sample.gx_dps * dps_to_rad,
            sample.gy_dps * dps_to_rad,
            sample.gz_dps * dps_to_rad,
            sample.ax_g,
            sample.ay_g,
            sample.az_g
        );
#endif

        float yaw = 0.0f;
        float pitch = 0.0f;
        float roll = 0.0f;
        madgwick_get_ypr_deg(&fusion, &yaw, &pitch, &roll);

#if !RECENTER_BUTTON_ENABLED
        if (AUTO_RECENTER_ON_BOOT && !auto_recenter_done && (now_ms - boot_ms) >= AUTO_RECENTER_DELAY_MS) {
            yaw_offset = yaw;
            auto_recenter_done = true;
            ESP_LOGI(TAG, "Auto recenter done at boot, yaw offset %.2f", yaw_offset);
        }
#endif

        float yaw_recentered = wrap_deg(yaw - yaw_offset);

        uint8_t quality = 0;
#if IMU_HAS_MAG
        quality = compute_quality_score_mag(&sample, MAG_EXPECTED_UT);
#else
        quality = compute_quality_score_imu_only(&sample);
#endif

        uint8_t flags = 0;
#if !IMU_HAS_MAG
        flags |= FLAG_IMU_ONLY_MODE;
#endif
        if (auto_recenter_done) {
            flags |= FLAG_AUTO_RECENTER_DONE;
        }
        if (mag_cal_active) {
            flags |= FLAG_MAG_CAL_ACTIVE;
        }

        fdw_telemetry_t t = {
            .player_id = PLAYER_ID,
            .seq = seq++,
            .timestamp_ms = (uint32_t)now_ms,
            .yaw_cd = deg_to_centideg(yaw_recentered),
            .pitch_cd = deg_to_centideg(pitch),
            .roll_cd = deg_to_centideg(roll),
            .quality = quality,
            .pos_x_cm = 0,
            .pos_y_cm = 0,
            .pos_quality = 0,
            .battery_mv = 3700,
            .flags = flags,
        };

        uint8_t out_buf[FDW_TELEMETRY_PACKET_SIZE] = {0};
        size_t out_len = fdw_pack_telemetry(out_buf, sizeof(out_buf), &t);
        if (out_len == FDW_TELEMETRY_PACKET_SIZE) {
            (void)net_udp_send(out_buf, out_len);
        }

        uint8_t in_buf[64] = {0};
        int rx = net_udp_receive(in_buf, sizeof(in_buf), 0);
        if (rx == FDW_ALERT_PACKET_SIZE) {
            fdw_alert_t alert_pkt;
            if (fdw_unpack_alert(in_buf, rx, &alert_pkt) && alert_pkt.player_id == PLAYER_ID) {
                if (alert_pkt.alert_on) {
                    alert.active = true;
                    alert.intensity = alert_pkt.intensity;
                    alert.hold_until_ms = now_ms + alert_pkt.hold_ms;
                } else if (now_ms >= alert.hold_until_ms) {
                    alert.active = false;
                    alert.intensity = 0;
                }
            }
        }

        if (alert.active && now_ms > alert.hold_until_ms) {
            alert.active = false;
            alert.intensity = 0;
        }

        gpio_set_level(ALERT_OUTPUT_PIN, alert.active ? 1 : 0);

        static uint32_t log_div = 0;
        log_div++;
        if ((log_div % TELEMETRY_RATE_HZ) == 0) {
            ESP_LOGI(
                TAG,
                "yaw=%.1f pitch=%.1f roll=%.1f q=%u alert=%u intensity=%u flags=0x%02X",
                yaw_recentered,
                pitch,
                roll,
                quality,
                alert.active ? 1 : 0,
                clamp_u8_int(alert.intensity),
                flags
            );
        }
    }
}
