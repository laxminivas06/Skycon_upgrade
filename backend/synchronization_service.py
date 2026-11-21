"""
=====================================================================================
SKYCON MASTER ARCHITECTURE - COMMUNICATION FOUNDATION
MODULE: synchronization_service.py
Reconnection State Synchronization & Fault Recovery
=====================================================================================
Features:
  - Generates Incremental State Diffs on Reconnection
  - Prevents Mission History Loss across Wi-Fi drops & ESP32 / App Reboots
  - Computes State Version Hashes (Mission, Boundary, Targets, Heatmap)
  - Synchronizes Target Candidates & Decoded QR Records Reliably
=====================================================================================
"""

import time
import hashlib
import json
import logging
from typing import Dict, Any, List, Optional, Tuple
from .packet_protocol import SkyconPacket, MessageType, PacketPriority

logger = logging.getLogger("SynchronizationService")


class SynchronizationService:
    """
    Maintains mission versioning and coordinates state synchronization
    when communication links reconnect after a temporary drop or reboot.
    """
    def __init__(self):
        self.mission_id: Optional[str] = None
        self.config_version: int = 1
        self.boundary_version: int = 1
        self.target_sync_version: int = 1
        self.heatmap_sync_version: int = 1

        self.last_sync_timestamp: float = 0.0

    def compute_state_manifest(
        self,
        mission_id: str,
        mission_state: str,
        config_data: Optional[Dict[str, Any]],
        boundary_data: Optional[Dict[str, Any]],
        targets: List[Dict[str, Any]],
        heatmap_summary: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Builds a compact synchronization manifest representing authoritative RPi state.
        """
        self.mission_id = mission_id
        now_ms = int(time.time() * 1000)

        # Compute hash summaries
        config_hash = hashlib.md5(json.dumps(config_data or {}, sort_keys=True).encode("utf-8")).hexdigest()[:8]
        boundary_hash = hashlib.md5(json.dumps(boundary_data or {}, sort_keys=True).encode("utf-8")).hexdigest()[:8]

        target_ids = [t.get("detectionId") or t.get("object_id") or str(i) for i, t in enumerate(targets)]
        targets_hash = hashlib.md5(",".join(target_ids).encode("utf-8")).hexdigest()[:8]

        return {
            "mission_id": mission_id,
            "mission_state": mission_state,
            "config_version": self.config_version,
            "config_hash": config_hash,
            "boundary_version": self.boundary_version,
            "boundary_hash": boundary_hash,
            "target_count": len(targets),
            "target_sync_version": self.target_sync_version,
            "targets_hash": targets_hash,
            "heatmap_version": self.heatmap_sync_version,
            "timestamp": now_ms
        }

    def generate_resync_packets(
        self,
        peer_manifest: Dict[str, Any],
        authoritative_manifest: Dict[str, Any],
        full_config: Dict[str, Any],
        full_boundary: Dict[str, Any],
        verified_targets: List[Dict[str, Any]],
        heatmap_deltas: Optional[Dict[str, Any]]
    ) -> List[Tuple[MessageType, Any]]:
        """
        Compares peer manifest against authoritative state.
        Returns minimal list of packets needed to bring the peer up to date.
        """
        packets_to_send: List[Tuple[MessageType, Any]] = []
        mission_id = authoritative_manifest["mission_id"]

        # 1. Mission Status & State if mismatched
        if peer_manifest.get("mission_state") != authoritative_manifest.get("mission_state"):
            packets_to_send.append((
                MessageType.MISSION_STATUS,
                {
                    "mission_id": mission_id,
                    "state": authoritative_manifest.get("mission_state"),
                    "resync": True
                }
            ))

        # 2. Config Resync if hash differs
        if peer_manifest.get("config_hash") != authoritative_manifest.get("config_hash"):
            packets_to_send.append((
                MessageType.MISSION_CONFIG,
                full_config
            ))

        # 3. Boundary Resync if hash differs
        if peer_manifest.get("boundary_hash") != authoritative_manifest.get("boundary_hash"):
            packets_to_send.append((
                MessageType.BOUNDARY_UPDATE,
                full_boundary
            ))

        # 4. Target Resync if target count or hash differs
        if (peer_manifest.get("target_count", 0) != len(verified_targets) or
                peer_manifest.get("targets_hash") != authoritative_manifest.get("targets_hash")):
            for target in verified_targets:
                packets_to_send.append((
                    MessageType.TARGET_UPDATE,
                    target
                ))

        # 5. Heatmap Delta if version is behind
        if heatmap_deltas and peer_manifest.get("heatmap_version", 0) < authoritative_manifest.get("heatmap_version", 1):
            packets_to_send.append((
                MessageType.HEATMAP_SUMMARY,
                heatmap_deltas
            ))

        self.last_sync_timestamp = time.time()
        logger.info(
            "Reconnection resync generated %d delta packets for mission %s",
            len(packets_to_send), mission_id
        )
        return packets_to_send

    def increment_target_version(self):
        self.target_sync_version += 1

    def increment_heatmap_version(self):
        self.heatmap_sync_version += 1
