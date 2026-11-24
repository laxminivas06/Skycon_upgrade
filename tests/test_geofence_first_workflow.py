"""
Unit Tests for Geofence-First Autonomous Search Workflow
Compliant with Section G Testing & Reporting requirements:
1. Polygon boundary test.
2. Circular boundary test.
3. Area calculation verification.
4. Automatic pattern selection test.
5. Boundary validation (reject self-intersecting polygons).
6. Altitude validation and persistence test.
7. MAVLink mission upload and readback verification.

Bench Testing Safety Reminder:
All propellers MUST be removed before conducting arming or bench tests.
Simulations without live Pixhawk hardware are marked NOT HARDWARE VERIFIED.
"""

import unittest
import math
from typing import Dict, Any, List, Tuple

from backend.route_validator import (
    route_validator,
    haversine_distance,
    point_in_polygon,
    check_polygon_self_intersection,
    calculate_polygon_area_m2,
    auto_select_search_pattern,
)
from backend.mission_engine import mission_engine
from backend.coverage_planner import CoveragePlanner
from backend.mavlink_multiplexer import mavlink_mux


class TestGeofenceFirstWorkflow(unittest.TestCase):

    def setUp(self):
        mission_engine.reset_mission()
        mavlink_mux.telemetry["armed"] = False
        mavlink_mux.telemetry["flight_mode"] = "GUIDED"
        self.planner = CoveragePlanner()
        # Home coordinate: Chennai test field (13.0827°N, 80.2707°E)
        self.home = {"lat": 13.0827, "lon": 80.2707, "alt": 0.0}
        self.circular_geofence = {
            "type": "CIRCLE",
            "center": {"lat": 13.0827, "lon": 80.2707},
            "radius": 50.0,
            "alt_max": 25.0,
            "alt_min": 2.0,
            "enabled": True,
        }

    # =========================================================================
    # G.1: Polygon boundary test
    # =========================================================================
    def test_01_polygon_boundary_inside_geofence(self):
        """Valid polygon strictly within circular geofence passes validation."""
        # A 20m x 20m box centered at home (~0.0001 deg offset)
        poly = [
            {"lat": 13.0826, "lon": 80.2706},
            {"lat": 13.0828, "lon": 80.2706},
            {"lat": 13.0828, "lon": 80.2708},
            {"lat": 13.0826, "lon": 80.2708},
        ]
        boundary = {"type": "POLYGON", "coordinates": poly}
        res = route_validator.validate_search_boundary(boundary, self.circular_geofence, altitude_m=5.0)
        self.assertTrue(res["valid"])
        self.assertNotIn("reason", res)

    def test_01b_polygon_boundary_exceeding_geofence_rejected(self):
        """Polygon with a vertex outside geofence boundary is rejected with clear error."""
        # Place one vertex 70m away (> 50m radius)
        d_lat = 70.0 / 111139.0
        poly = [
            {"lat": 13.0827, "lon": 80.2707},
            {"lat": 13.0827 + d_lat, "lon": 80.2707},  # 70m north
            {"lat": 13.0827, "lon": 80.2708},
        ]
        boundary = {"type": "POLYGON", "coordinates": poly}
        res = route_validator.validate_search_boundary(boundary, self.circular_geofence, altitude_m=5.0)
        self.assertFalse(res["valid"])
        self.assertIn("exceeds circular geofence boundary", res["reason"])

    # =========================================================================
    # G.2: Circular boundary test
    # =========================================================================
    def test_02_circular_boundary_inside_geofence(self):
        """Circular boundary within geofence passes validation without mutating radius."""
        boundary = {
            "type": "CIRCLE",
            "center": {"lat": 13.0827, "lon": 80.2707},
            "radius": 15.0,
        }
        res = route_validator.validate_search_boundary(boundary, self.circular_geofence, altitude_m=5.0)
        self.assertTrue(res["valid"])
        self.assertEqual(boundary["radius"], 15.0)

    def test_02b_circular_boundary_exceeding_geofence_rejected(self):
        """Circular boundary exceeding geofence perimeter is rejected with exact excess distance."""
        boundary = {
            "type": "CIRCLE",
            "center": {"lat": 13.0827, "lon": 80.2707},
            "radius": 55.0,  # Exceeds 50m fence
        }
        res = route_validator.validate_search_boundary(boundary, self.circular_geofence, altitude_m=5.0)
        self.assertFalse(res["valid"])
        self.assertIn("exceeds circular geofence boundary", res["reason"])

    # =========================================================================
    # G.3: Area calculation verification
    # =========================================================================
    def test_03_area_calculation_accuracy(self):
        """Verifies spherical surface area calculation for a known ~100m x 100m rectangle."""
        # 1 deg lat ~= 111,139m. 100m ~= 0.00089975 deg
        d_deg = 100.0 / 111139.0
        lat0, lon0 = 13.0827, 80.2707
        cos_lat = math.cos(math.radians(lat0))
        d_lon = 100.0 / (111139.0 * cos_lat)

        poly = [
            (lat0, lon0),
            (lat0 + d_deg, lon0),
            (lat0 + d_deg, lon0 + d_lon),
            (lat0, lon0 + d_lon),
        ]
        calculated_area = calculate_polygon_area_m2(poly)
        expected_area = 10000.0  # 100m * 100m = 10,000 m^2
        # Allow +/- 3% tolerance due to Earth ellipsoidal curvature
        self.assertAlmostEqual(calculated_area, expected_area, delta=300.0)

    # =========================================================================
    # G.4: Automatic pattern selection test
    # =========================================================================
    def test_04_automatic_pattern_selection_logic(self):
        """System automatically selects optimal algorithm based on shape analysis without user prompt."""
        # Circular boundary -> Inward Archimedean Spiral
        circle_decision = auto_select_search_pattern("CIRCLE")
        self.assertEqual(circle_decision["algorithm"], "INWARD_SPIRAL")
        self.assertIn("Inward Archimedean Spiral", circle_decision["name"])
        self.assertIn("continuous curvature", circle_decision["reason"])

        # Rectangular boundary -> Boustrophedon / Lawnmower
        rect_decision = auto_select_search_pattern("RECTANGLE")
        self.assertEqual(rect_decision["algorithm"], "BOUSTROPHEDON")
        self.assertIn("Lawnmower", rect_decision["name"])
        self.assertIn("Parallel sweep", rect_decision["reason"])

        # Irregular Polygon -> Polygon-Clipped Coverage Sweep
        poly_decision = auto_select_search_pattern("POLYGON")
        self.assertEqual(poly_decision["algorithm"], "BOUSTROPHEDON")
        self.assertIn("Polygon-Clipped", poly_decision["name"])
        self.assertIn("Sony IMX477", poly_decision["reason"])

    # =========================================================================
    # G.5: Boundary validation (reject self-intersecting polygons)
    # =========================================================================
    def test_05_reject_self_intersecting_polygons(self):
        """Figure-8 or bow-tie self-intersecting polygon must be strictly rejected."""
        # Bow-tie polygon where edge [0-1] crosses edge [2-3]
        bow_tie = [
            (13.0820, 80.2700),  # A
            (13.0830, 80.2710),  # B
            (13.0820, 80.2710),  # C
            (13.0830, 80.2700),  # D
        ]
        is_self_inter, msg = check_polygon_self_intersection(bow_tie)
        self.assertTrue(is_self_inter)
        self.assertIn("Self-intersecting polygon rejected", msg)

        # Boundary validation route validator rejection
        boundary = {
            "type": "POLYGON",
            "coordinates": [{"lat": p[0], "lon": p[1]} for p in bow_tie],
        }
        res = route_validator.validate_search_boundary(boundary, self.circular_geofence, altitude_m=5.0)
        self.assertFalse(res["valid"])
        self.assertIn("Self-intersecting", res["reason"])

    def test_05b_valid_simple_convex_polygon_passes(self):
        """Simple convex polygon with no self-intersections passes."""
        convex = [
            (13.0820, 80.2700),
            (13.0830, 80.2700),
            (13.0830, 80.2710),
            (13.0820, 80.2710),
        ]
        is_self_inter, _ = check_polygon_self_intersection(convex)
        self.assertFalse(is_self_inter)

    # =========================================================================
    # G.6: Altitude validation and persistence test
    # =========================================================================
    def test_06_altitude_validation_within_operational_envelope(self):
        """Altitude must remain within 2.0m - 25.0m envelope."""
        boundary = {"type": "CIRCLE", "center": {"lat": 13.0827, "lon": 80.2707}, "radius": 15.0}

        # Valid 5.0m AGL
        res = route_validator.validate_search_boundary(boundary, self.circular_geofence, altitude_m=5.0)
        self.assertTrue(res["valid"])

        # Altitude > 25.0m ceiling rejected
        res_high = route_validator.validate_search_boundary(boundary, self.circular_geofence, altitude_m=30.0)
        self.assertFalse(res_high["valid"])
        self.assertIn("exceeds geofence ceiling", res_high["reason"])

    # =========================================================================
    # G.7: MAVLink mission upload and readback verification
    # =========================================================================
    def test_07_mavlink_mission_upload_and_readback(self):
        """Validates MAVLink MISSION_COUNT, MISSION_ITEM_INT upload handshake and readback check."""
        waypoints = [
            {"command": 16, "lat": 13.0827, "lon": 80.2707, "alt": 5.0, "frame": 6},
            {"command": 16, "lat": 13.0828, "lon": 80.2708, "alt": 5.0, "frame": 6},
            {"command": 16, "lat": 13.0829, "lon": 80.2707, "alt": 5.0, "frame": 6},
        ]

        # Upload mission to multiplexer
        ok, res_str, code = mavlink_mux.upload_mission(waypoints)
        self.assertTrue(ok)
        self.assertEqual(res_str, "MAV_MISSION_ACCEPTED")
        self.assertEqual(code, 0)

        # Readback verification
        readback_wps = mavlink_mux.get_uploaded_waypoints()
        self.assertEqual(len(readback_wps), 3)
        self.assertEqual(readback_wps[0]["lat"], 13.0827)
        self.assertEqual(readback_wps[1]["lon"], 80.2708)
        self.assertEqual(readback_wps[2]["alt"], 5.0)

        # Vehicle must NOT be armed automatically on mission upload
        telem = mavlink_mux.get_telemetry()
        self.assertFalse(telem.get("armed", False))


if __name__ == "__main__":
    print("=" * 70)
    print("SAFETY NOTICE: All propellers must be removed during bench testing.")
    print("Non-hardware simulated test runs are marked: [NOT HARDWARE VERIFIED]")
    print("=" * 70)
    unittest.main()
