# CoordinateQualityState

> God node · 78 connections · [backend\coordinate_validator.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/coordinate_validator.py#L41)

## Call Trace Diagram

```mermaid
sequenceDiagram
    participant P0 as CoordinateQualityState
    participant P1 as CoordinatePackage
    participant P2 as ValidatedCoordinate
    participant P3 as TestHybridConnectivityAndAutonomy
    participant P4 as Resets local cell coverage tracker for a new sortie.
    participant P5 as RouteValidator
    participant P6 as .validate_coordinate()
    participant P7 as Verifies Flask endpoints (PythonAnywhere WSGI compatibility) respond cleanly.
    participant P8 as CoordinatePackageManager
    participant P9 as ================================================================================
    participant P10 as Exhaustive test suite for hybrid online/offline UAV autonomy and failover.
    participant P11 as Verifies multi-hotspot profiles are strictly sorted by priority (1=Primary, 2=Se
    participant P12 as Verifies passwords are never returned in get_status(), API endpoints, or seriali
    participant P13 as Verifies that when primary hotspot fails, watchdog sequentially advances to seco
    participant P14 as Verifies that failover continues to backup and cleanly wraps back to primary if
    participant P15 as Verifies that while connected to secondary, stability period prevents rapid thra
    participant P16 as Verifies that a valid coordinate within geofence and envelope receives HIGH_CONF
    participant P17 as Verifies that (0.0, 0.0) Null Island coordinates are strictly REJECTED.
    participant P18 as Verifies coordinates with latitude > 90 or longitude > 180 are REJECTED.
    participant P19 as Verifies targets outside configured maximum geofence radius are REJECTED.
    participant P20 as Verifies altitude below 5.0m AGL or above 25.0m AGL is REJECTED.
    participant P21 as Verifies coordinates older than max age (30s) are REJECTED.
    participant P22 as Verifies that a visual candidate with < 3 frames is quarantined as UNVERIFIED /
    participant P23 as Verifies that coordinate packages compute deterministic SHA-256 and validate cle
    participant P24 as Verifies that a coordinate package with an altered coordinate or mismatched chec
    participant P25 as Verifies valid coordinate packages convert to ArduCopter MISSION_ITEM_INT comman
    participant P26 as Verifies local 2D grid matrix marks visited cells based on camera footprint with
    participant P27 as Verifies coverage tracker cleanly resets all cells for a new sortie.
    participant P28 as Verifies that when internet is severed, companion continues mission and spools o
    participant P29 as Verifies FastAPI endpoints for hotspot management, coordinate validation, and co
    participant P30 as Atomically saves package to SimpleJsonStore.
    participant P31 as SKYCON System — Unified Master Backend & Raspberry Pi 4 Companion Server Replac
    participant P32 as Thread-safe callback from MAVLinkMultiplexer when a valid MAVLink frame arrives.
    participant P33 as Broadcasts raw binary MAVLink frames to connected WebSockets.
    participant P34 as Broadcasts telemetry frames to connected WebSockets at 10 Hz.
    participant P35 as Health check endpoint for Render / Local watchdog.
    participant P36 as Returns Raspberry Pi 4 hardware metrics and telemetry status.
    participant P37 as Returns latest telemetry snapshot.
    participant P38 as Returns complete autopilot state and telemetry.
    participant P39 as Returns circular telemetry history buffer.
    participant P40 as Synchronizes geofence limits with Pixhawk MAVLink parameters.
    participant P41 as Generates boundary-constrained reconnaissance path (boustrophedon / spiral).
    participant P42 as Validates candidate route against boundary geofence, altitude, and competition b
    participant P43 as Estimates flight duration and battery consumption for given waypoints or distanc
    participant P44 as Returns official ADDC 2026 competition stages and current progression.
    participant P45 as Returns detailed mission state, competition clock, and 4-digit code progress.
    participant P46 as Records Flight Marshal authorization before flight.
    participant P47 as Validates and uploads waypoint list to Pixhawk via MAVLink mission transfer prot
    participant P48 as Submits ground operative 2-digit puzzle solution to combine with aerial QR.
    participant P49 as Confirms physical intelligence cache unlocked by ground operative.
    participant P50 as Confirms intelligence package secured and triggers autonomous RTL.
    participant P51 as Operator abort triggering safe local RTL.
    participant P52 as Ingests live camera frames pushed from the mounted smartphone Drone Core interfa
    participant P53 as MJPEG streaming endpoint for GCS live camera preview.
    participant P54 as Generates an exhaustive audit of Pi 4 hardware, power, UART, RC, camera, and net
    participant P55 as Exports timestamped hardware diagnostic report to disk.
    participant P56 as Returns the current status of outbound 4G/Cloud synchronization.
    participant P57 as Manually triggers an outbound synchronization cycle to PythonAnywhere cloud.
    participant P58 as Cloud receiver endpoint to ingest companion event and audit records.
    participant P59 as Returns authoritative Raspberry Pi mobile hotspot, internet, and cloud sync stat
    participant P60 as Returns combined wireless communication and mobile hotspot network diagnostics f
    participant P61 as Provisions mobile hotspot credentials securely onto Raspberry Pi 4.     Passphr
    participant P62 as Triggers an immediate network probe and OS reconnection attempt.
    participant P63 as Lists configured mobile hotspot profiles with priorities (zero secrets exposed).
    participant P64 as Configures or updates a mobile hotspot profile with priority.
    participant P65 as Deletes a configured hotspot profile.
    participant P66 as Validates an individual coordinate against geofence and safety invariants.
    participant P67 as Ingests versioned coordinate package, validates all coordinates independently on
    participant P68 as Returns the latest validated coordinate package.
    participant P69 as Returns real-time local cell coverage matrix and scan metrics (100% offline).
    participant P70 as ================================================================================
    participant P71 as Standardized versioned container transporting validated navigation targets
    participant P72 as Computes deterministic SHA-256 hash of coordinates and metadata.
    participant P73 as Manages receipt, validation, persistence, and Pixhawk upload of versioned coordi
    participant P74 as Creates a signed, versioned coordinate package.
    participant P75 as Ingests an external coordinate package (e.g. from PythonAnywhere cloud heatmap),
    participant P76 as Translates validated coordinates into ArduCopter MAVLink MISSION_ITEM_INT items.
    participant P77 as ValidationDecision
    participant P78 as .receive_and_validate_package()
    participant P79 as .create_package()
    P0->>+ P1: uses
    P1-->>- P0: return
    P1->>+ P2: uses
    P2-->>- P1: return
    P2->>+ P1: uses
    P1-->>- P2: return
    P2->>+ P3: uses
    P3-->>- P2: return
    P2->>+ P4: uses
    P4-->>- P2: return
    P2->>+ P5: uses
    P5-->>- P2: return
    P2->>+ P6: calls
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
    P2->>+ P43: uses
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
    P2->>+ P68: uses
    P68-->>- P2: return
    P2->>+ P69: uses
    P69-->>- P2: return
    P2->>+ P70: uses
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
    P1->>+ P0: uses
    P0-->>- P1: return
    P1->>+ P77: uses
    P77-->>- P1: return
    P1->>+ P3: uses
    P3-->>- P1: return
    P1->>+ P4: uses
    P4-->>- P1: return
    P1->>+ P7: uses
    P7-->>- P1: return
    P1->>+ P78: calls
    P78-->>- P1: return
    P1->>+ P79: calls
    P79-->>- P1: return
    P1->>+ P9: uses
    P9-->>- P1: return
    P1->>+ P10: uses
    P10-->>- P1: return
    P1->>+ P11: uses
    P11-->>- P1: return
    P1->>+ P12: uses
    P12-->>- P1: return
    P1->>+ P13: uses
    P13-->>- P1: return
    P1->>+ P14: uses
    P14-->>- P1: return
    P1->>+ P15: uses
    P15-->>- P1: return
    P1->>+ P16: uses
    P16-->>- P1: return
    P1->>+ P17: uses
    P17-->>- P1: return
    P1->>+ P18: uses
    P18-->>- P1: return
    P1->>+ P19: uses
    P19-->>- P1: return
    P1->>+ P20: uses
    P20-->>- P1: return
    P1->>+ P21: uses
    P21-->>- P1: return
    P1->>+ P22: uses
    P22-->>- P1: return
    P1->>+ P23: uses
    P23-->>- P1: return
    P1->>+ P24: uses
    P24-->>- P1: return
    P1->>+ P25: uses
    P25-->>- P1: return
    P1->>+ P26: uses
    P26-->>- P1: return
    P1->>+ P27: uses
    P27-->>- P1: return
    P1->>+ P28: uses
    P28-->>- P1: return
    P1->>+ P29: uses
    P29-->>- P1: return
    P1->>+ P31: uses
    P31-->>- P1: return
    P1->>+ P32: uses
    P32-->>- P1: return
    P1->>+ P33: uses
    P33-->>- P1: return
    P1->>+ P34: uses
    P34-->>- P1: return
    P1->>+ P35: uses
    P35-->>- P1: return
    P1->>+ P36: uses
    P36-->>- P1: return
    P1->>+ P37: uses
    P37-->>- P1: return
    P1->>+ P38: uses
    P38-->>- P1: return
    P1->>+ P39: uses
    P39-->>- P1: return
    P1->>+ P40: uses
    P40-->>- P1: return
    P1->>+ P41: uses
    P41-->>- P1: return
    P1->>+ P42: uses
    P42-->>- P1: return
    P1->>+ P43: uses
    P43-->>- P1: return
    P1->>+ P44: uses
    P44-->>- P1: return
    P1->>+ P45: uses
    P45-->>- P1: return
    P1->>+ P46: uses
    P46-->>- P1: return
    P1->>+ P47: uses
    P47-->>- P1: return
    P1->>+ P48: uses
    P48-->>- P1: return
    P1->>+ P49: uses
    P49-->>- P1: return
    P1->>+ P50: uses
    P50-->>- P1: return
    P1->>+ P51: uses
    P51-->>- P1: return
    P1->>+ P52: uses
    P52-->>- P1: return
    P1->>+ P53: uses
    P53-->>- P1: return
    P1->>+ P54: uses
    P54-->>- P1: return
    P1->>+ P55: uses
    P55-->>- P1: return
    P1->>+ P56: uses
    P56-->>- P1: return
    P1->>+ P57: uses
    P57-->>- P1: return
    P1->>+ P58: uses
    P58-->>- P1: return
    P1->>+ P59: uses
    P59-->>- P1: return
    P1->>+ P60: uses
    P60-->>- P1: return
    P1->>+ P61: uses
    P61-->>- P1: return
    P1->>+ P62: uses
    P62-->>- P1: return
    P1->>+ P63: uses
    P63-->>- P1: return
    P1->>+ P64: uses
    P64-->>- P1: return
    P1->>+ P65: uses
    P65-->>- P1: return
    P1->>+ P66: uses
    P66-->>- P1: return
    P1->>+ P67: uses
    P67-->>- P1: return
    P1->>+ P68: uses
    P68-->>- P1: return
    P1->>+ P69: uses
    P69-->>- P1: return
    P0->>+ P3: uses
    P3-->>- P0: return
    P0->>+ P4: uses
    P4-->>- P0: return
    P0->>+ P5: uses
    P5-->>- P0: return
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
    P0->>+ P17: uses
    P17-->>- P0: return
    P0->>+ P18: uses
    P18-->>- P0: return
    P0->>+ P19: uses
    P19-->>- P0: return
    P0->>+ P20: uses
    P20-->>- P0: return
    P0->>+ P21: uses
    P21-->>- P0: return
    P0->>+ P22: uses
    P22-->>- P0: return
    P0->>+ P23: uses
    P23-->>- P0: return
    P0->>+ P24: uses
    P24-->>- P0: return
    P0->>+ P25: uses
    P25-->>- P0: return
    P0->>+ P26: uses
    P26-->>- P0: return
    P0->>+ P27: uses
    P27-->>- P0: return
    P0->>+ P28: uses
    P28-->>- P0: return
    P0->>+ P29: uses
    P29-->>- P0: return
    P0->>+ P30: uses
    P30-->>- P0: return
    P0->>+ P31: uses
    P31-->>- P0: return
    P0->>+ P32: uses
    P32-->>- P0: return
    P0->>+ P33: uses
    P33-->>- P0: return
    P0->>+ P34: uses
    P34-->>- P0: return
    P0->>+ P35: uses
    P35-->>- P0: return
    P0->>+ P36: uses
    P36-->>- P0: return
    P0->>+ P37: uses
    P37-->>- P0: return
    P0->>+ P38: uses
    P38-->>- P0: return
    P0->>+ P39: uses
    P39-->>- P0: return
    P0->>+ P40: uses
    P40-->>- P0: return
    P0->>+ P41: uses
    P41-->>- P0: return
    P0->>+ P42: uses
    P42-->>- P0: return
    P0->>+ P43: uses
    P43-->>- P0: return
    P0->>+ P44: uses
    P44-->>- P0: return
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
    P0->>+ P68: uses
    P68-->>- P0: return
    P0->>+ P69: uses
    P69-->>- P0: return
    P0->>+ P70: uses
    P70-->>- P0: return
    P0->>+ P71: uses
    P71-->>- P0: return
    P0->>+ P72: uses
    P72-->>- P0: return
    P0->>+ P73: uses
    P73-->>- P0: return
    P0->>+ P74: uses
    P74-->>- P0: return
    P0->>+ P75: uses
    P75-->>- P0: return
    P0->>+ P76: uses
    P76-->>- P0: return
```

## Connections by Relation

### contains
- [[coordinate_validator.py]] `EXTRACTED`

### inherits
- [[str]] `EXTRACTED`
- [[Enum]] `EXTRACTED`

### rationale_for
- [[Authoritative quality tiers for generated/observed navigation coordinates.]] `EXTRACTED`

### uses
- [[CoordinatePackage]] `INFERRED`
- [[TestHybridConnectivityAndAutonomy]] `INFERRED`
- [[Resets local cell coverage tracker for a new sortie.]] `INFERRED`
- [[RouteValidator]] `INFERRED`
- [[Verifies Flask endpoints (PythonAnywhere WSGI compatibility) respond cleanly.]] `INFERRED`
- [[CoordinatePackageManager]] `INFERRED`
- [[================================================================================]] `INFERRED`
- [[Exhaustive test suite for hybrid online/offline UAV autonomy and failover.]] `INFERRED`
- [[Verifies multi-hotspot profiles are strictly sorted by priority (1=Primary, 2=Se]] `INFERRED`
- [[Verifies passwords are never returned in get_status(), API endpoints, or seriali]] `INFERRED`
- [[Verifies that when primary hotspot fails, watchdog sequentially advances to seco]] `INFERRED`
- [[Verifies that failover continues to backup and cleanly wraps back to primary if]] `INFERRED`
- [[Verifies that while connected to secondary, stability period prevents rapid thra]] `INFERRED`
- [[Verifies that a valid coordinate within geofence and envelope receives HIGH_CONF]] `INFERRED`
- [[Verifies that (0.0, 0.0) Null Island coordinates are strictly REJECTED.]] `INFERRED`
- [[Verifies coordinates with latitude > 90 or longitude > 180 are REJECTED.]] `INFERRED`
- [[Verifies targets outside configured maximum geofence radius are REJECTED.]] `INFERRED`
- [[Verifies altitude below 5.0m AGL or above 25.0m AGL is REJECTED.]] `INFERRED`
- [[Verifies coordinates older than max age (30s) are REJECTED.]] `INFERRED`
- [[Verifies that a visual candidate with < 3 frames is quarantined as UNVERIFIED /]] `INFERRED`

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*