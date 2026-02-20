from __future__ import annotations

import argparse
import asyncio
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

    @staticmethod
    def now_ms() -> int:
        return int(time.monotonic() * 1000)

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
        message = self.state.world_state_message(now_ms)
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
        await ws.send_json(self.state.world_state_message(self.now_ms()))

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
            await self.broadcast_config()
            return

        LOG.warning("Unknown WS message: %s", msg_type)

    async def index_handler(self, _: web.Request) -> web.FileResponse:
        web_root = Path(__file__).parent / "web"
        return web.FileResponse(web_root / "index.html")

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

    app.router.add_get("/", coordinator.index_handler)
    app.router.add_get("/ws", coordinator.ws_handler)
    app.router.add_static("/static/", web_root, show_index=False)

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
