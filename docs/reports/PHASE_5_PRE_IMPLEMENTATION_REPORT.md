# SKYCON Phase 5 Pre-Implementation Report
**Autonomous Mission Planning, Navigation, Scan-Path Generation & Flight Execution**
**Project**: SAE INDIA Autonomous Drone Development Challenge (ADDC 2026)
**Companion Computer**: Raspberry Pi 4 Model B | **Flight Controller**: Pixhawk 2.4.8 (ArduCopter 4.x)
**Onboard Camera**: Mounted iPhone | **RC Link**: MultiLink V1.0 (2.4 GHz)
**Date**: 2026-11-21
**Author**: Senior UAV Autonomous Mission Architect & ArduPilot Systems Specialist

---

## 1. Executive Summary & Objective

Phase 5 transitions the SKYCON system from manual and single-step operations to a fully integrated, autonomous mission-execution framework specifically structured for the **SAE INDIA ADDC 2026** competition.

The core objective is to integrate the verified building blocks from earlier phases:
- **Phase 1-2**: High-speed FastAPI companion server, Flask WSGI REST API, schema-versioned atomic JSON persistence, and dual frontend shells.
- **Phase 3**: Bidirectional binary MAVLink v2.0 bridge with Pixhawk 2.4.8, 12-point pre-arm verification, verified flight mode switching (`GUIDED`, `AUTO`, `LOITER`, `RTL`), and air-gapped Emergency RTL.
- **Phase 4**: Mounted iPhone video stream capture with freshest-frame buffer, strict 2-digit QR decoder (`^\d{2}$`), 3-frame candidate verification state machine, camera-to-Pixhawk time synchronization, 3D attitude-compensated georeferencing, and 3-layer spatial heatmap engine.

Phase 5 implements autonomous mission planning, boustrophedon (lawnmower) scan-path generation across polygon and circular flight boundaries, comprehensive route and battery/time feasibility validation, standard MAVLink mission upload protocol, and the **official 12-stage ADDC 2026 competition state machine**—including the critical **4-digit intelligence cache access workflow** (2 digits from aerial QR + 2 digits from ground operative puzzle completion) and confirmed package retrieval prior to autonomous RTL and landing within the strict 5-minute (300-second) competition clock.

---

## 2. Review of Existing Navigation & Mission Assets

An exhaustive audit of the existing codebase revealed several solid foundational modules as well as crucial gaps that must be engineered in Phase 5:

### 2.1 `backend/coverage_planner.py`
- **Strengths**:
  - Implements `CoveragePlanner` with optical footprint calculation ($W = 2 \cdot h \cdot \tan(\text{HFOV}/2)$) and effective lane spacing based on configurable overlap ratio (default 25%).
  - Provides circular boustrophedon and polygon boustrophedon sweep algorithms.
  - Converts between WGS84 and local Cartesian coordinates using flat-earth approximations.
  - Includes basic flight time estimation ($\text{distance} / \text{speed} + 30\text{s}$).
- **Gaps to Address in Phase 5**:
  - Needs structured waypoint format compliant with ArduCopter MAVLink sequence standards (`MISSION_ITEM_INT`, frame `MAV_FRAME_GLOBAL_RELATIVE_ALT_INT = 6`).
  - Lacks entry/exit heading calculations for smooth vehicle orientation during sweep transit.
  - Lacks turnaround lead-in/lead-out buffer points to prevent deceleration within the target search area.
  - Needs integration with the real-time route validator to check geofence boundary containment, maximum turn angles, and climb rate limitations.

### 2.2 `backend/spiral_planner.py`
- **Strengths**:
  - Implements Archimedean spiral search trajectory with expanding radius for point-of-interest reconnaissance.
  - Supports configurable radial step and angular resolution.
- **Gaps to Address in Phase 5**:
  - Spiral search must be selectable as an alternative reconnaissance pattern within the unified navigation planning API.

### 2.3 `backend/mission_engine.py`
- **Strengths**:
  - Implements 17-state FSM with transition guards and local JSON persistence (`SimpleJsonStore`).
  - Tracks 300-second competition clock with elapsed and remaining countdown.
  - Implements real-time geofence watchdog checking distance to boundary and altitude ceiling.
- **Critical Gaps Regarding ADDC 2026 Rules**:
  - **Single QR Assumption**: Previously, the engine triggered immediate RTL upon detecting a 2-digit QR payload (`handle_qr_detected`). The ADDC 2026 rulebook (Pages 10, 11, 14, 17) explicitly dictates that the aerial QR provides only **2 digits** of a **4-digit access code**; the remaining 2 digits must be solved on the ground by the Field Operative via a puzzle challenge. The full 4-digit code must be verified, and the physical cache box unlocked and retrieved before the drone executes RTL.
  - **Official 12-Stage Mission Sequence**: The mission engine must formally govern all 12 competition stages with explicit operator authorization gates (Flight Marshal approval, puzzle input, unlock confirmation, retrieval confirmation).

### 2.4 `backend/mavlink_multiplexer.py`
- **Strengths**:
  - Full binary MAVLink v2 encoder/decoder with CRC-16 MAVLink verification.
  - Non-blocking command dispatch loop with `COMMAND_ACK` (msg_id 77) tracking.
  - Pre-arm safety verification engine preserving `ALLOW_PHYSICAL_ARMING = False` on the bench.
- **Gaps to Address in Phase 5**:
  - Currently supports point-to-point GUIDED commands (`set_mode`, `arm`, `takeoff`, `land`, `rtl`, `emergency_rtl`), but lacks the **MAVLink Mission Transfer Protocol** (`MISSION_CLEAR_ALL`, `MISSION_COUNT`, `MISSION_REQUEST_INT`, `MISSION_ITEM_INT`, `MISSION_ACK`, `MISSION_CURRENT`).
  - ArduCopter autonomous flight execution requires waypoint lists to be uploaded directly into the flight controller's onboard EEPROM/RAM via MAVLink mission protocol so Pixhawk can execute the path autonomously in `AUTO` mode, or step-by-step through `GUIDED` repositioning.

---

## 3. ADDC 2026 Competition Sequence & Rules Alignment

The ADDC 2026 rulebook establishes strict operational parameters that dictate our software architecture:

| Stage # | Competition Stage Name | System Actor | Verification & Safety Gate | Transition Trigger |
| :---: | :--- | :--- | :--- | :--- |
| **1** | **Flight Marshal Authorization** | Ground Station / Marshal | Visual safety inspection; arming lock active | Operator logs Marshal clearance token |
| **2** | **Preflight Health Verification** | Raspberry Pi Companion | 12-point pre-arm check, GPS 3D fix, battery $\ge 15.2\text{V}$, geofence verified | All automated preflight checks PASS |
| **3** | **Armed / Standby** | Pixhawk / Companion | Bench safety interlock override (if bench mode); manual RC switch check | Motors armed in GUIDED mode |
| **4** | **Autonomous Takeoff** | Autopilot | Vertical climb to target search altitude ($10\text{m} - 12\text{m}$ AGL); horizontal drift $< 1.0\text{m}$ | Target altitude reached within $\pm 1.0\text{m}$ |
| **5** | **Autonomous Reconnaissance** | Companion + Autopilot | Lawnmower/spiral scan path inside approved geofence; 300s clock running | Drone enters search boundary |
| **6** | **Target Box Detection** | iPhone Vision Pipeline | Cardboard brown / white top cuboid detected; multi-frame tracking lock ($\ge 3$ frames) | Bounding box lock confirmed |
| **7** | **Aerial QR Extraction (2 Digits)** | iPhone Vision Pipeline | Strict regex `^\d{2}$`; temporal candidate verification ($\ge 3$ consecutive frames) | 2-digit aerial code confirmed & locked |
| **8** | **Ground Operative Puzzle Integration** | Ground Operative (GCS) | Operative receives aerial code; solves ground challenge to extract remaining 2 digits | Ground operative submits puzzle digits |
| **9** | **Access Code Verification** | GCS / Companion | Combine 2-digit aerial QR + 2-digit puzzle = 4-digit code; validate formatting | 4-digit code confirmed & logged |
| **10** | **Intelligence Cache Unlock** | Ground Operative | Operative enters 4-digit code into physical cache lock mechanism | Operative confirms cache unlocked via GCS |
| **11** | **Package Retrieval Confirmation** | Ground Operative | Operative extracts intelligence payload and moves clear of field | Operative confirms package secured via GCS |
| **12** | **Autonomous RTL & Touchdown** | Autopilot | Drone ascends/descends to RTL altitude ($15\text{m}$), navigates to Home, auto-lands | Weight-on-wheels confirmed; motors disarmed |

---

## 4. Scan-Path Generation & Trajectory Architecture

### 4.1 Boustrophedon Sweep Math
To achieve 100% optical sensor coverage of the designated search zone with zero gaps:
1. **Sensor Footprint**:
   $$\text{Ground Width } W = 2 \cdot h \cdot \tan\left(\frac{\text{HFOV}}{2}\right)$$
   $$\text{Ground Height } H = 2 \cdot h \cdot \tan\left(\frac{\text{VFOV}}{2}\right)$$
   For iPhone camera ($\text{HFOV} = 68^\circ, \text{VFOV} = 54^\circ$) at $h = 10\text{m}$:
   $$W = 2 \cdot 10 \cdot \tan(34^\circ) \approx 13.49\text{m}, \quad H = 2 \cdot 10 \cdot \tan(27^\circ) \approx 10.19\text{m}$$
2. **Lane Spacing with Overlap ($25\%$)**:
   $$\text{Lane Spacing } S = W \cdot (1 - \text{overlap}) = 13.49 \cdot 0.75 \approx 10.12\text{m}$$
   For conservative detection of small QR codes ($15\text{cm} \times 15\text{cm}$), we configure lane spacing down to $4.0\text{m} - 6.0\text{m}$ to ensure multiple redundant passes across the target box.
3. **Turnaround Geometry**:
   Turnaround waypoints must extend beyond the search boundary by a lead-in/lead-out buffer distance ($2.5\text{m}$) so that the drone completes vehicle deceleration, yaw re-orientation, and roll stabilization before entering the active scan lane.

### 4.2 Route & Mission Validation Engine
Before any mission can be uploaded or executed, the plan must pass through the `RouteValidator`:
1. **Boundary Enclosure Check**: Every waypoint must lie strictly within the active geofence polygon (ray-casting point-in-polygon algorithm) or circle ($d \le R_{\text{fence}} - R_{\text{buffer}}$).
2. **Altitude Envelope Verification**: Every waypoint must satisfy $h_{\min} \le h \le h_{\max}$ (default: $5.0\text{m} \le h \le 25.0\text{m}$).
3. **Kinematic & Budget Feasibility**:
   $$\text{Flight Time } T_{\text{est}} = \sum \frac{d_i}{v_i} + N_{\text{turns}} \cdot t_{\text{turn}} + t_{\text{takeoff}} + t_{\text{landing}}$$
   The estimated flight time must be strictly less than $270\text{s}$ (providing a $30\text{s}$ safety reserve against the $300\text{s}$ competition ceiling).

---

## 5. MAVLink Mission Upload Protocol Implementation Plan

To enable true Pixhawk autonomous waypoint execution, `MAVLinkMultiplexer` will be augmented with standard MAVLink mission transfer handlers:
1. **`MISSION_CLEAR_ALL` (msg_id 45)**: Clears existing flight controller mission items.
2. **`MISSION_COUNT` (msg_id 44)**: Transmits total number of mission items $N$.
3. **`MISSION_REQUEST_INT` (msg_id 51) / `MISSION_REQUEST` (msg_id 40)**: Pixhawk requests each item index $i \in [0, N-1]$.
4. **`MISSION_ITEM_INT` (msg_id 73)**: Companion sends binary item with coordinates scaled by $10^7$, frame `MAV_FRAME_GLOBAL_RELATIVE_ALT_INT` (6), autocontinue=1.
   - Item 0: Home / Takeoff coordinate.
   - Item 1..k: `MAV_CMD_NAV_WAYPOINT` (16) scan passes.
   - Item k+1: `MAV_CMD_NAV_LOITER_UNLIM` (17) over target area or `MAV_CMD_NAV_RETURN_TO_LAUNCH` (20).
5. **`MISSION_ACK` (msg_id 47)**: Autopilot acknowledges successful upload (`MAV_MISSION_ACCEPTED = 0`).
6. **`MISSION_CURRENT` (msg_id 42)**: Telemetry stream tracks currently active waypoint index during flight.

---

## 6. Safety & Failsafe Interlocks

1. **Bench Safety Preservation**: `ALLOW_PHYSICAL_ARMING = False` remains the hard default. Uploading a mission does NOT auto-arm motors and does NOT switch mode to `AUTO`.
2. **Manual Pilot Overriding Authority**: The MultiLink V1.0 RC receiver stream is monitored continuously. Any stick deflection $> 150\mu\text{s}$ from center instantly pauses companion mission progression and notifies GCS.
3. **Air-Gapped Local Emergency RTL**: The direct companion hardware failsafe pathway implemented in Phase 3 remains completely operational and decoupled from high-level mission state logic.
4. **Time & Battery Watchdogs**: If the 300s competition clock drops below $30\text{s}$ remaining, or battery voltage drops below $14.2\text{V}$ (3S critical threshold), the engine aborts scanning and forces immediate RTL.

---

## 7. Action Plan & Next Steps

1. Update `docs/reports/SKYCON_UPDATED_MASTER_ROADMAP.md` setting Phase 5 to `IN PROGRESS`.
2. Generate `docs/reports/PHASE_5_TEST_PLAN.md` detailing unit, integration, and safety test scenarios.
3. Implement `backend/route_validator.py` with polygon enclosure, altitude limits, and budget estimation.
4. Enhance `backend/coverage_planner.py` with ArduCopter-standard waypoint generation, turnaround lead-in buffers, and entry/exit headings.
5. Upgrade `backend/mavlink_multiplexer.py` with MAVLink Mission Protocol state engine (`MISSION_COUNT`, `MISSION_ITEM_INT`, `MISSION_ACK`).
6. Refactor `backend/mission_engine.py` with the 12-stage ADDC 2026 state machine and 4-digit puzzle workflow.
7. Expose canonical REST endpoints in `backend/main.py` and `backend/server.py`.
8. Update Ground Station UI with Mission Planning & 4-digit puzzle control panel.
9. Execute dedicated test suite `tests/test_phase5_mission_navigation.py` and full 67+ regression suite.
10. Author `docs/reports/PHASE_5_COMPLETION_REPORT.md` and await user review.
