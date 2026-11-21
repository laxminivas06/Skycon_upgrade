# SKYCON — COMPETITION OPERATOR RUNBOOK
## SAE INDIA Autonomous Drone Development Challenge (ADDC 2026)
### Field Operations, Pre-Flight Checklists, Mission Execution & Post-Flight Protocols

---

## 1. COMPETITION TIMELINE & ROLES

### 1.1 Team Operational Roles
- **Pilot-in-Command (PIC)**: Holds MultiLink RC transmitter; maintains constant visual line-of-sight (VLOS); responsible for manual override and physical arming.
- **GCS Operator**: Operates Ground Control Station laptop; monitors telemetry, geofence, battery voltage, and mission state machine; manages 4-digit code dispatch.
- **Field Runner (Ground Operative)**: Stationed near target area with mobile device; receives 4-digit puzzle code; unlocks package cache; confirms retrieval via GCS UI.

### 1.2 Mission Timeline Summary
- **Total Flight Window**: 300 seconds (5 minutes) maximum allowable flight time.
- **Target Altitude**: 10.0 meters AGL (Search Phase).
- **Geofence Ceiling**: 15.0 meters AGL.
- **Geofence Boundary**: 50.0-meter radius cylinder centered on Home.

---

## 2. PRE-FLIGHT CHECKLIST (T-30 TO T-0 MINUTES)

### T-30 Minutes: Physical Inspection & Assembly
- [ ] Airframe inspection: Arms, motor mounts, landing gear, and fasteners tight.
- [ ] Propellers: Balanced, no nicks/cracks, proper CW/CCW orientation.
- [ ] Motors: Spin freely by hand, no bearing play, no debris.
- [ ] iPhone Camera Mount: Clean lens, verify 90° nadir tilt, verify silicone vibration isolation.
- [ ] Battery Check: Flight battery cell voltages balanced (> 4.18V/cell; 6S > 25.0V, 4S > 16.7V).
- [ ] Transmitter Check: MultiLink TX battery > 80%; sticks calibrated.

### T-15 Minutes: Electronics & Diagnostics Boot
- [ ] Turn on MultiLink RC Transmitter. Throttle at minimum, mode set to `LOITER`.
- [ ] Power on GCS laptop. Connect to `SKYCON_DRONE_AP` Wi-Fi.
- [ ] Connect Drone Flight Battery. Confirm Pixhawk startup tones and RPi boot.
- [ ] Open Safari on mounted iPhone, browse to `http://192.168.4.1:8443/drone-core`, tap "START CAMERA STREAM".
- [ ] Open GCS Dashboard at `http://192.168.4.1:8443`.
- [ ] Navigate to **Hardware Diagnostics** panel and click "RUN DIAGNOSTICS":
  - [ ] CPU Temperature: < 65°C.
  - [ ] Under-Voltage Check: `PASSED` (No active or historical under-voltage).
  - [ ] Pixhawk UART Link: `HEALTHY` (Heartbeat received at 1.0 Hz).
  - [ ] MultiLink RC Link: `HEALTHY` (SBUS channels verified).
  - [ ] Camera Pipeline: `ACTIVE` (Frame rate > 10 FPS).
  - [ ] 4G Cellular Link: `ONLINE` (Cloud sync active or spooled).

### T-5 Minutes: Arena Geofence & Mission Validation
- [ ] Confirm Home Coordinates set accurately on GCS map.
- [ ] Confirm GPS Fix: Minimum 10 satellites, HDOP < 1.2.
- [ ] Upload Arena Boundary: 50m radius circular geofence centered at Home.
- [ ] Upload Target Altitude: 10.0m AGL.
- [ ] Confirm 4-Digit Puzzle Code Salt Table loaded in `mission_engine`.
- [ ] Press Pixhawk Physical Safety Switch (light changes from flashing to solid).

---

## 3. IN-FLIGHT MISSION EXECUTION (12-STAGE ADDC WORKFLOW)

| Stage | Mission State | Expected Behavior | Operator Action |
| :---: | :--- | :--- | :--- |
| **1** | `IDLE` | Drone on ground, pre-flight checks complete | Click "PREFLIGHT CHECK" on GCS |
| **2** | `PREFLIGHT` | Subsystem validation running | Confirm all sensors green |
| **3** | `READY_TO_ARM` | Armed interlock unlocked | Click "ARM & LAUNCH" |
| **4** | `TAKEOFF` | Drone climbs autonomously to 10.0m | Monitor climb rate & baro stability |
| **5** | `NAVIGATING` | Drone flies to entry point of search zone | Confirm smooth horizontal transit |
| **6** | `SEARCHING` | Boustrophedon / lawnmower scan path active | Monitor live heatmap coverage |
| **7** | `BOX_DETECTED` | Vision pipeline locks onto cardboard cuboid | Drone centers target in FOV |
| **8** | `QR_LOCKED` | Multi-frame QR detection (3 consecutive frames) | Drone stabilizes hover at 10m |
| **9** | `CODE_DECODED` | Strict 2-digit regex validated (`^\d{2}$`) | Engine computes 4-digit puzzle code |
| **10**| `TASK_PENDING` | Code dispatched to Field Runner device | Field runner unlocks target cache |
| **11**| `RETURNING` | Field runner clicks "CONFIRM RETRIEVAL" | Drone automatically initiates RTL |
| **12**| `COMPLETED` | Drone lands at Home and disarms motors | Verify motor shutdown; log time |

---

## 4. FIELD RUNNER (GROUND OPERATIVE) PROTOCOL

1. Field runner monitors mobile browser connected to GCS or cellular mirror.
2. Upon stage `CODE_DECODED`, the GCS displays the **4-digit access code** (e.g. `QR: "42"` + `Salt: "89"` -> `Code: "4289"`).
3. Field runner inputs the code into the target cache lockbox keypad.
4. Field runner retrieves the emergency rescue payload.
5. Field runner taps **"CONFIRM RETRIEVAL"** on the mobile UI.
6. The system immediately executes stage 11 (`RETURNING`), commanding Pixhawk to `RTL` mode.

---

## 5. POST-FLIGHT PROTOCOL & LOG ARCHIVAL

1. **Safety First**:
   - Confirm motors are completely disarmed before approaching the drone.
   - Unplug flight battery before handling propellers.
2. **Log Export**:
   - On GCS, click **"EXPORT DIAGNOSTIC REPORT"** (`POST /api/diagnostics/export`).
   - The system bundles:
     - `hardware_diagnostic_audit.json`
     - MAVLink telemetry history
     - QR detection records and timestamps
     - Heatmap coverage data
     - Audit trail events (`data/audit_logs.json`)
3. **Turn off MultiLink Transmitter**.
4. **Debrief**: Note flight duration (must be < 300s) and rescue mission scoring points.
