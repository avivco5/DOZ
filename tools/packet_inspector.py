from __future__ import annotations

import argparse
from pathlib import Path
import socket
import sys

# Allow direct script execution: python tools/packet_inspector.py
if __package__ is None or __package__ == "":
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from server.packet import (
    MSG_ALERT,
    MSG_TELEMETRY,
    PacketError,
    decode_alert,
    decode_telemetry,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Inspect UDP packets for the friendly direction warning protocol")
    parser.add_argument("--listen-host", default="0.0.0.0")
    parser.add_argument("--listen-port", type=int, default=9999)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((args.listen_host, args.listen_port))
    print(f"Listening on {args.listen_host}:{args.listen_port}")

    while True:
        data, addr = sock.recvfrom(2048)
        if len(data) < 4:
            print(f"{addr} short packet len={len(data)}")
            continue

        msg_type = data[3]
        try:
            if msg_type == MSG_TELEMETRY:
                pkt = decode_telemetry(data)
                print(
                    f"{addr} TELEMETRY pid={pkt.player_id} seq={pkt.seq} "
                    f"yaw={pkt.yaw_deg:.2f} q={pkt.quality} pos=({pkt.pos_x_cm},{pkt.pos_y_cm})"
                )
            elif msg_type == MSG_ALERT:
                pkt = decode_alert(data)
                print(
                    f"{addr} ALERT pid={pkt.player_id} on={pkt.alert_on} "
                    f"intensity={pkt.intensity} hold_ms={pkt.hold_ms}"
                )
            else:
                print(f"{addr} unknown msg_type={msg_type} len={len(data)}")
        except PacketError as exc:
            print(f"{addr} invalid packet: {exc}")


if __name__ == "__main__":
    main()
