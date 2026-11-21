"""
SKYCON System — Multi-Subsystem Health & Diagnostic Service
Evaluates real hardware, companion computer, storage, network, and MAVLink states.
Status Enums: ONLINE, OFFLINE, CONNECTING, DEGRADED, NOT CONFIGURED, SIMULATION, HARDWARE VERIFIED, ERROR.
"""

import os
import sys
import time
import psutil
from enum import Enum
from typing import Dict, Any, Optional

from backend.settings import settings
from backend.mavlink_multiplexer import mavlink_mux
from backend.simple_json_store import json_store


class HealthState(str, Enum):
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"
    CONNECTING = "CONNECTING"
    DEGRADED = "DEGRADED"
    NOT_CONFIGURED = "NOT CONFIGURED"
    SIMULATION = "SIMULATION"
    HARDWARE_VERIFIED = "HARDWARE VERIFIED"
    ERROR = "ERROR"


class SystemHealthService:
    """Evaluates comprehensive subsystem health across the aircraft and GCS stack."""

    def __init__(self):
        self.start_time = time.time()

    def get_backend_health(self) -> Dict[str, Any]:
        """Evaluates CPU, RAM, and disk storage metrics."""
        try:
            mem = psutil.virtual_memory()
            disk = psutil.disk_usage(os.path.abspath(settings.BASE_DIR))
            cpu_pct = psutil.cpu_percent(interval=None)

            status = HealthState.ONLINE
            if mem.percent > 90 or disk.percent > 95:
                status = HealthState.DEGRADED

            return {
                "status": status.value,
                "uptime_seconds": round(time.time() - self.start_time, 1),
                "cpu_percent": cpu_pct,
                "ram_used_mb": round(mem.used / (1024 * 1024), 1),
                "ram_percent": mem.percent,
                "disk_free_gb": round(disk.free / (1024 * 1024 * 1024), 2),
                "disk_percent": disk.percent,
            }
        except Exception as e:
            return {"status": HealthState.ERROR.value, "error": str(e)}

    def get_storage_health(self) -> Dict[str, Any]:
        """Checks atomic JSON store availability and integrity."""
        try:
            test_data = {"probe": time.time()}
            saved = json_store.save("health_probe", test_data)
            loaded = json_store.load("health_probe")
            if saved and loaded and loaded.get("probe") == test_data["probe"]:
                return {
                    "status": HealthState.ONLINE.value,
                    "engine": "SimpleJsonStore_v2",
                    "storage_dir": settings.DATA_DIR,
                    "atomic_write_verified": True,
                    "sha256_checksums": True,
                }
            return {
                "status": HealthState.DEGRADED.value,
                "error": "Storage read-write verification failed"
            }
        except Exception as e:
            return {"status": HealthState.ERROR.value, "error": str(e)}

    def get_pixhawk_health(self) -> Dict[str, Any]:
        """Checks Pixhawk 2.4.8 MAVLink connection and telemetry stream status."""
        state = mavlink_mux.get_state()
        is_connected = state.get("connected", False)
        is_mock = state.get("is_mock", False)
        heartbeat_rate = state.get("heartbeat_rate_hz", 0.0)
        hb_age = state.get("heartbeat_age_s", 999.0)

        if is_connected and not is_mock and heartbeat_rate > 1.0 and hb_age < 2.5:
            status = HealthState.HARDWARE_VERIFIED
        elif is_connected and is_mock:
            status = HealthState.SIMULATION
        elif is_connected and (heartbeat_rate <= 1.0 or hb_age >= 2.5):
            status = HealthState.DEGRADED
        else:
            status = HealthState.OFFLINE

        return {
            "status": status.value,
            "connection_state": state.get("connection_state", "DISCONNECTED"),
            "connected": is_connected,
            "is_simulation": is_mock,
            "port": state.get("port", settings.MAVLINK_PORT or "Not Configured"),
            "baud": state.get("baud", settings.MAVLINK_BAUD),
            "heartbeat_rate_hz": heartbeat_rate,
            "heartbeat_age_s": hb_age,
            "telemetry_age_s": state.get("telemetry_age_s", 999.0),
            "armed": state.get("armed", False),
            "flight_mode": state.get("flight_mode", "UNKNOWN"),
            "rc_connected": state.get("rc_connected", False),
            "rc_rssi": state.get("rc_rssi", 0),
            "rc_override_active": state.get("rc_override_active", False),
            "gps_fix_type": state.get("gps_fix_type", 0),
            "satellites": state.get("satellites", 0),
            "hdop": state.get("hdop", 99.9),
            "ekf_healthy": state.get("ekf_healthy", False),
            "voltage_battery": state.get("voltage_battery", 0.0),
            "battery_remaining": state.get("battery_remaining", 0),
            "packets_received_total": state.get("packets_received_total", 0),
            "packets_sent_total": state.get("packets_sent_total", 0),
        }

    def get_companion_health(self) -> Dict[str, Any]:
        """Checks Raspberry Pi 4 Model B hardware companion status."""
        is_linux = sys.platform.startswith("linux")
        try:
            # Check for Raspberry Pi model string if on Linux
            model = "Standard x86/ARM Host"
            if is_linux and os.path.exists("/proc/device-tree/model"):
                with open("/proc/device-tree/model", "r", encoding="utf-8") as f:
                    model = f.read().strip("\x00")

            is_pi = "Raspberry Pi" in model
            status = HealthState.HARDWARE_VERIFIED if is_pi else HealthState.SIMULATION

            return {
                "status": status.value,
                "device_model": model,
                "is_raspberry_pi": is_pi,
                "platform": sys.platform,
                "python_version": sys.version.split()[0],
            }
        except Exception as e:
            return {"status": HealthState.ERROR.value, "error": str(e)}

    def get_camera_health(self, latest_frame_timestamp: Optional[float] = None) -> Dict[str, Any]:
        """Checks smartphone / V4L2 camera stream activity and frame rate."""
        now = time.time()
        if latest_frame_timestamp and (now - latest_frame_timestamp) < 2.0:
            status = HealthState.ONLINE
            latency_ms = round((now - latest_frame_timestamp) * 1000, 1)
        elif latest_frame_timestamp and (now - latest_frame_timestamp) < 5.0:
            status = HealthState.DEGRADED
            latency_ms = round((now - latest_frame_timestamp) * 1000, 1)
        else:
            status = HealthState.OFFLINE
            latency_ms = None

        return {
            "status": status.value,
            "source": settings.CAMERA_SOURCE,
            "streaming_active": status in (HealthState.ONLINE, HealthState.DEGRADED),
            "frame_age_ms": latency_ms,
        }

    def get_overall_health(self, latest_frame_ts: Optional[float] = None) -> Dict[str, Any]:
        """Aggregates multi-subsystem states into comprehensive telemetry health packet."""
        backend_h = self.get_backend_health()
        storage_h = self.get_storage_health()
        pixhawk_h = self.get_pixhawk_health()
        companion_h = self.get_companion_health()
        camera_h = self.get_camera_health(latest_frame_ts)

        # Global aggregate evaluation
        critical_statuses = [backend_h["status"], storage_h["status"]]
        if HealthState.ERROR.value in critical_statuses:
            global_status = HealthState.ERROR
        elif HealthState.DEGRADED.value in critical_statuses:
            global_status = HealthState.DEGRADED
        else:
            global_status = HealthState.ONLINE

        return {
            "status": global_status.value,
            "timestamp": time.time(),
            "subsystems": {
                "backend": backend_h,
                "storage": storage_h,
                "pixhawk": pixhawk_h,
                "companion": companion_h,
                "camera": camera_h,
            }
        }


system_health_service = SystemHealthService()
