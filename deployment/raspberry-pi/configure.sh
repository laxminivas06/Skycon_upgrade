#!/bin/bash
# =============================================================================
# SKYCON System — Raspberry Pi 4 System Configuration Script
# Configures UART (GPIO 14/15), disables serial console, and sets up systemd
# =============================================================================
set -e

echo "=========================================================="
echo "SKYCON System Configuration: UART, 4G Dongle & Systemd"
echo "=========================================================="

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# 1. Disable Linux Serial Console on ttyAMA0 / serial0
echo "[1/4] Disabling serial console over UART..."
sudo raspi-config nonint do_serial 2 || true
# do_serial 2: Enables serial hardware port, disables login console over serial

# 2. Verify config.txt has enable_uart=1
CONFIG_FILE="/boot/config.txt"
[ ! -f "$CONFIG_FILE" ] && CONFIG_FILE="/boot/firmware/config.txt"

if [ -f "$CONFIG_FILE" ]; then
  if ! grep -q "enable_uart=1" "$CONFIG_FILE"; then
    echo "enable_uart=1" | sudo tee -a "$CONFIG_FILE"
    echo "Added enable_uart=1 to $CONFIG_FILE"
  fi
  # Optional: ensure mini-uart doesn't interfere if using primary UART
  if ! grep -q "dtoverlay=disable-bt" "$CONFIG_FILE"; then
    echo "# Uncomment to map hardware UART (ttyAMA0) directly to GPIO 14/15" | sudo tee -a "$CONFIG_FILE"
    echo "# dtoverlay=disable-bt" | sudo tee -a "$CONFIG_FILE"
  fi
fi

# 3. Configure systemd service
echo "[2/4] Installing systemd service (skycon.service)..."
SERVICE_SRC="$PROJECT_DIR/systemd/skycon.service"
SERVICE_DST="/etc/systemd/system/skycon.service"

if [ -f "$SERVICE_SRC" ]; then
  # Replace username dynamically if not pi
  sed "s|User=pi|User=$USER|g; s|Group=pi|Group=$USER|g; s|/home/pi|$HOME|g" "$SERVICE_SRC" | sudo tee "$SERVICE_DST" > /dev/null
  sudo systemctl daemon-reload
  sudo systemctl enable skycon.service
  echo "Service skycon.service enabled for auto-start on boot."
fi

# 4. Check Mobile Hotspot Wi-Fi & 4G USB Modem interface
echo "[3/4] Configuring Wi-Fi (wlan0) & checking mobile data interfaces..."

# Disable Wi-Fi power management to avoid sleep latency and dropouts
if command -v iwconfig >/dev/null 2>&1; then
  sudo iwconfig wlan0 power off 2>/dev/null && echo "Disabled Wi-Fi power-save on wlan0 (Low Latency Mode)" || true
fi

if ip link show wlan0 >/dev/null 2>&1; then
  echo "Found built-in Wi-Fi: wlan0 (Ready for Mobile Phone Hotspot)"
  echo "To connect to mobile hotspot run: sudo ./setup_mobile_hotspot.sh [SSID] [PASSWORD]"
fi

if ip link show wwan0 >/dev/null 2>&1; then
  echo "Found cellular interface: wwan0 (Ready for optional 4G USB dongle)"
elif ip link show eth1 >/dev/null 2>&1; then
  echo "Found USB tethered interface: eth1 (Ready for optional 4G USB tethering)"
fi

# 5. Bench safety lock verification
echo "[4/4] Verifying bench safety interlocks..."
if [ -f "$PROJECT_DIR/.env" ]; then
  if grep -q "SKYCON_ALLOW_ARMING=True" "$PROJECT_DIR/.env"; then
    echo "[WARNING] SKYCON_ALLOW_ARMING is set to True! Resetting to False for bench safety."
    sed -i "s|SKYCON_ALLOW_ARMING=True|SKYCON_ALLOW_ARMING=False|g" "$PROJECT_DIR/.env"
  fi
fi

echo "=========================================================="
echo "Configuration complete!"
echo "Run ./verify_installation.sh to test services and hardware links."
echo "To start service now: sudo systemctl start skycon.service"
echo "=========================================================="
