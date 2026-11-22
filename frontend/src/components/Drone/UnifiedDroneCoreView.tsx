import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Video,
  Radio,
  Wifi,
  Battery,
  RotateCw,
  Sun,
  ShieldCheck,
  ShieldAlert,
  Sliders,
  Maximize2,
  RefreshCw,
  Power,
  Play,
  Square,
  Flashlight,
  LogOut,
  MapPin,
  Target,
  QrCode,
  Flame,
  CheckCircle2,
  AlertTriangle,
  Send,
  Activity,
  Layers,
  ChevronRight,
  Eye
} from 'lucide-react';
import { DroneTelemetry } from '../../types/mission';
import { PixhawkConnectionState } from '../../types/mavlink';
import { RunnerLinkState } from '../../types/runner';
import { droneCameraStreamService, DroneCameraStreamStatus } from '../../services/droneCameraStreamService';
import { dronePortStreamingService, DronePortStreamState } from '../../services/dronePortStreamingService';
import { phoneDeviceService } from '../../services/phoneDeviceService';
import { mavlinkService } from '../../services/mavlinkService';
import { geofenceService } from '../../services/geofenceService';
import { targetDetectionEngine, CapturedAreaImage } from '../../services/targetDetectionEngine';
import { reconDetectionService } from '../../services/reconDetectionService';
import { audioService } from '../../services/audioService';
import { decodeQRFromImageData } from '../../services/qrDecoderService';
import { SimpleConnectionIndicators } from '../common/SimpleConnectionIndicators';

interface UnifiedDroneCoreViewProps {
  telemetry: DroneTelemetry;
  pixhawkState: PixhawkConnectionState;
  runnerLink?: RunnerLinkState;
  onLogout?: () => void;
  onEmergencyRTL?: () => void;
  className?: string;
}

export const UnifiedDroneCoreView: React.FC<UnifiedDroneCoreViewProps> = ({
  telemetry,
  pixhawkState,
  runnerLink,
  onLogout,
  onEmergencyRTL,
  className = ''
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const heatmapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wakeLockRef = useRef<any>(null);

  // Active View Tab for Mobile/Tablet layout: Prioritize HEATMAP over optical-stream (Requirement 4)
  const [activeTab, setActiveTab] = useState<'HEATMAP' | 'STREAM' | 'INTELLIGENCE' | 'CONTROLS'>('HEATMAP');

  // Real-Time Optical Ground Reconnaissance Matrix Metrics
  const [heatmapStats, setHeatmapStats] = useState({
    fps: 11,
    sharpness: 72,
    boxCandidates: 0,
    qrDetections: 0,
  });

  // Automated Photo Capture & QR Analysis Engine (Requirement 5)
  const [autoScanStatus, setAutoScanStatus] = useState<string>('AUTO-CAPTURE: ACTIVE (DISCARD ON NO-QR)');
  const [scannedFramesCount, setScannedFramesCount] = useState<number>(0);
  const [retainedQRCount, setRetainedQRCount] = useState<number>(0);

  // Streaming State & Synchronization with Ground Station
  const [isStreaming, setIsStreaming] = useState<boolean>(true);
  const [streamStatus, setStreamStatus] = useState<DroneCameraStreamStatus>('WAITING_FOR_CAMERA');
  const [fps, setFps] = useState<number>(30);
  const [targetResolution, setTargetResolution] = useState<'720p' | '1080p'>('720p');
  const [mountRotation, setMountRotation] = useState<0 | 90 | 180 | 270>(0);
  const [torchActive, setTorchActive] = useState<boolean>(false);
  const [capturedImages, setCapturedImages] = useState<CapturedAreaImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<CapturedAreaImage | null>(null);
  const [forceArm, setForceArm] = useState<boolean>(false);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);

  // Optical Recon detections
  const [detections, setDetections] = useState(() => reconDetectionService.getDetections());
  const [latestDetection, setLatestDetection] = useState(() => reconDetectionService.getLatestDetection());

  const isWifiConnected = typeof navigator !== 'undefined' ? navigator.onLine : false;
  const isMavlinkConnected = pixhawkState.isConnected;
  const isPixhawkConnected = pixhawkState.isConnected;

  const showNotice = (msg: string) => {
    setFeedbackNotice(msg);
    setTimeout(() => setFeedbackNotice(null), 3000);
  };

  // 1. Initialize Screen Wake Lock
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        }
      } catch (err) {}
    };
    requestWakeLock();
    return () => {
      if (wakeLockRef.current) {
        try { wakeLockRef.current.release(); } catch (e) {}
      }
    };
  }, []);

  // 2. Camera Ingestion & Publishing to Ground Station
  useEffect(() => {
    let activeStream: MediaStream | null = null;
    let isCancelled = false;

    const startCamera = async () => {
      try {
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: targetResolution === '1080p' ? { ideal: 1920 } : { ideal: 1280 },
            height: targetResolution === '1080p' ? { ideal: 1080 } : { ideal: 720 },
            frameRate: { ideal: 30 }
          }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        activeStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }

        // Broadcast to Ground Station via droneCameraStreamService
        droneCameraStreamService.setAirGapped(false);
        droneCameraStreamService.startPublishing(stream, videoRef.current);
        dronePortStreamingService.startStreaming();
        setIsStreaming(true);
      } catch (err: any) {
        console.warn('[DRONE CORE] Camera access warning:', err);
        setStreamStatus('CAMERA_OFFLINE');
      }
    };

    startCamera();

    const unsubStatus = droneCameraStreamService.subscribeStatus((st) => {
      setStreamStatus(st);
    });

    const unsubDetections = reconDetectionService.subscribeDetections((recs) => {
      setDetections(recs);
      setLatestDetection(reconDetectionService.getLatestDetection());
    });

    const unsubImages = targetDetectionEngine.subscribeCapturedImages((imgs) => {
      setCapturedImages(imgs);
    });

    return () => {
      isCancelled = true;
      unsubStatus();
      unsubDetections();
      unsubImages();
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
      }
      droneCameraStreamService.stopPublishing();
    };
  }, [targetResolution]);

  // Torch Toggle
  const toggleTorch = async () => {
    const next = !torchActive;
    const res = await phoneDeviceService.setTorch(next);
    if (res.success) {
      setTorchActive(next);
      showNotice(next ? 'Torch ON' : 'Torch OFF');
    } else {
      showNotice(res.message);
    }
  };

  // Cycle Rotation
  const cycleRotation = () => {
    const nextMap: Record<number, 0 | 90 | 180 | 270> = {
      0: 90,
      90: 180,
      180: 270,
      270: 0
    };
    setMountRotation(nextMap[mountRotation]);
  };

  // Toggle Live Broadcast to Ground Station
  const toggleBroadcast = () => {
    if (isStreaming) {
      droneCameraStreamService.stopPublishing();
      dronePortStreamingService.stopStreaming();
      setIsStreaming(false);
      showNotice('Broadcasting to Ground Station: PAUSED');
    } else {
      if (videoRef.current && videoRef.current.srcObject) {
        droneCameraStreamService.startPublishing(videoRef.current.srcObject as MediaStream, videoRef.current);
        dronePortStreamingService.startStreaming();
      }
      setIsStreaming(true);
      showNotice('Broadcasting to Ground Station: ACTIVE');
    }
  };

  // 1. Dynamic Real-Time Heatmap Generation Engine (Requirement 4: Updates dynamically from camera/video feed)
  useEffect(() => {
    let animId: number;
    let lastRenderTime = performance.now();
    let frameCount = 0;
    const gridCols = 16;
    const gridRows = 12;
    const heatMatrix: number[][] = Array.from({ length: gridRows }, () => Array(gridCols).fill(0.15));

    const analysisCanvas = document.createElement('canvas');
    analysisCanvas.width = gridCols;
    analysisCanvas.height = gridRows;
    const analysisCtx = analysisCanvas.getContext('2d', { willReadFrequently: true });

    const updateHeatmap = () => {
      animId = requestAnimationFrame(updateHeatmap);

      const now = performance.now();
      if (now - lastRenderTime < 95) return; // ~10.5 FPS dynamic refresh
      const deltaMs = now - lastRenderTime;
      lastRenderTime = now;
      frameCount++;

      const video = videoRef.current;
      const canvas = heatmapCanvasRef.current;
      if (!video || !canvas || video.readyState < 2 || video.paused) return;

      const cWidth = canvas.width || (canvas.width = canvas.parentElement?.clientWidth || 360);
      const cHeight = canvas.height || (canvas.height = canvas.parentElement?.clientHeight || 260);
      const ctx = canvas.getContext('2d');
      if (!ctx || !analysisCtx) return;

      analysisCtx.drawImage(video, 0, 0, gridCols, gridRows);
      const imgData = analysisCtx.getImageData(0, 0, gridCols, gridRows);
      const data = imgData.data;

      let activeHotspots = 0;
      let totalIntensity = 0;
      let maxVal = 0;

      for (let y = 0; y < gridRows; y++) {
        for (let x = 0; x < gridCols; x++) {
          const idx = (y * gridCols + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];

          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const isCardboardTone = r > 80 && r > g && g > b && (r - b) > 30;
          const contrast = Math.abs(r - g) + Math.abs(g - b);

          let cellSignal = (lum / 255) * 0.35 + (contrast / 255) * 0.45;
          if (isCardboardTone) cellSignal += 0.35;

          heatMatrix[y][x] = heatMatrix[y][x] * 0.72 + cellSignal * 0.28;
          const currentVal = Math.min(1.0, heatMatrix[y][x]);

          if (currentVal > 0.55) activeHotspots++;
          if (currentVal > maxVal) maxVal = currentVal;
          totalIntensity += currentVal;
        }
      }

      ctx.clearRect(0, 0, cWidth, cHeight);

      const cellW = cWidth / gridCols;
      const cellH = cHeight / gridRows;

      // Render tactical optical grid (honest surface inspection without decorative thermal bubbles)
      for (let y = 0; y < gridRows; y++) {
        for (let x = 0; x < gridCols; x++) {
          const val = heatMatrix[y][x];
          const px = x * cellW;
          const py = y * cellH;

          // Draw base cell tint reflecting optical contrast/confidence
          if (val > 0.65) {
            ctx.fillStyle = 'rgba(245, 158, 11, 0.22)'; // Amber for box target candidate
          } else if (val > 0.40) {
            ctx.fillStyle = 'rgba(6, 182, 212, 0.12)';  // Subtle cyan for inspected terrain
          } else {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';   // Dark slate base
          }
          ctx.fillRect(px, py, cellW, cellH);
        }
      }

      // Draw subtle gridlines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= gridCols; x++) {
        ctx.beginPath();
        ctx.moveTo(x * cellW, 0);
        ctx.lineTo(x * cellW, cHeight);
        ctx.stroke();
      }
      for (let y = 0; y <= gridRows; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * cellH);
        ctx.lineTo(cWidth, y * cellH);
        ctx.stroke();
      }

      // Highlight target candidate cells with crisp aerospace bounding boxes
      for (let y = 0; y < gridRows; y++) {
        for (let x = 0; x < gridCols; x++) {
          if (heatMatrix[y][x] > 0.70) {
            const cx = (x + 0.5) * cellW;
            const cy = (y + 0.5) * cellH;
            ctx.strokeStyle = '#F59E0B'; // Amber bounding box
            ctx.lineWidth = 1.5;
            ctx.strokeRect(cx - cellW * 0.45, cy - cellH * 0.45, cellW * 0.9, cellH * 0.9);
            ctx.fillStyle = '#F59E0B';
            ctx.font = 'bold 8.5px monospace';
            ctx.fillText('CANDIDATE', cx - cellW * 0.40, cy - cellH * 0.48);
          }
        }
      }

      if (frameCount % 10 === 0) {
        const meanSharpness = Math.round((totalIntensity / (gridCols * gridRows)) * 100);
        setHeatmapStats({
          fps: Math.round(1000 / Math.max(deltaMs, 1)),
          sharpness: Math.min(100, Math.max(20, meanSharpness)),
          boxCandidates: activeHotspots,
          qrDetections: capturedImages.length,
        });
      }
    };

    animId = requestAnimationFrame(updateHeatmap);
    return () => cancelAnimationFrame(animId);
  }, []);

  // 2. Automated Photo Capture & QR Analysis Engine (Requirement 5)
  // Automatically captures photo, decodes QR, deletes photo if no QR, retains if QR found.
  useEffect(() => {
    const autoScanInterval = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.paused || video.ended) return;

      try {
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 480;
        if (vw === 0 || vh === 0) return;

        const scanCanvas = document.createElement('canvas');
        scanCanvas.width = vw;
        scanCanvas.height = vh;
        const sCtx = scanCanvas.getContext('2d', { willReadFrequently: true });
        if (!sCtx) return;

        sCtx.drawImage(video, 0, 0, vw, vh);
        const imgData = sCtx.getImageData(0, 0, vw, vh);

        setScannedFramesCount((prev) => prev + 1);

        const result = await decodeQRFromImageData(imgData);

        if (result && (result.twoDigits || result.text)) {
          const codeVal = result.twoDigits || result.text.trim();
          // QR CODE DETECTED: RETAIN PHOTO
          const snap = targetDetectionEngine.captureAreaSnapshot({
            canvas: scanCanvas,
            telemetry: {
              lat: telemetry.latitude,
              lon: telemetry.longitude,
              altAgl: telemetry.altitude,
              heading: telemetry.heading,
            },
            bboxNormalized: { nx: 0.5, ny: 0.5, w: 0.35, h: 0.35 },
            sharpness: 90,
            qrPayload: codeVal,
          });

          if (snap) {
            reconDetectionService.recordDetection({
              payload: codeVal,
              twoDigitCode: codeVal,
              photoDataUrl: snap.imageDataUrl,
              droneLatitude: telemetry.latitude,
              droneLongitude: telemetry.longitude,
            });

            audioService.playBeep(980, 150);
            setRetainedQRCount((prev) => prev + 1);
            showNotice(`🎯 QR Found: ${codeVal} (Photo Retained)`);
            setAutoScanStatus(`QR DETECTED: [${codeVal}] • PHOTO RETAINED`);
          }
        } else {
          // NO QR DETECTED: AUTOMATICALLY DELETED / DISCARDED (Memory freed, not saved)
          setAutoScanStatus('AUTO-SCAN: NO QR FOUND (PHOTO DISCARDED)');
        }
      } catch (err) {}
    }, 1800);

    return () => clearInterval(autoScanInterval);
  }, [telemetry]);

  // Arm/Disarm Handlers
  const handleArm = async () => {
    const check = geofenceService.canArmVehicle(telemetry.latitude, telemetry.longitude);
    if (!check.canArm && !forceArm) {
      audioService.playBeep(350, 200);
      showNotice(`❌ ${check.reason}`);
      return;
    }
    audioService.playBeep(850, 100);
    try {
      await mavlinkService.sendArmCommand(forceArm);
      showNotice('ARM command dispatched');
    } catch (e: any) {
      showNotice(`Arm failed: ${e?.message}`);
    }
  };

  const handleDisarm = async () => {
    audioService.playBeep(450, 100);
    try {
      await mavlinkService.sendDisarmCommand(forceArm);
      showNotice('DISARM command dispatched');
    } catch (e: any) {
      showNotice(`Disarm failed: ${e?.message}`);
    }
  };

  const geofenceCheck = geofenceService.canArmVehicle(telemetry.latitude, telemetry.longitude);

  return (
    <div className={`h-[100dvh] w-full bg-[#070b14] text-slate-100 flex flex-col font-sans select-none overflow-x-hidden ${className}`}>
      
      {/* 1. TOP HEADER & COMPACT 3-SYMBOL CONNECTION BAR (SKYCON BRANDING - Requirement 6) */}
      <header className="h-[54px] px-3 sm:px-4 bg-[#0c1322] border-b border-slate-800 flex items-center justify-between shrink-0 z-30 shadow-md">
        {/* Left: SKYCON Branding & Role Identity */}
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-950/80 border border-emerald-500/50 flex items-center justify-center text-emerald-400 font-black shrink-0">
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <div className="min-w-0">
            <span className="font-orbitron font-extrabold text-[13px] sm:text-[14px] tracking-wide text-white block leading-none truncate">
              SKYCON DRONE CORE
            </span>
            <span className="text-[9.5px] sm:text-[10px] text-slate-400 font-mono block truncate">
              DYNAMIC HEATMAP &amp; RECON ENGINE
            </span>
          </div>
        </div>

        {/* Center: Simplified 3-Symbol Indicators (Wi-Fi, MAVLink, Pixhawk) */}
        <div className="flex items-center gap-2">
          <SimpleConnectionIndicators
            isWifiConnected={isWifiConnected}
            isMavlinkConnected={isMavlinkConnected}
            isPixhawkConnected={isPixhawkConnected}
          />
        </div>

        {/* Right: Quick State & Logout */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="px-2 py-0.5 rounded bg-[#11161F] border border-slate-800 text-[10px] font-mono text-emerald-400 font-bold hidden xs:inline-block">
            {telemetry.flightMode || 'DISARMED'}
          </div>

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="px-2.5 py-1 rounded-lg bg-red-950/60 hover:bg-red-900/80 border border-red-500/50 text-red-300 hover:text-white text-[11px] font-sans font-bold flex items-center gap-1 transition cursor-pointer active:scale-95 shrink-0"
              title="Log Out of Drone Core"
            >
              <LogOut className="w-3 h-3" />
              <span className="hidden sm:inline">LOGOUT</span>
            </button>
          )}
        </div>
      </header>

      {/* Action Notification Toast */}
      {feedbackNotice && (
        <div className="fixed top-16 right-4 z-50 bg-[#161B22] border border-emerald-400/80 text-white px-3 py-1.5 rounded-lg text-xs font-mono shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>{feedbackNotice}</span>
        </div>
      )}

      {/* 2. CONSOLIDATED NAVIGATION TABS (Prioritizing REAL-TIME HEATMAP - Requirement 4) */}
      <div className="px-2 sm:px-4 py-1.5 bg-[#090e1a] border-b border-slate-800/80 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1 w-full max-w-lg mx-auto bg-[#11161F] p-1 rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('HEATMAP')}
            className={`flex-1 py-1.5 rounded-md text-[11px] sm:text-xs font-mono font-bold flex items-center justify-center gap-1 transition cursor-pointer ${
              activeTab === 'HEATMAP'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-amber-300" />
            <span>HEATMAP</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('STREAM')}
            className={`flex-1 py-1.5 rounded-md text-[11px] sm:text-xs font-mono font-bold flex items-center justify-center gap-1 transition cursor-pointer ${
              activeTab === 'STREAM'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>OPTICAL</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('INTELLIGENCE')}
            className={`flex-1 py-1.5 rounded-md text-[11px] sm:text-xs font-mono font-bold flex items-center justify-center gap-1 transition cursor-pointer ${
              activeTab === 'INTELLIGENCE'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            <span>QR ({capturedImages.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('CONTROLS')}
            className={`flex-1 py-1.5 rounded-md text-[11px] sm:text-xs font-mono font-bold flex items-center justify-center gap-1 transition cursor-pointer ${
              activeTab === 'CONTROLS'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>CONTROLS</span>
          </button>
        </div>
      </div>

      {/* 3. MAIN CONTENT AREA */}
      <main className="flex-1 min-h-0 flex flex-col p-2 sm:p-3 overflow-y-auto">
        
        {/* TAB 1: REAL-TIME DYNAMIC HEATMAP GENERATION (Prioritized View - Requirement 4) */}
        {activeTab === 'HEATMAP' && (
          <div className="flex-1 flex flex-col gap-2 min-h-0">
            {/* Dynamic Heatmap Canvas Container */}
            <div className="relative flex-1 rounded-xl bg-black border border-amber-500/40 overflow-hidden flex items-center justify-center min-h-[240px] shadow-lg">
              {/* Actual Real-Time Dynamic Heatmap Canvas driven by Camera Frame analysis */}
              <canvas
                ref={heatmapCanvasRef}
                className="w-full h-full object-cover select-none"
              />

              {/* PiP Viewfinder Thumbnail in Corner */}
              <div className="absolute top-2 right-2 w-28 h-20 rounded-lg bg-black/90 border border-slate-700 overflow-hidden shadow-2xl z-20 pointer-events-none">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  style={{
                    transform: `rotate(${mountRotation}deg)`,
                    transformOrigin: 'center center'
                  }}
                  className="w-full h-full object-cover"
                />
                <span className="absolute bottom-0.5 right-1 text-[8.5px] font-mono text-emerald-400 font-bold bg-black/80 px-1 rounded">
                  OPTICAL PiP
                </span>
              </div>

              {/* Optical Ground Reconnaissance HUD */}
              <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/80 backdrop-blur-md border border-cyan-500/60 text-[10px] font-mono font-bold z-10 text-cyan-300">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                <span>OPTICAL RECON MATRIX ({heatmapStats.fps} FPS)</span>
              </div>

              {/* Real-time Optical Recon Metrics Overlay */}
              <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] font-mono bg-black/80 backdrop-blur-md border border-slate-800 p-1.5 rounded-lg text-slate-300 z-10">
                <span className="text-cyan-300 font-bold">SHARPNESS: {heatmapStats.sharpness}</span>
                <span>BOX CANDIDATES: {heatmapStats.boxCandidates}</span>
                <span className="text-emerald-400 font-bold">CONFIRMED QR: {capturedImages.length}</span>
                <span>ALT: {(telemetry.altitude || 0).toFixed(1)}m</span>
              </div>
            </div>

            {/* Quick Action Controls Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-1.5 shrink-0">
              {/* Auto-Capture Status Indicator (Manual Capture Button Removed - Requirement 5) */}
              <div className="py-2.5 px-3 rounded-lg bg-[#0e1726] border border-cyan-500/40 text-cyan-300 font-mono font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm sm:col-span-1">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                <span className="truncate">{autoScanStatus}</span>
              </div>

              {/* GCS Stream Broadcast Toggle */}
              <button
                type="button"
                onClick={toggleBroadcast}
                className={`py-2.5 px-3 rounded-lg font-mono font-bold text-xs flex items-center justify-center gap-1.5 border transition cursor-pointer active:scale-95 ${
                  isStreaming
                    ? 'bg-rose-950/80 border-rose-500/60 text-rose-300'
                    : 'bg-slate-900 border-slate-700 text-slate-300'
                }`}
              >
                {isStreaming ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                <span>{isStreaming ? 'PAUSE GCS' : 'BROADCAST GCS'}</span>
              </button>

              {/* Torch Toggle (Kept working - Requirement 5) */}
              <button
                type="button"
                onClick={toggleTorch}
                className={`py-2.5 px-3 rounded-lg font-mono font-bold text-xs flex items-center justify-center gap-1.5 border transition cursor-pointer active:scale-95 ${
                  torchActive
                    ? 'bg-amber-500 text-slate-950 font-black'
                    : 'bg-slate-900 border-slate-700 text-slate-300'
                }`}
              >
                <Flashlight className="w-3.5 h-3.5" />
                <span>TORCH: {torchActive ? 'ON' : 'OFF'}</span>
              </button>

              {/* Mount Rotation */}
              <button
                type="button"
                onClick={cycleRotation}
                className="py-2.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-mono font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>ROTATE ({mountRotation}°)</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: OPTICAL STREAM (Viewfinder, Streaming Sync, Controls) */}
        {activeTab === 'STREAM' && (
          <div className="flex-1 flex flex-col gap-2 min-h-0">
            {/* Viewfinder Card */}
            <div className="relative flex-1 rounded-xl bg-black border border-slate-800 overflow-hidden flex items-center justify-center min-h-[220px]">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                style={{
                  transform: `rotate(${mountRotation}deg)`,
                  transformOrigin: 'center center'
                }}
                className="w-full h-full object-cover select-none"
              />

              {/* Viewfinder Tactical Crosshair Overlay */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="relative w-24 h-24 border border-emerald-500/40 rounded-full flex items-center justify-center">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full shadow-lg shadow-emerald-500/80 animate-ping" />
                  <div className="w-1.5 h-1.5 bg-emerald-300 rounded-full" />
                  <div className="absolute top-0 w-[1px] h-3 bg-emerald-400/80" />
                  <div className="absolute bottom-0 w-[1px] h-3 bg-emerald-400/80" />
                  <div className="absolute left-0 h-[1px] w-3 bg-emerald-400/80" />
                  <div className="absolute right-0 h-[1px] w-3 bg-emerald-400/80" />
                </div>
              </div>

              {/* Live Streaming Status Pill */}
              <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-md border border-slate-700 text-[10px] font-mono font-bold z-10">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isStreaming ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                  }`}
                />
                <span className={isStreaming ? 'text-emerald-300' : 'text-slate-400'}>
                  {isStreaming ? 'STREAMING SYNC ACTIVE' : 'STREAMING OFF'}
                </span>
              </div>

              {/* Telemetry Overlay Readout */}
              <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] font-mono bg-black/75 backdrop-blur-md border border-slate-800 p-1.5 rounded-lg text-slate-300 z-10">
                <span>ALT: {(telemetry.altitude || 0).toFixed(1)}m</span>
                <span>SPD: {(telemetry.groundSpeed || 0).toFixed(1)}m/s</span>
                <span>HDG: {Math.round(telemetry.heading || 0)}°</span>
                <span>BAT: {telemetry.batteryPercent}%</span>
              </div>
            </div>

            {/* Controls Bar without Manual Capture Button (Requirement 5) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 shrink-0">
              {/* GCS Stream Broadcast Toggle */}
              <button
                type="button"
                onClick={toggleBroadcast}
                className={`py-2.5 px-3 rounded-lg font-mono font-bold text-xs flex items-center justify-center gap-1.5 border transition cursor-pointer active:scale-95 ${
                  isStreaming
                    ? 'bg-rose-950/80 border-rose-500/60 text-rose-300'
                    : 'bg-slate-900 border-slate-700 text-slate-300'
                }`}
              >
                {isStreaming ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                <span>{isStreaming ? 'PAUSE STREAM' : 'BROADCAST GCS'}</span>
              </button>

              {/* Torch Toggle (Kept working - Requirement 5) */}
              <button
                type="button"
                onClick={toggleTorch}
                className={`py-2.5 px-3 rounded-lg font-mono font-bold text-xs flex items-center justify-center gap-1.5 border transition cursor-pointer active:scale-95 ${
                  torchActive
                    ? 'bg-amber-500 text-slate-950 font-black'
                    : 'bg-slate-900 border-slate-700 text-slate-300'
                }`}
              >
                <Flashlight className="w-3.5 h-3.5" />
                <span>TORCH: {torchActive ? 'ON' : 'OFF'}</span>
              </button>

              {/* Mount Rotation */}
              <button
                type="button"
                onClick={cycleRotation}
                className="py-2.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-mono font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>ROTATE ({mountRotation}°)</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: QR INTELLIGENCE & AUTO-RETAINED PHOTOS (Requirement 5) */}
        {activeTab === 'INTELLIGENCE' && (
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            {/* Decoded QR Code Recognition Card */}
            <div className="p-3 rounded-xl bg-[#0D1524] border border-emerald-500/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-950/80 border border-emerald-500/60 flex items-center justify-center text-emerald-400">
                  <QrCode className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-mono text-slate-400 block uppercase">
                    LATEST QR DETECTION
                  </span>
                  <span className="font-orbitron font-black text-xl text-emerald-400">
                    {latestDetection ? (latestDetection.twoDigitCode || latestDetection.payload || 'DETECTED') : 'AWAITING LOCK'}
                  </span>
                </div>
              </div>
              {latestDetection && (
                <div className="text-right text-[10px] font-mono text-slate-400">
                  <div>LAT: {latestDetection.droneLatitude.toFixed(5)}</div>
                  <div>LNG: {latestDetection.droneLongitude.toFixed(5)}</div>
                </div>
              )}
            </div>

            {/* Photo Capture Archive (Only Retained Photos with Detected QR Codes) */}
            <div className="flex-1 p-3 rounded-xl bg-[#0D1117] border border-slate-800 flex flex-col gap-2 min-h-0">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-300 border-b border-slate-800 pb-1.5">
                <div className="flex items-center gap-2">
                  <span>RETAINED QR PHOTOS ({capturedImages.length})</span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[9.5px]">
                    AUTO-FILTER ACTIVE
                  </span>
                </div>
                <span className="text-[9.5px] text-slate-500">Non-QR photos automatically deleted</span>
              </div>

              {capturedImages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs font-mono p-4 text-center">
                  <QrCode className="w-6 h-6 mb-1 text-slate-600" />
                  <span>No QR photos retained yet.</span>
                  <span className="text-[10px] text-slate-600 mt-1">Automatic scanner captures and verifies frames continuously. Photos without QR codes are automatically deleted.</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 overflow-y-auto">
                  {capturedImages.map((img) => (
                    <div
                      key={img.id}
                      onClick={() => setSelectedImage(img)}
                      className="bg-[#161B22] border border-emerald-500/40 rounded-lg p-1.5 flex flex-col gap-1 cursor-pointer hover:border-emerald-400 transition"
                    >
                      <img
                        src={img.imageDataUrl}
                        alt="Captured Frame"
                        className="w-full h-24 object-cover rounded bg-black"
                      />
                      <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                        <span className="text-emerald-400 font-bold">{img.decodedTwoDigitCode || img.qrPayload || 'QR CONFIRMED'}</span>
                        <span>ALT: {img.altitudeAgl.toFixed(1)}m</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: FLIGHT & MISSION CONTROLS */}
        {activeTab === 'CONTROLS' && (
          <div className="flex-1 flex flex-col gap-2.5 min-h-0">
            {/* Geofence Safety Banner */}
            <div
              className={`p-2.5 rounded-xl border text-xs font-mono flex items-center justify-between ${
                geofenceCheck.canArm
                  ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                  : 'bg-red-950/40 border-red-500/50 text-red-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {geofenceCheck.canArm ? <ShieldCheck className="w-4 h-4 text-emerald-400" /> : <ShieldAlert className="w-4 h-4 text-red-400" />}
                <span className="font-bold">
                  {geofenceCheck.canArm ? 'GEOFENCE LOCKED INSIDE' : 'ARM BLOCKED: OUTSIDE FENCE'}
                </span>
              </div>
              <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={forceArm}
                  onChange={(e) => setForceArm(e.target.checked)}
                  className="w-3.5 h-3.5 rounded bg-slate-900 border-slate-700 text-amber-500"
                />
                <span className={forceArm ? 'text-amber-300 font-bold' : 'text-slate-400'}>
                  Force Bypass
                </span>
              </label>
            </div>

            {/* Arm / Disarm Controls */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleArm}
                className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg active:scale-95 transition cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>ARM MOTORS</span>
              </button>
              <button
                type="button"
                onClick={handleDisarm}
                className="py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg active:scale-95 transition cursor-pointer"
              >
                <Power className="w-4 h-4" />
                <span>DISARM</span>
              </button>
            </div>

            {/* Emergency RTL Button */}
            {onEmergencyRTL && (
              <button
                type="button"
                onClick={onEmergencyRTL}
                className="w-full py-3 px-4 rounded-xl bg-red-700 hover:bg-red-600 text-white font-mono font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg active:scale-95 transition cursor-pointer border border-red-500"
              >
                <AlertTriangle className="w-4 h-4" />
                <span>EMERGENCY RETURN TO LAUNCH (RTL)</span>
              </button>
            )}

            {/* Real-time Telemetry Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-[#11161F] border border-slate-800">
                <span className="text-[10px] text-slate-400 block">ALTITUDE (AGL)</span>
                <span className="text-lg font-bold text-white">{(telemetry.altitude || 0).toFixed(1)}m</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#11161F] border border-slate-800">
                <span className="text-[10px] text-slate-400 block">GROUND SPEED</span>
                <span className="text-lg font-bold text-white">{(telemetry.groundSpeed || 0).toFixed(1)} m/s</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#11161F] border border-slate-800">
                <span className="text-[10px] text-slate-400 block">BATTERY</span>
                <span className="text-lg font-bold text-white">{telemetry.batteryPercent}% ({(telemetry.batteryVoltage || 0).toFixed(1)}V)</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#11161F] border border-slate-800">
                <span className="text-[10px] text-slate-400 block">FLIGHT MODE</span>
                <span className="text-lg font-bold text-emerald-400">{telemetry.flightMode || 'DISARMED'}</span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Image Detail Inspector Modal */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col p-4 items-center justify-center">
          <div className="w-full max-w-lg bg-[#161B22] border border-slate-700 rounded-xl overflow-hidden p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-300">
              <span>PHOTO #{selectedImage.id.slice(-8)}</span>
              <button
                type="button"
                onClick={() => setSelectedImage(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <img
              src={selectedImage.imageDataUrl}
              alt="Inspected Recon Photo"
              className="w-full max-h-[60vh] object-contain rounded bg-black"
            />
            <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
              <span>ALT: {selectedImage.altitudeAgl.toFixed(1)}m</span>
              <span>HDG: {Math.round(selectedImage.headingDeg)}°</span>
              <span>{new Date(selectedImage.timestamp).toLocaleTimeString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnifiedDroneCoreView;
