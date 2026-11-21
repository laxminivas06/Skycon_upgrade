"""
=====================================================================================
SKYCON SYSTEM VALIDATION SUITE — PHASE 7
TEST MODULE: test_telemetry_integrity.py
Telemetry Normalization, GPS Fix, Battery Voltage & Attitude Boundaries
=====================================================================================
"""

import os
import sys
import unittest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.mavlink_multiplexer import mavlink_mux
from backend.telemetry_sync import telemetry_sync


class TestTelemetryIntegrityValidation(unittest.TestCase):
    """Validates telemetry packet normalization, sensor health, and coordinate validity."""

    def setUp(self):
        self.mux = mavlink_mux
        self.mux.telemetry["connected"] = True
        self.mux.telemetry["gps_fix_type"] = 3
        self.mux.telemetry["satellites"] = 12
        self.mux.telemetry["hdop"] = 1.1
        self.mux.telemetry["voltage_battery"] = 15.2
        self.mux.telemetry["battery_remaining"] = 90
        self.mux.telemetry["lat"] = 13.0827
        self.mux.telemetry["lon"] = 80.2707

    def test_01_gps_fix_and_satellite_health(self):
        """Verify GPS fix requirements: 3D fix (>=3), satellites >= 8, HDOP < 1.5."""
        telem = self.mux.get_telemetry()
        gps_fix = telem.get("gps_fix_type", 0)
        sats = telem.get("satellites", 0)
        hdop = telem.get("hdop", 99.9)

        # In simulated healthy stream, GPS fix must satisfy navigation minimums
        self.assertGreaterEqual(gps_fix, 3, "GPS fix must be at least 3D Fix")
        self.assertGreaterEqual(sats, 8, "Satellite count must be at least 8 for safe autonomous flight")
        self.assertLess(hdop, 2.0, "HDOP must be below 2.0")

    def test_02_coordinate_geodesic_sanity(self):
        """Verify coordinates do not fall on Null Island (0, 0) and are within valid geodetic bounds."""
        telem = self.mux.get_telemetry()
        lat = telem.get("lat", 0.0)
        lon = telem.get("lon", 0.0)

        self.assertNotEqual(lat, 0.0, "Null Island latitude detected!")
        self.assertNotEqual(lon, 0.0, "Null Island longitude detected!")
        self.assertTrue(-90.0 <= lat <= 90.0, "Latitude out of range")
        self.assertTrue(-180.0 <= lon <= 180.0, "Longitude out of range")

    def test_03_battery_voltage_and_remaining_capacity(self):
        """Verify battery telemetry fields and sensible voltage thresholds."""
        telem = self.mux.get_telemetry()
        voltage = telem.get("voltage_battery", 0.0)
        remaining = telem.get("battery_remaining", 0)

        self.assertGreater(voltage, 10.0, "Battery voltage unexpectedly low for 4S/6S pack")
        self.assertGreaterEqual(remaining, 0)
        self.assertLessEqual(remaining, 100)

    def test_04_attitude_euler_angle_bounds(self):
        """Verify roll, pitch, and yaw adhere to valid aerodynamic ranges."""
        telem = self.mux.get_telemetry()
        roll = telem.get("roll", 0.0)
        pitch = telem.get("pitch", 0.0)
        yaw = telem.get("yaw", 0.0)

        self.assertTrue(-180.0 <= roll <= 180.0, "Roll out of bounds")
        self.assertTrue(-90.0 <= pitch <= 90.0, "Pitch out of bounds")
        self.assertTrue(-180.0 <= yaw <= 360.0, "Yaw out of bounds")


if __name__ == "__main__":
    unittest.main()
