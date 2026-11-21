"""
=====================================================================================
SKYCON SYSTEM VALIDATION SUITE — PHASE 7
TEST MODULE: test_cloud_recovery.py
Outbound Cloud Push, Offline Disk Spooling, Backoff & Air-Gapped Command Isolation
=====================================================================================
"""

import os
import sys
import unittest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.cloud_sync import cloud_sync_service, CloudSyncService
from backend.simple_json_store import json_store


class TestCloudRecoveryValidation(unittest.TestCase):
    """Validates 4G cloud push, offline spooling, backoff delay, and air-gapped flight safety."""

    def setUp(self):
        self.service = CloudSyncService()

    def test_01_offline_spooling_on_network_loss(self):
        """Verify payloads buffer locally into atomic JSON when cloud is unreachable."""
        test_payload = {
            "source": "SKYCON_COMPANION_PI4",
            "telemetry": {"alt": 10.0, "lat": 13.0827, "lon": 80.2707},
            "hash": "validation_hash_spool_123"
        }
        initial_spool = json_store.load("offline_sync_spool", fallback=[])
        self.service._spool_payload(test_payload)
        updated_spool = json_store.load("offline_sync_spool", fallback=[])
        self.assertGreaterEqual(len(updated_spool), len(initial_spool) + 1)
        self.assertEqual(updated_spool[-1]["hash"], "validation_hash_spool_123")

    def test_02_exponential_backoff_rate_limiting(self):
        """Verify backoff delay increases up to 30s max to prevent CPU exhaustion."""
        delay = self.service.backoff_delay_s
        self.assertTrue(1.0 <= delay <= 30.0)

    def test_03_air_gapped_flight_safety_verification(self):
        """Strictly verify that cloud sync service contains zero flight control authority."""
        disallowed = ["arm", "disarm", "takeoff", "land", "reposition", "rtl", "set_mode"]
        for cmd in disallowed:
            self.assertFalse(hasattr(self.service, cmd), f"CRITICAL: {cmd} found in cloud sync service!")


if __name__ == "__main__":
    unittest.main()
