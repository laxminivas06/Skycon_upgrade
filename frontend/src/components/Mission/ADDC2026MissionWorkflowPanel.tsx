import React, { useState, useEffect } from 'react';
import {
  Shield,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Compass,
  QrCode,
  KeyRound,
  Unlock,
  PackageCheck,
  Navigation,
  AlertTriangle,
  Send,
  UploadCloud,
  Check
} from 'lucide-react';

interface ADDC2026WorkflowProps {
  className?: string;
}

export const ADDC2026MissionWorkflowPanel: React.FC<ADDC2026WorkflowProps> = ({ className = '' }) => {
  const [stages, setStages] = useState<string[]>([]);
  const [currentStage, setCurrentStage] = useState<string>('STAGE_1_MARSHAL_AUTH');
  const [missionStatus, setMissionStatus] = useState<any>(null);
  const [marshalId, setMarshalId] = useState<string>('MARSHAL-01');
  const [puzzleInput, setPuzzleInput] = useState<string>('');
  const [operatorId, setOperatorId] = useState<string>('FIELD_RUNNER_1');
  const [planResult, setPlanResult] = useState<any>(null);
  const [isPlanning, setIsPlanning] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Poll mission status & stages
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/mission/status');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.status) {
          setMissionStatus(json.status);
          if (json.status.addcStage) {
            setCurrentStage(json.status.addcStage);
          }
        }
      }
    } catch {
      // Ignore network errors in simulation or offline mode
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 1500);
    return () => clearInterval(interval);
  }, []);

  const handleMarshalAuth = async () => {
    try {
      const res = await fetch('/api/mission/marshal-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marshalId, signature: 'MARSHAL_VERIFIED' })
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage(`Marshal ${marshalId} verified.`);
        fetchStatus();
      }
    } catch (e: any) {
      setActionMessage(`Marshal auth failed: ${e.message}`);
    }
  };

  const handleGeneratePlan = async () => {
    setIsPlanning(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/navigation/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boundary_type: 'CIRCLE',
          radius: 15.0,
          altitude: 10.0,
          speed: 3.5,
          overlap: 0.25,
          strategy: 'BOUSTROPHEDON'
        })
      });
      const data = await res.json();
      if (data.success) {
        setPlanResult(data.plan);
        setActionMessage(`Plan generated: ${data.plan.total_waypoints} WPs (${data.plan.estimated_flight_time_s}s)`);
      }
    } catch (e: any) {
      setActionMessage(`Planning error: ${e.message}`);
    } finally {
      setIsPlanning(false);
    }
  };

  const handleUploadPixhawk = async () => {
    if (!planResult?.waypoints) return;
    setIsUploading(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/mission/upload-to-pixhawk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waypoints: planResult.waypoints })
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage(`Uploaded ${data.waypointCount} waypoints to Pixhawk MAVLink memory.`);
        fetchStatus();
      } else {
        setActionMessage(`Upload failed: ${data.error}`);
      }
    } catch (e: any) {
      setActionMessage(`Upload error: ${e.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmitPuzzle = async () => {
    if (!/^\d{2}$/.test(puzzleInput)) {
      setActionMessage('Ground puzzle code must be exactly 2 numerical digits (00-99).');
      return;
    }
    try {
      const res = await fetch('/api/mission/ground-puzzle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puzzleCode: puzzleInput, operativeId: operatorId })
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage(`4-digit code compiled: ${data.combinedAccessCode}`);
        setPuzzleInput('');
        fetchStatus();
      } else {
        setActionMessage(`Error: ${data.error}`);
      }
    } catch (e: any) {
      setActionMessage(`Submission error: ${e.message}`);
    }
  };

  const handleConfirmUnlock = async () => {
    try {
      const res = await fetch('/api/mission/confirm-unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorId })
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage('Cache unlock confirmed by field operative.');
        fetchStatus();
      }
    } catch (e: any) {
      setActionMessage(`Unlock error: ${e.message}`);
    }
  };

  const handleConfirmRetrieval = async () => {
    try {
      const res = await fetch('/api/mission/confirm-retrieval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorId })
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage('Package secured! Drone executing autonomous RTL to finish zone.');
        fetchStatus();
      }
    } catch (e: any) {
      setActionMessage(`Retrieval error: ${e.message}`);
    }
  };

  return (
    <div className={`bg-slate-900/95 border border-slate-700/80 rounded-xl p-4 shadow-2xl backdrop-blur-md text-white font-mono text-xs ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <Navigation className="w-4 h-4 text-sky-400" />
          <h3 className="font-bold tracking-wider text-slate-100 uppercase">
            SAE INDIA ADDC 2026 Mission Controller
          </h3>
        </div>
        <div className="flex items-center space-x-2">
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            {currentStage.replace(/_/g, ' ')}
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
            {missionStatus?.state || 'IDLE'}
          </span>
        </div>
      </div>

      {actionMessage && (
        <div className="mb-3 px-3 py-1.5 rounded bg-sky-950/70 border border-sky-800 text-[11px] text-sky-200">
          {actionMessage}
        </div>
      )}

      {/* Grid: Planning + Workflow */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left Column: Mission Generation & Pre-flight */}
        <div className="space-y-3">
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <h4 className="text-[11px] font-bold text-slate-300 uppercase mb-2 flex items-center space-x-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>1. Flight Marshal Authorization</span>
            </h4>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={marshalId}
                onChange={(e) => setMarshalId(e.target.value)}
                placeholder="Marshal ID"
                className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-slate-100 w-full focus:outline-none focus:border-sky-500"
              />
              <button
                onClick={handleMarshalAuth}
                disabled={missionStatus?.marshalAuthorized}
                className={`px-3 py-1 rounded font-bold shrink-0 flex items-center space-x-1 ${
                  missionStatus?.marshalAuthorized
                    ? 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 cursor-default'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                {missionStatus?.marshalAuthorized ? <Check className="w-3.5 h-3.5" /> : null}
                <span>{missionStatus?.marshalAuthorized ? 'Authorized' : 'Authorize'}</span>
              </button>
            </div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <h4 className="text-[11px] font-bold text-slate-300 uppercase mb-2 flex items-center space-x-1.5">
              <Compass className="w-3.5 h-3.5 text-sky-400" />
              <span>2. Boustrophedon Reconnaissance Path</span>
            </h4>
            <div className="space-y-2 text-[11px] text-slate-400">
              <div className="flex justify-between">
                <span>Pattern:</span>
                <span className="text-slate-200">Parallel Sweeps (25% overlap)</span>
              </div>
              <div className="flex justify-between">
                <span>Target Altitude:</span>
                <span className="text-slate-200">10.0m AGL</span>
              </div>
              <div className="flex justify-between">
                <span>Search Boundary:</span>
                <span className="text-slate-200">Circular (R=15m)</span>
              </div>
              {planResult && (
                <div className="p-2 rounded bg-slate-900/80 border border-slate-800 text-slate-300 space-y-1">
                  <div className="flex justify-between">
                    <span>Waypoints:</span>
                    <span className="text-sky-300 font-bold">{planResult.total_waypoints}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Est. Duration:</span>
                    <span className="text-amber-300 font-bold">{planResult.estimated_flight_time_s}s</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Budget Feasible:</span>
                    <span className={planResult.is_feasible_budget ? 'text-emerald-400' : 'text-rose-400'}>
                      {planResult.is_feasible_budget ? 'YES (<300s)' : 'NO (Exceeds budget)'}
                    </span>
                  </div>
                </div>
              )}
              <div className="flex space-x-2 pt-1">
                <button
                  onClick={handleGeneratePlan}
                  disabled={isPlanning}
                  className="flex-1 py-1.5 rounded bg-sky-600 hover:bg-sky-500 font-bold text-white text-center transition"
                >
                  {isPlanning ? 'Planning...' : 'Generate & Validate'}
                </button>
                <button
                  onClick={handleUploadPixhawk}
                  disabled={!planResult || isUploading}
                  className="flex-1 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-bold text-white text-center transition flex items-center justify-center space-x-1"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>{isUploading ? 'Uploading...' : 'Upload MAVLink'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: 4-Digit Intelligence Access Code Workflow */}
        <div className="space-y-3">
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <h4 className="text-[11px] font-bold text-slate-300 uppercase mb-2 flex items-center space-x-1.5">
              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
              <span>3. 4-Digit Cache Access Code Workflow</span>
            </h4>

            {/* Aerial QR 2-digit status */}
            <div className="space-y-2.5">
              <div className="p-2 rounded bg-slate-900 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <QrCode className="w-4 h-4 text-sky-400" />
                  <div>
                    <div className="text-[10px] text-slate-400">Aerial Drone QR (2 digits)</div>
                    <div className="text-sm font-bold text-sky-300">
                      {missionStatus?.aerialQrCode ? `"${missionStatus.aerialQrCode}"` : 'Awaiting Detection...'}
                    </div>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  missionStatus?.aerialQrCode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
                }`}>
                  {missionStatus?.aerialQrCode ? 'VERIFIED' : 'PENDING'}
                </span>
              </div>

              {/* Ground puzzle input */}
              <div className="p-2 rounded bg-slate-900 border border-slate-800 space-y-1.5">
                <div className="text-[10px] text-slate-400">Ground Operative Puzzle Solution (2 digits)</div>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    maxLength={2}
                    value={puzzleInput}
                    onChange={(e) => setPuzzleInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 89"
                    className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-slate-100 font-bold text-center tracking-widest w-20 focus:outline-none focus:border-amber-500"
                  />
                  <input
                    type="text"
                    value={operatorId}
                    onChange={(e) => setOperatorId(e.target.value)}
                    placeholder="Operative ID"
                    className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200 text-[10px] flex-1 focus:outline-none"
                  />
                  <button
                    onClick={handleSubmitPuzzle}
                    disabled={!missionStatus?.aerialQrCode || puzzleInput.length !== 2}
                    className="px-3 py-1 rounded font-bold bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-slate-950 shrink-0"
                  >
                    Combine
                  </button>
                </div>
              </div>

              {/* Combined 4-Digit Access Code */}
              <div className="p-2.5 rounded bg-amber-950/30 border border-amber-600/40 text-center">
                <div className="text-[10px] text-amber-300/80 uppercase">Confirmed 4-Digit Cache Code</div>
                <div className="text-2xl font-black text-amber-400 tracking-widest my-0.5">
                  {missionStatus?.combinedAccessCode || '----'}
                </div>
                <div className="text-[10px] text-slate-400">
                  {missionStatus?.accessCodeVerified ? 'Ready to Unlock Intelligence Cache' : 'Awaiting Complete Combination'}
                </div>
              </div>

              {/* Cache Unlock & Package Retrieval Confirmations */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={handleConfirmUnlock}
                  disabled={!missionStatus?.accessCodeVerified || missionStatus?.cacheUnlocked}
                  className={`py-2 rounded font-bold flex items-center justify-center space-x-1.5 ${
                    missionStatus?.cacheUnlocked
                      ? 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/40'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40'
                  }`}
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>{missionStatus?.cacheUnlocked ? 'Cache Unlocked' : 'Confirm Unlock'}</span>
                </button>
                <button
                  onClick={handleConfirmRetrieval}
                  disabled={!missionStatus?.cacheUnlocked || missionStatus?.packageRetrieved}
                  className={`py-2 rounded font-bold flex items-center justify-center space-x-1.5 ${
                    missionStatus?.packageRetrieved
                      ? 'bg-sky-600/30 text-sky-400 border border-sky-500/40'
                      : 'bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40'
                  }`}
                >
                  <PackageCheck className="w-3.5 h-3.5" />
                  <span>{missionStatus?.packageRetrieved ? 'Secured (RTL Active)' : 'Confirm Package & RTL'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
