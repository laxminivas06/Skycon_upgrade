# SKYCON Phase 3 Pre-Implementation Report
**Live MAVLink Communication, Telemetry & Autopilot Integration**
**Project**: SAE INDIA Autonomous Drone Rescue & QR Mission System (ADDC 2026)
**Autopilot**: Pixhawk 2.4.8 (ArduCopter 4.x) | **Companion**: Raspberry Pi 4 Model B | **Onboard Camera**: Mounted Smartphone
**Date of Audit**: 2026-11-21
**Author**: Senior UAV Systems Architect & MAVLink Integration Engineer

---

## 1. Executive Summary & Audit Context

Phase 3 transitions SKYCON from foundational backend/API architecture to real-time autopilot communication, telemetry streaming, flight mode control, and flight safety supervision. 

Before introducing code changes, this audit inspected all existing MAVLink implementations, autopilot abstractions, parameter files, hardware documentation, and test suites.

### Missing Document Notification
In accordance with prompt instructions, the audit inspected the repository for `docs/reports/PHASE_1_COMPLETION_REPORT.md`. This file was **not present** as a standalone document; Phase 1 cleanup outcomes were historically documented in `docs/reports/REPOSITORY_AUDIT_REPORT.md` and synthesized into `docs/reports/PHASE_2_PRE_IMPLEMENTATION_REPORT.md`. This gap is noted without fabrication.

---

## 2. Current MAVLink Architecture & Multiplexer Audit

The primary MAVLink implementation resides in `backend/mavlink_multiplexer.py`:
- **Protocol**: Zero-dependency binary MAVLink v2 (magic byte `0xFD`) and v1 frame decoding, with 16-bit X.25 CRC calculation and `CRC_EXTRA` table validation.
- **Connection Logic**: Candidate port scanning (`/dev/ttyAMA0`, `/dev/ttyS0`, `/dev/serial0`, `/dev/ttyACM0`, `/dev/ttyUSB0`) with fallback to an internal realistic mock telemetry simulator when serial ports or `pyserial` are unavailable.
- **Message Parsing**:
  - `HEARTBEAT` (msg_id 0): Decodes `custom_mode`, `base_mode`, `system_status`, armed flag.
  - `SYS_STATUS` (msg_id 1): Decodes battery voltage, current, and remaining percentage.
  - `GPS_RAW_INT` (msg_id 24): Decodes fix type, latitude, longitude, HDOP, satellites.
  - `ATTITUDE` (msg_id 30): Decodes roll, pitch, yaw, rollspeed, pitchspeed, yawspeed.
  - `GLOBAL_POSITION_INT` (msg_id 33): Decodes relative/absolute altitude, velocities ($v_x, v_y, v_z$), ground speed, climb rate.
  - `RC_CHANNELS` (msg_id 65): Decodes 8 PWM channels, stick deflection detection.
  - `STATUSTEXT` (msg_id 253): Decodes severity, ASCII text, pre-arm error aggregation.
- **Strengths**: Pure Python binary framing eliminates heavyweight C-binding dependencies; zero external runtime locks; built-in subscriber dispatch.
- **Architectural Gaps Identified**:
  1. **Binary Connection Status**: `is_connected` is currently boolean without explicit multi-stage lifecycle states (`DISCONNECTED`, `CONNECTING`, `CONNECTED`, `HEARTBEAT_RECEIVED`, `TELEMETRY_ACTIVE`, `DEGRADED`, `RECONNECTING`, `ERROR`, `SIMULATION`).
  2. **Synchronous Serial Writes**: Commands write directly to serial without an asynchronous command queue, acknowledgement tracking (`COMMAND_ACK` msg_id 77), or retry handling.
  3. **Decoupled Autopilot Abstraction**: `backend/autopilot.py` currently operates as an isolated `MockAutopilot` rather than binding to `MavlinkMultiplexer`.

---

## 3. Autopilot Abstraction & Command Layer Audit

In `backend/autopilot.py`:
- `TelemetryState` dataclass holds high-level fields (`latitude`, `longitude`, `altitude_m`, `heading_deg`, `flight_mode`, `is_armed`, `ekf_healthy`, `battery_pct`).
- `MockAutopilot` implements `AutopilotInterface` with asynchronous methods: `command_yaw`, `hold_position`, `fly_to_position`, `command_rtl`.
- **Limitation**: `MockAutopilot` does not communicate with `MavlinkMultiplexer`. In Phase 3, a unified `MavlinkAutopilot` bridge will be implemented that binds directly to `MavlinkMultiplexer`, allowing the FSM in `backend/fsm.py` to seamlessly operate on both live hardware and high-fidelity simulation.

---

## 4. Flight Mode Mappings & ArduCopter 4.x Standards

`backend/mavlink_multiplexer.py` implements the standard ArduCopter flight mode dictionary:
```python
COPTER_MODES = {
    0: 'STABILIZE', 1: 'ACRO', 2: 'ALT_HOLD', 3: 'AUTO', 4: 'GUIDED',
    5: 'LOITER', 6: 'RTL', 7: 'CIRCLE', 9: 'LAND', 11: 'DRIFT',
    13: 'SPORT', 14: 'FLIP', 15: 'AUTOTUNE', 16: 'POSHOLD', 17: 'BRAKE',
    18: 'THROW', 19: 'AVOID_ADSB', 20: 'GUIDED_NOGPS', 21: 'SMART_RTL',
    22: 'FLOWHOLD', 23: 'FOLLOW', 24: 'ZIGZAG', 25: 'SYSTEMID',
    26: 'AUTOROTATE', 27: 'AUTO_RTL'
}
```
- **Mode Validation Requirement**: The GCS must only display verified supported modes (`STABILIZE`, `ALT_HOLD`, `LOITER`, `GUIDED`, `AUTO`, `RTL`, `LAND`, `POSHOLD`, `BRAKE`). Mode change requests must wait for Pixhawk confirmation before updating UI state.

---

## 5. Critical Hardware Configuration Review: UART & Port Discrepancies

A critical discrepancy was noted across existing project documents:

| Source Document | Specified Port | Specified Baud Rate | Protocol | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `PHASE_2_COMPLETION_REPORT.md` | TELEM1 (`/dev/ttyAMA0`) | 921,600 baud | MAVLink 2 | High-speed companion configuration |
| `S500_ESSENTIAL_UNIVERSAL.param` | `SERIAL1` (TELEM1) | 921,600 baud (`SERIAL1_BAUD,921`) | MAVLink 2 (`SERIAL1_PROTOCOL,2`) | Matches Phase 2 report |
| `S500_AUTONOMOUS_PIXHAWK_TUNING.param` | `SERIAL1` / `SERIAL2` | 115,200 baud (`SERIAL1_BAUD,115`) | MAVLink 2 | Standard telemetry rate |
| `scripts/load_params_to_pixhawk.py` | `COM22` / serial | 115,200 baud | MAVLink 2 | Bench parameter uploader script |
| `GEMINI.md` (Legacy reference) | `TELEM2` | 57,600 baud | MAVLink 2 | Older radio telemetry convention |

### Technical Verification & Engineering Reconciliation

1. **Physical Connectors on Pixhawk 2.4.8**:
   - `TELEM1` and `TELEM2` are 6-pin DF13/JST-GH connectors with identical pinouts:
     - Pin 1: `VCC` (+5V Out)
     - Pin 2: `TX` (Out, 3.3V LVTTL)
     - Pin 3: `RX` (In, 3.3V LVTTL)
     - Pin 4: `CTS` (Clear To Send)
     - Pin 5: `RTS` (Request To Send)
     - Pin 6: `GND` (Ground)
2. **Raspberry Pi 4 Model B GPIO Header**:
   - Pin 6: `GND` (Common Ground)
   - Pin 8: `GPIO 14` / `TXD0` (PL011 UART Transmit, 3.3V LVTTL)
   - Pin 10: `GPIO 15` / `RXD0` (PL011 UART Receive, 3.3V LVTTL)
3. **Electrical & Voltage Safety Rules**:
   - **Crucial**: Raspberry Pi 4 GPIO pins are strictly 3.3V tolerant.
   - Pixhawk 2.4.8 TX/RX lines operate at 3.3V LVTTL, which is **electrically compatible**.
   - **Warning**: Do NOT connect Pin 1 (+5V) of Pixhawk TELEM to Raspberry Pi 3.3V or GPIO pins. The Pi 4 must be powered from a dedicated 5V 3A UBEC/BEC.
   - **Wiring Crossover**:
     - Pixhawk Pin 2 (`TX`) $\rightarrow$ Raspberry Pi Pin 10 (`GPIO 15 / RXD0`)
     - Pixhawk Pin 3 (`RX`) $\rightarrow$ Raspberry Pi Pin 8 (`GPIO 14 / TXD0`)
     - Pixhawk Pin 6 (`GND`) $\rightarrow$ Raspberry Pi Pin 6 (`GND`) — Mandatory common ground.
4. **Resolution Strategy for Software**:
   - The software must **never assume** a single hardcoded baud rate.
   - `MavlinkMultiplexer` will implement an **automatic baud rate probing sequence**:
     Candidate rates: `[921600, 115200, 57600]`.
     Candidate ports: `["/dev/ttyAMA0", "/dev/serial0", "/dev/ttyUSB0", "COM*"]`.
   - The connection will listen for valid MAVLink heartbeat frames (`magic byte 0xFD` or `0xFE`). If no heartbeat is received within 2.5 seconds, it cycles to the next candidate baud rate until a confirmed heartbeat is locked.

---

## 6. RC Receiver & Manual Override Monitoring

- **Target Receiver**: MultiLink V1.0 receiver connected to Pixhawk `RC IN` via SBUS/PPM.
- **Channel Allocation**:
  - Ch 1: Roll | Ch 2: Pitch | Ch 3: Throttle | Ch 4: Yaw
  - Ch 5: Flight Mode Switch (Multi-position: STABILIZE / ALT_HOLD / LOITER / GUIDED / AUTO / RTL)
  - Ch 7/8: Auxiliary / Emergency Cutoff / Safety Disarm
- **Manual Takeover Detection**:
  - Stick deviation: PWM outside neutral deadband ($\pm 80\ \mu\text{s}$ from $1500\ \mu\text{s}$) on Pitch, Roll, or Yaw when in autonomous modes (`GUIDED`, `AUTO`).
  - Mode switch override: Pilot physically switches Ch 5 to `LOITER` or `STABILIZE`.
  - Upon detection: Companion computer logs `RC_MANUAL_OVERRIDE`, pauses autonomous search FSM, notifies GCS, and leaves Pixhawk in manual/assisted flight mode without fighting the pilot.

---

## 7. Failsafe Decision Matrix

| Failure Condition | Detection Trigger | Pixhawk Autopilot Response | Companion Response | GCS Action |
| :--- | :--- | :--- | :--- | :--- |
| **RC Signal Loss** | No RC packets for $> 0.5\text{s}$ (`rc_rssi == 0`) | `FS_THR_ENABLE=1` $\rightarrow$ RTL | Log event, notify GCS | Visual/Audio Alert |
| **MAVLink Heartbeat Loss** | `heartbeat_age > 3.0\text{s}` | None (Pixhawk stabilizes independently) | Transition state to `DEGRADED`/`OFFLINE` | Red alert banner |
| **Low Battery Warning** | $V < 14.4\text{V}$ (4S) or rem $< 25\%$ | `BATT_FS_LOW_ACT=2` (RTL) | Warn operator | Flash battery HUD |
| **Critical Battery** | $V < 13.8\text{V}$ (4S) or rem $< 15\%$ | `BATT_FS_CRT_ACT=1` (Land) | Command immediate land | Urgent audio alarm |
| **EKF / GPS Loss** | Fix $< 3\text{D}$ or HDOP $> 2.5$ | Switches to `ALT_HOLD` or `LAND` | Abort autonomous waypoints | Yellow alert |
| **Geofence Breach** | Pos outside polygon or Alt $> 15\text{m}$ | `FENCE_ACTION=1` (RTL) | Abort mission | Flash boundary HUD |

---

## 8. Missing Implementations & Action Items for Phase 3

1. **Connection Lifecycle State Machine**: Refactor `is_connected` into formal states: `DISCONNECTED`, `CONNECTING`, `CONNECTED`, `HEARTBEAT_RECEIVED`, `TELEMETRY_ACTIVE`, `DEGRADED`, `RECONNECTING`, `ERROR`, `SIMULATION`.
2. **Asynchronous Command Queue & ACK Tracker**: Decouple command transmission from the telemetry loop, implementing `COMMAND_ACK` (msg_id 77) waiting with timeout and verified telemetry state readbacks.
3. **Autopilot Bridge**: Upgrade `backend/autopilot.py` to seamlessly wrap `mavlink_mux` while maintaining fallback to simulation.
4. **Comprehensive Telemetry Expansion**: Add `home_lat`, `home_lon`, `home_alt`, `lat_lon_valid`, `gps_age_s`, `telemetry_age_s`, `is_in_air`, `is_landed`, `rc_rssi`, `battery_consumed_mah`.
5. **Pre-Arm 12-Point Automated Checklist**: Validate voltage, fix type, satellites, HDOP, EKF, RC link, telemetry freshness, and bench safety interlock before sending arm commands.
6. **Air-Gapped Emergency RTL**: Verify local companion execution path without cloud dependencies.
7. **Frontend HUD Binding**: Connect Ground Station HUD in `frontend/` to real telemetry fields and state pills.
8. **Test Harness**: Create `tests/test_phase3_mavlink.py` and ensure all 46 existing tests remain passing.

---

## 9. Risk Assessment

1. **Hardware Verification Blocked on Windows**:
   - As established, this Windows development host lacks physical UART hardware and Pixhawk connection.
   - **Resolution**: Implement complete software, simulate all behaviors accurately, and mark physical hardware verification as **BLOCKED** until bench deployment on the Raspberry Pi 4.
2. **Bench Propeller Danger**:
   - Accidental motor arming on the bench could cause severe injury.
   - **Resolution**: Preserve `ALLOW_PHYSICAL_ARMING = False` in `settings.py`. Arming tests run purely in simulated bench mode.
