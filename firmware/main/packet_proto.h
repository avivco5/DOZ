#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define FDW_MAGIC0 0x46
#define FDW_MAGIC1 0x44
#define FDW_ALERT_VERSION 0x01
#define FDW_TELEMETRY_VERSION 0x02
#define FDW_MSG_TELEMETRY 0x01
#define FDW_MSG_ALERT 0x02

#define FDW_TELEMETRY_PACKET_SIZE 45
#define FDW_ALERT_PACKET_SIZE 11

typedef struct {
    uint8_t player_id;
    uint16_t seq;
    uint32_t timestamp_ms;
    int16_t yaw_cd;
    int16_t pitch_cd;
    int16_t roll_cd;
    uint8_t quality;
    int32_t pos_x_cm;
    int32_t pos_y_cm;
    uint8_t pos_quality;
    uint16_t battery_mv;
    uint8_t flags;
    int32_t gps_lat_e7;
    int32_t gps_lon_e7;
    int32_t gps_alt_cm;
    uint8_t gps_quality;
} fdw_telemetry_t;

typedef struct {
    uint8_t player_id;
    uint8_t alert_on;
    uint8_t intensity;
    uint16_t hold_ms;
} fdw_alert_t;

uint16_t fdw_crc16_ccitt(const uint8_t *data, size_t len);
size_t fdw_pack_telemetry(uint8_t *out, size_t cap, const fdw_telemetry_t *pkt);
bool fdw_unpack_alert(const uint8_t *data, size_t len, fdw_alert_t *out);
