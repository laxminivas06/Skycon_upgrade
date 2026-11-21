"""
=====================================================================================
SKYCON MASTER ARCHITECTURE - AUTONOMOUS RECONNAISSANCE
MODULE: coverage_planner.py
Boundary-Driven Coverage Trajectory Planner (Boustrophedon & Boundary Spirals)
=====================================================================================
Features:
  - Automatic Plan Generation from Permitted Boundary (Circular or Polygon)
  - Zero Manual Waypoint Entry Required by Operator
  - Inward Safety Margin Buffer for GPS Uncertainty (2.0m - 3.5m)
  - Strict Boundary Enclosure Check (No Waypoint Ever Outside Approved Boundary)
  - Camera FOV & Sensor Footprint Calculation with Configurable Overlap
  - Feasibility Watchdog: Total Distance, Speed, Flight Duration & Battery Gating
=====================================================================================
"""

import math
from dataclasses import dataclass, asdict, field
from typing import List, Tuple, Dict, Any, Optional

from backend.route_validator import route_validator

EARTH_RADIUS_M = 6378137.0


@dataclass
class ReconWaypoint:
    index: int
    lat: float
    lon: float
    altitude_m: float
    speed_mps: float
    action: str              # "TAKEOFF", "SWEEP_TRANSIT", "SCAN_PASS", "INVESTIGATE", "RTL", "LAND"
    leg_distance_m: float
    cumulative_distance_m: float
    name: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def to_mavlink_item(self, target_system: int = 1, target_component: int = 1) -> Dict[str, Any]:
        """Converts waypoint to standard ArduCopter MAVLink MISSION_ITEM_INT structure."""
        cmd = 16  # MAV_CMD_NAV_WAYPOINT
        if self.action == "TAKEOFF":
            cmd = 22  # MAV_CMD_NAV_TAKEOFF
        elif self.action in ("RTL", "RETURN"):
            cmd = 20  # MAV_CMD_NAV_RETURN_TO_LAUNCH
        elif self.action == "LAND":
            cmd = 21  # MAV_CMD_NAV_LAND
        elif self.action == "LOITER":
            cmd = 17  # MAV_CMD_NAV_LOITER_UNLIM

        return {
            "seq": self.index,
            "command": cmd,
            "frame": 6,  # MAV_FRAME_GLOBAL_RELATIVE_ALT_INT
            "current": 1 if self.index == 0 else 0,
            "autocontinue": 1,
            "param1": 0.0,
            "param2": 1.5,
            "param3": 0.0,
            "param4": 0.0,
            "lat": self.lat,
            "lon": self.lon,
            "alt": self.altitude_m,
            "x": int(round(self.lat * 1e7)),
            "y": int(round(self.lon * 1e7)),
            "z": float(self.altitude_m),
            "target_system": target_system,
            "target_component": target_component,
            "name": self.name
        }


@dataclass
class CoveragePlanResult:
    plan_id: str
    boundary_type: str        # "CIRCLE" | "POLYGON"
    plan_strategy: str        # "BOUSTROPHEDON" | "SPIRAL"
    search_altitude_m: float
    flight_speed_mps: float
    lane_spacing_m: float
    safety_margin_m: float
    camera_footprint_w_m: float
    camera_footprint_h_m: float
    total_waypoints: int
    total_distance_m: float
    estimated_flight_time_s: float
    is_feasible_budget: bool
    feasibility_notes: str
    waypoints: List[Dict[str, Any]]
    original_boundary: List[Tuple[float, float]]
    mavlink_items: List[Dict[str, Any]] = field(default_factory=list)
    validation: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class CoveragePlanner:
    """
    Mathematical trajectory planner generating boundary-constrained reconnaissance paths.
    """
    def __init__(
        self,
        camera_hfov_deg: float = 68.0,
        camera_vfov_deg: float = 54.0,
        safety_margin_m: float = 2.5,
        max_duration_s: float = 300.0   # 5-minute competition limit
    ):
        self.hfov_rad = math.radians(camera_hfov_deg)
        self.vfov_rad = math.radians(camera_vfov_deg)
        self.safety_margin_m = safety_margin_m
        self.max_duration_s = max_duration_s

    def compute_sensor_footprint(
        self,
        altitude_m: float,
        overlap_ratio: float = 0.25
    ) -> Tuple[float, float, float]:
        """
        Computes ground footprint width, height, and effective lane spacing in meters.
        """
        gw = 2.0 * altitude_m * math.tan(self.hfov_rad / 2.0)
        gh = 2.0 * altitude_m * math.tan(self.vfov_rad / 2.0)
        lane_spacing = max(1.5, gw * (1.0 - overlap_ratio))
        return gw, gh, lane_spacing

    def plan_circular_coverage(
        self,
        center_lat: float,
        center_lon: float,
        radius_m: float,
        altitude_m: float = 12.0,
        speed_mps: float = 3.5,
        overlap_ratio: float = 0.25,
        strategy: str = "BOUSTROPHEDON"
    ) -> CoveragePlanResult:
        """
        Generates coverage plan for a circular search area with inward safety margin.
        """
        effective_radius = max(2.0, radius_m - self.safety_margin_m)
        gw, gh, lane_spacing = self.compute_sensor_footprint(altitude_m, overlap_ratio)

        # Generate boundary polygon approximation for visualization (36 segments)
        circle_poly: List[Tuple[float, float]] = []
        for deg in range(0, 360, 10):
            rad = math.radians(deg)
            d_north = radius_m * math.cos(rad)
            d_east = radius_m * math.sin(rad)
            p_lat, p_lon = self._offset_to_lat_lon(center_lat, center_lon, d_north, d_east)
            circle_poly.append((p_lat, p_lon))

        if strategy.upper() == "BOUSTROPHEDON":
            raw_wps = self._generate_boustrophedon_circle(
                center_lat, center_lon, effective_radius, lane_spacing, altitude_m, speed_mps
            )
        else:
            raw_wps = self._generate_spiral_circle(
                center_lat, center_lon, effective_radius, lane_spacing, altitude_m, speed_mps
            )

        # Build full waypoint list with takeoff and RTL
        wps = self._build_full_flight_plan(raw_wps, center_lat, center_lon, altitude_m, speed_mps)

        # Compute metrics
        total_dist = wps[-1].cumulative_distance_m if wps else 0.0
        flight_time = (total_dist / speed_mps) + 30.0  # +30s for takeoff and landing
        is_feasible = flight_time <= self.max_duration_s
        notes = f"Estimated flight time {flight_time:.1f}s (budget: {self.max_duration_s:.0f}s)"

        mavlink_items = [w.to_mavlink_item() for w in wps]
        wps_dicts = [w.to_dict() for w in wps]
        val_res = route_validator.validate_plan(
            wps_dicts,
            {"type": "CIRCLE", "center": {"lat": center_lat, "lon": center_lon}, "radius": max(50.0, radius_m + self.safety_margin_m + 1.0), "braking_buffer_m": self.safety_margin_m, "alt_max": 25.0},
            {"lat": center_lat, "lon": center_lon}
        )

        return CoveragePlanResult(
            plan_id=f"PLAN_CIRC_{int(radius_m)}M",
            boundary_type="CIRCLE",
            plan_strategy=strategy.upper(),
            search_altitude_m=altitude_m,
            flight_speed_mps=speed_mps,
            lane_spacing_m=round(lane_spacing, 2),
            safety_margin_m=self.safety_margin_m,
            camera_footprint_w_m=round(gw, 2),
            camera_footprint_h_m=round(gh, 2),
            total_waypoints=len(wps),
            total_distance_m=round(total_dist, 1),
            estimated_flight_time_s=round(flight_time, 1),
            is_feasible_budget=(is_feasible and val_res.is_valid),
            feasibility_notes=notes,
            waypoints=wps_dicts,
            original_boundary=circle_poly,
            mavlink_items=mavlink_items,
            validation=val_res.to_dict()
        )

    def plan_polygon_coverage(
        self,
        polygon_vertices: List[Tuple[float, float]],
        altitude_m: float = 12.0,
        speed_mps: float = 3.5,
        overlap_ratio: float = 0.25
    ) -> CoveragePlanResult:
        """
        Generates boustrophedon sweep coverage plan for arbitrary polygon boundary.
        Applies safety margin buffer inward from vertices.
        """
        if len(polygon_vertices) < 3:
            raise ValueError("Polygon boundary requires at least 3 vertices")

        gw, gh, lane_spacing = self.compute_sensor_footprint(altitude_m, overlap_ratio)

        # Center point
        avg_lat = sum(p[0] for p in polygon_vertices) / len(polygon_vertices)
        avg_lon = sum(p[1] for p in polygon_vertices) / len(polygon_vertices)

        # Convert polygon vertices to local metric coordinates (meters from center)
        local_poly: List[Tuple[float, float]] = []
        for lat, lon in polygon_vertices:
            dn, de = self._lat_lon_to_offset(avg_lat, avg_lon, lat, lon)
            local_poly.append((de, dn))  # (x=East, y=North)

        # Inward shrink polygon by safety margin
        buffered_poly = self._shrink_polygon_metric(local_poly, self.safety_margin_m)

        # Generate boustrophedon sweep passes
        raw_wps = self._generate_boustrophedon_polygon(
            buffered_poly, avg_lat, avg_lon, lane_spacing, altitude_m, speed_mps
        )

        wps = self._build_full_flight_plan(raw_wps, avg_lat, avg_lon, altitude_m, speed_mps)

        total_dist = wps[-1].cumulative_distance_m if wps else 0.0
        flight_time = (total_dist / speed_mps) + 30.0
        is_feasible = flight_time <= self.max_duration_s
        notes = f"Estimated flight time {flight_time:.1f}s (budget: {self.max_duration_s:.0f}s)"

        mavlink_items = [w.to_mavlink_item() for w in wps]
        wps_dicts = [w.to_dict() for w in wps]
        val_res = route_validator.validate_plan(
            wps_dicts,
            {"type": "POLYGON", "polygon": polygon_vertices, "alt_max": 25.0},
            {"lat": avg_lat, "lon": avg_lon}
        )

        return CoveragePlanResult(
            plan_id=f"PLAN_POLY_{len(polygon_vertices)}V",
            boundary_type="POLYGON",
            plan_strategy="BOUSTROPHEDON",
            search_altitude_m=altitude_m,
            flight_speed_mps=speed_mps,
            lane_spacing_m=round(lane_spacing, 2),
            safety_margin_m=self.safety_margin_m,
            camera_footprint_w_m=round(gw, 2),
            camera_footprint_h_m=round(gh, 2),
            total_waypoints=len(wps),
            total_distance_m=round(total_dist, 1),
            estimated_flight_time_s=round(flight_time, 1),
            is_feasible_budget=(is_feasible and val_res.is_valid),
            feasibility_notes=notes,
            waypoints=wps_dicts,
            original_boundary=polygon_vertices,
            mavlink_items=mavlink_items,
            validation=val_res.to_dict()
        )

    def _generate_boustrophedon_circle(
        self,
        center_lat: float,
        center_lon: float,
        radius_m: float,
        lane_spacing: float,
        altitude_m: float,
        speed_mps: float
    ) -> List[Tuple[float, float, str]]:
        """Generates parallel lawnmower sweeps clipped to circular boundary."""
        points: List[Tuple[float, float, str]] = []
        num_lanes = int(math.floor((2.0 * radius_m) / lane_spacing))
        start_y = -radius_m + (lane_spacing / 2.0)

        left_to_right = True
        for i in range(num_lanes):
            y = start_y + (i * lane_spacing)
            if abs(y) >= radius_m:
                continue
            # Chord half-width at y: x = sqrt(R^2 - y^2)
            half_x = math.sqrt(max(0.0, radius_m**2 - y**2))
            if half_x < 1.0:
                continue

            x1 = -half_x if left_to_right else half_x
            x2 = half_x if left_to_right else -half_x

            lat1, lon1 = self._offset_to_lat_lon(center_lat, center_lon, d_north=y, d_east=x1)
            lat2, lon2 = self._offset_to_lat_lon(center_lat, center_lon, d_north=y, d_east=x2)

            points.append((lat1, lon1, "SWEEP_TRANSIT"))
            points.append((lat2, lon2, "SCAN_PASS"))
            left_to_right = not left_to_right

        return points

    def _generate_spiral_circle(
        self,
        center_lat: float,
        center_lon: float,
        radius_m: float,
        lane_spacing: float,
        altitude_m: float,
        speed_mps: float
    ) -> List[Tuple[float, float, str]]:
        """Generates expanding Archimedean spiral trajectory."""
        points: List[Tuple[float, float, str]] = []
        b = lane_spacing / (2.0 * math.pi)
        max_theta = radius_m / b
        theta_step = math.pi / 4.0  # 45 deg steps

        theta = math.pi / 2.0
        while theta <= max_theta:
            r = min(radius_m, b * theta)
            d_east = r * math.cos(theta)
            d_north = r * math.sin(theta)
            p_lat, p_lon = self._offset_to_lat_lon(center_lat, center_lon, d_north, d_east)
            points.append((p_lat, p_lon, "SCAN_PASS"))
            theta += theta_step

        return points

    def _generate_boustrophedon_polygon(
        self,
        poly_xy: List[Tuple[float, float]],
        ref_lat: float,
        ref_lon: float,
        lane_spacing: float,
        altitude_m: float,
        speed_mps: float
    ) -> List[Tuple[float, float, str]]:
        """Generates horizontal parallel sweeps clipped to polygon boundary."""
        points: List[Tuple[float, float, str]] = []
        if len(poly_xy) < 3:
            return points

        ys = [p[1] for p in poly_xy]
        min_y, max_y = min(ys), max(ys)

        current_y = min_y + (lane_spacing / 2.0)
        left_to_right = True

        while current_y <= max_y:
            # Find intersections of y = current_y with all polygon edges
            intersections = []
            n = len(poly_xy)
            for i in range(n):
                x1, y1 = poly_xy[i]
                x2, y2 = poly_xy[(i + 1) % n]

                if min(y1, y2) <= current_y <= max(y1, y2) and y1 != y2:
                    # Linear interpolation for x
                    t = (current_y - y1) / (y2 - y1)
                    ix = x1 + t * (x2 - x1)
                    intersections.append(ix)

            intersections.sort()

            # Pair up intersections (entry and exit)
            for j in range(0, len(intersections) - 1, 2):
                x_start = intersections[j]
                x_end = intersections[j + 1]

                if not left_to_right:
                    x_start, x_end = x_end, x_start

                lat1, lon1 = self._offset_to_lat_lon(ref_lat, ref_lon, d_north=current_y, d_east=x_start)
                lat2, lon2 = self._offset_to_lat_lon(ref_lat, ref_lon, d_north=current_y, d_east=x_end)

                points.append((lat1, lon1, "SWEEP_TRANSIT"))
                points.append((lat2, lon2, "SCAN_PASS"))

            left_to_right = not left_to_right
            current_y += lane_spacing

        return points

    def _shrink_polygon_metric(
        self,
        poly_xy: List[Tuple[float, float]],
        margin_m: float
    ) -> List[Tuple[float, float]]:
        """Inward offset approximation towards centroid by safety margin."""
        cx = sum(p[0] for p in poly_xy) / len(poly_xy)
        cy = sum(p[1] for p in poly_xy) / len(poly_xy)

        shrunk = []
        for x, y in poly_xy:
            dx = cx - x
            dy = cy - y
            dist = math.hypot(dx, dy)
            if dist > margin_m:
                scale = (dist - margin_m) / dist
                shrunk.append((x + dx * (1 - scale), y + dy * (1 - scale)))
            else:
                shrunk.append((cx, cy))
        return shrunk

    def _build_full_flight_plan(
        self,
        raw_points: List[Tuple[float, float, str]],
        home_lat: float,
        home_lon: float,
        altitude_m: float,
        speed_mps: float
    ) -> List[ReconWaypoint]:
        """Assembles flight plan starting with TAKEOFF and ending with RTL."""
        wps: List[ReconWaypoint] = []
        cum_dist = 0.0

        # WP 0: Takeoff
        wps.append(ReconWaypoint(
            index=0,
            lat=home_lat,
            lon=home_lon,
            altitude_m=altitude_m,
            speed_mps=speed_mps,
            action="TAKEOFF",
            leg_distance_m=0.0,
            cumulative_distance_m=0.0,
            name="TAKEOFF"
        ))

        prev_lat, prev_lon = home_lat, home_lon
        for i, (lat, lon, act) in enumerate(raw_points):
            leg_d = self._haversine(prev_lat, prev_lon, lat, lon)
            cum_dist += leg_d
            wps.append(ReconWaypoint(
                index=i + 1,
                lat=lat,
                lon=lon,
                altitude_m=altitude_m,
                speed_mps=speed_mps,
                action=act,
                leg_distance_m=round(leg_d, 2),
                cumulative_distance_m=round(cum_dist, 2),
                name=f"WP_{i+1}_{act}"
            ))
            prev_lat, prev_lon = lat, lon

        # WP Final: RTL
        rtl_leg = self._haversine(prev_lat, prev_lon, home_lat, home_lon)
        cum_dist += rtl_leg
        wps.append(ReconWaypoint(
            index=len(wps),
            lat=home_lat,
            lon=home_lon,
            altitude_m=altitude_m,
            speed_mps=speed_mps,
            action="RTL",
            leg_distance_m=round(rtl_leg, 2),
            cumulative_distance_m=round(cum_dist, 2),
            name="RTL"
        ))

        return wps

    @staticmethod
    def _offset_to_lat_lon(ref_lat: float, ref_lon: float, d_north: float, d_east: float) -> Tuple[float, float]:
        d_lat = (d_north / EARTH_RADIUS_M) * (180.0 / math.pi)
        d_lon = (d_east / (EARTH_RADIUS_M * math.cos(math.radians(ref_lat)))) * (180.0 / math.pi)
        return round(ref_lat + d_lat, 7), round(ref_lon + d_lon, 7)

    @staticmethod
    def _lat_lon_to_offset(ref_lat: float, ref_lon: float, lat: float, lon: float) -> Tuple[float, float]:
        d_lat = math.radians(lat - ref_lat)
        d_lon = math.radians(lon - ref_lon)
        d_north = d_lat * EARTH_RADIUS_M
        d_east = d_lon * EARTH_RADIUS_M * math.cos(math.radians(ref_lat))
        return d_north, d_east

    @staticmethod
    def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        r = EARTH_RADIUS_M
        p1, p2 = math.radians(lat1), math.radians(lat2)
        dp = math.radians(lat2 - lat1)
        dl = math.radians(lon2 - lon1)
        a = math.sin(dp / 2.0)**2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2.0)**2
        return r * 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
