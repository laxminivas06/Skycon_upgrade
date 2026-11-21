/**
 * Drone Port & Video Streaming State Management Service
 * 
 * Master Prompt Rules:
 * - Drone Port streaming is OFF by default in the UI.
 * - Does not automatically start video or telemetry streaming from frontend.
 * - Only initiates streaming when the operator explicitly clicks Start Streaming.
 * - Provides 4 clear streaming states:
 *   1. STREAMING ACTIVE (Green)
 *   2. STREAMING OFF (Red/Inactive)
 *   3. STARTING (Yellow/Connecting)
 *   4. CONNECTION UNAVAILABLE (Grey/Status Unavailable)
 * - Preserves existing streaming functionality and API integration.
 */

import { droneCameraStreamService, DroneCameraStreamStatus } from './droneCameraStreamService';

export type DronePortStreamState =
  | 'STREAMING_ACTIVE'
  | 'STREAMING_OFF'
  | 'STARTING'
  | 'CONNECTION_UNAVAILABLE';

type StreamStateListener = (state: DronePortStreamState) => void;

class DronePortStreamingService {
  private currentState: DronePortStreamState = 'STREAMING_OFF'; // OFF BY DEFAULT
  private userStreamingRequested: boolean = false;
  private listeners: Set<StreamStateListener> = new Set();
  private unsubStreamStatus: (() => void) | null = null;
  private unsubStreamFrame: (() => void) | null = null;
  private startingTimeout: any = null;

  constructor() {
    this.initStatusListener();
    // Auto-subscribe to Drone Core stream signals
    droneCameraStreamService.startSubscribing();
  }

  private initStatusListener() {
    this.unsubStreamStatus = droneCameraStreamService.subscribeStatus((st: DroneCameraStreamStatus) => {
      switch (st) {
        case 'LIVE_FEED_CONNECTED':
          if (this.startingTimeout) clearTimeout(this.startingTimeout);
          this.userStreamingRequested = true;
          this.setState('STREAMING_ACTIVE');
          break;
        case 'CONNECTING':
          if (this.userStreamingRequested) {
            this.setState('STARTING');
          }
          break;
        case 'CAMERA_OFFLINE':
          if (this.startingTimeout) clearTimeout(this.startingTimeout);
          this.userStreamingRequested = false;
          this.setState('STREAMING_OFF');
          break;
        case 'CONNECTION_LOST':
        case 'WAITING_FOR_CAMERA':
          if (this.userStreamingRequested) {
            this.setState('CONNECTION_UNAVAILABLE');
          } else {
            this.setState('STREAMING_OFF');
          }
          break;
        default:
          if (this.userStreamingRequested) {
            this.setState('CONNECTION_UNAVAILABLE');
          }
          break;
      }
    });

    // Auto-detect incoming live frame from Drone Core
    this.unsubStreamFrame = droneCameraStreamService.subscribeFrame((f) => {
      if (f && this.currentState !== 'STREAMING_ACTIVE') {
        if (this.startingTimeout) clearTimeout(this.startingTimeout);
        this.userStreamingRequested = true;
        this.setState('STREAMING_ACTIVE');
      }
    });
  }

  public getStreamState(): DronePortStreamState {
    return this.currentState;
  }

  public isStreaming(): boolean {
    return this.currentState === 'STREAMING_ACTIVE';
  }

  public isUserRequested(): boolean {
    return this.userStreamingRequested;
  }

  public async startStreaming(): Promise<void> {
    this.userStreamingRequested = true;
    this.setState('STARTING');

    try {
      droneCameraStreamService.startSubscribing();

      // Guard timeout: if no feed connects within 7s, mark as CONNECTION_UNAVAILABLE
      if (this.startingTimeout) clearTimeout(this.startingTimeout);
      this.startingTimeout = setTimeout(() => {
        if (this.userStreamingRequested && this.currentState === 'STARTING') {
          const currentCamStatus = droneCameraStreamService.getCurrentStatus();
          if (currentCamStatus !== 'LIVE_FEED_CONNECTED') {
            this.setState('CONNECTION_UNAVAILABLE');
          }
        }
      }, 7000);
    } catch (err) {
      console.error('[DRONE PORT] Failed to start streaming:', err);
      this.setState('CONNECTION_UNAVAILABLE');
    }
  }

  public stopStreaming(): void {
    this.userStreamingRequested = false;
    if (this.startingTimeout) clearTimeout(this.startingTimeout);
    try {
      droneCameraStreamService.stopSubscribing();
    } catch (err) {
      console.warn('[DRONE PORT] Error stopping subscription:', err);
    }
    this.setState('STREAMING_OFF');
  }

  public toggleStreaming(): void {
    if (this.currentState === 'STREAMING_ACTIVE' || this.currentState === 'STARTING') {
      this.stopStreaming();
    } else {
      this.startStreaming();
    }
  }

  public subscribe(fn: StreamStateListener): () => void {
    this.listeners.add(fn);
    fn(this.currentState);
    return () => this.listeners.delete(fn);
  }

  private setState(next: DronePortStreamState) {
    if (this.currentState !== next) {
      this.currentState = next;
      this.notify();
    }
  }

  private notify() {
    this.listeners.forEach((fn) => {
      try {
        fn(this.currentState);
      } catch (e) {
        console.error('[DRONE PORT] Listener error:', e);
      }
    });
  }
}

export const dronePortStreamingService = new DronePortStreamingService();
