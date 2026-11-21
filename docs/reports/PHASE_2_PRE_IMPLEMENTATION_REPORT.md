# SKYCON Phase 2: Pre-Implementation Architecture, Storage & API Review

## 1. Executive Summary & Purpose
This report establishes the baseline review for **Phase 2: Backend Architecture, Database, API Foundation and Basic Frontend** of the **SKYCON / AUTONOMOUS-DRONE (ADDC 2026)** project.
Phase 1 established repository cleanup, documentation organization, removal of legacy ESP32-S3 and Render/Netlify files, and PythonAnywhere hosting preparation. Phase 2 transitions the application from a prototype structure to an integrated, aerospace-grade modular foundation.

---

## 2. Comprehensive System Inventory & Current Status

### 2.1 What Already Exists
- **Modular Python Backend**:
  - `backend/main.py`: Production WSGI-compliant Flask REST application (`wsgi.py`).
  - `backend/server.py`: High-speed FastAPI + Uvicorn companion hub for WebSockets & camera frame ingestion.
  - `backend/mavlink_multiplexer.py`: Zero-dependency MAVLink 2.0 binary protocol multiplexer with ArduCopter mode translations and simulated Pixhawk fallback.
  - `backend/mission_engine.py`: 17-state autonomous mission finite state machine (FSM), 5-minute competition watchdog, and triple-layer geofence monitor.
  - `backend/simple_json_store.py`: Process-safe, atomic JSON persistence engine with file locking, SHA-256 cryptographic checksums, `.bak` auto-healing, and bounded storage.
  - `backend/georeferencing.py` & `backend/vision.py`: 3D Euler-corrected pinhole camera projection and Brown-Conrady optical distortion model.
  - `backend/qr_detector.py`: Dual-pipeline WeChat-QR subpixel edge detector with strict regex `^\d{2}$` validation.
  - `backend/stream_capture.py` & `backend/v4l2_capture.py`: Non-blocking, single-slot freshest-frame camera pipelines with orientation transforms (0°, 90°, 180°, 270°).
  - `backend/companion_vision_node.py`: Stage-aware onboard vision node (Stage A cruise vs. Stage B inspection braking).
  - `backend/settings.py` & `backend/logging_config.py`: Centralized dataclass configuration and rotating log management.
- **Frontend**:
  - React 18, TypeScript, Tailwind CSS, Lucide icons, Leaflet map canvas in `frontend/src/`.
  - Tactical Dark Theme (`bg-sae-dark`) with aerospace styling.
  - Role management in `frontend/src/App.tsx` (`GroundStation`, `Drone`, `PhoneMission`, `Runner`, `Testbench`).
- **Data & Storage Collections**:
  - `data/missions.json`, `data/geofence.json`, `data/detections.json`, `data/telemetry.json`, `data/system_config.json`, `data/audit_logs.json`.
- **System Documentation**:
  - Rulebooks and compliance matrices (`docs/addc-rules/`).
  - System architecture and graph reports (`docs/architecture/`).
  - Hardware integration, Raspberry Pi setup, and pre-arm checklists (`docs/hardware/`).
  - Optical resolution and SPI 100 specifications (`docs/reference/`).
  - Cloud deployment manual for PythonAnywhere (`docs/deployment/`).

### 2.2 What is Working (Verified)
- **MAVLink Multiplexer**: Successfully translates modes (`GUIDED`, `LOITER`, `RTL`, `LAND`, `AUTO`, `STABILIZE`), handles arm/disarm commands, reads RC override, and simulates Pixhawk 2.4.8 telemetry when physical serial ports are absent.
- **Autonomous Mission FSM**: 17 states with verified transitions, monotonic time tracking (300s competition limit), and RTL failsafes.
- **Georeferencing & Optical Math**: 3D attitude-compensated projection verified across 1896 attitude/altitude combinations with zero NaN/Inf traps.
- **Atomic JSON Storage**: Atomically writes JSON with `.tmp` staging, SHA-256 checksums, and verified auto-recovery from corrupted files.
- **Cloud Hosting Entry Point**: `wsgi.py` exposes `<Flask 'backend.main'>` cleanly for PythonAnywhere web deployment.
- **Python Unit Test Harnesses**: 59 passing unit and integration tests across 8 test suites (100% pass rate).

### 2.3 What is Partially Working
- **API Grouping & Standardization**: Existing endpoints in `backend/main.py` and `backend/server.py` cover basic commands, telemetry, missions, and geofence, but lack canonical grouping across `/api/auth`, `/api/system`, `/api/drone`, `/api/telemetry`, `/api/mavlink`, `/api/camera`, `/api/vision`, `/api/qr`, `/api/geofence`, `/api/geomapping`, `/api/missions`, `/api/events`, and `/api/health`.
- **Authentication**: Frontend has an in-memory session store (`authService.ts`), but backend lacks proper token generation, password hashing (PBKDF2/SHA-256 salt), and role-based access enforcement (`/api/auth`).
- **Health Monitoring**: `GET /health` returns basic uptime and system memory; it must be expanded into a unified health service reporting discrete, honest subsystem statuses (`ONLINE`, `OFFLINE`, `CONNECTING`, `DEGRADED`, `NOT CONFIGURED`, `SIMULATION`, `HARDWARE VERIFIED`, `ERROR`).
- **Frontend Dual-Interface Separation**: While `App.tsx` supports multiple role views, the separation between the **Ground Control Station** (HUD, map, flight control rail, telemetry, mission planner) and **Drone Core** (mobile-first mounted phone interface with camera permissions, video preview, connection to Pi 4, and QR diagnostics) needs clear, responsive UI dedicated entry points.

### 2.4 What is Broken or Deprecated (Cleaned in Phase 1)
- Obsolete ESP32-S3 microcontroller code and firmware bridges (completely excised).
- Obsolete Netlify and Render deployment files (completely removed).
- Deprecated Node.js backend relay files and redundant `.cjs` scripts (deleted).

### 2.5 What Needs to be Preserved
- All core flight safety logic, MAVLink binary parsing, and failsafe RTL triggers.
- Air-gapped onboard execution: The Raspberry Pi 4 must remain 100% autonomous and never rely on cloud connectivity for flight stabilization, obstacle avoidance, or safety RTL.
- S500 quadcopter parameter configurations (`docs/hardware/parameters/`).
- Optical resolution, sensor geometry, and SPI 100 specifications (`docs/reference/SPI_100_AND_PIXEL_SPECIFICATIONS.md`).

### 2.6 What Needs to be Modified
- `backend/main.py`: Organize endpoints into canonical Flask Blueprints or structured route groups matching Part D requirements.
- `backend/settings.py`: Expand configuration with explicit environment toggles (`DEVELOPMENT`, `PRODUCTION`, `RASPBERRY_PI`, `CLOUD_PYTHONANYWHERE`), security salts, and flight-safety interlocks (`ALLOW_PHYSICAL_ARMING=False` by default for bench safety).
- `backend/simple_json_store.py`: Add schema versioning (`schema_version: "2.0"`), user authentication persistence with hashed passwords, and retention bounding.

### 2.7 What Needs to be Created
- `backend/auth_service.py`: Token authentication service with PBKDF2/SHA-256 salted password hashing, role permissions (`OPERATOR`, `PILOT`, `RUNNER`, `OBSERVER`), and session expiration.
- `backend/system_health.py`: Dedicated system health service performing actual checks for backend, storage, Raspberry Pi companion, Pixhawk serial heartbeat, camera feed, and network links.
- `docs/reports/SKYCON_UPDATED_MASTER_ROADMAP.md`: Updated master roadmap reflecting actual repository condition and future phases.
- `docs/reports/PHASE_2_COMPLETION_REPORT.md`: Comprehensive completion report following Phase 2 implementation.
- Basic frontend shell components in `frontend/src/` for Ground Station and Drone Core with clean responsive layouts.

---

## 3. Architecture Comparison: Proposed vs. Actual

| Architectural Dimension | Original Proposed Architecture | Actual Implemented Architecture | Technical Rationale & Status |
| :--- | :--- | :--- | :--- |
| **Microcontroller / Companion** | ESP32-S3 + Raspberry Pi 4 | **Raspberry Pi 4 Model B Sole Companion** | ESP32-S3 was redundant, added UART bottleneck, and created packet drops. Pi 4 directly interfaces with Pixhawk via TELEM1 UART. |
| **Cloud Web Hosting** | Render / Netlify SPA | **PythonAnywhere (Flask WSGI)** | Single-language Python stack reduces cognitive overhead and allows sharing backend libraries between cloud and companion. |
| **Onboard High-Speed Hub** | Node.js Relay / Express | **FastAPI + Uvicorn (Python 3.10+)** | High-performance async WebSocket hub and camera ingestion running locally on Pi 4 with < 20ms frame latency. |
| **Database & Persistence** | PostgreSQL / SQLite / Loose JSON | **Atomic `SimpleJsonStore` + SQLite Audit** | Zero external daemon dependency, air-gapped safe, corruption-resistant with SHA-256 hashes and auto-recovery. |
| **Onboard Camera Sensor** | USB Webcams / Generic IP | **Mounted Smartphone (SKYCON Drone Core)** | High-resolution phone camera delivers optical resolution matching SPI 100 target specifications without heavy camera payloads. |
| **Frontend Architecture** | Fragmented separate HTML directories | **Single Unified React 18 + Vite PWA** | Responsive component tree with dynamic role selection (`GroundStation` vs `DroneCore`) sharing MAVLink and telemetry types. |

---

## 4. Dependencies & Prerequisites

### 4.1 Python Dependencies (`requirements.txt`)
- `Flask>=3.0.0` & `flask-cors>=4.0.0`: WSGI cloud REST server.
- `fastapi>=0.110.0` & `uvicorn>=0.28.0` & `websockets>=12.0`: Local companion server.
- `pymavlink>=2.4.40`: Direct MAVLink protocol communication.
- `opencv-python-headless>=4.9.0`: Computer vision & frame transforms.
- `numpy>=1.26.0`: Matrix math and 3D projections.
- `pydantic>=2.6.0`: Request validation and data schemas.
- `psutil>=5.9.0`: Hardware health, CPU, memory, and disk monitoring.

---

## 5. Risks & Unresolved Hardware Questions

1. **Raspberry Pi 4 UART Baud Rate**:
   - TELEM1 default on ArduCopter is 57600 baud (`SERIAL1_BAUD=57`). High-rate telemetry and vision guidance benefit from 921600 baud (`SERIAL1_BAUD=921`).
   - *Mitigation*: MAVLink multiplexer supports autodetect and falls back to 57600 baud if 921600 handshake fails.
2. **Smartphone Camera Wi-Fi Latency**:
   - Local 2.4 GHz congestion at competition fields can degrade RTSP/MJPEG streaming.
   - *Mitigation*: Single-slot freshest-frame buffer drops stale frames instantly; phone can stream over a dedicated 5 GHz hotspot created by the Raspberry Pi.
3. **Power Subsystem Isolation**:
   - Raspberry Pi 4 draws up to 3A at 5V under heavy OpenCV loads. Powering from Pixhawk servo rail causes brownouts.
   - *Mitigation*: Dedicated 5V 3A UBEC wired directly from main LiPo battery.
