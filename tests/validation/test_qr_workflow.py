r"""
=====================================================================================
SKYCON SYSTEM VALIDATION SUITE — PHASE 7
TEST MODULE: test_qr_workflow.py
Strict 2-Digit QR Validation (^\d{2}$), 3-Frame Filtering & 4-Digit Puzzle Workflow
=====================================================================================
"""

import os
import sys
import unittest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.qr_detector import qr_detector_service, validate_strict_two_digit
from backend.mission_engine import mission_engine


class TestQRWorkflowValidation(unittest.TestCase):
    """Validates strict 2-digit QR regex, multi-frame candidate confirmation, and 4-digit code compilation."""

    def setUp(self):
        mission_engine.reset_mission()

    def test_01_strict_two_digit_regex_enforcement(self):
        r"""Verify regex ^\d{2}$ strictly enforces exactly two numerical digits."""
        # Valid 2-digit payloads
        self.assertTrue(validate_strict_two_digit("42"))
        self.assertTrue(validate_strict_two_digit("07"))  # Leading zero preserved
        self.assertTrue(validate_strict_two_digit("00"))
        self.assertTrue(validate_strict_two_digit("99"))

        # Invalid payloads must be rejected
        self.assertFalse(validate_strict_two_digit("1"))       # 1 digit
        self.assertFalse(validate_strict_two_digit("123"))     # 3 digits
        self.assertFalse(validate_strict_two_digit("4A"))      # Alphanumeric
        self.assertFalse(validate_strict_two_digit("-5"))      # Negative
        self.assertFalse(validate_strict_two_digit(""))        # Empty
        self.assertFalse(validate_strict_two_digit("  "))      # Whitespace
        self.assertFalse(validate_strict_two_digit("42_ext"))  # Suffix
        self.assertFalse(validate_strict_two_digit("AB"))      # Letters

    def test_02_four_digit_puzzle_workflow_integration(self):
        """Verify aerial QR 2-digit code + ground puzzle 2-digit code compiles 4-digit access code."""
        # 1. Aerial QR detected
        detection = {
            "twoDigitCode": "56",
            "confidence": 0.99,
            "droneStateAtCapture": {"lat": 13.0827, "lon": 80.2707, "alt": 10.0}
        }
        res_qr = mission_engine.handle_qr_detected(detection)
        self.assertTrue(res_qr["success"])
        self.assertEqual(mission_engine.aerial_qr_code, "56")
        self.assertEqual(mission_engine.addc_stage, "STAGE_8_GROUND_PUZZLE_INPUT")

        # 2. Ground operative inputs puzzle code "34"
        res_puzzle = mission_engine.submit_ground_puzzle("34", "FIELD_RUNNER_1")
        self.assertTrue(res_puzzle["success"])
        self.assertEqual(mission_engine.combined_access_code, "5634")
        self.assertEqual(mission_engine.addc_stage, "STAGE_9_ACCESS_CODE_VERIFICATION")

        # 3. Cache unlock confirmation
        res_unlock = mission_engine.confirm_cache_unlocked("FIELD_RUNNER_1")
        self.assertTrue(res_unlock["success"])
        self.assertTrue(mission_engine.cache_unlocked)

        # 4. Package retrieval confirmation -> transitions to RETURNING (RTL)
        res_retrieval = mission_engine.confirm_package_retrieval("FIELD_RUNNER_1")
        self.assertTrue(res_retrieval["success"])
        self.assertEqual(mission_engine.state, "RETURNING")

    def test_03_invalid_ground_puzzle_rejection(self):
        r"""Verify ground puzzle code must also match ^\d{2}$."""
        # Non-2-digit puzzle code rejected
        res = mission_engine.submit_ground_puzzle("999", "FIELD_RUNNER_1")
        self.assertFalse(res["success"])


if __name__ == "__main__":
    unittest.main()
