from __future__ import annotations

import argparse
import csv
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Compute hard-iron offsets from magnetometer samples")
    parser.add_argument(
        "samples_csv",
        type=Path,
        help="CSV with columns mx,my,mz in uT or raw units",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    rows: list[tuple[float, float, float]] = []

    with args.samples_csv.open("r", encoding="ascii") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                mx = float(row["mx"])
                my = float(row["my"])
                mz = float(row["mz"])
            except (KeyError, ValueError) as exc:
                raise ValueError("CSV must contain numeric mx,my,mz columns") from exc
            rows.append((mx, my, mz))

    if len(rows) < 20:
        raise ValueError("Need at least 20 samples for a meaningful estimate")

    mx_vals = [r[0] for r in rows]
    my_vals = [r[1] for r in rows]
    mz_vals = [r[2] for r in rows]

    ox = 0.5 * (min(mx_vals) + max(mx_vals))
    oy = 0.5 * (min(my_vals) + max(my_vals))
    oz = 0.5 * (min(mz_vals) + max(mz_vals))

    print("Hard-iron offset estimate")
    print(f"mx_offset={ox:.6f}")
    print(f"my_offset={oy:.6f}")
    print(f"mz_offset={oz:.6f}")
    print("Apply offsets as corrected = measured - offset")


if __name__ == "__main__":
    main()
