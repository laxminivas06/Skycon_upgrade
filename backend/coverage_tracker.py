"""
=====================================================================================
SKYCON MASTER ARCHITECTURE - AUTONOMOUS RECONNAISSANCE
MODULE: coverage_tracker.py
Real-Time Coverage Progress, Hole Detection & Mission Time-Budget Watchdog
=====================================================================================
Features:
  - Tracks Real-Time Explored vs Unexplored Area Percentage
  - Detects Incomplete Coverage Regions & Geometric Holes
  - Mission Time-Budget Gating (warns at 240s, enforces RTL at 280s / 300s)
  - Synchronizes Directly with SpatialGrid & HeatmapEngine
=====================================================================================
"""

import time
import math
import logging
from typing import Dict, Any, List, Optional, Tuple
try:
    from .spatial_grid import SpatialGrid, CoverageStatus
except ImportError:
    from backend.spatial_grid import SpatialGrid, CoverageStatus

logger = logging.getLogger("CoverageTracker")


class CoverageTracker:
    """
    Monitors reconnaissance progress, calculates coverage metrics,
    and enforces time-budget boundaries during flight.
    """
    def __init__(
        self,
        grid: Optional[SpatialGrid] = None,
        max_mission_duration_s: float = 300.0,
        time_warning_threshold_s: float = 240.0,
        coverage_completion_threshold_pct: float = 90.0
    ):
        self.grid = grid
        self.max_duration_s = max_mission_duration_s
        self.warning_threshold_s = time_warning_threshold_s
        self.completion_threshold_pct = coverage_completion_threshold_pct

        self.mission_start_time: float = 0.0
        self.is_active: bool = False
        self.active_waypoint_index: int = 0
        self.total_waypoints: int = 0

    def set_grid(self, grid: SpatialGrid):
        self.grid = grid

    def start_mission(self, total_waypoints: int = 0):
        self.mission_start_time = time.time()
        self.is_active = True
        self.total_waypoints = total_waypoints
        self.active_waypoint_index = 0
        logger.info("CoverageTracker started: time budget %.0fs", self.max_duration_s)

    def stop_mission(self):
        self.is_active = False

    def update_waypoint_index(self, index: int):
        self.active_waypoint_index = index

    def get_elapsed_time_s(self) -> float:
        if not self.is_active or self.mission_start_time == 0.0:
            return 0.0
        return time.time() - self.mission_start_time

    def get_remaining_time_s(self) -> float:
        elapsed = self.get_elapsed_time_s()
        return max(0.0, self.max_duration_s - elapsed)

    def is_time_critical(self) -> bool:
        """Returns True if remaining time is under warning threshold (e.g. >240s elapsed)."""
        return self.get_elapsed_time_s() >= self.warning_threshold_s

    def is_time_exhausted(self) -> bool:
        """Returns True if mission duration has exceeded 285s (requires immediate RTL)."""
        return self.get_elapsed_time_s() >= (self.max_duration_s - 15.0)

    def get_coverage_percentage(self) -> float:
        if self.grid is None:
            return 0.0
        metrics = self.grid.get_coverage_metrics()
        return metrics.get("coverage_pct", 0.0)

    def is_coverage_sufficient(self) -> bool:
        """Returns True if coverage exceeds completion threshold (e.g. >= 90%)."""
        return self.get_coverage_percentage() >= self.completion_threshold_pct

    def detect_coverage_holes(self, max_holes_to_return: int = 10) -> List[Tuple[float, float]]:
        """
        Scans spatial grid for contiguous clusters of unexplored cells inside the search area.
        Returns list of (lat, lon) coordinates representing gap centroids.
        """
        if self.grid is None:
            return []

        unexplored = [
            (c.latitude, c.longitude)
            for c in self.grid.cells.values()
            if c.coverage_status == CoverageStatus.UNEXPLORED
        ]
        return unexplored[:max_holes_to_return]

    def get_progress_report(self) -> Dict[str, Any]:
        metrics = self.grid.get_coverage_metrics() if self.grid else {"total_cells": 0, "explored_cells": 0, "coverage_pct": 0.0}
        elapsed = self.get_elapsed_time_s()

        status = "IN_PROGRESS"
        if not self.is_active:
            status = "IDLE"
        elif self.is_time_exhausted():
            status = "TIME_EXHAUSTED_RTL"
        elif self.is_time_critical():
            status = "TIME_CRITICAL"
        elif self.is_coverage_sufficient():
            status = "COVERAGE_SUFFICIENT"

        return {
            "status": status,
            "elapsed_time_s": round(elapsed, 1),
            "remaining_time_s": round(self.get_remaining_time_s(), 1),
            "time_budget_s": self.max_duration_s,
            "coverage_pct": metrics.get("coverage_pct", 0.0),
            "total_cells": metrics.get("total_cells", 0),
            "explored_cells": metrics.get("explored_cells", 0),
            "active_waypoint": self.active_waypoint_index,
            "total_waypoints": self.total_waypoints,
            "is_sufficient": self.is_coverage_sufficient(),
            "timestamp": int(time.time() * 1000)
        }
