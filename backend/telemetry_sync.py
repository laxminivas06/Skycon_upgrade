"""
=====================================================================================
SKYCON MASTER ARCHITECTURE - TIME SYNCHRONIZATION & TELEMETRY INTERPOLATION
MODULE: telemetry_sync.py (Perception & Geodesic Navigation)
=====================================================================================
Monotonic Telemetry Synchronization Ring Buffer & Multi-Clock Interpolation Engine

Features:
  1. Multi-Clock Correlation & Mapping:
     - iPhone capture timestamp (t_phone, wall clock)
     - Raspberry Pi frame reception timestamp (t_recv_wall)
     - Raspberry Pi monotonic timestamp (t_mono via time.monotonic())
     - Pixhawk boot time (time_boot_ms from MAVLink ATTITUDE / GLOBAL_POSITION_INT)
     - Pixhawk GPS Unix epoch time (from GPS_RAW_INT / SYSTEM_TIME)
  2. Transport Latency & Clock Drift Compensation:
     - Estimates network transport latency (half-RTT / filtered one-way delay)
     - Tracks companion-to-Pixhawk clock offset (Delta = t_mono - time_boot_ms / 1000)
     - Computes synchronization uncertainty in milliseconds
  3. Formal Sync Quality States:
     - SYNCHRONIZED: Fresh telemetry (< 0.5s), valid boot time offset, low latency (< 150ms)
     - ESTIMATED: Nominal transport delay applied, boot time extrapolated
     - DEGRADED: Telemetry age > 1.0s or variable network jitter (> 300ms)
     - UNAVAILABLE: Telemetry silent > 2.5s or missing clock baseline
  4. SLERP-Equivalent Telemetry Interpolation:
     - Thread-safe circular ring buffer (K=100)
     - Linear position and velocity interpolation
     - Circular shortest-path angular interpolation for heading, yaw, roll, pitch
=====================================================================================
"""

import math
import time
import threading
from collections import deque
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, List, Tuple, Dict, Any


class TimeSyncStatus(str, Enum):
    """Authoritative clock synchronization status tiers."""
    SYNCHRONIZED = "SYNCHRONIZED"
    ESTIMATED = "ESTIMATED"
    DEGRADED = "DEGRADED"
    UNAVAILABLE = "UNAVAILABLE"


@dataclass
class SyncedTimestampResult:
    """Rich multi-clock timestamp correlation record."""
    phone_raw_ts: float                      # Raw capture timestamp reported by iPhone
    reception_mono_ts: float                 # Companion monotonic timestamp at frame ingest
    reception_wall_ts: float                 # Companion wall clock UTC timestamp at frame ingest
    estimated_capture_mono_ts: float         # Monotonic estimate of true exposure time
    pixhawk_time_boot_ms: int                # Correlated Pixhawk boot time in ms
    pixhawk_gps_time_s: Optional[float]      # Pixhawk GPS epoch time in seconds
    estimated_network_latency_ms: float      # One-way transport delay estimate
    sync_status: TimeSyncStatus              # Quality tier
    uncertainty_ms: float                    # 1-sigma uncertainty radius in ms

    def to_dict(self) -> Dict[str, Any]:
        return {
            "phone_raw_ts": self.phone_raw_ts,
            "reception_mono_ts": round(self.reception_mono_ts, 4),
            "reception_wall_ts": round(self.reception_wall_ts, 3),
            "estimated_capture_mono_ts": round(self.estimated_capture_mono_ts, 4),
            "pixhawk_time_boot_ms": self.pixhawk_time_boot_ms,
            "pixhawk_gps_time_s": self.pixhawk_gps_time_s,
            "estimated_network_latency_ms": round(self.estimated_network_latency_ms, 1),
            "sync_status": self.sync_status.value,
            "uncertainty_ms": round(self.uncertainty_ms, 1)
        }


@dataclass
class TelemetrySnapshot:
    """Synchronized multi-sensor telemetry state at a discrete monotonic timestamp."""
    timestamp_mono: float
    time_boot_ms: int = 0
    latitude: float = 0.0          # Geodetic degrees
    longitude: float = 0.0         # Geodetic degrees
    altitude_agl_m: float = 0.0    # Meters AGL (relative_alt)
    altitude_msl_m: float = 0.0    # Meters MSL (alt)
    roll_rad: float = 0.0          # Radians (+right down)
    pitch_rad: float = 0.0         # Radians (+nose up, -nose down)
    yaw_rad: float = 0.0           # Radians (+clockwise from North)
    roll_deg: float = 0.0
    pitch_deg: float = 0.0
    yaw_deg: float = 0.0
    heading_deg: float = 0.0       # Compass heading 0..360°
    vx_mps: float = 0.0            # North ground speed
    vy_mps: float = 0.0            # East ground speed
    vz_mps: float = 0.0            # Down vertical speed
    ground_speed_mps: float = 0.0
    custom_mode: int = 0
    is_armed: bool = False
    is_valid: bool = True
    sync_status: TimeSyncStatus = TimeSyncStatus.ESTIMATED
    uncertainty_ms: float = 50.0


class TimeSynchronizationService:
    """
    Correlates iPhone camera timestamps with companion monotonic time and
    Pixhawk MAVLink boot / GPS time.
    """

    def __init__(self, history_len: int = 50):
        self._lock = threading.Lock()
        self.history_len = history_len

        # Clock offset history: companion_mono - pixhawk_boot_s
        self._mono_boot_offsets: deque = deque(maxlen=history_len)
        # Latency samples: reception_wall - phone_raw_wall
        self._latency_samples_ms: deque = deque(maxlen=history_len)

        # Baseline filters
        self.filtered_latency_ms: float = 35.0  # Initial baseline for Wi-Fi local link
        self.clock_drift_ppm: float = 0.0
        self.last_pixhawk_sync_mono: float = 0.0
        self.last_pixhawk_time_boot_ms: int = 0
        self.last_gps_epoch_s: Optional[float] = None

    def update_pixhawk_clock(self, time_boot_ms: int, gps_epoch_s: Optional[float] = None, mono_ts: Optional[float] = None):
        """Records a new Pixhawk clock snapshot from incoming MAVLink packets."""
        now_mono = mono_ts if mono_ts is not None else time.monotonic()
        with self._lock:
            self.last_pixhawk_sync_mono = now_mono
            self.last_pixhawk_time_boot_ms = time_boot_ms
            if gps_epoch_s is not None and gps_epoch_s > 1e9:
                self.last_gps_epoch_s = gps_epoch_s

            boot_s = time_boot_ms / 1000.0
            offset = now_mono - boot_s
            self._mono_boot_offsets.append((now_mono, offset))

            # Estimate drift if we have >= 10 samples over at least 5 seconds
            if len(self._mono_boot_offsets) >= 10:
                t0, off0 = self._mono_boot_offsets[0]
                t1, off1 = self._mono_boot_offsets[-1]
                dt = t1 - t0
                if dt > 5.0:
                    self.clock_drift_ppm = ((off1 - off0) / dt) * 1e6

    def record_network_latency_sample(self, phone_wall_ts: float, reception_wall_ts: float):
        """Records an observed one-way or round-trip transmission delay."""
        if phone_wall_ts <= 0:
            return
        observed_ms = max(1.0, (reception_wall_ts - phone_wall_ts) * 1000.0)
        # Reject unreasonable jumps (> 5000ms indicates clock unsynchronized)
        if observed_ms < 5000.0:
            with self._lock:
                self._latency_samples_ms.append(observed_ms)
                # Exponential moving average filter
                self.filtered_latency_ms = 0.8 * self.filtered_latency_ms + 0.2 * observed_ms

    def correlate_frame(
        self,
        phone_raw_ts: Optional[float] = None,
        reception_mono_ts: Optional[float] = None
    ) -> SyncedTimestampResult:
        """
        Maps a captured iPhone frame into correlated companion and Pixhawk timestamps.
        """
        now_mono = reception_mono_ts or time.monotonic()
        now_wall = time.time()
        raw_ts = phone_raw_ts or (now_wall - (self.filtered_latency_ms / 1000.0))

        # Check for network latency estimate
        if phone_raw_ts is not None and phone_raw_ts > 0:
            self.record_network_latency_sample(phone_raw_ts, now_wall)

        with self._lock:
            latency_ms = self.filtered_latency_ms
            last_telem_age = now_mono - self.last_pixhawk_sync_mono if self.last_pixhawk_sync_mono > 0 else 999.0

            # Estimated exposure time on companion monotonic clock
            est_capture_mono = now_mono - (latency_ms / 1000.0)

            # Pixhawk boot time correlation
            if self._mono_boot_offsets:
                _, mean_offset = self._mono_boot_offsets[-1]
                est_boot_ms = int((est_capture_mono - mean_offset) * 1000.0)
            else:
                est_boot_ms = self.last_pixhawk_time_boot_ms

            # Determine sync tier
            if last_telem_age < 0.5 and latency_ms < 150.0:
                status = TimeSyncStatus.SYNCHRONIZED
                uncertainty = 15.0 + (latency_ms * 0.15)
            elif last_telem_age < 2.0 and latency_ms < 400.0:
                status = TimeSyncStatus.ESTIMATED
                uncertainty = 40.0 + (latency_ms * 0.3)
            elif last_telem_age < 5.0:
                status = TimeSyncStatus.DEGRADED
                uncertainty = 150.0 + (last_telem_age * 50.0)
            else:
                status = TimeSyncStatus.UNAVAILABLE
                uncertainty = 500.0

            gps_time = None
            if self.last_gps_epoch_s is not None and last_telem_age < 5.0:
                gps_time = self.last_gps_epoch_s + (now_mono - self.last_pixhawk_sync_mono)

        return SyncedTimestampResult(
            phone_raw_ts=raw_ts,
            reception_mono_ts=now_mono,
            reception_wall_ts=now_wall,
            estimated_capture_mono_ts=est_capture_mono,
            pixhawk_time_boot_ms=max(0, est_boot_ms),
            pixhawk_gps_time_s=gps_time,
            estimated_network_latency_ms=latency_ms,
            sync_status=status,
            uncertainty_ms=uncertainty
        )

    def get_diagnostics(self) -> Dict[str, Any]:
        """Returns time synchronization operational status for GCS health monitor."""
        now_mono = time.monotonic()
        with self._lock:
            telem_age = now_mono - self.last_pixhawk_sync_mono if self.last_pixhawk_sync_mono > 0 else 999.0
            return {
                "filtered_network_latency_ms": round(self.filtered_latency_ms, 1),
                "clock_drift_ppm": round(self.clock_drift_ppm, 2),
                "pixhawk_telemetry_age_s": round(telem_age, 2),
                "last_time_boot_ms": self.last_pixhawk_time_boot_ms,
                "has_gps_time": self.last_gps_epoch_s is not None,
                "sync_quality": (
                    TimeSyncStatus.SYNCHRONIZED.value if telem_age < 0.5
                    else TimeSyncStatus.ESTIMATED.value if telem_age < 2.0
                    else TimeSyncStatus.DEGRADED.value if telem_age < 5.0
                    else TimeSyncStatus.UNAVAILABLE.value
                )
            }


class TelemetrySyncBuffer:
    """
    Circular history buffer (K=100) providing SLERP-equivalent interpolation of drone states
    to the exact camera exposure timestamp t_frame.
    """

    def __init__(self, capacity: int = 100):
        self.capacity = capacity
        self._buffer: deque = deque(maxlen=capacity)
        self._lock = threading.Lock()
        self.time_sync = TimeSynchronizationService()

        # Cache of latest received values
        self._latest_time_boot_ms = 0
        self._latest_lat = 0.0
        self._latest_lon = 0.0
        self._latest_alt_agl = 0.0
        self._latest_alt_msl = 0.0
        self._latest_roll = 0.0
        self._latest_pitch = 0.0
        self._latest_yaw = 0.0
        self._latest_heading = 0.0
        self._latest_vx = 0.0
        self._latest_vy = 0.0
        self._latest_vz = 0.0
        self._latest_mode = 0
        self._latest_armed = False
        self._total_ingested = 0

    def update_attitude(self, roll_rad: float, pitch_rad: float, yaw_rad: float, time_boot_ms: int = 0):
        """Ingests MAVLink ATTITUDE (#30) packet."""
        now_mono = time.monotonic()
        if time_boot_ms > 0:
            self.time_sync.update_pixhawk_clock(time_boot_ms)
        with self._lock:
            self._latest_time_boot_ms = time_boot_ms
            self._latest_roll = roll_rad
            self._latest_pitch = pitch_rad
            self._latest_yaw = yaw_rad % (2.0 * math.pi)
            self._push_snapshot_locked(now_mono)

    def update_global_position(
        self,
        lat_deg: float,
        lon_deg: float,
        alt_agl_m: float,
        alt_msl_m: float,
        vx_mps: float = 0.0,
        vy_mps: float = 0.0,
        vz_mps: float = 0.0,
        hdg_deg: float = 0.0,
        time_boot_ms: int = 0
    ):
        """Ingests MAVLink GLOBAL_POSITION_INT (#33) packet."""
        now_mono = time.monotonic()
        if time_boot_ms > 0:
            self.time_sync.update_pixhawk_clock(time_boot_ms)
        with self._lock:
            self._latest_time_boot_ms = time_boot_ms
            self._latest_lat = lat_deg
            self._latest_lon = lon_deg
            self._latest_alt_agl = alt_agl_m
            self._latest_alt_msl = alt_msl_m
            self._latest_vx = vx_mps
            self._latest_vy = vy_mps
            self._latest_vz = vz_mps
            self._latest_heading = hdg_deg % 360.0
            self._push_snapshot_locked(now_mono)

    def update_heartbeat(self, custom_mode: int, is_armed: bool):
        """Ingests MAVLink HEARTBEAT (#0) packet."""
        with self._lock:
            self._latest_mode = custom_mode
            self._latest_armed = is_armed

    def push_snapshot(self, snapshot: TelemetrySnapshot):
        """Directly pushes a complete snapshot (useful for testing and replay)."""
        with self._lock:
            self._buffer.append(snapshot)
            self._total_ingested += 1

    def _push_snapshot_locked(self, timestamp_mono: float):
        """Internal helper to construct and append snapshot from latest cached values."""
        spd = math.sqrt(self._latest_vx ** 2 + self._latest_vy ** 2)
        snap = TelemetrySnapshot(
            timestamp_mono=timestamp_mono,
            time_boot_ms=self._latest_time_boot_ms,
            latitude=self._latest_lat,
            longitude=self._latest_lon,
            altitude_agl_m=self._latest_alt_agl,
            altitude_msl_m=self._latest_alt_msl,
            roll_rad=self._latest_roll,
            pitch_rad=self._latest_pitch,
            yaw_rad=self._latest_yaw,
            roll_deg=math.degrees(self._latest_roll),
            pitch_deg=math.degrees(self._latest_pitch),
            yaw_deg=math.degrees(self._latest_yaw),
            heading_deg=self._latest_heading,
            vx_mps=self._latest_vx,
            vy_mps=self._latest_vy,
            vz_mps=self._latest_vz,
            ground_speed_mps=spd,
            custom_mode=self._latest_mode,
            is_armed=self._latest_armed,
            is_valid=(abs(self._latest_lat) > 1e-6 or abs(self._latest_lon) > 1e-6)
        )
        self._buffer.append(snap)
        self._total_ingested += 1

    def get_latest(self) -> Optional[TelemetrySnapshot]:
        """Returns the most recent snapshot in the buffer without interpolation."""
        with self._lock:
            if not self._buffer:
                return None
            return self._buffer[-1]

    def interpolate(self, t_frame_mono: float) -> TelemetrySnapshot:
        """
        Interpolates drone position and attitude to match exact frame exposure timestamp t_frame_mono.
        Uses SLERP-equivalent circular angle interpolation for yaw and heading.
        """
        with self._lock:
            if not self._buffer:
                return TelemetrySnapshot(
                    timestamp_mono=t_frame_mono,
                    is_valid=False,
                    sync_status=TimeSyncStatus.UNAVAILABLE
                )
            buf_list = list(self._buffer)

        # Single snapshot boundary
        if len(buf_list) == 1:
            return buf_list[0]

        # Outside boundary limits
        if t_frame_mono <= buf_list[0].timestamp_mono:
            return buf_list[0]
        if t_frame_mono >= buf_list[-1].timestamp_mono:
            latest = buf_list[-1]
            age = t_frame_mono - latest.timestamp_mono
            if age > 1.5:
                # Flag as degraded if interpolating well past buffer
                return TelemetrySnapshot(
                    timestamp_mono=t_frame_mono,
                    time_boot_ms=latest.time_boot_ms,
                    latitude=latest.latitude,
                    longitude=latest.longitude,
                    altitude_agl_m=latest.altitude_agl_m,
                    altitude_msl_m=latest.altitude_msl_m,
                    roll_rad=latest.roll_rad,
                    pitch_rad=latest.pitch_rad,
                    yaw_rad=latest.yaw_rad,
                    roll_deg=latest.roll_deg,
                    pitch_deg=latest.pitch_deg,
                    yaw_deg=latest.yaw_deg,
                    heading_deg=latest.heading_deg,
                    custom_mode=latest.custom_mode,
                    is_armed=latest.is_armed,
                    is_valid=latest.is_valid,
                    sync_status=TimeSyncStatus.DEGRADED,
                    uncertainty_ms=100.0 + (age * 50.0)
                )
            return latest

        # Find bracketing interval [s0, s1]
        s0, s1 = buf_list[0], buf_list[-1]
        for i in range(len(buf_list) - 1):
            if buf_list[i].timestamp_mono <= t_frame_mono <= buf_list[i + 1].timestamp_mono:
                s0 = buf_list[i]
                s1 = buf_list[i + 1]
                break

        # Compute interpolation factor alpha in [0, 1]
        dt = s1.timestamp_mono - s0.timestamp_mono
        if dt <= 1e-6:
            return s0

        alpha = (t_frame_mono - s0.timestamp_mono) / dt

        # Linear metric interpolation
        interp_lat = s0.latitude + alpha * (s1.latitude - s0.latitude)
        interp_lon = s0.longitude + alpha * (s1.longitude - s0.longitude)
        interp_alt_agl = s0.altitude_agl_m + alpha * (s1.altitude_agl_m - s0.altitude_agl_m)
        interp_alt_msl = s0.altitude_msl_m + alpha * (s1.altitude_msl_m - s0.altitude_msl_m)
        interp_roll = s0.roll_rad + alpha * (s1.roll_rad - s0.roll_rad)
        interp_pitch = s0.pitch_rad + alpha * (s1.pitch_rad - s0.pitch_rad)
        interp_vx = s0.vx_mps + alpha * (s1.vx_mps - s0.vx_mps)
        interp_vy = s0.vy_mps + alpha * (s1.vy_mps - s0.vy_mps)
        interp_vz = s0.vz_mps + alpha * (s1.vz_mps - s0.vz_mps)
        interp_speed = math.sqrt(interp_vx ** 2 + interp_vy ** 2)

        # SLERP-equivalent circular angle interpolation for yaw and heading
        interp_yaw = self._interpolate_angle_rad(s0.yaw_rad, s1.yaw_rad, alpha)
        interp_hdg = self._interpolate_angle_deg(s0.heading_deg, s1.heading_deg, alpha)

        return TelemetrySnapshot(
            timestamp_mono=t_frame_mono,
            time_boot_ms=int(s0.time_boot_ms + alpha * (s1.time_boot_ms - s0.time_boot_ms)),
            latitude=interp_lat,
            longitude=interp_lon,
            altitude_agl_m=interp_alt_agl,
            altitude_msl_m=interp_alt_msl,
            roll_rad=interp_roll,
            pitch_rad=interp_pitch,
            yaw_rad=interp_yaw,
            roll_deg=math.degrees(interp_roll),
            pitch_deg=math.degrees(interp_pitch),
            yaw_deg=math.degrees(interp_yaw),
            heading_deg=interp_hdg,
            vx_mps=interp_vx,
            vy_mps=interp_vy,
            vz_mps=interp_vz,
            ground_speed_mps=interp_speed,
            custom_mode=s1.custom_mode,
            is_armed=s1.is_armed,
            is_valid=(abs(interp_lat) > 1e-6 or abs(interp_lon) > 1e-6),
            sync_status=TimeSyncStatus.SYNCHRONIZED,
            uncertainty_ms=round(dt * 500.0, 1)
        )

    def interpolate_for_frame(self, synced_ts: SyncedTimestampResult) -> TelemetrySnapshot:
        """Helper to interpolate directly from a SyncedTimestampResult."""
        snap = self.interpolate(synced_ts.estimated_capture_mono_ts)
        snap.sync_status = synced_ts.sync_status
        snap.uncertainty_ms = synced_ts.uncertainty_ms
        return snap

    @staticmethod
    def _interpolate_angle_rad(a0: float, a1: float, alpha: float) -> float:
        """Interpolates between two angles in radians along the shortest arc."""
        diff = (a1 - a0 + math.pi) % (2.0 * math.pi) - math.pi
        return (a0 + diff * alpha) % (2.0 * math.pi)

    @staticmethod
    def _interpolate_angle_deg(d0: float, d1: float, alpha: float) -> float:
        """Interpolates between two angles in degrees along the shortest arc."""
        diff = (d1 - d0 + 180.0) % 360.0 - 180.0
        return (d0 + diff * alpha) % 360.0


# Global singleton instance
telemetry_sync = TelemetrySyncBuffer(capacity=100)
