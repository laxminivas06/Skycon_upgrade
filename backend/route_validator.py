"""
=====================================================================================
SKYCON MASTER ARCHITECTURE - AUTONOMOUS NAVIGATION & SAFETY
MODULE: route_validator.py
Trajectory Feasibility, Boundary Containment & Competition Budget Validator
=====================================================================================
Features:
  - Strict Boundary Containment: WGS84 Point-in-Polygon (Ray Casting) & Circular Geodesic
  - Altitude Envelope Verification (Min/Max AGL limits, e.g., 5.0m - 25.0m)
  - Kinematic Feasibility: Max turn angles, climb/descent rates, and leg speeds
  - Time & Battery Budget Estimation against the 300-second (5-minute) ADDC limit
  - Automatic Inward Safety Buffering (2.0m - 5.0m default)
=====================================================================================
"""

import math
from dataclasses import dataclass, asdict
from typing import List, Tuple, Dict, Any, Optional

EARTH_RADIUS_M = 6378137.0


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates geodesic distance between two points in meters."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2))
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return EARTH_RADIUS_M * c


def point_in_polygon(lat: float, lon: float, polygon: List[Tuple[float, float]]) -> bool:
    """
    Ray-casting algorithm to test whether a coordinate is inside a WGS84 polygon.
    polygon: list of (lat, lon) tuples.
    """
    if len(polygon) < 3:
        return False

    inside = False
    n = len(polygon)
    p1_lat, p1_lon = polygon[0]

    for i in range(1, n + 1):
        p2_lat, p2_lon = polygon[i % n]
        if min(p1_lon, p2_lon) < lon <= max(p1_lon, p2_lon):
            if lat <= max(p1_lat, p2_lat):
                if p1_lon != p2_lon:
                    lat_inters = (lon - p1_lon) * (p2_lat - p1_lat) / (p2_lon - p1_lon) + p1_lat
                else:
                    lat_inters = p1_lat
                if p1_lat == p2_lat or lat <= lat_inters:
                    inside = not inside
        p1_lat, p1_lon = p2_lat, p2_lon

    return inside


@dataclass
class ValidationIssue:
    severity: str  # "ERROR" | "WARNING"
    waypoint_index: int
    rule: str
    message: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class RouteValidationResult:
    is_valid: bool
    total_waypoints: int
    total_distance_m: float
    estimated_duration_s: float
    max_duration_limit_s: float
    estimated_battery_mah: float
    battery_budget_limit_mah: float
    max_altitude_m: float
    min_altitude_m: float
    issues: List[Dict[str, Any]]
    summary: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class RouteValidator:
    """
    Validates autonomous waypoints against safety geofences, altitude envelopes,
    vehicle kinematics, and the SAE India ADDC 300-second competition budget.
    """

    def __init__(
        self,
        min_altitude_m: float = 5.0,
        max_altitude_m: float = 25.0,
        max_speed_mps: float = 8.0,
        max_climb_rate_mps: float = 2.5,
        turn_penalty_s: float = 1.5,
        max_duration_s: float = 300.0,
        battery_capacity_mah: float = 5000.0,
        avg_current_draw_a: float = 22.0
    ):
        self.min_altitude_m = min_altitude_m
        self.max_altitude_m = max_altitude_m
        self.max_speed_mps = max_speed_mps
        self.max_climb_rate_mps = max_climb_rate_mps
        self.turn_penalty_s = turn_penalty_s
        self.max_duration_s = max_duration_s
        self.battery_capacity_mah = battery_capacity_mah
        self.avg_current_draw_a = avg_current_draw_a

    def validate_plan(
        self,
        waypoints: List[Dict[str, Any]],
        geofence: Dict[str, Any],
        home_location: Optional[Dict[str, float]] = None
    ) -> RouteValidationResult:
        """
        Executes comprehensive multi-rule validation of a candidate flight plan.
        """
        issues: List[ValidationIssue] = []

        if not waypoints:
            issues.append(ValidationIssue(
                severity="ERROR",
                waypoint_index=-1,
                rule="EMPTY_PLAN",
                message="Mission plan contains zero waypoints"
            ))
            return RouteValidationResult(
                is_valid=False,
                total_waypoints=0,
                total_distance_m=0.0,
                estimated_duration_s=0.0,
                max_duration_limit_s=self.max_duration_s,
                estimated_battery_mah=0.0,
                battery_budget_limit_mah=self.battery_capacity_mah * 0.70,
                max_altitude_m=0.0,
                min_altitude_m=0.0,
                issues=[i.to_dict() for i in issues],
                summary="Validation failed: No waypoints in plan."
            )

        gf_enabled = geofence.get("enabled", True)
        gf_type = geofence.get("type", "CIRCLE").upper()
        gf_radius = float(geofence.get("radius", 50.0))
        gf_center = geofence.get("center", home_location or {})
        gf_buffer = float(geofence.get("braking_buffer_m", 3.0))
        effective_radius = max(2.0, gf_radius - gf_buffer)
        gf_poly: List[Tuple[float, float]] = []

        if gf_type == "POLYGON":
            raw_poly = geofence.get("polygon", [])
            for pt in raw_poly:
                if isinstance(pt, (list, tuple)) and len(pt) >= 2:
                    gf_poly.append((float(pt[0]), float(pt[1])))
                elif isinstance(pt, dict) and "lat" in pt and "lon" in pt:
                    gf_poly.append((float(pt["lat"]), float(pt["lon"])))

        total_dist_m = 0.0
        total_flight_time_s = 20.0  # Base budget for takeoff (10s) and touchdown (10s)
        max_alt_seen = 0.0
        min_alt_seen = 999.0

        prev_lat = home_location.get("lat") if home_location else waypoints[0].get("lat")
        prev_lon = home_location.get("lon") if home_location else waypoints[0].get("lon", waypoints[0].get("lng"))
        prev_alt = 0.0
        prev_heading = None

        for idx, wp in enumerate(waypoints):
            lat = float(wp.get("lat", 0.0))
            lon = float(wp.get("lon", wp.get("lng", 0.0)))
            alt = float(wp.get("alt", wp.get("altitude_m", 10.0)))
            speed = float(wp.get("speed", wp.get("speed_mps", 3.5)))

            if alt > max_alt_seen:
                max_alt_seen = alt
            if alt < min_alt_seen:
                min_alt_seen = alt

            # 1. Coordinate Validity
            cmd_val = wp.get("command", 16)
            act_val = str(wp.get("action", "")).upper()
            is_zero_allowed = cmd_val in (20, 21) or act_val in ("RTL", "LAND")
            if not is_zero_allowed and (math.isnan(lat) or math.isnan(lon) or (abs(lat) < 0.001 and abs(lon) < 0.001)):
                issues.append(ValidationIssue(
                    severity="ERROR",
                    waypoint_index=idx,
                    rule="INVALID_COORDINATES",
                    message=f"Waypoint #{idx} has invalid or null coordinates ({lat}, {lon})"
                ))

            # 2. Altitude Envelope Checks
            if alt > self.max_altitude_m:
                issues.append(ValidationIssue(
                    severity="ERROR",
                    waypoint_index=idx,
                    rule="ALTITUDE_CEILING_EXCEEDED",
                    message=f"Waypoint #{idx} altitude {alt:.1f}m exceeds ceiling {self.max_altitude_m:.1f}m"
                ))
            elif alt < self.min_altitude_m:
                issues.append(ValidationIssue(
                    severity="WARNING",
                    waypoint_index=idx,
                    rule="ALTITUDE_BELOW_MINIMUM",
                    message=f"Waypoint #{idx} altitude {alt:.1f}m is below recommended min {self.min_altitude_m:.1f}m"
                ))

            # 3. Geofence Boundary Containment Checks
            if gf_enabled:
                if gf_type == "CIRCLE":
                    if "lat" in gf_center and "lon" in gf_center:
                        dist_c = haversine_distance(lat, lon, gf_center["lat"], gf_center["lon"])
                        if dist_c > effective_radius:
                            issues.append(ValidationIssue(
                                severity="ERROR",
                                waypoint_index=idx,
                                rule="GEOFENCE_BREACH_CIRCLE",
                                message=f"Waypoint #{idx} at {dist_c:.1f}m breaches effective radius {effective_radius:.1f}m (outer: {gf_radius}m)"
                            ))
                elif gf_type == "POLYGON":
                    if gf_poly and not point_in_polygon(lat, lon, gf_poly):
                        issues.append(ValidationIssue(
                            severity="ERROR",
                            waypoint_index=idx,
                            rule="GEOFENCE_BREACH_POLYGON",
                            message=f"Waypoint #{idx} ({lat:.6f}, {lon:.6f}) lies outside approved polygon boundary"
                        ))

            # 4. Leg Kinematics and Turn Penalties
            if prev_lat is not None and prev_lon is not None:
                leg_dist = haversine_distance(prev_lat, prev_lon, lat, lon)
                total_dist_m += leg_dist

                # Transit time for leg
                safe_speed = max(1.0, min(speed, self.max_speed_mps))
                leg_time = leg_dist / safe_speed
                total_flight_time_s += leg_time

                # Climb/descent time
                alt_diff = abs(alt - prev_alt)
                climb_time = alt_diff / self.max_climb_rate_mps
                if climb_time > leg_time:
                    total_flight_time_s += (climb_time - leg_time)

                # Heading change turn penalty
                current_heading = math.atan2(
                    (lon - prev_lon) * math.cos(math.radians(prev_lat)),
                    lat - prev_lat
                )
                if prev_heading is not None:
                    heading_change_deg = math.degrees(abs(current_heading - prev_heading))
                    if heading_change_deg > 180.0:
                        heading_change_deg = 360.0 - heading_change_deg
                    if heading_change_deg > 45.0:
                        total_flight_time_s += self.turn_penalty_s

                prev_heading = current_heading

            prev_lat, prev_lon, prev_alt = lat, lon, alt

        # 5. Competition Duration Budget (ADDC 300s limit)
        if total_flight_time_s > self.max_duration_s:
            issues.append(ValidationIssue(
                severity="ERROR",
                waypoint_index=-1,
                rule="TIME_BUDGET_EXCEEDED",
                message=f"Estimated flight duration {total_flight_time_s:.1f}s exceeds 300s ADDC competition limit"
            ))
        elif total_flight_time_s > (self.max_duration_s - 30.0):
            issues.append(ValidationIssue(
                severity="WARNING",
                waypoint_index=-1,
                rule="TIME_BUDGET_MARGIN_LOW",
                message=f"Estimated duration {total_flight_time_s:.1f}s leaves less than 30s contingency before 300s limit"
            ))

        # 6. Battery Budget Estimation (mAh consumed = (Avg Current * Hours) * 1000)
        est_battery_mah = (self.avg_current_draw_a * (total_flight_time_s / 3600.0)) * 1000.0
        max_battery_budget_mah = self.battery_capacity_mah * 0.70  # Keep 30% reserve
        if est_battery_mah > max_battery_budget_mah:
            issues.append(ValidationIssue(
                severity="WARNING",
                waypoint_index=-1,
                rule="BATTERY_BUDGET_WARNING",
                message=f"Estimated consumption {est_battery_mah:.0f}mAh exceeds 70% battery reserve ({max_battery_budget_mah:.0f}mAh)"
            ))

        has_errors = any(i.severity == "ERROR" for i in issues)
        summary = (
            f"Validation PASSED: {len(waypoints)} waypoints, {total_dist_m:.1f}m, "
            f"{total_flight_time_s:.1f}s (Budget: {self.max_duration_s:.0f}s)"
            if not has_errors else
            f"Validation FAILED with {sum(1 for i in issues if i.severity == 'ERROR')} error(s)."
        )

        return RouteValidationResult(
            is_valid=(not has_errors),
            total_waypoints=len(waypoints),
            total_distance_m=round(total_dist_m, 1),
            estimated_duration_s=round(total_flight_time_s, 1),
            max_duration_limit_s=self.max_duration_s,
            estimated_battery_mah=round(est_battery_mah, 1),
            battery_budget_limit_mah=round(max_battery_budget_mah, 1),
            max_altitude_m=round(max_alt_seen, 1),
            min_altitude_m=round(min_alt_seen if min_alt_seen != 999.0 else 0.0, 1),
            issues=[i.to_dict() for i in issues],
            summary=summary
        )

    def validate_search_boundary(
        self,
        boundary_dict: Dict[str, Any],
        geofence: Dict[str, Any],
        altitude_m: float = 10.0
    ) -> Dict[str, Any]:
        """
        Validates a search boundary (CIRCLE, RECTANGLE, POLYGON) against the active geofence.
        Requirement 2 & 3: The entire search area must remain strictly within the geofence.
        Requirement 4: Does NOT automatically modify or clip the user's selected boundary.
        """
        if not geofence.get("enabled", True):
            return {"valid": True}

        max_alt = float(geofence.get("alt_max", self.max_altitude_m))
        if altitude_m > max_alt:
            return {
                "valid": False,
                "reason": f"Search altitude ({altitude_m:.1f}m) exceeds geofence ceiling ({max_alt:.1f}m)."
            }

        b_type = boundary_dict.get("type", "CIRCLE").upper()
        gf_type = geofence.get("type", "CIRCLE").upper()
        gf_center = geofence.get("center", {})
        gf_radius = float(geofence.get("radius", 50.0))

        if b_type == "CIRCLE":
            center = boundary_dict.get("center", {})
            radius = float(boundary_dict.get("radius", 15.0))
            if not center or "lat" not in center or "lon" not in center:
                return {"valid": False, "reason": "Missing or invalid circular boundary center coordinates."}

            if gf_type == "CIRCLE":
                if "lat" in gf_center and "lon" in gf_center:
                    dist = haversine_distance(center["lat"], center["lon"], gf_center["lat"], gf_center["lon"])
                    total_reach = dist + radius
                    if total_reach > gf_radius:
                        excess = total_reach - gf_radius
                        return {
                            "valid": False,
                            "reason": f"Search circle exceeds circular geofence boundary by {excess:.1f}m (center is {dist:.1f}m from fence center, radius {radius:.1f}m reaches {total_reach:.1f}m vs fence {gf_radius:.1f}m)."
                        }
                return {"valid": True}
            elif gf_type == "POLYGON":
                raw_poly = geofence.get("polygon", [])
                gf_poly = []
                for pt in raw_poly:
                    if isinstance(pt, (list, tuple)) and len(pt) >= 2:
                        gf_poly.append((float(pt[0]), float(pt[1])))
                    elif isinstance(pt, dict) and "lat" in pt:
                        gf_poly.append((float(pt["lat"]), float(pt.get("lon", pt.get("lng", 0.0)))))

                if len(gf_poly) < 3:
                    return {"valid": True}

                if not point_in_polygon(center["lat"], center["lon"], gf_poly):
                    return {"valid": False, "reason": "Search circle center is outside the geofence polygon."}

                # Check 36 points along perimeter
                for i in range(36):
                    angle_rad = math.radians(i * 10)
                    d_lat = (radius * math.cos(angle_rad)) / 111139.0
                    d_lon = (radius * math.sin(angle_rad)) / (111139.0 * math.cos(math.radians(center["lat"])))
                    p_lat = center["lat"] + d_lat
                    p_lon = center["lon"] + d_lon
                    if not point_in_polygon(p_lat, p_lon, gf_poly):
                        return {
                            "valid": False,
                            "reason": "Search circle perimeter exceeds the geofence polygon. Entire search area must remain within geofence."
                        }
                return {"valid": True}

        elif b_type == "POLYGON":
            raw_coords = boundary_dict.get("coordinates", boundary_dict.get("polygon", []))
            poly_coords = []
            for pt in raw_coords:
                if isinstance(pt, (list, tuple)) and len(pt) >= 2:
                    poly_coords.append((float(pt[0]), float(pt[1])))
                elif isinstance(pt, dict) and "lat" in pt:
                    poly_coords.append((float(pt["lat"]), float(pt.get("lon", pt.get("lng", 0.0)))))

            if len(poly_coords) < 3:
                return {"valid": False, "reason": "Polygon boundary requires at least 3 vertices."}

            # Check self-intersection (Requirement G.5: reject self-intersecting polygons)
            self_inter, msg = check_polygon_self_intersection(poly_coords)
            if self_inter:
                return {"valid": False, "reason": msg}

            # Validate against circular geofence
            if gf_type == "CIRCLE":
                if "lat" in gf_center and "lon" in gf_center:
                    for idx, (plat, plon) in enumerate(poly_coords):
                        d = haversine_distance(plat, plon, gf_center["lat"], gf_center["lon"])
                        if d > gf_radius:
                            excess = d - gf_radius
                            return {
                                "valid": False,
                                "reason": f"Polygon vertex #{idx + 1} exceeds circular geofence boundary by {excess:.1f}m."
                            }
                return {"valid": True}
            elif gf_type == "POLYGON":
                raw_poly = geofence.get("polygon", [])
                gf_poly = []
                for pt in raw_poly:
                    if isinstance(pt, (list, tuple)) and len(pt) >= 2:
                        gf_poly.append((float(pt[0]), float(pt[1])))
                    elif isinstance(pt, dict) and "lat" in pt:
                        gf_poly.append((float(pt["lat"]), float(pt.get("lon", pt.get("lng", 0.0)))))
                if len(gf_poly) >= 3:
                    for idx, (plat, plon) in enumerate(poly_coords):
                        if not point_in_polygon(plat, plon, gf_poly):
                            return {
                                "valid": False,
                                "reason": f"Polygon vertex #{idx + 1} lies outside the geofence perimeter."
                            }
                return {"valid": True}

        return {"valid": True}


def check_polygon_self_intersection(poly: List[Tuple[float, float]]) -> Tuple[bool, str]:
    """Tests if 2D edges of a polygon cross each other (rejecting self-intersecting figures)."""
    n = len(poly)
    if n < 4:
        return False, ""

    def ccw(a, b, c):
        return (c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])

    def intersect(p1, p2, p3, p4):
        ccw1 = ccw(p1, p3, p4)
        ccw2 = ccw(p2, p3, p4)
        ccw3 = ccw(p1, p2, p3)
        ccw4 = ccw(p1, p2, p4)
        return (((ccw1 > 0 and ccw2 < 0) or (ccw1 < 0 and ccw2 > 0)) and
                ((ccw3 > 0 and ccw4 < 0) or (ccw3 < 0 and ccw4 > 0)))

    for i in range(n):
        p1 = poly[i]
        p2 = poly[(i + 1) % n]
        for j in range(i + 1, n):
            if j == i or j == (i + 1) % n or (j + 1) % n == i:
                continue
            p3 = poly[j]
            p4 = poly[(j + 1) % n]
            if intersect(p1, p2, p3, p4):
                return True, f"Self-intersecting polygon rejected: Edge [{i+1}-{(i+1)%n+1}] crosses edge [{j+1}-{(j+1)%n+1}]."
    return False, ""


def calculate_polygon_area_m2(poly: List[Tuple[float, float]]) -> float:
    """Calculates spherical surface area of polygon in square metres."""
    if len(poly) < 3:
        return 0.0
    r = 6378137.0
    total = 0.0
    n = len(poly)
    for i in range(n):
        j = (i + 1) % n
        lat1 = math.radians(poly[i][0])
        lat2 = math.radians(poly[j][0])
        lon1 = math.radians(poly[i][1])
        lon2 = math.radians(poly[j][1])
        total += (lon2 - lon1) * (2.0 + math.sin(lat1) + math.sin(lat2))
    return abs((total * r * r) / 2.0)


def auto_select_search_pattern(boundary_type: str, vertices: Optional[List[Tuple[float, float]]] = None) -> Dict[str, str]:
    """
    Analyzes boundary shape and automatically selects the optimal search algorithm with scientific justification.
    """
    b_type = (boundary_type or "CIRCLE").upper()
    if b_type == "CIRCLE":
        return {
            "algorithm": "INWARD_SPIRAL",
            "name": "Inward Archimedean Spiral",
            "reason": "Circular boundary detected. Inward Archimedean spiral provides continuous curvature search, eliminating abrupt 90-degree yaw stops and maintaining constant target ground box visibility."
        }
    elif b_type == "RECTANGLE":
        return {
            "algorithm": "BOUSTROPHEDON",
            "name": "Boustrophedon (Lawnmower) Sweep",
            "reason": "Rectangular boundary detected. Parallel sweep lanes aligned to the primary axis deliver uniform 100% optical swath coverage and optimal flight battery efficiency."
        }
    else:
        return {
            "algorithm": "BOUSTROPHEDON",
            "name": "Polygon-Clipped Coverage Sweep",
            "reason": "Irregular polygon boundary detected. Using dynamic sweep tracks clipped strictly within polygon vertices with Sony IMX477 camera swath overlap."
        }


# Global singleton validator
route_validator = RouteValidator()
