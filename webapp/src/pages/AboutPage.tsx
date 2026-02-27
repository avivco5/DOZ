import type { ConsoleDataModel } from "../hooks/useConsoleData";

interface AboutPageProps {
  model: ConsoleDataModel;
}

export function AboutPage({ model }: AboutPageProps): JSX.Element {
  return (
    <div className="content-page">
      <section className="panel page-panel">
        <div className="panel-title-row">
          <h2>Build Information</h2>
        </div>

        <div className="about-grid">
          <div>Frontend build</div>
          <div className="mono">Vite + React + TypeScript</div>

          <div>Backend status</div>
          <div className="mono">{model.healthStatus}</div>

          <div>Server version</div>
          <div className="mono">{model.serverVersion}</div>

          <div>WebSocket state</div>
          <div className="mono">{model.wsState}</div>

          <div>Mock mode</div>
          <div className="mono">{model.isMockMode ? "enabled" : "disabled"}</div>
        </div>
      </section>

      <section className="panel page-panel">
        <div className="panel-title-row">
          <h2>Safety Scope</h2>
        </div>
        <ul className="safe-list">
          <li>This software is training-only and non-lethal.</li>
          <li>No targeting, firing, interception, or weapon control is implemented.</li>
          <li>The console visualizes telemetry and situational-awareness cues only.</li>
          <li>Not certified for safety-critical decision-making.</li>
        </ul>
      </section>

      <section className="panel page-panel">
        <div className="panel-title-row">
          <h2>Repository Docs</h2>
        </div>
        <ul className="safe-list">
          <li>
            <a href="https://github.com/avivco5/DOZ/blob/main/docs/RUN.md" target="_blank" rel="noreferrer">
              docs/RUN.md
            </a>
          </li>
          <li>
            <a href="https://github.com/avivco5/DOZ/blob/main/docs/ARCHITECTURE.md" target="_blank" rel="noreferrer">
              docs/ARCHITECTURE.md
            </a>
          </li>
          <li>
            <a href="https://github.com/avivco5/DOZ/blob/main/docs/PACKET_SPEC.md" target="_blank" rel="noreferrer">
              docs/PACKET_SPEC.md
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}
