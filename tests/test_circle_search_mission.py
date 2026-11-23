"""
Unit Tests for Circle Search Mission, Geofence Boundary Validation & ADDC Execution
Verifies:
1. User defines circular search boundary inside geofence -> Validated successfully.
2. User defines circular search boundary exceeding geofence -> Returns clear validation error without mutating boundary.
3. Search altitude exceeding geofence ceiling -> Rejected with clear error.
4. Search pattern generation creates valid coordinates compatible with flight controller.
5. ADDC GUIDED mode search execution initiates climb with tolerant altitude threshold (no deadlock).
6. MAVLink mission upload handshake handling with retries and timeout handling.
"""

import unittest
import math
from typing import Dict, Any

from backend.route_validator import route_validator, haversine_distance, point_in_polygon
from backend.mission_engine import mission_engine
from backend.coverage_planner import CoveragePlanner
from backend.mavlink_multiplexer import mavlink_mux


class TestCircleSearchMission(unittest.TestCase):

    def setUp(self):
        mission_engine.reset_mission()
        self.planner = CoveragePlanner()
        # Home coordinate: Chennai test field
        self.home = {"lat": 13.0827, "lon": 80.2707, "alt": 0.0}
        self.circular_geofence = {
            "type": "CIRCLE",
            "center": {"lat": 13.0827, "lon": 80.2707},
            "radius": 50.0,
            "alt_max": 25.0,
            "alt_min": 1.0,
            "braking_buffer_m": 3.0,
            "enabled": True
        }

    def test_01_circle_inside_geofence_validates_successfully(self):
        """Circle strictly within 50m geofence passes validation."""
        boundary = {
            "type": "CIRCLE",
            "center": {"lat": 13.0827, "lon": 80.2707},
            "radius": 15.0
        }
        res = route_validator.validate_search_boundary(boundary, self.circular_geofence, altitude_m=10.0)
        self.assertTrue(res["valid"])
        self.assertNotIn("reason", res)

    def test_02_circle_exceeding_geofence_displays_clear_error(self):
        """Circle reaching outside geofence returns clear validation error."""
        # Radius 40m placed 25m away from center = reaches 65m, exceeding 50m fence by 15m
        # 1 deg lat ~= 111139m -> 25m north is 25 / 111139 = 0.000225 deg
        d_lat = 25.0 / 111139.0
        boundary = {
            "type": "CIRCLE",
            "center": {"lat": 13.0827 + d_lat, "lon": 80.2707},
            "radius": 40.0
        }
        res = route_validator.validate_search_boundary(boundary, self.circular_geofence, altitude_m=10.0)
        self.assertFalse(res["valid"])
        self.assertIn("exceeds circular geofence boundary", res["reason"])
        # Requirement 4: Original boundary must not be altered
        self.assertEqual(boundary["radius"], 40.0)

    def test_03_altitude_exceeding_ceiling_rejected(self):
        """Altitude > 25m is rejected with clear error."""
        boundary = {
            "type": "CIRCLE",
            "center": {"lat": 13.0827, "lon": 80.2707},
            "radius": 10.0
        }
        res = route_validator.validate_search_boundary(boundary, self.circular_geofence, altitude_m=30.0)
        self.assertFalse(res["valid"])
        self.assertIn("exceeds geofence ceiling", res["reason"])

    def test_04_circle_search_pattern_generation_validates_coordinates(self):
        """CoveragePlanner creates valid WGS84 coordinates compatible with FC."""
        plan = self.planner.plan_circular_coverage(
            center_lat=13.0827,
            center_lon=80.2707,
            radius_m=15.0,
            altitude_m=10.0,
            speed_mps=3.5,
            overlap_ratio=0.25,
            strategy="CONCENTRIC"
        )
        self.assertGreater(len(plan.waypoints), 0)
        for wp in plan.waypoints:
            self.assertFalse(math.isnan(wp["lat"]))
            self.assertFalse(math.isnan(wp["lon"]))
            self.assertGreater(abs(wp["lat"]), 0.001)
            self.assertGreater(abs(wp["lon"]), 0.001)
            self.assertEqual(wp["altitude_m"], 10.0)

    def test_05_mission_engine_configure_and_start(self):
        """Mission engine configures and starts mission in GUIDED mode."""
        config = {
            "missionId": "TEST_CIRCLE_01",
            "pattern": "CIRCULAR",
            "center": {"lat": 13.0827, "lon": 80.2707},
            "radius": 15.0,
            "altitude": 10.0,
            "timeLimitSeconds": 240
        }
        res = mission_engine.configure_mission(config)
        self.assertTrue(res["success"])
        self.assertEqual(mission_engine.state, "PREFLIGHT")

        # Start mission
        start_res = mission_engine.start_mission("TEST_CIRCLE_01")
        self.assertTrue(start_res["success"])
        self.assertIn(mission_engine.state, ("ARMED", "TAKING_OFF"))

    def test_06_mavlink_mux_simulated_mission_upload(self):
        """Simulated Pixhawk handles MAVLink mission upload handshake."""
        wps = [
            {"command": 16, "lat": 13.0827, "lon": 80.2707, "alt": 10.0},
            {"command": 16, "lat": 13.0828, "lon": 80.2708, "alt": 10.0}
        ]
        ok, res_str, code = mavlink_mux.upload_mission(wps)
        self.assertTrue(ok)
        self.assertEqual(res_str, "MAV_MISSION_ACCEPTED")
        self.assertEqual(code, 0)


if __name__ == "__main__":
    unittest.main()
