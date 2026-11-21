"""
=====================================================================================
SKYCON MASTER ARCHITECTURE - AUTONOMOUS RECONNAISSANCE
MODULE: observation_manager.py
Two-Stage Reconnaissance Coordinator & Mission State Manager
=====================================================================================
Features:
  - Logical Decoupling of Navigation Planning & Vision Processing
  - Two-Stage Execution Lifecycle:
      STAGE A: Full Area Coverage & Spatial Heat-Map Generation
      STAGE B: Ranked Candidate Investigation & QR Decryption
  - Strict Target Verification Ladder (Does not brake during Stage A!)
  - Boundary Preservation Watchdog (Ensures candidate targets lie inside approved boundary)
  - Seamless Transition to Autonomous RTL upon Decoded QR or Time-Budget Cap
=====================================================================================
"""

import time
import logging
from enum import Enum
from typing import Dict, List, Optional, Tuple, Any

try:
    from .heatmap_engine import HeatmapEngine
    from .target_manager import TargetRecord
except ImportError:
    from backend.heatmap_engine import HeatmapEngine
    from backend.target_manager import TargetRecord
from .coverage_planner import CoveragePlanResult, CoveragePlanner
from .coverage_tracker import CoverageTracker

logger = logging.getLogger("ObservationManager")


class ReconStage(str, Enum):
    IDLE = "IDLE"
    STAGE_A_COVERAGE = "STAGE_A_COVERAGE"
    STAGE_A_COMPLETED = "STAGE_A_COMPLETED"
    STAGE_B_INVESTIGATION = "STAGE_B_INVESTIGATION"
    MISSION_SUCCESS_RTL = "MISSION_SUCCESS_RTL"
    TIME_EXHAUSTED_RTL = "TIME_EXHAUSTED_RTL"
    ABORTED = "ABORTED"


class ObservationManager:
    """
    Coordinates the two-stage reconnaissance workflow between camera observation ingest,
    spatial intelligence accumulation, and flight trajectory execution.
    """
    def __init__(
        self,
        heatmap_engine: HeatmapEngine,
        coverage_planner: Optional[CoveragePlanner] = None,
        coverage_tracker: Optional[CoverageTracker] = None,
        investigation_alt_m: float = 3.5,
        investigation_dwell_s: float = 6.0
    ):
        self.heatmap_engine = heatmap_engine
        self.coverage_planner = coverage_planner or CoveragePlanner()
        self.coverage_tracker = coverage_tracker or CoverageTracker(grid=heatmap_engine.grid)

        self.investigation_alt_m = investigation_alt_m
        self.investigation_dwell_s = investigation_dwell_s

        # Mission Configuration & Retention
        self.mission_id: str = "SKYCON_001"
        self.home_coords: Tuple[float, float] = (0.0, 0.0)
        self.original_boundary: List[Tuple[float, float]] = []
        self.active_plan: Optional[CoveragePlanResult] = None

        # Stage State
        self.stage: ReconStage = ReconStage.IDLE
        self.status_message: str = "Reconnaissance system initialized in IDLE"

        # Stage B Queue
        self.investigation_queue: List[TargetRecord] = []
        self.current_investigating_target: Optional[TargetRecord] = None
        self.investigation_start_mono: float = 0.0

        # Verified Intelligence
        self.verified_qr_code: Optional[str] = None
        self.verified_qr_payload: Optional[str] = None

    def configure_mission(
        self,
        mission_id: str,
        home_lat: float,
        home_lon: float,
        boundary_type: str,
        boundary_coords: Any,       # Radius float for circle, or list of (lat, lon) for polygon
        altitude_m: float = 12.0,
        speed_mps: float = 3.5
    ) -> CoveragePlanResult:
        """
        Validates parameters, saves original boundary, and generates coverage plan.
        Zero manual waypoints entered by operator!
        """
        self.mission_id = mission_id
        self.home_coords = (home_lat, home_lon)
        self.stage = ReconStage.IDLE

        if boundary_type.upper() == "CIRCLE":
            radius_m = float(boundary_coords)
            self.heatmap_engine.initialize_circle_boundary(home_lat, home_lon, radius_m)
            self.coverage_tracker.set_grid(self.heatmap_engine.grid)

            plan = self.coverage_planner.plan_circular_coverage(
                center_lat=home_lat,
                center_lon=home_lon,
                radius_m=radius_m,
                altitude_m=altitude_m,
                speed_mps=speed_mps
            )
            self.original_boundary = plan.original_boundary
        else:
            poly = list(boundary_coords)
            self.heatmap_engine.initialize_polygon_boundary(poly)
            self.coverage_tracker.set_grid(self.heatmap_engine.grid)

            plan = self.coverage_planner.plan_polygon_coverage(
                polygon_vertices=poly,
                altitude_m=altitude_m,
                speed_mps=speed_mps
            )
            self.original_boundary = poly

        self.active_plan = plan
        self.status_message = f"Mission {mission_id} configured. Plan generated with {plan.total_waypoints} waypoints."
        logger.info(self.status_message)
        return plan

    def start_stage_a(self) -> bool:
        """Transitions into Stage A: Area Coverage."""
        if not self.active_plan:
            logger.error("Cannot start Stage A: No active coverage plan.")
            return False

        self.stage = ReconStage.STAGE_A_COVERAGE
        self.coverage_tracker.start_mission(total_waypoints=self.active_plan.total_waypoints)
        self.status_message = "Stage A Active: Systematic area coverage & heat-map generation."
        logger.info(self.status_message)
        return True

    def process_flight_telemetry(
        self,
        drone_lat: float,
        drone_lon: float,
        altitude_agl_m: float,
        heading_deg: float = 0.0,
        current_waypoint_idx: Optional[int] = None
    ):
        """
        Ingests real-time flight position. Updates footprint on spatial grid.
        Checks for time-budget exhaustion.
        """
        if current_waypoint_idx is not None:
            self.coverage_tracker.update_waypoint_index(current_waypoint_idx)

        # 1. Update ground footprint on spatial heat-map grid
        self.heatmap_engine.update_vehicle_coverage(
            drone_lat=drone_lat,
            drone_lon=drone_lon,
            altitude_agl_m=altitude_agl_m,
            heading_deg=heading_deg
        )

        # 2. Time-budget safety check
        if self.stage in (ReconStage.STAGE_A_COVERAGE, ReconStage.STAGE_B_INVESTIGATION):
            if self.coverage_tracker.is_time_exhausted():
                self.stage = ReconStage.TIME_EXHAUSTED_RTL
                self.status_message = "Time budget (300s) exhausted! Transitioning to failsafe RTL."
                logger.warning(self.status_message)

    def process_visual_observation(
        self,
        det_lat: float,
        det_lon: float,
        altitude_agl: float,
        category: str = "BOX_STRUCTURE",
        score: float = 0.5,
        two_digit_code: Optional[str] = None,
        qr_payload: Optional[str] = None,
        bounding_box: Optional[Tuple[int, int, int, int]] = None
    ) -> Optional[TargetRecord]:
        """
        Registers visual observation into spatial grid and target manager.
        IMPORTANT: In Stage A, this does NOT issue flight brake commands!
        """
        # Verify coordinates lie within approved boundary
        if not self._is_within_approved_boundary(det_lat, det_lon):
            logger.warning("Visual observation at (%.6f, %.6f) rejected: lies outside approved boundary!", det_lat, det_lon)
            return None

        target = self.heatmap_engine.record_detection(
            det_lat=det_lat,
            det_lon=det_lon,
            altitude_agl=altitude_agl,
            category=category,
            detection_score=score,
            two_digit_code=two_digit_code,
            qr_payload=qr_payload,
            bounding_box=bounding_box
        )

        # In Stage B, if we are investigating this target and decode QR:
        if self.stage == ReconStage.STAGE_B_INVESTIGATION and two_digit_code and qr_payload:
            self.verified_qr_code = two_digit_code
            self.verified_qr_payload = qr_payload
            if target:
                target.mark_qr_confirmed(qr_payload, two_digit_code)
            self.stage = ReconStage.MISSION_SUCCESS_RTL
            self.status_message = f"Target verified with QR '{two_digit_code}'! Mission completed, initiating RTL."
            logger.info("*** %s ***", self.status_message)

        return target

    def complete_stage_a_and_prepare_stage_b(self, current_lat: float, current_lon: float) -> List[Dict[str, Any]]:
        """
        Concludes Stage A (Area Coverage) and extracts ranked target candidates
        ordered by nearest-neighbor inspection path.
        """
        self.stage = ReconStage.STAGE_A_COMPLETED
        ranked_candidates = self.heatmap_engine.target_manager.generate_inspection_order(current_lat, current_lon)
        self.investigation_queue = list(ranked_candidates)

        self.status_message = f"Stage A Completed. {len(self.investigation_queue)} candidates extracted for Stage B."
        logger.info(self.status_message)
        return [c.to_dict() for c in self.investigation_queue]

    def start_stage_b(self) -> Optional[TargetRecord]:
        """Initiates Stage B focused candidate inspection."""
        if not self.investigation_queue:
            self.status_message = "No candidates in investigation queue. Transitioning to RTL."
            self.stage = ReconStage.MISSION_SUCCESS_RTL
            return None

        self.stage = ReconStage.STAGE_B_INVESTIGATION
        self.current_investigating_target = self.investigation_queue.pop(0)
        self.current_investigating_target.investigation_attempts += 1
        self.investigation_start_mono = time.monotonic()

        self.status_message = f"Stage B Active: Inspecting {self.current_investigating_target.target_id} at {self.investigation_alt_m}m AGL."
        logger.info(self.status_message)
        return self.current_investigating_target

    def get_recon_status_summary(self) -> Dict[str, Any]:
        """Provides consolidated situational awareness payload for GCS."""
        progress = self.coverage_tracker.get_progress_report()
        metrics = self.heatmap_engine.get_coverage_metrics()

        return {
            "mission_id": self.mission_id,
            "stage": self.stage.value,
            "status_message": self.status_message,
            "home_coords": {"lat": self.home_coords[0], "lon": self.home_coords[1]},
            "progress": progress,
            "metrics": metrics,
            "candidates_count": len(self.heatmap_engine.target_manager.targets),
            "investigation_queue_len": len(self.investigation_queue),
            "current_investigating_id": self.current_investigating_target.target_id if self.current_investigating_target else None,
            "verified_qr_code": self.verified_qr_code,
            "verified_qr_payload": self.verified_qr_payload,
            "timestamp": int(time.time() * 1000)
        }

    def _is_within_approved_boundary(self, lat: float, lon: float) -> bool:
        """Ensures coordinate lies within the approved boundary."""
        if not self.original_boundary:
            return True

        if self.heatmap_engine.boundary_type == "CIRCLE":
            center_lat, center_lon = self.home_coords
            dist = self.heatmap_engine.grid.haversine_distance(center_lat, center_lon, lat, lon)
            return dist <= (self.heatmap_engine.boundary_radius_m + 0.5)

        return self.heatmap_engine.grid.is_point_in_polygon(lat, lon, self.original_boundary)
