import type { PlayerState } from "../types";

export type ConnectionBadge = "online" | "degraded" | "offline";

export function connectionState(player: PlayerState, nowMs: number): ConnectionBadge {
  if (player.last_seen_ms == null) {
    return "offline";
  }
  const ageMs = Math.max(0, nowMs - player.last_seen_ms);
  if (ageMs < 2200) {
    return "online";
  }
  if (ageMs < 6000) {
    return "degraded";
  }
  return "offline";
}

export function lastSeenSeconds(player: PlayerState, nowMs: number): number | null {
  if (player.last_seen_ms == null) {
    return null;
  }
  return Math.max(0, (nowMs - player.last_seen_ms) / 1000);
}

export function qualityPct(player: PlayerState): number {
  const quality = player.quality ?? 0;
  if (quality > 1) {
    return Math.max(0, Math.min(100, quality));
  }
  return Math.max(0, Math.min(100, quality * 100));
}

export function batteryLabel(player: PlayerState): string {
  if (player.battery_v == null) {
    return "-";
  }
  return `${player.battery_v.toFixed(2)}V`;
}

export function packetRateLabel(player: PlayerState): string {
  if (player.packet_rate_hz == null) {
    return "-";
  }
  return `${player.packet_rate_hz.toFixed(1)} Hz`;
}
