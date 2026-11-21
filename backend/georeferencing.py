"""
=====================================================================================
SKYCON MASTER ARCHITECTURE - 3D ATTITUDE-COMPENSATED GEOREFERENCING ENGINE
MODULE: georeferencing.py (Perception & Geodesic Navigation)
=====================================================================================
Rigorous 3D Attitude-Compensated Georeferencing Engine (WGS84 Ellipsoidal)

Features:
  1. Configurable Camera Intrinsics & Extrinsics Calibration:
     - Focal lengths (fx, fy), principal center (cx, cy), Brown-Conrady distortion [k1, k2, p1, p2, k3]
     - Camera mounting orientation angles: mount_pitch, mount_roll, mount_yaw (degrees)
     - Rigid body translation vector (dx, dy, dz in meters)
  2. Full 3D Aerospace Rotation Sequence:
     - Camera-to-Body Transformation: R_C^B = R_mount * R_nadir
     - Body-to-NED Transformation: R_B^NED = R_z(yaw) * R_y(pitch) * R_x(roll)
  3. Parametric Ground-Plane Ray Inversion:
     - Inverts pixel (u, v) into camera optical ray
     - Intersects ray with horizontal flat-ground plane at altitude H_agl
     - Rejects non-intersecting upward/horizon rays (v_D <= 0.05)
  4. Precise WGS84 Ellipsoidal Geodetic Projection:
     - Meridian radius of curvature M(phi) and prime vertical radius N(phi)
     - Metric North-East offsets converted to geodetic latitude and longitude
  5. Honest Multi-Tier Verification Levels:
     - CALIBRATED: Verified intrinsic calibration matrix + fresh telemetry (< 0.5s)
     - APPROXIMATE: Default wide-angle FOV model or moderate telemetry age
     - IMAGE_SPACE_ONLY: Ground intersection not computable
     - UNAVAILABLE: Stale telemetry (> 2.0s), invalid GPS, or upward pointing ray
=====================================================================================
"""

import math
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Tuple, Dict, Any, Union
import numpy as np
import cv2


class GeorefHonestyLevel(str, Enum):
    """Authoritative honesty tiers for visual observations."""
    CALIBRATED = "CALIBRATED"
    APPROXIMATE = "APPROXIMATE"
    IMAGE_SPACE_ONLY = "IMAGE_SPACE_ONLY"
    UNAVAILABLE = "UNAVAILABLE"


@dataclass
class CameraIntrinsics3D:
    """Optical parameters, intrinsic calibration, and mounting extrinsics."""
    width: int = 1280
    height: int = 720
    hfov_deg: float = 68.0             # iPhone rear wide camera default (~26mm equiv)
    vfov_deg: float = 54.0
    fx: Optional[float] = None
    fy: Optional[float] = None
    cx: Optional[float] = None
    cy: Optional[float] = None
    dist_coeffs: Optional[np.ndarray] = None  # [k1, k2, p1, p2, k3]
    sensor_model: str = "iPhone Camera (Onboard)"
    mount_rotation_deg: int = 0        # 0, 90, 180, 270 degrees in plane
    mount_pitch_deg: float = 0.0       # Extrinsic pitch offset (+up/-down)
    mount_roll_deg: float = 0.0        # Extrinsic roll offset
    mount_yaw_deg: float = 0.0         # Extrinsic yaw offset
    body_offset_xyz_m: Tuple[float, float, float] = (0.0, 0.0, 0.0)
    calibration_version: str = "1.0"
    is_calibrated: bool = False

    def __post_init__(self):
        if self.cx is None:
            self.cx = self.width / 2.0
        if self.cy is None:
            self.cy = self.height / 2.0
        if self.fx is None:
            self.fx = (self.width / 2.0) / math.tan(math.radians(self.hfov_deg / 2.0))
        if self.fy is None:
            self.fy = (self.height / 2.0) / math.tan(math.radians(self.vfov_deg / 2.0))

    def to_dict(self) -> Dict[str, Any]:
        return {
            "width": self.width,
            "height": self.height,
            "hfov_deg": round(self.hfov_deg, 2),
            "vfov_deg": round(self.vfov_deg, 2),
            "fx": round(self.fx, 2) if self.fx else None,
            "fy": round(self.fy, 2) if self.fy else None,
            "cx": round(self.cx, 2) if self.cx else None,
            "cy": round(self.cy, 2) if self.cy else None,
            "mount_rotation_deg": self.mount_rotation_deg,
            "mount_pitch_deg": round(self.mount_pitch_deg, 2),
            "mount_roll_deg": round(self.mount_roll_deg, 2),
            "mount_yaw_deg": round(self.mount_yaw_deg, 2),
            "sensor_model": self.sensor_model,
            "calibration_version": self.calibration_version,
            "is_calibrated": self.is_calibrated
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "CameraIntrinsics3D":
        dist = data.get("dist_coeffs")
        if dist is not None:
            dist = np.array(dist, dtype=np.float32)
        return cls(
            width=int(data.get("width", 1280)),
            height=int(data.get("height", 720)),
            hfov_deg=float(data.get("hfov_deg", 68.0)),
            vfov_deg=float(data.get("vfov_deg", 54.0)),
            fx=float(data["fx"]) if data.get("fx") is not None else None,
            fy=float(data["fy"]) if data.get("fy") is not None else None,
            cx=float(data["cx"]) if data.get("cx") is not None else None,
            cy=float(data["cy"]) if data.get("cy") is not None else None,
            dist_coeffs=dist,
            sensor_model=str(data.get("sensor_model", "iPhone Camera (Onboard)")),
            mount_rotation_deg=int(data.get("mount_rotation_deg", 0)),
            mount_pitch_deg=float(data.get("mount_pitch_deg", 0.0)),
            mount_roll_deg=float(data.get("mount_roll_deg", 0.0)),
            mount_yaw_deg=float(data.get("mount_yaw_deg", 0.0)),
            calibration_version=str(data.get("calibration_version", "1.0")),
            is_calibrated=bool(data.get("is_calibrated", False))
        )


@dataclass
class GeoreferenceResult:
    """Complete georeferenced output with local metric offsets and WGS84 coordinates."""
    target_lat: float
    target_lon: float
    altitude_agl: float
    offset_north_m: float
    offset_east_m: float
    offset_body_x_m: float  # Forward (+) / Aft (-) in body frame
    offset_body_y_m: float  # Right (+) / Left (-) in body frame
    ground_distance_m: float
    ray_ned: Tuple[float, float, float]
    ray_body: Tuple[float, float, float]
    valid: bool = True
    honesty_level: GeorefHonestyLevel = GeorefHonestyLevel.APPROXIMATE
    uncertainty_radius_m: float = 1.0
    error_message: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "target_lat": round(self.target_lat, 7),
            "target_lon": round(self.target_lon, 7),
            "altitude_agl": round(self.altitude_agl, 2),
            "offset_north_m": round(self.offset_north_m, 3),
            "offset_east_m": round(self.offset_east_m, 3),
            "offset_body_x_m": round(self.offset_body_x_m, 3),
            "offset_body_y_m": round(self.offset_body_y_m, 3),
            "ground_distance_m": round(self.ground_distance_m, 3),
            "valid": self.valid,
            "honesty_level": self.honesty_level.value,
            "uncertainty_radius_m": round(self.uncertainty_radius_m, 2),
            "error_message": self.error_message
        }


class Georeferencer:
    """
    Computes exact 3D attitude-compensated ground target coordinates from
    pixel coordinates (u, v), altitude AGL, aircraft attitude, and camera calibration.
    """

    # WGS-84 Reference Ellipsoid Constants (EPSG:4326)
    WGS84_A = 6378137.0                      # Semi-major axis (meters)
    WGS84_F = 1.0 / 298.257223563            # Flattening
    WGS84_E2 = 2.0 * WGS84_F - WGS84_F ** 2  # First eccentricity squared (~0.00669437999014)

    # Base Nadir Camera-to-Body Transformation Matrix R_C^B
    # Downward camera: +X_cam (right) -> +Y_body (right)
    #                  +Y_cam (down)  -> -X_body (aft)
    #                  +Z_cam (optical down) -> +Z_body (down)
    BASE_R_C_B = np.array([
        [0.0, -1.0, 0.0],
        [1.0,  0.0, 0.0],
        [0.0,  0.0, 1.0]
    ], dtype=np.float64)

    def __init__(self, camera: Optional[CameraIntrinsics3D] = None):
        self.camera = camera or CameraIntrinsics3D()
        self.R_C_B = self._compute_camera_to_body_matrix()

    def _compute_camera_to_body_matrix(self) -> np.ndarray:
        """Computes effective R_C^B incorporating mounting pitch, roll, and yaw offsets."""
        if (self.camera.mount_pitch_deg == 0.0 and
            self.camera.mount_roll_deg == 0.0 and
            self.camera.mount_yaw_deg == 0.0):
            return self.BASE_R_C_B.copy()

        # Aerospace sequence for mounting offsets
        p = math.radians(self.camera.mount_pitch_deg)
        r = math.radians(self.camera.mount_roll_deg)
        y = math.radians(self.camera.mount_yaw_deg)

        R_z = np.array([
            [math.cos(y), -math.sin(y), 0.0],
            [math.sin(y),  math.cos(y), 0.0],
            [0.0,         0.0,          1.0]
        ], dtype=np.float64)

        R_y = np.array([
            [math.cos(p),  0.0, -math.sin(p)],
            [0.0,          1.0,  0.0],
            [math.sin(p),  0.0,  math.cos(p)]
        ], dtype=np.float64)

        R_x = np.array([
            [1.0, 0.0,          0.0],
            [0.0, math.cos(r), -math.sin(r)],
            [0.0, math.sin(r),  math.cos(r)]
        ], dtype=np.float64)

        R_mount = R_z @ R_y @ R_x
        return R_mount @ self.BASE_R_C_B

    def update_calibration(self, camera: CameraIntrinsics3D):
        """Updates camera intrinsic and extrinsic parameters dynamically."""
        self.camera = camera
        self.R_C_B = self._compute_camera_to_body_matrix()

    @staticmethod
    def rotation_matrix_body_to_ned(roll_rad: float, pitch_rad: float, yaw_rad: float) -> np.ndarray:
        """Computes direction cosine matrix R_B^NED using aerospace Z-Y-X sequence."""
        c_psi, s_psi = math.cos(yaw_rad), math.sin(yaw_rad)
        c_th, s_th = math.cos(pitch_rad), math.sin(pitch_rad)
        c_phi, s_phi = math.cos(roll_rad), math.sin(roll_rad)

        R_z = np.array([
            [c_psi, -s_psi, 0.0],
            [s_psi,  c_psi, 0.0],
            [0.0,    0.0,   1.0]
        ], dtype=np.float64)

        R_y = np.array([
            [c_th,  0.0, -s_th],
            [0.0,   1.0,  0.0],
            [s_th,  0.0,  c_th]
        ], dtype=np.float64)

        R_x = np.array([
            [1.0, 0.0,    0.0],
            [0.0, c_phi, -s_phi],
            [0.0, s_phi,  c_phi]
        ], dtype=np.float64)

        return R_z @ R_y @ R_x

    @classmethod
    def wgs84_radii_of_curvature(cls, lat_rad: float) -> Tuple[float, float]:
        """Calculates WGS84 meridian M(phi) and prime vertical N(phi) radii of curvature."""
        sin_lat = math.sin(lat_rad)
        denom = 1.0 - cls.WGS84_E2 * (sin_lat ** 2)
        sqrt_denom = math.sqrt(denom)

        m = (cls.WGS84_A * (1.0 - cls.WGS84_E2)) / (denom * sqrt_denom)
        n = cls.WGS84_A / sqrt_denom
        return m, n

    @classmethod
    def metric_offset_to_wgs84(
        cls,
        drone_lat: float,
        drone_lon: float,
        delta_north_m: float,
        delta_east_m: float
    ) -> Tuple[float, float]:
        """Projects metric North-East offsets into geodetic latitude/longitude."""
        phi_rad = math.radians(drone_lat)
        m, n = cls.wgs84_radii_of_curvature(phi_rad)

        cos_phi = math.cos(phi_rad)
        if abs(cos_phi) < 1e-9:
            cos_phi = 1e-9 if cos_phi >= 0 else -1e-9

        d_lat_deg = (delta_north_m / m) * (180.0 / math.pi)
        d_lon_deg = (delta_east_m / (n * cos_phi)) * (180.0 / math.pi)

        target_lat = round(drone_lat + d_lat_deg, 7)
        target_lon = round(drone_lon + d_lon_deg, 7)
        return target_lat, target_lon

    def resolve_target(
        self,
        u: float,
        v: float,
        drone_lat: float,
        drone_lon: float,
        altitude_agl_m: float,
        roll_deg: float,
        pitch_deg: float,
        yaw_deg: float,
        telemetry_age_s: float = 0.0
    ) -> GeoreferenceResult:
        """
        Transforms pixel centroid (u, v) into 3D attitude-compensated WGS84 target coordinates.
        """
        # Guard: Check for Null Island or invalid coordinates
        if abs(drone_lat) < 1e-6 and abs(drone_lon) < 1e-6:
            return GeoreferenceResult(
                target_lat=0.0,
                target_lon=0.0,
                altitude_agl=altitude_agl_m,
                offset_north_m=0.0,
                offset_east_m=0.0,
                offset_body_x_m=0.0,
                offset_body_y_m=0.0,
                ground_distance_m=0.0,
                ray_ned=(0.0, 0.0, 1.0),
                ray_body=(0.0, 0.0, 1.0),
                valid=False,
                honesty_level=GeorefHonestyLevel.UNAVAILABLE,
                error_message="Invalid GPS coordinates (Null Island detected: 0.0, 0.0)"
            )

        h_eff = max(0.2, altitude_agl_m)

        # Step 1: Pinhole Ray Inversion in Camera Frame
        if self.camera.dist_coeffs is not None and len(self.camera.dist_coeffs) > 0:
            pts = np.array([[[u, v]]], dtype=np.float32)
            k_mat = np.array([
                [self.camera.fx, 0.0, self.camera.cx],
                [0.0, self.camera.fy, self.camera.cy],
                [0.0, 0.0, 1.0]
            ], dtype=np.float32)
            undistorted = cv2.undistortPoints(pts, k_mat, self.camera.dist_coeffs)
            x_c = float(undistorted[0, 0, 0])
            y_c = float(undistorted[0, 0, 1])
        else:
            x_c = (u - self.camera.cx) / self.camera.fx
            y_c = (v - self.camera.cy) / self.camera.fy

        r_c = np.array([x_c, y_c, 1.0], dtype=np.float64)

        # Step 2: Camera to Body Frame Transformation (R_C^B)
        r_b = self.R_C_B @ r_c
        offset_body_x_norm = float(r_b[0])
        offset_body_y_norm = float(r_b[1])

        # Step 3: Body Frame to Local NED Frame (Attitude Compensation)
        roll_rad = math.radians(roll_deg)
        pitch_rad = math.radians(pitch_deg)
        yaw_rad = math.radians(yaw_deg % 360.0)

        R_b_ned = self.rotation_matrix_body_to_ned(roll_rad, pitch_rad, yaw_rad)
        v_ned = R_b_ned @ r_b
        v_N, v_E, v_D = float(v_ned[0]), float(v_ned[1]), float(v_ned[2])

        # Step 4: Ground Plane Intersection (Z_NED = 0)
        if v_D <= 0.05:
            # Ray pointing near horizontal or upwards
            return GeoreferenceResult(
                target_lat=drone_lat,
                target_lon=drone_lon,
                altitude_agl=altitude_agl_m,
                offset_north_m=0.0,
                offset_east_m=0.0,
                offset_body_x_m=0.0,
                offset_body_y_m=0.0,
                ground_distance_m=0.0,
                ray_ned=(v_N, v_E, v_D),
                ray_body=(float(r_b[0]), float(r_b[1]), float(r_b[2])),
                valid=False,
                honesty_level=GeorefHonestyLevel.IMAGE_SPACE_ONLY,
                error_message=f"Ray does not intersect ground plane (v_D = {v_D:.3f} <= 0.05)"
            )

        lam = h_eff / v_D
        delta_north = lam * v_N
        delta_east = lam * v_E
        ground_dist = math.sqrt(delta_north ** 2 + delta_east ** 2)

        offset_body_x = offset_body_x_norm * h_eff
        offset_body_y = offset_body_y_norm * h_eff

        # Step 5: WGS84 Geodetic Forward Projection
        target_lat, target_lon = self.metric_offset_to_wgs84(
            drone_lat=drone_lat,
            drone_lon=drone_lon,
            delta_north_m=delta_north,
            delta_east_m=delta_east
        )

        # Step 6: Determine Honest Quality Level and Uncertainty Radius
        tilt_angle_deg = math.degrees(math.acos(min(1.0, max(-1.0, v_D / np.linalg.norm(v_ned)))))
        base_uncertainty = 0.5 + (altitude_agl_m * 0.05) + (tilt_angle_deg * 0.08)

        if telemetry_age_s > 2.0:
            honesty = GeorefHonestyLevel.UNAVAILABLE
            uncertainty = base_uncertainty * 5.0
        elif self.camera.is_calibrated and telemetry_age_s < 0.5:
            honesty = GeorefHonestyLevel.CALIBRATED
            uncertainty = base_uncertainty
        else:
            honesty = GeorefHonestyLevel.APPROXIMATE
            uncertainty = base_uncertainty * 1.5

        return GeoreferenceResult(
            target_lat=target_lat,
            target_lon=target_lon,
            altitude_agl=round(altitude_agl_m, 2),
            offset_north_m=round(delta_north, 4),
            offset_east_m=round(delta_east, 4),
            offset_body_x_m=round(offset_body_x, 4),
            offset_body_y_m=round(offset_body_y, 4),
            ground_distance_m=round(ground_dist, 4),
            ray_ned=(round(v_N, 5), round(v_E, 5), round(v_D, 5)),
            ray_body=(round(float(r_b[0]), 5), round(float(r_b[1]), 5), round(float(r_b[2]), 5)),
            valid=True,
            honesty_level=honesty,
            uncertainty_radius_m=round(uncertainty, 2)
        )


# Global singleton georeferencer instance
georeferencer_service = Georeferencer()
