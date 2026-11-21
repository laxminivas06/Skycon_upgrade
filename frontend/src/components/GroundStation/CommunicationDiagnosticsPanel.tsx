import React, { useState, useEffect } from 'react';
import {
  Wifi,
  Radio,
  Activity,
  ArrowUpRight,
  ArrowDownLeft,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Clock,
  Cpu,
  Globe,
  Cloud,
  ShieldCheck,
  Server
} from 'lucide-react';
import {
  spatialIntelligenceService,
  CommunicationDiagnosticsData
} from '../../services/spatialIntelligenceService';

interface CommunicationDiagnosticsPanelProps {
  className?: string;
}

export const CommunicationDiagnosticsPanel: React.FC<CommunicationDiagnosticsPanelProps> = ({
  className = ''
}) => {
  const [diag, setDiag] = useState<CommunicationDiagnosticsData>(() =>
    spatialIntelligenceService.getDiagnostics()
  );
  const [isProbing, setIsProbing] = useState<boolean>(false);

  useEffect(() => {
    // Initial fetch from backend
    spatialIntelligenceService.fetchNetworkDiagnostics().then(setDiag).catch(() => {});

    // Periodic subscription
    const unsubscribe = spatialIntelligenceService.subscribeDiagnostics((updated) => {
      setDiag(updated);
    });

    const interval = setInterval(() => {
      spatialIntelligenceService.fetchNetworkDiagnostics().then(setDiag).catch(() => {});
    }, 2500);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const handleManualReconnect = async () => {
    setIsProbing(true);
    try {
      const res = await fetch('/api/network/reconnect', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        await spatialIntelligenceService.fetchNetworkDiagnostics().then(setDiag);
      }
    } catch (e) {
      console.error('Manual reconnect trigger error:', e);
    } finally {
      setIsProbing(false);
    }
  };

  const netState = diag.network_state || (diag.wifi_connected && diag.internet_accessible ? 'ONLINE' : 'OFFLINE');

  const getStatusBadge = (state: string) => {
    switch (state) {
      case 'ONLINE':
        return {
          text: 'ONLINE',
          classes: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10 shadow-[0_0_12px_rgba(52,211,153,0.3)]',
          dot: 'bg-emerald-400'
        };
      case 'RECONNECTING':
        return {
          text: 'RECONNECTING',
          classes: 'text-amber-400 border-amber-500/40 bg-amber-500/10 animate-pulse',
          dot: 'bg-amber-400 animate-ping'
        };
      case 'STALE':
        return {
          text: 'STALE',
          classes: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
          dot: 'bg-amber-300'
        };
      case 'OFFLINE':
        return {
          text: 'OFFLINE',
          classes: 'text-rose-400 border-rose-500/40 bg-rose-500/10',
          dot: 'bg-rose-500'
        };
      default:
        return {
          text: 'UNKNOWN',
          classes: 'text-slate-400 border-slate-700 bg-slate-800/40',
          dot: 'bg-slate-500'
        };
    }
  };

  const badge = getStatusBadge(netState);

  return (
    <div className={`bg-slate-900/95 border border-slate-700/60 rounded-xl p-4 shadow-2xl backdrop-blur-md text-white font-mono text-xs ${className}`}>
      {/* 1. Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 rounded-lg bg-sky-500/20 border border-sky-500/30 text-sky-400">
            <Wifi className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h3 className="font-bold tracking-wider text-slate-100 uppercase text-xs">
              Raspberry Pi 4 Mobile Hotspot & Cloud Network
            </h3>
            <p className="text-[10px] text-slate-400 tracking-normal">
              Broadcom BCM43455 2.4GHz (wlan0) &rarr; PythonAnywhere Cloud GCS
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleManualReconnect}
            disabled={isProbing}
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600/50 text-[10px] text-slate-300 transition active:scale-95 disabled:opacity-50"
            title="Probe network and trigger OS auto-reconnect"
          >
            <RefreshCw className={`w-3 h-3 ${isProbing ? 'animate-spin text-sky-400' : 'text-slate-400'}`} />
            <span>{isProbing ? 'PROBING...' : 'PROBE / RECONNECT'}</span>
          </button>
          <div className={`px-2.5 py-0.5 rounded-full border text-[10px] font-black flex items-center space-x-1.5 ${badge.classes}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
            <span>{badge.text}</span>
          </div>
        </div>
      </div>

      {/* 2. Primary 4-Cell Telemetry Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-3">
        {/* Hotspot Wi-Fi SSID & IP */}
        <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/40">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold">ACTIVE HOTSPOT</span>
            <Wifi className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="font-bold text-sm text-slate-100 truncate" title={diag.wifi_ssid || 'No Hotspot'}>
            {diag.wifi_ssid || 'DISCONNECTED'}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-between">
            <span>Priority: <strong className="text-sky-300">P{diag.active_priority || 1}</strong></span>
            <span>IP: {diag.ip_address || (diag.wifi_connected ? '192.168.43.x' : 'None')}</span>
          </div>
        </div>

        {/* 2.4GHz RF Signal Strength */}
        <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/40">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold">RF RSSI / SIGNAL</span>
            <Radio className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="flex items-baseline space-x-1.5">
            <span className="text-sm font-bold text-slate-100">
              {diag.wifi_connected ? diag.rssi_dbm : -99}
            </span>
            <span className="text-[10px] text-slate-400">dBm</span>
            {diag.wifi_connected && (
              <span className="text-[10px] font-semibold text-emerald-400 ml-1">
                ({diag.signal_strength_pct ?? Math.max(0, Math.min(100, Math.round(((diag.rssi_dbm + 100) * 100) / 70)))}%)
              </span>
            )}
          </div>
          <div className="w-full bg-slate-900 rounded-full h-1.5 mt-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                !diag.wifi_connected ? 'w-0' : diag.rssi_dbm > -65 ? 'bg-emerald-400' : diag.rssi_dbm > -80 ? 'bg-amber-400' : 'bg-rose-500'
              }`}
              style={{
                width: `${diag.wifi_connected ? Math.max(5, Math.min(100, Math.round(((diag.rssi_dbm + 100) * 100) / 70))) : 0}%`
              }}
            />
          </div>
        </div>

        {/* Internet Reachability */}
        <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/40">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold">INTERNET ROUTE</span>
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="flex items-center space-x-1.5 mt-0.5">
            <div className={`w-2 h-2 rounded-full ${diag.internet_accessible ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-rose-500'}`} />
            <span className="font-bold text-sm text-slate-100">
              {diag.internet_accessible ? 'ONLINE' : 'UNAVAILABLE'}
            </span>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            DNS: 8.8.8.8:53 ({diag.internet_accessible ? 'PASS' : 'TIMEOUT'})
          </div>
        </div>

        {/* Cloud Sync (PythonAnywhere) */}
        <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/40">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold">PYTHONANYWHERE CLOUD</span>
            <Cloud className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="flex items-center space-x-1.5 mt-0.5">
            <div className={`w-2 h-2 rounded-full ${diag.cloud_accessible ? 'bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.8)]' : 'bg-amber-400'}`} />
            <span className="font-bold text-sm text-slate-100">
              {diag.cloud_accessible ? 'CONNECTED' : (diag.spooled_packets_count ? 'SPOOLING' : 'IDLE')}
            </span>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 flex justify-between">
            <span>HB: {diag.last_heartbeat_age_s !== undefined && diag.last_heartbeat_age_s < 900 ? `${diag.last_heartbeat_age_s.toFixed(1)}s` : 'N/A'}</span>
            <span className="text-amber-300 font-semibold">{diag.spooled_packets_count || 0} spooled</span>
          </div>
        </div>
      </div>

      {/* 3. Reconnection Watchdog Sub-Bar */}
      <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800 mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center space-x-2">
          <Activity className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span className="text-slate-300 font-semibold">Watchdog Auto-Reconnection:</span>
          {diag.reconnection_in_progress ? (
            <span className="text-amber-400 font-bold animate-pulse">
              ACTIVE (Attempt #{diag.reconnect_attempts || 1})
            </span>
          ) : (
            <span className="text-emerald-400 font-bold">MONITORING (Standby)</span>
          )}
        </div>
        <div className="flex items-center space-x-4 text-[10px] text-slate-400">
          {diag.last_disconnection_time ? (
            <span>
              Last Drop: <strong className="text-slate-200">{Math.round((Date.now() - diag.last_disconnection_time * 1000) / 1000)}s ago</strong>
            </span>
          ) : (
            <span>Link Drops: <strong className="text-slate-200">0 since boot</strong></span>
          )}
          <span>
            Telemetry Latency: <strong className="text-slate-200">{diag.avg_latency_ms.toFixed(1)} ms</strong>
          </span>
        </div>
      </div>

      {/* 3B. Multi-Hotspot Sequential Failover & Stability Status */}
      <div className="bg-slate-950/50 p-2 rounded-lg border border-slate-800/80 mb-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400">
        <div className="flex items-center space-x-2">
          <Server className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <span className="font-semibold text-slate-300">Hotspot Failover Queue:</span>
          <span className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20 font-bold">
            P1 Primary
          </span>
          <span className="text-slate-600">&rarr;</span>
          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
            P2 Secondary
          </span>
          <span className="text-slate-600">&rarr;</span>
          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
            P3 Backup
          </span>
        </div>
        <div className="flex items-center space-x-3 text-[10px]">
          <span>Failovers: <strong className="text-slate-200">{diag.failover_count || 0}</strong></span>
          <span>Switch Latency: <strong className="text-slate-200">{(diag.reconnect_latency_s ?? 0).toFixed(1)}s</strong></span>
          <span>Anti-Thrashing: <strong className="text-emerald-400">60s Hysteresis</strong></span>
        </div>
      </div>

      {/* 4. Local-First Flight Safety Guarantee Banner */}
      <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-lg p-2.5 flex items-start space-x-2">
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-[10px] text-emerald-200/90 leading-relaxed">
          <strong className="text-emerald-300 uppercase tracking-wide">Local-First Safety Guard:</strong> Pixhawk MAVLink communication, autonomous flight stabilization, onboard computer vision, and emergency RTL procedures execute <strong className="underline">100% locally</strong> on the Raspberry Pi 4. The mobile hotspot and cloud relay are used strictly for telemetry mirroring and remote GCS polling.
        </div>
      </div>
    </div>
  );
};
