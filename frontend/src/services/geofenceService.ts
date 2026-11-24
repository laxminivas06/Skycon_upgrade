/**
 * Geofence Coordination Service
 * Manages autonomous geofence boundaries (Circle, Rectangle, Arena, Polygon),
 * altitude ceilings/floors, breach failsafe actions (RTL, LOITER, LAND),
 * real-time telemetry breach monitoring, and MAVLink / Pixhawk synchronization.
 */

import { mavlinkService } from './mavlinkService';
import { audioService } from './audioService';
import { LatLngPoint } from '../types/mission';

export type GeofenceShape = 'ARENA_RECTANGLE' | 'CIRCLE' | 'CUSTOM_POLYGON';
export type GeofenceBreachAction = 'RTL' | 'LOITER' | 'LAND' | 'POSHOLD';
export type GeofenceAnchor = 'HOME' | 'DRONE' | 'CUSTOM';
export type GeofenceLockStatus = 'ACTIVE_ARMED_LOCKED' | 'BREACHED' | 'BYPASSED_OFF';

export interface GeofenceConfig {
  enabled: boolean;
  shape: GeofenceShape;
  radiusMeters: number;          // for CIRCLE
  widthMeters: number;           // for ARENA_RECTANGLE (East-West)
  heightMeters: number;          // for ARENA_RECTANGLE (North-South)
  maxAltitudeMeters: number;     // Ceiling AGL
  minAltitudeMeters: number;     // Floor AGL
  breachAction: GeofenceBreachAction;
  anchorType: GeofenceAnchor;
  customAnchor: LatLngPoint | null;
  customVertices: LatLngPoint[];
}

export interface GeofenceState extends GeofenceConfig {
  isBreached: boolean;
  breachReason: string | null;
  distanceToBoundaryMeters: number | null;
  currentAltitudeMeters: number;
  lastBreachTimestamp: number | null;
  effectiveAnchor: LatLngPoint | null;
  geofenceStatus: GeofenceLockStatus;
}

const STORAGE_KEY = 'cade_geofence_config_v2';

// Standard SAE India ADDC Rule 3.3 Defaults: 50m x 50m Arena, 25m Ceiling, RTL Action
const DEFAULT_CONFIG: GeofenceConfig = {
  enabled: true,
  shape: 'ARENA_RECTANGLE',
  radiusMeters: 50,
  widthMeters: 50,
  heightMeters: 50,
  maxAltitudeMeters: 25.0,
  minAltitudeMeters: 0.8,
  breachAction: 'RTL',
  anchorType: 'HOME',
  customAnchor: null,
  customVertices: [],
};

/**
 * Deterministic even-odd ray-casting algorithm to test whether a GPS point
 * is strictly inside an arbitrary closed polygon.
 */
/**
 * Coordinate Normalization Helper
 * Normalizes all polygon vertices and drone coordinates supporting {lat, lon}, {lat, lng}, and [lat, lng].
 * Filters out invalid or (0,0) coordinates.
 */
export function normalizeCoord(pt: any): LatLngPoint | null {
  if (!pt) return null;
  let lat = 0;
  let lng = 0;
  if (Array.isArray(pt)) {
    lat = Number(pt[0]);
    lng = Number(pt[1]);
  } else if (typeof pt === 'object') {
    lat = Number(pt.lat ?? pt.latitude ?? 0);
    lng = Number(pt.lng ?? pt.lon ?? pt.longitude ?? 0);
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) return null;
  if (Math.abs(lat) > 90.0 || Math.abs(lng) > 180.0) return null;
  return { lat, lng };
}

/**
 * Calculates whether a point lies within a transit corridor of given width
 * connecting a start point to an end point (perpendicular distance test).
 */
export function isPointInCorridor(
  dronePt: LatLngPoint,
  startPt: LatLngPoint,
  endPt: LatLngPoint,
  corridorWidthMeters: number = 4.0
): boolean {
  const radLat = (startPt.lat * Math.PI) / 180;
  const dx = (endPt.lng - startPt.lng) * 111320 * Math.cos(radLat);
  const dy = (endPt.lat - startPt.lat) * 111320;
  const segLenSq = dx * dx + dy * dy;
  if (segLenSq < 0.01) {
    const d = computeHaversine(startPt.lat, startPt.lng, dronePt.lat, dronePt.lng);
    return d <= (corridorWidthMeters / 2);
  }

  const px = (dronePt.lng - startPt.lng) * 111320 * Math.cos(radLat);
  const py = (dronePt.lat - startPt.lat) * 111320;

  // Project point onto line segment
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / segLenSq));
  const projX = t * dx;
  const projY = t * dy;
  const distToSeg = Math.hypot(px - projX, py - projY);

  return distToSeg <= (corridorWidthMeters / 2);
}

export function isPointInsideGeofence(lat: number, lon: number, polygon: LatLngPoint[]): boolean {
  if (!polygon || polygon.length < 3) return true;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat;
    const yi = polygon[i].lng;
    const xj = polygon[j].lat;
    const yj = polygon[j].lng;

    const intersect = ((yi > lon) !== (yj > lon)) &&
      (lat < ((xj - xi) * (lon - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Calculates the geometric centroid (average lat/lng) of a polygon.
 */
export function getPolygonCentroid(polygon: LatLngPoint[]): LatLngPoint {
  if (!polygon || polygon.length === 0) return { lat: 12.9715987, lng: 77.5945627 };
  let sumLat = 0;
  let sumLon = 0;
  for (const pt of polygon) {
    sumLat += pt.lat;
    sumLon += pt.lng;
  }
  return {
    lat: sumLat / polygon.length,
    lng: sumLon / polygon.length
  };
}

/**
 * Guaranteed interior anchor for convex and concave polygons alike.
 * If the arithmetic centroid is strictly inside the polygon, returns the centroid.
 * If the arithmetic centroid lies outside (concave L/U-shaped polygon),
 * tests candidate interior midpoints between vertices and picks the interior point
 * with the highest clearance from the perimeter.
 */
export function getSafeInteriorAnchor(polygon: LatLngPoint[]): LatLngPoint {
  if (!polygon || polygon.length === 0) return { lat: 12.9715987, lng: 77.5945627 };
  if (polygon.length < 3) return polygon[0];

  const centroid = getPolygonCentroid(polygon);
  let centroidMinDist = Infinity;
  for (const v of polygon) {
    const d = computeHaversine(centroid.lat, centroid.lng, v.lat, v.lng);
    if (d < centroidMinDist) centroidMinDist = d;
  }

  if (isPointInsideGeofence(centroid.lat, centroid.lng, polygon) && centroidMinDist >= 2.0) {
    return centroid;
  }

  // Centroid lies outside concave polygon or directly on a corner! Search for best interior point
  let bestInteriorPt: LatLngPoint | null = null;
  let maxClearance = -1;

  // 1. Test midpoints between all pairs of vertices
  const candidates: LatLngPoint[] = [];
  for (let i = 0; i < polygon.length; i++) {
    for (let j = i + 1; j < polygon.length; j++) {
      candidates.push({
        lat: (polygon[i].lat + polygon[j].lat) / 2,
        lng: (polygon[i].lng + polygon[j].lng) / 2
      });
    }
  }

  // 2. Also test bounding box grid sampling
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of polygon) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  const dLatStep = (maxLat - minLat) / 8;
  const dLngStep = (maxLng - minLng) / 8;
  for (let r = 1; r < 8; r++) {
    for (let c = 1; c < 8; c++) {
      candidates.push({
        lat: minLat + r * dLatStep,
        lng: minLng + c * dLngStep
      });
    }
  }

  // Evaluate candidate interior points
  for (const cand of candidates) {
    if (isPointInsideGeofence(cand.lat, cand.lng, polygon)) {
      let minDist = Infinity;
      for (const v of polygon) {
        const d = computeHaversine(cand.lat, cand.lng, v.lat, v.lng);
        if (d < minDist) minDist = d;
      }
      if (minDist > maxClearance) {
        maxClearance = minDist;
        bestInteriorPt = cand;
      }
    }
  }

  if (bestInteriorPt) {
    return bestInteriorPt;
  }

  // Fallback: verified first vertex or midpoint
  return polygon[0];
}

/**
 * Clamps a waypoint inside a polygon by vectoring inward toward a guaranteed safe interior anchor
 * by a specified margin in meters if the point is outside or too close to the perimeter.
 */
export function clampWaypointToGeofence(wp: LatLngPoint, polygon: LatLngPoint[], marginMeters: number = 2.0): LatLngPoint {
  if (!polygon || polygon.length < 3) return wp;
  const anchor = getSafeInteriorAnchor(polygon);
  const inside = isPointInsideGeofence(wp.lat, wp.lng, polygon);

  let point = { ...wp };

  if (!inside) {
    // Binary search towards safe interior anchor to find boundary intersection
    let low = 0.0;
    let high = 1.0;
    let clamped = { ...anchor };

    for (let iter = 0; iter < 16; iter++) {
      const mid = (low + high) / 2;
      const testLat = wp.lat + (anchor.lat - wp.lat) * mid;
      const testLng = wp.lng + (anchor.lng - wp.lng) * mid;
      if (isPointInsideGeofence(testLat, testLng, polygon)) {
        clamped = { lat: testLat, lng: testLng };
        high = mid;
      } else {
        low = mid;
      }
    }
    point = clamped;
  }

  // Apply safety buffer inward toward safe interior anchor
  if (marginMeters > 0) {
    const distToCenter = computeHaversine(point.lat, point.lng, anchor.lat, anchor.lng);
    if (distToCenter > marginMeters) {
      const ratio = Math.min(1.0, marginMeters / distToCenter);
      point = {
        lat: point.lat + (anchor.lat - point.lat) * ratio,
        lng: point.lng + (anchor.lng - point.lng) * ratio,
      };
    } else {
      point = { ...anchor };
    }
  }

  return point;
}

// Geodesic destination helper using WGS-84 Earth radius
function computeDestination(lat: number, lon: number, distanceMeters: number, bearingDeg: number): LatLngPoint {
  const R = 6371000;
  const dByR = distanceMeters / R;
  const radBearing = (bearingDeg * Math.PI) / 180;
  const radLat = (lat * Math.PI) / 180;
  const radLon = (lon * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(radLat) * Math.cos(dByR) +
    Math.cos(radLat) * Math.sin(dByR) * Math.cos(radBearing)
  );
  const lon2 = radLon + Math.atan2(
    Math.sin(radBearing) * Math.sin(dByR) * Math.cos(radLat),
    Math.cos(dByR) - Math.sin(radLat) * Math.sin(lat2)
  );

  return {
    lat: (lat2 * 180) / Math.PI,
    lng: (lon2 * 180) / Math.PI,
  };
}

// Haversine distance in meters
function computeHaversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Point-in-polygon raycasting algorithm supporting both (pt, poly) and (lat, lon, poly)
export function isPointInPolygon(ptOrLat: LatLngPoint | number, polyOrLon: LatLngPoint[] | number, maybePoly?: LatLngPoint[]): boolean {
  let lat: number, lon: number, poly: LatLngPoint[];
  if (typeof ptOrLat === 'number') {
    lat = ptOrLat;
    lon = polyOrLon as number;
    poly = maybePoly || [];
  } else {
    lat = ptOrLat.lat;
    lon = ptOrLat.lng;
    poly = polyOrLon as LatLngPoint[];
  }
  return isPointInsideGeofence(lat, lon, poly);
}

class GeofenceService {
  private config: GeofenceConfig = { ...DEFAULT_CONFIG };
  private state: GeofenceState;
  private listeners: Set<(state: GeofenceState) => void> = new Set();
  private telemetryUnsubscribe: (() => void) | null = null;
  private breachAudioCooldown = 0;
  private autoFailsafeTriggered = false;

  // Debounce & Hysteresis State to prevent GPS jitter and packet flickering
  private consecutiveBreachCount = 0;
  private consecutiveClearCount = 0;
  private pendingBreachReason: string | null = null;
  private hasClimbedAboveFloor = false;
  private lastNotifyTimestamp = 0;
  private lastBreachActionTimestamp = 0;
  private takeoffInitiatedAt = 0;

  constructor() {
    this.restoreConfig();
    this.state = {
      ...this.config,
      isBreached: false,
      breachReason: null,
      distanceToBoundaryMeters: null,
      currentAltitudeMeters: 0,
      lastBreachTimestamp: null,
      effectiveAnchor: null,
      geofenceStatus: this.config.enabled ? 'ACTIVE_ARMED_LOCKED' : 'BYPASSED_OFF',
    };
    this.initTelemetry();
  }

  private restoreConfig() {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.config = { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch {
      this.config = { ...DEFAULT_CONFIG };
    }
  }

  private persistConfig() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch {}
  }

  private initTelemetry() {
    this.telemetryUnsubscribe = mavlinkService.subscribeTelemetry((telem) => {
      this.evaluateBreach(telem);
    });
  }

  public getEffectiveAnchor(): LatLngPoint | null {
    if (this.config.anchorType === 'CUSTOM' && this.config.customAnchor) {
      return this.config.customAnchor;
    }
    const home = mavlinkService.getHomePoint();
    if (this.config.anchorType === 'HOME' && home && home.isSet && Math.abs(home.latitude) > 0.001) {
      return { lat: home.latitude, lng: home.longitude };
    }
    const telem = mavlinkService.getTelemetry();
    if (telem && (telem.gps?.isLocked || (telem.gps?.satellites ?? 0) >= 4) && telem.latitude && Math.abs(telem.latitude) > 0.001) {
      return { lat: telem.latitude, lng: telem.longitude };
    }
    if (home && Math.abs(home.latitude) > 0.001) {
      return { lat: home.latitude, lng: home.longitude };
    }
    return null;
  }

  /**
   * Generates polygon vertices for map rendering and breach checks
   */
  public getBoundaryVertices(): LatLngPoint[] {
    if (this.config.shape === 'CUSTOM_POLYGON' && this.config.customVertices && this.config.customVertices.length >= 3) {
      return this.config.customVertices;
    }

    const anchor = this.getEffectiveAnchor();
    if (!anchor) return [];

    if (this.config.shape === 'ARENA_RECTANGLE') {
      const halfW = (this.config.widthMeters || 50) / 2;
      const halfH = (this.config.heightMeters || 50) / 2;
      const diag = Math.sqrt(halfW * halfW + halfH * halfH);
      const angle = (Math.atan2(halfW, halfH) * 180) / Math.PI;

      const p1 = computeDestination(anchor.lat, anchor.lng, diag, angle);
      const p2 = computeDestination(anchor.lat, anchor.lng, diag, 180 - angle);
      const p3 = computeDestination(anchor.lat, anchor.lng, diag, 180 + angle);
      const p4 = computeDestination(anchor.lat, anchor.lng, diag, 360 - angle);
      return [p1, p2, p3, p4];
    }

    if (this.config.shape === 'CIRCLE') {
      const radius = this.config.radiusMeters || 50;
      const segments = 32;
      const vertices: LatLngPoint[] = [];
      for (let i = 0; i < segments; i++) {
        const bearing = (i * 360) / segments;
        vertices.push(computeDestination(anchor.lat, anchor.lng, radius, bearing));
      }
      return vertices;
    }

    return [];
  }

  /**
   * Calculates true metric distance to the perimeter edge.
   * Positive distance = inside boundary; Negative distance = outside boundary.
   */
  private computeHorizontalDistance(dronePt: LatLngPoint, anchor: LatLngPoint): { isBreached: boolean; distToEdge: number } {
    // ADDC 2026 Dual-Zone Containment Check:
    // Zone B: Launch/Landing Pad Safe Circle (6.0m radius around Home)
    const home = mavlinkService.getHomePoint();
    if (home && home.isSet && Math.abs(home.latitude) > 0.001) {
      const distToHome = computeHaversine(home.latitude, home.longitude, dronePt.lat, dronePt.lng);
      if (distToHome <= 6.0) {
        // Drone is on or right above Launch/Landing Pad -> Inside Zone B
        return { isBreached: false, distToEdge: +(6.0 - distToHome).toFixed(1) };
      }

      // Zone C: Transit Corridor (4.0m width connecting Home to closest polygon vertex)
      const vertices = this.getBoundaryVertices();
      if (vertices.length >= 3) {
        let closestVertex = vertices[0];
        let minDist = computeHaversine(home.latitude, home.longitude, vertices[0].lat, vertices[0].lng);
        for (let i = 1; i < vertices.length; i++) {
          const d = computeHaversine(home.latitude, home.longitude, vertices[i].lat, vertices[i].lng);
          if (d < minDist) {
            minDist = d;
            closestVertex = vertices[i];
          }
        }
        if (isPointInCorridor(dronePt, { lat: home.latitude, lng: home.longitude }, closestVertex, 4.0)) {
          return { isBreached: false, distToEdge: 2.0 };
        }
      }
    }
    if (this.config.shape === 'CIRCLE') {
      const distFromCenter = computeHaversine(anchor.lat, anchor.lng, dronePt.lat, dronePt.lng);
      const radius = this.config.radiusMeters || 50;
      const distToEdge = +(radius - distFromCenter).toFixed(1);
      return {
        isBreached: distFromCenter > radius,
        distToEdge,
      };
    }

    if (this.config.shape === 'ARENA_RECTANGLE') {
      const radLat = (anchor.lat * Math.PI) / 180;
      const dx = (dronePt.lng - anchor.lng) * 111320 * Math.cos(radLat);
      const dy = (dronePt.lat - anchor.lat) * 111320;
      const hw = (this.config.widthMeters || 50) / 2;
      const hh = (this.config.heightMeters || 50) / 2;

      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (absDx <= hw && absDy <= hh) {
        // Drone is strictly inside rectangle: distance to closest edge
        const distToEdge = +(Math.min(hw - absDx, hh - absDy)).toFixed(1);
        return { isBreached: false, distToEdge };
      } else {
        // Drone is outside rectangle: true Euclidean distance outside
        const ox = Math.max(0, absDx - hw);
        const oy = Math.max(0, absDy - hh);
        const distOutside = Math.hypot(ox, oy);
        return { isBreached: true, distToEdge: +(-distOutside).toFixed(1) };
      }
    }

    if (this.config.shape === 'CUSTOM_POLYGON' && this.config.customVertices.length >= 3) {
      const inside = isPointInPolygon(dronePt, this.config.customVertices);
      const distFromCenter = computeHaversine(anchor.lat, anchor.lng, dronePt.lat, dronePt.lng);
      const approxRadius = 50;
      return {
        isBreached: !inside,
        distToEdge: inside ? +(approxRadius - distFromCenter).toFixed(1) : +(-distFromCenter).toFixed(1),
      };
    }

    return { isBreached: false, distToEdge: 0 };
  }

  private evaluateBreach(telem: any) {
    let currentAlt = telem.altitude ?? telem.altitudeMeters ?? 0;

    // Strict Ground Safety Guard:
    // If vehicle is disarmed, it is physically sitting on the ground -> strictly 0.0m AGL!
    if (!telem.isArmed) {
      currentAlt = 0.0;
    } else if (currentAlt > 100.0) {
      // In SAE India ADDC, no autonomous drone flies > 100m AGL (max ceiling is 25m).
      // A reading > 100m while armed indicates raw MSL elevation (e.g. 535.8m) leaked through.
      const homeAlt = mavlinkService.getHomePoint()?.altitude || telem.gps?.altitude || 0;
      if (homeAlt > 50 && currentAlt >= (homeAlt - 20)) {
        currentAlt = Math.max(0, currentAlt - homeAlt);
      } else {
        currentAlt = 0.0;
      }
    }
    this.state.currentAltitudeMeters = currentAlt;
    const anchor = this.getEffectiveAnchor();
    this.state.effectiveAnchor = anchor;

    // Check GPS validity robustly (has coords and either locked or sufficient satellites)
    const hasCoord = Boolean(telem.latitude && Math.abs(telem.latitude) > 0.001);
    const isGpsLocked = Boolean(
      telem.gps?.isLocked ||
      (telem.gps?.satellites ?? 0) >= 4 ||
      telem.gps?.fixType?.includes('3D') ||
      telem.isGpsValid
    );
    const isGpsValid = hasCoord && isGpsLocked;

    if (!this.config.enabled || !anchor) {
      if (this.state.isBreached) {
        this.state.isBreached = false;
        this.state.breachReason = null;
        this.autoFailsafeTriggered = false;
        this.notify();
      }
      this.consecutiveBreachCount = 0;
      this.consecutiveClearCount = 0;
      return;
    }

    // If GPS packet is momentarily missing on a non-GPS telemetry frame, hold state without flapping
    if (!isGpsValid) {
      if (!telem.isArmed && this.state.isBreached) {
        this.state.isBreached = false;
        this.state.breachReason = null;
        this.autoFailsafeTriggered = false;
        this.notify();
      }
      return;
    }

    // Ground Operations & Takeoff Grace Suppression:
    // 1. Drone is physically disarmed on the ground
    // 2. Drone altitude < 1.2m AGL
    // 3. Within 8.0s of takeoff initiation
    const isTakeoffGracePeriod = (Date.now() - this.takeoffInitiatedAt) < 8000;
    if (!telem.isArmed || currentAlt < 1.2 || isTakeoffGracePeriod) {
      if (this.state.isBreached) {
        this.state.isBreached = false;
        this.state.breachReason = null;
        this.autoFailsafeTriggered = false;
        this.notify();
      }
      this.consecutiveBreachCount = 0;
      this.consecutiveClearCount++;
      return;
    }

    const dronePt: LatLngPoint = { lat: telem.latitude, lng: telem.longitude };
    const { isBreached: isHorizontalBreached, distToEdge } = this.computeHorizontalDistance(dronePt, anchor);
    this.state.distanceToBoundaryMeters = distToEdge;

    // Track airborne climb state for floor protection:
    // Floor breach MUST NOT trigger on the ground, during initial arming, or during initial takeoff climb!
    if (!telem.isArmed) {
      this.hasClimbedAboveFloor = false;
    } else if (currentAlt > (this.config.minAltitudeMeters + 0.8)) {
      this.hasClimbedAboveFloor = true;
    }

    // Floor breach applies ONLY when vehicle is confirmed airborne in cruise flight
    const flightMode = telem.flightMode || telem.mode || '';
    const isPrecisionDescent = flightMode === 'GUIDED' || flightMode === 'LAND' || flightMode === 'RTL';
    const isFloorBreached = Boolean(
      !isPrecisionDescent &&
      this.config.minAltitudeMeters > 0.5 &&
      telem.isArmed &&
      this.hasClimbedAboveFloor &&
      currentAlt < this.config.minAltitudeMeters &&
      currentAlt > 0.3
    );

    // Ceiling breach with 0.3m hysteresis to prevent oscillation near boundary
    // CRITICAL FIX: Ceiling breach applies ONLY when vehicle is confirmed armed and airborne!
    // A drone on the ground can NEVER breach the altitude ceiling!
    const isCeilingBreached = Boolean(
      telem.isArmed &&
      (this.state.isBreached && (this.state.breachReason?.includes('Ceiling') ?? false)
        ? currentAlt > (this.config.maxAltitudeMeters - 0.3)
        : currentAlt > this.config.maxAltitudeMeters)
    );

    const rawBreach = isHorizontalBreached || isCeilingBreached || isFloorBreached;
    const wasBreachedBefore = this.state.isBreached;

    if (rawBreach) {
      this.consecutiveClearCount = 0;
      this.consecutiveBreachCount++;

      let reason = '';
      if (isHorizontalBreached) reason = 'Perimeter Boundary Breached';
      else if (isCeilingBreached) reason = `Altitude Ceiling Exceeded (${currentAlt.toFixed(1)}m > ${this.config.maxAltitudeMeters}m)`;
      else if (isFloorBreached) reason = `Floor Altitude Breached (${currentAlt.toFixed(1)}m < ${this.config.minAltitudeMeters}m)`;
      this.pendingBreachReason = reason;

      // Debounce: require 3 consecutive breach samples (~150-300ms) to confirm breach.
      if (this.consecutiveBreachCount >= 3) {
        const wasAlreadyBreached = this.state.isBreached;
        this.state.isBreached = true;
        this.state.breachReason = this.pendingBreachReason;
        this.state.lastBreachTimestamp = Date.now();

        // Trigger audible warning on confirmed breach or every 5 seconds
        if (Date.now() - this.breachAudioCooldown > 5000) {
          this.breachAudioCooldown = Date.now();
          audioService.playRtlAlert();
          audioService.triggerHaptic('warning');
        }

        // Execute autonomous failsafe action ONLY ONCE per breach event if airborne and armed
        if (telem.isArmed && !this.autoFailsafeTriggered && !wasAlreadyBreached) {
          const currentMode = (telem.flightMode || telem.mode || '').toUpperCase();
          if (currentMode !== this.config.breachAction.toUpperCase()) {
            this.autoFailsafeTriggered = true;
            this.executeBreachAction(this.config.breachAction);
          }
        }
      }
    } else {
      this.consecutiveBreachCount = 0;
      this.consecutiveClearCount++;

      // Debounce recovery: require 3 consecutive clean samples before clearing breach state
      if (this.consecutiveClearCount >= 3) {
        if (this.state.isBreached) {
          this.state.isBreached = false;
          this.state.breachReason = null;
          this.autoFailsafeTriggered = false;
        }
      }
    }

    // Smart notify throttling: Notify instantly when breach status toggles, or throttle to 4Hz (250ms)
    // This completely eliminates React re-render looping and website flickering!
    const breachStateChanged = (this.state.isBreached !== wasBreachedBefore);
    const now = Date.now();
    if (breachStateChanged || now - this.lastNotifyTimestamp >= 250) {
      this.lastNotifyTimestamp = now;
      this.notify();
    }
  }

  private async executeBreachAction(action: GeofenceBreachAction) {
    const now = Date.now();
    if (now - this.lastBreachActionTimestamp < 10000) {
      return; // 10-second cooldown prevents command floods & 'superseded' errors
    }
    this.lastBreachActionTimestamp = now;

    console.warn(`[GEOFENCE FAILSAFE] Executing breach response: ${action}`);
    try {
      if (action === 'RTL') {
        await mavlinkService.commandRTL();
      } else if (action === 'LOITER') {
        await mavlinkService.commandHold();
      } else if (action === 'LAND') {
        await mavlinkService.commandLand();
      } else if (action === 'POSHOLD') {
        await mavlinkService.setFlightMode('POSHOLD');
      }
    } catch (e) {
      console.error('[GEOFENCE] Failed to dispatch breach mode command', e);
    }
  }

  private computeLockStatus(): GeofenceLockStatus {
    if (!this.config.enabled) return 'BYPASSED_OFF';
    if (this.state.isBreached) return 'BREACHED';
    return 'ACTIVE_ARMED_LOCKED';
  }

  public setEnabled(enabled: boolean) {
    this.config.enabled = enabled;
    this.state.enabled = enabled;
    if (!enabled) {
      this.state.isBreached = false;
      this.state.breachReason = null;
      this.autoFailsafeTriggered = false;
      this.consecutiveBreachCount = 0;
      this.consecutiveClearCount = 0;
      this.hasClimbedAboveFloor = false;
    }
    this.persistConfig();
    this.notify();
    try {
      (mavlinkService as any).sendFenceEnable?.(enabled);
    } catch {}
  }

  public setCustomPolygon(vertices: LatLngPoint[]) {
    this.config.shape = 'CUSTOM_POLYGON';
    this.config.customVertices = [...vertices];
    this.state.shape = 'CUSTOM_POLYGON';
    this.state.customVertices = [...vertices];
    if (vertices.length >= 3) {
      const centroid = getPolygonCentroid(vertices);
      this.config.customAnchor = centroid;
      this.state.customAnchor = centroid;
      this.state.effectiveAnchor = centroid;
    }
    this.persistConfig();
    this.notify();
    try {
      (mavlinkService as any).uploadFencePolygon?.(vertices);
    } catch {}
  }

  public setPolygon(vertices: LatLngPoint[]) {
    this.setCustomPolygon(vertices);
  }

  public updateConfig(newConfig: Partial<GeofenceConfig>) {
    this.config = { ...this.config, ...newConfig };
    this.state = { ...this.state, ...this.config };
    this.persistConfig();
    this.notify();
  }

  public resetToADDCDefaults() {
    this.config = { ...DEFAULT_CONFIG };
    this.state = {
      ...this.state,
      ...this.config,
      isBreached: false,
      breachReason: null,
      distanceToBoundaryMeters: null,
      geofenceStatus: 'ACTIVE_ARMED_LOCKED'
    };
    this.autoFailsafeTriggered = false;
    this.consecutiveBreachCount = 0;
    this.consecutiveClearCount = 0;
    this.hasClimbedAboveFloor = false;
    this.persistConfig();
    audioService.playBeep(880, 100);
    this.notify();
  }

  public notifyTakeoffInitiated() {
    this.takeoffInitiatedAt = Date.now();
  }

  public clearGeofence() {
    this.config.enabled = false;
    this.state.enabled = false;
    this.state.isBreached = false;
    this.state.breachReason = null;
    this.autoFailsafeTriggered = false;
    this.consecutiveBreachCount = 0;
    this.consecutiveClearCount = 0;
    this.hasClimbedAboveFloor = false;
    this.persistConfig();
    audioService.playBeep(450, 80);
    this.notify();
  }

  /**
   * Sets a custom anchor point anywhere (e.g. cricket ground selected on map)
   */
  public setCustomAnchor(lat: number, lng: number) {
    this.config.anchorType = 'CUSTOM';
    this.config.customAnchor = { lat, lng };
    this.state.anchorType = 'CUSTOM';
    this.state.customAnchor = { lat, lng };
    this.state.effectiveAnchor = { lat, lng };
    this.consecutiveBreachCount = 0;
    this.consecutiveClearCount = 0;
    this.persistConfig();
    audioService.playBeep(880, 80);
    this.notify();
  }

  /**
   * Checks whether given coordinate is strictly inside the active geofence.
   * Supports an optional tolerance margin in meters (useful for pre-arm GPS noise).
   */
  public isInsideGeofence(lat: number, lng: number, marginMeters: number = 0): boolean {
    if (!this.config.enabled) return true;
    const anchor = this.getEffectiveAnchor();
    if (!anchor || Math.abs(lat) <= 0.001) return true;

    if (this.config.shape === 'CIRCLE') {
      const dist = computeHaversine(anchor.lat, anchor.lng, lat, lng);
      return dist <= ((this.config.radiusMeters || 50) + marginMeters);
    } else if (this.config.shape === 'ARENA_RECTANGLE') {
      const radLat = (anchor.lat * Math.PI) / 180;
      const dx = (lng - anchor.lng) * 111320 * Math.cos(radLat);
      const dy = (lat - anchor.lat) * 111320;
      const hw = (this.config.widthMeters || 50) / 2 + marginMeters;
      const hh = (this.config.heightMeters || 50) / 2 + marginMeters;
      return Math.abs(dx) <= hw && Math.abs(dy) <= hh;
    } else {
      const vertices = this.getBoundaryVertices();
      if (vertices.length < 3) return true;
      return isPointInsideGeofence(lat, lng, vertices);
    }
  }

  /**
   * Strict Arming Interlock:
   * When geofenceEnabled === true, the drone MUST NOT be allowed to arm
   * if its current live GPS position is outside the drawn polygon or if 3D GPS fix < 6 sats.
   */
  public canArmVehicle(lat?: number, lng?: number): { canArm: boolean; reason?: string } {
    if (!this.config.enabled) return { canArm: true };
    const telem = mavlinkService.getTelemetry();
    const droneLat = lat ?? telem.latitude;
    const droneLng = lng ?? telem.longitude;

    // 1. Check satellite count and 3D fix
    const sats = telem.gps?.satellites ?? (telem as any).satellitesVisible ?? (telem as any).satellites ?? 0;
    const hasFix = Boolean(telem.gps?.isLocked || (telem as any).isGpsValid || sats >= 6);
    if (!hasFix || sats < 6) {
      return {
        canArm: false,
        reason: `ARM BLOCKED: GPS Fix insufficient (${sats} sats < 6) to verify Geofence containment.`
      };
    }

    // 2. Check position inside boundary
    if (droneLat && droneLng && Math.abs(droneLat) > 0.001) {
      const vertices = this.getBoundaryVertices();
      if (vertices.length >= 3) {
        const inside = isPointInsideGeofence(droneLat, droneLng, vertices);
        if (!inside) {
          // Check Zone B: Launch/Landing Pad Safe Circle (6.0m around Home)
          const home = mavlinkService.getHomePoint();
          if (home && home.isSet && Math.abs(home.latitude) > 0.001) {
            const distToHome = computeHaversine(home.latitude, home.longitude, droneLat, droneLng);
            if (distToHome <= 6.0) {
              // Drone is on Launch Pad Safe Circle -> Allowed to arm!
              return { canArm: true };
            }
            // Check Zone C: Transit Corridor
            let closestVertex = vertices[0];
            let minDist = computeHaversine(home.latitude, home.longitude, vertices[0].lat, vertices[0].lng);
            for (let i = 1; i < vertices.length; i++) {
              const d = computeHaversine(home.latitude, home.longitude, vertices[i].lat, vertices[i].lng);
              if (d < minDist) {
                minDist = d;
                closestVertex = vertices[i];
              }
            }
            if (isPointInCorridor({ lat: droneLat, lng: droneLng }, { lat: home.latitude, lng: home.longitude }, closestVertex, 4.0)) {
              return { canArm: true };
            }
          }

          const centroid = getPolygonCentroid(vertices);
          const distToCenter = computeHaversine(centroid.lat, centroid.lng, droneLat, droneLng);
          return {
            canArm: false,
            reason: `ARM BLOCKED: Drone is outside active Geofence boundary (${distToCenter.toFixed(0)}m from centroid, outside Launch Pad Zone B).`
          };
        }
      }
    }
    return { canArm: true };
  }

  public isPointInsideGeofence(lat: number, lon: number, polygon: LatLngPoint[]): boolean {
    return isPointInsideGeofence(lat, lon, polygon);
  }

  public isPointInPolygon(lat: number, lon: number, polygon: LatLngPoint[]): boolean {
    return isPointInsideGeofence(lat, lon, polygon);
  }

  public getSafeInteriorAnchor(polygon: LatLngPoint[]): LatLngPoint {
    return getSafeInteriorAnchor(polygon);
  }

  public clampWaypointToGeofence(latOrPoint: number | LatLngPoint, lonOrPolygon: number | LatLngPoint[], polygonOrMargin?: LatLngPoint[] | number, maybeMargin: number = 2.0): LatLngPoint {
    if (typeof latOrPoint === 'object') {
      return clampWaypointToGeofence(latOrPoint, lonOrPolygon as LatLngPoint[], (polygonOrMargin as number) || 2.0);
    }
    return clampWaypointToGeofence({ lat: latOrPoint, lng: lonOrPolygon as number }, polygonOrMargin as LatLngPoint[], maybeMargin);
  }

  public getDistanceToPerimeter(lat: number, lng: number, polygon: LatLngPoint[]): number {
    if (!polygon || polygon.length === 0) return 0;
    let minDist = Infinity;
    for (let i = 0; i < polygon.length; i++) {
      const v = polygon[i];
      const d = computeHaversine(lat, lng, v.lat, v.lng);
      if (d < minDist) minDist = d;
    }
    return minDist;
  }

  /**
   * Validates a complete search boundary (Circle, Rectangle, Polygon) against active geofence.
   * Requirement 2 & 3: The entire search area must remain strictly within the geofence.
   * Requirement 4: Does NOT automatically change or clip the user's selected boundary.
   */
  public validateSearchBoundary(boundary: {
    type: 'CIRCLE' | 'RECTANGLE' | 'POLYGON' | 'SQUARE' | 'FREEHAND';
    circleCenter?: LatLngPoint | null;
    circleRadiusMeters?: number;
    coordinates?: LatLngPoint[];
    altitude?: number;
  }): { isValid: boolean; reason?: string; maxBreachDistanceMeters?: number } {
    if (!this.config.enabled) {
      return { isValid: true };
    }

    const maxAlt = this.config.maxAltitudeMeters || 25.0;
    if (boundary.altitude !== undefined && boundary.altitude > maxAlt) {
      return {
        isValid: false,
        reason: `Search altitude (${boundary.altitude.toFixed(1)}m) exceeds geofence ceiling (${maxAlt.toFixed(1)}m).`,
        maxBreachDistanceMeters: boundary.altitude - maxAlt
      };
    }

    // 1. Circle Boundary Validation
    if (boundary.type === 'CIRCLE') {
      const center = boundary.circleCenter;
      const radius = boundary.circleRadiusMeters || 15.0;

      if (!center || (Math.abs(center.lat) < 0.0001 && Math.abs(center.lng) < 0.0001)) {
        return { isValid: false, reason: 'Invalid or missing circle center coordinates.' };
      }

      if (this.config.shape === 'CIRCLE') {
        const anchor = this.getEffectiveAnchor() || { lat: center.lat, lng: center.lng };
        const distToAnchor = computeHaversine(anchor.lat, anchor.lng, center.lat, center.lng);
        const fenceRadius = this.config.radiusMeters || 50.0;
        const totalExtent = distToAnchor + radius;

        if (totalExtent > fenceRadius) {
          const excess = totalExtent - fenceRadius;
          return {
            isValid: false,
            reason: `Search circle exceeds circular geofence boundary by ${excess.toFixed(1)}m (Center is ${distToAnchor.toFixed(1)}m from fence center; radius ${radius}m reaches ${totalExtent.toFixed(1)}m vs fence ${fenceRadius}m).`,
            maxBreachDistanceMeters: excess
          };
        }
        return { isValid: true };
      } else {
        // Geofence is ARENA_RECTANGLE or CUSTOM_POLYGON
        const vertices = this.getBoundaryVertices();
        if (vertices.length < 3) return { isValid: true };

        // Test center containment
        if (!isPointInsideGeofence(center.lat, center.lng, vertices)) {
          return {
            isValid: false,
            reason: 'Search circle center lies outside the active geofence polygon.'
          };
        }

        // Test 36 points along perimeter (every 10 degrees)
        let maxBreach = 0;
        const R = 6371e3;
        for (let i = 0; i < 36; i++) {
          const bearingRad = (i * 10 * Math.PI) / 180;
          const dLat = ((radius * Math.cos(bearingRad)) / R) * (180 / Math.PI);
          const dLng = ((radius * Math.sin(bearingRad)) / (R * Math.cos((center.lat * Math.PI) / 180))) * (180 / Math.PI);
          const perimeterPt = { lat: center.lat + dLat, lng: center.lng + dLng };

          if (!isPointInsideGeofence(perimeterPt.lat, perimeterPt.lng, vertices)) {
            const distToPerim = this.getDistanceToPerimeter(perimeterPt.lat, perimeterPt.lng, vertices);
            if (distToPerim > maxBreach) maxBreach = distToPerim;
          }
        }

        if (maxBreach > 0.05) {
          return {
            isValid: false,
            reason: `Search circle exceeds geofence boundary by ~${maxBreach.toFixed(1)}m. Entire search area must remain within geofence.`,
            maxBreachDistanceMeters: maxBreach
          };
        }
        return { isValid: true };
      }
    }

    // 2. Polygon or Rectangle Boundary Validation
    const coords = boundary.coordinates || [];
    if (coords.length >= 3) {
      const vertices = this.getBoundaryVertices();
      if (this.config.shape === 'CIRCLE') {
        const anchor = this.getEffectiveAnchor();
        const fenceRadius = this.config.radiusMeters || 50.0;
        if (anchor) {
          for (let i = 0; i < coords.length; i++) {
            const pt = coords[i];
            const d = computeHaversine(anchor.lat, anchor.lng, pt.lat, pt.lng);
            if (d > fenceRadius) {
              const excess = d - fenceRadius;
              return {
                isValid: false,
                reason: `Search boundary vertex #${i + 1} exceeds circular geofence by ${excess.toFixed(1)}m.`,
                maxBreachDistanceMeters: excess
              };
            }
          }
        }
      } else if (vertices.length >= 3) {
        for (let i = 0; i < coords.length; i++) {
          const pt = coords[i];
          if (!isPointInsideGeofence(pt.lat, pt.lng, vertices)) {
            const dist = this.getDistanceToPerimeter(pt.lat, pt.lng, vertices);
            return {
              isValid: false,
              reason: `Search boundary vertex #${i + 1} lies outside the active geofence polygon (by ~${dist.toFixed(1)}m).`,
              maxBreachDistanceMeters: dist
            };
          }
        }
      }
    }

    return { isValid: true };
  }

  public getState(): GeofenceState {
    this.state.geofenceStatus = this.computeLockStatus();
    return { ...this.state };
  }

  public subscribe(fn: (state: GeofenceState) => void): () => void {
    this.listeners.add(fn);
    fn(this.getState());
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.state.geofenceStatus = this.computeLockStatus();
    const s = this.getState();
    this.listeners.forEach((fn) => fn(s));
  }
}

export const geofenceService = new GeofenceService();

// ============================================================================
// GEOMETRIC METRICS, POLYGON VALIDATION & AUTOMATIC PATTERN SELECTION
// ============================================================================

export interface BoundaryMetrics {
  areaSquareMeters: number;
  perimeterMeters: number;
  approxLengthMeters: number;
  approxWidthMeters: number;
  center: LatLngPoint;
  radiusMeters?: number;
  diameterMeters?: number;
  isCircle: boolean;
  isSelfIntersecting: boolean;
  validationError?: string;
}

export interface AutoPatternDecision {
  algorithm: 'INWARD_SPIRAL' | 'BOUSTROPHEDON';
  algorithmName: string;
  reason: string;
  swathWidthMeters: number;
  trackSpacingMeters: number;
  cameraFovDegrees: number;
}

/**
 * Calculates spherical surface area of an arbitrary closed polygon in square metres.
 */
export function calculatePolygonArea(coords: LatLngPoint[]): number {
  if (!coords || coords.length < 3) return 0;
  const R = 6378137;
  let total = 0;
  for (let i = 0; i < coords.length; i++) {
    const j = (i + 1) % coords.length;
    const p1 = coords[i];
    const p2 = coords[j];
    const radLat1 = (p1.lat * Math.PI) / 180;
    const radLat2 = (p2.lat * Math.PI) / 180;
    const radLon1 = (p1.lng * Math.PI) / 180;
    const radLon2 = (p2.lng * Math.PI) / 180;
    total += (radLon2 - radLon1) * (2 + Math.sin(radLat1) + Math.sin(radLat2));
  }
  return Math.abs((total * R * R) / 2);
}

/**
 * Calculates the perimeter of a polygon in metres.
 */
export function calculatePolygonPerimeter(coords: LatLngPoint[]): number {
  if (!coords || coords.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < coords.length; i++) {
    const next = coords[(i + 1) % coords.length];
    total += computeHaversine(coords[i].lat, coords[i].lng, next.lat, next.lng);
  }
  return Math.round(total * 10) / 10;
}

/**
 * Calculates approximate length (major axis) and width (minor axis) in metres.
 */
export function calculateApproxDimensions(coords: LatLngPoint[]): { lengthMeters: number; widthMeters: number } {
  if (!coords || coords.length === 0) return { lengthMeters: 0, widthMeters: 0 };
  const center = getPolygonCentroid(coords);
  const radLat = (center.lat * Math.PI) / 180;
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const pt of coords) {
    const x = (pt.lng - center.lng) * 111320 * Math.cos(radLat);
    const y = (pt.lat - center.lat) * 111320;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const spanX = Math.max(0, maxX - minX);
  const spanY = Math.max(0, maxY - minY);
  return {
    lengthMeters: Math.round(Math.max(spanX, spanY) * 10) / 10,
    widthMeters: Math.round(Math.min(spanX, spanY) * 10) / 10,
  };
}

/**
 * Tests whether polygon edges intersect each other (rejecting self-intersecting figures).
 */
export function checkPolygonSelfIntersection(coords: LatLngPoint[]): { isSelfIntersecting: boolean; message?: string } {
  if (!coords || coords.length < 4) {
    return { isSelfIntersecting: false };
  }
  const n = coords.length;

  const ccw = (a: LatLngPoint, b: LatLngPoint, c: LatLngPoint): number => {
    return (c.lat - a.lat) * (b.lng - a.lng) - (b.lat - a.lat) * (c.lng - a.lng);
  };

  const segmentsIntersect = (a: LatLngPoint, b: LatLngPoint, c: LatLngPoint, d: LatLngPoint): boolean => {
    const ccw1 = ccw(a, c, d);
    const ccw2 = ccw(b, c, d);
    const ccw3 = ccw(a, b, c);
    const ccw4 = ccw(a, b, d);
    return ((ccw1 > 0 && ccw2 < 0) || (ccw1 < 0 && ccw2 > 0)) &&
           ((ccw3 > 0 && ccw4 < 0) || (ccw3 < 0 && ccw4 > 0));
  };

  for (let i = 0; i < n; i++) {
    const p1 = coords[i];
    const p2 = coords[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      // Adjacent edges share a vertex, skip them
      if (j === i || j === (i + 1) % n || (j + 1) % n === i) continue;
      const p3 = coords[j];
      const p4 = coords[(j + 1) % n];
      if (segmentsIntersect(p1, p2, p3, p4)) {
        return {
          isSelfIntersecting: true,
          message: `Self-intersecting polygon: Edge [${i + 1}-${((i + 1) % n) + 1}] crosses edge [${j + 1}-${((j + 1) % n) + 1}]. Please redraw a non-intersecting boundary.`,
        };
      }
    }
  }
  return { isSelfIntersecting: false };
}

/**
 * Calculates comprehensive metrics for user-defined circular or polygonal search boundaries.
 */
export function calculateBoundaryMetrics(boundary: {
  type: 'CIRCLE' | 'POLYGON' | 'RECTANGLE' | 'FREEHAND';
  circleCenter?: LatLngPoint;
  circleRadiusMeters?: number;
  coordinates?: LatLngPoint[];
}): BoundaryMetrics {
  const isCircle = boundary.type === 'CIRCLE';
  if (isCircle) {
    const radius = boundary.circleRadiusMeters || 15;
    const center = boundary.circleCenter || { lat: 13.0827, lng: 80.2707 };
    const area = Math.round(Math.PI * radius * radius * 10) / 10;
    const perimeter = Math.round(2 * Math.PI * radius * 10) / 10;
    const diameter = radius * 2;
    return {
      areaSquareMeters: area,
      perimeterMeters: perimeter,
      approxLengthMeters: diameter,
      approxWidthMeters: diameter,
      center,
      radiusMeters: radius,
      diameterMeters: diameter,
      isCircle: true,
      isSelfIntersecting: false,
    };
  }

  const coords = boundary.coordinates || [];
  if (coords.length < 3) {
    return {
      areaSquareMeters: 0,
      perimeterMeters: 0,
      approxLengthMeters: 0,
      approxWidthMeters: 0,
      center: coords[0] || { lat: 13.0827, lng: 80.2707 },
      isCircle: false,
      isSelfIntersecting: false,
      validationError: 'At least 3 boundary vertices are required to define a valid search area.',
    };
  }

  const selfInter = checkPolygonSelfIntersection(coords);
  if (selfInter.isSelfIntersecting) {
    return {
      areaSquareMeters: 0,
      perimeterMeters: calculatePolygonPerimeter(coords),
      approxLengthMeters: 0,
      approxWidthMeters: 0,
      center: getPolygonCentroid(coords),
      isCircle: false,
      isSelfIntersecting: true,
      validationError: selfInter.message || 'Polygon boundary is self-intersecting.',
    };
  }

  const area = Math.round(calculatePolygonArea(coords) * 10) / 10;
  const perimeter = calculatePolygonPerimeter(coords);
  const dims = calculateApproxDimensions(coords);
  const center = getPolygonCentroid(coords);

  return {
    areaSquareMeters: area,
    perimeterMeters: perimeter,
    approxLengthMeters: dims.lengthMeters,
    approxWidthMeters: dims.widthMeters,
    center,
    isCircle: false,
    isSelfIntersecting: false,
  };
}

/**
 * Automatically chooses the optimal search algorithm based on boundary shape analysis.
 * (Requirement B: Do not ask user to select manually; display algorithm & scientific reason).
 */
export function autoSelectSearchPattern(
  boundaryType: 'CIRCLE' | 'POLYGON' | 'RECTANGLE' | 'FREEHAND',
  metrics: BoundaryMetrics,
  altitudeMeters: number
): AutoPatternDecision {
  const CAMERA_FOV_DEG = 65.0; // Sony IMX477 camera horizontal FOV
  // Downward ground swath W = 2 * h * tan(FOV/2)
  const swathWidth = Math.round(2 * altitudeMeters * Math.tan((32.5 * Math.PI) / 180) * 100) / 100;
  // 75% lane spacing (25% lateral overlap)
  const trackSpacing = Math.round(swathWidth * 0.75 * 100) / 100;

  if (boundaryType === 'CIRCLE' || metrics.isCircle) {
    return {
      algorithm: 'INWARD_SPIRAL',
      algorithmName: 'Inward Archimedean Spiral',
      reason: 'Circular boundary detected. Inward Archimedean spiral provides continuous curvature search, eliminating abrupt 90° yaw stops and maintaining constant target visibility.',
      swathWidthMeters: swathWidth,
      trackSpacingMeters: trackSpacing,
      cameraFovDegrees: CAMERA_FOV_DEG,
    };
  }

  if (boundaryType === 'RECTANGLE') {
    return {
      algorithm: 'BOUSTROPHEDON',
      algorithmName: 'Boustrophedon (Lawnmower) Sweep',
      reason: 'Rectangular boundary detected. Parallel sweep lanes aligned to the primary axis deliver uniform 100% optical swath coverage and optimal flight battery efficiency.',
      swathWidthMeters: swathWidth,
      trackSpacingMeters: trackSpacing,
      cameraFovDegrees: CAMERA_FOV_DEG,
    };
  }

  if (boundaryType === 'FREEHAND') {
    return {
      algorithm: 'BOUSTROPHEDON',
      algorithmName: 'Polygon-Clipped Coverage Path',
      reason: 'Freehand boundary detected. Using dynamic sweep tracks clipped strictly within boundary perimeter with Sony IMX477 camera swath overlap.',
      swathWidthMeters: swathWidth,
      trackSpacingMeters: trackSpacing,
      cameraFovDegrees: CAMERA_FOV_DEG,
    };
  }

  // POLYGON
  return {
    algorithm: 'BOUSTROPHEDON',
    algorithmName: 'Polygon-Clipped Coverage Sweep',
    reason: 'Irregular polygon boundary detected. Using dynamic sweep tracks clipped strictly within polygon vertices with Sony IMX477 camera swath overlap.',
    swathWidthMeters: swathWidth,
    trackSpacingMeters: trackSpacing,
    cameraFovDegrees: CAMERA_FOV_DEG,
  };
}
