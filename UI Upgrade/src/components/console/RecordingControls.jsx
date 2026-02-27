import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Circle, Square, Copy, Check, FolderOpen } from "lucide-react";

export default function RecordingControls({ recording, onStart, onStop }) {
  const [lastResult, setLastResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleStop = async () => {
    setBusy(true);
    const result = await onStop();
    setLastResult(result);
    setBusy(false);
  };

  const handleStart = async () => {
    setBusy(true);
    await onStart();
    setBusy(false);
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="px-3 py-2 border-t border-slate-800">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Recording</span>
      </div>

      {recording.active ? (
        <Button
          onClick={handleStop}
          className="w-full h-8 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 text-xs gap-1.5"
          variant="ghost"
          disabled={busy}
        >
          <Square className="w-3 h-3 fill-current" />
          Stop Recording
        </Button>
      ) : (
        <Button
          onClick={handleStart}
          className="w-full h-8 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs gap-1.5"
          variant="ghost"
          disabled={busy}
        >
          <Circle className="w-3 h-3 fill-current" />
          Start Recording
        </Button>
      )}

      {lastResult && !recording.active && (
        <div className="mt-2 p-2 bg-slate-800/50 rounded border border-slate-700 space-y-1">
          <div className="text-[10px] text-slate-400">Session: {lastResult.session_id}</div>
          {lastResult.files?.map((f, i) => (
            <div key={i} className="flex items-center gap-1 text-[10px]">
              <FolderOpen className="w-2.5 h-2.5 text-slate-500" />
              <span className="text-slate-400 truncate flex-1">{f}</span>
              <button onClick={() => handleCopy(f)} className="p-0.5 hover:bg-slate-700 rounded">
                {copied ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5 text-slate-500" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
