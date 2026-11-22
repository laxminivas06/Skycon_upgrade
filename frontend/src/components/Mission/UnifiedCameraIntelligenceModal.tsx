import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Video,
  Radio,
  Wifi,
  Battery,
  ShieldCheck,
  ShieldAlert,
  Maximize2,
  RefreshCw,
  Play,
  Square,
  QrCode,
  Layers,
  Smartphone,
  Eye,
  Download,
  CheckCircle2,
  AlertTriangle,
  X,
  Compass,
  Flashlight
} from 'lucide-react';
import { droneCameraStreamService, DroneCameraStreamStatus } from '../../services/droneCameraStreamService';
import { dronePortStreamingService, DronePortStreamState } from '../../services/dronePortStreamingService';
import { targetDetectionEngine, CapturedAreaImage } from '../../services/targetDetectionEngine';
import { reconDetectionService } from '../../services/reconDetectionService';
import { QRDetectionRecord } from '../../types/recon';
import { phoneDeviceService } from '../../services/phoneDeviceService';
import { mavlinkService } from '../../services/mavlinkService';
import { SimpleConnectionIndicators } from '../common/SimpleConnectionIndicators';

interface UnifiedCameraIntelligenceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UnifiedCameraIntelligenceModal: React.FC<UnifiedCameraIntelligenceModalProps> = ({
  isOpen,
  onClose
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [activeTab, setActiveTab] = useState<'STREAM' | 'CAPTURES' | 'HEATMAP' | 'PHONE_NODE'>('STREAM');
  const [streamState, setStreamState] = useState<DronePortStreamState>(() => dronePortStreamingService.getStreamState());
  const [droneStream, setDroneStream] = useState<MediaStream | null>(() => droneCameraStreamService.getMediaStream());
  const [droneFrame, setDroneFrame] = useState<string | null>(() => droneCameraStreamService.getLatestFrame());
  const [capturedImages, setCapturedImages] = useState<CapturedAreaImage[]>([]);
  const [detections, setDetections] = useState<QRDetectionRecord[]>(() => reconDetectionService.getDetections());
  const [selectedPhoto, setSelectedPhoto] = useState<CapturedAreaImage | null>(null);
  const [torchActive, setTorchActive] = useState<boolean>(false);

  const telemetry = mavlinkService.getTelemetry();
  const pixhawkState = mavlinkService.getConnectionState();

  const isWifiConnected = typeof navigator !== 'undefined' ? navigator.onLine : false;
  const isMavlinkConnected = pixhawkState.isConnected;
  const isPixhawkConnected = pixhawkState.isConnected;

  useEffect(() => {
    if (!isOpen) return;

    const unsubPort = dronePortStreamingService.subscribe(setStreamState);
    const unsubStream = droneCameraStreamService.subscribeStream(setDroneStream);
    const unsubFrame = droneCameraStreamService.subscribeFrame(setDroneFrame);
    const unsubImages = targetDetectionEngine.subscribeCapturedImages(setCapturedImages);
    const unsubDetections = reconDetectionService.subscribeDetections(setDetections);

    return () => {
      unsubPort();
      unsubStream();
      unsubFrame();
      unsubImages();
      unsubDetections();
    };
  }, [isOpen]);

  // Synchronize stream to video element
  useEffect(() => {
    if (videoRef.current) {
      if (droneStream && streamState === 'STREAMING_ACTIVE') {
        if (videoRef.current.srcObject !== droneStream) {
          videoRef.current.srcObject = droneStream;
          videoRef.current.play().catch(() => {});
        }
      } else {
        videoRef.current.srcObject = null;
      }
    }
  }, [droneStream, streamState]);

  if (!isOpen) return null;

  const isLive = streamState === 'STREAMING_ACTIVE' && (Boolean(droneStream) || Boolean(droneFrame));

  const handleToggleStreaming = async () => {
    if (streamState === 'STREAMING_ACTIVE' || streamState === 'STARTING') {
      dronePortStreamingService.stopStreaming();
    } else {
      await dronePortStreamingService.startStreaming();
    }
  };

  const handleManualCapture = async () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (videoRef.current) {
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        }
        const snap = targetDetectionEngine.captureAreaSnapshot({
          canvas,
          telemetry: {
            lat: telemetry.latitude,
            lon: telemetry.longitude,
            altAgl: telemetry.altitude,
            heading: telemetry.heading,
          },
          bboxNormalized: { nx: 0.5, ny: 0.5, w: 0.3, h: 0.3 },
          sharpness: 80,
        });
        if (snap) {
          setSelectedPhoto(snap);
        }
      }
    } catch (e) {}
  };

  const handleToggleTorch = async () => {
    const next = !torchActive;
    const res = await phoneDeviceService.setTorch(next);
    if (res.success) {
      setTorchActive(next);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 select-none animate-in fade-in">
      <div className="bg-[#0b1220] border border-cyan-500/40 rounded-2xl w-full max-w-5xl h-[88vh] max-h-[820px] text-white shadow-2xl flex flex-col overflow-hidden">
        
        {/* HEADER: Title, 3-Symbol Indicators & Close */}
        <header className="h-[52px] px-3 sm:px-5 bg-[#080d17] border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-500/50 flex items-center justify-center text-cyan-400">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <span className="font-orbitron font-black text-xs sm:text-sm tracking-wider text-white block leading-none">
                SKYCON OPTICAL RECON &amp; CAMERA INTELLIGENCE
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                LIVE STREAM • PHOTOGRAPHY • HEATMAP • TARGET IDENTIFICATION
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Simplified 3-Symbol Connection Indicators: Wi-Fi, MAVLink, Pixhawk */}
            <SimpleConnectionIndicators
              isWifiConnected={isWifiConnected}
              isMavlinkConnected={isMavlinkConnected}
              isPixhawkConnected={isPixhawkConnected}
            />

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-950 border border-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              title="Close Dialog"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* SUBHEADER: Navigation Tabs & Quick Status */}
        <div className="px-3 sm:px-5 py-2 bg-[#0c1424] border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1 bg-[#111a2d] p-1 rounded-lg border border-slate-800 text-xs font-mono">
            <button
              type="button"
              onClick={() => setActiveTab('STREAM')}
              className={`px-3 py-1 rounded-md font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'STREAM' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>LIVE STREAM</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('CAPTURES')}
              className={`px-3 py-1 rounded-md font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'CAPTURES' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>CAPTURES ({capturedImages.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('HEATMAP')}
              className={`px-3 py-1 rounded-md font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'HEATMAP' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>HEATMAP</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('PHONE_NODE')}
              className={`px-3 py-1 rounded-md font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'PHONE_NODE' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>PHONE RECON NODE</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleStreaming}
              className={`px-3 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer ${
                streamState === 'STREAMING_ACTIVE'
                  ? 'bg-rose-950/80 border border-rose-500/60 text-rose-300 hover:bg-rose-900'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow'
              }`}
            >
              {streamState === 'STREAMING_ACTIVE' ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
              <span>{streamState === 'STREAMING_ACTIVE' ? 'STOP STREAM' : 'START STREAM'}</span>
            </button>
          </div>
        </div>

        {/* MAIN BODY AREA */}
        <main className="flex-1 p-3 sm:p-4 overflow-y-auto min-h-0 flex flex-col">
          
          {/* TAB 1: LIVE STREAM */}
          {activeTab === 'STREAM' && (
            <div className="flex-1 flex flex-col gap-3 min-h-0">
              <div className="relative flex-1 rounded-xl bg-black border border-slate-800 overflow-hidden flex items-center justify-center min-h-[320px]">
                {isLive ? (
                  <div className="w-full h-full relative flex items-center justify-center bg-black overflow-hidden">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className={`w-full h-full object-contain select-none ${
                        droneStream ? 'block' : 'hidden'
                      }`}
                    />
                    {!droneStream && droneFrame && (
                      <img
                        src={droneFrame}
                        alt="Drone Core Camera Live Stream"
                        className="w-full h-full object-contain select-none"
                      />
                    )}

                    {/* HUD Telemetry Overlay */}
                    <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-mono text-emerald-400 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span>LIVE DRONE STREAM</span>
                    </div>

                    <div className="absolute bottom-3 left-3 right-3 bg-black/75 backdrop-blur-md px-3 py-2 rounded-lg border border-slate-800 text-xs font-mono text-slate-300 flex items-center justify-between">
                      <span>ALT: {(telemetry.altitude || 0).toFixed(1)}m</span>
                      <span>SPD: {(telemetry.groundSpeed || 0).toFixed(1)}m/s</span>
                      <span>HDG: {Math.round(telemetry.heading || 0)}°</span>
                      <span>MODE: {telemetry.flightMode || 'DISARMED'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-6 text-center font-mono space-y-2">
                    <Video className="w-10 h-10 text-slate-600 mb-2" />
                    <div className="text-white font-bold text-sm">
                      {streamState === 'STREAMING_OFF' ? 'STREAMING OFF' : 'WAITING FOR DRONE STREAM'}
                    </div>
                    <div className="text-slate-400 text-xs max-w-sm">
                      {streamState === 'STREAMING_OFF'
                        ? 'Camera stream is currently paused. When Drone Core initiates streaming, it will automatically appear here.'
                        : 'Awaiting video packets from Drone Core optical transmitter...'}
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleStreaming}
                      className="mt-2 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                    >
                      {streamState === 'STREAMING_ACTIVE' ? 'Reconnect Feed' : 'Start Streaming'}
                    </button>
                  </div>
                )}
              </div>

              {/* Quick Actions Bar */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#0e1628] border border-slate-800">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleManualCapture}
                    className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-bold flex items-center gap-1.5 shadow cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>SNAPSHOT HIGH-RES</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleTorch}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer ${
                      torchActive ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 border-slate-700 text-slate-300'
                    }`}
                  >
                    <Flashlight className="w-3.5 h-3.5" />
                    <span>TORCH {torchActive ? 'ON' : 'OFF'}</span>
                  </button>
                </div>
                <div className="text-xs font-mono text-slate-400">
                  QR Detections: <strong className="text-emerald-400">{detections.length}</strong>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PHOTO CAPTURES & GALLERY */}
          {activeTab === 'CAPTURES' && (
            <div className="flex-1 flex flex-col gap-3 min-h-0">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-300 border-b border-slate-800 pb-2">
                <span>RECON PHOTO ARCHIVE ({capturedImages.length})</span>
                <button
                  type="button"
                  onClick={handleManualCapture}
                  className="px-3 py-1 rounded bg-cyan-600 text-white text-xs font-bold"
                >
                  + CAPTURE CURRENT FRAME
                </button>
              </div>

              {capturedImages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs font-mono p-6 text-center">
                  <Camera className="w-8 h-8 mb-2 text-slate-600" />
                  <span>No captured photos yet. Trigger a snapshot during reconnaissance flight.</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 overflow-y-auto">
                  {capturedImages.map((img) => (
                    <div
                      key={img.id}
                      onClick={() => setSelectedPhoto(img)}
                      className="bg-[#11192b] border border-slate-800 hover:border-cyan-500/60 rounded-xl p-2 flex flex-col gap-1.5 cursor-pointer transition shadow"
                    >
                      <img
                        src={img.imageDataUrl}
                        alt="Recon Photo"
                        className="w-full h-32 object-cover rounded-lg bg-black"
                      />
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                        <span>ALT: {img.altitudeAgl.toFixed(1)}m</span>
                        <span>{new Date(img.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: HEATMAP */}
          {activeTab === 'HEATMAP' && (
            <div className="flex-1 flex flex-col gap-3 min-h-0">
              <div className="p-3 rounded-xl bg-[#0e172a] border border-slate-800 flex items-center justify-between text-xs font-mono">
                <div>
                  <span className="font-bold text-white block">SEARCH COVERAGE HEATMAP</span>
                  <span className="text-[10px] text-slate-400">Real-time ground inspection coverage and optical scan density</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-emerald-300 font-bold">GRID SYNCED</span>
                </div>
              </div>

              <div className="flex-1 rounded-xl bg-black border border-slate-800 flex flex-col items-center justify-center p-6 text-center font-mono">
                <Layers className="w-12 h-12 text-cyan-400 mb-3" />
                <div className="text-white font-bold text-sm mb-1">
                  OPTICAL RECONNAISSANCE LAYER ACTIVE
                </div>
                <div className="text-slate-400 text-xs max-w-md mb-4">
                  Multi-spectral optical swath tracking across autonomous search boundaries. Verified 2-digit QR codes: {detections.length}.
                </div>
                <div className="grid grid-cols-3 gap-3 w-full max-w-lg text-xs">
                  <div className="p-2.5 rounded-lg bg-[#11192b] border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">SWATH STATUS</span>
                    <span className="font-bold text-emerald-400">{telemetry.altitude && telemetry.altitude > 2 ? 'ACTIVE' : 'READY'}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#11192b] border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">SCAN ALTITUDE</span>
                    <span className="font-bold text-white">{(telemetry.altitude || 10).toFixed(1)}m</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#11192b] border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">VERIFIED TARGETS</span>
                    <span className="font-bold text-emerald-400">{detections.length}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: PHONE RECON NODE */}
          {activeTab === 'PHONE_NODE' && (
            <div className="flex-1 flex flex-col gap-3 min-h-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs font-mono">
                <div className="p-3 rounded-xl bg-[#0e172a] border border-slate-800">
                  <span className="text-slate-400 text-[10px] block">NODE STATUS</span>
                  <div className="flex items-center gap-2 mt-1">
                    <Smartphone className="w-4 h-4 text-emerald-400" />
                    <span className="font-bold text-white">AUTONOMOUS EDGE PHONE</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">Mounted under drone airframe</span>
                </div>

                <div className="p-3 rounded-xl bg-[#0e172a] border border-slate-800">
                  <span className="text-slate-400 text-[10px] block">STREAMING TRANSPORT</span>
                  <div className="flex items-center gap-2 mt-1">
                    <Radio className="w-4 h-4 text-cyan-400" />
                    <span className="font-bold text-white">WEBRTC P2P / FRAME RELAY</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">Port 8443 / Local Broadcast</span>
                </div>

                <div className="p-3 rounded-xl bg-[#0e172a] border border-slate-800">
                  <span className="text-slate-400 text-[10px] block">BATTERY & HEALTH</span>
                  <div className="flex items-center gap-2 mt-1">
                    <Battery className="w-4 h-4 text-emerald-400" />
                    <span className="font-bold text-white">{telemetry.batteryPercent}% ({(telemetry.batteryVoltage || 0).toFixed(1)}V)</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">Hardware Link Normal</span>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Photo Inspector Lightbox */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-60 bg-black/95 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-xl bg-[#0e172a] border border-slate-700 rounded-2xl overflow-hidden p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-300">
              <span>CAPTURED PHOTO #{selectedPhoto.id.slice(-8)}</span>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>
            <img
              src={selectedPhoto.imageDataUrl}
              alt="Recon Preview"
              className="w-full max-h-[65vh] object-contain rounded-lg bg-black"
            />
            <div className="flex items-center justify-between text-xs font-mono text-slate-400 pt-1">
              <span>ALT: {selectedPhoto.altitudeAgl.toFixed(1)}m</span>
              <span>{new Date(selectedPhoto.timestamp).toLocaleTimeString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnifiedCameraIntelligenceModal;
