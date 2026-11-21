/**
 * =====================================================================================
 * SKYCON MASTER ARCHITECTURE - FRONTEND SPATIAL INTELLIGENCE & RECON SERVICE
 * MODULE: spatialIntelligenceService.ts
 * Manages Real-Time Spatial Heatmap, Stage A/B Recon & Link Diagnostics
 * =====================================================================================
 */

import { fetchWithFallback } from './apiClient';
import { SkyconPacket, MessageType } from './packetProtocol';

export interface SpatialCellData {
  cell_id: string;
  row: number;
  col: number;
  latitude: number;
  longitude: number;
  coverage_status: 'UNEXPLORED' | 'EXPLORED';
  target_status: 'NONE' | 'DETECTED' | 'CANDIDATE' | 'VERIFIED' | 'QR_CONFIRMED';
  detection_score: number;
  confidence_score: number;
  observation_count: number;
  detection_category?: string;
  associated_target_id?: string;
  two_digit_code?: string;
}

export interface SpatialMetrics {
  total_cells: number;
  explored_cells: number;
  unexplored_cells: number;
  coverage_pct: number;
}

export interface CandidateTarget {
  id: string;
  target_id?: string;
  lat: number;
  lon: number;
  conf: number;
  status: string;
  code?: string;
  two_digit_code?: string;
  category?: string;
  observation_count?: number;
}

export interface SpatialIntelPayload {
  mission_id: string;
  boundary_type: string;
  boundary_center: [number, number];
  boundary_radius_m: number;
  boundary_polygon?: [number, number][];
  cell_size_m: number;
  metrics: SpatialMetrics;
  active_cells_count: number;
  cells: SpatialCellData[];
  targets: CandidateTarget[];
}

export interface ReconStageStatus {
  mission_id: string;
  stage: 'IDLE' | 'STAGE_A_COVERAGE' | 'STAGE_A_COMPLETED' | 'STAGE_B_INVESTIGATION' | 'MISSION_SUCCESS_RTL' | 'TIME_EXHAUSTED_RTL' | 'ABORTED';
  status_message: string;
  home_coords: { lat: number; lon: number };
  progress: {
    coverage_pct: number;
    elapsed_time_s: number;
    remaining_time_s: number;
    active_waypoint: number;
    total_waypoints: number;
  };
  candidates_count: number;
  verified_qr_code: string | null;
  verified_qr_payload: string | null;
  timestamp: number;
}

export interface CommunicationDiagnosticsData {
  health_status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'OFFLINE';
  esp32_connected: boolean;
  wifi_connected: boolean;
  wifi_ssid: string;
  rssi_dbm: number;
  packets_transmitted: number;
  packets_received: number;
  packets_lost: number;
  retries_count: number;
  acks_received: number;
  avg_latency_ms: number;
  ema_latency_ms: number;
  packet_loss_rate: number;
  last_rx_age_ms: number;
  queue_size?: number;
  timestamp: number;
}

type SpatialListener = (data: SpatialIntelPayload) => void;
type ReconStageListener = (status: ReconStageStatus) => void;
type CommDiagListener = (diag: CommunicationDiagnosticsData) => void;

class SpatialIntelligenceService {
  private spatialData: SpatialIntelPayload = {
    mission_id: 'SKYCON_001',
    boundary_type: 'NONE',
    boundary_center: [13.0827, 80.2707],
    boundary_radius_m: 25.0,
    cell_size_m: 2.0,
    metrics: { total_cells: 0, explored_cells: 0, unexplored_cells: 0, coverage_pct: 0.0 },
    active_cells_count: 0,
    cells: [],
    targets: []
  };

  private stageStatus: ReconStageStatus = {
    mission_id: 'SKYCON_001',
    stage: 'IDLE',
    status_message: 'Standby for mission configuration',
    home_coords: { lat: 13.0827, lon: 80.2707 },
    progress: { coverage_pct: 0.0, elapsed_time_s: 0, remaining_time_s: 300, active_waypoint: 0, total_waypoints: 0 },
    candidates_count: 0,
    verified_qr_code: null,
    verified_qr_payload: null,
    timestamp: Date.now()
  };

  private commDiagnostics: CommunicationDiagnosticsData = {
    health_status: 'HEALTHY',
    esp32_connected: false,
    wifi_connected: true,
    wifi_ssid: 'drone123',
    rssi_dbm: -64,
    packets_transmitted: 0,
    packets_received: 0,
    packets_lost: 0,
    retries_count: 0,
    acks_received: 0,
    avg_latency_ms: 32.5,
    ema_latency_ms: 31.0,
    packet_loss_rate: 0.0,
    last_rx_age_ms: 0,
    queue_size: 0,
    timestamp: Date.now()
  };

  private spatialListeners: Set<SpatialListener> = new Set();
  private stageListeners: Set<ReconStageListener> = new Set();
  private commListeners: Set<CommDiagListener> = new Set();

  private pollInterval: any = null;

  constructor() {
    this.startPolling();
    this.initSocketListener();
  }

  public subscribeSpatial(listener: SpatialListener): () => void {
    this.spatialListeners.add(listener);
    listener(this.spatialData);
    return () => this.spatialListeners.delete(listener);
  }

  public subscribeStage(listener: ReconStageListener): () => void {
    this.stageListeners.add(listener);
    listener(this.stageStatus);
    return () => this.stageListeners.delete(listener);
  }

  public subscribeDiagnostics(listener: CommDiagListener): () => void {
    this.commListeners.add(listener);
    listener(this.commDiagnostics);
    return () => this.commListeners.delete(listener);
  }

  public getSpatialData(): SpatialIntelPayload {
    return this.spatialData;
  }

  public getStageStatus(): ReconStageStatus {
    return this.stageStatus;
  }

  public getDiagnostics(): CommunicationDiagnosticsData {
    return this.commDiagnostics;
  }

  public async configureMission(config: {
    missionId: string;
    homeLat: number;
    homeLon: number;
    boundaryType: 'CIRCLE' | 'POLYGON';
    boundaryRadius?: number;
    polygonVertices?: [number, number][];
    altitude?: number;
    speed?: number;
  }) {
    try {
      const res = await fetchWithFallback('/api/recon/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (data.success) {
        await this.fetchStatus();
        await this.fetchHeatmap();
      }
      return data;
    } catch (err: any) {
      console.error('[SPATIAL SERVICE] Configure mission error:', err.message);
      throw err;
    }
  }

  public async startStageA() {
    try {
      const res = await fetchWithFallback('/api/recon/stage-a/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success) {
        this.stageStatus.stage = 'STAGE_A_COVERAGE';
        this.notifyStage();
      }
      return data;
    } catch (err: any) {
      console.error('[SPATIAL SERVICE] Start Stage A error:', err.message);
      throw err;
    }
  }

  public async startStageB() {
    try {
      const res = await fetchWithFallback('/api/recon/stage-b/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success) {
        this.stageStatus.stage = 'STAGE_B_INVESTIGATION';
        this.notifyStage();
      }
      return data;
    } catch (err: any) {
      console.error('[SPATIAL SERVICE] Start Stage B error:', err.message);
      throw err;
    }
  }

  private async fetchStatus() {
    try {
      const res = await fetchWithFallback('/api/recon/status', { method: 'GET' });
      const data = await res.json();
      if (data.success && data.status) {
        this.stageStatus = { ...this.stageStatus, ...data.status };
        this.notifyStage();
      }
    } catch {}
  }

  private async fetchHeatmap() {
    try {
      const res = await fetchWithFallback('/api/spatial/heatmap', { method: 'GET' });
      const data = await res.json();
      if (data.success && data.spatial) {
        this.spatialData = data.spatial;
        this.notifySpatial();
      }
    } catch {}
  }

  private async fetchDiagnostics() {
    try {
      const res = await fetchWithFallback('/api/comm/diagnostics', { method: 'GET' });
      const data = await res.json();
      if (data.success && data.diagnostics) {
        this.commDiagnostics = { ...this.commDiagnostics, ...data.diagnostics };
        this.notifyDiagnostics();
      }
    } catch {}
  }

  private startPolling() {
    if (typeof window === 'undefined') return;
    this.pollInterval = setInterval(() => {
      this.fetchStatus();
      this.fetchDiagnostics();
    }, 2000);
  }

  private initSocketListener() {
    if (typeof window === 'undefined') return;

    window.addEventListener('message', (event) => {
      try {
        if (event.data instanceof ArrayBuffer || event.data instanceof Uint8Array) {
          const raw = new Uint8Array(event.data);
          if (raw.length >= 32 && raw[0] === 0x53 && raw[1] === 0x4b) {
            const { packet } = SkyconPacket.unpack(raw);
            if (packet) {
              this.handleInboundSkyconPacket(packet);
            }
          }
        }
      } catch {}
    });
  }

  private handleInboundSkyconPacket(packet: SkyconPacket) {
    if (packet.msgType === MessageType.HEATMAP_SUMMARY) {
      const payload = packet.payload;
      if (payload && payload.coverage_pct !== undefined) {
        this.spatialData.metrics.coverage_pct = payload.coverage_pct;
        if (payload.candidates) {
          this.spatialData.targets = payload.candidates;
        }
        this.notifySpatial();
      }
    } else if (packet.msgType === MessageType.MISSION_STATUS) {
      if (packet.payload?.state) {
        this.stageStatus.stage = packet.payload.state;
        this.notifyStage();
      }
    } else if (packet.msgType === MessageType.QR_RESULT) {
      if (packet.payload?.code) {
        this.stageStatus.verified_qr_code = packet.payload.code;
        this.notifyStage();
      }
    } else if (packet.msgType === MessageType.COMMUNICATION_STATUS) {
      if (packet.payload) {
        this.commDiagnostics = { ...this.commDiagnostics, ...packet.payload };
        this.notifyDiagnostics();
      }
    }
  }

  private notifySpatial() {
    this.spatialListeners.forEach(cb => {
      try { cb(this.spatialData); } catch {}
    });
  }

  private notifyStage() {
    this.stageListeners.forEach(cb => {
      try { cb(this.stageStatus); } catch {}
    });
  }

  private notifyDiagnostics() {
    this.commListeners.forEach(cb => {
      try { cb(this.commDiagnostics); } catch {}
    });
  }
}

export const spatialIntelligenceService = new SpatialIntelligenceService();
