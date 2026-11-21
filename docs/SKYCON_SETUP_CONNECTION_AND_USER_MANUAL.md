# SKYCON SYSTEM — SETUP, HARDWARE CONNECTION & USER MANUAL
## Autonomous Drone Rescue & QR Intelligence Mission System (ADDC 2026)
### Ground Control Station (GCS), Companion Computer & Flight Controller Complete Reference Manual

---

## DOCUMENT METADATA & REVISION STATUS
- **Project:** SKYCON Autonomous UAV System
- **Target Competition:** SAE INDIA Autonomous Drone Development Challenge (ADDC 2026)
- **Target Autopilot:** Pixhawk 2.4.8 running ArduCopter 4.x
- **Companion Computer:** Raspberry Pi 4 Model B (4GB / 8GB)
- **Primary Sensor:** Mounted iPhone (Nadir Optical Camera)
- **Manual Override Link:** MultiLink V1.0 2.4GHz RC System
- **Software Stack:** React 18 + TypeScript GCS / Python 3.10+ FastAPI & Flask WSGI Backend
- **Document Version:** 2.0.0 (Post-Phase 7 & Hybrid Autonomy Integration)
- **Last Verified Date:** November 2026

### Feature Implementation Status Legend
Throughout this manual, features and subsystems are explicitly tagged with their physical and software readiness:
- `[IMPLEMENTED]`: Fully coded, unit-tested, and verified in software/SITL.
- `[PARTIALLY IMPLEMENTED]`: Software logic complete; requires live sensor/network telemetry calibration.
- `[PHYSICAL VERIFICATION PENDING]`: Code and pinouts documented; requires hands-on physical multimeter and bench verification before flight battery connection.

---

# SECTION 1: HARDWARE CONNECTIONS & ELECTRICAL WIRING

```
                                  +-----------------------------+
                                  |     6S / 4S LiPo BATTERY    |
                                  |     (14.8V - 22.2V DC)      |
                                  +--------------+--------------+
                                                 |
                       +-------------------------+-------------------------+
                       |                                                   |
                       v                                                   v
             +--------------------+                             +--------------------+
             |  PIXHAWK PM02/3DR  |                             |   5.1V / 3A UBEC   |
             |    POWER MODULE    |                             | (Dedicated RPi 4)  |
             +---------+----------+                             +---------+----------+
                       | 5.3V Clean                                       | 5.1V Clean
                       | Current Sense                                    | Low Ripple
                       v                                                  v
     +-----------------------------------+             +-----------------------------------+
     |           PIXHAWK 2.4.8           |             |      RASPBERRY PI 4 MODEL B       |
     |        AUTOPILOT CONTROLLER       |             |        COMPANION COMPUTER         |
     +-----------------+-----------------+             +-----------------+-----------------+
     | TELEM2 Port:    |                               | 40-Pin Header:  |
     | Pin 1: VCC +5V  | [CUT/NEVER CONNECT]           | Pin 2/4: +5V    | <-- From UBEC Red
     | Pin 2: TX (Out) +------------------------------>| Pin 10: GPIO 15 | (PL011 RXD0)
     | Pin 3: RX (In)  |<------------------------------+ Pin 8:  GPIO 14 | (PL011 TXD0)
     | Pin 4: CTS      | [Unused]                      | Pin 6:  GND     | <-- From UBEC Blk
     | Pin 5: RTS      | [Unused]                      | Pin 6:  GND     | === COMMON GND
     | Pin 6: GND      +===============================+=================+
     +--------+--------+                               +--------+--------+
              |                                                 |
              | RC IN (3-pin header)                            | Built-in Wi-Fi (wlan0)
              v                                                 v
     +-----------------+                               +-----------------+
     | MULTILINK V1.0  |                               | 2.4GHz HOTSPOT  |
     |   RC RECEIVER   |                               |  (Pixel/iPhone) |
     +-----------------+                               +--------+--------+
                                                                ^
                                                                | Wi-Fi Direct
                                                       +--------+--------+
                                                       |  MOUNTED iPHONE |
                                                       | (Nadir Camera)  |
                                                       +-----------------+
```

---

### 1.1 Raspberry Pi 4 to Pixhawk 2.4.8 MAVLink Wiring

The Pixhawk 2.4.8 communicates with the Raspberry Pi 4 companion computer using MAVLink v2 over a hardware serial UART connection.

#### Port Selection & Serial Assignment
- **Pixhawk Port:** `TELEM2` (Molex DF13 6-pin connector).
- **Raspberry Pi 4 Port:** Hardware PL011 UART (`/dev/ttyAMA0` or `/dev/serial0` on GPIO 14 / GPIO 15).
- **Default Baud Rate:** `921600` baud (high-throughput telemetry & computer vision waypoints) or `57600` baud (failsafe fallback).
- **ArduCopter Parameter Settings:**
  - `SERIAL2_PROTOCOL = 2` (MAVLink 2)
  - `SERIAL2_BAUD = 921` (921600 baud) or `57` (57600 baud)

#### Exact DF13-to-GPIO Pinout Table `[IMPLEMENTED]`

| Pixhawk TELEM2 Pin | Signal Name | Wire Color | Raspberry Pi 4 Physical Pin | BCM GPIO / Role | Electrical Rule & Safety Requirement |
| :---: | :---: | :---: | :---: | :---: | :--- |
| **Pin 1** | **VCC (+5V)** | Red | **DO NOT CONNECT** | — | **CRITICAL WARNING:** Snipped or depinned. Never back-power RPi 4 from Pixhawk! |
| **Pin 2** | **TX (Out)** | Orange/Yellow | **Pin 10** | GPIO 15 (RXD0) | Pixhawk 3.3V LVTTL transmit &rarr; RPi UART receive. |
| **Pin 3** | **RX (In)** | Green/White | **Pin 8** | GPIO 14 (TXD0) | RPi 3.3V LVTTL transmit &rarr; Pixhawk UART receive. |
| **Pin 4** | CTS | — | *Not Connected* | — | Hardware flow control disabled. |
| **Pin 5** | RTS | — | *Not Connected* | — | Hardware flow control disabled. |
| **Pin 6** | **GND** | Black | **Pin 6** (or 9, 14) | Ground | **MANDATORY:** Common ground reference between logic boards. |

> [!CAUTION]
> ### CRITICAL ELECTRICAL ISOLATION RULE
> **NEVER connect Pin 1 (+5V) of Pixhawk TELEM1 or TELEM2 to the Raspberry Pi 4.**  
> The Pixhawk internal 5V power rail is designed to supply a maximum of ~500mA–1A for lightweight telemetry radios. The Raspberry Pi 4 draws between **2.5A and 3.0A** under full quad-core CPU and OpenCV vision processing loads. Attempting to power the Pi from the Pixhawk will trigger instantaneous voltage sag, brown out the Pixhawk flight controller, reboot the STM32 processor mid-flight, and cause a fatal crash.

---

### 1.2 MultiLink V1.0 RC Receiver Connection & Safety Priority

In strict accordance with SAE INDIA ADDC 2026 rules, the drone must provide immediate physical manual override by the safety pilot at all times during autonomous operation.

#### Wiring to Pixhawk `RC IN` Header `[IMPLEMENTED]`
The MultiLink V1.0 receiver connects to the 3-pin standard 0.1" header labelled `RC IN` on the Pixhawk:
1. **Signal Pin (Top Pin / Inner):** Connects to MultiLink Receiver SBUS or PPM Signal output (White or Yellow wire).
2. **VCC Pin (Middle Pin):** Connects to MultiLink Receiver +5V input (Red wire). Powered safely from Pixhawk RC rail.
3. **GND Pin (Bottom Pin / Outer):** Connects to MultiLink Receiver Ground (Black wire).

#### Pilot Manual Override Mechanism
- **Transmitter Switch Configuration:** A dedicated 3-position flight mode switch on the pilot transmitter (Channel 5) is mapped to:
  - Position 1: `STABILIZE` (0) or `POSHOLD` (16) — Full pilot manual control.
  - Position 2: `LOITER` (5) — Position and altitude hold; autonomous pause.
  - Position 3: `GUIDED` (4) or `AUTO` (3) — Autonomous companion computer navigation.
- **Instant Override:** Flipping the transmitter switch out of `GUIDED`/`AUTO` instantly disengages companion control within **< 20 milliseconds**, giving manual stick authority back to the safety pilot.
- **FailSafe Configuration Parameters:**
  - `FS_THR_ENABLE = 1`: Triggers automatic Return-To-Launch (`RTL`) if MultiLink 2.4GHz transmitter signal is lost.
  - `FS_GCS_ENABLE = 0`: Ground station network disconnection will **not** abort an active flight as long as the safety pilot's MultiLink RC link remains solid.
  - `RTL_ALT = 500`: Return altitude set to 5.0m AGL (prevents dangerous climbs to standard 15m inside caged/ceiling-limited arenas).

---

### 1.3 Power Supply Architecture & Electrical Isolation

The drone uses a multi-rail isolated power distribution system derived from the main flight battery (4S or 6S LiPo, 14.8V – 22.2V):

```
                        +----------------------------+
                        |  MAIN LIPO (4S / 6S PACK)  |
                        +--------------+-------------+
                                       |
                +----------------------+----------------------+
                |                                             |
                v                                             v
     +----------------------+                     +----------------------+
     | 3DR / PM02 MODULE    |                     | HIGH-EFFICIENCY UBEC |
     | (5.30V ± 0.05V, 3A)  |                     | (5.10V ± 0.05V, 3A)  |
     +----------+-----------+                     +----------+-----------+
                |                                             |
                v                                             v
     +----------------------+                     +----------------------+
     | Pixhawk POWER Port   |                     | Raspberry Pi 4 Power |
     | - STM32 Autopilot    |                     | - USB-C or Pin 2/4   |
     | - Internal Sensors   |                     | - Internal Wi-Fi     |
     | - MultiLink RC RX    |                     | - USB Camera Hub     |
     +----------------------+                     +----------------------+
                |                                             |
                +=============== COMMON GROUND ===============+
```

1. **Autopilot Power Rail:** Powered exclusively by the 3DR / Holybro PM02 Power Module connected to the Pixhawk 6-pin `POWER` port. Supplies clean 5.3V and provides analog voltage/current sensing to the ADC.
2. **Companion Computer Power Rail:** Powered by an independent, switching DC-DC Step-Down Regulator (UBEC) rated for **5.1V at 3.0A continuous (4.0A peak)**. Connect to the Raspberry Pi 4 either through a spliced USB-C connector (recommended for polyfuse protection) or directly to 40-pin GPIO Header Pin 2 (+5V) and Pin 6 (GND).
3. **Common Reference Ground:** A continuous, low-resistance ground plane connects the battery negative terminal, UBEC ground, Pixhawk ground, and Raspberry Pi ground (< 0.2&Omega; continuity).

---

### 1.4 iPhone Mounting & Camera Pipeline

#### Physical Mounting Specifications
- **Orientation:** Nadir (vertically downward-facing at 90.0&deg; relative to the drone's horizontal fuselage).
- **Vibration Dampening:** 4-point silicone rubber or TPU alpha-gel isolation mount to decouple high-frequency 200–400Hz propeller vibrations and prevent rolling-shutter "jello" distortion.
- **Lens Alignment:** Center of optical lens aligned within 20mm of the drone's Center of Gravity (CG).
- **Physical Verification:** Ensure camera clamp does not press phone power or volume buttons and does not cover ambient light/cooling surfaces.

#### Data Transfer Architecture `[IMPLEMENTED]`
- The iPhone does not require physical USB cables to the flight controller.
- **Workflow:**
  1. iPhone connects over 2.4GHz Wi-Fi to the same mobile hotspot as the Raspberry Pi 4.
  2. iPhone camera app streams video frames via HTTP multipart MJPEG or pushes frames via HTTP POST to the companion API endpoint: `http://<rpi-ip>:8000/api/camera/frame`.
  3. The backend OpenCV node (`backend/stream_capture.py`) ingests the frames at 1080p/720p @ 15–30 FPS, normalizes contrast, and forwards frames to the QR detection engine (`backend/qr_detector.py`).

---

### 1.5 Physical Verification Checklist (Gate C Bench Audit)

Before applying battery power, every technician must verify the following:

- [ ] **[PHYSICAL VERIFICATION PENDING]** Pin 1 (+5V) of Pixhawk TELEM2 cable is physically removed, snipped, and insulated.
- [ ] **[PHYSICAL VERIFICATION PENDING]** Continuity check: Resistance between RPi 5V pin and GND pin > 1k&Omega; (no dead shorts).
- [ ] **[PHYSICAL VERIFICATION PENDING]** Voltage verification: Power UBEC on bench; verify output is between **5.05V and 5.20V** with a calibrated multimeter before connecting to Raspberry Pi 4.
- [ ] **[PHYSICAL VERIFICATION PENDING]** Logic level check: With Pixhawk powered, measure TELEM2 Pin 2 (TX) to GND (must measure ~3.3V, never 5V).
- [ ] **[PHYSICAL VERIFICATION PENDING]** MultiLink RC receiver binds with transmitter: Solid green LED indicates active RF link; transmitter stick movements register in Mission Planner / QGroundControl radio calibration.

---

# SECTION 2: INTERNET, NETWORK & HOTSPOT SETUP

```
+-----------------------------------------------------------------------------------+
|                            MOBILE PHONE 2.4GHz HOTSPOT                            |
|                               (SSID: "Pixel_Hotspot")                             |
+-------------------------+---------------------------------+-----------------------+
                          |                                 |
                          | 192.168.43.x                    | 192.168.43.y
                          v                                 v
        +---------------------------------+       +-------------------+
        |     RASPBERRY PI 4 MODEL B      |       |   MOUNTED iPHONE  |
        |      (Built-in wlan0 Wi-Fi)     |       | (Camera Pipeline) |
        +----------------+----------------+       +-------------------+
                         |
           (Direct WAN Internet Uplink)
                         |
                         v
        +---------------------------------+
        |      PYTHONANYWHERE CLOUD       |
        |   (teamskycon.pythonanywhere.com)|
        +----------------+----------------+
                         ^
                         | HTTPS / WSS
                         v
        +---------------------------------+
        |     GROUND CONTROL STATION      |
        |   (Laptop / Tablet / Browser)   |
        +---------------------------------+
```

---

### 2.1 Raspberry Pi Built-in Wi-Fi Configuration (`wlan0`)

The Raspberry Pi 4 Model B features an onboard Broadcom BCM43455 dual-band Wi-Fi chipset. No external USB Wi-Fi adapter or dongle is required.

#### Mobile Hotspot Requirements
1. **Frequency Band:** **2.4 GHz ONLY**. (5 GHz Wi-Fi has poor penetration and is prone to radar-detection channel shutdowns in outdoor competition fields).
2. **Hotspot AP Isolation:** Disabled (ensures Raspberry Pi, iPhone, and GCS can communicate locally if needed).
3. **Bandwidth Saver / Auto-Turn Off:** Disabled on phone settings (prevents phone hotspot from shutting down during pre-flight waiting).

---

### 2.2 Multi-Hotspot Sequential Failover & Configuration `[IMPLEMENTED]`

The companion computer incorporates an autonomous network manager (`backend/network_manager.py`) designed to handle outdoor field disconnections without dropping active flight execution.

#### Priority Profile Table
Network credentials and priorities are managed in `/etc/skycon/network_profiles.json` (or locally in `backend/network_profiles.json`):

```json
[
  {
    "ssid": "Pixel_7_Hotspot",
    "psk": "skycon2026",
    "priority": 1,
    "security": "WPA-PSK"
  },
  {
    "ssid": "Pilot_iPhone_Hotspot",
    "psk": "saeindia2026",
    "priority": 2,
    "security": "WPA-PSK"
  },
  {
    "ssid": "Backup_Field_AP",
    "psk": "rescuegrid99",
    "priority": 3,
    "security": "WPA-PSK"
  }
]
```

#### Failover Rules & Single-Radio Constraints
1. **Single-Radio Hardware Limit:** The Raspberry Pi 4 has exactly one physical Wi-Fi radio (`wlan0`). It cannot connect to two Wi-Fi hotspots simultaneously.
2. **Sequential Scanning:** If Priority 1 loses internet ping for 3 consecutive cycles (30 seconds), the manager disconnects and attempts Priority 2, then Priority 3.
3. **60-Second Anti-Flapping Hysteresis:** Once connected to a valid network, the manager will **not** switch networks for at least 60 seconds, preventing destructive Wi-Fi flapping during minor signal dips.
4. **Credential Security:** Config file permissions must be set to `chmod 600` (readable only by root/service).

---

### 2.3 Cloud Communication vs. 100% Offline Autonomy `[IMPLEMENTED]`

```
+-----------------------------------------------------------------------------+
|                     OFFLINE MISSION CONTINUITY PIPELINE                     |
+-----------------------------------------------------------------------------+
 [Online State]  --> Stream Telemetry & QR Intel to PythonAnywhere in Real-Time
        |
   (Link Loss)
        v
 [Offline State] --> Aircraft CONTINUES autonomous flight plan without stopping
                 --> Pixhawk state machine executes search grid / orbit
                 --> All telemetry spooled into local SQLite/JSON buffer
                 --> 2D Spatial coverage tracker records explored cells locally
        |
  (Link Restored)
        v
 [Reconnection]  --> CloudSyncService detects link; authenticates with token
                 --> Flushes spooled telemetry buffer chronologically
                 --> Uploads verified QR codes and georeferenced coordinates
```

- **Online Mode:** Real-time telemetry, live video MJPEG stream, and instant QR intelligence are relayed to PythonAnywhere (`teamskycon.pythonanywhere.com`) and displayed on all remote GCS screens.
- **Offline Mode:** If Wi-Fi disconnects entirely, **the drone DOES NOT abort its mission**. Mission execution is fully autonomous inside `backend/mission_engine.py` and the Pixhawk autopilot. Telemetry is saved to `json_store` (`offline_sync_spool`). Once Wi-Fi reconnects, the synchronization service automatically flushes the queue to the cloud.

---

# SECTION 3: WEB APPLICATION SETUP & DEPLOYMENT

The SKYCON Ground Control Station software consists of:
1. **Frontend:** React 18 Single-Page Application (SPA) built with TypeScript, Vite, Tailwind CSS, Lucide icons, and Leaflet/Canvas mapping.
2. **Backend:** Dual-engine architecture:
   - `backend/server.py`: FastAPI + Uvicorn companion server (runs on RPi 4 for hardware I/O, WebSockets, and OpenCV).
   - `backend/main.py`: Production Flask WSGI application (runs on PythonAnywhere or local WSGI server for global REST routing and cloud sync).

---

### 3.1 Local Development & Field Launch

#### Prerequisites
- Node.js 18+ & npm
- Python 3.10+
- Git

#### Step-by-Step Local Launch

```powershell
# 1. Clone repository
git clone https://github.com/laxminivas06/Skycon_upgrade.git
cd Skycon_upgrade

# 2. Setup Python virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1       # On Linux/RPi: source venv/bin/activate
pip install -r requirements.txt

# 3. Launch Backend Companion Server (Port 8000)
python backend/server.py

# 4. In a separate terminal, install and launch Frontend GCS (Port 5173)
cd frontend
npm install
npm run dev
```

The GCS dashboard will be accessible immediately in your browser at `http://localhost:5173`.

---

### 3.2 PythonAnywhere Cloud Deployment Guide

The cloud backend is deployed to PythonAnywhere to provide a globally accessible dashboard and remote telemetry relay.

#### 1. Setup Web App on PythonAnywhere
1. Log in to your PythonAnywhere account (`teamskycon`).
2. Go to the **Web** tab and click **Add a new web app**.
3. Select **Manual configuration**, then choose **Python 3.10**.

#### 2. Virtual Environment & Code Setup
Open a Bash console in PythonAnywhere:

```bash
# Clone the repository into home directory
cd /home/teamskycon
git clone https://github.com/laxminivas06/Skycon_upgrade.git
cd Skycon_upgrade

# Create and populate virtual environment
mkvirtualenv --python=/usr/bin/python3.10 skycon-env
pip install -r requirements.txt
```

#### 3. WSGI Configuration File
In the PythonAnywhere **Web** tab, click on the **WSGI configuration file** link (`/var/www/teamskycon_pythonanywhere_com_wsgi.py`) and replace its entire content with:

```python
import sys
import os

# Path to project directory
project_home = '/home/teamskycon/Skycon_upgrade'
if project_home not in sys.path:
    sys.path.insert(0, project_home)

# Set production environment variables
os.environ['SKYCON_ENV'] = 'production'
os.environ['SKYCON_STORAGE_DIR'] = '/home/teamskycon/Skycon_upgrade/data'
os.environ['SKYCON_SECRET_KEY'] = 'sae-india-addc-2026-secure-secret-token'

# Import Flask application instance
from backend.main import app as application
```

#### 4. Static Files & Frontend SPA Routing
Under the **Static files** section of the Web tab, configure:

| URL | Directory Path |
| :--- | :--- |
| `/assets/` | `/home/teamskycon/Skycon_upgrade/dist/assets` |
| `/static/` | `/home/teamskycon/Skycon_upgrade/dist` |

#### 5. Reload Application
Click the large green **Reload teamskycon.pythonanywhere.com** button at the top of the Web tab.  
Your application is live at `https://teamskycon.pythonanywhere.com`.

---

### 3.3 Core REST API Endpoints & Diagnostic Probes

| HTTP Method | Route / URL | Function & Description |
| :---: | :--- | :--- |
| `GET` | `/health` | Cloud hosting uptime check (returns `{status: "ok", service: "skycon"}`). |
| `GET` | `/api/system/health` | Comprehensive diagnostics: CPU, RAM, disk, MAVLink link, and camera status. |
| `GET` | `/api/telemetry` | Snapshot of current altitude, GPS lat/lon, battery voltage, flight mode, and armed status. |
| `POST` | `/api/drone/arm` | Arm flight controller (payload: `{"force": false}`). Safety checks enforced. |
| `POST` | `/api/drone/disarm` | Disarm flight controller motors. |
| `POST` | `/api/drone/mode` | Change ArduCopter mode (payload: `{"mode": "LOITER"}` or `GUIDED`, `RTL`, `LAND`). |
| `POST` | `/api/missions/plan` | Submit and validate search mission parameters (lat/lon, radius, altitude, speed). |
| `GET` | `/api/camera/stream` | Multipart MJPEG real-time video stream for video displays. |
| `POST` | `/api/camera/frame` | Ingest single camera frame from smartphone camera pipeline. |
| `GET` | `/api/qr` | List all verified, decoded 2-digit QR codes with GPS coordinates and timestamps. |
| `GET` | `/api/heatmap/grid` | GeoJSON / grid payload of explored areas for search coverage visualization. |

---

### 3.4 Multi-Device Access (Laptop, Tablet, Mobile)

- **Field Laptop (Primary GCS):** Connect to mobile hotspot; open Chrome/Edge to `https://teamskycon.pythonanywhere.com` or local `http://192.168.43.x:8000`.
- **Field Runner Mobile Phone:** Open browser to `https://teamskycon.pythonanywhere.com`; log in as **Field Runner** role to receive real-time 2-digit QR rescue codes and send cryptographic ACKs.
- **Drone Operator Phone:** Access `/drone-core` mobile interface for quick telemetry verification and manual override monitoring.

---

# SECTION 4: GROUND CONTROL STATION (GCS) USER MANUAL

```
+-----------------------------------------------------------------------------------+
| SKYCON GCS HEADER: [Mode: GUIDED] [ARMED] [Batt: 16.2V 88%] [Sats: 14] [4G: OK]   |
+-----------------------------------------------------------------------------------+
| [RAIL] |                         TACTICAL MAP / VIDEO                     | [INST] |
| [Select] |  (Google Maps / Leaflet / Nadir Video Overlay)                   | Pitch  |
| [Draw]   |  - Planned Waypoint Path (Orange line)                           | Roll   |
| [Trash]  |  - Explored Coverage Cells (Green mesh)                          | Alt:5m |
| [Geofence|  - Drone Position Marker & Heading Vector                        | Spd:3m |
| [Upload] |  - Target Box Bounding Box & QR Candidate Box                    | VSI:0m |
| [Play]   +------------------------------------------------------------------+ [RADAR] |
| [TKOF]   | ELEVATION PROFILE DOCK                                            | Traffic|
| [HOLD]   |  [Takeoff 5m] ---> [Search Grid 5m] ---> [QR Scan 2.5m] ---> [RTL]| Proxim |
| [LAND]   +------------------------------------------------------------------+--------+
| [RTL]    | PRE-ARM CHECKS: [x] Battery  [x] GPS Lock  [x] Geofence  [x] MAVLink Link |
+-----------------------------------------------------------------------------------+
```

---

### 4.1 Login, Authentication & Role Selection

When accessing the web app, you are presented with the **Tactical Login Screen**:
- **Operator (GCS):** Full mission planning, arming, takeoff, flight mode changing, and geofence configuration.
- **Drone Core:** Real-time hardware telemetry HUD and local sensor monitoring.
- **Field Runner:** Mobile-optimized view displaying decoded QR codes (`^\d{2}$`) and One-Touch ACK confirmation button.
- **Testbench Admin:** Multi-role simulator, SITL link tests, and diagnostic packet injector.

---

### 4.2 Tactical Cockpit HUD & Telemetry Gauges

The Cockpit provides real-time situational awareness:
1. **Canvas Artificial Horizon (Attitude Indicator):** Displays pitch and roll angles in real-time derived from MAVLink `ATTITUDE` messages with visual pitch ladders and roll bank pointer.
2. **Speed & Altitude Tapes:**
   - Left Tape: Groundspeed and Airspeed in meters per second (m/s).
   - Right Tape: Relative Altitude above home (AGL) and Barometric Altitude (MSL) in meters.
3. **Compass Rose / Heading Tape:** Magnetic compass heading (0&deg;–359&deg;) with target waypoint heading bug.
4. **Vertical Speed Indicator (VSI):** Climb and descent rates in m/s with audio warnings for rapid descents (> 1.5 m/s).
5. **System Health Deck:** Top status indicators for Battery Voltage, Current Draw, Satellite Count, HDOP (< 1.4 for flight), and MAVLink Heartbeat packet loss rate.

---

### 4.3 Tactical Command Rail (Left Toolbar Guide)

| Icon / Button | Label | Operational Function |
| :---: | :---: | :--- |
| `crop_square` | **Box Select** | Activate tactical box selection tool to highlight search zones or objects on the map. |
| `delete` | **Clear Drawings** | Wipes user-drawn polygons, geofences, and temporary markers from the map canvas. |
| `my_location` | **Center Drone** | Smoothly pans and locks the tactical map viewport onto the drone's current GPS position. |
| `shield` | **Geofence Modal** | Opens the ADDC Rule 3.3 Geofence manager (Set max altitude, radius, and inclusion zones). |
| `upload` | **Upload Mission** | Validates the planned waypoint sequence, computes SHA-256 hash, and uploads to Pixhawk. |
| `download` | **Download Mission** | Reads currently stored mission items directly from Pixhawk EEPROM into the GCS. |
| `delete_forever` | **Wipe Mission** | Sends MAVLink `MISSION_CLEAR_ALL` to clear all flight plans from the autopilot. |
| `tune` | **Search Parameters** | Opens modal to configure grid line spacing, camera FOV overlap, and cruise speeds. |
| `play_arrow` | **Execute Mission** | Arms the autonomous state machine to begin the active mission plan. |
| **`TKOF`** | **Takeoff** | Sends MAVLink `MAV_CMD_NAV_TAKEOFF` command to command auto-takeoff to 5.0m AGL. |
| **`HOLD`** | **Loiter / Hold** | Immediately pauses autonomous flight and commands Pixhawk into `LOITER` mode. |
| **`LAND`** | **Precision Land** | Commands drone to immediately perform vertical landing at current coordinates. |
| **`RTL`** | **Emergency RTL** | Initiates immediate Return-To-Launch. Drone climbs/holds safe altitude and flies home. |

---

### 4.4 Mission Planning & 5-Stage Autonomous Execution

```
[STAGE 1: TAKEOFF & ASCENT]
  - Pre-arm safety checklist verified
  - Motors arm; vertical climb to 5.0m AGL
  - Climb rate stabilizes (|VSI| < 0.25 m/s)
         |
         v
[STAGE 2: AUTONOMOUS SEARCH RECONNAISSANCE]
  - Drone transitions to GUIDED mode
  - Flies Lawnmower or Spiral search pattern over designated zone
  - Nadir camera ingests video frames at 15–30 FPS
         |
         v
[STAGE 3: TARGET BOX DETECTION & QR ACQUISITION]
  - OpenCV detects cardboard target box in 3 consecutive frames
  - Drone centers over target and initiates controlled descent to 2.5m AGL
  - QR detector decodes 2-digit code matching regex ^\d{2}$
  - Audio chime triggers: "Target QR Identified"
         |
         v
[STAGE 4: FIELD RUNNER HANDSHAKE & ACK]
  - Decoded 2-digit code dispatched to Field Runner mobile device
  - Runner verifies code on ground and presses "CONFIRM ACK"
  - Cryptographic ACK received at GCS within watchdog timeout
         |
         v
[STAGE 5: RETURN-TO-LAUNCH & MISSION COMPLETE]
  - Drone ascends back to RTL altitude
  - Navigates autonomously to Home coordinates
  - Auto-lands at takeoff origin; motors disarm
```

#### Uploading & Starting a Mission
1. On the Tactical Map, click the **Mission Planning** tab.
2. Select your search pattern: **Lawnmower Grid** (large rectangular areas) or **Expanding Spiral** (localized point search).
3. Set parameters:
   - Search Altitude: `5.0 m`
   - Scan Speed: `2.5 m/s`
   - Spacing: `4.0 m` (calculated based on iPhone camera horizontal FOV)
4. Click **Validate Coordinates**: The 10-point validator verifies all waypoints are within geofence and coordinate bounds.
5. Click **Upload to FC**: Watch the progress bar confirm `MISSION_COUNT` and `MISSION_ACK`.
6. Click **ARM MOTORS**, verify props are clear, and click **EXECUTE MISSION**.

---

### 4.5 Live Video Feed & Computer Vision Inspection

- **Picture-in-Picture (PiP) Window:** Located at the bottom right of the GCS screen. Shows live nadir camera feed. Click to expand to full-screen.
- **Bounding Box Overlays:**
  - Blue outline: Raw box candidate detected by color/contour segmentation.
  - Amber outline: Multi-frame locked target box.
  - Green outline: Verified target with decoded 2-digit QR payload.
- **Heatmap Coverage Visualization:** Toggle the **Heatmap Layer** on the tactical map to see real-time green shading representing ground area successfully scanned by the camera.

---

# SECTION 5: EXHAUSTIVE TROUBLESHOOTING GUIDE

### 5.1 Raspberry Pi Not Connecting to Mobile Hotspot

| Possible Root Cause | Diagnostic Method | Corrective Action |
| :--- | :--- | :--- |
| **Hotspot set to 5 GHz only** | Check phone hotspot settings. | Configure phone hotspot explicitly to **2.4 GHz Band**. |
| **Wi-Fi credentials mismatch** | Inspect `/etc/skycon/network_profiles.json`. | Correct SSID and PSK typos. Restart networking: `sudo systemctl restart networking`. |
| **Wi-Fi radio soft-blocked** | Run `rfkill list wifi` on RPi terminal. | Run `sudo rfkill unblock wifi`. Ensure country code is set in `wpa_supplicant.conf` (`country=IN`). |
| **IP conflict / DHCP delay** | Check hotspot connected devices list. | Toggle phone hotspot off, wait 5 seconds, turn back on. RPi reconnect service will auto-join. |

---

### 5.2 MAVLink Communication Failure (RPi &harr; Pixhawk)

| Symptom | Root Cause | Solution |
| :--- | :--- | :--- |
| **Heartbeat Timeout / Disconnected** | Pin 1 (+5V) erroneously connected causing power reset. | Immediately disconnect Pin 1. Verify only Pin 2, 3, and 6 are connected. |
| **No MAVLink data received** | TX and RX wires reversed. | Swap Pin 8 and Pin 10 connections on Raspberry Pi header (GPIO 14 to RX, GPIO 15 to TX). |
| **Garbage / Malformed packets** | Baud rate mismatch. | Verify Pixhawk parameter `SERIAL2_BAUD = 921` matches `backend/mavlink_multiplexer.py` baud rate `921600`. |
| **Permission denied on serial port** | Linux user not in `dialout` group. | Run `sudo usermod -a -G dialout $USER` and reboot Raspberry Pi. |

---

### 5.3 PythonAnywhere Cloud Unavailable / WSGI Error

| Symptom | Root Cause | Solution |
| :--- | :--- | :--- |
| **500 Internal Server Error** | Missing dependency or WSGI import error. | Check PythonAnywhere Error Log: `/var/log/teamskycon.pythonanywhere.com.error.log`. Verify `requirements.txt` installed in virtualenv. |
| **504 Gateway Timeout** | Web app hanging or blocking call in WSGI. | Reload web app in PythonAnywhere Web Tab. Verify no synchronous loops block the Flask app. |
| **Daily CPU Quota Exceeded** | Continuous background polling drained CPU seconds. | Companion automatically buffers locally; use direct local IP `http://192.168.43.x:8000` for field operations. |

---

### 5.4 iPhone Camera Disconnected / Frame Lag

| Symptom | Root Cause | Solution |
| :--- | :--- | :--- |
| **Black screen / Stream timeout** | iPhone Wi-Fi disconnected or app closed. | Re-join iPhone to mobile hotspot; verify camera streaming app is running in foreground. |
| **High latency (> 1000ms)** | Excessive resolution or 2.4GHz RF congestion. | Reduce stream resolution to 720p (1280x720) @ 15 FPS in phone app settings. |
| **Phone overheating / Dimming** | Direct sunlight exposure on drone mount. | Use white sun-reflective shade; ensure ventilation gaps around iPhone mount. |

---

### 5.5 Coordinate Rejection & Waypoint Validation Errors

The SKYCON Coordinate Validator (`backend/coordinate_validator.py`) enforces 10 strict sanity checks:
1. `REJECTED_ZERO_COORDINATES`: Coordinates `(0.0, 0.0)` rejected.
2. `REJECTED_OUT_OF_BOUNDS`: Coordinates fall outside configured competition geofence perimeter.
3. `REJECTED_ALTITUDE_CEILING`: Altitude exceeds 10.0m maximum arena limit (ADDC rule).
4. `REJECTED_DUPLICATE_PACKAGE`: Coordinate package with identical timestamp/hash already processed.
5. **Recovery:** Click **Clear Drawings**, reset Home Point to verified current GPS position, and re-generate flight path.

---

### 5.6 Data Recovery After Reconnection

When the companion computer reconnects after a communication dropout:
1. `backend/cloud_sync.py` automatically initiates an incremental sync.
2. The spool queue (`offline_sync_spool`) flushes all cached flight telemetry in chronological order.
3. Decoded QR candidates and high-resolution target snapshot timestamps are reconciled with cloud records without data loss or duplicate records.

---

# SECTION 6: PRE-FLIGHT CHECKLIST & GROUND TEST RUNBOOK

```
+-----------------------------------------------------------------------------------+
|                        SKYCON PRE-FLIGHT GATE PROTOCOL                            |
+-----------------------------------------------------------------------------------+
  GATE A: Mechanical & Structural Assembly (Fasteners, Propellers, Frame)
    |
    v
  GATE B: Cold Electrical Wiring & Isolation (Continuity, UBEC, Pin 1 snip)
    |
    v
  GATE C: Props-OFF Bench Powered Test (MAVLink, Sensors, Hotspot, Camera)
    |
    v
  GATE D: Tethered / Low-Altitude Hover Readiness (Manual MultiLink Override)
    |
    v
  GATE E: Full Autonomous Competition Flight (ADDC 2026 Mission Plan)
```

---

### Phase Gate C: Props-OFF Bench System Test

> [!IMPORTANT]
> **PROPELLERS MUST BE COMPLETELY REMOVED FROM ALL MOTORS BEFORE EXECUTING THIS TEST.**

1. **Hardware Preparation:**
   - [ ] Propellers removed from all 4 motor shafts.
   - [ ] MultiLink RC transmitter powered ON, throttle at lowest position, switch in `STABILIZE`.
   - [ ] Mobile hotspot enabled on mobile phone (2.4 GHz).
   - [ ] GCS laptop connected to hotspot.

2. **Power-On Sequence:**
   - [ ] Connect 4S/6S flight battery to power distribution board.
   - [ ] Observe Pixhawk startup tones and RGB LED sequence (Flashing yellow &rarr; Flashing blue).
   - [ ] Observe Raspberry Pi 4 PWR LED (solid red) and ACT LED (blinking green).
   - [ ] Observe MultiLink RC receiver LED (solid green = bound).

3. **Software & Communications Verification:**
   - [ ] Raspberry Pi connects to mobile hotspot within 45 seconds (verify device IP in phone hotspot list).
   - [ ] Open GCS dashboard at `http://<rpi-ip>:8000` or `https://teamskycon.pythonanywhere.com`.
   - [ ] Verify **MAVLink Status: CONNECTED** (Heartbeat rate 1–2 Hz).
   - [ ] Verify **GPS Lock: 3D Fix**, Satellite count &ge; 10, HDOP < 1.4.
   - [ ] Verify **Battery Voltage:** 14.8V–16.8V (4S) or 22.2V–25.2V (6S).
   - [ ] Verify **Nadir Camera:** Live video feed rendering smoothly in PiP window.

4. **Safety & Override Dry-Run:**
   - [ ] With GCS, set Home Point to current location.
   - [ ] Verify all Pre-Arm checks in GCS show green checkmarks.
   - [ ] Flip MultiLink RC transmitter switch from `STABILIZE` to `LOITER`, then `GUIDED`. Verify mode changes in GCS HUD instantly.
   - [ ] Return switch to `STABILIZE`.
   - [ ] Arm motors via GCS. Motors will spin at idle speed (remember: PROPS ARE OFF).
   - [ ] Disarm motors via transmitter (throttle down and yaw left) or via GCS Disarm button. Motors stop immediately.

---

### Phase Gate D: Tethered Low-Altitude Hover

1. Reinstall propellers (CW and CCW props verified on matching motor rotation directions).
2. Move drone to open, outdoor, unobstructed grass flight area.
3. Safety pilot holds MultiLink transmitter with finger on flight mode switch.
4. Arm in `STABILIZE` or `POSHOLD` mode.
5. Take off manually to 1.5m hover. Confirm zero drift and responsive stick control.
6. Switch to `LOITER` mode: Confirm drone holds position and altitude within &plusmn;0.5m.
7. Switch to `GUIDED` mode for 10 seconds: Confirm companion computer maintains stable command loop.
8. Switch back to `STABILIZE` or land manually.

---

### Pixhawk LED Color & Tone Quick Reference

| LED Color & Pattern | Meaning / System State | Action Required |
| :--- | :--- | :--- |
| **Flashing Red** | Pre-Arm Check Failed | Check GCS pre-arm error message (e.g. Compass uncalibrated, bad GPS). |
| **Flashing Blue** | Disarmed, No GPS Lock | Wait for GPS 3D fix; move away from metal structures. |
| **Flashing Green** | Disarmed, GPS 3D Lock Acquired | System ready to arm. |
| **Solid Green** | Armed, GPS Lock Acquired | Motors live! Stand clear of propellers. |
| **Solid Blue** | Armed, No GPS Lock (Stabilize/AltHold) | Flight stabilized, but autonomous GPS navigation disabled. |
| **Double Flashing Yellow** | RC Failsafe Activated | Transmitter signal lost; check MultiLink receiver and battery. |

---

## CONCLUSION & CONTACT
This manual provides the baseline configuration for all ground tests, bench integrations, and competition flights of the SKYCON system. Adhere strictly to the safety protocols, isolation rules, and pre-flight checklists to guarantee safe and successful autonomous rescue missions.
