import React, { useState, useEffect } from 'react';
import { PixhawkConnectionState, ConnectionPhase } from '../../types/mavlink';
import { mavlinkService } from '../../services/mavlinkService';
import {
  Usb,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Activity,
  Cpu,
  RefreshCw,
  PowerOff,
  Sliders,
  HelpCircle,
  Radio,
  Zap,
  RotateCcw,
  Check,
  Lock,
  Search,
  Wifi,
  Globe,
  Info,
  Server,
  Cable,
  ArrowRight,
  ShieldAlert,
  Clock,
  ChevronDown,
  ChevronUp,
  Layers,
  Network
} from 'lucide-react';

interface PixhawkConnectionCardProps {
  connectionState: PixhawkConnectionState;
  className?: string;
  onOpenHelp?: () => void;
  onOpenDiagnostics?: () => void;
  embedded?: boolean;
}

export const PixhawkConnectionCard: React.FC<PixhawkConnectionCardProps> = ({
  connectionState,
  className = '',
  onOpenHelp,
  onOpenDiagnostics,
  embedded = false,
}) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [showDevDetails, setShowDevDetails] = useState(false);
  const [selectedBaud, setSelectedBaud] = useState<number>(connectionState.baudRate || 57600);
  const [isMobileCollapsed, setIsMobileCollapsed] = useState(false);

  // Connection Transport Method: 'PI_AGENT' | 'USB' | 'SIM'
  const [connectionMethod, setConnectionMethod] = useState<'PI_AGENT' | 'USB' | 'SIM'>(() => {
    if (connectionState.connectionType === 'SIMULATED') return 'SIM';
    if (connectionState.connectionType === 'USB_SERIAL') return 'USB';
    return 'PI_AGENT'; // Default to Raspberry Pi 4 Companion Agent
  });

  const isHttpsOrigin = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const pageProtocol = typeof window !== 'undefined' ? window.location.protocol.replace(':', '').toUpperCase() : 'HTTPS';

  const phase: ConnectionPhase = connectionState.phase;
  const isConnected = Boolean(connectionState.isConnected && connectionState.pixhawkHeartbeatConnected !== false);
  const isUsbConnected = Boolean(connectionState.isUsbConnected);
  const isSimulated = connectionState.connectionType === 'SIMULATED';
  const isPiMode = connectionMethod === 'PI_AGENT';
  const diag = connectionState.diagnostics;

  // 4 Explicit Connection State Indicators
  const isPiAgentConnected = Boolean(
    connectionState.piAgentConnected ||
    connectionState.connectionType === 'CLOUD_RELAY' && connectionState.lastTelemetryTime && (Date.now() - connectionState.lastTelemetryTime < 15000)
  );

  const isCloudOnline = connectionState.cloudConnected !== false;

  const heartbeatAgeMs = connectionState.lastHeartbeat > 0 ? (Date.now() - connectionState.lastHeartbeat) : 999999;
  const isMavlinkHeartbeatReceived = isConnected && heartbeatAgeMs < 8000;
  const isHeartbeatTimeout = phase === 'HEARTBEAT_TIMEOUT' || phase === 'NO_MAVLINK_HEARTBEAT' || (isConnected && heartbeatAgeMs >= 8000);
  const isWaitingMavlink = (phase === 'WAITING_FOR_MAVLINK' || phase === 'WAITING_FOR_HEARTBEAT') && !isConnected;

  const freshnessMs = connectionState.telemetryFreshnessMs ?? (connectionState.lastTelemetryTime ? Math.max(0, Date.now() - connectionState.lastTelemetryTime) : 999999);
  const freshnessSec = (freshnessMs / 1000).toFixed(1);

  const isUsbActive = connectionState.connectionType === 'USB_SERIAL' && (
    isUsbConnected || isConnected || phase === 'SERIAL_OPEN'
  );

  const isUsbDetected = 
    phase !== 'DISCONNECTED' && 
    phase !== 'USB_NOT_DETECTED' && 
    phase !== 'IOS_UNSUPPORTED';

  const isPermissionGranted =
    phase === 'USB_PERMISSION_GRANTED' ||
    phase === 'PERMISSION_GRANTED' ||
    phase === 'SERIAL_OPENING' ||
    phase === 'SERIAL_OPEN' ||
    phase === 'WAITING_FOR_MAVLINK' ||
    phase === 'HEARTBEAT_RECEIVED' ||
    phase === 'PIXHAWK_CONNECTED' ||
    phase === 'TELEMETRY_ACTIVE' ||
    phase === 'OPENING_USB' ||
    phase === 'USB_CONNECTED' ||
    phase === 'WAITING_FOR_HEARTBEAT' ||
    phase === 'MAVLINK_CONNECTED';

  const isPermissionRequested = phase === 'USB_PERMISSION_REQUIRED' || phase === 'REQUESTING_PERMISSION';
  const isPermissionDenied = phase === 'PERMISSION_DENIED';
  const isSerialOpen = isUsbConnected || phase === 'SERIAL_OPEN' || isConnected;

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      await mavlinkService.syncTelemetry();
    } finally {
      setTimeout(() => setIsSyncing(false), 400);
    }
  };

  const handleScan = async () => {
    setIsScanning(true);
    try {
      await mavlinkService.scanUsbDevices();
      await mavlinkService.connectHardware(selectedBaud);
    } finally {
      setIsScanning(false);
    }
  };

  const handleConnectUsb = async () => {
    setIsConnecting(true);
    try {
      await mavlinkService.connectHardware(selectedBaud);
    } catch (e) {
      console.warn('Connect error:', e);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleRequestPermission = async () => {
    setIsConnecting(true);
    try {
      await mavlinkService.requestUsbPermission();
    } finally {
      setIsConnecting(false);
    }
  };

  const handleConfirmDisconnect = async () => {
    setShowDisconnectConfirm(false);
    setIsConnecting(false);
    await mavlinkService.disconnect();
  };

  const handleBaudChange = (newBaud: number) => {
    setSelectedBaud(newBaud);
    if (isUsbConnected && connectionState.connectionType === 'USB_SERIAL') {
      mavlinkService.connectHardware(newBaud);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <>
      <div className={`bg-slate-900/95 border-2 rounded-2xl p-3 sm:p-4.5 shadow-2xl font-mono transition-all ${
        isConnected
          ? 'border-emerald-500/80 shadow-emerald-950/40'
          : isHeartbeatTimeout
          ? 'border-amber-500/80 shadow-amber-950/40'
          : phase === 'PERMISSION_DENIED' || phase === 'SERIAL_OPEN_FAILED' || phase === 'UNSUPPORTED_DEVICE'
          ? 'border-rose-500/80 shadow-rose-950/40'
          : 'border-slate-700/80 shadow-slate-950/60'
      } ${className}`}>
        
        {/* Compact Mobile Link Status Banner */}
        <div className="flex sm:hidden items-center justify-between bg-slate-950/90 px-2.5 py-1.5 rounded-xl border border-slate-800 text-[11px] mb-2 font-mono">
          <div className="flex items-center space-x-1.5">
            <span className={`w-2 h-2 rounded-full ${
              isConnected
                ? 'bg-emerald-400 animate-ping'
                : isPiAgentConnected
                ? 'bg-amber-400 animate-pulse'
                : 'bg-slate-500'
            }`} />
            <span className="font-bold text-white uppercase text-[10px]">
              Pi Agent ● {isPiAgentConnected ? 'Online' : 'Waiting'}
            </span>
          </div>
          <div className="flex items-center space-x-2 text-[10px]">
            <span className={isCloudOnline ? 'text-emerald-400 font-bold' : 'text-rose-400'}>
              Cloud ● {isCloudOnline ? 'OK' : 'Off'}
            </span>
            <span className={isMavlinkHeartbeatReceived ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
              Pixhawk ● {isMavlinkHeartbeatReceived ? 'Locked' : 'Wait'}
            </span>
            <span className={freshnessMs < 3000 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
              {freshnessMs < 99999 ? `${freshnessSec}s` : '—'}
            </span>
            <button
              onClick={() => setIsMobileCollapsed(!isMobileCollapsed)}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold border border-slate-700 transition"
              title={isMobileCollapsed ? 'Expand Connection Panel' : 'Collapse Panel'}
            >
              {isMobileCollapsed ? '▼' : '▲'}
            </button>
          </div>
        </div>

        {/* Responsive Content Wrapper */}
        <div className={isMobileCollapsed ? 'hidden sm:block' : 'block'}>

          {/* Top Header & Connection Mode Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className={`p-2 rounded-xl border shrink-0 ${
                isConnected
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/50'
                  : isWaitingMavlink
                  ? 'bg-amber-950/80 text-amber-400 border-amber-500/50 animate-pulse'
                  : isHeartbeatTimeout
                  ? 'bg-amber-950/80 text-amber-400 border-amber-500/50'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>
                {isPiMode ? (
                  <Server className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400" />
                ) : isSimulated ? (
                  <Cpu className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" />
                ) : (
                  <Usb className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs sm:text-sm font-black uppercase text-white tracking-wider">
                    {isPiMode ? 'RASPBERRY PI 4 CLOUD TELEMETRY' : isSimulated ? 'SITL BENCH SIMULATOR' : 'PIXHAWK USB OTG CONNECTION'}
                  </span>
                  
                  {/* Real-time Status Badge */}
                  <span className={`text-[10px] sm:text-[11px] font-black px-2 py-0.5 rounded-full border ${
                    isConnected
                      ? isSimulated
                        ? 'bg-purple-950/80 text-purple-300 border-purple-500/50'
                        : 'bg-emerald-950/90 text-emerald-300 border-emerald-500/60'
                      : isWaitingMavlink
                      ? 'bg-amber-950/80 text-amber-300 border-amber-500/50 animate-pulse'
                      : isHeartbeatTimeout
                      ? 'bg-amber-950/80 text-amber-300 border-amber-500/50'
                      : isPiAgentConnected
                      ? 'bg-sky-950/80 text-sky-300 border-sky-500/50'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>
                    {isConnected
                      ? isSimulated
                        ? 'SIMULATED MAVLINK ✓'
                        : 'PIXHAWK CONNECTED ✓'
                      : isWaitingMavlink
                      ? 'WAITING HEARTBEAT ⟳'
                      : isHeartbeatTimeout
                      ? 'HEARTBEAT TIMEOUT ⚠️'
                      : isPiAgentConnected
                      ? 'PI 4 AGENT SYNCED'
                      : 'DISCONNECTED'}
                  </span>

                  {/* Origin Badge */}
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded border bg-sky-950 text-sky-300 border-sky-600/50">
                    {pageProtocol}
                  </span>
                </div>
                
                <div className="text-[11px] text-slate-400 truncate max-w-[260px] sm:max-w-md">
                  {connectionState.portOrAddress || 'PythonAnywhere Cloud (teamskycon.pythonanywhere.com)'}
                </div>
              </div>
            </div>

            {/* Connection Method Selector Tabs */}
            <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs shrink-0">
              <button
                onClick={() => {
                  setConnectionMethod('PI_AGENT');
                  mavlinkService.connectPi();
                }}
                className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer flex items-center space-x-1.5 ${
                  connectionMethod === 'PI_AGENT'
                    ? 'bg-sky-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Server className="w-3.5 h-3.5" />
                <span>Raspberry Pi 4</span>
              </button>
              <button
                onClick={() => {
                  setConnectionMethod('USB');
                  if (connectionState.connectionType !== 'USB_SERIAL') {
                    mavlinkService.disconnect();
                  }
                }}
                className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer flex items-center space-x-1.5 ${
                  connectionMethod === 'USB'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Usb className="w-3.5 h-3.5" />
                <span>USB OTG / Serial</span>
              </button>
              <button
                onClick={() => {
                  setConnectionMethod('SIM');
                  mavlinkService.switchToSimulationMode();
                }}
                className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer flex items-center space-x-1.5 ${
                  isSimulated
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Simulator</span>
              </button>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SECTION 1: RASPBERRY PI 4 COMPANION & CLOUD TELEMETRY DECK                 */}
          {/* ========================================================================= */}
          {connectionMethod === 'PI_AGENT' && (
            <div className="my-3 p-3.5 bg-slate-950/60 border border-sky-500/30 rounded-xl space-y-3">
              
              {/* Architecture Breadcrumbs & Action Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-800">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
                  <span className="text-slate-400 font-bold">PIPELINE:</span>
                  <span className="text-sky-300 font-bold">Pixhawk 2.4.8 (TELEM2)</span>
                  <ArrowRight className="w-3 h-3 text-slate-500" />
                  <span className="text-emerald-300 font-bold">RPi 4 GPIO UART (/dev/serial0 @ 57600)</span>
                  <ArrowRight className="w-3 h-3 text-slate-500" />
                  <span className="text-purple-300 font-bold">PythonAnywhere</span>
                  <ArrowRight className="w-3 h-3 text-slate-500" />
                  <span className="text-white font-bold">SKYCON GCS</span>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleSyncNow}
                    disabled={isSyncing}
                    className="text-[11px] px-3 py-1 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-black uppercase rounded-lg border border-sky-400/40 flex items-center space-x-1.5 cursor-pointer transition shadow-md shadow-sky-600/20"
                    title="Poll latest telemetry snapshot from PythonAnywhere Cloud API"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? 'SYNCING...' : 'SYNC NOW'}</span>
                  </button>

                  {!embedded && onOpenDiagnostics && (
                    <button
                      onClick={onOpenDiagnostics}
                      className="text-[11px] px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 flex items-center space-x-1 cursor-pointer transition"
                    >
                      <Sliders className="w-3.5 h-3.5 text-sky-400" />
                      <span>Diagnostics</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 4 DISTINCT STATUS CARDS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                
                {/* 1. Raspberry Pi 4 Agent Connection */}
                <div className={`p-3 rounded-xl border flex flex-col justify-between ${
                  isPiAgentConnected
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                    : 'bg-slate-900/90 border-slate-800 text-slate-300'
                }`}>
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider">1. Pi 4 Agent</span>
                      <span className={`w-2 h-2 rounded-full ${isPiAgentConnected ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
                    </div>
                    <div className="font-bold text-sm text-white mt-1">
                      {isPiAgentConnected ? 'ONLINE (SYNCED)' : 'AWAITING SYNC'}
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-2 font-mono">
                    skycon.service ● /dev/serial0
                  </div>
                </div>

                {/* 2. Pixhawk MAVLink Heartbeat */}
                <div className={`p-3 rounded-xl border flex flex-col justify-between ${
                  isMavlinkHeartbeatReceived
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                    : isWaitingMavlink
                    ? 'bg-amber-950/40 border-amber-500/50 text-amber-200'
                    : 'bg-slate-900/90 border-slate-800 text-slate-300'
                }`}>
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider">2. Pixhawk Heartbeat</span>
                      <span className={`w-2 h-2 rounded-full ${isMavlinkHeartbeatReceived ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                    </div>
                    <div className="font-bold text-sm text-white mt-1">
                      {isMavlinkHeartbeatReceived ? 'LOCKED (1.0 Hz)' : isWaitingMavlink ? 'WAITING HEARTBEAT' : 'DISCONNECTED'}
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-2 font-mono">
                    SysID: {connectionState.systemId || 1} ● TELEM2 @ 57600
                  </div>
                </div>

                {/* 3. PythonAnywhere Cloud Connection */}
                <div className={`p-3 rounded-xl border flex flex-col justify-between ${
                  isCloudOnline
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                    : 'bg-rose-950/40 border-rose-500/50 text-rose-200'
                }`}>
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider">3. PythonAnywhere Cloud</span>
                      <span className={`w-2 h-2 rounded-full ${isCloudOnline ? 'bg-emerald-400' : 'bg-rose-500'}`} />
                    </div>
                    <div className="font-bold text-sm text-white mt-1">
                      {isCloudOnline ? 'CONNECTED (HTTPS)' : 'UNREACHABLE'}
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-2 font-mono truncate" title="teamskycon.pythonanywhere.com">
                    /api/telemetry (REST)
                  </div>
                </div>

                {/* 4. Dashboard Telemetry Freshness */}
                <div className={`p-3 rounded-xl border flex flex-col justify-between ${
                  freshnessMs < 2500
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                    : freshnessMs < 6000
                    ? 'bg-amber-950/40 border-amber-500/50 text-amber-200'
                    : 'bg-slate-900/90 border-slate-800 text-slate-300'
                }`}>
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider">4. Freshness</span>
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                    <div className="font-bold text-sm text-white mt-1">
                      {freshnessMs < 99999 ? `${freshnessSec}s ago` : 'No Packets'}
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-2 font-mono">
                    RX: {formatBytes(connectionState.bytesReceived || 0)}
                  </div>
                </div>

              </div>

              {/* Status Note & Diagnostics Toggle */}
              <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800">
                <span>Raspberry Pi 4 Model B Local Agent executes cloud synchronization autonomously.</span>
                <button
                  onClick={() => setShowDevDetails(!showDevDetails)}
                  className="text-sky-400 hover:text-sky-300 underline cursor-pointer"
                >
                  {showDevDetails ? 'Hide Details' : 'Show Details'}
                </button>
              </div>

              {/* Collapsible Details */}
              {showDevDetails && (
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] space-y-2 text-slate-300 font-mono">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div><strong className="text-slate-400">Companion:</strong> Raspberry Pi 4 Model B</div>
                    <div><strong className="text-slate-400">UART Device:</strong> /dev/serial0 @ 57600</div>
                    <div><strong className="text-slate-400">System Service:</strong> skycon.service</div>
                    <div><strong className="text-slate-400">Cloud Host:</strong> teamskycon.pythonanywhere.com</div>
                    <div><strong className="text-slate-400">Telemetry API:</strong> /api/telemetry (1 Hz HTTPS)</div>
                    <div><strong className="text-slate-400">Heartbeat Rate:</strong> {connectionState.heartbeatHz || 1.0} Hz</div>
                    <div><strong className="text-slate-400">Firmware:</strong> {connectionState.firmwareVersion || 'ArduCopter 4.x'}</div>
                    <div><strong className="text-slate-400">Phase Message:</strong> <span className="text-emerald-400">{connectionState.phaseMessage}</span></div>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION 2: DIRECT USB OTG / SERIAL CONTROLS                               */}
          {/* ========================================================================= */}
          {connectionMethod === 'USB' && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 my-3 text-[11px]">
                <div className={`p-2.5 rounded-xl border flex flex-col justify-between ${
                  isUsbDetected || isConnected
                    ? 'bg-slate-950/80 border-emerald-500/40 text-slate-200'
                    : 'bg-slate-950/40 border-slate-800 text-slate-400'
                }`}>
                  <span className="text-[10px] uppercase text-slate-500 font-bold">USB Host</span>
                  <div className="flex items-center space-x-1.5 mt-1 font-bold">
                    {isConnected || isUsbConnected ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="text-emerald-300">Connected ✓</span>
                      </>
                    ) : isUsbDetected ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        <span className="text-sky-300">Detected</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>Not Detected</span>
                      </>
                    )}
                  </div>
                </div>

                <div className={`p-2.5 rounded-xl border flex flex-col justify-between ${
                  isUsbDetected || isConnected
                    ? 'bg-slate-950/80 border-emerald-500/40 text-slate-200'
                    : 'bg-slate-950/40 border-slate-800 text-slate-400'
                }`}>
                  <span className="text-[10px] uppercase text-slate-500 font-bold">Device</span>
                  <div className="flex items-center space-x-1.5 mt-1 font-bold">
                    <span className="text-emerald-300 truncate" title={diag.productName || 'Pixhawk / USB Serial'}>
                      {diag.productName || 'Pixhawk 2.4.8'}
                    </span>
                  </div>
                </div>

                <div className={`p-2.5 rounded-xl border flex flex-col justify-between ${
                  isPermissionGranted || isConnected
                    ? 'bg-slate-950/80 border-emerald-500/40 text-slate-200'
                    : 'bg-slate-950/40 border-slate-800 text-slate-400'
                }`}>
                  <span className="text-[10px] uppercase text-slate-500 font-bold">Permission</span>
                  <div className="flex items-center space-x-1.5 mt-1 font-bold">
                    {isPermissionGranted || isConnected ? (
                      <span className="text-emerald-300">Granted ✓</span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </div>
                </div>

                <div className={`p-2.5 rounded-xl border flex flex-col justify-between ${
                  isSerialOpen || isConnected
                    ? 'bg-slate-950/80 border-emerald-500/40 text-slate-200'
                    : 'bg-slate-950/40 border-slate-800 text-slate-400'
                }`}>
                  <span className="text-[10px] uppercase text-slate-500 font-bold">Baud Rate</span>
                  <div className="flex items-center space-x-1.5 mt-1 font-bold">
                    <span className="text-emerald-300">{selectedBaud} Baud</span>
                  </div>
                </div>

                <div className={`p-2.5 rounded-xl border flex flex-col justify-between ${
                  isConnected
                    ? 'bg-slate-950/80 border-emerald-500/40 text-slate-200'
                    : 'bg-slate-950/40 border-slate-800 text-slate-400'
                }`}>
                  <span className="text-[10px] uppercase text-slate-500 font-bold">MAVLink</span>
                  <div className="flex items-center space-x-1.5 mt-1 font-bold">
                    {isConnected ? (
                      <span className="text-emerald-300">Connected ✓</span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </div>
                </div>

                <div className={`p-2.5 rounded-xl border flex flex-col justify-between ${
                  isConnected
                    ? 'bg-slate-950/80 border-emerald-500/40 text-slate-200'
                    : 'bg-slate-950/40 border-slate-800 text-slate-400'
                }`}>
                  <span className="text-[10px] uppercase text-slate-500 font-bold">Heartbeat</span>
                  <div className="flex items-center space-x-1.5 mt-1 font-bold">
                    {isConnected ? (
                      <span className="text-emerald-300">{connectionState.heartbeatHz || 1.0} Hz</span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Controls Bar for Direct USB Mode */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
                <div className="flex items-center space-x-2 text-xs">
                  <span className="text-slate-400 font-bold uppercase text-[10px]">Baud:</span>
                  <select
                    value={selectedBaud}
                    onChange={(e) => handleBaudChange(Number(e.target.value))}
                    className="bg-slate-950 text-slate-200 text-xs px-2.5 py-1 rounded-lg border border-slate-700 cursor-pointer"
                  >
                    <option value={57600}>57600 (TELEM2 UART)</option>
                    <option value={115200}>115200 (USB / High-Speed)</option>
                    <option value={921600}>921600 (Fast UART)</option>
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  {isConnecting ? (
                    <button
                      disabled
                      className="px-3.5 py-1.5 bg-emerald-800 text-emerald-200 rounded-lg text-xs font-black uppercase tracking-wide flex items-center space-x-1.5 opacity-80 cursor-not-allowed"
                    >
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>CONNECTING...</span>
                    </button>
                  ) : isUsbActive ? (
                    <button
                      onClick={() => setShowDisconnectConfirm(true)}
                      className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-black uppercase tracking-wide transition flex items-center justify-center space-x-1.5 shadow-lg shadow-rose-600/30 cursor-pointer"
                    >
                      <PowerOff className="w-3.5 h-3.5" />
                      <span>DISCONNECT</span>
                    </button>
                  ) : !isUsbDetected && !isConnected ? (
                    <button
                      onClick={handleScan}
                      disabled={isScanning}
                      className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-black uppercase tracking-wide transition flex items-center space-x-1.5 shadow-lg shadow-sky-600/30 cursor-pointer"
                    >
                      {isScanning ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Search className="w-3.5 h-3.5" />
                      )}
                      <span>SCAN USB DEVICES</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleConnectUsb}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-black uppercase tracking-wide transition flex items-center space-x-1.5 shadow-lg shadow-emerald-600/30 cursor-pointer animate-pulse"
                    >
                      <Usb className="w-3.5 h-3.5" />
                      <span>CONNECT PIXHAWK</span>
                    </button>
                  )}

                  {!embedded && onOpenDiagnostics && (
                    <button
                      onClick={onOpenDiagnostics}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-400 rounded-lg text-xs font-bold transition flex items-center space-x-1 border border-slate-700 cursor-pointer"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Diagnostics</span>
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ========================================================================= */}
          {/* SECTION 3: SIMULATOR MODE                                                 */}
          {/* ========================================================================= */}
          {connectionMethod === 'SIM' && (
            <div className="my-3 p-3.5 bg-purple-950/30 border border-purple-500/40 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Cpu className="w-4 h-4 text-purple-400" />
                  <span className="font-bold text-sm text-purple-200">SITL Bench Simulator Active</span>
                </div>
                <button
                  onClick={() => mavlinkService.connectPi()}
                  className="text-xs px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
                >
                  Exit Simulator
                </button>
              </div>
              <p className="text-xs text-slate-400">
                Generating synthetic MAVLink telemetry for bench testing without hardware.
              </p>
            </div>
          )}

          {/* Real-time Connection Error & Diagnostic Notification Panels */}
          {phase === 'SERIAL_OPEN_FAILED' && connectionState.errorMessage ? (
            <div className="mt-3 p-3 bg-rose-950/60 border border-rose-500/70 rounded-xl text-xs text-rose-200 space-y-2">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-rose-300">Connection Error Encountered</strong>
                  <p className="text-[11px] text-rose-200 mt-0.5 leading-relaxed">
                    {connectionState.errorMessage}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-rose-500/30">
                <span className="text-[10px] text-rose-300/80">
                  Verify Raspberry Pi 4 GPIO UART cable and PythonAnywhere connection.
                </span>
                <button
                  onClick={handleSyncNow}
                  className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-[11px] cursor-pointer"
                >
                  Retry Sync
                </button>
              </div>
            </div>
          ) : isHeartbeatTimeout ? (
            <div className="mt-3 p-3 bg-amber-950/50 border border-amber-500/50 rounded-xl text-xs text-amber-200 space-y-2">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-amber-300">
                    Awaiting Pixhawk MAVLink Heartbeat
                  </strong>
                  <p className="text-[11px] text-amber-300/80 mt-0.5">
                    Raspberry Pi 4 Agent is online, but no MAVLink heartbeat was received from Pixhawk in the last 8 seconds. Verify Pixhawk power and TELEM2 UART wiring (/dev/serial0 @ 57600 baud).
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-amber-300/70">Ensure Pixhawk TELEM2 baud rate = 57600.</span>
                <button
                  onClick={handleSyncNow}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg text-[11px] cursor-pointer"
                >
                  Refresh
                </button>
              </div>
            </div>
          ) : phase === 'PERMISSION_DENIED' ? (
            <div className="mt-3 p-3 bg-rose-950/50 border border-rose-500/50 rounded-xl flex items-center justify-between text-xs text-rose-200">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>USB permission denied. Please allow USB access on your device.</span>
              </div>
              <button
                onClick={handleRequestPermission}
                className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs cursor-pointer"
              >
                Request Permission
              </button>
            </div>
          ) : null}

        </div>
      </div>

      {/* Disconnect Confirmation Modal */}
      {showDisconnectConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 font-mono select-none">
          <div className="bg-slate-900 border-2 border-rose-500/60 rounded-2xl max-w-md w-full p-4 sm:p-6 space-y-4 text-slate-200 shadow-2xl">
            <div className="flex items-start space-x-3">
              <div className="p-2.5 bg-rose-950/80 border border-rose-500/50 rounded-xl text-rose-400 shrink-0">
                <PowerOff className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-white uppercase tracking-wide">
                  Disconnect Link?
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  This will pause the active telemetry session.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                onClick={() => setShowDisconnectConfirm(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                CANCEL
              </button>
              <button
                onClick={handleConfirmDisconnect}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-black text-xs rounded-xl transition flex items-center justify-center space-x-1.5 shadow-lg shadow-rose-600/30 cursor-pointer"
              >
                <PowerOff className="w-4 h-4" />
                <span>DISCONNECT</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
