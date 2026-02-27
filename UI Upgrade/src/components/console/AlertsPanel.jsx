import React, { useState } from "react";
import { AlertTriangle, Check, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AlertsPanel({ players, events }) {
  const [acknowledged, setAcknowledged] = useState(new Set());
  const [filterLevel, setFilterLevel] = useState("all");

  const activeAlerts = players
    .filter(p => p.alert_state?.active)
    .map(p => ({
      player_id: p.player_id,
      name: p.name,
      level: p.alert_state.level,
      reason: p.alert_state.reason,
      key: `${p.player_id}-${p.alert_state.reason}`,
    }));

  const alertEvents = events
    .filter(e => e.event === "alert_on" || e.event === "alert_off")
    .filter(e => filterLevel === "all" || e.level === filterLevel)
    .slice(0, 20);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Alerts</span>
        <span className="text-[10px] text-amber-400 ml-auto">
          {activeAlerts.length} active
        </span>
      </div>

      {/* Active alerts */}
      <div className="p-2 space-y-1">
        {activeAlerts.length === 0 ? (
          <div className="text-center text-slate-600 text-[10px] py-2">No active alerts</div>
        ) : (
          activeAlerts.map(alert => (
            <div
              key={alert.key}
              className={`flex items-center gap-2 p-2 rounded-lg border ${
                acknowledged.has(alert.key)
                  ? "bg-slate-800/30 border-slate-700"
                  : "bg-amber-500/5 border-amber-500/20"
              }`}
            >
              <AlertTriangle className={`w-3 h-3 shrink-0 ${
                acknowledged.has(alert.key) ? "text-slate-500" : "text-amber-400"
              }`} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-slate-300">
                  P{alert.player_id} {alert.name && `· ${alert.name}`}
                </div>
                <div className="text-[10px] text-slate-500 truncate">
                  {alert.level}: {alert.reason}
                </div>
              </div>
              {!acknowledged.has(alert.key) && (
                <button
                  onClick={() => setAcknowledged(prev => new Set([...prev, alert.key]))}
                  className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition"
                >
                  <Check className="w-3 h-3" />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-1 px-3 py-1 border-t border-slate-800">
        <Filter className="w-2.5 h-2.5 text-slate-500" />
        {["all", "warn", "info"].map(level => (
          <button
            key={level}
            onClick={() => setFilterLevel(level)}
            className={`text-[10px] px-1.5 py-0.5 rounded transition ${
              filterLevel === level ? "bg-slate-700 text-slate-200" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {level}
          </button>
        ))}
      </div>

      {/* Alert history */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {alertEvents.map((evt, i) => (
          <div key={i} className="flex items-center gap-2 text-[10px] font-mono-data py-0.5">
            <span className="text-slate-600 w-16 shrink-0">
              {new Date(evt.ts_ms).toLocaleTimeString("en-US", { hour12: false })}
            </span>
            <span className={evt.event === "alert_on" ? "text-amber-400" : "text-slate-500"}>
              {evt.event === "alert_on" ? "▲" : "▽"}
            </span>
            <span className="text-slate-400">P{evt.player_id}</span>
            {evt.reason && <span className="text-slate-500">{evt.reason}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}