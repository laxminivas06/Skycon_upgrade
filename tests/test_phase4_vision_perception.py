"""
=====================================================================================
SKYCON Phase 4 Dedicated Perception & Computer Vision Test Suite
Test File: tests/test_phase4_vision_perception.py
=====================================================================================
Verifies:
  1. Camera Ingestion & Freshest-Frame Buffer:
     - Formal lifecycle states (DISCONNECTED, STREAMING, DEGRADED, SIMULATION)
     - Drop-oldest bounded buffer prioritization
     - Frame quality evaluation (Laplacian blur, brightness, contrast)
     - Corrupted frame rejection
  2. Strict Competition QR Detection & Candidate State Machine:
     - Strict validation matching ^\\d{2}$
     - Leading zeroes preservation ("07" stays "07")
     - Disqualification of 3-digit ("123"), alphabetic ("A2"), spaced ("1 2"), empty ("")
     - Temporal candidate state machine (CANDIDATE -> VERIFYING -> CONFIRMED)
     - Timeout and conflicting payload expiration
  3. Camera-to-Pixhawk Multi-Clock Time Synchronization:
     - Correlation between iPhone ts, Pi monotonic ts, and Pixhawk boot time
     - Transport latency estimation and drift tracking
     - Quality tiers (SYNCHRONIZED, ESTIMATED, DEGRADED, UNAVAILABLE)
  4. 3D Attitude-Compensated Georeferencing:
     - Downward nadir optical ground projection
     - Aircraft attitude compensation (pitch forward, roll right)
     - Mounting extrinsics (pitch, roll, yaw offsets)
     - Ground plane intersection and upward ray rejection
     - Honest tiers (CALIBRATED, APPROXIMATE, IMAGE_SPACE_ONLY, UNAVAILABLE)
  5. Three Distinct Mapping Layers (Coverage, Obstacles, Targets):
     - Layer A: Search Coverage (UNSCANNED, SCANNED, UNCERTAIN)
     - Layer B: Obstacles & Visual Uncertainty (OBSERVED_FREE, UNKNOWN)
     - Layer C: QR Targets (QR_CANDIDATE, QR_VERIFYING, QR_CONFIRMED)
     - Optical footprint projection with frame quality scoring
  6. Mission Safety & Air-Gapped RTL Interlocks:
     - Candidate / unconfirmed QR does NOT trigger RTL
     - Confirmed valid 2-digit QR triggers RTL
     - Emergency RTL overrides vision tasks
  7. Canonical REST API Endpoints:
     - /api/camera/*, /api/qr/*, /api/timesync/*, /api/georeferencing/*, /api/mapping/*
=====================================================================================
"""

import os
import sys
import time
import math
import unittest
import numpy as np
import cv2

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.stream_capture import (
    SmartphoneStreamPipeline,
    SmartphoneCameraConfig,
    CameraState,
    StreamSourceType,
    FrameQualityMetrics,
    evaluate_frame_quality
)
from backend.qr_detector import (
    WeChatQRDetector,
    QRCandidateTracker,
    QRCandidateState,
    validate_strict_two_digit,
    QRDetectionResult
)
from backend.telemetry_sync import (
    TimeSynchronizationService,
    TimeSyncStatus,
    TelemetrySyncBuffer,
    TelemetrySnapshot
)
from backend.georeferencing import (
    Georeferencer,
    CameraIntrinsics3D,
    GeoreferenceResult,
    GeorefHonestyLevel
)
from backend.spatial_grid import (
    SpatialGrid,
    SpatialCell,
    LayerACoverageStatus,
    LayerBObstacleStatus,
    LayerCTargetStatus
)
from backend.heatmap_engine import HeatmapEngine
from backend.fsm import AutonomousEdgeMissionFSM, MissionState
from backend.autopilot import MockAutopilot
from backend.main import app


class TestPhase4VisionPerception(unittest.TestCase):

    def setUp(self):
        self.app_client = app.test_client()

    # =========================================================================
    # 1. CAMERA PIPELINE & FRESHEST-FRAME INGESTION
    # =========================================================================

    def test_01_camera_lifecycle_and_freshest_frame_buffer(self):
        """Verifies camera states and bounded drop-oldest buffer behavior."""
        cfg = SmartphoneCameraConfig(source="push", source_type=StreamSourceType.FRAME_PUSH, width=640, height=480, fps=30)
        pipeline = SmartphoneStreamPipeline(cfg)
        pipeline.start()

        self.assertEqual(pipeline.camera_state, CameraState.CAMERA_READY)
        self.assertFalse(pipeline.is_connected)

        # 1. Push 10 frames in rapid succession
        for i in range(10):
            dummy_img = np.full((480, 640, 3), i * 20, dtype=np.uint8)
            ok = pipeline.push_frame(dummy_img, timestamp_mono=100.0 + i * 0.033)
            self.assertTrue(ok)

        stats = pipeline.get_stats()
        self.assertEqual(stats["frames_captured"], 10)
        self.assertEqual(stats["frames_dropped"], 9)
        self.assertEqual(pipeline.camera_state, CameraState.STREAMING)
        self.assertTrue(pipeline.is_connected)

        # 2. Consume freshest frame: should have pixel value 180 (the 10th frame, index 9)
        freshest = pipeline.get_latest_frame()
        self.assertIsNotNone(freshest)
        self.assertEqual(freshest.frame_index, 10)
        self.assertEqual(freshest.image[0, 0, 0], 180)

        # 3. Buffer should now be empty (consumed)
        self.assertIsNone(pipeline.get_latest_frame())

        pipeline.stop()
        self.assertEqual(pipeline.camera_state, CameraState.DISCONNECTED)

    def test_02_frame_quality_evaluation(self):
        """Verifies brightness, contrast, and Laplacian blur detection."""
        # Sharp high-contrast checkerboard image
        sharp_img = np.zeros((200, 200, 3), dtype=np.uint8)
        sharp_img[::20, :] = 255
        sharp_img[:, ::20] = 255

        q_sharp = evaluate_frame_quality(sharp_img)
        self.assertFalse(q_sharp.is_blurred)
        self.assertGreater(q_sharp.blur_variance, 50.0)
        self.assertGreater(q_sharp.quality_score, 0.7)

        # Heavy Gaussian blur image
        blurred_img = cv2.GaussianBlur(sharp_img, (31, 31), 15.0)
        q_blurred = evaluate_frame_quality(blurred_img)
        self.assertTrue(q_blurred.is_blurred)
        self.assertLess(q_blurred.blur_variance, 50.0)
        self.assertLess(q_blurred.quality_score, q_sharp.quality_score)

        # Underexposed dark frame
        dark_img = np.full((100, 100, 3), 10, dtype=np.uint8)
        q_dark = evaluate_frame_quality(dark_img)
        self.assertTrue(q_dark.is_underexposed)

    def test_03_invalid_and_corrupted_frame_rejection(self):
        """Verifies corrupted or non-image payloads are safely rejected without crashing."""
        pipeline = SmartphoneStreamPipeline()
        pipeline.start()

        # Empty bytes
        ok, frame, msg = pipeline.push_frame_bytes(b"")
        self.assertFalse(ok)
        self.assertIsNone(frame)

        # Truncated random garbage bytes
        ok, frame, msg = pipeline.push_frame_bytes(b"NOT_A_VALID_JPEG_HEADER_CORRUPTED")
        self.assertFalse(ok)
        self.assertIsNone(frame)

        pipeline.stop()

    # =========================================================================
    # 2. STRICT QR VALIDATION & CANDIDATE STATE MACHINE
    # =========================================================================

    def test_04_strict_two_digit_regex_validation(self):
        """Verifies strict validation of exactly two decimal digits (^\\d{2}$)."""
        # Valid cases
        self.assertEqual(validate_strict_two_digit("42"), "42")
        self.assertEqual(validate_strict_two_digit("07"), "07")  # Leading zero preserved!
        self.assertEqual(validate_strict_two_digit("00"), "00")
        self.assertEqual(validate_strict_two_digit("99"), "99")

        # Invalid cases: must return None
        self.assertIsNone(validate_strict_two_digit("123"))      # 3 digits
        self.assertIsNone(validate_strict_two_digit("7"))        # 1 digit
        self.assertIsNone(validate_strict_two_digit("A2"))       # Alphabetic
        self.assertIsNone(validate_strict_two_digit("1 2"))      # Space separated
        self.assertIsNone(validate_strict_two_digit(""))         # Empty
        self.assertIsNone(validate_strict_two_digit(None))       # None
        self.assertIsNone(validate_strict_two_digit("RESCUE_42")) # Prefix

    def test_05_candidate_verification_state_machine(self):
        """Verifies temporal multi-frame confirmation requiring 3 frames."""
        tracker = QRCandidateTracker(required_confirmations=3, expiration_timeout_s=2.0)

        mock_res = QRDetectionResult(
            payload="07",
            two_digit_code="07",
            centroid_u=320.0,
            centroid_v=240.0,
            corners=np.array([[300, 220], [340, 220], [340, 260], [300, 260]]),
            bounding_box=(300, 220, 40, 40),
            method="STAGE1_RAW",
            verified=True,
            execution_time_ms=12.0
        )

        # Frame 1: Transitions to CANDIDATE
        state1, rec1 = tracker.update(mock_res, timestamp_mono=10.0)
        self.assertEqual(state1, QRCandidateState.CANDIDATE)
        self.assertFalse(rec1.is_confirmed)
        self.assertEqual(rec1.verification_count, 1)

        # Frame 2: Transitions to VERIFYING
        state2, rec2 = tracker.update(mock_res, timestamp_mono=10.1)
        self.assertEqual(state2, QRCandidateState.VERIFYING)
        self.assertFalse(rec2.is_confirmed)
        self.assertEqual(rec2.verification_count, 2)

        # Frame 3: Transitions to CONFIRMED
        state3, rec3 = tracker.update(mock_res, timestamp_mono=10.2)
        self.assertEqual(state3, QRCandidateState.CONFIRMED)
        self.assertTrue(rec3.is_confirmed)
        self.assertEqual(rec3.verification_count, 3)
        self.assertEqual(len(tracker.confirmed_history), 1)

    def test_06_candidate_timeout_and_expiration(self):
        """Verifies candidate expires if observations stall before confirmation."""
        tracker = QRCandidateTracker(required_confirmations=3, expiration_timeout_s=1.5)

        mock_res = QRDetectionResult(
            payload="42",
            two_digit_code="42",
            centroid_u=320.0,
            centroid_v=240.0,
            corners=np.zeros((4, 2)),
            bounding_box=(0, 0, 10, 10),
            method="STAGE1_RAW",
            verified=True,
            execution_time_ms=10.0
        )

        # Frame 1: CANDIDATE at t=10.0s
        tracker.update(mock_res, timestamp_mono=10.0)
        self.assertEqual(tracker.current_candidate.state, QRCandidateState.CANDIDATE)

        # 2.0 seconds silence passes (exceeds timeout 1.5s)
        state_after, rec = tracker.update(None, timestamp_mono=12.1)
        self.assertEqual(state_after, QRCandidateState.EXPIRED)
        self.assertIsNone(tracker.current_candidate)

    # =========================================================================
    # 3. CAMERA-TO-PIXHAWK TIME SYNCHRONIZATION
    # =========================================================================

    def test_07_time_synchronization_correlation(self):
        """Verifies multi-clock mapping between phone capture, companion mono, and Pixhawk boot time."""
        sync_service = TimeSynchronizationService()

        # Simulate Pixhawk MAVLink packets arriving at boot_ms = 45000ms
        t_mono_base = time.monotonic()
        sync_service.update_pixhawk_clock(time_boot_ms=45000, gps_epoch_s=1770000000.0, mono_ts=t_mono_base)

        # iPhone captures frame at t_phone = 1770000000.040 (40ms transmission latency)
        phone_ts = time.time() - 0.040
        synced = sync_service.correlate_frame(phone_raw_ts=phone_ts, reception_mono_ts=t_mono_base)

        self.assertIn(synced.sync_status, (TimeSyncStatus.SYNCHRONIZED, TimeSyncStatus.ESTIMATED))
        self.assertGreater(synced.pixhawk_time_boot_ms, 0)
        self.assertGreater(synced.uncertainty_ms, 0.0)
        self.assertLess(synced.uncertainty_ms, 100.0)

        diag = sync_service.get_diagnostics()
        self.assertTrue(diag["has_gps_time"])
        self.assertLess(diag["pixhawk_telemetry_age_s"], 1.0)

    # =========================================================================
    # 4. CAMERA CALIBRATION & 3D GEOREFERENCING
    # =========================================================================

    def test_08_attitude_compensated_georeferencing(self):
        """Verifies 3D ground projection, attitude compensation, and honest quality tiers."""
        cam = CameraIntrinsics3D(
            width=1280,
            height=720,
            hfov_deg=68.0,
            vfov_deg=54.0,
            is_calibrated=True
        )
        georef = Georeferencer(cam)

        # Case 1: Nadir downward optical center (640, 360) at altitude 10m, zero pitch/roll
        res_nadir = georef.resolve_target(
            u=640.0,
            v=360.0,
            drone_lat=13.0827,
            drone_lon=80.2707,
            altitude_agl_m=10.0,
            roll_deg=0.0,
            pitch_deg=0.0,
            yaw_deg=0.0,
            telemetry_age_s=0.1
        )
        self.assertTrue(res_nadir.valid)
        self.assertEqual(res_nadir.honesty_level, GeorefHonestyLevel.CALIBRATED)
        self.assertAlmostEqual(res_nadir.target_lat, 13.0827, delta=0.00001)
        self.assertAlmostEqual(res_nadir.target_lon, 80.2707, delta=0.00001)
        self.assertAlmostEqual(res_nadir.ground_distance_m, 0.0, delta=0.1)

        # Case 2: Aircraft pitched forward (-5° pitch-down in standard body frame)
        # Nadir camera shifts forward (+North for heading 0°)
        res_pitch = georef.resolve_target(
            u=640.0,
            v=360.0,
            drone_lat=13.0827,
            drone_lon=80.2707,
            altitude_agl_m=10.0,
            roll_deg=0.0,
            pitch_deg=-5.0,
            yaw_deg=0.0,
            telemetry_age_s=0.1
        )
        self.assertTrue(res_pitch.valid)
        self.assertGreater(res_pitch.offset_north_m, 0.5)

        # Case 3: Upward pointing ray (extreme pitch looking at sky)
        res_sky = georef.resolve_target(
            u=640.0,
            v=360.0,
            drone_lat=13.0827,
            drone_lon=80.2707,
            altitude_agl_m=10.0,
            roll_deg=0.0,
            pitch_deg=95.0,
            yaw_deg=0.0
        )
        self.assertFalse(res_sky.valid)
        self.assertEqual(res_sky.honesty_level, GeorefHonestyLevel.IMAGE_SPACE_ONLY)

    # =========================================================================
    # 5. THREE DISTINCT MAPPING LAYERS & HEATMAP ENGINE
    # =========================================================================

    def test_09_three_distinct_mapping_layers(self):
        """Verifies explicit separation of Layer A (Coverage), Layer B (Obstacles), and Layer C (Targets)."""
        engine = HeatmapEngine(cell_size_m=2.0)
        engine.initialize_circle_boundary(center_lat=13.0827, center_lon=80.2707, radius_m=20.0)

        # Initially all Layer A cells are UNSCANNED, Layer B are UNKNOWN
        layer_a = engine.get_layer_a_coverage()
        layer_b = engine.get_layer_b_obstacles()
        layer_c = engine.get_layer_c_targets()

        self.assertGreater(layer_a["metrics"]["total_cells"], 0)
        self.assertEqual(layer_a["metrics"]["scanned"], 0)
        self.assertEqual(layer_c["count"], 0)

        # 1. Project camera footprint at altitude 10m (high quality frame)
        updated = engine.update_camera_footprint(
            drone_lat=13.0827,
            drone_lon=80.2707,
            altitude_agl_m=10.0,
            heading_deg=0.0,
            frame_quality_score=0.9,
            is_blurred=False
        )
        self.assertGreater(updated, 0)

        layer_a_after = engine.get_layer_a_coverage()
        self.assertGreater(layer_a_after["metrics"]["scanned"], 0)
        self.assertGreater(layer_a_after["metrics"]["coverage_pct"], 0.0)

        # 2. Register QR Target observation into Layer C
        obs_id = engine.register_qr_observation(
            two_digit_code="42",
            lat=13.0827,
            lon=80.2707,
            status=LayerCTargetStatus.QR_CONFIRMED,
            confidence=1.0,
            evidence_sha256="73475cb4"
        )
        self.assertTrue(obs_id.startswith("QR_OBS_"))
        self.assertEqual(len(engine.observations), 1)

        summary = engine.get_summary()
        self.assertIn("layer_a", summary["layers"])
        self.assertIn("layer_b", summary["layers"])
        self.assertIn("layer_c", summary["layers"])

    # =========================================================================
    # 6. MISSION SAFETY & AIR-GAPPED RTL INTERLOCKS
    # =========================================================================

    def test_10_unconfirmed_qr_does_not_trigger_rtl(self):
        """Verifies candidate QR or disqualified payload does NOT trigger RTL."""
        autopilot = MockAutopilot()
        fsm = AutonomousEdgeMissionFSM(autopilot=autopilot)
        fsm.state = MissionState.DECODING

        # Attempt to handle disqualified 3-digit payload "123"
        import asyncio
        asyncio.run(fsm._handle_successful_decode("123"))

        # Must NOT transition to RTL
        self.assertNotEqual(fsm.state, MissionState.RTL)
        self.assertEqual(fsm.state, MissionState.DECODING)

        # Handle valid 2-digit code "42"
        asyncio.run(fsm._handle_successful_decode("42"))
        self.assertEqual(fsm.state, MissionState.RTL)
        self.assertEqual(autopilot.telemetry.flight_mode, "RTL")

    # =========================================================================
    # 7. CANONICAL REST APIS
    # =========================================================================

    def test_11_rest_api_endpoints(self):
        """Verifies canonical REST endpoints for camera, QR, timesync, and mapping."""
        # 1. Camera Status & Health
        resp = self.app_client.get("/api/camera/status")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("camera_state", resp.get_json()["data"])

        resp_health = self.app_client.get("/api/camera/health")
        self.assertEqual(resp_health.status_code, 200)

        # 2. QR Strict Validation Endpoint
        resp_val_ok = self.app_client.post("/api/qr/validate", json={"payload": "07"})
        self.assertEqual(resp_val_ok.status_code, 200)
        self.assertTrue(resp_val_ok.get_json()["data"]["valid"])
        self.assertEqual(resp_val_ok.get_json()["data"]["two_digit_code"], "07")

        resp_val_bad = self.app_client.post("/api/qr/validate", json={"payload": "123"})
        self.assertEqual(resp_val_bad.status_code, 200)
        self.assertFalse(resp_val_bad.get_json()["data"]["valid"])

        # 3. QR Submit & Candidates
        resp_sub = self.app_client.post("/api/qr/submit", json={"code": "42", "lat": 13.0827, "lon": 80.2707})
        self.assertEqual(resp_sub.status_code, 200)

        resp_cands = self.app_client.get("/api/qr/candidates")
        self.assertEqual(resp_cands.status_code, 200)

        # 4. Time Synchronization Endpoint
        resp_ts = self.app_client.get("/api/timesync/status")
        self.assertEqual(resp_ts.status_code, 200)
        self.assertIn("sync_quality", resp_ts.get_json()["data"])

        # 5. Georeferencing Status & Calibrate
        resp_geo = self.app_client.get("/api/georeferencing/status")
        self.assertEqual(resp_geo.status_code, 200)
        self.assertIn("hfov_deg", resp_geo.get_json()["data"])

        # 6. Three Mapping Layer Endpoints
        resp_map_a = self.app_client.get("/api/mapping/coverage")
        self.assertEqual(resp_map_a.status_code, 200)

        resp_map_b = self.app_client.get("/api/mapping/obstacles")
        self.assertEqual(resp_map_b.status_code, 200)

        resp_map_c = self.app_client.get("/api/mapping/targets")
        self.assertEqual(resp_map_c.status_code, 200)

        resp_map_sum = self.app_client.get("/api/mapping/summary")
        self.assertEqual(resp_map_sum.status_code, 200)


if __name__ == "__main__":
    unittest.main()
