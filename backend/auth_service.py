"""
SKYCON System — Authentication & Access Control Service
PBKDF2/SHA-256 Salted Password Hashing and Cryptographic Token Generation.
Roles: OPERATOR, PILOT, RUNNER, OBSERVER.
"""

import os
import time
import hmac
import hashlib
import secrets
from typing import Dict, Any, Optional

from backend.settings import settings


class AuthService:
    """Manages secure authentication, token generation, and role-based permissions."""

    # Default bootstrap accounts (passwords hashed on first load)
    DEFAULT_ACCOUNTS = {
        "admin": {"role": "OPERATOR", "salt": "sae_salt_2026", "hash": None, "raw_initial": "skycon2026"},
        "pilot": {"role": "PILOT", "salt": "pilot_salt_2026", "hash": None, "raw_initial": "pilot2026"},
        "runner": {"role": "RUNNER", "salt": "runner_salt_2026", "hash": None, "raw_initial": "runner2026"},
        "drone": {"role": "OPERATOR", "salt": "drone_salt_2026", "hash": None, "raw_initial": "dronecore2026"},
    }

    def __init__(self, token_expiry_s: int = 86400):
        self.token_expiry_s = token_expiry_s
        self.active_sessions: Dict[str, Dict[str, Any]] = {}
        self.user_database: Dict[str, Dict[str, Any]] = {}
        self._initialize_users()

    def _hash_password(self, password: str, salt: str) -> str:
        """Derives a secure 256-bit key using PBKDF2 with 100,000 SHA-256 iterations."""
        key = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            100000
        )
        return key.hex()

    def _initialize_users(self):
        """Initializes default hashed user credentials in memory."""
        for username, data in self.DEFAULT_ACCOUNTS.items():
            self.user_database[username] = {
                "username": username,
                "role": data["role"],
                "salt": data["salt"],
                "password_hash": self._hash_password(data["raw_initial"], data["salt"]),
                "created_at": time.time(),
            }

    def authenticate(self, username: str, password: str) -> Optional[Dict[str, Any]]:
        """Verifies credentials and returns user profile if valid."""
        user = self.user_database.get(username)
        if not user:
            return None

        computed_hash = self._hash_password(password, user["salt"])
        if hmac.compare_digest(computed_hash, user["password_hash"]):
            token = secrets.token_hex(32)
            session_data = {
                "token": token,
                "username": user["username"],
                "role": user["role"],
                "created_at": time.time(),
                "expires_at": time.time() + self.token_expiry_s,
            }
            self.active_sessions[token] = session_data
            return session_data

        return None

    def validate_token(self, token: Optional[str]) -> Optional[Dict[str, Any]]:
        """Validates an active session token and checks expiration."""
        if not token:
            return None

        # Clean "Bearer " prefix if provided
        clean_token = token.replace("Bearer ", "").strip()
        session = self.active_sessions.get(clean_token)
        if not session:
            return None

        if time.time() > session["expires_at"]:
            del self.active_sessions[clean_token]
            return None

        return session

    def logout(self, token: Optional[str]) -> bool:
        """Invalidates an active session token."""
        if not token:
            return False
        clean_token = token.replace("Bearer ", "").strip()
        if clean_token in self.active_sessions:
            del self.active_sessions[clean_token]
            return True
        return False

    def list_roles(self) -> Dict[str, Any]:
        """Returns standard permission tiers."""
        return {
            "OPERATOR": ["view", "telemetry", "missions", "geofence", "camera", "arm", "abort"],
            "PILOT": ["view", "telemetry", "mode_switch", "manual_override"],
            "RUNNER": ["view", "qr_ack", "telemetry"],
            "OBSERVER": ["view", "telemetry"],
        }


auth_service = AuthService()
