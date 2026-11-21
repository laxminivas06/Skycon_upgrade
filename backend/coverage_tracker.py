"""
=====================================================================================
SKYCON MASTER ARCHITECTURE - ONBOARD REAL-TIME GRID COVERAGE TRACKER
MODULE: coverage_tracker.py
Discrete Spatial Cell Matrix, Optical Footprint Accounting & Missed Cell Detection
=====================================================================================
Features:
  - 100% Air-Gapped Local Operation: Zero Cloud or Internet Access Required
  - Metric Cell Discretization (2.0m x 2.0m default resolution) over Search Boundary
  - Real-Time Camera Optical Footprint Projection based on Vehicle Altitude & FOV
  - Dynamic Visited Cell Accumulation & Multi-Pass Accounting
  - Missed Coverage Detection & Percentage Calculations (0.0% - 100.0%)
  - GeoJSON-Compatible Bounding Box and Cell Grid for Ground Station HUD
=====================================================================================
"""

import math
import time
import threading
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Tuple, Optional, Set

from backend.route_validator import haversine_distance, point_in_polygon

EARTH_RADIUS_M = 6378137.0


@dataclass
class GridCell:
    cell_id: str
    row: int
    col: int
    center_lat: float
    center_lon: float
    visited: bool = False
    visit_count: int = 0
    first_visited_at: Optional[float] = None
    last_visited_at: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class CoverageTracker:
    """
    Onboard real-time spatial grid coverage tracker computing physical ground coverage
    from live telemetry and camera footprint without requiring cloud connectivity.
    """

    def __init__(
        self,
        cell_size_m: float = 2.0,
        camera_hfov_deg: float = 68.0,
        camera_vfov_deg: float = 54.0
    ):
        self.cell_size_m = cell_size_m
        self.camera_hfov_deg = camera_hfov_deg
        self.camera_vfov_deg = camera_vfov_deg

        self._lock = threading.RLock()
        self.is_initialized: bool = False
        self.origin_lat: float = 0.0
        self.origin_lon: float = 0.0
        self.min_lat: float = 0.0
        self.max_lat: float = 0.0
        self.min_lon: float = 0.0
        self.max_lon: float = 0.0

        self.rows: int = 0
        self.cols: int = 0
        self.cells: Dict[str, GridCell] = {}
        self.visited_cell_ids: Set[str] = set()
        self.boundary_polygon: Optional[List[Tuple[float, float]]] = None

        self.total_scanned_area_m2: float = 0.0
        self.total_target_area_m2: float = 0.0
        self.last_update_time: float = 0.0

    def initialize_grid(
        self,
        boundary: List[Tuple[float, float]],
        center_lat: Optional[float] = None,
        center_lon: Optional[float] = None,
        radius_m: Optional[float] = None
    ):
        """
        Initializes a discrete cell grid matching either a polygon or circular boundary.
        """
        with self._lock:
            self.cells.clear()
            self.visited_cell_ids.clear()
            self.boundary_polygon = boundary

            if not boundary or len(boundary) < 3:
                # If circular boundary given with radius
                if center_lat and center_lon and radius_m:
                    d_lat = (radius_m / EARTH_RADIUS_M) * (180.0 / math.pi)
                    d_lon = (radius_m / (EARTH_RADIUS_M * math.cos(math.radians(center_lat)))) * (180.0 / math.pi)
                    self.min_lat = center_lat - d_lat
                    self.max_lat = center_lat + d_lat
                    self.min_lon = center_lon - d_lon
                    self.max_lon = center_lon + d_lon
                else:
                    return
            else:
                lats = [p[0] for p in boundary]
                lons = [p[1] for p in boundary]
                self.min_lat, self.max_lat = min(lats), max(lats)
                self.min_lon, self.max_lon = min(lons), max(lons)

            self.origin_lat = self.min_lat
            self.origin_lon = self.min_lon

            # Convert bounding box to metric dimensions
            lat_dist_m = haversine_distance(self.min_lat, self.min_lon, self.max_lat, self.min_lon)
            lon_dist_m = haversine_distance(self.min_lat, self.min_lon, self.min_lat, self.max_lon)

            # Cap grid dimension to 50x50 maximum to keep memory bounded on RPi
            self.rows = max(2, min(50, int(math.ceil(lat_dist_m / self.cell_size_m))))
            self.cols = max(2, min(50, int(math.ceil(lon_dist_m / self.cell_size_m))))

            lat_step = (self.max_lat - self.min_lat) / max(1, self.rows)
            lon_step = (self.max_lon - self.min_lon) / max(1, self.cols)

            for r in range(self.rows):
                for c in range(self.cols):
                    c_lat = self.min_lat + (r + 0.5) * lat_step
                    c_lon = self.min_lon + (c + 0.5) * lon_step
                    cell_id = f"c_{r}_{c}"

                    # Filter cells outside polygon if polygon boundary provided
                    if boundary and len(boundary) >= 3:
                        if not point_in_polygon(c_lat, c_lon, boundary):
                            continue

                    self.cells[cell_id] = GridCell(
                        cell_id=cell_id,
                        row=r,
                        col=c,
                        center_lat=round(c_lat, 7),
                        center_lon=round(c_lon, 7)
                    )

            self.total_target_area_m2 = len(self.cells) * (self.cell_size_m ** 2)
            self.total_scanned_area_m2 = 0.0
            self.is_initialized = True
            self.last_update_time = time.time()

    def update_coverage(
        self,
        drone_lat: float,
        drone_lon: float,
        altitude_agl_m: float,
        heading_deg: float = 0.0
    ) -> int:
        """
        Updates grid coverage based on current drone pose and camera optical footprint.
        Returns number of newly visited cells in this update.
        """
        if not self.is_initialized or abs(drone_lat) < 0.001 or altitude_agl_m < 1.0:
            return 0

        with self._lock:
            now = time.time()
            self.last_update_time = now

            # Calculate camera ground footprint radius at current altitude
            # Footprint half-width = alt * tan(HFOV / 2)
            fp_w = altitude_agl_m * math.tan(math.radians(self.camera_hfov_deg / 2.0))
            fp_h = altitude_agl_m * math.tan(math.radians(self.camera_vfov_deg / 2.0))
            footprint_radius_m = max(self.cell_size_m, max(fp_w, fp_h))

            newly_visited = 0
            for cell_id, cell in self.cells.items():
                dist_m = haversine_distance(drone_lat, drone_lon, cell.center_lat, cell.center_lon)
                if dist_m <= footprint_radius_m:
                    if not cell.visited:
                        cell.visited = True
                        cell.first_visited_at = now
                        self.visited_cell_ids.add(cell_id)
                        newly_visited += 1
                    cell.visit_count += 1
                    cell.last_visited_at = now

            self.total_scanned_area_m2 = len(self.visited_cell_ids) * (self.cell_size_m ** 2)
            return newly_visited

    def get_status(self) -> Dict[str, Any]:
        """Returns comprehensive coverage metrics for Ground Station telemetry."""
        with self._lock:
            total = len(self.cells)
            visited = len(self.visited_cell_ids)
            missed = max(0, total - visited)
            pct = (visited / total * 100.0) if total > 0 else 0.0

            return {
                "initialized": self.is_initialized,
                "total_cells": total,
                "visited_cells": visited,
                "missed_cells": missed,
                "coverage_pct": round(pct, 1),
                "total_area_m2": round(self.total_target_area_m2, 1),
                "scanned_area_m2": round(self.total_scanned_area_m2, 1),
                "cell_size_m": self.cell_size_m,
                "grid_dimensions": {"rows": self.rows, "cols": self.cols},
                "bounds": {
                    "min_lat": self.min_lat,
                    "max_lat": self.max_lat,
                    "min_lon": self.min_lon,
                    "max_lon": self.max_lon
                },
                "last_update_time": self.last_update_time
            }

    def reset(self):
        """Resets all coverage data for a new sortie."""
        with self._lock:
            for cell in self.cells.values():
                cell.visited = False
                cell.visit_count = 0
                cell.first_visited_at = None
                cell.last_visited_at = None
            self.visited_cell_ids.clear()
            self.total_scanned_area_m2 = 0.0


# Global singleton tracker instance
coverage_tracker = CoverageTracker()
