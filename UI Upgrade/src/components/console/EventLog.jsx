import React, { useState, useRef, useEffect } from "react";
import { Search, Filter, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";

const LEVEL_COLORS = {
  info: "text-cyan-400",
  warn: "text-amber-400",
  error: "text-red-400",
  debug: "text-slate-500",
};

const LEVEL_BG = {
  info: "bg-cyan-400/10",
  warn: "bg-amber-400/10",
  error: "bg-red-400/10",
  debug: "bg-slate-400/5",
};

export default function EventLog({ events }) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterLevel, setFilterLevel] = useState("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef(null);

  const filtered = events.filter(e => {
    if (filterType !== "all" && e.event !== filterType) return false;
    if (filterLevel !== "all" && e.level !== filterLevel) return false;
    if (search) {
      const s = search.toLowerCase();
      const text = `${e.event} ${e.player_id || ""} ${e.reason || ""} ${e.details || ""}`.toLowerCase();
      if (!text.includes(s)) return false;
    }
    return true;
  });

  const eventTypes = [...new Set(events.map(e => e.event))];

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [events, autoScroll]);

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-t border-slate-800 bg-[#0d1321]">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider shrink-0">Event Log</span>

        <div className="relative flex-1 max-w-48">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="h-6 pl-6 text-[10px] bg-slate-800/50 border-slate-700 text-slate-300 placeholder:text-slate-600"
          />
        </div>

        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="h-6 text-[10px] bg-slate-800/50 border border-slate-700 text-slate-300 rounded px-1"
        >
          <option value="all">All Types</option>
          {eventTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select
          value={filterLevel}
          onChange={e => setFilterLevel(e.target.value)}
          className="h-6 text-[10px] bg-slate-800/50 border border-slate-700 text-slate-300 rounded px-1"
        >
          <option value="all">All Levels</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
          <option value="debug">Debug</option>
        </select>

        <span className="text-[10px] text-slate-600 ml-auto">{filtered.length} events</span>
      </div>

      {/* Events */}
      <div ref={containerRef} className="flex-1 overflow-y-auto px-3 py-1" style={{ maxHeight: "180px" }}>
        {filtered.map((evt, i) => (
          <div key={i} className="flex items-center gap-2 py-0.5 font-mono-data text-[11px] hover:bg-white/[0.02] rounded px-1">
            <span className="text-slate-600 w-[70px] shrink-0">
              {new Date(evt.ts_ms).toLocaleTimeString("en-US", { hour12: false, fractionalSecondDigits: 1 })}
            </span>
            <span className={`px-1 py-px rounded text-[9px] uppercase font-medium ${LEVEL_COLORS[evt.level] || "text-slate-400"} ${LEVEL_BG[evt.level] || ""}`}>
              {evt.level}
            </span>
            <span className="text-slate-300">{evt.event}</span>
            {evt.player_id && <span className="text-cyan-400/60">P{evt.player_id}</span>}
            {evt.reason && <span className="text-slate-500">{evt.reason}</span>}
            {evt.details && <span className="text-slate-600 truncate">{evt.details}</span>}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center text-slate-600 text-[10px] py-4">No events match filters</div>
        )}
      </div>
    </div>
  );
}