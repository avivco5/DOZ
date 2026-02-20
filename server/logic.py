from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Iterable


@dataclass(slots=True)
class TargetEval:
    inside_on: bool
    inside_off: bool
    best_intensity: int


def wrap_angle_rad(angle_rad: float) -> float:
    while angle_rad > math.pi:
        angle_rad -= 2.0 * math.pi
    while angle_rad < -math.pi:
        angle_rad += 2.0 * math.pi
    return angle_rad


def wrap_angle_deg(angle_deg: float) -> float:
    while angle_deg > 180.0:
        angle_deg -= 360.0
    while angle_deg < -180.0:
        angle_deg += 360.0
    return angle_deg


def _intensity(distance_m: float, dyaw_rad: float, max_range_m: float, cone_half_rad: float) -> int:
    range_term = max(0.0, min(1.0, 1.0 - (distance_m / max_range_m)))
    angle_term = max(0.0, min(1.0, 1.0 - (abs(dyaw_rad) / cone_half_rad)))
    score = 0.55 * range_term + 0.45 * angle_term
    return int(40 + 215 * score)


def evaluate_targets(
    src_pos: tuple[float, float],
    src_yaw_deg: float,
    target_positions: Iterable[tuple[float, float]],
    max_range_m: float,
    cone_half_angle_deg: float,
) -> TargetEval:
    sx, sy = src_pos
    src_yaw_rad = math.radians(src_yaw_deg)
    cone_half_rad = math.radians(cone_half_angle_deg)
    cone_off_rad = cone_half_rad * 1.2
    range_off_m = max_range_m * 1.2

    inside_on = False
    inside_off = False
    best_intensity = 0

    for tx, ty in target_positions:
        vx = tx - sx
        vy = ty - sy
        d = math.hypot(vx, vy)
        if d < 1e-6:
            continue
        bearing = math.atan2(vy, vx)
        dyaw = wrap_angle_rad(src_yaw_rad - bearing)

        if d < range_off_m and abs(dyaw) < cone_off_rad:
            inside_off = True

        if d < max_range_m and abs(dyaw) < cone_half_rad:
            inside_on = True
            best_intensity = max(best_intensity, _intensity(d, dyaw, max_range_m, cone_half_rad))

    return TargetEval(inside_on=inside_on, inside_off=inside_off, best_intensity=best_intensity)
