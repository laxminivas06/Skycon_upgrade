#!/bin/bash
# =============================================================================
# SKYCON System — Raspberry Pi 4 Mobile Hotspot Configuration Utility
# Configures built-in Wi-Fi (wlan0) to connect to a 2.4 GHz mobile phone hotspot
# =============================================================================
set -e

echo "=========================================================="
echo "SKYCON Mobile Hotspot Configuration Utility"
echo "Raspberry Pi 4 Model B (Built-in Wi-Fi: wlan0)"
echo "=========================================================="

if [ "$EUID" -ne 0 ]; then
  echo "[-] ERROR: This script must be run as root or with sudo."
  echo "    Usage: sudo $0 [SSID] [PASSWORD]"
  exit 1
fi

WIFI_IFACE="wlan0"

# Verify wlan0 exists
if ! ip link show "$WIFI_IFACE" >/dev/null 2>&1; then
  echo "[-] ERROR: Wi-Fi interface '$WIFI_IFACE' not found!"
  echo "    Ensure Raspberry Pi built-in Wi-Fi is enabled in /boot/config.txt."
  exit 1
fi

# Ensure Wi-Fi interface is unblocked by rfkill
if command -v rfkill >/dev/null 2>&1; then
  rfkill unblock wifi || true
fi

# Bring interface up
ip link set "$WIFI_IFACE" up || true

# 1. Parse or prompt for SSID & Password
SSID="$1"
PASSWORD="$2"

if [ -z "$SSID" ]; then
  echo ""
  echo "--- Hotspot Setup Prompts ---"
  read -r -p "Enter Mobile Hotspot SSID: " SSID
fi

if [ -z "$SSID" ]; then
  echo "[-] ERROR: SSID cannot be empty."
  exit 1
fi

if [ -z "$PASSWORD" ]; then
  read -r -s -p "Enter Hotspot Password (leave blank if open network): " PASSWORD
  echo ""
fi

# 2. Configure Wi-Fi via NetworkManager (Standard on Raspberry Pi OS Bookworm)
if command -v nmcli >/dev/null 2>&1; then
  echo "[1/3] Configuring NetworkManager profile for '$SSID'..."

  # Delete any existing connection with this name to avoid conflicts
  nmcli connection delete "$SSID" >/dev/null 2>&1 || true

  # Add connection profile
  if [ -n "$PASSWORD" ]; then
    nmcli connection add \
      type wifi \
      con-name "$SSID" \
      ifname "$WIFI_IFACE" \
      ssid "$SSID" \
      wifi-sec.key-mgmt wpa-psk \
      wifi-sec.psk "$PASSWORD" >/dev/null
  else
    nmcli connection add \
      type wifi \
      con-name "$SSID" \
      ifname "$WIFI_IFACE" \
      ssid "$SSID" >/dev/null
  fi

  # Configure automatic reconnection with infinite retries
  echo "[2/3] Configuring auto-reconnection and power management..."
  nmcli connection modify "$SSID" connection.autoconnect yes
  nmcli connection modify "$SSID" connection.autoconnect-priority 100
  nmcli connection modify "$SSID" connection.autoconnect-retries 0
  nmcli connection modify "$SSID" 802-11-wireless.powersave 2 # 2 = disable power saving

  # Activate connection
  echo "[3/3] Activating connection to '$SSID'..."
  nmcli connection up "$SSID" || echo "[!] Notice: Initial activation returned non-zero. Auto-reconnect watchdog will retry."

# Fallback: wpa_supplicant (Raspberry Pi OS Bullseye / legacy)
elif [ -f /etc/wpa_supplicant/wpa_supplicant.conf ]; then
  echo "[1/2] Configuring wpa_supplicant for '$SSID'..."
  CONF="/etc/wpa_supplicant/wpa_supplicant.conf"

  # Backup existing config
  cp "$CONF" "${CONF}.bak.$(date +%s)"

  if [ -n "$PASSWORD" ]; then
    wpa_passphrase "$SSID" "$PASSWORD" >> "$CONF"
  else
    cat <<EOF >> "$CONF"
network={
    ssid="$SSID"
    key_mgmt=NONE
}
EOF
  fi

  chmod 600 "$CONF"
  wpa_cli -i "$WIFI_IFACE" reconfigure || true
else
  echo "[-] ERROR: Neither NetworkManager (nmcli) nor wpa_supplicant found."
  exit 1
fi

# 3. Disable Wi-Fi power saving directly on wlan0
if command -v iwconfig >/dev/null 2>&1; then
  iwconfig "$WIFI_IFACE" power off 2>/dev/null || true
fi

echo "=========================================================="
echo "[+] SUCCESS: Mobile hotspot '$SSID' configured."
echo "    - Auto-reconnect: ENABLED (Infinite retries)"
echo "    - Wi-Fi Power Save: DISABLED"
echo "    - Credential Storage: PROTECTED (chmod 600)"
echo "=========================================================="
