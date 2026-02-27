import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { detectExposure } from "../lib/exposure";
import type { Obstacle, PlayerState } from "../types";
import { EyeIcon, GridIcon } from "./icons";

const ARENA_WIDTH = 50;
const ARENA_HEIGHT = 30;
const BASE_EXPOSURE_RANGE_M = 10;
const BASE_FOV_DEG = 60;
const PLAYER_COLORS = [0x59d9ff, 0x88f77d, 0xffd365, 0xff9a71, 0xc3a6ff, 0x6ce6d4];

interface ArenaPanelProps {
  players: PlayerState[];
  obstacles: Obstacle[];
  selectedPlayerId: number | null;
  onSelectPlayer: (playerId: number) => void;
}

type ViewMode = "top" | "angled";

interface PlayerVisual {
  id: number;
  group: THREE.Group;
  body: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  heading: THREE.Mesh<THREE.ConeGeometry, THREE.MeshStandardMaterial>;
  wedge: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  trail: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  label: THREE.Sprite;
  targetX: number;
  targetZ: number;
  currentX: number;
  currentZ: number;
  targetYaw: number;
  currentYaw: number;
  trailPoints: THREE.Vector3[];
  labelText: string;
}

interface ArenaFallback2DProps {
  players: PlayerState[];
  obstacles: Obstacle[];
  selectedPlayerId: number | null;
  exposureRangeM: number;
  fovDeg: number;
}

function hasWebGlSupport(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

function toWorldX(x: number): number {
  return Math.min(ARENA_WIDTH, Math.max(0, x));
}

function toWorldZ(y: number): number {
  return Math.min(ARENA_HEIGHT, Math.max(0, y));
}

function basePlayerColor(playerId: number): THREE.Color {
  const colorHex = PLAYER_COLORS[(playerId - 1) % PLAYER_COLORS.length] ?? 0x59d9ff;
  return new THREE.Color(colorHex);
}

function angleLerp(from: number, to: number, t: number): number {
  let delta = to - from;
  while (delta > Math.PI) {
    delta -= Math.PI * 2;
  }
  while (delta < -Math.PI) {
    delta += Math.PI * 2;
  }
  return from + delta * t;
}

function makeLabelSprite(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context == null) {
    throw new Error("Label context unavailable");
  }

  context.fillStyle = "rgba(6, 16, 22, 0.8)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(122, 210, 224, 0.85)";
  context.lineWidth = 4;
  context.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
  context.fillStyle = "#def6ff";
  context.font = "bold 48px Bahnschrift";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    depthWrite: false,
    transparent: true,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3.8, 0.95, 1);
  sprite.position.set(0, 1.5, 0);
  return sprite;
}

function updateLabelSprite(sprite: THREE.Sprite, text: string): void {
  const material = sprite.material as THREE.SpriteMaterial;
  const map = material.map;
  if (!(map instanceof THREE.CanvasTexture)) {
    return;
  }

  const canvas = map.image as HTMLCanvasElement;
  const context = canvas.getContext("2d");
  if (context == null) {
    return;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(6, 16, 22, 0.82)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(122, 210, 224, 0.85)";
  context.lineWidth = 4;
  context.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
  context.fillStyle = "#def6ff";
  context.font = "bold 44px Bahnschrift";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  map.needsUpdate = true;
}

function createPlayerVisual(id: number, scene: THREE.Scene, fovDeg: number): PlayerVisual {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 24, 24),
    new THREE.MeshStandardMaterial({
      color: basePlayerColor(id),
      roughness: 0.4,
      metalness: 0.12,
      emissive: new THREE.Color(0x041016),
      emissiveIntensity: 0.9,
    }),
  );
  body.position.set(0, 0.34, 0);
  body.userData = { playerId: id };
  group.add(body);

  const heading = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.54, 16),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0.1,
    }),
  );
  heading.rotation.z = -Math.PI / 2;
  heading.position.set(0.58, 0.34, 0);
  group.add(heading);

  const wedgeGeometry = new THREE.CircleGeometry(1, 52, -((fovDeg * Math.PI) / 180) / 2, (fovDeg * Math.PI) / 180);
  wedgeGeometry.rotateX(-Math.PI / 2);
  const wedge = new THREE.Mesh(
    wedgeGeometry,
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  wedge.position.y = 0.03;
  group.add(wedge);

  const trail = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([]),
    new THREE.LineBasicMaterial({
      color: basePlayerColor(id),
      transparent: true,
      opacity: 0.7,
    }),
  );
  trail.position.y = 0.01;
  scene.add(trail);

  const label = makeLabelSprite(`P${id}`);
  group.add(label);

  scene.add(group);

  return {
    id,
    group,
    body,
    heading,
    wedge,
    trail,
    label,
    targetX: 0,
    targetZ: 0,
    currentX: 0,
    currentZ: 0,
    targetYaw: 0,
    currentYaw: 0,
    trailPoints: [],
    labelText: `P${id}`,
  };
}

function ArenaFallback2D({ players, obstacles, selectedPlayerId, exposureRangeM, fovDeg }: ArenaFallback2DProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const exposure = useMemo(() => detectExposure(players, { fovDeg, rangeMeters: exposureRangeM }), [players, fovDeg, exposureRangeM]);
  const exposedSet = useMemo(
    () => new Set<number>(exposure.pairs.map((pair) => pair.exposedPlayerId)),
    [exposure],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas == null) {
      return;
    }

    const context = canvas.getContext("2d");
    if (context == null) {
      return;
    }

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width;
    canvas.height = height;

    context.clearRect(0, 0, width, height);
    context.fillStyle = "#08111a";
    context.fillRect(0, 0, width, height);

    context.strokeStyle = "#143347";
    for (let x = 0; x <= ARENA_WIDTH; x += 5) {
      const px = (x / ARENA_WIDTH) * width;
      context.beginPath();
      context.moveTo(px, 0);
      context.lineTo(px, height);
      context.stroke();
    }
    for (let y = 0; y <= ARENA_HEIGHT; y += 5) {
      const py = height - (y / ARENA_HEIGHT) * height;
      context.beginPath();
      context.moveTo(0, py);
      context.lineTo(width, py);
      context.stroke();
    }

    for (const obstacle of obstacles) {
      context.fillStyle = "rgba(132, 148, 160, 0.35)";
      const ox = (obstacle.x / ARENA_WIDTH) * width;
      const oy = height - ((obstacle.y + obstacle.h) / ARENA_HEIGHT) * height;
      const ow = (obstacle.w / ARENA_WIDTH) * width;
      const oh = (obstacle.h / ARENA_HEIGHT) * height;
      context.fillRect(ox, oy, ow, oh);
      context.strokeStyle = "rgba(170, 188, 200, 0.6)";
      context.strokeRect(ox, oy, ow, oh);
    }

    for (const player of players) {
      const px = (player.x / ARENA_WIDTH) * width;
      const py = height - (player.y / ARENA_HEIGHT) * height;

      const sourceExposure = (exposure.bySource.get(player.player_id) ?? []).length > 0;
      const wedgeColor = sourceExposure ? "rgba(255, 82, 82, 0.35)" : selectedPlayerId === player.player_id ? "rgba(67, 224, 255, 0.35)" : "rgba(255, 255, 255, 0.2)";

      const yawRad = (player.yaw_deg * Math.PI) / 180;
      const half = (fovDeg * Math.PI) / 360;
      const radius = (exposureRangeM / ARENA_WIDTH) * width;

      context.fillStyle = wedgeColor;
      context.beginPath();
      context.moveTo(px, py);
      context.arc(px, py, radius, -yawRad - half, -yawRad + half);
      context.closePath();
      context.fill();

      context.fillStyle = exposedSet.has(player.player_id) ? "#ffb454" : selectedPlayerId === player.player_id ? "#3ce0ff" : "#8af080";
      context.beginPath();
      context.arc(px, py, 5.5, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = "#e6f8ff";
      context.beginPath();
      context.moveTo(px, py);
      context.lineTo(px + Math.cos(yawRad) * 16, py - Math.sin(yawRad) * 16);
      context.stroke();

      context.fillStyle = "#e3f5ff";
      context.font = "12px Bahnschrift";
      context.fillText(`P${player.player_id}`, px + 8, py - 8);
    }
  }, [players, obstacles, selectedPlayerId, exposure, exposureRangeM, fovDeg, exposedSet]);

  return <canvas ref={canvasRef} className="arena-fallback-canvas" />;
}

export function ArenaPanel({ players, obstacles, selectedPlayerId, onSelectPlayer }: ArenaPanelProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const playerVisualsRef = useRef<Map<number, PlayerVisual>>(new Map());
  const obstacleGroupRef = useRef<THREE.Group | null>(null);
  const onSelectRef = useRef(onSelectPlayer);

  const [viewMode, setViewMode] = useState<ViewMode>("angled");
  const [rangeMultiplier, setRangeMultiplier] = useState<number>(1.0);
  const [webGlSupported] = useState<boolean>(() => hasWebGlSupport());

  onSelectRef.current = onSelectPlayer;

  const exposureRangeM = BASE_EXPOSURE_RANGE_M * rangeMultiplier;
  const exposure = useMemo(
    () => detectExposure(players, { fovDeg: BASE_FOV_DEG, rangeMeters: exposureRangeM }),
    [players, exposureRangeM],
  );
  const exposedTargets = useMemo(() => new Set(exposure.pairs.map((pair) => pair.exposedPlayerId)), [exposure]);

  useEffect(() => {
    if (!webGlSupported) {
      return;
    }

    const container = containerRef.current;
    if (container == null) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060d14);

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
    camera.position.set(66, 42, 48);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(ARENA_WIDTH / 2, 0, ARENA_HEIGHT / 2);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.minDistance = 8;
    controls.maxDistance = 160;

    const ambient = new THREE.AmbientLight(0x95b5c8, 0.75);
    scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xcbe3f0, 1.0);
    directional.position.set(40, 55, 35);
    scene.add(directional);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA_WIDTH, ARENA_HEIGHT),
      new THREE.MeshPhongMaterial({
        color: 0x09131d,
        shininess: 20,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(ARENA_WIDTH / 2, 0, ARENA_HEIGHT / 2);
    scene.add(floor);

    const grid = new THREE.GridHelper(ARENA_WIDTH, 25, 0x254254, 0x1a3040);
    grid.position.set(ARENA_WIDTH / 2, 0.03, ARENA_HEIGHT / 2);
    scene.add(grid);

    const boundaryShape = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.06, 0),
      new THREE.Vector3(ARENA_WIDTH, 0.06, 0),
      new THREE.Vector3(ARENA_WIDTH, 0.06, ARENA_HEIGHT),
      new THREE.Vector3(0, 0.06, ARENA_HEIGHT),
      new THREE.Vector3(0, 0.06, 0),
    ]);
    const boundary = new THREE.Line(
      boundaryShape,
      new THREE.LineBasicMaterial({ color: 0x4ba3bd }),
    );
    scene.add(boundary);

    const obstacleGroup = new THREE.Group();
    scene.add(obstacleGroup);
    obstacleGroupRef.current = obstacleGroup;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointer = (event: PointerEvent): void => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const pickables = Array.from(playerVisualsRef.current.values()).map((visual) => visual.body);
      const intersects = raycaster.intersectObjects(pickables, false);
      const firstHit = intersects[0];
      if (firstHit != null) {
        const playerId = firstHit.object.userData.playerId as number | undefined;
        if (playerId != null) {
          onSelectRef.current(playerId);
        }
      }
    };

    renderer.domElement.addEventListener("pointerdown", handlePointer);

    let animationId = 0;
    const resize = (): void => {
      const width = Math.max(300, container.clientWidth);
      const height = Math.max(280, container.clientHeight);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const observer = new ResizeObserver(() => {
      resize();
    });
    observer.observe(container);
    resize();

    const animate = (): void => {
      for (const visual of playerVisualsRef.current.values()) {
        visual.currentX += (visual.targetX - visual.currentX) * 0.18;
        visual.currentZ += (visual.targetZ - visual.currentZ) * 0.18;
        visual.currentYaw = angleLerp(visual.currentYaw, visual.targetYaw, 0.2);

        visual.group.position.set(visual.currentX, 0, visual.currentZ);
        visual.group.rotation.y = visual.currentYaw;
      }

      controls.update();
      renderer.render(scene, camera);
      animationId = window.requestAnimationFrame(animate);
    };
    animate();

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;

    return () => {
      window.cancelAnimationFrame(animationId);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointer);
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);

      for (const visual of playerVisualsRef.current.values()) {
        visual.group.removeFromParent();
        visual.trail.removeFromParent();
      }
      playerVisualsRef.current.clear();
      obstacleGroupRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
    };
  }, [webGlSupported]);

  useEffect(() => {
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (controls == null || camera == null) {
      return;
    }

    if (viewMode === "top") {
      camera.position.set(ARENA_WIDTH / 2, 75, ARENA_HEIGHT / 2 + 0.1);
      controls.target.set(ARENA_WIDTH / 2, 0, ARENA_HEIGHT / 2);
    } else {
      camera.position.set(66, 42, 48);
      controls.target.set(ARENA_WIDTH / 2, 0, ARENA_HEIGHT / 2);
    }
    camera.updateProjectionMatrix();
    controls.update();
  }, [viewMode]);

  useEffect(() => {
    const obstacleGroup = obstacleGroupRef.current;
    if (obstacleGroup == null) {
      return;
    }

    while (obstacleGroup.children.length > 0) {
      const child = obstacleGroup.children.pop();
      child?.removeFromParent();
    }

    const source = obstacles.length > 0
      ? obstacles
      : [
          { id: "default-1", x: 12, y: 11, w: 4, h: 3, type: "barrier" },
          { id: "default-2", x: 33, y: 20, w: 5, h: 3, type: "tower" },
        ];

    for (const obstacle of source) {
      const height = Math.max(1.2, obstacle.z ?? 2);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(0.8, obstacle.w), height, Math.max(0.8, obstacle.h)),
        new THREE.MeshStandardMaterial({
          color: 0x737f88,
          roughness: 0.7,
          metalness: 0.08,
        }),
      );
      mesh.position.set(obstacle.x + obstacle.w / 2, height / 2, obstacle.y + obstacle.h / 2);
      obstacleGroup.add(mesh);
    }
  }, [obstacles]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (scene == null) {
      return;
    }

    const visuals = playerVisualsRef.current;
    const currentIds = new Set(players.map((player) => player.player_id));

    for (const [id, visual] of visuals.entries()) {
      if (!currentIds.has(id)) {
        visual.group.removeFromParent();
        visual.trail.removeFromParent();
        visuals.delete(id);
      }
    }

    for (const player of players) {
      let visual = visuals.get(player.player_id);
      if (visual == null) {
        visual = createPlayerVisual(player.player_id, scene, BASE_FOV_DEG);
        visuals.set(player.player_id, visual);
      }

      const x = toWorldX(player.x);
      const z = toWorldZ(player.y);
      const yaw = (player.yaw_deg * Math.PI) / 180;

      if (visual.trailPoints.length === 0) {
        visual.currentX = x;
        visual.currentZ = z;
        visual.currentYaw = yaw;
      }

      visual.targetX = x;
      visual.targetZ = z;
      visual.targetYaw = yaw;

      visual.trailPoints.push(new THREE.Vector3(x, 0.04, z));
      if (visual.trailPoints.length > 100) {
        visual.trailPoints.shift();
      }
      visual.trail.geometry.setFromPoints(visual.trailPoints);

      const sourceExposure = (exposure.bySource.get(player.player_id) ?? []).length > 0;
      const markerColor = exposedTargets.has(player.player_id)
        ? new THREE.Color(0xffb454)
        : selectedPlayerId === player.player_id
          ? new THREE.Color(0x43e0ff)
          : basePlayerColor(player.player_id);

      visual.body.material.color.copy(markerColor);
      visual.heading.material.color.copy(markerColor);

      if (sourceExposure) {
        visual.wedge.material.color.set(0xff4545);
      } else if (selectedPlayerId === player.player_id) {
        visual.wedge.material.color.set(0x43e0ff);
      } else {
        visual.wedge.material.color.set(0xffffff);
      }

      visual.wedge.scale.set(exposureRangeM, exposureRangeM, exposureRangeM);

      const labelText = `P${player.player_id} ${player.yaw_deg.toFixed(0)}deg`;
      if (labelText !== visual.labelText) {
        updateLabelSprite(visual.label, labelText);
        visual.labelText = labelText;
      }
    }
  }, [players, selectedPlayerId, exposure, exposedTargets, exposureRangeM]);

  return (
    <section className="panel arena-panel">
      <div className="arena-viewport" ref={containerRef}>
        <div className="view-toggle-group">
          <button
            type="button"
            className={`btn btn-ghost arena-view-btn ${viewMode === "top" ? "active" : ""}`}
            onClick={() => setViewMode("top")}
          >
            <GridIcon size={13} />
            Top-Down
          </button>
          <button
            type="button"
            className={`btn btn-ghost arena-view-btn ${viewMode === "angled" ? "active" : ""}`}
            onClick={() => setViewMode("angled")}
          >
            <EyeIcon size={13} />
            Angled
          </button>
        </div>

        {!webGlSupported && (
          <ArenaFallback2D
            players={players}
            obstacles={obstacles}
            selectedPlayerId={selectedPlayerId}
            exposureRangeM={exposureRangeM}
            fovDeg={BASE_FOV_DEG}
          />
        )}

        <div className="arena-slider-overlay">
          <label htmlFor="exposureScale">View Range</label>
          <input
            id="exposureScale"
            type="range"
            min="1"
            max="6"
            step="0.1"
            value={rangeMultiplier}
            onChange={(event) => {
              setRangeMultiplier(Number(event.target.value));
            }}
          />
          <span className="mono">x{rangeMultiplier.toFixed(1)}</span>
        </div>
      </div>
    </section>
  );
}
