import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Compass,
  Play,
  RotateCcw,
  Sliders,
  Layers,
  MapPin,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Loader2,
  Trash2,
  Check,
  Crosshair,
  Battery,
  Satellite,
  Wifi,
  Cpu,
  Radio,
  Eye,
  Camera,
  Maximize2,
  Pencil
} from 'lucide-react';
import { Card } from '../../ui/Card';
import {
  groundStationMissionService,
  calculateHaversineDistance
} from '../../services/groundStationMissionService';
import { mavlinkService } from '../../services/mavlinkService';
import { missionEngine } from '../../services/missionEngine';
import { audioService } from '../../services/audioService';
import {
  geofenceService,
  calculateBoundaryMetrics,
  autoSelectSearchPattern,
  BoundaryMetrics,
  AutoPatternDecision
} from '../../services/geofenceService';
import { reconDetectionService } from '../../services/reconDetectionService';
import {
  visionHeatmapService,
  VisionRegisteredObject
} from '../../services/visionHeatmapService';
import { targetDetectionEngine } from '../../services/targetDetectionEngine';
import { DashboardTelemetryData } from '../../hooks/useDashboardTelemetry';
import { GroundStationMission } from '../../types/groundStationMap';
import { LatLngPoint, HomePoint, SearchAlgorithmType } from '../../types/mission';

export type AutonomousSearchPattern =
  | 'BOUSTROPHEDON'
  | 'EXPANDING_SPIRAL'
  | 'INWARD_SPIRAL'
  | 'PERIMETER';

interface AutonomousMissionControlCardProps {
  telemetry: DashboardTelemetryData;
  onOpenPreflightModal: () => void;
  onUploadWaypoints?: () => Promise<void>;
  onEmergencyRTL: () => void;
  rtlConfirmPending?: boolean;
  className?: string;
  activeMissionTime?: {
    elapsedSeconds: number;
    remainingSeconds: number;
    status: string;
    deadline?: number;
    isExecuting: boolean;
  };
  onOpenPhoneMission?: () => void;
}

export const AutonomousMissionControlCard: React.FC<AutonomousMissionControlCardProps> = ({
  telemetry,
  onOpenPreflightModal,
  onEmergencyRTL,
  rtlConfirmPending = false,
  className = '',
  activeMissionTime,
  onOpenPhoneMission,
}) => {
  // Navigation Tabs for Responsive Organization
  const [activeDeckTab, setActiveDeckTab] = useState<'MISSION' | 'FC_PARAMS' | 'TARGET_QUEUE'>('MISSION');

  // =========================================================================
  // 1. GEOFENCE-FIRST BOUNDARY CONFIGURATION (User defines circle/polygon/rect/freehand)
  // =========================================================================
  const [isGeofenceFirstActive, setIsGeofenceFirstActive] = useState<boolean>(true);
  const [boundaryType, setBoundaryType] = useState<'CIRCLE' | 'RECTANGLE' | 'POLYGON' | 'FREEHAND'>(() => {
    try {
      const saved = localStorage.getItem('sae_boundary_type');
      if (saved === 'CIRCLE' || saved === 'POLYGON' || saved === 'RECTANGLE' || saved === 'FREEHAND') return saved;
      return 'RECTANGLE';
    } catch {
      return 'RECTANGLE';
    }
  });
  const [rectWidth, setRectWidth] = useState<number>(() => {
    try { return parseInt(localStorage.getItem('sae_boundary_width') || '30', 10); } catch { return 30; }
  });
  const [rectHeight, setRectHeight] = useState<number>(() => {
    try { return parseInt(localStorage.getItem('sae_boundary_height') || '20', 10); } catch { return 20; }
  });
  const [circleRadius, setCircleRadius] = useState<number>(() => {
    try { return parseInt(localStorage.getItem('sae_boundary_radius') || '15', 10); } catch { return 15; }
  });
  const [isBoundaryConfirmed, setIsBoundaryConfirmed] = useState<boolean>(() => {
    try { return localStorage.getItem('sae_boundary_confirmed') === 'true'; } catch { return false; }
  });
  const [boundaryConfirmedNotice, setBoundaryConfirmedNotice] = useState<string | null>(null);
  const [boundaryValidationError, setBoundaryValidationError] = useState<string | null>(null);

  // =========================================================================
  // 2. AUTOMATIC SEARCH-PATTERN SELECTION (System selects & explains based on shape)
  // =========================================================================
  const [autoPatternDecision, setAutoPatternDecision] = useState<AutoPatternDecision | null>(() => {
    try {
      const saved = localStorage.getItem('sae_auto_pattern_decision');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [selectedPattern, setSelectedPattern] = useState<AutonomousSearchPattern | null>(() => {
    try { return (localStorage.getItem('sae_selected_pattern') as any) || null; } catch { return null; }
  });
  const [isPatternConfirmed, setIsPatternConfirmed] = useState<boolean>(() => {
    try { return localStorage.getItem('sae_pattern_confirmed') === 'true'; } catch { return false; }
  });

  // Search Altitude (Envelope: 2.0m-25.0m, default 5.0m)
  const [altitude, setAltitude] = useState<number>(() => {
    try { return parseFloat(localStorage.getItem('sae_search_altitude') || '5.0'); } catch { return 5.0; }
  });
  const [altitudeError, setAltitudeError] = useState<string | null>(null);

  // Mission Upload & MAVLink handshake state
  const [isUploadingMission, setIsUploadingMission] = useState<boolean>(false);
  const [isMissionUploaded, setIsMissionUploaded] = useState<boolean>(false);
  const [uploadStatusNotice, setUploadStatusNotice] = useState<string | null>(null);

  // =========================================================================
  // 3. FLIGHT CONTROLLER CONFIGURATION (Non-waypoint direct trajectory & guided mode)
  // =========================================================================
  const [isFcConfiguring, setIsFcConfiguring] = useState<boolean>(false);
  const [isFcConfigured, setIsFcConfigured] = useState<boolean>(() => {
    try { return localStorage.getItem('sae_fc_configured') === 'true'; } catch { return false; }
  });
  const [fcConfigNotice, setFcConfigNotice] = useState<string | null>(null);

  // =========================================================================
  // 4. FIVE-MINUTE TARGET SEARCH TIMER (300s window, persists timestamps across page reload)
  // =========================================================================
  const SEARCH_WINDOW_LIMIT_SEC = 300; // Exactly 5 minutes
  const [searchTimerActive, setSearchTimerActive] = useState<boolean>(() => {
    try {
      return (
        localStorage.getItem('sae_mission_window_active') === 'true' ||
        localStorage.getItem('sae_search_timer_active') === 'true'
      );
    } catch {
      return false;
    }
  });
  const [searchSecondsRemaining, setSearchSecondsRemaining] = useState<number>(() => {
    try {
      const endTime = parseInt(
        localStorage.getItem('sae_mission_window_end') ||
        localStorage.getItem('sae_search_timer_end') ||
        '0',
        10
      );
      if (endTime > 0) {
        const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
        return remaining;
      }
      const startTime = parseInt(localStorage.getItem('sae_mission_window_start') || localStorage.getItem('sae_search_timer_start') || '0', 10);
      if (startTime > 0 && (localStorage.getItem('sae_mission_window_active') === 'true' || localStorage.getItem('sae_search_timer_active') === 'true')) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        return Math.max(0, SEARCH_WINDOW_LIMIT_SEC - elapsed);
      }
      return SEARCH_WINDOW_LIMIT_SEC;
    } catch {
      return SEARCH_WINDOW_LIMIT_SEC;
    }
  });
  const [searchSecondsElapsed, setSearchSecondsElapsed] = useState<number>(() => {
    try {
      const startTime = parseInt(
        localStorage.getItem('sae_mission_window_start') ||
        localStorage.getItem('sae_search_timer_start') ||
        '0',
        10
      );
      if (startTime > 0) {
        return Math.floor((Date.now() - startTime) / 1000);
      }
      return 0;
    } catch {
      return 0;
    }
  });
  const [isSearchTimedOut, setIsSearchTimedOut] = useState<boolean>(() => {
    try {
      const endTime = parseInt(localStorage.getItem('sae_mission_window_end') || '0', 10);
      return endTime > 0 && Date.now() >= endTime;
    } catch {
      return false;
    }
  });

  // Target Lock Tracking
  const [targetLockState, setTargetLockState] = useState<'SEARCHING' | 'CANDIDATE_DETECTED' | 'TARGET_LOST' | 'TARGET_LOCKED' | 'TIMEOUT'>('SEARCHING');
  const [lockedTargetCode, setLockedTargetCode] = useState<string | null>(null);
  const [lockedTargetPayload, setLockedTargetPayload] = useState<string | null>(null);
  const lastCandidateSeenAtRef = useRef<number>(0);

  // Object Queue & Heatmap
  const [objectQueue, setObjectQueue] = useState<VisionRegisteredObject[]>([]);
  const [currentMission, setCurrentMission] = useState<GroundStationMission | null>(() =>
    groundStationMissionService.getCurrentMission()
  );

  // Subscribe to Vision Objects & Ground Station Mission
  useEffect(() => {
    const unsubObjects = visionHeatmapService.subscribeObjects(setObjectQueue);
    const unsubMission = groundStationMissionService.subscribe(setCurrentMission);
    return () => {
      unsubObjects();
      unsubMission();
    };
  }, []);

  // Optical Geometry & Downward Reconnaissance Camera (Sony IMX477)
  // Lens FOV = 65° total horizontal FOV. Ground swath W = 2 * h * tan(32.5°)
  const opticalSwathWidth = Math.round(2 * altitude * Math.tan((32.5 * Math.PI) / 180) * 100) / 100;
  const laneSpacingMeters = Math.round(opticalSwathWidth * 0.75 * 100) / 100;

  // Resolve Search Center
  const getSearchCenter = (): LatLngPoint => {
    if (telemetry.isGpsValid && telemetry.latitude && Math.abs(telemetry.latitude) > 0.001) {
      return { lat: telemetry.latitude, lng: telemetry.longitude };
    }
    const home = mavlinkService.getHomePoint();
    if (home.isSet && Math.abs(home.latitude) > 0.001) {
      return { lat: home.latitude, lng: home.longitude };
    }
    if (currentMission && currentMission.waypoints.length > 0) {
      return { lat: currentMission.waypoints[0].lat, lng: currentMission.waypoints[0].lng };
    }
    return { lat: 13.0827, lng: 80.2707 };
  };

  // Comprehensive Real-Time Boundary Metrics HUD Calculation
  const computedMetrics: BoundaryMetrics = useMemo(() => {
    const center = getSearchCenter();
    if (boundaryType === 'CIRCLE') {
      return calculateBoundaryMetrics({
        type: 'CIRCLE',
        circleCenter: center,
        circleRadiusMeters: circleRadius
      });
    }

    if (boundaryType === 'RECTANGLE') {
      const radLat = (center.lat * Math.PI) / 180;
      const dLng = (rectWidth / 2) / (111320 * Math.cos(radLat));
      const dLat = (rectHeight / 2) / 111320;
      const coords: LatLngPoint[] = [
        { lat: center.lat - dLat, lng: center.lng - dLng },
        { lat: center.lat + dLat, lng: center.lng - dLng },
        { lat: center.lat + dLat, lng: center.lng + dLng },
        { lat: center.lat - dLat, lng: center.lng + dLng },
      ];
      return calculateBoundaryMetrics({
        type: 'RECTANGLE',
        coordinates: coords
      });
    }

    // POLYGON or FREEHAND
    const customVertices = geofenceService.getState().customVertices;
    const missionCoords = currentMission?.geometry?.coordinates;
    const coords = (customVertices && customVertices.length >= 3)
      ? customVertices
      : (missionCoords && missionCoords.length >= 3 ? missionCoords : []);

    return calculateBoundaryMetrics({
      type: boundaryType === 'FREEHAND' ? 'FREEHAND' : 'POLYGON',
      coordinates: coords
    });
  }, [boundaryType, circleRadius, rectWidth, rectHeight, currentMission, telemetry]);

  const boundaryArea = computedMetrics.areaSquareMeters;
  const boundaryPerimeter = computedMetrics.perimeterMeters;

  // Pre-Arm Boundary Containment Verification
  const isDroneInsideBoundary = ((): boolean => {
    if (telemetry.rawConnectionState.connectionType === 'SIMULATED') return true;
    if (!telemetry.isGpsValid || Math.abs(telemetry.latitude) < 0.001) return true;

    const center = getSearchCenter();
    const dLat = telemetry.latitude;
    const dLon = telemetry.longitude;

    if (boundaryType === 'CIRCLE') {
      const d = calculateHaversineDistance(dLat, dLon, center.lat, center.lng);
      return d <= circleRadius + 2.0;
    }

    if (currentMission?.geometry?.coordinates && currentMission.geometry.coordinates.length >= 3) {
      return geofenceService.isPointInPolygon(dLat, dLon, currentMission.geometry.coordinates);
    }

    const dist = calculateHaversineDistance(dLat, dLon, center.lat, center.lng);
    return dist <= Math.max(rectWidth, rectHeight) / 2.0 + 2.0;
  })();

  // =========================================================================
  // GEOFENCE-FIRST BOUNDARY SAVE & AUTO-PATTERN SELECTION HANDLER
  // =========================================================================
  const handleConfirmBoundary = () => {
    const center = getSearchCenter();
    const home: HomePoint = mavlinkService.getHomePoint().isSet
      ? mavlinkService.getHomePoint()
      : { latitude: center.lat, longitude: center.lng, altitude: 0, timestamp: Date.now(), isSet: true };

    // 1. Validate boundary geometry & check for self-intersections
    if (computedMetrics.validationError) {
      audioService.playBeep(350, 250);
      setBoundaryValidationError(computedMetrics.validationError);
      setBoundaryConfirmedNotice(`❌ Boundary Rejected: ${computedMetrics.validationError}`);
      setIsBoundaryConfirmed(false);
      return;
    }

    // 2. Validate selected boundary against configured geofence
    const validation = geofenceService.validateSearchBoundary({
      type: boundaryType === 'CIRCLE' ? 'CIRCLE' : (boundaryType === 'RECTANGLE' ? 'RECTANGLE' : (boundaryType === 'FREEHAND' ? 'FREEHAND' : 'POLYGON')),
      circleCenter: center,
      circleRadiusMeters: boundaryType === 'CIRCLE' ? circleRadius : undefined,
      coordinates: (boundaryType === 'POLYGON' || boundaryType === 'FREEHAND') ? currentMission?.geometry?.coordinates : undefined,
      altitude: altitude
    });

    if (!validation.isValid) {
      audioService.playBeep(350, 250);
      setBoundaryValidationError(validation.reason || 'Selected search boundary exceeds geofence limits');
      setBoundaryConfirmedNotice(`❌ Geofence Violation: ${validation.reason}`);
      setIsBoundaryConfirmed(false);
      return;
    }

    setBoundaryValidationError(null);

    // 3. Automatic search-pattern selection (Section B: analyze shape, select algorithm & display scientific reason)
    const decision = autoSelectSearchPattern(boundaryType, computedMetrics, altitude);
    setAutoPatternDecision(decision);
    setSelectedPattern(decision.algorithm as AutonomousSearchPattern);
    setIsPatternConfirmed(true);

    try {
      localStorage.setItem('sae_auto_pattern_decision', JSON.stringify(decision));
      localStorage.setItem('sae_selected_pattern', decision.algorithm);
      localStorage.setItem('sae_pattern_confirmed', 'true');
    } catch { }

    // 4. Generate internal search pattern route according to selected boundary
    const rad = boundaryType === 'CIRCLE' ? circleRadius : Math.max(rectWidth, rectHeight) / 2.0;
    const dims = { width: rectWidth, height: rectHeight };

    groundStationMissionService.generateAutonomousSearchMission(
      center,
      rad,
      decision.algorithm,
      home,
      altitude,
      4.0, // 4-minute time limit
      4.0, // 4.0 m/s cruise speed
      dims
    );

    const mission = groundStationMissionService.getCurrentMission();
    const boundaryCoordinates = mission?.geometry?.coordinates || [];

    missionEngine.updateMissionConfig({
      searchAltitude: altitude,
      searchBoundary: {
        type: boundaryType === 'CIRCLE' ? 'CIRCLE' : 'RECTANGLE',
        coordinates: boundaryCoordinates,
        circleCenter: center,
        circleRadiusMeters: circleRadius,
        widthMeters: rectWidth,
        heightMeters: rectHeight,
        areaSquareMeters: computedMetrics.areaSquareMeters,
        label: `${boundaryType} Search Boundary`
      },
      searchAlgorithm: decision.algorithm as SearchAlgorithmType
    });

    setIsBoundaryConfirmed(true);
    try {
      localStorage.setItem('sae_boundary_confirmed', 'true');
      localStorage.setItem('sae_boundary_type', boundaryType);
      localStorage.setItem('sae_boundary_width', String(rectWidth));
      localStorage.setItem('sae_boundary_height', String(rectHeight));
      localStorage.setItem('sae_boundary_radius', String(circleRadius));
      localStorage.setItem('sae_search_altitude', String(altitude));
    } catch { }

    setBoundaryConfirmedNotice(`✓ Search Boundary Saved: ${computedMetrics.areaSquareMeters.toLocaleString()} m² (${boundaryType}) within geofence. Selected Algorithm: ${decision.algorithmName}.`);
    audioService.playBeep(920, 80);
    setTimeout(() => setBoundaryConfirmedNotice(null), 5000);
  };

  // =========================================================================
  // ALTITUDE INPUT & PERSISTENCE HANDLER
  // =========================================================================
  const handleAltitudeChange = (newAlt: number) => {
    if (isNaN(newAlt)) return;
    if (newAlt < 2.0) {
      setAltitudeError('Altitude below safe operational minimum (2.0m AGL).');
      return;
    }
    if (newAlt > 25.0) {
      setAltitudeError('Altitude exceeds operational geofence ceiling (25.0m AGL).');
      return;
    }
    setAltitudeError(null);
    setAltitude(newAlt);
    try {
      localStorage.setItem('sae_search_altitude', String(newAlt));
    } catch { }

    // If boundary already confirmed, recompute trajectory with new altitude
    if (isBoundaryConfirmed && autoPatternDecision) {
      const decision = autoSelectSearchPattern(boundaryType, computedMetrics, newAlt);
      setAutoPatternDecision(decision);
      const center = getSearchCenter();
      const home: HomePoint = mavlinkService.getHomePoint().isSet
        ? mavlinkService.getHomePoint()
        : { latitude: center.lat, longitude: center.lng, altitude: 0, timestamp: Date.now(), isSet: true };
      const rad = boundaryType === 'CIRCLE' ? circleRadius : Math.max(rectWidth, rectHeight) / 2.0;

      groundStationMissionService.generateAutonomousSearchMission(
        center,
        rad,
        decision.algorithm,
        home,
        newAlt,
        4.0,
        4.0,
        { width: rectWidth, height: rectHeight }
      );
    }
  };

  // Map drawing tool triggers
  const handleStartDrawingOnMap = () => {
    audioService.playBeep(900, 80);
    if (boundaryType === 'CIRCLE') {
      groundStationMissionService.setDrawingTool('circle');
      setBoundaryConfirmedNotice('⭕ Click on map to place circular search boundary');
    } else if (boundaryType === 'POLYGON') {
      groundStationMissionService.setDrawingTool('polygon');
      setBoundaryConfirmedNotice('⬢ Click map to place polygon search boundary vertices (minimum 3 points)');
    } else if (boundaryType === 'FREEHAND') {
      groundStationMissionService.setDrawingTool('draw');
      setBoundaryConfirmedNotice('✎ Drag or click on map to sketch freehand boundary path');
    } else {
      groundStationMissionService.setDrawingTool('point');
      setBoundaryConfirmedNotice('▬ Click map to center search boundary');
    }
  };

  const handleClearBoundary = () => {
    audioService.playBeep(500, 60);
    setIsBoundaryConfirmed(false);
    setIsPatternConfirmed(false);
    setAutoPatternDecision(null);
    setIsMissionUploaded(false);
    groundStationMissionService.clearMission();
    try {
      localStorage.removeItem('sae_boundary_confirmed');
      localStorage.removeItem('sae_pattern_confirmed');
      localStorage.removeItem('sae_auto_pattern_decision');
    } catch { }
    setBoundaryConfirmedNotice('Boundary cleared. Please draw a new search-area boundary.');
    setTimeout(() => setBoundaryConfirmedNotice(null), 3000);
  };

  // MAVLink Mission Upload to Pixhawk
  const handleUploadToPixhawk = async () => {
    if (!currentMission || !currentMission.waypoints || currentMission.waypoints.length === 0) {
      setUploadStatusNotice('No waypoints generated to upload. Please save boundary first.');
      return;
    }
    setIsUploadingMission(true);
    setUploadStatusNotice('Transmitting mission items to Pixhawk flight controller (MISSION_COUNT, MISSION_ITEM_INT)...');
    try {
      const res = await groundStationMissionService.uploadMissionToDrone();
      if (res.success) {
        setIsMissionUploaded(true);
        setUploadStatusNotice(`✓ Mission Confirmed by Pixhawk: ${res.message}. Aircraft safely disarmed.`);
        audioService.playBeep(980, 120);
      } else {
        setIsMissionUploaded(false);
        setUploadStatusNotice(`Upload rejected: ${res.message}`);
        audioService.playBeep(350, 200);
      }
    } catch (err: any) {
      setIsMissionUploaded(false);
      setUploadStatusNotice(`Upload error: ${err?.message || 'Check MAVLink link'}`);
    } finally {
      setIsUploadingMission(false);
    }
  };

  // =========================================================================
  // FLIGHT CONTROLLER CONFIGURATION (Non-waypoint direct guided setup)
  // =========================================================================
  const handleConfigureFlightController = async () => {
    if (!isBoundaryConfirmed) {
      setFcConfigNotice('Please confirm search boundary first.');
      return;
    }
    if (!selectedPattern) {
      setFcConfigNotice('Please select a search pattern first.');
      return;
    }

    setIsFcConfiguring(true);
    setFcConfigNotice('Configuring Pixhawk flight controller (GUIDED mode, geofence, altitude limits)...');

    try {
      const boundaryCoords = currentMission?.geometry?.coordinates || [];
      const res = await groundStationMissionService.configureFlightControllerSearchArea(
        boundaryCoords,
        altitude,
        4.0
      );

      if (res.success) {
        setIsFcConfigured(true);
        try { localStorage.setItem('sae_fc_configured', 'true'); } catch { }
        setFcConfigNotice(`✓ FC Configured: GUIDED mode ready, boundary committed (${altitude}m altitude).`);
      } else {
        setFcConfigNotice(`Configuration notice: ${res.message}`);
      }
    } catch (err: any) {
      setFcConfigNotice(`FC setup error: ${err?.message || 'Check MAVLink link'}`);
    } finally {
      setIsFcConfiguring(false);
      setTimeout(() => setFcConfigNotice(null), 5000);
    }
  };

  // =========================================================================
  // RESET MISSION HANDLER
  // =========================================================================
  const handleResetMission = () => {
    audioService.playBeep(450, 80);
    try {
      localStorage.removeItem('sae_search_timer_active');
      localStorage.removeItem('sae_search_timer_start');
      localStorage.removeItem('sae_search_timer_end');
      localStorage.removeItem('sae_mission_window_start');
      localStorage.removeItem('sae_mission_window_end');
      localStorage.removeItem('sae_mission_window_active');
      localStorage.removeItem('sae_boundary_confirmed');
      localStorage.removeItem('sae_pattern_confirmed');
      localStorage.removeItem('sae_fc_configured');
      localStorage.removeItem('sae_selected_pattern');
      localStorage.removeItem('sae_auto_pattern_decision');
      localStorage.removeItem('sae_mission_active_data');
    } catch { }

    setSearchTimerActive(false);
    setSearchSecondsRemaining(SEARCH_WINDOW_LIMIT_SEC);
    setSearchSecondsElapsed(0);
    setIsSearchTimedOut(false);
    setIsBoundaryConfirmed(false);
    setIsPatternConfirmed(false);
    setIsFcConfigured(false);
    setSelectedPattern(null);
    setAutoPatternDecision(null);
    setIsMissionUploaded(false);
    setUploadStatusNotice(null);
    setBoundaryValidationError(null);
    setAltitudeError(null);
    setTargetLockState('SEARCHING');
    setLockedTargetCode(null);
    setLockedTargetPayload(null);

    groundStationMissionService.clearMission();

    if (telemetry.isArmed && telemetry.altitudeMeters > 0.8) {
      mavlinkService.setFlightMode('LOITER');
    }

    setFcConfigNotice('✓ Mission & Timers Reset. Ready for fresh preparation.');
    setTimeout(() => setFcConfigNotice(null), 4000);
  };

  // =========================================================================
  // FIVE-MINUTE TARGET SEARCH TIMER & CONTINUOUS TARGET VALIDATION LIFECYCLE
  // =========================================================================
  const isMissionActive = Boolean(
    activeMissionTime?.isExecuting ||
    (telemetry.isArmed && telemetry.altitudeMeters > 1.0)
  );

  useEffect(() => {
    let timer: any = null;

    if (isMissionActive && isBoundaryConfirmed && isPatternConfirmed) {
      setSearchTimerActive(true);
      const now = Date.now();
      try {
        localStorage.setItem('sae_mission_window_active', 'true');
        localStorage.setItem('sae_search_timer_active', 'true');
        if (!localStorage.getItem('sae_mission_window_end')) {
          const startTime = now - searchSecondsElapsed * 1000;
          const endTime = startTime + SEARCH_WINDOW_LIMIT_SEC * 1000;
          localStorage.setItem('sae_mission_window_start', String(startTime));
          localStorage.setItem('sae_mission_window_end', String(endTime));
          localStorage.setItem('sae_search_timer_start', String(startTime));
          localStorage.setItem('sae_search_timer_end', String(endTime));
        }
      } catch { }

      timer = setInterval(() => {
        const endTs = parseInt(localStorage.getItem('sae_mission_window_end') || localStorage.getItem('sae_search_timer_end') || '0', 10);
        const rem = endTs > 0 ? Math.max(0, Math.floor((endTs - Date.now()) / 1000)) : null;

        setSearchSecondsRemaining((prev) => {
          const nextSec = rem !== null ? rem : prev - 1;
          if (nextSec <= 0) {
            clearInterval(timer);
            setIsSearchTimedOut(true);
            setTargetLockState('TIMEOUT');
            audioService.playTimeoutWarning();
            // Requirement A.5: Do NOT automatically disarm motors, stop flight, trigger RTL or interrupt active search
            return 0;
          }
          return nextSec;
        });

        setSearchSecondsElapsed((prev) => prev + 1);
      }, 1000);
    } else if (!isMissionActive) {
      // If operator hasn't actively locked timer, keep saved state
      if (localStorage.getItem('sae_mission_window_active') !== 'true' && localStorage.getItem('sae_search_timer_active') !== 'true') {
        setSearchTimerActive(false);
        if (timer) clearInterval(timer);
      }
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isMissionActive, isBoundaryConfirmed, isPatternConfirmed]);

  // Continuously process live target detections & validate before locking
  useEffect(() => {
    const unsubDetections = reconDetectionService.subscribeDetections((records) => {
      const verifiedRecord = records.find(
        (r) => r.twoDigitCode && /^\d{2}$/.test(r.twoDigitCode) && r.targetLocation !== null
      );

      if (verifiedRecord) {
        // Target confirmed with strict 2-digit regex validation
        setTargetLockState('TARGET_LOCKED');
        setLockedTargetCode(verifiedRecord.twoDigitCode || null);
        setLockedTargetPayload(verifiedRecord.payload || null);
        lastCandidateSeenAtRef.current = Date.now();
      } else if (records.length > 0) {
        setTargetLockState('CANDIDATE_DETECTED');
        lastCandidateSeenAtRef.current = Date.now();
      } else if (targetLockState === 'CANDIDATE_DETECTED') {
        // If candidate lost for > 3 seconds, resume search pattern
        if (Date.now() - lastCandidateSeenAtRef.current > 3000) {
          setTargetLockState('TARGET_LOST');
          setTimeout(() => {
            setTargetLockState('SEARCHING');
          }, 2000);
        }
      }
    });

    return () => unsubDetections();
  }, [targetLockState]);

  // =========================================================================
  // 10-STEP ORDERED AUTONOMOUS MISSION WORKFLOW (Requirement 6 & 7)
  // 1. Enable geofence
  // 2. Draw boundary
  // 3. Calculate dimensions
  // 4. Automatically select search algorithm
  // 5. Select altitude
  // 6. Generate waypoints
  // 7. Preview and validate waypoints
  // 8. Upload waypoints to Pixhawk
  // 9. Verify upload
  // 10. Require explicit operator authorization before execution
  // =========================================================================
  const AUTONOMOUS_10_STEPS = [
    { step: 1, label: '1. Enable geofence', short: 'Geofence Active', desc: 'Geofence interlock active & monitored' },
    { step: 2, label: '2. Draw boundary', short: 'Boundary Defined', desc: 'Search boundary defined on map' },
    { step: 3, label: '3. Calculate dimensions', short: 'Dimensions Ready', desc: 'Area, perimeter & centroid calculated' },
    { step: 4, label: '4. Automatically select search algorithm', short: 'Algorithm Selected', desc: 'Optimal pattern chosen based on shape' },
    { step: 5, label: '5. Select altitude', short: 'Altitude Set', desc: 'Sensor swath & cruise altitude set' },
    { step: 6, label: '6. Generate waypoints', short: 'Waypoints Generated', desc: 'Collision-free search trajectory created' },
    { step: 7, label: '7. Preview and validate waypoints', short: 'Waypoints Validated', desc: 'Geofence containment verified' },
    { step: 8, label: '8. Upload waypoints to Pixhawk', short: 'Uploaded to Pixhawk', desc: 'MAVLink mission item transfer' },
    { step: 9, label: '9. Verify upload', short: 'Upload Confirmed', desc: 'Pixhawk memory sequence acknowledged' },
    { step: 10, label: '10. Operator authorization', short: 'Operator Authorization', desc: 'Explicit launch authorization required' },
  ];

  // Pre-Arm Checks Computation
  const isGpsFixOk = Boolean(
    telemetry.isGpsLocked &&
    (telemetry.satellites || 0) >= 6 &&
    (telemetry.hdop < 2.0 || telemetry.rawConnectionState.connectionType === 'SIMULATED')
  );
  const isCompassOk = telemetry.isCompassHealthy ?? true;
  const isEkfOk = telemetry.ekfHealthy ?? true;
  const isBatteryOk = telemetry.batteryVoltage ? telemetry.batteryVoltage >= 10.5 : true;
  const isFcConnected = telemetry.isConnected || telemetry.rawConnectionState.isConnected;
  const isPrearmPassed = isFcConnected && isGpsFixOk && isCompassOk && isEkfOk && isBatteryOk && isDroneInsideBoundary;

  const currentStep = useMemo(() => {
    // Step 10: Authorization / Executing
    if (telemetry.isArmed || telemetry.flightMode === 'GUIDED' || telemetry.flightMode === 'AUTO') {
      return AUTONOMOUS_10_STEPS[9];
    }
    // Step 9: Verify upload (Uploaded & confirmed)
    if (isMissionUploaded && uploadStatusNotice?.includes('✓')) {
      return AUTONOMOUS_10_STEPS[9];
    }
    // Step 8: Upload to Pixhawk
    if (isUploadingMission || isMissionUploaded) {
      return AUTONOMOUS_10_STEPS[8];
    }
    // Step 7: Preview & validate waypoints
    if ((currentMission?.waypoints?.length || 0) > 0 && isBoundaryConfirmed && isDroneInsideBoundary) {
      return AUTONOMOUS_10_STEPS[7];
    }
    // Step 6: Generate waypoints
    if (isBoundaryConfirmed && autoPatternDecision && (currentMission?.waypoints?.length || 0) > 0) {
      return AUTONOMOUS_10_STEPS[6];
    }
    // Step 5: Select altitude
    if (isBoundaryConfirmed && autoPatternDecision && altitude >= 2.0 && !altitudeError) {
      return AUTONOMOUS_10_STEPS[5];
    }
    // Step 4: Automatically select search algorithm
    if (isBoundaryConfirmed && autoPatternDecision) {
      return AUTONOMOUS_10_STEPS[4];
    }
    // Step 3: Calculate dimensions
    if (computedMetrics.areaSquareMeters > 0 && !computedMetrics.validationError) {
      return AUTONOMOUS_10_STEPS[3];
    }
    // Step 2: Draw boundary
    if (isGeofenceFirstActive) {
      return AUTONOMOUS_10_STEPS[1];
    }
    // Step 1: Enable geofence
    return AUTONOMOUS_10_STEPS[0];
  }, [
    telemetry.isArmed,
    telemetry.flightMode,
    isMissionUploaded,
    uploadStatusNotice,
    isUploadingMission,
    currentMission,
    isBoundaryConfirmed,
    isDroneInsideBoundary,
    autoPatternDecision,
    altitude,
    altitudeError,
    computedMetrics.areaSquareMeters,
    computedMetrics.validationError,
    isGeofenceFirstActive,
  ]);

  const geofenceStatus = useMemo<'GEOFENCE ON' | 'GEOFENCE NOT CONFIGURED' | 'GEOFENCE VALIDATED'>(() => {
    if (isBoundaryConfirmed && !boundaryValidationError) {
      return 'GEOFENCE VALIDATED';
    }
    const hasCoordinates = boundaryType === 'CIRCLE'
      ? circleRadius > 0
      : (boundaryType === 'RECTANGLE'
        ? (rectWidth > 0 && rectHeight > 0)
        : ((currentMission?.geometry?.coordinates?.length || geofenceService.getState().customVertices?.length || 0) >= 3));
    if (!hasCoordinates) {
      return 'GEOFENCE NOT CONFIGURED';
    }
    return 'GEOFENCE ON';
  }, [isBoundaryConfirmed, boundaryValidationError, boundaryType, circleRadius, rectWidth, rectHeight, currentMission]);

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <Card
      title="SKYCON AUTONOMOUS SEARCH & RECON"
      action={
        <div className="flex items-center gap-1">
          {/* Deck Tabs */}
          <div className="flex items-center bg-[#161B22] p-0.5 rounded-lg border border-[var(--uav-card-border)] text-[10px] font-mono">
            <button
              type="button"
              onClick={() => setActiveDeckTab('MISSION')}
              className={`px-2 py-0.5 rounded font-bold transition cursor-pointer ${activeDeckTab === 'MISSION' ? 'bg-[#10B981] text-emerald-950 font-extrabold' : 'text-slate-400 hover:text-white'
                }`}
            >
              MISSION
            </button>
            <button
              type="button"
              onClick={() => setActiveDeckTab('FC_PARAMS')}
              className={`px-2 py-0.5 rounded font-bold transition cursor-pointer flex items-center gap-1 ${activeDeckTab === 'FC_PARAMS' ? 'bg-[#10B981] text-emerald-950 font-extrabold' : 'text-slate-400 hover:text-white'
                }`}
            >
              <span>FC STATUS</span>
              <span className={`w-2 h-2 rounded-full ${isPrearmPassed ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            </button>
            <button
              type="button"
              onClick={() => setActiveDeckTab('TARGET_QUEUE')}
              className={`px-2 py-0.5 rounded font-bold transition cursor-pointer flex items-center gap-1 ${activeDeckTab === 'TARGET_QUEUE' ? 'bg-[#10B981] text-emerald-950 font-extrabold' : 'text-slate-400 hover:text-white'
                }`}
            >
              <span>TARGETS</span>
              {objectQueue.length > 0 && (
                <span className="w-3.5 h-3.5 rounded-full bg-rose-500 text-white text-[8px] flex items-center justify-center font-bold">
                  {objectQueue.length}
                </span>
              )}
            </button>
          </div>
        </div>
      }
      className={`shrink-0 bg-[#0E131A] border-[var(--uav-card-border)] shadow-md select-none ${className}`}
      contentClassName="p-3 flex flex-col gap-3"
    >
      {/* ========================================================================= */}
      {/* 10-STEP ORDERED AUTONOMOUS PROCESS WORKFLOW (Requirement 6 & 7)           */}
      {/* ========================================================================= */}
      <div className="bg-[#121820] p-2.5 rounded-lg border border-slate-800 space-y-2">
        <div className="flex items-center justify-between text-[10.5px] font-mono">
          <span className="text-slate-300 uppercase font-bold flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>MISSION PROCESS:</span>
          </span>
          <span className={`font-black px-2 py-0.5 rounded border text-[10px] ${currentStep.step === 10
            ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/60'
            : 'bg-sky-950/90 text-sky-300 border-sky-500/60'
            }`}>
            STEP {currentStep.step} OF 10: {currentStep.short}
          </span>
        </div>

        {/* 10-Step Progress Bar */}
        <div className="grid grid-cols-10 gap-1 h-1.5 w-full">
          {AUTONOMOUS_10_STEPS.map((s) => (
            <div
              key={s.step}
              title={`${s.step}. ${s.label}`}
              className={`rounded-full transition-all ${s.step < currentStep.step || (s.step === 10 && telemetry.isArmed)
                ? 'bg-emerald-500'
                : s.step === currentStep.step
                  ? 'bg-sky-400 animate-pulse shadow-sm shadow-sky-400'
                  : 'bg-slate-800'
                }`}
            />
          ))}
        </div>

        {/* Workflow Steps Breakdown (Completed, Current Active, Pending) */}
        <div className="space-y-1 pt-1 max-h-36 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 font-mono text-[9.5px]">
          {AUTONOMOUS_10_STEPS.map((s) => {
            const isCompleted = s.step < currentStep.step || (s.step === 10 && telemetry.isArmed);
            const isCurrent = s.step === currentStep.step;
            return (
              <div
                key={s.step}
                className={`flex items-center justify-between px-2 py-1 rounded transition ${isCurrent
                  ? 'bg-sky-950/70 border border-sky-500/50 text-white font-bold'
                  : isCompleted
                    ? 'bg-slate-900/60 text-emerald-300'
                    : 'text-slate-500'
                  }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  {isCompleted ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                  ) : isCurrent ? (
                    <div className="w-2 h-2 rounded-full bg-sky-400 animate-ping shrink-0" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-slate-700 shrink-0" />
                  )}
                  <span className="truncate">{s.label}</span>
                </div>
                <span className="text-[8.5px] uppercase shrink-0 font-bold ml-1">
                  {isCompleted ? '✓ DONE' : isCurrent ? '▶ ACTIVE' : 'PENDING'}
                </span>
              </div>
            );
          })}
        </div>

        {/* Validation Status & Hardware Status Strip */}
        <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-slate-800/80 font-mono text-[9px]">
          <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800 flex items-center justify-between">
            <span className="text-slate-400">VALIDATION:</span>
            <span className={`font-bold ${isBoundaryConfirmed && !boundaryValidationError ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isBoundaryConfirmed && !boundaryValidationError ? 'VALIDATED ✓' : 'STANDBY'}
            </span>
          </div>
          <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800 flex items-center justify-between">
            <span className="text-slate-400">HARDWARE:</span>
            <span className={`font-bold ${isFcConnected ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isFcConnected ? (telemetry.isArmed ? 'ARMED' : 'DISARMED') : 'NO LINK'}
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* FIVE-MINUTE MISSION WINDOW TIMER & REAL-TIME SEARCH STATUS                */}
      {/* ========================================================================= */}
      <div className={`p-2.5 rounded-lg border flex items-center justify-between gap-3 font-mono ${isSearchTimedOut || searchSecondsRemaining === 0
        ? 'bg-rose-950/70 border-rose-500 text-rose-200'
        : targetLockState === 'TARGET_LOCKED'
          ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200'
          : searchTimerActive
            ? 'bg-sky-950/60 border-sky-500/60 text-sky-200'
            : 'bg-[#121820] border-slate-800 text-slate-300'
        }`}>
        <div className="flex items-center gap-2">
          <Clock className={`w-5 h-5 shrink-0 ${searchTimerActive && !isSearchTimedOut && searchSecondsRemaining > 0 ? 'animate-spin text-sky-400' : 'text-slate-500'}`} />
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-bold leading-tight flex items-center gap-2">
              <span>5-MINUTE MISSION WINDOW</span>
              <button
                type="button"
                onClick={handleResetMission}
                className="px-1.5 py-0.5 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-500/60 text-rose-300 hover:text-white text-[9px] font-bold flex items-center gap-0.5 cursor-pointer transition active:scale-95 shadow-sm"
                title="Reset mission timers, boundaries, and state back to preparation"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                <span>RESET</span>
              </button>
            </div>
            <div className="text-lg font-black tracking-wider text-white">
              {(isSearchTimedOut || searchSecondsRemaining === 0) ? (
                <span className="text-rose-400 font-bold text-xs tracking-normal uppercase">MISSION WINDOW EXPIRED</span>
              ) : (
                <>
                  {formatSeconds(searchSecondsRemaining)}
                  <span className="text-xs text-slate-400 font-normal ml-1">/ 05:00</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Target Status Indicator */}
        <div className="text-right">
          <span className="text-[9px] text-slate-400 block uppercase font-bold">TARGET STATUS</span>
          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black border uppercase ${targetLockState === 'TARGET_LOCKED'
            ? 'bg-emerald-900 border-emerald-400 text-emerald-200'
            : targetLockState === 'CANDIDATE_DETECTED'
              ? 'bg-amber-900 border-amber-400 text-amber-200 animate-pulse'
              : targetLockState === 'TARGET_LOST'
                ? 'bg-orange-950 border-orange-500 text-orange-200'
                : targetLockState === 'TIMEOUT'
                  ? 'bg-rose-900 border-rose-400 text-rose-200'
                  : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}>
            {targetLockState === 'TARGET_LOCKED'
              ? (lockedTargetCode ? `LOCKED: #${lockedTargetCode}` : 'TARGET LOCKED')
              : targetLockState.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ========================================================================= */}
      {/* TAB 1: GEOFENCE-FIRST AUTONOMOUS SEARCH MISSION WORKFLOW                  */}
      {/* ========================================================================= */}
      {activeDeckTab === 'MISSION' && (
        <div className="space-y-2.5">
          {/* ===================================================================== */}
          {/* STEP 1: GEOFENCE ENFORCEMENT - DEFINE SEARCH-AREA BOUNDARY            */}
          {/* ===================================================================== */}
          <div className="bg-[#161B22] p-2.5 rounded-lg border border-slate-800 space-y-2.5">
            {/* Header: GEOFENCE ENFORCEMENT & Required Status Display */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-white font-mono font-bold text-xs uppercase tracking-wide">
                  GEOFENCE ENFORCEMENT
                </span>
              </div>
              <span className={`text-[10px] font-mono font-black px-2 py-0.5 rounded border uppercase ${geofenceStatus === 'GEOFENCE VALIDATED'
                ? 'bg-emerald-950 text-emerald-300 border-emerald-500/60 shadow-sm'
                : geofenceStatus === 'GEOFENCE NOT CONFIGURED'
                  ? 'bg-amber-950 text-amber-300 border-amber-500/60'
                  : 'bg-sky-950 text-sky-300 border-sky-500/60'
                }`}>
                {geofenceStatus}
              </span>
            </div>

            {/* Instruction banner required by Section A & Requirement 4 */}
            <div className="text-[11px] font-mono text-slate-300 bg-slate-900/80 p-2 rounded border border-slate-800">
              <div className="text-emerald-400 font-bold flex items-center gap-1 mb-1">
                <MapPin className="w-3 h-3 text-emerald-400" />
                <span>Please draw your search-area boundary on the map.</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Define a circular, rectangular, polygon, or freehand boundary. The entire search area must remain strictly inside the configured geofence.
              </p>
            </div>

            {/* Boundary Shape Selector (All 4 Methods per Requirement 4) */}
            <div className="grid grid-cols-4 gap-1">
              {[
                { id: 'CIRCLE' as const, label: 'Circle', icon: '●' },
                { id: 'RECTANGLE' as const, label: 'Rectangle', icon: '▬' },
                { id: 'POLYGON' as const, label: 'Polygon', icon: '⬢' },
                { id: 'FREEHAND' as const, label: 'Freehand', icon: '✎' },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setBoundaryType(s.id);
                    setIsBoundaryConfirmed(false);
                    setIsPatternConfirmed(false);
                    setAutoPatternDecision(null);
                  }}
                  className={`py-1.5 px-1 rounded text-[10px] font-mono font-bold flex items-center justify-center gap-1 transition cursor-pointer border ${boundaryType === s.id
                    ? 'bg-emerald-600 text-white border-emerald-400 shadow-sm'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                >
                  <span>{s.icon}</span>
                  <span className="truncate">{s.label}</span>
                </button>
              ))}
            </div>

            {/* Dimensional Adjustments */}
            {boundaryType === 'CIRCLE' ? (
              <div className="pt-1 space-y-1 font-mono text-[11px]">
                <div className="flex justify-between text-slate-400">
                  <span>Radius & Diameter:</span>
                  <span className="font-bold text-white">R: {circleRadius}m | D: {circleRadius * 2}m ({computedMetrics.areaSquareMeters.toLocaleString()} m²)</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={60}
                  step={1}
                  value={circleRadius}
                  onChange={(e) => {
                    setCircleRadius(Number(e.target.value));
                    setIsBoundaryConfirmed(false);
                    setIsPatternConfirmed(false);
                  }}
                  className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
                />
              </div>
            ) : boundaryType === 'RECTANGLE' ? (
              <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
                <div>
                  <span className="text-slate-400 block text-[10px]">WIDTH: {rectWidth}m</span>
                  <input
                    type="range"
                    min={10}
                    max={80}
                    step={2}
                    value={rectWidth}
                    onChange={(e) => {
                      setRectWidth(Number(e.target.value));
                      setIsBoundaryConfirmed(false);
                      setIsPatternConfirmed(false);
                    }}
                    className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
                  />
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">LENGTH: {rectHeight}m</span>
                  <input
                    type="range"
                    min={10}
                    max={80}
                    step={2}
                    value={rectHeight}
                    onChange={(e) => {
                      setRectHeight(Number(e.target.value));
                      setIsBoundaryConfirmed(false);
                      setIsPatternConfirmed(false);
                    }}
                    className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
                  />
                </div>
              </div>
            ) : boundaryType === 'FREEHAND' ? (
              <div className="pt-1 font-mono text-[10.5px] space-y-1">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Freehand Boundary Points:</span>
                  <span className="font-bold text-white">
                    {currentMission?.geometry?.coordinates?.length || geofenceService.getState().customVertices.length || 0} Points Placed
                  </span>
                </div>
                <div className="text-[10px] text-slate-500">
                  Click "DRAW ON MAP" to sketch a continuous freehand flight boundary on the Leaflet map.
                </div>
              </div>
            ) : (
              <div className="pt-1 font-mono text-[10.5px] space-y-1">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Polygon Boundary Vertices:</span>
                  <span className="font-bold text-white">
                    {currentMission?.geometry?.coordinates?.length || geofenceService.getState().customVertices.length || 0} Points Placed
                  </span>
                </div>
                <div className="text-[10px] text-slate-500">
                  Click "DRAW ON MAP" to click vertices directly on the Leaflet map.
                </div>
              </div>
            )}

            {/* Automatically Calculated Boundary Metrics HUD (Section A) */}
            <div className="bg-[#10141B] p-2 rounded border border-slate-800/80 font-mono text-[9.5px] space-y-1">
              <div className="text-slate-400 font-bold uppercase text-[9px] flex items-center justify-between">
                <span>AUTOMATIC BOUNDARY METRICS:</span>
                <span className="text-emerald-400">{computedMetrics.isCircle ? 'CIRCULAR' : 'POLYGON'}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-slate-300">
                <div className="bg-slate-900/90 p-1.5 rounded border border-slate-800">
                  <span className="text-slate-500 block text-[8.5px]">AREA:</span>
                  <span className="font-bold text-emerald-300 text-[11px]">{computedMetrics.areaSquareMeters.toLocaleString()} m²</span>
                </div>
                <div className="bg-slate-900/90 p-1.5 rounded border border-slate-800">
                  <span className="text-slate-500 block text-[8.5px]">PERIMETER:</span>
                  <span className="font-bold text-sky-300 text-[11px]">{computedMetrics.perimeterMeters} m</span>
                </div>
                <div className="bg-slate-900/90 p-1.5 rounded border border-slate-800">
                  <span className="text-slate-500 block text-[8.5px]">APPROX L × W:</span>
                  <span className="font-bold text-amber-300">{computedMetrics.approxLengthMeters}m × {computedMetrics.approxWidthMeters}m</span>
                </div>
                <div className="bg-slate-900/90 p-1.5 rounded border border-slate-800">
                  <span className="text-slate-500 block text-[8.5px]">{computedMetrics.isCircle ? 'RADIUS / DIAMETER:' : 'CENTRE COORD:'}</span>
                  <span className="font-bold text-white truncate block">
                    {computedMetrics.isCircle
                      ? `R: ${computedMetrics.radiusMeters}m | D: ${computedMetrics.diameterMeters}m`
                      : `${computedMetrics.center.lat.toFixed(5)}, ${computedMetrics.center.lng.toFixed(5)}`}
                  </span>
                </div>
              </div>
            </div>

            {/* Boundary Validation Alert (Self-intersection or Geofence breach) */}
            {boundaryValidationError && (
              <div className="text-[10px] font-mono text-rose-300 bg-rose-950/80 border border-rose-500/60 p-2 rounded flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                <span className="leading-snug">{boundaryValidationError}</span>
              </div>
            )}

            {/* Boundary Action Controls: Draw on Map, Save, Clear & Redraw */}
            <div className="grid grid-cols-3 gap-1.5 font-mono text-[10px]">
              <button
                type="button"
                onClick={handleStartDrawingOnMap}
                className="py-1.5 px-2 rounded bg-sky-950/80 hover:bg-sky-900 border border-sky-500/60 text-sky-200 font-bold flex items-center justify-center gap-1 transition cursor-pointer"
                title="Click on the Leaflet map to draw or adjust search boundary"
              >
                <Pencil className="w-3 h-3 text-sky-400" />
                <span>DRAW ON MAP</span>
              </button>
              <button
                type="button"
                onClick={handleClearBoundary}
                className="py-1.5 px-2 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-bold flex items-center justify-center gap-1 transition cursor-pointer"
                title="Clear current boundary and redraw"
              >
                <RotateCcw className="w-3 h-3" />
                <span>CLEAR / REDRAW</span>
              </button>
              <button
                type="button"
                onClick={handleConfirmBoundary}
                className={`py-1.5 px-2 rounded font-bold flex items-center justify-center gap-1 transition cursor-pointer shadow-sm ${isBoundaryConfirmed
                  ? 'bg-slate-800 text-emerald-400 border border-emerald-500/50'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400'
                  }`}
              >
                <Check className="w-3 h-3" />
                <span>{isBoundaryConfirmed ? '✓ SAVED' : 'SAVE BOUNDARY'}</span>
              </button>
            </div>

            {boundaryConfirmedNotice && (
              <div className={`text-[10px] font-mono text-center animate-fade-in p-1.5 rounded ${boundaryConfirmedNotice.includes('❌')
                ? 'text-rose-300 bg-rose-950/80 border border-rose-500/50'
                : 'text-emerald-300 bg-emerald-950/40 border border-emerald-500/30'
                }`}>
                {boundaryConfirmedNotice}
              </div>
            )}
          </div>

          {/* ===================================================================== */}
          {/* STEP 2: AUTOMATIC SEARCH-PATTERN SELECTION (Section B)                */}
          {/* ===================================================================== */}
          <div className="bg-[#161B22] p-2.5 rounded-lg border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-200 font-bold flex items-center gap-1.5">
                <span className="text-emerald-400">2.</span> AUTOMATIC SEARCH-PATTERN SELECTION:
              </span>
              <span className="text-[9.5px] font-bold px-2 py-0.5 rounded border bg-emerald-950 text-emerald-300 border-emerald-500/50">
                AUTOMATIC ANALYSIS
              </span>
            </div>

            {autoPatternDecision ? (
              <div className="space-y-1.5 font-mono text-[10.5px]">
                <div className="bg-[#11161E] p-2 rounded border border-emerald-500/40 flex items-center justify-between">
                  <span className="text-slate-400">Selected Algorithm:</span>
                  <span className="font-extrabold text-emerald-300 text-xs">
                    {autoPatternDecision.algorithmName}
                  </span>
                </div>
                <div className="bg-slate-900/90 p-2 rounded border border-slate-800 text-[10px] text-slate-300 space-y-1">
                  <span className="text-sky-400 font-bold block text-[9px] uppercase">Scientific Selection Reason:</span>
                  <p className="leading-relaxed text-slate-300">
                    {autoPatternDecision.reason}
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-2 rounded bg-slate-900/60 border border-slate-800 text-[10px] font-mono text-slate-400">
                Save your search boundary in Step 1 to automatically analyze the shape and select the optimal search algorithm.
              </div>
            )}
          </div>

          {/* ===================================================================== */}
          {/* STEP 3: ALTITUDE SELECTION & OPTICAL GEOMETRY (Section C)             */}
          {/* ===================================================================== */}
          <div className="bg-[#161B22] p-2.5 rounded-lg border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300 font-bold flex items-center gap-1.5">
                <span className="text-emerald-400">3.</span> SEARCH ALTITUDE SELECTION:
              </span>
              <span className="font-bold text-white bg-slate-900 px-2 py-0.5 rounded border border-slate-700 text-[11px]">
                {altitude.toFixed(1)}m AGL
              </span>
            </div>

            <div className="flex items-center gap-2 font-mono">
              <div className="flex-1 flex items-center bg-slate-900 px-2 py-1 rounded border border-slate-700">
                <input
                  type="number"
                  min={2.0}
                  max={25.0}
                  step={0.5}
                  value={altitude}
                  onChange={(e) => handleAltitudeChange(parseFloat(e.target.value))}
                  className="w-full bg-transparent text-white font-bold text-sm outline-none"
                />
                <span className="text-slate-400 text-xs ml-1">m</span>
              </div>
              <div className="flex items-center gap-1">
                {[3, 5, 8, 10, 15].map((alt) => (
                  <button
                    key={alt}
                    type="button"
                    onClick={() => handleAltitudeChange(alt)}
                    className={`py-1 px-1.5 rounded text-[10px] font-mono font-bold transition cursor-pointer border ${altitude === alt
                      ? 'bg-emerald-600 text-white border-emerald-400 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                  >
                    {alt}m
                  </button>
                ))}
              </div>
            </div>

            {altitudeError && (
              <div className="text-[10px] font-mono text-rose-300 bg-rose-950/80 border border-rose-500/50 p-1.5 rounded">
                {altitudeError}
              </div>
            )}

            {/* Clear Distinction: Relative Altitude (AGL) vs Absolute Altitude (MSL) */}
            <div className="grid grid-cols-2 gap-1.5 font-mono text-[9.5px]">
              <div className="bg-slate-900 p-1.5 rounded border border-slate-800">
                <span className="text-slate-500 block text-[8.5px]">RELATIVE ALTITUDE (AGL):</span>
                <span className="font-bold text-emerald-300 text-[11px]">{altitude.toFixed(1)}m AGL</span>
                <span className="text-[8px] text-slate-500 block">Relative to ground launch pad</span>
              </div>
              <div className="bg-slate-900 p-1.5 rounded border border-slate-800">
                <span className="text-slate-500 block text-[8.5px]">ABSOLUTE ALTITUDE (MSL):</span>
                <span className="font-bold text-sky-300 text-[11px]">
                  {((mavlinkService.getHomePoint().altitude || 0) + altitude).toFixed(1)}m MSL
                </span>
                <span className="text-[8px] text-slate-500 block">Home: {(mavlinkService.getHomePoint().altitude || 0).toFixed(1)}m MSL</span>
              </div>
            </div>

            {/* Optical Ground Parameters (Sony IMX477: 65° FOV) */}
            <div className="grid grid-cols-3 gap-1 text-center font-mono text-[9px] pt-1">
              <div className="bg-slate-900 p-1 rounded border border-slate-800">
                <span className="text-slate-500 block">SWATH (W)</span>
                <span className="font-bold text-sky-300">{opticalSwathWidth}m</span>
              </div>
              <div className="bg-slate-900 p-1 rounded border border-slate-800">
                <span className="text-slate-500 block">SPACING (S)</span>
                <span className="font-bold text-emerald-300">{laneSpacingMeters}m</span>
              </div>
              <div className="bg-slate-900 p-1 rounded border border-slate-800">
                <span className="text-slate-500 block">CAMERA FOV</span>
                <span className="font-bold text-amber-300">65° IMX477</span>
              </div>
            </div>
          </div>

          {/* ===================================================================== */}
          {/* STEP 4: WAYPOINT GENERATION & ROUTE PREVIEW (Section D)               */}
          {/* ===================================================================== */}
          {currentMission && currentMission.waypoints && currentMission.waypoints.length > 0 && (
            <div className="bg-[#161B22] p-2.5 rounded-lg border border-slate-800 space-y-2 font-mono">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-200 font-bold flex items-center gap-1.5">
                  <span className="text-emerald-400">4.</span> GENERATED ROUTE METRICS:
                </span>
                <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/50">
                  ✓ ALL WAYPOINTS INSIDE
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1 text-center text-[9.5px]">
                <div className="bg-slate-900 p-1.5 rounded border border-slate-800">
                  <span className="text-slate-500 block">WAYPOINTS:</span>
                  <span className="font-bold text-white text-xs">{currentMission.waypoints.length}</span>
                </div>
                <div className="bg-slate-900 p-1.5 rounded border border-slate-800">
                  <span className="text-slate-500 block">DISTANCE:</span>
                  <span className="font-bold text-sky-300 text-xs">{currentMission.totalDistance}m</span>
                </div>
                <div className="bg-slate-900 p-1.5 rounded border border-slate-800">
                  <span className="text-slate-500 block">EST. TIME:</span>
                  <span className="font-bold text-amber-300 text-xs">{currentMission.estimatedDuration}s</span>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* STEP 5: REAL PIXHAWK MAVLINK UPLOAD & ARM CONTROLS (Section E)        */}
          {/* ===================================================================== */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleUploadToPixhawk}
              disabled={isUploadingMission || !isBoundaryConfirmed || !currentMission?.waypoints?.length}
              className={`w-full py-2.5 px-3 rounded-lg font-mono font-bold text-[11px] uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer shadow-md ${isBoundaryConfirmed && currentMission?.waypoints?.length
                ? isMissionUploaded
                  ? 'bg-slate-800 border border-emerald-500 text-emerald-300'
                  : 'bg-sky-600 hover:bg-sky-500 text-white'
                : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
                }`}
            >
              {isUploadingMission ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>
                {isUploadingMission
                  ? 'TRANSMITTING TO PIXHAWK...'
                  : isMissionUploaded
                    ? '✓ MISSION UPLOADED & CONFIRMED (DISARMED)'
                    : '5. UPLOAD MISSION TO PIXHAWK'}
              </span>
            </button>

            {uploadStatusNotice && (
              <div className={`text-[10px] font-mono text-center p-1.5 rounded ${uploadStatusNotice.includes('✓')
                ? 'text-emerald-300 bg-emerald-950/50 border border-emerald-500/40'
                : 'text-amber-300 bg-amber-950/50 border border-amber-500/40'
                }`}>
                {uploadStatusNotice}
              </div>
            )}

            {/* Bench Testing Safety Advisory (Mandatory per prompt) */}
            <div className="bg-amber-950/40 border border-amber-500/40 p-2 rounded text-[9.5px] font-mono text-amber-300 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span className="leading-snug">
                BENCH SAFETY NOTICE: Remove all propellers prior to arming or bench mission tests. Non-hardware bench simulations are marked NOT HARDWARE VERIFIED.
              </span>
            </div>

            {/* Explicit Operator Arm & Start Button */}
            <button
              type="button"
              onClick={onOpenPreflightModal}
              disabled={!isBoundaryConfirmed || !isDroneInsideBoundary}
              className={`w-full py-3 px-3 rounded-lg font-mono font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer shadow-lg active:scale-98 ${isBoundaryConfirmed && isDroneInsideBoundary
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/60'
                : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                }`}
            >
              <Play className="w-4 h-4 fill-current" />
              <span>ARM & COMMENCE SEARCH</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: FLIGHT CONTROLLER & PRE-ARM PARAMETERS                              */}
      {/* ========================================================================= */}
      {activeDeckTab === 'FC_PARAMS' && (
        <div className="space-y-2 font-mono text-xs">
          <div className="text-slate-400 text-[10.5px] border-b border-slate-800 pb-1 flex justify-between items-center">
            <span>PIXHAWK FLIGHT CONTROLLER STATUS:</span>
            <span className={`font-bold ${isPrearmPassed ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isPrearmPassed ? 'READY TO ARM' : 'ARMING BLOCKED'}
            </span>
          </div>

          {/* Parameters Grid */}
          <div className="space-y-1.5">
            <div className="p-2 rounded bg-[#161B22] border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-sky-400" /> FC Telemetry Link:
              </span>
              <span className={`font-bold ${isFcConnected ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isFcConnected ? 'CONNECTED (TELEM2 @ 57600 baud)' : 'DISCONNECTED'}
              </span>
            </div>

            <div className="p-2 rounded bg-[#161B22] border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-sky-400" /> Autopilot & Firmware:
              </span>
              <span className="font-bold text-white">
                ArduPilot Copter v4.x (GUIDED mode)
              </span>
            </div>

            <div className="p-2 rounded bg-[#161B22] border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Satellite className="w-3.5 h-3.5 text-sky-400" /> GPS & Positioning:
              </span>
              <span className={`font-bold ${isGpsFixOk ? 'text-emerald-400' : 'text-amber-400'}`}>
                {telemetry.isGpsLocked ? `3D FIX (${telemetry.satellites} Sats, HDOP ${telemetry.hdop?.toFixed(1) || '1.1'})` : 'AWAITING 3D GPS FIX'}
              </span>
            </div>

            <div className="p-2 rounded bg-[#161B22] border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-sky-400" /> Compass Calibration:
              </span>
              <span className={`font-bold ${isCompassOk ? 'text-emerald-400' : 'text-amber-400'}`}>
                {isCompassOk ? 'CALIBRATED & HEALTHY' : 'CALIBRATION PENDING'}
              </span>
            </div>

            <div className="p-2 rounded bg-[#161B22] border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Battery className="w-3.5 h-3.5 text-sky-400" /> Battery & Power:
              </span>
              <span className={`font-bold ${isBatteryOk ? 'text-emerald-400' : 'text-rose-400'}`}>
                {telemetry.batteryVoltage ? `${telemetry.batteryVoltage.toFixed(1)}V (${telemetry.batteryPercent || 0}%)` : 'POWER OK'}
              </span>
            </div>

            <div className="p-2 rounded bg-[#161B22] border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-sky-400" /> Boundary Containment:
              </span>
              <span className={`font-bold ${isDroneInsideBoundary ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isDroneInsideBoundary ? 'DRONE INSIDE BOUNDARY' : 'OUTSIDE BOUNDARY'}
              </span>
            </div>
          </div>

          {/* Safety Parameters HUD */}
          <div className="p-2 rounded bg-slate-900 border border-slate-800 text-[10px] space-y-1">
            <span className="text-slate-400 font-bold block uppercase">SAFETY & FAILSAFE PARAMETERS:</span>
            <div className="grid grid-cols-3 gap-1 text-slate-300">
              <div>RTL ALT: <span className="text-white font-bold">15m AGL</span></div>
              <div>GEOFENCE: <span className="text-emerald-400 font-bold">RTL Action</span></div>
              <div>LOW BATT: <span className="text-amber-400 font-bold">10.5V</span></div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: TARGET QUEUE & RECON INTELLIGENCE                                  */}
      {/* ========================================================================= */}
      {activeDeckTab === 'TARGET_QUEUE' && (
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          <div className="flex items-center justify-between text-xs font-mono border-b border-slate-800 pb-1">
            <span className="text-slate-400">DETECTED OBJECTS ({objectQueue.length}):</span>
            <span className="text-[10px] text-emerald-400 font-bold">
              {targetLockState === 'TARGET_LOCKED' ? 'TARGET CONFIRMED' : 'CONTINUOUS CAMERA SCAN'}
            </span>
          </div>

          {objectQueue.length === 0 ? (
            <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 text-center text-xs font-mono text-slate-500">
              Awaiting camera sweep across boundary area...
            </div>
          ) : (
            objectQueue.map((obj) => (
              <div
                key={obj.object_id}
                className="p-2 rounded bg-[#161B22] border border-slate-800 flex items-center justify-between gap-2 font-mono text-xs"
              >
                <div className="flex items-center gap-2">
                  {obj.thumbnail ? (
                    <img src={obj.thumbnail} alt="Target" className="w-9 h-9 rounded object-cover border border-slate-700 shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded bg-slate-900 border border-slate-800 flex items-center justify-center text-[10px] text-slate-500 font-bold shrink-0">
                      BOX
                    </div>
                  )}
                  <div>
                    <div className="font-bold text-white text-[11px]">{obj.object_id}</div>
                    <span className="text-[9.5px] text-slate-400 block">
                      {obj.lat && obj.lon ? `${obj.lat.toFixed(5)}°, ${obj.lon.toFixed(5)}°` : 'Triangulating...'}
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  {obj.two_digit_code ? (
                    <div className="bg-emerald-950 border border-emerald-500 px-2 py-0.5 rounded text-emerald-300 font-black text-xs">
                      #{obj.two_digit_code}
                    </div>
                  ) : (
                    <span className="text-[9.5px] text-amber-400 font-bold bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-500/40">
                      {obj.status}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}

          {onOpenPhoneMission && (
            <button
              type="button"
              onClick={onOpenPhoneMission}
              className="w-full py-1.5 px-3 rounded bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-300 font-mono text-[10px] font-bold flex items-center justify-center gap-1.5 cursor-pointer mt-1"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>EXPAND OPTICAL RECON INTELLIGENCE</span>
            </button>
          )}
        </div>
      )}

      {/* Emergency RTL Button */}
      <div className="pt-1 border-t border-slate-800">
        <button
          type="button"
          onClick={onEmergencyRTL}
          className={`w-full py-2 px-3 rounded-lg font-bold text-[11px] font-mono flex items-center justify-center gap-2 transition cursor-pointer ${rtlConfirmPending
            ? 'bg-red-600 text-white border-2 border-white animate-pulse'
            : 'bg-rose-950/50 border border-rose-500/50 text-rose-300 hover:bg-rose-900/60'
            }`}
          title="Emergency Return To Launch (Click once to prime, click 2nd time to execute)"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${rtlConfirmPending ? 'animate-spin' : ''}`} />
          <span>{rtlConfirmPending ? '⚠️ CONFIRM RTL NOW (CLICK AGAIN)' : 'EMERGENCY RTL'}</span>
        </button>
      </div>
    </Card>
  );
};
