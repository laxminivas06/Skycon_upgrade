# Pixhawk 2.4.8 & ArduCopter Pre-Arm Safety Checks & Diagnostic Matrix

## 1. Scope & Objective
This specification establishes the mandatory pre-arm safety verification protocol for the **SAE INDIA S500-AeroRecon** autonomous quadcopter.
All checks must pass before the flight controller (Pixhawk 2.4.8 running ArduCopter 4.x) will allow motor arming (`MAV_CMD_COMPONENT_ARM_DISARM`, Command ID 400).

---

## 2. Pixhawk Pre-Arm Checklist (12-Point Gate)

| Gate | Check Item | Threshold / Condition | Failure Reason & ArduPilot Bit |
| :--- | :--- | :--- | :--- |
| **01** | **Supply Voltage** | LiPo $\ge 11.1\text{V}$ (3S) or $\ge 14.8\text{V}$ (4S); Pi 4 $\ge 4.95\text{V}$ | `ARMING_CHECK_VOLTAGE` (Bit 4) |
| **02** | **RC Radio Link** | MultiLink V1.0 linked; Throttle at minimum; FailSafe PWM $> 950$ | `ARMING_CHECK_RC` (Bit 2) |
| **03** | **Compass Consistency** | Dual compass variance $< 0.35$; Offsets within $[-400, 400]$ | `ARMING_CHECK_COMPASS` (Bit 3) |
| **04** | **Inertial Sensors (IMU)** | Accelerometer & Gyro calibrated; Temp stable; Noise $< 0.15\text{g}$ | `ARMING_CHECK_INS` (Bit 7) |
| **05** | **Barometer Health** | Ground pressure locked; Altitude drift $< \pm 0.5\text{m}$ during bench | `ARMING_CHECK_BARO` (Bit 1) |
| **06** | **GPS 3D Fix** | Fix Type $\ge 3$ (3D Fix); Satellites $\ge 8$; HDOP $\le 1.8$ | `ARMING_CHECK_GPS` (Bit 5) |
| **07** | **EKF3 Innovation** | Pos Horiz Variance $< 0.5$; Pos Vert $< 0.5$; Velocity $< 0.5$ | `ARMING_CHECK_PARAMETERS` (Bit 8) |
| **08** | **Geofence Active** | Inclusion polygon loaded; Max Alt $\le 15\text{m}$; RTL Alt $= 5\text{m}$ | `FENCE_ACTION = 1` |
| **09** | **MAVLink Companion** | Raspberry Pi 4 TELEM1 heartbeat rate $\ge 2\text{ Hz}$; Baud $= 921600$ | System Watchdog |
| **10** | **Motor & ESC Arming** | ESC calibration verified; Motor order 1-4 spin direction checked | Hardware Safety |
| **11** | **Safety Switch** | Pixhawk external safety switch pressed (Solid Red LED) | Safety interlock |
| **12** | **Ground Station Link** | SKYCON Ground Station WebSocket latency $< 150\text{ ms}$; Token valid | Operator Interlock |

---

## 3. ArduCopter `ARMING_CHECK` Parameter Bitmask Reference

The `ARMING_CHECK` parameter controls which pre-arm checks are enforced:
- **`ARMING_CHECK = 1`**: Enables **ALL** checks (Mandatory for competition flights).
- **`ARMING_CHECK = 0`**: Disables all checks (**BENCH TESTING ONLY** - Never fly with 0).

Individual bitmasks for surgical isolation:
- `1` (Bit 0): All checks enabled.
- `2` (Bit 1): Barometer.
- `4` (Bit 2): Compass.
- `8` (Bit 3): GPS lock and health.
- `16` (Bit 4): Battery monitor and voltage.
- `32` (Bit 5): Safety Switch state.
- `64` (Bit 6): Radio Control (RC) link and calibration.
- `128` (Bit 7): Inertial Navigation System (INS/IMU).
- `256` (Bit 8): Mission and parameters consistency.
- `512` (Bit 9): EKF (Extended Kalman Filter) state.
- `1024` (Bit 10): System logging (SD Card).

---

## 4. Common Pre-Arm Failures & Field Remediation

### 4.1 "PreArm: Compass not calibrated" or "PreArm: Inconsistent Compasses"
- **Cause**: Magnetic interference from power cables or metal staging tables.
- **Field Fix**:
  1. Elevate the drone at least $1.0\text{m}$ above concrete rebars or metal tables.
  2. Verify internal vs external compass orientation (`COMPASS_ORIENT = 0` for internal, `COMPASS_EXTERNAL = 1` for GPS puck).
  3. Run live compass calibration using Mission Planner or `scripts/load_params_to_pixhawk.py`.

### 4.2 "PreArm: Need 3D Fix" or "PreArm: High HDOP"
- **Cause**: GPS puck obstructed by carbon fiber frame or operating indoors/under tree canopy.
- **Field Fix**:
  1. Move quadcopter to open field clear of tall trees or structures.
  2. Allow $90 - 120\text{ seconds}$ for cold ephemeris almanac acquisition.
  3. Ensure GPS antenna mast is at least $10\text{ cm}$ above 4G dongle and ESC power leads.
  4. Verify Sats count on Ground Station HUD $\ge 10$ and $\text{HDOP} \le 1.2$.

### 4.3 "PreArm: EKF attitude / velocity variance high"
- **Cause**: Drone moved or vibrated during boot sequence while gyros and EKF calibrated.
- **Field Fix**:
  1. Place quadcopter on flat, level, stationary ground.
  2. Power cycle the Pixhawk. **Do not touch or move the drone for 15 seconds after connecting the LiPo**.

### 4.4 "PreArm: Battery failsafe voltage"
- **Cause**: `BATT_ARM_VOLT` set higher than actual resting voltage, or depleted LiPo cell.
- **Field Fix**:
  1. Measure individual cell voltages using LiPo checker (Must be $\ge 3.85\text{V/cell}$).
  2. Calibrate `BATT_VOLT_MULT` in parameters against a calibrated digital multimeter.

---

## 5. Pre-Flight Physical Inspection Checklist (5-Minute Walkaround)

1. **Airframe**: Check S500 arm screws, motor mounts, and landing gear rigidity. No cracks or stripped threads.
2. **Propellers**: Check 1045 propellers for nicks, micro-cracks, and tightness on motor collets. CW / CCW sequence verified.
3. **Wiring & Connectors**:
   - XT60 connector fully seated.
   - Pixhawk TELEM1 cable secured with hot glue or silicone tape.
   - UBEC 5V 3A to Raspberry Pi 4 GPIO pins firmly attached.
4. **Mounted Smartphone**:
   - Rigidly mounted in downward-facing (nadir) bracket.
   - Screen locked in awake mode (prevent auto-lock).
   - Wi-Fi connected to local field router / Pi hotspot.
   - SKYCON Drone Core app active and camera feed streaming.
5. **RC Transmitter**:
   - MultiLink transmitter switched on before drone power.
   - Flight mode switch set to `LOITER` or `POSHOLD`.
   - Throttle stick at bottom position.
   - Manual override verified on Channel 5 / 8.
6. **Safety Clear Zone**:
   - 10-meter radius around launch pad verified clear of all personnel.
   - Wind speed measured with anemometer ($< 15\text{ knots}$).
