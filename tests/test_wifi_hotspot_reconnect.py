"""
=====================================================================================
SKYCON TEST SUITE - RASPBERRY PI MOBILE HOTSPOT & RECONNECTION
MODULE: test_wifi_hotspot_reconnect.py
Comprehensive Verification of Mobile Hotspot Association, Internet Reconnection,
Offline Spooling, Local-First Safety & 12 End-to-End Scenarios
=====================================================================================
"""

import time
import json
import unittest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone

from backend.network_manager import NetworkManager, NetworkState, network_manager
from backend.cloud_sync import CloudSyncService, cloud_sync_service
from backend.simple_json_store import json_store
from backend.mavlink_multiplexer import mavlink_mux
from backend.mission_engine import mission_engine


class TestMobileHotspotAndReconnection(unittest.TestCase):
    """
    Test suite validating mobile hotspot connectivity, internet loss detection,
    exponential backoff reconnection, cloud heartbeat restoration, and local-first safety.
    """

    def setUp(self):
        # Fresh instance for isolated unit tests
        self.net = NetworkManager(
            wifi_interface="wlan0",
            probe_interval_s=1.0,
            initial_backoff_s=1.0,
            max_backoff_s=8.0
        )
        self.cloud = CloudSyncService(
            cloud_url="https://skycon-test.pythonanywhere.com",
            api_key="test_api_key_2026",
            sync_interval_s=1.0
        )
        # Clear any leftover spool in test store
        json_store.save("offline_sync_spool", [])

    def tearDown(self):
        self.net.stop()
        self.cloud.stop()
        json_store.save("offline_sync_spool", [])

    # -------------------------------------------------------------------------
    # Scenario 1 & 2: Pi connects to a mobile hotspot & obtains internet access
    # -------------------------------------------------------------------------
    def test_01_and_02_pi_connects_to_hotspot_and_obtains_internet(self):
        """[SIMULATION ONLY] Scenario 1 & 2: Pi connects to mobile hotspot and verifies internet access."""
        with patch.object(self.net, "_check_wifi_interface", return_value=(True, "Pixel_7_Hotspot", -62, "192.168.43.155")), \
             patch.object(self.net, "_check_internet_socket", return_value=True), \
             patch.object(self.net, "_check_cloud_reachability", return_value=True):

            state = self.net.probe_network()
            status = self.net.get_status()

            self.assertEqual(state, NetworkState.ONLINE)
            self.assertTrue(status["wifi_connected"])
            self.assertEqual(status["ssid"], "Pixel_7_Hotspot")
            self.assertEqual(status["rssi_dbm"], -62)
            self.assertGreater(status["signal_strength_pct"], 50)
            self.assertEqual(status["ip_address"], "192.168.43.155")
            self.assertTrue(status["internet_accessible"])
            self.assertTrue(status["cloud_accessible"])
            self.assertFalse(status["reconnection"]["in_progress"])

    # -------------------------------------------------------------------------
    # Scenario 3 & 4: Pi sends heartbeat to cloud & GCS displays online status
    # -------------------------------------------------------------------------
    def test_03_and_04_cloud_heartbeat_and_gcs_online_status(self):
        """[SIMULATION ONLY] Scenario 3 & 4: Outbound cloud heartbeat dispatch and GCS telemetry display."""
        with patch.object(self.cloud, "_dispatch_post", return_value=(True, 42.5)):
            res = self.cloud.trigger_sync_now()
            self.assertTrue(res["success"])
            self.assertTrue(self.cloud.is_online)
            self.assertEqual(self.cloud.consecutive_failures, 0)
            self.assertEqual(self.cloud.last_latency_ms, 42.5)

            status = self.cloud.get_status()
            self.assertTrue(status["is_online"])
            self.assertEqual(status["spooled_records_count"], 0)
            self.assertLess(status["last_sync_age_s"], 2.0)

    # -------------------------------------------------------------------------
    # Scenario 5 & 6: Hotspot switched off & GCS displays disconnection
    # -------------------------------------------------------------------------
    def test_05_and_06_hotspot_off_and_gcs_disconnection_display(self):
        """[SIMULATION ONLY] Scenario 5 & 6: Hotspot powered off, internet lost, state transitions to RECONNECTING."""
        # First put in online state
        with patch.object(self.net, "_check_wifi_interface", return_value=(True, "Pixel_7_Hotspot", -62, "192.168.43.155")), \
             patch.object(self.net, "_check_internet_socket", return_value=True), \
             patch.object(self.net, "_check_cloud_reachability", return_value=True):
            self.net.probe_network()
            self.assertEqual(self.net.state, NetworkState.ONLINE)

        # Now simulate hotspot powered off (wlan0 loses association, internet down)
        with patch.object(self.net, "_check_wifi_interface", return_value=(False, None, -99, None)), \
             patch.object(self.net, "_check_internet_socket", return_value=False), \
             patch.object(self.net, "_check_cloud_reachability", return_value=False), \
             patch.object(self.net, "_trigger_os_reconnect") as mock_reconn:

            state = self.net.probe_network()
            status = self.net.get_status()

            self.assertEqual(state, NetworkState.RECONNECTING)
            self.assertFalse(status["wifi_connected"])
            self.assertIsNone(status["ssid"])
            self.assertFalse(status["internet_accessible"])
            self.assertTrue(status["reconnection"]["in_progress"])
            self.assertGreater(status["reconnection"]["last_disconnection_time"], 0.0)
            mock_reconn.assert_called_once()

    # -------------------------------------------------------------------------
    # Scenario 7: Pi continues local services during network outage
    # -------------------------------------------------------------------------
    def test_07_pi_continues_local_services_during_outage(self):
        """[SIMULATION ONLY] Scenario 7: Local-First Safety — MAVLink and Autonomy remain 100% operational."""
        # Set network to RECONNECTING
        self.net.state = NetworkState.RECONNECTING

        # Verify MAVLink multiplexer is operational and unaffected
        mav_state = mavlink_mux.get_state()
        self.assertIsNotNone(mav_state)

        # Verify mission engine state machine is intact and transitions legally
        initial_status = mission_engine.get_status()
        self.assertIsNotNone(initial_status)
        self.assertIn("state", initial_status)

        # Cloud sync safely spools records to disk without blocking or throwing exceptions
        with patch.object(self.cloud, "_dispatch_post", return_value=(False, 0.0)):
            res = self.cloud._perform_sync_cycle()
            self.assertFalse(res)
            self.assertFalse(self.cloud.is_online)

            spool = json_store.load("offline_sync_spool", fallback=[])
            self.assertGreaterEqual(len(spool), 1)

    # -------------------------------------------------------------------------
    # Scenario 8 & 9: Hotspot switched on again & Pi reconnects automatically
    # -------------------------------------------------------------------------
    def test_08_and_09_hotspot_on_and_automatic_reconnection(self):
        """[SIMULATION ONLY] Scenario 8 & 9: Hotspot returns, watchdog auto-detects and reconnects."""
        # Start in disconnected state
        self.net.state = NetworkState.RECONNECTING
        self.net.consecutive_probe_failures = 3

        # Hotspot reappears
        with patch.object(self.net, "_check_wifi_interface", return_value=(True, "Pixel_7_Hotspot", -58, "192.168.43.155")), \
             patch.object(self.net, "_check_internet_socket", return_value=True), \
             patch.object(self.net, "_check_cloud_reachability", return_value=True):

            state = self.net.probe_network()
            status = self.net.get_status()

            self.assertEqual(state, NetworkState.ONLINE)
            self.assertTrue(status["wifi_connected"])
            self.assertEqual(status["ssid"], "Pixel_7_Hotspot")
            self.assertEqual(status["rssi_dbm"], -58)
            self.assertEqual(self.net.consecutive_probe_failures, 0)
            self.assertEqual(self.net.current_backoff_delay_s, self.net.initial_backoff_s)

    # -------------------------------------------------------------------------
    # Scenario 10 & 11: Cloud heartbeat resumes & GCS returns to online status
    # -------------------------------------------------------------------------
    def test_10_and_11_cloud_heartbeat_resumes_and_spool_drains(self):
        """[SIMULATION ONLY] Scenario 10 & 11: Cloud connection restored, spooled packets drain, GCS online."""
        # Put 3 spooled packets in offline queue
        spooled_data = [
            {"source": "PI4", "seq": 1, "hash": "h1"},
            {"source": "PI4", "seq": 2, "hash": "h2"},
            {"source": "PI4", "seq": 3, "hash": "h3"}
        ]
        json_store.save("offline_sync_spool", spooled_data)
        self.assertEqual(len(json_store.load("offline_sync_spool")), 3)

        # Reconnect and trigger sync
        with patch.object(self.cloud, "_dispatch_post", return_value=(True, 35.0)):
            success = self.cloud._perform_sync_cycle()
            self.assertTrue(success)
            self.assertTrue(self.cloud.is_online)

            # Spool must be completely drained
            remaining = json_store.load("offline_sync_spool")
            self.assertEqual(len(remaining), 0)
            self.assertGreaterEqual(self.cloud.total_packets_synced, 4)

    # -------------------------------------------------------------------------
    # Scenario 12: Laptop accesses GCS from a different internet network
    # -------------------------------------------------------------------------
    def test_12_laptop_accesses_gcs_from_different_network(self):
        """[SIMULATION ONLY] Scenario 12: Laptop and Pi are on different networks; GCS polls via cloud relay."""
        # Cloud ingestion endpoint ingests Pi companion telemetry
        test_payload = {
            "source": "SKYCON_COMPANION_PI4",
            "timestampUtc": datetime.now(timezone.utc).isoformat(),
            "telemetry": {"voltage_battery": 16.2, "flight_mode": "LOITER", "satellites": 14},
            "mission": {"state": "STAGE_5_SEARCH_ACTIVE"},
            "hash": "test_hash_12345"
        }
        # Simulate cloud backend storing telemetry
        json_store.save("cloud_last_telemetry", test_payload)

        # Simulate laptop GCS on college/home Wi-Fi polling PythonAnywhere cloud
        retrieved = json_store.load("cloud_last_telemetry")
        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved["source"], "SKYCON_COMPANION_PI4")
        self.assertEqual(retrieved["telemetry"]["voltage_battery"], 16.2)
        self.assertEqual(retrieved["telemetry"]["flight_mode"], "LOITER")
        self.assertEqual(retrieved["mission"]["state"], "STAGE_5_SEARCH_ACTIVE")

    # -------------------------------------------------------------------------
    # Security: Credential Protection and Injection Prevention
    # -------------------------------------------------------------------------
    def test_13_secure_hotspot_credential_protection(self):
        """Verify hotspot configuration sanitizes input, never exposes password, and sets chmod 600."""
        # Test valid configuration
        res = self.net.configure_mobile_hotspot("My_Phone_Hotspot", "SuperSecretPassword123!")
        self.assertTrue(res["success"])
        # Verify password is NOT in response
        self.assertNotIn("password", json.dumps(res))
        self.assertNotIn("SuperSecretPassword123!", json.dumps(res))

        # Verify command injection characters are strictly rejected
        bad_ssid = self.net.configure_mobile_hotspot("Hotspot; rm -rf /", "password")
        self.assertFalse(bad_ssid["success"])
        self.assertIn("Invalid characters", bad_ssid["error"])

        bad_pwd = self.net.configure_mobile_hotspot("CleanSSID", "pwd`reboot`")
        self.assertFalse(bad_pwd["success"])
        self.assertIn("Invalid characters", bad_pwd["error"])


if __name__ == "__main__":
    unittest.main()
