# SKYCON System — Hardware Integration Guide

## 1. System Hardware Specifications

| Component | Model / Part | Connection / Port | Electrical Specs |
| :--- | :--- | :--- | :--- |
| **Flight Controller** | Pixhawk 2.4.8 (ArduCopter 4.x) | TELEM1 Port (DF13 6-Pin) | 3.3V CMOS UART Logic |
| **Companion Computer** | Raspberry Pi 4 Model B | GPIO 14/15 (Pins 8 & 10) | 3.3V GPIO Logic, 5V 3A Power |
| **Power Supply** | Dedicated 5V 3A UBEC | Pi 4 USB-C or GPIO 5V | High-efficiency switching regulator |
| **RC Receiver** | MultiLink V1.0 (2.4 GHz) | Pixhawk RC IN | +5V from RC Rail, SBUS/PPM Signal |
| **GPS / Compass** | Ublox Neo-M8N + Compass | Pixhawk GPS + I2C | 5V / 3.3V I2C Bus |
| **Camera Sensor** | Mounted Smartphone | Local 5GHz Wi-Fi Hotspot | 1080p/720p optical sensor |

---

## 2. Pixhawk 2.4.8 to Raspberry Pi 4 Wiring Pinout

```
  Pixhawk TELEM1 (DF13-6)                      Raspberry Pi 4 Header (40-Pin)
  +----------------------+                     +-----------------------------+
  | Pin 1: +5V Power     | --- DO NOT CONNECT! |                             |
  | Pin 2: TX (Transmit) | ------------------> | GPIO 15 (Pin 10 - RX / UART)|
  | Pin 3: RX (Receive)  | <------------------ | GPIO 14 (Pin 8 - TX / UART) |
  | Pin 4: CTS           | --- NOT CONNECTED   |                             |
  | Pin 5: RTS           | --- NOT CONNECTED   |                             |
  | Pin 6: GND (Ground)  | ------------------- | Pin 6 / Pin 9 / Pin 14 (GND)|
  +----------------------+                     +-----------------------------+
```

### Critical Electrical Safety Warnings
1. **Never Power Raspberry Pi 4 from Pixhawk**: The 5V pin on the Pixhawk TELEM1/TELEM2 ports and servo rail cannot supply the 2.5A–3.0A current demanded by the Raspberry Pi 4 under full CPU/CV load. Drawing excessive current from the Pixhawk causes brownout crashes.
2. **Dedicated UBEC Required**: Power the Raspberry Pi 4 using a dedicated, filtered 5V 3A UBEC wired directly to the main LiPo power distribution board.
3. **Common Ground**: Ensure a reliable ground wire is connected between Pixhawk TELEM1 Pin 6 and Raspberry Pi 4 Pin 6 to maintain reference voltage for UART signals.

---

## 3. MultiLink V1.0 RC Integration & Safety Override

1. **Physical Transmitter Priority**: The competition rules strictly mandate that the ground pilot must be able to regain manual control at any second during autonomous flight.
2. **Wiring**: Connect the MultiLink receiver SBUS/PPM signal pin to the Pixhawk RC IN pin. Connect receiver power to the Pixhawk RC rail (+5V and GND).
3. **ArduPilot Parameter Configuration**:
   - `FS_THR_ENABLE = 1`: Triggers RTL immediately if the MultiLink RC link is lost.
   - `FS_GCS_ENABLE = 0` (or 2): GCS connection loss does not abort mission if pilot is monitoring on RC.
   - `RTL_ALT = 500`: Return-to-launch altitude set to 5.0m (prevents unwanted climbs to 15m in restricted arenas).
