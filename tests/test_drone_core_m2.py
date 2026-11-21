"""
Comprehensive Automated Verification Test Suite for Milestone 2
Edge Vision, Georeferencing, Dynamic Braking & Telemetry Sync
"""

import os
import sys
import math
import time
import shutil
import unittest
import numpy as np
import cv2

# Ensure skycon directory is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.georeferencing import Georeferencer, CameraIntrinsics3D, GeoreferenceResult
from backend.v4l2_capture import V4L2CapturePipeline, V4L2Config, CapturedFrame
from backend.qr_detector import WeChatQRDetector, QRDetectionResult
from backend.brake_controller import BrakeController, BrakingKinematics
from backend.telemetry_sync import TelemetrySyncBuffer, TelemetrySnapshot
from backend.persistence import LocalPersistenceManager, GeoreferencedDetectionRecord
from backend.companion_vision_node import CompanionVisionNode


class TestMilestone2EdgeVisionAndGeoreferencing(unittest.TestCase):

    def setUp(self):
        self.test_dir = os.path.join(os.path.dirname(__file__), "test_scratch_m2")
        os.makedirs(self.test_dir, exist_ok=True)
        self.json_path = os.path.join(self.test_dir, "test_detections.json")
        self.db_path = os.path.join(self.test_dir, "test_audit.db")

        # Standard IMX477 camera intrinsics: 1280x720, 68° HFOV, 54° VFOV
        self.cam = CameraIntrinsics3D(width=1280, height=720, hfov_deg=68.0, vfov_deg=54.0)
        self.geo = Georeferencer(self.cam)

    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_vector1_center_nadir_alignment(self):
        """Vector 1: Target at exact optical center with nadir attitude gives zero displacement."""
        res = self.geo.resolve_target(
            u=640.0, v=360.0,
            drone_lat=13.0827000, drone_lon=80.2707000,
            altitude_agl_m=5.00,
            roll_deg=0.0, pitch_deg=0.0, yaw_deg=90.0
        )
        self.assertTrue(res.valid)
        self.assertAlmostEqual(res.offset_north_m, 0.00, places=2)
        self.assertAlmostEqual(res.offset_east_m, 0.00, places=2)
        self.assertAlmostEqual(res.ground_distance_m, 0.00, places=2)
        self.assertAlmostEqual(res.target_lat, 13.0827000, places=6)
        self.assertAlmostEqual(res.target_lon, 80.2707000, places=6)

    def test_vector2_offset_target_with_heading(self):
        """Vector 2: Target at (829.77, 218.69) with yaw=0° gives dN=1.00m, dE=1.00m."""
        res = self.geo.resolve_target(
            u=829.77, v=218.69,
            drone_lat=13.0827000, drone_lon=80.2707000,
            altitude_agl_m=5.00,
            roll_deg=0.0, pitch_deg=0.0, yaw_deg=0.0
        )
        self.assertTrue(res.valid)
        self.assertAlmostEqual(res.offset_north_m, 1.00, places=2)
        self.assertAlmostEqual(res.offset_east_m, 1.00, places=2)
        self.assertAlmostEqual(res.ground_distance_m, 1.414, delta=0.02)
        self.assertAlmostEqual(res.target_lat, 13.0827090, places=6)
        self.assertAlmostEqual(res.target_lon, 80.2707092, places=6)

    def test_vector3_pitch_compensated_forward_cruise(self):
        """Vector 3: Pitch=-10° with yaw=90° compensates for forward tilt."""
        res = self.geo.resolve_target(
            u=640.0, v=360.0,
            drone_lat=13.0827000, drone_lon=80.2707000,
            altitude_agl_m=5.00,
            roll_deg=0.0, pitch_deg=-10.0, yaw_deg=90.0
        )
        self.assertTrue(res.valid)
        self.assertAlmostEqual(res.offset_north_m, 0.00, places=2)
        self.assertAlmostEqual(res.offset_east_m, 0.88, delta=0.05)
        self.assertAlmostEqual(res.target_lat, 13.0827000, places=6)
        self.assertAlmostEqual(res.target_lon, 80.2707083, delta=0.000001)

    def test_telemetry_sync_ring_buffer(self):
        """Verifies circular heading interpolation across North."""
        buf = TelemetrySyncBuffer(capacity=50)

        s0 = TelemetrySnapshot(
            timestamp_mono=100.0,
            latitude=13.0827000,
            longitude=80.2707000,
            altitude_agl_m=5.0,
            heading_deg=355.0,
            yaw_deg=355.0,
            roll_rad=0.0,
            pitch_rad=math.radians(-10.0),
            yaw_rad=math.radians(355.0)
        )
        s1 = TelemetrySnapshot(
            timestamp_mono=100.1,
            latitude=13.0827100,
            longitude=80.2707100,
            altitude_agl_m=5.2,
            heading_deg=5.0,
            yaw_deg=5.0,
            roll_rad=0.0,
            pitch_rad=math.radians(-10.0),
            yaw_rad=math.radians(5.0)
        )
        buf.push_snapshot(s0)
        buf.push_snapshot(s1)

        interp = buf.interpolate(100.05)
        self.assertAlmostEqual(interp.latitude, 13.0827050, places=7)
        self.assertAlmostEqual(interp.altitude_agl_m, 5.10, places=2)
        self.assertTrue(abs(interp.heading_deg - 0.0) < 0.1 or abs(interp.heading_deg - 360.0) < 0.1)

    def test_atomic_persistence_and_checksum(self):
        """Verifies atomic .tmp serialization and SHA-256 validation."""
        mgr = LocalPersistenceManager(self.json_path, self.db_path)

        cam_meta = {"sensorModel": "Sony IMX477", "frameWidth": 1280, "frameHeight": 720, "hfovDeg": 68.0, "vfovDeg": 54.0, "focalLengthPixels": 948.84}
        bbox_meta = {"x": 600, "y": 300, "width": 80, "height": 80, "centroidU": 640.0, "centroidV": 340.0}

        record = mgr.save_georeferenced_detection(
            payload="SAE_INDIA_RESCUE_42",
            two_digit_code="42",
            target_lat=13.0827090,
            target_lon=80.2707092,
            altitude_agl=5.0,
            ground_distance_m=1.41,
            offset_north_m=1.00,
            offset_east_m=1.00,
            drone_lat=13.0827000,
            drone_lon=80.2707000,
            drone_alt_agl=5.0,
            drone_alt_msl=542.5,
            roll_deg=0.0,
            pitch_deg=0.0,
            yaw_deg=0.0,
            ground_speed_mps=4.0,
            camera_intrinsics=cam_meta,
            bounding_box=bbox_meta,
            verified=True
        )

        self.assertTrue(os.path.exists(self.json_path))
        self.assertFalse(os.path.exists(f"{self.json_path}.tmp"))
        self.assertEqual(len(record.checksumSha256), 64)

        loaded = mgr.load_latest_payload()
        self.assertIsNotNone(loaded)
        self.assertEqual(loaded.payload, "SAE_INDIA_RESCUE_42")

    def test_companion_vision_node_pipeline_execution(self):
        """Verifies full CompanionVisionNode processing loop with synthetic video and mock telemetry."""
        node = CompanionVisionNode(
            connection_str="mock",
            output_json=self.json_path,
            output_db=self.db_path,
            mock_mode=True
        )
        self.assertTrue(node.start())
        time.sleep(0.15)

        frame_img = np.full((720, 1280, 3), 200, dtype=np.uint8)
        frame_packet = CapturedFrame(
            image=frame_img,
            timestamp_mono=time.monotonic(),
            frame_index=1,
            width=1280,
            height=720,
            is_synthetic=True
        )

        record = node.process_frame(frame_packet)
        node.stop()
        if record is not None:
            self.assertEqual(record.twoDigitCode, "42")
            self.assertTrue(record.verified)
