import { useMemo, useState } from "react";
import type { EventItem, EventLevel } from "../types";
import { SearchIcon } from "./icons";

interface EventLogPanelProps {
  events: EventItem[];
}

const LEVELS: Array<"all" | EventLevel> = ["all", "debug", "info", "warn", "error", "critical"];

function levelClass(level: EventLevel): string {
  if (level === "critical" || level === "error") {
    return "error";
  }
  if (level === "warn") {
    return "warn";
  }
  return "info";
}

export function EventLogPanel({ events }: EventLogPanelProps): JSX.Element {
  const [search, setSearch] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [levelFilter, setLevelFilter] = useState<"all" | EventLevel>("all");

  const eventTypes = useMemo(() => {
    const set = new Set<string>();
    for (const event of events) {
      set.add(event.event);
    }
    return ["all", ...Array.from(set).sort()];
  }, [events]);

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((event) => {
      if (typeFilter !== "all" && event.event !== typeFilter) {
        return false;
      }
      if (levelFilter !== "all" && event.level !== levelFilter) {
        return false;
      }
      if (q.length > 0) {
        const text = `${event.event} ${event.player_id ?? ""} ${event.reason ?? ""} ${String(event.details ?? "")}`.toLowerCase();
        return text.includes(q);
      }
      return true;
    });
  }, [events, search, typeFilter, levelFilter]);

  return (
    <section className="panel bottom-event-panel">
      <div className="panel-title-row">
        <h2>Event Log</h2>
        <span className="panel-pill">{filteredEvents.length} events</span>
      </div>

      <div className="event-log-controls">
        <label className="search-field">
          <SearchIcon size={12} className="metric-icon" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="input search-input"
            placeholder="Search events"
          />
        </label>

        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="input select">
          {eventTypes.map((eventType) => (
            <option key={eventType} value={eventType}>
              {eventType === "all" ? "All Types" : eventType}
            </option>
          ))}
        </select>

        <select
          value={levelFilter}
          onChange={(event) => setLevelFilter(event.target.value as "all" | EventLevel)}
          className="input select"
        >
          {LEVELS.map((level) => (
            <option key={level} value={level}>
              {level === "all" ? "All Levels" : level}
            </option>
          ))}
        </select>
      </div>

      <div className="event-log-rows">
        {filteredEvents.length === 0 ? (
          <div className="empty-state">No events</div>
        ) : (
          filteredEvents.slice(0, 350).map((event, index) => (
            <div key={`${event.ts_ms}-${event.event}-${index}`} className="event-row">
              <span className="mono dim">{new Date(event.ts_ms).toISOString().slice(11, 19)}</span>
              <span className={`event-level-tag ${levelClass(event.level)}`}>{event.level}</span>
              <span>{event.event}</span>
              <span className="dim">{event.player_id != null ? `P${event.player_id}` : "-"}</span>
              <span className="dim">{event.reason ?? ""}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
