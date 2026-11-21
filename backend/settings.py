"""
SKYCON System — Centralized Configuration & Environment Profiles
Manages configurations for development, production, Raspberry Pi companion, and PythonAnywhere.
"""

import os
import sys
from dataclasses import dataclass
from typing import Optional

try:
    from dotenv import load_dotenv
    CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
    PROJECT_ROOT = os.path.dirname(CURRENT_DIR)
    load_dotenv(os.path.join(PROJECT_ROOT, ".env"))
    load_dotenv()
except Exception:
    pass


@dataclass
class Settings:
    # Environment & Profile
    ENVIRONMENT: str = os.environ.get("SKYCON_ENV", "development").lower()
    DEBUG: bool = os.environ.get("SKYCON_DEBUG", "False").lower() in ("true", "1")
    IS_RASPBERRY_PI: bool = os.environ.get("SKYCON_IS_PI", "False").lower() in ("true", "1")
    IS_PYTHONANYWHERE: bool = "pythonanywhere" in os.environ.get("PYTHONANYWHERE_DOMAIN", "").lower()

    # Server & Networking
    HOST: str = os.environ.get("SKYCON_HOST", "0.0.0.0")
    PORT: int = int(os.environ.get("PORT", os.environ.get("SKYCON_PORT", 8443)))
    SECRET_KEY: str = os.environ.get("SKYCON_SECRET_KEY", "saeindia_skycon_secret_2026")
    TOKEN_EXPIRY_S: int = int(os.environ.get("SKYCON_TOKEN_EXPIRY_S", 86400))  # 24 hours

    # Safety Interlocks
    # Mandatory bench safety: Never allow motor arming unless explicitly enabled in environment
    ALLOW_PHYSICAL_ARMING: bool = os.environ.get("SKYCON_ALLOW_ARMING", "False").lower() in ("true", "1")
    REQUIRE_AUTH: bool = os.environ.get("SKYCON_REQUIRE_AUTH", "False").lower() in ("true", "1")

    # MAVLink Serial Port & Baud
    MAVLINK_PORT: Optional[str] = os.environ.get("MAVLINK_PORT", None)
    MAVLINK_BAUD: int = int(os.environ.get("MAVLINK_BAUD", 921600))  # TELEM1 default high-speed
    FALLBACK_BAUD: int = 57600  # Standard bench baud

    # Camera & Video Ingestion
    CAMERA_SOURCE: str = os.environ.get("CAMERA_SOURCE", "synthetic")  # "synthetic", "/dev/video0", or "push"
    CAMERA_WIDTH: int = int(os.environ.get("CAMERA_WIDTH", 1280))
    CAMERA_HEIGHT: int = int(os.environ.get("CAMERA_HEIGHT", 720))
    CAMERA_FPS: int = int(os.environ.get("CAMERA_FPS", 30))
    CAMERA_ROTATION: int = int(os.environ.get("CAMERA_ROTATION", 0))  # 0, 90, 180, 270 degrees

    # Data & Storage Directories
    BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    DATA_DIR: str = os.environ.get("SKYCON_DATA_DIR", os.path.join(BASE_DIR, "data"))
    LOG_DIR: str = os.environ.get("SKYCON_LOG_DIR", os.path.join(BASE_DIR, "logs"))
    MAX_AUDIT_LOG_RECORDS: int = 5000  # Bounded storage retention limit
    MAX_TELEMETRY_HISTORY_RECORDS: int = 2000

    # Competition Parameters (ADDC 2026)
    COMPETITION_TIME_LIMIT_S: int = 300   # 5-minute competition limit
    MAX_FENCE_ALTITUDE_M: float = 25.0     # Maximum ceiling AGL
    DEFAULT_FENCE_RADIUS_M: float = 50.0   # Arena radius
    DEFAULT_RTL_ALTITUDE_M: float = 5.0    # 5m RTL altitude (prevents climb to 15m)
    QR_REGEX_PATTERN: str = r"^\d{2}$"    # Strictly 2 numeric digits


settings = Settings()
