import React, { useState, useEffect } from "react";
import { Wifi, WifiOff, Circle, Clock } from "lucide-react";

function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="font-mono-data text-slate-300">
      {time.toLocaleTimeString("en-US", { hour12: false })}
    </span>
  );
}

function RecordingElapsed({ startTs }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startTs) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTs) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startTs]);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return <span className="font-mono-data">{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}</span>;
}

export default function StatusBar({ systemStatus, wsConnected, recording, serverVersion = "1.0.0-dev" }) {
  const statusColor =
    systemStatus === "OK" ? "text-emerald-400" : systemStatus === "Offline" ? "text-red-400" : "text-amber-400";

  return (
    <div className="h-9 bg-[#0d1321] border-b border-slate-800 flex items-center px-4 gap-4 text-xs shrink-0">
      {/* System Status */}
      <div className="flex items-center gap-1.5">
        <Circle className={`w-2.5 h-2.5 fill-current ${statusColor}`} />
        <span className="text-slate-400">System:</span>
        <span className={statusColor}>{systemStatus}</span>
      </div>

      <div className="w-px h-4 bg-slate-700" />

      {/* Server version */}
      <div className="flex items-center gap-1.5 text-slate-500">
        <span>v{serverVersion}</span>
      </div>

      <div className="w-px h-4 bg-slate-700" />

      {/* Clock */}
      <div className="flex items-center gap-1.5">
        <Clock className="w-3 h-3 text-slate-500" />
        <LiveClock />
      </div>

      <div className="flex-1" />

      {/* Recording */}
      <div className="flex items-center gap-2">
        {recording.active ? (
          <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 px-2 py-0.5 rounded">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-rec-blink" />
            <span className="text-red-400 font-medium">REC</span>
            <RecordingElapsed startTs={recording.start_ts_ms} />
            <span className="text-red-400/60 ml-1">{recording.session_id}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-slate-500">
            <div className="w-2 h-2 rounded-full bg-slate-600" />
            <span>REC OFF</span>
          </div>
        )}
      </div>

      <div className="w-px h-4 bg-slate-700" />

      {/* WS status */}
      <div className="flex items-center gap-1.5">
        {wsConnected ? (
          <>
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-emerald-400">Connected</span>
          </>
        ) : (
          <>
            <WifiOff className="w-3.5 h-3.5 text-red-400" />
            <span className="text-red-400">Disconnected</span>
          </>
        )}
      </div>
    </div>
  );
}
