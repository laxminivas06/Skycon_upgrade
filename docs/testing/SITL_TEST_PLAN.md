# SKYCON — ARDUPILOT SITL TEST PLAN & VALIDATION SUITE
## SAE INDIA Autonomous Drone Development Challenge (ADDC 2026)
### Software-In-The-Loop Simulation, MAVLink Handshake & Virtual Flight Protocol

---

## 1. SITL SIMULATION ARCHITECTURE

Software-In-The-Loop (SITL) allows validating the complete ArduCopter flight dynamics, MAVLink v2 binary messaging, and autonomous mission execution on the host machine without risking aircraft hardware.

```
+-----------------------------------------------------------------------------------+
|                                 SITL TEST ENVIRONMENT                             |
|                                                                                   |
|  +----------------------------+                     +--------------------------+  |
|  |     ARDUPILOT SITL         |   MAVLink v2 UDP    |  SKYCON COMPANION SERVER |  |
|  |  (ArduCopter Multicopter)  |<===================>|  (MAVLink Multiplexer)   |  |
|  |                            |   127.0.0.1:14550   |                          |  |
|  | - 14-DOF Flight Dynamics   |                     | - Pub/Sub Telemetry Hub  |  |
|  | - Virtual EKF3 Navigation  |                     | - Mission Planner & FSM  |  |
|  | - Virtual GPS & Barometer  |                     | - Route Validator        |  |
|  | - Virtual Battery Monitor  |                     | - Geofence Interlocks    |  |
|  +----------------------------+                     +--------------------------+  |
+-----------------------------------------------------------------------------------+
```

---

## 2. SITL TEST SCENARIOS & PROTOCOLS

### 2.1 Connection & Heartbeat Handshake
- **Objective**: Verify MAVLink v2 heartbeat exchange, vehicle/component identification, and connection loss detection.
- **Protocol**:
  1. Companion opens UDP socket at `127.0.0.1:14550` or serial pty.
  2. Await `HEARTBEAT` message (msg_id 0) from autopilot (`sysid=1`, `compid=1`, `type=2` MAV_TYPE_QUADROTOR).
  3. Validate companion emits GCS heartbeat (`sysid=255`, `compid=190`).
  4. Track `heartbeat_age_s`. If age > 3.0s, flag link `STALE`. If age > 5.0s, transition to `DISCONNECTED`.
- **Classification**: `SITL VERIFIED`.

### 2.2 Mode Switching & Verified Command Acknowledgement
- **Objective**: Verify mode commands receive `COMMAND_ACK` and telemetry readback reflects true mode before reporting success.
- **Test Matrix**:
  | Commanded Mode | Custom Mode Int | Expected MAV_RESULT | Verified Telemetry Readback |
  | :--- | :---: | :---: | :---: |
  | `STABILIZE` | 0 | `MAV_RESULT_ACCEPTED` (0) | `flight_mode == "STABILIZE"` |
  | `ALT_HOLD` | 2 | `MAV_RESULT_ACCEPTED` (0) | `flight_mode == "ALT_HOLD"` |
  | `AUTO` | 3 | `MAV_RESULT_ACCEPTED` (0) | `flight_mode == "AUTO"` |
  | `GUIDED` | 4 | `MAV_RESULT_ACCEPTED` (0) | `flight_mode == "GUIDED"` |
  | `LOITER` | 5 | `MAV_RESULT_ACCEPTED` (0) | `flight_mode == "LOITER"` |
  | `RTL` | 6 | `MAV_RESULT_ACCEPTED` (0) | `flight_mode == "RTL"` |
  | `LAND` | 9 | `MAV_RESULT_ACCEPTED` (0) | `flight_mode == "LAND"` |
- **Safety Invariant**: Mode transitions never rely on unacknowledged dispatch; readback validation enforces closed-loop confirmation.

### 2.3 MAVLink v2 Binary Mission Protocol
- **Objective**: Validate upload and readback of waypoints using standard `MISSION_ITEM_INT` (msg_id 73) with frame `MAV_FRAME_GLOBAL_RELATIVE_ALT_INT` (6).
- **Sequence**:
  1. GCS sends `MISSION_CLEAR_ALL` -> Autopilot acknowledges with `MISSION_ACK` (0).
  2. GCS sends `MISSION_COUNT` ($N$ waypoints).
  3. Autopilot requests each sequence item via `MISSION_REQUEST_INT` (seq 0 to $N-1$).
  4. GCS responds with `MISSION_ITEM_INT`.
  5. Autopilot responds with final `MISSION_ACK` (`MAV_MISSION_ACCEPTED`).
- **Validation**: Uploaded waypoints are read back and validated for coordinate drift ($< 1\text{e-6}^\circ$).

### 2.4 Autonomous Flight Profile Execution
- **Profile**:
  1. Arming in `GUIDED` mode.
  2. Takeoff to 10.0m AGL (`MAV_CMD_NAV_TAKEOFF`).
  3. Boustrophedon grid navigation across 4 waypoints at 3.0 m/s.
  4. Simulated target lock and hover for 5 seconds.
  5. Return-to-Launch command (`RTL`).
  6. Autonomous touchdown and motor disarm.
- **Evidence**: Verified via `tests/validation/test_system_recovery.py` (21-step simulation sequence).
