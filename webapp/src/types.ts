export type EventLevel = "debug" | "info" | "warn" | "error" | "critical";

export interface AlertState {
  active: boolean;
  level: string;
  reason: string;
}

export interface PlayerState {
  player_id: number;
  name?: string;
  x: number;
  y: number;
  z?: number;
  yaw_deg: number;
  battery_v?: number;
  quality?: number;
  packet_rate_hz?: number;
  last_seen_ms?: number;
  drops?: Record<string, number>;
  alert_state?: AlertState;
  pitch_deg?: number;
  roll_deg?: number;
  pos_source?: string;
  gps_lat_deg?: number;
  gps_lon_deg?: number;
  gps_alt_m?: number;
  gps_quality?: number;
}

export interface Obstacle {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z?: number;
  type?: string;
}

export interface EventItem {
  ts_ms: number;
  level: EventLevel;
  event: string;
  player_id?: number;
  reason?: string;
  details?: unknown;
}

export interface RecordingState {
  active: boolean;
  session_id: string | null;
  start_ts_ms: number | null;
  output_dir?: string | null;
}

export interface WorldStateMessage {
  type: "world_state";
  schema_version: number;
  server_time_ms: number;
  server_version?: string;
  players: PlayerState[];
  obstacles: Obstacle[];
  events: EventItem[];
  recording: RecordingState;
}

export type WsConnectionState = "connected" | "disconnected" | "reconnecting";

export interface ParseResult {
  ok: boolean;
  data?: WorldStateMessage;
  warning?: string;
}
