"""
=====================================================================================
SKYCON MASTER ARCHITECTURE - COMMUNICATION FOUNDATION
MODULE: packet_manager.py
Dual-Priority Queue Manager, Decimation & Dispatcher
=====================================================================================
Features:
  - Strict Dual-Priority Queuing (High Priority vs Normal Priority)
  - Telemetry Decimation & Latest-Value Supersession (prevents queue saturation)
  - Thread-Safe Bounded Queues
  - Integration with AcknowledgementManager for Reliable Delivery
  - Rate Limiting for Normal Priority Messages (configurable Hz)
=====================================================================================
"""

import time
import queue
import logging
from typing import Optional, List, Dict, Any, Tuple, Callable
from .packet_protocol import (
    SkyconPacket,
    MessageType,
    PacketPriority,
    PacketFlags,
    HIGH_PRIORITY_TYPES
)
from .acknowledgement_manager import AcknowledgementManager

logger = logging.getLogger("PacketManager")


class PacketManager:
    """
    Manages dual-priority outbound queues, decimation of routine telemetry,
    and automatic acknowledgement handling for high-priority mission packets.
    """
    def __init__(
        self,
        high_prio_capacity: int = 32,
        normal_prio_capacity: int = 32,
        telemetry_rate_hz: float = 4.0,
        ack_manager: Optional[AcknowledgementManager] = None
    ):
        self.high_prio_queue: queue.Queue[SkyconPacket] = queue.Queue(maxsize=high_prio_capacity)
        self.normal_prio_queue: queue.Queue[SkyconPacket] = queue.Queue(maxsize=normal_prio_capacity)
        self.ack_manager = ack_manager or AcknowledgementManager()

        self.telemetry_interval_s = 1.0 / max(0.5, telemetry_rate_hz)
        self.last_telemetry_time = 0.0

        # Latest cached high-frequency values for zero-latency snapshot
        self.latest_telemetry: Optional[Dict[str, Any]] = None
        self.latest_search_progress: Optional[Dict[str, Any]] = None

        # Statistics
        self.stats = {
            "high_prio_enqueued": 0,
            "normal_prio_enqueued": 0,
            "normal_prio_dropped_full": 0,
            "telemetry_throttled_drops": 0,
            "packets_dispatched": 0,
            "packets_received_valid": 0,
            "packets_received_invalid": 0
        }

    def enqueue_outbound(
        self,
        msg_type: MessageType,
        mission_id: str,
        payload: Any,
        priority: Optional[PacketPriority] = None
    ) -> Optional[SkyconPacket]:
        """
        Constructs and enqueues a packet into the appropriate priority queue.
        Assigns monotonic sequence number.
        """
        # Determine priority
        is_high = (priority == PacketPriority.HIGH) or (msg_type in HIGH_PRIORITY_TYPES)
        actual_priority = PacketPriority.HIGH if is_high else PacketPriority.NORMAL

        # Rate-limiting / decimation check for high-frequency telemetry
        now = time.monotonic()
        if msg_type == MessageType.TELEMETRY_UPDATE:
            self.latest_telemetry = payload if isinstance(payload, dict) else None
            if now - self.last_telemetry_time < self.telemetry_interval_s:
                self.stats["telemetry_throttled_drops"] += 1
                return None
            self.last_telemetry_time = now

        seq = self.ack_manager.get_next_sequence_number()
        packet = SkyconPacket(
            msg_type=msg_type,
            mission_id=mission_id,
            payload=payload,
            seq_num=seq,
            priority=actual_priority
        )

        if actual_priority == PacketPriority.HIGH:
            try:
                self.high_prio_queue.put_nowait(packet)
                self.ack_manager.register_outbound_packet(packet)
                self.stats["high_prio_enqueued"] += 1
                return packet
            except queue.Full:
                logger.error("High priority queue full! Urgent packet seq=%d dropped", seq)
                return None
        else:
            try:
                # If normal queue is full, evict oldest item to ensure freshest telemetry
                if self.normal_prio_queue.full():
                    try:
                        self.normal_prio_queue.get_nowait()
                        self.stats["normal_prio_dropped_full"] += 1
                    except queue.Empty:
                        pass
                self.normal_prio_queue.put_nowait(packet)
                self.stats["normal_prio_enqueued"] += 1
                return packet
            except queue.Full:
                self.stats["normal_prio_dropped_full"] += 1
                return None

    def get_next_outbound_packet(self) -> Optional[SkyconPacket]:
        """
        Retrieves the next packet to transmit:
        1. Checks for ACK retry retransmissions first.
        2. Drains High Priority Queue.
        3. Drains Normal Priority Queue only if High Priority is clear.
        """
        # 1. Retransmissions from ACK Manager
        retries = self.ack_manager.get_packets_for_retry()
        if retries:
            pkt = retries[0]
            self.stats["packets_dispatched"] += 1
            return pkt

        # 2. High Priority Outbound
        try:
            pkt = self.high_prio_queue.get_nowait()
            self.stats["packets_dispatched"] += 1
            return pkt
        except queue.Empty:
            pass

        # 3. Normal Priority Outbound
        try:
            pkt = self.normal_prio_queue.get_nowait()
            self.stats["packets_dispatched"] += 1
            return pkt
        except queue.Empty:
            pass

        return None

    def process_inbound_buffer(self, raw_buffer: bytes) -> Tuple[Optional[SkyconPacket], Optional[SkyconPacket], Optional[str]]:
        """
        Parses inbound buffer.
        Returns: (received_packet, optional_ack_packet_to_send, error_str)
        """
        pkt, err = SkyconPacket.unpack(raw_buffer)
        if err or pkt is None:
            self.stats["packets_received_invalid"] += 1
            return None, None, err

        self.stats["packets_received_valid"] += 1

        # Check for stale packet
        if self.ack_manager.is_stale(pkt.timestamp_ms):
            logger.warning("Dropped stale packet seq=%d from mission %s", pkt.seq_num, pkt.clean_mission_id)
            return None, None, "Packet timestamp is stale"

        # Check for ACK packet
        if pkt.is_ack():
            acked_seq = pkt.payload_obj.get("acked_seq") if isinstance(pkt.payload_obj, dict) else None
            if acked_seq is not None:
                self.ack_manager.process_incoming_ack(int(acked_seq))
            return pkt, None, None

        # Check for duplicate packet
        if self.ack_manager.is_duplicate(pkt.seq_num):
            logger.debug("Filtered duplicate packet seq=%d; re-sending ACK", pkt.seq_num)
            # Re-emit ACK for peer reassurance if requested
            ack_pkt = None
            if pkt.requires_ack():
                ack_seq = self.ack_manager.get_next_sequence_number()
                ack_pkt = pkt.create_ack(ack_seq)
            return None, ack_pkt, "Duplicate packet filtered"

        # Create immediate ACK if required
        ack_pkt = None
        if pkt.requires_ack():
            ack_seq = self.ack_manager.get_next_sequence_number()
            ack_pkt = pkt.create_ack(ack_seq)

        return pkt, ack_pkt, None

    def get_diagnostics(self) -> Dict[str, Any]:
        ack_diag = self.ack_manager.get_diagnostics()
        return {
            "high_prio_queue_size": self.high_prio_queue.qsize(),
            "normal_prio_queue_size": self.normal_prio_queue.qsize(),
            "stats": self.stats,
            "ack_diagnostics": ack_diag
        }
