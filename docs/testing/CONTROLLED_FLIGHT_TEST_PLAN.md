# SKYCON — CONTROLLED OUTDOOR FLIGHT TEST PLAN & PROCEDURAL CARD
## SAE INDIA Autonomous Drone Development Challenge (ADDC 2026)
### Flight Test Cards, Operational Team Roles, Emergency RC Overrides & Abort Protocols

---

## 1. FLIGHT OBJECTIVES & OPERATIONAL BOUNDARIES

The primary objective of controlled outdoor flight testing is to validate the autonomous flight sequence of the SKYCON system in a strictly controlled outdoor environment under manual safety pilot oversight.

### 1.1 Environmental Flight Limits
| Parameter | Minimum Allowable | Maximum Allowable | Nominal Test Value |
| :--- | :---: | :---: | :---: |
| **Sustained Wind Speed** | 0 m/s | 6.0 m/s (12 kts) | 2.0 – 4.0 m/s |
| **Wind Gusts** | 0 m/s | 8.0 m/s (16 kts) | < 5.0 m/s |
| **Ambient Temperature** | 15°C | 38°C | 25°C – 32°C |
| **Precipitation** | None | 0 mm (Dry only) | Clear / Overcast |
| **Horizontal Visibility** | 1000 m | Unlimited | > 3000 m |
| **GNSS Satellites Visible**| 12 satellites | Unlimited | >= 14 satellites |
| **GNSS HDOP** | - | 1.40 | < 1.10 |

### 1.2 Spatial Arena Boundaries (Geofence Interlocks)
- **Max Flight Altitude**: 15.0 m AGL.
- **Min Flight Altitude**: 3.0 m AGL (takeoff/landing excluded).
- **Horizontal Fence Radius**: 40.0 m from Home point.
- **Return-To-Launch Altitude**: 15.0 m AGL.
- **Geofence Breach Action**: Immediate hardware RTL initiated by Pixhawk.

---

## 2. FLIGHT TEST CREW ROLES & RESPONSIBILITIES

```
+-----------------------------------------------------------------------------------+
|                            FLIGHT TEST CREW STRUCTURE                             |
|                                                                                   |
|    +-----------------------------+         +-------------------------------+      |
|    |   PILOT IN COMMAND (PIC)    |         | GROUND STATION OPERATOR (GSO) |      |
|    | - MultiLink V1.0 in hand    |         | - Telemetry & FSM monitoring  |      |
|    | - Physical switch override  |         | - Geofence & battery alerts   |      |
|    | - Visual line-of-sight      |         | - Mission upload & dispatch   |      |
|    +-----------------------------+         +-------------------------------+      |
|                   ^                                        ^                      |
|                   | Verbal Callouts & Safety Interlocks    |                      |
|                   v                                        v                      |
|    +-----------------------------+         +-------------------------------+      |
|    |       SAFETY MARSHAL        |         |         FIELD RUNNER          |      |
|    | - 360-degree perimeter clear|         | - Mobile Runner device in hand|      |
|    | - Crowd & airspace monitor  |         | - 10-15m from target area     |      |
|    | - Countdown & abort callout |         | - P2P QR ACK verification     |      |
|    +-----------------------------+         +-------------------------------+      |
+-----------------------------------------------------------------------------------+
```

1. **Pilot in Command (PIC)**: Holds the physical MultiLink V1.0 2.4 GHz transmitter with finger on the mode switch (CH5). Maintains continuous Visual Line of Sight (VLOS) with the aircraft. Has absolute authority to abort or override autonomy at any millisecond.
2. **Ground Control Station Operator (GSO)**: Operates the primary GCS interface on tablet/laptop. Monitors EKF3 status, battery voltage, link latency, altitude, and state machine transitions. Calls out critical metrics every 30 seconds.
3. **Safety Marshal (SM)**: Enforces the 20-meter exclusion zone around the takeoff/landing pad. Monitors the test airspace for birds, bystander intrusion, or unauthorized manned aircraft. Can call "ABORT" unconditionally.
4. **Field Runner (FR)**: Stationed at the designated field runner station (~10–15m from the search perimeter). Monitors the mobile runner interface for direct P2P dispatch of the decoded 2-digit rescue code and verifies cryptographic ACK.

---

## 3. MASTER FLIGHT TEST CARD (5-MINUTE COMPETITION PROFILE)

### Card Phase 1: Pre-Flight Assembly & Mechanical Inspection (T - 15 min)
- [ ] Airframe structure, motor arms, fasteners, and landing gear inspected for torque and cracks.
- [ ] Motors checked for smooth bearing rotation and debris.
- [ ] iPhone camera securely mounted in vibration isolation bracket, lens cleaned.
- [ ] MultiLink V1.0 receiver antennas positioned in 90-degree V orientation away from carbon fiber.
- [ ] LiPo battery installed, strapped with dual Velcro straps, balance lead tucked safely.
- [ ] Propellers inspected for nicks, balanced, and fastened with thread-locked nuts.

### Card Phase 2: Avionics Power-Up & Link Establishment (T - 8 min)
- [ ] Turn ON MultiLink V1.0 transmitter; verify battery > 7.4V and throttle at zero.
- [ ] Connect aircraft 4S 5200mAh LiPo. Listen for Pixhawk startup chime (ArduPilot tone).
- [ ] Confirm Raspberry Pi 4 boots cleanly; green ACT LED flashes normally.
- [ ] GSO connects to Raspberry Pi Wi-Fi hotspot (`SKYCON_GCS`).
- [ ] GSO verifies GCS Web UI loads and displays `Pixhawk Connected` at 57600 or 921600 baud.
- [ ] Verify battery voltage $\ge 16.4\text{V}$ (4S fully charged) and current draw $\le 1.2\text{A}$ at idle.
- [ ] Verify GNSS 3D Fix: Satellites $\ge 14$, $\text{HDOP} \le 1.10$.
- [ ] iPhone connects to companion Wi-Fi; Safari loads camera stream PWA; camera feed live on GCS.

### Card Phase 3: Pre-Arm Safety Gate Verification (T - 3 min)
- [ ] Safety Marshal confirms 20m perimeter is clear of all personnel.
- [ ] Field Runner confirms mobile runner app is connected and awaiting code.
- [ ] GSO queries ArduPilot pre-arm checks: `PREARM_CHECK = 1` -> Result: `PASSED`.
- [ ] GSO uploads competition mission plan (Polygon search grid at 10.0m AGL, 3.0 m/s speed).
- [ ] Mission upload confirmed via MAVLink `MISSION_ACK` (0).
- [ ] PIC verifies MultiLink CH5 switch responds on GCS telemetry display.

### Card Phase 4: Controlled Takeoff & Loiter Stability (T - 0 min)
- [ ] PIC calls: "ARMING IN LOITER". PIC holds rudder right to arm.
- [ ] Motors spin at idle. PIC observes motor rotation symmetry.
- [ ] PIC smoothly raises throttle to 50%. Aircraft lifts off to 2.5m AGL.
- [ ] Aircraft holds position in `LOITER` for 30 seconds.
- [ ] GSO confirms: EKF3 healthy, vibration levels $< 15\,\text{m/s}^2$, barometer stable.
- [ ] PIC performs gentle roll/pitch/yaw control checks. Aircraft responds crisply.

### Card Phase 5: Autonomous Mission Engagement & Target Search (T + 1 min)
- [ ] PIC calls: "HANDING OVER TO AUTONOMY - SWITCHING TO GUIDED".
- [ ] PIC flips CH5 switch to `GUIDED` or GSO clicks `ENGAGE AUTO MISSION` in GCS.
- [ ] Aircraft climbs autonomously to target search altitude: 10.0m AGL.
- [ ] Aircraft transitions into lawnmower boustrophedon search grid at 3.0 m/s.
- [ ] GSO monitors waypoint sequencing (WP1 -> WP2 -> WP3 -> WP4).
- [ ] iPhone camera streams 720p 20fps video to companion computer.

### Card Phase 6: Target Box Lock, QR Decode & Runner Handshake (T + 2.5 min)
- [ ] Drone arrives over target area. `BoxDetectionService` identifies white-top cuboid box.
- [ ] `VisualServoing` commands position hold / loiter over box footprint.
- [ ] `QRDetectionEngine` decodes 2-digit rescue code (`42`) across 3 consecutive frames.
- [ ] GCS sounds audible alert: "TARGET BOX LOCKED - CODE 42 DECODED".
- [ ] P2P dispatch sends code `42` to Field Runner mobile station.
- [ ] Field Runner device returns cryptographic ACK within 450ms.
- [ ] GCS displays: "RUNNER ACK RECEIVED — MISSION COMPLETE".

### Card Phase 7: Autonomous Return-to-Launch & Landing (T + 3.5 min)
- [ ] Upon Runner ACK confirmation, mission engine automatically triggers `RTL`.
- [ ] Aircraft climbs/maintains 15.0m AGL RTL altitude and navigates toward Home point.
- [ ] Aircraft reaches Home point, pauses for 3 seconds, then begins controlled descent at 1.0 m/s.
- [ ] At 2.0m AGL, descent rate reduces to 0.4 m/s.
- [ ] Aircraft touches down softly; Pixhawk detects landing and automatically disarms motors within 2 seconds.
- [ ] PIC flips MultiLink CH5 switch to `STABILIZE` and centers throttle.
- [ ] Safety Marshal calls: "ALL CLEAR — AIRFRAME DISARMED".

---

## 4. EMERGENCY PROCEDURES & ABORT PROTOCOLS

> [!WARNING]
> **SAFETY PRINCIPLE**: In any contingency, **PHYSICAL PILOT OVERRIDE TRUMPS COMPANION AUTONOMY INSTANTLY**. The PIC never waits for companion computer software acknowledgment to abort.

### 4.1 Trigger Conditions & Emergency Actions
| Emergency Condition | Primary Indicator | PIC Immediate Action | GSO Immediate Action |
| :--- | :--- | :--- | :--- |
| **Uncontrolled Attitude Divergence** | Roll/Pitch > 30°, rapid drift | Flip CH5 to `LOITER` or `STABILIZE`; take manual stick control. | Announce attitude alert; log telemetry. |
| **Bystander Perimeter Breach** | Visual report by Safety Marshal | Flip CH5 to `LOITER` to stop horizontal translation. | Advise PIC of breach direction. |
| **Critical Low Battery (< 14.0V)** | GCS audible alarm, voltage sag | Flip CH6 to `RTL` or initiate manual landing. | Monitor battery voltage drop rate. |
| **Loss of GPS / EKF3 Divergence**| GPS HDOP > 2.0, "EKF BAD" | Flip CH5 to `ALT_HOLD` (manual throttle & cyclic). Do NOT use Loiter. | Silence audio alarms; guide pilot visually. |
| **Companion Software Freeze / Crash**| GCS telemetry stops updating | Flip CH5 to `LOITER` or `ALT_HOLD`. Fly manually. | Check companion ping; do not reboot in flight. |
| **Complete Control Link Loss** | Pixhawk failsafe triggered | Pixhawk automatically executes hardware `RTL` or `LAND`. | Track telemetry on backup link if available. |

### 4.2 Manual Pilot Override Procedure
1. Move MultiLink V1.0 CH5 flight mode switch from Position 3 (`GUIDED`) to Position 2 (`LOITER`) or Position 1 (`STABILIZE`).
2. Move cyclic sticks to take immediate aerodynamic authority.
3. ArduPilot firmware relinquishes companion computer control within 20 milliseconds.
4. Manually fly aircraft back to the launch pad and land.
