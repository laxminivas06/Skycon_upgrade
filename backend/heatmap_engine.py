"""
=====================================================================================
SKYCON MASTER ARCHITECTURE - SPATIAL INTELLIGENCE & 3-LAYER HEATMAP ENGINE
MODULE: heatmap_engine.py (Geospatial Mapping Engine)
=====================================================================================
Structured Multi-Observation Spatial Intelligence & Heat-Map Engine

Features:
  1. Three Distinct Mapping Layers:
     - Layer A: Search Coverage Map (UNSCANNED, SCANNED, PARTIALLY_SCANNED, UNCERTAIN, OUTSIDE_BOUNDARY)
     - Layer B: Obstacle & Uncertainty Map (OBSERVED_FREE, POSSIBLE_OBSTACLE, RESTRICTED, UNKNOWN, OUTSIDE_BOUNDARY)
     - Layer C: QR & Target Observation Map (QR_CANDIDATE, QR_VERIFYING, QR_CONFIRMED, QR_REJECTED)
  2. Camera Sensor Footprint Projection:
     - Projects downward camera frustum at altitude H_agl onto ground cells
     - Accounts for frame quality: blurred frames tag cells as UNCERTAIN
  3. Unique Target Observation Tracking:
     - Assigns observation IDs (QR_OBS_001), records georeferenced coordinates,
       SHA-256 evidence, and verification status
  4. Local Atomic Persistence & GeoJSON Export:
     - Exports compact summaries and GeoJSON payloads for Ground Station display
=====================================================================================
"""

import time
import math
import logging
from typing import Dict, List, Optional, Tuple, Any

from .spatial_grid import (
    SpatialGrid,
    SpatialCell,
    LayerACoverageStatus,
    LayerBObstacleStatus,
    LayerCTargetStatus,
    CoverageStatus,
    TargetStatus
)
from .target_manager import TargetManager, TargetRecord

logger = logging.getLogger("HeatmapEngine")


class HeatmapEngine:
    """
    Authoritative 3-layer spatial intelligence and heatmap engine for companion computer.
    """

    def __init__(
        self,
        mission_id: str = "SKYCON_001",
        cell_size_m: float = 2.0,
        camera_hfov_deg: float = 68.0,
        camera_vfov_deg: float = 54.0,
        dedup_distance_m: float = 3.0
    ):
        self.mission_id = mission_id
        self.cell_size_m = cell_size_m
        self.hfov_rad = math.radians(camera_hfov_deg)
        self.vfov_rad = math.radians(camera_vfov_deg)

        self.grid: Optional[SpatialGrid] = None
        self.target_manager = TargetManager(dedup_distance_m=dedup_distance_m)

        self.boundary_type: str = "NONE"
        self.boundary_center: Optional[Tuple[float, float]] = None
        self.boundary_radius_m: float = 0.0
        self.boundary_polygon: Optional[List[Tuple[float, float]]] = None

        self.last_update_time: float = 0.0
        self.summary_version: int = 1

        # Layer C observation registry
        self.observations: Dict[str, Dict[str, Any]] = {}
        self._obs_counter = 0

    def initialize_circle_boundary(self, center_lat: float, center_lon: float, radius_m: float):
        """Initializes geodetic grid over circular search boundary."""
        self.boundary_type = "CIRCLE"
        self.boundary_center = (center_lat, center_lon)
        self.boundary_radius_m = radius_m
        self.boundary_polygon = None

        self.grid = SpatialGrid(origin_lat=center_lat, origin_lon=center_lon, cell_size_m=self.cell_size_m)
        self.grid.initialize_circular_boundary(center_lat, center_lon, radius_m)
        self.summary_version += 1
        logger.info("Initialized circular spatial grid: %d cells (radius=%.1fm)", len(self.grid.cells), radius_m)

    def initialize_polygon_boundary(self, polygon_vertices: List[Tuple[float, float]]):
        """Initializes geodetic grid over polygonal search boundary."""
        if len(polygon_vertices) < 3:
            raise ValueError("Polygon boundary requires at least 3 vertices")

        self.boundary_type = "POLYGON"
        avg_lat = sum(p[0] for p in polygon_vertices) / len(polygon_vertices)
        avg_lon = sum(p[1] for p in polygon_vertices) / len(polygon_vertices)
        self.boundary_center = (avg_lat, avg_lon)
        self.boundary_polygon = polygon_vertices

        self.grid = SpatialGrid(origin_lat=avg_lat, origin_lon=avg_lon, cell_size_m=self.cell_size_m)
        self.grid.initialize_polygonal_boundary(polygon_vertices)
        self.summary_version += 1
        logger.info("Initialized polygonal spatial grid: %d cells", len(self.grid.cells))

    def update_camera_footprint(
        self,
        drone_lat: float,
        drone_lon: float,
        altitude_agl_m: float,
        heading_deg: float,
        frame_quality_score: float = 1.0,
        is_blurred: bool = False
    ) -> int:
        """
        Projects optical camera frustum onto ground and updates Layer A and Layer B.
        Only marks cells when altitude > 1.0m and valid frame evidence exists.
        """
        if self.grid is None or altitude_agl_m < 1.0:
            return 0

        # Calculate ground footprint half-dimensions (meters)
        half_w_m = altitude_agl_m * math.tan(self.hfov_rad / 2.0)
        half_h_m = altitude_agl_m * math.tan(self.vfov_rad / 2.0)
        diag_m = math.hypot(half_w_m, half_h_m)

        # Approximate bounding radius for fast spatial cell culling
        cells_updated = 0
        step = self.cell_size_m

        r_steps = int(math.ceil(diag_m / step))
        m_per_lat = self.grid.m_per_lat
        m_per_lon = self.grid.m_per_lon

        now = time.time()
        for dr in range(-r_steps, r_steps + 1):
            for dc in range(-r_steps, r_steps + 1):
                d_north = dr * step
                d_east = dc * step

                # Check if point falls within rotated footprint
                hdg_rad = math.radians(heading_deg)
                # Rotate into camera frame
                cam_x = d_east * math.cos(-hdg_rad) - d_north * math.sin(-hdg_rad)
                cam_y = d_east * math.sin(-hdg_rad) + d_north * math.cos(-hdg_rad)

                if abs(cam_x) <= half_w_m and abs(cam_y) <= half_h_m:
                    cell_lat = drone_lat + (d_north / m_per_lat)
                    cell_lon = drone_lon + (d_east / m_per_lon)
                    cell = self.grid.get_cell_at_coords(cell_lat, cell_lon)
                    if cell:
                        cell.mark_observed(
                            frame_quality_score=frame_quality_score,
                            is_blurred=is_blurred,
                            timestamp=now
                        )
                        cells_updated += 1

        if cells_updated > 0:
            self.last_update_time = now
            self.summary_version += 1
        return cells_updated

    def register_qr_observation(
        self,
        two_digit_code: str,
        lat: float,
        lon: float,
        status: LayerCTargetStatus = LayerCTargetStatus.QR_CONFIRMED,
        confidence: float = 1.0,
        evidence_sha256: str = "",
        honesty_level: str = "CALIBRATED"
    ) -> str:
        """
        Registers a QR target observation into Layer C with a unique traceable ID.
        """
        self._obs_counter += 1
        obs_id = f"QR_OBS_{self._obs_counter:03d}"

        record = {
            "observation_id": obs_id,
            "two_digit_code": two_digit_code,
            "lat": lat,
            "lon": lon,
            "status": status.value,
            "confidence": confidence,
            "evidence_sha256": evidence_sha256,
            "honesty_level": honesty_level,
            "timestamp": time.time()
        }
        self.observations[obs_id] = record

        # Update cell if inside grid
        if self.grid:
            cell = self.grid.get_cell_at_coords(lat, lon)
            if cell:
                cell.update_target_observation(
                    status=status,
                    target_id=obs_id,
                    two_digit_code=two_digit_code,
                    confidence=confidence
                )

        self.summary_version += 1
        return obs_id

    def get_layer_a_coverage(self) -> Dict[str, Any]:
        """Returns Layer A Search Coverage grid and statistics."""
        if self.grid is None:
            return {"cells": {}, "metrics": {}}
        metrics = self.grid.get_layer_a_metrics()
        cell_dict = {
            c_id: c.layer_a.value
            for c_id, c in self.grid.cells.items()
        }
        return {"cells": cell_dict, "metrics": metrics}

    def get_layer_b_obstacles(self) -> Dict[str, Any]:
        """Returns Layer B Obstacle & Visual Uncertainty grid."""
        if self.grid is None:
            return {"cells": {}}
        cell_dict = {
            c_id: c.layer_b.value
            for c_id, c in self.grid.cells.items()
        }
        return {"cells": cell_dict, "disclaimer": "Visual perception only; not certified for metric avoidance"}

    def get_layer_c_targets(self) -> Dict[str, Any]:
        """Returns Layer C QR & Target Observations."""
        return {
            "observations": list(self.observations.values()),
            "count": len(self.observations)
        }

    def get_summary(self) -> Dict[str, Any]:
        """Comprehensive summary payload for Ground Station dashboard."""
        metrics = self.grid.get_layer_a_metrics() if self.grid else {
            "total_cells": 0, "scanned": 0, "partially_scanned": 0, "uncertain": 0, "unscanned": 0, "coverage_pct": 0.0
        }

        # Format cell list for frontend
        cells_list = []
        if self.grid:
            for c in self.grid.cells.values():
                cells_list.append(c.to_dict())

        return {
            "mission_id": self.mission_id,
            "summary_version": self.summary_version,
            "boundary_type": self.boundary_type,
            "boundary_center": self.boundary_center,
            "boundary_radius_m": self.boundary_radius_m,
            "cell_size_m": self.cell_size_m,
            "metrics": metrics,
            "total_cells": metrics.get("total_cells", 0),
            "visited_cells": metrics.get("scanned", 0),
            "coverage_percent": metrics.get("coverage_pct", 0.0),
            "cells": cells_list,
            "targets": list(self.observations.values()),
            "layers": {
                "layer_a": self.get_layer_a_coverage(),
                "layer_b": self.get_layer_b_obstacles(),
                "layer_c": self.get_layer_c_targets()
            }
        }


# Global singleton instance
heatmap_engine = HeatmapEngine()
