# Flight Control & Georeferencing

> 539 nodes · cohesion 0.01

## Key Concepts

- [Georeferencer](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/georeferencing.py#L157) (83 connections)
- [CameraIntrinsics3D](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/georeferencing.py#L48) (82 connections)
- [LocalPersistenceManager](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/persistence.py#L97) (64 connections)
- [HeatmapEngine](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/heatmap_engine.py#L43) (63 connections)
- [CapturedFrame](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/v4l2_capture.py#L44) (56 connections)
- [SmartphoneStreamPipeline](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/stream_capture.py#L179) (53 connections)
- [AutonomousEdgeMissionFSM](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/fsm.py#L33) (52 connections)
- [GeoreferenceResult](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/georeferencing.py#L123) (51 connections)
- [TelemetrySyncBuffer](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/telemetry_sync.py#L237) (51 connections)
- [WeChatQRDetector](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/qr_detector.py#L246) (50 connections)
- **str** (49 connections)
- [MockAutopilot](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/autopilot.py#L52) (48 connections)
- [CameraState](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/stream_capture.py#L64) (48 connections)
- [QRDetectionResult](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/qr_detector.py#L53) (44 connections)
- [CompanionVisionNode](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/companion_vision_node.py#L87) (43 connections)
- [TelemetrySnapshot](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/telemetry_sync.py#L76) (43 connections)
- [TelemetryState](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/autopilot.py#L12) (41 connections)
- [GeorefHonestyLevel](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/georeferencing.py#L39) (41 connections)
- [TimeSyncStatus](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/telemetry_sync.py#L40) (41 connections)
- [get_telemetry()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/server.py#L323) (40 connections)
- [TestPhase4VisionPerception](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/tests/test_phase4_vision_perception.py#L95) (39 connections)
- [V4L2CapturePipeline](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/v4l2_capture.py#L54) (39 connections)
- [SmartphoneCameraConfig](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/stream_capture.py#L162) (37 connections)
- [MissionState](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/fsm.py#L22) (36 connections)
- [PinholeTargetResolver](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/localization.py#L22) (34 connections)
- *... and 514 more nodes in this community*

## Class Diagram

```mermaid
classDiagram
    class AdversarialGeoreferencingTests {
        +adversarial_georef_test.py()
        +.setUp()
        +._assert_no_nan_or_inf()
        +.test_extreme_attitudes_and_altitudes_grid()
        +.test_heading_wraparound_and_negative_yaw()
        +.test_extreme_perimeter_pixel_corners()
        +.test_global_seed_coordinates_and_guards()
        +.test_mathematical_linear_scaling_and_symmetry()
        +.test_optical_distortion_undistortion_stability()
    }
    class AutopilotInterface {
        +autopilot.py()
        +.connect()
        +.command_yaw()
        +.hold_position()
        +.fly_to_position()
        +.command_rtl()
        +.get_telemetry()
        +.disconnect()
    }
    class MavlinkAutopilot {
        +autopilot.py()
        +.__init__()
        +.connect()
        +.command_yaw()
        +.hold_position()
        +.fly_to_position()
        +.command_rtl()
        +.get_telemetry()
        +.disconnect()
    }
    class MockAutopilot {
        +autopilot.py()
        +.__init__()
        +.connect()
        +.command_yaw()
        +.hold_position()
        +.fly_to_position()
        +.command_rtl()
        +.get_telemetry()
        +.disconnect()
    }
    class TelemetryState {
        +autopilot.py()
    }
    class BrakeController {
        +brake_controller.py()
        +.__init__()
        +.set_connection()
        +.trigger_instant_brake()
        +.trigger_zero_velocity_hold()
        +.trigger_rtl()
    }
    class BrakeEvent {
        +brake_controller.py()
    }
    class BrakingKinematics {
        +brake_controller.py()
    }
    class _MockMavlinkConsts {
        +brake_controller.py()
    }
    class _MockMavutil {
        +brake_controller.py()
    }
    class CompanionVisionNode {
        +companion_vision_node.py()
        +.__init__()
        +.start()
        +._init_mavlink()
        +._request_message_interval()
        +._telemetry_reader_loop()
        +._start_mock_telemetry()
        +.set_recon_stage()
        +.set_auto_brake()
        +.get_diagnostics()
    }
    class _MockMavlinkConsts {
        +companion_vision_node.py()
    }
    class _MockMavutil {
        +companion_vision_node.py()
    }
    class CameraIntrinsics {
        +config.py()
        +.__post_init__()
    }
    class EdgeMissionConfig {
        +config.py()
        +.get_compiled_regex()
    }
    class CameraIntrinsics {
        +drone_config.py()
        +.__post_init__()
    }
    class EdgeMissionConfig {
        +drone_config.py()
        +.get_compiled_regex()
    }
    class AutonomousEdgeMissionFSM {
        +fsm.py()
        +.__init__()
        +.subscribe()
        +._notify()
        +.get_progress()
        +.transition_to()
        +.start()
        +.stop()
        +.tick()
        +._step_searching()
    }
    class MissionState {
        +fsm.py()
    }
    class CameraIntrinsics3D {
        +georeferencing.py()
        +.__post_init__()
        +.to_dict()
    }
    class Georeferencer {
        +georeferencing.py()
        +.__init__()
        +._compute_camera_to_body_matrix()
        +.update_calibration()
        +.resolve_target()
    }
    class GeoreferenceResult {
        +georeferencing.py()
        +.to_dict()
    }
    class GeorefHonestyLevel {
        +georeferencing.py()
    }
    class HeatmapEngine {
        +heatmap_engine.py()
        +.__init__()
        +.initialize_circle_boundary()
        +.initialize_polygon_boundary()
        +.update_camera_footprint()
        +.register_qr_observation()
        +.get_layer_a_coverage()
        +.get_layer_b_obstacles()
        +.get_layer_c_targets()
        +.get_summary()
    }
    class PinholeTargetResolver {
        +localization.py()
        +.__init__()
        +.pixel_to_body_offset()
        +.resolve_target()
    }
    class TargetDisplacement {
        +localization.py()
    }
    class CommandStatus {
        +mavlink_multiplexer.py()
    }
    class ConnectionState {
        +mavlink_multiplexer.py()
    }
    class ReconStage {
        +observation_manager.py()
    }
    class BoundingBoxRecord {
        +persistence.py()
    }
    class CameraIntrinsicsRecord {
        +persistence.py()
    }
    class DecodedPayloadRecord {
        +persistence.py()
    }
    class DroneStateRecord {
        +persistence.py()
    }
    class GeoreferencedDetectionRecord {
        +persistence.py()
    }
    class LocalPersistenceManager {
        +persistence.py()
        +.__init__()
        +._ensure_directories()
        +._init_sqlite()
        +.save_payload()
        +.save_georeferenced_detection()
        +._atomic_append_json()
        +.log_mission_event()
        +.load_latest_payload()
    }
    class TargetLocationRecord {
        +persistence.py()
    }
    class QRCandidateTracker {
        +qr_detector.py()
        +.__init__()
        +.update()
        +.reset()
    }
    class QRDetectionResult {
        +qr_detector.py()
    }
    class WeChatQRDetector {
        +qr_detector.py()
        +.__init__()
        +.detect_and_decode()
        +._estimate_quality()
        +._decode_variant()
        +._search_and_rectify_quad()
        +._refine_corners_and_centroid()
        +.extract_two_digit_code()
        +.process_frame_with_tracking()
    }
    class CoverageStatus {
        +spatial_grid.py()
    }
    class LayerACoverageStatus {
        +spatial_grid.py()
    }
    class LayerBObstacleStatus {
        +spatial_grid.py()
    }
    class LayerCTargetStatus {
        +spatial_grid.py()
    }
    class SpatialCell {
        +spatial_grid.py()
        +.__init__()
        +.mark_observed()
        +.mark_explored()
        +.update_target_observation()
        +.to_dict()
    }
    class SpatialGrid {
        +spatial_grid.py()
        +.__init__()
        +.initialize_circular_boundary()
        +.initialize_polygonal_boundary()
        +.get_cell_at_coords()
        +.get_layer_a_metrics()
    }
    class TargetStatus {
        +spatial_grid.py()
    }
    class CameraState {
        +stream_capture.py()
    }
    class CapturedFrame {
        +stream_capture.py()
    }
    class FrameQualityMetrics {
        +stream_capture.py()
        +.to_dict()
    }
    class SmartphoneCameraConfig {
        +stream_capture.py()
    }
    class SmartphoneStreamPipeline {
        +stream_capture.py()
        +.__init__()
        +.start()
        +._resolve_source_type()
        +._connect_stream()
        +._worker_loop()
        +._handle_new_frame()
        +.push_frame()
        +.push_frame_bytes()
        +._apply_rotation()
    }
    class StreamSourceType {
        +stream_capture.py()
    }
    class HealthState {
        +system_health.py()
    }
    class TargetManager {
        +target_manager.py()
        +.__init__()
        +.register_observation()
        +.get_ranked_candidates()
        +.generate_inspection_order()
        +._find_nearest_target()
    }
    class TargetRecord {
        +target_manager.py()
        +.mark_candidate()
        +.mark_verified()
        +.mark_qr_confirmed()
        +.to_dict()
    }
    class SyncedTimestampResult {
        +telemetry_sync.py()
        +.to_dict()
    }
    class TelemetrySnapshot {
        +telemetry_sync.py()
    }
    class TelemetrySyncBuffer {
        +telemetry_sync.py()
        +.__init__()
        +.update_attitude()
        +.update_global_position()
        +.update_heartbeat()
        +.push_snapshot()
        +._push_snapshot_locked()
        +.get_latest()
        +.interpolate()
        +.interpolate_for_frame()
    }
    class TimeSynchronizationService {
        +telemetry_sync.py()
        +.__init__()
        +.update_pixhawk_clock()
        +.record_network_latency_sample()
        +.correlate_frame()
        +.get_diagnostics()
    }
    class TimeSyncStatus {
        +telemetry_sync.py()
    }
    class TestDroneCoreEdgeMission {
        +test_drone_core_edge.py()
        +.setUp()
        +.tearDown()
        +.test_pinhole_target_resolution_center()
        +.test_pinhole_target_resolution_offsets_and_headings()
        +.test_haversine_distance_accuracy()
        +.test_nonblocking_fsm_initial_state_and_start()
        +.test_dynamic_zoom_sweep_and_yaw_scanning()
        +.test_candidate_verification_and_false_alarm_recovery()
        +.test_full_mission_lifecycle_to_rtl()
    }
    class TestMilestone2EdgeVisionAndGeoreferencing {
        +test_drone_core_m2.py()
        +.setUp()
        +.tearDown()
        +.test_vector1_center_nadir_alignment()
        +.test_vector2_offset_target_with_heading()
        +.test_vector3_pitch_compensated_forward_cruise()
        +.test_telemetry_sync_ring_buffer()
        +.test_atomic_persistence_and_checksum()
        +.test_companion_vision_node_pipeline_execution()
    }
    class TestPhase4VisionPerception {
        +test_phase4_vision_perception.py()
        +.setUp()
        +.test_01_camera_lifecycle_and_freshest_frame_buffer()
        +.test_02_frame_quality_evaluation()
        +.test_03_invalid_and_corrupted_frame_rejection()
        +.test_04_strict_two_digit_regex_validation()
        +.test_05_candidate_verification_state_machine()
        +.test_06_candidate_timeout_and_expiration()
        +.test_07_time_synchronization_correlation()
        +.test_08_attitude_compensated_georeferencing()
    }
    class CapturedFrame {
        +v4l2_capture.py()
    }
    class V4L2CapturePipeline {
        +v4l2_capture.py()
        +.__init__()
        +.start()
        +._init_capture()
        +._apply_v4l2_ctl_parameters()
        +._capture_worker_loop()
        +.get_latest_frame()
        +.read_latest()
        +._generate_synthetic_frame()
        +.inject_synthetic_qr()
    }
    class V4L2Config {
        +v4l2_capture.py()
    }
    class DecodeResult {
        +vision.py()
    }
    class OnboardVisionEngine {
        +vision.py()
        +.__init__()
        +.start()
        +.stop()
        +.submit_frame()
        +.get_latest_result()
        +.step_dynamic_zoom()
        +.set_zoom()
        +._cv_worker_loop()
        +.detect_candidate()
    }
    class VisionCandidate {
        +vision.py()
    }
    AdversarialGeoreferencingTests --> CameraIntrinsics3D
    AdversarialGeoreferencingTests --> GeoreferenceResult
    AdversarialGeoreferencingTests --> Georeferencer
    MockAutopilot <|-- AutopilotInterface
    MavlinkAutopilot <|-- AutopilotInterface
    AutopilotInterface --> MissionState
    AutopilotInterface --> AutonomousEdgeMissionFSM
    AutopilotInterface <|-- MavlinkAutopilot
    AutopilotInterface <|-- MockAutopilot
    MockAutopilot --> TestDroneCoreEdgeMission
    MockAutopilot --> TestPhase4VisionPerception
    TelemetryState --> MissionState
    TelemetryState --> AutonomousEdgeMissionFSM
    TelemetryState --> TestDroneCoreEdgeMission
    BrakeController --> _MockMavlinkConsts
    BrakeController --> _MockMavutil
    BrakeController --> CompanionVisionNode
    BrakeController --> TestMilestone2EdgeVisionAndGeoreferencing
    BrakingKinematics --> TestMilestone2EdgeVisionAndGeoreferencing
    CompanionVisionNode --> BrakeController
    CompanionVisionNode --> CameraIntrinsics
    CompanionVisionNode --> V4L2CapturePipeline
    CompanionVisionNode --> V4L2Config
    CompanionVisionNode --> CapturedFrame
    CompanionVisionNode --> SmartphoneStreamPipeline
    CompanionVisionNode --> SmartphoneCameraConfig
    CompanionVisionNode --> WeChatQRDetector
    CompanionVisionNode --> QRDetectionResult
    CompanionVisionNode --> Georeferencer
    CompanionVisionNode --> CameraIntrinsics3D
    CompanionVisionNode --> GeoreferenceResult
    CompanionVisionNode --> TelemetrySyncBuffer
    CompanionVisionNode --> TelemetrySnapshot
    CompanionVisionNode --> LocalPersistenceManager
    CompanionVisionNode --> GeoreferencedDetectionRecord
    CompanionVisionNode --> HeatmapEngine
    CompanionVisionNode --> TestMilestone2EdgeVisionAndGeoreferencing
    _MockMavlinkConsts --> BrakeController
    _MockMavlinkConsts --> CameraIntrinsics
    _MockMavlinkConsts --> V4L2CapturePipeline
    _MockMavlinkConsts --> V4L2Config
    _MockMavlinkConsts --> CapturedFrame
    _MockMavlinkConsts --> SmartphoneStreamPipeline
    _MockMavlinkConsts --> SmartphoneCameraConfig
    _MockMavlinkConsts --> WeChatQRDetector
    _MockMavlinkConsts --> QRDetectionResult
    _MockMavlinkConsts --> Georeferencer
    _MockMavlinkConsts --> CameraIntrinsics3D
    _MockMavlinkConsts --> GeoreferenceResult
    _MockMavlinkConsts --> TelemetrySyncBuffer
    _MockMavlinkConsts --> TelemetrySnapshot
    _MockMavlinkConsts --> LocalPersistenceManager
    _MockMavlinkConsts --> GeoreferencedDetectionRecord
    _MockMavlinkConsts --> HeatmapEngine
    _MockMavutil --> BrakeController
    _MockMavutil --> CameraIntrinsics
    _MockMavutil --> V4L2CapturePipeline
    _MockMavutil --> V4L2Config
    _MockMavutil --> CapturedFrame
    _MockMavutil --> SmartphoneStreamPipeline
    _MockMavutil --> SmartphoneCameraConfig
    _MockMavutil --> WeChatQRDetector
    _MockMavutil --> QRDetectionResult
    _MockMavutil --> Georeferencer
    _MockMavutil --> CameraIntrinsics3D
    _MockMavutil --> GeoreferenceResult
    _MockMavutil --> TelemetrySyncBuffer
    _MockMavutil --> TelemetrySnapshot
    _MockMavutil --> LocalPersistenceManager
    _MockMavutil --> GeoreferencedDetectionRecord
    _MockMavutil --> HeatmapEngine
    CameraIntrinsics --> _MockMavlinkConsts
    CameraIntrinsics --> _MockMavutil
    CameraIntrinsics --> CompanionVisionNode
    CameraIntrinsics --> TargetDisplacement
    CameraIntrinsics --> PinholeTargetResolver
    EdgeMissionConfig --> MissionState
    EdgeMissionConfig --> AutonomousEdgeMissionFSM
    EdgeMissionConfig --> VisionCandidate
    EdgeMissionConfig --> DecodeResult
    EdgeMissionConfig --> OnboardVisionEngine
    CameraIntrinsics --> TestDroneCoreEdgeMission
    EdgeMissionConfig --> TestDroneCoreEdgeMission
    AutonomousEdgeMissionFSM --> TelemetryState
    AutonomousEdgeMissionFSM --> AutopilotInterface
    AutonomousEdgeMissionFSM --> EdgeMissionConfig
    AutonomousEdgeMissionFSM --> PinholeTargetResolver
    AutonomousEdgeMissionFSM --> TargetDisplacement
    AutonomousEdgeMissionFSM --> OnboardVisionEngine
    AutonomousEdgeMissionFSM --> VisionCandidate
    AutonomousEdgeMissionFSM --> DecodeResult
    AutonomousEdgeMissionFSM --> LocalPersistenceManager
    AutonomousEdgeMissionFSM --> DecodedPayloadRecord
    AutonomousEdgeMissionFSM --> TestDroneCoreEdgeMission
    AutonomousEdgeMissionFSM --> TestPhase4VisionPerception
    MissionState --> TelemetryState
    MissionState --> AutopilotInterface
    MissionState --> EdgeMissionConfig
    MissionState --> PinholeTargetResolver
    MissionState --> TargetDisplacement
    MissionState --> OnboardVisionEngine
    MissionState --> VisionCandidate
    MissionState --> DecodeResult
    MissionState --> LocalPersistenceManager
    MissionState --> DecodedPayloadRecord
    MissionState --> TestDroneCoreEdgeMission
    MissionState --> TestPhase4VisionPerception
    CameraIntrinsics3D --> _MockMavlinkConsts
    CameraIntrinsics3D --> _MockMavutil
    CameraIntrinsics3D --> CompanionVisionNode
    CameraIntrinsics3D --> AdversarialGeoreferencingTests
    CameraIntrinsics3D --> TestMilestone2EdgeVisionAndGeoreferencing
    CameraIntrinsics3D --> TestPhase4VisionPerception
    Georeferencer --> _MockMavlinkConsts
    Georeferencer --> _MockMavutil
    Georeferencer --> CompanionVisionNode
    Georeferencer --> AdversarialGeoreferencingTests
    Georeferencer --> TestMilestone2EdgeVisionAndGeoreferencing
    Georeferencer --> TestPhase4VisionPerception
    GeoreferenceResult --> _MockMavlinkConsts
    GeoreferenceResult --> _MockMavutil
    GeoreferenceResult --> CompanionVisionNode
    GeoreferenceResult --> AdversarialGeoreferencingTests
    GeoreferenceResult --> TestMilestone2EdgeVisionAndGeoreferencing
    GeoreferenceResult --> TestPhase4VisionPerception
    GeorefHonestyLevel --> TestPhase4VisionPerception
    HeatmapEngine --> _MockMavlinkConsts
    HeatmapEngine --> _MockMavutil
    HeatmapEngine --> CompanionVisionNode
    HeatmapEngine --> SpatialGrid
    HeatmapEngine --> SpatialCell
    HeatmapEngine --> LayerACoverageStatus
    HeatmapEngine --> LayerBObstacleStatus
    HeatmapEngine --> LayerCTargetStatus
    HeatmapEngine --> CoverageStatus
    HeatmapEngine --> TargetStatus
    HeatmapEngine --> TargetManager
    HeatmapEngine --> TargetRecord
    HeatmapEngine --> ReconStage
    HeatmapEngine --> TestPhase4VisionPerception
    PinholeTargetResolver --> CameraIntrinsics
    PinholeTargetResolver --> MissionState
    PinholeTargetResolver --> AutonomousEdgeMissionFSM
    PinholeTargetResolver --> TestDroneCoreEdgeMission
    TargetDisplacement --> CameraIntrinsics
    TargetDisplacement --> MissionState
    TargetDisplacement --> AutonomousEdgeMissionFSM
    ReconStage --> HeatmapEngine
    ReconStage --> TargetRecord
    DecodedPayloadRecord --> MissionState
    DecodedPayloadRecord --> AutonomousEdgeMissionFSM
    GeoreferencedDetectionRecord --> _MockMavlinkConsts
    GeoreferencedDetectionRecord --> _MockMavutil
    GeoreferencedDetectionRecord --> CompanionVisionNode
    GeoreferencedDetectionRecord --> TestMilestone2EdgeVisionAndGeoreferencing
    LocalPersistenceManager --> _MockMavlinkConsts
    LocalPersistenceManager --> _MockMavutil
    LocalPersistenceManager --> CompanionVisionNode
    LocalPersistenceManager --> MissionState
    LocalPersistenceManager --> AutonomousEdgeMissionFSM
    LocalPersistenceManager --> TestDroneCoreEdgeMission
    LocalPersistenceManager --> TestMilestone2EdgeVisionAndGeoreferencing
    QRCandidateTracker --> TestPhase4VisionPerception
    QRDetectionResult --> _MockMavlinkConsts
    QRDetectionResult --> _MockMavutil
    QRDetectionResult --> CompanionVisionNode
    QRDetectionResult --> TestMilestone2EdgeVisionAndGeoreferencing
    QRDetectionResult --> TestPhase4VisionPerception
    WeChatQRDetector --> _MockMavlinkConsts
    WeChatQRDetector --> _MockMavutil
    WeChatQRDetector --> CompanionVisionNode
    WeChatQRDetector --> TestMilestone2EdgeVisionAndGeoreferencing
    WeChatQRDetector --> TestPhase4VisionPerception
    CoverageStatus --> HeatmapEngine
    LayerACoverageStatus --> HeatmapEngine
    LayerACoverageStatus --> TestPhase4VisionPerception
    LayerBObstacleStatus --> HeatmapEngine
    LayerBObstacleStatus --> TestPhase4VisionPerception
    LayerCTargetStatus --> HeatmapEngine
    LayerCTargetStatus --> TestPhase4VisionPerception
    SpatialCell --> HeatmapEngine
    SpatialCell --> TestPhase4VisionPerception
    SpatialGrid --> HeatmapEngine
    SpatialGrid --> TestPhase4VisionPerception
    TargetStatus --> HeatmapEngine
    CameraState --> CapturedFrame
    CameraState --> TestPhase4VisionPerception
    CapturedFrame --> CapturedFrame
    FrameQualityMetrics --> CapturedFrame
    FrameQualityMetrics --> TestPhase4VisionPerception
    SmartphoneCameraConfig --> _MockMavlinkConsts
    SmartphoneCameraConfig --> _MockMavutil
    SmartphoneCameraConfig --> CompanionVisionNode
    SmartphoneCameraConfig --> CapturedFrame
    SmartphoneCameraConfig --> TestPhase4VisionPerception
    SmartphoneStreamPipeline --> _MockMavlinkConsts
    SmartphoneStreamPipeline --> _MockMavutil
    SmartphoneStreamPipeline --> CompanionVisionNode
    SmartphoneStreamPipeline --> CapturedFrame
    SmartphoneStreamPipeline --> TestPhase4VisionPerception
    StreamSourceType --> CapturedFrame
    StreamSourceType --> TestPhase4VisionPerception
    TargetManager --> HeatmapEngine
    TargetRecord --> HeatmapEngine
    TargetRecord --> ReconStage
    TelemetrySnapshot --> _MockMavlinkConsts
    TelemetrySnapshot --> _MockMavutil
    TelemetrySnapshot --> CompanionVisionNode
    TelemetrySnapshot --> TestMilestone2EdgeVisionAndGeoreferencing
    TelemetrySnapshot --> TestPhase4VisionPerception
    TelemetrySyncBuffer --> _MockMavlinkConsts
    TelemetrySyncBuffer --> _MockMavutil
    TelemetrySyncBuffer --> CompanionVisionNode
    TelemetrySyncBuffer --> TestMilestone2EdgeVisionAndGeoreferencing
    TelemetrySyncBuffer --> TestPhase4VisionPerception
    TimeSynchronizationService --> TestPhase4VisionPerception
    TimeSyncStatus --> TestPhase4VisionPerception
    TestDroneCoreEdgeMission --> TelemetryState
    TestDroneCoreEdgeMission --> MockAutopilot
    TestDroneCoreEdgeMission --> CameraIntrinsics
    TestDroneCoreEdgeMission --> EdgeMissionConfig
    TestDroneCoreEdgeMission --> MissionState
    TestDroneCoreEdgeMission --> AutonomousEdgeMissionFSM
    TestDroneCoreEdgeMission --> PinholeTargetResolver
    TestDroneCoreEdgeMission --> LocalPersistenceManager
    TestMilestone2EdgeVisionAndGeoreferencing --> BrakingKinematics
    TestMilestone2EdgeVisionAndGeoreferencing --> BrakeController
    TestMilestone2EdgeVisionAndGeoreferencing --> CompanionVisionNode
    TestMilestone2EdgeVisionAndGeoreferencing --> CameraIntrinsics3D
    TestMilestone2EdgeVisionAndGeoreferencing --> GeoreferenceResult
    TestMilestone2EdgeVisionAndGeoreferencing --> Georeferencer
    TestMilestone2EdgeVisionAndGeoreferencing --> GeoreferencedDetectionRecord
    TestMilestone2EdgeVisionAndGeoreferencing --> LocalPersistenceManager
    TestMilestone2EdgeVisionAndGeoreferencing --> QRDetectionResult
    TestMilestone2EdgeVisionAndGeoreferencing --> WeChatQRDetector
    TestMilestone2EdgeVisionAndGeoreferencing --> TelemetrySnapshot
    TestMilestone2EdgeVisionAndGeoreferencing --> TelemetrySyncBuffer
    TestMilestone2EdgeVisionAndGeoreferencing --> V4L2Config
    TestMilestone2EdgeVisionAndGeoreferencing --> CapturedFrame
    TestMilestone2EdgeVisionAndGeoreferencing --> V4L2CapturePipeline
    TestPhase4VisionPerception --> MockAutopilot
    TestPhase4VisionPerception --> MissionState
    TestPhase4VisionPerception --> AutonomousEdgeMissionFSM
    TestPhase4VisionPerception --> GeorefHonestyLevel
    TestPhase4VisionPerception --> CameraIntrinsics3D
    TestPhase4VisionPerception --> GeoreferenceResult
    TestPhase4VisionPerception --> Georeferencer
    TestPhase4VisionPerception --> HeatmapEngine
    TestPhase4VisionPerception --> QRDetectionResult
    TestPhase4VisionPerception --> QRCandidateTracker
    TestPhase4VisionPerception --> WeChatQRDetector
    TestPhase4VisionPerception --> LayerACoverageStatus
    TestPhase4VisionPerception --> LayerBObstacleStatus
    TestPhase4VisionPerception --> LayerCTargetStatus
    TestPhase4VisionPerception --> SpatialCell
    TestPhase4VisionPerception --> SpatialGrid
    TestPhase4VisionPerception --> CameraState
    TestPhase4VisionPerception --> StreamSourceType
    TestPhase4VisionPerception --> FrameQualityMetrics
    TestPhase4VisionPerception --> SmartphoneCameraConfig
    TestPhase4VisionPerception --> SmartphoneStreamPipeline
    TestPhase4VisionPerception --> TimeSyncStatus
    TestPhase4VisionPerception --> TelemetrySnapshot
    TestPhase4VisionPerception --> TimeSynchronizationService
    TestPhase4VisionPerception --> TelemetrySyncBuffer
    CapturedFrame --> _MockMavlinkConsts
    CapturedFrame --> _MockMavutil
    CapturedFrame --> CompanionVisionNode
    CapturedFrame --> CapturedFrame
    CapturedFrame --> CameraState
    CapturedFrame --> StreamSourceType
    CapturedFrame --> FrameQualityMetrics
    CapturedFrame --> SmartphoneCameraConfig
    CapturedFrame --> SmartphoneStreamPipeline
    CapturedFrame --> TestMilestone2EdgeVisionAndGeoreferencing
    V4L2CapturePipeline --> _MockMavlinkConsts
    V4L2CapturePipeline --> _MockMavutil
    V4L2CapturePipeline --> CompanionVisionNode
    V4L2CapturePipeline --> TestMilestone2EdgeVisionAndGeoreferencing
    V4L2Config --> _MockMavlinkConsts
    V4L2Config --> _MockMavutil
    V4L2Config --> CompanionVisionNode
    V4L2Config --> TestMilestone2EdgeVisionAndGeoreferencing
    DecodeResult --> EdgeMissionConfig
    DecodeResult --> MissionState
    DecodeResult --> AutonomousEdgeMissionFSM
    OnboardVisionEngine --> EdgeMissionConfig
    OnboardVisionEngine --> MissionState
    OnboardVisionEngine --> AutonomousEdgeMissionFSM
    VisionCandidate --> EdgeMissionConfig
    VisionCandidate --> MissionState
    VisionCandidate --> AutonomousEdgeMissionFSM
```

## Relationships

- [[Community 1]] (1141 shared connections)
- [[Community 5]] (231 shared connections)
- [[Community 2]] (45 shared connections)
- [[Community 4]] (22 shared connections)
- [[Community 3]] (12 shared connections)
- [[Community 11]] (6 shared connections)
- [[Community 17]] (3 shared connections)
- [[Community 57]] (1 shared connections)

## Source Files

- [C:\Antigravityyyyy\pydrone\Skycon_upgrade\backend\mavlink_multiplexer.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/mavlink_multiplexer.py)
- [backend\autopilot.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/autopilot.py)
- [backend\brake_controller.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/brake_controller.py)
- [backend\companion_vision_node.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/companion_vision_node.py)
- [backend\config.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/config.py)
- [backend\drone_config.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/drone_config.py)
- [backend\fsm.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/fsm.py)
- [backend\georeferencing.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/georeferencing.py)
- [backend\heatmap_engine.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/heatmap_engine.py)
- [backend\localization.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/localization.py)
- [backend\main.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/main.py)
- [backend\mavlink_multiplexer.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/mavlink_multiplexer.py)
- [backend\observation_manager.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/observation_manager.py)
- [backend\persistence.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/persistence.py)
- [backend\qr_detector.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/qr_detector.py)
- [backend\server.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/server.py)
- [backend\spatial_grid.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/spatial_grid.py)
- [backend\stream_capture.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/stream_capture.py)
- [backend\system_health.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/system_health.py)
- [backend\target_manager.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/target_manager.py)

## Audit Trail

- EXTRACTED: 1429 (31%)
- INFERRED: 3196 (69%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*