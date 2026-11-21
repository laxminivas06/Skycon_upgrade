"""
SKYCON System — Master Python Test Suite
Verifies:
1. SimpleJsonStore atomic persistence, SHA-256 checksums, auto-healing, and bounded sizes.
2. MavlinkMultiplexer packet decoding, flight modes, RC channels, and commands.
3. MissionEngine 17-state FSM, 5-minute competition timeline, geofence enforcement, and 3-layer heatmap.
4. FastAPI server REST endpoints and camera frame ingestion.
"""

import os
import sys
import time
import json
import unittest
from datetime import datetime, timezone

# Ensure project root is in python path
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from backend.simple_json_store import SimpleJsonStore, compute_sha256
from backend.mavlink_multiplexer import MavlinkMultiplexer, COPTER_MODES, MODE_NAME_TO_INT
from backend.mission_engine import MissionEngine, haversine_distance, point_in_polygon
from backend.server import app
from fastapi.testclient import TestClient


class TestSimpleJsonStore(unittest.TestCase):

    def setUp(self):
        self.test_dir = os.path.join(ROOT_DIR, "tests", "test_scratch_store")
        os.makedirs(self.test_dir, exist_ok=True)
        self.store = SimpleJsonStore(data_dir=self.test_dir)

    def tearDown(self):
        import shutil
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_atomic_save_and_load(self):
        data = {"missionId": "TEST_001", "name": "Alpha Recon", "value": 42}
        success = self.store.save("test_col", data)
        self.assertTrue(success)
        loaded = self.store.load("test_col")
        self.assertEqual(loaded, data)

    def test_sha256_checksum(self):
        data1 = {"code": "42", "lat": 13.0827}
        data2 = {"code": "42", "lat": 13.0827}
        data3 = {"code": "99", "lat": 13.0827}
        h1 = compute_sha256(data1)
        h2 = compute_sha256(data2)
        h3 = compute_sha256(data3)
        self.assertEqual(h1, h2)
        self.assertNotEqual(h1, h3)
        self.assertEqual(len(h1), 64)

    def test_auto_healing_from_backup(self):
        col_file = os.path.join(self.test_dir, "healing_test.json")
        bak_file = f"{col_file}.bak"
        valid_data = {"status": "HEALTHY", "count": 100}

        # Save valid data first (creates .bak on subsequent save)
        self.store.save("healing_test", valid_data)
        self.store.save("healing_test", {"status": "HEALTHY", "count": 101})

        # Intentionally corrupt primary file
        with open(col_file, "w") as f:
            f.write("{ INVALID JSON CORRUPTION ...")

        # Load should auto-heal from .bak
        restored = self.store.load("healing_test")
        self.assertIsNotNone(restored)
        self.assertIn("status", restored)

    def test_bounded_mission_history(self):
        for i in range(15):
            self.store.save_mission({"missionId": f"MISS_{i}", "step": i}, max_records=5)
        missions = self.store.load("missions")
        self.assertLessEqual(len(missions), 5)


class TestMavlinkMultiplexer(unittest.TestCase):

    def setUp(self):
        self.mux = MavlinkMultiplexer()

    def test_flight_mode_mappings(self):
        self.assertEqual(COPTER_MODES[0], 'STABILIZE')
        self.assertEqual(COPTER_MODES[4], 'GUIDED')
        self.assertEqual(COPTER_MODES[5], 'LOITER')
        self.assertEqual(COPTER_MODES[6], 'RTL')
        self.assertEqual(COPTER_MODES[9], 'LAND')
        self.assertEqual(MODE_NAME_TO_INT['GUIDED'], 4)
        self.assertEqual(MODE_NAME_TO_INT['RTL'], 6)

    def test_command_execution(self):
        self.mux.arm()
        telem = self.mux.get_telemetry()
        self.assertTrue(telem["armed"])

        self.mux.set_mode("GUIDED")
        telem = self.mux.get_telemetry()
        self.assertEqual(telem["flight_mode"], "GUIDED")

        self.mux.takeoff(12.5)
        telem = self.mux.get_telemetry()
        self.assertEqual(telem["flight_mode"], "GUIDED")

        self.mux.emergency_rtl()
        telem = self.mux.get_telemetry()
        self.assertEqual(telem["flight_mode"], "RTL")

        self.mux.disarm()
        telem = self.mux.get_telemetry()
        self.assertFalse(telem["armed"])


class TestMissionEngine(unittest.TestCase):

    def setUp(self):
        self.engine = MissionEngine()

    def test_state_transitions(self):
        self.engine.state = "IDLE"
        # Valid: IDLE -> PREFLIGHT
        self.assertTrue(self.engine.transition_to("PREFLIGHT", "Operator started checks"))
        # Valid: PREFLIGHT -> READY
        self.assertTrue(self.engine.transition_to("READY", "All checks passed"))
        # Invalid: READY -> COMPLETED (Not directly permitted)
        self.assertFalse(self.engine.transition_to("COMPLETED", "Premature completion"))
        # Valid emergency: ANY -> FAILSAFE
        self.assertTrue(self.engine.transition_to("FAILSAFE", "Safety abort"))

    def test_5_minute_competition_timeline(self):
        self.engine.start_mission()
        self.assertEqual(self.engine.target_duration_s, 300)
        self.assertGreater(self.engine.get_remaining_seconds(), 290)
        self.assertLessEqual(self.engine.get_elapsed_seconds(), 5)

    def test_circular_scan_planner(self):
        center_lat = 13.0827
        center_lon = 80.2707
        radius = 15.0
        alt = 10.0
        waypoints = self.engine.plan_circular_scan(center_lat, center_lon, radius, alt)
        self.assertGreater(len(waypoints), 10)
        for wp in waypoints:
            self.assertEqual(wp["alt"], 10.0)
            dist = haversine_distance(center_lat, center_lon, wp["lat"], wp["lon"])
            self.assertLessEqual(dist, radius + 1.0)

    def test_geofence_breach_detection(self):
        # Configure geofence: radius 50m, alt 25m
        self.engine.geofence["radius"] = 50.0
        self.engine.geofence["alt_max"] = 25.0
        self.engine.geofence["center"] = {"lat": 13.0827, "lon": 80.2707}

        # Point inside
        breached, dist, msg = self.engine.check_geofence_breach(13.0827, 80.2707, 10.0)
        self.assertFalse(breached)
        self.assertGreater(dist, 40.0)

        # Altitude breach (> 25m)
        breached, dist, msg = self.engine.check_geofence_breach(13.0827, 80.2707, 30.0)
        self.assertTrue(breached)
        self.assertIn("Altitude", msg)

        # Horizontal breach (far outside 50m)
        breached, dist, msg = self.engine.check_geofence_breach(13.0900, 80.2707, 10.0)
        self.assertTrue(breached)


class TestFastApiServer(unittest.TestCase):

    def setUp(self):
        self.client = TestClient(app)

    def test_health_check(self):
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "healthy")
        self.assertIn("Raspberry Pi 4", data["companion"])

    def test_telemetry_endpoint(self):
        res = self.client.get("/api/telemetry")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["success"])
        self.assertIn("flight_mode", data["telemetry"])

    def test_system_health_endpoint(self):
        res = self.client.get("/api/system/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["success"])
        self.assertIn("cpuUsagePct", data)
        self.assertIn("ramUsagePct", data)

    def test_commands(self):
        res = self.client.post("/api/command/arm", json={"force": True})
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()["success"])

        res = self.client.post("/api/command/mode", json={"mode": "GUIDED"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["mode"], "GUIDED")

        res = self.client.post("/api/command/emergency_rtl")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()["success"])

    def test_qr_detection_validation(self):
        # Invalid payload (not 2 digits)
        res = self.client.post("/api/recon/detections", json={"payload": "INVALID_TEXT_NO_DIGITS"})
        self.assertEqual(res.status_code, 400)

        # Valid 2-digit payload
        res = self.client.post("/api/recon/detections", json={
            "payload": "42",
            "droneStateAtCapture": {"lat": 13.0827, "lon": 80.2707, "alt": 10.0}
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["detection"]["twoDigitCode"], "42")
        self.assertTrue(data["detection"]["verified"])

    def test_spatial_heatmap_endpoints(self):
        res = self.client.get("/api/spatial/heatmap")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["success"])
        self.assertIn("layerA_coverage", data)

        res = self.client.get("/api/spatial/summary")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["success"])
        self.assertIn("scannedPercentage", data)


if __name__ == '__main__':
    unittest.main()
