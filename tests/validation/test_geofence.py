"""
=====================================================================================
SKYCON SYSTEM VALIDATION SUITE — PHASE 7
TEST MODULE: test_geofence.py
Circular & Polygon Geofence, Altitude Ceiling, Braking Buffer & Breach Recovery
=====================================================================================
"""

import os
import sys
import unittest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.mission_engine import mission_engine
from backend.route_validator import route_validator


class TestGeofenceValidation(unittest.TestCase):
    """Validates spatial geofence enclosure, boundary ray-casting, altitude limits, and braking buffers."""

    def setUp(self):
        self.engine = mission_engine

    def test_01_circular_geofence_containment(self):
        """Verify points inside 50m radius circular geofence pass and exterior points are rejected."""
        center = self.engine.home_location
        # Point inside (5m North)
        breach, dist, reason = self.engine.check_geofence_breach(
            center["lat"] + 0.000045, center["lon"], 10.0
        )
        self.assertFalse(breach, "Point inside geofence flagged as breach!")

        # Point outside (100m North)
        breach_out, dist_out, reason_out = self.engine.check_geofence_breach(
            center["lat"] + 0.0009, center["lon"], 10.0
        )
        self.assertTrue(breach_out, "Point outside geofence was not flagged!")
        self.assertIn("Geofence breached", reason_out)

    def test_02_altitude_ceiling_enforcement(self):
        """Verify altitude exceeding 25m ceiling triggers geofence breach."""
        center = self.engine.home_location
        # Safe altitude: 10m
        breach_safe, _, _ = self.engine.check_geofence_breach(center["lat"], center["lon"], 10.0)
        self.assertFalse(breach_safe)

        # Breached altitude: 30m (> 25m alt_max)
        breach_high, _, reason_high = self.engine.check_geofence_breach(center["lat"], center["lon"], 30.0)
        self.assertTrue(breach_high)
        self.assertIn("Altitude ceiling breached", reason_high)

    def test_03_braking_buffer_warning(self):
        """Verify warning triggered when approaching within 5m braking buffer."""
        center = self.engine.home_location
        # Radius is 50m. Place point at 47m (within 5m buffer of edge: 50m - 47m = 3m <= 5m)
        lat_edge = center["lat"] + (47.0 / 111139.0)
        breach, dist_to_boundary, reason = self.engine.check_geofence_breach(lat_edge, center["lon"], 10.0)
        self.assertFalse(breach, "Buffer zone should warn, not yet hard-breach")
        self.assertIn("Approaching geofence boundary", reason)


if __name__ == "__main__":
    unittest.main()
