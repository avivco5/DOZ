import { useEffect, useMemo, useRef, useState } from "react";
import { addSimPlayer, getHealth, getStatus, removeSimPlayer, startRecording, stopRecording } from "../lib/api";
import { MockWorldStream } from "../lib/mock";
import { normalizeWorldState } from "../lib/normalize";
import { ReconnectingWsClient } from "../lib/wsClient";
import type { EventItem, PlayerState, WorldStateMessage, WsConnectionState } from "../types";

const MAX_EVENT_LOG_ITEMS = 5000;
const FORCE_MOCK = import.meta.env.VITE_MOCK === "1";

const EMPTY_WORLD: WorldStateMessage = {
  type: "world_state",
  schema_version: 1,
  server_time_ms: Date.now(),
  players: [],
  obstacles: [],
  events: [],
  recording: {
    active: false,
    session_id: null,
    start_ts_ms: null,
    output_dir: null,
  },
};

function pushEvent(list: EventItem[], item: EventItem): EventItem[] {
  const key = `${item.ts_ms}-${item.level}-${item.event}-${item.player_id ?? "-"}-${item.reason ?? ""}`;
  if (
    list.some(
      (existing) =>
        `${existing.ts_ms}-${existing.level}-${existing.event}-${existing.player_id ?? "-"}-${existing.reason ?? ""}` === key,
    )
  ) {
    return list;
  }

  const next = [item, ...list];
  if (next.length > MAX_EVENT_LOG_ITEMS) {
    next.length = MAX_EVENT_LOG_ITEMS;
  }
  return next;
}

function mergeIncomingEvents(current: EventItem[], incoming: EventItem[]): EventItem[] {
  let out = current;
  for (const item of incoming) {
    out = pushEvent(out, item);
  }
  return out;
}

export interface ConsoleDataModel {
  world: WorldStateMessage;
  selectedPlayerId: number | null;
  selectedPlayer: PlayerState | null;
  setSelectedPlayerId: (playerId: number) => void;
  wsState: WsConnectionState;
  lastMessageTs: number;
  degradedWarning: string | null;
  systemStatus: "OK" | "Degraded" | "Offline";
  serverVersion: string;
  eventLog: EventItem[];
  isMockMode: boolean;
  toggleMockMode: () => void;
  recordingResult: { session_id?: string | null; files?: string[] } | null;
  startRecordingAction: () => Promise<void>;
  stopRecordingAction: () => Promise<void>;
  addSimPlayerAction: () => Promise<void>;
  removeSimPlayerAction: () => Promise<void>;
  healthStatus: string;
}

export function useConsoleData(): ConsoleDataModel {
  const wsRef = useRef<ReconnectingWsClient | null>(null);
  const mockRef = useRef<MockWorldStream | null>(null);
  const mockTimerRef = useRef<number | null>(null);

  const [world, setWorld] = useState<WorldStateMessage>(EMPTY_WORLD);
  const [eventLog, setEventLog] = useState<EventItem[]>([]);
  const [selectedPlayerId, setSelectedPlayerIdState] = useState<number | null>(null);
  const [wsState, setWsState] = useState<WsConnectionState>("disconnected");
  const [lastMessageTs, setLastMessageTs] = useState<number>(0);
  const [degradedWarning, setDegradedWarning] = useState<string | null>(null);
  const [serverVersion, setServerVersion] = useState<string>("unknown");
  const [healthStatus, setHealthStatus] = useState<string>("unknown");
  const [manualMockMode, setManualMockMode] = useState<boolean>(FORCE_MOCK);
  const [autoMockMode, setAutoMockMode] = useState<boolean>(FORCE_MOCK);
  const [recordingResult, setRecordingResult] = useState<{ session_id?: string | null; files?: string[] } | null>(null);

  const isMockMode = FORCE_MOCK || manualMockMode || autoMockMode;

  const addLocalEvent = (item: EventItem): void => {
    setEventLog((prev) => pushEvent(prev, item));
  };

  const applyWorldState = (nextWorld: WorldStateMessage): void => {
    setWorld(nextWorld);
    setServerVersion((prev) => nextWorld.server_version ?? prev);
    setSelectedPlayerIdState((prev) => {
      if (prev != null && nextWorld.players.some((player) => player.player_id === prev)) {
        return prev;
      }
      return nextWorld.players.length > 0 ? nextWorld.players[0].player_id : null;
    });
    if (nextWorld.events.length > 0) {
      setEventLog((prev) => mergeIncomingEvents(prev, nextWorld.events));
    }
  };

  useEffect(() => {
    const poll = (): void => {
      void getHealth()
        .then((payload) => {
          setHealthStatus(payload.status);
          setServerVersion(payload.version || "unknown");
        })
        .catch(() => {
          setHealthStatus("offline");
        });

      void getStatus()
        .then((payload) => {
          setServerVersion(payload.version || "unknown");
        })
        .catch(() => {
          // no-op
        });
    };

    poll();
    const interval = window.setInterval(poll, 4000);
    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (isMockMode) {
      wsRef.current?.stop();
      wsRef.current = null;

      if (mockRef.current == null) {
        mockRef.current = new MockWorldStream(Date.now());
      }
      if (mockTimerRef.current == null) {
        mockTimerRef.current = window.setInterval(() => {
          const nextWorld = mockRef.current?.tick(Date.now());
          if (nextWorld != null) {
            applyWorldState(nextWorld);
            setLastMessageTs(Date.now());
            setWsState("reconnecting");
          }
        }, 100);
      }

      return () => {
        if (mockTimerRef.current != null) {
          window.clearInterval(mockTimerRef.current);
          mockTimerRef.current = null;
        }
      };
    }

    if (mockTimerRef.current != null) {
      window.clearInterval(mockTimerRef.current);
      mockTimerRef.current = null;
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${protocol}://${window.location.host}/ws`;

    const client = new ReconnectingWsClient(wsUrl, {
      onConnectionState: (state) => {
        setWsState(state);
        if (state === "connected") {
          setAutoMockMode(false);
          addLocalEvent({
            ts_ms: Date.now(),
            level: "info",
            event: "ws_connected",
            details: "WebSocket connected",
          });
        }
        if (state === "reconnecting") {
          addLocalEvent({
            ts_ms: Date.now(),
            level: "warn",
            event: "ws_reconnecting",
            details: "WebSocket reconnecting",
          });
        }
      },
      onMessage: (payload) => {
        if (payload && typeof payload === "object" && (payload as Record<string, unknown>).type === "world_state") {
          const parsed = normalizeWorldState(payload);
          if (!parsed.ok || parsed.data == null) {
            setDegradedWarning(parsed.warning ?? "Invalid world_state payload");
            addLocalEvent({
              ts_ms: Date.now(),
              level: "warn",
              event: "payload_degraded",
              details: parsed.warning ?? "Invalid world_state payload",
            });
            return;
          }

          setDegradedWarning(null);
          applyWorldState(parsed.data);
          return;
        }

        if (payload && typeof payload === "object" && (payload as Record<string, unknown>).type === "config") {
          addLocalEvent({
            ts_ms: Date.now(),
            level: "debug",
            event: "config_update",
            details: "config",
          });
        }
      },
      onError: (message) => {
        setDegradedWarning(message);
        addLocalEvent({
          ts_ms: Date.now(),
          level: "error",
          event: "ws_error",
          details: message,
        });
      },
      onLastMessageTs: (timestamp) => {
        setLastMessageTs(timestamp);
      },
    });

    wsRef.current = client;
    client.start();

    return () => {
      client.stop();
      wsRef.current = null;
    };
  }, [isMockMode]);

  useEffect(() => {
    if (FORCE_MOCK || manualMockMode || autoMockMode) {
      return;
    }
    if (wsState === "connected") {
      return;
    }

    const timeout = window.setTimeout(() => {
      if (wsState !== "connected" && Date.now() - lastMessageTs > 3500) {
        setAutoMockMode(true);
        addLocalEvent({
          ts_ms: Date.now(),
          level: "warn",
          event: "mock_mode_auto",
          details: "Backend unavailable, switched to mock stream",
        });
      }
    }, 4000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [wsState, lastMessageTs, manualMockMode, autoMockMode]);

  const selectedPlayer = useMemo(() => {
    if (selectedPlayerId == null) {
      return null;
    }
    return world.players.find((player) => player.player_id === selectedPlayerId) ?? null;
  }, [world.players, selectedPlayerId]);

  const systemStatus = useMemo<"OK" | "Degraded" | "Offline">(() => {
    if (wsState === "connected" && degradedWarning == null) {
      return "OK";
    }
    if (wsState === "disconnected" && !isMockMode) {
      return "Offline";
    }
    return "Degraded";
  }, [wsState, degradedWarning, isMockMode]);

  const setSelectedPlayerId = (playerId: number): void => {
    setSelectedPlayerIdState(playerId);
  };

  const toggleMockMode = (): void => {
    if (FORCE_MOCK) {
      return;
    }
    setManualMockMode((prev) => !prev);
    setAutoMockMode(false);
  };

  const startRecordingAction = async (): Promise<void> => {
    if (isMockMode) {
      if (mockRef.current == null) {
        mockRef.current = new MockWorldStream(Date.now());
      }
      mockRef.current.setRecording(true);
      const nextWorld = mockRef.current.tick(Date.now());
      applyWorldState(nextWorld);
      setRecordingResult(null);
      return;
    }

    try {
      const response = await startRecording();
      setWorld((prev) => ({ ...prev, recording: response.recording }));
      addLocalEvent({
        ts_ms: Date.now(),
        level: "info",
        event: "recording_start",
        details: response.recording.session_id ?? "",
      });
      setRecordingResult(null);
    } catch (error) {
      addLocalEvent({
        ts_ms: Date.now(),
        level: "error",
        event: "recording_start_failed",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const stopRecordingAction = async (): Promise<void> => {
    if (isMockMode) {
      if (mockRef.current == null) {
        mockRef.current = new MockWorldStream(Date.now());
      }
      mockRef.current.setRecording(false);
      const nextWorld = mockRef.current.tick(Date.now());
      applyWorldState(nextWorld);
      return;
    }

    try {
      const response = await stopRecording();
      setWorld((prev) => ({ ...prev, recording: response.recording }));
      setRecordingResult({ session_id: response.session_id, files: response.files });
      addLocalEvent({
        ts_ms: Date.now(),
        level: "info",
        event: "recording_stop",
        details: response.session_id ?? "",
      });
    } catch (error) {
      addLocalEvent({
        ts_ms: Date.now(),
        level: "error",
        event: "recording_stop_failed",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const addSimPlayerAction = async (): Promise<void> => {
    if (isMockMode) {
      if (mockRef.current == null) {
        mockRef.current = new MockWorldStream(Date.now());
      }
      const playerId = mockRef.current.addPlayer(Date.now());
      if (playerId != null) {
        const nextWorld = mockRef.current.tick(Date.now());
        applyWorldState(nextWorld);
      }
      return;
    }

    try {
      const response = await addSimPlayer();
      addLocalEvent({
        ts_ms: Date.now(),
        level: response.ok ? "info" : "warn",
        event: "add_sim_player",
        details: response.message,
      });
    } catch (error) {
      addLocalEvent({
        ts_ms: Date.now(),
        level: "error",
        event: "add_sim_player_failed",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const removeSimPlayerAction = async (): Promise<void> => {
    if (isMockMode) {
      if (mockRef.current == null) {
        mockRef.current = new MockWorldStream(Date.now());
      }
      const playerId = mockRef.current.removePlayer(Date.now());
      if (playerId != null) {
        const nextWorld = mockRef.current.tick(Date.now());
        applyWorldState(nextWorld);
      }
      return;
    }

    try {
      const response = await removeSimPlayer();
      addLocalEvent({
        ts_ms: Date.now(),
        level: response.ok ? "warn" : "info",
        event: "remove_sim_player",
        details: response.message,
      });
    } catch (error) {
      addLocalEvent({
        ts_ms: Date.now(),
        level: "error",
        event: "remove_sim_player_failed",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  return {
    world,
    selectedPlayerId,
    selectedPlayer,
    setSelectedPlayerId,
    wsState,
    lastMessageTs,
    degradedWarning,
    systemStatus,
    serverVersion,
    eventLog,
    isMockMode,
    toggleMockMode,
    recordingResult,
    startRecordingAction,
    stopRecordingAction,
    addSimPlayerAction,
    removeSimPlayerAction,
    healthStatus,
  };
}
