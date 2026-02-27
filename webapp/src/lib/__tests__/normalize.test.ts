import { describe, expect, it } from "vitest";
import { normalizeWorldState } from "../normalize";

describe("normalizeWorldState", () => {
  it("normalizes backend payload into typed world state", () => {
    const result = normalizeWorldState({
      type: "world_state",
      ts_ms: 12000,
      players: [
        {
          id: 3,
          x_m: 10.5,
          y_m: 4.2,
          yaw_deg: 250,
          quality: 84,
          battery_mv: 3720,
          packet_rate_hz: 9.8,
          last_seen_ms_ago: 120,
          alert: true,
          alert_intensity: 77,
          seq_drop_count: 6,
        },
      ],
    });

    expect(result.ok).toBe(true);
    const world = result.data;
    expect(world).toBeDefined();
    expect(world?.schema_version).toBe(1);
    expect(world?.players.length).toBe(1);

    const player = world?.players[0];
    expect(player?.player_id).toBe(3);
    expect(player?.x).toBeCloseTo(10.5);
    expect(player?.y).toBeCloseTo(4.2);
    expect(player?.quality).toBeCloseTo(0.84);
    expect(player?.battery_v).toBeCloseTo(3.72);
    expect(player?.drops?.seq).toBe(6);
    expect(player?.alert_state?.active).toBe(true);
    expect(player?.last_seen_ms).toBe(11880);
  });

  it("returns degraded result for malformed message", () => {
    const result = normalizeWorldState("bad payload");
    expect(result.ok).toBe(false);
    expect(result.warning).toContain("not an object");
  });
});
