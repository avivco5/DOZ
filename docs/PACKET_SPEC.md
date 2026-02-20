# Packet Specification

All packets are binary UDP, little-endian, fixed layout, CRC16 protected.

## Common
- Magic bytes: `0x46 0x44` (`"FD"`)
- Version: `1`
- CRC: CRC-16/CCITT-FALSE (`poly=0x1021`, init `0xFFFF`, xorout `0x0000`)
- CRC is computed over all bytes except the final `crc16` field.

## Telemetry Packet

Message type: `1`

| Field | Type | Units | Notes |
|---|---|---|---|
| magic | u8[2] | - | `FD` |
| version | u8 | - | `1` |
| msg_type | u8 | - | `1` |
| player_id | u8 | - | 1..255 |
| seq | u16 | - | wraps |
| timestamp_ms | u32 | ms | node monotonic |
| yaw_deg_cd | i16 | centi-deg | yaw * 100 |
| pitch_deg_cd | i16 | centi-deg | pitch * 100 |
| roll_deg_cd | i16 | centi-deg | roll * 100 |
| quality | u8 | 0..100 | fusion quality |
| pos_x_cm | i32 | cm | local arena x |
| pos_y_cm | i32 | cm | local arena y |
| pos_quality | u8 | 0..100 | position confidence |
| battery_mv | u16 | mV | battery reading |
| flags | u8 | bitfield | `bit0` IMU-only, `bit1` auto-recenter-done, `bit2` mag-cal-active |
| crc16 | u16 | - | integrity |

Total size: 32 bytes.

Struct format (`python struct`):
- Without CRC: `"<2sBBBHIhhhBiiBHB"`
- With CRC: `"<2sBBBHIhhhBiiBHBH"`

## Alert Command Packet

Message type: `2`

| Field | Type | Units | Notes |
|---|---|---|---|
| magic | u8[2] | - | `FD` |
| version | u8 | - | `1` |
| msg_type | u8 | - | `2` |
| player_id | u8 | - | destination id |
| alert_on | u8 | 0/1 | state |
| intensity | u8 | 0..255 | output intensity |
| hold_ms | u16 | ms | hold timer hint |
| crc16 | u16 | - | integrity |

Total size: 11 bytes.

Struct format (`python struct`):
- Without CRC: `"<2sBBBBBH"`
- With CRC: `"<2sBBBBBHH"`

## Validation Rules
- Packet length must match exact expected size.
- Magic/version/msg_type must match known values.
- CRC must match calculated CRC.
- Values out of expected ranges are clamped at pack time on node.
