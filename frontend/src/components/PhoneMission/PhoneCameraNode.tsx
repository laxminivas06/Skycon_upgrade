import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Video,
  Radio,
  Wifi,
  WifiOff,
  Battery,
  RotateCw,
  Sun,
  ShieldCheck,
  ShieldAlert,
  Sliders,
  Maximize2,
  RefreshCw,
  Power
} from 'lucide-react';
import {
  droneCameraStreamService,
  DroneCameraStreamStatus
} from '../../services/droneCameraStreamService';
import { phoneDeviceService } from '../../services/phoneDeviceService';

export interface PhoneCameraNodeProps {
  onSwitchToFullDashboard?: () => void;
  className?: string;
}

export const PhoneCameraNode: React.FC<PhoneCameraNodeProps> = ({
  onSwitchToFullDashboard,
  className = ''
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);

  // Streaming State
  const [isStreaming, setIsStreaming] = useState<boolean>(true);
  const [streamStatus, setStreamStatus] = useState<DroneCameraStreamStatus>('CONNECTING');
  const [fps, setFps] = useState<number>(30);
  const [targetResolution, setTargetResolution] = useState<'720p' | '1080p'>('720p');
  const [mountRotation, setMountRotation] = useState<0 | 90 | 180 | 270>(0);
  const [framesSent, setFramesSent] = useState<number>(0);
  const [latencyMs, setLatencyMs] = useState<number>(0);

  // Hardware State
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState<boolean>(false);
  const [torchActive, setTorchActive] = useState<boolean>(false);
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);

  // 1. Initialize Screen Wake Lock (Keeps display ON during flight)
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
          setWakeLockActive(true);
        }
      } catch (err) {
        console.warn('[PHONE CAM] WakeLock request error:', err);
      }
    };

    requestWakeLock();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    });

    return () => {
      if (wakeLockRef.current) {
        try {
          wakeLockRef.current.release();
        } catch (e) {}
      }
    };
  }, []);

  // 2. Battery Status API
  useEffect(() => {
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        setBatteryLevel(Math.round(battery.level * 100));
        setIsCharging(battery.charging);

        battery.addEventListener('levelchange', () => {
          setBatteryLevel(Math.round(battery.level * 100));
        });
        battery.addEventListener('chargingchange', () => {
          setIsCharging(battery.charging);
        });
      }).catch(() => {});
    }
  }, []);

  // 3. Camera Stream Ingestion & Publishing
  useEffect(() => {
    let activeStream: MediaStream | null = null;
    let isCancelled = false;

    const startCamera = async () => {
      try {
        const width = targetResolution === '1080p' ? 1920 : 1280;
        const height = targetResolution === '1080p' ? 1080 : 720;

        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: { ideal: 'environment' }, // Back camera facing downward
            width: { ideal: width },
            height: { ideal: height },
            frameRate: { ideal: 30, max: 60 }
          },
          audio: false
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (isCancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        activeStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          phoneDeviceService.registerVideoTrack(videoTrack);
          const capabilities = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
          setHasTorch(Boolean((capabilities as any).torch));
        }

        // Start publishing stream over WebRTC and WebSocket frame relay
        droneCameraStreamService.setAirGapped(false);
        droneCameraStreamService.startPublishing(stream, videoRef.current);
        setStreamStatus('LIVE_FEED_CONNECTED');
      } catch (err) {
        console.error('[PHONE CAM] Camera access failed:', err);
        setStreamStatus('CAMERA_OFFLINE');
      }
    };

    startCamera();

    const unsubStatus = droneCameraStreamService.subscribeStatus((st) => {
      setStreamStatus(st);
    });

    return () => {
      isCancelled = true;
      unsubStatus();
      if (activeStream) {
        activeStream.getTracks().forEach(t => t.stop());
      }
      droneCameraStreamService.stopPublishing();
    };
  }, [targetResolution]);

  // 4. Local Frame Capture & Rate Monitor Loop
  useEffect(() => {
    let frameCounter = 0;
    let lastTime = performance.now();
    let isMounted = true;

    const loop = () => {
      if (!isMounted) return;

      const now = performance.now();
      frameCounter++;

      if (now - lastTime >= 1000) {
        setFps(frameCounter);
        setFramesSent(prev => prev + frameCounter);
        frameCounter = 0;
        lastTime = now;
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      isMounted = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  // Torch Toggle
  const toggleTorch = async () => {
    const next = !torchActive;
    await phoneDeviceService.setTorch(next);
    setTorchActive(next);
  };

  // Cycle Mount Rotation
  const cycleRotation = () => {
    const nextMap: Record<number, 0 | 90 | 180 | 270> = {
      0: 90,
      90: 180,
      180: 270,
      270: 0
    };
    setMountRotation(nextMap[mountRotation]);
  };

  return (
    <div className={`relative flex flex-col h-full w-full bg-black text-slate-100 select-none overflow-hidden ${className}`}>
      {/* 1. Fullscreen Camera Viewport */}
      <div className="relative flex-1 w-full bg-black flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          style={{
            transform: `rotate(${mountRotation}deg)`,
            transformOrigin: 'center center'
          }}
          className="w-full h-full object-cover transition-transform duration-300"
        />

        {/* Tactical Crosshair & Optical Center Overlay */}
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

        {/* 2. Top Tactical Status Bar */}
        <header className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/90 via-black/50 to-transparent flex items-center justify-between z-20">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-md shadow-emerald-500/80" />
            <div>
              <div className="text-[12px] font-mono font-bold tracking-wider text-emerald-400 flex items-center gap-1.5">
                <span>ONBOARD IPHONE CAMERA</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-mono">
                  {targetResolution} @ {fps} FPS
                </span>
              </div>
              <div className="text-[9px] font-mono text-slate-400">
                ROTATION: {mountRotation}° | WAKE-LOCK: {wakeLockActive ? 'ACTIVE' : 'OFF'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {batteryLevel !== null && (
              <div className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900/80 border border-slate-800 text-[11px] font-mono text-slate-300">
                <Battery className={`w-3.5 h-3.5 ${isCharging ? 'text-emerald-400' : batteryLevel < 20 ? 'text-rose-400' : 'text-slate-300'}`} />
                <span>{batteryLevel}%</span>
              </div>
            )}

            {onSwitchToFullDashboard && (
              <button
                type="button"
                onClick={onSwitchToFullDashboard}
                className="px-2.5 py-1 rounded bg-sky-950/70 hover:bg-sky-900/80 border border-sky-500/40 text-[10px] font-mono text-sky-300 font-bold transition"
              >
                FULL HUD
              </button>
            )}
          </div>
        </header>

        {/* 3. Bottom Quick Flight Controls */}
        <footer className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/95 via-black/60 to-transparent flex items-center justify-between z-20">
          <div className="flex items-center gap-2">
            {/* Rotation Adjust */}
            <button
              type="button"
              onClick={cycleRotation}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-700 text-xs font-mono text-slate-200 hover:bg-slate-800 active:scale-95 transition"
              title="Rotate Camera 90°"
            >
              <RotateCw className="w-3.5 h-3.5 text-amber-400" />
              <span>{mountRotation}°</span>
            </button>

            {/* Flashlight / Torch Toggle */}
            {hasTorch && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-mono transition active:scale-95 ${
                  torchActive
                    ? 'bg-amber-500 text-black border-amber-400 font-bold shadow-lg shadow-amber-500/50'
                    : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
                title="Toggle Lens Torch"
              >
                <Sun className="w-3.5 h-3.5" />
                <span>TORCH</span>
              </button>
            )}

            {/* Resolution Switcher */}
            <button
              type="button"
              onClick={() => setTargetResolution(targetResolution === '720p' ? '1080p' : '720p')}
              className="px-2.5 py-2 rounded-lg bg-slate-900/90 border border-slate-700 text-xs font-mono text-slate-300 hover:bg-slate-800 active:scale-95 transition"
            >
              {targetResolution.toUpperCase()}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-lg bg-slate-950/90 border border-slate-800 text-right">
              <div className="text-[10px] font-mono text-slate-400">PI RELAY STREAM</div>
              <div className="text-[12px] font-mono font-bold text-emerald-400">
                {streamStatus === 'LIVE_FEED_CONNECTED' ? 'TRANSMITTING' : streamStatus}
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default PhoneCameraNode;
