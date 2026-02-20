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

    last_seen_ms: int | None = None
    online: bool = False
    addr: tuple[str, int] | None = None

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

    def ingest_telemetry(self, pkt: TelemetryPacket, addr: tuple[str, int], now_ms: int) -> None:
        player = self.ensure_player(pkt.player_id)
        player.seq = pkt.seq
        player.timestamp_ms = pkt.timestamp_ms
        player.yaw_deg = pkt.yaw_deg
        player.pitch_deg = pkt.pitch_deg
        player.roll_deg = pkt.roll_deg
        player.quality = pkt.quality
        player.battery_mv = pkt.battery_mv
        player.flags = pkt.flags
        player.pos_quality = pkt.pos_quality
        player.last_seen_ms = now_ms
        player.online = True
        player.addr = addr

        if pkt.pos_quality > 0:
            player.real_x_m = pkt.pos_x_cm / 100.0
            player.real_y_m = pkt.pos_y_cm / 100.0

    def update_online_flags(self, now_ms: int) -> None:
        timeout = self.config.offline_timeout_ms
        for player in self.players.values():
            if player.last_seen_ms is None:
                player.online = False
                continue
            player.online = (now_ms - player.last_seen_ms) <= timeout

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
                    "battery_mv": player.battery_mv,
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
