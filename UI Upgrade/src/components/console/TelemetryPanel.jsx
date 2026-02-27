import React from "react";
import { Battery, Signal, Radio, Compass, MapPin, AlertTriangle, Activity } from "lucide-react";

function DetailRow({ icon: Icon, label, value, valueColor = "text-slate-200" }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-1.5 text-slate-500 text-xs">
        <Icon className="w-3 h-3" />
        <span>{label}</span>
      </div>
      <span className={`font-mono-data ${valueColor}`}>{value}</span>
    </div>
  );
}

export default function TelemetryPanel({ player }) {
  if (!player) {
    return (
      <div className="p-4 text-center text-slate-500 text-xs">
        Select a player to view telemetry
      </div>
    );
  }

  const age = ((Date.now() - player.last_seen_ms) / 1000).toFixed(1);
  const battColor = player.battery_v >= 3.7 ? "text-emerald-400" : player.battery_v >= 3.3 ? "text-amber-400" : "text-red-400";

  return (
    <div className="p-3 space-y-1">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-cyan-500/10 flex items-center justify-center">
          <span className="text-xs font-bold text-cyan-400">P{player.player_id}</span>
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-200">{player.name || `Player ${player.player_id}`}</div>
          <div className="text-[10px] text-slate-500">{player.connected ? "Connected" : "Disconnected"}</div>
        </div>
      </div>

      <div className="space-y-0.5 border-t border-slate-800 pt-2">
        <DetailRow icon={MapPin} label="Position" value={`${player.x.toFixed(1)}, ${player.y.toFixed(1)}`} />
        <DetailRow icon={Compass} label="Heading" value={`${player.yaw_deg.toFixed(1)}°`} />
        <DetailRow icon={Battery} label="Battery" value={`${player.battery_v}V`} valueColor={battColor} />
        <DetailRow icon={Signal} label="Quality" value={`${(player.quality * 100).toFixed(0)}%`} />
        <DetailRow icon={Radio} label="Packet Rate" value={`${player.packet_rate_hz} Hz`} />
        <DetailRow icon={Activity} label="Last Seen" value={`${age}s ago`} />
      </div>

      <div className="border-t border-slate-800 pt-2 mt-2">
        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Drop Counters</div>
        <div className="grid grid-cols-2 gap-2 font-mono-data text-xs">
          <div className="bg-slate-800/50 rounded px-2 py-1">
            <span className="text-slate-500">CRC: </span>
            <span className="text-slate-300">{player.drops?.bad_crc || 0}</span>
          </div>
          <div className="bg-slate-800/50 rounded px-2 py-1">
            <span className="text-slate-500">RL: </span>
            <span className="text-slate-300">{player.drops?.rate_limited || 0}</span>
          </div>
        </div>
      </div>

      {player.alert_state?.active && (
        <div className="border-t border-slate-800 pt-2 mt-2">
          <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <div>
              <div className="text-xs font-medium text-amber-400">
                {player.alert_state.level?.toUpperCase()}
              </div>
              <div className="text-[10px] text-amber-400/70">{player.alert_state.reason}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}