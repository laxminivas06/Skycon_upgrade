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
  private startingTimeout: any = null;

  constructor() {
    this.initStatusListener();
  }

  private initStatusListener() {
    this.unsubStreamStatus = droneCameraStreamService.subscribeStatus((st: DroneCameraStreamStatus) => {
      if (!this.userStreamingRequested) {
        // If user hasn't explicitly clicked Start Streaming, remain OFF
        if (this.currentState !== 'STREAMING_OFF') {
          this.setState('STREAMING_OFF');
        }
        return;
      }

      switch (st) {
        case 'LIVE_FEED_CONNECTED':
          if (this.startingTimeout) clearTimeout(this.startingTimeout);
          this.setState('STREAMING_ACTIVE');
          break;
        case 'CONNECTING':
          this.setState('STARTING');
          break;
        case 'CAMERA_OFFLINE':
        case 'CONNECTION_LOST':
        case 'WAITING_FOR_CAMERA':
          // If user requested streaming but camera is offline or lost
          this.setState('CONNECTION_UNAVAILABLE');
          break;
        default:
          this.setState('CONNECTION_UNAVAILABLE');
          break;
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
