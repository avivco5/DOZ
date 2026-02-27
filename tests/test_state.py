from __future__ import annotations

import pytest

from server.config import CoordinatorConfig
from server.packet import TelemetryPacket
from server.state import PlayerRegistry
from server.world_sim import WorldSimulator


def build_registry(config: CoordinatorConfig) -> PlayerRegistry:
    world = WorldSimulator(
        arena_width_m=config.arena_width_m,
        arena_height_m=config.arena_height_m,
        speed_mps=config.sim_speed_mps,
        update_hz=config.world_update_hz,
        boundary_behavior=config.boundary_behavior,
        steering_noise=config.sim_noise,
        trail_seconds=config.trail_seconds,
        seed=1234,
    )
    return PlayerRegistry(config=config, world=world)


def test_sim_players_offline_without_emulation() -> None:
    config = CoordinatorConfig(default_player_ids=(), sim_players_emulate_real=False)
    registry = build_registry(config)
    player_id = registry.add_sim_player()
    assert player_id is not None

    registry.update_online_flags(now_ms=10_000)
    player = registry.players[player_id]

    assert player.online is False
    assert player.last_seen_ms is None
    assert player.connected_since_ms is None


def test_sim_players_emulate_real_heartbeat_when_enabled() -> None:
    config = CoordinatorConfig(default_player_ids=(), sim_players_emulate_real=True, world_update_hz=12.5)
    registry = build_registry(config)
    player_id = registry.add_sim_player()
    assert player_id is not None

    registry.update_online_flags(now_ms=5_000)
    player = registry.players[player_id]

    assert player.online is True
    assert player.last_seen_ms == 5_000
    assert player.connected_since_ms == 5_000
    assert player.packet_rate_hz == pytest.approx(12.5)

    registry.update_online_flags(now_ms=6_500)
    assert player.last_seen_ms == 6_500
    assert player.connected_since_ms == 5_000


def test_real_players_still_timeout_with_emulation_enabled() -> None:
    config = CoordinatorConfig(default_player_ids=(), sim_players_emulate_real=True, offline_timeout_ms=2_000)
    registry = build_registry(config)
    pkt = TelemetryPacket(
        player_id=7,
        seq=1,
        timestamp_ms=0,
        yaw_deg=0.0,
        pitch_deg=0.0,
        roll_deg=0.0,
        quality=90,
        pos_x_cm=0,
        pos_y_cm=0,
        pos_quality=0,
        battery_mv=3700,
        flags=0,
    )

    registry.ingest_telemetry(pkt, addr=("127.0.0.1", 12007), now_ms=1_000)
    player = registry.players[7]
    assert player.online is True
    assert player.addr == ("127.0.0.1", 12007)

    registry.update_online_flags(now_ms=2_500)
    assert player.online is True

    registry.update_online_flags(now_ms=3_500)
    assert player.online is False
    assert player.connected_since_ms is None
