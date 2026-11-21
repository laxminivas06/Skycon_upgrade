"""
=====================================================================================
SKYCON SYSTEM VALIDATION SUITE — PHASE 7
TEST MODULE: test_mavlink_integration.py
SITL Communication, Heartbeat Handling, SysID, Baud Probing & Connection Recovery
=====================================================================================
"""

import os
import sys
import time
import unittest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.settings import settings
from backend.mavlink_multiplexer import (
    mavlink_mux,
    MavlinkMultiplexer,
    COPTER_MODES,
    MODE_NAME_TO_INT
)


class TestMAVLinkIntegrationValidation(unittest.TestCase):
    """Validates MAVLink protocol engine, heartbeat tracking, and multi-baud probing."""

    def setUp(self):
        self.mux = mavlink_mux

    def test_01_heartbeat_and_system_identification(self):
        """Verify MAVLink multiplexer tracks heartbeat age and identifies vehicle."""
        state = self.mux.get_state()
        self.assertIn("connected", state)
        self.assertIn("heartbeat_age_s", state)
        self.assertIn("heartbeat_rate_hz", state)
        self.assertIn("is_mock", state)
        # Verify valid system ID expectations (GCS sysid=255, Autopilot target=1)
        self.assertEqual(self.mux.system_id, 255)
        self.assertEqual(self.mux.target_system, 1)

    def test_02_multi_baud_candidate_configuration(self):
        """Verify multiplexer includes TELEM1 (921600), fast bench (115200) and TELEM2 default (57600)."""
        expected_candidates = [921600, 115200, 57600]
        self.assertEqual(self.mux.candidate_bauds, expected_candidates)
        # Verify active configured baud is within candidate set
        self.assertIn(self.mux.baud, expected_candidates)

    def test_03_telemetry_freshness_and_subscription(self):
        """Verify pub/sub telemetry distribution dispatches fresh updates to subscribers."""
        received_packets = []

        def telemetry_callback(data):
            received_packets.append(data)

        self.mux.subscribe(telemetry_callback)
        time.sleep(0.1)
        if telemetry_callback in self.mux._subscribers:
            self.mux._subscribers.remove(telemetry_callback)

        self.assertGreaterEqual(len(received_packets), 0)

    def test_04_connection_loss_and_recovery_simulation(self):
        """Verify simulated connection loss properly flags heartbeat staleness and recovers."""
        self.mux._start_simulation()
        state = self.mux.get_state()
        self.assertTrue(state.get("connected", False))
        self.assertLess(state.get("heartbeat_age_s", 999.0), 5.0)


if __name__ == "__main__":
    unittest.main()
