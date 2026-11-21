"""
SKYCON Compatibility Shim: drone_core
Redirects all legacy imports to the unified backend so external harnesses and tools
continue working without requiring a nested drone_core folder.
"""
import sys

# Dynamically alias submodules directly from backend
import backend.georeferencing as georeferencing
import backend.stream_capture as stream_capture
import backend.companion_vision_node as companion_vision_node
import backend.autopilot as autopilot
import backend.brake_controller as brake_controller
import backend.drone_config as config
import backend.fsm as fsm
import backend.localization as localization
import backend.persistence as persistence
import backend.qr_detector as qr_detector
import backend.telemetry_sync as telemetry_sync
import backend.v4l2_capture as v4l2_capture
import backend.vision as vision

from backend.fsm import AutonomousEdgeMissionFSM, MissionState
from backend.drone_config import EdgeMissionConfig, CameraIntrinsics
from backend.localization import PinholeTargetResolver, haversine_distance_m
from backend.autopilot import MockAutopilot, TelemetryState
from backend.persistence import LocalPersistenceManager
from backend.georeferencing import Georeferencer, CameraIntrinsics3D, GeoreferenceResult
from backend.stream_capture import SmartphoneStreamPipeline, SmartphoneCameraConfig, StreamSourceType, CapturedFrame
from backend.companion_vision_node import CompanionVisionNode
from backend.qr_detector import WeChatQRDetector, QRDetectionResult

DroneQRDetector = WeChatQRDetector

sys.modules['drone_core'] = sys.modules[__name__]
sys.modules['drone_core.georeferencing'] = georeferencing
sys.modules['drone_core.stream_capture'] = stream_capture
sys.modules['drone_core.companion_vision_node'] = companion_vision_node
sys.modules['drone_core.autopilot'] = autopilot
sys.modules['drone_core.brake_controller'] = brake_controller
sys.modules['drone_core.config'] = config
sys.modules['drone_core.fsm'] = fsm
sys.modules['drone_core.localization'] = localization
sys.modules['drone_core.persistence'] = persistence
sys.modules['drone_core.qr_detector'] = qr_detector
sys.modules['drone_core.telemetry_sync'] = telemetry_sync
sys.modules['drone_core.v4l2_capture'] = v4l2_capture
sys.modules['drone_core.vision'] = vision
