# Coordinate Validator Coverage

> 293 nodes

## Key Concepts

- [CoveragePlanner](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/coverage_planner.py#L100) (107 connections)
- [QRCandidateState](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/qr_detector.py#L42) (81 connections)
- [CoordinateQualityState](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/coordinate_validator.py#L41) (78 connections)
- [ValidatedCoordinate](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/coordinate_validator.py#L58) (78 connections)
- [NetworkState](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/network_manager.py#L41) (77 connections)
- [CoordinatePackage](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/coordinate_package.py#L34) (72 connections)
- [server.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/server.py#L1) (69 connections)
- [ValidationDecision](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/coordinate_validator.py#L50) (38 connections)
- [TestHybridConnectivityAndAutonomy](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/tests/test_hybrid_connectivity.py#L64) (31 connections)
- [HotspotProfile](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/network_manager.py#L50) (28 connections)
- [GridCell](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/coverage_tracker.py#L29) (26 connections)
- [Resets local cell coverage tracker for a new sortie.](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/server.py#L1123) (23 connections)
- [TestPhase5MissionNavigation](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/tests/test_phase5_mission_navigation.py#L57) (21 connections)
- [CoverageTracker](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/coverage_tracker.py#L44) (20 connections)
- [CoveragePlanResult](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/coverage_planner.py#L76) (18 connections)
- [RouteValidator](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/route_validator.py#L92) (18 connections)
- [.validate_plan()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/route_validator.py#L118) (18 connections)
- [.validate_coordinate()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/coordinate_validator.py#L121) (17 connections)
- [.plan_circular_coverage()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/coverage_planner.py#L129) (16 connections)
- [.plan_polygon_coverage()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/coverage_planner.py#L201) (16 connections)
- [ObservationManager](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/observation_manager.py#L45) (16 connections)
- [haversine_distance()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/route_validator.py#L23) (11 connections)
- [Verifies Flask endpoints (PythonAnywhere WSGI compatibility) respond cleanly.](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/tests/test_hybrid_connectivity.py#L419) (11 connections)
- [CoordinatePackageManager](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/coordinate_package.py#L66) (10 connections)
- [.receive_and_validate_package()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/coordinate_package.py#L103) (10 connections)
- *... and 268 more nodes in this community*

## Class Diagram

```mermaid
classDiagram
    class CoordinatePackage {
        +coordinate_package.py()
        +.calculate_payload_hash()
        +.to_dict()
    }
    class CoordinatePackageManager {
        +coordinate_package.py()
        +.__init__()
        +.create_package()
        +.receive_and_validate_package()
        +.to_mavlink_mission_items()
        +._persist_package()
    }
    class CoordinateQualityState {
        +coordinate_validator.py()
    }
    class ValidationDecision {
        +coordinate_validator.py()
    }
    class ValidatedCoordinate {
        +coordinate_validator.py()
        +.to_dict()
    }
    class CoordinateValidator {
        +coordinate_validator.py()
        +.__init__()
        +.validate_coordinate()
    }
    class CoveragePlanResult {
        +coverage_planner.py()
        +.to_dict()
    }
    class CoveragePlanner {
        +coverage_planner.py()
        +.__init__()
        +.compute_sensor_footprint()
        +.plan_circular_coverage()
        +.plan_polygon_coverage()
        +._generate_boustrophedon_circle()
        +._generate_spiral_circle()
        +._generate_boustrophedon_polygon()
        +._shrink_polygon_metric()
        +._build_full_flight_plan()
    }
    class GridCell {
        +coverage_tracker.py()
        +.to_dict()
    }
    class CoverageTracker {
        +coverage_tracker.py()
        +.__init__()
        +.initialize_grid()
        +.update_coverage()
        +.get_status()
        +.reset()
    }
    class NetworkState {
        +network_manager.py()
    }
    class HotspotProfile {
        +network_manager.py()
        +.to_dict()
    }
    class ObservationManager {
        +observation_manager.py()
        +.__init__()
        +.configure_mission()
        +.start_stage_a()
        +.process_flight_telemetry()
        +.process_visual_observation()
        +.complete_stage_a_and_prepare_stage_b()
        +.start_stage_b()
        +.get_recon_status_summary()
        +._is_within_approved_boundary()
    }
    class QRCandidateState {
        +qr_detector.py()
    }
    class ValidationIssue {
        +route_validator.py()
        +.to_dict()
    }
    class RouteValidationResult {
        +route_validator.py()
        +.to_dict()
    }
    class RouteValidator {
        +route_validator.py()
        +.__init__()
        +.validate_plan()
        +.validate_search_boundary()
    }
    class TestCircleSearchMission {
        +test_circle_search_mission.py()
        +.setUp()
        +.test_01_circle_inside_geofence_validates_successfully()
        +.test_02_circle_exceeding_geofence_displays_clear_error()
        +.test_03_altitude_exceeding_ceiling_rejected()
        +.test_04_circle_search_pattern_generation_validates_coordinates()
        +.test_05_mission_engine_configure_and_start()
        +.test_06_mavlink_mux_simulated_mission_upload()
    }
    class TestHybridConnectivityAndAutonomy {
        +test_hybrid_connectivity.py()
        +.setUp()
        +.tearDown()
        +.test_01_multi_hotspot_priority_sorting()
        +.test_02_zero_credential_exposure_in_apis_and_logs()
        +.test_03_sequential_failover_primary_to_secondary()
        +.test_04_sequential_failover_secondary_to_backup_and_wrap()
        +.test_05_connection_hysteresis_guards_against_thrashing()
        +.test_06_high_confidence_coordinate_approval()
        +.test_07_null_island_coordinate_rejection()
    }
    class TestPhase5MissionNavigation {
        +test_phase5_mission_navigation.py()
        +.setUp()
        +.test_01_sensor_footprint_and_lane_spacing()
        +.test_02_boustrophedon_circular_boundary()
        +.test_03_boustrophedon_polygon_boundary()
        +.test_04_route_validator_boundary_enclosure()
        +.test_05_route_validator_budget_and_feasibility()
        +.test_06_mavlink_mission_transfer_protocol()
        +.test_07_mavlink_active_waypoint_tracking()
        +.test_08_addc_12_stage_fsm_lifecycle()
    }
    class TestMissionExecutionValidation {
        +test_mission_execution.py()
        +.setUp()
        +.test_01_boustrophedon_coverage_generation()
        +.test_02_concentric_circular_scan_generation()
        +.test_03_competition_300s_budget_enforcement()
    }
    CoordinatePackage --> ValidatedCoordinate
    CoordinatePackage --> CoordinateQualityState
    CoordinatePackage --> ValidationDecision
    CoordinatePackage --> TestHybridConnectivityAndAutonomy
    CoordinatePackageManager --> ValidatedCoordinate
    CoordinatePackageManager --> CoordinateQualityState
    CoordinatePackageManager --> ValidationDecision
    CoordinateQualityState --> CoordinatePackage
    CoordinateQualityState --> CoordinatePackageManager
    CoordinateQualityState --> RouteValidator
    CoordinateQualityState --> TestHybridConnectivityAndAutonomy
    ValidationDecision --> CoordinatePackage
    ValidationDecision --> CoordinatePackageManager
    ValidationDecision --> RouteValidator
    ValidationDecision --> TestHybridConnectivityAndAutonomy
    ValidatedCoordinate --> CoordinatePackage
    ValidatedCoordinate --> CoordinatePackageManager
    ValidatedCoordinate --> RouteValidator
    ValidatedCoordinate --> TestHybridConnectivityAndAutonomy
    CoordinateValidator --> RouteValidator
    CoveragePlanResult --> ObservationManager
    CoveragePlanResult --> TestPhase5MissionNavigation
    CoveragePlanner --> ObservationManager
    CoveragePlanner --> TestCircleSearchMission
    CoveragePlanner --> TestPhase5MissionNavigation
    CoveragePlanner --> TestMissionExecutionValidation
    GridCell --> TestHybridConnectivityAndAutonomy
    CoverageTracker --> ObservationManager
    NetworkState --> TestHybridConnectivityAndAutonomy
    HotspotProfile --> TestHybridConnectivityAndAutonomy
    ObservationManager --> CoveragePlanResult
    ObservationManager --> CoveragePlanner
    ObservationManager --> CoverageTracker
    RouteValidationResult --> TestPhase5MissionNavigation
    RouteValidator --> CoordinateQualityState
    RouteValidator --> ValidationDecision
    RouteValidator --> ValidatedCoordinate
    RouteValidator --> CoordinateValidator
    RouteValidator --> TestPhase5MissionNavigation
    TestCircleSearchMission --> CoveragePlanner
    TestHybridConnectivityAndAutonomy --> CoordinatePackage
    TestHybridConnectivityAndAutonomy --> CoordinateQualityState
    TestHybridConnectivityAndAutonomy --> ValidationDecision
    TestHybridConnectivityAndAutonomy --> ValidatedCoordinate
    TestHybridConnectivityAndAutonomy --> GridCell
    TestHybridConnectivityAndAutonomy --> NetworkState
    TestHybridConnectivityAndAutonomy --> HotspotProfile
    TestPhase5MissionNavigation --> CoveragePlanResult
    TestPhase5MissionNavigation --> CoveragePlanner
    TestPhase5MissionNavigation --> RouteValidationResult
    TestPhase5MissionNavigation --> RouteValidator
    TestMissionExecutionValidation --> CoveragePlanner
```

## Relationships

- [[Test Suites & MAVLink Simulation]] (104 shared connections)
- [[Get Status Sync]] (85 shared connections)
- [[Currentrole List Roles]] (38 shared connections)
- [[Sync Cloud Hardware]] (27 shared connections)
- [[Command Rtl Position]] (16 shared connections)
- [[Autonomous Mission & Flight Engine]] (4 shared connections)
- [[256 Token Pbkdf2]] (3 shared connections)
- [[Flight Phase Boundaries]] (3 shared connections)
- [[Diagnostic Section Report]] (2 shared connections)
- [[Repository Connect Intelligence]] (1 shared connections)
- [[Prearm Pre Arm]] (1 shared connections)

## Source Files

- [backend\coordinate_package.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/coordinate_package.py)
- [backend\coordinate_validator.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/coordinate_validator.py)
- [backend\coverage_planner.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/coverage_planner.py)
- [backend\coverage_tracker.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/coverage_tracker.py)
- [backend\network_manager.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/network_manager.py)
- [backend\observation_manager.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/observation_manager.py)
- [backend\qr_detector.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/qr_detector.py)
- [backend\route_validator.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/route_validator.py)
- [backend\server.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/server.py)
- [frontend\src\components\common\ControlModePanel.tsx](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/frontend/src/components/common/ControlModePanel.tsx)
- [tests\test_circle_search_mission.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/tests/test_circle_search_mission.py)
- [tests\test_hybrid_connectivity.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/tests/test_hybrid_connectivity.py)
- [tests\test_phase5_mission_navigation.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/tests/test_phase5_mission_navigation.py)
- [tests\validation\test_mission_execution.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/tests/validation/test_mission_execution.py)
- [vision_brain\vision_brain.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/vision_brain/vision_brain.py)

## Audit Trail

- EXTRACTED: 684 (34%)
- INFERRED: 1332 (66%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*