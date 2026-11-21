# SKYCON — NETWORK ARCHITECTURE & RESILIENT RECOVERY
## SAE INDIA Autonomous Drone Development Challenge (ADDC 2026)
### Multi-Bearer Communications, Failover Logic, Offline Spooling & Zero-Trust Safety

---

## 1. MULTI-BEARER NETWORK TOPOLOGY

SKYCON employs three distinct, isolated communication bearers to achieve extreme resilience during the SAE INDIA competition:

```
+-----------------------------------------------------------------------------------+
|                                 SKYCON DRONE                                      |
|                                                                                   |
|  +--------------------+   +---------------------+   +--------------------------+  |
|  | MultiLink V1.0 RC  |   | RPi 4 Wi-Fi AP      |   | 4G LTE USB SIM Dongle    |  |
|  | 2.4GHz Direct Link |   | 2.4GHz / 5.8GHz     |   | Cellular Data Connection |  |
|  +---------+----------+   +----------+----------+   +------------+-------------+  |
+------------|-------------------------|---------------------------|----------------+
             |                         |                           |
             | Physical PPM/SBUS       | Low-Latency Local Link    | Outbound REST Push
             | (100% Deterministic)    | (Telemetry & Video)       | (1.0 Hz Polling)
             v                         v                           v
+-----------------------+  +-----------------------+  +--------------------------+
|  PILOT RC TRANSMITTER |  | GROUND CONTROL STATION|  |  PYTHONANYWHERE CLOUD    |
| (Manual Safety Switch)|  | (Local Dashboard)     |  |  (Remote Audit & Scoring)|
+-----------------------+  +-----------------------+  +--------------------------+
```

---

## 2. LINK CHARACTERISTICS & PRIORITIZATION

| Bearer | Interface | Latency | Bandwidth | Authority Level | Primary Function |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **MultiLink RC** | Direct 2.4GHz RF | < 15ms | Low (Channels) | **Highest (Hardware Override)** | Manual flight safety, motor cutoff, mode switch |
| **Local Wi-Fi AP** | 802.11ac (`wlan0`) | < 30ms | High (15-30 Mbps) | **High (Autonomous GCS)** | Live GCS telemetry, mission commands, iPhone stream |
| **4G Cellular** | LTE Modem (`wwan0`)| 80-250ms | Medium (2-10 Mbps) | **Zero (Read-Only Push)** | Remote scoring, telemetry mirror, cloud archival |

---

## 3. FAILOVER & NETWORK RECOVERY MECHANISMS

### 3.1 Local Wi-Fi Disconnection (GCS Signal Drop)
- **Condition**: GCS laptop moves out of range or experiences RF interference.
- **Drone Behavior**:
  1. The Pixhawk and Raspberry Pi 4 **do not pause or abort** flight merely because ground Wi-Fi dropped.
  2. The onboard `mission_engine.py` continues executing the autonomous search pattern locally.
  3. All telemetry and mission events are preserved in local storage (`data/`).
  4. The GCS frontend automatically attempts reconnection using exponential backoff (1s, 2s, 4s, up to 10s).
  5. Upon reconnection, the GCS automatically resynchronizes its state from `/api/missions/active` and `/api/telemetry`.

### 3.2 4G Cellular Link Interruption (Outbound Cloud Push)
- **Condition**: Drone enters a cellular dead zone or SIM throttles.
- **Companion Behavior**:
  1. `cloud_sync.py` detects HTTP dispatch timeout (> 3.0s).
  2. Flag `is_online` transitions to `False`.
  3. Outbound synchronization enters exponential backoff (from 1.0s up to 30.0s) to prevent CPU hogging.
  4. Every generated telemetry and event packet is saved to `data/offline_sync_spool.json` (bounded to 5,000 records).
  5. Flight operations, camera processing, and local GCS communication remain **100% unaffected**.
  6. Upon 4G restoration, the backlog is drained chronologically and deduplicated via SHA-256 hashes.

### 3.3 iPhone Camera Video Stream Disruption
- **Condition**: Safari PWA browser backgrounded or Wi-Fi packet loss.
- **Companion Behavior**:
  1. `stream_capture.py` tracks the elapsed time since the last valid frame (`latest_frame_time`).
  2. If `time.time() - latest_frame_time > 3.0s`, camera state transitions to `STALE`.
  3. If elapsed time exceeds 5.0s, camera state transitions to `DISCONNECTED`.
  4. The mission engine issues an audible and visual warning on the GCS.
  5. If actively searching, the mission engine hovers at the current waypoint (`GUIDED` hold) until video recovers or the operator commands manual fallback.

### 3.4 Complete RF Link Loss (RC Link Loss)
- **Condition**: MultiLink transmitter battery dies or RF blocked.
- **Pixhawk Hardware Failsafe**:
  1. Pixhawk detects loss of SBUS/PPM pulses within 0.5s.
  2. ArduCopter failsafe (`FS_THR_ENABLE = 1`) triggers immediate Return-to-Launch (`RTL`).
  3. Drone climbs to `RTL_ALT` (15m), navigates directly to Home coordinates, and lands autonomously.

---

## 4. ZERO-TRUST CLOUD SAFETY RULES

To maintain compliance with competition safety regulations:
1. **No Inbound Remote Control**: The PythonAnywhere cloud GCS has no network path to initiate inbound connections to the companion Pi.
2. **No Command Routing**: The companion Pi strictly rejects any command originating from cloud sync payloads.
3. **Local Token Enforcement**: All mission execution endpoints (`/api/missions/start`, `/api/drone/arm`) require local authentication tokens and reject external proxies.
