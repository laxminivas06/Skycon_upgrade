# SKYCON — PHYSICAL BENCH TEST PLAN & HARDWARE INTEGRATION
## SAE INDIA Autonomous Drone Development Challenge (ADDC 2026)
### Propellers-Off Bench Testing, Multi-Baud Probing, Power Isolation & Sensor Health

---

## 1. BENCH TEST OVERVIEW & OBJECTIVES

Physical bench testing provides the essential bridge between software/SITL simulation and physical flight. In this stage, the full hardware stack is physically assembled and powered on the test bench with **ALL PROPELLERS REMOVED**.

```
+-----------------------------------------------------------------------------------+
|                            PHYSICAL BENCH ARCHITECTURE                            |
|                                                                                   |
|  +----------------------------+                     +--------------------------+  |
|  |     PIXHAWK 2.4.8          |  UART (TELEM2)      |     RASPBERRY PI 4       |  |
|  |   (ArduCopter 4.x)         |<------------------->|  (Companion Computer)    |  |
|  |                            |  57600 / 921600 bd  |                          |  |
|  | - MAVLink v2 Telemetry     |                     | - MAVLink Multiplexer    |  |
|  | - EKF3 Navigation          |  RC PWM/SBUS        | - Vision/QR Engine       |  |
|  | - Sensors (IMU/Mag/Baro)   |<----------------+   | - Mission Engine / FSM   |  |
|  +----------------------------+                 |   +--------------------------+  |
|        ^                                        |                 ^               |
|        | 5.1V Clean Power                       |                 | 5.1V 3A Clean |
|  +----------------------------+   +-------------------+   +--------------------+  |
|  |    MAV Power Module        |   |   MULTILINK V1.0  |   |  DEDICATED 5.1V    |  |
|  |    (4S LiPo Input)         |   |    RC RECEIVER    |   |     UBEC / BUCK    |  |
|  +----------------------------+   +-------------------+   +--------------------+  |
|                                                                                   |
|  PROPELLERS REMOVED | BENCH INTERLOCK: ALLOW_PHYSICAL_ARMING = False              |
+-----------------------------------------------------------------------------------+
```

---

## 2. MANDATORY BENCH SAFETY RULES

> [!CAUTION]
> **PROPELLER REMOVAL IS STRICTLY MANDATORY**: Never attach propellers during bench testing. Under no circumstances should motors be spun with propellers attached in an indoor or bench environment.

1. **Propellers-Off Invariant**: Every test outlined in this document must be executed with bare motor shafts.
2. **Software Bench Interlock**: Verify `ALLOW_PHYSICAL_ARMING = False` in `backend/settings.py` during all initial bench connection tests.
3. **Emergency Power Cutoff**: Keep the main LiPo XT60 quick-disconnect within immediate reach of the bench engineer.
4. **Current-Limited Power**: Use a bench power supply with 14.8V (4S equivalent) and a 2.0A current limit for initial power-up to prevent short-circuit damage.
5. **No Shared Power Rails**: The Raspberry Pi 4 must **NEVER** draw power from the Pixhawk power rail or USB port. Ground lines must be common, but positive 5.0V/5.1V rails must remain strictly isolated.

---

## 3. PHYSICAL POWER DISTRIBUTION & WIRING AUDIT

### 3.1 Power Supply Specifications
| Subsystem | Power Source | Target Voltage | Max Current Draw | Ground Connection |
| :--- | :--- | :--- | :--- | :--- |
| **Pixhawk 2.4.8** | ArduPilot 6-pin Power Module | 5.10V ± 0.15V | 0.8A | Common System Ground |
| **Raspberry Pi 4** | Dedicated 5.1V 3.5A Step-Down UBEC | 5.10V ± 0.10V | 3.0A peak | Common System Ground |
| **MultiLink V1.0 Rx**| Pixhawk `RC IN` Rail | 5.00V | 0.15A | Connected via Pixhawk |
| **iPhone Camera** | Internal Battery / Isolated USB-C | 5.00V (if tethered)| 1.5A | Isolated Battery |
| **Motors / ESCs** | 4S 14.8V 5200mAh 60C LiPo | 14.8V – 16.8V | Idle: 0.4A | Common Battery Ground |

### 3.2 Electrical Isolation & Ground Loop Prevention
- **Star Grounding**: All subsystem ground references converge at the main Power Distribution Board (PDB) ground pad.
- **Opto-Isolated ESCs**: ESC signal grounds connect to the Pixhawk I/O servo rail; positive power leads from ESC BECs are disconnected (cut or pulled from servo plugs) to avoid back-feeding Pixhawk.
- **Companion UART Ground**: Pin 6 (GND) of Pi GPIO connects directly to Pin 6 (GND) of Pixhawk TELEM2.

---

## 4. SERIAL TELEMETRY & BAUD RATE CONFIGURATION

### 4.1 Baud Rate Mismatch Analysis & Multi-Baud Probing
Physical Pixhawk 2.4.8 units running factory ArduCopter firmware default `SERIAL2_BAUD = 57` (57600 baud) on `TELEM2`. High-speed companion deployments typically configure `SERIAL2_BAUD = 921` (921600 baud) to support high-frequency telemetry streams.

`backend/mavlink_multiplexer.py` implements an automated multi-baud probing sequence:
```python
candidate_bauds = [921600, 115200, 57600]
```

### 4.2 Bench Serial Verification Procedure
1. **Physical Cable Pinout (Pi 4 GPIO to Pixhawk TELEM2)**:
   - Pi Pin 8 (GPIO 14 - TXD)  -->  Pixhawk TELEM2 Pin 3 (RX)
   - Pi Pin 10 (GPIO 15 - RXD) <--  Pixhawk TELEM2 Pin 2 (TX)
   - Pi Pin 6 (GND)           <--> Pixhawk TELEM2 Pin 6 (GND)
   - **DO NOT CONNECT VCC (Pixhawk Pin 1 to Pi Pin 2/4)**.
2. **Serial Port Identification on Pi 4**:
   - Primary Hardware UART on Pi 4 is `/dev/ttyAMA0` (when Bluetooth disabled) or `/dev/serial0`.
   - Verify serial permissions: `sudo usermod -a -G dialout pi`.
3. **Execution of Automated Probe**:
   ```bash
   python -c "from backend.mavlink_multiplexer import MavlinkMultiplexer; mux = MavlinkMultiplexer('/dev/ttyAMA0', 57600); mux.connect(); print('Connected:', mux.is_connected)"
   ```
4. **Parameter Verification via GCS**:
   - Query ArduPilot parameter `SERIAL2_PROTOCOL` -> Must be `2` (MAVLink2).
   - Query ArduPilot parameter `SERIAL2_BAUD` -> Record whether `57` (57600) or `921` (921600).

---

## 5. MULTILINK V1.0 RC CALIBRATION & OVERRIDE VERIFICATION

### 5.1 Channel Mapping Matrix
| Channel | Function | Neutral / Normal (µs) | Low Value (µs) | High Value (µs) | Behavior |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **CH1** | Roll (Aileron) | 1500 | 1000 (Left) | 2000 (Right) | Attitude control |
| **CH2** | Pitch (Elevator) | 1500 | 1000 (Forward)| 2000 (Back) | Attitude control |
| **CH3** | Throttle | 1000 | 1000 (Zero) | 2000 (Full) | Altitude / Climb rate |
| **CH4** | Yaw (Rudder) | 1500 | 1000 (Left) | 2000 (Right) | Heading control |
| **CH5** | Flight Mode Switch | 1165 (STABILIZE) | 1425 (LOITER) | 1815 (GUIDED) | Direct mode selection |
| **CH6** | Emergency Override | 1000 (NORMAL) | - | 2000 (EMERGENCY)| Direct RTL / Disarm switch |

### 5.2 Physical Override Test Protocol
1. Power MultiLink V1.0 transmitter; verify receiver solid link LED.
2. Monitor MAVLink `RC_CHANNELS` stream via `tests/validation/test_rc_monitoring.py`.
3. Send companion autonomous mode change to `GUIDED`.
4. Flip MultiLink CH5 switch to `LOITER` (Position 2).
5. **Verification**: Autopilot must immediately switch to `LOITER`. Companion multiplexer must detect the mode change within 100ms and notify GCS of pilot override.

---

## 6. SENSOR HEALTH & PRE-ARM CALIBRATION CHECKS

Execute the following checklist prior to any motor spin tests:

| Sensor | Health Check Metric | Acceptable Range | Pass/Fail |
| :--- | :--- | :--- | :---: |
| **IMU1 / IMU2 (Accels)** | `EKF3` Status / Accelerometer Bias | Norm = 9.81 ± 0.15 m/s² | [ ] |
| **Gyroscopes** | Zero-rate drift while stationary | Angular rate < 0.05 rad/s | [ ] |
| **Compass / Magnetometer** | Offset magnitude & interference | Total offset < 400, no compass error | [ ] |
| **Barometer** | Altitude variance while stationary | Drift < 0.3m over 60 seconds | [ ] |
| **GPS Receiver** | Satellites visible & HDOP | Sats >= 10, HDOP < 1.4 | [ ] |
| **Battery Monitor** | Voltage readback vs Calibrated Multimeter| Difference < 0.10V | [ ] |

---

## 7. MOTOR ROTATION & SPIN-UP VERIFICATION (PROPELLERS OFF)

1. Verify aircraft is securely strapped to the test bench with **NO PROPELLERS**.
2. Temporarily set `ALLOW_PHYSICAL_ARMING = True` in local bench configuration.
3. Arm aircraft in `STABILIZE` mode via MultiLink transmitter (rudder down and right).
4. Advance throttle to 10% (tickle):
   - **Motor 1 (Front Right)**: Counter-Clockwise (CCW).
   - **Motor 2 (Front Left)**: Clockwise (CW).
   - **Motor 3 (Rear Left)**: Counter-Clockwise (CCW).
   - **Motor 4 (Rear Right)**: Clockwise (CW).
5. Pitch and Roll response check:
   - Pitch forward: Rear motors (3 & 4) increase speed; front motors (1 & 2) decrease speed.
   - Roll right: Left motors (2 & 3) increase speed; right motors (1 & 4) decrease speed.
6. Throttle to 0%, disarm immediately.

---

## 8. ONBOARD CAMERA PIPELINE (IPHONE SAFARI PWA) BENCH CHECK

1. Mount iPhone in vibration-damped bracket.
2. Connect iPhone to local field Wi-Fi hotspot hosted on Raspberry Pi (`192.168.4.1` or direct hotspot).
3. Open Safari and navigate to `http://192.168.4.1:8000/camera-stream`.
4. Present physical 2-digit QR card ("42") at distance 1.0m under ambient bench lighting.
5. **Verify**:
   - WebSocket streaming latency < 120ms.
   - Resolution locked to 1280x720 at 15–30 fps.
   - `QRDetectionEngine` decodes code `42` within 2 frames.
   - Georeferencing node calculates simulated GPS footprint.
6. Close browser session, verify companion logs show clean disconnect and zero memory leaks.

---

## 9. BENCH TEST SIGNOFF SHEET

| Test ID | Procedure Description | Expected Result | Actual Result | Engineer Initial |
| :--- | :--- | :--- | :--- | :---: |
| **BN-01** | Power Rail Voltage Check | 5.10V ± 0.15V on all rails | | |
| **BN-02** | Multi-Baud UART Probe | MAVLink heartbeat acquired | | |
| **BN-03** | MultiLink RC Channel Travel | 1000–2000 µs full deflection | | |
| **BN-04** | Pilot RC Override Priority | Instant drops from GUIDED | | |
| **BN-05** | EKF3 Sensor Calibration | Pre-arm checks pass | | |
| **BN-06** | Bare Motor Direction | All 4 motors match quad-X | | |
| **BN-07** | iPhone Camera PWA Stream | QR decoded < 200ms latency | | |
| **BN-08** | Failsafe Trigger Disarm | Radio off causes RC failsafe | | |

*Bench Testing Lead Signature*: _______________________ *Date*: ____________
