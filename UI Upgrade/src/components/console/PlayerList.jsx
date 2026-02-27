import React from "react";
import PlayerCard from "./PlayerCard";
import { Users } from "lucide-react";

export default function PlayerList({ players, selectedPlayerId, onSelectPlayer }) {
  const sorted = [...players].sort((a, b) => {
    if (a.alert_state?.active && !b.alert_state?.active) return -1;
    if (!a.alert_state?.active && b.alert_state?.active) return 1;
    return a.player_id - b.player_id;
  });

  const online = players.filter(p => p.connected).length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800">
        <Users className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Players</span>
        <span className="text-[10px] text-slate-500 ml-auto">{online}/{players.length} online</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {sorted.map(p => (
          <PlayerCard
            key={p.player_id}
            player={p}
            selected={selectedPlayerId === p.player_id}
            onSelect={onSelectPlayer}
          />
        ))}
      </div>
    </div>
  );
}