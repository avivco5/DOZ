from __future__ import annotations

from dataclasses import dataclass
import struct


MAGIC = b"FD"

# Alert packets stay on version 1 for backwards compatibility.
VERSION = 1
ALERT_VERSION = VERSION
TELEMETRY_VERSION_V1 = 1
TELEMETRY_VERSION_V2 = 2

MSG_TELEMETRY = 1
MSG_ALERT = 2

TELEMETRY_V1_FMT_NOCRC = "<2sBBBHIhhhBiiBHB"
TELEMETRY_V1_FMT = "<2sBBBHIhhhBiiBHBH"
TELEMETRY_V1_SIZE = struct.calcsize(TELEMETRY_V1_FMT)

# v2 telemetry extends v1 with GPS fields:
# gps_lat_e7 (i32), gps_lon_e7 (i32), gps_alt_cm (i32), gps_quality (u8)
TELEMETRY_V2_FMT_NOCRC = "<2sBBBHIhhhBiiBHBiiiB"
TELEMETRY_V2_FMT = "<2sBBBHIhhhBiiBHBiiiBH"
TELEMETRY_V2_SIZE = struct.calcsize(TELEMETRY_V2_FMT)

# Backwards compatibility aliases.
TELEMETRY_FMT_NOCRC = TELEMETRY_V1_FMT_NOCRC
TELEMETRY_FMT = TELEMETRY_V1_FMT
TELEMETRY_SIZE = TELEMETRY_V1_SIZE

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
    gps_lat_deg: float | None = None
    gps_lon_deg: float | None = None
    gps_alt_m: float | None = None
    gps_quality: int = 0
    version: int = TELEMETRY_VERSION_V1


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


def _clamp_i32(value: int) -> int:
    return max(-2147483648, min(2147483647, int(value)))


def _deg_to_e7(value_deg: float) -> int:
    return _clamp_i32(int(round(value_deg * 10_000_000.0)))


def _packet_has_gps(pkt: TelemetryPacket) -> bool:
    return pkt.gps_lat_deg is not None and pkt.gps_lon_deg is not None


def encode_telemetry(pkt: TelemetryPacket) -> bytes:
    if pkt.version not in (TELEMETRY_VERSION_V1, TELEMETRY_VERSION_V2):
        raise PacketError(f"unsupported telemetry version for encode: {pkt.version}")

    use_v2 = pkt.version == TELEMETRY_VERSION_V2 or _packet_has_gps(pkt)

    if use_v2:
        gps_lat_e7 = _deg_to_e7(pkt.gps_lat_deg or 0.0)
        gps_lon_e7 = _deg_to_e7(pkt.gps_lon_deg or 0.0)
        gps_alt_cm = _clamp_i32(int(round((pkt.gps_alt_m or 0.0) * 100.0)))
        payload = struct.pack(
            TELEMETRY_V2_FMT_NOCRC,
            MAGIC,
            TELEMETRY_VERSION_V2,
            MSG_TELEMETRY,
            pkt.player_id & 0xFF,
            pkt.seq & 0xFFFF,
            pkt.timestamp_ms & 0xFFFFFFFF,
            _clamp_i16_centideg(pkt.yaw_deg),
            _clamp_i16_centideg(pkt.pitch_deg),
            _clamp_i16_centideg(pkt.roll_deg),
            max(0, min(100, int(pkt.quality))),
            _clamp_i32(pkt.pos_x_cm),
            _clamp_i32(pkt.pos_y_cm),
            max(0, min(100, int(pkt.pos_quality))),
            max(0, min(65535, int(pkt.battery_mv))),
            pkt.flags & 0xFF,
            gps_lat_e7,
            gps_lon_e7,
            gps_alt_cm,
            max(0, min(100, int(pkt.gps_quality))),
        )
    else:
        payload = struct.pack(
            TELEMETRY_V1_FMT_NOCRC,
            MAGIC,
            TELEMETRY_VERSION_V1,
            MSG_TELEMETRY,
            pkt.player_id & 0xFF,
            pkt.seq & 0xFFFF,
            pkt.timestamp_ms & 0xFFFFFFFF,
            _clamp_i16_centideg(pkt.yaw_deg),
            _clamp_i16_centideg(pkt.pitch_deg),
            _clamp_i16_centideg(pkt.roll_deg),
            max(0, min(100, int(pkt.quality))),
            _clamp_i32(pkt.pos_x_cm),
            _clamp_i32(pkt.pos_y_cm),
            max(0, min(100, int(pkt.pos_quality))),
            max(0, min(65535, int(pkt.battery_mv))),
            pkt.flags & 0xFF,
        )

    crc = crc16_ccitt_false(payload)
    return payload + struct.pack("<H", crc)


def decode_telemetry(data: bytes) -> TelemetryPacket:
    if len(data) < 4:
        raise PacketError(f"telemetry too short: {len(data)}")

    magic = data[0:2]
    version = data[2]
    msg_type = data[3]
    if magic != MAGIC:
        raise PacketError("bad telemetry magic")
    if msg_type != MSG_TELEMETRY:
        raise PacketError(f"bad telemetry type: {msg_type}")

    if version == TELEMETRY_VERSION_V1:
        if len(data) != TELEMETRY_V1_SIZE:
            raise PacketError(f"telemetry v1 size mismatch: {len(data)} != {TELEMETRY_V1_SIZE}")
        unpacked = struct.unpack(TELEMETRY_V1_FMT, data)
        (
            _magic,
            _version,
            _msg_type,
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
            gps_lat_deg=None,
            gps_lon_deg=None,
            gps_alt_m=None,
            gps_quality=0,
            version=TELEMETRY_VERSION_V1,
        )

    if version == TELEMETRY_VERSION_V2:
        if len(data) != TELEMETRY_V2_SIZE:
            raise PacketError(f"telemetry v2 size mismatch: {len(data)} != {TELEMETRY_V2_SIZE}")
        unpacked = struct.unpack(TELEMETRY_V2_FMT, data)
        (
            _magic,
            _version,
            _msg_type,
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
            gps_lat_e7,
            gps_lon_e7,
            gps_alt_cm,
            gps_quality,
            recv_crc,
        ) = unpacked
        calc_crc = crc16_ccitt_false(data[:-2])
        if calc_crc != recv_crc:
            raise PacketError(f"bad telemetry crc: {recv_crc:#06x} != {calc_crc:#06x}")

        has_gps = gps_quality > 0
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
            gps_lat_deg=(gps_lat_e7 / 10_000_000.0) if has_gps else None,
            gps_lon_deg=(gps_lon_e7 / 10_000_000.0) if has_gps else None,
            gps_alt_m=(gps_alt_cm / 100.0) if has_gps else None,
            gps_quality=gps_quality,
            version=TELEMETRY_VERSION_V2,
        )

    raise PacketError(f"bad telemetry version: {version}")


def encode_alert(pkt: AlertPacket) -> bytes:
    payload = struct.pack(
        ALERT_FMT_NOCRC,
        MAGIC,
        ALERT_VERSION,
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
    if version != ALERT_VERSION:
        raise PacketError(f"bad alert version: {version}")
    if msg_type != MSG_ALERT:
        raise PacketError(f"bad alert type: {msg_type}")
    calc_crc = crc16_ccitt_false(data[:-2])
    if calc_crc != recv_crc:
        raise PacketError(f"bad alert crc: {recv_crc:#06x} != {calc_crc:#06x}")
    return AlertPacket(player_id=player_id, alert_on=alert_on, intensity=intensity, hold_ms=hold_ms)
