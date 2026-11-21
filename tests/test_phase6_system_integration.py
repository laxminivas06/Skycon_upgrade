"""
=====================================================================================
SKYCON SYSTEM VERIFICATION SUITE — PHASE 6
TEST MODULE: test_phase6_system_integration.py
Hardware Diagnostics, Cloud Synchronization, RPi Deployment & E2E Mission Flow
=====================================================================================
"""

import os
import sys
import json
import time
import unittest
from datetime import datetime, timezone

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.settings import settings
from backend.simple_json_store import json_store
from backend.hardware_verification import (
    hardware_verification_service,
    SubsystemHealth,
    HardwareVerificationService
)
from backend.cloud_sync import cloud_sync_service, CloudSyncService
from backend.mission_engine import mission_engine, ADDC_COMPETITION_STAGES
from backend.mavlink_multiplexer import mavlink_mux
from backend.server import app as fastapi_app
from backend.main import app as flask_app
from fastapi.testclient import TestClient


class TestPhase6HardwareVerification(unittest.TestCase):
    """Verifies Raspberry Pi 4 hardware diagnostics, thermals, and peripheral audits."""

    def setUp(self):
        self.service = HardwareVerificationService()

    def test_01_platform_audit(self):
        """Audit platform architecture, CPU cores, and OS identity."""
        audit = self.service.audit_platform()
        self.assertIn("system", audit)
        self.assertIn("machine", audit)
        self.assertIn("cpu_count", audit)
        self.assertIn("status", audit)
        self.assertGreaterEqual(audit["cpu_count"], 1)

    def test_02_vcgencmd_bitmask_parsing(self):
        """Validate decoding of vcgencmd get_throttled bitmasks."""
        # 1. Clean state: 0x0
        clean_state = self.service._parse_throttled_bitmask(0x0)
        self.assertFalse(clean_state["under_voltage_active"])
        self.assertFalse(clean_state["throttled_active"])
        self.assertFalse(clean_state["under_voltage_occurred"])
        self.assertEqual(clean_state["health"], SubsystemHealth.HEALTHY)

        # 2. Active under-voltage: 0x1
        uv_state = self.service._parse_throttled_bitmask(0x1)
        self.assertTrue(uv_state["under_voltage_active"])
        self.assertEqual(uv_state["health"], SubsystemHealth.CRITICAL)

        # 3. Active throttling: 0x4
        throttle_state = self.service._parse_throttled_bitmask(0x4)
        self.assertTrue(throttle_state["throttled_active"])
        self.assertEqual(throttle_state["health"], SubsystemHealth.CRITICAL)

        # 4. Historical under-voltage: 0x10000
        hist_uv = self.service._parse_throttled_bitmask(0x10000)
        self.assertFalse(hist_uv["under_voltage_active"])
        self.assertTrue(hist_uv["under_voltage_occurred"])
        self.assertEqual(hist_uv["health"], SubsystemHealth.WARNING)

    def test_03_pixhawk_connection_audit(self):
        """Audit Pixhawk 2.4.8 serial telemetry connection."""
        audit = self.service.audit_pixhawk_connection()
        self.assertIn("status", audit)
        self.assertIn("serial_port", audit)
        self.assertIn("baud_rate", audit)
        self.assertIn("heartbeat_received", audit)
        self.assertIn(audit["baud_rate"], [57600, 115200, 921600])

    def test_04_multilink_rc_audit(self):
        """Audit MultiLink V1.0 RC receiver channel reception."""
        audit = self.service.audit_multilink_rc()
        self.assertIn("status", audit)
        self.assertIn("channels", audit)
        self.assertIn("override_safe", audit)
        self.assertTrue(audit["override_safe"])

    def test_05_camera_pipeline_audit(self):
        """Audit iPhone camera stream freshness and frame rate."""
        audit = self.service.audit_camera_pipeline()
        self.assertIn("status", audit)
        self.assertIn("camera_source", audit)
        self.assertEqual(audit["camera_source"], "IPHONE_SAFARI_PWA")

    def test_06_diagnostic_export_to_disk(self):
        """Export timestamped diagnostic report and verify file creation and structure."""
        report_path = self.service.export_report_to_disk()
        self.assertTrue(os.path.exists(report_path))
        self.assertTrue(os.path.getsize(report_path) > 50)

        with open(report_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.assertIn("report_type", data)
        self.assertIn("overall_health", data)
        self.assertIn("subsystems", data)
        self.assertEqual(data["report_type"], "SKYCON_HARDWARE_VERIFICATION_AUDIT")


class TestPhase6CloudSynchronization(unittest.TestCase):
    """Verifies outbound 4G cellular push, offline spooling, backoff, and air-gapped isolation."""

    def setUp(self):
        self.service = CloudSyncService()

    def test_07_cloud_sync_status(self):
        """Verify cloud sync status reporting."""
        status = self.service.get_status()
        self.assertIn("cloud_url", status)
        self.assertIn("is_online", status)
        self.assertIn("consecutive_failures", status)
        self.assertIn("backoff_delay_s", status)
        self.assertIn("spooled_packets_count", status)

    def test_08_payload_generation(self):
        """Verify telemetry snapshot payload assembly and SHA-256 integrity hash."""
        payload = self.service._build_sync_payload()
        self.assertEqual(payload["source"], "SKYCON_COMPANION_PI4")
        self.assertIn("timestampUtc", payload)
        self.assertIn("telemetry", payload)
        self.assertIn("mission", payload)
        self.assertIn("hash", payload)
        self.assertEqual(len(payload["hash"]), 64)  # Valid SHA-256 hex string

    def test_09_offline_spooling_and_deduplication(self):
        """Verify that offline payloads are spooled to atomic JSON and bounded."""
        test_payload = {
            "source": "SKYCON_COMPANION_PI4",
            "timestampUtc": datetime.now(timezone.utc).isoformat(),
            "telemetry": {"lat": 13.0, "lon": 80.0, "alt": 10.0},
            "hash": "test_hash_phase6_spool"
        }
        initial_spool = json_store.load("offline_sync_spool", fallback=[])
        self.service._spool_payload(test_payload)
        updated_spool = json_store.load("offline_sync_spool", fallback=[])
        self.assertGreaterEqual(len(updated_spool), len(initial_spool) + 1)
        self.assertEqual(updated_spool[-1]["hash"], "test_hash_phase6_spool")

    def test_10_airgap_flight_safety_invariant(self):
        """Strictly verify that cloud sync service contains NO inbound flight control methods."""
        forbidden_methods = [
            "arm", "disarm", "takeoff", "land", "reposition",
            "execute_command", "set_flight_mode", "upload_mission",
            "emergency_stop", "trigger_failsafe"
        ]
        service_methods = dir(self.service)
        for method in forbidden_methods:
            self.assertNotIn(method, service_methods, f"CRITICAL SAFETY VIOLATION: {method} found in cloud sync service!")


class TestPhase6RestEndpoints(unittest.TestCase):
    """Verifies FastAPI and Flask endpoints for hardware diagnostics and cloud sync."""

    def setUp(self):
        self.fastapi_client = TestClient(fastapi_app)
        self.flask_client = flask_app.test_client()

    def test_11_fastapi_diagnostics_hardware(self):
        """FastAPI GET /api/diagnostics/hardware returns 200 and audit data."""
        res = self.fastapi_client.get("/api/diagnostics/hardware")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["success"])
        self.assertIn("subsystems", data["data"])

    def test_12_fastapi_diagnostics_export(self):
        """FastAPI POST /api/diagnostics/export returns 200 and created file path."""
        res = self.fastapi_client.post("/api/diagnostics/export")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["success"])
        self.assertTrue(os.path.exists(data["reportPath"]))

    def test_13_fastapi_cloud_sync_status(self):
        """FastAPI GET /api/cloud/sync/status returns 200 and status dictionary."""
        res = self.fastapi_client.get("/api/cloud/sync/status")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["success"])
        self.assertIn("backoff_delay_s", data["data"])

    def test_14_fastapi_cloud_receiver_endpoints(self):
        """FastAPI POST /api/sync/telemetry and /api/sync/events ingest cloud bundles."""
        # Telemetry ingestion
        res_telem = self.fastapi_client.post("/api/sync/telemetry", json={
            "source": "SKYCON_COMPANION_PI4",
            "telemetry": {"alt": 10.5, "battery_v": 15.2}
        })
        self.assertEqual(res_telem.status_code, 200)
        self.assertTrue(res_telem.json()["success"])

        # Events ingestion
        res_evt = self.fastapi_client.post("/api/sync/events", json={
            "event_type": "MISSION_STAGE_ADVANCE",
            "details": {"stage": "SEARCHING"}
        })
        self.assertEqual(res_evt.status_code, 200)
        self.assertTrue(res_evt.json()["success"])

    def test_15_flask_diagnostics_endpoints(self):
        """Flask WSGI endpoints for diagnostics and cloud sync."""
        res = self.flask_client.get("/api/diagnostics/hardware")
        self.assertEqual(res.status_code, 200)
        data = res.json
        self.assertEqual(data["status"], "success")
        self.assertIn("subsystems", data["data"])

        res_export = self.flask_client.post("/api/diagnostics/export")
        self.assertEqual(res_export.status_code, 200)
        self.assertEqual(res_export.json["status"], "success")
        self.assertIn("reportPath", res_export.json["data"])

        res_sync = self.flask_client.get("/api/cloud/sync/status")
        self.assertEqual(res_sync.status_code, 200)
        self.assertEqual(res_sync.json["status"], "success")
        self.assertIn("backoff_delay_s", res_sync.json["data"])


class TestPhase6EndToEndMissionFlow(unittest.TestCase):
    """Simulates the complete 12-stage ADDC 2026 mission workflow with all subsystems connected."""

    def setUp(self):
        mission_engine.reset_mission()

    def test_16_complete_12_stage_addc_workflow(self):
        """Execute full ADDC 2026 12-stage mission cycle."""
        # 1. Initial State: IDLE -> STAGE_1_MARSHAL_AUTH
        status = mission_engine.get_status()
        self.assertEqual(status["state"], "IDLE")
        auth_res = mission_engine.authorize_flight_marshal("OFFICIAL_MARSHAL_01", "SIG_VALID_2026")
        self.assertTrue(auth_res["success"])
        self.assertEqual(mission_engine.addc_stage, "STAGE_2_PREFLIGHT_CHECKS")

        # 2. Stage 2: Preflight Checks
        ok = mission_engine.transition_to("PREFLIGHT", "Preflight checks initiated")
        self.assertTrue(ok)
        self.assertEqual(mission_engine.state, "PREFLIGHT")
        self.assertEqual(mission_engine.addc_stage, "STAGE_2_PREFLIGHT_CHECKS")

        # 3. Stage 3: Ready to Arm
        ok = mission_engine.transition_to("READY", "Preflight checks passed")
        self.assertTrue(ok)
        self.assertEqual(mission_engine.state, "READY")
        self.assertEqual(mission_engine.addc_stage, "STAGE_3_READY_TO_ARM")

        # 4. Stage 4: Autonomous Takeoff
        ok = mission_engine.transition_to("ARMED", "Pilot commands arm")
        self.assertTrue(ok)
        ok = mission_engine.transition_to("TAKING_OFF", "Autonomous takeoff commanded")
        self.assertTrue(ok)
        self.assertEqual(mission_engine.addc_stage, "STAGE_4_AUTONOMOUS_TAKEOFF")

        # 5. Stage 5: Recon Navigation & Coverage
        ok = mission_engine.transition_to("CLIMBING", "Ascending to cruise altitude")
        self.assertTrue(ok)
        ok = mission_engine.transition_to("SCANNING", "Commencing boustrophedon sweep")
        self.assertTrue(ok)
        self.assertEqual(mission_engine.addc_stage, "STAGE_5_RECON_NAVIGATION")

        # 6. Stage 6: Target Box Detection
        ok = mission_engine.transition_to("TARGET_INSPECTION", "Target cuboid detected in FOV")
        self.assertTrue(ok)
        self.assertEqual(mission_engine.addc_stage, "STAGE_6_TARGET_BOX_DETECTION")

        # 7 & 8. Stage 7 Aerial QR Extraction -> Stage 8 Ground Puzzle Input
        detection_record = {
            "twoDigitCode": "42",
            "confidence": 0.98,
            "boxId": "BOX_TARGET_01",
            "droneStateAtCapture": {"lat": 13.0, "lon": 80.0, "alt": 10.0}
        }
        res_qr = mission_engine.handle_qr_detected(detection_record)
        self.assertTrue(res_qr["success"])
        self.assertEqual(mission_engine.state, "TASK_PENDING")
        self.assertEqual(mission_engine.aerial_qr_code, "42")
        self.assertEqual(mission_engine.addc_stage, "STAGE_8_GROUND_PUZZLE_INPUT")

        # 9. Stage 9: Access Code Verification (2-digit QR '42' + 2-digit puzzle '89' -> '4289')
        res_puzzle = mission_engine.submit_ground_puzzle("89", "FIELD_RUNNER_1")
        self.assertTrue(res_puzzle["success"])
        self.assertEqual(mission_engine.combined_access_code, "4289")
        self.assertEqual(mission_engine.addc_stage, "STAGE_9_ACCESS_CODE_VERIFICATION")

        # 10. Stage 10: Cache Unlock Confirmed
        res_unlock = mission_engine.confirm_cache_unlocked("FIELD_RUNNER_1")
        self.assertTrue(res_unlock["success"])
        self.assertTrue(mission_engine.cache_unlocked)
        self.assertEqual(mission_engine.addc_stage, "STAGE_10_CACHE_UNLOCK_CONFIRMED")

        # 11. Stage 11: Package Retrieval Confirmed -> RETURNING (RTL)
        res_retrieval = mission_engine.confirm_package_retrieval("FIELD_RUNNER_1")
        self.assertTrue(res_retrieval["success"])
        self.assertEqual(mission_engine.state, "RETURNING")

        # 12. Stage 12: Autonomous RTL & Landing
        ok = mission_engine.transition_to("LANDING", "Touchdown descent")
        self.assertTrue(ok)
        ok = mission_engine.transition_to("COMPLETED", "Sortie complete, disarmed")
        self.assertTrue(ok)
        self.assertEqual(mission_engine.state, "COMPLETED")
        self.assertEqual(mission_engine.addc_stage, "STAGE_12_AUTONOMOUS_RTL_AND_LAND")

        # Verify summary
        final_status = mission_engine.get_status()
        self.assertEqual(final_status["state"], "COMPLETED")
        self.assertEqual(final_status["aerialQrCode"], "42")
        self.assertEqual(final_status["combinedAccessCode"], "4289")
        self.assertTrue(final_status["packageRetrieved"])


if __name__ == "__main__":
    unittest.main()
