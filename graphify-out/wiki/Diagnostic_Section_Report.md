# Diagnostic Section Report

> 43 nodes

## Key Concepts

- [S500DiagnosticEngine](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/scripts/diagnostic_engine.py#L40) (24 connections)
- [.execute_complete_diagnostics()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/scripts/diagnostic_engine.py#L1002) (18 connections)
- [.add_check()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/scripts/diagnostic_engine.py#L112) (14 connections)
- [.run_section_7_arming()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/scripts/diagnostic_engine.py#L656) (5 connections)
- [.run_section_8_geofence()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/scripts/diagnostic_engine.py#L711) (5 connections)
- [.scan_and_connect()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/scripts/diagnostic_engine.py#L160) (4 connections)
- [.run_section_1_fc_overview()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/scripts/diagnostic_engine.py#L306) (4 connections)
- [.run_section_2_mavlink()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/scripts/diagnostic_engine.py#L365) (4 connections)
- [.run_section_3_gps()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/scripts/diagnostic_engine.py#L408) (4 connections)
- [.run_section_4_compass()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/scripts/diagnostic_engine.py#L482) (4 connections)
- [.run_section_5_imu_ekf()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/scripts/diagnostic_engine.py#L543) (4 connections)
- [.run_section_6_flight_mode()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/scripts/diagnostic_engine.py#L608) (4 connections)
- [.run_section_9_mission()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/scripts/diagnostic_engine.py#L811) (4 connections)
- [.run_section_10_backend_frontend()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/scripts/diagnostic_engine.py#L856) (4 connections)
- [.run_section_11_error_logs()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/scripts/diagnostic_engine.py#L889) (4 connections)
- [.collect_live_telemetry()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/scripts/diagnostic_engine.py#L204) (3 connections)
- [.query_key_parameters()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/scripts/diagnostic_engine.py#L269) (3 connections)
- [.synthesize_core_answers()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/scripts/diagnostic_engine.py#L906) (3 connections)
- [.compute_summary_health()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/scripts/diagnostic_engine.py#L984) (3 connections)
- [.export_json()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/scripts/diagnostic_engine.py#L1048) (2 connections)
- [diagnostic_engine.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/diagnostic_engine.py#L1) (1 connections)
- [.__init__()](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/scripts/diagnostic_engine.py#L45) (1 connections)
- [Authoritative Diagnostic Engine for Pixhawk 2.4.8 & S500 Autonomous Quadcopter.](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/scripts/diagnostic_engine.py#L41) (1 connections)
- [Record an individual diagnostic check result.](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/scripts/diagnostic_engine.py#L123) (1 connections)
- [Attempt connection to Pixhawk via auto-detected COM port or configured target.](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/scripts/diagnostic_engine.py#L161) (1 connections)
- *... and 18 more nodes in this community*

## Class Diagram

```mermaid
classDiagram
    class S500DiagnosticEngine {
        +diagnostic_engine.py()
        +.__init__()
        +.add_check()
        +.scan_and_connect()
        +.collect_live_telemetry()
        +.query_key_parameters()
        +.run_section_1_fc_overview()
        +.run_section_2_mavlink()
        +.run_section_3_gps()
        +.run_section_4_compass()
    }
```

## Relationships

- [[Get Status Sync]] (2 shared connections)
- [[Coordinate Validator Coverage]] (2 shared connections)
- [[256 Token Pbkdf2]] (1 shared connections)

## Source Files

- [backend\diagnostic_engine.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/diagnostic_engine.py)
- [scripts\diagnostic_engine.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/scripts/diagnostic_engine.py)

## Audit Trail

- EXTRACTED: 139 (97%)
- INFERRED: 4 (3%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*