import type { RecordingState } from "../types";

export interface ApiStatus {
  status: string;
  system: string;
  version: string;
  uptime_ms: number;
  players_online: number;
  players_total: number;
  ws_clients: number;
  recording: RecordingState;
}

export interface RecordingResponse {
  ok: boolean;
  recording: RecordingState;
  files?: string[];
  session_id?: string | null;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }

  return (await response.json()) as T;
}

export function getHealth(): Promise<{ status: string; server_time_ms: number; version: string }> {
  return fetchJson("/api/health");
}

export function getStatus(): Promise<ApiStatus> {
  return fetchJson("/api/status");
}

export function startRecording(): Promise<RecordingResponse> {
  return fetchJson("/api/recording/start", { method: "POST" });
}

export function stopRecording(): Promise<RecordingResponse> {
  return fetchJson("/api/recording/stop", { method: "POST" });
}

export function getAarList(): Promise<{ status: string; sessions: unknown[]; message?: string }> {
  return fetchJson("/api/aar/list");
}

export function startReplay(speed: number): Promise<{ status: string; message?: string }> {
  return fetchJson("/api/replay/start", {
    method: "POST",
    body: JSON.stringify({ speed }),
  });
}

export function stopReplay(): Promise<{ status: string; message?: string }> {
  return fetchJson("/api/replay/stop", {
    method: "POST",
  });
}

export function addSimPlayer(): Promise<{ ok: boolean; player_id: number | null; message: string }> {
  return fetchJson("/api/sim/add", {
    method: "POST",
  });
}

export function removeSimPlayer(): Promise<{ ok: boolean; player_id: number | null; message: string }> {
  return fetchJson("/api/sim/remove", {
    method: "POST",
  });
}
