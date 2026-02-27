from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .config import CoordinatorConfig
from .packet import TelemetryPacket
from .world_sim import WorldSimulator


@dataclass(slots=True)
class PlayerState:
    player_id: int
    seq: int = 0
    timestamp_ms: int = 0
    yaw_deg: float = 0.0
    pitch_deg: float = 0.0
    roll_deg: float = 0.0
    quality: int = 0
    battery_mv: int = 0
    flags: int = 0

    real_x_m: float | None = None
    real_y_m: float | None = None
    pos_quality: int = 0
    gps_lat_deg: float | None = None
    gps_lon_deg: float | None = None
    gps_alt_m: float | None = None
    gps_quality: int = 0

    last_seen_ms: int | None = None
    online: bool = False
    connected_since_ms: int | None = None
    addr: tuple[str, int] | None = None
    packet_rate_hz: float = 0.0
    seq_drop_count: int = 0

    alert_on: bool = False
    alert_intensity: int = 0
    alert_hold_until_ms: int = 0


@dataclass(slots=True)
class LogicPlayer:
    player_id: int
    yaw_deg: float
    quality: int
    online: bool
    position: tuple[float, float] | None
    addr: tuple[str, int] | None


class PlayerRegistry:
    def __init__(self, config: CoordinatorConfig, world: WorldSimulator) -> None:
        self.config = config
        self.world = world
        self.players: dict[int, PlayerState] = {}
        for pid in config.default_player_ids:
            self.ensure_player(pid)

    def ensure_player(self, player_id: int) -> PlayerState:
        player = self.players.get(player_id)
        if player is not None:
            self.world.ensure_player(player_id)
            return player
        player = PlayerState(player_id=player_id)
        self.players[player_id] = player
        self.world.ensure_player(player_id)
        return player

    def next_available_player_id(self) -> int | None:
        for candidate in range(1, 256):
            if candidate not in self.players:
                return candidate
        return None

    def add_sim_player(self) -> int | None:
        player_id = self.next_available_player_id()
        if player_id is None:
            return None
        self.ensure_player(player_id)
        return player_id

    def remove_sim_player(self) -> int | None:
        removable_ids = [
            player_id
            for player_id, player in self.players.items()
            if player.addr is None
        ]
        if not removable_ids:
            return None

        player_id = max(removable_ids)
        self.players.pop(player_id, None)
        self.world.remove_player(player_id)
        return player_id

    def ingest_telemetry(self, pkt: TelemetryPacket, addr: tuple[str, int], now_ms: int) -> None:
        player = self.ensure_player(pkt.player_id)
        prev_seq = player.seq
        prev_seen_ms = player.last_seen_ms
        was_online = player.online

        if prev_seen_ms is not None:
            dt_ms = max(0, now_ms - prev_seen_ms)
            if dt_ms > 0:
                instant_rate_hz = 1000.0 / dt_ms
                if player.packet_rate_hz <= 0.0:
                    player.packet_rate_hz = instant_rate_hz
                else:
                    player.packet_rate_hz = (player.packet_rate_hz * 0.8) + (instant_rate_hz * 0.2)

        if prev_seen_ms is not None:
            seq_delta = (pkt.seq - prev_seq) & 0xFFFF
            if 1 < seq_delta < 0x8000:
                player.seq_drop_count += seq_delta - 1

        player.seq = pkt.seq
        player.timestamp_ms = pkt.timestamp_ms
        player.yaw_deg = pkt.yaw_deg
        player.pitch_deg = pkt.pitch_deg
        player.roll_deg = pkt.roll_deg
        player.quality = pkt.quality
        player.battery_mv = pkt.battery_mv
        player.flags = pkt.flags
        player.pos_quality = pkt.pos_quality
        player.gps_lat_deg = pkt.gps_lat_deg
        player.gps_lon_deg = pkt.gps_lon_deg
        player.gps_alt_m = pkt.gps_alt_m
        player.gps_quality = pkt.gps_quality
        player.last_seen_ms = now_ms
        player.online = True
        if (player.connected_since_ms is None) or (not was_online):
            player.connected_since_ms = now_ms
        player.addr = addr

        if pkt.pos_quality > 0:
            player.real_x_m = pkt.pos_x_cm / 100.0
            player.real_y_m = pkt.pos_y_cm / 100.0

    def update_online_flags(self, now_ms: int) -> None:
        timeout = self.config.offline_timeout_ms
        for player in self.players.values():
            was_online = player.online
            if self.config.sim_players_emulate_real and player.addr is None:
                player.last_seen_ms = now_ms
                player.online = True
                if (player.connected_since_ms is None) or (not was_online):
                    player.connected_since_ms = now_ms
                if self.config.world_update_hz > 0.0:
                    player.packet_rate_hz = self.config.world_update_hz
                continue
            if player.last_seen_ms is None:
                player.online = False
                player.connected_since_ms = None
                continue
            player.online = (now_ms - player.last_seen_ms) <= timeout
            if was_online and not player.online:
                player.connected_since_ms = None

    def _has_valid_real_position(self, player: PlayerState) -> bool:
        if player.real_x_m is None or player.real_y_m is None:
            return False
        return player.pos_quality >= self.config.pos_quality_threshold

    def display_position(self, player: PlayerState) -> tuple[tuple[float, float], str]:
        if self._has_valid_real_position(player):
            return (player.real_x_m or 0.0, player.real_y_m or 0.0), "real"

        sim = self.world.ensure_player(player.player_id)
        return (sim.x_m, sim.y_m), "sim"

    def logic_position(self, player: PlayerState) -> tuple[float, float] | None:
        if self._has_valid_real_position(player):
            return (player.real_x_m or 0.0, player.real_y_m or 0.0)
        if self.config.use_sim_positions:
            sim = self.world.ensure_player(player.player_id)
            return (sim.x_m, sim.y_m)
        return None

    def build_logic_players(self) -> dict[int, LogicPlayer]:
        out: dict[int, LogicPlayer] = {}
        for player_id, player in self.players.items():
            out[player_id] = LogicPlayer(
                player_id=player_id,
                yaw_deg=player.yaw_deg,
                quality=player.quality,
                online=player.online,
                position=self.logic_position(player),
                addr=player.addr,
            )
        return out

    def update_alert_hysteresis(
        self,
        player_id: int,
        now_ms: int,
        inside_on: bool,
        inside_off: bool,
        intensity: int,
    ) -> bool:
        player = self.players[player_id]
        prev_state = (player.alert_on, player.alert_intensity)

        if player.alert_on:
            if inside_on:
                player.alert_hold_until_ms = now_ms + self.config.alert_hold_ms
                player.alert_intensity = intensity
            elif (not inside_off) or (now_ms >= player.alert_hold_until_ms):
                player.alert_on = False
                player.alert_intensity = 0
            else:
                player.alert_intensity = max(player.alert_intensity, 64)
        elif inside_on:
            player.alert_on = True
            player.alert_intensity = intensity
            player.alert_hold_until_ms = now_ms + self.config.alert_hold_ms

        return prev_state != (player.alert_on, player.alert_intensity)

    def world_state_message(self, now_ms: int) -> dict[str, Any]:
        players_payload: list[dict[str, Any]] = []

        for player_id in sorted(self.players):
            player = self.players[player_id]
            (x_m, y_m), pos_source = self.display_position(player)
            sim_player = self.world.ensure_player(player_id)
            trail = [[round(px, 3), round(py, 3)] for px, py in sim_player.trail]
            last_seen_ms_ago = None if player.last_seen_ms is None else max(0, now_ms - player.last_seen_ms)

            players_payload.append(
                {
                    "id": player_id,
                    "x_m": round(x_m, 3),
                    "y_m": round(y_m, 3),
                    "yaw_deg": round(player.yaw_deg, 2),
                    "pitch_deg": round(player.pitch_deg, 2),
                    "roll_deg": round(player.roll_deg, 2),
                    "quality": player.quality,
                    "online": player.online,
                    "alert": player.alert_on,
                    "alert_intensity": player.alert_intensity,
                    "pos_source": pos_source,
                    "pos_quality": player.pos_quality,
                    "gps_lat_deg": None if player.gps_lat_deg is None else round(player.gps_lat_deg, 7),
                    "gps_lon_deg": None if player.gps_lon_deg is None else round(player.gps_lon_deg, 7),
                    "gps_alt_m": None if player.gps_alt_m is None else round(player.gps_alt_m, 2),
                    "gps_quality": player.gps_quality,
                    "battery_mv": player.battery_mv,
                    "battery_v": round(player.battery_mv / 1000.0, 2) if player.battery_mv > 0 else None,
                    "packet_rate_hz": round(player.packet_rate_hz, 2),
                    "seq_drop_count": player.seq_drop_count,
                    "connected_since_ms": player.connected_since_ms,
                    "addr": None if player.addr is None else f"{player.addr[0]}:{player.addr[1]}",
                    "trail": trail,
                    "last_seen_ms_ago": last_seen_ms_ago,
                }
            )

        return {
            "type": "world_state",
            "ts_ms": now_ms,
            "players": players_payload,
            "config": self.config.to_dict(),
            "arena": {
                "width_m": self.world.arena_width_m,
                "height_m": self.world.arena_height_m,
            },
        }
