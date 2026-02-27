from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
import math
import random
from typing import Deque


@dataclass(slots=True)
class SimPlayer:
    player_id: int
    x_m: float
    y_m: float
    heading_rad: float
    vx_mps: float
    vy_mps: float
    trail: Deque[tuple[float, float]] = field(default_factory=deque)


class WorldSimulator:
    def __init__(
        self,
        arena_width_m: float,
        arena_height_m: float,
        speed_mps: float = 0.4,
        update_hz: float = 10.0,
        boundary_behavior: str = "bounce",
        steering_noise: float = 0.35,
        trail_seconds: float = 8.0,
        seed: int | None = None,
    ) -> None:
        self.arena_width_m = arena_width_m
        self.arena_height_m = arena_height_m
        self.speed_mps = speed_mps
        self.update_hz = update_hz
        self.boundary_behavior = boundary_behavior
        self.steering_noise = steering_noise
        self.trail_seconds = trail_seconds
        self.paused = False
        self._players: dict[int, SimPlayer] = {}
        self._rng = random.Random(seed)

    @property
    def players(self) -> dict[int, SimPlayer]:
        return self._players

    def configure(
        self,
        *,
        arena_width_m: float | None = None,
        arena_height_m: float | None = None,
        speed_mps: float | None = None,
        update_hz: float | None = None,
        boundary_behavior: str | None = None,
        steering_noise: float | None = None,
    ) -> None:
        if arena_width_m is not None:
            self.arena_width_m = float(arena_width_m)
        if arena_height_m is not None:
            self.arena_height_m = float(arena_height_m)
        if speed_mps is not None:
            self.speed_mps = float(speed_mps)
        if update_hz is not None and update_hz > 0.1:
            self.update_hz = float(update_hz)
        if boundary_behavior is not None:
            self.boundary_behavior = boundary_behavior
        if steering_noise is not None:
            self.steering_noise = float(steering_noise)

    def ensure_player(self, player_id: int) -> SimPlayer:
        if player_id in self._players:
            return self._players[player_id]
        x = self._rng.uniform(0.0, self.arena_width_m)
        y = self._rng.uniform(0.0, self.arena_height_m)
        heading = self._rng.uniform(-math.pi, math.pi)
        vx = math.cos(heading) * self.speed_mps
        vy = math.sin(heading) * self.speed_mps
        trail_len = max(10, int(self.update_hz * self.trail_seconds))
        trail: Deque[tuple[float, float]] = deque(maxlen=trail_len)
        trail.append((x, y))
        player = SimPlayer(
            player_id=player_id,
            x_m=x,
            y_m=y,
            heading_rad=heading,
            vx_mps=vx,
            vy_mps=vy,
            trail=trail,
        )
        self._players[player_id] = player
        return player

    def remove_player(self, player_id: int) -> bool:
        if player_id not in self._players:
            return False
        del self._players[player_id]
        return True

    def randomize_positions(self) -> None:
        for player in self._players.values():
            player.x_m = self._rng.uniform(0.0, self.arena_width_m)
            player.y_m = self._rng.uniform(0.0, self.arena_height_m)
            player.heading_rad = self._rng.uniform(-math.pi, math.pi)
            player.vx_mps = math.cos(player.heading_rad) * self.speed_mps
            player.vy_mps = math.sin(player.heading_rad) * self.speed_mps
            player.trail.clear()
            player.trail.append((player.x_m, player.y_m))

    def reset(self) -> None:
        existing_ids = list(self._players.keys())
        self._players.clear()
        for player_id in existing_ids:
            self.ensure_player(player_id)

    def set_paused(self, paused: bool) -> None:
        self.paused = paused

    def set_speed(self, speed_mps: float) -> None:
        self.speed_mps = max(0.0, speed_mps)

    def step(self, dt_s: float) -> None:
        if self.paused:
            return
        if dt_s <= 0.0:
            return

        for player in self._players.values():
            self._step_player(player, dt_s)

    def _step_player(self, player: SimPlayer, dt_s: float) -> None:
        heading_noise = self._rng.gauss(0.0, self.steering_noise) * math.sqrt(dt_s)
        player.heading_rad = self._wrap_pi(player.heading_rad + heading_noise)

        target_vx = math.cos(player.heading_rad) * self.speed_mps
        target_vy = math.sin(player.heading_rad) * self.speed_mps

        alpha = min(1.0, 2.5 * dt_s)
        player.vx_mps += (target_vx - player.vx_mps) * alpha
        player.vy_mps += (target_vy - player.vy_mps) * alpha

        player.x_m += player.vx_mps * dt_s
        player.y_m += player.vy_mps * dt_s

        if self.boundary_behavior == "wrap":
            player.x_m %= self.arena_width_m
            player.y_m %= self.arena_height_m
        else:
            self._bounce(player)

        player.trail.append((player.x_m, player.y_m))

    def _bounce(self, player: SimPlayer) -> None:
        if player.x_m < 0.0:
            player.x_m = 0.0
            player.vx_mps = abs(player.vx_mps)
        elif player.x_m > self.arena_width_m:
            player.x_m = self.arena_width_m
            player.vx_mps = -abs(player.vx_mps)

        if player.y_m < 0.0:
            player.y_m = 0.0
            player.vy_mps = abs(player.vy_mps)
        elif player.y_m > self.arena_height_m:
            player.y_m = self.arena_height_m
            player.vy_mps = -abs(player.vy_mps)

        player.heading_rad = math.atan2(player.vy_mps, player.vx_mps)

    @staticmethod
    def _wrap_pi(angle: float) -> float:
        while angle > math.pi:
            angle -= 2.0 * math.pi
        while angle < -math.pi:
            angle += 2.0 * math.pi
        return angle
