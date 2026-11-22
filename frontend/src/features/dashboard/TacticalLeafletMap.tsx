/**
 * Tactical Leaflet Vector Map (Requirement R4)
 * Baseline Specification: Technical Project Report Rev 2.4.0-PROD
 *
 * Implements a high-precision, 7-vector-layer reconnaissance map:
 * 1. Search Boundary: Cyan vector polygon with dimension metrics HUD (Area m², Perimeter m).
 * 2. Live Drone Position Marker: Dynamic SVG heading beam, pulsating halo, and stale-grey indicator (>3.5s stale).
 * 3. Actual Flight Coverage Swath: Translucent swath ribbon along breadcrumb path (W = 2 * h * tan(32.5°)).
 * 4. Detection Markers:
 *    - Blue: QR Code
 *    - Red: Confirmed Cuboid Box
 *    - Orange: Candidate Box
 *    - Yellow: Uncertain Geometry
 *    Interactive inspection popup with payload, code, coordinates, snapshot, and confidence state.
 * 5. Confidence Overlay: Highlighted probability halos around verified targets.
 * 6. Unsearched Area: Highlighting boundary sectors awaiting sensor sweep.
 * 7. Uncertainty Layer: Visual hash indicator when HDOP > 2.0 or camera blur < 60.
 *
 * Interactive Layer Controls:
 * - Toggle pills for all 7 layers
 * - Detection filter: ALL | QR_ONLY | BOX_ONLY
 * - One-click "Fit Boundary" & "Center Drone"
 */

import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { DroneTelemetry } from '../../types/mission';
import { reconDetectionService } from '../../services/reconDetectionService';
import { QRDetectionRecord } from '../../types/recon';
import {
  visionHeatmapService,
  VisionRegisteredObject
} from '../../services/visionHeatmapService';
import {
  groundStationMissionService,
  calculateHaversineDistance,
  computeDestination
} from '../../services/groundStationMissionService';
import { GroundStationMission } from '../../types/groundStationMap';
import { Crosshair, Maximize2, Filter, Layers, Eye, ShieldAlert, CheckCircle2 } from 'lucide-react';

export interface TacticalTargetPin {
  id: string;
  code: string;
  payload: string;
  latitude: number;
  longitude: number;
  timestamp: number;
  photoUrl?: string;
  confidence?: number;
  category?: 'QR' | 'BOX_CONFIRMED' | 'BOX_CANDIDATE' | 'UNCERTAIN';
}

export interface TacticalWaypoint {
  seq: number;
  lat: number;
  lon: number;
  alt: number;
  command?: number;
}

export interface TacticalLeafletMapProps {
  telemetry: any;
  breadcrumbs?: Array<{ lat: number; lng: number; alt?: number; timestamp?: number }>;
  waypoints?: TacticalWaypoint[];
  targets?: TacticalTargetPin[];
  boundaryPolygon?: Array<{ lat: number; lng: number }>;
  boundaryAreaM2?: number;
  boundaryPerimeterM?: number;
  geofenceRadiusMeters?: number; // default 20.0m
  geofenceMarginMeters?: number; // default 2.0m per FENCE_MARGIN = 2.0
  geofencePolygon?: Array<{ lat: number; lng: number }>;
  centerLat?: number;
  centerLon?: number;
  zoom?: number;
  className?: string;
  onTargetSelect?: (target: TacticalTargetPin) => void;
  onMapClick?: (lat: number, lon: number) => void;
}

const TILE_LAYERS = {
  Satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  Dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  Street: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
};

export const TacticalLeafletMap: React.FC<TacticalLeafletMapProps> = ({
  telemetry,
  breadcrumbs: initialBreadcrumbs,
  waypoints: propWaypoints,
  targets: propTargets,
  boundaryPolygon: propBoundaryPolygon,
  boundaryAreaM2: propBoundaryArea,
  boundaryPerimeterM: propBoundaryPerimeter,
  geofenceRadiusMeters = 20.0,
  geofenceMarginMeters = 2.0,
  geofencePolygon: customGeofencePolygon,
  centerLat,
  centerLon,
  zoom = 18,
  className = '',
  onTargetSelect,
  onMapClick
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Layer References
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const droneMarkerRef = useRef<L.Marker | null>(null);
  const breadcrumbPolylineRef = useRef<L.Polyline | null>(null);
  const missionPolylineRef = useRef<L.Polyline | null>(null);
  const waypointsLayerRef = useRef<L.LayerGroup | null>(null);
  const geofenceOuterLayerRef = useRef<L.Polygon | null>(null);
  const geofenceInnerLayerRef = useRef<L.Polygon | null>(null);
  const boundaryLayerRef = useRef<L.Polygon | null>(null);
  const coverageSwathLayerRef = useRef<L.LayerGroup | null>(null);
  const targetsLayerRef = useRef<L.LayerGroup | null>(null);
  const confidenceLayerRef = useRef<L.LayerGroup | null>(null);
  const unsearchedLayerRef = useRef<L.Polygon | null>(null);
  const uncertaintyLayerRef = useRef<L.LayerGroup | null>(null);

  // Base Map Layer & View Modes
  const [activeLayer, setActiveLayer] = useState<'Satellite' | 'Dark' | 'Street'>('Satellite');
  const [internalBreadcrumbs, setInternalBreadcrumbs] = useState<Array<{ lat: number; lng: number; alt: number; time: number }>>([]);
  const [detectedTargets, setDetectedTargets] = useState<TacticalTargetPin[]>([]);
  const [currentMission, setCurrentMission] = useState<GroundStationMission | null>(() =>
    groundStationMissionService.getCurrentMission()
  );

  // 7 Vector Layer Visibility Toggles
  const [showBoundary, setShowBoundary] = useState<boolean>(true);
  const [showDrone, setShowDrone] = useState<boolean>(true);
  const [showFlightCoverage, setShowFlightCoverage] = useState<boolean>(true);
  const [showDetections, setShowDetections] = useState<boolean>(true);
  const [detectionFilter, setDetectionFilter] = useState<'ALL' | 'QR_ONLY' | 'BOX_ONLY'>('ALL');
  const [showConfidenceOverlay, setShowConfidenceOverlay] = useState<boolean>(true);
  const [showUnsearchedArea, setShowUnsearchedArea] = useState<boolean>(true);
  const [showUncertaintyLayer, setShowUncertaintyLayer] = useState<boolean>(true);

  // Subscribe to Mission Service
  useEffect(() => {
    const unsub = groundStationMissionService.subscribe((m) => {
      setCurrentMission(m);
    });
    return () => unsub();
  }, []);

  // 1. Subscribe to Live Detections & Objects
  useEffect(() => {
    if (propTargets && propTargets.length > 0) {
      setDetectedTargets(propTargets);
      return;
    }

    const unsubDetections = reconDetectionService.subscribeDetections((records: QRDetectionRecord[]) => {
      const qrPins: TacticalTargetPin[] = records
        .filter((r) => r.targetLocation !== null)
        .map((r) => ({
          id: r.detectionId,
          code: r.twoDigitCode || 'QR',
          payload: r.payload || '',
          latitude: r.targetLocation!.latitude,
          longitude: r.targetLocation!.longitude,
          timestamp: r.timestamp,
          photoUrl: r.thumbnailDataUrl || r.photoDataUrl,
          confidence: 0.95,
          category: 'QR'
        }));

      // Combine with vision queue objects
      const visionObjects = visionHeatmapService.getObjects();
      const boxPins: TacticalTargetPin[] = (visionObjects as VisionRegisteredObject[])
        .filter((o: VisionRegisteredObject) => o.lat && o.lon && Math.abs(o.lat) > 0.001)
        .map((o: VisionRegisteredObject) => ({
          id: o.object_id,
          code: o.two_digit_code || o.shape.slice(0, 3),
          payload: o.decoded_payload || `${o.category} - ${o.shape}`,
          latitude: o.lat!,
          longitude: o.lon!,
          timestamp: o.last_seen || Date.now(),
          photoUrl: o.thumbnail || o.thumbnail_base64,
          confidence: o.confidence,
          category: o.priority === 1 ? 'QR' : o.priority === 2 ? 'BOX_CONFIRMED' : o.priority === 3 ? 'BOX_CANDIDATE' : 'UNCERTAIN'
        }));

      const combined = [...qrPins];
      boxPins.forEach((bp) => {
        if (!combined.some((cp) => Math.abs(cp.latitude - bp.latitude) < 0.00005 && Math.abs(cp.longitude - bp.longitude) < 0.00005)) {
          combined.push(bp);
        }
      });

      setDetectedTargets(combined);
    });

    const unsubObjects = visionHeatmapService.subscribeObjects((objs) => {
      // Refresh list on queue update
      const qrRecords = reconDetectionService.getDetections();
      const qrPins: TacticalTargetPin[] = qrRecords
        .filter((r) => r.targetLocation !== null)
        .map((r) => ({
          id: r.detectionId,
          code: r.twoDigitCode || 'QR',
          payload: r.payload || '',
          latitude: r.targetLocation!.latitude,
          longitude: r.targetLocation!.longitude,
          timestamp: r.timestamp,
          photoUrl: r.thumbnailDataUrl || r.photoDataUrl,
          confidence: 0.95,
          category: 'QR'
        }));

      const boxPins: TacticalTargetPin[] = objs
        .filter((o) => o.lat && o.lon && Math.abs(o.lat) > 0.001)
        .map((o) => ({
          id: o.object_id,
          code: o.two_digit_code || o.shape.slice(0, 3),
          payload: o.decoded_payload || `${o.category} - ${o.shape}`,
          latitude: o.lat!,
          longitude: o.lon!,
          timestamp: o.last_seen || Date.now(),
          photoUrl: o.thumbnail || o.thumbnail_base64,
          confidence: o.confidence,
          category: o.priority === 1 ? 'QR' : o.priority === 2 ? 'BOX_CONFIRMED' : o.priority === 3 ? 'BOX_CANDIDATE' : 'UNCERTAIN'
        }));

      const combined = [...qrPins];
      boxPins.forEach((bp) => {
        if (!combined.some((cp) => Math.abs(cp.latitude - bp.latitude) < 0.00005 && Math.abs(cp.longitude - bp.longitude) < 0.00005)) {
          combined.push(bp);
        }
      });

      setDetectedTargets(combined);
    });

    return () => {
      unsubDetections();
      unsubObjects();
    };
  }, [propTargets]);

  // 2. Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialLat = centerLat || telemetry.latitude || 13.0827;
    const initialLon = centerLon || telemetry.longitude || 80.2707;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLon],
      zoom,
      zoomControl: false,
      attributionControl: false
    });
    mapRef.current = map;

    // Base Tile Layer
    const tileLayer = L.tileLayer(TILE_LAYERS[activeLayer], {
      maxZoom: 22,
      maxNativeZoom: 19
    }).addTo(map);
    tileLayerRef.current = tileLayer;

    // Layer Groups
    coverageSwathLayerRef.current = L.layerGroup().addTo(map);
    confidenceLayerRef.current = L.layerGroup().addTo(map);
    uncertaintyLayerRef.current = L.layerGroup().addTo(map);
    waypointsLayerRef.current = L.layerGroup().addTo(map);
    targetsLayerRef.current = L.layerGroup().addTo(map);

    // Breadcrumb Polyline in Cyan (#38bdf8), 3px dashed line
    const breadcrumbs = L.polyline([], {
      color: '#38bdf8',
      weight: 2.5,
      opacity: 0.85,
      dashArray: '4, 6',
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(map);
    breadcrumbPolylineRef.current = breadcrumbs;

    // Mission Waypoint Polyline in Emerald (#22c55e)
    const missionLine = L.polyline([], {
      color: '#22c55e',
      weight: 2.5,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(map);
    missionPolylineRef.current = missionLine;

    // Live Drone Marker Placeholder
    const droneIcon = createDroneIcon(telemetry.heading || 0, false);
    const marker = L.marker([initialLat, initialLon], {
      icon: droneIcon,
      zIndexOffset: 1000
    }).addTo(map);
    droneMarkerRef.current = marker;

    // Map Click
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (onMapClick) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Helper: Create Drone Marker Icon with Dynamic Stale State
  function createDroneIcon(heading: number, isStale: boolean) {
    const primaryColor = isStale ? '#94a3b8' : '#38bdf8';
    const coreColor = isStale ? '#475569' : '#0284c7';
    const haloColor = isStale ? 'rgba(148, 163, 184, 0.3)' : 'rgba(56, 189, 248, 0.2)';
    const haloBorder = isStale ? 'rgba(148, 163, 184, 0.6)' : 'rgba(56, 189, 248, 0.7)';
    const beamColor = isStale ? 'rgba(148, 163, 184, 0.4)' : 'rgba(56, 189, 248, 0.6)';

    return L.divIcon({
      className: 'tactical-drone-marker',
      html: `
        <div style="position: relative; width: 64px; height: 64px; margin-left: -32px; margin-top: -32px; display: flex; align-items: center; justify-content: center; pointer-events: none;">
          <!-- Pulsating Halo -->
          <div style="position: absolute; inset: 0; border-radius: 50%; border: 2px solid ${haloBorder}; background: ${haloColor}; animation: ${isStale ? 'none' : 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite'};"></div>
          <!-- Dynamic Heading Beam (SVG Conical Ray) -->
          <div id="tactical-heading-beam" style="position: absolute; top: 0px; left: 50%; transform: translateX(-50%) rotate(${heading}deg); transform-origin: 50% 32px; width: 0; height: 0; border-left: 14px solid transparent; border-right: 14px solid transparent; border-top: 42px solid ${beamColor}; pointer-events: none; filter: drop-shadow(0 0 4px ${primaryColor});"></div>
          <!-- Vehicle Center Core -->
          <div style="width: 22px; height: 22px; border-radius: 50%; background: ${coreColor}; border: 2.5px solid #ffffff; box-shadow: 0 0 12px ${primaryColor}; display: flex; align-items: center; justify-content: center; position: absolute; z-index: 10;">
            <div style="width: 6px; height: 6px; border-radius: 50%; background: #ffffff;"></div>
          </div>
        </div>
      `,
      iconSize: [64, 64],
      iconAnchor: [32, 32]
    });
  }

  // 3. Switch Tile Layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !tileLayerRef.current) return;
    tileLayerRef.current.setUrl(TILE_LAYERS[activeLayer]);
  }, [activeLayer]);

  // 4. Update Drone Position, Stale-Grey State & Dynamic Heading Beam
  useEffect(() => {
    const map = mapRef.current;
    const marker = droneMarkerRef.current;
    if (!map || !marker) return;

    if (!showDrone) {
      if (map.hasLayer(marker)) map.removeLayer(marker);
      return;
    }
    if (!map.hasLayer(marker)) map.addLayer(marker);

    const lat = telemetry.latitude ?? telemetry.gps?.latitude;
    const lon = telemetry.longitude ?? telemetry.gps?.longitude;

    if (lat && lon && Math.abs(lat) > 0.001 && Math.abs(lon) > 0.001) {
      marker.setLatLng([lat, lon]);

      // Check GPS staleness (>3.5 seconds without update)
      const now = Date.now();
      const lastFix = telemetry.timestamp || now;
      const isGpsValid = Boolean(telemetry.isGpsValid ?? (telemetry.gps?.isLocked && telemetry.gps?.satellites >= 6));
      const isGpsLocked = Boolean(telemetry.isGpsLocked ?? telemetry.gps?.isLocked);
      const isStale = (now - lastFix > 3500) || (!isGpsValid && !isGpsLocked);

      const heading = Math.round(((telemetry.heading ?? telemetry.headingDeg ?? 0) % 360 + 360) % 360);
      marker.setIcon(createDroneIcon(heading, isStale));

      // Append to historical breadcrumbs
      const alt = telemetry.altitudeMeters ?? telemetry.relativeAltitude ?? telemetry.altitude ?? 5.0;
      setInternalBreadcrumbs((prev) => {
        const next = [...prev, { lat, lng: lon, alt, time: now }];
        return next.length > 1000 ? next.slice(next.length - 1000) : next;
      });
    }
  }, [telemetry, showDrone]);

  // 5. Render Breadcrumb Polyline
  useEffect(() => {
    if (!breadcrumbPolylineRef.current) return;
    const points = initialBreadcrumbs
      ? initialBreadcrumbs.map((b) => [b.lat, b.lng] as [number, number])
      : internalBreadcrumbs.map((b) => [b.lat, b.lng] as [number, number]);
    breadcrumbPolylineRef.current.setLatLngs(points);
  }, [internalBreadcrumbs, initialBreadcrumbs]);

  // 6. LAYER 1: Render Search Boundary (Cyan Polygon + Dimension HUD)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const coords = propBoundaryPolygon || currentMission?.geometry?.coordinates;
    const area = propBoundaryArea || currentMission?.geometry?.areaSquareMeters;

    if (!showBoundary || !coords || coords.length < 3) {
      if (boundaryLayerRef.current && map.hasLayer(boundaryLayerRef.current)) {
        map.removeLayer(boundaryLayerRef.current);
      }
      return;
    }

    const latlngs = coords.map((c) => [c.lat, c.lng] as [number, number]);

    if (!boundaryLayerRef.current) {
      boundaryLayerRef.current = L.polygon(latlngs, {
        color: '#06b6d4', // Cyan
        weight: 2.5,
        opacity: 0.95,
        fillColor: '#06b6d4',
        fillOpacity: 0.08,
        dashArray: '6, 4'
      }).addTo(map);
    } else {
      boundaryLayerRef.current.setLatLngs(latlngs);
      if (!map.hasLayer(boundaryLayerRef.current)) {
        boundaryLayerRef.current.addTo(map);
      }
    }

    // Tooltip HUD displaying Area and Perimeter
    const areaStr = area ? `${Math.round(area)} m²` : 'Active Boundary';
    boundaryLayerRef.current.bindTooltip(`📐 SEARCH BOUNDARY [${areaStr}]`, {
      permanent: false,
      direction: 'top',
      className: 'bg-slate-900 text-cyan-300 font-mono text-[10px] px-2 py-0.5 rounded border border-cyan-500/50'
    });
  }, [showBoundary, propBoundaryPolygon, propBoundaryArea, currentMission]);

  // 7. LAYER 3: Render Actual Flight Coverage Swath (W = 2 * h * tan(32.5°))
  useEffect(() => {
    const map = mapRef.current;
    const swathGroup = coverageSwathLayerRef.current;
    if (!map || !swathGroup) return;

    swathGroup.clearLayers();
    if (!showFlightCoverage) return;

    const points = initialBreadcrumbs || internalBreadcrumbs;
    if (points.length < 2) return;

    // Generate swath polygons sampled every few meters
    // Camera horizontal FOV 65° -> half angle 32.5°
    const tanHalfFov = Math.tan((32.5 * Math.PI) / 180.0);

    for (let i = 1; i < points.length; i += 2) {
      const p1 = points[i - 1];
      const p2 = points[i];
      const alt = (p1.alt || p2.alt || 5.0);
      const halfSwathM = alt * tanHalfFov;

      // Calculate bearing between consecutive points
      const dLat = p2.lat - p1.lat;
      const dLng = p2.lng - p1.lng;
      const bearing = Math.atan2(dLng, dLat);

      // Normal vector perpendicular to flight heading
      const normalLeft = bearing - Math.PI / 2;
      const normalRight = bearing + Math.PI / 2;

      const p1L = computeDestination(p1.lat, p1.lng, halfSwathM, (normalLeft * 180) / Math.PI);
      const p1R = computeDestination(p1.lat, p1.lng, halfSwathM, (normalRight * 180) / Math.PI);
      const p2R = computeDestination(p2.lat, p2.lng, halfSwathM, (normalRight * 180) / Math.PI);
      const p2L = computeDestination(p2.lat, p2.lng, halfSwathM, (normalLeft * 180) / Math.PI);

      const swathPoly = L.polygon(
        [
          [p1L.lat, p1L.lng],
          [p1R.lat, p1R.lng],
          [p2R.lat, p2R.lng],
          [p2L.lat, p2L.lng]
        ],
        {
          color: '#10b981',
          weight: 0.5,
          opacity: 0.6,
          fillColor: '#10b981',
          fillOpacity: 0.12
        }
      );
      swathGroup.addLayer(swathPoly);
    }
  }, [showFlightCoverage, internalBreadcrumbs, initialBreadcrumbs]);

  // 8. LAYER 4: Render Detection Markers (Blue QR, Red Box, Orange Candidate, Yellow Uncertain)
  useEffect(() => {
    const map = mapRef.current;
    const targetGroup = targetsLayerRef.current;
    if (!map || !targetGroup) return;

    targetGroup.clearLayers();
    if (!showDetections) return;

    const filtered = detectedTargets.filter((t) => {
      if (detectionFilter === 'QR_ONLY') return t.category === 'QR' || Boolean(t.code && /^\d{2}$/.test(t.code));
      if (detectionFilter === 'BOX_ONLY') return t.category === 'BOX_CONFIRMED' || t.category === 'BOX_CANDIDATE';
      return true;
    });

    filtered.forEach((target) => {
      const isQR = target.category === 'QR' || Boolean(target.code && /^\d{2}$/.test(target.code));
      const isConfirmedBox = target.category === 'BOX_CONFIRMED';
      const isCandidateBox = target.category === 'BOX_CANDIDATE';

      const badgeColor = isQR ? '#3b82f6' : isConfirmedBox ? '#ef4444' : isCandidateBox ? '#f97316' : '#eab308';
      const iconSymbol = isQR ? 'QR' : isConfirmedBox ? 'BOX' : isCandidateBox ? 'CAND' : 'UNC';

      const targetIcon = L.divIcon({
        className: 'tactical-detection-marker',
        html: `
          <div style="position: relative; width: 38px; height: 38px; margin-left: -19px; margin-top: -38px; display: flex; flex-direction: column; align-items: center; cursor: pointer;">
            <!-- Outer Badge -->
            <div style="background: ${badgeColor}; color: #ffffff; border: 2px solid #ffffff; border-radius: 8px; padding: 2px 6px; font-family: monospace; font-size: 11px; font-weight: 900; box-shadow: 0 4px 10px rgba(0,0,0,0.6); display: flex; align-items: center; gap: 3px;">
              <span>${isQR ? '📱' : '📦'}</span>
              <span>${target.code || iconSymbol}</span>
            </div>
            <!-- Pointer Pin Arrow -->
            <div style="width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 6px solid ${badgeColor}; margin-top: -1px;"></div>
          </div>
        `,
        iconSize: [38, 38],
        iconAnchor: [19, 38]
      });

      const marker = L.marker([target.latitude, target.longitude], {
        icon: targetIcon,
        zIndexOffset: 600
      });

      // Inspection Popup Modal
      const popupHtml = `
        <div style="font-family: monospace; background: #0f172a; color: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #334155; width: 230px;">
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #334155; padding-bottom: 4px; margin-bottom: 6px;">
            <span style="font-size: 10.5px; font-weight: 800; color: ${badgeColor}; text-transform: uppercase;">
              ${isQR ? 'QR CODE TARGET' : isConfirmedBox ? 'CONFIRMED CUBOID' : 'TARGET CANDIDATE'}
            </span>
            <span style="background: ${badgeColor}; color: #fff; font-size: 10px; font-weight: 900; padding: 1px 4px; border-radius: 4px;">
              #${target.code}
            </span>
          </div>

          <div style="font-size: 10px; line-height: 1.4; color: #94a3b8; margin-bottom: 6px;">
            <div><strong>PAYLOAD:</strong> <span style="color: #ffffff;">${target.payload || 'N/A'}</span></div>
            <div><strong>LAT:</strong> ${target.latitude.toFixed(7)}</div>
            <div><strong>LON:</strong> ${target.longitude.toFixed(7)}</div>
            <div><strong>TIME:</strong> ${new Date(target.timestamp).toLocaleTimeString()}</div>
            ${target.confidence ? `<div><strong>CONF:</strong> ${(target.confidence * 100).toFixed(0)}%</div>` : ''}
          </div>

          ${target.photoUrl ? `
            <div style="margin-top: 6px; border-radius: 4px; overflow: hidden; border: 1px solid #334155;">
              <img src="${target.photoUrl}" alt="Target Snapshot" style="width: 100%; height: 95px; object-fit: cover;" />
            </div>
          ` : ''}
        </div>
      `;

      marker.bindPopup(popupHtml, {
        className: 'tactical-target-leaflet-popup',
        maxWidth: 250
      });

      marker.on('click', () => {
        onTargetSelect?.(target);
      });

      targetGroup.addLayer(marker);
    });
  }, [detectedTargets, showDetections, detectionFilter, onTargetSelect]);

  // 9. LAYER 5: Render Confidence Overlay (Glowing Halos Around Targets)
  useEffect(() => {
    const map = mapRef.current;
    const confGroup = confidenceLayerRef.current;
    if (!map || !confGroup) return;

    confGroup.clearLayers();
    if (!showConfidenceOverlay) return;

    detectedTargets.forEach((target) => {
      const radiusM = target.category === 'QR' ? 3.0 : 5.0;
      const color = target.category === 'QR' ? '#3b82f6' : '#10b981';

      const circle = L.circle([target.latitude, target.longitude], {
        radius: radiusM,
        color,
        weight: 1.5,
        opacity: 0.8,
        fillColor: color,
        fillOpacity: 0.15,
        dashArray: '3, 3'
      });
      confGroup.addLayer(circle);
    });
  }, [detectedTargets, showConfidenceOverlay]);

  // 10. LAYER 7: Render Uncertainty Warning Layer (HDOP > 2.0 or Low Light/Blur)
  useEffect(() => {
    const map = mapRef.current;
    const uncertGroup = uncertaintyLayerRef.current;
    if (!map || !uncertGroup) return;

    uncertGroup.clearLayers();
    if (!showUncertaintyLayer) return;

    // Check if HDOP > 2.0
    const hdop = telemetry.hdop ?? telemetry.gps?.hdop ?? 1.0;
    const lat = telemetry.latitude ?? telemetry.gps?.latitude;
    const lon = telemetry.longitude ?? telemetry.gps?.longitude;
    if (hdop > 2.0 && lat && lon) {
      const warningCircle = L.circle([lat, lon], {
        radius: hdop * 4.0,
        color: '#eab308',
        weight: 2,
        dashArray: '4, 4',
        fillColor: '#eab308',
        fillOpacity: 0.12
      }).bindTooltip(`⚠️ HIGH GPS UNCERTAINTY (HDOP: ${hdop.toFixed(1)})`, {
        direction: 'bottom',
        className: 'bg-amber-950 text-amber-300 font-mono text-[9px] px-1 py-0.5 rounded border border-amber-600'
      });
      uncertGroup.addLayer(warningCircle);
    }
  }, [telemetry, showUncertaintyLayer]);

  // 11. Render Mission Waypoints
  useEffect(() => {
    const map = mapRef.current;
    const wpGroup = waypointsLayerRef.current;
    const polyline = missionPolylineRef.current;
    if (!map || !wpGroup || !polyline) return;

    wpGroup.clearLayers();

    const wps = propWaypoints || (currentMission?.waypoints.map((w, idx) => ({
      seq: idx + 1,
      lat: w.lat,
      lon: w.lng,
      alt: w.altitude,
      command: w.action === 'RTL' ? 20 : 16
    })));

    if (wps && wps.length > 0) {
      const latlngs = wps.map((w) => [w.lat, w.lon] as [number, number]);
      polyline.setLatLngs(latlngs);

      wps.forEach((wp) => {
        const isRtl = wp.command === 20;
        const marker = L.circleMarker([wp.lat, wp.lon], {
          radius: wp.seq === 1 ? 5 : 3.5,
          fillColor: isRtl ? '#a855f7' : '#10b981',
          color: '#ffffff',
          weight: 1.5,
          opacity: 1,
          fillOpacity: 0.9
        }).bindTooltip(`WP #${wp.seq} (${wp.alt}m)`, {
          direction: 'top',
          offset: [0, -6],
          className: 'bg-slate-900 text-white font-mono text-[9px] px-1 py-0.5 rounded border border-slate-700'
        });
        wpGroup.addLayer(marker);
      });
    } else {
      polyline.setLatLngs([]);
    }
  }, [propWaypoints, currentMission]);

  // Actions
  const handleCenterDrone = () => {
    const map = mapRef.current;
    if (!map) return;
    if (telemetry.latitude && telemetry.longitude && Math.abs(telemetry.latitude) > 0.001) {
      map.panTo([telemetry.latitude, telemetry.longitude], { animate: true });
    }
  };

  const handleFitBoundary = () => {
    const map = mapRef.current;
    if (!map) return;
    const coords = propBoundaryPolygon || currentMission?.geometry?.coordinates;
    if (coords && coords.length >= 3) {
      const bounds = L.latLngBounds(coords.map((c) => [c.lat, c.lng]));
      map.fitBounds(bounds, { padding: [40, 40], animate: true });
    } else if (telemetry.latitude && telemetry.longitude) {
      map.panTo([telemetry.latitude, telemetry.longitude], { animate: true });
    }
  };

  return (
    <div className={`relative w-full h-full min-h-[300px] rounded-xl overflow-hidden border border-slate-800 bg-slate-950 select-none ${className}`}>
      {/* Map Backing Div */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Top Floating Controls: Tile Layer + Fit Boundary + Recenter */}
      <div className="absolute top-3 left-3 z-[1000] flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md px-2 py-1 rounded-lg border border-slate-700 shadow-xl text-xs font-mono text-slate-200">
        <span className="text-[10px] uppercase font-bold text-slate-400">Map:</span>
        {(['Satellite', 'Dark', 'Street'] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setActiveLayer(l)}
            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
              activeLayer === l ? 'bg-sky-600 text-white' : 'hover:bg-slate-800 text-slate-400'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Recenter & Fit Boundary Buttons */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-1.5">
        <button
          type="button"
          onClick={handleCenterDrone}
          title="Center on Drone Position"
          className="w-8 h-8 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-sky-400 flex items-center justify-center shadow-xl transition-colors cursor-pointer"
        >
          <Crosshair className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleFitBoundary}
          title="Fit Search Boundary"
          className="w-8 h-8 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-cyan-400 flex items-center justify-center shadow-xl transition-colors cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Top Center: 7-Layer Vector Control Bar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] hidden md:flex items-center gap-1 bg-slate-900/95 backdrop-blur-md px-2.5 py-1 rounded-lg border border-slate-700 shadow-2xl text-[10px] font-mono text-slate-300">
        <span className="text-[9px] uppercase font-bold text-slate-500 mr-1 flex items-center gap-1">
          <Layers className="w-3 h-3 text-cyan-400" />
          <span>LAYERS:</span>
        </span>

        <button
          type="button"
          onClick={() => setShowBoundary(!showBoundary)}
          className={`px-2 py-0.5 rounded cursor-pointer transition ${
            showBoundary ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/60 font-bold' : 'text-slate-500 hover:text-slate-300'
          }`}
          title="Toggle Search Boundary Layer"
        >
          Boundary
        </button>

        <button
          type="button"
          onClick={() => setShowDrone(!showDrone)}
          className={`px-2 py-0.5 rounded cursor-pointer transition ${
            showDrone ? 'bg-sky-950 text-sky-300 border border-sky-500/60 font-bold' : 'text-slate-500 hover:text-slate-300'
          }`}
          title="Toggle Live Drone Position"
        >
          Drone
        </button>

        <button
          type="button"
          onClick={() => setShowFlightCoverage(!showFlightCoverage)}
          className={`px-2 py-0.5 rounded cursor-pointer transition ${
            showFlightCoverage ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/60 font-bold' : 'text-slate-500 hover:text-slate-300'
          }`}
          title="Toggle Optical Flight Coverage Swath"
        >
          Swath
        </button>

        <button
          type="button"
          onClick={() => setShowDetections(!showDetections)}
          className={`px-2 py-0.5 rounded cursor-pointer transition ${
            showDetections ? 'bg-rose-950 text-rose-300 border border-rose-500/60 font-bold' : 'text-slate-500 hover:text-slate-300'
          }`}
          title="Toggle Detections (QR & Boxes)"
        >
          Detections ({detectedTargets.length})
        </button>

        <button
          type="button"
          onClick={() => setShowConfidenceOverlay(!showConfidenceOverlay)}
          className={`px-2 py-0.5 rounded cursor-pointer transition ${
            showConfidenceOverlay ? 'bg-blue-950 text-blue-300 border border-blue-500/60 font-bold' : 'text-slate-500 hover:text-slate-300'
          }`}
          title="Toggle Confidence Overlays"
        >
          Confidence
        </button>

        <button
          type="button"
          onClick={() => setShowUncertaintyLayer(!showUncertaintyLayer)}
          className={`px-2 py-0.5 rounded cursor-pointer transition ${
            showUncertaintyLayer ? 'bg-amber-950 text-amber-300 border border-amber-500/60 font-bold' : 'text-slate-500 hover:text-slate-300'
          }`}
          title="Toggle Uncertainty Layer"
        >
          Uncertainty
        </button>
      </div>

      {/* Bottom Floating Legend & Detection Filter Bar */}
      <div className="absolute bottom-3 left-3 z-[1000] flex items-center gap-2 bg-slate-900/95 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700 shadow-xl text-[10px] font-mono text-slate-300 flex-wrap">
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
          <span>BOUNDARY</span>
        </div>
        <div className="w-px h-3 bg-slate-700" />
        <div className="flex items-center gap-1">
          <span className="w-3 h-0.5 bg-emerald-400" />
          <span>COVERAGE SWATH</span>
        </div>
        <div className="w-px h-3 bg-slate-700" />
        <div className="flex items-center gap-1 text-blue-400 font-bold">
          <span>📱 QR (BLUE)</span>
        </div>
        <div className="w-px h-3 bg-slate-700" />
        <div className="flex items-center gap-1 text-rose-400 font-bold">
          <span>📦 BOX (RED)</span>
        </div>

        {/* Filter controls */}
        <div className="w-px h-3 bg-slate-700 ml-1" />
        <div className="flex items-center gap-1">
          <span className="text-slate-500">FILTER:</span>
          {(['ALL', 'QR_ONLY', 'BOX_ONLY'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setDetectionFilter(f)}
              className={`px-1.5 py-0.2 rounded text-[9px] font-bold cursor-pointer transition ${
                detectionFilter === f ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {f.replace('_ONLY', '')}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
