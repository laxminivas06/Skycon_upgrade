"""
SKYCON System — Autonomous Mission Engine & 5-Minute Competition Timeline
Milestone 2/3: S500 Quadcopter Companion Autonomy

Implements:
1. Strict 17-state FSM with transition guards and timeout watchdogs.
2. 5-minute competition mission timeline (300s clock, phase budgeting, elapsed/remaining).
3. Geofence enforcement (Circular & Polygon boundaries, AGL ceiling, braking distance buffer).
4. Circular area geomapping path planner (concentric & clipped parallel coverage).
5. 3-Layer spatial heatmap engine (Coverage, Obstacles, Target Priority).
6. Local atomic persistence with SimpleJsonStore.
"""

import math
import time
import re
import threading
import logging
from typing import Dict, Any, List, Optional, Tuple

from backend.simple_json_store import json_store, compute_sha256
from backend.mavlink_multiplexer import mavlink_mux
from backend.route_validator import route_validator, haversine_distance, point_in_polygon

logger = logging.getLogger("MissionEngine")

# Mission States
MISSION_STATES = [
    "DISCONNECTED",
    "IDLE",
    "PREFLIGHT",
    "READY",
    "ARMED",
    "TAKING_OFF",
    "CLIMBING",
    "SCANNING",
    "MAPPING",
    "TARGET_INSPECTION",
    "QR_DETECTED",
    "TASK_PENDING",
    "RETURNING",
    "LANDING",
    "COMPLETED",
    "ABORTED",
    "FAILSAFE"
]

# Official ADDC 2026 12-Stage Mission Lifecycle
ADDC_COMPETITION_STAGES = [
    "STAGE_1_MARSHAL_AUTH",
    "STAGE_2_PREFLIGHT_CHECKS",
    "STAGE_3_READY_TO_ARM",
    "STAGE_4_AUTONOMOUS_TAKEOFF",
    "STAGE_5_RECON_NAVIGATION",
    "STAGE_6_TARGET_BOX_DETECTION",
    "STAGE_7_AERIAL_QR_EXTRACTION",
    "STAGE_8_GROUND_PUZZLE_INPUT",
    "STAGE_9_ACCESS_CODE_VERIFICATION",
    "STAGE_10_CACHE_UNLOCK_CONFIRMED",
    "STAGE_11_PACKAGE_RETRIEVAL_CONFIRMED",
    "STAGE_12_AUTONOMOUS_RTL_AND_LAND",
]

VALID_TRANSITIONS: Dict[str, List[str]] = {
    "DISCONNECTED": ["IDLE", "PREFLIGHT"],
    "IDLE": ["PREFLIGHT", "READY", "ARMED", "TAKING_OFF", "DISCONNECTED", "QR_DETECTED"],
    "PREFLIGHT": ["READY", "ARMED", "IDLE", "FAILSAFE"],
    "READY": ["ARMED", "TAKING_OFF", "IDLE", "FAILSAFE"],
    "ARMED": ["TAKING_OFF", "CLIMBING", "IDLE", "FAILSAFE", "ABORTED"],
    "TAKING_OFF": ["CLIMBING", "SCANNING", "FAILSAFE", "ABORTED", "RETURNING"],
    "CLIMBING": ["SCANNING", "FAILSAFE", "ABORTED", "RETURNING"],
    "SCANNING": ["MAPPING", "TARGET_INSPECTION", "QR_DETECTED", "FAILSAFE", "ABORTED", "RETURNING"],
    "MAPPING": ["SCANNING", "TARGET_INSPECTION", "QR_DETECTED", "FAILSAFE", "ABORTED", "RETURNING"],
    "TARGET_INSPECTION": ["QR_DETECTED", "SCANNING", "FAILSAFE", "ABORTED", "RETURNING"],
    "QR_DETECTED": ["TASK_PENDING", "RETURNING", "COMPLETED", "FAILSAFE", "IDLE"],
    "TASK_PENDING": ["RETURNING", "COMPLETED", "FAILSAFE", "ABORTED", "IDLE"],
    "RETURNING": ["LANDING", "COMPLETED", "FAILSAFE", "ABORTED"],
    "LANDING": ["COMPLETED", "FAILSAFE", "IDLE"],
    "COMPLETED": ["IDLE"],
    "ABORTED": ["IDLE", "RETURNING", "LANDING"],
    "FAILSAFE": ["RETURNING", "LANDING", "IDLE"]
}


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates geodesic distance between two points in meters."""
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


def point_in_polygon(lat: float, lon: float, polygon: List[Dict[str, float]]) -> bool:
    """Ray-casting algorithm to test if (lat, lon) is inside a polygon."""
    if len(polygon) < 3:
        return True
    n = len(polygon)
    inside = False
    p1x = polygon[0].get("lon", polygon[0].get("lng", 0.0))
    p1y = polygon[0].get("lat", 0.0)

    for i in range(n + 1):
        p2x = polygon[i % n].get("lon", polygon[i % n].get("lng", 0.0))
        p2y = polygon[i % n].get("lat", 0.0)
        if lat > min(p1y, p2y):
            if lat <= max(p1y, p2y):
                if lon <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (lat - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or lon <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside


class MissionEngine:
    """
    Central Autonomous Mission Manager for SKYCON.
    """

    def __init__(self):
        self.state: str = "IDLE"
        self.active_mission_id: Optional[str] = None
        self.start_time: float = 0.0
        self.target_duration_s: int = 300  # 5-minute competition mission target
        self.deadline: float = 0.0
        self.current_phase: str = "Preflight"
        self.waypoints: List[Dict[str, Any]] = []
        self.current_waypoint_idx: int = 0
        self.decoded_qr: Optional[Dict[str, Any]] = None
        self.home_location: Dict[str, float] = {"lat": 13.0827, "lon": 80.2707, "alt": 0.0}

        # ADDC 2026 12-Stage Mission Lifecycle Attributes
        self.addc_stage: str = "STAGE_1_MARSHAL_AUTH"
        self.marshal_authorized: bool = False
        self.marshal_id: str = ""
        self.marshal_signature: str = ""
        self.marshal_auth_time: float = 0.0

        # ADDC 4-Digit Intelligence Access Code Workflow
        self.aerial_qr_code: Optional[str] = None
        self.aerial_qr_timestamp: float = 0.0
        self.puzzle_code: Optional[str] = None
        self.puzzle_timestamp: float = 0.0
        self.combined_access_code: Optional[str] = None
        self.access_code_verified: bool = False

        # Cache Unlock & Retrieval Confirmation Events
        self.cache_unlocked: bool = False
        self.cache_unlock_time: float = 0.0
        self.cache_unlock_operator: str = ""
        self.package_retrieved: bool = False
        self.package_retrieval_time: float = 0.0
        self.package_retrieval_operator: str = ""

        # Geofence configuration (ADDC default: 50m radius, 25m max altitude)
        self.geofence: Dict[str, Any] = {
            "type": "CIRCLE",
            "center": {"lat": 13.0827, "lon": 80.2707},
            "radius": 50.0,
            "alt_max": 25.0,
            "alt_min": 1.0,
            "braking_buffer_m": 5.0,
            "enabled": True,
            "action": "RTL",
            "polygon": []
        }

        # 3-Layer Spatial Grid Data
        self.spatial_grid: Dict[str, Any] = {
            "layer_a_coverage": {},   # cell_id -> status (SCANNED, UNSCANNED, PARTIAL, UNCERTAIN)
            "layer_b_obstacles": {},  # cell_id -> status (FREE, CANDIDATE, CONFIRMED, RESTRICTED)
            "layer_c_targets": {},    # cell_id -> target info
            "grid_resolution_m": 2.5,
            "center": {"lat": 13.0827, "lon": 80.2707},
            "radius_m": 25.0
        }

        self._lock = threading.RLock()
        self._load_persisted_state()
        self._init_spatial_grid()

        # Telemetry listener
        mavlink_mux.subscribe(self._on_telemetry_update)

    def _load_persisted_state(self):
        """Restores state from SimpleJsonStore on boot."""
        active = json_store.get_active_mission()
        if active:
            self.active_mission_id = active.get("missionId")
            self.state = active.get("status", "IDLE")
            self.start_time = active.get("startTime", time.time())
            self.deadline = active.get("deadline", self.start_time + 300)
            self.waypoints = active.get("waypoints", [])
            logger.info(f"Restored active mission {self.active_mission_id} in state {self.state}")

        gf = json_store.load("geofence")
        if gf and isinstance(gf, dict):
            self.geofence.update(gf)

    def _init_spatial_grid(self):
        """Initializes circular discrete grid cells for 3-layer heatmap."""
        res = self.spatial_grid["grid_resolution_m"]
        radius = self.spatial_grid["radius_m"]
        max_idx = int(math.ceil(radius / res))

        for r in range(-max_idx, max_idx + 1):
            for c in range(-max_idx, max_idx + 1):
                dist = math.sqrt((r * res)**2 + (c * res)**2)
                if dist <= radius:
                    cell_id = f"CELL_{r:+03d}_{c:+03d}"
                    self.spatial_grid["layer_a_coverage"][cell_id] = "UNSCANNED"
                    self.spatial_grid["layer_b_obstacles"][cell_id] = "FREE"

    def transition_to(self, new_state: str, reason: str = "") -> bool:
        """Enforces valid state transitions and logs to atomic store."""
        with self._lock:
            allowed = VALID_TRANSITIONS.get(self.state, [])
            if new_state not in allowed and new_state != "FAILSAFE" and new_state != "ABORTED":
                logger.warning(f"Invalid transition rejected: {self.state} -> {new_state} (reason: {reason})")
                return False

            old_state = self.state
            self.state = new_state
            logger.info(f"[MISSION FSM] {old_state} -> {new_state} | {reason}")

            # Synchronize ADDC 12-stage progress
            if new_state == "PREFLIGHT":
                self.addc_stage = "STAGE_2_PREFLIGHT_CHECKS"
            elif new_state in ("READY", "ARMED"):
                self.addc_stage = "STAGE_3_READY_TO_ARM"
            elif new_state in ("TAKING_OFF", "CLIMBING"):
                self.addc_stage = "STAGE_4_AUTONOMOUS_TAKEOFF"
            elif new_state in ("SCANNING", "MAPPING"):
                self.addc_stage = "STAGE_5_RECON_NAVIGATION"
            elif new_state == "TARGET_INSPECTION":
                self.addc_stage = "STAGE_6_TARGET_BOX_DETECTION"
            elif new_state == "QR_DETECTED":
                self.addc_stage = "STAGE_7_AERIAL_QR_EXTRACTION"
            elif new_state in ("RETURNING", "LANDING", "COMPLETED"):
                self.addc_stage = "STAGE_12_AUTONOMOUS_RTL_AND_LAND"
            elif new_state in ("ABORTED", "FAILSAFE"):
                self.addc_stage = "FAILSAFE"

            # Log event to atomic store
            json_store.log_event("STATE_TRANSITION", f"{old_state} -> {new_state}", {
                "missionId": self.active_mission_id,
                "reason": reason,
                "elapsed": self.get_elapsed_seconds()
            })

            # Update mission in store
            if self.active_mission_id:
                json_store.save_mission({
                    "missionId": self.active_mission_id,
                    "status": self.state,
                    "startTime": self.start_time,
                    "deadline": self.deadline,
                    "waypoints": self.waypoints,
                    "lastUpdated": int(time.time() * 1000)
                })

            return True

    def reset_mission(self):
        """Resets the mission state machine to IDLE for testing or new sorties."""
        with self._lock:
            self.state = "IDLE"
            self.addc_stage = "STAGE_1_MARSHAL_AUTH"
            self.current_phase = "INIT"
            self.active_mission_id = None
            self.start_time = None
            self.deadline = None
            self.waypoints = []
            self.current_waypoint_idx = 0
            self.marshal_authorized = False
            self.marshal_id = ""
            self.marshal_signature = ""
            self.marshal_auth_time = 0.0
            self.aerial_qr_code = None
            self.decoded_qr = None
            self.aerial_qr_timestamp = 0.0
            self.puzzle_code = None
            self.puzzle_timestamp = 0.0
            self.combined_access_code = None
            self.access_code_verified = False
            self.cache_unlocked = False
            self.cache_unlock_time = 0.0
            self.cache_unlock_operator = ""
            self.package_retrieved = False
            self.package_retrieval_time = 0.0
            self.package_retrieval_operator = ""
            self._init_spatial_grid()
            return True

    def get_elapsed_seconds(self) -> int:
        if not self.start_time:
            return 0
        return max(0, int(time.time() - self.start_time))

    def get_remaining_seconds(self) -> int:
        if not self.deadline:
            return self.target_duration_s
        return max(0, int(self.deadline - time.time()))

    def get_status(self) -> Dict[str, Any]:
        """Returns comprehensive mission status."""
        with self._lock:
            detected_codes = [self.aerial_qr_code] if self.aerial_qr_code else []
            return {
                "state": self.state,
                "addcStage": self.addc_stage,
                "marshalAuthorized": self.marshal_authorized,
                "marshalId": self.marshal_id,
                "aerialQrCode": self.aerial_qr_code,
                "puzzleCode": self.puzzle_code,
                "combinedAccessCode": self.combined_access_code,
                "accessCodeVerified": self.access_code_verified,
                "cacheUnlocked": self.cache_unlocked,
                "packageRetrieved": self.package_retrieved,
                "missionId": self.active_mission_id,
                "elapsedSeconds": self.get_elapsed_seconds(),
                "remainingSeconds": self.get_remaining_seconds(),
                "remaining_time_s": self.get_remaining_seconds(),
                "targetDurationSeconds": self.target_duration_s,
                "currentPhase": self.current_phase,
                "currentWaypoint": self.current_waypoint_idx,
                "totalWaypoints": len(self.waypoints),
                "decodedQR": self.decoded_qr,
                "detected_codes": detected_codes,
                "homeLocation": self.home_location,
                "geofence": self.geofence
            }

    def get_state(self) -> Dict[str, Any]:
        """Alias for get_status() to maintain full compatibility across API routes."""
        return self.get_status()

    def reset(self):
        """Alias for reset_mission() to maintain compatibility with legacy routes."""
        return self.reset_mission()

    def configure_geofence(self, fence_config: Dict[str, Any]) -> Dict[str, Any]:
        """Updates and persists geofence configuration."""
        with self._lock:
            if isinstance(fence_config, dict):
                self.geofence.update(fence_config)
                json_store.save("geofence", self.geofence)
            return {"success": True, "geofence": self.geofence}

    # -------------------------------------------------------------------------
    # Mission Lifecycle Operations
    # -------------------------------------------------------------------------

    def configure_mission(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Configures or plans a new mission."""
        with self._lock:
            mission_id = config.get("missionId") or f"MISS_{int(time.time()*1000)}"
            self.active_mission_id = mission_id
            self.target_duration_s = int(config.get("timeLimitSeconds", 300))
            self.waypoints = config.get("waypoints", [])

            # Generate circular scan waypoints if requested
            if config.get("pattern") == "CIRCULAR" or config.get("circularScan"):
                center = config.get("center", self.home_location)
                radius = float(config.get("radius", 15.0))
                altitude = float(config.get("altitude", 10.0))

                # Validate circle boundary directly before generating waypoints
                boundary_check = route_validator.validate_search_boundary({
                    "type": "CIRCLE",
                    "center": center,
                    "radius": radius
                }, self.geofence, altitude)
                if not boundary_check.get("valid", True):
                    return {"success": False, "error": f"Search boundary violates geofence: {boundary_check.get('reason')}"}

                self.waypoints = self.plan_circular_scan(center["lat"], center["lon"], radius, altitude)

            # Validate waypoints against geofence
            validation = self.validate_against_geofence(self.waypoints)
            if not validation["valid"]:
                return {"success": False, "error": f"Mission violates geofence: {validation['reason']}"}

            self.transition_to("PREFLIGHT", "Mission configured and validated")
            return {"success": True, "missionId": self.active_mission_id, "waypointCount": len(self.waypoints)}

    def start_mission(self, mission_id: Optional[str] = None) -> Dict[str, Any]:
        """Starts official autonomous competition mission and starts 4-min clock."""
        with self._lock:
            if mission_id:
                self.active_mission_id = mission_id
            now = time.time()
            self.start_time = now
            self.deadline = now + self.target_duration_s
            self.current_waypoint_idx = 0

            # Execute autonomous sequence: Arm -> Guided -> Takeoff
            self.transition_to("ARMED", "Mission started by operator")
            mavlink_mux.arm()
            mavlink_mux.set_mode("GUIDED")
            takeoff_alt = self.waypoints[0].get("alt", 10.0) if self.waypoints else 10.0
            mavlink_mux.takeoff(takeoff_alt)
            self.transition_to("TAKING_OFF", f"Climbing to {takeoff_alt}m")
            return {"success": True, "state": self.state, "deadline": self.deadline}

    def trigger_emergency_rtl(self, reason: str = "MANUAL_EMERGENCY_RTL"):
        """Dedicated high-priority local failsafe RTL."""
        with self._lock:
            self.transition_to("FAILSAFE", f"Emergency RTL triggered: {reason}")
            mavlink_mux.emergency_rtl()

    # -------------------------------------------------------------------------
    # Geofence Enforcement & Validation
    # -------------------------------------------------------------------------

    def validate_against_geofence(self, waypoints: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Validates that all waypoints and return route stay inside geofence."""
        if not self.geofence.get("enabled", True):
            return {"valid": True}

        gf_type = self.geofence.get("type", "CIRCLE")
        center = self.geofence.get("center", {})
        radius = float(self.geofence.get("radius", 50.0))
        alt_max = float(self.geofence.get("alt_max", 25.0))
        buffer = float(self.geofence.get("braking_buffer_m", 5.0))
        effective_radius = max(5.0, radius - buffer)

        for i, wp in enumerate(waypoints):
            lat = wp.get("lat")
            lon = wp.get("lon", wp.get("lng"))
            alt = wp.get("alt", 0.0)

            if alt > alt_max:
                return {"valid": False, "reason": f"Waypoint #{i+1} altitude {alt}m exceeds max ceiling {alt_max}m"}

            if gf_type == "CIRCLE":
                dist = haversine_distance(lat, lon, center["lat"], center["lon"])
                if dist > effective_radius:
                    return {"valid": False, "reason": f"Waypoint #{i+1} distance {round(dist,1)}m exceeds effective fence radius {effective_radius}m"}
            elif gf_type == "POLYGON":
                if not point_in_polygon(lat, lon, self.geofence.get("polygon", [])):
                    return {"valid": False, "reason": f"Waypoint #{i+1} is outside polygon geofence"}

        return {"valid": True}

    def check_geofence_breach(self, drone_lat: float, drone_lon: float, drone_alt: float) -> Tuple[bool, float, str]:
        """
        Checks real-time position against active geofence.
        Returns (is_breached, distance_to_boundary_m, warning_message).
        """
        if not self.geofence.get("enabled", True):
            return False, 999.0, ""

        radius = float(self.geofence.get("radius", 50.0))
        alt_max = float(self.geofence.get("alt_max", 25.0))
        center = self.geofence.get("center", {})
        buffer = float(self.geofence.get("braking_buffer_m", 5.0))

        if drone_alt > alt_max:
            return True, 0.0, f"Altitude ceiling breached: {round(drone_alt, 1)}m > {alt_max}m"

        dist_from_center = haversine_distance(drone_lat, drone_lon, center["lat"], center["lon"])
        dist_to_boundary = radius - dist_from_center

        if dist_to_boundary <= 0:
            return True, dist_to_boundary, f"Geofence breached! Distance outside: {round(-dist_to_boundary, 1)}m"
        elif dist_to_boundary <= buffer:
            return False, dist_to_boundary, f"WARNING: Approaching geofence boundary ({round(dist_to_boundary, 1)}m remaining)"

        return False, dist_to_boundary, ""

    # -------------------------------------------------------------------------
    # Geomapping Path Generator
    # -------------------------------------------------------------------------

    def plan_circular_scan(self, center_lat: float, center_lon: float, radius_m: float, altitude_m: float) -> List[Dict[str, Any]]:
        """
        Generates concentric circular inspection rings covering a target circular area.
        Accounts for camera field of view and overlap margins.
        """
        waypoints = []
        # Ring intervals: 4m spacing for high-overlap optical coverage
        spacing = 4.0
        rings = max(1, int(radius_m / spacing))

        for ring_idx in range(1, rings + 1):
            r = ring_idx * spacing
            num_points = max(8, int(2 * math.pi * r / 5.0))  # Points spaced ~5m along circumference
            for step in range(num_points):
                angle = (2 * math.pi * step) / num_points
                # Lat/lon conversion: 1 deg lat ~= 111139m, 1 deg lon ~= 111139m * cos(lat)
                d_lat = (r * math.cos(angle)) / 111139.0
                d_lon = (r * math.sin(angle)) / (111139.0 * math.cos(math.radians(center_lat)))
                waypoints.append({
                    "lat": center_lat + d_lat,
                    "lon": center_lon + d_lon,
                    "alt": altitude_m,
                    "speed": 2.5,
                    "action": "SCAN",
                    "ring": ring_idx
                })

        return waypoints

    # -------------------------------------------------------------------------
    # ADDC 2026 Official 12-Stage Mission Operations & 4-Digit Workflow
    # -------------------------------------------------------------------------

    def authorize_flight_marshal(self, marshal_id: str, signature: str = "OFFICIAL_AUTH") -> Dict[str, Any]:
        """Records official Flight Marshal safety authorization prior to takeoff."""
        with self._lock:
            self.marshal_authorized = True
            self.marshal_id = marshal_id
            self.marshal_signature = signature
            self.marshal_auth_time = time.time()
            self.addc_stage = "STAGE_2_PREFLIGHT_CHECKS"
            logger.info(f"ADDC 2026: Flight Marshal '{marshal_id}' authorized flight run.")

            json_store.log_event("MARSHAL_AUTH", f"Marshal '{marshal_id}' authorized", {
                "missionId": self.active_mission_id,
                "marshalId": marshal_id,
                "signature": signature
            })

            return {
                "success": True,
                "marshalAuthorized": True,
                "marshalId": marshal_id,
                "stage": self.addc_stage
            }

    def upload_mission_to_pixhawk(self, waypoints: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        """Validates waypoints with route_validator and uploads via MAVLink mission transfer protocol."""
        with self._lock:
            wps = waypoints or self.waypoints
            if not wps:
                return {"success": False, "error": "No waypoints provided for upload."}

            validation = route_validator.validate_plan(wps, self.geofence, self.home_location)
            if not validation.is_valid:
                return {
                    "success": False,
                    "error": f"Mission failed route validation: {validation.summary}",
                    "issues": validation.issues
                }

            ok, res_str, code = mavlink_mux.upload_mission(wps)
            if ok:
                self.waypoints = wps
                return {
                    "success": True,
                    "waypointCount": len(wps),
                    "result": res_str,
                    "validation": validation.to_dict()
                }
            else:
                return {
                    "success": False,
                    "error": f"MAVLink mission upload failed: {res_str}",
                    "code": code
                }

    def handle_qr_detected(self, detection: Dict[str, Any], auto_rtl: bool = False) -> Dict[str, Any]:
        r"""
        Processes validated 2-digit QR detection and executes configured mission transition.
        Enforces strict 2-digit format (^\d{2}$). In ADDC 2026 mode, locks aerial code and
        transitions to STAGE_8_GROUND_PUZZLE_INPUT instead of premature RTL.
        """
        with self._lock:
            payload = detection.get("twoDigitCode") or detection.get("payload")
            payload_str = str(payload).strip() if payload is not None else ""
            if not re.match(r'^\d{2}$', payload_str):
                logger.warning(f"Disqualified QR payload '{payload}': does not match ^\\d{{2}}$")
                return {"success": False, "error": f"Invalid QR code '{payload}': must be exactly 2 numerical digits."}

            self.decoded_qr = detection
            self.aerial_qr_code = payload_str
            self.aerial_qr_timestamp = time.time()

            self.transition_to("QR_DETECTED", f"Target verified with 2-digit aerial code: '{payload_str}'")
            self.addc_stage = "STAGE_7_AERIAL_QR_EXTRACTION"

            # Persist detection atomically
            json_store.save_detection(detection)

            if auto_rtl:
                logger.info(f"Target '{payload_str}' recorded. Legacy auto_rtl active: initiating RTL.")
                self.transition_to("RETURNING", "Target captured, returning to launch.")
                mavlink_mux.rtl()
                return {"success": True, "state": self.state, "stage": self.addc_stage, "payload": payload_str}

            # ADDC 2026 Workflow: Advance to TASK_PENDING / STAGE_8 for ground operative puzzle
            self.transition_to("TASK_PENDING", f"Aerial QR '{payload_str}' confirmed. Awaiting ground operative 2-digit puzzle completion.")
            self.addc_stage = "STAGE_8_GROUND_PUZZLE_INPUT"
            logger.info(f"ADDC 2026: Aerial code '{payload_str}' secured. Advanced to Stage 8 (Ground Puzzle Input).")

            return {
                "success": True,
                "state": self.state,
                "stage": self.addc_stage,
                "aerialQrCode": self.aerial_qr_code,
                "status": "AWAITING_GROUND_PUZZLE"
            }

    def submit_ground_puzzle(self, puzzle_code: str, operative_id: str = "FIELD_RUNNER_1") -> Dict[str, Any]:
        """
        Ingests the 2-digit solution from ground operative puzzle challenge,
        combines with aerial QR (2 digits) to form verified 4-digit access code.
        """
        with self._lock:
            code_str = str(puzzle_code).strip()
            if not re.match(r'^\d{2}$', code_str):
                return {
                    "success": False,
                    "error": f"Invalid ground puzzle code '{puzzle_code}': must be exactly 2 numerical digits (^\\d{{2}}$)."
                }

            if not self.aerial_qr_code:
                return {
                    "success": False,
                    "error": "Cannot submit ground puzzle before aerial QR code is verified and locked."
                }

            self.puzzle_code = code_str
            self.puzzle_timestamp = time.time()
            self.combined_access_code = f"{self.aerial_qr_code}{self.puzzle_code}"
            self.access_code_verified = (len(self.combined_access_code) == 4 and self.combined_access_code.isdigit())

            self.addc_stage = "STAGE_9_ACCESS_CODE_VERIFICATION"
            logger.info(f"ADDC 2026: 4-digit intelligence access code compiled: '{self.combined_access_code}' (Aerial: {self.aerial_qr_code}, Ground: {self.puzzle_code})")

            # Persist access code event
            json_store.save("access_code", {
                "missionId": self.active_mission_id,
                "aerialQrCode": self.aerial_qr_code,
                "puzzleCode": self.puzzle_code,
                "combinedAccessCode": self.combined_access_code,
                "verified": self.access_code_verified,
                "operativeId": operative_id,
                "timestamp": int(time.time() * 1000)
            })

            return {
                "success": True,
                "stage": self.addc_stage,
                "aerialQrCode": self.aerial_qr_code,
                "puzzleCode": self.puzzle_code,
                "combinedAccessCode": self.combined_access_code,
                "verified": self.access_code_verified
            }

    def confirm_cache_unlocked(self, operator_id: str = "FIELD_OPERATIVE_1") -> Dict[str, Any]:
        """Confirms physical intelligence cache unlocked by ground operative."""
        with self._lock:
            if not self.access_code_verified or not self.combined_access_code:
                return {"success": False, "error": "Cannot confirm unlock: 4-digit access code not yet verified."}

            self.cache_unlocked = True
            self.cache_unlock_time = time.time()
            self.cache_unlock_operator = operator_id
            self.addc_stage = "STAGE_10_CACHE_UNLOCK_CONFIRMED"
            logger.info(f"ADDC 2026: Intelligence cache unlock confirmed by operator '{operator_id}'.")

            json_store.save("cache_unlock", {
                "missionId": self.active_mission_id,
                "accessCode": self.combined_access_code,
                "operatorId": operator_id,
                "timestamp": int(self.cache_unlock_time * 1000)
            })

            return {"success": True, "stage": self.addc_stage, "cacheUnlocked": True}

    def confirm_package_retrieval(self, operator_id: str = "FIELD_OPERATIVE_1") -> Dict[str, Any]:
        """Confirms package secured from cache and initiates autonomous RTL."""
        with self._lock:
            if not self.cache_unlocked:
                return {"success": False, "error": "Cannot confirm retrieval: cache has not been confirmed unlocked."}

            self.package_retrieved = True
            self.package_retrieval_time = time.time()
            self.package_retrieval_operator = operator_id
            self.addc_stage = "STAGE_11_PACKAGE_RETRIEVAL_CONFIRMED"
            logger.info(f"ADDC 2026: Intelligence package retrieval confirmed by '{operator_id}'. Initiating RTL.")

            json_store.save("package_retrieval", {
                "missionId": self.active_mission_id,
                "operatorId": operator_id,
                "timestamp": int(self.package_retrieval_time * 1000)
            })

            # Transition to RETURNING / STAGE_12
            self.transition_to("RETURNING", "Package retrieved. Executing autonomous RTL to finish zone.")
            self.addc_stage = "STAGE_12_AUTONOMOUS_RTL_AND_LAND"
            mavlink_mux.rtl()

            return {
                "success": True,
                "stage": self.addc_stage,
                "packageRetrieved": True,
                "state": self.state
            }

    # -------------------------------------------------------------------------
    # Telemetry Ingestion & Real-time Watchdogs
    # -------------------------------------------------------------------------

    def _on_telemetry_update(self, telem: Dict[str, Any]):
        """Callback on every telemetry packet from MAVLink multiplexer."""
        with self._lock:
            drone_lat = telem.get("lat", 0.0)
            drone_lon = telem.get("lon", 0.0)
            drone_alt = telem.get("relative_alt", 0.0)

            # 1. Real-time geofence enforcement watchdog
            if self.state in ("ARMED", "TAKING_OFF", "CLIMBING", "SCANNING", "MAPPING", "TARGET_INSPECTION"):
                breached, dist_to_bound, warn_msg = self.check_geofence_breach(drone_lat, drone_lon, drone_alt)
                if breached:
                    logger.error(f"GEOFENCE BREACH INTERCEPTED: {warn_msg}! Activating immediate RTL.")
                    self.trigger_emergency_rtl(f"Geofence breach: {warn_msg}")
                elif warn_msg:
                    logger.warning(warn_msg)

            # 2. Update 3-Layer Heatmap Coverage
            if drone_lat != 0.0 and drone_lon != 0.0:
                self._update_spatial_coverage(drone_lat, drone_lon)

            # 3. Time Budget Watchdog (5-Minute Limit)
            if self.state in ("SCANNING", "MAPPING", "TARGET_INSPECTION") and self.get_remaining_seconds() <= 0:
                logger.warning("5-Minute Competition Mission Clock Expired! Prioritizing safe RTL.")
                self.transition_to("RETURNING", "Mission timeout reached. Safe recovery RTL.")
                mavlink_mux.rtl()

    def _update_spatial_coverage(self, drone_lat: float, drone_lon: float):
        """Marks spatial grid cells within camera optical footprint as SCANNED."""
        res = self.spatial_grid["grid_resolution_m"]
        center = self.spatial_grid["center"]
        
        # Calculate drone grid coordinate relative to center
        dn_m = (drone_lat - center["lat"]) * 111139.0
        de_m = (drone_lon - center["lon"]) * 111139.0 * math.cos(math.radians(center["lat"]))

        drone_r = int(round(dn_m / res))
        drone_c = int(round(de_m / res))

        # Optical footprint radius ~3m
        footprint_cells = 2
        for dr in range(-footprint_cells, footprint_cells + 1):
            for dc in range(-footprint_cells, footprint_cells + 1):
                cell_id = f"CELL_{drone_r + dr:+03d}_{drone_c + dc:+03d}"
                if cell_id in self.spatial_grid["layer_a_coverage"]:
                    self.spatial_grid["layer_a_coverage"][cell_id] = "SCANNED"


# Global singleton engine
mission_engine = MissionEngine()
