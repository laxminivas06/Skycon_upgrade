import React, { useState, useEffect, useRef } from 'react';
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
  Maximize2
} from 'lucide-react';
import { Card } from '../../ui/Card';
import {
  groundStationMissionService,
  calculateHaversineDistance
} from '../../services/groundStationMissionService';
import { mavlinkService } from '../../services/mavlinkService';
import { missionEngine } from '../../services/missionEngine';
import { audioService } from '../../services/audioService';
import { geofenceService } from '../../services/geofenceService';
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
  // 1. BOUNDARY CONFIGURATION (User must manually define & confirm)
  // =========================================================================
  const [boundaryType, setBoundaryType] = useState<'SQUARE' | 'RECTANGLE' | 'CIRCLE' | 'POLYGON'>('RECTANGLE');
  const [rectWidth, setRectWidth] = useState<number>(30);
  const [rectHeight, setRectHeight] = useState<number>(20);
  const [circleRadius, setCircleRadius] = useState<number>(15);
  const [isBoundaryConfirmed, setIsBoundaryConfirmed] = useState<boolean>(false);
  const [boundaryConfirmedNotice, setBoundaryConfirmedNotice] = useState<string | null>(null);

  // =========================================================================
  // 2. SEARCH PATTERN SELECTION (User must manually select & confirm)
  // =========================================================================
  const [selectedPattern, setSelectedPattern] = useState<AutonomousSearchPattern | null>(null);
  const [isPatternConfirmed, setIsPatternConfirmed] = useState<boolean>(false);

  // Search Altitude (Envelope: 2m-50m, default 5m)
  const [altitude, setAltitude] = useState<number>(5);

  // =========================================================================
  // 3. FLIGHT CONTROLLER CONFIGURATION (Non-waypoint direct trajectory & guided mode)
  // =========================================================================
  const [isFcConfiguring, setIsFcConfiguring] = useState<boolean>(false);
  const [isFcConfigured, setIsFcConfigured] = useState<boolean>(false);
  const [fcConfigNotice, setFcConfigNotice] = useState<string | null>(null);

  // =========================================================================
  // 4. FOUR-MINUTE TARGET SEARCH TIMER (240s window)
  // =========================================================================
  const SEARCH_WINDOW_LIMIT_SEC = 240; // Exactly 4 minutes
  const [searchTimerActive, setSearchTimerActive] = useState<boolean>(false);
  const [searchSecondsRemaining, setSearchSecondsRemaining] = useState<number>(SEARCH_WINDOW_LIMIT_SEC);
  const [searchSecondsElapsed, setSearchSecondsElapsed] = useState<number>(0);
  const [isSearchTimedOut, setIsSearchTimedOut] = useState<boolean>(false);

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

  // Optical Geometry & Reconnaissance Ground Parameters
  // Camera FOV = 65° total horizontal FOV. Ground swath W = 2 * h * tan(32.5°)
  const opticalSwathWidth = Math.round(2 * altitude * Math.tan((32.5 * Math.PI) / 180) * 100) / 100;
  const laneSpacingMeters = Math.round(opticalSwathWidth * 0.75 * 100) / 100;

  // Calculated Boundary Metrics
  const boundaryArea = boundaryType === 'CIRCLE'
    ? Math.round(Math.PI * circleRadius * circleRadius)
    : boundaryType === 'SQUARE'
    ? Math.round(rectWidth * rectWidth)
    : Math.round(rectWidth * rectHeight);

  const boundaryPerimeter = boundaryType === 'CIRCLE'
    ? Math.round(2 * Math.PI * circleRadius)
    : boundaryType === 'SQUARE'
    ? Math.round(rectWidth * 4)
    : Math.round((rectWidth + rectHeight) * 2);

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
  // MANUAL BOUNDARY CONFIRMATION HANDLER
  // =========================================================================
  const handleConfirmBoundary = () => {
    const center = getSearchCenter();
    const home: HomePoint = mavlinkService.getHomePoint().isSet
      ? mavlinkService.getHomePoint()
      : { latitude: center.lat, longitude: center.lng, altitude: 0, timestamp: Date.now(), isSet: true };

    const rad = boundaryType === 'CIRCLE' ? circleRadius : Math.max(rectWidth, rectHeight) / 2.0;
    const dims = { width: rectWidth, height: rectHeight };

    // Register search boundary area
    groundStationMissionService.generateAutonomousSearchMission(
      center,
      rad,
      selectedPattern || 'BOUSTROPHEDON',
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
        areaSquareMeters: boundaryArea,
        label: `${boundaryType} Search Boundary`
      },
      searchAlgorithm: (selectedPattern || 'BOUSTROPHEDON') as SearchAlgorithmType
    });

    setIsBoundaryConfirmed(true);
    setBoundaryConfirmedNotice(`✓ Search Boundary Confirmed: ${boundaryArea} m² (${boundaryType})`);
    audioService.playBeep(920, 80);
    setTimeout(() => setBoundaryConfirmedNotice(null), 4000);
  };

  // =========================================================================
  // MANUAL PATTERN SELECTION HANDLER
  // =========================================================================
  const handleSelectPattern = (pattern: AutonomousSearchPattern) => {
    setSelectedPattern(pattern);
    setIsPatternConfirmed(true);
    audioService.playBeep(880, 60);

    // If boundary already confirmed, recompute trajectory
    if (isBoundaryConfirmed) {
      const center = getSearchCenter();
      const home: HomePoint = mavlinkService.getHomePoint().isSet
        ? mavlinkService.getHomePoint()
        : { latitude: center.lat, longitude: center.lng, altitude: 0, timestamp: Date.now(), isSet: true };

      const rad = boundaryType === 'CIRCLE' ? circleRadius : Math.max(rectWidth, rectHeight) / 2.0;
      const dims = { width: rectWidth, height: rectHeight };

      groundStationMissionService.generateAutonomousSearchMission(
        center,
        rad,
        pattern,
        home,
        altitude,
        4.0,
        4.0,
        dims
      );
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
  // FOUR-MINUTE TARGET SEARCH TIMER & CONTINUOUS TARGET VALIDATION LIFECYCLE
  // =========================================================================
  const isMissionActive = Boolean(
    activeMissionTime?.isExecuting ||
    (telemetry.isArmed && telemetry.altitudeMeters > 1.0)
  );

  useEffect(() => {
    let timer: any = null;

    if (isMissionActive && isBoundaryConfirmed && isPatternConfirmed) {
      setSearchTimerActive(true);

      timer = setInterval(() => {
        setSearchSecondsRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setIsSearchTimedOut(true);
            setTargetLockState('TIMEOUT');
            audioService.playTimeoutWarning();
            // Trigger emergency safe abort/RTL upon 4-minute expiration
            mavlinkService.setFlightMode('RTL');
            return 0;
          }
          return prev - 1;
        });

        setSearchSecondsElapsed((prev) => prev + 1);
      }, 1000);
    } else if (!isMissionActive) {
      setSearchTimerActive(false);
      if (timer) clearInterval(timer);
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
  // 10-STEP MISSION PROGRESSION COMPUTATION
  // =========================================================================
  const getMissionStep = (): { step: number; name: string; label: string; passed: boolean } => {
    if (telemetry.flightMode === 'RTL' || activeMissionTime?.status === 'RTL') {
      return { step: 10, name: 'RTL', label: '10. RTL (Return to Launch)', passed: true };
    }
    if (targetLockState === 'TARGET_LOCKED' && (lockedTargetCode || isSearchTimedOut)) {
      return { step: 9, name: 'MISSION_COMPLETION', label: '9. Mission Completion', passed: true };
    }
    if (targetLockState === 'TARGET_LOCKED') {
      return { step: 8, name: 'TARGET_LOCKED', label: '8. Target Locked', passed: true };
    }
    if (targetLockState === 'CANDIDATE_DETECTED') {
      return { step: 7, name: 'TARGET_DETECTION', label: '7. Target Detection', passed: true };
    }
    if (isMissionActive && searchTimerActive) {
      return { step: 6, name: 'SEARCH_ACTIVE', label: '6. Search Active', passed: true };
    }
    if (telemetry.isArmed) {
      return { step: 5, name: 'ARMED', label: '5. Armed', passed: true };
    }
    if (isPrearmPassed) {
      return { step: 4, name: 'PRE_ARM_CHECKS', label: '4. Pre-Arm Checks', passed: true };
    }
    if (isFcConfigured) {
      return { step: 3, name: 'FC_CONFIGURED', label: '3. Flight Controller Configured', passed: true };
    }
    if (isPatternConfirmed && selectedPattern) {
      return { step: 2, name: 'PATTERN_SELECTED', label: '2. Search Pattern Selected', passed: true };
    }
    if (isBoundaryConfirmed) {
      return { step: 1, name: 'BOUNDARY_DEFINED', label: '1. Boundary Defined', passed: true };
    }
    return { step: 0, name: 'UNCONFIGURED', label: '0. Boundary Not Defined', passed: false };
  };

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

  const currentStep = getMissionStep();

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
              className={`px-2 py-0.5 rounded font-bold transition cursor-pointer ${
                activeDeckTab === 'MISSION' ? 'bg-[#10B981] text-emerald-950 font-extrabold' : 'text-slate-400 hover:text-white'
              }`}
            >
              MISSION
            </button>
            <button
              type="button"
              onClick={() => setActiveDeckTab('FC_PARAMS')}
              className={`px-2 py-0.5 rounded font-bold transition cursor-pointer flex items-center gap-1 ${
                activeDeckTab === 'FC_PARAMS' ? 'bg-[#10B981] text-emerald-950 font-extrabold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>FC STATUS</span>
              <span className={`w-2 h-2 rounded-full ${isPrearmPassed ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            </button>
            <button
              type="button"
              onClick={() => setActiveDeckTab('TARGET_QUEUE')}
              className={`px-2 py-0.5 rounded font-bold transition cursor-pointer flex items-center gap-1 ${
                activeDeckTab === 'TARGET_QUEUE' ? 'bg-[#10B981] text-emerald-950 font-extrabold' : 'text-slate-400 hover:text-white'
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
      {/* 10-STAGE MISSION PROGRESSION STATUS BAR                                    */}
      {/* ========================================================================= */}
      <div className="bg-[#121820] p-2.5 rounded-lg border border-slate-800 space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-mono">
          <span className="text-slate-400 uppercase font-bold flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>MISSION PROGRESSION:</span>
          </span>
          <span className={`font-black px-2 py-0.5 rounded border text-[10.5px] ${
            currentStep.step >= 6
              ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/60'
              : currentStep.step > 0
              ? 'bg-sky-950/90 text-sky-300 border-sky-500/60'
              : 'bg-amber-950/90 text-amber-300 border-amber-500/60'
          }`}>
            STAGE {currentStep.step}/10: {currentStep.label}
          </span>
        </div>

        {/* 10-Step Progress Dots */}
        <div className="grid grid-cols-10 gap-1 h-1.5 w-full">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => (
            <div
              key={s}
              title={`Stage ${s}`}
              className={`rounded-full transition-all ${
                s <= currentStep.step
                  ? s === currentStep.step
                    ? 'bg-emerald-400 shadow-sm shadow-emerald-400 animate-pulse'
                    : 'bg-emerald-600'
                  : 'bg-slate-800'
              }`}
            />
          ))}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* FOUR-MINUTE TARGET SEARCH TIMER & REAL-TIME SEARCH STATUS                 */}
      {/* ========================================================================= */}
      <div className={`p-2.5 rounded-lg border flex items-center justify-between gap-3 font-mono ${
        isSearchTimedOut
          ? 'bg-rose-950/70 border-rose-500 text-rose-200'
          : targetLockState === 'TARGET_LOCKED'
          ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200'
          : searchTimerActive
          ? 'bg-sky-950/60 border-sky-500/60 text-sky-200'
          : 'bg-[#121820] border-slate-800 text-slate-300'
      }`}>
        <div className="flex items-center gap-2">
          <Clock className={`w-5 h-5 shrink-0 ${searchTimerActive ? 'animate-spin text-sky-400' : 'text-slate-500'}`} />
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-bold leading-tight">
              4-MINUTE SEARCH WINDOW
            </div>
            <div className="text-lg font-black tracking-wider text-white">
              {formatSeconds(searchSecondsRemaining)}
              <span className="text-xs text-slate-400 font-normal ml-1">/ 04:00</span>
            </div>
          </div>
        </div>

        {/* Target Status Indicator */}
        <div className="text-right">
          <span className="text-[9px] text-slate-400 block uppercase font-bold">TARGET STATUS</span>
          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black border uppercase ${
            targetLockState === 'TARGET_LOCKED'
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
              ? `LOCKED: #${lockedTargetCode || '42'}`
              : targetLockState.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: MISSION & SEARCH PATTERN CONFIGURATION                             */}
      {/* ========================================================================= */}
      {activeDeckTab === 'MISSION' && (
        <div className="space-y-2.5">
          {/* A. BOUNDARY DEFINITION (Manual user action required) */}
          <div className="bg-[#161B22] p-2.5 rounded-lg border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-200 font-bold flex items-center gap-1.5">
                <span className="text-emerald-400">1.</span> DEFINE SEARCH BOUNDARY:
              </span>
              <span className={`text-[9.5px] font-bold px-2 py-0.5 rounded border ${
                isBoundaryConfirmed
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-500/50'
                  : 'bg-amber-950 text-amber-300 border-amber-500/50'
              }`}>
                {isBoundaryConfirmed ? '✓ CONFIRMED' : 'MANUAL DEFINITION REQUIRED'}
              </span>
            </div>

            {/* Shape Selector */}
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { id: 'RECTANGLE' as const, label: 'Rectangle', icon: '▬' },
                { id: 'SQUARE' as const, label: 'Square', icon: '■' },
                { id: 'CIRCLE' as const, label: 'Circle', icon: '●' },
                { id: 'POLYGON' as const, label: 'Custom', icon: '⬢' },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setBoundaryType(s.id);
                    setIsBoundaryConfirmed(false);
                  }}
                  className={`py-1.5 px-1 rounded text-[10px] font-mono font-bold flex items-center justify-center gap-1 transition cursor-pointer border ${
                    boundaryType === s.id
                      ? 'bg-emerald-600 text-white border-emerald-400 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span>{s.icon}</span>
                  <span>{s.label}</span>
                </button>
              ))}
            </div>

            {/* Dimensional Adjustments */}
            {boundaryType === 'CIRCLE' ? (
              <div className="pt-1 space-y-1 font-mono text-[11px]">
                <div className="flex justify-between text-slate-400">
                  <span>Radius:</span>
                  <span className="font-bold text-white">{circleRadius}m ({boundaryArea} m²)</span>
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
                  }}
                  className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
                />
              </div>
            ) : (
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
                    }}
                    className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
                  />
                </div>
                {boundaryType === 'RECTANGLE' && (
                  <div>
                    <span className="text-slate-400 block text-[10px]">HEIGHT: {rectHeight}m</span>
                    <input
                      type="range"
                      min={10}
                      max={80}
                      step={2}
                      value={rectHeight}
                      onChange={(e) => {
                        setRectHeight(Number(e.target.value));
                        setIsBoundaryConfirmed(false);
                      }}
                      className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Confirm Boundary Button */}
            <button
              type="button"
              onClick={handleConfirmBoundary}
              className={`w-full py-1.5 px-3 rounded font-mono font-bold text-[10.5px] flex items-center justify-center gap-1.5 transition cursor-pointer shadow-sm ${
                isBoundaryConfirmed
                  ? 'bg-slate-800 text-emerald-400 border border-emerald-500/40'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400'
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isBoundaryConfirmed ? '✓ BOUNDARY CONFIRMED' : 'CONFIRM SEARCH BOUNDARY'}</span>
            </button>
            {boundaryConfirmedNotice && (
              <div className="text-[10px] font-mono text-emerald-300 text-center animate-fade-in">
                {boundaryConfirmedNotice}
              </div>
            )}
          </div>

          {/* B. SEARCH PATTERN SELECTION (User must manually select) */}
          <div className="bg-[#161B22] p-2.5 rounded-lg border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-200 font-bold flex items-center gap-1.5">
                <span className="text-emerald-400">2.</span> SELECT SEARCH PATTERN:
              </span>
              <span className={`text-[9.5px] font-bold px-2 py-0.5 rounded border ${
                isPatternConfirmed && selectedPattern
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-500/50'
                  : 'bg-amber-950 text-amber-300 border-amber-500/50'
              }`}>
                {selectedPattern ? selectedPattern.replace('_', ' ') : 'NO PATTERN SELECTED'}
              </span>
            </div>

            {/* Pattern Selection Grid */}
            <div className="grid grid-cols-2 gap-1.5 font-mono">
              {[
                { id: 'BOUSTROPHEDON' as const, label: 'Lawnmower (Grid)', desc: 'Parallel lanes (100% swath coverage)' },
                { id: 'EXPANDING_SPIRAL' as const, label: 'Expanding Spiral', desc: 'Center outward Archimedean sweep' },
                { id: 'INWARD_SPIRAL' as const, label: 'Inward Spiral', desc: 'Perimeter inward Archimedean sweep' },
                { id: 'PERIMETER' as const, label: 'Perimeter Search', desc: 'Boundary perimeter tracking sweep' }
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectPattern(p.id)}
                  className={`p-2 rounded text-left transition cursor-pointer border ${
                    selectedPattern === p.id
                      ? 'bg-emerald-600/90 text-white border-emerald-400 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <div className="text-[10.5px] font-bold leading-tight">{p.label}</div>
                  <div className="text-[9px] opacity-75 mt-0.5">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* C. CRUISE ALTITUDE & OPTICAL GROUND PARAMETERS */}
          <div className="bg-[#161B22] p-2.5 rounded-lg border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300 font-bold">CRUISING ALTITUDE:</span>
              <span className="font-bold text-white bg-slate-900 px-2 py-0.5 rounded border border-slate-700 text-[11px]">
                {altitude}m AGL
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {[3, 5, 8, 10].map((alt) => (
                <button
                  key={alt}
                  type="button"
                  onClick={() => setAltitude(alt)}
                  className={`flex-1 py-1 rounded text-[10.5px] font-mono font-bold transition cursor-pointer border ${
                    altitude === alt
                      ? 'bg-emerald-600 text-white border-emerald-400 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {alt}m {alt === 5 ? '(Default)' : ''}
                </button>
              ))}
            </div>

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
                <span className="text-slate-500 block">TIME LIMIT</span>
                <span className="font-bold text-amber-300">4m 00s (240s)</span>
              </div>
            </div>
          </div>

          {/* D. FLIGHT CONTROLLER CONFIGURATION BUTTON */}
          <div className="space-y-1">
            <button
              type="button"
              onClick={handleConfigureFlightController}
              disabled={isFcConfiguring || !isBoundaryConfirmed || !selectedPattern}
              className={`w-full py-2.5 px-3 rounded-lg font-mono font-bold text-[11px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition cursor-pointer shadow-md ${
                isBoundaryConfirmed && selectedPattern
                  ? isFcConfigured
                    ? 'bg-slate-800 border border-emerald-500/50 text-emerald-300'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
              }`}
            >
              <Cpu className={`w-3.5 h-3.5 ${isFcConfiguring ? 'animate-spin' : ''}`} />
              <span>
                {isFcConfiguring
                  ? 'CONFIGURING PIXHAWK...'
                  : isFcConfigured
                  ? '✓ FLIGHT CONTROLLER CONFIGURED'
                  : '3. CONFIGURE FLIGHT CONTROLLER'}
              </span>
            </button>
            {fcConfigNotice && (
              <div className="text-[10px] font-mono text-center text-sky-300 px-1">
                {fcConfigNotice}
              </div>
            )}
          </div>

          {/* E. START AUTONOMOUS MISSION BUTTON */}
          <button
            type="button"
            onClick={onOpenPreflightModal}
            disabled={!isBoundaryConfirmed || !selectedPattern || !isDroneInsideBoundary}
            className={`w-full py-3 px-3 rounded-lg font-mono font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer shadow-lg active:scale-98 ${
              isBoundaryConfirmed && selectedPattern && isDroneInsideBoundary
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/60'
                : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
            }`}
          >
            <Play className="w-4 h-4 fill-current" />
            <span>START 4-MINUTE AUTONOMOUS SEARCH</span>
          </button>
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
          className={`w-full py-2 px-3 rounded-lg font-bold text-[11px] font-mono flex items-center justify-center gap-2 transition cursor-pointer ${
            rtlConfirmPending
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
