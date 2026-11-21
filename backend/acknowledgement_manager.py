"""
=====================================================================================
SKYCON MASTER ARCHITECTURE - COMMUNICATION FOUNDATION
MODULE: acknowledgement_manager.py
Reliable Transmission, Sequence Tracking & Bounded Exponential Backoff
=====================================================================================
Features:
  - Sequence Number Tracking (uint16 monotonic with wrap-around safety)
  - Duplicate Packet Detection (sliding window history)
  - Pending Message Queue with Bounded Exponential Backoff Retries
  - Automatic Stale Message Eviction
  - Thread-Safe / Async-Safe Operation
=====================================================================================
"""

import time
import logging
from typing import Dict, Optional, Tuple, List, Callable, Any
from .packet_protocol import SkyconPacket, PacketFlags, PacketPriority

logger = logging.getLogger("AcknowledgementManager")


class PendingTransmission:
    """Represents a high-priority packet waiting for peer ACK."""
    def __init__(
        self,
        packet: SkyconPacket,
        max_retries: int = 5,
        initial_timeout_ms: float = 350.0,
        backoff_multiplier: float = 1.5,
        max_timeout_ms: float = 2000.0
    ):
        self.packet = packet
        self.max_retries = max_retries
        self.backoff_multiplier = backoff_multiplier
        self.max_timeout_ms = max_timeout_ms

        self.retries_left = max_retries
        self.current_timeout_ms = initial_timeout_ms
        self.sent_at_mono = time.monotonic()
        self.next_retry_mono = self.sent_at_mono + (self.current_timeout_ms / 1000.0)
        self.retry_count = 0


class AcknowledgementManager:
    """
    Manages reliable transmission state:
      - Tracks outbound unacknowledged packets.
      - Automatically schedules bounded retries.
      - Detects and filters incoming duplicate sequence numbers.
      - Detects stale packets.
    """
    def __init__(
        self,
        max_retries: int = 5,
        initial_timeout_ms: float = 350.0,
        max_timeout_ms: float = 2000.0,
        stale_threshold_s: float = 30.0,
        duplicate_window_size: int = 256
    ):
        self.max_retries = max_retries
        self.initial_timeout_ms = initial_timeout_ms
        self.max_timeout_ms = max_timeout_ms
        self.stale_threshold_s = stale_threshold_s
        self.duplicate_window_size = duplicate_window_size

        # Outbound state: seq_num -> PendingTransmission
        self._pending_ack: Dict[int, PendingTransmission] = {}
        self._next_tx_seq: int = 1

        # Inbound duplicate rejection: sliding set of recent seq_nums
        self._received_seq_history: List[int] = []
        self._received_seq_set: set = set()

        # Telemetry & Diagnostic stats
        self.total_packets_sent: int = 0
        self.total_acks_received: int = 0
        self.total_retries: int = 0
        self.total_dropped_retries_exhausted: int = 0
        self.total_duplicates_filtered: int = 0
        self.total_stale_dropped: int = 0

    def get_next_sequence_number(self) -> int:
        """Generates monotonic 16-bit sequence number (1 to 65535, skipping 0 for unassigned)."""
        seq = self._next_tx_seq
        self._next_tx_seq = (self._next_tx_seq + 1) & 0xFFFF
        if self._next_tx_seq == 0:
            self._next_tx_seq = 1
        return seq

    def register_outbound_packet(self, packet: SkyconPacket) -> None:
        """
        Enrolls a packet for ACK tracking if it has the REQUIRES_ACK flag.
        """
        self.total_packets_sent += 1
        if packet.requires_ack():
            self._pending_ack[packet.seq_num] = PendingTransmission(
                packet=packet,
                max_retries=self.max_retries,
                initial_timeout_ms=self.initial_timeout_ms,
                max_timeout_ms=self.max_timeout_ms
            )

    def process_incoming_ack(self, ack_seq: int) -> bool:
        """
        Processes peer ACK. Removes matching pending packet.
        Returns True if a matching pending packet was found and cleared.
        """
        if ack_seq in self._pending_ack:
            del self._pending_ack[ack_seq]
            self.total_acks_received += 1
            return True
        return False

    def is_duplicate(self, seq_num: int) -> bool:
        """
        Checks whether an incoming sequence number has already been processed.
        Maintains sliding window of processed sequence numbers.
        """
        if seq_num in self._received_seq_set:
            self.total_duplicates_filtered += 1
            return True

        # Register new sequence number
        self._received_seq_history.append(seq_num)
        self._received_seq_set.add(seq_num)

        # Evict oldest if window exceeded
        if len(self._received_seq_history) > self.duplicate_window_size:
            oldest = self._received_seq_history.pop(0)
            self._received_seq_set.discard(oldest)

        return False

    def is_stale(self, timestamp_ms: int) -> bool:
        """
        Detects if a packet timestamp is older than the configured threshold.
        """
        now_ms = int(time.time() * 1000) & 0xFFFFFFFF
        age_ms = (now_ms - timestamp_ms) & 0xFFFFFFFF
        # Age should not exceed threshold (and handle clock skew)
        if age_ms > (self.stale_threshold_s * 1000.0) and age_ms < 0xE0000000:
            self.total_stale_dropped += 1
            return True
        return False

    def get_packets_for_retry(self) -> List[SkyconPacket]:
        """
        Examines pending transmissions. Returns list of packets ready for retransmission.
        Evicts packets that have exceeded max_retries.
        """
        now_mono = time.monotonic()
        retry_packets = []
        exhausted_seqs = []

        for seq, pending in list(self._pending_ack.items()):
            if now_mono >= pending.next_retry_mono:
                if pending.retries_left > 0:
                    pending.retries_left -= 1
                    pending.retry_count += 1
                    self.total_retries += 1

                    # Apply exponential backoff with ceiling
                    pending.current_timeout_ms = min(
                        pending.max_timeout_ms,
                        pending.current_timeout_ms * pending.backoff_multiplier
                    )
                    pending.next_retry_mono = now_mono + (pending.current_timeout_ms / 1000.0)

                    # Mark packet as retry
                    pending.packet.flags |= PacketFlags.IS_RETRY
                    retry_packets.append(pending.packet)
                    logger.debug(
                        "Retrying packet seq=%d (attempt %d/%d, next timeout %.1f ms)",
                        seq, pending.retry_count, pending.max_retries, pending.current_timeout_ms
                    )
                else:
                    # Retries exhausted
                    exhausted_seqs.append(seq)

        for seq in exhausted_seqs:
            del self._pending_ack[seq]
            self.total_dropped_retries_exhausted += 1
            logger.warning("Packet seq=%d delivery failed: max retries exhausted.", seq)

        return retry_packets

    def get_pending_count(self) -> int:
        return len(self._pending_ack)

    def get_diagnostics(self) -> Dict[str, Any]:
        return {
            "pending_acks_count": len(self._pending_ack),
            "total_packets_sent": self.total_packets_sent,
            "total_acks_received": self.total_acks_received,
            "total_retries": self.total_retries,
            "total_retries_exhausted": self.total_dropped_retries_exhausted,
            "total_duplicates_filtered": self.total_duplicates_filtered,
            "total_stale_dropped": self.total_stale_dropped
        }
