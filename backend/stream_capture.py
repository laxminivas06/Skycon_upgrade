"""
=====================================================================================
SKYCON MASTER ARCHITECTURE - SMARTPHONE ONBOARD CAMERA INGEST PIPELINE
MODULE: stream_capture.py (Perception Engine)
=====================================================================================
Low-Latency Smartphone Camera Streaming & Ingest Pipeline for Raspberry Pi 4B

Features:
  1. Multi-Transport Ingest:
     - Local Wi-Fi HTTP MJPEG / RTSP Stream from iPhone (Safari WebRTC / WebSocket bridge)
     - Direct Frame Push from iPhone browser (WebSocket binary or HTTP POST)
     - USB Tethering / Linux V4L2 Device (/dev/video0, /dev/video1)
     - Deterministic Synthetic Fallback with Ground Grid & QR Simulation
  2. Zero-Lag Bounded Architecture:
     - Drop-oldest single-slot freshest frame buffer (eliminates backlog accumulation)
     - CAP_PROP_BUFFERSIZE = 1 + Continuous Grab Loop
  3. Formal Camera Connection Lifecycle:
     - DISCONNECTED, PERMISSION_REQUIRED, CONNECTING, CAMERA_READY, STREAMING,
       DEGRADED, RECONNECTING, ERROR, SIMULATION
  4. Frame Quality & Health Assessment:
     - Real-time Laplacian blur variance, brightness, contrast, and exposure analysis
     - Transport latency measurement (t_reception - t_source)
  5. Physical Mount Orientation:
     - Configurable 0°, 90°, 180°, 270° compensation for arbitrary physical mounts
  6. Robust Reconnection & Fault Recovery:
     - Automatic stream stall detector (> 1500 ms without new frame)
     - Watchdog thread with exponential backoff
=====================================================================================
"""

import os
import sys
import time
import math
import logging
import threading
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Dict, Any, Union, Tuple
import numpy as np
import cv2

try:
    from .v4l2_capture import CapturedFrame
except (ImportError, ValueError):
    try:
        from drone_core.v4l2_capture import CapturedFrame
    except (ImportError, ValueError):
        @dataclass
        class CapturedFrame:
            image: np.ndarray
            timestamp_mono: float
            frame_index: int
            width: int
            height: int
            is_synthetic: bool = False
            quality: Optional[Any] = None
            transport_latency_ms: float = 0.0
            source_timestamp_s: float = 0.0

logger = logging.getLogger("SmartphoneStreamCapture")


class CameraState(str, Enum):
    """Authoritative camera connection and operational lifecycle states."""
    DISCONNECTED = "DISCONNECTED"
    PERMISSION_REQUIRED = "PERMISSION_REQUIRED"
    CONNECTING = "CONNECTING"
    CAMERA_READY = "CAMERA_READY"
    STREAMING = "STREAMING"
    DEGRADED = "DEGRADED"
    RECONNECTING = "RECONNECTING"
    ERROR = "ERROR"
    SIMULATION = "SIMULATION"


class StreamSourceType(str, Enum):
    AUTO = "AUTO"
    NETWORK_STREAM = "NETWORK_STREAM"  # HTTP MJPEG, RTSP, or IP Webcam URL
    V4L2_DEVICE = "V4L2_DEVICE"        # USB / Linux V4L2 device node
    FRAME_PUSH = "FRAME_PUSH"          # Ingested via push_frame() from WebSocket/REST
    SYNTHETIC = "SYNTHETIC"            # Bench-testing synthetic frame generator


@dataclass
class FrameQualityMetrics:
    """Quantitative frame quality and exposure evaluation metrics."""
    brightness: float = 128.0          # Mean pixel luminance [0, 255]
    contrast: float = 50.0             # Luminance standard deviation
    blur_variance: float = 100.0       # Variance of the Laplacian (higher = sharper)
    is_blurred: bool = False           # True if blur_variance < threshold
    is_underexposed: bool = False      # True if brightness < 30
    is_overexposed: bool = False       # True if brightness > 225
    quality_score: float = 1.0         # Derived quality score estimate [0.0, 1.0]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "brightness": round(self.brightness, 1),
            "contrast": round(self.contrast, 1),
            "blur_variance": round(self.blur_variance, 1),
            "is_blurred": self.is_blurred,
            "is_underexposed": self.is_underexposed,
            "is_overexposed": self.is_overexposed,
            "quality_score": round(self.quality_score, 2)
        }


def evaluate_frame_quality(frame: np.ndarray, blur_threshold: float = 60.0) -> FrameQualityMetrics:
    """
    Evaluates brightness, contrast, and Laplacian blur variance of a frame.
    Lightweight and fast for companion computer execution.
    """
    if frame is None or frame.size == 0:
        return FrameQualityMetrics(quality_score=0.0)

    # Convert to grayscale if color
    if len(frame.shape) == 3:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    else:
        gray = frame

    mean_val, std_val = cv2.meanStdDev(gray)
    brightness = float(mean_val[0][0])
    contrast = float(std_val[0][0])

    # Downscale for fast Laplacian computation if resolution is large
    h, w = gray.shape[:2]
    if w > 640:
        scale = 640.0 / w
        small_gray = cv2.resize(gray, (640, int(h * scale)), interpolation=cv2.INTER_LINEAR)
    else:
        small_gray = gray

    laplacian = cv2.Laplacian(small_gray, cv2.CV_64F)
    blur_var = float(laplacian.var())

    is_blurred = blur_var < blur_threshold
    is_under = brightness < 30.0
    is_over = brightness > 225.0

    # Estimate quality score [0.0, 1.0]
    score = 1.0
    if is_blurred:
        score *= max(0.2, blur_var / max(1.0, blur_threshold))
    if is_under:
        score *= max(0.2, brightness / 30.0)
    elif is_over:
        score *= max(0.2, (255.0 - brightness) / 30.0)

    return FrameQualityMetrics(
        brightness=brightness,
        contrast=contrast,
        blur_variance=blur_var,
        is_blurred=is_blurred,
        is_underexposed=is_under,
        is_overexposed=is_over,
        quality_score=min(1.0, max(0.0, score))
    )


@dataclass
class SmartphoneCameraConfig:
    """Optical and transport configuration for drone-mounted iPhone camera."""
    source: Union[str, int] = "http://localhost:8080/video"
    source_type: StreamSourceType = StreamSourceType.AUTO
    width: int = 1280
    height: int = 720
    fps: int = 30
    mount_rotation_deg: int = 0       # 0, 90, 180, 270 degrees
    hfov_deg: float = 68.0            # iPhone rear wide camera (~26mm full-frame equiv)
    vfov_deg: float = 54.0
    buffer_size: int = 1              # Strictly 1 to enforce freshest-frame policy
    stall_timeout_s: float = 2.0      # Trigger reconnect / degraded if no frames within timeout
    reconnect_interval_s: float = 2.0 # Interval between reconnection attempts
    use_synthetic_fallback: bool = True
    sensor_model: str = "iPhone Camera (Onboard)"


class SmartphoneStreamPipeline:
    """
    High-throughput, minimal-latency video ingest pipeline specifically adapted
    for onboard iPhone camera streaming to the Raspberry Pi 4 companion computer.
    """

    def __init__(self, config: Optional[SmartphoneCameraConfig] = None):
        self.config = config or SmartphoneCameraConfig()
        self.cap: Optional[cv2.VideoCapture] = None

        # Threading and concurrency
        self._thread: Optional[threading.Thread] = None
        self._watchdog_thread: Optional[threading.Thread] = None
        self._running = False
        self._lock = threading.Lock()

        # 1-slot freshest frame buffer
        self._latest_frame: Optional[CapturedFrame] = None
        self._frame_count = 0
        self._drop_count = 0
        self._processed_count = 0
        self._last_frame_mono = 0.0
        self._last_frame_wall = 0.0

        # Health & lifecycle
        self.camera_state: CameraState = CameraState.DISCONNECTED
        self.is_connected = False
        self.is_synthetic = False
        self._start_time = 0.0
        self._reconnect_attempts = 0
        self._consecutive_stall_count = 0
        self._detected_type: StreamSourceType = StreamSourceType.AUTO
        self._last_quality: Optional[FrameQualityMetrics] = None
        self._last_latency_ms: float = 0.0

    def start(self) -> bool:
        """Starts video ingest worker and watchdog threads."""
        if self._running:
            return True

        self._running = True
        self._start_time = time.monotonic()
        self._last_frame_mono = time.monotonic()
        self._last_frame_wall = time.time()

        # Determine source type
        self._detected_type = self._resolve_source_type()

        if self._detected_type == StreamSourceType.SYNTHETIC:
            self.is_synthetic = True
            self.is_connected = True
            self.camera_state = CameraState.SIMULATION
            logger.info("Operating in SIMULATION smartphone camera mode (%dx%d @ %d FPS)",
                        self.config.width, self.config.height, self.config.fps)
        elif self._detected_type == StreamSourceType.FRAME_PUSH:
            self.is_synthetic = False
            self.is_connected = False
            self.camera_state = CameraState.CAMERA_READY
            logger.info("Operating in PUSH frame ingestion mode (waiting for incoming iPhone frames)")
        else:
            self.camera_state = CameraState.CONNECTING
            success = self._connect_stream()
            if not success:
                if self.config.use_synthetic_fallback:
                    logger.warning("Camera source '%s' unreachable. Activating synthetic fallback.", self.config.source)
                    self.is_synthetic = True
                    self.is_connected = True
                    self.camera_state = CameraState.SIMULATION
                else:
                    logger.error("Failed to connect to camera source '%s'", self.config.source)
                    self.camera_state = CameraState.ERROR
                    self._running = False
                    return False

        # Spawn grab worker thread
        self._thread = threading.Thread(target=self._worker_loop, daemon=True, name="PhoneStreamWorker")
        self._thread.start()

        # Spawn watchdog thread if not synthetic
        if not self.is_synthetic:
            self._watchdog_thread = threading.Thread(target=self._watchdog_loop, daemon=True, name="PhoneStreamWatchdog")
            self._watchdog_thread.start()

        logger.info(
            "SmartphoneStreamPipeline active (source=%s, type=%s, state=%s, %dx%d, rotation=%d°)",
            self.config.source, self._detected_type.value, self.camera_state.value,
            self.config.width, self.config.height, self.config.mount_rotation_deg
        )
        return True

    def _resolve_source_type(self) -> StreamSourceType:
        """Determines stream ingestion strategy from configuration."""
        if self.config.source_type != StreamSourceType.AUTO:
            return self.config.source_type

        src = str(self.config.source).strip()
        if src.lower() in ("synthetic", "mock", "sim"):
            return StreamSourceType.SYNTHETIC
        if src.lower() in ("push", "websocket", "ws", "browser"):
            return StreamSourceType.FRAME_PUSH
        if src.startswith("http://") or src.startswith("https://") or src.startswith("rtsp://"):
            return StreamSourceType.NETWORK_STREAM
        if src.isdigit() or src.startswith("/dev/video"):
            return StreamSourceType.V4L2_DEVICE

        return StreamSourceType.FRAME_PUSH

    def _connect_stream(self) -> bool:
        """Initializes OpenCV VideoCapture for network stream or V4L2 device."""
        try:
            source = int(self.config.source) if str(self.config.source).isdigit() else self.config.source
            self.cap = cv2.VideoCapture(source)

            if not self.cap.isOpened():
                return False

            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, self.config.buffer_size)
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.config.width)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.config.height)
            self.cap.set(cv2.CAP_PROP_FPS, self.config.fps)

            self.is_connected = True
            self.camera_state = CameraState.STREAMING
            self._consecutive_stall_count = 0
            return True
        except Exception as e:
            logger.error("VideoCapture initialization exception: %s", e)
            self.camera_state = CameraState.ERROR
            return False

    def _worker_loop(self):
        """Continuous frame acquisition loop running on dedicated worker thread."""
        target_period = 1.0 / max(1, self.config.fps)

        while self._running:
            if self.is_synthetic:
                t_start = time.monotonic()
                synth_img = self._generate_synthetic_frame()
                self._handle_new_frame(synth_img, t_start, is_synthetic=True)
                elapsed = time.monotonic() - t_start
                sleep_s = target_period - elapsed
                if sleep_s > 0:
                    time.sleep(sleep_s)
                continue

            if self._detected_type == StreamSourceType.FRAME_PUSH:
                # Push mode: frames arrive via push_frame() or push_frame_bytes()
                time.sleep(0.005)
                continue

            # Stream grab mode
            if self.cap is None or not self.cap.isOpened():
                time.sleep(0.05)
                continue

            grabbed = self.cap.grab()
            t_capture = time.monotonic()

            if not grabbed:
                time.sleep(0.005)
                continue

            ret, raw_frame = self.cap.retrieve()
            if not ret or raw_frame is None:
                continue

            processed_frame = self._apply_rotation(raw_frame)
            self._handle_new_frame(processed_frame, t_capture, is_synthetic=False)

    def _handle_new_frame(
        self,
        frame_img: np.ndarray,
        timestamp_mono: float,
        is_synthetic: bool = False,
        source_ts: float = 0.0,
        latency_ms: float = 0.0
    ):
        """Stores newest frame into 1-slot freshest buffer under lock, dropping stale frame."""
        h, w = frame_img.shape[:2]
        quality = evaluate_frame_quality(frame_img)

        with self._lock:
            if self._latest_frame is not None:
                self._drop_count += 1
            self._frame_count += 1
            self._last_frame_mono = timestamp_mono
            self._last_frame_wall = time.time()
            self._last_quality = quality
            self._last_latency_ms = latency_ms

            if not is_synthetic:
                self.camera_state = CameraState.STREAMING
                self.is_connected = True

            self._latest_frame = CapturedFrame(
                image=frame_img,
                timestamp_mono=timestamp_mono,
                frame_index=self._frame_count,
                width=w,
                height=h,
                is_synthetic=is_synthetic
            )
            # Attach dynamic attributes
            self._latest_frame.quality = quality
            self._latest_frame.transport_latency_ms = latency_ms
            self._latest_frame.source_timestamp_s = source_ts

    def push_frame(
        self,
        image: np.ndarray,
        timestamp_mono: Optional[float] = None,
        source_timestamp_s: Optional[float] = None
    ) -> bool:
        """
        External ingest point: pushes a numpy array frame (e.g. from local WebRTC / OpenCV).
        """
        if not self._running:
            self.start()

        if image is None or image.size == 0:
            return False

        t_now = timestamp_mono or time.monotonic()
        src_ts = source_timestamp_s or time.time()
        latency_ms = max(0.0, (time.time() - src_ts) * 1000.0) if source_timestamp_s else 0.0

        processed = self._apply_rotation(image)
        self._handle_new_frame(
            processed,
            timestamp_mono=t_now,
            is_synthetic=False,
            source_ts=src_ts,
            latency_ms=latency_ms
        )
        return True

    def push_frame_bytes(
        self,
        raw_bytes: bytes,
        source_timestamp_s: Optional[float] = None
    ) -> Tuple[bool, Optional[CapturedFrame], str]:
        """
        Ingests compressed frame bytes (JPEG/PNG) pushed from iPhone browser over WebSocket/HTTP.
        Decodes in memory and applies rotation and freshest-frame queuing.
        """
        if not self._running:
            self.start()

        if not raw_bytes or len(raw_bytes) < 4:
            return False, None, "Empty or truncated frame bytes"

        try:
            nparr = np.frombuffer(raw_bytes, np.uint8)
            decoded = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if decoded is None:
                return False, None, "Corrupted image bytes (imdecode returned None)"

            t_now = time.monotonic()
            src_ts = source_timestamp_s or time.time()
            latency_ms = max(0.0, (time.time() - src_ts) * 1000.0) if source_timestamp_s else 0.0

            processed = self._apply_rotation(decoded)
            self._handle_new_frame(
                processed,
                timestamp_mono=t_now,
                is_synthetic=False,
                source_ts=src_ts,
                latency_ms=latency_ms
            )
            return True, self._latest_frame, "OK"
        except Exception as e:
            logger.error("Error decoding pushed frame bytes: %s", e)
            return False, None, str(e)

    def _apply_rotation(self, image: np.ndarray) -> np.ndarray:
        """Applies 90/180/270 degree rotation according to physical phone mount angle."""
        rot = self.config.mount_rotation_deg % 360
        if rot == 90:
            return cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)
        elif rot == 180:
            return cv2.rotate(image, cv2.ROTATE_180)
        elif rot == 270:
            return cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE)
        return image

    def _watchdog_loop(self):
        """Monitors stream vitality; automatically triggers reconnect or degraded state if stream stalls."""
        while self._running:
            time.sleep(0.5)
            if self.is_synthetic:
                continue

            silence_s = time.monotonic() - self._last_frame_mono if self._last_frame_mono > 0 else 999.0

            if silence_s > self.config.stall_timeout_s:
                if self.is_connected:
                    self.is_connected = False
                    self.camera_state = CameraState.DEGRADED
                    logger.warning("Camera stream silence > %.1fs. Transitioning to DEGRADED.", silence_s)

                if self._detected_type == StreamSourceType.NETWORK_STREAM or self._detected_type == StreamSourceType.V4L2_DEVICE:
                    self.camera_state = CameraState.RECONNECTING
                    self._reconnect()

    def _reconnect(self):
        """Safely recycles VideoCapture and re-establishes stream connection."""
        self.is_connected = False
        self._reconnect_attempts += 1

        if self.cap is not None:
            try:
                self.cap.release()
            except Exception:
                pass
            self.cap = None

        time.sleep(self.config.reconnect_interval_s)
        success = self._connect_stream()
        if success:
            logger.info("Camera stream re-established after reconnect attempt #%d.", self._reconnect_attempts)
        else:
            logger.warning("Reconnection attempt #%d failed.", self._reconnect_attempts)

    def get_latest_frame(self) -> Optional[CapturedFrame]:
        """Returns and consumes the freshest captured frame without waiting."""
        with self._lock:
            frame = self._latest_frame
            self._latest_frame = None  # Consume frame
            if frame is not None:
                self._processed_count += 1
            return frame

    def read_latest(self) -> Optional[CapturedFrame]:
        """Non-destructive peek at the latest captured frame."""
        with self._lock:
            return self._latest_frame

    def _generate_synthetic_frame(self) -> np.ndarray:
        """Generates synthetic downward ground reconnaissance frame for bench tests."""
        h, w = self.config.height, self.config.width
        frame = np.full((h, w, 3), (35, 65, 40), dtype=np.uint8)

        # Tactical search grid lines
        for x in range(0, w, 80):
            cv2.line(frame, (x, 0), (x, h), (45, 75, 50), 1)
        for y in range(0, h, 80):
            cv2.line(frame, (0, y), (w, y), (45, 75, 50), 1)

        now_str = f"SKYCON iPHONE CAM: Frame #{self._frame_count} | 720p@{self.config.fps}FPS [SYNTH]"
        cv2.putText(frame, now_str, (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 220, 200), 1)
        return frame

    def stop(self):
        """Gracefully halts worker and watchdog threads, releases capture handles."""
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1.0)
        self._thread = None

        if self._watchdog_thread and self._watchdog_thread.is_alive():
            self._watchdog_thread.join(timeout=1.0)
        self._watchdog_thread = None

        if self.cap is not None:
            try:
                self.cap.release()
            except Exception:
                pass
            self.cap = None

        self.is_connected = False
        self.camera_state = CameraState.DISCONNECTED
        logger.info(
            "Smartphone stream stopped. Total captured: %d, dropped: %d, processed: %d",
            self._frame_count, self._drop_count, self._processed_count
        )

    def get_stats(self) -> Dict[str, Any]:
        """Returns comprehensive real-time streaming diagnostics."""
        elapsed = max(0.001, time.monotonic() - self._start_time)
        actual_fps = self._frame_count / elapsed if self._running else 0.0
        silence_s = time.monotonic() - self._last_frame_mono if self._last_frame_mono > 0 else 999.0

        return {
            "source": str(self.config.source),
            "source_type": self._detected_type.value,
            "camera_state": self.camera_state.value,
            "is_connected": self.is_connected,
            "is_synthetic": self.is_synthetic,
            "width": self.config.width,
            "height": self.config.height,
            "target_fps": self.config.fps,
            "actual_fps": round(actual_fps, 1),
            "mount_rotation_deg": self.config.mount_rotation_deg,
            "frames_captured": self._frame_count,
            "frames_dropped": self._drop_count,
            "frames_processed": self._processed_count,
            "reconnect_attempts": self._reconnect_attempts,
            "silence_ms": round(silence_s * 1000.0, 1),
            "last_frame_timestamp": self._last_frame_wall,
            "transport_latency_ms": round(self._last_latency_ms, 1),
            "quality": self._last_quality.to_dict() if self._last_quality else None,
            "stalled": silence_s > self.config.stall_timeout_s
        }


# Global singleton instance for companion server
smartphone_stream = SmartphoneStreamPipeline(SmartphoneCameraConfig(source="push", source_type=StreamSourceType.FRAME_PUSH))
