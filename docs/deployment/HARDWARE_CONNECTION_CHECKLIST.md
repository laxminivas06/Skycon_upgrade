# SKYCON — HARDWARE CONNECTION CHECKLIST & PINOUTS
## SAE INDIA Autonomous Drone Development Challenge (ADDC 2026)
### Physical Wiring, Pinout Tables, Power Rail Isolation & Pre-Flight Checks

---

## 1. COMPONENT INTERCONNECTION DIAGRAM

```
+-----------------------------------------------------------------------+
|                         6S / 4S LIPO BATTERY                          |
+------------------------------------+----------------------------------+
                                     |
               +---------------------+---------------------+
               |                                           |
               v                                           v
     +-------------------+                       +-------------------+
     | PIXHAWK PM02/3DR  |                       | 5.1V / 3A UBEC    |
     | POWER MODULE      |                       | (Dedicated RPi)   |
     +---------+---------+                       +---------+---------+
               | 5.3V / Current Sense                      | 5.1V Clean Power
               v                                           v
+-----------------------------+             +-----------------------------+
|       PIXHAWK 2.4.8         |             |    RASPBERRY PI 4 MODEL B   |
|   AUTOPILOT FLIGHT CONTROLLER|             |     COMPANION COMPUTER      |
+--------------+--------------+             +--------------+--------------+
| TELEM2 Port: |                             | 40-Pin GPIO: |
| Pin 1: VCC   | (NOT CONNECTED)             |              |
| Pin 2: TX    +---------------------------->+ Pin 10: RXD  (GPIO 15)     |
| Pin 3: RX    +<----------------------------+ Pin 8:  TXD  (GPIO 14)     |
| Pin 4: CTS   | (Unused)                    |              |
| Pin 5: RTS   | (Unused)                    |              |
| Pin 6: GND   +=============================+ Pin 6:  GND  (Common Ground)|
+--------------+                             +--------------+--------------+
       |                                            |              |
       | RC IN (SBUS/PPM)                           | USB 3.0      | Wi-Fi AP
       v                                            v              v
+--------------+                             +--------------+ +--------------+
| MULTILINK    |                             | 4G LTE USB   | | MOUNTED      |
| V1.0 RC RX   |                             | SIM DONGLE   | | iPHONE 12/13 |
+--------------+                             +--------------+ +--------------+
```

---

## 2. DETAILED PINOUT & WIRING TABLES

### 2.1 Pixhawk TELEM2 to Raspberry Pi 4 GPIO (PL011 UART)

| Pixhawk TELEM2 Pin | Signal | Wire Color | Raspberry Pi 4 Header Pin | BCM GPIO / Function | Electrical Rule |
| :---: | :---: | :---: | :---: | :---: | :--- |
| **Pin 1** | VCC (+5V) | Red | **DO NOT CONNECT** | — | **MANDATORY**: Never back-power RPi from Pixhawk VCC. |
| **Pin 2** | TX (Out) | Orange/Yellow | **Pin 10** | GPIO 15 (RXD0) | Pixhawk 3.3V logic -> RPi 3.3V logic. |
| **Pin 3** | RX (In) | Green/White | **Pin 8** | GPIO 14 (TXD0) | RPi 3.3V logic -> Pixhawk 3.3V logic. |
| **Pin 4** | CTS | — | **DO NOT CONNECT** | — | Hardware flow control disabled. |
| **Pin 5** | RTS | — | **DO NOT CONNECT** | — | Hardware flow control disabled. |
| **Pin 6** | GND | Black | **Pin 6** | Ground | **MANDATORY**: Common reference ground. |

### 2.2 MultiLink V1.0 RC Receiver to Pixhawk 2.4.8

| MultiLink V1.0 Pin | Signal | Wire Color | Pixhawk Port | Pixhawk Pin | Function |
| :---: | :---: | :---: | :---: | :---: | :--- |
| **Signal** | SBUS / PPM | White/Yellow | `RC IN` | Signal Pin (Top) | RC channel frames & override control |
| **VCC** | +5V Rail | Red | `RC IN` | VCC Pin (Middle) | Powered by Pixhawk servo rail (+5V) |
| **GND** | Ground | Black | `RC IN` | GND Pin (Bottom) | Receiver reference ground |

### 2.3 Power Rails & Voltage Tolerances

| Rail | Nominal Voltage | Acceptable Range | Max Ripple | Source | Destination |
| :--- | :---: | :---: | :---: | :--- | :--- |
| **Pixhawk Primary** | 5.30V | 5.10V – 5.40V | < 50mV | PM02 / 3DR Power Module | Pixhawk `POWER` port |
| **Raspberry Pi 4** | 5.10V | 4.95V – 5.25V | < 30mV | Dedicated 5.1V/3A UBEC | RPi 4 USB-C or GPIO Pin 2/4 & 6 |
| **MultiLink RX** | 5.00V | 4.50V – 5.50V | < 100mV | Pixhawk RC rail | MultiLink V1.0 receiver |

---

## 3. CAMERA & SENSOR MOUNTING SPECIFICATIONS

### 3.1 iPhone Mounting
- **Orientation**: Nadir pointing (90° vertical down facing the ground) for geometric perspective calculations.
- **Vibration Dampening**: Silicone / TPU alpha-gel isolation mount to eliminate high-frequency motor vibration (jello effect).
- **Physical Clearance**: Secure clamp avoiding obstruction of camera lenses, LiDAR (if equipped), and thermal dissipation areas.
- **Network Link**: iPhone joins the Raspberry Pi Wi-Fi Access Point (`SSID: SKYCON_DRONE_AP`, `IP: 192.168.4.1`).

### 3.2 4G USB Dongle
- **Port**: Connected to Raspberry Pi 4 USB 3.0 (blue port) or USB 2.0.
- **Antenna Placement**: Minimum 10cm physical separation from Pixhawk GPS/Compass mast and MultiLink RC 2.4GHz antennas to prevent RF desense.

---

## 4. PRE-FLIGHT ELECTRICAL BENCH CHECKLIST

Before powering on the flight battery:

- [ ] **Continuity & Short Circuit**: Measure resistance between 5.1V rail and GND (must be > 1kΩ, no short circuits).
- [ ] **Common Ground**: Measure continuity between Pixhawk GND, RPi 4 GND, and battery negative terminal (< 0.5Ω).
- [ ] **UART Voltage Check**: With Pixhawk powered, measure TELEM2 Pin 2 (TX) to GND (must be ~3.3V).
- [ ] **No Pixhawk VCC to RPi**: Confirm Pin 1 of TELEM2 is physically snipped or depinned.
- [ ] **MultiLink RC Binding**: Power transmitter and verify solid green LED on MultiLink receiver.
- [ ] **Secure Fasteners**: Check all mounting screws, zip ties, and damping balls for structural integrity.
