"""
=====================================================================================
SKYCON MASTER ARCHITECTURE - RASPBERRY PI MOBILE HOTSPOT & NETWORK MANAGEMENT
MODULE: network_manager.py
Robust Mobile Hotspot Association, Internet Reconnection Watchdog & Status Monitoring
=====================================================================================
Features:
  - Raspberry Pi 4 Built-In Wi-Fi (wlan0) State & Metrics Extraction (SSID, RSSI, IP)
  - Seamless 2.4 GHz Mobile Phone Hotspot Connectivity (WPA2/WPA3 Support)
  - Automatic Connection Loss Detection & Exponential Backoff Reconnection Watchdog
  - Isolated Local-First Operation: Network failure NEVER impacts MAVLink or Autonomy
  - Cloud Backend (PythonAnywhere) Reachability Tracking & Heartbeat Coordination
  - Secure Hotspot Credential Provisioning with Zero Password Exposure
  - Standardized Diagnostic Telemetry for GCS Diagnostics Panel (ONLINE/OFFLINE/RECONNECTING)
=====================================================================================
"""

import os
import re
import sys
import time
import json
import socket
import logging
import platform
import threading
import subprocess
from enum import Enum
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone

from backend.settings import settings
from backend.simple_json_store import json_store

logger = logging.getLogger("NetworkManager")


class NetworkState(str, Enum):
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"
    RECONNECTING = "RECONNECTING"
    STALE = "STALE"
    UNKNOWN = "UNKNOWN"


class NetworkManager:
    """
    Manages Raspberry Pi built-in Wi-Fi connectivity to mobile hotspots,
    internet health verification, and autonomous reconnection.
    """

    def __init__(
        self,
        wifi_interface: str = "wlan0",
        probe_interval_s: float = 3.0,
        dns_probe_host: str = "8.8.8.8",
        dns_probe_port: int = 53,
        max_backoff_s: float = 30.0,
        initial_backoff_s: float = 3.0
    ):
        self.wifi_interface = wifi_interface
        self.probe_interval_s = probe_interval_s
        self.dns_probe_host = dns_probe_host
        self.dns_probe_port = dns_probe_port
        self.max_backoff_s = max_backoff_s
        self.initial_backoff_s = initial_backoff_s

        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.RLock()

        # Operational Link State
        self.state: NetworkState = NetworkState.UNKNOWN
        self.wifi_connected: bool = False
        self.current_ssid: Optional[str] = None
        self.rssi_dbm: int = -99
        self.signal_strength_pct: int = 0
        self.ip_address: Optional[str] = None
        self.gateway_ip: Optional[str] = None
        self.internet_accessible: bool = False
        self.cloud_accessible: bool = False

        # Timing and Telemetry
        self.last_probe_time: float = 0.0
        self.last_successful_online_time: float = 0.0
        self.last_disconnection_time: float = 0.0
        self.last_reconnect_attempt_time: float = 0.0
        self.reconnect_attempts_count: int = 0
        self.consecutive_probe_failures: int = 0
        self.current_backoff_delay_s: float = initial_backoff_s

        # Hardware Environment
        self.is_linux = (platform.system() == "Linux")
        self.is_simulation = not self.is_linux

        # Stored secure profile metadata (never containing passwords)
        self.config_dir = os.path.join(settings.BASE_DIR, "config")
        os.makedirs(self.config_dir, exist_ok=True)
        self.network_config_path = os.path.join(self.config_dir, "hotspot_profile.json")

    # -------------------------------------------------------------------------
    # Lifecycle Management
    # -------------------------------------------------------------------------

    def start(self):
        """Starts the background network monitoring and auto-reconnect watchdog."""
        with self._lock:
            if self._running:
                return
            self._running = True
            self._thread = threading.Thread(
                target=self._watchdog_loop,
                daemon=True,
                name="SkyconNetworkWatchdog"
            )
            self._thread.start()
            logger.info("NetworkManager auto-reconnect watchdog thread started.")

    def stop(self):
        """Stops the network monitoring thread."""
        with self._lock:
            self._running = False
            if self._thread and self._thread.is_alive():
                self._thread.join(timeout=1.0)
            logger.info("NetworkManager watchdog stopped.")

    # -------------------------------------------------------------------------
    # Network Diagnostics & Status Reporting
    # -------------------------------------------------------------------------

    def get_status(self) -> Dict[str, Any]:
        """
        Returns authoritative network health metrics conforming to SKYCON GCS format.
        Guarantees that credentials (passwords) are NEVER included.
        """
        with self._lock:
            now = time.time()
            disconn_age_s = (now - self.last_disconnection_time) if self.last_disconnection_time > 0 else 0.0
            online_age_s = (now - self.last_successful_online_time) if self.last_successful_online_time > 0 else 0.0

            return {
                "state": self.state.value,
                "wifi_connected": self.wifi_connected,
                "ssid": self.current_ssid if self.wifi_connected else None,
                "interface": self.wifi_interface,
                "rssi_dbm": self.rssi_dbm if self.wifi_connected else -99,
                "signal_strength_pct": self.signal_strength_pct if self.wifi_connected else 0,
                "ip_address": self.ip_address if self.wifi_connected else None,
                "gateway": self.gateway_ip if self.wifi_connected else None,
                "internet_accessible": self.internet_accessible,
                "cloud_accessible": self.cloud_accessible,
                "is_simulation": self.is_simulation,
                "reconnection": {
                    "in_progress": (self.state == NetworkState.RECONNECTING),
                    "attempts": self.reconnect_attempts_count,
                    "last_attempt_time": self.last_reconnect_attempt_time,
                    "backoff_delay_s": round(self.current_backoff_delay_s, 1),
                    "last_disconnection_time": self.last_disconnection_time,
                    "disconnection_age_s": round(disconn_age_s, 1) if self.last_disconnection_time > 0 else None
                },
                "last_online_time": self.last_successful_online_time,
                "online_age_s": round(online_age_s, 1) if self.last_successful_online_time > 0 else None,
                "timestampUtc": datetime.now(timezone.utc).isoformat()
            }

    # -------------------------------------------------------------------------
    # Core Watchdog Loop
    # -------------------------------------------------------------------------

    def _watchdog_loop(self):
        """Continuous background loop verifying connectivity and triggering auto-reconnect."""
        # Initial probe
        self.probe_network()

        while self._running:
            try:
                # Sleep based on connection state: faster probe when online, backoff delay when disconnected
                sleep_time = self.probe_interval_s if (self.state == NetworkState.ONLINE) else self.current_backoff_delay_s
                time.sleep(sleep_time)

                if not self._running:
                    break

                self.probe_network()

            except Exception as e:
                logger.error(f"Unexpected error in network watchdog loop: {e}", exc_info=True)
                time.sleep(self.initial_backoff_s)

    def probe_network(self) -> NetworkState:
        """
        Executes a non-blocking diagnostic probe:
        1. Inspects local Wi-Fi interface (wlan0).
        2. Probes internet DNS socket.
        3. Coordinates with CloudSyncService for cloud backend status.
        4. Triggers OS auto-reconnect if link is severed.
        """
        # 1. Check local Wi-Fi association
        wifi_ok, ssid, rssi, ip_addr = self._check_wifi_interface()

        # 2. Check Internet reachability
        internet_ok = False
        if wifi_ok:
            internet_ok = self._check_internet_socket()

        # 3. Check Cloud backend reachability
        cloud_ok = False
        if internet_ok:
            cloud_ok = self._check_cloud_reachability()

        with self._lock:
            self.last_probe_time = time.time()
            self.wifi_connected = wifi_ok
            self.current_ssid = ssid
            self.rssi_dbm = rssi
            self.signal_strength_pct = self._dbm_to_pct(rssi) if wifi_ok else 0
            self.ip_address = ip_addr
            self.internet_accessible = internet_ok
            self.cloud_accessible = cloud_ok

            # State Transition Evaluation
            if wifi_ok and internet_ok and cloud_ok:
                # Fully Online
                if self.state != NetworkState.ONLINE:
                    logger.info(f"Network is ONLINE via mobile hotspot '{ssid}' (RSSI: {rssi} dBm, IP: {ip_addr}).")
                self.state = NetworkState.ONLINE
                self.consecutive_probe_failures = 0
                self.current_backoff_delay_s = self.initial_backoff_s
                self.last_successful_online_time = time.time()
            elif wifi_ok and internet_ok and not cloud_ok:
                # Internet up, but cloud server stale/unreachable
                self.state = NetworkState.STALE
                self.consecutive_probe_failures = 0
            else:
                # Connection dropped (hotspot off or out of range)
                if self.state == NetworkState.ONLINE:
                    self.last_disconnection_time = time.time()
                    logger.warning("Mobile hotspot disconnected or internet lost. Activating autonomous reconnection watchdog.")

                self.state = NetworkState.RECONNECTING
                self.consecutive_probe_failures += 1

                # Apply exponential backoff
                self.current_backoff_delay_s = min(
                    self.max_backoff_s,
                    self.initial_backoff_s * (1.5 ** min(self.consecutive_probe_failures, 6))
                )

                # Trigger OS-level reconnection
                self._trigger_os_reconnect()

            return self.state

    # -------------------------------------------------------------------------
    # Physical / OS Probing Helpers
    # -------------------------------------------------------------------------

    def _check_wifi_interface(self) -> Tuple[bool, Optional[str], int, Optional[str]]:
        """
        Inspects physical Wi-Fi interface wlan0 on Linux or returns simulated status on dev hosts.
        Returns: (connected: bool, ssid: Optional[str], rssi_dbm: int, ip_address: Optional[str])
        """
        if self.is_simulation:
            # On dev machines, check if host has an active network connection for simulation
            host_ip = self._get_local_ip()
            if host_ip and host_ip != "127.0.0.1":
                return True, "SKYCON_MOBILE_HOTSPOT (SIMULATION)", -62, host_ip
            return False, None, -99, None

        # Linux (Raspberry Pi 4) Implementation: Check NetworkManager or iwconfig
        try:
            # Method A: Try nmcli (standard on Raspberry Pi OS Bookworm)
            res = subprocess.run(
                ["nmcli", "-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "device"],
                capture_output=True,
                text=True,
                timeout=1.5
            )
            if res.returncode == 0:
                for line in res.stdout.strip().splitlines():
                    parts = line.split(":")
                    if len(parts) >= 4 and parts[0] == self.wifi_interface and parts[2] == "connected":
                        ssid = parts[3]
                        rssi = self._get_linux_rssi()
                        ip_addr = self._get_interface_ip(self.wifi_interface)
                        return True, ssid, rssi, ip_addr

            # Method B: Fallback to iwconfig / /proc/net/wireless (Bullseye / wpa_supplicant)
            res_iw = subprocess.run(
                ["iwconfig", self.wifi_interface],
                capture_output=True,
                text=True,
                timeout=1.5
            )
            if res_iw.returncode == 0:
                out = res_iw.stdout
                match_ssid = re.search(r'ESSID:"([^"]+)"', out)
                match_sig = re.search(r'Signal level=(-\d+|\d+/\d+)', out)
                if match_ssid and match_ssid.group(1) != "off/any":
                    ssid = match_ssid.group(1)
                    rssi = -65
                    if match_sig:
                        sig_str = match_sig.group(1)
                        if "/" in sig_str:
                            num, den = sig_str.split("/")
                            rssi = int(int(num) / int(den) * 70 - 100)
                        else:
                            rssi = int(sig_str)
                    ip_addr = self._get_interface_ip(self.wifi_interface)
                    return True, ssid, rssi, ip_addr

        except Exception as e:
            logger.debug(f"Wi-Fi interface check error: {e}")

        return False, None, -99, None

    def _get_linux_rssi(self) -> int:
        """Extracts RSSI in dBm from nmcli or /proc/net/wireless on Linux."""
        try:
            res = subprocess.run(
                ["nmcli", "-t", "-f", "IN-USE,SSID,SIGNAL", "dev", "wifi"],
                capture_output=True,
                text=True,
                timeout=1.5
            )
            if res.returncode == 0:
                for line in res.stdout.strip().splitlines():
                    if line.startswith("*"):
                        parts = line.split(":")
                        if len(parts) >= 3 and parts[2].isdigit():
                            pct = int(parts[2])
                            # Convert 0-100% to approximate dBm (-100 to -30 dBm)
                            return int((pct / 2.0) - 100)
        except Exception:
            pass
        return -65

    def _get_interface_ip(self, iface_name: str) -> Optional[str]:
        """Gets IP address of specific network interface."""
        try:
            import psutil
            addrs = psutil.net_if_addrs().get(iface_name, [])
            for addr in addrs:
                if addr.family == socket.AF_INET:
                    return addr.address
        except Exception:
            pass
        return None

    def _get_local_ip(self) -> Optional[str]:
        """Fallback to resolve local IP via UDP socket probe."""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "127.0.0.1"

    def _dbm_to_pct(self, dbm: int) -> int:
        """Converts RSSI dBm (-100 to -30) to percentage (0 to 100%)."""
        if dbm <= -100:
            return 0
        if dbm >= -30:
            return 100
        return int((dbm + 100) * 100 / 70)

    def _check_internet_socket(self) -> bool:
        """Performs non-blocking socket connect to DNS server to verify true internet routing."""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(1.2)
            s.connect((self.dns_probe_host, self.dns_probe_port))
            s.close()
            return True
        except Exception:
            return False

    def _check_cloud_reachability(self) -> bool:
        """Coordinates with CloudSyncService to verify PythonAnywhere reachability."""
        from backend.cloud_sync import cloud_sync_service
        status = cloud_sync_service.get_status()
        if not status.get("configured"):
            # Cloud URL not configured -> consider cloud check passed/optional in local mode
            return True
        return status.get("is_online", False) or (status.get("last_sync_age_s", 999.0) < 15.0)

    # -------------------------------------------------------------------------
    # Autonomous Reconnection Watchdog
    # -------------------------------------------------------------------------

    def _trigger_os_reconnect(self):
        """
        Dispatches non-blocking operating-system reconnection command without restarting Pi services.
        Uses NetworkManager (nmcli) with fallback to wpa_cli.
        """
        now = time.time()
        # Rate-limit reconnection triggers to prevent process flooding
        if (now - self.last_reconnect_attempt_time) < self.current_backoff_delay_s:
            return

        self.last_reconnect_attempt_time = now
        self.reconnect_attempts_count += 1
        logger.info(
            f"Auto-reconnect attempt #{self.reconnect_attempts_count} for interface '{self.wifi_interface}' "
            f"(backoff delay: {self.current_backoff_delay_s:.1f}s)..."
        )

        if self.is_simulation:
            logger.debug("[SIMULATION ONLY] Simulating operating-system Wi-Fi reconnection probe.")
            return

        try:
            # 1. Attempt NetworkManager auto-connect
            subprocess.Popen(
                ["nmcli", "device", "connect", self.wifi_interface],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
        except Exception:
            try:
                # 2. Fallback to wpa_cli reassociate
                subprocess.Popen(
                    ["wpa_cli", "-i", self.wifi_interface, "reassociate"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
            except Exception as e:
                logger.debug(f"Failed to trigger OS reconnection: {e}")

    # -------------------------------------------------------------------------
    # Secure Hotspot Provisioning
    # -------------------------------------------------------------------------

    def configure_mobile_hotspot(
        self,
        ssid: str,
        password: str,
        is_hidden: bool = False
    ) -> Dict[str, Any]:
        """
        Provisions mobile hotspot credentials securely onto the Raspberry Pi.
        Enforces strict input validation, POSIX file permissions (chmod 600),
        and guarantees the password is NEVER returned or stored in plain logs.
        """
        if not ssid or len(ssid.strip()) == 0:
            return {"success": False, "error": "SSID cannot be empty."}

        ssid = ssid.strip()
        # Disallow newline/control characters to prevent command/config injection
        if any(c in ssid for c in "\n\r;`$|&"):
            return {"success": False, "error": "Invalid characters in SSID."}
        if password and any(c in password for c in "\n\r;`$|&"):
            return {"success": False, "error": "Invalid characters in password."}

        logger.info(f"Provisioning mobile hotspot network credentials for SSID: '{ssid}' (password: [PROTECTED]).")

        # 1. Save metadata record (without password)
        meta = {
            "ssid": ssid,
            "configured_at": datetime.now(timezone.utc).isoformat(),
            "is_hidden": is_hidden,
            "security": "WPA2/WPA3" if password else "OPEN"
        }
        try:
            with open(self.network_config_path, "w") as f:
                json.dump(meta, f, indent=2)
            os.chmod(self.network_config_path, 0o600)
        except Exception as e:
            logger.warning(f"Could not write network metadata: {e}")

        # 2. Execute OS NetworkManager provisioning if on Linux
        if self.is_linux:
            try:
                # Delete any old profile with same SSID to prevent conflicts
                subprocess.run(
                    ["nmcli", "connection", "delete", ssid],
                    capture_output=True,
                    timeout=3.0
                )
                # Create/Add Wi-Fi connection
                cmd = [
                    "nmcli", "connection", "add",
                    "type", "wifi",
                    "con-name", ssid,
                    "ifname", self.wifi_interface,
                    "ssid", ssid
                ]
                if password:
                    cmd.extend(["wifi-sec.key-mgmt", "wpa-psk", "wifi-sec.psk", password])

                res = subprocess.run(cmd, capture_output=True, text=True, timeout=5.0)
                if res.returncode == 0:
                    # Configure infinite auto-connect retry
                    subprocess.run(
                        ["nmcli", "connection", "modify", ssid, "connection.autoconnect", "yes", "connection.autoconnect-retries", "0"],
                        capture_output=True,
                        timeout=3.0
                    )
                    # Attempt immediate association
                    subprocess.Popen(["nmcli", "connection", "up", ssid], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    return {"success": True, "message": f"Hotspot '{ssid}' configured and activated successfully."}
                else:
                    return {"success": False, "error": f"nmcli failed: {res.stderr.strip()}"}
            except Exception as e:
                return {"success": False, "error": f"OS configuration error: {str(e)}"}

        return {
            "success": True,
            "message": f"Hotspot profile '{ssid}' saved (SIMULATION MODE).",
            "metadata": meta
        }


# Global singleton instance
network_manager = NetworkManager()
