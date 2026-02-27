import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_ARENA = { minX: 0, maxX: 100, minY: 0, maxY: 60 };
const PLAYER_NAMES = ["Alpha-1", "Bravo-2", "Charlie-3", "Delta-4", "Echo-5", "Foxtrot-6"];
const MAX_EVENTS = 300;

function playerName(playerId) {
  const idx = playerId - 1;
  if (idx >= 0 && idx < PLAYER_NAMES.length) {
    return PLAYER_NAMES[idx];
  }
  return `Player-${playerId}`;
}

function normalizeQuality(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value > 1) {
    return Math.max(0, Math.min(1, value / 100));
  }
  return Math.max(0, Math.min(1, value));
}

function safeNumber(raw, fallback = 0) {
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function normalizePlayer(raw, nowMs) {
  const playerId = safeNumber(raw.player_id ?? raw.id, NaN);
  if (!Number.isFinite(playerId)) {
    return null;
  }

  const lastSeenMsAgo = raw.last_seen_ms_ago == null ? null : safeNumber(raw.last_seen_ms_ago, 0);
  const lastSeenMs =
    raw.last_seen_ms != null
      ? safeNumber(raw.last_seen_ms, nowMs)
      : lastSeenMsAgo != null
        ? Math.max(0, nowMs - lastSeenMsAgo)
        : nowMs;

  const batteryV =
    raw.battery_v != null
      ? safeNumber(raw.battery_v, 0)
      : raw.battery_mv != null
        ? safeNumber(raw.battery_mv, 0) / 1000
        : 0;

  const drops = {};
  if (typeof raw.drops === "object" && raw.drops != null) {
    for (const [key, value] of Object.entries(raw.drops)) {
      drops[key] = safeNumber(value, 0);
    }
  }
  if (raw.seq_drop_count != null) {
    drops.bad_crc = safeNumber(raw.seq_drop_count, 0);
  }
  if (drops.rate_limited == null) {
    drops.rate_limited = 0;
  }

  const connected = Boolean(raw.connected ?? raw.online ?? true);
  const alertActive = Boolean(raw.alert_state?.active ?? raw.alert);

  return {
    player_id: Math.round(playerId),
    name: raw.name || playerName(Math.round(playerId)),
    x: safeNumber(raw.x ?? raw.x_m, 0),
    y: safeNumber(raw.y ?? raw.y_m, 0),
    z: safeNumber(raw.z, 0),
    yaw_deg: safeNumber(raw.yaw_deg, 0),
    battery_v: Number.isFinite(batteryV) ? Number(batteryV.toFixed(2)) : 0,
    quality: normalizeQuality(raw.quality),
    packet_rate_hz: safeNumber(raw.packet_rate_hz, 0),
    last_seen_ms: lastSeenMs,
    drops,
    alert_state: raw.alert_state
      ? {
          active: Boolean(raw.alert_state.active),
          level: raw.alert_state.level || "caution",
          reason: raw.alert_state.reason || "direction",
        }
      : {
          active: alertActive,
          level: alertActive ? "warning" : "none",
          reason: alertActive ? "direction" : "",
        },
    connected,
  };
}

function normalizeEvent(raw, nowMs) {
  return {
    ts_ms: safeNumber(raw.ts_ms, nowMs),
    level: raw.level || "info",
    event: raw.event || "event",
    player_id: raw.player_id != null ? safeNumber(raw.player_id, 0) : undefined,
    reason: raw.reason,
    details: raw.details,
  };
}

function pushEvent(list, eventItem) {
  const key = `${eventItem.ts_ms}-${eventItem.level}-${eventItem.event}-${eventItem.player_id ?? "-"}-${eventItem.reason ?? ""}`;
  const exists = list.some(
    (item) => `${item.ts_ms}-${item.level}-${item.event}-${item.player_id ?? "-"}-${item.reason ?? ""}` === key,
  );
  if (exists) {
    return list;
  }
  return [eventItem, ...list].slice(0, MAX_EVENTS);
}

function mergeEvents(current, incoming, nowMs) {
  let next = current;
  for (const eventRaw of incoming) {
    next = pushEvent(next, normalizeEvent(eventRaw, nowMs));
  }
  return next;
}

function toTrailsMap(playersRaw) {
  const trails = {};
  for (const raw of playersRaw) {
    const playerId = safeNumber(raw.player_id ?? raw.id, NaN);
    if (!Number.isFinite(playerId)) {
      continue;
    }
    const rawTrail = Array.isArray(raw.trail) ? raw.trail : [];
    trails[Math.round(playerId)] = rawTrail
      .filter((point) => Array.isArray(point) && point.length >= 2)
      .map((point) => ({
        x: safeNumber(point[0], 0),
        y: safeNumber(point[1], 0),
      }));
  }
  return trails;
}

function normalizeWorld(payload) {
  if (!payload || payload.type !== "world_state") {
    return null;
  }

  const nowMs = safeNumber(payload.server_time_ms ?? payload.ts_ms, Date.now());
  const playersRaw = Array.isArray(payload.players) ? payload.players : [];
  const players = playersRaw
    .map((raw) => normalizePlayer(raw, nowMs))
    .filter(Boolean)
    .sort((a, b) => a.player_id - b.player_id);

  const obstacles = Array.isArray(payload.obstacles) ? payload.obstacles : [];
  const events = Array.isArray(payload.events) ? payload.events : [];

  const width = safeNumber(payload.arena?.width_m ?? payload.config?.arena_width_m, DEFAULT_ARENA.maxX);
  const height = safeNumber(payload.arena?.height_m ?? payload.config?.arena_height_m, DEFAULT_ARENA.maxY);

  return {
    nowMs,
    players,
    obstacles,
    events,
    recording: {
      active: Boolean(payload.recording?.active),
      session_id: payload.recording?.session_id ?? null,
      start_ts_ms: payload.recording?.start_ts_ms ?? null,
      output_dir: payload.recording?.output_dir ?? null,
    },
    trails: toTrailsMap(playersRaw),
    arena: {
      minX: 0,
      maxX: Math.max(10, width),
      minY: 0,
      maxY: Math.max(10, height),
    },
    serverVersion: payload.server_version || null,
  };
}

async function fetchJson(url, init) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }
  return response.json();
}

export default function useMockData() {
  const [players, setPlayers] = useState([]);
  const [obstacles, setObstacles] = useState([]);
  const [events, setEvents] = useState([]);
  const [recording, setRecording] = useState({
    active: false,
    session_id: null,
    start_ts_ms: null,
    output_dir: null,
  });
  const [systemStatus, setSystemStatus] = useState("Degraded");
  const [wsConnected, setWsConnected] = useState(false);
  const [trails, setTrails] = useState({});
  const [arena, setArena] = useState(DEFAULT_ARENA);
  const [serverVersion, setServerVersion] = useState("unknown");

  const wsRef = useRef(null);
  const retryTimerRef = useRef(null);
  const retryCountRef = useRef(0);
  const unmountedRef = useRef(false);

  const addLocalEvent = useCallback((evt) => {
    setEvents((prev) =>
      pushEvent(prev, {
        ts_ms: Date.now(),
        level: evt.level || "info",
        event: evt.event || "local_event",
        details: evt.details,
        player_id: evt.player_id,
        reason: evt.reason,
      }),
    );
  }, []);

  const applyWorld = useCallback((payload) => {
    const normalized = normalizeWorld(payload);
    if (normalized == null) {
      return;
    }

    setPlayers(normalized.players);
    setObstacles(normalized.obstacles);
    setRecording(normalized.recording);
    setTrails(normalized.trails);
    setArena(normalized.arena);
    setEvents((prev) => mergeEvents(prev, normalized.events, normalized.nowMs));
    if (normalized.serverVersion != null) {
      setServerVersion(normalized.serverVersion);
    }
  }, []);

  useEffect(() => {
    unmountedRef.current = false;

    const connect = () => {
      if (unmountedRef.current) {
        return;
      }

      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const url = `${protocol}://${window.location.host}/ws`;
      const socket = new WebSocket(url);
      wsRef.current = socket;
      setWsConnected(false);
      setSystemStatus("Degraded");

      socket.onopen = () => {
        retryCountRef.current = 0;
        setWsConnected(true);
        setSystemStatus("OK");
        addLocalEvent({ level: "info", event: "ws_connected", details: "WebSocket connected" });
      };

      socket.onmessage = (message) => {
        try {
          const payload = JSON.parse(message.data);
          if (payload?.type === "world_state") {
            applyWorld(payload);
          }
        } catch {
          addLocalEvent({ level: "warn", event: "ws_payload_invalid", details: "Invalid WS JSON payload" });
        }
      };

      socket.onerror = () => {
        addLocalEvent({ level: "error", event: "ws_error", details: "WebSocket transport error" });
      };

      socket.onclose = () => {
        wsRef.current = null;
        if (unmountedRef.current) {
          return;
        }
        setWsConnected(false);
        setSystemStatus("Offline");
        addLocalEvent({ level: "warn", event: "ws_reconnecting", details: "WebSocket reconnecting" });

        const backoff = Math.min(10000, 500 * 2 ** retryCountRef.current) + Math.floor(Math.random() * 200);
        retryCountRef.current += 1;
        retryTimerRef.current = window.setTimeout(connect, backoff);
      };
    };

    connect();

    return () => {
      unmountedRef.current = true;
      if (retryTimerRef.current != null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [addLocalEvent, applyWorld]);

  useEffect(() => {
    const poll = () => {
      void fetchJson("/api/health")
        .then((payload) => {
          if (payload?.version) {
            setServerVersion(payload.version);
          }
        })
        .catch(() => {
          // ignore poll errors; WS status is source of truth for console health
        });
    };
    poll();
    const timer = window.setInterval(poll, 5000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const payload = await fetchJson("/api/recording/start", { method: "POST" });
      if (payload?.recording) {
        setRecording(payload.recording);
      }
      addLocalEvent({ level: "info", event: "recording_start", details: payload?.recording?.session_id || "" });
      return payload;
    } catch (error) {
      addLocalEvent({
        level: "error",
        event: "recording_start_failed",
        details: error instanceof Error ? error.message : "Unknown error",
      });
      return null;
    }
  }, [addLocalEvent]);

  const stopRecording = useCallback(async () => {
    try {
      const payload = await fetchJson("/api/recording/stop", { method: "POST" });
      if (payload?.recording) {
        setRecording(payload.recording);
      }
      addLocalEvent({ level: "info", event: "recording_stop", details: payload?.session_id || "" });
      return payload;
    } catch (error) {
      addLocalEvent({
        level: "error",
        event: "recording_stop_failed",
        details: error instanceof Error ? error.message : "Unknown error",
      });
      return null;
    }
  }, [addLocalEvent]);

  const data = useMemo(
    () => ({
      players,
      obstacles,
      events,
      recording,
      systemStatus,
      wsConnected,
      trails,
      arena,
      serverVersion,
      startRecording,
      stopRecording,
    }),
    [
      players,
      obstacles,
      events,
      recording,
      systemStatus,
      wsConnected,
      trails,
      arena,
      serverVersion,
      startRecording,
      stopRecording,
    ],
  );

  return data;
}
