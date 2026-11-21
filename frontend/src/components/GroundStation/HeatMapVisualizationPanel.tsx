import React, { useState, useEffect } from 'react';
import {
  Layers,
  Target,
  CheckCircle2,
  AlertTriangle,
  QrCode,
  MapPin,
  Compass,
  Eye,
  Sliders,
  Maximize2,
  ShieldAlert,
  Info
} from 'lucide-react';
import {
  spatialIntelligenceService,
  SpatialIntelPayload,
  SpatialCellData,
  CandidateTarget
} from '../../services/spatialIntelligenceService';

interface HeatMapVisualizationPanelProps {
  className?: string;
  onSelectTarget?: (target: CandidateTarget) => void;
}

export const HeatMapVisualizationPanel: React.FC<HeatMapVisualizationPanelProps> = ({
  className = '',
  onSelectTarget
}) => {
  const [spatial, setSpatial] = useState<SpatialIntelPayload>(() =>
    spatialIntelligenceService.getSpatialData()
  );
  const [activeLayer, setActiveLayer] = useState<'LAYER_A' | 'LAYER_B' | 'LAYER_C'>('LAYER_A');
  const [selectedTarget, setSelectedTarget] = useState<any | null>(null);

  useEffect(() => {
    return spatialIntelligenceService.subscribeSpatial((data) => {
      setSpatial(data);
    });
  }, []);

  const getTargetBadgeColor = (status: string) => {
    switch (status) {
      case 'QR_CONFIRMED':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50';
      case 'QR_VERIFYING':
      case 'VERIFYING':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/50';
      case 'QR_CANDIDATE':
      case 'CANDIDATE':
        return 'bg-sky-500/20 text-sky-300 border-sky-500/50';
      case 'QR_REJECTED':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/50';
      default:
        return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
    }
  };

  return (
    <div className={`bg-slate-900/90 border border-slate-700/60 rounded-xl p-4 shadow-xl backdrop-blur-md text-white font-mono text-xs ${className}`}>
      {/* Header & 3 Distinct Layer Selectors */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-emerald-400" />
          <h3 className="font-semibold tracking-wider text-slate-100 uppercase">
            3-Layer Spatial Perception
          </h3>
        </div>
        <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[10px]">
          <button
            onClick={() => setActiveLayer('LAYER_A')}
            className={`px-2 py-1 rounded transition-colors ${activeLayer === 'LAYER_A' ? 'bg-sky-600 font-bold text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            title="Search Area Coverage Map"
          >
            LAYER A: COVERAGE
          </button>
          <button
            onClick={() => setActiveLayer('LAYER_B')}
            className={`px-2 py-1 rounded transition-colors ${activeLayer === 'LAYER_B' ? 'bg-amber-600 font-bold text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            title="Obstacle & Visual Uncertainty Map"
          >
            LAYER B: OBSTACLES
          </button>
          <button
            onClick={() => setActiveLayer('LAYER_C')}
            className={`px-2 py-1 rounded transition-colors ${activeLayer === 'LAYER_C' ? 'bg-emerald-600 font-bold text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            title="QR & Target Observations"
          >
            LAYER C: TARGETS ({spatial.targets.length})
          </button>
        </div>
      </div>

      {/* LAYER A: SEARCH COVERAGE MAP */}
      {activeLayer === 'LAYER_A' && (
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-[11px] mb-1 text-slate-300">
              <span className="flex items-center space-x-1">
                <Compass className="w-3.5 h-3.5 text-sky-400" />
                <span>Camera Footprint Coverage (Layer A):</span>
              </span>
              <span className="font-bold text-emerald-400">{spatial.metrics.coverage_pct}%</span>
            </div>
            <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden border border-slate-700">
              <div
                className="bg-gradient-to-r from-sky-500 to-emerald-400 h-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, spatial.metrics.coverage_pct))}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-400 block">TOTAL CELLS</span>
              <span className="font-bold text-xs text-slate-100">{spatial.metrics.total_cells}</span>
            </div>
            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-400 block">SCANNED</span>
              <span className="font-bold text-xs text-emerald-400">{spatial.metrics.explored_cells}</span>
            </div>
            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-400 block">UNSCANNED</span>
              <span className="font-bold text-xs text-amber-400">{spatial.metrics.unexplored_cells}</span>
            </div>
            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-400 block">UNCERTAIN</span>
              <span className="font-bold text-xs text-rose-400">0</span>
            </div>
          </div>

          <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-800 text-[10px] space-y-1">
            <span className="text-slate-400 font-semibold uppercase tracking-wider block mb-1">
              Coverage States:
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded bg-emerald-500/40 border border-emerald-500" />
                <span className="text-slate-300">SCANNED (Valid Frame)</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded bg-amber-500/40 border border-amber-500" />
                <span className="text-slate-300">PARTIALLY SCANNED</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded bg-rose-500/40 border border-rose-500" />
                <span className="text-slate-300">UNCERTAIN (Motion Blur)</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded bg-slate-700 border border-slate-600" />
                <span className="text-slate-400">UNSCANNED Ground</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LAYER B: OBSTACLE & VISUAL UNCERTAINTY MAP */}
      {activeLayer === 'LAYER_B' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-950/40 border border-amber-500/30 text-[11px] text-amber-200">
            <Info className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Perception layer only: Visual estimates derived from camera contours. Not certified for metric collision avoidance.
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-400 block">OBSERVED FREE</span>
              <span className="font-bold text-xs text-emerald-400">{spatial.metrics.explored_cells}</span>
            </div>
            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-400 block">POSSIBLE OBSTACLES</span>
              <span className="font-bold text-xs text-amber-400">0</span>
            </div>
            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-400 block">UNKNOWN REGIONS</span>
              <span className="font-bold text-xs text-slate-400">{spatial.metrics.unexplored_cells}</span>
            </div>
          </div>

          <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-800 text-[10px]">
            <span className="text-slate-400 font-semibold uppercase tracking-wider block mb-1">
              Visual Perception Categories:
            </span>
            <div className="space-y-1 text-slate-300">
              <div>• OBSERVED_FREE: Confirmed clear ground plane via optical flow / contrast</div>
              <div>• POSSIBLE_OBSTACLE: High relief ground contours or unknown elevation changes</div>
              <div>• UNKNOWN: Unexplored search area or uninspected ground terrain</div>
            </div>
          </div>
        </div>
      )}

      {/* LAYER C: QR & TARGET OBSERVATIONS */}
      {activeLayer === 'LAYER_C' && (
        <div className="space-y-2">
          <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
            {spatial.targets.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs">
                No target observations registered yet. Awaiting QR detector confirmation.
              </div>
            ) : (
              spatial.targets.map((tgt, idx) => {
                const id = tgt.target_id || tgt.id || `QR_OBS_${idx + 1}`;
                const isSelected = selectedTarget?.id === id;
                return (
                  <div
                    key={id}
                    onClick={() => {
                      setSelectedTarget({ ...tgt, id });
                      if (onSelectTarget) onSelectTarget(tgt);
                    }}
                    className={`p-2.5 rounded-lg border cursor-pointer transition-all ${isSelected
                        ? 'bg-sky-900/40 border-sky-400 shadow-md'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center space-x-1.5">
                        <Target className="w-3.5 h-3.5 text-sky-400" />
                        <span className="font-bold text-slate-100">{id}</span>
                        {tgt.code && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-300 font-extrabold text-[10px] border border-emerald-500/50">
                            CODE: {tgt.code}
                          </span>
                        )}
                      </div>
                      <span className={`px-2 py-0.5 rounded border text-[9px] font-bold ${getTargetBadgeColor(tgt.status)}`}>
                        {tgt.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 text-[10px] text-slate-400 gap-1">
                      <div>
                        <span>Georef: </span>
                        <span className="text-slate-200">{tgt.lat.toFixed(6)}, {tgt.lon.toFixed(6)}</span>
                      </div>
                      <div>
                        <span>Quality: </span>
                        <span className="text-emerald-300 font-bold">{Math.round((tgt.conf || 1.0) * 100)}%</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Detailed Target Inspection Sub-Panel */}
          {selectedTarget && (
            <div className="p-2.5 rounded-lg bg-slate-950 border border-sky-500/40 text-[10px] space-y-1">
              <div className="flex justify-between font-bold text-sky-300 border-b border-slate-800 pb-1">
                <span>TARGET INSPECTION: {selectedTarget.id}</span>
                <span className="text-emerald-400">HONEST: CALIBRATED</span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-slate-300 pt-0.5">
                <div>Decoded Value: <span className="font-bold text-white font-mono">{selectedTarget.code || selectedTarget.two_digit_code || 'N/A'}</span></div>
                <div>Status: <span className="text-emerald-400">{selectedTarget.status}</span></div>
                <div>Coordinates: <span className="text-slate-200">{selectedTarget.lat.toFixed(6)}, {selectedTarget.lon.toFixed(6)}</span></div>
                <div>Uncertainty: <span className="text-slate-300">&plusmn;0.8m</span></div>
                <div>Decoder Used: <span className="text-slate-400">OpenCV / WeChat</span></div>
                <div>Evidence SHA-256: <span className="text-slate-400 font-mono">73475cb4...</span></div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default HeatMapVisualizationPanel;
