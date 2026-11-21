# SKYCON — RASPBERRY PI 4 DEPLOYMENT GUIDE
## SAE INDIA Autonomous Drone Development Challenge (ADDC 2026)
### Production Setup for Companion Computer (Raspberry Pi 4 Model B)

---

## 1. HARDWARE SPECIFICATIONS & REQUIREMENTS

| Component | Specification | Operational Role |
| :--- | :--- | :--- |
| **SBC** | Raspberry Pi 4 Model B (4GB or 8GB LPDDR4) | Autonomous mission engine, CV pipeline, MAVLink mux, GCS server |
| **Storage** | 32GB+ MicroSD (Class 10, UHS-I, A2 rated) | OS, backend code, SQLite/JSON stores, audit logs, flight records |
| **Power Supply** | 5.1V / 3.0A UBEC / Buck Converter | Dedicated power from flight battery; never powered from Pixhawk rail |
| **Cooling** | Active heatsink + 5V brushless cooling fan | Prevents thermal throttling during high-workload CV processing |
| **Serial Bus** | PL011 UART (`/dev/ttyAMA0` via GPIO 14 & 15) | Dedicated 57600 baud MAVLink link to Pixhawk 2.4.8 TELEM2 port |
| **Cellular Dongle** | 4G LTE USB SIM Modem (Huawei/ZTE/Jio) | Outbound telemetry sync to PythonAnywhere cloud GCS |
| **Camera Link** | Onboard Wi-Fi Access Point (`SKYCON_DRONE_AP`) | Local high-bandwidth link for mounted iPhone camera stream |

---

## 2. OPERATING SYSTEM & BASE ENVIRONMENT

### 2.1 Recommended OS Image
- **OS**: Raspberry Pi OS Lite (64-bit) — Debian 12 (Bookworm) or Debian 11 (Bullseye).
- Headless installation (no desktop GUI) to maximize RAM and CPU availability for autonomous navigation and computer vision.

### 2.2 System Packages Installation
```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    build-essential \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libzbar0 \
    wireless-tools \
    net-tools \
    git \
    curl \
    libraspberrypi-bin
```

---

## 3. SERIAL PORT & UART CONFIGURATION (PIXHAWK TELEM2)

Raspberry Pi 4 models assign `/dev/ttyAMA0` (the reliable hardware PL011 UART) to Bluetooth by default, leaving the inferior mini-UART on GPIO 14/15. For high-reliability MAVLink communication with Pixhawk 2.4.8 TELEM2, Bluetooth must be disabled or reassigned.

### 3.1 Edit `/boot/firmware/config.txt` (or `/boot/config.txt`)
Add the following directives to disable Bluetooth and allocate PL011 UART to GPIO pins:
```ini
# SKYCON UART Configuration for Pixhawk 2.4.8 TELEM2
enable_uart=1
dtoverlay=disable-bt
```

### 3.2 Disable Linux Serial Console
The Linux serial login console must be removed from the UART port so it does not send shell prompts to Pixhawk:
```bash
sudo systemctl stop serial-getty@ttyAMA0.service 2>/dev/null || true
sudo systemctl disable serial-getty@ttyAMA0.service 2>/dev/null || true
sudo systemctl stop serial-getty@serial0.service 2>/dev/null || true
sudo systemctl disable serial-getty@serial0.service 2>/dev/null || true
```
Edit `/boot/firmware/cmdline.txt` (or `/boot/cmdline.txt`) and remove any reference to `console=serial0,115200` or `console=ttyAMA0,115200`. Retain only `console=tty1`.

### 3.3 Set Dialout Permissions
```bash
sudo usermod -a -G dialout $USER
```

---

## 4. AUTOMATED INSTALLATION VIA SCRIPT

The repository provides a single-command automated installer:

```bash
cd /home/pi/Upgrade_skycon
chmod +x deployment/raspberry-pi/*.sh
./deployment/raspberry-pi/install.sh
./deployment/raspberry-pi/configure.sh
```

### What `install.sh` Performs:
1. Creates dedicated virtualenv at `/home/pi/Upgrade_skycon/venv`.
2. Installs all required Python dependencies (`pymavlink`, `fastapi`, `uvicorn`, `flask`, `psutil`, `opencv-python-headless`, `pyzbar`).
3. Creates persistent data storage directories at `data/`.

### What `configure.sh` Performs:
1. Validates serial device permissions.
2. Checks under-voltage and thermal throttle status via `vcgencmd`.
3. Copies `systemd/skycon.service` to `/etc/systemd/system/skycon.service`.
4. Enables and starts the `skycon` systemd service.

---

## 5. SYSTEMD SERVICE MANAGEMENT

The companion software runs as an automated system service under `systemd`:

```bash
# Check service status
sudo systemctl status skycon.service

# View live companion logs
sudo journalctl -u skycon.service -f

# Restart service
sudo systemctl restart skycon.service

# Stop service (bench maintenance)
sudo systemctl stop skycon.service
```

---

## 6. POST-INSTALLATION VERIFICATION

Execute the production validation script to ensure all 7 core subsystem tests pass:
```bash
./deployment/raspberry-pi/verify_installation.sh
```

Expected output:
```
=============================================================
  SKYCON RASPBERRY PI 4 DEPLOYMENT VERIFICATION
=============================================================
[1/7] Checking Python 3 Virtual Environment...      [PASS]
[2/7] Checking Core Python Packages...              [PASS]
[3/7] Checking Hardware UART & Serial Devices...    [PASS]
[4/7] Checking Systemd Service Configuration...     [PASS]
[5/7] Checking Under-Voltage & Thermal Throttling.. [PASS]
[6/7] Checking Local Data Directories & Storage...  [PASS]
[7/7] Testing Master Companion Server Health...     [PASS]
=============================================================
  VERIFICATION COMPLETE: ALL CHECKS PASSED
=============================================================
```
