import { useMemo, useState } from "react";
import { getAarList, startReplay, stopReplay } from "../lib/api";

export function AarPage(): JSX.Element {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [sessions, setSessions] = useState<unknown[]>([]);
  const [message, setMessage] = useState<string>("AAR listing not enabled in this build");
  const [speed, setSpeed] = useState<number>(1.0);
  const [uploadedSummary, setUploadedSummary] = useState<string>("");

  const sessionCountLabel = useMemo(() => `${sessions.length} sessions`, [sessions.length]);

  const refreshSessions = async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const payload = await getAarList();
      setSessions(payload.sessions ?? []);
      setMessage(payload.message ?? "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to load AAR list");
    } finally {
      setLoading(false);
    }
  };

  const handleReplayStart = async (): Promise<void> => {
    try {
      const payload = await startReplay(speed);
      setMessage(payload.message ?? "Replay started");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Replay not available");
    }
  };

  const handleReplayStop = async (): Promise<void> => {
    try {
      const payload = await stopReplay();
      setMessage(payload.message ?? "Replay stopped");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Replay stop not available");
    }
  };

  const handleUpload = async (file: File | null): Promise<void> => {
    if (file == null) {
      return;
    }

    const content = await file.text();
    const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
    setUploadedSummary(`Loaded ${lines.length} JSONL records from ${file.name}`);
  };

  return (
    <div className="content-page">
      <section className="panel page-panel">
        <div className="panel-title-row">
          <h2>After Action Review</h2>
          <span className="panel-pill">{sessionCountLabel}</span>
        </div>

        <p className="muted">
          This page is for training-session replay and post-session analysis only.
        </p>

        <div className="button-row">
          <button type="button" className="btn btn-primary" onClick={() => void refreshSessions()} disabled={loading}>
            {loading ? "Loading..." : "Refresh Sessions"}
          </button>

          <label className="inline-control">
            Replay Speed
            <input
              type="range"
              min="0.25"
              max="4"
              step="0.25"
              value={speed}
              onChange={(event) => setSpeed(Number(event.target.value))}
            />
            <span className="mono">x{speed.toFixed(2)}</span>
          </label>

          <button type="button" className="btn btn-ghost" onClick={() => void handleReplayStart()}>
            Start Replay
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void handleReplayStop()}>
            Stop Replay
          </button>
        </div>

        {message !== "" && <div className="info-box">{message}</div>}
        {error !== "" && <div className="error-box">{error}</div>}

        <div className="session-list">
          {sessions.length === 0 ? (
            <div className="empty-state">No backend AAR sessions are available in this build.</div>
          ) : (
            sessions.map((session, index) => (
              <div key={index} className="session-row">
                <span className="mono">Session #{index + 1}</span>
                <span className="dim">{JSON.stringify(session)}</span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="panel page-panel">
        <div className="panel-title-row">
          <h2>Offline JSONL Upload</h2>
        </div>
        <p className="muted">Optional local preview input for telemetry JSONL files.</p>
        <input
          type="file"
          accept=".jsonl,.json"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            void handleUpload(file);
          }}
        />
        {uploadedSummary !== "" && <div className="info-box">{uploadedSummary}</div>}
      </section>
    </div>
  );
}
