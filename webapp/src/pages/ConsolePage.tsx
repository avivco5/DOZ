import { AlertsPanel } from "../components/AlertsPanel";
import { ArenaPanel } from "../components/ArenaPanel";
import { EventLogPanel } from "../components/EventLogPanel";
import { PlayerListPanel } from "../components/PlayerListPanel";
import { RecordingControls } from "../components/RecordingControls";
import { TelemetryPanel } from "../components/TelemetryPanel";
import type { ConsoleDataModel } from "../hooks/useConsoleData";

interface ConsolePageProps {
  model: ConsoleDataModel;
}

export function ConsolePage({ model }: ConsolePageProps): JSX.Element {
  const nowMs = model.world.server_time_ms || Date.now();

  return (
    <div className="console-layout">
      <div className="left-column">
        <PlayerListPanel
          players={model.world.players}
          selectedPlayerId={model.selectedPlayerId}
          onSelectPlayer={model.setSelectedPlayerId}
          onAddSimPlayer={() => {
            void model.addSimPlayerAction();
          }}
          onRemoveSimPlayer={() => {
            void model.removeSimPlayerAction();
          }}
          nowMs={nowMs}
        />
        <RecordingControls model={model} />
      </div>

      <div className="center-column">
        <ArenaPanel
          players={model.world.players}
          obstacles={model.world.obstacles}
          selectedPlayerId={model.selectedPlayerId}
          onSelectPlayer={model.setSelectedPlayerId}
        />
      </div>

      <div className="right-column">
        <TelemetryPanel player={model.selectedPlayer} nowMs={nowMs} />
        <AlertsPanel players={model.world.players} events={model.eventLog} />
      </div>

      <EventLogPanel events={model.eventLog} />
    </div>
  );
}
