import React, { useState, useEffect, useRef } from 'react';
import {
  Video,
  WifiOff,
  RefreshCw,
  Radio,
  Play,
  Square,
  Loader2,
  X
} from 'lucide-react';
import {
  droneCameraStreamService,
  DroneCameraStreamStatus
} from '../../services/droneCameraStreamService';
import {
  dronePortStreamingService,
  DronePortStreamState
} from '../../services/dronePortStreamingService';

interface LiveVideoFeedProps {
  className?: string;
  large?: boolean;
  onClose?: () => void;
}

export const LiveVideoFeed: React.FC<LiveVideoFeedProps> = ({
  className = '',
  large = false,
  onClose
}) => {
  const droneVideoRef = useRef<HTMLVideoElement | null>(null);

  // Drone Core direct stream state & Drone Port streaming state (strictly OFF by default)
  const [droneStream, setDroneStream] = useState<MediaStream | null>(() => droneCameraStreamService.getMediaStream());
  const [droneFrame, setDroneFrame] = useState<string | null>(() => droneCameraStreamService.getLatestFrame());
  const [droneStreamStatus, setDroneStreamStatus] = useState<DroneCameraStreamStatus>(() => droneCameraStreamService.getCurrentStatus());
  const [streamState, setStreamState] = useState<DronePortStreamState>(() => dronePortStreamingService.getStreamState());

  // Subscribe to stream updates (DO NOT auto-start streaming)
  useEffect(() => {
    const unsubPort = dronePortStreamingService.subscribe((st) => setStreamState(st));
    const unsubStream = droneCameraStreamService.subscribeStream((s) => setDroneStream(s));
    const unsubFrame = droneCameraStreamService.subscribeFrame((f) => setDroneFrame(f));
    const unsubStatus = droneCameraStreamService.subscribeStatus((st) => setDroneStreamStatus(st));

    return () => {
      unsubPort();
      unsubStream();
      unsubFrame();
      unsubStatus();
    };
  }, []);

  // Synchronize Drone Core MediaStream to video element
  useEffect(() => {
    if (droneVideoRef.current) {
      if (droneStream && streamState === 'STREAMING_ACTIVE') {
        if (droneVideoRef.current.srcObject !== droneStream) {
          droneVideoRef.current.srcObject = droneStream;
          droneVideoRef.current.play().catch(() => {});
        }
      } else {
        droneVideoRef.current.srcObject = null;
      }
    }
  }, [droneStream, streamState]);

  const isDroneLive = streamState === 'STREAMING_ACTIVE' && Boolean(droneStream || droneFrame);

  const handleToggleStreaming = async () => {
    if (streamState === 'STREAMING_ACTIVE' || streamState === 'STARTING') {
      dronePortStreamingService.stopStreaming();
    } else {
      await dronePortStreamingService.startStreaming();
    }
  };

  const getStatusBadge = () => {
    switch (streamState) {
      case 'STREAMING_ACTIVE':
        return {
          label: 'STREAMING ACTIVE',
          color: 'text-emerald-400 border-emerald-500/60 bg-emerald-950/80 shadow-emerald-950/60',
          icon: Radio
        };
      case 'STARTING':
        return {
          label: 'STARTING',
          color: 'text-amber-400 border-amber-500/60 bg-amber-950/80 animate-pulse',
          icon: RefreshCw
        };
      case 'CONNECTION_UNAVAILABLE':
        return {
          label: 'CONNECTION UNAVAILABLE',
          color: 'text-rose-400 border-rose-500/60 bg-rose-950/80',
          icon: WifiOff
        };
      case 'STREAMING_OFF':
      default:
        return {
          label: 'STREAMING OFF',
          color: 'text-slate-400 border-slate-700 bg-slate-900/90',
          icon: Video
        };
    }
  };

  const statusConfig = getStatusBadge();
  const StatusIcon = statusConfig.icon;

  return (
    <div
      className={`relative bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex flex-col font-mono select-none ${className}`}
    >
      {/* Header overlay */}
      <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-20 pointer-events-none">
        <div
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border text-[10px] sm:text-[11px] font-black backdrop-blur-md shadow-md ${statusConfig.color}`}
        >
          <StatusIcon className={`w-3 h-3 ${streamState === 'STREAMING_ACTIVE' ? 'animate-pulse' : streamState === 'STARTING' ? 'animate-spin' : ''}`} />
          <span>{statusConfig.label}</span>
        </div>

        <div className="flex items-center space-x-1.5 pointer-events-auto">
          {/* Explicit Start/Stop Streaming Control */}
          <button
            type="button"
            onClick={handleToggleStreaming}
            disabled={streamState === 'STARTING'}
            className={`px-2 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition cursor-pointer shadow-sm ${
              streamState === 'STREAMING_ACTIVE'
                ? 'bg-rose-950/80 border-rose-600/70 text-rose-300 hover:bg-rose-900/90'
                : streamState === 'STARTING'
                ? 'bg-amber-950/80 border-amber-600/70 text-amber-300 cursor-wait'
                : 'bg-emerald-950/80 border-emerald-600/70 text-emerald-300 hover:bg-emerald-900/90'
            }`}
            title={streamState === 'STREAMING_ACTIVE' ? 'Stop Drone Port stream' : 'Start Drone Port stream'}
          >
            {streamState === 'STREAMING_ACTIVE' ? (
              <>
                <Square className="w-2.5 h-2.5 fill-current" />
                <span>STOP</span>
              </>
            ) : streamState === 'STARTING' ? (
              <>
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                <span>STARTING</span>
              </>
            ) : (
              <>
                <Play className="w-2.5 h-2.5 fill-current" />
                <span>START STREAM</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => droneCameraStreamService.reconnect()}
            className="p-1.5 rounded-lg bg-slate-900/90 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer shadow-sm"
            title="Reconnect video stream"
          >
            <RefreshCw className="w-3 h-3" />
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg bg-slate-900/90 border border-slate-700 text-slate-400 hover:text-white hover:bg-rose-950/80 transition cursor-pointer shadow-sm"
              title="Close Camera View"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Video Viewport Area */}
      <div className="relative flex-1 flex items-center justify-center min-h-[180px] bg-slate-950 overflow-hidden">
        {isDroneLive ? (
          <div className="w-full h-full relative flex items-center justify-center bg-black overflow-hidden">
            <video
              ref={droneVideoRef}
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
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center space-y-2 p-4 text-center z-10 font-mono">
            <div className="w-12 h-12 rounded-xl border border-slate-800 bg-[#0D1524] flex items-center justify-center text-sky-400 shadow-xl">
              <Video className="w-6 h-6" />
            </div>
            <div>
              <div className="text-slate-200 font-extrabold text-xs uppercase tracking-wider">
                {statusConfig.label}
              </div>
              <div className="text-slate-400 text-[10px] mt-0.5 max-w-[260px]">
                {streamState === 'STREAMING_OFF'
                  ? 'Drone Port streaming is OFF by default. Click Start Streaming to initiate video.'
                  : streamState === 'STARTING'
                  ? 'Initializing Drone Port video transport pipeline...'
                  : streamState === 'CONNECTION_UNAVAILABLE'
                  ? 'Camera service or Drone Port connection unavailable. Check network link.'
                  : 'Direct feed from Drone Core optical sensor.'}
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              {streamState === 'STREAMING_OFF' ? (
                <button
                  type="button"
                  onClick={handleToggleStreaming}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black uppercase tracking-wider flex items-center space-x-1.5 transition cursor-pointer shadow-md shadow-emerald-950"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>START STREAMING</span>
                </button>
              ) : streamState === 'CONNECTION_UNAVAILABLE' ? (
                <button
                  type="button"
                  onClick={handleToggleStreaming}
                  className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-black uppercase tracking-wider flex items-center space-x-1.5 transition cursor-pointer shadow-md shadow-sky-950"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>RETRY CONNECTION</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => droneCameraStreamService.reconnect()}
                  className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-black uppercase tracking-wider flex items-center space-x-1.5 transition cursor-pointer shadow-md shadow-sky-950"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>RECONNECT FEED</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom subtle indicator */}
      <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between z-10 pointer-events-none">
        <div className="bg-slate-900/80 backdrop-blur-md px-2 py-0.5 rounded border border-slate-800 text-[9px] text-slate-400 flex items-center space-x-1">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
          <span>DRONE ONBOARD CAMERA</span>
        </div>
        {isDroneLive && (
          <div className="bg-emerald-950/80 border border-emerald-500/40 px-1.5 py-0.5 rounded text-emerald-300 text-[9px] font-black">
            ● LIVE STREAM
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveVideoFeed;

