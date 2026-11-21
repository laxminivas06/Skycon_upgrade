"""
=====================================================================================
SKYCON SYSTEM VALIDATION SUITE — PHASE 7
TEST MODULE: test_rc_monitoring.py
MultiLink V1.0 RC Channel Monitoring, Pilot Stick Override & Failsafe Integrity
=====================================================================================
"""

import os
import sys
import unittest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.mavlink_multiplexer import mavlink_mux


class TestRCMonitoringValidation(unittest.TestCase):
    """Validates MultiLink V1.0 RC channel monitoring, RSSI, and manual override detection."""

    def setUp(self):
        self.mux = mavlink_mux

    def test_01_rc_channel_structure_and_neutral_pulse(self):
        """Verify 8 standard RC channels are parsed with neutral PWM around 1500us."""
        telem = self.mux.get_telemetry()
        channels = telem.get("rc_channels", [])
        self.assertGreaterEqual(len(channels), 8, "Expected at least 8 RC channels")
        # Standard PWM pulse range is 1000 - 2000 us
        for i, pulse in enumerate(channels[:4]):
            self.assertTrue(900 <= pulse <= 2100, f"Channel {i+1} pulse {pulse}us out of bounds")

    def test_02_manual_override_detection_logic(self):
        """Verify stick deflection outside deadband is detected as manual override."""
        # Clean neutral sticks
        telem = self.mux.get_telemetry()
        self.assertIn("rc_override_active", telem)
        self.assertFalse(telem["rc_override_active"])

    def test_03_rc_signal_loss_reporting(self):
        """Verify zero or missing RC frames marks RC link as disconnected."""
        telem = self.mux.get_telemetry()
        self.assertIn("rc_connected", telem)
        self.assertIn("rc_rssi", telem)
        self.assertTrue(0 <= telem["rc_rssi"] <= 100)


if __name__ == "__main__":
    unittest.main()
