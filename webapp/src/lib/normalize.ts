import type { EventItem, EventLevel, ParseResult, PlayerState, RecordingState, WorldStateMessage } from "../types";
import { asBoolean, asNumber, asOptionalNumber, asString, clamp, isRecord } from "./guards";

const LEVELS: EventLevel[] = ["debug", "info", "warn", "error", "critical"];

function toQuality(raw: unknown): number | undefined {
  const value = asOptionalNumber(raw);
  if (value == null) {
    return undefined;
  }
  if (value > 1.0) {
    return clamp(value / 100.0, 0, 1);
  }
  return clamp(value, 0, 1);
}

function normalizeRecording(input: unknown): RecordingState {
  if (!isRecord(input)) {
    return {
      active: false,
      session_id: null,
      start_ts_ms: null,
      output_dir: null,
    };
  }
  return {
    active: asBoolean(input.active, false),
    session_id: typeof input.session_id === "string" ? input.session_id : null,
    start_ts_ms: input.start_ts_ms == null ? null : asNumber(input.start_ts_ms, 0),
    output_dir: typeof input.output_dir === "string" ? input.output_dir : null,
  };
}

function normalizePlayer(raw: unknown, serverTimeMs: number): PlayerState | null {
  if (!isRecord(raw)) {
    return null;
  }

  const playerId = asNumber(raw.player_id ?? raw.id, NaN);
  if (!Number.isFinite(playerId)) {
    return null;
  }

  const x = asNumber(raw.x ?? raw.x_m, 0);
  const y = asNumber(raw.y ?? raw.y_m, 0);
  const z = asOptionalNumber(raw.z);

  const yaw = asNumber(raw.yaw_deg, 0);
  const quality = toQuality(raw.quality);

  const lastSeenMsAgo = asOptionalNumber(raw.last_seen_ms_ago);
  const lastSeenMs =
    asOptionalNumber(raw.last_seen_ms) ??
    (lastSeenMsAgo != null ? Math.max(0, serverTimeMs - lastSeenMsAgo) : undefined);

  const batteryV =
    asOptionalNumber(raw.battery_v) ??
    (() => {
      const mv = asOptionalNumber(raw.battery_mv);
      if (mv == null) {
        return undefined;
      }
      return mv / 1000.0;
    })();

  const dropsRaw = raw.drops;
  const drops: Record<string, number> = {};
  if (isRecord(dropsRaw)) {
    for (const [key, value] of Object.entries(dropsRaw)) {
      const num = asOptionalNumber(value);
      if (num != null) {
        drops[key] = num;
      }
    }
  }
  const seqDrops = asOptionalNumber(raw.seq_drop_count);
  if (seqDrops != null && seqDrops > 0) {
    drops.seq = seqDrops;
  }

  const alertState = (() => {
    if (isRecord(raw.alert_state)) {
      return {
        active: asBoolean(raw.alert_state.active, false),
        level: asString(raw.alert_state.level, "info"),
        reason: asString(raw.alert_state.reason, ""),
      };
    }

    const active = asBoolean(raw.alert, false);
    return {
      active,
      level: active ? "caution" : "none",
      reason: active ? "direction" : "",
    };
  })();

  return {
    player_id: Math.round(playerId),
    name: raw.name == null ? `P${Math.round(playerId)}` : asString(raw.name, `P${Math.round(playerId)}`),
    x,
    y,
    z,
    yaw_deg: yaw,
    battery_v: batteryV,
    quality,
    packet_rate_hz: asOptionalNumber(raw.packet_rate_hz),
    last_seen_ms: lastSeenMs,
    drops: Object.keys(drops).length > 0 ? drops : undefined,
    alert_state: alertState,
    pitch_deg: asOptionalNumber(raw.pitch_deg),
    roll_deg: asOptionalNumber(raw.roll_deg),
    pos_source: raw.pos_source == null ? undefined : asString(raw.pos_source, ""),
    gps_lat_deg: asOptionalNumber(raw.gps_lat_deg),
    gps_lon_deg: asOptionalNumber(raw.gps_lon_deg),
    gps_alt_m: asOptionalNumber(raw.gps_alt_m),
    gps_quality: asOptionalNumber(raw.gps_quality),
  };
}

function normalizeEvent(raw: unknown): EventItem | null {
  if (!isRecord(raw)) {
    return null;
  }
  const levelRaw = asString(raw.level, "info") as EventLevel;
  const level: EventLevel = LEVELS.includes(levelRaw) ? levelRaw : "info";

  return {
    ts_ms: asNumber(raw.ts_ms, Date.now()),
    level,
    event: asString(raw.event, "event"),
    player_id: asOptionalNumber(raw.player_id),
    reason: raw.reason == null ? undefined : asString(raw.reason, ""),
    details: raw.details,
  };
}

export function normalizeWorldState(raw: unknown): ParseResult {
  if (!isRecord(raw)) {
    return {
      ok: false,
      warning: "Message is not an object",
    };
  }

  if (raw.type !== "world_state") {
    return {
      ok: false,
      warning: "Unsupported message type",
    };
  }

  const serverTimeMs = asNumber(raw.server_time_ms ?? raw.ts_ms, Date.now());
  const playersRaw = Array.isArray(raw.players) ? raw.players : [];
  const obstaclesRaw = Array.isArray(raw.obstacles) ? raw.obstacles : [];
  const eventsRaw = Array.isArray(raw.events) ? raw.events : [];

  const players: PlayerState[] = [];
  for (const item of playersRaw) {
    const parsed = normalizePlayer(item, serverTimeMs);
    if (parsed != null) {
      players.push(parsed);
    }
  }

  const obstacles = obstaclesRaw
    .filter(isRecord)
    .map((obstacle, index) => ({
      id: asString(obstacle.id, `obs-${index}`),
      x: asNumber(obstacle.x, 0),
      y: asNumber(obstacle.y, 0),
      w: asNumber(obstacle.w, 1),
      h: asNumber(obstacle.h, 1),
      z: asOptionalNumber(obstacle.z),
      type: obstacle.type == null ? undefined : asString(obstacle.type, "box"),
    }));

  const events: EventItem[] = [];
  for (const item of eventsRaw) {
    const parsed = normalizeEvent(item);
    if (parsed != null) {
      events.push(parsed);
    }
  }

  const worldState: WorldStateMessage = {
    type: "world_state",
    schema_version: asNumber(raw.schema_version, 1),
    server_time_ms: serverTimeMs,
    server_version: raw.server_version == null ? undefined : asString(raw.server_version, ""),
    players,
    obstacles,
    events,
    recording: normalizeRecording(raw.recording),
  };

  return {
    ok: true,
    data: worldState,
  };
}
