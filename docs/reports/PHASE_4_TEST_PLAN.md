# SKYCON Phase 4 Test Plan
**Perception, iPhone Camera Pipeline, QR Detection, Georeferencing & 3-Layer Heatmap**
**Project**: SAE INDIA Autonomous Drone Rescue & QR Mission System (ADDC 2026)
**Document**: `docs/reports/PHASE_4_TEST_PLAN.md`
**Date**: 2026-11-21
**Author**: Senior Perception Verification & Test Lead

---

## 1. Test Strategy Overview

This test plan specifies the verification protocols for Phase 4 of the SKYCON system. All tests are designed to run within the automated unit/integration test harness (`python -m unittest`) with zero cloud or physical hardware dependencies, while adhering strictly to honest verification reporting.

### Testing Honesty Tiers
Results across all perception features must be categorized into:
- **UNIT TESTED**: In-memory algorithmic verification of math, parsing, and state logic.
- **API TESTED**: Local HTTP/WebSocket client-server contract verification.
- **SIMULATION TESTED**: End-to-end simulated camera streams, synthetic MAVLink telemetry, and mock flight scenarios.
- **IMAGE DATASET TESTED**: Evaluated on synthetic and captured QR barcode image samples.
- **IPHONE BROWSER TESTED**: Tested on physical iOS Safari browser (where hardware available).
- **RASPBERRY PI BENCH TESTED**: Executed on actual Broadcom BCM2711 hardware (where available).
- **PIXHAWK HARDWARE TESTED**: Executed with physical Pixhawk 2.4.8 over UART (where available).
- **FLIGHT TESTED**: Validated on physical S500 quadcopter in autonomous flight.

*Note for Development Environment: Tests run on the local development machine without attached iPhone or Pixhawk are reported strictly as `UNIT TESTED`, `API TESTED`, `IMAGE DATASET TESTED`, or `SIMULATION TESTED`.*

---

## 2. Test Suite Categories

### A. Camera Pipeline & Freshest-Frame Ingestion Tests
1. **Camera Disconnected / Idle**: Verify system reports `DISCONNECTED` state and does not claim fake live frames.
2. **Permission Required / Denied**: Verify error handling when browser camera permission is rejected or ungranted.
3. **Valid Frame Ingestion**: Verify incoming JPEG/RGB frame pushes correctly update the latest-frame buffer.
4. **Invalid / Corrupted Frame Rejection**: Verify truncated or non-image payloads are discarded without crashing.
5. **Latest-Frame Prioritization (Drop-Oldest Buffer)**: Verify that when 10 frames arrive in rapid burst, the buffer holds only the newest frame and discards the stale 9 frames (bounded buffer depth = 1).
6. **Camera Stall & Reconnection Watchdog**: Verify that when frame ingestion halts for $> 1500\text{ms}$, camera state transitions to `DEGRADED` or `RECONNECTING`.
7. **Frame Quality Metrics**: Verify computation of brightness, contrast, and Laplacian blur variance.

### B. QR Detection & Strict Two-Digit Validation Tests
1. **Valid Two-Digit Numerical QR (`^\d{2}$`)**: Verify successful decode of payloads like `"42"`, `"99"`.
2. **Leading-Zero Two-Digit QR**: Verify `"07"`, `"00"`, `"01"` are decoded and preserved strictly as strings (not converted to integers like `7`).
3. **Three-Digit Invalidation**: Verify `"123"` is disqualified.
4. **Alphabetic & Mixed Invalidation**: Verify `"A2"`, `"4B"`, `"QR"`, `"1 2"` are rejected.
5. **Empty / Malformed Payload**: Verify empty text or unreadable noise returns no valid code.
6. **Multi-Stage Enhancement**: Verify that low-contrast or blurred QR images decoded fail Stage 1 (standard) but succeed in Stage 2 (CLAHE / adaptive threshold) or Stage 3 (ROI enlargement).
7. **Subpixel Corner Refinement**: Verify corner coordinates and true optical centroid via diagonal intersection.
8. **Candidate State Machine**: Verify state transitions:
   - Frame 1: `CANDIDATE`
   - Frame 2: `VERIFYING` (count = 2)
   - Frame 3: `CONFIRMED` (count = 3, verified = True)
9. **Candidate Timeout & False-Positive Recovery**: Verify candidate state resets to `NOT_DETECTED` if consistent decodes cease before reaching threshold.

### C. Camera-to-Pixhawk Time Synchronization Tests
1. **Timestamp Correlation**: Verify mapping between iPhone capture time $t_{phone}$, Pi receipt monotonic time $t_{mono}$, and Pixhawk $t_{boot\_ms}$.
2. **One-Way Latency Compensation**: Verify estimated network transport delay $\delta_{net}$ is accounted for in telemetry indexing.
3. **Clock Offset & Drift Estimation**: Verify monotonic tracking prevents wall-clock backward jumps.
4. **Missing Pixhawk Time Fallback**: Verify graceful fallback to system monotonic time when MAVLink `TIME_BOOT_MS` is unavailable.
5. **Stale Telemetry Flagging**: Verify georeferencing is marked `UNAVAILABLE` or `APPROXIMATE` if time delta exceeds $1000\text{ms}$.

### D. Camera Calibration & 3D Georeferencing Tests
1. **Calibrated Downward Observation**: Verify pixel $(u, v) = (w/2, h/2)$ at pitch = 0, roll = 0, alt = 10m projects directly to vehicle ground coordinates $(lat, lon)$.
2. **Attitude Compensation (Pitch / Roll)**: Verify forward pitch (+5°) shifts ground projection forward in North-East coordinates; verify right roll (+5°) shifts ground projection right.
3. **Camera Mounting Orientation (Extrinsics)**: Verify camera mounting pitch/roll offsets are incorporated into $R_C^B$.
4. **Ground Plane Intersection (Flat Earth Assumption)**: Verify rays pointing upward or parallel to horizon ($z_{ned} \le 0$) are rejected with `valid = False`.
5. **Honest Quality Tiers**:
   - `CALIBRATED`: Calibration loaded, fresh telemetry ($< 0.5\text{s}$), valid attitude.
   - `APPROXIMATE`: Uncalibrated intrinsics (default FOV) or moderate latency ($0.5\text{s} - 2.0\text{s}$).
   - `UNAVAILABLE`: Stale telemetry ($> 2.0\text{s}$), zero GPS fix, or horizon ray.

### E. Three-Layer Mapping & Heatmap Engine Tests
1. **Layer A (Search Coverage)**:
   - Initialized circular/polygonal boundary cells are `UNSCANNED`.
   - Camera footprint projection marks observed cells as `SCANNED` only when covered by a valid, high-quality frame.
   - Cells with low frame quality or high blur are tagged `UNCERTAIN`.
2. **Layer B (Obstacle & Visual Uncertainty)**:
   - Clear visual cells marked `OBSERVED_FREE`.
   - Boundary buffers and uninspected regions marked `UNKNOWN` or `RESTRICTED`.
3. **Layer C (QR & Target Observations)**:
   - Tracks observations with distinct states: `QR_CANDIDATE`, `QR_VERIFYING`, `QR_CONFIRMED`, `QR_REJECTED`.
   - Confirmed targets persist with georeferenced coordinates, confidence, and SHA-256 evidence.
4. **Persistence & Serialization**:
   - Verify export to GeoJSON and atomic JSON storage with `.bak` recovery.

### F. Mission FSM & Safety Interlock Tests
1. **Candidate QR Does Not Trigger RTL**: Verify that entering `CANDIDATE` or `VERIFYING` state does NOT trigger RTL or pause search.
2. **Confirmed QR Triggers Transition**: Verify that only upon reaching `CONFIRMED` does the FSM trigger post-QR transition (`DECODING` -> `RTL`).
3. **Emergency RTL Priority**: Verify Emergency RTL from Phase 3 immediately aborts vision tasks and commands mode `RTL` (mode 6).
4. **RC Takeover Override**: Verify pilot manual stick deflection immediately pauses autonomous mission.
5. **Camera Failure Non-Interference**: Verify camera disconnection or crash does not degrade Pixhawk MAVLink or flight control loops.

### G. Full Regression Suite
- Run all 56 tests from Phase 1, Phase 2, and Phase 3 to guarantee zero regressions.

---

## 3. Test Execution Target
- Dedicated test file: `tests/test_phase4_vision_perception.py`
- Command: `python -m unittest discover -s tests -p "test_*.py"`
- Target Outcome: **All tests PASS with 0 errors and 0 failures**.
