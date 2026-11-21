"""
=====================================================================================
SKYCON SYSTEM VALIDATION SUITE — PHASE 7
TEST MODULE: test_flight_modes.py
ArduCopter Flight Mode Control, Command ACK & Telemetry Readback Verification
=====================================================================================
"""

import os
import sys
import time
import unittest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.mavlink_multiplexer import (
    mavlink_mux,
    COPTER_MODES,
    MODE_NAME_TO_INT,
    VERIFIED_GCS_MODES
)


class TestFlightModesValidation(unittest.TestCase):
    """Validates flight mode mapping, command acknowledgement, and actual readback."""

    def setUp(self):
        self.mux = mavlink_mux

    def test_01_arducopter_custom_mode_mapping(self):
        """Verify accurate ArduCopter mode integer mappings per standard."""
        self.assertEqual(MODE_NAME_TO_INT["STABILIZE"], 0)
        self.assertEqual(MODE_NAME_TO_INT["ALT_HOLD"], 2)
        self.assertEqual(MODE_NAME_TO_INT["AUTO"], 3)
        self.assertEqual(MODE_NAME_TO_INT["GUIDED"], 4)
        self.assertEqual(MODE_NAME_TO_INT["LOITER"], 5)
        self.assertEqual(MODE_NAME_TO_INT["RTL"], 6)
        self.assertEqual(MODE_NAME_TO_INT["LAND"], 9)
        self.assertEqual(MODE_NAME_TO_INT["POSHOLD"], 16)

    def test_02_mode_command_and_telemetry_readback(self):
        """Verify commanding flight modes updates internal telemetry readback."""
        test_modes = ["GUIDED", "LOITER", "ALT_HOLD", "STABILIZE"]
        for mode in test_modes:
            res = self.mux.set_mode(mode)
            self.assertTrue(res, f"Failed to command mode: {mode}")
            # Verify telemetry readback matches commanded mode
            telem = self.mux.get_telemetry()
            self.assertEqual(telem.get("flight_mode"), mode, f"Readback mismatch for mode {mode}")

    def test_03_invalid_mode_command_rejection(self):
        """Verify commanding an unrecognized flight mode is rejected cleanly."""
        res = self.mux.set_mode("HYPERDRIVE_MODE_99")
        self.assertFalse(res)

    def test_04_emergency_rtl_command(self):
        """Verify emergency RTL commands vehicle mode transition to RTL (6)."""
        res = self.mux.rtl()
        self.assertTrue(res)
        telem = self.mux.get_telemetry()
        self.assertEqual(telem.get("flight_mode"), "RTL")


if __name__ == "__main__":
    unittest.main()
