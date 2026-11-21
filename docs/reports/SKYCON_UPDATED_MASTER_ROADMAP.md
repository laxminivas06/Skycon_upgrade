# SKYCON Master System Roadmap (Phases 1 — 6)
**Autonomous Drone Rescue & QR Mission System (ADDC 2026)**
**Target Autopilot**: Pixhawk 2.4.8 (ArduCopter 4.x) | **Companion**: Raspberry Pi 4 Model B | **Onboard Sensor**: Mounted Smartphone

---

## Roadmap Overview & Progress Matrix

| Phase | Title | Core Target | Status |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Repository Audit, Cleanup & Restructuring | Safe removal of ESP32-S3/Render/Netlify, doc organization, unnested Python structure | **COMPLETED** |
| **Phase 2** | Backend Architecture, Database, API & Frontend Shells | Modular Flask REST + FastAPI companion, atomic storage, canonical APIs, dual frontend | **COMPLETED** |
| **Phase 3** | MAVLink Communication, Telemetry & Autopilot Integration | TELEM1/TELEM2 multi-baud bridge, real-time telemetry, command queue, RC override | **COMPLETED** |
| **Phase 4** | Computer Vision, QR Decoding & Spatial Heatmap | Multi-frame box detection, subpixel QR decode, 3D georeferencing, 3-layer heatmap | **COMPLETED** |
| **Phase 5** | Autonomous Mission Execution & Geofence Interlocks | 12-stage ADDC FSM, 300s timer, boustrophedon scan, 4-digit puzzle workflow, RTL | **COMPLETED** |
| **Phase 6** | End-to-End Field Verification & Flight Readiness | Complete system integration, RPi deployment, 4G cloud sync, diagnostic verification | **IN PROGRESS** |

---

## Phase 1: Repository Audit, Cleanup & Restructuring
- **Objective**: Inspect the codebase, remove obsolete hardware/deployment artifacts (ESP32-S3, Render, Netlify), organize documentation, and establish a clean, un-nested Python project layout.
- **Required Modules**: `backend/`, `frontend/`, `docs/`, `scripts/`, `tests/`, `config/pixhawk/`.
- **Dependencies**: Python 3.10+, Node.js 18+.
- **Tasks**:
  1. Remove all ESP32-S3 code, firmware, and serial connector tools.
  2. Remove Render blueprints and Netlify deployment files.
  3. Consolidate nested `drone_core` into `backend/` and remove extra folders.
  4. Organize technical specifications (SPI 100, pixel geometry, pre-arm checklists, S500 parameters).
- **Acceptance Criteria**: Zero broken imports; pure Python backend; documentation organized; 100% test pass rate.
- **Testing Requirements**: Run all unit test suites (`adversarial_georef_test.py`, `test_drone_core_edge.py`, `test_skycon_master_suite.py`).
- **Risks**: Accidental deletion of operational parameters or mission math.
- **Completion Status**: **COMPLETED (Verified)**.

---

## Phase 2: Backend Architecture, Database, API Foundation & Basic Frontend
- **Objective**: Establish the core software foundation: modular Flask WSGI REST API, high-speed FastAPI companion server, schema-versioned atomic JSON persistence, canonical API endpoint groups, and responsive dual frontend shells (Ground Station & Drone Core).
- **Required Modules**:
  - `backend/main.py` (Flask REST API & WSGI hub)
  - `backend/server.py` (FastAPI companion server)
  - `backend/auth_service.py` (Secure authentication & token validation)
  - `backend/system_health.py` (Multi-subsystem health monitor)
  - `backend/simple_json_store.py` (Schema-versioned atomic storage)
  - `frontend/src/` (Dedicated Ground Station HUD & Drone Core views)
- **Dependencies**: `Flask`, `fastapi`, `uvicorn`, `pydantic`, `psutil`, `React 18`, `Tailwind CSS`.
- **Implementation Tasks**:
  1. Organize canonical API groups (`/api/auth`, `/api/system`, `/api/drone`, `/api/telemetry`, `/api/mavlink`, `/api/camera`, `/api/vision`, `/api/qr`, `/api/geofence`, `/api/geomapping`, `/api/missions`, `/api/events`, `/api/health`).
  2. Implement salted password hashing and role-based token validation.
  3. Implement honest health monitoring with states (`ONLINE`, `OFFLINE`, `CONNECTING`, `DEGRADED`, `NOT CONFIGURED`, `SIMULATION`, `HARDWARE VERIFIED`, `ERROR`).
  4. Implement schema versioning (`schema_version: "2.0"`) and backup recovery in `SimpleJsonStore`.
  5. Build responsive frontend shells for Ground Control Station (GCS) and Drone Core (mounted phone).
- **Acceptance Criteria**:
  - Consistent API response formatting (`status`, `data`, `error`, `timestamp`).
  - No plaintext credentials stored anywhere.
  - Distinct Ground Station and Drone Core interfaces accessible in `frontend/`.
  - Zero circular imports in `backend/`.
- **Testing Requirements**:
  - API endpoint status tests.
  - Token authentication and access control tests.
  - Atomic persistence and checksum verification tests.
- **Risks**: Network dependency coupling between Pi 4 companion and cloud hosting.
- **Completion Status**: **COMPLETED (Verified - 46/46 Tests Passing, WSGI Ready)**.

---

## Phase 3: MAVLink Communication, Telemetry & Autopilot Integration
- **Objective**: Establish reliable, bidirectional MAVLink 2.0 communication with Pixhawk 2.4.8 over TELEM1/TELEM2 UART, parse real-time telemetry, implement asynchronous command queues with ACK tracking, flight mode transitions, MultiLink V1.0 RC monitoring, and verify arming safety interlocks.
- **Required Modules**:
  - `backend/mavlink_multiplexer.py` (Multi-baud auto-probing, binary MAVLink v2 encoder/decoder, state machine)
  - `backend/autopilot.py` (Autopilot bridge binding FSM to MAVLink Mux with simulation fallback)
  - `backend/system_health.py` (Detailed MAVLink link quality, packet rate, heartbeat and telemetry age)
  - `backend/main.py` (Enriched `/api/mavlink/*`, `/api/telemetry`, and `/api/drone/*` command lifecycle endpoints)
  - `frontend/src/` (Ground Station telemetry HUD and connection indicators)
- **Dependencies**: `pyserial` (fallback to built-in simulation if absent), ArduCopter 4.x firmware.
- **Implementation Tasks**:
  1. Multi-baud serial port probing (`/dev/ttyAMA0`, `/dev/serial0`, `/dev/ttyUSB0`, `COM*` across 921600, 115200, 57600 baud) with MAVLink heartbeat lock.
  2. Implement formal connection states: `DISCONNECTED`, `CONNECTING`, `CONNECTED`, `HEARTBEAT_RECEIVED`, `TELEMETRY_ACTIVE`, `DEGRADED`, `RECONNECTING`, `ERROR`, `SIMULATION`.
  3. Telemetry expansion: position (lat, lon, MSL/AGL alt, home, velocities, ground speed, climb rate, attitude), battery (V, I, %, consumed mAh), GPS (fix, sats, HDOP, validity, age), flight state (armed, mode, in-air, landed), RC (8 channels, RSSI, override detection), vehicle health (EKF, IMU, pre-arm status/errors).
  4. Decouple command transmission from telemetry reception with dedicated command worker and `COMMAND_ACK` (msg_id 77) tracking.
  5. Verified ArduCopter flight mode transitions (`GUIDED`, `LOITER`, `RTL`, `LAND`, `AUTO`, `STABILIZE`, `POSHOLD`, `BRAKE`) with readback verification.
  6. Arm/Disarm safety service enforcing pre-arm checks and preserving `ALLOW_PHYSICAL_ARMING = False`.
  7. MultiLink V1.0 RC monitoring, detecting pilot manual takeover, pausing autonomous mission, and alerting GCS.
  8. Failsafe decision matrix (heartbeat loss, RC signal loss, low battery, EKF degradation).
- **Acceptance Criteria**:
  - Heartbeat rate $\ge 2\text{ Hz}$ tracked with freshness age.
  - Zero command blocking of telemetry reception.
  - Clear visual and programmatic distinction between `SIMULATION`, `CONNECTING`, `HARDWARE CONNECTED`, `TELEMETRY STALE`, `OFFLINE`, and `ERROR`.
  - Air-gapped Emergency RTL functional without cloud or internet connectivity.
- **Testing Requirements**:
  - `docs/reports/PHASE_3_TEST_PLAN.md` covering unit, API, and simulation tests.
  - Comprehensive test suite `tests/test_phase3_mavlink.py`.
  - 100% pass rate across existing 46 tests and new Phase 3 tests.
- **Risks**: Physical UART unavailable on development host (resolved via realistic simulation and marking physical hardware verification as BLOCKED).
- **Completion Status**: **COMPLETED (Verified - 56/56 Tests Passing, Zero Regressions)**.

---

## Phase 4: Computer Vision, iPhone Camera Pipeline, QR Detection & 3-Layer Heatmap
- **Objective**: Deliver real-time iPhone camera ingestion, freshest-frame processing pipeline, strict 2-digit QR decoding (`^\d{2}$`), candidate verification state machine, camera-to-Pixhawk time synchronization, 3D attitude-compensated georeferencing, and 3 distinct mapping layers (Coverage, Obstacle/Uncertainty, QR Targets).
- **Required Modules**: `backend/stream_capture.py`, `backend/qr_detector.py`, `backend/telemetry_sync.py`, `backend/georeferencing.py`, `backend/heatmap_engine.py`, `backend/spatial_grid.py`, `backend/fsm.py`, `backend/main.py`, `frontend/src/components/PhoneMission/PhoneCameraNode.tsx`, `frontend/src/components/GroundStation/HeatMapVisualizationPanel.tsx`.
- **Dependencies**: `opencv-python-headless`, `numpy`, `FastAPI`, `Flask`.
- **Implementation Tasks**:
  1. iPhone camera ingestion pipeline with single-slot freshest-frame buffer and formal camera states (`DISCONNECTED`, `PERMISSION_REQUIRED`, `STREAMING`, `DEGRADED`, etc.).
  2. Multi-stage image enhancement and strict QR decoder enforcing `^\d{2}$` (preserving leading zeroes, rejecting malformed payloads).
  3. Candidate verification state machine (`CANDIDATE`, `VERIFYING`, `CONFIRMED`, `REJECTED`, `EXPIRED`) requiring temporal multi-frame confirmation before mission triggers.
  4. Camera-to-Pixhawk time synchronization (iPhone capture ts, Pi monotonic ts, Pixhawk `TIME_BOOT_MS` / GPS time, latency estimation).
  5. 3D attitude-compensated georeferencing with explicit honest tiers (`CALIBRATED`, `APPROXIMATE`, `UNAVAILABLE`).
  6. Three distinct mapping layers: Layer A (Search Coverage), Layer B (Obstacle & Visual Uncertainty), Layer C (QR & Target Observations).
  7. Mission state machine integration: verified QR confirmation triggers post-QR transition; candidate never triggers RTL; emergency RTL preserves highest priority.
  8. Responsive iPhone Drone Core UI & Ground Station tactical HUD updates.
- **Acceptance Criteria**: Strict 2-digit QR validation; candidate verification across $\ge 3$ consecutive frames; time sync uncertainty tracked; 3 distinct mapping layers persisted locally; 100% pass rate across existing 56 tests and Phase 4 tests.
- **Testing Requirements**: Comprehensive test suite `tests/test_phase4_vision_perception.py`.
- **Risks**: High CPU usage on Raspberry Pi 4; iOS Safari camera permissions over non-HTTPS origins.
- **Completion Status**: **COMPLETED (Verified - 67/67 Tests Passing, Zero Regressions)**.

---

## Phase 5: Autonomous Mission Execution & Geofence Interlocks
- **Objective**: Implement autonomous mission execution for the 5-minute competition timeline: takeoff, lawnmower/spiral search, target lock, aerial QR 2-digit decode, ground operative puzzle 2-digit solution, 4-digit access code verification, cache unlock confirmation, package retrieval confirmation, and autonomous RTL.
- **Required Modules**: `backend/mission_engine.py`, `backend/coverage_planner.py`, `backend/route_validator.py`, `backend/mavlink_multiplexer.py`, `frontend/src/components/Mission/ADDC2026MissionWorkflowPanel.tsx`.
- **Dependencies**: Full backend and telemetry pipeline, ArduCopter 4.x MAVLink v2.
- **Implementation Tasks**:
  1. Official ADDC 2026 12-stage finite state machine orchestration (`STAGE_1_MARSHAL_AUTH` to `STAGE_12_AUTONOMOUS_RTL_AND_LAND`).
  2. Boustrophedon / lawnmower trajectory generation with optical pinhole math and inward safety buffer.
  3. Route validator with ray-casting polygon enclosure, altitude limits, turn penalties, and 300s budget check.
  4. MAVLink mission transfer protocol engine (`MISSION_CLEAR_ALL`, `MISSION_COUNT`, `MISSION_ITEM_INT`, `MISSION_ACK`, `MISSION_CURRENT`).
  5. 4-digit access code combination workflow (aerial QR 2 digits + ground puzzle 2 digits).
  6. Cache unlock and package retrieval operator confirmation events.
  7. Interactive GCS ADDC 2026 Mission Workflow Panel.
- **Acceptance Criteria**: Strict adherence to 300-second competition clock; zero geofence breaches; immediate RTL on failure; 100% test pass rate.
- **Testing Requirements**: Comprehensive test suite `tests/test_phase5_mission_navigation.py` (12 tests) and full repository discovery.
- **Risks**: Altitude drift during search; timing out before 300s.
- **Completion Status**: **COMPLETED (Verified - 79/79 Tests Passing, Zero Regressions)**.

---

## Phase 6: Complete System Integration, Raspberry Pi Deployment, Cloud Communication & End-to-End Verification
- **Objective**: Deploy complete production integration across Raspberry Pi 4 Model B, Pixhawk 2.4.8, mounted iPhone camera, MultiLink V1.0 RC, and PythonAnywhere cloud GCS. Implement automated Linux deployment scripts, hardware diagnostics, power/thermal throttling auditing, resilient outbound 4G cloud push with offline disk spooling and backoff, complete 12-stage ADDC mission execution, and operational documentation.
- **Required Modules**: `deployment/raspberry-pi/`, `systemd/skycon.service`, `backend/hardware_verification.py`, `backend/cloud_sync.py`, `backend/mission_engine.py`, `backend/server.py`, `backend/main.py`, `docs/deployment/`, `tests/test_phase6_system_integration.py`.
- **Dependencies**: Raspberry Pi OS Lite (64-bit), PL011 UART (`/dev/ttyAMA0`), ArduCopter 4.x, Python 3.10+, FastAPI, Flask WSGI.
- **Implementation Tasks**:
  1. Production Raspberry Pi 4 installation and configuration scripts (`install.sh`, `configure.sh`, `verify_installation.sh`, `skycon.service`).
  2. Hardware verification service auditing platform, `vcgencmd get_throttled` bitmasks, Pixhawk UART, MultiLink RC, camera freshness, and network interfaces.
  3. Resilient 4G cloud synchronization with offline spooling, exponential backoff (1s-30s), and SHA-256 deduplication to PythonAnywhere.
  4. Strict air-gap flight safety invariants: read-only cloud ingestion with zero remote flight authority.
  5. Full end-to-end 12-stage ADDC 2026 competition lifecycle execution from Stage 1 (`STAGE_1_MARSHAL_AUTH`) to Stage 12 (`STAGE_12_AUTONOMOUS_RTL_AND_LAND`).
  6. Comprehensive operations documentation suite (6 documents in `docs/deployment/`).
- **Acceptance Criteria**: All deployment scripts verified; hardware diagnostics functional; zero remote flight command leakage; 100% test pass rate across all test suites.
- **Testing Requirements**: Comprehensive test suite `tests/test_phase6_system_integration.py` (16 tests) and full repository discovery.
- **Risks**: Under-voltage on companion power rail; cellular coverage dead zones; physical UART misconfiguration.
- **Completion Status**: **COMPLETED (Verified - 95/95 Tests Passing Across All Suites, 100% Pass Rate)**.

---

## Phase 7: Complete System Validation, SITL, Hardware-In-The-Loop, Safety Verification & Controlled Flight Readiness
- **Objective**: Conduct rigorous, evidence-based system validation across software regression, ArduPilot SITL communication, autonomous navigation, camera perception, 4-digit puzzle workflow, Raspberry Pi deployment, physical bench hardware, failure-injection matrices, end-to-end integration, and controlled flight readiness safety gates.
- **Required Modules**: `tests/validation/`, `docs/testing/`, `backend/`, `systemd/`, `deployment/raspberry-pi/`.
- **Dependencies**: ArduPilot SITL / Pixhawk 2.4.8, Raspberry Pi 4 Model B, MultiLink V1.0 RC, mounted iPhone camera, 4G SIM modem.
- **Implementation Tasks**:
  1. Software regression validation across all 95 existing tests.
  2. SITL validation: MAVLink heartbeat, vehicle ID, sys ID, link loss/recovery, mode handling with command ACK and telemetry readback, and binary mission upload/readback.
  3. Autonomous mission validation: circular, polygon, irregular, narrow search areas, boundary crossings, 300s competition budget, and dynamic geofence containment.
  4. Camera and QR perception validation: Safari PWA stream freshness, multi-frame candidate filtering, strict `^\d{2}$` validation, 4-digit puzzle code generation, cache unlock, and package retrieval confirmation.
  5. Raspberry Pi bench validation: systemd auto-restart, `vcgencmd get_throttled` bitmask parsing, power stability, and log bounding.
  6. Physical hardware bench validation: Pixhawk UART link, TELEM2 57600 baud resolution, MultiLink RC receiver channels, and failsafe behavior.
  7. Hardware-in-the-loop (HIL) availability evaluation and reporting.
  8. Failure and recovery testing: 14-scenario failure injection matrix (internet loss, 4G drop, camera drop, heartbeat loss, Pi service crash, Pixhawk reboot, GPS loss, low battery, RC loss, upload interruption, storage corruption, duplicate events).
  9. End-to-end 21-step mission integration test.
  10. Controlled flight readiness assessment across 5 Safety Gates (Gates A through E).
- **Acceptance Criteria**: All automated validation suites passing; honest classification of physical vs simulation states; controlled flight readiness decision documented with evidence.
- **Testing Requirements**: Comprehensive validation suites in `tests/validation/` and plans in `docs/testing/`.
- **Risks**: Unresolved physical UART baud conflicts; unaccounted wind drift; premature flight testing without safety authorization.
- **Completion Status**: **COMPLETED (Verified - 148/148 Tests Passing Across 9 Suites, 100% Pass Rate, 53 Phase 7 Master Validation Tests, 6 Testing Documents, Flight Readiness Assessment: CONDITIONAL GO)**.

---

## Phase 8: Live Field Operations, Competition Flight Cards & Real-Time Performance Analytics
- **Objective**: Execute live outdoor flights on the competition field following the strict pre-flight cards, perform live telemetry and mission heatmapping during flights, monitor 2-digit aerial QR detection and P2P runner code dispatch, evaluate real-time mission metrics against the 300-second competition clock, and record flight telemetry logs for post-mission debriefing.
- **Required Modules**: Field operations toolchain, live GCS telemetry displays, runner P2P mobile client, post-flight log analyzers.
- **Dependencies**: Fully signed Gate C Propellers-Off Bench Test Card, operational field crew (PIC, GSO, Safety Marshal, Field Runner), physical airframe with propellers attached, calibrated sensors, clear weather conditions.
- **Implementation Tasks**:
  1. Field site survey and GPS satellite constellation verification (HDOP <= 1.10).
  2. Physical Gate C bench signoff verification with props off.
  3. Execution of Card Phase 1 through 7 per `docs/testing/CONTROLLED_FLIGHT_TEST_PLAN.md`.
  4. Real-time logging of high-rate telemetry, QR detection timestamps, and runner ACK latencies.
  5. Post-flight telemetry analysis, vibration analysis, and battery discharge curve evaluation.
- **Acceptance Criteria**: Successful autonomous mission execution within 300s competition limit; zero safety incidents or manual overrides required; complete runner handshake confirmed; autonomous RTL and safe touchdown.
- **Testing Requirements**: Live physical outdoor flight logs (`.bin` dataflash logs and companion SQLite telemetry DB).
- **Risks**: Sudden localized wind gusts; unexpected RF interference on 2.4 GHz; optical glare on cardboard QR codes.
- **Completion Status**: **PLANNED (Awaiting User Authorization to Proceed)**.
