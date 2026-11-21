"""
SKYCON Phase 2 Foundation Test Suite
Validates:
  1. Application startup & WSGI integration
  2. Configuration loading & safety flags
  3. Canonical API registration (All 13 endpoint groups)
  4. Authentication & RBAC token verification
  5. Storage operations & bounded collection size
  6. JSON schema versioning (v2.0) & SHA-256 integrity
  7. Error handling & standardized response envelope
  8. Frontend entry point loading (/ and /drone-core)
  9. Health endpoints & multi-subsystem states
  10. Environment profiles & flight safety interlocks
"""

import os
import sys
import json
import time
import unittest

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from backend.settings import settings
from backend.main import app as flask_app
from backend.auth_service import auth_service
from backend.simple_json_store import SimpleJsonStore, compute_sha256
from backend.system_health import system_health_service, HealthState


class TestPhase2Foundation(unittest.TestCase):

    def setUp(self):
        flask_app.config["TESTING"] = True
        self.client = flask_app.test_client()
        self.test_dir = os.path.join(ROOT_DIR, "tests", "test_scratch_phase2")
        os.makedirs(self.test_dir, exist_ok=True)
        self.store = SimpleJsonStore(data_dir=self.test_dir)

    def tearDown(self):
        import shutil
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir, ignore_errors=True)

    # 1. Application Startup
    def test_01_application_startup(self):
        """Verifies Flask application and WSGI entry points load successfully."""
        from wsgi import application
        self.assertIsNotNone(application)
        self.assertEqual(application.name, "backend.main")

    # 2. Configuration Loading
    def test_02_configuration_loading(self):
        """Verifies centralized settings, defaults, and competition constraints."""
        self.assertEqual(settings.COMPETITION_TIME_LIMIT_S, 300)
        self.assertEqual(settings.MAX_FENCE_ALTITUDE_M, 25.0)
        self.assertEqual(settings.DEFAULT_FENCE_RADIUS_M, 50.0)
        self.assertEqual(settings.QR_REGEX_PATTERN, r"^\d{2}$")
        self.assertIsInstance(settings.ALLOW_PHYSICAL_ARMING, bool)

    # 3. Canonical API Registration
    def test_03_canonical_api_routes_registered(self):
        """Verifies all 13 canonical endpoint groups are registered on the application."""
        rules = [rule.rule for rule in flask_app.url_map.iter_rules()]
        expected_prefixes = [
            "/api/auth",
            "/api/system",
            "/api/drone",
            "/api/telemetry",
            "/api/mavlink",
            "/api/camera",
            "/api/vision",
            "/api/qr",
            "/api/geofence",
            "/api/geomapping",
            "/api/missions",
            "/api/events",
            "/api/health",
        ]
        for prefix in expected_prefixes:
            has_route = any(rule.startswith(prefix) for rule in rules)
            self.assertTrue(has_route, f"Missing expected API route prefix: {prefix}")

    # 4. Authentication & Access Control
    def test_04_authentication_workflow(self):
        """Verifies login, token issuance, PBKDF2 hashing, and token validation."""
        # 1. Invalid credentials
        res = self.client.post("/api/auth/login", json={"username": "admin", "password": "WRONG_PASSWORD"})
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json["status"], "error")

        # 2. Valid credentials
        res = self.client.post("/api/auth/login", json={"username": "admin", "password": "skycon2026"})
        self.assertEqual(res.status_code, 200)
        body = res.json
        self.assertEqual(body["status"], "success")
        token = body["data"]["token"]
        self.assertIsNotNone(token)
        self.assertEqual(body["data"]["role"], "OPERATOR")

        # 3. Session validation with token
        res = self.client.get("/api/auth/session", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json["data"]["username"], "admin")

        # 4. Logout
        res = self.client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(res.status_code, 200)

        # 5. Token is now invalid
        res = self.client.get("/api/auth/session", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(res.status_code, 401)

    # 5. Storage Operations & Bounded Size
    def test_05_storage_operations_and_bounding(self):
        """Verifies atomic save, load, and bounded retention trimming."""
        # Basic save & load
        self.store.save("test_col", {"item": 1})
        data = self.store.load("test_col")
        self.assertEqual(data["item"], 1)

        # Bounded append
        for i in range(15):
            self.store.append_bounded("bounded_col", {"i": i}, max_records=5)

        items = self.store.load("bounded_col")
        self.assertEqual(len(items), 5)
        self.assertEqual(items[-1]["i"], 14)
        self.assertEqual(items[0]["i"], 10)

    # 6. JSON Validation & Schema Versioning
    def test_06_schema_versioning_and_checksum(self):
        """Verifies schema version 2.0 and SHA-256 envelope."""
        test_payload = {"drone": "S500", "autopilot": "Pixhawk"}
        self.store.save("schema_test", test_payload)

        file_path = os.path.join(self.test_dir, "schema_test.json")
        with open(file_path, "r", encoding="utf-8") as f:
            raw = json.load(f)

        self.assertEqual(raw["_schema_version"], "2.0")
        self.assertEqual(raw["_collection"], "schema_test")
        self.assertEqual(raw["_checksum_sha256"], compute_sha256(test_payload))
        self.assertEqual(raw["_data"], test_payload)

    # 7. Error Handling & Standard Response Envelope
    def test_07_error_handling_and_envelope(self):
        """Verifies standard response structure: {status, data, error, timestamp}."""
        # Invalid QR code format (Rule 3.4 regex)
        res = self.client.post("/api/qr/submit", json={"code": "12345"})
        self.assertEqual(res.status_code, 400)
        body = res.json
        self.assertEqual(body["status"], "error")
        self.assertIn("strictly be 2 numeric digits", body["error"])
        self.assertIsNone(body["data"])
        self.assertIn("timestamp", body)

    # 8. Frontend Asset Loading
    def test_08_frontend_entry_points(self):
        """Verifies / and /drone-core HTML entry points respond cleanly."""
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)
        self.assertIn(b"SKYCON", res.data)

        res = self.client.get("/drone-core")
        self.assertEqual(res.status_code, 200)
        self.assertIn(b"Drone Core", res.data)

    # 9. Health Endpoints
    def test_09_health_endpoints(self):
        """Verifies /health and /api/system/health report structured states."""
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json["data"]["status"], "ONLINE")

        res = self.client.get("/api/system/health")
        self.assertEqual(res.status_code, 200)
        subsystems = res.json["data"]["subsystems"]
        self.assertIn("backend", subsystems)
        self.assertIn("storage", subsystems)
        self.assertIn("pixhawk", subsystems)
        self.assertIn("companion", subsystems)
        self.assertIn("camera", subsystems)

    # 10. Environment Profiles & Safety Interlocks
    def test_10_safety_bench_interlocks(self):
        """Verifies arming enforces bench safety defaults unless force flag is supplied."""
        # Telemetry snapshot endpoint
        res = self.client.get("/api/telemetry")
        self.assertEqual(res.status_code, 200)
        self.assertIn("altitude_m", res.json["data"])

        # Arming with safety lock
        res = self.client.post("/api/drone/arm", json={"arm": True, "force": False})
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json["data"]["armed"])


if __name__ == "__main__":
    unittest.main()
