# Community 3

> 425 nodes · cohesion 0.01

## Key Concepts

- [main.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/main.py#L1) (101 connections)
- [api_response()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/main.py#L74) (89 connections)
- [server.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/server.py#L1) (69 connections)
- [.load()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/simple_json_store.py#L128) (56 connections)
- [.save()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/simple_json_store.py#L165) (39 connections)
- [.get_status()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/network_manager.py#L269) (35 connections)
- [MissionEngine](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/mission_engine.py#L121) (34 connections)
- [SimpleJsonStore](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/simple_json_store.py#L50) (33 connections)
- [.log_event()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/simple_json_store.py#L269) (27 connections)
- [.transition_to()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/mission_engine.py#L220) (19 connections)
- [.to_dict()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/telemetry_sync.py#L61) (18 connections)
- [.get_state()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/mission_engine.py#L340) (17 connections)
- [TestFailsafeMonitoringValidation](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/tests/validation/test_failsafe_monitoring.py#L25) (17 connections)
- [.handle_qr_detected()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/mission_engine.py#L578) (15 connections)
- [TestPhase2Foundation](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/tests/test_phase2_foundation.py#L33) (15 connections)
- [.update()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/qr_detector.py#L120) (14 connections)
- [validate_strict_two_digit()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/qr_detector.py#L84) (13 connections)
- [compute_sha256()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/simple_json_store.py#L35) (13 connections)
- [.test_01_complete_21_step_e2e_simulation()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/tests/validation/test_system_recovery.py#L34) (13 connections)
- [.set_mode_verified()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/mavlink_multiplexer.py#L1280) (12 connections)
- [SKYCON System — Master Python Test Suite Verifies: 1. SimpleJsonStore atomic p](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/tests/test_skycon_master_suite.py#L1) (12 connections)
- [.get_stats()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/v4l2_capture.py#L263) (12 connections)
- [.set_mode()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/vision_brain/vision_brain.py#L298) (12 connections)
- [._perform_sync_cycle()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/cloud_sync.py#L132) (11 connections)
- [qr_submit()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/main.py#L792) (11 connections)
- *... and 400 more nodes in this community*

## Class Diagram

```mermaid
classDiagram
    class MissionEngine {
        +mission_engine.py()
        +.__init__()
        +._load_persisted_state()
        +._init_spatial_grid()
        +.transition_to()
        +.reset_mission()
        +.get_elapsed_seconds()
        +.get_remaining_seconds()
        +.get_status()
        +.get_state()
    }
    class CandidateRecord {
        +qr_detector.py()
    }
    class FileLock {
        +simple_json_store.py()
        +.__init__()
        +.__enter__()
        +.__exit__()
    }
    class SimpleJsonStore {
        +simple_json_store.py()
        +.__init__()
        +._get_lock()
        +._get_file_lock()
        +._initialize_defaults()
        +.load()
        +.save()
        +.append_bounded()
        +.get_detections()
        +.get_active_mission()
    }
    class SystemHealthService {
        +system_health.py()
        +.__init__()
        +.get_backend_health()
        +.get_storage_health()
        +.get_pixhawk_health()
        +.get_companion_health()
        +.get_camera_health()
        +.get_overall_health()
    }
    class TestFailsafeMonitoringValidation {
        +test_failsafe_monitoring.py()
        +.setUp()
        +.test_01_internet_loss_local_operation()
        +.test_02_cellular_dongle_disconnect()
        +.test_03_pythonanywhere_unavailable()
        +.test_04_camera_disconnect_handling()
        +.test_05_false_qr_detection_filtered()
        +.test_06_mavlink_heartbeat_loss_detection()
        +.test_07_pi_service_crash_recovery()
        +.test_08_pixhawk_reboot_state_handling()
    }
    class TestPhase2Foundation {
        +test_phase2_foundation.py()
        +.setUp()
        +.tearDown()
        +.test_01_application_startup()
        +.test_02_configuration_loading()
        +.test_03_canonical_api_routes_registered()
        +.test_04_authentication_workflow()
        +.test_05_storage_operations_and_bounding()
        +.test_06_schema_versioning_and_checksum()
        +.test_07_error_handling_and_envelope()
    }
    class TestQRWorkflowValidation {
        +test_qr_workflow.py()
        +.setUp()
        +.test_01_strict_two_digit_regex_enforcement()
        +.test_02_four_digit_puzzle_workflow_integration()
        +.test_03_invalid_ground_puzzle_rejection()
    }
    class TestFastApiServer {
        +test_skycon_master_suite.py()
        +.setUp()
        +.test_health_check()
        +.test_telemetry_endpoint()
        +.test_system_health_endpoint()
        +.test_commands()
        +.test_qr_detection_validation()
        +.test_spatial_heatmap_endpoints()
    }
    class TestMavlinkMultiplexer {
        +test_skycon_master_suite.py()
        +.setUp()
        +.test_flight_mode_mappings()
        +.test_command_execution()
    }
    class TestMissionEngine {
        +test_skycon_master_suite.py()
        +.setUp()
        +.test_state_transitions()
        +.test_5_minute_competition_timeline()
        +.test_circular_scan_planner()
        +.test_geofence_breach_detection()
    }
    class TestSimpleJsonStore {
        +test_skycon_master_suite.py()
        +.setUp()
        +.tearDown()
        +.test_atomic_save_and_load()
        +.test_sha256_checksum()
        +.test_auto_healing_from_backup()
        +.test_bounded_mission_history()
    }
    class TestSystemRecoveryValidation {
        +test_system_recovery.py()
        +.setUp()
        +.test_01_complete_21_step_e2e_simulation()
    }
    MissionEngine --> TestSimpleJsonStore
    MissionEngine --> TestMavlinkMultiplexer
    MissionEngine --> TestMissionEngine
    MissionEngine --> TestFastApiServer
    SimpleJsonStore --> TestPhase2Foundation
    SimpleJsonStore --> TestSimpleJsonStore
    SimpleJsonStore --> TestMavlinkMultiplexer
    SimpleJsonStore --> TestMissionEngine
    SimpleJsonStore --> TestFastApiServer
    TestPhase2Foundation --> SimpleJsonStore
    TestFastApiServer --> MissionEngine
    TestFastApiServer --> SimpleJsonStore
    TestMavlinkMultiplexer --> MissionEngine
    TestMavlinkMultiplexer --> SimpleJsonStore
    TestMissionEngine --> MissionEngine
    TestMissionEngine --> SimpleJsonStore
    TestSimpleJsonStore --> MissionEngine
    TestSimpleJsonStore --> SimpleJsonStore
```

## Relationships

- [[Community 4]] (31 shared connections)
- [[Community 1]] (26 shared connections)
- [[Community 2]] (11 shared connections)
- [[Community 10]] (3 shared connections)
- [[Community 5]] (1 shared connections)
- [[Community 17]] (1 shared connections)
- [[Community 11]] (1 shared connections)
- [[Community 14]] (1 shared connections)

## Source Files

- [C:\Antigravityyyyy\pydrone\Skycon_upgrade\backend\mavlink_multiplexer.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/mavlink_multiplexer.py)
- [C:\Antigravityyyyy\pydrone\Skycon_upgrade\backend\mission_engine.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/mission_engine.py)
- [C:\Antigravityyyyy\pydrone\Skycon_upgrade\backend\route_validator.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/route_validator.py)
- [backend\cloud_sync.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/cloud_sync.py)
- [backend\heatmap_engine.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/heatmap_engine.py)
- [backend\main.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/main.py)
- [backend\mission_engine.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/mission_engine.py)
- [backend\network_manager.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/network_manager.py)
- [backend\object_manager.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/object_manager.py)
- [backend\qr_detector.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/qr_detector.py)
- [backend\server.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/server.py)
- [backend\simple_json_store.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/simple_json_store.py)
- [backend\spatial_grid.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/spatial_grid.py)
- [backend\system_health.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/system_health.py)
- [backend\telemetry_sync.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/telemetry_sync.py)
- [backend\v4l2_capture.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/v4l2_capture.py)
- [scripts\agent_status.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/scripts/agent_status.py)
- [tests\test_hybrid_connectivity.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/tests/test_hybrid_connectivity.py)
- [tests\test_phase2_foundation.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/tests/test_phase2_foundation.py)
- [tests\test_phase5_mission_navigation.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/tests/test_phase5_mission_navigation.py)

## Audit Trail

- EXTRACTED: 1266 (62%)
- INFERRED: 791 (38%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*