import React, { useState, useEffect, useRef } from 'react';
import {
  Settings,
  Trash2,
  Download,
  Upload,
  Save,
  CheckCircle2,
  AlertCircle,
  X,
  Sliders,
  Check
} from 'lucide-react';
import { Card } from '../../ui/Card';
import { Segmented } from '../../ui/Segmented';
import { groundStationMissionService, computeDestination } from '../../services/groundStationMissionService';
import { mavlinkService } from '../../services/mavlinkService';
import { GroundStationMission, GroundStationWaypoint } from '../../types/groundStationMap';
import { audioService } from '../../services/audioService';

interface WaypointManagerProps {
  className?: string;
  onClearAll?: () => void;
  onLoadKml?: () => void;
  onSaveKml?: () => void;
}

const exportWaypointsToKml = (wps: GroundStationWaypoint[]): string => {
  const placemarks = wps
    .map(
      (w, idx) => `
    <Placemark>
      <name>Waypoint ${idx + 1}</name>
      <Point>
        <coordinates>${w.lng},${w.lat},${w.altitude}</coordinates>
      </Point>
    </Placemark>`
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>SAE Autonomous Drone Mission</name>
    ${placemarks}
  </Document>
</kml>`;
};

const parseKmlPoints = (text: string, defaultAlt: number = 30): Array<{ lat: number; lng: number; altitude: number }> => {
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'text/xml');
  const coordEls = xml.querySelectorAll('coordinates');
  const pts: Array<{ lat: number; lng: number; altitude: number }> = [];

  coordEls.forEach((el) => {
    const raw = el.textContent?.trim() || '';
    raw.split(/\s+/).forEach((coord) => {
      const parts = coord.split(',').map(Number);
      if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        pts.push({ lng: parts[0], lat: parts[1], altitude: parts[2] || defaultAlt });
      }
    });
  });

  return pts;
};

export const WaypointManager: React.FC<WaypointManagerProps> = ({
  className = '',
  onClearAll,
  onLoadKml,
  onSaveKml,
}) => {
  const [activeTab, setActiveTab] = useState<'Waypoints' | 'Patterns'>('Waypoints');
  const [waypoints, setWaypoints] = useState<GroundStationWaypoint[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Configured mission altitude (synchronized with groundStationMissionService & FlightParams)
  const [configuredAlt, setConfiguredAlt] = useState<number>(() => groundStationMissionService.getDefaultAltitude());
  const [initialAlt, setInitialAlt] = useState<number>(() => groundStationMissionService.getDefaultAltitude());
  const [configuredSpeed, setConfiguredSpeed] = useState<number>(() => groundStationMissionService.getDefaultSpeed());
  const [altNotice, setAltNotice] = useState<string | null>(null);

  // Settings Modal State
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [modalAlt, setModalAlt] = useState<number>(configuredAlt);
  const [modalSpeed, setModalSpeed] = useState<number>(configuredSpeed);
  const [syncToPixhawkOnSave, setSyncToPixhawkOnSave] = useState<boolean>(true);
  const [modalNotice, setModalNotice] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const unsubMission = groundStationMissionService.subscribe((mission: GroundStationMission | null) => {
      setWaypoints(mission?.waypoints || []);
      if (mission?.altitude) {
        setConfiguredAlt(mission.altitude);
        setInitialAlt(mission.altitude);
      }
    });

    const unsubAlt = groundStationMissionService.subscribeDefaultAltitude((alt) => {
      setConfiguredAlt(alt);
      setInitialAlt(alt);
      setModalAlt(alt);
    });

    const unsubSpeed = groundStationMissionService.subscribeDefaultSpeed((speed) => {
      setConfiguredSpeed(speed);
      setModalSpeed(speed);
    });

    return () => {
      unsubMission();
      unsubAlt();
      unsubSpeed();
    };
  }, []);

  const handleSaveInlineAltitude = async () => {
    if (isNaN(configuredAlt) || configuredAlt < 1 || configuredAlt > 120) {
      alert('Altitude must be between 1m and 120m.');
      return;
    }
    groundStationMissionService.setDefaultAltitude(configuredAlt, true);
    setInitialAlt(configuredAlt);
    audioService.playBeep(980, 70);
    setAltNotice(`Mission Altitude Saved: ${configuredAlt}m ✓`);
    setTimeout(() => setAltNotice(null), 3000);
  };

  const handleSaveModalSettings = async () => {
    if (isNaN(modalAlt) || modalAlt < 1 || modalAlt > 120) {
      setModalNotice({ type: 'error', message: 'Altitude must be between 1m and 120m.' });
      return;
    }
    if (isNaN(modalSpeed) || modalSpeed < 0.5 || modalSpeed > 15) {
      setModalNotice({ type: 'error', message: 'Speed must be between 0.5m/s and 15m/s.' });
      return;
    }

    groundStationMissionService.setDefaultAltitude(modalAlt, true);
    groundStationMissionService.setDefaultSpeed(modalSpeed);
    setConfiguredAlt(modalAlt);
    setInitialAlt(modalAlt);
    setConfiguredSpeed(modalSpeed);
    audioService.playBeep(980, 70);

    const isConnected = mavlinkService.getConnectionState().isConnected || mavlinkService.getConnectionState().isUsbConnected;
    if (syncToPixhawkOnSave && isConnected) {
      const res = await mavlinkService.setPixhawkParameter('WPNAV_SPEED', Math.round(modalSpeed * 100));
      if (res.success) {
        setModalNotice({ type: 'success', message: `Saved locally & verified on Pixhawk (WPNAV_SPEED=${Math.round(modalSpeed * 100)}) ✓` });
      } else {
        setModalNotice({ type: 'warning', message: `Saved locally. Pixhawk sync: ${res.message}` });
      }
    } else {
      setModalNotice({ type: 'success', message: `Saved locally for Waypoint Manager (${modalAlt}m alt, ${modalSpeed}m/s) ✓` });
    }

    setTimeout(() => {
      setShowSettingsModal(false);
      setModalNotice(null);
    }, 1800);
  };

  const handleDeleteMission = async () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      audioService.playBeep(450, 60);
      setTimeout(() => setDeleteConfirm(false), 4000);
      return;
    }
    setDeleteConfirm(false);
    await groundStationMissionService.deleteMission();
    onClearAll?.();
  };

  const handleDeleteWaypoint = (index: number) => {
    const curr = groundStationMissionService.getCurrentMission();
    if (!curr) return;
    const filtered = curr.waypoints.filter((_, idx) => idx !== index);
    if (filtered.length === 0) {
      groundStationMissionService.clearMission();
    } else {
      groundStationMissionService.generateWaypointMission(
        filtered.map((w) => ({ lat: w.lat, lng: w.lng })),
        { latitude: filtered[0].lat, longitude: filtered[0].lng, altitude: 0, timestamp: Date.now(), isSet: true },
        filtered[0].altitude || configuredAlt,
        filtered[0].speed || configuredSpeed
      );
    }
    audioService.playBeep(600, 50);
  };

  const handleSaveKml = () => {
    const curr = groundStationMissionService.getCurrentMission();
    if (!curr || curr.waypoints.length === 0) {
      alert('No waypoints to export. Add waypoints first.');
      return;
    }
    const kml = exportWaypointsToKml(curr.waypoints);
    const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sae_mission_${Date.now()}.kml`;
    a.click();
    URL.revokeObjectURL(url);
    audioService.playBeep(880, 80);
    onSaveKml?.();
  };

  const handleLoadKmlClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        try {
          const pts = parseKmlPoints(text, configuredAlt);
          if (pts.length === 0) {
            alert('No valid coordinates found in KML file.');
            return;
          }
          groundStationMissionService.generateWaypointMission(
            pts.map((p) => ({ lat: p.lat, lng: p.lng })),
            { latitude: pts[0].lat, longitude: pts[0].lng, altitude: 0, timestamp: Date.now(), isSet: true },
            pts[0].altitude || configuredAlt,
            configuredSpeed
          );
          audioService.playBeep(880, 100);
          onLoadKml?.();
        } catch (err: any) {
          alert('Failed to parse KML file: ' + err.message);
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const isAltModified = configuredAlt !== initialAlt;

  return (
    <>
      <Card
        title="WAYPOINT MANAGER"
        action={
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setModalAlt(configuredAlt);
                setModalSpeed(configuredSpeed);
                setShowSettingsModal(true);
                audioService.playBeep(700, 30);
              }}
              title="Configure Waypoint Mission Altitude & Flight Parameters"
              aria-label="Waypoint Settings"
              className="p-1 rounded bg-[#161B22] border border-slate-700 hover:border-emerald-500/60 text-slate-300 hover:text-emerald-400 transition cursor-pointer flex items-center gap-1 shadow-sm"
            >
              <Settings className="w-3.5 h-3.5" />
              <span className="text-[10px] font-mono font-bold hidden sm:inline">Settings</span>
            </button>
          </div>
        }
        className={`min-h-[225px] w-full shrink-0 select-none ${className}`}
        contentClassName="p-2 flex flex-col justify-between overflow-hidden gap-1.5"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".kml,.xml"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Top Controls Row with Synchronized Altitude Editor */}
        <div className="flex items-center justify-between gap-1 flex-wrap">
          <Segmented
            size="sm"
            value={activeTab}
            onChange={(t) => setActiveTab(t as any)}
            options={[
              { id: 'Waypoints', label: 'Waypoints' },
              { id: 'Patterns', label: 'Patterns' },
            ]}
          />

          {/* Configured Altitude Inline Editor */}
          <div className="flex items-center gap-1 bg-[#161B22] px-2 py-0.5 rounded border border-[var(--uav-card-border)] text-[10.5px] font-mono shadow-sm">
            <span className="text-[var(--uav-muted)]">Alt:</span>
            <input
              type="number"
              value={configuredAlt}
              onChange={(e) => setConfiguredAlt(Math.max(1, Math.min(120, Number(e.target.value))))}
              className="w-10 bg-transparent text-emerald-400 font-bold focus:outline-none text-right"
              min={1}
              max={120}
              step={1}
              title="Configured mission altitude (m) for waypoints"
            />
            <span className="text-slate-400">m</span>
            {isAltModified ? (
              <button
                type="button"
                onClick={handleSaveInlineAltitude}
                className="ml-1 px-1.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-sans text-[9px] font-bold cursor-pointer transition shadow flex items-center gap-0.5"
                title="Save altitude and apply to all mission waypoints"
              >
                <Save className="w-2.5 h-2.5" />
                <span>Save</span>
              </button>
            ) : (
              <span className="text-emerald-500/80 text-[10px]" title="Saved to mission">✓</span>
            )}
          </div>

          <span className="text-[11px] font-mono text-[var(--uav-muted)]">
            Total: {waypoints.length} WPs
          </span>
        </div>

        {altNotice && (
          <div className="text-[9.5px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
            <span>{altNotice}</span>
          </div>
        )}

        {/* Active Tab View */}
        {activeTab === 'Waypoints' && (
          <div className="flex-1 flex flex-col my-0.5 rounded-[6px] border border-[var(--uav-card-border)] bg-[#11161D] overflow-hidden min-h-[105px] max-h-[160px]">
            {/* Table Header */}
            <div className="grid grid-cols-[28px_1fr_1fr_50px_35px] px-2 py-1 bg-[#161B22] text-[10px] font-semibold uppercase text-[var(--uav-muted)] border-b border-[var(--uav-card-border)] text-left shrink-0">
              <span>#</span>
              <span>Latitude</span>
              <span>Longitude</span>
              <span>Alt (m)</span>
              <span className="text-right">Act</span>
            </div>

            {/* Table Body */}
            <div className="flex-1 overflow-y-auto font-mono text-[11px] divide-y divide-[#262C36]/50 scrollbar-thin scrollbar-thumb-[#262C36]">
              {waypoints.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-3 text-center text-[var(--uav-muted)] text-[11px]">
                  <span className="font-semibold text-slate-300">No waypoints added</span>
                  <span className="text-[10px]">Click on map or select a pattern to add waypoints</span>
                </div>
              ) : (
                waypoints.map((wp, idx) => (
                  <div
                    key={wp.id || idx}
                    className="grid grid-cols-[28px_1fr_1fr_50px_35px] px-2 py-1 items-center hover:bg-[#161B22] text-[var(--uav-text)] text-left"
                  >
                    <span className="font-bold text-[var(--uav-primary-blue)]">{idx + 1}</span>
                    <span className="truncate">{wp.lat.toFixed(5)}°</span>
                    <span className="truncate">{wp.lng.toFixed(5)}°</span>
                    <span className="text-emerald-400 font-bold">{wp.altitude || configuredAlt}m</span>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleDeleteWaypoint(idx)}
                        className="text-red-400/80 hover:text-red-400 p-0.5 transition cursor-pointer"
                        title={`Delete Waypoint ${idx + 1}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'Patterns' && (
          <div className="flex-1 flex flex-col justify-between my-0.5 p-2 rounded-[6px] border border-[var(--uav-card-border)] bg-[#11161D] text-[11px] font-sans min-h-[105px]">
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="flex flex-col">
                <span className="text-[var(--uav-muted)]">Grid Spacing:</span>
                <span className="font-mono font-bold text-emerald-400">2.5 m (ADDC)</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[var(--uav-muted)]">Orbit Radius:</span>
                <span className="font-mono font-bold text-white">
                  {groundStationMissionService.getCircleRadius().toFixed(1)} m
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[var(--uav-muted)]">Search Alt:</span>
                <span className="font-mono font-bold text-amber-400">{configuredAlt} m AGL</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[var(--uav-muted)]">QR Hover Alt:</span>
                <span className="font-mono font-bold text-cyan-400">1.2 m AGL</span>
              </div>
            </div>
            <div className="text-[10px] text-[var(--uav-muted)] pt-1 border-t border-[var(--uav-card-border)]">
              <div className="flex items-center justify-between">
                <span>ADDC 2.5m Grid</span>
                <button
                  type="button"
                  onClick={() => {
                    const telem = mavlinkService.getTelemetry();
                    const lat = telem.latitude || 12.9715987;
                    const lon = telem.longitude || 77.5945627;
                    const p1 = computeDestination(lat, lon, 25, 315);
                    const p2 = computeDestination(lat, lon, 25, 45);
                    const p3 = computeDestination(lat, lon, 25, 135);
                    const p4 = computeDestination(lat, lon, 25, 225);
                    const home = mavlinkService.getHomePoint();
                    groundStationMissionService.generatePolygonGridMission(
                      [p1, p2, p3, p4],
                      home.isSet ? home : { latitude: lat, longitude: lon, altitude: 0, timestamp: Date.now(), isSet: true },
                      configuredAlt,
                      configuredSpeed,
                      2.5
                    );
                    setActiveTab('Waypoints');
                    audioService.playBeep(980, 80);
                  }}
                  className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[9.5px] font-mono cursor-pointer transition shadow"
                >
                  1-CLICK 50m GRID
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Button Bar */}
        <div className="flex items-center justify-between pt-1 border-t border-[var(--uav-card-border)] flex-wrap gap-1">
          <button
            type="button"
            onClick={handleDeleteMission}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] border text-[11px] font-sans font-bold transition cursor-pointer shadow-sm active:scale-95 ${
              deleteConfirm
                ? 'bg-red-600 text-white border-white animate-pulse'
                : 'border-red-500/70 bg-red-950/40 text-red-400 hover:bg-red-900/60 hover:text-white'
            }`}
            title="Delete mission from GCS and wipe Pixhawk FC EEPROM (MISSION_CLEAR_ALL)"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{deleteConfirm ? 'CONFIRM DELETE?' : 'Delete'}</span>
          </button>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleLoadKmlClick}
              className="flex items-center gap-1 px-2 py-1 rounded-[6px] border border-[var(--uav-card-border)] bg-[#161B22] hover:bg-[#21262D] text-[var(--uav-text)] text-[11px] font-sans font-medium transition cursor-pointer"
            >
              <Upload className="w-3 h-3 text-[var(--uav-muted)]" />
              <span>Load KML</span>
            </button>
            <button
              type="button"
              onClick={handleSaveKml}
              disabled={waypoints.length === 0}
              className="flex items-center gap-1 px-2.5 py-1 rounded-[6px] bg-[#10B981] hover:bg-[#059669] disabled:opacity-40 disabled:pointer-events-none text-emerald-950 text-[11px] font-sans font-bold transition cursor-pointer"
            >
              <Download className="w-3 h-3" />
              <span>Save KML</span>
            </button>
          </div>
        </div>
      </Card>

      {/* Settings Modal (High z-index, clean dialog, responsive) */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-[#11161D] border border-slate-700 rounded-xl shadow-2xl max-w-md w-full p-4 flex flex-col gap-3 font-mono text-slate-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-sm text-white">WAYPOINT & MISSION PARAMETERS</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowSettingsModal(false);
                  setModalNotice(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex flex-col gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-slate-400 font-semibold">
                  Default Mission Altitude (m AGL):
                </label>
                <input
                  type="number"
                  value={modalAlt}
                  onChange={(e) => setModalAlt(Number(e.target.value))}
                  min={1}
                  max={120}
                  step={1}
                  className="bg-[#161B22] border border-slate-700 rounded p-1.5 text-white font-bold text-sm focus:border-emerald-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-500">
                  Shared across Waypoint Manager, Search missions, and Flight Parameters.
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-slate-400 font-semibold">
                  Default Cruise Speed (m/s):
                </label>
                <input
                  type="number"
                  value={modalSpeed}
                  onChange={(e) => setModalSpeed(Number(e.target.value))}
                  min={0.5}
                  max={15}
                  step={0.5}
                  className="bg-[#161B22] border border-slate-700 rounded p-1.5 text-white font-bold text-sm focus:border-emerald-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-500">
                  Horizontal transit velocity between waypoints (WPNAV_SPEED).
                </span>
              </div>

              <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
                <input
                  type="checkbox"
                  id="sync-fc-check"
                  checked={syncToPixhawkOnSave}
                  onChange={(e) => setSyncToPixhawkOnSave(e.target.checked)}
                  className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                />
                <label htmlFor="sync-fc-check" className="text-[11px] text-slate-300 cursor-pointer">
                  Sync changes to Pixhawk FC parameters via MAVLink (WPNAV_SPEED)
                </label>
              </div>

              {modalNotice && (
                <div
                  className={`text-[10.5px] p-2 rounded flex items-center gap-1.5 ${
                    modalNotice.type === 'success'
                      ? 'bg-emerald-950/80 border border-emerald-500 text-emerald-300'
                      : modalNotice.type === 'warning'
                      ? 'bg-amber-950/80 border border-amber-500 text-amber-300'
                      : 'bg-rose-950/80 border border-rose-500 text-rose-300'
                  }`}
                >
                  {modalNotice.type === 'success' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  )}
                  <span>{modalNotice.message}</span>
                </div>
              )}
            </div>

            {/* Modal Footer Controls */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowSettingsModal(false);
                  setModalNotice(null);
                }}
                className="px-3 py-1.5 rounded border border-slate-700 bg-[#161B22] hover:bg-slate-800 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveModalSettings}
                className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Parameters</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
