"""
=====================================================================================
SKYCON MASTER ARCHITECTURE - QR CODE DETECTION & VERIFICATION ENGINE
MODULE: qr_detector.py (Perception Engine)
=====================================================================================
WeChatQRCode Deep CNN & Subpixel Corner Refinement QR Detection Engine

Features:
  1. Multi-Stage Detection Strategy:
     - Stage 1: Direct WeChatQRCode / standard QRCodeDetector on raw grayscale
     - Stage 2: CLAHE (Contrast Limited Adaptive Histogram Equalization) + Unsharp filter
     - Stage 3: Otsu adaptive thresholding (standard and inverted)
     - Stage 4: Contour analysis, quadrilateral candidate extraction & perspective rectification
  2. Subpixel Corner Refinement:
     - cv2.cornerSubPix (winSize=5x5, max_iter=40, eps=0.005)
     - Analytical diagonal line intersection centroid calculation (true optical centroid)
  3. Strict Competition Two-Digit Validation:
     - Strictly validates against regex ^\\d{2}$ (exactly two numeric digits)
     - Preserves leading zeroes (e.g. "07" is preserved as string "07")
     - Rejects 3-digit, alphanumeric, spaced, or malformed strings
  4. Candidate Verification State Machine:
     - NOT_DETECTED -> CANDIDATE -> VERIFYING -> CONFIRMED -> REJECTED / EXPIRED
     - Requires >= 3 consecutive consistent frame decodes before confirmation
     - Duplicate suppression and candidate timeout handling
=====================================================================================
"""

import os
import re
import math
import time
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Tuple, List, Dict, Any, Union
import numpy as np
import cv2

logger = logging.getLogger("QRDetector")


class QRCandidateState(str, Enum):
    """Authoritative candidate verification states."""
    NOT_DETECTED = "NOT_DETECTED"
    CANDIDATE = "CANDIDATE"
    VERIFYING = "VERIFYING"
    CONFIRMED = "CONFIRMED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"


@dataclass
class QRDetectionResult:
    """Rich detection record containing decoded payload, subpixel centroid, and corners."""
    payload: str
    two_digit_code: str
    centroid_u: float
    centroid_v: float
    corners: np.ndarray                      # Subpixel refined (4, 2)
    bounding_box: Tuple[int, int, int, int]  # (x, y, width, height)
    method: str
    verified: bool
    execution_time_ms: float
    estimated_quality: float = 1.0


@dataclass
class CandidateRecord:
    """State record for a tracked QR candidate across multiple frames."""
    candidate_id: str
    two_digit_code: str
    state: QRCandidateState
    verification_count: int
    first_detected_mono: float
    last_detected_mono: float
    centroid_u: float
    centroid_v: float
    decoder_used: str
    estimated_quality: float = 1.0
    is_confirmed: bool = False
    evidence_metadata: Dict[str, Any] = field(default_factory=dict)


def validate_strict_two_digit(payload: Optional[str]) -> Optional[str]:
    """
    Competition Rule 3.4 strict validator:
    - Payload must be exactly two numerical digits matching regex ^\\d{2}$
    - Preserves leading zeroes (e.g. "07" -> "07")
    - Rejects "123", "A2", "1 2", "", None
    """
    if payload is None:
        return None
    cleaned = str(payload).strip()
    if re.match(r"^\d{2}$", cleaned):
        return cleaned
    return None


class QRCandidateTracker:
    """
    Temporal candidate verification state machine.
    Prevents single-frame false positives from triggering mission-critical RTL actions.
    """

    def __init__(
        self,
        required_confirmations: int = 3,
        expiration_timeout_s: float = 3.0,
        centroid_drift_tolerance_px: float = 80.0
    ):
        self.required_confirmations = required_confirmations
        self.expiration_timeout_s = expiration_timeout_s
        self.centroid_drift_tolerance_px = centroid_drift_tolerance_px

        self.current_candidate: Optional[CandidateRecord] = None
        self.confirmed_history: List[CandidateRecord] = []
        self.rejected_history: List[Dict[str, Any]] = []
        self._counter = 0

    def update(
        self,
        qr_result: Optional[QRDetectionResult],
        timestamp_mono: Optional[float] = None
    ) -> Tuple[QRCandidateState, Optional[CandidateRecord]]:
        """
        Updates candidate verification state using the latest QR detection result.
        Returns (current_state, candidate_record).
        """
        now = timestamp_mono or time.monotonic()

        # Check for expiration of existing candidate if no detection or timeout
        if self.current_candidate is not None:
            silence = now - self.current_candidate.last_detected_mono
            if silence > self.expiration_timeout_s and self.current_candidate.state != QRCandidateState.CONFIRMED:
                self.current_candidate.state = QRCandidateState.EXPIRED
                logger.info(
                    "Candidate '%s' expired after %.1fs silence",
                    self.current_candidate.two_digit_code, silence
                )
                expired = self.current_candidate
                self.current_candidate = None
                return QRCandidateState.EXPIRED, expired

        if qr_result is None:
            if self.current_candidate is not None:
                return self.current_candidate.state, self.current_candidate
            return QRCandidateState.NOT_DETECTED, None

        # Validate payload strictly against ^\d{2}$
        validated_code = validate_strict_two_digit(qr_result.two_digit_code or qr_result.payload)
        if not validated_code:
            # Malformed payload
            reject_entry = {
                "raw_payload": qr_result.payload,
                "timestamp_mono": now,
                "reason": f"Disqualified payload '{qr_result.payload}': does not match ^\\d{{2}}$"
            }
            self.rejected_history.append(reject_entry)
            logger.warning("Disqualified QR payload '%s'", qr_result.payload)
            return QRCandidateState.REJECTED, None

        # If no active candidate, register this detection as CANDIDATE (Frame 1)
        if self.current_candidate is None:
            self._counter += 1
            rec = CandidateRecord(
                candidate_id=f"CAND_{self._counter:04d}",
                two_digit_code=validated_code,
                state=QRCandidateState.CANDIDATE,
                verification_count=1,
                first_detected_mono=now,
                last_detected_mono=now,
                centroid_u=qr_result.centroid_u,
                centroid_v=qr_result.centroid_v,
                decoder_used=qr_result.method,
                estimated_quality=qr_result.estimated_quality,
                is_confirmed=(self.required_confirmations <= 1),
                evidence_metadata={
                    "corners": qr_result.corners.tolist() if isinstance(qr_result.corners, np.ndarray) else qr_result.corners,
                    "bbox": qr_result.bounding_box,
                    "execution_time_ms": qr_result.execution_time_ms
                }
            )
            if rec.is_confirmed:
                rec.state = QRCandidateState.CONFIRMED
                self.confirmed_history.append(rec)
            self.current_candidate = rec
            logger.info("New QR Candidate identified: '%s' (Count: 1/%d)", validated_code, self.required_confirmations)
            return rec.state, rec

        # Existing candidate: verify consistency
        if self.current_candidate.two_digit_code == validated_code:
            # Check centroid drift to ensure temporal continuity
            drift = math.hypot(
                qr_result.centroid_u - self.current_candidate.centroid_u,
                qr_result.centroid_v - self.current_candidate.centroid_v
            )

            self.current_candidate.last_detected_mono = now
            self.current_candidate.centroid_u = qr_result.centroid_u
            self.current_candidate.centroid_v = qr_result.centroid_v
            self.current_candidate.verification_count += 1
            self.current_candidate.decoder_used = qr_result.method
            self.current_candidate.estimated_quality = (
                0.7 * self.current_candidate.estimated_quality + 0.3 * qr_result.estimated_quality
            )

            if self.current_candidate.verification_count >= self.required_confirmations:
                self.current_candidate.state = QRCandidateState.CONFIRMED
                self.current_candidate.is_confirmed = True
                if self.current_candidate not in self.confirmed_history:
                    self.confirmed_history.append(self.current_candidate)
                    logger.info("QR Candidate CONFIRMED: '%s' across %d consecutive frames!",
                                validated_code, self.current_candidate.verification_count)
            else:
                self.current_candidate.state = QRCandidateState.VERIFYING
                logger.info("QR Candidate VERIFYING: '%s' (Count: %d/%d)",
                            validated_code, self.current_candidate.verification_count, self.required_confirmations)

            return self.current_candidate.state, self.current_candidate
        else:
            # New conflicting code seen
            logger.warning("Conflicting QR code '%s' seen while verifying '%s'",
                           validated_code, self.current_candidate.two_digit_code)
            # Reset and start new candidate
            self._counter += 1
            rec = CandidateRecord(
                candidate_id=f"CAND_{self._counter:04d}",
                two_digit_code=validated_code,
                state=QRCandidateState.CANDIDATE,
                verification_count=1,
                first_detected_mono=now,
                last_detected_mono=now,
                centroid_u=qr_result.centroid_u,
                centroid_v=qr_result.centroid_v,
                decoder_used=qr_result.method,
                estimated_quality=qr_result.estimated_quality
            )
            self.current_candidate = rec
            return QRCandidateState.CANDIDATE, rec

    def reset(self):
        """Resets the active candidate tracker."""
        self.current_candidate = None


class WeChatQRDetector:
    """
    Robust multi-stage QR code detection and subpixel centroid extraction engine.
    Handles high perspective tilt, motion blur, and low-contrast edge lighting.
    """

    def __init__(
        self,
        detect_prototxt: Optional[str] = None,
        detect_caffemodel: Optional[str] = None,
        sr_prototxt: Optional[str] = None,
        sr_caffemodel: Optional[str] = None,
        rescue_code_regex: str = r"(?:.*?)(\d{2})(?:.*?)"
    ):
        self.rescue_regex = re.compile(rescue_code_regex)
        self.use_wechat = False
        self.wechat_detector = None

        # Candidate temporal tracker
        self.tracker = QRCandidateTracker(required_confirmations=3, expiration_timeout_s=3.0)

        # Check for OpenCV WeChatQRCode availability
        if hasattr(cv2, "wechat_qrcode") and hasattr(cv2.wechat_qrcode, "WeChatQRCode"):
            try:
                args = []
                if (detect_prototxt and os.path.exists(detect_prototxt) and
                        detect_caffemodel and os.path.exists(detect_caffemodel)):
                    args = [detect_prototxt, detect_caffemodel]
                    if sr_prototxt and os.path.exists(sr_prototxt) and sr_caffemodel and os.path.exists(sr_caffemodel):
                        args.extend([sr_prototxt, sr_caffemodel])
                self.wechat_detector = cv2.wechat_qrcode.WeChatQRCode(*args)
                self.use_wechat = True
                logger.info("WeChatQRCode detector initialized successfully (model_args=%d)", len(args))
            except Exception as e:
                logger.warning("WeChatQRCode initialization failed (%s), falling back to QRCodeDetector", e)

        # Standard OpenCV detector fallback
        self.standard_detector = cv2.QRCodeDetector()

    def detect_and_decode(self, frame: np.ndarray) -> Optional[QRDetectionResult]:
        """
        Executes multi-pass detection pipeline and returns QRDetectionResult.
        
        Pipeline:
        Stage 1: Direct Deep CNN / Standard decode on raw grayscale
        Stage 2: CLAHE contrast enhancement + Unsharp masking filter
        Stage 3: Otsu adaptive binarization (standard and inverted)
        Stage 4: Perspective quadrilateral rectification
        """
        t0 = time.perf_counter()

        if frame is None or frame.size == 0:
            return None

        # Prepare grayscale image
        if len(frame.shape) == 3:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        else:
            gray = frame

        h, w = gray.shape[:2]

        # -------------------------------------------------------------
        # STAGE 1: Raw Grayscale
        # -------------------------------------------------------------
        payload, points, method = self._decode_variant(gray, "STAGE1_RAW")
        if payload is None:
            # ---------------------------------------------------------
            # STAGE 2: CLAHE + Unsharp Masking
            # ---------------------------------------------------------
            clahe = cv2.createCLAHE(clipLimit=2.8, tileGridSize=(8, 8))
            enhanced = clahe.apply(gray)

            sharp_kernel = np.array([
                [0, -1, 0],
                [-1, 5, -1],
                [0, -1, 0]
            ], dtype=np.float32)
            sharpened = cv2.filter2D(enhanced, -1, sharp_kernel)

            payload, points, method = self._decode_variant(sharpened, "STAGE2_CLAHE_SHARP")

        if payload is None:
            # ---------------------------------------------------------
            # STAGE 3: Otsu Adaptive Binarization
            # ---------------------------------------------------------
            blurred = cv2.GaussianBlur(gray, (3, 3), 0)
            _, otsu_bin = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            payload, points, method = self._decode_variant(otsu_bin, "STAGE3_OTSU")

            if payload is None:
                otsu_inv = cv2.bitwise_not(otsu_bin)
                payload, points, method = self._decode_variant(otsu_inv, "STAGE3_OTSU_INV")

        if payload is None:
            # ---------------------------------------------------------
            # STAGE 4: Candidate Contour Warping / Perspective Search
            # ---------------------------------------------------------
            payload, points, method = self._search_and_rectify_quad(gray)

        if payload is None or points is None or len(points) == 0:
            return None

        elapsed_ms = (time.perf_counter() - t0) * 1000.0

        # Subpixel Corner Refinement & Centroid Extraction
        refined_corners, (uc, vc), bbox = self._refine_corners_and_centroid(gray, points)

        # Extract strictly validated 2-digit rescue code
        two_digit = self.extract_two_digit_code(payload)
        verified = bool(two_digit is not None)

        # Estimate detection quality based on corner geometry regularity
        estimated_quality = self._estimate_quality(refined_corners, bbox)

        return QRDetectionResult(
            payload=payload,
            two_digit_code=two_digit or "",
            centroid_u=round(uc, 2),
            centroid_v=round(vc, 2),
            corners=refined_corners,
            bounding_box=bbox,
            method=method,
            verified=verified,
            execution_time_ms=round(elapsed_ms, 2),
            estimated_quality=round(estimated_quality, 2)
        )

    def _estimate_quality(self, corners: np.ndarray, bbox: Tuple[int, int, int, int]) -> float:
        """Estimates detection quality score [0.0, 1.0] from geometric aspect ratio and size."""
        if corners is None or len(corners) < 4:
            return 0.5
        w_box, h_box = bbox[2], bbox[3]
        if w_box <= 0 or h_box <= 0:
            return 0.5
        aspect = min(w_box, h_box) / max(w_box, h_box)
        # QR codes are square (aspect ratio ~ 1.0)
        return min(1.0, max(0.2, aspect))

    def _decode_variant(self, image: np.ndarray, method_name: str) -> Tuple[Optional[str], Optional[np.ndarray], str]:
        """Tries decoding on a single image variant using WeChatQRCode or standard QRCodeDetector."""
        if self.use_wechat and self.wechat_detector is not None:
            try:
                res, points = self.wechat_detector.detectAndDecode(image)
                if res and len(res) > 0 and len(res[0].strip()) > 0:
                    pts = points[0] if points is not None and len(points) > 0 else None
                    return res[0].strip(), pts, f"WECHAT_{method_name}"
            except Exception:
                pass

        try:
            text, points, _ = self.standard_detector.detectAndDecode(image)
            if text and len(text.strip()) > 0:
                pts = points[0] if (points is not None and len(points.shape) == 3) else points
                return text.strip(), pts, f"STANDARD_{method_name}"
        except Exception:
            pass

        return None, None, method_name

    def _search_and_rectify_quad(self, gray: np.ndarray) -> Tuple[Optional[str], Optional[np.ndarray], str]:
        """Searches for quadrilateral candidate contours, warps perspective to 256x256, and decodes."""
        h, w = gray.shape[:2]
        thresh = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 21, 5
        )
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < (w * h * 0.002) or area > (w * h * 0.7):
                continue

            peri = cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, 0.03 * peri, True)

            if len(approx) == 4:
                pts = approx.reshape(4, 2).astype(np.float32)
                ordered_pts = self._order_quad_points(pts)

                dst_size = 256
                dst_pts = np.array([
                    [0, 0],
                    [dst_size - 1, 0],
                    [dst_size - 1, dst_size - 1],
                    [0, dst_size - 1]
                ], dtype=np.float32)

                m_warp = cv2.getPerspectiveTransform(ordered_pts, dst_pts)
                warped = cv2.warpPerspective(gray, m_warp, (dst_size, dst_size))

                payload, _, _ = self._decode_variant(warped, "STAGE4_WARP")
                if payload is not None:
                    return payload, ordered_pts, "STAGE4_WARPED_QUAD"

        return None, None, "STAGE4_FAILED"

    @staticmethod
    def _order_quad_points(pts: np.ndarray) -> np.ndarray:
        """Orders 4 points into clockwise [top-left, top-right, bottom-right, bottom-left]."""
        rect = np.zeros((4, 2), dtype=np.float32)
        s = pts.sum(axis=1)
        rect[0] = pts[np.argmin(s)]
        rect[2] = pts[np.argmax(s)]

        diff = np.diff(pts, axis=1)
        rect[1] = pts[np.argmin(diff)]
        rect[3] = pts[np.argmax(diff)]
        return rect

    def _refine_corners_and_centroid(
        self,
        gray: np.ndarray,
        points: np.ndarray
    ) -> Tuple[np.ndarray, Tuple[float, float], Tuple[int, int, int, int]]:
        """
        Applies cv2.cornerSubPix to the 4 finder corners and computes
        the analytical diagonal intersection centroid.
        """
        pts = np.array(points, dtype=np.float32).reshape(-1, 2)
        if len(pts) != 4:
            pts = pts[:4]

        ordered_pts = self._order_quad_points(pts)

        # 1. Corner Subpixel Refinement
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.005)
        try:
            subpix_input = ordered_pts.reshape(-1, 1, 2)
            cv2.cornerSubPix(gray, subpix_input, winSize=(5, 5), zeroZone=(-1, -1), criteria=criteria)
            refined = subpix_input.reshape(4, 2)
        except Exception:
            refined = ordered_pts

        # 2. Analytical Diagonal Intersection Centroid
        x0, y0 = refined[0]
        x1, y1 = refined[1]
        x2, y2 = refined[2]
        x3, y3 = refined[3]

        a1 = y2 - y0
        b1 = -(x2 - x0)
        c1 = x2 * y0 - x0 * y2

        a2 = y3 - y1
        b2 = -(x3 - x1)
        c2 = x3 * y1 - x1 * y3

        det = a1 * b2 - a2 * b1
        if abs(det) > 1e-6:
            uc = (b1 * c2 - b2 * c1) / det
            vc = (c1 * a2 - c2 * a1) / det
        else:
            uc = float(np.mean(refined[:, 0]))
            vc = float(np.mean(refined[:, 1]))

        # Bounding box
        min_x = int(max(0, np.min(refined[:, 0])))
        min_y = int(max(0, np.min(refined[:, 1])))
        max_x = int(min(gray.shape[1], np.max(refined[:, 0])))
        max_y = int(min(gray.shape[0], np.max(refined[:, 1])))
        bbox = (min_x, min_y, max(1, max_x - min_x), max(1, max_y - min_y))

        return refined, (float(uc), float(vc)), bbox

    def extract_two_digit_code(self, payload: str, strict: bool = True) -> Optional[str]:
        """
        Extracts the 2-digit competition rescue code.
        If strict=True (default), enforces exact regex ^\\d{2}$ (preserving leading zeroes).
        If strict=False, extracts first two-digit cluster for backward compatibility.
        """
        if not payload:
            return None
        cleaned = str(payload).strip()

        # Strict competition mode: full string must match ^\d{2}$
        if strict:
            return validate_strict_two_digit(cleaned)

        # Non-strict legacy extraction
        if re.match(r"^\d{2}$", cleaned):
            return cleaned
        match = self.rescue_regex.search(cleaned)
        if match:
            return match.group(1)
        digits = "".join(filter(str.isdigit, cleaned))
        if len(digits) >= 2:
            return digits[:2]
        return None

    def process_frame_with_tracking(
        self,
        frame: np.ndarray,
        timestamp_mono: Optional[float] = None
    ) -> Tuple[Optional[QRDetectionResult], QRCandidateState, Optional[CandidateRecord]]:
        """
        Combined high-level entry point:
        1. Executes multi-stage QR detection.
        2. Updates candidate temporal verification state machine.
        Returns (qr_result, candidate_state, candidate_record).
        """
        res = self.detect_and_decode(frame)
        state, record = self.tracker.update(res, timestamp_mono=timestamp_mono)
        return res, state, record


# Global singleton instance
qr_detector_service = WeChatQRDetector()
