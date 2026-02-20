from __future__ import annotations

import pytest

from server.packet import (
    PacketError,
    TelemetryPacket,
    decode_telemetry,
    encode_telemetry,
)


def test_telemetry_roundtrip() -> None:
    src = TelemetryPacket(
        player_id=2,
        seq=345,
        timestamp_ms=123456789,
        yaw_deg=12.34,
        pitch_deg=-5.67,
        roll_deg=1.25,
        quality=88,
        pos_x_cm=120,
        pos_y_cm=-340,
        pos_quality=77,
        battery_mv=3720,
        flags=3,
    )

    payload = encode_telemetry(src)
    decoded = decode_telemetry(payload)

    assert decoded.player_id == src.player_id
    assert decoded.seq == src.seq
    assert decoded.timestamp_ms == src.timestamp_ms
    assert decoded.yaw_deg == pytest.approx(src.yaw_deg, abs=0.01)
    assert decoded.pitch_deg == pytest.approx(src.pitch_deg, abs=0.01)
    assert decoded.roll_deg == pytest.approx(src.roll_deg, abs=0.01)
    assert decoded.quality == src.quality
    assert decoded.pos_x_cm == src.pos_x_cm
    assert decoded.pos_y_cm == src.pos_y_cm
    assert decoded.pos_quality == src.pos_quality
    assert decoded.battery_mv == src.battery_mv
    assert decoded.flags == src.flags


def test_telemetry_crc_rejects_tamper() -> None:
    src = TelemetryPacket(
        player_id=1,
        seq=1,
        timestamp_ms=1,
        yaw_deg=0.0,
        pitch_deg=0.0,
        roll_deg=0.0,
        quality=50,
        pos_x_cm=0,
        pos_y_cm=0,
        pos_quality=0,
        battery_mv=3600,
        flags=0,
    )
    payload = bytearray(encode_telemetry(src))
    payload[10] ^= 0xFF

    with pytest.raises(PacketError):
        decode_telemetry(bytes(payload))
