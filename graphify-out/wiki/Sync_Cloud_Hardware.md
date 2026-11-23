# Sync Cloud Hardware

> 157 nodes

## Key Concepts

- [CloudSyncService](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/cloud_sync.py#L35) (59 connections)
- [NetworkManager](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/network_manager.py#L65) (39 connections)
- [HardwareVerificationService](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/hardware_verification.py#L48) (37 connections)
- [SubsystemHealth](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/hardware_verification.py#L40) (28 connections)
- [.probe_network()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/network_manager.py#L347) (15 connections)
- [TestMobileHotspotAndReconnection](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/tests/test_wifi_hotspot_reconnect.py#L23) (15 connections)
- [.generate_full_audit()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/hardware_verification.py#L403) (12 connections)
- [TestPhase6HardwareVerification](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/tests/test_phase6_system_integration.py#L36) (12 connections)
- [TestPhase6RestEndpoints](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/tests/test_phase6_system_integration.py#L165) (11 connections)
- [.configure_hotspot_profile()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/network_manager.py#L653) (10 connections)
- [TestPhase6CloudSynchronization](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/tests/test_phase6_system_integration.py#L114) (10 connections)
- [._save_profiles()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/network_manager.py#L186) (8 connections)
- [._trigger_multi_hotspot_failover()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/network_manager.py#L424) (8 connections)
- [._check_wifi_interface()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/network_manager.py#L506) (8 connections)
- [.export_report_to_disk()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/hardware_verification.py#L446) (7 connections)
- [.get_active_profile()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/network_manager.py#L231) (7 connections)
- [TestPhase6EndToEndMissionFlow](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/tests/test_phase6_system_integration.py#L233) (7 connections)
- [Execute full ADDC 2026 12-stage mission cycle.](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/tests/test_phase6_system_integration.py#L240) (7 connections)
- [Verify hotspot configuration sanitizes input, never exposes password, and sets c](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/tests/test_wifi_hotspot_reconnect.py#L221) (7 connections)
- [TestCloudRecoveryValidation](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/tests/validation/test_cloud_recovery.py#L21) (7 connections)
- [.audit_pixhawk_connection()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/hardware_verification.py#L219) (6 connections)
- [._load_profiles()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/network_manager.py#L141) (6 connections)
- [._evaluate_hysteresis_switch()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/network_manager.py#L456) (6 connections)
- [Removes a configured hotspot profile.](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/network_manager.py#L734) (6 connections)
- [hardware_verification.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/hardware_verification.py#L1) (5 connections)
- *... and 132 more nodes in this community*

## Class Diagram

```mermaid
classDiagram
    class CloudSyncService {
        +cloud_sync.py()
        +.__init__()
        +.start()
        +.stop()
        +.get_status()
        +._sync_loop()
        +.trigger_sync_now()
        +._perform_sync_cycle()
        +._execute_cloud_commands()
        +._build_sync_payload()
    }
    class SubsystemHealth {
        +hardware_verification.py()
    }
    class HardwareVerificationService {
        +hardware_verification.py()
        +.__init__()
        +.audit_power_and_thermals()
        +.audit_platform()
        +.audit_pixhawk_connection()
        +.audit_multilink_rc()
        +.audit_camera_pipeline()
        +.audit_cellular_and_network()
        +.generate_full_audit()
        +.export_report_to_disk()
    }
    class NetworkManager {
        +network_manager.py()
        +.__init__()
        +._load_profiles()
        +._save_profiles()
        +._save_secret()
        +._get_secret()
        +.get_active_profile()
        +.start()
        +.stop()
        +.get_status()
    }
    class TestPhase6HardwareVerification {
        +test_phase6_system_integration.py()
        +.setUp()
        +.test_01_platform_audit()
        +.test_02_vcgencmd_bitmask_parsing()
        +.test_03_pixhawk_connection_audit()
        +.test_04_multilink_rc_audit()
        +.test_05_camera_pipeline_audit()
        +.test_06_diagnostic_export_to_disk()
    }
    class TestPhase6CloudSynchronization {
        +test_phase6_system_integration.py()
        +.setUp()
        +.test_07_cloud_sync_status()
        +.test_08_payload_generation()
        +.test_09_offline_spooling_and_deduplication()
        +.test_10_airgap_flight_safety_invariant()
    }
    class TestPhase6RestEndpoints {
        +test_phase6_system_integration.py()
        +.setUp()
        +.test_11_fastapi_diagnostics_hardware()
        +.test_12_fastapi_diagnostics_export()
        +.test_13_fastapi_cloud_sync_status()
        +.test_14_fastapi_cloud_receiver_endpoints()
        +.test_15_flask_diagnostics_endpoints()
    }
    class TestPhase6EndToEndMissionFlow {
        +test_phase6_system_integration.py()
        +.setUp()
        +.test_16_complete_12_stage_addc_workflow()
    }
    class TestMobileHotspotAndReconnection {
        +test_wifi_hotspot_reconnect.py()
        +.setUp()
        +.tearDown()
        +.test_01_and_02_pi_connects_to_hotspot_and_obtains_internet()
        +.test_03_and_04_cloud_heartbeat_and_gcs_online_status()
        +.test_05_and_06_hotspot_off_and_gcs_disconnection_display()
        +.test_07_pi_continues_local_services_during_outage()
        +.test_08_and_09_hotspot_on_and_automatic_reconnection()
        +.test_10_and_11_cloud_heartbeat_resumes_and_spool_drains()
        +.test_12_laptop_accesses_gcs_from_different_network()
    }
    class TestCloudRecoveryValidation {
        +test_cloud_recovery.py()
        +.setUp()
        +.test_01_offline_spooling_on_network_loss()
        +.test_02_exponential_backoff_rate_limiting()
        +.test_03_air_gapped_flight_safety_verification()
    }
    CloudSyncService --> TestPhase6HardwareVerification
    CloudSyncService --> TestPhase6CloudSynchronization
    CloudSyncService --> TestPhase6RestEndpoints
    CloudSyncService --> TestPhase6EndToEndMissionFlow
    CloudSyncService --> TestMobileHotspotAndReconnection
    CloudSyncService --> TestCloudRecoveryValidation
    SubsystemHealth --> TestPhase6HardwareVerification
    SubsystemHealth --> TestPhase6CloudSynchronization
    SubsystemHealth --> TestPhase6RestEndpoints
    SubsystemHealth --> TestPhase6EndToEndMissionFlow
    HardwareVerificationService --> TestPhase6HardwareVerification
    HardwareVerificationService --> TestPhase6CloudSynchronization
    HardwareVerificationService --> TestPhase6RestEndpoints
    HardwareVerificationService --> TestPhase6EndToEndMissionFlow
    NetworkManager --> TestMobileHotspotAndReconnection
    TestPhase6HardwareVerification --> CloudSyncService
    TestPhase6HardwareVerification --> SubsystemHealth
    TestPhase6HardwareVerification --> HardwareVerificationService
    TestPhase6CloudSynchronization --> CloudSyncService
    TestPhase6CloudSynchronization --> SubsystemHealth
    TestPhase6CloudSynchronization --> HardwareVerificationService
    TestPhase6RestEndpoints --> CloudSyncService
    TestPhase6RestEndpoints --> SubsystemHealth
    TestPhase6RestEndpoints --> HardwareVerificationService
    TestPhase6EndToEndMissionFlow --> CloudSyncService
    TestPhase6EndToEndMissionFlow --> SubsystemHealth
    TestPhase6EndToEndMissionFlow --> HardwareVerificationService
    TestMobileHotspotAndReconnection --> CloudSyncService
    TestMobileHotspotAndReconnection --> NetworkManager
    TestCloudRecoveryValidation --> CloudSyncService
```

## Relationships

- [[Get Status Sync]] (45 shared connections)
- [[Coordinate Validator Coverage]] (27 shared connections)
- [[Currentrole List Roles]] (12 shared connections)
- [[Autonomous Mission & Flight Engine]] (6 shared connections)
- [[256 Token Pbkdf2]] (6 shared connections)
- [[Test Suites & MAVLink Simulation]] (4 shared connections)
- [[Command Rtl Position]] (3 shared connections)
- [[Flight Phase Boundaries]] (2 shared connections)
- [[Repository Connect Intelligence]] (2 shared connections)

## Source Files

- [backend\cloud_sync.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/cloud_sync.py)
- [backend\hardware_verification.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/hardware_verification.py)
- [backend\network_manager.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/network_manager.py)
- [backend\server.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/server.py)
- [tests\test_phase6_system_integration.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/tests/test_phase6_system_integration.py)
- [tests\test_wifi_hotspot_reconnect.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/tests/test_wifi_hotspot_reconnect.py)
- [tests\validation\test_cloud_recovery.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/tests/validation/test_cloud_recovery.py)

## Audit Trail

- EXTRACTED: 392 (56%)
- INFERRED: 307 (44%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*