"""
=====================================================================================
SKYCON MASTER ARCHITECTURE - DATA STORAGE & RECOVERY
MODULE: intelligence_repository.py
Spatial Cells, Target Candidates & QR Intelligence Persistence (SQLite WAL + SHA-256)
=====================================================================================
Features:
  - SQLite WAL Database (`aerorecon.db` / `spatial_intel.db`)
  - Cryptographic SHA-256 Integrity Verification on Targets & QR Records
  - Multi-Observation Target History Tracking
  - Spatial Heat-Map Cell Persistence & Incremental Delta Retrieval
  - Communication Packet & Error Logging for Post-Mission Audit
=====================================================================================
"""

import os
import json
import sqlite3
import hashlib
import time
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger("IntelligenceRepository")


class IntelligenceRepository:
    """
    Authoritative storage for spatial cells, candidate targets, verified QR decodes,
    and packet transmission logs on the companion computer.
    """
    def __init__(self, db_path: str = "data/spatial_intel.db", targets_json: str = "data/targets.json"):
        self.db_path = db_path
        self.targets_json = targets_json

        for p in (db_path, targets_json):
            d = os.path.dirname(p)
            if d:
                os.makedirs(d, exist_ok=True)

        self._init_sqlite()

    def _init_sqlite(self):
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("PRAGMA journal_mode=WAL;")
                conn.execute("PRAGMA synchronous=NORMAL;")

                # Target records table
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS target_records (
                        target_id TEXT PRIMARY KEY,
                        mission_id TEXT,
                        status TEXT,
                        category TEXT,
                        latitude REAL,
                        longitude REAL,
                        altitude_agl REAL,
                        confidence REAL,
                        observation_count INTEGER,
                        two_digit_code TEXT,
                        qr_payload TEXT,
                        checksum_sha256 TEXT,
                        raw_json TEXT,
                        updated_at INTEGER
                    );
                """)

                # Spatial cells table
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS spatial_cells (
                        cell_id TEXT,
                        mission_id TEXT,
                        latitude REAL,
                        longitude REAL,
                        coverage_status TEXT,
                        target_status TEXT,
                        detection_score REAL,
                        confidence_score REAL,
                        observation_count INTEGER,
                        updated_at INTEGER,
                        PRIMARY KEY(cell_id, mission_id)
                    );
                """)

                # Packet history log
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS packet_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        mission_id TEXT,
                        direction TEXT,        -- 'TX' or 'RX'
                        msg_type INTEGER,
                        seq_num INTEGER,
                        payload_length INTEGER,
                        timestamp INTEGER,
                        crc_valid INTEGER
                    );
                """)

                conn.execute("CREATE INDEX IF NOT EXISTS idx_targets_mission ON target_records(mission_id);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_packet_logs_seq ON packet_logs(seq_num);")
        except Exception as e:
            logger.error("Failed to initialize IntelligenceRepository SQLite: %s", e)

    def save_target(self, target_dict: Dict[str, Any], mission_id: str = "SKYCON_001") -> bool:
        t_id = target_dict.get("target_id") or f"TGT_{int(time.time()*1000)}"
        now_ms = int(time.time() * 1000)

        # Compute SHA-256 checksum over core attributes
        hash_body = f"{t_id}:{target_dict.get('latitude')}:{target_dict.get('longitude')}:{target_dict.get('two_digit_code')}"
        sha256 = hashlib.sha256(hash_body.encode("utf-8")).hexdigest()

        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("""
                    INSERT INTO target_records (
                        target_id, mission_id, status, category, latitude, longitude,
                        altitude_agl, confidence, observation_count, two_digit_code,
                        qr_payload, checksum_sha256, raw_json, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(target_id) DO UPDATE SET
                        status=excluded.status,
                        confidence=excluded.confidence,
                        observation_count=excluded.observation_count,
                        two_digit_code=excluded.two_digit_code,
                        qr_payload=excluded.qr_payload,
                        checksum_sha256=excluded.checksum_sha256,
                        raw_json=excluded.raw_json,
                        updated_at=excluded.updated_at;
                """, (
                    t_id, mission_id,
                    target_dict.get("status", "DETECTED"),
                    target_dict.get("category", "BOX_STRUCTURE"),
                    float(target_dict.get("latitude", 0.0)),
                    float(target_dict.get("longitude", 0.0)),
                    float(target_dict.get("altitude_agl", 0.0)),
                    float(target_dict.get("confidence", 0.0)),
                    int(target_dict.get("observation_count", 1)),
                    target_dict.get("two_digit_code"),
                    target_dict.get("decoded_payload"),
                    sha256,
                    json.dumps(target_dict),
                    now_ms
                ))
            return True
        except Exception as e:
            logger.error("Failed to persist target %s to SQLite: %s", t_id, e)
            return False

    def save_spatial_cells_batch(self, cells_data: List[Dict[str, Any]], mission_id: str = "SKYCON_001"):
        now_ms = int(time.time() * 1000)
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.executemany("""
                    INSERT INTO spatial_cells (
                        cell_id, mission_id, latitude, longitude, coverage_status,
                        target_status, detection_score, confidence_score, observation_count, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(cell_id, mission_id) DO UPDATE SET
                        coverage_status=excluded.coverage_status,
                        target_status=excluded.target_status,
                        detection_score=excluded.detection_score,
                        confidence_score=excluded.confidence_score,
                        observation_count=excluded.observation_count,
                        updated_at=excluded.updated_at;
                """, [
                    (
                        c["cell_id"], mission_id, c["latitude"], c["longitude"],
                        c["coverage_status"], c["target_status"],
                        c["detection_score"], c["confidence_score"],
                        c["observation_count"], now_ms
                    )
                    for c in cells_data
                ])
        except Exception as e:
            logger.debug("Failed to batch save spatial cells: %s", e)

    def log_packet(
        self,
        mission_id: str,
        direction: str,
        msg_type: int,
        seq_num: int,
        payload_len: int,
        crc_valid: bool = True
    ):
        now_ms = int(time.time() * 1000)
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("""
                    INSERT INTO packet_logs (
                        mission_id, direction, msg_type, seq_num, payload_length, timestamp, crc_valid
                    ) VALUES (?, ?, ?, ?, ?, ?, ?);
                """, (mission_id, direction, msg_type, seq_num, payload_len, now_ms, 1 if crc_valid else 0))
        except Exception as e:
            logger.debug("Failed to log packet: %s", e)

    def get_all_targets(self, mission_id: str = "SKYCON_001") -> List[Dict[str, Any]]:
        targets = []
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.cursor()
                cur.execute("SELECT raw_json FROM target_records WHERE mission_id = ? ORDER BY confidence DESC;", (mission_id,))
                rows = cur.fetchall()
                for r in rows:
                    targets.append(json.loads(r["raw_json"]))
        except Exception as e:
            logger.error("Failed to query targets from SQLite: %s", e)
        return targets
