# SKYCON System — Master System Architecture

## 1. System Overview
The **SKYCON** system is an autonomous drone search, computer vision, and telemetry platform engineered for the **SAE INDIA Autonomous Drone Competition (ADDC 2026)**.

The architecture employs a **Dual-Interface, Single-Companion** design:
1. **Interface A: SKYCON Ground Control Station (GCS)**: Used by the ground operator on laptop or tablet to supervise live flight telemetry, monitor the 3-layer spatial heatmap, configure circular geomapping missions, manage geofences, and command autonomous/failsafe procedures.
2. **Interface B: SKYCON Drone Core (Mounted Smartphone)**: A dedicated mobile-first PWA mounted rigidly to the S500 quadcopter airframe, functioning as the optical camera sensor, streaming real-time video frames to the companion computer and displaying onboard status.

---

## 2. Hardware Architecture & Hardware Invariants

| Component | Specification | Role & Responsibilities |
| :--- | :--- | :--- |
| **Airframe** | S500 Quadcopter | 2216/2212 920KV brushless motors, 30A SimonK ESCs, 1045 propellers, 3S/4S LiPo. |
| **Autopilot** | Pixhawk 2.4.8 (ArduCopter) | Real-time flight stabilization, attitude estimation, motor mixing, firmware-level failsafes. |
| **Companion Computer** | Raspberry Pi 4 Model B (4GB/8GB) | Sole companion computer. Runs MAVLink multiplexer, OpenCV computer vision, QR decoding, 5-minute mission state machine, and atomic JSON persistence. |
| **Camera Sensor** | Mounted Smartphone (iPhone / Android) | High-resolution optical sensor pushing compressed frames over local Wi-Fi / WebSocket. |
| **RC Equipment** | MultiLink V1.0 2.4 GHz | Radio receiver wired to Pixhawk RC IN for mandatory pilot safety override. |
| **Power Supply** | Dedicated 5V 3A UBEC | Regulates battery voltage for Raspberry Pi 4. Never powered from Pixhawk servo rail. |

### Elimination of ESP32-S3
The ESP32-S3 microcontroller has been **completely removed** from the architecture. The Raspberry Pi 4 connects directly to Pixhawk 2.4.8 over TELEM1 UART at 921600 baud (or 57600 baud), eliminating unnecessary microcontroller relays, fragile firmware bridges, and multi-hop network hops.

---

## 3. Communication Pipeline

```
  +-------------------------------------------------------+
  |               Mounted Smartphone                      |
  |         (Interface B: SKYCON Drone Core)              |
  +---------------------------+---------------------------+
                              | Local Wi-Fi (ws:// or HTTP)
                              | 10 FPS Compressed Frame Push
                              v
  +-------------------------------------------------------+
  |              Raspberry Pi 4 Model B                   |
  |             (Sole Companion Computer)                 |
  |  - Python FastAPI / Flask REST & WebSocket Hub        |
  |  - MAVLink 2.0 Multiplexer & Command Dispatcher       |
  |  - OpenCV QR Detector (Strict Regex ^\d{2}$)          |
  |  - 17-State Autonomous Mission FSM                    |
  |  - 3-Layer Spatial Heatmap Grid Engine                |
  |  - SimpleJsonStore (Atomic Disk Persistence)          |
  +---------------------------+---------------------------+
          | TELEM1 UART       | Internet / 4G SIM Dongle
          | (GPIO 14/15)      | (When available, not safety-critical)
          v                   v
  +---------------+   +-----------------------------------+
  | Pixhawk 2.4.8 |   | PythonAnywhere Cloud Web App      |
  | Flight Ctrl   |   | (WSGI Flask REST & GCS Hosting)   |
  +-------+-------+   +-----------------+-----------------+
          |                             |
          | RC IN (SBUS)                | HTTP / SSE / WS
          v                             v
  +---------------+   +-----------------------------------+
  | MultiLink V1.0|   | Ground Control Station (GCS)      |
  | 2.4 GHz RX    |   | (Interface A: React 18 HUD)       |
  +---------------+   +-----------------------------------+
```

---

## 4. Flight Safety & Air-Gap Principles
1. **Real-Time Stabilization Priority**: The Pixhawk flight controller remains strictly responsible for motor control and attitude stability. The Raspberry Pi 4 never intercepts low-level motor signals.
2. **Cloud Independence**: All flight controls, geofence watchdogs, QR detections, and Emergency RTL workflows execute locally on the companion computer and Pixhawk. Cloud connectivity is never required for flight safety.
3. **Manual RC Override**: The MultiLink V1.0 2.4 GHz receiver retains instantaneous physical control override capability via the pilot transmitter switch.
4. **Altitude Ceiling & Fence**: ArduPilot parameters `FENCE_ENABLE=1`, `FENCE_ALT_MAX=25.0`, and `FENCE_ACTION=1` enforce competition boundaries in flight controller silicon.
