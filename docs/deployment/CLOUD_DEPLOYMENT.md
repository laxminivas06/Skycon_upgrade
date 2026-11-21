# SKYCON — CLOUD DEPLOYMENT & SYNCHRONIZATION GUIDE
## SAE INDIA Autonomous Drone Development Challenge (ADDC 2026)
### PythonAnywhere WSGI Cloud GCS & Resilient Outbound Push Architecture

---

## 1. CLOUD ARCHITECTURE OVERVIEW

The SKYCON cloud component is deployed on **PythonAnywhere** to serve as a remote monitoring, telemetry archival, and competition audit hub.

### Core Architectural Principles:
1. **WSGI Stateless Request/Response**: PythonAnywhere runs on standard WSGI (Web Server Gateway Interface). It does not natively support long-lived inbound WebSocket connections or persistent background daemon threads.
2. **Outbound Push Architecture**: The onboard Raspberry Pi 4 companion computer actively initiates HTTP POST requests over its 4G cellular dongle to push telemetry snapshots and mission events to PythonAnywhere (`/api/sync/telemetry` and `/api/sync/events`).
3. **Strict Air-Gap Flight Safety Invariant**: The cloud deployment is **READ-ONLY**. The cloud dashboard and API endpoints are strictly prohibited from issuing flight-control, mode change, waypoint upload, arming, or motor disarm commands. All safety-critical authority resides locally on the Raspberry Pi 4 and Pixhawk 2.4.8.
4. **Offline Resilience**: If cellular coverage is lost during flight, the companion Pi 4 automatically buffers records locally in `data/offline_sync_spool.json` and drains them upon reconnection with SHA-256 deduplication.

---

## 2. PYTHONANYWHERE SETUP PROCEDURE

### Step 1: Clone Repository & Create Virtual Environment
Open a Bash console in PythonAnywhere:
```bash
git clone https://github.com/your-org/Upgrade_skycon.git /home/username/Upgrade_skycon
cd /home/username/Upgrade_skycon
mkvirtualenv --python=/usr/bin/python3.10 skycon-env
pip install -r requirements.txt
```

### Step 2: Configure Web App
1. Navigate to the **Web** tab in PythonAnywhere.
2. Select **Add a new web app**.
3. Choose **Manual configuration** and select **Python 3.10**.
4. Set **Source code directory**: `/home/username/Upgrade_skycon`
5. Set **Working directory**: `/home/username/Upgrade_skycon`
6. Set **Virtualenv directory**: `/home/username/.virtualenvs/skycon-env`

### Step 3: Configure WSGI Configuration File
Edit the WSGI configuration file (`/var/www/username_pythonanywhere_com_wsgi.py`):
```python
import sys
import os

# Project root path
path = '/home/username/Upgrade_skycon'
if path not in sys.path:
    sys.path.insert(0, path)

# Configure environment variables
os.environ['SKYCON_ENV'] = 'production'
os.environ['SKYCON_SECRET_KEY'] = 'YOUR_SECURE_COMPETITION_SECRET_KEY'
os.environ['ALLOW_PHYSICAL_ARMING'] = 'False'  # Safety interlock always enforced

# Import Flask application entry point
from backend.main import app as application
```

### Step 4: Configure Static Files
Under the **Static files** section of the Web tab:
- **URL**: `/assets/`
- **Directory**: `/home/username/Upgrade_skycon/frontend/dist/assets`

### Step 5: Reload Web App
Click the green **Reload username.pythonanywhere.com** button.

---

## 3. CLOUD REST API ENDPOINTS

The PythonAnywhere instance exposes the canonical REST API endpoints:

| Endpoint | Method | Purpose | Flight Authority |
| :--- | :--- | :--- | :--- |
| `/health` | `GET` | Hosting container health & uptime probe | None |
| `/api/system/health` | `GET` | CPU, RAM, and disk utilization metrics | None |
| `/api/telemetry` | `GET` | Latest telemetry snapshot for remote viewers | None |
| `/api/sync/telemetry` | `POST` | Ingests companion telemetry pushed by Pi 4 | None (Ingestion only) |
| `/api/sync/events` | `POST` | Ingests mission milestones and audit events | None (Ingestion only) |
| `/api/missions/active` | `GET` | View active mission progress & 12-stage state | None |
| `/api/qr/verified` | `GET` | View decoded 2-digit QR & 4-digit puzzle codes | None |

---

## 4. COMPANION CONFIGURATION FOR CLOUD PUSH

On the Raspberry Pi 4 companion computer, set the target cloud URL in the environment or `.env` file:
```bash
export SKYCON_CLOUD_URL="https://username.pythonanywhere.com"
export SKYCON_CLOUD_API_KEY="YOUR_SHARED_SYNC_TOKEN"
```

The onboard service `cloud_sync.py` will automatically:
1. Push telemetry snapshots at 1.0 Hz when 4G is connected.
2. Back off exponentially (up to 30.0s) when 4G drops.
3. Queue up to 5,000 packets offline in atomic JSON storage.
4. Auto-drain the queue upon reconnection.

---

## 5. SECURITY & AIR-GAP AUDITING

To verify that the cloud deployment cannot affect physical flight:
1. Review `backend/cloud_sync.py`: Outbound requests only transmit telemetry and mission state snapshots; no inbound command processing exists.
2. Review `backend/main.py`: Remote requests to arming or motor override endpoints require local operator tokens and are permanently blocked when `ALLOW_PHYSICAL_ARMING = False`.
3. MultiLink V1.0 RC receiver connected to Pixhawk `RC IN` provides instant manual override regardless of companion or cloud state.
