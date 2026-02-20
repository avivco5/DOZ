const state = {
  players: [],
  arena: { width_m: 50, height_m: 30 },
  config: null,
  ws: null,
};

const statusEl = document.getElementById("status");
const canvas = document.getElementById("arenaCanvas");
const ctx = canvas.getContext("2d");
const tableBody = document.querySelector("#telemetryTable tbody");

const controls = {
  useSimPositions: document.getElementById("useSimPositions"),
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

function connectWs() {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
  state.ws = ws;

  ws.onopen = () => {
    statusEl.textContent = "WebSocket: connected";
  };

  ws.onclose = () => {
    statusEl.textContent = "WebSocket: disconnected, retrying";
    setTimeout(connectWs, 1000);
  };

  ws.onerror = () => {
    statusEl.textContent = "WebSocket: error";
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
      renderTable();
      drawArena();
    } else if (msg.type === "config") {
      state.config = msg.config;
      syncControlsFromConfig();
    }
  };
}

function sendWs(payload) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    return;
  }
  state.ws.send(JSON.stringify(payload));
}

function bindControls() {
  controls.useSimPositions.addEventListener("change", () => {
    sendWs({
      type: "set_config",
      values: { use_sim_positions: controls.useSimPositions.checked },
    });
  });

  controls.rangeSlider.addEventListener("change", () => {
    const val = Number(controls.rangeSlider.value);
    controls.rangeValue.textContent = val.toFixed(1);
    sendWs({ type: "set_config", values: { max_range_m: val } });
  });

  controls.coneSlider.addEventListener("change", () => {
    const val = Number(controls.coneSlider.value);
    controls.coneValue.textContent = val.toFixed(1);
    sendWs({ type: "set_config", values: { cone_half_angle_deg: val } });
  });

  controls.qualitySlider.addEventListener("change", () => {
    const val = Number(controls.qualitySlider.value);
    controls.qualityValue.textContent = String(val);
    sendWs({ type: "set_config", values: { quality_threshold: val } });
  });

  controls.speedSlider.addEventListener("change", () => {
    const val = Number(controls.speedSlider.value);
    controls.speedValue.textContent = val.toFixed(2);
    sendWs({ type: "set_config", values: { sim_speed_mps: val } });
  });

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

function colorForPlayer(id) {
  const palette = ["#1c8b7a", "#d97a17", "#2d6dcc", "#bb4f7a", "#5b8c31", "#7349ad"];
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

  ctx.fillStyle = "#f7faf7";
  ctx.fillRect(base.originX, base.originY, base.drawW, base.drawH);

  drawGrid(base, world);
  drawCones(base, world);
  drawTrails(base, world);
  drawPlayers(base, world);

  ctx.strokeStyle = "#65737a";
  ctx.lineWidth = 2;
  ctx.strokeRect(base.originX, base.originY, base.drawW, base.drawH);
}

function drawGrid(base, world) {
  ctx.strokeStyle = "#dce4dd";
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

function drawTrails(base, world) {
  for (const player of state.players) {
    if (!player.trail || player.trail.length < 2) {
      continue;
    }
    ctx.strokeStyle = player.online ? `${colorForPlayer(player.id)}66` : "#9aa3a955";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < player.trail.length; i++) {
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

function drawCones(base, world) {
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

    if (player.online) {
      ctx.fillStyle = `${colorForPlayer(player.id)}22`;
    } else {
      ctx.fillStyle = "#9ca7ad22";
    }
    ctx.fill();
  }
}

function drawPlayers(base, world) {
  const now = Date.now();

  for (const player of state.players) {
    const p = toCanvas(player.x_m, player.y_m, world);
    const color = player.online ? colorForPlayer(player.id) : "#9aa3a9";

    if (player.alert) {
      const pulse = 8 + 3 * Math.sin(now / 120);
      ctx.beginPath();
      ctx.arc(p.x, p.y, pulse, 0, 2 * Math.PI);
      ctx.strokeStyle = "#cc3125";
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

    ctx.fillStyle = "#1f2a30";
    ctx.font = `${Math.max(11, p.scale * 0.35)}px Segoe UI`;
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

    for (const c of cells) {
      const td = document.createElement("td");
      td.textContent = c;
      tr.appendChild(td);
    }

    tableBody.appendChild(tr);
  }
}

bindControls();
connectWs();
setInterval(drawArena, 120);
window.addEventListener("resize", drawArena);
