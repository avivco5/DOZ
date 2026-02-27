import type { PlayerState } from "../types";
import { batteryLabel, connectionState, lastSeenSeconds, packetRateLabel, qualityPct } from "../lib/playerUtils";
import { AlertTriangleIcon, BatteryIcon, RadioIcon, RotateIcon, SignalIcon, UsersIcon } from "./icons";

interface PlayerListPanelProps {
  players: PlayerState[];
  selectedPlayerId: number | null;
  onSelectPlayer: (playerId: number) => void;
  onAddSimPlayer: () => void;
  onRemoveSimPlayer: () => void;
  nowMs: number;
}

function dropSummary(player: PlayerState): string | null {
  const drops = player.drops ?? {};
  const entries = Object.entries(drops);
  if (entries.length === 0) {
    return null;
  }
  const printable = entries
    .map(([key, value]) => {
      if (key === "bad_crc") {
        return `crc=${value}`;
      }
      if (key === "rate_limited") {
        return `rl=${value}`;
      }
      return `${key}=${value}`;
    })
    .join(" ");
  return `drops: ${printable}`;
}

function batteryClass(player: PlayerState): string {
  const value = player.battery_v;
  if (value == null) {
    return "";
  }
  if (value >= 3.7) {
    return "ok";
  }
  if (value >= 3.3) {
    return "warn";
  }
  return "danger";
}

export function PlayerListPanel({
  players,
  selectedPlayerId,
  onSelectPlayer,
  onAddSimPlayer,
  onRemoveSimPlayer,
  nowMs,
}: PlayerListPanelProps): JSX.Element {
  const onlineCount = players.filter((player) => connectionState(player, nowMs) === "online").length;

  return (
    <section className="panel left-list-panel">
      <div className="panel-title-row">
        <div className="panel-title-group">
          <UsersIcon size={14} className="section-icon" />
          <h2>Players</h2>
        </div>
        <div className="panel-title-actions">
          <button type="button" className="btn btn-ghost icon-btn" onClick={onAddSimPlayer} title="Add simulation player">
            +
          </button>
          <button
            type="button"
            className="btn btn-ghost icon-btn"
            onClick={onRemoveSimPlayer}
            title="Remove simulation player"
          >
            -
          </button>
          <span className="panel-pill">{onlineCount}/{players.length} online</span>
        </div>
      </div>

      <div className="player-list-scroll">
        {players.length === 0 ? (
          <div className="empty-state">No players connected</div>
        ) : (
          players
            .slice()
            .sort((a, b) => {
              const aAlert = a.alert_state?.active ? 1 : 0;
              const bAlert = b.alert_state?.active ? 1 : 0;
              if (aAlert !== bAlert) {
                return bAlert - aAlert;
              }
              return a.player_id - b.player_id;
            })
            .map((player) => {
              const conn = connectionState(player, nowMs);
              const selected = selectedPlayerId === player.player_id;
              const dropsLabel = dropSummary(player);
              return (
                <button
                  type="button"
                  key={player.player_id}
                  className={`player-card ${selected ? "selected" : ""}`}
                  onClick={() => onSelectPlayer(player.player_id)}
                >
                  <div className="player-card-top">
                    <div className="player-title">
                      <span className={`player-state-dot ${conn}`} />
                      <span className="player-id">P{player.player_id}</span>
                      <span className="muted">{player.name ?? `Player-${player.player_id}`}</span>
                    </div>
                    {player.alert_state?.active && <AlertTriangleIcon size={14} className="player-alert-icon" />}
                  </div>

                  <div className="player-meta-row">
                    <span className={`badge ${conn}`}>{conn[0]?.toUpperCase()}{conn.slice(1)}</span>
                    <span className="mono">{lastSeenSeconds(player, nowMs)?.toFixed(1) ?? "-"}s</span>
                  </div>

                  <div className="player-metrics">
                    <span className="metric-pair">
                      <RadioIcon size={12} className="metric-icon" />
                      <span>{packetRateLabel(player)}</span>
                    </span>
                    <span className="metric-pair end">
                      <SignalIcon size={12} className="metric-icon" />
                      <span>{qualityPct(player).toFixed(0)}%</span>
                    </span>
                    <span className={`metric-pair ${batteryClass(player)}`}>
                      <BatteryIcon size={12} className="metric-icon" />
                      <span>{batteryLabel(player)}</span>
                    </span>
                    <span className="metric-pair end">
                      <RotateIcon size={12} className="metric-icon" />
                      <span>{player.yaw_deg.toFixed(0)}deg</span>
                    </span>
                  </div>

                  {dropsLabel != null && <div className="drop-summary">{dropsLabel}</div>}
                </button>
              );
            })
        )}
      </div>
    </section>
  );
}
