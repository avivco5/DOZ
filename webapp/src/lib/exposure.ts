import type { PlayerState } from "../types";

export interface ExposureConfig {
  fovDeg: number;
  rangeMeters: number;
}

export interface ExposurePair {
  sourcePlayerId: number;
  exposedPlayerId: number;
  distance: number;
  bearingDeg: number;
}

export interface ExposureResult {
  bySource: Map<number, number[]>;
  pairs: ExposurePair[];
}

function degToRad(value: number): number {
  return (value * Math.PI) / 180;
}

function angleDiffRad(a: number, b: number): number {
  let delta = a - b;
  while (delta > Math.PI) {
    delta -= Math.PI * 2;
  }
  while (delta < -Math.PI) {
    delta += Math.PI * 2;
  }
  return delta;
}

export function detectExposure(players: PlayerState[], config: ExposureConfig): ExposureResult {
  const pairs: ExposurePair[] = [];
  const bySource = new Map<number, number[]>();

  const fovHalfRad = degToRad(config.fovDeg) / 2;
  const maxRange = Math.max(0, config.rangeMeters);

  for (const source of players) {
    const sourceTargets: number[] = [];
    const sourceYawRad = degToRad(source.yaw_deg);

    for (const target of players) {
      if (target.player_id === source.player_id) {
        continue;
      }

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 0 || distance > maxRange) {
        continue;
      }

      const absoluteBearing = Math.atan2(dy, dx);
      const delta = Math.abs(angleDiffRad(absoluteBearing, sourceYawRad));
      if (delta > fovHalfRad) {
        continue;
      }

      sourceTargets.push(target.player_id);
      pairs.push({
        sourcePlayerId: source.player_id,
        exposedPlayerId: target.player_id,
        distance,
        bearingDeg: (absoluteBearing * 180) / Math.PI,
      });
    }

    bySource.set(source.player_id, sourceTargets);
  }

  return {
    bySource,
    pairs,
  };
}
