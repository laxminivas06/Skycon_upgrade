"""
=====================================================================================
SKYCON MASTER ARCHITECTURE - DATA STORAGE & RECOVERY
MODULE: mission_repository.py
Mission Configuration, Boundary & State History Persistence (SQLite WAL + Atomic JSON)
=====================================================================================
Features:
  - SQLite WAL-Mode Storage for Concurrent Reads/Writes
  - Atomic File Swap (.tmp + replace) for Mission JSON Snapshots
  - Full State Restoration on Companion App Restart
  - Preserves Original Boundary, Home Coordinates & Stage History
=====================================================================================
"""

import os
import json
import sqlite3
import time
import logging
from typing import Dict, Any, Optional, List

logger = logging.getLogger("MissionRepository")


class MissionRepository:
    """
    Manages durable mission storage across reboots and network disconnections.
    """
    def __init__(self, db_path: str = "data/missions.db", json_path: str = "data/active_mission.json"):
        self.db_path = db_path
        self.json_path = json_path

        # Ensure directory exists
        for p in (db_path, json_path):
            d = os.path.dirname(p)
            if d:
                os.makedirs(d, exist_ok=True)

        self._init_sqlite()

    def _init_sqlite(self):
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("PRAGMA journal_mode=WAL;")
                conn.execute("PRAGMA synchronous=NORMAL;")
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS missions (
                        mission_id TEXT PRIMARY KEY,
                        status TEXT,
                        boundary_type TEXT,
                        home_lat REAL,
                        home_lon REAL,
                        altitude_m REAL,
                        created_at INTEGER,
                        updated_at INTEGER,
                        raw_config_json TEXT,
                        boundary_json TEXT
                    );
                """)
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS mission_events (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        mission_id TEXT,
                        stage TEXT,
                        event_message TEXT,
                        timestamp INTEGER
                    );
                """)
                conn.execute("CREATE INDEX IF NOT EXISTS idx_mission_events_ts ON mission_events(timestamp);")
        except Exception as e:
            logger.error("Failed to initialize MissionRepository SQLite: %s", e)

    def save_mission(
        self,
        mission_id: str,
        status: str,
        boundary_type: str,
        home_lat: float,
        home_lon: float,
        altitude_m: float,
        config_dict: Dict[str, Any],
        boundary_coords: Any
    ) -> bool:
        now_ms = int(time.time() * 1000)
        raw_config = json.dumps(config_dict)
        boundary_json = json.dumps(boundary_coords)

        # 1. Update SQLite
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("""
                    INSERT INTO missions (
                        mission_id, status, boundary_type, home_lat, home_lon,
                        altitude_m, created_at, updated_at, raw_config_json, boundary_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(mission_id) DO UPDATE SET
                        status=excluded.status,
                        updated_at=excluded.updated_at,
                        raw_config_json=excluded.raw_config_json;
                """, (
                    mission_id, status, boundary_type, home_lat, home_lon,
                    altitude_m, now_ms, now_ms, raw_config, boundary_json
                ))
        except Exception as e:
            logger.error("Error saving mission to SQLite: %s", e)

        # 2. Atomic JSON file swap
        snapshot = {
            "mission_id": mission_id,
            "status": status,
            "boundary_type": boundary_type,
            "home": {"lat": home_lat, "lon": home_lon},
            "altitude_m": altitude_m,
            "config": config_dict,
            "boundary": boundary_coords,
            "updated_at": now_ms
        }
        self._save_atomic_json(self.json_path, snapshot)
        return True

    def log_stage_event(self, mission_id: str, stage: str, message: str):
        now_ms = int(time.time() * 1000)
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("""
                    INSERT INTO mission_events (mission_id, stage, event_message, timestamp)
                    VALUES (?, ?, ?, ?);
                """, (mission_id, stage, message, now_ms))
        except Exception as e:
            logger.debug("Error logging stage event: %s", e)

    def load_active_mission(self) -> Optional[Dict[str, Any]]:
        """Loads latest active mission state from atomic JSON or SQLite."""
        if os.path.exists(self.json_path):
            try:
                with open(self.json_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass

        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.cursor()
                cur.execute("SELECT * FROM missions ORDER BY updated_at DESC LIMIT 1;")
                row = cur.fetchone()
                if row:
                    return {
                        "mission_id": row["mission_id"],
                        "status": row["status"],
                        "boundary_type": row["boundary_type"],
                        "home": {"lat": row["home_lat"], "lon": row["home_lon"]},
                        "altitude_m": row["altitude_m"],
                        "config": json.loads(row["raw_config_json"]),
                        "boundary": json.loads(row["boundary_json"]),
                        "updated_at": row["updated_at"]
                    }
        except Exception as e:
            logger.error("Error reading active mission from SQLite: %s", e)

        return None

    def _save_atomic_json(self, file_path: str, data: Any):
        tmp_path = f"{file_path}.tmp_{int(time.time() * 1000)}"
        try:
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            os.replace(tmp_path, file_path)
        except Exception as e:
            logger.error("Atomic JSON save failed for %s: %s", file_path, e)
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
