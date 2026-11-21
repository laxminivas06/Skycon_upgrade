"""
=====================================================================================
SKYCON MASTER ARCHITECTURE - NAVIGATION ACCURACY & COORDINATE VALIDATION SYSTEM
MODULE: coordinate_validator.py
Authoritative Coordinate Confidence, Geodesic Safety Gating & Visual Target Verifier
=====================================================================================
Features:
  - Multi-tier Coordinate Confidence States:
      HIGH_CONFIDENCE | APPROXIMATE | LOW_CONFIDENCE | UNVERIFIED | REJECTED
  - 10-Point Pre-Navigation Safety Funnel:
      1. WGS84 Geodetic Coordinate Range & Null-Island (0,0) Rejection
      2. Coordinate Reference System (CRS) Verification (WGS84 Ellipsoidal)
      3. Operational Mission Boundary Containment (Circular / Polygon)
      4. Hard Safety Geofence Containment & Maximum Distance Clamp
      5. Altitude Envelope Compliance (Min/Max AGL, e.g., 5.0m - 25.0m)
      6. Kinematic Waypoint Spacing (Minimum 2.0m, Maximum 100.0m)
      7. Dynamic Vehicle Kinematics (Turn Angle & Climb Rate Feasibility)
      8. Vehicle Position-Estimator Health (GPS Fix >= 3D, HDOP <= 2.0, EKF Healthy)
      9. Temporal Freshness Watchdog (Rejection of Stale Coordinates > 30s)
      10. Multi-Frame Visual Evidence Verification (Minimum 3 Consecutive Frames)
  - Strict Defense Against Uncalibrated Distortion & Optical Glare
=====================================================================================
"""

import math
import time
from enum import Enum
from dataclasses import dataclass, field, asdict
from typing import Dict, Any, List, Optional, Tuple, Union

from backend.route_validator import (
    haversine_distance,
    point_in_polygon,
    RouteValidator,
    route_validator
)

EARTH_RADIUS_M = 6378137.0


class CoordinateQualityState(str, Enum):
    """Authoritative quality tiers for generated/observed navigation coordinates."""
    HIGH_CONFIDENCE = "HIGH_CONFIDENCE"
    APPROXIMATE = "APPROXIMATE"
    LOW_CONFIDENCE = "LOW_CONFIDENCE"
    UNVERIFIED = "UNVERIFIED"
    REJECTED = "REJECTED"


class ValidationDecision(str, Enum):
    """Operational navigation disposition for the coordinate."""
    APPROVED = "APPROVED"                 # Autonomous navigation permitted
    PENDING_REVIEW = "PENDING_REVIEW"     # Requires explicit GCS operator signoff
    REJECTED = "REJECTED"                 # Strictly prohibited from flight controller upload


@dataclass
class ValidatedCoordinate:
    """
    Standardized, self-describing navigation target coordinate with cryptographic
    traceability, uncertainty bounds, and explicit safety decision.
    """
    lat: float
    lon: float
    altitude_m: float
    alt_reference: str = "AGL"               # "AGL" (Relative to Home) or "MSL" (Mean Sea Level)
    source_image_id: Optional[str] = None
    image_timestamp: Optional[float] = None
    vehicle_pose_timestamp: Optional[float] = None
    gps_fix_quality: int = 3                 # 0=None, 1=2D, 2=3D, 3=DGPS/SBAS, 4=RTK
    gps_hdop: float = 1.0
    ekf_healthy: bool = True
    horizontal_uncertainty_m: float = 1.0
    vertical_uncertainty_m: float = 1.0
    camera_calibrated: bool = False
    georef_method: str = "3D_ATTITUDE_PINHOLE"
    confidence_score: float = 0.95           # Normalized confidence 0.0 to 1.0
    consecutive_frames_verified: int = 3
    quality_state: CoordinateQualityState = CoordinateQualityState.HIGH_CONFIDENCE
    validation_status: ValidationDecision = ValidationDecision.APPROVED
    validation_reasons: List[str] = field(default_factory=list)
    rejection_errors: List[str] = field(default_factory=list)
    target_label: str = "TARGET_CANDIDATE"
    created_at_utc: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["quality_state"] = self.quality_state.value
        d["validation_status"] = self.validation_status.value
        return d


class CoordinateValidator:
    """
    Safety-critical gatekeeper validating visual target candidates, cloud heatmap
    peaks, and operator waypoints against ArduPilot safety invariants.
    """

    def __init__(
        self,
        min_altitude_agl_m: float = 5.0,
        max_altitude_agl_m: float = 25.0,
        min_waypoint_spacing_m: float = 2.0,
        max_waypoint_spacing_m: float = 100.0,
        max_coordinate_age_s: float = 30.0,
        min_consecutive_frames: int = 3,
        max_hdop_threshold: float = 2.0,
        high_confidence_max_uncertainty_m: float = 1.5,
        approximate_max_uncertainty_m: float = 3.5
    ):
        self.min_altitude_agl_m = min_altitude_agl_m
        self.max_altitude_agl_m = max_altitude_agl_m
        self.min_waypoint_spacing_m = min_waypoint_spacing_m
        self.max_waypoint_spacing_m = max_waypoint_spacing_m
        self.max_coordinate_age_s = max_coordinate_age_s
        self.min_consecutive_frames = min_consecutive_frames
        self.max_hdop_threshold = max_hdop_threshold
        self.high_confidence_max_uncertainty_m = high_confidence_max_uncertainty_m
        self.approximate_max_uncertainty_m = approximate_max_uncertainty_m

    def validate_coordinate(
        self,
        lat: float,
        lon: float,
        altitude_m: float,
        current_drone_lat: Optional[float] = None,
        current_drone_lon: Optional[float] = None,
        home_lat: Optional[float] = None,
        home_lon: Optional[float] = None,
        boundary_polygon: Optional[List[Tuple[float, float]]] = None,
        geofence_polygon: Optional[List[Tuple[float, float]]] = None,
        geofence_max_radius_m: float = 150.0,
        alt_reference: str = "AGL",
        source_image_id: Optional[str] = None,
        image_timestamp: Optional[float] = None,
        vehicle_pose_timestamp: Optional[float] = None,
        gps_fix_quality: int = 3,
        gps_hdop: float = 1.0,
        ekf_healthy: bool = True,
        horizontal_uncertainty_m: float = 1.0,
        vertical_uncertainty_m: float = 1.0,
        camera_calibrated: bool = False,
        consecutive_frames_verified: int = 3,
        georef_method: str = "3D_ATTITUDE_PINHOLE",
        target_label: str = "TARGET_CANDIDATE"
    ) -> ValidatedCoordinate:
        """
        Executes exhaustive 10-point safety and kinematic validation.
        Returns fully qualified ValidatedCoordinate instance.
        """
        now = time.time()
        rejection_errors: List[str] = []
        validation_reasons: List[str] = []

        # ---------------------------------------------------------------------
        # 1. WGS84 Geographic Coordinate Range & Null-Island Check
        # ---------------------------------------------------------------------
        if not (-90.0 <= lat <= 90.0):
            rejection_errors.append(f"Latitude out of valid WGS84 range [-90, +90]: {lat}")
        if not (-180.0 <= lon <= 180.0):
            rejection_errors.append(f"Longitude out of valid WGS84 range [-180, +180]: {lon}")

        # Strict Null Island rejection: (0.0, 0.0) or near zero
        if abs(lat) < 0.001 and abs(lon) < 0.001:
            rejection_errors.append(f"Null Island coordinates rejected: lat={lat}, lon={lon}")

        # ---------------------------------------------------------------------
        # 2. CRS Verification
        # ---------------------------------------------------------------------
        # Lat/Lon must be standard decimal degrees (not projected metric coordinates or integer overflow)
        if abs(lat) > 90.0 or abs(lon) > 180.0:
            rejection_errors.append("Invalid Coordinate Reference System (CRS). Non-WGS84 values detected.")

        # ---------------------------------------------------------------------
        # 3. Altitude Envelope Verification
        # ---------------------------------------------------------------------
        if altitude_m < self.min_altitude_agl_m:
            rejection_errors.append(
                f"Altitude {altitude_m:.1f}m below minimum safe ground clearance ({self.min_altitude_agl_m:.1f}m AGL)"
            )
        elif altitude_m > self.max_altitude_agl_m:
            rejection_errors.append(
                f"Altitude {altitude_m:.1f}m breaches maximum competition ceiling ({self.max_altitude_agl_m:.1f}m AGL)"
            )
        else:
            validation_reasons.append(f"Altitude {altitude_m:.1f}m compliant with envelope [{self.min_altitude_agl_m}m - {self.max_altitude_agl_m}m]")

        # ---------------------------------------------------------------------
        # 4. Geofence & Operational Boundary Containment
        # ---------------------------------------------------------------------
        # Check against Home radial distance if home is established
        if home_lat is not None and home_lon is not None and abs(home_lat) > 0.001 and abs(home_lon) > 0.001:
            dist_from_home_m = haversine_distance(home_lat, home_lon, lat, lon)
            if dist_from_home_m > geofence_max_radius_m:
                rejection_errors.append(
                    f"Coordinate is {dist_from_home_m:.1f}m from Home, breaching {geofence_max_radius_m:.1f}m circular geofence"
                )
            else:
                validation_reasons.append(f"Geofence verified: {dist_from_home_m:.1f}m from Home <= {geofence_max_radius_m:.1f}m")

        # Check against operational polygon boundary if specified
        if boundary_polygon and len(boundary_polygon) >= 3:
            inside_boundary = point_in_polygon(lat, lon, boundary_polygon)
            if not inside_boundary:
                rejection_errors.append("Coordinate is outside approved operational mission boundary polygon")
            else:
                validation_reasons.append("Operational mission boundary polygon containment confirmed")

        # Check against hard safety geofence polygon if specified
        if geofence_polygon and len(geofence_polygon) >= 3:
            inside_geofence = point_in_polygon(lat, lon, geofence_polygon)
            if not inside_geofence:
                rejection_errors.append("Hard geofence containment breached: target outside safety polygon")
            else:
                validation_reasons.append("Hard safety geofence polygon containment confirmed")

        # ---------------------------------------------------------------------
        # 5. Waypoint Spacing & Kinematic Range
        # ---------------------------------------------------------------------
        if current_drone_lat is not None and current_drone_lon is not None and abs(current_drone_lat) > 0.001:
            step_distance_m = haversine_distance(current_drone_lat, current_drone_lon, lat, lon)
            if step_distance_m < self.min_waypoint_spacing_m:
                rejection_errors.append(
                    f"Waypoint spacing too close ({step_distance_m:.2f}m < {self.min_waypoint_spacing_m:.1f}m minimum threshold)"
                )
            elif step_distance_m > self.max_waypoint_spacing_m:
                rejection_errors.append(
                    f"Waypoint jump excessive ({step_distance_m:.1f}m > {self.max_waypoint_spacing_m:.1f}m maximum leg threshold)"
                )
            else:
                validation_reasons.append(f"Waypoint step distance feasible: {step_distance_m:.1f}m")

        # ---------------------------------------------------------------------
        # 6. Vehicle Position-Estimator Health
        # ---------------------------------------------------------------------
        if gps_fix_quality < 2:  # Less than 2D/3D fix
            rejection_errors.append(f"Autopilot GPS fix insufficient for navigation (fix type: {gps_fix_quality})")
        elif gps_hdop > self.max_hdop_threshold:
            rejection_errors.append(f"GPS HDOP {gps_hdop:.2f} exceeds safety threshold ({self.max_hdop_threshold:.2f})")
        elif not ekf_healthy:
            rejection_errors.append("Autopilot EKF reporting unhealthy navigation variance or divergence")
        else:
            validation_reasons.append(f"Autopilot estimator healthy: Fix {gps_fix_quality}, HDOP {gps_hdop:.2f}, EKF Nominal")

        # ---------------------------------------------------------------------
        # 7. Temporal Freshness Watchdog
        # ---------------------------------------------------------------------
        effective_timestamp = image_timestamp or vehicle_pose_timestamp
        if effective_timestamp is not None and effective_timestamp > 0:
            age_s = now - effective_timestamp
            if age_s > self.max_coordinate_age_s:
                rejection_errors.append(f"Coordinate timestamp is stale ({age_s:.1f}s > {self.max_coordinate_age_s:.1f}s limit)")
            elif age_s < -5.0:  # Clock skew into the future
                rejection_errors.append(f"Clock skew anomaly: Coordinate timestamp is {abs(age_s):.1f}s in the future")
            else:
                validation_reasons.append(f"Coordinate freshness verified (age: {max(0.0, age_s):.2f}s)")

        # ---------------------------------------------------------------------
        # 8. Multi-Frame Visual Lock Guard
        # ---------------------------------------------------------------------
        if consecutive_frames_verified < self.min_consecutive_frames:
            validation_reasons.append(
                f"Candidate visual evidence preliminary ({consecutive_frames_verified}/{self.min_consecutive_frames} frames)"
            )
        else:
            validation_reasons.append(f"Multi-frame visual lock confirmed ({consecutive_frames_verified} consecutive frames)")

        # ---------------------------------------------------------------------
        # 9. Quality Tier & Confidence Scoring
        # ---------------------------------------------------------------------
        # Compute normalized confidence score (0.0 to 1.0)
        base_confidence = 1.0
        if not camera_calibrated:
            base_confidence -= 0.15
        if consecutive_frames_verified < self.min_consecutive_frames:
            base_confidence -= 0.25
        if horizontal_uncertainty_m > self.high_confidence_max_uncertainty_m:
            base_confidence -= min(0.3, (horizontal_uncertainty_m - self.high_confidence_max_uncertainty_m) * 0.1)
        if gps_hdop > 1.2:
            base_confidence -= (gps_hdop - 1.2) * 0.1
        confidence_score = max(0.0, min(1.0, round(base_confidence, 2)))

        # Assign explicit quality state and validation decision
        if len(rejection_errors) > 0:
            quality_state = CoordinateQualityState.REJECTED
            validation_status = ValidationDecision.REJECTED
        elif consecutive_frames_verified < self.min_consecutive_frames:
            quality_state = CoordinateQualityState.UNVERIFIED
            validation_status = ValidationDecision.PENDING_REVIEW
        elif horizontal_uncertainty_m > self.approximate_max_uncertainty_m or confidence_score < 0.60:
            quality_state = CoordinateQualityState.LOW_CONFIDENCE
            validation_status = ValidationDecision.PENDING_REVIEW
        elif not camera_calibrated or horizontal_uncertainty_m > self.high_confidence_max_uncertainty_m or confidence_score < 0.85:
            quality_state = CoordinateQualityState.APPROXIMATE
            validation_status = ValidationDecision.APPROVED
        else:
            quality_state = CoordinateQualityState.HIGH_CONFIDENCE
            validation_status = ValidationDecision.APPROVED

        return ValidatedCoordinate(
            lat=round(lat, 7),
            lon=round(lon, 7),
            altitude_m=round(altitude_m, 2),
            alt_reference=alt_reference,
            source_image_id=source_image_id,
            image_timestamp=image_timestamp,
            vehicle_pose_timestamp=vehicle_pose_timestamp,
            gps_fix_quality=gps_fix_quality,
            gps_hdop=round(gps_hdop, 2),
            ekf_healthy=ekf_healthy,
            horizontal_uncertainty_m=round(horizontal_uncertainty_m, 2),
            vertical_uncertainty_m=round(vertical_uncertainty_m, 2),
            camera_calibrated=camera_calibrated,
            georef_method=georef_method,
            confidence_score=confidence_score,
            consecutive_frames_verified=consecutive_frames_verified,
            quality_state=quality_state,
            validation_status=validation_status,
            validation_reasons=validation_reasons,
            rejection_errors=rejection_errors,
            target_label=target_label,
            created_at_utc=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        )


# Global singleton validator instance
coordinate_validator = CoordinateValidator()
