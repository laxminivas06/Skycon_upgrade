# Raspberry Pi 4 Production Deployment Guide
**SKYCON S500 UAV Companion System (ADDC 2026)**

---

## 1. Prerequisites
- **Hardware**: Raspberry Pi 4 Model B (4GB or 8GB recommended).
- **OS**: Raspberry Pi OS 64-bit (Debian Bookworm or Bullseye).
- **Power**: High-efficiency 5V 3.5A regulated UBEC connected directly to GPIO header (Pin 2/4 5V, Pin 6 GND). **Never power the Pi from Pixhawk servo rail.**
- **Network**: 4G USB SIM Dongle connected to USB 3.0 / 2.0 port.
- **Flight Controller**: Pixhawk 2.4.8 connected via TELEM2 (or TELEM1) to Pi GPIO 14 (TX) & GPIO 15 (RX) with common ground.

---

## 2. Quick Installation

```bash
# 1. Clone repository into home directory
cd ~
git clone https://github.com/RISHITBARLA/saeindia.git Upgrade_skycon
cd Upgrade_skycon/deployment/raspberry-pi

# 2. Make scripts executable
chmod +x install.sh configure.sh verify_installation.sh

# 3. Run installer (creates virtual environment, installs dependencies)
./install.sh

# 4. Configure UART & systemd service
./configure.sh

# 5. Verify deployment
./verify_installation.sh
```

---

## 3. Service Management

```bash
# Start companion service
sudo systemctl start skycon.service

# Check service status and real-time logs
sudo systemctl status skycon.service
journalctl -u skycon.service -f

# Stop or restart service
sudo systemctl stop skycon.service
sudo systemctl restart skycon.service
```

---

## 4. Operational Invariants
1. **Local-First Safety**: The companion computer operates completely locally. Loss of 4G internet or cloud connectivity never affects flight stabilization or failsafe execution.
2. **Bench Safety Interlock**: `SKYCON_ALLOW_ARMING=False` is strictly maintained. Arming requires explicit operator clearance.
3. **Emergency RTL Authority**: The MultiLink V1.0 RC transmitter provides primary manual pilot takeover authority at all times.
