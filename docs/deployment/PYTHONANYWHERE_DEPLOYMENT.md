# SKYCON System — PythonAnywhere Cloud Deployment Guide

## 1. Overview
PythonAnywhere serves as the production cloud web hosting platform for the **SKYCON Ground Control Station (GCS)** web application and central mission synchronization REST API.

Because PythonAnywhere operates via standard **WSGI (Web Server Gateway Interface)**, the web application is built with **Flask**, while flight-critical low-latency MAVLink control and computer vision operate on the onboard **Raspberry Pi 4 Model B**.

---

## 2. Step-by-Step Deployment Instructions

### Step 1: Open a Bash Console on PythonAnywhere
In your PythonAnywhere dashboard, open a new **Bash Console**.

### Step 2: Clone the Repository
```bash
cd ~
git clone https://github.com/RISHITBARLA/saeindia.git Upgrade_skycon
cd Upgrade_skycon
```

### Step 3: Create and Activate Virtual Environment
```bash
mkvirtualenv --python=/usr/bin/python3.10 skycon-env
pip install --upgrade pip
pip install -r requirements.txt
```

### Step 4: Configure the Web App in PythonAnywhere Dashboard
1. Go to the **Web** tab in your PythonAnywhere dashboard.
2. Click **Add a new web app**.
3. Choose **Manual configuration** and select **Python 3.10** (or 3.11).
4. In the **Virtualenv** section, enter the virtual environment path:
   ```
   /home/<username>/.virtualenvs/skycon-env
   ```
5. In the **Code** section:
   - **Source code**: `/home/<username>/Upgrade_skycon`
   - **Working directory**: `/home/<username>/Upgrade_skycon`

### Step 5: Configure the WSGI Configuration File
Click on the **WSGI configuration file** link (e.g. `/var/www/<username>_pythonanywhere_com_wsgi.py`). Delete the default contents and insert:

```python
import sys
import os

# Define project path
project_home = '/home/<username>/Upgrade_skycon'
if project_home not in sys.path:
    sys.path.insert(0, project_home)

# Set production environment variables
os.environ['SKYCON_ENV'] = 'production'
os.environ['SKYCON_DEBUG'] = 'False'

# Import WSGI application from wsgi.py
from wsgi import application
```
*(Replace `<username>` with your actual PythonAnywhere username).*

### Step 6: Static File Mapping
In the **Static files** section of the Web tab, map static assets:
- **URL**: `/assets/`
- **Directory**: `/home/<username>/Upgrade_skycon/frontend/dist/assets`

### Step 7: Reload the Web App
Click the green **Reload <username>.pythonanywhere.com** button at the top of the Web tab.

### Step 8: Verification
Test your deployment by opening:
- `https://<username>.pythonanywhere.com/health` (should return `{ "status": "healthy", ... }`)
- `https://<username>.pythonanywhere.com/api/telemetry`
- `https://<username>.pythonanywhere.com/` (opens the Ground Station UI)
