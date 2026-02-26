const state = {
  players: [],
  arena: { width_m: 50, height_m: 30 },
  config: null,
  ws: null,
  selectedPlayerId: null,
  worldTsMs: 0,
  previousPlayers: new Map(),
  eventLog: [],
  alertHistory: [],
};

const statusEl = document.getElementById("status");
const clockUtcEl = document.getElementById("clockUtc");
const viewportEl = document.getElementById("arenaViewport");
const canvas = document.getElementById("arenaCanvas");
const ctx = canvas.getContext("2d");
const tableBody = document.querySelector("#telemetryTable tbody");
const terrainSourceEl = document.getElementById("terrainSource");

const playersListEl = document.getElementById("playersList");
const playersOnlineStatEl = document.getElementById("playersOnlineStat");
const telemetryDetailEl = document.getElementById("telemetryDetail");
const selectedPlayerLabelEl = document.getElementById("selectedPlayerLabel");
const activeAlertsStatEl = document.getElementById("activeAlertsStat");
const activeAlertsListEl = document.getElementById("activeAlertsList");
const alertsHistoryListEl = document.getElementById("alertsHistoryList");
const eventLogEl = document.getElementById("eventLog");
const eventCountEl = document.getElementById("eventCount");

const controls = {
  useSimPositions: document.getElementById("useSimPositions"),
  photoToggle: document.getElementById("photoToggle"),
  view3DToggle: document.getElementById("view3DToggle"),
  rangeSlider: document.getElementById("rangeSlider"),
  coneSlider: document.getElementById("coneSlider"),
  qualitySlider: document.getElementById("qualitySlider"),
  speedSlider: document.getElementById("speedSlider"),
  rangeValue: document.getElementById("rangeValue"),
  coneValue: document.getElementById("coneValue"),
  qualityValue: document.getElementById("qualityValue"),
  speedValue: document.getElementById("speedValue"),
  randomizeBtn: document.getElementById("randomizeBtn"),
  resetBtn: document.getElementById("resetBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  resumeBtn: document.getElementById("resumeBtn"),
  arenaInfo: document.getElementById("arenaInfo"),
};

const kpis = {
  online: document.getElementById("kpiOnline"),
  alerts: document.getElementById("kpiAlerts"),
  quality: document.getElementById("kpiQuality"),
  mode: document.getElementById("kpiMode"),
  threat: document.getElementById("kpiThreat"),
};

const STATUS_CLASSES = ["connecting", "online", "offline", "error"];
const TERRAIN_SOURCES = [
  "/static/assets/arena-aerial.jpg",
  "/static/assets/arena-aerial.png",
  "/static/assets/arena-aerial.webp",
  "/static/assets/arena-aerial.svg",
];

const MAX_EVENT_ITEMS = 220;
const MAX_ALERT_HISTORY_ITEMS = 80;

const terrain = {
  image: null,
  source: "generated",
  photoEnabled: true,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setLinkStatus(text, cssClass) {
  statusEl.textContent = `Link: ${text}`;
  statusEl.classList.remove(...STATUS_CLASSES);
  statusEl.classList.add(cssClass);
}

function updateClockUtc() {
  const now = new Date();
  clockUtcEl.textContent = `UTC ${now.toISOString().slice(11, 19)}`;
}

function setToggleChipState(inputEl) {
  const chip = inputEl?.closest(".toggle-chip");
  if (!chip) {
    return;
  }
  chip.classList.toggle("active", Boolean(inputEl.checked));
}

function apply3DViewMode() {
  const enable3d = Boolean(controls.view3DToggle.checked);
  viewportEl.classList.toggle("is-3d", enable3d);
  viewportEl.classList.toggle("is-2d", !enable3d);
  setToggleChipState(controls.view3DToggle);
}

function updateTerrainSourceLabel() {
  if (terrain.photoEnabled && terrain.image) {
    const sourceName = terrain.source.split("/").pop() || "custom";
    terrainSourceEl.textContent = `Terrain source: ${sourceName} (aerial)`;
    return;
  }
  if (!terrain.photoEnabled) {
    terrainSourceEl.textContent = "Terrain source: tactical synthetic (aerial layer off)";
    return;
  }
  terrainSourceEl.textContent = "Terrain source: tactical synthetic";
}

function tryLoadTerrainSource(index = 0) {
  if (index >= TERRAIN_SOURCES.length) {
    terrain.image = null;
    terrain.source = "generated";
    updateTerrainSourceLabel();
    drawArena();
    return;
  }

  const src = TERRAIN_SOURCES[index];
  const img = new Image();
  img.onload = () => {
    terrain.image = img;
    terrain.source = src;
    updateTerrainSourceLabel();
    drawArena();
  };
  img.onerror = () => {
    tryLoadTerrainSource(index + 1);
  };
  img.src = `${src}?v=2`;
}

function formatLastSeen(ms) {
  if (ms == null) {
    return "-";
  }
  const val = Number(ms);
  if (!Number.isFinite(val)) {
    return "-";
  }
  if (val < 1000) {
    return `${Math.round(val)} ms`;
  }
  return `${(val / 1000).toFixed(1)} s`;
}

function formatConnectedFor(player) {
  if (player.connected_since_ms == null || state.worldTsMs <= 0) {
    return "-";
  }
  const elapsedMs = Math.max(0, state.worldTsMs - Number(player.connected_since_ms));
  const seconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function qualityBand(qualityValue) {
  const quality = Number(qualityValue || 0);
  if (quality >= 70) {
    return "good";
  }
  if (quality >= 35) {
    return "warn";
  }
  return "bad";
}

function batteryBand(player) {
  const batteryV = Number(player.battery_v ?? (player.battery_mv ? player.battery_mv / 1000 : 0));
  if (!Number.isFinite(batteryV) || batteryV <= 0) {
    return { cls: "", text: "-" };
  }
  if (batteryV >= 3.7) {
    return { cls: "good", text: `${batteryV.toFixed(2)}V` };
  }
  if (batteryV >= 3.4) {
    return { cls: "warn", text: `${batteryV.toFixed(2)}V` };
  }
  return { cls: "bad", text: `${batteryV.toFixed(2)}V` };
}

function playerConnectionState(player) {
  if (!player.online) {
    return { label: "offline", dot: "offline", badge: "offline" };
  }
  const ageMs = Number(player.last_seen_ms_ago ?? 0);
  if (ageMs > 1800) {
    return { label: "degraded", dot: "degraded", badge: "warn" };
  }
  return { label: "online", dot: "online", badge: "ok" };
}

function addEvent(level, name, details = "", tsMs = Date.now()) {
  state.eventLog.unshift({
    ts_ms: tsMs,
    level,
    name,
    details,
  });
  if (state.eventLog.length > MAX_EVENT_ITEMS) {
    state.eventLog.length = MAX_EVENT_ITEMS;
  }
}

function addAlertHistory(playerId, alertOn, intensity, tsMs) {
  state.alertHistory.unshift({
    ts_ms: tsMs,
    player_id: playerId,
    alert_on: alertOn,
    intensity,
  });
  if (state.alertHistory.length > MAX_ALERT_HISTORY_ITEMS) {
    state.alertHistory.length = MAX_ALERT_HISTORY_ITEMS;
  }
}

function logStateTransitions(players, tsMs) {
  const nextSnapshot = new Map();

  for (const player of players) {
    const prev = state.previousPlayers.get(player.id);
    if (!prev) {
      if (player.online) {
        addEvent("info", "player_online", `P${player.id} connected`, tsMs);
      }
      if (player.alert) {
        addEvent("warn", "alert_on", `P${player.id} intensity ${player.alert_intensity ?? 0}`, tsMs);
        addAlertHistory(player.id, true, player.alert_intensity ?? 0, tsMs);
      }
    } else {
      if (prev.online !== player.online) {
        addEvent(
          player.online ? "info" : "warn",
          player.online ? "player_online" : "player_offline",
          `P${player.id} ${player.online ? "connected" : "timed out"}`,
          tsMs,
        );
      }

      if (Boolean(prev.alert) !== Boolean(player.alert)) {
        addEvent(
          player.alert ? "warn" : "info",
          player.alert ? "alert_on" : "alert_off",
          `P${player.id} intensity ${player.alert_intensity ?? 0}`,
          tsMs,
        );
        addAlertHistory(player.id, Boolean(player.alert), player.alert_intensity ?? 0, tsMs);
      }

      const prevGps = Number(prev.gps_quality ?? 0);
      const nextGps = Number(player.gps_quality ?? 0);
      if (prevGps === 0 && nextGps > 0) {
        addEvent("info", "gps_lock", `P${player.id} GPS quality ${nextGps}`, tsMs);
      }

      const prevSource = prev.pos_source || "sim";
      const nextSource = player.pos_source || "sim";
      if (prevSource !== nextSource) {
        addEvent("debug", "position_source", `P${player.id}: ${prevSource} -> ${nextSource}`, tsMs);
      }
    }

    nextSnapshot.set(player.id, {
      online: Boolean(player.online),
      alert: Boolean(player.alert),
      gps_quality: Number(player.gps_quality ?? 0),
      pos_source: player.pos_source,
    });
  }

  for (const [playerId, prev] of state.previousPlayers.entries()) {
    if (!nextSnapshot.has(playerId) && prev.online) {
      addEvent("warn", "player_missing", `P${playerId} no longer in state`, tsMs);
    }
  }

  state.previousPlayers = nextSnapshot;
}

function connectWs() {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
  state.ws = ws;
  setLinkStatus("CONNECTING", "connecting");

  ws.onopen = () => {
    setLinkStatus("CONNECTED", "online");
    addEvent("info", "ws_connected", "WebSocket link active", Date.now());
    renderEventLog();
  };

  ws.onclose = () => {
    setLinkStatus("RETRYING", "offline");
    addEvent("warn", "ws_retry", "WebSocket disconnected, retrying", Date.now());
    renderEventLog();
    setTimeout(connectWs, 1000);
  };

  ws.onerror = () => {
    setLinkStatus("ERROR", "error");
    addEvent("error", "ws_error", "WebSocket transport error", Date.now());
    renderEventLog();
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "world_state") {
      const incomingPlayers = Array.isArray(msg.players) ? msg.players : [];
      state.worldTsMs = Number(msg.ts_ms || 0);
      logStateTransitions(incomingPlayers, Date.now());
      state.players = incomingPlayers;

      if (msg.arena) {
        state.arena = {
          width_m: Number(msg.arena.width_m || 50),
          height_m: Number(msg.arena.height_m || 30),
        };
      }

      if (msg.config) {
        state.config = msg.config;
        syncControlsFromConfig();
      }

      keepSelectionValid();
      renderSummary();
      renderPlayersList();
      renderTelemetryDetail();
      renderAlertsPanel();
      renderEventLog();
      renderTable();
      drawArena();
    } else if (msg.type === "config") {
      state.config = msg.config;
      syncControlsFromConfig();
      renderSummary();
    }
  };
}

function sendWs(payload) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    return;
  }
  state.ws.send(JSON.stringify(payload));
}

function bindSlider(sliderEl, valueEl, formatter, key) {
  sliderEl.addEventListener("input", () => {
    valueEl.textContent = formatter(Number(sliderEl.value));
  });

  sliderEl.addEventListener("change", () => {
    const val = Number(sliderEl.value);
    valueEl.textContent = formatter(val);
    sendWs({ type: "set_config", values: { [key]: val } });
  });
}

function bindControls() {
  controls.useSimPositions.addEventListener("change", () => {
    sendWs({
      type: "set_config",
      values: { use_sim_positions: controls.useSimPositions.checked },
    });
    renderSummary();
  });

  controls.photoToggle.addEventListener("change", () => {
    terrain.photoEnabled = Boolean(controls.photoToggle.checked);
    setToggleChipState(controls.photoToggle);
    updateTerrainSourceLabel();
    drawArena();
  });

  controls.view3DToggle.addEventListener("change", () => {
    apply3DViewMode();
    drawArena();
  });

  setToggleChipState(controls.photoToggle);
  setToggleChipState(controls.view3DToggle);
  apply3DViewMode();

  bindSlider(controls.rangeSlider, controls.rangeValue, (val) => val.toFixed(1), "max_range_m");
  bindSlider(controls.coneSlider, controls.coneValue, (val) => val.toFixed(1), "cone_half_angle_deg");
  bindSlider(controls.qualitySlider, controls.qualityValue, (val) => String(val), "quality_threshold");
  bindSlider(controls.speedSlider, controls.speedValue, (val) => val.toFixed(2), "sim_speed_mps");

  controls.randomizeBtn.addEventListener("click", () => {
    sendWs({ type: "action", name: "randomize_positions" });
    addEvent("info", "action", "randomize_positions", Date.now());
    renderEventLog();
  });

  controls.resetBtn.addEventListener("click", () => {
    sendWs({ type: "action", name: "reset_world" });
    addEvent("warn", "action", "reset_world", Date.now());
    renderEventLog();
  });

  controls.pauseBtn.addEventListener("click", () => {
    sendWs({ type: "action", name: "pause_sim" });
    addEvent("info", "action", "pause_sim", Date.now());
    renderEventLog();
  });

  controls.resumeBtn.addEventListener("click", () => {
    sendWs({ type: "action", name: "resume_sim" });
    addEvent("info", "action", "resume_sim", Date.now());
    renderEventLog();
  });
}

function syncControlsFromConfig() {
  if (!state.config) {
    return;
  }
  controls.useSimPositions.checked = Boolean(state.config.use_sim_positions);

  controls.rangeSlider.value = String(state.config.max_range_m ?? 15);
  controls.coneSlider.value = String(state.config.cone_half_angle_deg ?? 6);
  controls.qualitySlider.value = String(state.config.quality_threshold ?? 35);
  controls.speedSlider.value = String(state.config.sim_speed_mps ?? 0.4);

  controls.rangeValue.textContent = Number(controls.rangeSlider.value).toFixed(1);
  controls.coneValue.textContent = Number(controls.coneSlider.value).toFixed(1);
  controls.qualityValue.textContent = String(Number(controls.qualitySlider.value));
  controls.speedValue.textContent = Number(controls.speedSlider.value).toFixed(2);

  controls.arenaInfo.textContent = `Arena: ${state.arena.width_m.toFixed(1)}m x ${state.arena.height_m.toFixed(1)}m`;
}

function classifyThreatLevel(alertCount, onlineCount, totalCount, avgQuality) {
  if (alertCount >= 2 || (totalCount > 0 && onlineCount === 0)) {
    return { label: "RED", level: "critical" };
  }
  if (alertCount === 1 || avgQuality < 30) {
    return { label: "AMBER", level: "warning" };
  }
  return { label: "GREEN", level: "normal" };
}

function renderSummary() {
  const total = state.players.length;
  const online = state.players.filter((player) => player.online).length;
  const alerts = state.players.filter((player) => player.alert).length;
  const avgQuality = total
    ? state.players.reduce((sum, player) => sum + Number(player.quality ?? 0), 0) / total
    : 0;

  kpis.online.textContent = `${online}/${total}`;
  kpis.alerts.textContent = String(alerts);
  kpis.quality.textContent = `${avgQuality.toFixed(1)}%`;
  kpis.mode.textContent = controls.useSimPositions.checked ? "SIM TRACK" : "LIVE TRACK";

  const threat = classifyThreatLevel(alerts, online, total, avgQuality);
  kpis.threat.textContent = threat.label;
  kpis.threat.dataset.level = threat.level;
}

function sortedPlayers(players) {
  return [...players].sort((a, b) => {
    if (a.alert && !b.alert) {
      return -1;
    }
    if (!a.alert && b.alert) {
      return 1;
    }
    if (a.online && !b.online) {
      return -1;
    }
    if (!a.online && b.online) {
      return 1;
    }
    return a.id - b.id;
  });
}

function keepSelectionValid() {
  const selectedExists = state.players.some((player) => player.id === state.selectedPlayerId);
  if (selectedExists) {
    return;
  }
  const sorted = sortedPlayers(state.players);
  state.selectedPlayerId = sorted.length ? sorted[0].id : null;
}

function renderPlayersList() {
  const sorted = sortedPlayers(state.players);
  const online = state.players.filter((player) => player.online).length;
  playersOnlineStatEl.textContent = `${online}/${state.players.length} online`;

  if (!sorted.length) {
    playersListEl.innerHTML = '<div class="telemetry-detail empty">No player data</div>';
    return;
  }

  playersListEl.innerHTML = sorted
    .map((player) => {
      const connection = playerConnectionState(player);
      const battery = batteryBand(player);
      const qualityClass = qualityBand(player.quality);
      const selectedClass = state.selectedPlayerId === player.id ? " selected" : "";
      const alertClass = player.alert ? " alerting" : "";
      const qualityPercent = `${Number(player.quality ?? 0).toFixed(0)}%`;
      const rxHz = Number(player.packet_rate_hz ?? 0).toFixed(1);

      return `
        <button type="button" class="player-card${selectedClass}${alertClass}" data-player-id="${player.id}">
          <div class="player-head">
            <div class="player-id">
              <span class="player-dot ${connection.dot}"></span>
              <span>P${player.id}</span>
            </div>
            <span class="conn-badge ${connection.badge}">${connection.label}</span>
          </div>
          <div class="player-grid">
            <div class="player-metric"><span>Last Seen</span><span>${formatLastSeen(player.last_seen_ms_ago)}</span></div>
            <div class="player-metric"><span>Rx</span><span>${rxHz} Hz</span></div>
            <div class="player-metric"><span>Battery</span><span class="${battery.cls}">${battery.text}</span></div>
            <div class="player-metric"><span>RF</span><span class="${qualityClass}">${qualityPercent}</span></div>
            <div class="player-metric"><span>Yaw</span><span>${Number(player.yaw_deg ?? 0).toFixed(0)}°</span></div>
            <div class="player-metric"><span>GPS</span><span>${Number(player.gps_quality ?? 0)}</span></div>
          </div>
        </button>
      `;
    })
    .join("");

  const cards = playersListEl.querySelectorAll(".player-card");
  for (const card of cards) {
    card.addEventListener("click", () => {
      const playerId = Number(card.getAttribute("data-player-id"));
      state.selectedPlayerId = playerId;
      renderPlayersList();
      renderTelemetryDetail();
      drawArena();
    });
  }
}

function telemetryRow(label, value) {
  return `<div class="telemetry-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;
}

function renderTelemetryDetail() {
  const selected = state.players.find((player) => player.id === state.selectedPlayerId);
  if (!selected) {
    selectedPlayerLabelEl.textContent = "none";
    telemetryDetailEl.classList.add("empty");
    telemetryDetailEl.textContent = "Select a player to view detailed telemetry";
    return;
  }

  selectedPlayerLabelEl.textContent = `P${selected.id}`;
  telemetryDetailEl.classList.remove("empty");

  const battery = batteryBand(selected);
  const qualityPct = `${Number(selected.quality ?? 0).toFixed(0)}%`;
  const position = `${Number(selected.x_m ?? 0).toFixed(2)}, ${Number(selected.y_m ?? 0).toFixed(2)} m`;
  const gpsLat = selected.gps_lat_deg == null ? "-" : Number(selected.gps_lat_deg).toFixed(7);
  const gpsLon = selected.gps_lon_deg == null ? "-" : Number(selected.gps_lon_deg).toFixed(7);
  const gpsAlt = selected.gps_alt_m == null ? "-" : `${Number(selected.gps_alt_m).toFixed(2)} m`;

  telemetryDetailEl.innerHTML = `
    <div class="telemetry-group">
      <p class="telemetry-group-title">Connectivity</p>
      ${telemetryRow("State", playerConnectionState(selected).label)}
      ${telemetryRow("Last Seen", formatLastSeen(selected.last_seen_ms_ago))}
      ${telemetryRow("Connected For", formatConnectedFor(selected))}
      ${telemetryRow("Address", selected.addr || "-")}
      ${telemetryRow("Packet Rate", `${Number(selected.packet_rate_hz ?? 0).toFixed(2)} Hz`)}
    </div>
    <div class="telemetry-group">
      <p class="telemetry-group-title">Attitude / Alert</p>
      ${telemetryRow("Yaw", `${Number(selected.yaw_deg ?? 0).toFixed(1)} deg`)}
      ${telemetryRow("Pitch", `${Number(selected.pitch_deg ?? 0).toFixed(1)} deg`)}
      ${telemetryRow("Roll", `${Number(selected.roll_deg ?? 0).toFixed(1)} deg`)}
      ${telemetryRow("Alert", selected.alert ? `ON (${Number(selected.alert_intensity ?? 0)})` : "OFF")}
    </div>
    <div class="telemetry-group">
      <p class="telemetry-group-title">RF / Power</p>
      ${telemetryRow("Quality", qualityPct)}
      ${telemetryRow("Battery", battery.text)}
      ${telemetryRow("Seq Drops", String(Number(selected.seq_drop_count ?? 0)))}
    </div>
    <div class="telemetry-group">
      <p class="telemetry-group-title">Position / GPS</p>
      ${telemetryRow("Position", position)}
      ${telemetryRow("Source", selected.pos_source || "sim")}
      ${telemetryRow("Pos Quality", String(Number(selected.pos_quality ?? 0)))}
      ${telemetryRow("GPS Quality", String(Number(selected.gps_quality ?? 0)))}
      ${telemetryRow("GPS Lat", gpsLat)}
      ${telemetryRow("GPS Lon", gpsLon)}
      ${telemetryRow("GPS Alt", gpsAlt)}
    </div>
  `;
}

function renderAlertsPanel() {
  const active = sortedPlayers(state.players).filter((player) => player.alert);
  activeAlertsStatEl.textContent = `${active.length} active`;

  if (!active.length) {
    activeAlertsListEl.classList.add("empty");
    activeAlertsListEl.textContent = "No active alerts";
  } else {
    activeAlertsListEl.classList.remove("empty");
    activeAlertsListEl.innerHTML = active
      .map((player) => {
        const age = formatLastSeen(player.last_seen_ms_ago);
        return `
          <div class="alert-item">
            <div class="alert-item-head">
              <span>P${player.id} alert</span>
              <span>${Number(player.alert_intensity ?? 0)}</span>
            </div>
            <div class="alert-item-meta">last seen ${age} · quality ${Number(player.quality ?? 0).toFixed(0)}%</div>
          </div>
        `;
      })
      .join("");
  }

  if (!state.alertHistory.length) {
    alertsHistoryListEl.classList.add("empty");
    alertsHistoryListEl.textContent = "No alert history yet";
  } else {
    alertsHistoryListEl.classList.remove("empty");
    alertsHistoryListEl.innerHTML = state.alertHistory
      .slice(0, 24)
      .map((evt) => {
        const ts = new Date(evt.ts_ms).toISOString().slice(11, 19);
        return `
          <div class="alert-history-item">
            <span class="time">${ts}</span>
            <span>P${evt.player_id}</span>
            <span class="${evt.alert_on ? "level" : "state-off"}">${evt.alert_on ? "ON" : "OFF"}</span>
            <span>${Number(evt.intensity ?? 0)}</span>
          </div>
        `;
      })
      .join("");
  }
}

function renderEventLog() {
  eventCountEl.textContent = `${state.eventLog.length} events`;

  if (!state.eventLog.length) {
    eventLogEl.classList.add("empty");
    eventLogEl.textContent = "No events yet";
    return;
  }

  eventLogEl.classList.remove("empty");
  eventLogEl.innerHTML = state.eventLog
    .slice(0, 120)
    .map((evt) => {
      const ts = new Date(evt.ts_ms).toISOString().slice(11, 19);
      const levelClass = evt.level === "warn" || evt.level === "error" ? evt.level : "";
      return `
        <div class="event-item">
          <span class="event-time">${ts}</span>
          <span class="event-level ${levelClass}">${escapeHtml(evt.level || "info")}</span>
          <span class="event-name">${escapeHtml(evt.name || "event")}</span>
          <span class="event-details">${escapeHtml(evt.details || "")}</span>
        </div>
      `;
    })
    .join("");
}

function colorForPlayer(id) {
  const palette = ["#5cd8ff", "#8df578", "#ffd166", "#ff8d66", "#c6a9ff", "#5ee7d1"];
  return palette[(id - 1) % palette.length];
}

function toCanvas(x_m, y_m, world) {
  const margin = 28;
  const w = world.width;
  const h = world.height;
  const sx = (canvas.width - 2 * margin) / w;
  const sy = (canvas.height - 2 * margin) / h;
  const scale = Math.min(sx, sy);

  const drawW = w * scale;
  const drawH = h * scale;
  const originX = (canvas.width - drawW) / 2;
  const originY = (canvas.height - drawH) / 2;

  return {
    x: originX + x_m * scale,
    y: originY + (h - y_m) * scale,
    scale,
    originX,
    originY,
    drawW,
    drawH,
  };
}

function drawArena() {
  const dpr = window.devicePixelRatio || 1;
  const cssW = Math.max(200, canvas.clientWidth);
  const cssH = Math.max(200, canvas.clientHeight);
  const wantW = Math.floor(cssW * dpr);
  const wantH = Math.floor(cssH * dpr);
  if (canvas.width !== wantW || canvas.height !== wantH) {
    canvas.width = wantW;
    canvas.height = wantH;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const world = { width: state.arena.width_m || 50, height: state.arena.height_m || 30 };
  const base = toCanvas(0, 0, world);

  drawTerrain(base);
  drawGrid(world);
  drawCones(world);
  drawTrails(world);
  drawPlayers(world);

  ctx.strokeStyle = "#4f6870";
  ctx.lineWidth = 2;
  ctx.strokeRect(base.originX, base.originY, base.drawW, base.drawH);
}

function drawSyntheticTerrain(base) {
  const gradient = ctx.createLinearGradient(base.originX, base.originY, base.originX, base.originY + base.drawH);
  gradient.addColorStop(0, "#102126");
  gradient.addColorStop(0.45, "#12262b");
  gradient.addColorStop(1, "#0b191f");
  ctx.fillStyle = gradient;
  ctx.fillRect(base.originX, base.originY, base.drawW, base.drawH);

  ctx.strokeStyle = "rgba(173, 149, 109, 0.33)";
  ctx.lineWidth = Math.max(2, base.drawW * 0.007);
  ctx.beginPath();
  ctx.moveTo(base.originX + base.drawW * 0.08, base.originY + base.drawH * 0.78);
  ctx.quadraticCurveTo(
    base.originX + base.drawW * 0.25,
    base.originY + base.drawH * 0.58,
    base.originX + base.drawW * 0.46,
    base.originY + base.drawH * 0.52,
  );
  ctx.quadraticCurveTo(
    base.originX + base.drawW * 0.62,
    base.originY + base.drawH * 0.46,
    base.originX + base.drawW * 0.9,
    base.originY + base.drawH * 0.24,
  );
  ctx.stroke();

  ctx.fillStyle = "rgba(41, 84, 63, 0.28)";
  for (let i = 0; i < 18; i += 1) {
    const t = i + 1;
    const x = base.originX + base.drawW * (((Math.sin(t * 12.3) * 0.5) + 0.5) * 0.95);
    const y = base.originY + base.drawH * (((Math.cos(t * 5.7) * 0.5) + 0.5) * 0.95);
    const r = Math.max(10, base.drawW * (0.015 + ((t % 7) * 0.002)));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTerrain(base) {
  if (terrain.photoEnabled && terrain.image) {
    ctx.save();
    ctx.globalAlpha = 0.78;
    ctx.drawImage(terrain.image, base.originX, base.originY, base.drawW, base.drawH);
    ctx.restore();
  } else {
    drawSyntheticTerrain(base);
  }

  const shade = ctx.createLinearGradient(base.originX, base.originY, base.originX, base.originY + base.drawH);
  shade.addColorStop(0, "rgba(5, 10, 13, 0.16)");
  shade.addColorStop(1, "rgba(4, 9, 12, 0.46)");
  ctx.fillStyle = shade;
  ctx.fillRect(base.originX, base.originY, base.drawW, base.drawH);
}

function drawGrid(world) {
  ctx.strokeStyle = "#203844";
  ctx.lineWidth = 1;

  const step = 5;
  for (let x = 0; x <= world.width; x += step) {
    const p0 = toCanvas(x, 0, world);
    const p1 = toCanvas(x, world.height, world);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }

  for (let y = 0; y <= world.height; y += step) {
    const p0 = toCanvas(0, y, world);
    const p1 = toCanvas(world.width, y, world);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
}

function drawTrails(world) {
  for (const player of state.players) {
    if (!player.trail || player.trail.length < 2) {
      continue;
    }
    ctx.strokeStyle = player.online ? `${colorForPlayer(player.id)}66` : "#6f7d8455";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < player.trail.length; i += 1) {
      const pt = player.trail[i];
      const p = toCanvas(pt[0], pt[1], world);
      if (i === 0) {
        ctx.moveTo(p.x, p.y);
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
    ctx.stroke();
  }
}

function drawCones(world) {
  const maxRange = Number(state.config?.max_range_m ?? 15);
  const coneHalf = Number(state.config?.cone_half_angle_deg ?? 6);

  for (const player of state.players) {
    const center = toCanvas(player.x_m, player.y_m, world);
    const radiusPx = maxRange * center.scale;
    const yaw = (player.yaw_deg || 0) * Math.PI / 180;
    const cone = coneHalf * Math.PI / 180;

    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.arc(center.x, center.y, radiusPx, -yaw - cone, -yaw + cone, false);
    ctx.closePath();
    ctx.fillStyle = player.online ? `${colorForPlayer(player.id)}22` : "#7d8b9422";
    ctx.fill();
  }
}

function drawPlayers(world) {
  const now = Date.now();

  for (const player of state.players) {
    const p = toCanvas(player.x_m, player.y_m, world);
    const color = player.online ? colorForPlayer(player.id) : "#86979f";

    if (player.alert) {
      const pulse = 8 + 3 * Math.sin(now / 120);
      ctx.beginPath();
      ctx.arc(p.x, p.y, pulse, 0, 2 * Math.PI);
      ctx.strokeStyle = "#ff6256";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (state.selectedPlayerId === player.id) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 11, 0, 2 * Math.PI);
      ctx.strokeStyle = "#96f0ff";
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();

    const yaw = (player.yaw_deg || 0) * Math.PI / 180;
    const arrowLen = Math.max(12, 1.8 * p.scale);
    const ax = p.x + Math.cos(yaw) * arrowLen;
    const ay = p.y - Math.sin(yaw) * arrowLen;

    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(ax, ay);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    const left = yaw + Math.PI * 0.83;
    const right = yaw - Math.PI * 0.83;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + Math.cos(left) * 6, ay - Math.sin(left) * 6);
    ctx.lineTo(ax + Math.cos(right) * 6, ay - Math.sin(right) * 6);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    ctx.fillStyle = "#dce7ea";
    ctx.font = `${Math.max(11, p.scale * 0.35)}px Bahnschrift`;
    ctx.fillText(`P${player.id}`, p.x + 8, p.y - 8);
  }
}

function renderTable() {
  tableBody.innerHTML = "";
  for (const player of state.players) {
    const tr = document.createElement("tr");
    if (!player.online) {
      tr.classList.add("offline");
    }
    if (player.alert) {
      tr.classList.add("row-alert");
    }

    const cells = [
      `P${player.id}`,
      player.online ? "yes" : "no",
      formatLastSeen(player.last_seen_ms_ago),
      player.battery_v == null ? "-" : `${Number(player.battery_v).toFixed(2)}V`,
      `${Number(player.packet_rate_hz ?? 0).toFixed(2)}`,
      String(Number(player.quality ?? 0).toFixed(0)),
      Number(player.yaw_deg || 0).toFixed(1),
      Number(player.pitch_deg || 0).toFixed(1),
      Number(player.roll_deg || 0).toFixed(1),
      player.alert ? "on" : "off",
      String(player.alert_intensity ?? 0),
      player.pos_source || "sim",
      String(player.seq_drop_count ?? 0),
      player.addr || "-",
      String(player.gps_quality ?? 0),
      player.gps_lat_deg == null ? "-" : Number(player.gps_lat_deg).toFixed(7),
      player.gps_lon_deg == null ? "-" : Number(player.gps_lon_deg).toFixed(7),
      player.gps_alt_m == null ? "-" : Number(player.gps_alt_m).toFixed(2),
      Number(player.x_m || 0).toFixed(2),
      Number(player.y_m || 0).toFixed(2),
    ];

    for (const cellText of cells) {
      const td = document.createElement("td");
      td.textContent = cellText;
      tr.appendChild(td);
    }
    tableBody.appendChild(tr);
  }
}

bindControls();
tryLoadTerrainSource();
connectWs();
renderSummary();
renderPlayersList();
renderTelemetryDetail();
renderAlertsPanel();
renderEventLog();
renderTable();
updateTerrainSourceLabel();
drawArena();
updateClockUtc();
setInterval(updateClockUtc, 1000);
setInterval(drawArena, 120);
window.addEventListener("resize", drawArena);
