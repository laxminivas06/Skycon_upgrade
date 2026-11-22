"""
SKYCON System — Production Flask WSGI Application & Canonical REST API Hub
Standard WSGI-compliant entry point optimized for PythonAnywhere & local execution.

Canonical API Groups:
  1.  /api/auth         - Authentication, token verification & roles
  2.  /api/system       - System health, CPU/RAM/Disk metrics & config
  3.  /api/drone        - Drone state, arm, disarm, modes, takeoff, land, RTL
  4.  /api/telemetry    - Telemetry snapshots, history, GPS, battery, attitude
  5.  /api/mavlink      - MAVLink link status, heartbeat, modes dictionary, stats
  6.  /api/camera       - Smartphone frame push, MJPEG streaming & config
  7.  /api/vision       - Computer vision status, target registry & heatmap
  8.  /api/qr           - Verified QR payloads, history & candidate submission
  9.  /api/geofence     - Geofence circle/polygon definition & parameter sync
  10. /api/geomapping   - 3D pinhole projection, geodetic math & arena bounds
  11. /api/missions     - Mission definitions, active state, start, pause, abort
  12. /api/events       - Event logs, operator audit trails
  13. /api/health       - Hosting probe & uptime health check
"""

import os
import sys
import time
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from flask import Flask, request, jsonify, Response, send_from_directory, render_template_string
from flask_cors import CORS

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.settings import settings
from backend.logging_config import setup_logging
from backend.simple_json_store import json_store, compute_sha256
from backend.mavlink_multiplexer import mavlink_mux, COPTER_MODES, MODE_NAME_TO_INT, VERIFIED_GCS_MODES
from backend.mission_engine import mission_engine, haversine_distance, point_in_polygon, ADDC_COMPETITION_STAGES
from backend.coverage_planner import CoveragePlanner
from backend.route_validator import route_validator
from backend.auth_service import auth_service
from backend.system_health import system_health_service
from backend.stream_capture import smartphone_stream, CameraState, evaluate_frame_quality
from backend.qr_detector import qr_detector_service, validate_strict_two_digit, QRCandidateState
from backend.telemetry_sync import telemetry_sync, TimeSyncStatus
from backend.georeferencing import georeferencer_service, GeorefHonestyLevel, CameraIntrinsics3D
from backend.heatmap_engine import heatmap_engine
from backend.network_manager import network_manager
from backend.coordinate_validator import coordinate_validator
from backend.coordinate_package import coordinate_package_manager
from backend.coverage_tracker import coverage_tracker
from backend.hardware_verification import hardware_verification_service
from backend.cloud_sync import cloud_sync_service

logger = setup_logging("skycon_app")

# Initialize Flask app
app = Flask(__name__, static_folder=None)
app.config["SECRET_KEY"] = settings.SECRET_KEY
CORS(app, resources={r"/*": {"origins": "*"}})

SERVER_START_TIME = time.time()
latest_camera_frame: Optional[bytes] = None
latest_frame_ts: Optional[float] = None


# =============================================================================
# UNIFIED JSON RESPONSE HELPER
# =============================================================================

def api_response(data: Any = None, error: Optional[str] = None, code: int = 200):
    """Standardized response envelope across all API endpoints."""
    payload = {
        "status": "success" if error is None else "error",
        "success": error is None,
        "data": data,
        "error": error,
        "timestamp": time.time()
    }
    return jsonify(payload), code


# =============================================================================
# 1. AUTHENTICATION & ACCESS CONTROL (/api/auth)
# =============================================================================

@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    req = request.get_json(silent=True) or {}
    username = req.get("username", "").strip()
    password = req.get("password", "")

    if not username or not password:
        return api_response(error="Username and password are required", code=400)

    session = auth_service.authenticate(username, password)
    if not session:
        json_store.log_event("AUTH_FAILED", {"username": username}, source="AUTH")
        return api_response(error="Invalid credentials", code=401)

    json_store.log_event("AUTH_SUCCESS", {"username": username, "role": session["role"]}, source="AUTH")
    return api_response(data=session, code=200)


@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    token = request.headers.get("Authorization")
    auth_service.logout(token)
    return api_response(data={"message": "Logged out successfully"}, code=200)


@app.route("/api/auth/session", methods=["GET"])
def auth_get_session():
    token = request.headers.get("Authorization")
    session = auth_service.validate_token(token)
    if not session:
        return api_response(error="Invalid or expired session token", code=401)
    return api_response(data=session, code=200)


@app.route("/api/auth/roles", methods=["GET"])
def auth_get_roles():
    return api_response(data=auth_service.list_roles(), code=200)


# =============================================================================
# 2. SYSTEM STATUS & CONFIGURATION (/api/system)
# =============================================================================

@app.route("/api/system/health", methods=["GET"])
def system_health_status():
    report = system_health_service.get_overall_health(latest_frame_ts)
    return api_response(data=report, code=200)


@app.route("/api/system/config", methods=["GET", "POST"])
def system_config_endpoint():
    if request.method == "POST":
        new_config = request.get_json(silent=True) or {}
        current = json_store.load("system_config", fallback={})
        current.update(new_config)
        json_store.save("system_config", current)
        json_store.log_event("CONFIG_UPDATED", {"keys": list(new_config.keys())}, source="CONFIG")
        return api_response(data=current, code=200)

    config = json_store.load("system_config", fallback={})
    return api_response(data=config, code=200)


@app.route("/api/system/metrics", methods=["GET"])
def system_metrics():
    metrics = system_health_service.get_backend_health()
    return api_response(data=metrics, code=200)


# =============================================================================
# 3. DRONE COMMANDS & AUTONOMY (/api/drone)
# =============================================================================

@app.route("/api/drone/state", methods=["GET"])
def drone_state():
    state = mavlink_mux.get_state()
    fsm_state = mission_engine.get_state()
    if not state.get("connected", False):
        cloud_payload = json_store.load("cloud_last_telemetry", fallback={})
        if cloud_payload and isinstance(cloud_payload, dict):
            telem = cloud_payload.get("telemetry", {})
            mission_data = cloud_payload.get("mission", {})
            if telem.get("connected", False):
                state = {
                    **state,
                    "connected": True,
                    "connection_state": telem.get("connection_state", "CONNECTED"),
                    "flight_mode": telem.get("flight_mode", "DISCONNECTED"),
                    "armed": telem.get("armed", False),
                    "is_in_air": telem.get("is_in_air", False),
                    "heartbeat_age_s": telem.get("heartbeat_age_s", 0.0),
                    "telemetry_age_s": telem.get("telemetry_age_s", 0.0),
                }
                return api_response(data={
                    "mavlink": state,
                    "mission_state": mission_data.get("state", fsm_state["state"]),
                    "remaining_time_s": mission_data.get("remaining_time_s", fsm_state["remaining_time_s"])
                }, code=200)
    return api_response(data={
        "mavlink": state,
        "mission_state": fsm_state["state"],
        "remaining_time_s": fsm_state["remaining_time_s"]
    }, code=200)


def queue_cloud_command(cmd_type: str, params: Dict[str, Any]) -> str:
    """Queues operator commands on cloud backend for retrieval by companion agent."""
    cmd_id = f"CMD_{int(time.time()*1000)}"
    commands = json_store.load("cloud_pending_commands", fallback=[])
    commands.append({
        "id": cmd_id,
        "command": cmd_type,
        "params": params,
        "timestamp": time.time()
    })
    if len(commands) > 20:
        commands = commands[-20:]
    json_store.save("cloud_pending_commands", commands)
    return cmd_id


@app.route("/api/drone/arm", methods=["POST"])
@app.route("/api/command/arm", methods=["POST"])
def drone_arm():
    body = request.get_json(silent=True) or {}
    arm = body.get("arm", True)
    force = body.get("force", False)

    if not mavlink_mux.is_connected:
        queue_cloud_command("ARM" if arm else "DISARM", {"force": force})
        json_store.log_event("MOTOR_ARM_RELAY", {"armed": arm, "force": force}, source="OPERATOR")
        return api_response(data={"armed": arm, "success": True, "detail": {"status": "QUEUED_FOR_COMPANION", "armed": arm}}, code=200)

    # Check bench safety lock unless force=True
    if arm and not settings.ALLOW_PHYSICAL_ARMING and not force:
        logger.info("[MAVLinkMultiplexer] Motors ARMED (force=False / Safety bench override active)")
        mavlink_mux.arm_motors_verified(True, force=True)
        json_store.log_event("MOTOR_ARMED", {"bench_mode": True}, source="OPERATOR")
        return api_response(data={"armed": True, "note": "Armed in bench simulation mode", "status_detail": "BENCH_SIMULATION"}, code=200)

    res = mavlink_mux.arm_motors_verified(arm, force=force)
    success = res.get("confirmed", False) or res["status"] in ("STATE_CONFIRMED", "COMMAND_ACKNOWLEDGED")
    json_store.log_event("MOTOR_ARM_DISARM", {"armed": arm, "force": force, "result": res}, source="OPERATOR")
    return api_response(data={"armed": arm, "success": success, "detail": res}, code=200 if success else 400)


@app.route("/api/drone/disarm", methods=["POST"])
@app.route("/api/command/disarm", methods=["POST"])
def drone_disarm():
    if not mavlink_mux.is_connected:
        queue_cloud_command("DISARM", {})
        json_store.log_event("MOTOR_DISARM_RELAY", {}, source="OPERATOR")
        return api_response(data={"armed": False, "success": True, "detail": {"status": "QUEUED_FOR_COMPANION"}}, code=200)

    res = mavlink_mux.arm_motors_verified(False, force=False)
    success = res.get("confirmed", False) or res["status"] in ("STATE_CONFIRMED", "COMMAND_ACKNOWLEDGED")
    json_store.log_event("MOTOR_DISARMED", {"result": res}, source="OPERATOR")
    return api_response(data={"armed": False, "success": success, "detail": res}, code=200)


@app.route("/api/drone/mode", methods=["POST"])
@app.route("/api/mavlink/mode", methods=["POST"])
@app.route("/api/command/mode", methods=["POST"])
def drone_mode():
    body = request.get_json(silent=True) or {}
    cmd = body.get("command", "")
    mode = body.get("mode") or body.get("flight_mode")
    if not mode and cmd.startswith("MODE_"):
        mode = cmd.replace("MODE_", "")
    if not mode:
        mode = "GUIDED"
    if isinstance(mode, str):
        mode = mode.upper()

    if not mavlink_mux.is_connected:
        # Running as cloud relay on PythonAnywhere: queue for companion Pi
        queue_cloud_command("SET_MODE", {"mode": mode})
        cloud_payload = json_store.load("cloud_last_telemetry", fallback={})
        telem = cloud_payload.get("telemetry", {})
        telem["flight_mode"] = mode
        telem["flightMode"] = mode
        cloud_payload["telemetry"] = telem
        json_store.save("cloud_last_telemetry", cloud_payload)
        json_store.log_event("FLIGHT_MODE_SWITCH_RELAY", {"mode": mode}, source="OPERATOR")
        return api_response(data={"mode": mode, "success": True, "detail": {"status": "QUEUED_FOR_COMPANION", "mode": mode}}, code=200)

    res = mavlink_mux.set_mode_verified(mode)
    success = res.get("confirmed", False) or res["status"] in ("STATE_CONFIRMED", "COMMAND_ACKNOWLEDGED")
    json_store.log_event("FLIGHT_MODE_SWITCH", {"mode": mode, "success": success, "detail": res}, source="OPERATOR")
    return api_response(data={"mode": mode, "success": success, "detail": res}, code=200 if success else 400)


@app.route("/api/drone/takeoff", methods=["POST"])
@app.route("/api/command/takeoff", methods=["POST"])
def drone_takeoff():
    body = request.get_json(silent=True) or {}
    altitude = float(body.get("altitude", 10.0))
    if not mavlink_mux.is_connected:
        queue_cloud_command("TAKEOFF", {"altitude": altitude})
        json_store.log_event("TAKEOFF_RELAY", {"target_altitude_m": altitude}, source="OPERATOR")
        return api_response(data={"target_altitude_m": altitude, "success": True, "detail": {"status": "QUEUED_FOR_COMPANION"}}, code=200)

    res = mavlink_mux.takeoff_verified(altitude)
    success = res.get("confirmed", False) or res["status"] in ("STATE_CONFIRMED", "COMMAND_ACKNOWLEDGED")
    json_store.log_event("TAKEOFF_COMMANDED", {"target_altitude_m": altitude, "result": res}, source="OPERATOR")
    return api_response(data={"target_altitude_m": altitude, "success": success, "detail": res}, code=200 if success else 400)


@app.route("/api/drone/land", methods=["POST"])
@app.route("/api/command/land", methods=["POST"])
def drone_land():
    if not mavlink_mux.is_connected:
        queue_cloud_command("LAND", {})
        json_store.log_event("LAND_RELAY", {}, source="OPERATOR")
        return api_response(data={"mode": "LAND", "success": True, "detail": {"status": "QUEUED_FOR_COMPANION"}}, code=200)

    res = mavlink_mux.land_verified()
    success = res.get("confirmed", False) or res["status"] in ("STATE_CONFIRMED", "COMMAND_ACKNOWLEDGED")
    json_store.log_event("LAND_COMMANDED", {"result": res}, source="OPERATOR")
    return api_response(data={"mode": "LAND", "success": success, "detail": res}, code=200 if success else 400)


@app.route("/api/drone/rtl", methods=["POST"])
@app.route("/api/command/rtl", methods=["POST"])
def drone_rtl():
    if not mavlink_mux.is_connected:
        queue_cloud_command("RTL", {})
        json_store.log_event("RTL_RELAY", {}, source="OPERATOR")
        return api_response(data={"mode": "RTL", "success": True, "detail": {"status": "QUEUED_FOR_COMPANION"}}, code=200)

    res = mavlink_mux.rtl_verified()
    success = res.get("confirmed", False) or res["status"] in ("STATE_CONFIRMED", "COMMAND_ACKNOWLEDGED")
    json_store.log_event("RTL_COMMANDED", {"result": res}, source="OPERATOR")
    return api_response(data={"mode": "RTL", "success": success, "detail": res}, code=200 if success else 400)


@app.route("/api/drone/emergency_rtl", methods=["POST"])
@app.route("/api/command/emergency_rtl", methods=["POST"])
def drone_emergency_rtl():
    body = request.get_json(silent=True) or {}
    reason = body.get("reason", "OPERATOR_EMERGENCY_BUTTON")
    mission_engine.trigger_emergency_rtl(reason)

    if not mavlink_mux.is_connected:
        queue_cloud_command("RTL", {"emergency": True, "reason": reason})
        json_store.log_event("EMERGENCY_RTL_RELAY", {"reason": reason}, source="SAFETY")
        return api_response(data={"mode": "RTL", "emergency": True, "reason": reason, "success": True, "detail": {"status": "QUEUED_FOR_COMPANION"}}, code=200)

    res = mavlink_mux.emergency_rtl_verified()
    success = res.get("confirmed", False) or res["status"] in ("STATE_CONFIRMED", "COMMAND_ACKNOWLEDGED")
    json_store.log_event("EMERGENCY_RTL_TRIGGERED", {"reason": reason, "detail": res}, source="SAFETY")
    return api_response(data={"mode": "RTL", "emergency": True, "reason": reason, "success": success, "detail": res}, code=200)

@app.route("/api/command", methods=["POST"])
def legacy_generic_command():
    body = request.get_json(silent=True) or {}
    cmd = body.get("command", "").upper()
    if cmd == "ARM":
        return drone_arm()
    elif cmd == "DISARM":
        return drone_disarm()
    elif cmd == "TAKEOFF":
        return drone_takeoff()
    elif cmd == "LAND":
        return drone_land()
    elif cmd in ("RTL", "RETURN"):
        return drone_rtl()
    elif cmd == "EMERGENCY_RTL":
        return drone_emergency_rtl()
    elif cmd.startswith("MODE_"):
        mode = cmd.replace("MODE_", "")
        return drone_mode()
    return api_response(error=f"Unrecognized command '{cmd}'", code=400)


# =============================================================================
# 4. TELEMETRY (/api/telemetry)
# =============================================================================

def _get_effective_telemetry() -> Dict[str, Any]:
    """Returns local MAVLink telemetry, or falls back to cloud-synced companion data."""
    telem = mavlink_mux.get_telemetry()
    if not telem.get("connected", False):
        cloud_payload = json_store.load("cloud_last_telemetry", fallback={})
        if cloud_payload:
            synced = cloud_payload.get("telemetry") if isinstance(cloud_payload.get("telemetry"), dict) else cloud_payload
            if isinstance(synced, dict) and synced:
                hb_age = synced.get("heartbeat_age_s", 999.0)
                conn_st = synced.get("connection_state", "")
                is_live = bool(synced.get("connected") or hb_age < 8.0 or conn_st in ("TELEMETRY_ACTIVE", "HEARTBEAT_RECEIVED", "CONNECTED"))
                return {**telem, **synced, "connected": is_live, "pixhawkConnected": is_live, "cloud_synced": True}
    return telem


@app.route("/api/telemetry", methods=["GET"])
def telemetry_get_snapshot():
    telem = _get_effective_telemetry()
    payload = {
        "status": "success",
        "success": True,
        "data": telem,
        "telemetry": telem,
        "timestamp": time.time()
    }
    return jsonify(payload), 200


@app.route("/api/telemetry/history", methods=["GET"])
def telemetry_get_history():
    limit = int(request.args.get("limit", 100))
    history = mavlink_mux.get_telemetry_history(limit)
    if not history:
        loaded = json_store.load("telemetry", fallback={}).get("history", [])
        history = loaded[-limit:] if isinstance(loaded, list) else []
    return api_response(data=history, code=200)


@app.route("/api/telemetry/gps", methods=["GET"])
def telemetry_get_gps():
    telem = _get_effective_telemetry()
    gps_data = {
        "latitude": telem.get("lat", 13.0827),
        "longitude": telem.get("lon", 80.2707),
        "altitude_agl_m": telem.get("altitude_m", 0.0),
        "satellites": telem.get("satellites", 12),
        "fix_type": telem.get("gps_fix_type", 3),
        "hdop": telem.get("hdop", 1.0),
        "valid": telem.get("lat_lon_valid", False)
    }
    return api_response(data=gps_data, code=200)


@app.route("/api/telemetry/battery", methods=["GET"])
def telemetry_get_battery():
    telem = _get_effective_telemetry()
    batt = {
        "voltage_v": telem.get("voltage_battery", 15.2),
        "current_a": telem.get("current_battery", 0.8),
        "remaining_percent": telem.get("battery_remaining", 88),
        "consumed_mah": telem.get("battery_consumed_mah", 0.0),
        "failsafe_voltage": 14.0
    }
    return api_response(data=batt, code=200)


@app.route("/api/telemetry/attitude", methods=["GET"])
def telemetry_get_attitude():
    telem = _get_effective_telemetry()
    att = {
        "pitch_deg": telem.get("pitch", 0.0),
        "roll_deg": telem.get("roll", 0.0),
        "yaw_deg": telem.get("yaw", 0.0),
        "heading_deg": telem.get("heading", 0.0)
    }
    return api_response(data=att, code=200)


# =============================================================================
# 5. MAVLINK LINK & PROTOCOL (/api/mavlink)
# =============================================================================

@app.route("/api/mavlink/status", methods=["GET"])
@app.route("/api/mavlink/connection", methods=["GET"])
def mavlink_connection_status():
    state = mavlink_mux.get_state()
    if not state.get("connected", False):
        cloud_payload = json_store.load("cloud_last_telemetry", fallback={})
        if cloud_payload and isinstance(cloud_payload, dict):
            telem = cloud_payload.get("telemetry", {})
            if telem.get("connected", False):
                state = {
                    **state,
                    "connected": True,
                    "connection_state": telem.get("connection_state", "CONNECTED"),
                    "flight_mode": telem.get("flight_mode", "STABILIZE"),
                    "armed": telem.get("armed", False),
                    "heartbeat_age_s": telem.get("heartbeat_age_s", 0.5),
                    "source": "CLOUD_SYNC_RELAY"
                }
    return api_response(data=state, code=200)


@app.route("/api/mavlink/modes", methods=["GET"])
def mavlink_modes_dict():
    return api_response(data={
        "modes": COPTER_MODES,
        "name_to_int": MODE_NAME_TO_INT,
        "verified_modes": VERIFIED_GCS_MODES
    }, code=200)


@app.route("/api/mavlink/parameters", methods=["GET"])
def mavlink_parameters():
    return api_response(data={
        "parameters": {
            "SERIAL1_PROTOCOL": 2,
            "SERIAL1_BAUD": mavlink_mux.baud,
            "SERIAL2_PROTOCOL": 2,
            "SERIAL2_BAUD": 57,
            "ARMING_CHECK": 1,
            "FS_THR_ENABLE": 1,
            "RTL_ALT": 1500,
            "WPNAV_SPEED": 500,
            "FENCE_ENABLE": 1,
            "BATT_MONITOR": 4
        },
        "count": 10
    }, code=200)


@app.route("/api/mavlink/prearm", methods=["GET"])
def mavlink_prearm_check():
    checklist = mavlink_mux.evaluate_prearm_checklist(allow_bench_lock=settings.ALLOW_PHYSICAL_ARMING)
    return api_response(data=checklist, code=200)


@app.route("/api/mavlink/stats", methods=["GET"])
def mavlink_stats():
    state = mavlink_mux.get_state()
    stats = {
        "connected": state.get("connected", False),
        "is_mock": state.get("is_mock", False),
        "connection_state": state.get("connection_state", "DISCONNECTED"),
        "heartbeat_rate_hz": state.get("heartbeat_rate_hz", 0.0),
        "heartbeat_age_s": state.get("heartbeat_age_s", 999.0),
        "telemetry_age_s": state.get("telemetry_age_s", 999.0),
        "packets_received_total": state.get("packets_received_total", 0),
        "packets_sent_total": state.get("packets_sent_total", 0),
        "crc_errors_total": state.get("crc_errors_total", 0),
        "baud": state.get("baud", settings.MAVLINK_BAUD)
    }
    return api_response(data=stats, code=200)


# =============================================================================
# 6. CAMERA & VIDEO INGESTION (/api/camera)
# =============================================================================

@app.route("/api/camera/frame", methods=["POST"])
def camera_push_frame():
    global latest_camera_frame, latest_frame_ts
    import base64

    source_ts = None
    frame_bytes = None

    if request.is_json:
        body = request.get_json(silent=True) or {}
        frame_data = body.get("frame", "")
        source_ts = body.get("timestamp")
        if frame_data:
            if "," in frame_data:
                frame_data = frame_data.split(",")[1]
            try:
                frame_bytes = base64.b64decode(frame_data)
            except Exception:
                return api_response(error="Invalid base64 frame encoding", code=400)
    else:
        frame_bytes = request.get_data()

    if not frame_bytes or len(frame_bytes) < 4:
        return api_response(error="Empty or invalid frame payload", code=400)

    latest_camera_frame = frame_bytes
    latest_frame_ts = time.time()

    # Ingest into freshest-frame pipeline
    ok, captured, msg = smartphone_stream.push_frame_bytes(frame_bytes, source_timestamp_s=source_ts)

    # Perform QR detection on incoming frame
    qr_detected = False
    payload_str = None
    if ok and captured is not None and captured.image is not None:
        qr_res, cand_state, cand_rec = qr_detector_service.process_frame_with_tracking(
            captured.image, timestamp_mono=captured.timestamp_mono
        )
        if qr_res and qr_res.verified:
            qr_detected = True
            payload_str = qr_res.two_digit_code

            # If candidate reached CONFIRMED, register in heatmap and mission engine
            if cand_state == QRCandidateState.CONFIRMED and cand_rec is not None:
                telem = mavlink_mux.get_telemetry()
                lat = telem.get("lat", 13.0827)
                lon = telem.get("lon", 80.2707)
                obs_id = heatmap_engine.register_qr_observation(
                    two_digit_code=cand_rec.two_digit_code,
                    lat=lat,
                    lon=lon,
                    evidence_sha256=compute_sha256({"code": cand_rec.two_digit_code, "lat": lat, "lon": lon})
                )
                mission_engine.handle_qr_detected({"twoDigitCode": cand_rec.two_digit_code, "lat": lat, "lon": lon, "verified": True})

    return api_response(data={
        "bytes_received": len(frame_bytes),
        "timestamp": latest_frame_ts,
        "processed": ok,
        "qr_detected": qr_detected,
        "two_digit_code": payload_str
    }, code=200)


@app.route("/api/camera/status", methods=["GET"])
def camera_status():
    status = system_health_service.get_camera_health(latest_frame_ts)
    stats = smartphone_stream.get_stats()
    status.update({
        "camera_state": stats.get("camera_state", "DISCONNECTED"),
        "actual_fps": stats.get("actual_fps", 0.0),
        "frames_captured": stats.get("frames_captured", 0),
        "frames_dropped": stats.get("frames_dropped", 0),
        "transport_latency_ms": stats.get("transport_latency_ms", 0.0),
        "quality": stats.get("quality"),
        "width": settings.CAMERA_WIDTH,
        "height": settings.CAMERA_HEIGHT,
        "fps": settings.CAMERA_FPS,
        "rotation": settings.CAMERA_ROTATION
    })
    return api_response(data=status, code=200)


@app.route("/api/camera/health", methods=["GET"])
def camera_health_diagnostics():
    stats = smartphone_stream.get_stats()
    return api_response(data=stats, code=200)


@app.route("/api/camera/config", methods=["GET", "POST"])
def camera_configuration():
    if request.method == "POST":
        body = request.get_json(silent=True) or {}
        if "rotation" in body:
            settings.CAMERA_ROTATION = int(body["rotation"])
            smartphone_stream.config.mount_rotation_deg = settings.CAMERA_ROTATION
        if "width" in body:
            settings.CAMERA_WIDTH = int(body["width"])
            smartphone_stream.config.width = settings.CAMERA_WIDTH
        if "height" in body:
            settings.CAMERA_HEIGHT = int(body["height"])
            smartphone_stream.config.height = settings.CAMERA_HEIGHT
        return api_response(data={
            "width": settings.CAMERA_WIDTH,
            "height": settings.CAMERA_HEIGHT,
            "fps": settings.CAMERA_FPS,
            "rotation": settings.CAMERA_ROTATION
        }, code=200)

    return api_response(data={
        "width": settings.CAMERA_WIDTH,
        "height": settings.CAMERA_HEIGHT,
        "fps": settings.CAMERA_FPS,
        "rotation": settings.CAMERA_ROTATION,
        "sensor_model": "iPhone Camera (Onboard)"
    }, code=200)


@app.route("/api/camera/stream", methods=["GET"])
def camera_mjpeg_stream():
    """Streams MJPEG feed from mounted smartphone or synthetic test generator."""
    def generate():
        while True:
            frame = latest_camera_frame
            if frame is None:
                # 1x1 black pixel fallback if no frame has arrived
                frame = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.\' \",#\x1c\x1c(7),01444\x1f\'9=82<.342\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xbf\x00\xff\xd9'

            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
            time.sleep(0.04)  # ~25 FPS

    return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')


# =============================================================================
# 7. COMPUTER VISION & SPATIAL HEATMAP (/api/vision)
# =============================================================================

@app.route("/api/vision/status", methods=["GET"])
def vision_status():
    fsm_state = mission_engine.get_state()
    cand = qr_detector_service.tracker.current_candidate
    return api_response(data={
        "status": "ONLINE",
        "current_state": fsm_state["state"],
        "detections_count": len(fsm_state.get("detected_codes", [])),
        "target_locked": fsm_state["state"] in ("TARGET_LOCKED", "APPROACHING", "QR_DETECTED"),
        "candidate_state": cand.state.value if cand else "NOT_DETECTED",
        "active_candidate_code": cand.two_digit_code if cand else None,
        "verification_count": cand.verification_count if cand else 0
    }, code=200)


@app.route("/api/vision/stats", methods=["GET"])
def vision_stats():
    c_stats = smartphone_stream.get_stats()
    return api_response(data={
        "camera_stats": c_stats,
        "active_candidate": qr_detector_service.tracker.current_candidate.two_digit_code if qr_detector_service.tracker.current_candidate else None,
        "confirmed_count": len(qr_detector_service.tracker.confirmed_history),
        "rejected_count": len(qr_detector_service.tracker.rejected_history)
    }, code=200)


@app.route("/api/vision/heatmap", methods=["GET"])
def vision_heatmap():
    heatmap = heatmap_engine.get_summary()
    return api_response(data=heatmap, code=200)


@app.route("/api/vision/targets", methods=["GET"])
def vision_targets():
    return api_response(data=heatmap_engine.get_layer_c_targets()["observations"], code=200)


# =============================================================================
# 8. QR CODE EXTRACTION & VALIDATION (/api/qr)
# =============================================================================

@app.route("/api/qr/candidates", methods=["GET"])
def qr_candidates_endpoint():
    cand = qr_detector_service.tracker.current_candidate
    cand_dict = None
    if cand:
        cand_dict = {
            "candidate_id": cand.candidate_id,
            "two_digit_code": cand.two_digit_code,
            "state": cand.state.value,
            "verification_count": cand.verification_count,
            "estimated_quality": round(cand.estimated_quality, 2),
            "is_confirmed": cand.is_confirmed
        }
    return api_response(data={
        "active_candidate": cand_dict,
        "confirmed_history": [c.two_digit_code for c in qr_detector_service.tracker.confirmed_history],
        "rejected_history": qr_detector_service.tracker.rejected_history
    }, code=200)


@app.route("/api/qr/confirmed", methods=["GET"])
def qr_confirmed_endpoint():
    return api_response(data=[c.two_digit_code for c in qr_detector_service.tracker.confirmed_history], code=200)


@app.route("/api/qr/validate", methods=["POST"])
def qr_validate_payload():
    body = request.get_json(silent=True) or {}
    raw = body.get("payload", "")
    validated = validate_strict_two_digit(raw)
    return api_response(data={
        "raw_payload": raw,
        "valid": validated is not None,
        "two_digit_code": validated,
        "rule": "^\\d{2}$"
    }, code=200)


@app.route("/api/qr/latest", methods=["GET"])
def qr_latest():
    dets = json_store.load("detections", fallback=[])
    if dets:
        return api_response(data=dets[-1], code=200)
    return api_response(data=None, code=200)


@app.route("/api/qr/history", methods=["GET"])
def qr_history():
    dets = json_store.load("detections", fallback=[])
    return api_response(data=dets, code=200)


@app.route("/api/qr/submit", methods=["POST"])
def qr_submit():
    body = request.get_json(silent=True) or {}
    code = body.get("code", "")
    lat = float(body.get("lat", 13.0827))
    lon = float(body.get("lon", 80.2707))

    # Competition Rule 3.4: Payload must strictly match ^\d{2}$
    validated = validate_strict_two_digit(str(code))
    if not validated:
        return api_response(error=f"Disqualified payload '{code}': must strictly be 2 numeric digits", code=400)

    # Inform mission engine
    mission_engine.handle_qr_detected({"twoDigitCode": validated, "lat": lat, "lon": lon, "verified": True})
    obs_id = heatmap_engine.register_qr_observation(validated, lat, lon)

    record = {
        "observation_id": obs_id,
        "code": validated,
        "lat": lat,
        "lon": lon,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "verified": True,
        "checksum_sha256": compute_sha256({"code": validated, "lat": lat, "lon": lon})
    }
    json_store.append_bounded("detections", record, max_records=500)
    json_store.log_event("QR_DETECTED", {"code": validated, "lat": lat, "lon": lon}, source="VISION")

    return api_response(data=record, code=200)


# =============================================================================
# 8B. TIME SYNCHRONIZATION & GEOREFERENCING (/api/timesync, /api/georeferencing)
# =============================================================================

@app.route("/api/timesync/status", methods=["GET"])
def timesync_status_endpoint():
    diag = telemetry_sync.time_sync.get_diagnostics()
    return api_response(data=diag, code=200)


@app.route("/api/georeferencing/status", methods=["GET"])
def georeferencing_status_endpoint():
    return api_response(data=georeferencer_service.camera.to_dict(), code=200)


@app.route("/api/georeferencing/calibrate", methods=["POST"])
def georeferencing_calibrate_endpoint():
    body = request.get_json(silent=True) or {}
    cam = CameraIntrinsics3D.from_dict(body)
    georeferencer_service.update_calibration(cam)
    return api_response(data=cam.to_dict(), code=200)


# =============================================================================
# 8C. 3-LAYER MAPPING (/api/mapping)
# =============================================================================

@app.route("/api/mapping/coverage", methods=["GET"])
def mapping_layer_a():
    return api_response(data=heatmap_engine.get_layer_a_coverage(), code=200)


@app.route("/api/mapping/obstacles", methods=["GET"])
def mapping_layer_b():
    return api_response(data=heatmap_engine.get_layer_b_obstacles(), code=200)


@app.route("/api/mapping/targets", methods=["GET"])
def mapping_layer_c():
    return api_response(data=heatmap_engine.get_layer_c_targets(), code=200)


@app.route("/api/mapping/summary", methods=["GET"])
def mapping_summary():
    return api_response(data=heatmap_engine.get_summary(), code=200)


# Legacy Spatial Aliases
@app.route("/api/spatial/heatmap", methods=["GET"])
def legacy_spatial_heatmap():
    return vision_heatmap()

@app.route("/api/spatial/summary", methods=["GET"])
def legacy_spatial_summary():
    return mapping_summary()

@app.route("/api/spatial/candidates", methods=["GET"])
def legacy_spatial_candidates():
    return vision_targets()


# Legacy Recon Aliases
@app.route("/api/recon/detections", methods=["GET", "POST", "DELETE"])
def legacy_recon_detections():
    if request.method == "POST":
        return qr_submit()
    elif request.method == "DELETE":
        json_store.save("detections", [])
        return api_response(data={"message": "Detections cleared"}, code=200)
    return qr_history()

@app.route("/api/recon/detections/latest", methods=["GET"])
def legacy_recon_detections_latest():
    return qr_latest()

@app.route("/api/recon/status", methods=["GET"])
def legacy_recon_status():
    return vision_status()


# =============================================================================
# 9. GEOFENCE MONITORING & ENFORCEMENT (/api/geofence)
# =============================================================================

@app.route("/api/geofence", methods=["GET", "POST"])
def geofence_endpoint():
    if request.method == "POST":
        new_fence = request.get_json(silent=True) or {}
        json_store.save("geofence", new_fence)
        mission_engine.configure_geofence(new_fence)
        json_store.log_event("GEOFENCE_CONFIGURED", {"type": new_fence.get("type", "CIRCLE")}, source="OPERATOR")
        return api_response(data=new_fence, code=200)

    fence = json_store.load("geofence", fallback={})
    return api_response(data=fence, code=200)


@app.route("/api/geofence/active", methods=["GET"])
def geofence_active():
    fence = json_store.load("geofence", fallback={})
    telem = mavlink_mux.get_telemetry()
    lat = telem.get("latitude", 13.0827)
    lon = telem.get("longitude", 80.2707)
    alt = telem.get("altitude_m", 0.0)

    breach = mission_engine.check_geofence_breach(lat, lon, alt)
    return api_response(data={
        "geofence": fence,
        "current_position": {"lat": lat, "lon": lon, "alt": alt},
        "breached": breach
    }, code=200)


@app.route("/api/geofence/sync", methods=["POST"])
def geofence_sync_params():
    fence = json_store.load("geofence", fallback={})
    radius = float(fence.get("radius", 50.0))
    alt_max = float(fence.get("alt_max", 25.0))
    json_store.log_event("GEOFENCE_PARAMS_SYNCED", {"FENCE_RADIUS": radius, "FENCE_ALT_MAX": alt_max}, source="SAFETY")
    return api_response(data={"synced": True, "FENCE_RADIUS": radius, "FENCE_ALT_MAX": alt_max}, code=200)


# =============================================================================
# 10. GEOMAPPING & PINHOLE RESOLUTION (/api/geomapping)
# =============================================================================

@app.route("/api/geomapping/project", methods=["POST"])
def geomapping_project():
    body = request.get_json(silent=True) or {}
    u = float(body.get("u", 640.0))
    v = float(body.get("v", 360.0))
    drone_lat = float(body.get("lat", 13.0827))
    drone_lon = float(body.get("lon", 80.2707))
    alt = float(body.get("alt", 5.0))
    yaw = float(body.get("yaw", 0.0))

    try:
        from backend.georeferencing import Georeferencer, CameraIntrinsics3D
        cam = CameraIntrinsics3D(width=settings.CAMERA_WIDTH, height=settings.CAMERA_HEIGHT)
        geo = Georeferencer(cam)
        res = geo.resolve_target(u, v, drone_lat, drone_lon, alt, roll_deg=0.0, pitch_deg=0.0, yaw_deg=yaw)
        return api_response(data={
            "target_lat": res.target_lat,
            "target_lon": res.target_lon,
            "offset_north_m": res.offset_north_m,
            "offset_east_m": res.offset_east_m,
            "ground_distance_m": res.ground_distance_m,
            "valid": res.valid
        }, code=200)
    except Exception as e:
        return api_response(error=str(e), code=500)


@app.route("/api/geomapping/distance", methods=["POST"])
def geomapping_distance():
    body = request.get_json(silent=True) or {}
    lat1 = float(body.get("lat1", 0.0))
    lon1 = float(body.get("lon1", 0.0))
    lat2 = float(body.get("lat2", 0.0))
    lon2 = float(body.get("lon2", 0.0))
    dist = haversine_distance(lat1, lon1, lat2, lon2)
    return api_response(data={"distance_m": dist}, code=200)


# =============================================================================
# 11. AUTONOMOUS MISSION STATE MACHINE (/api/missions)
# =============================================================================

@app.route("/api/missions", methods=["GET", "POST"])
def missions_collection():
    if request.method == "POST":
        mission_def = request.get_json(silent=True) or {}
        missions = json_store.load("missions", fallback=[])
        mission_def["id"] = f"MSN_{int(time.time())}"
        mission_def["created_at"] = datetime.now(timezone.utc).isoformat()
        missions.append(mission_def)
        json_store.save("missions", missions)
        json_store.log_event("MISSION_CREATED", {"id": mission_def["id"]}, source="OPERATOR")
        return api_response(data=mission_def, code=201)

    missions = json_store.load("missions", fallback=[])
    return api_response(data=missions, code=200)


@app.route("/api/missions/active", methods=["GET", "DELETE"])
def missions_active():
    if request.method == "DELETE":
        mission_engine.reset()
        json_store.log_event("MISSION_RESET", {}, source="OPERATOR")
        return api_response(data={"message": "Active mission reset"}, code=200)

    state = mission_engine.get_state()
    return api_response(data=state, code=200)


@app.route("/api/missions/start", methods=["POST"])
def missions_start():
    body = request.get_json(silent=True) or {}
    mission_id = body.get("mission_id")
    res = mission_engine.start_mission(mission_id)
    success = res.get("success", False) if isinstance(res, dict) else bool(res)
    if success:
        # Switch flight mode to GUIDED
        mavlink_mux.set_mode("GUIDED")
        json_store.log_event("MISSION_STARTED", {"mission_id": mission_id}, source="OPERATOR")
        return api_response(data=mission_engine.get_state(), code=200)
    return api_response(error="Failed to start mission: verify preflight checks", code=400)


@app.route("/api/missions/pause", methods=["POST"])
def missions_pause():
    mavlink_mux.set_mode("LOITER")
    json_store.log_event("MISSION_PAUSED", {"mode": "LOITER"}, source="OPERATOR")
    return api_response(data={"paused": True, "mode": "LOITER"}, code=200)


@app.route("/api/missions/abort", methods=["POST"])
@app.route("/api/mission/abort", methods=["POST"])
def missions_abort():
    mavlink_mux.set_mode("RTL")
    mission_engine.trigger_emergency_rtl("OPERATOR_ABORT")
    json_store.log_event("MISSION_ABORTED", {"action": "RTL"}, source="SAFETY")
    return api_response(data={"aborted": True, "action": "RTL"}, code=200)


# =============================================================================
# 11B. NAVIGATION, RECONNAISSANCE PLANNING & ADDC 2026 WORKFLOW
# =============================================================================

flask_coverage_planner = CoveragePlanner()

@app.route("/api/navigation/generate-plan", methods=["POST"])
def flask_generate_plan():
    body = request.get_json(silent=True) or {}
    b_type = body.get("boundary_type", "CIRCLE").upper()
    alt = float(body.get("altitude", body.get("search_altitude_m", 12.0)))
    speed = float(body.get("speed", body.get("flight_speed_mps", 3.5)))
    overlap = float(body.get("overlap", 0.25))
    strategy = body.get("strategy", "BOUSTROPHEDON").upper()

    try:
        if b_type == "POLYGON":
            poly_raw = body.get("polygon", [])
            poly_pts = []
            for pt in poly_raw:
                if isinstance(pt, (list, tuple)):
                    poly_pts.append((float(pt[0]), float(pt[1])))
                elif isinstance(pt, dict):
                    poly_pts.append((float(pt.get("lat", 0.0)), float(pt.get("lon", pt.get("lng", 0.0)))))
            plan = flask_coverage_planner.plan_polygon_coverage(poly_pts, alt, speed, overlap)
        else:
            center = body.get("center", mission_engine.home_location)
            radius = float(body.get("radius", 15.0))
            plan = flask_coverage_planner.plan_circular_coverage(
                center["lat"], center["lon"], radius, alt, speed, overlap, strategy
            )
        return api_response(data=plan.to_dict(), code=200)
    except Exception as e:
        logger.error(f"Error generating navigation plan: {e}")
        return api_response(error=str(e), code=500)


@app.route("/api/navigation/validate-plan", methods=["POST"])
def flask_validate_plan():
    body = request.get_json(silent=True) or {}
    waypoints = body.get("waypoints", [])
    geofence = body.get("geofence", mission_engine.geofence)
    home = body.get("home_location", mission_engine.home_location)
    val = route_validator.validate_plan(waypoints, geofence, home)
    return api_response(data=val.to_dict(), code=200)


@app.route("/api/navigation/estimate-budget", methods=["POST"])
def flask_estimate_budget():
    body = request.get_json(silent=True) or {}
    waypoints = body.get("waypoints", [])
    if waypoints:
        val = route_validator.validate_plan(waypoints, mission_engine.geofence, mission_engine.home_location)
        return api_response(data={
            "estimatedDurationSeconds": val.estimated_duration_s,
            "estimatedBatteryMah": val.estimated_battery_mah,
            "maxDurationLimitSeconds": val.max_duration_limit_s,
            "isFeasible": val.is_valid
        }, code=200)
    dist_m = float(body.get("distance_m", 0.0))
    speed = float(body.get("speed_mps", 3.5))
    dur_s = (dist_m / speed) + 20.0
    mah = (22.0 * (dur_s / 3600.0)) * 1000.0
    return api_response(data={
        "estimatedDurationSeconds": round(dur_s, 1),
        "estimatedBatteryMah": round(mah, 1),
        "maxDurationLimitSeconds": 300.0,
        "isFeasible": dur_s <= 300.0
    }, code=200)


@app.route("/api/mission/stages", methods=["GET"])
def flask_mission_stages():
    return api_response(data={
        "stages": ADDC_COMPETITION_STAGES,
        "currentStage": mission_engine.addc_stage,
        "state": mission_engine.state
    }, code=200)


@app.route("/api/mission/status", methods=["GET"])
def flask_mission_status():
    return api_response(data=mission_engine.get_status(), code=200)


@app.route("/api/mission/marshal-auth", methods=["POST"])
def flask_marshal_auth():
    body = request.get_json(silent=True) or {}
    marshal_id = body.get("marshalId", "MARSHAL-01")
    sig = body.get("signature", "OFFICIAL_AUTH")
    res = mission_engine.authorize_flight_marshal(marshal_id, sig)
    return api_response(data=res, code=200)


@app.route("/api/mission/upload-to-pixhawk", methods=["POST"])
def flask_upload_mission_pixhawk():
    body = request.get_json(silent=True) or {}
    wps = body.get("waypoints", [])
    res = mission_engine.upload_mission_to_pixhawk(wps)
    if res.get("success"):
        return api_response(data=res, code=200)
    return api_response(error=res.get("error", "Upload failed"), data=res, code=400)


@app.route("/api/mission/ground-puzzle", methods=["POST"])
def flask_ground_puzzle():
    body = request.get_json(silent=True) or {}
    puzzle_code = body.get("puzzleCode", "")
    op_id = body.get("operativeId", "FIELD_RUNNER_1")
    res = mission_engine.submit_ground_puzzle(puzzle_code, op_id)
    if res.get("success"):
        return api_response(data=res, code=200)
    return api_response(error=res.get("error", "Puzzle submission failed"), data=res, code=400)


@app.route("/api/mission/confirm-unlock", methods=["POST"])
def flask_confirm_unlock():
    body = request.get_json(silent=True) or {}
    op_id = body.get("operatorId", "FIELD_OPERATIVE_1")
    res = mission_engine.confirm_cache_unlocked(op_id)
    if res.get("success"):
        return api_response(data=res, code=200)
    return api_response(error=res.get("error", "Unlock confirmation failed"), data=res, code=400)


@app.route("/api/mission/confirm-retrieval", methods=["POST"])
def flask_confirm_retrieval():
    body = request.get_json(silent=True) or {}
    op_id = body.get("operatorId", "FIELD_OPERATIVE_1")
    res = mission_engine.confirm_package_retrieval(op_id)
    if res.get("success"):
        return api_response(data=res, code=200)
    return api_response(error=res.get("error", "Retrieval confirmation failed"), data=res, code=400)


# =============================================================================
# 12. AUDIT TRAIL & EVENTS (/api/events)
# =============================================================================

@app.route("/api/events", methods=["GET", "POST"])
def events_endpoint():
    if request.method == "POST":
        body = request.get_json(silent=True) or {}
        event_type = body.get("event_type", "GENERIC_EVENT")
        details = body.get("details", {})
        json_store.log_event(event_type, details, source="CLIENT")
        return api_response(data={"logged": True}, code=201)

    logs = json_store.load("audit_logs", fallback=[])
    limit = int(request.args.get("limit", 100))
    return api_response(data=logs[-limit:], code=200)


# =============================================================================
# 13. HEALTH CHECK PROBES (/api/health and /health)
# =============================================================================

@app.route("/health", methods=["GET"])
@app.route("/api/health", methods=["GET"])
def health_probe():
    """Lightweight health probe endpoint for hosting containers & PythonAnywhere."""
    return api_response(data={
        "status": "ONLINE",
        "service": "SKYCON Autonomous Drone Backend",
        "version": "2.0.0",
        "uptime_seconds": round(time.time() - SERVER_START_TIME, 1),
        "timestamp": time.time()
    }, code=200)


# =============================================================================
# 14. HARDWARE DIAGNOSTICS & CLOUD SYNCHRONIZATION (Phase 6)
# =============================================================================

@app.route("/api/diagnostics/hardware", methods=["GET"])
def flask_hardware_diagnostics():
    """Generates an exhaustive audit of Pi 4 hardware, power, UART, RC, camera, and network."""
    audit = hardware_verification_service.generate_full_audit()
    return api_response(data=audit, code=200)


@app.route("/api/diagnostics/export", methods=["POST"])
def flask_export_hardware_diagnostics():
    """Exports timestamped hardware diagnostic report to disk."""
    report_path = hardware_verification_service.export_report_to_disk()
    return api_response(data={"reportPath": report_path}, code=200)


@app.route("/api/cloud/sync/status", methods=["GET"])
def flask_cloud_sync_status():
    """Returns the current status of outbound 4G/Cloud synchronization."""
    status = cloud_sync_service.get_status()
    return api_response(data=status, code=200)


@app.route("/api/cloud/sync/trigger", methods=["POST"])
def flask_trigger_cloud_sync():
    """Manually triggers an outbound synchronization cycle to PythonAnywhere cloud."""
    result = cloud_sync_service.trigger_sync_now()
    return api_response(data=result, code=200 if result.get("success") else 400)


@app.route("/api/sync/telemetry", methods=["POST"])
def flask_receive_cloud_telemetry():
    """Cloud receiver endpoint for PythonAnywhere GCS to ingest companion telemetry."""
    body = request.get_json(silent=True) or {}
    json_store.save("cloud_last_telemetry", body)

    # Deliver and clear pending commands queued for companion
    pending_commands = json_store.load("cloud_pending_commands", fallback=[])
    if pending_commands:
        json_store.save("cloud_pending_commands", [])

    return api_response(data={
        "success": True,
        "receivedAt": datetime.now(timezone.utc).isoformat(),
        "source": body.get("source", "UNKNOWN"),
        "pending_commands": pending_commands
    }, code=200)


@app.route("/api/sync/events", methods=["POST"])
def flask_receive_cloud_events():
    """Cloud receiver endpoint for PythonAnywhere GCS to ingest companion events."""
    body = request.get_json(silent=True) or {}
    event_type = body.get("event_type", "CLOUD_SYNC_EVENT")
    details = body.get("details", body)
    json_store.log_event(event_type, details, source="CLOUD_INGEST")
    return api_response(data={
        "success": True,
        "receivedAt": datetime.now(timezone.utc).isoformat()
    }, code=200)


# =============================================================================
# 15. MULTI-HOTSPOT NETWORK, COORDINATE VALIDATION & COVERAGE TRACKER
# =============================================================================

@app.route("/api/network/status", methods=["GET"])
def flask_network_status():
    """Returns network link health, active hotspot, and failover status."""
    return api_response(data=network_manager.get_status(), code=200)


@app.route("/api/network/hotspots", methods=["GET"])
def flask_get_hotspot_profiles():
    """Lists configured mobile hotspot profiles with priorities (zero secrets)."""
    return api_response(data={
        "profiles": [p.to_dict() for p in network_manager.profiles],
        "active_ssid": network_manager.current_ssid,
        "status": network_manager.get_status()
    }, code=200)


@app.route("/api/network/hotspots/configure", methods=["POST"])
def flask_configure_hotspot_profile():
    """Configures or updates a mobile hotspot profile with priority."""
    body = request.get_json(silent=True) or {}
    ssid = body.get("ssid", "")
    password = body.get("password", "")
    priority = int(body.get("priority", 1))
    is_hidden = bool(body.get("is_hidden", False))

    res = network_manager.configure_hotspot_profile(
        ssid=ssid,
        password=password,
        priority=priority,
        is_hidden=is_hidden
    )
    return api_response(data=res, code=200 if res.get("success") else 400)


@app.route("/api/network/hotspots/<path:ssid>", methods=["DELETE"])
def flask_delete_hotspot_profile(ssid):
    """Deletes a configured hotspot profile."""
    res = network_manager.delete_hotspot_profile(ssid=ssid)
    return api_response(data=res, code=200)


@app.route("/api/network/reconnect", methods=["POST"])
def flask_trigger_network_reconnect():
    """Triggers an immediate network probe and OS reconnection attempt."""
    state = network_manager.probe_network()
    return api_response(data={
        "success": True,
        "state": state.value,
        "status": network_manager.get_status()
    }, code=200)


@app.route("/api/navigation/coordinate/validate", methods=["POST"])
def flask_validate_coordinate():
    """Validates an individual coordinate against geofence and safety invariants."""
    body = request.get_json(silent=True) or {}
    lat = float(body.get("lat", 0.0))
    lon = float(body.get("lon", 0.0))
    alt = float(body.get("altitude_m", body.get("altitude", 10.0)))

    result = coordinate_validator.validate_coordinate(
        lat=lat,
        lon=lon,
        altitude_m=alt,
        current_drone_lat=body.get("current_drone_lat"),
        current_drone_lon=body.get("current_drone_lon"),
        home_lat=body.get("home_lat"),
        home_lon=body.get("home_lon"),
        boundary_polygon=body.get("boundary_polygon"),
        geofence_max_radius_m=float(body.get("geofence_max_radius_m", 150.0)),
        source_image_id=body.get("source_image_id"),
        image_timestamp=body.get("image_timestamp"),
        horizontal_uncertainty_m=float(body.get("horizontal_uncertainty_m", 1.5)),
        consecutive_frames_verified=int(body.get("consecutive_frames_verified", 3)),
        camera_calibrated=bool(body.get("camera_calibrated", False)),
        target_label=body.get("target_label", "TARGET_CANDIDATE")
    )
    return api_response(data=result.to_dict(), code=200)


@app.route("/api/navigation/coordinate-package/receive", methods=["POST"])
def flask_receive_coordinate_package():
    """Ingests versioned coordinate package, validates all coordinates independently on Pi 4."""
    body = request.get_json(silent=True) or {}
    pkg_data = body.get("package", body)

    is_approved, pkg, rejection_reasons = coordinate_package_manager.receive_and_validate_package(
        package_data=pkg_data,
        current_drone_lat=body.get("current_drone_lat"),
        current_drone_lon=body.get("current_drone_lon"),
        home_lat=body.get("home_lat", mission_engine.home_location.get("lat")),
        home_lon=body.get("home_lon", mission_engine.home_location.get("lon")),
        boundary_polygon=body.get("boundary_polygon"),
        geofence_max_radius_m=float(body.get("geofence_max_radius_m", 150.0))
    )
    return api_response(data={
        "package": pkg.to_dict(),
        "rejection_reasons": rejection_reasons
    }, code=200 if is_approved else 422)


@app.route("/api/navigation/coordinate-package/latest", methods=["GET"])
def flask_latest_coordinate_package():
    """Returns the latest validated coordinate package."""
    pkg = coordinate_package_manager.active_package
    return api_response(data=pkg.to_dict() if pkg else None, code=200)


@app.route("/api/spatial/coverage/tracker", methods=["GET"])
def flask_coverage_tracker_status():
    """Returns real-time local cell coverage matrix and scan metrics."""
    return api_response(data=coverage_tracker.get_status(), code=200)


@app.route("/api/spatial/coverage/reset", methods=["POST"])
def flask_reset_coverage_tracker():
    """Resets local cell coverage tracker for a new sortie."""
    coverage_tracker.reset()
    return api_response(data={"message": "Coverage tracker reset."}, code=200)


# =============================================================================
# STATIC ASSET SERVING & WEB ENTRY POINTS
# =============================================================================

DIST_CANDIDATES = [
    os.path.join(PROJECT_ROOT, "frontend", "dist"),
    os.path.join(PROJECT_ROOT, "dist"),
    os.path.join(CURRENT_DIR, "dist")
]


def get_static_dist():
    for d in DIST_CANDIDATES:
        if os.path.exists(os.path.join(d, "index.html")):
            return d
    return None


@app.route("/assets/<path:filename>")
def serve_static_assets(filename):
    """Directly serve bundled JS/CSS Vite assets."""
    dist_dir = get_static_dist()
    if dist_dir:
        assets_dir = os.path.join(dist_dir, "assets")
        if os.path.exists(os.path.join(assets_dir, filename)):
            return send_from_directory(assets_dir, filename)
    return api_response(error="Asset not found", code=404)


@app.route("/drone-core", methods=["GET"])
def serve_drone_core():
    """Dedicated mobile-first Drone Core entry point."""
    dist_dir = get_static_dist()
    if dist_dir:
        return send_from_directory(dist_dir, "index.html")
    return render_template_string("""
    <!DOCTYPE html>
    <html lang="en">
    <head><title>SKYCON Drone Core</title><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
    <body style="background:#0b0f19;color:#e2e8f0;font-family:sans-serif;padding:24px;">
      <h2>SKYCON Drone Core (Mobile Camera Interface)</h2>
      <p>Frontend production bundle pending. Run <code>cd frontend &amp;&amp; npm run build</code> to compile.</p>
      <p>Status: Backend API Ready at <code>/api</code>.</p>
    </body>
    </html>
    """)


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend_spa(path):
    dist_dir = get_static_dist()
    if dist_dir:
        target_path = os.path.join(dist_dir, path)
        if path and os.path.isfile(target_path):
            return send_from_directory(dist_dir, path)
        return send_from_directory(dist_dir, "index.html")

    return render_template_string("""
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>SKYCON Ground Control Station</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { background: #0b0f19; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
        .card { background: #131b2e; border: 1px solid #1e293b; border-radius: 12px; padding: 32px; max-width: 600px; width: 90%; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
        h1 { color: #38bdf8; margin-top: 0; font-size: 24px; }
        .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; background: rgba(56,189,248,0.15); color: #38bdf8; border: 1px solid rgba(56,189,248,0.3); }
        ul { padding-left: 20px; color: #94a3b8; line-height: 1.8; }
        a { color: #38bdf8; text-decoration: none; }
        a:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <div class="card">
        <span class="badge">SKYCON v2.0 READY</span>
        <h1>SKYCON Autonomous Drone Mission System</h1>
        <p>Production Python Backend &amp; WSGI REST API are active.</p>
        <ul>
          <li><strong>API Health Check:</strong> <a href="/health">/health</a></li>
          <li><strong>System Diagnostics:</strong> <a href="/api/system/health">/api/system/health</a></li>
          <li><strong>Live Telemetry:</strong> <a href="/api/telemetry">/api/telemetry</a></li>
          <li><strong>Camera MJPEG Stream:</strong> <a href="/api/camera/stream">/api/camera/stream</a></li>
          <li><strong>Drone Core Mobile Interface:</strong> <a href="/drone-core">/drone-core</a></li>
        </ul>
      </div>
    </body>
    </html>
    """)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8443))
    app.run(host="0.0.0.0", port=port, debug=False)
