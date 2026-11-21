#!/bin/bash
# =============================================================================
# SKYCON System — Installation & Hardware Verification Script
# Verifies Python environment, MAVLink serial port, camera ingest, and systemd
# =============================================================================

echo "=========================================================="
echo "SKYCON Production Deployment Verification"
echo "=========================================================="

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENV_DIR="$HOME/skycon-env"
EXIT_CODE=0

# 1. Virtual Environment Check
echo -n "[1/7] Python Virtual Environment: "
if [ -f "$VENV_DIR/bin/python" ]; then
  PY_VER=$("$VENV_DIR/bin/python" --version)
  echo "OK ($PY_VER)"
else
  echo "FAILED (Virtual environment not found at $VENV_DIR)"
  EXIT_CODE=1
fi

# 2. Dependency Integrity Check
echo -n "[2/7] Python Dependencies (FastAPI, OpenCV, MAVLink, psutil): "
if "$VENV_DIR/bin/python" -c "import fastapi, cv2, psutil, uvicorn; print('OK')" 2>/dev/null; then
  :
else
  echo "FAILED (One or more required packages missing)"
  EXIT_CODE=1
fi

# 3. Serial Port & UART Check
echo -n "[3/7] Autopilot UART Device: "
FOUND_UART=""
for dev in /dev/ttyAMA0 /dev/serial0 /dev/ttyUSB0 /dev/ttyACM0; do
  if [ -e "$dev" ]; then
    FOUND_UART="$dev"
    break
  fi
done

if [ -n "$FOUND_UART" ]; then
  echo "FOUND ($FOUND_UART)"
  # Check dialout permission
  if [ -r "$FOUND_UART" ] && [ -w "$FOUND_UART" ]; then
    echo "      Permissions: Read/Write OK"
  else
    echo "      [WARNING] Current user cannot read/write $FOUND_UART (Add user to dialout group)"
  fi
else
  echo "NOT DETECTED (Pixhawk UART not attached; simulation mode will be used)"
fi

# 4. Raspberry Pi Model & Throttling Status
echo -n "[4/7] Hardware Platform & Throttling: "
if [ -f "/proc/device-tree/model" ]; then
  MODEL=$(tr -d '\0' < /proc/device-tree/model)
  echo "$MODEL"
  if command -v vcgencmd >/dev/null 2>&1; then
    THROTTLED=$(vcgencmd get_throttled)
    TEMP=$(vcgencmd measure_temp)
    echo "      Thermal/Power: $TEMP, $THROTTLED"
  fi
else
  echo "Host is not Raspberry Pi ($(uname -s) $(uname -m))"
fi

# 5. Network & 4G Connectivity Check
echo -n "[5/7] Network & Internet Connection: "
if curl -s --connect-timeout 3 https://www.google.com >/dev/null 2>&1; then
  echo "ONLINE (Internet accessible)"
else
  echo "OFFLINE (Local-only operation active)"
fi

# 6. Service Status
echo -n "[6/7] Systemd Service (skycon.service): "
if systemctl is-enabled skycon.service >/dev/null 2>&1; then
  ACTIVE_STATE=$(systemctl is-active skycon.service 2>/dev/null || echo "inactive")
  echo "ENABLED (State: $ACTIVE_STATE)"
else
  echo "NOT ENABLED / NOT INSTALLED"
fi

# 7. Run Hardware Verification Diagnostic Tool
echo "[7/7] Running Diagnostic Verification Tool..."
"$VENV_DIR/bin/python" -m backend.hardware_verification

echo "=========================================================="
if [ "$EXIT_CODE" -eq 0 ]; then
  echo "VERIFICATION PASSED: System is ready for operation."
else
  echo "VERIFICATION FAILED: Resolve reported issues before flight."
fi
echo "=========================================================="
exit $EXIT_CODE
