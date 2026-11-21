#!/bin/bash
# =============================================================================
# SKYCON System — Raspberry Pi 4 Installation Script
# Target: Raspberry Pi OS (64-bit Debian Bookworm / Bullseye)
# =============================================================================
set -e

echo "=========================================================="
echo "SKYCON S500 UAV Companion Computer Installer"
echo "Target Platform: Raspberry Pi 4 Model B"
echo "=========================================================="

# Check root or user
if [ "$EUID" -eq 0 ]; then
  echo "[WARNING] Please run as normal user (e.g., pi). Sudo will be requested where required."
fi

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENV_DIR="$HOME/skycon-env"

echo "[1/6] Updating system packages..."
sudo apt-get update
sudo apt-get install -y python3 python3-pip python3-venv git curl build-essential \
  libgl1-mesa-glx libglib2.0-0 v4l-utils libraspberrypi-bin

echo "[2/6] Creating Python virtual environment at $VENV_DIR..."
if [ ! -d "$VENV_DIR" ]; then
  python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"
pip install --upgrade pip setuptools wheel

echo "[3/6] Installing Python dependencies..."
pip install -r "$PROJECT_DIR/requirements.txt"

echo "[4/6] Creating required directories..."
mkdir -p "$PROJECT_DIR/backend/data"
mkdir -p "$PROJECT_DIR/backend/logs"
mkdir -p "$PROJECT_DIR/reports/diagnostics"

echo "[5/6] Setting up environment configuration..."
if [ ! -f "$PROJECT_DIR/.env" ]; then
  cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
  echo "Created $PROJECT_DIR/.env from template. Please configure port and API keys."
fi

echo "[6/6] Configuring user permissions..."
sudo usermod -a -G dialout,video,gpio "$USER"

echo "=========================================================="
echo "Installation complete!"
echo "Next step: Run ./configure.sh to configure UART and systemd service."
echo "=========================================================="
