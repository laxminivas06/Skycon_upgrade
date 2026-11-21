# SKYCON Phase 4 Pre-Implementation Report
**Computer Vision, iPhone Camera Pipeline, QR Detection, Georeferencing & Mission Heatmap**
**Project**: SAE INDIA Autonomous Drone Rescue & QR Mission System (ADDC 2026)
**Companion Computer**: Raspberry Pi 4 Model B | **Flight Controller**: Pixhawk 2.4.8 (ArduCopter 4.x)
**Onboard Camera**: Mounted iPhone | **RC Link**: MultiLink V1.0 (2.4 GHz)
**Date**: 2026-11-21
**Author**: Senior UAV Perception & Computer Vision Architect

---

## 1. Executive Summary & Objective

Phase 4 implements the end-to-end perception, computer vision, time synchronization, and geospatial mapping architecture for the SKYCON system.

The core competition requirements demand:
1. Real-time video ingestion from an **iPhone** mounted onboard the drone, transmitting frames to the Raspberry Pi 4 companion computer over local transport.
2. Low-latency, freshest-frame processing pipeline with bounded frame buffering, discarding stale frames to avoid queue accumulation.
3. Multi-stage image enhancement and robust QR code detection with strict validation of exactly two numeric digits (`^\d{2}$`, e.g., `"42"`, `"07"`).
4. Candidate verification state machine (`NOT_DETECTED`, `CANDIDATE`, `VERIFYING`, `CONFIRMED`, `REJECTED`, `EXPIRED`), ensuring unverified candidates never trigger mission-critical transitions like RTL.
5. High-precision camera-to-Pixhawk time synchronization correlating iPhone capture timestamps with companion monotonic time and Pixhawk MAVLink timestamps (`TIME_BOOT_MS` / GPS time).
6. 3D attitude-compensated georeferencing projecting image-space detections onto a calibrated ground plane using flight telemetry (altitude AGL, aircraft roll/pitch/yaw, and camera mounting angles).
7. Three distinct mapping layers:
   - **Layer A**: Search Coverage Map (`UNSCANNED`, `SCANNED`, `PARTIALLY_SCANNED`, `UNCERTAIN`, `OUTSIDE_BOUNDARY`).
   - **Layer B**: Obstacle & Visual Uncertainty Map (`OBSERVED_FREE`, `POSSIBLE_OBSTACLE`, `RESTRICTED`, `UNKNOWN`, `OUTSIDE_BOUNDARY`).
   - **Layer C**: QR & Target Observation Map (`QR_CANDIDATE`, `QR_VERIFYING`, `QR_CONFIRMED`, `QR_REJECTED`, `QR_LOCATION_APPROXIMATE`, `QR_LOCATION_UNAVAILABLE`).
8. Responsive Ground Station tactical HUD and touch-friendly iPhone Drone Core interface.
9. Air-gapped, local-first operation on Raspberry Pi 4 without cloud dependency, while keeping Phase 3 MAVLink communication and Emergency RTL pathways fully intact.

---

## 2. Existing Perception & Vision Architecture Audit

An inspection of the existing codebase identified the following foundational modules:

| Existing Module | Current Role | Strengths | Limitations & Gaps to Address in Phase 4 |
| :--- | :--- | :--- | :--- |
| `backend/stream_capture.py` | Smartphone camera capture pipeline | Supports network streams (MJPEG/RTSP), V4L2 device nodes, and frame pushes. Features `CAP_PROP_BUFFERSIZE=1` and stall detection. | Lacks formal camera lifecycle states (`PERMISSION_REQUIRED`, `DEGRADED`, etc.); does not track frame-quality evaluation or packet transmission stats from the iPhone browser. |
| `backend/qr_detector.py` | Multi-pass QR detector | Supports CLAHE, unsharp masking, subpixel corner refinement, and regex extraction. | Currently extracts two-digit codes using loose regex `(?:.*?)(\d{2})(?:.*?)` which could match portions of larger numbers (e.g. `"123"` -> `"12"`). Needs strict `^\d{2}$` full-string validation; needs candidate state machine. |
| `backend/telemetry_sync.py` | Telemetry interpolation ring buffer | 50-entry circular ring buffer with monotonic timestamp indexing and SLERP interpolation. | Currently relies solely on companion monotonic time; lacks explicit mapping between iPhone frame capture timestamps, reception latency, and Pixhawk `TIME_BOOT_MS`/GPS time. |
| `backend/georeferencing.py` | 3D attitude-compensated ground projection | Pinhole ray inversion, camera-to-body matrix, Euler rotation, WGS84 ellipsoidal projection. | Does not tag observations with honesty levels (`CALIBRATED`, `APPROXIMATE`, `UNAVAILABLE`); lacks camera calibration storage and uncertainty bounds. |
| `backend/heatmap_engine.py` & `backend/spatial_grid.py` | Spatial intelligence and grid tracking | Discretizes circular/polygonal boundaries into geodetic cells; tracks visited status. | Merges coverage and targets into a single layer; does not separate Layer A (Coverage), Layer B (Obstacles/Uncertainty), and Layer C (Target Observations). |
| `backend/fsm.py` | Autonomous edge mission state machine | Air-gapped state machine (`STANDBY` -> `SEARCHING` -> `TARGET_DETECTED` -> `APPROACHING` -> `DECODING` -> `RTL`). | Direct transition from candidate detection to RTL risks false positives; needs candidate verification interlock. |
| `frontend/src/components/PhoneMission/PhoneCameraNode.tsx` | Mounted phone UI | WebRTC/WebSocket camera capture, wake lock, rear camera selector. | Assumes Android device in some labels; needs clean iPhone responsive UI, explicit permission checks, honest connection states, and transmission rate indicators. |
| `frontend/src/components/GroundStation/HeatMapVisualizationPanel.tsx` | Ground Station tactical heatmap panel | Displays spatial cells and candidate targets. | Needs 3 distinct layers (Coverage, Obstacles, Targets) with honest status pills and target inspection inspector. |

---

## 3. Discrepancies & Hardware Constraints

1. **Camera Platform**:
   - *Previous assumption*: Some legacy comments referred to Android phones / V4L2 devices.
   - *Requirement*: The competition camera is an **iPhone** mounted on the quadcopter.
   - *Implementation*: Drone Core runs in Safari / PWA on iOS. Browser camera access requires HTTPS (or `localhost` in development). Frame streaming uses low-latency WebSocket / REST binary push to the Raspberry Pi 4 companion server.
2. **QR Code Validation Strictness**:
   - *Previous implementation*: Regex allowed substrings inside larger alphanumeric strings.
   - *Requirement*: Strict validation matching `^\d{2}$` (exactly two decimal digits, preserving leading zeroes like `"07"`). Anything with extra characters or spaces must be rejected immediately.
3. **Candidate Verification vs. Immediate RTL**:
   - *Previous implementation*: A single detection immediately triggered approach or RTL.
   - *Requirement*: A candidate verification lifecycle (`NOT_DETECTED` -> `CANDIDATE` -> `VERIFYING` -> `CONFIRMED` -> `REJECTED` -> `EXPIRED`) requiring at least 3 consistent consecutive decodes before triggering any mission transition.
4. **Time Synchronization**:
   - *Previous implementation*: Only used companion monotonic clock.
   - *Requirement*: Multi-clock synchronization mapping iPhone frame timestamp $\to$ Pi reception timestamp $\to$ Pixhawk `TIME_BOOT_MS` / GPS time, accounting for estimated transport latency.
5. **Three Distinct Mapping Layers**:
   - *Requirement*: Explicit separation of Layer A (Search Coverage), Layer B (Obstacles / Visual Uncertainty), and Layer C (Target Observations).

---

## 4. Phase 4 Implementation Plan

```
Step 1: Reports & Test Plan (PHASE_4_PRE_IMPLEMENTATION_REPORT.md, ROADMAP, PHASE_4_TEST_PLAN.md)
   │
Step 2: iPhone Camera Pipeline & Freshest-Frame Ingestion
   ├── Bounded latest-frame buffer (size=1) with drop-stale semantics
   ├── Formal camera states (DISCONNECTED, PERMISSION_REQUIRED, STREAMING, etc.)
   └── Frame validation & quality metrics (brightness, blur, latency)
   │
Step 3: Multi-Stage Image Preprocessing & Strict QR Detection
   ├── Multi-pass enhancement (Grayscale, CLAHE, Adaptive threshold, Unsharp mask)
   ├── Strict validation (regex ^\d{2}$, leading zeroes preserved)
   └── Candidate verification state machine (CANDIDATE -> VERIFYING -> CONFIRMED)
   │
Step 4: Camera-to-Pixhawk Time Synchronization
   ├── iPhone ts, Pi monotonic ts, Pixhawk TIME_BOOT_MS, GPS time correlation
   └── Latency estimation and synchronization quality scoring
   │
Step 5: Camera Calibration & Honest Georeferencing
   ├── Intrinsic & extrinsic parameters (mounting pitch/roll/yaw)
   ├── Attitude-compensated ray tracing & ground plane intersection
   └── Quality tiers: CALIBRATED, APPROXIMATE, UNAVAILABLE
   │
Step 6: Three Distinct Mapping Layers & Heatmap Engine
   ├── Layer A: Search Coverage (UNSCANNED, SCANNED, PARTIALLY_SCANNED, UNCERTAIN)
   ├── Layer B: Obstacle & Visual Uncertainty (OBSERVED_FREE, POSSIBLE_OBSTACLE, UNKNOWN)
   └── Layer C: QR Targets (QR_CANDIDATE, QR_VERIFYING, QR_CONFIRMED, QR_REJECTED)
   │
Step 7: Mission FSM & Safety Interlock Integration
   ├── Vision event handler triggering post-QR RTL only on CONFIRMED
   └── Air-gapped Emergency RTL and RC override preservation
   │
Step 8: Ground Station & Drone Core Frontend Updates
   ├── PhoneCameraNode: iPhone-optimized, responsive, honest camera states
   └── HeatMapVisualizationPanel & LiveVideoFeed: 3 layers, target details inspector
   │
Step 9: Backend REST & WebSocket APIs
   └── Canonical endpoints for camera, vision, qr, timesync, georef, mapping
   │
Step 10: Testing, Verification & Completion Report
   ├── Comprehensive Phase 4 test suite (tests/test_phase4_vision_perception.py)
   ├── Full regression pass (56 existing + new Phase 4 tests = 100% pass)
   └── PHASE_4_COMPLETION_REPORT.md & ROADMAP update
```

---

## 5. Risk Assessment & Mitigations

| Risk | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| **High CPU usage on Pi 4** | Perception loop latency elevates $> 100\text{ms}$, slowing MAVLink | Decouple ingestion from processing; single-slot drop-oldest buffer; skip heavy decoders unless candidate edge detected. |
| **iOS Safari camera permission lock** | iPhone camera blocked over HTTP | Provide clear UI instructions; support standard WebRTC / WebSocket transport; test on secure local origin. |
| **Motion blur during fast flight** | QR decoder fails at flight cruise speeds | Multi-pass Laplacian blur estimation; CLAHE and unsharp masking; prompt aircraft to hold or loiter during verification. |
| **False-positive QR decode** | Erroneous payload triggers unwanted RTL | Strict candidate state machine requiring $\ge 3$ consecutive matching frames before confirmation. |
| **Clock drift between iPhone and Pi** | Inaccurate georeferencing coordinate | Telemetry synchronization service measures round-trip time (RTT) and tags georeferenced points with honest uncertainty radii. |

---

## 6. Pre-Implementation Conclusion

The architecture is well-poised for Phase 4. Existing modules (`stream_capture.py`, `qr_detector.py`, `georeferencing.py`, `telemetry_sync.py`, `spatial_grid.py`) provide robust mathematical foundations that will be extended to meet all Phase 4 specifications without breaking backward compatibility or regression suites.
