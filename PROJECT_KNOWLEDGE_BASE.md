# SAE India Autonomous Drone Rescue Mission — Knowledge Base & Memory

## Verified Hardware Inventory
1. **S500 Quadcopter Frame & Propulsion**: 2216/2212 motors, 30A ESCs, 1045 propellers.
2. **Pixhawk 2.4.8 Autopilot**: Primary flight controller running ArduCopter firmware.
3. **Raspberry Pi 4 Model B**: Sole companion computer for CV, QR decoding, spatial heatmap, and MAVLink autonomy.
4. **MultiLink V1.0**: 2.4 GHz RC receiver connected to Pixhawk RC IN for manual safety override.
5. **Mounted Smartphone (Onboard)**: Primary camera streaming over local Wi-Fi / WebSocket frame relay.
6. **Laptop / Tablet / Phone**: Primary Ground Control Station (GCS) running responsive React 18 HUD.
7. **Power Subsystem**: 3S/4S LiPo battery, Pixhawk Power Module, and dedicated 5V 3A UBEC for Pi 4 (Never powered from servo rail).

---

## Competition Mission Sequence (24-Step Automation Flow)
1. **System Boot & Link**: Raspberry Pi 4 boots, initializes FastAPI backend & MAVLink multiplexer, connects to local network / 4G dongle.
2. **MAVLink Primary Stream**:
   - Pixhawk TELEM1 (921600 baud) streams MAVLink 2.0 to Raspberry Pi 4 companion (UART0 GPIO 14/15).
3. **GCS Link Up**: Ground Station browser connects via WebSocket (ws://<pi-ip>:8443/ws or wss://<relay>/ws), discovers drone.
4. **Pre-Flight Check**: GPS 3D fix verified (Fix $\ge$ 3, Sats $\ge$ 8, HDOP $\le$ 2.0), EKF healthy, Battery $\ge$ 20%.
5. **Home Reference Lock**: Ground Station locks current GPS as Home reference (`setHomePoint`).
6. **Search Area Configuration**: Operator selects search boundary (Rectangle, Polygon, Circle) and altitude.
7. **Operator Authorization**: Arming & autonomous mission start confirmed by operator.
8. **Flight Mode Transition**: Pixhawk flight mode switches to `GUIDED`.
9. **Motor Arming**: `MAV_CMD_COMPONENT_ARM_DISARM` (cmd 400) executed.
10. **Autonomous Takeoff**: `MAV_CMD_NAV_TAKEOFF` (cmd 22) to configured search altitude.
11. **Climb Level-Off**: Drone climbs; telemetry confirms altitude achieved ($\pm 1.0\text{m}$ margin or vertical speed leveling off).
12. **Outbound Search Navigation**: Generates search pattern (Grid / Spiral / Perimeter) and executes waypoints.
13. **Target Box Visual Acquisition**: Onboard iPhone camera stream captures visual target.
14. **Multi-Frame Verification**: Box detector verifies geometric consistency for $\ge 3$ consecutive frames (`LOCKED`).
15. **Visual Servoing Hold**: Drone centers over target using proportional control ($k_p$).
16. **QR Decoding**: Computer vision pipeline decodes target QR code using Python PyZbar / OpenCV.
17. **Payload Validation**: Decoded string validates against regex `^\d{2}$` (strictly two digits).
18. **P2P Runner Transmission**: Ground Station / Drone companion transmits 2-digit code to Field Runner device socket.
19. **Runner Visual Display**: Runner device displays oversized digits with zero-touch UI.
20. **Runner ACK Handshake**: Runner device automatically responds with cryptographic ACK packet.
21. **ACK Reception & Alert**: Drone confirms ACK received with audible victory tone and haptics.
22. **Autonomous RTL**: Command authority transfers to RTL; Pixhawk initiates `RTL` flight mode.
23. **Home Arrival & Landing**: Drone navigates back to Home position and descends vertically.
24. **Touchdown & Disarm**: Touchdown detected by ground contact; motors safely disarm.

---

## Pixhawk / ArduPilot Essential Parameters
| Parameter | Recommended Value | Description |
| :--- | :--- | :--- |
| `SERIAL1_PROTOCOL` | `2` | MAVLink 2.0 protocol on TELEM1 port (Raspberry Pi 4 Companion) |
| `SERIAL1_BAUD` | `921` | 921600 baud rate on TELEM1 port (or 57600 for standard bench) |
| `RTL_ALT` | `0` or `500` | 0 = Return at current altitude; 500 = 5m return altitude (prevents unwanted climbs to 15m) |
| `RTL_CLIMB_MIN` | `0` | Minimum climb before returning |
| `FS_GCS_ENABLE` | `0` (testing) / `1` | GCS connection loss failsafe behavior |
| `FS_THR_ENABLE` | `1` | Radio Failsafe: Triggers RTL on loss of MultiLink RC signal |
| `PILOT_THR_FILT` | `0` | Controls pilot throttle filtering in assisted flight modes |

---

## Hardware Pinout Reference

### Raspberry Pi 4 Model B ↔ Pixhawk 2.4.8 (TELEM1) [CONFIRMED]
- **Pixhawk TELEM1 Pin 2 (TX)** $\longrightarrow$ **Raspberry Pi 4 GPIO 15 (RX / UART0)**
- **Pixhawk TELEM1 Pin 3 (RX)** $\longrightarrow$ **Raspberry Pi 4 GPIO 14 (TX / UART0)**
- **Pixhawk TELEM1 Pin 6 (GND)** $\longrightarrow$ **Raspberry Pi 4 Pin 6 / 9 / 14 / 20 (GND)**
- *Note: Baud rate 921600 (or 57600), 3.3V logic level. Power via dedicated 5V 3A UBEC.*

### MultiLink V1.0 ↔ Pixhawk 2.4.8 (RC IN) [SAFETY CRITICAL]
- **Receiver Output (SBUS/PPM)** $\longrightarrow$ **Pixhawk RC IN**
- **Receiver +5V** $\longrightarrow$ **Pixhawk RC Rail +5V**
- **Receiver GND** $\longrightarrow$ **Pixhawk RC Rail GND**
- *Mandatory for competition rules: manual physical transmitter safety override.*

### iPhone Onboard Camera Stream
- Mounted rigidly facing nadir (downward) or 45° forward.
- Connected via local Wi-Fi hotspot to Raspberry Pi 4.
- Ingested via low-latency MJPEG/RTSP or direct frame-push socket into `SmartphoneStreamPipeline`.
