# SKYCON HYBRID CONNECTIVITY & OFFLINE AUTONOMY PRE-IMPLEMENTATION REPORT
## Multi-Hotspot Failover, Navigation Accuracy, Coordinate Validation & Mission Continuity
### SAE INDIA Autonomous Drone Development Challenge (ADDC 2026)

---

## 1. EXECUTIVE SUMMARY & OBJECTIVE

This pre-implementation report establishes the architectural and algorithmic baseline for upgrading the **SKYCON Autonomous Drone Mission System** (`saeindia`) to achieve full operational robustness under real-world competition constraints.

In field conditions at the SAE INDIA ADDC 2026 competition:
- Cellular coverage and mobile phone hotspots are prone to sudden dropouts, interference, and battery exhaustion.
- The aircraft must operate reliably whether:
  1. Connected to a primary high-speed mobile hotspot with cloud access.
  2. Experiencing temporary link degradation or complete hotspot failure.
  3. Failing over sequentially between multiple configured mobile hotspots.
  4. Operating in 100% air-gapped, offline mode where cloud backends (PythonAnywhere) are unreachable.
  5. Navigating under noisy GPS coordinates, image processing uncertainty, or camera motion artifacts.
  6. Recovering connectivity and draining spooled mission telemetry post-sortie.

**Core Safety Mandate**: The aircraft's autonomous mission must **NEVER** depend on continuous internet access, single-hotspot availability, or cloud servers to continue an already-authorized sortie. Pixhawk 2.4.8 retains sole responsibility for physical attitude stabilization, failsafes (RC, battery, EKF), and motor control. The Raspberry Pi 4 Model B serves as the local autonomous companion orchestrating mission continuity, coordinate validation, and local coverage tracking.

---

## 2. COMPREHENSIVE AUDIT OF EXISTING REPOSITORY COMPONENTS

A systematic inspection of all codebase modules, tests, and Phase 1–7 reports reveals the following status:

| Subsystem / Module | File Reference | Current Operational Status | Audit Findings & Gaps |
| :--- | :--- | :--- | :--- |
| **Pixhawk MAVLink Telemetry** | `backend/mavlink_multiplexer.py` | **OPERATIONAL (100%)** | Decoupled thread, binary MAVLink v2 encoder/decoder, 2Hz+ heartbeat monitor, emergency RTL override, simulated fallback. Rock solid. |
| **Mission State Engine** | `backend/mission_engine.py` | **OPERATIONAL (100%)** | 12-stage ADDC competition state machine, 300s budget watchdog, Marshal auth interlock. |
| **Safety Geofence & Envelope** | `backend/route_validator.py` | **OPERATIONAL (100%)** | WGS84 ray-casting point-in-polygon, circular boundary geodesic, altitude AGL limits (5m–25m), kinematics check. |
| **Coverage Trajectory Planner** | `backend/coverage_planner.py` | **OPERATIONAL (100%)** | Boustrophedon sweep generator, inward safety margin buffering (2.0m–3.5m), ArduCopter `MISSION_ITEM_INT` exporter. |
| **Attitude Georeferencing** | `backend/georeferencing.py` | **PARTIAL (80%)** | Pinhole ray inversion, $R_C^B$ extrinsics, $R_B^{NED}$ Z-Y-X rotation, ground plane intersection. **Gap**: Lacks structured `CoordinateConfidence` schema, multi-criteria validation pipeline, and versioned package integrity checks. |
| **QR & Box Detection** | `backend/qr_detector.py` | **OPERATIONAL (100%)** | Strict regex filter `^\d{2}$`, multi-frame verification ($\ge 3$ frames), EMA centroid smoothing, SHA-256 payload hashing. |
| **Video & Stream Capture** | `backend/stream_capture.py` | **OPERATIONAL (100%)** | Push/Pull MJPEG ingestion, rotation compensation, synthetic frame generator for SITL/bench testing. |
| **Network Management** | `backend/network_manager.py` | **PARTIAL (50%)** | Single hotspot profile (`config/hotspot_profile.json`), exponential backoff (`3s` to `30s`), socket DNS check (`8.8.8.8:53`). **Major Gap**: No multi-hotspot support, no sequential failover, no priority queue, no hysteresis, no measured reconnection timer. |
| **Cloud Synchronization** | `backend/cloud_sync.py` | **PARTIAL (75%)** | Periodic POST telemetry/events, offline spooling (`offline_sync_spool.json`), deduplication. **Gap**: Does not handle versioned coordinate packages or pending image queue tracking. |
| **Local Persistence Store** | `backend/simple_json_store.py` | **OPERATIONAL (100%)** | Atomic `.tmp` rename, SHA-256 integrity checksums, automatic `.bak` healing, bounded rotation. |
| **Ground Station Frontend** | `frontend/src/` | **PARTIAL (80%)** | Tactical dark HUD, Leaflet GPS mapping, MAVLink indicators. **Gap**: Single-hotspot indicator, lacks multi-hotspot failover status, coordinate confidence pills, and offline cell coverage progress. |

---

## 3. IDENTIFIED WEAKNESSES & ENGINEERING GAPS

### 3.1 Network & Hotspot Gaps
1. **Single-Profile Limitation**: `network_manager.py` currently loads only one SSID from `hotspot_profile.json`. If that hotspot is powered down, the companion computer attempts infinite reconnection to that same dead SSID without failing over to secondary or tertiary field hotspots.
2. **Missing Multi-Hotspot Sequential Failover**: Raspberry Pi 4 possesses a single Wi-Fi radio (`wlan0`). Simultaneous connection to two Wi-Fi networks is physically impossible without a secondary USB Wi-Fi dongle. Therefore, failover must be executed sequentially:
   - Priority 1: Primary Mobile Hotspot (Field Operator 1).
   - Priority 2: Secondary Mobile Hotspot (Field Runner / Pilot).
   - Priority 3: Tertiary Backup Hotspot / Local GCS Tether.
3. **Flapping / Thrashing Risk**: Rapid oscillating switching between weak Wi-Fi networks degrades MAVLink streaming and video delivery. The system lacks a connection hysteresis stability period (e.g., 60 seconds minimum continuous uptime before considering switching back to a recovered primary).
4. **Camera / Hotspot Topology Ambiguity**: If an onboard iPhone streams video to the Pi via local Wi-Fi while the Pi connects to an external hotspot, single-radio contention can break video. The optimal topology must be defined: iPhone operating as the primary Wi-Fi hotspot providing both local MJPEG frames and cellular data forwarding, or local USB tethering.

### 3.2 Navigation Accuracy & Coordinate Validation Gaps
1. **Blind Coordinate Execution Risk**: A single noisy visual detection or distorted QR code detection could generate inaccurate geographic coordinates. Feeding unverified coordinates directly to Pixhawk navigation could cause flyaways or boundary breaches.
2. **Missing Explicit Confidence Tiers**: Visual targets must be categorized into explicit states:
   - `HIGH_CONFIDENCE`: Calibrated camera, fresh telemetry (<0.5s), $\ge 3$ consecutive verified frames, within inner boundary, horizontal uncertainty $<1.5\text{m}$.
   - `APPROXIMATE`: Geometric estimate with nominal FOV, telemetry age $<1.5\text{s}$, horizontal uncertainty $1.5\text{m} - 3.5\text{m}$.
   - `LOW_CONFIDENCE`: Telemetry age $>1.5\text{s}$, high vehicle angular velocity, horizontal uncertainty $>3.5\text{m}$. Operator review required.
   - `UNVERIFIED`: Single frame candidate, uncalibrated pose.
   - `REJECTED`: Geofence breach, Null Island (0,0), invalid CRS, or altitude violation.
3. **Missing Coordinate Package Protocol**: Cloud heatmap coordinates must be packaged with cryptographic checksums, schema versioning, and vehicle capability constraints. The Raspberry Pi must independently inspect and validate each coordinate before uploading to Pixhawk.

### 3.3 Offline Autonomy & Coverage Accounting Gaps
1. **No Real-Time Cell Coverage Tracker**: While `coverage_planner.py` generates boustrophedon sweep paths, there is no spatial grid matrix on the companion recording which physical cells have been visually swept and which cells were skipped due to pilot avoidance maneuvers.
2. **Cloud Dependency Coupling**: If cloud sync fails, the system must cleanly tag telemetry and detection events into a transactional offline queue without blocking the autonomous navigation loop.

---

## 4. ARCHITECTURAL BLUEPRINT & IMPLEMENTATION PLAN

```
+----------------------------------------------------------------------------------------------------+
|                                    SKYCON HYBRID AUTONOMY STACK                                    |
|                                                                                                    |
|    +-----------------------------+                     +--------------------------------------+    |
|    |    MULTI-HOTSPOT MANAGER    |                     |    COORDINATE VALIDATION PIPELINE    |    |
|    | - Priority Queue (1, 2, 3)  |                     | - Explicit Confidence Tiers          |    |
|    | - Sequential Failover       |                     | - Geofence & Boundary Clamping       |    |
|    | - Hysteresis Stability (60s)|                     | - Vehicle Kinematics Verification    |    |
|    | - Zero Credential Leakage   |                     | - Multi-Frame Visual Lock Guard      |    |
|    +-----------------------------+                     +--------------------------------------+    |
|                   |                                                       |                        |
|                   v                                                       v                        |
|    +-----------------------------+                     +--------------------------------------+    |
|    |   HYBRID ONLINE / OFFLINE   |                     |      LOCAL COVERAGE TRACKER          |    |
|    | - Local Pre-Loaded Grid Plan|                     | - Discrete Spatial Cell Matrix       |    |
|    | - Zero Cloud Dependencies   | <-----------------> | - Real-time Visited Cell Logging     |    |
|    | - Transactional Event Spool |                     | - Missed Cell Detection              |    |
|    | - Auto-Drain on Reconnect   |                     | - Coverage Percentage (0 - 100%)     |    |
|    +-----------------------------+                     +--------------------------------------+    |
|                   |                                                       |                        |
|                   +---------------------------+---------------------------+                        |
|                                               |                                                    |
|                                               v                                                    |
|                               +-------------------------------+                                    |
|                               |     PIXHAWK MAVLINK V2        |                                    |
|                               | - ArduCopter 4.x Mission Sync |                                    |
|                               | - Verified Item Upload/Readback|                                   |
|                               | - Hardware Failsafe Priority  |                                    |
|                               +-------------------------------+                                    |
+----------------------------------------------------------------------------------------------------+
```

### Plan of Work:
1. **Module 1 (`backend/network_manager.py`)**:
   - Upgrade to support multi-hotspot configuration (`config/hotspot_profiles.json`).
   - Implement sequential failover with priority sorting (1 = Primary, 2 = Secondary, 3 = Backup).
   - Implement connection hysteresis: require active link stability timer before switching back to higher-priority networks.
   - Implement reconnection latency measurement (`reconnect_start_time`, `reconnect_duration_s`).
   - Expose endpoints: `GET /api/network/hotspots`, `POST /api/network/hotspots/configure`, `POST /api/network/hotspots/priority`.
2. **Module 2 (`backend/coordinate_validator.py`)**:
   - Implement comprehensive `CoordinateValidator` and `ValidatedCoordinate` data models.
   - Enforce 10-point safety validation: WGS84 bounds, geodesic distance, geofence containment, altitude envelope, waypoint spacing, kinematics, EKF health, coordinate age, visual evidence lock.
   - Compute explicit states: `HIGH_CONFIDENCE`, `APPROXIMATE`, `LOW_CONFIDENCE`, `UNVERIFIED`, `REJECTED`.
3. **Module 3 (`backend/coordinate_package.py`)**:
   - Versioned coordinate package protocol (`package_id`, `version`, `checksum_sha256`, `coordinates`).
   - Raspberry Pi verification & local ingestion before MAVLink upload.
4. **Module 4 (`backend/coverage_tracker.py`)**:
   - Discrete 2D spatial grid cell matrix covering the operational bounding box.
   - Ingests live telemetry (lat, lon, alt) and marks cells covered based on camera FOV footprint.
   - Real-time metrics: total cells, visited cells, missed cells, percent complete.
5. **Module 5 (`backend/server.py` & `backend/main.py`)**:
   - Expose REST endpoints for multi-hotspot status, coordinate package validation, and coverage tracking.
6. **Module 6 (Frontend UI)**:
   - Add multi-hotspot selector and failover indicator to `CommunicationDiagnosticsPanel.tsx`.
   - Add coordinate confidence badge and coverage completion progress to Ground Station HUD.
7. **Module 7 (Automated Test Suite & Roadmap)**:
   - Build extensive unit and failure simulation test suite `tests/test_hybrid_connectivity.py` covering all failure modes.
   - Verify 100% test pass rate across the full repository.
   - Update `docs/reports/SKYCON_UPDATED_MASTER_ROADMAP.md` and generate final completion report.

---

## 5. RISK ASSESSMENT & MITIGATION STRATEGY

| Identified Risk | Severity | Mitigation Strategy |
| :--- | :--- | :--- |
| **Wi-Fi radio switching latency** | High | RPi 4 single Wi-Fi radio takes 3–8s to re-associate. MAVLink and autonomy continue uninterrupted onboard without waiting for Wi-Fi. |
| **Rapid Wi-Fi flapping** | High | Implement 60s minimum stability hysteresis; never trigger Wi-Fi switch during critical flight stages (takeoff, target inspection, landing). |
| **Inaccurate vision coordinates** | Critical | Strict coordinate validator rejects unverified/low-confidence coordinates; fallback to pre-planned boustrophedon grid. |
| **Local disk overflow** | Low | Bounded circular rotation on `offline_sync_spool.json` and SimpleJsonStore collections. |
| **Physical arming hazard** | Critical | Maintain `ALLOW_PHYSICAL_ARMING = False` in software test suites; zero automatic arming or takeoff commands. |

---
**Status**: PRE-IMPLEMENTATION AUDIT COMPLETE — PROCEEDING TO IMPLEMENTATION.
