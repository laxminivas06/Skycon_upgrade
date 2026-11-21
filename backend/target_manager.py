"""
=====================================================================================
SKYCON MASTER ARCHITECTURE - SPATIAL INTELLIGENCE & TARGET MANAGEMENT
MODULE: target_manager.py
Candidate Target Extraction, Deduplication & Ranked Investigation Scheduler
=====================================================================================
Features:
  - Strict Target Classification Ladder:
      DETECTION -> CANDIDATE -> VERIFIED -> QR_CONFIRMED
  - Spatial Clustering & Deduplication (3.0m radius fusion)
  - Multi-Observation EMA Smoothing of Target Geolocation
  - Ranked Candidate Extraction for Stage B Focused Investigation
  - Route Ordering (Nearest Neighbor TSP) for Minimal Battery Traversal
=====================================================================================
"""

import math
import time
import logging
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional, Tuple, Any

logger = logging.getLogger("TargetManager")


@dataclass
class TargetRecord:
    target_id: str
    latitude: float
    longitude: float
    altitude_agl: float
    category: str              # "BOX_STRUCTURE", "QR_CANDIDATE", "GROUND_OBJECT"
    confidence: float          # 0.0 to 1.0
    observation_count: int
    first_seen: float
    last_seen: float
    status: str                # "DETECTED", "CANDIDATE", "VERIFIED", "QR_CONFIRMED", "REJECTED"
    cell_id: Optional[str] = None
    decoded_payload: Optional[str] = None
    two_digit_code: Optional[str] = None
    investigation_attempts: int = 0
    investigated_at: Optional[float] = None
    bounding_box: Optional[Tuple[int, int, int, int]] = None

    def mark_candidate(self):
        if self.status == "DETECTED":
            self.status = "CANDIDATE"

    def mark_verified(self):
        self.status = "VERIFIED"
        self.investigated_at = time.time()

    def mark_qr_confirmed(self, payload: str, code: str):
        self.status = "QR_CONFIRMED"
        self.decoded_payload = payload
        self.two_digit_code = code
        self.confidence = 1.0
        self.investigated_at = time.time()

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class TargetManager:
    """
    Manages active target records, deduplicates multiple observations,
    and produces ranked candidate lists for Stage B investigation.
    """
    def __init__(
        self,
        dedup_distance_m: float = 3.0,
        candidate_min_hits: int = 3,
        candidate_min_conf: float = 0.65
    ):
        self.dedup_distance_m = dedup_distance_m
        self.candidate_min_hits = candidate_min_hits
        self.candidate_min_conf = candidate_min_conf

        # target_id -> TargetRecord
        self.targets: Dict[str, TargetRecord] = {}
        self._next_id: int = 1

    def register_observation(
        self,
        lat: float,
        lon: float,
        altitude_agl: float,
        category: str = "BOX_STRUCTURE",
        confidence: float = 0.5,
        cell_id: Optional[str] = None,
        two_digit_code: Optional[str] = None,
        qr_payload: Optional[str] = None,
        bounding_box: Optional[Tuple[int, int, int, int]] = None
    ) -> TargetRecord:
        """
        Registers a new visual observation.
        Finds existing target within dedup_distance_m or creates a new target record.
        """
        now = time.time()
        existing_target = self._find_nearest_target(lat, lon, self.dedup_distance_m)

        if existing_target is not None:
            # Multi-observation fusion
            existing_target.observation_count += 1
            existing_target.last_seen = now

            # Exponential Moving Average for coordinate refinement
            alpha = 0.35
            existing_target.latitude = (1 - alpha) * existing_target.latitude + alpha * lat
            existing_target.longitude = (1 - alpha) * existing_target.longitude + alpha * lon
            existing_target.altitude_agl = (1 - alpha) * existing_target.altitude_agl + alpha * altitude_agl

            # Update confidence (Bayesian asymptotic update)
            existing_target.confidence = 1.0 - (1.0 - existing_target.confidence) * (1.0 - (confidence * 0.7))

            if category == "QR_CANDIDATE" or category == "QR_PATTERN":
                existing_target.category = "QR_CANDIDATE"

            if bounding_box:
                existing_target.bounding_box = bounding_box
            if cell_id and not existing_target.cell_id:
                existing_target.cell_id = cell_id

            # Check promotion to CANDIDATE
            if (existing_target.status == "DETECTED" and
                    existing_target.observation_count >= self.candidate_min_hits and
                    existing_target.confidence >= self.candidate_min_conf):
                existing_target.mark_candidate()
                logger.info("Target %s promoted to CANDIDATE (hits=%d, conf=%.2f)",
                            existing_target.target_id, existing_target.observation_count, existing_target.confidence)

            # Direct QR shortcut if code detected
            if two_digit_code and qr_payload:
                existing_target.mark_qr_confirmed(qr_payload, two_digit_code)

            return existing_target

        # Create new target record
        t_id = f"TGT_{self._next_id:03d}"
        self._next_id += 1

        initial_status = "DETECTED"
        if two_digit_code and qr_payload:
            initial_status = "QR_CONFIRMED"

        new_rec = TargetRecord(
            target_id=t_id,
            latitude=lat,
            longitude=lon,
            altitude_agl=altitude_agl,
            category=category,
            confidence=confidence,
            observation_count=1,
            first_seen=now,
            last_seen=now,
            status=initial_status,
            cell_id=cell_id,
            decoded_payload=qr_payload,
            two_digit_code=two_digit_code,
            bounding_box=bounding_box
        )
        self.targets[t_id] = new_rec
        logger.info("New target registered: %s at (%.7f, %.7f) conf=%.2f", t_id, lat, lon, confidence)
        return new_rec

    def get_ranked_candidates(self) -> List[TargetRecord]:
        """
        Returns list of candidates ranked by confidence score (descending),
        prioritizing QR candidates and verified boxes.
        """
        candidates = [t for t in self.targets.values() if t.status in ("CANDIDATE", "VERIFIED", "QR_CONFIRMED")]

        # Sort priority: QR_CONFIRMED (1), VERIFIED (2), CANDIDATE (3), then by confidence desc
        status_weights = {"QR_CONFIRMED": 3.0, "VERIFIED": 2.0, "CANDIDATE": 1.0}
        candidates.sort(key=lambda t: (status_weights.get(t.status, 0.0), t.confidence), reverse=True)
        return candidates

    def generate_inspection_order(self, current_lat: float, current_lon: float) -> List[TargetRecord]:
        """
        Generates optimal waypoint order for Stage B using Nearest-Neighbor heuristic.
        """
        uninvestigated = [t for t in self.targets.values() if t.status in ("CANDIDATE", "DETECTED") and t.investigation_attempts == 0]
        if not uninvestigated:
            return []

        route: List[TargetRecord] = []
        cur_lat, cur_lon = current_lat, current_lon

        remaining = list(uninvestigated)
        while remaining:
            # Find nearest
            nearest = min(remaining, key=lambda t: self._haversine(cur_lat, cur_lon, t.latitude, t.longitude))
            route.append(nearest)
            cur_lat, cur_lon = nearest.latitude, nearest.longitude
            remaining.remove(nearest)

        return route

    def _find_nearest_target(self, lat: float, lon: float, max_dist_m: float) -> Optional[TargetRecord]:
        best_match = None
        min_d = max_dist_m
        for target in self.targets.values():
            d = self._haversine(lat, lon, target.latitude, target.longitude)
            if d < min_d:
                min_d = d
                best_match = target
        return best_match

    @staticmethod
    def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        r = 6371000.0
        p1, p2 = math.radians(lat1), math.radians(lat2)
        dp = math.radians(lat2 - lat1)
        dl = math.radians(lon2 - lon1)
        a = math.sin(dp / 2.0)**2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2.0)**2
        return r * 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
