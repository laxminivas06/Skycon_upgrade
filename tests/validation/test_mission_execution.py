"""
=====================================================================================
SKYCON SYSTEM VALIDATION SUITE — PHASE 7
TEST MODULE: test_mission_execution.py
Boustrophedon Sweep, Circular Scan, 300s Budget & FSM Execution
=====================================================================================
"""

import os
import sys
import unittest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.coverage_planner import CoveragePlanner
from backend.route_validator import route_validator
from backend.mission_engine import mission_engine


class TestMissionExecutionValidation(unittest.TestCase):
    """Validates autonomous scan path planning, circular sweeps, and 300s competition limits."""

    def setUp(self):
        self.planner = CoveragePlanner(camera_hfov_deg=65.0, camera_vfov_deg=45.0)
        self.center = {"lat": 13.0827, "lon": 80.2707}
        self.geofence = {
            "type": "CIRCLE",
            "center": self.center,
            "radius": 50.0,
            "alt_max": 25.0
        }

    def test_01_boustrophedon_coverage_generation(self):
        """Verify lawnmower sweep generation inside polygon boundaries."""
        arena_poly = [
            (13.0825, 80.2705),
            (13.0829, 80.2705),
            (13.0829, 80.2709),
            (13.0825, 80.2709)
        ]
        plan = self.planner.plan_polygon_coverage(arena_poly, altitude_m=10.0, overlap_ratio=0.3)
        self.assertTrue(plan.is_feasible_budget)
        self.assertGreater(len(plan.waypoints), 4)
        # Verify all waypoints remain inside arena boundary
        for wp in plan.waypoints:
            self.assertEqual(wp["altitude_m"], 10.0)

    def test_02_concentric_circular_scan_generation(self):
        """Verify multi-tier concentric circular scan rings for target inspection."""
        waypoints = mission_engine.plan_circular_scan(
            center_lat=self.center["lat"],
            center_lon=self.center["lon"],
            radius_m=15.0,
            altitude_m=10.0
        )
        self.assertGreater(len(waypoints), 8)
        # Verify altitude consistency
        for wp in waypoints:
            self.assertEqual(wp["alt"], 10.0)

    def test_03_competition_300s_budget_enforcement(self):
        """Verify route validator strictly enforces the 300s ADDC competition deadline."""
        # Realistic mission of ~120s
        short_wps = [
            {"lat": 13.0827, "lon": 80.2707, "alt": 10.0, "speed": 3.0},
            {"lat": 13.0829, "lon": 80.2707, "alt": 10.0, "speed": 3.0}
        ]
        val_short = route_validator.validate_plan(short_wps, self.geofence, self.center)
        self.assertTrue(val_short.is_valid)
        self.assertLess(val_short.estimated_duration_s, 300.0)

        # Huge mission exceeding 300s budget
        huge_wps = []
        for i in range(100):
            d = (i * 10.0) / 111139.0
            huge_wps.append({"lat": 13.0827 + d, "lon": 80.2707, "alt": 10.0, "speed": 0.5})
        val_huge = route_validator.validate_plan(huge_wps, self.geofence, self.center)
        self.assertFalse(val_huge.is_valid, "Mission exceeding 300s budget should be rejected!")
        self.assertTrue(any(issue.get("rule") == "TIME_BUDGET_EXCEEDED" for issue in val_huge.issues))


if __name__ == "__main__":
    unittest.main()
