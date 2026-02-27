import { describe, expect, it } from "vitest";
import { detectExposure } from "../exposure";

describe("detectExposure", () => {
  it("marks exposure when another player is inside wedge", () => {
    const result = detectExposure(
      [
        { player_id: 1, x: 0, y: 0, yaw_deg: 0 },
        { player_id: 2, x: 4, y: 0.3, yaw_deg: 180 },
      ],
      { fovDeg: 60, rangeMeters: 6 },
    );

    expect(result.bySource.get(1)).toContain(2);
    expect(result.pairs.length).toBe(1);
    expect(result.pairs[0].sourcePlayerId).toBe(1);
    expect(result.pairs[0].exposedPlayerId).toBe(2);
  });

  it("does not mark exposure outside range", () => {
    const result = detectExposure(
      [
        { player_id: 1, x: 0, y: 0, yaw_deg: 0 },
        { player_id: 2, x: 50, y: 0, yaw_deg: 180 },
      ],
      { fovDeg: 60, rangeMeters: 8 },
    );

    expect(result.bySource.get(1)).toEqual([]);
    expect(result.pairs.length).toBe(0);
  });

  it("does not mark exposure outside angle", () => {
    const result = detectExposure(
      [
        { player_id: 1, x: 0, y: 0, yaw_deg: 0 },
        { player_id: 2, x: 0, y: 4, yaw_deg: 180 },
      ],
      { fovDeg: 40, rangeMeters: 10 },
    );

    expect(result.bySource.get(1)).toEqual([]);
    expect(result.pairs.length).toBe(0);
  });
});
