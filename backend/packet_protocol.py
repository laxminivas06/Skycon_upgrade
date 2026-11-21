"""
=====================================================================================
SKYCON MASTER ARCHITECTURE - COMMUNICATION FOUNDATION
MODULE: packet_protocol.py
Structured Binary Packet Protocol (SKYCON_PROTOCOL_V1)
=====================================================================================
Features:
  - Protocol Versioning & Magic Header (0x53, 0x4B -> "SK")
  - Strict Message Typing (MISSION_CONFIG, HEATMAP_SUMMARY, TARGET_UPDATE, etc.)
  - Sequence Tracking & Wrap-around Handling (uint16)
  - Priority & Acknowledgement Flags
  - 16-bit ITU-T / CCITT CRC Integrity Validation
  - Compact Binary Framing (30-byte header + payload + 2-byte CRC)
  - Deterministic serialization & deserialization across Python, C++ (ESP32), & JS
=====================================================================================
"""

import struct
import json
import time
from enum import IntEnum
from typing import Optional, Dict, Any, Tuple, Union

MAGIC_BYTES = b"\x53\x4B"  # 'SK'
PROTOCOL_VERSION = 1
HEADER_FORMAT = ">2sBBHHI16sH"  # Big-endian: magic(2), ver(1), type(1), flags(2), seq(2), timestamp_ms(4), mission_id(16), payload_len(2)
HEADER_SIZE = 30
CRC_SIZE = 2
MIN_PACKET_SIZE = HEADER_SIZE + CRC_SIZE  # 32 bytes


class MessageType(IntEnum):
    MISSION_CONFIG = 0x01
    MISSION_ACK = 0x02
    BOUNDARY_UPDATE = 0x03
    MISSION_STATUS = 0x04
    TELEMETRY_UPDATE = 0x05
    SEARCH_PROGRESS = 0x06
    HEATMAP_SUMMARY = 0x07
    TARGET_UPDATE = 0x08
    TARGET_ACK = 0x09
    QR_RESULT = 0x0A
    COMMUNICATION_STATUS = 0x0B
    MISSION_COMPLETE = 0x0C
    MISSION_ERROR = 0x0D


class PacketPriority(IntEnum):
    NORMAL = 0
    HIGH = 1


class PacketFlags(IntEnum):
    NONE = 0x00
    PRIORITY_HIGH = 0x01
    REQUIRES_ACK = 0x02
    IS_ACK = 0x04
    IS_RETRY = 0x08


# High priority message types that require ACK and bounded retry
HIGH_PRIORITY_TYPES = {
    MessageType.MISSION_CONFIG,
    MessageType.TARGET_UPDATE,
    MessageType.QR_RESULT,
    MessageType.MISSION_STATUS,
    MessageType.COMMUNICATION_STATUS,
    MessageType.MISSION_COMPLETE,
    MessageType.MISSION_ERROR
}


def crc16_ccitt(data: bytes, initial: int = 0xFFFF) -> int:
    """
    Computes standard CCITT-FALSE CRC-16 (Polynomial 0x1021, Initial 0xFFFF).
    Identical across Python, ESP32-S3 C++, and TypeScript DataView.
    """
    crc = initial
    for byte in data:
        crc ^= (byte << 8) & 0xFFFF
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return crc


class SkyconPacket:
    """
    Represents an application-level structured mission packet.
    """
    def __init__(
        self,
        msg_type: Union[MessageType, int],
        mission_id: str,
        payload: Union[Dict[str, Any], bytes, str],
        seq_num: int = 0,
        flags: int = 0,
        timestamp_ms: Optional[int] = None,
        priority: Optional[PacketPriority] = None
    ):
        self.msg_type = MessageType(msg_type)
        self.mission_id = str(mission_id)[:16].ljust(16, "\x00")
        self.seq_num = seq_num & 0xFFFF

        # Determine priority and default flags
        if priority is None:
            self.priority = PacketPriority.HIGH if self.msg_type in HIGH_PRIORITY_TYPES else PacketPriority.NORMAL
        else:
            self.priority = priority

        self.flags = flags
        if self.priority == PacketPriority.HIGH:
            self.flags |= PacketFlags.PRIORITY_HIGH
            if self.msg_type not in (MessageType.MISSION_ACK, MessageType.TARGET_ACK):
                self.flags |= PacketFlags.REQUIRES_ACK

        self.timestamp_ms = timestamp_ms if timestamp_ms is not None else int(time.time() * 1000) & 0xFFFFFFFF

        # Encode payload to bytes
        if isinstance(payload, bytes):
            self.payload_bytes = payload
            self._payload_obj = None
        elif isinstance(payload, str):
            self.payload_bytes = payload.encode("utf-8")
            self._payload_obj = None
        else:
            self._payload_obj = payload
            self.payload_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")

    @property
    def payload_obj(self) -> Any:
        if self._payload_obj is None:
            try:
                self._payload_obj = json.loads(self.payload_bytes.decode("utf-8"))
            except Exception:
                self._payload_obj = self.payload_bytes
        return self._payload_obj

    @property
    def clean_mission_id(self) -> str:
        return self.mission_id.strip("\x00")

    def requires_ack(self) -> bool:
        return bool(self.flags & PacketFlags.REQUIRES_ACK)

    def is_ack(self) -> bool:
        return bool(self.flags & PacketFlags.IS_ACK)

    def is_high_priority(self) -> bool:
        return bool(self.flags & PacketFlags.PRIORITY_HIGH) or (self.priority == PacketPriority.HIGH)

    def pack(self) -> bytes:
        """
        Serializes packet into binary buffer with CRC-16 checksum.
        Format: [HEADER (30B)] [PAYLOAD (NB)] [CRC16 (2B)]
        """
        payload_len = len(self.payload_bytes)
        if payload_len > 4096:
            raise ValueError(f"Payload length {payload_len} exceeds maximum 4096 bytes")

        header_bytes = struct.pack(
            HEADER_FORMAT,
            MAGIC_BYTES,
            PROTOCOL_VERSION,
            int(self.msg_type),
            self.flags,
            self.seq_num,
            self.timestamp_ms,
            self.mission_id.encode("utf-8")[:16],
            payload_len
        )

        body_to_checksum = header_bytes + self.payload_bytes
        crc = crc16_ccitt(body_to_checksum)
        crc_bytes = struct.pack(">H", crc)

        return body_to_checksum + crc_bytes

    @classmethod
    def unpack(cls, buffer: bytes) -> Tuple[Optional["SkyconPacket"], Optional[str]]:
        """
        Validates and unpacks a binary buffer into a SkyconPacket.
        Returns (packet, None) on success, or (None, error_reason) on failure.
        """
        if len(buffer) < MIN_PACKET_SIZE:
            return None, f"Buffer too short ({len(buffer)} bytes < {MIN_PACKET_SIZE})"

        magic = buffer[:2]
        if magic != MAGIC_BYTES:
            return None, f"Invalid magic header ({magic.hex()} != {MAGIC_BYTES.hex()})"

        # Verify CRC
        expected_crc = struct.unpack(">H", buffer[-2:])[0]
        calculated_crc = crc16_ccitt(buffer[:-2])
        if expected_crc != calculated_crc:
            return None, f"CRC mismatch: expected {hex(expected_crc)}, got {hex(calculated_crc)}"

        # Unpack header
        header_data = struct.unpack(HEADER_FORMAT, buffer[:HEADER_SIZE])
        version = header_data[1]
        if version != PROTOCOL_VERSION:
            return None, f"Unsupported protocol version {version}"

        msg_type_raw = header_data[2]
        try:
            msg_type = MessageType(msg_type_raw)
        except ValueError:
            return None, f"Unknown message type {hex(msg_type_raw)}"

        flags = header_data[3]
        seq_num = header_data[4]
        timestamp_ms = header_data[5]
        mission_id = header_data[6].decode("utf-8", errors="replace")
        payload_len = header_data[7]

        expected_total_len = HEADER_SIZE + payload_len + CRC_SIZE
        if len(buffer) != expected_total_len:
            return None, f"Length mismatch: buffer is {len(buffer)}B, header specifies {expected_total_len}B"

        payload_bytes = buffer[HEADER_SIZE:HEADER_SIZE + payload_len]

        pkt = cls(
            msg_type=msg_type,
            mission_id=mission_id,
            payload=payload_bytes,
            seq_num=seq_num,
            flags=flags,
            timestamp_ms=timestamp_ms
        )
        return pkt, None

    def create_ack(self, ack_seq: int) -> "SkyconPacket":
        """
        Generates a corresponding ACK packet for this packet.
        """
        ack_type = MessageType.MISSION_ACK
        if self.msg_type == MessageType.TARGET_UPDATE:
            ack_type = MessageType.TARGET_ACK

        ack_payload = {
            "acked_seq": self.seq_num,
            "acked_type": self.msg_type.name,
            "received_at": int(time.time() * 1000)
        }

        return SkyconPacket(
            msg_type=ack_type,
            mission_id=self.clean_mission_id,
            payload=ack_payload,
            seq_num=ack_seq,
            flags=PacketFlags.IS_ACK | PacketFlags.PRIORITY_HIGH,
            priority=PacketPriority.HIGH
        )
