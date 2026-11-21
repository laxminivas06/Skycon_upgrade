"""
SKYCON System — Geodesic & Navigation Math Utilities
"""

import math
from typing import Dict, List, Any


def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates geodesic distance between two coordinates in meters."""
    R = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


def point_in_polygon_test(lat: float, lon: float, polygon: List[Dict[str, float]]) -> bool:
    """Ray-casting test for point-in-polygon containment."""
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
