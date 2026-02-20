from __future__ import annotations

import argparse
import asyncio
import logging
import math
from pathlib import Path
import sys
import time

# Allow direct script execution: python tools/sim_node.py
if __package__ is None or __package__ == "":
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from server.packet import AlertPacket, PacketError, TelemetryPacket, decode_alert, encode_telemetry


LOG = logging.getLogger("fdw.sim_node")


class SimNodeProtocol(asyncio.DatagramProtocol):
    def __init__(self, node: "SimNode") -> None:
        self.node = node
        self.transport: asyncio.DatagramTransport | None = None

    def connection_made(self, transport: asyncio.BaseTransport) -> None:
        self.transport = transport  # type: ignore[assignment]
        self.node.transport = self.transport
        LOG.info("P%s local UDP ready on port %s", self.node.player_id, self.node.local_port)

    def datagram_received(self, data: bytes, addr: tuple[str, int]) -> None:
        try:
            pkt = decode_alert(data)
        except PacketError:
            return

        if pkt.player_id != self.node.player_id:
            return
        self.node.on_alert(pkt)


class SimNode:
    def __init__(
        self,
        player_id: int,
        server_ip: str,
        server_port: int,
        local_port: int,
        send_pos: bool,
        rate_hz: float,
    ) -> None:
        self.player_id = player_id
        self.server_ip = server_ip
        self.server_port = server_port
        self.local_port = local_port
        self.send_pos = send_pos
        self.rate_hz = rate_hz

        self.seq = 0
        self.transport: asyncio.DatagramTransport | None = None
        self.last_alert_on = 0

        self._yaw_phase = (player_id % 7) * 0.4

    def on_alert(self, alert: AlertPacket) -> None:
        if alert.alert_on != self.last_alert_on:
            LOG.info(
                "P%s alert %s intensity=%s hold_ms=%s",
                self.player_id,
                "ON" if alert.alert_on else "OFF",
                alert.intensity,
                alert.hold_ms,
            )
            self.last_alert_on = alert.alert_on

    def _sim_pose(self, t: float) -> tuple[float, float, float]:
        yaw = 80.0 * math.sin(0.35 * t + self._yaw_phase)
        pitch = 6.0 * math.sin(0.21 * t + self._yaw_phase + 0.3)
        roll = 4.0 * math.cos(0.27 * t + self._yaw_phase + 0.6)
        return yaw, pitch, roll

    def _sim_position_cm(self, t: float) -> tuple[int, int, int]:
        if not self.send_pos:
            return 0, 0, 0
        center_x = 12.0 + (self.player_id - 1) * 8.0
        center_y = 8.0 + (self.player_id - 1) * 4.0
        radius = 3.0 + (self.player_id % 3)
        omega = 0.08 + 0.01 * (self.player_id % 5)
        x = center_x + radius * math.cos(omega * t)
        y = center_y + radius * math.sin(omega * t)
        return int(round(x * 100.0)), int(round(y * 100.0)), 80

    async def run(self) -> None:
        loop = asyncio.get_running_loop()
        await loop.create_datagram_endpoint(
            lambda: SimNodeProtocol(self),
            local_addr=("0.0.0.0", self.local_port),
        )

        interval = 1.0 / self.rate_hz

        while True:
            if self.transport is None:
                await asyncio.sleep(0.1)
                continue

            now = time.monotonic()
            timestamp_ms = int(now * 1000)
            yaw, pitch, roll = self._sim_pose(now)
            pos_x_cm, pos_y_cm, pos_quality = self._sim_position_cm(now)

            telemetry = TelemetryPacket(
                player_id=self.player_id,
                seq=self.seq,
                timestamp_ms=timestamp_ms,
                yaw_deg=yaw,
                pitch_deg=pitch,
                roll_deg=roll,
                quality=85,
                pos_x_cm=pos_x_cm,
                pos_y_cm=pos_y_cm,
                pos_quality=pos_quality,
                battery_mv=3700,
                flags=0,
            )
            payload = encode_telemetry(telemetry)
            self.transport.sendto(payload, (self.server_ip, self.server_port))
            self.seq = (self.seq + 1) & 0xFFFF

            await asyncio.sleep(interval)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Simulate friendly direction warning node(s)")
    parser.add_argument("--player-ids", default="1,2", help="Comma-separated player ids")
    parser.add_argument("--server-ip", default="127.0.0.1", help="Coordinator UDP host")
    parser.add_argument("--server-port", type=int, default=9999, help="Coordinator UDP port")
    parser.add_argument("--local-port-base", type=int, default=12000, help="Base local UDP port")
    parser.add_argument("--rate-hz", type=float, default=20.0, help="Telemetry send rate")
    parser.add_argument("--send-pos", action="store_true", help="Send synthetic positions")
    parser.add_argument("--log-level", default="INFO", help="Logging level")
    return parser.parse_args()


async def amain() -> None:
    args = parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    player_ids = [int(part.strip()) for part in args.player_ids.split(",") if part.strip()]
    nodes = [
        SimNode(
            player_id=pid,
            server_ip=args.server_ip,
            server_port=args.server_port,
            local_port=args.local_port_base + idx,
            send_pos=args.send_pos,
            rate_hz=args.rate_hz,
        )
        for idx, pid in enumerate(player_ids)
    ]

    LOG.info("Starting simulator for players: %s", player_ids)
    await asyncio.gather(*(node.run() for node in nodes))


def main() -> None:
    asyncio.run(amain())


if __name__ == "__main__":
    main()
