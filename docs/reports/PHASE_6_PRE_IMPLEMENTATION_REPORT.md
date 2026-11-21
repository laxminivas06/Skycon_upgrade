# SKYCON Phase 6 Pre-Implementation Report
**Complete System Integration, Raspberry Pi Deployment, Cloud Communication & End-to-End Verification**
**Project**: SAE INDIA Autonomous Drone Development Challenge (ADDC 2026)
**Companion Computer**: Raspberry Pi 4 Model B | **Flight Controller**: Pixhawk 2.4.8 (ArduCopter 4.x)
**Onboard Camera**: Mounted iPhone | **RC Link**: MultiLink V1.0 (2.4 GHz)
**Internet**: 4G USB SIM Dongle | **Cloud**: PythonAnywhere WSGI Architecture
**Date**: 2026-11-21
**Author**: Senior UAV Systems Integration Engineer & Deployment Specialist

---

## 1. Executive Summary & Objective

Phase 6 represents the culminating integration phase of the SKYCON autonomous mission system. The objective is to unify all previous discrete engineering layers:
- **Phase 1**: Clean, un-nested repository, removal of legacy ESP32-S3 and third-party cloud artifacts.
- **Phase 2**: Dual REST/WSGI and FastAPI backend architectures, schema-versioned atomic JSON store (`SimpleJsonStore`), canonical API routing.
- **Phase 3**: Bidirectional binary MAVLink v2.0 bridge with Pixhawk 2.4.8 over UART, 12-point pre-arm verification, verified flight mode mapping, pilot manual RC stick override detection, and air-gapped Emergency RTL.
- **Phase 4**: Mounted iPhone video stream capture with freshest-frame buffer, strict 2-digit QR decoder (`^\d{2}$`), 3-frame candidate verification state machine, camera-to-Pixhawk time synchronization, 3D attitude-compensated georeferencing, and 3-layer spatial heatmap engine.
- **Phase 5**: Autonomous reconnaissance scan-path generation (boustrophedon sweeps for polygon and circular boundaries), kinematic route and 300s budget validation, binary MAVLink mission transfer protocol (`MISSION_CLEAR_ALL`, `MISSION_COUNT`, `MISSION_ITEM_INT`, `MISSION_ACK`, `MISSION_CURRENT`), and the **official 12-stage ADDC 2026 competition state machine** with 4-digit access code workflow.

Phase 6 implements:
1. **Production Raspberry Pi 4 Deployment**: Automated virtual environment setup, systemd service configuration (`systemd/skycon.service`), 12-step deterministic startup sequence, and graceful shutdown recovery.
2. **Hardware Connection Verification & Diagnostics**: Dedicated hardware verification checklist and real-time monitoring of Pi 4 health (CPU, RAM, disk, temperature, throttling, undervoltage) and physical wiring (TELEM1/TELEM2, GPIO14/15, MultiLink V1.0 RC receiver, iPhone camera).
3. **4G USB Dongle & Cloud Communication Bridge**: Resilient background synchronization (`backend/cloud_sync.py`) between the local Raspberry Pi and PythonAnywhere, employing REST polling, exponential backoff, offline spooling, and strict isolation preventing cloud routing of flight-control or emergency commands.
4. **End-to-End System Integration**: Full orchestration of all 12 ADDC competition stages, bridging Ground Station, companion computer, autopilot, camera, and ground operative workflows.
5. **Comprehensive Automated Testing**: Execution and preservation of all 79 existing tests across Phases 1–5, augmented by Phase 6 integration and diagnostic test suites.

---

## 2. Audit of System Capabilities (Phases 1–5 Assessment)

### 2.1 Completed Functionality
- **Zero-Dependency Binary MAVLink v2 Multiplexer** (`backend/mavlink_multiplexer.py`): Full frame parser, CRC-16 extra validation, decoupled command queue, `COMMAND_ACK` tracking, and complete mission protocol (`MISSION_COUNT`, `MISSION_ITEM_INT`, `MISSION_ACK`).
- **Autonomous Mission State Machine & 4-Digit Workflow** (`backend/mission_engine.py`): 17 FSM states, official 12-stage ADDC lifecycle (`STAGE_1_MARSHAL_AUTH` through `STAGE_12_AUTONOMOUS_RTL_AND_LAND`), aerial QR 2-digit decode + ground operative 2-digit puzzle combination (`^\d{4}$`), cache unlock and package retrieval confirmation events.
- **Boustrophedon & Spiral Coverage Planner** (`backend/coverage_planner.py`): Circular and polygon sweep generation with optical sensor footprints ($W \approx 13.49\text{m}$ at $10\text{m}$ AGL), $25\%$ overlap, and inward safety buffer ($2.5\text{m}$).
- **Kinematic Route & Budget Validator** (`backend/route_validator.py`): Ray-casting polygon containment, circular geodesic distance, altitude envelope ($5\text{m} - 25\text{m}$), turn penalties, battery consumption, and strict 300s competition limit gating.
- **Vision & QR Verification Pipeline** (`backend/qr_detector.py`, `backend/stream_capture.py`): Freshest-frame drop-oldest buffer, multi-stage image enhancement, strict `^\d{2}$` regex, 3-frame candidate verification state machine (`CANDIDATE` $\to$ `VERIFYING` $\to$ `CONFIRMED`).
- **Multi-Clock Synchronization & Georeferencing** (`backend/telemetry_sync.py`, `backend/georeferencing.py`): iPhone capture timestamp, Pi monotonic time, Pixhawk `TIME_BOOT_MS` correlation, and 3D attitude-compensated projection.
- **3-Layer Geospatial Mapping** (`backend/spatial_grid.py`, `backend/heatmap_engine.py`): Layer A (Coverage), Layer B (Obstacles/Uncertainty), Layer C (Target QR Observations).
- **Atomic Persistence & Audit Trail** (`backend/simple_json_store.py`): Schema-versioned atomic writes, `.bak` auto-healing, SHA-256 checksums, and bounded history.
- **Frontend HUDs & Control Panels**: Ground Station Dashboard, Drone Core view, Heatmap panel, and `ADDC2026MissionWorkflowPanel`.

### 2.2 Incomplete Functionality & Phase 6 Target Scope
- **Production Systemd Service & Deployment Automation**: The repository lacks formal systemd unit definitions (`systemd/skycon.service`) and executable install/configure/verify shell scripts for Raspberry Pi OS.
- **Resilient 4G Cloud Synchronization Engine**: Currently, PythonAnywhere and the local Raspberry Pi operate as disconnected instances. A dedicated synchronization worker (`backend/cloud_sync.py`) is required to push telemetry snapshots, mission milestones, access code combinations, and audit logs to the cloud endpoint with offline queueing and exponential backoff.
- **Hardware Connection Diagnostics & Checklist**: System health checks basic host resources, but lacks a dedicated hardware diagnostic verification module auditing physical UART port configurations, undervoltage/throttling flags via `vcgencmd`, MultiLink RC channel mapping, and camera stream freshness.
- **Operational & Runbook Documentation**: Missing comprehensive guides for Raspberry Pi setup, hardware connection verification, cloud configuration, network recovery, and ground operator mission execution.

---

## 3. Integration Conflicts, Inconsistencies & Duplicate Services

1. **Camera Platform Identity**: Some legacy comments referred to Raspberry Pi Camera Module v2 / IMX477 CSI devices. Phase 4 and the project specifications explicitly establish that the mounted iPhone (pushing frames over local network to companion) is the intended onboard sensor. Phase 6 enforces that the production configuration explicitly treats iPhone camera push as primary, rejecting silent fallback to imaginary CSI drivers.
2. **UART Port Identification**: The uploaded engineering report mentions Pixhawk TELEM2 at 57600 baud and Raspberry Pi GPIO14/GPIO15 UART connections (`/dev/ttyAMA0` or `/dev/serial0`). However, settings default to TELEM1 at 921600 baud. Phase 6 implements multi-baud auto-probing and documents both configurations without forcing arbitrary live switching during missions.
3. **PythonAnywhere Hosting Constraints**: PythonAnywhere WSGI does NOT support persistent background WebSocket listeners or arbitrary long-running background threads. Cloud synchronization must use standard HTTP REST requests dispatched from the companion to the cloud endpoint, never requiring the cloud to reach back into the Pi.
4. **Flight Control Authority Boundary**: Cloud services must NEVER be given direct flight-control or arming authority. All autonomous flight decisions, geofence watchdog checks, and Emergency RTL execution must remain strictly local on the Raspberry Pi 4 companion and Pixhawk.

---

## 4. Simulation-Only vs. Hardware-Dependent Components

In accordance with strict honesty rules, all capabilities are classified based on current verification on the development host:

| Subsystem | Hardware Dependency | Current Environment Status | Classification |
| :--- | :--- | :---: | :--- |
| **Mission State Machine & FSM** | Companion CPU / RAM | Windows Dev Host (Python 3.13) | **HARDWARE VERIFIED (Host)** |
| **Scan-Path & Route Validator** | Companion CPU / RAM | Windows Dev Host | **HARDWARE VERIFIED (Host)** |
| **4-Digit Puzzle Workflow** | Local Storage / GCS | Windows Dev Host | **HARDWARE VERIFIED (Host)** |
| **Atomic JSON Persistence** | Local Disk Storage | Windows Dev Host | **HARDWARE VERIFIED (Host)** |
| **MAVLink Multiplexer & Bridge** | Pixhawk 2.4.8 UART | Loopback / Mock Simulator | **SIMULATION ONLY** |
| **Physical UART (TELEM1/TELEM2)** | `/dev/ttyAMA0`, GPIO 14/15 | Dev Host (No physical UART attached) | **BLOCKED (Requires Field Pi 4)** |
| **Motor Arming & Propulsion** | ESCs, 2216 Motors | `ALLOW_PHYSICAL_ARMING = False` | **BLOCKED (Bench Safety)** |
| **iPhone Live Video Push** | iPhone Safari WebApp | Synthetic Frame Injection | **SIMULATION ONLY** |
| **4G USB SIM Dongle** | USB Modem (`wwan0` / `eth1`) | Host Internet Connection | **SIMULATION ONLY** |
| **MultiLink V1.0 RC Receiver** | Pixhawk RC IN port | Mock RC Channel Packets | **SIMULATION ONLY** |

---

## 5. Deployment Blockers & Operational Risks

1. **Linux `vcgencmd` Availability**: Pi 4 power supply checks (`get_throttled` for undervoltage and throttling) depend on the Linux `vcgencmd` utility. On non-Pi systems (Windows or standard Linux x86), the diagnostic service must provide realistic simulation fallbacks without raising exceptions.
2. **4G Dongle Cellular Connectivity Drops**: Cellular latency spikes or signal dropouts must not block companion mission execution. The synchronization engine must spool telemetry and events into a bounded SQLite / JSON offline buffer and replay them upon reconnection.
3. **iOS Safari Screen Timeout**: If the iPhone screen sleeps, video capture pauses. The Drone Core web application must request WakeLock API or display an active visual element to maintain continuous streaming.
4. **Bench Safety Preservation**: Motor arming (`ALLOW_PHYSICAL_ARMING`) must remain locked to `False` by default in all deployment scripts and services until explicit field flight approval.

---

## 6. Existing Test Baseline to Preserve

The entire existing repository test suite must remain 100% passing without regressions:
- `tests/test_skycon_master_suite.py` (Phase 1–2 baseline)
- `tests/adversarial_georef_test.py` (Phase 2 georef baseline)
- `tests/test_drone_core_edge.py` (Phase 2 edge autonomy)
- `tests/test_drone_core_m2.py` (Phase 2 persistence and FSM)
- `tests/test_phase2_foundation.py` (Phase 2 REST & auth)
- `tests/test_phase3_mavlink.py` (Phase 3 MAVLink multiplexer & pre-arm checks)
- `tests/test_phase4_vision_perception.py` (Phase 4 camera pipeline, QR verification, time sync, georeferencing, heatmap)
- `tests/test_phase5_mission_navigation.py` (Phase 5 scan-path, route validator, MAVLink upload, 12-stage ADDC FSM)
- **Current Baseline: 79 passing tests (0 failures, 0 errors)**.

---

## 7. Implementation Plan for Phase 6

1. Update `docs/reports/SKYCON_UPDATED_MASTER_ROADMAP.md` setting Phase 6 to `IN PROGRESS`.
2. Implement Raspberry Pi systemd service and deployment scripts:
   - `systemd/skycon.service`
   - `deployment/raspberry-pi/install.sh`
   - `deployment/raspberry-pi/configure.sh`
   - `deployment/raspberry-pi/verify_installation.sh`
   - `deployment/raspberry-pi/README.md`
3. Implement hardware verification and power/throttling diagnostics module:
   - `backend/hardware_verification.py`
   - Enhance `backend/system_health.py` with undervoltage, throttling, and connection diagnostics.
4. Implement resilient 4G cloud synchronization service:
   - `backend/cloud_sync.py` with offline spooling, exponential backoff, and REST push to PythonAnywhere.
5. Create comprehensive deployment and operational documentation:
   - `docs/deployment/RASPBERRY_PI_DEPLOYMENT.md`
   - `docs/deployment/CLOUD_DEPLOYMENT.md`
   - `docs/deployment/HARDWARE_CONNECTION_CHECKLIST.md`
   - `docs/deployment/STARTUP_AND_SHUTDOWN.md`
   - `docs/deployment/NETWORK_RECOVERY.md`
   - `docs/deployment/OPERATOR_RUNBOOK.md`
6. Develop Phase 6 automated integration test suite:
   - `tests/test_phase6_system_integration.py`
7. Run complete regression suite (all 79 prior tests + Phase 6 tests).
8. Author `docs/reports/PHASE_6_COMPLETION_REPORT.md` and update roadmap.
9. Stop and await user instructions before Phase 7.
