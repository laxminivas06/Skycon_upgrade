# SKYCON System — REST API & Telemetry Reference

## Base URL
- **Cloud (PythonAnywhere)**: `https://<username>.pythonanywhere.com`
- **Companion (Raspberry Pi 4)**: `http://<pi-ip>:8443`

---

## 1. System & Health

### `GET /health`
Returns health status, active companion hardware, and uptime.
```json
{
  "status": "healthy",
  "service": "SKYCON Production WSGI Cloud Hub",
  "version": "2.0.0",
  "companion": "Raspberry Pi 4 Model B",
  "autopilot": "Pixhawk 2.4.8 (ArduCopter)",
  "rc_receiver": "MultiLink V1.0 (2.4 GHz)",
  "database": "Simple Atomic JSON Store",
  "uptimeSeconds": 142
}
```

### `GET /api/system/health`
Returns Raspberry Pi 4 hardware metrics and Pixhawk link status.
```json
{
  "success": true,
  "companion": "Raspberry Pi 4 Model B",
  "cpuUsagePct": 14.5,
  "cpuTempCelsius": 42.1,
  "ramUsagePct": 32.0,
  "diskUsagePct": 24.0,
  "pixhawkConnected": true,
  "heartbeatAgeSeconds": 0.12
}
```

---

## 2. Telemetry & Commands

### `GET /api/telemetry`
Returns real-time vehicle telemetry.
```json
{
  "success": true,
  "telemetry": {
    "connected": true,
    "flight_mode": "GUIDED",
    "armed": true,
    "lat": 13.08275,
    "lon": 80.27072,
    "alt": 10.0,
    "relative_alt": 10.0,
    "roll": 1.2,
    "pitch": 0.4,
    "yaw": 90.0,
    "voltage_battery": 15.1,
    "battery_remaining": 92,
    "satellites": 16,
    "gps_fix_type": 4,
    "hdop": 0.85,
    "rc_connected": true,
    "rc_channels": [1500, 1500, 1500, 1500, 1800, 1500, 1500, 1000]
  }
}
```

### `POST /api/command/arm`
Arms drone motors after pre-arm validation.
- Body: `{"force": false}`

### `POST /api/command/mode`
Changes ArduCopter flight mode (`STABILIZE`, `ALT_HOLD`, `LOITER`, `GUIDED`, `RTL`, `LAND`, `POSHOLD`).
- Body: `{"mode": "GUIDED"}`

### `POST /api/command/takeoff`
Commands autonomous climb to specified altitude.
- Body: `{"altitude": 10.0}`

### `POST /api/command/emergency_rtl`
High-priority failsafe RTL command executed directly on the companion computer without cloud dependency.

---

## 3. Mission Management & 5-Minute Competition Timeline

### `GET /api/missions`
Lists all saved mission plans.

### `POST /api/missions`
Saves or plans a new mission. Validates waypoints against the active geofence.

### `GET /api/missions/active`
Returns active mission execution state, elapsed time, and remaining time against the 5-minute budget (300 seconds).

### `DELETE /api/missions/active`
Aborts active mission and returns vehicle to safe loiter or RTL.

---

## 4. Geofence & Boundary Enforcement

### `GET /api/geofence`
Returns active geofence geometry, maximum altitude ceiling, and buffer margins.

### `POST /api/geofence/sync`
Synchronizes geofence limits with Pixhawk parameters (`FENCE_RADIUS`, `FENCE_ALT_MAX`, `FENCE_ENABLE=1`, `FENCE_ACTION=1`).

---

## 5. Vision & Target QR Detections

### `GET /api/recon/detections`
Returns list of verified QR target detections.

### `POST /api/recon/detections`
Registers a new QR code detection. Strictly validates against regex `^\d{2}$`.
- Body: `{"payload": "42", "droneStateAtCapture": {"lat": 13.0827, "lon": 80.2707, "alt": 10.0}}`

### `POST /api/camera/frame`
Accepts a JPEG frame pushed from the mounted smartphone Drone Core interface, runs OpenCV QR detection, and returns decode results.
