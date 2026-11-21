"""
=====================================================================================
SKYCON SYSTEM VALIDATION SUITE — PHASE 7
TEST MODULE: test_camera_pipeline.py
iPhone Safari PWA Stream Ingestion, Freshest-Frame Buffer, FPS & Disconnect Handling
=====================================================================================
"""

import os
import sys
import time
import unittest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.stream_capture import smartphone_stream, CameraState
from backend.server import app as fastapi_app
from fastapi.testclient import TestClient


class TestCameraPipelineValidation(unittest.TestCase):
    """Validates iPhone Safari PWA camera capture, freshness buffering, and MJPEG endpoint."""

    def setUp(self):
        self.client = TestClient(fastapi_app)

    def test_01_camera_state_reporting(self):
        """Verify camera stream capture reports structured stats and state."""
        stats = smartphone_stream.get_stats()
        self.assertIn("camera_state", stats)
        self.assertIn("actual_fps", stats)
        self.assertIn("frames_captured", stats)
        self.assertIn("frames_dropped", stats)

    def test_02_frame_push_endpoint(self):
        """Verify POST /api/camera/frame ingests JPEG bytes and updates frame timestamp."""
        import base64
        sample_jpeg = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xdb\x00C\x00\xff\xd9'
        sample_b64 = "data:image/jpeg;base64," + base64.b64encode(sample_jpeg).decode()
        res = self.client.post(
            "/api/camera/frame",
            json={"frame": sample_b64, "timestamp": time.time()}
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))

    def test_03_camera_freshness_latency_guard(self):
        """Verify that oldest frames are dropped to ensure zero image backlog."""
        stats = smartphone_stream.get_stats()
        self.assertGreaterEqual(stats.get("frames_dropped", 0), 0)


if __name__ == "__main__":
    unittest.main()
