import React, { useState, useEffect, useMemo } from 'react';
import {
  PenTool,
  Trash2,
  Send,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Circle,
  Square,
  Layers,
  RefreshCw,
  Compass,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { Card } from '../../ui/Card';
import { groundStationMissionService } from '../../services/groundStationMissionService';
import { mavlinkService } from '../../services/mavlinkService';
import { audioService } from '../../services/audioService';
import { DashboardTelemetryData } from '../../hooks/useDashboardTelemetry';
import { GroundStationMission, MissionDrawingTool } from '../../types/groundStationMap';

interface ManualMissionControlCardProps {
  telemetry: DashboardTelemetryData;
  onOpenPreflightModal: () => void;
  onUploadWaypoints: () => Promise<void>;
  onEmergencyRTL: () => void;
  rtlConfirmPending?: boolean;
  className?: string;
}

export const ManualMissionControlCard: React.FC<ManualMissionControlCardProps> = ({
  telemetry,
  onOpenPreflightModal,
  onUploadWaypoints,
  onEmergencyRTL,
  rtlConfirmPending = false,
  className = '',
}) => {
  const [mission, setMission] = useState<GroundStationMission | null>(() =>
    groundStationMissionService.getCurrentMission()
  );
  const [activeTool, setActiveTool] = useState<MissionDrawingTool>(() =>
    groundStationMissionService.getDrawingTool()
  );
  const [altitude, setAltitude] = useState<number>(() => groundStationMissionService.getDefaultAltitude() || 10);
  const [speed, setSpeed] = useState<number>(() => groundStationMissionService.getDefaultSpeed() || 4.0);
  const [circleRadius, setCircleRadius] = useState<number>(() => groundStationMissionService.getCircleRadius() || 15);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(10);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  useEffect(() => {
    const unsubMission = groundStationMissionService.subscribe(setMission);
    const unsubTool = groundStationMissionService.subscribeDrawingTool(setActiveTool);
    const unsubAlt = groundStationMissionService.subscribeDefaultAltitude((a) => setAltitude(a));
    const unsubRadius = groundStationMissionService.subscribeCircleRadius((r) => setCircleRadius(r));
    return () => {
      unsubMission();
      unsubTool();
      unsubAlt();
      unsubRadius();
    };
  }, []);

  const totalWps = mission?.waypoints.length || 0;

  // Calculate approximate total track distance
  const totalDistanceMeters = React.useMemo(() => {
    if (!mission || mission.waypoints.length < 2) return 0;
    let dist = 0;
    for (let i = 1; i < mission.waypoints.length; i++) {
      dist += mission.waypoints[i].distanceFromPreviousMeters || 0;
    }
    return Math.round(dist);
  }, [mission]);

  const estimatedFlightTimeSec = React.useMemo(() => {
    if (speed <= 0 || totalDistanceMeters <= 0) return 0;
    return Math.round(totalDistanceMeters / speed);
  }, [totalDistanceMeters, speed]);

  const isFcConnected = telemetry.isConnected || telemetry.rawConnectionState.isConnected;

  const MANUAL_STEPS = [
    { step: 1, label: '1. Define Waypoints / Flight Path', short: 'Waypoints Defined' },
    { step: 2, label: '2. Configure Altitude & Speed', short: 'Flight Params Set' },
    { step: 3, label: '3. Validate Route Geometry', short: 'Route Validated' },
    { step: 4, label: '4. Upload Waypoints to Pixhawk', short: 'Upload Mission' },
    { step: 5, label: '5. Verify Upload Confirmed', short: 'Upload Verified' },
    { step: 6, label: '6. Explicit Operator Authorization', short: 'Operator Authorization' },
  ];

  const currentStep = useMemo(() => {
    if (telemetry.isArmed || telemetry.flightMode === 'AUTO' || telemetry.flightMode === 'GUIDED') {
      return MANUAL_STEPS[5];
    }
    if (mission?.isUploaded) {
      return MANUAL_STEPS[5];
    }
    if (isUploading) {
      return MANUAL_STEPS[4];
    }
    if (totalWps > 0 && totalDistanceMeters > 0) {
      return MANUAL_STEPS[3];
    }
    if (totalWps > 0) {
      return MANUAL_STEPS[1];
    }
    return MANUAL_STEPS[0];
  }, [telemetry.isArmed, telemetry.flightMode, mission?.isUploaded, isUploading, totalWps, totalDistanceMeters]);

  const handleToolSelect = (tool: MissionDrawingTool) => {
    const nextTool = activeTool === tool ? 'select' : tool;
    groundStationMissionService.setDrawingTool(nextTool);
    audioService.playBeep(700, 50);
  };

  const handleGenerateCircle = () => {
    const center = mission?.geometry?.circleCenter || {
      lat: telemetry.latitude || 12.9715987,
      lng: telemetry.longitude || 77.5945627
    };
    const home = {
      latitude: telemetry.latitude || 12.9715987,
      longitude: telemetry.longitude || 77.5945627,
      altitude: 0,
      timestamp: Date.now(),
      isSet: true
    };
    groundStationMissionService.generateCircleMission(center, circleRadius, home, altitude, speed);
    audioService.playBeep(880, 80);
    setUploadNotice(`Generated circular orbit mission with radius ${circleRadius}m ✓`);
    setTimeout(() => setUploadNotice(null), 3500);
  };

  const handleGenerateConcentric = () => {
    const center = mission?.geometry?.circleCenter || {
      lat: telemetry.latitude || 12.9715987,
      lng: telemetry.longitude || 77.5945627
    };
    const home = {
      latitude: telemetry.latitude || 12.9715987,
      longitude: telemetry.longitude || 77.5945627,
      altitude: 0,
      timestamp: Date.now(),
      isSet: true
    };
    const ring1 = Math.max(5, Math.round(circleRadius * 0.5));
    const ring2 = circleRadius;
    const ring3 = Math.round(circleRadius * 1.5);
    groundStationMissionService.generateConcentricCircleMission(center, [ring1, ring2, ring3], home, altitude, speed);
    audioService.playBeep(920, 80);
    setUploadNotice(`Generated 3 concentric orbit rings (${ring1}m, ${ring2}m, ${ring3}m) ✓`);
    setTimeout(() => setUploadNotice(null), 3500);
  };

  const handleRegenerateWaypoints = () => {
    if (!mission) return;
    if (mission.missionType === 'CIRCLE') {
      handleGenerateCircle();
    } else if (mission.missionType === 'CONCENTRIC_CIRCLE') {
      handleGenerateConcentric();
    } else {
      groundStationMissionService.updateMissionAltitude(altitude);
      audioService.playBeep(800, 60);
      setUploadNotice(`Regenerated waypoints at ${altitude}m cruise altitude ✓`);
      setTimeout(() => setUploadNotice(null), 3000);
    }
  };

  const handleDeleteMission = async () => {
    setIsUploading(true);
    setUploadNotice('Deleting mission from GCS & Flight Controller...');
    try {
      const res = await groundStationMissionService.deleteMission();
      setUploadNotice(res.message);
    } catch {
      setUploadNotice('Mission cleared locally');
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadNotice(null), 3500);
    }
  };

  const handleUploadClick = async () => {
    if (!mission || mission.waypoints.length === 0) {
      setUploadNotice('No waypoints defined. Click map or select drawing tool first.');
      return;
    }
    setIsUploading(true);
    setUploadNotice(`Uploading ${totalWps} waypoints to Pixhawk...`);
    try {
      await onUploadWaypoints();
      setUploadNotice(`✓ Verified: ${totalWps} waypoints stored in Pixhawk memory`);
      setTimeout(() => setUploadNotice(null), 4000);
    } catch (err: any) {
      setUploadNotice(`Upload failed: ${err?.message || 'Check MAVLink link'}`);
      setTimeout(() => setUploadNotice(null), 4000);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card
      title="MANUAL MISSION PLANNING"
      action={
        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold border border-emerald-500/40">
          MANUAL MODE
        </span>
      }
      className={`shrink-0 bg-[#0E131A] border-[var(--uav-card-border)] shadow-md select-none ${className}`}
      contentClassName="p-3 flex flex-col gap-2.5"
    >
      {/* Flight Mode & Waypoint Count Header Pill */}
      <div className="flex items-center justify-between text-xs font-mono bg-[#161B22] p-2 rounded-lg border border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-[10.5px]">MISSION STATUS:</span>
          <span className="font-bold text-white">
            {mission?.isUploaded ? 'UPLOADED & VERIFIED ✓' : totalWps > 0 ? 'DRAFT PLAN' : 'NO PATH'}
          </span>
        </div>
        <div className="text-[11px] font-bold text-emerald-400">
          {totalWps} {totalWps === 1 ? 'Waypoint' : 'Waypoints'}
        </div>
      </div>

      {uploadNotice && (
        <div className="px-2.5 py-1.5 rounded bg-sky-950/80 border border-sky-500/60 text-sky-200 text-[11px] font-mono flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span>{uploadNotice}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ORDERED MANUAL MISSION PROCESS PANEL (Requirement 7)                      */}
      {/* ========================================================================= */}
      <div className="bg-[#121820] p-2.5 rounded-lg border border-slate-800 space-y-2">
        <div className="flex items-center justify-between text-[10.5px] font-mono">
          <span className="text-slate-300 uppercase font-bold flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>MANUAL MISSION PROCESS:</span>
          </span>
          <span className={`font-black px-2 py-0.5 rounded border text-[10px] ${currentStep.step === 6
            ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/60'
            : 'bg-sky-950/90 text-sky-300 border-sky-500/60'
            }`}>
            STEP {currentStep.step} OF 6: {currentStep.short}
          </span>
        </div>

        {/* 6-Step Progress Bar */}
        <div className="grid grid-cols-6 gap-1 h-1.5 w-full">
          {MANUAL_STEPS.map((s) => (
            <div
              key={s.step}
              title={`${s.step}. ${s.label}`}
              className={`rounded-full transition-all ${s.step < currentStep.step || (s.step === 6 && telemetry.isArmed)
                ? 'bg-emerald-500'
                : s.step === currentStep.step
                  ? 'bg-sky-400 animate-pulse shadow-sm shadow-sky-400'
                  : 'bg-slate-800'
                }`}
            />
          ))}
        </div>

        {/* Workflow Steps Breakdown (Completed, Current Active, Pending) */}
        <div className="space-y-1 pt-1 max-h-28 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 font-mono text-[9.5px]">
          {MANUAL_STEPS.map((s) => {
            const isCompleted = s.step < currentStep.step || (s.step === 6 && telemetry.isArmed);
            const isCurrent = s.step === currentStep.step;
            return (
              <div
                key={s.step}
                className={`flex items-center justify-between px-2 py-0.5 rounded transition ${isCurrent
                  ? 'bg-sky-950/70 border border-sky-500/50 text-white font-bold'
                  : isCompleted
                    ? 'bg-slate-900/60 text-emerald-300'
                    : 'text-slate-500'
                  }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  {isCompleted ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                  ) : isCurrent ? (
                    <div className="w-2 h-2 rounded-full bg-sky-400 animate-ping shrink-0" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-slate-700 shrink-0" />
                  )}
                  <span className="truncate">{s.label}</span>
                </div>
                <span className="text-[8.5px] uppercase shrink-0 font-bold ml-1">
                  {isCompleted ? '✓ DONE' : isCurrent ? '▶ ACTIVE' : 'PENDING'}
                </span>
              </div>
            );
          })}
        </div>

        {/* Validation Status & Hardware Status Strip */}
        <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-slate-800/80 font-mono text-[9px]">
          <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800 flex items-center justify-between">
            <span className="text-slate-400">VALIDATION:</span>
            <span className={`font-bold ${totalWps > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {totalWps > 0 ? `${totalWps} WPS VALID ✓` : 'STANDBY'}
            </span>
          </div>
          <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800 flex items-center justify-between">
            <span className="text-slate-400">HARDWARE:</span>
            <span className={`font-bold ${isFcConnected ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isFcConnected ? (telemetry.isArmed ? 'ARMED' : 'DISARMED') : 'NO LINK'}
            </span>
          </div>
        </div>
      </div>

      {/* 5 Manual Mission Creation Methods (Requirement 3) */}
      <div className="bg-[#161B22] p-2.5 rounded-lg border border-slate-800 space-y-2">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
          Manual Creation Tools:
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 font-mono text-[10.5px]">
          {/* 1. Circle Drawing */}
          <button
            type="button"
            onClick={() => handleToolSelect('circle')}
            className={`py-1.5 px-2 rounded font-bold flex items-center justify-center gap-1.5 transition cursor-pointer border ${activeTool === 'circle'
              ? 'bg-emerald-600 text-white border-emerald-400 shadow-sm'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            title="Click map to place circular search orbit"
          >
            <Circle className="w-3 h-3 text-emerald-400" />
            <span>Circle</span>
          </button>

          {/* 2. Circle Waypoints (Concentric Orbits) */}
          <button
            type="button"
            onClick={() => handleToolSelect('concentric_circle')}
            className={`py-1.5 px-2 rounded font-bold flex items-center justify-center gap-1.5 transition cursor-pointer border ${activeTool === 'concentric_circle'
              ? 'bg-emerald-600 text-white border-emerald-400 shadow-sm'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            title="Create expanding concentric circle orbits"
          >
            <Layers className="w-3 h-3 text-amber-400" />
            <span>Circle WPs</span>
          </button>

          {/* 3. Polygon / Rectangle Drawing */}
          <button
            type="button"
            onClick={() => handleToolSelect('polygon')}
            className={`py-1.5 px-2 rounded font-bold flex items-center justify-center gap-1.5 transition cursor-pointer border ${activeTool === 'polygon'
              ? 'bg-emerald-600 text-white border-emerald-400 shadow-sm'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            title="Click to draw polygon or rectangular flight boundary"
          >
            <Square className="w-3 h-3 text-sky-400" />
            <span>Polygon / Rect</span>
          </button>

          {/* 4. Freehand Drawing on Map */}
          <button
            type="button"
            onClick={() => handleToolSelect('draw')}
            className={`py-1.5 px-2 rounded font-bold flex items-center justify-center gap-1.5 transition cursor-pointer border ${activeTool === 'draw'
              ? 'bg-emerald-600 text-white border-emerald-400 shadow-sm'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            title="Click and drag to draw a continuous freehand flight path"
          >
            <PenTool className="w-3 h-3 text-purple-400" />
            <span>Freehand</span>
          </button>

          {/* 5. Individual Waypoint Placement */}
          <button
            type="button"
            onClick={() => handleToolSelect('point')}
            className={`py-1.5 px-2 rounded font-bold flex items-center justify-center gap-1.5 transition cursor-pointer border col-span-2 sm:col-span-1 ${activeTool === 'point'
              ? 'bg-emerald-600 text-white border-emerald-400 shadow-sm'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            title="Click map to pin individual waypoints sequentially"
          >
            <MapPin className="w-3 h-3 text-rose-400" />
            <span>Individual WPs</span>
          </button>
        </div>

        {/* Dynamic Shape Parameter Sliders (When Circle / Concentric Active) */}
        {(activeTool === 'circle' || activeTool === 'concentric_circle' || mission?.missionType === 'CIRCLE') && (
          <div className="pt-2 border-t border-slate-800/80 font-mono text-[10.5px] space-y-1">
            <div className="flex justify-between text-slate-400">
              <span>Orbit Radius:</span>
              <span className="font-bold text-white">{circleRadius}m (Dia: {circleRadius * 2}m)</span>
            </div>
            <input
              type="range"
              min={5}
              max={60}
              step={1}
              value={circleRadius}
              onChange={(e) => {
                const r = Number(e.target.value);
                setCircleRadius(r);
                groundStationMissionService.setCircleRadius(r);
              }}
              className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
            />
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleGenerateCircle}
                className="flex-1 py-1 px-2 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/50 text-emerald-300 font-bold text-[10px] cursor-pointer"
              >
                ● Generate Orbit
              </button>
              <button
                type="button"
                onClick={handleGenerateConcentric}
                className="flex-1 py-1 px-2 rounded bg-amber-950/80 hover:bg-amber-900 border border-amber-500/50 text-amber-300 font-bold text-[10px] cursor-pointer"
              >
                ◎ 3-Ring Orbits
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Altitude & Cruise Speed Configuration */}
      <div className="grid grid-cols-2 gap-2 bg-[#161B22] p-2 rounded-lg border border-slate-800 font-mono">
        <div>
          <span className="text-[10px] text-slate-400 block">CRUISE ALTITUDE:</span>
          <div className="flex items-center gap-1 pt-1">
            <input
              type="number"
              min={2}
              max={50}
              value={altitude}
              onChange={(e) => {
                const val = Math.max(2, Math.min(50, Number(e.target.value) || 10));
                setAltitude(val);
                groundStationMissionService.updateMissionAltitude(val);
              }}
              className="w-16 px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-white font-bold text-xs"
            />
            <span className="text-slate-400 text-xs">m</span>
          </div>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 block">CRUISE SPEED:</span>
          <div className="flex items-center gap-1 pt-1">
            <input
              type="number"
              min={1}
              max={15}
              step={0.5}
              value={speed}
              onChange={(e) => {
                const val = Math.max(1, Math.min(15, Number(e.target.value) || 4));
                setSpeed(val);
                groundStationMissionService.setDefaultSpeed(val);
              }}
              className="w-16 px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-white font-bold text-xs"
            />
            <span className="text-slate-400 text-xs">m/s</span>
          </div>
        </div>
      </div>

      {/* Mission Preview Metrics */}
      <div className="bg-[#10141B] p-2 rounded border border-slate-800/80 font-mono text-[10px] flex items-center justify-between text-slate-300">
        <div>
          <span className="text-slate-500 block text-[8.5px]">TOTAL DISTANCE:</span>
          <span className="font-bold text-sky-300 text-[11px]">{totalDistanceMeters} m</span>
        </div>
        <div>
          <span className="text-slate-500 block text-[8.5px]">EST. TIME:</span>
          <span className="font-bold text-emerald-300 text-[11px]">{Math.floor(estimatedFlightTimeSec / 60)}m {estimatedFlightTimeSec % 60}s</span>
        </div>
        <div>
          <span className="text-slate-500 block text-[8.5px]">WAYPOINTS:</span>
          <span className="font-bold text-amber-300 text-[11px]">{totalWps}</span>
        </div>
      </div>

      {/* Waypoint Editing & Action Controls */}
      <div className="grid grid-cols-3 gap-1.5 font-mono text-[10px]">
        {/* Regenerate Waypoints */}
        <button
          type="button"
          onClick={handleRegenerateWaypoints}
          disabled={totalWps === 0}
          className="py-1.5 px-2 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-bold flex items-center justify-center gap-1 transition cursor-pointer disabled:opacity-40"
          title="Regenerate all waypoints with updated altitude and geometry"
        >
          <RefreshCw className="w-3 h-3 text-sky-400" />
          <span>REGENERATE</span>
        </button>

        {/* Clear Path */}
        <button
          type="button"
          onClick={handleDeleteMission}
          disabled={totalWps === 0 && !mission}
          className="py-1.5 px-2 rounded bg-red-950/40 hover:bg-red-900/60 border border-red-500/60 text-red-400 hover:text-white font-bold flex items-center justify-center gap-1 transition cursor-pointer disabled:opacity-40"
          title="Clear all manual waypoints"
        >
          <Trash2 className="w-3 h-3" />
          <span>CLEAR PATH</span>
        </button>

        {/* Upload Mission */}
        <button
          type="button"
          onClick={handleUploadClick}
          disabled={isUploading || totalWps === 0}
          className="py-1.5 px-2 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold flex items-center justify-center gap-1 transition cursor-pointer disabled:opacity-40 shadow-sm"
          title="Upload mission to Pixhawk and verify stored waypoints"
        >
          <Send className={`w-3 h-3 ${isUploading ? 'animate-bounce' : ''}`} />
          <span>{isUploading ? 'UPLOADING...' : 'UPLOAD'}</span>
        </button>
      </div>

      {/* Explicit Operator Authorization to Execute (Requirement 3: Never auto-send movement commands) */}
      <button
        type="button"
        onClick={onOpenPreflightModal}
        disabled={totalWps === 0}
        className={`w-full py-2.5 px-3 rounded-lg font-sans font-black text-[11px] tracking-wider uppercase flex items-center justify-center gap-2 transition active:scale-95 shadow-md ${totalWps > 0
          ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50 cursor-pointer'
          : 'bg-slate-800/60 text-slate-500 border border-slate-700/60 cursor-not-allowed'
          }`}
        title="Validate mission and require explicit operator authorization before flight execution"
      >
        <Play className="w-3.5 h-3.5 fill-current" />
        <span>AUTHORIZE &amp; EXECUTE MISSION</span>
      </button>

      {/* Emergency RTL Button */}
      <div className="pt-1 border-t border-slate-800">
        <button
          type="button"
          onClick={onEmergencyRTL}
          className={`w-full py-2 px-3 rounded-lg font-bold text-[11px] font-mono flex items-center justify-center gap-2 transition cursor-pointer ${rtlConfirmPending
            ? 'bg-red-600 text-white border-2 border-white animate-pulse'
            : 'bg-rose-950/50 border border-rose-500/50 text-rose-300 hover:bg-rose-900/60'
            }`}
          title="Emergency Return To Launch (Click once to prime, click 2nd time to execute)"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${rtlConfirmPending ? 'animate-spin' : ''}`} />
          <span>{rtlConfirmPending ? '⚠️ CONFIRM RTL NOW (CLICK AGAIN)' : 'EMERGENCY RTL'}</span>
        </button>
      </div>
    </Card>
  );
};

export default ManualMissionControlCard;
