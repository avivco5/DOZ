import type { WsConnectionState } from "../types";

export interface WsClientCallbacks {
  onConnectionState: (state: WsConnectionState) => void;
  onMessage: (payload: unknown) => void;
  onError: (error: string) => void;
  onLastMessageTs: (ts: number) => void;
}

export class ReconnectingWsClient {
  private ws: WebSocket | null = null;
  private stopped = false;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;

  constructor(private readonly url: string, private readonly callbacks: WsClientCallbacks) {}

  start(): void {
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws != null) {
      this.ws.close();
      this.ws = null;
    }
    this.callbacks.onConnectionState("disconnected");
  }

  private open(): void {
    if (this.stopped) {
      return;
    }

    this.callbacks.onConnectionState(this.reconnectAttempts > 0 ? "reconnecting" : "disconnected");

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create WebSocket";
      this.callbacks.onError(message);
      this.scheduleReconnect();
      return;
    }

    this.ws = socket;

    socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.callbacks.onConnectionState("connected");
    };

    socket.onmessage = (event) => {
      this.callbacks.onLastMessageTs(Date.now());
      try {
        const payload = JSON.parse(event.data) as unknown;
        this.callbacks.onMessage(payload);
      } catch {
        this.callbacks.onError("Invalid JSON payload on WebSocket");
      }
    };

    socket.onerror = () => {
      this.callbacks.onError("WebSocket transport error");
    };

    socket.onclose = () => {
      this.ws = null;
      if (this.stopped) {
        return;
      }
      this.callbacks.onConnectionState("reconnecting");
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.stopped) {
      return;
    }
    const maxBackoffMs = 10000;
    const baseMs = 500;
    const backoffMs = Math.min(maxBackoffMs, baseMs * 2 ** this.reconnectAttempts);
    const jitter = Math.floor(Math.random() * 200);
    const waitMs = backoffMs + jitter;
    this.reconnectAttempts += 1;

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, waitMs);
  }
}
