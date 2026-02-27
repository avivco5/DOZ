import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { FileVideo, Play, Square, Clock, FolderOpen, RefreshCw } from "lucide-react";

async function fetchJson(url, init) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || `${response.status} ${response.statusText}`);
  }
  return payload;
}

function formatDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) {
    return "n/a";
  }
  const m = Math.floor(value / 60);
  const s = Math.floor(value % 60);
  return `${m}m ${s}s`;
}

function toSessionView(session, idx) {
  const fallbackId = `SESSION-${idx + 1}`;
  return {
    session_id: session?.session_id || fallbackId,
    start_ts: Number(session?.start_ts_ms ?? session?.start_ts ?? Date.now()),
    duration_s: Number(session?.duration_s ?? 0),
    files: Array.isArray(session?.files) ? session.files : [],
    player_count: Number(session?.player_count ?? 0),
    event_count: Number(session?.event_count ?? 0),
    raw: session,
  };
}

export default function AAR() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [replayActive, setReplayActive] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.session_id === selectedSessionId) || null,
    [sessions, selectedSessionId],
  );

  const refreshSessions = async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await fetchJson("/api/aar/list");
      const list = Array.isArray(payload.sessions) ? payload.sessions.map(toSessionView) : [];
      setSessions(list);
      setMessage(payload.message || "");
      if (list.length > 0 && selectedSessionId == null) {
        setSelectedSessionId(list[0].session_id);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to load AAR sessions");
    } finally {
      setLoading(false);
    }
  };

  const startReplay = async () => {
    setError("");
    try {
      const payload = await fetchJson("/api/replay/start", {
        method: "POST",
        body: JSON.stringify({ speed: replaySpeed }),
      });
      setReplayActive(true);
      setMessage(payload?.message || `Replay started at ${replaySpeed}x`);
    } catch (reason) {
      setReplayActive(false);
      setError(reason instanceof Error ? reason.message : "Replay start failed");
    }
  };

  const stopReplay = async () => {
    setError("");
    try {
      const payload = await fetchJson("/api/replay/stop", { method: "POST" });
      setReplayActive(false);
      setMessage(payload?.message || "Replay stopped");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Replay stop failed");
    }
  };

  useEffect(() => {
    void refreshSessions();
    // intentionally run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="h-[calc(100vh-40px)] overflow-y-auto bg-[#0a0e17] p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <FileVideo className="w-5 h-5 text-cyan-400" />
          <h1 className="text-xl font-semibold text-slate-200">After-Action Review</h1>
          <span className="text-xs text-slate-500">Recordings & Replay</span>
          <Button
            onClick={refreshSessions}
            size="sm"
            className="ml-auto bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs gap-1.5"
            variant="ghost"
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Loading..." : "Refresh"}
          </Button>
        </div>

        {message && (
          <div className="mb-4 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-300">
            {message}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="space-y-2 mb-8">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Recorded Sessions</h2>
          {sessions.length === 0 ? (
            <div className="text-center text-slate-600 text-sm py-8 border border-slate-800 rounded-lg bg-[#111827]">
              No backend sessions available in this build
            </div>
          ) : (
            sessions.map((session) => (
              <button
                key={session.session_id}
                onClick={() => setSelectedSessionId(session.session_id)}
                className={`w-full text-left p-4 rounded-lg border transition-all ${
                  selectedSession?.session_id === session.session_id
                    ? "bg-cyan-500/10 border-cyan-500/30"
                    : "bg-[#111827] border-slate-800 hover:border-slate-600"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
                      <FileVideo className="w-4 h-4 text-slate-400" />
                    </div>
                    <div>
                      <div className="text-sm font-mono text-slate-200">{session.session_id}</div>
                      <div className="text-[10px] text-slate-500">
                        {new Date(session.start_ts).toLocaleDateString()} ·{" "}
                        {new Date(session.start_ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDuration(session.duration_s)}
                    </div>
                    <div>{session.player_count} players</div>
                    <div>{session.event_count} events</div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {selectedSession && (
          <Card className="bg-[#111827] border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-cyan-400" />
                {selectedSession.session_id}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <div className="text-[10px] text-slate-500 uppercase">Duration</div>
                  <div className="text-sm font-mono text-slate-200 mt-1">{formatDuration(selectedSession.duration_s)}</div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <div className="text-[10px] text-slate-500 uppercase">Players</div>
                  <div className="text-sm font-mono text-slate-200 mt-1">{selectedSession.player_count || "n/a"}</div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <div className="text-[10px] text-slate-500 uppercase">Events</div>
                  <div className="text-sm font-mono text-slate-200 mt-1">{selectedSession.event_count || "n/a"}</div>
                </div>
              </div>

              <div>
                <div className="text-[10px] text-slate-500 uppercase mb-2">Files</div>
                {selectedSession.files.length === 0 ? (
                  <div className="text-xs text-slate-500">No file metadata</div>
                ) : (
                  selectedSession.files.map((filePath, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs font-mono text-slate-400 py-1">
                      <FolderOpen className="w-3 h-3 text-slate-600" />
                      {filePath}
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center gap-3 pt-2 border-t border-slate-700">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Speed:</span>
                  {[0.5, 1, 2, 4].map((speedValue) => (
                    <button
                      key={speedValue}
                      onClick={() => setReplaySpeed(speedValue)}
                      className={`text-[10px] px-2 py-0.5 rounded ${
                        replaySpeed === speedValue ? "bg-cyan-500/20 text-cyan-400" : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      {speedValue}x
                    </button>
                  ))}
                </div>
                <div className="flex-1" />
                {replayActive ? (
                  <Button
                    onClick={stopReplay}
                    size="sm"
                    className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 gap-1.5 text-xs"
                    variant="ghost"
                  >
                    <Square className="w-3 h-3 fill-current" />
                    Stop Replay
                  </Button>
                ) : (
                  <Button
                    onClick={startReplay}
                    size="sm"
                    className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 gap-1.5 text-xs"
                    variant="ghost"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    Start Replay
                  </Button>
                )}
              </div>

              {replayActive && (
                <div className="flex items-center gap-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                  <span className="text-xs text-emerald-400">Replaying at {replaySpeed}x speed...</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
