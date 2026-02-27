import React from "react";
import { Battery, Signal, AlertTriangle, Radio } from "lucide-react";

function getConnectionState(player) {
  if (!player.connected) return { label: "Offline", color: "text-slate-500", bg: "bg-slate-500/10" };
  const age = (Date.now() - player.last_seen_ms) / 1000;
  if (age > 5) return { label: "Offline", color: "text-slate-500", bg: "bg-slate-500/10" };
  if (age > 2) return { label: "Degraded", color: "text-amber-400", bg: "bg-amber-500/10" };
  return { label: "Online", color: "text-emerald-400", bg: "bg-emerald-500/10" };
}

function getBatteryColor(v) {
  if (v >= 3.7) return "text-emerald-400";
  if (v >= 3.3) return "text-amber-400";
  return "text-red-400";
}

export default function PlayerCard({ player, selected, onSelect }) {
  const conn = getConnectionState(player);
  const age = Math.max(0, ((Date.now() - player.last_seen_ms) / 1000)).toFixed(1);
  const totalDrops = (player.drops?.bad_crc || 0) + (player.drops?.rate_limited || 0);

  return (
    <button
      onClick={() => onSelect(player.player_id)}
      className={`w-full text-left p-2.5 rounded-lg border transition-all duration-150 ${
        selected
          ? "bg-cyan-500/10 border-cyan-500/40"
          : "bg-[#111827] border-slate-800 hover:border-slate-600"
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${conn.color} ${conn.label === "Online" ? "bg-emerald-400" : conn.label === "Degraded" ? "bg-amber-400" : "bg-slate-500"}`} />
          <span className="text-sm font-semibold text-slate-200">
            P{player.player_id}
          </span>
          {player.name && (
            <span className="text-xs text-slate-500">{player.name}</span>
          )}
        </div>
        {player.alert_state?.active && (
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 animate-pulse-soft" />
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono-data text-slate-400">
        <div className="flex items-center gap-1">
          <span className={`text-[10px] px-1 py-px rounded ${conn.bg} ${conn.color}`}>{conn.label}</span>
        </div>
        <div className="flex items-center gap-1 justify-end">
          <span className="text-slate-500">{age}s</span>
        </div>

        <div className="flex items-center gap-1">
          <Radio className="w-2.5 h-2.5 text-slate-500" />
          <span>{player.packet_rate_hz} Hz</span>
        </div>
        <div className="flex items-center gap-1 justify-end">
          <Signal className="w-2.5 h-2.5 text-slate-500" />
          <span>{(player.quality * 100).toFixed(0)}%</span>
        </div>

        <div className="flex items-center gap-1">
          <Battery className={`w-2.5 h-2.5 ${getBatteryColor(player.battery_v)}`} />
          <span className={getBatteryColor(player.battery_v)}>{player.battery_v}V</span>
        </div>
        <div className="flex items-center gap-1 justify-end">
          <span className="text-slate-500">↻</span>
          <span>{player.yaw_deg.toFixed(0)}°</span>
        </div>

        {totalDrops > 0 && (
          <div className="col-span-2 text-[10px] text-amber-400/70 mt-0.5">
            drops: crc={player.drops.bad_crc} rl={player.drops.rate_limited}
          </div>
        )}
      </div>
    </button>
  );
}