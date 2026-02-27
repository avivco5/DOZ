import React, { useEffect, useState, useCallback } from "react";
import StatusBar from "../components/console/StatusBar";
import PlayerList from "../components/console/PlayerList";
import ArenaView3D from "../components/console/ArenaView3D";
import TelemetryPanel from "../components/console/TelemetryPanel";
import AlertsPanel from "../components/console/AlertsPanel";
import RecordingControls from "../components/console/RecordingControls";
import EventLog from "../components/console/EventLog";
import useMockData from "../components/console/useMockData";

export default function Console() {
  const {
    players,
    obstacles,
    events,
    recording,
    systemStatus,
    wsConnected,
    trails,
    arena,
    serverVersion,
    startRecording,
    stopRecording,
  } = useMockData();

  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [playerScale, setPlayerScale] = useState(1);

  const handleSelectPlayer = useCallback((id) => {
    setSelectedPlayerId(prev => prev === id ? null : id);
  }, []);

  useEffect(() => {
    if (selectedPlayerId == null && players.length > 0) {
      setSelectedPlayerId(players[0].player_id);
      return;
    }
    if (selectedPlayerId != null && !players.some((p) => p.player_id === selectedPlayerId)) {
      setSelectedPlayerId(players.length > 0 ? players[0].player_id : null);
    }
  }, [players, selectedPlayerId]);

  const selectedPlayer = players.find(p => p.player_id === selectedPlayerId) || null;

  return (
    <div className="flex flex-col h-[calc(100vh-40px)]">
      {/* Status bar */}
      <StatusBar
        systemStatus={systemStatus}
        wsConnected={wsConnected}
        recording={recording}
        serverVersion={serverVersion}
      />

      {/* WS disconnect banner */}
      {!wsConnected && (
        <div className="bg-red-500/10 border-b border-red-500/30 px-4 py-1.5 text-center text-xs text-red-400">
          WebSocket disconnected — showing last known state. Reconnecting...
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel - Player list */}
        <div className="w-56 xl:w-64 border-r border-slate-800 bg-[#0d1321] flex flex-col shrink-0 overflow-hidden">
          <PlayerList
            players={players}
            selectedPlayerId={selectedPlayerId}
            onSelectPlayer={handleSelectPlayer}
          />
          <RecordingControls
            recording={recording}
            onStart={startRecording}
            onStop={stopRecording}
          />
        </div>

        {/* Center - Arena */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 relative">
            <ArenaView3D
              players={players}
              obstacles={obstacles}
              trails={trails}
              arena={arena}
              selectedPlayerId={selectedPlayerId}
              onSelectPlayer={handleSelectPlayer}
              playerScale={playerScale}
            />
            {/* Player scale slider */}
            <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-slate-900/80 border border-slate-700 rounded-lg px-3 py-1.5 backdrop-blur-sm">
              <span className="text-[10px] text-slate-400 shrink-0">גודל שחקן</span>
              <input
                type="range"
                min={0.3}
                max={4}
                step={0.1}
                value={playerScale}
                onChange={e => setPlayerScale(Number(e.target.value))}
                className="w-28 accent-cyan-400 cursor-pointer"
              />
              <span className="text-[10px] font-mono text-cyan-400 w-6">x{playerScale.toFixed(1)}</span>
            </div>
          </div>
          {/* Bottom - Event log */}
          <div className="h-44 border-t border-slate-800 bg-[#0d1321] shrink-0">
            <EventLog events={events} />
          </div>
        </div>

        {/* Right panel - Telemetry + Alerts */}
        <div className="w-56 xl:w-64 border-l border-slate-800 bg-[#0d1321] flex flex-col shrink-0 overflow-hidden">
          <div className="border-b border-slate-800">
            <TelemetryPanel player={selectedPlayer} />
          </div>
          <div className="flex-1 overflow-hidden">
            <AlertsPanel players={players} events={events} />
          </div>
        </div>
      </div>
    </div>
  );
}
