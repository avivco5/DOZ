from __future__ import annotations

from dataclasses import dataclass
import struct


MAGIC = b"FD"
VERSION = 1
MSG_TELEMETRY = 1
MSG_ALERT = 2

TELEMETRY_FMT_NOCRC = "<2sBBBHIhhhBiiBHB"
TELEMETRY_FMT = "<2sBBBHIhhhBiiBHBH"
TELEMETRY_SIZE = struct.calcsize(TELEMETRY_FMT)

ALERT_FMT_NOCRC = "<2sBBBBBH"
ALERT_FMT = "<2sBBBBBHH"
ALERT_SIZE = struct.calcsize(ALERT_FMT)


class PacketError(ValueError):
    pass


@dataclass(slots=True)
class TelemetryPacket:
    player_id: int
    seq: int
    timestamp_ms: int
    yaw_deg: float
    pitch_deg: float
    roll_deg: float
    quality: int
    pos_x_cm: int
    pos_y_cm: int
    pos_quality: int
    battery_mv: int
    flags: int


@dataclass(slots=True)
class AlertPacket:
    player_id: int
    alert_on: int
    intensity: int
    hold_ms: int


def crc16_ccitt_false(data: bytes) -> int:
    crc = 0xFFFF
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return crc


def _clamp_i16_centideg(value_deg: float) -> int:
    scaled = int(round(value_deg * 100.0))
    return max(-32768, min(32767, scaled))


def encode_telemetry(pkt: TelemetryPacket) -> bytes:
    payload = struct.pack(
        TELEMETRY_FMT_NOCRC,
        MAGIC,
        VERSION,
        MSG_TELEMETRY,
        pkt.player_id & 0xFF,
        pkt.seq & 0xFFFF,
        pkt.timestamp_ms & 0xFFFFFFFF,
        _clamp_i16_centideg(pkt.yaw_deg),
        _clamp_i16_centideg(pkt.pitch_deg),
        _clamp_i16_centideg(pkt.roll_deg),
        max(0, min(100, int(pkt.quality))),
        int(pkt.pos_x_cm),
        int(pkt.pos_y_cm),
        max(0, min(100, int(pkt.pos_quality))),
        max(0, min(65535, int(pkt.battery_mv))),
        pkt.flags & 0xFF,
    )
    crc = crc16_ccitt_false(payload)
    return payload + struct.pack("<H", crc)


def decode_telemetry(data: bytes) -> TelemetryPacket:
    if len(data) != TELEMETRY_SIZE:
        raise PacketError(f"telemetry size mismatch: {len(data)} != {TELEMETRY_SIZE}")
    unpacked = struct.unpack(TELEMETRY_FMT, data)
    (
        magic,
        version,
        msg_type,
        player_id,
        seq,
        timestamp_ms,
        yaw_cd,
        pitch_cd,
        roll_cd,
        quality,
        pos_x_cm,
        pos_y_cm,
        pos_quality,
        battery_mv,
        flags,
        recv_crc,
    ) = unpacked
    if magic != MAGIC:
        raise PacketError("bad telemetry magic")
    if version != VERSION:
        raise PacketError(f"bad telemetry version: {version}")
    if msg_type != MSG_TELEMETRY:
        raise PacketError(f"bad telemetry type: {msg_type}")
    calc_crc = crc16_ccitt_false(data[:-2])
    if calc_crc != recv_crc:
        raise PacketError(f"bad telemetry crc: {recv_crc:#06x} != {calc_crc:#06x}")
    return TelemetryPacket(
        player_id=player_id,
        seq=seq,
        timestamp_ms=timestamp_ms,
        yaw_deg=yaw_cd / 100.0,
        pitch_deg=pitch_cd / 100.0,
        roll_deg=roll_cd / 100.0,
        quality=quality,
        pos_x_cm=pos_x_cm,
        pos_y_cm=pos_y_cm,
        pos_quality=pos_quality,
        battery_mv=battery_mv,
        flags=flags,
    )


def encode_alert(pkt: AlertPacket) -> bytes:
    payload = struct.pack(
        ALERT_FMT_NOCRC,
        MAGIC,
        VERSION,
        MSG_ALERT,
        pkt.player_id & 0xFF,
        1 if pkt.alert_on else 0,
        max(0, min(255, int(pkt.intensity))),
        max(0, min(65535, int(pkt.hold_ms))),
    )
    crc = crc16_ccitt_false(payload)
    return payload + struct.pack("<H", crc)


def decode_alert(data: bytes) -> AlertPacket:
    if len(data) != ALERT_SIZE:
        raise PacketError(f"alert size mismatch: {len(data)} != {ALERT_SIZE}")
    unpacked = struct.unpack(ALERT_FMT, data)
    magic, version, msg_type, player_id, alert_on, intensity, hold_ms, recv_crc = unpacked
    if magic != MAGIC:
        raise PacketError("bad alert magic")
    if version != VERSION:
        raise PacketError(f"bad alert version: {version}")
    if msg_type != MSG_ALERT:
        raise PacketError(f"bad alert type: {msg_type}")
    calc_crc = crc16_ccitt_false(data[:-2])
    if calc_crc != recv_crc:
        raise PacketError(f"bad alert crc: {recv_crc:#06x} != {calc_crc:#06x}")
    return AlertPacket(player_id=player_id, alert_on=alert_on, intensity=intensity, hold_ms=hold_ms)
