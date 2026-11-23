# QRCandidateState

> God node · 81 connections · [backend\qr_detector.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/qr_detector.py#L42)

## Call Trace Diagram

```mermaid
sequenceDiagram
    participant P0 as QRCandidateState
    participant P1 as TestPhase4VisionPerception
    participant P2 as Georeferencer
    participant P3 as CompanionVisionNode
    participant P4 as Verifies canonical REST endpoints for camera, QR, timesync, and mapping.
    participant P5 as ================================================================================
    participant P6 as Verifies camera states and bounded drop-oldest buffer behavior.
    participant P7 as Verifies brightness, contrast, and Laplacian blur detection.
    participant P8 as Verifies corrupted or non-image payloads are safely rejected without crashing.
    participant P9 as Verifies strict validation of exactly two decimal digits (^\\d{2}$).
    participant P10 as Verifies temporal multi-frame confirmation requiring 3 frames.
    participant P11 as Verifies candidate expires if observations stall before confirmation.
    participant P12 as Verifies multi-clock mapping between phone capture, companion mono, and Pixhawk
    participant P13 as Verifies 3D ground projection, attitude compensation, and honest quality tiers.
    participant P14 as Verifies explicit separation of Layer A (Coverage), Layer B (Obstacles), and Lay
    participant P15 as Verifies candidate QR or disqualified payload does NOT trigger RTL.
    participant P16 as Dedicated mobile-first Drone Core entry point.
    participant P17 as TestMilestone2EdgeVisionAndGeoreferencing
    participant P18 as SKYCON Compatibility Shim: drone_core Redirects all legacy imports to the unifi
    participant P19 as Verifies full CompanionVisionNode processing loop with synthetic video and mock
    participant P20 as Gracefully halts all child threads, capture devices, and communication ports.
    participant P21 as _MockMavlinkConsts
    participant P22 as _MockMavutil
    participant P23 as Production Onboard Vision & Georeferencing Service (companion_vision_node.py) M
    participant P24 as Unified onboard companion computer service orchestrating edge vision,     dynam
    participant P25 as Starts MAVLink listener, video ingest pipeline, and processing loops.
    participant P26 as Connects to Pixhawk TELEM1 via pymavlink and starts background telemetry thread.
    participant P27 as Dispatches MAV_CMD_SET_MESSAGE_INTERVAL to request high-rate streaming.
    participant P28 as Continuously reads incoming MAVLink packets and feeds the sync buffer.
    participant P29 as Pushes baseline flight telemetry states into sync buffer for bench test executio
    participant P30 as Switches reconnaissance lifecycle stage (STAGE_A vs STAGE_B).
    participant P31 as Enables or disables automatic braking on detection.
    participant P32 as Returns comprehensive companion node health and status metrics.
    participant P33 as Processes a single video frame:         1. Time-synchronized telemetry lookup a
    participant P34 as Posts detection JSON to GCS backend REST endpoint with non-blocking timeout.
    participant P35 as Continuous production processing loop.
    participant P36 as Comprehensive Automated Verification Test Suite for Milestone 2 Edge Vision, Ge
    participant P37 as Vector 1: Target at exact optical center with nadir attitude gives zero displace
    participant P38 as Vector 2: Target at (829.77, 218.69) with yaw=0° gives dN=1.00m, dE=1.00m.
    participant P39 as Vector 3: Pitch=-10° with yaw=90° compensates for forward tilt.
    participant P40 as Verifies circular heading interpolation across North.
    participant P41 as Verifies atomic .tmp serialization and SHA-256 validation.
    participant P42 as AdversarialGeoreferencingTests
    participant P43 as .__init__()
    participant P44 as Verifies numerical stability when radial/tangential distortion coefficients are
    participant P45 as SKYCON System — Production Flask WSGI Application & Canonical REST API Hub Stan
    participant P46 as Standardized response envelope across all API endpoints.
    participant P47 as Queues operator commands on cloud backend for retrieval by companion agent.
    participant P48 as Returns local MAVLink telemetry, or falls back to cloud-synced companion data.
    participant P49 as Streams MJPEG feed from mounted smartphone or synthetic test generator.
    participant P50 as Lightweight health probe endpoint for hosting containers & PythonAnywhere.
    participant P51 as Generates an exhaustive audit of Pi 4 hardware, power, UART, RC, camera, and net
    participant P52 as Exports timestamped hardware diagnostic report to disk.
    participant P53 as Returns the current status of outbound 4G/Cloud synchronization.
    participant P54 as Manually triggers an outbound synchronization cycle to PythonAnywhere cloud.
    participant P55 as Cloud receiver endpoint for PythonAnywhere GCS to ingest companion telemetry.
    participant P56 as Cloud receiver endpoint for PythonAnywhere GCS to ingest companion events.
    participant P57 as Returns network link health, active hotspot, and failover status.
    participant P58 as Lists configured mobile hotspot profiles with priorities (zero secrets).
    participant P59 as Configures or updates a mobile hotspot profile with priority.
    participant P60 as Deletes a configured hotspot profile.
    participant P61 as Triggers an immediate network probe and OS reconnection attempt.
    participant P62 as Validates an individual coordinate against geofence and safety invariants.
    participant P63 as Ingests versioned coordinate package, validates all coordinates independently on
    participant P64 as Returns the latest validated coordinate package.
    participant P65 as Returns real-time local cell coverage matrix and scan metrics.
    participant P66 as Resets local cell coverage tracker for a new sortie.
    participant P67 as Directly serve bundled JS/CSS Vite assets.
    participant P68 as geomapping_project()
    participant P69 as .test_optical_distortion_undistortion_stability()
    participant P70 as .test_08_attitude_compensated_georeferencing()
    participant P71 as Adversarial Stress Test Suite: 3D Georeferencing Projection Math (georeferencing
    participant P72 as Mathematical oracle: assert absolutely no NaN or Inf in any scalar or tuple fiel
    participant P73 as Stress tests roll +/-22 deg (ANGLE_MAX), pitch +/-22 deg, compound 30 deg, altit
    participant P74 as Tests continuity when yaw transitions across True North (359.9 -> 0.1 deg) and n
    participant P75 as Verifies georeferencing behavior at equator, southern hemisphere, polar bounds,
    participant P76 as Verifies mathematical linearity of ground offsets with altitude and bilateral ro
    participant P77 as .setUp()
    participant P78 as .setUp()
    participant P79 as CameraIntrinsics3D
    participant P80 as HeatmapEngine
    participant P81 as SmartphoneStreamPipeline
    participant P82 as AutonomousEdgeMissionFSM
    participant P83 as GeoreferenceResult
    participant P84 as TelemetrySyncBuffer
    participant P85 as WeChatQRDetector
    participant P86 as MockAutopilot
    participant P87 as CameraState
    participant P88 as QRDetectionResult
    participant P89 as TelemetrySnapshot
    participant P90 as GeorefHonestyLevel
    participant P91 as TimeSyncStatus
    participant P92 as SmartphoneCameraConfig
    participant P93 as MissionState
    participant P94 as SpatialCell
    participant P95 as SpatialGrid
    participant P96 as LayerCTargetStatus
    participant P97 as LayerACoverageStatus
    participant P98 as LayerBObstacleStatus
    participant P99 as TimeSynchronizationService
    participant P100 as QRCandidateTracker
    participant P101 as StreamSourceType
    participant P102 as FrameQualityMetrics
    participant P103 as Resets local cell coverage tracker for a new sortie.
    participant P104 as SKYCON System — Unified Master Backend & Raspberry Pi 4 Companion Server Replac
    participant P105 as Thread-safe callback from MAVLinkMultiplexer when a valid MAVLink frame arrives.
    participant P106 as Broadcasts raw binary MAVLink frames to connected WebSockets.
    participant P107 as Broadcasts telemetry frames to connected WebSockets at 10 Hz.
    participant P108 as Health check endpoint for Render / Local watchdog.
    participant P109 as Returns Raspberry Pi 4 hardware metrics and telemetry status.
    participant P110 as Returns latest telemetry snapshot.
    participant P111 as Returns complete autopilot state and telemetry.
    participant P112 as Returns circular telemetry history buffer.
    participant P113 as Synchronizes geofence limits with Pixhawk MAVLink parameters.
    participant P114 as Generates boundary-constrained reconnaissance path (boustrophedon / spiral).
    participant P115 as Validates candidate route against boundary geofence, altitude, and competition b
    participant P116 as Estimates flight duration and battery consumption for given waypoints or distanc
    participant P117 as Returns official ADDC 2026 competition stages and current progression.
    participant P118 as Returns detailed mission state, competition clock, and 4-digit code progress.
    participant P119 as Records Flight Marshal authorization before flight.
    participant P120 as Validates and uploads waypoint list to Pixhawk via MAVLink mission transfer prot
    participant P121 as Submits ground operative 2-digit puzzle solution to combine with aerial QR.
    participant P122 as Confirms physical intelligence cache unlocked by ground operative.
    participant P123 as Confirms intelligence package secured and triggers autonomous RTL.
    participant P124 as Operator abort triggering safe local RTL.
    participant P125 as Ingests live camera frames pushed from the mounted smartphone Drone Core interfa
    participant P126 as MJPEG streaming endpoint for GCS live camera preview.
    participant P127 as Generates an exhaustive audit of Pi 4 hardware, power, UART, RC, camera, and net
    participant P128 as Exports timestamped hardware diagnostic report to disk.
    participant P129 as Returns the current status of outbound 4G/Cloud synchronization.
    participant P130 as Manually triggers an outbound synchronization cycle to PythonAnywhere cloud.
    participant P131 as Cloud receiver endpoint to ingest companion event and audit records.
    participant P132 as Returns authoritative Raspberry Pi mobile hotspot, internet, and cloud sync stat
    participant P133 as Returns combined wireless communication and mobile hotspot network diagnostics f
    participant P134 as Provisions mobile hotspot credentials securely onto Raspberry Pi 4.     Passphr
    participant P135 as Triggers an immediate network probe and OS reconnection attempt.
    participant P136 as Lists configured mobile hotspot profiles with priorities (zero secrets exposed).
    participant P137 as Configures or updates a mobile hotspot profile with priority.
    participant P138 as Deletes a configured hotspot profile.
    participant P139 as Validates an individual coordinate against geofence and safety invariants.
    participant P140 as Ingests versioned coordinate package, validates all coordinates independently on
    participant P141 as Returns the latest validated coordinate package.
    participant P142 as Returns real-time local cell coverage matrix and scan metrics (100% offline).
    P0->>+ P1: uses
    P1-->>- P0: return
    P1->>+ P2: uses
    P2-->>- P1: return
    P2->>+ P3: uses
    P3-->>- P2: return
    P2->>+ P1: uses
    P1-->>- P2: return
    P2->>+ P4: uses
    P4-->>- P2: return
    P2->>+ P5: uses
    P5-->>- P2: return
    P2->>+ P6: uses
    P6-->>- P2: return
    P2->>+ P7: uses
    P7-->>- P2: return
    P2->>+ P8: uses
    P8-->>- P2: return
    P2->>+ P9: uses
    P9-->>- P2: return
    P2->>+ P10: uses
    P10-->>- P2: return
    P2->>+ P11: uses
    P11-->>- P2: return
    P2->>+ P12: uses
    P12-->>- P2: return
    P2->>+ P13: uses
    P13-->>- P2: return
    P2->>+ P14: uses
    P14-->>- P2: return
    P2->>+ P15: uses
    P15-->>- P2: return
    P2->>+ P16: uses
    P16-->>- P2: return
    P2->>+ P17: uses
    P17-->>- P2: return
    P2->>+ P18: uses
    P18-->>- P2: return
    P2->>+ P19: uses
    P19-->>- P2: return
    P2->>+ P20: uses
    P20-->>- P2: return
    P2->>+ P21: uses
    P21-->>- P2: return
    P2->>+ P22: uses
    P22-->>- P2: return
    P2->>+ P23: uses
    P23-->>- P2: return
    P2->>+ P24: uses
    P24-->>- P2: return
    P2->>+ P25: uses
    P25-->>- P2: return
    P2->>+ P26: uses
    P26-->>- P2: return
    P2->>+ P27: uses
    P27-->>- P2: return
    P2->>+ P28: uses
    P28-->>- P2: return
    P2->>+ P29: uses
    P29-->>- P2: return
    P2->>+ P30: uses
    P30-->>- P2: return
    P2->>+ P31: uses
    P31-->>- P2: return
    P2->>+ P32: uses
    P32-->>- P2: return
    P2->>+ P33: uses
    P33-->>- P2: return
    P2->>+ P34: uses
    P34-->>- P2: return
    P2->>+ P35: uses
    P35-->>- P2: return
    P2->>+ P36: uses
    P36-->>- P2: return
    P2->>+ P37: uses
    P37-->>- P2: return
    P2->>+ P38: uses
    P38-->>- P2: return
    P2->>+ P39: uses
    P39-->>- P2: return
    P2->>+ P40: uses
    P40-->>- P2: return
    P2->>+ P41: uses
    P41-->>- P2: return
    P2->>+ P42: uses
    P42-->>- P2: return
    P2->>+ P43: calls
    P43-->>- P2: return
    P2->>+ P44: uses
    P44-->>- P2: return
    P2->>+ P45: uses
    P45-->>- P2: return
    P2->>+ P46: uses
    P46-->>- P2: return
    P2->>+ P47: uses
    P47-->>- P2: return
    P2->>+ P48: uses
    P48-->>- P2: return
    P2->>+ P49: uses
    P49-->>- P2: return
    P2->>+ P50: uses
    P50-->>- P2: return
    P2->>+ P51: uses
    P51-->>- P2: return
    P2->>+ P52: uses
    P52-->>- P2: return
    P2->>+ P53: uses
    P53-->>- P2: return
    P2->>+ P54: uses
    P54-->>- P2: return
    P2->>+ P55: uses
    P55-->>- P2: return
    P2->>+ P56: uses
    P56-->>- P2: return
    P2->>+ P57: uses
    P57-->>- P2: return
    P2->>+ P58: uses
    P58-->>- P2: return
    P2->>+ P59: uses
    P59-->>- P2: return
    P2->>+ P60: uses
    P60-->>- P2: return
    P2->>+ P61: uses
    P61-->>- P2: return
    P2->>+ P62: uses
    P62-->>- P2: return
    P2->>+ P63: uses
    P63-->>- P2: return
    P2->>+ P64: uses
    P64-->>- P2: return
    P2->>+ P65: uses
    P65-->>- P2: return
    P2->>+ P66: uses
    P66-->>- P2: return
    P2->>+ P67: uses
    P67-->>- P2: return
    P2->>+ P68: calls
    P68-->>- P2: return
    P2->>+ P69: calls
    P69-->>- P2: return
    P2->>+ P70: calls
    P70-->>- P2: return
    P2->>+ P71: uses
    P71-->>- P2: return
    P2->>+ P72: uses
    P72-->>- P2: return
    P2->>+ P73: uses
    P73-->>- P2: return
    P2->>+ P74: uses
    P74-->>- P2: return
    P2->>+ P75: uses
    P75-->>- P2: return
    P2->>+ P76: uses
    P76-->>- P2: return
    P2->>+ P77: calls
    P77-->>- P2: return
    P2->>+ P78: calls
    P78-->>- P2: return
    P1->>+ P79: uses
    P79-->>- P1: return
    P1->>+ P0: uses
    P0-->>- P1: return
    P1->>+ P80: uses
    P80-->>- P1: return
    P1->>+ P81: uses
    P81-->>- P1: return
    P1->>+ P82: uses
    P82-->>- P1: return
    P1->>+ P83: uses
    P83-->>- P1: return
    P1->>+ P84: uses
    P84-->>- P1: return
    P1->>+ P85: uses
    P85-->>- P1: return
    P1->>+ P86: uses
    P86-->>- P1: return
    P1->>+ P87: uses
    P87-->>- P1: return
    P1->>+ P88: uses
    P88-->>- P1: return
    P1->>+ P89: uses
    P89-->>- P1: return
    P1->>+ P90: uses
    P90-->>- P1: return
    P1->>+ P91: uses
    P91-->>- P1: return
    P1->>+ P92: uses
    P92-->>- P1: return
    P1->>+ P93: uses
    P93-->>- P1: return
    P1->>+ P94: uses
    P94-->>- P1: return
    P1->>+ P95: uses
    P95-->>- P1: return
    P1->>+ P96: uses
    P96-->>- P1: return
    P1->>+ P97: uses
    P97-->>- P1: return
    P1->>+ P98: uses
    P98-->>- P1: return
    P1->>+ P99: uses
    P99-->>- P1: return
    P1->>+ P100: uses
    P100-->>- P1: return
    P1->>+ P101: uses
    P101-->>- P1: return
    P1->>+ P102: uses
    P102-->>- P1: return
    P0->>+ P4: uses
    P4-->>- P0: return
    P0->>+ P5: uses
    P5-->>- P0: return
    P0->>+ P6: uses
    P6-->>- P0: return
    P0->>+ P7: uses
    P7-->>- P0: return
    P0->>+ P8: uses
    P8-->>- P0: return
    P0->>+ P9: uses
    P9-->>- P0: return
    P0->>+ P10: uses
    P10-->>- P0: return
    P0->>+ P11: uses
    P11-->>- P0: return
    P0->>+ P12: uses
    P12-->>- P0: return
    P0->>+ P13: uses
    P13-->>- P0: return
    P0->>+ P14: uses
    P14-->>- P0: return
    P0->>+ P15: uses
    P15-->>- P0: return
    P0->>+ P16: uses
    P16-->>- P0: return
    P0->>+ P103: uses
    P103-->>- P0: return
    P0->>+ P45: uses
    P45-->>- P0: return
    P0->>+ P46: uses
    P46-->>- P0: return
    P0->>+ P47: uses
    P47-->>- P0: return
    P0->>+ P48: uses
    P48-->>- P0: return
    P0->>+ P49: uses
    P49-->>- P0: return
    P0->>+ P50: uses
    P50-->>- P0: return
    P0->>+ P51: uses
    P51-->>- P0: return
    P0->>+ P52: uses
    P52-->>- P0: return
    P0->>+ P53: uses
    P53-->>- P0: return
    P0->>+ P54: uses
    P54-->>- P0: return
    P0->>+ P55: uses
    P55-->>- P0: return
    P0->>+ P56: uses
    P56-->>- P0: return
    P0->>+ P57: uses
    P57-->>- P0: return
    P0->>+ P58: uses
    P58-->>- P0: return
    P0->>+ P59: uses
    P59-->>- P0: return
    P0->>+ P60: uses
    P60-->>- P0: return
    P0->>+ P61: uses
    P61-->>- P0: return
    P0->>+ P62: uses
    P62-->>- P0: return
    P0->>+ P63: uses
    P63-->>- P0: return
    P0->>+ P64: uses
    P64-->>- P0: return
    P0->>+ P65: uses
    P65-->>- P0: return
    P0->>+ P66: uses
    P66-->>- P0: return
    P0->>+ P67: uses
    P67-->>- P0: return
    P0->>+ P104: uses
    P104-->>- P0: return
    P0->>+ P105: uses
    P105-->>- P0: return
    P0->>+ P106: uses
    P106-->>- P0: return
    P0->>+ P107: uses
    P107-->>- P0: return
    P0->>+ P108: uses
    P108-->>- P0: return
    P0->>+ P109: uses
    P109-->>- P0: return
    P0->>+ P110: uses
    P110-->>- P0: return
    P0->>+ P111: uses
    P111-->>- P0: return
    P0->>+ P112: uses
    P112-->>- P0: return
    P0->>+ P113: uses
    P113-->>- P0: return
    P0->>+ P114: uses
    P114-->>- P0: return
    P0->>+ P115: uses
    P115-->>- P0: return
    P0->>+ P116: uses
    P116-->>- P0: return
    P0->>+ P117: uses
    P117-->>- P0: return
    P0->>+ P118: uses
    P118-->>- P0: return
    P0->>+ P119: uses
    P119-->>- P0: return
    P0->>+ P120: uses
    P120-->>- P0: return
    P0->>+ P121: uses
    P121-->>- P0: return
    P0->>+ P122: uses
    P122-->>- P0: return
    P0->>+ P123: uses
    P123-->>- P0: return
    P0->>+ P124: uses
    P124-->>- P0: return
    P0->>+ P125: uses
    P125-->>- P0: return
    P0->>+ P126: uses
    P126-->>- P0: return
    P0->>+ P127: uses
    P127-->>- P0: return
    P0->>+ P128: uses
    P128-->>- P0: return
    P0->>+ P129: uses
    P129-->>- P0: return
    P0->>+ P130: uses
    P130-->>- P0: return
    P0->>+ P131: uses
    P131-->>- P0: return
    P0->>+ P132: uses
    P132-->>- P0: return
    P0->>+ P133: uses
    P133-->>- P0: return
    P0->>+ P134: uses
    P134-->>- P0: return
    P0->>+ P135: uses
    P135-->>- P0: return
    P0->>+ P136: uses
    P136-->>- P0: return
    P0->>+ P137: uses
    P137-->>- P0: return
    P0->>+ P138: uses
    P138-->>- P0: return
    P0->>+ P139: uses
    P139-->>- P0: return
    P0->>+ P140: uses
    P140-->>- P0: return
    P0->>+ P141: uses
    P141-->>- P0: return
    P0->>+ P142: uses
    P142-->>- P0: return
```

## Connections by Relation

### contains
- [[qr_detector.py]] `EXTRACTED`

### inherits
- [[str]] `EXTRACTED`
- [[Enum]] `EXTRACTED`

### rationale_for
- [[Authoritative candidate verification states.]] `EXTRACTED`

### uses
- [[TestPhase4VisionPerception]] `INFERRED`
- [[Verifies canonical REST endpoints for camera, QR, timesync, and mapping.]] `INFERRED`
- [[================================================================================]] `INFERRED`
- [[Verifies camera states and bounded drop-oldest buffer behavior.]] `INFERRED`
- [[Verifies brightness, contrast, and Laplacian blur detection.]] `INFERRED`
- [[Verifies corrupted or non-image payloads are safely rejected without crashing.]] `INFERRED`
- [[Verifies strict validation of exactly two decimal digits (^\\d{2}$).]] `INFERRED`
- [[Verifies temporal multi-frame confirmation requiring 3 frames.]] `INFERRED`
- [[Verifies candidate expires if observations stall before confirmation.]] `INFERRED`
- [[Verifies multi-clock mapping between phone capture, companion mono, and Pixhawk]] `INFERRED`
- [[Verifies 3D ground projection, attitude compensation, and honest quality tiers.]] `INFERRED`
- [[Verifies explicit separation of Layer A (Coverage), Layer B (Obstacles), and Lay]] `INFERRED`
- [[Verifies candidate QR or disqualified payload does NOT trigger RTL.]] `INFERRED`
- [[Dedicated mobile-first Drone Core entry point.]] `INFERRED`
- [[Resets local cell coverage tracker for a new sortie.]] `INFERRED`
- [[SKYCON System — Production Flask WSGI Application & Canonical REST API Hub Stan]] `INFERRED`
- [[Standardized response envelope across all API endpoints.]] `INFERRED`
- [[Queues operator commands on cloud backend for retrieval by companion agent.]] `INFERRED`
- [[Returns local MAVLink telemetry, or falls back to cloud-synced companion data.]] `INFERRED`
- [[Streams MJPEG feed from mounted smartphone or synthetic test generator.]] `INFERRED`

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*