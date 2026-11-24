import React, { useState, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  X,
  ArrowUp,
  ArrowDown,
  Pause,
  Crosshair,
  Send,
  Calendar,
  Power,
  RotateCcw,
  Octagon,
  Home,
  PlaneLanding,
  Gamepad2,
  Clock,
  Radio
} from 'lucide-react';
import { useDashboardTelemetry } from '../../hooks/useDashboardTelemetry';
import { mavlinkService } from '../../services/mavlinkService';
import { missionEngine } from '../../services/missionEngine';
import { groundStationMissionService, computeDestination } from '../../services/groundStationMissionService';
import { runnerCommService } from '../../services/runnerCommService';
import { audioService } from '../../services/audioService';
import { geofenceService } from '../../services/geofenceService';
import { reconDetectionService } from '../../services/reconDetectionService';
import { targetDetectionEngine } from '../../services/targetDetectionEngine';
import { visionHeatmapService } from '../../services/visionHeatmapService';
import { phoneDroneMissionService } from '../../services/phoneDroneMissionService';
import { fetchWithFallback } from '../../services/apiClient';
import { Header } from './Header';
import { TelemetryPanel } from './TelemetryPanel';
import { FlightOperationsCard } from './FlightOperationsCard';
import { ManualMissionControlCard } from './ManualMissionControlCard';
import { AutonomousMissionControlCard } from './AutonomousMissionControlCard';
import { PreflightValidationModal } from './PreflightValidationModal';
import { AIChatPanel } from './AIChatPanel';
import { MapPanel } from './MapPanel';
import { QrVisionTelemetryCard } from './QrVisionTelemetryCard';
import { GeofencePanel } from './GeofencePanel';
import { WaypointManager } from './WaypointManager';
import { FlightParams } from './FlightParams';
import { AutonomousMissionConfigModal } from '../../components/Mission/AutonomousMissionConfigModal';
import { MissionHistoryModal } from '../../components/History/MissionHistoryModal';
import { SerialDiagnosticsModal } from '../../components/Drone/SerialDiagnosticsModal';
import { ComprehensiveDiagnosticDashboard } from '../../components/Drone/ComprehensiveDiagnosticDashboard';
import { UnifiedCameraIntelligenceModal } from '../../components/Mission/UnifiedCameraIntelligenceModal';
import { FlightModeSelector } from '../../components/common/FlightModeSelector';
import { SimpleConnectionIndicators } from '../../components/common/SimpleConnectionIndicators';
import { GlobalErrorHUD } from '../../components/common/GlobalErrorHUD';
import { systemAlertService } from '../../services/systemAlertService';
import { gcsConnectionService } from '../../services/gcsConnectionService';
import { AppRole } from '../../types/mission';

interface DashboardPageProps {
  onLogout?: () => void;
  currentRole?: AppRole;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onLogout,
  currentRole = 'GROUND_STATION',
}) => {
  const telemetry = useDashboardTelemetry();
  // Section 3: Two Primary Mission Modes (MANUAL and AUTONOMOUS)
  const [missionMode, setMissionMode] = useState<'MANUAL' | 'AUTONOMOUS'>(
    () => (localStorage.getItem('sae_gcs_mission_mode') as 'MANUAL' | 'AUTONOMOUS') || 'AUTONOMOUS'
  );
  const [autonomyLock, setAutonomyLock] = useState<boolean>(() => {
    return typeof window !== 'undefined' && localStorage.getItem('sae_autonomy_lock') === 'true';
  });

  const handleToggleAutonomyLock = () => {
    const next = !autonomyLock;
    setAutonomyLock(next);
    try {
      localStorage.setItem('sae_autonomy_lock', String(next));
    } catch {}
    audioService.playBeep(next ? 950 : 500, 80);
    showNotification(
      next
        ? '🔒 AUTONOMY LOCK ACTIVE (ADDC Rule 3.3.1): Manual map clicks and mode switches locked.'
        : '🔓 AUTONOMY LOCK RELEASED: Manual control unlocked.'
    );
  };
  const [activeTab, setActiveTab] = useState<'Plan' | 'Fly' | 'Logs'>('Fly');
  const [activeNav, setActiveNav] = useState<string>('Dashboard');
  const [mobileView, setMobileView] = useState<'telemetry' | 'map' | 'operations'>('map');
  const [showPreflightModal, setShowPreflightModal] = useState<boolean>(false);
  const [showRtlModal, setShowRtlModal] = useState<boolean>(false);
  const [showPhoneMissionModal, setShowPhoneMissionModal] = useState<boolean>(false);
  const [rtlConfirmPending, setRtlConfirmPending] = useState<boolean>(false);
  const [landConfirmPending, setLandConfirmPending] = useState<boolean>(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Synchronized active mission state (survives page refresh via localStorage & backend /api/missions/active)
  const [activeMissionData, setActiveMissionData] = useState<{
    elapsedSeconds: number;
    remainingSeconds: number;
    status: string;
    deadline?: number;
    startTime?: number;
    isExecuting: boolean;
  } | null>(() => {
    try {
      const stored = localStorage.getItem('sae_active_mission_data');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.startTime) {
          const elapsed = Math.floor((Date.now() - parsed.startTime) / 1000);
          const remaining = parsed.deadline ? Math.max(0, Math.floor((parsed.deadline - Date.now()) / 1000)) : 0;
          return {
            ...parsed,
            elapsedSeconds: elapsed,
            remainingSeconds: remaining,
            isExecuting: parsed.status === 'EXECUTING' && remaining > 0,
          };
        }
      }
    } catch {}
    return null;
  });

  const updateActiveMissionData = (data: any) => {
    setActiveMissionData(data);
    try {
      if (data) {
        localStorage.setItem('sae_active_mission_data', JSON.stringify(data));
      } else {
        localStorage.removeItem('sae_active_mission_data');
      }
    } catch {}
  };

  const [rtlTimerRef] = useState(() => ({ current: null as ReturnType<typeof setTimeout> | null }));
  const [landTimerRef] = useState(() => ({ current: null as ReturnType<typeof setTimeout> | null }));
  const userSelectedModeRef = useRef<boolean>(false);
  const initialSyncDoneRef = useRef<boolean>(false);

  // Poll backend for active mission to survive GCS browser refreshes with adaptive backoff
  useEffect(() => {
    let isMounted = true;
    let missionTimer: any = null;

    const fetchActiveMission = async () => {
      let nextDelay = 3500;
      try {
        const res = await fetchWithFallback('/api/missions/active');
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.success && data.active && data.mission) {
            setActiveMissionData({
              elapsedSeconds: data.mission.elapsedSeconds || 0,
              remainingSeconds: data.mission.remainingSeconds || 0,
              status: data.mission.status || 'EXECUTING',
              deadline: data.mission.deadline,
              isExecuting: data.mission.status === 'EXECUTING',
            });
            // Only synchronize mission mode on initial mount if operator hasn't explicitly selected one
            if (!initialSyncDoneRef.current && !userSelectedModeRef.current) {
              initialSyncDoneRef.current = true;
              if (data.mission.status === 'EXECUTING' && (data.mission.mode === 'AUTONOMOUS' || data.mission.mode === 'MANUAL')) {
                setMissionMode(data.mission.mode);
                localStorage.setItem('sae_gcs_mission_mode', data.mission.mode);
              }
            }
          } else if (isMounted && !data.active) {
            setActiveMissionData(null);
            initialSyncDoneRef.current = true;
          }
          nextDelay = 3000;
        } else {
          // If Netlify/Render returns 502/down, back off to 8000ms instead of spamming
          nextDelay = 8000;
        }
      } catch (e) {
        nextDelay = 8000;
      }
      if (isMounted) {
        missionTimer = setTimeout(fetchActiveMission, nextDelay);
      }
    };

    missionTimer = setTimeout(fetchActiveMission, 1800);

    return () => {
      isMounted = false;
      if (missionTimer) clearTimeout(missionTimer);
    };
  }, []);

  // Modals & Overlays (Streamlined essential cockpit modals)
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  const [isDiagnosticsModalOpen, setIsDiagnosticsModalOpen] = useState<boolean>(false);
  const [isComprehensiveDiagOpen, setIsComprehensiveDiagOpen] = useState<boolean>(false);
  const [isFlightControlModalOpen, setIsFlightControlModalOpen] = useState<boolean>(false);
  const [isAIChatModalOpen, setIsAIChatModalOpen] = useState<boolean>(false);

  // Live Optical Recon Detections Count
  const [confirmedQRs, setConfirmedQRs] = useState<number>(0);
  const [detectedBoxes, setDetectedBoxes] = useState<number>(0);

  // Wi-Fi Status derived directly from verified connection service (never fake online)
  const [wifiStatus, setWifiStatus] = useState<string>(() => gcsConnectionService.getState().wifiStatus);

  // Official 5-minute Mission Window countdown (persists across refresh)
  const [missionWindowSeconds, setMissionWindowSeconds] = useState<number>(300);
  const [isMissionWindowExpired, setIsMissionWindowExpired] = useState<boolean>(false);
  const [isMissionWindowActive, setIsMissionWindowActive] = useState<boolean>(false);

  useEffect(() => {
    const unsubWifi = gcsConnectionService.subscribe((st) => setWifiStatus(st.wifiStatus));

    const checkTimer = () => {
      try {
        const endTs = parseInt(
          localStorage.getItem('sae_mission_window_end') ||
          localStorage.getItem('sae_search_timer_end') ||
          '0',
          10
        );
        const isActive =
          localStorage.getItem('sae_mission_window_active') === 'true' ||
          localStorage.getItem('sae_search_timer_active') === 'true';

        if (endTs > 0) {
          const rem = Math.max(0, Math.floor((endTs - Date.now()) / 1000));
          setMissionWindowSeconds(rem);
          setIsMissionWindowExpired(rem === 0);
          setIsMissionWindowActive(rem > 0 && isActive);
        } else {
          setMissionWindowSeconds(300);
          setIsMissionWindowExpired(false);
          setIsMissionWindowActive(false);
        }
      } catch {
        setMissionWindowSeconds(300);
      }
    };

    checkTimer();
    const interval = setInterval(checkTimer, 1000);

    return () => {
      unsubWifi();
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const unsubDetections = reconDetectionService.subscribeDetections((records) => {
      setConfirmedQRs(records.filter((r) => r.twoDigitCode && /^\d{2}$/.test(r.twoDigitCode)).length);
    });
    const unsubObjects = visionHeatmapService.subscribeObjects((objs) => {
      setDetectedBoxes(objs.filter((o) => o.category === 'BOX_STRUCTURE' || o.priority === 2).length);
    });
    return () => {
      unsubDetections();
      unsubObjects();
    };
  }, []);

  const showNotification = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 4000);
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as any);
    audioService.playBeep(700, 50);

    if (tab === 'Logs') {
      setActiveNav('Logs');
      showNotification('Flight Logs & MAVLink Telemetry Deck active');
    } else if (tab === 'Plan') {
      showNotification('Plan Mode Active: Define waypoints, search patterns, and geofence.');
    } else if (tab === 'Fly') {
      setActiveNav('Dashboard');
    }
  };

  const handleNavChange = (nav: string) => {
    setActiveNav(nav);
    audioService.playBeep(650, 40);

    if (nav === 'Mission' || nav === 'Mission Plan') {
      setIsConfigModalOpen(true);
    } else if (nav === 'Diagnostics' || nav === 'Telemetry') {
      setIsComprehensiveDiagOpen(true);
    } else if (nav === 'Logs' || nav === 'Flight Logs') {
      setActiveTab('Logs');
    } else if (nav === 'Flight Control') {
      setIsFlightControlModalOpen(true);
    } else if (nav === 'AI Assistant') {
      setIsAIChatModalOpen(true);
    } else if (nav === 'Dashboard' || nav === 'Cockpit') {
      setActiveTab('Fly');
      setActiveNav('Dashboard');
    }
  };

  const handleToggleRC = () => {
    const nextState = mavlinkService.toggleRCOverride();
    audioService.playBeep(nextState ? 950 : 520, 90);
    showNotification(
      nextState
        ? '🎮 RC MANUAL CONTROL OVERRIDE: ON (Handheld Transmitter in Command)'
        : '🤖 RC OVERRIDE: OFF (Autonomous GCS Navigation Active)'
    );
  };

  // Safe Mission Workflow Reset (Requirement 3 & 4)
  const handleResetMissionWorkflow = async () => {
    try {
      localStorage.removeItem('sae_active_mission_data');
      localStorage.removeItem('sae_search_timer_active');
      localStorage.removeItem('sae_search_timer_start');
      localStorage.removeItem('sae_search_timer_end');
      localStorage.removeItem('sae_mission_window_start');
      localStorage.removeItem('sae_mission_window_end');
      localStorage.removeItem('sae_mission_window_active');
      localStorage.removeItem('sae_boundary_confirmed');
      localStorage.removeItem('sae_pattern_confirmed');
      localStorage.removeItem('sae_fc_configured');
      localStorage.removeItem('sae_autonomy_lock');
      localStorage.removeItem('sae_mission_altitude');
      localStorage.removeItem('sae_circle_radius');
      localStorage.removeItem('sae_circle_center');
      localStorage.removeItem('sae_search_algorithm');
      localStorage.removeItem('sae_geofence_coords');
      localStorage.removeItem('sae_drawn_polygon');
      localStorage.removeItem('sae_custom_waypoints');
      localStorage.removeItem('sae_last_mission_id');
      localStorage.removeItem('sae_mission_time_limit');
      localStorage.removeItem('sae_search_speed');
      localStorage.removeItem('drone_last_two_digit_code');
      localStorage.removeItem('runner_last_checkpoint_code');
      localStorage.removeItem('SAE_P2P_SYNC_PACKET');
      localStorage.removeItem('sae_detected_box_count');
      localStorage.removeItem('sae_confirmed_qr_count');
    } catch {}

    setMissionWindowSeconds(300);
    setIsMissionWindowExpired(false);
    setIsMissionWindowActive(false);

    updateActiveMissionData(null);
    setAutonomyLock(false);

    try {
      runnerCommService.reset();
    } catch {}

    try {
      await groundStationMissionService.deleteMission();
    } catch {}

    try {
      geofenceService.clearGeofence();
    } catch {}

    try {
      reconDetectionService.clearAllDetections();
      reconDetectionService.resetRtlState();
    } catch {}

    try {
      targetDetectionEngine.clearCapturedImages();
    } catch {}

    try {
      missionEngine.resetMission();
    } catch {}

    try {
      phoneDroneMissionService.reset();
    } catch {}

    // Complete backend reset of session, waypoints, detections, and multiplexer cache (Requirement 4 & 8)
    try {
      await fetchWithFallback('/api/mission/reset-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {}

    try {
      await fetchWithFallback('/api/recon/detections', {
        method: 'DELETE',
      });
    } catch {}

    try {
      fetchWithFallback('/api/missions/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'RESET', isExecuting: false })
      }).catch(() => {});
    } catch {}

    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sae:mission_reset'));
      }
    } catch {}

    audioService.playBeep(440, 150);
    showNotification('🔄 RESET ALL COMPLETE: Mission UI, geofence, and waypoints cleared safely. Ready for fresh setup.');
  };

  const handleToggleArm = async (force: boolean = false) => {
    if (telemetry.isArmed) {
      showNotification('Disarming vehicle motors...');
      audioService.playBeep(450, 120);
      try {
        const success = await mavlinkService.sendDisarmCommand(force);
        if (success) {
          showNotification('Vehicle Disarmed ✓');
          audioService.playBeep(350, 150);
        } else {
          showNotification('Disarm rejected by Pixhawk (Confirm vehicle is landed or use Force Disarm)');
        }
      } catch (err: any) {
        showNotification(`Disarm failed: ${err?.message || 'Check connection'}`);
      }
    } else {
      const geofenceCheck = geofenceService.canArmVehicle(telemetry.latitude, telemetry.longitude);
      if (!geofenceCheck.canArm && !force) {
        audioService.playBeep(350, 200);
        showNotification(`❌ ${geofenceCheck.reason}`);
        return;
      }
      showNotification('Sending ARM command to flight controller...');
      audioService.playBeep(850, 100);
      try {
        const success = await mavlinkService.sendArmCommand(false);
        if (success) {
          showNotification('Arm command sent to Pixhawk... (Awaiting physical motor spin)');
          audioService.playBeep(1100, 150);
        } else {
          showNotification('Arm rejected by Pixhawk. Check safety switch, GPS 3D fix, and compass.');
        }
      } catch (err: any) {
        showNotification(`Arm failed: ${err?.message || 'Check pre-arm conditions'}`);
      }
    }
  };

  const handleNudge = async (direction: 'N' | 'S' | 'E' | 'W' | 'UP' | 'DOWN', distanceMeters: number = 5) => {
    if (direction !== 'UP' && direction !== 'DOWN') {
      if (!telemetry.isGpsValid || !telemetry.latitude || Math.abs(telemetry.latitude) <= 0.001) {
        showNotification('⚠️ Cannot nudge drone: Pixhawk GPS Signal Unavailable (No Lock)');
        return;
      }
    }
    const lat = telemetry.latitude;
    const lon = telemetry.longitude;
    const alt = telemetry.altitudeMeters || 5.0;

    let targetLat = lat;
    let targetLon = lon;
    let targetAlt = alt;

    if (direction === 'N') {
      const dest = computeDestination(lat, lon, distanceMeters, 0);
      targetLat = dest.lat; targetLon = dest.lng;
    } else if (direction === 'S') {
      const dest = computeDestination(lat, lon, distanceMeters, 180);
      targetLat = dest.lat; targetLon = dest.lng;
    } else if (direction === 'E') {
      const dest = computeDestination(lat, lon, distanceMeters, 90);
      targetLat = dest.lat; targetLon = dest.lng;
    } else if (direction === 'W') {
      const dest = computeDestination(lat, lon, distanceMeters, 270);
      targetLat = dest.lat; targetLon = dest.lng;
    } else if (direction === 'UP') {
      targetAlt = Math.min(120, alt + 2);
    } else if (direction === 'DOWN') {
      targetAlt = Math.max(1, alt - 2);
    }

    try {
      if (direction === 'UP' || direction === 'DOWN') {
        await mavlinkService.commandVerticalAltitude(targetAlt);
        showNotification(`Vertical ${direction === 'UP' ? 'Climb ▲' : 'Descent ▼'} to ${targetAlt.toFixed(1)}m at current location ✓`);
      } else {
        await mavlinkService.flyToPosition(targetLat, targetLon, targetAlt);
        showNotification(`Nudged ${direction} by ${distanceMeters}m`);
      }
      audioService.playBeep(880, 80);
    } catch (err: any) {
      showNotification(`Nudge failed: ${err?.message || 'Error'}`);
    }
  };

  const handleArmAndFly = () => {
    setShowPreflightModal(true);
    audioService.playBeep(900, 100);
  };

  const confirmArmAndLaunch = async (forceBypass: boolean = false) => {
    if (!forceBypass) {
      const geofenceCheck = geofenceService.canArmVehicle(telemetry.latitude, telemetry.longitude);
      if (!geofenceCheck.canArm) {
        audioService.playBeep(350, 200);
        showNotification(`❌ ${geofenceCheck.reason}`);
        return;
      }
    }
    setShowPreflightModal(false);
    showNotification(`Arming flight controller and starting ${missionMode} mission...`);
    try {
      const currentMission = groundStationMissionService.getCurrentMission();
      let started = false;
      let statusMsg = '';

      if (currentMission && currentMission.waypoints && currentMission.waypoints.length > 0) {
        const res = await groundStationMissionService.startGroundStationMission(forceBypass);
        started = res.success;
        statusMsg = res.message;
      } else if (missionEngine?.startMission) {
        started = missionEngine.startMission();
        statusMsg = started ? `Autonomous ${missionMode} mission commenced` : 'Mission pre-flight checks rejected arming';
      } else {
        const armSuccess = await mavlinkService.sendArmCommand(forceBypass);
        if (armSuccess) {
          await mavlinkService.setFlightMode('GUIDED');
          started = true;
          statusMsg = 'Armed and switched to AUTO mode';
        } else {
          started = false;
          statusMsg = 'Pixhawk rejected arm command';
        }
      }

      if (!started) {
        audioService.playBeep(300, 300, 'sawtooth');
        showNotification(`❌ Start Mission rejected: ${statusMsg}`);
        systemAlertService.pushAlert({
          title: 'MISSION START REJECTED',
          message: statusMsg,
          severity: 'CRITICAL',
          source: 'GCS_MISSION'
        });
        return;
      }

      showNotification(`🚀 ${statusMsg}`);

      // Register active mission with backend /api/missions (preserves start time & deadline)
      const m = groundStationMissionService.getCurrentMission();
      const timeLimitMin = 10;
      const now = Date.now();
      const deadline = now + timeLimitMin * 60 * 1000;

      fetchWithFallback('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          missionId: m?.id || `MISS_${now}`,
          mode: missionMode,
          algorithm: m?.missionType === 'SEARCH' ? 'SPIRAL' : 'TANGENTIAL_CIRCULAR',
          searchCenter: m?.geometry?.circleCenter || { lat: telemetry.latitude, lng: telemetry.longitude },
          searchRadiusMeters: m?.geometry?.circleRadiusMeters || 10,
          plannedAltitudeMeters: m?.altitude || 10,
          timeLimitMinutes: timeLimitMin,
          startTime: now,
          deadline,
          waypoints: m?.waypoints || [],
          status: 'EXECUTING',
        }),
      }).catch(() => {});

      setAutonomyLock(true);
      try { localStorage.setItem('sae_autonomy_lock', 'true'); } catch {}
      updateActiveMissionData({
        startTime: now,
        elapsedSeconds: 0,
        remainingSeconds: timeLimitMin * 60,
        status: 'EXECUTING',
        deadline,
        isExecuting: true,
      });

      showNotification(`Vehicle Armed — ${missionMode} mission initiated ✓`);
      audioService.playBeep(1000, 120);
    } catch (err: any) {
      showNotification(`Mission start failed: ${err?.message || 'Check pre-arm conditions'}`);
      throw err;
    }
  };

  const handleEmergencyRTL = async () => {
    if (!rtlConfirmPending) {
      // 1st Click: Prime RTL confirmation with 4-second auto-disarm timer
      setRtlConfirmPending(true);
      audioService.playBeep(450, 150);
      showNotification('⚠️ CONFIRM RTL: Click the button a 2nd time within 4s to Return to Launch!');
      if (rtlTimerRef.current) clearTimeout(rtlTimerRef.current);
      rtlTimerRef.current = setTimeout(() => {
        setRtlConfirmPending(false);
      }, 4000);
    } else {
      // 2nd Click: Immediately execute Return to Launch without blocking modals
      if (rtlTimerRef.current) {
        clearTimeout(rtlTimerRef.current);
        rtlTimerRef.current = null;
      }
      setRtlConfirmPending(false);
      setShowRtlModal(false);
      showNotification('🚨 EMERGENCY RTL EXECUTED — Aircraft Returning to Launch Site ✓');
      audioService.playRtlAlert();
      try {
        await mavlinkService.commandRTL();
        if (missionEngine?.triggerEmergencyRTL) {
          missionEngine.triggerEmergencyRTL('Operator 2-Click Emergency RTL from Dashboard');
        }
      } catch (err: any) {
        showNotification(`RTL failed: ${err?.message || 'Check MAVLink link'}`);
      }
    }
  };

  const confirmEmergencyRTL = async () => {
    setShowRtlModal(false);
    setRtlConfirmPending(false);
    showNotification('🚨 EMERGENCY RTL EXECUTED — Aircraft Returning to Launch Site ✓');
    audioService.playRtlAlert();
    try {
      await mavlinkService.commandRTL();
      if (missionEngine?.triggerEmergencyRTL) {
        missionEngine.triggerEmergencyRTL('Operator Emergency RTL from Dashboard');
      }
    } catch (err: any) {
      showNotification(`RTL failed: ${err?.message || 'Could not send mode'}`);
    }
  };

  const handleEmergencyLand = async () => {
    if (!landConfirmPending) {
      // 1st Click: Prime LAND confirmation with 4-second timeout
      setLandConfirmPending(true);
      audioService.playBeep(450, 150);
      showNotification('⚠️ CONFIRM LAND: Click the button a 2nd time within 4s to land aircraft!');
      if (landTimerRef.current) clearTimeout(landTimerRef.current);
      landTimerRef.current = setTimeout(() => {
        setLandConfirmPending(false);
      }, 4000);
    } else {
      // 2nd Click: Immediately execute LAND
      if (landTimerRef.current) {
        clearTimeout(landTimerRef.current);
        landTimerRef.current = null;
      }
      setLandConfirmPending(false);
      showNotification('🛬 VERTICAL LAND DISPATCHED — Pixhawk Descending (Awaiting Confirmation) ✓');
      audioService.playBeep(600, 150);
      try {
        const ok = await mavlinkService.setFlightMode('LAND');
        if (ok) {
          showNotification('🛬 Flight Mode switched to LAND (Awaiting Pixhawk Confirmation) ✓');
        } else {
          showNotification('LAND command rejected by Pixhawk — Check safety conditions');
        }
      } catch (err: any) {
        showNotification(`LAND failed: ${err?.message || 'Check MAVLink link'}`);
      }
    }
  };

  const handleCommandBrake = async () => {
    audioService.playBeep(900, 120);
    showNotification('🛑 ELECTRONIC AIR BRAKE DISPATCHED — Halting aircraft and holding position...');
    try {
      const ok = await mavlinkService.setFlightMode('BRAKE');
      if (ok) {
        showNotification('🛑 Flight Mode switched to BRAKE (Awaiting Pixhawk Confirmation) ✓');
      } else {
        showNotification('BRAKE command rejected by Pixhawk');
      }
    } catch (err: any) {
      showNotification(`BRAKE failed: ${err?.message || 'Check MAVLink link'}`);
    }
  };

  const handleUploadWaypoints = async () => {
    const mission = groundStationMissionService.getCurrentMission();
    if (!mission || mission.waypoints.length === 0) {
      showNotification('No waypoints to upload. Click map or select a pattern first.');
      return;
    }

    showNotification(`Uploading ${mission.waypoints.length} waypoints to Pixhawk flight controller...`);
    try {
      const res = await groundStationMissionService.uploadMissionToDrone();
      if (res.success) {
        showNotification(`Waypoints uploaded & verified ✓ (${mission.waypoints.length} items)`);
        audioService.playBeep(980, 100);
      } else {
        showNotification(`Upload failed: ${res.message}`);
      }
    } catch (err: any) {
      showNotification(`Upload error: ${err?.message || 'Check connection'}`);
    }
  };

  const handleModeChange = (mode: 'MANUAL' | 'AUTONOMOUS') => {
    userSelectedModeRef.current = true;
    setMissionMode(mode);
    try {
      localStorage.setItem('sae_gcs_mission_mode', mode);
    } catch {}
    audioService.playBeep(mode === 'MANUAL' ? 700 : 850, 60);

    if (mode === 'MANUAL') {
      missionEngine.switchToManualControl();
    } else {
      missionEngine.switchToAutonomousControl();
    }

    // Persist mode switch to backend if active mission is executing
    fetchWithFallback('/api/missions/active/mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode })
    }).catch(() => {});

    showNotification(`${mode} MISSION MODE ACTIVE`);
  };

  return (
    <div className="h-[100dvh] w-full bg-[var(--uav-bg)] text-[var(--uav-text)] flex flex-col font-sans select-none overflow-hidden">
      <GlobalErrorHUD />
      {/* 1. Header (Fixed 68px) */}
      <Header
        telemetry={telemetry}
        missionMode={missionMode}
        onModeChange={handleModeChange}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onOpenSettings={() => setIsConfigModalOpen(true)}
        onLogout={onLogout}
        currentRole={currentRole}
        onArmClick={() => {
          if (!telemetry.isArmed) {
            setShowPreflightModal(true);
          }
        }}
        onDisarmClick={(force) => {
          handleToggleArm(Boolean(force));
        }}
        onResetAll={handleResetMissionWorkflow}
        onToggleRC={handleToggleRC}
        rcOverrideEnabled={telemetry.rcOverrideEnabled}
        onOpenPhoneMission={() => setShowPhoneMissionModal(true)}
        onOpenDiagnostics={() => setIsComprehensiveDiagOpen(true)}
        missionWindowSeconds={missionWindowSeconds}
        isMissionWindowExpired={isMissionWindowExpired}
        isMissionWindowActive={isMissionWindowActive}
      />

      {/* Alert Banners (Link Lost / Stale Heartbeat / Connecting) */}
      {telemetry.isLinkLost && telemetry.rawConnectionState.lastHeartbeat > 0 && (
        <div className="w-full bg-red-600/95 border-b border-red-500 text-white px-4 py-1.5 flex items-center justify-between z-30 shrink-0 shadow-lg">
          <div className="flex items-center gap-2 text-[12px] font-bold tracking-wide">
            <AlertTriangle className="w-4 h-4 animate-pulse text-amber-300" />
            <span>CRITICAL LINK LOST: No MAVLink heartbeat from Pixhawk for &gt; 5 seconds. Use RC transmitter switch to RTL or LAND immediately.</span>
          </div>
          <button
            type="button"
            onClick={handleEmergencyRTL}
            className={`px-3 py-0.5 font-bold text-[11px] rounded uppercase tracking-wider cursor-pointer ${
              rtlConfirmPending ? 'bg-red-600 text-white animate-pulse border-2 border-white' : 'bg-white text-red-700 hover:bg-red-50'
            }`}
          >
            {rtlConfirmPending ? 'Confirm RTL Now' : 'Force RTL'}
          </button>
        </div>
      )}

      {!telemetry.isLinkLost && telemetry.isStale && (
        <div className="w-full bg-amber-600/90 border-b border-amber-500 text-white px-4 py-1 flex items-center gap-2 text-[12px] font-semibold z-30 shrink-0">
          <AlertTriangle className="w-4 h-4 text-white" />
          <span>STALE HEARTBEAT: Telemetry stream delayed (&gt; 2s). Check wireless signal strength or USB connection.</span>
        </div>
      )}

      {telemetry.isConnecting && (
        <div className="w-full bg-slate-900/95 border-b border-cyan-600/60 text-white px-4 py-1 flex items-center justify-between gap-2 text-[12px] font-semibold z-30 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="font-mono text-cyan-200">
              {telemetry.rawConnectionState.isUsbConnected
                ? 'BRIDGE OPEN: Awaiting Pixhawk heartbeat over TELEM2 (Verify Pixhawk power & baud 57600)...'
                : 'CONNECTING: Establishing MAVLink bridge to Pixhawk flight controller...'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => mavlinkService.switchToSimulationMode()}
            className="px-2.5 py-0.5 rounded bg-cyan-950 border border-cyan-500/50 hover:bg-cyan-900 text-cyan-300 text-[10px] font-mono font-bold cursor-pointer transition shrink-0"
            title="Switch to SITL Simulator to test dashboard features instantly without flight controller hardware"
          >
            ⚡ BENCH SITL MOCK
          </button>
        </div>
      )}

      {/* Floating Action Notice Banner */}
      {actionNotice && (
        <div className="fixed top-20 right-6 z-50 bg-[#161B22] border border-[var(--uav-primary-blue)] text-white px-4 py-2.5 rounded-lg shadow-2xl flex items-center gap-2 text-[12px] font-medium animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 className="w-4 h-4 text-[var(--uav-icon-blue)]" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Responsive View Switcher for Small Screens (< lg) */}
      <div className="lg:hidden w-full bg-[#11161F] border-b border-[var(--uav-card-border)] px-3 py-1.5 flex items-center justify-between shrink-0 z-20 overflow-x-auto scrollbar-none gap-2">
        <span className="text-[11px] font-mono font-bold text-slate-400 uppercase whitespace-nowrap">
          GCS VIEW:
        </span>
        <div className="flex items-center gap-1 bg-[#161B22] p-0.5 rounded-lg border border-[var(--uav-card-border)] text-xs font-semibold shrink-0">
          <button
            type="button"
            onClick={() => setMobileView('telemetry')}
            className={`px-2.5 py-1 rounded transition cursor-pointer whitespace-nowrap ${
              mobileView === 'telemetry' ? 'bg-[#10B981] text-emerald-950 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            📊 Telemetry
          </button>
          <button
            type="button"
            onClick={() => setMobileView('map')}
            className={`px-2.5 py-1 rounded transition cursor-pointer whitespace-nowrap ${
              mobileView === 'map' ? 'bg-[#10B981] text-emerald-950 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            🗺️ Live Map
          </button>
          <button
            type="button"
            onClick={() => setMobileView('operations')}
            className={`px-2.5 py-1 rounded transition cursor-pointer whitespace-nowrap ${
              mobileView === 'operations' ? 'bg-[#10B981] text-emerald-950 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            🎮 Controls
          </button>
        </div>
      </div>

      {/* 3-Section Full-Screen Fixed Viewport Grid */}
      <div className="flex-1 min-h-0 w-full grid grid-cols-1 lg:grid-cols-[280px_1fr_400px] xl:grid-cols-[300px_1fr_420px] overflow-hidden">
        
        {/* 1. LEFT PANEL: Live Drone Telemetry (Fixed Position, Internal Scroll Only) */}
        <aside
          className={`h-full min-h-0 overflow-y-auto overflow-x-hidden p-3 bg-[var(--uav-header)] border-r border-[var(--uav-card-border)] scrollbar-thin scrollbar-thumb-slate-800 ${
            mobileView === 'telemetry' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'
          }`}
        >
          <TelemetryPanel
            telemetry={telemetry}
            onArm={async (force) => {
              const geofenceCheck = geofenceService.canArmVehicle(telemetry.latitude, telemetry.longitude);
              if (!geofenceCheck.canArm && !force) {
                audioService.playBeep(350, 200);
                showNotification(`❌ ${geofenceCheck.reason}`);
                return false;
              }
              const ok = await mavlinkService.sendArmCommand(force);
              if (ok) {
                showNotification(force ? '⚠️ FORCE ARM Command Dispatched to Pixhawk' : 'MOTOR ARM Command Dispatched to Pixhawk ✓');
              } else {
                showNotification('Arm command failed — Check pre-arm safety checks');
              }
              return ok;
            }}
            onDisarm={async (force) => {
              const ok = await mavlinkService.sendDisarmCommand(Boolean(force));
              if (ok) {
                showNotification(force ? '⚠️ FORCE DISARM Command Dispatched to Pixhawk' : 'MOTOR DISARM Command Dispatched to Pixhawk ✓');
              } else {
                showNotification('Disarm command failed — Check MAVLink link');
              }
              return ok;
            }}
            onNotification={showNotification}
          />
        </aside>

        {/* 2. CENTER PANEL: Tactical Map & Top Flight Action Toolbar (Requirements 1 & 2) */}
        <section
          className={`h-full min-h-0 w-full relative overflow-hidden bg-[#0D1117] flex flex-col ${
            mobileView === 'map' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Top Flight Action Toolbar: Compact, responsive, no horizontal overflow */}
          <div className="shrink-0 z-30 bg-[#0A0E14] border-b border-[var(--uav-card-border)] px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
            {/* Left group: Flight Mode, RC Status, Flight Action Controls */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap shrink-0">
              {/* Flight Mode Selector (direction="down" as it is placed at the top of map) */}
              <FlightModeSelector
                variant="dropdown"
                direction="down"
                onModeChanged={(mode) => showNotification(`Flight Mode switch requested: ${mode} (Awaiting Pixhawk Confirmation)`)}
              />

              {/* RC Status Indicator (Requirement 3: RC CONNECTED / ON, RC DISCONNECTED / OFF, RC SIGNAL LOST, RC STATUS UNKNOWN) */}
              <div
                title={`RC Receiver Telemetry: ${telemetry.rcStatus} (RSSI: ${telemetry.rcRssi}%)`}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-[6px] border text-[10.5px] font-mono font-bold shrink-0 transition-all ${
                  telemetry.rcStatus === 'RC CONNECTED / ON'
                    ? 'border-emerald-500/50 bg-emerald-950/60 text-emerald-400'
                    : telemetry.rcStatus === 'RC SIGNAL LOST'
                    ? 'border-rose-500/80 bg-rose-950/80 text-rose-300 animate-pulse'
                    : telemetry.rcStatus === 'RC DISCONNECTED / OFF'
                    ? 'border-amber-500/50 bg-amber-950/60 text-amber-400'
                    : 'border-slate-800 bg-[#161B22] text-slate-400'
                }`}
              >
                <Radio
                  className={`w-3.5 h-3.5 ${
                    telemetry.rcStatus === 'RC CONNECTED / ON'
                      ? 'text-emerald-400'
                      : telemetry.rcStatus === 'RC SIGNAL LOST'
                      ? 'text-rose-400 animate-ping'
                      : telemetry.rcStatus === 'RC DISCONNECTED / OFF'
                      ? 'text-amber-400'
                      : 'text-slate-500'
                  }`}
                />
                <span className="truncate max-w-[150px] sm:max-w-none">
                  {telemetry.rcStatus}
                </span>
              </div>

              {/* BRAKE Control (Immediate electronic air brake to halt movement & hold position) */}
              <button
                type="button"
                onClick={handleCommandBrake}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-[6px] border text-[11px] font-mono font-bold transition cursor-pointer shrink-0 active:scale-95 ${
                  telemetry.flightMode === 'BRAKE'
                    ? 'bg-red-600 text-white border-white animate-pulse'
                    : 'bg-red-950/80 border-red-600/60 hover:bg-red-900 text-red-200'
                }`}
                title="Electronic Air Brake: Immediately halt all motion and loiter in place"
              >
                <Octagon className="w-3.5 h-3.5 text-red-400" />
                <span>BRAKE</span>
              </button>

              {/* RTL Control (Safety Confirmation Required) */}
              <button
                type="button"
                onClick={handleEmergencyRTL}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-[6px] border text-[11px] font-mono font-bold transition cursor-pointer shrink-0 active:scale-95 ${
                  rtlConfirmPending
                    ? 'bg-amber-500 text-black border-white animate-pulse font-extrabold'
                    : telemetry.flightMode === 'RTL'
                    ? 'bg-amber-600 text-white border-amber-300 animate-pulse'
                    : 'bg-amber-950/80 border-amber-600/60 hover:bg-amber-900 text-amber-200'
                }`}
                title={rtlConfirmPending ? 'Click again within 4s to confirm Return to Launch' : 'Return To Launch (Safety Confirmed)'}
              >
                <Home className={`w-3.5 h-3.5 ${rtlConfirmPending ? 'text-black animate-spin' : 'text-amber-400'}`} />
                <span>{rtlConfirmPending ? 'CONFIRM RTL' : 'RTL'}</span>
              </button>

              {/* LAND Control (Safety Confirmation Required) */}
              <button
                type="button"
                onClick={handleEmergencyLand}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-[6px] border text-[11px] font-mono font-bold transition cursor-pointer shrink-0 active:scale-95 ${
                  landConfirmPending
                    ? 'bg-rose-500 text-white border-white animate-pulse font-extrabold'
                    : telemetry.flightMode === 'LAND'
                    ? 'bg-rose-600 text-white border-rose-300 animate-pulse'
                    : 'bg-rose-950/80 border-rose-600/60 hover:bg-rose-900 text-rose-200'
                }`}
                title={landConfirmPending ? 'Click again within 4s to confirm Landing' : 'Immediate Vertical Land (Safety Confirmed)'}
              >
                <PlaneLanding className={`w-3.5 h-3.5 ${landConfirmPending ? 'text-white animate-bounce' : 'text-rose-400'}`} />
                <span>{landConfirmPending ? 'CONFIRM LAND' : 'LAND'}</span>
              </button>

              {/* RESET Mission Workflow Button (Preserved exactly as requested) */}
              <button
                type="button"
                onClick={handleResetMissionWorkflow}
                className="flex items-center gap-1 px-2 py-1 rounded-[6px] border border-amber-500/40 bg-amber-950/30 hover:bg-amber-900/50 text-amber-300 text-[10.5px] font-mono font-semibold transition cursor-pointer shrink-0 active:scale-95"
                title="Restart mission workflow from beginning: Clears previous waypoints, state, and QR code safely"
              >
                <RotateCcw className="w-3 h-3 text-amber-400" />
                <span>RESET</span>
              </button>
            </div>

            {/* Right group: Pixhawk FC Mode acknowledgement & Coordinates */}
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 shrink-0 ml-auto">
              <span className="px-2 py-0.5 rounded bg-[#161B22] border border-slate-800 text-cyan-400 font-semibold" title="Pixhawk Flight Controller Confirmed Mode">
                FC: {telemetry.flightMode || 'DISARMED'}
              </span>
              <span className="hidden md:inline px-2 py-0.5 rounded bg-[#161B22] border border-slate-800">
                POS: {telemetry.latitude !== 0 ? `${telemetry.latitude.toFixed(4)}, ${telemetry.longitude.toFixed(4)}` : 'ACQUIRING GPS'}
              </span>
              <span className="px-2 py-0.5 rounded bg-[#161B22] border border-slate-800 text-emerald-400">
                ALT: {(telemetry.altitudeMeters || 0).toFixed(1)}m
              </span>
            </div>
          </div>

          {/* Central Map Canvas: Contained within available space, no vertical scrolling or overflow */}
          <div className="flex-1 min-h-0 w-full h-full relative overflow-hidden">
            <MapPanel
              telemetry={telemetry}
              className="h-full w-full min-h-0 border-0 rounded-none"
              onWaypointAdded={(_lat, _lon) => {
                if (autonomyLock) {
                  showNotification('🔒 Autonomy Lock Active (ADDC Rule 3.3.1): Manual waypoint editing disabled.');
                  return;
                }
                showNotification('Waypoint added to mission plan');
              }}
            />
          </div>
        </section>

        {/* 3. RIGHT PANEL: Operations & Mission Controls */}
        <aside
          className={`h-full min-h-0 overflow-y-auto overflow-x-hidden p-3 bg-[var(--uav-header)] border-l border-[var(--uav-card-border)] flex-col gap-3 scrollbar-thin scrollbar-thumb-slate-800 ${
            mobileView === 'operations' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Operations Controls */}
          <div className="flex flex-col gap-3">
            {missionMode === 'MANUAL' ? (
              <>
                {/* 1. FLIGHT PARAMETERS (Requirement 3: Workflow Order 1) */}
                <FlightParams className="w-full shrink-0" />

                {/* 2. MANUAL MISSION (Requirement 3: Workflow Order 2) */}
                <ManualMissionControlCard
                  telemetry={telemetry}
                  onOpenPreflightModal={() => setShowPreflightModal(true)}
                  onUploadWaypoints={handleUploadWaypoints}
                  onEmergencyRTL={handleEmergencyRTL}
                  rtlConfirmPending={rtlConfirmPending}
                />

                {/* 3. WAYPOINTS MANAGER (Requirement 3: Workflow Order 3) */}
                <WaypointManager
                  className="w-full shrink-0"
                  onClearAll={() => showNotification('Mission waypoints cleared')}
                  onSaveKml={() => showNotification('Mission KML downloaded')}
                  onLoadKml={() => showNotification('Mission KML loaded')}
                />
              </>
            ) : (
              <>
                {/* MODE B: Autonomous Search Mission (Requirement 4-7: Autonomous Workflow) */}
                <AutonomousMissionControlCard
                  telemetry={telemetry}
                  onOpenPreflightModal={() => setShowPreflightModal(true)}
                  onUploadWaypoints={handleUploadWaypoints}
                  onEmergencyRTL={handleEmergencyRTL}
                  rtlConfirmPending={rtlConfirmPending}
                  activeMissionTime={activeMissionData || undefined}
                  onOpenPhoneMission={() => setShowPhoneMissionModal(true)}
                />
              </>
            )}
          </div>
        </aside>

      </div>

      {/* 4. Preflight Readiness Verification Modal (Section 5) */}
      <PreflightValidationModal
        isOpen={showPreflightModal}
        onClose={() => setShowPreflightModal(false)}
        onConfirmLaunch={confirmArmAndLaunch}
        telemetry={telemetry}
        mode={missionMode}
      />

      {/* 5. Safety Confirmation Modal: EMERGENCY RTL */}
      {showRtlModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161B22] border-2 border-red-600 rounded-[12px] max-w-[95vw] sm:max-w-md w-full max-h-[90vh] overflow-y-auto p-6 text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between text-red-500">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />
                <h3 className="font-orbitron font-bold text-[16px] tracking-wide text-white">
                  EMERGENCY RETURN-TO-LAUNCH
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRtlModal(false)}
                className="text-[var(--uav-muted)] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-[12px] text-slate-300 leading-relaxed">
              This will immediately abort any active search or servo tracking and command the Pixhawk flight controller to enter RTL mode, climbing to safe altitude and returning directly to the home coordinate.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowRtlModal(false)}
                className="px-4 py-2 rounded-lg border border-[var(--uav-card-border)] text-[var(--uav-muted)] hover:text-white hover:bg-[#21262D] text-[12px] font-semibold transition cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={confirmEmergencyRTL}
                className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-[12px] tracking-wider uppercase transition shadow-lg cursor-pointer"
              >
                EXECUTE EMERGENCY RTL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Autonomous Mission Configuration Modal */}
      {isConfigModalOpen && (
        <AutonomousMissionConfigModal
          isOpen={isConfigModalOpen}
          onClose={() => {
            setIsConfigModalOpen(false);
            setActiveNav('Dashboard');
          }}
          telemetry={telemetry.rawTelemetry}
          homePoint={mavlinkService.getHomePoint()}
          pixhawkState={telemetry.rawConnectionState}
          missionState={missionEngine.getCurrentState()}
          onStartMission={() => {
            setIsConfigModalOpen(false);
            setActiveNav('Dashboard');
            missionEngine.startMission();
          }}
        />
      )}

      {/* 7. Mission History / Analytics Modal */}
      {isHistoryModalOpen && (
        <MissionHistoryModal
          isOpen={isHistoryModalOpen}
          onClose={() => {
            setIsHistoryModalOpen(false);
            setActiveNav('Dashboard');
          }}
        />
      )}

      {/* 8. Serial & Diagnostics Modal */}
      {isDiagnosticsModalOpen && (
        <SerialDiagnosticsModal
          isOpen={isDiagnosticsModalOpen}
          onClose={() => {
            setIsDiagnosticsModalOpen(false);
            setActiveNav('Dashboard');
            if (activeTab === 'Logs') setActiveTab('Fly');
          }}
          connectionState={telemetry.rawConnectionState}
          telemetry={telemetry.rawTelemetry}
          runnerLink={runnerCommService.getState()}
        />
      )}

      {/* 8b. Comprehensive 12-Section Live Diagnostic System */}
      <ComprehensiveDiagnosticDashboard
        isOpen={isComprehensiveDiagOpen}
        onClose={() => setIsComprehensiveDiagOpen(false)}
      />

      {/* 9. Tactical Flight Control Modal */}
      {isFlightControlModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-[#161B22] border border-[var(--uav-card-border)] rounded-[12px] max-w-[95vw] sm:max-w-2xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-5 text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--uav-card-border)]">
              <div className="flex items-center gap-2.5">
                <Crosshair className="w-5 h-5 text-[var(--uav-primary-blue)]" />
                <h3 className="font-orbitron font-bold text-[15px] tracking-wide text-white">
                  TACTICAL FLIGHT CONTROL &amp; AUTOPILOT OVERRIDES
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsFlightControlModalOpen(false);
                  setActiveNav('Dashboard');
                }}
                className="text-[var(--uav-muted)] hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Command Buttons */}
            <div>
              <span className="text-[11px] font-bold text-[var(--uav-muted)] uppercase tracking-wider block mb-2">
                Primary Flight Modes & Engine Cutoff
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!telemetry.isArmed) {
                      await mavlinkService.sendArmCommand(true);
                    }
                    await mavlinkService.commandTakeoff(5.0);
                    showNotification('Takeoff commanded: 5.0m AGL');
                  }}
                  className="py-2.5 px-3 rounded-lg bg-emerald-600/20 border border-emerald-500/40 hover:bg-emerald-600/30 text-emerald-300 font-semibold text-[12px] flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <ArrowUp className="w-4 h-4 text-emerald-400" />
                  <span>Takeoff (5m)</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await mavlinkService.setFlightMode('LOITER');
                    showNotification('Autopilot switched to LOITER');
                  }}
                  className="py-2.5 px-3 rounded-lg bg-[#10B981]/20 border border-emerald-500/40 hover:bg-[#10B981]/30 text-emerald-300 font-semibold text-[12px] flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Pause className="w-4 h-4 text-emerald-400" />
                  <span>Loiter Hold</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await mavlinkService.setFlightMode('LAND');
                    showNotification('Autopilot switched to LAND');
                  }}
                  className="py-2.5 px-3 rounded-lg bg-amber-600/20 border border-amber-500/40 hover:bg-amber-600/30 text-amber-300 font-semibold text-[12px] flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <ArrowDown className="w-4 h-4 text-amber-400" />
                  <span>Land Now</span>
                </button>
                <button
                  type="button"
                  onClick={handleEmergencyRTL}
                  className={`py-2.5 px-3 rounded-lg font-semibold text-[12px] flex items-center justify-center gap-2 transition cursor-pointer ${
                    rtlConfirmPending
                      ? 'bg-red-600 border-2 border-white text-white animate-pulse shadow-lg'
                      : 'bg-rose-600/20 border border-rose-500/40 hover:bg-rose-600/30 text-rose-300'
                  }`}
                  title={
                    rtlConfirmPending
                      ? 'CLICK AGAIN TO RETURN TO LAUNCH NOW'
                      : 'Emergency Return To Launch (Click once to prime, click 2nd time to execute)'
                  }
                >
                  <AlertTriangle
                    className={`w-4 h-4 ${
                      rtlConfirmPending ? 'text-white animate-bounce' : 'text-rose-400'
                    }`}
                  />
                  <span>
                    {rtlConfirmPending ? 'Confirm RTL' : 'Emergency RTL'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const isLowAlt = (telemetry.altitudeMeters || 0) <= 1.0;
                    showNotification('Disarming vehicle motors...');
                    audioService.playBeep(450, 120);
                    const ok = await mavlinkService.sendDisarmCommand(isLowAlt);
                    if (ok) {
                      showNotification('Vehicle Disarmed ✓');
                      audioService.playBeep(350, 150);
                    } else {
                      showNotification('Disarm rejected by Pixhawk (Use Force Disarm on Telemetry Panel)');
                    }
                  }}
                  className={`py-2.5 px-3 rounded-lg font-semibold text-[12px] flex items-center justify-center gap-2 transition cursor-pointer ${
                    telemetry.isArmed
                      ? 'bg-rose-600 hover:bg-rose-500 text-white border border-rose-400 shadow-md shadow-rose-950/50 active:scale-95'
                      : 'bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700 text-zinc-300 active:scale-95'
                  }`}
                  title="Cut motor power / Disarm UAV"
                >
                  <Power className="w-4 h-4 text-white" />
                  <span>{telemetry.isArmed ? 'Disarm Motors' : 'Force Disarm'}</span>
                </button>
              </div>
            </div>

            {/* Guided Directional Nudges */}
            <div>
              <span className="text-[11px] font-bold text-[var(--uav-muted)] uppercase tracking-wider block mb-2">
                Guided 3D Reposition Nudges (±5m Horizontal, ±2m Vertical)
              </span>
              <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
                <div />
                <button
                  type="button"
                  onClick={() => handleNudge('N', 5)}
                  className="py-2 px-3 rounded-lg bg-[#21262D] border border-[var(--uav-card-border)] hover:bg-[#262C36] text-white text-[12px] font-mono font-bold transition cursor-pointer"
                >
                  ▲ North (+5m)
                </button>
                <button
                  type="button"
                  onClick={() => handleNudge('UP', 2)}
                  className="py-2 px-3 rounded-lg bg-[#21262D] border border-[var(--uav-card-border)] hover:bg-[#262C36] text-emerald-300 text-[12px] font-mono font-bold transition cursor-pointer"
                >
                  ▲ Climb (+2m)
                </button>

                <button
                  type="button"
                  onClick={() => handleNudge('W', 5)}
                  className="py-2 px-3 rounded-lg bg-[#21262D] border border-[var(--uav-card-border)] hover:bg-[#262C36] text-white text-[12px] font-mono font-bold transition cursor-pointer"
                >
                  ◀ West (+5m)
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await mavlinkService.setFlightMode('LOITER');
                    showNotification('Loiter Hold');
                  }}
                  className="py-2 px-3 rounded-lg bg-[#10B981] hover:bg-[#059669] text-emerald-950 font-bold text-[12px] font-mono transition cursor-pointer"
                >
                  STOP / HOLD
                </button>
                <button
                  type="button"
                  onClick={() => handleNudge('E', 5)}
                  className="py-2 px-3 rounded-lg bg-[#21262D] border border-[var(--uav-card-border)] hover:bg-[#262C36] text-white text-[12px] font-mono font-bold transition cursor-pointer"
                >
                  East (+5m) ▶
                </button>

                <div />
                <button
                  type="button"
                  onClick={() => handleNudge('S', 5)}
                  className="py-2 px-3 rounded-lg bg-[#21262D] border border-[var(--uav-card-border)] hover:bg-[#262C36] text-white text-[12px] font-mono font-bold transition cursor-pointer"
                >
                  ▼ South (+5m)
                </button>
                <button
                  type="button"
                  onClick={() => handleNudge('DOWN', 2)}
                  className="py-2 px-3 rounded-lg bg-[#21262D] border border-[var(--uav-card-border)] hover:bg-[#262C36] text-amber-300 text-[12px] font-mono font-bold transition cursor-pointer"
                >
                  ▼ Descend (-2m)
                </button>
              </div>
            </div>

            {/* Active Flight Status Footer */}
            {/* Active Flight Status Footer */}
            <div className="pt-2 border-t border-[var(--uav-card-border)] flex items-center justify-between">
              <div className="flex items-center gap-3 text-[11px] font-mono">
                <span className="text-[var(--uav-muted)]">
                  Mode: <strong className="text-emerald-400">{telemetry.flightMode || 'GUIDED'}</strong>
                </span>
                <span className="text-[var(--uav-muted)]">
                  Motors: <strong className={telemetry.isArmed ? 'text-red-400' : 'text-emerald-400'}>{telemetry.isArmed ? 'ARMED' : 'DISARMED'}</strong>
                </span>
                <span className="text-[var(--uav-muted)]">
                  Altitude: <strong className="text-amber-400">{(telemetry.altitudeMeters || 0).toFixed(1)}m</strong>
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsFlightControlModalOpen(false);
                  setActiveNav('Dashboard');
                }}
                className="px-4 py-1.5 rounded-lg border border-[var(--uav-card-border)] text-[var(--uav-muted)] hover:text-white text-[12px] font-semibold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9b. SKYCON Claude AI Assistant Modal */}
      {isAIChatModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 select-none">
          <div className="bg-[#161B22] border-2 border-emerald-500/80 rounded-[14px] max-w-xl w-full h-[620px] max-h-[90vh] text-white shadow-2xl overflow-hidden flex flex-col relative">
            <button
              type="button"
              onClick={() => {
                setIsAIChatModalOpen(false);
                setActiveNav('Dashboard');
              }}
              className="absolute top-3 right-3 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer z-10"
              title="Close AI Assistant"
            >
              <X className="w-5 h-5" />
            </button>
            <AIChatPanel />
          </div>
        </div>
      )}

      {/* Unified Camera & Optical Intelligence Modal */}
      <UnifiedCameraIntelligenceModal
        isOpen={showPhoneMissionModal}
        onClose={() => setShowPhoneMissionModal(false)}
      />
    </div>
  );
};
