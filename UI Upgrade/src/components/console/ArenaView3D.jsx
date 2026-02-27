import React, { useRef, useEffect, useCallback, useState } from "react";
import * as THREE from "three";
import { Eye, Grid3x3 } from "lucide-react";

const PLAYER_COLORS = [
  0x06b6d4, // cyan
  0x10b981, // emerald
  0xf59e0b, // amber
  0x8b5cf6, // violet
  0xec4899, // pink
  0x3b82f6, // blue
];

const ALERT_COLOR = 0xf59e0b;
const SELECTED_COLOR = 0x06b6d4;

// Check if target player is inside the FOV cone of the observer player
function isInFOV(observer, target, coneLength, halfAngleDeg = 22.5) {
  const dx = target.x - observer.x;
  const dy = target.y - observer.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > coneLength) return false;

  // Observer forward direction in world space (yaw_deg: 0=north/+Y, 90=east/+X)
  const yawRad = THREE.MathUtils.degToRad(observer.yaw_deg);
  const fwdX = Math.sin(yawRad);
  const fwdY = Math.cos(yawRad);

  // Angle between forward and direction to target
  const dot = (dx * fwdX + dy * fwdY) / (dist + 0.0001);
  const angleToTarget = THREE.MathUtils.radToDeg(Math.acos(Math.max(-1, Math.min(1, dot))));

  return angleToTarget <= halfAngleDeg;
}

function fillRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}

export default function ArenaView3D({ players, obstacles, trails, arena, selectedPlayerId, onSelectPlayer, playerScale = 1 }) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const playerMeshesRef = useRef({});
  const obstacleMeshesRef = useRef({});
  const trailLinesRef = useRef({});
  const fovMeshRef = useRef(null);
  const alertRingRef = useRef(null);
  const animFrameRef = useRef(null);
  const [cameraMode, setCameraMode] = useState("angled");
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const cameraAngle = useRef({ theta: Math.PI / 4, phi: Math.PI / 4, distance: 80 });
  const cameraTarget = useRef(new THREE.Vector3(arena.maxX / 2, 0, arena.maxY / 2));

  const toScene = useCallback((x, y) => new THREE.Vector3(x, 0, y), []);

  // Initialize scene
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const w = container.clientWidth;
    const h = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0e17);
    scene.fog = new THREE.Fog(0x0a0e17, 120, 200);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 500);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    const ambient = new THREE.AmbientLight(0x334466, 0.8);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(50, 60, 30);
    scene.add(dir);

    // Ground
    const groundGeo = new THREE.PlaneGeometry(arena.maxX, arena.maxY);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(arena.maxX / 2, -0.01, arena.maxY / 2);
    scene.add(ground);

    // Grid
    const gridHelper = new THREE.GridHelper(Math.max(arena.maxX, arena.maxY) * 1.2, 30, 0x1e293b, 0x1e293b);
    gridHelper.position.set(arena.maxX / 2, 0, arena.maxY / 2);
    scene.add(gridHelper);

    // Arena boundary
    const boundaryGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(arena.maxX, 0.1, arena.maxY));
    const boundaryMat = new THREE.LineBasicMaterial({ color: 0x334155 });
    const boundary = new THREE.LineSegments(boundaryGeo, boundaryMat);
    boundary.position.set(arena.maxX / 2, 0, arena.maxY / 2);
    scene.add(boundary);

    // Resize handler
    const handleResize = () => {
      const w2 = container.clientWidth;
      const h2 = container.clientHeight;
      camera.aspect = w2 / h2;
      camera.updateProjectionMatrix();
      renderer.setSize(w2, h2);
    };
    window.addEventListener("resize", handleResize);

    // Mouse controls
    const onMouseDown = (e) => {
      isDragging.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseMove = (e) => {
      if (!isDragging.current) return;
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      cameraAngle.current.theta -= dx * 0.005;
      cameraAngle.current.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, cameraAngle.current.phi - dy * 0.005));
      lastMouse.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => { isDragging.current = false; };
    const onWheel = (e) => {
      cameraAngle.current.distance = Math.max(20, Math.min(150, cameraAngle.current.distance + e.deltaY * 0.05));
    };

    // Click to select player
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const onClick = (e) => {
      if (isDragging.current) return;
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const meshes = Object.values(playerMeshesRef.current).map(m => m.group);
      const intersects = raycaster.intersectObjects(meshes, true);
      if (intersects.length > 0) {
        let obj = intersects[0].object;
        while (obj.parent && !obj.userData.player_id) obj = obj.parent;
        if (obj.userData.player_id) {
          onSelectPlayer(obj.userData.player_id);
        }
      }
    };

    const canvas = renderer.domElement;
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("wheel", onWheel);
    canvas.addEventListener("click", onClick);

    return () => {
      window.removeEventListener("resize", handleResize);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("click", onClick);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [arena, onSelectPlayer]);

  // Camera mode
  useEffect(() => {
    if (cameraMode === "topdown") {
      cameraAngle.current = { theta: 0, phi: Math.PI / 2 - 0.01, distance: Math.max(arena.maxX, arena.maxY) * 1.3 };
    } else {
      cameraAngle.current = { theta: Math.PI / 4, phi: Math.PI / 4, distance: Math.max(arena.maxX, arena.maxY) * 1.6 };
    }
    cameraTarget.current.set(arena.maxX / 2, 0, arena.maxY / 2);
  }, [cameraMode, arena.maxX, arena.maxY]);

  // Update obstacles
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove old
    Object.values(obstacleMeshesRef.current).forEach(m => scene.remove(m));
    obstacleMeshesRef.current = {};

    obstacles.forEach(obs => {
      const h = obs.type === "pillar" ? 4 : 2;
      const geo = obs.type === "pillar"
        ? new THREE.CylinderGeometry(obs.w / 2, obs.w / 2, h, 8)
        : new THREE.BoxGeometry(obs.w, h, obs.h);
      const mat = new THREE.MeshStandardMaterial({
        color: obs.type === "pillar" ? 0x374151 : 0x1f2937,
        roughness: 0.8,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(obs.x, h / 2, obs.y);
      scene.add(mesh);
      obstacleMeshesRef.current[obs.id] = mesh;
    });
  }, [obstacles]);

  // Animation / update loop
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    if (!scene || !camera || !renderer) return;

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);

      // Update camera position
      const { theta, phi, distance } = cameraAngle.current;
      const target = cameraTarget.current;
      camera.position.set(
        target.x + distance * Math.sin(phi) * Math.cos(theta),
        distance * Math.cos(phi),
        target.z + distance * Math.sin(phi) * Math.sin(theta)
      );
      camera.lookAt(target);

      // Compute FOV-based alerts: who sees whom
      const FOV_HALF_ANGLE = 22.5; // degrees, matching cone ratio 0.4 radius / 1.0 length
      const coneWorldLength = 10 * playerScale;
      const fovAlerts = new Set(); // player_ids that are inside someone else's cone
      players.forEach((observer) => {
        players.forEach((target) => {
          if (observer.player_id === target.player_id) return;
          if (isInFOV(observer, target, coneWorldLength, FOV_HALF_ANGLE)) {
            fovAlerts.add(target.player_id);
          }
        });
      });

      // Update players
      players.forEach((p, i) => {
        const colorIdx = i % PLAYER_COLORS.length;
        let meshData = playerMeshesRef.current[p.player_id];

        if (!meshData) {
          // Create player group
          const group = new THREE.Group();
          group.userData.player_id = p.player_id;

          // Body - tiny dot
          const bodyGeo = new THREE.SphereGeometry(0.5, 10, 10);
          const bodyMat = new THREE.MeshStandardMaterial({ color: PLAYER_COLORS[colorIdx], emissive: PLAYER_COLORS[colorIdx], emissiveIntensity: 0.6 });
          const body = new THREE.Mesh(bodyGeo, bodyMat);
          body.position.y = 0.5;
          group.add(body);

          // White FOV cone - pointing forward (length controlled by slider)
          const coneLength = 10; // base length, scaled later via group
          const coneGeo = new THREE.ConeGeometry(coneLength * 0.4, coneLength, 6, 1, true);
          const arrowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.15, opacity: 0.25, transparent: true, side: THREE.DoubleSide });
          const arrow = new THREE.Mesh(coneGeo, arrowMat);
          // tip at origin (player position), cone opens forward (negative Z)
          arrow.rotation.x = Math.PI / 2;
          arrow.position.set(0, 0.5, -coneLength / 2);
          group.add(arrow);

          // ID + GPS label sprite
          const canvas = document.createElement("canvas");
          canvas.width = 256;
          canvas.height = 64;
          const ctx = canvas.getContext("2d");
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const tex = new THREE.CanvasTexture(canvas);
          tex.generateMipmaps = false;
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.needsUpdate = true;
          const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
          const sprite = new THREE.Sprite(spriteMat);
          sprite.scale.set(7.2, 2.4, 1);
          sprite.position.y = 3.8;
          group.add(sprite);

          scene.add(group);
          meshData = { group, body, bodyMat, arrow, sprite, spriteTex: tex, spriteCanvas: canvas, spriteCtx: ctx };
          playerMeshesRef.current[p.player_id] = meshData;
        }

        // Scale only the white cone, not the player body
        if (meshData.arrow) {
          meshData.arrow.scale.setScalar(playerScale);
          const coneLength = 10;
          meshData.arrow.position.set(0, 0.5, -coneLength * playerScale / 2);
        }

        // Interpolate position
        const targetPos = new THREE.Vector3(p.x, 0, p.y);
        meshData.group.position.lerp(targetPos, 0.15);

        // Heading
        const yawRad = THREE.MathUtils.degToRad(-p.yaw_deg + 90);
        meshData.group.rotation.y = yawRad;

        // Color based on state
        const isSelected = selectedPlayerId === p.player_id;
        const isAlert = p.alert_state?.active || fovAlerts.has(p.player_id);
        let color = PLAYER_COLORS[i % PLAYER_COLORS.length];
        if (isAlert) color = ALERT_COLOR;
        if (isSelected) color = SELECTED_COLOR;
        meshData.bodyMat.color.setHex(color);
        meshData.bodyMat.emissive.setHex(color);
        meshData.bodyMat.emissiveIntensity = isSelected ? 0.5 : 0.2;

        // Update label with GPS coords and azimuth
        if (meshData.spriteCtx) {
          const ctx2 = meshData.spriteCtx;
          const cv = meshData.spriteCanvas;
          ctx2.clearRect(0, 0, cv.width, cv.height);
          // background pill (with roundRect fallback for older canvas impls)
          ctx2.fillStyle = "rgba(10,14,23,0.75)";
          fillRoundedRect(ctx2, 0, 0, cv.width, cv.height, 8);
          // Player ID
          ctx2.fillStyle = "#06b6d4";
          ctx2.font = "bold 18px monospace";
          ctx2.textAlign = "center";
          ctx2.fillText(`P${p.player_id}`, cv.width / 2, 20);
          // GPS coords (map x/y as fake lat/lon for display)
          const lat = (32.0 + p.y / 600).toFixed(4);
          const lon = (34.8 + p.x / 1000).toFixed(4);
          ctx2.fillStyle = "#94a3b8";
          ctx2.font = "12px monospace";
          ctx2.fillText(`${lat}N ${lon}E`, cv.width / 2, 40);
          // Azimuth
          ctx2.fillStyle = "#e2e8f0";
          ctx2.fillText(`AZ ${Math.round(p.yaw_deg)}°`, cv.width / 2, 56);
          meshData.spriteTex.needsUpdate = true;
        }

        // Cone color: red if this player is "seeing" someone, normal white otherwise
        const isSeeingSomeone = players.some(target =>
          target.player_id !== p.player_id && isInFOV(p, target, coneWorldLength, FOV_HALF_ANGLE)
        );
        meshData.arrow.material.color.setHex(isSeeingSomeone ? 0xff4444 : 0xffffff);
        meshData.arrow.material.emissive.setHex(isSeeingSomeone ? 0xff2222 : 0xffffff);

        // Keep players visible even when backend marks them offline in sim fallback mode.
        const staleByAge = Number.isFinite(p.last_seen_ms) && (Date.now() - p.last_seen_ms) > 12000;
        meshData.bodyMat.opacity = staleByAge ? 0.7 : 1;
        meshData.bodyMat.transparent = staleByAge;
      });

      // Update trails
      Object.entries(trails).forEach(([pid, points]) => {
        const id = parseInt(pid);
        const existing = trailLinesRef.current[id];
        if (existing) {
          existing.geometry.dispose();
          scene.remove(existing);
        }
        if (!points || points.length < 2) return;
        const linePoints = points.map(pt => new THREE.Vector3(pt.x, 0.1, pt.y));
        const geo = new THREE.BufferGeometry().setFromPoints(linePoints);
        const pIdx = players.findIndex(p => p.player_id === id);
        const mat = new THREE.LineBasicMaterial({
          color: PLAYER_COLORS[Math.max(0, pIdx) % PLAYER_COLORS.length],
          opacity: 0.3,
          transparent: true,
        });
        const line = new THREE.Line(geo, mat);
        scene.add(line);
        trailLinesRef.current[id] = line;
      });

      // FOV cone for selected player
      if (fovMeshRef.current) { scene.remove(fovMeshRef.current); fovMeshRef.current = null; }
      if (alertRingRef.current) { scene.remove(alertRingRef.current); alertRingRef.current = null; }

      const selPlayer = players.find(p => p.player_id === selectedPlayerId);
      if (selPlayer) {
        // FOV wedge
        const fovAngle = Math.PI / 2;
        const fovDist = coneWorldLength;
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        const segments = 16;
        for (let i = 0; i <= segments; i++) {
          const a = -fovAngle / 2 + (fovAngle / segments) * i;
          shape.lineTo(Math.sin(a) * fovDist, Math.cos(a) * fovDist);
        }
        shape.lineTo(0, 0);
        const fovGeo = new THREE.ShapeGeometry(shape);
        const fovMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, opacity: 0.12, transparent: true, side: THREE.DoubleSide });
        const fovMesh = new THREE.Mesh(fovGeo, fovMat);
        fovMesh.rotation.x = -Math.PI / 2;
        const yawRad = THREE.MathUtils.degToRad(-selPlayer.yaw_deg + 90);
        fovMesh.rotation.z = yawRad;
        fovMesh.position.set(selPlayer.x, 0.05, selPlayer.y);
        scene.add(fovMesh);
        fovMeshRef.current = fovMesh;

        // Alert ring
        if (selPlayer.alert_state?.active) {
          const ringGeo = new THREE.RingGeometry(6, 6.3, 32);
          const ringMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, opacity: 0.4, transparent: true, side: THREE.DoubleSide });
          const ring = new THREE.Mesh(ringGeo, ringMat);
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(selPlayer.x, 0.05, selPlayer.y);
          scene.add(ring);
          alertRingRef.current = ring;
        }
      }

      renderer.render(scene, camera);
    };

    animate();
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [players, trails, selectedPlayerId, arena, playerScale]);

  return (
    <div className="relative w-full h-full bg-[#0a0e17]">
      <div ref={mountRef} className="w-full h-full" />
      {/* Camera controls overlay */}
      <div className="absolute top-3 right-3 flex gap-1.5">
        <button
          onClick={() => setCameraMode("topdown")}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition ${
            cameraMode === "topdown"
              ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
              : "bg-slate-800/80 text-slate-400 border border-slate-700 hover:text-slate-200"
          }`}
        >
          <Grid3x3 className="w-3 h-3" />
          Top-Down
        </button>
        <button
          onClick={() => setCameraMode("angled")}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition ${
            cameraMode === "angled"
              ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
              : "bg-slate-800/80 text-slate-400 border border-slate-700 hover:text-slate-200"
          }`}
        >
          <Eye className="w-3 h-3" />
          Angled
        </button>
      </div>
    </div>
  );
}
