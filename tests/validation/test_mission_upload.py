"""
=====================================================================================
SKYCON SYSTEM VALIDATION SUITE — PHASE 7
TEST MODULE: test_mission_upload.py
MAVLink v2 Binary Mission Transfer Protocol, Coordinate Frames & Route Integrity
=====================================================================================
"""

import os
import sys
import unittest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.mavlink_multiplexer import mavlink_mux
from backend.route_validator import route_validator


class TestMissionUploadValidation(unittest.TestCase):
    """Validates standard MAVLink v2 binary mission protocol, frames, and rejection of invalid items."""

    def setUp(self):
        self.mux = mavlink_mux

    def test_01_mission_item_int_upload_protocol(self):
        """Verify mission upload using standard ArduPilot MISSION_ITEM_INT protocol."""
        valid_waypoints = [
            {"lat": 13.0827, "lon": 80.2707, "alt": 10.0, "speed": 3.0},
            {"lat": 13.0828, "lon": 80.2708, "alt": 10.0, "speed": 3.0},
            {"lat": 13.0829, "lon": 80.2707, "alt": 10.0, "speed": 3.0}
        ]
        ok, msg, ack = self.mux.upload_mission(valid_waypoints)
        self.assertTrue(ok, f"Upload failed: {msg}")
        self.assertEqual(self.mux.telemetry["mission_items_count"], len(valid_waypoints))

    def test_02_null_island_waypoint_rejection(self):
        """Verify coordinates at (0, 0) are strictly rejected before upload."""
        null_waypoints = [
            {"lat": 0.0, "lon": 0.0, "alt": 10.0}
        ]
        validation = route_validator.validate_plan(
            null_waypoints,
            {"type": "CIRCLE", "radius": 50.0, "alt_max": 25.0},
            {"lat": 13.0827, "lon": 80.2707}
        )
        self.assertFalse(validation.is_valid, "Null Island waypoint was not rejected!")
        self.assertTrue(any(iss.get("rule") == "INVALID_COORDINATES" for iss in validation.issues))

    def test_03_empty_mission_upload_rejection(self):
        """Verify uploading an empty waypoint list is rejected."""
        ok, msg, count = self.mux.upload_mission([])
        self.assertFalse(ok)

    def test_04_mission_clear_all_protocol(self):
        """Verify MAVLink MISSION_CLEAR_ALL frame construction."""
        pkt = self.mux.build_mission_clear_all_packet()
        self.assertGreater(len(pkt), 10)
        self.assertEqual(pkt[0], 0xFD)


if __name__ == "__main__":
    unittest.main()
