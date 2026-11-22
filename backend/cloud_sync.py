"""
=====================================================================================
SKYCON MASTER ARCHITECTURE - 4G CELLULAR & CLOUD SYNCHRONIZATION
MODULE: cloud_sync.py
Resilient Offline-Tolerant State Synchronization for PythonAnywhere Cloud GCS
=====================================================================================
Features:
  - Push-Based REST Synchronization from Companion Pi 4 to PythonAnywhere Cloud GCS
  - Resilient Offline Spooling: Queues telemetry & events locally when 4G drops
  - Exponential Backoff & Retry Logic (1.0s -> 30.0s max delay)
  - Duplicate Event Suppression via SHA-256 Event Checksums
  - Strict Air-Gap Isolation: Read-only telemetry push; NO remote flight control
  - Continuous Link Health Monitoring & Latency Tracking
=====================================================================================
"""

import os
import time
import json
import logging
import threading
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone

from backend.settings import settings
from backend.simple_json_store import json_store, compute_sha256
from backend.mavlink_multiplexer import mavlink_mux
from backend.mission_engine import mission_engine

logger = logging.getLogger("CloudSyncService")


class CloudSyncService:
    """
    Manages outbound REST synchronization between companion computer and cloud hosting.
    """

    def __init__(
        self,
        cloud_url: Optional[str] = None,
        api_key: Optional[str] = None,
        sync_interval_s: float = 2.0,
        max_spool_records: int = 500
    ):
        raw_cloud = cloud_url or os.environ.get("SKYCON_CLOUD_URL", "https://teamskycon.pythonanywhere.com").rstrip("/")
        # Prevent cloud server from attempting to sync to itself
        is_cloud_server = bool(os.environ.get("PYTHONANYWHERE_DOMAIN") or os.environ.get("PYTHONANYWHERE_SITE"))
        self.cloud_url = "" if is_cloud_server else raw_cloud
        self.api_key = api_key or os.environ.get("SKYCON_CLOUD_API_KEY", "saeindia_cloud_key_2026")
        self.sync_interval_s = sync_interval_s
        self.max_spool_records = max_spool_records

        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.RLock()

        # Link status
        self.is_online = False
        self.consecutive_failures = 0
        self.last_sync_time = 0.0
        self.last_latency_ms = 0.0
        self.backoff_delay_s = 1.0
        self.total_packets_synced = 0
        self.total_packets_spooled = 0

        # Synced event IDs to prevent duplicates
        self._synced_event_hashes: set = set()

    def start(self):
        """Starts asynchronous background synchronization worker."""
        with self._lock:
            if self._running:
                return
            if not self.cloud_url and not (os.environ.get("PYTHONANYWHERE_DOMAIN") or os.environ.get("PYTHONANYWHERE_SITE")):
                self.cloud_url = os.environ.get("SKYCON_CLOUD_URL", "https://teamskycon.pythonanywhere.com").rstrip("/")
            self._running = True
            self._thread = threading.Thread(target=self._sync_loop, daemon=True, name="SkyconCloudSync")
            self._thread.start()
            logger.info(f"CloudSyncService worker thread started (target: {self.cloud_url or 'Local-Only'}).")

    def stop(self):
        """Stops synchronization worker."""
        with self._lock:
            self._running = False
            if self._thread and self._thread.is_alive():
                self._thread.join(timeout=1.0)
            logger.info("CloudSyncService worker stopped.")

    def get_status(self) -> Dict[str, Any]:
        """Returns cloud synchronization status and network diagnostics."""
        with self._lock:
            spooled = json_store.load("offline_sync_spool", fallback=[])
            return {
                "configured": bool(self.cloud_url),
                "cloud_url": self.cloud_url or "Not Configured (Local-Only Mode)",
                "is_online": self.is_online,
                "consecutive_failures": self.consecutive_failures,
                "last_sync_time": self.last_sync_time,
                "last_sync_age_s": round(time.time() - self.last_sync_time, 1) if self.last_sync_time > 0 else 999.0,
                "last_latency_ms": self.last_latency_ms,
                "backoff_delay_s": self.backoff_delay_s,
                "total_packets_synced": self.total_packets_synced,
                "spooled_records_count": len(spooled),
                "spooled_packets_count": len(spooled),
                "sync_interval_s": self.sync_interval_s
            }

    # -------------------------------------------------------------------------
    # Core Synchronization Loop
    # -------------------------------------------------------------------------

    def _sync_loop(self):
        """Periodic worker pushing telemetry & draining offline spool."""
        while self._running:
            try:
                if self.cloud_url:
                    self._perform_sync_cycle()
                time.sleep(self.sync_interval_s if self.is_online else self.backoff_delay_s)
            except Exception as e:
                logger.debug(f"Sync cycle exception: {e}")
                time.sleep(self.backoff_delay_s)

    def trigger_sync_now(self) -> Dict[str, Any]:
        """Manually triggers a synchronization transaction and returns result."""
        if not self.cloud_url:
            return {"success": False, "error": "No cloud URL configured", "status": self.get_status()}
        res = self._perform_sync_cycle()
        return {"success": res, "status": self.get_status()}

    def _perform_sync_cycle(self) -> bool:
        """Executes a single synchronization transaction."""
        snapshot = self._build_sync_payload()

        # 1. Attempt to send current state
        success, latency = self._dispatch_post(f"{self.cloud_url}/api/sync/telemetry", snapshot)

        with self._lock:
            if success:
                self.is_online = True
                self.consecutive_failures = 0
                self.backoff_delay_s = 1.0
                self.last_sync_time = time.time()
                self.last_latency_ms = round(latency, 1)
                self.total_packets_synced += 1

                # Drain spooled records if any exist
                self._drain_spooled_records()
                return True
            else:
                self.is_online = False
                self.consecutive_failures += 1
                self.backoff_delay_s = min(30.0, self.backoff_delay_s * 2.0)

                # Spool current payload to disk
                self._spool_payload(snapshot)
                return False

    def _build_sync_payload(self) -> Dict[str, Any]:
        """Assembles authoritative companion telemetry and mission state."""
        telem = mavlink_mux.get_telemetry()
        status = mission_engine.get_status()

        payload = {
            "source": "SKYCON_COMPANION_PI4",
            "timestampUtc": datetime.now(timezone.utc).isoformat(),
            "telemetry": telem,
            "mission": status,
            "hash": compute_sha256({"t": telem.get("timestamp"), "m": status.get("state")})
        }
        return payload

    def _spool_payload(self, payload: Dict[str, Any]):
        """Persists payload to offline disk buffer when network is offline."""
        spool = json_store.load("offline_sync_spool", fallback=[])
        spool.append(payload)
        if len(spool) > self.max_spool_records:
            spool = spool[-self.max_spool_records:]
        json_store.save("offline_sync_spool", spool)
        self.total_packets_spooled += 1

    def _drain_spooled_records(self):
        """Uploads queued offline payloads after reconnection."""
        spool = json_store.load("offline_sync_spool", fallback=[])
        if not spool:
            return

        logger.info(f"Draining {len(spool)} spooled offline records to cloud...")
        remaining = []
        for record in spool:
            rec_hash = record.get("hash")
            if rec_hash and rec_hash in self._synced_event_hashes:
                continue  # Skip already synced

            ok, _ = self._dispatch_post(f"{self.cloud_url}/api/sync/telemetry", record)
            if ok:
                if rec_hash:
                    self._synced_event_hashes.add(rec_hash)
                self.total_packets_synced += 1
            else:
                remaining.append(record)
                break  # Connection lost again, pause draining

        json_store.save("offline_sync_spool", remaining)

    def _dispatch_post(self, url: str, data: Dict[str, Any], timeout_s: float = 3.0) -> Tuple[bool, float]:
        """Dispatches outbound HTTP POST to remote cloud endpoint."""
        t0 = time.time()
        try:
            req_data = json.dumps(data).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=req_data,
                headers={
                    "Content-Type": "application/json",
                    "X-Skycon-Auth": self.api_key,
                    "User-Agent": "SkyconCompanionPi4/1.0"
                },
                method="POST"
            )
            # Support SSL context with fallback for systems with missing local root CA bundle
            try:
                import ssl
                ctx = ssl.create_default_context()
            except Exception:
                ctx = None

            try:
                resp_ctx = urllib.request.urlopen(req, timeout=timeout_s, context=ctx)
            except Exception as ssl_err:
                try:
                    import ssl
                    unverified_ctx = ssl._create_unverified_context()
                    resp_ctx = urllib.request.urlopen(req, timeout=timeout_s, context=unverified_ctx)
                except Exception:
                    raise ssl_err

            with resp_ctx as resp:
                status_code = resp.getcode()
                latency_ms = (time.time() - t0) * 1000.0
                return (200 <= status_code < 300), latency_ms
        except Exception as e:
            latency_ms = (time.time() - t0) * 1000.0
            logger.debug(f"CloudSync dispatch error to {url}: {e}")
            return False, latency_ms


# Global singleton instance
cloud_sync_service = CloudSyncService()
