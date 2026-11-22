"""
SKYCON Backend Package
Provides unified drone autonomy, telemetry multiplexing, computer vision,
spatial intelligence, and WSGI / FastAPI services in a clean, un-nested architecture.
"""

import sys
import types

# Expose core modules
from . import (
    mavlink_multiplexer,
    mission_engine,
    diagnostic_engine,
    heatmap_engine,
    spatial_grid,
    target_manager,
    coverage_planner,
    coverage_tracker,
    observation_manager,
    simple_json_store,
    intelligence_repository,
    mission_repository,
    packet_protocol,
    packet_manager,
    communication_monitor,
    synchronization_service,
    acknowledgement_manager,
    autopilot,
    brake_controller,
    companion_vision_node,
    fsm,
    georeferencing,
    localization,
    persistence,
    qr_detector,
    stream_capture,
    telemetry_sync,
    v4l2_capture,
    vision,
    geo_math,
    logging_config,
    settings,
)

try:
    from . import main
except ImportError:
    main = None

try:
    from . import server
except ImportError:
    server = None

# Seamless backwards compatibility aliases in sys.modules
def _alias(name, mod):
    sys.modules[name] = mod

# Virtual intelligence module
intel_mod = types.ModuleType("backend.intelligence")
intel_mod.heatmap_engine = heatmap_engine
intel_mod.spatial_grid = spatial_grid
intel_mod.target_manager = target_manager
_alias("backend.intelligence", intel_mod)
_alias("backend.intelligence.heatmap_engine", heatmap_engine)
_alias("backend.intelligence.spatial_grid", spatial_grid)
_alias("backend.intelligence.target_manager", target_manager)

# Virtual storage module
store_mod = types.ModuleType("backend.storage")
store_mod.simple_json_store = simple_json_store
store_mod.intelligence_repository = intelligence_repository
store_mod.mission_repository = mission_repository
_alias("backend.storage", store_mod)
_alias("backend.storage.simple_json_store", simple_json_store)
_alias("backend.storage.intelligence_repository", intelligence_repository)
_alias("backend.storage.mission_repository", mission_repository)

# Virtual communication module
comm_mod = types.ModuleType("backend.communication")
comm_mod.packet_protocol = packet_protocol
comm_mod.packet_manager = packet_manager
comm_mod.communication_monitor = communication_monitor
comm_mod.synchronization_service = synchronization_service
comm_mod.acknowledgement_manager = acknowledgement_manager
_alias("backend.communication", comm_mod)
_alias("backend.communication.packet_protocol", packet_protocol)
_alias("backend.communication.packet_manager", packet_manager)
_alias("backend.communication.communication_monitor", communication_monitor)
_alias("backend.communication.synchronization_service", synchronization_service)
_alias("backend.communication.acknowledgement_manager", acknowledgement_manager)

# Virtual reconnaissance module
recon_mod = types.ModuleType("backend.reconnaissance")
recon_mod.coverage_planner = coverage_planner
recon_mod.coverage_tracker = coverage_tracker
recon_mod.observation_manager = observation_manager
_alias("backend.reconnaissance", recon_mod)
_alias("backend.reconnaissance.coverage_planner", coverage_planner)
_alias("backend.reconnaissance.coverage_tracker", coverage_tracker)
_alias("backend.reconnaissance.observation_manager", observation_manager)

# Virtual app module
app_mod = types.ModuleType("backend.app")
app_mod.main = main
_alias("backend.app", app_mod)
_alias("backend.app.main", main)

# Virtual drone module
drone_mod = types.ModuleType("backend.app.drone")
for attr in [
    "AutonomousEdgeMissionFSM", "MissionState", "EdgeMissionConfig",
    "PinholeTargetResolver", "haversine_distance_m", "MockAutopilot",
    "TelemetryState", "LocalPersistenceManager", "Georeferencer",
    "CameraIntrinsics3D", "GeoreferenceResult", "SmartphoneStreamPipeline",
    "SmartphoneCameraConfig", "StreamSourceType", "CapturedFrame",
    "CompanionVisionNode", "WeChatQRDetector", "QRDetectionResult"
]:
    for src in [fsm, localization, autopilot, persistence, georeferencing, stream_capture, companion_vision_node, qr_detector]:
        if hasattr(src, attr):
            setattr(drone_mod, attr, getattr(src, attr))

_alias("backend.app.drone", drone_mod)
_alias("backend.app.drone.georeferencing", georeferencing)
_alias("backend.app.drone.stream_capture", stream_capture)
_alias("backend.app.drone.companion_vision_node", companion_vision_node)
_alias("backend.app.drone.qr_detector", qr_detector)
_alias("backend.app.drone.v4l2_capture", v4l2_capture)
_alias("backend.app.drone.brake_controller", brake_controller)
_alias("backend.app.drone.telemetry_sync", telemetry_sync)
_alias("backend.app.drone.persistence", persistence)
_alias("backend.app.drone.fsm", fsm)
_alias("backend.app.drone.autopilot", autopilot)
_alias("backend.app.drone.localization", localization)
_alias("backend.app.drone.vision", vision)

_alias("backend.drone", drone_mod)
