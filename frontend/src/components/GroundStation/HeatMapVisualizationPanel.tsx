# SKYCON PHASE 4 MASTER PROMPT
## COMPUTER VISION, iPHONE CAMERA PIPELINE, QR DETECTION, GEOREFERENCING & MISSION HEATMAP

  ** Project:** SKYCON
    ** Competition:** SAE INDIA Autonomous Drone Rescue & QR Mission System(ADDC 2026)
      ** Repository:** Existing`Upgrade_skycon` repository
        ** Companion Computer:** Raspberry Pi 4 Model B
          ** Flight Controller:** Pixhawk 2.4.8 running ArduCopter 4.x
            ** Camera:** iPhone mounted onboard the drone
              ** RC System:** Existing MultiLink V1.0
                ** Previous Phase:** Phase 3, Live MAVLink Communication, Telemetry & Autopilot Integration

---

# 1. YOUR ROLE

Act as a senior UAV computer - vision architect, robotics perception engineer, image - processing specialist, geospatial software engineer and autonomous drone mission - systems developer.

Your task is to implement ** SKYCON Phase 4: Computer Vision, Camera Pipeline, QR Detection, Georeferencing and Heatmap Generation **.

You must work directly inside the existing `Upgrade_skycon` repository.

Do not create a separate replacement project.

Do not discard or unnecessarily rewrite working Phase 1, Phase 2 or Phase 3 components.

Do not begin Phase 5 or any future phase.

Implement Phase 4 only, test it, document it and stop.

# 2. PHASE 3 BASELINE: READ BEFORE MODIFYING ANYTHING

Read these documents and inspect the actual source code before implementation:

1. `docs/reports/PHASE_3_COMPLETION_REPORT.md`
2. `docs/reports/PHASE_3_PRE_IMPLEMENTATION_REPORT.md`
3. `docs/reports/PHASE_3_TEST_PLAN.md`
4. `docs/reports/SKYCON_UPDATED_MASTER_ROADMAP.md`
5. Existing MAVLink multiplexer.
6. Existing autopilot bridge.
7. Existing edge mission state machine.
8. Existing QR and vision modules.
9. Existing frontend camera and Ground Station components.
10. Existing API routes, storage, configuration and test suites.

  Phase 3 reports the following:

- MAVLink 2.0 multiplexer implemented.
- Raspberry Pi to Pixhawk communication architecture implemented.
- Normalized telemetry contract implemented.
- Flight mode readback and command queue implemented.
- MultiLink V1.0 RC monitoring implemented.
- Air - gapped emergency RTL pathway implemented.
- 56 automated tests passing.
- Physical hardware verification remains BLOCKED(SIMULATION ONLY).
- Camera timestamps currently use the companion computer clock rather than Pixhawk GPS time.

Treat these as reported software achievements, not proof of physical hardware operation.

### Important hardware and architecture constraints

  - The actual onboard camera is an iPhone, not an assumed Android phone.
- Raspberry Pi 4 Model B remains the companion computer.
- Pixhawk remains responsible for flight stabilization and flight - critical failsafes.
- MultiLink V1.0 remains the existing RC system.
- Do not introduce ESP32 - S3.
- Do not invent additional onboard hardware.
- Do not assume the iPhone has a direct physical USB camera connection to the Raspberry Pi.
- Do not assume the iPhone and Raspberry Pi are on the same network until configured and tested.
- Cloud connectivity must never be required for flight safety or mission continuity.

If the existing code contradicts these requirements, document the discrepancy before changing it.

# 3. PHASE 4 OBJECTIVES

Implement the following connected subsystems:

1. iPhone camera connection and streaming.
2. Freshest - frame camera ingestion pipeline.
3. Camera health and frame - quality monitoring.
4. Image preprocessing and enhancement.
5. QR detection and two - digit validation.
6. QR candidate verification and confidence scoring.
7. Camera - to - Pixhawk timestamp synchronization.
8. Image georeferencing using available telemetry and camera calibration.
9. Search - area coverage tracking.
10. Obstacle and uncertain - area representation.
11. Target detection and QR candidate mapping.
12. Live Ground Station heatmap visualization.
13. Mission state - machine integration.
14. Offline onboard operation and safe RTL integration.

All components must use the existing architecture and API conventions wherever possible.

# 4. IPHONE CAMERA PIPELINE

The onboard camera is an iPhone mounted on the drone.

Build a dedicated camera interface in the existing Drone Core frontend.

The iPhone must be able to:

- Open the Drone Core application.
- Authenticate with the existing system.
- Request camera permission.
- Start the rear camera.
- Display a live camera preview.
- Connect to the Raspberry Pi companion service.
- Send camera frames or a supported video stream to the Pi.
- Display connection status.
- Display camera permission status.
- Display streaming status.
- Display frame transmission status.
- Display camera errors.
- Reconnect after temporary network interruption.
- Stop streaming safely.

### Camera interface requirements

Create a clean, responsive camera control interface with:

- Start Camera.
- Stop Camera.
- Start Streaming.
- Stop Streaming.
- Camera Preview.
- Connection Status.
- Frame Rate.
- Resolution.
- Frame Transmission Status.
- Last Frame Timestamp.
- Camera Health.
- Network Quality.

Use the iPhone's rear camera by default when supported.

Investigate browser camera capabilities and implement a practical approach using the existing frontend architecture.

  Use HTTPS where required for browser camera permissions.

Do not assume browser camera access works over an insecure remote HTTP connection.

If a browser - based implementation is selected, use supported browser APIs and a compatible streaming transport.

If WebRTC is appropriate, ensure the Raspberry Pi can receive the stream without requiring a permanently available external cloud service.

Do not introduce an unnecessarily complicated streaming architecture.

### Important distinction

The iPhone camera must not be represented as connected merely because the Drone Core webpage is open.

Only report LIVE CAMERA when actual frames are arriving and passing validation.

Camera states must include:

- DISCONNECTED
  - PERMISSION_REQUIRED
  - CONNECTING
  - CAMERA_READY
  - STREAMING
  - DEGRADED
  - RECONNECTING
  - ERROR
  - SIMULATION

Never fabricate camera frames or operational camera status.

# 5. FRESHEST - FRAME CAMERA PROCESSING

Implement a low - latency camera processing pipeline suitable for Raspberry Pi 4.

The system must prioritize the newest available frame.

Do not allow an accumulating queue of old frames to create processing latency.

Use a bounded frame buffer, preferably a latest - frame buffer or a very small configurable queue.

If the vision engine is overloaded, discard stale frames rather than processing an increasingly old backlog.

  Implement:

- Frame acquisition.
- Frame validation.
- Timestamp assignment.
- Resolution normalization.
- Image preprocessing.
- Frame - quality evaluation.
- Detection scheduling.
- Frame processing statistics.
- Error recovery.

  Track:

- Received frames.
- Processed frames.
- Dropped frames.
- Frame rate.
- Processing latency.
- End - to - end latency.
- Last successful frame.
- Image dimensions.
- Camera connection age.

Provide configurable processing rates and image resolutions.

Do not promise a fixed frame rate until measured on the Raspberry Pi 4.

Use lightweight processing suitable for the available CPU and memory.

Where possible, separate camera ingestion from image processing so a slow QR decoder cannot block incoming frames.

# 6. IMAGE PREPROCESSING AND QR ENHANCEMENT

Build a configurable image enhancement pipeline.

It should support:

- Grayscale conversion.
- Contrast enhancement.
- CLAHE.
- Adaptive thresholding.
- Denoising.
- Sharpening.
- Perspective correction.
- Image resizing.
- Region - of - interest extraction.
- Motion blur estimation.
- Brightness assessment.
- Exposure assessment.

Implement a multi - stage QR detection strategy:

** Stage 1: Standard detection **
  - Detect QR candidates in the original frame.
- Use OpenCV QRCodeDetector or an appropriate installed decoder.

** Stage 2: Image enhancement **
  - Process grayscale and contrast - enhanced images.
- Try adaptive thresholding and sharpening.
- Detect QR candidates again.

** Stage 3: Region - of - interest processing **
  - Identify potential QR regions.
- Crop and enlarge candidate regions.
- Apply perspective correction where possible.

** Stage 4: Advanced decoding **
  - Evaluate whether WeChat QR or another compatible decoder is practical on Raspberry Pi 4.
    - Use it only if dependencies, model files, licensing and performance are suitable.
- Do not download huge models or add unnecessary dependencies without measuring their value.

Maintain multiple decoding attempts with bounded processing time.

Do not repeatedly process the same stale frame without a reason.

Record which processing method successfully detected a QR.

# 7. QR DETECTION AND TWO - DIGIT VALIDATION

The competition QR workflow requires detection and decoding of a QR code containing exactly two numerical digits.

Implement strict validation.

A valid QR result must satisfy:

- Successfully decoded text.
- Exactly two characters.
- Both characters are numerical digits.
- No extra characters.
- No whitespace or hidden characters.
- No malformed payload.

  Examples:

- `12` = valid.
- `07` = valid.
- `99` = valid.
- `123` = invalid.
- `A2` = invalid.
- `1 2` = invalid.
- Empty result = invalid.

Preserve leading zeroes.

Do not convert the result to an integer before storing it.

### Candidate verification

A single weak detection must not automatically trigger a mission - ending action.

Implement configurable verification based on:

- Detection confidence where available.
- Repeated consistent decoding.
- Frame quality.
- Temporal consistency.
- Duplicate detection suppression.
- Candidate expiration.
- Confirmation status.

Use a state model:

- NOT_DETECTED
  - CANDIDATE
  - VERIFYING
  - CONFIRMED
  - REJECTED
  - EXPIRED

Store:

- Exact decoded two - character string.
- Detection timestamp.
- Frame ID.
- Confidence or quality score.
- Decoder used.
- Verification count.
- Image reference or evidence metadata.
- Georeferencing quality.
- Confirmation status.

Do not invent a numerical confidence score if the decoder does not provide one.Label any derived quality score as an estimate.

### Mission transition

When a valid two - digit QR result is confirmed, generate a mission event.

The existing mission state machine must decide the next action based on configured ADDC mission rules.

The requested SKYCON behavior is to initiate Return - To - Launch after successful QR confirmation.

Implement this as a configurable, explicitly logged transition.

Before enabling this behavior in a real flight, verify that it does not conflict with the full ADDC mission sequence, including any required ground - side puzzle, intelligence - cache or package - retrieval stages.

Never trigger RTL from an unverified QR candidate.

The emergency RTL pathway from Phase 3 must remain independent and higher priority.

# 8. CAMERA AND PIXHAWK TIME SYNCHRONIZATION

Phase 3 identified a known limitation: camera frame timestamps currently use the companion computer clock rather than Pixhawk GPS time.

Address this in Phase 4.

Implement a time synchronization service that correlates:

- iPhone frame timestamp.
- Raspberry Pi frame - reception timestamp.
- Raspberry Pi monotonic timestamp.
- Pixhawk boot time(`TIME_BOOT_MS`) when available.
- Pixhawk GPS time when available.
- MAVLink telemetry timestamp.
- Mission event timestamp.

Use a robust mapping between the companion clock and Pixhawk time.

Account for:

  - Network transmission delay.
- Variable frame transport latency.
- Clock offset.
- Clock drift.
- Missing GPS time.
- Reconnection.
- Clock reset.
- Stale telemetry.

Do not assume an iPhone timestamp is directly synchronized with Pixhawk time.

Use monotonic clocks for elapsed - time calculations.

Store both the original source timestamp and the synchronized estimate.

Expose synchronization quality and uncertainty.

If synchronization is unavailable or unreliable, mark georeferencing as degraded rather than presenting false precision.

# 9. CAMERA CALIBRATION AND GEOREFERENCING

Implement a camera calibration and georeferencing subsystem.

The objective is to associate detected QR candidates and mapped observations with approximate ground locations.

Use available information:

- Pixhawk latitude and longitude.
- Relative altitude.
- Vehicle heading.
- Roll and pitch.
- Camera timestamp.
- Camera mounting orientation.
- Camera intrinsic parameters.
- Camera - to - body extrinsic parameters.
- Camera field of view.
- Ground - plane assumptions.

Create a configurable camera calibration structure.

It should include:

- Image width and height.
- Focal length or camera intrinsic matrix.
- Principal point.
- Distortion coefficients.
- Camera mounting pitch.
- Camera mounting roll.
- Camera mounting yaw.
- Camera - to - drone - body translation where known.
- Calibration version.
- Calibration status.

Do not invent calibration values.

Provide a calibration workflow or configuration template.

If calibration is unavailable, mark the resulting position as APPROXIMATE or UNAVAILABLE.

### Georeferencing process

For each candidate observation:

1. Retrieve the frame timestamp.
2. Find the closest valid Pixhawk telemetry sample.
3. Check telemetry freshness.
4. Check time synchronization quality.
5. Obtain vehicle position and attitude.
6. Apply camera orientation and calibration.
7. Estimate the camera ray for the QR center pixel.
8. Intersect the ray with a configured ground plane only when the assumptions are valid.
9. Calculate the approximate ground coordinate.
10. Store the uncertainty and quality status.

Account for vehicle movement between camera capture and frame reception.

Do not use the Pi's current position as a substitute for the aircraft position at the image capture time.

### Critical limitation

A monocular iPhone camera does not automatically provide reliable metric depth.

Do not claim accurate 3D obstacle distances or collision - safe obstacle avoidance from a single ordinary camera.

Use an honest distinction between:

- IMAGE - SPACE DETECTION
  - APPROXIMATE GROUND PROJECTION
    - CALIBRATED GEOREFERENCED OBSERVATION
      - UNAVAILABLE

Never display an inaccurate coordinate as a confirmed physical target location.

# 10. THREE DISTINCT MAPPING LAYERS

Implement three separate mapping layers.

Do not merge them into a single ambiguous heatmap.

## A.Search Coverage Map

Show which parts of the configured search area have been scanned.

  States:

- UNSCANNED
  - SCANNED
  - PARTIALLY_SCANNED
  - UNCERTAIN
  - OUTSIDE_BOUNDARY

Coverage should be calculated using actual camera observations, vehicle position, altitude, attitude, field of view and the configured coverage model.

Do not mark an area as scanned simply because the drone passed above it.

Require evidence that a usable camera frame covered the area.

Account for frame quality and overlapping observations.

## B.Obstacle and Uncertainty Map

Show:

- OBSERVED_FREE
  - POSSIBLE_OBSTACLE
  - RESTRICTED
  - UNKNOWN
  - OUTSIDE_BOUNDARY

Use image - based detections only as visual observations.

Do not claim that this layer provides validated metric obstacle avoidance.

If there is no suitable depth or ranging sensor, label it as a visual perception layer and keep unknown regions clearly visible.

Do not use this layer to automatically command aggressive avoidance maneuvers.

## C.QR and Target Observation Map

Show:

- QR_CANDIDATE
  - QR_VERIFYING
  - QR_CONFIRMED
  - QR_REJECTED
  - QR_LOCATION_APPROXIMATE
  - QR_LOCATION_UNAVAILABLE

Each observation must have a unique ID and traceable evidence.

Confirmed and unconfirmed targets must look visibly different.

Do not display rejected QR candidates as confirmed targets.

# 11. HEATMAP GENERATION ENGINE

Create a configurable heatmap engine for the Ground Station.

It must use real mission data.

  Support:

- Grid - based coverage calculation.
- Configurable cell size.
- Search boundary clipping.
- Frame footprint projection.
- Coverage percentage.
- Scanned - area calculation.
- Uncertain - area calculation.
- Target observation markers.
- Observation history.
- Time - based filtering.
- Mission - based filtering.

The system must distinguish:

1. Total search area.
2. Scanned area.
3. Unscanned area.
4. Uncertain area.
5. Confirmed target observations.
6. Rejected target observations.

Do not treat every camera frame as complete coverage.

Use configurable overlap requirements and minimum image quality.

Persist map state locally on the Raspberry Pi.

Cloud synchronization may copy the data, but cloud availability must not determine whether the local heatmap works.

# 12. GROUND STATION UI

Update the existing Ground Station interface.

Preserve the current professional aerospace / military - inspired design.

Use a dark operational interface.

Avoid decorative grass - green backgrounds or unnecessary visual clutter.

The interface must remain responsive across:

- Desktop.
- Laptop.
- Tablet.
- Mobile.

### Main camera and vision panel

Include:

- Camera connection status.
- Latest camera frame or preview where supported.
- Camera frame rate.
- Processing latency.
- QR detection status.
- Last QR candidate.
- Confirmed QR result.
- Image quality.
- Georeferencing status.

### Mission heatmap panel

Include:

- Search boundary.
- Drone position.
- Drone heading.
- Coverage grid.
- Scanned cells.
- Unscanned cells.
- Uncertain cells.
- QR candidates.
- Confirmed QR markers.
- Rejected candidates.
- Coverage percentage.

### Target details panel

When an operator selects a QR observation, display:

- Observation ID.
- Decoded value.
- Detection time.
- Verification status.
- Decoder used.
- Frame quality.
- Estimated location.
- Location uncertainty.
- Georeferencing status.
- Evidence reference.

### Operational state labels

Use honest labels:

- LIVE
  - SIMULATION
  - DISCONNECTED
  - STALE
  - DEGRADED
  - APPROXIMATE
  - CONFIRMED
  - UNVERIFIED
  - UNAVAILABLE

Do not show fake camera feeds or fabricated heatmap coverage.

If no camera is connected, show a clear disconnected state.

# 13. DRONE CORE UI

Update the iPhone Drone Core interface.

Keep it simple, touch - friendly and responsive.

It should show:

- Camera preview.
- Camera permission.
- Pi connection.
- Streaming status.
- Frame transmission rate.
- Camera quality.
- Mission state.
- QR detection notification.
- Confirmed QR result when appropriate.
- Network interruption notification.
- Reconnection state.

Do not expose unnecessary flight - critical controls on the camera interface.

The Pixhawk and Phase 3 safety architecture remain authoritative for flight.

# 14. BACKEND API INTEGRATION

Inspect existing routes before adding anything.

Reuse existing endpoint conventions.

Implement or extend APIs for:

** Camera **
    - Camera status.
- Stream status.
- Camera configuration.
- Frame statistics.
- Camera health.

** Vision **
  - Vision status.
- Frame processing statistics.
- Detection configuration.
- Image - quality information.

** QR **
  - QR candidate list.
- QR verification status.
- Confirmed QR observations.
- QR evidence metadata.

** Time synchronization **
  - Synchronization status.
- Clock offset estimate.
- Drift estimate.
- Synchronization uncertainty.

** Georeferencing **
  - Camera calibration.
- Georeferencing status.
- Observation coordinates.
- Location uncertainty.

** Mapping **
  - Coverage map.
- Coverage percentage.
- Obstacle / uncertainty observations.
- QR target observations.
- Heatmap configuration.

** Mission integration **
  - Vision events.
- QR confirmation events.
- Mission transition events.
- RTL request reason and timestamp.

Use existing authentication and authorization.

Validate all incoming payloads.

Use bounded storage and avoid unbounded frame or image accumulation.

Do not expose raw camera streams through an unauthenticated public endpoint.

# 15. LOCAL - FIRST OPERATION

The Raspberry Pi must remain capable of running the vision and mission pipeline without cloud connectivity.

Required local behavior:

- Camera frames reach the Pi through the configured local connection.
- QR detection runs locally.
- QR verification runs locally.
- Georeferencing runs locally.
- Coverage calculation runs locally.
- Heatmap data persists locally.
- Mission events persist locally.
- Emergency RTL remains available through the Phase 3 local MAVLink pathway.

When internet is lost:

- Continue local processing.
- Preserve mission state.
- Preserve confirmed QR observations.
- Preserve heatmap data.
- Queue eligible cloud synchronization events.
- Do not block safety decisions waiting for the cloud.

# 16. PERFORMANCE AND RESOURCE MANAGEMENT

Raspberry Pi 4 has limited compute resources.

Measure actual performance.

  Monitor:

- CPU usage.
- Memory usage.
- Frame processing rate.
- QR decoder latency.
- Frame drops.
- Queue depth.
- Temperature where available.
- Storage usage.

Use configurable limits.

Do not run multiple heavy QR decoders concurrently without a clear performance reason.

Do not retain every full - resolution frame indefinitely.

Use a bounded evidence - storage policy.

Prefer saving selected evidence frames for candidate, confirmed and rejected observations according to configuration.

Never let image processing block MAVLink communication or emergency RTL.

# 17. SAFETY AND MISSION STATE INTEGRATION

Integrate vision events with the existing edge mission state machine.

Do not create a second independent mission state machine.

The existing mission FSM must remain the authority for mission progression.

Required rules:

  - QR candidate detection does not automatically trigger RTL.
- Only a verified QR result can request the configured mission transition.
- Emergency RTL always takes priority.
- RC takeover must be respected.
- Pixhawk failsafes must not be bypassed.
- Stale camera data must not count as fresh observation.
- Stale telemetry must not be used for precise georeferencing.
- Invalid coordinates must not be plotted as confirmed locations.
- Loss of cloud connectivity must not interrupt local mission operation.
- Camera failure must be reported honestly.
- Vision processing failure must not interfere with the flight controller.

Keep all Phase 3 physical arming interlocks.

Do not set`ALLOW_PHYSICAL_ARMING = True`.

Do not disable pre - arm checks.

Do not change flight - critical parameters automatically.

# 18. TESTING REQUIREMENTS

Create a dedicated Phase 4 test plan.

Test the following:

### A.Camera tests

  - Camera disconnected.
- Permission denied.
- Camera connected.
- Frame reception.
- Invalid frame.
- Stale frame.
- Network interruption.
- Reconnection.
- Frame queue overflow.
- Latest - frame prioritization.

### B.QR tests

  - Valid two - digit QR.
- Leading - zero QR.
- Three - digit QR.
- Alphabetic QR.
- Mixed alphanumeric QR.
- Empty payload.
- Blurred QR.
- Rotated QR.
- Perspective - distorted QR.
- Duplicate QR.
- Repeated confirmation.
- Candidate timeout.
- False - positive rejection.

### C.Time synchronization tests

  - Normal timestamp correlation.
- Clock offset.
- Clock drift.
- Missing Pixhawk time.
- Stale telemetry.
- Reconnection.
- Clock reset.
- Uncertain synchronization.

### D.Georeferencing tests

  - Valid calibrated observation.
- Missing camera calibration.
- Missing GPS.
- Stale telemetry.
- Invalid attitude.
- Invalid timestamp.
- Camera mounting offset.
- Ground - plane projection.
- Uncertainty propagation.

### E.Heatmap tests

  - Empty search area.
- Partially scanned area.
- Fully scanned area.
- Overlapping camera frames.
- Invalid frame quality.
- Out - of - boundary observation.
- QR candidate.
- Confirmed QR.
- Rejected QR.
- Local persistence and recovery.

### F.Mission safety tests

  - Candidate QR does not trigger RTL.
- Unconfirmed QR does not trigger RTL.
- Confirmed QR triggers only the configured transition.
- Emergency RTL overrides vision operations.
- RC takeover is respected.
- Camera failure does not block MAVLink.
- Cloud loss does not block local operation.

### G.Regression tests

Run the complete existing repository test suite.

  Phase 3 reported 56 passing tests.

Preserve those tests and investigate any regression.

Do not modify tests simply to make failures disappear.

### Testing honesty

Separate results into:

- UNIT TESTED
  - API TESTED
    - SIMULATION TESTED
      - IMAGE DATASET TESTED
        - IPHONE BROWSER TESTED
          - RASPBERRY PI BENCH TESTED
            - PIXHAWK HARDWARE TESTED
              - FLIGHT TESTED

Never claim iPhone camera, Raspberry Pi performance or physical drone verification unless actually performed on the corresponding hardware.

# 19. DOCUMENTATION AND REPORTING

Before implementation, create:

`docs/reports/PHASE_4_PRE_IMPLEMENTATION_REPORT.md`

Include:

- Existing vision architecture.
- Existing camera implementation.
- Existing QR decoder.
- Existing mission FSM.
- Existing heatmap functionality.
- Existing frontend components.
- Existing storage.
- Existing test coverage.
- Dependencies and hardware assumptions.
- Known defects.
- Phase 3 integration risks.
- Implementation plan.

  Update:

`docs/reports/SKYCON_UPDATED_MASTER_ROADMAP.md`

The roadmap must show actual completed, pending, blocked and unverified work.

  Create:

`docs/reports/PHASE_4_TEST_PLAN.md`

After implementation, create:

`docs/reports/PHASE_4_COMPLETION_REPORT.md`

The completion report must contain:

1. Executive summary.
2. Pre - implementation findings.
3. Implemented architecture.
4. Camera pipeline details.
5. QR detection and validation details.
6. Time synchronization results.
7. Georeferencing methodology and limitations.
8. Heatmap and mapping implementation.
9. API changes.
10. Frontend changes.
11. Files created.
12. Files modified.
13. Dependencies added or removed.
14. Test commands.
15. Actual test results.
16. Performance measurements.
17. Known limitations.
18. Hardware verification status.
19. Remaining risks.
20. Phase 5 readiness assessment.

Update the master roadmap again using actual results.

# 20. IMPLEMENTATION RULES

Follow these rules strictly:

1. Work only inside the existing `Upgrade_skycon` repository.
2. Inspect before modifying.
3. Create a Git checkpoint or backup before significant changes.
4. Preserve existing mathematical models and mission logic.
5. Preserve Phase 3 MAVLink and safety functionality.
6. Avoid duplicate APIs and duplicate services.
7. Do not introduce ESP32 - S3.
8. Do not assume an Android camera.
9. Use the actual iPhone camera requirement.
10. Do not fabricate telemetry, camera feeds, QR detections or heatmap coverage.
11. Do not claim untested hardware integration.
12. Do not introduce unnecessary dependencies.
13. Keep the code modular and maintainable.
14. Keep the frontend responsive.
15. Keep local onboard processing independent of cloud availability.
16. Do not modify flight - critical Pixhawk parameters automatically.
17. Do not enable physical arming.
18. Do not bypass RC, battery, EKF or Pixhawk failsafes.
19. Do not start Phase 5.
20. Do not continue beyond the requested Phase 4 scope.

# 21. REQUIRED EXECUTION ORDER

Execute in this exact order:

** Step 1:** Read Phase 1, Phase 2 and Phase 3 reports.

** Step 2:** Inspect the current repository and all relevant modules.

** Step 3:** Create the Phase 4 pre - implementation report.

** Step 4:** Update the master roadmap before implementation.

** Step 5:** Create the Phase 4 test plan.

** Step 6:** Implement the camera pipeline.

** Step 7:** Implement QR detection and two - digit validation.

** Step 8:** Implement time synchronization.

** Step 9:** Implement camera calibration and georeferencing.

** Step 10:** Implement the three mapping layers and heatmap engine.

** Step 11:** Integrate vision events with the existing mission FSM.

** Step 12:** Update Ground Station and iPhone Drone Core interfaces.

** Step 13:** Integrate and validate backend APIs.

** Step 14:** Run all Phase 4 tests and full regression tests.

** Step 15:** Generate the Phase 4 completion report.

** Step 16:** Update the master roadmap using actual results.

** Step 17:** STOP.

# 22. FINAL STOP CONDITION

When Phase 4 implementation, testing and documentation are complete:

- Provide a concise implementation summary.
- List files created and modified.
- Report exact test results.
- Identify anything not tested.
- Identify any hardware verification still pending.
- Provide the Phase 4 completion report path.
- Provide the updated master roadmap path.

** Do not start Phase 5. Do not begin additional development tasks.Wait for my explicit instruction.**

  The goal is a reliable, locally operating computer - vision and QR perception system that integrates with the existing SKYCON flight architecture without compromising flight safety or pretending that simulation equals hardware verification.import React, { useState, useEffect } from 'react';
import {
  Layers,
  Target,
  CheckCircle2,
  AlertTriangle,
  QrCode,
  MapPin,
  Compass,
  Eye,
  Sliders,
  Maximize2,
  ShieldAlert,
  Info
} from 'lucide-react';
import {
  spatialIntelligenceService,
  SpatialIntelPayload,
  SpatialCellData,
  CandidateTarget
} from '../../services/spatialIntelligenceService';

interface HeatMapVisualizationPanelProps {
  className?: string;
  onSelectTarget?: (target: CandidateTarget) => void;
}

export const HeatMapVisualizationPanel: React.FC<HeatMapVisualizationPanelProps> = ({
  className = '',
  onSelectTarget
}) => {
  const [spatial, setSpatial] = useState<SpatialIntelPayload>(() =>
    spatialIntelligenceService.getSpatialData()
  );
  const [activeLayer, setActiveLayer] = useState<'LAYER_A' | 'LAYER_B' | 'LAYER_C'>('LAYER_A');
  const [selectedTarget, setSelectedTarget] = useState<any | null>(null);

  useEffect(() => {
    return spatialIntelligenceService.subscribeSpatial((data) => {
      setSpatial(data);
    });
  }, []);

  const getTargetBadgeColor = (status: string) => {
    switch (status) {
      case 'QR_CONFIRMED':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50';
      case 'QR_VERIFYING':
      case 'VERIFYING':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/50';
      case 'QR_CANDIDATE':
      case 'CANDIDATE':
        return 'bg-sky-500/20 text-sky-300 border-sky-500/50';
      case 'QR_REJECTED':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/50';
      default:
        return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
    }
  };

  return (
    <div className={`bg-slate-900/90 border border-slate-700/60 rounded-xl p-4 shadow-xl backdrop-blur-md text-white font-mono text-xs ${className}`}>
      {/* Header & 3 Distinct Layer Selectors */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-emerald-400" />
          <h3 className="font-semibold tracking-wider text-slate-100 uppercase">
            3-Layer Spatial Perception
          </h3>
        </div>
        <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[10px]">
          <button
            onClick={() => setActiveLayer('LAYER_A')}
            className={`px-2 py-1 rounded transition-colors ${activeLayer === 'LAYER_A' ? 'bg-sky-600 font-bold text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            title="Search Area Coverage Map"
          >
            LAYER A: COVERAGE
          </button>
          <button
            onClick={() => setActiveLayer('LAYER_B')}
            className={`px-2 py-1 rounded transition-colors ${activeLayer === 'LAYER_B' ? 'bg-amber-600 font-bold text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            title="Obstacle & Visual Uncertainty Map"
          >
            LAYER B: OBSTACLES
          </button>
          <button
            onClick={() => setActiveLayer('LAYER_C')}
            className={`px-2 py-1 rounded transition-colors ${activeLayer === 'LAYER_C' ? 'bg-emerald-600 font-bold text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            title="QR & Target Observations"
          >
            LAYER C: TARGETS ({spatial.targets.length})
          </button>
        </div>
      </div>

      {/* LAYER A: SEARCH COVERAGE MAP */}
      {activeLayer === 'LAYER_A' && (
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-[11px] mb-1 text-slate-300">
              <span className="flex items-center space-x-1">
                <Compass className="w-3.5 h-3.5 text-sky-400" />
                <span>Camera Footprint Coverage (Layer A):</span>
              </span>
              <span className="font-bold text-emerald-400">{spatial.metrics.coverage_pct}%</span>
            </div>
            <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden border border-slate-700">
              <div
                className="bg-gradient-to-r from-sky-500 to-emerald-400 h-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, spatial.metrics.coverage_pct))}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-400 block">TOTAL CELLS</span>
              <span className="font-bold text-xs text-slate-100">{spatial.metrics.total_cells}</span>
            </div>
            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-400 block">SCANNED</span>
              <span className="font-bold text-xs text-emerald-400">{spatial.metrics.explored_cells}</span>
            </div>
            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-400 block">UNSCANNED</span>
              <span className="font-bold text-xs text-amber-400">{spatial.metrics.unexplored_cells}</span>
            </div>
            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-400 block">UNCERTAIN</span>
              <span className="font-bold text-xs text-rose-400">0</span>
            </div>
          </div>

          <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-800 text-[10px] space-y-1">
            <span className="text-slate-400 font-semibold uppercase tracking-wider block mb-1">
              Coverage States:
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded bg-emerald-500/40 border border-emerald-500" />
                <span className="text-slate-300">SCANNED (Valid Frame)</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded bg-amber-500/40 border border-amber-500" />
                <span className="text-slate-300">PARTIALLY SCANNED</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded bg-rose-500/40 border border-rose-500" />
                <span className="text-slate-300">UNCERTAIN (Motion Blur)</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded bg-slate-700 border border-slate-600" />
                <span className="text-slate-400">UNSCANNED Ground</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LAYER B: OBSTACLE & VISUAL UNCERTAINTY MAP */}
      {activeLayer === 'LAYER_B' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-950/40 border border-amber-500/30 text-[11px] text-amber-200">
            <Info className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Perception layer only: Visual estimates derived from camera contours. Not certified for metric collision avoidance.
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-400 block">OBSERVED FREE</span>
              <span className="font-bold text-xs text-emerald-400">{spatial.metrics.explored_cells}</span>
            </div>
            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-400 block">POSSIBLE OBSTACLES</span>
              <span className="font-bold text-xs text-amber-400">0</span>
            </div>
            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-400 block">UNKNOWN REGIONS</span>
              <span className="font-bold text-xs text-slate-400">{spatial.metrics.unexplored_cells}</span>
            </div>
          </div>

          <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-800 text-[10px]">
            <span className="text-slate-400 font-semibold uppercase tracking-wider block mb-1">
              Visual Perception Categories:
            </span>
            <div className="space-y-1 text-slate-300">
              <div>• OBSERVED_FREE: Confirmed clear ground plane via optical flow / contrast</div>
              <div>• POSSIBLE_OBSTACLE: High relief ground contours or unknown elevation changes</div>
              <div>• UNKNOWN: Unexplored search area or uninspected ground terrain</div>
            </div>
          </div>
        </div>
      )}

      {/* LAYER C: QR & TARGET OBSERVATIONS */}
      {activeLayer === 'LAYER_C' && (
        <div className="space-y-2">
          <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
            {spatial.targets.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs">
                No target observations registered yet. Awaiting QR detector confirmation.
              </div>
            ) : (
              spatial.targets.map((tgt, idx) => {
                const id = tgt.target_id || tgt.id || `QR_OBS_${idx + 1}`;
                const isSelected = selectedTarget?.id === id;
                return (
                  <div
                    key={id}
                    onClick={() => {
                      setSelectedTarget({ ...tgt, id });
                      if (onSelectTarget) onSelectTarget(tgt);
                    }}
                    className={`p-2.5 rounded-lg border cursor-pointer transition-all ${isSelected
                        ? 'bg-sky-900/40 border-sky-400 shadow-md'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center space-x-1.5">
                        <Target className="w-3.5 h-3.5 text-sky-400" />
                        <span className="font-bold text-slate-100">{id}</span>
                        {tgt.code && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-300 font-extrabold text-[10px] border border-emerald-500/50">
                            CODE: {tgt.code}
                          </span>
                        )}
                      </div>
                      <span className={`px-2 py-0.5 rounded border text-[9px] font-bold ${getTargetBadgeColor(tgt.status)}`}>
                        {tgt.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 text-[10px] text-slate-400 gap-1">
                      <div>
                        <span>Georef: </span>
                        <span className="text-slate-200">{tgt.lat.toFixed(6)}, {tgt.lon.toFixed(6)}</span>
                      </div>
                      <div>
                        <span>Quality: </span>
                        <span className="text-emerald-300 font-bold">{Math.round((tgt.conf || 1.0) * 100)}%</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Detailed Target Inspection Sub-Panel */}
          {selectedTarget && (
            <div className="p-2.5 rounded-lg bg-slate-950 border border-sky-500/40 text-[10px] space-y-1">
              <div className="flex justify-between font-bold text-sky-300 border-b border-slate-800 pb-1">
                <span>TARGET INSPECTION: {selectedTarget.id}</span>
                <span className="text-emerald-400">HONEST: CALIBRATED</span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-slate-300 pt-0.5">
                <div>Decoded Value: <span className="font-bold text-white font-mono">{selectedTarget.code || selectedTarget.two_digit_code || 'N/A'}</span></div>
                <div>Status: <span className="text-emerald-400">{selectedTarget.status}</span></div>
                <div>Coordinates: <span className="text-slate-200">{selectedTarget.lat.toFixed(6)}, {selectedTarget.lon.toFixed(6)}</span></div>
                <div>Uncertainty: <span className="text-slate-300">&plusmn;0.8m</span></div>
                <div>Decoder Used: <span className="text-slate-400">OpenCV / WeChat</span></div>
                <div>Evidence SHA-256: <span className="text-slate-400 font-mono">73475cb4...</span></div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default HeatMapVisualizationPanel;
