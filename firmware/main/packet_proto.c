#include "packet_proto.h"

static void write_u16_le(uint8_t *buf, uint16_t v) {
    buf[0] = (uint8_t)(v & 0xFF);
    buf[1] = (uint8_t)((v >> 8) & 0xFF);
}

static void write_u32_le(uint8_t *buf, uint32_t v) {
    buf[0] = (uint8_t)(v & 0xFF);
    buf[1] = (uint8_t)((v >> 8) & 0xFF);
    buf[2] = (uint8_t)((v >> 16) & 0xFF);
    buf[3] = (uint8_t)((v >> 24) & 0xFF);
}

static uint16_t read_u16_le(const uint8_t *buf) {
    return (uint16_t)buf[0] | ((uint16_t)buf[1] << 8);
}

uint16_t fdw_crc16_ccitt(const uint8_t *data, size_t len) {
    uint16_t crc = 0xFFFF;
    for (size_t i = 0; i < len; ++i) {
        crc ^= (uint16_t)data[i] << 8;
        for (int bit = 0; bit < 8; ++bit) {
            if ((crc & 0x8000) != 0) {
                crc = (uint16_t)((crc << 1) ^ 0x1021);
            } else {
                crc = (uint16_t)(crc << 1);
            }
        }
    }
    return crc;
}

size_t fdw_pack_telemetry(uint8_t *out, size_t cap, const fdw_telemetry_t *pkt) {
    if (out == NULL || pkt == NULL || cap < FDW_TELEMETRY_PACKET_SIZE) {
        return 0;
    }

    size_t i = 0;
    out[i++] = FDW_MAGIC0;
    out[i++] = FDW_MAGIC1;
    out[i++] = FDW_VERSION;
    out[i++] = FDW_MSG_TELEMETRY;
    out[i++] = pkt->player_id;

    write_u16_le(&out[i], pkt->seq);
    i += 2;

    write_u32_le(&out[i], pkt->timestamp_ms);
    i += 4;

    write_u16_le(&out[i], (uint16_t)pkt->yaw_cd);
    i += 2;
    write_u16_le(&out[i], (uint16_t)pkt->pitch_cd);
    i += 2;
    write_u16_le(&out[i], (uint16_t)pkt->roll_cd);
    i += 2;

    out[i++] = pkt->quality;

    write_u32_le(&out[i], (uint32_t)pkt->pos_x_cm);
    i += 4;
    write_u32_le(&out[i], (uint32_t)pkt->pos_y_cm);
    i += 4;

    out[i++] = pkt->pos_quality;

    write_u16_le(&out[i], pkt->battery_mv);
    i += 2;
    out[i++] = pkt->flags;

    uint16_t crc = fdw_crc16_ccitt(out, i);
    write_u16_le(&out[i], crc);
    i += 2;

    return i;
}

bool fdw_unpack_alert(const uint8_t *data, size_t len, fdw_alert_t *out) {
    if (data == NULL || out == NULL || len != FDW_ALERT_PACKET_SIZE) {
        return false;
    }
    if (data[0] != FDW_MAGIC0 || data[1] != FDW_MAGIC1) {
        return false;
    }
    if (data[2] != FDW_VERSION || data[3] != FDW_MSG_ALERT) {
        return false;
    }

    uint16_t expected_crc = read_u16_le(&data[len - 2]);
    uint16_t actual_crc = fdw_crc16_ccitt(data, len - 2);
    if (expected_crc != actual_crc) {
        return false;
    }

    out->player_id = data[4];
    out->alert_on = data[5];
    out->intensity = data[6];
    out->hold_ms = read_u16_le(&data[7]);
    return true;
}
