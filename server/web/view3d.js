import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const state = {
  players: [],
  arena: { width_m: 50, height_m: 30 },
  config: {
    max_range_m: 15,
    cone_half_angle_deg: 6,
    quality_threshold: 35,
  },
  ws: null,
  selectedPlayerId: null,
};

const hud = {
  statusPill: document.getElementById("statusPill"),
  clock: document.getElementById("clock3d"),
  online: document.getElementById("hudOnline"),
  alerts: document.getElementById("hudAlerts"),
  threat: document.getElementById("hudThreat"),
  config: document.getElementById("hudConfig"),
  arenaInfo: document.getElementById("arenaInfo"),
};

const terrain = {
  source: "synthetic",
  texture: null,
};

const TERRAIN_SOURCES = [
  "/static/assets/arena-aerial.jpg",
  "/static/assets/arena-aerial.png",
  "/static/assets/arena-aerial.webp",
  "/static/assets/arena-aerial.svg",
];

const PLAYER_COLORS = [0x5cd8ff, 0x8df578, 0xffd166, 0xff8d66, 0xc6a9ff, 0x5ee7d1];
const STATUS_CLASSES = ["connecting", "online", "offline", "error"];

const canvas = document.getElementById("canvas3d");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1218);
scene.fog = new THREE.Fog(0x0a1218, 70, 220);

const camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 600);
camera.position.set(65, 48, 72);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 18;
controls.maxDistance = 230;

const hemiLight = new THREE.HemisphereLight(0xb6d5ff, 0x24311f, 0.45);
scene.add(hemiLight);

const ambient = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff3d8, 1.1);
sun.position.set(90, 120, 45);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 320;
sun.shadow.camera.left = -120;
sun.shadow.camera.right = 120;
sun.shadow.camera.top = 120;
sun.shadow.camera.bottom = -120;
scene.add(sun);

const worldGroup = new THREE.Group();
scene.add(worldGroup);

const sceneryGroup = new THREE.Group();
scene.add(sceneryGroup);

const dynamicGroup = new THREE.Group();
scene.add(dynamicGroup);

const playerMeshes = new Map();

let groundMesh = null;
let gridHelper = null;
let boundaryLine = null;

function seededRandom(seed) {
  const x = Math.sin(seed * 1973.171) * 43758.5453;
  return x - Math.floor(x);
}

function setLinkStatus(text, cssClass) {
  hud.statusPill.textContent = `Link: ${text}`;
  hud.statusPill.classList.remove(...STATUS_CLASSES);
  hud.statusPill.classList.add(cssClass);
}

function updateClock() {
  hud.clock.textContent = `UTC ${new Date().toISOString().slice(11, 19)}`;
}

function updateHudStats() {
  const total = state.players.length;
  const online = state.players.filter((p) => p.online).length;
  const alerts = state.players.filter((p) => p.alert).length;
  const avgQuality = total
    ? state.players.reduce((sum, p) => sum + Number(p.quality ?? 0), 0) / total
    : 0;

  hud.online.textContent = `${online}/${total}`;
  hud.alerts.textContent = String(alerts);
  hud.config.textContent = `R:${Number(state.config.max_range_m).toFixed(1)}m A:${Number(
    state.config.cone_half_angle_deg
  ).toFixed(1)}deg Q:${Number(state.config.quality_threshold).toFixed(0)}`;
  hud.arenaInfo.textContent = `Arena: ${state.arena.width_m.toFixed(1)}m x ${state.arena.height_m.toFixed(
    1
  )}m | Terrain: ${terrain.source}`;

  let threatLabel = "GREEN";
  let threatLevel = "normal";
  if (alerts >= 2 || (total > 0 && online === 0)) {
    threatLabel = "RED";
    threatLevel = "critical";
  } else if (alerts === 1 || avgQuality < 30) {
    threatLabel = "AMBER";
    threatLevel = "warning";
  }
  hud.threat.textContent = threatLabel;
  hud.threat.dataset.level = threatLevel;
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
      state.players = (msg.players || []).map((p) => ({
        id: Number(p.id),
        x_m: Number(p.x_m || 0),
        y_m: Number(p.y_m || 0),
        yaw_deg: Number(p.yaw_deg || 0),
        online: Boolean(p.online),
        quality: Number(p.quality || 0),
        alert: Boolean(p.alert),
        alert_intensity: Number(p.alert_intensity || 0),
        gps_quality: Number(p.gps_quality || 0),
        gps_lat_deg: p.gps_lat_deg == null ? null : Number(p.gps_lat_deg),
        gps_lon_deg: p.gps_lon_deg == null ? null : Number(p.gps_lon_deg),
        gps_alt_m: p.gps_alt_m == null ? null : Number(p.gps_alt_m),
        trail: Array.isArray(p.trail) ? p.trail : [],
      }));
      if (msg.arena) {
        const newArena = {
          width_m: Number(msg.arena.width_m || 50),
          height_m: Number(msg.arena.height_m || 30),
        };
        const arenaChanged =
          newArena.width_m !== state.arena.width_m || newArena.height_m !== state.arena.height_m;
        state.arena = newArena;
        if (arenaChanged) {
          rebuildArena();
        }
      }
      if (msg.config) {
        state.config = {
          ...state.config,
          ...msg.config,
        };
      }
      updateHudStats();
    } else if (msg.type === "config") {
      state.config = {
        ...state.config,
        ...msg.config,
      };
      updateHudStats();
    }
  };
}

function loadTexture(url) {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.load(url, resolve, undefined, reject);
  });
}

async function loadTerrainTexture() {
  for (const src of TERRAIN_SOURCES) {
    try {
      const texture = await loadTexture(`${src}?v=2`);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      terrain.texture = texture;
      terrain.source = src.split("/").pop() || "aerial";
      if (groundMesh?.material) {
        groundMesh.material.map = texture;
        groundMesh.material.color.set(0xffffff);
        groundMesh.material.needsUpdate = true;
      }
      updateHudStats();
      return;
    } catch (_) {
      // Try next candidate.
    }
  }

  terrain.texture = null;
  terrain.source = "synthetic";
  if (groundMesh?.material) {
    groundMesh.material.map = null;
    groundMesh.material.color.set(0x172029);
    groundMesh.material.needsUpdate = true;
  }
  updateHudStats();
}

function disposeObject3D(object) {
  object.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose();
    }
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else {
        child.material.dispose();
      }
    }
    if (child.texture) {
      child.texture.dispose();
    }
  });
}

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children[0];
    group.remove(child);
    disposeObject3D(child);
  }
}

function createTree(x, z, scale = 1) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14 * scale, 0.19 * scale, 1.25 * scale, 8),
    new THREE.MeshStandardMaterial({ color: 0x553f2e, roughness: 0.95 })
  );
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  trunk.position.set(x, 0.6 * scale, z);

  const foliage = new THREE.Mesh(
    new THREE.ConeGeometry(0.85 * scale, 2.35 * scale, 10),
    new THREE.MeshStandardMaterial({ color: 0x274e31, roughness: 0.88 })
  );
  foliage.castShadow = true;
  foliage.receiveShadow = true;
  foliage.position.set(x, 2 * scale, z);

  const group = new THREE.Group();
  group.add(trunk);
  group.add(foliage);
  return group;
}

function createTent(x, z, w, h) {
  const group = new THREE.Group();

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(w, 1.2, h),
    new THREE.MeshStandardMaterial({ color: 0x3c4a3e, roughness: 0.85 })
  );
  base.castShadow = true;
  base.receiveShadow = true;
  base.position.y = 0.62;

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(Math.max(w, h) * 0.68, 1.2, 4),
    new THREE.MeshStandardMaterial({ color: 0x596148, roughness: 0.78 })
  );
  roof.castShadow = true;
  roof.receiveShadow = true;
  roof.position.y = 1.75;
  roof.rotation.y = Math.PI / 4;

  group.add(base);
  group.add(roof);
  group.position.set(x, 0, z);
  return group;
}

function createVehicle(x, z, length = 2.6) {
  const group = new THREE.Group();

  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(length, 0.9, length * 0.52),
    new THREE.MeshStandardMaterial({ color: 0x3d434a, roughness: 0.68, metalness: 0.25 })
  );
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  chassis.position.y = 0.62;

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(length * 0.5, 0.65, length * 0.42),
    new THREE.MeshStandardMaterial({ color: 0x515c67, roughness: 0.55, metalness: 0.3 })
  );
  cabin.castShadow = true;
  cabin.receiveShadow = true;
  cabin.position.set(-length * 0.08, 1.16, 0);

  group.add(chassis);
  group.add(cabin);
  group.position.set(x, 0, z);
  return group;
}

function rebuildScenery() {
  clearGroup(sceneryGroup);

  const w = state.arena.width_m;
  const h = state.arena.height_m;

  const edgeCount = Math.max(24, Math.floor((w + h) * 0.65));
  for (let i = 0; i < edgeCount; i += 1) {
    const r = seededRandom(i + 11);
    const edge = i % 4;
    let x = 0;
    let z = 0;
    const margin = 3 + seededRandom(i + 500) * 5;
    if (edge === 0) {
      x = r * w;
      z = -margin;
    } else if (edge === 1) {
      x = w + margin;
      z = r * h;
    } else if (edge === 2) {
      x = r * w;
      z = h + margin;
    } else {
      x = -margin;
      z = r * h;
    }
    const scale = 0.8 + seededRandom(i + 91) * 1.2;
    sceneryGroup.add(createTree(x, z, scale));
  }

  const tents = [
    [w * 0.46, h * 0.52, 5.2, 3.8],
    [w * 0.58, h * 0.46, 4.5, 3.1],
    [w * 0.39, h * 0.43, 4.0, 2.9],
    [w * 0.66, h * 0.56, 4.8, 3.2],
  ];
  tents.forEach(([x, z, tw, th]) => {
    sceneryGroup.add(createTent(x, z, tw, th));
  });

  sceneryGroup.add(createVehicle(w * 0.28, h * 0.39, 3.4));
  sceneryGroup.add(createVehicle(w * 0.76, h * 0.64, 2.9));

  const tower = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 6, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x3f4741, roughness: 0.87 })
  );
  tower.castShadow = true;
  tower.receiveShadow = true;
  tower.position.set(w * 0.86, 3, h * 0.2);
  sceneryGroup.add(tower);
}

function rebuildArena() {
  clearGroup(worldGroup);

  const w = state.arena.width_m;
  const h = state.arena.height_m;

  const groundMat = new THREE.MeshStandardMaterial({
    color: terrain.texture ? 0xffffff : 0x172029,
    map: terrain.texture || null,
    roughness: 0.95,
    metalness: 0.03,
  });

  groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.set(w / 2, 0, h / 2);
  groundMesh.receiveShadow = true;
  worldGroup.add(groundMesh);

  gridHelper = new THREE.GridHelper(Math.max(w, h), Math.max(10, Math.floor(Math.max(w, h) / 2)), 0x284553, 0x1c3340);
  gridHelper.position.set(w / 2, 0.05, h / 2);
  gridHelper.material.opacity = 0.42;
  gridHelper.material.transparent = true;
  worldGroup.add(gridHelper);

  const boundaryGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.1, h));
  boundaryLine = new THREE.LineSegments(
    boundaryGeo,
    new THREE.LineBasicMaterial({ color: 0x7da1af, opacity: 0.65, transparent: true })
  );
  boundaryLine.position.set(w / 2, 0.05, h / 2);
  worldGroup.add(boundaryLine);

  const groundUnderlay = new THREE.Mesh(
    new THREE.CircleGeometry(Math.max(w, h) * 1.2, 80),
    new THREE.MeshStandardMaterial({ color: 0x111d22, roughness: 1 })
  );
  groundUnderlay.rotation.x = -Math.PI / 2;
  groundUnderlay.position.set(w / 2, -0.02, h / 2);
  worldGroup.add(groundUnderlay);

  controls.target.set(w / 2, 0, h / 2);
  controls.update();

  rebuildScenery();
  updateHudStats();
}

function buildPlayerLabel(text, subtext, color = "#dcecf0") {
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 256;
  labelCanvas.height = 128;
  const c2d = labelCanvas.getContext("2d");
  c2d.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
  c2d.fillStyle = "rgba(8,15,19,0.78)";
  c2d.strokeStyle = "rgba(124,176,194,0.45)";
  c2d.lineWidth = 2;
  if (typeof c2d.roundRect === "function") {
    c2d.beginPath();
    c2d.roundRect(5, 10, 246, 106, 8);
    c2d.fill();
    c2d.stroke();
  } else {
    c2d.fillRect(5, 10, 246, 106);
    c2d.strokeRect(5, 10, 246, 106);
  }

  c2d.fillStyle = color;
  c2d.textAlign = "center";
  c2d.font = "700 24px Bahnschrift, Segoe UI, sans-serif";
  c2d.fillText(text, 128, 42);
  c2d.fillStyle = "#9eb8bf";
  c2d.font = "600 16px Cascadia Mono, Consolas, monospace";
  c2d.fillText(subtext, 128, 74);
  c2d.font = "500 14px Cascadia Mono, Consolas, monospace";
  c2d.fillText("GPS --", 128, 102);

  return labelCanvas;
}

function createPlayerMesh(player, colorHex) {
  const group = new THREE.Group();
  group.userData.playerId = player.id;

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.28, 1.45, 14),
    new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 0.24,
      roughness: 0.43,
      metalness: 0.1,
      transparent: true,
      opacity: 1,
    })
  );
  body.castShadow = true;
  body.receiveShadow = true;
  body.position.y = 0.78;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 14, 14),
    new THREE.MeshStandardMaterial({
      color: 0xe1ebee,
      roughness: 0.5,
      metalness: 0.08,
    })
  );
  head.castShadow = true;
  head.receiveShadow = true;
  head.position.y = 1.62;
  group.add(head);

  const marker = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.16, 0.75),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x8899aa, emissiveIntensity: 0.25 })
  );
  marker.position.set(0, 1.18, 0.5);
  marker.castShadow = true;
  marker.receiveShadow = true;
  group.add(marker);

  const rangeLen = Math.max(2, Number(state.config.max_range_m || 15));
  const halfAngleRad = THREE.MathUtils.degToRad(Math.max(1, Number(state.config.cone_half_angle_deg || 6)));
  const baseRadius = Math.max(0.4, Math.tan(halfAngleRad) * rangeLen);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(baseRadius, rangeLen, 24, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x7be7ff,
      emissive: 0x2aa9c8,
      emissiveIntensity: 0.18,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  cone.rotation.x = -Math.PI / 2;
  cone.position.set(0, 0.2, rangeLen / 2);
  group.add(cone);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.45, 1.8, 28),
    new THREE.MeshBasicMaterial({ color: 0xff6256, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  ring.visible = false;
  group.add(ring);

  const labelCanvas = buildPlayerLabel(`P${player.id}`, "AZ 0deg");
  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  labelTexture.colorSpace = THREE.SRGBColorSpace;
  labelTexture.generateMipmaps = false;
  labelTexture.minFilter = THREE.LinearFilter;
  labelTexture.magFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture, transparent: true, depthWrite: false }));
  sprite.scale.set(5.6, 2.35, 1);
  sprite.position.set(0, 3.15, 0);
  group.add(sprite);

  dynamicGroup.add(group);

  return {
    group,
    body,
    cone,
    ring,
    sprite,
    labelCanvas,
    labelTexture,
    colorHex,
    trailLine: null,
  };
}

function updatePlayerLabel(meshData, player, isAlert) {
  const c2d = meshData.labelCanvas.getContext("2d");
  const w = meshData.labelCanvas.width;
  const h = meshData.labelCanvas.height;

  c2d.clearRect(0, 0, w, h);
  c2d.fillStyle = isAlert ? "rgba(47,16,16,0.82)" : "rgba(8,15,19,0.78)";
  c2d.strokeStyle = isAlert ? "rgba(255,116,98,0.62)" : "rgba(124,176,194,0.45)";
  c2d.lineWidth = 2;
  if (typeof c2d.roundRect === "function") {
    c2d.beginPath();
    c2d.roundRect(5, 10, w - 10, h - 20, 8);
    c2d.fill();
    c2d.stroke();
  } else {
    c2d.fillRect(5, 10, w - 10, h - 20);
    c2d.strokeRect(5, 10, w - 10, h - 20);
  }

  c2d.fillStyle = isAlert ? "#ff9a8f" : "#8bd9e8";
  c2d.textAlign = "center";
  c2d.font = "700 24px Bahnschrift, Segoe UI, sans-serif";
  c2d.fillText(`P${player.id}`, w / 2, 42);

  c2d.fillStyle = "#c3d4da";
  c2d.font = "600 16px Cascadia Mono, Consolas, monospace";
  c2d.fillText(`AZ ${Math.round(player.yaw_deg)}deg`, w / 2, 74);
  c2d.font = "500 14px Cascadia Mono, Consolas, monospace";
  if (player.gps_quality > 0 && player.gps_lat_deg != null && player.gps_lon_deg != null) {
    c2d.fillText(`${player.gps_lat_deg.toFixed(5)}, ${player.gps_lon_deg.toFixed(5)}`, w / 2, 102);
  } else {
    c2d.fillText("GPS --", w / 2, 102);
  }

  meshData.labelTexture.needsUpdate = true;
}

function syncTrails(meshData, player, colorHex) {
  const trailPoints = Array.isArray(player.trail) ? player.trail : [];
  const trailLen = trailPoints.length;
  const tail = trailLen ? trailPoints[trailLen - 1] : null;
  const signature = `${trailLen}:${tail ? `${tail[0]},${tail[1]}` : "none"}`;
  if (meshData.trailSignature === signature) {
    return;
  }
  meshData.trailSignature = signature;

  if (meshData.trailLine) {
    dynamicGroup.remove(meshData.trailLine);
    meshData.trailLine.geometry.dispose();
    meshData.trailLine.material.dispose();
    meshData.trailLine = null;
  }

  if (trailLen < 2) {
    return;
  }

  const points = trailPoints.map((pt) => new THREE.Vector3(Number(pt[0]), 0.07, Number(pt[1])));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.35,
  });
  const line = new THREE.Line(geometry, material);
  dynamicGroup.add(line);
  meshData.trailLine = line;
}

function syncPlayers() {
  const incomingIds = new Set(state.players.map((p) => p.id));

  for (const [playerId, meshData] of playerMeshes.entries()) {
    if (!incomingIds.has(playerId)) {
      if (meshData.trailLine) {
        dynamicGroup.remove(meshData.trailLine);
        meshData.trailLine.geometry.dispose();
        meshData.trailLine.material.dispose();
      }
      dynamicGroup.remove(meshData.group);
      disposeObject3D(meshData.group);
      playerMeshes.delete(playerId);
    }
  }

  state.players.forEach((player, index) => {
    const colorHex = PLAYER_COLORS[index % PLAYER_COLORS.length];
    let meshData = playerMeshes.get(player.id);
    if (!meshData) {
      meshData = createPlayerMesh(player, colorHex);
      playerMeshes.set(player.id, meshData);
    }

    const isSelected = state.selectedPlayerId === player.id;
    const isAlert = Boolean(player.alert);
    const bodyColor = isAlert ? 0xff6256 : isSelected ? 0x72f3ff : colorHex;

    meshData.group.position.set(player.x_m, 0, player.y_m);
    // Server logic uses yaw=0 toward +X; local cone "forward" is +Z, so apply +90deg offset.
    const yawRad = THREE.MathUtils.degToRad(player.yaw_deg || 0);
    meshData.group.rotation.y = Math.PI / 2 - yawRad;

    meshData.body.material.color.setHex(bodyColor);
    meshData.body.material.emissive.setHex(bodyColor);
    meshData.body.material.emissiveIntensity = isSelected ? 0.56 : 0.25;
    meshData.body.material.opacity = player.online ? 1 : 0.38;

    const rangeLen = Math.max(2, Number(state.config.max_range_m || 15));
    const halfAngleRad = THREE.MathUtils.degToRad(Math.max(1, Number(state.config.cone_half_angle_deg || 6)));
    const radius = Math.max(0.4, Math.tan(halfAngleRad) * rangeLen);
    if (
      !meshData.cone.geometry.parameters ||
      Math.abs(meshData.cone.geometry.parameters.height - rangeLen) > 0.001 ||
      Math.abs(meshData.cone.geometry.parameters.radius - radius) > 0.001
    ) {
      meshData.cone.geometry.dispose();
      meshData.cone.geometry = new THREE.ConeGeometry(radius, rangeLen, 24, 1, true);
      meshData.cone.rotation.x = -Math.PI / 2;
      meshData.cone.position.set(0, 0.2, rangeLen / 2);
    }
    meshData.cone.material.color.setHex(isAlert ? 0xff7a70 : 0x7be7ff);
    meshData.cone.material.emissive.setHex(isAlert ? 0xff3f2b : 0x2aa9c8);
    meshData.cone.material.opacity = player.online ? (isAlert ? 0.3 : 0.18) : 0.09;

    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 130);
    meshData.ring.visible = isAlert;
    if (isAlert) {
      meshData.ring.material.opacity = 0.35 + pulse * 0.35;
      meshData.ring.scale.setScalar(1 + pulse * 0.2);
    }

    updatePlayerLabel(meshData, player, isAlert);
    syncTrails(meshData, player, colorHex);
  });
}

function pickPlayerFromMouse(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  const mouse = new THREE.Vector2();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);
  const roots = [];
  for (const meshData of playerMeshes.values()) {
    roots.push(meshData.group);
  }
  const hits = raycaster.intersectObjects(roots, true);
  if (!hits.length) {
    return;
  }

  let object = hits[0].object;
  while (object.parent && !object.userData.playerId) {
    object = object.parent;
  }
  if (object.userData.playerId != null) {
    state.selectedPlayerId = Number(object.userData.playerId);
  }
}

let pointerDown = false;
let dragged = false;
renderer.domElement.addEventListener("pointerdown", () => {
  pointerDown = true;
  dragged = false;
});
renderer.domElement.addEventListener("pointermove", () => {
  if (pointerDown) {
    dragged = true;
  }
});
renderer.domElement.addEventListener("pointerup", (event) => {
  if (!dragged) {
    pickPlayerFromMouse(event);
  }
  pointerDown = false;
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  syncPlayers();
  renderer.render(scene, camera);
}

updateClock();
setInterval(updateClock, 1000);
setLinkStatus("CONNECTING", "connecting");

rebuildArena();
loadTerrainTexture();
connectWs();
updateHudStats();
animate();
