import React, { useState, useEffect } from 'react';
import { PixhawkConnectionState } from '../../types/mavlink';
import { RunnerLinkState } from '../../types/runner';
import { DroneTelemetry } from '../../types/mission';
import { Wifi, Radio, Activity, Video, Smartphone, Cpu, Signal, Cloud } from 'lucide-react';
import { spatialIntelligenceService, CommunicationDiagnosticsData } from '../../services/spatialIntelligenceService';

interface ConnectionStatusDeckProps {
  pixhawkState: PixhawkConnectionState;
  runnerLink: RunnerLinkState;
  telemetry: DroneTelemetry;
  videoState?: 'LIVE' | 'CONNECTING' | 'DISCONNECTED';
  className?: string;
}

interface StatusItemProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  status: 'ok' | 'warn' | 'error' | 'idle';
}

const StatusItem: React.FC<StatusItemProps> = ({ icon, label, value, status }) => {
  const colors = {
    ok: 'text-emerald-400 bg-emerald-950/50 border-emerald-500/30',
    warn: 'text-amber-400 bg-amber-950/50 border-amber-500/30 animate-pulse',
    error: 'text-rose-400 bg-rose-950/50 border-rose-500/30',
    idle: 'text-slate-400 bg-slate-800/50 border-slate-700/50',
  };

  const dotColors = {
    ok: 'bg-emerald-400',
    warn: 'bg-amber-400 animate-ping',
    error: 'bg-rose-400',
    idle: 'bg-slate-500',
  };

  return (
    <div className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[11px] font-mono ${colors[status]}`}>
      <div className="flex items-center space-x-1.5">
        <span className="opacity-80">{icon}</span>
        <span className="font-bold uppercase text-[10px] tracking-wide text-slate-300">{label}</span>
      </div>
      <div className="flex items-center space-x-1.5">
        <span className="font-black truncate max-w-[80px]" title={value}>{value}</span>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColors[status]}`} />
      </div>
    </div>
  );
};

export const ConnectionStatusDeck: React.FC<ConnectionStatusDeckProps> = ({
  pixhawkState,
  runnerLink,
  telemetry,
  videoState = 'DISCONNECTED',
  className = '',
}) => {
  const [commDiag, setCommDiag] = useState<CommunicationDiagnosticsData>(() =>
    spatialIntelligenceService.getDiagnostics()
  );

  useEffect(() => {
    return spatialIntelligenceService.subscribeDiagnostics(setCommDiag);
  }, []);

  const isWifiOn = commDiag.wifi_connected || (typeof navigator !== 'undefined' && navigator.onLine);
  const wifiLabel = commDiag.wifi_ssid && commDiag.wifi_ssid !== 'Not Connected' && commDiag.wifi_ssid !== 'Unknown' 
    ? commDiag.wifi_ssid 
    : (pixhawkState.wifiSsid || 'HOTSPOT');
  const isMavlinkUp = pixhawkState.isConnected;
  const isPixhawkUp = pixhawkState.isConnected;
  const isConnecting = pixhawkState.phase === 'CONNECTING' || pixhawkState.phase === 'RECONNECTING';
  const satsCount = telemetry.gps?.satellites ?? telemetry.satellitesVisible ?? 0;
  const isGpsLocked = Boolean((telemetry.gps?.isLocked || satsCount >= 6) && satsCount > 0);
  const isRunnerUp = runnerLink.isConnected;
  const isCloudUp = commDiag.cloud_accessible || false;

  return (
    <div className={`bg-[#161B22]/90 border border-[var(--uav-card-border)] rounded-xl p-2.5 space-y-1.5 ${className}`}>
      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 pb-1">
        UNIFIED CONNECTION STATUS MONITORING
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 gap-1.5">
        {/* 1. Wi-Fi */}
        <StatusItem
          icon={<Wifi className="w-3.5 h-3.5" />}
          label="Wi-Fi"
          value={isWifiOn ? (wifiLabel || 'CONNECTED') : 'DISCONNECTED'}
          status={isWifiOn ? 'ok' : 'error'}
        />

        {/* 2. MAVLink */}
        <StatusItem
          icon={<Radio className="w-3.5 h-3.5" />}
          label="MAVLink"
          value={isMavlinkUp ? 'CONNECTED' : isConnecting ? 'CONNECTING' : 'NOT CONNECTED'}
          status={isMavlinkUp ? 'ok' : isConnecting ? 'warn' : 'error'}
        />

        {/* 3. Pixhawk */}
        <StatusItem
          icon={<Cpu className="w-3.5 h-3.5" />}
          label="Pixhawk"
          value={isPixhawkUp ? 'CONNECTED' : isConnecting ? 'CONNECTING' : 'NOT CONNECTED'}
          status={isPixhawkUp ? 'ok' : isConnecting ? 'warn' : 'error'}
        />

        {/* 4. GPS */}
        <StatusItem
          icon={<Signal className="w-3.5 h-3.5" />}
          label="GPS"
          value={
            !isPixhawkUp
              ? 'STATUS UNAVAILABLE'
              : isGpsLocked
              ? `LOCKED (${satsCount} SATS)`
              : satsCount > 0
              ? `ACQUIRING (${satsCount})`
              : 'NO FIX'
          }
          status={
            !isPixhawkUp
              ? 'idle'
              : isGpsLocked
              ? 'ok'
              : satsCount > 0
              ? 'warn'
              : 'error'
          }
        />

        {/* 5. Drone Port */}
        <StatusItem
          icon={<Video className="w-3.5 h-3.5" />}
          label="Drone Port"
          value={
            videoState === 'LIVE'
              ? 'STREAMING ACTIVE'
              : videoState === 'CONNECTING'
              ? 'STARTING'
              : 'STREAMING OFF'
          }
          status={
            videoState === 'LIVE'
              ? 'ok'
              : videoState === 'CONNECTING'
              ? 'warn'
              : 'error'
          }
        />

        {/* Optional Node: Cloud Sync */}
        <StatusItem
          icon={<Cloud className="w-3.5 h-3.5" />}
          label="Cloud Sync"
          value={isCloudUp ? 'SYNCED' : commDiag.spooled_packets_count ? `${commDiag.spooled_packets_count} SPOOLED` : 'OFFLINE'}
          status={isCloudUp ? 'ok' : commDiag.spooled_packets_count ? 'warn' : 'idle'}
        />

        {/* Optional Node: Field Runner */}
        <StatusItem
          icon={<Activity className="w-3.5 h-3.5" />}
          label="Runner P2P"
          value={isRunnerUp ? 'CONNECTED' : 'WAITING'}
          status={isRunnerUp ? 'ok' : 'idle'}
        />
      </div>
    </div>
  );
};

