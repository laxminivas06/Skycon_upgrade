"""
Autopilot Interface & Flight Controller Command Layer (MAVLink / Serial)
Binds high-level autonomous FSM state machines to physical Pixhawk MAVLink or Mock SITL.
"""

import time
from dataclasses import dataclass, field
from typing import Optional, Callable


@dataclass
class TelemetryState:
    latitude: float = 12.9715987
    longitude: float = 77.5945627
    altitude_m: float = 10.0
    heading_deg: float = 90.0
    ground_speed_mps: float = 0.0
    vertical_speed_mps: float = 0.0
    flight_mode: str = "GUIDED"
    is_armed: bool = True
    satellites: int = 14
    ekf_healthy: bool = True
    battery_pct: float = 95.0
    last_heartbeat_timestamp: float = field(default_factory=time.time)


class AutopilotInterface:
    """Base interface for flight controller navigation & control."""

    async def connect(self) -> bool:
        raise NotImplementedError

    async def command_yaw(self, heading_deg: float, yaw_rate_dps: float) -> bool:
        raise NotImplementedError

    async def hold_position(self, altitude_m: Optional[float] = None) -> bool:
        raise NotImplementedError

    async def fly_to_position(self, target_lat: float, target_lon: float, target_alt_m: float, speed_mps: float = 2.0) -> bool:
        raise NotImplementedError

    async def command_rtl(self) -> bool:
        raise NotImplementedError

    def get_telemetry(self) -> TelemetryState:
        raise NotImplementedError

    async def disconnect(self):
        pass


class MockAutopilot(AutopilotInterface):
    """
    In-memory mock flight controller for standalone testing and SITL simulation.
    Allows testing full state transitions without physical hardware.
    """

    def __init__(self, initial_telemetry: Optional[TelemetryState] = None):
        self.telemetry = initial_telemetry or TelemetryState()
        self.commands_sent: list = []
        self._connected = True

    async def connect(self) -> bool:
        self._connected = True
        return True

    async def command_yaw(self, heading_deg: float, yaw_rate_dps: float) -> bool:
        self.telemetry.heading_deg = heading_deg % 360.0
        self.commands_sent.append({
            "command": "CONDITION_YAW",
            "heading": heading_deg,
            "rate": yaw_rate_dps,
            "timestamp": time.time()
        })
        return True

    async def hold_position(self, altitude_m: Optional[float] = None) -> bool:
        if altitude_m is not None:
            self.telemetry.altitude_m = altitude_m
        self.commands_sent.append({
            "command": "HOLD_POSITION",
            "altitude": self.telemetry.altitude_m,
            "timestamp": time.time()
        })
        return True

    async def fly_to_position(self, target_lat: float, target_lon: float, target_alt_m: float, speed_mps: float = 2.0) -> bool:
        self.telemetry.latitude = target_lat
        self.telemetry.longitude = target_lon
        self.telemetry.altitude_m = target_alt_m
        self.telemetry.ground_speed_mps = speed_mps
        self.commands_sent.append({
            "command": "DO_REPOSITION",
            "latitude": target_lat,
            "longitude": target_lon,
            "altitude": target_alt_m,
            "speed": speed_mps,
            "timestamp": time.time()
        })
        return True

    async def command_rtl(self) -> bool:
        self.telemetry.flight_mode = "RTL"
        self.commands_sent.append({
            "command": "NAV_RETURN_TO_LAUNCH",
            "timestamp": time.time()
        })
        return True

    def get_telemetry(self) -> TelemetryState:
        self.telemetry.last_heartbeat_timestamp = time.time()
        return self.telemetry

    async def disconnect(self):
        self._connected = False


class MavlinkAutopilot(AutopilotInterface):
    """
    Live Autopilot Interface backed by MavlinkMultiplexer.
    Translates high-level FSM navigation commands directly into verified MAVLink frames.
    """

    def __init__(self, multiplexer=None):
        from backend.mavlink_multiplexer import mavlink_mux
        self.mux = multiplexer or mavlink_mux
        self._connected = False

    async def connect(self) -> bool:
        if not self.mux._running:
            self.mux.start()
        self._connected = True
        return True

    async def command_yaw(self, heading_deg: float, yaw_rate_dps: float) -> bool:
        if self.mux.is_simulation:
            with self.mux._lock:
                self.mux.telemetry["heading"] = heading_deg % 360.0
                self.mux.telemetry["yaw"] = heading_deg % 360.0
            return True
        success, _, _ = self.mux.execute_command_and_wait_ack(
            command=115, p1=float(heading_deg % 360.0), p2=float(yaw_rate_dps), p3=1.0, p4=0.0
        )
        return success

    async def hold_position(self, altitude_m: Optional[float] = None) -> bool:
        if altitude_m is not None and self.mux.is_simulation:
            with self.mux._lock:
                self.mux.telemetry["relative_alt"] = altitude_m
                self.mux.telemetry["altitude_m"] = altitude_m
        if self.mux.telemetry["flight_mode"] not in ("LOITER", "GUIDED"):
            res = self.mux.set_mode_verified("LOITER")
            return res.get("confirmed", False)
        return True

    async def fly_to_position(self, target_lat: float, target_lon: float, target_alt_m: float, speed_mps: float = 2.0) -> bool:
        if self.mux.is_simulation:
            with self.mux._lock:
                self.mux.telemetry["lat"] = target_lat
                self.mux.telemetry["lon"] = target_lon
                self.mux.telemetry["relative_alt"] = target_alt_m
                self.mux.telemetry["altitude_m"] = target_alt_m
                self.mux.telemetry["ground_speed"] = speed_mps
            return True
        success, _, _ = self.mux.execute_command_and_wait_ack(
            command=192, p1=float(speed_mps), p5=float(target_lat), p6=float(target_lon), p7=float(target_alt_m)
        )
        return success

    async def command_rtl(self) -> bool:
        res = self.mux.rtl_verified()
        return res.get("confirmed", False)

    def get_telemetry(self) -> TelemetryState:
        t = self.mux.get_telemetry()
        return TelemetryState(
            latitude=t.get("lat", 12.9715987),
            longitude=t.get("lon", 77.5945627),
            altitude_m=t.get("relative_alt", 10.0),
            heading_deg=t.get("heading", 90.0),
            ground_speed_mps=t.get("ground_speed", 0.0),
            vertical_speed_mps=t.get("climb_rate", 0.0),
            flight_mode=t.get("flight_mode", "GUIDED"),
            is_armed=t.get("armed", False),
            satellites=t.get("satellites", 14),
            ekf_healthy=t.get("ekf_healthy", True),
            battery_pct=float(t.get("battery_remaining", 95)),
            last_heartbeat_timestamp=self.mux.last_heartbeat_time or time.time()
        )

    async def disconnect(self):
        self._connected = False
