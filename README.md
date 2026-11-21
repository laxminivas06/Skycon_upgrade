# 🛸 SKYCON — Autonomous Drone Rescue & Mission System (ADDC 2026)

Full-stack autonomous drone telemetry, computer vision target acquisition, and 5-minute competition mission system built for the **SAE INDIA Autonomous Drone Competition (ADDC 2026)**.

---

## 🎯 Architecture & Tech Stack

- **Target Aircraft**: S500 Quadcopter Frame, 2216/2212 920KV motors, 30A ESCs, 1045 propellers.
- **Flight Controller**: Pixhawk 2.4.8 running ArduCopter firmware (TELEM1 @ 921600 or 57600 baud).
- **Sole Companion Computer**: Raspberry Pi 4 Model B (Python FastAPI / Flask + OpenCV + MAVLink 2.0).
- **Onboard Optical Sensor**: Mounted Smartphone running **SKYCON Drone Core** mobile interface.
- **Manual Safety Override**: MultiLink V1.0 2.4 GHz RC receiver connected to Pixhawk RC IN.
- **Persistence Store**: `SimpleJsonStore` — Air-gapped, corruption-resistant atomic JSON database with SHA-256 cryptographic checksums.
- **Cloud Hosting**: PythonAnywhere WSGI-compliant Flask REST application (`wsgi.py`).
- **Ground Station HUD**: React 18, TypeScript, Tailwind CSS, Lucide icons, Leaflet.

---

## 📁 Repository Structure

```
Upgrade_skycon/
├── backend/
│   ├── app/                    # Modular Python backend (API, config, core, storage, mavlink)
│   │   ├── drone/              # Unified onboard edge drone core (Autopilot, FSM, Vision, Georef)
│   │   ├── camera/             # Camera stream pipelines & V4L2 capture
│   │   ├── vision/             # Target tracking, pinhole projection & georeferencing
│   │   ├── qr/                 # Subpixel QR detection & 2-digit regex validation
│   │   ├── missions/           # 17-state FSM & 5-minute competition timeline
│   │   ├── mavlink/            # MAVLink v2 binary multiplexer & ArduPilot mode engine
│   │   ├── storage/            # Simple atomic JSON database
│   │   └── main.py             # Flask application entry point (WSGI compliant)
│   ├── data/                   # JSON collections (missions, detections, geofence, audit)
│   ├── logs/                   # Rotating application logs (skycon_app.log)
│   └── server.py               # Companion FastAPI + Uvicorn server (with high-speed WebSockets)
├── config/                     # Hardware & flight configurations
│   └── pixhawk/                # Pixhawk 2.4.8 ArduCopter parameter files
├── frontend/                   # React 18 + Vite Web Application
│   ├── ground-station/         # Dedicated Ground Control Station HTML interface
│   ├── drone-core/             # Dedicated Drone Core mobile phone interface
│   └── src/                    # Ground Station HUD, telemetry decks, map canvas
├── docs/                       # Official System Documentation
│   ├── architecture/           # Master system architecture & graph reports
│   ├── hardware/               # Wiring pinouts, power regulation, pre-arm checks, parameters
│   ├── reference/              # Optical standards, SPI 100 specifications, ADDC rulebook
│   ├── addc-rules/             # ADDC 2026 rulebook & compliance matrix
│   ├── api/                    # REST API endpoint reference
│   ├── deployment/             # PythonAnywhere cloud & Raspberry Pi setup guides
│   └── reports/                # Complete repository audit and cleanup reports
├── scripts/                    # Live diagnostic tools, parameter uploaders & probes
├── tests/                      # Automated unit & integration test suites
├── wsgi.py                     # Root WSGI entry point for PythonAnywhere
├── drone_core.py               # Compatibility shim redirecting to backend.app.drone
└── requirements.txt            # Clean Python dependencies
```

---

## 🚀 Quickstart & Local Development

### 1. Python Backend (Cloud WSGI / Local REST API)
```bash
# Install Python dependencies
pip install -r requirements.txt

# Run Flask WSGI Server (port 8443)
python wsgi.py
```
Health check: `http://localhost:8443/health`

### 2. Raspberry Pi 4 Companion Server (with WebSockets & MAVLink)
```bash
# Run high-speed companion hub on Raspberry Pi 4
python -m backend.server
```

### 3. Frontend Development
```bash
cd frontend
npm install
npm run dev
```

---

## 🧪 Automated Test Verification

Run all test suites across the Python companion and API layers:

```bash
# 1. Run Master Architecture Verification Suite (16/16 Tests)
python -m unittest tests/test_skycon_master_suite.py

# 2. Run Comprehensive Edge Autonomy & Vision Suite
python -m unittest tests/adversarial_georef_test.py tests/test_drone_core_edge.py tests/test_smartphone_camera_pipeline.py tests/test_drone_core_m2.py

# 3. Discover and run all unit test suites
python -m unittest discover -s tests -p "test_*.py"
```

---

## 📖 System Documentation Links

- [Master System Architecture](docs/architecture/SYSTEM_ARCHITECTURE.md)
- [Repository Structure Guide](docs/architecture/REPOSITORY_STRUCTURE.md)
- [Hardware Integration & Pinout Guide](docs/hardware/HARDWARE_INTEGRATION_GUIDE.md)
- [Raspberry Pi 4 Setup Manual](docs/hardware/RASPBERRY_PI_SETUP.md)
- [Pixhawk Pre-Arm Safety Checks & Diagnostic Matrix](docs/hardware/PRE_ARM_SAFETY_CHECKS.md)
- [SPI 100 & Camera Pixel Specifications](docs/reference/SPI_100_AND_PIXEL_SPECIFICATIONS.md)
- [PythonAnywhere Cloud Deployment](docs/deployment/PYTHONANYWHERE_DEPLOYMENT.md)
- [REST API Reference](docs/api/API_REFERENCE.md)
- [ADDC 2026 Compliance Matrix](docs/addc-rules/ADDC_COMPLIANCE_MATRIX.md)
- [Repository Audit & Cleanup Report](docs/reports/REPOSITORY_AUDIT_REPORT.md)
