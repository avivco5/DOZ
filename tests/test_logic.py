from __future__ import annotations

import math

from server.logic import evaluate_targets, wrap_angle_deg, wrap_angle_rad


def test_wrap_angle_rad() -> None:
    assert wrap_angle_rad(3.5) < math.pi
    assert wrap_angle_rad(-3.5) > -math.pi


def test_wrap_angle_deg() -> None:
    assert wrap_angle_deg(190.0) == -170.0
    assert wrap_angle_deg(-190.0) == 170.0


def test_cone_hit_and_miss() -> None:
    src = (0.0, 0.0)
    yaw_deg = 0.0
    targets = [(5.0, 0.0), (4.0, 4.0)]

    result = evaluate_targets(
        src_pos=src,
        src_yaw_deg=yaw_deg,
        target_positions=targets,
        max_range_m=15.0,
        cone_half_angle_deg=6.0,
    )

    assert result.inside_on is True
    assert result.inside_off is True
    assert result.best_intensity > 0


def test_cone_miss_out_of_angle() -> None:
    src = (0.0, 0.0)
    yaw_deg = 0.0
    targets = [(0.0, 5.0)]

    result = evaluate_targets(
        src_pos=src,
        src_yaw_deg=yaw_deg,
        target_positions=targets,
        max_range_m=15.0,
        cone_half_angle_deg=6.0,
    )

    assert result.inside_on is False
