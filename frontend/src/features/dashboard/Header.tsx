import React, { useState, useEffect } from 'react';
import {
  Satellite,
  Gamepad2,
  Crosshair,
  Settings,
  LogOut,
  Play,
  Loader2,
  Wifi,
  Radio,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Menu,
  X,
  RotateCcw,
  Power,
  Clock
} from 'lucide-react';
import { DashboardTelemetryData } from '../../hooks/useDashboardTelemetry';
import { AppRole } from '../../types/mission';
import { gcsConnectionService, GCSConnectionState } from '../../services/gcsConnectionService';
import { mavlinkService } from '../../services/mavlinkService';
import { FlightModeSelector } from '../../components/common/FlightModeSelector';
import { dronePortStreamingService, DronePortStreamState } from '../../services/dronePortStreamingService';
import { SimpleConnectionIndicators } from '../../components/common/SimpleConnectionIndicators';

interface HeaderProps {
  telemetry: DashboardTelemetryData;
  missionMode?: 'MANUAL' | 'AUTONOMOUS';
  onModeChange?: (mode: 'MANUAL' | 'AUTONOMOUS') => void;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  onOpenSettings?: () => void;
  onLogout?: () => void;
  onArmClick?: () => void;
  onDisarmClick?: (force?: boolean) => void;
  onResetAll?: () => void;
  onToggleRC?: () => void;
  rcOverrideEnabled?: boolean;
  currentRole?: AppRole;
  onOpenPhoneMission?: () => void;
  onOpenDiagnostics?: () => void;
  missionWindowSeconds?: number;
  isMissionWindowExpired?: boolean;
  isMissionWindowActive?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  telemetry,
  missionMode = 'MANUAL',
  onModeChange,
  activeTab = 'Fly',
  onTabChange,
  onOpenSettings,
  onLogout,
  onArmClick,
  onDisarmClick,
  onResetAll,
  onToggleRC,
  rcOverrideEnabled = true,
  currentRole = 'GROUND_STATION',
  onOpenPhoneMission,
  onOpenDiagnostics,
  missionWindowSeconds = 300,
  isMissionWindowExpired = false,
  isMissionWindowActive = false,
}) => {
  const isArmed = telemetry.isArmed;
  const [connState, setConnState] = useState<GCSConnectionState>(() => gcsConnectionService.getState());
  const [dronePortState, setDronePortState] = useState<DronePortStreamState>(() => dronePortStreamingService.getStreamState());
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);

  useEffect(() => {
    const unsubConn = gcsConnectionService.subscribe((st) => {
      setConnState(st);
    });
    const unsubStream = dronePortStreamingService.subscribe((st) => {
      setDronePortState(st);
    });
    return () => {
      unsubConn();
      unsubStream();
    };
  }, []);

  const handleStartConnections = async () => {
    await gcsConnectionService.start();
  };

  // 1. Wi-Fi Connection Indicator (Accurate states: CONNECTED, CONNECTING, DISCONNECTED, UNKNOWN)
  const getWifiBadgeConfig = () => {
    if (connState.wifiStatus === 'CONNECTING') {
      return {
        bg: 'bg-[#2d2208] border-[#785412] text-amber-300',
        dot: 'bg-amber-400 animate-pulse',
        label: 'WI-FI: CONNECTING',
        pulse: true
      };
    }
    // Only show green when connection is actually verified (not fake navigator.onLine)
    if (connState.wifiStatus === 'VERIFIED') {
      return {
        bg: 'bg-[#0f291e] border-[#1b4d36] text-[#22C55E]',
        dot: 'bg-[#22C55E]',
        label: 'WI-FI: CONNECTED',
        pulse: false
      };
    }
    if (connState.wifiStatus === 'FAILED') {
      return {
        bg: 'bg-[#3b1212] border-[#7f1d1d] text-rose-300',
        dot: 'bg-rose-500',
        label: 'WI-FI: DISCONNECTED',
        pulse: false
      };
    }
    return {
      bg: 'bg-[#161B22] border-[var(--uav-card-border)] text-slate-400',
      dot: 'bg-slate-500',
      label: 'WI-FI: UNKNOWN',
      pulse: false
    };
  };

  // 2. MAVLink Connection Indicator (Green: Connected, Red: Disconnected, Yellow: Connecting, Grey: Unavailable)
  const getMavlinkBadgeConfig = () => {
    const isActuallyConnected = Boolean(
      telemetry.isConnected &&
      (telemetry.isTelemetryAvailable || connState.mavlinkStatus === 'ACTIVE' || telemetry.rawConnectionState.bytesReceived > 0 || telemetry.rawTelemetry.pixhawkConnected)
    );
    if (isActuallyConnected) {
      return {
        bg: 'bg-[#0f291e] border-[#1b4d36] text-[#22C55E]',
        dot: 'bg-[#22C55E]',
        label: 'MAVLINK: CONNECTED',
        pulse: false
      };
    }
    if (telemetry.isConnecting || connState.mavlinkStatus === 'CONNECTING') {
      return {
        bg: 'bg-[#2d2208] border-[#785412] text-amber-300',
        dot: 'bg-amber-400 animate-pulse',
        label: 'MAVLINK: CONNECTING',
        pulse: true
      };
    }
    if (telemetry.rawConnectionState.phase === 'DISCONNECTED' || !telemetry.isConnected) {
      return {
        bg: 'bg-[#3b1212] border-[#7f1d1d] text-rose-300',
        dot: 'bg-rose-500',
        label: 'MAVLINK: NOT CONNECTED',
        pulse: false
      };
    }
    return {
      bg: 'bg-[#161B22] border-[var(--uav-card-border)] text-slate-400',
      dot: 'bg-slate-500',
      label: 'MAVLINK: STATUS UNAVAILABLE',
      pulse: false
    };
  };

  // 3. Pixhawk Connectivity Indicator (Green: Connected, Red: Not Connected, Yellow: Connecting, Grey: Status Unavailable)
  const getPixhawkBadgeConfig = () => {
    if (telemetry.isConnected) {
      return {
        bg: 'bg-[#0f291e] border-[#1b4d36] text-[#22C55E]',
        dot: 'bg-[#22C55E]',
        label: 'PIXHAWK: CONNECTED',
        pulse: false
      };
    }
    if (telemetry.isConnecting) {
      return {
        bg: 'bg-[#2d2208] border-[#785412] text-amber-300',
        dot: 'bg-amber-400 animate-pulse',
        label: 'PIXHAWK: CONNECTING',
        pulse: true
      };
    }
    if (telemetry.isLinkLost && telemetry.rawConnectionState.lastHeartbeat > 0) {
      return {
        bg: 'bg-red-950 border-red-500 text-red-200 animate-pulse',
        dot: 'bg-red-500 animate-ping',
        label: 'PIXHAWK: LINK LOST',
        pulse: true
      };
    }
    if (!telemetry.isConnected) {
      return {
        bg: 'bg-[#3b1212] border-[#7f1d1d] text-rose-300',
        dot: 'bg-rose-500',
        label: 'PIXHAWK: NOT CONNECTED',
        pulse: false
      };
    }
    return {
      bg: 'bg-[#161B22] border-[var(--uav-card-border)] text-slate-400',
      dot: 'bg-slate-500',
      label: 'PIXHAWK: STATUS UNAVAILABLE',
      pulse: false
    };
  };

  // 4. GPS Indicator (Green: Fix Valid, Red: No Fix, Yellow: Acquiring, Grey: Unavailable)
  const isGpsActuallyLocked = Boolean(
    (connState.isStarted && connState.gpsStatus === 'LOCKED') ||
    telemetry.isGpsLocked ||
    telemetry.isGpsValid
  );

  const getGpsBadgeConfig = () => {
    const satsCount = telemetry.satellites || connState.satellites || 0;
    if (telemetry.isGpsValid || isGpsActuallyLocked) {
      return {
        bg: 'bg-[#0f291e] border-[#1b4d36] text-[#22C55E]',
        dot: 'bg-[#22C55E]',
        label: `GPS: LOCKED (${satsCount} SATS)`,
        pulse: false
      };
    }
    if (connState.gpsStatus === 'ACQUIRING' || (telemetry.isConnected && satsCount > 0)) {
      return {
        bg: 'bg-[#2d2208] border-[#785412] text-amber-300',
        dot: 'bg-amber-400 animate-pulse',
        label: `GPS: ACQUIRING (${satsCount} SATS)`,
        pulse: true
      };
    }
    if (telemetry.isConnected && satsCount === 0) {
      return {
        bg: 'bg-[#3b1212] border-[#7f1d1d] text-rose-300',
        dot: 'bg-rose-500',
        label: 'GPS: NO FIX',
        pulse: false
      };
    }
    return {
      bg: 'bg-[#161B22] border-[var(--uav-card-border)] text-slate-400',
      dot: 'bg-slate-500',
      label: '',
      pulse: false
    };
  };

  // 5. Drone Port Indicator (Green: Active, Red: Off, Yellow: Starting, Grey: Unavailable)
  const getDronePortBadgeConfig = () => {
    switch (dronePortState) {
      case 'STREAMING_ACTIVE':
        return {
          bg: 'bg-[#0f291e] border-[#1b4d36] text-[#22C55E]',
          dot: 'bg-[#22C55E]',
          label: 'DRONE PORT: STREAMING ACTIVE',
          pulse: false
        };
      case 'STARTING':
        return {
          bg: 'bg-[#2d2208] border-[#785412] text-amber-300',
          dot: 'bg-amber-400 animate-pulse',
          label: 'DRONE PORT: STARTING',
          pulse: true
        };
      case 'STREAMING_OFF':
        return {
          bg: 'bg-[#3b1212] border-[#7f1d1d] text-rose-300',
          dot: 'bg-rose-500',
          label: 'DRONE PORT: STREAMING OFF',
          pulse: false
        };
      case 'CONNECTION_UNAVAILABLE':
      default:
        return {
          bg: 'bg-[#161B22] border-[var(--uav-card-border)] text-slate-400',
          dot: 'bg-slate-500',
          label: 'DRONE PORT: CONNECTION UNAVAILABLE',
          pulse: false
        };
    }
  };

  const wifiConfig = getWifiBadgeConfig();
  const mavlinkConfig = getMavlinkBadgeConfig();
  const pixhawkConfig = getPixhawkBadgeConfig();
  const gpsConfig = getGpsBadgeConfig();
  const dronePortConfig = getDronePortBadgeConfig();

  // Short status diagnostic string
  const isWifiConnected = wifiConfig.dot === 'bg-[#22C55E]';
  const isMavlinkConnected = mavlinkConfig.dot === 'bg-[#22C55E]';
  const isPixhawkConnected = pixhawkConfig.dot === 'bg-[#22C55E]';
  const isGpsLocked = gpsConfig.dot === 'bg-[#22C55E]';
  const showDiagnosticMessage = isWifiConnected && (!isMavlinkConnected || !isPixhawkConnected || !isGpsLocked);

  const shortDiagnosticString = `${wifiConfig.label} | ${pixhawkConfig.label} | ${mavlinkConfig.label} | ${gpsConfig.label}`;

  return (
    <header className="h-[68px] w-full px-2 sm:px-4 bg-[var(--uav-header)] border-b border-[var(--uav-card-border)] flex items-center justify-between select-none shrink-0 z-40 shadow-sm gap-1.5 flex-nowrap overflow-x-hidden">
      {/* 1. Left: Brand, Wordmark & Mode Tabs */}
      <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
        {/* Custom Quadcopter Glyph */}
        <div className="w-8 h-8 rounded-[8px] bg-[#161B22] border border-[#262C36] flex items-center justify-center text-emerald-400 shrink-0">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 9V5" />
            <path d="M12 19v-4" />
            <path d="M9 12H5" />
            <path d="M19 12h-4" />
            <circle cx="5" cy="5" r="2" />
            <circle cx="19" cy="5" r="2" />
            <circle cx="5" cy="19" r="2" />
            <circle cx="19" cy="19" r="2" />
          </svg>
        </div>

        <div className="flex flex-col justify-center">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="font-orbitron font-black text-[16px] sm:text-[18px] tracking-[0.12em] text-white leading-none text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-200 to-amber-300">
              SKYCON
            </span>
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/30 text-[9px] font-mono font-bold text-emerald-300 tracking-wider">
              SEARCH & RECON
            </span>
            <span className="px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 text-[9px] font-mono font-semibold text-slate-300 tracking-wider hidden sm:inline-block">
              TACTICAL GCS
            </span>
          </div>
          <span className="text-[10px] font-mono text-[var(--uav-muted)] tracking-wider mt-0.5 hidden md:block">
            SAE INDIA ADDC 2026 • AUTONOMOUS RESCUE SYSTEM
          </span>
        </div>

        {/* Section 3: TWO PRIMARY MISSION MODES (MANUAL vs AUTONOMOUS) + MISSION WINDOW COUNTDOWN + RESET ALL */}
        <div className="hidden lg:flex items-center gap-1.5 ml-1 sm:ml-2">
          {/* Mission Mode Switcher */}
          <div className="flex items-center bg-[#11161F] p-0.5 rounded-lg border border-[var(--uav-card-border)]">
            <button
              type="button"
              onClick={() => onModeChange?.('MANUAL')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[11px] font-bold font-sans tracking-wide transition cursor-pointer ${
                missionMode === 'MANUAL'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-[#161B22]'
              }`}
              title="Manual Mission Planning: Draw and customize search path on map"
            >
              <span>🧭</span>
              <span>MANUAL</span>
            </button>
            <button
              type="button"
              onClick={() => onModeChange?.('AUTONOMOUS')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[11px] font-bold font-sans tracking-wide transition cursor-pointer ${
                missionMode === 'AUTONOMOUS'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-[#161B22]'
              }`}
              title="Autonomous Search Mission: Generate search mission from altitude, radius, and algorithm"
            >
              <span>🤖</span>
              <span>AUTONOMOUS</span>
            </button>
          </div>

          {/* Mission Window 5-Minute Countdown Badge (Requirement 3: In top header) */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] font-mono text-[11px] font-bold border transition ${
              isMissionWindowExpired
                ? 'bg-rose-950/80 border-rose-500 text-rose-300 animate-pulse'
                : isMissionWindowActive
                ? 'bg-sky-950/80 border-sky-500/60 text-sky-300'
                : 'bg-[#11161F] border-slate-800 text-slate-400'
            }`}
            title="5-Minute Mission Window Timer"
          >
            <Clock className={`w-3.5 h-3.5 ${isMissionWindowActive ? 'animate-spin text-sky-400' : 'text-slate-500'}`} />
            <span>
              {isMissionWindowExpired
                ? 'MISSION WINDOW EXPIRED'
                : `${Math.floor(missionWindowSeconds / 60).toString().padStart(2, '0')}:${(missionWindowSeconds % 60).toString().padStart(2, '0')} / 05:00`}
            </span>
          </div>

          {/* CLEARLY VISIBLE RESET ALL BUTTON IMMEDIATELY AFTER MISSION WINDOW TIMER (Requirement 3 & 4) */}
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] border border-amber-500/60 bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 text-[11px] font-mono font-bold transition shadow-sm cursor-pointer active:scale-95"
            title="RESET ALL: Clear complete mission session, codes, configuration, waypoints, and start fresh"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>RESET ALL</span>
          </button>
        </div>
      </div>

      {/* 2. Center: START Button, Diagnostics & Simplified 3-Symbol Connection Indicators */}
      <div className="hidden md:flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* START BUTTON: Operator initiates connection verification workflow */}
        <button
          type="button"
          onClick={handleStartConnections}
          disabled={connState.isInitializing}
          title={
            connState.isStarted
              ? 'Re-verify connections (Wi-Fi, MAVLink, Pixhawk)'
              : 'Start GCS: Initialize and verify Wi-Fi, MAVLink, and Pixhawk'
          }
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-[8px] text-[11px] font-bold font-sans tracking-wide transition shadow-sm cursor-pointer ${
            connState.isInitializing
              ? 'bg-amber-600/80 text-white cursor-wait'
              : connState.isStarted
              ? 'bg-[#161B22] border border-emerald-500/50 text-emerald-400 hover:bg-[#21262D]'
              : 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white shadow-emerald-950/50'
          }`}
        >
          {connState.isInitializing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
              <span>INITIALIZING...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{connState.isStarted ? 'RE-VERIFY' : 'START'}</span>
            </>
          )}
        </button>

        {/* SITL Bench Simulator Toggle Button (Requirement 5: Diagnostics in top header) */}
        {telemetry.rawConnectionState.connectionType === 'SIMULATED' ? (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] border border-cyan-500/50 bg-cyan-950/60 text-cyan-300 text-[11px] font-mono font-bold shadow-sm"
            title="Bench SITL Simulator active with simulated GPS, battery, and MAVLink"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>SITL ACTIVE</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => mavlinkService.switchToSimulationMode()}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-[8px] border border-cyan-500/40 bg-cyan-950/30 hover:bg-cyan-900/50 text-cyan-400 text-[11px] font-mono font-bold transition shadow-sm cursor-pointer"
            title="Activate SITL Simulator for complete desktop testing without physical drone hardware"
          >
            <span>⚡</span>
            <span>BENCH TEST</span>
          </button>
        )}

        {/* TL Diagnostics System Button (Requirement 5: Diagnostics in top header) */}
        <button
          type="button"
          onClick={onOpenDiagnostics}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] border border-amber-500/50 bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 text-[11px] font-mono font-bold transition shadow-sm cursor-pointer"
          title="Open Telemetry Link (TL) & Complete Pixhawk 2.4.8 Diagnostic System"
        >
          <Activity className="w-3.5 h-3.5 text-amber-400" />
          <span>TL DIAGNOSTICS</span>
        </button>

        {/* SIMPLIFIED 3-SYMBOL CONNECTION INDICATORS (Wi-Fi, MAVLink, Pixhawk) */}
        <SimpleConnectionIndicators
          isWifiConnected={isWifiConnected}
          isMavlinkConnected={isMavlinkConnected}
          isPixhawkConnected={isPixhawkConnected}
        />
      </div>

      {/* Mobile-only 3-Symbol Connection Indicators */}
      <div className="flex md:hidden items-center shrink-0">
        <SimpleConnectionIndicators
          isWifiConnected={isWifiConnected}
          isMavlinkConnected={isMavlinkConnected}
          isPixhawkConnected={isPixhawkConnected}
        />
      </div>

      {/* 3. Right: Vehicle State Pills & Settings */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Flight Mode Dropdown Selector */}
        <div className="hidden sm:block">
          <FlightModeSelector variant="dropdown" />
        </div>

        {/* GPS Status Indicator (Requirement 6: Satellite icon + status dot, no "GPS STATUS UNAVAILABLE" text) */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] border text-[11px] font-mono ${gpsConfig.bg}`}
          title={gpsConfig.label ? `GPS: ${gpsConfig.label}` : 'GPS Status'}
        >
          <Satellite className="w-3.5 h-3.5 text-slate-300" />
          <span className={`w-2 h-2 rounded-full ${gpsConfig.dot}`} />
          {gpsConfig.label ? (
            <span className="font-semibold">{gpsConfig.label}</span>
          ) : null}
        </div>

        {/* Settings Button: Always visible and accessible across desktop, tablets, and mobile */}
        <button
          type="button"
          onClick={onOpenSettings}
          title="Open GCS Settings"
          aria-label="Open GCS Settings"
          className="flex w-8 h-8 rounded-[8px] border border-[var(--uav-card-border)] bg-[#161B22] hover:bg-[#21262D] hover:text-white items-center justify-center text-[var(--uav-muted)] transition cursor-pointer shrink-0"
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* Logout Button: Always visible and accessible across desktop, tablets, and mobile (Req 2) */}
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            title="Log Out / Switch Operator"
            aria-label="Log Out / Switch Operator"
            className="flex w-8 h-8 rounded-[8px] border border-[var(--uav-card-border)] bg-[#161B22] hover:bg-red-950/60 hover:text-red-400 hover:border-red-500/40 items-center justify-center text-[var(--uav-muted)] transition cursor-pointer shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}

        {/* Mobile / Tablet Responsive Drawer Toggle Button */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden w-8 h-8 rounded-[8px] border border-[var(--uav-card-border)] bg-[#161B22] text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer active:scale-95 shrink-0"
          title={mobileMenuOpen ? 'Close Menu' : 'Open GCS Controls Menu'}
          aria-label="Toggle Navigation Menu"
        >
          {mobileMenuOpen ? <X className="w-4 h-4 text-emerald-400" /> : <Menu className="w-4 h-4" />}
        </button>
      </div>

      {/* Collapsible Mobile / Tablet Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="xl:hidden fixed top-[68px] left-0 right-0 z-50 bg-[#0d121c]/95 border-b border-[var(--uav-card-border)] backdrop-blur-xl p-4 shadow-2xl max-h-[85vh] overflow-y-auto space-y-4 animate-in fade-in slide-in-from-top-2">
          {/* A. Mode Switcher */}
          {/* A. Mode Switcher & Reset All */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-bold">Mission Planning Mode & Session:</div>
            <div className="flex items-center gap-2 mb-2 p-2 rounded-lg bg-[#11161F] border border-[var(--uav-card-border)]">
              <Clock className={`w-3.5 h-3.5 ${isMissionWindowActive ? 'animate-spin text-sky-400' : 'text-slate-500'}`} />
              <span className="text-[11px] font-mono font-bold text-slate-300">
                MISSION WINDOW:{' '}
                <span className={isMissionWindowExpired ? 'text-rose-400 animate-pulse' : 'text-sky-300'}>
                  {isMissionWindowExpired
                    ? 'EXPIRED'
                    : `${Math.floor(missionWindowSeconds / 60).toString().padStart(2, '0')}:${(missionWindowSeconds % 60).toString().padStart(2, '0')} / 05:00`}
                </span>
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => { onModeChange?.('MANUAL'); setMobileMenuOpen(false); }}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold font-sans transition ${
                  missionMode === 'MANUAL' ? 'bg-emerald-600 text-white shadow' : 'bg-[#161B22] text-slate-300 border border-[var(--uav-card-border)]'
                }`}
              >
                <span>🧭</span>
                <span>MANUAL</span>
              </button>
              <button
                type="button"
                onClick={() => { onModeChange?.('AUTONOMOUS'); setMobileMenuOpen(false); }}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold font-sans transition ${
                  missionMode === 'AUTONOMOUS' ? 'bg-emerald-600 text-white shadow' : 'bg-[#161B22] text-slate-300 border border-[var(--uav-card-border)]'
                }`}
              >
                <span>🤖</span>
                <span>AUTONOMOUS</span>
              </button>
              <button
                type="button"
                onClick={() => { setShowResetConfirm(true); setMobileMenuOpen(false); }}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-950/60 border border-amber-500/50 text-amber-300 text-xs font-mono font-bold transition active:scale-95 col-span-2 sm:col-span-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>RESET ALL</span>
              </button>
            </div>
          </div>

          {/* B. GCS Engine Actions */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-bold">Flight & GCS Controls:</div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => { handleStartConnections(); setMobileMenuOpen(false); }}
                disabled={connState.isInitializing}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition active:scale-95"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{connState.isStarted ? 'RE-VERIFY' : 'START GCS'}</span>
              </button>
              <button
                type="button"
                onClick={() => { mavlinkService.switchToSimulationMode(); setMobileMenuOpen(false); }}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-xs font-bold font-mono transition active:scale-95"
              >
                <span>⚡</span>
                <span>BENCH TEST</span>
              </button>
              <button
                type="button"
                onClick={() => { onOpenDiagnostics?.(); setMobileMenuOpen(false); }}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-950/60 border border-amber-500/40 text-amber-300 text-xs font-bold font-mono transition active:scale-95"
              >
                <Activity className="w-3.5 h-3.5 text-amber-400" />
                <span>TL DIAGNOSTICS</span>
              </button>
            </div>
          </div>

          {/* C. Simplified Connection Indicators (3 Symbols) */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-bold">Connection Status:</div>
            <div className="flex items-center gap-3 p-2 rounded-lg bg-[#11161F] border border-[var(--uav-card-border)]">
              <SimpleConnectionIndicators
                isWifiConnected={isWifiConnected}
                isMavlinkConnected={isMavlinkConnected}
                isPixhawkConnected={isPixhawkConnected}
              />
              <span className="text-[11px] font-mono text-slate-400">
                Wi-Fi • MAVLink • Pixhawk
              </span>
            </div>
          </div>

          {/* D. Flight Mode & Utilities */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--uav-card-border)]">
            <div className="flex items-center gap-2">
              <FlightModeSelector variant="dropdown" />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { onOpenSettings?.(); setMobileMenuOpen(false); }}
                className="px-3 py-1.5 rounded-lg border border-[var(--uav-card-border)] bg-[#161B22] text-slate-300 hover:text-white flex items-center gap-1.5 text-xs font-mono"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>SETTINGS</span>
              </button>
              {onLogout && (
                <button
                  type="button"
                  onClick={() => { onLogout(); setMobileMenuOpen(false); }}
                  className="px-3 py-1.5 rounded-lg border border-red-500/40 bg-red-950/60 text-red-300 hover:text-white flex items-center gap-1.5 text-xs font-mono"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>LOGOUT</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM RESET ALL MODAL DIALOG (Requirement 4 & 5) */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#0f172a] border border-amber-500/50 rounded-xl max-w-md w-full p-5 shadow-2xl text-slate-100 flex flex-col gap-4 animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-amber-950/70 border border-amber-500/60 flex items-center justify-center text-amber-400">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-orbitron font-bold text-[14px] text-white tracking-wide">CONFIRM RESET ALL</h3>
                  <span className="text-[10px] font-mono text-slate-400">MISSION WORKFLOW &amp; UI RESET</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="text-xs text-slate-300 space-y-2.5">
              <p className="font-medium text-slate-200">
                Are you sure you want to reset the mission planning workflow? This action will:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-400 font-mono text-[11px]">
                <li>Clear current mission UI and map preview</li>
                <li>Clear drawn geofence boundaries &amp; custom vertices</li>
                <li>Clear generated search waypoints</li>
                <li>Clear optical search results &amp; target detections</li>
                <li>Reset altitude selection &amp; pattern inputs</li>
                <li>Return to a fresh mission setup</li>
              </ul>

              {/* Safety Interlock Check (Requirement 5) */}
              {telemetry.isArmed && (
                <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-500/60 text-amber-200 text-[11px] font-mono flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong>SAFETY NOTICE:</strong> Aircraft motors are currently <strong>ARMED</strong>. Resetting clears only GCS planning UI. It will <strong>NOT</strong> disarm or interrupt an aircraft in flight.
                  </div>
                </div>
              )}

              <div className="p-2 rounded bg-slate-900 border border-slate-800 text-[10.5px] font-mono text-slate-400">
                ℹ️ Pixhawk flight controller and Raspberry Pi companion computer hardware will not be rebooted.
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowResetConfirm(false);
                  onResetAll?.();
                }}
                className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white font-bold text-xs tracking-wide transition shadow-lg shadow-amber-950/50 cursor-pointer flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>CONFIRM RESET ALL</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
