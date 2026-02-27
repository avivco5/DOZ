import { useState } from "react";
import type { ConsoleDataModel } from "../hooks/useConsoleData";
import { CheckIcon, CircleIcon, CopyIcon, SquareIcon } from "./icons";

interface RecordingControlsProps {
  model: ConsoleDataModel;
}

async function copyToClipboard(value: string): Promise<void> {
  if (!navigator.clipboard) {
    return;
  }
  await navigator.clipboard.writeText(value);
}

export function RecordingControls({ model }: RecordingControlsProps): JSX.Element {
  const [copiedPath, setCopiedPath] = useState<string>("");

  return (
    <section className="panel recording-panel">
      <div className="panel-title-row">
        <h2>Recording</h2>
      </div>

      <div className="recording-buttons">
        <button
          type="button"
          className="btn record-btn start"
          onClick={() => {
            void model.startRecordingAction();
          }}
          disabled={model.world.recording.active}
        >
          <CircleIcon size={10} />
          Start Recording
        </button>

        <button
          type="button"
          className="btn record-btn stop"
          onClick={() => {
            void model.stopRecordingAction();
          }}
          disabled={!model.world.recording.active}
        >
          <SquareIcon size={10} />
          Stop Recording
        </button>
      </div>

      {model.recordingResult != null && (
        <div className="recording-result">
          <p>
            <strong>Session:</strong> {model.recordingResult.session_id ?? "-"}
          </p>
          {(model.recordingResult.files ?? []).map((filePath) => (
            <div key={filePath} className="recording-file-row">
              <span className="mono">{filePath}</span>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  void copyToClipboard(filePath).then(() => {
                    setCopiedPath(filePath);
                    window.setTimeout(() => {
                      setCopiedPath((prev) => (prev === filePath ? "" : prev));
                    }, 1200);
                  });
                }}
                aria-label="Copy file path"
              >
                {copiedPath === filePath ? <CheckIcon size={12} className="ok" /> : <CopyIcon size={12} />}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
