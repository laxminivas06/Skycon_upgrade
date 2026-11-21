import React, { useState, useEffect } from 'react';
import {
  Radio,
  Wifi,
  Activity,
  ArrowUpRight,
  ArrowDownLeft,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Clock,
  Cpu,
  Layers
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

  useEffect(() => {
    return spatialIntelligenceService.subscribeDiagnostics((updated) => {
      setDiag(updated);
    });
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'HEALTHY':
        return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
      case 'DEGRADED':
        return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
      case 'CRITICAL':
        return 'text-rose-400 border-rose-500/30 bg-rose-500/10';
      default:
        return 'text-slate-400 border-slate-600/30 bg-slate-800/40';
    }
  };

  return (
    <div className={`bg-slate-900/90 border border-slate-700/60 rounded-xl p-4 shadow-xl backdrop-blur-md text-white font-mono text-xs ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <Radio className="w-4 h-4 text-sky-400 animate-pulse" />
          <h3 className="font-semibold tracking-wider text-slate-100 uppercase">
            ESP32-S3 Wireless Telemetry Diagnostics
          </h3>
        </div>
        <div className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${getStatusColor(diag.health_status)}`}>
          {diag.health_status}
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        {/* Link Status */}
        <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/40">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px]">ESP32-S3 BRIDGE</span>
            <Cpu className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="flex items-center space-x-1.5">
            <div className={`w-2 h-2 rounded-full ${diag.esp32_connected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-rose-500'}`} />
            <span className="font-bold text-sm text-slate-100">
              {diag.esp32_connected ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
        </div>

        {/* Wi-Fi & RSSI */}
        <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/40">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px]">2.4GHz RF RSSI</span>
            <Wifi className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-sm font-bold text-slate-100">
            {diag.rssi_dbm} <span className="text-[10px] text-slate-400 font-normal">dBm</span>
          </div>
        </div>

        {/* Round-Trip Latency */}
        <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/40">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px]">AVG RTT LATENCY</span>
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-sm font-bold text-slate-100">
            {diag.avg_latency_ms} <span className="text-[10px] text-slate-400 font-normal">ms</span>
          </div>
        </div>

        {/* Packet Loss */}
        <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/40">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px]">PACKET LOSS</span>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-sm font-bold text-slate-100">
            {diag.packet_loss_rate}%
          </div>
        </div>
      </div>

      {/* Packet Counters Grid */}
      <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-400 flex items-center space-x-1">
            <ArrowUpRight className="w-3 h-3 text-sky-400" />
            <span>Packets Transmitted (TX):</span>
          </span>
          <span className="font-semibold text-slate-200">{diag.packets_transmitted.toLocaleString()}</span>
        </div>

        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-400 flex items-center space-x-1">
            <ArrowDownLeft className="w-3 h-3 text-emerald-400" />
            <span>Packets Received (RX):</span>
          </span>
          <span className="font-semibold text-slate-200">{diag.packets_received.toLocaleString()}</span>
        </div>

        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-400 flex items-center space-x-1">
            <RefreshCw className="w-3 h-3 text-amber-400" />
            <span>Retries Dispatched:</span>
          </span>
          <span className="font-semibold text-amber-300">{diag.retries_count}</span>
        </div>

        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-400 flex items-center space-x-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>Acknowledgements (ACKs):</span>
          </span>
          <span className="font-semibold text-emerald-300">{diag.acks_received}</span>
        </div>

        <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-800 text-slate-500">
          <span className="flex items-center space-x-1">
            <Clock className="w-2.5 h-2.5" />
            <span>Last Packet Received:</span>
          </span>
          <span>{diag.last_rx_age_ms >= 0 ? `${diag.last_rx_age_ms} ms ago` : 'N/A'}</span>
        </div>
      </div>
    </div>
  );
};
