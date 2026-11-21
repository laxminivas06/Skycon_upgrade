# SKYCON System — Raspberry Pi 4 Model B Setup Guide

## 1. Operating System Installation
Install **Raspberry Pi OS Lite (64-bit)** based on Debian Bookworm or Bullseye.

---

## 2. UART Serial Port Configuration

By default, the Raspberry Pi 4 assigns its primary hardware UART (`/dev/ttyAMA0`) to Bluetooth. To assign it to the GPIO 14/15 pins for Pixhawk MAVLink communication:

### A. Edit `/boot/firmware/config.txt` (or `/boot/config.txt`)
Add the following lines at the bottom of the file:
```ini
# Enable hardware UART on GPIO 14 (TX) and GPIO 15 (RX)
enable_uart=1
dtoverlay=disable-bt
```

### B. Disable the Linux Serial Console
Disable the serial login shell to prevent Linux from outputting console text over the MAVLink line:
```bash
sudo systemctl stop serial-getty@ttyAMA0.service
sudo systemctl disable serial-getty@ttyAMA0.service
```

In `/boot/firmware/cmdline.txt`, remove any reference to `console=serial0,115200` or `console=ttyAMA0,115200`.

Reboot the Raspberry Pi:
```bash
sudo reboot
```

---

## 3. Python Environment Setup

```bash
# Update system packages
sudo apt update && sudo apt install -y python3-pip python3-venv git libgl1-mesa-glx libglib2.0-0

# Clone repository
cd /home/pi
git clone https://github.com/RISHITBARLA/saeindia.git skycon
cd skycon

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt
```

---

## 4. Systemd Background Service (`skycon.service`)

Create a systemd unit to automatically start the companion server on boot:

```bash
sudo nano /etc/systemd/system/skycon.service
```

Add the following content:
```ini
[Unit]
Description=SKYCON Autonomous Drone Companion Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/skycon
Environment="PATH=/home/pi/skycon/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin"
Environment="MAVLINK_PORT=/dev/ttyAMA0"
Environment="MAVLINK_BAUD=921600"
Environment="PORT=8443"
ExecStart=/home/pi/skycon/venv/bin/python -m backend.server
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable skycon.service
sudo systemctl start skycon.service

# Check live logs
journalctl -u skycon.service -f
```
