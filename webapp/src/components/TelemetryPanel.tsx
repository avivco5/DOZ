import type { PlayerState } from "../types";
import { batteryLabel, connectionState, lastSeenSeconds, packetRateLabel, qualityPct } from "../lib/playerUtils";
import { ActivityIcon, AlertTriangleIcon, BatteryIcon, CompassIcon, MapPinIcon, RadioIcon, SignalIcon } from "./icons";

interface TelemetryPanelProps {
  player: PlayerState | null;
  nowMs: number;
}

interface DetailRowProps {
  icon: (props: { size?: number; className?: string }) => JSX.Element;
  label: string;
  value: string;
  valueClassName?: string;
}

function DetailRow({ icon: Icon, label, value, valueClassName }: DetailRowProps): JSX.Element {
  return (
    <div className="telemetry-row">
      <div className="telemetry-row-label">
        <Icon size={12} className="metric-icon" />
        <span>{label}</span>
      </div>
      <span className={`mono ${valueClassName ?? ""}`}>{value}</span>
    </div>
  );
}

function renderDrops(player: PlayerState | null): JSX.Element {
  if (player == null || player.drops == null || Object.keys(player.drops).length === 0) {
    return <span className="chip">none</span>;
  }

  return (
    <>
      {Object.entries(player.drops).map(([key, value]) => (
        <span key={key} className="chip">
          {key.toUpperCase()}: {value}
        </span>
      ))}
    </>
  );
}

export function TelemetryPanel({ player, nowMs }: TelemetryPanelProps): JSX.Element {
  if (player == null) {
    return (
      <section className="panel telemetry-panel">
        <div className="telemetry-empty-state">Select a player to view telemetry</div>
      </section>
    );
  }

  const conn = connectionState(player, nowMs);
  const connLabel = `${conn[0]?.toUpperCase() ?? ""}${conn.slice(1)}`;
  const batteryState = player.battery_v == null ? "" : player.battery_v >= 3.7 ? "ok" : player.battery_v >= 3.3 ? "warn" : "danger";

  return (
    <section className="panel telemetry-panel">
      <div className="panel-title-row">
        <h2>Telemetry</h2>
        <span className={`badge ${conn}`}>{connLabel}</span>
      </div>

      <div className="telemetry-header">
        <div className="telemetry-player-chip mono">P{player.player_id}</div>
        <div>
          <h3>{player.name ?? `Player ${player.player_id}`}</h3>
          <div className="small muted">{connLabel}</div>
        </div>
      </div>

      <div className="telemetry-grid">
        <DetailRow icon={MapPinIcon} label="Position" value={`${player.x.toFixed(2)}, ${player.y.toFixed(2)}`} />
        <DetailRow icon={CompassIcon} label="Heading" value={`${player.yaw_deg.toFixed(1)} deg`} />
        <DetailRow icon={BatteryIcon} label="Battery" value={batteryLabel(player)} valueClassName={batteryState} />
        <DetailRow icon={SignalIcon} label="Quality" value={`${qualityPct(player).toFixed(0)}%`} />
        <DetailRow icon={RadioIcon} label="Packet Rate" value={packetRateLabel(player)} />
        <DetailRow icon={ActivityIcon} label="Last Seen" value={`${lastSeenSeconds(player, nowMs)?.toFixed(1) ?? "-"}s`} />
      </div>

      <div className="chip-row">{renderDrops(player)}</div>

      {player.alert_state?.active && (
        <div className="alert-banner">
          <div className="alert-banner-level">
            <AlertTriangleIcon size={12} />
            <span>{player.alert_state.level.toUpperCase()}</span>
          </div>
          <div className="alert-banner-reason">{player.alert_state.reason || "direction"}</div>
        </div>
      )}
    </section>
  );
}
