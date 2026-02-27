import type { EventItem, Obstacle, PlayerState, WorldStateMessage } from "../types";

interface MockPlayer extends PlayerState {
  vx: number;
  vy: number;
}

const ARENA_WIDTH = 50;
const ARENA_HEIGHT = 30;

const MOCK_OBSTACLES: Obstacle[] = [
  { id: "obs-1", x: 8, y: 11, w: 4, h: 3, type: "barrier" },
  { id: "obs-2", x: 20, y: 20, w: 5, h: 2, type: "barrier" },
  { id: "obs-3", x: 33, y: 9, w: 3, h: 3, type: "tower" },
  { id: "obs-4", x: 40, y: 22, w: 4, h: 4, type: "tent" },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createPlayers(nowMs: number): MockPlayer[] {
  return [
    {
      player_id: 1,
      name: "Alpha-1",
      x: 10,
      y: 7,
      yaw_deg: 20,
      battery_v: 3.91,
      quality: 0.95,
      packet_rate_hz: 10,
      last_seen_ms: nowMs,
      drops: { crc: 0, rate_limited: 0 },
      alert_state: { active: false, level: "none", reason: "" },
      vx: 0.09,
      vy: 0.06,
    },
    {
      player_id: 2,
      name: "Bravo-2",
      x: 16,
      y: 14,
      yaw_deg: 210,
      battery_v: 3.84,
      quality: 0.89,
      packet_rate_hz: 10,
      last_seen_ms: nowMs,
      drops: { crc: 1, rate_limited: 0 },
      alert_state: { active: false, level: "none", reason: "" },
      vx: -0.06,
      vy: 0.07,
    },
    {
      player_id: 3,
      name: "Charlie-3",
      x: 24,
      y: 10,
      yaw_deg: 345,
      battery_v: 3.73,
      quality: 0.82,
      packet_rate_hz: 10,
      last_seen_ms: nowMs,
      drops: { crc: 2, rate_limited: 1 },
      alert_state: { active: false, level: "none", reason: "" },
      vx: 0.08,
      vy: 0.05,
    },
    {
      player_id: 4,
      name: "Delta-4",
      x: 38,
      y: 17,
      yaw_deg: 145,
      battery_v: 3.62,
      quality: 0.78,
      packet_rate_hz: 10,
      last_seen_ms: nowMs,
      drops: { crc: 4, rate_limited: 3 },
      alert_state: { active: false, level: "none", reason: "" },
      vx: -0.05,
      vy: -0.08,
    },
  ];
}

export class MockWorldStream {
  private readonly players: MockPlayer[];
  private events: EventItem[] = [];
  private recording = {
    active: false,
    session_id: null,
    start_ts_ms: null,
    output_dir: null,
  };

  constructor(private readonly startMs = Date.now()) {
    this.players = createPlayers(startMs);
  }

  addPlayer(nowMs: number): number | null {
    const used = new Set(this.players.map((player) => player.player_id));
    let nextId: number | null = null;
    for (let candidate = 1; candidate <= 255; candidate += 1) {
      if (!used.has(candidate)) {
        nextId = candidate;
        break;
      }
    }
    if (nextId == null) {
      return null;
    }

    this.players.push({
      player_id: nextId,
      name: `Player-${nextId}`,
      x: 4 + Math.random() * (ARENA_WIDTH - 8),
      y: 4 + Math.random() * (ARENA_HEIGHT - 8),
      yaw_deg: Math.random() * 360,
      battery_v: 3.9,
      quality: 0.85,
      packet_rate_hz: 10,
      last_seen_ms: nowMs,
      drops: { crc: 0, rate_limited: 0 },
      alert_state: { active: false, level: "none", reason: "" },
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
    });
    this.pushEvent({
      ts_ms: nowMs,
      level: "info",
      event: "player_added",
      player_id: nextId,
      details: "mock",
    });
    return nextId;
  }

  removePlayer(nowMs: number): number | null {
    if (this.players.length <= 1) {
      return null;
    }
    const sorted = [...this.players].sort((a, b) => b.player_id - a.player_id);
    const target = sorted[0];
    if (target == null) {
      return null;
    }
    const index = this.players.findIndex((player) => player.player_id === target.player_id);
    if (index < 0) {
      return null;
    }
    this.players.splice(index, 1);
    this.pushEvent({
      ts_ms: nowMs,
      level: "warn",
      event: "player_removed",
      player_id: target.player_id,
      details: "mock",
    });
    return target.player_id;
  }

  setRecording(active: boolean): void {
    if (active && !this.recording.active) {
      const sessionId = `REC-MOCK-${Date.now()}`;
      this.recording = {
        active: true,
        session_id: sessionId,
        start_ts_ms: Date.now(),
        output_dir: `/tmp/aar/${sessionId}`,
      };
      this.pushEvent({
        ts_ms: Date.now(),
        level: "info",
        event: "recording_start",
        details: sessionId,
      });
    }

    if (!active && this.recording.active) {
      this.pushEvent({
        ts_ms: Date.now(),
        level: "info",
        event: "recording_stop",
        details: this.recording.session_id ?? "",
      });
      this.recording = {
        active: false,
        session_id: null,
        start_ts_ms: null,
        output_dir: null,
      };
    }
  }

  tick(nowMs: number): WorldStateMessage {
    for (const player of this.players) {
      player.x += player.vx;
      player.y += player.vy;

      if (player.x < 1 || player.x > ARENA_WIDTH - 1) {
        player.vx *= -1;
      }
      if (player.y < 1 || player.y > ARENA_HEIGHT - 1) {
        player.vy *= -1;
      }

      player.x = clamp(player.x, 1, ARENA_WIDTH - 1);
      player.y = clamp(player.y, 1, ARENA_HEIGHT - 1);

      player.yaw_deg = (player.yaw_deg + 1.2 + Math.random() * 2.5) % 360;
      player.quality = clamp((player.quality ?? 0.8) + (Math.random() - 0.5) * 0.03, 0.55, 0.99);
      player.battery_v = clamp((player.battery_v ?? 3.8) - 0.00007, 3.2, 4.2);
      player.packet_rate_hz = 9.8 + Math.random() * 0.8;
      player.last_seen_ms = nowMs;

      const crc = player.drops?.crc ?? 0;
      const rl = player.drops?.rate_limited ?? 0;
      if (Math.random() > 0.995) {
        player.drops = {
          crc: crc + 1,
          rate_limited: rl,
        };
      }
      if (Math.random() > 0.997) {
        player.drops = {
          crc,
          rate_limited: rl + 1,
        };
      }
    }

    if (Math.random() > 0.98) {
      const randomPlayer = this.players[Math.floor(Math.random() * this.players.length)];
      if (randomPlayer != null) {
        const active = randomPlayer.alert_state?.active ?? false;
        randomPlayer.alert_state = {
          active: !active,
          level: !active ? "caution" : "none",
          reason: !active ? "direction" : "",
        };
        this.pushEvent({
          ts_ms: nowMs,
          level: !active ? "warn" : "info",
          event: !active ? "alert_on" : "alert_off",
          player_id: randomPlayer.player_id,
          reason: "direction",
        });
      }
    }

    return {
      type: "world_state",
      schema_version: 1,
      server_time_ms: nowMs,
      server_version: "mock",
      players: this.players.map((player) => ({
        player_id: player.player_id,
        name: player.name,
        x: player.x,
        y: player.y,
        yaw_deg: player.yaw_deg,
        battery_v: player.battery_v,
        quality: player.quality,
        packet_rate_hz: player.packet_rate_hz,
        last_seen_ms: player.last_seen_ms,
        drops: player.drops,
        alert_state: player.alert_state,
      })),
      obstacles: MOCK_OBSTACLES,
      events: [...this.events],
      recording: { ...this.recording },
    };
  }

  private pushEvent(eventItem: EventItem): void {
    this.events.unshift(eventItem);
    if (this.events.length > 160) {
      this.events.length = 160;
    }
  }
}
