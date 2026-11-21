import React, { useState, useEffect } from 'react';
import {
  Compass,
  Play,
  CheckCircle2,
  Clock,
  AlertTriangle,
  QrCode,
  Target,
  ShieldCheck,
  RefreshCw,
  Sliders,
  Send
} from 'lucide-react';
import {
  spatialIntelligenceService,
  ReconStageStatus
} from '../../services/spatialIntelligenceService';

interface ReconnaissanceStageControlPanelProps {
  className?: string;
  onOpenConfigModal?: () => void;
}

export const ReconnaissanceStageControlPanel: React.FC<ReconnaissanceStageControlPanelProps> = ({
  className = '',
  onOpenConfigModal
}) => {
  const [status, setStatus] = useState<ReconStageStatus>(() =>
    spatialIntelligenceService.getStageStatus()
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    return spatialIntelligenceService.subscribeStage((updated) => {
      setStatus(updated);
    });
  }, []);

  const handleStartStageA = async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      await spatialIntelligenceService.startStageA();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to start Stage A');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartStageB = async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      await spatialIntelligenceService.startStageB();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to start Stage B');
    } finally {
      setIsLoading(false);
    }
  };

  const getStageBadgeColor = (stage: string) => {
    switch (stage) {
      case 'STAGE_A_COVERAGE':
        return 'bg-sky-500/20 text-sky-400 border-sky-500/40 animate-pulse';
      case 'STAGE_A_COMPLETED':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'STAGE_B_INVESTIGATION':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/40 animate-pulse';
      case 'MISSION_SUCCESS_RTL':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'TIME_EXHAUSTED_RTL':
        return 'bg-rose-500/20 text-rose-400 border-rose-500/40';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  return (
    <div className={`bg-slate-900/90 border border-slate-700/60 rounded-xl p-4 shadow-xl backdrop-blur-md text-white font-mono text-xs ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <Compass className="w-4 h-4 text-sky-400" />
          <h3 className="font-semibold tracking-wider text-slate-100 uppercase">
            Two-Stage Reconnaissance Coordinator
          </h3>
        </div>
        <div className={`px-2.5 py-0.5 rounded-full border text-[10px] font-bold ${getStageBadgeColor(status.stage)}`}>
          {status.stage.replace(/_/g, ' ')}
        </div>
      </div>

      {/* Status Message */}
      <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 mb-3 text-[11px] text-slate-300 flex items-start space-x-2">
        <ShieldCheck className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
        <span>{status.status_message}</span>
      </div>

      {/* Progress & Time Budget */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {/* Coverage Progress */}
        <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/40">
          <span className="text-[10px] text-slate-400 block mb-1">STAGE A COVERAGE</span>
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold text-emerald-400">
              {status.progress.coverage_pct}%
            </span>
            <span className="text-[10px] text-slate-400">
              WP {status.progress.active_waypoint} / {status.progress.total_waypoints}
            </span>
          </div>
        </div>

        {/* 5-Min Time Budget Countdown */}
        <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/40">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px]">TIME BUDGET (300S)</span>
            <Clock className="w-3 h-3 text-amber-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className={`text-sm font-bold ${status.progress.remaining_time_s < 60 ? 'text-rose-400 animate-pulse' : 'text-slate-100'}`}>
              {Math.floor(status.progress.remaining_time_s)}s left
            </span>
            <span className="text-[10px] text-slate-400">
              Elapsed: {Math.floor(status.progress.elapsed_time_s)}s
            </span>
          </div>
        </div>
      </div>

      {/* Verified QR Intelligence Highlight */}
      {status.verified_qr_code && (
        <div className="bg-gradient-to-r from-rose-950/60 to-slate-900 border border-rose-500/50 p-3 rounded-lg mb-3 shadow-[0_0_15px_rgba(244,63,94,0.2)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <QrCode className="w-5 h-5 text-rose-400 animate-bounce" />
              <div>
                <span className="text-[10px] text-rose-300 font-bold uppercase block">
                  Verified Intelligence Decoded:
                </span>
                <span className="text-xl font-extrabold tracking-widest text-white">
                  CODE: [{status.verified_qr_code}]
                </span>
              </div>
            </div>
            <div className="text-right text-[10px] text-slate-400">
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                100% CONFIRMED
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Error notification */}
      {actionError && (
        <div className="bg-rose-950/60 border border-rose-500/50 p-2 rounded mb-3 text-[10px] text-rose-300 flex items-center space-x-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Command Action Buttons */}
      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
        <button
          onClick={handleStartStageA}
          disabled={isLoading || status.stage === 'STAGE_A_COVERAGE'}
          className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center space-x-1.5 transition-all ${
            status.stage === 'STAGE_A_COVERAGE'
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
              : 'bg-sky-600 hover:bg-sky-500 text-white shadow-lg active:scale-95'
          }`}
        >
          <Play className="w-3.5 h-3.5" />
          <span>Stage A: Coverage</span>
        </button>

        <button
          onClick={handleStartStageB}
          disabled={isLoading || status.stage === 'STAGE_B_INVESTIGATION'}
          className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center space-x-1.5 transition-all ${
            status.stage === 'STAGE_B_INVESTIGATION'
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
              : 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg active:scale-95'
          }`}
        >
          <Target className="w-3.5 h-3.5" />
          <span>Stage B: Investigate</span>
        </button>
      </div>
    </div>
  );
};
