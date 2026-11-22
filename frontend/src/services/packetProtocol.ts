/**
 * =====================================================================================
 * SKYCON MASTER ARCHITECTURE - COMMUNICATION PROTOCOL (FRONTEND TYPESCRIPT)
 * MODULE: packetProtocol.ts
 * Structured Binary Packet Protocol (SKYCON_PROTOCOL_V1)
 * =====================================================================================
 */

export const MAGIC_BYTES = new Uint8Array([0x53, 0x4b]); // 'SK'
export const PROTOCOL_VERSION = 1;
export const HEADER_SIZE = 30;
export const CRC_SIZE = 2;
export const MIN_PACKET_SIZE = HEADER_SIZE + CRC_SIZE; // 32 bytes

export enum MessageType {
  MISSION_CONFIG = 0x01,
  MISSION_ACK = 0x02,
  BOUNDARY_UPDATE = 0x03,
  MISSION_STATUS = 0x04,
  TELEMETRY_UPDATE = 0x05,
  SEARCH_PROGRESS = 0x06,
  HEATMAP_SUMMARY = 0x07,
  TARGET_UPDATE = 0x08,
  TARGET_ACK = 0x09,
  QR_RESULT = 0x0a,
  COMMUNICATION_STATUS = 0x0b,
  MISSION_COMPLETE = 0x0c,
  MISSION_ERROR = 0x0d
}

export enum PacketPriority {
  NORMAL = 0,
  HIGH = 1
}

export enum PacketFlags {
  NONE = 0x00,
  PRIORITY_HIGH = 0x01,
  REQUIRES_ACK = 0x02,
  IS_ACK = 0x04,
  IS_RETRY = 0x08
}

export const HIGH_PRIORITY_TYPES = new Set<MessageType>([
  MessageType.MISSION_CONFIG,
  MessageType.TARGET_UPDATE,
  MessageType.QR_RESULT,
  MessageType.MISSION_STATUS,
  MessageType.COMMUNICATION_STATUS,
  MessageType.MISSION_COMPLETE,
  MessageType.MISSION_ERROR
]);

/**
 * Standard CCITT-FALSE CRC-16 (Polynomial 0x1021, Initial 0xFFFF).
 * Byte-for-byte identical to Python backend.
 */
export function crc16Ccitt(data: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= (data[i] << 8) & 0xffff;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc;
}

export interface SkyconPacketData {
  msgType: MessageType;
  missionId: string;
  payload: any;
  seqNum?: number;
  flags?: number;
  timestampMs?: number;
  priority?: PacketPriority;
}

export class SkyconPacket {
  public msgType: MessageType;
  public missionId: string;
  public payload: any;
  public seqNum: number;
  public flags: number;
  public timestampMs: number;
  public priority: PacketPriority;
  public rawPayloadBytes: Uint8Array;

  constructor(data: SkyconPacketData) {
    this.msgType = data.msgType;
    this.missionId = (data.missionId || 'SKYCON_DEFAULT').slice(0, 16);
    this.seqNum = (data.seqNum || 0) & 0xffff;
    this.priority =
      data.priority !== undefined
        ? data.priority
        : HIGH_PRIORITY_TYPES.has(this.msgType)
        ? PacketPriority.HIGH
        : PacketPriority.NORMAL;

    let initialFlags = data.flags || PacketFlags.NONE;
    if (this.priority === PacketPriority.HIGH) {
      initialFlags |= PacketFlags.PRIORITY_HIGH;
      if (
        this.msgType !== MessageType.MISSION_ACK &&
        this.msgType !== MessageType.TARGET_ACK
      ) {
        initialFlags |= PacketFlags.REQUIRES_ACK;
      }
    }
    this.flags = initialFlags;
    this.timestampMs = data.timestampMs || Date.now() >>> 0;

    // Serialize payload
    if (data.payload instanceof Uint8Array) {
      this.rawPayloadBytes = data.payload;
      this.payload = data.payload;
    } else if (typeof data.payload === 'string') {
      this.rawPayloadBytes = new TextEncoder().encode(data.payload);
      this.payload = data.payload;
    } else {
      const jsonStr = JSON.stringify(data.payload || {});
      this.rawPayloadBytes = new TextEncoder().encode(jsonStr);
      this.payload = data.payload;
    }
  }

  public requiresAck(): boolean {
    return Boolean(this.flags & PacketFlags.REQUIRES_ACK);
  }

  public isAck(): boolean {
    return Boolean(this.flags & PacketFlags.IS_ACK);
  }

  public pack(): Uint8Array {
    const payloadLen = this.rawPayloadBytes.length;
    if (payloadLen > 4096) {
      throw new Error(`Payload length ${payloadLen} exceeds 4096 bytes`);
    }

    const totalLen = HEADER_SIZE + payloadLen + CRC_SIZE;
    const buffer = new Uint8Array(totalLen);
    const view = new DataView(buffer.buffer);

    // 0..1: Magic (0x53, 0x4B)
    buffer[0] = 0x53;
    buffer[1] = 0x4b;

    // 2: Protocol Version
    buffer[2] = PROTOCOL_VERSION;

    // 3: Message Type
    buffer[3] = this.msgType;

    // 4..5: Flags
    view.setUint16(4, this.flags, false);

    // 6..7: Sequence Number
    view.setUint16(6, this.seqNum, false);

    // 8..11: Timestamp (ms)
    view.setUint32(8, this.timestampMs, false);

    // 12..27: Mission ID (16 bytes, ASCII null-padded)
    const missionBytes = new TextEncoder().encode(this.missionId);
    for (let i = 0; i < 16; i++) {
      buffer[12 + i] = i < missionBytes.length ? missionBytes[i] : 0;
    }

    // 28..29: Payload Length
    view.setUint16(28, payloadLen, false);

    // 30..(30+N-1): Payload
    buffer.set(this.rawPayloadBytes, HEADER_SIZE);

    // CRC16 over Header + Payload
    const bodyToChecksum = buffer.subarray(0, HEADER_SIZE + payloadLen);
    const crc = crc16Ccitt(bodyToChecksum);

    // (30+N)..(30+N+1): CRC-16
    view.setUint16(HEADER_SIZE + payloadLen, crc, false);

    return buffer;
  }

  public static unpack(buffer: Uint8Array): {
    packet: SkyconPacket | null;
    error: string | null;
  } {
    if (buffer.length < MIN_PACKET_SIZE) {
      return {
        packet: null,
        error: `Buffer too short (${buffer.length} < ${MIN_PACKET_SIZE})`
      };
    }

    if (buffer[0] !== 0x53 || buffer[1] !== 0x4b) {
      return { packet: null, error: 'Invalid magic header' };
    }

    const view = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength
    );

    // Verify CRC
    const expectedCrc = view.getUint16(buffer.length - 2, false);
    const computedCrc = crc16Ccitt(buffer.subarray(0, buffer.length - 2));
    if (expectedCrc !== computedCrc) {
      return {
        packet: null,
        error: `CRC mismatch: expected ${expectedCrc}, computed ${computedCrc}`
      };
    }

    const version = buffer[2];
    if (version !== PROTOCOL_VERSION) {
      return { packet: null, error: `Unsupported protocol version ${version}` };
    }

    const msgType = buffer[3] as MessageType;
    const flags = view.getUint16(4, false);
    const seqNum = view.getUint16(6, false);
    const timestampMs = view.getUint32(8, false);

    const missionBytes = buffer.subarray(12, 28);
    const missionId = new TextDecoder()
      .decode(missionBytes)
      .replace(/\0/g, '')
      .trim();
    const payloadLen = view.getUint16(28, false);

    if (buffer.length !== HEADER_SIZE + payloadLen + CRC_SIZE) {
      return { packet: null, error: 'Packet payload length mismatch' };
    }

    const payloadBytes = buffer.subarray(
      HEADER_SIZE,
      HEADER_SIZE + payloadLen
    );
    let parsedPayload: any = payloadBytes;
    try {
      const text = new TextDecoder().decode(payloadBytes);
      parsedPayload = JSON.parse(text);
    } catch {
      // Keep as raw or text
    }

    const packet = new SkyconPacket({
      msgType,
      missionId,
      payload: parsedPayload,
      seqNum,
      flags,
      timestampMs
    });

    return { packet, error: null };
  }

  public createAck(ackSeqNum: number): SkyconPacket {
    const ackType =
      this.msgType === MessageType.TARGET_UPDATE
        ? MessageType.TARGET_ACK
        : MessageType.MISSION_ACK;
    const ackPayload = {
      acked_seq: this.seqNum,
      acked_type: MessageType[this.msgType] || this.msgType,
      received_at: Date.now()
    };

    return new SkyconPacket({
      msgType: ackType,
      missionId: this.missionId,
      payload: ackPayload,
      seqNum: ackSeqNum,
      flags: PacketFlags.IS_ACK | PacketFlags.PRIORITY_HIGH,
      priority: PacketPriority.HIGH
    });
  }
}
