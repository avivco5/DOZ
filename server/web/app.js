const state = {
  players: [],
  arena: { width_m: 50, height_m: 30 },
  config: null,
  ws: null,
};

const statusEl = document.getElementById("status");
const clockUtcEl = document.getElementById("clockUtc");
const viewportEl = document.getElementById("arenaViewport");
const canvas = document.getElementById("arenaCanvas");
const ctx = canvas.getContext("2d");
const tableBody = document.querySelector("#telemetryTable tbody");
const terrainSourceEl = document.getElementById("terrainSource");

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

const terrain = {
  image: null,
  source: "generated",
  photoEnabled: true,
};

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
  img.src = `${src}?v=1`;
}

function connectWs() {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
  state.ws = ws;
  setLinkStatus("CONNECTING", "connecting");

  ws.onopen = () => {
    setLinkStatus("CONNECTED", "online");
  };

  ws.onclose = () => {
    setLinkStatus("RETRYING", "offline");
    setTimeout(connectWs, 1000);
  };

  ws.onerror = () => {
    setLinkStatus("ERROR", "error");
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "world_state") {
      state.players = msg.players || [];
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
      renderSummary();
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
  });

  controls.resetBtn.addEventListener("click", () => {
    sendWs({ type: "action", name: "reset_world" });
  });

  controls.pauseBtn.addEventListener("click", () => {
    sendWs({ type: "action", name: "pause_sim" });
  });

  controls.resumeBtn.addEventListener("click", () => {
    sendWs({ type: "action", name: "resume_sim" });
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
    base.originY + base.drawH * 0.52
  );
  ctx.quadraticCurveTo(
    base.originX + base.drawW * 0.62,
    base.originY + base.drawH * 0.46,
    base.originX + base.drawW * 0.9,
    base.originY + base.drawH * 0.24
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
      Number(player.yaw_deg || 0).toFixed(1),
      Number(player.pitch_deg || 0).toFixed(1),
      Number(player.roll_deg || 0).toFixed(1),
      String(player.quality ?? 0),
      player.last_seen_ms_ago == null ? "-" : String(player.last_seen_ms_ago),
      player.alert ? "on" : "off",
      String(player.alert_intensity ?? 0),
      player.pos_source || "sim",
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
updateTerrainSourceLabel();
drawArena();
updateClockUtc();
setInterval(updateClockUtc, 1000);
setInterval(drawArena, 120);
window.addEventListener("resize", drawArena);
