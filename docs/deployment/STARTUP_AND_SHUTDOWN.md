# SKYCON — STARTUP, SHUTDOWN & EMERGENCY RECOVERY PROCEDURES
## SAE INDIA Autonomous Drone Development Challenge (ADDC 2026)
### Standard Operating Procedures for Cold Boot, In-Flight Recovery & Safe Shutdown

---

## 1. COLD STARTUP SEQUENCE (ORDERED)

Follow this strict step-by-step procedure prior to every flight test or competition sortie:

```
[1. RC TX ON]  -->  [2. GCS ON]  -->  [3. FLIGHT PACK]  -->  [4. PIXHAWK LOCK]
       |                    |                   |                     |
       v                    v                   v                     v
MultiLink TX        Laptop/Tablet       Powers Pixhawk        Boot tones complete
Throttle @ zero     Wi-Fi connected     & RPi 4 UBEC          GPS 3D Fix > 6 sats
Switch: LOITER      Dashboard ready     Fans spin up          HDOP < 1.5

       +--------------------------------------------------------------+
       |
       v
[5. RPI 4 BOOT] --> [6. CAMERA PWA]  --> [7. PRE-ARM CHECK]  --> [8. MISSION ARM]
       |                    |                   |                     |
       v                    v                   v                     v
systemd auto-starts iPhone connects to   Run /api/diagnostics Arm via GCS/RC
skycon.service      Safari PWA @ /drone- Verify MAVLink, RC,  Switch to GUIDED
MAVLink mux active  core; video confirms Geofence & Codes     Takeoff to 10m
```

### Detailed Execution Steps:
1. **Power on MultiLink RC Transmitter**:
   - Verify Throttle is in the full-down (idle) position.
   - Verify Flight Mode selector is in `LOITER` or `STABILIZE`.
2. **Power on Ground Station (GCS)**:
   - Connect GCS laptop or tablet to the drone's Wi-Fi network (`SKYCON_DRONE_AP`).
   - Open browser at `http://192.168.4.1:8443` (or local port).
3. **Connect Drone Flight Battery (LiPo)**:
   - Connect main XT60/XT90 power connector in one smooth, confident movement.
   - Pixhawk will play startup musical tones. RPi 4 red power LED and green ACT LED will illuminate.
4. **Await Pixhawk Sensor Calibration & GPS Lock**:
   - **DO NOT MOVE THE DRONE** during the first 15 seconds while IMU gyros calibrate.
   - Await solid green GPS LED indication (3D GPS Fix, minimum 8 satellites, HDOP < 1.4).
5. **Verify Companion Software Initialization**:
   - Raspberry Pi 4 boots in ~25 seconds. `skycon.service` starts automatically.
   - GCS Dashboard displays live telemetry (Battery voltage > 14.8V/22.2V, Heartbeat 1.0Hz).
6. **Mount & Initialize Onboard iPhone Camera**:
   - Open Safari on iPhone and navigate to `http://192.168.4.1:8443/drone-core`.
   - Tap "START CAMERA STREAM". Verify live camera feed appears on GCS dashboard.
7. **Execute Pre-Arm Diagnostic Audit**:
   - Run hardware verification via GCS UI or `GET /api/diagnostics/hardware`.
   - Confirm power health (`vcgencmd` no under-voltage), UART health (`HEALTHY`), and geofence boundary active.
8. **Arming & Mission Launch**:
   - Press and hold Pixhawk physical safety switch (solid red light).
   - Arm via GCS "ARM MOTORS" button or RC transmitter (Rudder right).
   - Click "START MISSION" to begin 12-stage autonomous ADDC mission.

---

## 2. CONTROLLED SHUTDOWN SEQUENCE (ORDERED)

```
[1. LAND & DISARM] --> [2. STOP SERVICE] --> [3. RPI SHUTDOWN] --> [4. BATTERY DISC] --> [5. RC TX OFF]
```

1. **Verify Landed & Disarmed**:
   - Confirm drone has landed completely, throttle is at zero, and motors are completely stopped.
   - Verify GCS and Pixhawk report mode `DISARMED`.
2. **Stop Companion Service & Export Logs**:
   - Trigger diagnostic report export via GCS: `POST /api/diagnostics/export`.
   - All flight logs and mission telemetry are flushed to `data/reports/`.
3. **Safe Raspberry Pi 4 Poweroff**:
   - Via GCS Dashboard, click "SHUTDOWN COMPANION" or execute `sudo poweroff` via SSH.
   - Wait 10 seconds until green ACT LED flashes 10 times and turns off, leaving only the solid red power LED.
4. **Disconnect Main Flight Battery**:
   - Unplug XT60/XT90 battery connector.
5. **Power off MultiLink RC Transmitter**:
   - Turn off the ground transmitter only after the drone is completely de-energized.

---

## 3. IN-FLIGHT EMERGENCY RECOVERY PROCEDURES

| Emergency Scenario | Autopilot Response | Companion Pi Response | Pilot Action |
| :--- | :--- | :--- | :--- |
| **Wi-Fi Link Loss (GCS Drop)** | Continues mission autonomously | Continues mission; buffers logs locally | Monitor drone visually; prepare RC override if needed |
| **4G Cellular Loss** | None (Local-first design) | Spools telemetry to `offline_sync_spool` | None required; auto-reconnects when coverage returns |
| **iPhone Camera Stream Drop** | Holds altitude & current waypoint | State machine flags `CAMERA_STREAM_LOST` | Pilot can toggle RC mode to `LOITER` or issue GCS `HOLD` |
| **Companion Pi System Crash** | Pixhawk holds current mode | Systemd auto-restarts service in 3s | Pilot immediately toggles RC switch to `LOITER` |
| **Geofence Breach (> 50m / > 15m)** | Pixhawk triggers immediate RTL | Mission engine transitions to `RTL_ABORT` | Ensure flight path is clear; allow RTL to land |
| **Low Battery Voltage (< 14.4V / 21.6V)** | Failsafe RTL triggered | Alerts GCS with audible low-battery alarm | Allow RTL to land; do not attempt further search |
| **Complete Autonomous Failure** | Pilot RC switch overrides companion | Companion yields control | **Flick MultiLink Mode switch to `STABILIZE` or `LOITER`** |
