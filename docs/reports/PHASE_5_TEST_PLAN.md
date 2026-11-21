# SKYCON Phase 5 Test Plan
**Autonomous Mission Planning, Navigation, Scan-Path Generation & Flight Execution**
**Project**: SAE INDIA Autonomous Drone Development Challenge (ADDC 2026)
**Companion Computer**: Raspberry Pi 4 Model B | **Flight Controller**: Pixhawk 2.4.8 (ArduCopter 4.x)
**Date**: 2026-11-21
**Author**: Senior UAV Test & Mission Verification Engineer

---

## 1. Test Plan Overview & Objectives

The Phase 5 test plan validates the end-to-end autonomous mission planning, route feasibility validation, MAVLink mission transfer protocol, and the **official 12-stage ADDC 2026 competition state machine**—including the **4-digit access code combination workflow** (aerial QR + ground puzzle) and cache retrieval verification.

The testing regime ensures:
1. Mathematical precision and boundary containment for boustrophedon scan-path generation.
2. Complete kinematic and budget validation against the strict 300-second competition limit.
3. Robust binary MAVLink mission upload protocol compliance with ArduCopter 4.x.
4. Deterministic progression across all 12 ADDC competition stages with strict authorization gates.
5. Zero regressions across the existing 67 unit and integration tests from Phases 1–4.

---

## 2. Test Architecture & Environmental Conditions

Testing is executed in an automated, headless test environment using Python's standard `unittest` framework:
- **Platform**: Python 3.10+ / 3.13 on host development machine.
- **Hardware Abstraction**:
  - `MockAutopilot` and simulated MAVLink channel simulate Pixhawk 2.4.8 responses.
  - In absence of live serial UART, the test harness exercises the binary MAVLink protocol loopback in `SIMULATION` mode.
  - Physical motors are NOT attached; `ALLOW_PHYSICAL_ARMING = False` is strictly enforced.
- **Deterministic Clocks**: Monotonic time offsets and simulated telemetry ticks verify real-time watchdogs without non-deterministic wall-clock sleeps.

---

## 3. Dedicated Phase 5 Test Matrix (`tests/test_phase5_mission_navigation.py`)

| Test ID | Test Name | Target Module | Scope & Verification Criteria |
| :---: | :--- | :--- | :--- |
| **P5-T01** | `test_01_sensor_footprint_and_lane_spacing` | `backend/coverage_planner.py` | Verify ground footprint width/height calculation for iPhone camera at $10\text{m}$ and $12\text{m}$ AGL with $25\%$ overlap. |
| **P5-T02** | `test_02_boustrophedon_circular_boundary` | `backend/coverage_planner.py` | Generate boustrophedon scan lines for circular search area ($R=15\text{m}$); verify all waypoints lie within inward-buffered boundary. |
| **P5-T03** | `test_03_boustrophedon_polygon_boundary` | `backend/coverage_planner.py` | Generate boustrophedon sweep for arbitrary convex/concave polygon; verify lead-in/lead-out turn points and lane sequencing. |
| **P5-T04** | `test_04_route_validator_boundary_enclosure` | `backend/route_validator.py` | Verify that waypoints outside geofence boundary or exceeding altitude ceiling ($> 25\text{m}$) are strictly rejected. |
| **P5-T05** | `test_05_route_validator_budget_and_feasibility` | `backend/route_validator.py` | Validate distance, flight speed, turn penalty, and flight duration budget ($< 300\text{s}$) estimation. |
| **P5-T06** | `test_06_mavlink_mission_transfer_protocol` | `backend/mavlink_multiplexer.py` | Verify `MISSION_CLEAR_ALL`, `MISSION_COUNT`, `MISSION_REQUEST_INT`, `MISSION_ITEM_INT`, and `MISSION_ACK` binary message exchange. |
| **P5-T07** | `test_07_mavlink_active_waypoint_tracking` | `backend/mavlink_multiplexer.py` | Verify reception of `MISSION_CURRENT` and waypoint sequence index tracking during flight. |
| **P5-T08** | `test_08_addc_12_stage_fsm_lifecycle` | `backend/mission_engine.py` | Step through all 12 ADDC competition stages from Marshal Auth to Landing; verify valid transitions and invalid transition rejections. |
| **P5-T09** | `test_09_four_digit_access_code_workflow` | `backend/mission_engine.py` | Ingest verified 2-digit aerial QR (`"42"`), submit 2-digit ground puzzle (`"89"`), verify combined 4-digit code (`"4289"`), confirm unlock and retrieval. |
| **P5-T10** | `test_10_competition_300s_watchdog_timeout` | `backend/mission_engine.py` | Simulate competition clock expiration ($300\text{s}$ elapsed); verify automatic safe transition to `RETURNING` (RTL). |
| **P5-T11** | `test_11_geofence_breach_and_emergency_interlocks` | `backend/mission_engine.py` | Simulate real-time GPS coordinate breaching geofence; verify immediate companion-level failsafe RTL trigger. |
| **P5-T12** | `test_12_rest_api_navigation_and_mission_endpoints` | `backend/server.py`, `backend/main.py` | Verify canonical REST endpoints for plan generation, validation, mission upload, stage transitions, and puzzle input. |

---

## 4. Acceptance Criteria

1. **Mathematical Accuracy**: Footprint calculations match optical pinhole equations within $< 1\text{mm}$.
2. **Boundary Safety**: Zero waypoints generated outside the specified geofence boundary.
3. **Protocol Integrity**: MAVLink mission transfer packets strictly match MAVLink v2 binary framing (`0xFD`, CRC-16 extra).
4. **ADDC Rulebook Compliance**: Full 12-stage mission lifecycle with 4-digit puzzle combination must be tested and proven.
5. **Zero Regressions**: 100% pass rate across all 67 prior tests and all 12 Phase 5 tests.
