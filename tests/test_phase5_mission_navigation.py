"""
=====================================================================================
SKYCON SYSTEM — PHASE 5 VERIFICATION SUITE
AUTONOMOUS MISSION PLANNING, NAVIGATION, SCAN-PATH GENERATION & FLIGHT EXECUTION
=====================================================================================
Target Autopilot: Pixhawk 2.4.8 (ArduCopter 4.x) | Companion: Raspberry Pi 4 Model B
Camera: Mounted iPhone | RC: MultiLink V1.0 (2.4 GHz)

Tests:
  01. Sensor Footprint & Effective Lane Spacing (Optical Pinhole Math)
  02. Boustrophedon Sweep Generation for Circular Boundaries
  03. Boustrophedon Sweep Generation for Polygon Boundaries
  04. Route Validator Boundary Enclosure & Altitude Ceiling Verification
  05. Route Validator Kinematics, Battery & 300s ADDC Competition Budget
  06. MAVLink Mission Protocol Packet Encoding & Handshake
  07. MAVLink Active Waypoint Index Tracking (MISSION_CURRENT msg_id 42)
  08. Official ADDC 2026 12-Stage Mission Lifecycle State Machine
  09. 4-Digit Intelligence Access Code Workflow (Aerial QR + Ground Puzzle)
  10. 5-Minute (300s) Competition Timeline & Timeout Failsafe RTL
  11. Real-Time Geofence Breach Watchdog & Emergency Interlocks
  12. Canonical REST API Endpoints (FastAPI & Navigation/Mission Routes)
=====================================================================================
"""

import os
import sys
import math
import time
import unittest

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from backend.coverage_planner import CoveragePlanner, ReconWaypoint, CoveragePlanResult
from backend.route_validator import (
    RouteValidator,
    RouteValidationResult,
    haversine_distance,
    point_in_polygon
)
from backend.mavlink_multiplexer import (
    MavlinkMultiplexer,
    CRC_EXTRA,
    calculate_mavlink_crc,
    MAV_MISSION_RESULT
)
from backend.mission_engine import (
    MissionEngine,
    ADDC_COMPETITION_STAGES,
    MISSION_STATES
)
from backend.server import app
from fastapi.testclient import TestClient


class TestPhase5MissionNavigation(unittest.TestCase):

    def setUp(self):
        self.planner = CoveragePlanner(
            camera_hfov_deg=68.0,
            camera_vfov_deg=54.0,
            safety_margin_m=2.5,
            max_duration_s=300.0
        )
        self.validator = RouteValidator(
            min_altitude_m=5.0,
            max_altitude_m=25.0,
            max_speed_mps=8.0,
            max_duration_s=300.0
        )
        self.mux = MavlinkMultiplexer()
        self.engine = MissionEngine()
        self.client = TestClient(app)

    # -------------------------------------------------------------------------
    # Test 1: Sensor Footprint & Effective Lane Spacing
    # -------------------------------------------------------------------------
    def test_01_sensor_footprint_and_lane_spacing(self):
        gw, gh, lane_spacing = self.planner.compute_sensor_footprint(altitude_m=10.0, overlap_ratio=0.25)
        # Expected: gw = 2 * 10 * tan(34 deg) ~= 13.49m, gh = 2 * 10 * tan(27 deg) ~= 10.19m
        self.assertAlmostEqual(gw, 13.49, delta=0.2)
        self.assertAlmostEqual(gh, 10.19, delta=0.2)
        expected_spacing = gw * (1.0 - 0.25)
        self.assertAlmostEqual(lane_spacing, expected_spacing, delta=0.1)

        # Higher altitude gives larger footprint
        gw_15, gh_15, _ = self.planner.compute_sensor_footprint(altitude_m=15.0, overlap_ratio=0.25)
        self.assertGreater(gw_15, gw)
        self.assertGreater(gh_15, gh)

    # -------------------------------------------------------------------------
    # Test 2: Boustrophedon Sweep Generation for Circular Boundaries
    # -------------------------------------------------------------------------
    def test_02_boustrophedon_circular_boundary(self):
        center_lat, center_lon = 13.0827, 80.2707
        radius_m = 15.0
        plan = self.planner.plan_circular_coverage(
            center_lat=center_lat,
            center_lon=center_lon,
            radius_m=radius_m,
            altitude_m=10.0,
            speed_mps=3.5,
            overlap_ratio=0.25,
            strategy="BOUSTROPHEDON"
        )
        self.assertIsInstance(plan, CoveragePlanResult)
        self.assertEqual(plan.boundary_type, "CIRCLE")
        self.assertEqual(plan.plan_strategy, "BOUSTROPHEDON")
        self.assertGreater(plan.total_waypoints, 4)
        self.assertTrue(plan.is_feasible_budget)

        # First waypoint is TAKEOFF, last is RTL
        self.assertEqual(plan.waypoints[0]["action"], "TAKEOFF")
        self.assertEqual(plan.waypoints[-1]["action"], "RTL")

        # Verify all intermediate waypoints stay strictly within radius
        for wp in plan.waypoints:
            dist = haversine_distance(center_lat, center_lon, wp["lat"], wp["lon"])
            self.assertLessEqual(dist, radius_m + 0.5)

        # Verify MAVLink sequence conversion
        self.assertEqual(len(plan.mavlink_items), plan.total_waypoints)
        self.assertEqual(plan.mavlink_items[0]["command"], 22)  # MAV_CMD_NAV_TAKEOFF
        self.assertEqual(plan.mavlink_items[-1]["command"], 20) # MAV_CMD_NAV_RETURN_TO_LAUNCH

    # -------------------------------------------------------------------------
    # Test 3: Boustrophedon Sweep Generation for Polygon Boundaries
    # -------------------------------------------------------------------------
    def test_03_boustrophedon_polygon_boundary(self):
        # Define a 4-vertex quadrilateral search boundary (~30m x 30m)
        center_lat, center_lon = 13.0827, 80.2707
        d_deg = 15.0 / 111139.0
        poly = [
            (center_lat - d_deg, center_lon - d_deg),
            (center_lat - d_deg, center_lon + d_deg),
            (center_lat + d_deg, center_lon + d_deg),
            (center_lat + d_deg, center_lon - d_deg),
        ]
        plan = self.planner.plan_polygon_coverage(
            polygon_vertices=poly,
            altitude_m=10.0,
            speed_mps=3.5,
            overlap_ratio=0.25
        )
        self.assertEqual(plan.boundary_type, "POLYGON")
        self.assertGreater(plan.total_waypoints, 4)
        self.assertTrue(plan.is_feasible_budget)
        self.assertIsNotNone(plan.validation)
        self.assertTrue(plan.validation["is_valid"])

    # -------------------------------------------------------------------------
    # Test 4: Route Validator Boundary Enclosure & Altitude Verification
    # -------------------------------------------------------------------------
    def test_04_route_validator_boundary_enclosure(self):
        geofence = {
            "enabled": True,
            "type": "CIRCLE",
            "center": {"lat": 13.0827, "lon": 80.2707},
            "radius": 50.0,
            "alt_max": 25.0,
            "braking_buffer_m": 3.0
        }

        # Valid waypoints inside 50m geofence at 12m altitude
        valid_wps = [
            {"lat": 13.0827, "lon": 80.2707, "alt": 10.0, "speed": 3.5},
            {"lat": 13.0828, "lon": 80.2708, "alt": 12.0, "speed": 3.5},
            {"lat": 13.0827, "lon": 80.2707, "alt": 10.0, "speed": 3.5}
        ]
        res_valid = self.validator.validate_plan(valid_wps, geofence)
        self.assertTrue(res_valid.is_valid)

        # Invalid: Waypoint breaches 50m radius (100m away)
        breached_wps = [
            {"lat": 13.0827, "lon": 80.2707, "alt": 10.0, "speed": 3.5},
            {"lat": 13.0840, "lon": 80.2707, "alt": 10.0, "speed": 3.5}  # ~144m away
        ]
        res_breached = self.validator.validate_plan(breached_wps, geofence)
        self.assertFalse(res_breached.is_valid)
        self.assertTrue(any(i["rule"] == "GEOFENCE_BREACH_CIRCLE" for i in res_breached.issues))

        # Invalid: Altitude ceiling exceeded (30m > 25m)
        alt_breached_wps = [
            {"lat": 13.0827, "lon": 80.2707, "alt": 30.0, "speed": 3.5}
        ]
        res_alt = self.validator.validate_plan(alt_breached_wps, geofence)
        self.assertFalse(res_alt.is_valid)
        self.assertTrue(any(i["rule"] == "ALTITUDE_CEILING_EXCEEDED" for i in res_alt.issues))

    # -------------------------------------------------------------------------
    # Test 5: Route Validator Kinematics, Battery & 300s Budget
    # -------------------------------------------------------------------------
    def test_05_route_validator_budget_and_feasibility(self):
        geofence = {"enabled": False}

        # Short mission (< 100s) -> Valid budget
        short_wps = [
            {"lat": 13.08270, "lon": 80.27070, "alt": 10.0, "speed": 3.0},
            {"lat": 13.08280, "lon": 80.27070, "alt": 10.0, "speed": 3.0},
            {"lat": 13.08280, "lon": 80.27080, "alt": 10.0, "speed": 3.0}
        ]
        res_short = self.validator.validate_plan(short_wps, geofence)
        self.assertTrue(res_short.is_valid)
        self.assertLess(res_short.estimated_duration_s, 300.0)
        self.assertGreater(res_short.estimated_battery_mah, 0.0)

        # Excessively long mission (> 300s limit)
        long_wps = []
        for i in range(40):
            long_wps.append({
                "lat": 13.0827 + (i * 0.0003),
                "lon": 80.2707 + ((i % 2) * 0.0003),
                "alt": 10.0,
                "speed": 1.5
            })
        res_long = self.validator.validate_plan(long_wps, geofence)
        self.assertFalse(res_long.is_valid)
        self.assertTrue(any(i["rule"] == "TIME_BUDGET_EXCEEDED" for i in res_long.issues))

    # -------------------------------------------------------------------------
    # Test 6: MAVLink Mission Protocol Packet Encoding & Handshake
    # -------------------------------------------------------------------------
    def test_06_mavlink_mission_transfer_protocol(self):
        # 1. Packet builders verification
        clear_pkt = self.mux.build_mission_clear_all_packet()
        self.assertEqual(clear_pkt[0], 0xFD)  # MAVLink v2 magic byte
        msg_id_clear = clear_pkt[7] | (clear_pkt[8] << 8) | (clear_pkt[9] << 16)
        self.assertEqual(msg_id_clear, 45)    # MISSION_CLEAR_ALL

        count_pkt = self.mux.build_mission_count_packet(count=5)
        self.assertEqual(count_pkt[0], 0xFD)
        msg_id_count = count_pkt[7] | (count_pkt[8] << 8) | (count_pkt[9] << 16)
        self.assertEqual(msg_id_count, 44)    # MISSION_COUNT

        item_pkt = self.mux.build_mission_item_int_packet(
            seq=0, command=22, frame=6, lat=13.0827, lon=80.2707, alt=10.0
        )
        self.assertEqual(item_pkt[0], 0xFD)
        msg_id_item = item_pkt[7] | (item_pkt[8] << 8) | (item_pkt[9] << 16)
        self.assertEqual(msg_id_item, 73)     # MISSION_ITEM_INT

        # 2. Simulated upload handshake
        waypoints = [
            {"seq": 0, "command": 22, "frame": 6, "lat": 13.0827, "lon": 80.2707, "alt": 10.0},
            {"seq": 1, "command": 16, "frame": 6, "lat": 13.0828, "lon": 80.2708, "alt": 10.0},
            {"seq": 2, "command": 20, "frame": 6, "lat": 13.0827, "lon": 80.2707, "alt": 10.0}
        ]
        ok, res_str, code = self.mux.upload_mission(waypoints)
        self.assertTrue(ok)
        self.assertEqual(res_str, "MAV_MISSION_ACCEPTED")
        self.assertEqual(code, 0)
        self.assertEqual(self.mux.telemetry["mission_items_count"], 3)

    # -------------------------------------------------------------------------
    # Test 7: MAVLink Active Waypoint Index Tracking (MISSION_CURRENT)
    # -------------------------------------------------------------------------
    def test_07_mavlink_active_waypoint_tracking(self):
        # Synthesize binary MAVLink v2 MISSION_CURRENT frame (msg_id 42, payload=<H (seq=3))
        import struct
        payload = struct.pack('<H', 3)
        header = struct.pack('<BBBBBBBBBB', 0xFD, len(payload), 0, 0, 1, 1, 1, 42 & 0xFF, (42 >> 8) & 0xFF, (42 >> 16) & 0xFF)
        crc = calculate_mavlink_crc(header[1:] + payload, CRC_EXTRA[42])
        packet = header + payload + struct.pack('<H', crc)

        self.mux._decode_packet(packet)
        self.assertEqual(self.mux.telemetry["current_mission_seq"], 3)

        # Set current mission item via helper
        res = self.mux.set_current_mission_item(4)
        self.assertTrue(res)
        self.assertEqual(self.mux.telemetry["current_mission_seq"], 4)

    # -------------------------------------------------------------------------
    # Test 8: Official ADDC 2026 12-Stage Mission Lifecycle
    # -------------------------------------------------------------------------
    def test_08_addc_12_stage_fsm_lifecycle(self):
        self.assertEqual(len(ADDC_COMPETITION_STAGES), 12)

        # Stage 1: Marshal Auth
        auth_res = self.engine.authorize_flight_marshal("CHIEF_MARSHAL_01", "SIGNATURE_OK")
        self.assertTrue(auth_res["success"])
        self.assertEqual(self.engine.addc_stage, "STAGE_2_PREFLIGHT_CHECKS")

        # Stage 2 -> 3: Preflight -> Ready
        self.engine.transition_to("PREFLIGHT", "Checks started")
        self.assertEqual(self.engine.addc_stage, "STAGE_2_PREFLIGHT_CHECKS")
        self.engine.transition_to("READY", "All pre-arm checks pass")
        self.assertEqual(self.engine.addc_stage, "STAGE_3_READY_TO_ARM")

        # Stage 4: Takeoff
        self.engine.transition_to("ARMED", "Armed")
        self.engine.transition_to("TAKING_OFF", "Climbing")
        self.assertEqual(self.engine.addc_stage, "STAGE_4_AUTONOMOUS_TAKEOFF")

        # Stage 5: Recon Navigation
        self.engine.transition_to("CLIMBING", "Target reached")
        self.engine.transition_to("SCANNING", "Executing boustrophedon sweep")
        self.assertEqual(self.engine.addc_stage, "STAGE_5_RECON_NAVIGATION")

        # Stage 6: Target Box Inspection
        self.engine.transition_to("TARGET_INSPECTION", "Cuboid box identified")
        self.assertEqual(self.engine.addc_stage, "STAGE_6_TARGET_BOX_DETECTION")

        # Stage 7 & 8: Aerial QR extraction & Ground puzzle advance
        qr_res = self.engine.handle_qr_detected({"twoDigitCode": "42", "lat": 13.0827, "lon": 80.2707})
        self.assertTrue(qr_res["success"])
        self.assertEqual(self.engine.addc_stage, "STAGE_8_GROUND_PUZZLE_INPUT")
        self.assertEqual(self.engine.state, "TASK_PENDING")

        # Stage 9: Ground puzzle submission
        puzzle_res = self.engine.submit_ground_puzzle("89", "RUNNER_1")
        self.assertTrue(puzzle_res["success"])
        self.assertEqual(self.engine.addc_stage, "STAGE_9_ACCESS_CODE_VERIFICATION")
        self.assertEqual(puzzle_res["combinedAccessCode"], "4289")

        # Stage 10: Cache unlock
        unlock_res = self.engine.confirm_cache_unlocked("RUNNER_1")
        self.assertTrue(unlock_res["success"])
        self.assertEqual(self.engine.addc_stage, "STAGE_10_CACHE_UNLOCK_CONFIRMED")

        # Stage 11 & 12: Package retrieval & RTL
        retrieval_res = self.engine.confirm_package_retrieval("RUNNER_1")
        self.assertTrue(retrieval_res["success"])
        self.assertEqual(self.engine.addc_stage, "STAGE_12_AUTONOMOUS_RTL_AND_LAND")
        self.assertEqual(self.engine.state, "RETURNING")

    # -------------------------------------------------------------------------
    # Test 9: 4-Digit Intelligence Access Code Workflow
    # -------------------------------------------------------------------------
    def test_09_four_digit_access_code_workflow(self):
        # 1. Invalid aerial QR format rejection
        rej = self.engine.handle_qr_detected({"twoDigitCode": "123"})
        self.assertFalse(rej["success"])
        self.assertIn("must be exactly 2 numerical digits", rej["error"])

        # 2. Valid aerial QR acceptance
        ok_qr = self.engine.handle_qr_detected({"twoDigitCode": "07"})
        self.assertTrue(ok_qr["success"])
        self.assertEqual(self.engine.aerial_qr_code, "07")

        # 3. Invalid puzzle code rejection
        rej_puz = self.engine.submit_ground_puzzle("abc")
        self.assertFalse(rej_puz["success"])

        # 4. Valid puzzle submission combines codes
        ok_puz = self.engine.submit_ground_puzzle("99", "OPERATIVE_ALPHA")
        self.assertTrue(ok_puz["success"])
        self.assertEqual(self.engine.combined_access_code, "0799")
        self.assertTrue(self.engine.access_code_verified)

        # 5. Premature package retrieval without unlock is rejected
        rej_ret = self.engine.confirm_package_retrieval("OPERATIVE_ALPHA")
        self.assertFalse(rej_ret["success"])

        # 6. Unlock then retrieve succeeds
        unlock = self.engine.confirm_cache_unlocked("OPERATIVE_ALPHA")
        self.assertTrue(unlock["success"])
        ret = self.engine.confirm_package_retrieval("OPERATIVE_ALPHA")
        self.assertTrue(ret["success"])
        self.assertEqual(self.engine.state, "RETURNING")

    # -------------------------------------------------------------------------
    # Test 10: 5-Minute (300s) Competition Timeline & Timeout Failsafe RTL
    # -------------------------------------------------------------------------
    def test_10_competition_300s_watchdog_timeout(self):
        self.engine.state = "IDLE"
        self.engine.start_mission()
        self.assertEqual(self.engine.target_duration_s, 300)
        self.assertGreater(self.engine.get_remaining_seconds(), 280)

        # Simulate drone actively scanning
        self.engine.state = "SCANNING"

        # Simulate clock expiration: set deadline in the past
        self.engine.deadline = time.time() - 5.0
        self.assertLessEqual(self.engine.get_remaining_seconds(), 0)

        # Telemetry update should trigger RTL failsafe
        self.engine._on_telemetry_update({"lat": 13.0827, "lon": 80.2707, "relative_alt": 10.0})
        self.assertEqual(self.engine.state, "RETURNING")

    # -------------------------------------------------------------------------
    # Test 11: Real-Time Geofence Breach Watchdog & Emergency Interlocks
    # -------------------------------------------------------------------------
    def test_11_geofence_breach_and_emergency_interlocks(self):
        self.engine.geofence["radius"] = 50.0
        self.engine.geofence["alt_max"] = 25.0
        self.engine.geofence["center"] = {"lat": 13.0827, "lon": 80.2707}
        self.engine.state = "SCANNING"

        # Coordinates breaching 50m fence horizontally
        breach_lat = 13.0900
        self.engine._on_telemetry_update({"lat": breach_lat, "lon": 80.2707, "relative_alt": 10.0})
        self.assertEqual(self.engine.state, "FAILSAFE")

    # -------------------------------------------------------------------------
    # Test 12: Canonical REST API Endpoints
    # -------------------------------------------------------------------------
    def test_12_rest_api_navigation_and_mission_endpoints(self):
        # 1. /api/navigation/generate-plan
        res_plan = self.client.post("/api/navigation/generate-plan", json={
            "boundary_type": "CIRCLE",
            "radius": 15.0,
            "altitude": 10.0,
            "speed": 3.5,
            "overlap": 0.25
        })
        self.assertEqual(res_plan.status_code, 200)
        data_plan = res_plan.json()
        self.assertTrue(data_plan["success"])
        self.assertIn("plan", data_plan)

        # 2. /api/navigation/validate-plan
        wps = data_plan["plan"]["waypoints"]
        res_val = self.client.post("/api/navigation/validate-plan", json={"waypoints": wps})
        self.assertEqual(res_val.status_code, 200)
        self.assertTrue(res_val.json()["success"])

        # 3. /api/mission/stages
        res_stages = self.client.get("/api/mission/stages")
        self.assertEqual(res_stages.status_code, 200)
        self.assertEqual(len(res_stages.json()["stages"]), 12)

        # 4. /api/mission/status
        res_status = self.client.get("/api/mission/status")
        self.assertEqual(res_status.status_code, 200)
        self.assertIn("addcStage", res_status.json()["status"])

        # 5. /api/mission/marshal-auth
        res_auth = self.client.post("/api/mission/marshal-auth", json={"marshalId": "MARSHAL_42"})
        self.assertEqual(res_auth.status_code, 200)
        self.assertTrue(res_auth.json()["success"])

        # 6. /api/mission/upload-to-pixhawk
        res_up = self.client.post("/api/mission/upload-to-pixhawk", json={"waypoints": wps[:5]})
        self.assertEqual(res_up.status_code, 200)
        self.assertTrue(res_up.json()["success"])

        # 7. /api/mission/abort
        res_abort = self.client.post("/api/mission/abort", json={"reason": "TEST_ABORT"})
        self.assertEqual(res_abort.status_code, 200)
        self.assertEqual(res_abort.json()["status"], "FAILSAFE")


if __name__ == "__main__":
    unittest.main()
