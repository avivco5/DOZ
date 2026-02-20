from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass
class CoordinatorConfig:
    arena_width_m: float = 50.0
    arena_height_m: float = 30.0

    tick_hz: float = 20.0
    ws_hz: float = 10.0
    world_update_hz: float = 10.0

    max_range_m: float = 15.0
    cone_half_angle_deg: float = 6.0
    quality_threshold: int = 35
    pos_quality_threshold: int = 50
    offline_timeout_ms: int = 2000

    alert_hold_ms: int = 250

    use_sim_positions: bool = True
    sim_speed_mps: float = 0.4
    boundary_behavior: str = "bounce"
    sim_noise: float = 0.35
    sim_paused: bool = False

    default_player_ids: tuple[int, ...] = (1, 2)
    trail_seconds: float = 8.0

    def to_dict(self) -> dict:
        return asdict(self)

    def apply_updates(self, updates: dict) -> None:
        if "max_range_m" in updates:
            self.max_range_m = max(1.0, min(float(updates["max_range_m"]), 200.0))
        if "cone_half_angle_deg" in updates:
            self.cone_half_angle_deg = max(1.0, min(float(updates["cone_half_angle_deg"]), 90.0))
        if "quality_threshold" in updates:
            self.quality_threshold = max(0, min(int(updates["quality_threshold"]), 100))
        if "sim_speed_mps" in updates:
            self.sim_speed_mps = max(0.0, min(float(updates["sim_speed_mps"]), 5.0))
        if "use_sim_positions" in updates:
            self.use_sim_positions = bool(updates["use_sim_positions"])
        if "arena_width_m" in updates:
            self.arena_width_m = max(5.0, min(float(updates["arena_width_m"]), 1000.0))
        if "arena_height_m" in updates:
            self.arena_height_m = max(5.0, min(float(updates["arena_height_m"]), 1000.0))
        if "sim_paused" in updates:
            self.sim_paused = bool(updates["sim_paused"])
