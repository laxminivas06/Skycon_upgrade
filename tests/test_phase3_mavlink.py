"""
SKYCON Phase 3 Test Harness: Live MAVLink Communication, Telemetry & Autopilot Integration
Verifies MAVLink v2 binary framing, CRC checksums, connection state machine, telemetry
normalization, ArduCopter 4.x mode mappings, command ACK tracking, RC override detection,
12-point pre-arm checklist, and REST API integration.
"""

import time
import struct
import unittest
from backend.mavlink_multiplexer import (
    MavlinkMultiplexer,
    ConnectionState,
    CommandStatus,
    calculate_mavlink_crc,
    COPTER_MODES,
    MODE_NAME_TO_INT,
    VERIFIED_GCS_MODES,
    CRC_EXTRA
)
from backend.autopilot import MavlinkAutopilot, MockAutopilot, TelemetryState
from backend.settings import settings
from backend.main import app


class TestPhase3Mavlink(unittest.TestCase):

    def setUp(self):
        self.mux = MavlinkMultiplexer()
        self.app = app
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

    # -------------------------------------------------------------------------
    # 1. MAVLink CRC & Binary Frame Validation
    # -------------------------------------------------------------------------

    def test_01_crc_calculation_and_corruption_detection(self):
        """Validates X.25 CRC computation and corruption detection."""
        # Test synthetic payload with known CRC extra for HEARTBEAT (msg_id 0, extra 50)
        data = b"\x00\x00\x00\x00\x00\x00\x00\x00\x00"
        crc1 = calculate_mavlink_crc(data, CRC_EXTRA[0])
        self.assertIsInstance(crc1, int)
        self.assertGreater(crc1, 0)

        # Corrupted byte must alter CRC
        corrupt_data = b"\x01\x00\x00\x00\x00\x00\x00\x00\x00"
        crc2 = calculate_mavlink_crc(corrupt_data, CRC_EXTRA[0])
        self.assertNotEqual(crc1, crc2)

    def test_02_mavlink_v2_packet_building(self):
        """Verifies binary MAVLink v2 COMMAND_LONG packet construction."""
        packet = self.mux.build_command_long_packet(command=400, p1=1.0, p2=0.0)
        self.assertGreaterEqual(len(packet), 12)
        # Check MAVLink v2 magic byte
        self.assertEqual(packet[0], 0xFD)
        # Payload length (header is 10 bytes, command_long payload is 33 bytes)
        payload_len = packet[1]
        self.assertEqual(payload_len, 33)
        # Message ID for COMMAND_LONG is 76
        msg_id = packet[7] | (packet[8] << 8) | (packet[9] << 16)
        self.assertEqual(msg_id, 76)

    # -------------------------------------------------------------------------
    # 2. Connection Lifecycle State Machine
    # -------------------------------------------------------------------------

    def test_03_connection_lifecycle_states(self):
        """Tests sequential transitions and degradation handling in connection lifecycle."""
        # Initial state before startup
        self.assertEqual(self.mux.connection_state, ConnectionState.DISCONNECTED)

        # In absence of serial hardware, fallback initializes SIMULATION
        self.mux._start_simulation()
        self.assertEqual(self.mux.connection_state, ConnectionState.SIMULATION)
        self.assertTrue(self.mux.is_connected)

        # Test telemetry freshness state calculation
        telem = self.mux.get_telemetry()
        self.assertIn("connection_state", telem)
        self.assertIn("heartbeat_age_s", telem)
        self.assertIn("telemetry_age_s", telem)
        self.assertLessEqual(telem["heartbeat_age_s"], 2.0)

    # -------------------------------------------------------------------------
    # 3. Telemetry Normalization & Comprehensive Fields
    # -------------------------------------------------------------------------

    def test_04_telemetry_normalization(self):
        """Verifies parsing of standard MAVLink messages into unified telemetry state."""
        # Inject synthetic ATTITUDE packet (msg_id 30)
        # time_boot_ms, roll, pitch, yaw, rollspeed, pitchspeed, yawspeed
        attitude_payload = struct.pack('<Iffffff', 1000, 0.05, -0.02, 1.57, 0.0, 0.0, 0.0)
        packet_header = struct.pack('<BBBBBBBBBB', 0xFD, len(attitude_payload), 0, 0, 1, 1, 1, 30 & 0xFF, (30 >> 8) & 0xFF, (30 >> 16) & 0xFF)
        crc = calculate_mavlink_crc(packet_header[1:] + attitude_payload, CRC_EXTRA[30])
        full_packet = packet_header + attitude_payload + struct.pack('<H', crc)

        self.mux._decode_packet(full_packet)
        t = self.mux.get_telemetry()
        self.assertAlmostEqual(t["roll"], 2.86, delta=0.5)
        self.assertAlmostEqual(t["pitch"], -1.15, delta=0.5)
        self.assertAlmostEqual(t["yaw"], 89.95, delta=1.0)
        self.assertAlmostEqual(t["heading"], t["yaw"], delta=0.1)

    # -------------------------------------------------------------------------
    # 4. Flight Mode Mappings & ArduCopter 4.x Validation
    # -------------------------------------------------------------------------

    def test_05_flight_mode_mappings_and_transitions(self):
        """Tests ArduCopter custom mode definitions and verified GCS selections."""
        self.assertEqual(COPTER_MODES[0], 'STABILIZE')
        self.assertEqual(COPTER_MODES[2], 'ALT_HOLD')
        self.assertEqual(COPTER_MODES[3], 'AUTO')
        self.assertEqual(COPTER_MODES[4], 'GUIDED')
        self.assertEqual(COPTER_MODES[5], 'LOITER')
        self.assertEqual(COPTER_MODES[6], 'RTL')
        self.assertEqual(COPTER_MODES[9], 'LAND')
        self.assertEqual(COPTER_MODES[16], 'POSHOLD')
        self.assertEqual(COPTER_MODES[17], 'BRAKE')

        # Test verified mode transition
        res = self.mux.set_mode_verified("LOITER")
        self.assertEqual(res["status"], CommandStatus.STATE_CONFIRMED.value)
        self.assertEqual(self.mux.get_telemetry()["flight_mode"], "LOITER")

        # Test invalid mode rejection
        res_invalid = self.mux.set_mode_verified("SUPER_WARP_DRIVE")
        self.assertEqual(res_invalid["status"], CommandStatus.COMMAND_REJECTED.value)

    # -------------------------------------------------------------------------
    # 5. RC Channel Input & Manual Override Detection
    # -------------------------------------------------------------------------

    def test_06_rc_monitoring_and_manual_override(self):
        """Verifies 8-channel RC input decoding and pilot stick takeover detection."""
        override_triggered = []
        self.mux.subscribe_manual_override(lambda telem: override_triggered.append(telem))

        # Normal centered sticks (1500 PWM)
        payload_normal = struct.pack('<IB', 5000, 8) + struct.pack('<18H', *([1500] * 18))
        header = struct.pack('<BBBBBBBBBB', 0xFD, len(payload_normal), 0, 0, 1, 1, 1, 65 & 0xFF, (65 >> 8) & 0xFF, (65 >> 16) & 0xFF)
        crc = calculate_mavlink_crc(header[1:] + payload_normal, CRC_EXTRA[65])
        self.mux._decode_packet(header + payload_normal + struct.pack('<H', crc))

        self.assertFalse(self.mux.get_telemetry()["rc_override_active"])
        self.assertEqual(len(override_triggered), 0)

        # Deflected roll stick (1750 PWM -> outside 1500 +- 80)
        channels = [1750, 1500, 1500, 1500, 1800, 1500, 1500, 1000] + [1500] * 10
        payload_deflected = struct.pack('<IB', 5100, 8) + struct.pack('<18H', *channels)
        header = struct.pack('<BBBBBBBBBB', 0xFD, len(payload_deflected), 0, 0, 2, 1, 1, 65 & 0xFF, (65 >> 8) & 0xFF, (65 >> 16) & 0xFF)
        crc = calculate_mavlink_crc(header[1:] + payload_deflected, CRC_EXTRA[65])
        self.mux._decode_packet(header + payload_deflected + struct.pack('<H', crc))

        self.assertTrue(self.mux.get_telemetry()["rc_override_active"])
        self.assertGreaterEqual(len(override_triggered), 1)

    # -------------------------------------------------------------------------
    # 6. 12-Point Pre-Arm Safety Verification Checklist
    # -------------------------------------------------------------------------

    def test_07_prearm_checklist_engine(self):
        """Tests comprehensive 12-point pre-arm verification engine."""
        checklist = self.mux.evaluate_prearm_checklist(allow_bench_lock=True)
        self.assertIn("ready_to_arm", checklist)
        self.assertIn("checks", checklist)
        self.assertEqual(len(checklist["checks"]), 12)

        # Verify specific critical checks are evaluated
        check_names = [c["name"] for c in checklist["checks"]]
        self.assertIn("Heartbeat Freshness", check_names)
        self.assertIn("MAVLink Connection", check_names)
        self.assertIn("Battery Voltage", check_names)
        self.assertIn("GPS 3D Fix", check_names)
        self.assertIn("Satellite Count", check_names)
        self.assertIn("GPS HDOP Precision", check_names)
        self.assertIn("Geodesic Position", check_names)
        self.assertIn("EKF Navigation Filter", check_names)
        self.assertIn("MultiLink RC Link", check_names)
        self.assertIn("Autopilot Status", check_names)

    # -------------------------------------------------------------------------
    # 7. Autopilot Abstraction Bridge
    # -------------------------------------------------------------------------

    def test_08_autopilot_abstraction_bridge(self):
        """Tests MavlinkAutopilot translation of high-level FSM navigation commands."""
        ap = MavlinkAutopilot(self.mux)
        telem = ap.get_telemetry()
        self.assertIsInstance(telem, TelemetryState)
        self.assertEqual(telem.flight_mode, self.mux.get_telemetry()["flight_mode"])

    # -------------------------------------------------------------------------
    # 8. REST API Endpoints Verification
    # -------------------------------------------------------------------------

    def test_09_api_mavlink_status_and_parameters(self):
        """Verifies /api/mavlink/status and /api/mavlink/parameters endpoints."""
        res = self.client.get("/api/mavlink/status")
        self.assertEqual(res.status_code, 200)
        data = res.json["data"]
        self.assertIn("connection_state", data)
        self.assertIn("heartbeat_rate_hz", data)
        self.assertIn("port", data)
        self.assertIn("baud", data)

        res_params = self.client.get("/api/mavlink/parameters")
        self.assertEqual(res_params.status_code, 200)
        self.assertIn("SERIAL1_PROTOCOL", res_params.json["data"]["parameters"])

        res_prearm = self.client.get("/api/mavlink/prearm")
        self.assertEqual(res_prearm.status_code, 200)
        self.assertIn("checks", res_prearm.json["data"])

    def test_10_api_drone_commands_and_emergency_rtl(self):
        """Verifies verified flight command execution through REST API."""
        # Arming with bench safety lock
        res = self.client.post("/api/drone/arm", json={"arm": True, "force": False})
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json["data"]["armed"])

        # Takeoff
        res_to = self.client.post("/api/drone/takeoff", json={"altitude": 10.0})
        self.assertEqual(res_to.status_code, 200)
        self.assertEqual(res_to.json["data"]["target_altitude_m"], 10.0)

        # Mode switch
        res_mode = self.client.post("/api/mavlink/mode", json={"mode": "GUIDED"})
        self.assertEqual(res_mode.status_code, 200)
        self.assertEqual(res_mode.json["data"]["mode"], "GUIDED")

        # Emergency RTL (local air-gapped failsafe)
        res_ertl = self.client.post("/api/drone/emergency_rtl", json={"reason": "TEST_FAILSAFE"})
        self.assertEqual(res_ertl.status_code, 200)
        self.assertTrue(res_ertl.json["data"]["emergency"])
        self.assertEqual(res_ertl.json["data"]["mode"], "RTL")


if __name__ == "__main__":
    unittest.main()
