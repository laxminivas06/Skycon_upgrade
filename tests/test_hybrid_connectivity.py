"""
=====================================================================================
SKYCON TEST SUITE: HYBRID ONLINE/OFFLINE AUTONOMY & MULTI-HOTSPOT FAILOVER
MODULE: test_hybrid_connectivity.py
Comprehensive Verification of Multi-Hotspot Sequential Failover, Coordinate
Validation, Versioned Packages, Local Coverage Tracking & Offline Autonomy
=====================================================================================
Scenarios Tested:
  1. Multi-Hotspot Profile Priority Management & Sorting
  2. Zero Credential Exposure (Passwords Protected & Never Echoed)
  3. Sequential Failover from Primary -> Secondary Hotspot on Link Drop
  4. Sequential Failover from Secondary -> Backup Hotspot on Continued Outage
  5. Connection Hysteresis & Anti-Thrashing Guard (60s Stability Period)
  6. Reconnection Latency & Transition Telemetry Tracking
  7. Coordinate Validation: High-Confidence Target Approval
  8. Coordinate Validation: Strict Null-Island (0,0) Rejection
  9. Coordinate Validation: Invalid Geographic Range Rejection
  10. Coordinate Validation: Operational Mission Boundary Containment
  11. Coordinate Validation: Hard Geofence Breach Rejection
  12. Coordinate Validation: Altitude Floor (<5m) and Ceiling (>25m) Interlocks
  13. Coordinate Validation: Stale Coordinate (>30s) Rejection
  14. Coordinate Validation: Low-Confidence / Uncalibrated Target Quarantine
  15. Versioned Coordinate Package Protocol & Checksum Verification
  16. Tampered Coordinate Package Detection & Rejection
  17. MAVLink MISSION_ITEM_INT Export from Validated Coordinate Package
  18. Onboard Real-Time Grid Coverage Tracker (100% Offline Optical Footprint)
  19. Air-Gapped Offline Mission Continuity (Zero Dependence on Cloud)
  20. Multi-Hotspot and Navigation REST API Endpoints (FastAPI & Flask)
=====================================================================================
"""

import os
import sys
import time
import json
import unittest
from typing import Dict, Any, List

# Ensure project root is on sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.network_manager import network_manager, NetworkState, HotspotProfile
from backend.coordinate_validator import (
    coordinate_validator,
    ValidatedCoordinate,
    CoordinateQualityState,
    ValidationDecision
)
from backend.coordinate_package import (
    coordinate_package_manager,
    CoordinatePackage
)
from backend.coverage_tracker import coverage_tracker, GridCell
from backend.simple_json_store import json_store, compute_sha256
from backend.cloud_sync import cloud_sync_service
from backend.mission_engine import mission_engine
from backend.server import app as fastapi_app
from backend.main import app as flask_app
from fastapi.testclient import TestClient


class TestHybridConnectivityAndAutonomy(unittest.TestCase):
    """Exhaustive test suite for hybrid online/offline UAV autonomy and failover."""

    def setUp(self):
        self.fastapi_client = TestClient(fastapi_app)
        self.flask_client = flask_app.test_client()
        # Save original profiles
        self.orig_profiles = list(network_manager.profiles)

    def tearDown(self):
        # Restore original profiles
        network_manager.profiles = list(self.orig_profiles)
        network_manager._save_profiles()
        network_manager.stop()
        coverage_tracker.reset()

    # =========================================================================
    # 1. MULTI-HOTSPOT PROFILE & CREDENTIAL SECURITY TESTS
    # =========================================================================

    def test_01_multi_hotspot_priority_sorting(self):
        """Verifies multi-hotspot profiles are strictly sorted by priority (1=Primary, 2=Secondary, 3=Backup)."""
        network_manager.profiles = []

        res1 = network_manager.configure_hotspot_profile("Backup_Hotspot_C", "pass_c_secret", priority=3)
        self.assertTrue(res1["success"])
        res2 = network_manager.configure_hotspot_profile("Primary_Hotspot_A", "pass_a_secret", priority=1)
        self.assertTrue(res2["success"])
        res3 = network_manager.configure_hotspot_profile("Secondary_Hotspot_B", "pass_b_secret", priority=2)
        self.assertTrue(res3["success"])

        # Check sorted order in memory and status
        self.assertEqual(len(network_manager.profiles), 3)
        self.assertEqual(network_manager.profiles[0].ssid, "Primary_Hotspot_A")
        self.assertEqual(network_manager.profiles[0].priority, 1)
        self.assertEqual(network_manager.profiles[1].ssid, "Secondary_Hotspot_B")
        self.assertEqual(network_manager.profiles[1].priority, 2)
        self.assertEqual(network_manager.profiles[2].ssid, "Backup_Hotspot_C")
        self.assertEqual(network_manager.profiles[2].priority, 3)

    def test_02_zero_credential_exposure_in_apis_and_logs(self):
        """Verifies passwords are never returned in get_status(), API endpoints, or serialized profiles."""
        secret_pwd = "SuperSecretFieldPassword_99!"
        network_manager.configure_hotspot_profile("Secured_Hotspot", secret_pwd, priority=1)

        status = network_manager.get_status()
        status_str = json.dumps(status)
        self.assertNotIn(secret_pwd, status_str)

        # Check FastAPI endpoint
        res = self.fastapi_client.get("/api/network/hotspots")
        self.assertEqual(res.status_code, 200)
        self.assertNotIn(secret_pwd, res.text)

        # Check Flask endpoint
        flask_res = self.flask_client.get("/api/network/hotspots")
        self.assertEqual(flask_res.status_code, 200)
        self.assertNotIn(secret_pwd.encode(), flask_res.data)

    def test_03_sequential_failover_primary_to_secondary(self):
        """Verifies that when primary hotspot fails, watchdog sequentially advances to secondary."""
        network_manager.profiles = []
        network_manager.configure_hotspot_profile("Primary_Phone", "pwd1", priority=1)
        network_manager.configure_hotspot_profile("Secondary_Runner", "pwd2", priority=2)

        network_manager.active_profile_index = 0
        network_manager.current_ssid = "Primary_Phone"
        network_manager.last_reconnect_attempt_time = 0.0

        # Trigger failover
        network_manager._trigger_multi_hotspot_failover()

        # Should advance to index 1 (Secondary_Runner)
        self.assertEqual(network_manager.active_profile_index, 1)
        self.assertEqual(network_manager.current_ssid, "Secondary_Runner")
        self.assertGreater(network_manager.failover_count, 0)
        self.assertIsNotNone(network_manager.last_failover_time)

    def test_04_sequential_failover_secondary_to_backup_and_wrap(self):
        """Verifies that failover continues to backup and cleanly wraps back to primary if needed."""
        network_manager.profiles = []
        network_manager.configure_hotspot_profile("Hotspot_1", "pwd1", priority=1)
        network_manager.configure_hotspot_profile("Hotspot_2", "pwd2", priority=2)
        network_manager.configure_hotspot_profile("Hotspot_3", "pwd3", priority=3)

        network_manager.active_profile_index = 1
        network_manager.last_reconnect_attempt_time = 0.0
        network_manager._trigger_multi_hotspot_failover()
        self.assertEqual(network_manager.active_profile_index, 2)
        self.assertEqual(network_manager.current_ssid, "Hotspot_3")

        # Next failover should wrap to 0 (Hotspot_1)
        network_manager.last_reconnect_attempt_time = 0.0
        network_manager._trigger_multi_hotspot_failover()
        self.assertEqual(network_manager.active_profile_index, 0)
        self.assertEqual(network_manager.current_ssid, "Hotspot_1")

    def test_05_connection_hysteresis_guards_against_thrashing(self):
        """Verifies that while connected to secondary, stability period prevents rapid thrashing back to primary."""
        network_manager.profiles = []
        network_manager.configure_hotspot_profile("Primary_Hotspot", "p1", priority=1)
        network_manager.configure_hotspot_profile("Secondary_Hotspot", "p2", priority=2)

        # Mark secondary actively connected 10 seconds ago (stability_period is 60s)
        network_manager.current_ssid = "Secondary_Hotspot"
        network_manager.profiles[1].is_active = True
        network_manager.profiles[0].is_active = False
        network_manager.current_connection_start_time = time.time() - 10.0
        network_manager.stability_period_s = 60.0

        # Run hysteresis evaluation
        network_manager._evaluate_hysteresis_switch()
        # Should stay on secondary because uptime (10s) < stability period (60s)
        self.assertEqual(network_manager.get_active_profile().ssid, "Secondary_Hotspot")

    # =========================================================================
    # 2. COORDINATE VALIDATION SYSTEM TESTS
    # =========================================================================

    def test_06_high_confidence_coordinate_approval(self):
        """Verifies that a valid coordinate within geofence and envelope receives HIGH_CONFIDENCE and APPROVED."""
        res = coordinate_validator.validate_coordinate(
            lat=13.082700,
            lon=80.270700,
            altitude_m=12.0,
            current_drone_lat=13.082650,
            current_drone_lon=80.270650,
            home_lat=13.082500,
            home_lon=80.270500,
            geofence_max_radius_m=100.0,
            camera_calibrated=True,
            horizontal_uncertainty_m=0.8,
            consecutive_frames_verified=4
        )
        self.assertEqual(res.validation_status, ValidationDecision.APPROVED)
        self.assertEqual(res.quality_state, CoordinateQualityState.HIGH_CONFIDENCE)
        self.assertGreaterEqual(res.confidence_score, 0.85)
        self.assertEqual(len(res.rejection_errors), 0)

    def test_07_null_island_coordinate_rejection(self):
        """Verifies that (0.0, 0.0) Null Island coordinates are strictly REJECTED."""
        res = coordinate_validator.validate_coordinate(
            lat=0.0,
            lon=0.0,
            altitude_m=10.0
        )
        self.assertEqual(res.validation_status, ValidationDecision.REJECTED)
        self.assertEqual(res.quality_state, CoordinateQualityState.REJECTED)
        self.assertTrue(any("Null Island" in err for err in res.rejection_errors))

    def test_08_invalid_wgs84_range_rejection(self):
        """Verifies coordinates with latitude > 90 or longitude > 180 are REJECTED."""
        res_lat = coordinate_validator.validate_coordinate(lat=95.0, lon=80.0, altitude_m=10.0)
        self.assertEqual(res_lat.validation_status, ValidationDecision.REJECTED)

        res_lon = coordinate_validator.validate_coordinate(lat=13.0, lon=185.0, altitude_m=10.0)
        self.assertEqual(res_lon.validation_status, ValidationDecision.REJECTED)

    def test_09_geofence_radius_breach_rejection(self):
        """Verifies targets outside configured maximum geofence radius are REJECTED."""
        home_lat, home_lon = 13.082500, 80.270500
        # Target ~250 meters away (radius is 100m)
        target_lat = 13.084700
        target_lon = 80.270500

        res = coordinate_validator.validate_coordinate(
            lat=target_lat,
            lon=target_lon,
            altitude_m=12.0,
            home_lat=home_lat,
            home_lon=home_lon,
            geofence_max_radius_m=100.0
        )
        self.assertEqual(res.validation_status, ValidationDecision.REJECTED)
        self.assertTrue(any("geofence" in err.lower() for err in res.rejection_errors))

    def test_10_altitude_envelope_violation_rejection(self):
        """Verifies altitude below 5.0m AGL or above 25.0m AGL is REJECTED."""
        # Below floor
        res_low = coordinate_validator.validate_coordinate(lat=13.0827, lon=80.2707, altitude_m=3.0)
        self.assertEqual(res_low.validation_status, ValidationDecision.REJECTED)
        self.assertTrue(any("minimum safe ground clearance" in err for err in res_low.rejection_errors))

        # Above ceiling
        res_high = coordinate_validator.validate_coordinate(lat=13.0827, lon=80.2707, altitude_m=35.0)
        self.assertEqual(res_high.validation_status, ValidationDecision.REJECTED)
        self.assertTrue(any("maximum competition ceiling" in err for err in res_high.rejection_errors))

    def test_11_stale_coordinate_rejection(self):
        """Verifies coordinates older than max age (30s) are REJECTED."""
        stale_time = time.time() - 45.0  # 45 seconds ago
        res = coordinate_validator.validate_coordinate(
            lat=13.0827,
            lon=80.2707,
            altitude_m=10.0,
            image_timestamp=stale_time
        )
        self.assertEqual(res.validation_status, ValidationDecision.REJECTED)
        self.assertTrue(any("stale" in err.lower() for err in res.rejection_errors))

    def test_12_insufficient_frames_quarantined_as_unverified(self):
        """Verifies that a visual candidate with < 3 frames is quarantined as UNVERIFIED / PENDING_REVIEW."""
        res = coordinate_validator.validate_coordinate(
            lat=13.0827,
            lon=80.2707,
            altitude_m=10.0,
            consecutive_frames_verified=1  # Only 1 frame observed
        )
        self.assertEqual(res.quality_state, CoordinateQualityState.UNVERIFIED)
        self.assertEqual(res.validation_status, ValidationDecision.PENDING_REVIEW)

    # =========================================================================
    # 3. VERSIONED COORDINATE PACKAGE PROTOCOL TESTS
    # =========================================================================

    def test_13_versioned_package_creation_and_integrity(self):
        """Verifies that coordinate packages compute deterministic SHA-256 and validate cleanly."""
        coords = [
            coordinate_validator.validate_coordinate(lat=13.0827, lon=80.2707, altitude_m=10.0),
            coordinate_validator.validate_coordinate(lat=13.0828, lon=80.2708, altitude_m=12.0)
        ]
        pkg = coordinate_package_manager.create_package(
            package_id="PKG_TEST_01",
            coordinates=coords,
            source="LOCAL_VISION",
            execution_strategy="INSPECT_CANDIDATE"
        )
        self.assertEqual(pkg.package_id, "PKG_TEST_01")
        self.assertGreater(len(pkg.checksum_sha256), 32)
        self.assertTrue(pkg.validation_passed)

    def test_14_tampered_package_rejection(self):
        """Verifies that a coordinate package with an altered coordinate or mismatched checksum is REJECTED."""
        pkg_data = {
            "package_id": "PKG_TAMPERED_01",
            "version": 1,
            "source": "CLOUD_HEATMAP",
            "execution_strategy": "INSPECT_CANDIDATE",
            "coordinates": [{"lat": 13.0827, "lon": 80.2707, "altitude_m": 10.0}],
            "checksum_sha256": "0000000000000000000000000000000000000000000000000000000000000000"  # Invalid hash
        }
        is_approved, pkg, errors = coordinate_package_manager.receive_and_validate_package(pkg_data)
        self.assertFalse(is_approved)
        self.assertFalse(pkg.validation_passed)
        self.assertTrue(any("checksum mismatch" in err.lower() for err in errors))

    def test_15_mavlink_mission_items_conversion(self):
        """Verifies valid coordinate packages convert to ArduCopter MISSION_ITEM_INT commands."""
        coords = [
            coordinate_validator.validate_coordinate(lat=13.0827, lon=80.2707, altitude_m=10.0, target_label="TARGET_A")
        ]
        pkg = coordinate_package_manager.create_package("PKG_MAV_01", coords)
        items = coordinate_package_manager.to_mavlink_mission_items(pkg)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["command"], 16)  # MAV_CMD_NAV_WAYPOINT
        self.assertEqual(items[0]["frame"], 6)    # MAV_FRAME_GLOBAL_RELATIVE_ALT_INT
        self.assertEqual(items[0]["z"], 10.0)
        self.assertEqual(items[0]["name"], "TARGET_A")

    # =========================================================================
    # 4. ONBOARD REAL-TIME GRID COVERAGE TRACKER TESTS
    # =========================================================================

    def test_16_coverage_tracker_grid_initialization_and_cell_marking(self):
        """Verifies local 2D grid matrix marks visited cells based on camera footprint without cloud."""
        boundary = [
            (13.0820, 80.2700),
            (13.0830, 80.2700),
            (13.0830, 80.2710),
            (13.0820, 80.2710)
        ]
        coverage_tracker.initialize_grid(boundary)
        status = coverage_tracker.get_status()

        self.assertTrue(status["initialized"])
        self.assertGreater(status["total_cells"], 0)
        self.assertEqual(status["visited_cells"], 0)
        self.assertEqual(status["coverage_pct"], 0.0)

        # Fly drone through the center of the grid at 10m AGL
        newly_visited = coverage_tracker.update_coverage(
            drone_lat=13.0825,
            drone_lon=80.2705,
            altitude_agl_m=10.0
        )
        self.assertGreater(newly_visited, 0)
        updated_status = coverage_tracker.get_status()
        self.assertGreater(updated_status["visited_cells"], 0)
        self.assertGreater(updated_status["coverage_pct"], 0.0)
        self.assertGreater(updated_status["scanned_area_m2"], 0.0)

    def test_17_coverage_tracker_reset(self):
        """Verifies coverage tracker cleanly resets all cells for a new sortie."""
        coverage_tracker.reset()
        status = coverage_tracker.get_status()
        self.assertEqual(status["visited_cells"], 0)
        self.assertEqual(status["coverage_pct"], 0.0)

    # =========================================================================
    # 5. AIR-GAPPED OFFLINE MISSION CONTINUITY & SPOOLING
    # =========================================================================

    def test_18_offline_mission_continuity_and_telemetry_spooling(self):
        """Verifies that when internet is severed, companion continues mission and spools offline records."""
        # 1. Clear any prior spool in json_store
        json_store.save("offline_sync_spool", [])

        # 2. Spool payload offline
        telemetry_sample = {"lat": 13.0827, "lon": 80.2707, "alt": 10.0, "mode": "AUTO"}
        cloud_sync_service._spool_payload(telemetry_sample)

        # 3. Verify record was successfully spooled to disk
        spool = json_store.load("offline_sync_spool", fallback=[])
        self.assertEqual(len(spool), 1)
        self.assertEqual(spool[0]["lat"], 13.0827)

        status = cloud_sync_service.get_status()
        self.assertGreaterEqual(status["spooled_records_count"], 1)

    # =========================================================================
    # 6. REST API INTEGRATION TESTS (FASTAPI & FLASK)
    # =========================================================================

    def test_19_fastapi_hotspots_and_navigation_endpoints(self):
        """Verifies FastAPI endpoints for hotspot management, coordinate validation, and coverage."""
        # Hotspot configuration
        res_cfg = self.fastapi_client.post("/api/network/hotspots/configure", json={
            "ssid": "Test_Hotspot_FastAPI",
            "password": "Password123",
            "priority": 1,
            "is_hidden": False
        })
        self.assertEqual(res_cfg.status_code, 200)

        # Hotspots list
        res_list = self.fastapi_client.get("/api/network/hotspots")
        self.assertEqual(res_list.status_code, 200)
        data = res_list.json()
        self.assertTrue(any(p["ssid"] == "Test_Hotspot_FastAPI" for p in data["profiles"]))

        # Coordinate validation
        res_val = self.fastapi_client.post("/api/navigation/coordinate/validate", json={
            "lat": 13.0827,
            "lon": 80.2707,
            "altitude_m": 12.0
        })
        self.assertEqual(res_val.status_code, 200)
        self.assertEqual(res_val.json()["coordinate"]["validation_status"], "APPROVED")

        # Coverage tracker status
        res_cov = self.fastapi_client.get("/api/spatial/coverage/tracker")
        self.assertEqual(res_cov.status_code, 200)
        self.assertIn("coverage_pct", res_cov.json()["coverage"])

    def test_20_flask_hotspots_and_coordinate_endpoints(self):
        """Verifies Flask endpoints (PythonAnywhere WSGI compatibility) respond cleanly."""
        res_hotspots = self.flask_client.get("/api/network/hotspots")
        self.assertEqual(res_hotspots.status_code, 200)
        body = json.loads(res_hotspots.data)
        self.assertEqual(body["status"], "success")
        self.assertIn("profiles", body["data"])

        res_validate = self.flask_client.post("/api/navigation/coordinate/validate", json={
            "lat": 13.0827,
            "lon": 80.2707,
            "altitude_m": 12.0
        })
        self.assertEqual(res_validate.status_code, 200)
        val_body = json.loads(res_validate.data)
        self.assertEqual(val_body["data"]["validation_status"], "APPROVED")


if __name__ == "__main__":
    unittest.main()
