import { useMemo, useState } from "react";
import type { EventItem, PlayerState } from "../types";
import { AlertTriangleIcon, CheckIcon, FilterIcon } from "./icons";

interface AlertsPanelProps {
  players: PlayerState[];
  events: EventItem[];
}

export function AlertsPanel({ players, events }: AlertsPanelProps): JSX.Element {
  const [acknowledgedKeys, setAcknowledgedKeys] = useState<Set<string>>(new Set());
  const [filterLevel, setFilterLevel] = useState<"all" | "warn" | "info">("all");

  const activeAlerts = useMemo(
    () =>
      players
        .filter((player) => player.alert_state?.active)
        .map((player) => ({
          key: `${player.player_id}-${player.alert_state?.reason ?? ""}`,
          playerId: player.player_id,
          name: player.name,
          level: player.alert_state?.level ?? "caution",
          reason: player.alert_state?.reason ?? "direction",
        })),
    [players],
  );

  const alertHistory = useMemo(
    () =>
      events
        .filter((event) => event.event === "alert_on" || event.event === "alert_off")
        .filter((event) => {
          if (filterLevel === "all") {
            return true;
          }
          return event.level === filterLevel;
        })
        .slice(0, 28),
    [events, filterLevel],
  );

  return (
    <section className="panel alerts-panel">
      <div className="panel-title-row">
        <div className="panel-title-group">
          <AlertTriangleIcon size={14} className="section-icon warn" />
          <h2>Alerts</h2>
        </div>
        <span className="panel-pill warning">{activeAlerts.length} active</span>
      </div>

      <div className="alerts-active-list">
        {activeAlerts.length === 0 ? (
          <div className="empty-state">No active alerts</div>
        ) : (
          activeAlerts.map((alert) => {
            const acknowledged = acknowledgedKeys.has(alert.key);
            return (
              <div key={alert.key} className={`alert-row ${acknowledged ? "ack" : ""}`}>
                <div>
                  <div>
                    P{alert.playerId} {alert.name ?? ""}
                  </div>
                  <div className="muted small">
                    {alert.level}: {alert.reason}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setAcknowledgedKeys((prev) => new Set([...prev, alert.key]));
                  }}
                  disabled={acknowledged}
                  aria-label={acknowledged ? "Acknowledged" : "Acknowledge alert"}
                >
                  {acknowledged ? <CheckIcon size={12} className="ok" /> : <CheckIcon size={12} />}
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="alerts-filter-row">
        <FilterIcon size={12} className="metric-icon" />
        {(["all", "warn", "info"] as const).map((level) => (
          <button
            key={level}
            type="button"
            className={`filter-chip ${filterLevel === level ? "active" : ""}`}
            onClick={() => {
              setFilterLevel(level);
            }}
          >
            {level}
          </button>
        ))}
      </div>

      <div className="alerts-history-list">
        {alertHistory.length === 0 ? (
          <div className="empty-state">No alert history</div>
        ) : (
          alertHistory.map((event, index) => (
            <div key={`${event.ts_ms}-${index}`} className="history-row mono">
              <span>{new Date(event.ts_ms).toISOString().slice(11, 19)}</span>
              <span>{event.event}</span>
              <span>{event.player_id != null ? `P${event.player_id}` : "-"}</span>
              <span>{event.reason ?? ""}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
