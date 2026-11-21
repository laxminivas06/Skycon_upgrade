# SKYCON Phase 3 Test Plan
**MAVLink Communication, Telemetry & Autopilot Integration Verification**
**Target System**: Pixhawk 2.4.8 (ArduCopter 4.x) | Raspberry Pi 4 Model B | MultiLink V1.0 RC
**Date**: 2026-11-21

---

## 1. Test Architecture Overview

This test plan defines the validation strategy for Phase 3. It establishes rigorous testing across four tiers:
1. **Tier 1: Unit Tests**: MAVLink message serialization, CRC checksums, connection state machine, telemetry extraction, mode mappings, command ACK tracking, and RC channel parsing.
2. **Tier 2: API Tests**: Canonical endpoints in `backend/main.py` verifying request validation, command lifecycle phases, safety interlocks, and structured JSON envelopes.
3. **Tier 3: Simulation Tests**: Realistic flight dynamics, takeoff climb behavior, circular search orbit, RTL transition, and manual RC override detection.
4. **Tier 4: Physical Bench Tests**: Serial port probing, baud negotiation, pinout checks, and hardware heartbeat verification.

---

## 2. Test Specifications

### Tier 1: Unit Tests (`tests/test_phase3_mavlink.py`)

- **UT-MAV-01: MAVLink Frame Packing & Unpacking**:
  - Validates binary framing for MAVLink v2 (magic byte `0xFD`, header, payload, 16-bit CRC).
  - Asserts packet re-assembly from chunked byte streams.
- **UT-MAV-02: CRC-16 (X.25) & Corruption Detection**:
  - Tests CRC calculation against known MAVLink seed values.
  - Verifies that corrupt bytes in payload or header are detected and rejected.
- **UT-MAV-03: Connection Lifecycle State Machine**:
  - Verifies sequential transitions: `DISCONNECTED` $\rightarrow$ `CONNECTING` $\rightarrow$ `CONNECTED` $\rightarrow$ `HEARTBEAT_RECEIVED` $\rightarrow$ `TELEMETRY_ACTIVE`.
  - Verifies heartbeat age degradation: `TELEMETRY_ACTIVE` $\rightarrow$ `DEGRADED` (when age $> 2.5\text{s}$) $\rightarrow$ `DISCONNECTED` (when age $> 5.0\text{s}$).
  - Verifies automatic transition to `SIMULATION` when no physical hardware is attached.
- **UT-MAV-04: Telemetry Extraction & Normalization**:
  - Tests parsing of `GLOBAL_POSITION_INT`, `ATTITUDE`, `SYS_STATUS`, `GPS_RAW_INT`, and `VFR_HUD`.
  - Validates scaling factors (e.g., lat/lon divided by $10^7$, altitude in meters, velocity in m/s).
  - Validates missing telemetry representation as `"UNKNOWN"` or `None`.
- **UT-MAV-05: Flight Mode Translation & Validation**:
  - Tests ArduCopter 4.x mode integers and string mappings.
  - Verifies rejection of invalid or unsupported flight modes.
- **UT-MAV-06: Asynchronous Command Queue & ACK Tracking**:
  - Validates non-blocking command transmission.
  - Asserts that incoming `COMMAND_ACK` (msg_id 77) matches the sent command ID and resolves the pending future.
- **UT-MAV-07: RC Channel Input & Manual Override Detection**:
  - Validates 8-channel PWM decoding from `RC_CHANNELS`.
  - Tests stick deviation detection (PWM outside $1500 \pm 80\ \mu\text{s}$) when in autonomous modes.
- **UT-MAV-08: Pre-Arm Checklist Engine**:
  - Tests 12-point pre-arm verification (voltage, GPS fix, satellites, HDOP, EKF, RC, heartbeat freshness).
  - Verifies refusal to arm when critical health parameters fail.
- **UT-MAV-09: Bench Safety Interlock**:
  - Confirms that `ALLOW_PHYSICAL_ARMING = False` prevents live motor arming without `force=True`.
- **UT-MAV-10: Autopilot Abstraction Bridge**:
  - Tests `MavlinkAutopilot` wrapping `MavlinkMultiplexer`.

### Tier 2: REST API Tests

- **API-MAV-01: MAVLink Status (`GET /api/mavlink/status`)**:
  - Returns connection state, port, baud, heartbeat age, packet counters, and link quality.
- **API-MAV-02: Telemetry Snapshot (`GET /api/telemetry`)**:
  - Returns fresh normalized telemetry dictionary.
- **API-MAV-03: Telemetry History (`GET /api/telemetry/history`)**:
  - Returns bounded list of recent telemetry snapshots.
- **API-MAV-04: Drone State (`GET /api/drone/state`)**:
  - Returns unified telemetry, mission state, and safety status.
- **API-MAV-05: Flight Mode Change (`POST /api/mavlink/mode`)**:
  - Dispatches mode change command and reports lifecycle phases (`COMMAND_ACKNOWLEDGED`, `STATE_CONFIRMED`).
- **API-MAV-06: Arm & Disarm (`POST /api/drone/arm`, `POST /api/drone/disarm`)**:
  - Enforces pre-arm checks and bench safety interlocks.
- **API-MAV-07: Takeoff & Land (`POST /api/drone/takeoff`, `POST /api/drone/land`)**:
  - Validates altitude and geofence parameters.
- **API-MAV-08: RTL & Emergency RTL (`POST /api/drone/rtl`, `POST /api/drone/emergency_rtl`)**:
  - Executes local companion emergency RTL path without external cloud dependencies.

### Tier 3: Simulation & Dynamics Tests

- **SIM-DYN-01: Mock Telemetry Simulation**:
  - Simulates 10 Hz telemetry loop with realistic battery discharge and GPS positioning.
- **SIM-DYN-02: Simulated Autonomous Takeoff**:
  - Simulates vertical climb to target altitude with smooth climb rate.
- **SIM-DYN-03: Simulated Pilot Takeover**:
  - Simulates pilot RC stick movement during autonomous mode and verifies state transition.

### Tier 4: Hardware & Bench Tests

- **HW-BNCH-01: Multi-Baud Port Probing**:
  - Tests probing across 921600, 115200, 57600 baud.
- **HW-BNCH-02: Safety & Wiring Review**:
  - Documentation of 3.3V LVTTL level compatibility and common ground.
  - If hardware is not connected, test suite marks hardware test as **SIMULATION ONLY** or **BLOCKED**.

---

## 3. Acceptance Criteria & Pass Thresholds

- **Unit Tests**: 100% pass rate.
- **API Tests**: All endpoints return code 200 (or expected 400 for invalid inputs) with valid schema.
- **Regression**: All 46 existing test cases in `tests/` must continue to pass without failure.
- **Safety Interlock**: Physical arming blocked by default (`ALLOW_PHYSICAL_ARMING = False`).
