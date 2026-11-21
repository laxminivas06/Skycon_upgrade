import React, { useState, useEffect } from 'react';
import {
  Satellite,
  Gamepad2,
  Battery,
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
  X
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
  onToggleRC?: () => void;
  rcOverrideEnabled?: boolean;
  currentRole?: AppRole;
  onOpenPhoneMission?: () => void;
  onOpenDiagnostics?: () => void;
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
  onToggleRC,
  rcOverrideEnabled = true,
  currentRole = 'GROUND_STATION',
  onOpenPhoneMission,
  onOpenDiagnostics,
}) => {
  const isArmed = telemetry.isArmed;
  const [connState, setConnState] = useState<GCSConnectionState>(() => gcsConnectionService.getState());
  const [dronePortState, setDronePortState] = useState<DronePortStreamState>(() => dronePortStreamingService.getStreamState());
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

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

  // 1. Wi-Fi Connection Indicator (Green: Connected, Red: Disconnected, Yellow: Connecting, Grey: Unavailable)
  const getWifiBadgeConfig = () => {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : false;
    if (connState.wifiStatus === 'CONNECTING') {
      return {
        bg: 'bg-[#2d2208] border-[#785412] text-amber-300',
        dot: 'bg-amber-400 animate-pulse',
        label: 'WI-FI: CONNECTING',
        pulse: true
      };
    }
    if ((connState.isStarted && connState.wifiStatus === 'VERIFIED') || isOnline) {
      return {
        bg: 'bg-[#0f291e] border-[#1b4d36] text-[#22C55E]',
        dot: 'bg-[#22C55E]',
        label: 'WI-FI: CONNECTED',
        pulse: false
      };
    }
    if (connState.wifiStatus === 'FAILED' || !isOnline) {
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
      label: 'WI-FI: STATUS UNAVAILABLE',
      pulse: false
    };
  };

  // 2. MAVLink Connection Indicator (Green: Connected, Red: Disconnected, Yellow: Connecting, Grey: Unavailable)
  const getMavlinkBadgeConfig = () => {
    const isActuallyConnected = Boolean(
      telemetry.isConnected &&
      (telemetry.isTelemetryAvailable || connState.mavlinkStatus === 'ACTIVE' || telemetry.rawConnectionState.bytesReceived > 0)
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
      label: 'GPS: STATUS UNAVAILABLE',
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
          <div className="flex items-center gap-2">
            <span className="font-orbitron font-black text-[16px] sm:text-[17px] tracking-[0.14em] text-white leading-none text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-200 to-amber-300">
              SKYCON
            </span>
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/30 text-[9px] font-mono font-bold text-emerald-300 tracking-wider hidden md:inline-block">
              TACTICAL GCS
            </span>
          </div>
          <span className="text-[10px] font-mono text-[var(--uav-muted)] tracking-wider mt-0.5 hidden md:block">
            SAE INDIA ADDC 2026 • AUTONOMOUS RESCUE SYSTEM
          </span>
        </div>

        {/* Section 3: TWO PRIMARY MISSION MODES (MANUAL vs AUTONOMOUS) */}
        <div className="hidden xl:flex items-center bg-[#11161F] p-1 rounded-lg border border-[var(--uav-card-border)] ml-1 sm:ml-2">
          <button
            type="button"
            onClick={() => onModeChange?.('MANUAL')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-[6px] text-[11px] font-bold font-sans tracking-wide transition cursor-pointer ${
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
            className={`flex items-center gap-1.5 px-3 py-1 rounded-[6px] text-[11px] font-bold font-sans tracking-wide transition cursor-pointer ${
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

        {/* SITL Bench Simulator Toggle Button */}
        {telemetry.rawConnectionState.connectionType === 'SIMULATED' ? (
          <div
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] border border-cyan-500/50 bg-cyan-950/60 text-cyan-300 text-[11px] font-mono font-bold shadow-sm"
            title="Bench SITL Simulator active with simulated GPS, battery, and MAVLink"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>SITL ACTIVE</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => mavlinkService.switchToSimulationMode()}
            className="hidden lg:flex items-center gap-1 px-2.5 py-1.5 rounded-[8px] border border-cyan-500/40 bg-cyan-950/30 hover:bg-cyan-900/50 text-cyan-400 text-[11px] font-mono font-bold transition shadow-sm cursor-pointer"
            title="Activate SITL Simulator for complete desktop testing without physical drone hardware"
          >
            <span>⚡</span>
            <span>BENCH TEST</span>
          </button>
        )}

        {/* TL Diagnostics System Button */}
        <button
          type="button"
          onClick={onOpenDiagnostics}
          className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] border border-amber-500/50 bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 text-[11px] font-mono font-bold transition shadow-sm cursor-pointer"
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

        {/* Arm State Pill */}
        <button
          type="button"
          onClick={onArmClick}
          title={isArmed ? 'EMERGENCY DISARM: Click to disarm vehicle motors immediately' : 'Click to Arm Vehicle'}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-[11px] font-semibold font-sans border transition active:scale-95 cursor-pointer ${
            isArmed
              ? 'bg-rose-950/90 border-rose-600 text-rose-200 hover:bg-rose-900 hover:text-white shadow-sm ring-1 ring-rose-500/50'
              : 'bg-[#0f291e] border-[#1b4d36] text-[#22C55E] hover:bg-[#143d2b]'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isArmed ? 'bg-rose-500 animate-pulse' : 'bg-[#22C55E]'
            }`}
          />
          <span className="text-[10px] sm:text-[11px]">{isArmed ? 'ARMED' : 'DISARMED'}</span>
        </button>

        {/* RC Gamepad Link Toggle Button */}
        <button
          type="button"
          onClick={onToggleRC}
          title={
            rcOverrideEnabled
              ? 'RC Manual Control: ENABLED (Click to Disable RC Override)'
              : 'RC Manual Control: DISABLED (Click to Enable RC Override)'
          }
          className={`hidden 2xl:flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] border text-[11px] font-mono transition-all active:scale-95 cursor-pointer ${
            rcOverrideEnabled
              ? 'border-[#1b4d36] bg-[#0c2419] text-[#22C55E] hover:bg-[#123826]'
              : 'border-[var(--uav-card-border)] bg-[#161B22] text-slate-400 hover:text-white hover:bg-[#21262D]'
          }`}
        >
          <Gamepad2
            className={`w-3.5 h-3.5 ${
              rcOverrideEnabled ? 'text-[#22C55E]' : 'text-slate-400'
            }`}
          />
          <span className="font-semibold">
            RC: {rcOverrideEnabled ? 'ON' : 'OFF'}
          </span>
        </button>

        {/* Battery Percent & Voltage Pill */}
        <div className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] border text-[11px] font-mono transition-colors ${
          telemetry.batteryVoltage <= 0
            ? 'border-[var(--uav-card-border)] bg-[#161B22] text-slate-500'
            : telemetry.batteryVoltage < 10.5
            ? 'border-rose-500/70 bg-rose-950/60 text-rose-300 animate-pulse'
            : telemetry.batteryPercent < 25
            ? 'border-amber-500/70 bg-amber-950/60 text-amber-300'
            : 'border-[var(--uav-card-border)] bg-[#161B22] text-emerald-400'
        }`}>
          <Battery className={`w-3.5 h-3.5 ${
            telemetry.batteryVoltage <= 0 ? 'text-slate-500' :
            telemetry.batteryVoltage < 10.5 ? 'text-rose-400' :
            telemetry.batteryPercent < 25 ? 'text-amber-400' : 'text-emerald-400'
          }`} />
          <span className="font-bold">
            {telemetry.batteryVoltage > 0 ? `${telemetry.batteryPercent}%` : '--%'}
          </span>
          <span className="text-[var(--uav-muted)]">
            {telemetry.batteryVoltage > 0 ? `${telemetry.batteryVoltage.toFixed(1)}V` : 'UNAVAILABLE'}
          </span>
        </div>

        {/* Settings Button: Always visible and accessible across desktop, tablets, and mobile (Req 2) */}
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
          <div className="space-y-1.5">
            <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-bold">Mission Planning Mode:</div>
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
            </div>
          </div>

          {/* B. GCS Engine Actions */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-bold">GCS Quick Actions:</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => { handleStartConnections(); setMobileMenuOpen(false); }}
                disabled={connState.isInitializing}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold transition active:scale-95"
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
              <button
                type="button"
                onClick={() => { onToggleRC?.(); setMobileMenuOpen(false); }}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-mono font-bold transition active:scale-95 ${
                  rcOverrideEnabled ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300' : 'bg-[#161B22] border-[var(--uav-card-border)] text-slate-400'
                }`}
              >
                <Gamepad2 className="w-3.5 h-3.5" />
                <span>RC: {rcOverrideEnabled ? 'ON' : 'OFF'}</span>
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
              {telemetry.batteryVoltage > 0 && (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--uav-card-border)] bg-[#161B22] text-xs font-mono text-emerald-400">
                  <Battery className="w-4 h-4" />
                  <span className="font-bold">{telemetry.batteryPercent}%</span>
                  <span className="text-slate-400">({telemetry.batteryVoltage.toFixed(1)}V)</span>
                </div>
              )}
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
    </header>
  );
};

export default Header;
