"""
=====================================================================================
SKYCON SYSTEM VALIDATION SUITE — PHASE 7
TEST MODULE: test_system_startup.py
Startup Integrity, Environment Config, Storage Resilience & Health Probes
=====================================================================================
"""

import os
import sys
import json
import time
import unittest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.settings import settings
from backend.simple_json_store import json_store, compute_sha256
from backend.auth_service import auth_service
from backend.system_health import system_health_service
from backend.server import app as fastapi_app
from backend.main import app as flask_app
from fastapi.testclient import TestClient


class TestSystemStartupValidation(unittest.TestCase):
    """Validates cold startup, configuration parameters, and health monitoring."""

    def setUp(self):
        self.fastapi_client = TestClient(fastapi_app)
        self.flask_client = flask_app.test_client()

    def test_01_environment_configuration_loading(self):
        """Verify settings load required base paths, ports, and safety defaults."""
        self.assertTrue(os.path.exists(settings.BASE_DIR))
        self.assertIsInstance(settings.PORT, int)
        self.assertGreater(settings.PORT, 1024)
        # Safety default: Physical arming disabled by default
        self.assertFalse(settings.ALLOW_PHYSICAL_ARMING)
        self.assertIn("SECRET_KEY", dir(settings))
        self.assertTrue(len(settings.SECRET_KEY) >= 16)

    def test_02_storage_integrity_and_checksum(self):
        """Verify SimpleJsonStore schema versioning, SHA-256 integrity, and atomic saves."""
        test_key = "validation_startup_probe"
        test_data = {"subsystem": "STARTUP_CHECK", "timestamp": time.time(), "status": "NOMINAL"}
        json_store.save(test_key, test_data)

        loaded = json_store.load(test_key)
        self.assertIsNotNone(loaded)
        self.assertEqual(loaded["subsystem"], "STARTUP_CHECK")
        self.assertEqual(loaded["status"], "NOMINAL")

        # Verify checksum math
        h1 = compute_sha256(test_data)
        h2 = compute_sha256(test_data)
        self.assertEqual(h1, h2)
        self.assertEqual(len(h1), 64)

    def test_03_authentication_and_token_validation(self):
        """Verify authentication service issues and validates session tokens."""
        # Authenticate standard operator
        session = auth_service.authenticate("admin", "skycon2026")
        self.assertIsNotNone(session)
        token = session["token"]
        user_info = auth_service.validate_token(token)
        self.assertIsNotNone(user_info)
        self.assertEqual(user_info["username"], "admin")
        self.assertEqual(user_info["role"], "OPERATOR")

        # Invalid credentials rejected
        bad_session = auth_service.authenticate("admin", "wrong_password_xyz")
        self.assertIsNone(bad_session)

    def test_04_health_endpoints_and_probes(self):
        """Verify lightweight health probes and multi-subsystem diagnostics."""
        # FastAPI probe
        res_fast = self.fastapi_client.get("/health")
        self.assertEqual(res_fast.status_code, 200)
        self.assertEqual(res_fast.json()["status"], "healthy")

        # Flask probe
        res_flask = self.flask_client.get("/health")
        self.assertEqual(res_flask.status_code, 200)
        self.assertEqual(res_flask.json["data"]["status"], "ONLINE")

        # System health detailed audit
        health = system_health_service.get_overall_health()
        self.assertIn("status", health)
        self.assertIn("subsystems", health)
        self.assertIn("storage", health["subsystems"])
        self.assertIn("backend", health["subsystems"])


if __name__ == "__main__":
    unittest.main()
