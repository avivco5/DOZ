from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass
import json
import logging
from pathlib import Path
import time
from typing import Any

from aiohttp import WSMsgType, web

from .config import CoordinatorConfig
from .logic import evaluate_targets
from .packet import AlertPacket, PacketError, decode_telemetry, encode_alert
from .state import PlayerRegistry
from .world_sim import WorldSimulator


LOG = logging.getLogger("fdw.server")
SERVER_VERSION = "1.1.0"


@dataclass(slots=True)
class RecordingState:
    active: bool = False
    session_id: str | None = None
    start_ts_ms: int | None = None
    output_dir: str | None = None


class TelemetryProtocol(asyncio.DatagramProtocol):
    def __init__(self, coordinator: "MatchCoordinator") -> None:
        self.coordinator = coordinator
        self.transport: asyncio.DatagramTransport | None = None

    def connection_made(self, transport: asyncio.BaseTransport) -> None:
        self.transport = transport  # type: ignore[assignment]
        self.coordinator.udp_transport = self.transport
        LOG.info("UDP telemetry socket ready")

    def datagram_received(self, data: bytes, addr: tuple[str, int]) -> None:
        self.coordinator.handle_udp_packet(data, addr)

    def error_received(self, exc: Exception) -> None:
        LOG.warning("UDP error: %s", exc)


class MatchCoordinator:
    def __init__(self, config: CoordinatorConfig) -> None:
        self.config = config
        self.world = WorldSimulator(
            arena_width_m=config.arena_width_m,
            arena_height_m=config.arena_height_m,
            speed_mps=config.sim_speed_mps,
            update_hz=config.world_update_hz,
            boundary_behavior=config.boundary_behavior,
            steering_noise=config.sim_noise,
            trail_seconds=config.trail_seconds,
        )
        self.state = PlayerRegistry(config=config, world=self.world)
        self.udp_transport: asyncio.DatagramTransport | None = None
        self.ws_clients: set[web.WebSocketResponse] = set()
        self.tasks: list[asyncio.Task] = []
        self.recording = RecordingState()
        self.server_started_ms = self.now_ms()

    @staticmethod
    def now_ms() -> int:
        return int(time.monotonic() * 1000)

    def recording_payload(self) -> dict[str, Any]:
        return {
            "active": self.recording.active,
            "session_id": self.recording.session_id,
            "start_ts_ms": self.recording.start_ts_ms,
            "output_dir": self.recording.output_dir,
        }

    def start_recording(self, now_ms: int) -> dict[str, Any]:
        if self.recording.active:
            return {
                "ok": True,
                "recording": self.recording_payload(),
            }

        session_id = f"REC-{now_ms}"
        output_dir = f"/tmp/aar/{session_id}"
        self.recording.active = True
        self.recording.session_id = session_id
        self.recording.start_ts_ms = now_ms
        self.recording.output_dir = output_dir
        return {
            "ok": True,
            "recording": self.recording_payload(),
        }

    def stop_recording(self) -> dict[str, Any]:
        if not self.recording.active:
            return {
                "ok": True,
                "recording": self.recording_payload(),
                "files": [],
            }

        output_dir = self.recording.output_dir
        session_id = self.recording.session_id
        files = []
        if output_dir is not None:
            files = [
                f"{output_dir}/world_state.jsonl",
                f"{output_dir}/events.jsonl",
            ]

        self.recording.active = False
        self.recording.session_id = None
        self.recording.start_ts_ms = None
        self.recording.output_dir = None
        return {
            "ok": True,
            "recording": self.recording_payload(),
            "files": files,
            "session_id": session_id,
        }

    def world_state_payload(self, now_ms: int) -> dict[str, Any]:
        message = self.state.world_state_message(now_ms)
        message["schema_version"] = 1
        message["server_time_ms"] = now_ms
        message["obstacles"] = []
        message["events"] = []
        message["recording"] = self.recording_payload()
        message["server_version"] = SERVER_VERSION
        return message

    def add_sim_player(self) -> int | None:
        return self.state.add_sim_player()

    def remove_sim_player(self) -> int | None:
        return self.state.remove_sim_player()

    def handle_udp_packet(self, data: bytes, addr: tuple[str, int]) -> None:
        now_ms = self.now_ms()
        try:
            pkt = decode_telemetry(data)
        except PacketError as exc:
            LOG.warning("Drop packet from %s: %s", addr, exc)
            return

        self.state.ingest_telemetry(pkt, addr, now_ms)
        self.world.ensure_player(pkt.player_id)

    async def simulation_loop(self) -> None:
        interval = 1.0 / self.config.world_update_hz
        last = time.monotonic()
        while True:
            now = time.monotonic()
            dt = now - last
            last = now

            self.world.configure(
                arena_width_m=self.config.arena_width_m,
                arena_height_m=self.config.arena_height_m,
                speed_mps=self.config.sim_speed_mps,
                update_hz=self.config.world_update_hz,
                boundary_behavior=self.config.boundary_behavior,
                steering_noise=self.config.sim_noise,
            )
            self.world.set_paused(self.config.sim_paused)
            self.world.step(dt)
            self.state.update_online_flags(self.now_ms())

            elapsed = time.monotonic() - now
            await asyncio.sleep(max(0.0, interval - elapsed))

    async def alert_loop(self) -> None:
        interval = 1.0 / self.config.tick_hz
        while True:
            started = time.monotonic()
            self._run_alert_tick(self.now_ms())
            elapsed = time.monotonic() - started
            await asyncio.sleep(max(0.0, interval - elapsed))

    def _run_alert_tick(self, now_ms: int) -> None:
        logic_players = self.state.build_logic_players()

        for src_id, src in logic_players.items():
            player = self.state.players[src_id]
            if src.position is None or not src.online or src.quality < self.config.quality_threshold:
                self.state.update_alert_hysteresis(
                    player_id=src_id,
                    now_ms=now_ms,
                    inside_on=False,
                    inside_off=False,
                    intensity=0,
                )
                self._send_alert(player)
                continue

            target_positions = [
                other.position
                for other_id, other in logic_players.items()
                if other_id != src_id and other.position is not None
            ]
            inside = evaluate_targets(
                src_pos=src.position,
                src_yaw_deg=src.yaw_deg,
                target_positions=target_positions,
                max_range_m=self.config.max_range_m,
                cone_half_angle_deg=self.config.cone_half_angle_deg,
            )
            self.state.update_alert_hysteresis(
                player_id=src_id,
                now_ms=now_ms,
                inside_on=inside.inside_on,
                inside_off=inside.inside_off,
                intensity=inside.best_intensity,
            )
            self._send_alert(player)

    def _send_alert(self, player) -> None:
        if self.udp_transport is None or player.addr is None:
            return
        payload = encode_alert(
            AlertPacket(
                player_id=player.player_id,
                alert_on=1 if player.alert_on else 0,
                intensity=player.alert_intensity,
                hold_ms=self.config.alert_hold_ms,
            )
        )
        self.udp_transport.sendto(payload, player.addr)

    async def ws_broadcast_loop(self) -> None:
        interval = 1.0 / self.config.ws_hz
        while True:
            started = time.monotonic()
            await self.broadcast_world_state()
            elapsed = time.monotonic() - started
            await asyncio.sleep(max(0.0, interval - elapsed))

    async def broadcast_world_state(self) -> None:
        if not self.ws_clients:
            return
        now_ms = self.now_ms()
        message = self.world_state_payload(now_ms)
        disconnected: list[web.WebSocketResponse] = []
        for ws in self.ws_clients:
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.append(ws)
        for ws in disconnected:
            self.ws_clients.discard(ws)

    async def broadcast_config(self) -> None:
        if not self.ws_clients:
            return
        payload = {"type": "config", "config": self.config.to_dict()}
        disconnected: list[web.WebSocketResponse] = []
        for ws in self.ws_clients:
            try:
                await ws.send_json(payload)
            except Exception:
                disconnected.append(ws)
        for ws in disconnected:
            self.ws_clients.discard(ws)

    async def ws_handler(self, request: web.Request) -> web.WebSocketResponse:
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        self.ws_clients.add(ws)

        await ws.send_json({"type": "config", "config": self.config.to_dict()})
        await ws.send_json(self.world_state_payload(self.now_ms()))

        async for msg in ws:
            if msg.type == WSMsgType.TEXT:
                await self.handle_ws_message(msg.data)
            elif msg.type == WSMsgType.ERROR:
                LOG.warning("WebSocket error: %s", ws.exception())

        self.ws_clients.discard(ws)
        return ws

    async def handle_ws_message(self, raw: str) -> None:
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            LOG.warning("Bad WS JSON payload")
            return

        msg_type = payload.get("type")
        if msg_type == "set_config":
            updates = payload.get("values", {})
            self.config.apply_updates(updates)
            self.world.configure(
                arena_width_m=self.config.arena_width_m,
                arena_height_m=self.config.arena_height_m,
                speed_mps=self.config.sim_speed_mps,
            )
            await self.broadcast_config()
            return

        if msg_type == "action":
            action = payload.get("name")
            if action == "randomize_positions":
                self.world.randomize_positions()
            elif action == "reset_world":
                self.world.reset()
            elif action == "pause_sim":
                self.config.sim_paused = True
                self.world.set_paused(True)
            elif action == "resume_sim":
                self.config.sim_paused = False
                self.world.set_paused(False)
            elif action == "start_recording":
                self.start_recording(self.now_ms())
            elif action == "stop_recording":
                self.stop_recording()
            elif action == "add_sim_player":
                self.add_sim_player()
            elif action == "remove_sim_player":
                self.remove_sim_player()
            await self.broadcast_config()
            await self.broadcast_world_state()
            return

        LOG.warning("Unknown WS message: %s", msg_type)

    @staticmethod
    def web_root() -> Path:
        return Path(__file__).parent / "web"

    def frontend_index_path(self) -> Path:
        web_root = self.web_root()
        app_index = web_root / "app" / "index.html"
        if app_index.exists():
            return app_index
        return web_root / "index.html"

    async def index_handler(self, _: web.Request) -> web.FileResponse:
        return web.FileResponse(self.frontend_index_path())

    async def console_handler(self, _: web.Request) -> web.FileResponse:
        return web.FileResponse(self.frontend_index_path())

    async def aar_handler(self, _: web.Request) -> web.FileResponse:
        return web.FileResponse(self.frontend_index_path())

    async def about_handler(self, _: web.Request) -> web.FileResponse:
        return web.FileResponse(self.frontend_index_path())

    async def view3d_handler(self, _: web.Request) -> web.FileResponse:
        web_root = self.web_root()
        return web.FileResponse(web_root / "view3d.html")

    async def api_health_handler(self, _: web.Request) -> web.Response:
        payload = {
            "status": "ok",
            "server_time_ms": self.now_ms(),
            "version": SERVER_VERSION,
        }
        return web.json_response(payload)

    async def api_status_handler(self, _: web.Request) -> web.Response:
        now_ms = self.now_ms()
        world_state = self.world_state_payload(now_ms)
        players = world_state.get("players", [])
        online = sum(1 for player in players if player.get("online"))
        payload = {
            "status": "ok",
            "system": "ok",
            "version": SERVER_VERSION,
            "uptime_ms": max(0, now_ms - self.server_started_ms),
            "players_online": online,
            "players_total": len(players),
            "ws_clients": len(self.ws_clients),
            "recording": self.recording_payload(),
            "config": self.config.to_dict(),
        }
        return web.json_response(payload)

    async def api_recording_start_handler(self, _: web.Request) -> web.Response:
        payload = self.start_recording(self.now_ms())
        await self.broadcast_world_state()
        return web.json_response(payload)

    async def api_recording_stop_handler(self, _: web.Request) -> web.Response:
        payload = self.stop_recording()
        await self.broadcast_world_state()
        return web.json_response(payload)

    async def api_aar_list_handler(self, _: web.Request) -> web.Response:
        return web.json_response(
            {
                "status": "not_enabled",
                "sessions": [],
                "message": "AAR listing is not enabled in this build.",
            }
        )

    async def api_replay_start_handler(self, _: web.Request) -> web.Response:
        return web.json_response(
            {
                "status": "not_enabled",
                "message": "Replay start is not enabled in this build.",
            },
            status=501,
        )

    async def api_replay_stop_handler(self, _: web.Request) -> web.Response:
        return web.json_response(
            {
                "status": "not_enabled",
                "message": "Replay stop is not enabled in this build.",
            },
            status=501,
        )

    async def api_sim_add_handler(self, _: web.Request) -> web.Response:
        player_id = self.add_sim_player()
        await self.broadcast_world_state()
        return web.json_response(
            {
                "ok": player_id is not None,
                "player_id": player_id,
                "message": "added" if player_id is not None else "no_available_slot",
            }
        )

    async def api_sim_remove_handler(self, _: web.Request) -> web.Response:
        player_id = self.remove_sim_player()
        await self.broadcast_world_state()
        return web.json_response(
            {
                "ok": player_id is not None,
                "player_id": player_id,
                "message": "removed" if player_id is not None else "no_sim_player_to_remove",
            }
        )

    async def on_startup(self, app: web.Application) -> None:
        loop = asyncio.get_running_loop()
        transport, _ = await loop.create_datagram_endpoint(
            lambda: TelemetryProtocol(self),
            local_addr=(app["udp_host"], app["udp_port"]),
        )
        self.udp_transport = transport  # type: ignore[assignment]

        self.tasks = [
            asyncio.create_task(self.simulation_loop(), name="simulation_loop"),
            asyncio.create_task(self.alert_loop(), name="alert_loop"),
            asyncio.create_task(self.ws_broadcast_loop(), name="ws_broadcast_loop"),
        ]
        LOG.info("Match coordinator started")

    async def on_cleanup(self, _: web.Application) -> None:
        for task in self.tasks:
            task.cancel()
        if self.tasks:
            await asyncio.gather(*self.tasks, return_exceptions=True)
        self.tasks.clear()

        if self.udp_transport is not None:
            self.udp_transport.close()
            self.udp_transport = None


def build_app(coordinator: MatchCoordinator, host: str, udp_port: int) -> web.Application:
    app = web.Application()
    app["udp_host"] = host
    app["udp_port"] = udp_port

    web_root = Path(__file__).parent / "web"
    app_root = web_root / "app"

    app.router.add_get("/", coordinator.index_handler)
    app.router.add_get("/console", coordinator.console_handler)
    app.router.add_get("/aar", coordinator.aar_handler)
    app.router.add_get("/about", coordinator.about_handler)
    app.router.add_get("/3d", coordinator.view3d_handler)
    app.router.add_get("/ws", coordinator.ws_handler)

    app.router.add_get("/api/health", coordinator.api_health_handler)
    app.router.add_get("/api/status", coordinator.api_status_handler)
    app.router.add_post("/api/recording/start", coordinator.api_recording_start_handler)
    app.router.add_post("/api/recording/stop", coordinator.api_recording_stop_handler)
    app.router.add_get("/api/aar/list", coordinator.api_aar_list_handler)
    app.router.add_post("/api/replay/start", coordinator.api_replay_start_handler)
    app.router.add_post("/api/replay/stop", coordinator.api_replay_stop_handler)
    app.router.add_post("/api/sim/add", coordinator.api_sim_add_handler)
    app.router.add_post("/api/sim/remove", coordinator.api_sim_remove_handler)

    app.router.add_static("/static/", web_root, show_index=False)
    if app_root.exists():
        app.router.add_static("/app/", app_root, show_index=False)

    app.on_startup.append(coordinator.on_startup)
    app.on_cleanup.append(coordinator.on_cleanup)
    return app


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Friendly Direction Warning match coordinator")
    parser.add_argument("--host", default="0.0.0.0", help="HTTP host")
    parser.add_argument("--http-port", type=int, default=8080, help="HTTP and WebSocket port")
    parser.add_argument("--udp-port", type=int, default=9999, help="UDP telemetry port")
    parser.add_argument("--log-level", default="INFO", help="Logging level")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    config = CoordinatorConfig()
    coordinator = MatchCoordinator(config=config)
    app = build_app(coordinator, host=args.host, udp_port=args.udp_port)

    web.run_app(app, host=args.host, port=args.http_port)


if __name__ == "__main__":
    main()
