import { MavlinkTransport, TransportStateEvent, TransportType } from '../../types/transport';

export type WebSocketConnectionMode = 'LOCAL' | 'SECURE';
export type WebSocketProtocolMode = 'AUTO' | 'WS' | 'WSS';
export type PiLinkState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'ERROR';
export type PiErrorCategory =
  | 'NONE'
  | 'CONNECTION_REFUSED'
  | 'CONNECTION_TIMEOUT'
  | 'HANDSHAKE_FAILURE'
  | 'WSS_TLS_FAILURE'
  | 'MIXED_CONTENT_BLOCK'
  | 'INVALID_ENDPOINT'
  | 'PI_UNAVAILABLE'
  | 'RELAY_UNAVAILABLE'
  | 'HEARTBEAT_TIMEOUT'
  | 'SERVER_UNAVAILABLE';

export interface PiWebSocketOptions {
  protocolMode?: WebSocketProtocolMode;
  mode?: WebSocketConnectionMode;
  host?: string;
  port?: number;
  path?: string;
  secureEndpoint?: string;
  relayToken?: string;
  protocol?: 'ws' | 'wss';
  baudRate?: number;
}

// Environment defaults
const isLocalhostOrigin = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const companionHost = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : '127.0.0.1';
const isPythonAnywhereHost = typeof window !== 'undefined' && window.location.hostname.includes('pythonanywhere.com');
const defaultLocalWs = isLocalhostOrigin ? `ws://127.0.0.1:8443/ws` : '';

const ENV_PI_WS_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PI_WS_URL) || defaultLocalWs;
const ENV_SECURE_RELAY_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SECURE_RELAY_URL) || '';
const ENV_RELAY_TOKEN = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_RELAY_TOKEN) || 'saeindia_secret_token_2026';

export class PiWebSocketTransport implements MavlinkTransport {
  public readonly id = 'pi_websocket';
  public readonly name = 'Raspberry Pi 4 Companion MAVLink Bridge';
  public readonly type: TransportType = 'PI_WEBSOCKET' as TransportType;

  private dataListeners: Set<(chunk: Uint8Array) => void> = new Set();
  private stateListeners: Set<(event: TransportStateEvent) => void> = new Set();

  private socket: WebSocket | null = null;
  private protocolMode: WebSocketProtocolMode = 'AUTO';
  private connectionMode: WebSocketConnectionMode = isLocalhostOrigin ? 'LOCAL' : 'SECURE';

  private localHost: string = isLocalhostOrigin ? window.location.hostname : '192.168.4.1';
  private localPort: number = 8443;
  private path: string = '/ws';
  private secureEndpoint: string = ENV_SECURE_RELAY_URL;
  private relayToken: string = ENV_RELAY_TOKEN;
  private currentBaudRate: number = 921600;

  private piOnline: boolean = false;
  private linkState: PiLinkState = 'DISCONNECTED';
  private errorCategory: PiErrorCategory = 'NONE';
  private lastErrorMessage: string = '';
  private latencyMs: number = 0;
  private connectStartTime: number = 0;

  private isConnecting: boolean = false;
  private manualDisconnect: boolean = false;
  private reconnectTimer: any = null;
  private pingTimer: any = null;

  constructor() {
    if (typeof window !== 'undefined') {
      const savedMode = localStorage.getItem('pi_conn_mode');
      if (savedMode === 'LOCAL' || savedMode === 'SECURE') {
        this.connectionMode = savedMode;
      }
    }
  }

  public isAvailable(): boolean {
    return typeof window !== 'undefined' && 'WebSocket' in window;
  }

  public isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  public isReady(): boolean {
    return this.isConnected();
  }

  public isPiOnline(): boolean {
    return this.piOnline || this.isConnected();
  }

  // Backwards compatibility aliases
  public isEsp32Online(): boolean {
    return this.isPiOnline();
  }

  public isConnectorOnline(): boolean {
    return this.isPiOnline();
  }

  public getRelayToken(): string {
    return this.relayToken;
  }

  public getProtocolMode(): WebSocketProtocolMode {
    return this.protocolMode;
  }

  public getConnectionMode(): WebSocketConnectionMode {
    return this.connectionMode;
  }

  public getLinkState(): PiLinkState {
    return this.linkState;
  }

  public getErrorCategory(): PiErrorCategory {
    return this.errorCategory;
  }

  public getLastErrorMessage(): string {
    return this.lastErrorMessage;
  }

  public getLatencyMs(): number {
    return this.latencyMs;
  }

  public getResolvedUrl(): string {
    if (typeof window !== 'undefined' && window.location.hostname.includes('pythonanywhere.com')) {
      return ''; // PythonAnywhere cloud hosts WSGI REST API; no WebSocket listener.
    }
    if (this.connectionMode === 'SECURE') {
      return this.secureEndpoint || '';
    }
    const proto = (typeof window !== 'undefined' && window.location.protocol === 'https:') ? 'wss' : 'ws';
    return `${proto}://${this.localHost}:${this.localPort}${this.path}`;
  }

  public async connect(options?: PiWebSocketOptions): Promise<boolean> {
    if (options) {
      if (options.mode) this.connectionMode = options.mode;
      if (options.host) this.localHost = options.host;
      if (options.port) this.localPort = options.port;
      if (options.secureEndpoint) this.secureEndpoint = options.secureEndpoint;
      if (options.baudRate) this.currentBaudRate = options.baudRate;
    }

    this.manualDisconnect = false;
    this.cleanupSocket();

    const targetUrl = this.getResolvedUrl();
    if (!targetUrl || targetUrl.includes('pythonanywhere.com') || targetUrl.includes(':8080')) {
      this.linkState = 'DISCONNECTED';
      this.errorCategory = 'NONE';
      this.lastErrorMessage = 'Operating via PythonAnywhere HTTPS Telemetry API (/api/telemetry).';
      this.notifyState('Ready', 'Cloud Telemetry Active (HTTPS)');
      return false;
    }

    this.linkState = 'CONNECTING';
    this.notifyState('Connecting', `Connecting to Raspberry Pi 4 (${targetUrl})`);

    try {
      this.connectStartTime = performance.now();
      const ws = new WebSocket(targetUrl);
      ws.binaryType = 'arraybuffer';
      this.socket = ws;

      return new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.socket === ws && ws.readyState !== WebSocket.OPEN) {
            ws.close();
            this.linkState = 'ERROR';
            this.errorCategory = 'CONNECTION_TIMEOUT';
            this.lastErrorMessage = 'Connection timed out';
            this.notifyState('Error', 'Connection to Raspberry Pi 4 timed out');
            resolve(false);
          }
        }, 5000);

        ws.onopen = () => {
          clearTimeout(timeout);
          this.latencyMs = Math.round(performance.now() - this.connectStartTime);
          this.linkState = 'CONNECTED';
          this.piOnline = true;
          this.errorCategory = 'NONE';
          this.notifyState('Connected', `Connected to Raspberry Pi 4 (${this.latencyMs}ms)`);
          this.startHeartbeat();
          resolve(true);
        };

        ws.onmessage = (event) => {
          if (event.data instanceof ArrayBuffer) {
            const bytes = new Uint8Array(event.data);
            this.dataListeners.forEach((fn) => fn(bytes));
          } else if (typeof event.data === 'string') {
            try {
              const msg = JSON.parse(event.data);
              if (msg.type === 'PONG') {
                this.latencyMs = Math.round(performance.now() - this.connectStartTime);
              }
            } catch (e) {}
          }
        };

        ws.onerror = (ev) => {
          clearTimeout(timeout);
          this.linkState = 'ERROR';
          this.errorCategory = 'CONNECTION_REFUSED';
          this.lastErrorMessage = 'WebSocket connection failed';
          this.notifyState('Error', 'Unable to connect to Raspberry Pi 4');
          resolve(false);
        };

        ws.onclose = () => {
          clearTimeout(timeout);
          this.piOnline = false;
          if (!this.manualDisconnect) {
            this.scheduleReconnect();
          } else {
            this.linkState = 'DISCONNECTED';
            this.notifyState('Disconnected', 'Disconnected from Raspberry Pi 4');
          }
        };
      });
    } catch (err: any) {
      this.linkState = 'ERROR';
      this.errorCategory = 'INVALID_ENDPOINT';
      this.lastErrorMessage = err?.message || 'Invalid endpoint';
      this.notifyState('Error', this.lastErrorMessage);
      return false;
    }
  }

  public async disconnect(): Promise<void> {
    this.manualDisconnect = true;
    this.cleanupSocket();
    this.linkState = 'DISCONNECTED';
    this.notifyState('Disconnected', 'Disconnected by operator');
  }

  public async send(data: Uint8Array): Promise<boolean> {
    if (!this.isConnected() || !this.socket) {
      return false;
    }
    try {
      this.socket.send(data);
      return true;
    } catch (err) {
      return false;
    }
  }

  public subscribeData(listener: (chunk: Uint8Array) => void): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  public subscribeState(listener: (event: TransportStateEvent) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  public async getDiagnostics(): Promise<Record<string, any>> {
    return {
      id: this.id,
      name: this.name,
      connected: this.isConnected(),
      piOnline: this.piOnline,
      latencyMs: this.latencyMs,
      endpoint: this.getResolvedUrl(),
      baudRate: this.currentBaudRate,
      linkState: this.linkState,
      error: this.lastErrorMessage
    };
  }

  private notifyState(phase: string, message: string) {
    const event: TransportStateEvent = {
      phase,
      message,
      device: {
        deviceName: 'Raspberry Pi 4 Model B',
        productName: 'SKYCON Companion Telemetry Bridge',
        baudRate: this.currentBaudRate
      },
      error: this.lastErrorMessage || undefined
    };
    this.stateListeners.forEach((fn) => fn(event));
  }

  private cleanupSocket() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.socket) {
      try {
        this.socket.onopen = null;
        this.socket.onmessage = null;
        this.socket.onerror = null;
        this.socket.onclose = null;
        this.socket.close();
      } catch (e) {}
      this.socket = null;
    }
  }

  private scheduleReconnect() {
    if (this.manualDisconnect) return;
    this.linkState = 'RECONNECTING';
    this.notifyState('Reconnecting', 'Reconnecting to Raspberry Pi 4...');
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, 2500);
  }

  private startHeartbeat() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (this.isConnected() && this.socket) {
        try {
          this.connectStartTime = performance.now();
          this.socket.send(JSON.stringify({ type: 'PING', timestamp: Date.now() }));
        } catch (e) {}
      }
    }, 5000);
  }
}
