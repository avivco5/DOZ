import { useEffect, useState } from "react";
import type { ConsoleDataModel } from "../hooks/useConsoleData";
import { ClockIcon, WifiIcon, WifiOffIcon } from "./icons";

interface StatusBarProps {
  model: ConsoleDataModel;
}

function recordingElapsed(startTsMs: number | null): string {
  if (startTsMs == null) {
    return "00:00";
  }
  const elapsedSec = Math.max(0, Math.floor((Date.now() - startTsMs) / 1000));
  const minutes = Math.floor(elapsedSec / 60);
  const seconds = elapsedSec % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function StatusBar({ model }: StatusBarProps): JSX.Element {
  const [clock, setClock] = useState<string>(() => new Date().toLocaleTimeString("en-GB", { hour12: false }));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(new Date().toLocaleTimeString("en-GB", { hour12: false }));
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const systemClass =
    model.systemStatus === "OK" ? "ok" : model.systemStatus === "Offline" ? "offline" : "degraded";

  const wsLabel =
    model.wsState === "connected" ? "Connected" : model.wsState === "reconnecting" ? "Reconnecting" : "Disconnected";
  const recState = model.world.recording.active ? "recording-on" : "recording-off";

  return (
    <div className="status-bar" role="status" aria-live="polite">
      <div className="status-cluster">
        <div className="status-item">
          <span className={`status-dot ${systemClass}`} />
          <span className="status-label">System:</span>
          <span className={`status-value ${systemClass}`}>{model.systemStatus}</span>
        </div>

        <span className="status-divider" />

        <div className="status-item">
          <span className="status-value muted">v{model.serverVersion}</span>
        </div>

        <span className="status-divider" />

        <div className="status-item">
          <ClockIcon size={13} className="status-icon muted" />
          <span className="status-value mono">{clock}</span>
        </div>
      </div>

      <div className="status-cluster right">
        <div className="status-item recording">
          {model.world.recording.active ? (
            <>
              <span className={`status-dot ${recState}`} />
              <span className="recording-on">REC ON</span>
              <span className="status-value mono">{recordingElapsed(model.world.recording.start_ts_ms)}</span>
              <span className="status-value dim">{model.world.recording.session_id}</span>
            </>
          ) : (
            <>
              <span className={`status-dot ${recState}`} />
              <span className="status-value dim">REC OFF</span>
            </>
          )}
        </div>

        <span className="status-divider" />

        <button type="button" className={`mock-toggle ${model.isMockMode ? "active" : ""}`} onClick={model.toggleMockMode}>
          {model.isMockMode ? "Mock ON" : "Mock OFF"}
        </button>

        <span className="status-divider" />

        <div className="status-item ws">
          {model.wsState === "connected" ? (
            <WifiIcon size={14} className="status-icon ok" />
          ) : (
            <WifiOffIcon size={14} className="status-icon offline" />
          )}
          <span className={`status-value ${model.wsState === "connected" ? "ok" : "offline"}`}>{wsLabel}</span>
        </div>
      </div>
    </div>
  );
}
