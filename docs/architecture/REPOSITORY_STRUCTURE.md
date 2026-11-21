# SKYCON System — Repository Structure Guide

## Clean Standardized Directory Layout

```
Upgrade_skycon/
├── backend/
│   ├── app/                    # Modular Python application
│   │   ├── api/                # REST API route handlers
│   │   ├── camera/             # Smartphone & V4L2 camera pipelines
│   │   ├── communication/      # Telemetry sync & packet dispatch
│   │   ├── config/             # Application settings & environment parsing
│   │   ├── core/               # Logging & security configurations
│   │   ├── drone/              # Unified onboard edge drone core (Autopilot, FSM, Vision, Georef)
│   │   ├── geofence/           # Geofence boundary verification & watchdog
│   │   ├── geomapping/         # Geographic projection & coordinate transforms
│   │   ├── mavlink/            # MAVLink v2 binary multiplexer & ArduPilot mode translations
│   │   ├── missions/           # 17-State FSM, 5-minute competition timeline & geofence watchdogs
│   │   ├── qr/                 # Subpixel QR detection & 2-digit regex validation
│   │   ├── services/           # Backend application services
│   │   ├── storage/            # Atomic SimpleJsonStore (corruption-resistant JSON persistence)
│   │   ├── telemetry/          # Telemetry state aggregation & downlinks
│   │   ├── utils/              # Geodesic math, Haversine distance, point-in-polygon
│   │   └── main.py             # Flask application entry point (WSGI-compliant)
│   ├── communication/          # Packet protocol & synchronization services
│   ├── data/                   # Active JSON collections (missions, detections, geofence)
│   ├── drone/                  # Module proxy exporting backend.app.drone
│   ├── intelligence/           # Spatial grid & target management
│   ├── logs/                   # Rotating application logs (skycon_app.log)
│   ├── reconnaissance/         # Area coverage planning & tracking
│   ├── storage/                # Simple JSON store implementation
│   ├── server.py               # Companion FastAPI + Uvicorn server (with high-speed WebSockets)
│   ├── mavlink_multiplexer.py  # Standalone MAVLink binary multiplexer
│   ├── mission_engine.py       # Standalone mission engine & FSM
│   └── diagnostic_engine.py    # Autonomous 12-section hardware diagnostic engine
│
├── config/                     # Hardware & flight configurations
│   └── pixhawk/                # Pixhawk 2.4.8 ArduCopter parameter files
│       ├── S500_AUTONOMOUS_PIXHAWK_TUNING.param
│       └── S500_ESSENTIAL_UNIVERSAL.param
│
├── frontend/                   # React 18 + TypeScript + Vite Web Application
│   ├── ground-station/         # Dedicated Ground Control Station static entry point
│   │   └── index.html          # Standalone GCS HTML HUD
│   ├── drone-core/             # Dedicated Drone Core mobile phone entry point
│   │   └── index.html          # Mobile-first onboard camera streaming interface
│   ├── src/                    # Ground Station HUD, telemetry cards, Leaflet map, Leaflet draw
│   │   ├── components/         # GCS & Drone UI components
│   │   ├── features/           # Dashboard page & telemetry HUD
│   │   ├── services/           # MAVLink, mission engine, vision, and transport services
│   │   └── types/              # TypeScript interfaces (MAVLink, mission, transport)
│   ├── dist/                   # Production compiled frontend bundle
│   └── package.json            # Frontend dependency manifest
│
├── docs/                       # Official System Documentation
│   ├── addc-rules/             # Official ADDC 2026 rulebook & compliance matrix
│   │   ├── ADDC_RULE_BOOK.pdf
│   │   └── ADDC_COMPLIANCE_MATRIX.md
│   ├── api/                    # REST API endpoint reference
│   │   └── API_REFERENCE.md
│   ├── architecture/           # System architecture, data flows, graph reports
│   │   ├── SYSTEM_ARCHITECTURE.md
│   │   ├── REPOSITORY_STRUCTURE.md
│   │   └── GRAPH_REPORT.md
│   ├── deployment/             # PythonAnywhere & Raspberry Pi deployment manuals
│   │   └── PYTHONANYWHERE_DEPLOYMENT.md
│   ├── hardware/               # Wiring guides, pinout diagrams, safety checks & params
│   │   ├── HARDWARE_INTEGRATION_GUIDE.md
│   │   ├── RASPBERRY_PI_SETUP.md
│   │   ├── PRE_ARM_SAFETY_CHECKS.md
│   │   └── parameters/
│   │       ├── S500_AUTONOMOUS_PIXHAWK_TUNING.param
│   │       └── S500_ESSENTIAL_UNIVERSAL.param
│   ├── reference/              # Technical specifications & optical standards
│   │   ├── ADDC_RULE_BOOK.pdf
│   │   └── SPI_100_AND_PIXEL_SPECIFICATIONS.md
│   └── reports/                # Audit reports & verification logs
│       └── REPOSITORY_AUDIT_REPORT.md
│
├── scripts/                    # Python operational and diagnostic scripts
│   ├── audit_preflight_live.py # Live pre-flight verification script
│   ├── check_fence_status.py   # Live geofence status probe
│   ├── diagnostic_engine.py    # 12-section diagnostic probe
│   ├── load_params_to_pixhawk.py # Parameter loader & verification tool
│   ├── probe_pixhawk_live.py   # Serial MAVLink heartbeat & sensor probe
│   ├── sync-dist.js            # Frontend build asset synchronizer
│   ├── sync-pixhawk-params-live.py # Live parameter synchronizer
│   ├── test-master-live-suite.py # Comprehensive live diagnostic suite
│   ├── test_arm_reasons.py     # Pre-arm rejection code analyzer
│   └── test_mode_switch.py     # ArduPilot flight mode transition test
│
├── tests/                      # Unified Python Test Suite
│   ├── adversarial_georef_test.py      # Geodesic projection & 3D tilt stress tests
│   ├── test_autonomous_reconnaissance.py # Reconnaissance & coverage planning tests
│   ├── test_communication_foundation.py# MAVLink packet & transport tests
│   ├── test_drone_core_edge.py         # Edge autonomy, FSM & failsafe RTL tests
│   ├── test_drone_core_m2.py           # M2 edge vision, georeferencing & braking tests
│   ├── test_skycon_master_suite.py     # Master 16-point system architecture test suite
│   ├── test_smartphone_camera_pipeline.py # Smartphone camera ingest & CV tests
│   └── test_spatial_intelligence.py    # Spatial grid, target manager & heatmap tests
│
├── drone_core.py               # Lightweight compatibility shim redirecting to backend.app.drone
├── wsgi.py                     # Root WSGI entry point for PythonAnywhere hosting
├── requirements.txt            # Python dependencies (locked, standard library + core CV)
├── .env.example                # Sample environment variables
├── package.json                # Root package manifest with unified npm scripts
└── README.md                   # Repository overview & quickstart
```
