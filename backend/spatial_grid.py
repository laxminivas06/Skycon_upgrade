"""
=====================================================================================
SKYCON MASTER ARCHITECTURE - SPATIAL INTELLIGENCE & 3-LAYER GRID DISCRETIZATION
MODULE: spatial_grid.py (Geospatial Mapping Engine)
=====================================================================================
Structured Geodetic Discretization & Spatial Cell Management

Features:
  1. Three Distinct Mapping Layers:
     - Layer A: Search Coverage (UNSCANNED, SCANNED, PARTIALLY_SCANNED, UNCERTAIN, OUTSIDE_BOUNDARY)
     - Layer B: Obstacle & Visual Uncertainty (OBSERVED_FREE, POSSIBLE_OBSTACLE, RESTRICTED, UNKNOWN, OUTSIDE_BOUNDARY)
     - Layer C: QR & Target Observations (QR_CANDIDATE, QR_VERIFYING, QR_CONFIRMED, QR_REJECTED, QR_LOCATION_APPROXIMATE, QR_LOCATION_UNAVAILABLE)
  2. Fast O(1) Geodetic Lookup from (Latitude, Longitude) to Spatial Cell
  3. Real-Time Coverage Percentage & Area Calculations
  4. Backward compatibility with legacy CoverageStatus / TargetStatus
=====================================================================================
"""

import math
import time
from enum import Enum
from typing import Dict, List, Tuple, Optional, Any


class LayerACoverageStatus(str, Enum):
    UNSCANNED = "UNSCANNED"
    SCANNED = "SCANNED"
    PARTIALLY_SCANNED = "PARTIALLY_SCANNED"
    UNCERTAIN = "UNCERTAIN"
    OUTSIDE_BOUNDARY = "OUTSIDE_BOUNDARY"


class LayerBObstacleStatus(str, Enum):
    OBSERVED_FREE = "OBSERVED_FREE"
    POSSIBLE_OBSTACLE = "POSSIBLE_OBSTACLE"
    RESTRICTED = "RESTRICTED"
    UNKNOWN = "UNKNOWN"
    OUTSIDE_BOUNDARY = "OUTSIDE_BOUNDARY"


class LayerCTargetStatus(str, Enum):
    NONE = "NONE"
    QR_CANDIDATE = "QR_CANDIDATE"
    QR_VERIFYING = "QR_VERIFYING"
    QR_CONFIRMED = "QR_CONFIRMED"
    QR_REJECTED = "QR_REJECTED"
    QR_LOCATION_APPROXIMATE = "QR_LOCATION_APPROXIMATE"
    QR_LOCATION_UNAVAILABLE = "QR_LOCATION_UNAVAILABLE"


# Backward compatibility aliases
class CoverageStatus(str, Enum):
    UNEXPLORED = "UNSCANNED"
    EXPLORED = "SCANNED"


class TargetStatus(str, Enum):
    NONE = "NONE"
    DETECTED = "QR_CANDIDATE"
    CANDIDATE = "QR_CANDIDATE"
    VERIFIED = "QR_VERIFYING"
    QR_CONFIRMED = "QR_CONFIRMED"


class SpatialCell:
    """
    Represents an atomic georeferenced spatial cell on the ground maintaining
    three independent perception layers.
    """

    def __init__(
        self,
        cell_id: str,
        row: int,
        col: int,
        latitude: float,
        longitude: float,
        cell_size_m: float
    ):
        self.cell_id = cell_id
        self.row = row
        self.col = col
        self.latitude = latitude
        self.longitude = longitude
        self.cell_size_m = cell_size_m

        # Layer A: Search Coverage
        self.layer_a: LayerACoverageStatus = LayerACoverageStatus.UNSCANNED

        # Layer B: Obstacle & Visual Uncertainty
        self.layer_b: LayerBObstacleStatus = LayerBObstacleStatus.UNKNOWN

        # Layer C: Target Observations
        self.layer_c: LayerCTargetStatus = LayerCTargetStatus.NONE

        # Observation tracking
        self.observation_count: int = 0
        self.detection_score: float = 0.0      # 0.0 to 1.0 (visual classifier)
        self.confidence_score: float = 0.0     # 0.0 to 1.0 (multi-observation fused)
        self.detection_category: str = "GROUND" # "GROUND", "STRUCTURE", "BOX", "QR_PATTERN"
        self.last_observed_time: float = 0.0
        self.first_observed_time: float = 0.0
        self.associated_target_id: Optional[str] = None
        self.two_digit_code: Optional[str] = None
        self.frame_quality_avg: float = 1.0

    @property
    def coverage_status(self) -> str:
        """Backward compatibility property."""
        return "EXPLORED" if self.layer_a == LayerACoverageStatus.SCANNED else "UNEXPLORED"

    @coverage_status.setter
    def coverage_status(self, val: Any):
        if str(val).upper() in ("EXPLORED", "SCANNED"):
            self.layer_a = LayerACoverageStatus.SCANNED
        else:
            self.layer_a = LayerACoverageStatus.UNSCANNED

    @property
    def target_status(self) -> str:
        """Backward compatibility property."""
        return self.layer_c.value

    @target_status.setter
    def target_status(self, val: Any):
        try:
            self.layer_c = LayerCTargetStatus(str(val))
        except ValueError:
            pass

    def mark_observed(
        self,
        frame_quality_score: float = 1.0,
        is_blurred: bool = False,
        timestamp: Optional[float] = None
    ):
        """
        Updates Layer A (Coverage) and Layer B (Obstacle) with actual frame evidence.
        """
        t = timestamp or time.time()
        if self.first_observed_time == 0.0:
            self.first_observed_time = t
        self.observation_count += 1
        self.last_observed_time = t

        # Running average of frame quality
        self.frame_quality_avg = (
            0.7 * self.frame_quality_avg + 0.3 * frame_quality_score
        )

        # Layer A classification
        if is_blurred or frame_quality_score < 0.3:
            if self.layer_a != LayerACoverageStatus.SCANNED:
                self.layer_a = LayerACoverageStatus.UNCERTAIN
        elif frame_quality_score < 0.6:
            if self.layer_a != LayerACoverageStatus.SCANNED:
                self.layer_a = LayerACoverageStatus.PARTIALLY_SCANNED
        else:
            self.layer_a = LayerACoverageStatus.SCANNED

        # Layer B classification (visual perception only)
        if self.layer_a == LayerACoverageStatus.SCANNED:
            if self.layer_b == LayerBObstacleStatus.UNKNOWN:
                self.layer_b = LayerBObstacleStatus.OBSERVED_FREE

    def mark_explored(self, timestamp: Optional[float] = None):
        """Backward compatibility method."""
        self.mark_observed(frame_quality_score=1.0, timestamp=timestamp)

    def update_target_observation(
        self,
        status: LayerCTargetStatus,
        target_id: Optional[str] = None,
        two_digit_code: Optional[str] = None,
        confidence: float = 1.0
    ):
        """Updates Layer C target status."""
        self.layer_c = status
        self.associated_target_id = target_id
        if two_digit_code:
            self.two_digit_code = two_digit_code
        self.confidence_score = confidence

    def to_dict(self) -> Dict[str, Any]:
        return {
            "cell_id": self.cell_id,
            "row": self.row,
            "col": self.col,
            "latitude": round(self.latitude, 7),
            "longitude": round(self.longitude, 7),
            "cell_size_m": self.cell_size_m,
            "layer_a_coverage": self.layer_a.value,
            "layer_b_obstacles": self.layer_b.value,
            "layer_c_targets": self.layer_c.value,
            "coverage_status": self.coverage_status,
            "target_status": self.target_status,
            "observation_count": self.observation_count,
            "detection_score": round(self.detection_score, 2),
            "confidence_score": round(self.confidence_score, 2),
            "two_digit_code": self.two_digit_code,
            "associated_target_id": self.associated_target_id,
            "frame_quality_avg": round(self.frame_quality_avg, 2)
        }


class SpatialGrid:
    """
    Equidistant Cartesian/Geodetic grid covering circular or polygonal mission bounds.
    """

    def __init__(
        self,
        origin_lat: float,
        origin_lon: float,
        cell_size_m: float = 2.0
    ):
        self.origin_lat = origin_lat
        self.origin_lon = origin_lon
        self.cell_size_m = cell_size_m

        # Metric-to-degree scaling approximations
        self.m_per_lat = 111132.954 - 559.822 * math.cos(2 * math.radians(origin_lat))
        self.m_per_lon = 111412.84 * math.cos(math.radians(origin_lat))

        self.lat_step = self.cell_size_m / max(1.0, self.m_per_lat)
        self.lon_step = self.cell_size_m / max(1.0, self.m_per_lon)

        self.cells: Dict[str, SpatialCell] = {}
        self.boundary_type: str = "NONE"

    def initialize_circular_boundary(self, center_lat: float, center_lon: float, radius_m: float):
        """Discretizes a circular search region into spatial cells."""
        self.boundary_type = "CIRCLE"
        num_cells_r = int(math.ceil(radius_m / self.cell_size_m))

        for r in range(-num_cells_r, num_cells_r + 1):
            for c in range(-num_cells_r, num_cells_r + 1):
                dist_m = math.sqrt((r * self.cell_size_m) ** 2 + (c * self.cell_size_m) ** 2)
                if dist_m <= radius_m:
                    cell_lat = center_lat + r * self.lat_step
                    cell_lon = center_lon + c * self.lon_step
                    cell_id = f"R{r}_C{c}"
                    cell = SpatialCell(cell_id, r, c, cell_lat, cell_lon, self.cell_size_m)
                    self.cells[cell_id] = cell

    def initialize_polygonal_boundary(self, polygon_vertices: List[Tuple[float, float]]):
        """Discretizes a polygon into spatial cells using point-in-polygon testing."""
        self.boundary_type = "POLYGON"
        if len(polygon_vertices) < 3:
            return

        lats = [p[0] for p in polygon_vertices]
        lons = [p[1] for p in polygon_vertices]
        min_lat, max_lat = min(lats), max(lats)
        min_lon, max_lon = min(lons), max(lons)

        r_min = int((min_lat - self.origin_lat) / self.lat_step)
        r_max = int((max_lat - self.origin_lat) / self.lat_step) + 1
        c_min = int((min_lon - self.origin_lon) / self.lon_step)
        c_max = int((max_lon - self.origin_lon) / self.lon_step) + 1

        for r in range(r_min, r_max + 1):
            for c in range(c_min, c_max + 1):
                cell_lat = self.origin_lat + r * self.lat_step
                cell_lon = self.origin_lon + c * self.lon_step

                if self._point_in_polygon(cell_lat, cell_lon, polygon_vertices):
                    cell_id = f"R{r}_C{c}"
                    cell = SpatialCell(cell_id, r, c, cell_lat, cell_lon, self.cell_size_m)
                    self.cells[cell_id] = cell

    @staticmethod
    def _point_in_polygon(x: float, y: float, poly: List[Tuple[float, float]]) -> bool:
        """Ray-casting algorithm for 2D point-in-polygon."""
        inside = False
        n = len(poly)
        j = n - 1
        for i in range(n):
            xi, yi = poly[i]
            xj, yj = poly[j]
            if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / max(1e-9, (yj - yi)) + xi):
                inside = not inside
            j = i
        return inside

    def get_cell_at_coords(self, lat: float, lon: float) -> Optional[SpatialCell]:
        """O(1) geodetic cell lookup."""
        r = int(round((lat - self.origin_lat) / self.lat_step))
        c = int(round((lon - self.origin_lon) / self.lon_step))
        cell_id = f"R{r}_C{c}"
        return self.cells.get(cell_id)

    def get_layer_a_metrics(self) -> Dict[str, Any]:
        """Calculates Layer A coverage statistics."""
        total = len(self.cells)
        if total == 0:
            return {"total_cells": 0, "scanned": 0, "partially_scanned": 0, "uncertain": 0, "unscanned": 0, "coverage_pct": 0.0}

        scanned = sum(1 for c in self.cells.values() if c.layer_a == LayerACoverageStatus.SCANNED)
        partially = sum(1 for c in self.cells.values() if c.layer_a == LayerACoverageStatus.PARTIALLY_SCANNED)
        uncertain = sum(1 for c in self.cells.values() if c.layer_a == LayerACoverageStatus.UNCERTAIN)
        unscanned = sum(1 for c in self.cells.values() if c.layer_a == LayerACoverageStatus.UNSCANNED)

        pct = round(((scanned + 0.5 * partially) / total) * 100.0, 1)

        return {
            "total_cells": total,
            "scanned": scanned,
            "partially_scanned": partially,
            "uncertain": uncertain,
            "unscanned": unscanned,
            "coverage_pct": pct
        }
